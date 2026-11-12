/**
 * ─────────────────────────────────────────────────────────────
 *  ALL SITE CONTENT LIVES HERE. Edit this file to update the site.
 *  Facts come from your GitHub repos. Lines marked TODO are guesses
 *  or placeholders: check / replace them.
 * ─────────────────────────────────────────────────────────────
 */

export const site = {
  name: "Saad M", // big name in the hero (the red "." is added automatically)
  fullName: "Saad Maaqili", // TODO: confirm spelling (commits also say "Saad El Maaqili") — used for SEO/title
  initials: "S.M.",
  url: "https://saadm.tech",
  drawingNo: "SM-2026-001",
  rev: "2026.11", // bump when you update the site
  email: "hello@saadm.tech", // TODO: real public email (this one needs the domain first)
  github: "SaadM33",
  linkedin: "", // TODO: e.g. "linkedin.com/in/your-handle" (empty = hidden)
  location: "Morocco",
  timezone: "UTC+1",
  description:
    "Saad Maaqili — software engineering student at 1337 (42 Network). Servers, shells, renderers, and the containers they ship in.",
};

export const hero = {
  label: "1337 · 42 NETWORK", // text on the dimension line under the name
  // Wrap words in *stars* to underline them in red.
  lede: "Software engineering student at 1337. I build things close to the metal — *servers, shells, renderers* — and the containers they ship in.",
  notes: [
    "Primary material: C and C++98. Tolerances: zero leaks, zero norm errors.",
    "Secondary: Docker / Compose, Linux, sockets, FastAPI, NestJS, React.",
    "Currently fabricating: HackSpace (team of 5) and a URL shortener.",
  ],
};

export const about = {
  notes: [
    // TODO: these are written in your voice — rewrite anything that isn't true for you.
    "I learned to program by rebuilding the things I use every day — a shell, an IRC server, a 3D renderer — until I understood why they work.",
    "At 1337 there are no teachers and no lectures: just specs, peers and an automated grader that does not care how late it is.",
    "Before that, ALX gave me the habits — Git every day, small commits, reading man pages before Stack Overflow.",
    "Next on the bench: more networking, more infrastructure, and web services that are boring in the best way.",
  ],
  handNote: "all dimensions in commits, not hours.",
  spec: [
    { k: "Based", v: "Morocco", tol: "UTC+1" },
    { k: "School", v: "1337 Coding School — 42 Network" },
    { k: "Prior", v: "ALX Software Engineering" },
    { k: "Languages", v: "C, C++98, Python, TypeScript, Bash, SQL" },
    { k: "Systems", v: "POSIX sockets, poll(), fork/execve, pipes, signals" },
    { k: "Infra", v: "Docker, Compose, NGINX + TLS, MariaDB, Redis" },
    { k: "Backend", v: "FastAPI, NestJS, PostgreSQL, MySQL, OAuth 2.0" },
    { k: "Tools", v: "git, make, gdb, valgrind, GitHub Actions", tol: "±0 leaks" },
  ],
};

export type Detail = {
  id: string; // letter shown in the bubble
  title: string;
  sub: string;
  scale: string; // small text, top right
  diagram: "irc" | "inception" | "cub3d" | "minishell";
  description: string;
  material: string;
  repo?: string; // "owner/name"
};

