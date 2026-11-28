import { COMPONENT_TRACKS, normalizeComponentDamage } from '../../sim/component-damage.js';
import { CONTRACT_CONFIG } from '../../sim/contract.js';
import { getSafeStorage } from '../../sim/garage.js';
import { createDefaultHqTree, normalizeHqTree } from '../../sim/hq-tree.js';
import { createRepairKitState } from '../../sim/subsystems.js';
import { SURVIVAL_CONFIG } from '../../sim/survival.js';
import { getMaxApsAmmo, getMaxCannonAmmo, getMaxMissileAmmo, getMaxRepairKitCharges, UPGRADE_MAX_LEVEL } from '../constants.js';
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
        key: 'battle_tank_survival_tank_config',
      };
    }
    if (engine.profileMode === 'contract') {
      return {
        storage: getSafeStorage('session'),
        key: 'battle_tank_contract_tank_config',
      };
    }
    return {
      storage: getSafeStorage('local'),
      key: 'battle_tank_tank_config',
    };
  }

  loadSavedProgress() {
    const { engine } = this;
    try {
      const { storage, key } = this.getUpgradesStorage();
      const saved = storage?.getItem(key);
      const parsed = saved ? JSON.parse(saved) : null;
      if (parsed) {
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
      const frameTier = engine.upgrades?.frame || 1;
      engine.componentDamage = normalizeComponentDamage();
      engine.componentDamageCooldown = 0;
      engine.apsOwned = Boolean(parsed?.apsOwned);
      engine.atgmOwned = Boolean(parsed?.atgmOwned);
      engine.reconDroneOwned = Boolean(parsed?.reconDroneOwned);
      if (engine.apsOwned) {
        const maxAps = engine.getPlayerMaxApsAmmo ? engine.getPlayerMaxApsAmmo() : getMaxApsAmmo(frameTier);
        engine.apsAmmo = [0, 0, 0, 0];
        distributeApsRounds(engine.apsAmmo, maxAps, maxAps);
      } else {
        engine.apsAmmo = [0, 0, 0, 0];
      }
      engine.missileAmmo = engine.atgmOwned
        ? (engine.getPlayerMaxMissileAmmo ? engine.getPlayerMaxMissileAmmo() : getMaxMissileAmmo(frameTier))
        : 0;
      const maxRepair = engine.getPlayerMaxRepairKitCharges ? engine.getPlayerMaxRepairKitCharges() : getMaxRepairKitCharges(frameTier);
      engine.repairKitState = createRepairKitState(maxRepair, maxRepair);
      engine.cannonAmmo = engine.getPlayerMaxCannonAmmo
        ? engine.getPlayerMaxCannonAmmo()
        : getMaxCannonAmmo(frameTier);
      if (engine.profileMode === 'campaign') {
        engine.hqTree = normalizeHqTree(engine.playerSave?.hqTree);
      } else {
        const parsedHq = parsed?.hqTree;
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
      const inBattle = Boolean(engine.isBattleActive?.());
      const upgradesToSave =
        inBattle && engine.preBattleUpgrades
          ? engine.preBattleUpgrades
          : engine.upgrades;
      const hqTreeToSave = normalizeHqTree(
        inBattle && engine.preBattleHqTree
          ? engine.preBattleHqTree
          : engine.hqTree
      );
      const tankState = {
        ...upgradesToSave,
        apsOwned: Boolean(inBattle ? engine.preBattleApsOwned : engine.apsOwned),
        atgmOwned: Boolean(inBattle ? engine.preBattleAtgmOwned : engine.atgmOwned),
        reconDroneOwned: Boolean(inBattle ? engine.preBattleReconDroneOwned : engine.reconDroneOwned),
      };
      if (engine.profileMode === 'campaign') {
        storage?.setItem(key, JSON.stringify(tankState));
        if (engine.playerSave) {
          engine.playerSave.hqTree = hqTreeToSave;
          engine.saveRepo?.savePlayerSave?.(engine.playerSave);
        }
      } else {
        storage?.setItem(
          key,
          JSON.stringify({
            ...tankState,
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
        engine.saveRepo.savePlayerSave(engine.playerSave);
      }
      this.saveProgress();
    } else {
      this.loadSavedProgress();
      engine.componentWaterEgress = false;
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

