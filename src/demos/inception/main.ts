// Inception lab sheet: interactive drawing of the real docker-compose stack.
// Everything shown (services, ports, volumes, depends_on, file contents, config lines)
// is read from the repo files bundled in ./repo; nothing runs — boot and request are replays.
import { FILES, ref, type Ref } from "./files";
import { parseYaml, serviceBlock, startWaves } from "./compose";
import { highlight, langOf } from "./highlight";

const COMPOSE = "srcs/docker-compose.yml";
const compose = parseYaml(FILES[COMPOSE]);
const services: Record<string, any> = compose.services;
const NAMES = Object.keys(services);
const PROJECT = "srcs"; // compose project name = directory of the compose file
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ files per service */
const dirOf = (n: string) => "srcs/" + String(services[n].build).replace(/^\.\//, "") + "/";
const filesOf = (n: string) =>
  Object.keys(FILES).filter((f) => f.startsWith(dirOf(n)))
    .sort((a, b) => (a.endsWith("Dockerfile") ? -1 : b.endsWith("Dockerfile") ? 1 : a.localeCompare(b)));

interface Instr { op: string; arg: string; line: number }
function dockerInstrs(path: string): Instr[] {
  const out: Instr[] = []; const lines = FILES[path].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || l.trim().startsWith("#")) continue;
    const m = /^\s*([A-Z]+)\s+(.*)$/.exec(l); if (!m) continue;
    const start = i + 1; let arg = m[2];
    while (/\\\s*$/.test(arg) && i + 1 < lines.length) arg = arg.replace(/\\\s*$/, " ") + lines[++i].trim();
    out.push({ op: m[1], arg: arg.replace(/\s+/g, " ").trim(), line: start });
  }
  return out;
}

// What each container listens on — every value points at the real line it comes from.
const RQ = "srcs/requirements/";
const LISTEN: Record<string, { port: string; refs: Ref[]; role: string; proc: string }> = {
  nginx: { port: "443/tcp (TLS)", role: "TLS entrypoint", proc: "nginx", refs: [ref(RQ + "nginx/conf/nginx.conf", "listen 443 ssl"), ref(RQ + "nginx/conf/nginx.conf", "ssl_protocols")] },
  wordpress: { port: "9000/tcp (FastCGI)", role: "php-fpm 8.2 + WP-CLI", proc: "php-fpm8.2", refs: [ref(RQ + "wordpress/Dockerfile", "listen = 0.0.0.0:9000")] },
  mariadb: { port: "3306/tcp (MariaDB default)", role: "database", proc: "mariadbd", refs: [ref(RQ + "mariadb/Dockerfile", "0.0.0.0")] },
  redis: { port: "6379/tcp (Redis default)", role: "object cache", proc: "redis-server", refs: [ref(RQ + "bonus/redis/Dockerfile", "bind 0.0.0.0"), ref(RQ + "wordpress/tools/entrypoint.sh", "WP_REDIS_PORT 6379")] },
  adminer: { port: "9000/tcp (FastCGI)", role: "DB admin UI", proc: "php-fpm8.2", refs: [ref(RQ + "bonus/adminer/Dockerfile", "listen = 0.0.0.0:9000")] },
  website: { port: "443/tcp (TLS)", role: "static site", proc: "nginx", refs: [ref(RQ + "bonus/website/conf/nginx.conf", "listen 443 ssl")] },
  ftp: { port: "21/tcp + passive 21000-21010", role: "vsftpd → wp_data", proc: "vsftpd", refs: [ref(RQ + "bonus/ftp/conf/vsftpd.conf", "listen=YES"), ref(RQ + "bonus/ftp/conf/vsftpd.conf", "pasv_min_port"), ref(RQ + "bonus/ftp/conf/vsftpd.conf", "pasv_max_port")] },
  cadvisor: { port: "8080/tcp (EXPOSE)", role: "container metrics", proc: "cadvisor", refs: [ref(RQ + "bonus/cadvisor/Dockerfile", "EXPOSE 8080")] },
};

