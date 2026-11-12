// Simulated "kernel" for the browser minishell: an in-memory file system,
// a per-process fd table (open/close/dup/dup2/pipe) and the external
// commands the shell can execve(). The shell itself (lexer, parser,
// expander, redirections, builtins, exec_child, PATH lookup) is the original
// C code compiled to WebAssembly; see shell.ts.

export const ENOENT = 2, ENOEXEC = 8, EBADF = 9, EACCES = 13, ENOTDIR = 20, EISDIR = 21;

export type FileNode = { kind: "file"; data: string; mode: number; prog?: string; mtime: Date };
export type DirNode = { kind: "dir"; children: Map<string, Node>; mode: number; mtime: Date };
export type Node = FileNode | DirNode;

const T0 = new Date(2025, 6, 18, 20, 18);

function file(data: string, mode = 0o644, prog?: string): FileNode {
  return { kind: "file", data, mode, prog, mtime: T0 };
}
function dir(entries: Record<string, Node> = {}, mode = 0o755): DirNode {
  return { kind: "dir", children: new Map(Object.entries(entries)), mode, mtime: T0 };
}

export const PROGRAMS = ["cat", "clear", "false", "grep", "head", "ls", "sort", "true", "wc"];
export const HOME = "/home/visitor";

export function makeFs(): DirNode {
  const bin = dir(Object.fromEntries(PROGRAMS.map((p) => [p, file(`\x7fELF (simulated ${p})\n`, 0o755, p)])));
  return dir({
    bin,
    etc: dir({ hostname: file("lab\n") }),
    home: dir({
      visitor: dir({
        ".profile": file("# minishell does not read this file\n"),
        "fruits.txt": file(
          "banana\napple\ncherry\nmango\norange\nblueberry\nkiwi\ngrape\nbanana\npineapple\n"
        ),
        "notes.txt": file(
          "minishell, 1337 school, summer 2025\n" +
            "lexer      split the line into words, quotes and operators\n" +
            "parser     one command per pipe segment\n" +
            "redirect   < > >> << open fds before expansion\n" +
            "expander   $VAR and $?, word splitting outside quotes\n" +
            "exec       fork, pipe, dup2, execve, waitpid\n"
        ),
        "readonly.txt": file("you can read me, but > readonly.txt will fail\n", 0o444),
        projects: dir({
          "cub3d.txt": file("raycaster, DDA, MiniLibX\n"),
          "minishell.txt": file("this shell\n"),
        }),
      }),
    }),
    tmp: dir({}, 0o777),
    usr: dir({ bin, local: dir({ bin: dir() }) }),
  });
}

export class Fs {
  root: DirNode;
  cwd = HOME;
  constructor(root: DirNode) {
    this.root = root;
  }
  abs(path: string): string {
    const parts = (path.startsWith("/") ? path : this.cwd + "/" + path).split("/");
    const out: string[] = [];
    for (const p of parts) {
      if (!p || p === ".") continue;
      if (p === "..") out.pop();
      else out.push(p);
    }
    return "/" + out.join("/");
  }
  // returns node or -errno
  lookup(path: string): Node | number {
    if (path === "") return -ENOENT;
    const parts = this.abs(path).split("/").filter(Boolean);
    let n: Node = this.root;
    for (const p of parts) {
      if (n.kind !== "dir") return -ENOTDIR;
      const c = n.children.get(p);
      if (!c) return -ENOENT;
      n = c;
    }
    if (path.endsWith("/") && n.kind !== "dir") return -ENOTDIR;
    return n;
  }
  parentOf(path: string): { dir: DirNode | number; name: string } {
    const a = this.abs(path);
    const i = a.lastIndexOf("/");
    const d = this.lookup(a.slice(0, i) || "/");
    if (typeof d === "number") return { dir: d, name: "" };
    if (d.kind !== "dir") return { dir: -ENOTDIR, name: "" };
    return { dir: d, name: a.slice(i + 1) };
  }
}

// ---------------- file descriptions / fd table ----------------
export type Pipe = { id: number; buf: string; r: number; w: number };
export type Desc =
  | { kind: "tty" }
  | { kind: "file"; path: string; node: FileNode; pos: number; append: boolean; rd: boolean; wr: boolean; flags: string }
  | { kind: "dir"; path: string }
  | { kind: "pipe"; end: "r" | "w"; pipe: Pipe }
  | { kind: "mem"; data: string; pos: number; label: string };

export function descLabel(d: Desc | undefined | null): string {
  if (!d) return "closed";
  switch (d.kind) {
    case "tty": return "tty";
    case "file": return `${d.path} (${d.flags})`;
    case "dir": return `${d.path} (dir)`;
    case "pipe": return `pipe#${d.pipe.id} ${d.end === "r" ? "read end" : "write end"}`;
    case "mem": return d.label;
  }
}

