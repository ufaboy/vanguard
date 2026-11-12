import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ABILITIES,
  equipAbilities,
  fireAbilityWeapon,
  inContactRange,
  resolveAbilities,
  updateAbilities,
} from '../public/src/game/abilities/index.js';
import { CONTACT_WARHEAD } from '../public/src/game/abilities/contact-warhead.js';
import { MINE_LAYER } from '../public/src/game/abilities/mine-layer.js';
import { JAMMER_PULSE } from '../public/src/game/abilities/jammer-pulse.js';
import { ENGINEER_SUPPORT } from '../public/src/game/abilities/engineer-support.js';
import { FLAME_STREAM, KAMIKAZE_BLAST, LAND_MINE, OPTIONAL_EQUIPMENT, TILE_SIZE } from '../public/src/game/constants.js';
import { TankGameEngine } from '../public/src/game/engine.js';
import { SECTOR_BOSS_CONFIGS, TANK_CONFIGS, TANK_TYPES } from '../public/src/game/tanks.js';

/** Minimal stand-in for the engine services abilities use. */
function fakeGame(overrides = {}) {
  return {
    mines: [], planted: [], enemies: [], playerX: 100, playerZ: 100, jammedTimer: 0, sparks: 0,
    fx: { pulses: 0, jammerPulse() { this.pulses++; } },
    plantMineAt(x, z) { this.planted.push({ x, z }); this.mines.push({ x, z }); },
    isOnPlayerTrail: () => true,
    spawnSparks() { this.sparks++; },
    worldToGrid: () => ({ row: 5, col: 5 }), gridToWorld: () => ({ x: 0, z: 0 }), grid: [],
    ...overrides,
  };
}

test('Every ability id used by a tank config exists in the registry', () => {
  for (const config of [...Object.values(TANK_CONFIGS), ...Object.values(SECTOR_BOSS_CONFIGS)]) {
    assert.doesNotThrow(() => resolveAbilities(config.abilities), config.id);
  }
  assert.throws(() => resolveAbilities(['noSuchAbility']), /Unknown enemy ability/);
  assert.deepEqual(TANK_CONFIGS[TANK_TYPES.SAPPER].abilities, ['mineLayer']);
  assert.deepEqual(TANK_CONFIGS[TANK_TYPES.JAMMER].abilities, ['jammerPulse']);
  assert.deepEqual(TANK_CONFIGS[TANK_TYPES.ENGINEER].abilities, ['engineerSupport']);
  assert.deepEqual(TANK_CONFIGS[TANK_TYPES.FLAMETHROWER].abilities, ['flameStream']);
  assert.deepEqual(TANK_CONFIGS[TANK_TYPES.KAMIKAZE].abilities, ['contactWarhead']);
  assert.equal(Object.keys(ABILITIES).length, 5);
});

test('Mine layer loads the module ammunition and drops mines behind the hull', () => {
  const game = fakeGame();
  const tank = { x: 10, z: 10, hullAngle: 0, specialCooldown: 0 };
  equipAbilities(tank, ['mineLayer'], game);
  assert.equal(tank.minesRemaining, OPTIONAL_EQUIPMENT.MINE_LAYER.ammoCount);

  assert.equal(updateAbilities(tank, game, { brainActive: false, canSeePlayer: false }), 'mineLayer');
  assert.deepEqual(game.planted[0], { x: 10, z: 10 - MINE_LAYER.DROP_OFFSET });
  assert.ok(tank.specialCooldown >= MINE_LAYER.COOLDOWN);
  assert.equal(updateAbilities(tank, game, {}), null, 'waits for the cooldown');

  tank.minesRemaining = 0; tank.specialCooldown = 0;
  assert.equal(updateAbilities(tank, game, { brainActive: false }), null, 'out of mines');
});

