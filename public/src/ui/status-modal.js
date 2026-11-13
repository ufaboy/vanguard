import { POWERUP_TYPES } from '../game/constants.js';
import { SECTORS } from '../game/levels.js';
import { GameStatus } from '../game/types.js';
import { getPartCatalogEntry } from '../sim/index.js';
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

function renderRewardedAdSlot(state) {
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
      <div class="w-full max-w-2xl bg-[#0B0F17] border border-slate-700/80 rounded p-7 shadow-2xl">
        <div class="text-emerald-400 font-mono text-xs uppercase tracking-[0.2em] mb-1">
          CONTRACT EXTRACTED // TERMINAL PAYOUT SETTLEMENT
        </div>
        <h2 class="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-4">
          ${currentSector.name.toUpperCase()} — EXTRACTION COMPLETE (${s?.deliveredCount ?? 2}/3 CARGO)
        </h2>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded mb-4 font-mono">
          <div>
            <span class="text-[10px] text-slate-400 uppercase block">CARGO DELIVERED (${s?.deliveredCount ?? 0}/3)</span>
            <span class="text-lg font-bold text-sky-300 tabular-nums">+$ ${s?.cargoCreditsSecured ?? 0}</span>
          </div>
          <div>
            <span class="text-[10px] text-slate-400 uppercase block">EXTRACTION PAYOUT</span>
            <span class="text-lg font-bold text-emerald-400 tabular-nums">+$ ${s?.extractionBonus ?? 0}</span>
          </div>
          <div>
            <span class="text-[10px] text-slate-400 uppercase block">3RD CARGO BONUS ★</span>
            <span class="text-lg font-bold text-amber-300 tabular-nums">+$ ${s?.thirdCargoBonus ?? 0}</span>
          </div>
          <div>
            <span class="text-[10px] text-slate-400 uppercase block">TOTAL OBJECTIVE CREDITS</span>
            <span class="text-lg font-bold text-emerald-300 tabular-nums">+$ ${s?.totalObjectiveCredits ?? 0}</span>
          </div>
        </div>
        ${renderRewardedAdSlot(state)}

        <div class="flex flex-wrap items-center justify-between gap-3">
          <button
            data-action="start-sector"
            data-sector="${hud.sectorId}"
            class="menu-primary flex-1 whitespace-nowrap"
          >
            <span>↺ REPLAY CONTRACT</span>
          </button>
          <button class="menu-secondary" data-action="return-contracts">Contracts menu</button>
          <button
            data-action="toggle-upgrades"
            class="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-400/70 rounded font-mono text-xs uppercase tracking-wider font-bold cursor-pointer"
          >
            ⚙ OPEN HANGAR [U]
          </button>
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
    <div class="w-full max-w-2xl bg-[#0B0F17] border border-slate-700/80 rounded p-7 shadow-2xl">
      <div class="text-emerald-400 font-mono text-xs uppercase tracking-[0.2em] mb-1">
        SECTOR SECURED // VICTORY & LOOT AUTO-COLLECTION
      </div>
      <h2 class="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-4">
        ${currentSector.rules.spawnSectorBossOnClear ? `${currentSector.bossName} DESTROYED` : `${currentSector.name.toUpperCase()} COMPLETE`}
      </h2>

      ${s?.bossReward ? `
        <div class="p-3 mb-4 border border-amber-400/70 rounded bg-slate-900 font-mono text-xs text-amber-300">
          <strong>BOSS REWARD SECURED</strong>
          <p>${s.bossReward.loot?.type === 'part'
            ? (getPartCatalogEntry(s.bossReward.loot.definitionId)?.name || s.bossReward.loot.definitionId)
            : `+$${s.bossReward.loot?.amount || s.bossReward.loot?.credits || 500} CREDITS`} — added to balance.</p>
          <p>${POWERUP_TYPES[s.bossReward.powerUp]?.name || 'Power-up'} — reserved at your next deployment. No expiry.</p>
        </div>
      ` : ''}

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded mb-4 font-mono">
        <div>
          <span class="text-[10px] text-slate-400 uppercase block">CREDITS RECOVERED</span>
          <span class="text-lg font-bold text-emerald-400 tabular-nums">+$ ${s?.creditsGained ?? 400}</span>
        </div>
        <div>
          <span class="text-[10px] text-slate-400 uppercase block">AUTO-COLLECTED DROPS</span>
          <span class="text-lg font-bold text-teal-300 tabular-nums">${s?.autoCollectedCount ?? 0}</span>
        </div>
        <div>
          <span class="text-[10px] text-slate-400 uppercase block">ACCURACY</span>
          <span class="text-lg font-bold text-sky-400 tabular-nums">${accuracy}%</span>
        </div>
      </div>
      ${renderRewardedAdSlot(state)}

      <div class="flex flex-wrap items-center justify-between gap-3">
        <button
          data-action="start-sector"
          data-sector="${nextSectorIdx}"
          class="menu-primary flex-1 whitespace-nowrap"
        >
          <span>${nextBtnLabel}</span>
        </button>
        <button class="menu-secondary" data-action="return-campaign">Campaign map</button>
        <button
          data-action="toggle-upgrades"
          class="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-400/70 rounded font-mono text-xs uppercase tracking-wider font-bold cursor-pointer"
        >
          ⚙ OPEN HANGAR [U]
        </button>
      </div>
    </div>
  `;
}

function renderGameOverModal(state, hud, currentSector) {
  const s = hud.lastSettlementSummary;
  const isSurvival = hud.gameMode === 'survival' || currentSector.gameMode === 'survival';
  if (isSurvival) {
    const sv = hud.survival;
    const rec = sv?.recordSummary;
    const waveReached = rec?.waveReached ?? sv?.wave ?? 1;
    const wavesCleared = rec?.wavesCleared ?? sv?.wavesCleared ?? 0;
    const timeSec = rec?.timeSec ?? sv?.elapsedSec ?? 0;
    const bosses = rec?.bossesDefeated ?? sv?.bossesDefeated ?? 0;
    const newWaveBadge = rec?.isNewWaveRecord ? '<span class="ml-1.5 px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-bold">★ NEW RECORD</span>' : '';
    const newKillBadge = rec?.isNewKillRecord ? '<span class="ml-1.5 px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-bold">★ NEW RECORD</span>' : '';
    const newTimeBadge = rec?.isNewTimeRecord ? '<span class="ml-1.5 px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-bold">★ NEW RECORD</span>' : '';
    return `
      <div class="w-full max-w-2xl bg-[#0B0F17] border border-slate-700/80 rounded p-7 shadow-2xl">
        <div class="text-amber-400 font-mono text-xs uppercase tracking-[0.2em] mb-1">
          SURVIVAL RUN CONCLUDED // PERSONAL RECORD LOGGED
        </div>
        <h2 class="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-3">
          FALLEN ON WAVE ${waveReached} (${wavesCleared} WAVES CLEARED)
        </h2>
        <p class="text-xs font-mono text-slate-300 mb-4">
          Survival runs start from a clean Tier I tank and award no persistent profile credits. Your main campaign profile, upgrades, and treasury have been restored intact.
        </p>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded mb-6 font-mono">
          <div>
            <span class="text-[10px] text-slate-400 uppercase block">WAVE REACHED ${newWaveBadge}</span>
            <span class="text-lg font-bold text-amber-300 tabular-nums">WAVE ${waveReached}</span>
          </div>
          <div>
            <span class="text-[10px] text-slate-400 uppercase block">HOSTILES DESTROYED ${newKillBadge}</span>
            <span class="text-lg font-bold text-emerald-400 tabular-nums">${hud.kills}</span>
          </div>
          <div>
            <span class="text-[10px] text-slate-400 uppercase block">SURVIVAL TIME ${newTimeBadge}</span>
            <span class="text-lg font-bold text-sky-300 tabular-nums">${formatSurvivalDuration(timeSec)}</span>
          </div>
          <div>
            <span class="text-[10px] text-slate-400 uppercase block">BOSSES DEFEATED</span>
            <span class="text-lg font-bold text-red-300 tabular-nums">${bosses}</span>
          </div>
        </div>

        <div class="flex flex-wrap gap-3">
          <button
            data-action="start-survival"
            class="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 px-6 rounded uppercase tracking-wider text-sm transition-colors cursor-pointer"
          >
            <span>↺ NEW SURVIVAL RUN (TIER I)</span>
          </button>
          <button class="menu-secondary" data-action="return-survival">Survival records</button>
          <button class="menu-secondary" data-action="main-menu">Main menu</button>
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
    <div class="w-full max-w-2xl bg-[#0B0F17] border border-slate-700/80 rounded p-7 shadow-2xl">
      <div class="text-red-400 font-mono text-xs uppercase tracking-[0.2em] mb-1">
        ${defeatReason} // DEFEAT SETTLEMENT
      </div>
      <h2 class="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-3">
        ${isContract ? 'CONTRACT FAILED — DELIVERED CARGO CREDITS PRESERVED' : 'MISSION FAILED — MANUALLY COLLECTED LOOT PRESERVED'}
      </h2>
      <p class="text-xs font-mono text-slate-300 mb-4">
        ${
          isContract
            ? `Already delivered cargo payouts (+$${s?.cargoCreditsSecured ?? 0}) and combat kill bounties remain yours. Extraction and 3rd-cargo bonuses require a live extraction.`
            : `Your tank loadout and installed modules remain intact. Recovered battlefield credits (+$${s?.creditsGained ?? 0}) were deposited; ${s?.lostCount ?? 0} uncollected containers were lost.`
        }
      </p>

      <div class="grid grid-cols-3 gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded mb-6 font-mono">
        <div>
          <span class="text-[10px] text-slate-400 uppercase block">${isContract ? 'DELIVERED CARGO CREDITS' : 'CREDITS PRESERVED'}</span>
          <span class="text-lg font-bold text-emerald-400 tabular-nums">+$ ${isContract ? (s?.cargoCreditsSecured ?? 0) : (s?.creditsGained ?? 0)}</span>
        </div>
        <div>
          <span class="text-[10px] text-slate-400 uppercase block">${isContract ? 'CARGO DELIVERED' : 'LOST CONTAINERS'}</span>
          <span class="text-lg font-bold ${isContract ? 'text-sky-300' : 'text-red-400'} tabular-nums">${isContract ? `${s?.deliveredCount ?? 0} / 3` : (s?.lostCount ?? 0)}</span>
        </div>
        <div>
          <span class="text-[10px] text-slate-400 uppercase block">HOSTILES DESTROYED</span>
          <span class="text-lg font-bold text-emerald-400 tabular-nums">${hud.kills}</span>
        </div>
      </div>
      ${renderRewardedAdSlot(state)}

      <div class="flex flex-wrap gap-3">
        <button
          data-action="start-sector"
          data-sector="${hud.sectorId}"
          class="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 px-6 rounded uppercase tracking-wider text-sm transition-colors cursor-pointer"
        >
          <span>${isContract ? '↺ RETRY CONTRACT' : '↺ RETRY SECTOR ASSAULT'}</span>
        </button>
        <button class="menu-secondary" data-action="${isContract ? 'return-contracts' : 'return-campaign'}">${isContract ? 'Contracts menu' : 'Campaign map'}</button>
        <button
          data-action="toggle-upgrades"
          class="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-teal-300 border border-teal-400/70 rounded font-mono text-xs uppercase tracking-wider font-bold cursor-pointer"
        >
          ⚙ HANGAR & WORKSHOP [U]
        </button>
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
    setHtml(statusModal, renderGameOverModal(state, hud, currentSector));
  }
}

