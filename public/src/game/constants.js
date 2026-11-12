/** Core Physics Formulas, Combat Constants, and Catalog Re-Exports. */

import { TANK_TYPES, TANK_CONFIGS, EnemyClass, tankBase } from './tanks.js';
import {
  POWERUP,
  POWERUP_MAX_ON_MAP,
  POWERUP_EFFECT,
  POWERUP_TYPES,
  POWERUP_DROP_TYPES,
} from './powerups.js';
import {
  BULLET_POWER,
  WEAPON,
  UPGRADE,
  CANNONS,
  CHASSIS,
  FRAMES,
  ENGINES,
  ARMORS,
  OPTIONAL_EQUIPMENT,
  PLAYER_ENGINE_POWER_MULT,
  PLAYER_UPGRADES,
  UPGRADE_MAX_LEVEL,
} from './components/index.js';

export {
  TANK_TYPES,
  TANK_CONFIGS,
  POWERUP,
  POWERUP_MAX_ON_MAP,
  POWERUP_EFFECT,
  POWERUP_TYPES,
  POWERUP_DROP_TYPES,
  BULLET_POWER,
  WEAPON,
  UPGRADE,
  CANNONS,
  CHASSIS,
  FRAMES,
  ENGINES,
  ARMORS,
  OPTIONAL_EQUIPMENT,
  PLAYER_ENGINE_POWER_MULT,
  PLAYER_UPGRADES,
  UPGRADE_MAX_LEVEL,
};

export const DURABILITY = Object.freeze({
  PERCENT: 100, // Reference percentage base (100%)
  MAX_ARMOR: 95, // Maximum damage reduction cap (%) to prevent absolute invulnerability
  ARMOR_SCALE: 100, // Divisor for converting armor percentage to 0..1 multiplier
  ZERO_HP: 0.0001, // Epsilon threshold below which a unit is considered destroyed
  LIGHT_RATIO: 0.66, // HP fraction threshold (66%) below which light damage state triggers
  LOW_RATIO: 0.33, // Critical HP threshold (33%) triggering mobility penalty & repair kits
  LOW_SPEED_MULT: 0.7, // Speed multiplier applied when tank HP drops below LOW_RATIO (30% slowdown)
  STAGE_CLEAR_REPAIR: 12, // Flat HP restored to player hull upon clearing a sector stage
  REPAIR_POWERUP: 20, // Flat HP restored when picking up a battlefield Repair power-up
  OVERHEAL_MAX_RATIO: 1.4, // Maximum allowable HP cap from over-repair (up to 140% of max HP)
});

export const REPAIR_KIT = Object.freeze({
  MAX: 2, // Maximum number of emergency repair kit charges carried
  RESTORE_AMOUNT: 20, // Hull HP instantly restored when emergency kit triggers
  TRIGGER_RATIO: 0.33, // HP fraction threshold (33%) that triggers automatic repair kit use
});

export const BASE_REPAIR = Object.freeze({
  RADIUS_CELLS: 2.5, // Effective repair perimeter around the Allied Command Base in grid cells
  RATE: 3.0, // Hull repair rate in HP per second when parked inside the base radius
  SUBSYSTEM_RATE: 10.0, // Subsystem durability repair rate (% per second) inside base perimeter
  SPARK_INTERVAL: 0.14, // Interval between visual repair spark effect pulses in seconds
});