test('Mine layer follows the brain when active and respects the map limit', () => {
  const game = fakeGame({ isOnPlayerTrail: () => false });
  const tank = { x: 0, z: 0, hullAngle: 0, specialCooldown: 0, brain: { wantMine: false, tactic: 'mine' } };
  equipAbilities(tank, ['mineLayer'], game);
  assert.equal(updateAbilities(tank, game, { brainActive: true }), null);
  tank.brain.wantMine = true;
  game.mines = Array.from({ length: MINE_LAYER.MAP_LIMIT }, () => ({}));
  assert.equal(updateAbilities(tank, game, { brainActive: true }), 'mineLayer');
  assert.equal(game.planted.length, 0, 'no mine over the map limit');
  assert.equal(tank.minesRemaining, OPTIONAL_EQUIPMENT.MINE_LAYER.ammoCount, 'ammunition kept');
});

test('Jammer pulse jams the player only inside its radius', () => {
  const tank = { x: 0, z: 0, specialCooldown: 0 };
  const far = fakeGame({ playerX: JAMMER_PULSE.RADIUS + 1, playerZ: 0 });
  equipAbilities(tank, ['jammerPulse'], far);
  assert.equal(updateAbilities(tank, far, { brainActive: false, canSeePlayer: false }), null, 'needs a reason to jam');
  assert.equal(updateAbilities(tank, far, { brainActive: false, canSeePlayer: true }), 'jammerPulse');
  assert.equal(far.fx.pulses, 1);
  assert.equal(far.jammedTimer, 0);
  assert.equal(tank.specialCooldown, JAMMER_PULSE.COOLDOWN);

  const near = fakeGame({ playerX: 3, playerZ: 0 });
  tank.specialCooldown = 0;
  updateAbilities(tank, near, { brainActive: false, canSeePlayer: true });
  assert.equal(near.jammedTimer, JAMMER_PULSE.JAM_DURATION);
});

test('Engineer welds the first damaged ally in range before fortifying', () => {
  const ally = { id: 2, x: 3, z: 0, hp: 5, maxHp: 30 };
  const game = fakeGame({ enemies: [ally] });
  const tank = { id: 1, x: 0, z: 0, specialCooldown: 0 };
  equipAbilities(tank, ['engineerSupport'], game);
  assert.equal(updateAbilities(tank, game, {}), 'engineerSupport');
  assert.equal(ally.hp, 5 + ENGINEER_SUPPORT.REPAIR_AMOUNT);
  assert.equal(tank.specialCooldown, ENGINEER_SUPPORT.COOLDOWN);
});

test('Tanks without abilities keep the standard armed gun', () => {
  const tank = {};
  equipAbilities(tank, undefined, fakeGame());
  assert.equal(tank.armed, true);
  assert.equal(tank.weaponAbility, null);
  assert.equal(tank.contactAbility, null);
  assert.equal(fireAbilityWeapon(tank, fakeGame(), { target: 'player' }), null, 'falls back to the gun');
  assert.equal(inContactRange(tank, 0), false);
});

/** Engine services the flame puff needs. */
function flameGame() {
  return fakeGame({
    projectiles: [],
    fxGroup: { add() {} },
    fx: { point() {} },
    traceMuzzle: (x, z, dx, dz, dist) => ({ x: x + dx * dist, z: z + dz * dist }),
  });
}

test('Flame stream replaces the gun: range, aim and token gate shots at the player', () => {
  const game = flameGame();
  const tank = { x: 0, z: 0, turretAngle: 0, fireCooldown: 0, rig: {} };
  equipAbilities(tank, ['flameStream'], game);
  assert.equal(tank.armed, true);

  const engage = { target: 'player', distToPlayer: FLAME_STREAM.RANGE - 1, aimReady: true, token: true };
  assert.equal(fireAbilityWeapon(tank, game, { ...engage, distToPlayer: FLAME_STREAM.RANGE + 0.1 }), 0, 'out of range');
  assert.equal(fireAbilityWeapon(tank, game, { ...engage, aimReady: false }), 0, 'turret not lined up');
  assert.equal(fireAbilityWeapon(tank, game, { ...engage, token: false }), 0, 'no attack token');
  assert.equal(game.projectiles.length, 0);

  assert.equal(fireAbilityWeapon(tank, game, engage), FLAME_STREAM.PUFF_INTERVAL);
  assert.equal(tank.fireCooldown, FLAME_STREAM.PUFF_INTERVAL);
  const puff = game.projectiles[0];
  assert.equal(puff.isFlame, true);
  assert.equal(puff.fromPlayer, false);
  assert.equal(puff.damage, FLAME_STREAM.DAMAGE_PER_PUFF);
  assert.ok(puff.vz > 0, 'flies along the turret heading');
});

