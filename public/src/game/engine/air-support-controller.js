import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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

const AIR_GLB_URLS = Object.freeze({
  bomber: './models/air_bomber.glb',
  ac130: './models/air_ac130.glb',
  repairDrone: './models/air_repair_drone.glb',
});

let airGltfLoader = null;

/**
 * Manages tactical Air Support calls (Air Strike, Air Repair, Air Mines, Air Drop),
 * paused map-targeting UI state, and active airborne entities.
 */
export class AirSupportController {
  constructor(engine) {
    this.engine = engine;
    this.glbCache = new Map();
    this.glbRequested = new Set();
    this.preloadGlbModels();
  }

  preloadGlbModels() {
    if (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      this.engine?.isSoftwareGl ||
      !this.engine?.fxGroup
    ) {
      return;
    }
    airGltfLoader ||= new GLTFLoader();
    for (const [key, relPath] of Object.entries(AIR_GLB_URLS)) {
      if (this.glbRequested.has(key) || this.glbCache.has(key)) continue;
      this.glbRequested.add(key);
      const url = document.baseURI ? new URL(relPath, document.baseURI).href : relPath;
      airGltfLoader.load(
        url,
        (gltf) => {
          if (gltf?.scene) {
            this.glbCache.set(key, gltf.scene);
          }
        },
        undefined,
        () => {}
      );
    }
  }

