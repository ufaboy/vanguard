import { UPGRADE } from './types.js';
import { CANNONS } from './cannons.js';
import { CHASSIS } from './chassis.js';
import { FRAMES } from './frames.js';
import { ENGINES } from './engines.js';
import { ARMORS } from './armors.js';

export const PLAYER_ENGINE_POWER_MULT = 1.1;

export const PLAYER_UPGRADES = Object.freeze({
  [UPGRADE.CANNON]: Object.freeze([
    CANNONS.CANNON_Mk1,
    CANNONS.CANNON_Mk2,
    CANNONS.CANNON_Mk3,
    CANNONS.CANNON_Mk4,
    CANNONS.CANNON_Mk5,
  ]),
  [UPGRADE.CHASSIS]: Object.freeze([
    CHASSIS.CH1,
    CHASSIS.CH2,
    CHASSIS.CH3,
    CHASSIS.CH4,
    CHASSIS.CH5,
  ]),
  [UPGRADE.FRAME]: Object.freeze([
    FRAMES.F1,
    FRAMES.F2,
    FRAMES.F3,
    FRAMES.F4,
    FRAMES.F5,
  ]),
  [UPGRADE.ENGINE]: Object.freeze(
    [ENGINES.E1, ENGINES.E2, ENGINES.E3, ENGINES.E4, ENGINES.E5].map((e, tier) =>
      tier === 0
        ? e
        : Object.freeze({
            ...e,
            power: Math.round(e.power * PLAYER_ENGINE_POWER_MULT),
          })
    )
  ),
  [UPGRADE.ARMOR]: Object.freeze([
    ARMORS.A1,
    ARMORS.A2,
    ARMORS.A3,
    ARMORS.A4,
    ARMORS.A5,
  ]),
});

export const UPGRADE_MAX_LEVEL = Object.freeze({
  [UPGRADE.CANNON]: 5,
  [UPGRADE.CHASSIS]: 5,
  [UPGRADE.FRAME]: 5,
  [UPGRADE.ENGINE]: 5,
  [UPGRADE.ARMOR]: 5,
});

