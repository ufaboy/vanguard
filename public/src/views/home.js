import { PAGE_PATHS } from '../app/routes.js';
import { renderPageShell } from '../app/shell.js';

/** Home command screen: armored hero artwork, boss threat recon, and operational modes. */
export function renderHome() {
  const contentHtml = `
    <div class="command-home-view">
      <section class="armored-hero-board" aria-labelledby="command-title">
        <span class="board-rivet top-left" aria-hidden="true"></span>
        <span class="board-rivet top-right" aria-hidden="true"></span>
        <span class="board-rivet bottom-left" aria-hidden="true"></span>
        <span class="board-rivet bottom-right" aria-hidden="true"></span>

        <div class="board-top-accent" aria-hidden="true">
          <span class="accent-line"></span>
          <span class="accent-notch">/// SECTOR OPS TERMINAL ///</span>
          <span class="accent-line"></span>
        </div>

        <img class="armored-hero-art" src="./images/home-hero.jpg" alt="Player tank advancing with three colossal Sector Bosses in the background" fetchpriority="high" width="1920" height="1080">
        
        <div class="armored-hero-atmosphere" aria-hidden="true"></div>
        <div class="armored-hero-vignette" aria-hidden="true"></div>

        <div class="hero-command-flank">
          <div class="tactical-kicker">
            <span class="kicker-beacon" aria-hidden="true"></span>
            <span>ARMORED WARFARE // STRATEGIC COMMAND</span>
          </div>

          <h2 id="command-title" class="hero-tactical-title" tabindex="-1">
            IRON<br><span class="highlight-gold">VANGUARD</span>
          </h2>

          <p class="hero-tactical-tagline">Steel yourself. Break the siege. Eliminate the Colossi.</p>

          <p class="hero-tactical-desc">
            Take command of the prototype Main Battle Tank across 36×36 destructible combat sectors.
            Upgrade modular chassis, high-velocity cannons, and active defense systems to face the three rogue Sector Dreadnoughts.
          </p>

          <div class="hero-tactical-actions">
            <a class="armored-action-btn primary" href="${PAGE_PATHS.campaign}">
              <span class="btn-chamfer" aria-hidden="true"></span>
              <span class="btn-body">
                <small>PRIMARY CAMPAIGN</small>
                <strong>DEPLOY TO THE FRONT <span class="action-arrow" aria-hidden="true">»</span></strong>
              </span>
            </a>

            <a class="armored-action-btn secondary" href="${PAGE_PATHS.hangar}">
              <span class="btn-body">
                <small>WORKSHOP &amp; UPGRADES</small>
                <strong>HANGAR DOCK <span class="action-arrow" aria-hidden="true">↗</span></strong>
              </span>
            </a>
          </div>
        </div>

        <aside class="hero-threat-intel" aria-label="Sector Threat Recon">
          <div class="intel-header">
            <span class="intel-badge">WARNING</span>
            <span class="intel-title">PRIORITY THREAT INTEL</span>
          </div>
          
          <div class="intel-threat-list">
            <div class="threat-item boss-titan">
              <div class="threat-indicator rail"></div>
              <div class="threat-info">
                <div class="threat-meta"><span class="threat-role">SECTOR 03 BOSS</span><span class="threat-hp">200 HP</span></div>
                <strong class="threat-name">BOSS TITAN</strong>
                <p class="threat-specs">Rail Fortress · Aegis Citadel · ECM Jammer</p>
              </div>
            </div>

            <div class="threat-item boss-hydra">
              <div class="threat-indicator mlrs"></div>
              <div class="threat-info">
                <div class="threat-meta"><span class="threat-role">SECTOR 02 BOSS</span><span class="threat-hp">132 HP</span></div>
                <strong class="threat-name">BOSS HYDRA</strong>
                <p class="threat-specs">Amphibious Cruiser · Standoff MLRS Salvos</p>
              </div>
            </div>

            <div class="threat-item boss-mammoth">
              <div class="threat-indicator siege"></div>
              <div class="threat-info">
                <div class="threat-meta"><span class="threat-role">SECTOR 01 BOSS</span><span class="threat-hp">136 HP</span></div>
                <strong class="threat-name">BOSS MAMMOTH</strong>
                <p class="threat-specs">Siege Dreadnought · Twin Cannons · ATGM Pods</p>
              </div>
            </div>
          </div>

          <div class="intel-footer">
            <span class="intel-beacon" aria-hidden="true"></span>
            <span>STATUS: ACTIVE HOSTILITY // INTERCEPT REQUIRED</span>
          </div>
        </aside>

        <div class="hero-vehicle-plate" aria-hidden="true">
          <div class="plate-marker"></div>
          <div class="plate-text">
            <small>UNIT DESIGNATION</small>
            <strong>VANGUARD MK-I // MAIN BATTLE TANK</strong>
          </div>
        </div>
      </section>

      <nav class="command-modes-deck" aria-label="Operational Modes">
        <a class="armored-mode-plate" href="${PAGE_PATHS.campaign}">
          <span class="plate-rivet tl" aria-hidden="true"></span>
          <span class="plate-rivet tr" aria-hidden="true"></span>
          <div class="plate-index">01</div>
          <div class="plate-content">
            <small>CAMPAIGN ASSAULT</small>
            <strong>Road to the Capital</strong>
            <p>35 Sectors · 7 Tactical Regions · Break the Siege</p>
          </div>
          <span class="plate-arrow" aria-hidden="true">»</span>
        </a>

        <a class="armored-mode-plate" href="${PAGE_PATHS.survival}">
          <span class="plate-rivet tl" aria-hidden="true"></span>
          <span class="plate-rivet tr" aria-hidden="true"></span>
          <div class="plate-index">02</div>
          <div class="plate-content">
            <small>ENDLESS CRUCIBLE</small>
            <strong>Survival Mode</strong>
            <p>Withstand continuous waves · Defend Allied HQ</p>
          </div>
          <span class="plate-arrow" aria-hidden="true">»</span>
        </a>

        <a class="armored-mode-plate" href="${PAGE_PATHS.contract}">
          <span class="plate-rivet tl" aria-hidden="true"></span>
          <span class="plate-rivet tr" aria-hidden="true"></span>
          <div class="plate-index">03</div>
          <div class="plate-content">
            <small>HIGH-STAKES RAIDS</small>
            <strong>Contracts</strong>
            <p>Sabotage radar arrays · Extract prototype cargo</p>
          </div>
          <span class="plate-arrow" aria-hidden="true">»</span>
        </a>

        <a class="armored-mode-plate" href="${PAGE_PATHS.hangar}">
          <span class="plate-rivet tl" aria-hidden="true"></span>
          <span class="plate-rivet tr" aria-hidden="true"></span>
          <div class="plate-index">04</div>
          <div class="plate-content">
            <small>MODULAR WORKSHOP</small>
            <strong>Hangar &amp; Upgrades</strong>
            <p>5 Tracks × 5 Tiers · APS Shielding · Guided ATGMs</p>
          </div>
          <span class="plate-arrow" aria-hidden="true">»</span>
        </a>
      </nav>
    </div>
  `;

  return renderPageShell({
    activePage: 'home',
    title: 'Command Center',
    subtitle: 'Strategic Operations',
    showBack: false,
    className: 'command-home-content',
    bodyHtml: contentHtml,
  });
}