test('Flame stream burns walls and terrain at half rate and never targets the base', () => {
  const game = flameGame();
  const tank = { x: 0, z: 0, turretAngle: 0, fireCooldown: 0 };
  equipAbilities(tank, ['flameStream'], game);
  assert.equal(fireAbilityWeapon(tank, game, { target: 'base', aimReady: true, token: true }), 0);
  assert.equal(fireAbilityWeapon(tank, game, { target: 'breach' }), FLAME_STREAM.PUFF_INTERVAL * 2);
  assert.equal(fireAbilityWeapon(tank, game, { target: 'terrain' }), FLAME_STREAM.PUFF_INTERVAL * 2);
  assert.equal(game.projectiles.length, 2);
});

test('Contact warhead disarms the tank and detonates only on contact', () => {
  const blasts = [];
  const game = fakeGame({
    detonateExplosionAt: (x, z, radius, damage, fromPlayer, _comp, _env, penetration) =>
      blasts.push({ x, z, radius, damage, fromPlayer, penetration }),
  });
  const tank = { x: 4, z: 6 };
  equipAbilities(tank, ['contactWarhead'], game);
  assert.equal(tank.armed, false, 'no gun');
  assert.equal(tank.weaponAbility, null);
  assert.equal(inContactRange(tank, CONTACT_WARHEAD.TRIGGER_RANGE + 0.01), false);
  assert.equal(inContactRange(tank, CONTACT_WARHEAD.TRIGGER_RANGE), true);
  assert.ok(CONTACT_WARHEAD.TRIGGER_RANGE < KAMIKAZE_BLAST.RADIUS * 0.5, 'contact stays inside full-damage epicenter');

  assert.equal(tank.contactAbility.onContact(tank, game), true, 'tank is spent');
  assert.deepEqual(blasts, [
    {
      x: 4,
      z: 6,
      radius: KAMIKAZE_BLAST.RADIUS,
      damage: KAMIKAZE_BLAST.DAMAGE,
      fromPlayer: false,
      penetration: KAMIKAZE_BLAST.PENETRATION,
    },
  ]);
});

test('Land mines deal full shaped-charge epicenter damage over 2.25 cells and chain-detonate', () => {
  const blasts = [];
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    entityGroup: { remove() {} },
    fx: { shockwave() {} },
    mines: [
      { id: 1, x: 0, z: 0, armTimer: 0, life: LAND_MINE.LIFE_SEC, damage: LAND_MINE.DAMAGE, mesh: { rotation: {} } },
      { id: 2, x: 2.0, z: 0, armTimer: 0, life: LAND_MINE.LIFE_SEC, damage: LAND_MINE.DAMAGE, mesh: { rotation: {} } },
    ],
    playerX: LAND_MINE.TRIGGER_RADIUS,
    playerZ: 0,
    detonateExplosionAt(x, z, radius, damage, fromPlayer, _comp, _env, penetration) {
      blasts.push({ x, z, radius, damage, fromPlayer, penetration });
    },
  });
  engine.updateMines(0.016, 1.0);
  assert.equal(engine.mines.length, 0);
  assert.equal(blasts.length, 2);
  assert.equal(blasts[0].radius, LAND_MINE.BLAST_RADIUS_CELLS * TILE_SIZE);
  assert.equal(blasts[0].damage, LAND_MINE.DAMAGE);
  assert.equal(blasts[0].penetration, LAND_MINE.PENETRATION);
  assert.ok(LAND_MINE.TRIGGER_RADIUS < blasts[0].radius * 0.5, 'triggering stays inside full-damage epicenter');
});
