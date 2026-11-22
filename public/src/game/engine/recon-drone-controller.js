import * as THREE from 'three';
import { t } from '../../i18n/index.js';
import { DURABILITY } from '../constants.js';
import { GRID_SIZE, TILE_SIZE } from '../levels.js';
import { disposeOwned } from '../render/dispose.js';
import { getSharedGltfLoader } from '../render/gltf-loader.js';
import { GameStatus } from '../types.js';
import { DRONE_CONFIGS } from '../vehicles/drones.js';

/**
 * Manages the tank-mounted RECON_DRONE optional module:
 * launch, approach, orbit reveal, return-to-tank docking, cooldown, and cleanup.
 */
export class ReconDroneController {
  constructor(engine) {
    this.engine = engine;
    this.glbTemplate = null;
    this.glbRequested = false;
  }

  preloadGlbModel() {
    if (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      this.engine?.isSoftwareGl ||
      !this.engine?.fxGroup ||
      this.glbRequested ||
      this.glbTemplate
    ) {
      return;
    }
    this.glbRequested = true;
    const loader = getSharedGltfLoader(this.engine?.renderer);
    const relPath = DRONE_CONFIGS.RECON_DRONE.modelUrl;
    const url = document.baseURI ? new URL(relPath, document.baseURI).href : relPath;
    loader.load(
      url,
      (gltf) => {
        if (gltf?.scene) {
          this.glbTemplate = gltf.scene;
        }
      },
      undefined,
      () => {}
    );
  }

  createDroneMesh() {
    if (!this.engine?.fxGroup) return null;
    if (!this.glbTemplate) {
      this.preloadGlbModel();
      return null;
    }
    const clone = this.glbTemplate.clone(true);
    const rotors = [];
    clone.traverse((node) => {
      if (node.name?.startsWith('Rotor_')) rotors.push(node);
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
    });
    if (rotors.length) clone.userData.rotors = rotors;
    const scale = DRONE_CONFIGS.RECON_DRONE.scale;
    if (scale !== 1) clone.scale.setScalar(scale);
    return clone;
  }

  spinRotors(mesh, dt) {
    if (!mesh?.userData?.rotors) return;
    for (let i = 0; i < mesh.userData.rotors.length; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      mesh.userData.rotors[i].rotation.y += dir * dt * 32;
    }
  }

  launch(targetX, targetZ) {
    const { engine } = this;
    if (engine.status !== GameStatus.PLAYING) return false;
    if (engine.playerHp <= DURABILITY.ZERO_HP || engine.isHangarOpen || engine.isAdPaused) {
      return false;
    }
    if (!engine.reconDroneOwned) {
      engine.setStatusBanner(t('RECON DRONE NOT INSTALLED — BUY IN GARAGE'), 2.2);
      return false;
    }
    if (engine.reconDroneMission) {
      engine.setStatusBanner(t('RECON DRONE ALREADY DEPLOYED'), 1.8);
      return false;
    }
    if ((engine.reconDroneCooldown || 0) > 0) {
      engine.setStatusBanner(
        t('RECON DRONE RECHARGING ({sec}s)', { sec: Math.ceil(engine.reconDroneCooldown) }),
        1.8
      );
      return false;
    }

    const droneCfg = DRONE_CONFIGS.RECON_DRONE;
    const halfLimit = (GRID_SIZE * TILE_SIZE) / 2 - 1.2;
    const tx = THREE.MathUtils.clamp(Number.isFinite(targetX) ? targetX : engine.playerX, -halfLimit, halfLimit);
    const tz = THREE.MathUtils.clamp(Number.isFinite(targetZ) ? targetZ : engine.playerZ, -halfLimit, halfLimit);
    const startX = engine.playerX;
    const startZ = engine.playerZ;
    const startY = 1.6;
    const droneRig = this.createDroneMesh();
    if (droneRig && engine.fxGroup) {
      droneRig.position.set(startX, startY, startZ);
      engine.fxGroup.add(droneRig);
    }

    engine.reconDroneActiveTimer = 0;
    engine.reconDroneMission = {
      x: startX,
      y: startY,
      z: startZ,
      targetX: tx,
      targetZ: tz,
      revealRadius: droneCfg.revealRadiusCells * TILE_SIZE,
      phase: 'approach',
      timer: 0,
      duration: droneCfg.durationSec,
      mesh: droneRig,
    };
    engine.setStatusBanner(t('RECON DRONE DISPATCHED — SCANNING TARGET ZONE'), 2.4);
    engine.emitHudUpdate?.();
    return true;
  }

