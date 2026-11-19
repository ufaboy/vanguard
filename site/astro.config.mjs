// Proof of concept: builds a few static SEO pages with Astro into site/dist.
// The game, CSS, images and page scripts are taken verbatim from ../public (never bundled by Vite).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

const LEGACY_PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));

/**
 * While old HTML pages still live in ../public, Astro would skip any page whose file name exists
 * there. So publicDir stays empty and ../public is copied after the build without overwriting the
 * pages Astro generated. After a full migration the ported HTML is deleted from public/ and this
 * integration goes away (publicDir: '../public').
 */
const legacyPublic = {
  name: 'legacy-public',
  hooks: {
    'astro:build:done': ({ dir }) => {
      fs.cpSync(LEGACY_PUBLIC, fileURLToPath(dir), { recursive: true, force: false, errorOnExist: false });
    },
  },
};

export default defineConfig({
  site: 'https://battletank.online',
  publicDir: './public-empty',
  outDir: './dist',
  build: { format: 'preserve' },
  compressHTML: false,
  integrations: [legacyPublic],
});
