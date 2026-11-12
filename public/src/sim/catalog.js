/**
 * Core Modular Tank Catalogs, Surface Modifiers, and Upgrade Curves
 * Strictly aligned with TANK_GAME_AI_AGENT_GUIDE.md Section 8, 9, 10, 11, 16.
 */

export const HULL_CATALOG = {
  bars_m1: {
    id: 'bars_m1',
    name: 'Bars-M1 Medium Hull',
    code: 'BARS-M1',
    classType: 'medium',
    hullHP: 1200,
    armor: {
      front: 110,
      left: 65,
      right: 65,
      rear: 40,
      roof: 25,
    },
    mass: 22.0,
    enginePower: 650,
    maxSpeedForward: 32.2, // km/h (-30% from 46)
    maxSpeedReverse: 12.6, // km/h (-30% from 18)
    turnRate: 160, // deg/s
    maxPayloadMass: 18.0, // tonnes of mounted turret + gun + panels + modules
    turretSocketType: 'standard_m',
    armorSockets: ['SOCKET_ARMOR_FRONT', 'SOCKET_ARMOR_LEFT', 'SOCKET_ARMOR_RIGHT'],
    moduleSlots: 3,
    dimensions: { width: 2.1, height: 0.95, length: 3.2 },
    visualTiers: { chassis: 2, frame: 2, engine: 2, armor: 2 },
  },
  bastion_m2: {
    id: 'bastion_m2',
    name: 'Bastion-M2 Heavy Hull',
    code: 'BASTION-M2',
    classType: 'heavy',
    hullHP: 1600,
    armor: {
      front: 180,
      left: 95,
      right: 95,
      rear: 55,
      roof: 35,
    },
    mass: 30.0,
    enginePower: 780,
    maxSpeedForward: 23.8, // km/h (-30% from 34)
    maxSpeedReverse: 9.8, // km/h (-30% from 14)
    turnRate: 130, // deg/s
    maxPayloadMass: 24.0,
    turretSocketType: 'standard_m',
    armorSockets: ['SOCKET_ARMOR_FRONT', 'SOCKET_ARMOR_LEFT', 'SOCKET_ARMOR_RIGHT'],
    moduleSlots: 3,
    dimensions: { width: 2.35, height: 1.05, length: 3.45 },
    visualTiers: { chassis: 5, frame: 5, engine: 4, armor: 5 },
  },
  lynx_s1: {
    id: 'lynx_s1',
    name: 'Lynx-S1 Recon Hull',
    code: 'LYNX-S1',
    classType: 'light',
    hullHP: 850,
    armor: {
      front: 75,
      left: 45,
      right: 45,
      rear: 30,
      roof: 20,
    },
    mass: 16.0,
    enginePower: 580,
    maxSpeedForward: 37.8, // km/h (-30% from 54)
    maxSpeedReverse: 15.4, // km/h (-30% from 22)
    turnRate: 190,
    maxPayloadMass: 14.0,
    turretSocketType: 'standard_m',
    armorSockets: ['SOCKET_ARMOR_FRONT', 'SOCKET_ARMOR_LEFT', 'SOCKET_ARMOR_RIGHT'],
    moduleSlots: 2,
    dimensions: { width: 1.9, height: 0.85, length: 2.85 },
    visualTiers: { chassis: 1, frame: 1, engine: 3, armor: 1 },
  },
};

export const TURRET_CATALOG = {
  t_01: {
    id: 't_01',
    name: 'T-01 Universal Turret',
    code: 'T-01',
    turretSocketType: 'standard_m',
    gunSocketType: 'gun_m',
    mass: 6.0,
    armor: {
      front: 95,
      left: 65,
      right: 65,
      rear: 45,
      roof: 25,
    },
    turnRate: 240, // deg/s
    visionRange: 75, // meters
    visionAngle: 110, // degrees cone
    maxGunMass: 2.7, // tonnes (accepts Sokol-90 at 1.8t and Kopye-105 at 2.3t; rejects Grom-120 at 3.1t)
    armorSockets: ['SOCKET_ARMOR_TURRET'],
    auxSlots: 1,
    visualTier: 2,
  },
  t_02: {
    id: 't_02',
    name: 'T-02 Heavy Assault Turret',
    code: 'T-02',
    turretSocketType: 'standard_m',
    gunSocketType: 'gun_m',
    mass: 10.0,
    armor: {
      front: 175,
      left: 100,
      right: 100,
      rear: 60,
      roof: 35,
    },
    turnRate: 200, // deg/s
    visionRange: 70, // meters
    visionAngle: 95, // degrees cone
    maxGunMass: 3.5, // tonnes (accepts Grom-120 at 3.1t and Molot-140 at 3.4t)
    armorSockets: ['SOCKET_ARMOR_TURRET'],
    auxSlots: 1,
    visualTier: 5,
  },
};

