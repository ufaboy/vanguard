/** Railway rolling stock & moving train configurations (Locomotives and Freight Rail Cars). */

export const TRAIN_UNIT_TYPES = Object.freeze({
  LOCOMOTIVE: 'LOCOMOTIVE',
  RAIL_CAR_CLOSED: 'RAIL_CAR_CLOSED',
  RAIL_CAR_OPEN: 'RAIL_CAR_OPEN',
});

export const TRAIN_UNIT_CONFIGS = Object.freeze({
  [TRAIN_UNIT_TYPES.LOCOMOTIVE]: Object.freeze({
    id: 'LOCOMOTIVE',
    glbKey: 'LOCOMOTIVE',
    name: 'Heavy Diesel Locomotive',
    maxHP: 16,
    spanCells: 2,
    length: 3.92,
    width: 1.48,
    hitRadius: 1.02,
    ramDamage: 18,
    ramKnockback: 3.4,
    normalShellDamage: 1,
    heavyShellDamage: 2,
    artilleryDamage: 4,
    paintHex: 0x2563eb,
    glowHex: 0xfef08a,
  }),
  [TRAIN_UNIT_TYPES.RAIL_CAR_CLOSED]: Object.freeze({
    id: 'RAIL_CAR_CLOSED',
    glbKey: 'RAIL_CAR_CLOSED',
    variant: 'closed',
    name: 'Armored Boxcar',
    maxHP: 10,
    spanCells: 2,
    length: 3.88,
    width: 1.44,
    hitRadius: 0.98,
    ramDamage: 12,
    ramKnockback: 2.8,
    normalShellDamage: 1,
    heavyShellDamage: 2,
    artilleryDamage: 4,
  }),
  [TRAIN_UNIT_TYPES.RAIL_CAR_OPEN]: Object.freeze({
    id: 'RAIL_CAR_OPEN',
    glbKey: 'RAIL_CAR_OPEN',
    variant: 'open',
    name: 'Open Gondola Rail Car',
    maxHP: 10,
    spanCells: 2,
    length: 3.88,
    width: 1.44,
    hitRadius: 0.98,
    ramDamage: 12,
    ramKnockback: 2.8,
    normalShellDamage: 1,
    heavyShellDamage: 2,
    artilleryDamage: 4,
  }),
});

export const TRAIN_DEFAULTS = Object.freeze({
  speed: 5.2,
  transitRespawnSec: 14.0,
  unitGap: 0.16,
  offscreenMargin: 4.5,
  hornAheadDist: 12.0,
  hornCooldownSec: 3.5,
  ramCooldownSec: 0.65,
  defaultConsist: Object.freeze([
    TRAIN_UNIT_TYPES.LOCOMOTIVE,
    TRAIN_UNIT_TYPES.RAIL_CAR_CLOSED,
    TRAIN_UNIT_TYPES.RAIL_CAR_OPEN,
  ]),
});
