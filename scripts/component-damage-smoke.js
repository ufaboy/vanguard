import { TankGameEngine } from '/src/game/engine.js';
import { renderHangar } from '/src/hangar-ui.js';
import { renderComponentCondition } from '/src/component-condition-ui.js';
import { SaveRepository } from '/src/sim/hangar.js';
import { normalizeComponentDamage, COMPONENT_REPAIR_COST } from '/src/sim/component-damage.js';

const assert = (condition, message) => { if (!condition) throw Error(message); };
try {
  const engine = Object.create(TankGameEngine.prototype);
  Object.assign(engine, {
    upgrades: { cannon: 5, chassis: 4, frame: 3, engine: 3, armor: 3 },
    componentDamage: normalizeComponentDamage(), componentDamageCooldown: 0,
    playerSave: { parts: [], credits: COMPONENT_REPAIR_COST * 2 }, playerHp: 52, playerMaxHp: 52,
    missileAmmo: 0, playerRig: null, modelFactory: null, clock: null,
    saveRepo: new SaveRepository('component-damage-smoke'),
    emitHudUpdate() {}, setStatusBanner() {}, spawnSparks() {},
    worldToGrid: () => ({ row: 0, col: 0 }), grid: [[{ type: 0 }]],
    playerX: 0, playerZ: 0,
  });
  engine.recomputePlayerStats(false);
  const originalRandom = Math.random;
  Math.random = () => 0;
  const purchased = JSON.stringify(engine.upgrades);
  engine.tryDamageComponent(1, { zone: 'turret', aspect: 'front' });
  assert(engine.componentDamage.cannon, 'Cannon was not damaged');
  assert(engine.effectiveUpgrades.cannon === 4, 'Effective cannon tier mismatch');
  assert(engine.componentDamageCooldown === 8, 'Cooldown mismatch');
  assert(JSON.stringify(engine.upgrades) === purchased, 'Purchased tiers changed');
  engine.tryDamageComponent(1, { zone: 'hull', aspect: 'rear' });
  assert(Object.values(engine.componentDamage).filter(Boolean).length === 1, 'Cooldown failed');
  assert(engine.saveRepo.loadPlayerSave().componentDamage.cannon, 'Fault was not saved');
  engine.isHangarOpen = false;
  assert(!engine.repairComponentInHangar('cannon').success, 'Repair outside hangar');
  engine.isHangarOpen = true; engine.playerSave.credits = COMPONENT_REPAIR_COST - 1;
  assert(!engine.repairComponentInHangar('cannon').success, 'Underfunded repair');
  assert(engine.playerSave.credits === COMPONENT_REPAIR_COST - 1 && engine.componentDamage.cannon, 'Failed repair mutated state');
  engine.playerSave.credits = COMPONENT_REPAIR_COST * 2;
  assert(engine.repairComponentInHangar('cannon').success, 'Paid repair failed');
  assert(engine.playerSave.credits === COMPONENT_REPAIR_COST && engine.effectiveUpgrades.cannon === 5, 'Wrong repair balance or tier');
  assert(!engine.repairComponentInHangar('cannon').success && engine.playerSave.credits === COMPONENT_REPAIR_COST, 'Duplicate repair charged');
  assert(!engine.saveRepo.loadPlayerSave().componentDamage.cannon, 'Repair was not persisted');
  Math.random = originalRandom;
  const faults = { cannon: true, engine: true, armor: true };
  const hud = { componentDamage: faults, credits: 1500, apsTotal: 2, apsAmmo: [1, 0, 0, 1], missileAmmo: 0 };
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/src/index.css';
  document.head.append(css); await new Promise(resolve => { css.onload = resolve; });
  document.body.innerHTML = `<div class="hangar-shell">${renderHangar(hud, engine.upgrades, 'cannon')}</div>`;
  const stage = document.querySelector('.hangar-stage-window');
  stage.style.cssText = 'display:grid;place-items:center';
  stage.innerHTML = `<div style="background:#0b0f17;padding:24px;border:1px solid #334155"><p>COMBAT CONDITION</p>${renderComponentCondition(engine.upgrades, faults)}<p style="font-size:12px;color:#94a3b8">Red: damaged component · Repair in hangar</p></div>`;
  assert(document.querySelectorAll('.condition-part.is-damaged').length === 3, 'Schematic highlights mismatch');
  assert(document.querySelector('[data-action="repair-component"]'), 'Repair button missing');
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ passed: true, purchasedTiersPreserved: true, cooldown: true, repairCost: COMPONENT_REPAIR_COST, persistence: true, highlights: 3 }) });
} catch (error) {
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ error: error.stack }) });
}
