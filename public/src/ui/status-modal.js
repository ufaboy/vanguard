import { POWERUP_TYPES } from '../game/constants.js';
import { SECTORS, isContractMap } from '../game/levels.js';
import { GameStatus } from '../game/types.js';
import { buildBattleSharePayload, buildSocialShareLinks, getPartCatalogEntry } from '../sim/index.js';
import { formatSurvivalDuration } from './contract-hud.js';
import { setHidden, setHtml } from './dom-helpers.js';
import { t } from '../i18n/index.js';

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
      <div class="battlefield-loader-kicker">${t('BATTLEFIELD DEPLOYMENT')}</div>
      <h1 class="battlefield-loader-title">${t('DEPLOYING UNIT')}</h1>
      <p class="battlefield-loader-sub">${t('Initializing 3D tactical arena…')}</p>
      <div class="battlefield-loader-track" aria-hidden="true">
        <div class="battlefield-loader-bar"></div>
      </div>
      <div class="battlefield-loader-steps" aria-hidden="true">
        <span>${t('TEXTURES')}</span>
        <span>${t('TERRAIN')}</span>
        <span>${t('SYSTEMS')}</span>
      </div>
    </div>
  `;
}

const SHOW_REWARDED_AD_SLOT = false;

function renderRewardedAdSlot(state) {
  if (!SHOW_REWARDED_AD_SLOT) return '';
  if (state.adRewardClaimed) {
    return `<div class="mb-4 px-3 py-2 rounded border border-emerald-500/40 bg-emerald-950/30 font-mono text-xs text-emerald-300">${state.adRewardFeedback || t('+${amount} BONUS CREDITS AWARDED', { amount: 150 })}</div>`;
  }
  return `
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded border border-amber-500/40 bg-slate-900/80 font-mono text-xs">
      <span class="text-slate-300">${state.adRewardFeedback || t('OPTIONAL SUPPLY DROP: Watch a short ad for +${amount} bonus credits.', { amount: 150 })}</span>
      <button
        type="button"
        data-action="watch-rewarded-ad"
        class="px-3.5 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/60 font-bold uppercase tracking-wider cursor-pointer"
      >
        ${t('WATCH AD (+${amount})', { amount: 150 })}
      </button>
    </div>
  `;
}

function renderBattleMedalsAndRankSection(state) {
  const medals = Array.isArray(state.battleMedals) ? state.battleMedals : [];
  const xpInfo = state.battleServiceXp;
  const rank = state.rankSummary;
  const topMedals = medals.slice(0, 4);

  const medalCaseBtn = `
    <button
      type="button"
      data-action="open-medals"
      class="battle-share-btn"
    >
      🎖️ ${t('MEDAL CASE')}
    </button>
  `;

  const rankHtml = rank
    ? `
      <div class="battle-rank-row">
        <div class="battle-rank-left">
          <span class="battle-rank-insignia">${rank.currentRank.insignia}</span>
          <div>
            <div class="battle-rank-title-line">
              <strong>${t(rank.currentRank.title)}</strong>
              ${rank.promoted ? `<span class="battle-promoted-pill">${t('RANK UP!')}</span>` : ''}
            </div>
            <span class="battle-rank-xp">
              ${xpInfo ? t('+{xp} Service XP', { xp: xpInfo.totalXp }) : `${rank.serviceXp} XP`}
              ${rank.nextRank ? ` • ${t('{xp} / {next} XP to {rank}', { xp: rank.serviceXp, next: rank.nextRank.minXp, rank: t(rank.nextRank.title) })}` : ` • ${t('MAX RANK')}`}
            </span>
          </div>
        </div>
        <div class="battle-rank-bar-track">
          <div class="battle-rank-bar-fill" style="width: ${rank.xpProgressPct}%"></div>
        </div>
      </div>
    `
    : '';

  const medalsHtml =
    topMedals.length > 0
      ? `
        <div class="battle-medals-grid">
          ${topMedals
            .map(
              (m) => `
            <div class="battle-medal-chip" style="--medal-color: ${m.color};">
              <div class="battle-medal-chip-top">
                <span class="battle-medal-grade">${t(m.gradeLabel).toUpperCase()}</span>
                <span class="battle-medal-xp">${m.isNew ? `${t('NEW')} ` : ''}+${m.xpAwarded} XP</span>
              </div>
              <strong class="battle-medal-name">${t(m.name)}</strong>
              <span class="battle-medal-desc">${t(m.description)}</span>
            </div>
          `
            )
            .join('')}
        </div>
      `
      : `<p class="battle-ach-desc">${t('No tactical medals awarded this sortie.')}</p>`;

  return `
    <div class="battle-ach-box battle-medals-box">
      <div class="battle-ach-header">
        <div class="battle-ach-header-left">
          <span class="battle-ach-kicker">${t('SERVICE MEDALS ({n})', { n: medals.length })}</span>
          ${xpInfo?.medalXp > 0 ? `<span class="battle-ach-bonus">${t('+{xp} MEDAL XP', { xp: xpInfo.medalXp })}</span>` : ''}
        </div>
        ${medalCaseBtn}
      </div>
      ${rankHtml}
      ${medalsHtml}
    </div>
  `;
}

const NEW_PILL = () => `<span class="battle-new-pill">★ ${t('NEW')}</span>`;
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
        <span class="battle-share-label">${t('SHARE RESULT')}</span>
        <div class="battle-share-actions">
          <button type="button" data-action="copy-share-link" class="battle-share-btn is-primary">
            ${ICON_COPY}<span>${t('COPY LINK')}</span>
          </button>
          <button type="button" data-action="share-battle" class="battle-share-btn">
            ${ICON_SHARE}<span>${t('SHARE')}</span>
          </button>
          <button type="button" data-action="download-share-card" class="battle-share-btn" title="${t('Download 1200x630 PNG card')}">
            ${ICON_CARD}<span>${t('CARD')}</span>
          </button>
          <a href="${social.telegramUrl}" target="_blank" rel="noopener noreferrer" class="battle-share-icon-btn" aria-label="${t('Share on Telegram')}" title="${t('Share on Telegram')}">
            ${ICON_TELEGRAM}
          </a>
          <a href="${social.xUrl}" target="_blank" rel="noopener noreferrer" class="battle-share-icon-btn" aria-label="${t('Share on X')}" title="${t('Share on X')}">
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
        ${t('OPERATION SUSPENDED')}
      </div>
      <h2 class="text-2xl font-bold uppercase tracking-wider mb-6">${t('TACTICAL PAUSE')}</h2>
      <div class="flex flex-col gap-3">
        <button
          data-action="toggle-pause"
          class="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-6 rounded uppercase tracking-wider text-xs cursor-pointer"
        >
          ▶ ${t('RESUME COMBAT')}
        </button>
        <button
          data-action="toggle-sound"
          aria-pressed="${state.soundEnabled}"
          class="w-full bg-slate-800 hover:bg-slate-700 border ${
            state.soundEnabled ? 'border-slate-600/80 text-slate-200' : 'border-red-500/70 text-red-300'
          } font-mono py-2.5 px-5 rounded uppercase tracking-wider text-xs cursor-pointer"
        >
          ${state.soundEnabled ? `🔊 ${t('SOUND: ON')}` : `🔇 ${t('SOUND: OFF')}`}
        </button>
        <button
          data-action="start-sector"
          data-sector="${hud.sectorId}"
          class="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono py-2.5 px-5 rounded uppercase tracking-wider text-xs cursor-pointer"
        >
          ↺ ${isSurvival ? t('RESTART SURVIVAL (TIER I)') : t('RESTART SECTOR')}
        </button>
        <button
          data-action="${isSurvival ? 'return-survival' : 'abort-mission'}"
          class="w-full bg-red-950 hover:bg-red-700 text-red-200 border border-red-600/60 font-mono py-2.5 px-5 rounded uppercase tracking-wider text-xs cursor-pointer"
        >
          ⏎ ${isSurvival ? t('END SURVIVAL RUN (SAVE RECORD)') : t('MAIN MENU (KEEP COLLECTED LOOT)')}
        </button>
      </div>
    </div>
  `;
}

