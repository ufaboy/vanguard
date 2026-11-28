/** Off-screen shader compilation and texture upload for objects that first appear mid-fight. */

const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap'];

/**
 * Compiles every material of `object` against the live scene lighting and uploads its
 * textures, so its first on-screen frame needs neither. The object is never added to the
 * scene. Its materials must stay alive afterwards (three.js frees a program once no
 * material uses it), so callers keep or share them instead of disposing them right away.
 * Resolves (never rejects) when done; a no-op on software WebGL or a disposed engine.
 */
export function warmupObject(engine, object) {
  if (!object || !engine?.renderer || engine.isSoftwareGl || engine.isDisposed) {
    return Promise.resolve();
  }
  return engine.renderer
    .compileAsync(object, engine.camera, engine.scene)
    .then(() => {
      if (engine.isDisposed) return;
      const textures = new Set();
      object.traverse((node) => {
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        for (const mat of mats) {
          if (!mat) continue;
          for (const slot of TEXTURE_SLOTS) {
            if (mat[slot]?.isTexture) textures.add(mat[slot]);
          }
        }
      });
      textures.forEach((tex) => engine.renderer.initTexture(tex));
    })
    .catch(() => {});
}
