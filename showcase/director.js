import * as THREE from 'three';
import { normalizeAngleSigned, stepAngleTowards } from '../public/src/sim/ai.js';
import { TILE_SIZE } from '../public/src/game/levels.js';
import { EnemyClass, GameStatus } from '../public/src/game/types.js';

/**
 * Deterministic highlight director for the promo showcase reel.
 * Runs 6 choreographed tactical scenes on a continuous loop:
 * 1. Forest Ambush (Stealth + Flank Strike)
 * 2. Urban Corner-Peek & Brick Destruction
 * 3. River/Ford Crossing + Flamethrower & Howitzer
 * 4. ATGM + Missile FPV Strike
 * 5. Recon Drone + Air Strike
 * 6. BOSS_MAMMOTH Climax Duel
 */
export class ShowcaseDirector {
  constructor(engine, sectorIndex, { onFade } = {}) {
    this.engine = engine;
    this.sectorIndex = sectorIndex;
    this.onFade = onFade || (() => {});
    this.sceneIndex = 0;
    this.sceneElapsed = 0;
    this.fadeState = 'idle'; // 'idle' | 'fading_out' | 'fading_in'
    this.fadeTimer = 0;
    this.fadeDuration = 0.35;
    this.eventsFired = new Set();
    this.actors = {};
    this.scenes = this.buildScenes();
  }

