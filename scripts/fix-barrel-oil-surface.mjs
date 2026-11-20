import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BARREL_TOKENS = new Set(['D', 'O']);
const OIL_TOKEN = 'L';
const NEIGHBOR_OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

async function collectMapFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectMapFiles(fullPath));
    } else if (entry.name.endsWith('.json') && entry.name !== 'index.json') {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function hasAdjacentOil(surfaceLayout, row, col) {
  for (const [dr, dc] of NEIGHBOR_OFFSETS) {
    if (surfaceLayout[row + dr]?.[col + dc] === OIL_TOKEN) {
      return true;
    }
  }
  return false;
}

function updateMapBarrels(map) {
  const { surfaceLayout, objectLayout } = map;
  if (!Array.isArray(surfaceLayout) || !Array.isArray(objectLayout)) {
    return [];
  }

  const changes = [];
  for (let r = 0; r < objectLayout.length; r++) {
    const objRow = objectLayout[r] || '';
    const surfRow = surfaceLayout[r] || '';
    const chars = surfRow.split('');
    let rowChanged = false;

    for (let c = 0; c < objRow.length; c++) {
      if (!BARREL_TOKENS.has(objRow[c])) continue;
      if (chars[c] === OIL_TOKEN) continue;
      if (!hasAdjacentOil(surfaceLayout, r, c)) continue;

      changes.push({ row: r, col: c, previousSurface: chars[c], nextSurface: OIL_TOKEN });
      chars[c] = OIL_TOKEN;
      rowChanged = true;
    }

    if (rowChanged) {
      surfaceLayout[r] = chars.join('');
    }
  }

  return changes;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mapsDir = path.join(root, 'public/maps');
const mapFiles = await collectMapFiles(mapsDir);

let updatedFiles = 0;
let updatedCells = 0;

for (const filePath of mapFiles) {
  const raw = await fs.readFile(filePath, 'utf8');
  const map = JSON.parse(raw);
  const changes = updateMapBarrels(map);

  if (changes.length === 0) continue;

  const trailingNewline = raw.endsWith('\n') ? '\n' : '';
  await fs.writeFile(filePath, `${JSON.stringify(map, null, 2)}${trailingNewline}`, 'utf8');
  updatedFiles += 1;
  updatedCells += changes.length;

  const relPath = path.relative(root, filePath).replaceAll('\\', '/');
  const coords = changes.map(({ row, col, previousSurface }) => `(${row},${col}:${previousSurface}->L)`).join(', ');
  console.log(`${relPath}: ${changes.length} cell(s) updated [${coords}]`);
}

console.log(`Checked ${mapFiles.length} map(s); updated ${updatedCells} cell(s) across ${updatedFiles} file(s).`);
