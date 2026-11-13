/** Boss phase transitions, Titan directional Aegis, Inferno Overdrive Ram, and onboard boss APS. */

import * as THREE from 'three';
import { bossApsCanIntercept } from '../../sim/aps.js';
import {
  BOSS_APS,
  DURABILITY,
  HYDRA,
  INFERNO,
  MAMMOTH,
  TANK_HIT_RADIUS,
  TITAN,
  computeEffectiveDamage,
} from '../constants.js';
import { EnemyClass, TileType } from '../types.js';
import { GRID_SIZE, TILE_SIZE } from '../levels.js';
import { disposeOwned, markOwned } from '../render/dispose.js';
import { sound } from '../sound.js';

export class BossCombat {
  constructor(engine) {
    this.engine = engine;
  }

  /** Aegis plating: armour % by hit aspect (rear drops to 0 during overload). */
  titanAspectArmor(e, aspect) {
    if (aspect === 'rear' && e.titanOverload) return TITAN.ARMOR_REAR_OVERLOAD;
    return e.stats.armorByAspect[aspect] ?? e.stats.armor;
  }

  clearInfernoDashBeam(e) {
    if (e?.infernoDashBeam) {
      this.engine.fxGroup?.remove(e.infernoDashBeam);
      disposeOwned(e.infernoDashBeam);
      e.infernoDashBeam = null;
    }
  }

  /**
   * BOSS_INFERNO Overdrive Ram: locks onto player heading for 0.85s
   * with a glowing hazard telegraph line, then surges forward at 3.4x speed, smashing
   * brick/crates/forests and ramming the player hull on impact.
   */
  updateInfernoDash(e, dt, { canSeePlayer, toPlayerX, toPlayerZ, distToPlayer }) {
    const engine = this.engine;
    if (e.infernoDashWindup > 0) {
      e.infernoDashWindup -= dt;
      e.targetDirX = 0;
      e.targetDirZ = 0;
      const lockAngle = Math.atan2(e.infernoDashDirX, e.infernoDashDirZ);
      e.hullAngle = engine.lerpAngle(e.hullAngle, lockAngle, 12 * dt);
      if (Math.random() < 0.7) {
        const bx = e.x - Math.sin(e.hullAngle) * 1.8;
        const bz = e.z - Math.cos(e.hullAngle) * 1.8;
        engine.fx.flameJet(bx, 0.75, bz, -e.infernoDashDirX * 5, -e.infernoDashDirZ * 5, 0.25);
      }
      if (e.infernoDashWindup <= 0) {
        this.clearInfernoDashBeam(e);
        e.infernoDashTimer = INFERNO.DASH_DURATION_SEC;
        e.infernoDashCooldown = e.infernoEnraged ? INFERNO.PHASE2_DASH_COOLDOWN : INFERNO.DASH_COOLDOWN;
        sound.playExplosion(1.15, { x: e.x, z: e.z });
        engine.screenShake = Math.max(engine.screenShake || 0, 0.4);
      }
      return 1.0;
    }

    if (e.infernoDashTimer > 0) {
      e.infernoDashTimer -= dt;
      e.targetDirX = e.infernoDashDirX;
      e.targetDirZ = e.infernoDashDirZ;

      const bx = e.x - e.infernoDashDirX * 1.9;
      const bz = e.z - e.infernoDashDirZ * 1.9;
      engine.fx.flameJet(bx, 0.72, bz, -e.infernoDashDirX * 8, -e.infernoDashDirZ * 8, 0.15);

      const radius = 1.45;
      engine.crushBossObstacles(e.x + e.infernoDashDirX * 0.9, e.z + e.infernoDashDirZ * 0.9, radius);

      // Vaporize trees in front of the heated dozer blade into sand.
      const half = (GRID_SIZE * TILE_SIZE) / 2;
      const frontX = e.x + e.infernoDashDirX * 1.4;
      const frontZ = e.z + e.infernoDashDirZ * 1.4;
      const minCol = Math.max(0, Math.floor((frontX - radius + half) / TILE_SIZE));
      const maxCol = Math.min(GRID_SIZE - 1, Math.floor((frontX + radius + half) / TILE_SIZE));
      const minRow = Math.max(0, Math.floor((frontZ - radius + half) / TILE_SIZE));
      const maxRow = Math.min(GRID_SIZE - 1, Math.floor((frontZ + radius + half) / TILE_SIZE));
      let forestConverted = false;
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const cell = engine.grid[r]?.[c];
          if (cell?.type === TileType.FOREST) {
            engine.convertCellToSand(cell);
            forestConverted = true;
          }
        }
      }
      if (forestConverted) engine.tileBatcher?.sync();

      // Drop a proximity mine behind midway through the overdrive sprint.
      if (
        e.infernoDashTimer <= INFERNO.DASH_DURATION_SEC * 0.5 &&
        e.minesRemaining > 0 &&
        engine.mines &&
        engine.mines.length < 10 &&
        !e._dashMineDropped
      ) {
        e._dashMineDropped = true;
        e.minesRemaining--;
        engine.plantMineAt(bx, bz);
      }

