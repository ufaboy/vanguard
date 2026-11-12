/** Tank Types, Characteristics, Loadouts, and Descriptions. */

import { defineBehavior } from '../sim/behavior/actions.js';

/**
 * Base ("hull") of a tank type: its own durability, mass, per-side armour, sight and radio range.
 * Components and modules add to it in computeTankStats (constants.js):
 *   HP = base.hp + component and module hpBonus; mass = base.mass + component and module mass;
 *   armour per side = base.armor[side] + armour component (+ module armour); sight and radio
 *   come from the base (+ module bonuses). Speed follows total mass and engine power.
 * Tune a single tank type here instead of creating a stat-only module.
 */
export function tankBase({ hp = 12, mass = 0, armor = {}, sightRadius = 18, radioAlertRadius = 22 } = {}) {
  return Object.freeze({
    hp,
    mass,
    armor: Object.freeze({ front: 0, left: 0, right: 0, rear: 0, ...armor }),
    sightRadius,
    radioAlertRadius,
  });
}

export const TANK_TYPES = Object.freeze({
  SCOUT: 'scout',
  STANDARD: 'standard',
  HOWITZER: 'howitzer',
  ARMOR: 'armor',
  SAPPER: 'sapper',
  HOVER: 'hover',
  KAMIKAZE: 'kamikaze',
  FLAMETHROWER: 'flamethrower',
  JAMMER: 'jammer',
  ENGINEER: 'engineer',
  STRIKER: 'striker',
  STEALTH: 'stealth',
});

export const EnemyClass = Object.freeze({
  ...TANK_TYPES,
  BOSS_MAMMOTH: 'bossMammoth',
  BOSS_HYDRA: 'bossHydra',
  BOSS_INFERNO: 'bossInferno',
  BOSS_TITAN: 'bossTitan',
  SNIPER: TANK_TYPES.STANDARD,
  HEAVY: TANK_TYPES.ARMOR,
  ARTILLERY: TANK_TYPES.HOWITZER,
  MINE_LAYER: TANK_TYPES.SAPPER,
  MISSILES: TANK_TYPES.STRIKER,
});

/** Player Modular Main Battle Tank (MBT) specification and description. */
export const PLAYER_TANK_CONFIG = Object.freeze({
  id: 'player_mbt',
  code: 'MBT-VANGUARD',
  name: 'Player Modular MBT',
  role: '5×5 Customizable Hero Tank',
  accentHex: '#3B82F6',
  isPlayerMbt: true,
  base: tankBase({ hp: 22, sightRadius: 28.0, radioAlertRadius: 28.0 }),
  description:
    'Allied command main battle tank featuring 5 independent 5-level development tracks.',
  defaultLoadout: Object.freeze({
    gun: 'CANNON_Mk1',
    chassis: 'CH1',
    frame: 'F1',
    engine: 'E1',
    armor: 'A1',
    optionalEquipment: Object.freeze([
      'APS_MODULE',
      'ROCKET_LAUNCHER',
    ]),
  }),
  specs: Object.freeze([
    Object.freeze({ label: 'CANNON (Mk1–Mk5)', value: 'Cannon Mk1 → Cannon Mk2 → Cannon Mk3 → Cannon Mk4 → Cannon Mk5' }),
    Object.freeze({ label: 'CHASSIS (CH1–CH5)', value: '5-Wheel → Chevron → 7-Wheel → Hover → Quad-Grav' }),
    Object.freeze({ label: 'FRAME (F1–F5)', value: 'Monocoque → Bull-Bar → Reinforced → Exo-Truss → Siege Ram' }),
    Object.freeze({ label: 'ENGINE (E1–E5)', value: 'Diesel → V8 → V12 → Turbine → Fusion Core' }),
    Object.freeze({ label: 'ARMOR (A1–A5)', value: 'Rolled → Appliqué → ERA → Chobham → Relikt' }),
    Object.freeze({ label: 'BASE HULL', value: '22 HP · 28m sight · 28m radio' }),
    Object.freeze({ label: 'MODULES', value: 'APS + ATGM' }),
  ]),
});