export const APS = Object.freeze({
  START_ROUNDS: 2, // Default APS intercept charges available at sector spawn
  PICKUP_ROUNDS: 4, // Intercept charges added upon collecting an APS field power-up
  ROUNDS: 12, // Legacy constant for total rounds
  MAX_TOTAL_AMMO: 12, // Maximum intercept ammunition capacity across all 4 corner launchers (Frame Tier 5)
  MAX_TOTAL_BY_FRAME: Object.freeze([4, 6, 8, 10, 12]), // Max APS capacity per Frame tier 1..5
  CHARGE_CREDIT_PRICE: 1000, // Credit cost in Hangar for one APS charge
  INITIAL_PER_LAUNCHER: Object.freeze([1, 0, 0, 1]), // Starting ammo per launcher index [FR, RR, RL, FL]
  DETECT_RADIUS: 2.6, // Threat detection radius in grid cells (2.6 cells = 5.2m world units)
  REARM_TIME: 0.35, // Cooldown in seconds between consecutive APS launcher interceptions
  ARTILLERY_ENGAGE_PROGRESS: 0.72, // Artillery shell descent progress threshold (72%) for APS engagement
  LAUNCHERS: Object.freeze([
    Object.freeze({ lat: 1, fwd: 1, label: 'FR' }), // Front-Right corner launcher
    Object.freeze({ lat: 1, fwd: -1, label: 'RR' }), // Rear-Right corner launcher
    Object.freeze({ lat: -1, fwd: -1, label: 'RL' }), // Rear-Left corner launcher
    Object.freeze({ lat: -1, fwd: 1, label: 'FL' }), // Front-Left corner launcher
  ]),
  FILL_ORDER: Object.freeze([0, 3, 1, 2]), // Priority sequence for expending launchers (FR -> FL -> RR -> RL)
  LAUNCHER_OFFSET: 0.34, // Hull offset distance in world units for launcher pod mounting
});

export const CANNON_AMMO = Object.freeze({
  START_ROUNDS: 15, // Default shells available upon fresh start
  MAX_AMMO_BY_FRAME: Object.freeze([15, 22, 30, 40, 50]), // Max cannon shell capacity per Frame tier 1..5
  PICKUP_AMMO: 6, // Shells replenished upon collecting an AMMO power-up from a BOX cache
  CREDIT_PRICE_PER_PACK: 150, // Credit cost in Hangar per ammunition pack
  SHELLS_PER_PACK: 5, // Shells added per Hangar pack purchase
  BASE_REARM_INTERVAL_SEC: 1.25, // Auto-rearm interval in seconds while parked in the Command Base repair zone
});

export const ENEMY_KILL_CREDITS = Object.freeze({
  [EnemyClass.SCOUT]: 50, // Fast reconnaissance unit bounty
  [EnemyClass.KAMIKAZE]: 50, // Explosive suicide rammer bounty
  [EnemyClass.STANDARD]: 75, // Main battle tank bounty
  [EnemyClass.HOVER]: 75, // Amphibious hover tank bounty
  [EnemyClass.SAPPER]: 75, // Mine-laying combat vehicle bounty
  [EnemyClass.ENGINEER]: 100, // Field repair & fortification builder bounty
  [EnemyClass.FLAMETHROWER]: 100, // Heavy close-range incendiary tank bounty
  [EnemyClass.STRIKER]: 100, // Long-range ATGM missile carrier bounty
  [EnemyClass.HOWITZER]: 150, // Indirect fire artillery platform bounty
  [EnemyClass.ARMOR]: 150, // Heavy breakthrough siege tank bounty
  [EnemyClass.JAMMER]: 150, // Electronic warfare ECM tank bounty
  [EnemyClass.STEALTH]: 150, // Camouflaged ambush tank bounty
  [EnemyClass.BOSS_MAMMOTH]: 500, // Sector 01 Boss (Mammoth Dreadnought) defeat reward
  [EnemyClass.BOSS_HYDRA]: 750, // Sector 02 Boss (Hydra MLRS Cruiser) defeat reward
  [EnemyClass.BOSS_INFERNO]: 850, // Thermobaric Siege Leviathan (Cerberus-T) defeat reward
  [EnemyClass.BOSS_TITAN]: 1000, // Sector 03 Boss (Titan Rail Fortress) defeat reward
});

export const TRACK_UPGRADE_COSTS = Object.freeze({
  2: 300, // Upgrade price (Credits) from Tier 1 to Tier 2
  3: 1000, // Upgrade price (Credits) from Tier 2 to Tier 3
  4: 2000, // Upgrade price (Credits) from Tier 3 to Tier 4
  5: 5000, // Upgrade price (Credits) from Tier 4 to Tier 5
});

export const SPEED_FORMULA = Object.freeze({
  BASE_MULT: 1.89, // Global speed multiplier converting power-to-weight ratio to cells/sec
  MIN: 0.7, // Absolute minimum tank movement speed floor (cells/sec)
  MAX: 4.55, // Absolute maximum tank movement speed ceiling (cells/sec)
});

