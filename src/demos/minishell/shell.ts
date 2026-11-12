// Glue between the WebAssembly build of the real minishell C code and the
// simulated kernel. The C code does the lexing, syntax check, parsing into
// t_cmd/t_token lists, heredoc/redirection handling, $VAR/$? expansion, the
// builtins, PATH lookup and exec_child()'s dup2 dance. JS plays the OS:
// fork (a copy of the fd table), pipe, execve (the simulated programs),
// waitpid, and the terminal (readline).
import { Fs, Kernel, makeFs, programs, descLabel, HOME, EACCES, ENOEXEC } from "./kernel";

export type Tok = { arg: string | null; type: number; append: number };
export type CmdSnap = { tokens: Tok[]; inFd: number; outFd: number; skip: number; inLabel: string; outLabel: string };
export type Stage = {
  idx: number;
  pid: number;
  argv: string[];
  kind: "builtin-shell" | "builtin-child" | "external" | "skipped";
  path?: string;
  stdin: string;
  stdout: string;
  events: string[];
  exit: number | null;
};
export type Snapshot = {
  line: string;
  tokens: Tok[];
  lexQuote: string;
  syntaxError: boolean;
  empty: boolean;
  diag: string;
  parsed: Tok[][] | null;
  resolved: CmdSnap[] | null;
  expanded: string[][] | null;
  plan: Stage[] | null;
  status: number | null;
};
export type RunResult = { needMore?: boolean; exited?: number; snap?: Snapshot };

class ExitSignal {
  constructor(public code: number) {}
}
class NeedMore {}

const PROMPT = "Megashell> ";
const dec = new TextDecoder();
const enc = new TextEncoder();
const ENV = [
  "SHELL=/bin/bash",
  "USER=visitor",
  "LOGNAME=visitor",
  "HOME=" + HOME,
  "LANG=C.UTF-8",
  "TERM=xterm-256color",
  "PATH=/usr/local/bin:/usr/bin:/bin",
  "PWD=" + HOME,
];

export class MiniShell {
  fs = new Fs(makeFs());
  k!: Kernel;
  ex: any;
  mem!: WebAssembly.Memory;
  sp!: WebAssembly.Global;
  DATA = 0;
  mode: "prompt" | "heredoc" | "exited" = "prompt";
  line = "";
  hdQueue: (string | null)[] = [];
  hdIdx = 0;
  eofFlag = false;
  cur: Snapshot | null = null;
  last: Snapshot | null = null;
  pidSeq = 4200;
  log: string[] | null = null;
  lastExec: string | null = null;

  constructor(private wasm: BufferSource, private write: (t: string, fd: number) => void) {}

  static async create(wasm: BufferSource, write: (t: string, fd: number) => void) {
    const s = new MiniShell(wasm, write);
    await s.boot();
    return s;
  }

  get prompt() {
    return this.mode === "heredoc" ? "> " : PROMPT;
  }

  async boot() {
    this.k = new Kernel(this.fs, (t, fd) => {
      if (this.cur && fd === 2) this.cur.diag += t;
      this.write(t, fd);
    });
    const { instance } = await WebAssembly.instantiate(this.wasm, this.imports() as any);
    this.ex = instance.exports;
    this.mem = this.ex.memory;
    this.sp = this.ex.__stack_pointer;
    this.DATA = this.ex.get_data();
    const ptrs = ENV.map((e) => this.putStr(e));
    const envp = this.ex.malloc(4 * (ptrs.length + 1));
    const dv = new DataView(this.mem.buffer);
    ptrs.forEach((p, i) => dv.setUint32(envp + 4 * i, p, true));
    dv.setUint32(envp + 4 * ptrs.length, 0, true);
    this.mode = "prompt";
    this.ex.ms_init(envp);
  }

