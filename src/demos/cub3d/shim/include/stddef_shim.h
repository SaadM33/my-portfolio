/* Minimal freestanding libc surface for compiling cub3D to wasm32. */
#ifndef CUB_WASM_LIBC_H
# define CUB_WASM_LIBC_H
# include <stddef.h>
# define WASM_IMPORT(n) __attribute__((import_module("env"), import_name(n)))
typedef long	ssize_t;
#endif
