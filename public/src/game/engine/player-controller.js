import * as THREE from 'three';
import {
  APS,
  ARTILLERY,
  BASE_REPAIR,
  BULLET_POWER,
  CANNON_AMMO,
  DURABILITY,
  MISSILE,
  PLAYER_UPGRADES,
  REPAIR_KIT,
  TANK_HIT_RADIUS,
  TILE_SIZE,
  UPGRADE,
  computeTankStats,
  getMaxApsAmmo,
  getMaxCannonAmmo,
  getMaxMissileAmmo,
} from '../constants.js';
import { PLAYER_TANK_CONFIG } from '../tanks.js';
import { GameStatus, TileType } from '../types.js';
import { SECTORS } from '../levels.js';
import { sound } from '../sound.js';
import { createMissileVisual } from '../fx.js';
import { markOwned } from '../dispose.js';
import { deckClearance } from '../models.js';
import { apsInterceptCost } from '../../sim/aps.js';
import { resetBrain } from '../../sim/behavior/index.js';
import { TERRAIN_SURFACES } from '../../sim/catalog.js';
import { sampleMissionTerrain } from '../../sim/missions.js';
import {
  activateRepairKit,
  computeSubsystemModifiers,
  stepAutomaticTrackRepair,
  stepRepairKit,
} from '../../sim/subsystems.js';
import {
  normalizeAngleSigned,
  stepAngleTowards,
  updatePlayerSensorContacts,
} from '../../sim/ai.js';
import { settleMission } from '../../sim/hangar.js';
import { recordSurvivalRun } from '../../sim/survival.js';

const DEFAULT_SENSOR_TURRET = Object.freeze({ visionRange: 75 });

export class PlayerController {
  constructor(engine) {
    this.engine = engine;
  }

  syncPlayerVisuals(wheelDelta = 0, elapsed = 0) {
    const engine = this.engine;
    if (!engine.playerRig || !engine.modelFactory) return;
    engine.modelFactory.updatePlayerTankVisuals(
      engine.playerRig,
      engine.effectiveUpgrades,
      Boolean(engine.playerStats?.canHover),
      engine.missileAmmo,
      engine.apsAmmo,
      wheelDelta,
      elapsed
    );
  }

  recomputePlayerStats(preserveRatio = true) {
    const engine = this.engine;
    const prevMax = engine.playerMaxHp || PLAYER_TANK_CONFIG.base.hp;
    const gun = PLAYER_UPGRADES[UPGRADE.CANNON][(engine.effectiveUpgrades.cannon || 1) - 1];
    const baseChassis =
      PLAYER_UPGRADES[UPGRADE.CHASSIS][(engine.effectiveUpgrades.chassis || 1) - 1];
    const chassis = baseChassis;
    const frame = PLAYER_UPGRADES[UPGRADE.FRAME][(engine.effectiveUpgrades.frame || 1) - 1];
    const engineComp = PLAYER_UPGRADES[UPGRADE.ENGINE][(engine.effectiveUpgrades.engine || 1) - 1];
    const armor = PLAYER_UPGRADES[UPGRADE.ARMOR][(engine.effectiveUpgrades.armor || 1) - 1];

    const optEquip = [];
    if (engine.missileAmmo > 0) {
      optEquip.push('ROCKET_LAUNCHER');
    }

    engine.playerStats = computeTankStats({
      gun,
      chassis,
      frame,
      engine: engineComp,
      armor,
      optionalEquipment: optEquip,
    }, PLAYER_TANK_CONFIG.base);

    engine.playerMaxHp = engine.playerStats.maxHP;
    if (preserveRatio) {
      const delta = engine.playerMaxHp - prevMax;
      if (delta > 0) {
        engine.playerHp = Math.min(
          engine.playerMaxHp * DURABILITY.OVERHEAL_MAX_RATIO,
          engine.playerHp + delta
        );
      } else {
        engine.playerHp = Math.min(
          engine.playerMaxHp * DURABILITY.OVERHEAL_MAX_RATIO,
          engine.playerHp
        );
      }
    } else {
      engine.playerHp = engine.playerMaxHp;
    }

    if (engine.playerStats?.barrels !== 2) {
      engine.playerSalvoShot = 0;
      engine.playerSalvoResetTimer = 0;
    }

    engine.playerController.syncPlayerVisuals(0, engine.clock ? engine.clock.getElapsed() : 0);
  }

  getPlayerMaxCannonAmmo() {
    return getMaxCannonAmmo(this.engine.upgrades?.frame || 1);
  }

  getPlayerMaxApsAmmo() {
    return getMaxApsAmmo(this.engine.upgrades?.frame || 1);
  }

  getPlayerMaxMissileAmmo() {
    return getMaxMissileAmmo(this.engine.upgrades?.frame || 1);
  }

  initApsLaunchers(rounds) {
    this.engine.apsAmmo = [0, 0, 0, 0];
    this.engine.addApsRounds(rounds);
  }

  addApsRounds(count) {
    const engine = this.engine;
    const maxTotal = engine.getPlayerMaxApsAmmo();
    const maxPerLauncher = Math.ceil(maxTotal / APS.LAUNCHERS.length);
    let currentTotal = engine.apsAmmo.reduce((a, b) => a + b, 0);
    let remaining = count;
    while (remaining > 0 && currentTotal < maxTotal) {
      let addedAny = false;
      for (const launcherIdx of APS.FILL_ORDER) {
        if (currentTotal < maxTotal && engine.apsAmmo[launcherIdx] < maxPerLauncher) {
          engine.apsAmmo[launcherIdx]++;
          currentTotal++;
          remaining--;
          addedAny = true;
          if (remaining <= 0 || currentTotal >= maxTotal) break;
        }
      }
      if (!addedAny) break;
    }
    engine.syncApsVisuals();
  }

