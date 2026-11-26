/** Editor palette catalog and char/TileType mappings matching public/src/game/levels.js. */
import { TileType } from '/public/src/game/terrains/surfaces.js';
import { PLACEABLE_LANDMARKS } from '/public/src/game/terrains/landmarks.js';
import { POWERUP } from '/public/src/game/powerups.js';

export const GRID_SIZE = 40;
export const TILE_SIZE = 2.0;

export const SURFACES = [
  { tile: TileType.EMPTY, char: '.', name: 'Ground / Asphalt', color: '#64748b' },
  { tile: TileType.ROAD, char: 'R', name: 'Paved Road', color: '#334155' },
  { tile: TileType.WATER, char: 'W', name: 'Deep Water', color: '#0284c7' },
  { tile: TileType.ICE, char: 'I', name: 'Glacial Ice', color: '#bae6fd' },
  { tile: TileType.SAND, char: 'S', name: 'Desert Sand', color: '#eab308' },
  { tile: TileType.STONE, char: '^', name: 'Cobble / Stone', color: '#78716c' },
  { tile: TileType.GRASS, char: 'V', name: 'Grassland', color: '#16a34a' },
  { tile: TileType.SWAMP, char: 'M', name: 'Swamp / Mud', color: '#4d7c0f' },
  { tile: TileType.OIL_SLICK, char: 'L', name: 'Oil Slick', color: '#1e1b4b' },
  { tile: TileType.RAIL, char: '#', name: 'Railroad Track', color: '#52525b' },
  { tile: 'railCurve', char: 'C3', name: 'Rail Curve (3×3)', sub: 'Gentle 90° track turn (Space to rotate)', color: '#71717a' },
];

export const OBJECTS = [
  { tile: null, char: '.', name: 'Empty (Clear Object)', color: '#1e293b' },
  { tile: TileType.BRICK, char: 'B', name: 'Brick Wall (4 HP)', color: '#d97706' },
  { tile: TileType.CONCRETE, char: 'C', name: 'Concrete Wall (16 HP)', color: '#94a3b8' },
  { tile: TileType.FOREST, char: 'F', name: 'Forest Canopy', color: '#15803d' },
  { tile: TileType.HEDGEHOG, char: 'X', name: 'Czech Hedgehog', color: '#475569' },
  { tile: TileType.BARREL, char: 'D', name: 'Fuel Barrel', color: '#dc2626' },
  { tile: TileType.BOXES, char: 'Q', name: 'Supply Crates', color: '#ca8a04' },
  { tile: TileType.CRATER, char: 'K', name: 'Shell Crater', color: '#57534e' },
  { tile: TileType.WATER_TOWER, char: 'T', name: 'Water Tower', color: '#0ea5e9' },
  { tile: TileType.BRIDGE, char: '=', name: 'Bridge', color: '#a16207' },
  { tile: TileType.RAIL_BRIDGE, char: 'RB', name: 'Railroad Bridge', sub: 'Steel through-truss railway deck', color: '#64748b' },
  { tile: TileType.RUBBLE, char: 'U', name: 'Rubble', color: '#71717a' },
  { tile: TileType.HOUSE_1, char: 'A', name: 'Building Type 1', color: '#b45309' },
  { tile: TileType.HOUSE_2, char: 'P', name: 'Building Type 2', color: '#9a3412' },
  { tile: TileType.CONTAINER, char: 'J', name: 'Shipping Container (8 HP)', color: '#2563eb' },
  { tile: TileType.TRANSFORMER, char: 'Y', name: 'EMP Transformer (2 HP)', color: '#38bdf8' },
  { tile: TileType.SANDBAGS, char: 'S', name: 'Sandbags (3 HP)', color: '#c2a67d' },
  { tile: TileType.RAIL_CAR, char: 'V', name: 'Freight Rail Car (10 HP)', color: '#7c2d12' },
  { tile: TileType.LOCOMOTIVE, char: 'M', name: 'Diesel Locomotive (16 HP)', color: '#1e3a5f' },
  { tile: TileType.ENEMY_BASE, char: 'E', name: 'Enemy Stronghold', color: '#ef4444' },
];

export const PROPS = [
  { kind: 'lamp', name: 'Prop: Streetlamp', color: '#fde047' },
  { kind: 'fence', name: 'Prop: Fence', color: '#a16207' },
  { kind: 'car', name: 'Prop: Abandoned Car', color: '#64748b' },
  { kind: 'shrub', name: 'Prop: Shrub / Lavender', color: '#4ade80' },
  { kind: 'barricade', name: 'Prop: Road Barricade', color: '#ef4444' },
];