function renderVictoryModal(state, hud, currentSector, accuracy) {
  const s = hud.lastSettlementSummary;
  if (hud.gameMode === 'survival' || currentSector.gameMode === 'survival') {
    const sv = hud.survival;
    const rec = sv?.recordSummary;
    const waveReached = rec?.waveReached ?? sv?.wave ?? 7;
    const timeSec = rec?.timeSec ?? sv?.elapsedSec ?? 420;
    const baseHp = Math.max(0, hud.baseHp ?? 120);
    const baseMaxHp = Math.max(1, hud.baseMaxHp ?? 120);
    const newWaveBadge = rec?.isNewWaveRecord ? NEW_PILL() : '';
    const newKillBadge = rec?.isNewKillRecord ? NEW_PILL() : '';
    const newTimeBadge = rec?.isNewTimeRecord ? NEW_PILL() : '';
    return `
      <div class="battle-modal-card">
        <div class="text-emerald-400 font-mono text-xs uppercase tracking-[0.2em] mb-1">
          ${t('PARIS HELD FOR 7:00 // ÉLYSÉE PALACE SECURED')}
        </div>
        <h2 class="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-2">
          ${t('PARIS: LAST STAND — VICTORY ACHIEVED')}
        </h2>
        <p class="text-xs font-mono text-slate-400 mb-4">
          ${t('Victory logged to Survival Records · Extract now or continue into endless Overtime waves.')}
        </p>

        <div class="grid grid-cols-4 gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded mb-4 font-mono">
          <div>
            <span class="battle-stat-label">${t('WAVE')} ${newWaveBadge}</span>
            <span class="text-lg font-bold text-amber-300 tabular-nums">${t('WAVE {n}', { n: waveReached })}</span>
          </div>
          <div>
            <span class="battle-stat-label">${t('KILLS')} ${newKillBadge}</span>
            <span class="text-lg font-bold text-emerald-400 tabular-nums">${hud.kills}</span>
          </div>
          <div>
            <span class="battle-stat-label">${t('TIME')} ${newTimeBadge}</span>
            <span class="text-lg font-bold text-sky-300 tabular-nums">${formatSurvivalDuration(timeSec)}</span>
          </div>
          <div>
            <span class="battle-stat-label">${t('HQ INTEGRITY')}</span>
            <span class="text-lg font-bold text-emerald-300 tabular-nums">${baseHp}/${baseMaxHp} HP</span>
          </div>
        </div>

        ${renderBattleMedalsAndRankSection(state)}
        ${renderBattleShareBar(state, hud, currentSector, accuracy)}

        <div class="battle-modal-actions">
          <button
            data-action="survival-overtime"
            class="battle-btn-primary"
          >
            ${RIVETS_HTML}${ICON_TANK}<span>${t('CONTINUE IN OVERTIME (ENDLESS)')}</span>${ICON_CHEVRONS}
          </button>
          <button class="battle-btn-secondary" data-action="return-survival">${RIVETS_HTML}<span>${t('Extract &amp; records')}</span></button>
          <button class="battle-btn-secondary" data-action="start-survival">${RIVETS_HTML}<span>${t('New run')}</span></button>
        </div>
      </div>
    `;
  }
  if (hud.gameMode === 'contract' || currentSector.gameMode === 'contract') {
    return `
      <div class="battle-modal-card">
        <div class="text-emerald-400 font-mono text-xs uppercase tracking-[0.2em] mb-1">
          ${t('CONTRACT EXTRACTED // TERMINAL PAYOUT SETTLEMENT')}
        </div>
        <h2 class="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-4">
          ${t('{name} — EXTRACTION COMPLETE ({n}/3 CARGO)', { name: t(currentSector.name).toUpperCase(), n: s?.deliveredCount ?? 2 })}
        </h2>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded mb-4 font-mono">
          <div>
            <span class="battle-stat-label">${t('CARGO')} (${s?.deliveredCount ?? 0}/3)</span>
            <span class="text-lg font-bold text-sky-300 tabular-nums">+$ ${s?.cargoCreditsSecured ?? 0}</span>
          </div>
          <div>
            <span class="battle-stat-label">${t('EXTRACTION')}</span>
            <span class="text-lg font-bold text-emerald-400 tabular-nums">+$ ${s?.extractionBonus ?? 0}</span>
          </div>
          <div>
            <span class="battle-stat-label">${t('3RD CARGO')} ★</span>
            <span class="text-lg font-bold text-amber-300 tabular-nums">+$ ${s?.thirdCargoBonus ?? 0}</span>
          </div>
          <div>
            <span class="battle-stat-label">${t('TOTAL CREDITS')}</span>
            <span class="text-lg font-bold text-emerald-300 tabular-nums">+$ ${s?.totalObjectiveCredits ?? 0}</span>
          </div>
        </div>
        ${renderBattleMedalsAndRankSection(state)}
        ${renderBattleShareBar(state, hud, currentSector, accuracy)}
        ${renderRewardedAdSlot(state)}

        <div class="battle-modal-actions">
          <button
            data-action="start-sector"
            data-sector="${hud.sectorId}"
            class="battle-btn-primary"
          >
            ${RIVETS_HTML}${ICON_TANK}<span>${t('REPLAY CONTRACT')}</span>${ICON_CHEVRONS}
          </button>
          <button class="battle-btn-secondary" data-action="return-contracts">${RIVETS_HTML}<span>${t('Contracts')}</span></button>
        </div>
      </div>
    `;
  }

  const hasNextCampaign =
    hud.sectorId + 1 < SECTORS.length && !isContractMap(currentSector) && !isContractMap(SECTORS[hud.sectorId + 1]);
  const nextSectorIdx = hasNextCampaign ? hud.sectorId + 1 : hud.sectorId;
  const nextBtnLabel = hasNextCampaign
    ? `${t('NEXT SECTOR: {name}', { name: t(SECTORS[hud.sectorId + 1].name) })} →`
    : `↺ ${t('REPLAY MISSION')}`;

  return `
    <div class="battle-modal-card">
      <div class="text-emerald-400 font-mono text-xs uppercase tracking-[0.2em] mb-1">
        ${t('SECTOR SECURED // VICTORY')}
      </div>
      <h2 class="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-4">
        ${currentSector.rules.spawnSectorBossOnClear ? t('{name} DESTROYED', { name: currentSector.bossName }) : t('{name} COMPLETE', { name: t(currentSector.name).toUpperCase() })}
      </h2>

      ${s?.bossReward ? `
        <div class="p-3 mb-4 border border-amber-400/70 rounded bg-slate-900 font-mono text-xs text-amber-300">
          <strong>${t('BOSS REWARD SECURED:')}</strong> ${s.bossReward.loot?.type === 'part'
            ? t(getPartCatalogEntry(s.bossReward.loot.definitionId)?.name || s.bossReward.loot.definitionId)
            : t('+${amount} CREDITS', { amount: s.bossReward.loot?.amount || s.bossReward.loot?.credits || 500 })} · ${t('{name} reserved', { name: t(POWERUP_TYPES[s.bossReward.powerUp]?.name || 'Power-up') })}
        </div>
      ` : ''}

      <div class="grid grid-cols-3 gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded mb-4 font-mono">
        <div>
          <span class="battle-stat-label">${t('CREDITS')}</span>
          <span class="text-lg font-bold text-emerald-400 tabular-nums">+$ ${s?.creditsGained ?? 400}</span>
        </div>
        <div>
          <span class="battle-stat-label">${t('DROPS')}</span>
          <span class="text-lg font-bold text-teal-300 tabular-nums">${s?.autoCollectedCount ?? 0}</span>
        </div>
        <div>
          <span class="battle-stat-label">${t('ACCURACY')}</span>
          <span class="text-lg font-bold text-sky-400 tabular-nums">${accuracy}%</span>
        </div>
      </div>
      ${renderBattleMedalsAndRankSection(state)}
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
        ${isContractMap(currentSector)
          ? `<button class="battle-btn-secondary" data-action="return-contracts">${RIVETS_HTML}<span>${t('Contracts')}</span></button>`
          : `<button class="battle-btn-secondary" data-action="return-campaign">${RIVETS_HTML}<span>${t('Campaign map')}</span></button>`}
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
    const newWaveBadge = rec?.isNewWaveRecord ? NEW_PILL() : '';
    const newKillBadge = rec?.isNewKillRecord ? NEW_PILL() : '';
    const newTimeBadge = rec?.isNewTimeRecord ? NEW_PILL() : '';
    const hqLost = !hud.baseAlive;
    const wasOvertime = Boolean(sv?.victoryAchieved || rec?.victoryAchieved);
    return `
      <div class="battle-modal-card">
        <div class="${wasOvertime ? 'text-emerald-400' : 'text-amber-400'} font-mono text-xs uppercase tracking-[0.2em] mb-1">
          ${wasOvertime ? t('OVERTIME RUN CONCLUDED // PARIS VICTORY LOGGED') : hqLost ? t('ÉLYSÉE PALACE HQ DESTROYED // RECORD LOGGED') : t('SURVIVAL RUN CONCLUDED // RECORD LOGGED')}
        </div>
        <h2 class="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-2">
          ${hqLost
            ? t('ÉLYSÉE PALACE FELL ON WAVE {wave} ({cleared} WAVES CLEARED)', { wave: waveReached, cleared: wavesCleared })
            : t('FALLEN ON WAVE {wave} ({cleared} WAVES CLEARED)', { wave: waveReached, cleared: wavesCleared })}
        </h2>
        <p class="text-xs font-mono text-slate-400 mb-4">
          ${t('Tier I run · Campaign profile &amp; credits restored intact.')}
        </p>

        <div class="grid grid-cols-4 gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded mb-4 font-mono">
          <div>
            <span class="battle-stat-label">${t('WAVE')} ${newWaveBadge}</span>
            <span class="text-lg font-bold text-amber-300 tabular-nums">${t('WAVE {n}', { n: waveReached })}</span>
          </div>
          <div>
            <span class="battle-stat-label">${t('KILLS')} ${newKillBadge}</span>
            <span class="text-lg font-bold text-emerald-400 tabular-nums">${hud.kills}</span>
          </div>
          <div>
            <span class="battle-stat-label">${t('TIME')} ${newTimeBadge}</span>
            <span class="text-lg font-bold text-sky-300 tabular-nums">${formatSurvivalDuration(timeSec)}</span>
          </div>
          <div>
            <span class="battle-stat-label">${t('BOSSES')}</span>
            <span class="text-lg font-bold text-red-300 tabular-nums">${bosses}</span>
          </div>
        </div>

        ${renderBattleMedalsAndRankSection(state)}
        ${renderBattleShareBar(state, hud, currentSector, accuracy)}

        <div class="battle-modal-actions">
          <button
            data-action="start-survival"
            class="battle-btn-primary"
          >
            ${RIVETS_HTML}${ICON_TANK}<span>${t('NEW SURVIVAL RUN')}</span>${ICON_CHEVRONS}
          </button>
          <button class="battle-btn-secondary" data-action="return-survival">${RIVETS_HTML}<span>${t('Survival records')}</span></button>
          <button class="battle-btn-secondary" data-action="main-menu">${RIVETS_HTML}<span>${t('Main menu')}</span></button>
        </div>
      </div>
    `;
  }

  const isContract = hud.gameMode === 'contract' || currentSector.gameMode === 'contract';
  const isContractRun = isContract || isContractMap(currentSector);
  const defeatReason =
    currentSector?.defeatOnBaseLoss && !hud.baseAlive
      ? t('DEFENSE OBJECTIVE LOST')
      : t('PLAYER TANK DESTROYED IN ACTION');

  return `
    <div class="battle-modal-card">
      <div class="text-red-400 font-mono text-xs uppercase tracking-[0.2em] mb-1">
        ${defeatReason} // ${t('DEFEAT')}
      </div>
      <h2 class="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-2">
        ${isContract ? t('CONTRACT FAILED — DELIVERED CARGO PRESERVED') : t('MISSION FAILED — COLLECTED LOOT PRESERVED')}
      </h2>
      <p class="text-xs font-mono text-slate-400 mb-4">
        ${
          isContract
            ? t('Delivered cargo (+${amount}) &amp; bounties preserved.', { amount: s?.cargoCreditsSecured ?? 0 })
            : t('Loadout intact · +${amount} preserved · {lost} uncollected drops lost.', { amount: s?.creditsGained ?? 0, lost: s?.lostCount ?? 0 })
        }
      </p>

      <div class="grid grid-cols-3 gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded mb-4 font-mono">
        <div>
          <span class="battle-stat-label">${isContract ? t('CARGO CREDITS') : t('CREDITS')}</span>
          <span class="text-lg font-bold text-emerald-400 tabular-nums">+$ ${isContract ? (s?.cargoCreditsSecured ?? 0) : (s?.creditsGained ?? 0)}</span>
        </div>
        <div>
          <span class="battle-stat-label">${isContract ? t('CARGO') : t('LOST DROPS')}</span>
          <span class="text-lg font-bold ${isContract ? 'text-sky-300' : 'text-red-400'} tabular-nums">${isContract ? `${s?.deliveredCount ?? 0} / 3` : (s?.lostCount ?? 0)}</span>
        </div>
        <div>
          <span class="battle-stat-label">${t('KILLS')}</span>
          <span class="text-lg font-bold text-emerald-400 tabular-nums">${hud.kills}</span>
        </div>
      </div>
      ${renderBattleMedalsAndRankSection(state)}
      ${renderBattleShareBar(state, hud, currentSector, accuracy)}
      ${renderRewardedAdSlot(state)}

      <div class="battle-modal-actions">
        <button
          data-action="start-sector"
          data-sector="${hud.sectorId}"
          class="battle-btn-primary"
        >
          ${RIVETS_HTML}${ICON_TANK}<span>${isContract ? t('RETRY CONTRACT') : t('RETRY SECTOR')}</span>${ICON_CHEVRONS}
        </button>
        <button class="battle-btn-secondary" data-action="${isContractRun ? 'return-contracts' : 'return-campaign'}">${RIVETS_HTML}<span>${isContractRun ? t('Contracts') : t('Campaign map')}</span></button>
      </div>
    </div>
  `;
}

export function renderStatusModal({ statusModal, state, hud, currentSector, accuracy }) {
  if (!statusModal) return;
  if (
    hud.status === GameStatus.PLAYING ||
    hud.status === GameStatus.BOSS_INTRO ||
    (hud.status === GameStatus.PAUSED && hud.airSupportTargeting) ||
    (hud.status === GameStatus.VICTORY && hud.victoryCinematicsActive) ||
    (hud.status === GameStatus.GAME_OVER && hud.defeatCinematicsActive) ||
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

