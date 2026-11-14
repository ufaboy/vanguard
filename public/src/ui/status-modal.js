import { POWERUP_TYPES } from '../game/constants.js';
import { SECTORS } from '../game/levels.js';
import { GameStatus } from '../game/types.js';
import { buildBattleSharePayload, buildSocialShareLinks, getPartCatalogEntry } from '../sim/index.js';
import { formatSurvivalDuration } from './contract-hud.js';
import { setHidden, setHtml } from './dom-helpers.js';

export function renderBattlefieldLoaderHtml() {
  return `
    <div class="battlefield-loader" role="status" aria-live="polite">
      <span class="btn-rivet top-left" aria-hidden="true"></span>
      <span class="btn-rivet top-right" aria-hidden="true"></span>
      <span class="btn-rivet bottom-left" aria-hidden="true"></span>
      <span class="btn-rivet bottom-right" aria-hidden="true"></span>
      <div class="battlefield-loader-radar" aria-hidden="true">
        <div class="battlefield-loader-sweep"></div>
        <svg class="battlefield-loader-tank" viewBox="0 0 48 22" fill="currentColor">
          <path d="M18 4h11l2 4h14v2.5H31l1.5 3.5H13l3-6h2V4zm-8 10h28l4 4H6l4-4zm2 4.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
        </svg>
      </div>
      <div class="battlefield-loader-kicker">BATTLEFIELD DEPLOYMENT</div>
      <h1 class="battlefield-loader-title">DEPLOYING UNIT</h1>
      <p class="battlefield-loader-sub">Initializing 3D tactical arena…</p>
      <div class="battlefield-loader-track" aria-hidden="true">
        <div class="battlefield-loader-bar"></div>
      </div>
      <div class="battlefield-loader-steps" aria-hidden="true">
        <span>TEXTURES</span>
        <span>TERRAIN</span>
        <span>SYSTEMS</span>
      </div>
    </div>
  `;
}

const SHOW_REWARDED_AD_SLOT = false;

function renderRewardedAdSlot(state) {
  if (!SHOW_REWARDED_AD_SLOT) return '';
  if (state.adRewardClaimed) {
    return `<div class="mb-4 px-3 py-2 rounded border border-emerald-500/40 bg-emerald-950/30 font-mono text-xs text-emerald-300">${state.adRewardFeedback || '+$150 BONUS CREDITS AWARDED'}</div>`;
  }
  return `
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded border border-amber-500/40 bg-slate-900/80 font-mono text-xs">
      <span class="text-slate-300">${state.adRewardFeedback || 'OPTIONAL SUPPLY DROP: Watch a short ad for +$150 bonus credits.'}</span>
      <button
        type="button"
        data-action="watch-rewarded-ad"
        class="px-3.5 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/60 font-bold uppercase tracking-wider cursor-pointer"
      >
        WATCH AD (+$150)
      </button>
    </div>
  `;
}

function getRarityClass(rarity) {
  if (rarity === 'epic') return 'is-epic';
  if (rarity === 'rare') return 'is-rare';
  return '';
}

function renderBattleAchievementsSection(state) {
  const earned = (Array.isArray(state.battleAchievements) ? state.battleAchievements : []).filter(
    (ach) => ach?.isNew
  );
  const bonus = Number(state.achievementBonusCredits) || 0;
  const allMedalsBtn = `
    <button
      type="button"
      data-action="open-achievements"
      class="battle-share-btn"
    >
      🏅 ALL MEDALS
    </button>
  `;

  if (earned.length === 0) {
    return `
      <div class="battle-ach-box">
        <div class="battle-ach-header">
          <span class="battle-ach-kicker">ACHIEVEMENTS</span>
          ${allMedalsBtn}
        </div>
        <p class="battle-ach-desc">No new medals earned this sortie.</p>
      </div>
    `;
  }

  const cards = earned
    .map(
      (ach) => `
      <div class="battle-ach-card ${getRarityClass(ach.rarity)}">
        <span class="battle-ach-icon" aria-hidden="true">${ach.icon}</span>
        <div class="battle-ach-body">
          <div class="battle-ach-top">
            <span class="battle-ach-title">${ach.title}</span>
            ${
              ach.isNew
                ? `<span class="battle-new-pill">NEW +$${ach.rewardCredits || 0}</span>`
                : ''
            }
          </div>
          <p class="battle-ach-desc">${ach.description}</p>
        </div>
      </div>
    `
    )
    .join('');

  return `
    <div class="battle-ach-box">
      <div class="battle-ach-header">
        <div class="battle-ach-header-left">
          <span class="battle-ach-kicker">ACHIEVEMENTS (${earned.length})</span>
          ${bonus > 0 ? `<span class="battle-ach-bonus">+$${bonus} CREDITS</span>` : ''}
        </div>
        ${allMedalsBtn}
      </div>
      <div class="battle-ach-grid">
        ${cards}
      </div>
    </div>
  `;
}

