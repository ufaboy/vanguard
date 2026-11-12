// Copies only the Three.js files the game actually loads from node_modules/three into
// public/vendor/three (the native import map serves them without a bundler).
// Usage: npm run vendor   (after upgrading the "three" dependency)
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'node_modules/three';
const DEST = 'public/vendor/three';
// Modules the game imports (see public/index.html import map and public/src)
const ENTRIES = [
  'build/three.module.js',
  'examples/jsm/environments/RoomEnvironment.js',
  'examples/jsm/loaders/DRACOLoader.js',
  'examples/jsm/loaders/GLTFLoader.js',
  'examples/jsm/loaders/KTX2Loader.js',
];
// Non-module assets fetched at runtime (Draco decoder and Basis/KTX2 transcoder for the tank GLBs)
const EXTRA_DIRS = ['examples/jsm/libs/draco/gltf', 'examples/jsm/libs/basis'];

const IMPORT_RE =
  /(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolve(spec, from) {
  if (spec === 'three') return 'build/three.module.js';
  if (spec.startsWith('three/addons/')) return `examples/jsm/${spec.slice('three/addons/'.length)}`;
  if (spec.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  throw new Error(`Unexpected bare import "${spec}" in ${from}`);
}

const files = new Set();
function visit(rel) {
  if (files.has(rel)) return;
  files.add(rel);
  const source = fs.readFileSync(path.join(SRC, rel), 'utf8');
  for (const m of source.matchAll(IMPORT_RE)) visit(resolve(m[1] || m[2] || m[3], rel));
}
ENTRIES.forEach(visit);
for (const dir of EXTRA_DIRS) {
  for (const name of fs.readdirSync(path.join(SRC, dir))) files.add(`${dir}/${name}`);
}

fs.rmSync(DEST, { recursive: true, force: true });
for (const rel of [...files].sort()) {
  const target = path.join(DEST, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(SRC, rel), target);
  console.log(rel);
}
console.log(`${files.size} files copied to ${DEST}`);
