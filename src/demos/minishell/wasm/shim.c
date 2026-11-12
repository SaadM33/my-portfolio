/*
 * shim.c - the tiny "libc + kernel boundary" that lets the unmodified
 * minishell sources run in WebAssembly without a libc.
 *
 *  - malloc/free: a size-class free-list allocator on linear memory
 *  - string/printf helpers the sources (and clang) call
 *  - every syscall (open/close/dup2/execve/chdir/...) is forwarded to JS,
 *    which owns the simulated file system, fd table and processes.
 *  - exit()/ft_exit() call into JS, which throws to unwind (like a process
 *    ending). fork() is NOT emulated here: JS simulates processes around the
 *    real exec_child()/exec_single_builtin() functions.
 */
#include <stddef.h>
#include <stdarg.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <signal.h>
#include <sys/wait.h>
#include <sys/stat.h>
#include <readline/readline.h>
#include <readline/history.h>

#define IMPORT(n) __attribute__((import_module("env"), import_name(n)))

IMPORT("js_write") long js_write(int fd, const void *buf, size_t n);
IMPORT("js_open") int js_open(const char *p, int flags);
IMPORT("js_close") int js_close(int fd);
IMPORT("js_dup") int js_dup(int fd);
IMPORT("js_dup2") int js_dup2(int a, int b);
IMPORT("js_access") int js_access(const char *p, int mode);
IMPORT("js_stat") int js_stat(const char *p, struct stat *sb);
IMPORT("js_getcwd") int js_getcwd(char *buf, size_t size);
IMPORT("js_chdir") int js_chdir(const char *p);
IMPORT("js_execve") int js_execve(const char *p, char *const argv[],
	char *const envp[]);
IMPORT("js_exit") void js_exit(int code) __attribute__((noreturn));
IMPORT("js_readline") char *js_readline(const char *prompt);

int	errno;

/* ---------------- allocator ---------------- */
extern unsigned char __heap_base;
static unsigned char *g_brk;
static unsigned char *g_end;
static void *g_free[32];

static int	size_class(size_t n)
{
	int	c;

	c = 4;
	while (((size_t)1 << c) < n + 8)
		c++;
	return (c);
}

static void	*bump(size_t n)
{
	unsigned char	*p;
	size_t			pages;

	if (!g_brk)
	{
		g_brk = (unsigned char *)(((size_t)&__heap_base + 15) & ~(size_t)15);
		g_end = (unsigned char *)(__builtin_wasm_memory_size(0) * 65536);
	}
	while (g_brk + n > g_end)
	{
		pages = (n + 65535) / 65536;
		if (__builtin_wasm_memory_grow(0, pages) == (size_t)-1)
			return (NULL);
		g_end += pages * 65536;
	}
	p = g_brk;
	g_brk += n;
	return (p);
}

void	*malloc(size_t n)
{
	int				c;
	unsigned char	*p;

	c = size_class(n);
	if (c > 30)
		return (NULL);
	if (g_free[c])
	{
		p = g_free[c];
		g_free[c] = *(void **)p;
	}
	else
	{
		p = bump((size_t)1 << c);
		if (!p)
			return (NULL);
		*(int *)p = c;
		p += 8;
	}
	return (p);
}

void	free(void *ptr)
{
	unsigned char	*p;
	int				c;

	if (!ptr)
		return ;
	p = (unsigned char *)ptr;
	c = *(int *)(p - 8);
	*(void **)p = g_free[c];
	g_free[c] = p;
}

/* ---------------- memory / strings ---------------- */
void	*memcpy(void *d, const void *s, size_t n)
{
	unsigned char		*a;
	const unsigned char	*b;

	a = d;
	b = s;
	while (n--)
		*a++ = *b++;
	return (d);
}

void	*memmove(void *d, const void *s, size_t n)
{
	unsigned char		*a;
	const unsigned char	*b;

	a = d;
	b = s;
	if (a < b)
		while (n--)
			*a++ = *b++;
	else
		while (n--)
			a[n] = b[n];
	return (d);
}

void	*memset(void *d, int c, size_t n)
{
	unsigned char	*a;

	a = d;
	while (n--)
		*a++ = (unsigned char)c;
	return (d);
}

static size_t	slen(const char *s)
{
	size_t	n;

	n = 0;
	while (s[n])
		n++;
	return (n);
}

char	*strerror(int e)
{
	if (e == ENOENT)
		return ("No such file or directory");
	if (e == EACCES)
		return ("Permission denied");
	if (e == ENOTDIR)
		return ("Not a directory");
	if (e == EISDIR)
		return ("Is a directory");
	if (e == ENOEXEC)
		return ("Exec format error");
	return ("Unknown error");
}

void	perror(const char *s)
{
	const char	*m;

	m = strerror(errno);
	if (s && *s)
	{
		js_write(2, s, slen(s));
		js_write(2, ": ", 2);
	}
	js_write(2, m, slen(m));
	js_write(2, "\n", 1);
}

