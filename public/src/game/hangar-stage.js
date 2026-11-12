import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeOwned } from './dispose.js';

// A separate workshop scene keeps inspection and refitting out of battlefield state.
export class HangarStage {
  constructor(factory, environment, lowQuality = false) {
    this.factory = factory;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#151d21');
    this.scene.environment = environment;
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 70);
    this.angle = 0.67;
    this.targetAngle = this.angle;
    this.resources = new Set();
    this.materials = {};
    const material = (name, color, roughness = 0.8, metalness = 0) => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      this.materials[name] = mat; this.resources.add(mat); return mat;
    };
    material('wall', '#293436'); material('steel', '#3c494c', 0.45, 0.7);
    material('dark', '#111b1f'); material('yellow', '#c8993e', 0.7, 0.2);
    material('cabinet', '#40544f', 0.65, 0.3); material('red', '#a8482c', 0.6, 0.25);
    material('rubber', '#171b1b'); material('light', '#e7ddbc');
    this.materials.light.emissive.set('#e7ddbc'); this.materials.light.emissiveIntensity = 1.6;
    const floorTex = this.floorTexture(lowQuality ? 256 : 512);
    const floor = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 });
    this.resources.add(floor); this.materials.floor = floor;

    this.box('floor', [12, 0.18, 13], [0, -0.12, 0]);
    this.box('wall', [12, 4.8, 0.2], [0, 2.3, -4.8]);
    this.box('wall', [0.2, 4.8, 9.6], [-5.9, 2.3, 0]);
    for (let x = -5.6; x <= 5.6; x += 0.7) this.box('steel', [0.025, 3.4, 0.06], [x, 2.7, -4.66]);
    this.box('dark', [12, 0.8, 0.05], [0, 0.45, -4.66]);
    for (const x of [-4.1, 4.1]) {
      this.box('steel', [0.28, 4.8, 0.35], [x, 2.3, -2]);
      this.box('yellow', [0.3, 0.8, 0.37], [x, 0.4, -2]);
      this.box('steel', [0.35, 0.25, 7], [x, 4.25, -0.5]);
    }
    this.box('yellow', [8.6, 0.4, 0.36], [0, 4.15, -1.8]);
    this.box('dark', [0.65, 0.4, 0.65], [-1.8, 3.85, -1.8]);
    this.cylinder('steel', 0.025, 1.5, [-1.8, 2.95, -1.8]);
    this.cable([[-1.8, 2.2, -1.8], [-1.8, 1.98, -1.8], [-1.65, 1.96, -1.8], [-1.57, 2.1, -1.8]], 'yellow', 0.035);
    this.sign('20 T', [0.7, 4.15, -1.59], 1.05, 0.25, '#151c1e', '#d8ab4c');

    // Workshop benches, drawers and wall-mounted tool boards.
    for (const x of [-3, 2.7]) {
      this.box('cabinet', [2.1, 0.78, 0.85], [x, 0.4, -3.8]);
      this.box('steel', [2.25, 0.12, 1], [x, 0.86, -3.8]);
      for (let row = 0; row < 3; row++) {
        this.box('dark', [1.9, 0.012, 0.015], [x, 0.2 + row * 0.22, -3.36]);
        this.box('steel', [0.32, 0.035, 0.04], [x, 0.3 + row * 0.22, -3.32]);
      }
      this.box('dark', [2.1, 1.2, 0.08], [x, 1.8, -4.62]);
      for (let i = 0; i < 7; i++) {
        this.box('steel', [0.04, 0.25 + (i % 3) * 0.09, 0.04], [x - 0.8 + i * 0.26, 1.9, -4.54]);
        this.box('yellow', [0.065, 0.12, 0.055], [x - 0.8 + i * 0.26, 1.68, -4.53]);
      }
      this.box('red', [0.48, 0.27, 0.3], [x - 0.5, 1.05, -3.8]);
      this.box('steel', [0.32, 0.25, 0.22], [x + 0.65, 1.02, -3.5]);
    }
    this.sign('BAY 04', [0, 2.8, -4.64], 2.8, 0.8, '#d8dbce', '#263532');
    this.sign('HEAVY VEHICLE MAINTENANCE', [0, 2.1, -4.63], 3.0, 0.3, '#b1bcb5', '#263532');
    for (const x of [-4.8, -3.9]) {
      this.box('cabinet', [0.75, 1.9, 0.65], [x, 0.95, -3.9]);
      this.box('steel', [0.04, 0.25, 0.03], [x + 0.23, 1.04, -3.55]);
    }
    // Service rails, a recessed inspection channel, and hazard-stripe bay boundary.
    this.box('dark', [0.58, 0.025, 4.6], [0, -0.006, 0]);
    for (const x of [-0.7, 0.7]) this.box('steel', [0.43, 0.035, 4.7], [x, 0.005, 0]);
    for (const x of [-1.75, 1.75]) {
      this.box('yellow', [0.055, 0.012, 5.4], [x, 0.007, 0]);
      for (let i = 0; i < 18; i++) {
        const stripe = this.box('yellow', [0.24, 0.012, 0.1], [x + (x > 0 ? 0.18 : -0.18), 0.009, -2.5 + i * 0.3]);
        stripe.rotation.y = -0.6;
      }
    }
    for (const z of [-2.7, 2.7]) this.box('yellow', [3.55, 0.012, 0.055], [0, 0.007, z]);
    // Mobile tool trolley and hydraulic jack.
    this.box('red', [0.75, 0.75, 0.48], [-2.7, 0.5, 1.2]);
    this.box('steel', [0.83, 0.06, 0.56], [-2.7, 0.9, 1.2]);
    for (let row = 0; row < 4; row++) this.box('steel', [0.57, 0.025, 0.03], [-2.7, 0.35 + row * 0.13, 1.46]);
    for (const dx of [-0.26, 0.26]) for (const dz of [-0.16, 0.16]) {
      const wheel = this.cylinder('rubber', 0.09, 0.07, [-2.7 + dx, 0.13, 1.2 + dz]); wheel.rotation.z = Math.PI / 2;
    }
    this.box('yellow', [0.35, 0.16, 0.65], [2.6, 0.1, 1.7]);
    const jack = this.box('steel', [0.035, 0.95, 0.035], [2.6, 0.6, 1.95]); jack.rotation.x = 0.3;
    for (const x of [2.8, 3.2]) {
      this.cylinder('cabinet', 0.16, 1.15, [x, 0.65, -1.6]);
      this.cylinder('steel', 0.055, 0.18, [x, 1.32, -1.6]);
    }
    this.cable([[3, 0.08, -1.6], [2.35, 0.035, -0.9], [2.7, 0.03, 0.1], [2.15, 0.035, 0.7]], 'rubber', 0.022);
    for (let i = 0; i < 3; i++) {
      const wheel = this.cylinder('rubber', 0.34, 0.22, [3.6, 0.35 + i * 0.23, -3]);
      this.cylinder('steel', 0.15, 0.23, wheel.position.toArray());
    }
    for (const x of [-2.6, 2.6]) this.box('light', [0.12, 0.06, 3.2], [x, 4, 0.2]);
    this.scene.add(new THREE.HemisphereLight('#d6e7e9', '#6c6251', 0.7));
    const key = new THREE.DirectionalLight('#fff1d2', 2.2);
    key.position.set(2, 6, 4); key.castShadow = !lowQuality;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.1, far: 20 });
    key.shadow.bias = -0.001;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#a3cad8', 1.0); fill.position.set(-4, 3, -3); this.scene.add(fill);
    this.mergeStaticProps();
    this.rig = factory.createPlayerTank();
    // Presentation scale only; the battlefield rig and collision footprint stay unchanged.
    this.rig.root.scale.setScalar(1.3);
    this.rig.root.position.set(0, 0.035, 0);
    this.scene.add(this.rig.root);
  }

  box(mat, size, position) {
    const geo = new THREE.BoxGeometry(...size); this.resources.add(geo);
    const mesh = new THREE.Mesh(geo, this.materials[mat]); mesh.position.set(...position);
    mesh.castShadow = true; mesh.receiveShadow = true; this.scene.add(mesh); return mesh;
  }

  mergeStaticProps() {
    this.rearBackdrop = new THREE.Group();
    this.scene.add(this.rearBackdrop);
    const groups = new Map();
    for (const node of [...this.scene.children]) {
      if (!node.isMesh) continue;
      // Keep the rear wall and its workshop furniture in a separate cutaway batch.
      const rearBackdrop = node.position.z <= -3;
      if (rearBackdrop) this.rearBackdrop.add(node);
      node.updateMatrixWorld(true);
      const key = `${rearBackdrop}:${node.material.uuid}:${node.castShadow}:${node.receiveShadow}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(node);
    }
    for (const nodes of groups.values()) {
      if (nodes.length < 2) continue;
      const geometries = nodes.map(node => node.geometry.clone().applyMatrix4(node.matrixWorld));
      const geometry = mergeGeometries(geometries);
      geometries.forEach(item => item.dispose());
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, nodes[0].material);
      mesh.castShadow = nodes[0].castShadow; mesh.receiveShadow = nodes[0].receiveShadow;
      this.resources.add(geometry); nodes[0].parent.add(mesh);
      for (const node of nodes) {
        node.removeFromParent(); this.resources.delete(node.geometry); node.geometry.dispose();
      }
    }
  }

  cylinder(mat, radius, height, position) {
    const geo = new THREE.CylinderGeometry(radius, radius, height, 12); this.resources.add(geo);
    const mesh = new THREE.Mesh(geo, this.materials[mat]); mesh.position.set(...position);
    mesh.castShadow = true; mesh.receiveShadow = true; this.scene.add(mesh); return mesh;
  }

  cable(points, mat, radius) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const geo = new THREE.TubeGeometry(curve, 20, radius, 5, false); this.resources.add(geo);
    this.scene.add(new THREE.Mesh(geo, this.materials[mat]));
  }

  sign(text, position, width, height, color, background) {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = color; ctx.font = 'bold 100px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 132, 960);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; this.resources.add(texture);
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }); this.resources.add(mat);
    const geo = new THREE.PlaneGeometry(width, height); this.resources.add(geo);
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(...position); this.scene.add(mesh);
  }

  floorTexture(size) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#484e4c'; ctx.fillRect(0, 0, size, size);
    let seed = 481;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < size * 12; i++) {
      ctx.fillStyle = random() > 0.5 ? '#555b56' : '#3e4642';
      ctx.fillRect(random() * size, random() * size, 1, 1);
    }
    ctx.strokeStyle = '#424d48'; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo(i * size / 8, 0); ctx.lineTo(i * size / 8, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * size / 8); ctx.lineTo(size, i * size / 8); ctx.stroke();
    }
    for (let i = 0; i < 28; i++) {
      ctx.fillStyle = 'rgba(20,28,25,0.06)'; ctx.beginPath();
      ctx.ellipse(random() * size, random() * size, 4 + random() * 16, 2 + random() * 8, random() * 3, 0, Math.PI * 2); ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    this.resources.add(texture); return texture;
  }

  setView(view) { this.targetAngle = ({ front: 0.67, side: 1.48, rear: 2.8 })[view] ?? 0.67; }

  update(dt, upgrades, missileAmmo, apsAmmo, elapsed) {
    this.angle = THREE.MathUtils.damp(this.angle, this.targetAngle, 5, dt);
    this.factory.updatePlayerTankVisuals(this.rig, upgrades, false, missileAmmo, apsAmmo, 0, elapsed);
    this.rig.hull.rotation.y = 0; this.rig.turret.rotation.y = 0;
  }

  render(renderer, rect) {
    if (!rect || rect.width < 1 || rect.height < 1) return;
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    const radius = this.camera.aspect < 1 ? 7.2 : 5.7;
    this.camera.position.set(Math.sin(this.angle) * radius, 3.4, Math.cos(this.angle) * radius);
    // Cut away the rear assembly before the orbit enters the workshop furniture.
    this.rearBackdrop.visible = this.camera.position.z > -3;
    this.camera.lookAt(0, 0.35, -0.25);
    const size = renderer.getSize(new THREE.Vector2());
    renderer.setViewport(rect.left, size.y - rect.bottom, rect.width, rect.height);
    renderer.setScissor(rect.left, size.y - rect.bottom, rect.width, rect.height);
    renderer.setScissorTest(true);
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
  }

  dispose() {
    this.factory.pendingPlayerRigs = this.factory.pendingPlayerRigs.filter(rig => rig !== this.rig);
    disposeOwned(this.rig.root);
    this.scene.traverse(node => { if (node.isLight) node.dispose?.(); });
    for (const resource of this.resources) resource.dispose();
    this.resources.clear(); this.scene.clear();
  }
}
