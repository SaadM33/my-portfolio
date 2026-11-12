#ifndef STUB_SYS_WAIT_H
# define STUB_SYS_WAIT_H
# include <sys/types.h>
# define WEXITSTATUS(s) (((s) & 0xff00) >> 8)
# define WTERMSIG(s) ((s) & 0x7f)
# define WIFEXITED(s) (WTERMSIG(s) == 0)
# define WIFSIGNALED(s) (((signed char)(((s) & 0x7f) + 1) >> 1) > 0)
pid_t	waitpid(pid_t p, int *st, int opt);
pid_t	wait(int *st);
#endif
