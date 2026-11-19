/**
 * Markdown for agents: converts every indexable static page (the pages listed in
 * sitemap.xml) into a clean Markdown copy that AI agents and LLM crawlers can read
 * without HTML noise, and bundles all of them into llms-full.txt.
 *
 * - `node scripts/build-markdown.mjs [outDir]` previews the output from public/ into
 *   outDir (default dist/agent-markdown) without touching public/.
 * - `scripts/deploy.mjs` calls `publishAgentMarkdown(stagingDir)`, which also adds a
 *   `<link rel="alternate" type="text/markdown">` to each page and Markdown headers
 *   (content type + canonical link back to the HTML page) to `_headers`.
 *
 * The converter is dependency-free and tuned to the markup of our own static pages:
 * it reads only the prerendered block between `<!-- prerender:start -->` and
 * `<!-- prerender:end -->` and drops the footer, buttons, SVG icons, images and
 * decorative `aria-hidden` elements.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_ORIGIN = 'https://battletank.online';

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT_TAGS = new Set(['script', 'style']);
const SKIPPED_TAGS = new Set(['script', 'style', 'svg', 'button', 'footer', 'noscript', 'img', 'template', 'form', 'iframe']);
const INLINE_TAGS = new Set(['a', 'span', 'strong', 'b', 'em', 'i', 'small', 'code', 'br', 'abbr', 'time', 'mark', 'sup', 'sub', 'kbd']);

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–',
  hellip: '…', laquo: '«', raquo: '»', rarr: '→', larr: '←', times: '×', middot: '·',
  copy: '©', reg: '®', trade: '™', deg: '°', bull: '•', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
};

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const value = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

function parseAttributes(source) {
  const attrs = {};
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(source))) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** Minimal HTML parser: returns a root node `{ tag, attrs, children }`; text nodes are strings. */
function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+|<)/gi;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) {
      top.children.push(decodeEntities(m[4]));
    } else if (m[2] !== undefined) {
      const tag = m[2].toLowerCase();
      const rawAttrs = m[3] ?? '';
      const node = { tag, attrs: parseAttributes(rawAttrs.replace(/\/\s*$/, '')), children: [] };
      top.children.push(node);
      if (RAW_TEXT_TAGS.has(tag)) {
        const close = html.toLowerCase().indexOf(`</${tag}`, re.lastIndex);
        const end = close === -1 ? html.length : close;
        node.children.push(html.slice(re.lastIndex, end));
        re.lastIndex = end;
        const after = html.indexOf('>', end);
        re.lastIndex = after === -1 ? html.length : after + 1;
      } else if (!VOID_TAGS.has(tag) && !/\/\s*$/.test(rawAttrs)) {
        stack.push(node);
      }
    } else if (m[1] !== undefined) {
      const tag = m[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
    }
  }
  return root;
}

function isSkipped(node) {
  return SKIPPED_TAGS.has(node.tag) || node.attrs['aria-hidden'] === 'true' || 'hidden' in node.attrs;
}

function isInline(node) {
  return typeof node === 'string' || INLINE_TAGS.has(node.tag);
}

