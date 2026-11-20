/** Runs Cloudflare Pages deploy while loading per-project `.env` variables if present. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { publishAgentMarkdown } from './build-markdown.mjs';
import { SITE_DIR, buildSite } from './site.mjs';

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const vars = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) vars[key] = val;
  }
  return vars;
}

const isPreview = process.argv.includes('--preview');
const env = { ...process.env, ...loadDotEnv(path.resolve(process.cwd(), '.env')) };

function runCheck(cmd, args, label) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env });
  if (res.status !== 0) {
    console.error(`Deploy aborted: ${label} failed.`);
    process.exit(res.status ?? 1);
  }
}

if (!isPreview) {
  const gitStatus = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8', env });
  if (gitStatus.status !== 0 || gitStatus.stdout.trim().length > 0) {
    console.error('Deploy aborted: working tree must be clean before deploying to production.');
    process.exit(1);
  }
}

/** Date (YYYY-MM-DD) of the last commit that touched any of `relPaths`, or null if git has no record. */
function lastCommitDate(relPaths) {
  const res = spawnSync('git', ['log', '-1', '--format=%cs', '--', ...relPaths], { encoding: 'utf8', env });
  const date = res.status === 0 ? res.stdout.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/**
 * Source files of a sitemap URL: its Astro page (shared by every locale) plus the locale
 * dictionaries for translated pages (`/es/...`); pages without an Astro source map to public/.
 */
function sitemapUrlToFiles(loc) {
  const parts = new URL(loc).pathname.split('/').filter(Boolean);
  const locale = parts[0] && fs.existsSync(path.join('i18n', 'pages', `${parts[0]}.mjs`)) ? parts.shift() : null;
  const slug = parts[0] || 'index';
  const page = `site/src/pages/[...locale]/${slug}.astro`;
  if (!fs.existsSync(page)) return [`public/${slug}.html`];
  return locale ? [page, `i18n/pages/${locale}`, `i18n/pages/${locale}.mjs`] : [page];
}

/** Rewrites the staged sitemap so each <lastmod> becomes the last commit date of its page sources. */
function refreshSeoMetadata(dir) {
  const sitemapPath = path.join(dir, 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    const xml = fs.readFileSync(sitemapPath, 'utf8').replace(
      /(<loc>([^<]+)<\/loc>\s*<lastmod>)[^<]*(<\/lastmod>)/g,
      (match, head, loc, tail) => {
        const date = lastCommitDate(sitemapUrlToFiles(loc));
        return date ? `${head}${date}${tail}` : match;
      },
    );
    fs.writeFileSync(sitemapPath, xml, 'utf8');
  }
}

runCheck('pnpm', ['run', 'lint'], 'lint');
runCheck('pnpm', ['test'], 'tests');
// Astro builds the static pages into dist/site (JSON-LD softwareVersion comes from package.json).
buildSite();

const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'battle-tank-deploy-'));

let exitCode = 1;
try {
  fs.cpSync(SITE_DIR, stagingDir, { recursive: true });
  refreshSeoMetadata(stagingDir);
  const markdownPages = publishAgentMarkdown(stagingDir);
  console.log(`Markdown for agents: ${markdownPages.length} pages + llms-full.txt`);

  const args = [
    'wrangler',
    'pages',
    'deploy',
    stagingDir,
    '--project-name=battle-tank',
    ...(isPreview ? ['--commit-dirty=true'] : ['--branch=main']),
  ];

  const res = spawnSync('pnpm', ['exec', ...args], { stdio: 'inherit', shell: true, env });
  exitCode = res.status ?? 1;
} finally {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}

process.exit(exitCode);

