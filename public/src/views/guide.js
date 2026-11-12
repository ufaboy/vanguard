/** Field guide screen: controls reference and mission basics. */
const CONTROLS = Object.freeze([
  ['W A S D / Arrows', 'Move relative to the camera'],
  ['Mouse / Left click', 'Aim / Fire cannon'],
  ['Space / E', 'Launch a homing missile'],
  ['Right click', 'Designate a target; fire a missile on empty ground'],
  ['1 / 2 / 3', 'Activate equipped module slots'],
  ['C', 'Cycle camera view'],
  ['Middle mouse drag', 'Rotate camera'],
  ['M', 'Tactical map and route planner'],
  ['H / U / I', 'Diagnostics / Hangar / Codex'],
  ['Esc / P', 'Pause or resume combat'],
]);

export function renderGuide() {
  return `<p class="menu-lead">Know the objective. Protect your tank. Bring the salvage home.</p><div class="menu-guide"><section><h2>Controls</h2><dl>${CONTROLS.map(([key, action]) => `<div><dt>${key}</dt><dd>${action}</dd></div>`).join('')}</dl></section><section><h2>Before you deploy</h2><p>Begin with First Contact (20 hostiles), then unlock Broken Avenue (21 hostiles), Civic Shelter (22 hostiles), and Railway Cut (23 hostiles). On defense missions, protect the allied HQ as well as your tank.</p><h2>Survive and recover</h2><p>Use cover, attack exposed flanks, and collect supplies. Destroyed tanks award credits. Shoot wooden BOX caches to release Power-Ups, then drive over them to collect them. Released supplies remain until collected or the mission ends; leave repair kits for later when needed. Your field base repairs damage while it remains intact. Below 33% hull integrity, movement slows down.</p><h2>Build your tank</h2><p>Visit the Hangar & Workshop from the operation screen. Develop five component tracks through five tiers and equip standalone modules. Open the Codex to inspect tanks, equipment, and terrain in 3D.</p><p>Aborting a mission preserves collected loot; uncollected battlefield loot is lost.</p></section></div>`;
}
