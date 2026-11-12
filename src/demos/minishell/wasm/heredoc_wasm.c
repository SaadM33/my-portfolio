/*
 * heredoc_wasm.c - replaces src/parsing/heredoc.c for the browser build.
 *
 * The original forks a child that loops on readline("> ") and writes the
 * lines into a random /tmp file. There is no fork() here, so this version
 * keeps the same steps and checks (handle_heredoc() is copied verbatim;
 * ft_heredoc() keeps ft_should_expand, last_in_redirection,
 * ft_expand_and_join(...,1,...) for the delimiter, mini_expand on each line,
 * the same EOF warning and exit codes) but reads the lines in-process and
 * stores the body in an in-memory file (js_memfd) instead of /tmp.
 * Ctrl-C during a heredoc is handled in JS (exit code 130, like the
 * original's heredoc_sig_handler).
 */
#include "minishell.h"

__attribute__((import_module("env"), import_name("js_memfd")))
int	js_memfd(const char *buf, int len);

int	handle_heredoc(t_data *data, t_cmd *cmd)
{
	t_token	*curr;

	while (cmd)
	{
		curr = cmd->list;
		while (curr)
		{
			if (curr->type == OP && !ft_strcmp(curr->arg, "<<"))
			{
				close_prev_fd(cmd, 0);
				if (ft_heredoc(curr->next, cmd, data))
					return (0);
				free_appended_nodes(&cmd->list, curr);
				curr = cmd->list;
			}
			else
				curr = curr->next;
		}
		cmd = cmd->next;
	}
	return (1);
}

static char	*heredoc_read_all(t_token *node, int should_expand, t_data *data)
{
	char	*body;
	char	*str;
	char	*tmp;

	body = ft_strdup("");
	while (1)
	{
		str = readline("> ");
		if (!str)
		{
			ft_error3("minishell: warning: here-document delimited by "
				"end-of-file (wanted `", node->arg, "')\n");
			break ;
		}
		if (!ft_strcmp(str, node->arg))
		{
			ft_free(str);
			break ;
		}
		if (should_expand)
		{
			tmp = mini_expand(str, data);
			ft_free(str);
			str = tmp;
		}
		tmp = ft_strjoin3(body, str, "\n");
		ft_free(body);
		ft_free(str);
		body = tmp;
	}
	return (body);
}

int	ft_heredoc(t_token *node, t_cmd *cmd, t_data *data)
{
	char	*body;
	int		rd_fd;
	int		should_expand;
	int		is_last_redirect;

	should_expand = ft_should_expand(node);
	is_last_redirect = last_in_redirection(cmd, node);
	node = ft_expand_and_join(node, data, 1, NULL);
	body = heredoc_read_all(node, should_expand, data);
	rd_fd = js_memfd(body, ft_strlen(body));
	ft_free(body);
	data->exit_code = 0;
	if (is_last_redirect)
		cmd->in_fd = rd_fd;
	else
		close(rd_fd);
	return (free_token_list(&node), 0);
}
