import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { htmlToMarkdown, generateAgentMarkdown, publishAgentMarkdown } from '../scripts/build-markdown.mjs';
import { buildSite } from '../scripts/site.mjs';

// The static pages come from Astro: build the site once into a temp dir. The build also fails when a
// translated page has text missing from i18n/pages/<locale>.mjs.
let siteDir;
before(() => {
  siteDir = buildSite({ outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'astro-site-')), quiet: true });
});
after(() => fs.rmSync(siteDir, { recursive: true, force: true }));

const page = (body) => `<!doctype html><html><head>
<title>Test Page — BATTLE TANK</title>
<meta name="description" content="A &quot;quoted&quot; description." />
<link rel="canonical" href="https://battletank.online/enemies" />
</head><body><div id="root"><!-- prerender:start -->${body}<!-- prerender:end --></div>
<noscript><p>noscript fallback</p></noscript></body></html>`;

test('converts prerendered content to Markdown with front matter', () => {
  const html = page(`<main>
    <h1>Enemy &amp; Bosses</h1>
    <p class="lead">See the <a href="./arsenal">arsenal</a> and <strong>flank</strong> the <code>BOSS_DUAL</code>.</p>
    <span aria-hidden="true">decor</span><svg><path d="M0"/></svg><button>Settings</button>
    <article class="menu-card"><span class="menu-kicker">BOSS-01</span><strong>MAMMOTH</strong><p>Siege brawler.</p></article>
    <dl><div><dt>W A S D</dt><dd>Move</dd></div></dl>
    <ul><li>One</li><li>Two</li></ul>
    <footer><a href="./about">ABOUT</a></footer>
  </main>`);
  const linkMap = new Map([['https://battletank.online/arsenal', 'https://battletank.online/arsenal.md']]);
  const { markdown } = htmlToMarkdown(html, { linkMap });

  assert.match(markdown, /^---\ntitle: "Test Page — BATTLE TANK"\ndescription: "A \\"quoted\\" description."\nurl: https:\/\/battletank.online\/enemies\n---\n/);
  assert.match(markdown, /^# Enemy & Bosses$/m);
  assert.match(markdown, /See the \[arsenal\]\(https:\/\/battletank.online\/arsenal.md\) and \*\*flank\*\* the `BOSS_DUAL`\./);
  assert.match(markdown, /^## MAMMOTH\n\nBOSS-01\n\nSiege brawler\.$/m);
  assert.match(markdown, /^- \*\*W A S D\*\*: Move$/m);
  assert.match(markdown, /^- One\n- Two$/m);
  for (const hidden of ['decor', 'Settings', 'ABOUT', 'noscript fallback']) {
    assert.ok(!markdown.includes(hidden), `${hidden} must not appear`);
  }
});

test('every sitemap page produces Markdown and llms-full.txt', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-md-'));
  try {
    const pages = generateAgentMarkdown(siteDir, outDir);
    const sitemap = fs.readFileSync('public/sitemap.xml', 'utf8');
    assert.equal(pages.length, [...sitemap.matchAll(/<loc>/g)].length);
    for (const { mdFile } of pages) {
      const md = fs.readFileSync(path.join(outDir, mdFile), 'utf8');
      assert.match(md, /^# \S/m, `${mdFile} has an H1`);
      assert.ok(!/<[a-z][^>]*>/i.test(md.replace(/`[^`]*`/g, '')), `${mdFile} has no HTML tags`);
      assert.ok(!md.includes('PRIVACY POLICY'), `${mdFile} has no footer navigation`);
    }
    const full = fs.readFileSync(path.join(outDir, 'llms-full.txt'), 'utf8');
    assert.ok(full.includes('Source: https://battletank.online/enemies'));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('llms.txt links point to generated Markdown copies', () => {
  const llms = fs.readFileSync('public/llms.txt', 'utf8');
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-md-'));
  try {
    generateAgentMarkdown(siteDir, outDir);
    for (const [, file] of llms.matchAll(/https:\/\/battletank\.online\/([\w-]+\.md|llms-full\.txt)/g)) {
      assert.ok(fs.existsSync(path.join(outDir, file)), `${file} is generated`);
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('publish step links pages to Markdown and adds headers', () => {
  const publishDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-site-'));
  try {
    for (const file of ['sitemap.xml', '_headers', 'index.html', 'enemies.html']) {
      fs.copyFileSync(path.join(siteDir, file), path.join(publishDir, file));
    }
    publishAgentMarkdown(publishDir);
    const html = fs.readFileSync(path.join(publishDir, 'enemies.html'), 'utf8');
    assert.match(html, /<link rel="alternate" type="text\/markdown" href="https:\/\/battletank.online\/enemies.md" \/>\s*<\/head>/);
    const headers = fs.readFileSync(path.join(publishDir, '_headers'), 'utf8');
    assert.match(headers, /\/enemies\.md\n {2}Content-Type: text\/markdown; charset=utf-8\n {2}Link: <https:\/\/battletank.online\/enemies>; rel="canonical"/);
    assert.match(headers, /\/index\.md\n {2}Content-Type: text\/markdown; charset=utf-8\n {2}Link: <https:\/\/battletank.online\/>; rel="canonical"/);
  } finally {
    fs.rmSync(publishDir, { recursive: true, force: true });
  }
});
