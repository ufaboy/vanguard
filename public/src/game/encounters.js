/** Dynamic campaign encounter state and enemy lifecycle management. */

/**
 * @param {object[]} groups encounter groups in order
 * @param {number} [initialConsumed] tanks of the first group already placed at load
 * @param {{ when: 'cleared', delaySec: number } | null} [nextWave] map `enemies.nextWave`: when set, the next
 *   group starts exactly `delaySec` after every live enemy is destroyed (instead of the default trigger).
 */
export function createEncounterState(groups, initialConsumed = 0, nextWave = null) {
  return { groups, index: 0, cursor: initialConsumed, elapsed: 0, recovery: 0, spawnTimer: 0, nextWave };
}

function readyForNextGroup(state, dt, liveCount, next) {
  if (state.nextWave?.when === 'cleared') {
    if (liveCount > 0) {
      state.recovery = 0;
      return false;
    }
    state.recovery += dt;
    return state.recovery >= state.nextWave.delaySec;
  }
  if (liveCount <= 1 || (state.elapsed >= 30 && liveCount <= 3)) {
    state.recovery += dt;
    // Cut recovery time between waves in half for faster combat flow
    return state.recovery >= (next.recoverySec || 0) * 0.5;
  }
  state.recovery = 0;
  return false;
}

export function remainingEncounterEnemies(state) {
  return state.groups.reduce((total, group, index) => total + (index < state.index ? 0 : group.enemies.length - (index === state.index ? state.cursor : 0)), 0);
}

export function updateEncounters(state, dt, liveCount, maxConcurrent, spawnInterval, spawn, announce) {
  state.elapsed += dt;
  let group = state.groups[state.index];
  if (!group) return;
  if (state.cursor === group.enemies.length) {
    const next = state.groups[state.index + 1];
    if (!next || !readyForNextGroup(state, dt, liveCount, next)) return;
    state.index++;
    state.cursor = 0;
    state.elapsed = 0;
    state.recovery = 0;
    // A "cleared" wave already waited its delay, so its first tank rolls in right away.
    state.spawnTimer = state.nextWave?.when === 'cleared' ? 0 : 1.75;
    group = next;
    announce(group.label);
    return;
  }
  if (liveCount >= maxConcurrent) return;
  state.spawnTimer -= dt;
  if (state.spawnTimer > 0) return;
  if (spawn(group.enemies[state.cursor], group)) {
    state.cursor++;
    state.spawnTimer = spawnInterval;
  } else {
    state.spawnTimer = 0.5;
  }
}
