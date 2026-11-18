/**
 * Builds an ad-free, tracker-free HTML5 distribution package for itch.io in `dist/itch/`
 * (and `dist/iron-vanguard-itch.zip` when zipping is available).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const PUBLIC_DIR = path.resolve(ROOT_DIR, 'public');
const OUT_DIR = path.resolve(ROOT_DIR, 'dist', 'itch');
const ZIP_PATH = path.resolve(ROOT_DIR, 'dist', 'iron-vanguard-itch.zip');

const EXCLUDED_ROOT_FILES = new Set([
  'ads.txt',
  'serve.json',
  '_headers',
  'robots.txt',
  'sitemap.xml',
]);

function restoreHtmlLinksForItch(html, htmlPages) {
  return html.replace(/href="\.\/([a-z0-9-]*)([?#][^"]*)?"/gi, (match, slug, suffix = '') => {
    if (!slug) {
      return `href="./index.html${suffix}"`;
    }
    if (htmlPages.has(`${slug}.html`)) {
      return `href="./${slug}.html${suffix}"`;
    }
    return match;
  });
}

function stripAdsAndAnalytics(html) {
  // The inline dataLayer block also holds the domain-gated GTM / AdSense loader, so removing it drops both.
  return html
    .replace(/^\s*<meta\s+name="google-adsense-account"[^>]*>\s*\r?\n?/gim, '')
    .replace(/^\s*<script>\s*\r?\n\s*window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\];[\s\S]*?<\/script>\s*\r?\n?/gim, '');
}

function sanitizeItchPrivacyPolicy(html) {
  return html
    .replace(
      /<p>BATTLE TANK is served as a static web application\.[^<]*<\/p>/i,
      '<p>This build of BATTLE TANK is served as a static HTML5 application on itch.io. Standard web hosting infrastructure may process basic technical request metadata—such as IP address, browser user-agent, requested URL, and timestamp—for security and reliable delivery.</p>'
    )
    .replace(
      /<section>\s*<h2>3\. Advertising, Cookies &amp; Third-Party Vendors<\/h2>[\s\S]*?<\/section>/i,
      `<section>
        <h2>3. Advertising &amp; Third-Party Links</h2>
        <p>This itch.io distribution does not load third-party advertising networks or analytics trackers. Pages may link to external platforms such as GitHub for source code or issue reporting; any external website you visit is governed by its own privacy policy.</p>
      </section>`
    );
}

function collectFiles(dir, baseDir = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      const stat = fs.statSync(fullPath);
      results.push({ fullPath, relPath, size: stat.size });
    }
  }
  return results;
}

function createZipArchive(sourceDir, zipPath) {
  if (fs.existsSync(zipPath)) {
    fs.rmSync(zipPath, { force: true });
  }
  if (process.platform === 'win32') {
    // PowerShell Compress-Archive writes Windows backslashes (`\`) in ZIP entry names,
    // which breaks directory extraction on Linux servers such as itch.io.
    // Use .NET ZipArchive with explicit POSIX `/` entry names instead.
    const psScript = [
      'Add-Type -AssemblyName System.IO.Compression',
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      `$src = (Resolve-Path '${sourceDir}').Path`,
      `$zip = [System.IO.Compression.ZipFile]::Open('${zipPath}', [System.IO.Compression.ZipArchiveMode]::Create)`,
      'try {',
      '  Get-ChildItem -Path $src -Recurse -File | ForEach-Object {',
      '    $rel = $_.FullName.Substring($src.Length + 1).Replace("\\", "/")',
      '    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null',
      '  }',
      '} finally {',
      '  $zip.Dispose()',
      '}',
    ].join('; ');
    const res = spawnSync('powershell', ['-NoProfile', '-Command', psScript], { stdio: 'inherit' });
    return res.status === 0;
  }
  const res = spawnSync('zip', ['-r', '-q', zipPath, '.'], { cwd: sourceDir, stdio: 'inherit' });
  return res.status === 0;
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

fs.cpSync(PUBLIC_DIR, OUT_DIR, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(PUBLIC_DIR, src).replace(/\\/g, '/');
    return !EXCLUDED_ROOT_FILES.has(rel);
  },
});

const outHtmlPages = new Set(fs.readdirSync(OUT_DIR).filter((entry) => entry.endsWith('.html')));
for (const entry of outHtmlPages) {
  const htmlPath = path.join(OUT_DIR, entry);
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = stripAdsAndAnalytics(html);
  html = restoreHtmlLinksForItch(html, outHtmlPages);
  if (entry === 'privacy-policy.html') {
    html = sanitizeItchPrivacyPolicy(html);
  }
  fs.writeFileSync(htmlPath, html, 'utf8');
}

const files = collectFiles(OUT_DIR);
const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
const maxFile = files.reduce((max, f) => (f.size > max.size ? f : max), { relPath: '', size: 0 });
const maxPathLen = files.reduce((max, f) => Math.max(max, f.relPath.length), 0);

console.log(`Built itch.io package in ${path.relative(ROOT_DIR, OUT_DIR)}`);
console.log(`- Files: ${files.length} (itch.io limit: 1000)`);
console.log(`- Total size: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB (itch.io limit: 500 MB)`);
console.log(`- Largest file: ${maxFile.relPath} (${(maxFile.size / (1024 * 1024)).toFixed(2)} MB, limit: 200 MB)`);
console.log(`- Max path length: ${maxPathLen} chars (itch.io limit: 240)`);

if (files.length > 1000 || totalBytes > 500 * 1024 * 1024 || maxFile.size > 200 * 1024 * 1024 || maxPathLen > 240) {
  console.error('itch.io ZIP limits exceeded!');
  process.exit(1);
}

if (!process.argv.includes('--no-zip')) {
  const zipped = createZipArchive(OUT_DIR, ZIP_PATH);
  if (zipped) {
    const zipMb = (fs.statSync(ZIP_PATH).size / (1024 * 1024)).toFixed(2);
    console.log(`- Archive: ${path.relative(ROOT_DIR, ZIP_PATH)} (${zipMb} MB)`);
  } else {
    console.warn('Warning: could not create ZIP archive automatically; zip the contents of dist/itch manually.');
  }
}
