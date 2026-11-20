import * as THREE from 'three';
import { getObservedEnemyCondition, normalizeAngleSigned } from '../../sim/ai.js';
import { GRID_SIZE, TILE_SIZE } from '../levels.js';
import { MISSILE } from '../constants.js';
import { GameStatus } from '../types.js';
import { t } from '../../i18n/index.js';

const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _intersectPoint = new THREE.Vector3();

/** Manages DOM input bindings, camera presets, and camera tracking/shake. */
export class InputCameraController {
  constructor(engine) {
    this.engine = engine;
    this.activeCanvasTouches = new Map();
    this.pinchPrevDist = null;
  }

  getPinchDistance() {
    if (this.activeCanvasTouches.size < 2) return null;
    const pts = [...this.activeCanvasTouches.values()];
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  }

  updateAimFromPointer(e) {
    const { engine } = this;
    if (engine.isMissileFpvActive?.()) return;
    const rect = engine.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    engine.mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    engine.mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    engine.raycaster.setFromCamera(engine.mouseNdc, engine.camera);
    if (engine.raycaster.ray.intersectPlane(_plane, _intersectPoint)) {
      const limit = (GRID_SIZE * TILE_SIZE) / 2 - 1.2;
      engine.aimWorld.x = THREE.MathUtils.clamp(_intersectPoint.x, -limit, limit);
      engine.aimWorld.z = THREE.MathUtils.clamp(_intersectPoint.z, -limit, limit);
    }
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
          t('DEVELOPER AI TELEMETRY OVERLAY: {label}', { label: engine.aiDebugMode ? t('ENABLED') : t('HIDDEN') }),
          2.0
        );
        return;
      }
      if (engine.status !== GameStatus.PLAYING && !engine.airSupportTargeting) return;
      if (engine.airSupportTargeting?.type === 'STRIKE') {
        if (e.code === 'Digit1') {
          e.preventDefault();
          engine.setAirStrikeVariant('STRIKE_BOMBS');
          return;
        } else if (e.code === 'Digit2') {
          e.preventDefault();
          engine.setAirStrikeVariant('STRIKE_THERMO');
          return;
        } else if (e.code === 'Digit3') {
          e.preventDefault();
          engine.setAirStrikeVariant('STRIKE_AC130');
          return;
        }
      }
      if (e.code === 'Digit5') {
        e.preventDefault();
        engine.startAirSupportTargeting('STRIKE');
        return;
      } else if (e.code === 'Digit6') {
        e.preventDefault();
        engine.callAirRepair();
        return;
      } else if (e.code === 'Digit7') {
        e.preventDefault();
        engine.startAirSupportTargeting('MINES');
        return;
      } else if (e.code === 'Digit8') {
        e.preventDefault();
        engine.startAirSupportTargeting('AIRDROP');
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

      if (e.pointerType === 'touch' && this.activeCanvasTouches.has(e.pointerId)) {
        this.activeCanvasTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.activeCanvasTouches.size >= 2) {
          const dist = this.getPinchDistance();
          if (dist !== null && this.pinchPrevDist !== null) {
            const delta = (this.pinchPrevDist - dist) * 0.06;
            engine.frustumSize = THREE.MathUtils.clamp(engine.frustumSize + delta, 14, 46);
            engine.handleResize();
            engine.onCameraZoomChange?.(engine.frustumSize);
          }
          this.pinchPrevDist = dist;
          return;
        }
      }

      if (engine.cameraRotating) {
        const dx = e.clientX - engine.cameraDragPrevX;
        engine.cameraDragPrevX = e.clientX;
        engine.cameraAzimuth = normalizeAngleSigned(engine.cameraAzimuth - dx * 0.0085);
        return;
      }

      if (e.pointerType === 'touch' && engine.activeAimPointerId !== e.pointerId) {
        return;
      }

      this.updateAimFromPointer(e);
      this.pointerClientX = e.clientX;
      this.pointerClientY = e.clientY;
      this.hasPointerPos = true;
      if (engine.airSupportTargeting) {
        engine.airSupportController.updateReticlePosition(engine.aimWorld.x, engine.aimWorld.z);
      }
    };

    engine.handlePointerDown = (e) => {
      if (engine.isHangarOpen) return;

      if (e.pointerType === 'touch') {
        this.activeCanvasTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.activeCanvasTouches.size >= 2) {
          this.pinchPrevDist = this.getPinchDistance();
          engine.isMouseDown = false;
          engine.activeAimPointerId = null;
          return;
        }
      }

      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault();
        engine.cameraRotating = true;
        engine.cameraDragPrevX = e.clientX;
        return;
      }

      this.updateAimFromPointer(e);
      if (engine.airSupportTargeting && !engine.isAdPaused) {
        if (e.button === 0) {
          e.preventDefault();
          engine.confirmAirSupportAt(engine.aimWorld.x, engine.aimWorld.z);
        } else if (e.button === 2) {
          e.preventDefault();
          engine.cancelAirSupportTargeting();
        }
        return;
      }
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
            t('PRIORITY TARGET DESIGNATED: {name} [OBSERVED: {cond}]', { name: t(clickedEnemy.name).toUpperCase(), cond: t(cond) }),
            2.4
          );
          engine.emitHudUpdate();
        } else if (engine.priorityTargetId !== null) {
          engine.priorityTargetId = null;
          engine.setStatusBanner(t('PRIORITY TARGET DESIGNATION CLEARED'), 1.8);
          engine.emitHudUpdate();
        } else {
          engine.firePlayerHomingMissile();
        }
      } else if (e.button === 0) {
        engine.activeAimPointerId = e.pointerId;
        engine.isMouseDown = true;
        engine.tryPlayerFire();
      }
    };

    engine.handlePointerUp = (e) => {
      if (e.pointerType === 'touch') {
        this.activeCanvasTouches.delete(e.pointerId);
        if (this.activeCanvasTouches.size < 2) {
          this.pinchPrevDist = null;
        }
      }
      if (e.pointerId === engine.activeAimPointerId || e.button === 0) {
        if (e.pointerId === engine.activeAimPointerId || e.pointerType !== 'touch') {
          engine.isMouseDown = false;
          engine.activeAimPointerId = null;
          engine.cameraRotating = false;
        }
      } else if (e.button === 1) {
        engine.cameraRotating = false;
      }
    };

    engine.handleWheel = (e) => {
      if (engine.isHangarOpen) return;
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * 2.2;
      const maxZoom = engine.airSupportTargeting ? 62 : 46;
      engine.frustumSize = THREE.MathUtils.clamp(engine.frustumSize + delta, 14, maxZoom);
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
      if (engine.fpvCamera) {
        engine.fpvCamera.aspect = aspect;
        engine.fpvCamera.updateProjectionMatrix();
      }

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
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointermove', engine.handlePointerMove);
    canvas.addEventListener('pointerdown', engine.handlePointerDown);
    canvas.addEventListener('wheel', engine.handleWheel, { passive: false });
    window.addEventListener('pointerup', engine.handlePointerUp);
    window.addEventListener('pointercancel', engine.handlePointerUp);
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

    if (engine.cameraPreset === 'ISOMETRIC') engine.frustumSize = 32;
    else if (engine.cameraPreset === 'TACTICAL_HIGH') engine.frustumSize = 44;
    else if (engine.cameraPreset === 'CLOSE_COMBAT') engine.frustumSize = 20;

    engine.handleResize?.();
    return engine.cameraPreset;
  }

  updateCamera(dt, elapsed) {
    const { engine } = this;
    const canFpv =
      Boolean(engine.missileFpvEnabled) &&
      engine.status === GameStatus.PLAYING &&
      !engine.isHangarOpen &&
      !engine.inspectMode &&
      !engine.airSupportTargeting &&
      Boolean(engine.fpvCamera);
    if (canFpv) {
      const missile = engine.getActivePlayerMissile?.();
      if (missile) {
        engine.missileFpvHoldTimer = 0;
        const speed = Math.hypot(missile.vx || 0, missile.vz || 0);
        const dirX = speed > 0.001 ? missile.vx / speed : Math.sin(missile.mesh?.rotation?.y || 0);
        const dirZ = speed > 0.001 ? missile.vz / speed : Math.cos(missile.mesh?.rotation?.y || 0);
        const flightY = missile.flightY ?? 0.9;
        const chaseDist = 3.0;
        const desiredX = missile.x - dirX * chaseDist;
        const desiredY = Math.max(1.1, flightY + 0.95);
        const desiredZ = missile.z - dirZ * chaseDist;

        if (this._lastFpvMissile !== missile) {
          this._lastFpvMissile = missile;
          engine.fpvCamera.position.set(desiredX, desiredY, desiredZ);
        } else {
          engine.fpvCamera.position.x = THREE.MathUtils.damp(engine.fpvCamera.position.x, desiredX, 18, dt);
          engine.fpvCamera.position.y = THREE.MathUtils.damp(engine.fpvCamera.position.y, desiredY, 18, dt);
          engine.fpvCamera.position.z = THREE.MathUtils.damp(engine.fpvCamera.position.z, desiredZ, 18, dt);
        }
        const lookX = missile.x + dirX * 9.0;
        const lookY = Math.max(0.4, flightY - 0.15);
        const lookZ = missile.z + dirZ * 9.0;
        this._lastFpvLook = { x: lookX, y: lookY, z: lookZ };
        engine.fpvCamera.lookAt(lookX, lookY, lookZ);
        return;
      }
      if (this._lastFpvMissile) {
        this._lastFpvMissile = null;
        engine.missileFpvHoldTimer = MISSILE.FPV_POST_EXPLOSION_DELAY;
      }
      if (engine.missileFpvHoldTimer > 0) {
        engine.missileFpvHoldTimer = Math.max(0, engine.missileFpvHoldTimer - dt);
        if (this._lastFpvLook) {
          engine.fpvCamera.lookAt(this._lastFpvLook.x, this._lastFpvLook.y, this._lastFpvLook.z);
        }
        return;
      }
    } else {
      this._lastFpvMissile = null;
      engine.missileFpvHoldTimer = 0;
    }

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

    const isVictoryOrbit =
      engine.status === GameStatus.VICTORY &&
      engine.victoryCinematicsTimer > 0 &&
      Boolean(engine.victoryCinematics);

    const halfArena = (GRID_SIZE * TILE_SIZE) / 2;
    let targetX;
    let targetZ;
    if (isVictoryOrbit) {
      targetX = engine.victoryCinematics.x;
      targetZ = engine.victoryCinematics.z;
    } else if (engine.airSupportTargeting && engine.airCamTarget) {
      const panSpeed = 34 * dt;
      const forwardX = -Math.sin(engine.cameraAzimuth);
      const forwardZ = -Math.cos(engine.cameraAzimuth);
      const rightX = Math.cos(engine.cameraAzimuth);
      const rightZ = -Math.sin(engine.cameraAzimuth);

      let moveRight = 0;
      let moveForward = 0;
      if (engine.keys.KeyW || engine.keys.ArrowUp) moveForward += 1;
      if (engine.keys.KeyS || engine.keys.ArrowDown) moveForward -= 1;
      if (engine.keys.KeyD || engine.keys.ArrowRight) moveRight += 1;
      if (engine.keys.KeyA || engine.keys.ArrowLeft) moveRight -= 1;

      if (this.hasPointerPos && typeof window !== 'undefined') {
        const edge = 72;
        const w = window.innerWidth || 1280;
        const h = window.innerHeight || 720;
        if (this.pointerClientX < edge) moveRight -= 1;
        else if (this.pointerClientX > w - edge) moveRight += 1;
        if (this.pointerClientY < edge) moveForward += 1;
        else if (this.pointerClientY > h - edge) moveForward -= 1;
      }

      if (moveRight !== 0 || moveForward !== 0) {
        const len = Math.hypot(moveRight, moveForward) || 1;
        const nr = moveRight / len;
        const nf = moveForward / len;
        engine.airCamTarget.x = THREE.MathUtils.clamp(
          engine.airCamTarget.x + (rightX * nr + forwardX * nf) * panSpeed,
          -halfArena + 2,
          halfArena - 2
        );
        engine.airCamTarget.z = THREE.MathUtils.clamp(
          engine.airCamTarget.z + (rightZ * nr + forwardZ * nf) * panSpeed,
          -halfArena + 2,
          halfArena - 2
        );
        if (this.hasPointerPos) {
          this.updateAimFromPointer({ clientX: this.pointerClientX, clientY: this.pointerClientY });
          engine.airSupportController.updateReticlePosition(engine.aimWorld.x, engine.aimWorld.z);
        }
      }
      targetX = engine.airCamTarget.x;
      targetZ = engine.airCamTarget.z;
    } else {
      const panLimit = Math.max(8, halfArena - 9);
      targetX = THREE.MathUtils.clamp(
        engine.playerX * 0.76 + engine.aimWorld.x * 0.24,
        -panLimit,
        panLimit
      );
      targetZ = THREE.MathUtils.clamp(
        engine.playerZ * 0.76 + engine.aimWorld.z * 0.24,
        -panLimit,
        panLimit
      );
    }

    const lookDamp = isVictoryOrbit ? 8.5 : 6.5;
    engine.camCurrentLook.x = THREE.MathUtils.damp(
      engine.camCurrentLook.x,
      targetX,
      lookDamp,
      dt
    );
    engine.camCurrentLook.z = THREE.MathUtils.damp(
      engine.camCurrentLook.z,
      targetZ,
      lookDamp,
      dt
    );

    if (isVictoryOrbit) {
      const prevFrustum = engine.frustumSize;
      engine.frustumSize = THREE.MathUtils.damp(
        engine.frustumSize,
        engine.victoryCinematics.targetFrustum,
        4.5,
        dt
      );
      if (Math.abs(engine.frustumSize - prevFrustum) > 0.005) {
        engine.handleResize?.();
      }
    }

    let horizontalDist = 36.8;
    let offsetY = 32;

    if (engine.cameraPreset === 'TACTICAL_HIGH') {
      horizontalDist = 29.7;
      offsetY = 48;
    } else if (engine.cameraPreset === 'CLOSE_COMBAT') {
      horizontalDist = 25.4;
      offsetY = 22;
    }

    let azimuth = engine.cameraAzimuth;
    if (isVictoryOrbit) {
      const vc = engine.victoryCinematics;
      const progress = THREE.MathUtils.clamp(
        1 - engine.victoryCinematicsTimer / Math.max(0.01, vc.duration),
        0,
        1
      );
      azimuth = vc.startAzimuth + progress * Math.PI * 2;
    }

    const offsetX = Math.sin(azimuth) * horizontalDist;
    const offsetZ = Math.cos(azimuth) * horizontalDist;

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

