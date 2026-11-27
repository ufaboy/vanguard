import { COMPONENT_TRACKS, normalizeComponentDamage } from '../../sim/component-damage.js';
import { CONTRACT_CONFIG } from '../../sim/contract.js';
import { getSafeStorage } from '../../sim/garage.js';
import { createDefaultHqTree, normalizeHqTree } from '../../sim/hq-tree.js';
import { createRepairKitState } from '../../sim/subsystems.js';
import { SURVIVAL_CONFIG } from '../../sim/survival.js';
import { APS, MISSILE, UPGRADE_MAX_LEVEL, getMaxApsAmmo, getMaxCannonAmmo, getMaxRepairKitCharges } from '../constants.js';
import { distributeApsRounds } from './player-controller.js';

/** Manages player profile persistence, mode saves, upgrades, and credit grants. */
export class ProfileSaveController {
  constructor(engine) {
    this.engine = engine;
  }

  getUpgradesStorage() {
    const { engine } = this;
    if (engine.profileMode === 'survival') {
      return {
        storage: getSafeStorage('session'),
        key: 'battle_tank_survival_upgrades_v1',
      };
    }
    if (engine.profileMode === 'contract') {
      return {
        storage: getSafeStorage('session'),
        key: 'battle_tank_contract_upgrades_v1',
      };
    }
    return {
      storage: getSafeStorage('local'),
      key: 'battle_tank_upgrades_v3',
    };
  }

  loadSavedProgress() {
    const { engine } = this;
    try {
      const { storage, key } = this.getUpgradesStorage();
      const savedUpgrades = storage?.getItem(key);
      if (savedUpgrades) {
        const parsed = JSON.parse(savedUpgrades);
        engine.upgrades = {
          cannon: Math.min(UPGRADE_MAX_LEVEL.cannon, Math.max(1, parsed.cannon || 1)),
          chassis: Math.min(
            UPGRADE_MAX_LEVEL.chassis,
            Math.max(1, parsed.chassis || 1)
          ),
          frame: Math.min(
            UPGRADE_MAX_LEVEL.frame,
            Math.max(1, parsed.frame || 1)
          ),
          engine: Math.min(UPGRADE_MAX_LEVEL.engine, Math.max(1, parsed.engine || 1)),
          armor: Math.min(UPGRADE_MAX_LEVEL.armor, Math.max(1, parsed.armor || 1)),
          radar: Math.min(UPGRADE_MAX_LEVEL.radar, Math.max(1, parsed.radar || 1)),
        };
      } else {
        engine.upgrades = { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1, radar: 1 };
      }
      if (engine.profileMode === 'campaign') {
        engine.hqTree = normalizeHqTree(engine.playerSave?.hqTree);
      } else {
        const parsedHq = savedUpgrades ? JSON.parse(savedUpgrades)?.hqTree : null;
        engine.hqTree = parsedHq ? normalizeHqTree(parsedHq) : createDefaultHqTree();
      }
    } catch {
      engine.hqTree = createDefaultHqTree();
    }
  }

  saveProgress() {
    const { engine } = this;
    try {
      const { storage, key } = this.getUpgradesStorage();
      const upgradesToSave =
        engine.isBattleActive?.() && engine.preBattleUpgrades
          ? engine.preBattleUpgrades
          : engine.upgrades;
      const hqTreeToSave = normalizeHqTree(
        engine.isBattleActive?.() && engine.preBattleHqTree
          ? engine.preBattleHqTree
          : engine.hqTree
      );
      if (engine.profileMode === 'campaign') {
        storage?.setItem(key, JSON.stringify(upgradesToSave));
        if (engine.playerSave) {
          engine.playerSave.hqTree = hqTreeToSave;
          engine.saveRepo?.savePlayerSave?.(engine.playerSave);
        }
      } else {
        storage?.setItem(
          key,
          JSON.stringify({
            ...upgradesToSave,
            hqTree: hqTreeToSave,
          })
        );
      }
    } catch {
    }
  }

  /** No-op: Contracts and Survival keep session credits isolated from Campaign. */
  syncCampaignCredits() {}

