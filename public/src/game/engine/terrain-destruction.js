import * as THREE from 'three';
import { settleMission } from '../../sim/hangar.js';
import { applySubsystemDamage } from '../../sim/subsystems.js';
import { recordSurvivalRun } from '../../sim/survival.js';
import { DURABILITY, ENEMY_VISIBILITY, computeEffectiveDamage } from '../constants.js';
import { disposeOwned } from '../render/dispose.js';
import { SECTORS, TILE_SIZE } from '../levels.js';
import { sound } from '../sound.js';
import { rollBoxLoot } from '../terrains/boxes-loot.js';
import { breachPointToward } from '../terrains/breach-models.js';
import { canPlaceOnSurface, setCellObject, syncCellType } from '../terrains/layers.js';
import { GameStatus, TileType, checkMapDefeat, checkMapVictory } from '../types.js';
import { t } from '../../i18n/index.js';

/** Facilities a sand conversion (thermobaric blast, boss dozer) must never erase. */
const SAND_PROOF_OBJECTS = new Set([
  TileType.BASE,
  TileType.ENEMY_BASE,
  TileType.LANDMARK,
  TileType.BRIDGE,
  TileType.WATER_TOWER,
]);

/** Surfaces a water-tower flood turns into SWAMP. Ice and water keep their sector-wide meshes. */
const FLOODABLE_SURFACES = new Set([
  TileType.EMPTY,
  TileType.SAND,
  TileType.ROAD,
  TileType.GRASS,
  TileType.STONE,
  TileType.OIL_SLICK,
]);

/** Applies the pure HQ restoration state transition onto `state.grid` cells. */
export function applyBaseRestoration(state, layout, { mesh = null, onDestroyCell = null } = {}) {
  if (state.baseAlive || state.status !== GameStatus.PLAYING) return false;
  const cells = layout.cells.map(({ row, col }) => state.grid[row]?.[col]);
  if (!cells.length || cells.some((cell) => !cell)) return false;
  const maxHp = state.baseMaxHp || 1;
  cells.forEach((cell, i) => {
    if (cell.type !== TileType.EMPTY) onDestroyCell?.(cell);
    setCellObject(cell, TileType.BASE);
    Object.assign(cell, { hp: maxHp, maxHp, mesh: i === 0 ? mesh : null });
  });
  state.baseAlive = true;
  state.baseHp = maxHp;
  return true;
}

/** Manages terrain cell destruction, HQ/enemy base destruction & restoration, rubble, and barrel chains. */
export class TerrainDestructionController {
  constructor(engine) {
    this.engine = engine;
  }

  /** Clears persistent building rubble into passable flat ground (Dozer Blade or heavy HE blast). */
  clearRubbleCell(cell) {
    const { engine } = this;
    if (!cell || cell.type !== TileType.RUBBLE) return false;
    if (cell.mesh) {
      disposeOwned(cell.mesh);
      engine.mapGroup?.remove(cell.mesh);
      cell.mesh = null;
    }
    cell.object = null;
    syncCellType(cell);
    cell.hp = 0;
    cell.maxHp = 0;
    const pos = engine.gridToWorld(cell.row, cell.col);
    engine.fx?.masonryHit?.(pos.x, 0.25, pos.z, { concrete: true, heavy: false });
    engine.tileBatcher?.sync();
    return true;
  }

  /**
   * Converts a terrain/obstacle cell (FOREST, BRICK, CONCRETE, HOUSE, RUBBLE, ICE, WATER) into scorched SAND.
   * The object goes with it, so houses and rubble burn away too; bases, landmarks, bridges and towers stay.
   */
  convertCellToSand(cell) {
    const { engine } = this;
    if (!cell) return;
    syncCellType(cell);
    if (cell.surface === TileType.SAND && cell.object == null) return;
    if (SAND_PROOF_OBJECTS.has(cell.object)) return;
    if (cell.type === TileType.FOREST && engine.burningForests?.length) {
      const idx = engine.burningForests.findIndex((bf) => bf.cell === cell);
      if (idx >= 0) engine.burningForests.splice(idx, 1);
    }
    cell.isBurning = false;
    if (cell.mesh) {
      engine.mapGroup?.remove(cell.mesh);
      cell.mesh = null;
    }
    if (cell.surfaceMesh) {
      engine.mapGroup?.remove(cell.surfaceMesh);
      cell.surfaceMesh = null;
    }
    if (
      cell.type === TileType.BRICK ||
      cell.type === TileType.CONCRETE ||
      cell.type === TileType.HOUSE_1 ||
      cell.type === TileType.HOUSE_2 ||
      cell.type === TileType.FOREST
    ) {
      engine.blocksDestroyed = (engine.blocksDestroyed || 0) + 1;
    }
    cell.object = null;
    cell.surface = TileType.SAND;
    syncCellType(cell);
    cell.hp = 0;
    cell.subMeshes = undefined;
    if (engine.modelFactory?.createSandBlock && engine.mapGroup) {
      const pos = engine.gridToWorld(cell.row, cell.col);
      const sandMesh = engine.modelFactory.createSandBlock(pos.x, pos.z);
      engine.mapGroup.add(sandMesh);
      cell.surfaceMesh = sandMesh;
      cell.mesh = sandMesh;
    }
  }

