import * as THREE from 'three';
import { TankGameEngine } from '/src/game/engine.js';
import { ModelFactory } from '/src/game/models.js';
import { createWaterSurface } from '/src/game/terrains/water.js';
import { createIceSurface } from '/src/game/terrains/ice.js';
import { SECTORS } from '/src/game/levels.js';
import { TileType } from '/src/game/types.js';
import { disposeOwned } from '/src/game/dispose.js';

const frozen = new URLSearchParams(location.search).get('surface') === 'ice';
const surfaceType = frozen ? TileType.ICE : TileType.WATER;
const surfaceName = frozen ? 'ContinuousIce' : 'ContinuousWater';
const countKey = frozen ? 'iceCells' : 'waterCells';
const createSurface = frozen ? createIceSurface : createWaterSurface;
const errors = [];
window.addEventListener('error', e => errors.push(e.message));
window.addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
try {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(1280, 720);
  document.querySelector('#stage').append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#18242a');
  scene.add(new THREE.HemisphereLight(0xc8e6f2, 0x5d5744, 2.4));
  const sun = new THREE.DirectionalLight(0xffe5c0, 3);
  sun.position.set(-3, 10, 4); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(40, 1280 / 720, 0.1, 100);
  camera.position.set(14, 20, 20); camera.lookAt(0, 0, 0);
  ModelFactory.prototype.loadPlayerGlbModel = () => {};
  const factory = new ModelFactory(renderer, true);
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const software = /swiftshader|llvmpipe/i.test(gl.getParameter(info?.UNMASKED_RENDERER_WEBGL || gl.RENDERER));
  factory.isSoftwareGl = software;
  const grid = [
    '000000000000', '001110000000', '011111000110', '001111001110',
    '000110001100', '000111111000', '000011100000', '000001100000',
    '011001110000', '011000110000', '000000011100', '000000000000',
  ].map(row => [...row].map(Number));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ color: '#77715a', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const water = frozen ? factory.createIceBlock(grid) : factory.createWaterBlock(grid);
  scene.add(water);
  const checks = [];
  for (const lowQuality of [false, true]) {
    for (const layout of [[[0]], [[1]], [[1, 1]], [[1, 0], [0, 1]], grid]) {
      const root = createSurface(layout, 1, 2, frozen ? factory.iceMat : factory.waterMat, { lowQuality });
      root.traverse(node => {
        if (!node.isMesh) return;
        const positions = node.geometry.attributes.position.array;
        const normals = node.geometry.attributes.normal.array;
        if (![...positions].every(Number.isFinite)) throw Error('Non-finite surface geometry');
        for (let i = 1; i < normals.length; i += 3) if (normals[i] < (node === root.children[0] ? 0.99 : 0.8)) throw Error('Surface faces down');
      });
      checks.push({ lowQuality, rows: layout.length, meshes: root.children.length });
      disposeOwned(root);
    }
  }
  factory.updateAnimatedTextures?.(0.5);
  renderer.render(scene, camera);
  await fetch('/__screenshot', { method: 'POST', body: JSON.stringify({ image: renderer.domElement.toDataURL() }) });
  const renderStats = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  if (!software) {
    TankGameEngine.prototype.startLoop = () => {};
    ModelFactory.prototype.ensureEnemyModels = () => {};
    const stage = document.createElement('div');
    stage.style.cssText = 'width:640px;height:480px'; document.body.append(stage);
    const engine = new TankGameEngine(stage, () => {}, { quality: 'low' });
    const sectors = [];
    const wetSectors = SECTORS.map((sector, index) => ({ sector, index }))
      .filter(({ sector }) => sector.grid.some(row => row.includes(surfaceType))).map(({ index }) => index);
    if (!wetSectors.length) throw Error('No surface maps found');
    for (const index of [0, wetSectors[0], wetSectors[Math.floor(wetSectors.length / 2)], wetSectors.at(-1), wetSectors[0]]) {
      engine.loadSector(index, false);
      engine.tileBatcher.sync();
      engine.renderer.render(engine.scene, engine.camera);
      const surface = engine.mapGroup.children.find(child => child.name === surfaceName);
      if (!surface) throw Error('Missing sector surface');
      const expected = engine.grid.flat().filter(cell => cell.type === surfaceType).length;
      if ((surface.userData[countKey] || 0) !== expected) throw Error('Surface cell count mismatch');
      sectors.push({ index, cells: surface.userData[countKey] || 0, meshes: surface.children.length });
    }
    await fetch('/__results', { method: 'POST', body: JSON.stringify({ errors, checks, sectors, ...renderStats }) });
  } else {
    await fetch('/__results', { method: 'POST', body: JSON.stringify({ errors, checks, software, ...renderStats }) });
  }
} catch (error) {
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ error: error.stack, errors }) });
}
