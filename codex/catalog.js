/** 3D Codex viewer, catalog inspections, and rig previews. */

import {
  APS,
  ARTILLERY,
  BASE_REPAIR,
  FLAME_STREAM,
  KAMIKAZE_BLAST,
  MISSILE,
  WEAPON,
  computeTankStats,
} from '../public/src/game/constants.js';

/** Armour for UI: "24%" when every side is equal, else "59 / 36 / 36 / 29% (F / L / R / Rear)". */
function formatArmor(stats) {
  if (!stats?.directionalArmor) return `${stats?.armor ?? 0}%`;
  const a = stats.armorByAspect;
  return `${a.front} / ${a.left} / ${a.right} / ${a.rear}% (F / L / R / Rear)`;
}
import {
  PLAYER_TANK_CONFIG,
  SECTOR_BOSS_CONFIGS,
  TANK_CONFIGS,
  TANK_TYPES,
} from '../public/src/game/vehicles/tanks.js';
import { SURFACE_CATALOG } from '../public/src/game/terrains/surfaces.js';
import { LANDMARK_SPECS } from '../public/src/game/terrains/landmarks.js';
import { POWERUP_TYPES } from '../public/src/game/powerups.js';

/** Codex firepower line, described by weapon type (flame stream and contact warhead have no shell stats). */
function firepowerSpec(st) {
  if (st.weapon === WEAPON.FLAME) {
    const dps = FLAME_STREAM.DAMAGE_PER_PUFF / FLAME_STREAM.PUFF_INTERVAL;
    return {
      label: 'FIREPOWER / RANGE',
      value: `Napalm stream ~${Math.round(dps)} DMG/s · ${(FLAME_STREAM.RANGE / 2).toFixed(1)} cells · ignores APS`,
    };
  }
  if (st.weapon === WEAPON.NONE || !(st.damage > 0)) {
    return {
      label: 'FIREPOWER / RADIUS',
      value: `${KAMIKAZE_BLAST.DAMAGE} DMG Contact Warhead · ${(KAMIKAZE_BLAST.RADIUS / 2).toFixed(1)} cells`,
    };
  }
  return {
    label: 'FIREPOWER / RELOAD',
    value: `${st.damage} DMG (${st.penetration}% PEN · ${st.fireCooldown.toFixed(2)}s)`,
  };
}

const NON_BOSS_TANK_KEYS = [
  TANK_TYPES.SCOUT,
  TANK_TYPES.STANDARD,
  TANK_TYPES.HOWITZER,
  TANK_TYPES.ARMOR,
  TANK_TYPES.SAPPER,
  TANK_TYPES.HOVER,
  TANK_TYPES.KAMIKAZE,
  TANK_TYPES.FLAMETHROWER,
  TANK_TYPES.JAMMER,
  TANK_TYPES.ENGINEER,
  TANK_TYPES.STRIKER,
  TANK_TYPES.STEALTH,
];

