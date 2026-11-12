/** Persistent core-component faults, separate from temporary combat subsystems. */
export const COMPONENT_TRACKS = Object.freeze(['cannon', 'chassis', 'frame', 'engine', 'armor']);
const COMPONENT_REPAIR_COST_BY_TIER = Object.freeze({ 1: 300, 2: 600, 3: 900, 4: 1200, 5: 1500 });

/** Repair is priced by the purchased tier, not the temporary damaged tier. */
export function componentRepairCost(tier = 1) {
  return COMPONENT_REPAIR_COST_BY_TIER[Math.max(1, Math.min(5, Math.floor(tier) || 1))];
}
export const COMPONENT_DAMAGE_COOLDOWN = 8;
export const COMPONENT_DAMAGE_CHANCE = 0.25;

export function normalizeComponentDamage(value) {
  return Object.fromEntries(COMPONENT_TRACKS.map(track => [track, value?.[track] === true]));
}

export function effectiveUpgradeTiers(upgrades = {}, damage) {
  return Object.fromEntries(COMPONENT_TRACKS.map(track => [track,
    Math.max(1, (upgrades[track] || 1) - (damage?.[track] ? 1 : 0)),
  ]));
}

export function rollComponentDamage(upgrades, damage, cooldown, hit, random = Math.random) {
  if (!hit || !(hit.damage > 0) || cooldown > 0) return null;
  const weights = hit.zone === 'turret'
    ? [7, 1, 1, 1, 2]
    : hit.aspect === 'rear' ? [1, 2, 2, 7, 2]
    : hit.aspect === 'left' || hit.aspect === 'right' ? [1, 5, 2, 1, 5]
    : [1, 2, 5, 1, 5];
  const eligible = COMPONENT_TRACKS.filter(track => (upgrades[track] || 1) > 1 && !damage[track]);
  if (!eligible.length || random() >= COMPONENT_DAMAGE_CHANCE) return null;
  let choice = random() * eligible.reduce((sum, track) => sum + weights[COMPONENT_TRACKS.indexOf(track)], 0);
  return eligible.find(track => (choice -= weights[COMPONENT_TRACKS.indexOf(track)]) < 0) || eligible.at(-1);
}
