/**
 * The deployable site: Astro builds the static SEO pages from site/src/pages and copies public/
 * (game, assets, page scripts) untouched into dist/site. Deploy, the itch.io package, Markdown for
 * agents and the browser smoke tests all work on this directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE_DIR = path.join(ROOT, 'dist', 'site');

/** Runs `astro build`; `outDir` overrides dist/site (absolute path). Throws when the build fails. */
export function buildSite({ outDir = SITE_DIR, quiet = false } = {}) {
  const command = `npx astro build --root site --outDir "${outDir}"${quiet ? ' --silent' : ''}`;
  const res = spawnSync(command, { cwd: ROOT, stdio: quiet ? 'pipe' : 'inherit', shell: true, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`astro build failed${quiet ? `:\n${res.stdout}\n${res.stderr}` : ''}`);
  return outDir;
}

/** Builds dist/site unless it already holds a build. */
export function ensureSite() {
  if (!fs.existsSync(path.join(SITE_DIR, 'index.html'))) buildSite();
  return SITE_DIR;
}
