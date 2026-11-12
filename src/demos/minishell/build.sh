#!/usr/bin/env bash
# Builds minishell.wasm from the ORIGINAL minishell sources (lexer, syntax
# checker, parser, expander, redirections, builtins, exec_child, PATH lookup)
# plus a small shim (wasm/). No libc: wasm/include holds stub headers and
# wasm/shim.c provides malloc/free, printf and forwards syscalls to JS.
#
# usage: SRC=/path/to/SaadM33_minishell ./build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${SRC:-/tmp/scratchpad/repos/SaadM33_minishell}"

FILES=(
  src/parsing/lexer.c src/parsing/lexer_utils.c src/parsing/syntax_checker.c
  src/parsing/expand_and_join.c src/parsing/expand_all.c
  src/parsing/redirection.c src/parsing/redirection_utils.c
  src/parsing/ft_split_whitespace.c
  src/utils/signals.c src/utils/errors.c src/utils/linked_list.c
  src/utils/linked_cmd.c src/utils/general.c src/utils/envirenment.c
  src/built_in/ft_cd.c src/built_in/ft_echo.c src/built_in/ft_env.c
  src/built_in/ft_exit.c src/built_in/ft_export.c src/built_in/ft_pwd.c
  src/built_in/ft_unset.c
  src/exec/execution.c src/exec/run_builtin.c src/exec/run_cmd.c
)
LIBFT=$(cd "$SRC" && ls libft/src/libft/*.c)

CFLAGS=(--target=wasm32 -nostdlib -ffreestanding -O2 -std=gnu11
  -Wall -Wextra -Wno-unused-parameter
  -isystem "$HERE/wasm/include" -I"$SRC/includes" -I"$SRC/libft/includes")

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
i=0
for f in "${FILES[@]}" $LIBFT; do
  clang "${CFLAGS[@]}" -c "$SRC/$f" -o "$OUT/$i.o"; i=$((i+1))
done
# main.c: keep get_data/init_cwd/handle_input; rename main and ft_exit
clang "${CFLAGS[@]}" -Dmain=ms_unused_main -Dft_exit=ms_main_ft_exit \
  -c "$SRC/src/main.c" -o "$OUT/main.o"
for f in shim heredoc_wasm entry; do
  clang "${CFLAGS[@]}" -c "$HERE/wasm/$f.c" -o "$OUT/$f.o"
done

wasm-ld --no-entry --export-dynamic --strip-all \
  --export=__stack_pointer --export=malloc --export=free \
  --export=get_data \
  $(for s in ms_init ms_parse_front ms_parse_back ms_heredoc_sigint ms_done \
      ms_sigint ms_is_builtin ms_fork_enter ms_fork_leave ms_exec_child \
      ms_single_builtin ms_get_exit_code ms_set_exit_code; do echo "--export=$s"; done) \
  -z stack-size=262144 --initial-memory=2097152 \
  "$OUT"/*.o -o "$HERE/minishell.wasm"
ls -l "$HERE/minishell.wasm"
