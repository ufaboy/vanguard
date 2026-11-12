/**
 * Mission terrain surface sampling.
 */

import { TERRAIN_SURFACES } from './catalog.js';

export function sampleMissionTerrain(mission, x = 0, z = 0) {
  const surfKey = mission?.defaultSurface || 'asphalt';
  const surface = TERRAIN_SURFACES[surfKey] || TERRAIN_SURFACES.asphalt;
  return {
    surface,
    elevation: 0,
    x,
    z,
  };
}
