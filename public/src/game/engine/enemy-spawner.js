import * as THREE from 'three';
import { createEnemyAIState } from '../../sim/ai.js';
import {
  createBrain,
  createGunnerState,
  resolveBehaviorActions,
} from '../../sim/behavior/index.js';
import { ARMOR_PANEL_CATALOG, HULL_CATALOG, TURRET_CATALOG } from '../../sim/catalog.js';
import { SeededRng } from '../../sim/rng.js';
import { equipAbilities } from '../abilities/index.js';
import { findBorderIngressCell } from '../campaign-navigation.js';
import {
  ARTILLERY,
  BOSS_APS,
  TANK_HIT_RADIUS,
  computeTankStats,
} from '../constants.js';
import { remainingEncounterEnemies, updateEncounters } from '../encounters.js';
import { GRID_SIZE, SECTORS, TILE_SIZE } from '../levels.js';
import { sound } from '../sound.js';
import { SECTOR_BOSS_CONFIGS } from '../tanks.js';
import {
  EnemyClass,
  GameStatus,
  SPECIAL_ENEMY_CATALOG,
  TANK_CONFIGS,
  TANK_TYPES,
  TileType,
  checkMapVictory,
} from '../types.js';

/** Manages enemy/boss spawning, border ingress, wave/encounter scheduling, and enemy factory setup. */
export class EnemySpawnerController {
  constructor(engine) {
    this.engine = engine;
  }

