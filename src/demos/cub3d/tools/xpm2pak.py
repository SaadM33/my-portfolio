#!/usr/bin/env python3
"""Decode the repo's XPM textures into one gzip'd palette pack for the browser.

Colour names are resolved with MiniLibX's own table (minilibx-linux/mlx_rgb.c),
and "None" becomes 0xFF000000, as mlx_xpm.c does.

Pack layout (little endian, then gzip):
  "CUBPAK1\\0", u32 count, then per texture:
  u16 name_len, name (utf-8, e.g. "assets/ore1.xpm"), u16 w, u16 h, u16 ncolors,
  u32 palette[ncolors] (0x00RRGGBB), then w*h indices (u8, or u16 if ncolors > 256)
usage: xpm2pak.py <cub3d-repo> <out.pak> <asset-path>...
"""
import gzip, re, struct, sys

def load_rgb_table(repo):
    table = {}
    src = open(f"{repo}/minilibx-linux/mlx_rgb.c", encoding="latin-1").read()
    for name, val in re.findall(r'\{\s*"([^"]+)"\s*,\s*(0x[0-9a-fA-F]+)\s*\}', src):
        table.setdefault(name.lower(), int(val, 16))
    return table

def decode(path, rgb):
    strings = re.findall(r'"((?:[^"\\]|\\.)*)"', open(path, encoding="latin-1").read())
    w, h, ncol, cpp = map(int, strings[0].split()[:4])
    keys, palette = {}, []
    for line in strings[1:1 + ncol]:
        key, rest = line[:cpp], line[cpp:].split()
        spec = None
        for i in range(0, len(rest) - 1):
            if rest[i] == "c":
                spec = " ".join(rest[i + 1:])
                break
        if spec is None:
            spec = rest[-1]
        s = spec.strip().lower()
        if s == "none":
            col = 0xFF000000
        elif s.startswith("#"):
            hx = s[1:]
            if len(hx) == 12:
                hx = hx[0:2] + hx[4:6] + hx[8:10]
            col = int(hx[:6], 16)
        else:
            col = rgb[s]
        keys[key] = len(palette)
        palette.append(col)
    rows = strings[1 + ncol:1 + ncol + h]
    idx = bytearray() if ncol <= 256 else []
    for row in rows:
        for x in range(w):
            idx.append(keys[row[x * cpp:(x + 1) * cpp]])
    if ncol > 256:
        idx = struct.pack(f"<{len(idx)}H", *idx)
    return w, h, palette, bytes(idx)

def main():
    repo, out, assets = sys.argv[1], sys.argv[2], sys.argv[3:]
    rgb = load_rgb_table(repo)
    body = bytearray(b"CUBPAK1\0" + struct.pack("<I", len(assets)))
    for a in assets:
        w, h, pal, idx = decode(f"{repo}/{a}", rgb)
        name = a.encode()
        body += struct.pack("<H", len(name)) + name + struct.pack("<HHH", w, h, len(pal))
        body += struct.pack(f"<{len(pal)}I", *pal) + idx
        print(f"  {a}: {w}x{h}, {len(pal)} colours", file=sys.stderr)
    open(out, "wb").write(gzip.compress(bytes(body), 9, mtime=0))

main()