const RIVETS_HTML = `<span class="btn-rivet top-left" aria-hidden="true"></span><span class="btn-rivet top-right" aria-hidden="true"></span><span class="btn-rivet bottom-left" aria-hidden="true"></span><span class="btn-rivet bottom-right" aria-hidden="true"></span>`;
const ICON_TANK = `<svg viewBox="0 0 48 22" fill="currentColor" aria-hidden="true"><path d="M18 4h11l2 4h14v2.5H31l1.5 3.5H13l3-6h2V4zm-8 10h28l4 4H6l4-4zm2 4.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>`;
const ICON_CHEVRONS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>`;
const ICON_COPY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_SHARE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
const ICON_CARD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
const ICON_TELEGRAM = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.94 3.46a1.1 1.1 0 0 0-1.15-.17L2.48 10.65a1.1 1.1 0 0 0 .08 2.06l4.64 1.56 1.78 5.47a1 1 0 0 0 1.71.38l2.58-2.67 4.74 3.5a1.1 1.1 0 0 0 1.73-.66l2.45-15.65a1.1 1.1 0 0 0-.25-1.18zM9.7 14.37l-.38 3.31-1.18-3.62 9.48-6.4-7.92 6.71z"/></svg>`;
const ICON_X = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;

function renderBattleShareBar(state, hud, currentSector, accuracy) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const payload = buildBattleSharePayload({
    hud,
    currentSector,
    accuracy,
    earnedAchievements: state.battleAchievements || [],
    origin,
  });
  const social = buildSocialShareLinks(payload);
  const feedback = state.shareFeedback
    ? `<div class="battle-share-feedback">${state.shareFeedback}</div>`
    : '';

  return `
    <div class="battle-share-bar">
      <div class="battle-share-row">
        <span class="battle-share-label">SHARE RESULT</span>
        <div class="battle-share-actions">
          <button type="button" data-action="copy-share-link" class="battle-share-btn is-primary">
            ${ICON_COPY}<span>COPY LINK</span>
          </button>
          <button type="button" data-action="share-battle" class="battle-share-btn">
            ${ICON_SHARE}<span>SHARE</span>
          </button>
          <button type="button" data-action="download-share-card" class="battle-share-btn" title="Download 1200x630 PNG card">
            ${ICON_CARD}<span>CARD</span>
          </button>
          <a href="${social.telegramUrl}" target="_blank" rel="noopener noreferrer" class="battle-share-icon-btn" aria-label="Share on Telegram" title="Share on Telegram">
            ${ICON_TELEGRAM}
          </a>
          <a href="${social.xUrl}" target="_blank" rel="noopener noreferrer" class="battle-share-icon-btn" aria-label="Share on X" title="Share on X">
            ${ICON_X}
          </a>
        </div>
      </div>
      ${feedback}
    </div>
  `;
}