  update(dt, elapsed) {
    const { engine } = this;
    const m = engine.reconDroneMission;
    if (!m) return;

    const droneCfg = DRONE_CONFIGS.RECON_DRONE;
    const orbitRadius = (droneCfg.orbitRadiusCells ?? 4) * TILE_SIZE;
    this.spinRotors(m.mesh, dt);

    if (m.phase === 'approach') {
      const dx = m.targetX - m.x;
      const dz = m.targetZ - m.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= orbitRadius + 0.5) {
        m.phase = 'orbit';
        m.timer = 0;
        engine.reconDroneActiveTimer = m.duration;
        m.orbitAngle = dist > 0.01 ? Math.atan2(m.z - m.targetZ, m.x - m.targetX) : 0;
        m.currentOrbitRadius = dist;
      } else {
        const step = Math.min(dist, droneCfg.approachSpeed * dt);
        m.x += (dx / dist) * step;
        m.z += (dz / dist) * step;
        m.y = THREE.MathUtils.lerp(m.y, droneCfg.hoverAltitude, Math.min(1, dt * 4));
        if (m.mesh) {
          m.mesh.position.set(m.x, m.y, m.z);
          m.mesh.rotation.y = Math.atan2(dx, dz);
        }
      }
      return;
    }

    if (m.phase === 'orbit') {
      m.timer += dt;
      m.orbitAngle = (m.orbitAngle || 0) + dt * (droneCfg.orbitAngularSpeed ?? 1.6);
      m.currentOrbitRadius = THREE.MathUtils.lerp(
        m.currentOrbitRadius ?? orbitRadius,
        orbitRadius,
        Math.min(1, dt * 4)
      );
      const nx = m.targetX + Math.cos(m.orbitAngle) * m.currentOrbitRadius;
      const nz = m.targetZ + Math.sin(m.orbitAngle) * m.currentOrbitRadius;
      const vx = nx - m.x;
      const vz = nz - m.z;
      m.x = nx;
      m.z = nz;
      m.y = droneCfg.hoverAltitude + Math.sin(elapsed * 4.5) * 0.18;
      if (m.mesh) {
        m.mesh.position.set(m.x, m.y, m.z);
        if (Math.hypot(vx, vz) > 1e-4) {
          m.mesh.rotation.y = Math.atan2(vx, vz);
        }
      }
      if (m.timer >= m.duration) {
        m.phase = 'return';
        m.timer = 0;
        engine.reconDroneActiveTimer = 0;
      }
      return;
    }

    // Return phase: fly back to player tank and dock to start recharge cooldown
    if (engine.playerHp <= DURABILITY.ZERO_HP) {
      this.clear();
      return;
    }
    const dx = engine.playerX - m.x;
    const dz = engine.playerZ - m.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= 1.2) {
      engine.reconDroneCooldown = droneCfg.cooldownSec;
      engine.reconDroneActiveTimer = 0;
      this.clear();
      engine.emitHudUpdate?.();
      return;
    }
    const step = Math.min(dist, droneCfg.departSpeed * dt);
    m.x += (dx / dist) * step;
    m.z += (dz / dist) * step;
    m.y = THREE.MathUtils.lerp(m.y, 1.6, Math.min(1, dt * 4));
    if (m.mesh) {
      m.mesh.position.set(m.x, m.y, m.z);
      m.mesh.rotation.y = Math.atan2(dx, dz);
    }
  }

  isPointRevealed(x, z) {
    const m = this.engine.reconDroneMission;
    if (!m || m.phase !== 'orbit') return false;
    return Math.hypot(x - m.targetX, z - m.targetZ) <= m.revealRadius;
  }

  clear() {
    const { engine } = this;
    const m = engine.reconDroneMission;
    if (m?.mesh) {
      engine.fxGroup?.remove?.(m.mesh);
      disposeOwned(m.mesh);
      m.mesh = null;
    }
    engine.reconDroneMission = null;
  }

  dispose() {
    this.clear();
    if (!this.glbTemplate) return;
    const disposedMats = new Set();
    const disposedTex = new Set();
    this.glbTemplate.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry?.dispose?.();
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of mats) {
        if (!mat || disposedMats.has(mat)) continue;
        disposedMats.add(mat);
        for (const val of Object.values(mat)) {
          if (val?.isTexture && !disposedTex.has(val)) {
            disposedTex.add(val);
            val.dispose();
          }
        }
        mat.dispose();
      }
    });
    this.glbTemplate = null;
    this.glbRequested = false;
  }
}
