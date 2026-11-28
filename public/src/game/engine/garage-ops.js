/** Garage transactions and component damage/repair. */

import {
  APS,
  CANNON_AMMO,
  MISSILE,
  TRACK_UPGRADE_COSTS,
  UPGRADE_MAX_LEVEL,
  getMaxApsAmmo,
  getMaxMissileAmmo,
} from '../constants.js';
import { DRONE_CONFIGS } from '../vehicles/drones.js';
import { GameStatus, TileType } from '../types.js';
import { GarageStage } from '../render/garage-stage.js';
import { sound } from '../sound.js';
import {
  COMPONENT_TRACKS,
  COMPONENT_DAMAGE_COOLDOWN,
  componentRepairCost,
  rollComponentDamage,
} from '../../sim/component-damage.js';
import {
  canUpgradeHqNode,
  getHqBonuses,
  getHqNodeSpec,
  upgradeHqNode as applyHqNodeUpgrade,
} from '../../sim/hq-tree.js';
import { getRankProgress } from '../../sim/medals.js';
import { N_, t } from '../../i18n/index.js';

const TRACK_LABELS = Object.freeze({
  cannon: N_('Cannon'),
  chassis: N_('Chassis'),
  frame: N_('Frame'),
  engine: N_('Engine'),
  armor: N_('Armor'),
  radar: N_('Radar'),
});
const trackLabel = (track) => t(TRACK_LABELS[track] || track).toUpperCase();

export class GarageOps {
  constructor(engine) {
    this.engine = engine;
  }

  setOpen(open) {
    const e = this.engine;
    if (open) {
      if (e.status === GameStatus.PLAYING || e.status === GameStatus.BOSS_INTRO) {
        if (!e.inBaseRepairZone) {
          e.setStatusBanner?.(
            t('GARAGE UNAVAILABLE: RETURN TO ALLIED BASE REPAIR ZONE TO UPGRADE'),
            2.5
          );
          return false;
        }
        e.isGaragePaused = true;
      }
      e.isGarageOpen = true;
      e._garageWindowRect = null;
      e.isGaragePaused = e.status !== GameStatus.MENU;
      e.keys = {};
      e.isMouseDown = false;
      if (!e.garageStage && e.modelFactory && e.scene) {
        e.garageStage = new GarageStage(e.modelFactory, e.scene.environment, e.isSoftwareGl);
      }
      e.syncAudioPauseState?.();
      e.emitHudUpdate?.();
      return true;
    } else {
      e.isGarageOpen = false;
      e.isGaragePaused = false;
      e.setInspectMode?.(false);
      e.syncAudioPauseState?.();
      e.emitHudUpdate?.();
      return true;
    }
  }

  stepOpenFrame(dt, elapsed) {
    const e = this.engine;
    if (!e.isGarageOpen) return false;
    e.garageStage?.update?.(dt, e.effectiveUpgrades, e.missileAmmo, e.apsAmmo, elapsed);
    this.updateCalloutLeaderLine();
    this.tickBaseMaintenance(dt);
    return true;
  }

  updateCalloutLeaderLine() {
    if (typeof document === 'undefined') return;
    const e = this.engine;
    const card = document.querySelector('.garage-callout-card');
    const stageEl = document.querySelector('.garage-visual');
    const line = document.getElementById('garage-callout-line');
    const dot = document.getElementById('garage-callout-dot');
    const ring = document.getElementById('garage-callout-ring');
    if (!card || !stageEl || !line || !dot || !ring || !e.garageStage?.getComponentStageCoords) return;

    const stageRect = stageEl.getBoundingClientRect();
    const track = card.getAttribute('data-callout-track') || 'cannon';
    const target = e.garageStage.getComponentStageCoords(track, stageRect);
    if (!target) return;

    const cardRect = card.getBoundingClientRect();
    const startX = cardRect.right - stageRect.left;
    const startY = cardRect.top - stageRect.top + cardRect.height * 0.5;
    const elbowX = startX + Math.max(18, (target.x - startX) * 0.45);

    line.setAttribute(
      'points',
      `${startX.toFixed(1)},${startY.toFixed(1)} ${elbowX.toFixed(1)},${startY.toFixed(1)} ${target.x.toFixed(1)},${target.y.toFixed(1)}`
    );
    dot.setAttribute('cx', target.x.toFixed(1));
    dot.setAttribute('cy', target.y.toFixed(1));
    ring.setAttribute('cx', target.x.toFixed(1));
    ring.setAttribute('cy', target.y.toFixed(1));
  }

