/**
 * ─────────────────────────────────────────────────────────────
 *  ALL SITE CONTENT LIVES HERE.
 *  Edit this file to update the portfolio — no other code needed.
 *  Everything marked TODO is placeholder content.
 * ─────────────────────────────────────────────────────────────
 */

export const site = {
  name: "Saad M.", // TODO: full name
  handle: "saadm",
  domain: "saadm.tech",
  url: "https://saadm.tech",
  roles: ["Software Engineer", "Full-Stack Developer", "Problem Solver"], // TODO: cycles in the hero
  tagline: "I build fast, thoughtful software — from clean interfaces to the systems behind them.", // TODO
  location: "Earth 🌍", // TODO (or set to "")
  available: true, // shows the "open to opportunities" badge
  email: "hello@saadm.tech", // TODO: public email
  resume: "/resume.pdf", // TODO: drop your CV at public/resume.pdf
  // TODO: create a free form at https://formspree.io and paste its endpoint here.
  // Leave empty to hide the form and only show the email button.
  formEndpoint: "",
  description:
    "Portfolio of Saad M. — software engineer building fast, modern web experiences.", // SEO
};

export const socials = [
  { label: "GitHub", href: "https://github.com/", icon: "github" }, // TODO
  { label: "LinkedIn", href: "https://linkedin.com/in/", icon: "linkedin" }, // TODO
  { label: "X", href: "https://x.com/", icon: "x" }, // TODO
] as const;

export const about = {
  // TODO: your story. Each string is a paragraph.
  paragraphs: [
    "Hey! I'm Saad — a developer who loves turning ideas into products people actually enjoy using. I care about clean code, smooth UX, and shipping things that work.",
    "Right now I'm focused on building modern web apps and sharpening my skills across the stack. When I'm not coding, you'll find me exploring new tech, learning something random, or [your hobby here].",
  ],
  stats: [
    { value: "3+", label: "Years coding" }, // TODO
    { value: "15+", label: "Projects built" }, // TODO
    { value: "∞", label: "Cups of coffee" },
  ],
  photo: "", // TODO: e.g. "/me.jpg" placed in public/. Empty = initials avatar.
};

export const skills = [
  // TODO: adjust groups & items
  { group: "Languages", items: ["TypeScript", "JavaScript", "Python", "Java", "SQL"] },
  { group: "Frontend", items: ["React", "Next.js", "Astro", "Tailwind CSS", "HTML/CSS"] },
  { group: "Backend", items: ["Node.js", "Express", "PostgreSQL", "MongoDB", "REST APIs"] },
  { group: "Tools", items: ["Git", "Docker", "Linux", "Figma", "Vercel"] },
];

export type Project = {
  title: string;
  description: string;
  tags: string[];
  image?: string; // path in public/, e.g. "/projects/foo.png"
  github?: string;
  live?: string;
  featured?: boolean;
};

export const projects: Project[] = [
  // TODO: replace with real projects
  {
    title: "Project Nebula",
    description:
      "A real-time collaborative workspace with live cursors, presence, and instant sync. Built to explore CRDTs and websockets at scale.",
    tags: ["Next.js", "TypeScript", "WebSockets", "PostgreSQL"],
    github: "https://github.com/",
    live: "https://example.com",
    featured: true,
  },
  {
    title: "Pulse Analytics",
    description:
      "Privacy-first analytics dashboard with beautiful charts and sub-second queries over millions of events.",
    tags: ["React", "Node.js", "ClickHouse", "Tailwind CSS"],
    github: "https://github.com/",
    featured: true,
  },
  {
    title: "CLI Toolkit",
    description: "A set of developer CLI utilities that automate the boring parts of my workflow.",
    tags: ["Python", "CLI"],
    github: "https://github.com/",
  },
  {
    title: "Portfolio v1",
    description: "This very website — static, fast, accessible, and fully data-driven.",
    tags: ["Astro", "Tailwind CSS"],
    github: "https://github.com/",
    live: "https://saadm.tech",
  },
];

export const experience = [
  // TODO: real experience (most recent first)
  {
    role: "Software Engineer Intern",
    org: "Company Name",
    period: "2025 — Present",
    points: [
      "Built and shipped features used by thousands of users.",
      "Improved page load performance by 40% through code-splitting and caching.",
    ],
  },
  {
    role: "Freelance Developer",
    org: "Self-employed",
    period: "2023 — 2025",
    points: ["Designed and developed websites and web apps for small businesses."],
  },
];

export const education = [
  // TODO
  { degree: "B.Sc. Computer Science", org: "University Name", period: "2022 — 2026" },
];

export const nav = [
  { label: "About", href: "#about" },
  { label: "Skills", href: "#skills" },
  { label: "Projects", href: "#projects" },
  { label: "Experience", href: "#experience" },
  { label: "Contact", href: "#contact" },
];
