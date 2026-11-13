import * as THREE from 'three';
import { ARMOR_PANEL_CATALOG } from '../../sim/catalog.js';
import { CONTRACT_TYPES, CONTRACTS_CATALOG, LAST_CARGO_CONTRACT, createContractState, stepContractScheduler } from '../../sim/contract.js';
import { resolveAssembledTank } from '../../sim/hangar.js';
import { createRepairKitState, createTankSubsystems } from '../../sim/subsystems.js';
import { createSurvivalState } from '../../sim/survival.js';
import {
  APS,
  HYDRA,
  INFERNO,
  MAMMOTH,
  REPAIR_KIT,
  TITAN,
} from '../constants.js';
import { createEncounterState, remainingEncounterEnemies } from '../encounters.js';
import { BASE_CELL, GRID_SIZE, SECTORS, TILE_SIZE, getBaseLayout } from '../levels.js';
import { sound } from '../sound.js';
import { BoxPowerUpPool } from '../terrains/boxes-loot.js';
import { createUrbanGroundTexture } from '../terrains/urban-ground.js';
import { EnemyClass, GameStatus, TANK_TYPES, TileType, resolveMapRules } from '../types.js';

/** Loads sector maps, initializes grid/player/mode state, and handles grid-world coordinate helpers. */
/** Collects all enemy and boss classes that may appear in a sector. */
export function getSectorEnemyClasses(sector) {
  if (!sector) return [];
  if (sector.gameMode === 'survival') {
    return [
      ...Object.values(TANK_TYPES),
      EnemyClass.BOSS_MAMMOTH,
      EnemyClass.BOSS_HYDRA,
      EnemyClass.BOSS_INFERNO,
      EnemyClass.BOSS_TITAN,
    ];
  }
  return [
    ...(sector.enemyPool || []),
    ...(sector.fixedSpawns || []).map((sp) => sp.enemyClass),
    ...(sector.rules?.spawnSectorBossOnClear
      ? [
          sector.bossClass,
          ...(sector.bossSequence
            ? sector.bossSequence.flat().map((b) => b.enemyClass)
            : []),
          ...MAMMOTH.ESCORT_CLASSES,
          ...HYDRA.ESCORT_CLASSES,
          ...INFERNO.ESCORT_CLASSES,
          ...TITAN.ESCORT_CLASSES,
        ]
      : []),
  ];
}

export class SectorLoaderController {
  constructor(engine) {
    this.engine = engine;
  }

  gridToWorld(row, col) {
    const half = (GRID_SIZE * TILE_SIZE) / 2;
    return {
      x: col * TILE_SIZE - half + TILE_SIZE / 2,
      z: row * TILE_SIZE - half + TILE_SIZE / 2,
    };
  }

  worldToGrid(x, z) {
    const half = (GRID_SIZE * TILE_SIZE) / 2;
    const col = Math.floor((x + half) / TILE_SIZE);
    const row = Math.floor((z + half) / TILE_SIZE);
    return { row, col };
  }

  getBaseLayout() {
    const { engine } = this;
    return getBaseLayout(SECTORS[engine.currentSectorIndex]?.baseCell || BASE_CELL);
  }

  /** World centre of the two-cell Allied HQ. */
  getCommandBaseCenter() {
    const { engine } = this;
    const baseCell = SECTORS[engine.currentSectorIndex]?.baseCell || BASE_CELL;
    const pos = this.gridToWorld(baseCell.row, baseCell.col);
    return { x: pos.x + TILE_SIZE / 2, z: pos.z };
  }

