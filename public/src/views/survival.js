/** Survival screen: endless wave briefing, rules, and personal Survival Records. */
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
  const lastRunText = rec.lastRun
    ? `Last deployment: Wave ${rec.lastRun.waveReached} (${rec.lastRun.wavesCleared} cleared) · ${rec.lastRun.kills} kills · ${formatSurvivalTime(rec.lastRun.timeSec)}`
    : 'No Survival deployments logged yet. Deploy into the Iron Crucible to set your first record.';

  return `<p class="menu-lead">Pure endless tactical endurance. Every deployment begins on a stock <strong>Tier I</strong> tank with <strong>$${SURVIVAL_CONFIG.STARTING_CREDITS}</strong> session credits.<br>Destroy attacking waves, upgrade in the field Hangar <strong>[U]</strong>, and push your personal Survival Record as far as possible.</p>
  <div class="campaign-summary">
    <span>${SURVIVAL_CONFIG.CODE}</span>
    <span>◈ STOCK TIER I START ($${SURVIVAL_CONFIG.STARTING_CREDITS})</span>
    <span>★ BOSS EVERY 5 WAVES</span>
    <span>✓ HQ RESTORABLE VIA SUPPLY CRATES</span>
  </div>
  <div class="campaign-layout">
    <section class="menu-card" aria-label="Survival operational rules">
      <span class="menu-kicker">${SURVIVAL_CONFIG.CODE}</span>
      <h2>${SURVIVAL_CONFIG.NAME} — ${SURVIVAL_CONFIG.SUBTITLE}</h2>
      <p>Hold a 36×36 fortified industrial crossroads against escalating combined-arms waves. All enemy vehicles use their authentic catalog specifications — threat scales through squad size, composition, and multi-angle pressure.</p>
      <dl class="mt-4 space-y-2 text-xs font-mono text-slate-300">
        <div>
          <dt class="text-amber-400 uppercase">1. Isolated Tier I Session Progression</dt>
          <dd>Every run starts fresh at <strong>Tier I</strong> across all 5 tracks (Cannon, Chassis, Frame, Engine, Armor) with <strong>$${SURVIVAL_CONFIG.STARTING_CREDITS}</strong>. Earn session credits from kills and wave clear bonuses to upgrade at the Allied Base Hangar <strong>[U]</strong>. Main profile credits and upgrades are untouched.</dd>
        </div>
        <div>
          <dt class="text-sky-400 uppercase">2. Allied HQ & Field Recovery</dt>
          <dd>Your Command Base repairs hull and subsystems and unlocks Hangar <strong>[U]</strong>. If the HQ is destroyed, <strong>the battle continues</strong> — break newly dropped supply crates (<strong>BOXES</strong>) to recover a <strong>BASE_RESTORE</strong> pickup and bring the workshop back online.</dd>
        </div>
        <div>
          <dt class="text-emerald-400 uppercase">3. Intermission & Early Wave Call [N]</dt>
          <dd>Clearing a wave grants a <strong>15-second tactical intermission</strong> and drops fresh supply crates and explosive barrels. Press <strong>[N]</strong> (or the HUD button) during intermission to call the next wave immediately for a <strong>+$${SURVIVAL_CONFIG.EARLY_CALL_BONUS}</strong> readiness bonus.</dd>
        </div>
      </dl>
    </section>

    <aside class="campaign-brief" aria-label="Survival records and wave schedule" style="--chapter-color:#f97316">
      <div class="menu-kicker">PERSONAL TELEMETRY // SURVIVAL RECORDS</div>
      <h2>${hasRecord ? `BEST WAVE: ${rec.bestWave}` : 'UNRANKED COMMANDER'}</h2>
      <p class="campaign-theme">${lastRunText}</p>
      <dl>
        <dt>All-Time Survival Records</dt>
        <dd>
          <ul class="campaign-roster">
            <li><span>Highest wave reached</span><strong>Wave ${rec.bestWave} (${rec.bestWavesCleared} cleared)</strong></li>
            <li><span>Most hostiles destroyed (single run)</span><strong>${rec.bestKills} units</strong></li>
            <li><span>Longest survival time</span><strong>${formatSurvivalTime(rec.bestTimeSec)}</strong></li>
            <li><span>Sector bosses defeated (all runs)</span><strong>${rec.bossesDefeated} bosses · ${rec.totalRuns} runs</strong></li>
          </ul>
        </dd>
        <dt>Escalation & Boss Milestones</dt>
        <dd>
          <ul class="campaign-roster">
            <li><span>Waves 1–4 · Recon, Sappers, Armor & Artillery</span><strong>6–10 units</strong></li>
            <li><span>Wave 5 ★ · <strong>MAMMOTH MK-V</strong> + Siege Escort</span><strong>+$${SURVIVAL_CONFIG.WAVE_BASE_REWARD + 5 * SURVIVAL_CONFIG.WAVE_STEP_REWARD + SURVIVAL_CONFIG.BOSS_WAVE_BONUS}</strong></li>
            <li><span>Wave 10 ★ · <strong>HYDRA MLRS-X</strong> + Hover Raiders</span><strong>+$${SURVIVAL_CONFIG.WAVE_BASE_REWARD + 10 * SURVIVAL_CONFIG.WAVE_STEP_REWARD + SURVIVAL_CONFIG.BOSS_WAVE_BONUS}</strong></li>
            <li><span>Wave 15 ★ · <strong>TITAN AEGIS-IX</strong> + EWAR Phalanx</span><strong>+$${SURVIVAL_CONFIG.WAVE_BASE_REWARD + 15 * SURVIVAL_CONFIG.WAVE_STEP_REWARD + SURVIVAL_CONFIG.BOSS_WAVE_BONUS}</strong></li>
            <li><span>Wave 16+ · Endless Combined-Arms & Boss Cycles</span><strong>Unbounded</strong></li>
          </ul>
        </dd>
      </dl>
      <div class="campaign-planned">
        <strong>ENDLESS MODE · ZERO PROFILE RISK</strong>
        <p>Your Campaign and Contract tank loadout is automatically restored when you return to the menu.</p>
      </div>
      <button class="menu-primary" data-action="start-survival">Deploy to ${SURVIVAL_CONFIG.NAME} →</button>
      <div class="campaign-brief-nav">
        <a class="menu-secondary" href="/">← Main menu</a>
      </div>
    </aside>
  </div>`;
}

