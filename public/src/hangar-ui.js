import { effectiveUpgradeTiers, componentRepairCost } from './sim/component-damage.js';
import { PLAYER_UPGRADES } from './game/components/index.js';
import { computeTankStats, APS, MISSILE, CANNON_AMMO, getMaxApsAmmo, getMaxMissileAmmo, getMaxCannonAmmo } from './game/constants.js';
import { renderTrackBadgeSvg } from './game/icons.js';
import { PLAYER_TANK_CONFIG } from './game/tanks.js';

export const HANGAR_TRACKS = [
  { key: 'cannon', label: 'Cannon', role: 'Firepower', summary: 'Hit harder. Defeat heavier armor.' },
  { key: 'chassis', label: 'Chassis', role: 'Mobility', summary: 'Improve traction and cross difficult terrain.' },
  { key: 'frame', label: 'Frame', role: 'Structure', summary: 'Strengthen the foundation of your tank.' },
  { key: 'engine', label: 'Engine', role: 'Powerplant', summary: 'Move heavy armor with greater power.' },
  { key: 'armor', label: 'Armor', role: 'Protection', summary: 'Reduce incoming damage and survive longer.' },
];

const money = value => Math.round(value).toLocaleString('en-US');
const number = value => Number(value.toFixed(2)).toString();
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function hangarStats(upgrades, missileAmmo = 0) {
  const part = key => PLAYER_UPGRADES[key][(upgrades[key] || 1) - 1];
  return computeTankStats({
    gun: part('cannon'),
    chassis: part('chassis'),
    frame: part('frame'),
    engine: part('engine'),
    armor: part('armor'),
    optionalEquipment: missileAmmo > 0 ? ['ROCKET_LAUNCHER'] : [],
  }, PLAYER_TANK_CONFIG.base);
}

