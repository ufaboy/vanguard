/**
 * Enemy Gunner: aiming and the fire decision, separated from movement.
 *
 * RULE: enemies never lead their shots. `computeAimPoint` only ever reads the target's
 * current position; the gunner API does not accept a target velocity at all.
 *
 * Hit or miss is decided by a dice roll against the luck of the shoot action (actions.js),
 * made when the shot is assigned (`armShot`). A hit aims exactly at the target's current
 * position; a miss aims the turret deliberately beside the target. Crew timing is the same
 * for every enemy (GUNNER).
 */

import { missAngle } from './actions.js';

export const GUNNER = Object.freeze({
  /** Continuous player contact required before the first shot (seconds). */
  REACTION_SEC: 0.5,
  /** Contact loss shorter than this does not reset the reaction timer (seconds). */
  CONTACT_GRACE_SEC: 0.6,
  /** Max turret misalignment at which the crew pulls the trigger (radians). */
  ALIGN_TOLERANCE: 0.1,
  /** Extra random reload delay added to the cannon cooldown (seconds, max). */
  RELOAD_JITTER: 0.25,
});

function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** No-lead aim point: the target's current position, nothing else. */
export function computeAimPoint(target) {
  return { x: target.x, z: target.z };
}

export function createGunnerState(random = Math.random) {
  return {
    random,
    contactTime: 0,
    lostTime: 999,
    targetKey: null,
    shot: null,
  };
}

/**
 * Assigns the next shot: the shoot action, the dice result and the miss side.
 * @param {object} g  gunner state
 * @param {string} actionId  shoot action id
 * @param {string} targetKey  identity of the target (switching targets re-assigns the shot)
 * @param {boolean} hit  dice result
 */
export function armShot(g, actionId, targetKey, hit) {
  g.shot = { actionId, targetKey, hit, sign: g.random() < 0.5 ? -1 : 1 };
  return g.shot;
}

/** The current shot fits this action and target. */
export function shotArmedFor(g, actionId, targetKey) {
  return Boolean(g.shot && g.shot.actionId === actionId && g.shot.targetKey === targetKey);
}

/**
 * Advance the gunner one frame.
 * @param {object} g  gunner state
 * @param {object} input
 * @param {number} input.dt
 * @param {{x:number,z:number,turretAngle:number}} input.shooter
 * @param {{x:number,z:number}|null} input.target  current target position (no velocity)
 * @param {string} [input.targetKey]  identity of the target; switching targets restarts reaction
 * @param {boolean} input.visible  whether the crew currently has contact with the target
 * @param {number} [input.targetRadius]  world radius used to place a deliberate miss
 * @param {boolean} [input.react]  require the reaction time (player contact only)
 * @returns {{desiredTurretAngle: number|null, aligned: boolean, reacted: boolean, canFire: boolean}}
 */
export function stepGunner(g, { dt, shooter, target, targetKey = 'target', visible, targetRadius = 0.85, react = true }) {
  if (visible && target) {
    if (g.lostTime > GUNNER.CONTACT_GRACE_SEC || g.targetKey !== targetKey) {
      g.contactTime = 0;
      g.targetKey = targetKey;
    }
    g.lostTime = 0;
    g.contactTime += dt;
  } else {
    g.lostTime += dt;
    if (g.lostTime > GUNNER.CONTACT_GRACE_SEC) g.contactTime = 0;
  }

  if (!target) {
    return { desiredTurretAngle: null, aligned: false, reacted: false, canFire: false };
  }

  const aim = computeAimPoint(target);
  const dist = Math.hypot(aim.x - shooter.x, aim.z - shooter.z);
  const shot = g.shot && g.shot.targetKey === targetKey ? g.shot : null;
  const offset = shot && !shot.hit ? missAngle(dist, targetRadius, shot.sign) : 0;
  const desiredTurretAngle = normalizeAngle(Math.atan2(aim.x - shooter.x, aim.z - shooter.z) + offset);
  const misalignment = Math.abs(normalizeAngle(desiredTurretAngle - shooter.turretAngle));
  const aligned = misalignment <= GUNNER.ALIGN_TOLERANCE;
  const reacted = !react || g.contactTime >= GUNNER.REACTION_SEC;
  return { desiredTurretAngle, aligned, reacted, canFire: Boolean(visible && aligned && reacted && shot) };
}

/** Call after every shot: clears the assigned shot and returns the extra reload delay. */
export function onGunnerFired(g) {
  g.shot = null;
  return g.random() * GUNNER.RELOAD_JITTER;
}
