import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARMORS, CANNONS, CHASSIS, DURABILITY, ENGINES, FRAMES, OPTIONAL_EQUIPMENT, SPEED_FORMULA,
  computeEffectiveDamage, computeTankStats,
} from '../public/src/game/constants.js';
import { PLAYER_TANK_CONFIG, SECTOR_BOSS_CONFIGS, TANK_CONFIGS, TANK_TYPES, tankBase } from '../public/src/game/vehicles/tanks.js';

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
  const aegis = ARMORS[titan.loadout.armor].armorByAspect;
  const expected = Object.fromEntries(
    ['front', 'left', 'right', 'rear'].map((side) => [
      side,
      Math.min(DURABILITY.MAX_ARMOR, Math.max(0, (titan.base.armor?.[side] || 0) + aegis[side])),
    ])
  );
  assert.deepEqual({ ...stats.armorByAspect }, expected);
  assert.equal(stats.directionalArmor, true);
  assert.equal(stats.armor, Math.min(...Object.values(stats.armorByAspect)));
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

test('Player Tier-1 hull uses base HP and has no stat-only modules', () => {
  const stats = computeTankStats({ ...PLAYER_TANK_CONFIG.defaultLoadout, optionalEquipment: [] }, PLAYER_TANK_CONFIG.base);
  assert.ok(Number.isFinite(stats.maxHP) && stats.maxHP > 0);
  assert.equal(stats.maxHP, PLAYER_TANK_CONFIG.base.hp);
  assert.equal(OPTIONAL_EQUIPMENT.PLAYER_LIFE_PACK, undefined);
  assert.equal(OPTIONAL_EQUIPMENT.ARMOR_PACK, undefined);
});

test('All enemy tank configs produce valid combat stats and finite Cannon Mk1 hits-to-kill', () => {
  const gun = CANNONS.CANNON_Mk1;
  for (const type of Object.values(TANK_TYPES)) {
    const config = TANK_CONFIGS[type];
    const stats = computeTankStats(config.loadout, config.base);
    assert.ok(Number.isFinite(stats.maxHP) && stats.maxHP > 0, `${type} maxHP`);
    assert.ok(Number.isFinite(stats.totalMass) && stats.totalMass > 0, `${type} totalMass`);
    assert.ok(Number.isFinite(stats.moveSpeed) && stats.moveSpeed > 0, `${type} moveSpeed`);
    assert.ok(Number.isFinite(stats.sightRadius) && stats.sightRadius > 0, `${type} sightRadius`);
    assert.ok(Number.isFinite(stats.radioAlertRadius) && stats.radioAlertRadius >= 0, `${type} radioAlertRadius`);
    for (const side of ['front', 'left', 'right', 'rear']) {
      assert.ok(
        Number.isFinite(stats.armorByAspect[side]) && stats.armorByAspect[side] >= 0 && stats.armorByAspect[side] <= DURABILITY.MAX_ARMOR,
        `${type} armor ${side}`
      );
    }
    const dmg = computeEffectiveDamage(gun.damage, gun.penetration, stats.armorByAspect.front);
    assert.ok(Number.isFinite(dmg) && dmg > 0, `${type} effective damage`);
    const hits = Math.ceil(stats.maxHP / dmg);
    assert.ok(Number.isInteger(hits) && hits >= 1, `${type} hits`);
  }
});

test('Sector boss configs produce valid combat stats and armor bounds', () => {
  for (const [id, config] of Object.entries(SECTOR_BOSS_CONFIGS)) {
    const stats = computeTankStats(config.loadout, config.base);
    assert.ok(Number.isFinite(stats.maxHP) && stats.maxHP > 0, `${id} maxHP`);
    assert.ok(Number.isFinite(stats.totalMass) && stats.totalMass > 0, `${id} totalMass`);
    assert.ok(Number.isFinite(stats.moveSpeed) && stats.moveSpeed > 0, `${id} moveSpeed`);
    const sides = Object.values(stats.armorByAspect);
    for (const val of sides) {
      assert.ok(Number.isFinite(val) && val >= 0 && val <= DURABILITY.MAX_ARMOR, `${id} armor`);
    }
    assert.equal(stats.armor, Math.min(...sides), `${id} scalar armor is weakest side`);
    assert.equal(stats.directionalArmor, sides.some((v) => v !== stats.armorByAspect.front), `${id} directionalArmor`);
  }
});

test('Player cannon line (Mk1..Mk5) has valid combat stats and Mk5 is twin-barrel', () => {
  for (const id of ['CANNON_Mk1', 'CANNON_Mk2', 'CANNON_Mk3', 'CANNON_Mk4', 'CANNON_Mk5']) {
    const gun = CANNONS[id];
    assert.ok(gun, `${id} exists`);
    assert.ok(Number.isFinite(gun.damage) && gun.damage > 0, `${id} damage`);
    assert.ok(Number.isFinite(gun.penetration) && gun.penetration >= 0 && gun.penetration <= 100, `${id} penetration`);
    assert.ok(Number.isFinite(gun.fireCooldown) && gun.fireCooldown > 0, `${id} fireCooldown`);
    assert.ok(Number.isFinite(gun.mass) && gun.mass > 0, `${id} mass`);
  }
  assert.ok(CANNONS.CANNON_Mk5.barrels > 1);
  assert.ok(Number.isFinite(CANNONS.CANNON_Mk5.interBarrelCooldown) && CANNONS.CANNON_Mk5.interBarrelCooldown > 0);
});

test('CH4 crosses water while CH5 hovers across water without penalty', () => {
  const ch3 = computeTankStats({ ...loadout, chassis: 'CH3' }, PLAYER_TANK_CONFIG.base);
  const ch4 = computeTankStats({ ...loadout, chassis: 'CH4' }, PLAYER_TANK_CONFIG.base);
  const ch5 = computeTankStats({ ...loadout, chassis: 'CH5' }, PLAYER_TANK_CONFIG.base);

  assert.equal(ch3.canCrossWater, false);
  assert.equal(ch3.waterSpeedMultiplier, 0);

  assert.equal(ch4.canCrossWater, true);
  assert.equal(ch4.canHover, false);
  assert.ok(ch4.waterSpeedMultiplier > 0 && ch4.waterSpeedMultiplier <= 1);
  assert.equal(ch4.waterSpeedMultiplier, CHASSIS.CH4.waterSpeedMultiplier);

  assert.equal(ch5.canCrossWater, true);
  assert.equal(ch5.canHover, true);
  assert.equal(ch5.waterSpeedMultiplier, 1.0);
});