export function renderHangar(hud, upgrades, selected = 'cannon', view = 'front', feedback = '') {
  const track = HANGAR_TRACKS.find(item => item.key === selected) || HANGAR_TRACKS[0];
  const tier = upgrades[track.key] || 1;
  const maxed = tier >= 5;
  const current = PLAYER_UPGRADES[track.key][tier - 1];
  const next = PLAYER_UPGRADES[track.key][Math.min(tier, 4)];
  const credits = hud.credits ?? 0;
  const cost = (hud.trackUpgradeCosts || { 2: 300, 3: 750, 4: 1500, 5: 3000 })[tier + 1] || 0;
  const apsPrice = APS.CHARGE_CREDIT_PRICE || 1000;
  const apsTotal = hud.apsTotal ?? 0;
  const purchasedFrame = upgrades.frame || 1;
  const apsMax = hud.apsMaxAmmo ?? getMaxApsAmmo(purchasedFrame);
  const missileTotal = hud.missileAmmo || 0;
  const missileMax = hud.missileMaxAmmo ?? getMaxMissileAmmo(purchasedFrame);
  const cannonTotal = hud.cannonAmmo ?? 15;
  const cannonMax = hud.cannonMaxAmmo ?? getMaxCannonAmmo(purchasedFrame);

  const supplyRow = (kind, label, count, max, price, action, amountLabel = '+1') => {
    const full = count >= max;
    const affordable = credits >= price;
    const pct = max > 0 ? Math.min(100, Math.round((count / max) * 100)) : 0;
    const icon = kind === 'aps'
      ? '<path d="M12 2.5L20 5.5V11.5C20 16.5 16.5 20 12 22C7.5 20 4 16.5 4 11.5V5.5Z"/><path d="M8 12L11 15L16.5 9"/>'
      : kind === 'missile'
      ? '<path d="M12 2.5C8 6 8 12 9 15.5H15C16 12 16 6 12 2.5Z"/><path d="M9 12L5 16.5V19.5L10 17M15 12L19 16.5V19.5L14 17M10.5 19L12 22L13.5 19"/>'
      : '<path d="M9 19V9L12 3L15 9V19H9Z"/><path d="M8 19H16"/>';
    const glyph = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${icon}</svg>`;
    return `
      <div class="garage-supply-row supply-${kind} ${full ? 'is-full' : ''}">
        <span class="garage-supply-icon">${glyph}</span>
        <div class="garage-supply-info">
          <div class="garage-supply-meta">
            <strong>${label}</strong>
            <span>${count}<small>/${max}</small></span>
          </div>
          <div class="garage-supply-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
        </div>
        <button
          class="garage-supply-btn"
          data-action="${action}"
          ${full || !affordable ? 'disabled' : ''}
          aria-label="${full ? `${label} full` : `Buy ${amountLabel} ${label} for ${price} credits${affordable ? '' : ', not enough credits'}`}"
        >
          ${full ? 'FULL' : `${amountLabel} · $${money(price)}`}
        </button>
      </div>
    `;
  };

  const faults = hud.componentDamage || {};
  const damaged = Boolean(faults[track.key]);
  const repairCost = componentRepairCost(tier);
  const before = hangarStats(effectiveUpgradeTiers(upgrades, faults), hud.missileAmmo);
  const after = hangarStats(effectiveUpgradeTiers({ ...upgrades, [track.key]: Math.min(5, tier + 1) }, faults), hud.missileAmmo);
  before.apsMaxAmmo = getMaxApsAmmo(purchasedFrame);
  after.apsMaxAmmo = getMaxApsAmmo(Math.min(5, purchasedFrame + 1));
  before.missileMaxAmmo = getMaxMissileAmmo(purchasedFrame);
  after.missileMaxAmmo = getMaxMissileAmmo(Math.min(5, purchasedFrame + 1));
  before.cannonMaxAmmo = getMaxCannonAmmo(purchasedFrame);
  after.cannonMaxAmmo = getMaxCannonAmmo(Math.min(5, purchasedFrame + 1));

  const metrics = {
    cannon: [['Damage', 'damage', '', false], ['Penetration', 'penetration', '%', false], ['Reload', 'fireCooldown', ' s', true]],
    chassis: [['Travel speed', 'moveSpeed', ' c/s', false], ['Total mass', 'totalMass', ' t', true]],
    frame: [['Durability', 'maxHP', ' HP', false], ['APS cap', 'apsMaxAmmo', '', false], ['ATGM cap', 'missileMaxAmmo', '', false], ['Shells cap', 'cannonMaxAmmo', '', false], ['Total mass', 'totalMass', ' t', true]],
    engine: [['Travel speed', 'moveSpeed', ' c/s', false], ['Total mass', 'totalMass', ' t', true]],
    armor: [['Damage reduction', 'armor', '%', false], ['Durability', 'maxHP', ' HP', false], ['Total mass', 'totalMass', ' t', true]],
  }[track.key];

  const comparison = metrics.map(([label, key, unit, lower]) => {
    const delta = after[key] - before[key];
    const good = lower ? delta < 0 : delta > 0;
    return `<div class="hangar-stat-row"><span>${label}</span><span>${number(before[key])}${unit}</span><b class="${delta ? (good ? 'positive' : 'tradeoff') : ''}">${maxed ? '—' : `${number(after[key])}${unit}`}</b></div>`;
  }).join('');

  const bars = level => `<span class="hangar-tier-bars" aria-label="Tier ${level} of 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= level ? 'filled' : ''}"></i>`).join('')}</span>`;

  return `
    <aside class="garage-sidebar" aria-label="Garage upgrades and supplies">
      <div class="garage-sidebar-head">
        <div class="garage-brand">
          <h1>GARAGE</h1>
          <span class="garage-status-pill">${hud.isHangarPaused ? 'PAUSED' : 'SERVICE BAY'}</span>
        </div>
        <div class="garage-wallet">
          <span>CREDITS</span>
          <strong>$${money(credits)}</strong>
        </div>
      </div>

      <nav class="garage-tabs" aria-label="Tank upgrade systems">
        ${HANGAR_TRACKS.map(item => {
          const level = upgrades[item.key] || 1;
          const isFaulted = Boolean(faults[item.key]);
          return `
            <button
              class="hangar-system ${item.key === track.key ? 'is-selected' : ''} ${isFaulted ? 'is-faulted' : ''}"
              data-action="hangar-select"
              data-track="${item.key}"
              aria-pressed="${item.key === track.key}"
            >
              ${renderTrackBadgeSvg(item.key, 24)}
              <span class="garage-tab-name">${item.label}</span>
              <span class="garage-tab-tier">${level}/5</span>
              ${bars(level)}
            </button>
          `;
        }).join('')}
      </nav>

      <div class="garage-component-panel">
        <div class="garage-component-head">
          <div>
            <span class="garage-eyebrow">${escape(track.role)} · ${maxed ? 'MAXED' : `TIER ${tier} → ${tier + 1}`}</span>
            <h2>${escape(track.label)}</h2>
          </div>
          <span class="garage-current-badge">INSTALLED: ${escape(current.name)}</span>
        </div>

        <div class="garage-next-card">
          <div class="garage-next-title">
            <span>${maxed ? 'MAX SPECIFICATION' : `NEXT: ${escape(next.name)}`}</span>
          </div>
          <p class="garage-next-desc">${escape(maxed ? track.summary : next.description)}</p>
        </div>

        ${damaged ? `
          <div class="component-repair">
            <div class="garage-repair-row">
              <strong>${escape(track.label)} damaged (Tier ${tier} → ${Math.max(1, tier - 1)})</strong>
              <button data-action="repair-component" data-track="${track.key}" ${credits < repairCost ? 'disabled' : ''}>
                ${credits < repairCost ? `Need $${money(repairCost)}` : `Repair · $${money(repairCost)}`}
              </button>
            </div>
          </div>
        ` : ''}

        <div class="hangar-comparison">
          <div class="hangar-stat-row hangar-stat-heading"><span>STAT</span><span>NOW</span><span>AFTER</span></div>
          ${comparison}
          ${track.key === 'chassis' ? `<div class="hangar-capability">${after.canCrossWater ? '✓ Water crossing' : 'Land traversal'} · ${after.allTerrain ? 'All-terrain traction' : 'Standard traction'}</div>` : ''}
        </div>

        <div class="hangar-purchase">
          <button class="hangar-buy" data-action="upgrade-track" data-track="${track.key}" ${maxed || credits < cost ? 'disabled' : ''}>
            <span>${maxed ? 'System complete' : credits < cost ? `Need $${money(cost - credits)} more` : `Install upgrade · $${money(cost)}`}</span>
            <span class="hangar-buy-arrow" aria-hidden="true">${maxed ? '✓' : '↗'}</span>
          </button>
          ${feedback ? `<div class="hangar-feedback" role="status" aria-live="polite">${escape(feedback)}</div>` : ''}
        </div>
      </div>

      <section class="garage-supplies" aria-label="Buy ammunition and charges">
        <div class="garage-supplies-head">
          <span>AMMUNITION &amp; CHARGES</span>
        </div>
        <div class="garage-supply-list">
          ${supplyRow('cannon', 'Shells', cannonTotal, cannonMax, CANNON_AMMO.CREDIT_PRICE_PER_PACK, 'buy-cannon-ammo', `+${CANNON_AMMO.SHELLS_PER_PACK}`)}
          ${supplyRow('aps', 'APS', apsTotal, apsMax, apsPrice, 'buy-aps-charge', '+1')}
          ${supplyRow('missile', 'Missile', missileTotal, missileMax, MISSILE.CREDIT_PRICE, 'buy-missile', '+1')}
        </div>
      </section>
    </aside>

    <section class="hangar-visual" aria-label="Player tank in the garage">
      <div class="hangar-stage-window"></div>
      <div class="garage-stage-top">
        <div class="hangar-vehicle-label">
          <span class="hangar-eyebrow">ASSIGNED VEHICLE</span>
          <h2>PLAYER <span>MBT</span></h2>
        </div>
        <button class="hangar-exit" data-action="toggle-upgrades" aria-label="Close garage">
          ${hud.isHangarPaused ? 'Return to battle' : 'Back to operations'} <kbd>ESC</kbd>
        </button>
      </div>
      <div class="garage-stage-bottom">
        <div class="hangar-view-controls" aria-label="Tank viewing angle">
          ${['front', 'side', 'rear'].map(item => `<button data-action="hangar-view" data-view="${item}" aria-pressed="${view === item}" class="${view === item ? 'is-selected' : ''}">${item === 'front' ? 'Overview' : item === 'side' ? 'Side view' : 'Rear view'}</button>`).join('')}
        </div>
        <div class="garage-loadout-pill" aria-label="Current tank summary">
          <span>HP <b>${number(before.maxHP)}</b></span>
          <span>DMG <b>${number(before.damage)}</b></span>
          <span>ARM <b>${number(before.armor)}%</b></span>
          <span>MASS <b>${number(before.totalMass)}t</b></span>
        </div>
      </div>
    </section>
  `;
}
