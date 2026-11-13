import * as THREE from 'three';
import { normalizeAngleSigned } from '../../sim/ai.js';
import {
  ACTION_KIND,
  GUNNER,
  actionLuck,
  armShot,
  indirectMissPoint,
  missAngle,
  notifyBrainFired,
  onGunnerFired,
  rollLuck,
  shotArmedFor,
  stepGunner,
} from '../../sim/behavior/index.js';
import { fireAbilityWeapon } from '../abilities/index.js';
import { emitFlamePuff } from '../abilities/flame-stream.js';
import {
  ARTILLERY,
  BULLET_POWER,
  DURABILITY,
  ENEMY_KILL_CREDITS,
  ENEMY_VISIBILITY,
  FLAME_STREAM,
  HYDRA,
  INFERNO,
  MAMMOTH,
  TANK_HIT_RADIUS,
  TITAN,
} from '../constants.js';
import { createMissileVisual } from '../fx.js';
import { GRID_SIZE, SECTORS, TILE_SIZE } from '../levels.js';
import { sound } from '../sound.js';
import { SECTOR_BOSS_CONFIGS } from '../tanks.js';
import { rollBoxLoot } from '../terrains/boxes-loot.js';
import { EnemyClass, TANK_CONFIGS, TileType, checkMapVictory } from '../types.js';

/** Manages enemy gunnery, artillery/missile/boss secondary attacks, obstacle crushing, and enemy damage/kill handling. */
export class EnemyCombatController {
  constructor(engine) {
    this.engine = engine;
  }

  /**
   * A contact ability (e.g. the KAMIKAZE warhead) went off. The tank is spent: it leaves the
   * battlefield without a kill reward. Returns false when the ability chose not to trigger.
   */
  spendContactEnemy(e) {
    const { engine } = this;
    if (!e.contactAbility?.onContact(e, engine)) return false;
    engine.clearInfernoDashBeam(e);
    engine.sensorContacts.delete(e.id);
    if (engine.priorityTargetId === e.id) engine.priorityTargetId = null;
    engine.checkAndIgniteForestOnEnemyKill(e);
    engine.entityGroup.remove(e.rig.root);
    const index = engine.enemies.indexOf(e);
    if (index >= 0) engine.enemies.splice(index, 1);
    return true;
  }

  /** Indirect-fire range check: between ARTILLERY.MIN_RANGE and `maxCells` from the tank. */
  inArtilleryRange(e, x, z, maxCells) {
    const d = Math.hypot(x - e.x, z - e.z);
    return d >= ARTILLERY.MIN_RANGE * TILE_SIZE && d <= maxCells * TILE_SIZE;
  }

  clampToArena(point) {
    const limit = (GRID_SIZE * TILE_SIZE) / 2 - 2;
    return {
      x: THREE.MathUtils.clamp(point.x, -limit, limit),
      z: THREE.MathUtils.clamp(point.z, -limit, limit),
    };
  }

  /** Target of one shoot action (sim/behavior/actions.js), or null when its condition fails. */
  enemyShotTarget(e, action, s, turretState = null) {
    const { engine } = this;
    const indirect = e.enemyClass === EnemyClass.ARTILLERY;
    const small = TILE_SIZE * 0.5;
    const state = turretState || e;
    switch (action.id) {
      case 'shoot_player': {
        const player = { x: engine.playerX, z: engine.playerZ };
        if (s.canSeePlayer) {
          if (indirect && !this.inArtilleryRange(e, player.x, player.z, ARTILLERY.MAX_RANGE)) return null;
          return { kind: 'player', key: 'player', target: player, radius: TANK_HIT_RADIUS.PLAYER, react: true };
        }
        // Indirect fire also works on spotter data or on the remembered position
        if (!indirect) return null;
        const pos = s.spotted && !engine.inSmoke ? player : s.hasActiveAlert ? { x: s.navTargetX, z: s.navTargetZ } : null;
        if (!pos || !this.inArtilleryRange(e, pos.x, pos.z, ARTILLERY.MAX_RANGE)) return null;
        return { kind: 'player', key: 'player', target: pos, radius: TANK_HIT_RADIUS.PLAYER, react: false };
      }
      case 'shoot_player_base': {
        if (!(engine.activeMapRules?.defeatOnBaseLoss && engine.baseAlive)) return null;
        const base = engine.getCommandBaseCenter();
        const inRange = indirect
          ? this.inArtilleryRange(e, base.x, base.z, ARTILLERY.BASE_MAX_RANGE)
          : engine.canEngageCommandBase(e.x, e.z);
        if (!inRange) return null;
        return { kind: 'base', key: 'base', target: base, radius: TILE_SIZE, react: false };
      }
      case 'shoot_obstacle': {
        const b = e.breachTarget;
        if (!b) return null;
        return { kind: 'breach', key: `breach:${b.row},${b.col}`, target: b, radius: small, react: false };
      }
      case 'shoot_random': {
        if (!state.randomShotTarget) {
          if (state.randomShotTimer > 0 || state.fireCooldown > 0) return null;
          state.randomShotTarget = engine.findRandomTerrainTarget(e);
          if (!state.randomShotTarget) {
            state.randomShotTimer = 3.5 + Math.random() * 4.0;
            return null;
          }
        }
        const t = state.randomShotTarget;
        return { kind: 'terrain', key: `terrain:${t.x},${t.z}`, target: t, radius: small, react: false };
      }
      default:
        return null;
    }
  }

