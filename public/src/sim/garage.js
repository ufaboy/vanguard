/**
 * Garage, Inventory, Workshop, Mount Validation, Loot Lifecycle,
 * Mission Settlement (Victory vs Defeat), and LocalStorage SaveRepository.
 */

import { resolveUpgradedPartStats } from './catalog.js';
import { settleContractMission } from './contract.js';

export function createInitialPlayerSave() {
  return {
    credits: 500,
    unlockedMissions: ['mission_01', 'mission_02', 'mission_03'],
    completedMissions: {},
    achievements: {},
    medals: {},
    medalProgress: {},
    serviceXp: 0,
    stats: {
      totalKills: 0,
      totalBattles: 0,
      totalVictories: 0,
      totalBlocksDestroyed: 0,
    },
  };
}

const DEFAULT_ARMOR_PANELS = [
  { socketId: 'SOCKET_ARMOR_FRONT', definitionId: 'sb_40' },
  { socketId: 'SOCKET_ARMOR_LEFT', definitionId: 'ekran_b25_left' },
  { socketId: 'SOCKET_ARMOR_RIGHT', definitionId: 'ekran_b25_right' },
];

export function resolveAssembledTank() {
  const hull = resolveUpgradedPartStats('hull', 'bars_m1');
  const turret = resolveUpgradedPartStats('turret', 't_01');
  const gun = resolveUpgradedPartStats('gun', 'sokol_90');

  const armorPanels = {};
  let armorPanelsMass = 0;
  for (const { socketId, definitionId } of DEFAULT_ARMOR_PANELS) {
    const stats = resolveUpgradedPartStats('armorPanel', definitionId);
    if (stats) {
      armorPanels[socketId] = {
        ...stats,
        integrity: stats.maxIntegrity,
        destroyed: false,
      };
      armorPanelsMass += stats.mass || 0;
    }
  }

  const payloadMass = Number(
    ((turret.mass || 0) + (gun.mass || 0) + armorPanelsMass).toFixed(2)
  );
  const totalMass = Number(((hull.mass || 22) + payloadMass).toFixed(2));
  const powerToWeight = Number(
    ((hull.enginePower || 650) / totalMass).toFixed(1)
  );

  const loadRatio = payloadMass / Math.max(1, hull.maxPayloadMass || 18);
  const mobilityFactor =
    loadRatio > 0.9 ? 0.92 : loadRatio < 0.65 ? 1.04 : 1.0;
  const effectiveMaxSpeedForward = Number(
    (hull.maxSpeedForward * mobilityFactor).toFixed(1)
  );

  return {
    hull,
    turret,
    gun,
    armorPanels,
    payloadMass,
    maxPayloadMass: hull.maxPayloadMass,
    totalMass,
    totalMassTons: totalMass,
    maxChassisLoadTons: Number(
      ((hull.mass || 22) + (hull.maxPayloadMass || 18)).toFixed(1)
    ),
    overweight: payloadMass > (hull.maxPayloadMass || 18),
    powerToWeight,
    effectiveMaxSpeedForward,
    effectiveMaxSpeedReverse: Number(
      (hull.maxSpeedReverse * mobilityFactor).toFixed(1)
    ),
    effectiveTurnRate: Number((hull.turnRate * mobilityFactor).toFixed(1)),
    topSpeedKmh: Math.round(effectiveMaxSpeedForward),
  };
}

const HARD_MODE_VICTORY_CREDIT_BONUS_PCT = 0.25;

export function settleMission({
  playerSave,
  missionRun,
  outcome = 'victory',
}) {
  if (!playerSave || !missionRun) {
    return {
      outcome,
      creditsGained: 0,
      hardMode: false,
      hardModeBonus: 0,
      autoCollectedCount: 0,
      lostCount: 0,
    };
  }

  if (missionRun.isContract || missionRun.gameMode === 'contract') {
    return settleContractMission({ playerSave, missionRun, outcome });
  }

  if (missionRun.rewardsCommitted) {
    return (
      missionRun.lastSettlement || {
        outcome: missionRun.status || outcome,
        creditsGained: missionRun.committedCreditsGained || 0,
        hardMode: Boolean(missionRun.hardMode),
        hardModeBonus: missionRun.committedHardModeBonus || 0,
        bossReward: missionRun.bossReward || null,
        autoCollectedCount: 0,
        lostCount: 0,
      }
    );
  }

  let creditsGained = 0;
  let hardModeBonus = 0;
  if (outcome === 'victory' && missionRun.completionReward) {
    const baseCredits = missionRun.completionReward.credits || 400;
    hardModeBonus = missionRun.hardMode ? Math.round(baseCredits * HARD_MODE_VICTORY_CREDIT_BONUS_PCT) : 0;
    creditsGained += baseCredits + hardModeBonus;
  }

  playerSave.credits = (playerSave.credits || 0) + creditsGained;
  missionRun.status = outcome;
  missionRun.rewardsCommitted = true;
  missionRun.committedCreditsGained = creditsGained;
  missionRun.committedHardModeBonus = hardModeBonus;

  const summary = {
    outcome,
    creditsGained,
    hardMode: Boolean(missionRun.hardMode),
    hardModeBonus,
    bossReward: missionRun.bossReward || null,
    autoCollectedCount: 0,
    lostCount: 0,
  };
  missionRun.lastSettlement = summary;
  return summary;
}

