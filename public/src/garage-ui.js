import { effectiveUpgradeTiers, componentRepairCost } from './sim/component-damage.js';
import {
  HQ_TREE_BRANCHES,
  HQ_TREE_MAX_LEVEL,
  HQ_TREE_NODES,
  canUpgradeHqNode,
  createDefaultHqTree,
  getHqBonuses,
  getHqNodeLevel,
} from './sim/hq-tree.js';
import { PLAYER_UPGRADES } from './game/components/index.js';
import {
  APS,
  CANNON_AMMO,
  MISSILE,
  RADAR_RANGE_CELLS,
  computeTankStats,
  getMaxApsAmmo,
  getMaxCannonAmmo,
  getMaxMissileAmmo,
} from './game/constants.js';
import { DRONE_CONFIGS } from './game/vehicles/drones.js';
import { PLAYER_TANK_CONFIG } from './game/vehicles/tanks.js';
import { N_, formatNumber, t } from './i18n/index.js';

export const GARAGE_TRACKS = [
  { key: 'cannon', label: N_('Cannon'), role: N_('Firepower'), summary: N_('Hit harder. Defeat heavier armor.') },
  { key: 'chassis', label: N_('Chassis'), role: N_('Mobility'), summary: N_('Improve traction and cross difficult terrain.') },
  { key: 'frame', label: N_('Frame'), role: N_('Structure'), summary: N_('Strengthen the foundation of your tank.') },
  { key: 'engine', label: N_('Engine'), role: N_('Powerplant'), summary: N_('Move heavy armor with greater power.') },
  { key: 'armor', label: N_('Armor'), role: N_('Protection'), summary: N_('Reduce incoming damage and survive longer.') },
  { key: 'radar', label: N_('Radar'), role: N_('Sensors'), summary: N_('Detect enemies at longer range, even behind obstacles.') },
];

