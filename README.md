# saadm.tech — Portfolio

Personal portfolio built with [Astro](https://astro.build) + [Tailwind CSS v4](https://tailwindcss.com).

## Quick start

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```

## Editing content

**All content lives in [`src/data/site.ts`](src/data/site.ts).** Look for `TODO` comments.

| What | Where |
|---|---|
| Name, roles, tagline, email | `site` in `src/data/site.ts` |
| Social links | `socials` |
| About text, stats, photo | `about` (put photo in `public/`, e.g. `public/me.jpg`) |
| Skills | `skills` |
| Projects | `projects` (screenshots go in `public/projects/`) |
| Experience / education | `experience`, `education` |
| CV | Drop it at `public/resume.pdf` |
| Contact form | Create a free form at formspree.io, paste the endpoint into `site.formEndpoint` |
| Social share image | Add `public/og.png` (1200×630) |
| Colors | `--accent` / `--accent-2` in `src/styles/global.css` |

## Features

- Dark/light theme (remembers choice, follows system by default)
- Animated hero with typing roles, gradient glow, grid background
- Scroll reveal animations, cursor-spotlight cards (respects reduced motion)
- Project filtering by tech tag
- Active-section nav highlight, mobile menu
- Copy-email button, optional AJAX contact form
- SEO: meta + Open Graph tags, sitemap, robots.txt, custom 404

## Deploy

Push to GitHub, then import the repo on **Vercel** or **Cloudflare Pages** (framework: Astro, build: `npm run build`, output: `dist`).
When you buy `saadm.tech`, add it as a custom domain in the host's dashboard and set the DNS records it shows you.
