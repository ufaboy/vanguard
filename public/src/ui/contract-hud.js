import { GameStatus } from '../game/types.js';
import { setHidden, setHtml } from './dom-helpers.js';
import { t } from '../i18n/index.js';

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
    const baseMaxHp = Math.max(1, hud.baseMaxHp || 120);
    const baseHp = Math.max(0, hud.baseHp ?? baseMaxHp);
    const basePct = Math.max(0, Math.min(100, Math.round((baseHp / baseMaxHp) * 100)));
    const baseBarColor =
      basePct > 60 ? 'bg-emerald-400' : basePct > 30 ? 'bg-amber-400' : 'bg-red-500';
    const baseTextColor =
      basePct > 60 ? 'text-emerald-300' : basePct > 30 ? 'text-amber-300' : 'text-red-300';

    const hqBarHtml = `
      <div class="px-3 py-1.5 rounded border ${
        basePct <= 30 ? 'border-red-500/90 bg-red-950/90' : 'border-slate-700 bg-slate-900/95'
      } font-mono text-xs">
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-200">🏛 ${t('ÉLYSÉE PALACE HQ')}</span>
          <span class="text-[11px] font-bold tabular-nums ${baseTextColor}">${baseHp} / ${baseMaxHp} HP</span>
        </div>
        <div class="w-full h-1.5 bg-slate-800 rounded overflow-hidden">
          <div class="h-full ${baseBarColor}" style="width:${basePct}%"></div>
        </div>
      </div>
    `;

    const phaseBadge =
      sv.phase === 'intermission'
        ? `<div class="px-3 py-1.5 rounded border border-teal-400 bg-teal-950/90 text-teal-200 font-mono text-xs flex items-center gap-2 font-bold">
             <span class="text-base leading-none">⏱</span>
             <div>
               <div class="text-[11px]">${t('WAVE {wave} CLEARED · NEXT WAVE IN {sec}s', { wave: sv.wave, sec: Math.ceil(sv.waveTimer) })}</div>
               <div class="text-[9px] text-teal-300">${t('REPAIR & UPGRADE AT ÉLYSÉE HQ [U] OR CALL WAVE [N]')}</div>
             </div>
           </div>`
        : `<div class="px-3 py-1.5 rounded border ${
            sv.isBossWave
              ? 'border-red-400 bg-red-950/90 text-red-100'
              : 'border-amber-400/80 bg-slate-900/95 text-amber-200'
          } font-mono text-xs flex items-center gap-2 font-bold">
             <span class="text-base leading-none">${sv.isBossWave ? '⚠' : '⚔'}</span>
             <div>
               <div class="text-[11px]">${t('WAVE {n}', { n: sv.wave })} // ${t(sv.title)}</div>
               <div class="text-[9px] opacity-85">${t('{left}/{total} HOSTILES · NEXT WAVE IN {sec}s · +${reward}', { left: sv.hostilesRemaining, total: sv.totalWaveHostiles, sec: Math.ceil(sv.waveTimer), reward: sv.waveRewardCredits })}</div>
             </div>
           </div>`;

    const timerLabel = sv.overtime ? t('OVERTIME') : t('HOLD PARIS');
    const timerValue = sv.overtime
      ? formatSurvivalDuration(sv.elapsedSec)
      : formatSurvivalDuration(sv.holdRemainingSec);
    const timerColor = sv.overtime ? 'text-amber-300' : 'text-sky-300';

    const statsBadge = `
      <div class="px-3 py-1.5 rounded border border-slate-700 bg-slate-900/95 text-slate-200 font-mono text-xs flex items-center gap-3">
        <div>
          <div class="text-[9px] text-slate-400 uppercase">${timerLabel}</div>
          <div class="text-[11px] font-bold ${timerColor} tabular-nums">${timerValue}</div>
        </div>
        <div class="border-l border-slate-700 pl-3">
          <div class="text-[9px] text-slate-400 uppercase">${t('CLEARED')}</div>
          <div class="text-[11px] font-bold text-emerald-400 tabular-nums">${t('{n} WAVES', { n: sv.wavesCleared })}</div>
        </div>
        <div class="border-l border-slate-700 pl-3">
          <div class="text-[9px] text-slate-400 uppercase">${t('KILLS')}</div>
          <div class="text-[11px] font-bold text-amber-300 tabular-nums">${hud.kills || 0}</div>
        </div>
      </div>
    `;

    setHtml(
      hudEl,
      `
        <div class="hud-card hud-objectives-card">
          ${hqBarHtml}
          <div class="mt-1.5">${phaseBadge}</div>
          <div class="mt-1.5">${statsBadge}</div>
        </div>
      `
    );

    if (hud.status === GameStatus.PLAYING && sv.phase === 'intermission') {
      const ratio = sv.waveTimer / Math.max(1, sv.waveDuration || 60);
      setHidden(actionEl, false);
      setHtml(
        actionEl,
        `
          <div class="flex flex-wrap items-center gap-2.5">
            <div class="bg-[#0B0F17]/95 border border-teal-400/80 px-3.5 py-2 rounded shadow-2xl flex items-center gap-2.5 font-mono text-xs text-teal-100">
              ${renderContractProgressRingSvg(ratio, '#2dd4bf', `${Math.ceil(sv.waveTimer)}s`)}
              <div>
                <div class="font-bold text-xs uppercase text-white">${t('NEXT: WAVE {n} ({edge}) — {title}', { n: sv.nextWaveNumber, edge: t(String(sv.nextWaveEdge || 'north').toUpperCase()), title: t(sv.nextWaveTitle) })}</div>
                <div class="text-[10px] ${sv.nextWaveIsBoss ? 'text-red-300 font-bold' : 'text-teal-300'}">
                  ${sv.nextWaveIsBoss ? `⚠ ${t('SECTOR BOSS WAVE ({name})', { name: sv.nextWaveBossName })}` : t('FIELD SUPPLY CRATES DEPLOYED · VISIT ÉLYSÉE HQ [U] TO UPGRADE')}
                </div>
              </div>
            </div>
            <button
              data-action="survival-next-wave"
              class="pointer-events-auto cursor-pointer bg-amber-500 hover:bg-amber-400 text-slate-950 border-2 border-amber-200 px-4 py-2.5 rounded shadow-2xl flex items-center gap-2.5 font-mono text-xs font-bold uppercase tracking-wider"
            >
              <span class="px-2 py-0.5 rounded bg-slate-950 text-amber-300 text-xs">[N]</span>
              <span>${t('CALL WAVE {n} NOW (+${bonus})', { n: sv.nextWaveNumber, bonus: sv.earlyCallBonus })}</span>
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
      const starBadge = isOptional ? ` <span class="text-amber-300" title="${t('Optional 3rd Objective Bonus (+$4,000)')}">★</span>` : '';
      let stateIcon = isSabotage ? '◈' : '▭';
      let stateLabel = isSabotage ? t('ACTIVE') : t('WAIT');
      let rowCls = '';
      if (c.status === 'delivered') {
        stateIcon = '✓';
        stateLabel = isSabotage ? t('DONE') : t('SECURED');
        rowCls = ' is-done';
      } else if (c.status === 'armed') {
        stateIcon = '💣';
        stateLabel = `${Math.ceil(c.fuseTimer || 0)}s`;
        rowCls = ' is-armed';
      } else if (c.status === 'carried' || c.status === 'unloading') {
        stateIcon = '⛟';
        stateLabel = c.status === 'unloading' ? t('UNLOAD') : t('CARRIED');
        rowCls = ' is-active';
      } else if (c.status === 'loading') {
        stateIcon = '⟳';
        stateLabel = isSabotage ? t('ARMING') : t('LOAD');
        rowCls = ' is-active';
      }
      return `
        <div class="hud-obj-row${rowCls}">
          <span class="hud-obj-name">${stateIcon} #${c.slot} ${t(c.shortName)}${starBadge}</span>
          <span class="hud-obj-state">${stateLabel}</span>
        </div>
      `;
    })
    .join('');

  const minReq = contract.minRequiredDeliveries || 2;
  const exitUnlocked = contract.deliveredCount >= minReq;
  const headTitle = exitUnlocked
    ? t('EXTRACT AT PAD')
    : isSabotage
    ? t('RELAYS')
    : t('CARGO');

  const warn = contract.gateWarning;
  const warnHtml = warn
    ? `<div class="hud-card px-2.5 py-1.5 border-l-2 border-red-500 font-mono text-[10px] text-red-200 leading-tight">
         <div class="font-bold text-amber-300">↓ ${t(warn.gateLabel)} · ${warn.waitingAtCap ? t('6/6 ACTIVE') : warn.GateTimerText || (warn.gateTimer > 0 ? `${Math.ceil(warn.gateTimer)}s` : t('{n} PKT', { n: warn.remainingPackets }))}</div>
         <div class="truncate opacity-90">${(warn.previewUnits || []).map((unit) => t(unit)).join(' · ')}</div>
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
          <div class="font-bold text-sm uppercase text-white">${isSabotage ? t('ARMING CHARGE ON RELAY #{slot}', { slot: lc.slot }) : t('LOADING CARGO #{slot}', { slot: lc.slot })} (${t(lc.shortName)})</div>
          <div class="text-[10px] ${isSabotage ? 'text-purple-300' : 'text-sky-300'}">${t('HOLD TANK STILL · {sec}s REMAINING', { sec: (lc.duration - lc.progress).toFixed(1) })}</div>
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
        <span>${isSabotage ? t('PLANT DEMOLITION CHARGE #{slot} ({name}) — 2.5s', { slot: nc.slot, name: t(nc.shortName) }) : t('LOAD CARGO #{slot} ({name}) — 2.0s', { slot: nc.slot, name: t(nc.shortName) })}</span>
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
          <div class="font-bold text-sm uppercase text-white">💣 ${t('RELAY #{slot} ({name}) DETONATING IN {sec}s!', { slot: ac.slot, name: t(ac.shortName), sec: ac.fuseTimer.toFixed(1) })}</div>
          <div class="text-[10px] ${ac.inBlastZone ? 'text-amber-300 font-bold' : 'text-emerald-300'}">${ac.inBlastZone ? `⚠ ${t('DANGER: CLEAR THE RED 3-CELL BLAST RING IMMEDIATELY!')}` : `✓ ${t('SAFE DISTANCE REACHED — STAND BY FOR DETONATION (+$1,500)')}`}</div>
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
          <div class="font-bold text-sm uppercase text-white">${t('UNLOADING CARGO #{slot} (+$1,500)', { slot: uc.slot })}</div>
          <div class="text-[10px] text-amber-300">${t('HOLD STILL ON SOUTHERN DELIVERY PAD')} · ${(uc.unloadDuration - uc.unloadProgress).toFixed(1)}s</div>
        </div>
      </div>
    `);
  } else if (contract.carriedCargo) {
    actionsHtml.push(`
      <div class="bg-slate-900/95 border border-amber-400/80 px-3.5 py-1.5 rounded shadow-lg font-mono text-xs text-amber-200">
        ⛟ ${t('CARRYING CARGO #{slot} ({name}) → DRIVE SOUTH TO DELIVERY PAD', { slot: contract.carriedCargo.slot, name: t(contract.carriedCargo.shortName) })}
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
          <div class="font-bold text-sm uppercase text-white">${t('EXTRACTING FROM TERMINAL ({done}s / {total}s)', { done: ex.progress.toFixed(1), total: ex.duration.toFixed(1) })}</div>
          <div class="text-[10px] text-emerald-300">${t('STAY INSIDE DELIVERY PAD · COMBAT & MOVEMENT ALLOWED ON PAD')}</div>
        </div>
      </div>
    `);
  } else if (contract.canExtract) {
    const bonusText = contract.deliveredCount >= 3 ? t('+$5,500 EXTRACTION + 3/3 BONUS') : t('+$3,000 CONTRACT COMPLETION');
    actionsHtml.push(`
      <button
        data-action="contract-extract"
        class="pointer-events-auto cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-2 border-emerald-200 px-5 py-2.5 rounded shadow-2xl flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-wider"
      >
        <span class="px-2 py-0.5 rounded bg-slate-950 text-emerald-300 text-xs">[E]</span>
        <span>${t('EXTRACT NOW (3.0s)')} · ${bonusText}</span>
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