/** Enemy Visibility, Optical Detection, and Radio Alert Constants. */
export const ENEMY_VISIBILITY = Object.freeze({
  DEFAULT_SIGHT_RADIUS: 18.0, // Base visual detection range for standard enemy tanks in world units
  SCOUT_SIGHT_RADIUS: 26.0, // Extended visual detection range for reconnaissance Scout tanks
  FOREST_SIGHT_RADIUS: 7.5, // Reduced sight range when targeting into or through forest canopy
  RADIO_ALERT_RADIUS: 22.0, // Transmission radius for radioing player position to allied units
  RADIO_RESPONSE_CHANCE: 0.5, // Probability (50%) of an allied tank acknowledging and responding to radio alert
  RADIO_BROADCAST_COOLDOWN_SEC: 4.5, // Minimum delay between successive radio alert broadcasts from a spotter
  MEMORY_DURATION_SEC: 6.0, // Duration in seconds enemies remember last confirmed player position
  ALERT_PURSUIT_DURATION_SEC: 8.5, // Time enemies stay in active alert pursuit before resuming patrol
  ALERT_ARRIVAL_RADIUS: 4.0, // Distance to destination at which an alerted enemy considers alert reached
});

const ARMOR_ASPECTS = Object.freeze(['front', 'left', 'right', 'rear']);

/** Base used when a caller has no tank type (e.g. a bare loadout preview). */
const DEFAULT_TANK_BASE = tankBase();

/** Armour of a component or module per hit side: explicit armorByAspect, else its uniform value. */
function aspectArmorOf(item, uniformKey) {
  if (item?.armorByAspect) return item.armorByAspect;
  const value = Number(item?.[uniformKey] ?? 0) || 0;
  return { front: value, left: value, right: value, rear: value };
}

/**
 * Final stats of one tank = its type's base + core components + optional modules.
 *   HP: base.hp + hpBonus of every component and module.
 *   Mass: base.mass + component masses + module masses; speed follows total mass and engine power.
 *   Armour: always per side (front / left / right / rear) = base + armour component (+ module bonuses).
 *   Damage, penetration and reload: the cannon alone.
 *   Sight and radio: the base (+ module sightBonus / radioBonus).
 * @param {object} loadout gun|cannon, chassis, frame|vehicleFrame, engine, armor, optionalEquipment
 * @param {object} [base] tank type base from tanks.js (tankBase); DEFAULT_TANK_BASE when omitted
 */
