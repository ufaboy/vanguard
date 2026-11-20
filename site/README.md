# Static pages (Astro)

The indexable out-of-combat pages (home, modes, guides, info, changelog) are Astro sources rendered at
build time. The game (`public/battlefield.html`, `public/src/`, `public/vendor/`) is never processed by
Astro or Vite: `public/` is copied into the build untouched.

```bash
pnpm run build:site      # -> dist/site (pages + a copy of public/)
pnpm run dev             # build, then serve dist/site on http://localhost:3000
pnpm run dev:site        # Astro dev server with live reload for page editing (port 4321)
```

- `src/layouts/PageLayout.astro`: head (meta, canonical, hreflang, Open Graph, Twitter, JSON-LD), import map,
  footer and the page's own script from `public/src/pages/`.
- `src/components/SiteFooter.astro`: footer navigation and the language menu (localized pages only).
- `src/i18n/index.js`: `LOCALIZED_SLUGS`, `t()` over `i18n/pages/<locale>.mjs` (a missing key fails the
  build), `localHref` / `pageHref` for relative links, `localizeJsonLd` for structured data.
- `src/pages/[...locale]/<slug>.astro`: one source per page. Pages in `LOCALIZED_SLUGS` build to `/<slug>` and
  `/es/<slug>`; the others to `/<slug>` only.

Rules: every `<script>` / `<style>` is `is:inline`; no client-side islands; links are relative
(`h('./campaign')`) so the itch.io package keeps working; `build.format: 'preserve'` keeps `about.html` and
`es/index.html`.

`scripts/compare.mjs <refDir> <page.html>...` compares built pages with reference HTML (for example
`git show <rev>:public/about.html`), ignoring formatting only.
