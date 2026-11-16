/** Blender tile models whose damage states break open toward the hits (BRICK, CONCRETE). */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Half the 2x2 footprint of a tile model. */
const HALF = 1;
/** A hit this far along a face from its middle knocks the corner off instead. */
const CORNER_HIT = 0.6;

/**
 * Where a shell now at (dx, dz) from the tile centre, flying along (vx, vz), crossed the
 * tile edge. A shell is first seen some way inside the tile, so its position alone can name
 * the wrong face.
 */
export function breachEntryOffset(dx, dz, vx, vz) {
  let back = Infinity;
  if (vx) back = Math.min(back, (dx + Math.sign(vx) * HALF) / vx);
  if (vz) back = Math.min(back, (dz + Math.sign(vz) * HALF) / vz);
  if (!Number.isFinite(back) || back < 0) return { dx, dz };
  const clamp = v => Math.max(-HALF, Math.min(HALF, v));
  return { dx: clamp(dx - vx * back), dz: clamp(dz - vz * back) };
}

/** The point on the edge of the tile centred at (cx, cz) that faces a blast at (fromX, fromZ). */
export function breachPointToward(cx, cz, fromX, fromZ) {
  const dx = fromX - cx;
  const dz = fromZ - cz;
  const reach = Math.max(Math.abs(dx), Math.abs(dz));
  if (reach < 0.05) return { x: cx, z: cz };
  return { x: cx + (dx / reach) * HALF, z: cz + (dz / reach) * HALF };
}

/**
 * How a tile is breached: `variant` picks the model family and `turn` (quarter turns about
 * Y) points it at the hits. Faces are numbered 0: +Z, 1: +X, 2: -Z, 3: -X.
 *   F: one face `turn`.  C: the corner between faces `turn` and `turn + 1`.
 *   L: faces `turn` and `turn + 1`.  O: faces `turn` and `turn + 2`.
 * The first hit picks F or C. A hit on another face turns F into L or O; those models only
 * exist from `state` 2 down, so until then the second face is remembered in `other`.
 * (dx, dz) is the hit offset from the tile centre; a centred hit names no face.
 */
export function nextBreach(breach, dx, dz, state) {
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  const centred = Math.max(ax, az) < 0.05;
  const zFace = dz > 0 ? 0 : 2;
  const xFace = dx > 0 ? 1 : 3;
  if (!breach) {
    if (centred) return { variant: 'F', turn: 0 };
    if (Math.min(ax, az) < CORNER_HIT) return { variant: 'F', turn: ax > az ? xFace : zFace };
    return { variant: 'C', turn: (zFace + 1) % 4 === xFace ? zFace : xFace };
  }
  if (breach.variant !== 'F') return breach;
  const face = centred ? breach.turn : ax > az ? xFace : zFace;
  const other = face !== breach.turn ? face : breach.other;
  if (other === undefined) return breach;
  if (state > 2) return other === breach.other ? breach : { ...breach, other };
  if ((other + 2) % 4 === breach.turn) return { variant: 'O', turn: Math.min(other, breach.turn) };
  return { variant: 'L', turn: (breach.turn + 1) % 4 === other ? breach.turn : other };
}

export function breachYaw(breach) {
  return breach.turn === 3 ? -Math.PI / 2 : breach.turn * (Math.PI / 2);
}

/**
 * Damage states of one tile type from a GLB whose nodes are named `<PREFIX>_HP_<state>` (one
 * breached face, states 4..0) and `<PREFIX>_<C|L|O>_HP_<state>` (the other breach variants).
 */
export class BreachModels {
  constructor(url, prefix) {
    this.url = url;
    this.prefix = prefix;
    this.states = new Map();
    /** Corner and two-face damage states, keyed like `C3` or `L2`. */
    this.variants = new Map();
    this.material = null;
    this.materials = new Map();
    this.disposed = false;
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(this.url);
    const pattern = new RegExp(`^${this.prefix}_(?:([CLO])_)?HP_(\\d)$`);
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(node => {
      if (!node.isMesh) return;
      const [, variant, hp] = node.name.match(pattern) || [];
      if (!hp) return;
      node.geometry.applyMatrix4(node.matrixWorld);
      if (variant) this.variants.set(variant + hp, node.geometry);
      else this.states.set(Number(hp), node.geometry);
      this.material ||= node.material;
    });
    if (this.disposed) { this.dispose(); return false; }
    if (this.states.size !== 5 || !this.material) {
      this.dispose();
      throw new Error(`Incomplete ${this.prefix} model states.`);
    }
    this.prepareMaterials();
    return true;
  }

  /** Every damage state shares the loaded material unless a subclass finishes them apart. */
  prepareMaterials() {
    for (let state = 0; state <= 4; state++) this.materials.set(state, this.material);
  }

  /**
   * Shows damage state `hp` (rounded up) of `variant` in `group`. A variant without a model
   * for this state falls back to the one-face model. `material` replaces the state material,
   * e.g. a per-tile tinted clone.
   */
  apply(group, hp, variant = 'F', material = null) {
    const state = Math.max(0, Math.min(4, Math.ceil(hp)));
    const geometry = this.variants.get(variant + state) || this.states.get(state);
    material ||= this.materials.get(state);
    // Without its shared material a mesh would get a fresh default one and break batching.
    if (!geometry || !material || this.disposed) return false;
    const shown = group.userData.tileModel === this && group.children[0];
    if (shown && shown.geometry === geometry && shown.material === material) return false;
    group.clear();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = state > 0;
    mesh.receiveShadow = true;
    group.add(mesh);
    group.userData.tileModel = this;
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
    for (const material of new Set(this.materials.values())) if (material !== this.material) material.dispose();
    this.materials.clear();
    this.material?.dispose();
    this.material = null;
  }
}