  /**
   * Gunnery: take the first shoot action of the behavior whose target is present, roll its luck
   * once per shot (hit = exact aim, miss = deliberate miss), aim and fire.
   */
  updateEnemyGunnery(e, dt, s) {
    const { engine } = this;
    if (e.breachTarget) {
      const cell = engine.grid[e.breachTarget.row]?.[e.breachTarget.col];
      const solid =
        cell &&
        cell.hp > 0 &&
        (cell.type === TileType.BOXES || cell.type === TileType.BRICK || cell.type === TileType.CONCRETE);
      if (!solid) e.breachTarget = null;
    }
    if (e.armed === false) {
      e.breachTarget = null;
      e.turretAngle = engine.lerpAngle(e.turretAngle, e.hullAngle, 4 * dt);
      return;
    }
    engine.updateBossSecondaryWeapons(e, dt, s);

    if (e.turrets?.length > 1) {
      engine.updateMultiTurretGunnery(e, dt, s);
      return;
    }

    let action = null;
    let shot = null;
    for (const a of e.actions) {
      if (a.kind !== ACTION_KIND.SHOOT) continue;
      shot = this.enemyShotTarget(e, a, s);
      if (shot) {
        action = a;
        break;
      }
    }
    if (!action) {
      stepGunner(e.gunner, { dt, shooter: e, target: null, visible: false });
      e.indirectAim = null;
      const look = s.hasActiveAlert
        ? Math.atan2(s.navTargetX - e.x, s.navTargetZ - e.z)
        : e.hullAngle;
      e.turretAngle = engine.lerpAngle(e.turretAngle, look, 4.5 * dt);
      return;
    }

    if (!shotArmedFor(e.gunner, action.id, shot.key)) {
      armShot(e.gunner, action.id, shot.key, rollLuck(action.luck, e.behaviorRng ?? Math.random));
    }
    const aim = stepGunner(e.gunner, {
      dt,
      shooter: { x: e.x, z: e.z, turretAngle: e.turretAngle },
      target: shot.target,
      targetKey: shot.key,
      visible: true,
      targetRadius: shot.radius,
      react: shot.react,
    });

    if (e.enemyClass === EnemyClass.ARTILLERY) {
      engine.updateIndirectFire(e, dt, shot, aim);
    } else {
      engine.updateDirectFire(e, dt, shot, aim, s);
    }
    // A harassing shot is spent once the gun has fired at it
    if (shot.kind === 'terrain' && !e.gunner.shot) {
      e.randomShotTarget = null;
      e.randomShotTimer = 8.0 + Math.random() * 12.0;
    }
  }

  /**
   * Independent dual-turret gunnery (e.g. SUPREME DREADNOUGHT / BOSS_TITAN): each turret
   * checks line of sight from its own mount, selects a target, aims, and fires independently.
   */
  updateMultiTurretGunnery(e, dt, s) {
    const { engine } = this;
    const baseSightRadius = e.sightRadius ?? ENEMY_VISIBILITY.DEFAULT_SIGHT_RADIUS;
    const effectiveSightRadius = engine.inForest
      ? Math.min(baseSightRadius, ENEMY_VISIBILITY.FOREST_SIGHT_RADIUS)
      : baseSightRadius;

    for (const t of e.turrets) {
      const pz = t.slot.pivotZ || 0;
      const tx = e.x + Math.sin(e.hullAngle) * pz;
      const tz = e.z + Math.cos(e.hullAngle) * pz;
      const distFromTurret = Math.hypot(engine.playerX - tx, engine.playerZ - tz);
      const turretCanSeePlayer =
        !engine.inSmoke &&
        (s.canSeePlayer ||
          (distFromTurret <= effectiveSightRadius &&
            engine.hasLineOfSight(tx, tz, engine.playerX, engine.playerZ)));
      const ts = { ...s, canSeePlayer: turretCanSeePlayer, distToPlayer: distFromTurret };

      let action = null;
      let shot = null;
      for (const a of e.actions) {
        if (a.kind !== ACTION_KIND.SHOOT) continue;
        shot = this.enemyShotTarget(e, a, ts, t);
        if (shot) {
          action = a;
          break;
        }
      }

      if (!action) {
        stepGunner(t.gunner, { shooter: { x: tx, z: tz, turretAngle: t.angle }, target: null, visible: false, dt });
        const defaultYaw = e.hullAngle + (t.slot.defaultYawOffset || 0);
        const look = s.hasActiveAlert
          ? Math.atan2(s.navTargetX - tx, s.navTargetZ - tz)
          : defaultYaw;
        t.angle = engine.lerpAngle(t.angle, look, 4.5 * dt);
        continue;
      }

      if (!shotArmedFor(t.gunner, action.id, shot.key)) {
        armShot(t.gunner, action.id, shot.key, rollLuck(action.luck, e.behaviorRng ?? Math.random));
      }
      const aim = stepGunner(t.gunner, {
        dt,
        shooter: { x: tx, z: tz, turretAngle: t.angle },
        target: shot.target,
        targetKey: shot.key,
        visible: true,
        targetRadius: shot.radius,
        react: shot.react,
      });

      const turnSpeed = (e.isBoss ? 6.5 : 5.8) * (e.titanOverload ? 1.35 : 1.0);
      t.angle = engine.lerpAngle(t.angle, aim.desiredTurretAngle, turnSpeed * dt);

      if (t.fireCooldown <= 0) {
        const token = shot.kind !== 'player' || engine.hasAttackToken(e);
        if (aim.canFire && token) {
          const reloadMult = e.titanOverload ? (TITAN.OVERLOAD_RELOAD_MULT ?? 0.65) : 1.0;
          t.fireCooldown = e.stats.fireCooldown * reloadMult + onGunnerFired(t.gunner);
          engine.fireEnemyTurretWeapon(e, t, tx, tz);
        }
      }

      if (shot.kind === 'terrain' && !t.gunner.shot) {
        t.randomShotTarget = null;
        t.randomShotTimer = 8.0 + Math.random() * 12.0;
      }
    }
  }

