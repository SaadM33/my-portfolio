// Tiny indentation-based YAML reader: enough for this repo's docker-compose.yml
// (nested maps, lists of scalars, quoted scalars). Not a general YAML parser.
type Y = string | null | Y[] | { [k: string]: Y };
interface L { ind: number; txt: string }

export function parseYaml(src: string): any {
  const lines: L[] = src.split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => ({ ind: l.length - l.replace(/^\s+/, "").length, txt: l.trim() }));
  let i = 0;
  const scalar = (s: string) => s.replace(/^["'](.*)["']$/, "$1");
  function block(ind: number): Y {
    if (lines[i].txt.startsWith("- ")) {
      const out: Y[] = [];
      while (i < lines.length && lines[i].ind === ind && lines[i].txt.startsWith("- ")) out.push(scalar(lines[i++].txt.slice(2).trim()));
      return out;
    }
    const out: { [k: string]: Y } = {};
    while (i < lines.length && lines[i].ind === ind && !lines[i].txt.startsWith("- ")) {
      const m = /^([^:]+):\s*(.*)$/.exec(lines[i].txt)!;
      i++;
      if (m[2]) out[m[1]] = scalar(m[2]);
      else out[m[1]] = i < lines.length && lines[i].ind > ind ? block(lines[i].ind) : null;
    }
    return out;
  }
  return block(lines[0].ind);
}

/** Lines [start,end] (1-based, inclusive) of one service block in the compose text. */
export function serviceBlock(src: string, name: string): { start: number; text: string } {
  const lines = src.split("\n");
  const s = lines.findIndex((l) => new RegExp(`^\\s{4}${name}:\\s*$`).test(l));
  let e = s + 1;
  while (e < lines.length && (lines[e].trim() === "" || /^\s{5,}/.test(lines[e]))) e++;
  while (e > s && lines[e - 1].trim() === "") e--;
  return { start: s + 1, text: lines.slice(s, e).join("\n") };
}

/** Group services into start "waves" from depends_on (what compose waits for before starting). */
export function startWaves(services: Record<string, any>): string[][] {
  const done = new Set<string>(); const waves: string[][] = [];
  const names = Object.keys(services);
  while (done.size < names.length) {
    const w = names.filter((n) => !done.has(n) && (services[n].depends_on || []).every((d: string) => done.has(d)));
    if (!w.length) throw new Error("depends_on cycle");
    w.forEach((n) => done.add(n)); waves.push(w);
  }
  return waves;
}
