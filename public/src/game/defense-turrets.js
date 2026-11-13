/** Fortified enemy base defense turrets: setup, targeting, firing, and destruction. */

import * as THREE from 'three';
import {
  ARTILLERY,
  BULLET_POWER,
  DEFENSE_TURRET_CONFIGS,
  DEFENSE_TURRET_TYPES,
} from './constants.js';
import { TileType } from './types.js';
import { GRID_SIZE, TILE_SIZE } from './levels.js';
import { sound } from './sound.js';
import { normalizeAngleSigned } from '../sim/ai.js';

export class DefenseTurretsController {
  constructor(engine) {
    this.engine = engine;
  }

  setup() {
    const engine = this.engine;
    if (engine.defenseTurrets) {
      for (const t of engine.defenseTurrets) {
        t.alive = false;
        if (t.rig?.root) engine.mapGroup.remove(t.rig.root);
      }
    }
    engine.defenseTurrets = [];
    if (!engine.activeMapRules.hasEnemyFortifiedBase) return;
    const ebCell = engine.activeMapRules.enemyBaseCell;
    if (!ebCell) return;

    // 4 corner turrets always:
    // South corners face player: CANNON
    // North corners: HOWITZER (mortar barrage)
    const slots = [
      { row: ebCell.row + 1, col: ebCell.col - 1, type: DEFENSE_TURRET_TYPES.CANNON },
      { row: ebCell.row + 1, col: ebCell.col + 1, type: DEFENSE_TURRET_TYPES.CANNON },
      { row: ebCell.row - 1, col: ebCell.col - 1, type: DEFENSE_TURRET_TYPES.HOWITZER },
      { row: ebCell.row - 1, col: ebCell.col + 1, type: DEFENSE_TURRET_TYPES.HOWITZER },
    ];

    // On complex maps, add 2 flanking HYDRA_MLRS batteries:
    const sectorId = engine.currentSectorIndex;
    const isComplexAssault = [9, 14, 18, 21, 26, 29, 31, 33].includes(sectorId);
    if (isComplexAssault) {
      const wCol = ebCell.col - 2;
      const eCol = ebCell.col + 2;
      if (wCol >= 0 && wCol < GRID_SIZE) {
        slots.push({ row: ebCell.row, col: wCol, type: DEFENSE_TURRET_TYPES.MLRS });
      }
      if (eCol >= 0 && eCol < GRID_SIZE) {
        slots.push({ row: ebCell.row, col: eCol, type: DEFENSE_TURRET_TYPES.MLRS });
      }
    }

    for (const slot of slots) {
      const cfg = DEFENSE_TURRET_CONFIGS[slot.type];
      const { x, z } = engine.gridToWorld(slot.row, slot.col);
      const rig = engine.modelFactory.createDefenseTurretRig(slot.type);
      rig.root.position.set(x, 0, z);
      engine.mapGroup.add(rig.root);

      // Remove generic concrete box mesh at that tile if present
      const cell = engine.grid[slot.row]?.[slot.col];
      if (cell && cell.mesh) {
        engine.mapGroup.remove(cell.mesh);
        cell.mesh = null;
      }

      // Turret starts facing south (towards player spawn)
      rig.turret.rotation.y = Math.PI;

      const turretEntity = {
        id: `turret_${slot.row}_${slot.col}`,
        type: slot.type,
        name: cfg.name,
        cfg,
        row: slot.row,
        col: slot.col,
        x,
        z,
        radius: 0.88,
        hp: cfg.maxHp || 100,
        maxHp: cfg.maxHp || 100,
        armor: cfg.armor,
        turretAngle: Math.PI,
        recoil: 0,
        fireCooldown: 1.5 + Math.random() * 2.0,
        salvoRemaining: 0,
        salvoTimer: 0,
        rig,
        alive: true,
      };
      engine.defenseTurrets.push(turretEntity);
      if (cell) cell.defenseTurret = turretEntity;
    }
  }

