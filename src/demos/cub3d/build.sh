#!/usr/bin/env bash
# Rebuild cub3d.wasm + textures.pak from the real cub3D sources (bonus build).
#
#   ./build.sh [path/to/authyx-cub3d-clone]
#
# Without an argument it clones github.com/authyx/cub3d at the pinned commit.
# Needs: clang (wasm32 target), wasm-ld, llvm-ar, python3. No emscripten, no libc.
# The project's .c files are compiled unmodified; only MiniLibX and the few
# libc calls are replaced by shim/*.c and the headers in shim/include/.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PIN=6c1881d
SRC="${1:-}"
if [ -z "$SRC" ]; then
  SRC="$(mktemp -d)/cub3d"
  git clone -q https://github.com/authyx/cub3d.git "$SRC"
  git -C "$SRC" checkout -q "$PIN"
fi
OUT="$(mktemp -d)"

BONUS=(
  bonus/src/parsing/config_bonus.c bonus/src/parsing/config_utils_bonus.c
  bonus/src/parsing/utils_bonus.c bonus/src/parsing/utils2_bonus.c
  bonus/src/parsing/map_bonus.c bonus/src/parsing/game_bonus.c
  bonus/src/parsing/map_utils_bonus.c bonus/src/render/load_textures_bonus.c
  bonus/src/render/main_render_bonus.c bonus/src/render/ray_utils_bonus.c
  bonus/src/render/render_bonus.c bonus/src/render/render_border_bonus.c
  bonus/src/render/render_utils_bonus.c bonus/src/render/render_wall_bonus.c
  bonus/src/render/render_ceiling_bonus.c bonus/src/render/r_map_bonus.c
  bonus/src/render/door_interaction_bonus.c bonus/src/window/key_press_bonus.c
  bonus/src/window/movement_bonus.c bonus/src/window/win_manage_bonus.c
  bonus/src/errors_bonus.c bonus/src/ft_free.c bonus/src/ft_malloc.c
  bonus/src/main.c
)
LIBFT=( $(cd "$SRC" && ls libft/*.c) )

CFLAGS=(--target=wasm32 -O2 -nostdlib -ffreestanding -fno-builtin-malloc
  -isystem "$HERE/shim/include" -I"$SRC/includes" -I"$SRC/libft"
  -I"$SRC/minilibx-linux" -Wno-everything)

objs=()
for f in "${BONUS[@]}"; do
  o="$OUT/$(echo "$f" | tr / _).o"
  clang "${CFLAGS[@]}" -c "$SRC/$f" -o "$o"
  objs+=("$o")
done
# libft goes into an archive, as in the project's Makefile (libft.a)
lobjs=()
for f in "${LIBFT[@]}"; do
  o="$OUT/$(echo "$f" | tr / _).o"
  clang "${CFLAGS[@]}" -c "$SRC/$f" -o "$o"
  lobjs+=("$o")
done
llvm-ar rcs "$OUT/libft.a" "${lobjs[@]}"
for f in libc_shim mlx_shim probe; do
  clang "${CFLAGS[@]}" -c "$HERE/shim/$f.c" -o "$OUT/shim_$f.o"
  objs+=("$OUT/shim_$f.o")
done

wasm-ld --no-entry --export=main \
  --wrap=init_dda_values -z stack-size=1048576 --initial-memory=4194304 \
  --max-memory=134217728 --strip-debug "${objs[@]}" "$OUT/libft.a" -o "$HERE/cub3d.wasm"

python3 "$HERE/tools/xpm2pak.py" "$SRC" "$HERE/textures.pak" \
  assets/gray.xpm assets/red.xpm assets/wall.xpm assets/wall1.xpm \
  assets/wall2.xpm assets/wall3.xpm assets/ore1.xpm assets/ore2.xpm \
  assets/ore3.xpm assets/ore4.xpm assets/Demon.xpm \
  assets/water/w0.xpm assets/water/w1.xpm assets/water/w2.xpm assets/water/w3.xpm

# The real maps, embedded as text for the map picker.
python3 - "$SRC" "$HERE/maps.json" <<'PY'
import json, sys
src, out = sys.argv[1], sys.argv[2]
names = ["map_bonus.cub", "map.cub", "test_full.cub", "flat_map.cub", "autoroute.cub"]
json.dump({f"maps/{n}": open(f"{src}/maps/{n}").read() for n in names}, open(out, "w"), indent=1)
PY
rm -rf "$OUT"
ls -l "$HERE/cub3d.wasm" "$HERE/textures.pak" "$HERE/maps.json"