/** The 4 projects drawn as diagrams. */
export const details: Detail[] = [
  {
    id: "A",
    title: "ft_irc",
    sub: "IRC server · C++98",
    scale: "SCALE 1:1<br>1337 · 2026",
    diagram: "irc",
    description:
      "An IRC server that real clients connect to, built around a single non-blocking poll() loop with buffered partial reads. Implements 13 commands — including KICK, INVITE, TOPIC and MODE with +i +t +k +o +l. Team of three; I'm the top committer.",
    material: "MAT: C++98 · sockets · poll(2)",
    repo: "SaadM33/Internet-Relay-Chat",
  },
  {
    id: "B",
    title: "Inception",
    sub: "Container infrastructure · Docker",
    scale: "SCALE 1:1<br>1337 · 2026",
    diagram: "inception",
    description:
      "Eight services, each built from a plain Debian image with my own Dockerfiles: NGINX terminating TLS 1.2/1.3 in front of WordPress on php-fpm (set up with WP-CLI) and MariaDB, plus Redis, Adminer, FTP, a static site and cAdvisor. Ships with user and developer guides.",
    material: "MAT: Docker · Compose · NGINX · MariaDB",
    repo: "SaadM33/inception",
  },
  {
    id: "C",
    title: "cub3D",
    sub: "Raycasting engine · C / MiniLibX",
    scale: "PLAN VIEW<br>1337 · 2025",
    diagram: "cub3d",
    description:
      "A Wolfenstein-style first-person renderer in C using DDA raycasting. My part: the .cub map parser, smooth key-state movement, the minimap, mouse look, and doors that open — which the rays have to treat as a special case.",
    material: "MAT: C · MiniLibX · DDA",
    repo: "authyx/cub3d",
  },
  {
    id: "D",
    title: "minishell",
    sub: "Bash-like shell · C",
    scale: "FLOW · NTS<br>1337 · 2025",
    diagram: "minishell",
    description:
      "A shell in C with a hand-written lexer and parser, quote-aware $VAR and $? expansion, pipes, < > >> redirections and heredocs, seven builtins and correct Ctrl-C handling. Leak-checked under valgrind.",
    material: "MAT: C · readline · fork(2) · pipe(2)",
    repo: "SaadM33/minishell",
  },
];

/** "Parts list" — other work, shown as a table. */
export const parts = [
  {
    name: "HackSpace",
    isNew: true,
    description:
      "Hackathon platform (NestJS + React + PostgreSQL), team of 5. I set up the initial monorepo and built Google and 42 Intra OAuth plus team creation & membership end to end, with Jest specs.",
    year: "2026",
    status: "team build",
    repo: "Dexter88xD/HackSpace",
  },
  {
    name: "url-shortener",
    isNew: true,
    description:
      "Short links with custom aliases, expiry, privacy-friendly click analytics and QR codes. FastAPI / MySQL / JWT core written by hand; the React dashboard built with Claude.",
    year: "2026",
    status: "in progress",
    repo: "", // private for now — TODO: add "SaadM33/url-shortener" once public (purge backend/.env first!)
  },
  {
    name: "AirBnB clone",
    isNew: false,
    description: "Python command interpreter, Flask web app and MySQL storage, built step by step at ALX.",
    year: "2024",
    status: "shipped",
    repo: "SaadM33/AirBnB_clone",
  },
];

/** Revision history — newest first. */
export const revisions = [
  {
    rev: "E",
    date: "2026 — now",
    title: "HackSpace, url-shortener.",
    text: "First projects outside the curriculum — and the first with a team of five and real code review.",
    by: "self",
    current: true,
  },
  {
    rev: "D",
    date: "2025 — present",
    title: "1337 Coding School, 42 Network.",
    text: "Common core: minishell, cub3D, ft_irc, Inception. Peer-evaluated, project-based, no lectures.",
    by: "1337 · 42",
  },
  {
    rev: "C",
    date: "2023 — 2024",
    title: "ALX Software Engineering.",
    text: "Low-level C, Python, SQL, Flask, the AirBnB clone, and a lot of sandbox servers.",
    by: "ALX Africa",
  },
  {
    rev: "B",
    date: "2023", // TODO: adjust or delete
    title: "Initial issue.",
    text: "First C program that compiled without warnings. Took a while.",
    by: "—",
  },
];

export const contact = {
  heading: ["Have a spec?", "Send it over."],
  text: "Open to internships, systems or infrastructure work, and interesting problems. I reply within a day or two.", // TODO
};
