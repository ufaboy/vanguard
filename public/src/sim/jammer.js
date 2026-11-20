/** Passive JAMMER ECM helpers: 20-cell radar interference and 5-cell APS / ATGM disruption. */

import { EnemyClass } from '../game/vehicles/tanks.js';

export const JAMMER_ECM = Object.freeze({
  /** Radar interference radius in grid cells. */
  RADAR_RADIUS_CELLS: 20,
  /** Close-range APS & ATGM disruption radius in grid cells. */
  SYSTEM_RADIUS_CELLS: 5,
  /** Maximum scatter radius in grid cells when an in-flight ATGM is jammed. */
  MISSILE_SCATTER_CELLS: 3,
  /** Maximum deflection (radians) of a jammed ATGM from its heading when it loses lock. */
  MISSILE_DEFLECT_RAD: 0.7,
  /** A jammed ATGM flies at least this fraction of the scatter radius before impact. */
  MISSILE_MIN_FLIGHT_FRACTION: 0.25,
  /** Fraction of real radar contacts hidden while radar is jammed. */
  RADAR_HIDE_RATIO: 0.5,
  /** Fraction of fake radar contacts added relative to real contacts. */
  RADAR_FAKE_RATIO: 0.5,
  /** Seconds each radar interference pattern persists before reshuffling. */
  RADAR_GLITCH_INTERVAL_SEC: 1.2,
});

/** True when `tank` is alive and carries the passive JAMMER ECM module. */
export function hasJammerModule(tank) {
  return Boolean(
    tank &&
      tank.hp > 0 &&
      (tank.enemyClass === EnemyClass.JAMMER ||
        tank.enemyClass === 'JAMMER' ||
        tank.loadout?.optionalEquipment?.includes('JAMMER'))
  );
}

/** True when `(x, z)` lies within `radiusWorld` of any living JAMMER unit. */
export function isPointWithinJammerRadius(x, z, enemies, radiusWorld) {
  if (!Array.isArray(enemies) || radiusWorld <= 0) return false;
  for (const e of enemies) {
    if (!hasJammerModule(e)) continue;
    if (Math.hypot(e.x - x, e.z - z) <= radiusWorld) return true;
  }
  return false;
}

function hash01(seed) {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Applies radar jamming to a list of real sensor contacts:
 * hides ~50% of real contacts and injects ~50% fake contacts within radar range.
 */
export function applyRadarJamming(
  contacts,
  { playerX = 0, playerZ = 0, elapsed = 0, radarRange = 32, halfArena = 36 } = {}
) {
  const real = Array.isArray(contacts) ? contacts : [];
  const tick = Math.floor(elapsed / JAMMER_ECM.RADAR_GLITCH_INTERVAL_SEC);

  let visibleReal;
  if (real.length === 0) {
    visibleReal = [];
  } else if (real.length === 1) {
    const idSeed = Number(real[0].enemyId) || 1;
    visibleReal = hash01(tick * 31 + idSeed) < JAMMER_ECM.RADAR_HIDE_RATIO ? [] : [real[0]];
  } else {
    const keepCount = Math.max(1, Math.ceil(real.length * (1 - JAMMER_ECM.RADAR_HIDE_RATIO)));
    visibleReal = real
      .map((c, idx) => ({
        contact: c,
        rank: hash01(tick * 31 + (Number(c.enemyId) || idx + 1) * 7),
      }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, keepCount)
      .map((entry) => entry.contact);
  }

  const fakeCount =
    real.length > 0
      ? Math.max(1, Math.round(real.length * JAMMER_ECM.RADAR_FAKE_RATIO))
      : 2;

  const limit = Math.max(1, halfArena - 1);
  const fakes = [];
  for (let i = 0; i < fakeCount; i++) {
    const angle = hash01(tick * 97 + i * 17 + 1) * Math.PI * 2;
    const dist = (0.15 + hash01(tick * 97 + i * 17 + 2) * 0.8) * radarRange;
    const fx = Math.max(-limit, Math.min(limit, playerX + Math.cos(angle) * dist));
    const fz = Math.max(-limit, Math.min(limit, playerZ + Math.sin(angle) * dist));
    fakes.push({
      enemyId: -(i + 1),
      x: fx,
      z: fz,
      active: hash01(tick * 97 + i * 17 + 3) < 0.7,
      age: 0,
      source: 'jammer-fake',
      fake: true,
    });
  }

  return [...visibleReal, ...fakes];
}

/**
 * Computes a random impact point within `scatterRadius` of `(x, z)`
 * where an in-flight ATGM was jammed. The point lies in a forward cone around
 * `heading` (radians, atan2(vx, vz)) so the missile can reach it flying straight.
 */
export function computeJammedMissileTarget(
  x,
  z,
  heading,
  scatterRadius,
  halfArena = 36,
  random = Math.random
) {
  const angle = heading + (random() * 2 - 1) * JAMMER_ECM.MISSILE_DEFLECT_RAD;
  const radius = Math.max(0, scatterRadius);
  const minDist = Math.min(radius, JAMMER_ECM.MISSILE_MIN_FLIGHT_FRACTION * radius);
  const dist = minDist + random() * (radius - minDist);
  const limit = Math.max(1, halfArena - 0.5);
  return {
    x: Math.max(-limit, Math.min(limit, x + Math.sin(angle) * dist)),
    z: Math.max(-limit, Math.min(limit, z + Math.cos(angle) * dist)),
  };
}
