/** Web Worker entry for off-thread procedural texture synthesis. */

import { GENERATED_TEXTURES, TextureGenerator, serializeGenerated } from './texture-gen.js';

self.document = { createElement: () => new OffscreenCanvas(1, 1) };

self.onmessage = async () => {
  const generator = new TextureGenerator();
  const state = { ids: new Map(), bitmaps: new Map(), transfer: [] };
  const results = {};
  for (const name of GENERATED_TEXTURES) {
    try {
      results[name] = await serializeGenerated(generator[name](), state);
    } catch (err) {
      results[name] = { __error: String(err?.message || err) };
    }
  }
  self.postMessage({ results }, state.transfer);
};
