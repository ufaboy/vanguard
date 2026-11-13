/** Standalone 3D Codex studio entry point (outside public/, excluded from production deploy). */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ModelFactory } from '../public/src/game/models.js';
import { FxSystem } from '../public/src/game/effects/index.js';
import { autoDisposeOwned, disposeOwned } from '../public/src/game/dispose.js';
import { CODEX_ITEMS } from './catalog.js';
import { CodexStage } from './stage.js';
import { renderCodex } from './ui.js';

const mount = document.getElementById('canvas-mount');
const codexModal = document.getElementById('codex-modal');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
mount.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f17);

const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
scene.environment = envRT.texture;
pmrem.dispose();

const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.85);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfff7ed, 2.1);
dirLight.position.set(12, 22, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 60;
const d = 10;
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
scene.add(dirLight);

const explosionLight = new THREE.PointLight(0xff8c24, 0, 14, 1.5);
scene.add(explosionLight);

const frustumSize = 10.2;
const aspect = window.innerWidth / Math.max(1, window.innerHeight);
const camera = new THREE.OrthographicCamera(
  (-frustumSize * aspect) / 2,
  (frustumSize * aspect) / 2,
  frustumSize / 2,
  -frustumSize / 2,
  0.1,
  120
);
camera.position.set(10, 11, 10);
camera.lookAt(0, 0.45, 0);

const modelFactory = new ModelFactory(false);
const fx = new FxSystem({ lowQuality: false, light: explosionLight });
const codexGroup = new THREE.Group();
const codexStageGroup = new THREE.Group();
const codexFxGroup = new THREE.Group();
autoDisposeOwned(codexStageGroup);
autoDisposeOwned(codexFxGroup);
scene.add(codexGroup);

// Minimal host adapter matching the contract expected by CodexStage.
const host = {
  modelFactory,
  mapGroup: { visible: false },
  entityGroup: { visible: false },
  fxGroup: { visible: false },
  fx: { root: { visible: false } },
  codexGroup,
  codexStageGroup,
  codexFxGroup,
  codexFx: fx,
  _codexFx: fx,
  codexOpen: true,
  codexItem: null,
  codexTurntableAngle: 0.55,
  codexAutoRotate: true,
  codexDragging: false,
  codexDragPrevX: 0,
  codexDemoTimer: 0,
  codexRecoil: 0,
  codexNextBarrel: 0,
  codexBarrelRecoils: [0, 0],
  codexFlashTimer: 0,
  upgrades: { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 },
  codexPreviewUpgrades: { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1, aps: true, missile: true },
  frustumSize,
  clock: { getElapsed: () => elapsed },
  clearGroup(group) {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      disposeOwned(child);
    }
  },
  handleResize() {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    const a = w / h;
    camera.left = (-frustumSize * a) / 2;
    camera.right = (frustumSize * a) / 2;
    camera.top = frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  },
  syncAudioPauseState() {},
  cycleCameraPreset() {},
};
codexGroup.add(fx.root);

const stage = new CodexStage(host);
stage.setup();

const params = new URLSearchParams(window.location.search);
const initialItemId = params.get('item');
const initialItem = CODEX_ITEMS.find((i) => i.id === initialItemId) || CODEX_ITEMS[0];

const state = {
  codexCategory: initialItem.category,
  codexSelectedId: initialItem.id,
  codexAutoRotate: true,
  codexPreviewUpgrades: { ...host.codexPreviewUpgrades },
};

function getSelectedItem() {
  return (
    CODEX_ITEMS.find((i) => i.id === state.codexSelectedId) ||
    CODEX_ITEMS.find((i) => i.category === state.codexCategory) ||
    CODEX_ITEMS[0]
  );
}

function renderUi() {
  codexModal.innerHTML = renderCodex(state, getSelectedItem());
}

stage.setMode(true, getSelectedItem(), state.codexPreviewUpgrades);
renderUi();

window.addEventListener('resize', () => host.handleResize());

codexModal.addEventListener('pointerdown', (e) => {
  if (e.target.closest('aside, .codex-header, .codex-footer, button')) return;
  host.codexDragging = true;
  host.codexDragPrevX = e.clientX;
});

window.addEventListener('pointermove', (e) => {
  if (!host.codexDragging) return;
  const dx = e.clientX - host.codexDragPrevX;
  host.codexDragPrevX = e.clientX;
  host.codexTurntableAngle += dx * 0.012;
});

window.addEventListener('pointerup', () => {
  host.codexDragging = false;
});

codexModal.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'select-codex-category') {
    const cat = btn.dataset.category;
    state.codexCategory = cat;
    const first = CODEX_ITEMS.find((i) => i.category === cat);
    if (first) {
      state.codexSelectedId = first.id;
      stage.loadShowcaseItem(first);
    }
    renderUi();
  } else if (action === 'select-codex-item') {
    const item = CODEX_ITEMS.find((i) => i.id === btn.dataset.itemId);
    if (item) {
      state.codexCategory = item.category;
      state.codexSelectedId = item.id;
      stage.loadShowcaseItem(item);
      renderUi();
    }
  } else if (action === 'codex-set-upgrade') {
    const track = btn.dataset.track;
    const rawVal = btn.dataset.level;
    const val = rawVal === 'true' ? true : rawVal === 'false' ? false : Number(rawVal);
    state.codexPreviewUpgrades = { ...state.codexPreviewUpgrades, [track]: val };
    stage.updatePreviewUpgrades(state.codexPreviewUpgrades);
    renderUi();
  } else if (action === 'codex-preset-stock') {
    state.codexPreviewUpgrades = { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1, aps: false, missile: false };
    stage.updatePreviewUpgrades(state.codexPreviewUpgrades);
    renderUi();
  } else if (action === 'codex-preset-max') {
    state.codexPreviewUpgrades = { cannon: 5, chassis: 5, frame: 5, engine: 5, armor: 5, aps: true, missile: true };
    stage.updatePreviewUpgrades(state.codexPreviewUpgrades);
    renderUi();
  } else if (action === 'codex-toggle-rotate') {
    state.codexAutoRotate = !state.codexAutoRotate;
    host.codexAutoRotate = state.codexAutoRotate;
    renderUi();
  } else if (action === 'codex-trigger-demo') {
    stage.triggerDemo();
  }
});

let lastTime = performance.now();
let elapsed = 0;

function tick(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  elapsed += dt;
  stage.update(dt, elapsed);
  fx.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

