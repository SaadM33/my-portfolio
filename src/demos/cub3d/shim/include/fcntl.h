#ifndef _SHIM_FCNTL_H
# define _SHIM_FCNTL_H
# define O_RDONLY 0
int	open(const char *path, int flags, ...);
#endif
