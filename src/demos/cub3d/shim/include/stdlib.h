#ifndef _SHIM_STDLIB_H
# define _SHIM_STDLIB_H
# include "stddef_shim.h"
# define EXIT_SUCCESS 0
# define EXIT_FAILURE 1
void	*malloc(size_t size);
void	free(void *ptr);
_Noreturn void	exit(int status);
#endif
