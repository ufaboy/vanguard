import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUILDING_STYLE_COUNT,
  INDUSTRIAL_STYLE_COUNT,
  RESIDENTIAL_STYLE_COUNT,
  THEME_ITERATION2_SHARE,
  computeBuildingLayout,
} from '../public/src/game/terrains/building-layout.js';
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
  assert.ok(Number.isInteger(style) && style >= 0 && style < RESIDENTIAL_STYLE_COUNT);
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

test('computeBuildingLayout enforces Iteration 1 vs Iteration 2 theme proportions', () => {
  const E = TileType.EMPTY;
  const H1 = TileType.HOUSE_1;
  const H2 = TileType.HOUSE_2;
  // 8 separate 2x2 building clusters (4 of HOUSE_1, 4 of HOUSE_2)
  const grid = Array.from({ length: 12 }, () => Array(24).fill(E));
  const anchors = [
    [1, 1, H1], [1, 4, H2], [1, 7, H1], [1, 10, H2],
    [5, 1, H1], [5, 4, H2], [5, 7, H1], [5, 10, H2],
  ];
  for (const [r, c, t] of anchors) {
    grid[r][c] = grid[r + 1][c] = grid[r][c + 1] = grid[r + 1][c + 1] = t;
  }

  for (const [theme, expectedIter2Share] of Object.entries(THEME_ITERATION2_SHARE)) {
    const layout = computeBuildingLayout(grid, theme);
    let iter1 = 0;
    let iter2 = 0;
    for (const [r, c] of anchors) {
      const { style } = layout.get(`${r},${c}`);
      assert.ok(style >= 0 && style < BUILDING_STYLE_COUNT);
      if (style < RESIDENTIAL_STYLE_COUNT) iter1++;
      else iter2++;
    }
    assert.equal(iter2 / anchors.length, expectedIter2Share, `theme=${theme}`);
    assert.equal(iter1 + iter2, anchors.length);
  }
});

test('buildingDamageState maps house1 (5 stages) and house2 (7 stages)', () => {
  assert.deepEqual(
    [25, 20, 15, 10, 5, 0].map((hp) => buildingDamageState(hp, 25, 'house1')),
    [5, 4, 3, 2, 1, 0]
  );
  assert.equal(buildingDamageState(24, 25, 'house1'), 4);
  assert.equal(buildingDamageState(BUILDING_MAX_HP.house1, BUILDING_MAX_HP.house1, 'house1'), 5);
  assert.equal(buildingDamageState(BUILDING_MAX_HP.house1 - 0.1, BUILDING_MAX_HP.house1, 'house1'), 4);
  assert.equal(buildingDamageState(0, BUILDING_MAX_HP.house1, 'house1'), 0);

  assert.deepEqual(
    [70, 65, 55, 45, 30, 15, 5, 0].map((hp) => buildingDamageState(hp, 70, 'house2')),
    [7, 6, 5, 4, 3, 2, 1, 0]
  );
  assert.equal(buildingDamageState(BUILDING_MAX_HP.house2, BUILDING_MAX_HP.house2, 'house2'), 7);
  assert.equal(buildingDamageState(BUILDING_MAX_HP.house2 - 0.1, BUILDING_MAX_HP.house2, 'house2'), 6);
  assert.equal(buildingDamageState(0, BUILDING_MAX_HP.house2, 'house2'), 0);
});

test('TileType.RUBBLE mirrors NAV_TILE.RUBBLE and is passable; HOUSE_1/HOUSE_2 mirror and block', () => {
  assert.equal(NAV_TILE.RUBBLE, TileType.RUBBLE);
  assert.equal(NAV_TILE.HOUSE_1, TileType.HOUSE_1);
  assert.equal(NAV_TILE.HOUSE_2, TileType.HOUSE_2);
  assert.equal(isPassableCell([[TileType.RUBBLE]], 0, 0, false), true);
  assert.equal(isPassableCell([[TileType.HOUSE_1]], 0, 0, true), false);
  assert.equal(isPassableCell([[TileType.HOUSE_2]], 0, 0, true), false);
});
