import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TileType,
  SURFACE_TYPES,
  SURFACE_CONFIGS,
  SURFACE_CATALOG,
} from '../public/src/game/terrains/surfaces.js';
import {
  NAV_TILE,
  isPassableCell,
  isBossHardSolid,
} from '../public/src/sim/behavior/navgrid.js';
import { TerrainDestructionController } from '../public/src/game/engine/terrain-destruction.js';
import { GameStatus } from '../public/src/game/types.js';
import { TILE_SIZE } from '../public/src/game/levels.js';

function createMockGrid(rows = 7, cols = 7) {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => ({
      row,
      col,
      type: TileType.EMPTY,
      hp: 0,
      maxHp: 0,
      mesh: null,
      isBurning: false,
    }))
  );
}

function createMockEngine(grid) {
  const engine = {
    grid,
    enemies: [],
    burningForests: [],
    burningOilCells: [],
    pendingBarrelExplosions: [],
    blocksDestroyed: 0,
    playerHp: 100,
    playerX: -999,
    playerZ: -999,
    playerStats: { armor: 0 },
    subsystems: {},
    status: GameStatus.PLAYING,
    isDisposed: false,
    isHangarPaused: false,
    isAdPaused: false,
    screenShake: 0,
    mapGroup: { add() {}, remove() {} },
    tileBatcher: { sync() {}, markDirty() {} },
    modelFactory: {
      createCraterBlock: () => ({ position: { set() {} } }),
      createSwampBlock: () => ({ position: { set() {} } }),
    },
    fx: {
      explosion() {},
      shockwave() {},
      scorch() {},
      sparks() {},
      armorHit() {},
      masonryHit() {},
    },
    gridToWorld(row, col) {
      return { x: col * TILE_SIZE, z: row * TILE_SIZE };
    },
    damagePlayer(dmg) {
      engine.playerHp -= dmg;
    },
    damageEnemy(enemy, dmg) {
      enemy.hp -= dmg;
    },
    damageTileCell(cell, dmg) {
      engine.terrainDestruction.damageTileCell(cell, dmg, 0, 0);
    },
    destroyTileCell(cell) {
      engine.terrainDestruction.destroyTileCell(cell);
    },
    explodeBarrel(cell, fromPlayer) {
      engine.terrainDestruction.explodeBarrel(cell, fromPlayer);
    },
  };
  engine.terrainDestruction = new TerrainDestructionController(engine);
  return engine;
}

test('New surface types exist in TileType, SURFACE_CONFIGS, and SURFACE_CATALOG', () => {
  for (const key of ['ROAD', 'SWAMP', 'OIL_SLICK', 'CRATER', 'WATER_TOWER', 'HOUSE_1', 'HOUSE_2', 'RUBBLE']) {
    assert.ok(TileType[key] !== undefined, `TileType.${key} should be defined`);
    assert.equal(NAV_TILE[key], TileType[key], `NAV_TILE.${key} must mirror TileType.${key}`);
    const cfg = SURFACE_CONFIGS[SURFACE_TYPES[key]];
    assert.ok(cfg, `SURFACE_CONFIGS[${key}] should exist`);
    assert.ok(SURFACE_CATALOG.includes(cfg), `SURFACE_CATALOG should include ${key}`);
  }
});

test('navgrid passability and boss crushability match new surface rules', () => {
  const grid = [
    [
      TileType.ROAD,
      TileType.SWAMP,
      TileType.OIL_SLICK,
      TileType.CRATER,
      TileType.WATER_TOWER,
    ],
  ];
  assert.equal(isPassableCell(grid, 0, 0), true);
  assert.equal(isPassableCell(grid, 0, 1), true);
  assert.equal(isPassableCell(grid, 0, 2), true);
  assert.equal(isPassableCell(grid, 0, 3), true);
  assert.equal(isPassableCell(grid, 0, 4), false);
  assert.equal(isBossHardSolid(grid, 0, 4), false);
});

test('convertCellToCrater converts dry passable cells and leaves concrete/water intact', () => {
  const grid = createMockGrid(3, 3);
  grid[0][0].type = TileType.ROAD;
  grid[0][1].type = TileType.CONCRETE;
  grid[0][2].type = TileType.WATER;
  const engine = createMockEngine(grid);

  engine.terrainDestruction.convertCellToCrater(grid[0][0]);
  engine.terrainDestruction.convertCellToCrater(grid[0][1]);
  engine.terrainDestruction.convertCellToCrater(grid[0][2]);

  assert.equal(grid[0][0].type, TileType.CRATER);
  assert.equal(grid[0][1].type, TileType.CONCRETE);
  assert.equal(grid[0][2].type, TileType.WATER);
});

