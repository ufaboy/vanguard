import { COMPONENT_TRACKS, normalizeComponentDamage } from '../../sim/component-damage.js';
import { createRepairKitState } from '../../sim/subsystems.js';
import { SURVIVAL_CONFIG } from '../../sim/survival.js';
import { APS, MISSILE, UPGRADE_MAX_LEVEL, getMaxCannonAmmo } from '../constants.js';

/** Manages player profile persistence, mode saves, upgrades, and credit grants. */
export class ProfileSaveController {
  constructor(engine) {
    this.engine = engine;
  }

  getUpgradesStorage() {
    const { engine } = this;
    if (engine.profileMode === 'survival') {
      return {
        storage: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
        key: 'iron_vanguard_survival_upgrades_v1',
      };
    }
    if (engine.profileMode === 'contract') {
      return {
        storage: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
        key: 'iron_vanguard_contract_upgrades_v1',
      };
    }
    return {
      storage: typeof localStorage !== 'undefined' ? localStorage : null,
      key: 'iron_vanguard_upgrades_v3',
    };
  }

  loadSavedProgress() {
    const { engine } = this;
    try {
      if (engine.profileMode === 'campaign' && typeof localStorage !== 'undefined') {
        localStorage.removeItem('iron_vanguard_highscore');
      }
      const { storage, key } = this.getUpgradesStorage();
      const savedUpgrades = storage?.getItem(key);
      if (savedUpgrades) {
        const parsed = JSON.parse(savedUpgrades);
        engine.upgrades = {
          cannon: Math.min(UPGRADE_MAX_LEVEL.cannon, Math.max(1, parsed.cannon || 1)),
          chassis: Math.min(
            UPGRADE_MAX_LEVEL.chassis,
            Math.max(1, parsed.chassis || parsed.vehicleFrame || 1)
          ),
          frame: Math.min(
            UPGRADE_MAX_LEVEL.frame,
            Math.max(1, parsed.frame || parsed.vehicleFrame || 1)
          ),
          engine: Math.min(UPGRADE_MAX_LEVEL.engine, Math.max(1, parsed.engine || 1)),
          armor: Math.min(UPGRADE_MAX_LEVEL.armor, Math.max(1, parsed.armor || 1)),
        };
      } else {
        engine.upgrades = { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 };
      }
    } catch {
    }
  }

  saveProgress() {
    const { engine } = this;
    try {
      const { storage, key } = this.getUpgradesStorage();
      storage?.setItem(key, JSON.stringify(engine.upgrades));
    } catch {
    }
  }

  syncCampaignCredits() {
    const { engine } = this;
    if (engine.profileMode !== 'contract' || !engine.campaignSaveRepo) return;
    const campaignSave = engine.campaignSaveRepo.loadPlayerSave();
    campaignSave.credits = engine.playerSave?.credits ?? campaignSave.credits;
    engine.campaignSaveRepo.savePlayerSave(campaignSave);
  }

  resetToStockTank() {
    const { engine } = this;
    engine.upgrades = { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 };
    engine.componentDamage = Object.fromEntries(COMPONENT_TRACKS.map((t) => [t, false]));
    engine.componentDamageCooldown = 0;
    engine.componentWaterEgress = false;
    engine.initApsLaunchers(APS.START_ROUNDS);
    engine.missileAmmo = 2;
    engine.cannonAmmo = getMaxCannonAmmo(1);
    engine.repairKitState = createRepairKitState(0);
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
            : engine.campaignSaveRepo?.loadPlayerSave().credits ?? engine.playerSave.credits;
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
      engine.apsAmmo = Array.isArray(engine.playerSave?.apsAmmo)
        ? [...engine.playerSave.apsAmmo]
        : [...APS.INITIAL_PER_LAUNCHER];
      engine.missileAmmo = Number.isInteger(engine.playerSave?.missileAmmo)
        ? Math.max(0, Math.min(MISSILE.MAX_AMMO, engine.playerSave.missileAmmo))
        : 2;
      const savedRepairCharges = Number.isInteger(engine.playerSave?.repairKitCharges)
        ? engine.playerSave.repairKitCharges
        : 0;
      engine.repairKitState = createRepairKitState(savedRepairCharges);
      engine.cannonAmmo = engine.getPlayerMaxCannonAmmo();
    }
    engine.recomputePlayerStats(false);
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
    engine.saveRepo?.savePlayerSave?.(engine.playerSave);
    engine.emitHudUpdate();
    return delta;
  }
}

