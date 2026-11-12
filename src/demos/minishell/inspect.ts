// Renders the "inspection" panel: how the real minishell processed the last
// command line, stage by stage, from the data structures read out of WASM.
import type { Snapshot, Tok, Stage } from "./shell";

const TYPE = ["DF", "SQ", "DQ", "OP", "PP"];
const TYPE_HELP = ["default word", "single-quoted", "double-quoted", "redirection operator", "pipe"];

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const vis = (s: string) => esc(s).replace(/ /g, "&nbsp;") || "&empty;";

// group tokens into words (tokens joined by append=1) and operators + target
type Item = { op?: string; word: Tok[] };
function group(tokens: Tok[]): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let op: string | undefined;
    if (t.type === 3) {
      op = t.arg ?? "";
      i++;
      if (i >= tokens.length) {
        items.push({ op, word: [] });
        break;
      }
    }
    const word: Tok[] = [];
    for (; i < tokens.length; i++) {
      word.push(tokens[i]);
      if (!tokens[i].append) break;
    }
    items.push({ op, word });
  }
  return items;
}
const raw = (w: Tok[]) =>
  w.map((t) => (t.type === 2 ? `"${t.arg ?? ""}"` : t.type === 1 ? `'${t.arg ?? ""}'` : (t.arg ?? ""))).join("");

function tokenChips(tokens: Tok[]) {
  return (
    '<div class="chips">' +
    tokens
      .map((t, i) => {
        const kind = TYPE[t.type] ?? "?";
        const glue = t.append && i < tokens.length - 1 ? '<span class="glue" title="append = 1: joined to the next token by the expander">⌒</span>' : "";
        return `<span class="chip t-${kind}" title="type ${t.type} · ${TYPE_HELP[t.type] ?? ""}${t.append ? " · append=1" : ""}"><code>${vis(t.arg ?? "(null)")}</code><i>${kind}</i></span>${glue}`;
      })
      .join("") +
    "</div>"
  );
}

function stageBox(n: number, name: string, fn: string, body: string, off = false) {
  return `<section class="st${off ? " off" : ""}"><header><span class="no">${n}</span><b>${name}</b><code>${fn}</code></header><div class="body">${body}</div></section>`;
}

function statusClass(n: number | null) {
  return n === 0 ? "ok" : "bad";
}

function stageCard(s: Stage, pipes: { in?: string; out?: string }) {
  const argv = s.argv.length ? s.argv.map((a) => `<code>${vis(a)}</code>`).join(" ") : "<code>(none)</code>";
  const kind =
    s.kind === "builtin-shell"
      ? "builtin · runs in the shell process (no fork), fds saved with dup() and restored"
      : s.kind === "builtin-child"
        ? "builtin · run inside a forked child (pipeline)"
        : s.kind === "skipped"
          ? "skipped"
          : `external · <code>${esc(s.path ?? s.argv[0] ?? "")}</code>`;
  const ev = s.events.length ? `<pre class="ev">${s.events.map(esc).join("\n")}</pre>` : "";
  const head = s.kind === "skipped" ? `<b>cmd ${s.idx + 1}</b>` : `<b>${s.kind === "builtin-shell" ? "shell" : "pid " + s.pid}</b><span class="k">cmd ${s.idx + 1}</span>`;
  return `<div class="proc${s.kind === "skipped" ? " sk" : ""}">
    <div class="ph">${head}<span class="ex ${statusClass(s.exit)}">${s.exit === null ? "—" : "exit " + s.exit}</span></div>
    <div class="row"><small>argv</small><span>${argv}</span></div>
    <div class="row"><small>kind</small><span>${kind}</span></div>
    <div class="row"><small>fd 0</small><span class="fd">${esc(s.stdin)}</span></div>
    <div class="row"><small>fd 1</small><span class="fd">${esc(s.stdout)}</span></div>
    ${ev}
  </div>`;
}

