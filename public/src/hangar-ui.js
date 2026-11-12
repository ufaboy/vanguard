import { effectiveUpgradeTiers, componentRepairCost } from './sim/component-damage.js';
import { PLAYER_UPGRADES } from './game/components/index.js';
import { computeTankStats, APS, MISSILE, getMaxApsAmmo, getMaxMissileAmmo } from './game/constants.js';
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
  return computeTankStats({ gun: part('cannon'), chassis: part('chassis'), frame: part('frame'),
    engine: part('engine'), armor: part('armor'), optionalEquipment: missileAmmo > 0 ? ['ROCKET_LAUNCHER'] : [] }, PLAYER_TANK_CONFIG.base);
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
  const supplyCard = (kind, label, count, max, price, action) => {
    const full = count >= max;
    const affordable = credits >= price;
    const icon = kind === 'aps'
      ? '<path d="M24 5L40 11V23C40 33 33 40 24 44C15 40 8 33 8 23V11Z"/><path d="M16 24L22 30L33 18"/>'
      : '<path d="M24 5C16 12 16 24 18 31H30C32 24 32 12 24 5Z"/><path d="M18 24L10 33V39L20 34M30 24L38 33V39L28 34M21 38L24 44L27 38"/><circle cx="24" cy="19" r="4"/>';
    const glyph = `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${icon}</svg>`;
    return `<article class="hangar-supply-card supply-${kind} ${full ? 'is-full' : ''}">
      <div class="hangar-supply-heading"><span class="hangar-supply-icon">${glyph}</span><div><h3>${label}</h3><strong>${count}<small> / ${max}</small></strong></div></div>
      <div class="hangar-supply-slots" role="img" aria-label="${count} of ${max} ${label} loaded">${Array.from({ length: max }, (_, i) => `<span class="${i < count ? 'is-loaded' : i === count && !full ? 'is-next' : ''}" aria-hidden="true">${i < count ? glyph : i === count && !full ? '+' : ''}</span>`).join('')}</div>
      <button class="hangar-supply-buy" data-action="${action}" ${full || !affordable ? 'disabled' : ''} aria-label="${full ? `${label} full` : `Buy one ${label} for ${price} credits${affordable ? '' : ', not enough credits'}`}">
        <span class="hangar-supply-add">${full ? '✓' : '+1'}${full ? '' : glyph}</span><span class="hangar-supply-price">${full ? 'FULL' : `<span aria-hidden="true" class="hangar-credit-coin">$</span> ${money(price)}`}</span>
      </button><small class="hangar-supply-hint">${full ? 'Ready!' : !affordable ? `Need $ ${money(price - credits)} more` : 'Add one'}</small>
    </article>`;
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
  const metrics = {
    cannon: [['Damage', 'damage', '', false], ['Penetration', 'penetration', '%', false], ['Reload', 'fireCooldown', ' s', true]],
    chassis: [['Travel speed', 'moveSpeed', ' cells/s', false], ['Total mass', 'totalMass', ' t', true]],
    frame: [['Durability', 'maxHP', ' HP', false], ['APS capacity', 'apsMaxAmmo', '', false], ['Missile capacity', 'missileMaxAmmo', '', false], ['Total mass', 'totalMass', ' t', true], ['Travel speed', 'moveSpeed', ' cells/s', false]],
    engine: [['Travel speed', 'moveSpeed', ' cells/s', false], ['Total mass', 'totalMass', ' t', true]],
    armor: [['Damage reduction', 'armor', '%', false], ['Durability', 'maxHP', ' HP', false], ['Total mass', 'totalMass', ' t', true]],
  }[track.key];
  const comparison = metrics.map(([label, key, unit, lower]) => {
    const delta = after[key] - before[key];
    const good = lower ? delta < 0 : delta > 0;
    return `<div class="hangar-stat-row"><span>${label}</span><span>${number(before[key])}${unit}</span><b class="${delta ? good ? 'positive' : 'tradeoff' : ''}">${maxed ? '—' : `${number(after[key])}${unit}`}</b></div>`;
  }).join('');
  const bars = level => `<span class="hangar-tier-bars" aria-label="Tier ${level} of 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= level ? 'filled' : ''}"></i>`).join('')}</span>`;
  return `
    <header class="hangar-header">
      <div class="hangar-heading"><span class="hangar-eyebrow">IRON VANGUARD / ENGINEERING DIVISION</span><h1>Hangar <span>04</span></h1></div>
      <div class="hangar-wallet"><span>AVAILABLE CREDITS</span><strong>$ ${money(credits)}</strong></div>
      <button class="hangar-exit" data-action="toggle-upgrades" aria-label="Close hangar">${hud.isHangarPaused ? 'Return to battle' : 'Back to operations'} <kbd>ESC</kbd></button>
    </header>
    <nav class="hangar-systems" aria-label="Tank upgrade systems"><div class="hangar-section-label">UPGRADE SYSTEMS <span>05</span></div>
      ${HANGAR_TRACKS.map(item => { const level = upgrades[item.key] || 1; return `<button class="hangar-system ${item.key === track.key ? 'is-selected' : ''}" data-action="hangar-select" data-track="${item.key}" aria-pressed="${item.key === track.key}">
        ${renderTrackBadgeSvg(item.key, 38)}<span class="hangar-system-copy"><strong>${item.label}</strong><small>${faults[item.key] ? 'DAMAGED · -1 TIER' : item.role}</small>${bars(level)}</span><b>${level}<small>/5</small></b></button>`; }).join('')}
      <div class="hangar-service-note"><i></i><span>SERVICE BAY ACTIVE<small>${hud.isHangarPaused ? 'Battlefield paused' : 'Ready for refit'}</small></span></div>
    </nav>
    <section class="hangar-visual" aria-label="Player tank in the maintenance workshop">
      <div class="hangar-stage-window"></div>
      <div class="hangar-vehicle-label"><span class="hangar-eyebrow">ASSIGNED VEHICLE</span><h2>PLAYER <span>MBT</span></h2><p>Heavy armor. Built your way.</p></div>
      <div class="hangar-view-controls" aria-label="Tank viewing angle">${['front', 'side', 'rear'].map(item => `<button data-action="hangar-view" data-view="${item}" aria-pressed="${view === item}" class="${view === item ? 'is-selected' : ''}">${item === 'front' ? 'Overview' : item === 'side' ? 'Side view' : 'Rear view'}</button>`).join('')}</div>
      <span class="hangar-bay-stamp">BAY 04 <i></i> VEHICLE SECURED</span>
    </section>
    <aside class="hangar-upgrade-panel" aria-label="Upgrades and ammunition">
        <section class="hangar-supplies" aria-label="Buy ammunition"><h2>Stock up</h2><div class="hangar-supply-grid">
          ${supplyCard('aps', 'APS', apsTotal, apsMax, apsPrice, 'buy-aps-charge')}
          ${supplyCard('missile', 'Missile', missileTotal, missileMax, MISSILE.CREDIT_PRICE, 'buy-missile')}
        </div></section>
      <div class="hangar-upgrade-content">
      <div class="hangar-section-label">${escape(track.role)} <span>${maxed ? 'COMPLETE' : `TIER ${tier} → ${tier + 1}`}</span></div>
      <h2>${escape(track.label)} upgrade</h2><p class="hangar-summary">${escape(track.summary)}</p>
      ${damaged ? `<div class="component-repair"><strong>${escape(track.label)} damaged · Tier ${tier} → ${Math.max(1, tier - 1)}</strong><p>Purchased tier is retained. Base healing does not repair this fault. Use a repair kit or repair here.</p><button data-action="repair-component" data-track="${track.key}" ${credits < repairCost ? 'disabled' : ''}>${credits < repairCost ? `Repair requires $ ${money(repairCost)}` : `Repair component · $ ${money(repairCost)}`}</button></div>` : ''}
      <div class="hangar-installed"><span>INSTALLED · TIER ${tier}</span><strong>${escape(current.name)}</strong></div>
      <div class="hangar-next"><span>${maxed ? 'FULLY UPGRADED' : `NEXT UPGRADE · TIER ${tier + 1}`}</span><h3>${escape(next.name)}</h3><details class="hangar-technical"><summary>Technical details</summary><p>${escape(next.description)}</p></details></div>
      <div class="hangar-comparison"><div class="hangar-stat-row hangar-stat-heading"><span>PERFORMANCE</span><span>NOW</span><span>AFTER</span></div>${comparison}
        ${track.key === 'chassis' ? `<div class="hangar-capability">${after.canCrossWater ? '✓ Water crossing' : 'Land traversal'} · ${after.allTerrain ? 'All-terrain traction' : 'Standard traction'}</div>` : ''}
      </div>
      </div>
      <div class="hangar-purchase"><div class="hangar-cost"><span>${maxed ? 'All five tiers installed' : 'Upgrade cost'}</span><strong>${maxed ? 'MAX TIER' : `$ ${money(cost)}`}</strong></div>
        <button class="hangar-buy" data-action="upgrade-track" data-track="${track.key}" ${maxed || credits < cost ? 'disabled' : ''}>${maxed ? 'System complete' : credits < cost ? `Need $ ${money(cost - credits)} more` : `Install upgrade · $ ${money(cost)}`} <span aria-hidden="true">↗</span></button>
        <p class="hangar-purchase-note">${maxed ? 'This system is at its highest specification.' : 'Permanent upgrade. Existing damage still requires repair.'}</p>

        <div class="hangar-feedback" role="status" aria-live="polite">${escape(feedback)}</div>
      </div>
    </aside>
    <footer class="hangar-overview"><div class="hangar-section-label">VEHICLE OVERVIEW<small>Current loadout</small></div>
      <div><span>DURABILITY</span><strong>${number(before.maxHP)} <small>HP</small></strong></div>
      <div><span>FIREPOWER</span><strong>${number(before.damage)} <small>DMG</small></strong></div>
      <div><span>ARMOR</span><strong>${number(before.armor)}<small>%</small></strong></div>
      <div><span>COMBAT MASS</span><strong>${number(before.totalMass)} <small>t</small></strong></div>
      <div class="hangar-equipment">
        <span>SUPPORT EQUIPMENT</span>
        <strong>APS <small>${apsTotal}/${apsMax} charges</small></strong>
        <p>ATGM · ${missileTotal}/${missileMax} missiles</p>

      </div>
    </footer>`;
}
