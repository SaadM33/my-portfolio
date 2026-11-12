#ifndef _SHIM_MATH_H
# define _SHIM_MATH_H
/* sqrt/fabs/floor lower to native wasm instructions; cos/sin come from JS Math. */
__attribute__((import_module("env"), import_name("cos"))) double	cos(double x);
__attribute__((import_module("env"), import_name("sin"))) double	sin(double x);
# define sqrt(x) __builtin_sqrt(x)
# define fabs(x) __builtin_fabs(x)
# define floor(x) __builtin_floor(x)
#endif
