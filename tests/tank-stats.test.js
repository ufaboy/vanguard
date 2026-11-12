import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARMORS, CANNONS, CHASSIS, ENGINES, FRAMES, OPTIONAL_EQUIPMENT, SPEED_FORMULA,
  computeEffectiveDamage, computeTankStats,
} from '../public/src/game/constants.js';
import { PLAYER_TANK_CONFIG, SECTOR_BOSS_CONFIGS, TANK_CONFIGS, TANK_TYPES, tankBase } from '../public/src/game/tanks.js';

const loadout = { gun: 'CANNON_Mk1', chassis: 'CH2', frame: 'F2', engine: 'E2', armor: 'A2' };

test('HP adds up: base + core components + modules', () => {
  const base = tankBase({ hp: 30 });
  const stats = computeTankStats({ ...loadout, optionalEquipment: ['APS_MODULE'] }, base);
  const expected = 30 + CHASSIS.CH2.hpBonus + FRAMES.F2.hpBonus + ARMORS.A2.hpBonus + (OPTIONAL_EQUIPMENT.APS_MODULE.hpBonus || 0);
  assert.equal(stats.maxHP, expected);
});

test('Mass adds up and speed follows only total mass and engine power', () => {
  const light = computeTankStats(loadout, tankBase({ mass: 0 }));
  const heavy = computeTankStats(loadout, tankBase({ mass: 40 }));
  const parts = CANNONS.CANNON_Mk1.mass + CHASSIS.CH2.mass + FRAMES.F2.mass + ENGINES.E2.mass + ARMORS.A2.mass;
  assert.equal(light.totalMass, parts);
  assert.equal(heavy.totalMass, parts + 40);
  assert.ok(heavy.moveSpeed < light.moveSpeed, 'a heavier base is slower');
  const expected = SPEED_FORMULA.BASE_MULT * Math.sqrt(ENGINES.E2.power / 100) * Math.pow(90 / light.totalMass, 0.65);
  assert.ok(Math.abs(light.moveSpeed - expected) < 1e-9, 'no chassis or frame speed multiplier');
});

test('Armour always works per side: base + armour component', () => {
  const stats = computeTankStats(loadout, tankBase({ armor: { front: 10, rear: 2 } }));
  const a2 = ARMORS.A2.reductionPct;
  assert.deepEqual({ ...stats.armorByAspect }, { front: a2 + 10, left: a2, right: a2, rear: a2 + 2 });
  assert.equal(stats.directionalArmor, true);
  const uniform = computeTankStats(loadout, tankBase());
  assert.equal(uniform.directionalArmor, false);
  assert.equal(uniform.armor, a2);
});

test('Directional armour components replace their uniform value per side (Titan Aegis)', () => {
  const titan = SECTOR_BOSS_CONFIGS.bossTitan;
  const stats = computeTankStats(titan.loadout, titan.base);
  assert.deepEqual({ ...stats.armorByAspect }, { front: 60, left: 35, right: 35, rear: 15 });
});

test('Damage, penetration and reload come from the cannon alone', () => {
  const a = computeTankStats({ ...loadout, gun: 'CANNON_Mk3' }, tankBase({ hp: 5 }));
  const b = computeTankStats({ ...loadout, gun: 'CANNON_Mk3', armor: 'A5' }, tankBase({ hp: 90, mass: 50 }));
  for (const key of ['damage', 'penetration', 'fireCooldown']) {
    assert.equal(a[key], CANNONS.CANNON_Mk3[key]);
    assert.equal(b[key], CANNONS.CANNON_Mk3[key]);
  }
});

test('Sight and radio come from the base; modules may add to them', () => {
  const base = tankBase({ sightRadius: 20, radioAlertRadius: 24 });
  assert.equal(computeTankStats(loadout, base).sightRadius, 20);
  const radar = { id: 'TEST_RADAR', sightBonus: 6, radioBonus: 4 };
  const boosted = computeTankStats({ ...loadout, optionalEquipment: [radar] }, base);
  assert.equal(boosted.sightRadius, 26);
  assert.equal(boosted.radioAlertRadius, 28);
});

test('Player Tier-1 hull: 22 HP base and no stat-only modules', () => {
  const stats = computeTankStats({ ...PLAYER_TANK_CONFIG.defaultLoadout, optionalEquipment: [] }, PLAYER_TANK_CONFIG.base);
  assert.equal(stats.maxHP, 22);
  assert.equal(OPTIONAL_EQUIPMENT.PLAYER_LIFE_PACK, undefined);
  assert.equal(OPTIONAL_EQUIPMENT.ARMOR_PACK, undefined);
});

test('Balance table: player Cannon Mk1 frontal hits to destroy each enemy type', () => {
  const expected = {
    scout: 1, standard: 1, howitzer: 1, hover: 1, kamikaze: 1, engineer: 1, stealth: 1,
    jammer: 2, striker: 2, sapper: 2, flamethrower: 3, armor: 7,
  };
  const gun = CANNONS.CANNON_Mk1;
  for (const type of Object.values(TANK_TYPES)) {
    const config = TANK_CONFIGS[type];
    const stats = computeTankStats(config.loadout, config.base);
    const hits = Math.ceil(stats.maxHP / computeEffectiveDamage(gun.damage, gun.penetration, stats.armorByAspect.front));
    assert.equal(hits, expected[type], type);
  }
});

test('Sector boss HP and armour match the documented values', () => {
  const expected = {
    bossMammoth: { hp: 400, armor: { front: 40, left: 40, right: 40, rear: 40 } },
    bossHydra: { hp: 380, armor: { front: 50, left: 50, right: 50, rear: 50 } },
    bossInferno: { hp: 440, armor: { front: 50, left: 38, right: 38, rear: 25 } },
    bossTitan: { hp: 550, armor: { front: 60, left: 35, right: 35, rear: 15 } },
  };
  for (const [id, want] of Object.entries(expected)) {
    const config = SECTOR_BOSS_CONFIGS[id];
    const stats = computeTankStats(config.loadout, config.base);
    assert.equal(stats.maxHP, want.hp, id);
    assert.deepEqual({ ...stats.armorByAspect }, want.armor, id);
  }
});

test('Player cannon line matches the documented damage, penetration and reload', () => {
  const expected = {
    CANNON_Mk1: [20, 0, 1.5], CANNON_Mk2: [22, 10, 1.25], CANNON_Mk3: [25, 22, 1.2],
    CANNON_Mk4: [28, 32, 1.0], CANNON_Mk5: [28, 32, 1.0],
  };
  for (const [id, [damage, penetration, fireCooldown]] of Object.entries(expected)) {
    assert.deepEqual([CANNONS[id].damage, CANNONS[id].penetration, CANNONS[id].fireCooldown], [damage, penetration, fireCooldown], id);
  }
  assert.equal(CANNONS.CANNON_Mk5.interBarrelCooldown, 0.2);
  assert.equal(CANNONS.CANNON_Mk5.barrels, 2);
});
