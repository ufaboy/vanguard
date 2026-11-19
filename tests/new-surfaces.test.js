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
import { PowerupsController } from '../public/src/game/engine/powerups-controller.js';
import { ForestFireController } from '../public/src/game/terrains/forest-fire.js';
import {
  canPlaceOnSurface,
  cellMovement,
  combineCellMovement,
  isTilePassable,
  setCellObject,
  setCellSurface,
} from '../public/src/game/terrains/layers.js';
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

test('airDrop landing validation rejects occupied blocks and allows GRASS/STONE/EMPTY', () => {
  const grid = createMockGrid(5, 5);
  grid[1][1].type = TileType.BRICK;
  grid[1][2].type = TileType.HOUSE_1;
  grid[1][3].type = TileType.FOREST;
  grid[2][1].type = TileType.GRASS;
  grid[2][2].type = TileType.STONE;
  grid[2][3].type = TileType.EMPTY;
  grid[2][3].defenseTurret = { alive: true };

  const engine = createMockEngine(grid);
  engine.airDrops = [];
  engine.powerups = [{ x: 2 * TILE_SIZE, z: 2 * TILE_SIZE }]; // occupies (2,2)
  engine.mines = [];
  const ctrl = new PowerupsController(engine);

  assert.equal(ctrl.isAirDropLandingCell(grid[1][1]), false);
  assert.equal(ctrl.isAirDropLandingCell(grid[1][2]), false);
  assert.equal(ctrl.isAirDropLandingCell(grid[1][3]), false);
  assert.equal(ctrl.isAirDropLandingCell(grid[2][3]), false); // live turret
  assert.equal(ctrl.isAirDropLandingCell(grid[2][1]), true);
  assert.equal(ctrl.isAirDropLandingCell(grid[2][2]), true);
  assert.equal(ctrl.isAirDropPosFree(2 * TILE_SIZE, 2 * TILE_SIZE), false); // occupied by powerup
  assert.equal(ctrl.isAirDropPosFree(1 * TILE_SIZE, 2 * TILE_SIZE), true);
});

test('descending airDrop shifts landing point when target cell becomes blocked by BRICK or tank', () => {
  const grid = createMockGrid(5, 5);
  const engine = createMockEngine(grid);
  engine.worldToGrid = (x, z) => ({
    row: Math.round(z / TILE_SIZE),
    col: Math.round(x / TILE_SIZE),
  });
  engine.airDrops = [];
  engine.powerups = [];
  engine.mines = [];
  engine.airDropQueue = [];
  const startPos = engine.gridToWorld(2, 2);
  const drop = {
    x: startPos.x,
    z: startPos.z,
    targetX: startPos.x,
    targetZ: startPos.z,
    altitude: 10,
    landed: false,
    config: { shells: 10, aps: 0, missiles: 0 },
    rig: {
      root: { position: { set(x, _y, z) { this.x = x; this.z = z; } } },
      crateGroup: { position: { y: 10 }, rotation: { z: 0 } },
      landingRing: { scale: { setScalar() {} } },
      chuteGroup: { visible: true },
    },
  };
  engine.airDrops.push(drop);

  // Engineer builds a BRICK on (2,2) while the airDrop is descending
  grid[2][2].type = TileType.BRICK;
  const ctrl = new PowerupsController(engine);
  ctrl.updateAirDrops(0.2, 0.2);

  assert.notDeepEqual({ x: drop.targetX, z: drop.targetZ }, startPos);
  const targetGrid = engine.worldToGrid(drop.targetX, drop.targetZ);
  assert.equal(grid[targetGrid.row][targetGrid.col].type, TileType.EMPTY);
  assert.ok(drop.x !== startPos.x || drop.z !== startPos.z);
});

