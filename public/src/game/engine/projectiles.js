import * as THREE from 'three';
import { resolveArmorHit } from '../../sim/ballistics.js';
import { resolveHardModeMissileGuidance } from '../../sim/atgm.js';
import { HULL_CATALOG, TURRET_CATALOG } from '../../sim/catalog.js';
import { applySubsystemDamage } from '../../sim/subsystems.js';
import {
  JAMMER_ECM,
  computeJammedMissileTarget,
  isPointWithinJammerRadius,
} from '../../sim/jammer.js';
import {
  BULLET_POWER,
  DURABILITY,
  FLAME_STREAM,
  INFERNO,
  MISSILE,
  TANK_HIT_RADIUS,
  computeEffectiveDamage,
} from '../constants.js';
import { animateMissileVisual, createProjectileVisual } from '../effects/index.js';
import { GRID_SIZE, SECTORS, TILE_SIZE } from '../levels.js';
import { sound } from '../sound.js';
import { breachEntryOffset } from '../terrains/breach-models.js';
import { EnemyClass, GameStatus, TileType, checkMapVictory } from '../types.js';
import { t } from '../../i18n/index.js';

const MISSILE_CRUISE_Y = 4.4;
const MISSILE_IMPACT_Y = 0.85;
const MISSILE_CLIMB_DIST = 3.2;
const MISSILE_DIVE_DIST = 4.8;
const LANDMARK_LOOKAHEAD = 8.0;
const LANDMARK_CLEARANCE = 1.2;

/** Returns true if any cell near (wx, wz) is a tall 3D landmark that the missile should skirt around. */
function isNearLandmark(engine, wx, wz) {
  if (!engine.grid || !engine.worldToGrid) return false;
  const r = LANDMARK_CLEARANCE;
  for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    const { row, col } = engine.worldToGrid(wx + ox, wz + oz);
    if (engine.grid[row]?.[col]?.type === TileType.LANDMARK) return true;
  }
  return false;
}

/** True when a ray along `angle` hits a LANDMARK cell within `maxDist` world units. */
function rayHitsLandmark(engine, x, z, angle, maxDist) {
  const dx = Math.sin(angle);
  const dz = Math.cos(angle);
  for (let d = 1.0; d <= maxDist; d += 1.0) {
    if (isNearLandmark(engine, x + dx * d, z + dz * d)) return true;
  }
  return false;
}

/** Steers `desiredAngle` left or right around tall landmarks while staying as close as possible to the target bearing. */
function avoidLandmarkHeading(engine, x, z, curAngle, desiredAngle) {
  if (!engine.grid || !engine.worldToGrid) return desiredAngle;
  if (!rayHitsLandmark(engine, x, z, desiredAngle, LANDMARK_LOOKAHEAD) &&
      !rayHitsLandmark(engine, x, z, curAngle, LANDMARK_LOOKAHEAD * 0.6)) {
    return desiredAngle;
  }
  const offsets = [0.3, 0.55, 0.85, 1.15, 1.45, 1.8];
  for (const off of offsets) {
    const left = desiredAngle + off;
    const right = desiredAngle - off;
    const leftOk = !rayHitsLandmark(engine, x, z, left, LANDMARK_LOOKAHEAD);
    const rightOk = !rayHitsLandmark(engine, x, z, right, LANDMARK_LOOKAHEAD);
    if (leftOk && rightOk) {
      const diffL = Math.abs(Math.atan2(Math.sin(left - curAngle), Math.cos(left - curAngle)));
      const diffR = Math.abs(Math.atan2(Math.sin(right - curAngle), Math.cos(right - curAngle)));
      return diffL <= diffR ? left : right;
    }
    if (leftOk) return left;
    if (rightOk) return right;
  }
  return desiredAngle;
}

/** Computes lofted cruise altitude (above 2-story buildings) and steep terminal dive for player missiles. */
function updatePlayerMissileAltitude(p, targetX, targetZ, hasTarget, dt) {
  const prevY = p.flightY ?? 1.35;
  const climbT = Math.min(1, (p.traveled || 0) / MISSILE_CLIMB_DIST);
  const climbSmooth = climbT * climbT * (3 - 2 * climbT);
  let targetY = 1.35 + (MISSILE_CRUISE_Y - 1.35) * climbSmooth;

  if (hasTarget && climbT >= 0.35) {
    const dist = Math.hypot(targetX - p.x, targetZ - p.z);
    if (dist < MISSILE_DIVE_DIST) {
      const diveT = Math.max(0, Math.min(1, (MISSILE_DIVE_DIST - dist) / (MISSILE_DIVE_DIST - 0.65)));
      const diveSmooth = diveT * diveT;
      targetY = targetY + (MISSILE_IMPACT_Y - targetY) * diveSmooth;
    }
  }

  const maxStep = Math.max(0.05, (p.speed || 14) * dt * 1.4);
  const nextY = THREE.MathUtils.clamp(targetY, prevY - maxStep, prevY + maxStep);
  const dy = nextY - prevY;
  const ds = Math.max(0.01, (p.speed || 14) * dt);
  const targetPitch = THREE.MathUtils.clamp(Math.atan2(-dy, ds), -0.85, 1.1);
  p.pitch = THREE.MathUtils.lerp(p.pitch ?? 0, targetPitch, Math.min(1, dt * 14));
  p.flightY = nextY;
  if (p.mesh) {
    p.mesh.rotation.order = 'YXZ';
    p.mesh.rotation.x = p.pitch;
  }
  return nextY;
}

/** Where shell `p` met the wall of `cell`, so the hit is reported on the face it struck. */
function wallEntryPoint(engine, cell, p) {
  const centre = engine.gridToWorld(cell.row, cell.col);
  const entry = breachEntryOffset(p.x - centre.x, p.z - centre.z, p.vx, p.vz);
  return { x: centre.x + entry.dx, z: centre.z + entry.dz };
}

/** Manages projectiles, homing missiles, trails, impact resolution, and laser fadeout. */
export class ProjectilesController {
  constructor(engine) {
    this.engine = engine;
  }

