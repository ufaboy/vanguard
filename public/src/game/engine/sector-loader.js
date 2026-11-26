import * as THREE from 'three';
import { ARMOR_PANEL_CATALOG } from '../../sim/catalog.js';
import { CONTRACT_TYPES, CONTRACTS_CATALOG, LAST_CARGO_CONTRACT, createContractState, stepContractScheduler } from '../../sim/contract.js';
import { resolveAssembledTank } from '../../sim/garage.js';
import { createRepairKitState, createTankSubsystems } from '../../sim/subsystems.js';
import { buildSurvivalWaveSpec, createSurvivalState } from '../../sim/survival.js';
import {
  APS,
  HYDRA,
  INFERNO,
  MAMMOTH,
  TITAN,
} from '../constants.js';
import { createEncounterState, remainingEncounterEnemies } from '../encounters.js';
import { DEFAULT_CAMERA_AZIMUTH } from './input-camera.js';
import { BASE_CELL, GRID_SIZE, SECTORS, TILE_SIZE, getBaseLayout, isContractMap } from '../levels.js';
import { sound } from '../sound.js';
import { BoxPowerUpPool } from '../terrains/boxes-loot.js';
import { BUILDING_MAX_HP } from '../terrains/building-models.js';
import { landmarkFootprintCenter } from '../terrains/landmarks.js';
import { resolveBuildingCell } from '../terrains/terrain-format.js';
import { updateGroundSurfaceFinish } from '../terrains/ground-finish.js';
import { isSurfaceType, setCellObject } from '../terrains/layers.js';
import { createUrbanGroundTexture } from '../terrains/urban-ground.js';
import { EnemyClass, GameStatus, TileType, resolveMapRules } from '../types.js';
import { t } from '../../i18n/index.js';

const BOSS_ESCORT_CLASSES = Object.freeze({
  [EnemyClass.BOSS_MAMMOTH]: MAMMOTH.ESCORT_CLASSES,
  [EnemyClass.BOSS_HYDRA]: HYDRA.ESCORT_CLASSES,
  [EnemyClass.BOSS_INFERNO]: INFERNO.ESCORT_CLASSES,
  [EnemyClass.BOSS_TITAN]: TITAN.ESCORT_CLASSES,
});

/** Loads sector maps, initializes grid/player/mode state, and handles grid-world coordinate helpers. */
/** Collects all enemy and boss classes needed at the start of a sector. */
export function getSectorEnemyClasses(sector) {
  if (!sector) return [];
  if (sector.gameMode === 'survival') {
    const wave1 = buildSurvivalWaveSpec(1);
    return [...new Set([
      ...wave1.roster,
      ...(wave1.bossClass ? [wave1.bossClass] : []),
    ])];
  }
  const classes = new Set([
    ...(sector.enemyPool || []),
    ...(sector.fixedSpawns || []).map((sp) => sp.enemyClass),
  ]);
  if (sector.rules?.spawnSectorBossOnClear) {
    const bosses = [
      ...(sector.bossClass ? [sector.bossClass] : []),
      ...(sector.bossSequence ? sector.bossSequence.flat().map((b) => b.enemyClass) : []),
    ];
    for (const bossClass of bosses) {
      classes.add(bossClass);
      for (const escort of BOSS_ESCORT_CLASSES[bossClass] || []) {
        classes.add(escort);
      }
    }
  }
  return [...classes];
}

/** True when a sector uses 3D landmarks (Élysée HQ, Paris monuments, bridges, or mine signs). */
/** Landmark kinds whose GLB templates a sector needs (3D landmarks, model HQ, mine signs). */
export function sectorLandmarkKinds(sector) {
  if (!sector) return [];
  const kinds = (sector.landmarks3d || []).map((entry) => entry.kind);
  if (sector.baseModel) kinds.push(sector.baseModel);
  if (sector.mineSigns?.length) kinds.push('MINE_SIGN');
  return [...new Set(kinds)];
}

