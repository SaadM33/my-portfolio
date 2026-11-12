/* minimal freestanding stub (minishell -> wasm32) */
#ifndef STUB_STDLIB_H
# define STUB_STDLIB_H
# include <stddef.h>
# include <string.h>
void	*malloc(size_t n);
void	free(void *p);
void	exit(int code) __attribute__((noreturn));
#endif
