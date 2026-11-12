/** Static arena map tile instanced batch renderer. */

import * as THREE from 'three';

/** TileBatcher draws the static map tiles (brick, concrete, forest, water, ice) through a. */

const HIDDEN_LAYER = 31;
const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
const WHITE = new THREE.Color(1, 1, 1);
const MIN_CAPACITY = 32;

function geometryKey(geometry) {
  if (geometry.userData.batchGeometryKey) return geometry.userData.batchGeometryKey;
  const key = geometry.parameters
    ? `${geometry.type}:${JSON.stringify(geometry.parameters)}`
    : geometry.uuid;
  geometry.userData.batchGeometryKey = key;
  return key;
}

function materialKey(material) {
  return material.userData.batchKey || material.uuid;
}

function cloneForBatch(material) {
  const clone = material.clone();
  if (clone.color) clone.color.copy(WHITE);
  clone.onBeforeCompile = material.onBeforeCompile;
  clone.customProgramCacheKey = material.customProgramCacheKey;
  return clone;
}

function skipMatrixWorldUpdate() {}

function isEffectivelyVisible(mesh, root) {
  for (let o = mesh; o; o = o.parent) {
    if (!o.visible) return false;
    if (o === root) return true;
  }
  return true;
}

export class TileBatcher {
  /** @param {THREE.Group} sourceGroup group whose direct children are tile roots */
  constructor(sourceGroup) {
    this.source = sourceGroup;
    this.root = new THREE.Group();
    this.root.name = 'TileBatches';
    /** @type {Map<string, object>} */
    this.batches = new Map();
    /** @type {Map<THREE.Object3D, Array<{mesh: THREE.Mesh, batch: object, slot: number}>>} */
    this.records = new Map();
    this.dirty = new Set();
  }

  markDirty(tileRoot) {
    if (tileRoot) this.dirty.add(tileRoot);
  }

  /** Drop every batch (call after the source group was cleared for a new sector). */
  reset() {
    for (const batch of this.batches.values()) {
      this.root.remove(batch.mesh);
      batch.mesh.dispose();
      batch.geometry.dispose();
      const mats = Array.isArray(batch.material) ? batch.material : [batch.material];
      mats.forEach((m) => m.dispose());
    }
    this.batches.clear();
    this.records.clear();
    this.dirty.clear();
  }

  sync() {
    this.root.visible = this.source.visible;

    for (const [tileRoot, entries] of this.records) {
      if (tileRoot.parent !== this.source) {
        this.release(entries);
        this.records.delete(tileRoot);
        this.dirty.delete(tileRoot);
      }
    }

    for (const child of this.source.children) {
      const current = this.records.get(child);
      if (current && current.revision !== (child.userData.batchRevision || 0)) {
        this.release(current);
        this.records.delete(child);
      }
      if (child.userData.batchTile && !this.records.has(child)) {
        this.register(child);
      }
    }

    if (this.dirty.size > 0) {
      for (const tileRoot of this.dirty) {
        const entries = this.records.get(tileRoot);
        if (entries) this.write(tileRoot, entries);
      }
      this.dirty.clear();
    }

    for (const batch of this.batches.values()) {
      if (!batch.needsUpload) continue;
      batch.needsUpload = false;
      batch.mesh.count = batch.used;
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.mesh.instanceColor.needsUpdate = true;
    }
  }

  register(tileRoot) {
    tileRoot.updateMatrixWorld = skipMatrixWorldUpdate;
    const entries = [];
    entries.revision = tileRoot.userData.batchRevision || 0;
    tileRoot.traverse((node) => {
      if (!node.isMesh || node.isInstancedMesh) return;
      const batch = this.getBatch(node);
      const entry = { mesh: node, batch, slot: this.allocSlot(batch) };
      entries.push(entry);
      batch.entries[entry.slot] = entry;
      node.layers.set(HIDDEN_LAYER);
    });
    this.records.set(tileRoot, entries);
    this.write(tileRoot, entries);
  }

  release(entries) {
    for (const entry of entries) {
      const { batch, slot } = entry;
      const last = --batch.used;
      if (slot !== last) {
        batch.mesh.instanceMatrix.array.copyWithin(slot * 16, last * 16, (last + 1) * 16);
        batch.mesh.instanceColor.array.copyWithin(slot * 3, last * 3, (last + 1) * 3);
        const moved = batch.entries[last];
        moved.slot = slot;
        batch.entries[slot] = moved;
      }
      batch.entries.pop();
      batch.needsUpload = true;
    }
  }

  write(tileRoot, entries) {
    THREE.Object3D.prototype.updateMatrixWorld.call(tileRoot, true);
    for (const { mesh, batch, slot } of entries) {
      const visible = isEffectivelyVisible(mesh, tileRoot);
      batch.mesh.setMatrixAt(slot, visible ? mesh.matrixWorld : ZERO_MATRIX);
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      batch.mesh.setColorAt(slot, mat.color || WHITE);
      batch.needsUpload = true;
    }
  }

  getBatch(mesh) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const key = [
      geometryKey(mesh.geometry),
      mats.map(materialKey).join(','),
      mesh.castShadow ? 'c' : '-',
      mesh.receiveShadow ? 'r' : '-',
    ].join('|');
    let batch = this.batches.get(key);
    if (batch) return batch;

    const material = Array.isArray(mesh.material)
      ? mesh.material.map(cloneForBatch)
      : cloneForBatch(mesh.material);
    batch = {
      geometry: mesh.geometry.clone(),
      material,
      castShadow: mesh.castShadow,
      receiveShadow: mesh.receiveShadow,
      renderOrder: mesh.renderOrder,
      mesh: null,
      capacity: 0,
      used: 0,
      entries: [],
      needsUpload: true,
    };
    this.createInstancedMesh(batch, MIN_CAPACITY);
    this.batches.set(key, batch);
    return batch;
  }

  createInstancedMesh(batch, capacity) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 3).fill(1),
      3
    );
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = batch.castShadow;
    mesh.receiveShadow = batch.receiveShadow;
    mesh.renderOrder = batch.renderOrder;
    mesh.frustumCulled = false;
    mesh.count = batch.used;

    const old = batch.mesh;
    if (old) {
      mesh.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, batch.capacity * 16));
      mesh.instanceColor.array.set(old.instanceColor.array.subarray(0, batch.capacity * 3));
      this.root.remove(old);
      old.dispose();
    }
    batch.mesh = mesh;
    batch.capacity = capacity;
    batch.needsUpload = true;
    this.root.add(mesh);
  }

  allocSlot(batch) {
    if (batch.used >= batch.capacity) {
      this.createInstancedMesh(batch, Math.max(MIN_CAPACITY, batch.capacity * 2));
    }
    return batch.used++;
  }
}
