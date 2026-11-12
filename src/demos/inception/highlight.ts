// Minimal, dependency-free highlighter for the handful of file types in this repo.
export type Lang = "dockerfile" | "nginx" | "bash" | "yaml" | "conf" | "make";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const VAR = /\$\{[A-Za-z_][A-Za-z0-9_:-]*\}|\$\([A-Z_]+\)|\$[a-z_]+\b|\$!|\$"/g;
const vars = (s: string) => esc(s).replace(new RegExp(VAR.source, "g"), (m) => `<span class="t-var">${m}</span>`);

export function langOf(path: string): Lang {
  if (/Dockerfile$/.test(path)) return "dockerfile";
  if (/nginx\.conf$/.test(path)) return "nginx";
  if (/\.sh$/.test(path)) return "bash";
  if (/\.ya?ml$/.test(path)) return "yaml";
  if (/Makefile$/.test(path)) return "make";
  return "conf";
}

const DOCKER_KW = /^(\s*)(FROM|RUN|COPY|ADD|WORKDIR|ENTRYPOINT|CMD|EXPOSE|ENV|ARG|USER|VOLUME|HEALTHCHECK)\b/;
const BASH_KW = /\b(if|then|else|fi|while|do|done|exec|echo|set|cd|mkdir|chown|chmod|sleep|wait|wp|mariadb|mariadbd|mariadb-admin|mariadb-install-db|mysqladmin|useradd|chpasswd|id)\b/g;

function body(s: string, lang: Lang): string {
  // split off strings first so we don't highlight keywords inside them
  const out: string[] = [];
  const re = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
  let last = 0, m: RegExpExecArray | null;
  const plain = (t: string) => {
    let h = vars(t);
    if (lang === "bash") h = h.replace(BASH_KW, '<span class="t-kw">$1</span>');
    h = h.replace(/(^|[\s=:(])(-{1,2}[a-zA-Z][\w-]*)/g, '$1<span class="t-flag">$2</span>');
    return h;
  };
  while ((m = re.exec(s))) {
    out.push(plain(s.slice(last, m.index)));
    out.push(`<span class="t-str">${vars(m[0])}</span>`);
    last = m.index + m[0].length;
  }
  out.push(plain(s.slice(last)));
  return out.join("");
}

export function highlightLine(line: string, lang: Lang): string {
  // comment (whole line or trailing, but not "$#" / "#" inside strings – good enough for these files)
  const c = /^(\s*)#.*/.exec(line);
  if (c) return `<span class="t-com">${esc(line)}</span>`;
  if (lang === "bash" && /^#!/.test(line)) return `<span class="t-com">${esc(line)}</span>`;
  if (lang === "dockerfile") {
    const m = DOCKER_KW.exec(line);
    if (m) return `${m[1]}<span class="t-kw">${m[2]}</span>${body(line.slice(m[0].length), lang)}`;
  }
  if (lang === "nginx") {
    const m = /^(\s*)([a-z_]+)(\b.*)$/.exec(line);
    if (m) return `${m[1]}<span class="t-kw">${m[2]}</span>${body(m[3], lang)}`;
  }
  if (lang === "yaml") {
    const m = /^(\s*)([\w.-]+)(:)(.*)$/.exec(line);
    if (m) return `${m[1]}<span class="t-kw">${esc(m[2])}</span>${m[3]}${body(m[4], lang)}`;
  }
  if (lang === "conf") {
    const m = /^(\s*)([a-z_]+)(=)(.*)$/.exec(line);
    if (m) return `${m[1]}<span class="t-kw">${m[2]}</span>${m[3]}<span class="t-str">${esc(m[4])}</span>`;
  }
  if (lang === "make") {
    const m = /^([\w-]+)(\s*[:=])(.*)$/.exec(line);
    if (m) return `<span class="t-kw">${m[1]}</span>${m[2]}${body(m[3], lang)}`;
  }
  return body(line, lang);
}

export function highlight(src: string, lang: Lang, firstLine = 1, mark: number[] = []): string {
  return src.split("\n").map((l, i) => {
    const n = firstLine + i;
    return `<span class="cl${mark.includes(n) ? " mk" : ""}" data-n="${n}">${highlightLine(l, lang) || " "}</span>`;
  }).join("");
}
