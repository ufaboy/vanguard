/**
 * Enemy abilities: special mechanics a tank type plugs in from its config, next to its
 * tactical role (`behavior`, see sim/behavior/brain.js).
 *
 *   tanks.js:  [TANK_TYPES.SAPPER]: { behavior: 'minelayer', abilities: ['mineLayer'], ... }
 *
 * An ability is a plain object with an `id` (registry key used in tank configs) and any of
 * these optional hooks:
 *   init(tank, game)            once, when the tank spawns (e.g. load ammunition)
 *   tryUse(tank, game, ctx)     special slot: called while tank.specialCooldown <= 0; returns
 *                               the cooldown in seconds when it acted, or 0 to let the next
 *                               ability try. ctx = { brainActive, canSeePlayer }
 *   fire(tank, game, ctx)       main weapon: replaces the standard gun shot; returns the
 *                               reload in seconds when it fired, or 0 to hold fire.
 *                               ctx = { target: 'player' | 'base' | 'breach' | 'terrain',
 *                                       distToPlayer, aimReady, token }
 *   unarmed: true               the tank has no gun at all (no aiming, no attack token)
 *   contactRange + onContact(tank, game)
 *                               fires when the tank touches the player; returning true
 *                               means the tank is spent and the engine removes it
 * `game` is the TankGameEngine: abilities use its world services (fx, projectiles, grid,
 * mines, player state) but keep their own decision logic and tuning here.
 */

import { mineLayer } from './mine-layer.js';
import { jammerPulse } from './jammer-pulse.js';
import { engineerSupport } from './engineer-support.js';
import { flameStream } from './flame-stream.js';
import { contactWarhead } from './contact-warhead.js';

export const ABILITIES = Object.freeze({
  [mineLayer.id]: mineLayer,
  [jammerPulse.id]: jammerPulse,
  [engineerSupport.id]: engineerSupport,
  [flameStream.id]: flameStream,
  [contactWarhead.id]: contactWarhead,
});

/** Ability objects for a tank config; unknown ids throw so a typo in tanks.js fails loudly. */
export function resolveAbilities(ids = []) {
  return ids.map((id) => {
    const ability = ABILITIES[id];
    if (!ability) throw new Error(`Unknown enemy ability "${id}"`);
    return ability;
  });
}

/**
 * Gives a freshly spawned tank its abilities and lets each one initialise its state.
 * Also caches the hooks the engine asks for every frame:
 *   tank.armed          false when an ability removes the gun
 *   tank.weaponAbility  the ability that replaces the main gun, or null
 *   tank.contactAbility the ability that reacts to touching the player, or null
 */
export function equipAbilities(tank, ids, game) {
  tank.abilities = resolveAbilities(ids);
  tank.armed = !tank.abilities.some((ability) => ability.unarmed);
  tank.weaponAbility = tank.abilities.find((ability) => ability.fire) ?? null;
  tank.contactAbility = tank.abilities.find((ability) => ability.onContact) ?? null;
  for (const ability of tank.abilities) ability.init?.(tank, game);
  return tank.abilities;
}

/**
 * Runs the tank's special slot: the first ability that acts sets tank.specialCooldown.
 * @returns {string|null} id of the ability that acted
 */
export function updateAbilities(tank, game, ctx) {
  if (!tank.abilities?.length || tank.specialCooldown > 0) return null;
  for (const ability of tank.abilities) {
    if (!ability.tryUse) continue;
    const cooldown = ability.tryUse(tank, game, ctx);
    if (cooldown > 0) {
      tank.specialCooldown = cooldown;
      return ability.id;
    }
  }
  return null;
}

/**
 * Fires the tank's ability weapon instead of the standard gun.
 * @returns {number|null} null when the tank has no ability weapon (use the standard gun);
 *   otherwise the reload that was applied to tank.fireCooldown, or 0 when it held fire
 */
export function fireAbilityWeapon(tank, game, ctx) {
  if (!tank.weaponAbility) return null;
  const reload = tank.weaponAbility.fire(tank, game, ctx);
  if (reload > 0) tank.fireCooldown = reload;
  return reload > 0 ? reload : 0;
}

/** True when the tank's contact ability triggers at this distance to the player. */
export function inContactRange(tank, distToPlayer) {
  return Boolean(tank.contactAbility) && distToPlayer <= tank.contactAbility.contactRange;
}
