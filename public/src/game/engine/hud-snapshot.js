/** Builds the HUD snapshot payload emitted to the UI layer. */

import {
  PLAYER_UPGRADES,
  TRACK_UPGRADE_COSTS,
  UPGRADE,
} from '../constants.js';
import { SECTORS, TILE_SIZE } from '../levels.js';
import { SECTOR_BOSS_CONFIGS } from '../tanks.js';
import { getObservedEnemyCondition } from '../../sim/ai.js';
import { buildContractHudSnapshot } from '../../sim/contract.js';
import { buildSurvivalHudSnapshot } from '../../sim/survival.js';

export function buildHudSnapshot(engine) {
  const sector = SECTORS[engine.currentSectorIndex];
  const boss = engine.enemies.find((e) => e.isBoss);
  const spawnersRemaining = engine.getSpawnerCells().length;

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

  const sensorContactsList = Array.from(engine.sensorContacts.values()).map((c) => ({
    enemyId: c.enemyId,
    x: c.x,
    z: c.z,
    active: c.active,
    age: c.age,
    source: c.source,
  }));

  return {
    status: engine.status,
    sectorId: engine.currentSectorIndex,
    credits: engine.playerSave?.credits ?? 0,
    creditsEarnedThisMission: engine.creditsEarnedThisMission || 0,
    isHangarOpen: engine.isHangarOpen,
    isHangarPaused: engine.isHangarPaused,
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
      engine.vanguardRemainingToSpawn
    ),
    playerSave: engine.playerSave,
    assembledTank: engine.assembledTank,
    lastSettlementSummary: engine.lastSettlementSummary,
    aiDebugMode: engine.aiDebugMode,
    playerX: engine.playerX,
    playerZ: engine.playerZ,
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
    repairKitCount: engine.repairKitCount,
    empTimer: engine.empTimer,
    jammedTimer: engine.jammedTimer,
    inBaseRepairZone: engine.inBaseRepairZone,
    baseAlive: engine.baseAlive,
    gameMode: engine.activeMapRules?.gameMode || sector.gameMode || 'extermination',
    mapModeName: engine.activeMapRules?.name || 'Total Extermination',
    mapObjectiveLabel:
      engine.activeMapRules?.shortLabel || 'DESTROY ALL HOSTILES',
    defeatOnBaseLoss: Boolean(engine.activeMapRules?.defeatOnBaseLoss),
    enemyBaseAlive: Boolean(engine.enemyBaseAlive),
    enemyBaseHp: Math.ceil(engine.enemyBaseHp || 0),
    enemyBaseMaxHp: engine.enemyBaseMaxHp || 48,
    enemyBaseName: engine.enemyBaseName || 'Enemy Fortified Citadel',
    enemiesRemaining: engine.survivalState
      ? engine.enemies.length +
        engine.vanguardRemainingToSpawn +
        (engine.survivalState.waveSpec?.isBossWave && !engine.bossSpawned ? 1 : 0)
      : engine.enemies.length +
        engine.vanguardRemainingToSpawn +
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
      : sector.vanguardCount +
        (sector.rules.spawnSectorBossOnClear
          ? sector.bossSequence?.length
            ? sector.bossSequence.reduce((s, st) => s + st.length, 0)
            : 1
          : 0),
    spawnersRemaining,
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
    bossCondition: boss ? getObservedEnemyCondition(boss) : 'INTACT',
    bossHp: boss ? Math.ceil(boss.hp) : 0,
    bossMaxHp: boss ? boss.maxHp : 1,
    bossPhaseLabel: boss
      ? boss.titanOverload
        ? 'OVERLOAD'
        : boss.mammothEnraged || boss.hydraEnraged || boss.infernoEnraged || boss.titanEscortCalled
        ? 'PHASE 2'
        : 'PHASE 1'
      : 'PHASE 1',
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
    statusMessage: engine.statusMessage,
  };
}

