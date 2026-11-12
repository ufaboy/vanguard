/** Decide whether a field supply can currently benefit the player. */
import { POWERUP } from './powerups.js';
import { APS, MISSILE, DURABILITY, getMaxApsAmmo, getMaxMissileAmmo } from './constants.js';

export function isUsefulPowerUp(type, state, pending = []) {
  const count = pending.filter((item) => item.type === type).length;
  switch (type) {
    case POWERUP.MISSILE: {
      const maxMissiles = state.missileMaxAmmo ?? getMaxMissileAmmo(state.upgrades?.frame || 1);
      return state.missileAmmo + count * MISSILE.PICKUP_AMMO < maxMissiles;
    }
    case POWERUP.APS: {
      const maxAps = state.apsMaxAmmo ?? getMaxApsAmmo(state.upgrades?.frame || 1);
      return state.apsAmmo.reduce((sum, n) => sum + n, 0) + count * APS.PICKUP_ROUNDS < maxAps;
    }
    case POWERUP.REPAIR:
      return count === 0 && (state.playerHp < state.playerMaxHp * DURABILITY.OVERHEAL_MAX_RATIO || (state.repairKitState?.charges ?? 0) < (state.repairKitState?.maxCharges ?? 2));
    case POWERUP.BASE_RESTORE:
      return count === 0 && state.baseAlive === false;
    case POWERUP.EMP:
      return count === 0 && state.empTimer <= 0;
    default:
      return false;
  }
}