/* printf: only %s %d %i %c %% are used by the sources */
int	printf(const char *fmt, ...)
{
	va_list		ap;
	char		num[16];
	const char	*s;
	int			v;
	int			i;
	int			total;
	unsigned	u;

	va_start(ap, fmt);
	total = 0;
	while (*fmt)
	{
		if (*fmt != '%')
		{
			s = fmt;
			while (*fmt && *fmt != '%')
				fmt++;
			total += js_write(1, s, fmt - s);
			continue ;
		}
		fmt++;
		if (*fmt == 's')
		{
			s = va_arg(ap, const char *);
			if (!s)
				s = "(null)";
			total += js_write(1, s, slen(s));
		}
		else if (*fmt == 'd' || *fmt == 'i')
		{
			v = va_arg(ap, int);
			i = 15;
			num[i] = 0;
			u = v < 0 ? -(unsigned)v : (unsigned)v;
			do
				num[--i] = '0' + u % 10;
			while (u /= 10);
			if (v < 0)
				num[--i] = '-';
			total += js_write(1, num + i, 15 - i);
		}
		else if (*fmt == 'c')
		{
			num[0] = (char)va_arg(ap, int);
			total += js_write(1, num, 1);
		}
		else if (*fmt == '%')
			total += js_write(1, "%", 1);
		if (*fmt)
			fmt++;
	}
	va_end(ap);
	return (total);
}

/* ---------------- syscalls -> JS ---------------- */
static int	ret_errno(int r)
{
	if (r < 0)
	{
		errno = -r;
		return (-1);
	}
	return (r);
}

long	write(int fd, const void *buf, size_t n)
{
	return (js_write(fd, buf, n));
}

long	read(int fd, void *buf, size_t n)
{
	(void)fd;
	(void)buf;
	(void)n;
	return (0);
}

int	open(const char *p, int flags, ...)
{
	return (ret_errno(js_open(p, flags)));
}

int	close(int fd)
{
	return (ret_errno(js_close(fd)));
}

int	dup(int fd)
{
	return (ret_errno(js_dup(fd)));
}

int	dup2(int a, int b)
{
	return (ret_errno(js_dup2(a, b)));
}

int	access(const char *p, int mode)
{
	return (ret_errno(js_access(p, mode)));
}

int	stat(const char *p, struct stat *sb)
{
	return (ret_errno(js_stat(p, sb)));
}

char	*getcwd(char *buf, size_t size)
{
	if (js_getcwd(buf, size) < 0)
		return (NULL);
	return (buf);
}

int	chdir(const char *p)
{
	return (ret_errno(js_chdir(p)));
}

int	execve(const char *p, char *const argv[], char *const envp[])
{
	return (ret_errno(js_execve(p, argv, envp)));
}

int	unlink(const char *p)
{
	(void)p;
	return (0);
}

void	exit(int code)
{
	js_exit(code & 0xff);
}

/* ft_exit (main.c's version frees the whole ft_malloc list; in a simulated
 * child that would free the parent's memory, so processes end via JS) */
void	ft_exit(int code)
{
	js_exit(code & 0xff);
}

/* process primitives are simulated in JS around exec_child(); the C
 * versions are only referenced by the unused full_execution(). */
int	pipe(int fds[2])
{
	(void)fds;
	errno = EACCES;
	return (-1);
}

pid_t	fork(void)
{
	return (-1);
}

pid_t	waitpid(pid_t p, int *st, int opt)
{
	(void)p;
	(void)st;
	(void)opt;
	return (-1);
}

pid_t	wait(int *st)
{
	(void)st;
	return (-1);
}

sighandler_t	signal(int sig, sighandler_t h)
{
	(void)sig;
	return (h);
}

/* ---------------- readline -> JS ---------------- */
char	*readline(const char *prompt)
{
	return (js_readline(prompt));
}

void	add_history(const char *s)
{
	(void)s;
}

void	rl_replace_line(const char *s, int clear_undo)
{
	(void)s;
	(void)clear_undo;
}

int	rl_on_new_line(void)
{
	return (0);
}

void	rl_redisplay(void)
{
}

/* compiler-rt helper: 128-bit multiply (ft_exit.c parses into __int128_t) */
typedef unsigned long long	t_u64;

__int128	__multi3(__int128 a, __int128 b)
{
	unsigned __int128	ua;
	unsigned __int128	ub;
	t_u64				p[4];
	t_u64				mid;
	t_u64				hi;

	ua = (unsigned __int128)a;
	ub = (unsigned __int128)b;
	p[0] = ((t_u64)ua & 0xffffffffu) * ((t_u64)ub & 0xffffffffu);
	p[1] = ((t_u64)ua & 0xffffffffu) * ((t_u64)ub >> 32);
	p[2] = ((t_u64)ua >> 32) * ((t_u64)ub & 0xffffffffu);
	p[3] = ((t_u64)ua >> 32) * ((t_u64)ub >> 32);
	mid = (p[0] >> 32) + (p[1] & 0xffffffffu) + (p[2] & 0xffffffffu);
	hi = p[3] + (p[1] >> 32) + (p[2] >> 32) + (mid >> 32);
	hi += (t_u64)ua * (t_u64)(ub >> 64) + (t_u64)(ua >> 64) * (t_u64)ub;
	return ((__int128)(((unsigned __int128)hi << 64)
		| ((p[0] & 0xffffffffu) | (mid << 32))));
}
