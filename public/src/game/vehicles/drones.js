/** Drone Configurations (Tactical Field-Repair Quadrotor UAV). */

export const DRONE_CONFIGS = Object.freeze({
  REPAIR_DRONE: Object.freeze({
    id: 'REPAIR_DRONE',
    modelUrl: './models/air_repair_drone.glb',
    scale: 0.75,
    approachSpeed: 22,
    departSpeed: 26,
    approachAltitude: 7.5,
    hoverAltitude: 2.6,
    departClimbSpeed: 6,
    healAmount: 20,
    durationSec: 3.5,
  }),
});