  // ---------- wasm memory helpers ----------
  private u32(p: number) { return new DataView(this.mem.buffer).getUint32(p, true); }
  private i32(p: number) { return new DataView(this.mem.buffer).getInt32(p, true); }
  private cstr(p: number) {
    const b = new Uint8Array(this.mem.buffer);
    let e = p;
    while (b[e]) e++;
    return dec.decode(b.subarray(p, e));
  }
  private putStr(s: string) {
    const b = enc.encode(s);
    const p = this.ex.malloc(b.length + 1);
    const m = new Uint8Array(this.mem.buffer);
    m.set(b, p);
    m[p + b.length] = 0;
    return p;
  }
  private tokens(p: number): Tok[] {
    const out: Tok[] = [];
    while (p) {
      const a = this.u32(p);
      out.push({ arg: a ? this.cstr(a) : null, type: this.i32(p + 4), append: this.i32(p + 8) });
      p = this.u32(p + 12);
    }
    return out;
  }
  private cmds() {
    const out: { ptr: number; list: number; inFd: number; outFd: number; skip: number; next: number }[] = [];
    let p = this.u32(this.DATA + 24);
    while (p) {
      out.push({ ptr: p, list: this.u32(p), inFd: this.i32(p + 4), outFd: this.i32(p + 8), skip: this.i32(p + 12), next: this.u32(p + 16) });
      p = this.u32(p + 16);
    }
    return out;
  }
  private fdLabel(fd: number) {
    return fd < 0 ? "closed (open failed)" : descLabel(this.k.fds[fd]);
  }

  // ---------- imports: the "kernel" the C code calls ----------
  private imports() {
    const k = () => this.k;
    const env = {
      js_write: (fd: number, p: number, n: number) => k().write(fd, dec.decode(new Uint8Array(this.mem.buffer, p, n))) < 0 ? -1 : n,
      js_open: (p: number, fl: number) => k().open(this.cstr(p), fl),
      js_close: (fd: number) => k().close(fd),
      js_dup: (fd: number) => k().dup(fd),
      js_dup2: (a: number, b: number) => {
        this.log?.push(`dup2(${a}, ${b})   ${b} now → ${descLabel(k().fds[a])}`);
        return k().dup2(a, b);
      },
      js_access: (p: number, mode: number) => {
        const n = k().fs.lookup(this.cstr(p));
        if (typeof n === "number") return n;
        if (mode & 1 && !(n.mode & 0o100)) return -EACCES;
        return 0;
      },
      js_stat: (p: number, sb: number) => {
        const n = k().fs.lookup(this.cstr(p));
        if (typeof n === "number") return n;
        new DataView(this.mem.buffer).setUint32(sb, (n.kind === "dir" ? 0o40000 : 0o100000) | n.mode, true);
        return 0;
      },
      js_getcwd: (buf: number, size: number) => {
        const b = enc.encode(k().fs.cwd);
        if (b.length + 1 > size) return -1;
        const m = new Uint8Array(this.mem.buffer);
        m.set(b, buf);
        m[buf + b.length] = 0;
        return b.length;
      },
      js_chdir: (p: number) => {
        const n = k().fs.lookup(this.cstr(p));
        if (typeof n === "number") return n;
        if (n.kind !== "dir") return -20;
        k().fs.cwd = k().fs.abs(this.cstr(p));
        return 0;
      },
      js_execve: (p: number, argvp: number, _envp: number) => {
        const path = this.cstr(p);
        const argv: string[] = [];
        for (let i = 0; this.u32(argvp + 4 * i); i++) argv.push(this.cstr(this.u32(argvp + 4 * i)));
        this.log?.push(`execve("${path}", [${argv.map((a) => JSON.stringify(a)).join(", ")}])`);
        this.lastExec = path;
        const n = k().fs.lookup(path);
        if (typeof n === "number") return n;
        if (n.kind === "dir" || !(n.mode & 0o100)) return -EACCES;
        if (!n.prog) return -ENOEXEC;
        const st = programs[n.prog]({
          argv,
          k: k(),
          out: (s) => void k().write(1, s),
          err: (s) => void k().write(2, s),
        });
        throw new ExitSignal(st);
      },
      js_exit: (c: number) => {
        throw new ExitSignal(c);
      },
      js_memfd: (p: number, n: number) => k().memfd(dec.decode(new Uint8Array(this.mem.buffer, p, n))),
      js_readline: (pp: number) => {
        const pr = this.cstr(pp);
        if (pr === PROMPT) return this.eofFlag ? 0 : this.putStr(this.line);
        if (this.hdIdx >= this.hdQueue.length) throw new NeedMore();
        const v = this.hdQueue[this.hdIdx++];
        return v === null ? 0 : this.putStr(v);
      },
      js_snapshot: (stage: number, lexres: number) => this.snapshot(stage, lexres),
    };
    return { env };
  }

