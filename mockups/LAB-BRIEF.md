# Lab demo brief (shared by all demo agents)

Repo: /home/user/saadm-portfolio (Astro 5, branch `demos` — already checked out; do NOT switch branches, do NOT commit; the lead commits).
Site design: "Blueprint" engineering-drawing style. Read src/styles/global.css (CSS vars --paper --ink --ink-2 --ink-3 --red --mono --cond)
and src/pages/index.astro to match the look: graph paper, thin navy lines, red pencil accent, IBM Plex Mono / Plex Sans Condensed,
square corners, no gradients/shadows/rounded cards. Demos must feel like part of the same drawing set.

Project sources (read-only clones): /tmp/scratchpad/repos/<owner>_<repo>/
Research notes about the projects: /home/user/saadm-portfolio/mockups/github-research.md
The site owner is Saad (they/them in any prose you write); write first-person UI copy as Saad ("I") only where needed, keep it factual.

## Rules
- You OWN ONLY: src/pages/lab/<name>.astro and src/demos/<name>/** (create them). Do not edit any other file
  (no global.css, no index.astro, no data/site.ts, no package.json). Put demo-specific CSS in a <style> in your page or in src/demos/<name>/.
  No new npm dependencies.
- Wrap the page in `src/layouts/LabLayout.astro` (read it): props title, sheet, subtitle, repo, note.
  `note` MUST honestly say what is real vs simulated (e.g. "Browser port of the C raycaster — same DDA algorithm and map format; MiniLibX replaced by <canvas>").
- Be FAITHFUL to the actual repo: read the real source and mirror its real behavior, commands, messages, map format, error strings, limits.
  Do not invent features the repo doesn't have. Where you simplify, say so in the note.
- Client-side only (static site). Vanilla TS/JS in Astro <script> tags or modules under src/demos/<name>/. Must work offline after load.
- Responsive: usable at 390px wide with no horizontal page scroll (inner scroll panes OK). Keyboard accessible. Respect prefers-reduced-motion for decorative animation.
- Keep each page's JS reasonable (< ~150 KB unminified).
- Verify: run `npx astro dev --port <your port>` (run in background, from /home/user/saadm-portfolio) and drive the page with Playwright
  (`require('playwright')` works from any dir; chromium.launch() needs no args). Actually exercise the demo (type commands, press keys),
  check there are no console errors, take desktop (1440x900) and mobile (390x844) screenshots into
  /tmp/scratchpad/lab/<name>-*.png (use your own subfolder/prefix for scripts too; other agents share the scratchpad).
  Look at them and fix issues. Kill your dev server when done.
- Report back: what's runnable, what's simulated, files created, how you verified, known limitations.