export function computeTankStats(loadout = {}, base = DEFAULT_TANK_BASE) {
  const gunKey = loadout.gun || loadout.cannon || 'NONE';
  const gun =
    (typeof gunKey === 'object' ? gunKey : CANNONS[gunKey]) || CANNONS.NONE;

  const chassisKey = loadout.chassis || 'CH1';
  const chassis =
    (typeof chassisKey === 'object' ? chassisKey : CHASSIS[chassisKey]) ||
    CHASSIS.CH1;

  const frameKey = loadout.frame || loadout.vehicleFrame || 'F1';
  const frame =
    (typeof frameKey === 'object' ? frameKey : FRAMES[frameKey]) || FRAMES.F1;

  const engineKey = loadout.engine || 'E1';
  const engine =
    (typeof engineKey === 'object' ? engineKey : ENGINES[engineKey]) ||
    ENGINES.E1;

  const armorKey = loadout.armor || 'A1';
  const armor =
    (typeof armorKey === 'object' ? armorKey : ARMORS[armorKey]) || ARMORS.A1;

  const optionalEquipment = (loadout.optionalEquipment || [])
    .map((opt) =>
      typeof opt === 'object' ? opt : OPTIONAL_EQUIPMENT[opt] || null
    )
    .filter(Boolean);

  const hull = { ...DEFAULT_TANK_BASE, ...base };
  const components = [gun, chassis, frame, engine, armor];
  const sum = (items, key) => items.reduce((total, item) => total + (Number(item?.[key]) || 0), 0);

  // 1. HP adds up: base + every component + every module.
  const maxHP = (Number(hull.hp) || 0) + sum(components, 'hpBonus') + sum(optionalEquipment, 'hpBonus');

  // 2. Mass = base + components + modules; speed comes from total mass and engine power only.
  const totalMass =
    Math.round(((Number(hull.mass) || 0) + sum(components, 'mass') + sum(optionalEquipment, 'nominalMass')) * 10) / 10;
  const moveSpeed =
    SPEED_FORMULA.BASE_MULT *
    Math.sqrt((engine.power || 0) / 100.0) *
    Math.pow(90.0 / Math.max(1, totalMass), 0.65);

  // 3. Armour always works per side: base + armour component + module bonuses, capped.
  const componentArmor = aspectArmorOf(armor, 'reductionPct');
  const armorByAspect = Object.freeze(Object.fromEntries(ARMOR_ASPECTS.map((aspect) => [aspect, Math.min(
    DURABILITY.MAX_ARMOR,
    Math.max(0,
      (Number(hull.armor?.[aspect]) || 0) +
      (Number(componentArmor[aspect]) || 0) +
      optionalEquipment.reduce((total, item) => total + (Number(item.armorBonusByAspect?.[aspect]) || 0), 0))
  )])));
  // Display value and fallback for callers without a hit side: the weakest side.
  const armorMin = Math.min(...ARMOR_ASPECTS.map((aspect) => armorByAspect[aspect]));
  const directionalArmor = ARMOR_ASPECTS.some((aspect) => armorByAspect[aspect] !== armorByAspect.front);

  const canHover = Boolean(chassis.canHover || frame.canHover);
  const canCrossWater = Boolean(chassis.canCrossWater || frame.canCrossWater);
  const allTerrain = Boolean(chassis.allTerrain || frame.allTerrain);
  const sizeBlocks = Math.max(chassis.sizeBlocks || 1, frame.sizeBlocks || 1);

  // 5. Sight and radio come from the base; modules (e.g. a radar) may add to them.
  const sightRadius = (Number(hull.sightRadius) || ENEMY_VISIBILITY.DEFAULT_SIGHT_RADIUS) + sum(optionalEquipment, 'sightBonus');
  const radioAlertRadius =
    (Number(hull.radioAlertRadius) || ENEMY_VISIBILITY.RADIO_ALERT_RADIUS) + sum(optionalEquipment, 'radioBonus');

  return {
    totalMass,
    moveSpeed,
    maxHP,
    durability: maxHP,
    damage: gun.damage,
    penetration: gun.penetration,
    bulletSpeed: gun.bulletSpeed,
    bulletPower: gun.bulletPower,
    maxBullets: gun.maxBullets,
    fireCooldown: gun.fireCooldown,
    interBarrelCooldown: gun.interBarrelCooldown,
    barrels: gun.barrels ?? 1,
    barrelOffset: gun.barrelOffset ?? 0,
    weapon: gun.weapon,
    blastCells: gun.blastCells,
    armor: armorMin,
    armorByAspect,
    directionalArmor,
    canHover,
    canCrossWater,
    allTerrain,
    sizeBlocks,
    sightRadius,
    radioAlertRadius,
  };
}

/** Armour for UI: "24%" when every side is equal, else "59 / 36 / 36 / 29% (F / L / R / Rear)". */
export function formatArmor(stats) {
  if (!stats?.directionalArmor) return `${stats?.armor ?? 0}%`;
  const a = stats.armorByAspect;
  return `${a.front} / ${a.left} / ${a.right} / ${a.rear}% (F / L / R / Rear)`;
}

export function computeEffectiveDamage(
  baseDamage,
  penetration,
  targetArmorPct
) {
  const effectiveArmor = Math.min(
    DURABILITY.MAX_ARMOR,
    Math.max(0, targetArmorPct - penetration)
  );
  return baseDamage * (1 - effectiveArmor / DURABILITY.ARMOR_SCALE);
}

export const MISSILE = Object.freeze({
  CREDIT_PRICE: 3000, // Price per missile in the hangar
  GUIDED: true, // Whether missiles have active homing towards the target coordinate
  DAMAGE: 30, // Base explosion damage dealt upon impact
  PENETRATION: 80, // High armor penetration percentage (80%) of anti-tank guided missile
  SPEED: 11, // Flight velocity in world units per second
  TURN_RATE: 7, // Steering agility (radians per second) for terminal guidance
  MINE_TRIGGER_RADIUS: 1.5, // Proximity radius to trigger and detonate enemy mines
  HIT_RADIUS: 0.5, // Contact hitbox radius for tank collision
  MAX_LIFETIME: 6, // Maximum flight time in seconds before self-destructing
  COOLDOWN: 0.6, // Delay between consecutive player missile launches in seconds
  MAX_AMMO: 6, // Maximum ATGM reserve missiles carried by player (Frame Tier 5)
  MAX_AMMO_BY_FRAME: Object.freeze([2, 3, 4, 5, 6]), // Max ATGM reserve missiles per Frame tier 1..5
  PICKUP_AMMO: 1, // Missiles replenished per battlefield ATGM power-up pickup
  RETARGET_RADIUS: 3, // World unit radius to seek alternative target if primary is lost
  POOL_SIZE: 6, // Maximum concurrent active missiles in the physics/rendering pool
  PLAYER_RESERVED_SLOTS: 2, // Reserved missile slots allocated exclusively for player fire
});

