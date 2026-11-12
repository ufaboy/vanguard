import { PAGE_PATHS } from '../app/routes.js';

/** Home command screen: hero artwork, main navigation and entry points. */
export function renderHome() {
  return `<main class="menu-page command-home">
    <header class="command-header">
      <a class="command-brand" href="${PAGE_PATHS.index}" aria-label="Iron Vanguard home"><span class="command-insignia" aria-hidden="true">IV</span><span>IRON VANGUARD<small>TACTICAL TANK ASSAULT</small></span></a>
      <nav aria-label="Main navigation"><a href="${PAGE_PATHS.hangar}">Hangar</a><a href="${PAGE_PATHS.codex}">Codex</a><a href="${PAGE_PATHS.faq}">FAQ</a><a href="${PAGE_PATHS.about}">About</a><button type="button" data-action="open-settings">Settings</button></nav>
    </header>
    <section class="command-hero" aria-labelledby="command-title">
      <img class="command-art" src="./images/home-battle.webp" alt="Player tank advancing through a rubble-strewn city street" fetchpriority="high" width="1600" height="1100">
      <div class="command-atmosphere" aria-hidden="true"></div>
      <div class="command-copy"><p class="command-eyebrow"><span></span> ARMORED WARFARE / YOUR COMMAND</p>
        <h1 id="command-title" tabindex="-1">IRON<br><span>VANGUARD</span></h1>
        <p class="command-tagline">Steel yourself.<br> Break the line.</p>
        <p class="command-description">Take command of your tank. Tear through enemy defenses, survive the counterattack, and build a machine that hits harder.</p>
        <div class="command-actions"><a class="command-deploy" href="${PAGE_PATHS.campaign}"><span><small>CHOOSE YOUR OPERATION</small>Play Campaign</span><span aria-hidden="true">→</span></a><a class="command-hangar" href="${PAGE_PATHS.hangar}">Hangar &amp; Workshop <span aria-hidden="true">↗</span></a></div>
      </div>
      <div class="command-vehicle-tag" aria-hidden="true"><span>PLAYER / MAIN BATTLE TANK</span><strong>BUILT TO BREAK THROUGH</strong><i></i></div>
      <div class="command-coordinate" aria-hidden="true">36 × 36 / DESTRUCTIBLE BATTLEFIELDS</div>
    </section>
    <section class="command-features" aria-label="Combat essentials">
      <a href="${PAGE_PATHS.campaign}"><span class="command-feature-number">01</span><span><small>THE FRONT LINE</small><strong>Campaign</strong><p>Choose a mission. Break the siege.</p></span><b aria-hidden="true">↗</b></a>
      <a href="${PAGE_PATHS.survival}"><span class="command-feature-number">02</span><span><small>ENDLESS WAVES</small><strong>Survival</strong><p>Hold the Iron Crucible from Tier I.</p></span><b aria-hidden="true">↗</b></a>
      <a href="${PAGE_PATHS.contract}"><span class="command-feature-number">03</span><span><small>HIGH-STAKES RAIDS</small><strong>Contracts</strong><p>Recover cargo or sabotage radar nodes.</p></span><b aria-hidden="true">↗</b></a>
    </section>
    <footer class="command-footer"><span>IRON VANGUARD <i>/</i> FIELD COMMAND</span><span>PLAN. EQUIP. DEPLOY.</span></footer>
  </main>`;
}
