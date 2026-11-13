import * as THREE from 'three';
import { settleMission } from '../../sim/hangar.js';
import { DURABILITY, ENEMY_VISIBILITY } from '../constants.js';
import { disposeOwned } from '../render/dispose.js';
import { TILE_SIZE } from '../levels.js';
import { sound } from '../sound.js';
import { rollBoxLoot } from '../terrains/boxes-loot.js';
import { GameStatus, TileType, checkMapDefeat, checkMapVictory } from '../types.js';

/** Manages terrain cell destruction, HQ/enemy base destruction & restoration, rubble, and barrel chains. */
export class TerrainDestructionController {
  constructor(engine) {
    this.engine = engine;
  }

  /** Converts a terrain/obstacle cell (FOREST, BRICK, CONCRETE, ICE, WATER) into scorched SAND. */
  convertCellToSand(cell) {
    const { engine } = this;
    if (!cell || cell.type === TileType.SAND) return;
    if (cell.type === TileType.FOREST && engine.burningForests?.length) {
      const idx = engine.burningForests.findIndex((bf) => bf.cell === cell);
      if (idx >= 0) engine.burningForests.splice(idx, 1);
    }
    cell.isBurning = false;
    if (cell.mesh) {
      engine.mapGroup?.remove(cell.mesh);
      cell.mesh = null;
    }
    if (
      cell.type === TileType.BRICK ||
      cell.type === TileType.CONCRETE ||
      cell.type === TileType.FOREST
    ) {
      engine.blocksDestroyed = (engine.blocksDestroyed || 0) + 1;
    }
    cell.type = TileType.SAND;
    cell.hp = 0;
    cell.subMeshes = undefined;
    if (engine.modelFactory?.createSandBlock && engine.mapGroup) {
      const pos = engine.gridToWorld(cell.row, cell.col);
      const sandMesh = engine.modelFactory.createSandBlock(pos.x, pos.z);
      engine.mapGroup.add(sandMesh);
      cell.mesh = sandMesh;
    }
  }