  tickBaseMaintenance(dt) {
    const e = this.engine;
    if (!e.isGaragePaused || e.isAdPaused || e.status !== GameStatus.PLAYING) return;
    const repairedAny = e.playerController?.updateBaseMaintenance?.(dt);
    if (repairedAny) {
      e.hudSyncAccumulator = (e.hudSyncAccumulator || 0) + dt;
      const hudInterval = e.quality === 'low' ? 0.2 : 0.12;
      if (e.hudSyncAccumulator >= hudInterval) {
        e.hudSyncAccumulator = 0;
        e.emitHudUpdate?.();
      }
    }
  }

  persistComponentDamage() {}

  tryDamageComponent(damage, hit) {
    const e = this.engine;
    const track = rollComponentDamage(e.upgrades, e.componentDamage,
      e.componentDamageCooldown, { ...hit, damage });
    if (!track) return;
    const couldCrossWater = e.playerStats?.canCrossWater;
    e.componentDamage[track] = true;
    e.componentDamageCooldown = COMPONENT_DAMAGE_COOLDOWN;
    const hp = e.playerHp;
    e.recomputePlayerStats(true);
    e.playerHp = Math.min(hp, e.playerHp);
    if (couldCrossWater && !e.playerStats.canCrossWater) {
      const { row, col } = e.worldToGrid(e.playerX, e.playerZ);
      e.componentWaterEgress = e.grid[row]?.[col]?.type === TileType.WATER;
    }
    e.persistComponentDamage();
    e.setStatusBanner(t('{track} DAMAGED: TIER {from} -> {to}. GARAGE REPAIR ${cost}', { track: trackLabel(track), from: e.upgrades[track], to: e.effectiveUpgrades[track], cost: componentRepairCost(e.upgrades[track]) }), 4);
    e.emitHudUpdate();
  }

  /** Checks affordability and deducts credits immediately in menu, or defers until victory in battle. */
  spendForPurchase(cost) {
    const e = this.engine;
    const inBattle = e.isBattleActive ? e.isBattleActive() : e.status !== GameStatus.MENU;
    const available = inBattle
      ? (e.getAvailableCredits ? e.getAvailableCredits() : (e.playerSave?.credits || 0))
      : (e.playerSave?.credits || 0);
    if (available < cost) {
      return { ok: false, inBattle };
    }
    if (inBattle && e.spendBattleCredits) {
      e.spendBattleCredits(cost);
    } else {
      e.playerSave.credits -= cost;
      e.syncTemporaryCredits?.();
    }
    return { ok: true, inBattle };
  }

  repairComponent(track) {
    const e = this.engine;
    if (!e.isGarageOpen) return { success: false, reason: t('Open the garage to repair components.') };
    if (!Object.hasOwn(e.componentDamage, track) || !e.componentDamage[track]) {
      return { success: false, reason: t('This component does not need repair.') };
    }
    const repairCost = componentRepairCost(e.upgrades[track]);
    const { ok, inBattle } = this.spendForPurchase(repairCost);
    if (!ok) {
      return { success: false, reason: t('Insufficient credits. Repair costs ${repairCost}.', { repairCost }) };
    }
    e.componentDamage[track] = false;
    e.recomputePlayerStats?.(true);
    if (!inBattle) {
      if (e.persistComponentDamage) {
        e.persistComponentDamage();
      } else {
        this.persistComponentDamage();
      }
    }
    e.emitHudUpdate?.();
    return { success: true, reason: t('{track} restored to Tier {tier}. Paid ${repairCost}.', { track: trackLabel(track), tier: e.upgrades[track], repairCost }) };
  }

  restoreAllComponents() {
    const e = this.engine;
    e.componentDamage = Object.fromEntries(COMPONENT_TRACKS.map((t) => [t, false]));
    e.componentDamageCooldown = 0;
    e.componentWaterEgress = false;
    if (e.persistComponentDamage) {
      e.persistComponentDamage();
    } else {
      this.persistComponentDamage();
    }
    e.recomputePlayerStats?.(true);
    e.emitHudUpdate?.();
  }

