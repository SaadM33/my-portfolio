#ifndef STUB_STRING_H
# define STUB_STRING_H
# include <stddef.h>
char	*strerror(int e);
void	*memcpy(void *d, const void *s, size_t n);
void	*memset(void *d, int c, size_t n);
void	*memmove(void *d, const void *s, size_t n);
#endif
