import * as THREE from 'three';
import { getObservedEnemyCondition, normalizeAngleSigned } from '../../sim/ai.js';
import { GRID_SIZE, TILE_SIZE } from '../levels.js';
import { GameStatus } from '../types.js';

const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _intersectPoint = new THREE.Vector3();

/** Manages DOM input bindings, camera presets, and camera tracking/shake. */
export class InputCameraController {
  constructor(engine) {
    this.engine = engine;
  }

  bindEvents() {
    const { engine } = this;

    engine.handleKeyDown = (e) => {
      if (engine.isHangarOpen || engine.isAdPaused) return;
      engine.keys[e.code] = true;
      if (e.code === 'F3') {
        e.preventDefault();
        engine.aiDebugMode = !engine.aiDebugMode;
        for (const unit of engine.enemies) {
          if (unit.rig?.hpBarBg) unit.rig.hpBarBg.visible = engine.aiDebugMode;
          if (unit.rig?.hpBarFill) unit.rig.hpBarFill.visible = engine.aiDebugMode;
        }
        engine.setStatusBanner(
          `DEVELOPER AI TELEMETRY OVERLAY: ${engine.aiDebugMode ? 'ENABLED' : 'HIDDEN'}`,
          2.0
        );
        return;
      }
      if (engine.status !== GameStatus.PLAYING) return;
      if (e.code === 'Digit1') {
        engine.activateModuleSlot(1);
      } else if (e.code === 'Digit2') {
        engine.activateModuleSlot(2);
      } else if (e.code === 'KeyE') {
        e.preventDefault();
        if (engine.contractState) {
          engine.contractDirector.interactObjective();
        } else {
          engine.firePlayerHomingMissile();
        }
      } else if (e.code === 'KeyN') {
        if (engine.survivalState) {
          e.preventDefault();
          engine.callNextSurvivalWave();
        }
      } else if (e.code === 'Space') {
        e.preventDefault();
        engine.firePlayerHomingMissile();
      }
    };

    engine.handleKeyUp = (e) => {
      engine.keys[e.code] = false;
    };

    engine.handlePointerMove = (e) => {
      if (engine.isHangarOpen) return;

      if (engine.cameraRotating) {
        const dx = e.clientX - engine.cameraDragPrevX;
        engine.cameraDragPrevX = e.clientX;
        engine.cameraAzimuth = normalizeAngleSigned(engine.cameraAzimuth - dx * 0.0085);
        return;
      }

      const rect = engine.renderer.domElement.getBoundingClientRect();
      engine.mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      engine.mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      engine.raycaster.setFromCamera(engine.mouseNdc, engine.camera);
      if (engine.raycaster.ray.intersectPlane(_plane, _intersectPoint)) {
        const limit = (GRID_SIZE * TILE_SIZE) / 2 - 1.2;
        engine.aimWorld.x = THREE.MathUtils.clamp(_intersectPoint.x, -limit, limit);
        engine.aimWorld.z = THREE.MathUtils.clamp(_intersectPoint.z, -limit, limit);
      }
    };

    engine.handlePointerDown = (e) => {
      if (engine.isHangarOpen) return;

      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault();
        engine.cameraRotating = true;
        engine.cameraDragPrevX = e.clientX;
        return;
      }

      engine.handlePointerMove(e);
      if (engine.status !== GameStatus.PLAYING || engine.isAdPaused) return;

      if (e.button === 2) {
        let clickedEnemy = null;
        let bestDist = 2.6;
        for (const unit of engine.enemies) {
          const d = Math.hypot(unit.x - engine.aimWorld.x, unit.z - engine.aimWorld.z);
          if (d <= bestDist) {
            bestDist = d;
            clickedEnemy = unit;
          }
        }
        if (clickedEnemy) {
          engine.priorityTargetId = clickedEnemy.id;
          const cond = getObservedEnemyCondition(clickedEnemy);
          engine.setStatusBanner(
            `PRIORITY TARGET DESIGNATED: ${clickedEnemy.name.toUpperCase()} [OBSERVED: ${cond}]`,
            2.4
          );
          engine.emitHudUpdate();
        } else if (engine.priorityTargetId !== null) {
          engine.priorityTargetId = null;
          engine.setStatusBanner('PRIORITY TARGET DESIGNATION CLEARED', 1.8);
          engine.emitHudUpdate();
        } else {
          engine.firePlayerHomingMissile();
        }
      } else if (e.button === 0) {
        engine.isMouseDown = true;
        engine.tryPlayerFire();
      }
    };

    engine.handlePointerUp = (e) => {
      if (e.button === 0) {
        engine.isMouseDown = false;
        engine.cameraRotating = false;
      } else if (e.button === 1) {
        engine.cameraRotating = false;
      }
    };

    engine.handleWheel = (e) => {
      if (engine.isHangarOpen) return;
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * 2.2;
      engine.frustumSize = THREE.MathUtils.clamp(engine.frustumSize + delta, 14, 46);
      engine.handleResize();
      engine.onCameraZoomChange?.(engine.frustumSize);
    };