  /** Shell spawn point `dist` along (dirX, dirZ) from a tank centre, shifted sideways by. */
  traceMuzzle(x, z, dirX, dirZ, dist, fromPlayer, latX = 0, latZ = 0) {
    const { engine } = this;
    const STEP = 0.2;
    const MIN = 0.6;
    let safeX = x + dirX * MIN + latX;
    let safeZ = z + dirZ * MIN + latZ;
    for (let t = MIN; t <= dist + 1e-6; t += STEP) {
      const px = x + dirX * t + latX;
      const pz = z + dirZ * t + latZ;
      if (engine.checkTankWallCollision(px, pz, 0.05, true)) return { x: safeX, z: safeZ };
      if (fromPlayer) {
        if (
          engine.enemies.some(
            (en) => Math.hypot(en.x - px, en.z - pz) <= (en.hitRadius ?? TANK_HIT_RADIUS.DEFAULT)
          )
        ) {
          return { x: px, z: pz };
        }
      } else if (Math.hypot(engine.playerX - px, engine.playerZ - pz) <= TANK_HIT_RADIUS.PLAYER) {
        return { x: px, z: pz };
      }
      safeX = px;
      safeZ = pz;
    }
    return { x: x + dirX * dist + latX, z: z + dirZ * dist + latZ };
  }

  spawnProjectile(
    x,
    z,
    dirX,
    dirZ,
    fromPlayer,
    damage,
    penetration,
    bulletPower,
    speed,
    isHeavy,
    weaponId = null,
    opts = {}
  ) {
    const { engine } = this;
    const isThermobaric = Boolean(opts.isThermobaric);
    const color = isThermobaric ? 0xff4500 : fromPlayer ? 0xffb030 : isHeavy ? 0xff4a2a : 0xff7a1e;
    const radius = isThermobaric ? 0.28 : isHeavy ? 0.19 : 0.14;
    const mesh = createProjectileVisual(color, {
      radius,
      length: isThermobaric ? 0.62 : isHeavy ? 0.5 : 0.38,
      glow: isThermobaric ? 1.55 : isHeavy ? 1.15 : 1,
    });
    const startFlightY = opts.flightY ?? 0.52;
    mesh.position.set(x, startFlightY, z);
    mesh.rotation.y = Math.atan2(dirX, dirZ);
    engine.fxGroup.add(mesh);

    const proj = {
      x,
      z,
      vx: dirX * speed,
      vz: dirZ * speed,
      fromPlayer,
      damage,
      penetration,
      bulletPower,
      speed,
      radius,
      life: 2.4,
      traveled: 0,
      isHeavy,
      isThermobaric,
      blastCells: opts.blastCells || 0,
      detonateDist: opts.detonateDist || 0,
      flightY: startFlightY,
      startFlightY,
      targetFlightY: opts.targetFlightY ?? startFlightY,
      flightDist: opts.flightDist || 0,
      canHitPlayer: Boolean(opts.canHitPlayer),
      weaponId,
      mesh,
      trailColor: color,
      trailWidth: isThermobaric ? 0.32 : isHeavy ? 0.2 : 0.15,
      trailLife: isThermobaric ? 0.22 : isHeavy ? 0.16 : 0.12,
    };
    if (fromPlayer && !opts.isMissile && !isThermobaric) {
      const victoryTarget = this.predictVictoryShotTarget(proj);
      if (victoryTarget) {
        proj.isVictoryFpvShot = true;
        proj.victoryTargetEnemy = victoryTarget.enemy || null;
        proj.victoryTargetBase = Boolean(victoryTarget.base);
      }
    }
    engine.projectiles.push(proj);
  }