  setBasePerimeterMaterial(targetType) {
    const { engine } = this;
    for (const p of this.getBaseLayout().wall) {
      const cell = engine.grid[p.row]?.[p.col];
      if (!cell) continue;
      if (cell.mesh) {
        engine.mapGroup.remove(cell.mesh);
        cell.mesh = null;
      }
      const { x, z } = this.gridToWorld(p.row, p.col);
      if (targetType === TileType.CONCRETE) {
        const concrete = engine.modelFactory.createConcreteBlock();
        concrete.position.set(x, 0, z);
        engine.mapGroup.add(concrete);
        cell.type = TileType.CONCRETE;
        engine._spawnerCells = null;
        cell.hp = 16;
        cell.maxHp = 16;
        cell.mesh = concrete;
        cell.subMeshes = undefined;
      } else {
        const brick = engine.modelFactory.createBrickBlock();
        brick.group.position.set(x, 0, z);
        engine.mapGroup.add(brick.group);
        cell.type = TileType.BRICK;
        engine._spawnerCells = null;
        cell.hp = 4;
        cell.maxHp = 4;
        cell.mesh = brick.group;
        cell.subMeshes = brick.subMeshes;
      }
    }
  }

  loadSector(sectorIdx, startPlaying = true) {
    const { engine } = this;
    const prevSectorIdx = engine.currentSectorIndex;
    if (engine.status === GameStatus.GAME_OVER || engine.wasDefeated) {
      engine.restoreAllComponents();
      engine.wasDefeated = false;
    }
    engine.currentSectorIndex = Math.max(0, Math.min(SECTORS.length - 1, sectorIdx));
    engine.squadDirector = null;
    engine.attackTokens = null;
    engine.squadFrame = null;
    engine.playerTrail = [];
    const sector = SECTORS[engine.currentSectorIndex];

    engine.scene.background = new THREE.Color(sector.fogColor);
    engine.scene.fog = new THREE.FogExp2(sector.fogColor, 0.012);
    engine.urbanGroundTexture?.dispose();
    engine.urbanGroundTexture = (sector.theme === 'urban' || sector.decoration)
      ? createUrbanGroundTexture(sector, {
          lowQuality: engine.isSoftwareGl || engine.quality === 'low',
          maxTextureSize: engine.renderer.capabilities.maxTextureSize,
        })
      : null;
    if (engine.legacyGroundDecal) engine.legacyGroundDecal.visible = !sector.decoration;
    engine.groundMesh.material.map = engine.urbanGroundTexture || engine.modelFactory.groundTex;
    engine.groundMesh.material.needsUpdate = true;

    engine.clearGroup(engine.mapGroup);
    engine.tileBatcher.reset();
    engine.clearGroup(engine.entityGroup);
    engine.clearGroup(engine.fxGroup);
    engine.fx.clear();

    engine.enemySpawner.clearPendingTimeouts();
    engine.pendingBarrelExplosions = [];
    engine.enemies = [];
    engine.brickRubble = [];
    if (engine.projectiles) {
      for (const p of engine.projectiles) {
        if (p.soundHandle) sound.stopMissileLoop(p.soundHandle);
      }
    }
    sound.stopEngineLoop();
    engine.projectiles = [];
    engine.mines = [];
    engine.lasers = [];
    engine.hazardZones = [];
    engine.burningForests = [];
    engine.particles = [];
    engine.powerUps = [];
    engine.boxPowerUpPool = new BoxPowerUpPool();
    if (engine.defenseTurrets) {
      for (const t of engine.defenseTurrets) {
        t.alive = false;
        if (t.rig?.root) engine.mapGroup.remove(t.rig.root);
      }
    }
    engine.defenseTurrets = [];
    engine.baseAlive = true;
    engine.empTimer = 0;
    engine.activeMapRules = sector.rules || resolveMapRules(sector);
    engine.enemyBaseAlive = false;
    engine._enemyBaseCell = null;
    engine.enemyBaseMaxHp = engine.activeMapRules.enemyBaseMaxHp || 48;
    engine.enemyBaseHp = 0;
    engine.enemyBaseName =
      engine.activeMapRules.enemyBaseName || 'Enemy Fortified Citadel';

    engine.grid = [];
    engine.componentWaterEgress = false;

    engine._spawnerCells = null;
    for (let r = 0; r < GRID_SIZE; r++) {
      const rowCells = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        const supply = sector.powerups?.find((item) => item.row === r && item.col === c);
        const type = supply ? TileType.BOXES : sector.grid[r][c];
        const { x, z } = this.gridToWorld(r, c);
        let mesh = null;
        let subMeshes;
        let hp = 1;

        if (type === TileType.BRICK) {
          const brick = engine.modelFactory.createBrickBlock();
          brick.group.position.set(x, 0, z);
          engine.mapGroup.add(brick.group);
          mesh = brick.group;
          subMeshes = brick.subMeshes;
          hp = 4;
        } else if (type === TileType.CONCRETE) {
          const concrete = engine.modelFactory.createConcreteBlock();
          concrete.position.set(x, 0, z);
          engine.mapGroup.add(concrete);
          mesh = concrete;
          hp = 16;
        } else if (type === TileType.FOREST) {
          const forest = engine.modelFactory.createForestBlock();
          forest.position.set(x, 0, z);
          engine.mapGroup.add(forest);
          mesh = forest;
        } else if (type === TileType.WATER) {
          // Water is rendered as one continuous sector surface below.
          mesh = null;
        } else if (type === TileType.ICE) {
          // Ice is rendered as one continuous sector surface below.
          mesh = null;
        } else if (type === TileType.SPAWNER) {
          const spawner = engine.modelFactory.createSpawnerPad();
          spawner.position.set(x, 0, z);
          engine.mapGroup.add(spawner);
          mesh = spawner;
          hp = 6;
        } else if (type === TileType.BASE) {
          // One hangar model spans both HQ cells; it hangs on the anchor cell.
          const anchor = sector.baseCell || BASE_CELL;
          if (r === anchor.row && c === anchor.col) {
            const baseBlock = engine.modelFactory.createCommandBaseBlock();
            baseBlock.position.set(x + TILE_SIZE / 2, 0, z);
            engine.mapGroup.add(baseBlock);
            mesh = baseBlock;
          }
          hp = 1;
        } else if (type === TileType.ENEMY_BASE) {
          const enemyBaseBlock = engine.modelFactory.createEnemyBaseBlock();
          enemyBaseBlock.position.set(x, 0, z);
          engine.mapGroup.add(enemyBaseBlock);
          mesh = enemyBaseBlock;
          hp = engine.enemyBaseMaxHp;
          engine.enemyBaseAlive = true;
          engine.enemyBaseHp = hp;
          engine._enemyBaseCell = { row: r, col: c };
        } else if (type === TileType.HEDGEHOG) {
          const hedgehog = engine.modelFactory.createHedgehogBlock();
          hedgehog.position.set(x, 0, z);
          engine.mapGroup.add(hedgehog);
          mesh = hedgehog;
          hp = 1;
        } else if (type === TileType.BOXES) {
          mesh = engine.modelFactory.createBoxesBlock();
          mesh.position.set(x, 0, z);
          engine.mapGroup.add(mesh);
          hp = 2;
        } else if (type === TileType.BARREL) {
          const barrel = engine.modelFactory.createBarrelBlock();
          barrel.position.set(x, 0, z);
          engine.mapGroup.add(barrel);
          mesh = barrel;
          hp = 1;
        }

        rowCells.push({
          row: r,
          col: c,
          type,
          hp,
          maxHp: hp,
          mesh,
          subMeshes,
        });
      }
      engine.grid.push(rowCells);
    }

