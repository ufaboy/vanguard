/**
 * Independent Enemy AI (Perception -> Memory -> FSM -> Territorial Rules)
 * and Player Optical/Radar Sensor Contact Tracker.
 */

import { intersectSegmentAABB, worldToLocalYaw } from './ballistics.js';

export function normalizeAngleSigned(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function stepAngleTowards(current, target, maxStepRad) {
  const diff = normalizeAngleSigned(target - current);
  if (Math.abs(diff) <= maxStepRad) return target;
  return normalizeAngleSigned(current + Math.sign(diff) * maxStepRad);
}

function hasOpticalLineOfSight(
  observerPos,
  targetPos,
  obstacles = [],
  smokeClouds = []
) {
  const p0 = { x: observerPos.x, y: observerPos.y ?? 1.2, z: observerPos.z };
  const p1 = { x: targetPos.x, y: targetPos.y ?? 1.2, z: targetPos.z };

  for (const obs of obstacles) {
    if (obs.state === 'destroyed' || obs.blocksSight === false) continue;
    const localP0 = worldToLocalYaw(p0, obs, obs.yaw || 0);
    const localP1 = worldToLocalYaw(p1, obs, obs.yaw || 0);
    const half = {
      x: (obs.width || 2) * 0.5,
      y: (obs.height || 2) * 0.5,
      z: (obs.depth || 2) * 0.5,
    };
    const hit = intersectSegmentAABB(localP0, localP1, half);
    if (hit) return false;
  }

  const dx = p1.x - p0.x;
  const dz = p1.z - p0.z;
  const segLenSq = dx * dx + dz * dz;

  for (const smoke of smokeClouds) {
    if (!smoke || smoke.remaining <= 0) continue;
    const r = smoke.radius || 9.0;
    let t = 0;
    if (segLenSq > 1e-6) {
      t = ((smoke.x - p0.x) * dx + (smoke.z - p0.z) * dz) / segLenSq;
      t = Math.max(0, Math.min(1, t));
    }
    const closestX = p0.x + dx * t;
    const closestZ = p0.z + dz * t;
    const distSq =
      (closestX - smoke.x) * (closestX - smoke.x) +
      (closestZ - smoke.z) * (closestZ - smoke.z);
    if (distSq <= r * r) {
      return false;
    }
  }

  return true;
}

export function getObservedEnemyCondition(enemy) {
  if (!enemy) return 'INTACT';
  const ratio = (enemy.hp ?? 1) / Math.max(1, enemy.maxHp ?? 1);
  if (ratio <= 0.34) return 'CRITICAL';
  if (ratio <= 0.72) return 'DAMAGED';
  return 'INTACT';
}

export function createEnemyAIState({
  homeX = 0,
  homeZ = 0,
  patrolWaypoints = [],
  patrolRadius = 18,
  pursuitLimit = 38,
  hardLimit = 54,
  preferredRange = 32,
  stationary = false,
}) {
  return {
    state: patrolWaypoints && patrolWaypoints.length > 0 ? 'patrol' : 'idle',
    homePosition: { x: homeX, z: homeZ },
    patrolWaypoints: patrolWaypoints.map((wp) => ({ x: wp.x, z: wp.z })),
    currentWaypointIndex: 0,
    patrolRadius,
    pursuitLimit,
    hardLimit,
    preferredRange,
    stationary: Boolean(stationary),
    targetVisible: false,
    lastKnownTargetPosition: null,
    investigationTarget: null,
    timeSinceTargetSeen: 999,
    searchTimer: 0,
    repositionTimer: 0,
    repositionSide: 1,
  };
}

export function updatePlayerSensorContacts({
  contactMap,
  player,
  enemies = [],
  obstacles = [],
  smokeClouds = [],
  dt = 0.016,
  fadeDuration = 5.0,
}) {
  if (!contactMap || !player) return;

  const visionRange = player.turret?.visionRange || 75;
  const activeIds = new Set();

  for (const e of enemies) {
    if (!e || e.hp <= 0) continue;
    activeIds.add(e.id);
    const dist = Math.hypot(e.x - player.x, e.z - player.z);

    const opticallyVisible =
      dist <= visionRange &&
      hasOpticalLineOfSight(player, e, obstacles, smokeClouds);

    if (opticallyVisible) {
      contactMap.set(e.id, {
        enemyId: e.id,
        x: e.x,
        z: e.z,
        active: true,
        age: 0,
        source: 'optical',
      });
    } else if (contactMap.has(e.id)) {
      const prev = contactMap.get(e.id);
      prev.active = false;
      prev.age = (prev.age || 0) + dt;
      if (prev.age >= fadeDuration) {
        contactMap.delete(e.id);
      }
    }
  }

  for (const key of Array.from(contactMap.keys())) {
    if (!activeIds.has(key)) {
      contactMap.delete(key);
    }
  }
}
