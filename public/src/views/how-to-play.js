/** How to Play view: controls, game modes, combat mechanics, upgrades, and tactical Q&A. */
import { PAGE_PATHS } from '../app/routes.js';

const CONTROLS = Object.freeze([
  ['W A S D / Arrows', 'Move relative to the camera'],
  ['Mouse / Left click', 'Aim turret / Fire main cannon'],
  ['Space / E', 'Launch a homing missile (ATGM)'],
  ['Right click', 'Designate a target; fire a missile on empty ground'],
  ['1 / 2 / 3', 'Activate equipped module slots'],
  ['C', 'Cycle camera view'],
  ['Middle mouse drag', 'Rotate camera'],
  ['M', 'Tactical map and route planner'],
  ['H / U / I', 'Diagnostics / Hangar / Codex'],
  ['Esc / P', 'Pause or resume combat'],
]);

const QUICK_ANSWERS = Object.freeze([
  {
    q: 'How do tank stats and armor penetration work?',
    a: 'Every tank combines a base hull with 5 core tracks (Cannon, Chassis, Frame, Engine, Armor) and optional modules. Armor is evaluated per hit side (front, left, right, rear). Cannon penetration reduces the target’s effective armor percentage before final damage is applied.',
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
    q: 'How do BOX supply drops and field repairs work?',
    a: 'Shoot wooden BOX caches to roll tactical Power-Ups (Repair, EMP, Base Restore, APS, or Missile). Your Command Base HQ also repairs your hull while it remains intact. Below 33% hull integrity, movement speed drops by 30%.',
  },
  {
    q: 'How are credits, repairs, and progress saved?',
    a: 'Campaign unlocks, credits, component tiers, and survival records are stored locally in your browser via localStorage and persist across sessions.',
  },
  {
    q: 'What happens if I abort a mission early?',
    a: 'Collected credits and salvaged loot remain in your save, while uncollected battlefield drops are lost.',
  },
]);

export function renderHowToPlay() {
  const controlsHtml = CONTROLS.map(([key, action]) => `<div><dt>${key}</dt><dd>${action}</dd></div>`).join('');
  const answersHtml = QUICK_ANSWERS.map(
    (item) => `<article class="menu-card" style="cursor:default"><strong>${item.q}</strong><p>${item.a}</p></article>`
  ).join('');

  return `
    <p class="menu-lead">Complete field manual for BATTLE TANK: controls, game modes, directional armor, modular upgrades, and battlefield survival.</p>
    <div class="menu-guide">
      <section>
        <h2>Controls</h2>
        <dl>${controlsHtml}</dl>
      </section>
      <section>
        <h2>1. Choose Your Operation</h2>
        <p>Start in <strong>Campaign</strong> with First Contact (20 hostiles), then break through Broken Avenue, Civic Shelter, and Railway Cut. On defense missions, protect the allied Command Base HQ—losing either HQ cell ends the operation. Test endless waves in <strong>Survival</strong> or run high-stakes <strong>Contracts</strong> for extra credits.</p>
        <h2>2. Fight Smart &amp; Flank</h2>
        <p>Read the 36×36 arena: smash brick walls to open firing lanes, watch out for 16 HP reinforced concrete, and use forest canopies for concealment. Enemy armor is directional—flank heavy tanks and bosses like Titan from the sides or rear instead of trading shots into their glacis.</p>
        <h2>3. Upgrade in the Hangar</h2>
        <p>Spend earned credits in the <a href="${PAGE_PATHS.hangar}" style="color:#d6e7a0;text-decoration:underline;">Hangar &amp; Workshop</a> (or press <strong>U</strong> near your base) to upgrade Cannon, Chassis, Frame, Engine, and Armor from Tier I to Tier V, and equip standalone modules like 4-Corner APS, Homing ATGM pods, and Auto-Repair Kits.</p>
        <h2>4. Study the 3D Codex</h2>
        <p>Inspect all 12 enemy tank classes, 3 Sector Bosses, weapons, and terrain surfaces in the <a href="${PAGE_PATHS.codex}" style="color:#d6e7a0;text-decoration:underline;">3D Codex</a> before deploying into harder sectors.</p>
      </section>
    </div>
    <h2 style="margin-top:40px;font-size:24px;font-weight:800;">Tactical Mechanics &amp; Q&amp;A</h2>
    <div class="menu-grid" style="margin-top:16px;">${answersHtml}</div>
    <div class="menu-actions" style="margin-top:28px;">
      <a class="menu-primary" href="${PAGE_PATHS.campaign}">Launch Campaign →</a>
      <a class="menu-secondary" href="${PAGE_PATHS.hangar}">Open Hangar &amp; Workshop</a>
      <a class="menu-secondary" href="${PAGE_PATHS.codex}">Browse 3D Codex</a>
    </div>
  `;
}