/**
 * Master configuration, component loadouts, and descriptions for all 12 enemy tank types.
 *
 * Per-tank AI settings:
 *   behavior   defineBehavior(role, actions): the tactical role (sim/behavior/brain.js) and the
 *              actions in priority order, each with its own luck (sim/behavior/actions.js).
 *   artillery  indirect-fire weapon timing: aimSec = aiming before each shot (the turret tracks
 *              the target), flightSec = shell flight time from launch to impact.
 *              Defaults: ARTILLERY.AIM_TIME / ARTILLERY.FLIGHT_TIME (constants.js).
 *   missile    enemy missiles: homing = whether missiles steer toward the player after launch.
 *              A missed shot (failed shoot roll) never homes. Default: { homing: true }.
 */
export const TANK_CONFIGS = Object.freeze({
  [TANK_TYPES.SCOUT]: Object.freeze({
    id: TANK_TYPES.SCOUT,
    code: 'SCOUT',
    behavior: defineBehavior('flanker', [
      { id: 'move_to_player', luck: 0.8 },
      { id: 'follow_route', luck: 0.80 },
      { id: 'move_to_player_base', luck: 0.60 },
      { id: 'patrol_zone', luck: 1.00 },
      { id: 'shoot_player', luck: 0.55 },
      { id: 'shoot_player_base', luck: 0.40 },
      { id: 'shoot_obstacle', luck: 0.90 },
      { id: 'shoot_random', luck: 1.00 },
    ]),
    name: 'Recon Light Tank "Viper"',
    role: 'Fast Flanking Recon',
    base: tankBase({ sightRadius: 26.0, radioAlertRadius: 28.0 }),
    description:
      'High-speed reconnaissance vehicle built on an ultra-light CH_SCOUT suspension, F1 monocoque frame, E3 V12 engine, and unarmored A0 hull (12 HP, 0% armor). Armed with a rapid-fire 30mm AUTOCANNON to strip APS charges and chew through brick cover, plus 26m recon optics and a 28m radio relay.',
    loadoutSummary: 'AUTOCANNON · CH_SCOUT · F1 · E3 · A0',
    sizeClass: 'Light · 0.85× STANDARD footprint',
    loadout: Object.freeze({
      gun: 'AUTOCANNON',
      chassis: 'CH_SCOUT',
      frame: 'F1',
      engine: 'E3',
      armor: 'A0',
    }),
    accentHex: '#F97316',
  }),

  [TANK_TYPES.STANDARD]: Object.freeze({
    id: TANK_TYPES.STANDARD,
    code: 'STANDARD',
    behavior: defineBehavior('line', [
      { id: 'take_cover', luck: 0.80 },
      { id: 'move_to_player', luck: 0.70 },
      { id: 'defend_enemy_base', luck: 1.00 },
      { id: 'follow_route', luck: 0.75 },
      { id: 'move_to_player_base', luck: 0.65 },
      { id: 'patrol_zone', luck: 1.00 },
      { id: 'shoot_player', luck: 0.75 },
      { id: 'shoot_player_base', luck: 0.50 },
      { id: 'shoot_obstacle', luck: 0.75 },
      { id: 'shoot_random', luck: 1.00 },
    ]),
    name: 'Line Battle Tank "Lancet"',
    role: 'Standard Combat Tank',
    base: tankBase({ sightRadius: 18.0, radioAlertRadius: 22.0 }),
    description:
      'Backbone frontline combat tank armed with a Cannon Mk2 on a mobile CH2/F2 chassis with light A1 rolled steel plating (16 HP, 8% armor reduction).',
    loadoutSummary: 'CANNON_Mk2 · CH2 · F2 · E2 · A1',
    sizeClass: 'Medium · STANDARD reference footprint',
    loadout: Object.freeze({
      gun: 'CANNON_Mk2',
      chassis: 'CH2',
      frame: 'F2',
      engine: 'E2',
      armor: 'A1',
    }),
    accentHex: '#38BDF8',
  }),

  [TANK_TYPES.HOWITZER]: Object.freeze({
    id: TANK_TYPES.HOWITZER,
    code: 'HOWITZER',
    behavior: defineBehavior('artillery', [
      { id: 'take_cover', luck: 0.70 },
      { id: 'move_to_player', luck: 0.75 },
      { id: 'follow_route', luck: 0.70 },
      { id: 'move_to_player_base', luck: 0.50 },
      { id: 'patrol_zone', luck: 1.00 },
      { id: 'shoot_player', luck: 0.65 },
      { id: 'shoot_player_base', luck: 0.60 },
      { id: 'shoot_obstacle', luck: 0.75 },
      { id: 'shoot_random', luck: 1.00 },
    ]),
    artillery: Object.freeze({ aimSec: 1.75, flightSec: 1.75 }),
    name: 'SPG Howitzer "Grad"',
    role: 'Indirect Artillery Platform',
    base: tankBase({ sightRadius: 20.0, radioAlertRadius: 20.0 }),
    description:
      'Self-propelled artillery platform mounting a 152mm HOWITZER that lobs high-arcing shells (40 splash dmg, 1.5-cell radius) over obstacles. Built on a light CH2/F2 chassis with A1 armor (16 HP, 8% reduction).',
    loadoutSummary: 'HOWITZER (Special) · CH2 · F2 · E2 · A1',
    sizeClass: 'Medium · 1.0× STANDARD footprint',
    loadout: Object.freeze({
      gun: 'HOWITZER',
      chassis: 'CH2',
      frame: 'F2',
      engine: 'E2',
      armor: 'A1',
    }),
    accentHex: '#14B8A6',
  }),

  [TANK_TYPES.ARMOR]: Object.freeze({
    id: TANK_TYPES.ARMOR,
    code: 'ARMOR',
    behavior: defineBehavior('spearhead', [
      { id: 'move_to_player', luck: 0.75 },
      { id: 'defend_enemy_base', luck: 1.00 },
      { id: 'follow_route', luck: 0.75 },
      { id: 'move_to_player_base', luck: 0.60 },
      { id: 'patrol_zone', luck: 1.00 },
      { id: 'shoot_player', luck: 0.80 },
      { id: 'shoot_player_base', luck: 0.60 },
      { id: 'shoot_obstacle', luck: 0.80 },
      { id: 'shoot_random', luck: 1.00 },
    ]),
    name: 'Heavy Breakthrough Tank "Bulwark"',
    role: 'Heavy Assault Armor',
    base: tankBase({ hp: 50, armor: { front: 40, left: 20, right: 20, rear: 5 }, sightRadius: 16.0, radioAlertRadius: 20.0 }),
    description:
      'Heavily armored breakthrough tank mounting a Cannon Mk4 on a reinforced CH3 torsion chassis and F3 frame with A3 Kontakt-5 ERA plating over a reinforced breakthrough hull (52 HP; 59% front, 36% sides, 29% rear protection, relative to the hull).',
    loadoutSummary: 'CANNON_Mk4 · CH3 · F3 · E2 · A3',
    sizeClass: 'Heavy · 1.3× STANDARD footprint',
    loadout: Object.freeze({
      gun: 'CANNON_Mk4',
      chassis: 'CH3',
      frame: 'F3',
      engine: 'E2',
      armor: 'A3',
    }),
    accentHex: '#EF4444',
  }),

  [TANK_TYPES.SAPPER]: Object.freeze({
    id: TANK_TYPES.SAPPER,
    code: 'SAPPER',
    behavior: defineBehavior('minelayer', [
      { id: 'move_to_player', luck: 0.70 },
      { id: 'follow_route', luck: 0.75 },
      { id: 'patrol_zone', luck: 1.00 },
      { id: 'shoot_player', luck: 0.35 },
      { id: 'shoot_obstacle', luck: 0.75 },
      { id: 'shoot_random', luck: 1.00 },
      { id: 'set_mine', luck: 1.00 },
    ]),
    abilities: Object.freeze(['mineLayer']),
    name: 'Combat Sapper "Mole"',
    role: 'Tactical Minelayer',
    base: tankBase({ sightRadius: 17.0, radioAlertRadius: 20.0, hp: 20 }),
    description:
      'Armored sapper vehicle combining reinforced CH3/F3 running gear and A2 appliqué armor (32 HP, 16% armor reduction) with a standalone MINE_LAYER dispenser module (deploys up to 3 proximity mines) and a DOZER_BLADE module for clearing obstacles.',
    loadoutSummary: 'CANNON_Mk1 · CH3 · F3 · E3 · A2 + [MINE_LAYER, DOZER_BLADE]',
    sizeClass: 'Medium · 0.95× STANDARD footprint',
    loadout: Object.freeze({
      gun: 'CANNON_Mk1',
      chassis: 'CH3',
      frame: 'F3',
      engine: 'E3',
      armor: 'A2',
      optionalEquipment: Object.freeze(['MINE_LAYER', 'DOZER_BLADE']),
    }),
    accentHex: '#EAB308',
  }),

  [TANK_TYPES.HOVER]: Object.freeze({
    id: TANK_TYPES.HOVER,
    code: 'HOVER',
    behavior: defineBehavior('raider', [
      { id: 'move_to_player', luck: 0.75 },
      { id: 'follow_route', luck: 0.75 },
      { id: 'patrol_zone', luck: 1.00 },
      { id: 'shoot_player', luck: 0.40 },
      { id: 'shoot_player_base', luck: 0.40 },
      { id: 'shoot_obstacle', luck: 0.75 },
      { id: 'shoot_random', luck: 1.00 },
    ]),
    name: 'Amphibious Hover Tank "Zephyr"',
    role: 'Amphibious Hover Raider',
    base: tankBase({ sightRadius: 20.0, radioAlertRadius: 22.0 }),
    description:
      'High-mobility amphibious assault craft riding on an enemy-only CH_HOVER air-cushion skirt with F1 frame and A1 plating (16 HP, 8% reduction). Crosses deep water channels and ignores ice slippage.',
    loadoutSummary: 'CANNON_Mk2 · CH_HOVER · F1 · E3 · A1',
    sizeClass: 'Medium-wide · 1.2× STANDARD footprint (wide air-cushion skirt)',
    loadout: Object.freeze({
      gun: 'CANNON_Mk2',
      chassis: 'CH_HOVER',
      frame: 'F1',
      engine: 'E3',
      armor: 'A1',
    }),
    accentHex: '#06B6D4',
  }),

  [TANK_TYPES.KAMIKAZE]: Object.freeze({
    id: TANK_TYPES.KAMIKAZE,
    code: 'KAMIKAZE',
    behavior: defineBehavior('hunter', [
      { id: 'ambush', luck: 0.70 },
      { id: 'move_to_player', luck: 0.70 },
      { id: 'follow_route', luck: 0.75 },
      { id: 'move_to_player_base', luck: 0.50 },
      { id: 'patrol_zone', luck: 1.00 },
    ]),
    abilities: Object.freeze(['contactWarhead']),
    name: 'Demolition Breacher "Storm"',
    role: 'Explosive Rammer',
    base: tankBase({ sightRadius: 16.0, radioAlertRadius: 18.0 }),
    description:
      'Turretless nitro-injected demolition vehicle using a CH_SCOUT suspension, F_RAM frame, E_NITRO overdrive engine, unarmored A0 hull (12 HP, 0% armor), and a nose-mounted shaped WARHEAD (36 contact damage).',
    loadoutSummary: 'NONE Gun · CH_SCOUT · F_RAM · E_NITRO · A0 + [WARHEAD]',
    sizeClass: 'Compact · 0.7× STANDARD footprint',
    loadout: Object.freeze({
      gun: 'NONE',
      chassis: 'CH_SCOUT',
      frame: 'F_RAM',
      engine: 'E_NITRO',
      armor: 'A0',
      optionalEquipment: Object.freeze(['WARHEAD']),
    }),
    accentHex: '#FB923C',
  }),

  [TANK_TYPES.FLAMETHROWER]: Object.freeze({
    id: TANK_TYPES.FLAMETHROWER,
    code: 'FLAMETHROWER',
    behavior: defineBehavior('ambusher', [
      { id: 'ambush', luck: 0.80 },
      { id: 'move_to_player', luck: 0.70 },
      { id: 'follow_route', luck: 0.75 },
      { id: 'patrol_zone', luck: 1.00 },
      { id: 'shoot_player', luck: 0.65 },
      { id: 'shoot_obstacle', luck: 0.75 },
      { id: 'shoot_random', luck: 1.00 },
    ]),
    abilities: Object.freeze(['flameStream']),
    name: 'Thermal Assault "Hephaestus"',
    role: 'Close-Range Incendiary',
    base: tankBase({ sightRadius: 15.0, radioAlertRadius: 18.0 }),
    description:
      'Mounts a high-pressure FLAMETHROWER thermal projector on a heavy CH3/F3 hull with A3 ERA plating (40 HP, 24% armor reduction). Incinerates forest cover and bypasses APS interception at close range.',
    loadoutSummary: 'FLAMETHROWER (Special) · CH3 · F3 · E3 · A3',
    sizeClass: 'Medium-heavy · 1.0× STANDARD footprint',
    loadout: Object.freeze({
      gun: 'FLAMETHROWER',
      chassis: 'CH3',
      frame: 'F3',
      engine: 'E3',
      armor: 'A3',
    }),
    accentHex: '#F43F5E',
  }),

  [TANK_TYPES.JAMMER]: Object.freeze({
    id: TANK_TYPES.JAMMER,
    code: 'JAMMER',
    behavior: defineBehavior('ewar', [
      { id: 'take_cover', luck: 0.70 },
      { id: 'move_to_player', luck: 0.85 },
      { id: 'follow_route', luck: 0.75 },
      { id: 'patrol_zone', luck: 1.00 },
      { id: 'shoot_player', luck: 0.70 },
      { id: 'shoot_obstacle', luck: 0.75 },
      { id: 'shoot_random', luck: 1.00 },
      { id: 'jam', luck: 0.85 },
    ]),
    abilities: Object.freeze(['jammerPulse']),
    name: 'ECM Warfare Tank "Veil"',
    role: 'Electronic Warfare Support',
    base: tankBase({ sightRadius: 21.0, radioAlertRadius: 26.0 }),
    description:
      'Carries a rotating broadband JAMMER dome on a CH2/F2 chassis with A2 reinforced appliqué armor (26 HP, 16% armor reduction) that disables player APS radar interception and ATGM guidance within radius.',
    loadoutSummary: 'CANNON_Mk2 · CH2 · F2 · E3 · A2 + [JAMMER]',
    sizeClass: 'Medium · 1.0× STANDARD footprint',
    loadout: Object.freeze({
      gun: 'CANNON_Mk2',
      chassis: 'CH2',
      frame: 'F2',
      engine: 'E3',
      armor: 'A2',
      optionalEquipment: Object.freeze(['JAMMER']),
    }),
    accentHex: '#A855F7',
  }),

  [TANK_TYPES.ENGINEER]: Object.freeze({
    id: TANK_TYPES.ENGINEER,
    code: 'ENGINEER',
    behavior: defineBehavior('support', [
      { id: 'take_cover', luck: 0.80 },
      { id: 'move_to_player', luck: 0.75 },
      { id: 'defend_enemy_base', luck: 1.00 },
      { id: 'follow_route', luck: 0.75 },
      { id: 'patrol_zone', luck: 1.00 },
      { id: 'shoot_player', luck: 0.30 },
      { id: 'shoot_obstacle', luck: 0.75 },
      { id: 'shoot_random', luck: 1.00 },
      { id: 'repair_ally', luck: 0.90 },
      { id: 'build_brick', luck: 1.00 },
    ]),
    abilities: Object.freeze(['engineerSupport']),
    name: 'Combat Engineer "Bastion"',
    role: 'Field Builder & Repair',
    base: tankBase({ sightRadius: 17.0, radioAlertRadius: 20.0 }),
    description:
      'Built on an F3 reinforced frame with CH2 tracks and A1 steel plating (18 HP, 8% armor reduction), carrying a standalone DOZER_BLADE module and a BUILDER_KIT module to erect brick fortifications and weld damaged allied hulls.',
    loadoutSummary: 'CANNON_Mk1 · CH2 · F3 · E2 · A1 + [DOZER_BLADE, BUILDER_KIT]',
    sizeClass: 'Light · 0.85× STANDARD footprint',
    loadout: Object.freeze({
      gun: 'CANNON_Mk1',
      chassis: 'CH2',
      frame: 'F3',
      engine: 'E2',
      armor: 'A1',
      optionalEquipment: Object.freeze(['DOZER_BLADE', 'BUILDER_KIT']),
    }),
    accentHex: '#10B981',
  }),

  [TANK_TYPES.STRIKER]: Object.freeze({
    id: TANK_TYPES.STRIKER,
    code: 'STRIKER',
    behavior: defineBehavior('standoff', [
      { id: 'take_cover', luck: 0.65 },
      { id: 'move_to_player', luck: 0.85 },
      { id: 'follow_route', luck: 0.75 },
      { id: 'move_to_player_base', luck: 0.50 },
      { id: 'patrol_zone', luck: 1.00 },
      { id: 'shoot_player', luck: 0.75 },
      { id: 'shoot_player_base', luck: 0.50 },
      { id: 'shoot_obstacle', luck: 0.75 },
      { id: 'shoot_random', luck: 1.00 },
    ]),
    missile: Object.freeze({ homing: true }),
    name: 'ATGM Striker "Vortex"',
    role: 'Guided Missile Carrier',
    base: tankBase({ sightRadius: 22.0, radioAlertRadius: 22.0 }),
    description:
      'Pairs a Cannon Mk2 with twin turret-mounted ROCKET_LAUNCHER pods on a CH2/F2 chassis with A2 reinforced armor (26 HP, 16% armor reduction) to fire homing anti-tank guided missiles.',
    loadoutSummary: 'CANNON_Mk2 · CH2 · F2 · E3 · A2 + [ROCKET_LAUNCHER]',
    sizeClass: 'Medium · 1.1× STANDARD footprint',
    loadout: Object.freeze({
      gun: 'CANNON_Mk2',
      chassis: 'CH2',
      frame: 'F2',
      engine: 'E3',
      armor: 'A2',
      optionalEquipment: Object.freeze(['ROCKET_LAUNCHER']),
    }),
    accentHex: '#3B82F6',
  }),

  [TANK_TYPES.STEALTH]: Object.freeze({
    id: TANK_TYPES.STEALTH,
    code: 'STEALTH',
    behavior: defineBehavior('sniper', [
      { id: 'take_cover', luck: 0.80 },
      { id: 'move_to_player', luck: 0.65 },
      { id: 'follow_route', luck: 0.75 },
      { id: 'patrol_zone', luck: 1.00 },
      { id: 'shoot_player', luck: 0.75 },
      { id: 'shoot_obstacle', luck: 0.75 },
      { id: 'shoot_random', luck: 1.00 },
    ]),
    name: 'Stealth Hunter "Phantom"',
    role: 'Optical Camouflage Sniper',
    base: tankBase({ sightRadius: 23.0, radioAlertRadius: 22.0 }),
    description:
      'Built on a CH2/F2 hull with radar-absorbent A_STEALTH carbon composite skin (16 HP, 10% armor reduction), a high-velocity Cannon Mk3, E4 turbine, and an active CLOAK module that bends light at range.',
    loadoutSummary: 'CANNON_Mk3 · CH2 · F2 · E4 · A_STEALTH + [CLOAK]',
    sizeClass: 'Medium · 1.05× STANDARD footprint (low profile)',
    loadout: Object.freeze({
      gun: 'CANNON_Mk3',
      chassis: 'CH2',
      frame: 'F2',
      engine: 'E4',
      armor: 'A_STEALTH',
      optionalEquipment: Object.freeze(['CLOAK']),
    }),
    accentHex: '#64748B',
  }),
});

