import test from 'node:test';
import assert from 'node:assert/strict';
import { createEncounterState, updateEncounters } from '../public/src/game/encounters.js';
import { normalizeMapDefinition } from '../public/src/game/levels.js';

const groups = () => [
  { id: 'a', label: 'A', enemies: ['SCOUT', 'SCOUT'], recoverySec: 0 },
  { id: 'b', label: 'B', enemies: ['STANDARD'], recoverySec: 10 },
];

function run(state, steps, liveCount) {
  const spawned = [];
  const announced = [];
  for (let i = 0; i < steps; i++) {
    updateEncounters(state, 0.1, liveCount, 5, 0.5, (type) => (spawned.push(type), true), (l) => announced.push(l));
  }
  return { spawned, announced };
}

test('nextWave "cleared" waits for an empty field, then exactly delaySec', () => {
  const state = createEncounterState(groups(), 2, { when: 'cleared', delaySec: 3 });
  // One enemy of the first wave still alive: the default rule would advance, "cleared" must not.
  assert.deepEqual(run(state, 100, 1).announced, []);
  // Field empty: 2.9 s is too early, 3 s starts the next wave and its first tank spawns at once.
  assert.deepEqual(run(state, 29, 0).announced, []);
  const { announced, spawned } = run(state, 2, 0);
  assert.deepEqual(announced, ['B']);
  assert.deepEqual(spawned, ['STANDARD']);
});

test('maps without nextWave keep the default trigger (one survivor allowed, halved recovery)', () => {
  const state = createEncounterState(groups(), 2);
  const { announced } = run(state, 51, 1);
  assert.deepEqual(announced, ['B']);
});

test('map normalization validates enemies.nextWave', () => {
  const base = { surfaceLayout: Array(40).fill('G'.repeat(40)), objectLayout: Array(40).fill('.'.repeat(40)) };
  assert.equal(normalizeMapDefinition(base).nextWave, null);
  assert.deepEqual({ ...normalizeMapDefinition({ ...base, enemies: { nextWave: { when: 'cleared', delaySec: 3 } } }).nextWave }, { when: 'cleared', delaySec: 3 });
  assert.throws(() => normalizeMapDefinition({ ...base, enemies: { nextWave: { when: 'later' } } }), /nextWave/);
});
