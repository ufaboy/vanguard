import { stepAngleTowards } from '../public/src/sim/ai.js';
import { TILE_SIZE } from '../public/src/game/levels.js';
import { EnemyClass, GameStatus } from '../public/src/game/types.js';

/**
 * Interactive highlight director for the promo showcase reel on Berlin: Brandenburg Gate (Map 16).
 * - The player controls VANGUARD directly (WASD, mouse aim/fire, Space/Right-Click ATGM, 1..5 abilities, C/V camera & FPV).
 * - Enemy formations follow scripted routes and return fire when they have line-of-sight.
 * - Transitions to the next highlight 3.0 seconds after the last enemy tank in the scene is destroyed.
 */
export class ShowcaseDirector {
  constructor(engine, sectorIndex, { onFade, initialScene = 0, lockScene = false } = {}) {
    this.engine = engine;
    this.sectorIndex = sectorIndex;
    this.onFade = onFade || (() => {});
    this.sceneIndex = Math.max(0, initialScene);
    this.lockScene = lockScene;
    this.sceneElapsed = 0;
    this.clearTimer = 0;
    this.clearDelaySec = 3.0;
    this.fadeState = 'idle'; // 'idle' | 'fading_out' | 'fading_in'
    this.fadeTimer = 0;
    this.fadeDuration = 0.35;
    this.eventsFired = new Set();
    this.actors = {};
    this.scenes = this.buildScenes();
    if (this.sceneIndex >= this.scenes.length) {
      this.sceneIndex = 0;
    }
  }

  start() {
    this.loadScene(this.sceneIndex);
    this.fadeState = 'fading_in';
    this.fadeTimer = this.fadeDuration;
    this.onFade(1);
  }

  once(key, fn) {
    if (this.eventsFired.has(key)) return;
    this.eventsFired.add(key);
    fn();
  }

  cellToWorld(row, col) {
    return this.engine.gridToWorld(row, col);
  }

  configureLoadout({ cannon, chassis, frame, engine: eng, armor, aps = 0, missiles = 0, reconDrone = false, missileFpv = false }) {
    const { engine } = this;
    engine.setHardMode(false);
    engine.setMissileFpvEnabled(Boolean(missileFpv));
    engine.missileAmmo = missiles;
    engine.apsAmmo = [0, 0, 0, 0];
    if (aps > 0) engine.addApsRounds(aps);
    engine.reconDroneOwned = reconDrone;
    engine.reconDroneCooldown = 0;
    engine.cannonAmmo = engine.getPlayerMaxCannonAmmo?.() ?? 36;
    engine.credits = 9999;
    engine.applyUpgrades({ cannon, chassis, frame, engine: eng, armor });
    engine.recomputePlayerStats(false);
    engine.playerHp = engine.playerMaxHp;
    engine.syncApsVisuals?.();
    engine.emitHudUpdate?.();
  }

  placePlayer(row, col, hullAngle = 0, turretAngle = hullAngle) {
    const { engine } = this;
    const pos = this.cellToWorld(row, col);
    engine.playerX = pos.x;
    engine.playerZ = pos.z;
    engine.playerVx = 0;
    engine.playerVz = 0;
    engine.touchMoveX = 0;
    engine.touchMoveY = 0;
    engine.playerHullAngle = hullAngle;
    engine.playerTurretAngle = turretAngle;
    engine.camCurrentLook.set(pos.x, 0, pos.z);
    engine.aimWorld.set(pos.x + Math.sin(turretAngle) * 12, 0, pos.z + Math.cos(turretAngle) * 12);
    if (engine.playerRig) {
      engine.playerRig.root.position.set(pos.x, 0, pos.z);
      engine.playerRig.hull.rotation.y = hullAngle;
      engine.playerRig.turret.rotation.y = turretAngle;
    }
  }

  spawnActor(key, enemyClass, row, col, { hullAngle = 0, turretAngle = hullAngle, hp = null, isBoss = false, fireDelay = 1.0, worldSpeed = null } = {}) {
    const { engine } = this;
    const pos = this.cellToWorld(row, col);
    const enemy = engine.createEnemyAt(enemyClass, pos.x, pos.z, isBoss);
    if (!enemy) return null;
    enemy.scripted = true;
    enemy.scriptedFireTimer = fireDelay;
    enemy.scriptedRouteIdx = 0;
    enemy.scriptedWorldSpeed = worldSpeed;
    enemy.hullAngle = hullAngle;
    enemy.turretAngle = turretAngle;
    if (hp !== null) {
      enemy.hp = hp;
      enemy.maxHp = hp;
    }
    if (isBoss) {
      engine.bossActive = true;
      engine.bossUnit = enemy;
    }
    this.actors[key] = enemy;
    return enemy;
  }

