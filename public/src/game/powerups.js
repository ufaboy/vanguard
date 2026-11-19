/** Field Power-Ups, Characteristics, and Descriptions. */
import { N_ } from '../i18n/index.js';

export const POWERUP = Object.freeze({
  REPAIR: 'repair',
  EMP: 'emp',
  BASE_RESTORE: 'base_restore',
  APS: 'aps',
  MISSILE: 'missile',
  AMMO: 'ammo',
});

export const POWERUP_MAX_ON_MAP = 16;

export const POWERUP_EFFECT = Object.freeze({
  REPAIR: 'repair',
  EMP: 'emp',
  BASE_RESTORE: 'baseRestore',
  APS: 'aps',
  MISSILE: 'missile',
  AMMO: 'ammo',
});

/** Master catalog of all field Power-Ups with their characteristics and descriptions. */
export const POWERUP_TYPES = Object.freeze({
  [POWERUP.REPAIR]: Object.freeze({
    id: POWERUP.REPAIR,
    code: 'REPAIR',
    name: N_('Field Repair Kit'),
    role: N_('Hull Repair / Standalone Module'),
    duration: 0,
    effect: POWERUP_EFFECT.REPAIR,
    colorHex: 0x22c55e,
    accentHex: '#22c55e',
    description:
      N_('Restores +20 HP (can overheal hull up to 140% of Max HP). If collected at full health, adds one RM-1 charge (maximum 2). Press [1] to restore damaged components and regenerate 25 HP over 10 seconds.'),
    specs: Object.freeze([
      Object.freeze({ label: N_('CRATE CODE'), value: 'REPAIR' }),
      Object.freeze({ label: N_('EFFECT DURATION'), value: 'Instant / Permanent' }),
      Object.freeze({ label: N_('FIELD LIFETIME'), value: 'Until collected' }),
    ]),
  }),

  [POWERUP.EMP]: Object.freeze({
    id: POWERUP.EMP,
    code: 'EMP',
    name: N_('EMP Blast'),
    role: N_('Timed Boost (10s)'),
    duration: 10,
    effect: POWERUP_EFFECT.EMP,
    colorHex: 0x06b6d4,
    accentHex: '#06b6d4',
    description:
      N_('Triggers a sector-wide Electromagnetic Pulse that immobilizes and silences all enemy tanks for 10 seconds.'),
    specs: Object.freeze([
      Object.freeze({ label: N_('CRATE CODE'), value: 'EMP' }),
      Object.freeze({ label: N_('EFFECT DURATION'), value: '10 seconds' }),
      Object.freeze({ label: N_('FIELD LIFETIME'), value: 'Until collected' }),
    ]),
  }),

  [POWERUP.BASE_RESTORE]: Object.freeze({
    id: POWERUP.BASE_RESTORE,
    code: 'HQ RESTORE',
    name: N_('HQ Reconstruction Kit'),
    role: N_('Destroyed Base Recovery'),
    duration: 0,
    effect: POWERUP_EFFECT.BASE_RESTORE,
    colorHex: 0x14b8a6,
    accentHex: '#14b8a6',
    description: N_('Rebuilds the destroyed allied HQ at its original location and restores base repair services. Takes priority on the next successful BOX drop while HQ is destroyed, unless a reconstruction kit is already on the field. Does not reverse mission defeat or restore perimeter walls.'),
    specs: Object.freeze([
      Object.freeze({ label: N_('CRATE CODE'), value: 'HQ RESTORE' }),
      Object.freeze({ label: N_('EFFECT DURATION'), value: 'Instant / Permanent' }),
      Object.freeze({ label: N_('FIELD LIFETIME'), value: 'Until collected' }),
    ]),
  }),

  [POWERUP.APS]: Object.freeze({
    id: POWERUP.APS,
    code: 'APS',
    name: N_('APS (+4 Charges)'),
    role: N_('Standalone Defense Module'),
    duration: 0,
    effect: POWERUP_EFFECT.APS,
    colorHex: 0xeab308,
    accentHex: '#eab308',
    description:
      N_('Replenishes +4 radar-guided interception charges for the standalone 4-corner APS "Arena" module (up to 12 total). Each light shell or missile costs 1 charge; Cannon Mk4/Mk5, Howitzer and BOSS_DUAL shells cost 2 each. Cannot stop flamethrowers or Titan rail shots.'),
    specs: Object.freeze([
      Object.freeze({ label: N_('CRATE CODE'), value: 'APS' }),
      Object.freeze({ label: N_('EFFECT DURATION'), value: 'Instant / Permanent' }),
      Object.freeze({ label: N_('FIELD LIFETIME'), value: 'Until collected' }),
    ]),
  }),

  [POWERUP.MISSILE]: Object.freeze({
    id: POWERUP.MISSILE,
    code: 'MISSILE',
    name: N_('ATGM Homing Missile'),
    role: N_('Standalone Ordnance Module'),
    duration: 0,
    effect: POWERUP_EFFECT.MISSILE,
    colorHex: 0xef4444,
    accentHex: '#ef4444',
    description:
      N_('Adds +1 homing ATGM anti-tank missile to the standalone Turret ATGM Launcher module (30 damage, 80% armor penetration, max 5).'),
    specs: Object.freeze([
      Object.freeze({ label: N_('CRATE CODE'), value: 'MISSILE' }),
      Object.freeze({ label: N_('EFFECT DURATION'), value: 'Instant / Permanent' }),
      Object.freeze({ label: N_('FIELD LIFETIME'), value: 'Until collected' }),
    ]),
  }),
  [POWERUP.AMMO]: Object.freeze({
    id: POWERUP.AMMO,
    code: 'AMMO',
    name: N_('Cannon Shells (+3–7)'),
    role: N_('Ammunition Crate'),
    duration: 0,
    effect: POWERUP_EFFECT.AMMO,
    colorHex: 0xf59e0b,
    accentHex: '#f59e0b',
    description:
      N_('Replenishes 3 to 7 cannon rounds for the main gun (capped by Frame tier capacity 15..50).'),
    specs: Object.freeze([
      Object.freeze({ label: N_('CRATE CODE'), value: 'AMMO' }),
      Object.freeze({ label: N_('EFFECT DURATION'), value: 'Instant / Permanent' }),
      Object.freeze({ label: N_('FIELD LIFETIME'), value: 'Until collected' }),
    ]),
  }),
});

export const POWERUP_DROP_TYPES = Object.freeze([
  POWERUP.REPAIR,
  POWERUP.EMP,
  POWERUP.BASE_RESTORE,
  POWERUP.APS,
  POWERUP.MISSILE,
]);