function escapeMarkdown(text) {
  return text.replace(/([\\`*_[\]])/g, '\\$1');
}

/** Wraps trimmed content in a marker while keeping its outer whitespace. */
function wrap(content, marker) {
  const trimmed = content.trim();
  if (!trimmed) return content;
  const lead = content.match(/^\s*/)[0];
  const tail = content.match(/\s*$/)[0];
  return `${lead}${marker}${trimmed}${marker}${tail}`;
}

function textContent(node) {
  if (typeof node === 'string') return node;
  if (isSkipped(node)) return '';
  return node.children.map(textContent).join('');
}

function hasBlockDescendant(node) {
  return node.children.some((child) => typeof child !== 'string' && !isSkipped(child) && (!isInline(child) || hasBlockDescendant(child)));
}

function clean(text) {
  return text.replace(/\s+/g, ' ').trim();
}

class MarkdownRenderer {
  /**
   * @param {object} options
   * @param {string} options.pageUrl  absolute URL of the page (resolves relative links)
   * @param {Map<string, string>} [options.linkMap]  HTML page URL -> Markdown URL for internal links
   */
  constructor({ pageUrl, linkMap = new Map() }) {
    this.pageUrl = pageUrl;
    this.linkMap = linkMap;
    this.blocks = [];
    this.headingLevel = 1;
  }

  resolveLink(href) {
    if (!href || href.startsWith('#') || /^(javascript|data):/i.test(href)) return null;
    let url;
    try {
      url = new URL(href, this.pageUrl);
    } catch {
      return null;
    }
    if (url.origin === SITE_ORIGIN) {
      const key = `${url.origin}${url.pathname.replace(/\.html$/, '').replace(/\/index$/, '/')}`;
      if (this.linkMap.has(key)) return `${this.linkMap.get(key)}${url.hash}`;
    }
    return url.href;
  }

  inline(node) {
    if (typeof node === 'string') return escapeMarkdown(node.replace(/\s+/g, ' '));
    if (isSkipped(node)) return '';
    const inner = () => node.children.map((child) => this.inline(child)).join('');
    switch (node.tag) {
      case 'br':
        return ' ';
      case 'strong':
      case 'b':
        return wrap(inner(), '**');
      case 'em':
      case 'i':
        return wrap(inner(), '_');
      case 'code':
      case 'kbd': {
        const code = clean(textContent(node));
        return code ? `\`${code}\`` : '';
      }
      case 'a': {
        const text = escapeMarkdown(clean(textContent(node)));
        const href = this.resolveLink(node.attrs.href);
        if (!text) return '';
        return href ? `[${text}](${href})` : text;
      }
      default: {
        // Inline-level wrappers and block elements nested inside inline content.
        const content = inner();
        return INLINE_TAGS.has(node.tag) ? content : ` ${content} `;
      }
    }
  }

  paragraph(text) {
    const value = clean(text).replace(/\s+([.,;:!?)])(?=\s|$)/g, '$1');
    if (value) this.blocks.push(value);
  }

  heading(level, text) {
    const value = clean(text);
    if (!value) return;
    this.headingLevel = level;
    this.blocks.push(`${'#'.repeat(level)} ${value}`);
  }

  list(node, ordered) {
    const items = node.children
      .filter((child) => typeof child !== 'string' && child.tag === 'li' && !isSkipped(child))
      .map((li, index) => `${ordered ? `${index + 1}.` : '-'} ${clean(this.inline(li))}`)
      .filter((line) => !/^(-|\d+\.)\s*$/.test(line));
    if (items.length) this.blocks.push(items.join('\n'));
  }

  definitionList(node) {
    const lines = [];
    let term = null;
    const visit = (parent) => {
      for (const child of parent.children) {
        if (typeof child === 'string' || isSkipped(child)) continue;
        if (child.tag === 'dt') term = clean(this.inline(child));
        else if (child.tag === 'dd') {
          const desc = clean(this.inline(child));
          lines.push(term ? `- **${term}**: ${desc}` : `- ${desc}`);
          term = null;
        } else visit(child);
      }
    };
    visit(node);
    if (lines.length) this.blocks.push(lines.join('\n'));
  }

  /** Card-like articles: a direct `<strong>` child is the card title. */
  article(node) {
    const children = node.children.filter((child) => typeof child === 'string' || !isSkipped(child));
    const title = children.find((child) => typeof child !== 'string' && (child.tag === 'strong' || child.tag === 'b'));
    if (!title) {
      this.container(node);
      return;
    }
    const level = Math.min(this.headingLevel + 1, 6);
    const outer = this.headingLevel;
    this.heading(level, this.inline({ ...title, tag: 'span' }));
    this.container({ ...node, children: children.filter((child) => child !== title) });
    this.headingLevel = outer;
  }

  container(node) {
    let buffer = '';
    for (const child of node.children) {
      if (typeof child !== 'string' && isSkipped(child)) continue;
      if (typeof child !== 'string' && child.tag === 'a' && hasBlockDescendant(child)) {
        // Card links that wrap whole blocks: keep the blocks, then add the link on its own line.
        this.paragraph(buffer);
        buffer = '';
        this.linkedCard(child);
        continue;
      }
      if (isInline(child)) {
        // Standalone inline elements (kickers, card links) become their own paragraphs.
        if (typeof child !== 'string' && child.tag !== 'br' && buffer.trim() === '' && this.isStandalone(node, child)) {
          this.paragraph(this.inline(child));
          continue;
        }
        buffer += this.inline(child);
        continue;
      }
      this.paragraph(buffer);
      buffer = '';
      this.block(child);
    }
    this.paragraph(buffer);
  }

  linkedCard(node) {
    this.container({ ...node, tag: 'div' });
    const href = this.resolveLink(node.attrs.href);
    const titleNode = findFirst(node, (n) => /^(h[1-6]|strong|b)$/.test(n.tag) && !isSkipped(n));
    const title = escapeMarkdown(clean(textContent(titleNode ?? node)));
    if (href && title) this.paragraph(`Link: [${title}](${href})`);
  }

  isStandalone(parent, child) {
    const siblings = parent.children.filter((c) => typeof c !== 'string' || c.trim() !== '');
    const index = siblings.indexOf(child);
    const next = siblings[index + 1];
    return next === undefined || (typeof next !== 'string' && !isInline(next)) || (typeof next !== 'string' && next.tag !== 'br' && isInline(next));
  }

  block(node) {
    if (isSkipped(node)) return;
    const headingMatch = /^h([1-6])$/.exec(node.tag);
    if (headingMatch) {
      this.heading(Number(headingMatch[1]), this.inline({ ...node, tag: 'span' }));
      return;
    }
    switch (node.tag) {
      case 'p':
      case 'figcaption':
      case 'dt':
      case 'dd':
      case 'li':
        this.paragraph(this.inline({ ...node, tag: 'span' }));
        return;
      case 'blockquote':
        this.paragraph(`> ${clean(this.inline({ ...node, tag: 'span' }))}`);
        return;
      case 'ul':
        this.list(node, false);
        return;
      case 'ol':
        this.list(node, true);
        return;
      case 'dl':
        this.definitionList(node);
        return;
      case 'article':
        this.article(node);
        return;
      case 'hr':
        this.blocks.push('---');
        return;
      default:
        this.container(node);
    }
  }

  render(root) {
    this.container(root);
    return this.blocks.join('\n\n');
  }
}

