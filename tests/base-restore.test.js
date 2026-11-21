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
  const grid = Array.from({ length: 40 }, () => Array(40));
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

test('every standard map authors its HQ cover: two HQ cells on the outer row, a 4-cell concrete row and an open drive-up lane', async () => {
  const { getBaseLayout } = await import('../public/src/game/levels.js');
  for (const sector of SECTORS) {
    if (sector.baseDefense === 'authored') {
      const layout = getBaseLayout(sector.baseCell, 40, {
        footprint: sector.baseFootprint,
        baseDefense: sector.baseDefense,
      });
      for (const c of layout.cells) {
        assert.equal(sector.grid[c.row][c.col], TileType.BASE);
      }
      const baseCount = sector.grid.flat().filter((t) => t === TileType.BASE).length;
      assert.equal(
        baseCount,
        sector.baseFootprint.cols * sector.baseFootprint.rows,
        `${sector.name}: HQ cell count matches baseFootprint`
      );
      continue;
    }
    const { row } = sector.baseCell;
    assert.equal(row, 39, `${sector.name}: HQ must sit on the outermost row`);
    const layout = getBaseLayout(sector.baseCell);
    for (const c of layout.cells) assert.equal(sector.grid[c.row][c.col], TileType.BASE);
    assert.equal(layout.wall.length, 4);
    for (const c of layout.wall) {
      assert.equal(sector.grid[c.row][c.col], TileType.CONCRETE, `${sector.name}: map must author concrete at ${c.row},${c.col}`);
      assert.equal(sector.grid[c.row + 1][c.col], TileType.EMPTY, `${sector.name}: drive-up lane open at ${c.row + 1},${c.col}`);
    }
    const baseCount = sector.grid.flat().filter((t) => t === TileType.BASE).length;
    assert.equal(baseCount, 2, `${sector.name}: exactly two HQ cells`);
  }
});