  damageEnemyBase(cell, dmg, hitX, hitZ) {
    const { engine } = this;
    if (!engine.enemyBaseAlive || cell.type !== TileType.ENEMY_BASE) return;
    cell.hp = Math.max(0, cell.hp - dmg);
    engine.enemyBaseHp = cell.hp;
    sound.playSteelHit({ x: hitX, z: hitZ });
    engine.fx.armorHit(hitX, 0.95, hitZ, { scale: dmg >= 8 ? 1.2 : 0.9 });

    for (const ally of engine.enemies) {
      ally.alertTarget = { x: engine.playerX, z: engine.playerZ };
      ally.alertTimer = ENEMY_VISIBILITY.ALERT_PURSUIT_DURATION_SEC;
      ally.aiTimer = 0;
    }

    if (cell.hp <= 0) {
      engine.enemyBaseAlive = false;
      engine.enemyBaseHp = 0;
      engine._enemyBaseCell = null;
      const { x, z } = engine.gridToWorld(cell.row, cell.col);
      const detonateEnemyBase = () => {
        engine.destroyTileCell(cell);
        sound.playExplosion(2.0);
        engine.screenShake = Math.max(engine.screenShake, 1.0);
        engine.fx.tankDestroyed(x, z, { boss: true, tint: 0xff5a2a });
      };

      if (engine.activeMapRules?.spawnSectorBossOnClear && !engine.bossSpawned) {
        detonateEnemyBase();
        engine.spawnSectorBoss();
        engine.setStatusBanner(
          t('ENEMY COMMAND CORE DESTROYED! ELIMINATE THE SECTOR BOSS!'),
          4.0
        );
      }

      const victoryRes = checkMapVictory(engine.activeMapRules, {
        enemyBaseDestroyed: true,
        vanguardRemainingToSpawn: engine.vanguardRemainingToSpawn,
        activeEnemiesCount: engine.enemies.length,
        bossDefeated: engine.bossSpawned && !engine.enemies.some((u) => u.isBoss),
      });
      if (victoryRes.isVictory) {
        engine.triggerMissionVictory(victoryRes.banner, {
          x,
          z,
          onDetonate: detonateEnemyBase,
        });
        return;
      }
      if (!(engine.activeMapRules?.spawnSectorBossOnClear && !engine.bossSpawned)) {
        detonateEnemyBase();
      }
    }
    engine.emitHudUpdate();
  }

  damageCommandBase(dmg = 1, hitX = null, hitZ = null) {
    const { engine } = this;
    if (!engine.baseAlive) return;
    const maxHp = engine.baseMaxHp || 1;
    if (maxHp <= 1) {
      this.destroyCommandBase();
      return;
    }
    engine.baseHp = Math.max(0, (engine.baseHp ?? maxHp) - Math.max(0, dmg));
    const basePos = engine.sectorLoader.getCommandBaseCenter();
    const hx = hitX ?? basePos.x;
    const hz = hitZ ?? basePos.z;
    sound.playBrickHit({ x: hx, z: hz });
    engine.fx.masonryHit(hx, 0.9, hz, { concrete: true, heavy: dmg >= 15 });
    if (engine.baseHp <= 0) {
      this.destroyCommandBase();
      return;
    }
    engine.emitHudUpdate();
  }

  destroyCommandBase() {
    const { engine } = this;
    if (!engine.baseAlive) return;
    engine.baseAlive = false;
    engine.baseHp = 0;
    engine.inBaseRepairZone = false;
    const basePos = engine.sectorLoader.getCommandBaseCenter();
    for (const { row, col } of engine.getBaseLayout().cells) {
      const baseCell = engine.grid[row]?.[col];
      if (baseCell?.type === TileType.BASE) {
        if (engine.baseLandmarkMesh && baseCell.mesh === engine.baseLandmarkMesh) {
          engine.modelFactory.landmarkModels?.setKind(engine.baseLandmarkMesh, 'ELYSEE_RUINED');
          setCellObject(baseCell, null);
          baseCell.hp = 0;
        } else {
          engine.destroyTileCell(baseCell);
        }
      }
    }
    engine.fx.tankDestroyed(basePos.x, basePos.z, { boss: true, tint: 0xff7a2a });
    sound.playExplosion(1.6);

    const defeatRes = checkMapDefeat(engine.activeMapRules, {
      playerHp: engine.playerHp,
      baseAlive: false,
    });
    if (defeatRes.isDefeat) {
      engine.status = GameStatus.GAME_OVER;
      engine.defeatCinematicsTimer = 2.6;
      engine.screenShake = Math.max(engine.screenShake || 0, 1.0);
      sound.stopEngineLoop();
      engine.wasDefeated = true;
      if (engine.survivalState) {
        const campaignSave = engine.campaignSaveRepo?.loadPlayerSave();
        if (campaignSave) {
          engine.survivalState.recordSummary = recordSurvivalRun(
            campaignSave,
            engine.survivalState,
            engine.kills
          );
          engine.campaignSaveRepo.savePlayerSave(campaignSave);
        }
      } else {
        engine.restoreAllComponents();
        if (engine.activeMissionRun && !engine.activeMissionRun.rewardsCommitted) {
          engine.lastSettlementSummary = settleMission({
            playerSave: engine.playerSave,
            missionRun: engine.activeMissionRun,
            outcome: 'defeat',
          });
          engine.saveRepo.savePlayerSave(engine.playerSave);
          engine.saveRepo.recordMissionRun(engine.activeMissionRun);
        }
      }
      engine.setStatusBanner(t(defeatRes.banner), 5.0);
    } else {
      engine.setStatusBanner(
        t(engine.activeMapRules?.baseLostBanner || 'REPAIR BASE DESTROYED! FIELD REPAIR BAY OFFLINE — CONTINUE THE ASSAULT!'),
        4.5
      );
    }
    engine.saveProgress();
    engine.emitHudUpdate();
  }

