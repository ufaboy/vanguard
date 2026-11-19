import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JAMMER_ECM,
  applyRadarJamming,
  computeJammedMissileTarget,
  hasJammerModule,
  isPointWithinJammerRadius,
} from '../public/src/sim/jammer.js';
import { TILE_SIZE } from '../public/src/game/constants.js';
import { TankGameEngine } from '../public/src/game/engine/engineCore.js';

test('hasJammerModule detects living JAMMER tanks and optionalEquipment JAMMER', () => {
  assert.equal(hasJammerModule({ hp: 20, enemyClass: 'JAMMER' }), true);
  assert.equal(hasJammerModule({ hp: 20, loadout: { optionalEquipment: ['JAMMER'] } }), true);
  assert.equal(hasJammerModule({ hp: 0, enemyClass: 'JAMMER' }), false);
  assert.equal(hasJammerModule({ hp: 20, enemyClass: 'STANDARD' }), false);
});

test('isPointWithinJammerRadius checks continuous passive radius', () => {
  const jammer = { hp: 20, enemyClass: 'JAMMER', x: 0, z: 0 };
  const systemRadius = JAMMER_ECM.SYSTEM_RADIUS_CELLS * TILE_SIZE; // 5 cells = 10
  const radarRadius = JAMMER_ECM.RADAR_RADIUS_CELLS * TILE_SIZE; // 20 cells = 40

  assert.equal(isPointWithinJammerRadius(systemRadius, 0, [jammer], systemRadius), true);
  assert.equal(isPointWithinJammerRadius(systemRadius + 0.1, 0, [jammer], systemRadius), false);
  assert.equal(isPointWithinJammerRadius(radarRadius, 0, [jammer], radarRadius), true);
  assert.equal(isPointWithinJammerRadius(radarRadius + 0.1, 0, [jammer], radarRadius), false);
  assert.equal(isPointWithinJammerRadius(0, 0, [{ ...jammer, hp: 0 }], systemRadius), false);
});

test('applyRadarJamming hides 50% of real contacts and adds 50% fake contacts', () => {
  const contacts = [
    { enemyId: 1, x: 2, z: 2, active: true, age: 0, source: 'optical' },
    { enemyId: 2, x: -4, z: 6, active: true, age: 0, source: 'optical' },
    { enemyId: 3, x: 8, z: -2, active: true, age: 0, source: 'optical' },
    { enemyId: 4, x: -6, z: -8, active: true, age: 0, source: 'optical' },
  ];

  const jammed = applyRadarJamming(contacts, {
    playerX: 0,
    playerZ: 0,
    elapsed: 1.0,
    radarRange: 32,
    halfArena: 36,
  });

  const realShown = jammed.filter((c) => !c.fake);
  const fakesShown = jammed.filter((c) => c.fake);
  assert.equal(realShown.length, 2, '50% of 4 real contacts remain visible');
  assert.equal(fakesShown.length, 2, '50% fake contacts added');

  const emptyJammed = applyRadarJamming([], { playerX: 0, playerZ: 0, elapsed: 1.0 });
  assert.ok(emptyJammed.length >= 1 && emptyJammed.every((c) => c.fake));
});

test('computeJammedMissileTarget scatters within 3 cells of the jamming point', () => {
  const scatterRadius = JAMMER_ECM.MISSILE_SCATTER_CELLS * TILE_SIZE;
  for (let i = 0; i < 40; i++) {
    const pt = computeJammedMissileTarget(5, -5, scatterRadius, 36);
    const dist = Math.hypot(pt.x - 5, pt.z - -5);
    assert.ok(dist <= scatterRadius + 1e-6);
  }
});

test('Player APS is disabled within 5 cells of a living JAMMER and active outside 5 cells', () => {
  const makeGame = (jammerX) =>
    Object.assign(Object.create(TankGameEngine.prototype), {
      apsAmmo: [2, 2, 2, 2],
      apsRearmTimer: 0,
      playerX: 0,
      playerZ: 0,
      enemies: [{ id: 1, hp: 20, enemyClass: 'JAMMER', x: jammerX, z: 0 }],
      projectiles: [{ x: 0, z: 2, vx: 0, vz: -1, weaponId: 'CANNON_Mk2' }],
      hazardZones: [],
      hasLineOfSight: () => true,
      syncApsVisuals() {},
      emitHudUpdate() {},
      fx: { apsIntercept() {} },
      fxGroup: { remove() {} },
    });

  const jammedGame = makeGame(JAMMER_ECM.SYSTEM_RADIUS_CELLS * TILE_SIZE - 0.5);
  jammedGame.updateApsInterception();
  assert.equal(jammedGame.projectiles.length, 1, 'APS does not intercept inside 5 cells');
  assert.deepEqual(jammedGame.apsAmmo, [2, 2, 2, 2]);

  const clearGame = makeGame(JAMMER_ECM.SYSTEM_RADIUS_CELLS * TILE_SIZE + 0.5);
  clearGame.updateApsInterception();
  assert.equal(clearGame.projectiles.length, 0, 'APS intercepts outside 5 cells');
  assert.equal(clearGame.apsAmmo.reduce((a, b) => a + b), 7);
});

test('In-flight player ATGM gets jammed within 5 cells of JAMMER and detonates at scattered point within 3 cells', () => {
  const jammerX = 0;
  const jammerZ = 10;
  const missilesDetonated = [];
  const game = Object.assign(Object.create(TankGameEngine.prototype), {
    playerX: 0,
    playerZ: 0,
    enemies: [{ id: 1, hp: 26, enemyClass: 'JAMMER', x: jammerX, z: jammerZ, hitRadius: 0.85 }],
    grid: Array.from({ length: 36 }, () => Array.from({ length: 36 }, () => ({ type: 0, hp: 0 }))),
    projectiles: [
      {
        x: 0,
        z: 5, // 5 world units (2.5 cells) from jammer -> inside 5-cell radius
        vx: 0,
        vz: 16,
        speed: 16,
        fromPlayer: true,
        isMissile: true,
        damage: 25,
        penetration: 60,
        life: 3.0,
        traveled: 5,
        radius: 0.5,
        mesh: { position: { set() {} }, rotation: { y: 0 } },
      },
    ],
    fxGroup: { remove() {} },
    fx: {},
    spawnSparks() {},
    emitProjectileTrail() {},
    detonateMissile(p) {
      missilesDetonated.push({ x: p.x, z: p.z, jammedTarget: p.jammedTarget });
    },
    lerpAngle(a, b, t) {
      const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
      return a + diff * Math.min(1, t);
    },
  });

  const startX = game.projectiles[0].x;
  const startZ = game.projectiles[0].z;

  for (let step = 0; step < 60 && game.projectiles.length > 0; step++) {
    game.updateProjectiles(0.05);
  }

  assert.equal(missilesDetonated.length, 1, 'missile detonated');
  assert.ok(missilesDetonated[0].jammedTarget, 'missile acquired a jammed scatter target');
  const distFromJamPoint = Math.hypot(
    missilesDetonated[0].jammedTarget.x - startX,
    missilesDetonated[0].jammedTarget.z - startZ
  );
  assert.ok(
    distFromJamPoint <= JAMMER_ECM.MISSILE_SCATTER_CELLS * TILE_SIZE + 1e-6,
    `scatter target within 3 cells (${distFromJamPoint})`
  );
});