  /** Fires one independent turret (single or twin-barrel) from its world mount `(tx, tz)`. */
  fireEnemyTurretWeapon(e, t, tx, tz) {
    const { engine } = this;
    notifyBrainFired(e.brain);
    t.recoil = 0.22;
    t.flashTimer = 0.08;
    e.recoil = t.recoil;
    e.flashTimer = t.flashTimer;

    const dx = Math.sin(t.angle);
    const dz = Math.cos(t.angle);
    const perpX = Math.cos(t.angle);
    const perpZ = -Math.sin(t.angle);
    const muzzleDist = t.slot.muzzleDist ?? e.rig.muzzleDist ?? 1.35;
    const muzzleY = engine.getRigMuzzle(t.slot, tx, tz, dx, dz, muzzleDist).y;
    const flashScale = e.isBoss ? 1.35 : 1.05;
    const worldSpeed = (e.stats.bulletSpeed || 7.2) * TILE_SIZE;
    const isHeavy = e.stats.bulletPower === BULLET_POWER.HEAVY;
    const rawGunId = (TANK_CONFIGS[e.enemyClass] || SECTOR_BOSS_CONFIGS[e.enemyClass])?.loadout.gun;
    const weaponId = rawGunId === 'TITAN_RAIL' ? 'BOSS_DUAL' : rawGunId;

    if (e.stats.barrels === 2) {
      const offsetWorld = (e.stats.barrelOffset || 0.3) * TILE_SIZE * 0.5;
      [-offsetWorld, offsetWorld].forEach((latOffset) => {
        const shot = engine.traceMuzzle(tx, tz, dx, dz, muzzleDist, false, perpX * latOffset, perpZ * latOffset);
        engine.spawnProjectile(
          shot.x,
          shot.z,
          dx,
          dz,
          false,
          e.stats.damage,
          e.stats.penetration,
          e.stats.bulletPower,
          worldSpeed,
          isHeavy,
          weaponId
        );
        engine.fx.muzzleFlash(shot.x, muzzleY, shot.z, dx, dz, {
          scale: flashScale,
          tint: 0xff9a40,
        });
      });
      engine.screenShake = Math.max(engine.screenShake, 0.18);
      sound.playCannonShot(true, 1, e);
    } else {
      const shot = engine.traceMuzzle(tx, tz, dx, dz, muzzleDist, false);
      engine.fx.muzzleFlash(shot.x, muzzleY, shot.z, dx, dz, {
        scale: flashScale,
        tint: 0xff9a40,
      });
      engine.spawnProjectile(
        shot.x,
        shot.z,
        dx,
        dz,
        false,
        e.stats.damage,
        e.stats.penetration,
        e.stats.bulletPower,
        worldSpeed,
        isHeavy,
        weaponId
      );
      sound.playCannonShot(isHeavy, 1, e);
    }
  }

  updateDirectFire(e, dt, shot, aim, s) {
    const { engine } = this;
    e.turretAngle = engine.lerpAngle(e.turretAngle, aim.desiredTurretAngle, (e.isBoss ? 7 : 5.8) * dt);
    if (e.fireCooldown > 0) return;
    const token = shot.kind !== 'player' || engine.hasAttackToken(e);
    const hit = e.gunner.shot.hit;

    if (e.weaponAbility) {
      const ctx = { target: shot.kind, distToPlayer: s.distToPlayer, aimReady: aim.canFire, token };
      if (fireAbilityWeapon(e, engine, ctx)) onGunnerFired(e.gunner);
    } else if (shot.kind === 'player' && e.enemyClass === EnemyClass.BOSS_HYDRA) {
      const cells = s.distToPlayer / TILE_SIZE;
      if (aim.reacted && cells >= HYDRA.SALVO_MIN_CELLS && cells <= HYDRA.SALVO_MAX_CELLS) {
        // A missed salvo keeps the whole rocket triangle clear of the player
        const clearance = (HYDRA.SALVO_TRIANGLE_CELLS + (e.stats.blastCells || 1)) * TILE_SIZE;
        const point = hit ? shot.target : indirectMissPoint(shot.target, clearance, e.behaviorRng);
        e.fireCooldown =
          e.stats.fireCooldown * (e.hydraEnraged ? HYDRA.PHASE2_RELOAD_MULT : 1) +
          onGunnerFired(e.gunner);
        engine.triggerHydraSalvo(e, this.clampToArena(point));
      }
    } else if (aim.canFire && token) {
      const reloadMult =
        e.enemyClass === EnemyClass.BOSS_MAMMOTH && e.mammothEnraged
          ? MAMMOTH.PHASE2_RELOAD_MULT
          : e.enemyClass === EnemyClass.BOSS_INFERNO && e.infernoEnraged
          ? INFERNO.PHASE2_RELOAD_MULT
          : 1;
      e.fireCooldown = e.stats.fireCooldown * reloadMult + onGunnerFired(e.gunner);
      engine.fireEnemyWeapon(e, { homing: hit && e.missileCfg.homing });
    }
  }