  steerActor(actor, targetRow, targetCol, dt, speedScale = 1.0) {
    if (!actor || actor.hp <= 0 || actor._removed) return false;
    const target = this.cellToWorld(targetRow, targetCol);
    const dx = target.x - actor.x;
    const dz = target.z - actor.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.25) return true;
    const desiredHull = Math.atan2(dx, dz);
    actor.hullAngle = stepAngleTowards(actor.hullAngle, desiredHull, 4.0 * dt);
    const moveSpeed = actor.scriptedWorldSpeed ?? ((actor.stats?.moveSpeed ?? 2.2) * TILE_SIZE * speedScale);
    const step = Math.min(dist, moveSpeed * dt);
    actor.x += (dx / dist) * step;
    actor.z += (dz / dist) * step;
    return false;
  }

  followActorRoute(actor, waypoints, dt, speedScale = 1.0) {
    if (!actor || actor.hp <= 0 || actor._removed || !waypoints?.length) return false;
    const idx = Math.min(actor.scriptedRouteIdx || 0, waypoints.length - 1);
    const [r, c] = waypoints[idx];
    const reached = this.steerActor(actor, r, c, dt, speedScale);
    if (reached && idx < waypoints.length - 1) {
      actor.scriptedRouteIdx = idx + 1;
    }
    return reached && idx === waypoints.length - 1;
  }

  aimAndAutoFireActor(actor, intervalSec, dt, { homing = false, spread = 0.5 } = {}) {
    if (!actor || actor.hp <= 0 || actor._removed) return;
    const { engine } = this;
    const canSeePlayer =
      !engine.inSmoke &&
      (!engine.inForest || Math.hypot(engine.playerX - actor.x, engine.playerZ - actor.z) <= 8.5) &&
      engine.hasLineOfSight(actor.x, actor.z, engine.playerX, engine.playerZ);

    const desired = canSeePlayer
      ? Math.atan2(engine.playerX - actor.x, engine.playerZ - actor.z)
      : actor.hullAngle;
    actor.turretAngle = stepAngleTowards(actor.turretAngle, desired, 3.6 * dt);
    actor.scriptedFireTimer = (actor.scriptedFireTimer ?? intervalSec) - dt;
    if (actor.scriptedFireTimer <= 0) {
      actor.scriptedFireTimer = intervalSec;
      if (!canSeePlayer) return;
      const offsetAngle = (Math.random() - 0.5) * spread * 0.2;
      actor.turretAngle = desired + offsetAngle;
      actor.fireCooldown = 0;
      engine.enemyCombat.fireEnemyWeapon(actor, { homing });
    }
  }

  loadScene(index) {
    const { engine } = this;
    this.sceneIndex = index % this.scenes.length;
    this.sceneElapsed = 0;
    this.clearTimer = 0;
    this.eventsFired.clear();
    this.actors = {};

    engine.keys = {};
    engine.touchMoveX = 0;
    engine.touchMoveY = 0;
    engine.isMouseDown = false;
    engine.setHardMode(false);
    engine.loadSector(this.sectorIndex, true);
    engine.status = GameStatus.PLAYING;
    engine.bossActive = false;
    engine.bossUnit = null;
    engine.cameraPreset = 'ISOMETRIC';

    const scene = this.scenes[this.sceneIndex];
    scene.setup();
    engine.emitHudUpdate?.();
  }

  step(dt) {
    const { engine } = this;
    if (engine.status !== GameStatus.PLAYING && !engine.airSupportTargeting) {
      engine.status = GameStatus.PLAYING;
    }
    if (engine.playerHp < engine.playerMaxHp * 0.35) {
      engine.playerHp = engine.playerMaxHp * 0.35;
    }
    if ((engine.cannonAmmo ?? 0) < 10) {
      engine.cannonAmmo = engine.getPlayerMaxCannonAmmo?.() ?? 36;
    }

    if (this.fadeState === 'fading_out') {
      this.fadeTimer += dt;
      const p = Math.min(1, this.fadeTimer / this.fadeDuration);
      this.onFade(p);
      if (p >= 1) {
        const nextIdx = this.lockScene ? this.sceneIndex : (this.sceneIndex + 1) % this.scenes.length;
        this.loadScene(nextIdx);
        this.fadeState = 'fading_in';
        this.fadeTimer = 0;
      }
      return;
    }

    if (this.fadeState === 'fading_in') {
      this.fadeTimer += dt;
      const p = Math.max(0, 1 - this.fadeTimer / this.fadeDuration);
      this.onFade(p);
      if (p <= 0) {
        this.fadeState = 'idle';
      }
    }

    const scene = this.scenes[this.sceneIndex];
    this.sceneElapsed += dt;
    scene.update(this.sceneElapsed, dt);

    // Transition 3.0 seconds after the last enemy tank in the scene is destroyed
    const anyAlive = engine.enemies.some((e) => e && e.hp > 0 && !e._removed);
    if (!anyAlive && this.sceneElapsed > 0.5) {
      this.clearTimer += dt;
      if (this.clearTimer >= this.clearDelaySec && this.fadeState === 'idle') {
        this.fadeState = 'fading_out';
        this.fadeTimer = 0;
      }
    } else {
      this.clearTimer = 0;
    }
  }

  buildScenes() {
    const { engine } = this;

    // 1. Forest Convoy Ambush — 4-tank convoy marching single-file along Tiergarten forest edge (row 18)
    const forestAmbush = {
      setup: () => {
        this.configureLoadout({ cannon: 3, chassis: 3, frame: 3, engine: 3, armor: 3, missiles: 4 });
        // Player concealed in Tiergarten forest (row 16, col 8) overlooking the east-west avenue
        this.placePlayer(16, 8, 0, 0);
        engine.cameraAzimuth = Math.PI * 0.25;
        engine.frustumSize = 25;
        engine.updateCameraProjection?.();

        const convoySpeed = 2.7;
        this.spawnActor('c1', EnemyClass.SCOUT, 18, 16, { hullAngle: -Math.PI / 2, turretAngle: -Math.PI / 2, worldSpeed: convoySpeed, fireDelay: 0.9 });
        this.spawnActor('c2', EnemyClass.STANDARD, 18, 19, { hullAngle: -Math.PI / 2, turretAngle: -Math.PI / 2, worldSpeed: convoySpeed, fireDelay: 1.1 });
        this.spawnActor('c3', EnemyClass.SAPPER, 18, 22, { hullAngle: -Math.PI / 2, turretAngle: -Math.PI / 2, worldSpeed: convoySpeed, fireDelay: 1.3 });
        this.spawnActor('c4', EnemyClass.ARMOR, 18, 25, { hullAngle: -Math.PI / 2, turretAngle: -Math.PI / 2, worldSpeed: convoySpeed, fireDelay: 1.5 });
        engine.setStatusBanner('HIGHLIGHT 01 // TIERGARTEN CONVOY AMBUSH', 2.6);
      },
      update: (_t, dt) => {
        const { c1, c2, c3, c4 } = this.actors;
        this.followActorRoute(c1, [[18, 2], [17, 16]], dt);
        this.followActorRoute(c2, [[18, 4], [17, 18]], dt);
        this.followActorRoute(c3, [[18, 6], [17, 20]], dt);
        this.followActorRoute(c4, [[18, 8], [17, 22]], dt);

        this.aimAndAutoFireActor(c1, 1.5, dt);
        this.aimAndAutoFireActor(c2, 1.6, dt);
        this.aimAndAutoFireActor(c3, 1.8, dt);
        this.aimAndAutoFireActor(c4, 1.9, dt);
      },
    };

    // 2. Urban Corner-Peek & Brick Breach (East of Brandenburg Gate, brick wall at col 27)
    const urbanCorner = {
      setup: () => {
        this.configureLoadout({ cannon: 4, chassis: 3, frame: 3, engine: 4, armor: 3, aps: 6, missiles: 3 });
        this.placePlayer(23, 25, Math.PI / 2, Math.PI / 2);
        engine.cameraAzimuth = Math.PI * 0.25;
        engine.frustumSize = 25;
        engine.updateCameraProjection?.();
        this.spawnActor('std', EnemyClass.STANDARD, 22, 29, { hullAngle: -Math.PI / 2, fireDelay: 0.8 });
        this.spawnActor('sapper', EnemyClass.SAPPER, 23, 30, { hullAngle: -Math.PI / 2, fireDelay: 1.0 });
        this.spawnActor('armor', EnemyClass.ARMOR, 22, 32, { hullAngle: -Math.PI / 2, fireDelay: 1.2 });
        this.spawnActor('striker', EnemyClass.STRIKER, 25, 31, { hullAngle: -Math.PI / 2, fireDelay: 1.4 });
        engine.setStatusBanner('HIGHLIGHT 02 // URBAN CORNER PEEK & BREACH', 2.6);
      },
      update: (_t, dt) => {
        const { std, sapper, armor, striker } = this.actors;
        this.followActorRoute(armor, [[22, 29]], dt, 0.55);
        this.followActorRoute(striker, [[25, 27]], dt, 0.6);

        this.aimAndAutoFireActor(std, 1.5, dt);
        this.aimAndAutoFireActor(sapper, 1.6, dt);
        this.aimAndAutoFireActor(armor, 1.7, dt);
        this.aimAndAutoFireActor(striker, 2.2, dt, { homing: true });
      },
    };

    // 3. All-Terrain Lake Assault (Tiergarten Lake rows 8..12, cols 5..9)
    const riverCrossing = {
      setup: () => {
        this.configureLoadout({ cannon: 4, chassis: 4, frame: 4, engine: 4, armor: 4, missiles: 4 });
        this.placePlayer(14, 7, Math.PI, Math.PI);
        engine.cameraAzimuth = Math.PI * 0.25;
        engine.frustumSize = 26;
        engine.updateCameraProjection?.();
        this.spawnActor('scout', EnemyClass.SCOUT, 9, 9, { hullAngle: Math.PI, fireDelay: 0.8 });
        this.spawnActor('flame', EnemyClass.FLAMETHROWER, 7, 10, { hullAngle: Math.PI, fireDelay: 0.9 });
        this.spawnActor('armor', EnemyClass.ARMOR, 6, 12, { hullAngle: -Math.PI / 2, fireDelay: 1.1 });
        this.spawnActor('howie', EnemyClass.HOWITZER, 6, 14, { hullAngle: -Math.PI * 0.25, fireDelay: 1.4 });
        engine.setStatusBanner('HIGHLIGHT 03 // ALL-TERRAIN LAKE ASSAULT', 2.6);
      },
      update: (t, dt) => {
        const { scout, flame, armor, howie } = this.actors;
        this.followActorRoute(flame, [[8, 9]], dt, 0.5);
        this.followActorRoute(armor, [[6, 10]], dt, 0.55);

        this.aimAndAutoFireActor(scout, 1.5, dt);
        this.aimAndAutoFireActor(flame, 1.0, dt);
        this.aimAndAutoFireActor(armor, 1.7, dt);

        if (t > 1.5 && howie && howie.hp > 0) {
          this.once('howie_barrage_1', () => {
            engine.enemyCombat.triggerEnemyArtilleryBarrage(howie, this.cellToWorld(11, 7));
          });
        }
        if (t > 5.5 && howie && howie.hp > 0) {
          this.once('howie_barrage_2', () => {
            engine.enemyCombat.triggerEnemyArtilleryBarrage(howie, this.cellToWorld(9, 7));
          });
        }
      },
    };

    // 4. ATGM + Missile FPV (Open Boulevard row 17..18 past Brandenburg Gate)
    const atgmFpv = {
      setup: () => {
        this.configureLoadout({ cannon: 5, chassis: 4, frame: 4, engine: 4, armor: 4, missiles: 8, missileFpv: true });
        this.placePlayer(17, 10, Math.PI / 2, Math.PI / 2);
        engine.cameraAzimuth = Math.PI * 0.25;
        engine.frustumSize = 27;
        engine.updateCameraProjection?.();
        this.spawnActor('target', EnemyClass.ARMOR, 17, 25, { hullAngle: -Math.PI / 2, fireDelay: 1.0 });
        this.spawnActor('striker', EnemyClass.STRIKER, 18, 28, { hullAngle: -Math.PI / 2, fireDelay: 1.3 });
        this.spawnActor('std', EnemyClass.STANDARD, 17, 30, { hullAngle: -Math.PI / 2, fireDelay: 1.5 });
        engine.setStatusBanner('HIGHLIGHT 04 // ATGM MISSILE FPV [RIGHT CLICK / SPACE]', 3.0);
      },
      update: (_t, dt) => {
        const { target, striker, std } = this.actors;
        this.followActorRoute(target, [[17, 19]], dt, 0.55);
        this.followActorRoute(striker, [[18, 22]], dt, 0.55);
        this.followActorRoute(std, [[17, 24]], dt, 0.6);

        this.aimAndAutoFireActor(target, 1.7, dt);
        this.aimAndAutoFireActor(striker, 2.2, dt, { homing: true });
        this.aimAndAutoFireActor(std, 1.6, dt);
      },
    };

    // 5. Recon Drone + Air Strike (Fuel Barrel & Oil Depot rows 14..15, cols 31..34)
    const reconAirStrike = {
      setup: () => {
        this.configureLoadout({ cannon: 5, chassis: 4, frame: 4, engine: 4, armor: 4, missiles: 6, reconDrone: true });
        this.placePlayer(17, 23, Math.PI * 0.35, Math.PI * 0.35);
        engine.cameraAzimuth = Math.PI * 0.25;
        engine.frustumSize = 28;
        engine.updateCameraProjection?.();
        this.spawnActor('e1', EnemyClass.STANDARD, 14, 30, { hullAngle: Math.PI, fireDelay: 0.9 });
        this.spawnActor('e2', EnemyClass.SAPPER, 15, 32, { hullAngle: -Math.PI / 2, fireDelay: 1.1 });
        this.spawnActor('e3', EnemyClass.HOWITZER, 14, 35, { hullAngle: -Math.PI / 2, fireDelay: 1.3 });
        this.spawnActor('e4', EnemyClass.FLAMETHROWER, 16, 33, { hullAngle: Math.PI, fireDelay: 1.0 });
        this.spawnActor('e5', EnemyClass.STRIKER, 15, 35, { hullAngle: -Math.PI / 2, fireDelay: 1.2 });
        engine.setStatusBanner('HIGHLIGHT 05 // RECON DRONE [3] & AIR STRIKE [4]', 3.0);
      },
      update: (_t, dt) => {
        const { e1, e2, e4, e5 } = this.actors;
        this.aimAndAutoFireActor(e1, 1.6, dt);
        this.aimAndAutoFireActor(e2, 1.8, dt);
        this.aimAndAutoFireActor(e4, 1.1, dt);
        this.aimAndAutoFireActor(e5, 2.2, dt, { homing: true });
      },
    };

    // 6. BOSS_MAMMOTH & Escort Climax Duel (Unter den Linden Boulevard rows 25..26)
    const bossMammoth = {
      setup: () => {
        this.configureLoadout({
          cannon: 5,
          chassis: 5,
          frame: 5,
          engine: 5,
          armor: 5,
          aps: 16,
          missiles: 8,
          reconDrone: true,
        });
        this.placePlayer(25, 11, Math.PI / 2, Math.PI / 2);
        engine.cameraAzimuth = Math.PI * 0.25;
        engine.frustumSize = 27;
        engine.updateCameraProjection?.();
        this.spawnActor('escort1', EnemyClass.STANDARD, 25, 21, { hullAngle: -Math.PI / 2, fireDelay: 0.8 });
        this.spawnActor('escort2', EnemyClass.STRIKER, 26, 23, { hullAngle: -Math.PI / 2, fireDelay: 1.0 });
        this.spawnActor('boss', EnemyClass.BOSS_MAMMOTH, 26, 28, {
          hullAngle: -Math.PI / 2,
          hp: 180,
          isBoss: true,
          fireDelay: 1.0,
        });
        engine.setStatusBanner('FINAL HIGHLIGHT // BOSS: MAMMOTH MK-V', 3.0);
      },
      update: (t, dt) => {
        const { escort1, escort2, boss } = this.actors;
        this.followActorRoute(escort1, [[25, 16]], dt, 0.65);
        this.followActorRoute(escort2, [[26, 18]], dt, 0.6);

        this.aimAndAutoFireActor(escort1, 1.5, dt);
        this.aimAndAutoFireActor(escort2, 2.0, dt, { homing: true });

        if (boss && boss.hp > 0) {
          this.followActorRoute(boss, [[26, 20]], dt, 0.45);
          this.aimAndAutoFireActor(boss, 1.7, dt);

          if (t > 3.5) {
            this.once('boss_missile_1', () => {
              engine.enemyCombat.fireBossMissileSalvo(boss, 2, { x: engine.playerX, z: engine.playerZ });
            });
          }
          if (boss.hp <= boss.maxHp * 0.5 && !boss.phaseShieldTriggered) {
            boss.phaseShieldTriggered = true;
            engine.bossCombat.triggerPhaseTransition(boss, 'shield');
          }
          if (t > 9.0) {
            this.once('boss_missile_2', () => {
              engine.enemyCombat.fireBossMissileSalvo(boss, 2, { x: engine.playerX, z: engine.playerZ });
            });
          }
        }
      },
    };

    return [forestAmbush, urbanCorner, riverCrossing, atgmFpv, reconAirStrike, bossMammoth];
  }
}