  private snapshot(stage: number, lexres: number) {
    const s = this.cur!;
    if (stage === 1) {
      s.tokens = this.tokens(this.u32(this.DATA + 12));
      s.lexQuote = lexres ? String.fromCharCode(lexres & 0xff) : "";
    } else if (stage === 2) {
      s.parsed = this.cmds().map((c) => this.tokens(c.list));
    } else if (stage === 3) {
      s.resolved = this.cmds().map((c) => ({
        tokens: this.tokens(c.list),
        inFd: c.inFd,
        outFd: c.outFd,
        skip: c.skip,
        inLabel: c.inFd === 0 ? "stdin (tty)" : this.fdLabel(c.inFd),
        outLabel: c.outFd === 1 ? "stdout (tty)" : this.fdLabel(c.outFd),
      }));
    } else if (stage === 4) {
      s.expanded = this.cmds().map((c) => this.tokens(c.list).map((t) => t.arg ?? ""));
    }
  }

  // ---------- user input ----------
  submit(line: string): RunResult {
    if (this.mode === "exited") return { exited: 0 };
    this.eofFlag = false;
    if (this.mode === "heredoc") this.hdQueue.push(line);
    else {
      this.line = line;
      this.hdQueue = [];
    }
    return this.run();
  }

  // Ctrl-D
  eof(): RunResult {
    if (this.mode === "exited") return { exited: 0 };
    if (this.mode === "heredoc") {
      this.hdQueue.push(null);
      return this.run();
    }
    this.eofFlag = true;
    return this.run();
  }

  // Ctrl-C
  sigint() {
    if (this.mode === "exited") return;
    if (this.mode === "heredoc") {
      this.ex.ms_heredoc_sigint();
      this.k.write(1, "\n");
      this.mode = "prompt";
      this.hdQueue = [];
    } else {
      this.ex.ms_sigint();
    }
  }

  private run(): RunResult {
    this.hdIdx = 0;
    const fds = [...this.k.fds];
    const code = this.ex.ms_get_exit_code();
    const cwd = this.fs.cwd;
    const sp = this.sp.value;
    const snap: Snapshot = {
      line: this.line, tokens: [], lexQuote: "", syntaxError: false, empty: false, diag: "",
      parsed: null, resolved: null, expanded: null, plan: null, status: null,
    };
    this.cur = snap;
    try {
      const r = this.ex.ms_parse_front();
      if (r === 0) return { snap: undefined };
      if (r < 0) {
        snap.syntaxError = snap.tokens.length > 0 || !!snap.lexQuote;
        snap.empty = !snap.syntaxError;
        snap.status = this.ex.ms_get_exit_code();
        this.mode = "prompt";
        if (snap.empty) return {};
        this.last = snap;
        return { snap };
      }
      const ok = this.ex.ms_parse_back();
      if (ok) this.execute(snap);
      this.ex.ms_done();
      snap.status = this.ex.ms_get_exit_code();
      this.mode = "prompt";
      this.last = snap;
      return { snap };
    } catch (e) {
      this.sp.value = sp;
      if (e instanceof NeedMore) {
        // the heredoc needs another line from the user: undo this attempt,
        // it is replayed (same input + the new line) when the line arrives
        this.k.fds = fds;
        this.fs.cwd = cwd;
        this.ex.ms_set_exit_code(code);
        this.ex.ms_done();
        this.mode = "heredoc";
        return { needMore: true };
      }
      if (e instanceof ExitSignal) {
        this.mode = "exited";
        return { exited: e.code };
      }
      throw e;
    } finally {
      this.cur = null;
    }
  }

