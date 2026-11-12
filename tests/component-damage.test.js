import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveUpgradeTiers, rollComponentDamage, normalizeComponentDamage, COMPONENT_DAMAGE_CHANCE } from '../public/src/sim/component-damage.js';

const upgraded = { cannon: 5, chassis: 4, frame: 3, engine: 3, armor: 2 };
const hit = { damage: 1, zone: 'hull', aspect: 'rear' };
test('one-tier penalty preserves purchased tiers and cannot reduce Tier 1', () => {
  const owned = { ...upgraded, armor: 1 };
  const effective = effectiveUpgradeTiers(owned, { cannon: true, armor: true });
  assert.equal(effective.cannon, 4); assert.equal(effective.armor, 1); assert.equal(owned.cannon, 5);
});
test('no roll for zero damage, cooldown, or an entirely Tier 1 loadout', () => {
  const random = () => { throw Error('Unexpected random roll'); };
  assert.equal(rollComponentDamage(upgraded, {}, 0.001, hit, random), null);
  assert.equal(rollComponentDamage(upgraded, {}, 0, { ...hit, damage: 0 }, random), null);
  assert.equal(rollComponentDamage({}, {}, 0, hit, random), null);
});
test('configured chance boundary and already damaged components', () => {
  assert.equal(rollComponentDamage(upgraded, {}, 0, hit, () => COMPONENT_DAMAGE_CHANCE), null);
  assert.equal(rollComponentDamage(upgraded, {}, 0, hit, () => 0), 'cannon');
  const faults = normalizeComponentDamage(Object.fromEntries(Object.keys(upgraded).map(key => [key, true])));
  assert.equal(rollComponentDamage(upgraded, faults, 0, hit, () => 0), null);
});
test('hit location favors cannon, engine, and lateral protection respectively', () => {
  const count = (zone, aspect) => {
    const counts = Object.fromEntries(Object.keys(upgraded).map(key => [key, 0]));
    for (let i = 0; i < 1400; i++) {
      const values = [0, (i + 0.5) / 1400];
      counts[rollComponentDamage(upgraded, {}, 0, { ...hit, zone, aspect }, () => values.shift())]++;
    }
    return counts;
  };
  const turret = count('turret', 'front'), rear = count('hull', 'rear'), side = count('hull', 'left');
  assert.ok(turret.cannon > turret.armor * 2);
  assert.ok(rear.engine > rear.chassis * 2);
  assert.equal(side.chassis, side.armor); assert.ok(side.chassis > side.frame * 2);
});


test('damage rate matches the configured chance across evenly distributed rolls', () => {
  let hits = 0;
  for (let i = 0; i < 1000; i++) {
    const values = [(i + 0.5) / 1000, 0];
    if (rollComponentDamage(upgraded, {}, 0, hit, () => values.shift())) hits++;
  }
  assert.equal(hits, Math.round(COMPONENT_DAMAGE_CHANCE * 1000));
});
