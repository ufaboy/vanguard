/**
 * KAMIKAZE ability (WARHEAD module): the tank carries no gun and detonates its warhead
 * on contact with the player. The approach and the zigzag charge are the `hunter` role's job.
 */

import { KAMIKAZE_BLAST } from '../constants.js';

export const CONTACT_WARHEAD = Object.freeze({
  /** World distance to the player that sets the warhead off. */
  TRIGGER_RANGE: 1.65,
});

export const contactWarhead = Object.freeze({
  id: 'contactWarhead',
  /** No main gun: the engine skips aiming, attack tokens and every shooting branch. */
  unarmed: true,
  contactRange: CONTACT_WARHEAD.TRIGGER_RANGE,

  /** Detonates at the tank; the engine then removes the tank without a kill reward. */
  onContact(tank, game) {
    game.detonateExplosionAt(
      tank.x,
      tank.z,
      KAMIKAZE_BLAST.RADIUS,
      KAMIKAZE_BLAST.DAMAGE,
      false,
      null,
      false,
      KAMIKAZE_BLAST.PENETRATION
    );
    return true;
  },
});