export class Kernel {
  fs: Fs;
  fds: (Desc | null)[];
  pipeSeq = 0;
  memSeq = 0;
  onTty: (text: string, fd: number) => void;
  constructor(fs: Fs, onTty: (text: string, fd: number) => void) {
    this.fs = fs;
    this.onTty = onTty;
    const tty: Desc = { kind: "tty" };
    this.fds = [tty, tty, tty];
  }
  private alloc(d: Desc): number {
    let i = 0;
    while (this.fds[i]) i++;
    this.fds[i] = d;
    return i;
  }
  open(path: string, flags: number): number {
    const acc = flags & 3, creat = flags & 0o100, trunc = flags & 0o1000, append = flags & 0o2000;
    const wr = acc === 1 || acc === 2, rd = acc === 0 || acc === 2;
    let n = this.fs.lookup(path);
    if (typeof n === "number") {
      if (n !== -ENOENT || !creat) return n;
      const { dir, name } = this.fs.parentOf(path);
      if (typeof dir === "number") return dir;
      if (!(dir.mode & 0o200)) return -EACCES;
      n = file("");
      dir.children.set(name, n);
    }
    if (n.kind === "dir") {
      if (wr) return -EISDIR;
      return this.alloc({ kind: "dir", path: this.fs.abs(path) });
    }
    if ((wr && !(n.mode & 0o200)) || (rd && !(n.mode & 0o400))) return -EACCES;
    if (trunc && wr) n.data = "";
    if (wr) n.mtime = new Date();
    const f = ["O_RDONLY", "O_WRONLY", "O_RDWR"][acc] + (creat ? "|O_CREAT" : "") + (trunc ? "|O_TRUNC" : "") + (append ? "|O_APPEND" : "");
    return this.alloc({ kind: "file", path: this.fs.abs(path), node: n, pos: 0, append: !!append, rd, wr, flags: f });
  }
  memfd(data: string): number {
    return this.alloc({ kind: "mem", data, pos: 0, label: `heredoc#${++this.memSeq} (${data.length} B)` });
  }
  pipe(): [number, number, Pipe] {
    const p: Pipe = { id: this.pipeSeq++, buf: "", r: -1, w: -1 };
    p.r = this.alloc({ kind: "pipe", end: "r", pipe: p });
    p.w = this.alloc({ kind: "pipe", end: "w", pipe: p });
    return [p.r, p.w, p];
  }
  close(fd: number): number {
    if (!this.fds[fd]) return -EBADF;
    this.fds[fd] = null;
    return 0;
  }
  dup(fd: number): number {
    const d = this.fds[fd];
    if (!d) return -EBADF;
    return this.alloc(d);
  }
  dup2(a: number, b: number): number {
    const d = this.fds[a];
    if (!d) return -EBADF;
    this.fds[b] = d;
    return b;
  }
  write(fd: number, s: string): number {
    const d = this.fds[fd];
    if (!d) return -EBADF;
    if (d.kind === "tty") this.onTty(s, fd);
    else if (d.kind === "pipe") {
      if (d.end !== "w") return -EBADF;
      d.pipe.buf += s;
    } else if (d.kind === "file") {
      if (!d.wr) return -EBADF;
      const n = d.node;
      if (d.append) d.pos = n.data.length;
      n.data = n.data.slice(0, d.pos) + s + n.data.slice(d.pos + s.length);
      d.pos += s.length;
      n.mtime = new Date();
    } else return -EBADF;
    return s.length;
  }
  // read everything that is available on fd (processes run one after another,
  // so a pipe's writer has always finished)
  readAll(fd: number): string | number {
    const d = this.fds[fd];
    if (!d) return -EBADF;
    switch (d.kind) {
      case "tty": return ""; // terminal input: immediate EOF in this demo
      case "dir": return -EISDIR;
      case "pipe": {
        if (d.end !== "r") return -EBADF;
        const s = d.pipe.buf;
        d.pipe.buf = "";
        return s;
      }
      case "file": {
        if (!d.rd) return -EBADF;
        const s = d.node.data.slice(d.pos);
        d.pos = d.node.data.length;
        return s;
      }
      case "mem": {
        const s = d.data.slice(d.pos);
        d.pos = d.data.length;
        return s;
      }
    }
  }
  isatty(fd: number) {
    return this.fds[fd]?.kind === "tty";
  }
}

// ---------------- simulated external programs ----------------
export type Ctx = {
  argv: string[];
  k: Kernel;
  out: (s: string) => void;
  err: (s: string) => void;
};

