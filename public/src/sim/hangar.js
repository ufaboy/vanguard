/**
 * Hangar, Inventory, Workshop, Mount Validation, Loot Lifecycle,
 * Mission Settlement (Victory vs Defeat), and LocalStorage SaveRepository.
 */

import {
  ARMOR_PANEL_CATALOG,
  GUN_CATALOG,
  resolveUpgradedPartStats,
  TURRET_CATALOG,
} from './catalog.js';
import { settleContractMission } from './contract.js';

export function createInitialPlayerSave() {
  return {
    saveVersion: 1,
    credits: 500,
    activeTankId: 'tank_alpha',
    unlockedMissions: ['mission_01', 'mission_02', 'mission_03'],
    completedMissions: {},
    parts: [
      {
        instanceId: 'part_hull_bars_1',
        category: 'hull',
        definitionId: 'bars_m1',
        isFavorite: true,
        equippedOnTankId: 'tank_alpha',
        socketId: 'ROOT_HULL',
      },
      {
        instanceId: 'part_turret_t01_1',
        category: 'turret',
        definitionId: 't_01',
        isFavorite: true,
        equippedOnTankId: 'tank_alpha',
        socketId: 'SOCKET_TURRET',
      },
      {
        instanceId: 'part_gun_sokol_1',
        category: 'gun',
        definitionId: 'sokol_90',
        isFavorite: true,
        equippedOnTankId: 'tank_alpha',
        socketId: 'SOCKET_GUN',
      },
      {
        instanceId: 'part_panel_sb40_1',
        category: 'armorPanel',
        definitionId: 'sb_40',
        isFavorite: false,
        equippedOnTankId: 'tank_alpha',
        socketId: 'SOCKET_ARMOR_FRONT',
      },
      {
        instanceId: 'part_panel_ekran_l_1',
        category: 'armorPanel',
        definitionId: 'ekran_b25_left',
        isFavorite: false,
        equippedOnTankId: 'tank_alpha',
        socketId: 'SOCKET_ARMOR_LEFT',
      },
      {
        instanceId: 'part_panel_ekran_r_1',
        category: 'armorPanel',
        definitionId: 'ekran_b25_right',
        isFavorite: false,
        equippedOnTankId: 'tank_alpha',
        socketId: 'SOCKET_ARMOR_RIGHT',
      },
      {
        instanceId: 'part_mod_rm1_1',
        category: 'module',
        definitionId: 'rm_1',
        isFavorite: true,
        equippedOnTankId: 'tank_alpha',
        socketId: 'SOCKET_MODULE_1',
      },
      {
        instanceId: 'part_mod_smoke_1',
        category: 'module',
        definitionId: 'smoke_gen',
        isFavorite: false,
        equippedOnTankId: 'tank_alpha',
        socketId: 'SOCKET_MODULE_2',
      },
      {
        instanceId: 'part_gun_kopye_spare',
        category: 'gun',
        definitionId: 'kopye_105',
        isFavorite: false,
        equippedOnTankId: null,
        socketId: null,
      },
      {
        instanceId: 'part_gun_grom_spare',
        category: 'gun',
        definitionId: 'grom_120',
        isFavorite: false,
        equippedOnTankId: null,
        socketId: null,
      },
      {
        instanceId: 'part_turret_t02_spare',
        category: 'turret',
        definitionId: 't_02',
        isFavorite: false,
        equippedOnTankId: null,
        socketId: null,
      },
      {
        instanceId: 'part_hull_bastion_spare',
        category: 'hull',
        definitionId: 'bastion_m2',
        isFavorite: false,
        equippedOnTankId: null,
        socketId: null,
      },
    ],
  };
}

