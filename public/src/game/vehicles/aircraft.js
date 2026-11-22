/** Aircraft Configurations (Strategic Bomber and AC-130 Spooky Gunship). */

export const AIRCRAFT_CONFIGS = Object.freeze({
  STRATEGIC_BOMBER: Object.freeze({
    id: 'STRATEGIC_BOMBER',
    modelUrl: './models/air_bomber.glb',
    scale: 1,
    speed: 28,
    altitude: 20,
    flybySec: 3.6,
    leadFactor: 0.45,
    reconRadiusCells: 20,
  }),
  AC130_SPOOKY: Object.freeze({
    id: 'AC130_SPOOKY',
    modelUrl: './models/air_ac130.glb',
    scale: 1,
    approachSpeed: 36,
    departSpeed: 38,
    orbitRadiusRatio: 0.3,
    orbitHeight: 14.5,
    orbitAngularSpeed: 0.55,
    bankAngleRad: 0.22,
    durationSec: 15.0,
    fireIntervalSec: 0.7,
    weaponId: 'CANNON_Mk2',
    reconRadiusCells: 20,
  }),
});
