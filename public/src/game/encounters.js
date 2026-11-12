/** Dynamic campaign encounter state and enemy lifecycle management. */

export function createEncounterState(groups, initialConsumed = 0) {
  return { groups, index: 0, cursor: initialConsumed, elapsed: 0, recovery: 0, spawnTimer: 0 };
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
    if (!next) return;
    if (liveCount <= 1 || (state.elapsed >= 30 && liveCount <= 3)) {
      state.recovery += dt;
      // Cut recovery time between waves in half for faster combat flow
      if (state.recovery < (next.recoverySec || 0) * 0.5) return;
      state.index++;
      state.cursor = 0;
      state.elapsed = 0;
      state.recovery = 0;
      state.spawnTimer = 1.75;
      group = next;
      announce(group.label);
    } else {
      state.recovery = 0;
    }
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
