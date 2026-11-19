import {
  APS,
  CANNON_AMMO,
  DURABILITY,
  MISSILE,
  POWERUP,
  POWERUP_DROP_TYPES,
  POWERUP_MAX_ON_MAP,
  POWERUP_TYPES,
} from '../constants.js';
import { GRID_SIZE, TILE_SIZE } from '../levels.js';
import { isUsefulPowerUp } from '../powerup-drops.js';
import { disposeOwned } from '../render/dispose.js';
import { sound } from '../sound.js';
import { TileType } from '../types.js';
import { t } from '../../i18n/index.js';

/** Manages spawning, field pickup animation/collection, and application of power-ups. */
export class PowerupsController {
  constructor(engine) {
    this.engine = engine;
  }

  spawnPowerUpOnField(type) {
    const { engine } = this;
    if (engine.powerUps.length >= POWERUP_MAX_ON_MAP) return;
    const chosenType =
      type ||
      POWERUP_DROP_TYPES[Math.floor(Math.random() * POWERUP_DROP_TYPES.length)];

    for (let attempt = 0; attempt < 25; attempt++) {
      const r = 2 + Math.floor(Math.random() * (GRID_SIZE - 4));
      const c = 2 + Math.floor(Math.random() * (GRID_SIZE - 4));
      const cell = engine.grid[r]?.[c];
      if (cell && (cell.type === TileType.EMPTY || cell.type === TileType.ICE)) {
        const pos = engine.gridToWorld(r, c);
        if (Math.hypot(pos.x - engine.playerX, pos.z - engine.playerZ) > 4.0) {
          engine.createPowerUpEntity(chosenType, pos.x, pos.z);
          return;
        }
      }
    }
  }

  createPowerUpEntity(type, x, z) {
    const { engine } = this;
    const mesh = engine.modelFactory.createPowerUpMesh(type);
    mesh.position.set(x, 0, z);
    engine.entityGroup.add(mesh);

    const item = {
      type,
      x,
      z,
      mesh,
    };
    engine.powerUps.push(item);
    return item;
  }

  /** Drops 3 combat power-ups around a defeated boss wreck. */
  dropBossPowerUps(x, z) {
    const { engine } = this;
    if (!engine.modelFactory?.createPowerUpMesh || !engine.entityGroup) return;
    const dropTypes = [POWERUP.AMMO, POWERUP.REPAIR, POWERUP.APS];
    const radius = 1.85;
    for (let i = 0; i < dropTypes.length; i++) {
      const angle = (Math.PI * 2 * i) / dropTypes.length + 0.4;
      let px = x + Math.cos(angle) * radius;
      let pz = z + Math.sin(angle) * radius;
      const g = engine.worldToGrid?.(px, pz);
      const cell = g ? engine.grid?.[g.row]?.[g.col] : null;
      if (!cell || (cell.type !== TileType.EMPTY && cell.type !== TileType.ICE && cell.type !== TileType.SAND && cell.type !== TileType.ROAD && cell.type !== TileType.CRATER)) {
        px = x;
        pz = z;
      }
      engine.createPowerUpEntity(dropTypes[i], px, pz);
    }
  }