  upgradeTrack(track) {
    const e = this.engine;
    if (!e.isGarageOpen || !Object.hasOwn(UPGRADE_MAX_LEVEL, track)) {
      return { success: false, reason: t('Select a system in the garage first.') };
    }
    const curLvl = e.upgrades[track] || 1;
    const maxLvl = UPGRADE_MAX_LEVEL[track] || 5;
    if (curLvl >= maxLvl) {
      return { success: false, reason: t('Already at maximum tier (Tier 5).') };
    }
    const nextTier = curLvl + 1;
    const cost = TRACK_UPGRADE_COSTS[nextTier] || 500;
    const { ok, inBattle } = this.spendForPurchase(cost);
    if (!ok) {
      return {
        success: false,
        reason: t('Insufficient Credits (Need ${cost}).', { cost }),
      };
    }

    e.upgrades[track] = nextTier;
    if (!inBattle) {
      e.syncCampaignCredits?.();
      e.saveRepo?.savePlayerSave?.(e.playerSave);
      e.saveProgress?.();
    }
    e.recomputePlayerStats?.(true);
    sound.playPowerUp();
    e.setStatusBanner?.(
      t('{track} UPGRADED TO TIER {nextTier}! (-${cost})', { track: trackLabel(track), nextTier, cost }),
      2.5
    );
    e.emitHudUpdate?.();
    return { success: true, reason: t('Upgraded to Tier {nextTier}', { nextTier }) };
  }

  buyCannonAmmo() {
    const e = this.engine;
    if (!e.isGarageOpen) return { success: false, reason: t('Open the garage to purchase ammunition.') };
    const maxAmmo = e.getPlayerMaxCannonAmmo();
    if (e.cannonAmmo >= maxAmmo) {
      return { success: false, reason: t('Ammunition magazine is full ({maxAmmo} shells).', { maxAmmo }) };
    }
    const cost = CANNON_AMMO.CREDIT_PRICE_PER_PACK;
    const { ok, inBattle } = this.spendForPurchase(cost);
    if (!ok) {
      return { success: false, reason: t('Insufficient Credits (Need {cost}).', { cost }) };
    }
    e.cannonAmmo = Math.min(maxAmmo, e.cannonAmmo + CANNON_AMMO.SHELLS_PER_PACK);
    if (!inBattle) {
      e.syncCampaignCredits();
      e.saveRepo.savePlayerSave(e.playerSave);
    }
    sound.playPowerUp();
    e.setStatusBanner(t('+{SHELLS_PER_PACK} SHELLS PURCHASED! ({cannonAmmo}/{maxAmmo}) (-{cost})', { SHELLS_PER_PACK: CANNON_AMMO.SHELLS_PER_PACK, cannonAmmo: e.cannonAmmo, maxAmmo, cost }), 2.5);
    e.emitHudUpdate();
    return { success: true, reason: t('+{SHELLS_PER_PACK} shells purchased ({cannonAmmo}/{maxAmmo}).', { SHELLS_PER_PACK: CANNON_AMMO.SHELLS_PER_PACK, cannonAmmo: e.cannonAmmo, maxAmmo }) };
  }

  buyMissile() {
    const e = this.engine;
    if (!e.isGarageOpen) return { success: false, reason: t('Open the garage to purchase missiles.') };
    if (!e.atgmOwned) return { success: false, reason: t('Install the ATGM pod first.') };
    const maxMissiles = e.getPlayerMaxMissileAmmo ? e.getPlayerMaxMissileAmmo() : getMaxMissileAmmo(e.upgrades?.frame || 1);
    if (e.missileAmmo >= maxMissiles) {
      return { success: false, reason: t('Missile magazine is full ({maxMissiles}).', { maxMissiles }) };
    }
    const cost = MISSILE.CREDIT_PRICE;
    const { ok, inBattle } = this.spendForPurchase(cost);
    if (!ok) {
      return { success: false, reason: t('Insufficient Credits (Need ${cost}).', { cost }) };
    }
    e.missileAmmo++;
    if (!inBattle) {
      e.syncCampaignCredits?.();
      e.saveRepo?.savePlayerSave?.(e.playerSave);
    }
    e.recomputePlayerStats?.(true);
    sound.playPowerUp();
    e.setStatusBanner?.(t('+1 MISSILE PURCHASED! ({missileAmmo}/{maxMissiles}) (-${cost})', { missileAmmo: e.missileAmmo, maxMissiles, cost }), 2.5);
    e.emitHudUpdate?.();
    return { success: true, reason: t('+1 missile purchased ({missileAmmo}/{maxMissiles}).', { missileAmmo: e.missileAmmo, maxMissiles }) };
  }

