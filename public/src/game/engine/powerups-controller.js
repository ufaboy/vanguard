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
        dropPos = engine.gridToWorld(row, col);
      }
    }
    for (let attempt = 0; !dropPos && attempt < 35; attempt++) {
      const r = 4 + Math.floor(Math.random() * (GRID_SIZE - 8));
      const c = 4 + Math.floor(Math.random() * (GRID_SIZE - 8));
      const cell = engine.grid?.[r]?.[c];
      if (!cell) continue;
      if (this.isAirDropLandingCell(cell)) {
        const pos = engine.gridToWorld(r, c);
        const dist = Math.hypot(pos.x - engine.playerX, pos.z - engine.playerZ);
        if (dist >= 4 * TILE_SIZE && dist <= 14 * TILE_SIZE) {
          dropPos = pos;
          break;
        }
        if (!dropPos && dist >= 2 * TILE_SIZE) {
          dropPos = pos;
        }
      }
    }
    if (!dropPos) {
      let nearestPos = null;
      let nearestDistance = Infinity;
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const cell = engine.grid?.[r]?.[c];
          if (!cell || !this.isAirDropLandingCell(cell)) continue;
          const pos = engine.gridToWorld(r, c);
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
      altitude: 18,
      landed: false,
      config,
      rig,
    };
    engine.airDrops ||= [];
    engine.airDrops.push(drop);
    engine.setStatusBanner('ALLIED AIR DROP INBOUND — SECURE THE PARACHUTE CRATE!', 3.0);
    return drop;
  }

  isAirDropLandingCell(cell) {
    return [TileType.EMPTY, TileType.ICE, TileType.ROAD, TileType.SAND].includes(cell?.type);
  }

  updateAirDrops(dt, elapsed) {
    const { engine } = this;
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
        drop.altitude = Math.max(0, drop.altitude - 5.2 * dt);
        rig.crateGroup.position.y = drop.altitude;
        rig.crateGroup.rotation.z = Math.sin(elapsed * 2.4) * 0.12;
        rig.landingRing.scale.setScalar(1 + Math.sin(elapsed * 5.0) * 0.08);
        if (drop.altitude <= 0) {
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
      parts.push(`SHELLS ${engine.cannonAmmo}/${maxShells}`);
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
      parts.length ? `AIR DROP SECURED: ${parts.join(' · ')}` : 'AIR DROP SECURED',
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
            'RM-1 FIELD REPAIR KIT ACQUIRED / PRESS [1] TO REPAIR',
            2.6
          );
        } else {
          const maxOverheal = engine.playerMaxHp * DURABILITY.OVERHEAL_MAX_RATIO;
          engine.playerHp = Math.min(
            maxOverheal,
            engine.playerHp + DURABILITY.REPAIR_POWERUP
          );
          engine.setStatusBanner(
            `HULL REPAIRED: +${DURABILITY.REPAIR_POWERUP} HP (OVERHEAL UP TO 140%)`,
            2.6
          );
        }
        break;

      case POWERUP.EMP:
        engine.empTimer = POWERUP_TYPES[POWERUP.EMP].duration;
        engine.setStatusBanner(
          'EMP BLAST ACTIVATED! ALL HOSTILE ARMOR DISABLED FOR 10s!',
          2.8
        );
        break;

      case POWERUP.BASE_RESTORE:
        engine.restoreCommandBase();
        break;

      case POWERUP.APS:
        engine.addApsRounds(APS.PICKUP_ROUNDS);
        engine.setStatusBanner(
          `ACTIVE PROTECTION SYSTEM (APS): +${APS.PICKUP_ROUNDS} INTERCEPT CHARGES`,
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
          `AMMO CRATE COLLECTED: +${shells} SHELLS (${engine.cannonAmmo}/${maxShells})`,
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
          `HOMING ATGM MISSILE ACQUIRED (${engine.missileAmmo}/${maxMissiles}) [SPACE / RMB]`,
          2.6
        );
        break;
      }
    }

    engine.emitHudUpdate();
  }
}