  restoreCommandBase() {
    const { engine } = this;
    if (engine.baseAlive || engine.status !== GameStatus.PLAYING) return;
    const layout = engine.getBaseLayout();
    const cells = layout.cells.map(({ row, col }) => engine.grid[row]?.[col]);
    if (!cells.length || cells.some((cell) => !cell)) return;
    const pos = engine.sectorLoader.getCommandBaseCenter();
    const sector = SECTORS[engine.currentSectorIndex];
    let mesh = engine.baseLandmarkMesh;
    if (mesh && sector?.baseModel && engine.modelFactory.landmarkModels) {
      engine.modelFactory.landmarkModels.setKind(mesh, sector.baseModel);
    } else {
      mesh = engine.modelFactory.createCommandBaseBlock();
      mesh.position.set(pos.x, 0, pos.z);
      engine.mapGroup.add(mesh);
    }
    if (!applyBaseRestoration(engine, layout, { mesh, onDestroyCell: (cell) => engine.destroyTileCell(cell) })) {
      return;
    }
    engine.tileBatcher.sync();
    engine.setStatusBanner(t('ALLIED HQ REBUILT! FIELD REPAIR BAY ONLINE!'), 3);
    engine.saveProgress();
  }

  /** `fromPlayer`: only crates the player breaks yield loot; enemy fire just destroys their contents. */
  damageTileCell(cell, dmg, hitX, hitZ, fromPlayer = false) {
    const { engine } = this;
    // The concrete under a live turret is its barbette; only the turret itself takes damage.
    if (cell.defenseTurret?.alive) return;
    if (cell.type === TileType.BOXES) {
      if (cell.hp <= 0 || dmg <= 0) return;
      cell.hp = Math.max(0, cell.hp - 1);
      engine.modelFactory.updateBoxesDamage(cell.mesh, cell.hp);
      engine.tileBatcher.markDirty(cell.mesh);
      sound.playBrickHit({ x: hitX, z: hitZ });
      if (cell.hp === 0) {
        engine.destroyTileCell(cell);
        if (fromPlayer) {
          const pos = engine.gridToWorld(cell.row, cell.col);
          const type = rollBoxLoot(engine.boxPowerUpPool, Math.random, engine);
          if (type) engine.createPowerUpEntity(type, pos.x, pos.z);
        }
      } else engine.fx.blockDestroyed(hitX, hitZ, 'boxes');
      engine.emitHudUpdate();
      return;
    }
    cell.hp -= dmg;

    if (cell.type === TileType.HOUSE_1 || cell.type === TileType.HOUSE_2) {
      sound.playBrickHit({ x: hitX, z: hitZ });
      engine.fx.masonryHit(hitX, 0.78, hitZ, { concrete: cell.type === TileType.HOUSE_2, heavy: dmg >= 5 });
      if (cell.mesh) {
        engine.modelFactory.updateBuildingBlockDamage(
          cell.mesh,
          cell.hp,
          cell.maxHp || (cell.type === TileType.HOUSE_2 ? 70 : 25)
        );
      }
    } else if (cell.type === TileType.CONCRETE) {
      sound.playBrickHit({ x: hitX, z: hitZ });
      engine.fx.masonryHit(hitX, 0.78, hitZ, { concrete: true, heavy: dmg >= 4 });
      if (cell.mesh) {
        engine.modelFactory.updateConcreteBlockDamage(
          cell.mesh,
          cell.hp,
          cell.maxHp || 16,
          this.hitOffset(cell, hitX, hitZ)
        );
      }
    } else {
      sound.playBrickHit({ x: hitX, z: hitZ });
      engine.fx.masonryHit(hitX, 0.7, hitZ, { concrete: false, heavy: dmg >= 2 });
    }

    if (cell.type === TileType.BRICK) {
      engine.modelFactory.updateBrickBlockDamage(cell.mesh, cell.hp, this.hitOffset(cell, hitX, hitZ));
    }
    else if (cell.type === TileType.WATER_TOWER) {
      sound.playSteelHit({ x: hitX, z: hitZ });
      engine.fx.armorHit(hitX, 0.85, hitZ, { scale: 0.9, colorHex: 0x38bdf8 });
    }
    engine.tileBatcher.markDirty(cell.mesh);

    if (cell.hp <= 0) {
      engine.destroyTileCell(cell);
    }
  }

