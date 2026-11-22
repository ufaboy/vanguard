/** Blender BRICK tile model: damage states and breach variants from models/terrain/brick.glb. */

import { BreachModels } from './breach-models.js';
import { applyBrickFinish } from './brick-finish.js';

export class BrickModels extends BreachModels {
  constructor(renderer = null) {
    super(new URL('../../../models/terrain/brick.glb', import.meta.url).href, 'BRICK', renderer);
  }

  /** Gives every damage state its finished material; the intact state keeps the loaded one. */
  prepareMaterials() {
    applyBrickFinish(this.material);
    this.materials.set(4, this.material);
    for (let hp = 0; hp < 4; hp++) {
      this.materials.set(hp, applyBrickFinish(this.material.clone(), hp));
    }
  }
}