/** Safely resolves `localStorage` or `sessionStorage`, returning `null` if access is blocked (e.g. strict iframe). */
export function getSafeStorage(kind = 'local') {
  try {
    const storage = kind === 'session'
      ? (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
      : (typeof localStorage !== 'undefined' ? localStorage : null);
    return storage ?? null;
  } catch {
    return null;
  }
}

export class SaveRepository {
  constructor(
    storageKey = 'battle_tank_player_save',
    storage = getSafeStorage('local')
  ) {
    this.storageKey = storageKey;
    this.storage = storage;
    this._pendingSave = null;
    this._flushTimer = null;
    this._flushIdleId = null;
  }

  _cancelScheduledFlush() {
    if (this._flushTimer !== null) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    if (this._flushIdleId !== null && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(this._flushIdleId);
      this._flushIdleId = null;
    }
  }

  _writeNow(playerSave) {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(playerSave));
    } catch {
      // ignore storage errors
    }
  }

  flushPendingSave() {
    this._cancelScheduledFlush();
    if (!this._pendingSave) return;
    const pending = this._pendingSave;
    this._pendingSave = null;
    this._writeNow(pending);
  }

  loadPlayerSave() {
    try {
      const raw = this.storage?.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          delete parsed.alloys;
          delete parsed.cannonAmmo;
          delete parsed.parts;
          delete parsed.activeTankId;
          delete parsed.saveVersion;
          if (!Number.isFinite(parsed.credits) || parsed.credits < 0) {
            parsed.credits = 500;
          }
          if (!Array.isArray(parsed.unlockedMissions)) {
            parsed.unlockedMissions = ['mission_01', 'mission_02', 'mission_03'];
          }
          if (!parsed.completedMissions || typeof parsed.completedMissions !== 'object' || Array.isArray(parsed.completedMissions)) {
            parsed.completedMissions = {};
          }
          if (!parsed.achievements || typeof parsed.achievements !== 'object' || Array.isArray(parsed.achievements)) {
            parsed.achievements = {};
          }
          if (!parsed.medalProgress || typeof parsed.medalProgress !== 'object' || Array.isArray(parsed.medalProgress)) {
            parsed.medalProgress = {};
          }
          if (!parsed.stats || typeof parsed.stats !== 'object' || Array.isArray(parsed.stats)) {
            parsed.stats = {
              totalKills: 0,
              totalBattles: 0,
              totalVictories: 0,
              totalBlocksDestroyed: 0,
            };
          }
          this.savePlayerSave(parsed);
          return parsed;
        }
      }
    } catch {
      // ignore storage errors
    }
    const initial = createInitialPlayerSave();
    this.savePlayerSave(initial);
    return initial;
  }

  savePlayerSave(playerSave, { defer = false } = {}) {
    if (!defer || typeof window === 'undefined') {
      this._cancelScheduledFlush();
      this._pendingSave = null;
      this._writeNow(playerSave);
      return;
    }
    this._pendingSave = playerSave;
    if (this._flushTimer !== null || this._flushIdleId !== null) return;
    if (typeof requestIdleCallback === 'function') {
      this._flushIdleId = requestIdleCallback(() => {
        this._flushIdleId = null;
        this.flushPendingSave();
      }, { timeout: 1000 });
    } else {
      this._flushTimer = setTimeout(() => {
        this._flushTimer = null;
        this.flushPendingSave();
      }, 600);
    }
  }

  recordMissionRun() {
    // No-op or optional mission history log
  }
}