  resetToStockTank() {
    const { engine } = this;
    engine.upgrades = { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1, radar: 1 };
    if (engine.profileMode !== 'campaign') {
      engine.hqTree = createDefaultHqTree();
    }
    engine.componentDamage = Object.fromEntries(COMPONENT_TRACKS.map((t) => [t, false]));
    engine.componentDamageCooldown = 0;
    engine.componentWaterEgress = false;
    engine.apsOwned = false;
    engine.atgmOwned = false;
    engine.reconDroneOwned = false;
    engine.apsAmmo = [0, 0, 0, 0];
    engine.missileAmmo = 0;
    engine.cannonAmmo = getMaxCannonAmmo(1);
    engine.repairKitState = createRepairKitState(0, getMaxRepairKitCharges(1));
  }

  setProfileMode(mode = 'campaign', { resetTank = false } = {}) {
    const { engine } = this;
    engine.profileMode = mode;
    if (mode === 'survival') {
      engine.saveRepo = engine.survivalSaveRepo;
    } else if (mode === 'contract') {
      engine.saveRepo = engine.contractSaveRepo;
    } else {
      engine.saveRepo = engine.campaignSaveRepo;
    }
    engine.playerSave = engine.saveRepo.loadPlayerSave();

    if (mode !== 'campaign' && resetTank) {
      this.resetToStockTank();
      if (engine.playerSave) {
        engine.playerSave.credits =
          mode === 'survival'
            ? SURVIVAL_CONFIG.STARTING_CREDITS
            : CONTRACT_CONFIG.STARTING_CREDITS;
        engine.playerSave.apsOwned = false;
        engine.playerSave.atgmOwned = false;
        engine.playerSave.reconDroneOwned = false;
        engine.playerSave.apsAmmo = [...engine.apsAmmo];
        engine.playerSave.missileAmmo = engine.missileAmmo;
        engine.playerSave.repairKitCharges = 0;
        engine.playerSave.componentDamage = { ...engine.componentDamage };
        engine.playerSave.componentDamageCooldown = 0;
        engine.saveRepo.savePlayerSave(engine.playerSave);
      }
      this.saveProgress();
    } else {
      this.loadSavedProgress();
      engine.componentDamage = normalizeComponentDamage(engine.playerSave?.componentDamage);
      engine.componentDamageCooldown = Math.max(
        0,
        Math.min(8, Number(engine.playerSave?.componentDamageCooldown) || 0)
      );
      engine.componentWaterEgress = false;
      engine.apsOwned = Boolean(engine.playerSave?.apsOwned);
      engine.atgmOwned = Boolean(engine.playerSave?.atgmOwned);
      engine.reconDroneOwned = Boolean(engine.playerSave?.reconDroneOwned);
      engine.apsAmmo = engine.apsOwned && Array.isArray(engine.playerSave?.apsAmmo)
        ? [...engine.playerSave.apsAmmo]
        : [0, 0, 0, 0];
      engine.missileAmmo = engine.atgmOwned && Number.isInteger(engine.playerSave?.missileAmmo)
        ? Math.max(0, Math.min(MISSILE.MAX_AMMO, engine.playerSave.missileAmmo))
        : 0;
      const savedRepairCharges = Number.isInteger(engine.playerSave?.repairKitCharges)
        ? engine.playerSave.repairKitCharges
        : 0;
      engine.repairKitState = createRepairKitState(savedRepairCharges, getMaxRepairKitCharges(engine.upgrades?.frame || 1));
      engine.cannonAmmo = engine.getPlayerMaxCannonAmmo
        ? engine.getPlayerMaxCannonAmmo()
        : getMaxCannonAmmo(engine.upgrades?.frame || 1);
    }
    engine.recomputePlayerStats?.(false);
    engine.syncTemporaryCredits?.();
  }

  applyUpgrades(newUpgrades) {
    const { engine } = this;
    if (!newUpgrades) return;
    engine.upgrades = { ...engine.upgrades, ...newUpgrades };
    engine.recomputePlayerStats(true);
    this.saveProgress();
    engine.emitHudUpdate();
  }

  startSector(sectorIdx) {
    this.engine.startMission(sectorIdx);
  }

  grantCredits(amount) {
    const { engine } = this;
    const delta = Math.max(0, Math.floor(Number(amount) || 0));
    if (!delta || !engine.playerSave) return 0;
    engine.playerSave.credits = (engine.playerSave.credits || 0) + delta;
    if (engine.isBattleActive?.()) {
      engine.temporaryCredits = Math.max(0, Math.floor(engine.temporaryCredits ?? 0)) + delta;
    } else {
      engine.syncTemporaryCredits?.();
    }
    engine.saveRepo?.savePlayerSave?.(engine.playerSave);
    engine.emitHudUpdate();
    return delta;
  }
}

