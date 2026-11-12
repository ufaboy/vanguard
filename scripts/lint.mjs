import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { checkMissingMethods } from './lint-methods.mjs';
import { checkDeadCode } from './lint-dead-code.mjs';

function getJsFiles(dir, extensions = ['.js']) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getJsFiles(full, extensions));
    } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

const files = getJsFiles('public/src');
let failed = 0;
for (const file of files) {
  const res = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (res.status !== 0) failed++;
}

if (failed > 0) {
  console.error(`Lint failed on ${failed} file(s).`);
  process.exit(1);
}

const missing = checkMissingMethods(files);
for (const problem of missing) {
  console.error(`${problem.file}:${problem.line}  ${problem.message}`);
}
if (missing.length > 0) {
  console.error(`Lint failed: ${missing.length} call(s) to undefined methods.`);
  process.exit(1);
}

// Tests, scripts and the HTML entry may use source exports, so they count as consumers.
const consumers = [
  ...getJsFiles('tests', ['.js', '.mjs']),
  ...getJsFiles('scripts', ['.js', '.mjs']),
  'public/index.html',
].filter((file) => fs.existsSync(file));
const dead = checkDeadCode(files, consumers);
for (const problem of dead) {
  console.error(`${problem.file}:${problem.line}  ${problem.message}`);
}
if (dead.length > 0) {
  console.error(`Lint failed: ${dead.length} unused import(s), export(s), method(s) or field(s).`);
  process.exit(1);
}

console.log(`Lint passed: checked ${files.length} source files successfully (syntax + method calls + unused code).`);