    if (engine.activeMapRules.hasEnemyFortifiedBase && !engine.enemyBaseAlive) {
      const ebCell = engine.activeMapRules.enemyBaseCell || { row: 2, col: 17 };
      const cell = engine.grid[ebCell.row]?.[ebCell.col];
      if (cell) {
        if (cell.mesh) engine.mapGroup.remove(cell.mesh);
        const { x, z } = this.gridToWorld(ebCell.row, ebCell.col);
        const enemyBaseBlock = engine.modelFactory.createEnemyBaseBlock();
        enemyBaseBlock.position.set(x, 0, z);
        engine.mapGroup.add(enemyBaseBlock);
        cell.type = TileType.ENEMY_BASE;
        engine._spawnerCells = null;
        cell.hp = engine.enemyBaseMaxHp;
        cell.maxHp = engine.enemyBaseMaxHp;
        cell.mesh = enemyBaseBlock;
        cell.subMeshes = undefined;
        engine.enemyBaseAlive = true;
        engine.enemyBaseHp = engine.enemyBaseMaxHp;
        engine._enemyBaseCell = { row: ebCell.row, col: ebCell.col };
      }
    }
    engine.setupDefenseTurrets();

    engine.waterSurfaceMesh = engine.modelFactory.createWaterBlock(
      engine.grid.map((row) => row.map((cell) => cell.type)),
      TileType.WATER
    );
    engine.mapGroup.add(engine.waterSurfaceMesh);
    engine.iceSurfaceMesh = engine.modelFactory.createIceBlock(
      engine.grid.map((row) => row.map((cell) => cell.type)),
      TileType.ICE
    );
    engine.mapGroup.add(engine.iceSurfaceMesh);

