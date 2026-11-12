/*
 * entry.c - exported entry points for the browser. Each one mirrors a piece
 * of the original main()/parser() so JS can stop between stages and read the
 * real t_token / t_cmd structures out of linear memory.
 */
#include "minishell.h"

__attribute__((import_module("env"), import_name("js_snapshot")))
void	js_snapshot(int stage, int lexer_result);

int		init_cwd(t_data *data);
int		handle_input(t_data *data);
void	exec_child(t_data *data, t_cmd *cmd, int prev_fd, int pipe_fd[2]);

static char	**g_saved_env;
static char	*g_saved_cwd;
static int	g_saved_code;

/* same setup as main() */
t_data	*ms_init(char **envp)
{
	t_data	*data;

	data = get_data();
	data->in_save = 0;
	data->out_save = 1;
	data->env = ft_dupenv(envp);
	init_cwd(data);
	if (data->cwd)
		ft_setenv(&data->env, "PWD", data->cwd);
	handle_signals();
	return (data);
}

/* handle_input() + first half of parser() */
int	ms_parse_front(void)
{
	t_data	*data;
	int		res;

	data = get_data();
	if (!handle_input(data))
		return (0);
	res = lexer(data);
	js_snapshot(1, res);
	ft_free(data->str);
	data->str = NULL;
	if (!syntax_checker(data, res))
		return (free_token_list(&data->token_list), -1);
	list_to_cmds(data);
	free_token_list(&data->token_list);
	js_snapshot(2, 0);
	return (1);
}

/* second half of parser() */
int	ms_parse_back(void)
{
	t_data	*data;

	data = get_data();
	if (!handle_heredoc(data, data->cmd_list))
		return (free_cmd_list(&data->cmd_list), 0);
	handle_redirections(data, data->cmd_list);
	js_snapshot(3, 0);
	expand_all(data);
	js_snapshot(4, 0);
	return (1);
}

/* SIGINT while a heredoc is being read: the heredoc child dies (130) and
 * parser() frees the command list */
void	ms_heredoc_sigint(void)
{
	t_data	*data;

	data = get_data();
	data->exit_code = 130;
	free_cmd_list(&data->cmd_list);
}

/* end of one main-loop iteration */
void	ms_done(void)
{
	free_cmd_list(&(get_data()->cmd_list));
}

/* SIGINT at the prompt: readline is waiting, so get_status() is 0 */
void	ms_sigint(void)
{
	*get_status() = 0;
	sigint_handler(SIGINT);
}

int	ms_is_builtin(t_cmd *cmd)
{
	return (is_builtin(cmd->list));
}

/* "fork": the child gets a private copy of the environment */
void	ms_fork_enter(void)
{
	t_data	*data;

	data = get_data();
	g_saved_env = data->env;
	g_saved_cwd = data->cwd;
	g_saved_code = data->exit_code;
	data->env = ft_dupenv(g_saved_env);
	if (g_saved_cwd)
		data->cwd = ft_strdup(g_saved_cwd);
}

void	ms_fork_leave(void)
{
	t_data	*data;

	data = get_data();
	data->env = g_saved_env;
	data->cwd = g_saved_cwd;
	data->exit_code = g_saved_code;
	data->in_save = 0;
	data->out_save = 1;
}

void	ms_exec_child(t_cmd *cmd, int prev_fd, int *pipe_fd)
{
	exec_child(get_data(), cmd, prev_fd, pipe_fd);
}

void	ms_single_builtin(t_cmd *cmd)
{
	exec_single_builtin(get_data(), cmd);
}

int	ms_get_exit_code(void)
{
	return (get_data()->exit_code);
}

void	ms_set_exit_code(int code)
{
	get_data()->exit_code = code;
}