/** Maximum player APS intercept charges for the given purchased Frame tier (1..5). */
export function getMaxApsAmmo(frameTier = 1) {
  const idx = Math.max(0, Math.min(APS.MAX_TOTAL_BY_FRAME.length - 1, Math.floor(frameTier || 1) - 1));
  return APS.MAX_TOTAL_BY_FRAME[idx];
}

/** Maximum player ATGM missile reserve for the given purchased Frame tier (1..5). */
export function getMaxMissileAmmo(frameTier = 1) {
  const idx = Math.max(0, Math.min(MISSILE.MAX_AMMO_BY_FRAME.length - 1, Math.floor(frameTier || 1) - 1));
  return MISSILE.MAX_AMMO_BY_FRAME[idx];
}

/** Maximum player cannon shell capacity for the given purchased Frame tier (1..5). */
export function getMaxCannonAmmo(frameTier = 1) {
  const idx = Math.max(0, Math.min(CANNON_AMMO.MAX_AMMO_BY_FRAME.length - 1, Math.floor(frameTier || 1) - 1));
  return CANNON_AMMO.MAX_AMMO_BY_FRAME[idx];
}

export const FLAME_STREAM = Object.freeze({
  DAMAGE_PER_PUFF: 5.0, // Damage inflicted by each individual flame particle/puff
  PUFF_INTERVAL: 0.12, // Emission interval between successive flame puffs in seconds
  RANGE: 11.0, // Maximum flame reach in world units (5.5 grid cells)
  PUFF_SPEED: 13.5, // Forward projectile speed of incandescent napalm puffs
  PUFF_LIFE: 0.78, // Lifetime in seconds (~10.5m flight + 1.15m muzzle = ~11.7m reach)
  MUZZLE_OFFSET: 1.15, // Forward spawn offset from turret center to barrel tip
});

export const KAMIKAZE_BLAST = Object.freeze({
  RADIUS: 4.0, // Blast radius in world units (2.0 cells) upon suicide detonation
  DAMAGE: 44, // Raw explosive damage delivered at epicenter of suicide ram
  PENETRATION: 30, // Shaped demolition warhead armor penetration (%)
});

export const LAND_MINE = Object.freeze({
  DAMAGE: 40, // High-explosive anti-tank blast damage at epicenter
  PENETRATION: 25, // Under-hull shaped-charge armor penetration (%)
  BLAST_RADIUS_CELLS: 2.25, // Blast radius in grid cells (4.5m world units)
  TRIGGER_RADIUS: 1.65, // Proximity detonation radius in world units (~0.82 cells)
  ARM_SEC: 0.8, // Arming delay after deployment in seconds
  LIFE_SEC: 45.0, // Active mine lifetime on the battlefield in seconds
});

