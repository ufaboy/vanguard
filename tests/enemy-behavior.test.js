import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_KIND,
  ACTION_TUNING,
  GUNNER,
  ROLE_CONFIGS,
  armShot,
  clampLuck,
  computeAimPoint,
  createGunnerState,
  defineBehavior,
  indirectMissPoint,
  missAngle,
  onGunnerFired,
  randomCellInOtherZone,
  randomCellInZone,
  resolveBehaviorActions,
  rollLuck,
  rollTankSpecial,
  selectAction,
  shotArmedFor,
  stepGunner,
  zoneOf,
} from '../public/src/sim/behavior/index.js';
import { SeededRng } from '../public/src/sim/rng.js';
import { SECTOR_BOSS_CONFIGS, TANK_CONFIGS } from '../public/src/game/tanks.js';
import { SECTORS } from '../public/src/game/levels.js';

const seeded = (seed) => {
  const rng = new SeededRng(seed);
  return () => rng.next();
};

const ENEMY_CONFIGS = [
  ...Object.entries(TANK_CONFIGS),
  ...Object.entries(SECTOR_BOSS_CONFIGS),
];

test('Every enemy and boss declares its own behavior: a known role and valid actions', () => {
  for (const [id, cfg] of ENEMY_CONFIGS) {
    assert.ok(cfg.behavior, `${id} has a behavior`);
    assert.ok(ROLE_CONFIGS[cfg.behavior.role], `${id} role ${cfg.behavior.role} is configured`);
    assert.ok(cfg.behavior.actions.length > 0, `${id} lists actions`);
    for (const action of cfg.behavior.actions) {
      assert.ok(action.luck >= 0 && action.luck <= 1, `${id}.${action.id} luck in range`);
    }
    // Always has somewhere to go when nothing else applies
    assert.ok(cfg.behavior.actions.some((a) => a.id === 'patrol_zone'), `${id} can patrol`);
    assert.equal(cfg.luck, undefined, `${id} no longer uses the old luck pair`);
  }
});

test('Armed enemies list shoot_obstacle so a wall on their path never pins them', () => {
  for (const [id, cfg] of ENEMY_CONFIGS) {
    if (cfg.loadout?.gun === 'NONE') continue;
    assert.ok(cfg.behavior.actions.some((a) => a.id === 'shoot_obstacle'), id);
  }
});

test('Unknown or duplicate actions and out-of-range luck fail loudly', () => {
  assert.throws(() => defineBehavior('line', [{ id: 'teleport', luck: 1 }]), /Unknown enemy action/);
  assert.throws(
    () => defineBehavior('line', [{ id: 'shoot_player', luck: 0.5 }, { id: 'shoot_player', luck: 0.4 }]),
    /Duplicate/
  );
  assert.throws(() => defineBehavior('line', [{ id: 'shoot_player', luck: 1.5 }]), /luck/);
  const b = defineBehavior('line', [{ id: 'move_to_zone', luck: 0.75, zone: { row: 2, col: 3 } }]);
  assert.equal(b.actions[0].kind, ACTION_KIND.MOVE);
  assert.deepEqual(b.actions[0].zone, { row: 2, col: 3 });
});

test('Cover and ambush are movement actions with optional parameters', () => {
  const b = defineBehavior('ambusher', [
    { id: 'ambush', luck: 0.8, triggerCells: 4 },
    { id: 'take_cover', luck: 0.7, afterHitSec: 2, hpBelow: 0.3 },
  ]);
  assert.deepEqual(b.actions.map((a) => a.kind), [ACTION_KIND.MOVE, ACTION_KIND.MOVE]);
  assert.equal(b.actions[0].triggerCells, 4);
  assert.equal(b.actions[1].hpBelow, 0.3);
  assert.equal(TANK_CONFIGS.flamethrower.behavior.actions[0].id, 'ambush', 'flamethrower waits in ambush first');
  assert.equal(TANK_CONFIGS.standard.behavior.actions[0].id, 'take_cover', 'line tank ducks into cover after a hit');
});

test('HOWITZER and missile carriers expose their weapon settings', () => {
  assert.equal(typeof TANK_CONFIGS.howitzer.artillery.aimSec, 'number');
  assert.equal(typeof TANK_CONFIGS.howitzer.artillery.flightSec, 'number');
  assert.equal(typeof TANK_CONFIGS.striker.missile.homing, 'boolean');
});

