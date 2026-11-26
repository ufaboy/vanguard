import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TileType, SURFACE_CONFIGS, SURFACE_TYPES } from '../public/src/game/terrains/surfaces.js';
import { canPlaceOnSurface, cellMovement, isTilePassable } from '../public/src/game/terrains/layers.js';
import { PROP_KINDS, unpackTerrain } from '../public/src/game/terrains/terrain-format.js';
import { packTerrain } from '../editor/src/terrain-pack.js';

test('canPlaceOnSurface enforces rules for new surfaces and objects', () => {
  assert.equal(canPlaceOnSurface(TileType.RAIL_CAR, TileType.RAIL), true);
  assert.equal(canPlaceOnSurface(TileType.RAIL_CAR, TileType.EMPTY), false);
  assert.equal(canPlaceOnSurface(TileType.RAIL_CAR, TileType.ROAD), false);
  assert.equal(canPlaceOnSurface(TileType.RAIL_CAR, TileType.WATER), false);
  assert.equal(canPlaceOnSurface(TileType.LOCOMOTIVE, TileType.RAIL), true);
  assert.equal(canPlaceOnSurface(TileType.LOCOMOTIVE, TileType.EMPTY), false);

  for (const obj of [TileType.CONTAINER, TileType.TRANSFORMER, TileType.SANDBAGS]) {
    assert.equal(canPlaceOnSurface(obj, TileType.EMPTY), true);
    assert.equal(canPlaceOnSurface(obj, TileType.ROAD), true);
    assert.equal(canPlaceOnSurface(obj, TileType.RAIL), true);
    assert.equal(canPlaceOnSurface(obj, TileType.WATER), false);
    assert.equal(canPlaceOnSurface(obj, TileType.ICE), false);
  }
});

test('cellMovement applies RAIL speed bonus dynamically from SURFACE_CONFIGS', () => {
  const cfg = SURFACE_CONFIGS[SURFACE_TYPES.RAIL];
  const mv = cellMovement({ surface: TileType.RAIL, object: null }, {});
  assert.equal(mv.speedMultiplier, cfg.speedMultiplier);
  assert.equal(mv.accelMultiplier, cfg.accelMultiplier);
});

test('isTilePassable allows SANDBAGS only when canCrushSandbags is true', () => {
  assert.equal(isTilePassable(TileType.SANDBAGS, false, false), false);
  assert.equal(isTilePassable(TileType.SANDBAGS, true, false), false);
  assert.equal(isTilePassable(TileType.SANDBAGS, false, true), true);
  assert.equal(isTilePassable(TileType.CONTAINER, false, true), false);
  assert.equal(isTilePassable(TileType.TRANSFORMER, false, true), false);
  assert.equal(isTilePassable(TileType.RAIL_CAR, false, true), false);
  assert.equal(isTilePassable(TileType.LOCOMOTIVE, false, true), false);
  assert.equal(isTilePassable(TileType.RAIL, false, false), true);
});

test('unpackTerrain and packTerrain round-trip new tiles and props', () => {
  const terrain = {
    rail: [[10, 5, 1, 4]],
    rail_car: [[10, 6]],
    locomotive: [[10, 8]],
    container: [[12, 8, 1, 2]],
    transformer: [[14, 14]],
    sandbags: [[16, 10, 1, 3]],
    prop: [['lamp', 18, 19], ['car', 20, 12, 90]],
  };
  const unpacked = unpackTerrain(terrain, 40);
  assert.equal(unpacked.surfaceGrid[10][5], TileType.RAIL);
  assert.equal(unpacked.objectGrid[10][6], TileType.RAIL_CAR);
  assert.equal(unpacked.objectGrid[10][8], TileType.LOCOMOTIVE);
  assert.equal(unpacked.objectGrid[12][8], TileType.CONTAINER);
  assert.equal(unpacked.objectGrid[14][14], TileType.TRANSFORMER);
  assert.equal(unpacked.objectGrid[16][12], TileType.SANDBAGS);
  assert.equal(unpacked.props.length, 2);
  assert.deepEqual(unpacked.props[1], { kind: 'car', row: 20, col: 12, rotation: 90 });

  const repacked = packTerrain({
    surfaceGrid: unpacked.surfaceGrid,
    objectGrid: unpacked.objectGrid,
    props: unpacked.props,
  });
  assert.deepEqual(repacked.rail, [[10, 5, 1, 4]]);
  assert.deepEqual(repacked.rail_car, [[10, 6]]);
  assert.deepEqual(repacked.locomotive, [[10, 8]]);
  assert.deepEqual(repacked.container, [[12, 8, 1, 2]]);
  assert.deepEqual(repacked.transformer, [[14, 14]]);
  assert.deepEqual(repacked.sandbags, [[16, 10, 1, 3]]);
  assert.deepEqual(repacked.prop, [['lamp', 18, 19], ['car', 20, 12, 90]]);
});

test('all maps place RAIL_CAR on RAIL and use valid prop kinds', () => {
  const mapDirs = ['public/maps/campaign', 'public/maps/contracts', 'public/maps/survival'];
  const validKinds = new Set(PROP_KINDS);
  for (const dir of mapDirs) {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json') || file === 'index.json') continue;
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const size = raw.gridSize || 40;
      const { surfaceGrid, objectGrid, props } = unpackTerrain(raw.terrain, size);
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (objectGrid[r][c] === TileType.RAIL_CAR || objectGrid[r][c] === TileType.LOCOMOTIVE) {
            assert.equal(
              surfaceGrid[r][c],
              TileType.RAIL,
              `${file}: rail rolling stock at (${r},${c}) must sit on RAIL`
            );
          }
        }
      }
      for (const p of props) {
        assert.equal(validKinds.has(p.kind), true, `${file}: invalid prop kind ${p.kind}`);
        assert.equal(p.row >= 0 && p.row < size && p.col >= 0 && p.col < size, true);
      }
    }
  }
});