  update(dt, _elapsed) {
    const engine = this.engine;
    if (!engine.defenseTurrets || engine.defenseTurrets.length === 0) return;
    const empStunned = engine.empTimer > 0;

    for (const t of engine.defenseTurrets) {
      if (!t.alive) continue;

      if (empStunned) {
        if (Math.random() < 0.12) engine.spawnSparks(t.x, 0.9, t.z, 0x06b6d4, 2);
        continue;
      }

      t.fireCooldown -= dt;
      t.recoil = THREE.MathUtils.damp(t.recoil, 0, 10, dt);
      if (t.rig?.barrelPivot) {
        t.rig.barrelPivot.position.z = -t.recoil;
      }

      if (t.salvoRemaining > 0) {
        t.salvoTimer -= dt;
        if (t.salvoTimer <= 0) {
          t.salvoRemaining--;
          t.salvoTimer = t.cfg.salvoInterval || 0.22;
          this.fireMlrsRocket(t);
        }
      }

      const toPlayerX = engine.playerX - t.x;
      const toPlayerZ = engine.playerZ - t.z;
      const dist = Math.hypot(toPlayerX, toPlayerZ);

      const maskedBySmoke = engine.inSmoke || engine.isSegmentInSmoke(t.x, t.z, engine.playerX, engine.playerZ);
      const canEngage =
        dist <= t.cfg.range &&
        !maskedBySmoke &&
        (t.type === 'HOWITZER' || engine.hasLineOfSight(t.x, t.z, engine.playerX, engine.playerZ));

      if (canEngage) {
        const desiredAngle = Math.atan2(toPlayerX, toPlayerZ);
        t.turretAngle = engine.lerpAngle(t.turretAngle, desiredAngle, 3.8 * dt);
        t.rig.turret.rotation.y = t.turretAngle;

        const angleDiff = Math.abs(normalizeAngleSigned(t.turretAngle - desiredAngle));
        if (angleDiff < 0.24 && t.fireCooldown <= 0) {
          this.fire(t, dist);
        }
      }
    }
  }

  fire(t, dist) {
    if (t.type === DEFENSE_TURRET_TYPES.CANNON) {
      this.fireCannon(t);
    } else if (t.type === DEFENSE_TURRET_TYPES.HOWITZER) {
      if (dist >= (t.cfg.minRange || 4.0)) {
        this.fireHowitzer(t);
      }
    } else if (t.type === DEFENSE_TURRET_TYPES.MLRS) {
      t.fireCooldown = t.cfg.fireCooldown + Math.random() * 0.8;
      t.salvoRemaining = t.cfg.salvoCount || 3;
      t.salvoTimer = 0.05;
    }
  }

  fireCannon(t) {
    const engine = this.engine;
    t.fireCooldown = t.cfg.fireCooldown + Math.random() * 0.4;
    t.recoil = 0.35;
    const muzzleDist = t.cfg.muzzleDist || 1.6;
    const dirX = Math.sin(t.turretAngle);
    const dirZ = Math.cos(t.turretAngle);
    const spawnX = t.x + dirX * muzzleDist;
    const spawnZ = t.z + dirZ * muzzleDist;

    engine.spawnProjectile(
      spawnX,
      spawnZ,
      dirX,
      dirZ,
      false,
      t.cfg.damage || 24,
      t.cfg.penetration || 0,
      BULLET_POWER.HEAVY,
      t.cfg.bulletSpeed || 22,
      true
    );

    engine.fx.muzzleFlash(spawnX, 0.75, spawnZ, dirX, dirZ, {
      scale: 1.1,
      tint: 0xf97316,
    });
    engine.spawnSparks(spawnX, 0.75, spawnZ, 0xfde047, 4);
    sound.playCannonShot(false, 3, { x: spawnX, z: spawnZ });
  }