  /**
   * Predicts at muzzle exit whether a straight-flying player cannon shell will strike and destroy
   * the final enemy tank or Enemy Command Base HQ needed to trigger mission victory.
   * Accounts for enemy velocity during shell flight so shots against moving targets are detected.
   */
  predictVictoryShotTarget(p) {
    const { engine } = this;
    if (
      !engine ||
      engine.status !== GameStatus.PLAYING ||
      engine.survivalState ||
      !engine.activeMapRules ||
      !(p.speed > 0)
    ) {
      return null;
    }

    const sector = SECTORS[engine.currentSectorIndex];
    const canWinByEnemyKill = (() => {
      if (engine.vanguardRemainingToSpawn > 0) return false;
      const aliveEnemies = Array.isArray(engine.enemies)
        ? engine.enemies.filter((e) => e && e.hp > DURABILITY.ZERO_HP)
        : [];
      if (aliveEnemies.length !== 1) return false;
      const lastEnemy = aliveEnemies[0];
      const hasPendingBossStage =
        lastEnemy.isBoss &&
        Array.isArray(sector?.bossSequence) &&
        engine.bossStageIndex + 1 < sector.bossSequence.length;
      if (hasPendingBossStage) return false;
      const allSequenceStagesDone =
        !Array.isArray(sector?.bossSequence) ||
        sector.bossSequence.length === 0 ||
        (engine.bossSequenceStarted && engine.bossStageIndex + 1 >= sector.bossSequence.length);
      const victoryRes = checkMapVictory(engine.activeMapRules, {
        enemyBaseDestroyed: !engine.enemyBaseAlive,
        vanguardRemainingToSpawn: 0,
        activeEnemiesCount: 0,
        bossDefeated: allSequenceStagesDone && engine.bossSpawned,
      });
      return Boolean(victoryRes.isVictory);
    })();

    const canWinByBaseDestroy = (() => {
      if (!engine.enemyBaseAlive) return false;
      if (engine.activeMapRules.spawnSectorBossOnClear && !engine.bossSpawned) return false;
      const aliveEnemies = Array.isArray(engine.enemies)
        ? engine.enemies.filter((e) => e && e.hp > DURABILITY.ZERO_HP)
        : [];
      const victoryRes = checkMapVictory(engine.activeMapRules, {
        enemyBaseDestroyed: true,
        vanguardRemainingToSpawn: engine.vanguardRemainingToSpawn,
        activeEnemiesCount: aliveEnemies.length,
        bossDefeated: engine.bossSpawned && !aliveEnemies.some((u) => u.isBoss),
      });
      return Boolean(victoryRes.isVictory);
    })();

    if (!canWinByEnemyKill && !canWinByBaseDestroy) return null;

    const halfArena = (GRID_SIZE * TILE_SIZE) / 2;
    const stepDist = 0.25;
    const maxDist = p.speed * (p.life || 2.4);
    const dirX = p.vx / p.speed;
    const dirZ = p.vz / p.speed;
    const ebCenter = canWinByBaseDestroy ? engine.getEnemyBaseCenter?.() : null;
    const ebCellCoords = canWinByBaseDestroy ? engine.enemyBaseCell?.() : null;

    const estimateEnemyVelocity = (enemy) => {
      const rawSpd = (enemy.stats?.moveSpeed || 0) * TILE_SIZE;
      if (!(rawSpd > 0)) return { vx: 0, vz: 0 };
      if (enemy.entryTarget) {
        const tx = enemy.entryTarget.x - enemy.x;
        const tz = enemy.entryTarget.z - enemy.z;
        const d = Math.hypot(tx, tz) || 1;
        return { vx: (tx / d) * rawSpd, vz: (tz / d) * rawSpd };
      }
      const moveMag = Math.hypot(enemy.targetDirX || 0, enemy.targetDirZ || 0);
      if (moveMag <= 0.1) return { vx: 0, vz: 0 };
      return {
        vx: Math.sin(enemy.hullAngle || 0) * rawSpd,
        vz: Math.cos(enemy.hullAngle || 0) * rawSpd,
      };
    };

    for (let dist = 0; dist <= maxDist; dist += stepDist) {
      const sx = p.x + dirX * dist;
      const sz = p.z + dirZ * dist;
      if (sx < -halfArena || sx > halfArena || sz < -halfArena || sz > halfArena) {
        return null;
      }

      const { row, col } = engine.worldToGrid ? engine.worldToGrid(sx, sz) : { row: -1, col: -1 };
      const cell = engine.grid?.[row]?.[col];

      if (engine.enemyBaseAlive) {
        const inCell = cell && cell.type === TileType.ENEMY_BASE;
        const inRadius = ebCenter && Math.hypot(ebCenter.x - sx, ebCenter.z - sz) <= 1.0;
        if (inCell || inRadius) {
          if (!canWinByBaseDestroy) return null;
          const targetCell =
            (inCell ? cell : null) || engine.grid?.[ebCellCoords?.row]?.[ebCellCoords?.col];
          if (!targetCell || targetCell.type !== TileType.ENEMY_BASE) return null;
          const citadelDmg = p.bulletPower === BULLET_POWER.HEAVY ? 8 : 4;
          return (targetCell.hp ?? engine.enemyBaseHp ?? 1) - citadelDmg <= 0
            ? { base: true }
            : null;
        }
      }

      if (cell?.defenseTurret?.alive) return null;
      if (
        cell &&
        (cell.type === TileType.BOXES ||
          cell.type === TileType.BARREL ||
          cell.type === TileType.WATER_TOWER ||
          (cell.type === TileType.BRICK && !p.pierceBricks) ||
          cell.type === TileType.CONCRETE ||
          cell.type === TileType.HOUSE_1 ||
          cell.type === TileType.HOUSE_2 ||
          cell.type === TileType.LANDMARK ||
          cell.type === TileType.BASE)
      ) {
        return null;
      }

      if (Array.isArray(engine.mines)) {
        for (const mine of engine.mines) {
          if (Math.hypot(mine.x - sx, mine.z - sz) <= 0.65) return null;
        }
      }

      if (Array.isArray(engine.defenseTurrets)) {
        for (const turret of engine.defenseTurrets) {
          if (turret.alive && Math.hypot(turret.x - sx, turret.z - sz) <= turret.radius) {
            return null;
          }
        }
      }

      if (Array.isArray(engine.enemies)) {
        const tFlight = dist / p.speed;
        for (const enemy of engine.enemies) {
          if (!enemy || enemy.hp <= DURABILITY.ZERO_HP) continue;
          const hitR =
            enemy.hitRadius ??
            (enemy.isBoss ? TANK_HIT_RADIUS.DEFAULT_BOSS : TANK_HIT_RADIUS.DEFAULT);
          const vel = estimateEnemyVelocity(enemy);
          const predX = enemy.x + vel.vx * tFlight;
          const predZ = enemy.z + vel.vz * tFlight;
          const hitStatic = Math.hypot(enemy.x - sx, enemy.z - sz) <= hitR * 1.15;
          const hitMoving = Math.hypot(predX - sx, predZ - sz) <= hitR * 1.25;
          if (hitStatic || hitMoving) {
            if (!canWinByEnemyKill) return null;
            if (enemy.isBoss && (enemy.phaseShieldTimer || 0) > 0) return null;
            if (engine.bossCombat?.nextPhaseGate?.(enemy)) return null;

            const hitCenterX = hitMoving && !hitStatic ? predX : enemy.x;
            const hitCenterZ = hitMoving && !hitStatic ? predZ : enemy.z;
            const targetProxy = {
              ...enemy,
              x: hitCenterX,
              z: hitCenterZ,
              hullYaw: enemy.hullAngle,
              turretYaw: enemy.turretAngle,
            };
            const cannonTier = engine.effectiveUpgrades?.cannon || 1;
            const armorRes = resolveArmorHit({
              projectile: {
                vx: p.vx,
                vz: p.vz,
                penetration: 140 + cannonTier * 35,
                baseDamage: p.damage * 3.2,
                moduleDamage: 24 + cannonTier * 8,
                ricochetAngleDeg: 80,
              },
              target: targetProxy,
              hitPoint: { x: sx, y: 0.72, z: sz },
              hitZone: 'hull',
            });
            const outcome = String(armorRes?.outcome || 'penetration').toLowerCase();
            const aspectStr = String(armorRes?.aspect || armorRes?.zone || 'front');
            const angleDeg = Number(armorRes?.impactAngleDeg ?? 0);
            if (
              enemy.isBoss &&
              (outcome === 'panel_stopped' ||
                outcome === 'stopped_by_panel' ||
                (outcome === 'ricochet' && angleDeg >= 78))
            ) {
              return null;
            }
            const isTitan = enemy.enemyClass === EnemyClass.BOSS_TITAN;
            const armorVal = isTitan
              ? engine.titanAspectArmor(enemy, aspectStr)
              : enemy.stats?.armorByAspect?.[aspectStr] ?? enemy.stats?.armor ?? 0;
            const legacyScaleDmg = computeEffectiveDamage(p.damage, p.penetration, armorVal);
            const aspectBonus = isTitan
              ? 1.0
              : aspectStr === 'rear'
              ? 1.35
              : aspectStr === 'left' || aspectStr === 'right'
              ? 1.15
              : 1.0;
            return enemy.hp - legacyScaleDmg * aspectBonus <= DURABILITY.ZERO_HP
              ? { enemy }
              : null;
          }
        }
      }
    }

    return null;
  }

