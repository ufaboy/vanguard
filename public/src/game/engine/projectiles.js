import * as THREE from 'three';
import { resolveArmorHit } from '../../sim/ballistics.js';
import { HULL_CATALOG, TURRET_CATALOG } from '../../sim/catalog.js';
import { applySubsystemDamage } from '../../sim/subsystems.js';
import {
  BULLET_POWER,
  FLAME_STREAM,
  INFERNO,
  MISSILE,
  TANK_HIT_RADIUS,
  computeEffectiveDamage,
} from '../constants.js';
import { animateMissileVisual, createProjectileVisual } from '../effects/index.js';
import { GRID_SIZE, TILE_SIZE } from '../levels.js';
import { sound } from '../sound.js';
import { EnemyClass, TileType } from '../types.js';

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
    mesh.position.set(x, 0.75, z);
    mesh.rotation.y = Math.atan2(dirX, dirZ);
    engine.fxGroup.add(mesh);

    engine.projectiles.push({
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
      weaponId,
      mesh,
      trailColor: color,
      trailWidth: isThermobaric ? 0.32 : isHeavy ? 0.2 : 0.15,
      trailLife: isThermobaric ? 0.22 : isHeavy ? 0.16 : 0.12,
    });
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

      if (p.isMissile) {
        if (p.soundHandle) {
          sound.updateMissileLoop(p.soundHandle, { x: p.x, z: p.z });
        }
        const headingBefore = Math.atan2(p.vx, p.vz);
        if (p.fromPlayer) {
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
          let targetX = engine.aimWorld?.x ?? p.x;
          let targetZ = engine.aimWorld?.z ?? p.z;
          if (nearest) {
            targetX = nearest.x;
            targetZ = nearest.z;
          } else if (engine.enemyBaseAlive) {
            const basePos = engine.getEnemyBaseCenter();
            if (basePos) {
              targetX = basePos.x;
              targetZ = basePos.z;
            }
          }
          const curAngle = Math.atan2(p.vx, p.vz);
          const targetAngle = Math.atan2(targetX - p.x, targetZ - p.z);
          const nextAngle = engine.lerpAngle(
            curAngle,
            targetAngle,
            MISSILE.TURN_RATE * dt
          );
          p.vx = Math.sin(nextAngle) * p.speed;
          p.vz = Math.cos(nextAngle) * p.speed;
          p.mesh.rotation.y = nextAngle;
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
      }

      const prevX = p.x;
      const prevZ = p.z;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.traveled = (p.traveled || 0) + Math.hypot(p.x - prevX, p.z - prevZ);
      const flightY = p.isMissile ? (p.fromPlayer ? 1.35 : 0.9) : p.isFlame ? 0.72 : 0.75;
      p.mesh.position.set(p.x, flightY, p.z);
      engine.emitProjectileTrail(p, prevX, prevZ, flightY);

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
            TileType.BRICK,
            TileType.CONCRETE,
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

      // Player missiles cruise above every tile, crates included
      if (cell?.type === TileType.BOXES && !(p.fromPlayer && p.isMissile)) {
        if (p.isMissile) engine.detonateMissile(p);
        engine.damageTileCell(cell, 1, p.x, p.z, p.fromPlayer);
        engine.removeProjectile(i);
        continue;
      }
      if (cell && !(p.fromPlayer && p.isMissile)) {
        if (cell.type === TileType.BARREL) {
          if (p.isMissile) engine.detonateMissile(p);
          engine.explodeBarrel(cell, p.fromPlayer);
          engine.removeProjectile(i);
          continue;
        } else if (p.isFlame && cell.type === TileType.FOREST) {
          engine.destroyTileCell(cell);
        } else if (cell.type === TileType.BRICK) {
          if (p.isMissile) engine.detonateMissile(p);
          if (p.pierceBricks) {
            engine.destroyTileCell(cell);
          } else {
            const brickDmg = p.isMissile ? 4 : p.bulletPower === BULLET_POWER.HEAVY ? 2 : 1;
            engine.damageTileCell(cell, brickDmg, p.x, p.z);
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
          engine.damageTileCell(cell, concreteDmg, p.x, p.z);
          engine.removeProjectile(i);
          continue;
        } else if (cell.type === TileType.SPAWNER && p.fromPlayer) {
          if (p.isMissile) engine.detonateMissile(p);
          engine.damageTileCell(cell, 1, p.x, p.z);
          engine.removeProjectile(i);
          continue;
        } else if (cell.type === TileType.BASE && !p.fromPlayer) {
          if (p.isMissile) engine.detonateMissile(p);
          engine.terrainDestruction.destroyCommandBase();
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
            const hitZone = enemy.stats.directionalArmor ? 'hull' : Math.random() < 0.35 ? 'turret' : 'hull';
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
                `${enemy.name.toUpperCase()}: STOPPED BY DREADNOUGHT CITADEL PANEL (${aspectStr.toUpperCase()})`,
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
                `${enemy.name.toUpperCase()}: RICOCHET (${angleDeg.toFixed(0)}°)`,
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
              engine.damageEnemy(enemy, legacyScaleDmg * aspectBonus);
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
                ? `ADD-ON ARMOR PANEL ABSORBED HIT!${armorRes?.panelBroke ? ' (PANEL SHATTERED!)' : ''}`
                : outcome === 'ricochet'
                ? `SHELL RICOCHETED OFF ${aspectStr.toUpperCase()} ARMOR (${angleDeg.toFixed(0)}°)!`
                : `ARMOR STOPPED SHELL (${aspectStr.toUpperCase()} ${effArmor.toFixed(0)}mm)!`;
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
                  `CRITICAL HIT: ${subTarget.toUpperCase()} DISABLED! AUTO-REPAIR IN 7s OR PRESS [1] RM-1`,
                  2.8
                );
              }
            }
            const effDamage = computeEffectiveDamage(
              p.damage,
              p.penetration,
              engine.playerStats.armorByAspect[aspectStr] ?? engine.playerStats.armor
            );
            engine.damagePlayer(effDamage, p.isFlame ? null : { zone: hitZone, aspect: aspectStr });
            if (p.isFlame) {
              engine.fx.flameJet(p.x, 0.8, p.z, p.vx * 0.3, p.vz * 0.3, 1);
            } else if (p.isMissile) {
              engine.detonateMissile(p);
            } else {
              engine.fx.armorHit(p.x, 0.85, p.z, { scale: p.isHeavy ? 1.1 : 0.85, colorHex: 0xff6a30 });
            }
          }

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

