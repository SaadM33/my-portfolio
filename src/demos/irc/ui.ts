/**
 * In-page wiring for the ft_irc lab: client panes, the poll() diagram, the event log,
 * the state tables and the scripted tour. The server itself lives in ./server.ts.
 */
import { Server, type Trace } from "./server";

const PASS = "pass42";
const PORT = 6667;

type Seg = [string, string?]; // [text, className]

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = () => window.matchMedia("(max-width: 900px)").matches;
const clock = () => { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
const show = (s: string) => s.replace(/\r\n$/, "").replace(/\r/g, "\\r").replace(/\n/g, "\\n");

/** client-side line parser (what a real IRC client does with what the server sends) */
function parseLine(line: string) {
  let prefix = "";
  let rest = line;
  if (rest.startsWith(":")) {
    const sp = rest.indexOf(" ");
    prefix = sp === -1 ? rest.slice(1) : rest.slice(1, sp);
    rest = sp === -1 ? "" : rest.slice(sp + 1);
  }
  let trailing: string | null = null;
  const ti = rest.indexOf(" :");
  if (ti !== -1) { trailing = rest.slice(ti + 2); rest = rest.slice(0, ti); }
  else if (rest.startsWith(":")) { trailing = rest.slice(1); rest = ""; }
  const words = rest.split(" ").filter(Boolean);
  const command = (words.shift() ?? "").toUpperCase();
  const nick = prefix.split("!")[0];
  const uh = prefix.includes("!") ? prefix.slice(prefix.indexOf("!") + 1) : "";
  return { prefix, nick, uh, command, params: words, trailing };
}

// ------------------------------------------------------------------ panes
abstract class Pane {
  fd = -1;
  log: HTMLElement;
  input: HTMLInputElement;
  fdEl: HTMLElement;
  history: string[] = [];
  hIdx = 0;
  constructor(public id: string, public root: HTMLElement, protected app: App) {
    this.log = $("[data-log]", root);
    this.input = $<HTMLInputElement>("[data-input]", root);
    this.fdEl = $("[data-fd]", root);
    $<HTMLFormElement>("[data-form]", root).addEventListener("submit", (e) => {
      e.preventDefault();
      if (this.app.touring) return;
      const v = this.input.value;
      this.input.value = "";
      if (v.trim() !== "") { this.history.push(v); }
      this.hIdx = this.history.length;
      this.submit(v);
    });
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" && this.hIdx > 0) { this.hIdx--; this.input.value = this.history[this.hIdx]; e.preventDefault(); }
      else if (e.key === "ArrowDown" && this.hIdx < this.history.length) { this.hIdx++; this.input.value = this.history[this.hIdx] ?? ""; e.preventDefault(); }
    });
  }
  get connected() { return this.fd !== -1; }
  line(segs: Seg[], cls = "") {
    const div = document.createElement("div");
    div.className = "l " + cls;
    for (const [t, c] of segs) {
      const s = document.createElement("span");
      if (c) s.className = c;
      s.textContent = t;
      div.appendChild(s);
    }
    const stick = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 40;
    this.log.appendChild(div);
    while (this.log.childElementCount > 400) this.log.firstElementChild!.remove();
    if (stick) this.log.scrollTop = this.log.scrollHeight;
    this.app.pingTab(this.id);
  }
  setFd(fd: number) {
    this.fd = fd;
    this.fdEl.textContent = fd === -1 ? "closed" : "fd " + fd;
    this.fdEl.classList.toggle("off", fd === -1);
    this.app.updateNode(this);
  }
  transmit(data: string) {
    if (!this.connected) return false;
    this.app.srv.write(this.fd, data);
    this.app.kick();
    return true;
  }
  open() {
    this.app.connecting = this;
    const fd = this.app.srv.connect();
    this.app.connecting = null;
    this.app.fdOwner.set(fd, this);
    this.setFd(fd);
    this.app.kick();
  }
  abstract submit(v: string): void;
  abstract receive(data: string): void;
  abstract closed(why: string): void;
  abstract reset(): void;
  abstract label(): string;
}

