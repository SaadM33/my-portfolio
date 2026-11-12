#ifndef STUB_READLINE_H
# define STUB_READLINE_H
char	*readline(const char *prompt);
void	rl_replace_line(const char *s, int clear_undo);
int		rl_on_new_line(void);
void	rl_redisplay(void);
#endif
