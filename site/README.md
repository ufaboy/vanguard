# Astro proof of concept (static pages)

Ports `about` and the home page (English + Spanish) to Astro without touching `public/`.

```bash
cd site
npm install
npm run build                 # -> site/dist (Astro pages + a verbatim copy of ../public)
node scripts/compare.mjs about.html es/about.html index.html es/index.html
npm run preview               # http://localhost:4322
```

- `src/layouts/PageLayout.astro`: head, canonical / hreflang, Open Graph, Twitter, JSON-LD, import map, footer.
- `src/components/SiteFooter.astro`: footer navigation and language menu, written once.
- `src/i18n/index.js`: `t()` over the existing `i18n/pages/es.mjs` dictionaries; a missing key fails the build.
- `src/pages/[...locale]/*.astro`: one source per page, built as `/about` and `/es/about`.
- The game and every page script stay out of Vite: all scripts are `is:inline`, assets come from `../public`.
- `build.format: 'preserve'` keeps `about.html` / `es/index.html` (the default `file` format writes `es.html`).
- While the old pages remain in `public/`, the `legacy-public` integration copies `../public` after the build without overwriting Astro output.
