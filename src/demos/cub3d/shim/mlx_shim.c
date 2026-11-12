/*
 * mlx_shim.c -- MiniLibX replacement for the browser.
 *
 * Images are plain 0x00RRGGBB pixel buffers in linear memory, the same layout
 * mlx_get_data_addr() hands out on Linux (32 bpp, little endian), so the
 * project's my_pixel_put() and texel reads work unchanged.
 * mlx_put_image_to_window() converts to RGBA and asks JS to blit it onto a
 * <canvas>. Hooks are stored here and driven from JS: key events arrive as
 * X11 keysyms, the loop hook runs once per requestAnimationFrame.
 */
#include <stdlib.h>
#include "mlx.h"

WASM_IMPORT("js_new_window") void	js_new_window(int w, int h, char *title);
WASM_IMPORT("js_put_image") void	js_put_image(void *rgba, int w, int h,
										int x, int y);
WASM_IMPORT("js_string_put") void	js_string_put(int x, int y, int color,
										char *s);
WASM_IMPORT("js_loop") void	js_loop(void);
WASM_IMPORT("js_mouse_x") int	js_mouse_x(void);
WASM_IMPORT("js_mouse_y") int	js_mouse_y(void);
WASM_IMPORT("js_mouse_move") void	js_mouse_move(int x, int y);
WASM_IMPORT("js_tex_lookup") int	js_tex_lookup(char *path);
WASM_IMPORT("js_tex_w") int	js_tex_w(int id);
WASM_IMPORT("js_tex_h") int	js_tex_h(int id);
WASM_IMPORT("js_tex_fill") void	js_tex_fill(int id, void *dst);

typedef struct s_img
{
	int				w;
	int				h;
	unsigned int	*px;
	unsigned int	*rgba;
}	t_img;

typedef int	(*t_hook1)(void *);
typedef int	(*t_hook2)(int, void *);

static int		g_mlx;
static int		g_win;
static t_hook2	g_key_press;
static t_hook2	g_key_release;
static t_hook1	g_destroy;
static void		*g_key_press_p;
static void		*g_key_release_p;
static void		*g_destroy_p;
static t_hook1	g_loop;
static void		*g_loop_p;

void	*mlx_init(void)
{
	return (&g_mlx);
}

void	*mlx_new_window(void *mlx, int w, int h, char *title)
{
	(void)mlx;
	js_new_window(w, h, title);
	return (&g_win);
}

void	*mlx_new_image(void *mlx, int w, int h)
{
	t_img	*img;

	(void)mlx;
	img = malloc(sizeof(t_img));
	if (!img)
		return (NULL);
	img->w = w;
	img->h = h;
	img->px = malloc((size_t)w * h * 4);
	img->rgba = NULL;
	if (!img->px)
		return (NULL);
	__builtin_memset(img->px, 0, (size_t)w * h * 4);
	return (img);
}

char	*mlx_get_data_addr(void *p, int *bpp, int *size_line, int *endian)
{
	t_img	*img;

	img = p;
	*bpp = 32;
	*size_line = img->w * 4;
	*endian = 0;
	return ((char *)img->px);
}

int	mlx_put_image_to_window(void *mlx, void *win, void *p, int x, int y)
{
	t_img			*img;
	int				i;
	int				n;
	unsigned int	c;

	(void)mlx;
	(void)win;
	img = p;
	n = img->w * img->h;
	if (!img->rgba)
		img->rgba = malloc((size_t)n * 4);
	if (!img->rgba)
		return (0);
	i = 0;
	while (i < n)
	{
		c = img->px[i];
		img->rgba[i] = 0xFF000000u | ((c & 0xFFu) << 16) | (c & 0xFF00u)
			| ((c >> 16) & 0xFFu);
		i++;
	}
	js_put_image(img->rgba, img->w, img->h, x, y);
	return (0);
}

int	mlx_string_put(void *mlx, void *win, int x, int y, int color, char *s)
{
	(void)mlx;
	(void)win;
	js_string_put(x, y, color, s);
	return (0);
}

/* XPM files were decoded at build time (see xpm2pak.py); JS holds them. */
void	*mlx_xpm_file_to_image(void *mlx, char *filename, int *w, int *h)
{
	t_img	*img;
	int		id;

	(void)mlx;
	while (filename[0] == '.' && filename[1] == '/')
		filename += 2;
	id = js_tex_lookup(filename);
	if (id < 0)
		return (NULL);
	img = malloc(sizeof(t_img));
	if (!img)
		return (NULL);
	img->w = js_tex_w(id);
	img->h = js_tex_h(id);
	img->rgba = NULL;
	img->px = malloc((size_t)img->w * img->h * 4);
	if (!img->px)
		return (NULL);
	js_tex_fill(id, img->px);
	*w = img->w;
	*h = img->h;
	return (img);
}

int	mlx_hook(void *win, int ev, int mask, int (*f)(), void *param)
{
	(void)win;
	(void)mask;
	if (ev == 2)
		(g_key_press = (t_hook2)f, g_key_press_p = param);
	else if (ev == 3)
		(g_key_release = (t_hook2)f, g_key_release_p = param);
	else if (ev == 17)
		(g_destroy = (t_hook1)f, g_destroy_p = param);
	return (0);
}

int	mlx_loop_hook(void *mlx, int (*f)(), void *param)
{
	(void)mlx;
	g_loop = (t_hook1)f;
	g_loop_p = param;
	return (0);
}

/* Never returns: JS throws, leaving main()'s stack frame (and its t_game)
 * intact; the browser's requestAnimationFrame becomes the event loop. */
int	mlx_loop(void *mlx)
{
	(void)mlx;
	js_loop();
	return (0);
}

int	mlx_mouse_get_pos(void *mlx, void *win, int *x, int *y)
{
	(void)mlx;
	(void)win;
	*x = js_mouse_x();
	*y = js_mouse_y();
	return (1);
}

int	mlx_mouse_move(void *mlx, void *win, int x, int y)
{
	(void)mlx;
	(void)win;
	js_mouse_move(x, y);
	return (0);
}

int	mlx_destroy_image(void *mlx, void *img)
{
	(void)mlx;
	(void)img;
	return (0);
}

int	mlx_destroy_window(void *mlx, void *win)
{
	(void)mlx;
	(void)win;
	return (0);
}

int	mlx_destroy_display(void *mlx)
{
	(void)mlx;
	return (0);
}

/* ---- entry points for JS ---- */

__attribute__((export_name("shim_tick")))
int	shim_tick(void)
{
	if (g_loop)
		return (g_loop(g_loop_p));
	return (0);
}

__attribute__((export_name("shim_key")))
int	shim_key(int pressed, int keysym)
{
	if (pressed && g_key_press)
		return (g_key_press(keysym, g_key_press_p));
	if (!pressed && g_key_release)
		return (g_key_release(keysym, g_key_release_p));
	return (0);
}

__attribute__((export_name("shim_destroy")))
int	shim_destroy(void)
{
	if (g_destroy)
		return (g_destroy(g_destroy_p));
	return (0);
}
