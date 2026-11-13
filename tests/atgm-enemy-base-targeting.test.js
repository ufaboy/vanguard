import test from 'node:test';
import assert from 'node:assert/strict';
import { TankGameEngine } from '../public/src/game/engine/engineCore.js';
import { TileType } from '../public/src/game/types.js';
import { MISSILE } from '../public/src/game/constants.js';

test('Player ATGM missile targets enemy base when no other enemies are on the map', () => {
  const mesh = { position: { set() {} }, rotation: { y: 0 } };
  const baseCell = { row: 6, col: 18, type: TileType.ENEMY_BASE, hp: 48, maxHp: 48 };
  const grid = Array.from({ length: 36 }, () => Array(36).fill(null));
  grid[6][18] = baseCell;

  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    enemies: [],
    grid,
    enemyBaseAlive: true,
    _enemyBaseCell: { row: 6, col: 18 },
    activeMapRules: { enemyBaseCell: { row: 6, col: 18 } },
    aimWorld: { x: 50, z: 50 },
    gridToWorld: (r, c) => ({ x: (c - 18) * 2, z: (r - 18) * 2 }),
    worldToGrid: (x, z) => ({ row: Math.floor(z / 2 + 18), col: Math.floor(x / 2 + 18) }),
    lerpAngle: TankGameEngine.prototype.lerpAngle,
    removeProjectile(idx) { this.projectiles.splice(idx, 1); },
    emitProjectileTrail() {},
    fxGroup: { remove() {} },
    mines: [],
    shotsHit: 0,
    projectiles: [],
  });

  const baseWorld = engine.getEnemyBaseCenter();
  assert.deepEqual(baseWorld, { x: 0, z: -24 });

  // 1. Initial missile heading along +X (away from base at z: -24)
  const missile = {
    x: 0,
    z: 0,
    vx: MISSILE.SPEED * 2,
    vz: 0,
    speed: MISSILE.SPEED * 2,
    isMissile: true,
    fromPlayer: true,
    life: 5,
    mesh,
  };
  engine.projectiles = [missile];

  // Update projectiles by 0.1s: missile should steer toward enemy base (z: -24, which is -Z direction)
  engine.updateProjectiles(0.1);

  // vz should now be negative (steering toward z: -24)
  assert.ok(missile.vz < 0, `Expected missile to steer toward enemy base (vz < 0), got vz = ${missile.vz}`);

  // 2. If an enemy tank is present, missile prefers the enemy tank instead of base
  const enemyTank = { x: 20, z: 0, hp: 30 };
  engine.enemies = [enemyTank];

  // Reset heading along -Z (toward base)
  missile.vx = 0;
  missile.vz = -MISSILE.SPEED * 2;

  // Update projectiles: missile should now steer toward enemy tank at +X (vx > 0)
  engine.updateProjectiles(0.1);
  assert.ok(missile.vx > 0, `Expected missile to steer toward living enemy tank (vx > 0), got vx = ${missile.vx}`);

  // 3. When enemy tank is destroyed (hp <= 0), missile returns to targeting the enemy base
  enemyTank.hp = 0;
  missile.vx = MISSILE.SPEED * 2;
  missile.vz = 0;
  engine.updateProjectiles(0.1);
  assert.ok(missile.vz < 0, `Expected missile to return to targeting enemy base when enemy is dead, got vz = ${missile.vz}`);
});

test('Player ATGM missile damages enemy base on arrival and detonates', () => {
  const mesh = { position: { set() {} }, rotation: { y: 0 } };
  const baseCell = { row: 6, col: 18, type: TileType.ENEMY_BASE, hp: 48, maxHp: 48 };
  const grid = Array.from({ length: 36 }, () => Array(36).fill(null));
  grid[6][18] = baseCell;

  let damagedCell = null;
  let damageAmount = 0;

  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    enemies: [],
    grid,
    enemyBaseAlive: true,
    _enemyBaseCell: { row: 6, col: 18 },
    activeMapRules: { enemyBaseCell: { row: 6, col: 18 } },
    aimWorld: { x: 0, z: 0 },
    gridToWorld: (r, c) => ({ x: (c - 18) * 2, z: (r - 18) * 2 }),
    worldToGrid: (x, z) => ({ row: Math.floor(z / 2 + 18), col: Math.floor(x / 2 + 18) }),
    lerpAngle: TankGameEngine.prototype.lerpAngle,
    removeProjectile(idx) { this.projectiles.splice(idx, 1); },
    emitProjectileTrail() {},
    fxGroup: { remove() {} },
    damageEnemyBase(cell, dmg) {
      damagedCell = cell;
      damageAmount = dmg;
      cell.hp -= dmg;
    },
    projectiles: [],
  });

  // Missile directly at enemy base cell (0, -24)
  const missile = {
    x: 0,
    z: -24,
    vx: 0,
    vz: -10,
    speed: 10,
    isMissile: true,
    fromPlayer: true,
    life: 5,
    mesh,
  };
  engine.projectiles = [missile];

  engine.updateProjectiles(0.016);

  assert.equal(damagedCell, baseCell);
  assert.equal(damageAmount, 16);
  assert.equal(engine.projectiles.length, 0, 'Missile should be consumed on impact');
});

test('STRIKER / enemy missile detonates and deals 4 damage when colliding with an obstacle (brick)', () => {
  const mesh = { position: { set() {} }, rotation: { y: 0 } };
  const brickCell = { row: 18, col: 18, type: TileType.BRICK, hp: 4, maxHp: 4 };
  const grid = Array.from({ length: 36 }, () => Array(36).fill(null));
  grid[18][18] = brickCell;

  let detonated = false;
  let damagedAmount = 0;

  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    enemies: [],
    grid,
    aimWorld: { x: 0, z: 0 },
    gridToWorld: (r, c) => ({ x: (c - 18) * 2, z: (r - 18) * 2 }),
    worldToGrid: (x, z) => ({ row: Math.floor(z / 2 + 18), col: Math.floor(x / 2 + 18) }),
    lerpAngle: TankGameEngine.prototype.lerpAngle,
    removeProjectile(idx) { this.projectiles.splice(idx, 1); },
    emitProjectileTrail() {},
    fxGroup: { remove() {} },
    mines: [],
    detonateMissile() {
      detonated = true;
    },
    damageTileCell(cell, dmg) {
      damagedAmount = dmg;
      cell.hp -= dmg;
    },
    projectiles: [],
  });

  const enemyMissile = {
    x: 0,
    z: 0,
    vx: 13,
    vz: 0,
    speed: 13,
    isMissile: true,
    fromPlayer: false,
    life: 3.4,
    mesh,
  };
  engine.projectiles = [enemyMissile];

  engine.updateProjectiles(0.016);

  assert.equal(detonated, true, 'Missile should detonate on colliding with brick');
  assert.equal(damagedAmount, 4, 'Missile should deal 4 damage to brick');
  assert.equal(engine.projectiles.length, 0, 'Missile should be consumed on impact');
});