  // ---------- execution: mirrors full_execution() / pipe_and_fork() ----------
  private execute(snap: Snapshot) {
    const cmds = this.cmds();
    const ex = this.ex;
    const argvOf = (i: number) => snap.expanded?.[i] ?? [];
    const plan: Stage[] = [];
    snap.plan = plan;
    const first = cmds[0];
    if (ex.ms_is_builtin(first.ptr) && !first.next && !first.skip) {
      const st: Stage = {
        idx: 0, pid: 4100, argv: argvOf(0), kind: "builtin-shell",
        stdin: first.inFd !== 0 ? this.fdLabel(first.inFd) : "tty",
        stdout: first.outFd !== 1 ? this.fdLabel(first.outFd) : "tty",
        events: [], exit: null,
      };
      plan.push(st);
      this.log = st.events;
      try {
        ex.ms_single_builtin(first.ptr);
      } finally {
        this.log = null;
      }
      st.exit = ex.ms_get_exit_code();
      return;
    }
    const pipeAddr = ex.malloc(8);
    let prev = -1;
    cmds.forEach((c, i) => {
      const hasNext = !!c.next;
      let w = -1, r = -1, pid = -1;
      if (hasNext) {
        [r, w, { id: pid }] = this.k.pipe();
        const dv = new DataView(this.mem.buffer);
        dv.setInt32(pipeAddr, r, true);
        dv.setInt32(pipeAddr + 4, w, true);
      }
      const pipeId = hasNext ? pid : -1;
      if (!c.skip) {
        const builtin = !!ex.ms_is_builtin(c.ptr);
        const st: Stage = {
          idx: i, pid: ++this.pidSeq, argv: argvOf(i), kind: builtin ? "builtin-child" : "external",
          stdin: c.inFd !== 0 ? this.fdLabel(c.inFd) : prev !== -1 ? this.fdLabel(prev) : "tty",
          stdout: c.outFd !== 1 ? this.fdLabel(c.outFd) : hasNext ? this.fdLabel(w) : "tty",
          events: [], exit: null,
        };
        plan.push(st);
        // fork(): the child gets a copy of the fd table, environment and cwd
        const parentFds = this.k.fds;
        const cwd = this.fs.cwd;
        const sp = this.sp.value;
        this.k.fds = [...parentFds];
        ex.ms_fork_enter();
        this.log = st.events;
        this.lastExec = null;
        let status = 1;
        try {
          ex.ms_exec_child(c.ptr, prev, pipeAddr);
        } catch (e) {
          if (e instanceof ExitSignal) status = e.code;
          else throw e;
        } finally {
          this.sp.value = sp;
          this.log = null;
          this.k.fds = parentFds;
          this.fs.cwd = cwd;
          ex.ms_fork_leave();
        }
        st.exit = status;
        if (this.lastExec) st.path = this.lastExec;
        st.events.push(`exit(${status})`);
        if (!hasNext) {
          ex.ms_set_exit_code(status);
        }
      } else {
        plan.push({
          idx: i, pid: 0, argv: argvOf(i), kind: "skipped", stdin: "—", stdout: "—",
          events: ["redirection failed: command skipped (skip_cmd = 1)"], exit: null,
        });
        if (cmds[0].next && !hasNext && !c.list && c.inFd === -1) ex.ms_set_exit_code(0);
      }
      void pipeId;
      if (prev !== -1) this.k.close(prev);
      if (hasNext) this.k.close(w);
      prev = hasNext ? r : -1;
    });
  }
}
