/** Survival screen: dramatic battlefield key art, armored SURVIVAL banner, mode briefing, and launch dock. */
import {
  SURVIVAL_CONFIG,
  createDefaultSurvivalRecords,
} from '../sim/survival.js';

function formatSurvivalTime(totalSec = 0) {
  const sec = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function renderSurvival(playerSave = {}) {
  const rec = {
    ...createDefaultSurvivalRecords(),
    ...(playerSave?.survivalRecords || {}),
  };

  const hasRecord = rec.totalRuns > 0;
  const recordLabel = hasRecord
    ? `BEST: WAVE ${rec.bestWave}  ·  ${rec.bestKills} KILLS  ·  ${formatSurvivalTime(rec.bestTimeSec)}`
    : `STOCK TIER I ($${SURVIVAL_CONFIG.STARTING_CREDITS})  ·  BOSS EVERY 5 WAVES  ·  ZERO PROFILE RISK`;

  return `
    <div class="survival-hero-view">
      <section class="survival-hero-board" aria-label="Survival mode briefing">
        <span class="board-rivet top-left" aria-hidden="true"></span>
        <span class="board-rivet top-right" aria-hidden="true"></span>
        <span class="board-rivet bottom-left" aria-hidden="true"></span>
        <span class="board-rivet bottom-right" aria-hidden="true"></span>

        <img
          class="survival-hero-art"
          src="./images/survival-hero.png"
          alt="Allied battle tanks holding a fortified ridge against endless enemy tank columns"
          fetchpriority="high"
          width="1920"
          height="1080"
        >
        <div class="survival-hero-atmosphere" aria-hidden="true"></div>

        <div class="survival-center-stage">
          <div class="survival-crest" aria-hidden="true">
            <svg viewBox="0 0 64 44" width="64" height="44" fill="none">
              <path d="M10 30C6 23 6 14 12 8M54 30C58 23 58 14 52 8" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round"/>
              <path d="M13 33C9 27 10 19 15 14M51 33C55 27 54 19 49 14" stroke="#fbbf24" stroke-width="1.6" stroke-linecap="round"/>
              <path d="M32 6C24.5 6 20 11 20 17.5C20 21.8 22 25.2 24.5 27.2V31.5C24.5 33 25.7 34 27.2 34H36.8C38.3 34 39.5 33 39.5 31.5V27.2C42 25.2 44 21.8 44 17.5C44 11 39.5 6 32 6Z" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.8"/>
              <circle cx="27" cy="18.5" r="2.8" fill="#0f172a"/>
              <circle cx="37" cy="18.5" r="2.8" fill="#0f172a"/>
              <path d="M32 22.5L30 26.5H34L32 22.5Z" fill="#0f172a"/>
              <path d="M28 30.5V34M32 30.5V34M36 30.5V34" stroke="#0f172a" stroke-width="1.6"/>
            </svg>
          </div>

          <div class="survival-title-plate">
            <span class="plate-rivet tl" aria-hidden="true"></span>
            <span class="plate-rivet tr" aria-hidden="true"></span>
            <span class="plate-rivet bl" aria-hidden="true"></span>
            <span class="plate-rivet br" aria-hidden="true"></span>
            <span class="title-slashes left" aria-hidden="true">///</span>
            <h2 class="survival-main-title">SURVIVAL</h2>
            <span class="title-slashes right" aria-hidden="true">///</span>
          </div>

          <div class="survival-tagline-row">
            <span class="tagline-slashes" aria-hidden="true">///</span>
            <p class="survival-tagline">Hold the line against endless enemy waves.</p>
            <span class="tagline-slashes" aria-hidden="true">///</span>
          </div>

          <p class="survival-desc">
            Survive as long as possible against escalating enemy assaults.
            Deploy on a stock <strong>Tier I</strong> tank, upgrade in the field Hangar <strong>[U]</strong>, and face Sector Bosses every 5 waves.
          </p>

          <div class="survival-signal-strip" aria-hidden="true">
            <span class="signal-bars"><i></i><i></i><i></i><i></i></span>
            <span class="signal-infinity">∞</span>
            <span class="signal-bars right"><i></i><i></i><i></i><i></i></span>
          </div>

          <div class="survival-record-pill">
            <span class="pill-dot" aria-hidden="true"></span>
            <span>${recordLabel}</span>
          </div>
        </div>

        <div class="survival-launch-dock">
          <div class="dock-wing left" aria-hidden="true">
            <span class="plate-rivet tl"></span>
            <span class="dock-stripes">///</span>
          </div>

          <div class="dock-center">
            <div class="dock-chevron-cap" aria-hidden="true">︽</div>
            <button type="button" class="survival-start-cta" data-action="start-survival">
              <span>START »</span>
            </button>
          </div>

          <div class="dock-wing right" aria-hidden="true">
            <span class="plate-rivet tr"></span>
            <span class="dock-stripes">///</span>
          </div>
        </div>
      </section>
    </div>
  `;
}