const errText: Record<number, string> = {
  [ENOENT]: "No such file or directory",
  [EACCES]: "Permission denied",
  [ENOTDIR]: "Not a directory",
  [EISDIR]: "Is a directory",
  [EBADF]: "Bad file descriptor",
};

// read a file operand (or "-" / stdin) -> text or error string
function readOperand(c: Ctx, name: string | null): { text?: string; err?: string } {
  if (name === null || name === "-") {
    const r = c.k.readAll(0);
    return typeof r === "number" ? { err: `${name ?? "-"}: ${errText[-r]}` } : { text: r };
  }
  const n = c.k.fs.lookup(name);
  if (typeof n === "number") return { err: `${name}: ${errText[-n]}` };
  if (n.kind === "dir") return { err: `${name}: Is a directory` };
  if (!(n.mode & 0o400)) return { err: `${name}: Permission denied` };
  return { text: n.data };
}

function parseOpts(argv: string[], letters: string, withN = false) {
  const opts = new Set<string>();
  const ops: string[] = [];
  let n: number | null = null;
  let bad: string | null = null;
  let i = 1;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { i++; break; }
    if (a.length < 2 || a[0] !== "-") { ops.push(a); continue; }
    if (withN && /^-\d+$/.test(a)) { n = +a.slice(1); continue; }
    for (let j = 1; j < a.length; j++) {
      const ch = a[j];
      if (withN && ch === "n") {
        const v = a.slice(j + 1) || argv[++i];
        if (v === undefined || !/^\d+$/.test(v)) { bad = `invalid number of lines: '${v ?? ""}'`; }
        else n = +v;
        break;
      }
      if (!letters.includes(ch)) { bad = `invalid option -- '${ch}'`; break; }
      opts.add(ch);
    }
    if (bad) break;
  }
  for (; i < argv.length; i++) ops.push(argv[i]);
  return { opts, ops, n, bad };
}