export const TANK_HIT_RADIUS = Object.freeze({
  PLAYER: 0.85, // Collision & hit-detection radius for player tank hull
  DEFAULT: 0.85, // Fallback hit radius for standard enemy tank types
  DEFAULT_BOSS: 1.3, // Fallback hit radius for sector boss hulls
  [TANK_TYPES.KAMIKAZE]: 0.7, // Compact chassis hit radius
  [TANK_TYPES.SCOUT]: 0.78, // Agile light chassis hit radius
  [TANK_TYPES.ENGINEER]: 0.8, // Utility chassis hit radius
  [TANK_TYPES.STANDARD]: 0.85, // Medium tank chassis hit radius
  [TANK_TYPES.HOWITZER]: 0.85, // Self-propelled artillery hit radius
  [TANK_TYPES.JAMMER]: 0.85, // Electronic warfare vehicle hit radius
  [TANK_TYPES.SAPPER]: 0.88, // Combat engineering / minelayer hit radius
  [TANK_TYPES.STEALTH]: 0.88, // Infiltrator tank hit radius
  [TANK_TYPES.FLAMETHROWER]: 0.9, // Armored flamethrower hit radius
  [TANK_TYPES.STRIKER]: 0.9, // Missile hunter chassis hit radius
  [TANK_TYPES.HOVER]: 0.95, // Wide air-cushion hover chassis hit radius
  [TANK_TYPES.ARMOR]: 1.0, // Heavy breakthrough tank broad chassis hit radius
  bossMammoth: 1.3, // Sector 01 Boss Mammoth siege hull radius
  bossHydra: 1.3, // Sector 02 Boss Hydra MLRS cruiser hull radius
  bossInferno: 1.65, // Thermobaric Siege Leviathan super-heavy hull radius
  bossTitan: 1.65, // Sector 03 Boss Supreme Dreadnought super-heavy hull radius
});

export const BOSS_APS = Object.freeze({
  MAX_CHARGES: 3, // Onboard boss APS charges that intercept incoming player ATGMs
  RECHARGE_SEC: 8.0, // Seconds to regenerate one spent boss APS charge
  REARM_SEC: 0.45, // Delay in seconds between consecutive boss APS interceptions
  DETECT_RADIUS: 2.8, // Threat detection radius in grid cells
  PHASE_SHIELD_SEC: 2.0, // Invulnerable phase-transition shield duration in seconds
});

export const MAMMOTH = Object.freeze({
  PHASE2_HP_RATIO: 0.5, // HP threshold (50%) triggering citadel overdrive, shield, and escort
  PHASE2_RELOAD_MULT: 0.8, // 20% faster main gun, barrage, and ATGM reload in Phase 2
  BARRAGE_COOLDOWN: 4.2, // Seconds between telegraph-free artillery barrages
  MISSILE_COOLDOWN: 7.5, // Seconds between homing ATGM salvos from its ROCKET_LAUNCHER pod
  MISSILE_RANGE_CELLS: 14, // Max engagement range in cells for Mammoth ATGM salvo
  MISSILE_SALVO: 2, // Twin ATGM salvo
  MISSILE_SPREAD_RAD: 0.22, // Angular fan spread in radians
  ESCORT_CLASSES: Object.freeze([EnemyClass.STANDARD, EnemyClass.SAPPER]),
});

export const TITAN = Object.freeze({
  HOLD_DISTANCE_CELLS: 4, // Preferred stand-off engagement range in grid cells
  HULL_TURN_RATE: 2.0, // Standard hull rotation speed in radians per second
  HULL_TURN_RATE_OVERLOAD: 3.5, // Increased hull rotation agility during Phase 2 overload
  OVERLOAD_RELOAD_MULT: 0.65, // Faster dual-turret reload multiplier during Phase 2 overload
  ARMOR_REAR_OVERLOAD: 0, // Exposed rear armor (0%) during overload, enabling flanking kills
  ESCORT_HP_RATIO: 0.6, // HP threshold (60%) triggering standard + armor reinforcement escort
  OVERLOAD_HP_RATIO: 0.3, // HP threshold (30%) initiating critical reactor overload state
  ESCORT_CLASSES: Object.freeze([EnemyClass.STANDARD, EnemyClass.ARMOR]),
});

