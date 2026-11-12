#ifndef _SHIM_STRING_H
# define _SHIM_STRING_H
# include "stddef_shim.h"
void	*memcpy(void *d, const void *s, size_t n);
void	*memset(void *d, int c, size_t n);
void	*memmove(void *d, const void *s, size_t n);
#endif
