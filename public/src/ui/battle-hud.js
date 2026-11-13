import { POWERUP, getMaxMissileAmmo } from '../game/constants.js';
import { renderPowerUpBadgeSvg } from '../game/icons.js';
import { GameStatus } from '../game/types.js';
import { setHidden, setHtml } from './dom-helpers.js';
import { renderTankSilhouette } from './tank-silhouette.js';

export function renderBattlefieldHud({
  state,
  hud,
  upgrades,
  currentSector,
  cameraLabels,
  hpPercent,
  isOverhealed,
  isLowHp,
}) {
  const topTelemetry = document.getElementById('top-telemetry');
  const topCompass = document.getElementById('top-compass');
  const topControls = document.getElementById('top-controls');
  const bossBanner = document.getElementById('boss-banner');
  const targetBadge = document.getElementById('target-badge');
  const statusToast = document.getElementById('status-toast');
  const modifiersStrip = document.getElementById('modifiers-strip');
  const bottomHud = document.getElementById('bottom-hud');

  // 1. Top-Left Telemetry (HULL HP, TURRET & Compact Sector Strip)
  const turretAzimuthDeg =
    ((Math.round((-(hud.playerTurretAngle || 0) * 180) / Math.PI + 180) % 360) + 360) % 360;

  if (topTelemetry) {
    const baseStatusColor = !hud.baseAlive
      ? 'text-red-400'
      : hud.inBaseRepairZone
      ? 'text-emerald-400'
      : 'text-amber-300';

    const baseStatusText = !hud.baseAlive
      ? 'OFFLINE'
      : hud.inBaseRepairZone
      ? 'REPAIR +3/s'
      : 'ONLINE';

    const enemyCitadelHtml = hud.enemyBaseAlive
      ? `<span>CITADEL <b class="text-red-400">${hud.enemyBaseHp}/${hud.enemyBaseMaxHp}</b></span>`
      : '';

    const activeHpSegs = isOverhealed
      ? 8
      : Math.max(0, Math.min(8, Math.ceil((hpPercent / 100) * 8)));
    const hpSegsHtml = Array.from(
      { length: 8 },
      (_, idx) => `<span class="${idx < activeHpSegs ? 'is-on' : ''}"></span>`
    ).join('');

    setHtml(topTelemetry, `
      <div class="hud-top-row">
        <div class="hud-card hud-hp-card${isLowHp ? ' is-low' : isOverhealed ? ' is-overhealed' : ''}">
          <div class="hud-icon-box" aria-hidden="true">
            <svg viewBox="0 0 36 22" width="32" height="20" fill="none">
              <path d="M5 12h24l3 4v3H3v-3l2-4z" fill="#4ade80" fill-opacity="0.25" stroke="#4ade80" stroke-width="1.4"/>
              <path d="M11 7h11l3 5H9l2-5z" fill="#4ade80" fill-opacity="0.45" stroke="#86efac" stroke-width="1.3"/>
              <path d="M22 9h12" stroke="#86efac" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div>
            <span class="hud-label">HULL HP</span>
            <div class="hud-hp-segs" aria-hidden="true">${hpSegsHtml}</div>
            <div class="hud-hp-val">${Math.ceil(hud.playerHp)} <small>/ ${hud.playerMaxHp}</small></div>
          </div>
        </div>
      </div>

      <div class="hud-card hud-sector-strip">
        <strong>${currentSector.code} · ${currentSector.name}</strong>
        <span>HOSTILES <b class="text-emerald-400">${hud.enemiesRemaining}/${hud.totalEnemiesInSector}</b></span>
        <span>CREDITS <b class="text-emerald-400">$${hud.credits ?? 0}</b></span>
        <span>BASE <b class="${baseStatusColor}">${baseStatusText}</b></span>
        ${enemyCitadelHtml}
      </div>
    `);
  }

  // 1b. Top-Center Live Compass
  if (topCompass) {
    const compassLabels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    const ticks = [];
    for (let offset = -75; offset <= 75; offset += 15) {
      const snapped = Math.round((turretAzimuthDeg + offset) / 15) * 15;
      const deg = ((snapped % 360) + 360) % 360;
      const diff = snapped - turretAzimuthDeg;
      const pct = 50 + (diff / 150) * 100;
      if (pct < 4 || pct > 96) continue;
      const lbl = compassLabels[deg] || (deg % 30 === 0 ? String(deg).padStart(3, '0') : '');
      const isCard = Boolean(compassLabels[deg]);
      const isNorth = deg === 0;
      ticks.push(
        `<span class="hud-compass-tick${isCard ? ' is-cardinal' : ''}${isNorth ? ' is-north' : ''}" style="left:${pct.toFixed(1)}%">${lbl || '&nbsp;'}<i></i></span>`
      );
    }
    setHtml(
      topCompass,
      `<div class="hud-card hud-compass"><div class="hud-compass-track">${ticks.join('')}</div><span class="hud-compass-pointer"></span></div>`
    );
  }

  // 2. Top-Right APS Badge & Compact Utility Controls
  if (topControls) {
    const apsTotal = hud.apsTotal ?? 0;
    const apsMax = hud.apsMaxAmmo ?? 0;
    const apsReady = apsTotal > 0 && !(hud.jammedTimer > 0);
    const apsStatusText = hud.jammedTimer > 0
      ? 'JAMMED'
      : apsMax <= 0
      ? 'NO APS'
      : apsReady
      ? `READY (${apsTotal}/${apsMax})`
      : 'DEPLETED';

    setHtml(topControls, `
      <div class="hud-card hud-aps-badge${apsReady ? '' : ' is-offline'}">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
          <path d="M12 3l7 3v5c0 4.8-3 8.6-7 10-4-1.4-7-5.2-7-10V6l7-3z" fill="${apsReady ? 'rgba(74, 222, 128, 0.2)' : 'rgba(100, 116, 139, 0.15)'}" stroke="${apsReady ? '#4ade80' : '#64748b'}" stroke-width="1.6"/>
          <path d="M9 12l2 2 4-4" stroke="${apsReady ? '#86efac' : '#64748b'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div>
          <span class="hud-label">APS</span>
          <div class="hud-aps-status">${apsStatusText}</div>
        </div>
      </div>

      <div class="hud-util-row">
        <button
          data-action="toggle-upgrades"
          class="flex items-center gap-1.5 bg-[#0B0F17]/95 hover:bg-slate-800 border ${
            hud.inBaseRepairZone
              ? 'border-teal-400 text-teal-300 ring-2 ring-teal-400/50 animate-pulse'
              : 'border-amber-500/60 text-amber-400'
          } px-2.5 py-1.5 rounded text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer"
          title="Allied Base Garage & Upgrades [U]"
        >
          <span>⚙</span>
          <span class="hidden sm:inline">GARAGE [U]</span>
        </button>

        <button
          data-action="cycle-camera"
          class="flex items-center gap-1 bg-[#0B0F17]/95 hover:bg-slate-800 border border-slate-700/70 px-2.5 py-1.5 rounded text-[11px] font-mono uppercase tracking-wider text-slate-200 transition-colors cursor-pointer"
          title="Cycle Camera Angle [C]"
        >
          <span class="text-amber-400">⌖</span>
          <span class="hidden lg:inline">${cameraLabels[state.cameraPreset]}</span>
        </button>

        <button
          data-action="toggle-sound"
          aria-pressed="${state.soundEnabled}"
          class="bg-[#0B0F17]/95 hover:bg-slate-800 border ${
            state.soundEnabled
              ? 'border-slate-700/70 text-slate-200 hover:text-white'
              : 'border-red-500/70 text-red-300 hover:text-red-200'
          } px-2 py-1.5 rounded text-[11px] font-mono transition-colors cursor-pointer"
          title="Toggle Combat Audio"
        >
          ${state.soundEnabled ? '🔊' : '🔇'}
        </button>

        ${
          hud.status === GameStatus.PLAYING || hud.status === GameStatus.PAUSED
            ? `<button
                data-action="toggle-pause"
                class="bg-[#0B0F17]/95 hover:bg-slate-800 border border-slate-700/70 px-2.5 py-1.5 rounded text-[11px] font-mono text-amber-400 hover:text-white transition-colors cursor-pointer"
                title="Pause [ESC / P]"
              >
                ${hud.status === GameStatus.PAUSED ? '▶' : '❚❚'}
              </button>`
            : ''
        }
      </div>
    `);
  }

  // 3. Boss Condition Banner
  if (bossBanner) {
    if (hud.bossActive) {
      setHidden(bossBanner, false);
      const cond = hud.bossCondition || 'INTACT';
      const condColor =
        cond === 'CRITICAL'
          ? 'text-red-400'
          : cond === 'DAMAGED'
          ? 'text-amber-400'
          : 'text-emerald-400';
      const hpPct = Math.max(0, Math.min(100, (hud.bossHp / Math.max(1, hud.bossMaxHp)) * 100));
      const shieldActive = (hud.bossPhaseShield || 0) > 0;
      const barColor = shieldActive
        ? 'bg-sky-400'
        : cond === 'CRITICAL'
        ? 'bg-red-500'
        : cond === 'DAMAGED'
        ? 'bg-amber-400'
        : 'bg-emerald-500';
      const phaseLabel = hud.bossPhaseLabel || 'PHASE 1';
      const phaseBadgeClass =
        phaseLabel === 'OVERLOAD'
          ? 'bg-red-500/20 text-red-300 border-red-500/60'
          : phaseLabel === 'PHASE 2'
          ? 'bg-amber-500/20 text-amber-300 border-amber-500/60'
          : 'bg-slate-800 text-slate-300 border-slate-600/70';
      const apsMax = hud.bossApsMaxCharges || 0;
      const apsCur = hud.bossApsCharges || 0;
      const apsPips = apsMax > 0
        ? Array.from({ length: apsMax }, (_, idx) =>
            idx < apsCur
              ? '<span class="text-cyan-400">●</span>'
              : '<span class="text-slate-600">○</span>'
          ).join('')
        : '';
      setHtml(bossBanner, `
        <div class="flex flex-col gap-1.5 text-xs font-mono uppercase tracking-wider">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-red-400 font-bold">
              <span>⚠ ${hud.bossName}</span>
              <span class="px-1.5 py-0.5 text-[10px] rounded border ${phaseBadgeClass}">${phaseLabel}</span>
            </div>
            <span class="font-bold ${condColor}">
              ${cond}${hud.aiDebugMode ? ` (${hud.bossHp}/${hud.bossMaxHp} HP)` : ''}
            </span>
          </div>
          <div class="w-full h-1.5 bg-slate-800 rounded overflow-hidden">
            <div class="h-full ${barColor} transition-all duration-150" style="width: ${hpPct.toFixed(1)}%"></div>
          </div>
          <div class="flex items-center justify-between text-[10px] text-slate-400">
            <span>${hud.bossTitle}</span>
            <div class="flex items-center gap-3">
              ${shieldActive ? `<span class="text-sky-300 font-bold">SHIELD ${hud.bossPhaseShield.toFixed(1)}s</span>` : ''}
              ${apsMax > 0 ? `<span>APS ${apsPips} <span class="text-cyan-300">${apsCur}/${apsMax}</span></span>` : ''}
            </div>
          </div>
        </div>
      `);
    } else {
      setHidden(bossBanner, true);
    }
  }

  // 3b. Observed Target Condition Badge
  if (targetBadge) {
    if (hud.status === GameStatus.PLAYING && hud.observedTarget) {
      setHidden(targetBadge, false);
      const t = hud.observedTarget;
      const condColor =
        t.condition === 'CRITICAL'
          ? 'text-red-400'
          : t.condition === 'DAMAGED'
          ? 'text-amber-400'
          : 'text-emerald-400';
      setHtml(targetBadge, `
        <span class="text-slate-300">${t.isPriority ? '⌖ PRIORITY TARGET: ' : 'TARGET: '}${t.name.toUpperCase()}</span>
        <span class="ml-2 font-bold ${condColor}">[${t.condition}]</span>
        ${t.aiState ? `<span class="ml-2 text-purple-300">AI: ${t.aiState.toUpperCase()}</span>` : ''}
        ${t.aiActions ? `<span class="ml-2 text-purple-300">${t.aiActions.move} / ${t.aiActions.shot}</span>` : ''}
      `);
    } else {
      setHidden(targetBadge, true);
    }
  }

  // 4. Status Toast
  if (statusToast) {
    if (hud.statusMessage) {
      setHidden(statusToast, false);
      if (statusToast.textContent !== hud.statusMessage) statusToast.textContent = hud.statusMessage;
    } else {
      setHidden(statusToast, true);
    }
  }

  // 5. Active Modifiers Strip
  if (modifiersStrip) {
    const items = [];
    if (hud.status === GameStatus.PLAYING) {
      if (hud.jammedTimer > 0) {
        items.push(`
          <div class="bg-purple-950/95 border border-purple-500/80 px-3.5 py-1.5 rounded flex items-center gap-2 text-xs font-mono text-purple-200 shadow-lg">
            <span>ECM JAMMING: APS & ATGM DISABLED (${hud.jammedTimer.toFixed(1)}s)</span>
          </div>
        `);
      }
      if (hud.empTimer > 0) {
        items.push(`
          <div class="bg-cyan-950/95 border border-cyan-500/80 px-3 py-1 rounded flex items-center gap-2 text-xs font-mono text-cyan-200 shadow-lg">
            ${renderPowerUpBadgeSvg(POWERUP.EMP, 26, false)}
            <span>EMP PULSE: HOSTILES STUNNED (${hud.empTimer.toFixed(1)}s)</span>
          </div>
        `);
      }
      if (hud.inBaseRepairZone && !state.showUpgradeDrawer) {
        items.push(`
          <div class="bg-teal-950/95 border border-teal-400 px-3.5 py-1.5 rounded flex items-center gap-2 text-xs font-mono text-teal-200 shadow-xl animate-pulse pointer-events-auto cursor-pointer" data-action="toggle-upgrades">
            <span class="px-1.5 py-0.5 bg-teal-400 text-slate-950 font-bold rounded">U</span>
            <span>BASE REPAIR BAY: PRESS [U] TO ENTER GARAGE & UPGRADE</span>
          </div>
        `);
      }
    }
    setHtml(modifiersStrip, items.join(''));
  }

  // 6. Bottom Docked Tactical HUD
  if (bottomHud) {
    if (state.hudCollapsed) {
      setHidden(bottomHud, true);
    } else {
      setHidden(bottomHud, false);
      const reloadRemaining = hud.playerFireCooldown || 0;
      const reloadMax = hud.playerMaxFireCooldown || 0.55;
      const reloadPct = reloadRemaining <= 0
        ? 100
        : Math.max(0, Math.min(100, Math.round((1 - reloadRemaining / reloadMax) * 100)));
      const reloadReady = reloadRemaining <= 0;
      const filledReloadSegs = reloadReady ? 8 : Math.max(0, Math.min(8, Math.floor((reloadPct / 100) * 8)));
      const reloadSegsHtml = Array.from(
        { length: 8 },
        (_, idx) => `<span class="${idx < filledReloadSegs ? 'is-filled' : ''}"></span>`
      ).join('');

      const cannonAmmo = hud.cannonAmmo ?? 15;
      const cannonMax = hud.cannonMaxAmmo ?? 15;

      const rk = hud.repairKitState;
      const rkLabel = rk?.channeling
        ? `REPAIRING ${(rk.channelDuration - rk.channelProgress).toFixed(1)}s`
        : rk?.cooldown > 0
        ? `CD ${rk.cooldown.toFixed(0)}s`
        : `RM-1 (${rk?.charges ?? 0})`;

      const smokeLabel =
        hud.smokeCooldown > 0
          ? `CD ${hud.smokeCooldown.toFixed(0)}s`
          : `SMOKE (${hud.smokeCharges ?? 2})`;

      const canFireMissile = hud.missileAmmo > 0 && hud.missileCooldown <= 0;

      if (!bottomHud.__sections) {
        bottomHud.innerHTML =
          '<div style="display: contents"></div><div class="hud-bottom-center"></div>';
        bottomHud.__sections = Array.from(bottomHud.children);
      }
      const [silhouetteSection, centerSection] = bottomHud.__sections;
      setHtml(silhouetteSection, renderTankSilhouette(hud));

      setHtml(centerSection, `
        <div class="flex flex-col items-center gap-1.5">
          <div class="flex flex-wrap items-center justify-center gap-2">
            <div class="hud-card hud-weapon-card">
              <div class="hud-ammo-block">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
                  <path d="M7 20V9l2-5 2 5v11H7zM13 20V9l2-5 2 5v11h-4z" fill="#cbd5e1" fill-opacity="0.85"/>
                </svg>
                <div>
                  <span class="hud-label">${hud.cannonName}</span>
                  <div class="hud-ammo-val"><span class="${cannonAmmo <= 5 ? 'text-amber-400 animate-pulse' : ''}">${cannonAmmo}</span> <small>/ ${cannonMax}</small></div>
                </div>
              </div>
              <div class="hud-reload-block">
                <span class="hud-label">RELOAD</span>
                <div class="hud-reload-row">
                  <div class="hud-reload-segs${reloadReady ? ' is-ready' : ''}" aria-hidden="true">${reloadSegsHtml}</div>
                  <span class="hud-reload-time">${cannonAmmo <= 0 ? 'EMPTY' : reloadReady ? 'READY' : `${reloadRemaining.toFixed(1)} s`}</span>
                </div>
              </div>
            </div>

            <div class="hud-card hud-modules-card">
              <button
                data-action="activate-module-slot"
                data-slot="1"
                class="px-2 py-1 rounded border border-emerald-500/60 bg-slate-900 hover:bg-emerald-950/60 text-emerald-300 cursor-pointer text-left font-mono text-[11px]"
                title="Activate RM-1 Field Repair Kit [Key 1]"
              >
                <div class="text-[8px] text-slate-400">[1]</div>
                <div class="font-bold">${rkLabel}</div>
              </button>

              <button
                data-action="activate-module-slot"
                data-slot="2"
                class="px-2 py-1 rounded border border-sky-500/60 bg-slate-900 hover:bg-sky-950/60 text-sky-300 cursor-pointer text-left font-mono text-[11px]"
                title="Deploy Aerosol Smoke Screen [Key 2]"
              >
                <div class="text-[8px] text-slate-400">[2]</div>
                <div class="font-bold">${smokeLabel}</div>
              </button>

              <button
                data-action="fire-missile"
                ${canFireMissile ? '' : 'disabled'}
                class="px-2 py-1 rounded border font-mono text-[11px] uppercase tracking-wider transition-colors flex items-center gap-1 ${
                  canFireMissile
                    ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-400 text-amber-300 cursor-pointer'
                    : 'bg-slate-900/80 border-slate-800 text-slate-500 cursor-not-allowed'
                }"
                title="Launch Homing ATGM Missile [Space]"
              >
                ${renderPowerUpBadgeSvg(POWERUP.MISSILE, 22, false)}
                <div class="text-left">
                  <div class="text-[8px] text-slate-400">[SPC] ATGM</div>
                  <div class="font-bold">${hud.missileAmmo}/${hud.missileMaxAmmo ?? getMaxMissileAmmo(upgrades.frame)}</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      `);
    }
  }
}