  /** Unit flight direction of a projectile as [dx, dz]. */
  missileDir(p) {
    const len = Math.hypot(p.vx, p.vz) || 1;
    return [p.vx / len, p.vz / len];
  }

  /** Detonates a missile on contact with an obstacle, tank, or at end-of-life. */
  detonateMissile(p) {
    const { engine } = this;
    if (!p.isMissile) return;
    const [dirX, dirZ] = this.missileDir(p);
    const scale = p.fromPlayer ? 0.85 : 0.75;
    if (engine.fx?.missileImpact) {
      engine.fx.missileImpact(p.x, 0.85, p.z, dirX, dirZ, { enemy: !p.fromPlayer, scale });
    }
    sound.playExplosion(1.1, { x: p.x, z: p.z });
    engine.screenShake = Math.max(engine.screenShake || 0, 0.35);
  }

  /** Detonates a missile that lost lock or was jammed, applying splash & building damage. */
  detonateLostMissile(p) {
    const { engine } = this;
    engine.detonateMissile(p);
    if (typeof engine.detonateExplosionAt === 'function') {
      engine.detonateExplosionAt(
        p.x,
        p.z,
        1.5,
        p.damage,
        p.fromPlayer,
        null,
        false,
        p.penetration,
        'ROCKET_LAUNCHER'
      );
    }
  }

  /** Per-frame flight effects for a projectile moving from (px,pz) to its current position. */
  emitProjectileTrail(p, prevX, prevZ, y) {
    const { engine } = this;
    if (p.isThermobaric) {
      engine.fx.shellTrail(prevX, y, prevZ, p.x, y, p.z, 0xff5a14, 0.34, 0.22);
      if (engine.fx.q >= 1 || Math.random() < 0.7) {
        engine.fx.flameJet(p.x, y, p.z, -p.vx * 0.25, -p.vz * 0.25, 0.25);
        engine.fx.shellSmokeTrail(p.x, y, p.z, true);
      }
      return;
    }
    if (p.isFlame) {
      const age01 = 1 - p.life / (p.maxLife || FLAME_STREAM.PUFF_LIFE);
      if (engine.fx.q >= 1 || Math.random() < 0.6) {
        engine.fx.flameJet(p.x, y, p.z, p.vx, p.vz, THREE.MathUtils.clamp(age01, 0, 1));
      }
      return;
    }
    if (p.isMissile) {
      const len = Math.hypot(p.vx, p.vz) || 1;
      p.smokeAcc = (p.smokeAcc || 0) + Math.hypot(p.x - prevX, p.z - prevZ);
      const smoke = p.smokeAcc >= 0.24;
      if (smoke) p.smokeAcc = 0;
      engine.fx.missileExhaust(p.x, y, p.z, p.vx / len, p.vz / len, {
        enemy: !p.fromPlayer,
        smokeEvery: smoke,
        prevX,
        prevZ,
      });
      return;
    }
    if (p.trailColor != null) {
      engine.fx.shellTrail(prevX, y, prevZ, p.x, y, p.z, p.trailColor, p.trailWidth, p.trailLife);
    }
  }

  removeProjectile(index) {
    const { engine } = this;
    const p = engine.projectiles[index];
    if (!p) return;
    if (p.soundHandle) {
      sound.stopMissileLoop(p.soundHandle);
      p.soundHandle = null;
    }
    engine.fxGroup.remove(p.mesh);
    engine.projectiles.splice(index, 1);
  }

  updateProjectiles(dt) {
    const { engine } = this;
    for (let i = engine.projectiles.length - 1; i >= 0; i--) {
      const p = engine.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.isThermobaric) {
          engine.detonateThermobaricAt(
            p.x,
            p.z,
            (p.blastCells || INFERNO.BLAST_CELLS) * TILE_SIZE,
            p.damage,
            p.fromPlayer
          );
        } else if (p.isMissile) {
          engine.detonateMissile(p);
        }
        engine.removeProjectile(i);
        continue;
      }

