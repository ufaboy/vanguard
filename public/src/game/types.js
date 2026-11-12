/** Core Enumerations & Catalog Re-Exports. */

import {
  TileType,
  SURFACE_TYPES,
  SURFACE_CONFIGS,
  SURFACE_CATALOG,
} from './terrains/surfaces.js';
import {
  TANK_TYPES,
  EnemyClass,
  PLAYER_TANK_CONFIG,
  TANK_CONFIGS,
  SECTOR_BOSS_CONFIGS,
  SPECIAL_ENEMY_CATALOG,
} from './tanks.js';

import {
  MAP_MODES,
  VICTORY_CONDITIONS,
  DEFEAT_CONDITIONS,
  PLAYER_BASE_ROLES,
  MAP_MODE_CONFIGS,
  MAP_MODES_LIST,
  resolveMapRules,
  checkMapVictory,
  checkMapDefeat,
} from './mapRules.js';

export const GameStatus = Object.freeze({
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  BOSS_INTRO: 'BOSS_INTRO',
  VICTORY: 'VICTORY',
  GAME_OVER: 'GAME_OVER',
});

export {
  TileType,
  SURFACE_TYPES,
  SURFACE_CONFIGS,
  SURFACE_CATALOG,
  TANK_TYPES,
  EnemyClass,
  PLAYER_TANK_CONFIG,
  TANK_CONFIGS,
  SECTOR_BOSS_CONFIGS,
  SPECIAL_ENEMY_CATALOG,
  MAP_MODES,
  VICTORY_CONDITIONS,
  DEFEAT_CONDITIONS,
  PLAYER_BASE_ROLES,
  MAP_MODE_CONFIGS,
  MAP_MODES_LIST,
  resolveMapRules,
  checkMapVictory,
  checkMapDefeat,
};