  /** HOWITZER: aim for `artillery.aimSec` (turret tracks the target), then lob a shell. */
  updateIndirectFire(e, dt, shot, aim) {
    const { engine } = this;
    e.turretAngle = engine.lerpAngle(
      e.turretAngle,
      Math.atan2(shot.target.x - e.x, shot.target.z - e.z),
      4.5 * dt
    );
    if (e.indirectAim && e.indirectAim.key !== shot.key) e.indirectAim = null;
    if (!e.indirectAim) {
      if (e.fireCooldown > 0 || !aim.reacted) return;
      if (shot.kind === 'player' && !engine.hasAttackToken(e)) return;
      e.indirectAim = { key: shot.key, timer: e.artilleryCfg.aimSec };
    }
    e.indirectAim.timer -= dt;
    if (e.indirectAim.timer > 0) return;
    e.indirectAim = null;

    const random = e.behaviorRng ?? Math.random;
    const point = e.gunner.shot?.hit
      ? shot.target
      : indirectMissPoint(shot.target, ARTILLERY.SPLASH_RADIUS * TILE_SIZE, random);
    e.fireCooldown = ARTILLERY.RELOAD_MIN + random() * (ARTILLERY.RELOAD_MAX - ARTILLERY.RELOAD_MIN);
    onGunnerFired(e.gunner);
    engine.triggerEnemyArtilleryBarrage(e, this.clampToArena(point));
  }

  /** Boss extra weapons: Hydra ATGM salvo, Mammoth artillery barrage. */
  updateBossSecondaryWeapons(e, dt, s) {
    const { engine } = this;
    const random = e.behaviorRng ?? Math.random;
    if (e.bossBarrage) {
      e.bossBarrage.timer -= dt;
      if (e.bossBarrage.timer <= 0) {
        const player = { x: engine.playerX, z: engine.playerZ };
        const point = e.bossBarrage.hit
          ? player
          : indirectMissPoint(player, ARTILLERY.SPLASH_RADIUS * TILE_SIZE, random);
        e.bossBarrage = null;
        engine.triggerEnemyArtilleryBarrage(e, this.clampToArena(point));
      }
    }
    if (!e.isBoss || !s.canSeePlayer) return;
    const reacted = e.gunner.contactTime >= GUNNER.REACTION_SEC;
    const shootLuck = actionLuck(e.actions, 'shoot_player', 0);

    if (e.enemyClass === EnemyClass.BOSS_HYDRA) {
      if (reacted && e.hydraFlameCooldown <= 0 && s.distToPlayer <= HYDRA.FLAME_RANGE) {
        const aimAngle = Math.atan2(s.toPlayerX, s.toPlayerZ);
        if (Math.abs(normalizeAngleSigned(e.turretAngle - aimAngle)) <= 0.48) {
          emitFlamePuff(engine, e, {
            speed: HYDRA.FLAME_SPEED,
            life: HYDRA.FLAME_LIFE,
            damage: HYDRA.FLAME_DAMAGE,
          });
          e.hydraFlameCooldown = FLAME_STREAM.PUFF_INTERVAL;
        }
      }
      if (reacted && e.hydraMissileCooldown <= 0 && s.distToPlayer <= HYDRA.MISSILE_RANGE_CELLS * TILE_SIZE) {
        e.hydraMissileCooldown = HYDRA.MISSILE_COOLDOWN;
        engine.fireBossMissileSalvo(e, s.toPlayerX, s.toPlayerZ, rollLuck(shootLuck, random), HYDRA.MISSILE_SALVO, HYDRA.MISSILE_SPREAD_RAD);
      }
    } else if (e.enemyClass === EnemyClass.BOSS_MAMMOTH && reacted) {
      if (e.specialCooldown <= 0 && !e.bossBarrage) {
        // BOSS_MAMMOTH: telegraph-free barrage after `artillery.aimSec`
        e.specialCooldown = MAMMOTH.BARRAGE_COOLDOWN * (e.mammothEnraged ? MAMMOTH.PHASE2_RELOAD_MULT : 1);
        e.bossBarrage = { timer: e.artilleryCfg.aimSec, hit: rollLuck(shootLuck, random) };
      }
      if (e.mammothMissileCooldown <= 0 && s.distToPlayer <= MAMMOTH.MISSILE_RANGE_CELLS * TILE_SIZE) {
        e.mammothMissileCooldown = MAMMOTH.MISSILE_COOLDOWN * (e.mammothEnraged ? MAMMOTH.PHASE2_RELOAD_MULT : 1);
        engine.fireBossMissileSalvo(e, s.toPlayerX, s.toPlayerZ, rollLuck(shootLuck, random), MAMMOTH.MISSILE_SALVO, MAMMOTH.MISSILE_SPREAD_RAD);
      }
    } else if (e.enemyClass === EnemyClass.BOSS_INFERNO && reacted) {
      if (e.infernoMissileCooldown <= 0 && s.distToPlayer <= INFERNO.MISSILE_RANGE_CELLS * TILE_SIZE) {
        e.infernoMissileCooldown = INFERNO.MISSILE_COOLDOWN * (e.infernoEnraged ? INFERNO.PHASE2_RELOAD_MULT : 1);
        const salvoCount = e.infernoEnraged ? INFERNO.PHASE2_MISSILE_SALVO : INFERNO.MISSILE_SALVO;
        engine.fireBossMissileSalvo(e, s.toPlayerX, s.toPlayerZ, rollLuck(shootLuck, random), salvoCount, INFERNO.MISSILE_SPREAD_RAD);
      }
    }
  }