  buyApsCharge() {
    const e = this.engine;
    if (!e.isGarageOpen) {
      return { success: false, reason: t('Open the garage to purchase APS charges.') };
    }
    if (!e.apsOwned) {
      return { success: false, reason: t('Install the APS module first.') };
    }
    const maxAps = e.getPlayerMaxApsAmmo ? e.getPlayerMaxApsAmmo() : getMaxApsAmmo(e.upgrades?.frame || 1);
    const currentTotal = e.apsAmmo.reduce((a, b) => a + b, 0);
    if (currentTotal >= maxAps) {
      return { success: false, reason: t('APS magazine is already at maximum capacity ({maxAps} charges).', { maxAps }) };
    }
    const cost = APS.CHARGE_CREDIT_PRICE || 1000;
    const { ok, inBattle } = this.spendForPurchase(cost);
    if (!ok) {
      return {
        success: false,
        reason: t('Insufficient Credits (Need ${cost}).', { cost }),
      };
    }

    if (e.addApsRounds) {
      e.addApsRounds(1);
    } else {
      e.playerController?.addApsRounds?.(1);
    }
    if (!inBattle) {
      e.syncCampaignCredits?.();
      e.saveRepo?.savePlayerSave?.(e.playerSave);
    }
    sound.playPowerUp();
    const newTotal = e.apsAmmo.reduce((a, b) => a + b, 0);
    e.setStatusBanner?.(
      t('+1 APS CHARGE PURCHASED! ({newTotal}/{maxAps}) (-${cost})', { newTotal, maxAps, cost }),
      2.5
    );
    e.emitHudUpdate?.();
    return { success: true, total: newTotal, reason: t('+1 APS charge purchased ({newTotal}/{maxAps}).', { newTotal, maxAps }) };
  }

  buyReconDrone(allowInBattle = false) {
    const e = this.engine;
    if (!allowInBattle && !e.isGarageOpen) {
      return { success: false, reason: t('Open the garage to purchase the Recon Drone.') };
    }
    if (e.reconDroneOwned) {
      return { success: false, reason: t('Recon Drone is already installed.') };
    }
    const cost = DRONE_CONFIGS.RECON_DRONE.creditPrice;
    const { ok, inBattle } = this.spendForPurchase(cost);
    if (!ok) {
      const msg = t('Insufficient Credits (Need ${cost}).', { cost });
      if (allowInBattle) e.setStatusBanner(t('INSUFFICIENT CREDITS (${cost})', { cost }), 2.0);
      return { success: false, reason: msg };
    }
    e.reconDroneOwned = true;
    if (!inBattle) {
      e.syncCampaignCredits();
      e.saveRepo.savePlayerSave(e.playerSave);
      e.saveProgress?.();
    }
    e.recomputePlayerStats(true);
    sound.playPowerUp();
    e.setStatusBanner(t('RECON DRONE INSTALLED! (-${cost})', { cost }), 2.5);
    e.emitHudUpdate();
    return { success: true, reason: t('Recon Drone installed.') };
  }

  buyApsModule() {
    const e = this.engine;
    if (!e.isGarageOpen) return { success: false, reason: t('Open the garage to install the APS module.') };
    if (e.apsOwned) return { success: false, reason: t('APS module is already installed.') };
    const cost = APS.MODULE_CREDIT_PRICE || 3000;
    const { ok, inBattle } = this.spendForPurchase(cost);
    if (!ok) {
      return { success: false, reason: t('Insufficient Credits (Need ${cost}).', { cost }) };
    }
    e.apsOwned = true;
    if (e.playerController?.initApsLaunchers) {
      e.playerController.initApsLaunchers(APS.START_ROUNDS);
    } else {
      distributeApsRounds(e.apsAmmo, APS.START_ROUNDS, getMaxApsAmmo(e.upgrades?.frame || 1));
    }
    if (!inBattle && e.playerSave) {
      e.syncCampaignCredits?.();
      e.saveRepo?.savePlayerSave?.(e.playerSave);
      e.saveProgress?.();
    }
    e.recomputePlayerStats?.(true);
    sound.playPowerUp();
    e.setStatusBanner(t('APS MODULE INSTALLED! (-${cost})', { cost }), 2.5);
    e.emitHudUpdate();
    return { success: true, reason: t('APS module installed.') };
  }