export const MARKERS = [
  { id: 'playerSpawn', name: 'Player Spawn', sub: 'Sets playerSpawnCell', color: '#22c55e' },
  { id: 'baseCell', name: 'Allied HQ (2×1)', sub: 'Sets baseCell anchor', color: '#3b82f6' },
  { id: `powerup:${POWERUP.REPAIR}`, powerupType: 'REPAIR', name: 'Crate: Repair', sub: 'Field Repair Kit', color: '#22c55e' },
  { id: `powerup:${POWERUP.EMP}`, powerupType: 'EMP', name: 'Crate: EMP', sub: 'EMP Blast (10s)', color: '#06b6d4' },
  { id: `powerup:${POWERUP.BASE_RESTORE}`, powerupType: 'BASE_RESTORE', name: 'Crate: Base Restore', sub: 'Fortify HQ', color: '#60a5fa' },
  { id: `powerup:${POWERUP.APS}`, powerupType: 'APS', name: 'Crate: APS', sub: 'Active Protection', color: '#a855f7' },
  { id: `powerup:${POWERUP.MISSILE}`, powerupType: 'MISSILE', name: 'Crate: ATGM', sub: 'Guided Missiles', color: '#f97316' },
  { id: `powerup:${POWERUP.AMMO}`, powerupType: 'AMMO', name: 'Crate: Ammo', sub: 'Shell Resupply', color: '#eab308' },
  { id: 'prop:lamp', propKind: 'lamp', name: 'Prop: Streetlamp', sub: 'Crushable 3D Prop', color: '#fde047' },
  { id: 'prop:fence', propKind: 'fence', name: 'Prop: Fence', sub: 'Crushable 3D Prop', color: '#a16207' },
  { id: 'prop:car', propKind: 'car', name: 'Prop: Abandoned Car', sub: 'Crushable 3D Prop', color: '#64748b' },
  { id: 'prop:shrub', propKind: 'shrub', name: 'Prop: Shrub / Lavender', sub: 'Crushable 3D Prop', color: '#4ade80' },
  { id: 'prop:barricade', propKind: 'barricade', name: 'Prop: Barricade', sub: 'Crushable 3D Prop', color: '#ef4444' },
];

export const LANDMARKS = PLACEABLE_LANDMARKS.map((kind) => ({
  kind,
  name: kind.replace(/_/g, ' '),
  color: '#f59e0b',
}));

export const DECORATIONS = [
  { kind: null, group: 'clear', name: 'Empty (Clear Deco)', sub: 'Clear decal / zone on cell', color: '#1e293b' },
  { kind: 'crosswalk', group: 'decal', name: 'Crosswalk', color: '#e2e8f0' },
  { kind: 'parking', group: 'decal', name: 'Parking Bay', color: '#94a3b8' },
  { kind: 'manhole', group: 'decal', name: 'Manhole', color: '#475569' },
  { kind: 'loading', group: 'decal', name: 'Loading Zone', color: '#f59e0b' },
  { kind: 'helipad', group: 'decal', name: 'Helipad', color: '#38bdf8' },
  { kind: 'hazard_zone', group: 'decal', name: 'Hazard Zone', color: '#eab308' },
  { kind: 'chevron', group: 'decal', name: 'Chevron', color: '#fb923c' },
  { kind: 'drain_grate', group: 'decal', name: 'Drain Grate', color: '#64748b' },
  { kind: 'label', group: 'decal', name: 'District Label', color: '#a855f7' },
  { kind: 'zone:asphalt', group: 'zone', surface: 'asphalt', name: 'Zone: Asphalt', color: '#343e44' },
  { kind: 'zone:pavers', group: 'zone', surface: 'pavers', name: 'Zone: Pavers', color: '#696b61' },
  { kind: 'zone:concrete', group: 'zone', surface: 'concrete', name: 'Zone: Concrete', color: '#72766e' },
  { kind: 'zone:dirt', group: 'zone', surface: 'dirt', name: 'Zone: Dirt', color: '#695a43' },
  { kind: 'zone:gravel', group: 'zone', surface: 'gravel', name: 'Zone: Gravel', color: '#66665b' },
  { kind: 'zone:sand', group: 'zone', surface: 'sand', name: 'Zone: Sand', color: '#ae956c' },
  { kind: 'zone:snow', group: 'zone', surface: 'snow', name: 'Zone: Snow', color: '#b5bfbd' },
];

export const SURFACE_CHAR_TO_TILE = {
  '.': TileType.EMPTY,
  _: TileType.EMPTY,
  ' ': TileType.EMPTY,
  G: TileType.EMPTY,
  R: TileType.ROAD,
  W: TileType.WATER,
  I: TileType.ICE,
  S: TileType.SAND,
  N: TileType.SAND,
  '^': TileType.STONE,
  V: TileType.GRASS,
  M: TileType.SWAMP,
  L: TileType.OIL_SLICK,
  '#': TileType.RAIL,
};

export const OBJECT_CHAR_TO_TILE = {
  '.': null,
  _: null,
  ' ': null,
  B: TileType.BRICK,
  C: TileType.CONCRETE,
  F: TileType.FOREST,
  X: TileType.HEDGEHOG,
  Z: TileType.HEDGEHOG,
  D: TileType.BARREL,
  O: TileType.BARREL,
  Q: TileType.BOXES,
  K: TileType.CRATER,
  T: TileType.WATER_TOWER,
  '=': TileType.BRIDGE,
  U: TileType.RUBBLE,
  A: TileType.HOUSE_1,
  P: TileType.HOUSE_2,
  J: TileType.CONTAINER,
  Y: TileType.TRANSFORMER,
  S: TileType.SANDBAGS,
  V: TileType.RAIL_CAR,
  M: TileType.LOCOMOTIVE,
  H: TileType.BASE,
  E: TileType.ENEMY_BASE,
};

export const SURFACE_TILE_TO_CHAR = new Map(SURFACES.map((s) => [s.tile, s.char]));
export const OBJECT_TILE_TO_CHAR = new Map(OBJECTS.map((o) => [o.tile, o.char]));
export const SURFACE_BY_TILE = new Map(SURFACES.map((s) => [s.tile, s]));
export const OBJECT_BY_TILE = new Map(OBJECTS.map((o) => [o.tile, o]));
