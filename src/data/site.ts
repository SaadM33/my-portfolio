/**
 * ─────────────────────────────────────────────────────────────
 *  ALL SITE CONTENT LIVES HERE. Edit this file to update the site.
 *  Sources: CV (Nov 2026) + GitHub repos. Lines marked TODO need a check.
 * ─────────────────────────────────────────────────────────────
 */

export const site = {
  name: "Saad M", // big name in the hero (the red "." is added automatically)
  fullName: "Saad El Maaqili",
  initials: "S.M.",
  url: "https://saadm.tech",
  drawingNo: "SM-2026-001",
  rev: "2026.11", // bump when you update the site
  // Never written into the HTML: assembled by JS on the page so scrapers don't harvest it.
  email: "smaaqili@gmail.com", // TODO: switch to hello@saadm.tech once the domain + forwarding exist
  github: "SaadM33",
  linkedin: "linkedin.com/in/saad-el-maaqili",
  cv: "/cv.pdf", // public/cv.pdf — phone number removed
  location: "Rabat, Morocco",
  timezone: "UTC+1",
  description:
    "Saad El Maaqili — full-stack software engineering student at 1337 (UM6P). FastAPI, NestJS and React on a C/C++ foundation. Looking for a PFE internship from December 2026.",
};

export const hero = {
  label: "1337 · UM6P · 42 NETWORK", // text on the dimension line under the name
  // Wrap words in *stars* to underline them in red.
  lede: "Full-stack software engineering student at 1337. I build web apps with *FastAPI, NestJS and React* — on a foundation of C, C++ and sockets.",
  notes: [
    "Primary material: Python/FastAPI, NestJS, React, PostgreSQL.",
    "Foundation: C and C++98. Tolerances: zero leaks, zero norm errors.",
    "Available: 4–6 month end-of-studies internship (PFE), from 1 Dec 2026.",
  ],
};

export const about = {
  notes: [
    // TODO: written in your voice — rewrite anything that doesn't sound like you.
    "I learned to program by rebuilding the things I use every day — a shell, an IRC server, a 3D renderer — until I understood why they work.",
    "Now I build full products: database schema, auth, real-time features, tests and CI — most recently in a team of five, with Scrum, code review and CI before every merge.",
    "At 1337 there are no teachers and no lectures: just specs, peers and an automated grader that does not care how late it is.",
    "Off the clock: Codeforces with the 1337 Competitive Programming Club, and game jams with the Game Development Club.",
  ],
  handNote: "all dimensions in commits, not hours.",
  spec: [
    { k: "Based", v: "Rabat, Morocco", tol: "UTC+1" },
    { k: "School", v: "1337 Coding School (UM6P) — 42 Network" },
    { k: "Languages", v: "Python, C, C++, Java, JavaScript, TypeScript, SQL" },
    { k: "Backend", v: "FastAPI, NestJS, Spring Boot, REST, WebSockets, JWT, OAuth 2.0" },
    { k: "Data", v: "PostgreSQL, MySQL, SQLAlchemy, TypeORM, Alembic" },
    { k: "Frontend", v: "React, HTML, CSS" },
    { k: "DevOps", v: "Git, GitHub Actions, Docker, Linux, Jira, Scrum, pytest" },
    { k: "AI", v: "LLM integration, pgvector, RAG" },
    { k: "Spoken", v: "Arabic, French, English" },
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
  lab?: string; // path to the runnable demo, e.g. "/lab/irc"
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
      "A multi-client IRC server over TCP that real clients connect to, built around a single non-blocking poll() loop with buffered partial reads. Implements 13 commands — including KICK, INVITE, TOPIC and MODE with +i +t +k +o +l. Team of three; I'm the top committer.",
    material: "MAT: C++98 · sockets · poll(2)",
    repo: "SaadM33/Internet-Relay-Chat",
    lab: "/lab/irc",
  },
  {
    id: "B",
    title: "Inception",
    sub: "Container infrastructure · Docker",
    scale: "SCALE 1:1<br>1337 · 2025",
    diagram: "inception",
    description:
      "A multi-service Docker environment built from plain Debian images with my own Dockerfiles: NGINX terminating TLS 1.2/1.3 in front of WordPress on php-fpm and MariaDB, plus Redis, FTP, Adminer, a static site and a resource monitor — isolated networks, persistent volumes.",
    material: "MAT: Docker · Compose · NGINX · MariaDB · Redis",
    repo: "SaadM33/inception",
    lab: "/lab/inception",
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
    lab: "/lab/cub3d",
  },
  {
    id: "D",
    title: "minishell",
    sub: "Unix shell · C",
    scale: "FLOW · NTS<br>1337 · 2025",
    diagram: "minishell",
    description:
      "A shell in C with a hand-written lexer and parser, quote-aware $VAR and $? expansion, pipes, < > >> redirections and heredocs, seven builtins and correct Ctrl-C handling. Leak-checked under valgrind.",
    material: "MAT: C · readline · fork(2) · pipe(2)",
    repo: "SaadM33/minishell",
    lab: "/lab/minishell",
  },
];

