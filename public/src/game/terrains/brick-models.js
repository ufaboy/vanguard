/** Blender brick model state loader and batch mesh application. */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyBrickFinish } from './brick-finish.js';

export class BrickModels {
  constructor() {
    this.states = new Map();
    this.material = null;
    this.materials = new Map();
    this.disposed = false;
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync('./models/terrain/brick.glb');
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(node => {
      if (!node.isMesh) return;
      const hp = Number(node.name.match(/BRICK_HP_(\d)/)?.[1]);
      if (!Number.isInteger(hp)) return;
      node.geometry.applyMatrix4(node.matrixWorld);
      this.states.set(hp, node.geometry);
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

  apply(group, hp) {
    const state = Math.max(0, Math.min(4, Math.ceil(hp)));
    const geometry = this.states.get(state);
    const material = this.materials.get(state);
    // Without its shared material a mesh would get a fresh default one and break batching.
    if (!geometry || !material || this.disposed) return false;
    if (group.userData.brickState === state && group.userData.brickModel === 'blender') return false;
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
    this.states.clear();
    this.material?.map?.dispose();
    for (const [hp, material] of this.materials) if (hp !== 4) material.dispose();
    this.materials.clear();
    this.material?.dispose();
    this.material = null;
  }
}