export const HYDRA = Object.freeze({
  PREFERRED_MIN_CELLS: 10, // Optimal minimum stand-off combat distance in grid cells
  PREFERRED_MAX_CELLS: 14, // Optimal maximum combat distance in grid cells
  SALVO_MIN_CELLS: 6, // Minimum range in cells to authorize rocket artillery salvo
  SALVO_MAX_CELLS: 14, // Maximum range in cells for rocket artillery barrage
  SALVO_TRIANGLE_CELLS: 1.6, // Spread triangle radius in cells for the 3-rocket cluster
  SALVO_FLIGHT_TIMES: Object.freeze([1.2, 1.4, 1.6]), // Staggered rocket arc arrival times
  MISSILE_RANGE_CELLS: 6, // Proximity threshold in cells to trigger close-defense ATGM salvo
  MISSILE_SALVO: 3, // Number of homing missiles fired in a defensive salvo
  MISSILE_SPREAD_RAD: 0.28, // Angular fan spread in radians for missile launch
  MISSILE_COOLDOWN: 6.0, // Cooldown in seconds between defensive ATGM salvos
  FLAME_RANGE: 12.0, // Close-range napalm defense reach in world units (6 grid cells)
  FLAME_SPEED: 13.0, // Forward velocity of close-defense flame puffs
  FLAME_LIFE: 0.92, // Lifetime in seconds (~12m reach to cover the <6 cell MLRS blind spot)
  FLAME_DAMAGE: 4.0, // Damage per close-defense flame puff
  PHASE2_HP_RATIO: 0.5, // HP threshold (50%) activating aggressive Phase 2 behavior & escort
  PHASE2_RELOAD_MULT: 0.75, // 25% faster rocket barrage reload in Phase 2
  ESCORT_CLASSES: Object.freeze([EnemyClass.HOVER, EnemyClass.SCOUT]),
});

export const INFERNO = Object.freeze({
  BLAST_CELLS: 2.5, // Thermobaric shell detonation radius in grid cells (5.0 world units)
  EDGE_DAMAGE_RATIO: 0.45, // Outer rim blast damage multiplier
  PHASE2_HP_RATIO: 0.5, // HP threshold (50%) triggering phase shield, overdrive, and incendiary escort
  PHASE2_RELOAD_MULT: 0.75, // 25% faster thermobaric mortar & ATGM reload in Phase 2
  DASH_COOLDOWN: 8.5, // Seconds between overdrive ram charges in Phase 1
  PHASE2_DASH_COOLDOWN: 5.8, // Seconds between overdrive ram charges in Phase 2
  DASH_WINDUP_SEC: 0.85, // Telegraph lock-on duration before ramming
  DASH_DURATION_SEC: 1.05, // Active overdrive sprint duration in seconds
  DASH_SPEED_MULT: 3.4, // Speed multiplier during overdrive ram
  DASH_RAM_DAMAGE: 26, // Kinetic ram damage inflicted on player hull impact
  DASH_MIN_CELLS: 2.5, // Minimum distance in cells to initiate an overdrive ram
  DASH_MAX_CELLS: 11.5, // Maximum distance in cells to initiate an overdrive ram
  MISSILE_COOLDOWN: 7.0, // Seconds between homing ATGM salvos from turret pods
  MISSILE_RANGE_CELLS: 14, // Max engagement range in cells for Inferno ATGM salvo
  MISSILE_SALVO: 2, // Phase 1 ATGM salvo count
  PHASE2_MISSILE_SALVO: 3, // Phase 2 ATGM salvo count
  MISSILE_SPREAD_RAD: 0.24, // Angular fan spread in radians
  ESCORT_CLASSES: Object.freeze([EnemyClass.FLAMETHROWER, EnemyClass.KAMIKAZE]),
});

export const ARTILLERY = Object.freeze({
  MIN_RANGE: 4, // Minimum artillery engagement distance in cells (blind spot)
  MAX_RANGE: 18, // Maximum indirect shell trajectory range in grid cells
  BASE_MAX_RANGE: 12, // Max range threshold required to target player command base
  FLIGHT_TIME: 1.75, // Default shell flight time in seconds (enemy tank config `artillery.flightSec` overrides)
  AIM_TIME: 1.0, // Default enemy aiming time in seconds before each shell (tank config `artillery.aimSec` overrides)
  RELOAD: 4, // Standard baseline reload time in seconds
  RELOAD_MIN: 3.2, // Minimum randomized reload interval in seconds
  RELOAD_MAX: 4.8, // Maximum randomized reload interval in seconds
  FIRST_SHOT_DELAY: 2, // Initial delay after acquiring target before first salvo
  FIRST_SHOT_MIN: 1.5, // Minimum initial targeting reaction delay
  FIRST_SHOT_MAX: 3.5, // Maximum initial targeting reaction delay
  SPLASH_RADIUS: 1.5, // Blast radius in grid cells (3.0m world units)
  EDGE_DAMAGE_RATIO: 0.5, // Damage reduction multiplier at the outer fringe of splash
  ARC_HEIGHT_PX: 28, // Apex height of ballistic arc visual curve
  POOL_SIZE: 8, // Max concurrent artillery shells tracked in simulation
  MARKER_BLINK_RATE: 6, // Ground telegraph hazard ring blink frequency (Hz)
  PLAYER_CONE_ANGLE: 0.8, // Forward cone angle for line-of-sight artillery targeting
  PLAYER_TARGET_MAX_RANGE: 18, // Distance ceiling in cells for selecting player as target
  RANDOM_SHOT_CHANCE: 0.35, // Chance of firing exploratory/harassing shot into fog
  OUT_OF_RANGE_RETRY: 1, // Retry cadence in seconds when target is currently out of range
  RETRY_JITTER_MIN: 0.8, // Minimum jitter multiplier for out-of-range retries
  RETRY_JITTER_SPAN: 0.4, // Random span added to retry jitter
  BASE_TARGET_CHANCE: 0.35, // Probability of selecting player command base when in range
  RANDOM_AIM_SPREAD: 1.2, // Inaccuracy scatter radius in grid cells for artillery impacts
  TRAIL_POINTS: 10, // Number of history segments retained for artillery smoke trails
});

