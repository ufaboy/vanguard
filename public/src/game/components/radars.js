/**
 * Player Radar Component Tiers (R1–R5):
 * Expands tactical radar range and enables enemy detection through obstacles.
 */
import { N_ } from '../../i18n/index.js';

export const RADARS = Object.freeze({
  R1: Object.freeze({
    id: 'R1',
    tier: 1,
    name: N_('R1 Basic Mast'),
    radarRangeCells: 14,
    throughObstacleCells: 0,
    mass: 1,
    hpBonus: 0,
    description: N_('Standard short-range tactical radar mast (14c range).'),
  }),
  R2: Object.freeze({
    id: 'R2',
    tier: 2,
    name: N_('R2 Doppler Array'),
    radarRangeCells: 17,
    throughObstacleCells: 2,
    mass: 1,
    hpBonus: 0,
    description: N_('Doppler array revealing nearby contacts behind cover (17c radar · 2c through cover).'),
  }),
  R3: Object.freeze({
    id: 'R3',
    tier: 3,
    name: N_('R3 Phased Radar'),
    radarRangeCells: 20,
    throughObstacleCells: 5,
    mass: 2,
    hpBonus: 0,
    description: N_('Phased-array sensor penetrating walls and terrain (20c radar · 5c through cover).'),
  }),
  R4: Object.freeze({
    id: 'R4',
    tier: 4,
    name: N_('R4 AESA Dome'),
    radarRangeCells: 24,
    throughObstacleCells: 7,
    mass: 2,
    hpBonus: 0,
    description: N_('Active electronically scanned dome tracking targets behind cover (24c radar · 7c through cover).'),
  }),
  R5: Object.freeze({
    id: 'R5',
    tier: 5,
    name: N_('R5 Vanguard AWACS'),
    radarRangeCells: 28,
    throughObstacleCells: 10,
    mass: 3,
    hpBonus: 0,
    description: N_('Long-range AESA radar piercing all obstacles (28c radar · 10c through cover).'),
  }),
});
