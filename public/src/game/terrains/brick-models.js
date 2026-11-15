/** Blender brick model state loader and batch mesh application. */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyBrickFinish } from './brick-finish.js';

/** Half the 2x2 footprint of the brick model. */
const HALF = 1;
/** A hit this far along a face from its middle knocks the corner off instead. */
const CORNER_HIT = 0.6;

/**
 * Where a shell now at (dx, dz) from the tile centre, flying along (vx, vz), crossed the
 * tile edge. A shell is first seen some way inside the tile, so its position alone can name
 * the wrong face.
 */
export function brickEntryOffset(dx, dz, vx, vz) {
  let back = Infinity;
  if (vx) back = Math.min(back, (dx + Math.sign(vx) * HALF) / vx);
  if (vz) back = Math.min(back, (dz + Math.sign(vz) * HALF) / vz);
  if (!Number.isFinite(back) || back < 0) return { dx, dz };
  const clamp = v => Math.max(-HALF, Math.min(HALF, v));
  return { dx: clamp(dx - vx * back), dz: clamp(dz - vz * back) };
}

/**
 * How a brick tile is breached: `variant` picks the model family and `turn` (quarter turns
 * about Y) points it at the hits. Faces are numbered 0: +Z, 1: +X, 2: -Z, 3: -X.
 *   F: one face `turn`.  C: the corner between faces `turn` and `turn + 1`.
 *   L: faces `turn` and `turn + 1`.  O: faces `turn` and `turn + 2`.
 * The first hit picks F or C. A later hit on another face turns F into L or O, which only
 * exist from `state` 2 down. (dx, dz) is the hit offset from the tile centre.
 */
export function nextBrickBreach(breach, dx, dz, state) {
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  if (Math.max(ax, az) < 0.05) return breach || { variant: 'F', turn: 0 };
  const zFace = dz > 0 ? 0 : 2;
  const xFace = dx > 0 ? 1 : 3;
  const face = ax > az ? xFace : zFace;
  if (!breach) {
    if (Math.min(ax, az) < CORNER_HIT) return { variant: 'F', turn: face };
    return { variant: 'C', turn: (zFace + 1) % 4 === xFace ? zFace : xFace };
  }
  if (breach.variant !== 'F' || face === breach.turn || state > 2) return breach;
  if ((face + 2) % 4 === breach.turn) return { variant: 'O', turn: Math.min(face, breach.turn) };
  return { variant: 'L', turn: (breach.turn + 1) % 4 === face ? breach.turn : face };
}

export function brickBreachYaw(breach) {
  return breach.turn === 3 ? -Math.PI / 2 : breach.turn * (Math.PI / 2);
}

export class BrickModels {
  constructor() {
    this.states = new Map();
    /** Corner and two-face damage states, keyed like `C3` or `L2`. */
    this.variants = new Map();
    this.material = null;
    this.materials = new Map();
    this.disposed = false;
  }

  async load() {
    const brickUrl = new URL('../../../models/terrain/brick.glb', import.meta.url).href;
    const gltf = await new GLTFLoader().loadAsync(brickUrl);
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(node => {
      if (!node.isMesh) return;
      const [, variant, hp] = node.name.match(/^BRICK_(?:([CLO])_)?HP_(\d)$/) || [];
      if (!hp) return;
      node.geometry.applyMatrix4(node.matrixWorld);
      if (variant) this.variants.set(variant + hp, node.geometry);
      else this.states.set(Number(hp), node.geometry);
      this.material ||= node.material;
    });
    if (this.disposed) { this.dispose(); return false; }
    if (this.states.size !== 5 || !this.material) {
      this.dispose();
      throw new Error('Incomplete BRICK model states.');
    }
    this.prepareMaterials();
    return true;
  }

  /** Gives every damage state its finished material; the intact state keeps the loaded one. */
  prepareMaterials() {
    applyBrickFinish(this.material);
    this.materials.set(4, this.material);
    for (let hp = 0; hp < 4; hp++) {
      this.materials.set(hp, applyBrickFinish(this.material.clone(), hp));
    }
  }

  /** A variant without a model for this state falls back to the one-face model. */
  apply(group, hp, variant = 'F') {
    const state = Math.max(0, Math.min(4, Math.ceil(hp)));
    const geometry = this.variants.get(variant + state) || this.states.get(state);
    const material = this.materials.get(state);
    // Without its shared material a mesh would get a fresh default one and break batching.
    if (!geometry || !material || this.disposed) return false;
    if (group.userData.brickModel === 'blender' && group.children[0]?.geometry === geometry) return false;
    group.clear();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = state > 0;
    mesh.receiveShadow = true;
    group.add(mesh);
    group.userData.brickModel = 'blender';
    group.userData.brickState = state;
    group.userData.batchRevision = (group.userData.batchRevision || 0) + 1;
    return true;
  }

  dispose() {
    this.disposed = true;
    for (const geometry of this.states.values()) geometry.dispose();
    for (const geometry of this.variants.values()) geometry.dispose();
    this.states.clear();
    this.variants.clear();
    this.material?.map?.dispose();
    for (const [hp, material] of this.materials) if (hp !== 4) material.dispose();
    this.materials.clear();
    this.material?.dispose();
    this.material = null;
  }
}