  /** Offset of a hit from the centre of `cell`: it tells the tile model which face to breach. */
  hitOffset(cell, hitX, hitZ) {
    const centre = this.engine.gridToWorld(cell.row, cell.col);
    return { dx: hitX - centre.x, dz: hitZ - centre.z };
  }

  destroyTileCell(cell) {
    const { engine } = this;
    if (!cell || cell.type === TileType.EMPTY) return;
    if (cell.type === TileType.BARREL) {
      engine.explodeBarrel(cell, true);
      return;
    }
    if (cell.type === TileType.WATER_TOWER) {
      this.ruptureWaterTower(cell);
      return;
    }
    const { x, z } = engine.gridToWorld(cell.row, cell.col);

    const factory = engine.modelFactory;
    const prevMesh = cell.mesh;
    const buildingInfo = prevMesh?.userData?.building;
    if (cell.mesh) {
      engine.mapGroup.remove(cell.mesh);
      cell.mesh = null;
    }

    const wasBoxes = cell.type === TileType.BOXES;
    const wasConcrete = cell.type === TileType.CONCRETE;
    const wasForest = cell.type === TileType.FOREST;
    if (wasConcrete) {
      engine.medalTracker?.recordConcreteDestroyed();
    }

    if (buildingInfo || wasConcrete) {
      // Destroyed buildings and reinforced concrete walls collapse into persistent concrete rubble (passable with severe speed penalty).
      cell.object = TileType.RUBBLE;
      syncCellType(cell);
      cell.hp = 1;
      cell.maxHp = 1;
      if (factory?.createRubbleBlock && engine.mapGroup) {
        const rubble = factory.createRubbleBlock(buildingInfo ? buildingInfo.kind : 'house2');
        rubble.position.set(x, 0, z);
        rubble.rotation.y = prevMesh?.userData?.breach
          ? prevMesh.rotation.y
          : ((cell.row * 7 + cell.col * 13) % 4) * (Math.PI / 2);
        engine.mapGroup.add(rubble);
        cell.mesh = rubble;
        engine.tileBatcher?.markDirty(rubble);
      }
    } else {
      const rubbleModels = cell.type === TileType.BRICK && factory.useBlenderBricks ? factory.brickModels : null;
      if (rubbleModels?.states.size) {
        const rubble = new THREE.Group();
        rubble.userData.batchTile = true;
        rubbleModels.apply(rubble, 0);
        rubble.position.set(x, 0, z);
        // Debris stays where the wall was breached; an untouched wall gets a varied scatter.
        rubble.rotation.y = prevMesh?.userData?.breach
          ? prevMesh.rotation.y
          : ((cell.row * 7 + cell.col * 13) % 4) * (Math.PI / 2);
        engine.mapGroup.add(rubble);
        engine.brickRubble.push({ mesh: rubble, life: 12 });
        if (engine.brickRubble.length > 32) engine.mapGroup.remove(engine.brickRubble.shift().mesh);
      }
      cell.object = null;
      syncCellType(cell);
      cell.hp = 0;
    }
    engine.blocksDestroyed++;

    engine.fx.blockDestroyed(
      x,
      z,
      wasBoxes ? 'boxes' : wasConcrete ? 'concrete' : wasForest ? 'forest' : 'brick'
    );

    if (engine.tileBatcher) {
      engine.tileBatcher.sync();
    }
  }

  updateBrickRubble(dt) {
    const { engine } = this;
    for (let i = engine.brickRubble.length - 1; i >= 0; i--) {
      const item = engine.brickRubble[i];
      item.life -= dt;
      if (item.life <= 0) {
        engine.mapGroup.remove(item.mesh);
        engine.brickRubble.splice(i, 1);
      }
    }
  }