  syncApsVisuals() {
    const engine = this.engine;
    engine.playerController.syncPlayerVisuals(0, engine.clock ? engine.clock.getElapsed() : 0);
  }

  persistRepairKitCharges() {
    const engine = this.engine;
    if (!engine.playerSave) return;
    engine.playerSave.repairKitCharges = engine.repairKitState?.charges ?? 0;
    engine.saveRepo?.savePlayerSave?.(engine.playerSave);
  }

  /** Activates installed player tactical module in slot 1, 2, or 3 (Section 7.2 & 11.4). */
  activateModuleSlot(slotNumber) {
    const engine = this.engine;
    if (engine.status !== GameStatus.PLAYING) return;

    if (slotNumber === 1) {
      const res = activateRepairKit(
        engine.repairKitState,
        engine.subsystems,
        engine.playerHp < engine.playerMaxHp || Object.values(engine.componentDamage).some(Boolean)
      );
      if (res.started) {
        const hp = engine.playerHp;
        engine.restoreAllComponents();
        engine.playerHp = hp;
        engine.playerController.persistRepairKitCharges();
        sound.playEngineerWeld();
        engine.setStatusBanner(
          'RM-1: COMPONENTS RESTORED / REGENERATING 25 HP OVER 10s',
          2.2
        );
      } else {
        engine.setStatusBanner(`[1] RM-1 REPAIR KIT: ${res.reason.toUpperCase()}`, 2.0);
      }
      engine.emitHudUpdate();
      return;
    }

    if (slotNumber === 2) {
      if (engine.smokeCharges <= 0 || engine.smokeCooldown > 0) {
        engine.setStatusBanner(
          engine.smokeCharges <= 0
            ? '[2] TUCHA-S SMOKE: NO CHARGES REMAINING'
            : `[2] TUCHA-S SMOKE ON COOLDOWN (${engine.smokeCooldown.toFixed(1)}s)`,
          2.0
        );
        return;
      }
      engine.smokeCharges--;
      engine.smokeCooldown = 25;
      engine.deploySmokeCloud(engine.playerX, engine.playerZ, 9.5, 8.0);
      sound.playFlamethrower();
      engine.setStatusBanner(
        '[2] TUCHA-S AEROSOL SMOKE SCREEN DEPLOYED (OPTICAL LOS BLOCKED FOR 8s)',
        2.6
      );
      engine.emitHudUpdate();
      return;
    }
  }