function sectorUsesLandmarks(sector) {
  if (!sector) return false;
  return Boolean(
    sector.baseModel ||
      sector.landmarks3d?.length ||
      sector.bridges?.length ||
      sector.mineSigns?.length
  );
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
    const sector = SECTORS[engine.currentSectorIndex];
    return getBaseLayout(sector?.baseCell || BASE_CELL, GRID_SIZE, {
      footprint: sector?.baseFootprint,
      baseDefense: sector?.baseDefense,
    });
  }

  /** World centre of the Allied HQ footprint. */
  getCommandBaseCenter() {
    const { engine } = this;
    const sector = SECTORS[engine.currentSectorIndex];
    const baseCell = sector?.baseCell || BASE_CELL;
    const fp = sector?.baseFootprint || { cols: 2, rows: 1 };
    const pos = this.gridToWorld(baseCell.row, baseCell.col);
    return {
      x: pos.x + ((fp.cols - 1) * TILE_SIZE) / 2,
      z: pos.z + ((fp.rows - 1) * TILE_SIZE) / 2,
    };
  }

  /** Restores the HQ cover row, but only the cells the map itself authored as concrete. */
  setBasePerimeterMaterial(targetType) {
    const { engine } = this;
    const sector = SECTORS[engine.currentSectorIndex];
    const authored = this.getBaseLayout().wall.filter(
      (p) => sector?.objectGrid?.[p.row]?.[p.col] === TileType.CONCRETE
    );
    for (const p of authored) {
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
        setCellObject(cell, TileType.CONCRETE);
        cell.hp = 16;
        cell.maxHp = 16;
        cell.mesh = concrete;
        cell.subMeshes = undefined;
      } else {
        const brick = engine.modelFactory.createBrickBlock();
        brick.group.position.set(x, 0, z);
        engine.mapGroup.add(brick.group);
        setCellObject(cell, TileType.BRICK);
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
    const lowQuality = engine.isSoftwareGl || engine.quality === 'low';
    engine.urbanGroundTexture?.dispose();
    engine.urbanGroundTexture = (sector.theme === 'urban' || sector.decoration)
      ? createUrbanGroundTexture(sector, {
          lowQuality,
          maxTextureSize: engine.renderer.capabilities.maxTextureSize,
        })
      : null;
    if (engine.legacyGroundDecal) engine.legacyGroundDecal.visible = !sector.decoration;
    engine.groundMesh.material.map = engine.urbanGroundTexture || engine.modelFactory.groundTex;
    updateGroundSurfaceFinish(engine.groundMesh.material, { lowQuality });
    engine.groundMesh.material.needsUpdate = true;

    engine.clearGroup(engine.mapGroup);
    engine.tileBatcher.reset();
    engine.airSupportController?.clear?.();
    engine.reconDroneController?.clear?.();
    engine.clearGroup(engine.entityGroup);
    engine.clearGroup(engine.fxGroup);
    engine.fx.clear();

    engine.enemySpawner.clearPendingTimeouts();
    engine.modelFactory?.clearPendingRigs?.();
    engine.pendingBarrelExplosions = [];
    engine.pendingTransformerPulses = [];
    engine.playerEmpDisruptTimer = 0;
    engine.crushableProps = [];
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
    engine.burningOilCells = [];
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
    engine.baseMaxHp = sector.baseMaxHp || 1;
    engine.baseHp = engine.baseMaxHp;
    engine.baseLandmarkMesh = null;
    if (sectorUsesLandmarks(sector)) {
      engine.modelFactory.landmarkModels?.clearLiveGroups?.();
      engine.modelFactory.landmarkModels?.ensureLoaded?.(sectorLandmarkKinds(sector));
    } else {
      engine.modelFactory.landmarkModels?.unload?.();
    }
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
    const pairedCells = new Set();
    const pairLinks = [];

    for (let r = 0; r < GRID_SIZE; r++) {
      const rowCells = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        const supply = sector.powerups?.find((item) => item.row === r && item.col === c);
        const rawCell = sector.grid[r][c];
        const surface = sector.surfaceGrid?.[r]?.[c] ?? (isSurfaceType(rawCell) ? rawCell : TileType.EMPTY);
        const object = supply
          ? TileType.BOXES
          : sector.objectGrid?.[r]?.[c] ?? (!isSurfaceType(rawCell) && rawCell !== TileType.EMPTY ? rawCell : null);
        const type = object ?? surface;
        const { x, z } = this.gridToWorld(r, c);
        let mesh = null;
        let surfaceMesh = null;
        let subMeshes;
        let hp = 1;
        const building =
          !supply && (type === TileType.HOUSE_1 || type === TileType.HOUSE_2)
            ? resolveBuildingCell(sector.objectGrid, sector.buildingStyles, r, c)
            : null;

        // Render flat surface layer underneath any placed object
        if (surface === TileType.ROAD && engine.modelFactory.createRoadBlock) {
          const isRoad = (rr, cc) => {
            if (rr < 0 || rr >= GRID_SIZE || cc < 0 || cc >= GRID_SIZE) return false;
            const s = sector.surfaceGrid?.[rr]?.[cc] ?? sector.grid[rr][cc];
            const o = sector.objectGrid?.[rr]?.[cc] ?? sector.grid[rr][cc];
            return s === TileType.ROAD || o === TileType.BRIDGE;
          };
          const n = isRoad(r - 1, c);
          const e = isRoad(r, c + 1);
          const s = isRoad(r + 1, c);
          const w = isRoad(r, c - 1);
          const roadMask = (n ? 1 : 0) | (e ? 2 : 0) | (s ? 4 : 0) | (w ? 8 : 0);
          const doubleLaneMask =
            (n && e && w && !s && (isRoad(r - 1, c + 1) || isRoad(r - 1, c - 1)) ? 1 : 0) |
            (e && n && s && !w && (isRoad(r - 1, c + 1) || isRoad(r + 1, c + 1)) ? 2 : 0) |
            (s && e && w && !n && (isRoad(r + 1, c + 1) || isRoad(r + 1, c - 1)) ? 4 : 0) |
            (w && n && s && !e && (isRoad(r - 1, c - 1) || isRoad(r + 1, c - 1)) ? 8 : 0);
          surfaceMesh = engine.modelFactory.createRoadBlock(x, z, roadMask, doubleLaneMask);
          engine.mapGroup.add(surfaceMesh);
        } else if (surface === TileType.SAND && engine.modelFactory.createSandBlock) {
          surfaceMesh = engine.modelFactory.createSandBlock(x, z);
          engine.mapGroup.add(surfaceMesh);
        } else if (surface === TileType.GRASS && engine.modelFactory.createGrassBlock) {
          surfaceMesh = engine.modelFactory.createGrassBlock(x, z);
          engine.mapGroup.add(surfaceMesh);
        } else if (surface === TileType.STONE && engine.modelFactory.createStoneBlock) {
          surfaceMesh = engine.modelFactory.createStoneBlock(x, z);
          engine.mapGroup.add(surfaceMesh);
        } else if (surface === TileType.SWAMP && engine.modelFactory.createSwampBlock) {
          surfaceMesh = engine.modelFactory.createSwampBlock(x, z);
          engine.mapGroup.add(surfaceMesh);
        } else if (surface === TileType.OIL_SLICK && engine.modelFactory.createOilSlickBlock) {
          surfaceMesh = engine.modelFactory.createOilSlickBlock(x, z);
          engine.mapGroup.add(surfaceMesh);
        } else if (surface === TileType.RAIL && engine.modelFactory.createRailBlock) {
          const isRail = (rr, cc) => {
            if (rr < 0 || rr >= GRID_SIZE || cc < 0 || cc >= GRID_SIZE) return false;
            const s = sector.surfaceGrid?.[rr]?.[cc] ?? sector.grid[rr][cc];
            return s === TileType.RAIL;
          };
          const railMask =
            (isRail(r - 1, c) ? 1 : 0) |
            (isRail(r, c + 1) ? 2 : 0) |
            (isRail(r + 1, c) ? 4 : 0) |
            (isRail(r, c - 1) ? 8 : 0);
          surfaceMesh = engine.modelFactory.createRailBlock(x, z, railMask);
          engine.mapGroup.add(surfaceMesh);
        }

        if (type === TileType.BRICK) {
          hp = 4;
          const brick = engine.modelFactory.createBrickBlock();
          brick.group.position.set(x, 0, z);
          engine.mapGroup.add(brick.group);
          mesh = brick.group;
          subMeshes = brick.subMeshes;
        } else if (type === TileType.CONCRETE) {
          hp = 16;
          const concrete = engine.modelFactory.createConcreteBlock();
          concrete.position.set(x, 0, z);
          engine.mapGroup.add(concrete);
          mesh = concrete;
        } else if (type === TileType.HOUSE_1 || type === TileType.HOUSE_2) {
          if (building) {
            hp = BUILDING_MAX_HP[building.kind];
            const built = engine.modelFactory.createBuildingBlock(
              building.kind, building.part, building.yaw, hp, hp, building.style
            );
            built.group.position.set(x, 0, z);
            engine.mapGroup.add(built.group);
            mesh = built.group;
            subMeshes = built.subMeshes;
          }
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
        } else if (type === TileType.BASE) {
          // One HQ model spans all HQ cells; it hangs on the anchor cell.
          const anchor = sector.baseCell || BASE_CELL;
          if (r === anchor.row && c === anchor.col) {
            if (sector.baseModel && engine.modelFactory.landmarkModels) {
              const center = this.getCommandBaseCenter();
              const baseBlock = engine.modelFactory.landmarkModels.create(sector.baseModel);
              baseBlock.position.set(center.x, 0, center.z);
              engine.mapGroup.add(baseBlock);
              mesh = baseBlock;
              engine.baseLandmarkMesh = baseBlock;
            } else {
              const baseBlock = engine.modelFactory.createCommandBaseBlock();
              baseBlock.position.set(x + TILE_SIZE / 2, 0, z);
              engine.mapGroup.add(baseBlock);
              mesh = baseBlock;
            }
          }
          hp = engine.baseMaxHp || 1;
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
        } else if (type === TileType.CRATER && engine.modelFactory.createCraterBlock) {
          mesh = engine.modelFactory.createCraterBlock(x, z);
          engine.mapGroup.add(mesh);
        } else if (type === TileType.RUBBLE && engine.modelFactory.createRubbleBlock) {
          mesh = engine.modelFactory.createRubbleBlock('house2');
          mesh.position.set(x, 0, z);
          mesh.rotation.y = ((r * 7 + c * 13) % 4) * (Math.PI / 2);
          engine.mapGroup.add(mesh);
          hp = 1;
        } else if (type === TileType.WATER_TOWER && engine.modelFactory.createWaterTowerBlock) {
          mesh = engine.modelFactory.createWaterTowerBlock();
          mesh.position.set(x, 0, z);
          engine.mapGroup.add(mesh);
          hp = 2;
        } else if (type === TileType.CONTAINER && engine.modelFactory.createContainerBlock) {
          hp = 8;
          if (!pairedCells.has(`${r},${c}`)) {
            const sameCont = (rr, cc) =>
              rr >= 0 && rr < GRID_SIZE && cc >= 0 && cc < GRID_SIZE &&
              !pairedCells.has(`${rr},${cc}`) &&
              (sector.objectGrid?.[rr]?.[cc] ?? sector.grid[rr][cc]) === TileType.CONTAINER;
            const pairE = sameCont(r, c + 1);
            const pairS = !pairE && sameCont(r + 1, c);
            const spanCells = pairE || pairS ? 2 : 1;
            const orientation = pairE ? 'ew' : 'ns';
            if (pairE) {
              pairedCells.add(`${r},${c}`);
              pairedCells.add(`${r},${c + 1}`);
              pairLinks.push([r, c, r, c + 1]);
            } else if (pairS) {
              pairedCells.add(`${r},${c}`);
              pairedCells.add(`${r + 1},${c}`);
              pairLinks.push([r, c, r + 1, c]);
            }
            const colorIdx = (r * 3 + c * 7) % 4;
            mesh = engine.modelFactory.createContainerBlock(colorIdx, orientation, spanCells);
            mesh.position.set(
              x + (pairE ? TILE_SIZE * 0.5 : 0),
              0,
              z + (pairS ? TILE_SIZE * 0.5 : 0)
            );
            engine.mapGroup.add(mesh);
          }
        } else if (type === TileType.TRANSFORMER && engine.modelFactory.createTransformerBlock) {
          mesh = engine.modelFactory.createTransformerBlock();
          mesh.position.set(x, 0, z);
          engine.mapGroup.add(mesh);
          hp = 2;
        } else if (type === TileType.SANDBAGS && engine.modelFactory.createSandbagsBlock) {
          const isBags = (rr, cc) =>
            rr >= 0 && rr < GRID_SIZE && cc >= 0 && cc < GRID_SIZE &&
            (sector.objectGrid?.[rr]?.[cc] ?? sector.grid[rr][cc]) === TileType.SANDBAGS;
          const bagMask =
            (isBags(r - 1, c) ? 1 : 0) |
            (isBags(r, c + 1) ? 2 : 0) |
            (isBags(r + 1, c) ? 4 : 0) |
            (isBags(r, c - 1) ? 8 : 0);
          mesh = engine.modelFactory.createSandbagsBlock(bagMask);
          mesh.position.set(x, 0, z);
          engine.mapGroup.add(mesh);
          hp = 3;
        } else if (type === TileType.RAIL_CAR && engine.modelFactory.createRailCarBlock) {
          hp = 10;
          if (!pairedCells.has(`${r},${c}`)) {
            const sameCar = (rr, cc) =>
              rr >= 0 && rr < GRID_SIZE && cc >= 0 && cc < GRID_SIZE &&
              !pairedCells.has(`${rr},${cc}`) &&
              (sector.objectGrid?.[rr]?.[cc] ?? sector.grid[rr][cc]) === TileType.RAIL_CAR;
            const pairE = sameCar(r, c + 1);
            const pairS = !pairE && sameCar(r + 1, c);
            const isRailAxis = (rr, cc) =>
              rr >= 0 && rr < GRID_SIZE && cc >= 0 && cc < GRID_SIZE &&
              (sector.surfaceGrid?.[rr]?.[cc] ?? sector.grid[rr][cc]) === TileType.RAIL;
            const orientation = pairE
              ? 'ew'
              : pairS
              ? 'ns'
              : (isRailAxis(r, c - 1) || isRailAxis(r, c + 1)) && !(isRailAxis(r - 1, c) || isRailAxis(r + 1, c))
              ? 'ew'
              : 'ns';
            if (pairE) {
              pairedCells.add(`${r},${c}`);
              pairedCells.add(`${r},${c + 1}`);
              pairLinks.push([r, c, r, c + 1]);
            } else if (pairS) {
              pairedCells.add(`${r},${c}`);
              pairedCells.add(`${r + 1},${c}`);
              pairLinks.push([r, c, r + 1, c]);
            }
            const variant = (r + c) % 2 === 0 ? 'closed' : 'open';
            mesh = engine.modelFactory.createRailCarBlock(orientation, variant, pairE || pairS ? 2 : 1);
            mesh.position.set(
              x + (pairE ? TILE_SIZE * 0.5 : 0),
              0,
              z + (pairS ? TILE_SIZE * 0.5 : 0)
            );
            engine.mapGroup.add(mesh);
          }
        } else if (type === TileType.LOCOMOTIVE && engine.modelFactory.createLocomotiveBlock) {
          hp = 16;
          if (!pairedCells.has(`${r},${c}`)) {
            const sameLoco = (rr, cc) =>
              rr >= 0 && rr < GRID_SIZE && cc >= 0 && cc < GRID_SIZE &&
              !pairedCells.has(`${rr},${cc}`) &&
              (sector.objectGrid?.[rr]?.[cc] ?? sector.grid[rr][cc]) === TileType.LOCOMOTIVE;
            const pairE = sameLoco(r, c + 1);
            const pairS = !pairE && sameLoco(r + 1, c);
            const isRailAxis = (rr, cc) =>
              rr >= 0 && rr < GRID_SIZE && cc >= 0 && cc < GRID_SIZE &&
              (sector.surfaceGrid?.[rr]?.[cc] ?? sector.grid[rr][cc]) === TileType.RAIL;
            const orientation = pairE
              ? 'ew'
              : pairS
              ? 'ns'
              : (isRailAxis(r, c - 1) || isRailAxis(r, c + 1)) && !(isRailAxis(r - 1, c) || isRailAxis(r + 1, c))
              ? 'ew'
              : 'ns';
            if (pairE) {
              pairedCells.add(`${r},${c}`);
              pairedCells.add(`${r},${c + 1}`);
              pairLinks.push([r, c, r, c + 1]);
            } else if (pairS) {
              pairedCells.add(`${r},${c}`);
              pairedCells.add(`${r + 1},${c}`);
              pairLinks.push([r, c, r + 1, c]);
            }
            mesh = engine.modelFactory.createLocomotiveBlock(orientation, pairE || pairS ? 2 : 1);
            mesh.position.set(
              x + (pairE ? TILE_SIZE * 0.5 : 0),
              0,
              z + (pairS ? TILE_SIZE * 0.5 : 0)
            );
            engine.mapGroup.add(mesh);
          }
        }

        if (!mesh && surfaceMesh) {
          mesh = surfaceMesh;
        }

        rowCells.push({
          row: r,
          col: c,
          surface,
          object,
          type,
          hp,
          maxHp: hp,
          mesh,
          surfaceMesh,
          subMeshes,
        });
      }
      engine.grid.push(rowCells);
    }

    for (const [r1, c1, r2, c2] of pairLinks) {
      const a = engine.grid[r1]?.[c1];
      const b = engine.grid[r2]?.[c2];
      if (a && b) {
        a.pairPartner = b;
        b.pairPartner = a;
        b.mesh = a.mesh;
      }
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
        setCellObject(cell, TileType.ENEMY_BASE);
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

    if (sector.landmarks3d?.length && engine.modelFactory.landmarkModels) {
      for (const entry of sector.landmarks3d) {
        const lmPos = landmarkFootprintCenter(
          entry.kind,
          entry.row,
          entry.col,
          (rr, cc) => this.gridToWorld(rr, cc),
          entry.rotation || 0
        );
        const lmMesh = engine.modelFactory.landmarkModels.create(entry.kind);
        lmMesh.position.set(lmPos.x, 0, lmPos.z);
        if (entry.rotation) lmMesh.rotation.y = (entry.rotation * Math.PI) / 180;
        engine.mapGroup.add(lmMesh);
      }
    }

    if (sector.bridges?.length && engine.modelFactory.landmarkModels) {
      for (const b of sector.bridges) {
        const spanNS = b.orientation !== 'ew';
        const bridgeMesh = spanNS
          ? engine.modelFactory.landmarkModels.createBridge(b.rows, b.cols)
          : engine.modelFactory.landmarkModels.createBridge(b.cols, b.rows);
        if (!spanNS) bridgeMesh.rotation.y = Math.PI / 2;
        const origin = this.gridToWorld(b.row, b.col);
        bridgeMesh.position.set(
          origin.x + ((b.cols - 1) * TILE_SIZE) / 2,
          0,
          origin.z + ((b.rows - 1) * TILE_SIZE) / 2
        );
        engine.mapGroup.add(bridgeMesh);
      }
    }

    if (sector.mineSigns?.length && engine.modelFactory.landmarkModels) {
      for (const sign of sector.mineSigns) {
        const signPos = this.gridToWorld(sign.row, sign.col);
        const signMesh = engine.modelFactory.landmarkModels.create('MINE_SIGN');
        signMesh.position.set(signPos.x, 0, signPos.z);
        signMesh.rotation.y = ((sign.rotation || 0) * Math.PI) / 180;
        engine.mapGroup.add(signMesh);
      }
    }

    if (sector.mines?.length) {
      for (const m of sector.mines) {
        const minePos = this.gridToWorld(m.row, m.col);
        engine.explosions.plantMineAt(minePos.x, minePos.z, {
          neutral: true,
          mapMine: true,
          armTimer: 0,
          life: Infinity,
          silent: true,
        });
      }
    }

    if (sector.props?.length && engine.modelFactory.createCrushableProp) {
      const propTheme =
        sector.mapId?.includes('provence') || sector.name?.toLowerCase().includes('provence')
          ? 'provence'
          : sector.decoration?.theme || sector.theme || 'urban';
      for (let idx = 0; idx < sector.props.length; idx++) {
        const p = sector.props[idx];
        const cell = engine.grid[p.row]?.[p.col];
        if (!cell || cell.object != null || cell.surface === TileType.WATER) continue;
        const propPos = this.gridToWorld(p.row, p.col);
        const propMesh = engine.modelFactory.createCrushableProp(p.kind, propTheme, p.row * 31 + p.col * 17 + idx);
        propMesh.position.set(propPos.x, 0, propPos.z);
        if (p.rotation) propMesh.rotation.y = (p.rotation * Math.PI) / 180;
        engine.mapGroup.add(propMesh);
        engine.crushableProps.push({
          kind: p.kind,
          row: p.row,
          col: p.col,
          x: propPos.x,
          z: propPos.z,
          alive: true,
          mesh: propMesh,
        });
      }
    }

    engine.waterSurfaceMesh = engine.modelFactory.createWaterBlock(
      engine.grid.map((row) =>
        row.map((cell) => (cell.type === TileType.BRIDGE ? TileType.WATER : cell.type))
      ),
      TileType.WATER
    );
    engine.mapGroup.add(engine.waterSurfaceMesh);
    engine.iceSurfaceMesh = engine.modelFactory.createIceBlock(
      engine.grid.map((row) => row.map((cell) => cell.type)),
      TileType.ICE
    );
    engine.mapGroup.add(engine.iceSurfaceMesh);

    if (engine.modelFactory.createThemePerimeterProps) {
      const themeProps = engine.modelFactory.createThemePerimeterProps(
        sector.decoration?.theme || sector.theme || 'urban',
        (GRID_SIZE * TILE_SIZE) / 2,
        sector.decoration?.seed ?? sector.id ?? 1
      );
      engine.mapGroup.add(themeProps);
    }

    engine.playerRig = engine.modelFactory.createPlayerTank();
    engine.defeatCinematicsTimer = 0;
    engine.victoryCinematicsTimer = 0;
    engine.missileFpvHoldTimer = 0;
    engine.cameraAzimuth = DEFAULT_CAMERA_AZIMUTH;
    engine.targetCameraAzimuth = DEFAULT_CAMERA_AZIMUTH;
    if (engine.victoryCinematics?.baseFrustum) {
      engine.frustumSize = engine.victoryCinematics.baseFrustum;
      engine.updateCameraProjection?.();
    }
    engine.victoryCinematics = null;
    engine.playerDeathState = null;
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

    // Operation contracts use the contract profile but keep their own win rules.
    const isContractSector = isContractMap(sector);
    const isCargoContract = sector.gameMode === 'contract';
    const isSurvivalSector = sector.gameMode === 'survival';
    const isIsolatedSector = isSurvivalSector || isContractSector;
    if (isSurvivalSector) {
      engine.setProfileMode('survival', { resetTank: startPlaying });
    } else if (isContractSector) {
      engine.setProfileMode('contract', { resetTank: startPlaying });
    } else {
      engine.setProfileMode('campaign');
    }

    engine.recomputePlayerStats(false);

    engine.assembledTank = resolveAssembledTank(engine.playerSave);
    engine.subsystems = createTankSubsystems();
    const savedRepairCharges = isIsolatedSector
      ? 0
      : Number.isInteger(engine.playerSave?.repairKitCharges)
      ? engine.playerSave.repairKitCharges
      : 0;
    engine.repairKitState = createRepairKitState(savedRepairCharges, engine.getPlayerMaxRepairKitCharges());
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
    engine.syncTemporaryCredits();
    engine.preBattleUpgrades = { ...engine.upgrades };

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
      isContract: isCargoContract,
      isSurvival: isSurvivalSector,
      contractId: sector.contractId || (isCargoContract ? sector.mapId : null),
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
    engine.reconDroneCooldown = 0;
    engine.reconDroneActiveTimer = 0;
    engine.reconDroneOwned = isIsolatedSector ? false : Boolean(engine.playerSave?.reconDroneOwned);
    engine.preBattleReconDroneOwned = engine.reconDroneOwned;
    engine.repairKitCount = engine.getPlayerMaxRepairKitCharges();

    engine.playerRig.root.position.set(engine.playerX, 0, engine.playerZ);
    engine.playerController.syncPlayerVisuals(0, 0);
    engine.entityGroup.add(engine.playerRig.root);

    // Honor previously earned boss reserves without creating new battlefield drops.
    if (startPlaying && !isSurvivalSector && engine.playerSave.pendingBossPowerUps?.length) {
      for (const type of engine.playerSave.pendingBossPowerUps) engine.applyPowerUp(type);
      engine.playerSave.pendingBossPowerUps = [];
      engine.saveRepo.savePlayerSave(engine.playerSave);
    }

    const sectorEnemyClasses = getSectorEnemyClasses(sector);
    engine.modelFactory.pruneEnemyModels?.(sectorEnemyClasses);
    engine.modelFactory.ensureEnemyModels(sectorEnemyClasses);

    engine.enemySpawnQueue = Array.isArray(sector.enemyPool)
      ? [...sector.enemyPool]
      : [];
    engine.enemiesRemainingToSpawn = engine.enemySpawnQueue.length;
    engine.initialEnemyCount = engine.enemiesRemainingToSpawn;
    engine.airDrops = [];
    engine.airDropQueue = Array.isArray(sector.airDrop)
      ? sector.airDrop.map((entry) => ({ ...entry, triggered: false }))
      : [];
    engine.airDropElapsed = 0;
    engine.enemyBaseClearAirDropTriggered = false;
    engine.spawnPoolCursor = 0;
    engine.spawnerRoundRobinIdx = 0;
    engine.sectorEntrances = Array.isArray(sector.entrances) ? sector.entrances : [];
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
    } else if (isCargoContract) {
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
      engine.enemiesRemainingToSpawn =
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
      engine.encounterState = createEncounterState(sector.encounters, count, sector.nextWave);
      engine.enemiesRemainingToSpawn = remainingEncounterEnemies(engine.encounterState);
      engine.initialEnemyCount = engine.enemiesRemainingToSpawn + count;
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
        engine.enemiesRemainingToSpawn
      );
      for (let i = 0; i < initialCount; i++) {
        if (engine.enemies.length >= maxConcurrent) break;
        engine.spawnEnemy();
      }
    }

    if (startPlaying) {
      engine.status = GameStatus.PLAYING;
      engine.syncAudioPauseState();
      sound.startEngineLoop();
      engine.setStatusBanner(
        `${t(authoredMission.code)}: ${t(authoredMission.title).toUpperCase()} — ${t(authoredMission.subtitle).toUpperCase()}`,
        3.2
      );
    } else {
      engine.status = GameStatus.MENU;
      engine.syncAudioPauseState();
    }

    engine.modelFactory?.prewarmCombatAssets?.();
    engine.emitHudUpdate();
  }
}