test('burning OIL_SLICK ignites adjacent FOREST and periodically damages adjacent HOUSE_1 and HOUSE_2', () => {
  const grid = createMockGrid(5, 5);
  const oil = grid[2][2];
  const forest = grid[2][1];
  const house1 = grid[2][3];
  const house2 = grid[1][2];

  oil.type = TileType.OIL_SLICK;
  forest.type = TileType.FOREST;
  house1.type = TileType.HOUSE_1;
  house1.hp = 25;
  house1.maxHp = 25;
  house2.type = TileType.HOUSE_2;
  house2.hp = 70;
  house2.maxHp = 70;

  const startedForests = [];
  const engine = createMockEngine(grid);
  engine.forestFire = {
    startBurning(cell) {
      cell.isBurning = true;
      startedForests.push(cell);
    },
  };

  engine.terrainDestruction.igniteOilSlick(oil);
  engine.terrainDestruction.updateBurningOil(0.8);

  assert.equal(forest.isBurning, true);
  assert.equal(startedForests.length, 1);
  assert.equal(house1.hp, 21);
  assert.equal(house2.hp, 66);
});

test('burning FOREST spreads to adjacent FOREST and OIL_SLICK and damages adjacent HOUSE_1', () => {
  const grid = createMockGrid(5, 5);
  const forestA = grid[2][2];
  const forestB = grid[2][1];
  const oil = grid[2][3];
  const house = grid[1][2];

  forestA.type = TileType.FOREST;
  forestB.type = TileType.FOREST;
  oil.type = TileType.OIL_SLICK;
  house.type = TileType.HOUSE_1;
  house.hp = 25;
  house.maxHp = 25;

  const engine = createMockEngine(grid);
  engine.fx.flameJet = () => {};
  engine.fx.point = () => {};
  engine.fx.flash = () => {};
  const forestFire = new ForestFireController(engine);
  const posA = engine.gridToWorld(2, 2);

  forestFire.startBurning(forestA, posA.x, posA.z);
  // After 0.6s: oil ignites, forestB has not caught fire yet (threshold 2.2s)
  forestFire.update(0.6, 0.6);
  assert.equal(oil.isBurning, true);
  assert.equal(forestB.isBurning, false);

  // After 2.3s total: forestB catches fire and house takes fire damage
  forestFire.update(1.7, 2.3);
  assert.equal(forestB.isBurning, true);
  assert.equal(engine.burningForests.length, 2);
  assert.equal(house.hp, 22);
});

test('layered terrain placement compatibility', () => {
  assert.equal(canPlaceOnSurface(TileType.BRIDGE, TileType.WATER), true);
  assert.equal(canPlaceOnSurface(TileType.BRIDGE, TileType.EMPTY), false);
  assert.equal(canPlaceOnSurface(TileType.HOUSE_1, TileType.EMPTY), true);
  assert.equal(canPlaceOnSurface(TileType.HOUSE_1, TileType.WATER), false);
  assert.equal(canPlaceOnSurface(TileType.BARREL, TileType.OIL_SLICK), true);
  assert.equal(canPlaceOnSurface(TileType.FOREST, TileType.GRASS), true);
  assert.equal(canPlaceOnSurface(TileType.FOREST, TileType.ROAD), false);
});

const speedOf = (movement) => movement?.speedMultiplier ?? 1.0;