  deploySmokeCloud(x, z, radius = 9.5, duration = 8.0) {
    const engine = this.engine;
    let group = null;
    let puffMat = null;
    if (engine.fxGroup && typeof engine.fxGroup.add === 'function') {
      group = new THREE.Group();
      group.position.set(x, 0.2, z);
      const puffGeo = new THREE.SphereGeometry(radius * 0.44, 12, 10);
      puffMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.95,
        metalness: 0.05,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      });
      const centerPuff = new THREE.Mesh(puffGeo, puffMat);
      centerPuff.position.set(0, 1.35, 0);
      centerPuff.scale.set(1.15, 0.85, 1.15);
      group.add(centerPuff);
      for (let i = 0; i < 6; i++) {
        const puff = new THREE.Mesh(puffGeo, puffMat);
        const ang = (i / 6) * Math.PI * 2;
        puff.position.set(Math.cos(ang) * (radius * 0.34), 0.95 + (i % 2) * 0.35, Math.sin(ang) * (radius * 0.34));
        puff.scale.set(1.0, 0.8 + (i % 2) * 0.15, 1.0);
        group.add(puff);
      }
      markOwned(group);
      engine.fxGroup.add(group);
    }
    engine.smokeClouds.push({
      x,
      z,
      radius,
      remaining: duration,
      maxDuration: duration,
      mesh: group,
      material: puffMat,
    });
    engine.playerController.breakEnemyLockInSmoke();
  }

  /** Checks whether world point `(x, z)` lies inside an active smoke screen. */
  isPointInSmoke(x, z) {
    const engine = this.engine;
    if (!Array.isArray(engine.smokeClouds) || engine.smokeClouds.length === 0) return false;
    for (const cloud of engine.smokeClouds) {
      if (!cloud || cloud.remaining <= 0) continue;
      const radius = cloud.radius || 4.75;
      if (Math.hypot(x - cloud.x, z - cloud.z) <= radius) {
        return true;
      }
    }
    return false;
  }

  /** Checks whether segment `(x0, z0) -> (x1, z1)` intersects any active smoke screen. */
  isSegmentInSmoke(x0, z0, x1, z1) {
    const engine = this.engine;
    if (!Array.isArray(engine.smokeClouds) || engine.smokeClouds.length === 0) return false;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const distSq = dx * dx + dz * dz;
    for (const cloud of engine.smokeClouds) {
      if (!cloud || cloud.remaining <= 0) continue;
      const radius = cloud.radius || 4.75;
      let t = 0;
      if (distSq > 1e-6) {
        t = Math.max(0, Math.min(1, ((cloud.x - x0) * dx + (cloud.z - z0) * dz) / distSq));
      }
      const projX = x0 + t * dx;
      const projZ = z0 + t * dz;
      if (Math.hypot(cloud.x - projX, cloud.z - projZ) <= radius) {
        return true;
      }
    }
    return false;
  }

  /** Clears active enemy target locks, alerts, aims, and pursuit blocked by smoke. */
  breakEnemyLockInSmoke() {
    const engine = this.engine;
    engine.inSmoke = engine.isPointInSmoke(engine.playerX, engine.playerZ);
    if (engine.inSmoke) {
      engine.playerSpottedByEnemies = false;
    }
    if (!Array.isArray(engine.enemies)) return;
    for (const e of engine.enemies) {
      const blocked =
        engine.inSmoke ||
        !engine.hasLineOfSight(e.x, e.z, engine.playerX, engine.playerZ) ||
        (e.alertTarget && engine.isPointInSmoke(e.alertTarget.x, e.alertTarget.z));
      if (!blocked) continue;

      e.hasDetectedPlayer = false;
      e.alertTarget = null;
      e.alertTimer = 0;
      e.indirectAim = null;
      e.bossBarrage = null;
      e.movePlan = null;
      e.breachTarget = null;
      e.aiTimer = 0;
      e.brainCharging = false;
      if (e.infernoDashWindup > 0) {
        e.infernoDashWindup = 0;
        engine.clearInfernoDashBeam?.(e);
      }
      if (e.ai) {
        e.ai.state = 'patrol';
        e.ai.lastKnownTargetPos = null;
      }
      if (e.brain) resetBrain(e.brain);
      if (e.gunner) {
        e.gunner.contactTime = 0;
        e.gunner.lostTime = 999;
        e.gunner.shot = null;
      }
      if (Array.isArray(e.turrets)) {
        for (const t of e.turrets) {
          if (t.gunner) {
            t.gunner.contactTime = 0;
            t.gunner.lostTime = 999;
            t.gunner.shot = null;
          }
        }
      }
    }
  }

  firePlayerHomingMissile() {
    const engine = this.engine;
    if (engine.status !== GameStatus.PLAYING) return;
    if (engine.jammedTimer > 0) {
      sound.playJammerPulse();
      engine.setStatusBanner(
        'ECM JAMMING ACTIVE! HOMING ATGM TELEMETRY LOCKED!',
        2.0
      );
      return;
    }
    if (engine.missileAmmo <= 0 || engine.missileCooldown > 0) return;

    engine.missileAmmo--;
    engine.playerSave.missileAmmo = engine.missileAmmo;
    engine.saveRepo.savePlayerSave(engine.playerSave);
    engine.missileCooldown = MISSILE.COOLDOWN;
    engine.recomputePlayerStats(true);
    sound.playMissileLaunch();

    const dirX = Math.sin(engine.playerTurretAngle);
    const dirZ = Math.cos(engine.playerTurretAngle);
    const startX = engine.playerX + dirX * 1.25;
    const startZ = engine.playerZ + dirZ * 1.25;
    const soundHandle = sound.startMissileLoop({ x: startX, z: startZ });

    const mesh = createMissileVisual('player', 1.15);
    mesh.position.set(startX, 1.35, startZ);
    mesh.rotation.y = engine.playerTurretAngle;
    engine.fxGroup.add(mesh);
    engine.fx.missileLaunch(startX - dirX * 0.45, 1.35, startZ - dirZ * 0.45, dirX, dirZ, { scale: 1 });

    const worldSpeed = MISSILE.SPEED * TILE_SIZE;
    engine.projectiles.push({
      x: startX,
      z: startZ,
      vx: dirX * worldSpeed,
      vz: dirZ * worldSpeed,
      fromPlayer: true,
      damage: MISSILE.DAMAGE,
      penetration: MISSILE.PENETRATION,
      bulletPower: BULLET_POWER.HEAVY,
      speed: worldSpeed,
      radius: MISSILE.HIT_RADIUS * TILE_SIZE * 0.5,
      life: MISSILE.MAX_LIFETIME,
      isHeavy: true,
      isMissile: true,
      soundHandle,
      mesh,
    });

    engine.emitHudUpdate();
  }

  updateSmokeAndLoot(dt) {
    const engine = this.engine;
    for (let i = engine.smokeClouds.length - 1; i >= 0; i--) {
      const s = engine.smokeClouds[i];
      s.remaining -= dt;
      if (s.remaining <= 0) {
        if (s.mesh) engine.fxGroup?.remove(s.mesh);
        engine.smokeClouds.splice(i, 1);
      } else {
        if (s.mesh) s.mesh.rotation.y += dt * 0.18;
        if (s.material) {
          const fadeWindow = Math.min(2.0, s.maxDuration || 2.0);
          s.material.opacity = s.remaining < fadeWindow ? (s.remaining / fadeWindow) * 0.78 : 0.78;
        }
      }
    }
    engine.inSmoke = engine.isPointInSmoke(engine.playerX, engine.playerZ);

    const sp = (engine._sensorParams ||= {
      player: { x: 0, z: 0, turret: null },
      obstacles: [],
      fadeDuration: 5.0,
    });
    sp.contactMap = engine.sensorContacts;
    sp.player.x = engine.playerX;
    sp.player.z = engine.playerZ;
    sp.player.turret = engine.assembledTank?.turret || DEFAULT_SENSOR_TURRET;
    sp.enemies = engine.enemies;
    sp.smokeClouds = engine.smokeClouds;
    sp.dt = dt;
    updatePlayerSensorContacts(sp);
  }

  updatePlayer(dt, elapsed) {
    const engine = this.engine;
    const subMods = computeSubsystemModifiers(engine.subsystems);
    if (engine.playerFireCooldown > 0) engine.playerFireCooldown -= dt;
    if (engine.playerSalvoResetTimer > 0) {
      engine.playerSalvoResetTimer -= dt;
      if (engine.playerSalvoResetTimer <= 0) {
        engine.playerSalvoShot = 0;
      }
    }
    if (engine.missileCooldown > 0)
      engine.missileCooldown = Math.max(0, engine.missileCooldown - dt);
    if (engine.apsRearmTimer > 0)
      engine.apsRearmTimer = Math.max(0, engine.apsRearmTimer - dt);
    if (engine.empTimer > 0) engine.empTimer = Math.max(0, engine.empTimer - dt);
    if (engine.smokeCooldown > 0) engine.smokeCooldown = Math.max(0, engine.smokeCooldown - dt);

    stepAutomaticTrackRepair(engine.subsystems, dt);
    const repairDone = stepRepairKit(engine.repairKitState, engine.subsystems, dt);
    if (repairDone?.healing && engine.playerHp < engine.playerMaxHp) {
      engine.playerHp = Math.min(engine.playerMaxHp, engine.playerHp + repairDone.healing);
    }
    if (repairDone?.completed) {
      sound.playPowerUp();
      engine.setStatusBanner(
        'RM-1 FIELD REPAIR COMPLETE',
        2.6
      );
    }

    if (engine.jammedTimer > 0) {
      engine.jammedTimer = Math.max(0, engine.jammedTimer - dt);
    }

    const canHover = engine.playerStats.canHover;
    const allTerrain = Boolean(engine.playerStats.allTerrain);

    const { row, col } = engine.worldToGrid(engine.playerX, engine.playerZ);
    const currentCell = engine.grid[row]?.[col];
    // A damaged amphibious chassis may leave its current water crossing without becoming trapped.
    if (engine.componentWaterEgress && !engine.checkTankWallCollision(
      engine.playerX, engine.playerZ, TANK_HIT_RADIUS.PLAYER, false
    )) engine.componentWaterEgress = false;
    const canCrossWater = engine.playerStats.canCrossWater || engine.componentWaterEgress;
    engine.onIce = !canHover && !allTerrain && currentCell?.type === TileType.ICE;
    engine.onSand = !canHover && !allTerrain && currentCell?.type === TileType.SAND;
    engine.inForest = currentCell?.type === TileType.FOREST && !currentCell?.isBurning;
    engine.inSmoke = engine.isPointInSmoke(engine.playerX, engine.playerZ);

    const authoredMission = SECTORS[engine.currentSectorIndex];
    const terrainSample = sampleMissionTerrain(authoredMission, engine.playerX, engine.playerZ);
    engine.currentSurface = engine.onIce
      ? { ...TERRAIN_SURFACES.sand, label: 'Low-Friction Ice', speedMultiplier: 0.85 }
      : engine.onSand
      ? { ...TERRAIN_SURFACES.sand, label: 'Scorched Sand', speedMultiplier: 0.78 }
      : terrainSample.surface;

    let inFwd = 0;
    let inRight = 0;
    if (engine.keys['KeyW'] || engine.keys['ArrowUp']) inFwd += 1;
    if (engine.keys['KeyS'] || engine.keys['ArrowDown']) inFwd -= 1;
    if (engine.keys['KeyA'] || engine.keys['ArrowLeft']) inRight -= 1;
    if (engine.keys['KeyD'] || engine.keys['ArrowRight']) inRight += 1;

    const len = Math.hypot(inFwd, inRight);
    if (len > 0) {
      inFwd /= len;
      inRight /= len;
    }

    const hpRatio = engine.playerHp / engine.playerMaxHp;
    const lowHpMult = hpRatio < DURABILITY.LOW_RATIO ? DURABILITY.LOW_SPEED_MULT : 1.0;
    const rawSurfMult = engine.currentSurface?.speedMultiplier || 1.0;
    const surfMult = allTerrain ? Math.max(1.0, rawSurfMult) : rawSurfMult;
    const maxSpeed =
      engine.playerStats.moveSpeed *
      TILE_SIZE *
      lowHpMult *
      surfMult *
      subMods.speedMultiplier;

    if (hpRatio < DURABILITY.LOW_RATIO && Math.random() < 0.25) {
      engine.spawnSparks(engine.playerX, 0.65, engine.playerZ, 0x475569, 1);
    }

    const surfAccel = engine.currentSurface?.accelMultiplier || 1.0;
    const surfBrake = engine.currentSurface?.brakeMultiplier || 1.0;
    const accel = (engine.onIce ? 4.5 : 22.0) * (allTerrain ? Math.max(1.0, surfAccel) : surfAccel);
    const drag = (engine.onIce ? 1.8 : 20.0) * (allTerrain ? Math.max(1.0, surfBrake) : surfBrake);

    if (!subMods.immobilized && len > 0) {
      const quadrantOffset =
        Math.round((engine.cameraAzimuth - Math.PI * 0.25) / (Math.PI * 0.5)) *
        (Math.PI * 0.5);
      const rawX = inRight;
      const rawZ = -inFwd;
      const cosA = Math.cos(quadrantOffset);
      const sinA = Math.sin(quadrantOffset);
      const moveX = rawX * cosA - rawZ * sinA;
      const moveZ = rawX * sinA + rawZ * cosA;

      const desiredHullAngle = Math.atan2(moveX, moveZ);
      const maxHullTurnStep =
        (((engine.assembledTank?.hull?.turnRate || 160) * Math.PI) / 180) *
        subMods.turnMultiplier *
        dt *
        4.2;
      engine.playerHullAngle = stepAngleTowards(
        engine.playerHullAngle,
        desiredHullAngle,
        maxHullTurnStep
      );

      if (subMods.asymmetricPull !== 0) {
        engine.playerHullAngle = normalizeAngleSigned(
          engine.playerHullAngle + subMods.asymmetricPull * 0.45 * dt
        );
      }

      engine.playerVx = THREE.MathUtils.damp(
        engine.playerVx,
        moveX * maxSpeed,
        accel,
        dt
      );
      engine.playerVz = THREE.MathUtils.damp(
        engine.playerVz,
        moveZ * maxSpeed,
        accel,
        dt
      );
    } else {
      engine.playerVx = THREE.MathUtils.damp(engine.playerVx, 0, drag, dt);
      engine.playerVz = THREE.MathUtils.damp(engine.playerVz, 0, drag, dt);
    }

    const playerSpeed = Math.hypot(engine.playerVx, engine.playerVz);
    const speedRatio = maxSpeed > 0 ? Math.min(1.0, playerSpeed / maxSpeed) : 0;
    sound.updateEngineLoop(speedRatio, engine.hangarOpen || engine.status !== GameStatus.PLAYING);

    if (engine.ramCooldown > 0) {
      engine.ramCooldown = Math.max(0, engine.ramCooldown - dt);
    }

    const radius = 0.72;
    const isMoving = Math.abs(engine.playerVx) > 0.05 || Math.abs(engine.playerVz) > 0.05;
    const nextX = engine.playerX + engine.playerVx * dt;
    if (isMoving) {
      engine.enemyCombat.crushBoxObstacles(nextX, engine.playerZ, radius, true);
    }
    if (
      !engine.checkTankWallCollision(
        nextX,
        engine.playerZ,
        radius,
        canCrossWater
      )
    ) {
      engine.playerX = nextX;
    } else {
      engine.playerVx = 0;
    }

    const nextZ = engine.playerZ + engine.playerVz * dt;
    if (isMoving) {
      engine.enemyCombat.crushBoxObstacles(engine.playerX, nextZ, radius, true);
    }
    if (
      !engine.checkTankWallCollision(
        engine.playerX,
        nextZ,
        radius,
        canCrossWater
      )
    ) {
      engine.playerZ = nextZ;
    } else {
      engine.playerVz = 0;
    }

    for (let i = engine.enemies.length - 1; i >= 0; i--) {
      const e = engine.enemies[i];
      if (!e) continue;
      const eRadius = e.isBoss ? 1.12 : 0.72;
      const minDist = radius + eRadius;
      const dxE = engine.playerX - e.x;
      const dzE = engine.playerZ - e.z;
      const distE = Math.hypot(dxE, dzE);

      if (distE < minDist) {
        if (e.contactAbility && engine.enemyCombat.spendContactEnemy(e)) continue;

        const nx = distE > 1e-4 ? dxE / distE : Math.sin(engine.playerHullAngle);
        const nz = distE > 1e-4 ? dzE / distE : Math.cos(engine.playerHullAngle);
        const overlap = minDist - distE;

        const pushedX = engine.playerX + nx * overlap;
        const pushedZ = engine.playerZ + nz * overlap;
        if (
          !engine.checkTankWallCollision(
            pushedX,
            pushedZ,
            radius,
            canCrossWater
          )
        ) {
          engine.playerX = pushedX;
          engine.playerZ = pushedZ;
        }

        const impactSpeed = Math.hypot(engine.playerVx, engine.playerVz);
        engine.playerVx *= 0.25;
        engine.playerVz *= 0.25;

        if ((engine.ramCooldown || 0) <= 0 && impactSpeed > 1.8) {
          engine.ramCooldown = 0.65;
          const frameTier = engine.effectiveUpgrades.frame || 1;
          const ramDamage = Math.round(6 + frameTier * 4 + impactSpeed * 1.4);
          const selfRamDamage = Math.max(1, Math.round(6 - frameTier));
          const hitX = (engine.playerX + e.x) * 0.5;
          const hitZ = (engine.playerZ + e.z) * 0.5;
          sound.playSteelHit({ x: hitX, z: hitZ });
          engine.spawnSparks(hitX, 0.75, hitZ, 0xf59e0b, 10);
          engine.screenShake = Math.max(engine.screenShake, 0.32);
          engine.damageEnemy(e, ramDamage);
          engine.damagePlayer(selfRamDamage);
        }
      }
    }

    const dx = engine.aimWorld.x - engine.playerX;
    const dz = engine.aimWorld.z - engine.playerZ;
    if (dx * dx + dz * dz > 0.01) {
      const targetTurretAngle = Math.atan2(dx, dz);
      const maxTurretStep =
        (((engine.assembledTank?.turret?.turnRate || 240) * Math.PI) / 180) *
        subMods.turretTurnMultiplier *
        dt *
        4.0;
      engine.playerTurretAngle = stepAngleTowards(
        engine.playerTurretAngle,
        targetTurretAngle,
        maxTurretStep
      );
    }

    engine.playerRecoil = THREE.MathUtils.damp(engine.playerRecoil, 0, 14, dt);
    engine.playerBarrelRecoils[0] = THREE.MathUtils.damp(
      engine.playerBarrelRecoils[0],
      0,
      16,
      dt
    );
    engine.playerBarrelRecoils[1] = THREE.MathUtils.damp(
      engine.playerBarrelRecoils[1],
      0,
      16,
      dt
    );
    engine.playerRig.barrelPivot.position.z = 0.46 - engine.playerRecoil;
    engine.playerGunElevation = THREE.MathUtils.damp(
      engine.playerGunElevation || 0,
      deckClearance(engine.playerRig, engine.playerTurretAngle - engine.playerHullAngle),
      10,
      dt
    );
    engine.playerRig.barrelPivot.rotation.x = -engine.playerGunElevation;
    if (engine.playerRig.c5Barrels) {
      engine.playerRig.c5Barrels[0].position.z = -engine.playerBarrelRecoils[0];
      engine.playerRig.c5Barrels[1].position.z = -engine.playerBarrelRecoils[1];
    }

    if (engine.playerFlashTimer > 0) {
      engine.playerFlashTimer -= dt;
      engine.playerRig.muzzleFlash.material.opacity = 0;
    }

    const hoverY = canHover ? 0.05 + Math.sin(elapsed * 4.0) * 0.012 : 0;
    engine.playerRig.root.position.set(engine.playerX, hoverY, engine.playerZ);
    engine.playerRig.hull.rotation.y = engine.playerHullAngle;
    engine.playerGearState = engine.playerGearState || {};
    engine.driveGear(engine.playerRig, engine.playerGearState, engine.playerX, engine.playerZ, engine.playerHullAngle);
    engine.playerRig.turret.rotation.y = engine.playerTurretAngle;

    const speedMag = Math.hypot(engine.playerVx, engine.playerVz);
    engine.playerForwardSpeed = speedMag;
    engine.playerController.syncPlayerVisuals(speedMag * dt * 2.5, elapsed);

    if (engine.isMouseDown) {
      engine.tryPlayerFire();
    }
  }

  updateBaseMaintenance(dt) {
    const engine = this.engine;
    if (!engine.baseAlive) {
      engine.inBaseRepairZone = false;
      return;
    }

    const baseWorld = engine.sectorLoader.getCommandBaseCenter();
    const distCells =
      Math.hypot(engine.playerX - baseWorld.x, engine.playerZ - baseWorld.z) /
      TILE_SIZE;

    const wasInZone = engine.inBaseRepairZone;
    engine.inBaseRepairZone = distCells <= BASE_REPAIR.RADIUS_CELLS + 1.0;

    if (engine.inBaseRepairZone) {
      let repairedAny = false;

      if (engine.playerHp < engine.playerMaxHp) {
        engine.playerHp = Math.min(
          engine.playerMaxHp,
          engine.playerHp + BASE_REPAIR.RATE * dt
        );
        repairedAny = true;
      }

      const subRate = (BASE_REPAIR.SUBSYSTEM_RATE || 10.0) * dt;
      if (engine.subsystems) {
        for (const sub of Object.values(engine.subsystems)) {
          if (sub && typeof sub.hp === 'number' && sub.hp < sub.maxHp) {
            sub.hp = Math.min(sub.maxHp, sub.hp + subRate);
            sub.repairProgress = 0;
            sub.repairDelayTimer = 0;
            sub.status =
              sub.hp >= sub.maxHp * 0.5
                ? 'normal'
                : sub.hp > 0
                  ? 'damaged'
                  : 'destroyed';
            repairedAny = true;
          }
        }
      }

      if (engine.playerArmorPanels) {
        for (const panel of Object.values(engine.playerArmorPanels)) {
          const maxInt = panel?.maxIntegrity || 100;
          if (panel && typeof panel.integrity === 'number' && panel.integrity < maxInt) {
            panel.integrity = Math.min(maxInt, panel.integrity + 4.5 * dt);
            if (panel.integrity >= 15) {
              panel.destroyed = false;
            }
            repairedAny = true;
          }
        }
      }

      const maxCannon = engine.getPlayerMaxCannonAmmo();
      const baseRearmCap = Math.min(maxCannon, CANNON_AMMO.BASE_REARM_CAP);
      if (engine.cannonAmmo < baseRearmCap) {
        engine.cannonBaseRearmTimer += dt;
        if (engine.cannonBaseRearmTimer >= CANNON_AMMO.BASE_REARM_INTERVAL_SEC) {
          engine.cannonBaseRearmTimer = 0;
          engine.cannonAmmo = Math.min(baseRearmCap, engine.cannonAmmo + 1);
          engine.spawnSparks(engine.playerX, 0.7, engine.playerZ, 0xf59e0b, 2);
          repairedAny = true;
          engine.emitHudUpdate();
        }
      } else {
        engine.cannonBaseRearmTimer = 0;
      }

      if (repairedAny) {
        if (!wasInZone && !engine.statusMessage) {
          engine.setStatusBanner(
            'ALLIED BASE REPAIR & REARM BAY ACTIVE',
            2.2
          );
        }
        engine.baseRepairSparkTimer -= dt;
        if (engine.baseRepairSparkTimer <= 0) {
          engine.baseRepairSparkTimer = BASE_REPAIR.SPARK_INTERVAL;
          engine.spawnSparks(engine.playerX, 0.7, engine.playerZ, 0x10b981, 2);
        }
      }
    }
  }

  updateApsInterception() {
    const engine = this.engine;
    if (engine.apsRearmTimer > 0 || engine.jammedTimer > 0) return;
    const totalAmmo = engine.apsAmmo.reduce((a, b) => a + b, 0);
    if (totalAmmo <= 0) return;

    const detectWorldRadius = APS.DETECT_RADIUS * TILE_SIZE;
    // Player hull collision radius is TANK_HIT_RADIUS.PLAYER (0.85). Add safety margin for projectile & hull boundaries.
    const directHitThreatMargin = TANK_HIT_RADIUS.PLAYER + 0.45; // ~1.30m

    // 1. Direct-fire projectiles (shells, missiles, rockets)
    for (let i = engine.projectiles.length - 1; i >= 0; i--) {
      const p = engine.projectiles[i];
      const cost = apsInterceptCost(p);
      if (!cost || totalAmmo < cost) continue;

      const toPlayerX = engine.playerX - p.x;
      const toPlayerZ = engine.playerZ - p.z;
      const dist = Math.hypot(toPlayerX, toPlayerZ);
      if (dist > detectWorldRadius) continue;

      // Check if projectile is moving towards the player
      const speed = Math.hypot(p.vx, p.vz);
      const dot = toPlayerX * p.vx + toPlayerZ * p.vz;

      // If moving away and already beyond player hit boundary, ignore it
      if (dot <= 0 && dist > TANK_HIT_RADIUS.PLAYER + 0.2) continue;

      // Trajectory closest approach distance check for straight-flying projectiles
      if (speed > 0.1 && !p.isHoming) {
        // Cross product / speed gives perpendicular distance to the line of flight
        const cross = Math.abs(toPlayerX * p.vz - toPlayerZ * p.vx);
        const closestDistance = cross / speed;
        // If projectile line of flight does not intersect player's threat radius, ignore it
        if (closestDistance > directHitThreatMargin) continue;
      }

      // Check if an impassable obstacle (Brick or Concrete) stands between projectile and player
      if (!engine.hasLineOfSight(p.x, p.z, engine.playerX, engine.playerZ)) continue;

      if (engine.playerController.consumeApsLauncherTowards(p.x, p.z, 0.95, cost)) {
        engine.removeProjectile(i);
        return;
      }
    }

    // 2. Incoming artillery hazard zones (Howitzer, MLRS, Boss barrages)
    // Only intercept if the impact area will actually splash/damage the player
    const maxArtilleryThreatRadius = (ARTILLERY.SPLASH_RADIUS || 1.5) * TILE_SIZE + TANK_HIT_RADIUS.PLAYER + 0.25; // ~3.75 - 4.10m
    for (let i = engine.hazardZones.length - 1; i >= 0; i--) {
      const hz = engine.hazardZones[i];
      const cost = apsInterceptCost(hz);
      if (!cost || totalAmmo < cost) continue;
      const progress = 1 - hz.timer / hz.maxTimer;
      if (progress >= APS.ARTILLERY_ENGAGE_PROGRESS) {
        const dist = Math.hypot(hz.x - engine.playerX, hz.z - engine.playerZ);
        if (dist <= maxArtilleryThreatRadius && dist <= detectWorldRadius) {
          const shell = hz.shellMesh.position;
          if (engine.playerController.consumeApsLauncherTowards(shell.x, shell.z, shell.y, cost)) {
            engine.fxGroup.remove(hz.ringMesh);
            engine.fxGroup.remove(hz.fillMesh);
            engine.fxGroup.remove(hz.shellMesh);
            engine.hazardZones.splice(i, 1);
            return;
          }
        }
      }
    }
  }

  consumeApsLauncherTowards(threatX, threatZ, threatY = 0.95, cost = 1) {
    const engine = this.engine;
    if (engine.apsAmmo.reduce((sum, rounds) => sum + rounds, 0) < cost) return false;
    let remaining = cost;
    for (const idx of APS.FILL_ORDER) {
      const spent = Math.min(engine.apsAmmo[idx], remaining);
      engine.apsAmmo[idx] -= spent;
      remaining -= spent;
      if (!remaining) break;
    }

    engine.apsRearmTimer = APS.REARM_TIME;
    engine.syncApsVisuals();
    sound.playApsIntercept({ x: threatX, z: threatZ });

    const toX = threatX - engine.playerX;
    const toZ = threatZ - engine.playerZ;
    const toLen = Math.hypot(toX, toZ) || 1;
    engine.fx.apsIntercept(
      engine.playerX + (toX / toLen) * 0.75,
      1.05,
      engine.playerZ + (toZ / toLen) * 0.75,
      threatX,
      threatY,
      threatZ
    );
    engine.emitHudUpdate();
    return true;
  }

  tryPlayerFire() {
    const engine = this.engine;
    if (engine.playerFireCooldown > 0) return;
    if (engine.cannonAmmo <= 0) {
      sound.playDryFire();
      engine.setStatusBanner('OUT OF AMMO! REARM AT BASE OR FIND AMMO CRATES', 2.0);
      return;
    }
    engine.cannonAmmo--;

    engine.playerFlashTimer = 0.06;
    engine.shotsFired++;

    const dirX = Math.sin(engine.playerTurretAngle);
    const dirZ = Math.cos(engine.playerTurretAngle);
    const perpX = Math.cos(engine.playerTurretAngle);
    const perpZ = -Math.sin(engine.playerTurretAngle);
    const cannonIdx = Math.max(0, Math.min(4, (engine.effectiveUpgrades.cannon || 1) - 1));
    const flashOffset = engine.playerRig?.flashOffsets?.[cannonIdx];
    const muzzleDist =
      flashOffset != null ? 0.46 + flashOffset : 1.48 + cannonIdx * 0.14;
    const { x: muzzleX, z: muzzleZ } = engine.traceMuzzle(
      engine.playerX,
      engine.playerZ,
      dirX,
      dirZ,
      muzzleDist,
      true
    );

    const worldSpeed = engine.playerStats.bulletSpeed * TILE_SIZE;
    const isHeavy = engine.playerStats.bulletPower === BULLET_POWER.HEAVY;

    if (engine.playerStats.barrels === 2) {
      const barrelIdx = engine.playerSalvoShot || 0;
      const isSecondShot = barrelIdx === 1;

      if (isSecondShot) {
        const fullCooldown = engine.playerStats.fireCooldown || 0.88;
        engine.playerFireCooldown = fullCooldown;
        engine.playerMaxFireCooldown = fullCooldown;
        engine.playerSalvoShot = 0;
        engine.playerSalvoResetTimer = 0;
      } else {
        const interCooldown = engine.playerStats.interBarrelCooldown || 0.5;
        engine.playerFireCooldown = interCooldown;
        engine.playerMaxFireCooldown = interCooldown;
        engine.playerSalvoShot = 1;
        engine.playerSalvoResetTimer = engine.playerStats.fireCooldown || 0.88;
      }

      engine.playerRecoil = 0.07;
      engine.playerBarrelRecoils[barrelIdx] = 0.24;

      const sideSign = barrelIdx === 0 ? -1 : 1;
      const latOffset =
        sideSign * (engine.playerStats.barrelOffset || 0.22) * TILE_SIZE * 0.45;

      if (engine.playerRig?.muzzleFlash) {
        engine.playerRig.muzzleFlash.position.x = sideSign * 0.14;
      }

      const { x: shotX, z: shotZ } = engine.traceMuzzle(
        engine.playerX,
        engine.playerZ,
        dirX,
        dirZ,
        muzzleDist,
        true,
        perpX * latOffset,
        perpZ * latOffset
      );
      engine.spawnProjectile(
        shotX,
        shotZ,
        dirX,
        dirZ,
        true,
        engine.playerStats.damage,
        engine.playerStats.penetration,
        engine.playerStats.bulletPower,
        worldSpeed,
        isHeavy
      );
      engine.playerController.firePlayerMuzzleFx(shotX, shotZ, dirX, dirZ, isHeavy);
    } else {
      const fullCooldown = engine.playerStats.fireCooldown || 1.25;
      engine.playerFireCooldown = fullCooldown;
      engine.playerMaxFireCooldown = fullCooldown;
      engine.playerRecoil = 0.22;
      if (engine.playerRig?.muzzleFlash) {
        engine.playerRig.muzzleFlash.position.x = 0;
      }
      engine.spawnProjectile(
        muzzleX,
        muzzleZ,
        dirX,
        dirZ,
        true,
        engine.playerStats.damage,
        engine.playerStats.penetration,
        engine.playerStats.bulletPower,
        worldSpeed,
        isHeavy
      );
      engine.playerController.firePlayerMuzzleFx(muzzleX, muzzleZ, dirX, dirZ, isHeavy);
    }
    sound.playCannonShot(isHeavy);
  }

  firePlayerMuzzleFx(x, z, dirX, dirZ, isHeavy) {
    const engine = this.engine;
    const muzzle = engine.physics.getRigMuzzle(engine.playerRig, engine.playerX, engine.playerZ, dirX, dirZ);
    const cannonTier = engine.effectiveUpgrades.cannon || 1;
    engine.fx.muzzleFlash(x, muzzle.y, z, dirX, dirZ, {
      scale: (isHeavy ? 1.15 : 0.9) + cannonTier * 0.05,
      tint: 0xffb347,
    });
  }

  damagePlayer(dmg, componentHit = null) {
    const engine = this.engine;
    if (!(dmg > 0) || engine.playerHp <= 0) return;
    engine.playerHp -= dmg;
    if (componentHit) engine.tryDamageComponent(dmg, componentHit);
    engine.screenShake = Math.max(engine.screenShake, 0.4);
    sound.playArmorHit({ x: engine.playerX, z: engine.playerZ });

    const triggerThreshold = engine.playerMaxHp * REPAIR_KIT.TRIGGER_RATIO;
    if (
      engine.repairKitCount > 0 &&
      (engine.playerHp <= triggerThreshold || engine.playerHp <= DURABILITY.ZERO_HP)
    ) {
      engine.repairKitCount--;
      engine.playerHp = Math.max(1, engine.playerHp) + REPAIR_KIT.RESTORE_AMOUNT;
      sound.playPowerUp();
      sound.playEngineerWeld({ x: engine.playerX, z: engine.playerZ });
      engine.spawnSparks(engine.playerX, 0.9, engine.playerZ, 0x10b981, 14);
      engine.setStatusBanner(
        `EMERGENCY REPAIR KIT TRIGGERED! RESTORED +${REPAIR_KIT.RESTORE_AMOUNT} HP`,
        3.0
      );
      engine.emitHudUpdate();
      return;
    }

    if (engine.playerHp <= DURABILITY.ZERO_HP) {
      engine.playerHp = 0;
      engine.status = GameStatus.GAME_OVER;
      engine.wasDefeated = true;
      sound.stopEngineLoop();
      sound.playExplosion(1.8, { x: engine.playerX, z: engine.playerZ });
      engine.fx.tankDestroyed(engine.playerX, engine.playerZ, { boss: false });
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
        engine.syncCampaignCredits();
        engine.saveProgress();
      }
      engine.emitHudUpdate();
    }
  }
}
