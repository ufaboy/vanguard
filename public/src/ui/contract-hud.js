import { GameStatus } from '../game/types.js';
import { setHidden, setHtml } from './dom-helpers.js';

function renderContractProgressRingSvg(ratio, strokeColor = '#38bdf8', label = '') {
  const clamped = Math.max(0, Math.min(1, ratio || 0));
  const r = 13;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped);
  return `
    <svg width="34" height="34" viewBox="0 0 34 34" class="shrink-0">
      <circle cx="17" cy="17" r="${r}" fill="#020617" stroke="#1e293b" stroke-width="3.2" />
      <circle
        cx="17"
        cy="17"
        r="${r}"
        fill="none"
        stroke="${strokeColor}"
        stroke-width="3.2"
        stroke-linecap="round"
        stroke-dasharray="${c.toFixed(1)}"
        stroke-dashoffset="${offset.toFixed(1)}"
        transform="rotate(-90 17 17)"
      />
      <text x="17" y="20.5" text-anchor="middle" fill="#f8fafc" font-size="8.5" font-family="monospace" font-weight="bold">${label}</text>
    </svg>
  `;
}

export function formatSurvivalDuration(totalSec = 0) {
  const sec = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function renderContractHud(hud) {
  const hudEl = document.getElementById('contract-hud');
  const actionEl = document.getElementById('contract-action-bar');
  if (!hudEl || !actionEl) return;

  if (
    hud.survival &&
    (hud.status === GameStatus.PLAYING || hud.status === GameStatus.PAUSED)
  ) {
    const sv = hud.survival;
    setHidden(hudEl, false);
    const phaseBadge =
      sv.phase === 'intermission'
        ? `<div class="px-3 py-1.5 rounded border border-teal-400 bg-teal-950/90 text-teal-200 font-mono text-xs flex items-center gap-2 font-bold">
             <span class="text-base leading-none">⏱</span>
             <div>
               <div class="text-[11px]">INTERMISSION (${Math.ceil(sv.intermissionTimer)}s)</div>
               <div class="text-[9px] text-teal-300">REPAIR & UPGRADE AT ALLIED BAY [U]</div>
             </div>
           </div>`
        : `<div class="px-3 py-1.5 rounded border ${
            sv.isBossWave
              ? 'border-red-400 bg-red-950/90 text-red-100'
              : 'border-amber-400/80 bg-slate-900/95 text-amber-200'
          } font-mono text-xs flex items-center gap-2 font-bold">
             <span class="text-base leading-none">${sv.isBossWave ? '⚠' : '⚔'}</span>
             <div>
               <div class="text-[11px]">WAVE ${sv.wave} // ${sv.title}</div>
               <div class="text-[9px] opacity-85">${sv.hostilesRemaining}/${sv.totalWaveHostiles} HOSTILES · CLEAR +$${sv.waveRewardCredits}</div>
             </div>
           </div>`;

    const statsBadge = `
      <div class="px-3 py-1.5 rounded border border-slate-700 bg-slate-900/95 text-slate-200 font-mono text-xs flex items-center gap-3">
        <div>
          <div class="text-[9px] text-slate-400 uppercase">CLEARED</div>
          <div class="text-[11px] font-bold text-emerald-400 tabular-nums">${sv.wavesCleared} WAVES</div>
        </div>
        <div class="border-l border-slate-700 pl-3">
          <div class="text-[9px] text-slate-400 uppercase">KILLS</div>
          <div class="text-[11px] font-bold text-amber-300 tabular-nums">${hud.kills || 0}</div>
        </div>
        <div class="border-l border-slate-700 pl-3">
          <div class="text-[9px] text-slate-400 uppercase">SURVIVAL TIME</div>
          <div class="text-[11px] font-bold text-sky-300 tabular-nums">${formatSurvivalDuration(sv.elapsedSec)}</div>
        </div>
      </div>
    `;

    const baseDownWarn = !hud.baseAlive
      ? `<div class="bg-red-950/95 border border-red-500/80 px-3.5 py-1.5 rounded flex items-center gap-2 font-mono text-xs text-red-100 shadow-lg">
           <span class="text-amber-300 font-bold">⚠ REPAIR BAY DESTROYED</span>
           <span>REPAIR & GARAGE [U] OFFLINE — RECOVER BASE_RESTORE FROM SUPPLY CRATES</span>
         </div>`
      : '';

    setHtml(
      hudEl,
      `
        <div class="hud-card hud-objectives-card">
          ${phaseBadge}
          <div class="mt-1.5">${statsBadge}</div>
        </div>
        ${baseDownWarn}
      `
    );

    if (hud.status === GameStatus.PLAYING && sv.phase === 'intermission') {
      const ratio = sv.intermissionTimer / Math.max(1, sv.intermissionDuration || 15);
      setHidden(actionEl, false);
      setHtml(
        actionEl,
        `
          <div class="flex flex-wrap items-center gap-2.5">
            <div class="bg-slate-950/95 border border-teal-400/80 px-3.5 py-2 rounded shadow-2xl flex items-center gap-2.5 font-mono text-xs text-teal-100">
              ${renderContractProgressRingSvg(ratio, '#2dd4bf', `${Math.ceil(sv.intermissionTimer)}s`)}
              <div>
                <div class="font-bold text-xs uppercase text-white">NEXT: WAVE ${sv.nextWaveNumber} — ${sv.nextWaveTitle}</div>
                <div class="text-[10px] ${sv.nextWaveIsBoss ? 'text-red-300 font-bold' : 'text-teal-300'}">
                  ${sv.nextWaveIsBoss ? `⚠ SECTOR BOSS WAVE (${sv.nextWaveBossName})` : 'FIELD SUPPLY CRATES DEPLOYED · VISIT BASE BAY [U] TO UPGRADE'}
                </div>
              </div>
            </div>
            <button
              data-action="survival-next-wave"
              class="pointer-events-auto cursor-pointer bg-amber-500 hover:bg-amber-400 text-slate-950 border-2 border-amber-200 px-4 py-2.5 rounded shadow-2xl flex items-center gap-2.5 font-mono text-xs font-bold uppercase tracking-wider"
            >
              <span class="px-2 py-0.5 rounded bg-slate-950 text-amber-300 text-xs">[N]</span>
              <span>CALL WAVE ${sv.nextWaveNumber} NOW (+$${sv.earlyCallBonus})</span>
            </button>
          </div>
        `
      );
    } else {
      setHidden(actionEl, true);
    }
    return;
  }

  const contract = hud.contract;
  if (
    !contract ||
    (hud.status !== GameStatus.PLAYING && hud.status !== GameStatus.PAUSED)
  ) {
    setHidden(hudEl, true);
    setHidden(actionEl, true);
    return;
  }

  setHidden(hudEl, false);
  const isSabotage = Boolean(contract.isSabotage);
  const cargoRows = contract.containers
    .map((c) => {
      const isOptional = c.slot === 3;
      const starBadge = isOptional ? ' <span class="text-amber-300" title="Optional 3rd Objective Bonus (+$4,000)">★</span>' : '';
      let stateIcon = isSabotage ? '◈' : '▭';
      let stateLabel = isSabotage ? 'ACTIVE' : 'WAIT';
      let rowCls = '';
      if (c.status === 'delivered') {
        stateIcon = '✓';
        stateLabel = isSabotage ? 'DONE' : 'SECURED';
        rowCls = ' is-done';
      } else if (c.status === 'armed') {
        stateIcon = '💣';
        stateLabel = `${Math.ceil(c.fuseTimer || 0)}s`;
        rowCls = ' is-armed';
      } else if (c.status === 'carried' || c.status === 'unloading') {
        stateIcon = '⛟';
        stateLabel = c.status === 'unloading' ? 'UNLOAD' : 'CARRIED';
        rowCls = ' is-active';
      } else if (c.status === 'loading') {
        stateIcon = '⟳';
        stateLabel = isSabotage ? 'ARMING' : 'LOAD';
        rowCls = ' is-active';
      }
      return `
        <div class="hud-obj-row${rowCls}">
          <span class="hud-obj-name">${stateIcon} #${c.slot} ${c.shortName}${starBadge}</span>
          <span class="hud-obj-state">${stateLabel}</span>
        </div>
      `;
    })
    .join('');

  const minReq = contract.minRequiredDeliveries || 2;
  const exitUnlocked = contract.deliveredCount >= minReq;
  const headTitle = exitUnlocked
    ? 'EXTRACT AT PAD'
    : isSabotage
    ? 'RELAYS'
    : 'CARGO';

  const warn = contract.gateWarning;
  const warnHtml = warn
    ? `<div class="hud-card px-2.5 py-1.5 border-l-2 border-red-500 font-mono text-[10px] text-red-200 leading-tight">
         <div class="font-bold text-amber-300">↓ ${warn.gateLabel} · ${warn.waitingAtCap ? '6/6 ACTIVE' : warn.GateTimerText || (warn.gateTimer > 0 ? `${Math.ceil(warn.gateTimer)}s` : `${warn.remainingPackets} PKT`)}</div>
         <div class="truncate opacity-90">${(warn.previewUnits || []).join(' · ')}</div>
       </div>`
    : '';

  setHtml(
    hudEl,
    `
      <div class="hud-card hud-objectives-card${isSabotage ? ' is-sabotage' : ''}${exitUnlocked ? ' is-done' : ''}">
        <div class="hud-obj-head">
          <span class="hud-label">${headTitle}</span>
          <span class="hud-obj-count">${contract.deliveredCount}/${minReq}${exitUnlocked ? ' ✓' : ''}</span>
        </div>
        <div class="hud-obj-list">${cargoRows}</div>
      </div>
      ${warnHtml}
    `
  );

  // Contextual bottom-center interaction bar (Loading / Arming / Fuse / Unloading / Extraction)
  if (hud.status !== GameStatus.PLAYING) {
    setHidden(actionEl, true);
    return;
  }

  const actionsHtml = [];
  if (contract.loadingCargo) {
    const lc = contract.loadingCargo;
    const ratio = lc.progress / Math.max(0.1, lc.duration);
    actionsHtml.push(`
      <div class="${isSabotage ? 'bg-purple-950/95 border-purple-400 text-purple-100' : 'bg-sky-950/95 border-sky-400 text-sky-100'} border-2 px-4 py-2 rounded shadow-2xl flex items-center gap-3 font-mono text-xs">
        ${renderContractProgressRingSvg(ratio, isSabotage ? '#c084fc' : '#38bdf8', `${lc.progress.toFixed(1)}s`)}
        <div>
          <div class="font-bold text-sm uppercase text-white">${isSabotage ? `ARMING CHARGE ON RELAY #${lc.slot}` : `LOADING CARGO #${lc.slot}`} (${lc.shortName})</div>
          <div class="text-[10px] ${isSabotage ? 'text-purple-300' : 'text-sky-300'}">HOLD TANK STILL · ${(lc.duration - lc.progress).toFixed(1)}s REMAINING</div>
        </div>
      </div>
    `);
  } else if (contract.canLoadCargo && contract.nearbyCargo) {
    const nc = contract.nearbyCargo;
    actionsHtml.push(`
      <button
        data-action="contract-load-cargo"
        class="pointer-events-auto cursor-pointer ${isSabotage ? 'bg-purple-500 hover:bg-purple-400 border-purple-200' : 'bg-sky-500 hover:bg-sky-400 border-sky-200'} text-slate-950 border-2 px-5 py-2.5 rounded shadow-2xl flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-wider"
      >
        <span class="px-2 py-0.5 rounded bg-slate-950 ${isSabotage ? 'text-purple-300' : 'text-sky-300'} text-xs">[E]</span>
        <span>${isSabotage ? `PLANT DEMOLITION CHARGE #${nc.slot} (${nc.shortName}) — 2.5s` : `LOAD CARGO #${nc.slot} (${nc.shortName}) — 2.0s`}</span>
      </button>
    `);
  }

  if (contract.armedCargo) {
    const ac = contract.armedCargo;
    const ratio = ac.fuseTimer / Math.max(0.1, ac.fuseDuration);
    actionsHtml.push(`
      <div class="bg-rose-950/95 border-2 border-rose-400 px-4 py-2 rounded shadow-2xl flex items-center gap-3 font-mono text-xs text-rose-100">
        ${renderContractProgressRingSvg(ratio, '#f43f5e', `${ac.fuseTimer.toFixed(1)}s`)}
        <div>
          <div class="font-bold text-sm uppercase text-white">💣 RELAY #${ac.slot} (${ac.shortName}) DETONATING IN ${ac.fuseTimer.toFixed(1)}s!</div>
          <div class="text-[10px] ${ac.inBlastZone ? 'text-amber-300 font-bold' : 'text-emerald-300'}">${ac.inBlastZone ? '⚠ DANGER: CLEAR THE RED 3-CELL BLAST RING IMMEDIATELY!' : '✓ SAFE DISTANCE REACHED — STAND BY FOR DETONATION (+$1,500)'}</div>
        </div>
      </div>
    `);
  }

  if (contract.carriedCargo?.status === 'unloading') {
    const uc = contract.carriedCargo;
    const ratio = uc.unloadProgress / Math.max(0.1, uc.unloadDuration);
    actionsHtml.push(`
      <div class="bg-amber-950/95 border-2 border-amber-400 px-4 py-2 rounded shadow-2xl flex items-center gap-3 font-mono text-xs text-amber-100">
        ${renderContractProgressRingSvg(ratio, '#fbbf24', `${uc.unloadProgress.toFixed(1)}s`)}
        <div>
          <div class="font-bold text-sm uppercase text-white">UNLOADING CARGO #${uc.slot} (+$1,500)</div>
          <div class="text-[10px] text-amber-300">HOLD STILL ON SOUTHERN DELIVERY PAD · ${(uc.unloadDuration - uc.unloadProgress).toFixed(1)}s</div>
        </div>
      </div>
    `);
  } else if (contract.carriedCargo) {
    actionsHtml.push(`
      <div class="bg-slate-900/95 border border-amber-400/80 px-3.5 py-1.5 rounded shadow-lg font-mono text-xs text-amber-200">
        ⛟ CARRYING CARGO #${contract.carriedCargo.slot} (${contract.carriedCargo.shortName}) → DRIVE SOUTH TO DELIVERY PAD
      </div>
    `);
  }

  if (contract.extraction?.active) {
    const ex = contract.extraction;
    const ratio = ex.progress / Math.max(0.1, ex.duration);
    actionsHtml.push(`
      <div class="bg-emerald-950/95 border-2 border-emerald-400 px-4 py-2 rounded shadow-2xl flex items-center gap-3 font-mono text-xs text-emerald-100">
        ${renderContractProgressRingSvg(ratio, '#34d399', `${(ex.duration - ex.progress).toFixed(1)}s`)}
        <div>
          <div class="font-bold text-sm uppercase text-white">EXTRACTING FROM TERMINAL (${ex.progress.toFixed(1)}s / ${ex.duration.toFixed(1)}s)</div>
          <div class="text-[10px] text-emerald-300">STAY INSIDE DELIVERY PAD · COMBAT & MOVEMENT ALLOWED ON PAD</div>
        </div>
      </div>
    `);
  } else if (contract.canExtract) {
    const bonusText = contract.deliveredCount >= 3 ? '+$5,500 EXTRACTION + 3/3 BONUS' : '+$3,000 CONTRACT COMPLETION';
    actionsHtml.push(`
      <button
        data-action="contract-extract"
        class="pointer-events-auto cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-2 border-emerald-200 px-5 py-2.5 rounded shadow-2xl flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-wider"
      >
        <span class="px-2 py-0.5 rounded bg-slate-950 text-emerald-300 text-xs">[E]</span>
        <span>EXTRACT NOW (3.0s) · ${bonusText}</span>
      </button>
    `);
  }

  if (actionsHtml.length > 0) {
    setHidden(actionEl, false);
    setHtml(actionEl, actionsHtml.join(''));
  } else {
    setHidden(actionEl, true);
  }
}