  start() {
    this.loadScene(0);
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

  configureLoadout({ cannon, chassis, frame, engine: eng, armor, aps = 0, missiles = 0, reconDrone = false }) {
    const { engine } = this;
    engine.missileAmmo = missiles;
    engine.apsAmmo = aps;
    engine.reconDroneOwned = reconDrone;
    engine.reconDroneCooldown = 0;
    engine.playerCannonAmmo = engine.getPlayerMaxCannonAmmo?.() ?? 20;
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
    engine.playerHullAngle = hullAngle;
    engine.playerTurretAngle = turretAngle;
    engine.camCurrentLook.set(pos.x, 0, pos.z);
    engine.aimWorld.set(pos.x + Math.sin(turretAngle) * 10, 0, pos.z + Math.cos(turretAngle) * 10);
    if (engine.playerRig) {
      engine.playerRig.root.position.set(pos.x, 0, pos.z);
      engine.playerRig.hull.rotation.y = hullAngle;
      engine.playerRig.turret.rotation.y = turretAngle;
    }
  }

  spawnActor(key, enemyClass, row, col, { hullAngle = 0, turretAngle = hullAngle, hp = null, isBoss = false } = {}) {
    const { engine } = this;
    const pos = this.cellToWorld(row, col);
    const enemy = engine.createEnemyAt(enemyClass, pos.x, pos.z, isBoss);
    if (!enemy) return null;
    enemy.scripted = true;
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
    actor.hullAngle = stepAngleTowards(actor.hullAngle, desiredHull, 3.6 * dt);
    const moveSpeed = (actor.stats?.moveSpeed ?? 2.2) * TILE_SIZE * speedScale;
    const step = Math.min(dist, moveSpeed * dt);
    actor.x += (dx / dist) * step;
    actor.z += (dz / dist) * step;
    return false;
  }

  aimActorAt(actor, tx, tz, dt, turnRate = 4.2) {
    if (!actor || actor.hp <= 0 || actor._removed) return;
    const desired = Math.atan2(tx - actor.x, tz - actor.z);
    actor.turretAngle = stepAngleTowards(actor.turretAngle, desired, turnRate * dt);
  }

  fireActorAt(actor, tx, tz) {
    if (!actor || actor.hp <= 0 || actor._removed) return;
    actor.turretAngle = Math.atan2(tx - actor.x, tz - actor.z);
    actor.fireCooldown = 0;
    this.engine.enemyCombat.fireEnemyWeapon(actor, { homing: false });
  }

  drivePlayer({ keys = {}, aimX, aimZ, fire = false } = {}, dt) {
    const { engine } = this;
    engine.keys = keys;
    if (Number.isFinite(aimX) && Number.isFinite(aimZ)) {
      const alpha = 1 - Math.exp(-8 * dt);
      engine.aimWorld.x = THREE.MathUtils.lerp(engine.aimWorld.x, aimX, alpha);
      engine.aimWorld.z = THREE.MathUtils.lerp(engine.aimWorld.z, aimZ, alpha);
    }
    engine.isMouseDown = Boolean(fire);
  }

  lerpCamera({ azimuth, frustumSize }, dt, speed = 2.2) {
    const { engine } = this;
    const alpha = 1 - Math.exp(-speed * dt);
    if (Number.isFinite(azimuth)) {
      const diff = normalizeAngleSigned(azimuth - engine.cameraAzimuth);
      engine.cameraAzimuth += diff * alpha;
    }
    if (Number.isFinite(frustumSize) && Math.abs(engine.frustumSize - frustumSize) > 0.01) {
      engine.frustumSize = THREE.MathUtils.lerp(engine.frustumSize, frustumSize, alpha);
      engine.updateCameraProjection?.();
    }
  }

  loadScene(index) {
    const { engine } = this;
    this.sceneIndex = index % this.scenes.length;
    this.sceneElapsed = 0;
    this.eventsFired.clear();
    this.actors = {};

    engine.keys = {};
    engine.isMouseDown = false;
    engine.setMissileFpvEnabled(false);
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
    if (engine.status !== GameStatus.PLAYING) {
      engine.status = GameStatus.PLAYING;
    }

    if (this.fadeState === 'fading_out') {
      this.fadeTimer += dt;
      const p = Math.min(1, this.fadeTimer / this.fadeDuration);
      this.onFade(p);
      if (p >= 1) {
        this.loadScene((this.sceneIndex + 1) % this.scenes.length);
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

    if (this.sceneElapsed >= scene.duration && this.fadeState === 'idle') {
      engine.keys = {};
      engine.isMouseDown = false;
      this.fadeState = 'fading_out';
      this.fadeTimer = 0;
    }
  }

  buildScenes() {
    const { engine } = this;

    // 1. Forest Ambush (Stealth + Flank Strike)
    const forestAmbush = {
      duration: 10.5,
      setup: () => {
        this.configureLoadout({ cannon: 2, chassis: 2, frame: 2, engine: 2, armor: 2 });
        this.placePlayer(30, 8, 0.25, 0.4);
        engine.cameraAzimuth = Math.PI * 0.25;
        engine.frustumSize = 26;
        engine.updateCameraProjection?.();
        this.spawnActor('scout', EnemyClass.SCOUT, 27, 15, { hullAngle: -Math.PI / 2, hp: 36 });
        this.spawnActor('std', EnemyClass.STANDARD, 27, 17, { hullAngle: -Math.PI / 2, hp: 48 });
        engine.setStatusBanner('HIGHLIGHT 01 // FOREST AMBUSH', 2.6);
      },
      update: (t, dt) => {
        const { scout, std } = this.actors;
        this.steerActor(scout, 27, 8, dt, 0.85);
        this.steerActor(std, 27, 11, dt, 0.78);
        this.lerpCamera({ azimuth: 0.92, frustumSize: 22 }, dt, 1.4);

        const target = scout && scout.hp > 0 ? scout : std;
        const aimPos = target && target.hp > 0 ? { x: target.x, z: target.z } : this.cellToWorld(25, 10);

        if (t < 2.4) {
          this.drivePlayer({ aimX: aimPos.x, aimZ: aimPos.z, fire: false }, dt);
        } else if (t < 4.5) {
          this.drivePlayer({ keys: { KeyW: true }, aimX: aimPos.x, aimZ: aimPos.z, fire: true }, dt);
        } else {
          this.drivePlayer({ keys: { KeyW: t < 5.5 }, aimX: aimPos.x, aimZ: aimPos.z, fire: true }, dt);
        }
      },
    };

    // 2. Urban Corner-Peek & Brick Destruction
    const urbanCorner = {
      duration: 11.5,
      setup: () => {
        this.configureLoadout({ cannon: 3, chassis: 3, frame: 3, engine: 3, armor: 3 });
        this.placePlayer(23, 18, 0, 0.35);
        engine.cameraAzimuth = 0.72;
        engine.frustumSize = 25;
        engine.updateCameraProjection?.();
        this.spawnActor('std', EnemyClass.STANDARD, 19, 20, { hullAngle: Math.PI, hp: 46 });
        this.spawnActor('armor', EnemyClass.ARMOR, 18, 22, { hullAngle: Math.PI, hp: 72 });
        engine.setStatusBanner('HIGHLIGHT 02 // CORNER PEEK & BREACH', 2.6);
      },
      update: (t, dt) => {
        const { std, armor } = this.actors;
        if (std && std.hp > 0) this.aimActorAt(std, engine.playerX, engine.playerZ, dt);
        if (armor && armor.hp > 0) this.aimActorAt(armor, engine.playerX, engine.playerZ, dt);

        this.lerpCamera({ azimuth: 0.98, frustumSize: 23 }, dt, 1.2);

        if (t > 3.6 && t < 3.8) {
          this.once('armor_shot', () => this.fireActorAt(armor, engine.playerX, engine.playerZ));
        }
        if (t > 6.2 && t < 6.4) {
          this.once('armor_shot2', () => this.fireActorAt(armor, engine.playerX, engine.playerZ));
        }

        const barrelPos = this.cellToWorld(19, 21);
        const primary = std && std.hp > 0 ? std : armor;
        const aimX = t < 2.2 ? barrelPos.x : primary ? primary.x : barrelPos.x;
        const aimZ = t < 2.2 ? barrelPos.z : primary ? primary.z : barrelPos.z;

        if (t < 1.0) {
          this.drivePlayer({ aimX, aimZ, fire: false }, dt);
        } else if (t < 3.2) {
          // Peek out past concrete corner and blast brick + barrel
          this.drivePlayer({ keys: { KeyW: true, KeyD: true }, aimX, aimZ, fire: true }, dt);
        } else if (t < 4.7) {
          // Pull back into cover as enemy fires
          this.drivePlayer({ keys: { KeyS: true, KeyA: true }, aimX, aimZ, fire: false }, dt);
        } else {
          // Re-peek and finish plaza defenders
          this.drivePlayer({ keys: { KeyW: t < 6.0, KeyD: t < 5.6 }, aimX, aimZ, fire: true }, dt);
        }
      },
    };

    // 3. River/Ford Crossing (CH4) + Flamethrower & Howitzer
    const riverCrossing = {
      duration: 12.5,
      setup: () => {
        this.configureLoadout({ cannon: 4, chassis: 4, frame: 4, engine: 4, armor: 4 });
        this.placePlayer(24, 27, Math.PI / 2, Math.PI / 2);
        engine.cameraAzimuth = 0.65;
        engine.frustumSize = 27;
        engine.updateCameraProjection?.();
        this.spawnActor('flame', EnemyClass.FLAMETHROWER, 23, 33, { hullAngle: -Math.PI / 2, hp: 52 });
        this.spawnActor('howie', EnemyClass.HOWITZER, 19, 34, { hullAngle: -Math.PI * 0.75, hp: 50 });
        engine.setStatusBanner('HIGHLIGHT 03 // ALL-TERRAIN RIVER ASSAULT', 2.6);
      },
      update: (t, dt) => {
        const { flame, howie } = this.actors;
        if (flame && flame.hp > 0) {
          this.steerActor(flame, 24, 32, dt, 0.55);
          this.aimActorAt(flame, engine.playerX, engine.playerZ, dt);
        }
        if (howie && howie.hp > 0) {
          this.aimActorAt(howie, engine.playerX, engine.playerZ, dt);
        }
        if (t > 2.2) {
          this.once('howie_barrage', () => {
            if (howie && howie.hp > 0) {
              const behind = this.cellToWorld(24, 28);
              engine.enemyCombat.triggerEnemyArtilleryBarrage(howie, behind);
            }
          });
        }
        if (t > 3.2 && t < 3.4) {
          this.once('flame_burst', () => this.fireActorAt(flame, engine.playerX, engine.playerZ));
        }

        this.lerpCamera({ azimuth: 1.05, frustumSize: 24 }, dt, 1.3);
        const target = flame && flame.hp > 0 ? flame : howie;
        const aim = target && target.hp > 0 ? { x: target.x, z: target.z } : this.cellToWorld(21, 34);
        this.drivePlayer({ keys: { KeyW: t < 7.2 }, aimX: aim.x, aimZ: aim.z, fire: t > 1.4 }, dt);
      },
    };

    // 4. ATGM + Missile FPV Strike
    const atgmFpv = {
      duration: 9.5,
      setup: () => {
        this.configureLoadout({ cannon: 4, chassis: 4, frame: 4, engine: 4, armor: 4, missiles: 4 });
        this.placePlayer(9, 11, Math.PI / 2, Math.PI / 2);
        engine.cameraAzimuth = 0.78;
        engine.frustumSize = 28;
        engine.updateCameraProjection?.();
        this.spawnActor('target', EnemyClass.ARMOR, 7, 25, { hullAngle: Math.PI, hp: 55 });
        engine.setStatusBanner('HIGHLIGHT 04 // ATGM MISSILE FPV', 2.4);
      },
      update: (t, dt) => {
        const { target } = this.actors;
        if (target && target.hp > 0) {
          this.steerActor(target, 11, 25, dt, 0.75);
        }
        const aim = target && target.hp > 0 ? { x: target.x, z: target.z } : this.cellToWorld(10, 25);
        this.drivePlayer({ aimX: aim.x, aimZ: aim.z, fire: false }, dt);

        if (t > 1.1) {
          this.once('launch_fpv_atgm', () => {
            engine.setMissileFpvEnabled(true);
            engine.playerController.firePlayerHomingMissile();
          });
        }
        if (t > 6.0) {
          this.once('exit_fpv', () => engine.setMissileFpvEnabled(false));
          this.lerpCamera({ azimuth: 0.9, frustumSize: 25 }, dt, 2.0);
        }
      },
    };

    // 5. Recon Drone + Air Strike
    const reconAirStrike = {
      duration: 12.0,
      setup: () => {
        this.configureLoadout({ cannon: 4, chassis: 4, frame: 4, engine: 4, armor: 4, reconDrone: true });
        this.placePlayer(11, 14, Math.PI * 0.35, Math.PI * 0.35);
        engine.cameraAzimuth = 0.78;
        engine.frustumSize = 26;
        engine.updateCameraProjection?.();
        this.spawnActor('e1', EnemyClass.STANDARD, 6, 23, { hullAngle: Math.PI, hp: 44 });
        this.spawnActor('e2', EnemyClass.SAPPER, 7, 25, { hullAngle: -Math.PI / 2, hp: 44 });
        this.spawnActor('e3', EnemyClass.HOWITZER, 6, 26, { hullAngle: Math.PI, hp: 48 });
        engine.setStatusBanner('HIGHLIGHT 05 // RECON DRONE & AIR STRIKE', 2.8);
      },
      update: (t, dt) => {
        const cluster = this.cellToWorld(6, 24);
        this.drivePlayer({ aimX: cluster.x, aimZ: cluster.z, fire: false }, dt);

        if (t > 0.9) {
          this.once('launch_recon', () => {
            engine.reconDroneController.launch(cluster.x, cluster.z);
          });
        }
        if (t > 3.6) {
          this.once('call_airstrike', () => {
            engine.airSupportController.launchAirStrike('STRIKE_BOMBS', cluster.x, cluster.z);
          });
        }
        if (t > 3.4) {
          this.lerpCamera({ azimuth: 0.85, frustumSize: 34 }, dt, 1.4);
        } else {
          this.lerpCamera({ azimuth: 0.78, frustumSize: 26 }, dt, 1.4);
        }
      },
    };

    // 6. BOSS_MAMMOTH Climax Duel (Flagship Tier 5 VANGUARD)
    const bossMammoth = {
      duration: 16.0,
      setup: () => {
        this.configureLoadout({
          cannon: 5,
          chassis: 5,
          frame: 5,
          engine: 5,
          armor: 5,
          aps: 12,
          missiles: 4,
          reconDrone: true,
        });
        this.placePlayer(10, 12, Math.PI / 2, Math.PI / 2);
        engine.cameraAzimuth = 0.75;
        engine.frustumSize = 28;
        engine.updateCameraProjection?.();
        this.spawnActor('boss', EnemyClass.BOSS_MAMMOTH, 8, 24, {
          hullAngle: -Math.PI / 2,
          hp: 210,
          isBoss: true,
        });
        engine.setStatusBanner('FINAL HIGHLIGHT // BOSS: MAMMOTH MK-V', 3.0);
      },
      update: (t, dt) => {
        const { boss } = this.actors;
        this.lerpCamera({ azimuth: 0.75 + Math.min(0.42, t * 0.03), frustumSize: 26 }, dt, 1.2);

        if (boss && boss.hp > 0) {
          this.steerActor(boss, 9, 20, dt, 0.45);
          this.aimActorAt(boss, engine.playerX, engine.playerZ, dt, 2.8);

          if (t > 1.8) {
            this.once('boss_shot_1', () => this.fireActorAt(boss, engine.playerX, engine.playerZ));
          }
          if (t > 4.2) {
            this.once('boss_missile', () => {
              engine.enemyCombat.fireBossMissileSalvo(boss, 2, {
                x: engine.playerX,
                z: engine.playerZ,
              });
            });
          }
          if (t > 6.5 && !boss.phaseShieldTriggered) {
            boss.phaseShieldTriggered = true;
            engine.bossCombat.triggerPhaseTransition(boss, 'shield');
          }
          if (t > 9.5) {
            this.once('player_atgm_finish', () => {
              engine.playerController.firePlayerHomingMissile();
            });
          }
        }

        const aim = boss && boss.hp > 0 ? { x: boss.x, z: boss.z } : this.cellToWorld(9, 20);
        const moveKeys = t < 3.5 ? { KeyW: true } : t < 7.5 ? { KeyW: true, KeyD: true } : { KeyA: true };
        this.drivePlayer({ keys: moveKeys, aimX: aim.x, aimZ: aim.z, fire: t > 1.0 }, dt);
      },
    };

    return [forestAmbush, urbanCorner, riverCrossing, atgmFpv, reconAirStrike, bossMammoth];
  }
}
