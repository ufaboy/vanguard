/** Frozen terrain uses continuous fractures, frosted edges and static world-aligned UVs. */
import { createContinuousSurface } from './continuous-surface.js';

export function createIceSurface(grid, iceType, tileSize, material, options = {}) {
  return createContinuousSurface(grid, iceType, tileSize, material, { ...options, frozen: true });
}