  /** Rebuilds the continuous water / ice surface meshes after thermobaric vaporization. */
  rebuildWaterAndIceSurfaces(rebuildWater, rebuildIce) {
    const { engine } = this;
    if (!engine.mapGroup || !engine.modelFactory) return;
    const typeGrid = engine.grid.map((row) => row.map((cell) => cell.type));
    if (rebuildWater) {
      if (engine.waterSurfaceMesh) {
        engine.mapGroup.remove(engine.waterSurfaceMesh);
        disposeOwned(engine.waterSurfaceMesh);
      }
      engine.waterSurfaceMesh = engine.modelFactory.createWaterBlock(typeGrid, TileType.WATER);
      engine.mapGroup.add(engine.waterSurfaceMesh);
    }
    if (rebuildIce) {
      if (engine.iceSurfaceMesh) {
        engine.mapGroup.remove(engine.iceSurfaceMesh);
        disposeOwned(engine.iceSurfaceMesh);
      }
      engine.iceSurfaceMesh = engine.modelFactory.createIceBlock(typeGrid, TileType.ICE);
      engine.mapGroup.add(engine.iceSurfaceMesh);
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
      engine.destroyTileCell(cell);
      sound.playExplosion(2.0);
      engine.screenShake = Math.max(engine.screenShake, 1.0);
      engine.fx.tankDestroyed(x, z, { boss: true, tint: 0xff5a2a });

      if (engine.activeMapRules?.spawnSectorBossOnClear && !engine.bossSpawned) {
        engine.spawnSectorBoss();
        engine.setStatusBanner(
          'ENEMY COMMAND CORE DESTROYED! ELIMINATE THE SECTOR BOSS!',
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
        engine.triggerMissionVictory(victoryRes.banner);
        return;
      }
    }
    engine.emitHudUpdate();
  }

  destroyCommandBase() {
    const { engine } = this;
    if (!engine.baseAlive) return;
    engine.baseAlive = false;
    engine.inBaseRepairZone = false;
    const basePos = engine.sectorLoader.getCommandBaseCenter();
    for (const { row, col } of engine.getBaseLayout().cells) {
      const baseCell = engine.grid[row]?.[col];
      if (baseCell?.type === TileType.BASE) engine.destroyTileCell(baseCell);
    }
    engine.fx.tankDestroyed(basePos.x, basePos.z, { boss: true, tint: 0xff7a2a });
    sound.playExplosion(1.6);

    const defeatRes = checkMapDefeat(engine.activeMapRules, {
      playerHp: engine.playerHp,
      baseAlive: false,
    });
    if (defeatRes.isDefeat) {
      engine.status = GameStatus.GAME_OVER;
      sound.stopEngineLoop();
      engine.wasDefeated = true;
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
      engine.setStatusBanner(defeatRes.banner, 5.0);
    } else {
      engine.setStatusBanner(
        engine.activeMapRules?.baseLostBanner ||
          'REPAIR BASE DESTROYED! FIELD REPAIR BAY OFFLINE — CONTINUE THE ASSAULT!',
        4.5
      );
    }
    engine.saveProgress();
    engine.emitHudUpdate();
  }

  restoreCommandBase() {
    const { engine } = this;
    if (engine.baseAlive || engine.status !== GameStatus.PLAYING) return;
    const cells = engine.getBaseLayout().cells.map(({ row, col }) => engine.grid[row]?.[col]);
    if (!cells.length || cells.some((cell) => !cell)) return;
    const pos = engine.sectorLoader.getCommandBaseCenter();
    const mesh = engine.modelFactory.createCommandBaseBlock();
    mesh.position.set(pos.x, 0, pos.z);
    engine.mapGroup.add(mesh);
    cells.forEach((cell, i) => {
      if (cell.type !== TileType.EMPTY) engine.destroyTileCell(cell);
      Object.assign(cell, { type: TileType.BASE, hp: 1, maxHp: 1, mesh: i === 0 ? mesh : null });
    });
    engine.baseAlive = true;
    engine.tileBatcher.sync();
    engine.setStatusBanner('ALLIED HQ REBUILT! FIELD REPAIR BAY ONLINE!', 3);
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

    if (cell.type === TileType.CONCRETE) {
      sound.playBrickHit({ x: hitX, z: hitZ });
      engine.fx.masonryHit(hitX, 0.78, hitZ, { concrete: true, heavy: dmg >= 4 });
      if (cell.mesh) {
        engine.modelFactory.updateConcreteBlockDamage(
          cell.mesh,
          cell.hp,
          cell.maxHp || 16
        );
      }
    } else {
      sound.playBrickHit({ x: hitX, z: hitZ });
      if (cell.type === TileType.SPAWNER) {
        engine.fx.armorHit(hitX, 0.6, hitZ, { scale: 0.8, colorHex: 0xff5a3a });
      } else {
        engine.fx.masonryHit(hitX, 0.7, hitZ, { concrete: false, heavy: dmg >= 2 });
      }
    }

    if (cell.type === TileType.BRICK) engine.modelFactory.updateBrickBlockDamage(cell.mesh, cell.hp);
    engine.tileBatcher.markDirty(cell.mesh);

    if (cell.hp <= 0) {
      engine.destroyTileCell(cell);
    }
  }

  destroyTileCell(cell) {
    const { engine } = this;
    if (!cell || cell.type === TileType.EMPTY) return;
    if (cell.type === TileType.BARREL) {
      engine.explodeBarrel(cell, true);
      return;
    }
    const { x, z } = engine.gridToWorld(cell.row, cell.col);

    if (
      cell.type === TileType.BRICK &&
      engine.modelFactory.useBlenderBricks &&
      engine.modelFactory.brickModels.states.size
    ) {
      const rubble = new THREE.Group();
      rubble.userData.batchTile = true;
      engine.modelFactory.brickModels.apply(rubble, 0);
      rubble.position.set(x, 0, z);
      engine.mapGroup.add(rubble);
      engine.brickRubble.push({ mesh: rubble, life: 12 });
      if (engine.brickRubble.length > 32) engine.mapGroup.remove(engine.brickRubble.shift().mesh);
    }
    if (cell.mesh) {
      engine.mapGroup.remove(cell.mesh);
      cell.mesh = null;
    }

    const wasSpawner = cell.type === TileType.SPAWNER;
    const wasBoxes = cell.type === TileType.BOXES;
    const wasConcrete = cell.type === TileType.CONCRETE;
    const wasForest = cell.type === TileType.FOREST;
    cell.type = TileType.EMPTY;
    engine._spawnerCells = null;
    cell.hp = 0;
    engine.blocksDestroyed++;

    engine.fx.blockDestroyed(
      x,
      z,
      wasBoxes ? 'boxes' : wasSpawner ? 'spawner' : wasConcrete ? 'concrete' : wasForest ? 'forest' : 'brick'
    );

    if (wasSpawner) {
      sound.playExplosion(1.1, { x, z });
    }
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
    cell.type = TileType.EMPTY;
    cell.hp = 0;
    engine.blocksDestroyed++;

    sound.playEnvironmentalExplosion({ x, z });
    engine.screenShake = Math.max(engine.screenShake, 0.75);

    engine.fx.explosion(x, 0.45, z, { scale: 1.85, boss: false, tint: 0xff3b14 });
    engine.fx.shockwave(x, 0.1, z, 0.4, 4.8, 0xff5500, 0.45);
    engine.fx.scorch(x, z, 2.4);
    engine.fx.sparks(x, 0.5, z, 0xffa040, 24, { speed: 2.4, up: 1.5 });

    const blastRadius = 2.8 * TILE_SIZE;
    const maxDamage = 35;

    for (let i = engine.enemies.length - 1; i >= 0; i--) {
      const enemy = engine.enemies[i];
      if (!enemy || enemy.hp <= 0) continue;
      const dist = Math.hypot(enemy.x - x, enemy.z - z);
      if (dist <= blastRadius) {
        const falloff = 1 - (dist / blastRadius) * 0.5;
        const dmg = Math.round(maxDamage * Math.max(0.4, falloff));
        engine.damageEnemy(enemy, dmg, x, z);
        engine.fx.armorHit(enemy.x, 0.5, enemy.z, { scale: 1.3, colorHex: 0xff4500 });
      }
    }

    if (engine.playerHp > DURABILITY.ZERO_HP) {
      const pDist = Math.hypot(engine.playerX - x, engine.playerZ - z);
      if (pDist <= blastRadius) {
        const falloff = 1 - (pDist / blastRadius) * 0.5;
        const dmg = Math.round(maxDamage * Math.max(0.4, falloff));
        engine.damagePlayer(dmg);
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
          engine.damageTileCell(neighbor, 6, nPos.x, nPos.z);
        } else if (neighbor.type === TileType.FOREST) {
          engine.destroyTileCell(neighbor);
        } else if (neighbor.type === TileType.BARREL && !neighbor._exploding) {
          chainBarrels.push(neighbor);
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
}

