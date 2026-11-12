/** JAMMER ability: an ECM pulse that blinds the player's APS radar and ATGM guidance. */

import { sound } from '../sound.js';
import { notifyBrainJammed } from '../../sim/behavior/brain.js';
import { rollTankSpecial } from '../../sim/behavior/actions.js';

export const JAMMER_PULSE = Object.freeze({
  /** World-space radius of the pulse. */
  RADIUS: 11.5,
  /** Seconds the player's systems stay jammed after being caught by a pulse. */
  JAM_DURATION: 4.0,
  /** Seconds between pulses. */
  COOLDOWN: 3.4,
});

/** Emits an ECM jammer pulse around `tank`. */
function emitJammerPulse(game, tank) {
  game.fx.jammerPulse(tank.x, 1.1, tank.z, JAMMER_PULSE.RADIUS);
  if (Math.hypot(game.playerX - tank.x, game.playerZ - tank.z) <= JAMMER_PULSE.RADIUS) {
    game.jammedTimer = Math.max(game.jammedTimer, JAMMER_PULSE.JAM_DURATION);
    sound.playJammerPulse(tank);
  }
}

/** A failed `jam` roll: the emitter sparks but nothing is jammed. */
function fizzleJammerPulse(game, tank) {
  game.spawnSparks(tank.x, 1.1, tank.z, 0x06b6d4, 6);
}

export const jammerPulse = Object.freeze({
  id: 'jammerPulse',

  tryUse(tank, game, { brainActive, canSeePlayer }) {
    // The ewar role decides when to dash in and jam; without a brain, jam on sight.
    const wantsJam = brainActive ? tank.brain?.wantJam : canSeePlayer;
    if (!wantsJam) return 0;
    if (rollTankSpecial(tank, 'jam')) emitJammerPulse(game, tank);
    else fizzleJammerPulse(game, tank);
    notifyBrainJammed(tank.brain);
    return JAMMER_PULSE.COOLDOWN;
  },
});
