import * as THREE from 'three';
import { createUrbanGroundTexture, paintDecoration } from '/src/game/terrains/urban-ground.js';
import { SECTORS } from '/src/game/levels.js';
import { TileType } from '/src/game/types.js';
import { createSandCanvas } from '/src/game/terrains/sand.js';

const errors = [];
window.addEventListener('error', event => errors.push(event.message));
try {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(1280, 720);
  document.querySelector('#stage').append(renderer.domElement);
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const software = /swiftshader|llvmpipe/i.test(gl.getParameter(info?.UNMASKED_RENDERER_WEBGL || gl.RENDERER));
  const fixture = {
    grid: Array.from({ length: 16 }, () => Array(16).fill(TileType.EMPTY)),
    theme: 'desert',
    decoration: { version: 1, seed: 11112026, theme: 'desert',
      zones: [
        { id: 'dunes', bounds: [1, 1, 14, 10], surface: 'sand', density: 0, details: [] },
        { id: 'small-drift', bounds: [9, 12, 13, 14], surface: 'sand', density: 0, details: [] },
      ],
      paths: [{ id: 'trail', points: [[3, 6], [5, 10], [6, 14]], surface: 'sand', width: 2, marking: 'none' }],
      landmarks: [], exclusions: [],
    },
  };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#20272b');
  scene.add(new THREE.HemisphereLight(0xfff2de, 0x655c43, 2.2));
  const sun = new THREE.DirectionalLight(0xffe9ce, 1.5);
  sun.position.set(-8, 14, 6); scene.add(sun);
  const texture = createUrbanGroundTexture(fixture, { lowQuality: software });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const camera = new THREE.PerspectiveCamera(40, 1280 / 720, 0.1, 100);
  camera.position.set(13, 22, 21); camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  await fetch('/__screenshot', { method: 'POST', body: JSON.stringify({ image: renderer.domElement.toDataURL() }) });
  const a = createSandCanvas(128, 16, 42).toDataURL();
  if (a !== createSandCanvas(128, 16, 42).toDataURL()) throw Error('Sand is not deterministic');
  if (a === createSandCanvas(128, 16, 43).toDataURL()) throw Error('Sand seed is ignored');
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  fixture.decoration.exclusions = [{ bounds: [4, 4, 4, 4] }];
  const ctx = canvas.getContext('2d');
  paintDecoration(ctx, fixture, {}, 512);
  const protectedPixel = [...ctx.getImageData(144, 144, 1, 1).data];
  const zones = fixture.decoration.zones, paths = fixture.decoration.paths;
  fixture.decoration.zones = []; fixture.decoration.paths = [];
  paintDecoration(ctx, fixture, {}, 512);
  if (String(protectedPixel) !== String([...ctx.getImageData(144, 144, 1, 1).data])) throw Error('Sand covers an excluded cell');
  fixture.decoration.zones = zones; fixture.decoration.paths = paths;
  const sectors = [];
  for (const sector of SECTORS.filter(s => s.decoration?.zones.some(z => z.surface === 'sand'))) {
    const tex = createUrbanGroundTexture(sector, { lowQuality: software });
    ground.material.map = tex;
    renderer.render(scene, camera);
    sectors.push({ name: sector.name, width: tex.image.width });
    tex.dispose();
  }
  if (!sectors.length) throw Error('No sand sectors checked');
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ errors, software, deterministic: true, exclusions: true, sectors }) });
} catch (error) {
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ error: error.stack, errors }) });
}
