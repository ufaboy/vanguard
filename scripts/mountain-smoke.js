import * as THREE from 'three';
import { createMountainPerimeter } from '/src/game/terrains/mountains.js';
import { disposeOwned } from '/src/game/dispose.js';

try {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(1280, 720);
  document.querySelector('#stage').append(renderer.domElement);
  const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
  const software = /swiftshader|llvmpipe/i.test(gl.getParameter(info?.UNMASKED_RENDERER_WEBGL || gl.RENDERER));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#253139');
  scene.add(new THREE.HemisphereLight(0xdce9f3, 0x6c6050, 2.1));
  const sun = new THREE.DirectionalLight(0xffe5c3, 2.5);
  sun.position.set(-25, 40, -15); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(42, 1280 / 720, 0.1, 400);
  camera.position.set(102, 115, 117); camera.lookAt(0, 0, 0);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(72, 72), new THREE.MeshStandardMaterial({ color: '#686952', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const grid = new THREE.GridHelper(72, 36, 0x7b7b63, 0x73745b);
  grid.position.y = 0.01; scene.add(grid);
  const checks = [];
  for (const lowQuality of [false, true]) {
    const group = createMountainPerimeter(36, { lowQuality });
    const ridge = group.getObjectByName('WeatheredRidges');
    const p = ridge.geometry.attributes.position;
    for (const index of ridge.geometry.index.array) {
      if (Math.max(Math.abs(p.getX(index)), Math.abs(p.getZ(index))) < 39 - 0.001) throw Error('Ridge enters arena margin');
      if (!Number.isFinite(p.getY(index))) throw Error('Invalid mountain height');
    }
    let disposed = 0;
    group.traverse(node => { if (node.geometry) node.geometry.addEventListener('dispose', () => disposed++); });
    scene.add(group);
    renderer.render(scene, camera);
    checks.push({ lowQuality, triangles: ridge.geometry.index.count / 3, calls: renderer.info.render.calls });
    if (lowQuality === software) {
      await fetch('/__screenshot', { method: 'POST', body: JSON.stringify({ image: renderer.domElement.toDataURL() }) });
    }
    scene.remove(group); disposeOwned(group);
    if (disposed !== 3) throw Error('Perimeter geometry leak');
  }
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ software, clearance: true, disposal: true, checks }) });
} catch (error) {
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ error: error.stack }) });
}