test('Action luck comes only from the tank config: no map scaling', () => {
  for (const sector of SECTORS) {
    assert.equal(sector.luckScale, undefined, `${sector.name} has no luckScale`);
  }
  assert.equal(clampLuck(-1), 0);
  assert.equal(clampLuck(4), 1);
  assert.equal(clampLuck(NaN), 0);
  const behavior = defineBehavior('line', [
    { id: 'move_to_player', luck: 0.6 },
    { id: 'shoot_player', luck: 0.8 },
  ]);
  assert.deepEqual(resolveBehaviorActions(behavior).map((a) => a.luck), [0.6, 0.8]);
});

test('Luck is a plain probability: 0.75 succeeds on rolls below 0.75', () => {
  assert.equal(rollLuck(0.75, () => 0.74), true);
  assert.equal(rollLuck(0.75, () => 0.75), false);
  assert.equal(rollLuck(1, () => 0.999), true);
  assert.equal(rollLuck(0, () => 0), false);
  const random = seeded(11);
  let ok = 0;
  for (let i = 0; i < 4000; i++) if (rollLuck(0.5, random)) ok++;
  assert.ok(Math.abs(ok / 4000 - 0.5) < 0.03, `~50% success, got ${ok / 4000}`);
});

test('Actions are chosen by list order among those whose condition holds', () => {
  const { actions } = defineBehavior('line', [
    { id: 'move_to_player', luck: 0.7 },
    { id: 'move_to_player_base', luck: 0.5 },
    { id: 'shoot_player', luck: 0.5 },
    { id: 'patrol_zone', luck: 1 },
  ]);
  const pick = (available) => selectAction(actions, ACTION_KIND.MOVE, (a) => available.includes(a.id))?.id;
  assert.equal(pick(['move_to_player', 'move_to_player_base', 'patrol_zone']), 'move_to_player');
  assert.equal(pick(['move_to_player_base', 'patrol_zone']), 'move_to_player_base');
  assert.equal(pick(['patrol_zone', 'shoot_player']), 'patrol_zone');
  assert.equal(pick([]), undefined);
});

test('Specials roll the listed luck; unlisted specials always succeed', () => {
  const tank = {
    actions: resolveBehaviorActions(defineBehavior('minelayer', [{ id: 'set_mine', luck: 0.25 }])),
    behaviorRng: () => 0.5,
  };
  assert.equal(rollTankSpecial(tank, 'set_mine'), false);
  assert.deepEqual(tank.lastSpecial, { id: 'set_mine', ok: false });
  assert.equal(rollTankSpecial(tank, 'jam'), true);
});

test('Zones: 6x6-cell sectors; a failed move goes to a different zone', () => {
  const grid = Array.from({ length: 36 }, () => Array(36).fill(0));
  assert.deepEqual(zoneOf(0, 0), { row: 0, col: 0 });
  assert.deepEqual(zoneOf(35, 13), { row: 5, col: 2 });
  const random = seeded(5);
  for (let i = 0; i < 50; i++) {
    const cell = randomCellInZone(grid, { row: 2, col: 4 }, random);
    assert.deepEqual(zoneOf(cell.row, cell.col), { row: 2, col: 4 });
    const away = randomCellInOtherZone(grid, [{ row: 2, col: 4 }, { row: 0, col: 0 }], random);
    const z = zoneOf(away.row, away.col);
    assert.ok(!(z.row === 2 && z.col === 4) && !(z.row === 0 && z.col === 0));
  }
  // Solid zones yield no cell
  const walls = Array.from({ length: 36 }, () => Array(36).fill(2));
  assert.equal(randomCellInZone(walls, { row: 1, col: 1 }, random), null);
});

test('No-lead rule: aim depends only on the current target position', () => {
  const moving = { x: 10, z: 4, vx: 30, vz: -30 };
  assert.deepEqual(computeAimPoint(moving), { x: 10, z: 4 });
  const g = createGunnerState(() => 0.5);
  armShot(g, 'shoot_player', 'target', true);
  const res = stepGunner(g, {
    dt: 0.016,
    shooter: { x: 0, z: 0, turretAngle: 0 },
    target: moving,
    visible: true,
  });
  assert.ok(Math.abs(res.desiredTurretAngle - Math.atan2(10, 4)) < 1e-9);
});