test('OIL_SLICK ignites, deals fire damage over time, and burns out to EMPTY', () => {
  const grid = createMockGrid(3, 3);
  const oilCell = grid[1][1];
  oilCell.type = TileType.OIL_SLICK;
  const engine = createMockEngine(grid);
  const pos = engine.gridToWorld(1, 1);
  engine.playerX = pos.x;
  engine.playerZ = pos.z;

  engine.terrainDestruction.igniteOilSlick(oilCell);
  assert.equal(oilCell.isBurning, true);
  assert.equal(engine.burningOilCells.length, 1);

  engine.terrainDestruction.updateBurningOil(2.0);
  assert.equal(engine.playerHp, 92);
  assert.equal(oilCell.isBurning, true);

  engine.terrainDestruction.updateBurningOil(5.5);
  assert.equal(oilCell.isBurning, false);
  assert.equal(oilCell.type, TileType.EMPTY);
  assert.equal(engine.burningOilCells.length, 0);
});

test('burning OIL_SLICK animates 3D burn rig and chain-ignites adjacent OIL_SLICK cells', () => {
  const grid = createMockGrid(3, 3);
  const oilA = grid[1][1];
  const oilB = grid[1][2];
  oilA.type = TileType.OIL_SLICK;
  oilA.mesh = {};
  oilB.type = TileType.OIL_SLICK;
  oilB.mesh = {};

  const burnUpdates = [];
  const engine = createMockEngine(grid);
  engine.modelFactory.updateOilSlickBurn = (mesh, isBurning, intensity, elapsed) => {
    burnUpdates.push({ mesh, isBurning, intensity, elapsed });
  };

  engine.terrainDestruction.igniteOilSlick(oilA);
  assert.equal(oilA.isBurning, true);
  assert.equal(oilB.isBurning, false);
  assert.equal(burnUpdates.length, 1);
  assert.equal(burnUpdates[0].isBurning, true);

  // After 0.35s flashover delay, adjacent oil slick cell ignites automatically
  engine.terrainDestruction.updateBurningOil(0.35);
  assert.equal(oilB.isBurning, true);
  assert.equal(engine.burningOilCells.length, 2);
});

test('igniteOilAt ignites OIL_SLICK cells within blast/explosion radius', () => {
  const grid = createMockGrid(5, 5);
  const nearOil = grid[2][2];
  const farOil = grid[4][4];
  nearOil.type = TileType.OIL_SLICK;
  farOil.type = TileType.OIL_SLICK;

  const engine = createMockEngine(grid);
  const nearPos = engine.gridToWorld(2, 2);
  engine.terrainDestruction.igniteOilAt(nearPos.x + 0.4, nearPos.z, 1.8);

  assert.equal(nearOil.isBurning, true);
  assert.equal(farOil.isBurning, false);
});

test('ruptureWaterTower floods 1.5-cell radius to SWAMP and extinguishes fires within 2.5 cells', () => {
  const grid = createMockGrid(7, 7);
  const tower = grid[3][3];
  tower.type = TileType.WATER_TOWER;
  tower.hp = 2;

  const burningForest = grid[3][5]; // 2 cells away
  burningForest.type = TileType.FOREST;
  burningForest.isBurning = true;

  const burningOil = grid[3][4]; // 1 cell away
  burningOil.type = TileType.OIL_SLICK;

  const engine = createMockEngine(grid);
  engine.burningForests.push({ cell: burningForest });
  engine.terrainDestruction.igniteOilSlick(burningOil);

  engine.terrainDestruction.damageTileCell(tower, 2, 0, 0);

  assert.equal(tower.type, TileType.SWAMP);
  assert.equal(grid[2][3].type, TileType.SWAMP);
  assert.equal(grid[3][4].type, TileType.SWAMP);
  assert.equal(burningOil.isBurning, false);
  assert.equal(burningForest.isBurning, false);
  assert.equal(engine.burningForests.length, 0);
  assert.equal(engine.burningOilCells.length, 0);
});

test('explodeBarrel creates a CRATER and ignites adjacent OIL_SLICK', () => {
  const grid = createMockGrid(4, 4);
  const barrel = grid[1][1];
  barrel.type = TileType.BARREL;
  const oil = grid[1][2];
  oil.type = TileType.OIL_SLICK;

  const engine = createMockEngine(grid);
  engine.explodeBarrel(barrel, true);

  assert.equal(barrel.type, TileType.CRATER);
  assert.equal(oil.isBurning, true);
});