function renderPausedModal(state, hud, currentSector) {
  const isSurvival = hud.gameMode === 'survival' || currentSector.gameMode === 'survival';
  return `
    <div style="width:fit-content;max-width:92vw;" class="bg-[#0B0F17] border border-slate-700/80 rounded p-7 shadow-2xl text-center">
      <div class="text-xs font-mono uppercase tracking-[0.2em] text-amber-400 mb-1">
        OPERATION SUSPENDED
      </div>
      <h2 class="text-2xl font-bold uppercase tracking-wider mb-6">TACTICAL PAUSE</h2>
      <div class="flex flex-col gap-3">
        <button
          data-action="toggle-pause"
          class="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-6 rounded uppercase tracking-wider text-xs cursor-pointer"
        >
          ▶ RESUME COMBAT
        </button>
        <button
          data-action="toggle-sound"
          aria-pressed="${state.soundEnabled}"
          class="w-full bg-slate-800 hover:bg-slate-700 border ${
            state.soundEnabled ? 'border-slate-600/80 text-slate-200' : 'border-red-500/70 text-red-300'
          } font-mono py-2.5 px-5 rounded uppercase tracking-wider text-xs cursor-pointer"
        >
          ${state.soundEnabled ? '🔊 SOUND: ON' : '🔇 SOUND: OFF'}
        </button>
        <button
          data-action="start-sector"
          data-sector="${hud.sectorId}"
          class="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono py-2.5 px-5 rounded uppercase tracking-wider text-xs cursor-pointer"
        >
          ${isSurvival ? '↺ RESTART SURVIVAL (TIER I)' : '↺ RESTART SECTOR'}
        </button>
        <button
          data-action="${isSurvival ? 'return-survival' : 'abort-mission'}"
          class="w-full bg-red-950 hover:bg-red-700 text-red-200 border border-red-600/60 font-mono py-2.5 px-5 rounded uppercase tracking-wider text-xs cursor-pointer"
        >
          ${isSurvival ? '⏎ END SURVIVAL RUN (SAVE RECORD)' : '⏎ MAIN MENU (KEEP COLLECTED LOOT)'}
        </button>
      </div>
    </div>
  `;
}

function renderVictoryModal(state, hud, currentSector, accuracy) {
  const s = hud.lastSettlementSummary;
  if (hud.gameMode === 'contract' || currentSector.gameMode === 'contract') {
    return `
      <div class="battle-modal-card">
        <div class="text-emerald-400 font-mono text-xs uppercase tracking-[0.2em] mb-1">
          CONTRACT EXTRACTED // TERMINAL PAYOUT SETTLEMENT
        </div>
        <h2 class="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-4">
          ${currentSector.name.toUpperCase()} — EXTRACTION COMPLETE (${s?.deliveredCount ?? 2}/3 CARGO)
        </h2>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded mb-4 font-mono">
          <div>
            <span class="battle-stat-label">CARGO (${s?.deliveredCount ?? 0}/3)</span>
            <span class="text-lg font-bold text-sky-300 tabular-nums">+$ ${s?.cargoCreditsSecured ?? 0}</span>
          </div>
          <div>
            <span class="battle-stat-label">EXTRACTION</span>
            <span class="text-lg font-bold text-emerald-400 tabular-nums">+$ ${s?.extractionBonus ?? 0}</span>
          </div>
          <div>
            <span class="battle-stat-label">3RD CARGO ★</span>
            <span class="text-lg font-bold text-amber-300 tabular-nums">+$ ${s?.thirdCargoBonus ?? 0}</span>
          </div>
          <div>
            <span class="battle-stat-label">TOTAL CREDITS</span>
            <span class="text-lg font-bold text-emerald-300 tabular-nums">+$ ${s?.totalObjectiveCredits ?? 0}</span>
          </div>
        </div>
        ${renderBattleAchievementsSection(state)}
        ${renderBattleShareBar(state, hud, currentSector, accuracy)}
        ${renderRewardedAdSlot(state)}

        <div class="battle-modal-actions">
          <button
            data-action="start-sector"
            data-sector="${hud.sectorId}"
            class="battle-btn-primary"
          >
            ${RIVETS_HTML}${ICON_TANK}<span>REPLAY CONTRACT</span>${ICON_CHEVRONS}
          </button>
          <button class="battle-btn-secondary" data-action="return-contracts">${RIVETS_HTML}<span>Contracts</span></button>
        </div>
      </div>
    `;
  }

  const hasNextCampaign =
    hud.sectorId + 1 < SECTORS.length && SECTORS[hud.sectorId + 1]?.gameMode !== 'contract';
  const nextSectorIdx = hasNextCampaign ? hud.sectorId + 1 : hud.sectorId;
  const nextBtnLabel = hasNextCampaign
    ? `NEXT SECTOR: ${SECTORS[hud.sectorId + 1].name} →`
    : '↺ REPLAY MISSION';

  return `
    <div class="battle-modal-card">
      <div class="text-emerald-400 font-mono text-xs uppercase tracking-[0.2em] mb-1">
        SECTOR SECURED // VICTORY
      </div>
      <h2 class="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-4">
        ${currentSector.rules.spawnSectorBossOnClear ? `${currentSector.bossName} DESTROYED` : `${currentSector.name.toUpperCase()} COMPLETE`}
      </h2>

      ${s?.bossReward ? `
        <div class="p-3 mb-4 border border-amber-400/70 rounded bg-slate-900 font-mono text-xs text-amber-300">
          <strong>BOSS REWARD SECURED:</strong> ${s.bossReward.loot?.type === 'part'
            ? (getPartCatalogEntry(s.bossReward.loot.definitionId)?.name || s.bossReward.loot.definitionId)
            : `+$${s.bossReward.loot?.amount || s.bossReward.loot?.credits || 500} CREDITS`} · ${POWERUP_TYPES[s.bossReward.powerUp]?.name || 'Power-up'} reserved
        </div>
      ` : ''}

      <div class="grid grid-cols-3 gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded mb-4 font-mono">
        <div>
          <span class="battle-stat-label">CREDITS</span>
          <span class="text-lg font-bold text-emerald-400 tabular-nums">+$ ${s?.creditsGained ?? 400}</span>
        </div>
        <div>
          <span class="battle-stat-label">DROPS</span>
          <span class="text-lg font-bold text-teal-300 tabular-nums">${s?.autoCollectedCount ?? 0}</span>
        </div>
        <div>
          <span class="battle-stat-label">ACCURACY</span>
          <span class="text-lg font-bold text-sky-400 tabular-nums">${accuracy}%</span>
        </div>
      </div>
      ${renderBattleAchievementsSection(state)}
      ${renderBattleShareBar(state, hud, currentSector, accuracy)}
      ${renderRewardedAdSlot(state)}

      <div class="battle-modal-actions">
        <button
          data-action="start-sector"
          data-sector="${nextSectorIdx}"
          class="battle-btn-primary"
        >
          ${RIVETS_HTML}${ICON_TANK}<span>${nextBtnLabel}</span>${ICON_CHEVRONS}
        </button>
        <button class="battle-btn-secondary" data-action="return-campaign">${RIVETS_HTML}<span>Campaign map</span></button>
      </div>
    </div>
  `;
}