  explodeBarrel(cell, fromPlayer = true) {
    const { engine } = this;
    if (!cell || cell.type !== TileType.BARREL || cell._exploding) return;
    cell._exploding = true;
    const { x, z } = engine.gridToWorld(cell.row, cell.col);

    if (cell.mesh) {
      engine.mapGroup.remove(cell.mesh);
      cell.mesh = null;
    }
    setCellObject(cell, null);
    cell.hp = 0;
    engine.blocksDestroyed++;
    this.convertCellToCrater(cell);

    sound.playEnvironmentalExplosion({ x, z });
    engine.screenShake = Math.max(engine.screenShake, 0.75);

    engine.fx.explosion(x, 0.45, z, { scale: 2.15, boss: false, tint: 0xff3b14 });
    engine.fx.shockwave(x, 0.1, z, 0.4, 6.4, 0xff5500, 0.5);
    engine.fx.scorch(x, z, 3.2);
    engine.fx.sparks(x, 0.5, z, 0xffa040, 28, { speed: 2.8, up: 1.6 });

    const blastRadius = 3.8 * TILE_SIZE;
    const pointBlankRadius = 1.2 * TILE_SIZE;
    const maxDamage = 41;

    const targets = [...engine.enemies];
    for (let i = targets.length - 1; i >= 0; i--) {
      const enemy = targets[i];
      if (!enemy || enemy.hp <= 0) continue;
      const dist = Math.hypot(enemy.x - x, enemy.z - z);
      if (dist <= blastRadius) {
        const t = Math.max(0, (dist - pointBlankRadius) / Math.max(0.1, blastRadius - pointBlankRadius));
        const falloff = 1 - t * 0.6;
        const dmg = Math.round(maxDamage * falloff);
        engine.damageEnemy(enemy, dmg, x, z);
        engine.fx.armorHit(enemy.x, 0.5, enemy.z, { scale: 1.3, colorHex: 0xff4500 });
      }
    }

    if (engine.playerHp > DURABILITY.ZERO_HP) {
      const pDist = Math.hypot(engine.playerX - x, engine.playerZ - z);
      if (pDist <= blastRadius) {
        const t = Math.max(0, (pDist - pointBlankRadius) / Math.max(0.1, blastRadius - pointBlankRadius));
        const falloff = 1 - t * 0.6;
        const sideArmor = engine.explosions?.blastSideArmor?.(
          engine.playerStats || {},
          engine.playerX,
          engine.playerZ,
          engine.playerHullAngle || 0,
          x,
          z
        ) ?? engine.playerStats?.armor ?? 0;
        const dmg = computeEffectiveDamage(maxDamage * falloff, 0, sideArmor);
        const trackDmg = Math.round(75 * falloff);
        applySubsystemDamage(engine.subsystems, 'leftTrack', trackDmg);
        applySubsystemDamage(engine.subsystems, 'rightTrack', trackDmg);
        // Barrel blasts bypass APS directly and strike the hull/chassis.
        engine.damagePlayer(dmg, { zone: 'hull', aspect: 'left' });
        engine.emitHudUpdate?.();
        engine.fx.armorHit(engine.playerX, 0.5, engine.playerZ, { scale: 1.4, colorHex: 0xff2200 });
      }
    }

    const row = cell.row;
    const col = cell.col;
    const chainBarrels = [];

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const neighbor = engine.grid[row + dr]?.[col + dc];
        if (!neighbor || neighbor.type === TileType.EMPTY) continue;
        const nPos = engine.gridToWorld(neighbor.row, neighbor.col);

        if (neighbor.type === TileType.BOXES) {
          engine.damageTileCell(neighbor, 1, nPos.x, nPos.z, fromPlayer);
        } else if (neighbor.type === TileType.BRICK) {
          engine.destroyTileCell(neighbor);
        } else if (neighbor.type === TileType.CONCRETE) {
          const hit = breachPointToward(nPos.x, nPos.z, x, z);
          engine.damageTileCell(neighbor, 6, hit.x, hit.z);
        } else if (neighbor.type === TileType.FOREST) {
          engine.destroyTileCell(neighbor);
        } else if (neighbor.type === TileType.BARREL && !neighbor._exploding) {
          chainBarrels.push(neighbor);
        } else if (neighbor.type === TileType.WATER_TOWER) {
          engine.damageTileCell(neighbor, 2, nPos.x, nPos.z, fromPlayer);
        }
        if ((neighbor.surface === TileType.OIL_SLICK || neighbor.type === TileType.OIL_SLICK) && !neighbor.isBurning) {
          this.igniteOilSlick(neighbor);
        }
      }
    }

    if (chainBarrels.length > 0) {
      engine.pendingBarrelExplosions ||= [];
      chainBarrels.forEach((b, idx) => {
        engine.pendingBarrelExplosions.push({ cell: b, fromPlayer, remaining: 0.075 * (idx + 1) });
      });
    }

    if (engine.tileBatcher) {
      engine.tileBatcher.sync();
    }
  }

  updateBarrelExplosions(dt) {
    const { engine } = this;
    if (engine.isDisposed || engine.isHangarPaused || engine.isAdPaused || engine.status !== GameStatus.PLAYING) return;
    const pending = engine.pendingBarrelExplosions || [];
    engine.enemySpawner.clearPendingTimeouts();
    engine.pendingBarrelExplosions = [];
    for (const event of pending) {
      const { cell } = event;
      if (engine.grid[cell.row]?.[cell.col] !== cell || cell.type !== TileType.BARREL) continue;
      event.remaining -= dt;
      if (event.remaining > 0 || engine.status !== GameStatus.PLAYING) {
        engine.pendingBarrelExplosions.push(event);
      } else {
        engine.explodeBarrel(cell, event.fromPlayer);
      }
    }
  }

  /** Converts passable dry ground into a dynamic blast crater decoration (preserving underlying surface). */
  convertCellToCrater(cell) {
    const { engine } = this;
    if (!cell) return;
    syncCellType(cell);
    if (cell.object != null || !canPlaceOnSurface(TileType.CRATER, cell.surface)) {
      return;
    }
    // The ruined HQ landmark stays on its (now passable) cells until the base is rebuilt.
    if (cell.mesh && cell.mesh === engine.baseLandmarkMesh) {
      return;
    }
    // The crater decal sits on top of the surface patch (road, grass, sand), which stays in place.
    if (cell.mesh && cell.mesh !== cell.surfaceMesh) {
      engine.mapGroup?.remove(cell.mesh);
    }
    cell.mesh = null;
    cell.object = TileType.CRATER;
    syncCellType(cell);
    cell.hp = 0;
    cell.isBurning = false;
    if (engine.modelFactory?.createCraterBlock && engine.mapGroup) {
      const pos = engine.gridToWorld(cell.row, cell.col);
      const craterMesh = engine.modelFactory.createCraterBlock(pos.x, pos.z);
      engine.mapGroup.add(craterMesh);
      cell.mesh = craterMesh;
    }
  }

  /** Converts passable ground into deep swamp/mud (respecting facility surface lock). */
  convertCellToSwamp(cell, { allowWater = false } = {}) {
    const { engine } = this;
    if (!cell) return;
    syncCellType(cell);
    if (!FLOODABLE_SURFACES.has(cell.surface) && !(allowWater && cell.surface === TileType.WATER)) {
      return;
    }
    if (cell.object != null && cell.object !== TileType.CRATER) {
      return;
    }
    this.extinguishOilCell(cell);
    if (cell.object === TileType.CRATER && cell.mesh) {
      engine.mapGroup?.remove(cell.mesh);
      cell.mesh = null;
      cell.object = null;
    }
    if (cell.surfaceMesh) {
      engine.mapGroup?.remove(cell.surfaceMesh);
      cell.surfaceMesh = null;
    } else if (cell.mesh) {
      engine.mapGroup?.remove(cell.mesh);
      cell.mesh = null;
    }
    cell.surface = TileType.SWAMP;
    syncCellType(cell);
    cell.hp = 0;
    if (engine.modelFactory?.createSwampBlock && engine.mapGroup) {
      const pos = engine.gridToWorld(cell.row, cell.col);
      const swampMesh = engine.modelFactory.createSwampBlock(pos.x, pos.z);
      engine.mapGroup.add(swampMesh);
      cell.surfaceMesh = swampMesh;
      cell.mesh = swampMesh;
    }
  }

  /** Converts a melted ICE cell into WATER. */
  convertCellToWater(cell) {
    const { engine } = this;
    if (!cell) return;
    if (cell.surfaceMesh) {
      engine.mapGroup?.remove(cell.surfaceMesh);
      cell.surfaceMesh = null;
    } else if (cell.mesh) {
      engine.mapGroup?.remove(cell.mesh);
      cell.mesh = null;
    }
    cell.surface = TileType.WATER;
    syncCellType(cell);
    cell.hp = 0;
  }

  /** Rebuilds the continuous water / ice surface meshes after thermobaric phase changes. */
  rebuildWaterAndIceSurfaces(rebuildWater, rebuildIce) {
    const { engine } = this;
    if (!engine.mapGroup || !engine.modelFactory) return;
    if (rebuildWater) {
      const waterGrid = engine.grid.map((row) =>
        row.map((cell) => (cell.type === TileType.BRIDGE ? TileType.WATER : cell.type))
      );
      if (engine.waterSurfaceMesh) {
        engine.mapGroup.remove(engine.waterSurfaceMesh);
        disposeOwned(engine.waterSurfaceMesh);
      }
      engine.waterSurfaceMesh = engine.modelFactory.createWaterBlock(waterGrid, TileType.WATER);
      engine.mapGroup.add(engine.waterSurfaceMesh);
    }
    if (rebuildIce) {
      const iceGrid = engine.grid.map((row) => row.map((cell) => cell.type));
      if (engine.iceSurfaceMesh) {
        engine.mapGroup.remove(engine.iceSurfaceMesh);
        disposeOwned(engine.iceSurfaceMesh);
      }
      engine.iceSurfaceMesh = engine.modelFactory.createIceBlock(iceGrid, TileType.ICE);
      engine.mapGroup.add(engine.iceSurfaceMesh);
    }
  }

  /** Ignites an OIL_SLICK cell so it burns for 7 seconds with fire damage and smoke. */
  igniteOilSlick(cell) {
    const { engine } = this;
    if (!cell || (cell.surface !== TileType.OIL_SLICK && cell.type !== TileType.OIL_SLICK) || cell.isBurning) return;
    cell.isBurning = true;
    cell.burnTimer = 7.0;
    cell.burnElapsed = 0;
    cell.burnFxCooldown = 0;
    cell.houseBurnCooldown = 0.7;
    cell.hasSpreadFire = false;
    engine.burningOilCells ||= [];
    if (!engine.burningOilCells.includes(cell)) {
      engine.burningOilCells.push(cell);
    }
    const pos = engine.gridToWorld(cell.row, cell.col);
    sound.playFlamethrower?.({ x: pos.x, z: pos.z });
    const oilMesh = cell.surfaceMesh || cell.mesh;
    engine.modelFactory?.updateOilSlickBurn?.(oilMesh, true, 1.0, 0);
    engine.fx?.explosion?.(pos.x, 0.25, pos.z, { scale: 0.9, boss: false, tint: 0xff5a00 });
    engine.fx?.shockwave?.(pos.x, 0.08, pos.z, 0.22, 2.3, 0xff6a00, 0.3, 0.72);
    engine.fx?.oilFire?.(pos.x, pos.z, 1.1);
  }

  /** Ignites any OIL_SLICK cells within `radius` world units of (x, z). */
  igniteOilAt(x, z, radius = TILE_SIZE * 0.9) {
    const { engine } = this;
    if (!engine.grid?.length) return;
    const searchSpan = radius + 0.5;
    let minRow = 0;
    let maxRow = engine.grid.length - 1;
    let minCol = 0;
    let maxColBound = Infinity;
    if (typeof engine.worldToGrid === 'function') {
      const minG = engine.worldToGrid(x - searchSpan, z - searchSpan);
      const maxG = engine.worldToGrid(x + searchSpan, z + searchSpan);
      minRow = Math.max(0, minG.row - 1);
      maxRow = Math.min(engine.grid.length - 1, maxG.row + 1);
      minCol = Math.max(0, minG.col - 1);
      maxColBound = maxG.col + 1;
    }
    for (let r = minRow; r <= maxRow; r++) {
      const row = engine.grid[r];
      if (!row) continue;
      const maxCol = Math.min(row.length - 1, maxColBound);
      for (let c = minCol; c <= maxCol; c++) {
        const cell = row[c];
        if (!cell || (cell.surface !== TileType.OIL_SLICK && cell.type !== TileType.OIL_SLICK) || cell.isBurning) continue;
        const pos = engine.gridToWorld(r, c);
        if (Math.hypot(pos.x - x, pos.z - z) <= searchSpan) {
          this.igniteOilSlick(cell);
        }
      }
    }
  }

  extinguishOilCell(cell) {
    const { engine } = this;
    if (!cell?.isBurning) return;
    cell.isBurning = false;
    cell.burnTimer = 0;
    engine.modelFactory?.updateOilSlickBurn?.(cell.surfaceMesh || cell.mesh, false, 0, 0);
    if (engine.burningOilCells?.length) {
      const idx = engine.burningOilCells.indexOf(cell);
      if (idx >= 0) engine.burningOilCells.splice(idx, 1);
    }
  }

  /** Updates burning oil slick cells: fire/smoke VFX, periodic fire damage, and burnout. */
  updateBurningOil(dt) {
    const { engine } = this;
    if (
      engine.isDisposed ||
      engine.isHangarPaused ||
      engine.isAdPaused ||
      engine.status !== GameStatus.PLAYING ||
      !engine.burningOilCells?.length
    ) {
      return;
    }

    for (let i = engine.burningOilCells.length - 1; i >= 0; i--) {
      const cell = engine.burningOilCells[i];
      if (!cell || (cell.surface !== TileType.OIL_SLICK && cell.type !== TileType.OIL_SLICK) || !cell.isBurning) {
        engine.burningOilCells.splice(i, 1);
        continue;
      }

      cell.burnTimer -= dt;
      cell.burnElapsed = (cell.burnElapsed || 0) + dt;
      cell.burnFxCooldown = (cell.burnFxCooldown || 0) - dt;
      const pos = engine.gridToWorld(cell.row, cell.col);
      const intensity = Math.min(1.05, Math.max(0.28, cell.burnTimer / 1.8));
      const oilMesh = cell.surfaceMesh || cell.mesh;

      engine.modelFactory?.updateOilSlickBurn?.(oilMesh, true, intensity, cell.burnElapsed);

      // Chain-ignite contiguous adjacent oil slick and forest cells after a brief flashover delay
      if (!cell.hasSpreadFire && cell.burnElapsed >= 0.32) {
        cell.hasSpreadFire = true;
        const neighbors = [
          engine.grid?.[cell.row - 1]?.[cell.col],
          engine.grid?.[cell.row + 1]?.[cell.col],
          engine.grid?.[cell.row]?.[cell.col - 1],
          engine.grid?.[cell.row]?.[cell.col + 1],
        ];
        for (const nb of neighbors) {
          if (!nb) continue;
          if ((nb.surface === TileType.OIL_SLICK || nb.type === TileType.OIL_SLICK) && !nb.isBurning) {
            this.igniteOilSlick(nb);
          } else if (nb.type === TileType.FOREST && !nb.isBurning) {
            const nbPos = engine.gridToWorld(nb.row, nb.col);
            engine.forestFire?.startBurning?.(nb, nbPos.x, nbPos.z);
          }
        }
      }

      // Periodically damage adjacent HOUSE_1 / HOUSE_2 cells caught in the oil fire
      cell.houseBurnCooldown = (cell.houseBurnCooldown ?? 0.7) - dt;
      if (cell.houseBurnCooldown <= 0) {
        cell.houseBurnCooldown += 1.0;
        const neighbors = [
          engine.grid?.[cell.row - 1]?.[cell.col],
          engine.grid?.[cell.row + 1]?.[cell.col],
          engine.grid?.[cell.row]?.[cell.col - 1],
          engine.grid?.[cell.row]?.[cell.col + 1],
        ];
        for (const nb of neighbors) {
          if (!nb || (nb.type !== TileType.HOUSE_1 && nb.type !== TileType.HOUSE_2) || nb.hp <= 0) {
            continue;
          }
          const nbPos = engine.gridToWorld(nb.row, nb.col);
          engine.damageTileCell?.(nb, 4, nbPos.x, nbPos.z, false);
        }
      }

      if (cell.burnFxCooldown <= 0) {
        cell.burnFxCooldown = 0.038;
        if (engine.fx?.oilFire) {
          engine.fx.oilFire(pos.x, pos.z, intensity);
        } else {
          engine.fx?.sparks?.(pos.x, 0.2, pos.z, 0xff5500, 4, { speed: 1.5, up: 1.8 });
        }
      }

      const halfCell = TILE_SIZE * 0.52;
      if (
        engine.playerHp > DURABILITY.ZERO_HP &&
        Math.abs(engine.playerX - pos.x) <= halfCell &&
        Math.abs(engine.playerZ - pos.z) <= halfCell
      ) {
        engine.damagePlayer(4.0 * dt, null, 'fire');
        if (Math.random() < 0.28) {
          engine.fx?.sparks?.(engine.playerX, 0.55, engine.playerZ, 0xff6a00, 3, { speed: 1.7, up: 1.8 });
        }
      }

      const targets = [...engine.enemies];
      for (let ei = targets.length - 1; ei >= 0; ei--) {
        const enemy = targets[ei];
        if (!enemy || enemy.hp <= 0) continue;
        if (Math.abs(enemy.x - pos.x) <= halfCell && Math.abs(enemy.z - pos.z) <= halfCell) {
          engine.damageEnemy(enemy, 4.0 * dt);
          if (Math.random() < 0.24) {
            engine.fx?.sparks?.(enemy.x, 0.55, enemy.z, 0xff6a00, 2, { speed: 1.6, up: 1.7 });
          }
        }
      }

      if (cell.burnTimer <= 0) {
        cell.isBurning = false;
        engine.burningOilCells.splice(i, 1);
        const oilMesh = cell.surfaceMesh || cell.mesh;
        if (oilMesh) {
          engine.modelFactory?.updateOilSlickBurn?.(oilMesh, false, 0, 0);
          engine.mapGroup?.remove(oilMesh);
          if (cell.surfaceMesh === oilMesh) cell.surfaceMesh = null;
          if (cell.mesh === oilMesh) cell.mesh = null;
        }
        cell.surface = TileType.EMPTY;
        syncCellType(cell);
        engine.fx?.scorch?.(pos.x, pos.z, 2.1);
        if (cell.object === TileType.BARREL && !cell._exploding) {
          this.explodeBarrel(cell);
        }
      }
    }
  }

  /** Destroys a WATER_TOWER, flooding nearby cells into swamp and extinguishing nearby fires. */
  ruptureWaterTower(cell) {
    const { engine } = this;
    if (!cell || cell.type !== TileType.WATER_TOWER) return;
    const { x, z } = engine.gridToWorld(cell.row, cell.col);

    if (cell.mesh) {
      engine.mapGroup?.remove(cell.mesh);
      cell.mesh = null;
    }
    cell.object = null;
    syncCellType(cell);
    cell.hp = 0;
    engine.blocksDestroyed++;

    sound.playExplosion(1.1, { x, z });
    engine.screenShake = Math.max(engine.screenShake, 0.45);
    engine.fx?.shockwave?.(x, 0.15, z, 0.4, 5.4, 0x0ea5e9, 0.45);
    engine.fx?.sparks?.(x, 0.9, z, 0x38bdf8, 34, { speed: 3.2, up: 2.2 });

    this.convertCellToSwamp(cell);

    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const neighbor = engine.grid[cell.row + dr]?.[cell.col + dc];
        if (!neighbor) continue;
        const distCells = Math.hypot(dr, dc);

        if (distCells <= 2.5) {
          if (neighbor.type === TileType.FOREST && neighbor.isBurning) {
            neighbor.isBurning = false;
            if (engine.burningForests?.length) {
              const fIdx = engine.burningForests.findIndex((bf) => bf.cell === neighbor);
              if (fIdx >= 0) engine.burningForests.splice(fIdx, 1);
            }
          }
          if (neighbor.type === TileType.OIL_SLICK && neighbor.isBurning) {
            this.extinguishOilCell(neighbor);
          }
        }

        if (distCells <= 1.5) {
          this.convertCellToSwamp(neighbor);
        }
      }
    }

    if (engine.tileBatcher) {
      engine.tileBatcher.sync();
    }
  }
}

