/*
 * libc_shim.c -- the handful of libc calls cub3D makes, for wasm32 without a libc.
 *
 *   malloc/free  -> bump allocator over linear memory (free is a no-op; the
 *                   whole instance is thrown away when the "process" exits)
 *   open/read    -> one in-memory file: the .cub text the page hands over
 *   write        -> forwarded to JS (stdout / stderr console on the page)
 *   exit         -> JS import that throws, unwinding the wasm stack
 *   gettimeofday -> performance.now()
 */
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/time.h>

WASM_IMPORT("js_write") void	js_write(int fd, const void *buf, size_t n);
WASM_IMPORT("js_exit") _Noreturn void	js_exit(int status);
WASM_IMPORT("js_now_ms") double	js_now_ms(void);

extern unsigned char	__heap_base;
static size_t			g_brk = 0;

void	*malloc(size_t size)
{
	size_t	start;
	size_t	end;
	size_t	have;

	if (!g_brk)
		g_brk = (size_t)&__heap_base;
	start = (g_brk + 15) & ~(size_t)15;
	end = start + size;
	have = __builtin_wasm_memory_size(0) * 65536;
	if (end > have)
	{
		if (__builtin_wasm_memory_grow(0, (end - have + 65535) / 65536)
			== (size_t)-1)
			return (NULL);
	}
	g_brk = end;
	return ((void *)start);
}

void	free(void *ptr)
{
	(void)ptr;
}

void	*memcpy(void *d, const void *s, size_t n)
{
	unsigned char		*dp;
	const unsigned char	*sp;

	dp = d;
	sp = s;
	while (n--)
		*dp++ = *sp++;
	return (d);
}

void	*memmove(void *d, const void *s, size_t n)
{
	unsigned char		*dp;
	const unsigned char	*sp;

	dp = d;
	sp = s;
	if (dp < sp)
		return (memcpy(d, s, n));
	while (n--)
		dp[n] = sp[n];
	return (d);
}

void	*memset(void *d, int c, size_t n)
{
	unsigned char	*dp;

	dp = d;
	while (n--)
		*dp++ = (unsigned char)c;
	return (d);
}

/* ---- one virtual file ---- */
static char		*g_fname;
static char		*g_fdata;
static size_t	g_flen;
static size_t	g_fpos;
static int		g_fopen;

/* called from JS before main(): name and bytes of the .cub "on disk" */
__attribute__((export_name("shim_set_file")))
void	shim_set_file(char *name, char *data, int len)
{
	g_fname = name;
	g_fdata = data;
	g_flen = (size_t)len;
}

__attribute__((export_name("shim_alloc")))
void	*shim_alloc(int n)
{
	return (malloc((size_t)n));
}

static int	streq(const char *a, const char *b)
{
	while (*a && *a == *b)
	{
		a++;
		b++;
	}
	return (*a == *b);
}

int	open(const char *path, int flags, ...)
{
	(void)flags;
	if (!g_fname || !path || !streq(path, g_fname))
		return (-1);
	g_fpos = 0;
	g_fopen = 1;
	return (3);
}

ssize_t	read(int fd, void *buf, size_t n)
{
	size_t	left;

	if (fd != 3 || !g_fopen)
		return (-1);
	left = g_flen - g_fpos;
	if (n > left)
		n = left;
	memcpy(buf, g_fdata + g_fpos, n);
	g_fpos += n;
	return ((ssize_t)n);
}

int	close(int fd)
{
	if (fd == 3 && g_fopen)
	{
		g_fopen = 0;
		return (0);
	}
	return (-1);
}

ssize_t	write(int fd, const void *buf, size_t n)
{
	js_write(fd, buf, n);
	return ((ssize_t)n);
}

void	perror(const char *s)
{
	size_t	l;

	l = 0;
	while (s && s[l])
		l++;
	if (l)
	{
		write(2, s, l);
		write(2, ": ", 2);
	}
	write(2, "Cannot allocate memory\n", 23);
}

_Noreturn void	exit(int status)
{
	js_exit(status);
}

int	gettimeofday(struct timeval *tv, void *tz)
{
	double	ms;

	(void)tz;
	ms = js_now_ms();
	tv->tv_sec = (long)(ms / 1000.0);
	tv->tv_usec = (long)((ms - tv->tv_sec * 1000.0) * 1000.0);
	return (0);
}