    engine.handleResize = () => {
      if (engine.isDisposed) return;
      const width = engine.container.clientWidth || window.innerWidth;
      const height = engine.container.clientHeight || window.innerHeight;
      if (!width || !height) return;
      const aspect = width / height;

      engine.camera.left = (-engine.frustumSize * aspect) / 2;
      engine.camera.right = (engine.frustumSize * aspect) / 2;
      engine.camera.top = engine.frustumSize / 2;
      engine.camera.bottom = -engine.frustumSize / 2;
      engine.camera.updateProjectionMatrix();

      engine.renderer.setSize(width, height, false);
    };

    window.addEventListener('keydown', engine.handleKeyDown);
    window.addEventListener('keyup', engine.handleKeyUp);
    window.addEventListener('resize', engine.handleResize);
    if (typeof ResizeObserver === 'function' && engine.container) {
      engine._resizeObserver = new ResizeObserver(() => engine.handleResize());
      engine._resizeObserver.observe(engine.container);
    }

    const canvas = engine.renderer.domElement;
    canvas.addEventListener('pointermove', engine.handlePointerMove);
    canvas.addEventListener('pointerdown', engine.handlePointerDown);
    canvas.addEventListener('wheel', engine.handleWheel, { passive: false });
    window.addEventListener('pointerup', engine.handlePointerUp);
    engine.handleContextMenu = (e) => e.preventDefault();
    canvas.addEventListener('contextmenu', engine.handleContextMenu);
  }

  cycleCameraPreset(preset) {
    const { engine } = this;
    engine.cameraAzimuth = Math.PI * 0.25;
    if (preset) {
      engine.cameraPreset = preset;
    } else {
      const order = ['ISOMETRIC', 'TACTICAL_HIGH', 'CLOSE_COMBAT'];
      const nextIdx = (order.indexOf(engine.cameraPreset) + 1) % order.length;
      engine.cameraPreset = order[nextIdx];
    }

    if (engine.cameraPreset === 'ISOMETRIC') engine.frustumSize = 36;
    else if (engine.cameraPreset === 'TACTICAL_HIGH') engine.frustumSize = 44;
    else if (engine.cameraPreset === 'CLOSE_COMBAT') engine.frustumSize = 20;

    engine.handleResize?.();
    return engine.cameraPreset;
  }

  updateCamera(dt, elapsed) {
    const { engine } = this;
    if (engine.inspectMode) {
      const orbitAngle = elapsed * 0.45;
      const radius = 14;
      engine.camCurrentLook.x = THREE.MathUtils.damp(
        engine.camCurrentLook.x,
        engine.playerX,
        8,
        dt
      );
      engine.camCurrentLook.z = THREE.MathUtils.damp(
        engine.camCurrentLook.z,
        engine.playerZ,
        8,
        dt
      );
      engine.camera.position.set(
        engine.camCurrentLook.x + Math.cos(orbitAngle) * radius,
        11.5,
        engine.camCurrentLook.z + Math.sin(orbitAngle) * radius
      );
      engine.camera.lookAt(engine.camCurrentLook.x, 0.75, engine.camCurrentLook.z);
      return;
    }

    if (engine.status === GameStatus.MENU) {
      const radius = 44;
      const angle = elapsed * 0.16;
      engine.camera.position.set(
        Math.cos(angle) * radius,
        36,
        Math.sin(angle) * radius
      );
      engine.camera.lookAt(0, 0, 0);
      return;
    }

    const halfArena = (GRID_SIZE * TILE_SIZE) / 2;
    const panLimit = Math.max(8, halfArena - 9);
    const targetX = THREE.MathUtils.clamp(
      engine.playerX * 0.76 + engine.aimWorld.x * 0.24,
      -panLimit,
      panLimit
    );
    const targetZ = THREE.MathUtils.clamp(
      engine.playerZ * 0.76 + engine.aimWorld.z * 0.24,
      -panLimit,
      panLimit
    );

    engine.camCurrentLook.x = THREE.MathUtils.damp(
      engine.camCurrentLook.x,
      targetX,
      6.5,
      dt
    );
    engine.camCurrentLook.z = THREE.MathUtils.damp(
      engine.camCurrentLook.z,
      targetZ,
      6.5,
      dt
    );

    let horizontalDist = 36.8;
    let offsetY = 32;

    if (engine.cameraPreset === 'TACTICAL_HIGH') {
      horizontalDist = 29.7;
      offsetY = 48;
    } else if (engine.cameraPreset === 'CLOSE_COMBAT') {
      horizontalDist = 25.4;
      offsetY = 22;
    }

    const offsetX = Math.sin(engine.cameraAzimuth) * horizontalDist;
    const offsetZ = Math.cos(engine.cameraAzimuth) * horizontalDist;

    let shakeX = 0;
    let shakeZ = 0;
    if (engine.screenShake > 0.01) {
      shakeX = (Math.random() - 0.5) * engine.screenShake * 1.6;
      shakeZ = (Math.random() - 0.5) * engine.screenShake * 1.6;
      engine.screenShake = THREE.MathUtils.damp(engine.screenShake, 0, 8, dt);
    } else {
      engine.screenShake = 0;
    }

    engine.camera.position.set(
      engine.camCurrentLook.x + offsetX + shakeX,
      offsetY,
      engine.camCurrentLook.z + offsetZ + shakeZ
    );
    engine.camera.lookAt(engine.camCurrentLook.x, 0, engine.camCurrentLook.z);
  }
}

