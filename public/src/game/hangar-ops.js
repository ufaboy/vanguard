/** Hangar transactions, component damage/repair, and mission abort settlement. */

import {
  APS,
  CANNON_AMMO,
  MISSILE,
  TRACK_UPGRADE_COSTS,
  UPGRADE_MAX_LEVEL,
} from './constants.js';
import { GameStatus, TileType } from './types.js';
import { HangarStage } from './hangar-stage.js';
import { sound } from './sound.js';
import {
  COMPONENT_TRACKS,
  COMPONENT_DAMAGE_COOLDOWN,
  componentRepairCost,
  rollComponentDamage,
} from '../sim/component-damage.js';
import {
  mountPartInHangar,
  resolveAssembledTank,
  settleMission,
} from '../sim/hangar.js';
import { recordSurvivalRun } from '../sim/survival.js';

export class HangarOps {
  constructor(engine) {
    this.engine = engine;
  }

  mountPart(instanceId, socketId = null) {
    const e = this.engine;
    const res = mountPartInHangar(e.playerSave, instanceId, socketId);
    if (res.success) {
      e.saveRepo.savePlayerSave(e.playerSave);
      e.assembledTank = resolveAssembledTank(e.playerSave);
      e.upgrades = {
        ...e.upgrades,
        cannon: e.assembledTank.gun?.visualTier || e.upgrades.cannon,
        chassis: e.assembledTank.hull?.visualTiers?.chassis || e.upgrades.chassis,
        frame: e.assembledTank.hull?.visualTiers?.frame || e.upgrades.frame,
        engine: e.assembledTank.hull?.visualTiers?.engine || e.upgrades.engine,
        armor: e.assembledTank.hull?.visualTiers?.armor || e.upgrades.armor,
      };
      e.recomputePlayerStats(true);
      sound.playPowerUp();
    }
    e.emitHudUpdate();
    return res;
  }

  setOpen(open) {
    const e = this.engine;
    if (open) {
      if (e.status === GameStatus.PLAYING || e.status === GameStatus.BOSS_INTRO) {
        if (!e.inBaseRepairZone) {
          e.setStatusBanner(
            'HANGAR UNAVAILABLE: RETURN TO ALLIED BASE REPAIR ZONE TO UPGRADE',
            2.5
          );
          return false;
        }
        e.isHangarPaused = true;
      }
      e.isHangarOpen = true;
      e.isHangarPaused = e.status !== GameStatus.MENU;
      e.keys = {};
      e.isMouseDown = false;
      e.hangarStage ||= new HangarStage(e.modelFactory, e.scene.environment, e.isSoftwareGl);
      e.syncAudioPauseState();
      e.emitHudUpdate();
      return true;
    } else {
      e.isHangarOpen = false;
      e.isHangarPaused = false;
      e.setInspectMode(false);
      e.syncAudioPauseState();
      e.emitHudUpdate();
      return true;
    }
  }

