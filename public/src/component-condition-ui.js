import { COMPONENT_TRACKS, effectiveUpgradeTiers } from './sim/component-damage.js';

export function renderComponentCondition(upgrades, damage = {}) {
  const tiers = effectiveUpgradeTiers(upgrades, damage);
  const labels = { cannon: 'Cannon', chassis: 'Chassis', frame: 'Frame', engine: 'Engine', armor: 'Armor' };
  const part = (track, shape) => `<g class="condition-part ${damage[track] ? 'is-damaged' : ''}"><title>${labels[track]}: ${damage[track] ? `DAMAGED, Tier ${upgrades[track]} to ${tiers[track]}` : `Tier ${tiers[track]}`}</title>${shape}</g>`;
  return `<div class="component-condition" aria-label="Core component condition">
    <svg viewBox="0 0 100 120" role="img" aria-label="Tank schematic. Damaged components are red.">
      ${part('chassis', '<rect x="10" y="33" width="16" height="75" rx="5"/><rect x="74" y="33" width="16" height="75" rx="5"/>')}
      ${part('frame', '<path d="M30 30 L70 30 L76 44 L76 103 L24 103 L24 44 Z"/>')}
      ${part('armor', '<path d="M30 30 L70 30 L74 43 L26 43 Z"/><path d="M25 46 L31 46 L31 83 L25 83 Z M69 46 L75 46 L75 83 L69 83 Z"/>')}
      ${part('engine', '<rect x="34" y="83" width="32" height="16" rx="2"/><path d="M38 88 H62 M38 94 H62"/>')}
      ${part('cannon', '<path d="M45 53 V8 H55 V53 Z"/><path d="M37 51 L63 51 L68 61 L63 77 L37 77 L32 61 Z"/>')}
    </svg>
    <div class="condition-legend">${COMPONENT_TRACKS.map(track => `<span class="${damage[track] ? 'is-damaged' : ''}">${damage[track] ? '!' : '&#183;'} ${labels[track]} <b>${damage[track] ? `${upgrades[track]}→${tiers[track]}` : tiers[track]}</b></span>`).join('')}</div>
  </div>`;
}
