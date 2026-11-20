/** Air-dropped ordnance & munition component definitions (bombs, thermobaric missiles, air mines). */

export const AIR_ORDNANCE = Object.freeze({
  AIR_BOMB: Object.freeze({
    id: 'AIR_BOMB',
    bombCount: 3,
    radiusCells: 1.5,
    scatterCells: 1.75,
    damage: 24,
    penetration: 15,
    flightSec: 1.05,
    staggerSec: 0.24,
    releaseDelaySec: 0.75,
  }),
  THERMOBARIC_MISSILE: Object.freeze({
    id: 'THERMOBARIC_MISSILE',
    radiusCells: 3.5,
    damage: 25,
    penetration: 25,
    flightSec: 1.3,
    launchAltitude: 11,
  }),
  AIR_MINE: Object.freeze({
    id: 'AIR_MINE',
    mineCount: 9,
    zoneHalfCells: 2.2,
    flightSec: 1.0,
    staggerSec: 0.06,
    launchAltitude: 16,
  }),
});