class NcPane extends Pane {
  crlf: HTMLInputElement;
  constructor(id: string, root: HTMLElement, app: App) {
    super(id, root, app);
    this.crlf = $<HTMLInputElement>("[data-crlf]", root);
    $("[data-connect]", root).addEventListener("click", () => { if (!this.app.touring) this.connectBtn(); });
    $("[data-close]", root).addEventListener("click", () => { if (!this.app.touring) this.hangup(); });
  }
  label() { return "nc"; }
  reset() { this.log.textContent = ""; this.setFd(-1); this.buttons(); }
  buttons() {
    ($("[data-connect]", this.root) as HTMLButtonElement).disabled = this.connected;
    ($("[data-close]", this.root) as HTMLButtonElement).disabled = !this.connected;
    this.input.placeholder = this.connected ? "raw line, e.g. PASS " + PASS : "not connected: press CONNECT";
  }
  connectBtn() {
    if (this.connected) return;
    this.line([["$ nc -C localhost " + PORT, "dim"]]);
    this.open();
    this.buttons();
  }
  hangup() {
    if (!this.connected) return;
    this.line([["^C", "dim"]]);
    this.app.srv.hangup(this.fd);
    this.app.kick();
  }
  submit(v: string) {
    if (!this.connected) { this.line([["(not connected: press CONNECT)", "dim"]]); return; }
    const eol = this.crlf.checked ? "\r\n" : "\n";
    this.line([[v, "raw-out"], [this.crlf.checked ? "␍␊" : "␊", "eol"]]);
    this.transmit(v + eol);
  }
  receive(data: string) {
    // nc prints exactly what arrives; show the line ending explicitly
    for (const part of data.split(/(?<=\r\n)/)) {
      if (part === "") continue;
      this.line([[part.replace(/\r\n$/, ""), "raw-in"], [part.endsWith("\r\n") ? "␍␊" : "", "eol"]]);
    }
  }
  closed() { this.line([["(connection closed by server)", "dim"]]); this.buttons(); }
}

