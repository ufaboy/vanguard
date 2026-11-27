/** Builds the HUD snapshot payload emitted to the UI layer. */

import {
  PLAYER_UPGRADES,
  RADAR_RANGE_CELLS,
  TRACK_UPGRADE_COSTS,
  UPGRADE,
} from '../constants.js';
import { SECTORS, GRID_SIZE, TILE_SIZE } from '../levels.js';
import { SECTOR_BOSS_CONFIGS } from '../vehicles/tanks.js';
import { getObservedEnemyCondition } from '../../sim/ai.js';
import { buildContractHudSnapshot } from '../../sim/contract.js';
import {
  JAMMER_ECM,
  applyRadarJamming,
  isPointWithinJammerRadius,
} from '../../sim/jammer.js';
import { buildSurvivalHudSnapshot } from '../../sim/survival.js';
import { getRankProgress } from '../../sim/medals.js';
import { N_ } from '../../i18n/index.js';
import { isActiveAirStrikeMission } from './air-support-controller.js';

export function buildHudSnapshot(engine) {
  const sector = SECTORS[engine.currentSectorIndex];
  const boss = engine.enemies.find((e) => e.isBoss);

  const cannonSpec =
    PLAYER_UPGRADES[UPGRADE.CANNON][(engine.effectiveUpgrades.cannon || 1) - 1];
  const chassisSpec =
    PLAYER_UPGRADES[UPGRADE.CHASSIS][(engine.effectiveUpgrades.chassis || 1) - 1];
  const frameSpec =
    PLAYER_UPGRADES[UPGRADE.FRAME][(engine.effectiveUpgrades.frame || 1) - 1];
  const engineSpec =
    PLAYER_UPGRADES[UPGRADE.ENGINE][(engine.effectiveUpgrades.engine || 1) - 1];
  const armorSpec =
    PLAYER_UPGRADES[UPGRADE.ARMOR][(engine.effectiveUpgrades.armor || 1) - 1];

  const apsTotal = engine.apsAmmo.reduce((a, b) => a + b, 0);

  let observedTarget = null;
  const priorityUnit = engine.enemies.find((e) => e.id === engine.priorityTargetId);
  const aimedUnit =
    priorityUnit ||
    engine.enemies.find((e) => Math.hypot(e.x - engine.aimWorld.x, e.z - engine.aimWorld.z) <= 2.4);
  if (aimedUnit) {
    observedTarget = {
      id: aimedUnit.id,
      name: aimedUnit.name,
      condition: getObservedEnemyCondition(aimedUnit),
      isPriority: aimedUnit.id === engine.priorityTargetId,
      aiState: engine.aiDebugMode ? aimedUnit.ai?.state : null,
      aiActions: engine.aiDebugMode ? engine.enemyActionSummary(aimedUnit) : null,
    };
  }

  const rawSensorContacts = Array.from(engine.sensorContacts.values()).map((c) => ({
    enemyId: c.enemyId,
    x: c.x,
    z: c.z,
    active: c.active,
    age: c.age,
    source: c.source,
  }));
  const radarJammed = isPointWithinJammerRadius(
    engine.playerX,
    engine.playerZ,
    engine.enemies,
    JAMMER_ECM.RADAR_RADIUS_CELLS * TILE_SIZE
  );
  const apsJammed =
    (engine.playerEmpDisruptTimer || 0) > 0 ||
    isPointWithinJammerRadius(
      engine.playerX,
      engine.playerZ,
      engine.enemies,
      JAMMER_ECM.SYSTEM_RADIUS_CELLS * TILE_SIZE
    );
  const hqBonuses = engine.getHqBonuses?.();
  const radarSpec = PLAYER_UPGRADES[UPGRADE.RADAR][(engine.effectiveUpgrades?.radar || 1) - 1];
  const radarRangeCells = (radarSpec?.radarRangeCells ?? RADAR_RANGE_CELLS) + (hqBonuses?.radarBonusCells || 0);
  const sensorContactsList = radarJammed
    ? applyRadarJamming(rawSensorContacts, {
        playerX: engine.playerX,
        playerZ: engine.playerZ,
        elapsed: engine.clock?.elapsedTime ?? (typeof performance !== 'undefined' ? performance.now() * 0.001 : 0),
        radarRange: radarRangeCells * TILE_SIZE,
        halfArena: (GRID_SIZE * TILE_SIZE) / 2,
      })
    : rawSensorContacts;

  return {
    status: engine.status,
    defeatCinematicsActive: (engine.defeatCinematicsTimer || 0) > 0,
    victoryCinematicsActive: (engine.victoryCinematicsTimer || 0) > 0,
    sectorId: engine.currentSectorIndex,
    credits: engine.getAvailableCredits ? engine.getAvailableCredits() : (engine.playerSave?.credits ?? 0),
    creditsEarnedThisMission: engine.creditsEarnedThisMission || 0,
    isGarageOpen: engine.isGarageOpen,
    isGaragePaused: engine.isGaragePaused,
    trackUpgradeCosts: TRACK_UPGRADE_COSTS,
    componentDamage: { ...engine.componentDamage },
    effectiveUpgrades: engine.effectiveUpgrades,
    playerHp: Math.round(engine.playerHp * 10) / 10,
    playerMaxHp: engine.playerMaxHp,
    playerStats: engine.playerStats,
    cannonName: cannonSpec.name,
    chassisName: chassisSpec.name,
    frameName: frameSpec.name,
    engineName: engineSpec.name,
    armorName: armorSpec.name,
    playerFireCooldown: Math.max(0, engine.playerFireCooldown),
    playerMaxFireCooldown: Math.max(0.1, engine.playerMaxFireCooldown || engine.playerStats?.fireCooldown || 1.25),
    speedKmh: Math.round(Math.abs(engine.playerForwardSpeed || 0) * 9.5),
    playerForwardSpeed: engine.playerForwardSpeed || 0,
    currentSurface:
      typeof engine.currentSurface === 'string'
        ? engine.currentSurface
        : engine.currentSurface?.label || engine.currentSurface?.id || 'asphalt',
    subsystems: engine.subsystems,
    playerArmorPanels: engine.playerArmorPanels,
    repairKitState: engine.repairKitState,
    smokeCharges: engine.smokeCharges,
    smokeCooldown: engine.smokeCooldown,
    priorityTargetId: engine.priorityTargetId,
    observedTarget,
    sensorContacts: sensorContactsList,
    discoveredMines: (engine.mines || [])
      .filter((m) => m && m.discovered)
      .map((m) => ({ id: m.id, x: m.x, z: m.z })),
    lootContainers: engine.lootContainers.map((c) => ({
      id: c.id,
      x: c.x,
      z: c.z,
      status: c.status,
      reward: c.reward,
    })),
    contract: buildContractHudSnapshot(engine.contractState, engine.playerX, engine.playerZ, TILE_SIZE),
    survival: buildSurvivalHudSnapshot(
      engine.survivalState,
      engine.enemies.length,
      engine.enemiesRemainingToSpawn
    ),
    playerSave: engine.playerSave,
    assembledTank: engine.assembledTank,
    lastSettlementSummary: engine.lastSettlementSummary,
    aiDebugMode: engine.aiDebugMode,
    playerX: engine.playerX,
    playerZ: engine.playerZ,
    baseCenter: engine.sectorLoader.getCommandBaseCenter(),
    playerHullAngle: engine.playerHullAngle,
    playerTurretAngle: engine.playerTurretAngle,
    cameraAzimuth: engine.cameraAzimuth,
    apsAmmo: [...engine.apsAmmo],
    apsTotal,
    apsMaxAmmo: engine.getPlayerMaxApsAmmo(),
    missileAmmo: engine.missileAmmo,
    missileMaxAmmo: engine.getPlayerMaxMissileAmmo(),
    cannonAmmo: engine.cannonAmmo,
    cannonMaxAmmo: engine.getPlayerMaxCannonAmmo(),
    missileCooldown: engine.missileCooldown,
    apsOwned: Boolean(engine.apsOwned),
    atgmOwned: Boolean(engine.atgmOwned),
    reconDroneOwned: Boolean(engine.reconDroneOwned),
    reconDroneCooldown: Math.max(0, engine.reconDroneCooldown || 0),
    reconDroneActiveTimer: Math.max(0, engine.reconDroneActiveTimer || 0),
    reconDronePhase: engine.reconDroneMission?.phase || null,
    airStrikeActive: (engine.airSupportMissions || []).some(isActiveAirStrikeMission),
    repairKitCount: engine.repairKitCount,
    empTimer: engine.empTimer,
    radarJammed,
    apsJammed,
    inBaseRepairZone: engine.inBaseRepairZone,
    baseAlive: engine.baseAlive,
    baseHp: Math.ceil(engine.baseHp ?? (engine.baseAlive ? 1 : 0)),
    baseMaxHp: engine.baseMaxHp || 1,
    gameMode: engine.activeMapRules?.gameMode || sector.gameMode || 'extermination',
    mapModeName: engine.activeMapRules?.name || N_('Total Extermination'),
    mapObjectiveLabel:
      engine.activeMapRules?.shortLabel || N_('DESTROY ALL HOSTILES'),
    defeatOnBaseLoss: Boolean(engine.activeMapRules?.defeatOnBaseLoss),
    enemyBaseAlive: Boolean(engine.enemyBaseAlive),
    enemyBaseHp: Math.ceil(engine.enemyBaseHp || 0),
    enemyBaseMaxHp: engine.enemyBaseMaxHp || 48,
    enemyBaseName: engine.enemyBaseName || N_('Enemy Fortified Citadel'),
    enemiesRemaining: engine.survivalState
      ? engine.enemies.length +
        engine.enemiesRemainingToSpawn +
        (engine.survivalState.waveSpec?.isBossWave && !engine.bossSpawned ? 1 : 0)
      : engine.enemies.length +
        engine.enemiesRemainingToSpawn +
        (sector.rules.spawnSectorBossOnClear
          ? sector.bossSequence?.length
            ? engine.bossSequenceStarted
              ? sector.bossSequence.slice(engine.bossStageIndex + 1).reduce((s, st) => s + st.length, 0)
              : sector.bossSequence.reduce((s, st) => s + st.length, 0)
            : !engine.bossSpawned
            ? 1
            : 0
          : 0),
    totalEnemiesInSector: engine.survivalState
      ? engine.survivalState.waveSpec?.totalHostiles || 1
      : sector.enemyCount +
        (sector.rules.spawnSectorBossOnClear
          ? sector.bossSequence?.length
            ? sector.bossSequence.reduce((s, st) => s + st.length, 0)
            : 1
          : 0),
    minesActive: engine.mines.length,
    bossActive: Boolean(boss),
    bossName:
      engine.enemies.filter((u) => u.isBoss).length > 1
        ? engine.enemies
            .filter((u) => u.isBoss)
            .map((u) => u.name)
            .join(' & ')
        : boss?.name ||
          engine.survivalState?.waveSpec?.bossName ||
          sector.bossName,
    bossTitle:
      SECTOR_BOSS_CONFIGS[boss?.enemyClass]?.role ||
      engine.survivalState?.waveSpec?.bossTitle ||
      sector.bossTitle,
    bossCondition: boss ? getObservedEnemyCondition(boss) : N_('INTACT'),
    bossHp: boss ? Math.ceil(boss.hp) : 0,
    bossMaxHp: boss ? boss.maxHp : 1,
    bossPhaseLabel: boss
      ? boss.titanOverload
        ? N_('OVERLOAD')
        : boss.mammothEnraged || boss.hydraEnraged || boss.infernoEnraged || boss.titanEscortCalled
        ? N_('PHASE 2')
        : N_('PHASE 1')
      : N_('PHASE 1'),
    bossPhaseShield: boss ? Math.max(0, Math.round((boss.phaseShieldTimer || 0) * 10) / 10) : 0,
    bossApsCharges: boss ? boss.apsCharges ?? 0 : 0,
    bossApsMaxCharges: boss ? boss.apsMaxCharges ?? 0 : 0,
    inForest: engine.inForest,
    inSmoke: engine.inSmoke,
    onIce: engine.onIce,
    onSand: engine.onSand,
    kills: engine.kills,
    blocksDestroyed: engine.blocksDestroyed,
    shotsFired: engine.shotsFired,
    shotsHit: engine.shotsHit,
    medalTrackerState: engine.medalTracker?.snapshot() || null,
    statusMessage: engine.statusMessage,
    airSupportTargeting: engine.airSupportTargeting ? { ...engine.airSupportTargeting } : null,
    profileMode: engine.profileMode || 'campaign',
    playerRankId:
      engine.airSupportController?.getPlayerRankId?.() ||
      getRankProgress(engine.campaignSaveRepo?.loadPlayerSave?.()).currentRank.id,
    hqTree: engine.getHqTree?.() || null,
    radarRangeCells,
    terrainGrid: engine.grid,
  };
}

