/** About view: game overview, core systems, and technical stack. */
export function renderAbout() {
  return `
    <p class="menu-lead">BATTLE TANK is a 3D isometric tactical tank assault game inspired by classic Battle City, engineered with modular armored warfare and destructible 36×36 arenas.</p>
    <div class="menu-grid">
      <article class="menu-card" style="cursor:default">
        <span class="menu-kicker">DESTRUCTIBLE ARENAS</span>
        <strong>36 × 36 Tactical Grids</strong>
        <p>Every sector spans 1,296 cells with multi-block destructible brick, reinforced 16 HP concrete, stealth forest canopies, water crossings, low-friction ice, and fortified Command Bases.</p>
      </article>
      <article class="menu-card" style="cursor:default">
        <span class="menu-kicker">MODULAR ENGINEERING</span>
        <strong>5 Tracks × 5 Tiers</strong>
        <p>Upgrade Cannon, Chassis, Frame, Engine, and Armor from Tier I to Tier V with live 3D visual changes, plus standalone modules like 4-Corner APS, Homing ATGM pods, and Auto-Repair Kits.</p>
      </article>
      <article class="menu-card" style="cursor:default">
        <span class="menu-kicker">TACTICAL AI &amp; BOSSES</span>
        <strong>12 Enemy Classes &amp; 3 Bosses</strong>
        <p>Face flanking Scouts, indirect-fire Howitzers, stealth Snipers, Sapper minelayers, Flamethrowers, and three unique Sector Bosses: Mammoth, Hydra, and the directional-shield Titan.</p>
      </article>
      <article class="menu-card" style="cursor:default">
        <span class="menu-kicker">PURE WEB STACK</span>
        <strong>Zero-Bundler Three.js</strong>
        <p>Built strictly with native ES Modules, HTML5, standalone CSS, and Three.js WebGL — designed for instant browser launch with hardware or software WebGL fallback.</p>
      </article>
    </div>
    <div class="menu-actions" style="margin-top:28px;">
      <a class="menu-primary" href="/campaign">Launch Campaign →</a>
      <a class="menu-secondary" href="/contracts">View Contracts</a>
      <a class="menu-secondary" href="/survival">Endless Survival</a>
    </div>
  `;
}

