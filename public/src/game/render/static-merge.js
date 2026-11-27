/**
 * Collapses a static procedural group into one mesh per material.
 *
 * Procedural props built from many small primitives (bridge balusters, kerbs, piers) cost
 * one draw call per primitive, and twice when they cast shadows: the shadow camera covers
 * the whole arena, so frustum culling never trims that pass. Merging bakes every mesh's
 * transform relative to `group` into a shared buffer per material + shadow flags.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MERGED_ATTRIBUTES = ['position', 'normal', 'uv'];

/**
 * Replaces the plain meshes of `group` with merged meshes grouped by material and shadow
 * flags. The merged geometries are new and marked owned, so disposeOwned() frees them. Pass
 * `disposeSources` only when the source geometries were created for this group alone;
 * leave it off for geometries from a shared cache. Meshes with multi-materials,
 * instancing, mirrored transforms or extra vertex attributes are left untouched.
 */
export function mergeStaticMeshes(group, { disposeSources = false } = {}) {
  group.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const relative = new THREE.Matrix4();
  const buckets = new Map();
  const merged = [];

  group.traverse((node) => {
    if (!node.isMesh || node.isInstancedMesh || node.isSkinnedMesh || Array.isArray(node.material)) return;
    const geo = node.geometry;
    const names = Object.keys(geo.attributes);
    if (names.length !== MERGED_ATTRIBUTES.length || !MERGED_ATTRIBUTES.every((n) => geo.attributes[n])) return;
    relative.multiplyMatrices(toLocal, node.matrixWorld);
    // Mirrored transforms would flip the triangle winding
    if (relative.determinant() <= 0) return;
    const key = `${node.material.uuid}|${node.castShadow ? 1 : 0}${node.receiveShadow ? 1 : 0}|${geo.index ? 'i' : 'n'}`;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = { material: node.material, castShadow: node.castShadow, receiveShadow: node.receiveShadow, nodes: [] }));
    bucket.nodes.push({ node, matrix: relative.clone() });
  });

  const sourceGeometries = new Set();
  for (const bucket of buckets.values()) {
    if (bucket.nodes.length < 2) continue;
    const parts = bucket.nodes.map(({ node, matrix }) => {
      sourceGeometries.add(node.geometry);
      return node.geometry.clone().applyMatrix4(matrix);
    });
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    if (!geometry) continue;
    // Owned by the group: disposeOwned() releases it with the group (see render/dispose.js)
    geometry.userData.owned = true;
    const mesh = new THREE.Mesh(geometry, bucket.material);
    mesh.castShadow = bucket.castShadow;
    mesh.receiveShadow = bucket.receiveShadow;
    for (const { node } of bucket.nodes) node.removeFromParent();
    merged.push(mesh);
  }
  if (disposeSources) {
    // A source geometry may still back a mesh that was not merged (e.g. its bucket had one mesh)
    const stillUsed = new Set();
    group.traverse((node) => node.geometry && stillUsed.add(node.geometry));
    for (const geo of sourceGeometries) if (!stillUsed.has(geo)) geo.dispose();
  }
  for (const mesh of merged) group.add(mesh);
  return group;
}
