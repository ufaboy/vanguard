// Static check for calls to methods that do not exist.
//
// `node --check` only validates syntax, so a call such as `this.addCredits()` to a method that was
// never written passes lint and then throws at runtime, which stops the game loop. This check
// resolves, per class:
//   - `this.method(...)`                    against the class and its `extends` chain;
//   - `this.field.method(...)`              when the class assigns `this.field = new KnownClass(...)`;
//   - `singleton.method(...)`               for module exports like `export const sound = new SoundManager()`.
// A method counts as defined when it is declared in the class body (incl. get/set/static/async),
// declared as a class field, or assigned anywhere in the class via `this.name = ...`.
// Optional calls (`this.hook?.()`) are skipped: they explicitly allow the method to be missing.
// Add `// lint-methods-ignore` to a line to skip it.

import fs from 'fs';
import path from 'path';

const IDENT = '[A-Za-z_$][\\w$]*';

/** Replaces comments and string/template contents with spaces so braces and calls inside them are ignored. */
function blankNonCode(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  const tplStack = [];
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
    } else if (c === '/' && d === '*') {
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2;
    } else if (c === '"' || c === "'") {
      out += c; i++;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\') { out += ' '; i++; }
        out += ' '; i++;
      }
      out += src[i] ?? ''; i++;
    } else if (c === '`' || (c === '}' && tplStack.length && tplStack[tplStack.length - 1] === 0)) {
      if (c === '}') tplStack.pop();
      out += c; i++;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') { out += ' '; i += 2; out += ' '; continue; }
        if (src[i] === '$' && src[i + 1] === '{') { out += '${'; i += 2; tplStack.push(0); break; }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
      if (src[i] === '`') { out += '`'; i++; }
    } else {
      if (tplStack.length) {
        if (c === '{') tplStack[tplStack.length - 1]++;
        else if (c === '}') tplStack[tplStack.length - 1]--;
      }
      out += c; i++;
    }
  }
  return out;
}

/** Finds `class Name [extends Base] { ... }` blocks in already blanked code. */
function findClasses(code) {
  const classes = [];
  const re = new RegExp(`\\bclass\\s+(${IDENT})(?:\\s+extends\\s+(${IDENT}))?\\s*\\{`, 'g');
  for (const m of code.matchAll(re)) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let end = open;
    for (let i = open; i < code.length; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}' && --depth === 0) { end = i; break; }
    }
    classes.push({ name: m[1], base: m[2] || null, start: open + 1, end });
  }
  return classes;
}

/** Collects the methods a class body declares and the `this.field = new X()` field types it assigns. */
function analyzeClassBody(body) {
  const methods = new Set();
  const fieldTypes = new Map();
  let depth = 0;
  let lineStart = true;
  let line = '';
  const flush = (lineDepth) => {
    if (lineDepth !== 0) return;
    const decl = line.match(new RegExp(`^\\s*(?:static\\s+)?(?:async\\s+)?(?:\\*\\s*)?(?:get\\s+|set\\s+)?(#?${IDENT})\\s*(?:\\(|=)`));
    if (decl) methods.add(decl[1]);
  };
  let lineDepth = 0;
  for (const ch of body) {
    if (lineStart) { lineDepth = depth; lineStart = false; }
    if (ch === '\n') { flush(lineDepth); line = ''; lineStart = true; continue; }
    line += ch;
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  flush(lineDepth);
  for (const m of body.matchAll(new RegExp(`this\\.(${IDENT})\\s*(?:\\|\\||\\?\\?|&&)?=(?!=)`, 'g'))) methods.add(m[1]);
  for (const m of body.matchAll(new RegExp(`this\\.(${IDENT})\\s*=\\s*new\\s+(${IDENT})\\s*\\(`, 'g'))) {
    fieldTypes.set(m[1], m[2]);
  }
  return { methods, fieldTypes };
}

const lineOf = (code, index) => code.slice(0, index).split('\n').length;

/**
 * Returns a list of `{ file, line, message }` for calls to methods that are not defined.
 * @param {string[]} files Absolute or relative paths of the .js sources to analyze.
 */
export function checkMissingMethods(files) {
  const parsed = files.map((file) => {
    const raw = fs.readFileSync(file, 'utf8');
    return { file, raw, rawLines: raw.split('\n'), code: blankNonCode(raw) };
  });

  // Pass 1: every class across the project, plus exported singletons.
  const classes = new Map();
  const singletons = new Map(); // exported name -> class name
  for (const p of parsed) {
    p.classes = findClasses(p.code);
    for (const c of p.classes) {
      const info = analyzeClassBody(p.code.slice(c.start, c.end));
      classes.set(c.name, { ...c, ...info, file: p.file });
    }
    for (const m of p.code.matchAll(new RegExp(`export\\s+const\\s+(${IDENT})\\s*=\\s*new\\s+(${IDENT})\\s*\\(`, 'g'))) {
      singletons.set(m[1], m[2]);
    }
  }

  // Methods of a class including its local ancestors; null when the chain leaves the project
  // (for example `extends THREE.Group`), because then the full method set is unknown.
  const resolved = new Map();
  const methodsOf = (name, seen = new Set()) => {
    if (resolved.has(name)) return resolved.get(name);
    const c = classes.get(name);
    if (!c || seen.has(name)) return null;
    seen.add(name);
    let result = new Set(c.methods);
    if (c.base) {
      const inherited = methodsOf(c.base, seen);
      result = inherited ? new Set([...result, ...inherited]) : null;
    }
    resolved.set(name, result);
    return result;
  };

  const problems = [];
  const report = (p, index, message) => {
    const line = lineOf(p.code, index);
    if (p.rawLines[line - 1]?.includes('lint-methods-ignore')) return;
    problems.push({ file: p.file, line, message });
  };

  for (const p of parsed) {
    for (const c of p.classes) {
      const own = methodsOf(c.name);
      const body = p.code.slice(c.start, c.end);
      const fieldTypes = classes.get(c.name).fieldTypes;

      if (own) {
        for (const m of body.matchAll(new RegExp(`this\\.(${IDENT})\\s*\\(`, 'g'))) {
          if (!own.has(m[1])) report(p, c.start + m.index, `${c.name} has no method "${m[1]}" (this.${m[1]}())`);
        }
      }

      for (const m of body.matchAll(new RegExp(`this\\.(${IDENT})\\s*\\??\\.\\s*(${IDENT})\\s*\\(`, 'g'))) {
        const type = fieldTypes.get(m[1]);
        const target = type && methodsOf(type);
        if (target && !target.has(m[2])) {
          report(p, c.start + m.index, `${type} has no method "${m[2]}" (this.${m[1]}.${m[2]}())`);
        }
      }
    }

    for (const [name, type] of singletons) {
      const imported = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`).test(p.code);
      const declaredHere = new RegExp(`export\\s+const\\s+${name}\\s*=`).test(p.code);
      const target = methodsOf(type);
      if (!(imported || declaredHere) || !target) continue;
      for (const m of p.code.matchAll(new RegExp(`(?<![\\w$.])${name}\\s*\\??\\.\\s*(${IDENT})\\s*\\(`, 'g'))) {
        if (!target.has(m[1])) report(p, m.index, `${type} has no method "${m[1]}" (${name}.${m[1]}())`);
      }
    }
  }

  return problems.map((pr) => ({ ...pr, file: path.relative(process.cwd(), pr.file) }));
}