      // Ram collision check against the player tank.
      if (!e.infernoDashHitPlayer && distToPlayer <= radius + TANK_HIT_RADIUS.PLAYER + 0.35) {
        e.infernoDashHitPlayer = true;
        e.infernoDashTimer = 0;
        const aspect = engine.blastSideArmor(
          engine.playerStats,
          engine.playerX,
          engine.playerZ,
          engine.playerHullAngle,
          e.x,
          e.z
        );
        const dmg = computeEffectiveDamage(INFERNO.DASH_RAM_DAMAGE, 35, aspect);
        engine.damagePlayer(dmg, { zone: 'hull', aspect: 'front' });
        engine.fx.explosion(engine.playerX, 0.7, engine.playerZ, { scale: 1.35, tint: 0xff4500 });
        sound.playExplosion(1.3, { x: engine.playerX, z: engine.playerZ });
        engine.screenShake = Math.max(engine.screenShake || 0, 0.85);
        engine.setStatusBanner('CRITICAL RAM IMPACT FROM CERBERUS-T!', 2.2);
      }

      if (e.infernoDashTimer <= 0) {
        e._dashMineDropped = false;
      }
      return INFERNO.DASH_SPEED_MULT;
    }

    const cells = distToPlayer / TILE_SIZE;
    if (
      canSeePlayer &&
      e.infernoDashCooldown <= 0 &&
      cells >= INFERNO.DASH_MIN_CELLS &&
      cells <= INFERNO.DASH_MAX_CELLS &&
      distToPlayer > 0.1
    ) {
      e.infernoDashDirX = toPlayerX / distToPlayer;
      e.infernoDashDirZ = toPlayerZ / distToPlayer;
      e.infernoDashWindup = INFERNO.DASH_WINDUP_SEC;
      e.infernoDashHitPlayer = false;
      e._dashMineDropped = false;

      const beamLen = Math.min(22, distToPlayer + 4);
      const geo = new THREE.PlaneGeometry(2.4, beamLen);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0, beamLen / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff4500,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const beam = new THREE.Mesh(geo, mat);
      beam.position.set(e.x, 0.09, e.z);
      beam.rotation.y = Math.atan2(e.infernoDashDirX, e.infernoDashDirZ);
      markOwned(beam);
      engine.fxGroup.add(beam);
      e.infernoDashBeam = beam;

      sound.playBossAlarm();
      engine.setStatusBanner(`${e.name.toUpperCase()}: OVERDRIVE RAM ENGAGED!`, 1.8);
      return 1.0;
    }

    return 1.0;
  }

  /** Next un-triggered HP-gate for a boss, ordered from highest HP ratio to lowest. */
  nextPhaseGate(e) {
    if (!e?.isBoss) return null;
    if (e.enemyClass === EnemyClass.BOSS_MAMMOTH && !e.mammothEnraged) {
      return { ratio: MAMMOTH.PHASE2_HP_RATIO, id: 'mammoth_phase2' };
    }
    if (e.enemyClass === EnemyClass.BOSS_HYDRA && !e.hydraEnraged) {
      return { ratio: HYDRA.PHASE2_HP_RATIO, id: 'hydra_phase2' };
    }
    if (e.enemyClass === EnemyClass.BOSS_INFERNO && !e.infernoEnraged) {
      return { ratio: INFERNO.PHASE2_HP_RATIO, id: 'inferno_phase2' };
    }
    if (e.enemyClass === EnemyClass.BOSS_TITAN) {
      if (!e.titanEscortCalled) return { ratio: TITAN.ESCORT_HP_RATIO, id: 'titan_escort' };
      if (!e.titanOverload) return { ratio: TITAN.OVERLOAD_HP_RATIO, id: 'titan_overload' };
    }
    return null;
  }

  ensurePhaseShieldMesh(e) {
    if (!e?.rig?.root) return null;
    if (!e.phaseShieldMesh) {
      const radius = (e.hitRadius ?? TANK_HIT_RADIUS.DEFAULT_BOSS) * 1.45;
      const geo = new THREE.SphereGeometry(radius, 20, 14);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.28,
        wireframe: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0.85, 0);
      markOwned(mesh);
      e.rig.root.add(mesh);
      e.phaseShieldMesh = mesh;
    }
    e.phaseShieldMesh.visible = true;
    return e.phaseShieldMesh;
  }

  syncPhaseShieldVisual(e, elapsed) {
    const mesh = e.phaseShieldMesh;
    if (!mesh) return;
    mesh.visible = e.phaseShieldTimer > 0;
    if (!mesh.visible) return;
    mesh.rotation.y = elapsed * 1.8;
    const fade = Math.min(1, e.phaseShieldTimer / 0.45);
    mesh.material.opacity = (0.22 + Math.sin(elapsed * 14) * 0.08) * fade;
  }

  triggerPhaseTransition(e, phaseId) {
    const engine = this.engine;
    e.phaseShieldTimer = BOSS_APS.PHASE_SHIELD_SEC;
    this.ensurePhaseShieldMesh(e);
    sound.playBossAlarm();
    engine.fx?.shockwave?.(e.x, 0.2, e.z, 0.6, 5.5, 0x38bdf8, 0.5);

    if (phaseId === 'mammoth_phase2') {
      e.mammothEnraged = true;
      engine.screenShake = Math.max(engine.screenShake || 0, 0.55);
      engine.callBossEscort(e, MAMMOTH.ESCORT_CLASSES);
      engine.setStatusBanner?.(
        `${e.name.toUpperCase()}: CITADEL OVERDRIVE & PHASE SHIELD - ESCORT INBOUND`,
        3.2
      );
    } else if (phaseId === 'hydra_phase2') {
      e.hydraEnraged = true;
      engine.screenShake = Math.max(engine.screenShake || 0, 0.55);
      engine.callBossEscort(e, HYDRA.ESCORT_CLASSES);
      engine.setStatusBanner?.(
        `${e.name.toUpperCase()}: LAUNCHER HEADS OVERCLOCKED & SHIELD UP - ESCORT INBOUND`,
        3.2
      );
    } else if (phaseId === 'inferno_phase2') {
      e.infernoEnraged = true;
      e.minesRemaining = Math.max(e.minesRemaining || 0, 3);
      engine.screenShake = Math.max(engine.screenShake || 0, 0.65);
      engine.callBossEscort(e, INFERNO.ESCORT_CLASSES);
      engine.setStatusBanner?.(
        `${e.name.toUpperCase()}: THERMOBARIC OVERDRIVE & PHASE SHIELD - INCENDIARY ESCORT INBOUND`,
        3.4
      );
    } else if (phaseId === 'titan_escort') {
      e.titanEscortCalled = true;
      engine.screenShake = Math.max(engine.screenShake || 0, 0.5);
      engine.callBossEscort(e, TITAN.ESCORT_CLASSES);
      engine.setStatusBanner?.(
        `${e.name.toUpperCase()}: PHASE SHIELD ACTIVE - ESCORT REINFORCEMENTS INBOUND`,
        3.2
      );
    } else if (phaseId === 'titan_overload') {
      e.titanOverload = true;
      engine.screenShake = Math.max(engine.screenShake || 0, 0.65);
      engine.setStatusBanner?.(
        `${e.name.toUpperCase()}: REACTOR OVERLOAD & PHASE SHIELD - REAR RADIATORS EXPOSED`,
        3.4
      );
    }
  }

  /** Spawns a boss escort group from the northern border. */
  callEscort(_e, escortClasses = TITAN.ESCORT_CLASSES) {
    const engine = this.engine;
    if (!engine.grid?.length) return;
    escortClasses.forEach((escortClass) => {
      const targetPos = engine.getSpawnPosition();
      const cell = engine.worldToGrid(targetPos.x, targetPos.z);
      const spawn = engine.resolveBorderSpawn(cell, { enemyClass: escortClass });
      if (spawn) {
        engine.createEnemyAt(escortClass, spawn.spawnPos.x, spawn.spawnPos.z, false, spawn.entryTarget);
      }
    });
    engine.emitHudUpdate?.();
  }

  /** Onboard boss APS intercepts incoming player ATGMs when charges and LOS allow. */
  tryApsIntercept(projectile) {
    const engine = this.engine;
    if (!bossApsCanIntercept(projectile)) return false;
    const detectRadius = BOSS_APS.DETECT_RADIUS * TILE_SIZE;
    for (const e of engine.enemies) {
      if (!e.isBoss || e.hp <= DURABILITY.ZERO_HP) continue;
      if ((e.apsCharges || 0) <= 0 || (e.apsRearmTimer || 0) > 0 || (e.phaseShieldTimer || 0) > 0) continue;
      const toBossX = e.x - projectile.x;
      const toBossZ = e.z - projectile.z;
      const dist = Math.hypot(toBossX, toBossZ);
      if (dist > detectRadius) continue;
      if (toBossX * projectile.vx + toBossZ * projectile.vz <= 0) continue;
      if (engine.hasLineOfSight && !engine.hasLineOfSight(projectile.x, projectile.z, e.x, e.z)) continue;

      e.apsCharges -= 1;
      e.apsRearmTimer = BOSS_APS.REARM_SEC;
      if ((e.apsRechargeTimer || 0) <= 0) e.apsRechargeTimer = BOSS_APS.RECHARGE_SEC;
      sound.playApsIntercept({ x: projectile.x, z: projectile.z });
      const len = dist || 1;
      engine.fx?.apsIntercept?.(
        e.x - (toBossX / len) * 0.95,
        1.15,
        e.z - (toBossZ / len) * 0.95,
        projectile.x,
        1.35,
        projectile.z
      );
      engine.setStatusBanner?.(
        `${e.name.toUpperCase()}: APS INTERCEPTED ATGM (${e.apsCharges}/${e.apsMaxCharges})`,
        1.4
      );
      return true;
    }
    return false;
  }
}

