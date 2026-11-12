#ifndef STUB_SIGNAL_H
# define STUB_SIGNAL_H
typedef void (*sighandler_t)(int);
# define SIGINT 2
# define SIGQUIT 3
# define SIG_DFL ((sighandler_t)0)
# define SIG_IGN ((sighandler_t)1)
sighandler_t	signal(int sig, sighandler_t h);
#endif
