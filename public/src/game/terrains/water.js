/** Water surface adapter; collision and material ownership stay in the shared builder. */
import { createContinuousSurface } from './continuous-surface.js';

export function createWaterSurface(grid, waterType, tileSize, material, options = {}) {
  return createContinuousSurface(grid, waterType, tileSize, material, options);
}