  /** Spawner cells, cached until a cell changes type (see invalidateSpawnerCache). */
  getSpawnerCells() {
    const { engine } = this;
    if (engine._spawnerCells) return engine._spawnerCells;
    const list = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (engine.grid[r][c].type === TileType.SPAWNER) {
          list.push(engine.grid[r][c]);
        }
      }
    }
    engine._spawnerCells = list;
    return list;
  }

  getSpawnPosition() {
    const { engine } = this;
    const safeMinDist = 14.0;
    const pickSafePosition = (positions) => {
      if (!positions.length) return null;
      const far = positions.filter(
        (p) => Math.hypot(p.x - engine.playerX, p.z - engine.playerZ) >= safeMinDist
      );
      if (far.length > 0) {
        const idx = (engine.spawnerRoundRobinIdx || 0) % far.length;
        engine.spawnerRoundRobinIdx = (engine.spawnerRoundRobinIdx || 0) + 1;
        return far[idx];
      }
      let farthest = positions[0];
      let maxDist = -1;
      for (const p of positions) {
        const d = Math.hypot(p.x - engine.playerX, p.z - engine.playerZ);
        if (d > maxDist) {
          maxDist = d;
          farthest = p;
        }
      }
      engine.spawnerRoundRobinIdx = (engine.spawnerRoundRobinIdx || 0) + 1;
      return farthest;
    };

    const spawners = engine.getSpawnerCells();
    if (spawners.length > 0) {
      const freePositions = spawners
        .map((cell) => engine.gridToWorld(cell.row, cell.col))
        .filter((pos) => !engine.enemies.some((e) => Math.hypot(e.x - pos.x, e.z - pos.z) < 1.8));
      return pickSafePosition(freePositions);
    }
    const fallbackEntries = [
      { row: 2, col: 5 },
      { row: 2, col: 13 },
      { row: 2, col: 22 },
      { row: 2, col: 30 },
    ];
    const freeFallbacks = fallbackEntries
      .map((entry) => engine.gridToWorld(entry.row, entry.col))
      .filter((pos) => !engine.enemies.some((e) => Math.hypot(e.x - pos.x, e.z - pos.z) < 1.8));
    return pickSafePosition(freeFallbacks) || engine.gridToWorld(2, 17);
  }

  /**
   * Resolves a clear, unoccupied border spawn position and straight entry target
   * for an enemy heading toward `targetCell`.
   */
  resolveBorderSpawn(
    targetCell,
    {
      enemyClass = null,
      isBoss = false,
      canCrossWater = null,
      outsideMargin = null,
      minPlayerDist = 10,
      losAvoidDist = 0,
    } = {}
  ) {
    const { engine } = this;
    const radius = isBoss ? 1.12 : 0.72;
    const margin = outsideMargin ?? (isBoss ? 3.6 : 2.8);
    const halfArena = (GRID_SIZE * TILE_SIZE) / 2;
    const waterAllowed =
      canCrossWater ??
      Boolean(
        isBoss || (enemyClass && engine.getEnemyLoadoutStats(enemyClass)?.canCrossWater)
      );
    const toSpawnCoords = (edge, entryX, entryZ) => {
      const inset = isBoss ? 1.35 : TILE_SIZE * 0.5;
      if (edge === 'west') {
        return {
          spawnPos: { x: -halfArena - margin, z: entryZ },
          entryTarget: { x: -halfArena + inset, z: entryZ },
        };
      }
      if (edge === 'east') {
        return {
          spawnPos: { x: halfArena + margin, z: entryZ },
          entryTarget: { x: halfArena - inset, z: entryZ },
        };
      }
      return {
        spawnPos: { x: entryX, z: -halfArena - margin },
        entryTarget: { x: entryX, z: -halfArena + inset },
      };
    };

    const ingress = findBorderIngressCell(engine.grid, targetCell, waterAllowed, {
      radius,
      tileSize: TILE_SIZE,
      isOccupied: (wx, wz, info) => {
        const { spawnPos } = toSpawnCoords(info.edge, wx, wz);
        return engine.enemies.some((e) => {
          const minSep = radius + (e.isBoss ? 1.12 : 0.72) + 0.65;
          return (
            Math.hypot(e.x - wx, e.z - wz) < minSep ||
            Math.hypot(e.x - spawnPos.x, e.z - spawnPos.z) < minSep
          );
        });
      },
      isCrowded: (wx, wz, info) => {
        const { spawnPos } = toSpawnCoords(info.edge, wx, wz);
        return engine.enemies.some(
          (e) =>
            Math.hypot(e.x - wx, e.z - wz) < 4.6 ||
            Math.hypot(e.x - spawnPos.x, e.z - spawnPos.z) < 4.6
        );
      },
      isSafeFromPlayer: (wx, wz) => {
        if (engine.playerX === undefined || engine.playerZ === undefined) return true;
        const d = Math.hypot(engine.playerX - wx, engine.playerZ - wz);
        if (d < minPlayerDist) return false;
        if (
          losAvoidDist > 0 &&
          d < losAvoidDist &&
          engine.hasLineOfSight?.(engine.playerX, engine.playerZ, wx, wz)
        ) {
          return false;
        }
        return true;
      },
    });

    if (!ingress) return null;
    return {
      ingress,
      ...toSpawnCoords(ingress.edge, ingress.entryX, ingress.entryZ),
    };
  }

  spawnVanguardEnemy() {
    const { engine } = this;
    const sector = SECTORS[engine.currentSectorIndex];
    const maxConcurrent =
      engine.survivalState?.waveSpec?.maxConcurrentEnemies ??
      sector?.maxConcurrentEnemies ??
      8;
    if (
      engine.vanguardRemainingToSpawn <= 0 ||
      engine.enemies.length >= maxConcurrent
    ) {
      return false;
    }

    const targetPos = engine.getSpawnPosition();
    if (!targetPos) return false;
    const cell = engine.worldToGrid(targetPos.x, targetPos.z);
    const pool = sector.enemyPool || [];
    const hasQueue = engine.enemySpawnQueue && engine.enemySpawnQueue.length > 0;
    const enemyClass = hasQueue
      ? engine.enemySpawnQueue[0]
      : pool[engine.spawnPoolCursor % Math.max(1, pool.length)];
    const spawn = engine.resolveBorderSpawn(cell, { enemyClass });
    if (!spawn) return false;

    if (hasQueue) {
      engine.enemySpawnQueue.shift();
    }
    engine.spawnPoolCursor++;

    engine.createEnemyAt(enemyClass, spawn.spawnPos.x, spawn.spawnPos.z, false, spawn.entryTarget);
    engine.vanguardRemainingToSpawn = engine.enemySpawnQueue
      ? engine.enemySpawnQueue.length
      : Math.max(0, engine.vanguardRemainingToSpawn - 1);
    return true;
  }

  spawnSpecificEnemy(enemyClass) {
    const { engine } = this;
    if (engine.status !== GameStatus.PLAYING) {
      engine.startMission(engine.currentSectorIndex);
    }
    const sector = SECTORS[engine.currentSectorIndex];
    const maxConcurrent = sector?.maxConcurrentEnemies ?? 8;
    if (engine.enemies.length >= maxConcurrent) {
      engine.setStatusBanner(
        `MAX CONCURRENT HOSTILES (${maxConcurrent}) REACHED ON BATTLEFIELD`,
        2.2
      );
      return;
    }
    const { x, z } = engine.getSpawnPosition();
    engine.createEnemyAt(enemyClass, x + (Math.random() - 0.5) * 1.5, z, false);
    const meta =
      TANK_CONFIGS[enemyClass] ||
      SPECIAL_ENEMY_CATALOG.find((m) => m.id === enemyClass);
    if (meta) {
      engine.setStatusBanner(
        `DEPLOYED: ${meta.name.toUpperCase()} (${meta.loadoutSummary})`,
        2.6
      );
    }
    engine.emitHudUpdate();
  }

  spawnBossEntry(sector, bossClass, bossCell) {
    const { engine } = this;
    const bossPos = engine.gridToWorld(bossCell.row, bossCell.col);
    const bRow = bossCell.row;
    const bCol = bossCell.col;
    const breachCells = [];

    if (Array.isArray(sector.bossBreachCells)) {
      breachCells.push(...sector.bossBreachCells);
    } else if (Array.isArray(sector.boss?.breachCells)) {
      breachCells.push(...sector.boss.breachCells);
    } else {
      const rMin = Math.max(1, bRow - 2);
      const rMax = Math.min(GRID_SIZE - 2, bRow <= 12 ? bRow + 6 : bRow + 2);
      const cMin = Math.max(1, bCol - 3);
      const cMax = Math.min(GRID_SIZE - 2, bCol + 3);

      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          breachCells.push({ row: r, col: c });
        }
      }
    }

    for (const b of breachCells) {
      const cell = engine.grid[b.row]?.[b.col];
      if (!cell || cell.type === TileType.EMPTY) continue;
      if (
        cell.type === TileType.BOXES ||
        cell.type === TileType.BRICK ||
        cell.type === TileType.CONCRETE ||
        cell.type === TileType.HEDGEHOG
      ) {
        engine.destroyTileCell(cell);
      } else if (cell.type === TileType.BARREL) {
        engine.explodeBarrel(cell, false);
      }
    }

    const fallbackBossPos = { x: bossPos.x + TILE_SIZE * 0.5, z: bossPos.z };
    const spawn = engine.resolveBorderSpawn(bossCell, {
      enemyClass: bossClass,
      isBoss: true,
      canCrossWater: true,
      outsideMargin: 3.6,
    });
    const spawnBossPos = spawn
      ? spawn.spawnPos
      : { x: fallbackBossPos.x, z: -((GRID_SIZE * TILE_SIZE) / 2) - 3.6 };
    const entryTarget = spawn ? spawn.entryTarget : fallbackBossPos;

    engine.createEnemyAt(
      bossClass,
      spawnBossPos.x,
      spawnBossPos.z,
      true,
      entryTarget
    );
  }

  spawnBossStage(stageIndex) {
    const { engine } = this;
    const sector = SECTORS[engine.currentSectorIndex];
    const sequence = sector?.bossSequence;
    if (!Array.isArray(sequence) || !sequence[stageIndex]) return false;

    engine.bossStageIndex = stageIndex;
    engine.bossSequenceStarted = true;
    engine.bossSpawned = stageIndex >= sequence.length - 1;

    const entries = sequence[stageIndex];
    const names = [];
    for (const entry of entries) {
      const bossClass = entry.enemyClass || sector.bossClass;
      const bossCell = entry.spawnCell || sector.bossSpawnCell || { row: 3, col: 17 };
      engine.spawnBossEntry(sector, bossClass, bossCell);
      names.push((entry.name || SECTOR_BOSS_CONFIGS[bossClass]?.name || bossClass).toUpperCase());
    }

    sound.playBossAlarm();
    sound.playExplosion(1.6);
    engine.screenShake = 1.35;
    engine.scheduleBossAftershock();

    const stageTag = `BOSS WAVE ${stageIndex + 1}/${sequence.length}`;
    engine.setStatusBanner(
      `${stageTag}: ${names.join(' & ')} DEPLOYED!`,
      4.8
    );
    engine.emitHudUpdate();
    return true;
  }

  spawnSectorBoss(overrideBossClass = null, overrideBossName = null) {
    const { engine } = this;
    if (engine.bossSequenceStarted || engine.bossSpawned) return;

    const sector = SECTORS[engine.currentSectorIndex];
    if (
      Array.isArray(sector?.bossSequence) &&
      sector.bossSequence.length > 0 &&
      !overrideBossClass &&
      !engine.survivalState
    ) {
      engine.spawnBossStage(0);
      return;
    }

    engine.bossSequenceStarted = true;
    engine.bossSpawned = true;

    const bossClass =
      overrideBossClass ||
      engine.survivalState?.waveSpec?.bossClass ||
      sector.bossClass;
    const bossName =
      overrideBossName ||
      engine.survivalState?.waveSpec?.bossName ||
      SECTOR_BOSS_CONFIGS[bossClass]?.name ||
      sector.bossName;
    const bossCell = sector.bossSpawnCell || { row: 3, col: 17 };
    engine.spawnBossEntry(sector, bossClass, bossCell);

    sound.playBossAlarm();
    sound.playExplosion(1.6);
    engine.screenShake = 1.35;

    engine.scheduleBossAftershock();

    const bossTitle = (bossName || 'SECTOR COMMANDER').toUpperCase();
    engine.setStatusBanner(
      `CRITICAL PERIMETER BREACH! ${bossTitle} DEMOLISHED THE BASTION!`,
      4.8
    );
    engine.emitHudUpdate();
  }

  scheduleBossAftershock() {
    const { engine } = this;
    for (let k = 1; k <= 3; k++) {
      const id = setTimeout(() => {
        engine._pendingTimeouts?.delete(id);
        if (engine.isDisposed) return;
        engine.screenShake = Math.max(engine.screenShake, 0.7);
        sound.playExplosion(1.15);
      }, 140 * k);
      engine._pendingTimeouts?.add(id);
    }
  }

  clearPendingTimeouts() {
    const { engine } = this;
    if (!engine._pendingTimeouts) return;
    for (const id of engine._pendingTimeouts) clearTimeout(id);
    engine._pendingTimeouts.clear();
  }

  getEnemyLoadoutStats(enemyClass) {
    if (
      enemyClass === EnemyClass.BOSS_MAMMOTH ||
      enemyClass === EnemyClass.BOSS_HYDRA ||
      enemyClass === EnemyClass.BOSS_INFERNO ||
      enemyClass === EnemyClass.BOSS_TITAN
    ) {
      const bossCfg = SECTOR_BOSS_CONFIGS[enemyClass];
      return computeTankStats(bossCfg.loadout, bossCfg.base);
    }
    const cfg = TANK_CONFIGS[enemyClass];
    if (cfg && cfg.loadout) {
      return computeTankStats(cfg.loadout, cfg.base);
    }
    const fallback = TANK_CONFIGS[TANK_TYPES.STANDARD];
    return computeTankStats(fallback.loadout, fallback.base);
  }

  createEnemyAt(enemyClass, x, z, isBoss, entryTarget = null) {
    const { engine } = this;
    const rig = engine.modelFactory.createEnemyTank(enemyClass);
    rig.root.position.set(x, 0, z);
    if (rig.hpBarBg) rig.hpBarBg.visible = engine.aiDebugMode;
    if (rig.hpBarFill) rig.hpBarFill.visible = engine.aiDebugMode;
    engine.entityGroup.add(rig.root);

    const cfg =
      TANK_CONFIGS[enemyClass] ||
      SECTOR_BOSS_CONFIGS[enemyClass] ||
      (isBoss
        ? SECTOR_BOSS_CONFIGS[EnemyClass.BOSS_MAMMOTH]
        : TANK_CONFIGS[TANK_TYPES.STANDARD]);
    const stats = engine.getEnemyLoadoutStats(enemyClass);
    const { sightRadius, radioAlertRadius } = stats;
    const enemyId = engine.nextEnemyId;
    const behaviorRng = new SeededRng(
      20261105 + engine.currentSectorIndex * 7919 + enemyId * 104729
    );
    const rngNext = () => behaviorRng.next();
    const firstShotDelay =
      enemyClass === EnemyClass.HOWITZER
        ? ARTILLERY.FIRST_SHOT_MIN +
          rngNext() * (ARTILLERY.FIRST_SHOT_MAX - ARTILLERY.FIRST_SHOT_MIN)
        : 0.2 + rngNext() * 0.25;

    const isHeavyUnit =
      isBoss ||
      enemyClass === EnemyClass.ARMOR ||
      enemyClass === EnemyClass.FLAMETHROWER;

    const hullDef = isHeavyUnit ? HULL_CATALOG.bastion_m2 : HULL_CATALOG.bars_m1;
    const turretDef = isHeavyUnit ? TURRET_CATALOG.t_02 : TURRET_CATALOG.t_01;

    const actions = resolveBehaviorActions(cfg?.behavior);

    const patrolWaypoints = [
      { x, z },
      { x: THREE.MathUtils.clamp(x + (rngNext() > 0.5 ? 10 : -10), -28, 28), z },
      { x, z: THREE.MathUtils.clamp(z + 10, -28, 26) },
    ];

    const initialHullAngle = entryTarget
      ? Math.atan2(entryTarget.x - x, entryTarget.z - z)
      : Math.PI;

    const turrets = rig.turrets?.length
      ? rig.turrets.map((slot, idx) => ({
          index: idx,
          slot,
          angle: initialHullAngle + (slot.defaultYawOffset || 0),
          gunner: createGunnerState(rngNext),
          fireCooldown: firstShotDelay + idx * 0.55,
          recoil: 0,
          flashTimer: 0,
          gunElevation: 0,
          randomShotTarget: null,
          randomShotTimer: 4.0 + idx * 2.5 + rngNext() * 5.0,
        }))
      : null;

    engine.enemies.push({
      id: engine.nextEnemyId++,
      actions,
      movePlan: null,
      lastSpecial: null,
      artilleryCfg: {
        aimSec: cfg?.artillery?.aimSec ?? ARTILLERY.AIM_TIME,
        flightSec: cfg?.artillery?.flightSec ?? ARTILLERY.FLIGHT_TIME,
      },
      missileCfg: { homing: cfg?.missile?.homing ?? true },
      indirectAim: null,
      gunner: turrets ? turrets[0].gunner : createGunnerState(rngNext),
      turrets,
      brain: cfg?.behavior
        ? createBrain(cfg.behavior.role, rngNext, engine.bossBrainOverrides(enemyClass))
        : null,
      brainHolding: false,
      behaviorRng: rngNext,
      name: isBoss
        ? engine.survivalState?.waveSpec?.bossName ||
          SECTOR_BOSS_CONFIGS[enemyClass]?.name ||
          SECTORS[engine.currentSectorIndex].bossName
        : cfg?.name || `${enemyClass} Unit`,
      enemyClass,
      isBoss,
      hitRadius:
        TANK_HIT_RADIUS[enemyClass] ?? (isBoss ? TANK_HIT_RADIUS.DEFAULT_BOSS : TANK_HIT_RADIUS.DEFAULT),
      gunElevation: 0,
      missileSide: 0,
      stats,
      sightRadius,
      radioAlertRadius,
      hasDetectedPlayer: false,
      alertTarget: null,
      alertTimer: 0,
      radioCooldown: 0,
      entryTarget: entryTarget ? { ...entryTarget } : null,
      x,
      z,
      vx: 0,
      vz: 0,
      hullAngle: initialHullAngle,
      turretAngle: initialHullAngle,
      hullYaw: initialHullAngle,
      turretYaw: initialHullAngle,
      hp: stats.maxHP,
      maxHp: stats.maxHP,
      hullHP: stats.maxHP * 10,
      maxHullHP: stats.maxHP * 10,
      hull: { ...hullDef },
      turret: { ...turretDef },
      armorPanels: isBoss
        ? {
            SOCKET_ARMOR_FRONT: {
              ...ARMOR_PANEL_CATALOG.sb_40,
              integrity: 80,
              destroyed: false,
            },
          }
        : {},
      ai: createEnemyAIState({
        homeX: x,
        homeZ: z,
        patrolWaypoints,
        pursuitLimit: 36,
        hardLimit: 54,
        preferredRange: 22,
      }),
      fireCooldown: firstShotDelay,
      specialCooldown: 2.5 + Math.random(),
      randomShotTimer: 4.0 + Math.random() * 8.0,
      aiTimer: 0.4,
      targetDirX: 0,
      targetDirZ: 1,
      recoil: 0,
      flashTimer: 0,
      stealthRevealTimer: 0,
      minesRemaining: 0,
      hydraMissileCooldown: 3.0,
      mammothMissileCooldown: 4.5,
      infernoMissileCooldown: 3.5,
      infernoDashCooldown: 5.5,
      infernoDashWindup: 0,
      infernoDashTimer: 0,
      infernoDashDirX: 0,
      infernoDashDirZ: 0,
      infernoDashBeam: null,
      infernoDashHitPlayer: false,
      hydraFlameCooldown: 0,
      mammothEnraged: false,
      hydraEnraged: false,
      infernoEnraged: false,
      titanEscortCalled: false,
      titanOverload: false,
      phaseShieldTimer: 0,
      phaseShieldMesh: null,
      apsCharges: isBoss ? BOSS_APS.MAX_CHARGES : 0,
      apsMaxCharges: isBoss ? BOSS_APS.MAX_CHARGES : 0,
      apsRearmTimer: 0,
      apsRechargeTimer: BOSS_APS.RECHARGE_SEC,
      rig,
    });
    const created = engine.enemies[engine.enemies.length - 1];
    engine.syncEnemyTurretVisuals(created, 0);
    equipAbilities(created, cfg?.abilities, engine);
  }

  spawnEncounterEnemy(enemyClass, group) {
    const { engine } = this;
    const liveStealth = engine.enemies.filter((enemy) => enemy.enemyClass === EnemyClass.STEALTH).length;
    const liveJammer = engine.enemies.some((enemy) => enemy.enemyClass === EnemyClass.JAMMER);
    if (enemyClass === EnemyClass.STEALTH && (liveStealth >= 2 || (liveJammer && liveStealth >= 1))) return false;
    if (enemyClass === EnemyClass.JAMMER && liveStealth >= 2) return false;
    if (enemyClass === EnemyClass.JAMMER && engine.enemies.some((enemy) => enemy.enemyClass === EnemyClass.JAMMER)) return false;
    if (enemyClass === EnemyClass.HOWITZER && engine.enemies.filter((enemy) => enemy.enemyClass === EnemyClass.HOWITZER).length >= 2) return false;
    if (enemyClass === EnemyClass.FLAMETHROWER && engine.enemies.filter((enemy) => enemy.enemyClass === EnemyClass.FLAMETHROWER).length >= 2) return false;
    if (enemyClass === EnemyClass.ENGINEER && engine.enemies.filter((enemy) => enemy.enemyClass === EnemyClass.ENGINEER).length >= 2) return false;
    const sector = SECTORS[engine.currentSectorIndex];
    const kamikazeLimit = sector.id >= 33 ? 2 : 1;
    if (enemyClass === EnemyClass.KAMIKAZE && engine.enemies.filter((enemy) => enemy.enemyClass === EnemyClass.KAMIKAZE).length >= kamikazeLimit) return false;
    const candidates = sector.entrances.filter((entry) => group.entrances.includes(entry.id));
    for (let offset = 0; offset < candidates.length; offset++) {
      const entry = candidates[(engine.spawnerRoundRobinIdx + offset) % candidates.length];
      const pos = engine.gridToWorld(entry.row, entry.col);
      const distance = Math.hypot(engine.playerX - pos.x, engine.playerZ - pos.z);
      if (distance < 14 || (distance < 24 && engine.hasLineOfSight(engine.playerX, engine.playerZ, pos.x, pos.z))) continue;
      if (engine.enemies.some((enemy) => Math.hypot(enemy.x - pos.x, enemy.z - pos.z) < 2.6)) continue;
      const spawn = this.resolveBorderSpawn(entry, { enemyClass, minPlayerDist: 14, losAvoidDist: 24 });
      if (!spawn) continue;
      this.createEnemyAt(enemyClass, spawn.spawnPos.x, spawn.spawnPos.z, false, spawn.entryTarget);
      engine.enemies.at(-1).campaignPatrolRoute = group.patrolRoute;
      engine.spawnerRoundRobinIdx++;
      return true;
    }
    if (candidates.length > 0) {
      const fallbackEntry = candidates[engine.spawnerRoundRobinIdx % candidates.length];
      const spawn = this.resolveBorderSpawn(fallbackEntry, { enemyClass, minPlayerDist: 14, losAvoidDist: 24 });
      if (spawn) {
        engine.createEnemyAt(enemyClass, spawn.spawnPos.x, spawn.spawnPos.z, false, spawn.entryTarget);
        engine.enemies.at(-1).campaignPatrolRoute = group.patrolRoute;
        engine.spawnerRoundRobinIdx++;
        return true;
      }
    }
    return false;
  }

  updateSpawnerLogic(dt) {
    const { engine } = this;
    if (engine.contractState) {
      return;
    }
    if (engine.survivalState) {
      engine.survivalState.elapsedSec += dt;
      if (engine.survivalState.phase === 'intermission') {
        engine.survivalState.intermissionTimer -= dt;
        if (engine.survivalState.intermissionTimer <= 0) {
          engine.startSurvivalWave(engine.survivalState.wave + 1, false);
        }
        return;
      }

      const spec = engine.survivalState.waveSpec;
      const maxConcurrent = spec?.maxConcurrentEnemies ?? 6;
      const spawnInterval = spec?.spawnIntervalSec ?? 2.0;

      if (engine.vanguardRemainingToSpawn > 0) {
        if (engine.enemies.length < maxConcurrent) {
          engine.spawnTimer -= dt;
          if (engine.spawnTimer <= 0) {
            const spawned = engine.spawnVanguardEnemy();
            engine.spawnTimer = spawned ? spawnInterval : 0.6;
          }
        }
      }

      if (
        spec?.isBossWave &&
        !engine.bossSpawned &&
        engine.vanguardRemainingToSpawn <= 2 &&
        engine.enemies.length < maxConcurrent
      ) {
        engine.spawnSectorBoss(spec.bossClass, spec.bossName);
      }

      if (
        engine.vanguardRemainingToSpawn === 0 &&
        (!spec?.isBossWave || engine.bossSpawned) &&
        engine.enemies.length === 0
      ) {
        engine.onSurvivalWaveCleared();
      }
      return;
    }
    if (engine.encounterState) {
      const sector = SECTORS[engine.currentSectorIndex];
      updateEncounters(
        engine.encounterState,
        dt,
        engine.enemies.length,
        sector.maxConcurrentEnemies,
        sector.spawnIntervalSec,
        (type, group) => engine.spawnEncounterEnemy(type, group),
        (label) => engine.setStatusBanner(label, 4)
      );
      engine.vanguardRemainingToSpawn = remainingEncounterEnemies(engine.encounterState);
      if (engine.vanguardRemainingToSpawn === 0 && engine.enemies.length === 0) {
        if (engine.activeMapRules?.spawnSectorBossOnClear !== false && !engine.bossSpawned) {
          engine.spawnSectorBoss();
        } else if (engine.activeMapRules.victoryOnAllEnemiesDestroyed) {
          const totalHostiles =
            sector.enemyPool.length +
            (engine.activeMapRules?.spawnSectorBossOnClear !== false ? 1 : 0);
          engine.triggerMissionVictory(
            `${sector.name.toUpperCase()} COMPLETE — ALL ${totalHostiles} HOSTILES ELIMINATED`
          );
        }
      }
      return;
    }
    const spawners = engine.getSpawnerCells();
    const sector = SECTORS[engine.currentSectorIndex];
    const maxConcurrent = sector?.maxConcurrentEnemies ?? 8;
    const spawnInterval = sector?.spawnIntervalSec ?? 2.6;

    if (engine.vanguardRemainingToSpawn > 0 && spawners.length > 0) {
      if (engine.enemies.length < maxConcurrent) {
        engine.spawnTimer -= dt;
        if (engine.spawnTimer <= 0) {
          const spawned = this.spawnVanguardEnemy();
          engine.spawnTimer = spawned ? spawnInterval : 0.6;
        }
      }
    } else if (!engine.bossSpawned && engine.enemies.length === 0) {
      if (engine.activeMapRules?.spawnSectorBossOnClear !== false) {
        engine.spawnSectorBoss();
      } else {
        const victoryRes = checkMapVictory(engine.activeMapRules, {
          enemyBaseDestroyed: !engine.enemyBaseAlive,
          vanguardRemainingToSpawn: 0,
          activeEnemiesCount: 0,
          bossDefeated: true,
        });
        if (victoryRes.isVictory) {
          engine.triggerMissionVictory(victoryRes.banner);
        }
      }
    }
  }
}