  /** Spawns a parachute air-drop supply crate at its configured cell or a passable cell near the combat zone. */
  spawnAirDrop(config) {
    const { engine } = this;
    if (!config || !engine.modelFactory?.createAirDropRig) return null;

    let dropPos = null;
    if (config.spawnCell && Number.isInteger(config.spawnCell.row) && Number.isInteger(config.spawnCell.col)) {
      const { row, col } = config.spawnCell;
      const cell = row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE
        ? engine.grid?.[row]?.[col]
        : null;
      if (cell && this.isAirDropLandingCell(cell)) {
        const pos = engine.gridToWorld(row, col);
        if (this.isAirDropPosFree(pos.x, pos.z)) {
          dropPos = pos;
        }
      }
    }
    let fallbackPos = null;
    for (let attempt = 0; !dropPos && attempt < 35; attempt++) {
      const r = 4 + Math.floor(Math.random() * (GRID_SIZE - 8));
      const c = 4 + Math.floor(Math.random() * (GRID_SIZE - 8));
      const cell = engine.grid?.[r]?.[c];
      if (!cell || !this.isAirDropLandingCell(cell)) continue;
      const pos = engine.gridToWorld(r, c);
      if (!this.isAirDropPosFree(pos.x, pos.z)) continue;
      const dist = Math.hypot(pos.x - engine.playerX, pos.z - engine.playerZ);
      if (dist >= 4 * TILE_SIZE && dist <= 14 * TILE_SIZE) {
        dropPos = pos;
        break;
      }
      if (!fallbackPos && dist >= 2 * TILE_SIZE) {
        fallbackPos = pos;
      }
    }
    dropPos ||= fallbackPos;
    if (!dropPos) {
      let nearestPos = null;
      let nearestDistance = Infinity;
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const cell = engine.grid?.[r]?.[c];
          if (!cell || !this.isAirDropLandingCell(cell)) continue;
          const pos = engine.gridToWorld(r, c);
          if (!this.isAirDropPosFree(pos.x, pos.z)) continue;
          const distance = Math.hypot(pos.x - engine.playerX, pos.z - engine.playerZ);
          if (distance >= 2 * TILE_SIZE && distance < nearestDistance) {
            nearestPos = pos;
            nearestDistance = distance;
          }
        }
      }
      dropPos = nearestPos || { x: engine.playerX, z: engine.playerZ };
    }

    const rig = engine.modelFactory.createAirDropRig();
    rig.root.position.set(dropPos.x, 0, dropPos.z);
    rig.crateGroup.position.y = 18;
    engine.entityGroup.add(rig.root);

    const drop = {
      x: dropPos.x,
      z: dropPos.z,
      targetX: dropPos.x,
      targetZ: dropPos.z,
      altitude: 18,
      landed: false,
      config,
      rig,
    };
    engine.airDrops ||= [];
    engine.airDrops.push(drop);
    engine.setStatusBanner(t('ALLIED AIR DROP INBOUND — SECURE THE PARACHUTE CRATE!'), 3.0);
    return drop;
  }

  isAirDropLandingCell(cell) {
    if (!cell || cell.defenseTurret?.alive || cell.isBurning) return false;
    return [
      TileType.EMPTY,
      TileType.ICE,
      TileType.ROAD,
      TileType.SAND,
      TileType.GRASS,
      TileType.STONE,
      TileType.RUBBLE,
      TileType.CRATER,
    ].includes(cell.type);
  }

  /** True when no active air-drop, powerup, mine, live enemy, or (optionally) player occupies `(x, z)`. */
  isAirDropPosFree(x, z, { ignoreDrop = null, includePlayer = false } = {}) {
    const { engine } = this;
    const minGap = TILE_SIZE * 0.75;
    const near = (item) => item && Math.hypot((item.x ?? 0) - x, (item.z ?? 0) - z) < minGap;
    if ((engine.airDrops || []).some((d) => d !== ignoreDrop && near(d))) return false;
    if ((engine.powerups || []).some(near)) return false;
    if ((engine.mines || []).some(near)) return false;
    if ((engine.enemies || []).some((e) => e && e.hp > 0 && near(e))) return false;
    if (includePlayer && engine.playerHp > 0 && Math.hypot((engine.playerX ?? 0) - x, (engine.playerZ ?? 0) - z) < minGap) {
      return false;
    }
    return true;
  }

  /** Finds the nearest open landing cell around `(x, z)` when a drop's target becomes occupied mid-flight. */
  findNearestFreeAirDropPos(x, z, ignoreDrop = null) {
    const { engine } = this;
    if (!engine.grid?.length || !engine.worldToGrid) return null;
    const size = engine.grid.length;
    const center = engine.worldToGrid(x, z);
    let bestPos = null;
    let bestDist = Infinity;

    for (let radius = 1; radius <= 6; radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;
          const r = center.row + dr;
          const c = center.col + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const cell = engine.grid[r]?.[c];
          if (!cell || !this.isAirDropLandingCell(cell)) continue;
          const pos = engine.gridToWorld(r, c);
          if (!this.isAirDropPosFree(pos.x, pos.z, { ignoreDrop, includePlayer: true })) continue;
          const dist = Math.hypot(pos.x - x, pos.z - z);
          if (dist < bestDist) {
            bestDist = dist;
            bestPos = pos;
          }
        }
      }
      if (bestPos) return bestPos;
    }
    return null;
  }

  /** Finds a passable landing cell near the Enemy HQ (2–6 cells away, preferring the approach side). */
  findAirDropCellNearEnemyBase() {
    const { engine } = this;
    const ebCell = engine._enemyBaseCell || engine.activeMapRules?.enemyBaseCell;
    if (!ebCell || !engine.grid?.length) return null;

    const size = engine.grid.length || GRID_SIZE;
    const mid = (size - 1) / 2;
    let bestInBand = null;
    let bestBandScore = Infinity;
    let bestFallback = null;
    let bestFallbackDist = Infinity;

    for (let r = 1; r < size - 1; r++) {
      for (let c = 1; c < size - 1; c++) {
        const cell = engine.grid[r]?.[c];
        if (!cell || !this.isAirDropLandingCell(cell) || cell.defenseTurret?.alive) continue;
        const dist = Math.hypot(r - ebCell.row, c - ebCell.col);
        if (dist < 1.5) continue;
        if (dist >= 2.0 && dist <= 6.0) {
          const centerBias = (Math.abs(r - mid) + Math.abs(c - mid)) * 0.08;
          const score = Math.abs(dist - 3.2) + centerBias;
          if (score < bestBandScore) {
            bestBandScore = score;
            bestInBand = { row: r, col: c };
          }
        } else if (dist < bestFallbackDist) {
          bestFallbackDist = dist;
          bestFallback = { row: r, col: c };
        }
      }
    }
    return bestInBand || bestFallback;
  }

  /**
   * On maps with an Enemy HQ, spawns a resupply Air Drop near the Enemy HQ once all enemy
   * tanks are eliminated while the Enemy HQ is still standing.
   */
  checkEnemyBaseClearAirDrop() {
    const { engine } = this;
    if (engine.enemyBaseClearAirDropTriggered) return null;
    if (!engine.enemyBaseAlive) return null;
    const hasEnemyBase = Boolean(engine._enemyBaseCell || engine.activeMapRules?.hasEnemyFortifiedBase);
    if (!hasEnemyBase) return null;
    if ((engine.enemies?.length || 0) > 0) return null;
    if ((engine.vanguardRemainingToSpawn || 0) > 0) return null;
    if (engine.activeMapRules?.spawnSectorBossOnClear && !engine.bossSpawned) return null;

    engine.enemyBaseClearAirDropTriggered = true;
    const spawnCell = this.findAirDropCellNearEnemyBase();
    return this.spawnAirDrop({
      shells: 50,
      aps: 12,
      missiles: 6,
      spawnCell,
    });
  }

  updateAirDrops(dt, elapsed) {
    const { engine } = this;
    this.checkEnemyBaseClearAirDrop();
    const queue = engine.airDropQueue;
    if ((!queue || queue.length === 0) && (!engine.airDrops || engine.airDrops.length === 0)) return;

    engine.airDrops ||= [];
    engine.airDropElapsed = (engine.airDropElapsed || 0) + dt;
    if (queue) {
      const totalPool = Math.max(1, engine.initialVanguardCount || engine.vanguardRemainingToSpawn || 1);
      const activeNonBoss = (engine.enemies || []).filter((u) => !u.isBoss).length;
      const remaining = (engine.vanguardRemainingToSpawn || 0) + activeNonBoss;
      const progress = engine.initialVanguardCount > 0 ? 1 - remaining / totalPool : 0;

      for (const entry of queue) {
        if (entry.triggered) continue;
        const timeReady = engine.airDropElapsed >= (entry.delaySec || 0);
        const progressReady = entry.progress == null || progress >= entry.progress;
        if (timeReady && progressReady) {
          entry.triggered = true;
          this.spawnAirDrop(entry);
        }
      }
    }

    for (let i = engine.airDrops.length - 1; i >= 0; i--) {
      const drop = engine.airDrops[i];
      const { rig } = drop;
      if (!drop.landed) {
        if (drop.targetX == null) drop.targetX = drop.x;
        if (drop.targetZ == null) drop.targetZ = drop.z;
        const gridPos = engine.worldToGrid?.(drop.targetX, drop.targetZ);
        const targetCell = gridPos ? engine.grid?.[gridPos.row]?.[gridPos.col] : null;
        const targetBlocked =
          (targetCell && !this.isAirDropLandingCell(targetCell)) ||
          !this.isAirDropPosFree(drop.targetX, drop.targetZ, { ignoreDrop: drop, includePlayer: true });
        if (targetBlocked) {
          const shifted = this.findNearestFreeAirDropPos(drop.targetX, drop.targetZ, drop);
          if (shifted) {
            drop.targetX = shifted.x;
            drop.targetZ = shifted.z;
          }
        }
        const driftAlpha = 1 - Math.exp(-4.0 * dt);
        drop.x += (drop.targetX - drop.x) * driftAlpha;
        drop.z += (drop.targetZ - drop.z) * driftAlpha;
        rig.root?.position?.set?.(drop.x, 0, drop.z);

        drop.altitude = Math.max(0, drop.altitude - 5.2 * dt);
        rig.crateGroup.position.y = drop.altitude;
        rig.crateGroup.rotation.z = Math.sin(elapsed * 2.4) * 0.12;
        rig.landingRing.scale.setScalar(1 + Math.sin(elapsed * 5.0) * 0.08);
        if (drop.altitude <= 0) {
          drop.x = drop.targetX;
          drop.z = drop.targetZ;
          rig.root?.position?.set?.(drop.x, 0, drop.z);
          drop.landed = true;
          rig.crateGroup.position.y = 0;
          rig.crateGroup.rotation.z = 0;
          rig.chuteGroup.visible = false;
          sound.playPowerUp();
        }
      } else {
        if (Math.hypot(engine.playerX - drop.x, engine.playerZ - drop.z) <= 1.45) {
          if (!this.isAirDropUseful(drop.config)) continue;
          this.applyAirDrop(drop.config);
          engine.entityGroup.remove(rig.root);
          disposeOwned(rig.root);
          engine.airDrops.splice(i, 1);
        }
      }
    }
  }

  isAirDropUseful(config) {
    const { engine } = this;
    const needsShells = (Number(config.shells) || 0) > 0 && engine.cannonAmmo < engine.getPlayerMaxCannonAmmo();
    const curAps = engine.apsAmmo.reduce((sum, r) => sum + r, 0);
    const needsAps = (Number(config.aps) || 0) > 0 && curAps < engine.getPlayerMaxApsAmmo();
    const needsMissiles = (Number(config.missiles) || 0) > 0 && engine.missileAmmo < engine.getPlayerMaxMissileAmmo();
    return needsShells || needsAps || needsMissiles;
  }

  applyAirDrop(config) {
    const { engine } = this;
    sound.playPowerUp();
    const parts = [];
    const resolvePctAmount = (maxVal, rawPct) => {
      const pct = Math.max(0, Math.min(100, Number(rawPct) || 0));
      if (pct <= 0 || maxVal <= 0) return 0;
      if (pct >= 100) return maxVal;
      return Math.max(1, Math.round((maxVal * pct) / 100));
    };

    const maxShells = engine.getPlayerMaxCannonAmmo();
    const addShells = resolvePctAmount(maxShells, config.shells);
    if (addShells > 0) {
      engine.cannonAmmo = Math.min(maxShells, engine.cannonAmmo + addShells);
      parts.push(`${t('SHELLS')} ${engine.cannonAmmo}/${maxShells}`);
    }

    const maxAps = engine.getPlayerMaxApsAmmo();
    const addAps = resolvePctAmount(maxAps, config.aps);
    if (addAps > 0) {
      engine.addApsRounds(addAps);
      const nextAps = engine.apsAmmo.reduce((sum, r) => sum + r, 0);
      parts.push(`APS ${nextAps}/${maxAps}`);
    }

    const maxMissiles = engine.getPlayerMaxMissileAmmo();
    const addMissiles = resolvePctAmount(maxMissiles, config.missiles);
    if (addMissiles > 0) {
      engine.missileAmmo = Math.min(maxMissiles, engine.missileAmmo + addMissiles);
      parts.push(`ATGM ${engine.missileAmmo}/${maxMissiles}`);
    }

    if (engine.playerSave) {
      engine.playerSave.missileAmmo = engine.missileAmmo;
      engine.saveRepo?.savePlayerSave?.(engine.playerSave);
    }
    engine.recomputePlayerStats(true);
    engine.setStatusBanner(
      parts.length ? t('AIR DROP SECURED: {items}', { items: parts.join(' · ') }) : t('AIR DROP SECURED'),
      3.2
    );
    engine.emitHudUpdate();
  }

  updatePowerUps(dt, elapsed) {
    const { engine } = this;
    for (let i = engine.powerUps.length - 1; i >= 0; i--) {
      const item = engine.powerUps[i];
      item.mesh.rotation.y = elapsed * 1.2;
      item.mesh.position.y = Math.sin(elapsed * 3) * 0.1;
      const grounded = item.mesh.userData.grounded;
      if (grounded) {
        grounded.position.y = -item.mesh.position.y;
        grounded.rotation.y = -item.mesh.rotation.y;
      }

      if (Math.hypot(engine.playerX - item.x, engine.playerZ - item.z) <= 1.3) {
        if (!isUsefulPowerUp(item.type, engine)) continue;
        engine.applyPowerUp(item.type);
        engine.entityGroup.remove(item.mesh);
        engine.powerUps.splice(i, 1);
      }
    }
  }

  applyPowerUp(type) {
    const { engine } = this;
    sound.playPowerUp();

    switch (type) {
      case POWERUP.REPAIR:
        if (
          engine.playerHp >= engine.playerMaxHp &&
          engine.repairKitState.charges < engine.repairKitState.maxCharges
        ) {
          engine.repairKitState.charges++;
          engine.playerController.persistRepairKitCharges();
          engine.setStatusBanner(
            t('RM-1 FIELD REPAIR KIT ACQUIRED / PRESS [1] TO REPAIR'),
            2.6
          );
        } else {
          const maxOverheal = engine.playerMaxHp * DURABILITY.OVERHEAL_MAX_RATIO;
          engine.playerHp = Math.min(
            maxOverheal,
            engine.playerHp + DURABILITY.REPAIR_POWERUP
          );
          engine.setStatusBanner(
            t('HULL REPAIRED: +{REPAIR_POWERUP} HP (OVERHEAL UP TO 140%)', { REPAIR_POWERUP: DURABILITY.REPAIR_POWERUP }),
            2.6
          );
        }
        break;

      case POWERUP.EMP:
        engine.empTimer = POWERUP_TYPES[POWERUP.EMP].duration;
        engine.setStatusBanner(
          t('EMP BLAST ACTIVATED! ALL HOSTILE ARMOR DISABLED FOR 10s!'),
          2.8
        );
        break;

      case POWERUP.BASE_RESTORE:
        engine.restoreCommandBase();
        break;

      case POWERUP.APS:
        engine.addApsRounds(APS.PICKUP_ROUNDS);
        engine.setStatusBanner(
          t('ACTIVE PROTECTION SYSTEM (APS): +{PICKUP_ROUNDS} INTERCEPT CHARGES', { PICKUP_ROUNDS: APS.PICKUP_ROUNDS }),
          2.6
        );
        break;

      case POWERUP.AMMO: {
        const maxShells = engine.getPlayerMaxCannonAmmo();
        const minShells = CANNON_AMMO.PICKUP_MIN ?? 3;
        const maxDrop = CANNON_AMMO.PICKUP_MAX ?? 7;
        const shells = minShells + Math.floor(Math.random() * (maxDrop - minShells + 1));
        engine.cannonAmmo = Math.min(maxShells, engine.cannonAmmo + shells);
        engine.setStatusBanner(
          t('AMMO CRATE COLLECTED: +{shells} SHELLS ({cannonAmmo}/{maxShells})', { shells, cannonAmmo: engine.cannonAmmo, maxShells }),
          2.5
        );
        break;
      }

      case POWERUP.MISSILE: {
        const maxMissiles = engine.getPlayerMaxMissileAmmo();
        engine.missileAmmo = Math.min(
          maxMissiles,
          engine.missileAmmo + MISSILE.PICKUP_AMMO
        );
        engine.playerSave.missileAmmo = engine.missileAmmo;
        engine.saveRepo.savePlayerSave(engine.playerSave);
        engine.recomputePlayerStats(true);
        engine.setStatusBanner(
          t('HOMING ATGM MISSILE ACQUIRED ({missileAmmo}/{maxMissiles}) [SPACE / RMB]', { missileAmmo: engine.missileAmmo, maxMissiles }),
          2.6
        );
        break;
      }
    }

    engine.emitHudUpdate();
  }
}

