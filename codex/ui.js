/** Codex screen: catalog tabs, item list, configurator and specs for the 3D Codex studio. */
import { CODEX_CATEGORIES, CODEX_ITEMS } from './catalog.js';
import { computeTankStats } from '../public/src/game/constants.js';
import { CANNONS, CHASSIS, FRAMES, ENGINES, ARMORS, OPTIONAL_EQUIPMENT, PLAYER_UPGRADES } from '../public/src/game/components/index.js';
import { renderPowerUpBadgeSvg, renderTrackBadgeSvg } from '../public/src/game/icons.js';
import { SECTORS } from '../public/src/game/levels.js';
import { PLAYER_TANK_CONFIG } from '../public/src/game/tanks.js';
import { GameStatus } from '../public/src/game/types.js';

export function renderCodex(state, selectedItem) {
  const categoryItems = CODEX_ITEMS.filter(
    (item) => item.category === state.codexCategory
  );

  const tabsHtml = CODEX_CATEGORIES.map((cat) => {
    const count = CODEX_ITEMS.filter((i) => i.category === cat.id).length;
    const isActive = state.codexCategory === cat.id;
    return `
      <button
        data-action="select-codex-category"
        data-category="${cat.id}"
        class="codex-tab ${isActive ? 'active' : ''}"
      >
        <span class="text-teal-400">${cat.icon}</span>
        <span>${cat.label}</span>
        <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">${count}</span>
      </button>
    `;
  }).join('');

  const listHtml = categoryItems
    .map((item) => {
      const isSelected = item.id === selectedItem.id;
      const leadingIconHtml = item.powerupType
        ? renderPowerUpBadgeSvg(item.powerupType, 38, false)
        : `<span
            class="w-2.5 h-2.5 rounded-xs shrink-0"
            style="background-color: ${item.accentHex}"
          ></span>`;

      return `
        <button
          data-action="select-codex-item"
          data-item-id="${item.id}"
          class="codex-item-btn ${isSelected ? 'active' : ''}"
        >
          <div class="flex items-center gap-2.5 overflow-hidden">
            ${leadingIconHtml}
            <div class="overflow-hidden">
              <div class="font-mono text-xs font-bold text-slate-100 leading-tight">
                ${item.name}
              </div>
              <div class="text-[10px] font-mono text-slate-400 leading-tight mt-0.5">
                ${item.role}
              </div>
            </div>
          </div>
          <span class="font-mono text-[9px] px-1.5 py-0.5 bg-slate-900 border border-slate-700/70 text-slate-300 rounded shrink-0">
            ${item.code}
          </span>
        </button>
      `;
    })
    .join('');

  let configuratorHtml = '';
  let powerupGalleryHtml = '';
  let specsToRender = selectedItem.specs || [];

  if (selectedItem.previewType === 'PLAYER_TANK') {
    const u = state.codexPreviewUpgrades;
    const previewStats = computeTankStats({
      gun: PLAYER_UPGRADES.cannon[(u.cannon || 1) - 1] || CANNONS.CANNON_Mk1,
      chassis: PLAYER_UPGRADES.chassis[(u.chassis || 1) - 1] || CHASSIS.CH1,
      frame: PLAYER_UPGRADES.frame[(u.frame || 1) - 1] || FRAMES.F1,
      engine: PLAYER_UPGRADES.engine[(u.engine || 1) - 1] || ENGINES.E1,
      armor: PLAYER_UPGRADES.armor[(u.armor || 1) - 1] || ARMORS.A1,
      optionalEquipment: u.missile ? [OPTIONAL_EQUIPMENT.ROCKET_LAUNCHER] : [],
    }, PLAYER_TANK_CONFIG.base);

    specsToRender = [
      { label: 'Max Hull HP', value: `${previewStats.maxHP} HP (${PLAYER_TANK_CONFIG.base.hp} HP base hull)` },
      { label: 'Combat Mass', value: `${previewStats.totalMass} t` },
      {
        label: 'Firepower / Reload',
        value: `${previewStats.damage} DMG · ${previewStats.fireCooldown.toFixed(2)}s${previewStats.barrels === 2 ? ' (ALT-2×)' : ''} / ${previewStats.penetration}% PEN`,
      },
      {
        label: 'Armor / Speed',
        value: `${previewStats.armor}% / ${previewStats.moveSpeed.toFixed(1)} c/s`,
      },
    ];

    const tierTracks = [
      { key: 'cannon', label: 'CANNON', roman: ['I', 'II', 'III', 'IV', 'V'] },
      { key: 'chassis', label: 'CHASSIS', prefix: 'CH' },
      { key: 'frame', label: 'FRAME', prefix: 'F' },
      { key: 'engine', label: 'ENGINE', prefix: 'E' },
      { key: 'armor', label: 'ARMOR', prefix: 'A' },
    ];

    const rowsHtml = tierTracks
      .map((t) => {
        const cur = u[t.key] || 1;
        const btns = [1, 2, 3, 4, 5]
          .map(
            (lvl) => `
              <button
                data-action="codex-set-upgrade"
                data-track="${t.key}"
                data-val="${lvl}"
                class="codex-tier-btn ${cur === lvl ? 'active' : ''}"
              >
                ${t.roman ? t.roman[lvl - 1] : `${t.prefix}${lvl}`}
              </button>
            `
          )
          .join('');
        return `
          <div class="codex-tier-row">
            <div class="flex items-center gap-2">
              ${renderTrackBadgeSvg(t.key, 22)}
              <span class="font-mono text-[10px] font-bold text-slate-200">${t.label}</span>
            </div>
            <div class="flex gap-1">${btns}</div>
          </div>
        `;
      })
      .join('');

    configuratorHtml = `
      <div class="mt-3 pt-3 border-t border-slate-800">
        <div class="flex items-center justify-between mb-2">
          <span class="font-mono text-[10px] uppercase tracking-wider text-amber-400 font-bold">
            5×5 COMPONENT CONFIGURATOR
          </span>
          <div class="flex gap-1">
            <button
              data-action="codex-preset-stock"
              class="text-[9px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
            >
              TIER 1 STOCK
            </button>
            <button
              data-action="codex-preset-max"
              class="text-[9px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/50 cursor-pointer"
            >
              TIER 5 MAX
            </button>
          </div>
        </div>
        <div class="flex flex-col gap-1.5">${rowsHtml}</div>
        <div class="mt-2 pt-1.5 border-t border-slate-800/80">
          <div class="font-mono text-[9px] uppercase tracking-wider text-teal-400 mb-1">
            STANDALONE MODULES (NON-LEVELED ENTITIES):
          </div>
          <div class="mb-1.5 px-2 py-1 rounded bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-between font-mono text-[10px]">
            <span class="text-emerald-300 font-bold">PLAYER LIFE PACK (EXCLUSIVE)</span>
            <span class="text-emerald-400 font-bold">+40 HP EQUIPPED</span>
          </div>
          <div class="grid grid-cols-2 gap-1.5">
            <button
              data-action="codex-set-upgrade"
              data-track="aps"
              class="codex-tier-btn py-1.5 flex items-center justify-center gap-1.5 ${
                u.aps ? 'active' : ''
              }"
            >
              <span>APS MODULE: ${u.aps ? 'ON' : 'OFF'}</span>
            </button>
            <button
              data-action="codex-set-upgrade"
              data-track="missile"
              class="codex-tier-btn py-1.5 flex items-center justify-center gap-1.5 ${
                u.missile ? 'active' : ''
              }"
            >
              <span>ATGM MODULE: ${u.missile ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  if (selectedItem.category === 'POWERUPS') {
    const allPowerupItems = CODEX_ITEMS.filter(
      (i) => i.category === 'POWERUPS'
    );
    const badgesGrid = allPowerupItems
      .map((pItem) => {
        const active = pItem.id === selectedItem.id;
        return `
          <button
            data-action="select-codex-item"
            data-item-id="${pItem.id}"
            title="${pItem.name} (${pItem.code})"
            class="p-1.5 rounded border flex flex-col items-center justify-center transition-all cursor-pointer ${
              active
                ? 'bg-amber-500/20 border-amber-400'
                : 'bg-slate-900/90 border-slate-800 hover:border-slate-600'
            }"
          >
            ${renderPowerUpBadgeSvg(pItem.powerupType, 42, true)}
          </button>
        `;
      })
      .join('');

    powerupGalleryHtml = `
      <div class="mt-3 pt-3 border-t border-slate-800">
        <div class="font-mono text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-2">
          ALL 10 BATTLEFIELD TROPHIES (CLICK TO INSPECT):
        </div>
        <div class="grid grid-cols-5 gap-1.5">${badgesGrid}</div>
      </div>
    `;
  }

  const specsHtml = specsToRender
    .map(
      (s) => `
        <div class="codex-spec-card">
          <span class="block font-mono text-[9px] uppercase tracking-wider text-slate-400">
            ${s.label}
          </span>
          <span class="font-mono text-xs font-bold text-slate-100 mt-0.5 block">
            ${s.value}
          </span>
        </div>
      `
    )
    .join('');

  let deployActionHtml = '';
  if (
    !SECTORS[state.hud.sectorId]?.encounters?.length &&
    state.hud.status !== GameStatus.MENU &&
    selectedItem.previewType === 'ENEMY_TANK' &&
    !selectedItem.isBoss &&
    selectedItem.enemyClass
  ) {
    deployActionHtml = `
      <button
        data-action="spawn-enemy"
        data-enemy="${selectedItem.enemyClass}"
        class="w-full mt-3 py-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer"
      >
        ▶ DEPLOY THIS HOSTILE IN ARENA
      </button>
    `;
  } else if (
    !SECTORS[state.hud.sectorId]?.encounters?.length &&
    state.hud.status !== GameStatus.MENU &&
    selectedItem.previewType === 'POWERUP' &&
    selectedItem.powerupType
  ) {
    deployActionHtml = `
      <button
        data-action="spawn-powerup"
        data-powerup="${selectedItem.powerupType}"
        class="w-full mt-3 py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer"
      >
        ▶ DROP THIS TROPHY IN ARENA
      </button>
    `;
  }

  const inspectorHeroBadgeHtml = selectedItem.powerupType
    ? `
      <div class="flex items-center gap-3 p-2.5 mb-3 bg-slate-900/95 border border-slate-800 rounded">
        ${renderPowerUpBadgeSvg(selectedItem.powerupType, 62, true)}
        <div>
          <span class="text-[10px] font-mono uppercase tracking-wider text-teal-400 block">
            BATTLEFIELD TROPHY EMBLEM
          </span>
          <h3 class="text-base font-bold uppercase tracking-wider text-white leading-tight">
            ${selectedItem.name}
          </h3>
          <span class="text-[11px] font-mono text-amber-400">
            ${selectedItem.subtitle}
          </span>
        </div>
      </div>
    `
    : `
      <h3 class="text-lg font-bold uppercase tracking-wider text-white">
        ${selectedItem.name}
      </h3>
      <div class="text-xs font-mono text-amber-400 mb-2.5">
        ${selectedItem.subtitle}
      </div>
    `;

  return `
    <div class="codex-header">
      <div>
        <div class="text-[10px] font-mono uppercase tracking-[0.18em] text-teal-400">
          BATTLE TANK // INTERACTIVE 3D ENCYCLOPEDIA & PROVING GROUNDS
        </div>
        <h2 class="text-lg font-bold tracking-wider uppercase text-white">
          TACTICAL CODEX (${CODEX_ITEMS.length} 3D SPECIMENS)
        </h2>
      </div>

      <div class="codex-tabs">
        ${tabsHtml}
      </div>

      <span class="px-3 py-1.5 bg-slate-900/90 text-teal-400 border border-teal-500/40 rounded font-mono text-[11px] uppercase tracking-wider font-bold">
        STANDALONE 3D CODEX
      </span>
    </div>

    <div class="codex-body">
      <aside class="codex-sidebar">
        <div class="px-3 py-2.5 border-b border-slate-800 flex items-center justify-between">
          <span class="font-mono text-[10px] uppercase tracking-wider text-slate-400 font-bold">
            SELECT 3D SPECIMEN
          </span>
          <span class="font-mono text-[10px] text-teal-400">
            ${categoryItems.length} ITEMS
          </span>
        </div>
        <div class="codex-sidebar-list">
          ${listHtml}
        </div>
      </aside>

      <aside class="codex-inspector">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span
            class="font-mono text-[10px] font-bold px-2 py-0.5 rounded uppercase"
            style="background-color: ${selectedItem.accentHex}22; color: ${selectedItem.accentHex}; border: 1px solid ${selectedItem.accentHex}66"
          >
            ${selectedItem.code}
          </span>
          <span class="font-mono text-[11px] text-slate-400">
            ${selectedItem.role || selectedItem.badge || ''}
          </span>
        </div>

        ${inspectorHeroBadgeHtml}

        <p class="text-xs text-slate-300 leading-relaxed mb-3">
          ${selectedItem.description || selectedItem.summary || ''}
        </p>

        <div class="mb-3">
          <div class="font-mono text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 font-bold">
            TECHNICAL TELEMETRY
          </div>
          <div class="codex-spec-grid">
            ${specsHtml}
          </div>
        </div>

        <div class="p-2.5 bg-slate-900/90 border border-slate-800 rounded">
          <span class="block font-mono text-[9px] uppercase tracking-wider text-teal-400 font-bold mb-0.5">
            TACTICAL FIELD NOTES
          </span>
          <p class="text-[11px] text-slate-300 leading-relaxed">
            ${selectedItem.tacticalNotes || selectedItem.description || selectedItem.summary || ''}
          </p>
        </div>

        ${configuratorHtml}
        ${powerupGalleryHtml}
        ${deployActionHtml}
      </aside>
    </div>

    <div class="codex-footer">
      <div class="font-mono text-[11px] text-slate-300 flex items-center gap-2">
        <span class="text-teal-400 font-bold">3D TURNTABLE:</span>
        <span>DRAG MOUSE ON STAGE TO ROTATE 360°</span>
      </div>

      <button
        data-action="codex-toggle-rotate"
        class="px-3 py-1.5 rounded font-mono text-xs uppercase tracking-wider border transition-colors cursor-pointer ${
          state.codexAutoRotate
            ? 'bg-teal-950/90 border-teal-400 text-teal-300'
            : 'bg-slate-900 border-slate-700 text-slate-400'
        }"
      >
        ⟳ AUTO-ROTATE: ${state.codexAutoRotate ? 'ON' : 'OFF'}
      </button>

      <button
        data-action="codex-trigger-demo"
        class="px-3.5 py-1.5 rounded font-mono text-xs uppercase tracking-wider font-bold bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-400 transition-colors cursor-pointer"
      >
        ⚡ TEST FIRE / TRIGGER EFFECT [SPACE]
      </button>
    </div>
  `;
}