      let missileTargetX = engine.aimWorld?.x ?? p.x;
      let missileTargetZ = engine.aimWorld?.z ?? p.z;
      let hasMissileTarget = false;
      if (p.isMissile) {
        if (p.soundHandle) {
          sound.updateMissileLoop(p.soundHandle, { x: p.x, z: p.z });
        }
        const headingBefore = Math.atan2(p.vx, p.vz);
        if (p.fromPlayer) {
          if (
            !p.jammedTarget &&
            isPointWithinJammerRadius(
              p.x,
              p.z,
              engine.enemies,
              JAMMER_ECM.SYSTEM_RADIUS_CELLS * TILE_SIZE
            )
          ) {
            // Lost lock: the missile stops steering and flies straight to a scattered
            // impact point ahead of it (steering at a nearby point would make it orbit).
            p.jammedTarget = computeJammedMissileTarget(
              p.x,
              p.z,
              Math.atan2(p.vx, p.vz),
              JAMMER_ECM.MISSILE_SCATTER_CELLS * TILE_SIZE,
              (GRID_SIZE * TILE_SIZE) / 2,
              Math.random
            );
            const jamHeading = Math.atan2(p.jammedTarget.x - p.x, p.jammedTarget.z - p.z);
            p.vx = Math.sin(jamHeading) * p.speed;
            p.vz = Math.cos(jamHeading) * p.speed;
            p.mesh.rotation.y = jamHeading;
            engine.spawnSparks?.(p.x, p.flightY ?? 1.5, p.z, 0xa855f7, 6);
            sound.playJammerPulse?.({ x: p.x, z: p.z });
          }

          let detonateAtFallback = false;
          if (p.jammedTarget) {
            missileTargetX = p.jammedTarget.x;
            missileTargetZ = p.jammedTarget.z;
            hasMissileTarget = true;
          } else if (engine.hardMode) {
            const guidance = resolveHardModeMissileGuidance(p, {
              enemies: engine.enemies,
              enemyBaseAlive: engine.enemyBaseAlive,
              enemyBaseCenter: engine.getEnemyBaseCenter?.() || null,
              isEnemyVisible: (e) => engine.isEnemyVisibleToPlayer?.(e) ?? true,
              isStealthEnemy: (e) => e?.enemyClass === EnemyClass.STEALTH,
              seekRadiusWorld: MISSILE.SEEK_RADIUS_CELLS * TILE_SIZE,
            });
            missileTargetX = guidance.x;
            missileTargetZ = guidance.z;
            hasMissileTarget = guidance.hasTarget;
            detonateAtFallback = guidance.detonateAtPoint;
          } else {
            let nearest = null;
            let minDist = Infinity;
            for (const e of engine.enemies) {
              if (e.hp <= 0) continue;
              const d = Math.hypot(e.x - p.x, e.z - p.z);
              if (d < minDist) {
                minDist = d;
                nearest = e;
              }
            }
            if (nearest) {
              missileTargetX = nearest.x;
              missileTargetZ = nearest.z;
              hasMissileTarget = true;
            } else if (engine.enemyBaseAlive) {
              const basePos = engine.getEnemyBaseCenter();
              if (basePos) {
                missileTargetX = basePos.x;
                missileTargetZ = basePos.z;
                hasMissileTarget = true;
              }
            }
          }
          p._detonateAtFallbackPoint = detonateAtFallback;
          p._fallbackTargetX = missileTargetX;
          p._fallbackTargetZ = missileTargetZ;
          if (!p.jammedTarget) {
            const curAngle = Math.atan2(p.vx, p.vz);
            const rawAngle = Math.atan2(missileTargetX - p.x, missileTargetZ - p.z);
            const targetAngle = avoidLandmarkHeading(engine, p.x, p.z, curAngle, rawAngle);
            const turnRate = targetAngle !== rawAngle ? MISSILE.TURN_RATE * 1.35 : MISSILE.TURN_RATE;
            const nextAngle = engine.lerpAngle(
              curAngle,
              targetAngle,
              turnRate * dt
            );
            p.vx = Math.sin(nextAngle) * p.speed;
            p.vz = Math.cos(nextAngle) * p.speed;
            p.mesh.rotation.y = nextAngle;
          }
        } else if (
          p.isHoming &&
          !engine.inForest &&
          !engine.inSmoke &&
          !engine.isPointInSmoke(p.x, p.z)
        ) {
          const curAngle = Math.atan2(p.vx, p.vz);
          const targetAngle = Math.atan2(
            engine.playerX - p.x,
            engine.playerZ - p.z
          );
          const nextAngle = engine.lerpAngle(curAngle, targetAngle, 2.4 * dt);
          p.vx = Math.sin(nextAngle) * p.speed;
          p.vz = Math.cos(nextAngle) * p.speed;
          p.mesh.rotation.y = nextAngle;
        }
        let turn = Math.atan2(p.vx, p.vz) - headingBefore;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        animateMissileVisual(p.mesh, dt, dt > 0 ? turn / dt : 0);
      } else if (
        p.isVictoryFpvShot &&
        p.victoryTargetEnemy &&
        p.victoryTargetEnemy.hp > DURABILITY.ZERO_HP &&
        engine.enemies?.includes(p.victoryTargetEnemy)
      ) {
        const tgt = p.victoryTargetEnemy;
        const curAngle = Math.atan2(p.vx, p.vz);
        const targetAngle = Math.atan2(tgt.x - p.x, tgt.z - p.z);
        const diff = Math.abs(Math.atan2(Math.sin(targetAngle - curAngle), Math.cos(targetAngle - curAngle)));
        if (diff < 0.45) {
          const nextAngle = engine.lerpAngle
            ? engine.lerpAngle(curAngle, targetAngle, 5.5 * dt)
            : targetAngle;
          p.vx = Math.sin(nextAngle) * p.speed;
          p.vz = Math.cos(nextAngle) * p.speed;
          if (p.mesh) p.mesh.rotation.y = nextAngle;
        }
      }

      const prevX = p.x;
      const prevZ = p.z;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.traveled = (p.traveled || 0) + Math.hypot(p.x - prevX, p.z - prevZ);
      const flightY = p.isMissile
        ? (p.fromPlayer ? updatePlayerMissileAltitude(p, missileTargetX, missileTargetZ, hasMissileTarget, dt) : 0.9)
        : p.isFlame
        ? 0.72
        : p.flightDist > 0
        ? THREE.MathUtils.lerp(
            p.startFlightY ?? 0.52,
            p.targetFlightY ?? 0.52,
            Math.min(1, p.traveled / p.flightDist)
          )
        : 0.52;
      p.flightY = flightY;
      p.mesh.position.set(p.x, flightY, p.z);
      engine.emitProjectileTrail(p, prevX, prevZ, flightY);

      if (p.flightDist > 0 && flightY > 2.2) {
        continue;
      }

      if (p.flightDist > 0 && p.traveled >= p.flightDist) {
        engine.detonateExplosionAt(
          p.x,
          p.z,
          1.35,
          p.damage * 0.5,
          true,
          null,
          false,
          p.penetration,
          p.weaponId
        );
        engine.removeProjectile(i);
        continue;
      }

      if (
        p.isMissile &&
        p.fromPlayer &&
        p.jammedTarget &&
        // Reached or flew past the impact point.
        ((p.jammedTarget.x - p.x) * p.vx + (p.jammedTarget.z - p.z) * p.vz <= 0 ||
          Math.hypot(p.jammedTarget.x - p.x, p.jammedTarget.z - p.z) <= 0.45)
      ) {
        p.x = p.jammedTarget.x;
        p.z = p.jammedTarget.z;
        this.detonateLostMissile(p);
        engine.removeProjectile(i);
        continue;
      }

      if (
        p.isMissile &&
        p.fromPlayer &&
        !p.jammedTarget &&
        p._detonateAtFallbackPoint &&
        ((p._fallbackTargetX - p.x) * p.vx + (p._fallbackTargetZ - p.z) * p.vz <= 0 ||
          Math.hypot(p._fallbackTargetX - p.x, p._fallbackTargetZ - p.z) <= 0.45)
      ) {
        p.x = p._fallbackTargetX;
        p.z = p._fallbackTargetZ;
        this.detonateLostMissile(p);
        engine.removeProjectile(i);
        continue;
      }