function processOf(n: string): { cmd: string; ref: Ref } {
  const df = dirOf(n) + "Dockerfile";
  const ins = dockerInstrs(df);
  const ep = ins.find((i) => i.op === "ENTRYPOINT") || ins.find((i) => i.op === "CMD")!;
  const lines = FILES[df].split("\n");
  const r: Ref = { file: df, line: ep.line, text: lines[ep.line - 1].trim() };
  const script = /\["(\/entrypoint\.sh)"\]/.exec(ep.arg);
  if (script) {
    const sp = filesOf(n).find((f) => f.endsWith("entrypoint.sh"))!;
    const ex = ref(sp, "exec ");
    return { cmd: `${script[1]} → ${ex.text}`, ref: ex };
  }
  return { cmd: ep.arg.replace(/^\[|\]$/g, "").replace(/"/g, "").replace(/,\s*/g, " "), ref: r };
}

function envVars(n: string): string[] {
  const set = new Set<string>();
  for (const f of filesOf(n)) for (const m of FILES[f].matchAll(/\$\{([A-Z_]+)[^}]*\}/g)) set.add(m[1]);
  return [...set];
}

/* ------------------------------------------------------------------ drawing */
type P = [number, number];
const W = 160, H = 64;
const POS: Record<string, P> = {
  nginx: [210, 80], website: [210, 190], ftp: [210, 300], cadvisor: [210, 400],
  wordpress: [470, 80], adminer: [470, 200], redis: [760, 80], mariadb: [760, 200],
};
const NET = { x: 160, y: 40, w: 820, h: 440 };
const VOLX: Record<string, number> = { wp_data: 440, db_data: 840 };
const VOLY = 520;

const EDGES: Record<string, P[]> = {
  "nginx>wordpress": [[370, 100], [470, 100]],
  "nginx>adminer": [[370, 124], [405, 124], [405, 236], [470, 236]],
  "wordpress>redis": [[630, 100], [760, 100]],
  "wordpress>mariadb": [[630, 124], [695, 124], [695, 220], [760, 220]],
  "adminer>mariadb": [[630, 244], [760, 244]],
  "in:nginx": [[104, 100], [210, 100]],
  "in:website": [[24, 214], [210, 214]],
  "in:ftp": [[24, 322], [210, 322]],
  "in:cadvisor": [[24, 420], [210, 420]],
};
const d = (pts: P[]) => "M" + pts.map((p) => p.join(" ")).join(" L");

function buildSvg(): string {
  const out: string[] = [];
  out.push(`<defs><marker id="inc-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1.5 L10 5 L0 8.5z" class="arrowhead"/></marker>
  <marker id="inc-ahr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1.5 L10 5 L0 8.5z" fill="var(--red)"/></marker></defs>`);
  // host column
  out.push(`<text x="14" y="30" class="sm">HOST (VM)</text><line x1="14" y1="36" x2="140" y2="36" class="ln thin"/>`);
  out.push(`<g class="inc-host"><rect x="14" y="74" width="90" height="48" class="part"/><text x="59" y="94" text-anchor="middle" class="lbl">browser</text><text x="59" y="108" text-anchor="middle" class="sm">sel-maaq.42.fr</text></g>`);
  // network
  const net = compose.networks.inception;
  out.push(`<g class="inc-net" tabindex="0" role="button" aria-label="Network inception: show docker-compose.yml and Makefile" data-kind="network">
    <rect x="${NET.x}" y="${NET.y}" width="${NET.w}" height="${NET.h}" class="ln dash inc-netbox"/>
    <rect x="${NET.x}" y="${NET.y - 14}" width="250" height="14" class="inc-nettab"/>
    <text x="${NET.x + 6}" y="${NET.y - 4}" class="sm inc-nettxt">NETWORK inception · driver: ${net.driver} · all ${NAMES.length} services</text></g>`);
  // edges (depends_on)
  for (const [k, pts] of Object.entries(EDGES)) {
    const inbound = k.startsWith("in:");
    out.push(`<path id="inc-e-${k.replace(/[:>]/g, "-")}" class="ln inc-edge${inbound ? " inc-port" : ""}" d="${d(pts)}" marker-end="url(#inc-ah)"/>`);
  }
  for (const n of NAMES) for (const dep of services[n].depends_on || []) {
    const pts = EDGES[`${n}>${dep}`]; if (!pts) continue;
    const [a, b] = pts[pts.length - 2], [c] = pts[pts.length - 1];
    out.push(`<text x="${(a + c) / 2}" y="${b - 4}" text-anchor="middle" class="sm inc-dep">depends_on</text>`);
  }
  // published ports from compose
  for (const n of NAMES) {
    const ports: string[] = services[n].ports || []; if (!ports.length) continue;
    const y = EDGES["in:" + n][0][1];
    out.push(`<rect x="${NET.x - 4}" y="${y - 4}" width="8" height="8" class="inc-tab"/>`);
    ports.forEach((p, i) => out.push(`<text x="${n === "nginx" ? 112 : 30}" y="${y - 6 - i * 11}" class="sm inc-pl">${esc(p)}</text>`));
    if (n !== "nginx") out.push(`<circle cx="24" cy="${y}" r="2.5" class="lead-dot"/>`);
  }
  // wp_data bus + db_data line (volume mounts)
  const vm = (n: string) => (services[n].volumes || []) as string[];
  const wpUsers = NAMES.filter((n) => vm(n).some((v) => v.startsWith("wp_data:")));
  const busX = VOLX.wp_data;
  const tapY: Record<string, number> = { nginx: 136, wordpress: 136, ftp: 352 };
  out.push(`<path class="ln thin dash inc-mount" d="M${busX} 136 V${VOLY}"/>`);
  for (const n of wpUsers) {
    const [x] = POS[n]; const y = tapY[n];
    const sx = x < busX ? x + W : x;
    out.push(`<path class="ln thin dash inc-mount" d="M${sx} ${y} H${busX}"/><circle cx="${busX}" cy="${y}" r="2" class="arrowhead"/>`);
  }
  out.push(`<text x="${busX + 6}" y="300" class="sm" transform="rotate(90 ${busX + 6} 300)">/var/www/html</text>`);
  out.push(`<path class="ln thin dash inc-mount" d="M${POS.mariadb[0] + W / 2} ${POS.mariadb[1] + H} V${VOLY}"/>`);
  out.push(`<text x="${POS.mariadb[0] + W / 2 + 6}" y="300" class="sm" transform="rotate(90 ${POS.mariadb[0] + W / 2 + 6} 300)">/var/lib/mysql</text>`);
  // cadvisor host mounts (ro)
  const cv = vm("cadvisor");
  out.push(`<path class="ln thin dash inc-mount" d="M210 450 H104"/><rect x="14" y="436" width="90" height="${14 + cv.length * 10}" class="part"/>`);
  out.push(`<text x="20" y="447" class="sm">host binds (ro)</text>`);
  cv.forEach((v, i) => out.push(`<text x="20" y="${459 + i * 10}" class="sm inc-tiny">${esc(v.split(":")[0])}</text>`));
  // volumes
  for (const [v, cx] of Object.entries(VOLX)) {
    const dev = compose.volumes[v].driver_opts.device;
    out.push(`<g class="inc-vol" data-kind="volume" data-name="${v}" tabindex="0" role="button" aria-label="Volume ${v}: bind mount of ${dev}">
      <path class="part" d="M${cx - 58} ${VOLY} v36 a58 9 0 0 0 116 0 v-36"/><ellipse class="part" cx="${cx}" cy="${VOLY}" rx="58" ry="9"/>
      <text x="${cx}" y="${VOLY + 30}" text-anchor="middle" class="lbl">${v}</text>
      <text x="${cx}" y="${VOLY + 62}" text-anchor="middle" class="sm">bind → ${esc(dev)}</text></g>`);
  }
  // nodes
  NAMES.forEach((n, i) => {
    const [x, y] = POS[n]; const L = LISTEN[n];
    const port = L.port.split("/")[0];
    out.push(`<g class="inc-node" data-name="${n}" data-kind="service" tabindex="0" role="button" aria-label="${n}: ${L.role}. Open its files" style="--i:${i}">
      <rect x="${x}" y="${y}" width="${W}" height="${H}" class="part inc-box"/>
      <rect x="${x}" y="${y}" width="${W}" height="16" class="inc-hd"/>
      <text x="${x + 6}" y="${y + 11.5}" class="sm inc-hdt">${String(i + 1).padStart(2, "0")} · ${services[n].image}</text>
      <circle cx="${x + W - 8}" cy="${y + 8}" r="3.2" class="inc-led"/>
      <text x="${x + 8}" y="${y + 35}" class="cond inc-nm">${n}</text>
      <text x="${x + W - 8}" y="${y + 35}" text-anchor="end" class="sm">:${port}</text>
      <text x="${x + 8}" y="${y + 52}" class="sm">${esc(L.role)}</text>
      ${services[n].privileged === "true" ? `<text x="${x + W - 8}" y="${y + 52}" text-anchor="end" class="note">privileged</text>` : ""}
    </g>`);
  });
  // legend
  out.push(`<g class="inc-legend" transform="translate(14 618)">
    <path d="M0 0 H28" class="ln" marker-end="url(#inc-ah)"/><text x="34" y="3" class="sm">depends_on</text>
    <path d="M110 0 H138" class="ln thin dash"/><text x="144" y="3" class="sm">volume mount</text>
    <rect x="232" y="-4" width="8" height="8" class="inc-tab"/><text x="246" y="3" class="sm">published port (host:container)</text>
    <text x="440" y="3" class="sm">every service: restart: always · FROM debian:bookworm · no healthcheck defined</text></g>`);
  return out.join("\n");
}

/* ------------------------------------------------------------------ side panel */
const panel = () => $("#inc-files");
let curFile = "";
function facts(n: string): [string, string][] {
  const s = services[n]; const df = dirOf(n) + "Dockerfile";
  const ins = dockerInstrs(df);
  const from = ins.find((i) => i.op === "FROM")!.arg;
  const expose = ins.filter((i) => i.op === "EXPOSE").map((i) => i.arg).join(", ");
  const hc = s.healthcheck ? "defined in compose" : ins.some((i) => i.op === "HEALTHCHECK") ? "Dockerfile HEALTHCHECK" : "none defined";
  const L = LISTEN[n]; const p = processOf(n);
  const rows: [string, string][] = [
    ["base image", `<code>${esc(from)}</code>`],
    ["build / tag", `<code>${esc(s.build)}</code> → <code>${esc(s.image)}</code>`],
    ["process", `<code>${esc(p.cmd)}</code> ${refLink(p.ref)}`],
    ["listens", `${esc(L.port)} ${L.refs.map(refLink).join(" ")}`],
    ["published", (s.ports || []).map((x: string) => `<code>${esc(x)}</code>`).join(" ") || "none (internal to <code>inception</code>)"],
    ["EXPOSE", expose ? `<code>${esc(expose)}</code>` : "none"],
    ["volumes", (s.volumes || []).map((x: string) => `<code>${esc(x)}</code>`).join("<br>") || "none"],
    ["depends_on", (s.depends_on || []).map((x: string) => `<button type="button" class="inc-chip" data-open="${x}">${x}</button>`).join(" ") || "none"],
    ["env", s.env_file ? `<code>env_file: ${esc(s.env_file.join(", "))}</code> (git-ignored, not in repo)` : "no env_file"],
    ["uses vars", envVars(n).map((v) => `<code>\${${v}}</code>`).join(" ") || "none"],
    ["restart", `<code>${esc(s.restart)}</code>${s.privileged ? ` · <code>privileged: ${s.privileged}</code>` : ""}`],
    ["healthcheck", hc + (n === "wordpress" ? " — the entrypoint polls <code>mysqladmin ping</code> instead" : "")],
  ];
  return rows;
}
function refLink(r: Ref) {
  return `<button type="button" class="inc-ref" data-file="${esc(r.file)}" data-line="${r.line}" title="${esc(r.text)}">${esc(r.file.split("/").slice(-2).join("/"))}:${r.line}</button>`;
}
function setTabsAndCode(tabs: { id: string; label: string; src: string; lang: any; first?: number; path?: string }[], file?: string, line?: number) {
  const P = panel();
  const pick = tabs.find((t) => t.path === file) || tabs[0];
  P.querySelector(".inc-tabs")!.innerHTML = tabs.map((t) => `<button type="button" role="tab" aria-selected="${t === pick}" data-tab="${t.id}">${esc(t.label)}</button>`).join("");
  const show = (t: (typeof tabs)[number], mark?: number) => {
    curFile = t.path || "";
    P.querySelectorAll<HTMLButtonElement>(".inc-tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t.id)));
    const code = P.querySelector(".inc-code")!;
    code.innerHTML = highlight(t.src, t.lang, t.first || 1, mark ? [mark] : []);
    P.querySelector(".inc-path")!.textContent = t.path ? `${t.path}${t.first && t.first > 1 ? ` (lines ${t.first}–${t.first + t.src.split("\n").length - 1})` : ""}` : "";
    const mk = code.querySelector(".mk") as HTMLElement | null;
    (code as HTMLElement).scrollTop = mk ? Math.max(0, mk.offsetTop - 60) : 0;
  };
  P.querySelectorAll<HTMLButtonElement>(".inc-tabs button").forEach((b) => b.addEventListener("click", () => show(tabs.find((t) => t.id === b.dataset.tab)!)));
  show(pick, line);
}
function openService(n: string, file?: string, line?: number) {
  select(n);
  const P = panel();
  P.querySelector(".inc-ptitle")!.innerHTML = `<span class="red">${String(NAMES.indexOf(n) + 1).padStart(2, "0")}</span> ${n} <small>${esc(LISTEN[n].role)}</small>`;
  P.querySelector(".inc-facts")!.innerHTML = facts(n).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  const blk = serviceBlock(FILES[COMPOSE], n);
  const tabs = [
    ...filesOf(n).map((f) => ({ id: f, label: f.slice(dirOf(n).length), src: FILES[f], lang: langOf(f), path: f })),
    { id: "compose", label: "compose", src: blk.text, lang: "yaml", first: blk.start, path: COMPOSE },
  ];
  setTabsAndCode(tabs, file, line);
  P.querySelector(".inc-extra")!.innerHTML = n === "website" ? `Static files under <code>conf/html/</code> (index.html, style.css, script.js) are copied in but not shown here.` : "";
  showPane("files");
}
function openWhole(kind: "network" | "volume", name?: string, file?: string, line?: number) {
  select(null);
  const P = panel();
  const title = kind === "network" ? "network <small>inception · bridge</small>" : `${name} <small>named volume · local bind</small>`;
  P.querySelector(".inc-ptitle")!.innerHTML = `<span class="red">◇</span> ${title}`;
  const users = NAMES.filter((n) => (services[n].volumes || []).some((v: string) => v.startsWith(name + ":")));
  const rows: [string, string][] = kind === "network"
    ? [["driver", `<code>${compose.networks.inception.driver}</code>`], ["members", NAMES.map((x) => `<button type="button" class="inc-chip" data-open="${x}">${x}</button>`).join(" ")], ["DNS", "containers reach each other by service name (<code>wordpress:9000</code>, <code>mariadb</code>) via Docker's embedded DNS"], ["Makefile", "<code>make</code> = <code>setup</code> (mkdir data dirs) + <code>docker-compose … up -d --build</code>"]]
    : [["driver", `<code>${compose.volumes[name!].driver}</code> · <code>type: ${compose.volumes[name!].driver_opts.type}</code> · <code>o: ${compose.volumes[name!].driver_opts.o}</code>`], ["host dir", `<code>${esc(compose.volumes[name!].driver_opts.device)}</code> (created by <code>make setup</code>)`], ["mounted by", users.map((x) => `<button type="button" class="inc-chip" data-open="${x}">${x}</button> <code>${esc(services[x].volumes.find((v: string) => v.startsWith(name + ":")))}</code>`).join("<br>")], ["survives", "<code>make down</code>; removed by <code>make clean</code> (<code>down -v</code> + <code>rm -rf</code>)"]];
  P.querySelector(".inc-facts")!.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  const mk = FILES["Makefile"].replace(/^\n/, "");
  setTabsAndCode([
    { id: "compose", label: "docker-compose.yml", src: FILES[COMPOSE], lang: "yaml", path: COMPOSE },
    { id: "make", label: "Makefile", src: mk, lang: "make", path: "Makefile", first: 2 },
  ], file, line ?? (kind === "volume" ? ref(COMPOSE, `    ${name}:`).line : undefined));
  P.querySelector(".inc-extra")!.innerHTML = "";
  showPane("files");
}
function openRef(file: string, line: number) {
  const svc = NAMES.find((n) => file.startsWith(dirOf(n)));
  if (svc) openService(svc, file, line);
  else openWhole("network", undefined, file, line);
}

/* ------------------------------------------------------------------ node state */
type St = "off" | "built" | "created" | "started" | "ready";
const state: Record<string, St> = Object.fromEntries(NAMES.map((n) => [n, "off"]));
function setSt(n: string, s: St) {
  state[n] = s;
  const g = $(`.inc-node[data-name="${n}"]`); if (g) g.setAttribute("data-st", s);
}
function select(n: string | null) {
  document.querySelectorAll(".inc-node").forEach((g) => g.classList.toggle("sel", (g as HTMLElement).dataset.name === n));
}
function hot(names: string[]) {
  document.querySelectorAll(".inc-node").forEach((g) => g.classList.toggle("hot", names.includes((g as HTMLElement).dataset.name!)));
}

/* ------------------------------------------------------------------ panes */
function showPane(p: "files" | "boot" | "trace") {
  document.querySelectorAll<HTMLButtonElement>("#inc-modes button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.pane === p)));
  document.querySelectorAll<HTMLElement>(".inc-pane").forEach((el) => (el.hidden = el.id !== `inc-${p}`));
}

/* ------------------------------------------------------------------ mini make */
function makefile() {
  const vars: Record<string, string> = {}; const rules: Record<string, { deps: string[]; cmds: string[] }> = {};
  let cur: string | null = null;
  for (const l of FILES["Makefile"].split("\n")) {
    let m;
    if ((m = /^([A-Z_]+)\s*=\s*(.*)$/.exec(l))) { vars[m[1]] = m[2].trim(); cur = null; }
    else if ((m = /^([\w-]+):\s*(.*)$/.exec(l))) { cur = m[1]; rules[cur] = { deps: m[2].split(/\s+/).filter(Boolean), cmds: [] }; }
    else if (cur && /^\t/.test(l)) rules[cur].cmds.push(l.trim().replace(/\$\(([A-Z_]+)\)/g, (_x, v) => vars[v] ?? ""));
  }
  const run = (t: string, seen = new Set<string>()): string[] => {
    if (seen.has(t) || !rules[t]) return []; seen.add(t);
    return [...rules[t].deps.flatMap((x) => run(x, seen)), ...rules[t].cmds];
  };
  return { run, vars };
}
const MAKE = makefile();

/* ------------------------------------------------------------------ terminal */
const term = () => $("#inc-term");
let runId = 0; let speed = 1;
function line(text: string, cls = "") {
  const t = term(); const s = document.createElement("span");
  s.className = "tl " + cls; s.textContent = text; t.appendChild(s);
  t.scrollTop = t.scrollHeight;
}
const pad = (s: string, n: number) => s + " ".repeat(Math.max(1, n - s.length));
const pfx = (n: string) => pad(`${n}-1`, 13) + "| ";
type Ev = { at: number; svc?: string; text?: string; cls?: string; fx?: () => void };

let stackUp = false, dataExists = false, busy = false;
function updStatus() {
  $("#inc-status").innerHTML = `stack: <b>${stackUp ? "up" : "down"}</b> · data dirs: <b>${dataExists ? "populated" : "empty"}</b>`;
}

function bootEvents(): Ev[] {
  const ev: Ev[] = []; let t = 0;
  const at = (dt: number, e: Omit<Ev, "at">) => { t += dt; ev.push({ at: t, ...e }); };
  const first = !dataExists;
  if (stackUp) {
    for (const n of NAMES) at(40, { text: ` ✔ Container ${PROJECT}-${n}-1  Running`, cls: "ok" });
    return ev;
  }
  // build: each Dockerfile, its real instructions
  at(100, { text: `[+] Building ${NAMES.length}/${NAMES.length}`, cls: "dim" });
  for (const n of NAMES) {
    const ins = dockerInstrs(dirOf(n) + "Dockerfile");
    at(60, { text: ` => [${n} internal] load build definition from Dockerfile`, cls: "dim" });
    ins.forEach((i, k) => {
      const cached = !first && i.op !== "FROM";
      const arg = i.op === "FROM" ? `docker.io/library/${i.arg}` : i.arg;
      const s = ` => ${cached ? "CACHED " : ""}[${n} ${k + 1}/${ins.length}] ${i.op} ${arg}`;
      at(first && i.op === "RUN" ? 140 : 35, { text: s.length > 96 ? s.slice(0, 95) + "…" : s, cls: i.op === "FROM" ? "" : "dim" });
    });
    at(40, { text: ` => => naming to docker.io/library/${services[n].image}`, cls: "dim", fx: () => setSt(n, "built") });
  }
  const vols = Object.keys(compose.volumes);
  const waves = startWaves(services);
  const total = 1 + (first ? vols.length : 0) + NAMES.length;
  at(120, { text: `[+] Running ${total}/${total}` });
  at(60, { text: ` ✔ Network ${PROJECT}_inception      Created`, cls: "ok" });
  if (first) vols.forEach((v) => at(50, { text: ` ✔ Volume "${PROJECT}_${v}"     Created`, cls: "ok" }));
  for (const n of NAMES) at(40, { text: ` ✔ Container ${pad(`${PROJECT}-${n}-1`, 20)} Created`, cls: "ok", fx: () => setSt(n, "created") });
  waves.forEach((w, wi) => {
    if (wi) at(80, { text: `   (depends_on: start after ${[...new Set(w.flatMap((n) => services[n].depends_on))].join(", ")})`, cls: "note" });
    for (const n of w) at(70, { text: ` ✔ Container ${pad(`${PROJECT}-${n}-1`, 20)} Started`, cls: "ok", fx: () => setSt(n, "started") });
  });
  return ev;
}

// Container output, derived from the entrypoint scripts. "↳" rows are the commands the
// script runs (the real containers don't echo them; there is no `set -x`).
function logEvents(): Ev[] {
  const first = !dataExists;
  const ev: Ev[] = [];
  const q: Record<string, { d: number; text?: string; cls?: string; fx?: () => void }[]> = {};
  const add = (n: string, d: number, text?: string, cls = "", fx?: () => void) => (q[n] ||= []).push({ d, text, cls, fx });
  const cmd = (n: string, d: number, c: string) => add(n, d, "  ↳ " + c, "cmd");
  const ready = (n: string) => () => setSt(n, "ready");
  const mdb = RQ + "mariadb/tools/entrypoint.sh", wp = RQ + "wordpress/tools/entrypoint.sh", ftp = RQ + "bonus/ftp/tools/entrypoint.sh";
  const R = (f: string, s: string) => ref(f, s).text;

  // mariadb
  add("mariadb", 60, "Starting MariaDB setup...");
  if (first) {
    add("mariadb", 80, "Initializing MariaDB database...");
    cmd("mariadb", 40, R(mdb, "mariadb-install-db"));
    add("mariadb", 700, "Installing MariaDB/MySQL system tables in '/var/lib/mysql' ...", "dim");
    add("mariadb", 500, "OK", "dim");
    add("mariadb", 80, "Starting MariaDB temporarily...");
    cmd("mariadb", 40, R(mdb, "--skip-networking"));
    add("mariadb", 600, "MariaDB is ready. Setting up users and databases...");
    for (const s of ["ALTER USER", "CREATE DATABASE", "CREATE USER", "GRANT ALL", "FLUSH PRIVILEGES"]) cmd("mariadb", 60, "SQL> " + R(mdb, s));
    add("mariadb", 200, "Shutting down setup MariaDB...");
    cmd("mariadb", 40, R(mdb, "shutdown"));
  } else add("mariadb", 120, "Database already exists, skipping initialization");
  add("mariadb", 150, "Starting MariaDB normally...");
  cmd("mariadb", 40, R(mdb, "exec mariadbd"));
  add("mariadb", 500, "[Note] mariadbd: ready for connections.", "dim");
  add("mariadb", 20, "socket: '/run/mysqld/mysqld.sock'  port: 3306", "dim", ready("mariadb"));
  const mdbTotal = q.mariadb.reduce((a, b) => a + b.d, 0);

  // wordpress (polls until mariadb answers on the network)
  add("wordpress", 30, "Waiting for MariaDB to be ready...");
  cmd("wordpress", 20, R(wp, "while ! mysqladmin ping"));
  let waited = 50;
  while (waited < mdbTotal - 300) { add("wordpress", 700, "Waiting for database connection...", "dim"); waited += 720; }
  add("wordpress", Math.max(200, mdbTotal - waited + 100), "MariaDB is ready!");
  if (first) {
    add("wordpress", 60, "Downloading WordPress...");
    cmd("wordpress", 30, R(wp, "wp core download"));
    add("wordpress", 900, "Success: WordPress downloaded.", "ok");
    add("wordpress", 60, "Creating wp-config.php...");
    cmd("wordpress", 30, 'wp config create --dbname="${MARIADB_DATABASE}" --dbuser="${MARIADB_USER}" --dbpass="${MARIADB_USER_PASSWORD}" --dbhost="${MARIADB_HOST}:3306"');
    add("wordpress", 300, "Success: Generated 'wp-config.php' file.", "ok");
    add("wordpress", 60, "Installing WordPress...");
    cmd("wordpress", 30, 'wp core install --url="${WP_URL}" --title="${WP_TITLE}" --admin_user="${WP_ADMIN_USER}" --admin_password="${WP_ADMIN_PASSWORD}" …');
    add("wordpress", 600, "Success: WordPress installed successfully.", "ok");
    add("wordpress", 60, "Creating second user...");
    cmd("wordpress", 30, 'wp user create "${WP_USER}" "${WP_USER_EMAIL}" --role=editor --user_pass="${WP_USER_PASSWORD}"');
    add("wordpress", 300, "Success: Created user 2.", "ok");
    add("wordpress", 60, "WordPress installation complete!");
  } else add("wordpress", 20, "  (wp-config.php exists on wp_data → install block skipped)", "note");
  add("wordpress", 60, '  (bonus) if [ ! -z "${REDIS_HOST:-}" ] — set in .env per DEV_DOC', "note");
  cmd("wordpress", 30, R(wp, "wp plugin install redis-cache"));
  if (first) add("wordpress", 500, "Success: Installed 1 of 1 plugins.", "ok");
  for (const k of ["WP_REDIS_HOST", "WP_REDIS_PORT", "WP_CACHE"]) {
    cmd("wordpress", 30, R(wp, `wp config set ${k}`).replace(" 2>/dev/null", ""));
    add("wordpress", 120, `Success: ${first ? "Added" : "Updated"} the constant '${k}' ${first ? "to" : "in"} the 'wp-config.php' file with the value '${k === "WP_REDIS_HOST" ? "${REDIS_HOST}" : k === "WP_REDIS_PORT" ? "6379" : "true"}'.`, "ok");
  }
  cmd("wordpress", 30, R(wp, "wp redis enable"));
  if (first) add("wordpress", 200, "Success: Object cache enabled.", "ok");
  add("wordpress", 80, "Starting PHP-FPM...");
  cmd("wordpress", 30, R(wp, "exec php-fpm8.2"), );
  add("wordpress", 200, undefined, "", ready("wordpress"));

  // ftp
  add("ftp", 40, "Setting up FTP server...");
  add("ftp", 40, "Creating FTP user: ${FTP_USER}");
  cmd("ftp", 30, R(ftp, "useradd"));
  cmd("ftp", 30, R(ftp, "chpasswd"));
  add("ftp", 80, "Starting vsftpd...");
  cmd("ftp", 30, R(ftp, "exec /usr/sbin/vsftpd"));
  add("ftp", 100, undefined, "", ready("ftp"));
  // processes that log nothing to stdout: ready once exec'd
  add("redis", 300, undefined, "", ready("redis"));
  add("website", 250, undefined, "", ready("website"));
  add("adminer", 300, undefined, "", ready("adminer"));
  add("cadvisor", 900, "Starting cAdvisor version: v0.49.1 on port 8080", "dim", ready("cadvisor"));
  // nginx starts after wordpress+adminer containers start (not after they're ready)
  add("nginx", 250, undefined, "", ready("nginx"));

  // merge per-service queues by time
  for (const [n, list] of Object.entries(q)) {
    let t = n === "wordpress" || n === "adminer" ? 150 : n === "nginx" ? 300 : 0;
    for (const e of list) { t += e.d; ev.push({ at: t, svc: n, text: e.text, cls: e.cls, fx: e.fx }); }
  }
  return ev.sort((a, b) => a.at - b.at);
}

async function play(evs: Ev[], id: number) {
  let t0 = 0;
  for (const e of evs) {
    if (id !== runId) return false;
    const dt = (e.at - t0) / speed; t0 = e.at;
    if (dt > 0 && !reduce && speed < 50) await sleep(dt);
    if (id !== runId) return false;
    if (e.text !== undefined) line((e.svc ? pfx(e.svc) : "") + e.text, e.cls);
    e.fx?.();
  }
  return true;
}

async function doMake(target: "all" | "down" | "clean") {
  if (busy) return;
  busy = true; const id = ++runId; speed = 1;
  showPane("boot"); setBtns();
  line(`$ make${target === "all" ? "" : " " + target}`, "prompt");
  const cmds = MAKE.run(target);
  if (target === "all") {
    line(cmds[0]); // mkdir -p (make setup)
    await sleep(reduce ? 0 : 200);
    line(cmds[1]);
    const ok = await play(bootEvents(), id);
    if (ok && !stackUp) {
      line(`$ docker compose -f ${COMPOSE} logs -f      # replay of what the containers print`, "prompt sub");
      await play(logEvents(), id);
    }
    NAMES.forEach((n) => setSt(n, "ready"));
    stackUp = true; dataExists = true;
    line(`# replay done: ${NAMES.length}/${NAMES.length} containers up · https://sel-maaq.42.fr  ·  :8443 site  ·  :8090 cAdvisor  ·  :21 FTP`, "note");
  } else {
    for (const c of cmds) {
      line(c);
      if (/down/.test(c)) {
        const order = startWaves(services).reverse().flat();
        if (stackUp) {
          for (const n of order) { await sleep(reduce ? 0 : 120); line(` ✔ Container ${pad(`${PROJECT}-${n}-1`, 20)} Removed`, "ok"); setSt(n, "off"); }
          line(` ✔ Network ${PROJECT}_inception      Removed`, "ok");
        }
        if (/-v/.test(c)) Object.keys(compose.volumes).forEach((v) => line(` ✔ Volume ${PROJECT}_${v}             Removed`, "ok"));
      }
      if (/rm -rf/.test(c)) { line("[sudo] password for sel-maaq: ********   (replay)", "dim"); dataExists = false; }
    }
    stackUp = false;
    NAMES.forEach((n) => setSt(n, "off"));
    if (target === "down") line(`# data kept in ${MAKE.vars.VOL_DIR} → next make skips DB init and WP install`, "note");
    else line("# containers, volumes and data dirs gone → next make is a first boot", "note");
  }
  busy = false; setBtns(); updStatus();
}
function setBtns() {
  document.querySelectorAll<HTMLButtonElement>("[data-make]").forEach((b) => (b.disabled = busy));
  $<HTMLButtonElement>("#inc-skip").disabled = !busy;
}

/* ------------------------------------------------------------------ trace a request */
interface Step { title: string; at: string[]; move?: [string, boolean?][]; refs: Ref[]; text: string; label?: string }
const NG = RQ + "nginx/conf/nginx.conf", WPE = RQ + "wordpress/tools/entrypoint.sh";
function route(kind: string, hit: boolean): Step[] {
  const tls = (svc: string, conf: string, df: string, edge: string, host: string): Step[] => [
    { title: `TCP connect → host :${host}`, at: [], move: [[edge]], label: "SYN",
      refs: [ref(COMPOSE, `"${host}:443"`)], text: `Docker publishes host port ${host} to <code>${svc}</code>:443 on the <code>inception</code> bridge.` },
    { title: "TLS handshake", at: [svc], move: [[edge, true], [edge]], label: "TLSv1.3",
      refs: [ref(conf, "listen 443 ssl"), ref(conf, "ssl_protocols"), ref(conf, "ssl_certificate "), ref(df, "-subj")],
      text: `ClientHello offers TLS 1.3 → ServerHello picks <b>TLSv1.3</b> (only 1.2 and 1.3 are allowed; 1.0/1.1 clients are refused). The certificate is self-signed at image build (<code>openssl req -x509 … -days 365</code>), so the browser shows a warning first.` },
  ];
  if (kind === "site") {
    const conf = RQ + "bonus/website/conf/nginx.conf";
    return [
      ...tls("website", conf, RQ + "bonus/website/Dockerfile", "in:website", "8443"),
      { title: "GET / → static file", at: ["website"], refs: [ref(conf, "root /var/www/html"), ref(conf, "try_files"), ref(RQ + "bonus/website/Dockerfile", "COPY conf/html")],
        text: "No PHP here: nginx serves <code>index.html</code> straight from files baked into the image. Unknown paths get <code>=404</code>." },
      { title: "HTTP/1.1 200 OK ← index.html", at: ["website"], move: [["in:website", true]], label: "200", refs: [], text: "Response goes back over the same TLS connection (<code>listen 443 ssl</code> without <code>http2</code> → HTTP/1.1)." },
    ];
  }
  if (kind === "adminer") {
    return [
      ...tls("nginx", NG, RQ + "nginx/Dockerfile", "in:nginx", "443"),
      { title: "POST /adminer/ → location /adminer/", at: ["nginx"], refs: [ref(NG, "location /adminer/"), ref(NG, "/var/www/html/adminer/index.php"), ref(NG, "fastcgi_pass adminer:9000")],
        text: "Prefix match on <code>/adminer/</code>. The script path is fixed to Adminer's single <code>index.php</code>, which lives inside the adminer image, not on wp_data." },
      { title: "FastCGI → adminer:9000", at: ["adminer"], move: [["nginx>adminer"]], label: "FCGI", refs: [ref(RQ + "bonus/adminer/Dockerfile", "listen = 0.0.0.0:9000"), ref(RQ + "bonus/adminer/Dockerfile", "adminer.org/latest.php")],
        text: "php-fpm in the adminer container runs the downloaded <code>latest.php</code>." },
      { title: "login → mariadb:3306", at: ["mariadb"], move: [["adminer>mariadb"]], label: "3306", refs: [ref(RQ + "mariadb/Dockerfile", "0.0.0.0"), ref(RQ + "mariadb/tools/entrypoint.sh", "CREATE USER")],
        text: "The login form's server field is <code>mariadb</code> (per USER_DOC); credentials are the ones from <code>.env</code> — shown here only as <code>${MARIADB_USER}</code>. The user was created for host <code>'%'</code>, so connections from other containers are allowed." },
      { title: "result ← back to the browser", at: ["nginx"], move: [["adminer>mariadb", true], ["nginx>adminer", true], ["in:nginx", true]], label: "200", refs: [], text: "mariadb → php-fpm (adminer) → nginx → browser, HTTP/1.1 200 over TLS." },
    ];
  }
  const steps: Step[] = [
    ...tls("nginx", NG, RQ + "nginx/Dockerfile", "in:nginx", "443"),
    { title: "GET / → try_files", at: ["nginx"], refs: [ref(NG, "root /var/www/html"), ref(NG, "location / {"), ref(NG, "try_files")],
      text: "<code>/</code> isn't a static file in <code>/var/www/html</code> (nginx's view of wp_data), so it's rewritten internally to <code>/index.php</code>." },
    { title: "\\.php$ → fastcgi_pass wordpress:9000", at: ["nginx"], refs: [ref(NG, "location ~ \\.php$"), ref(NG, "fastcgi_pass wordpress:9000"), ref(NG, "SCRIPT_FILENAME $document_root")],
      text: "<code>wordpress</code> resolves through Docker's embedded DNS on <code>inception</code>. <code>SCRIPT_FILENAME</code> is nginx's path — it exists in the php container too because both mount <code>wp_data:/var/www/html</code>." },
    { title: "php-fpm runs index.php", at: ["wordpress"], move: [["nginx>wordpress"]], label: "FCGI", refs: [ref(RQ + "wordpress/Dockerfile", "listen = 0.0.0.0:9000"), ref(WPE, "exec php-fpm8.2")],
      text: "The pool was switched from a Unix socket to TCP 0.0.0.0:9000 at build time so nginx can reach it from another container." },
    { title: `object cache → redis:6379 (${hit ? "HIT" : "MISS"})`, at: ["redis"], move: [["wordpress>redis"], ["wordpress>redis", true]], label: hit ? "HIT" : "MISS",
      refs: [ref(WPE, "wp plugin install redis-cache"), ref(WPE, "WP_REDIS_HOST"), ref(WPE, "WP_REDIS_PORT 6379"), ref(WPE, "WP_CACHE true")],
      text: hit ? "The <code>redis-cache</code> drop-in finds the cached objects (e.g. autoloaded options) in Redis, so those queries never reach MariaDB." : "Cold cache: Redis has nothing for these keys yet, so WordPress falls through to MariaDB." },
  ];
  if (!hit) steps.push(
    { title: "query → mariadb:3306", at: ["mariadb"], move: [["wordpress>mariadb"]], label: "SQL", refs: [ref(WPE, '--dbhost="${MARIADB_HOST}:3306"'), ref(RQ + "mariadb/Dockerfile", "0.0.0.0"), ref(RQ + "mariadb/tools/entrypoint.sh", "GRANT ALL")],
      text: "e.g. WordPress core's <code>SELECT option_name, option_value FROM wp_options WHERE autoload = 'yes'</code>, as <code>${MARIADB_USER}</code> on <code>${MARIADB_DATABASE}</code>. MariaDB was rebound from 127.0.0.1 to 0.0.0.0 so other containers can connect." },
    { title: "rows ← mariadb · SET → redis", at: ["redis"], move: [["wordpress>mariadb", true], ["wordpress>redis"]], label: "SET", refs: [ref(RQ + "bonus/redis/Dockerfile", "maxmemory 256mb"), ref(RQ + "bonus/redis/Dockerfile", "allkeys-lru")],
      text: "The object cache stores the results in Redis (capped at 256 MB, LRU eviction) so the next request is a hit." },
  );
  else steps.push({ title: "mariadb skipped for cached objects", at: ["wordpress"], refs: [], text: "Queries for uncached data would still go to <code>mariadb:3306</code>; the cached ones are answered from memory." });
  steps.push({ title: "HTTP/1.1 200 OK ← HTML", at: ["nginx"], move: [["nginx>wordpress", true], ["in:nginx", true]], label: "200", refs: [],
    text: "php-fpm → nginx → browser over the same TLS session. nginx has no <code>http2</code> on its <code>listen</code>, so this is HTTP/1.1." });
  return steps;
}

let tracing = 0;
const dot = () => $<SVGGElement>("#inc-dot");
async function moveAlong(edge: string, rev: boolean, label: string, id: number) {
  const path = $<SVGPathElement>(`#inc-e-${edge.replace(/[:>]/g, "-")}`);
  path.classList.add("lit");
  const len = path.getTotalLength(); const g = dot();
  g.querySelector("text")!.textContent = label;
  g.style.display = "";
  const dur = reduce ? 0 : Math.max(450, len * 4);
  const t0 = performance.now();
  await new Promise<void>((res) => {
    const f = (now: number) => {
      if (id !== tracing) return res();
      const k = dur ? Math.min(1, (now - t0) / dur) : 1;
      const p = path.getPointAtLength((rev ? 1 - k : k) * len);
      g.setAttribute("transform", `translate(${p.x} ${p.y})`);
      if (k < 1) requestAnimationFrame(f); else res();
    };
    requestAnimationFrame(f);
  });
}
async function trace() {
  const id = ++tracing;
  const kind = ($<HTMLSelectElement>("#inc-route")).value;
  const hit = ($<HTMLInputElement>("#inc-hit")).checked;
  const steps = route(kind, hit);
  showPane("trace");
  const list = $("#inc-hops"); list.innerHTML = "";
  document.querySelectorAll(".inc-edge.lit").forEach((e) => e.classList.remove("lit"));
  hot([]);
  const req = kind === "site" ? "GET https://sel-maaq.42.fr:8443/" : kind === "adminer" ? "POST https://sel-maaq.42.fr/adminer/" : "GET https://sel-maaq.42.fr/";
  $("#inc-req").textContent = req;
  for (let i = 0; i < steps.length; i++) {
    if (id !== tracing) return;
    const s = steps[i];
    const li = document.createElement("li");
    li.innerHTML = `<div class="hop-t"><b>${String(i + 1).padStart(2, "0")}</b> ${esc(s.title)}</div><p>${s.text}</p>${s.refs.length ? `<div class="hop-refs">${s.refs.map((r) => `<div>${refLink(r)}<code>${esc(r.text)}</code></div>`).join("")}</div>` : ""}`;
    list.appendChild(li); li.classList.add("cur");
    list.querySelectorAll("li").forEach((x) => x !== li && x.classList.remove("cur"));
    li.scrollIntoView({ block: "nearest" });
    hot(s.at);
    for (const [e, rev] of s.move || []) await moveAlong(e, !!rev, s.label || "", id);
    if (!reduce) await sleep(900);
  }
  if (id === tracing) { dot().style.display = "none"; $("#inc-hops").insertAdjacentHTML("beforeend", `<li class="end"><i>end of trace · replay of the real config, not a live request</i></li>`); }
}

/* ------------------------------------------------------------------ wire up */
export function init() {
  const svg = $<SVGSVGElement>("#inc-svg");
  svg.innerHTML = buildSvg() + `<g id="inc-dot" style="display:none"><circle r="6" class="inc-dotc"/><text y="-10" text-anchor="middle" class="note inc-dotl"></text></g>`;
  NAMES.forEach((n) => setSt(n, "off"));
  const act = (el: Element) => {
    const h = el as HTMLElement;
    if (h.dataset.kind === "service") openService(h.dataset.name!);
    else if (h.dataset.kind === "volume") openWhole("volume", h.dataset.name);
    else openWhole("network");
  };
  svg.querySelectorAll("[data-kind]").forEach((el) => {
    el.addEventListener("click", (e) => { e.stopPropagation(); act(el); });
    el.addEventListener("keydown", (e) => { const k = (e as KeyboardEvent).key; if (k === "Enter" || k === " ") { e.preventDefault(); act(el); } });
  });
  // service quick-list (handy on narrow screens)
  $("#inc-list").innerHTML = NAMES.map((n) => `<button type="button" class="inc-chip" data-open="${n}">${n}</button>`).join("") + `<button type="button" class="inc-chip" data-net>network + Makefile</button>`;
  document.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest("button"); if (!t) return;
    if (t.dataset.open) openService(t.dataset.open);
    else if (t.hasAttribute("data-net")) openWhole("network");
    else if (t.dataset.file) openRef(t.dataset.file, +t.dataset.line!);
  });
  document.querySelectorAll<HTMLButtonElement>("#inc-modes button").forEach((b) => b.addEventListener("click", () => showPane(b.dataset.pane as any)));
  document.querySelectorAll<HTMLButtonElement>("[data-make]").forEach((b) => b.addEventListener("click", () => doMake(b.dataset.make as any)));
  $("#inc-skip").addEventListener("click", () => { speed = 1000; });
  $("#inc-clear").addEventListener("click", () => { term().innerHTML = ""; });
  $("#inc-go").addEventListener("click", trace);
  $("#inc-route").addEventListener("change", () => { $<HTMLInputElement>("#inc-hit").disabled = $<HTMLSelectElement>("#inc-route").value !== "wp"; });
  setBtns(); updStatus();
  openService("nginx");
  line("# replay terminal — press make to watch the stack come up (nothing actually runs)", "note");
}