const lines = (t: string) => {
  const ls = t.split("\n");
  if (ls[ls.length - 1] === "") ls.pop();
  return ls;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function perm(n: Node) {
  const m = n.mode, r = "rwxrwxrwx";
  let s = n.kind === "dir" ? "d" : "-";
  for (let i = 0; i < 9; i++) s += m & (1 << (8 - i)) ? r[i] : "-";
  return s;
}

export const programs: Record<string, (c: Ctx) => number> = {
  true: () => 0,
  false: () => 1,
  clear: (c) => {
    c.out("\x1b[H\x1b[2J");
    return 0;
  },
  cat: (c) => {
    const { ops, bad } = parseOpts(c.argv, "");
    if (bad) { c.err(`cat: ${bad}\n`); return 1; }
    let st = 0;
    for (const f of ops.length ? ops : [null]) {
      const r = readOperand(c, f);
      if (r.err) { c.err(`cat: ${r.err}\n`); st = 1; } else c.out(r.text!);
    }
    return st;
  },
  head: (c) => {
    const { ops, n, bad } = parseOpts(c.argv, "", true);
    if (bad) { c.err(`head: ${bad}\n`); return 1; }
    const files = ops.length ? ops : [null];
    let st = 0;
    files.forEach((f, i) => {
      const r = readOperand(c, f);
      if (r.err) {
        c.err(`head: cannot open '${f}' for reading: ${r.err.split(": ").pop()}\n`);
        st = 1;
        return;
      }
      if (files.length > 1) c.out(`${i ? "\n" : ""}==> ${f ?? "standard input"} <==\n`);
      const ls = r.text!.split("\n");
      const keep = n ?? 10;
      let out = ls.slice(0, keep).join("\n");
      if (ls.length > keep) out += "\n";
      c.out(out);
    });
    return st;
  },
  sort: (c) => {
    const { opts, ops, bad } = parseOpts(c.argv, "rnu");
    if (bad) { c.err(`sort: ${bad}\n`); return 2; }
    let all: string[] = [];
    for (const f of ops.length ? ops : [null]) {
      const r = readOperand(c, f);
      if (r.err) { c.err(`sort: cannot read: ${r.err}\n`); return 2; }
      all = all.concat(lines(r.text!));
    }
    const num = (s: string) => parseFloat(s) || 0;
    all.sort((a, b) => (opts.has("n") ? num(a) - num(b) || (a < b ? -1 : a > b ? 1 : 0) : a < b ? -1 : a > b ? 1 : 0));
    if (opts.has("u")) all = all.filter((v, i) => i === 0 || v !== all[i - 1]);
    if (opts.has("r")) all.reverse();
    c.out(all.map((l) => l + "\n").join(""));
    return 0;
  },
  wc: (c) => {
    const { opts, ops, bad } = parseOpts(c.argv, "lwc");
    if (bad) { c.err(`wc: ${bad}\n`); return 1; }
    const cols = opts.size ? ["l", "w", "c"].filter((x) => opts.has(x)) : ["l", "w", "c"];
    const rows: { v: number[]; name: string }[] = [];
    let st = 0;
    for (const f of ops.length ? ops : [null]) {
      const r = readOperand(c, f);
      if (r.err) { c.err(`wc: ${r.err}\n`); st = 1; continue; }
      const t = r.text!;
      const counts: Record<string, number> = {
        l: (t.match(/\n/g) || []).length,
        w: t.split(/\s+/).filter(Boolean).length,
        c: new TextEncoder().encode(t).length,
      };
      rows.push({ v: cols.map((x) => counts[x]), name: f ?? "" });
    }
    if (rows.length > 1) rows.push({ v: cols.map((_, i) => rows.reduce((s, r) => s + r.v[i], 0)), name: "total" });
    const stdinOnly = ops.length === 0;
    const width = cols.length === 1 && rows.length === 1 ? 1 : stdinOnly ? 7 : Math.max(1, ...rows.map((r) => String(Math.max(...r.v)).length));
    for (const r of rows) c.out(r.v.map((x) => String(x).padStart(width)).join(" ") + (r.name ? " " + r.name : "") + "\n");
    return st;
  },
  grep: (c) => {
    const { opts, ops, bad } = parseOpts(c.argv, "ivcnE");
    if (bad || !ops.length) {
      if (bad) c.err(`grep: ${bad}\n`);
      c.err("Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n");
      return 2;
    }
    const [pat, ...files] = ops;
    let re: RegExp;
    try {
      re = new RegExp(pat, opts.has("i") ? "i" : "");
    } catch {
      re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), opts.has("i") ? "i" : "");
    }
    let found = false, st = 0;
    const many = files.length > 1;
    for (const f of files.length ? files : [null]) {
      const r = readOperand(c, f);
      if (r.err) { c.err(`grep: ${r.err}\n`); st = 2; continue; }
      let count = 0;
      lines(r.text!).forEach((l, i) => {
        if (re.test(l) !== opts.has("v")) {
          count++;
          found = true;
          if (!opts.has("c")) c.out((many ? f + ":" : "") + (opts.has("n") ? i + 1 + ":" : "") + l + "\n");
        }
      });
      if (opts.has("c")) c.out((many ? f + ":" : "") + count + "\n");
    }
    return st || (found ? 0 : 1);
  },
  ls: (c) => {
    const { opts, ops, bad } = parseOpts(c.argv, "al1");
    if (bad) {
      c.err(`ls: ${bad}\nTry 'ls --help' for more information.\n`);
      return 2;
    }
    const tty = c.k.isatty(1);
    let st = 0;
    const targets = ops.length ? ops : ["."];
    const files: [string, Node][] = [];
    const dirs: [string, DirNode][] = [];
    for (const t of targets) {
      const n = c.k.fs.lookup(t);
      if (typeof n === "number") {
        c.err(`ls: cannot access '${t}': ${errText[-n]}\n`);
        st = 2;
      } else if (n.kind === "dir") dirs.push([t, n]);
      else files.push([t, n]);
    }
    const fmt = (entries: [string, Node][]) => {
      if (opts.has("l")) {
        return entries
          .map(([name, n]) => {
            const size = n.kind === "dir" ? 4096 : new TextEncoder().encode(n.data).length;
            const d = n.mtime;
            const when = `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
            return `${perm(n)} 1 visitor visitor ${String(size).padStart(5)} ${when} ${name}\n`;
          })
          .join("");
      }
      if (!entries.length) return "";
      if (tty && !opts.has("1")) return entries.map((e) => e[0]).join("  ") + "\n";
      return entries.map((e) => e[0] + "\n").join("");
    };
    let out = fmt(files);
    const sortKey = (s: string) => s.replace(/^\./, "").toLowerCase();
    dirs.forEach(([name, d], i) => {
      let ents: [string, Node][] = [...d.children.entries()].filter(([k]) => opts.has("a") || !k.startsWith("."));
      if (opts.has("a")) ents = [[".", d], ["..", d], ...ents];
      ents.sort((a, b) => (sortKey(a[0]) < sortKey(b[0]) ? -1 : 1));
      if (targets.length > 1) out += `${out || i ? "\n" : ""}${name}:\n`;
      if (opts.has("l")) out += `total ${ents.length * 4}\n`;
      out += fmt(ents);
    });
    c.out(out);
    return st;
  },
};