  fireHowitzer(t) {
    const engine = this.engine;
    t.fireCooldown = t.cfg.fireCooldown + Math.random() * 0.8;
    t.recoil = 0.45;
    const targetX = engine.playerX + (Math.random() - 0.5) * 1.4;
    const targetZ = engine.playerZ + (Math.random() - 0.5) * 1.4;
    const muzzleDist = t.cfg.muzzleDist || 1.4;
    const spawnX = t.x + Math.sin(t.turretAngle) * muzzleDist;
    const spawnZ = t.z + Math.cos(t.turretAngle) * muzzleDist;

    sound.playCannonShot(true, 4, { x: spawnX, z: spawnZ });
    engine.createArtilleryStrike(
      spawnX,
      spawnZ,
      targetX,
      targetZ,
      (t.cfg.blastRadius || 2.2) * TILE_SIZE,
      ARTILLERY.FLIGHT_TIME,
      t.cfg.damage || 40,
      false,
      1.1
    );
  }

  fireMlrsRocket(t) {
    const engine = this.engine;
    const spread = (Math.random() - 0.5) * 0.18;
    const dirX = Math.sin(t.turretAngle + spread);
    const dirZ = Math.cos(t.turretAngle + spread);
    const spawnX = t.x + dirX * 1.2;
    const spawnZ = t.z + dirZ * 1.2;

    sound.playMissileLaunch({ x: spawnX, z: spawnZ });
    engine.spawnEnemyHomingMissile(spawnX, spawnZ, dirX, dirZ);
  }

  damage(turret, p) {
    const engine = this.engine;
    if (!turret.alive) return;
    const pen = p.isMissile ? 60 : (engine.playerStats?.armorPenetration ?? 20);
    const effectiveArmor = turret.armor * (1 - pen / 100);
    const finalDmg = Math.max(1, (p.damage || 0) * (1 - effectiveArmor / 100));
    turret.hp = Math.max(0, turret.hp - finalDmg);
    if (turret.rig?.hpBarFill) {
      const ratio = turret.hp / turret.maxHp;
      turret.rig.hpBarFill.scale.x = Math.max(0.01, ratio);
      if (ratio < 0.33) turret.rig.hpBarFill.material.color.setHex(0xef4444);
      else if (ratio < 0.66) turret.rig.hpBarFill.material.color.setHex(0xeab308);
    }
    engine.spawnSparks(p.x, 0.9, p.z, 0xf97316, 6);
    sound.playArmorHit({ x: p.x, z: p.z });
    if (turret.hp <= 0) this.destroy(turret);
  }

  destroy(turret) {
    const engine = this.engine;
    if (!turret.alive) return;
    turret.alive = false;
    engine.mapGroup.remove(turret.rig.root);
    this.convertCellToSand(turret);
    engine.detonateExplosionAt(turret.x, turret.z, 2.2, 25, false);
    engine.screenShake = Math.max(engine.screenShake, 0.45);
    const bounty = 300;
    engine.playerSave.credits = (engine.playerSave.credits || 0) + bounty;
    engine.creditsEarnedThisMission = (engine.creditsEarnedThisMission || 0) + bounty;
    engine.saveRepo.savePlayerSave(engine.playerSave);
    engine.emitHudUpdate();
    sound.playExplosionLarge();
    engine.setStatusBanner(`${turret.name.toUpperCase()} DESTROYED! +300 CREDITS`, 2.5);
  }

  /** A destroyed turret leaves passable sand where its concrete barbette stood. */
  convertCellToSand(turret) {
    const engine = this.engine;
    const cell = engine.grid[turret.row]?.[turret.col];
    if (!cell) return;
    cell.defenseTurret = null;
    if (cell.mesh) {
      engine.mapGroup.remove(cell.mesh);
      cell.mesh = null;
    }
    cell.type = TileType.SAND;
    cell.hp = 0;
    const sandMesh = engine.modelFactory.createSandBlock(turret.x, turret.z);
    engine.mapGroup.add(sandMesh);
    cell.mesh = sandMesh;
    engine.tileBatcher?.sync();
  }
}

