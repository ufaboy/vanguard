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
import { createProjectileVisual } from '../effects/index.js';
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
    const droneRig = this.createDroneMesh(0x2dd4bf);
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
      for (let i = 0; i < cfg.bombCount; i++) {
        const angle = (i / cfg.bombCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
        const dist = (0.35 + Math.random() * 0.65) * cfg.scatterCells * TILE_SIZE;
        const bx = targetX + Math.cos(angle) * dist;
        const bz = targetZ + Math.sin(angle) * dist;
        engine.airSupportMissions.push({
          kind: 'AIR_ORDNANCE',
          ordnanceType: 'BOMB',
          startX: launch.x + (i - 1) * 1.4,
          startY: 14,
          startZ: launch.z,
          targetX: bx,
          targetZ: bz,
          radius: cfg.radiusCells * TILE_SIZE,
          damage: cfg.damage,
          penetration: cfg.penetration,
          delay: i * cfg.staggerSec,
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
      const gunshipRig = this.createDroneMesh(0x38bdf8, 1.55);
      if (gunshipRig && engine.fxGroup) {
        gunshipRig.position.set(targetX, 13, targetZ);
        engine.fxGroup.add(gunshipRig);
      }
      engine.airSupportMissions.push({
        kind: 'AC130',
        x: targetX,
        z: targetZ,
        radius: cfg.radiusCells * TILE_SIZE,
        duration: cfg.durationSec,
        elapsed: 0,
        fireTimer: 0.25,
        fireInterval: cfg.fireIntervalSec,
        orbitAngle: 0,
        zoneMesh,
        mesh: gunshipRig,
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
      }
    }
  }

  updateRepairDrone(m, dt, elapsed) {
    const { engine } = this;
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

        m.mesh = createProjectileVisual(isThermo ? 0xff4500 : 0xffb030, {
          radius: isThermo ? 0.28 : 0.22,
          length: isThermo ? 0.7 : 0.45,
          glow: isThermo ? 1.6 : 1.2,
        });
        m.mesh.position.set(m.startX, m.startY, m.startZ);
        markOwned(m.mesh);
        engine.fxGroup.add(m.mesh);
      }
    }

    m.timer -= dt;
    const progress = Math.min(1, Math.max(0, 1 - m.timer / m.maxTimer));
    const curX = THREE.MathUtils.lerp(m.startX, m.targetX, progress);
    const curZ = THREE.MathUtils.lerp(m.startZ, m.targetZ, progress);
    const curY = THREE.MathUtils.lerp(m.startY, 0.4, progress * progress);

    if (m.mesh) {
      m.mesh.position.set(curX, curY, curZ);
      m.mesh.rotation.y = Math.atan2(m.targetX - m.startX, m.targetZ - m.startZ);
    }
    if (m.ringMesh) {
      m.ringMesh.visible = Math.floor(elapsed * ARTILLERY.MARKER_BLINK_RATE * 2) % 2 === 0;
    }
    if (progress > 0.05) {
      engine.fx?.shellSmokeTrail?.(curX, curY, curZ, m.ordnanceType === 'THERMO');
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
    const { engine } = this;
    m.elapsed += dt;
    m.orbitAngle += dt * 1.1;
    const gunshipX = m.x + Math.cos(m.orbitAngle) * Math.min(4.5, m.radius * 0.55);
    const gunshipZ = m.z + Math.sin(m.orbitAngle) * Math.min(4.5, m.radius * 0.55);
    if (m.mesh) {
      m.mesh.position.set(gunshipX, 12.5, gunshipZ);
      m.mesh.rotation.y = -m.orbitAngle;
    }

    m.fireTimer -= dt;
    if (m.fireTimer <= 0 && m.elapsed < m.duration) {
      m.fireTimer = m.fireInterval;
      const target = this.pickAc130Target(m.x, m.z, m.radius);
      if (target) {
        this.fireAc130Shell(gunshipX, gunshipZ, target.x, target.z);
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

  fireAc130Shell(startX, startZ, targetX, targetZ) {
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
        engine.fx?.apsIntercept?.(targetX, 1.0, targetZ, { color: 0x38bdf8 });
        sound.playApsIntercept?.({ x: targetX, z: targetZ });
        return;
      }
    }

    sound.playCannon?.(false, { x: startX, z: startZ });
    engine.projectilesCtrl?.spawnProjectile(
      startX,
      startZ,
      dirX,
      dirZ,
      true,
      gun.damage,
      gun.penetration,
      BULLET_POWER.STANDARD,
      gun.bulletSpeed,
      false,
      'CANNON_Mk2',
      {
        flightY: 8.5,
        targetFlightY: 0.75,
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
      engine.fx?.smoke?.(x, 0.25, z, 4);
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

  createDroneMesh(color, scale = 1.0) {
    if (!this.engine.fxGroup) return null;
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.75 * scale, 0.26 * scale, 1.1 * scale),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.55 })
    );
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(1.7 * scale, 0.08 * scale, 0.35 * scale),
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.5 })
    );
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.14 * scale, 8, 8),
      new THREE.MeshBasicMaterial({ color })
    );
    beacon.position.y = 0.2 * scale;
    group.add(body, wing, beacon);
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