/** Sector Boss variant configurations and descriptions. */
export const SECTOR_BOSS_CONFIGS = Object.freeze({
  [EnemyClass.BOSS_MAMMOTH]: Object.freeze({
    id: 'boss_mammoth',
    enemyClass: EnemyClass.BOSS_MAMMOTH,
    code: 'BOSS-01',
    behavior: defineBehavior('dreadnought', [
      { id: 'move_to_player', luck: 0.85 },
      { id: 'defend_enemy_base', luck: 1.00 },
      { id: 'follow_route', luck: 0.85 },
      { id: 'move_to_player_base', luck: 0.70 },
      { id: 'patrol_zone', luck: 1.00 },
      { id: 'shoot_player', luck: 0.90 },
      { id: 'shoot_player_base', luck: 0.70 },
      { id: 'shoot_obstacle', luck: 0.90 },
      { id: 'shoot_random', luck: 1.00 },
    ]),
    artillery: Object.freeze({ aimSec: 0, flightSec: 1.75 }),
    missile: Object.freeze({ homing: true }),
    name: 'MAMMOTH MK-V',
    role: 'Sector 01 Dreadnought Boss',
    accentHex: '#F59E0B',
    base: tankBase({ hp: 276, sightRadius: 28.0, radioAlertRadius: 32.0 }),
    loadoutSummary: 'BOSS_DUAL · CH_TITAN · F_TITAN · E_OMEGA · A_OMEGA + [ROCKET_LAUNCHER]',
    sizeClass: 'Super-heavy · 1.7× STANDARD footprint',
    specialFeatureLabel: 'SPECIAL ABILITY',
    specialFeatureValue: 'Dual Siege AP + Homing ATGM Salvo + Onboard APS; Phase Shield & Escort at 50% HP',
    description:
      'Super-heavy siege dreadnought commanding Sector 01 (400 HP, 40% armor) with onboard ATGM active protection. Built on enemy-exclusive BOSS_DUAL cannons, CH_TITAN chassis, F_TITAN siege frame, E_OMEGA reactor, A_OMEGA citadel armor, and standalone ROCKET_LAUNCHER [MODULE]. At 50% HP it activates a phase shield, enters citadel overdrive, and calls an armored escort.',
    loadout: Object.freeze({
      gun: 'BOSS_DUAL',
      chassis: 'CH_TITAN',
      frame: 'F_TITAN',
      engine: 'E_OMEGA',
      armor: 'A_OMEGA',
      optionalEquipment: Object.freeze(['ROCKET_LAUNCHER']),
    }),
  }),

  [EnemyClass.BOSS_HYDRA]: Object.freeze({
    id: 'boss_hydra',
    enemyClass: EnemyClass.BOSS_HYDRA,
    code: 'BOSS-02',
    behavior: defineBehavior('cruiser', [
      { id: 'move_to_player', luck: 0.85 },
      { id: 'defend_enemy_base', luck: 1.00 },
      { id: 'follow_route', luck: 0.85 },
      { id: 'patrol_zone', luck: 1.00 },
      { id: 'shoot_player', luck: 0.90 },
      { id: 'shoot_obstacle', luck: 0.90 },
      { id: 'shoot_random', luck: 1.00 },
    ]),
    missile: Object.freeze({ homing: true }),
    name: 'HYDRA MLRS-9',
    role: 'Sector 02 Artillery Cruiser Boss',
    accentHex: '#06B6D4',
    base: tankBase({ hp: 260, sightRadius: 28.0, radioAlertRadius: 32.0 }),
    loadoutSummary: 'HYDRA_MLRS · CH_HYDRA · F_HYDRA · E_OMEGA · A_HYDRA + [ROCKET_LAUNCHER]',
    sizeClass: 'Super-heavy · 1.5× STANDARD footprint (long, low hull)',
    specialFeatureLabel: 'SPECIAL ABILITY',
    specialFeatureValue: 'MLRS Salvo + Close-Range Flame & Homing ATGM + Onboard APS; Phase 2 & Escort at 50% HP',
    description:
      'Amphibious rocket-artillery cruiser guarding Sector 02 (380 HP, 50% reduction) with onboard ATGM active protection. Three articulated 9-tube MLRS launcher heads saturate marked zones with telegraphed rocket salvos from beyond direct-fire range, while a close-defense flamethrower and homing ATGM salvo punish tanks that break inside 6 cells. Below 50% hull integrity it activates a phase shield, calls amphibious/scout reinforcements, and overclocks its surviving heads.',
    loadout: Object.freeze({
      gun: 'HYDRA_MLRS',
      chassis: 'CH_HYDRA',
      frame: 'F_HYDRA',
      engine: 'E_OMEGA',
      armor: 'A_HYDRA',
      optionalEquipment: Object.freeze(['ROCKET_LAUNCHER']),
    }),
  }),

  [EnemyClass.BOSS_INFERNO]: Object.freeze({
    id: 'boss_inferno',
    enemyClass: EnemyClass.BOSS_INFERNO,
    code: 'BOSS-04',
    behavior: defineBehavior('juggernaut', [
      { id: 'move_to_player', luck: 0.90 },
      { id: 'defend_enemy_base', luck: 1.00 },
      { id: 'follow_route', luck: 0.85 },
      { id: 'move_to_player_base', luck: 0.75 },
      { id: 'patrol_zone', luck: 1.00 },
      { id: 'shoot_player', luck: 0.92 },
      { id: 'shoot_player_base', luck: 0.75 },
      { id: 'shoot_obstacle', luck: 0.90 },
      { id: 'shoot_random', luck: 1.00 },
      { id: 'set_mine', luck: 0.90 },
    ]),
    abilities: Object.freeze(['mineLayer']),
    missile: Object.freeze({ homing: true }),
    name: 'CERBERUS-T',
    role: 'Thermobaric Siege Leviathan',
    accentHex: '#FF4500',
    base: tankBase({ hp: 292, sightRadius: 28.0, radioAlertRadius: 32.0 }),
    loadoutSummary: 'INFERNO_THERMO · CH_INFERNO · F_INFERNO · E_INFERNO · A_INFERNO + [DOZER_BLADE, MINE_LAYER, ROCKET_LAUNCHER]',
    sizeClass: 'Super-heavy · 1.65× STANDARD footprint (dozer-ram leviathan)',
    specialFeatureLabel: 'SPECIAL ABILITY',
    specialFeatureValue: '2.5-Cell Thermobaric Vaporizer + Overdrive Ram + Homing ATGM + Mine Layer; Escort at 50% HP',
    description:
      'Super-heavy thermobaric siege leviathan (440 HP, 50% front / 38% side / 25% rear) equipped with a wide demolition DOZER_BLADE, rear MINE_LAYER dispenser, turret ROCKET_LAUNCHER pods, and onboard APS. Fires 240mm fuel-air thermobaric shells that detonate in a 2.5-cell radius, vaporizing forest, brick, concrete, ice, and water into scorched sand. Periodically engages nitro overdrive to ram straight through brick defenses. At 50% HP it deploys a phase shield, calls flamethrower/kamikaze escorts, and accelerates all weapon cycles.',
    loadout: Object.freeze({
      gun: 'INFERNO_THERMO',
      chassis: 'CH_INFERNO',
      frame: 'F_INFERNO',
      engine: 'E_INFERNO',
      armor: 'A_INFERNO',
      optionalEquipment: Object.freeze(['DOZER_BLADE', 'MINE_LAYER', 'ROCKET_LAUNCHER']),
    }),
  }),

  [EnemyClass.BOSS_TITAN]: Object.freeze({
    id: 'boss_titan',
    enemyClass: EnemyClass.BOSS_TITAN,
    code: 'BOSS-03',
    behavior: defineBehavior('fortress', [
      { id: 'move_to_player', luck: 0.85 },
      { id: 'defend_enemy_base', luck: 1.00 },
      { id: 'follow_route', luck: 0.85 },
      { id: 'move_to_player_base', luck: 0.70 },
      { id: 'patrol_zone', luck: 1.00 },
      { id: 'shoot_player', luck: 0.90 },
      { id: 'shoot_player_base', luck: 0.70 },
      { id: 'shoot_obstacle', luck: 0.90 },
      { id: 'shoot_random', luck: 1.00 },
    ]),
    name: 'SUPREME DREADNOUGHT',
    role: 'Sector 03 Supreme Dreadnought',
    accentHex: '#2563EB',
    base: tankBase({ hp: 362, sightRadius: 28.0, radioAlertRadius: 32.0 }),
    loadoutSummary: 'TITAN_RAIL (×2 Turrets) · CH_COLOSSUS · F_BASTION · E_SINGULARITY · A_AEGIS',
    sizeClass: 'Super-heavy · 1.9× STANDARD footprint (twin-turret dreadnought)',
    specialFeatureLabel: 'SPECIAL ABILITY',
    specialFeatureValue: '2 Independent Dual-Cannon Turrets (4 Barrels) + Aegis Directional Armor; Escort at 60%, Overload at 30%',
    description:
      'Ultimate super-heavy dreadnought guarding the Sector 03 citadel. Armed with two independent rotating turrets — front and rear — each carrying twin high-caliber heavy cannons (4 barrels total) separated by a central armored command citadel. Its Aegis glacis and modular side skirts shrug off frontal fire (60% front, 35% sides, 15% rear), forcing attackers to flank. At 60% hull integrity it calls an armored escort, and at 30% it enters reactor overload: both turrets reload faster and hull traverse accelerates, while rear radiator grilles open and rear armor drops to 0%.',
    loadout: Object.freeze({
      gun: 'TITAN_RAIL',
      chassis: 'CH_COLOSSUS',
      frame: 'F_BASTION',
      engine: 'E_SINGULARITY',
      armor: 'A_AEGIS',
      optionalEquipment: Object.freeze([]),
    }),
  }),
});

export const SPECIAL_ENEMY_CATALOG = Object.freeze([
  TANK_CONFIGS[TANK_TYPES.HOWITZER],
  TANK_CONFIGS[TANK_TYPES.SAPPER],
  TANK_CONFIGS[TANK_TYPES.HOVER],
  TANK_CONFIGS[TANK_TYPES.KAMIKAZE],
  TANK_CONFIGS[TANK_TYPES.FLAMETHROWER],
  TANK_CONFIGS[TANK_TYPES.JAMMER],
  TANK_CONFIGS[TANK_TYPES.ENGINEER],
  TANK_CONFIGS[TANK_TYPES.STRIKER],
  TANK_CONFIGS[TANK_TYPES.STEALTH],
]);