      if (p.isThermobaric && p.detonateDist > 0 && p.traveled >= p.detonateDist) {
        engine.detonateThermobaricAt(
          p.x,
          p.z,
          (p.blastCells || INFERNO.BLAST_CELLS) * TILE_SIZE,
          p.damage,
          p.fromPlayer
        );
        engine.removeProjectile(i);
        continue;
      }

      if (engine.tryBossApsIntercept(p)) {
        engine.removeProjectile(i);
        continue;
      }

      const halfArena = (GRID_SIZE * TILE_SIZE) / 2;
      if (
        p.x < -halfArena ||
        p.x > halfArena ||
        p.z < -halfArena ||
        p.z > halfArena
      ) {
        if (p.isMissile) engine.detonateMissile(p);
        engine.removeProjectile(i);
        continue;
      }

      const { row, col } = engine.worldToGrid(p.x, p.z);
      const cell = engine.grid[row]?.[col];

      if (p.fromPlayer && engine.enemyBaseAlive) {
        const inCell = cell && cell.type === TileType.ENEMY_BASE;
        const ebCenter = engine.getEnemyBaseCenter();
        const inRadius = ebCenter && Math.hypot(ebCenter.x - p.x, ebCenter.z - p.z) <= 1.0;
        if (inCell || inRadius) {
          const ebCell = engine.enemyBaseCell();
          const targetCell = (inCell ? cell : null) || engine.grid[ebCell?.row]?.[ebCell?.col];
          if (targetCell && targetCell.type === TileType.ENEMY_BASE) {
            if (p.isMissile) engine.detonateMissile(p);
            const citadelDmg = p.isMissile
              ? 16
              : p.bulletPower === BULLET_POWER.HEAVY
              ? 8
              : 4;
            engine.damageEnemyBase(targetCell, citadelDmg, p.x, p.z);
            engine.removeProjectile(i);
            continue;
          }
        }
      }

      if (p.isThermobaric && cell) {
        const hitsBlocking =
          cell.defenseTurret?.alive ||
          [
            TileType.BOXES,
            TileType.BARREL,
            TileType.WATER_TOWER,
            TileType.BRICK,
            TileType.CONCRETE,
            TileType.HOUSE_1,
            TileType.HOUSE_2,
            TileType.LANDMARK,
            TileType.BASE,
            TileType.ENEMY_BASE,
          ].includes(cell.type);
        if (hitsBlocking) {
          engine.detonateThermobaricAt(
            p.x,
            p.z,
            (p.blastCells || INFERNO.BLAST_CELLS) * TILE_SIZE,
            p.damage,
            p.fromPlayer
          );
          engine.removeProjectile(i);
          continue;
        }
      }

      // A live turret owns its whole cell: player rounds hit the turret, enemy rounds stop on it.
      if (cell?.defenseTurret?.alive && (!p.isMissile || !p.fromPlayer)) {
        if (p.fromPlayer) {
          engine.shotsHit++;
          engine.defenseTurretsCtrl.damage(cell.defenseTurret, p);
        }
        if (p.isMissile) engine.detonateMissile(p);
        engine.removeProjectile(i);
        continue;
      }

      // Player missiles cruise above every tile while aloft; once diving without a live lock,
      // they collide with obstacles and buildings like any other ordnance.
      const playerMissileAloft =
        p.fromPlayer &&
        p.isMissile &&
        (flightY > 2.2 ||
          (p.traveled || 0) < MISSILE_CLIMB_DIST ||
          (!p.jammedTarget && Boolean(p.targetEnemy || p.targetBase)));
      if (cell?.type === TileType.BOXES && !playerMissileAloft) {
        if (p.isMissile) engine.detonateMissile(p);
        engine.damageTileCell(cell, 1, p.x, p.z, p.fromPlayer);
        engine.removeProjectile(i);
        continue;
      }
      if (cell && !playerMissileAloft) {
        if (cell.type === TileType.BARREL) {
          if (p.isMissile) engine.detonateMissile(p);
          engine.explodeBarrel(cell, p.fromPlayer);
          engine.removeProjectile(i);
          continue;
        } else if (cell.type === TileType.WATER_TOWER) {
          if (p.isMissile) engine.detonateMissile(p);
          const wtDmg = p.isMissile || p.bulletPower === BULLET_POWER.HEAVY ? 2 : 1;
          engine.damageTileCell(cell, wtDmg, p.x, p.z, p.fromPlayer);
          engine.removeProjectile(i);
          continue;
        } else if (cell.type === TileType.OIL_SLICK && p.isFlame) {
          engine.terrainDestruction.igniteOilSlick(cell);
        } else if (p.isFlame && cell.type === TileType.FOREST) {
          engine.destroyTileCell(cell);
        } else if (cell.type === TileType.BRICK) {
          if (p.isMissile) engine.detonateMissile(p);
          if (p.pierceBricks) {
            engine.destroyTileCell(cell);
          } else {
            const brickDmg = p.isMissile ? 4 : p.bulletPower === BULLET_POWER.HEAVY ? 2 : 1;
            const entry = wallEntryPoint(engine, cell, p);
            engine.damageTileCell(cell, brickDmg, entry.x, entry.z);
            engine.removeProjectile(i);
            continue;
          }
        } else if (cell.type === TileType.CONCRETE) {
          if (p.isMissile) engine.detonateMissile(p);
          const concreteDmg = p.isFlame
            ? 0.35
            : p.isMissile || p.bulletPower === BULLET_POWER.HEAVY
            ? 4
            : 1;
          const entry = wallEntryPoint(engine, cell, p);
          engine.damageTileCell(cell, concreteDmg, entry.x, entry.z);
          engine.removeProjectile(i);
          continue;
        } else if (cell.type === TileType.HOUSE_1 || cell.type === TileType.HOUSE_2) {
          if (p.isMissile) engine.detonateMissile(p);
          const buildingDmg = p.isFlame
            ? 0.5
            : p.isMissile
            ? 25
            : p.weaponId === 'AUTOCANNON'
            ? 1
            : p.bulletPower === BULLET_POWER.HEAVY
            ? 12
            : 5;
          const entry = wallEntryPoint(engine, cell, p);
          engine.damageTileCell(cell, buildingDmg, entry.x, entry.z);
          engine.removeProjectile(i);
          continue;
        } else if (cell.type === TileType.LANDMARK) {
          if (p.isMissile) engine.detonateMissile(p);
          sound.playBrickHit({ x: p.x, z: p.z });
          engine.fx.masonryHit(p.x, 0.85, p.z, { concrete: true, heavy: false });
          engine.removeProjectile(i);
          continue;
        } else if (cell.type === TileType.BASE) {
          if (p.isMissile) engine.detonateMissile(p);
          if (p.fromPlayer) {
            sound.playBrickHit({ x: p.x, z: p.z });
            engine.fx.masonryHit(p.x, 0.85, p.z, { concrete: true, heavy: false });
          } else {
            const baseDmg = p.isFlame ? (p.damage || 1.2) * 0.5 : p.damage || 12;
            engine.terrainDestruction.damageCommandBase(baseDmg, p.x, p.z);
          }
          engine.removeProjectile(i);
          continue;
        } else if (cell.type === TileType.ENEMY_BASE && !p.fromPlayer) {
          if (p.isMissile) engine.detonateMissile(p);
          engine.removeProjectile(i);
          continue;
        }
      }