const LANDMARK_META = Object.freeze({
  ELYSEE: { name: 'Élysée Palace', region: 'Paris', accentHex: '#E2E8F0', summary: 'Presidential palace compound with classical stonework and courtyard facade.' },
  ELYSEE_RUINED: { name: 'Élysée Palace (Ruined)', region: 'Paris', accentHex: '#94A3B8', summary: 'Shell-torn ruins of the Élysée Palace; passable debris footprint for Last Cargo.' },
  EIFFEL_TOWER: { name: 'Eiffel Tower', region: 'Paris', accentHex: '#F59E0B', summary: 'Wrought-iron lattice tower; its four corner piers block movement while the central span remains open.' },
  ARC_DE_TRIOMPHE: { name: 'Arc de Triomphe', region: 'Paris', accentHex: '#E2E8F0', summary: 'Triumphal monument with massive side piers and an open central archway for tanks and fire.' },
  NOTRE_DAME: { name: 'Notre-Dame Cathedral', region: 'Paris', accentHex: '#CBD5E1', summary: 'Twin-towered Gothic cathedral with flying buttresses and central spire.' },
  LOUVRE_PYRAMID: { name: 'Louvre Pyramid', region: 'Paris', accentHex: '#38BDF8', summary: 'Steel-and-glass courtyard pyramid acting as solid tactical cover.' },
  SACRE_COEUR: { name: 'Sacré-Cœur Basilica', region: 'Paris', accentHex: '#F8FAFC', summary: 'Romano-Byzantine white travertine basilica crowned by tiered domes.' },
  CONCORDE_OBELISK: { name: 'Luxor Obelisk (Concorde)', region: 'Paris', accentHex: '#FBBF24', summary: 'Gilded-tip red granite obelisk on Place de la Concorde.' },
  MINE_SIGN: { name: 'Minefield Warning Sign', region: 'Paris', accentHex: '#EF4444', summary: 'Roadside hazard marker indicating live anti-tank minefields; fully passable.' },
  BRANDENBURG_GATE: { name: 'Brandenburg Gate', region: 'Berlin', accentHex: '#E2E8F0', summary: 'Neoclassical Quadriga gatehouse with four pylon walls and three drivable passages.' },
  VICTORY_COLUMN: { name: 'Berlin Victory Column', region: 'Berlin', accentHex: '#FBBF24', summary: 'Tiered sandstone column topped with the gilded Victoria statue.' },
  VERSAILLES_PALACE: { name: 'Palace of Versailles', region: 'Versailles', accentHex: '#FDE047', summary: 'Expansive 16×3-cell royal palace facade forming an impenetrable northern bastion.' },
  LATONA_FOUNTAIN: { name: 'Latona Fountain', region: 'Versailles', accentHex: '#38BDF8', summary: 'Tiered marble garden fountain in the Versailles parterre.' },
  APOLLO_FOUNTAIN: { name: 'Apollo Fountain', region: 'Versailles', accentHex: '#38BDF8', summary: 'Sculpted gilded chariot fountain basin anchoring the Grand Canal axis.' },
  ATOMIUM: { name: 'Atomium', region: 'Brussels', accentHex: '#93C5FD', summary: 'Nine interconnected stainless-steel spheres supported on bipod struts.' },
  CINQUANTENAIRE_ARCH: { name: 'Cinquantenaire Arch', region: 'Brussels', accentHex: '#CBD5E1', summary: 'Triple-arch colonnade monument with three open north-south firing lanes.' },
  BRUSSELS_TOWN_HALL: { name: 'Brussels Town Hall', region: 'Brussels', accentHex: '#D6D3D1', summary: 'Brabantine Gothic town hall with an ornate central belfry spire.' },
  MANNEKEN_PIS: { name: 'Manneken Pis', region: 'Brussels', accentHex: '#60A5FA', summary: 'Compact corner fountain monument marking the Brussels sector.' },
  COLOSSEUM: { name: 'Colosseum', region: 'Rome', accentHex: '#D6D3D1', summary: 'Elliptical travertine amphitheatre with open axial gates and a playable inner arena.' },
  ARCH_OF_CONSTANTINE: { name: 'Arch of Constantine', region: 'Rome', accentHex: '#E7E5E4', summary: 'Triple-bay Roman triumphal arch with three passable central corridors.' },
  FORUM_COLUMNS: { name: 'Roman Forum Columns', region: 'Rome', accentHex: '#D6D3D1', summary: 'Corinthian colonnade remnant from the ancient Roman Forum.' },
  HOFBURG_PALACE: { name: 'Hofburg Palace', region: 'Vienna', accentHex: '#FDE68A', summary: 'Imperial Habsburg palace wing with mansard roofs and classical facade.' },
  ST_STEPHENS_CATHEDRAL: { name: "St. Stephen's Cathedral", region: 'Vienna', accentHex: '#CBD5E1', summary: 'Gothic cathedral featuring a polychrome tiled roof and towering south spire.' },
  MICHAELERTRAKT: { name: 'Hofburg Michaelertrakt', region: 'Vienna', accentHex: '#FDE68A', summary: 'Curved imperial rotunda wing with a central domed gate passage.' },
  BURGTOR: { name: 'Äußeres Burgtor', region: 'Vienna', accentHex: '#E7E5E4', summary: 'Neoclassical Heldenplatz gatehouse with three drivable archways.' },
  HELDENPLATZ_STATUE: { name: 'Heldenplatz Equestrian Statue', region: 'Vienna', accentHex: '#FBBF24', summary: 'Bronze equestrian monument on a tall stone plinth.' },
  AMSTERDAM_CANAL_HOUSES: { name: 'Amsterdam Canal Houses', region: 'Amsterdam', accentHex: '#F97316', summary: 'Row of narrow gabled Dutch brick townhouses lining the canal.' },
  WESTERKERK: { name: 'Westerkerk', region: 'Amsterdam', accentHex: '#93C5FD', summary: 'Renaissance Protestant church topped by the Imperial Crown spire.' },
  SAGRADA_FAMILIA: { name: 'Sagrada Família', region: 'Barcelona', accentHex: '#FDBA74', summary: 'Monumental Modernista basilica with towering sculpted bell spires.' },
  BARCELONA_CATHEDRAL: { name: 'Barcelona Cathedral', region: 'Barcelona', accentHex: '#D6D3D1', summary: 'Catalan Gothic cathedral with twin octagonal bell towers and central cimborio.' },
  MONTJUIC_CASTLE: { name: 'Montjuïc Castle', region: 'Barcelona', accentHex: '#A8A29E', summary: 'Star-fortress coastal bastion overlooking Barcelona harbor.' },
  COLUMBUS_MONUMENT: { name: 'Columbus Monument', region: 'Barcelona', accentHex: '#FBBF24', summary: 'Tall cast-iron Corinthian column at the foot of La Rambla.' },
  W_HOTEL_BARCELONA: { name: 'W Barcelona (Sail Tower)', region: 'Barcelona', accentHex: '#38BDF8', summary: 'Iconic sail-shaped beachfront glass skyscraper on Barceloneta.' },
  NEUSCHWANSTEIN: { name: 'Neuschwanstein Castle', region: 'Alps', accentHex: '#F8FAFC', summary: 'Romanesque Revival cliffside palace with slate turrets and courtyard keep.' },
  HOHENSALZBURG: { name: 'Hohensalzburg Fortress', region: 'Alps', accentHex: '#E2E8F0', summary: 'Hilltop medieval fortress complex with bastions and high citadel keep.' },
  MONTSERRAT_MONASTERY: { name: 'Montserrat Monastery', region: 'Alps', accentHex: '#D6D3D1', summary: 'Mountain-ridge Benedictine abbey nestled against serrated rock.' },
  MILAN_DUOMO: { name: 'Milan Cathedral (Duomo)', region: 'Italy', accentHex: '#F8FAFC', summary: 'Flamboyant Gothic marble cathedral bristling with pinnacles and flying buttresses.' },
  VERONA_ARENA: { name: 'Verona Arena', region: 'Italy', accentHex: '#FCA5A5', summary: 'Pink-marble Roman amphitheatre with open axial entrances and central arena.' },
  PANTHEON: { name: 'Pantheon', region: 'Italy', accentHex: '#E7E5E4', summary: 'Ancient Roman rotunda with a Corinthian portico and coffered oculus dome.' },
  REICHSTAG_DOME: { name: 'Reichstag Building', region: 'Germany', accentHex: '#38BDF8', summary: 'Neoclassical parliament building crowned by a modern glass-and-steel dome.' },
  FRAUENKIRCHE: { name: 'Dresden Frauenkirche', region: 'Germany', accentHex: '#FDE68A', summary: 'Baroque sandstone church topped by the iconic bell-shaped stone dome.' },
  ZOLLVEREIN_TOWER: { name: 'Zollverein Shaft XII', region: 'Germany', accentHex: '#EF4444', summary: 'Bauhaus industrial coal-mine winding tower and brick boiler hall.' },
  ERASMUS_BRIDGE: { name: 'Erasmus Bridge', region: 'Rotterdam', accentHex: '#38BDF8', summary: 'Asymmetric cable-stayed harp bridge spanning the Nieuwe Maas; fully drivable.' },
});

