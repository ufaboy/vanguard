/** Blender CONCRETE tile model: damage states and breach variants from models/terrain/concrete.glb. */

import { BreachModels } from './breach-models.js';

/**
 * Model state of a concrete tile: 4 only while untouched, so the first hit already chips it,
 * then 3..1 over equal thirds of its HP, and 0 once destroyed.
 */
export function concreteDamageState(hp, maxHp = 16) {
  if (hp <= 0) return 0;
  if (hp >= maxHp) return 4;
  return Math.max(1, Math.ceil((hp / maxHp) * 3));
}

export class ConcreteModels extends BreachModels {
  constructor(renderer = null) {
    super(new URL('../../../models/terrain/concrete.glb', import.meta.url).href, 'CONCRETE', renderer);
  }

  /**
   * The intact tint is the top of the per-hit darkening ramp. One batch key lets the
   * per-tile tinted clones of the material share an instanced batch.
   */
  prepareMaterials() {
    this.material.color.setHex(0x8c96a3);
    this.material.userData.batchKey = 'concrete-model';
    super.prepareMaterials();
  }
}
