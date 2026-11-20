import * as THREE from 'three';
import { t } from '../../i18n/index.js';
import { apsInterceptCost } from '../../sim/aps.js';
import { determineHitAspect } from '../../sim/ballistics.js';
import { CANNONS } from '../components/cannons.js';
import {
  AIR_SUPPORT,
  ARTILLERY,
  BULLET_POWER,
  DURABILITY,
  INFERNO,
  LAND_MINE,
  TANK_HIT_RADIUS,
  computeEffectiveDamage,
} from '../constants.js';
import { GRID_SIZE, TILE_SIZE } from '../levels.js';
import { disposeOwned, markOwned } from '../render/dispose.js';
import { sound } from '../sound.js';
import { GameStatus, TileType } from '../types.js';

const STRIKE_VARIANTS = Object.freeze({
  STRIKE_BOMBS: AIR_SUPPORT.STRIKE_BOMBS,
  STRIKE_THERMO: AIR_SUPPORT.STRIKE_THERMO,
  STRIKE_AC130: AIR_SUPPORT.STRIKE_AC130,
});

const EMPTY_MINE_SURFACES = new Set([
  TileType.EMPTY,
  TileType.ROAD,
  TileType.SAND,
  TileType.GRASS,
  TileType.ICE,
  TileType.STONE,
  TileType.RUBBLE,
  TileType.CRATER,
]);

const AC130_DESTRUCTIBLE_TILES = new Set([
  TileType.BOXES,
  TileType.BARREL,
  TileType.BRICK,
  TileType.CONCRETE,
  TileType.HOUSE_1,
  TileType.HOUSE_2,
]);

/**
 * Manages tactical Air Support calls (Air Strike, Air Repair, Air Mines, Air Drop),
 * paused map-targeting UI state, and active airborne entities.
 */
export class AirSupportController {
  constructor(engine) {
    this.engine = engine;
  }

  getTargetingConfig(type, strikeVariant = 'STRIKE_BOMBS') {
    if (type === 'STRIKE') {
      return STRIKE_VARIANTS[strikeVariant] || AIR_SUPPORT.STRIKE_BOMBS;
    }
    if (type === 'MINES') return AIR_SUPPORT.MINES;
    if (type === 'AIRDROP') return AIR_SUPPORT.AIRDROP;
    return null;
  }

  getTargetingRadiusWorld(type, strikeVariant) {
    if (type === 'STRIKE') {
      const cfg = this.getTargetingConfig('STRIKE', strikeVariant);
      return (cfg.radiusCells || 2) * TILE_SIZE;
    }
    if (type === 'MINES') return AIR_SUPPORT.MINES.zoneHalfCells * TILE_SIZE;
    return 1.3 * TILE_SIZE;
  }

  canAfford(cost) {
    return (this.engine.playerSave?.credits ?? 0) >= cost;
  }

  spendCredits(cost) {
    const { engine } = this;
    if (!engine.playerSave || (engine.playerSave.credits ?? 0) < cost) return false;
    engine.playerSave.credits -= cost;
    engine.profileSave?.save?.();
    return true;
  }

  /** Returns an off-map launch coordinate on the player's base side. */
  getAlliedSideLaunchPos(targetX, targetZ) {
    const { engine } = this;
    const halfSpan = (GRID_SIZE * TILE_SIZE) / 2;
    const baseCell = engine.baseCell || { row: GRID_SIZE - 1, col: Math.floor(GRID_SIZE / 2) };
    const baseWorld = engine.gridToWorld
      ? engine.gridToWorld(baseCell.row, baseCell.col)
      : { x: 0, z: halfSpan - TILE_SIZE };
    const edgeZ = baseCell.row < GRID_SIZE / 2 ? -halfSpan - 12 : halfSpan + 12;
    const startX = THREE.MathUtils.clamp((baseWorld.x + targetX) * 0.5, -halfSpan, halfSpan);
    return { x: startX, z: edgeZ };
  }

  startTargeting(type, strikeVariant = 'STRIKE_BOMBS') {
    const { engine } = this;
    if (engine.status !== GameStatus.PLAYING && !engine.airSupportTargeting) return false;
    if (engine.playerHp <= DURABILITY.ZERO_HP || engine.isHangarOpen || engine.isAdPaused) {
      return false;
    }

    const cfg = this.getTargetingConfig(type, strikeVariant);
    if (!cfg) return false;

    if (type !== 'STRIKE' && !this.canAfford(cfg.cost)) {
      engine.setStatusBanner(t('INSUFFICIENT CREDITS (${cost})', { cost: cfg.cost }), 2.0);
      return false;
    }
    if (type === 'STRIKE') {
      const minStrikeCost = Math.min(
        AIR_SUPPORT.STRIKE_BOMBS.cost,
        AIR_SUPPORT.STRIKE_THERMO.cost,
        AIR_SUPPORT.STRIKE_AC130.cost
      );
      if (!this.canAfford(minStrikeCost)) {
        engine.setStatusBanner(t('INSUFFICIENT CREDITS (${cost})', { cost: minStrikeCost }), 2.0);
        return false;
      }
    }

    if (!engine.airSupportTargeting) {
      engine.airSupportPrePauseStatus = engine.status;
      engine.status = GameStatus.PAUSED;
      engine.keys = {};
      engine.isMouseDown = false;
      engine.airCamTarget = {
        x: engine.camCurrentLook?.x ?? engine.playerX,
        z: engine.camCurrentLook?.z ?? engine.playerZ,
      };
      engine.syncAudioPauseState?.();
    }

    engine.airSupportTargeting = {
      type,
      strikeVariant: type === 'STRIKE' ? cfg.id : 'STRIKE_BOMBS',
    };
    this.createOrUpdateReticle(engine.aimWorld?.x ?? engine.playerX, engine.aimWorld?.z ?? engine.playerZ);
    engine.emitHudUpdate?.();
    return true;
  }

