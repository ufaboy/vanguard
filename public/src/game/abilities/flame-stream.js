/**
 * FLAMETHROWER ability: replaces the main gun with a short-range napalm stream.
 * Each call emits one flame puff projectile; damage, range and timing live in FLAME_STREAM.
 */

import * as THREE from 'three';
import { BULLET_POWER, FLAME_STREAM } from '../constants.js';
import { sound } from '../sound.js';

/** Random turret-angle spread of a single puff (radians, full width). */
const PUFF_SPREAD = 0.22;
const PUFF_FLIGHT_Y = 0.72;
const PUFF_RADIUS = 0.42;

/** Spawns one flame puff from the tank's muzzle along its turret heading. */
export function emitFlamePuff(game, tank, opts = {}) {
  sound.playFlamethrower(tank);
  const spread = opts.spread ?? PUFF_SPREAD;
  const speed = opts.speed ?? FLAME_STREAM.PUFF_SPEED;
  const life = opts.life ?? FLAME_STREAM.PUFF_LIFE;
  const damage = opts.damage ?? FLAME_STREAM.DAMAGE_PER_PUFF;
  const muzzleOffset = opts.muzzleOffset ?? tank.rig?.muzzleDist ?? FLAME_STREAM.MUZZLE_OFFSET;

  const angle = tank.turretAngle + (Math.random() - 0.5) * spread;
  const dx = Math.sin(angle);
  const dz = Math.cos(angle);

  const { x, z } = game.traceMuzzle(tank.x, tank.z, dx, dz, muzzleOffset, false);
  const mesh = new THREE.Object3D();
  mesh.position.set(x, PUFF_FLIGHT_Y, z);
  game.fxGroup.add(mesh);

  game.projectiles.push({
    x,
    z,
    vx: dx * speed,
    vz: dz * speed,
    fromPlayer: false,
    damage,
    penetration: 0,
    bulletPower: BULLET_POWER.NONE,
    speed,
    radius: PUFF_RADIUS,
    life,
    maxLife: life,
    isHeavy: false,
    isFlame: true,
    mesh,
  });
  game.fx.point('glow', {
    x,
    y: PUFF_FLIGHT_Y,
    z,
    life: 0.08,
    size: 0.8,
    tex: 0,
    color: [1, 0.55, 0.2],
    alpha: 0.7,
  });
}

export const flameStream = Object.freeze({
  id: 'flameStream',

  /**
   * Main-weapon hook. Against the player the stream needs range, a lined-up turret and an
   * attack token; walls and terrain are burned at half the puff rate; the command base is
   * out of reach of a flamethrower and never targeted.
   */
  fire(tank, game, { target, distToPlayer, aimReady, token }) {
    if (target === 'player') {
      if (distToPlayer > FLAME_STREAM.RANGE || !aimReady || !token) return 0;
      emitFlamePuff(game, tank);
      return FLAME_STREAM.PUFF_INTERVAL;
    }
    if (target === 'base') return 0;
    emitFlamePuff(game, tank);
    return FLAME_STREAM.PUFF_INTERVAL * 2;
  },
});
