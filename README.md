# Maddox Realty — maddoxrealty.com

Astro + Tailwind v4, static, deployed on Cloudflare Pages from `main`.
`CLAUDE.md` is the full guide to how the site works.

## Properties

Staff add and edit properties in the **SBWS post editor**, which commits to
`main`. Each property is a folder in `src/content/property/<slug>/` (its
`index.md` and photos) and appears at `/property/<slug>/`. The home page and
the Sold pages list them automatically from their Status, Year sold and
category tick boxes.

Developers: `git pull` before working — staff publish straight to `main`.

## Scripts

- `npm run dev` — local server.
- `npm run build` — `astro sync`, the post-editor check (`sbws.json` must match
  `src/content.config.ts`), the deploy checks, then `astro build`.
- `npm run check` — the checks on their own.
- `npm run a11y` — after a build: axe and tab order at 1440 / 820 / 390.
