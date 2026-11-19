/** Runs Cloudflare Pages deploy while loading per-project `.env` variables if present. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { publishAgentMarkdown } from './build-markdown.mjs';
import { PAGE_LOCALES } from './build-i18n-pages.mjs';

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
const publicDir = path.resolve(process.cwd(), 'public');

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

/** Date (YYYY-MM-DD) of the last commit that touched `relPath`, or null if git has no record. */
function lastCommitDate(relPath) {
  const res = spawnSync('git', ['log', '-1', '--format=%cs', '--', relPath], { encoding: 'utf8', env });
  const date = res.status === 0 ? res.stdout.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** Maps a sitemap URL to the HTML file in public/ that serves it. */
function sitemapUrlToFile(loc) {
  const { pathname } = new URL(loc);
  if (pathname.endsWith('/')) return `public${pathname}index.html`;
  return `public${pathname}.html`;
}

/**
 * Rewrites the staged copy so search engines see fresh metadata:
 * each sitemap <lastmod> becomes the last commit date of its page, and the
 * home page JSON-LD softwareVersion follows package.json.
 */
function refreshSeoMetadata(dir) {
  const sitemapPath = path.join(dir, 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    const xml = fs.readFileSync(sitemapPath, 'utf8').replace(
      /(<loc>([^<]+)<\/loc>\s*<lastmod>)[^<]*(<\/lastmod>)/g,
      (match, head, loc, tail) => {
        const date = lastCommitDate(sitemapUrlToFile(loc));
        return date ? `${head}${date}${tail}` : match;
      },
    );
    fs.writeFileSync(sitemapPath, xml, 'utf8');
  }

  const { version } = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
  // The home page and its translated twins (public/<locale>/index.html) carry the version.
  const homePaths = ['index.html', ...PAGE_LOCALES.map((locale) => path.join(locale, 'index.html'))];
  for (const homeFile of homePaths) {
    const homePath = path.join(dir, homeFile);
    if (!version || !fs.existsSync(homePath)) continue;
    const html = fs.readFileSync(homePath, 'utf8')
      .replace(/("softwareVersion":\s*")[^"]*(")/, `$1${version}$2`);
    fs.writeFileSync(homePath, html, 'utf8');
  }
}

runCheck('npm', ['run', 'lint'], 'lint');
runCheck('npm', ['test'], 'tests');

const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'battle-tank-deploy-'));

let exitCode = 1;
try {
  fs.cpSync(publicDir, stagingDir, { recursive: true });
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

  const res = spawnSync('npx', args, { stdio: 'inherit', shell: true, env });
  exitCode = res.status ?? 1;
} finally {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}

process.exit(exitCode);