function renderGameOverModal(state, hud, currentSector, accuracy) {
  const s = hud.lastSettlementSummary;
  const isSurvival = hud.gameMode === 'survival' || currentSector.gameMode === 'survival';
  if (isSurvival) {
    const sv = hud.survival;
    const rec = sv?.recordSummary;
    const waveReached = rec?.waveReached ?? sv?.wave ?? 1;
    const wavesCleared = rec?.wavesCleared ?? sv?.wavesCleared ?? 0;
    const timeSec = rec?.timeSec ?? sv?.elapsedSec ?? 0;
    const bosses = rec?.bossesDefeated ?? sv?.bossesDefeated ?? 0;
    const newWaveBadge = rec?.isNewWaveRecord ? '<span class="battle-new-pill">★ NEW</span>' : '';
    const newKillBadge = rec?.isNewKillRecord ? '<span class="battle-new-pill">★ NEW</span>' : '';
    const newTimeBadge = rec?.isNewTimeRecord ? '<span class="battle-new-pill">★ NEW</span>' : '';
    return `
      <div class="battle-modal-card">
        <div class="text-amber-400 font-mono text-xs uppercase tracking-[0.2em] mb-1">
          SURVIVAL RUN CONCLUDED // RECORD LOGGED
        </div>
        <h2 class="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-2">
          FALLEN ON WAVE ${waveReached} (${wavesCleared} WAVES CLEARED)
        </h2>
        <p class="text-xs font-mono text-slate-400 mb-4">
          Tier I run · Campaign profile &amp; credits restored intact.
        </p>

        <div class="grid grid-cols-4 gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded mb-4 font-mono">
          <div>
            <span class="battle-stat-label">WAVE ${newWaveBadge}</span>
            <span class="text-lg font-bold text-amber-300 tabular-nums">WAVE ${waveReached}</span>
          </div>
          <div>
            <span class="battle-stat-label">KILLS ${newKillBadge}</span>
            <span class="text-lg font-bold text-emerald-400 tabular-nums">${hud.kills}</span>
          </div>
          <div>
            <span class="battle-stat-label">TIME ${newTimeBadge}</span>
            <span class="text-lg font-bold text-sky-300 tabular-nums">${formatSurvivalDuration(timeSec)}</span>
          </div>
          <div>
            <span class="battle-stat-label">BOSSES</span>
            <span class="text-lg font-bold text-red-300 tabular-nums">${bosses}</span>
          </div>
        </div>

        ${renderBattleAchievementsSection(state)}
        ${renderBattleShareBar(state, hud, currentSector, accuracy)}

        <div class="battle-modal-actions">
          <button
            data-action="start-survival"
            class="battle-btn-primary"
          >
            ${RIVETS_HTML}${ICON_TANK}<span>NEW SURVIVAL RUN</span>${ICON_CHEVRONS}
          </button>
          <button class="battle-btn-secondary" data-action="return-survival">${RIVETS_HTML}<span>Survival records</span></button>
          <button class="battle-btn-secondary" data-action="main-menu">${RIVETS_HTML}<span>Main menu</span></button>
        </div>
      </div>
    `;
  }

  const isContract = hud.gameMode === 'contract' || currentSector.gameMode === 'contract';
  const defeatReason =
    currentSector?.defeatOnBaseLoss && !hud.baseAlive
      ? 'DEFENSE OBJECTIVE LOST'
      : 'PLAYER TANK DESTROYED IN ACTION';

  return `
    <div class="battle-modal-card">
      <div class="text-red-400 font-mono text-xs uppercase tracking-[0.2em] mb-1">
        ${defeatReason} // DEFEAT
      </div>
      <h2 class="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-2">
        ${isContract ? 'CONTRACT FAILED — DELIVERED CARGO PRESERVED' : 'MISSION FAILED — COLLECTED LOOT PRESERVED'}
      </h2>
      <p class="text-xs font-mono text-slate-400 mb-4">
        ${
          isContract
            ? `Delivered cargo (+$${s?.cargoCreditsSecured ?? 0}) &amp; bounties preserved.`
            : `Loadout intact · +$${s?.creditsGained ?? 0} preserved · ${s?.lostCount ?? 0} uncollected drops lost.`
        }
      </p>

      <div class="grid grid-cols-3 gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded mb-4 font-mono">
        <div>
          <span class="battle-stat-label">${isContract ? 'CARGO CREDITS' : 'CREDITS'}</span>
          <span class="text-lg font-bold text-emerald-400 tabular-nums">+$ ${isContract ? (s?.cargoCreditsSecured ?? 0) : (s?.creditsGained ?? 0)}</span>
        </div>
        <div>
          <span class="battle-stat-label">${isContract ? 'CARGO' : 'LOST DROPS'}</span>
          <span class="text-lg font-bold ${isContract ? 'text-sky-300' : 'text-red-400'} tabular-nums">${isContract ? `${s?.deliveredCount ?? 0} / 3` : (s?.lostCount ?? 0)}</span>
        </div>
        <div>
          <span class="battle-stat-label">KILLS</span>
          <span class="text-lg font-bold text-emerald-400 tabular-nums">${hud.kills}</span>
        </div>
      </div>
      ${renderBattleAchievementsSection(state)}
      ${renderBattleShareBar(state, hud, currentSector, accuracy)}
      ${renderRewardedAdSlot(state)}

      <div class="battle-modal-actions">
        <button
          data-action="start-sector"
          data-sector="${hud.sectorId}"
          class="battle-btn-primary"
        >
          ${RIVETS_HTML}${ICON_TANK}<span>${isContract ? 'RETRY CONTRACT' : 'RETRY SECTOR'}</span>${ICON_CHEVRONS}
        </button>
        <button class="battle-btn-secondary" data-action="${isContract ? 'return-contracts' : 'return-campaign'}">${RIVETS_HTML}<span>${isContract ? 'Contracts' : 'Campaign map'}</span></button>
      </div>
    </div>
  `;
}

export function renderStatusModal({ statusModal, state, hud, currentSector, accuracy }) {
  if (!statusModal) return;
  if (
    hud.status === GameStatus.PLAYING ||
    hud.status === GameStatus.BOSS_INTRO ||
    state.showUpgradeDrawer
  ) {
    setHidden(statusModal, true);
    return;
  }

  setHidden(statusModal, false);
  if (hud.status === GameStatus.MENU) {
    setHtml(statusModal, renderBattlefieldLoaderHtml());
  } else if (hud.status === GameStatus.PAUSED) {
    setHtml(statusModal, renderPausedModal(state, hud, currentSector));
  } else if (hud.status === GameStatus.VICTORY) {
    setHtml(statusModal, renderVictoryModal(state, hud, currentSector, accuracy));
  } else if (hud.status === GameStatus.GAME_OVER) {
    setHtml(statusModal, renderGameOverModal(state, hud, currentSector, accuracy));
  }
}