export const GUN_CATALOG = {
  sokol_90: {
    id: 'sokol_90',
    name: 'Sokol-90 (90mm Rifled Gun)',
    code: 'SOKOL-90',
    gunSocketType: 'gun_m',
    caliber: 90,
    damage: 190,
    penetration: 125,
    reloadTime: 3.8, // seconds
    projectileSpeed: 230, // m/s
    mass: 1.8, // tonnes
    dispersion: 0.45, // degrees
    recoilImpulse: 0.35,
    depression: -8,
    elevation: 20,
    maxRange: 130,
    noiseRadius: 55,
    visualTier: 1,
    alternatingBarrels: false,
  },
  kopye_105: {
    id: 'kopye_105',
    name: 'Kopye-105 (105mm High-Velocity)',
    code: 'KOPYE-105',
    gunSocketType: 'gun_m',
    caliber: 105,
    damage: 235,
    penetration: 165,
    reloadTime: 4.6, // seconds
    projectileSpeed: 260, // m/s
    mass: 2.3, // tonnes
    dispersion: 0.35, // degrees
    recoilImpulse: 0.48,
    depression: -7,
    elevation: 18,
    maxRange: 145,
    noiseRadius: 65,
    visualTier: 3,
    alternatingBarrels: false,
  },
  grom_120: {
    id: 'grom_120',
    name: 'Grom-120 (120mm Heavy Gun)',
    code: 'GROM-120',
    gunSocketType: 'gun_m',
    caliber: 120,
    damage: 310,
    penetration: 185,
    reloadTime: 6.2, // seconds
    projectileSpeed: 220, // m/s
    mass: 3.1, // tonnes (requires T-02 turret)
    dispersion: 0.55, // degrees
    recoilImpulse: 0.68,
    depression: -6,
    elevation: 16,
    maxRange: 140,
    noiseRadius: 78,
    visualTier: 4,
    alternatingBarrels: false,
  },
  molot_140_twin: {
    id: 'molot_140_twin',
    name: 'Molot-140 Twin (140mm Dual Gun)',
    code: 'MOLOT-140',
    gunSocketType: 'gun_m',
    caliber: 140,
    damage: 255,
    penetration: 192,
    reloadTime: 2.6, // seconds per alternating barrel shot
    projectileSpeed: 250, // m/s
    mass: 3.4, // tonnes (requires T-02 turret)
    dispersion: 0.42,
    recoilImpulse: 0.55,
    depression: -6,
    elevation: 16,
    maxRange: 145,
    noiseRadius: 82,
    visualTier: 5,
    alternatingBarrels: true,
  },
};

export const ARMOR_PANEL_CATALOG = {
  sb_40: {
    id: 'sb_40',
    name: 'SB-40 Front Applique Plate',
    code: 'SB-40',
    socketType: 'SOCKET_ARMOR_FRONT',
    zone: 'front',
    ballisticResistance: 40,
    maxIntegrity: 100,
    mass: 1.2,
  },
  ekran_b25_left: {
    id: 'ekran_b25_left',
    name: 'Ekran-B25 Left Side Screen',
    code: 'EKRAN-B25-L',
    socketType: 'SOCKET_ARMOR_LEFT',
    zone: 'left',
    ballisticResistance: 25,
    maxIntegrity: 70,
    mass: 0.6,
  },
  ekran_b25_right: {
    id: 'ekran_b25_right',
    name: 'Ekran-B25 Right Side Screen',
    code: 'EKRAN-B25-R',
    socketType: 'SOCKET_ARMOR_RIGHT',
    zone: 'right',
    ballisticResistance: 25,
    maxIntegrity: 70,
    mass: 0.6,
  },
  turret_cheek_35: {
    id: 'turret_cheek_35',
    name: 'KShield-35 Turret Cheek Screen',
    code: 'KSHIELD-35',
    socketType: 'SOCKET_ARMOR_TURRET',
    zone: 'turret_front',
    ballisticResistance: 35,
    maxIntegrity: 85,
    mass: 0.8,
  },
};

const MODULE_CATALOG = {
  rm_1: {
    id: 'rm_1',
    name: 'RM-1 Field Repair Kit',
    code: 'RM-1',
    slotType: 'module',
    activationType: 'active',
    mass: 0.8,
    channelTime: 10, // seconds
    restoreAmount: 25, // hull HP regenerated over the duration
    cooldown: 45, // seconds
    maxCharges: 2,
    description: 'Restores damaged components and regenerates 25 hull HP over 10 seconds. Collect REPAIR at full hull integrity to gain a charge (maximum 2).',
  },
  smoke_gen: {
    id: 'smoke_gen',
    name: 'Tucha-S Smoke Discharger',
    code: 'TUCHA-S',
    slotType: 'module',
    activationType: 'active',
    mass: 0.6,
    smokeRadius: 9.5,
    duration: 8.0,
    cooldown: 25,
    maxCharges: 3,
    description: 'Deploys a dense aerosol smoke cloud for 8s that blocks optical line-of-sight and breaks enemy visual tracking.',
  },
  kord_aux: {
    id: 'kord_aux',
    name: 'Kord-12.7 Auxiliary Roof Turret',
    code: 'KORD-12.7',
    slotType: 'aux',
    activationType: 'autonomous',
    mass: 0.9,
    range: 36,
    damage: 22,
    penetration: 42,
    reloadTime: 0.65,
    projectileSpeed: 240,
    description: 'Autonomous roof-mounted heavy machine gun that engages the player-designated RMB priority target within 36m.',
  },
};

