/**
 * Blender 1-story (5 damage stages) and 2-story (7 damage stages) modular building models.
 * Intact state uses 8 distinct facade/roof styles per tier; damaged states share inner concrete geometry.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const BUILDING_MAX_HP = Object.freeze({
  house1: 25,
  house2: 70,
});

/**
 * Maps current HP to building visual state:
 * - house1: 5 (intact), 4..1 (4 standing damage stages), 0 (rubble)
 * - house2: 7 (intact), 6..1 (6 standing damage stages), 0 (rubble)
 * @param {number} hp
 * @param {number} maxHp
 * @param {'house1'|'house2'} kind
 * @returns {number}
 */
export function buildingDamageState(hp, maxHp = 25, kind = 'house1') {
  const intact = kind === 'house2' ? 7 : 5;
  if (hp <= 0) return 0;
  if (hp >= maxHp) return intact;
  const damagedSteps = intact - 1;
  const ratio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
  return Math.max(1, Math.min(damagedSteps, Math.ceil(ratio * damagedSteps)));
}

export class BuildingModels {
  constructor() {
    this.url = new URL('../../../models/terrain/buildings.glb', import.meta.url).href;
    /** Geometries keyed by `house1_s{0..7}_{part}_5`, `house1_{part}_{1..4}`, `house1_0`, etc. */
    this.geometries = new Map();
    this.material = null;
    this.disposed = false;
  }

  get ready() {
    return this.geometries.size > 0 && Boolean(this.material) && !this.disposed;
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(this.url);
    const pattern = /^house([12])_(?:([sr]\d+)_)?(?:(corner|edge|core)_)?hp_(\d)$/i;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((node) => {
      if (!node.isMesh) return;
      const match = node.name.match(pattern);
      if (!match) return;
      const [, tier, variantStr, part, stateStr] = match;
      const kind = `house${tier}`;
      const state = Number(stateStr);
      let key;
      if (state === 0) {
        key = `${kind}_0`;
      } else if (variantStr !== undefined) {
        key = `${kind}_${variantStr.toLowerCase()}_${(part || 'core').toLowerCase()}_${state}`;
      } else {
        key = `${kind}_${(part || 'core').toLowerCase()}_${state}`;
      }
      node.geometry.applyMatrix4(node.matrixWorld);
      this.geometries.set(key, node.geometry);
      this.material ||= node.material;
    });
    if (this.disposed) {
      this.dispose();
      return false;
    }
    if (this.geometries.size < 98 || !this.material) {
      this.dispose();
      throw new Error(`Incomplete building model states (${this.geometries.size}/98).`);
    }
    this.material.userData.batchKey = 'buildings-atlas';
    return true;
  }

  /**
   * Applies the requested building module, style (0..7 for intact), and destruction state to `group`.
   */
  apply(group, kind, part, state, style = 0, materialOverride = null) {
    const maxState = kind === 'house2' ? 7 : 5;
    const s = Math.max(0, Math.min(maxState, Math.round(state)));
    const key =
      s === 0
        ? `${kind}_0`
        : s === maxState
          ? `${kind}_s${style & 7}_${part}_${s}`
          : kind === 'house1' && (s === 4 || s === 3)
            ? `${kind}_r${style & 3}_${part}_${s}`
            : `${kind}_${part}_${s}`;
    const geometry = this.geometries.get(key);
    const material = materialOverride || this.material;
    if (!geometry || !material || this.disposed) return false;

    const shown = group.userData.tileModel === this && group.children[0];
    if (shown && shown.geometry === geometry && shown.material === material) return false;

    group.clear();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = s > 0;
    mesh.receiveShadow = true;
    group.add(mesh);
    group.userData.tileModel = this;
    group.userData.batchRevision = (group.userData.batchRevision || 0) + 1;
    return true;
  }

  dispose() {
    this.disposed = true;
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.geometries.clear();
    this.material?.map?.dispose();
    this.material?.roughnessMap?.dispose();
    this.material?.metalnessMap?.dispose();
    this.material?.aoMap?.dispose();
    this.material?.dispose();
    this.material = null;
  }
}
