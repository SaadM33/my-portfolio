// Host side of the cub3D wasm build: plays the role of Linux + X11 + MiniLibX.
// Each run instantiates a fresh module, like starting ./cub3D_bonus again,
// so the program's static variables start from zero every time.

export class ExitSignal {
  constructor(code) { this.code = code; }
}
class LoopSignal {}

/** Decode textures.pak (gzip'd palette pack written by tools/xpm2pak.py). */
export async function loadPak(gzBuffer) {
  const stream = new Blob([gzBuffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  const dv = new DataView(buf);
  const dec = new TextDecoder();
  let o = 8;
  const count = dv.getUint32(o, true); o += 4;
  const list = [];
  for (let i = 0; i < count; i++) {
    const nl = dv.getUint16(o, true); o += 2;
    const name = dec.decode(new Uint8Array(buf, o, nl)); o += nl;
    const w = dv.getUint16(o, true), h = dv.getUint16(o + 2, true), nc = dv.getUint16(o + 4, true); o += 6;
    const pal = new Uint32Array(nc);
    for (let k = 0; k < nc; k++) pal[k] = dv.getUint32(o + k * 4, true);
    o += nc * 4;
    let idx;
    if (nc <= 256) { idx = new Uint8Array(buf, o, w * h); o += w * h; }
    else { idx = new Uint16Array(buf.slice(o, o + w * h * 2)); o += w * h * 2; }
    list.push({ name, w, h, pal, idx });
  }
  return list;
}

/**
 * Start the program: `./cub3D_bonus <fileName>` with <fileText> as that file.
 * hooks: onWrite(fd, text), onWindow(w, h, title), onImage(rgba, w, h, x, y),
 *        onString(x, y, color, text)
 */
export async function spawn(module, textures, fileName, fileText, hooks, mouse) {
  let mem;
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const u8 = () => new Uint8Array(mem.buffer);
  const cstr = (p) => { const m = u8(); let e = p; while (m[e]) e++; return dec.decode(m.subarray(p, e)); };
  const env = {
    cos: Math.cos,
    sin: Math.sin,
    js_write: (fd, p, n) => hooks.onWrite(fd, dec.decode(u8().slice(p, p + n))),
    js_exit: (code) => { throw new ExitSignal(code); },
    js_now_ms: () => performance.now(),
    js_new_window: (w, h, t) => hooks.onWindow(w, h, cstr(t)),
    js_put_image: (p, w, h, x, y) => hooks.onImage(new Uint8ClampedArray(mem.buffer, p, w * h * 4), w, h, x, y),
    js_string_put: (x, y, c, s) => hooks.onString(x, y, c, cstr(s)),
    js_loop: () => { throw new LoopSignal(); },
    js_mouse_x: () => mouse.x | 0,
    js_mouse_y: () => mouse.y | 0,
    js_mouse_move: (x, y) => { mouse.x = x; mouse.y = y; },
    js_tex_lookup: (p) => { const n = cstr(p); return textures.findIndex((t) => t.name === n); },
    js_tex_w: (id) => textures[id].w,
    js_tex_h: (id) => textures[id].h,
    js_tex_fill: (id, dst) => {
      const t = textures[id];
      const out = new Uint32Array(mem.buffer, dst, t.w * t.h);
      const { pal, idx } = t;
      for (let i = 0; i < out.length; i++) out[i] = pal[idx[i]];
    },
  };
  const inst = await WebAssembly.instantiate(module, { env });
  const ex = inst.exports;
  mem = ex.memory;

  const put = (bytes) => { const p = ex.shim_alloc(bytes.length + 1); u8().set(bytes, p); u8()[p + bytes.length] = 0; return p; };
  const data = enc.encode(fileText);
  const prog = put(enc.encode("./cub3D_bonus"));
  const arg = put(enc.encode(fileName));
  const dataPtr = put(data);
  ex.shim_set_file(arg, dataPtr, data.length);
  const argv = ex.shim_alloc(12);
  new Uint32Array(mem.buffer, argv, 3).set([prog, arg, 0]);

  const proc = {
    state: "running", // running | exited | crashed
    code: 0,
    error: "",
    exports: ex,
    memory: mem,
    call(fn) {
      if (proc.state !== "running") return;
      try { fn(); }
      catch (e) {
        if (e instanceof LoopSignal) return;
        if (e instanceof ExitSignal) { proc.state = "exited"; proc.code = e.code; return; }
        proc.state = "crashed"; proc.error = String(e && e.message || e);
      }
    },
    tick() { proc.call(() => ex.shim_tick()); },
    key(pressed, sym) { proc.call(() => ex.shim_key(pressed ? 1 : 0, sym)); },
    destroy() { proc.call(() => ex.shim_destroy()); },
    row(y) { const p = ex.probe_row(y); return p ? cstr(p) : ""; },
  };
  // main() parses the .cub, loads textures, installs hooks, then mlx_loop()
  // throws LoopSignal and leaves its stack frame (the t_game) in place.
  proc.call(() => ex.main(2, argv));
  return proc;
}

// X11 keysyms the project's key_press()/key_release() switch on.
export const KEYSYM = {
  KeyW: 119, KeyA: 97, KeyS: 115, KeyD: 100, KeyE: 101, KeyQ: 113,
  Tab: 65289, ArrowLeft: 65361, ArrowRight: 65363, Escape: 65307,
};
