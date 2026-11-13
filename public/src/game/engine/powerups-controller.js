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
import { GRID_SIZE } from '../levels.js';
import { isUsefulPowerUp } from '../powerup-drops.js';
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
          engine.persistRepairKitCharges();
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
        engine.cannonAmmo = Math.min(maxShells, engine.cannonAmmo + CANNON_AMMO.PICKUP_AMMO);
        engine.setStatusBanner(
          `AMMO CRATE COLLECTED: +${CANNON_AMMO.PICKUP_AMMO} SHELLS (${engine.cannonAmmo}/${maxShells})`,
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