export const TERRAIN_SURFACES = {
  asphalt: {
    id: 'asphalt',
    label: 'Asphalt Road',
    speedMultiplier: 1.0,
    accelMultiplier: 1.0,
    turnMultiplier: 1.0,
    brakeMultiplier: 1.0,
    color: 0x334155,
  },
  dirt: {
    id: 'dirt',
    label: 'Compacted Dirt',
    speedMultiplier: 0.92,
    accelMultiplier: 0.9,
    turnMultiplier: 0.95,
    brakeMultiplier: 0.92,
    color: 0x57534e,
  },
  sand: {
    id: 'sand',
    label: 'Loose Sand',
    speedMultiplier: 0.78,
    accelMultiplier: 0.75,
    turnMultiplier: 0.82,
    brakeMultiplier: 0.85,
    color: 0xa16207,
  },
  mud: {
    id: 'mud',
    label: 'Deep Mud',
    speedMultiplier: 0.64,
    accelMultiplier: 0.6,
    turnMultiplier: 0.72,
    brakeMultiplier: 0.78,
    color: 0x422006,
  },
  shallow_water: {
    id: 'shallow_water',
    label: 'Shallow Ford',
    speedMultiplier: 0.58,
    accelMultiplier: 0.55,
    turnMultiplier: 0.7,
    brakeMultiplier: 0.8,
    color: 0x0369a1,
  },
  steep_slope: {
    id: 'steep_slope',
    label: 'Steep Grade',
    speedMultiplier: 0.68,
    accelMultiplier: 0.62,
    turnMultiplier: 0.78,
    brakeMultiplier: 0.85,
    color: 0x475569,
  },
};

/**
 * Resolves standard catalog stats for a component part.
 */
export function resolveUpgradedPartStats(category, definitionId) {
  if (category === 'hull') {
    const base = HULL_CATALOG[definitionId] || HULL_CATALOG.bars_m1;
    return { ...base };
  }

  if (category === 'turret') {
    const base = TURRET_CATALOG[definitionId] || TURRET_CATALOG.t_01;
    return { ...base };
  }

  if (category === 'gun') {
    const base = GUN_CATALOG[definitionId] || GUN_CATALOG.sokol_90;
    return { ...base };
  }

  if (category === 'armorPanel') {
    const base = ARMOR_PANEL_CATALOG[definitionId] || ARMOR_PANEL_CATALOG.sb_40;
    return { ...base };
  }

  if (category === 'module' || category === 'aux') {
    const base = MODULE_CATALOG[definitionId] || MODULE_CATALOG.rm_1;
    return { ...base };
  }

  return null;
}

/**
 * Looks up any part definition by its catalog ID across hulls, turrets, guns, armor panels, and modules.
 */
function getCatalogItemById(definitionId) {
  if (!definitionId) return null;
  if (HULL_CATALOG[definitionId]) {
    const item = HULL_CATALOG[definitionId];
    return { ...item, category: 'hull', massTons: item.mass };
  }
  if (TURRET_CATALOG[definitionId]) {
    const item = TURRET_CATALOG[definitionId];
    return { ...item, category: 'turret', massTons: item.mass };
  }
  if (GUN_CATALOG[definitionId]) {
    const item = GUN_CATALOG[definitionId];
    return { ...item, category: 'gun', massTons: item.mass };
  }
  if (ARMOR_PANEL_CATALOG[definitionId]) {
    const item = ARMOR_PANEL_CATALOG[definitionId];
    return {
      ...item,
      category: 'armor_panel',
      massTons: item.mass,
      allowedSockets: [item.socketType],
    };
  }
  if (MODULE_CATALOG[definitionId]) {
    const item = MODULE_CATALOG[definitionId];
    return {
      ...item,
      category: item.slotType === 'aux' ? 'aux' : 'module',
      massTons: item.mass,
      allowedSockets:
        item.slotType === 'aux'
          ? ['SOCKET_AUX_WEAPON']
          : ['SOCKET_MODULE_1', 'SOCKET_MODULE_2'],
    };
  }
  return null;
}

export const getPartCatalogEntry = getCatalogItemById;

