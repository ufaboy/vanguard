/** FAQ & Field Guide view: controls, combat mechanics, and common questions. */
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

const FAQ_ITEMS = Object.freeze([
  {
    q: 'How do tank stats and armor penetration work?',
    a: 'Every tank has a base hull plus 5 core tracks (Cannon, Chassis, Frame, Engine, Armor) and optional modules. Armor is calculated per hit side (front, left, right, rear). Cannon penetration reduces the target’s effective armor percentage before final damage is applied.',
  },
  {
    q: 'How do I cross water or drive smoothly on ice?',
    a: 'Upgrade your Chassis to Tier IV (All-Terrain Tracks) or Tier V (Grav-Hover). Both cross deep water and handle ice, mud, and sand without slip or slowdown.',
  },
  {
    q: 'How does the Active Protection System (APS) work?',
    a: 'The 4-corner APS intercepts incoming Cannon Mk1–Mk3 shells and missiles for 1 charge each. Heavy Cannon Mk4/Mk5, Howitzer, and Mammoth Dual shells cost 2 charges. Flamethrowers and Titan Rail shots bypass APS.',
  },
  {
    q: 'How are credits, repairs, and progress saved?',
    a: 'Your campaign unlocks, credits, component tiers, and survival records are stored locally in your browser via localStorage and persist across all pages and sessions.',
  },
  {
    q: 'What happens if I abort a mission early?',
    a: 'Collected credits and salvaged loot remain in your save, while uncollected battlefield drops are lost.',
  },
]);

export function renderFaq() {
  const controlsHtml = CONTROLS.map(([key, action]) => `<div><dt>${key}</dt><dd>${action}</dd></div>`).join('');
  const faqHtml = FAQ_ITEMS.map(
    (item) => `<article class="menu-card" style="cursor:default"><strong>${item.q}</strong><p>${item.a}</p></article>`
  ).join('');

  return `
    <p class="menu-lead">Controls reference, battlefield survival rules, and answers to the most common tactical questions.</p>
    <div class="menu-guide">
      <section>
        <h2>Controls</h2>
        <dl>${controlsHtml}</dl>
      </section>
      <section>
        <h2>Before you deploy</h2>
        <p>Begin with First Contact (20 hostiles), then unlock Broken Avenue, Civic Shelter, and Railway Cut. On defense missions, protect the allied Command Base HQ as well as your tank.</p>
        <h2>Survive and recover</h2>
        <p>Use cover, attack exposed flanks, and shoot wooden BOX caches to release Power-Ups. Your field base repairs damage while it remains intact. Below 33% hull integrity, movement speed drops by 30%.</p>
        <h2>Build your tank</h2>
        <p>Visit the Hangar &amp; Workshop to upgrade all five core systems across five tiers and equip standalone modules. Open the 3D Codex to inspect enemy armor and weapons.</p>
      </section>
    </div>
    <h2 style="margin-top:40px;font-size:24px;font-weight:800;">Frequently Asked Questions</h2>
    <div class="menu-grid" style="margin-top:16px;">${faqHtml}</div>
  `;
}

