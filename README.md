# saadm.tech — Portfolio

Personal portfolio built with [Astro](https://astro.build), styled as an engineering drawing set ("Blueprint" direction).

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
| Name, email, GitHub, LinkedIn, revision | `site` in `src/data/site.ts` |
| Hero text + N1–N3 notes | `hero` |
| About notes + spec table | `about` |
| 4 diagrammed projects | `details` (each picks a diagram: irc / inception / cub3d / minishell) |
| Other projects table | `parts` |
| Education / experience | `revisions` |
| Contact text | `contact` |
| Diagrams (SVG) | `src/components/diagrams/` |
| Colors / type | CSS variables at the top of `src/styles/global.css` |
| Social share image | add `public/og.png` (1200×630) |

Design mockups of the other directions (terminal, editorial, brutalist) are kept in `mockups/`.

## Deploy

Push to GitHub, then import the repo on **Vercel** or **Cloudflare Pages** (framework: Astro, build: `npm run build`, output: `dist`).
When you buy `saadm.tech`, add it as a custom domain in the host's dashboard and set the DNS records it shows you.