/** "Parts list" — other work, shown as a table. Name links to `live`, else to `repo`. */
export const parts = [
  {
    name: "HackSpace",
    isNew: true,
    description:
      "Hackathon platform, team of 5 (Scrum, PRs, CI). I built JWT + Google/42 OAuth with per-hackathon roles enforced by NestJS guards, Socket.IO chat rooms, and the AI Mentor: an isolated FastAPI service with a pgvector RAG pipeline.",
    year: "2026",
    status: "team build",
    repo: "Dexter88xD/HackSpace",
    live: "",
  },
  {
    name: "rift.tech",
    isNew: true,
    description:
      "Full-stack URL shortener: FastAPI REST backend in layers (Pydantic v2, Alembic), React dashboards, click analytics, bcrypt + JWT in httpOnly cookies + Google OAuth, pytest suite and GitHub Actions CI. Deployed on Vercel.",
    year: "2026",
    status: "live",
    repo: "", // private — TODO: add "SaadM33/url-shortener" once public (purge backend/.env from history first!)
    live: "https://rift.tech",
  },
  {
    name: "Cloud Infra Canvas",
    isNew: true,
    description:
      "Multiplayer whiteboard for designing cloud architecture: a Spring Boot monolith syncing canvas state over WebSockets. I built the React frontend and session auth, and worked on turning infra graphs into structured JSON with AI.",
    year: "2026",
    status: "team build",
    repo: "", // TODO: repo link if public
    live: "",
  },
  {
    name: "AirBnB clone",
    isNew: false,
    description: "Python command interpreter, Flask web app and MySQL storage, built step by step at ALX.",
    year: "2024",
    status: "shipped",
    repo: "SaadM33/AirBnB_clone",
    live: "",
  },
];

/** Revision history — newest first. */
export const revisions = [
  {
    rev: "E",
    date: "2026",
    title: "HackSpace, rift.tech, Cloud Infra Canvas.",
    text: "Full products built in teams: auth, real-time features, RAG, and CI before every merge.",
    by: "self",
    current: true,
  },
  {
    rev: "D",
    date: "Jan 2026",
    title: "AI Ö Collective Intelligence Hackathon — 2nd of 12 teams.",
    text: "Framed problems in workplace workflows and agriculture, and prototyped solutions with AI coding agents against the clock.",
    by: "AI Ö",
  },
  {
    rev: "C",
    date: "2024 — present",
    title: "1337 Coding School (UM6P), 42 Network.",
    text: "Software engineering. Project-based and peer-evaluated: a Unix shell, a multi-client IRC server, a raycaster, Docker infrastructure.",
    by: "1337 · UM6P",
  },
  {
    rev: "B",
    date: "2023 — 2024",
    title: "ALX Software Engineering.",
    text: "Low-level C, Python, SQL, Flask, the AirBnB clone, and a lot of sandbox servers.",
    by: "ALX Africa",
  },
];

export const contact = {
  heading: ["Have a spec?", "Send it over."],
  text: "Looking for a 4–6 month end-of-studies internship (PFE) in software engineering or full-stack development, starting 1 December 2026.",
};