      if (p.fromPlayer) {
        const mineTriggerDist = p.isMissile
          ? MISSILE.MINE_TRIGGER_RADIUS * TILE_SIZE
          : 0.65;
        let hitMine = false;
        const mineCount = engine.mines ? engine.mines.length : 0;
        for (let m = mineCount - 1; m >= 0; m--) {
          if (
            Math.hypot(engine.mines[m].x - p.x, engine.mines[m].z - p.z) <=
            mineTriggerDist
          ) {
            engine.detonateMine(m);
            engine.medalTracker?.recordMineShot();
            hitMine = true;
            if (!p.isMissile) break;
          }
        }
        if (hitMine && !p.isMissile) {
          engine.removeProjectile(i);
          continue;
        }

        let hitTurret = false;
        if (engine.defenseTurrets && engine.defenseTurrets.length > 0) {
          for (const turret of engine.defenseTurrets) {
            if (!turret.alive) continue;
            if (Math.hypot(turret.x - p.x, turret.z - p.z) <= turret.radius) {
              hitTurret = true;
              engine.shotsHit++;
              engine.defenseTurretsCtrl.damage(turret, p);
              break;
            }
          }
        }
        if (hitTurret) {
          engine.removeProjectile(i);
          continue;
        }

        if (
          p.canHitPlayer &&
          engine.playerHp > 0 &&
          Math.hypot(engine.playerX - p.x, engine.playerZ - p.z) <= TANK_HIT_RADIUS.PLAYER
        ) {
          const eff = computeEffectiveDamage(
            p.damage,
            p.penetration,
            engine.playerStats?.armor ?? 0
          );
          engine.damagePlayer(eff, { zone: 'hull', aspect: 'front' }, p.weaponId);
          engine.fx.armorHit(p.x, 0.85, p.z, { scale: 0.9 });
          sound.playArmorHit({ x: p.x, z: p.z });
          engine.removeProjectile(i);
          continue;
        }

        let hitEnemy = false;
        for (const enemy of engine.enemies) {
          const hitR = enemy.hitRadius ?? (enemy.isBoss ? TANK_HIT_RADIUS.DEFAULT_BOSS : TANK_HIT_RADIUS.DEFAULT);
          if (Math.hypot(enemy.x - p.x, enemy.z - p.z) <= hitR) {
            engine.shotsHit++;
            enemy.stealthRevealTimer = 2.0;

            enemy.hullYaw = enemy.hullAngle;
            enemy.turretYaw = enemy.turretAngle;
            const isTitan = enemy.enemyClass === EnemyClass.BOSS_TITAN;
            // Directional reinforcement follows the hull, regardless of turret rotation.
            const hitZone =
              enemy.stats.directionalArmor || p.isVictoryFpvShot
                ? 'hull'
                : Math.random() < 0.35
                ? 'turret'
                : 'hull';
            const armorRes = resolveArmorHit({
              projectile: {
                vx: p.vx,
                vz: p.vz,
                penetration: p.isMissile ? 240 : 140 + (engine.effectiveUpgrades.cannon || 1) * 35,
                baseDamage: p.damage * 3.2,
                moduleDamage: 24 + (engine.effectiveUpgrades.cannon || 1) * 8,
                ricochetAngleDeg: 80,
              },
              target: enemy,
              hitPoint: { x: p.x, y: hitZone === 'turret' ? 1.35 : 0.72, z: p.z },
              hitZone,
            });

            const outcome = String(armorRes?.outcome || 'penetration').toLowerCase();
            const aspectStr = String(armorRes?.aspect || armorRes?.zone || 'front');
            const angleDeg = Number(armorRes?.impactAngleDeg ?? 0);

            if (
              enemy.isBoss &&
              !p.isMissile &&
              (outcome === 'panel_stopped' || outcome === 'stopped_by_panel')
            ) {
              sound.playSteelHit({ x: p.x, z: p.z });
              engine.spawnSparks(p.x, 0.9, p.z, 0x38bdf8, 10);
              engine.setStatusBanner(
                t('{name}: STOPPED BY DREADNOUGHT CITADEL PANEL ({aspectStr})', { name: t(enemy.name).toUpperCase(), aspectStr: t(aspectStr.toUpperCase()) }),
                1.6
              );
            } else if (
              enemy.isBoss &&
              !p.isMissile &&
              outcome === 'ricochet' &&
              angleDeg >= 78
            ) {
              sound.playSteelHit({ x: p.x, z: p.z });
              engine.spawnSparks(p.x, 0.9, p.z, 0x38bdf8, 10);
              engine.setStatusBanner(
                t('{name}: RICOCHET ({angleDeg}°)', { name: t(enemy.name).toUpperCase(), angleDeg: angleDeg.toFixed(0) }),
                1.6
              );
            } else {
              const legacyScaleDmg = computeEffectiveDamage(
                p.damage,
                p.penetration,
                isTitan
                  ? engine.titanAspectArmor(enemy, aspectStr)
                  : enemy.stats.armorByAspect[aspectStr] ?? enemy.stats.armor
              );
              const aspectBonus = isTitan
                ? 1.0
                : aspectStr === 'rear'
                ? 1.35
                : aspectStr === 'left' || aspectStr === 'right'
                ? 1.15
                : 1.0;
              engine.medalTracker?.recordEnemyHit();
              engine.damageEnemy(enemy, legacyScaleDmg * aspectBonus, {
                aspect: aspectStr,
                salvoId: p.salvoId ?? null,
              });
              if (p.isMissile) {
                engine.detonateMissile(p);
              } else {
                engine.fx.armorHit(p.x, 0.85, p.z, { scale: p.isHeavy ? 1.15 : 0.9 });
                sound.playArmorHit({ x: p.x, z: p.z });
              }
            }
            hitEnemy = true;
            break;
          }
        }
        if (hitEnemy) {
          engine.terrainDestruction?.igniteOilAt?.(p.x, p.z, 1.25);
          engine.removeProjectile(i);
          continue;
        }
      } else {
        if (Math.hypot(engine.playerX - p.x, engine.playerZ - p.z) <= TANK_HIT_RADIUS.PLAYER) {
          if (p.isThermobaric) {
            engine.detonateThermobaricAt(
              p.x,
              p.z,
              (p.blastCells || INFERNO.BLAST_CELLS) * TILE_SIZE,
              p.damage,
              p.fromPlayer
            );
            engine.removeProjectile(i);
            continue;
          }
          const playerTarget = {
            x: engine.playerX,
            z: engine.playerZ,
            hullYaw: engine.playerHullAngle,
            turretYaw: engine.playerTurretAngle,
            hull: engine.assembledTank?.hull || HULL_CATALOG.bars_m1,
            turret: engine.assembledTank?.turret || TURRET_CATALOG.t_01,
            armorPanels: engine.playerArmorPanels,
          };
          const hitZone = p.isFlame ? 'hull' : Math.random() < 0.3 ? 'turret' : 'hull';
          const armorRes = resolveArmorHit({
            projectile: {
              vx: p.vx,
              vz: p.vz,
              penetration: p.isFlame ? 65 : 85 + (p.penetration || 0) * 1.35,
              baseDamage: p.damage * 10,
              moduleDamage: p.isFlame ? 8 : 34,
              ricochetAngleDeg: 70,
            },
            target: playerTarget,
            hitPoint: { x: p.x, y: hitZone === 'turret' ? 1.35 : 0.72, z: p.z },
            hitZone,
          });

          // Flame does not pierce armour, it burns through it: a puff is never stopped or
          // deflected; the side's armour still reduces its damage via computeEffectiveDamage.
          const outcome = p.isFlame
            ? 'penetration'
            : String(armorRes?.outcome || 'penetration').toLowerCase();
          const aspectStr = String(armorRes?.aspect || armorRes?.zone || 'front');
          const angleDeg = Number(armorRes?.impactAngleDeg ?? 0);
          const effArmor = Number(armorRes?.effectiveArmor ?? 100);
          const subTarget = armorRes?.subsystemTarget || armorRes?.subsystemHit || null;
          const modDmg = Number(armorRes?.moduleDamage ?? armorRes?.subsystemDamage ?? 0);

          if (
            outcome === 'ricochet' ||
            outcome === 'non_penetration' ||
            outcome === 'panel_stopped' ||
            outcome === 'stopped_by_panel'
          ) {
            sound.playSteelHit({ x: p.x, z: p.z });
            engine.spawnSparks(p.x, 0.9, p.z, 0x38bdf8, 9);
            if (subTarget && modDmg > 0) {
              applySubsystemDamage(engine.subsystems, subTarget, modDmg * 0.45);
            }
            const msg =
              outcome === 'panel_stopped' || outcome === 'stopped_by_panel'
                ? `${t('ADD-ON ARMOR PANEL ABSORBED HIT!')}${armorRes?.panelBroke ? ` ${t('(PANEL SHATTERED!)')}` : ''}`
                : outcome === 'ricochet'
                ? t('SHELL RICOCHETED OFF {aspect} ARMOR ({angle}°)!', { aspect: t(aspectStr.toUpperCase()), angle: angleDeg.toFixed(0) })
                : t('ARMOR STOPPED SHELL ({aspect} {mm}mm)!', { aspect: t(aspectStr.toUpperCase()), mm: effArmor.toFixed(0) });
            engine.setStatusBanner(msg, 2.0);
            engine.emitHudUpdate();
          } else {
            if (subTarget && modDmg > 0) {
              const subRes = applySubsystemDamage(
                engine.subsystems,
                subTarget,
                modDmg
              );
              if (subRes?.destroyed) {
                engine.setStatusBanner(
                  t('CRITICAL HIT: {subTarget} DISABLED! AUTO-REPAIR IN 7s OR PRESS [1] RM-1', { subTarget: t(subTarget.toUpperCase()) }),
                  2.8
                );
              }
            }
            const effDamage = computeEffectiveDamage(
              p.damage,
              p.penetration,
              engine.playerStats.armorByAspect[aspectStr] ?? engine.playerStats.armor
            );
            engine.damagePlayer(
              effDamage,
              p.isFlame ? null : { zone: hitZone, aspect: aspectStr },
              p.sourceWeapon || null
            );
            if (p.isFlame) {
              engine.fx.flameJet(p.x, 0.8, p.z, p.vx * 0.3, p.vz * 0.3, 1);
            } else if (p.isMissile) {
              engine.detonateMissile(p);
            } else {
              engine.fx.armorHit(p.x, 0.85, p.z, { scale: p.isHeavy ? 1.1 : 0.85, colorHex: 0xff6a30 });
            }
          }

          engine.terrainDestruction?.igniteOilAt?.(p.x, p.z, 1.25);
          engine.removeProjectile(i);
          continue;
        }
      }
    }
  }

  updateLasers(dt) {
    const { engine } = this;
    for (let i = engine.lasers.length - 1; i >= 0; i--) {
      const l = engine.lasers[i];
      l.life -= dt;
      if (l.life <= 0) {
        engine.fxGroup.remove(l.mesh);
        engine.lasers.splice(i, 1);
      } else {
        const ratio = l.life / l.maxLife;
        l.mesh.material.opacity = ratio;
      }
    }
  }
}