function findFirst(node, predicate) {
  if (typeof node === 'string') return null;
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = findFirst(child, predicate);
    if (found) return found;
  }
  return null;
}

function yamlString(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Converts one static page into Markdown with YAML front matter.
 * @returns {{ title: string, description: string, url: string, body: string, markdown: string }}
 */
export function htmlToMarkdown(html, { pageUrl, linkMap } = {}) {
  const head = parseHtml(html.slice(0, Math.max(html.indexOf('<body'), 0)) || html);
  const title = clean(textContent(findFirst(head, (n) => n.tag === 'title') ?? { tag: 'x', attrs: {}, children: [] }));
  const description = findFirst(head, (n) => n.tag === 'meta' && n.attrs.name === 'description')?.attrs.content ?? '';
  const canonical = findFirst(head, (n) => n.tag === 'link' && n.attrs.rel === 'canonical')?.attrs.href;
  const url = canonical || pageUrl || `${SITE_ORIGIN}/`;

  const start = html.indexOf('<!-- prerender:start -->');
  const end = html.indexOf('<!-- prerender:end -->');
  if (start === -1 || end === -1) throw new Error(`No prerendered content block in ${url}`);
  const content = parseHtml(html.slice(start, end));
  const body = new MarkdownRenderer({ pageUrl: url, linkMap }).render(content);

  const frontMatter = ['---', `title: ${yamlString(title)}`];
  if (description) frontMatter.push(`description: ${yamlString(clean(description))}`);
  frontMatter.push(`url: ${url}`, '---');
  return { title, description: clean(description), url, body, markdown: `${frontMatter.join('\n')}\n\n${body}\n` };
}

/** Indexable pages from sitemap.xml: `{ url, htmlFile, mdFile }` (paths relative to the site dir). */
function listSitemapPages(siteDir) {
  const xml = fs.readFileSync(path.join(siteDir, 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => {
    // `/` → index, `/es/` → es/index (a translated home), `/enemies` → enemies.
    const { pathname } = new URL(loc);
    const trimmed = pathname.replace(/^\/|\/$/g, '');
    const slug = !trimmed ? 'index' : pathname.endsWith('/') ? `${trimmed}/index` : trimmed;
    return { url: loc, htmlFile: `${slug}.html`, mdFile: `${slug}.md` };
  });
}

/**
 * Writes `<page>.md` for every sitemap page plus `llms-full.txt` into outDir.
 * @returns {Array<{ url: string, htmlFile: string, mdFile: string, mdUrl: string }>}
 */
export function generateAgentMarkdown(srcDir, outDir = srcDir) {
  const pages = listSitemapPages(srcDir).filter((page) => fs.existsSync(path.join(srcDir, page.htmlFile)));
  const linkMap = new Map(pages.map((page) => [page.url.replace(/\/$/, '') || SITE_ORIGIN, `${SITE_ORIGIN}/${page.mdFile}`]));
  linkMap.set(`${SITE_ORIGIN}/`, `${SITE_ORIGIN}/index.md`);
  fs.mkdirSync(outDir, { recursive: true });

  const sections = [];
  const result = pages.map((page) => {
    const html = fs.readFileSync(path.join(srcDir, page.htmlFile), 'utf8');
    const { markdown, body, url } = htmlToMarkdown(html, { pageUrl: page.url, linkMap });
    fs.mkdirSync(path.dirname(path.join(outDir, page.mdFile)), { recursive: true });
    fs.writeFileSync(path.join(outDir, page.mdFile), markdown, 'utf8');
    sections.push(`${body}\n\nSource: ${url}`);
    return { ...page, mdUrl: `${SITE_ORIGIN}/${page.mdFile}` };
  });

  const full = [
    '# BATTLE TANK — Full Site Content',
    `> Every public page of ${SITE_ORIGIN}/ in Markdown, generated from the site's static HTML. Index: ${SITE_ORIGIN}/llms.txt`,
    ...sections,
  ].join('\n\n---\n\n');
  fs.writeFileSync(path.join(outDir, 'llms-full.txt'), `${full}\n`, 'utf8');
  return result;
}

/**
 * Deploy step on the staged site copy: generates the Markdown files, advertises them from
 * each HTML page and serves them with a Markdown content type and a canonical link header.
 */
export function publishAgentMarkdown(siteDir) {
  const pages = generateAgentMarkdown(siteDir, siteDir);
  const headerRules = [];
  for (const page of pages) {
    const htmlPath = path.join(siteDir, page.htmlFile);
    const html = fs.readFileSync(htmlPath, 'utf8');
    if (!html.includes('type="text/markdown"')) {
      const link = `    <link rel="alternate" type="text/markdown" href="${page.mdUrl}" />\n`;
      fs.writeFileSync(htmlPath, html.replace(/(\s*)<\/head>/i, `\n${link}  </head>`), 'utf8');
    }
    headerRules.push(`/${page.mdFile}`, '  Content-Type: text/markdown; charset=utf-8', `  Link: <${page.url}>; rel="canonical"`, '');
  }
  headerRules.push('/llms-full.txt', '  Content-Type: text/plain; charset=utf-8', '');
  const headersPath = path.join(siteDir, '_headers');
  const existing = fs.existsSync(headersPath) ? fs.readFileSync(headersPath, 'utf8').replace(/\s*$/, '\n') : '';
  fs.writeFileSync(headersPath, `${existing}\n# Markdown for agents (generated by scripts/build-markdown.mjs)\n${headerRules.join('\n')}`, 'utf8');
  return pages;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = path.resolve(process.argv[2] ?? 'dist/agent-markdown');
  const pages = generateAgentMarkdown(path.resolve('public'), outDir);
  console.log(`Wrote ${pages.length} Markdown pages and llms-full.txt to ${outDir}`);
}
