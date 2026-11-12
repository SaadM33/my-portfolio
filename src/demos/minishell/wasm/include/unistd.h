#ifndef STUB_UNISTD_H
# define STUB_UNISTD_H
# include <stddef.h>
# include <sys/types.h>
# define F_OK 0
# define X_OK 1
# define W_OK 2
# define R_OK 4
long	write(int fd, const void *buf, size_t n);
long	read(int fd, void *buf, size_t n);
int		close(int fd);
int		dup(int fd);
int		dup2(int a, int b);
int		pipe(int fds[2]);
pid_t	fork(void);
int		execve(const char *p, char *const argv[], char *const envp[]);
int		access(const char *p, int mode);
char	*getcwd(char *buf, size_t size);
int		chdir(const char *p);
int		unlink(const char *p);
#endif