  findRandomTerrainTarget(e, maxRangeCells = 8) {
    const { engine } = this;
    const { row: eRow, col: eCol } = engine.worldToGrid(e.x, e.z);
    const candidates = [];

    const minR = Math.max(0, eRow - maxRangeCells);
    const maxR = Math.min(GRID_SIZE - 1, eRow + maxRangeCells);
    const minC = Math.max(0, eCol - maxRangeCells);
    const maxC = Math.min(GRID_SIZE - 1, eCol + maxRangeCells);

    const fwdX = Math.sin(e.hullAngle);
    const fwdZ = Math.cos(e.hullAngle);

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const cell = engine.grid[r]?.[c];
        if (!cell) continue;

        if (
          cell.type === TileType.FOREST ||
          cell.type === TileType.BOXES ||
          cell.type === TileType.BRICK ||
          cell.type === TileType.CONCRETE
        ) {
          const pos = engine.gridToWorld(r, c);
          const dx = pos.x - e.x;
          const dz = pos.z - e.z;
          const distSq = dx * dx + dz * dz;

          if (distSq < 3.24 || distSq > (maxRangeCells * TILE_SIZE) ** 2) continue;

          const dist = Math.sqrt(distSq);
          const dirX = dx / dist;
          const dirZ = dz / dist;

          // Check if any ally tank is in the direct line of fire
          let allyInLine = false;
          for (let j = 0; j < engine.enemies.length; j++) {
            const ally = engine.enemies[j];
            if (ally === e) continue;
            const allyDx = ally.x - e.x;
            const allyDz = ally.z - e.z;
            const dot = allyDx * dirX + allyDz * dirZ;
            if (dot > 0.5 && dot < dist) {
              const perpDistSq = (allyDx - dirX * dot) ** 2 + (allyDz - dirZ * dot) ** 2;
              if (perpDistSq < 1.0) {
                allyInLine = true;
                break;
              }
            }
          }
          if (allyInLine) continue;

          const fwdDot = dirX * fwdX + dirZ * fwdZ;
          const weight = fwdDot > 0.2 ? 3 : 1;

          candidates.push({ x: pos.x, z: pos.z, type: cell.type, weight });
        }
      }
    }

    if (candidates.length === 0) return null;

    const totalWeight = candidates.reduce((sum, item) => sum + item.weight, 0);
    let rand = Math.random() * totalWeight;
    for (const cand of candidates) {
      rand -= cand.weight;
      if (rand <= 0) return cand;
    }
    return candidates[0];
  }

  fireEnemyWeapon(e, { homing = false } = {}) {
    const { engine } = this;
    notifyBrainFired(e.brain);
    e.recoil = 0.2;
    e.flashTimer = 0.07;
    if (e.enemyClass === EnemyClass.STEALTH) {
      e.stealthRevealTimer = 1.9;
    }

    const dx = Math.sin(e.turretAngle);
    const dz = Math.cos(e.turretAngle);
    const perpX = Math.cos(e.turretAngle);
    const perpZ = -Math.sin(e.turretAngle);

    if (e.enemyClass === EnemyClass.MISSILES) {
      const mounts = e.rig.missileMounts;
      const mount = mounts?.length ? mounts[e.missileSide++ % mounts.length] : null;
      const lat = mount ? mount.left : 0;
      const start = engine.traceMuzzle(
        e.x,
        e.z,
        dx,
        dz,
        mount ? Math.max(0.3, mount.forward) : 1.25,
        false,
        perpX * lat,
        perpZ * lat
      );
      engine.spawnEnemyHomingMissile(start.x, start.z, dx, dz, homing);
      sound.playMissileLaunch(e);
      return;
    }
    const muzzleDist = e.rig.muzzleDist ?? 1.25;
    const muzzleY = engine.getRigMuzzle(e.rig, e.x, e.z, dx, dz).y;
    const flashScale = (isHeavyShot) => (e.isBoss ? 1.35 : isHeavyShot ? 1.05 : 0.85);

    const worldSpeed = (e.stats.bulletSpeed || 7.2) * TILE_SIZE;
    const isHeavy = e.stats.bulletPower === BULLET_POWER.HEAVY;

    if (e.stats.barrels === 2) {
      const offsetWorld = (e.stats.barrelOffset || 0.3) * TILE_SIZE * 0.5;
      [-offsetWorld, offsetWorld].forEach((latOffset) => {
        const shot = engine.traceMuzzle(e.x, e.z, dx, dz, muzzleDist, false, perpX * latOffset, perpZ * latOffset);
        engine.spawnProjectile(
          shot.x,
          shot.z,
          dx,
          dz,
          false,
          e.stats.damage,
          e.stats.penetration,
          e.stats.bulletPower,
          worldSpeed,
          isHeavy,
          (TANK_CONFIGS[e.enemyClass] || SECTOR_BOSS_CONFIGS[e.enemyClass])?.loadout.gun
        );
        engine.fx.muzzleFlash(shot.x, muzzleY, shot.z, dx, dz, {
          scale: flashScale(isHeavy),
          tint: 0xff9a40,
        });
      });
      sound.playCannonShot(true, 1, e);
    } else {
      const shot = engine.traceMuzzle(e.x, e.z, dx, dz, muzzleDist, false);
      const gunId = (TANK_CONFIGS[e.enemyClass] || SECTOR_BOSS_CONFIGS[e.enemyClass])?.loadout.gun;
      const isThermo = gunId === 'INFERNO_THERMO';
      const distToAimTarget = isThermo
        ? Math.min(24, Math.max(4.5, Math.hypot(engine.playerX - shot.x, engine.playerZ - shot.z) + 0.6))
        : 0;
      engine.fx.muzzleFlash(shot.x, muzzleY, shot.z, dx, dz, {
        scale: isThermo ? 1.75 : flashScale(isHeavy),
        tint: isThermo ? 0xff4500 : 0xff9a40,
      });
      engine.spawnProjectile(
        shot.x,
        shot.z,
        dx,
        dz,
        false,
        e.stats.damage,
        e.stats.penetration,
        e.stats.bulletPower,
        worldSpeed,
        isHeavy,
        gunId,
        isThermo ? { isThermobaric: true, blastCells: e.stats.blastCells || INFERNO.BLAST_CELLS, detonateDist: distToAimTarget } : {}
      );
      sound.playCannonShot(isHeavy, 1, e);
    }
  }

  /** Enemy missile; `homing` missiles steer toward the player after launch. */
  spawnEnemyHomingMissile(x, z, dirX, dirZ, homing = true) {
    const { engine } = this;
    const mesh = createMissileVisual('enemy', 1.0);
    mesh.position.set(x, 0.9, z);
    mesh.rotation.y = Math.atan2(dirX, dirZ);
    engine.fxGroup.add(mesh);
    engine.fx.missileLaunch(x - dirX * 0.35, 0.9, z - dirZ * 0.35, dirX, dirZ, {
      enemy: true,
      scale: 0.7,
      light: false,
    });
    const soundHandle = sound.startMissileLoop({ x, z });

    const speed = 13.0;
    engine.projectiles.push({
      x,
      z,
      vx: dirX * speed,
      vz: dirZ * speed,
      fromPlayer: false,
      damage: 22,
      penetration: 40,
      bulletPower: BULLET_POWER.NORMAL,
      speed,
      radius: 0.22,
      life: 3.4,
      isHeavy: true,
      isMissile: true,
      isHoming: homing,
      soundHandle,
      mesh,
    });
  }

  /** Lobs one shell at `target`; flight time comes from the tank's `artillery.flightSec`. */
  triggerEnemyArtilleryBarrage(e, target) {
    const { engine } = this;
    sound.playCannonShot(true, 5, e);
    notifyBrainFired(e.brain);
    const { x: tx, z: tz } = target;
    const muzzle = this.aimRigAtAndGetMuzzle(e, tx, tz);
    engine.createArtilleryStrike(
      muzzle.x,
      muzzle.z,
      tx,
      tz,
      ARTILLERY.SPLASH_RADIUS * TILE_SIZE,
      e.artilleryCfg?.flightSec ?? ARTILLERY.FLIGHT_TIME,
      e.stats.damage || 40,
      false,
      muzzle.y
    );
    return true;
  }

  /** Swing an enemy turret onto a ground target and return its world muzzle tip, so. */
  aimRigAtAndGetMuzzle(e, tx, tz) {
    const { engine } = this;
    e.turretAngle = Math.atan2(tx - e.x, tz - e.z);
    if (e.rig?.turret) e.rig.turret.rotation.y = e.turretAngle;
    const dx = Math.sin(e.turretAngle);
    const dz = Math.cos(e.turretAngle);
    return engine.getRigMuzzle(e.rig, e.x, e.z, dx, dz, e.rig?.muzzleDist ?? 1.25);
  }

  /** BOSS_HYDRA MLRS salvo: three telegraphed rockets in a triangle whose first vertex is the. */
  triggerHydraSalvo(e, aim) {
    const { engine } = this;
    sound.playMissileLaunch(e);
    const limit = (GRID_SIZE * TILE_SIZE) / 2 - 2;
    const side = HYDRA.SALVO_TRIANGLE_CELLS * TILE_SIZE;
    const rot = Math.random() * Math.PI * 2;
    const points = [
      aim,
      { x: aim.x + Math.sin(rot) * side, z: aim.z + Math.cos(rot) * side },
      { x: aim.x + Math.sin(rot + Math.PI / 3) * side, z: aim.z + Math.cos(rot + Math.PI / 3) * side },
    ];
    const muzzle = this.aimRigAtAndGetMuzzle(e, aim.x, aim.z);
    points.forEach((p, idx) => {
      engine.createArtilleryStrike(
        muzzle.x,
        muzzle.z,
        THREE.MathUtils.clamp(p.x, -limit, limit),
        THREE.MathUtils.clamp(p.z, -limit, limit),
        (e.stats.blastCells || 1) * TILE_SIZE,
        HYDRA.SALVO_FLIGHT_TIMES[idx] ?? ARTILLERY.FLIGHT_TIME,
        e.stats.damage || 30,
        false,
        muzzle.y,
        'HYDRA_MLRS'
      );
    });
  }

  /** Fires a fan of homing ATGMs from a boss's ROCKET_LAUNCHER pod toward the player. */
  fireBossMissileSalvo(
    e,
    toPlayerX,
    toPlayerZ,
    hit,
    count = HYDRA.MISSILE_SALVO,
    spreadRad = HYDRA.MISSILE_SPREAD_RAD
  ) {
    const { engine } = this;
    const half = (count - 1) / 2;
    // A missed salvo fans out beside the player and does not home
    const sign = (e.behaviorRng ?? Math.random)() < 0.5 ? -1 : 1;
    const miss = hit
      ? 0
      : sign * half * spreadRad +
        missAngle(Math.hypot(toPlayerX, toPlayerZ), TANK_HIT_RADIUS.PLAYER, sign);
    const base = Math.atan2(toPlayerX, toPlayerZ) + miss;
    const homing = hit && e.missileCfg?.homing;
    for (let k = 0; k < count; k++) {
      const ang = base + (k - half) * spreadRad;
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      const start = engine.traceMuzzle(e.x, e.z, dx, dz, 1.8, false);
      engine.spawnEnemyHomingMissile(start.x, start.z, dx, dz, homing);
    }
    sound.playMissileLaunch(e);
    engine.setStatusBanner(`${e.name.toUpperCase()}: HOMING ATGM SALVO INBOUND`, 1.6);
  }

  /** Crushes BOXES supply crates under any moving tank; only player-crushed crates drop loot. */
  crushBoxObstacles(x, z, radius, fromPlayer = false) {
    const { engine } = this;
    if (!engine.grid?.length) return false;
    const half = (GRID_SIZE * TILE_SIZE) / 2;
    const minCol = Math.max(0, Math.floor((x - radius + half) / TILE_SIZE));
    const maxCol = Math.min(GRID_SIZE - 1, Math.floor((x + radius + half) / TILE_SIZE));
    const minRow = Math.max(0, Math.floor((z - radius + half) / TILE_SIZE));
    const maxRow = Math.min(GRID_SIZE - 1, Math.floor((z + radius + half) / TILE_SIZE));
    let crushed = false;
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = engine.grid[r]?.[c];
        if (!cell || cell.type !== TileType.BOXES) continue;
        const pos = engine.gridToWorld(cell.row, cell.col);
        engine.destroyTileCell(cell);
        sound.playBrickHit({ x: pos.x, z: pos.z });
        if (fromPlayer) {
          const type = rollBoxLoot(engine.boxPowerUpPool, Math.random, engine);
          if (type) engine.createPowerUpEntity(type, pos.x, pos.z);
        }
        crushed = true;
      }
    }
    if (crushed) {
      engine.screenShake = Math.max(engine.screenShake || 0, 0.12);
      engine.emitHudUpdate();
    }
    return crushed;
  }

  /** Super-heavy bosses crush BRICK and BOXES obstacles under their hull mass when advancing. */
  crushBossObstacles(x, z, radius) {
    const { engine } = this;
    if (!engine.grid?.length) return false;
    const half = (GRID_SIZE * TILE_SIZE) / 2;
    const minCol = Math.max(0, Math.floor((x - radius + half) / TILE_SIZE));
    const maxCol = Math.min(GRID_SIZE - 1, Math.floor((x + radius + half) / TILE_SIZE));
    const minRow = Math.max(0, Math.floor((z - radius + half) / TILE_SIZE));
    const maxRow = Math.min(GRID_SIZE - 1, Math.floor((z + radius + half) / TILE_SIZE));
    let crushed = false;
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = engine.grid[r]?.[c];
        if (!cell) continue;
        if (cell.type === TileType.BRICK || cell.type === TileType.BOXES) {
          engine.destroyTileCell(cell);
          crushed = true;
        }
      }
    }
    if (crushed) {
      sound.playArmorHit({ x, z });
      engine.screenShake = Math.max(engine.screenShake || 0, 0.14);
    }
    return crushed;
  }

  damageEnemy(enemy, dmg) {
    const { engine } = this;
    if (!enemy || enemy.hp <= DURABILITY.ZERO_HP) return;
    if (enemy.isBoss && enemy.phaseShieldTimer > 0) {
      sound.playSteelHit({ x: enemy.x, z: enemy.z });
      engine.spawnSparks?.(enemy.x, 1.0, enemy.z, 0x38bdf8, 8);
      return;
    }

    const nextHp = enemy.hp - dmg;
    const gate = engine.nextBossPhaseGate(enemy);
    if (gate) {
      const gateHp = enemy.maxHp * gate.ratio;
      if (nextHp <= gateHp) {
        enemy.hp = Math.min(enemy.hp, gateHp);
        enemy.hullHP = Math.max(0, enemy.hp * 10);
        engine.triggerBossPhaseTransition(enemy, gate.id);
        return;
      }
    }

    enemy.hp = nextHp;
    enemy.hullHP = Math.max(0, enemy.hp * 10);
    if (enemy.hp <= DURABILITY.ZERO_HP) {
      const idx = engine.enemies.indexOf(enemy);
      if (idx === -1) return;
      if (idx !== -1) {
        engine.enemies.splice(idx, 1);
      }
      if (engine.priorityTargetId === enemy.id) {
        engine.priorityTargetId = null;
      }
      engine.clearInfernoDashBeam(enemy);
      engine.sensorContacts.delete(enemy.id);
      engine.entityGroup.remove(enemy.rig.root);
      engine.kills++;
      const unitClass = String(enemy.enemyClass || 'hostile').toUpperCase();
      const unitName =
        enemy.name ||
        TANK_CONFIGS[enemy.enemyClass]?.name ||
        SECTOR_BOSS_CONFIGS[enemy.enemyClass]?.name ||
        unitClass;
      const bounty =
        ENEMY_KILL_CREDITS[enemy.enemyClass] ||
        (enemy.isBoss ? 750 : 75);
      engine.playerSave.credits = (engine.playerSave.credits || 0) + bounty;
      engine.creditsEarnedThisMission = (engine.creditsEarnedThisMission || 0) + bounty;
      engine.syncCampaignCredits();
      engine.saveRepo.savePlayerSave(engine.playerSave);
      engine.setStatusBanner(`+ $${bounty} CREDITS (${unitName})`, 1.8);
      engine.screenShake = Math.max(engine.screenShake, enemy.isBoss ? 0.9 : 0.35);
      engine.fx.tankDestroyed(enemy.x, enemy.z, { boss: enemy.isBoss });
      sound.playExplosion(enemy.isBoss ? 2.0 : 1.7, { x: enemy.x, z: enemy.z });
      engine.checkAndIgniteForestOnEnemyKill(enemy);

      if (engine.survivalState) {
        if (enemy.isBoss) {
          engine.survivalState.bossesDefeated = (engine.survivalState.bossesDefeated || 0) + 1;
        }
        const spec = engine.survivalState.waveSpec;
        if (
          engine.vanguardRemainingToSpawn === 0 &&
          (!spec?.isBossWave || engine.bossSpawned) &&
          engine.enemies.length === 0
        ) {
          engine.onSurvivalWaveCleared();
        } else if (enemy.isBoss) {
          engine.setStatusBanner(
            `${unitName.toUpperCase()} DESTROYED! ELIMINATE REMAINING ESCORT!`,
            3.2
          );
        }
      } else {
        const sector = SECTORS[engine.currentSectorIndex];
        const hasPendingBossStage =
          enemy.isBoss &&
          Array.isArray(sector?.bossSequence) &&
          engine.bossStageIndex + 1 < sector.bossSequence.length &&
          !engine.enemies.some((u) => u.isBoss);
        if (hasPendingBossStage) {
          engine.spawnBossStage(engine.bossStageIndex + 1);
          engine.saveProgress();
          return;
        }
        const victoryRes = checkMapVictory(engine.activeMapRules, {
          enemyBaseDestroyed: !engine.enemyBaseAlive,
          vanguardRemainingToSpawn: engine.vanguardRemainingToSpawn,
          activeEnemiesCount: engine.enemies.length,
          bossDefeated: engine.bossSpawned && !engine.enemies.some((u) => u.isBoss),
        });
        if (victoryRes.isVictory) {
          engine.triggerMissionVictory(
            enemy.isBoss ? 'SECTOR BOSS DESTROYED! CREDITS SECURED!' : victoryRes.banner
          );
        } else {
          if (enemy.isBoss) {
            const msg =
              engine.activeMapRules?.victoryOnEnemyBaseDestroyed && engine.enemyBaseAlive
                ? `${unitName.toUpperCase()} DESTROYED! DESTROY THE ENEMY COMMAND CORE!`
                : `${unitName.toUpperCase()} DESTROYED! ELIMINATE REMAINING ESCORT!`;
            engine.setStatusBanner(msg, 3.2);
          }
          engine.saveProgress();
        }
      }
    } else if (!engine.inSmoke && !engine.isSegmentInSmoke(enemy.x, enemy.z, engine.playerX, engine.playerZ)) {
      enemy.alertTarget = { x: engine.playerX, z: engine.playerZ };
      enemy.alertTimer = ENEMY_VISIBILITY.MEMORY_DURATION_SEC;
      enemy.aiTimer = 0;
      if (enemy.radioCooldown <= 0) {
        engine.broadcastPlayerLocationFrom(enemy, engine.playerX, engine.playerZ);
      }
    }
  }
}