export function renderInspect(s: Snapshot | null): string {
  if (!s) {
    return `<p class="empty">Run a command. The panel shows what the real lexer, parser, redirection code and expander built for it, read straight out of the WebAssembly memory.</p>`;
  }
  const out: string[] = [];
  out.push(`<div class="cmdline"><small>input</small><code>${vis(s.line)}</code></div>`);

  // 1 lexer
  let b = tokenChips(s.tokens);
  if (s.lexQuote) b += `<p class="warn">lexer() returned <code>${esc(s.lexQuote)}</code>: a quote was never closed.</p>`;
  b += `<p class="legend"><span class="chip t-DF"><i>DF</i></span> word <span class="chip t-SQ"><i>SQ</i></span> 'single' <span class="chip t-DQ"><i>DQ</i></span> "double" <span class="chip t-OP"><i>OP</i></span> &lt; &gt; &lt;&lt; &gt;&gt; <span class="chip t-PP"><i>PP</i></span> | &nbsp; <span class="glue">⌒</span> append: glued to next</p>`;
  out.push(stageBox(1, "Lexer", "lexer() · lexer.c", b));

  // 1b syntax check
  if (s.syntaxError) {
    out.push(
      stageBox(2, "Syntax check", "syntax_checker()", `<p class="bad-msg">✗ ${esc(s.diag.trim())}</p><p class="legend">exit status 2, nothing is parsed or run.</p>`),
    );
    out.push(stageBox(3, "Parser", "list_to_cmds()", `<p class="legend">not reached</p>`, true));
    out.push(stageBox(4, "Redirections", "handle_redirections()", `<p class="legend">not reached</p>`, true));
    out.push(stageBox(5, "Expander", "expand_all()", `<p class="legend">not reached</p>`, true));
    out.push(stageBox(6, "Execution", "full_execution()", `<p class="legend">not run · <b>$?</b> = <code>${s.status}</code></p>`, true));
    return out.join("");
  }
  out.push(stageBox(2, "Syntax check", "syntax_checker()", `<p class="ok-msg">✓ quotes closed, no operator without an operand</p>`));

  // 3 parser: split at pipes, argv + redirections
  const parsed = s.parsed ?? [];
  out.push(
    stageBox(
      3,
      "Parser",
      "list_to_cmds() · linked_cmd.c",
      `<div class="cmds">` +
        parsed
          .map((toks, i) => {
            const items = group(toks);
            const words = items.filter((x) => !x.op).map((x) => `<code class="w">${vis(raw(x.word))}</code>`);
            const reds = items.filter((x) => x.op).map((x) => `<code class="r">${esc(x.op!)}</code> <code class="w">${vis(raw(x.word))}</code>`);
            return `<div class="cmd"><div class="ch">t_cmd ${i + 1}</div>
              <div class="row"><small>words</small><span>${words.join(" ") || '<em>none</em>'}</span></div>
              <div class="row"><small>redirs</small><span>${reds.join("<br>") || "<em>none</em>"}</span></div></div>`;
          })
          .join('<span class="pipe">|</span>') +
        "</div>",
    ),
  );

  // 4 redirections / heredoc
  const res = s.resolved ?? [];
  out.push(
    stageBox(
      4,
      "Redirections + heredoc",
      "handle_heredoc() · handle_redirections()",
      `<div class="cmds">` +
        res
          .map(
            (c, i) => `<div class="cmd"><div class="ch">t_cmd ${i + 1}${c.skip ? ' <span class="skip">skip_cmd=1</span>' : ""}</div>
            <div class="row"><small>in_fd</small><span class="fd">${c.inFd} → ${esc(c.inLabel)}</span></div>
            <div class="row"><small>out_fd</small><span class="fd">${c.outFd} → ${esc(c.outLabel)}</span></div></div>`,
          )
          .join('<span class="pipe">|</span>') +
        `</div><p class="legend">files are opened (and created or truncated) here, left to right, before any command runs. The operator tokens are then removed from the list.</p>`,
    ),
  );

  // 5 expander
  const exp = s.expanded ?? [];
  out.push(
    stageBox(
      5,
      "Expander",
      "expand_all() · expand_and_join.c",
      `<div class="cmds">` +
        exp
          .map((argv, i) => {
            const before = res[i]?.tokens ? group(res[i].tokens).map((x) => raw(x.word)) : [];
            return `<div class="cmd"><div class="ch">t_cmd ${i + 1}</div>
              <div class="row"><small>before</small><span>${before.map((w) => `<code class="w">${vis(w)}</code>`).join(" ") || "<em>none</em>"}</span></div>
              <div class="row"><small>argv</small><span>${argv.map((a, j) => `<code class="a"><sup>${j}</sup>${vis(a)}</code>`).join(" ") || "<em>empty</em>"}</span></div></div>`;
          })
          .join('<span class="pipe">|</span>') +
        `</div><p class="legend"><b>$VAR</b> and <b>$?</b> are substituted (not inside single quotes), unquoted results are split on whitespace, adjacent quoted pieces are joined.</p>`,
    ),
  );

  // 6 execution
  const plan = s.plan ?? [];
  let eb = "";
  plan.forEach((p, i) => {
    eb += stageCard(p, {});
    if (i < plan.length - 1) eb += `<div class="link">${esc(plan[i].stdout.startsWith("pipe#") ? plan[i].stdout.replace(/ write end/, "") : "pipe")} ↓ stdin of next</div>`;
  });
  eb += `<p class="final">waitpid on the last command → <b>$?</b> = <code class="${statusClass(s.status)}">${s.status}</code></p>`;
  out.push(stageBox(6, "Execution", "full_execution() · exec_child()", eb));
  return out.join("");
}