  persistComponentDamage() {
    const e = this.engine;
    if (!e.playerSave) return;
    e.playerSave.componentDamage = { ...e.componentDamage };
    e.playerSave.componentDamageCooldown = e.componentDamageCooldown;
    e.saveRepo?.savePlayerSave?.(e.playerSave);
  }

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
    e.setStatusBanner(`${track.toUpperCase()} DAMAGED: TIER ${e.upgrades[track]} -> ${e.effectiveUpgrades[track]}. HANGAR REPAIR $${componentRepairCost(e.upgrades[track])}`, 4);
    e.emitHudUpdate();
  }

  repairComponent(track) {
    const e = this.engine;
    if (!e.isHangarOpen) return { success: false, reason: 'Open the hangar to repair components.' };
    if (!Object.hasOwn(e.componentDamage, track) || !e.componentDamage[track]) {
      return { success: false, reason: 'This component does not need repair.' };
    }
    const repairCost = componentRepairCost(e.upgrades[track]);
    if ((e.playerSave.credits || 0) < repairCost) {
      return { success: false, reason: `Insufficient credits. Repair costs $${repairCost}.` };
    }
    e.playerSave.credits -= repairCost;
    e.componentDamage[track] = false;
    e.recomputePlayerStats(true);
    e.persistComponentDamage();
    e.emitHudUpdate();
    return { success: true, reason: `${track.toUpperCase()} restored to Tier ${e.upgrades[track]}. Paid $${repairCost}.` };
  }

  restoreAllComponents() {
    const e = this.engine;
    e.componentDamage = Object.fromEntries(COMPONENT_TRACKS.map((t) => [t, false]));
    e.componentDamageCooldown = 0;
    e.componentWaterEgress = false;
    e.persistComponentDamage();
    e.recomputePlayerStats(true);
    e.emitHudUpdate();
  }

  upgradeTrack(track) {
    const e = this.engine;
    if (!e.isHangarOpen || !Object.hasOwn(UPGRADE_MAX_LEVEL, track)) {
      return { success: false, reason: 'Select a system in the hangar first.' };
    }
    const curLvl = e.upgrades[track] || 1;
    const maxLvl = UPGRADE_MAX_LEVEL[track] || 5;
    if (curLvl >= maxLvl) {
      return { success: false, reason: 'Already at maximum tier (Tier 5).' };
    }
    const nextTier = curLvl + 1;
    const cost = TRACK_UPGRADE_COSTS[nextTier] || 500;
    const credits = e.playerSave?.credits || 0;
    if (credits < cost) {
      return {
        success: false,
        reason: `Insufficient Credits (Need $${cost}).`,
      };
    }

    e.playerSave.credits -= cost;
    e.upgrades[track] = nextTier;
    e.syncCampaignCredits();
    e.saveRepo?.savePlayerSave?.(e.playerSave);
    e.saveProgress();
    e.recomputePlayerStats(true);
    sound.playPowerUp();
    e.setStatusBanner(
      `${track.toUpperCase()} UPGRADED TO TIER ${nextTier}! (-$${cost})`,
      2.5
    );
    e.emitHudUpdate();
    return { success: true, reason: `Upgraded to Tier ${nextTier}` };
  }

  buyCannonAmmo() {
    const e = this.engine;
    if (!e.isHangarOpen) return { success: false, reason: 'Open the hangar to purchase ammunition.' };
    const maxAmmo = e.getPlayerMaxCannonAmmo();
    if (e.cannonAmmo >= maxAmmo) {
      return { success: false, reason: `Ammunition magazine is full (${maxAmmo} shells).` };
    }
    const cost = CANNON_AMMO.CREDIT_PRICE_PER_PACK;
    if ((e.playerSave.credits || 0) < cost) {
      return { success: false, reason: `Insufficient Credits (Need ${cost}).` };
    }
    e.playerSave.credits -= cost;
    e.cannonAmmo = Math.min(maxAmmo, e.cannonAmmo + CANNON_AMMO.SHELLS_PER_PACK);
    e.syncCampaignCredits();
    e.saveRepo.savePlayerSave(e.playerSave);
    sound.playPowerUp();
    e.setStatusBanner(`+${CANNON_AMMO.SHELLS_PER_PACK} SHELLS PURCHASED! (${e.cannonAmmo}/${maxAmmo}) (-${cost})`, 2.5);
    e.emitHudUpdate();
    return { success: true, reason: `+${CANNON_AMMO.SHELLS_PER_PACK} shells purchased (${e.cannonAmmo}/${maxAmmo}).` };
  }

  buyMissile() {
    const e = this.engine;
    if (!e.isHangarOpen) return { success: false, reason: 'Open the hangar to purchase missiles.' };
    const maxMissiles = e.getPlayerMaxMissileAmmo();
    if (e.missileAmmo >= maxMissiles) {
      return { success: false, reason: `Missile magazine is full (${maxMissiles}).` };
    }
    const cost = MISSILE.CREDIT_PRICE;
    if ((e.playerSave.credits || 0) < cost) {
      return { success: false, reason: `Insufficient Credits (Need $${cost}).` };
    }
    e.playerSave.credits -= cost;
    e.missileAmmo++;
    e.syncCampaignCredits();
    e.playerSave.missileAmmo = e.missileAmmo;
    e.saveRepo.savePlayerSave(e.playerSave);
    e.recomputePlayerStats(true);
    sound.playPowerUp();
    e.setStatusBanner(`+1 MISSILE PURCHASED! (${e.missileAmmo}/${maxMissiles}) (-$${cost})`, 2.5);
    e.emitHudUpdate();
    return { success: true, reason: `+1 missile purchased (${e.missileAmmo}/${maxMissiles}).` };
  }

  buyApsCharge() {
    const e = this.engine;
    if (!e.isHangarOpen) {
      return { success: false, reason: 'Open the hangar to purchase APS charges.' };
    }
    const maxAps = e.getPlayerMaxApsAmmo();
    const currentTotal = e.apsAmmo.reduce((a, b) => a + b, 0);
    if (currentTotal >= maxAps) {
      return { success: false, reason: `APS magazine is already at maximum capacity (${maxAps} charges).` };
    }
    const cost = APS.CHARGE_CREDIT_PRICE || 1000;
    const credits = e.playerSave?.credits || 0;
    if (credits < cost) {
      return {
        success: false,
        reason: `Insufficient Credits (Need $${cost}).`,
      };
    }

    e.playerSave.credits -= cost;
    e.addApsRounds(1);
    e.syncCampaignCredits();
    e.playerSave.apsAmmo = [...e.apsAmmo];
    e.playerSave.repairKitCharges = e.repairKitState?.charges ?? 0;
    e.saveRepo.savePlayerSave(e.playerSave);
    sound.playPowerUp();
    const newTotal = e.apsAmmo.reduce((a, b) => a + b, 0);
    e.setStatusBanner(
      `+1 APS CHARGE PURCHASED! (${newTotal}/${maxAps}) (-$${cost})`,
      2.5
    );
    e.emitHudUpdate();
    return { success: true, total: newTotal, reason: `+1 APS charge purchased (${newTotal}/${maxAps}).` };
  }

  toggleFavoritePart(instanceId) {
    const e = this.engine;
    const part = (e.playerSave.parts || []).find((p) => p.instanceId === instanceId);
    if (part) {
      part.isFavorite = !part.isFavorite;
      e.saveRepo.savePlayerSave(e.playerSave);
      e.emitHudUpdate();
    }
  }

  abortMissionToHangar() {
    const e = this.engine;
    if (e.survivalState) {
      const campaignSave = e.campaignSaveRepo?.loadPlayerSave();
      if (campaignSave && !e.survivalState.recordSummary) {
        e.survivalState.recordSummary = recordSurvivalRun(
          campaignSave,
          e.survivalState,
          e.kills
        );
        e.campaignSaveRepo.savePlayerSave(campaignSave);
      }
      e.survivalState = null;
      e.setProfileMode('campaign');
      e.status = GameStatus.MENU;
      sound.stopEngineLoop();
      e.syncAudioPauseState();
      e.emitHudUpdate();
      return;
    }
    if (e.activeMissionRun && !e.activeMissionRun.rewardsCommitted) {
      const summary = settleMission({
        playerSave: e.playerSave,
        missionRun: e.activeMissionRun,
        outcome: 'defeat',
      });
      e.lastSettlementSummary = summary;
      e.playerSave.apsAmmo = [...e.apsAmmo];
      e.playerSave.repairKitCharges = e.repairKitState?.charges ?? 0;
      e.saveRepo.savePlayerSave(e.playerSave);
      e.saveRepo.recordMissionRun(e.activeMissionRun);
      e.syncCampaignCredits();
      e.saveProgress();
    }
    if (e.profileMode !== 'campaign') {
      e.setProfileMode('campaign');
    }
    e.status = GameStatus.MENU;
    sound.stopEngineLoop();
    e.syncAudioPauseState();
    e.emitHudUpdate();
  }
}