  buyAtgmModule() {
    const e = this.engine;
    if (!e.isGarageOpen) return { success: false, reason: t('Open the garage to install the ATGM pod.') };
    if (e.atgmOwned) return { success: false, reason: t('ATGM pod is already installed.') };
    const cost = MISSILE.MODULE_CREDIT_PRICE || 3500;
    const { ok, inBattle } = this.spendForPurchase(cost);
    if (!ok) {
      return { success: false, reason: t('Insufficient Credits (Need ${cost}).', { cost }) };
    }
    e.atgmOwned = true;
    e.missileAmmo = Math.min(getMaxMissileAmmo(e.upgrades?.frame || 1), Math.max(e.missileAmmo || 0, 2));
    if (!inBattle && e.playerSave) {
      e.syncCampaignCredits?.();
      e.saveRepo?.savePlayerSave?.(e.playerSave);
      e.saveProgress?.();
    }
    e.recomputePlayerStats?.(true);
    sound.playPowerUp();
    e.setStatusBanner(t('ATGM POD INSTALLED! (-${cost})', { cost }), 2.5);
    e.emitHudUpdate();
    return { success: true, reason: t('ATGM pod installed.') };
  }

  upgradeHqNode(nodeId) {
    const e = this.engine;
    const hqTree = e.getHqTree();
    const campaignSave = e.campaignSaveRepo?.loadPlayerSave?.();
    const playerRankId = getRankProgress(campaignSave).currentRank.id;
    const inBattle = e.isBattleActive ? e.isBattleActive() : e.status !== GameStatus.MENU;
    const available = inBattle
      ? (e.getAvailableCredits ? e.getAvailableCredits() : (e.playerSave?.credits || 0))
      : (e.playerSave?.credits || 0);
    const check = canUpgradeHqNode({
      hqTree,
      nodeId,
      credits: available,
      playerRankId,
      profileMode: e.profileMode || 'campaign',
    });
    if (!check.ok) {
      return { success: false, reason: check.reason };
    }
    const { ok } = this.spendForPurchase(check.cost);
    if (!ok) {
      return { success: false, reason: t('Insufficient credits (${cost})', { cost: check.cost }) };
    }
    const prevBaseMult = getHqBonuses(hqTree).baseHpMultiplier;
    e.hqTree = applyHqNodeUpgrade(hqTree, nodeId);
    if (!inBattle) {
      e.syncCampaignCredits?.();
      e.saveRepo?.savePlayerSave?.(e.playerSave);
    }

    if (nodeId === 'HQ_FORTIFICATION' && e.baseAlive && e.baseMaxHp > 0) {
      const nextBaseMult = getHqBonuses(e.hqTree).baseHpMultiplier;
      const ratio = nextBaseMult / Math.max(1, prevBaseMult);
      const prevMax = e.baseMaxHp;
      e.baseMaxHp = Math.max(1, Math.round(e.baseMaxHp * ratio));
      e.baseHp = Math.min(e.baseMaxHp, (e.baseHp || prevMax) + Math.max(0, e.baseMaxHp - prevMax));
    }
    if (nodeId === 'RECON_OPTICS') {
      e.recomputePlayerStats?.(true);
    }

    const spec = getHqNodeSpec(nodeId);
    e.setStatusBanner(
      t('{name} UPGRADED TO LV {lvl}', { name: t(spec?.name || nodeId).toUpperCase(), lvl: check.nextLevel }),
      2.2
    );
    sound.playPowerUp();
    e.emitHudUpdate();
    return { success: true, level: check.nextLevel };
  }

