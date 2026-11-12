// Static check for unused code in public/src.
//
// Reports:
//   - imports that the importing file never uses;
//   - exports that no other file (source, tests, scripts, index.html) uses: either dead code, or
//     an `export` keyword that is not needed because only the file itself uses the name;
//   - class methods nobody calls (`.name`, `?.name`, `super.name` or a quoted 'name'), including
//     methods only called from other unused methods;
//   - fields assigned through `this.name = ...` that are never read anywhere.
// The check matches names, it does not resolve scopes, so it can miss dead code whose name is
// shared with live code, but every reported item has no reference at all.
// Add `// lint-dead-ignore` to the declaration line to keep something on purpose.

import fs from 'fs';
import path from 'path';

const IGNORE_MARK = 'lint-dead-ignore';
const NOT_METHODS = new Set(['constructor', 'if', 'for', 'while', 'switch', 'catch', 'function', 'return']);

/** Blanks comments (keeps line breaks) so names in comments do not count as uses. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

const escapeName = (name) => name.replace(/\$/g, '\\$');
const wordRe = (name) => new RegExp(`(?<![\\w$])${escapeName(name)}(?![\\w$])`, 'g');
const countWord = (text, name) => (text.match(wordRe(name)) || []).length;
const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/**
 * @param {string[]} sourceFiles  files under check (public/src)
 * @param {string[]} consumerFiles  files that may use source exports (tests, scripts, html)
 * @returns {{ file: string, line: number, message: string }[]}
 */
export function checkDeadCode(sourceFiles, consumerFiles = []) {
  const all = [...sourceFiles, ...consumerFiles];
  const raw = new Map(all.map((f) => [f, fs.readFileSync(f, 'utf8')]));
  const code = new Map(all.map((f) => [f, stripComments(raw.get(f))]));
  const problems = [];
  const report = (file, index, message) => {
    const line = lineAt(code.get(file), index);
    if (raw.get(file).split('\n')[line - 1]?.includes(IGNORE_MARK)) return;
    problems.push({ file: path.relative(process.cwd(), file).replace(/\\/g, '/'), line, message });
  };
  const usesOutside = (name, file) => {
    let n = 0;
    for (const [f, text] of code) if (f !== file) n += countWord(text, name);
    return n;
  };

  for (const file of sourceFiles) {
    const text = code.get(file);

    // 1. Imports the file never uses.
    for (const m of text.matchAll(/import\s+([\w$*{][\s\S]*?)\s+from\s+['"][^'"]+['"]/g)) {
      const clause = m[1];
      const names = [];
      const namespace = clause.match(/\*\s+as\s+([\w$]+)/);
      if (namespace) names.push(namespace[1]);
      const def = clause.match(/^([\w$]+)/);
      if (def) names.push(def[1]);
      const braces = clause.match(/\{([\s\S]*)\}/);
      if (braces) {
        for (const part of braces[1].split(',')) {
          const t = part.trim();
          if (t) names.push(t.split(/\s+as\s+/).pop().trim());
        }
      }
      for (const name of names) {
        if (countWord(text, name) - countWord(m[0], name) <= 0) report(file, m.index, `unused import "${name}"`);
      }
    }

    // 2. Exports nobody else uses.
    const exported = [];
    for (const m of text.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([\w$]+)/g)) {
      exported.push({ name: m[1], index: m.index });
    }
    for (const m of text.matchAll(/export\s*\{([^}]*)\}(?!\s*from)/g)) {
      for (const part of m[1].split(',')) {
        const t = part.trim();
        if (t) exported.push({ name: t.split(/\s+as\s+/).pop().trim(), index: m.index });
      }
    }
    for (const { name, index } of exported) {
      if (usesOutside(name, file) > 0) continue;
      report(
        file,
        index,
        countWord(text, name) > 1
          ? `"${name}" is only used in this file; drop the export`
          : `unused export "${name}"`
      );
    }
  }

  // 3. Class methods nobody calls (iterated so callers that are themselves dead do not count).
  const methods = [];
  for (const file of sourceFiles) {
    const text = code.get(file);
    for (const m of text.matchAll(/^ {2}(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?\*?([\w$]+)\s*\([^)]*\)\s*\{/gm)) {
      if (NOT_METHODS.has(m[1])) continue;
      const end = text.indexOf('\n  }', m.index);
      methods.push({ file, name: m[1], start: m.index, end: end < 0 ? text.length : end });
    }
  }
  const deadMethods = new Set();
  for (let changed = true; changed; ) {
    changed = false;
    for (const method of methods) {
      if (deadMethods.has(method)) continue;
      const useRe = new RegExp(`(?:\\.|\\?\\.|super\\.)${escapeName(method.name)}(?![\\w$])|['"\`]${escapeName(method.name)}['"\`]`, 'g');
      let uses = 0;
      for (const [f, text] of code) {
        for (const m of text.matchAll(useRe)) {
          const insideDead = methods.some(
            (o) => o.file === f && m.index > o.start && m.index < o.end && (o === method || deadMethods.has(o))
          );
          if (!insideDead) uses++;
        }
      }
      if (uses === 0) {
        deadMethods.add(method);
        changed = true;
      }
    }
  }
  for (const method of deadMethods) report(method.file, method.start, `unused method "${method.name}"`);

  // 4. Fields that are written but never read.
  const firstWrite = new Map();
  for (const file of sourceFiles) {
    for (const m of code.get(file).matchAll(/this\.([\w$]+)\s*(?:=(?!=)|\+\+|--|[+\-*/|&]=)/g)) {
      if (!firstWrite.has(m[1])) firstWrite.set(m[1], { file, index: m.index });
    }
  }
  for (const [name, { file, index }] of firstWrite) {
    const n = escapeName(name);
    const readRe = new RegExp(
      `\\.${n}(?![\\w$])(?!\\s*=(?!=))(?!\\s*(?:\\+\\+|--))|['"\`]${n}['"\`]|[{,]\\s*${n}\\s*[,}:]`,
      'g'
    );
    let reads = 0;
    for (const text of code.values()) reads += (text.match(readRe) || []).length;
    if (reads === 0) report(file, index, `field "${name}" is written but never read`);
  }

  return problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}
