import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLD_SIZE = 36;
const NEW_SIZE = 40;
const SPLIT_ROW = 18;
const SINGLETON_TILES = new Set(['G', 'H', 'E', 'Q', 'D']);

const tRow = (r) => (r < SPLIT_ROW ? r : r + 4);
const tCol = (c) => c + 2;

function sanitizeFillChar(ch) {
  return SINGLETON_TILES.has(ch.toUpperCase()) ? '.' : ch;
}

function sanitizeRow(rowStr) {
  return [...rowStr].map(sanitizeFillChar).join('');
}

function expandRow(rowStr) {
  const left = sanitizeFillChar(rowStr[0]).repeat(2);
  const right = sanitizeFillChar(rowStr[rowStr.length - 1]).repeat(2);
  return `${left}${rowStr}${right}`;
}

function expandLayout(layout) {
  const widened = layout.map(expandRow);
  const top = widened.slice(0, SPLIT_ROW);
  const bottom = widened.slice(SPLIT_ROW);
  const seamTop = sanitizeRow(widened[SPLIT_ROW - 1]);
  const seamBottom = sanitizeRow(widened[SPLIT_ROW]);
  return [...top, seamTop, seamTop, seamBottom, seamBottom, ...bottom];
}

function transformCell(cell) {
  if (!cell || typeof cell !== 'object') return cell;
  if (Number.isInteger(cell.row)) cell.row = tRow(cell.row);
  if (Number.isInteger(cell.col)) cell.col = tCol(cell.col);
  return cell;
}

function transformBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4) return bounds;
  return [tRow(bounds[0]), tCol(bounds[1]), tRow(bounds[2]), tCol(bounds[3])];
}

function migrateMap(map) {
  if (!Array.isArray(map.layout) || map.layout.length !== OLD_SIZE) {
    return false;
  }

  map.gridSize = NEW_SIZE;
  if (typeof map.code === 'string') {
    map.code = map.code.replaceAll('36×36', '40×40').replaceAll('36x36', '40x40');
  }
  map.layout = expandLayout(map.layout);

  transformCell(map.baseCell);
  transformCell(map.playerSpawnCell);
  if (map.enemyBase?.cell) transformCell(map.enemyBase.cell);
  if (map.boss?.spawnCell) transformCell(map.boss.spawnCell);
  if (Array.isArray(map.bossSequence)) {
    for (const stage of map.bossSequence) {
      if (Array.isArray(stage)) {
        for (const entry of stage) {
          if (entry?.spawnCell) transformCell(entry.spawnCell);
        }
      }
    }
  }
  if (Array.isArray(map.powerups)) {
    map.powerups.forEach(transformCell);
  }

  if (map.enemies) {
    if (map.enemies.boss?.spawnCell) transformCell(map.enemies.boss.spawnCell);
    if (Array.isArray(map.enemies.entrances)) map.enemies.entrances.forEach(transformCell);
    if (Array.isArray(map.enemies.fixedSpawns)) map.enemies.fixedSpawns.forEach(transformCell);
    if (Array.isArray(map.enemies.encounters)) {
      for (const enc of map.enemies.encounters) {
        if (Array.isArray(enc.initialCells)) enc.initialCells.forEach(transformCell);
        if (Array.isArray(enc.patrolRoute)) enc.patrolRoute.forEach(transformCell);
      }
    }
  }

  if (map.decoration) {
    if (Array.isArray(map.decoration.zones)) {
      for (const z of map.decoration.zones) z.bounds = transformBounds(z.bounds);
    }
    if (Array.isArray(map.decoration.exclusions)) {
      for (const e of map.decoration.exclusions) e.bounds = transformBounds(e.bounds);
    }
    if (Array.isArray(map.decoration.paths)) {
      for (const p of map.decoration.paths) {
        if (Array.isArray(p.points)) {
          p.points = p.points.map(([r, c]) => [tRow(r), tCol(c)]);
        }
      }
    }
    if (Array.isArray(map.decoration.landmarks)) {
      map.decoration.landmarks.forEach(transformCell);
    }
  }

  if (Array.isArray(map.design?.breaches)) {
    for (const breach of map.design.breaches) {
      if (Array.isArray(breach.cells)) breach.cells.forEach(transformCell);
      if (breach.start) transformCell(breach.start);
      if (breach.end) transformCell(breach.end);
    }
  }

  return true;
}

async function collectJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectJsonFiles(full)));
    else if (entry.name.endsWith('.json')) files.push(full);
  }
  return files.sort();
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mapsDir = path.join(root, 'public', 'maps');
const files = await collectJsonFiles(mapsDir);

let migrated = 0;
let skipped = 0;
for (const file of files) {
  const raw = await fs.readFile(file, 'utf8');
  const json = JSON.parse(raw);
  if (migrateMap(json)) {
    await fs.writeFile(file, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    migrated++;
  } else {
    skipped++;
  }
}

console.log(`Migrated ${migrated} maps to ${NEW_SIZE}x${NEW_SIZE} (skipped ${skipped} non-layout/already-migrated files).`);
