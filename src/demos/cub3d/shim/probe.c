/*
 * probe.c -- read-only taps for the page's instrument panel.
 * Uses the project's own t_game (via ft_get_game) and counts DDA rays by
 * wrapping init_dda_values with the linker (--wrap), without touching the
 * project's sources.
 */
#include "main_bonus.h"

static int	g_rays;

void	__real_init_dda_values(t_game *g, double angle, t_ray_data *ray);

void	__wrap_init_dda_values(t_game *g, double angle, t_ray_data *ray)
{
	g_rays++;
	__real_init_dda_values(g, angle, ray);
}

__attribute__((export_name("probe_take_rays")))
int	probe_take_rays(void)
{
	int	n;

	n = g_rays;
	g_rays = 0;
	return (n);
}

__attribute__((export_name("probe_f64")))
double	probe_f64(int what)
{
	t_game	*g;

	g = ft_get_game(NULL);
	if (!g)
		return (0);
	if (what == 0)
		return (g->player.x);
	if (what == 1)
		return (g->player.y);
	if (what == 2)
		return (g->player.angle);
	return (0);
}

__attribute__((export_name("probe_i32")))
int	probe_i32(int what)
{
	t_game	*g;

	g = ft_get_game(NULL);
	if (!g)
		return (0);
	if (what == 0)
		return (g->keys.tab);
	if (what == 1)
		return (g->keys.q);
	if (what == 2)
		return (g->map.width);
	if (what == 3)
		return (g->map.height);
	if (what == 4)
		return (g->keys.w | g->keys.a << 1 | g->keys.s << 2 | g->keys.d << 3
			| g->keys.left << 4 | g->keys.right << 5);
	return (0);
}

/* pointer to row y of the live map grid (doors flip between 'D' and 'd') */
__attribute__((export_name("probe_row")))
char	*probe_row(int y)
{
	t_game	*g;

	g = ft_get_game(NULL);
	if (!g || !g->map.grid || y < 0 || y >= g->map.height)
		return (NULL);
	return (g->map.grid[y]);
}