class IrssiPane extends Pane {
  nick: string;
  chans = new Map<string, Map<string, boolean>>(); // channel -> nick -> isOp
  active: string | null = null;
  rbuf = "";
  chipsEl: HTMLElement;
  promptEl: HTMLElement;
  constructor(id: string, root: HTMLElement, app: App, public baseNick: string) {
    super(id, root, app);
    this.nick = baseNick;
    this.chipsEl = $("[data-chips]", root);
    this.promptEl = $("[data-prompt]", root);
  }
  label() { return this.nick; }
  reset() {
    this.log.textContent = "";
    this.chans.clear(); this.active = null; this.rbuf = ""; this.nick = this.baseNick;
    this.setFd(-1); this.renderChips();
  }
  info(segs: Seg[], tag?: string, cls = "") {
    const head: Seg[] = [[clock(), "ts"]];
    if (tag) head.push([tag, "tg"]);
    this.line([...head, ["-!- ", "dim"], ...segs], cls);
  }
  renderChips() {
    this.chipsEl.textContent = "";
    const mk = (name: string, key: string | null) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = name;
      b.setAttribute("aria-pressed", String(this.active === key));
      b.addEventListener("click", () => { this.active = key; this.renderChips(); this.input.focus(); });
      this.chipsEl.appendChild(b);
    };
    mk("(status)", null);
    for (const c of this.chans.keys()) mk(c, c);
    this.promptEl.textContent = `[${this.active ?? "(status)"}]`;
  }

  connect(pass = PASS) {
    if (this.connected) { this.info([["Already connected (use /quit first)", "inf"]]); return; }
    this.chans.clear(); this.active = null; this.rbuf = ""; this.renderChips();
    this.info([["Connecting to localhost [127.0.0.1] port " + PORT, "inf"]]);
    this.open();
    // what irssi writes right after connect()
    this.transmit(`CAP LS 302\r\nPASS ${pass}\r\nNICK ${this.nick}\r\nUSER ${this.baseNick} ${this.baseNick} localhost :${this.baseNick}\r\n`);
  }
  raw(line: string) { return this.transmit(line + "\r\n"); }

  submit(v: string) {
    if (v.trim() === "") return;
    if (!v.startsWith("/")) {
      if (!this.active) { this.info([["Not joined to any channel (use /join #name, or click a window)", "inf"]]); return; }
      if (!this.connected) { this.info([["Not connected to server (type /connect)", "err"]]); return; }
      this.raw(`PRIVMSG ${this.active} :${v}`);
      this.line([[clock(), "ts"], [this.active, "tg"], ["<", "dim"], [(this.chans.get(this.active)?.get(this.nick) ? "@" : "") + this.nick, "me"], ["> ", "dim"], [v]]);
      return;
    }
    const sp = v.indexOf(" ");
    const cmd = (sp === -1 ? v.slice(1) : v.slice(1, sp)).toLowerCase();
    const rest = sp === -1 ? "" : v.slice(sp + 1).trim();
    const args = rest.split(/\s+/).filter(Boolean);
    const chanArg = () => (args[0]?.startsWith("#") ? args.shift()! : this.active);
    const need = (c: string | null) => { if (!c) { this.info([["Not joined to any channel", "inf"]]); return false; } return true; };

    if (cmd === "help") {
      this.info([["/join #c [key] · /part [#c] [msg] · /msg <nick|#c> <text> · /topic [#c] [text] · /mode [#c] <+-modes> [args] · /kick [#c] <nick> [reason] · /invite <nick> [#c] · /nick <new> · /ping · /quote <raw line> · /quit [msg] · /connect [password] · /clear · plain text goes to the active window", "inf"]]);
      return;
    }
    if (cmd === "clear") { this.log.textContent = ""; return; }
    if (cmd === "window" || cmd === "w") {
      const t = args[0] ?? null;
      if (t === null || t === "status") this.active = null;
      else if (this.chans.has(t)) this.active = t;
      this.renderChips();
      return;
    }
    if (cmd === "connect" || cmd === "server") { this.connect(args[args.length - 1] && args.length >= 1 && !/^(localhost|127\.0\.0\.1|\d+)$/.test(args[args.length - 1]) ? args[args.length - 1] : PASS); return; }
    if (!this.connected) { this.info([["Not connected to server (type /connect)", "err"]]); return; }

    switch (cmd) {
      case "join": case "j": {
        if (!args.length) { this.info([["Not enough parameters given", "inf"]]); return; }
        const chans = args[0].split(",").map((c) => (c && !c.startsWith("#") ? "#" + c : c)).join(",");
        this.raw(`JOIN ${chans}${args[1] ? " " + args[1] : ""}`);
        return;
      }
      case "part": case "leave": {
        const c = chanArg(); if (!need(c)) return;
        this.raw(`PART ${c}${args.length ? " :" + args.join(" ") : ""}`);
        return;
      }
      case "msg": case "query": {
        const t = args.shift();
        const text = rest.slice(rest.indexOf(" ") + 1);
        if (!t || !args.length) { this.info([["Not enough parameters given", "inf"]]); return; }
        this.raw(`PRIVMSG ${t} :${text}`);
        if (t.startsWith("#")) this.line([[clock(), "ts"], [t, "tg"], ["<", "dim"], [this.nick, "me"], ["> ", "dim"], [text]]);
        else this.line([[clock(), "ts"], ["[msg(", "dim"], [t, "nk"], [")] ", "dim"], [text, "tx-out"]]);
        return;
      }
      case "topic": {
        const c = chanArg(); if (!need(c)) return;
        this.raw(args.length ? `TOPIC ${c} :${args.join(" ")}` : `TOPIC ${c}`);
        return;
      }
      case "mode": {
        if (args[0] && !args[0].startsWith("#") && !args[0].startsWith("+") && !args[0].startsWith("-")) { this.raw(`MODE ${args.join(" ")}`); return; }
        const c = chanArg(); if (!need(c)) return;
        this.raw(`MODE ${c}${args.length ? " " + args.join(" ") : ""}`);
        return;
      }
      case "kick": case "k": {
        const c = chanArg(); if (!need(c)) return;
        const n = args.shift();
        if (!n) { this.info([["Not enough parameters given", "inf"]]); return; }
        this.raw(`KICK ${c} ${n}${args.length ? " :" + args.join(" ") : ""}`);
        return;
      }
      case "invite": {
        const n = args.shift();
        const c = args[0] ?? this.active;
        if (!n || !need(c)) return;
        this.raw(`INVITE ${n} ${c}`);
        return;
      }
      case "nick": { if (args[0]) this.raw(`NICK ${args[0]}`); return; }
      case "ping": { this.raw(`PING ${args[0] ?? "localhost"}`); return; }
      case "quote": case "raw": { if (rest) this.raw(rest); return; }
      case "quit": case "exit": case "bye": { this.raw(`QUIT :${rest || "leaving"}`); return; }
      default:
        // irssi forwards unknown commands to the server verbatim
        this.raw(cmd.toUpperCase() + (rest ? " " + rest : ""));
    }
  }

  receive(data: string) {
    this.rbuf += data;
    let i: number;
    while ((i = this.rbuf.indexOf("\r\n")) !== -1) {
      const l = this.rbuf.slice(0, i);
      this.rbuf = this.rbuf.slice(i + 2);
      this.handle(l);
    }
  }

  private names(c: string) { let m = this.chans.get(c); if (!m) { m = new Map(); this.chans.set(c, m); } return m; }
  private who(nick: string, c: string) { return (this.chans.get(c)?.get(nick) ? "@" : "") + nick; }

  private handle(raw: string) {
    const m = parseLine(raw);
    const p = m.params;
    const T = m.trailing ?? "";
    const self = m.nick === this.nick;
    const ts: Seg = [clock(), "ts"];
    switch (m.command) {
      case "CAP":
        if (p[1] === "LS") this.raw("CAP END"); // irssi ends capability negotiation
        return;
      case "001":
        this.nick = p[0];
        this.info([[T, "inf"]]);
        return;
      case "332": this.info([["Topic for ", "inf"], [p[1], "nk"], [": " + T]], p[1]); return;
      case "331": this.info([[p[1] + ": " + T, "inf"]], p[1]); return;
      case "353": {
        const c = p[2];
        const map = this.names(c);
        map.clear();
        const segs: Seg[] = [[ "[Users " + c + "] ", "inf"]];
        for (const n of T.split(" ").filter(Boolean)) {
          map.set(n.replace(/^@/, ""), n.startsWith("@"));
          segs.push([n, n.startsWith("@") ? "me" : "nk"], [" "]);
        }
        this.line([ts, [c, "tg"], ...segs]);
        return;
      }
      case "366": return;
      case "324": this.info([["mode/", "inf"], [p[1], "nk"], [" [" + p.slice(2).join(" ") + "]", "inf"]], p[1]); return;
      case "341": this.info([["Inviting ", "inf"], [p[1], "nk"], [" to " + p[2], "inf"]], p[2]); return;
      case "JOIN": {
        const c = p[0] ?? T;
        this.names(c).set(m.nick, this.names(c).get(m.nick) ?? false);
        if (self) { this.active = c; this.renderChips(); }
        this.info([[m.nick, "nk"], [" [" + m.uh + "]", "dim"], [" has joined " + c, "inf"]], c);
        return;
      }
      case "PART": {
        const c = p[0];
        this.info([[m.nick, "nk"], [" [" + m.uh + "]", "dim"], [" has left " + c + (T ? " [" + T + "]" : ""), "inf"]], c);
        this.chans.get(c)?.delete(m.nick);
        if (self) this.leave(c);
        return;
      }
      case "KICK": {
        const [c, victim] = p;
        this.info([[victim, "nk"], [" was kicked from " + c + " by ", "inf"], [m.nick, "nk"], [" [" + T + "]", "inf"]], c, victim === this.nick ? "err" : "");
        this.chans.get(c)?.delete(victim);
        if (victim === this.nick) this.leave(c);
        return;
      }
      case "QUIT": {
        const where = [...this.chans.entries()].filter(([, mm]) => mm.has(m.nick)).map(([c]) => c);
        this.info([[m.nick, "nk"], [" [" + m.uh + "]", "dim"], [" has quit [" + T + "]", "inf"]], where[0]);
        for (const c of where) this.chans.get(c)!.delete(m.nick);
        return;
      }
      case "NICK": {
        const nn = T || p[0];
        for (const mm of this.chans.values()) if (mm.has(m.nick)) { const op = mm.get(m.nick)!; mm.delete(m.nick); mm.set(nn, op); }
        if (self) { this.nick = nn; this.info([["You're now known as ", "inf"], [nn, "me"]]); }
        else this.info([[m.nick, "nk"], [" is now known as ", "inf"], [nn, "nk"]]);
        return;
      }
      case "MODE": {
        const c = p[0];
        if (T.startsWith("Unknown mode")) { this.info([[c + " " + (p[1] ?? "") + ": " + T, "err"]], c); return; }
        // track +o/-o for the nick list
        const modes = p[1] ?? ""; let on = true; let ai = 2;
        for (const ch of modes) {
          if (ch === "+") on = true; else if (ch === "-") on = false;
          else if (ch === "o") { const n = p[ai++]; if (n) this.chans.get(c)?.set(n, on); }
          else if (ch === "k" || (ch === "l" && on)) ai++;
        }
        this.info([["mode/", "inf"], [c, "nk"], [" [" + p.slice(1).join(" ") + "] by ", "inf"], [m.nick, "nk"]], c);
        return;
      }
      case "TOPIC":
        this.info([[m.nick, "nk"], [" changed the topic of " + p[0] + " to: ", "inf"], [T]], p[0]);
        return;
      case "INVITE":
        this.info([[m.nick, "nk"], [" invites you to ", "inf"], [p[1], "nk"]]);
        return;
      case "PRIVMSG": {
        const t = p[0];
        if (m.nick === "artbot") { this.line([ts, [t, "tg"], ["<artbot> ", "dim"], [T]], "art"); return; }
        if (t.startsWith("#") || t.startsWith("@#")) {
          const c = t.replace(/^@/, "");
          this.line([ts, [t, "tg"], ["<", "dim"], [this.who(m.nick, c), "nk"], ["> ", "dim"], [T]]);
        } else this.line([ts, ["<", "dim"], [m.nick, "nk"], ["(" + m.uh + ")", "dim"], ["> ", "dim"], [T]]);
        return;
      }
      case "PONG": this.info([["PONG " + T, "inf"]]); return;
      case "ERROR": this.info([["ERROR " + T, "err"]]); return;
    }
    if (/^\d{3}$/.test(m.command)) {
      // numeric errors: ":localhost <code> <nick> [middle] :<text>"
      const middle = p.slice(1).join(" ");
      this.info([[m.command + " ", "dim"], [(middle ? middle + ": " : "") + T, m.command >= "400" ? "err" : "inf"]]);
      return;
    }
    this.info([[raw, "dim"]]);
  }
  private leave(c: string) {
    this.chans.delete(c);
    if (this.active === c) this.active = [...this.chans.keys()][0] ?? null;
    this.renderChips();
  }
  closed(why: string) {
    this.info([["Connection lost to localhost" + (why ? " (" + why + ")" : ""), "err"]]);
    this.info([["Type /connect to reconnect, or /connect <password> to try another password", "inf"]]);
    this.chans.clear(); this.active = null; this.renderChips();
  }
}

