// Offline key art: the existing Player asset, rendered once for a zero-WebGL menu.
import * as THREE from 'three';
import { TankGameEngine } from '/src/game/engine.js';
const report = data => fetch('/__results', { method: 'POST', body: JSON.stringify(data) });
try {
  TankGameEngine.prototype.startLoop = () => {};
  const engine = new TankGameEngine(document.querySelector('#stage'), () => {}, { quality: 'high' });
  const factory = engine.modelFactory;
  for (let i = 0; i < 300 && !factory.playerGlbParts; i++) await new Promise(resolve => setTimeout(resolve, 100));
  if (!factory.playerGlbParts) throw Error('Player GLB did not load');
  const renderer = engine.renderer;
  renderer.setPixelRatio(1); renderer.setSize(1600, 1100);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#18232a');
  scene.fog = new THREE.FogExp2('#263238', 0.065); scene.environment = engine.scene.environment;
  const rig = factory.createPlayerTank();
  factory.updatePlayerTankVisuals(rig, { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 });
  rig.root.rotation.y = -0.25; scene.add(rig.root);
  const box = (size, pos, color, rotation = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
    mesh.position.set(...pos); mesh.rotation.y = rotation; mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); return mesh;
  };
  box([80, 0.15, 80], [0, -0.12, 0], '#343b3d');
  let seed = 78;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 180; i++) {
    const x = (random() - 0.5) * 20, z = (random() - 0.5) * 22;
    if (Math.abs(x) < 1.8 && Math.abs(z) < 2.5) continue;
    const h = 0.05 + random() * 0.22;
    box([0.1 + random() * 0.45, h, 0.15 + random() * 0.4], [x, h / 2, z], i % 3 ? '#53504a' : '#735342', random() * 6);
  }
  for (const x of [-7, 7]) for (let i = 0; i < 7; i++) {
    const z = -4 - i * 3, h = 2 + random() * 6;
    box([3, h, 2.6], [x, h / 2, z], '#333b3f');
    for (let y = 0.9; y < h - 0.4; y += 1.1) for (const offset of [-0.7, 0.7]) box([0.45, 0.6, 0.02], [x + offset, y, z + 1.31], '#141d22');
  }
  const hemi = new THREE.HemisphereLight('#bed4db', '#4e3b2b', 0.8); scene.add(hemi);
  const key = new THREE.DirectionalLight('#ffe6bc', 3); key.position.set(-3, 7, 5); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); scene.add(key);
  const rim = new THREE.DirectionalLight('#ff802e', 5); rim.position.set(3, 2, -5); scene.add(rim);
  const glow = new THREE.PointLight('#ff6a19', 70, 20, 2); glow.position.set(2, 1, -5); scene.add(glow);
  const camera = new THREE.PerspectiveCamera(35, 1600 / 1100, 0.1, 100);
  camera.position.set(2.7, 1.65, 3.9); camera.lookAt(0, 0.5, 0);
  renderer.render(scene, camera);
  await fetch('/__screenshot', { method: 'POST', body: JSON.stringify({ image: renderer.domElement.toDataURL('image/png') }) });
  await report({ playerAssetLoaded: true, width: 1600, height: 1100 });
} catch (error) { await report({ error: error.stack }); }

