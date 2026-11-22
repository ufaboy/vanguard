/** Shared GLTFLoader configured with Draco geometry and KTX2/Basis Universal texture decoders. */

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const PUBLIC_ROOT_URL = new URL('../../../', import.meta.url).href;

export function resolvePublicUrl(relPath) {
  return new URL(relPath, PUBLIC_ROOT_URL).href;
}

let sharedGltfLoader = null;
let sharedKtx2Loader = null;
let ktx2Detected = false;

export function getSharedGltfLoader(renderer = null) {
  if (!sharedGltfLoader) {
    const draco = new DRACOLoader();
    draco.setDecoderPath(resolvePublicUrl('./vendor/three/examples/jsm/libs/draco/gltf/'));
    sharedKtx2Loader = new KTX2Loader();
    sharedKtx2Loader.setTranscoderPath(resolvePublicUrl('./vendor/three/examples/jsm/libs/basis/'));
    sharedGltfLoader = new GLTFLoader();
    sharedGltfLoader.setDRACOLoader(draco);
    sharedGltfLoader.setKTX2Loader(sharedKtx2Loader);
  }
  if (renderer && sharedKtx2Loader && !ktx2Detected) {
    sharedKtx2Loader.detectSupport(renderer);
    ktx2Detected = true;
  }
  return sharedGltfLoader;
}
