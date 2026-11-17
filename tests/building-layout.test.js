import assert from 'node:assert/strict';
import test from 'node:test';

import { BUILDING_STYLE_COUNT, computeBuildingLayout } from '../public/src/game/terrains/building-layout.js';
import { BUILDING_MAX_HP, buildingDamageState } from '../public/src/game/terrains/building-models.js';
import { TileType } from '../public/src/game/terrains/surfaces.js';
import { isPassableCell, NAV_TILE } from '../public/src/sim/behavior/navgrid.js';

test('computeBuildingLayout leaves BRICK and CONCRETE blocks untouched even in 2x2 clusters', () => {
  const E = TileType.EMPTY;
  const B = TileType.BRICK;
  const C = TileType.CONCRETE;
  const grid = [
    [E, B, B, C, C],
    [B, B, B, C, C],
    [E, B, E, E, E],
    [E, E, E, E, E],
    [E, E, E, E, E],
  ];
  const layout = computeBuildingLayout(grid);
  assert.equal(layout.size, 0);
});

test('computeBuildingLayout turns 2x2 HOUSE_1 into 4 outward-facing house1 corners sharing one style', () => {
  const E = TileType.EMPTY;
  const H1 = TileType.HOUSE_1;
  const grid = [
    [E, E, E, E],
    [E, H1, H1, E],
    [E, H1, H1, E],
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

test('computeBuildingLayout turns 3x3 HOUSE_2 into corners, edges, and core of house2', () => {
  const E = TileType.EMPTY;
  const H2 = TileType.HOUSE_2;
  const grid = [
    [E, E, E, E, E],
    [E, H2, H2, H2, E],
    [E, H2, H2, H2, E],
    [E, H2, H2, H2, E],
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
  assert.deepEqual(
    [25, 20, 15, 10, 5, 0].map((hp) => buildingDamageState(hp, BUILDING_MAX_HP.house1, 'house1')),
    [5, 4, 3, 2, 1, 0]
  );
  assert.equal(buildingDamageState(24, BUILDING_MAX_HP.house1, 'house1'), 4);

  assert.deepEqual(
    [70, 65, 55, 45, 30, 15, 5, 0].map((hp) => buildingDamageState(hp, BUILDING_MAX_HP.house2, 'house2')),
    [7, 6, 5, 4, 3, 2, 1, 0]
  );
});

test('TileType.RUBBLE mirrors NAV_TILE.RUBBLE and is passable; HOUSE_1/HOUSE_2 mirror and block', () => {
  assert.equal(NAV_TILE.RUBBLE, TileType.RUBBLE);
  assert.equal(NAV_TILE.HOUSE_1, TileType.HOUSE_1);
  assert.equal(NAV_TILE.HOUSE_2, TileType.HOUSE_2);
  assert.equal(isPassableCell([[TileType.RUBBLE]], 0, 0, false), true);
  assert.equal(isPassableCell([[TileType.HOUSE_1]], 0, 0, true), false);
  assert.equal(isPassableCell([[TileType.HOUSE_2]], 0, 0, true), false);
});
