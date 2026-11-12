#ifndef _SHIM_UNISTD_H
# define _SHIM_UNISTD_H
# include "stddef_shim.h"
ssize_t	read(int fd, void *buf, size_t n);
ssize_t	write(int fd, const void *buf, size_t n);
int		close(int fd);
#endif
