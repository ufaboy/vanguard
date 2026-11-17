import assert from 'node:assert/strict';
import test from 'node:test';

import { BUILDING_STYLE_COUNT, computeBuildingLayout } from '../public/src/game/terrains/building-layout.js';
import { BUILDING_MAX_HP, buildingDamageState } from '../public/src/game/terrains/building-models.js';
import { TileType } from '../public/src/game/terrains/surfaces.js';
import { isPassableCell, NAV_TILE } from '../public/src/sim/behavior/navgrid.js';

test('computeBuildingLayout leaves 1-tile-thick walls as standard blocks', () => {
  const E = TileType.EMPTY;
  const B = TileType.BRICK;
  const C = TileType.CONCRETE;
  const grid = [
    [E, B, E, C, E],
    [B, B, B, C, E],
    [E, B, E, C, C],
    [E, E, E, E, E],
    [E, E, E, E, E],
  ];
  const layout = computeBuildingLayout(grid);
  assert.equal(layout.size, 0);
});

test('computeBuildingLayout turns 2x2 BRICK into 4 outward-facing house1 corners sharing one style', () => {
  const E = TileType.EMPTY;
  const B = TileType.BRICK;
  const grid = [
    [E, E, E, E],
    [E, B, B, E],
    [E, B, B, E],
    [E, E, E, E],
  ];
  const layout = computeBuildingLayout(grid);
  assert.equal(layout.size, 4);
  const style = layout.get('1,1').style;
  assert.ok(Number.isInteger(style) && style >= 0 && style < BUILDING_STYLE_COUNT);
  assert.deepEqual(layout.get('1,1'), { kind: 'house1', part: 'corner', yaw: Math.PI, style });
  assert.deepEqual(layout.get('1,2'), { kind: 'house1', part: 'corner', yaw: Math.PI / 2, style });
  assert.deepEqual(layout.get('2,2'), { kind: 'house1', part: 'corner', yaw: 0, style });
  assert.deepEqual(layout.get('2,1'), { kind: 'house1', part: 'corner', yaw: -Math.PI / 2, style });
});

test('computeBuildingLayout turns 3x3 CONCRETE into corners, edges, and core of house2', () => {
  const E = TileType.EMPTY;
  const C = TileType.CONCRETE;
  const grid = [
    [E, E, E, E, E],
    [E, C, C, C, E],
    [E, C, C, C, E],
    [E, C, C, C, E],
    [E, E, E, E, E],
  ];
  const layout = computeBuildingLayout(grid);
  assert.equal(layout.size, 9);
  const style = layout.get('1,1').style;
  assert.equal(layout.get('1,1').kind, 'house2');
  assert.equal(layout.get('1,1').part, 'corner');
  assert.deepEqual(layout.get('1,2'), { kind: 'house2', part: 'edge', yaw: Math.PI, style });
  assert.deepEqual(layout.get('2,3'), { kind: 'house2', part: 'edge', yaw: Math.PI / 2, style });
  assert.deepEqual(layout.get('3,2'), { kind: 'house2', part: 'edge', yaw: 0, style });
  assert.deepEqual(layout.get('2,1'), { kind: 'house2', part: 'edge', yaw: -Math.PI / 2, style });
  assert.deepEqual(layout.get('2,2'), { kind: 'house2', part: 'core', yaw: 0, style });
});

test('buildingDamageState maps house1 (5 stages) and house2 (7 stages)', () => {
  // house1: 25 HP intact (5); CANNON_Mk1 (5 dmg) or 5x AUTOCANNON (1 dmg) -> state 4, then 3..1, then 0
  assert.deepEqual(
    [25, 20, 15, 10, 5, 0].map((hp) => buildingDamageState(hp, BUILDING_MAX_HP.house1, 'house1')),
    [5, 4, 3, 2, 1, 0]
  );
  assert.equal(buildingDamageState(24, BUILDING_MAX_HP.house1, 'house1'), 4);

  // house2: 70 HP intact (7), then 6..1 standing damage stages, then 0 rubble
  assert.deepEqual(
    [70, 65, 55, 45, 30, 15, 5, 0].map((hp) => buildingDamageState(hp, BUILDING_MAX_HP.house2, 'house2')),
    [7, 6, 5, 4, 3, 2, 1, 0]
  );
});

test('TileType.RUBBLE mirrors NAV_TILE.RUBBLE and is passable', () => {
  assert.equal(NAV_TILE.RUBBLE, TileType.RUBBLE);
  assert.equal(isPassableCell([[TileType.RUBBLE]], 0, 0, false), true);
});
