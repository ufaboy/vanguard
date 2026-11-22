import { GameStatus } from '../types.js';
import { VICTORY_CINEMATICS } from '../constants.js';

const IDLE_SCREEN_FPS = 15;

/**
 * Create the victory cinematics state object for a mission victory focus target.
 */
export function createVictoryCinematics({
  x,
  z,
  baseFrustum = 32,
  cameraAzimuth = Math.PI * 0.25,
  focusTarget = null,
} = {}) {
  const duration = VICTORY_CINEMATICS.DURATION_SEC;
  return {
    x: focusTarget?.x ?? x,
    z: focusTarget?.z ?? z,
    duration,
    remaining: duration,
    startAzimuth: cameraAzimuth,
    baseFrustum,
    targetFrustum: Math.max(
      VICTORY_CINEMATICS.MIN_FRUSTUM,
      baseFrustum * VICTORY_CINEMATICS.ZOOM_FACTOR
    ),
    detonateDelay: focusTarget?.detonateDelay ?? VICTORY_CINEMATICS.DETONATE_DELAY_SEC,
    onDetonate: typeof focusTarget?.onDetonate === 'function' ? focusTarget.onDetonate : null,
    detonated: !focusTarget?.onDetonate,
    sparkAcc: 0,
  };
}

/**
 * Advance the victory cinematics state by `dt` seconds.
 * Returns `{ finished: boolean, restoredFrustum: number | null }`.
 */
export function stepVictoryCinematics(vc, dt, { onSpark, onDetonate } = {}) {
  if (!vc || vc.remaining <= 0) {
    return { finished: true, restoredFrustum: null };
  }
  vc.remaining = Math.max(0, vc.remaining - dt);

  if (!vc.detonated) {
    vc.detonateDelay -= dt;
    vc.sparkAcc = (vc.sparkAcc || 0) + dt;
    if (vc.sparkAcc >= VICTORY_CINEMATICS.SPARK_INTERVAL_SEC) {
      vc.sparkAcc = 0;
      onSpark?.(vc.x, vc.z);
    }
    if (vc.detonateDelay <= 0) {
      vc.detonated = true;
      vc.onDetonate?.();
      onDetonate?.();
    }
  }

  if (vc.remaining <= 0) {
    if (!vc.detonated) {
      vc.detonated = true;
      vc.onDetonate?.();
      onDetonate?.();
    }
    return { finished: true, restoredFrustum: vc.baseFrustum || null };
  }
  return { finished: false, restoredFrustum: null };
}

/**
 * Compute minimum frame interval in ms (0 = uncapped) based on game status and active cinematics.
 */
export function computeFrameInterval({
  status,
  victoryCinematicsTimer = 0,
  defeatCinematicsTimer = 0,
  isHangarOpen = false,
  inspectMode = false,
  cameraRotating = false,
  fpsCap = 0,
}) {
  const resultScreen =
    status === GameStatus.PAUSED ||
    (status === GameStatus.VICTORY && !(victoryCinematicsTimer > 0)) ||
    (status === GameStatus.GAME_OVER && !(defeatCinematicsTimer > 0));
  if (resultScreen && !isHangarOpen && !inspectMode && !cameraRotating) {
    return 1000 / IDLE_SCREEN_FPS;
  }
  return fpsCap > 0 ? 1000 / fpsCap : 0;
}