// ------------------------------------------------------------------ app
interface QItem { ev: Trace; pane: Pane | null }

class App {
  srv!: Server;
  panes: Pane[] = [];
  fdOwner = new Map<number, Pane>();
  connecting: Pane | null = null;
  queue: QItem[] = [];
  running = false;
  touring = false;
  tourStop = false;
  private drainWaiters: (() => void)[] = [];
  logEl = $("#irc-log");
  handlerEl = $("#irc-handler");
  pfdsEl = $("#irc-pfds");
  dots = $("#irc-dots") as unknown as SVGGElement;
  capEl = $("#irc-cap");
  capDefault = this.capEl.innerHTML;

  constructor() {
    for (const el of document.querySelectorAll<HTMLElement>("#irc [data-pane]")) {
      const id = el.dataset.pane!;
      this.panes.push(id === "nc" ? new NcPane(id, el, this) : new IrssiPane(id, el, this, id));
    }
    for (const t of document.querySelectorAll<HTMLButtonElement>("#irc [data-tab]")) {
      t.addEventListener("click", () => this.selectTab(t.dataset.tab!));
      t.addEventListener("keydown", (e) => {
        const tabs = [...document.querySelectorAll<HTMLButtonElement>("#irc [data-tab]")];
        const i = tabs.indexOf(t);
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
          this.selectTab(n.dataset.tab!); n.focus(); e.preventDefault();
        }
      });
    }
    $("#irc-reset").addEventListener("click", () => { this.stopTour(); this.boot(); });
    $("#irc-tour").addEventListener("click", () => (this.touring ? this.stopTour() : this.tour()));
    $("#irc-clearlog").addEventListener("click", () => (this.logEl.textContent = ""));
    this.boot();
  }

  pane(id: string) { return this.panes.find((p) => p.id === id)!; }

  selectTab(id: string) {
    for (const t of document.querySelectorAll<HTMLButtonElement>("#irc [data-tab]")) {
      const on = t.dataset.tab === id;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on) t.classList.remove("ping");
    }
    for (const p of this.panes) p.root.classList.toggle("on", p.id === id);
  }
  pingTab(id: string) {
    const t = document.querySelector<HTMLElement>(`#irc [data-tab="${id}"]`);
    if (t && t.getAttribute("aria-selected") !== "true") t.classList.add("ping");
  }

  boot() {
    this.queue = [];
    this.fdOwner.clear();
    this.dots.textContent = "";
    this.logEl.textContent = "";
    this.srv = new Server(PORT, PASS, (t) => this.onTrace(t));
    this.logRow([["Server is listening on port " + PORT, "c"]]);
    for (const p of this.panes) p.reset();
    for (const p of this.panes) {
      if (p instanceof IrssiPane) p.connect();
      else (p as NcPane).connectBtn();
    }
    this.renderPfds(-1);
    this.renderTables();
  }

  // ---- trace plumbing: resolve owners synchronously, animate later ----
  onTrace(ev: Trace) {
    let pane: Pane | null = null;
    if (ev.k === "accept") pane = this.connecting;
    else pane = this.fdOwner.get(ev.fd) ?? null;
    if (ev.k === "close") {
      this.fdOwner.delete(ev.fd);
      if (pane) { pane.fd = -1; }
    }
    this.queue.push({ ev, pane });
  }
  kick() { if (!this.running) this.step(); }
  drained() { return new Promise<void>((r) => (this.running || this.queue.length ? this.drainWaiters.push(r) : r())); }

  private step() {
    const it = this.queue.shift();
    if (!it) {
      this.running = false;
      this.handlerEl.textContent = "waiting · -1";
      for (const n of document.querySelectorAll("#irc-svg .hot")) n.classList.remove("hot");
      this.renderPfds(-1);
      this.renderTables();
      const w = this.drainWaiters; this.drainWaiters = []; w.forEach((f) => f());
      return;
    }
    this.running = true;
    const fast = reduceMotion();
    const scale = this.queue.length > 40 ? 0.25 : this.queue.length > 15 ? 0.55 : 1;
    const d = this.play(it) * scale;
    if (fast || d === 0) this.step();
    else window.setTimeout(() => this.step(), d);
  }

  /** apply one trace event to the UI; returns how long to dwell on it (ms) */
  private play({ ev, pane }: QItem): number {
    const nodeId = (fd: number, p: Pane | null) => (fd === 3 ? "listen" : p?.id ?? "");
    switch (ev.k) {
      case "poll":
        this.hot(nodeId(ev.fd, pane), "POLLIN" + (ev.fd === 3 ? " → accept()" : ""));
        this.renderPfds(ev.fd);
        if (ev.fd === 3) this.logRow([["poll() → ", "p"], ["fd 3 POLLIN", "r"], [" · listening socket", "p"]], "p");
        return 0;
      case "accept":
        this.logRow([["  acceptClient(): accept() = fd " + ev.fd + " · fcntl(O_NONBLOCK) · poll_fds.push_back", "c"]]);
        if (pane) this.updateNode(pane, ev.fd);
        this.renderPfds(3);
        this.pulse("listen", "in");
        return 380;
      case "recv":
        this.logRow([["poll() → ", "p"], ["fd " + ev.fd + " POLLIN", "r"], [" · recv() = " + ev.bytes + (ev.bytes === 0 ? " (peer closed)" : " B"), "p"]], "p");
        if (pane) this.pulse(pane.id, "in");
        return 420;
      case "buffer":
        this.logRow([["  r_buffer[fd " + ev.fd + "] keeps \"" + show(ev.pending) + "\" · no \\r\\n yet", "x"]]);
        return 200;
      case "cmd":
        this.handlerEl.textContent = ev.handler.replace("processCmd → ", "→ ");
        this.hot("poll", "");
        this.logRow([["  " + ev.handler + "  ", "c"], [show(ev.line), "q"]]);
        this.renderTables();
        return 170;
      case "send": {
        const dst = pane?.id ?? "";
        this.hot(dst, "send()");
        this.logRow([["    send(fd " + ev.fd + (pane ? " " + pane.label() : "") + ") ", "s"], [show(ev.data), "q"]], "s");
        if (dst) this.pulse(dst, "out");
        pane?.receive(ev.data);
        return 230;
      }
      case "close":
        this.logRow([["  disconnectClient(fd " + ev.fd + ") · " + ev.why + " · close() · poll_fds.erase", "x"]]);
        if (pane) { pane.setFd(-1); pane.closed(ev.why); }
        this.renderPfds(-1);
        this.renderTables();
        return 300;
    }
  }

  // ---- diagram ----
  private hot(id: string, label: string) {
    for (const n of document.querySelectorAll("#irc-svg .hot")) n.classList.remove("hot");
    if (!id) return;
    if (id === "poll") { $("#n-poll").classList.add("hot"); return; }
    const g = document.getElementById("n-" + id);
    if (!g) return;
    g.classList.add("hot");
    document.getElementById("w-" + id)?.classList.add("hot");
    $("#n-poll").classList.add("hot");
    const ev = g.querySelector("[data-ev]");
    if (ev && label) ev.textContent = label;
  }
  private pulse(id: string, dir: "in" | "out") {
    if (reduceMotion()) return;
    const w = document.getElementById("w-" + id) as unknown as SVGLineElement | null;
    if (!w) return;
    const x1 = +w.getAttribute("x1")!, y1 = +w.getAttribute("y1")!, x2 = +w.getAttribute("x2")!, y2 = +w.getAttribute("y2")!;
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("r", "3.6");
    c.setAttribute("class", "dot");
    this.dots.appendChild(c);
    const t0 = performance.now();
    const dur = 300;
    const tick = (t: number) => {
      let k = Math.min(1, (t - t0) / dur);
      if (dir === "out") k = 1 - k;
      c.setAttribute("cx", String(x1 + (x2 - x1) * k));
      c.setAttribute("cy", String(y1 + (y2 - y1) * k));
      if (t - t0 < dur) requestAnimationFrame(tick);
      else c.remove();
    };
    requestAnimationFrame(tick);
  }
  updateNode(p: Pane, fd = p.fd) {
    const g = document.getElementById("n-" + p.id);
    if (!g) return;
    g.classList.toggle("off", fd === -1);
    g.querySelector("[data-t1]")!.textContent = fd === -1 ? "closed" : "fd " + fd;
    g.querySelector("[data-t2]")!.textContent = p instanceof IrssiPane ? p.baseNick + " · irssi" : "nc -C";
  }
  private renderPfds(hotFd: number) {
    this.pfdsEl.textContent = "";
    this.srv.poll_fds.forEach((fd, i) => {
      const d = document.createElement("div");
      d.className = "pfd-cell" + (fd === hotFd ? " hot" : "");
      const who = fd === 3 ? "listen" : this.fdOwner.get(fd)?.label() ?? "";
      d.innerHTML = `<small>[${i}] ${who}</small><b>fd ${fd}</b> POLLIN<br><span class="rv">revents ${fd === hotFd ? "POLLIN" : "0"}</span>`;
      this.pfdsEl.appendChild(d);
    });
  }

  // ---- log ----
  logRow(segs: [string, string][], cls = "") {
    const li = document.createElement("li");
    li.className = cls;
    for (const [t, c] of segs) {
      const s = document.createElement("span");
      s.className = c;
      s.textContent = t;
      li.appendChild(s);
    }
    const stick = this.logEl.scrollHeight - this.logEl.scrollTop - this.logEl.clientHeight < 40;
    this.logEl.appendChild(li);
    while (this.logEl.childElementCount > 300) this.logEl.firstElementChild!.remove();
    if (stick) this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  // ---- tables ----
  renderTables() {
    const td = (text: string, cls = "") => { const e = document.createElement("td"); e.textContent = text; if (cls) e.className = cls; return e; };
    const ch = $("#irc-chans");
    ch.textContent = "";
    const chans = [...this.srv.channels.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
    if (!chans.length) { const tr = document.createElement("tr"); tr.appendChild(td("no channels (JOIN creates one; the last member leaving deletes it)", "empty")).colSpan = 7; ch.appendChild(tr); }
    for (const c of chans) {
      const tr = document.createElement("tr");
      tr.appendChild(td(c.name));
      const mem = document.createElement("td");
      [...c.members.entries()].sort((a, b) => a[0] - b[0]).forEach(([fd, cl], i) => {
        const s = document.createElement("span");
        s.textContent = (i ? " " : "") + (c.operators.has(fd) ? "@" : "") + cl.nickName;
        if (c.operators.has(fd)) s.className = "op";
        mem.appendChild(s);
      });
      tr.appendChild(mem);
      const modes = (c.isInviteOnly ? "i" : "") + (c.topicRestricted ? "t" : "") + (c.isKeySet ? "k" : "") + (c.membersLimit !== -1 ? "l" : "");
      tr.appendChild(td(modes ? "+" + modes : "—"));
      tr.appendChild(td(c.topic || "—", "wrap"));
      tr.appendChild(td(c.isKeySet ? c.key : "—"));
      tr.appendChild(td(c.membersLimit !== -1 ? String(c.membersLimit) : "—"));
      tr.appendChild(td(c.inviteList.length ? c.inviteList.map((f) => "fd " + f).join(", ") : "—"));
      ch.appendChild(tr);
    }
    const cl = $("#irc-clients");
    cl.textContent = "";
    for (const [fd, c] of [...this.srv.clients.entries()].sort((a, b) => a[0] - b[0])) {
      const tr = document.createElement("tr");
      tr.appendChild(td(String(fd)));
      tr.appendChild(td(c.nickName));
      tr.appendChild(td(c.userName || "—"));
      tr.appendChild(td([c.has_pass, c.has_nick, c.has_user].map((b) => (b ? "■" : "□")).join(" ")));
      tr.appendChild(td(c.isRegistered ? "yes" : "no", c.isRegistered ? "" : "op"));
      tr.appendChild(td(c.r_buffer ? '"' + show(c.r_buffer) + '"' : "—", c.r_buffer ? "buf" : ""));
      cl.appendChild(tr);
    }
  }

  // ---- scripted tour ----
  stopTour() {
    if (!this.touring) return;
    this.tourStop = true;
  }
  private sleep(ms: number) { return new Promise((r) => setTimeout(r, reduceMotion() ? Math.min(ms, 250) : ms)); }

  async tour() {
    const btn = $<HTMLButtonElement>("#irc-tour");
    this.touring = true;
    this.tourStop = false;
    btn.textContent = "■ Stop tour";
    for (const p of this.panes) p.input.readOnly = true;
    this.boot();
    await this.drained();
    type Step = [string, string, string];
    const steps: Step[] = [
      ["alice", "/join #general", "JOIN creates #general; the first member becomes operator (@alice)."],
      ["bob", "/join #general", "bob joins: JOIN is broadcast to every member, bob gets 353/366."],
      ["bob", "hi alice", "PRIVMSG #general is sent to every member except the sender."],
      ["alice", "/topic poll() and chill", "TOPIC with a trailing sets it and broadcasts to the channel."],
      ["nc", "JOIN #general", "A raw client that has not registered gets 451 for anything but PASS/NICK/USER/CAP."],
      ["nc", "PASS wrong", "Wrong password: 464, then the server disconnects the fd."],
      ["nc", "@connect", "nc reconnects. accept() hands out the lowest free descriptor again."],
      ["nc", "PASS pass42", "Correct password: has_pass is set, nothing is sent back."],
      ["nc", "NICK eve", "NICK alone does not register: USER is still missing."],
      ["nc", "USER eve 0 * :Eve", "PASS + NICK + USER: registerClient() sends 001."],
      ["alice", "/mode +k hunter2", "Operator sets a channel key: MODE #general +k hunter2 is broadcast."],
      ["nc", "JOIN #general", "No key given: 475 Cannot join channel (+k)."],
      ["nc", "JOIN #general hunter2", "Right key: eve joins and receives the topic (332) and names (353)."],
      ["nc", "PRIVMSG #general :hello from netcat", "Raw PRIVMSG reaches both irssi clients."],
      ["alice", "/mode +o bob", "+o makes bob an operator too."],
      ["bob", "/kick eve bye", "bob can now KICK; the KICK line goes to every member, eve included."],
      ["alice", "/mode +i", "+i: invite-only."],
      ["nc", "JOIN #general hunter2", "Even with the key: 473 Cannot join channel (+i)."],
      ["bob", "/invite eve", "An operator INVITEs eve: 341 to bob, INVITE line to eve, fd added to inviteList."],
      ["nc", "JOIN #general hunter2", "Invited and keyed: eve is back in, and her fd leaves inviteList."],
      ["nc", "MODE #general", "MODE with no change returns 324 with the current modes and arguments."],
      ["bob", "!artbot", "The bonus bot: art is sent back to the sender only."],
      ["nc", "QUIT :bye", "QUIT is broadcast to eve's channels, then ERROR and disconnectClient()."],
    ];
    let n = 0;
    for (const [id, text, cap] of steps) {
      if (this.tourStop) break;
      n++;
      this.capEl.innerHTML = "";
      const b = document.createElement("b"); b.textContent = `Step ${n}/${steps.length} · `;
      this.capEl.append(b, cap);
      const p = this.pane(id);
      if (isMobile()) this.selectTab(id);
      if (text === "@connect") { (p as NcPane).connectBtn(); }
      else {
        p.input.value = "";
        if (!reduceMotion()) {
          for (const ch of text) { if (this.tourStop) break; p.input.value += ch; await this.sleep(28); }
        }
        p.input.value = "";
        if (this.tourStop) break;
        p.submit(text);
      }
      await this.drained();
      await this.sleep(1100);
    }
    this.touring = false;
    btn.textContent = "▶ Scripted tour";
    for (const p of this.panes) p.input.readOnly = false;
    if (this.tourStop) this.capEl.innerHTML = this.capDefault;
    else { this.capEl.innerHTML = ""; const b = document.createElement("b"); b.textContent = "Tour done · "; this.capEl.append(b, "the server state is yours now: type into any pane, or press Reset server."); }
  }
}

export function mount() {
  if (!document.getElementById("irc")) return;
  new App();
}