  cloneGlbRig(key) {
    const template = this.glbCache.get(key);
    if (!template) return null;
    const clone = template.clone(true);
    const rotors = [];
    const propellers = [];
    clone.traverse((node) => {
      if (node.name?.startsWith('Rotor_')) rotors.push(node);
      if (node.name?.startsWith('Propeller_')) propellers.push(node);
      if (!node.isMesh) return;
      if (node.geometry) node.geometry = node.geometry.clone();
      if (Array.isArray(node.material)) {
        node.material = node.material.map((m) => m.clone());
      } else if (node.material) {
        node.material = node.material.clone();
      }
      node.castShadow = true;
      node.receiveShadow = true;
    });
    if (rotors.length) clone.userData.rotors = rotors;
    if (propellers.length) clone.userData.propellers = propellers;
    markOwned(clone);
    return clone;
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
    engine.saveRepo?.savePlayerSave?.(engine.playerSave);
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
      const orbitRadius = (GRID_SIZE * TILE_SIZE) * 0.3;
      const orbitHeight = 14.5;
      const orbitAngle = Math.random() * Math.PI * 2;
      const gunshipMesh = this.createAc130Mesh();
      if (gunshipMesh && engine.fxGroup) {
        gunshipMesh.position.set(
          targetX + Math.cos(orbitAngle) * orbitRadius,
          orbitHeight,
          targetZ + Math.sin(orbitAngle) * orbitRadius
        );
        engine.fxGroup.add(gunshipMesh);
      }
      engine.airSupportMissions.push({
        kind: 'AC130',
        x: targetX,
        z: targetZ,
        radius: cfg.radiusCells * TILE_SIZE,
        orbitRadius,
        orbitHeight,
        duration: cfg.durationSec,
        elapsed: 0,
        fireTimer: 0.25,
        fireInterval: cfg.fireIntervalSec,
        orbitAngle,
        zoneMesh,
        mesh: gunshipMesh,
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
      mesh.userData.rotors[i].rotation.y += dir * dt * 32;
    }
  }

  spinAircraftProps(mesh, dt) {
    if (!mesh?.userData?.propellers) return;
    for (let i = 0; i < mesh.userData.propellers.length; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      mesh.userData.propellers[i].rotation.z += dir * dt * 36;
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
    const curX = THREE.MathUtils.lerp(m.startX, m.targetX, isBomb ? Math.pow(progress, 0.85) : progress);
    const curZ = THREE.MathUtils.lerp(m.startZ, m.targetZ, isBomb ? Math.pow(progress, 0.85) : progress);
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
    // Clockwise orbit around the target zone
    m.orbitAngle += dt * 0.55;
    const orbitR = m.orbitRadius ?? (GRID_SIZE * TILE_SIZE) * 0.3;
    const orbitH = m.orbitHeight ?? 14.5;
    const gunshipX = m.x + Math.cos(m.orbitAngle) * orbitR;
    const gunshipZ = m.z + Math.sin(m.orbitAngle) * orbitR;
    if (m.mesh) {
      m.mesh.position.set(gunshipX, orbitH, gunshipZ);
      m.mesh.rotation.order = 'YXZ';
      m.mesh.rotation.y = Math.atan2(-Math.sin(m.orbitAngle), Math.cos(m.orbitAngle));
      m.mesh.rotation.z = 0.22; // Bank wing inward during clockwise turn
      this.spinAircraftProps(m.mesh, dt);
    }

    m.fireTimer -= dt;
    if (m.fireTimer <= 0 && m.elapsed < m.duration) {
      m.fireTimer = m.fireInterval;
      const target = this.pickAc130Target(m.x, m.z, m.radius);
      if (target) {
        this.fireAc130Shell(gunshipX, gunshipZ, target.x, target.z, orbitH);
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

  /** Builds an extruded symmetric wing/stabilizer half-panel in XZ, mirrored by side (+1/-1). */
  createWingPanelGeometry(span, rootChord, tipChord, sweepBack, thickness) {
    const shape = new THREE.Shape();
    shape.moveTo(0, rootChord * 0.5);
    shape.lineTo(span, rootChord * 0.5 - sweepBack);
    shape.lineTo(span, rootChord * 0.5 - sweepBack - tipChord);
    shape.lineTo(0, -rootChord * 0.5);
    shape.closePath();

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: thickness * 0.25,
      bevelSize: 0.03,
      bevelSegments: 1,
    });
    geom.rotateX(-Math.PI / 2);
    return geom;
  }

  /** Builds a realistic swept-wing strategic jet bomber (B-1B / Tu-160 silhouette). */
  createBomberMesh() {
    const glb = this.cloneGlbRig('bomber');
    if (glb) return glb;
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.42, metalness: 0.62 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.48, metalness: 0.55 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55, metalness: 0.68 });
    const cockpitMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
      roughness: 0.18,
      metalness: 0.85,
    });
    const afterburnerMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
    const redLightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const greenLightMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });

    // Blended fuselage: tapered forward section, main body, and aft tailcone
    const fwdBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 1.5, 12), hullMat);
    fwdBody.rotation.x = Math.PI / 2;
    fwdBody.scale.set(1.15, 1, 0.85);
    fwdBody.position.z = 1.45;

    const mainBody = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.34, 2.3, 12), hullMat);
    mainBody.rotation.x = Math.PI / 2;
    mainBody.scale.set(1.22, 1, 0.82);
    mainBody.position.z = -0.35;

    const noseCone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.15, 12), darkMat);
    noseCone.rotation.x = Math.PI / 2;
    noseCone.scale.set(1.12, 1, 0.85);
    noseCone.position.z = 2.75;

    const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.85, 10), hullMat);
    tailCone.rotation.x = -Math.PI / 2;
    tailCone.position.z = -1.85;

    // Dorsal spine & ventral bomb bay recess
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 2.8), wingMat);
    spine.position.set(0, 0.32, 0.0);

    const bombBay = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 1.6), darkMat);
    bombBay.position.set(0, -0.28, 0.05);

    // Flush angled cockpit canopy
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.72), cockpitMat);
    cockpit.position.set(0, 0.29, 1.65);
    cockpit.rotation.x = 0.16;

    group.add(fwdBody, mainBody, noseCone, tailCone, spine, bombBay, cockpit);

    // Swept variable-geometry main wings (left & right) + wingtip nav lights
    const leftWingGeom = this.createWingPanelGeometry(3.15, 1.35, 0.48, 1.55, 0.08);
    const leftWing = new THREE.Mesh(leftWingGeom, wingMat);
    leftWing.position.set(0.22, 0.02, 0.35);

    const rightWing = new THREE.Mesh(leftWingGeom.clone(), wingMat);
    rightWing.scale.x = -1;
    rightWing.position.set(-0.22, 0.02, 0.35);

    const leftNav = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), greenLightMat);
    leftNav.position.set(3.35, 0.05, -0.78);
    const rightNav = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), redLightMat);
    rightNav.position.set(-3.35, 0.05, -0.78);

    // Swept horizontal stabilizers
    const stabGeom = this.createWingPanelGeometry(1.18, 0.62, 0.24, 0.55, 0.06);
    const leftStab = new THREE.Mesh(stabGeom, wingMat);
    leftStab.position.set(0.12, 0.12, -1.55);
    const rightStab = new THREE.Mesh(stabGeom.clone(), wingMat);
    rightStab.scale.x = -1;
    rightStab.position.set(-0.12, 0.12, -1.55);

    // Swept vertical tail fin
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(-0.85, 0);
    finShape.lineTo(-1.25, 0.92);
    finShape.lineTo(-0.78, 0.92);
    finShape.closePath();
    const finGeom = new THREE.ExtrudeGeometry(finShape, { depth: 0.07, bevelEnabled: false });
    finGeom.rotateY(Math.PI / 2);
    const tailFin = new THREE.Mesh(finGeom, hullMat);
    tailFin.position.set(-0.035, 0.2, -1.15);

    group.add(leftWing, rightWing, leftNav, rightNav, leftStab, rightStab, tailFin);

    // Twin paired under-wing / fuselage turbofan nacelles with afterburners
    for (const side of [-1, 1]) {
      for (const offset of [0.58, 0.92]) {
        const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 1.35, 10), darkMat);
        nacelle.rotation.x = Math.PI / 2;
        nacelle.position.set(side * offset, -0.14, -0.15);

        const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10), hullMat);
        intake.rotation.x = Math.PI / 2;
        intake.position.set(side * offset, -0.14, 0.54);

        const exhaust = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 8), afterburnerMat);
        exhaust.rotation.x = -Math.PI / 2;
        exhaust.position.set(side * offset, -0.14, -0.96);

        group.add(nacelle, intake, exhaust);
      }
    }

    markOwned(group);
    return group;
  }

  /** Builds a realistic AC-130 Spooky gunship (high-wing C-130 turboprop with port cannons). */
  createAc130Mesh() {
    const glb = this.cloneGlbRig('ac130');
    if (glb) return glb;
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x3b4454, roughness: 0.52, metalness: 0.5 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.55, metalness: 0.45 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55, metalness: 0.65 });
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.85 });
    const cockpitMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.45,
      roughness: 0.2,
      metalness: 0.8,
    });
    const propMat = new THREE.MeshBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.78 });
    const propDiscMat = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    });

    // Stout C-130 cargo fuselage
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.75, 14), hullMat);
    fuselage.rotation.x = Math.PI / 2;
    fuselage.position.z = 0.05;

    // Rounded nose radome & stepped cockpit
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.41, 12, 10), hullMat);
    nose.scale.set(0.95, 0.92, 1.45);
    nose.position.set(0, -0.02, 1.48);

    const radomeTip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), darkMat);
    radomeTip.scale.set(1, 0.9, 1.3);
    radomeTip.position.set(0, -0.06, 1.98);

    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.48), cockpitMat);
    cockpit.position.set(0, 0.28, 1.45);
    cockpit.rotation.x = 0.28;

    // Upswept rear cargo ramp tail
    const tailRamp = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.35, 12), hullMat);
    tailRamp.rotation.x = -Math.PI / 2;
    tailRamp.scale.set(0.95, 1, 0.72);
    tailRamp.position.set(0, 0.12, -1.95);

    // Lower fuselage main landing gear sponsons
    for (const side of [-1, 1]) {
      const sponson = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 1.15), darkMat);
      sponson.position.set(side * 0.44, -0.26, -0.1);
      group.add(sponson);
    }

    // Under-nose FLIR / target acquisition sensor ball
    const flirBall = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), darkMat);
    flirBall.position.set(0, -0.34, 1.42);

    group.add(fuselage, nose, radomeTip, cockpit, tailRamp, flirBall);

    // High-mounted straight-leading-edge C-130 wings
    const wingGeom = this.createWingPanelGeometry(3.25, 1.05, 0.56, 0.24, 0.1);
    const leftWing = new THREE.Mesh(wingGeom, wingMat);
    leftWing.position.set(0.24, 0.34, 0.28);

    const rightWing = new THREE.Mesh(wingGeom.clone(), wingMat);
    rightWing.scale.x = -1;
    rightWing.position.set(-0.24, 0.34, 0.28);

    // Broad horizontal tailplanes
    const tailStabGeom = this.createWingPanelGeometry(1.38, 0.62, 0.32, 0.18, 0.07);
    const leftStab = new THREE.Mesh(tailStabGeom, wingMat);
    leftStab.position.set(0.1, 0.22, -2.0);
    const rightStab = new THREE.Mesh(tailStabGeom.clone(), wingMat);
    rightStab.scale.x = -1;
    rightStab.position.set(-0.1, 0.22, -2.0);

    // Tall C-130 vertical stabilizer fin
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(-0.92, 0);
    finShape.lineTo(-1.05, 1.15);
    finShape.lineTo(-0.56, 1.15);
    finShape.closePath();
    const finGeom = new THREE.ExtrudeGeometry(finShape, { depth: 0.08, bevelEnabled: false });
    finGeom.rotateY(Math.PI / 2);
    const tailFin = new THREE.Mesh(finGeom, hullMat);
    tailFin.position.set(-0.04, 0.26, -1.55);

    group.add(leftWing, rightWing, leftStab, rightStab, tailFin);

    // 4 wing-mounted Allison T56 turboprop nacelles with spinning 4-blade propellers
    const propellers = [];
    for (const side of [-1, 1]) {
      for (const spanX of [1.18, 2.15]) {
        const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.85, 8), darkMat);
        nacelle.rotation.x = Math.PI / 2;
        nacelle.position.set(side * spanX, 0.28, 0.42);

        const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 8), hullMat);
        spinner.rotation.x = Math.PI / 2;
        spinner.position.set(side * spanX, 0.28, 0.92);

        const propHub = new THREE.Group();
        propHub.position.set(side * spanX, 0.28, 0.88);
        const bladeA = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.045, 0.02), propMat);
        const bladeB = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.66, 0.02), propMat);
        const blurDisc = new THREE.Mesh(new THREE.CircleGeometry(0.34, 14), propDiscMat);
        propHub.add(bladeA, bladeB, blurDisc);
        propellers.push(propHub);

        group.add(nacelle, spinner, propHub);
      }
    }

    // Inward-facing (-X side during clockwise bank) AC-130 gunship cannons:
    // 105mm M102 howitzer, 40mm Bofors, and twin 25mm Gatling barrels
    const howitzer105 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.56, 8), gunMat);
    howitzer105.rotation.z = Math.PI / 2 + 0.18;
    howitzer105.position.set(-0.56, -0.08, -0.45);

    const bofors40 = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.48, 8), gunMat);
    bofors40.rotation.z = Math.PI / 2 + 0.18;
    bofors40.position.set(-0.52, -0.1, 0.08);

    const gatling25 = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.36, 6), gunMat);
    gatling25.rotation.z = Math.PI / 2 + 0.18;
    gatling25.position.set(-0.48, -0.1, 0.62);

    group.add(howitzer105, bofors40, gatling25);

    // Wingtip navigation lights
    const leftNav = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshBasicMaterial({ color: 0x22c55e }));
    leftNav.position.set(3.48, 0.38, 0.12);
    const rightNav = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    rightNav.position.set(-3.48, 0.38, 0.12);
    group.add(leftNav, rightNav);

    group.userData.propellers = propellers;
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

  /** Builds a realistic tactical field-repair quadrotor UAV with skids, optical gimbal, and welder arm. */
  createRepairDroneMesh() {
    if (!this.engine.fxGroup) return null;
    const glb = this.cloneGlbRig('repairDrone');
    if (glb) return glb;
    const group = new THREE.Group();
    const carbonMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.38, metalness: 0.65 });
    const shellMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.42, metalness: 0.55 });
    const batteryMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.4 });
    const tealMat = new THREE.MeshStandardMaterial({
      color: 0x2dd4bf,
      emissive: 0x0d9488,
      emissiveIntensity: 0.7,
      roughness: 0.25,
    });
    const rotorMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.82 });
    const rotorDiscMat = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
    });

    // Aerodynamic tapered central fuselage + dorsal LiPo battery pack + GPS dome
    const coreHull = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.86), carbonMat);
    const noseFairing = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.34, 8), shellMat);
    noseFairing.rotation.x = Math.PI / 2;
    noseFairing.scale.set(1.05, 0.62, 1);
    noseFairing.position.set(0, -0.01, 0.56);

    const batteryPack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.13, 0.52), batteryMat);
    batteryPack.position.set(0, 0.13, -0.06);

    const gpsMast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.14, 6), carbonMat);
    gpsMast.position.set(0, 0.24, -0.2);
    const gpsPuck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.05, 10), shellMat);
    gpsPuck.position.set(0, 0.32, -0.2);

    const statusBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), new THREE.MeshBasicMaterial({ color: 0x2dd4bf }));
    statusBeacon.position.set(0, 0.36, -0.2);

    // Forward dual-lens optical/LiDAR sensor turret
    const sensorTurret = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), carbonMat);
    sensorTurret.position.set(0, -0.09, 0.42);
    const sensorLens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8), tealMat);
    sensorLens.rotation.x = Math.PI / 2;
    sensorLens.position.set(0, -0.09, 0.51);

    // Under-slung articulated plasma-welder gimbal
    const gimbalBase = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.1, 8), shellMat);
    gimbalBase.position.set(0, -0.13, 0.06);
    const welderArm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.24, 8), carbonMat);
    welderArm.rotation.x = 0.25;
    welderArm.position.set(0, -0.24, 0.1);
    const welderTip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.12, 8), tealMat);
    welderTip.rotation.x = Math.PI;
    welderTip.position.set(0, -0.36, 0.14);

    group.add(coreHull, noseFairing, batteryPack, gpsMast, gpsPuck, statusBeacon, sensorTurret, sensorLens, gimbalBase, welderArm, welderTip);

    // Tubular landing skids
    for (const side of [-1, 1]) {
      const skidRail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.78, 6), carbonMat);
      skidRail.rotation.x = Math.PI / 2;
      skidRail.position.set(side * 0.28, -0.28, 0);

      const frontStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 6), carbonMat);
      frontStrut.rotation.z = side * 0.35;
      frontStrut.position.set(side * 0.23, -0.17, 0.22);

      const rearStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 6), carbonMat);
      rearStrut.rotation.z = side * 0.35;
      rearStrut.position.set(side * 0.23, -0.17, -0.22);

      group.add(skidRail, frontStrut, rearStrut);
    }

    // 4 swept carbon-fiber X-frame arms, brushless motor bells, 2-blade propellers & nav LEDs
    const rotors = [];
    const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
    for (let i = 0; i < armAngles.length; i++) {
      const a = armAngles[i];
      const armRadius = 0.68;
      const tipX = Math.cos(a) * armRadius;
      const tipZ = Math.sin(a) * armRadius;

      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.04, armRadius, 6), carbonMat);
      arm.rotation.order = 'YXZ';
      arm.rotation.y = Math.atan2(tipX, tipZ);
      arm.rotation.x = Math.PI / 2 - 0.08; // Slight upward dihedral
      arm.position.set(tipX * 0.52, 0.05, tipZ * 0.52);

      const motorBell = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.11, 10), shellMat);
      motorBell.position.set(tipX, 0.1, tipZ);

      const propGuard = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 6, 18), carbonMat);
      propGuard.rotation.x = Math.PI / 2;
      propGuard.position.set(tipX, 0.13, tipZ);

      const rotorHub = new THREE.Group();
      rotorHub.position.set(tipX, 0.16, tipZ);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.014, 0.055), rotorMat);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.27, 14), rotorDiscMat);
      disc.rotation.x = -Math.PI / 2;
      rotorHub.add(blade, disc);
      rotors.push(rotorHub);

      // Front arms (tipZ > 0): green/red nav LEDs; rear arms: amber/teal
      const ledColor = tipZ > 0 ? (tipX > 0 ? 0x22c55e : 0xef4444) : 0x2dd4bf;
      const navLed = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), new THREE.MeshBasicMaterial({ color: ledColor }));
      navLed.position.set(tipX, 0.03, tipZ);

      group.add(arm, motorBell, propGuard, rotorHub, navLed);
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
