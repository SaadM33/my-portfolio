#ifndef STUB_SYS_STAT_H
# define STUB_SYS_STAT_H
# include <sys/types.h>
struct stat { mode_t st_mode; };
# define S_IFMT 0170000
# define S_IFDIR 0040000
# define S_ISDIR(m) (((m) & S_IFMT) == S_IFDIR)
int	stat(const char *p, struct stat *sb);
#endif
