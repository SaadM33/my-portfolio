// Real files copied verbatim from github.com/SaadM33/inception (commit 36836f0).
// The repo's .env is git-ignored and was never present, so no secret values exist here;
// scripts only reference ${VAR} placeholders. `redact` is a belt-and-braces guard anyway.
const raw = import.meta.glob("./repo/**/*", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export const FILES: Record<string, string> = {};
for (const [k, v] of Object.entries(raw)) FILES[k.replace("./repo/", "")] = redact(v);

/** Replace any literal secret-looking assignment with a ${VAR} placeholder. */
export function redact(src: string): string {
  return src.replace(
    /^(\s*-?\s*)([A-Z_]*(PASSWORD|PASS|SECRET|TOKEN|KEY)[A-Z_]*)\s*=\s*(?!\$)(\S+)$/gm,
    (_m, pre, name) => `${pre}${name}=\${${name}}`,
  );
}

export interface Ref { file: string; line: number; text: string }
/** Find the 1-based line in a real file that contains `needle` (throws if the config doesn't contain it). */
export function ref(file: string, needle: string): Ref {
  const src = FILES[file];
  if (src == null) throw new Error(`inception demo: missing file ${file}`);
  const lines = src.split("\n");
  const i = lines.findIndex((l) => l.includes(needle));
  if (i < 0) throw new Error(`inception demo: "${needle}" not found in ${file}`);
  return { file, line: i + 1, text: lines[i].trim() };
}