  buyMaxSupply(kind) {
    const e = this.engine;
    if (!e.isGarageOpen) return { success: false, reason: t('Open the garage to purchase ammunition.') };
    const inBattle = e.isBattleActive ? e.isBattleActive() : e.status !== GameStatus.MENU;
    const available = inBattle
      ? (e.getAvailableCredits ? e.getAvailableCredits() : (e.playerSave?.credits || 0))
      : (e.playerSave?.credits || 0);

    if (kind === 'cannon') {
      const maxAmmo = e.getPlayerMaxCannonAmmo();
      const missing = Math.max(0, maxAmmo - (e.cannonAmmo || 0));
      if (missing <= 0) return { success: false, reason: t('Ammunition magazine is full ({maxAmmo} shells).', { maxAmmo }) };
      const packSize = CANNON_AMMO.SHELLS_PER_PACK;
      const packCost = CANNON_AMMO.CREDIT_PRICE_PER_PACK;
      const packsNeeded = Math.ceil(missing / packSize);
      const packsAffordable = Math.floor(available / packCost);
      const packs = Math.min(packsNeeded, packsAffordable);
      if (packs <= 0) return { success: false, reason: t('Insufficient Credits (Need {cost}).', { cost: packCost }) };
      const totalCost = packs * packCost;
      this.spendForPurchase(totalCost);
      e.cannonAmmo = Math.min(maxAmmo, (e.cannonAmmo || 0) + packs * packSize);
      if (!inBattle) {
        e.syncCampaignCredits?.();
        e.saveRepo?.savePlayerSave?.(e.playerSave);
      }
      sound.playPowerUp();
      e.emitHudUpdate?.();
      return { success: true, reason: t('Shells refilled ({cur}/{max}) (-${cost})', { cur: e.cannonAmmo, max: maxAmmo, cost: totalCost }) };
    }

    if (kind === 'aps') {
      if (!e.apsOwned) return { success: false, reason: t('Install the APS module first.') };
      const maxAps = e.getPlayerMaxApsAmmo ? e.getPlayerMaxApsAmmo() : getMaxApsAmmo(e.upgrades?.frame || 1);
      const currentTotal = e.apsAmmo.reduce((a, b) => a + b, 0);
      const missing = Math.max(0, maxAps - currentTotal);
      if (missing <= 0) return { success: false, reason: t('APS magazine is already at maximum capacity ({maxAps} charges).', { maxAps }) };
      const unitCost = APS.CHARGE_CREDIT_PRICE || 1000;
      const units = Math.min(missing, Math.floor(available / unitCost));
      if (units <= 0) return { success: false, reason: t('Insufficient Credits (Need ${cost}).', { cost: unitCost }) };
      const totalCost = units * unitCost;
      this.spendForPurchase(totalCost);
      if (e.addApsRounds) {
        e.addApsRounds(units);
      } else {
        distributeApsRounds(e.apsAmmo, units, maxAps);
      }
      if (!inBattle) {
        e.syncCampaignCredits?.();
        e.playerSave.apsAmmo = [...e.apsAmmo];
        e.saveRepo?.savePlayerSave?.(e.playerSave);
      }
      sound.playPowerUp();
      e.emitHudUpdate?.();
      const newTotal = e.apsAmmo.reduce((a, b) => a + b, 0);
      return { success: true, reason: t('APS refilled ({cur}/{max}) (-${cost})', { cur: newTotal, max: maxAps, cost: totalCost }) };
    }

    if (kind === 'missile') {
      if (!e.atgmOwned) return { success: false, reason: t('Install the ATGM pod first.') };
      const maxMissiles = e.getPlayerMaxMissileAmmo ? e.getPlayerMaxMissileAmmo() : getMaxMissileAmmo(e.upgrades?.frame || 1);
      const missing = Math.max(0, maxMissiles - (e.missileAmmo || 0));
      if (missing <= 0) return { success: false, reason: t('Missile magazine is full ({maxMissiles}).', { maxMissiles }) };
      const unitCost = MISSILE.CREDIT_PRICE;
      const units = Math.min(missing, Math.floor(available / unitCost));
      if (units <= 0) return { success: false, reason: t('Insufficient Credits (Need ${cost}).', { cost: unitCost }) };
      const totalCost = units * unitCost;
      this.spendForPurchase(totalCost);
      e.missileAmmo = Math.min(maxMissiles, (e.missileAmmo || 0) + units);
      if (!inBattle) {
        e.syncCampaignCredits?.();
        e.playerSave.missileAmmo = e.missileAmmo;
        e.saveRepo?.savePlayerSave?.(e.playerSave);
      }
      e.recomputePlayerStats?.(true);
      sound.playPowerUp();
      e.emitHudUpdate?.();
      return { success: true, reason: t('Missiles refilled ({cur}/{max}) (-${cost})', { cur: e.missileAmmo, max: maxMissiles, cost: totalCost }) };
    }

    return { success: false, reason: '' };
  }
}