export const GRID_SIZE = 36; // Battlefield grid dimension (36x36 tiles per sector)
export const TILE_SIZE = 2.0; // World size of one terrain tile in Three.js units (meters)

export const DEFENSE_TURRET_TYPES = Object.freeze({
  CANNON: 'CANNON', // High-velocity direct-fire anti-tank bastion turret
  HOWITZER: 'HOWITZER', // Heavy indirect-fire siege howitzer redoubt
  MLRS: 'MLRS', // Multi-launch rocket system cluster battery
});

export const DEFENSE_TURRET_CONFIGS = Object.freeze({
  [DEFENSE_TURRET_TYPES.CANNON]: Object.freeze({
    type: DEFENSE_TURRET_TYPES.CANNON,
    name: 'Cannon Bastion', // Display name in UI and destruction banners
    maxHp: 100, // Total structural hit points
    armor: 35, // Passive damage reduction rating (%)
    fireCooldown: 1.8, // Fire interval in seconds between cannon rounds
    bulletSpeed: 22, // High projectile muzzle velocity (world units/sec)
    damage: 24, // Direct hit damage dealt per shell
    penetration: 30, // Armor penetration percentage rating
    range: 16.0, // Engagement range in world units (~8 grid cells)
    muzzleDist: 1.6, // Muzzle offset from turret center for shell spawn & flash
    modelUrl: './models/turret_cannon.glb', // 3D GLTF asset path
  }),
  [DEFENSE_TURRET_TYPES.HOWITZER]: Object.freeze({
    type: DEFENSE_TURRET_TYPES.HOWITZER,
    name: 'Howitzer Redoubt', // Display name in UI and destruction banners
    maxHp: 100, // Total structural hit points
    armor: 40, // Reinforced heavy bunker armor rating (%)
    fireCooldown: 4.2, // Long reload interval in seconds between artillery barrages
    damage: 40, // High explosive impact and splash damage
    range: 24.0, // Long-range bombardment reach in world units (~12 grid cells)
    minRange: 4.0, // Minimum blind spot radius in world units (~2 cells)
    blastRadius: 2.2, // Area of effect splash radius in grid cells (~4.4m)
    muzzleDist: 1.4, // Barrel tip spawn offset in world units
    modelUrl: './models/turret_howitzer.glb', // 3D GLTF asset path
  }),
  [DEFENSE_TURRET_TYPES.MLRS]: Object.freeze({
    type: DEFENSE_TURRET_TYPES.MLRS,
    name: 'Hydra MLRS Battery', // Display name in UI and destruction banners
    maxHp: 100, // Total structural hit points
    armor: 30, // Standard fortified bunker armor rating (%)
    fireCooldown: 5.2, // Full reload cycle between rocket salvo barrages
    damage: 28, // Damage delivered per individual homing rocket
    range: 20.0, // Maximum rocket launch acquisition range in world units
    salvoCount: 3, // Number of rockets fired in each rapid salvo
    salvoInterval: 0.22, // Time delay between consecutive rocket launches in a salvo
    muzzleDist: 1.4, // Pod launcher forward spawn offset in world units
    modelUrl: './models/turret_mlrs.glb', // 3D GLTF asset path
  }),
});