test('single-layer traction matches the pre-layer movement tuning for player and enemies', () => {
  // [tile, player {speed, accel, turn, brake}, enemy speed] as hardcoded before the layer rework.
  const table = [
    [TileType.ROAD, [1.2, 1.25, 1.0, 1.15], 1.2],
    [TileType.BRIDGE, [1.2, 1.25, 1.0, 1.15], 1.2],
    [TileType.SWAMP, [0.58, 0.55, 0.65, 0.85], 0.58],
    [TileType.OIL_SLICK, [0.9, 0.23, 0.82, 0.1], 0.9],
    [TileType.CRATER, [0.85, 0.85, 0.95, 0.92], 0.85],
    [TileType.ICE, [0.85, 0.75, 0.82, 0.85], 1.0],
    [TileType.SAND, [0.78, 0.75, 0.82, 0.85], 0.78],
  ];
  for (const [tile, [speed, accel, turn, brake], enemySpeed] of table) {
    const player = cellMovement({ type: tile }, {});
    assert.equal(player.speedMultiplier, speed, `player speed on ${tile}`);
    assert.equal(player.accelMultiplier, accel, `player accel on ${tile}`);
    assert.equal(player.turnMultiplier, turn, `player turn on ${tile}`);
    assert.equal(player.brakeMultiplier, brake, `player brake on ${tile}`);
    assert.equal(speedOf(cellMovement({ type: tile }, { isEnemy: true })), enemySpeed, `enemy speed on ${tile}`);
  }
  assert.equal(cellMovement({ type: TileType.ICE }, {}).lowTraction, true);
  assert.equal(cellMovement({ type: TileType.OIL_SLICK }, {}).lowTraction, true);
  assert.equal(cellMovement({ type: TileType.GRASS }, {}), null);
  assert.equal(cellMovement({ type: TileType.FOREST }, {}), null);

  // All-terrain chassis ignore penalties but keep the paved bonus; rubble slows every chassis except bosses.
  assert.equal(cellMovement({ type: TileType.SAND }, { allTerrain: true }), null);
  assert.equal(speedOf(cellMovement({ type: TileType.ROAD }, { canHover: true })), 1.2);
  assert.equal(speedOf(cellMovement({ type: TileType.RUBBLE }, { allTerrain: true })), 0.45);
  assert.equal(speedOf(cellMovement({ type: TileType.RUBBLE }, { isEnemy: true, isBoss: true })), 1.0);

  // Results are cached and frozen, so callers must copy before changing them.
  assert.equal(combineCellMovement(TileType.ROAD, null, {}), combineCellMovement(TileType.ROAD, null, {}));
  assert.ok(Object.isFrozen(combineCellMovement(TileType.ROAD, null, {})));
});

test('STONE caps top speed at 1.5 cells/s instead of scaling it; all-terrain and hover ignore the cap', () => {
  const stone = cellMovement({ type: TileType.STONE }, {});
  assert.equal(stone.maxSpeedCells, 1.5);
  assert.equal(stone.speedMultiplier, undefined);
  assert.equal(stone.label, 'Rocky Ground');
  assert.equal(cellMovement({ type: TileType.STONE }, { isEnemy: true }).maxSpeedCells, 1.5);
  assert.equal(cellMovement({ type: TileType.STONE }, { allTerrain: true }), null);
  assert.equal(cellMovement({ type: TileType.STONE }, { canHover: true }), null);
  // A crater on stone keeps the cap and adds its own slowdown.
  const crater = cellMovement({ type: TileType.CRATER, surface: TileType.STONE, object: TileType.CRATER }, {});
  assert.equal(crater.maxSpeedCells, 1.5);
  assert.equal(crater.speedMultiplier, 0.85);
});

test('layered traction multiplies surface and object, e.g. a crater on a road or on sand', () => {
  const roadCrater = cellMovement({ type: TileType.CRATER, surface: TileType.ROAD, object: TileType.CRATER }, {});
  assert.ok(Math.abs(roadCrater.speedMultiplier - 1.2 * 0.85) < 1e-9);
  assert.equal(roadCrater.label, 'Blast Crater');
  const sandCrater = cellMovement({ type: TileType.CRATER, surface: TileType.SAND, object: TileType.CRATER }, {});
  assert.ok(Math.abs(sandCrater.speedMultiplier - 0.78 * 0.85) < 1e-9);
  // All-terrain keeps only the road bonus under a crater.
  assert.equal(
    speedOf(cellMovement({ type: TileType.CRATER, surface: TileType.ROAD, object: TileType.CRATER }, { allTerrain: true })),
    1.2
  );
});

test('isTilePassable matches the former hand-written passability lists', () => {
  const driveable = [
    TileType.EMPTY, TileType.FOREST, TileType.ICE, TileType.SAND, TileType.ROAD, TileType.STONE, TileType.GRASS,
    TileType.BRIDGE, TileType.SWAMP, TileType.OIL_SLICK, TileType.CRATER, TileType.RUBBLE,
  ];
  for (const type of Object.values(TileType)) {
    assert.equal(isTilePassable(type), driveable.includes(type), `passability of ${type}`);
  }
  assert.equal(isTilePassable(TileType.WATER, true), true);
  assert.equal(isTilePassable(undefined), false);
});