test('A hit aims exactly; a miss aims beside the target by a clearing angle', () => {
  const target = { x: 0, z: 10 };
  const shooter = { x: 0, z: 0, turretAngle: 0 };
  const hit = createGunnerState(() => 0.9);
  armShot(hit, 'shoot_player', 'player', true);
  assert.equal(stepGunner(hit, { dt: 0.016, shooter, target, targetKey: 'player', visible: true }).desiredTurretAngle, 0);

  const miss = createGunnerState(() => 0.9);
  armShot(miss, 'shoot_player', 'player', false);
  const res = stepGunner(miss, { dt: 0.016, shooter, target, targetKey: 'player', visible: true, targetRadius: 0.85 });
  // The aim line passes the target centre further than its radius + margin
  const lateral = Math.abs(Math.sin(res.desiredTurretAngle) * 10);
  assert.ok(lateral > 0.85 + ACTION_TUNING.MISS_MARGIN * 0.9, `lateral ${lateral}`);
  assert.ok(Math.abs(missAngle(10, 0.85, -1) + missAngle(10, 0.85, 1)) < 1e-12, 'symmetric sides');
});

test('Indirect misses land outside the splash circle', () => {
  const random = seeded(3);
  for (let i = 0; i < 100; i++) {
    const p = indirectMissPoint({ x: 0, z: 0 }, 3, random);
    assert.ok(Math.hypot(p.x, p.z) >= 3 * ACTION_TUNING.INDIRECT_MISS_RADII[0] - 1e-9);
  }
});

test('Gunner waits for its reaction time, turret alignment and an armed shot before firing', () => {
  const g = createGunnerState(() => 0.5);
  const target = { x: 0, z: 10 };
  const aligned = { x: 0, z: 0, turretAngle: 0 };
  let res = stepGunner(g, { dt: 0.1, shooter: aligned, target, visible: true });
  assert.equal(res.canFire, false, 'no instant shot on acquisition');
  armShot(g, 'shoot_player', 'target', true);
  let t = 0.1;
  while (t < GUNNER.REACTION_SEC + 0.05) {
    res = stepGunner(g, { dt: 0.05, shooter: aligned, target, visible: true });
    t += 0.05;
  }
  assert.equal(res.reacted, true);
  assert.equal(res.canFire, true);

  const offAxis = { x: 0, z: 0, turretAngle: Math.PI / 2 };
  res = stepGunner(g, { dt: 0.016, shooter: offAxis, target, visible: true });
  assert.equal(res.canFire, false, 'does not fire while the turret points away');

  const extra = onGunnerFired(g);
  assert.ok(extra >= 0 && extra <= GUNNER.RELOAD_JITTER);
  assert.equal(shotArmedFor(g, 'shoot_player', 'target'), false, 'each shot is rolled anew');
  res = stepGunner(g, { dt: 0.016, shooter: aligned, target, visible: true });
  assert.equal(res.canFire, false, 'no shot until the next one is armed');

  const wall = createGunnerState(() => 0.5);
  armShot(wall, 'shoot_obstacle', 'breach', true);
  res = stepGunner(wall, { dt: 0.016, shooter: aligned, target, targetKey: 'breach', visible: true, react: false });
  assert.equal(res.canFire, true, 'walls need no reaction time');
});

test('Losing contact past the grace window restarts the reaction; switching targets too', () => {
  const g = createGunnerState(() => 0.5);
  const shooter = { x: 0, z: 0, turretAngle: 0 };
  const target = { x: 0, z: 10 };
  for (let i = 0; i < 40; i++) stepGunner(g, { dt: 0.05, shooter, target, visible: true });
  assert.ok(g.contactTime >= GUNNER.REACTION_SEC);

  stepGunner(g, { dt: 0.3, shooter, target: null, visible: false });
  let res = stepGunner(g, { dt: 0.01, shooter, target, visible: true });
  assert.equal(res.reacted, true, 'short flicker keeps the reaction');

  stepGunner(g, { dt: GUNNER.CONTACT_GRACE_SEC + 0.1, shooter, target: null, visible: false });
  res = stepGunner(g, { dt: 0.01, shooter, target, visible: true });
  assert.equal(res.reacted, false, 'long loss restarts the reaction');

  for (let i = 0; i < 40; i++) stepGunner(g, { dt: 0.05, shooter, target, visible: true });
  res = stepGunner(g, { dt: 0.01, shooter, target, targetKey: 'base', visible: true });
  assert.equal(res.reacted, false, 'new target restarts the reaction');
});