    engine.playerRig = engine.modelFactory.createPlayerTank();
    const pSpawnCell = sector.playerSpawnCell || {
      row: BASE_CELL.row,
      col: BASE_CELL.col - 3,
    };
    const spawnPos = this.gridToWorld(pSpawnCell.row, pSpawnCell.col);
    engine.playerX = spawnPos.x;
    engine.playerZ = spawnPos.z;
    engine.playerVx = 0;
    engine.playerVz = 0;
    engine.playerForwardSpeed = 0;
    engine.playerHullAngle = Math.PI;
    engine.playerTurretAngle = Math.PI;

    const isContractSector = sector.gameMode === 'contract';
    const isSurvivalSector = sector.gameMode === 'survival';
    const isIsolatedSector = isSurvivalSector || isContractSector;
    if (isSurvivalSector) {
      engine.setProfileMode('survival', { resetTank: startPlaying });
    } else if (isContractSector) {
      engine.setProfileMode('contract', { resetTank: startPlaying });
    } else {
      engine.setProfileMode('campaign');
    }

    engine.jammedTimer = 0;
    engine.recomputePlayerStats(false);

    engine.assembledTank = resolveAssembledTank(engine.playerSave);
    engine.subsystems = createTankSubsystems();
    const savedRepairCharges = isIsolatedSector
      ? 0
      : Number.isInteger(engine.playerSave?.repairKitCharges)
      ? engine.playerSave.repairKitCharges
      : 0;
    engine.repairKitState = createRepairKitState(savedRepairCharges);
    engine.playerArmorPanels = {
      SOCKET_ARMOR_FRONT: {
        ...ARMOR_PANEL_CATALOG.sb_40,
        ...(engine.assembledTank.armorPanels?.SOCKET_ARMOR_FRONT || {}),
        integrity: engine.assembledTank.armorPanels?.SOCKET_ARMOR_FRONT?.maxIntegrity || 100,
        destroyed: false,
      },
      SOCKET_ARMOR_LEFT: {
        ...ARMOR_PANEL_CATALOG.ekran_b25_left,
        ...(engine.assembledTank.armorPanels?.SOCKET_ARMOR_LEFT || {}),
        integrity: engine.assembledTank.armorPanels?.SOCKET_ARMOR_LEFT?.maxIntegrity || 70,
        destroyed: false,
      },
      SOCKET_ARMOR_RIGHT: {
        ...ARMOR_PANEL_CATALOG.ekran_b25_right,
        ...(engine.assembledTank.armorPanels?.SOCKET_ARMOR_RIGHT || {}),
        integrity: engine.assembledTank.armorPanels?.SOCKET_ARMOR_RIGHT?.maxIntegrity || 70,
        destroyed: false,
      },
      SOCKET_ARMOR_TURRET: {
        ...ARMOR_PANEL_CATALOG.turret_cheek_35,
        ...(engine.assembledTank.armorPanels?.SOCKET_ARMOR_TURRET || {}),
        integrity: engine.assembledTank.armorPanels?.SOCKET_ARMOR_TURRET?.maxIntegrity || 85,
        destroyed: false,
      },
    };
    engine.smokeClouds = [];
    engine.inSmoke = false;
    engine.smokeCharges = 3;
    engine.smokeCooldown = 0;
    engine.priorityTargetId = null;
    engine.sensorContacts.clear();
    engine.lootContainers = [];
    engine.lastSettlementSummary = null;
    engine.creditsEarnedThisMission = 0;