export function resolveAssembledTank(
  playerSave,
  tankId = playerSave?.activeTankId || 'tank_alpha'
) {
  const equipped = (playerSave?.parts || []).filter(
    (p) => p.equippedOnTankId === tankId
  );

  const hullPart = equipped.find((p) => p.category === 'hull') || {
    definitionId: 'bars_m1',
  };
  const turretPart = equipped.find((p) => p.category === 'turret') || {
    definitionId: 't_01',
  };
  const gunPart = equipped.find((p) => p.category === 'gun') || {
    definitionId: 'sokol_90',
  };

  const hull = resolveUpgradedPartStats('hull', hullPart.definitionId);
  const turret = resolveUpgradedPartStats('turret', turretPart.definitionId);
  const gun = resolveUpgradedPartStats('gun', gunPart.definitionId);

  const armorPanels = {};
  let armorPanelsMass = 0;
  for (const p of equipped.filter((item) => item.category === 'armorPanel')) {
    const stats = resolveUpgradedPartStats('armorPanel', p.definitionId);
    if (stats && p.socketId) {
      armorPanels[p.socketId] = {
        ...stats,
        instanceId: p.instanceId,
        integrity: stats.maxIntegrity,
        destroyed: false,
      };
      armorPanelsMass += stats.mass || 0;
    }
  }

  const modules = {};
  let modulesMass = 0;
  for (const p of equipped.filter(
    (item) => item.category === 'module' || item.category === 'aux'
  )) {
    const stats = resolveUpgradedPartStats(p.category, p.definitionId);
    if (stats && p.socketId) {
      modules[p.socketId] = {
        ...stats,
        instanceId: p.instanceId,
      };
      modulesMass += stats.mass || 0;
    }
  }

  const payloadMass = Number(
    (
      (turret.mass || 0) +
      (gun.mass || 0) +
      armorPanelsMass +
      modulesMass
    ).toFixed(2)
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
    tankId,
    hull,
    turret,
    gun,
    armorPanels,
    modules,
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

function validateMountCompatibility(
  playerSave,
  candidatePart,
  targetSocketId,
  tankId = playerSave.activeTankId
) {
  if (!candidatePart) {
    return { valid: false, reason: 'Invalid part selection.' };
  }
  const currentAssembled = resolveAssembledTank(playerSave, tankId);

  if (candidatePart.category === 'gun') {
    const gunStats = GUN_CATALOG[candidatePart.definitionId];
    if (!gunStats) return { valid: false, reason: 'Unknown gun definition.' };
    if (gunStats.mass > currentAssembled.turret.maxGunMass) {
      return {
        valid: false,
        reason: `${gunStats.name} mass (${gunStats.mass}t) exceeds ${currentAssembled.turret.name} limit (${currentAssembled.turret.maxGunMass}t). Mount T-02 Heavy Turret first.`,
      };
    }
    return { valid: true, reason: 'Compatible' };
  }

  if (candidatePart.category === 'turret') {
    const turretStats = TURRET_CATALOG[candidatePart.definitionId];
    if (!turretStats)
      return { valid: false, reason: 'Unknown turret definition.' };
    if (currentAssembled.gun.mass > turretStats.maxGunMass) {
      return {
        valid: false,
        reason: `Mounted ${currentAssembled.gun.name} (${currentAssembled.gun.mass}t) is too heavy for ${turretStats.name} (max ${turretStats.maxGunMass}t).`,
      };
    }
    return { valid: true, reason: 'Compatible' };
  }

  return { valid: true, reason: 'Compatible' };
}

export function mountPartInHangar(
  playerSave,
  instanceId,
  targetSocketId = null
) {
  const part = (playerSave?.parts || []).find(
    (p) => p.instanceId === instanceId
  );
  if (!part) return { success: false, reason: 'Part not found in inventory.' };

  const tankId = playerSave.activeTankId || 'tank_alpha';
  const check = validateMountCompatibility(
    playerSave,
    part,
    targetSocketId,
    tankId
  );
  if (!check.valid) {
    return { success: false, reason: check.reason };
  }

  let socket = targetSocketId;
  if (!socket) {
    if (part.category === 'hull') socket = 'ROOT_HULL';
    else if (part.category === 'turret') socket = 'SOCKET_TURRET';
    else if (part.category === 'gun') socket = 'SOCKET_GUN';
    else if (part.category === 'armorPanel')
      socket =
        ARMOR_PANEL_CATALOG[part.definitionId]?.socketType ||
        'SOCKET_ARMOR_FRONT';
    else socket = 'SOCKET_MODULE_1';
  }

  for (const other of playerSave.parts) {
    if (
      other.equippedOnTankId === tankId &&
      (other.socketId === socket ||
        ( ['hull', 'turret', 'gun'].includes(part.category) &&
          other.category === part.category))
    ) {
      other.equippedOnTankId = null;
      other.socketId = null;
    }
  }

  part.equippedOnTankId = tankId;
  part.socketId = socket;
  return { success: true, reason: `Mounted ${part.definitionId.toUpperCase()}` };
}

export function settleMission({
  playerSave,
  missionRun,
  outcome = 'victory',
}) {
  if (!playerSave || !missionRun) {
    return {
      outcome,
      creditsGained: 0,
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
        bossReward: missionRun.bossReward || null,
        autoCollectedCount: 0,
        lostCount: 0,
      }
    );
  }

  let creditsGained = 0;
  if (outcome === 'victory' && missionRun.completionReward) {
    creditsGained += missionRun.completionReward.credits || 400;
  }

  playerSave.credits = (playerSave.credits || 0) + creditsGained;
  missionRun.status = outcome;
  missionRun.rewardsCommitted = true;
  missionRun.committedCreditsGained = creditsGained;

  const summary = {
    outcome,
    creditsGained,
    bossReward: missionRun.bossReward || null,
    autoCollectedCount: 0,
    lostCount: 0,
  };
  missionRun.lastSettlement = summary;
  return summary;
}

export class SaveRepository {
  constructor(
    storageKey = 'iron_vanguard_player_save_v1',
    storage = typeof localStorage !== 'undefined' ? localStorage : null
  ) {
    this.storageKey = storageKey;
    this.storage = storage;
  }

  loadPlayerSave() {
    try {
      const raw = this.storage?.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.parts)) {
          delete parsed.alloys;
          delete parsed.cannonAmmo;
          parsed.parts = parsed.parts.filter(
            (part) => part && typeof part === 'object' && typeof part.instanceId === 'string' && typeof part.category === 'string'
          );
          if (!Number.isFinite(parsed.credits) || parsed.credits < 0) {
            parsed.credits = 500;
          }
          if (!Array.isArray(parsed.unlockedMissions)) {
            parsed.unlockedMissions = ['mission_01', 'mission_02', 'mission_03'];
          }
          if (!parsed.completedMissions || typeof parsed.completedMissions !== 'object' || Array.isArray(parsed.completedMissions)) {
            parsed.completedMissions = {};
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

  savePlayerSave(playerSave) {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(playerSave));
    } catch {
      // ignore storage errors
    }
  }

  recordMissionRun() {
    // No-op or optional mission history log
  }
}
