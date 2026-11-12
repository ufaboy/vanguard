/** Home command screen: hero artwork, main navigation and entry points. */
export function renderHome() {
  return `<main class="menu-page command-home">
    <header class="command-header">
      <button class="command-brand" data-action="menu-page" data-page="home" aria-label="Iron Vanguard home"><span class="command-insignia" aria-hidden="true">IV</span><span>IRON VANGUARD<small>TACTICAL TANK ASSAULT</small></span></button>
      <nav aria-label="Main navigation"><button data-action="toggle-codex">Codex</button><button data-action="menu-page" data-page="guide">Field guide</button><button data-action="menu-page" data-page="settings">Settings</button></nav>
    </header>
    <section class="command-hero" aria-labelledby="command-title">
      <img class="command-art" src="./images/home-battle.webp" alt="Player tank advancing through a rubble-strewn city street" fetchpriority="high" width="1600" height="1100">
      <div class="command-atmosphere" aria-hidden="true"></div>
      <div class="command-copy"><p class="command-eyebrow"><span></span> ARMORED WARFARE / YOUR COMMAND</p>
        <h1 id="command-title" tabindex="-1">IRON<br><span>VANGUARD</span></h1>
        <p class="command-tagline">Steel yourself.<br> Break the line.</p>
        <p class="command-description">Take command of your tank. Tear through enemy defenses, survive the counterattack, and build a machine that hits harder.</p>
        <div class="command-actions"><button class="command-deploy" data-action="menu-page" data-page="play"><span><small>CHOOSE YOUR OPERATION</small>Play</span><span aria-hidden="true">→</span></button><button class="command-hangar" data-action="toggle-upgrades">Hangar & Workshop <span aria-hidden="true">↗</span></button></div>
      </div>
      <div class="command-vehicle-tag" aria-hidden="true"><span>PLAYER / MAIN BATTLE TANK</span><strong>BUILT TO BREAK THROUGH</strong><i></i></div>
      <div class="command-coordinate" aria-hidden="true">36 × 36 / DESTRUCTIBLE BATTLEFIELDS</div>
    </section>
    <section class="command-features" aria-label="Combat essentials">
      <button data-action="menu-page" data-page="campaign"><span class="command-feature-number">01</span><span><small>THE FRONT LINE</small><strong>Fight your way forward</strong><p>Choose a mission. Take the objective.</p></span><b aria-hidden="true">↗</b></button>
      <button data-action="toggle-upgrades"><span class="command-feature-number">02</span><span><small>THE WAR MACHINE</small><strong>Make every upgrade count</strong><p>Five systems. Five tiers. Your tank.</p></span><b aria-hidden="true">↗</b></button>
      <button data-action="toggle-codex"><span class="command-feature-number">03</span><span><small>THE ENEMY</small><strong>Know what you are facing</strong><p>Inspect armor, weapons, and threats.</p></span><b aria-hidden="true">↗</b></button>
    </section>
    <footer class="command-footer"><span>IRON VANGUARD <i>/</i> FIELD COMMAND</span><span>PLAN. EQUIP. DEPLOY.</span></footer>
  </main>`;
}