    const authoredMission = {
      id: sector.mapId,
      code: sector.code,
      title: sector.name,
      subtitle: sector.subtitle,
      completionReward: sector.completionReward,
    };
    engine.activeMissionRun = {
      runId: `run_${Date.now()}_${engine.currentSectorIndex}`,
      missionId: authoredMission.id,
      isContract: isContractSector,
      isSurvival: isSurvivalSector,
      contractId: sector.contractId || (isContractSector ? sector.mapId : null),
      status: 'in_progress',
      rewardsCommitted: false,
      deliveredCargoFlags: {},
      contractCargoCredits: 0,
      completionReward: { ...authoredMission.completionReward },
      lootContainers: engine.lootContainers,
    };

    engine.playerHp = engine.playerMaxHp;

    if (isIsolatedSector) {
      engine.playerController.initApsLaunchers(APS.START_ROUNDS);
      engine.missileAmmo = 2;
    } else if (Array.isArray(engine.playerSave?.apsAmmo)) {
      engine.apsAmmo = [...engine.playerSave.apsAmmo];
      const total = engine.apsAmmo.reduce((a, b) => a + b, 0);
      if (total < APS.START_ROUNDS) {
        engine.addApsRounds(APS.START_ROUNDS - total);
      }
    } else {
      engine.playerController.initApsLaunchers(APS.START_ROUNDS);
    }
    engine.apsRearmTimer = 0;
    if (!isIsolatedSector) {
      engine.missileAmmo = Math.max(engine.missileAmmo, 2);
    }
    engine.cannonAmmo = engine.getPlayerMaxCannonAmmo();
    engine.cannonBaseRearmTimer = 0;
    engine.missileCooldown = 0;
    engine.repairKitCount = REPAIR_KIT.MAX;

    engine.playerRig.root.position.set(engine.playerX, 0, engine.playerZ);
    engine.playerController.syncPlayerVisuals(0, 0);
    engine.entityGroup.add(engine.playerRig.root);

    // Honor previously earned boss reserves without creating new battlefield drops.
    if (startPlaying && !isSurvivalSector && engine.playerSave.pendingBossPowerUps?.length) {
      for (const type of engine.playerSave.pendingBossPowerUps) engine.applyPowerUp(type);
      engine.playerSave.pendingBossPowerUps = [];
      engine.saveRepo.savePlayerSave(engine.playerSave);
    }

    engine.modelFactory.ensureEnemyModels(getSectorEnemyClasses(sector));

    engine.enemySpawnQueue = Array.isArray(sector.enemyPool)
      ? [...sector.enemyPool]
      : [];
    engine.vanguardRemainingToSpawn = engine.enemySpawnQueue.length;
    engine.spawnPoolCursor = 0;
    engine.spawnerRoundRobinIdx = 0;
    engine.bossSpawned = false;
    engine.bossSequenceStarted = false;
    engine.bossStageIndex = 0;
    engine.spawnTimer = sector.spawnIntervalSec ?? 2.6;

    const maxConcurrent = sector.maxConcurrentEnemies ?? 8;

    engine.encounterState = null;
    engine.contractState = null;
    engine.survivalState = null;
    engine.contractCargoMeshes = null;
    engine.contractPadMesh = null;
    engine.contractLandmarksMesh = null;
    engine.carriedCargoIndicator = null;