const money = value => formatNumber(Math.round(value));
const number = value => Number(value.toFixed(2)).toString();
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function garageStats(upgrades, missileAmmo = 0) {
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

export function renderGarage(hud, upgrades, selected = 'cannon', view = 'front', feedback = '') {
  const isHqTab = selected === 'hq';
  const isComponentsTab = !isHqTab;
  const track = GARAGE_TRACKS.find(item => item.key === selected) || GARAGE_TRACKS[0];
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
  const apsOwned = Boolean(hud.apsOwned);
  const atgmOwned = Boolean(hud.atgmOwned);
  const reconDroneOwned = Boolean(hud.reconDroneOwned);
  const apsModulePrice = APS.MODULE_CREDIT_PRICE || 3000;
  const atgmModulePrice = MISSILE.MODULE_CREDIT_PRICE || 3500;
  const reconDronePrice = DRONE_CONFIGS.RECON_DRONE.creditPrice;
  const radarRangeCells = hud.radarRangeCells ?? RADAR_RANGE_CELLS;

  const faults = hud.componentDamage || {};
  const damaged = Boolean(faults[track.key]);
  const repairCost = componentRepairCost(tier);
  const before = garageStats(effectiveUpgradeTiers(upgrades, faults), hud.missileAmmo);
  const after = garageStats(effectiveUpgradeTiers({ ...upgrades, [track.key]: Math.min(5, tier + 1) }, faults), hud.missileAmmo);
  before.apsMaxAmmo = getMaxApsAmmo(purchasedFrame);
  after.apsMaxAmmo = getMaxApsAmmo(Math.min(5, purchasedFrame + 1));
  before.missileMaxAmmo = getMaxMissileAmmo(purchasedFrame);
  after.missileMaxAmmo = getMaxMissileAmmo(Math.min(5, purchasedFrame + 1));
  before.cannonMaxAmmo = getMaxCannonAmmo(purchasedFrame);
  after.cannonMaxAmmo = getMaxCannonAmmo(Math.min(5, purchasedFrame + 1));

  const bars = level => `<span class="garage-tier-bars" aria-label="${t('Tier {n} of 5', { n: level })}">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= level ? 'filled' : ''}"></i>`).join('')}</span>`;
  const hqTree = hud.hqTree || createDefaultHqTree();
  const hqBonuses = getHqBonuses(hqTree);
  const effUpgradesBefore = effectiveUpgradeTiers(upgrades, faults);
  const effUpgradesAfter = effectiveUpgradeTiers({ ...upgrades, [track.key]: Math.min(5, tier + 1) }, faults);
  const radarBeforeSpec = PLAYER_UPGRADES.radar[(effUpgradesBefore.radar || 1) - 1];
  const radarAfterSpec = PLAYER_UPGRADES.radar[(effUpgradesAfter.radar || 1) - 1];
  const radarRangeBefore = (radarBeforeSpec?.radarRangeCells ?? RADAR_RANGE_CELLS) + (hqBonuses.radarBonusCells || 0);
  const radarRangeAfter = (radarAfterSpec?.radarRangeCells ?? RADAR_RANGE_CELLS) + (hqBonuses.radarBonusCells || 0);
  const throughCoverBefore = radarBeforeSpec?.throughObstacleCells || 0;
  const throughCoverAfter = radarAfterSpec?.throughObstacleCells || 0;
  const hqTotalLevels = HQ_TREE_NODES.reduce((sum, n) => sum + getHqNodeLevel(hqTree, n.id), 0);
  const hqMaxLevels = HQ_TREE_NODES.length * HQ_TREE_MAX_LEVEL;
  const profileMode = hud.profileMode || 'campaign';
  const playerRankId = hud.playerRankId || 'recruit';

  const supplyCard = (kind, sourceLabel, count, max, unitPrice, packSize, action, amountLabel) => {
    const label = t(sourceLabel);
    const full = count >= max;
    const affordable = credits >= unitPrice;
    const pct = max > 0 ? Math.min(100, Math.round((count / max) * 100)) : 0;
    const icon = kind === 'aps'
      ? '<path d="M12 2.5L20 5.5V11.5C20 16.5 16.5 20 12 22C7.5 20 4 16.5 4 11.5V5.5Z"/><path d="M8 12L11 15L16.5 9"/>'
      : kind === 'missile'
      ? '<path d="M12 2.5C8 6 8 12 9 15.5H15C16 12 16 6 12 2.5Z"/><path d="M9 12L5 16.5V19.5L10 17M15 12L19 16.5V19.5L14 17M10.5 19L12 22L13.5 19"/>'
      : kind === 'recon'
      ? '<circle cx="12" cy="12" r="2.5"/><path d="M5 5l3.5 3.5M19 5l-3.5 3.5M5 19l3.5-3.5M19 19l-3.5-3.5"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>'
      : '<path d="M9 19V9L12 3L15 9V19H9Z"/><path d="M8 19H16"/>';
    const glyph = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${icon}</svg>`;

    if (kind === 'recon' || (kind === 'aps' && !apsOwned) || (kind === 'missile' && !atgmOwned)) {
      const modOwned = kind === 'recon' ? full : false;
      const modPrice = kind === 'aps' ? apsModulePrice : kind === 'missile' ? atgmModulePrice : unitPrice;
      const modAction = kind === 'aps' ? 'buy-aps-module' : kind === 'missile' ? 'buy-atgm-module' : action;
      const modAffordable = credits >= modPrice;
      return `
        <div class="garage-supply-card supply-${kind} ${modOwned ? 'is-full' : ''}">
          <div class="garage-supply-card-top">
            <span class="garage-supply-icon">${glyph}</span>
            <div class="garage-supply-title-wrap">
              <strong>${label}</strong>
              <span class="garage-supply-sub">${modOwned ? t('INSTALLED') : t('NOT INSTALLED')}</span>
            </div>
            <button
              class="garage-supply-btn"
              data-action="${modAction}"
              ${modOwned || !modAffordable ? 'disabled' : ''}
            >
              ${modOwned ? t('INSTALLED') : `<span class="garage-supply-plus" aria-hidden="true">+</span><span>$${money(modPrice)}</span>`}
            </button>
          </div>
        </div>
      `;
    }

    const missing = Math.max(0, max - count);
    const neededPacks = Math.ceil(missing / packSize);
    const affordablePacks = Math.floor(credits / unitPrice);
    const maxPacks = Math.min(neededPacks, affordablePacks);
    const maxCost = maxPacks * unitPrice;

    return `
      <div class="garage-supply-card supply-${kind} ${full ? 'is-full' : ''}">
        <div class="garage-supply-card-top">
          <span class="garage-supply-icon">${glyph}</span>
          <div class="garage-supply-title-wrap">
            <strong>${label}</strong>
            <span class="garage-supply-count">${count} <small>/ ${max}</small></span>
          </div>
          <div class="garage-supply-actions">
            ${full
              ? `<span class="garage-row-max">✓ ${t('FULL')}</span>`
              : neededPacks <= 1
              ? `
                <button
                  class="garage-supply-btn"
                  data-action="${action}"
                  ${!affordable ? 'disabled' : ''}
                >
                  ${amountLabel} · $${money(unitPrice)}
                </button>
              `
              : `
                <button
                  class="garage-supply-btn"
                  data-action="${action}"
                  ${!affordable ? 'disabled' : ''}
                >
                  ${amountLabel} · $${money(unitPrice)}
                </button>
                <button
                  class="garage-supply-btn is-max"
                  data-action="buy-max-supply"
                  data-kind="${kind}"
                  ${maxPacks <= 0 ? 'disabled' : ''}
                >
                  ${t('BUY MAX')} · $${money(maxCost)}
                </button>
              `}
          </div>
        </div>
        <div class="garage-supply-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
      </div>
    `;
  };

  const componentsPanelHtml = `
    <nav class="garage-tabs" aria-label="${t('Tank upgrade systems')}">
      ${GARAGE_TRACKS.map(item => {
        const level = upgrades[item.key] || 1;
        const isFaulted = Boolean(faults[item.key]);
        const itemMaxed = level >= 5;
        const itemCost = (hud.trackUpgradeCosts || { 2: 300, 3: 750, 4: 1500, 5: 3000 })[level + 1] || 0;
        const itemRepairCost = componentRepairCost(level);
        const canBuy = !itemMaxed && credits >= itemCost;
        const canRepair = isFaulted && credits >= itemRepairCost;

        const actionBtn = isFaulted
          ? `<button type="button" class="garage-row-btn is-repair" data-action="repair-component" data-track="${item.key}" ${canRepair ? '' : 'disabled'}>${t('Repair')} · $${money(itemRepairCost)}</button>`
          : itemMaxed
          ? `<span class="garage-row-max">✓ ${t('MAX')}</span>`
          : `<button type="button" class="garage-row-btn" data-action="upgrade-track" data-track="${item.key}" ${canBuy ? '' : 'disabled'} aria-label="${t('UPGRADE')} · $${money(itemCost)}"><span class="garage-row-plus" aria-hidden="true">+</span><span>$${money(itemCost)}</span></button>`;

        return `
          <div
            class="garage-system ${item.key === track.key ? 'is-selected' : ''} ${isFaulted ? 'is-faulted' : ''}"
            data-action="garage-select"
            data-track="${item.key}"
            role="button"
            tabindex="0"
            aria-pressed="${item.key === track.key}"
          >
            <div class="garage-tab-info">
              <div class="garage-tab-top">
                <span class="garage-tab-name">${t(item.label)}</span>
              </div>
              ${bars(level)}
            </div>
            ${actionBtn}
          </div>
        `;
      }).join('')}
    </nav>
  `;

  const suppliesSectionHtml = `
    <section class="garage-supplies-panel" aria-label="${t('AMMUNITION &amp; CHARGES')}">
      <div class="garage-supplies-head">
        <span>${t('AMMUNITION &amp; CHARGES')}</span>
      </div>
      <div class="garage-supply-list">
        ${supplyCard('cannon', N_('Shells'), cannonTotal, cannonMax, CANNON_AMMO.CREDIT_PRICE_PER_PACK, CANNON_AMMO.SHELLS_PER_PACK, 'buy-cannon-ammo', `+${CANNON_AMMO.SHELLS_PER_PACK}`)}
        ${supplyCard('aps', N_('APS'), apsTotal, apsMax, apsPrice, 1, 'buy-aps-charge', '+1')}
        ${supplyCard('missile', N_('Missile'), missileTotal, missileMax, MISSILE.CREDIT_PRICE, 1, 'buy-missile', '+1')}
        ${supplyCard('recon', N_('Recon Drone'), reconDroneOwned ? 1 : 0, 1, reconDronePrice, 1, 'buy-recon-drone', t('BUY'))}
      </div>
    </section>
  `;

  const hqPanelHtml = `
    <div class="garage-hq-panel">
      <div class="garage-component-head">
        <div>
          <span class="garage-eyebrow">${t('COMMAND CENTER')} · ${t('{n} / {max} LVL', { n: hqTotalLevels, max: hqMaxLevels })}</span>
          <h2>${t('HQ COMMAND')}</h2>
        </div>
      </div>
      <div class="garage-hq-branches">
        ${HQ_TREE_BRANCHES.map(branch => {
          const nodes = HQ_TREE_NODES.filter(n => n.branch === branch.id);
          return `
            <section class="garage-hq-branch">
              <h3 class="garage-hq-branch-title">${escape(t(branch.label))}</h3>
              <div class="garage-hq-nodes">
                ${nodes.map(node => {
                  const lvl = getHqNodeLevel(hqTree, node.id);
                  const maxedNode = lvl >= HQ_TREE_MAX_LEVEL;
                  const currSpec = node.levels[lvl - 1];
                  const nextSpec = maxedNode ? null : node.levels[lvl];
                  const check = canUpgradeHqNode({
                    hqTree,
                    nodeId: node.id,
                    credits,
                    playerRankId,
                    profileMode,
                  });
                  const pips = [1, 2, 3].map(i => `<i class="${i <= lvl ? 'filled' : ''}"></i>`).join('');
                  const btnLabel = maxedNode
                    ? t('MAX')
                    : check.cost != null
                    ? `$${money(check.cost)}`
                    : '—';
                  return `
                    <div class="garage-hq-node ${maxedNode ? 'is-maxed' : ''}">
                      <div class="garage-hq-node-head">
                        <strong>${escape(t(node.name))}</strong>
                        <span class="garage-hq-lvl">LV ${lvl}/${HQ_TREE_MAX_LEVEL}</span>
                      </div>
                      <div class="garage-hq-pips" aria-hidden="true">${pips}</div>
                      <div class="garage-hq-effect">${escape(t(currSpec.label))}</div>
                      ${nextSpec ? `<div class="garage-hq-next">${t('Next')}: ${escape(t(nextSpec.label))}</div>` : ''}
                      <button
                        type="button"
                        class="garage-hq-btn"
                        data-action="upgrade-hq-node"
                        data-node="${node.id}"
                        ${check.ok ? '' : 'disabled'}
                        title="${escape(check.reason || t(node.summary))}"
                      >
                        ${maxedNode ? t('MAXED') : check.ok ? `${t('UPGRADE')} · ${btnLabel}` : escape(check.reason)}
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>
            </section>
          `;
        }).join('')}
      </div>
    </div>
  `;

  const showPreview = isComponentsTab && !maxed;
  const statItem = (labelKey, curVal, nextVal, unit, lowerBetter = false) => {
    const delta = nextVal - curVal;
    const hasDelta = showPreview && Math.abs(delta) > 0.001;
    const good = lowerBetter ? delta < 0 : delta > 0;
    return `
      <div class="garage-tele-row">
        <span class="garage-tele-label">${t(labelKey)}</span>
        <div class="garage-tele-vals">
          <strong class="garage-tele-cur">${number(curVal)}${unit}</strong>
          ${hasDelta ? `<span class="garage-tele-next ${good ? 'is-good' : 'is-warn'}">→ ${number(nextVal)}${unit}</span>` : ''}
        </div>
      </div>
    `;
  };

  return `
    <aside class="garage-sidebar" aria-label="${t('Garage upgrades and supplies')}">
      <div class="garage-sidebar-head">
        <div class="garage-brand">
          <h1>${t('GARAGE')}</h1>
          <span class="garage-status-pill">${hud.isGaragePaused ? t('PAUSED') : t('SERVICE BAY')}</span>
        </div>
        <div class="garage-wallet">
          <span>${t('CREDITS')}</span>
          <strong>$${money(credits)}</strong>
        </div>
      </div>

      <div class="garage-mode-switcher is-two" role="tablist" aria-label="${t('Garage sections')}">
        <button
          type="button"
          class="garage-mode-btn ${isComponentsTab ? 'is-active' : ''}"
          data-action="garage-select"
          data-track="cannon"
          aria-selected="${isComponentsTab}"
        >${t('COMPONENTS')}</button>
        <button
          type="button"
          class="garage-mode-btn ${isHqTab ? 'is-active' : ''}"
          data-action="garage-select"
          data-track="hq"
          aria-selected="${isHqTab}"
        >${t('HQ COMMAND')} <small>${hqTotalLevels}/${hqMaxLevels}</small></button>
      </div>

      ${isHqTab ? hqPanelHtml : `${componentsPanelHtml}${suppliesSectionHtml}`}
    </aside>

    <section class="garage-visual" aria-label="${t('Player tank in the garage')}">
      <div class="garage-stage-window"></div>
      <div class="garage-stage-top">
        <div class="garage-vehicle-label">
          <span class="garage-eyebrow">${t('ASSIGNED VEHICLE')}</span>
          <h2>${t('PLAYER')} <span>${t('MBT')}</span></h2>
        </div>
        <button class="garage-exit" data-action="toggle-upgrades" aria-label="${t('Close garage')}">
          ${hud.isGaragePaused ? t('Return to battle') : t('Back to operations')} <kbd>ESC</kbd>
        </button>
      </div>

      ${isComponentsTab ? `
        <svg class="garage-callout-svg" aria-hidden="true">
          <polyline id="garage-callout-line" class="garage-callout-line" points="" />
          <circle id="garage-callout-ring" class="garage-callout-ring" r="7" cx="-50" cy="-50" />
          <circle id="garage-callout-dot" class="garage-callout-dot" r="3" cx="-50" cy="-50" />
        </svg>
        <aside class="garage-callout-card pos-${track.key}" data-callout-track="${track.key}" aria-label="${t('Selected component details')}">
          <div class="garage-callout-head">
            <span class="garage-eyebrow">${escape(t(track.role))} · ${maxed ? t('MAX TIER') : t('TIER {from} → {to}', { from: tier, to: tier + 1 })}</span>
            <strong>${escape(t(current.name))}</strong>
          </div>
          <p class="garage-callout-desc">${escape(t(current.description || track.summary))}</p>
          ${!maxed ? `
            <div class="garage-callout-next">
              <span>${t('NEXT: {name}', { name: escape(t(next.name)) })}</span>
              <p>${escape(t(next.description))}</p>
            </div>
          ` : ''}
          ${track.key === 'chassis' ? `<div class="garage-capability">${after.canCrossWater ? (after.canHover || after.waterSpeedMultiplier >= 1 ? `✓ ${t('Water crossing (full speed)')}` : `✓ ${t('Water crossing ({pct}% speed)', { pct: Math.round(after.waterSpeedMultiplier * 100) })}`) : t('Land traversal')} · ${after.allTerrain ? t('All-terrain traction') : t('Standard traction')}</div>` : ''}
        </aside>
      ` : ''}

      <aside class="garage-telemetry-card" aria-label="${t('Tank specifications summary')}">
        <div class="garage-tele-head">
          <span>${t('TANK SUMMARY')}</span>
          <small>${t('CURRENT SPECS')}</small>
        </div>
        <div class="garage-tele-grid">
          ${statItem(N_('Durability'), before.maxHP, after.maxHP, ' HP')}
          ${statItem(N_('Armor'), before.armor, after.armor, '%')}
          ${statItem(N_('Damage'), before.damage, after.damage, '')}
          ${statItem(N_('Penetration'), before.penetration, after.penetration, '%')}
          ${statItem(N_('Reload'), before.fireCooldown, after.fireCooldown, ' s', true)}
          ${statItem(N_('Speed'), before.moveSpeed, after.moveSpeed, ' c/s')}
          ${statItem(N_('Mass'), before.totalMass, after.totalMass, ' t', true)}
          ${statItem(N_('Shells capacity'), before.cannonMaxAmmo, after.cannonMaxAmmo, '')}
          ${statItem(N_('APS capacity'), before.apsMaxAmmo, after.apsMaxAmmo, '')}
          ${statItem(N_('Missile capacity'), before.missileMaxAmmo, after.missileMaxAmmo, '')}
          ${statItem(N_('Radar range'), radarRangeBefore, radarRangeAfter, ' c')}
          ${statItem(N_('Through-cover'), throughCoverBefore, throughCoverAfter, ' c')}
        </div>
      </aside>

      <div class="garage-stage-bottom">
        <div class="garage-view-controls" aria-label="${t('Tank viewing angle')}">
          ${['front', 'side', 'rear'].map(item => `<button data-action="garage-view" data-view="${item}" aria-pressed="${view === item}" class="${view === item ? 'is-selected' : ''}">${item === 'front' ? t('Overview') : item === 'side' ? t('Side view') : t('Rear view')}</button>`).join('')}
        </div>
      </div>
    </section>
  `;
}
