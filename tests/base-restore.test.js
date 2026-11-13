import test from 'node:test';
import assert from 'node:assert/strict';
import { TankGameEngine } from '../public/src/game/engine/engineCore.js';
import { SECTORS } from '../public/src/game/levels.js';
import { TileType, GameStatus } from '../public/src/game/types.js';
import { POWERUP } from '../public/src/game/powerups.js';
import { isUsefulPowerUp } from '../public/src/game/powerup-drops.js';

test('Reconstruction restores both HQ cells and services without shielding or changing mission state', () => {
  const base = SECTORS[0].baseCell;
  const mesh = { position: { set() {} } };
  const cell = { row: base.row, col: base.col, type: TileType.EMPTY, hp: 0, mesh: null };
  const twin = { row: base.row, col: base.col + 1, type: TileType.EMPTY, hp: 0, mesh: null };
  const grid = Array.from({ length: 36 }, () => Array(36));
  grid[base.row][base.col] = cell;
  grid[base.row][base.col + 1] = twin;
  let added = 0;
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    currentSectorIndex: 0, baseAlive: false, status: GameStatus.PLAYING, grid,
    gridToWorld: (row, col) => ({ x: col * 2, z: row * 2 }),
    modelFactory: { createCommandBaseBlock: () => mesh }, mapGroup: { add() { added++; } },
    tileBatcher: { sync() {} }, setStatusBanner() {}, saveProgress() {}, emitHudUpdate() {},
  });
  assert.equal(isUsefulPowerUp(POWERUP.BASE_RESTORE, engine), true);
  engine.applyPowerUp(POWERUP.BASE_RESTORE);
  assert.equal(cell.type, TileType.BASE);
  assert.equal(cell.hp, cell.maxHp);
  assert.equal(cell.mesh, mesh);
  assert.equal(twin.type, TileType.BASE);
  assert.equal(twin.mesh, null);
  assert.equal(engine.baseAlive, true);
  assert.equal(engine.status, GameStatus.PLAYING);
  assert.equal(isUsefulPowerUp(POWERUP.BASE_RESTORE, engine), false);
  engine.restoreCommandBase();
  assert.equal(added, 1);
  engine.baseAlive = false;
  engine.status = GameStatus.GAME_OVER;
  engine.restoreCommandBase();
  assert.equal(engine.baseAlive, false);
  assert.equal(added, 1);
});

test('HQ is two cells on the outer row behind a 4-cell concrete line with an open lane', async () => {
  const { getBaseLayout } = await import('../public/src/game/levels.js');
  for (const sector of SECTORS) {
    const { row, col } = sector.baseCell;
    assert.equal(row, 35, `${sector.name}: HQ must sit on the outermost row`);
    const layout = getBaseLayout(sector.baseCell);
    for (const c of layout.cells) assert.equal(sector.grid[c.row][c.col], TileType.BASE);
    assert.equal(layout.wall.length, 4);
    for (const c of layout.wall) assert.equal(sector.grid[c.row][c.col], TileType.CONCRETE);
    for (const c of layout.open) assert.equal(sector.grid[c.row][c.col], TileType.EMPTY);
    const baseCount = sector.grid.flat().filter((t) => t === TileType.BASE).length;
    assert.equal(baseCount, 2, `${sector.name}: exactly two HQ cells`);
  }
});