    if (isSurvivalSector) {
      engine.survivalState = createSurvivalState();
      engine.survivalDirector.startWave(1, false);
    } else if (isContractSector) {
      const contractDef =
        CONTRACTS_CATALOG.find(
          (item) => item.id === sector.contractId || item.id === sector.mapId
        ) || LAST_CARGO_CONTRACT;
      const isSabotage = contractDef.contractType === CONTRACT_TYPES.SABOTAGE_PROTOCOL;
      engine.contractState = createContractState(contractDef, (r, c) => this.gridToWorld(r, c));
      engine.contractPadMesh = engine.modelFactory.createDeliveryPadMesh(
        engine.contractState.deliveryPad
      );
      engine.mapGroup.add(engine.contractPadMesh);
      engine.contractLandmarksMesh = engine.modelFactory.createContractLandmarks((r, c) =>
        this.gridToWorld(r, c)
      );
      engine.mapGroup.add(engine.contractLandmarksMesh);
      engine.contractCargoMeshes = new Map();
      for (const c of engine.contractState.containers) {
        const mesh = isSabotage
          ? engine.modelFactory.createRadarRelayMesh(c.slot, c.code, c.accentHex)
          : engine.modelFactory.createCargoContainerMesh(c.slot, c.code, c.accentHex);
        mesh.position.set(c.x, 0, c.z);
        engine.entityGroup.add(mesh);
        engine.contractCargoMeshes.set(c.id, mesh);
      }
      engine.carriedCargoIndicator = engine.modelFactory.createCarriedCargoIndicator();
      engine.playerRig.root.add(engine.carriedCargoIndicator);

      // Admit G0's first packet of 3 immediately at contract start
      stepContractScheduler(
        engine.contractState,
        0.01,
        engine.enemies.length,
        (unitType, assignment, groupEntry) =>
          engine.contractDirector.spawnEnemy(unitType, assignment, groupEntry)
      );
      engine.vanguardRemainingToSpawn =
        engine.contractState.scheduler.totalBudget - engine.contractState.scheduler.totalSpawned;
      engine.enemySpawnQueue = [];
    } else if (sector.encounters?.length) {
      const opening = sector.encounters[0];
      const count = Math.min(sector.initialSpawnCount, opening.enemies.length, maxConcurrent);
      for (let i = 0; i < count; i++) {
        const cell = opening.initialCells[i];
        const enemyClass = opening.enemies[i];
        const spawn = engine.resolveBorderSpawn(cell, { enemyClass });
        if (!spawn) continue;
        engine.createEnemyAt(enemyClass, spawn.spawnPos.x, spawn.spawnPos.z, false, spawn.entryTarget);
        engine.enemies.at(-1).campaignPatrolRoute = opening.patrolRoute;
      }
      engine.encounterState = createEncounterState(sector.encounters, count);
      engine.vanguardRemainingToSpawn = remainingEncounterEnemies(engine.encounterState);
      engine.enemySpawnQueue = [];
    } else {
      if (Array.isArray(sector.fixedSpawns)) {
        for (const fixed of sector.fixedSpawns) {
          if (engine.enemies.length >= maxConcurrent) break;
          const spawn = engine.resolveBorderSpawn(fixed, { enemyClass: fixed.enemyClass });
          if (!spawn) continue;
          engine.createEnemyAt(
            fixed.enemyClass,
            spawn.spawnPos.x,
            spawn.spawnPos.z,
            false,
            spawn.entryTarget
          );
        }
      }

      const initialCount = Math.min(
        sector.initialSpawnCount ?? 4,
        maxConcurrent,
        engine.vanguardRemainingToSpawn
      );
      for (let i = 0; i < initialCount; i++) {
        if (engine.enemies.length >= maxConcurrent) break;
        engine.spawnVanguardEnemy();
      }
    }

    if (startPlaying) {
      engine.status = GameStatus.PLAYING;
      engine.syncAudioPauseState();
      sound.startEngineLoop();
      engine.setStatusBanner(
        `${authoredMission.code}: ${authoredMission.title.toUpperCase()} — ${authoredMission.subtitle.toUpperCase()}`,
        3.2
      );
    } else {
      engine.status = GameStatus.MENU;
      engine.syncAudioPauseState();
    }

    engine.emitHudUpdate();
  }
}

