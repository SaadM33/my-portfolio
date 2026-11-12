// Terminal + inspection-panel UI for the /lab/minishell page.
import wasmUrl from "./minishell.wasm?url";
import { MiniShell, type RunResult } from "./shell";
import { renderInspect } from "./inspect";

const CLEAR = "\x1b[H\x1b[2J";

export async function start() {
  const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
  const out = $<HTMLElement>("#ms-out");
  const input = $<HTMLInputElement>("#ms-in");
  const promptEl = $<HTMLElement>("#ms-prompt");
  const panel = $<HTMLElement>("#ms-panel");
  const term = $<HTMLElement>("#ms-term");
  const status = $<HTMLElement>("#ms-status");

  const add = (text: string, cls = "") => {
    if (!text) return;
    const sp = document.createElement("span");
    if (cls) sp.className = cls;
    sp.textContent = text;
    out.appendChild(sp);
    while (out.childNodes.length > 1500) out.removeChild(out.firstChild!);
  };
  const scroll = () => {
    term.scrollTop = term.scrollHeight;
  };
  const write = (text: string, fd: number) => {
    const i = text.indexOf(CLEAR);
    if (i >= 0) {
      out.textContent = "";
      text = text.slice(i + CLEAR.length);
    }
    add(text, fd === 2 ? "err" : "");
  };

  panel.innerHTML = renderInspect(null);
  input.disabled = true;
  input.placeholder = "loading WebAssembly…";

  let shell: MiniShell;
  try {
    const bytes = await (await fetch(wasmUrl)).arrayBuffer();
    shell = await MiniShell.create(bytes, write);
  } catch (e) {
    add("failed to load minishell.wasm: " + e, "err");
    return;
  }

  const history: string[] = [];
  let hIdx = 0;
  let draft = "";

  const refresh = () => {
    const exited = shell.mode === "exited";
    promptEl.textContent = exited ? "" : shell.prompt;
    input.placeholder = exited ? "shell exited · press Enter to start a new one" : "";
    status.textContent = exited ? "exited" : shell.mode === "heredoc" ? "reading heredoc" : "ready";
    scroll();
  };

  const after = (r: RunResult) => {
    if (r.snap) panel.innerHTML = renderInspect(r.snap);
    if (r.exited !== undefined) add(`[minishell exited with status ${r.exited}]\n`, "dim");
    refresh();
  };

  const submit = (line: string) => {
    if (shell.mode === "exited") {
      return restart();
    }
    add(shell.prompt + line + "\n");
    if (shell.mode === "prompt" && line !== "") history.push(line);
    hIdx = history.length;
    after(shell.submit(line));
  };

  const restart = async () => {
    add("\n");
    await shell.boot();
    add("[new minishell session, same file system]\n", "dim");
    refresh();
  };

  const ctrlC = () => {
    if (shell.mode === "exited") return;
    add(shell.prompt + input.value + "^C");
    input.value = "";
    shell.sigint();
    refresh();
  };
  const ctrlD = () => {
    if (shell.mode === "exited") return;
    if (input.value) return;
    add(shell.prompt);
    after(shell.eof());
  };
  const hist = (d: number) => {
    if (!history.length) return;
    if (hIdx === history.length) draft = input.value;
    hIdx = Math.max(0, Math.min(history.length, hIdx + d));
    input.value = hIdx === history.length ? draft : history[hIdx];
    requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = input.value;
      input.value = "";
      submit(v);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      hist(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      hist(1);
    } else if (e.ctrlKey && e.key.toLowerCase() === "c" && input.selectionStart === input.selectionEnd) {
      e.preventDefault();
      ctrlC();
    } else if (e.ctrlKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      ctrlD();
    } else if (e.ctrlKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      out.textContent = "";
    }
  });
  term.addEventListener("click", () => {
    if (!getSelection()?.toString()) input.focus();
  });

  document.querySelectorAll<HTMLElement>("[data-key]").forEach((b) =>
    b.addEventListener("click", () => {
      const k = b.dataset.key;
      if (k === "up") hist(-1);
      else if (k === "down") hist(1);
      else if (k === "c") ctrlC();
      else if (k === "d") ctrlD();
      input.focus();
    }),
  );

  document.querySelectorAll<HTMLElement>("[data-example]").forEach((b) =>
    b.addEventListener("click", async () => {
      const lines: string[] = JSON.parse(b.dataset.example!);
      if (shell.mode === "exited") await restart();
      if (shell.mode === "heredoc") ctrlC();
      input.value = "";
      for (const l of lines) {
        if (shell.mode === "exited") break;
        submit(l);
      }
      input.focus({ preventScroll: true });
      term.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }),
  );

  add("Megashell, compiled to WebAssembly from the real minishell sources.\n", "dim");
  add("Pick an example above or type a command. Ctrl-C clears the line, Ctrl-D exits, Up/Down browse history.\n\n", "dim");
  input.disabled = false;
  refresh();
  (window as any).__minishell = { shell, submit };
}