  setStrikeVariant(variant) {
    const { engine } = this;
    if (!engine.airSupportTargeting || engine.airSupportTargeting.type !== 'STRIKE') return false;
    if (!STRIKE_VARIANTS[variant]) return false;
    engine.airSupportTargeting.strikeVariant = variant;
    this.createOrUpdateReticle(engine.aimWorld?.x ?? engine.playerX, engine.aimWorld?.z ?? engine.playerZ);
    engine.emitHudUpdate?.();
    return true;
  }

  cancelTargeting() {
    const { engine } = this;
    if (!engine.airSupportTargeting) return false;
    engine.airSupportTargeting = null;
    engine.airCamTarget = null;
    this.removeReticle();
    if (engine.airSupportPrePauseStatus === GameStatus.PLAYING && engine.status === GameStatus.PAUSED) {
      engine.status = GameStatus.PLAYING;
      engine.syncAudioPauseState?.();
    }
    engine.airSupportPrePauseStatus = null;
    engine.emitHudUpdate?.();
    return true;
  }

  confirmTargeting(x, z) {
    const { engine } = this;
    const targeting = engine.airSupportTargeting;
    if (!targeting) return false;
    const cfg = this.getTargetingConfig(targeting.type, targeting.strikeVariant);
    if (!cfg) return false;

    if (!this.canAfford(cfg.cost)) {
      engine.setStatusBanner(t('INSUFFICIENT CREDITS (${cost})', { cost: cfg.cost }), 2.0);
      return false;
    }

    this.spendCredits(cfg.cost);
    const { type, strikeVariant } = targeting;
    engine.airSupportTargeting = null;
    engine.airCamTarget = null;
    this.removeReticle();
    if (engine.airSupportPrePauseStatus === GameStatus.PLAYING && engine.status === GameStatus.PAUSED) {
      engine.status = GameStatus.PLAYING;
      engine.syncAudioPauseState?.();
    }
    engine.airSupportPrePauseStatus = null;

    if (type === 'STRIKE') {
      this.launchAirStrike(strikeVariant, x, z);
    } else if (type === 'MINES') {
      this.launchAirMines(x, z);
    } else if (type === 'AIRDROP') {
      this.launchAirDropAt(x, z);
    }
    engine.emitHudUpdate?.();
    return true;
  }

