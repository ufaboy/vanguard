/** Pure Hard Mode ATGM target acquisition and in-flight seeker guidance. */
import { MISSILE, TILE_SIZE } from '../game/constants.js';

/**
 * Select the initial ATGM target at launch.
 * In Hard Mode, requires at least one visible enemy tank (or visible enemy HQ when no enemy tank is visible).
 */
export function selectInitialAtgmTarget({
  hardMode = false,
  playerX = 0,
  playerZ = 0,
  enemies = [],
  enemyBaseAlive = false,
  enemyBaseCenter = null,
  hasLineOfSight = () => true,
  isEnemyVisible = () => true,
  isBaseRevealed = () => false,
} = {}) {
  if (!hardMode) {
    let nearest = null;
    let minDist = Infinity;
    for (const e of enemies) {
      if (!e || e.hp <= 0) continue;
      const d = Math.hypot(e.x - playerX, e.z - playerZ);
      if (d < minDist) {
        minDist = d;
        nearest = e;
      }
    }
    if (nearest) {
      return {
        allowed: true,
        targetEnemy: nearest,
        targetBase: false,
        lastKnownTarget: { x: nearest.x, z: nearest.z },
      };
    }
    if (enemyBaseAlive && enemyBaseCenter) {
      return {
        allowed: true,
        targetEnemy: null,
        targetBase: true,
        lastKnownTarget: { x: enemyBaseCenter.x, z: enemyBaseCenter.z },
      };
    }
    return { allowed: true, targetEnemy: null, targetBase: false, lastKnownTarget: null };
  }

  let nearest = null;
  let minDist = Infinity;
  for (const e of enemies) {
    if (!e || e.hp <= 0) continue;
    if (!isEnemyVisible(e)) continue;
    const d = Math.hypot(e.x - playerX, e.z - playerZ);
    if (d < minDist) {
      minDist = d;
      nearest = e;
    }
  }
  if (nearest) {
    return {
      allowed: true,
      targetEnemy: nearest,
      targetBase: false,
      lastKnownTarget: { x: nearest.x, z: nearest.z },
    };
  }

  if (enemyBaseAlive && enemyBaseCenter) {
    const baseVisible =
      isBaseRevealed(enemyBaseCenter.x, enemyBaseCenter.z) ||
      hasLineOfSight(playerX, playerZ, enemyBaseCenter.x, enemyBaseCenter.z);
    if (baseVisible) {
      return {
        allowed: true,
        targetEnemy: null,
        targetBase: true,
        lastKnownTarget: { x: enemyBaseCenter.x, z: enemyBaseCenter.z },
      };
    }
  }

  return { allowed: false, reason: 'NO_VISIBLE_TARGET' };
}

/**
 * Resolve Hard Mode in-flight ATGM guidance.
 * Tracks the locked enemy while visible; if lost or destroyed, flies to its last known
 * position while scanning within MISSILE.SEEK_RADIUS_CELLS for a new non-cloaked tank.
 */
export function resolveHardModeMissileGuidance(missile, {
  enemies = [],
  enemyBaseAlive = false,
  enemyBaseCenter = null,
  isEnemyVisible = () => true,
  isStealthEnemy = (e) => e?.enemyClass === 'STEALTH',
  seekRadiusWorld = MISSILE.SEEK_RADIUS_CELLS * TILE_SIZE,
} = {}) {
  const locked = missile.targetEnemy;
  if (locked) {
    if (locked.hp > 0 && isEnemyVisible(locked)) {
      missile.lastKnownTarget = { x: locked.x, z: locked.z };
      return { x: locked.x, z: locked.z, hasTarget: true, detonateAtPoint: false };
    }
    missile.targetEnemy = null;
  }

  // Primary target lost or destroyed (or launched at enemy base): scan seeker cone/radius.
  let best = null;
  let bestDist = Infinity;
  for (const e of enemies) {
    if (!e || e.hp <= 0) continue;
    if (isStealthEnemy(e) && !isEnemyVisible(e)) continue;
    const d = Math.hypot(e.x - missile.x, e.z - missile.z);
    if (d <= seekRadiusWorld && d < bestDist) {
      bestDist = d;
      best = e;
    }
  }

  if (best) {
    missile.targetEnemy = best;
    missile.targetBase = false;
    missile.lastKnownTarget = { x: best.x, z: best.z };
    return { x: best.x, z: best.z, hasTarget: true, detonateAtPoint: false };
  }

  if (missile.targetBase && enemyBaseAlive && enemyBaseCenter) {
    missile.lastKnownTarget = { x: enemyBaseCenter.x, z: enemyBaseCenter.z };
    return { x: enemyBaseCenter.x, z: enemyBaseCenter.z, hasTarget: true, detonateAtPoint: false };
  }

  if (missile.lastKnownTarget) {
    return {
      x: missile.lastKnownTarget.x,
      z: missile.lastKnownTarget.z,
      hasTarget: true,
      detonateAtPoint: true,
    };
  }

  return { x: missile.x, z: missile.z, hasTarget: false, detonateAtPoint: false };
}
