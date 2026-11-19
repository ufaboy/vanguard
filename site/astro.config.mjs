// Builds the static SEO pages (site/src/pages) into dist/site together with an untouched copy of
// public/ (the game, CSS, images, maps, page scripts). Vite never bundles anything from public/.
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://battletank.online',
  publicDir: '../public',
  outDir: '../dist/site',
  // Keeps today's files and URLs: about.html -> /about, es/index.html -> /es/.
  build: { format: 'preserve' },
  compressHTML: false,
  devToolbar: { enabled: false },
});
