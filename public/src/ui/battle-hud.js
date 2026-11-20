import { AIR_SUPPORT, POWERUP, getMaxMissileAmmo } from '../game/constants.js';
import { renderPowerUpBadgeSvg } from '../game/icons.js';
import { GameStatus } from '../game/types.js';
import { formatNumber, t } from '../i18n/index.js';
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

  // 1. Top-Left Telemetry (Compact Sector Strip)
  const turretAzimuthDeg =
    ((Math.round((-(hud.playerTurretAngle || 0) * 180) / Math.PI + 180) % 360) + 360) % 360;

  if (topTelemetry) {
    const totalHostiles = Math.max(0, hud.totalEnemiesInSector || 0);
    const remainingHostiles = Math.max(0, hud.enemiesRemaining || 0);
    const hostilesPct = totalHostiles > 0
      ? Math.max(0, Math.min(100, (remainingHostiles / totalHostiles) * 100))
      : 0;
    const creditsFormatted = formatNumber(hud.credits ?? 0);

    let enemyCitadelHtml = '';
    if (hud.enemyBaseAlive) {
      const citadelMax = Math.max(1, hud.enemyBaseMaxHp || 1);
      const citadelHp = Math.max(0, Math.ceil(hud.enemyBaseHp || 0));
      const citadelPct = Math.max(0, Math.min(100, (citadelHp / citadelMax) * 100));
      enemyCitadelHtml = `
        <div class="hud-sector-stat is-citadel">
          <span class="hud-label">${t('CITADEL')}</span>
          <div class="hud-sector-val text-red-400">${citadelHp}<small>/${citadelMax}</small></div>
          <div class="hud-sector-bar" aria-hidden="true"><span class="bg-red-400" style="width:${citadelPct.toFixed(1)}%"></span></div>
        </div>
      `;
    }

    const isCampaignSector =
      currentSector.gameMode !== 'contract' &&
      currentSector.gameMode !== 'survival' &&
      !currentSector.contractId;
    const sectorTitle = isCampaignSector
      ? t('MISSION {n}', { n: String(currentSector.id).padStart(2, '0') })
      : `${t(currentSector.code)} · ${t(currentSector.name)}`;

    setHtml(topTelemetry, `
      <div class="hud-card hud-sector-strip">
        <div class="hud-sector-head">
          <span class="hud-sector-pip" aria-hidden="true"></span>
          <strong>${sectorTitle}</strong>
        </div>
        <div class="hud-sector-metrics">
          <div class="hud-sector-stat">
            <span class="hud-label">${t('HOSTILES')}</span>
            <div class="hud-sector-val text-emerald-400">${remainingHostiles}<small>/${totalHostiles}</small></div>
            <div class="hud-sector-bar" aria-hidden="true"><span class="bg-emerald-400" style="width:${hostilesPct.toFixed(1)}%"></span></div>
          </div>
          <div class="hud-sector-stat">
            <span class="hud-label">${t('CREDITS')}</span>
            <div class="hud-sector-val text-emerald-400">$${creditsFormatted}</div>
          </div>
          ${enemyCitadelHtml}
        </div>
      </div>
    `);
  }

  // 1b. Top-Center Live Compass (quantized to 2° steps to avoid redundant DOM rebuilds)
  if (topCompass) {
    const compassHeading = Math.round(turretAzimuthDeg / 2) * 2;
    const compassLabels = { 0: t('N'), 45: t('NE'), 90: t('E'), 135: t('SE'), 180: t('S'), 225: t('SW'), 270: t('W'), 315: t('NW') };
    const ticks = [];
    for (let offset = -75; offset <= 75; offset += 15) {
      const snapped = Math.round((compassHeading + offset) / 15) * 15;
      const deg = ((snapped % 360) + 360) % 360;
      const diff = snapped - compassHeading;
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

  // 2. Top-Right Compact Utility Controls
  if (topControls) {
    setHtml(topControls, `
      <div class="hud-util-row">
        <button
          data-action="toggle-upgrades"
          class="flex items-center gap-1.5 bg-[#0B0F17]/95 hover:bg-slate-800 border ${
            hud.inBaseRepairZone
              ? 'border-teal-400 text-teal-300 ring-2 ring-teal-400/50 animate-pulse'
              : 'border-amber-500/60 text-amber-400'
          } px-2.5 py-1.5 rounded text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer"
          title="${t('Allied Base Garage & Upgrades [U]')}"
        >
          <span>⚙</span>
          <span class="hidden sm:inline">${t('GARAGE [U]')}</span>
        </button>

        <button
          data-action="cycle-camera"
          class="flex items-center gap-1.5 bg-[#0B0F17]/95 hover:bg-slate-800 border border-slate-700/70 px-2.5 py-1.5 rounded text-[11px] font-mono uppercase tracking-wider text-slate-200 transition-colors cursor-pointer"
          title="${t('Cycle Camera Angle [C]')}"
          aria-label="${t('Cycle Camera Angle [C]')}"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
            <circle cx="12" cy="13" r="3"/>
          </svg>
          <span class="hidden sm:inline">${t(cameraLabels[state.cameraPreset])} [C]</span>
        </button>

        <button
          data-action="toggle-missile-fpv"
          aria-pressed="${Boolean(state.missileFpvEnabled)}"
          class="flex items-center gap-1.5 bg-[#0B0F17]/95 hover:bg-slate-800 border ${
            state.missileFpvEnabled
              ? 'border-cyan-400 text-cyan-300 ring-1 ring-cyan-400/40'
              : 'border-slate-700/70 text-slate-300'
          } px-2.5 py-1.5 rounded text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer"
          title="${t('Missile Chase Camera [V]')}"
          aria-label="${t('Missile Chase Camera [V]')}"
        >
          <span>${t('FPV [V]')}</span>
        </button>

        <button
          data-action="toggle-sound"
          aria-pressed="${state.soundEnabled}"
          class="bg-[#0B0F17]/95 hover:bg-slate-800 border ${
            state.soundEnabled
              ? 'border-slate-700/70 text-slate-200 hover:text-white'
              : 'border-red-500/70 text-red-300 hover:text-red-200'
          } px-2 py-1.5 rounded text-[11px] font-mono transition-colors cursor-pointer"
          title="${t('Toggle Combat Audio')}"
        >
          ${state.soundEnabled ? '🔊' : '🔇'}
        </button>

        ${
          hud.status === GameStatus.PLAYING || hud.status === GameStatus.PAUSED
            ? `<button
                data-action="toggle-pause"
                class="bg-[#0B0F17]/95 hover:bg-slate-800 border border-slate-700/70 px-2.5 py-1.5 rounded text-[11px] font-mono text-amber-400 hover:text-white transition-colors cursor-pointer"
                title="${t('Pause [ESC / P]')}"
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
              <span class="px-1.5 py-0.5 text-[10px] rounded border ${phaseBadgeClass}">${t(phaseLabel)}</span>
            </div>
            <span class="font-bold ${condColor}">
              ${t(cond)}${hud.aiDebugMode ? ` (${hud.bossHp}/${hud.bossMaxHp} HP)` : ''}
            </span>
          </div>
          <div class="w-full h-1.5 bg-slate-800 rounded overflow-hidden">
            <div class="h-full ${barColor} transition-all duration-150" style="width: ${hpPct.toFixed(1)}%"></div>
          </div>
          <div class="flex items-center justify-between text-[10px] text-slate-400">
            <span>${t(hud.bossTitle)}</span>
            <div class="flex items-center gap-3">
              ${shieldActive ? `<span class="text-sky-300 font-bold">${t('SHIELD {sec}s', { sec: hud.bossPhaseShield.toFixed(1) })}</span>` : ''}
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
      const target = hud.observedTarget;
      const targetName = t(target.name).toUpperCase();
      const condColor =
        target.condition === 'CRITICAL'
          ? 'text-red-400'
          : target.condition === 'DAMAGED'
          ? 'text-amber-400'
          : 'text-emerald-400';
      setHtml(targetBadge, `
        <span class="text-slate-300">${target.isPriority ? t('⌖ PRIORITY TARGET: {name}', { name: targetName }) : t('TARGET: {name}', { name: targetName })}</span>
        <span class="ml-2 font-bold ${condColor}">[${t(target.condition)}]</span>
        ${target.aiState ? `<span class="ml-2 text-purple-300">AI: ${target.aiState.toUpperCase()}</span>` : ''}
        ${target.aiActions ? `<span class="ml-2 text-purple-300">${target.aiActions.move} / ${target.aiActions.shot}</span>` : ''}
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

  // 5. Active Modifiers Strip & Air Support Targeting Banner
  if (modifiersStrip) {
    const items = [];
    if (hud.airSupportTargeting) {
      const targeting = hud.airSupportTargeting;
      const credits = hud.credits ?? 0;
      const title =
        targeting.type === 'STRIKE'
          ? t('AIR STRIKE TARGETING — CLICK MAP TO STRIKE [RMB / ESC TO CANCEL]')
          : targeting.type === 'MINES'
          ? t('AIR MINES TARGETING — CLICK MAP TO DEPLOY [RMB / ESC TO CANCEL]')
          : t('AIR DROP TARGETING — CLICK MAP TO DROP [RMB / ESC TO CANCEL]');

      let variantHtml = '';
      if (targeting.type === 'STRIKE') {
        const variants = [
          AIR_SUPPORT.STRIKE_BOMBS,
          AIR_SUPPORT.STRIKE_THERMO,
          AIR_SUPPORT.STRIKE_AC130,
        ];
        variantHtml = `
          <div class="hud-air-variants">
            ${variants
              .map((v, idx) => {
                const active = targeting.strikeVariant === v.id;
                const affordable = credits >= v.cost;
                return `
                  <button
                    data-action="air-strike-variant"
                    data-variant="${v.id}"
                    ${affordable ? '' : 'disabled'}
                    class="hud-air-variant-btn${active ? ' is-active' : ''}${affordable ? '' : ' is-poor'}"
                  >
                    <span class="hud-mod-key">${idx + 1}</span>
                    <span>${t(v.label)}</span>
                    <strong>$${v.cost}</strong>
                  </button>
                `;
              })
              .join('')}
          </div>
        `;
      }

      const stripKey = `air|${targeting.type}|${targeting.strikeVariant}|${credits}`;
      if (modifiersStrip.__stripKey !== stripKey) {
        modifiersStrip.__stripKey = stripKey;
        setHtml(modifiersStrip, `
          <div class="hud-air-targeting-bar pointer-events-auto">
            <div class="hud-air-targeting-head">
              <span>${title}</span>
              <button data-action="air-support-cancel" class="hud-air-cancel-btn">${t('CANCEL')}</button>
            </div>
            ${variantHtml}
          </div>
        `);
      }
    } else if (hud.status === GameStatus.PLAYING) {
      if (hud.apsJammed) {
        items.push(`
          <div class="bg-purple-950/95 border border-purple-500/80 px-3.5 py-1.5 rounded flex items-center gap-2 text-xs font-mono text-purple-200 shadow-lg">
            <span>${t('ECM JAMMING: APS & ATGM DISRUPTED')}</span>
          </div>
        `);
      } else if (hud.radarJammed) {
        items.push(`
          <div class="bg-purple-950/95 border border-purple-500/70 px-3.5 py-1.5 rounded flex items-center gap-2 text-xs font-mono text-purple-200 shadow-lg">
            <span>${t('ECM RADAR INTERFERENCE')}</span>
          </div>
        `);
      }
      if (hud.empTimer > 0) {
        items.push(`
          <div class="bg-cyan-950/95 border border-cyan-500/80 px-3 py-1 rounded flex items-center gap-2 text-xs font-mono text-cyan-200 shadow-lg">
            ${renderPowerUpBadgeSvg(POWERUP.EMP, 26, false)}
            <span>${t('EMP PULSE: HOSTILES STUNNED ({sec}s)', { sec: hud.empTimer.toFixed(1) })}</span>
          </div>
        `);
      }
      if (hud.inBaseRepairZone && !state.showUpgradeDrawer) {
        items.push(`
          <div class="bg-teal-950/95 border border-teal-400 px-3.5 py-1.5 rounded flex items-center gap-2 text-xs font-mono text-teal-200 shadow-xl animate-pulse pointer-events-auto cursor-pointer" data-action="toggle-upgrades">
            <span class="px-1.5 py-0.5 bg-teal-400 text-slate-950 font-bold rounded">U</span>
            <span>${t('BASE REPAIR BAY: PRESS [U] TO ENTER GARAGE & UPGRADE')}</span>
          </div>
        `);
      }
      const html = items.join('');
      if (modifiersStrip.__stripKey !== html) {
        modifiersStrip.__stripKey = html;
        setHtml(modifiersStrip, html);
      }
    } else if (modifiersStrip.__stripKey !== '') {
      modifiersStrip.__stripKey = '';
      setHtml(modifiersStrip, '');
    }
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
      const rkCharges = rk?.charges ?? 0;
      const rkChanneling = Boolean(rk?.channeling);
      const rkOnCd = !rkChanneling && (rk?.cooldown || 0) > 0;
      const rkValue = rkChanneling
        ? `${Math.max(0, rk.channelDuration - rk.channelProgress).toFixed(1)}s`
        : rkOnCd
        ? `${Math.ceil(rk.cooldown)}s`
        : `${rkCharges}`;
      const rkStateClass = rkChanneling
        ? 'is-channeling animate-pulse'
        : rkOnCd
        ? 'is-cooldown'
        : rkCharges > 0
        ? 'tone-emerald is-ready'
        : 'is-empty';
      const rkIconColor = rkChanneling
        ? '#5eead4'
        : rkOnCd
        ? '#fbbf24'
        : rkCharges > 0
        ? '#34d399'
        : '#64748b';

      const smokeCharges = hud.smokeCharges ?? 2;
      const smokeOnCd = (hud.smokeCooldown || 0) > 0;
      const smokeValue = smokeOnCd ? `${Math.ceil(hud.smokeCooldown)}s` : `${smokeCharges}`;
      const smokeStateClass = smokeOnCd
        ? 'is-cooldown'
        : smokeCharges > 0
        ? 'tone-sky is-ready'
        : 'is-empty';
      const smokeIconColor = smokeOnCd ? '#fbbf24' : smokeCharges > 0 ? '#38bdf8' : '#64748b';

      const canFireMissile = hud.missileAmmo > 0 && hud.missileCooldown <= 0;
      const missileMax = hud.missileMaxAmmo ?? getMaxMissileAmmo(upgrades.frame);
      const missileStateClass = canFireMissile ? 'tone-amber is-ready' : 'is-empty';

      const apsTotal = hud.apsTotal ?? 0;
      const apsMax = hud.apsMaxAmmo ?? 0;
      const apsJammed = Boolean(hud.apsJammed);
      const apsReady = apsTotal > 0 && !apsJammed;
      const apsValueText = apsJammed
        ? t('JAM')
        : apsMax <= 0
        ? t('OFF')
        : `${apsTotal}<small>/${apsMax}</small>`;
      const apsStateClass = apsJammed
        ? 'is-jammed'
        : apsReady
        ? 'tone-emerald is-ready'
        : 'is-empty';
      const apsStroke = apsJammed ? '#c084fc' : apsReady ? '#4ade80' : '#64748b';
      const apsFill = apsJammed
        ? 'rgba(192, 132, 252, 0.18)'
        : apsReady
        ? 'rgba(74, 222, 128, 0.18)'
        : 'rgba(100, 116, 139, 0.15)';

      if (!bottomHud.__sections) {
        bottomHud.innerHTML =
          '<div style="display: contents"></div><div class="hud-bottom-center"></div>';
        bottomHud.__sections = Array.from(bottomHud.children);
      }
      const [silhouetteSection, centerSection] = bottomHud.__sections;
      const activeHpSegs = isOverhealed
        ? 8
        : Math.max(0, Math.min(8, Math.ceil((hpPercent / 100) * 8)));
      const hpSegsHtml = Array.from(
        { length: 8 },
        (_, idx) => `<span class="${idx < activeHpSegs ? 'is-on' : ''}"></span>`
      ).join('');
      const hpPctText = `${Math.max(0, Math.round(hpPercent))}%`;
      const hpPctColor = isLowHp ? 'text-red-400' : isOverhealed ? 'text-cyan-300' : 'text-emerald-400';
      const subKey = hud.subsystems
        ? Object.entries(hud.subsystems).map(([k, s]) => `${k}:${s?.status || 'normal'}`).join(',')
        : '';
      const silhouetteKey = `${Math.ceil(hud.playerHp)}|${hud.playerMaxHp}|${isLowHp}|${isOverhealed}|${subKey}`;
      if (silhouetteSection.__silhouetteKey !== silhouetteKey) {
        silhouetteSection.__silhouetteKey = silhouetteKey;
        setHtml(silhouetteSection, `
          <div class="hud-bottom-left">
            ${renderTankSilhouette(hud)}
            <div class="hud-card hud-hp-card${isLowHp ? ' is-low' : isOverhealed ? ' is-overhealed' : ''}">
              <div class="hud-icon-box" aria-hidden="true">
                <svg viewBox="0 0 36 22" width="34" height="22" fill="none">
                  <path d="M5 12h24l3 4v3H3v-3l2-4z" fill="#4ade80" fill-opacity="0.25" stroke="#4ade80" stroke-width="1.5"/>
                  <path d="M11 7h11l3 5H9l2-5z" fill="#4ade80" fill-opacity="0.45" stroke="#86efac" stroke-width="1.4"/>
                  <path d="M22 9h12" stroke="#86efac" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </div>
              <div class="hud-hp-body">
                <div class="hud-hp-head">
                  <span class="hud-label">${t('HULL HP')}</span>
                  <span class="hud-hp-pct ${hpPctColor}">${hpPctText}</span>
                </div>
                <div class="hud-hp-segs" aria-hidden="true">${hpSegsHtml}</div>
                <div class="hud-hp-val">${Math.ceil(hud.playerHp)} <small>/ ${hud.playerMaxHp}</small></div>
              </div>
            </div>
          </div>
        `);
      }

      const reloadText = cannonAmmo <= 0 ? t('EMPTY') : reloadReady ? t('READY') : `${reloadRemaining.toFixed(1)}s`;
      const reloadStatusClass = cannonAmmo <= 0 ? ' is-empty' : reloadReady ? ' is-ready' : ' is-charging';
      const credits = hud.credits ?? 0;
      const airTargetingType = hud.airSupportTargeting?.type || '';
      const canStrike = credits >= AIR_SUPPORT.STRIKE_BOMBS.cost;
      const canRepair = credits >= AIR_SUPPORT.REPAIR.cost;
      const canMines = credits >= AIR_SUPPORT.MINES.cost;
      const canDrop = credits >= AIR_SUPPORT.AIRDROP.cost;
      const staticKey = `${hud.cannonName}|${cannonAmmo}|${cannonMax}|${rkValue}|${rkStateClass}|${smokeValue}|${smokeStateClass}|${canFireMissile}|${hud.missileAmmo}|${missileMax}|${apsValueText}|${apsStateClass}|${canStrike}|${canRepair}|${canMines}|${canDrop}|${airTargetingType}`;

      if (centerSection.__staticKey === staticKey) {
        const segsEl = centerSection.querySelector('.hud-reload-segs');
        const timeEl = centerSection.querySelector('.hud-reload-time');
        if (segsEl && timeEl) {
          segsEl.className = `hud-reload-segs${reloadReady ? ' is-ready' : ''}`;
          for (let idx = 0; idx < segsEl.children.length; idx += 1) {
            segsEl.children[idx].className = idx < filledReloadSegs ? 'is-filled' : '';
          }
          timeEl.className = `hud-reload-time${reloadStatusClass}`;
          if (timeEl.textContent !== reloadText) {
            timeEl.textContent = reloadText;
          }
          return;
        }
      }
      centerSection.__staticKey = staticKey;

      const airButtons = [
        {
          type: 'STRIKE',
          key: '5',
          label: t('AIR STRIKE'),
          cost: `${AIR_SUPPORT.STRIKE_BOMBS.cost}+`,
          ready: canStrike,
          active: airTargetingType === 'STRIKE',
          tone: 'tone-red',
          title: t('Call Air Strike (Bombs, Thermobaric, AC-130) [Key 5]'),
        },
        {
          type: 'REPAIR',
          key: '6',
          label: t('AIR REPAIR'),
          cost: `${AIR_SUPPORT.REPAIR.cost}`,
          ready: canRepair,
          active: false,
          tone: 'tone-teal',
          title: t('Call Repair Drone (+20 HP & Fix Modules) [Key 6]'),
        },
        {
          type: 'MINES',
          key: '7',
          label: t('AIR MINES'),
          cost: `${AIR_SUPPORT.MINES.cost}`,
          ready: canMines,
          active: airTargetingType === 'MINES',
          tone: 'tone-amber',
          title: t('Call Carpet Air Mines [Key 7]'),
        },
        {
          type: 'AIRDROP',
          key: '8',
          label: t('AIR DROP'),
          cost: `${AIR_SUPPORT.AIRDROP.cost}`,
          ready: canDrop,
          active: airTargetingType === 'AIRDROP',
          tone: 'tone-emerald',
          title: t('Call Supply Air Drop [Key 8]'),
        },
      ];

      setHtml(centerSection, `
        <div class="flex flex-col items-center gap-1.5">
          <div class="hud-card hud-air-support-card">
            ${airButtons
              .map(
                (b) => `
                  <button
                    data-action="air-support-select"
                    data-air-type="${b.type}"
                    ${b.ready ? '' : 'disabled'}
                    class="hud-air-btn ${b.tone}${b.ready ? ' is-ready' : ' is-empty'}${b.active ? ' is-active' : ''}"
                    title="${b.title}"
                  >
                    <span class="hud-mod-key">${b.key}</span>
                    <span class="hud-air-name">${b.label}</span>
                    <span class="hud-air-cost">$${b.cost}</span>
                  </button>
                `
              )
              .join('')}
          </div>
          <div class="flex flex-wrap items-center justify-center gap-2">
            <div class="hud-card hud-weapon-card">
              <div class="hud-ammo-block">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
                  <path d="M7 20V9l2-5 2 5v11H7zM13 20V9l2-5 2 5v11h-4z" fill="#cbd5e1" fill-opacity="0.9"/>
                </svg>
                <div>
                  <span class="hud-label">${t(hud.cannonName)}</span>
                  <div class="hud-ammo-val"><span class="${cannonAmmo <= 5 ? 'text-amber-400 animate-pulse' : ''}">${cannonAmmo}</span> <small>/ ${cannonMax}</small></div>
                </div>
              </div>
              <div class="hud-reload-block">
                <span class="hud-label">${t('RELOAD')}</span>
                <div class="hud-reload-row">
                  <div class="hud-reload-segs${reloadReady ? ' is-ready' : ''}" aria-hidden="true">${reloadSegsHtml}</div>
                  <span class="hud-reload-time${reloadStatusClass}">${reloadText}</span>
                </div>
              </div>
            </div>

            <div class="hud-card hud-modules-card">
              <button
                data-action="activate-module-slot"
                data-slot="1"
                class="hud-mod-tile ${rkStateClass}"
                title="${t('Activate RM-1 Field Repair Kit [Key 1]')}"
              >
                <div class="hud-mod-top">
                  <span class="hud-mod-key">1</span>
                  <span class="hud-mod-name">${t('REPAIR')}</span>
                </div>
                <div class="hud-mod-val-row">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                    <path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5V4z" fill="${rkIconColor}" fill-opacity="0.22" stroke="${rkIconColor}" stroke-width="1.8" stroke-linejoin="round"/>
                  </svg>
                  <span class="hud-mod-val">${rkValue}</span>
                </div>
              </button>

              <button
                data-action="activate-module-slot"
                data-slot="2"
                class="hud-mod-tile ${smokeStateClass}"
                title="${t('Deploy Aerosol Smoke Screen [Key 2]')}"
              >
                <div class="hud-mod-top">
                  <span class="hud-mod-key">2</span>
                  <span class="hud-mod-name">${t('SMOKE')}</span>
                </div>
                <div class="hud-mod-val-row">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                    <path d="M6.5 18h11a3.5 3.5 0 0 0 .4-6.98A5 5 0 0 0 8.2 9.5 3.5 3.5 0 0 0 6.5 18z" fill="${smokeIconColor}" fill-opacity="0.22" stroke="${smokeIconColor}" stroke-width="1.8" stroke-linejoin="round"/>
                  </svg>
                  <span class="hud-mod-val">${smokeValue}</span>
                </div>
              </button>

              <button
                data-action="fire-missile"
                ${canFireMissile ? '' : 'disabled'}
                class="hud-mod-tile ${missileStateClass}"
                title="${t('Launch Homing ATGM Missile [Space]')}"
              >
                <div class="hud-mod-top">
                  <span class="hud-mod-key">SPC</span>
                  <span class="hud-mod-name">ATGM</span>
                </div>
                <div class="hud-mod-val-row">
                  ${renderPowerUpBadgeSvg(POWERUP.MISSILE, 16, false)}
                  <span class="hud-mod-val">${hud.missileAmmo}<small>/${missileMax}</small></span>
                </div>
              </button>

              <div
                class="hud-mod-tile is-passive ${apsStateClass}"
                title="${t('Active Protection System (Automatic)')}"
              >
                <div class="hud-mod-top">
                  <span class="hud-mod-key is-auto">${t('AUTO')}</span>
                  <span class="hud-mod-name">APS</span>
                </div>
                <div class="hud-mod-val-row">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                    <path d="M12 3l7 3v5c0 4.8-3 8.6-7 10-4-1.4-7-5.2-7-10V6l7-3z" fill="${apsFill}" stroke="${apsStroke}" stroke-width="1.8"/>
                    <path d="M9 12l2 2 4-4" stroke="${apsStroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <span class="hud-mod-val">${apsValueText}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      `);
    }
  }
}