  createOrUpdateReticle(x, z) {
    const { engine } = this;
    const targeting = engine.airSupportTargeting;
    if (!targeting || !engine.fxGroup) return;
    this.removeReticle();

    const radius = this.getTargetingRadiusWorld(targeting.type, targeting.strikeVariant);
    const color =
      targeting.type === 'STRIKE'
        ? targeting.strikeVariant === 'STRIKE_THERMO'
          ? 0xf97316
          : targeting.strikeVariant === 'STRIKE_AC130'
          ? 0x38bdf8
          : 0xef4444
        : targeting.type === 'MINES'
        ? 0xf59e0b
        : 0x10b981;

    const group = new THREE.Group();
    if (targeting.type === 'MINES') {
      const boxGeo = new THREE.RingGeometry(radius * 1.15 - 0.16, radius * 1.15, 4);
      boxGeo.rotateX(-Math.PI / 2);
      boxGeo.rotateY(Math.PI / 4);
      const fillGeo = new THREE.CircleGeometry(radius * 1.15, 4);
      fillGeo.rotateX(-Math.PI / 2);
      fillGeo.rotateY(Math.PI / 4);
      group.add(
        new THREE.Mesh(
          boxGeo,
          new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
        ),
        new THREE.Mesh(
          fillGeo,
          new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.18 })
        )
      );
    } else {
      const ringGeo = new THREE.RingGeometry(Math.max(0.2, radius - 0.16), radius, 36);
      ringGeo.rotateX(-Math.PI / 2);
      const fillGeo = new THREE.CircleGeometry(radius, 36);
      fillGeo.rotateX(-Math.PI / 2);
      group.add(
        new THREE.Mesh(
          ringGeo,
          new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
        ),
        new THREE.Mesh(
          fillGeo,
          new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.18 })
        )
      );
    }

    group.position.set(x, 0.1, z);
    markOwned(group);
    engine.fxGroup.add(group);
    this._reticleGroup = group;
  }

  updateReticlePosition(x, z) {
    if (this._reticleGroup) {
      this._reticleGroup.position.set(x, 0.1, z);
    }
  }

  removeReticle() {
    if (this._reticleGroup) {
      this.engine.fxGroup?.remove?.(this._reticleGroup);
      disposeOwned(this._reticleGroup);
      this._reticleGroup = null;
    }
  }

  /** Spawns an invulnerable repair drone that restores all damaged subsystems and +20 HP. */
  callAirRepair() {
    const { engine } = this;
    if (engine.status !== GameStatus.PLAYING) return false;
    if (engine.playerHp <= DURABILITY.ZERO_HP || engine.isHangarOpen || engine.isAdPaused) {
      return false;
    }
    const cfg = AIR_SUPPORT.REPAIR;
    if (!this.canAfford(cfg.cost)) {
      engine.setStatusBanner(t('INSUFFICIENT CREDITS (${cost})', { cost: cfg.cost }), 2.0);
      return false;
    }
    this.spendCredits(cfg.cost);

    const launch = this.getAlliedSideLaunchPos(engine.playerX, engine.playerZ);
    const droneRig = this.createRepairDroneMesh();
    if (droneRig && engine.fxGroup) {
      droneRig.position.set(launch.x, 7.5, launch.z);
      engine.fxGroup.add(droneRig);
    }

    engine.airSupportMissions ||= [];
    engine.airSupportMissions.push({
      kind: 'REPAIR_DRONE',
      x: launch.x,
      y: 7.5,
      z: launch.z,
      exitX: launch.x,
      exitZ: launch.z,
      phase: 'approach',
      timer: 0,
      duration: cfg.durationSec,
      healRemaining: cfg.healAmount,
      subsystemsRepaired: false,
      sparkAcc: 0,
      mesh: droneRig,
    });
    engine.setStatusBanner(t('REPAIR DRONE DISPATCHED — INBOUND TO YOUR POSITION'), 2.8);
    engine.emitHudUpdate?.();
    return true;
  }

  launchAirStrike(variant, targetX, targetZ) {
    const { engine } = this;
    engine.airSupportMissions ||= [];
    const launch = this.getAlliedSideLaunchPos(targetX, targetZ);

    if (variant === 'STRIKE_BOMBS') {
      const cfg = AIR_SUPPORT.STRIKE_BOMBS;
      const dx = targetX - launch.x;
      const dz = targetZ - launch.z;
      const len = Math.hypot(dx, dz) || 1;
      const dirX = dx / len;
      const dirZ = dz / len;
      const bomberSpeed = 28;
      const altitude = 20;
      const leadDist = bomberSpeed * cfg.flightSec * 0.45;

      // High-altitude bomber flyby passing over the target zone
      const bomberStartX = targetX - dirX * (leadDist + 24);
      const bomberStartZ = targetZ - dirZ * (leadDist + 24);
      const bomberMesh = this.createBomberMesh();
      if (bomberMesh && engine.fxGroup) {
        bomberMesh.position.set(bomberStartX, altitude, bomberStartZ);
        bomberMesh.rotation.y = Math.atan2(dirX, dirZ);
        engine.fxGroup.add(bomberMesh);
      }
      engine.airSupportMissions.push({
        kind: 'BOMBER_FLYBY',
        x: bomberStartX,
        y: altitude,
        z: bomberStartZ,
        vx: dirX * bomberSpeed,
        vz: dirZ * bomberSpeed,
        life: 3.6,
        mesh: bomberMesh,
      });

      for (let i = 0; i < cfg.bombCount; i++) {
        const dropOffset = (i - 1) * cfg.scatterCells * TILE_SIZE * 0.85;
        const lateral = (Math.random() - 0.5) * cfg.scatterCells * TILE_SIZE * 0.7;
        const bx = targetX + dirX * dropOffset - dirZ * lateral;
        const bz = targetZ + dirZ * dropOffset + dirX * lateral;
        // Bomb releases from the bomber ahead of the target and falls along a ballistic curve
        const releaseX = bx - dirX * leadDist;
        const releaseZ = bz - dirZ * leadDist;
        engine.airSupportMissions.push({
          kind: 'AIR_ORDNANCE',
          ordnanceType: 'BOMB',
          startX: releaseX,
          startY: altitude - 0.5,
          startZ: releaseZ,
          targetX: bx,
          targetZ: bz,
          radius: cfg.radiusCells * TILE_SIZE,
          damage: cfg.damage,
          penetration: cfg.penetration,
          delay: 0.75 + i * cfg.staggerSec,
          timer: cfg.flightSec,
          maxTimer: cfg.flightSec,
          spawned: false,
          mesh: null,
          ringMesh: null,
        });
      }
      engine.setStatusBanner(t('AIR STRIKE INBOUND — 3× BOMBS ON TARGET'), 2.8);
    } else if (variant === 'STRIKE_THERMO') {
      const cfg = AIR_SUPPORT.STRIKE_THERMO;
      engine.airSupportMissions.push({
        kind: 'AIR_ORDNANCE',
        ordnanceType: 'THERMO',
        startX: launch.x,
        startY: 11,
        startZ: launch.z,
        targetX,
        targetZ,
        radius: cfg.radiusCells * TILE_SIZE,
        damage: cfg.damage,
        penetration: 25,
        delay: 0,
        timer: cfg.flightSec,
        maxTimer: cfg.flightSec,
        spawned: false,
        mesh: null,
        ringMesh: null,
      });
      engine.setStatusBanner(t('THERMOBARIC MISSILE LAUNCHED — STAND CLEAR'), 2.8);
    } else if (variant === 'STRIKE_AC130') {
      const cfg = AIR_SUPPORT.STRIKE_AC130;
      const zoneMesh = this.createAc130ZoneRing(targetX, targetZ, cfg.radiusCells * TILE_SIZE);
      engine.airSupportMissions.push({
        kind: 'AC130',
        x: targetX,
        z: targetZ,
        radius: cfg.radiusCells * TILE_SIZE,
        orbitRadius: (GRID_SIZE * TILE_SIZE) * 0.25, // Circle diameter = half the map
        orbitHeight: 24,
        duration: cfg.durationSec,
        elapsed: 0,
        fireTimer: 0.25,
        fireInterval: cfg.fireIntervalSec,
        orbitAngle: Math.random() * Math.PI * 2,
        zoneMesh,
        mesh: null,
      });
      engine.setStatusBanner(t('AC-130 SPOOKY ON STATION — 15s FIRE SUPPORT'), 3.0);
    }
  }

  launchAirMines(targetX, targetZ) {
    const { engine } = this;
    const cfg = AIR_SUPPORT.MINES;
    const launch = this.getAlliedSideLaunchPos(targetX, targetZ);
    const half = cfg.zoneHalfCells * TILE_SIZE;
    engine.airSupportMissions ||= [];

    // 3x3 grid with jitter across the ~5x5 cell carpet zone
    let index = 0;
    for (let gy = -1; gy <= 1; gy++) {
      for (let gx = -1; gx <= 1; gx++) {
        const mx = targetX + gx * (half * 0.68) + (Math.random() - 0.5) * TILE_SIZE * 0.65;
        const mz = targetZ + gy * (half * 0.68) + (Math.random() - 0.5) * TILE_SIZE * 0.65;
        const flight = cfg.flightSec + index * 0.06;
        engine.airSupportMissions.push({
          kind: 'AIR_MINE',
          startX: launch.x,
          startY: 16,
          startZ: launch.z,
          targetX: mx,
          targetZ: mz,
          timer: flight,
          maxTimer: flight,
          mesh: null,
        });
        index++;
      }
    }
    engine.setStatusBanner(t('AIR MINES DEPLOYED — CARPET MINEFIELD INBOUND'), 2.8);
  }

  launchAirDropAt(targetX, targetZ) {
    const { engine } = this;
    const cfg = AIR_SUPPORT.AIRDROP;
    const ctrl = engine.powerupsController;
    let dropPos = { x: targetX, z: targetZ };
    let gridPos = engine.worldToGrid ? engine.worldToGrid(targetX, targetZ) : null;
    const cell =
      gridPos && gridPos.row >= 0 && gridPos.row < GRID_SIZE && gridPos.col >= 0 && gridPos.col < GRID_SIZE
        ? engine.grid?.[gridPos.row]?.[gridPos.col]
        : null;
    if (ctrl && (!cell || !ctrl.isAirDropLandingCell(cell) || !ctrl.isAirDropPosFree(targetX, targetZ))) {
      const shifted = ctrl.findNearestFreeAirDropPos?.(targetX, targetZ);
      if (shifted) {
        dropPos = shifted;
        gridPos = engine.worldToGrid ? engine.worldToGrid(shifted.x, shifted.z) : gridPos;
      }
    }
    const drop = ctrl?.spawnAirDrop({
      shells: cfg.shells,
      aps: cfg.aps,
      missiles: cfg.missiles,
      repairKits: cfg.repairKits,
      spawnCell: gridPos,
    });
    if (drop) {
      drop.x = dropPos.x;
      drop.z = dropPos.z;
      drop.targetX = dropPos.x;
      drop.targetZ = dropPos.z;
      drop.rig?.root?.position?.set?.(dropPos.x, 0, dropPos.z);
    }
  }

  update(dt, elapsed) {
    const { engine } = this;
    const missions = engine.airSupportMissions;
    if (!missions || missions.length === 0) return;

    for (let i = missions.length - 1; i >= 0; i--) {
      const m = missions[i];
      if (m.kind === 'REPAIR_DRONE') {
        if (this.updateRepairDrone(m, dt, elapsed)) {
          this.disposeMissionVisuals(m);
          missions.splice(i, 1);
        }
      } else if (m.kind === 'AIR_ORDNANCE') {
        if (this.updateAirOrdnance(m, dt, elapsed)) {
          this.disposeMissionVisuals(m);
          missions.splice(i, 1);
        }
      } else if (m.kind === 'AC130') {
        if (this.updateAc130(m, dt, elapsed)) {
          this.disposeMissionVisuals(m);
          missions.splice(i, 1);
        }
      } else if (m.kind === 'AIR_MINE') {
        if (this.updateAirMine(m, dt)) {
          this.disposeMissionVisuals(m);
          missions.splice(i, 1);
        }
      } else if (m.kind === 'BOMBER_FLYBY') {
        m.life -= dt;
        m.x += m.vx * dt;
        m.z += m.vz * dt;
        if (m.mesh) {
          m.mesh.position.set(m.x, m.y, m.z);
        }
        if (m.life <= 0) {
          this.disposeMissionVisuals(m);
          missions.splice(i, 1);
        }
      }
    }
  }

  spinDroneRotors(mesh, dt) {
    if (!mesh?.userData?.rotors) return;
    for (let i = 0; i < mesh.userData.rotors.length; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      mesh.userData.rotors[i].rotation.y += dir * dt * 28;
    }
  }

  updateRepairDrone(m, dt, elapsed) {
    const { engine } = this;
    this.spinDroneRotors(m.mesh, dt);
    if (m.phase === 'approach') {
      const dx = engine.playerX - m.x;
      const dz = engine.playerZ - m.z;
      const dist = Math.hypot(dx, dz);
      const speed = 22;
      if (dist <= 1.2 || engine.playerHp <= DURABILITY.ZERO_HP) {
        m.phase = 'repairing';
        m.timer = 0;
        if (!m.subsystemsRepaired && engine.playerHp > DURABILITY.ZERO_HP) {
          this.repairPlayerSubsystems();
          m.subsystemsRepaired = true;
        }
      } else {
        const step = Math.min(dist, speed * dt);
        m.x += (dx / dist) * step;
        m.z += (dz / dist) * step;
        m.y = THREE.MathUtils.lerp(m.y, 2.7, Math.min(1, dt * 4));
        if (m.mesh) {
          m.mesh.position.set(m.x, m.y, m.z);
          m.mesh.rotation.y = Math.atan2(dx, dz);
        }
      }
      return false;
    }

    if (m.phase === 'repairing') {
      m.timer += dt;
      if (engine.playerHp > DURABILITY.ZERO_HP) {
        const healStep = Math.min(
          m.healRemaining,
          (AIR_SUPPORT.REPAIR.healAmount / m.duration) * dt
        );
        if (healStep > 0) {
          m.healRemaining -= healStep;
          engine.playerHp = Math.min(engine.playerMaxHp, engine.playerHp + healStep);
        }
        m.x = engine.playerX;
        m.z = engine.playerZ;
        m.y = 2.6 + Math.sin(elapsed * 5) * 0.15;
        if (m.mesh) {
          m.mesh.position.set(m.x, m.y, m.z);
          m.mesh.rotation.y = elapsed * 2.5;
        }
        m.sparkAcc += dt;
        if (m.sparkAcc >= 0.16) {
          m.sparkAcc = 0;
          engine.fx?.repair?.(engine.playerX, 0.9, engine.playerZ, 4);
        }
      }
      if (m.timer >= m.duration || engine.playerHp <= DURABILITY.ZERO_HP) {
        if (engine.playerHp > DURABILITY.ZERO_HP && m.healRemaining > 0) {
          engine.playerHp = Math.min(engine.playerMaxHp, engine.playerHp + m.healRemaining);
          m.healRemaining = 0;
        }
        m.phase = 'depart';
        m.timer = 0;
      }
      return false;
    }

    // Depart phase
    m.timer += dt;
    const dx = m.exitX - m.x;
    const dz = m.exitZ - m.z;
    const dist = Math.hypot(dx, dz) || 1;
    m.x += (dx / dist) * 26 * dt;
    m.z += (dz / dist) * 26 * dt;
    m.y += 6 * dt;
    if (m.mesh) {
      m.mesh.position.set(m.x, m.y, m.z);
      m.mesh.rotation.y = Math.atan2(dx, dz);
    }
    return m.timer >= 1.8 || dist < 1.5;
  }

  repairPlayerSubsystems() {
    const { engine } = this;
    for (const sub of Object.values(engine.subsystems || {})) {
      sub.hp = sub.maxHp;
      sub.status = 'normal';
      sub.fieldRepairState = 'idle';
      sub.fieldRepairTimer = 0;
      sub.fieldRepairProgress = 0;
    }
  }

  updateAirOrdnance(m, dt, elapsed) {
    const { engine } = this;
    if (m.delay > 0) {
      m.delay -= dt;
      return false;
    }

    if (!m.spawned) {
      m.spawned = true;
      if (engine.fxGroup) {
        const isThermo = m.ordnanceType === 'THERMO';
        const ringGeo = new THREE.RingGeometry(Math.max(0.2, m.radius - 0.14), m.radius, 28);
        ringGeo.rotateX(-Math.PI / 2);
        m.ringMesh = new THREE.Mesh(
          ringGeo,
          new THREE.MeshBasicMaterial({
            color: isThermo ? 0xf97316 : 0xef4444,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85,
          })
        );
        m.ringMesh.position.set(m.targetX, 0.08, m.targetZ);
        markOwned(m.ringMesh);
        engine.fxGroup.add(m.ringMesh);

        m.mesh = isThermo
          ? this.createThermobaricMissileMesh()
          : this.createBombMesh();
        m.mesh.position.set(m.startX, m.startY, m.startZ);
        markOwned(m.mesh);
        engine.fxGroup.add(m.mesh);
      }
    }

    m.timer -= dt;
    const progress = Math.min(1, Math.max(0, 1 - m.timer / m.maxTimer));
    const isBomb = m.ordnanceType === 'BOMB';
    // Bombs decelerate slightly horizontally and accelerate downward under gravity (y = y0 - g*t^2/2)
    const horizT = isBomb ? 1 - (1 - progress) * (1 - progress) * 0.25 - progress * 0.25 + progress * 0.25 : progress;
    const curX = THREE.MathUtils.lerp(m.startX, m.targetX, isBomb ? Math.pow(progress, 0.85) : horizT);
    const curZ = THREE.MathUtils.lerp(m.startZ, m.targetZ, isBomb ? Math.pow(progress, 0.85) : horizT);
    const curY = THREE.MathUtils.lerp(m.startY, 0.35, progress * progress);

    if (m.mesh) {
      m.mesh.position.set(curX, curY, curZ);
      m.mesh.rotation.order = 'YXZ';
      m.mesh.rotation.y = Math.atan2(m.targetX - m.startX, m.targetZ - m.startZ);
      if (isBomb) {
        // Pitch gradually from horizontal at release toward near-vertical at impact
        m.mesh.rotation.x = THREE.MathUtils.lerp(0.15, Math.PI * 0.44, progress);
      } else {
        const horizDist = Math.hypot(m.targetX - m.startX, m.targetZ - m.startZ) || 1;
        const dy = -2 * (m.startY - 0.35) * progress;
        m.mesh.rotation.x = Math.atan2(-dy, horizDist);
      }
    }
    if (m.ringMesh) {
      m.ringMesh.visible = Math.floor(elapsed * ARTILLERY.MARKER_BLINK_RATE * 2) % 2 === 0;
    }
    if (!isBomb && progress > 0.05) {
      engine.fx?.shellSmokeTrail?.(curX, curY, curZ, true);
    }

    if (m.timer <= 0) {
      if (m.ordnanceType === 'THERMO') {
        engine.explosions?.detonateThermobaricAt(m.targetX, m.targetZ, m.radius, m.damage, true);
        this.applyFriendlyFireBlast(m.targetX, m.targetZ, m.radius, m.damage, 25, INFERNO.EDGE_DAMAGE_RATIO);
      } else {
        engine.detonateExplosionAt(
          m.targetX,
          m.targetZ,
          m.radius,
          m.damage,
          true,
          null,
          false,
          m.penetration,
          'AIR_BOMB'
        );
        this.applyFriendlyFireBlast(
          m.targetX,
          m.targetZ,
          m.radius,
          m.damage,
          m.penetration,
          ARTILLERY.EDGE_DAMAGE_RATIO
        );
      }
      return true;
    }
    return false;
  }

  /** Friendly fire blast check for Air Strike ordnance and surface-detonated Air Mines. */
  applyFriendlyFireBlast(x, z, radius, damage, penetration, edgeDamageRatio) {
    const { engine } = this;
    if (engine.playerHp <= DURABILITY.ZERO_HP) return;
    const dist = Math.hypot(engine.playerX - x, engine.playerZ - z);
    if (dist <= radius + TANK_HIT_RADIUS.PLAYER) {
      const edgeRatio = dist > radius * 0.5 ? edgeDamageRatio : 1.0;
      const eff = computeEffectiveDamage(
        damage * edgeRatio,
        penetration,
        engine.explosions?.blastSideArmor(
          engine.playerStats,
          engine.playerX,
          engine.playerZ,
          engine.playerHullAngle,
          x,
          z
        ) ?? 0
      );
      engine.damagePlayer(eff, { zone: 'hull', aspect: determineHitAspect(
        { x: engine.playerX, z: engine.playerZ, hullYaw: engine.playerHullAngle || 0 },
        { x, z },
        'hull'
      ) });
    }
  }

  updateAc130(m, dt) {
    m.elapsed += dt;
    // Clockwise orbit around the target zone at half-map diameter, high out of view
    m.orbitAngle += dt * 0.55;
    const orbitR = m.orbitRadius ?? (GRID_SIZE * TILE_SIZE) * 0.25;
    const gunshipX = m.x + Math.cos(m.orbitAngle) * orbitR;
    const gunshipZ = m.z + Math.sin(m.orbitAngle) * orbitR;

    m.fireTimer -= dt;
    if (m.fireTimer <= 0 && m.elapsed < m.duration) {
      m.fireTimer = m.fireInterval;
      const target = this.pickAc130Target(m.x, m.z, m.radius);
      if (target) {
        this.fireAc130Shell(gunshipX, gunshipZ, target.x, target.z, m.orbitHeight ?? 24);
      }
    }

    return m.elapsed >= m.duration;
  }

  pickAc130Target(zoneX, zoneZ, radius) {
    const { engine } = this;
    // Priority 1: Live enemies in radius
    let bestEnemy = null;
    let bestDist = Infinity;
    for (const e of engine.enemies || []) {
      if (!e || e.hp <= 0) continue;
      const d = Math.hypot(e.x - zoneX, e.z - zoneZ);
      if (d <= radius && d < bestDist) {
        bestDist = d;
        bestEnemy = e;
      }
    }
    if (bestEnemy) return { x: bestEnemy.x, z: bestEnemy.z };

    // Priority 2: Defense turrets in radius
    for (const turret of engine.defenseTurrets || []) {
      if (!turret.alive) continue;
      if (Math.hypot(turret.x - zoneX, turret.z - zoneZ) <= radius) {
        return { x: turret.x, z: turret.z };
      }
    }

    // Priority 3: Enemy Base
    if (engine.enemyBaseAlive && engine._enemyBaseCell) {
      const eb = engine.gridToWorld(engine._enemyBaseCell.row, engine._enemyBaseCell.col);
      if (Math.hypot(eb.x - zoneX, eb.z - zoneZ) <= radius + TILE_SIZE) {
        return eb;
      }
    }

    // Priority 4: Mines or destructible obstacles in radius
    for (const mine of engine.mines || []) {
      if (Math.hypot(mine.x - zoneX, mine.z - zoneZ) <= radius) {
        return { x: mine.x, z: mine.z };
      }
    }
    const candidates = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = engine.grid?.[r]?.[c];
        if (!cell || !AC130_DESTRUCTIBLE_TILES.has(cell.type)) continue;
        const pos = engine.gridToWorld(r, c);
        if (Math.hypot(pos.x - zoneX, pos.z - zoneZ) <= radius) {
          candidates.push(pos);
        }
      }
    }
    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return null;
  }

  fireAc130Shell(startX, startZ, targetX, targetZ, startHeight = 24) {
    const { engine } = this;
    const gun = CANNONS.CANNON_Mk2;
    const dx = targetX - startX;
    const dz = targetZ - startZ;
    const dist = Math.hypot(dx, dz) || 1;
    const dirX = dx / dist;
    const dirZ = dz / dist;

    // Check if an enemy APS intercepts this CANNON_Mk2 shell
    const cost = apsInterceptCost({ weaponId: 'CANNON_Mk2', isMissile: false });
    for (const enemy of engine.enemies || []) {
      if (!enemy || enemy.hp <= 0 || !(enemy.apsCharges >= cost)) continue;
      if (Math.hypot(enemy.x - targetX, enemy.z - targetZ) <= 2.8 * TILE_SIZE) {
        enemy.apsCharges -= cost;
        engine.fx?.apsIntercept?.(enemy.x, 1.0, enemy.z, targetX, 1.0, targetZ);
        sound.playApsIntercept?.({ x: targetX, z: targetZ });
        return;
      }
    }

    sound.playCannon?.(false, { x: startX, z: startZ });
    engine.spawnProjectile?.(
      startX,
      startZ,
      dirX,
      dirZ,
      true,
      gun.damage,
      gun.penetration,
      BULLET_POWER.STANDARD,
      Math.max(gun.bulletSpeed, 34),
      false,
      'CANNON_Mk2',
      {
        flightY: startHeight,
        targetFlightY: 0.2,
        flightDist: dist,
        canHitPlayer: true,
      }
    );
  }

  updateAirMine(m, dt) {
    const { engine } = this;
    if (!m.mesh && engine.modelFactory?.createLandMineMesh && engine.fxGroup) {
      m.mesh = engine.modelFactory.createLandMineMesh();
      m.mesh.position.set(m.startX, m.startY, m.startZ);
      engine.fxGroup.add(m.mesh);
    }

    m.timer -= dt;
    const progress = Math.min(1, Math.max(0, 1 - m.timer / m.maxTimer));
    const curX = THREE.MathUtils.lerp(m.startX, m.targetX, progress);
    const curZ = THREE.MathUtils.lerp(m.startZ, m.targetZ, progress);
    const curY = THREE.MathUtils.lerp(m.startY, 0.05, progress * progress);
    if (m.mesh) {
      m.mesh.position.set(curX, curY, curZ);
      m.mesh.rotation.y += dt * 4;
    }

    if (m.timer <= 0) {
      this.resolveAirMineLanding(m.targetX, m.targetZ);
      return true;
    }
    return false;
  }

  isWaterCell(cell) {
    if (!cell || cell.type === TileType.BRIDGE) return false;
    return cell.type === TileType.WATER || cell.surface === TileType.WATER;
  }

  isWaterAtPoint(x, z) {
    const { engine } = this;
    if (!engine.worldToGrid || !engine.grid) return false;
    const offsets = [
      [0, 0],
      [0.45, 0],
      [-0.45, 0],
      [0, 0.45],
      [0, -0.45],
    ];
    for (const [ox, oz] of offsets) {
      const gp = engine.worldToGrid(x + ox, z + oz);
      if (gp.row < 0 || gp.row >= GRID_SIZE || gp.col < 0 || gp.col >= GRID_SIZE) continue;
      if (this.isWaterCell(engine.grid?.[gp.row]?.[gp.col])) return true;
    }
    return false;
  }

  /**
   * Resolves a falling air mine:
   * - Water: sinks/destroys immediately without planting.
   * - Empty open surface (no tank/turret/base/mine/obstacle): plants neutral mine.
   * - Anything else (wall, box, forest, tank, turret, base, mine): detonates immediately!
   */
  resolveAirMineLanding(x, z) {
    const { engine } = this;
    const gridPos = engine.worldToGrid ? engine.worldToGrid(x, z) : null;
    const cell =
      gridPos && gridPos.row >= 0 && gridPos.row < GRID_SIZE && gridPos.col >= 0 && gridPos.col < GRID_SIZE
        ? engine.grid?.[gridPos.row]?.[gridPos.col]
        : null;

    if (!cell) return;
    if (this.isWaterAtPoint(x, z)) {
      engine.fx?.shockwave?.(x, 0.1, z, 0.2, 1.1, 0x38bdf8, 0.35);
      engine.fx?.shellSmokeTrail?.(x, 0.25, z, false);
      return;
    }

    const occupiedByTank =
      (engine.playerHp > DURABILITY.ZERO_HP &&
        Math.hypot(engine.playerX - x, engine.playerZ - z) <= TANK_HIT_RADIUS.PLAYER + 0.45) ||
      (engine.enemies || []).some(
        (e) =>
          e &&
          e.hp > 0 &&
          Math.hypot(e.x - x, e.z - z) <= (e.hitRadius ?? TANK_HIT_RADIUS.DEFAULT) + 0.45
      );
    const occupiedByMine = (engine.mines || []).some(
      (other) => other && Math.hypot(other.x - x, other.z - z) <= TILE_SIZE * 0.55
    );
    const isEmptyCell =
      EMPTY_MINE_SURFACES.has(cell.type) &&
      !cell.defenseTurret?.alive &&
      !occupiedByTank &&
      !occupiedByMine;

    if (isEmptyCell) {
      engine.explosions?.plantMineAt(x, z, { neutral: true, armTimer: 0.4 });
    } else {
      const blastRadius = LAND_MINE.BLAST_RADIUS_CELLS * TILE_SIZE;
      engine.fx?.shockwave?.(x, 0.1, z, 0.35, blastRadius, 0xff5a14, 0.48);
      engine.detonateExplosionAt(
        x,
        z,
        blastRadius,
        LAND_MINE.DAMAGE,
        true,
        null,
        true,
        LAND_MINE.PENETRATION
      );
      this.applyFriendlyFireBlast(
        x,
        z,
        blastRadius,
        LAND_MINE.DAMAGE,
        LAND_MINE.PENETRATION,
        ARTILLERY.EDGE_DAMAGE_RATIO
      );
    }
  }

  createAc130ZoneRing(x, z, radius) {
    const { engine } = this;
    if (!engine.fxGroup) return null;
    const ringGeo = new THREE.RingGeometry(Math.max(0.2, radius - 0.14), radius, 40);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMesh = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
      })
    );
    ringMesh.position.set(x, 0.08, z);
    markOwned(ringMesh);
    engine.fxGroup.add(ringMesh);
    return ringMesh;
  }

  createBombMesh() {
    const group = new THREE.Group();
    const oliveMat = new THREE.MeshStandardMaterial({ color: 0x3f4a3c, roughness: 0.5, metalness: 0.55 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.35 });
    const finMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55, metalness: 0.65 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.72, 10), oliveMat);
    body.rotation.x = Math.PI / 2;

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), oliveMat);
    nose.scale.set(1, 1, 1.3);
    nose.position.z = 0.36;

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.09, 10), bandMat);
    band.rotation.x = Math.PI / 2;
    band.position.z = 0.24;

    const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.26, 10), finMat);
    tailCone.rotation.x = -Math.PI / 2;
    tailCone.position.z = -0.46;

    group.add(body, nose, band, tailCone);

    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.28, 0.22), finMat);
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      fin.position.set(Math.cos(angle) * 0.16, Math.sin(angle) * 0.16, -0.44);
      fin.rotation.z = angle + Math.PI / 2;
      group.add(fin);
    }

    markOwned(group);
    return group;
  }

  createBomberMesh() {
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.6 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.55 });
    const cockpitMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.4 });

    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 3.6, 10), hullMat);
    fuselage.rotation.x = Math.PI / 2;

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.85, 10), hullMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 2.2;

    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.65), cockpitMat);
    cockpit.position.set(0, 0.24, 1.35);

    const mainWing = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.12, 1.15), wingMat);
    mainWing.position.set(0, 0.06, 0.15);

    const tailWing = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.6), wingMat);
    tailWing.position.set(0, 0.1, -1.55);

    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 0.75), hullMat);
    tailFin.position.set(0, 0.45, -1.5);

    group.add(fuselage, nose, cockpit, mainWing, tailWing, tailFin);
    markOwned(group);
    return group;
  }

  createThermobaricMissileMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.65 });
    const warheadMat = new THREE.MeshStandardMaterial({
      color: 0xea580c,
      emissive: 0x7c2d12,
      emissiveIntensity: 0.45,
      roughness: 0.35,
      metalness: 0.4,
    });
    const finMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.7 });
    const nozzleMat = new THREE.MeshBasicMaterial({ color: 0xff6b1a });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.15, 12), bodyMat);
    body.rotation.x = Math.PI / 2;

    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 12), warheadMat);
    cone.rotation.x = Math.PI / 2;
    cone.position.z = 0.78;

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.14, 12), warheadMat);
    band.rotation.x = Math.PI / 2;
    band.position.z = 0.42;

    const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 10), nozzleMat);
    nozzle.rotation.x = -Math.PI / 2;
    nozzle.position.z = -0.68;

    group.add(body, cone, band, nozzle);

    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.28), finMat);
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      fin.position.set(Math.cos(angle) * 0.2, Math.sin(angle) * 0.2, -0.42);
      fin.rotation.z = angle + Math.PI / 2;
      group.add(fin);
    }

    markOwned(group);
    return group;
  }

  createRepairDroneMesh() {
    if (!this.engine.fxGroup) return null;
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.6 });
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.55 });
    const tealMat = new THREE.MeshStandardMaterial({
      color: 0x2dd4bf,
      emissive: 0x0d9488,
      emissiveIntensity: 0.65,
      roughness: 0.3,
    });
    const rotorMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.7 });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.22, 0.85), hullMat);
    const topPod = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.16, 10), armorMat);
    topPod.position.y = 0.16;

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0x2dd4bf }));
    beacon.position.y = 0.28;

    const weldPod = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.06, 0.22, 8), tealMat);
    weldPod.position.set(0, -0.18, 0.15);

    group.add(chassis, topPod, beacon, weldPod);

    const rotors = [];
    const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
    for (const a of armAngles) {
      const armX = Math.cos(a) * 0.62;
      const armZ = Math.sin(a) * 0.62;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.72), armorMat);
      arm.position.set(armX * 0.5, 0.04, armZ * 0.5);
      arm.rotation.y = Math.atan2(armX, armZ);

      const shroud = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 6, 16), hullMat);
      shroud.rotation.x = Math.PI / 2;
      shroud.position.set(armX, 0.06, armZ);

      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.015, 0.07), rotorMat);
      blade.position.set(armX, 0.08, armZ);
      rotors.push(blade);

      group.add(arm, shroud, blade);
    }

    group.userData.rotors = rotors;
    markOwned(group);
    return group;
  }

  disposeMissionVisuals(m) {
    const { engine } = this;
    if (m.mesh) {
      engine.fxGroup?.remove?.(m.mesh);
      disposeOwned(m.mesh);
      m.mesh = null;
    }
    if (m.ringMesh) {
      engine.fxGroup?.remove?.(m.ringMesh);
      disposeOwned(m.ringMesh);
      m.ringMesh = null;
    }
    if (m.zoneMesh) {
      engine.fxGroup?.remove?.(m.zoneMesh);
      disposeOwned(m.zoneMesh);
      m.zoneMesh = null;
    }
  }

  clear() {
    const { engine } = this;
    this.removeReticle();
    engine.airSupportTargeting = null;
    engine.airSupportPrePauseStatus = null;
    engine.airCamTarget = null;
    for (const m of engine.airSupportMissions || []) {
      this.disposeMissionVisuals(m);
    }
    engine.airSupportMissions = [];
  }
}