test('sand conversion (thermobaric) burns houses and rubble away but spares bridges and towers', () => {
  const grid = createMockGrid(3, 3);
  for (const row of grid) for (const cell of row) Object.assign(cell, { surface: TileType.EMPTY, object: null });
  const engine = createMockEngine(grid);
  const house = Object.assign(grid[0][0], { type: TileType.HOUSE_1, object: TileType.HOUSE_1, hp: 25 });
  const rubble = Object.assign(grid[0][1], { type: TileType.RUBBLE, object: TileType.RUBBLE, hp: 1 });
  const bridge = Object.assign(grid[0][2], { type: TileType.BRIDGE, surface: TileType.WATER, object: TileType.BRIDGE });
  const tower = Object.assign(grid[1][0], { type: TileType.WATER_TOWER, object: TileType.WATER_TOWER, hp: 2 });
  for (const cell of [house, rubble, bridge, tower]) engine.terrainDestruction.convertCellToSand(cell);
  assert.equal(house.type, TileType.SAND);
  assert.equal(rubble.type, TileType.SAND);
  assert.equal(bridge.type, TileType.BRIDGE);
  assert.equal(tower.type, TileType.WATER_TOWER);
});

test('water-tower flood leaves ICE and WATER alone and floods ground, road and grass', () => {
  const grid = createMockGrid(2, 3);
  for (const row of grid) for (const cell of row) Object.assign(cell, { surface: TileType.EMPTY, object: null });
  const engine = createMockEngine(grid);
  const ice = Object.assign(grid[0][0], { type: TileType.ICE, surface: TileType.ICE });
  const water = Object.assign(grid[0][1], { type: TileType.WATER, surface: TileType.WATER });
  const grass = Object.assign(grid[0][2], { type: TileType.GRASS, surface: TileType.GRASS });
  const road = Object.assign(grid[1][0], { type: TileType.ROAD, surface: TileType.ROAD });
  for (const cell of [ice, water, grass, road]) engine.terrainDestruction.convertCellToSwamp(cell);
  assert.equal(ice.type, TileType.ICE);
  assert.equal(water.type, TileType.WATER);
  assert.equal(grass.type, TileType.SWAMP);
  assert.equal(road.type, TileType.SWAMP);
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

test('explodeBarrel on a map-loaded layered BARREL leaves a CRATER, not an invisible barrel', () => {
  const grid = createMockGrid(4, 4);
  for (const row of grid) for (const cell of row) Object.assign(cell, { surface: TileType.EMPTY, object: null });
  const barrel = grid[1][1];
  Object.assign(barrel, { type: TileType.BARREL, object: TileType.BARREL, hp: 1, maxHp: 1 });

  const engine = createMockEngine(grid);
  engine.explodeBarrel(barrel, true);

  assert.equal(barrel.object, TileType.CRATER);
  assert.equal(barrel.type, TileType.CRATER);
  assert.equal(isPassableCell(grid.map((row) => row.map((c) => c.type)), 1, 1), true);
});

test('runtime objects placed through setCellObject survive later layer syncs', () => {
  const grid = createMockGrid(4, 4);
  for (const row of grid) for (const cell of row) Object.assign(cell, { surface: TileType.ROAD, object: null, type: TileType.ROAD });
  const engine = createMockEngine(grid);

  // Engineer brick on a road: a heavy blast on the cell must not erase it.
  const brick = grid[1][1];
  setCellObject(brick, TileType.BRICK);
  engine.terrainDestruction.convertCellToCrater(brick);
  assert.equal(brick.type, TileType.BRICK);
  assert.equal(brick.surface, TileType.ROAD);

  // Clearing the object reveals the surface again.
  setCellObject(brick, null);
  assert.equal(brick.type, TileType.ROAD);

  // Replacing the surface keeps an object on top.
  const boxes = grid[2][2];
  setCellObject(boxes, TileType.BOXES);
  setCellSurface(boxes, TileType.SAND);
  assert.equal(boxes.type, TileType.BOXES);
  assert.equal(boxes.surface, TileType.SAND);
});