const LANDMARK_CATALOG = Object.freeze(
  Object.entries(LANDMARK_SPECS).map(([kind, spec]) => {
    const meta = LANDMARK_META[kind] || {};
    const totalCells = spec.cols * spec.rows;
    const blockedCount = spec.blocked.length;
    const collisionText =
      blockedCount === 0
        ? 'Passable (0 blocked)'
        : blockedCount === totalCells
        ? `Solid (${blockedCount}/${totalCells} blocked)`
        : `Partial (${blockedCount}/${totalCells} blocked)`;
    const tacticalNotes =
      blockedCount === 0
        ? 'Non-blocking landmark: tanks can drive across its entire footprint.'
        : blockedCount < totalCells
        ? 'Open archway/gate cells allow tank passage and direct line of fire; piers act as indestructible cover.'
        : 'All footprint cells act as indestructible LANDMARK cover blocking shells and movement.';
    const packLabel = (spec.pack || 'paris').toUpperCase();
    return Object.freeze({
      id: `lm_${kind.toLowerCase()}`,
      category: 'LANDMARKS',
      code: `LM-${packLabel}`,
      name: meta.name || kind.replace(/_/g, ' '),
      badge: `${meta.region || packLabel} Landmark`,
      accentHex: meta.accentHex || '#E2E8F0',
      landmarkKind: kind,
      summary: meta.summary || `${meta.region || packLabel} 3D battlefield landmark.`,
      tacticalNotes,
      specs: [
        { label: 'FOOTPRINT', value: `${spec.cols}×${spec.rows} cells (${spec.cols * 2}×${spec.rows * 2}m)` },
        { label: 'HEIGHT', value: `${spec.height.toFixed(1)}m` },
        { label: 'COLLISION', value: collisionText },
        { label: 'GLB PACK', value: packLabel },
      ],
    });
  })
);

