/** Ownership-based GPU resource cleanup. */

function forEachMaterial(node, fn) {
  if (!node.material) return;
  if (Array.isArray(node.material)) node.material.forEach(fn);
  else fn(node.material);
}

/** Tags geometries and/or materials in `root`'s subtree as owned by it. */
export function markOwned(root, { geometries = true, materials = true } = {}) {
  root.traverse((node) => {
    if (geometries && node.geometry && !node.isSprite) node.geometry.userData.owned = true;
    if (materials) forEachMaterial(node, (m) => (m.userData.owned = true));
  });
  return root;
}

/** Marks a single material as owned (e.g. a per-rig clone of a shared material). */
export function markMaterialOwned(material) {
  if (material) material.userData.owned = true;
  return material;
}

/** Disposes every owned geometry and material in `root`'s subtree (textures are left alone). */
export function disposeOwned(root) {
  root.traverse((node) => {
    const geo = node.geometry;
    if (geo?.userData.owned) {
      geo.userData.owned = false;
      geo.dispose();
    }
    forEachMaterial(node, (m) => {
      if (!m.userData.owned) return;
      m.userData.owned = false;
      m.dispose();
    });
  });
}

/** Releases owned resources of any child removed from `group` (including `group.clear()`). */
export function autoDisposeOwned(group) {
  group.addEventListener('childremoved', (event) => disposeOwned(event.child));
}