export const CODEX_CATEGORIES = Object.freeze([
  Object.freeze({
    id: 'TANKS',
    label: 'TANKS & ARMOR',
    count: 16,
    icon: '◈',
  }),
  Object.freeze({
    id: 'SURFACES',
    label: 'SURFACES & DEFENSES',
    count: SURFACE_CATALOG.length,
    icon: '▣',
  }),
  Object.freeze({
    id: 'LANDMARKS',
    label: 'LANDMARKS',
    count: LANDMARK_CATALOG.length,
    icon: '❖',
  }),
  Object.freeze({
    id: 'POWERUPS',
    label: 'FIELD POWER-UPS',
    count: Object.keys(POWERUP_TYPES).length,
    icon: '✦',
  }),
  Object.freeze({
    id: 'EFFECTS',
    label: 'COMBAT EFFECTS',
    count: 8,
    icon: '⚡',
  }),
]);

export const CODEX_ITEMS = Object.freeze([
  Object.freeze({
    id: PLAYER_TANK_CONFIG.id,
    category: 'TANKS',
    code: PLAYER_TANK_CONFIG.code,
    name: PLAYER_TANK_CONFIG.name,
    badge: PLAYER_TANK_CONFIG.role,
    accentHex: PLAYER_TANK_CONFIG.accentHex,
    isPlayerMbt: true,
    summary: PLAYER_TANK_CONFIG.description,
    specs: PLAYER_TANK_CONFIG.specs,
  }),

  ...NON_BOSS_TANK_KEYS.map((tankKey) => {
    const cfg = TANK_CONFIGS[tankKey];
    const st = computeTankStats(cfg.loadout, cfg.base);
    return Object.freeze({
      id: `enemy_${cfg.id}`,
      category: 'TANKS',
      code: cfg.code,
      name: cfg.name,
      badge: cfg.role,
      accentHex: cfg.accentHex,
      enemyClass: cfg.id,
      summary: cfg.description,
      specs: [
        { label: 'LOADOUT', value: cfg.loadoutSummary },
        ...(cfg.sizeClass ? [{ label: 'SIZE CLASS', value: cfg.sizeClass }] : []),
        { label: 'DURABILITY (MAX HP)', value: `${st.maxHP} HP` },
        { label: 'ARMOR REDUCTION', value: formatArmor(st) },
        { label: 'MOVE SPEED / MASS', value: `${st.moveSpeed.toFixed(1)} c/s (${st.totalMass} t)` },
        {
          label: 'SIGHT / RADIO RANGE',
          value: `${st.sightRadius}m Sight / ${st.radioAlertRadius}m Radio (50%)`,
        },
        firepowerSpec(st),
      ],
      spawnEnemy: cfg.id,
    });
  }),

  ...Object.values(SECTOR_BOSS_CONFIGS).map((bossCfg) => {
    const bossStats = computeTankStats(bossCfg.loadout, bossCfg.base);
    return Object.freeze({
      id: bossCfg.id,
      category: 'TANKS',
      code: bossCfg.code,
      name: bossCfg.name,
      badge: bossCfg.role,
      accentHex: bossCfg.accentHex,
      enemyClass: bossCfg.enemyClass,
      summary: bossCfg.description,
      specs: [
        { label: 'LOADOUT', value: bossCfg.loadoutSummary },
        ...(bossCfg.sizeClass ? [{ label: 'SIZE CLASS', value: bossCfg.sizeClass }] : []),
        { label: 'MAX HP / ARMOR', value: `${bossStats.maxHP} HP / ${formatArmor(bossStats)}` },
        {
          label: 'SIGHT / RADIO RANGE',
          value: `${bossStats.sightRadius}m Sight / ${bossStats.radioAlertRadius}m Radio`,
        },
        { label: bossCfg.specialFeatureLabel, value: bossCfg.specialFeatureValue },
      ],
      spawnEnemy: bossCfg.enemyClass,
    });
  }),

  ...SURFACE_CATALOG.map((surface) =>
    Object.freeze({
      id: surface.id,
      category: 'SURFACES',
      code: surface.code,
      name: surface.name,
      role: surface.role,
      badge: surface.role,
      accentHex: surface.accentHex,
      surfaceType: surface.surfaceType,
      turretType: surface.turretType,
      previewType: surface.turretType ? 'TURRET' : 'SURFACE',
      description: surface.description,
      summary: surface.description,
      tacticalNotes: surface.description,
      specs: surface.specs,
    })
  ),

  ...LANDMARK_CATALOG,

  ...Object.values(POWERUP_TYPES).map((p) =>
    Object.freeze({
      id: `pwr_${p.id}`,
      category: 'POWERUPS',
      code: p.code || p.name.toUpperCase(),
      name: p.name,
      badge: p.role || (p.duration > 0 ? `Timed Boost (${p.duration}s)` : 'Permanent / Standalone Module'),
      accentHex: p.accentHex || `#${p.colorHex.toString(16).padStart(6, '0')}`,
      powerupType: p.id,
      summary: p.description,
      specs: p.specs,
      spawnPowerup: p.id,
    })
  ),

  Object.freeze({
    id: 'fx_cannon',
    category: 'EFFECTS',
    code: 'FX-BALLISTICS',
    name: 'APFSDS & Heavy Shell Ballistics',
    badge: 'Direct-Fire Ordnance',
    accentHex: '#FBBF24',
    effectType: 'CANNON',
    summary:
      'Demonstrates standard kinetic shells (Mk1–Mk3) vs Mk4/Mk5 Heavy Armor-Piercing rounds against reinforced concrete, including muzzle flash, hydro-recoil damping, and concrete spalling with exposed rebar.',
    specs: [
      { label: 'NORMAL SHELL (Mk1–Mk3)', value: '1 DMG to Concrete (16 hits) · 1 Brick layer' },
      { label: 'HEAVY AP (Mk4 / Mk5)', value: '4 DMG to Concrete (4 hits) · 2 Brick layers' },
      { label: 'PENETRATION FORMULA', value: 'EffArmor = max(0, Armor% - Pen%)' },
    ],
  }),

  Object.freeze({
    id: 'fx_missile',
    category: 'EFFECTS',
    code: 'FX-ATGM',
    name: 'Homing ATGM Guided Missile',
    badge: 'Standalone Module Ordnance',
    accentHex: '#EF4444',
    effectType: 'MISSILE',
    summary:
      'Fired from the standalone ROCKET_LAUNCHER module. Continuously steers toward the nearest hostile armor signature (7 rad/s turn rate), bypassing 80% of target armor and sweeping proximity mines.',
    specs: [
      { label: 'DAMAGE / PEN', value: `${MISSILE.DAMAGE} DMG / ${MISSILE.PENETRATION}% Penetration` },
      { label: 'FLIGHT SPEED', value: `${MISSILE.SPEED} cells/s (Turn rate ${MISSILE.TURN_RATE} rad/s)` },
      { label: 'MODULE TYPE', value: 'Standalone Non-Leveled Module' },
    ],
  }),

  Object.freeze({
    id: 'fx_artillery',
    category: 'EFFECTS',
    code: 'FX-ARTILLERY',
    name: '152mm Indirect Artillery Barrage',
    badge: 'Ballistic Arc & Danger Ring',
    accentHex: '#F97316',
    effectType: 'ARTILLERY',
    summary:
      'High-trajectory howitzer shell launched over obstacles onto a blinking red target ring. Deals 40 splash damage across a 1.5-cell radius unless intercepted at 72% flight progress by player APS.',
    specs: [
      { label: 'SPLASH DAMAGE', value: `40 DMG (${ARTILLERY.SPLASH_RADIUS} cells radius)` },
      { label: 'FLIGHT TIME', value: `${ARTILLERY.FLIGHT_TIME}s ballistic arc` },
      { label: 'APS INTERCEPT', value: `Interceptable at ${Math.round(APS.ARTILLERY_ENGAGE_PROGRESS * 100)}% arc progress` },
    ],
  }),

  Object.freeze({
    id: 'fx_aps',
    category: 'EFFECTS',
    code: 'FX-APS-ARENA',
    name: '4-Corner "Arena" APS Interception',
    badge: 'Standalone Defense Module',
    accentHex: '#10B981',
    effectType: 'APS',
    summary:
      'Standalone non-leveled active protection module. Four corner-mounted radar pods (FR, FL, RR, RL) scan for incoming threats. Light shells and all missiles cost 1 charge; Cannon Mk4/Mk5, HOWITZER and each BOSS_DUAL shell cost 2. Insufficient charges are preserved. Flames bypass APS.',
    specs: [
      { label: 'DETECTION RADIUS', value: `${APS.DETECT_RADIUS} cells (360° coverage)` },
      { label: 'REARM COOLDOWN', value: `${APS.REARM_TIME}s between intercepts` },
      { label: 'MODULE TYPE', value: 'Standalone Non-Leveled (4–12 max charges by Frame tier)' },
    ],
  }),

  Object.freeze({
    id: 'fx_flame',
    category: 'EFFECTS',
    code: 'FX-THERMAL',
    name: 'Thermal Flamethrower Cone',
    badge: 'Close-Range Incendiary',
    accentHex: '#EF4444',
    effectType: 'FLAME',
    summary:
      'Continuous stream of expanding thermal plasma projected by enemy FLAMETHROWER special weapons. Ignores APS interception and rapidly clears forest camouflage cover.',
    specs: [
      { label: 'APS BYPASS', value: 'Cannot be intercepted by APS' },
      { label: 'TERRAIN EFFECT', value: 'Incinerates Forest tiles on contact' },
    ],
  }),

  Object.freeze({
    id: 'fx_mine',
    category: 'EFFECTS',
    code: 'FX-MINEFIELD',
    name: 'Proximity Landmine & Detonation',
    badge: 'Standalone Minelayer Module',
    accentHex: '#EAB308',
    effectType: 'MINE',
    summary:
      'Deployed by the standalone MINE_LAYER enemy module along flanking avenues. Arms after a short delay with a blinking red beacon and detonates on proximity or when swept by cannon/ATGM fire.',
    specs: [
      { label: 'BLAST DAMAGE', value: '35 DMG in 1.2-cell radius' },
      { label: 'COUNTERPLAY', value: 'Destroy with cannon fire or ATGM sweep' },
    ],
  }),

  Object.freeze({
    id: 'fx_jammer',
    category: 'EFFECTS',
    code: 'FX-ECM-PULSE',
    name: 'ECM Electronic Warfare Field',
    badge: 'Standalone Jammer Module',
    accentHex: '#A855F7',
    effectType: 'JAMMER',
    summary:
      'Electromagnetic interference wave emitted by the standalone JAMMER enemy module within an 11-unit radius. Suppresses player APS radar interception and locks out ATGM missile launches.',
    specs: [
      { label: 'SUPPRESSION RADIUS', value: '5.5 cells around Jammer tank' },
      { label: 'SYSTEMS DISABLED', value: 'APS "Arena" & Homing ATGM Launcher' },
    ],
  }),

  Object.freeze({
    id: 'fx_airdrop',
    category: 'EFFECTS',
    code: 'FX-AIR-DROP',
    name: 'Allied Parachute Air Drop',
    badge: 'Configurable Resupply Crate',
    accentHex: '#F59E0B',
    effectType: 'AIR_DROP',
    summary:
      'Parachute-deployed tactical supply crate that descends onto a marked landing zone. Configurable per sector: on Sector 35 it restores 100% of cannon shells, APS charges, and ATGM missiles.',
    specs: [
      { label: 'SECTOR 35 PAYLOAD', value: 'Full Shells · Full APS · Full ATGM' },
      { label: 'DROP CADENCE', value: 'First drop at 22s, then every 35s' },
    ],
  }),

  Object.freeze({
    id: 'fx_repair',
    category: 'EFFECTS',
    code: 'FX-NANITE-REPAIR',
    name: 'HQ Field Repair & Emergency Kit',
    badge: 'Hull Restoration System',
    accentHex: '#10B981',
    effectType: 'REPAIR',
    summary:
      'Stationing the player tank within 2.5 cells of the Allied Command Base activates passive nanite welding (+3 HP/s with emerald spark emission). Below 33% HP, the standalone Repair Kit module triggers an instant +20 HP burst.',
    specs: [
      { label: 'HQ PASSIVE REPAIR', value: `+${BASE_REPAIR.RATE} HP/s within ${BASE_REPAIR.RADIUS_CELLS} cells` },
      { label: 'AUTO-REPAIR MODULE', value: '+20 HP instant burst at <33% HP' },
    ],
  }),
].map((item) =>
  Object.freeze({
    ...item,
    role: item.role || item.badge || item.category,
    subtitle: item.subtitle || item.badge || item.code,
    description: item.description || item.summary || '',
    tacticalNotes:
      item.tacticalNotes ||
      (item.isPlayerMbt
        ? 'Use the 5×5 Configurator below (Cannon Mk1–Mk5, CH1–CH5, F1–F5, E1–E5, A1–A5) to inspect every 3D component level and standalone module in real time.'
        : item.category === 'POWERUPS'
        ? 'Collect this trophy in the field or click the button below to air-drop it directly into the live combat sector.'
        : item.category === 'TANKS'
        ? 'Rotate the 360° turntable to inspect armor sloping, roadwheels, hull frame, and turret ordnance.'
        : 'Press SPACE or click Test Fire below to trigger the live 3D demonstration on the stage.'),
    previewType:
      item.previewType ||
      (item.isPlayerMbt
        ? 'PLAYER_TANK'
        : item.category === 'TANKS'
        ? 'ENEMY_TANK'
        : item.category === 'POWERUPS'
        ? 'POWERUP'
        : item.category === 'SURFACES'
        ? 'SURFACE'
        : item.category === 'LANDMARKS'
        ? 'LANDMARK'
        : 'EFFECT'),
    isBoss: Boolean(item.id?.startsWith('boss_')),
  })
));
