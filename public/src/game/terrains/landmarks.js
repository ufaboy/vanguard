/**
 * Landmark catalog and 3D model loader (Paris monuments for Survival S-01
 * "Paris: Last Stand", Berlin monuments for campaign mission 02 "Brandenburg Gate",
 * Versailles palace and fountains for campaign mission 03 "Versailles", Brussels
 * monuments for campaign mission 04 "Brussels").
 *
 * Footprints: 1 cell = 2 world units, +X east, +Z south, model origin at the
 * footprint centre on the ground. Blocked cells become TileType.LANDMARK
 * (indestructible walls); the rest stay drivable.
 *
 * `LandmarkModels.create(kind)` returns a THREE.Group immediately (populated from the
 * kind's GLB pack in `public/models/landmarks/` when loaded, or a detailed procedural
 * representation that upgrades in-place once the GLB finishes loading).
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { autoDisposeOwned, disposeOwned, markOwned } from '../render/dispose.js';

const ALL = (cols, rows) => {
  const cells = [];
  for (let dr = 0; dr < rows; dr++) for (let dc = 0; dc < cols; dc++) cells.push([dr, dc]);
  return cells;
};

/** Blender GLB packs; each landmark kind names the pack that holds its template. */
const LANDMARK_PACKS = Object.freeze({
  paris: '../../../models/landmarks/paris_landmarks.glb',
  berlin: '../../../models/landmarks/berlin_landmarks.glb',
  versailles: '../../../models/landmarks/versailles_landmarks.glb',
  brussels: '../../../models/landmarks/brussels_landmarks.glb',
  rome: '../../../models/landmarks/rome_landmarks.glb',
});

/** Cells `cols` of every row in a `cols` x `rows` footprint. */
const COLUMNS = (cols, rows) => ALL(Math.max(...cols) + 1, rows).filter(([, dc]) => cols.includes(dc));

const LANDMARK_SPECS = Object.freeze({
  ELYSEE: Object.freeze({ cols: 4, rows: 2, blocked: ALL(4, 2), height: 4.5 }),
  ELYSEE_RUINED: Object.freeze({ cols: 4, rows: 2, blocked: [], height: 3.0 }),
  EIFFEL_TOWER: Object.freeze({ cols: 3, rows: 3, blocked: [[0, 0], [0, 2], [2, 0], [2, 2]], height: 13 }),
  ARC_DE_TRIOMPHE: Object.freeze({ cols: 3, rows: 2, blocked: [[0, 0], [1, 0], [0, 2], [1, 2]], height: 6 }),
  NOTRE_DAME: Object.freeze({ cols: 4, rows: 2, blocked: ALL(4, 2), height: 8 }),
  LOUVRE_PYRAMID: Object.freeze({ cols: 2, rows: 2, blocked: ALL(2, 2), height: 4 }),
  SACRE_COEUR: Object.freeze({ cols: 3, rows: 2, blocked: ALL(3, 2), height: 8 }),
  CONCORDE_OBELISK: Object.freeze({ cols: 1, rows: 1, blocked: [[0, 0]], height: 7 }),
  MINE_SIGN: Object.freeze({ cols: 1, rows: 1, blocked: [], height: 1.4 }),
  // Pavilions (cols 0, 6) and pylon walls (cols 2, 4) block; cols 1, 3, 5 are the three passages.
  BRANDENBURG_GATE: Object.freeze({ cols: 7, rows: 2, blocked: COLUMNS([0, 2, 4, 6], 2), height: 8.4, pack: 'berlin' }),
  VICTORY_COLUMN: Object.freeze({ cols: 2, rows: 2, blocked: ALL(2, 2), height: 11.6, pack: 'berlin' }),
  // Garden front faces north (-Z); the whole 16x3 footprint is an indestructible wall.
  VERSAILLES_PALACE: Object.freeze({ cols: 16, rows: 3, blocked: ALL(16, 3), height: 6.0, pack: 'versailles' }),
  LATONA_FOUNTAIN: Object.freeze({ cols: 2, rows: 2, blocked: ALL(2, 2), height: 2.5, pack: 'versailles' }),
  APOLLO_FOUNTAIN: Object.freeze({ cols: 2, rows: 2, blocked: ALL(2, 2), height: 1.6, pack: 'versailles' }),
  // Nine steel spheres on a central tube and three bipods; the whole 3x3 plaza footprint blocks.
  ATOMIUM: Object.freeze({ cols: 3, rows: 3, blocked: ALL(3, 3), height: 12.5, pack: 'brussels' }),
  // Colonnade wings (cols 0-1, 9-10) and arch piers (cols 2, 4, 6, 8) block; cols 3, 5, 7 are the three arches.
  CINQUANTENAIRE_ARCH: Object.freeze({ cols: 11, rows: 2, blocked: COLUMNS([0, 1, 2, 4, 6, 8, 9, 10], 2), height: 9.0, pack: 'brussels' }),
  // Gothic town hall, square front facing north, belfry spire in the middle; fully blocked.
  BRUSSELS_TOWN_HALL: Object.freeze({ cols: 6, rows: 2, blocked: ALL(6, 2), height: 12.0, pack: 'brussels' }),
  MANNEKEN_PIS: Object.freeze({ cols: 1, rows: 1, blocked: [[0, 0]], height: 1.8, pack: 'brussels' }),
  // The central two columns remain open through both axial gates and the arena.
  COLOSSEUM: Object.freeze({ cols: 10, rows: 8, blocked: [
    '..##..##..', '.###..###.', '###....###', '##......##',
    '##......##', '###....###', '.###..###.', '..##..##..',
  ].flatMap((line, row) => [...line].flatMap((cell, col) => cell === '#' ? [[row, col]] : [])), height: 8.7, pack: 'rome' }),
  ARCH_OF_CONSTANTINE: Object.freeze({ cols: 7, rows: 2, blocked: COLUMNS([0, 2, 4, 6], 2), height: 7.4, pack: 'rome' }),
  FORUM_COLUMNS: Object.freeze({ cols: 3, rows: 1, blocked: ALL(3, 1), height: 5.1, pack: 'rome' }),
});

const packOf = (kind) => LANDMARK_SPECS[kind]?.pack || 'paris';

/** Kinds that may be authored in a map's `landmarks3d` list. */
export const PLACEABLE_LANDMARKS = Object.freeze([
  'EIFFEL_TOWER',
  'ARC_DE_TRIOMPHE',
  'NOTRE_DAME',
  'LOUVRE_PYRAMID',
  'SACRE_COEUR',
  'CONCORDE_OBELISK',
  'BRANDENBURG_GATE',
  'VICTORY_COLUMN',
  'VERSAILLES_PALACE',
  'LATONA_FOUNTAIN',
  'APOLLO_FOUNTAIN',
  'ATOMIUM',
  'CINQUANTENAIRE_ARCH',
  'BRUSSELS_TOWN_HALL',
  'MANNEKEN_PIS',
  'COLOSSEUM',
  'ARCH_OF_CONSTANTINE',
  'FORUM_COLUMNS',
]);

/** Grid cells blocked by a `{ kind, row, col }` landmark entry. */
export function landmarkBlockedCells(entry) {
  const spec = LANDMARK_SPECS[entry?.kind];
  if (!spec) throw new Error(`Unknown landmark kind: ${entry?.kind}`);
  return spec.blocked.map(([dr, dc]) => ({ row: entry.row + dr, col: entry.col + dc }));
}

/** World-space centre of a landmark footprint whose top-left cell is (row, col). */
export function landmarkFootprintCenter(kind, row, col, gridToWorld) {
  const spec = LANDMARK_SPECS[kind];
  if (!spec) throw new Error(`Unknown landmark kind: ${kind}`);
  const topLeft = gridToWorld(row, col);
  const cell = 2.0;
  return {
    x: topLeft.x + ((spec.cols - 1) * cell) / 2,
    z: topLeft.z + ((spec.rows - 1) * cell) / 2,
  };
}

/**
 * World-space architectural masonry, travertine grain, and rain/ground weathering
 * shader finish applied to both Blender GLB and procedural Paris landmark materials.
 */
function applyLandmarkFinish(material) {
  if (!material || material.userData?.landmarkFinishApplied) return material;
  material.userData ||= {};
  material.userData.landmarkFinishApplied = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `
      #include <common>
      varying vec3 vLandmarkWorld;
      varying vec3 vLandmarkNormal;
    `
      )
      .replace(
        '#include <worldpos_vertex>',
        `
      #include <worldpos_vertex>
      vec4 lmWorldPos = modelMatrix * vec4(transformed, 1.0);
      vLandmarkWorld = lmWorldPos.xyz;
      vLandmarkNormal = normalize(mat3(modelMatrix) * objectNormal);
    `
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `
      #include <common>
      varying vec3 vLandmarkWorld;
      varying vec3 vLandmarkNormal;
      float lmHash(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float lmNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(lmHash(i), lmHash(i + vec3(1, 0, 0)), f.x),
              mix(lmHash(i + vec3(0, 1, 0)), lmHash(i + vec3(1, 1, 0)), f.x), f.y),
          mix(mix(lmHash(i + vec3(0, 0, 1)), lmHash(i + vec3(1, 0, 1)), f.x),
              mix(lmHash(i + vec3(0, 1, 1)), lmHash(i + vec3(1, 1, 1)), f.x), f.y),
          f.z
        );
      }
    `
      )
      .replace(
        '#include <map_fragment>',
        `
      #include <map_fragment>
      vec3 wp = vLandmarkWorld;
      vec3 wn = abs(normalize(vLandmarkNormal));
      // Triplanar horizontal coordinate along wall face
      float wallU = wn.x > wn.z ? wp.z : wp.x;
      float courseH = 0.34;
      float blockW = 0.68;
      float rowIdx = floor(wp.y / courseH);
      float rowFrac = fract(wp.y / courseH);
      float colIdx = floor((wallU + mod(rowIdx, 2.0) * 0.34) / blockW);
      float colFrac = fract((wallU + mod(rowIdx, 2.0) * 0.34) / blockW);

      // Identify stone/masonry vs glass/emissive/gold by colour saturation & channel balance
      float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      float maxC = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
      float minC = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
      float sat = (maxC - minC) / max(maxC, 0.001);
      bool isMasonry = sat < 0.36 && lum > 0.14 && lum < 0.92 && wn.y < 0.75;

      float fineGrain = lmNoise(wp * 6.5) * 0.5 + lmNoise(wp * 15.0) * 0.5;
      float weather = lmNoise(wp * vec3(0.9, 0.45, 0.9) + 11.7);

      if (isMasonry) {
        float mortarH = 1.0 - smoothstep(0.0, 0.08, min(rowFrac, 1.0 - rowFrac));
        float mortarV = 1.0 - smoothstep(0.0, 0.05, min(colFrac, 1.0 - colFrac));
        float mortar = max(mortarH, mortarV);
        float blockTone = (lmHash(vec3(colIdx, rowIdx, floor((wn.x > wn.z ? wp.x : wp.z) * 2.0))) - 0.5) * 0.11;
        diffuseColor.rgb *= (1.0 + blockTone + (fineGrain - 0.5) * 0.09);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.74, mortar * 0.65);
      } else {
        diffuseColor.rgb *= (0.95 + fineGrain * 0.10);
      }

      // Subtle rain-streak patina and ground-contact dampness
      float rainStreak = smoothstep(0.45, 0.85, weather) * 0.08 * (1.0 - wn.y);
      diffuseColor.rgb *= (1.0 - rainStreak);
      float groundDamp = (1.0 - smoothstep(0.04, 0.68, wp.y)) * (0.07 + weather * 0.12);
      diffuseColor.rgb *= (1.0 - groundDamp);
    `
      );
  };
  material.customProgramCacheKey = () => 'paris-landmark-finish-v1';
  material.needsUpdate = true;
  return material;
}

function makeProceduralLandmarkTex(drawFn) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawFn(ctx, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export class LandmarkModels {
  constructor() {
    this.templates = new Map();
    this.sharedMaterials = new Set();
    this.fallbackMats = null;
    this.fallbackTextures = [];
    this.liveGroups = new Set();
    this.packPromises = new Map();
    this.loadPromise = null;
    this.disposed = false;
  }

  /** Loads one Blender GLB pack of templates. Resolves to true when they are ready. */
  async loadPack(pack) {
    const glbUrl = new URL(LANDMARK_PACKS[pack], import.meta.url).href;
    const gltf = await new GLTFLoader().loadAsync(glbUrl);
    if (this.disposed) return false;
    gltf.scene.updateMatrixWorld(true);
    for (const child of gltf.scene.children) {
      const kind = child.name;
      if (!LANDMARK_SPECS[kind]) continue;
      const root = child.clone(true);
      root.position.set(0, 0, 0);
      root.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        if (node.material) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          for (const mat of mats) {
            if (mat.map) {
              mat.map.colorSpace = THREE.SRGBColorSpace;
              mat.map.anisotropy = 8;
            }
            if (mat.normalMap) mat.normalMap.anisotropy = 8;
            if (mat.roughnessMap) mat.roughnessMap.anisotropy = 8;
            if (mat.metalnessMap) mat.metalnessMap.anisotropy = 8;
            applyLandmarkFinish(mat);
            this.sharedMaterials.add(mat);
          }
        }
      });
      this.templates.set(kind, root);
    }
    for (const group of this.liveGroups) {
      const kind = group.userData?.landmarkKind;
      if (kind && this.templates.has(kind)) {
        this.populateFromTemplate(group, kind);
      }
    }
    return this.templates.size > 0;
  }

  /**
   * Idempotent lazy load of the GLB packs that hold `kinds`: maps with landmarks
   * call this, other maps (and other cities) never pay for those GLBs.
   */
  ensureLoaded(kinds = Object.keys(LANDMARK_SPECS)) {
    const packs = [...new Set(kinds.filter((kind) => LANDMARK_SPECS[kind]).map(packOf))];
    const promises = packs.map((pack) => {
      if (!this.packPromises.has(pack)) {
        this.packPromises.set(
          pack,
          this.loadPack(pack).catch((error) => {
            console.warn(`Landmark GLB pack "${pack}" unavailable; using procedural landmark meshes.`, error);
            return false;
          })
        );
      }
      return this.packPromises.get(pack);
    });
    this.loadPromise = Promise.all(promises).then((results) => results.some(Boolean));
    return this.loadPromise;
  }

  populateFromTemplate(group, kind) {
    const template = this.templates.get(kind);
    if (!template) return false;
    group.clear();
    const clone = template.clone(true);
    clone.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    group.add(clone);
    group.userData.landmarkKind = kind;
    group.userData.landmarkSource = 'blender';
    return true;
  }

  create(kind) {
    const spec = LANDMARK_SPECS[kind];
    if (!spec) throw new Error(`Unknown landmark kind: ${kind}`);
    const group = new THREE.Group();
    group.userData.landmarkKind = kind;
    if (packOf(kind) === 'rome') autoDisposeOwned(group);
    if (!this.populateFromTemplate(group, kind)) {
      this.populateFallback(group, kind);
      this.liveGroups.add(group);
    }
    return group;
  }

  /**
   * Procedural stone river bridge sized to its grid footprint. The span runs along
   * local +Z (`spanCells` long), the roadway is `widthCells` wide along X; rotate the
   * group by PI/2 for an east-west crossing. Origin is the footprint centre.
   */
  createBridge(spanCells, widthCells) {
    const cell = 2.0;
    const m = this.getMaterials();
    const group = new THREE.Group();
    group.userData.landmarkKind = 'BRIDGE';
    const add = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    const box = (w, h, d, mat, x, y, z) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);

    const width = widthCells * cell;
    const length = spanCells * cell + 0.5; // laps onto both banks
    const halfW = width / 2;
    const halfL = length / 2;
    const deckTop = 0.08;

    // Roadway slab with darker asphalt strip and a stone kerb band each side.
    box(width + 0.2, 0.42, length, m.darkStone, 0, deckTop - 0.21, 0);
    box(width - 0.7, 0.02, length, m.asphalt, 0, deckTop + 0.01, 0);
    const dashes = Math.max(2, Math.round(length / 0.9));
    for (let i = 0; i < dashes; i++) {
      const z = -halfL + (length * (i + 0.5)) / dashes;
      box(0.08, 0.01, 0.45, m.roadPaint, 0, deckTop + 0.025, z);
    }
    // Spandrel fascia: a thick cornice band under the parapets reads as the bridge body.
    for (const sx of [-1, 1]) {
      box(0.16, 0.16, length + 0.1, m.stone, sx * (halfW + 0.12), deckTop - 0.02, 0);
      box(0.1, 0.5, length - 0.2, m.darkStone, sx * (halfW + 0.08), deckTop - 0.36, 0);
    }

    // Balustrade parapets along both sides: plinth, balusters, coping rail.
    const parapetX = halfW - 0.13;
    const balusterGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.26, 6);
    for (const sx of [-1, 1]) {
      const px = sx * parapetX;
      box(0.24, 0.08, length - 0.3, m.stone, px, deckTop + 0.04, 0);
      box(0.28, 0.07, length - 0.3, m.whiteStone, px, deckTop + 0.39, 0);
      const count = Math.max(4, Math.round((length - 1.0) / 0.22));
      for (let i = 0; i < count; i++) {
        const z = -halfL + 0.5 + ((length - 1.0) * (i + 0.5)) / count;
        add(balusterGeo, m.whiteStone, px, deckTop + 0.21, z);
      }
      // Square piers at both ends and above each river pier, topped by lamps.
      const pierZs = [-halfL + 0.25, halfL - 0.25];
      for (let s = 1; s < spanCells; s++) pierZs.push(-spanCells + s * cell);
      for (const z of pierZs) {
        box(0.34, 0.5, 0.34, m.stone, px, deckTop + 0.25, z);
        box(0.4, 0.06, 0.4, m.whiteStone, px, deckTop + 0.53, z);
      }
      for (const z of [-halfL + 0.25, halfL - 0.25]) {
        add(new THREE.CylinderGeometry(0.035, 0.05, 0.75, 8), m.slate, px, deckTop + 0.93, z);
        add(new THREE.CylinderGeometry(0.11, 0.07, 0.16, 6), m.gold, px, deckTop + 1.36, z);
        add(new THREE.ConeGeometry(0.13, 0.12, 6), m.slate, px, deckTop + 1.5, z);
      }
    }

    // River piers with pointed cutwaters poking out upstream and downstream.
    const cutwater = new THREE.CylinderGeometry(0.42, 0.42, 0.7, 4);
    for (let s = 1; s < spanCells; s++) {
      const z = -spanCells + s * cell;
      box(width + 0.3, 0.7, 0.7, m.darkStone, 0, -0.35, z);
      for (const sx of [-1, 1]) {
        add(cutwater, m.darkStone, sx * (halfW + 0.15), -0.3, z).scale.set(1, 1, 0.83);
        box(0.5, 0.06, 0.5, m.stone, sx * (halfW + 0.15), 0.06, z).rotation.y = Math.PI / 4;
      }
    }
    // Abutments where the bridge meets each bank.
    for (const sz of [-1, 1]) {
      box(width + 0.5, 0.6, 0.45, m.stone, 0, -0.22, sz * (halfL - 0.05));
    }
    return group;
  }

  /** Swaps an existing landmark group (e.g. ELYSEE -> ELYSEE_RUINED when HQ falls). */
  setKind(group, kind) {
    if (!group) return;
    group.userData.landmarkKind = kind;
    if (!this.populateFromTemplate(group, kind)) {
      this.populateFallback(group, kind);
      this.liveGroups.add(group);
    }
  }

  getMaterials() {
    if (this.fallbackMats) return this.fallbackMats;
    const drawAshlar = (ctx, w, h, baseHex, mortarHex, courseH = 16, blockW = 32) => {
      ctx.fillStyle = baseHex;
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += courseH) {
        const row = Math.floor(y / courseH);
        const offset = (row % 2) * (blockW / 2);
        for (let x = -blockW; x < w; x += blockW) {
          const shade = (((row * 31 + Math.floor(x / blockW) * 17) % 11) - 5) * 3;
          ctx.fillStyle = shade >= 0 ? `rgba(255,250,235,${shade * 0.008})` : `rgba(20,16,12,${-shade * 0.008})`;
          ctx.fillRect(x + offset, y, blockW, courseH);
        }
        ctx.fillStyle = mortarHex;
        ctx.fillRect(0, y, w, 2);
        for (let x = offset; x < w; x += blockW) {
          ctx.fillRect(x, y, 2, courseH);
        }
      }
    };

    const regTex = (drawFn) => {
      const t = makeProceduralLandmarkTex(drawFn);
      if (t) this.fallbackTextures.push(t);
      return t;
    };

    const stoneTex = regTex((ctx, w, h) => drawAshlar(ctx, w, h, '#d2c3a4', '#9a8c72', 16, 32));
    const darkStoneTex = regTex((ctx, w, h) => drawAshlar(ctx, w, h, '#948870', '#635a49', 16, 24));
    const whiteStoneTex = regTex((ctx, w, h) => drawAshlar(ctx, w, h, '#ece8e0', '#b8b2a6', 16, 32));
    const slateTex = regTex((ctx, w, h) => {
      drawAshlar(ctx, w, h, '#334155', '#1e293b', 12, 16);
      ctx.fillStyle = '#64748b';
      for (let x = 0; x < w; x += 32) ctx.fillRect(x, 0, 2, h);
    });
    const ironTex = regTex((ctx, w, h) => {
      ctx.fillStyle = '#3d2c20';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#6e523d';
      ctx.lineWidth = 4;
      for (let y = 0; y < h; y += 32) {
        for (let x = 0; x < w; x += 32) {
          ctx.strokeRect(x + 1, y + 1, 30, 30);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 32, y + 32);
          ctx.moveTo(x + 32, y);
          ctx.lineTo(x, y + 32);
          ctx.stroke();
        }
      }
    });
    const glassTex = regTex((ctx, w, h) => {
      ctx.fillStyle = '#2da8c4';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 3;
      for (let i = -h; i < w + h; i += 24) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + h, h);
        ctx.moveTo(i, h);
        ctx.lineTo(i + h, 0);
        ctx.stroke();
      }
    });
    const graniteTex = regTex((ctx, w, h) => drawAshlar(ctx, w, h, '#c48372', '#945b4c', 16, 32));

    this.fallbackMats = {
      stone: applyLandmarkFinish(new THREE.MeshStandardMaterial({ color: 0xd4c6a8, map: stoneTex, roughness: 0.72, metalness: 0.06 })),
      darkStone: applyLandmarkFinish(new THREE.MeshStandardMaterial({ color: 0x968b74, map: darkStoneTex, roughness: 0.78, metalness: 0.08 })),
      whiteStone: applyLandmarkFinish(new THREE.MeshStandardMaterial({ color: 0xeeeae2, map: whiteStoneTex, roughness: 0.62, metalness: 0.06 })),
      slate: applyLandmarkFinish(new THREE.MeshStandardMaterial({ color: 0x3b495e, map: slateTex, roughness: 0.52, metalness: 0.30 })),
      iron: applyLandmarkFinish(new THREE.MeshStandardMaterial({ color: 0x694e3a, map: ironTex, roughness: 0.45, metalness: 0.68 })),
      glass: new THREE.MeshStandardMaterial({
        color: 0x56ccf2,
        map: glassTex,
        emissive: 0x0369a1,
        emissiveIntensity: 0.25,
        roughness: 0.16,
        metalness: 0.45,
      }),
      gold: new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xb45309,
        emissiveIntensity: 0.25,
        roughness: 0.24,
        metalness: 0.88,
      }),
      granite: applyLandmarkFinish(new THREE.MeshStandardMaterial({ color: 0xc68676, map: graniteTex, roughness: 0.42, metalness: 0.12 })),
      ruin: applyLandmarkFinish(new THREE.MeshStandardMaterial({ color: 0x3b3532, map: darkStoneTex, roughness: 0.9, metalness: 0.08 })),
      red: new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        emissive: 0x7f1d1d,
        emissiveIntensity: 0.25,
        roughness: 0.5,
      }),
      blue: new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.55 }),
      sandstone: applyLandmarkFinish(new THREE.MeshStandardMaterial({ color: 0xc2b293, map: stoneTex, roughness: 0.8, metalness: 0.04 })),
      patina: new THREE.MeshStandardMaterial({ color: 0x45766a, roughness: 0.55, metalness: 0.5 }),
      steel: new THREE.MeshStandardMaterial({ color: 0xd8dee6, roughness: 0.22, metalness: 0.9 }),
      asphalt: new THREE.MeshStandardMaterial({ color: 0x4a4f58, roughness: 0.92, metalness: 0.02 }),
      roadPaint: new THREE.MeshStandardMaterial({ color: 0xe0b23a, roughness: 0.7 }),
    };
    return this.fallbackMats;
  }

  populateFallback(group, kind) {
    group.clear();
    if (packOf(kind) === 'rome') {
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });
      applyLandmarkFinish(material);
      const mesh = new THREE.Mesh(createRomeLandmarkGeometry(kind), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(markOwned(mesh));
      group.userData.landmarkSource = 'fallback';
      return;
    }
    const m = this.getMaterials();
    const addBox = (w, h, d, mat, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    const addCyl = (rt, rb, h, segs, mat, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    switch (kind) {
      case 'ELYSEE': {
        addBox(7.6, 0.22, 3.6, m.darkStone, 0, 0.11, 0);
        addBox(7.0, 2.2, 2.0, m.stone, 0, 1.32, -0.65);
        addBox(6.4, 0.85, 1.5, m.slate, 0, 2.84, -0.65);
        addBox(1.45, 1.85, 1.8, m.stone, -2.8, 1.14, 0.7);
        addBox(1.45, 1.85, 1.8, m.stone, 2.8, 1.14, 0.7);
        addBox(2.4, 2.1, 0.6, m.whiteStone, 0, 1.25, 0.55);
        addCyl(0.03, 0.03, 1.1, 8, m.gold, 0, 3.8, -0.65);
        addBox(0.18, 0.26, 0.04, m.blue, 0.12, 4.15, -0.65);
        addBox(0.18, 0.26, 0.04, m.whiteStone, 0.30, 4.15, -0.65);
        addBox(0.18, 0.26, 0.04, m.red, 0.48, 4.15, -0.65);
        break;
      }
      case 'ELYSEE_RUINED': {
        addBox(7.6, 0.2, 3.6, m.ruin, 0, 0.1, 0);
        addBox(3.0, 1.1, 1.8, m.ruin, -1.8, 0.65, -0.65);
        addBox(2.6, 0.85, 1.7, m.darkStone, 1.9, 0.52, -0.65);
        addBox(1.4, 0.9, 1.6, m.ruin, -2.8, 0.55, 0.7);
        addBox(1.4, 0.65, 1.6, m.ruin, 2.8, 0.42, 0.7);
        break;
      }
      case 'EIFFEL_TOWER': {
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            addBox(1.38, 1.1, 1.38, m.darkStone, sx * 2.0, 0.55, sz * 2.0);
            addCyl(0.42, 0.62, 2.8, 4, m.iron, sx * 1.65, 2.5, sz * 1.65);
          }
        }
        addBox(3.5, 0.35, 3.5, m.iron, 0, 3.95, 0);
        addCyl(0.95, 1.55, 3.3, 4, m.iron, 0, 5.75, 0);
        addBox(2.1, 0.3, 2.1, m.iron, 0, 7.5, 0);
        addCyl(0.32, 0.88, 3.8, 4, m.iron, 0, 9.55, 0);
        addCyl(0.04, 0.22, 1.5, 8, m.gold, 0, 12.2, 0);
        break;
      }
      case 'ARC_DE_TRIOMPHE': {
        addBox(1.72, 3.5, 3.3, m.stone, -1.95, 1.75, 0);
        addBox(1.72, 3.5, 3.3, m.stone, 1.95, 1.75, 0);
        addBox(5.6, 1.3, 3.45, m.stone, 0, 4.15, 0);
        addBox(5.3, 0.95, 3.15, m.darkStone, 0, 5.25, 0);
        addCyl(0.22, 0.28, 0.12, 10, m.gold, 0, 0.06, 0);
        break;
      }
      case 'NOTRE_DAME': {
        addBox(7.6, 0.25, 3.6, m.darkStone, 0, 0.12, 0);
        addBox(5.4, 2.9, 2.5, m.stone, 0.35, 1.7, 0);
        addBox(1.6, 3.0, 3.4, m.stone, 0.65, 1.75, 0);
        addBox(1.45, 5.2, 1.4, m.stone, -2.85, 2.85, -0.98);
        addBox(1.45, 5.2, 1.4, m.stone, -2.85, 2.85, 0.98);
        addCyl(0.05, 0.35, 3.6, 8, m.slate, 0.65, 5.8, 0);
        break;
      }
      case 'LOUVRE_PYRAMID': {
        addBox(3.8, 0.18, 3.8, m.darkStone, 0, 0.09, 0);
        const cone = addCyl(0.02, 2.15, 3.6, 4, m.glass, 0, 1.98, 0);
        cone.rotation.y = Math.PI / 4;
        break;
      }
      case 'SACRE_COEUR': {
        addBox(5.6, 0.55, 3.6, m.whiteStone, 0, 0.27, 0);
        addBox(4.4, 2.4, 2.6, m.whiteStone, 0, 1.75, -0.15);
        addCyl(1.15, 1.22, 1.8, 14, m.whiteStone, 0, 3.85, -0.15);
        addCyl(0.15, 1.15, 2.2, 14, m.whiteStone, 0, 5.85, -0.15);
        break;
      }
      case 'CONCORDE_OBELISK': {
        addBox(1.2, 0.55, 1.2, m.darkStone, 0, 0.27, 0);
        addBox(0.88, 1.25, 0.88, m.stone, 0, 1.18, 0);
        addCyl(0.26, 0.44, 4.3, 4, m.granite, 0, 3.95, 0).rotation.y = Math.PI / 4;
        addCyl(0.01, 0.26, 0.85, 4, m.gold, 0, 6.52, 0).rotation.y = Math.PI / 4;
        break;
      }
      case 'BRANDENBURG_GATE': {
        // Pylons and pavilions on cells 0, 2, 4, 6; passages on cells 1, 3, 5 stay open below the entablature.
        for (const x of [-2, 2]) addBox(0.9, 4.3, 3.0, m.sandstone, x, 2.15, 0);
        for (const x of [-5.55, 5.55]) addBox(0.7, 4.3, 3.0, m.sandstone, x, 2.15, 0);
        for (const x of [-5.25, -2.75, -1.25, 1.25, 2.75, 5.25]) {
          for (const z of [-1.45, 1.45]) addCyl(0.2, 0.24, 3.9, 10, m.whiteStone, x, 2.3, z);
        }
        addBox(11.3, 0.9, 3.5, m.sandstone, 0, 4.85, 0);
        addBox(11.7, 0.2, 3.84, m.darkStone, 0, 5.37, 0);
        addBox(10.6, 0.7, 3.3, m.sandstone, 0, 5.82, 0);
        addBox(2.2, 0.9, 1.6, m.patina, 0, 6.62, 0);
        addCyl(0.1, 0.16, 1.3, 8, m.patina, 0, 7.6, -0.5);
        for (const x of [-6.3, 6.3]) {
          addBox(1.1, 2.7, 3.1, m.sandstone, x, 1.35, 0);
          addBox(1.3, 0.5, 3.7, m.slate, x, 2.95, 0);
        }
        break;
      }
      case 'VICTORY_COLUMN': {
        addBox(3.5, 0.36, 3.5, m.darkStone, 0, 0.18, 0);
        addBox(3.1, 0.95, 3.1, m.granite, 0, 0.83, 0);
        addCyl(1.4, 1.4, 1.1, 16, m.granite, 0, 1.86, 0);
        addCyl(1.52, 1.52, 0.2, 20, m.darkStone, 0, 2.51, 0);
        addCyl(0.48, 0.56, 6.0, 14, m.whiteStone, 0, 5.6, 0);
        for (const y of [3.4, 5.4, 7.4]) addCyl(0.6, 0.6, 0.6, 14, m.gold, 0, y, 0);
        addCyl(0.72, 0.5, 0.3, 14, m.sandstone, 0, 8.75, 0);
        addCyl(0.1, 0.24, 1.6, 10, m.gold, 0, 9.7, 0);
        addBox(0.7, 0.5, 0.08, m.gold, 0, 10.2, -0.1);
        break;
      }
      case 'VERSAILLES_PALACE': {
        addBox(31.8, 0.12, 5.9, m.darkStone, 0, 0.06, 0);
        addBox(18.6, 4.6, 5.8, m.stone, 0, 2.42, 0);
        for (const x of [-12.6, 12.6]) addBox(6.6, 4.6, 5.2, m.stone, x, 2.42, 0.3);
        addBox(31.4, 0.3, 0.16, m.whiteStone, 0, 4.93, -2.8);
        for (const x of [-13.5, -6, 6, 13.5]) addBox(3.0, 1.0, 1.8, m.slate, x, 5.2, 2.0);
        for (let i = 0; i < 24; i++) addBox(0.5, 1.3, 0.05, m.glass, -14.4 + i * 1.25, 2.7, -2.95);
        break;
      }
      case 'LATONA_FOUNTAIN': {
        addCyl(1.95, 1.95, 0.3, 24, m.whiteStone, 0, 0.15, 0);
        addCyl(1.8, 1.8, 0.04, 24, m.glass, 0, 0.32, 0);
        addCyl(1.3, 1.38, 0.32, 20, m.granite, 0, 0.46, 0);
        addCyl(0.95, 1.02, 0.3, 18, m.whiteStone, 0, 0.77, 0);
        addCyl(0.64, 0.68, 0.3, 16, m.granite, 0, 1.07, 0);
        addCyl(0.1, 0.16, 0.8, 10, m.whiteStone, 0, 1.62, 0);
        break;
      }
      case 'APOLLO_FOUNTAIN': {
        addBox(3.96, 0.26, 3.96, m.whiteStone, 0, 0.13, 0);
        addBox(3.7, 0.04, 3.7, m.glass, 0, 0.28, 0);
        addBox(1.1, 0.52, 0.7, m.gold, 0, 0.54, 0.45);
        for (const x of [-0.75, -0.25, 0.25, 0.75]) addBox(0.22, 0.6, 0.7, m.gold, x, 0.6, -0.6);
        addCyl(0.12, 0.17, 0.7, 10, m.gold, 0, 1.15, 0.55);
        break;
      }
      case 'ATOMIUM': {
        addBox(5.9, 0.14, 5.9, m.darkStone, 0, 0.07, 0);
        // A cube of nine spheres standing on one corner: top, bottom, centre and six around the middle.
        const centre = 6.2;
        const points = [[0, centre + 4.6, 0], [0, centre - 4.6, 0], [0, centre, 0]];
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2;
          points.push([Math.cos(a) * 2.6, centre + 1.5, Math.sin(a) * 2.6]);
          points.push([Math.cos(a + Math.PI / 3) * 2.6, centre - 1.5, Math.sin(a + Math.PI / 3) * 2.6]);
        }
        for (const [x, y, z] of points) {
          const ball = new THREE.Mesh(new THREE.SphereGeometry(0.78, 18, 12), m.steel);
          ball.position.set(x, y, z);
          ball.castShadow = true;
          ball.receiveShadow = true;
          group.add(ball);
        }
        addCyl(0.24, 0.24, centre - 4.6, 10, m.steel, 0, (centre - 4.6) / 2, 0);
        addCyl(0.12, 0.12, 9.2, 8, m.steel, 0, centre, 0);
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + Math.PI / 3;
          const leg = addCyl(0.16, 0.16, 4.6, 8, m.slate, Math.cos(a) * 1.7, 2.1, Math.sin(a) * 1.7);
          leg.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
        }
        break;
      }
      case 'CINQUANTENAIRE_ARCH': {
        // Piers at x = -6, -2, 2, 6 (cells 2, 4, 6, 8); colonnade wings over cells 0-1 and 9-10.
        addBox(21.8, 0.16, 3.9, m.darkStone, 0, 0.08, 0);
        for (const x of [-6, -2, 2, 6]) addBox(1.7, 5.2, 3.4, m.sandstone, x, 2.6, 0);
        addBox(13.8, 1.6, 3.6, m.sandstone, 0, 6.0, 0);
        addBox(14.2, 0.24, 3.9, m.darkStone, 0, 6.92, 0);
        addBox(5.0, 1.0, 2.6, m.patina, 0, 7.54, 0);
        addCyl(0.14, 0.2, 1.1, 8, m.patina, 0, 8.6, 0);
        for (const side of [-1, 1]) {
          addBox(3.6, 0.5, 3.6, m.sandstone, side * 9, 4.3, 0);
          for (const x of [7.6, 8.6, 9.6, 10.5]) addCyl(0.2, 0.24, 4.0, 10, m.whiteStone, side * x, 2.1, 1.1);
          addBox(3.8, 4.0, 0.6, m.sandstone, side * 9, 2.0, -1.4);
        }
        break;
      }
      case 'BRUSSELS_TOWN_HALL': {
        addBox(11.8, 0.14, 3.9, m.darkStone, 0, 0.07, 0);
        for (const x of [-3.3, 3.3]) {
          addBox(4.8, 4.4, 3.4, m.sandstone, x, 2.2, 0);
          addBox(4.6, 1.6, 3.0, m.slate, x, 5.2, 0.1);
          for (let i = 0; i < 7; i++) addBox(0.36, 0.9, 0.05, m.glass, x - 2.0 + i * 0.66, 2.6, -1.73);
        }
        addBox(1.8, 6.6, 1.8, m.sandstone, 0, 3.3, -0.4);
        addCyl(0.75, 0.9, 1.6, 8, m.sandstone, 0, 7.4, -0.4);
        addCyl(0.08, 0.7, 2.8, 8, m.sandstone, 0, 9.6, -0.4);
        addCyl(0.03, 0.08, 0.9, 6, m.gold, 0, 11.4, -0.4);
        break;
      }
      case 'MANNEKEN_PIS': {
        addBox(1.6, 0.18, 1.6, m.darkStone, 0, 0.09, 0);
        addBox(1.2, 0.3, 1.0, m.whiteStone, 0, 0.33, 0.1);
        addBox(1.1, 0.03, 0.9, m.glass, 0, 0.5, 0.1);
        addBox(0.7, 1.0, 0.4, m.stone, 0, 0.98, -0.4);
        addCyl(0.08, 0.07, 0.32, 8, m.patina, 0, 1.48, -0.3);
        addCyl(0.07, 0.07, 0.1, 8, m.patina, 0, 1.85, -0.3);
        break;
      }
      case 'MINE_SIGN': {
        addCyl(0.04, 0.04, 1.05, 8, m.slate, 0, 0.52, 0);
        addBox(0.5, 0.36, 0.05, m.red, 0, 1.12, 0);
        break;
      }
    }
    group.userData.landmarkSource = 'fallback';
  }

  clearLiveGroups() {
    this.liveGroups.clear();
  }

  /** Frees loaded GLB templates, textures, and materials while keeping the loader reusable. */
  unload() {
    for (const group of this.liveGroups) disposeOwned(group);
    this.liveGroups.clear();
    this.packPromises.clear();
    this.loadPromise = null;
    for (const template of this.templates.values()) {
      template.traverse((node) => {
        node.geometry?.dispose?.();
      });
    }
    this.templates.clear();
    for (const mat of this.sharedMaterials) {
      mat.map?.dispose?.();
      mat.normalMap?.dispose?.();
      mat.roughnessMap?.dispose?.();
      mat.metalnessMap?.dispose?.();
      mat.dispose?.();
    }
    this.sharedMaterials.clear();
    for (const tex of this.fallbackTextures) {
      tex.dispose?.();
    }
    this.fallbackTextures = [];
    if (this.fallbackMats) {
      for (const mat of Object.values(this.fallbackMats)) mat.dispose();
      this.fallbackMats = null;
    }
  }

  dispose() {
    this.disposed = true;
    this.unload();
  }
}

// Procedural fallback geometry, available while the landmark pack loads.
const STONE = 0xc6b396;
const MARBLE = 0xdacdb2;
const AGED = 0x9c876c;

function createRomeLandmarkGeometry(kind) {
  const parts = [];
  const put = (geometry, x, y, z, color = STONE, yaw = 0) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.rotateY(yaw);
    g.translate(x, y, z);
    const tint = new THREE.Color(color);
    // Stable per-block variation; no random state shared with gameplay.
    tint.multiplyScalar(0.92 + ((parts.length * 37) % 17) / 100);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(g);
  };
  const box = (w, h, d, x, y, z, color = STONE, yaw = 0) =>
    put(new THREE.BoxGeometry(w, h, d), x, y, z, color, yaw);
  const cylinder = (rt, rb, h, x, y, z, color = MARBLE, segments = 12) =>
    put(new THREE.CylinderGeometry(rt, rb, h, segments), x, y, z, color);

  // Real open voussoir arches, not dark panels painted over solid walls.
  const arch = (radius, thickness, depth, x, spring, z, yaw = 0, color = MARBLE) => {
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 10 + 0.008;
      const b = (i + 1) * Math.PI / 10 - 0.008;
      const shape = new THREE.Shape();
      shape.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
      shape.lineTo(Math.cos(a) * (radius + thickness), Math.sin(a) * (radius + thickness));
      shape.lineTo(Math.cos(b) * (radius + thickness), Math.sin(b) * (radius + thickness));
      shape.lineTo(Math.cos(b) * radius, Math.sin(b) * radius);
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
      g.translate(0, 0, -depth / 2);
      put(g, x, spring, z, color, yaw);
    }
  };
  const column = (x, z, height, base = 0, radius = 0.25) => {
    box(radius * 3, 0.22, radius * 3, x, base + 0.11, z, AGED);
    cylinder(radius * 1.2, radius * 1.3, 0.18, x, base + 0.31, z);
    // Separate drums make weathering legible at the isometric camera distance.
    const shaft = height - 0.9;
    for (let i = 0; i < 5; i++) {
      cylinder(radius * (0.92 - i * 0.025), radius * (0.96 - i * 0.025), shaft / 5 - 0.015,
        x, base + 0.4 + (i + 0.5) * shaft / 5, z, MARBLE, 16);
    }
    cylinder(radius * 1.3, radius * 0.85, 0.28, x, base + height - 0.36, z);
    box(radius * 3, 0.22, radius * 3, x, base + height - 0.11, z, MARBLE);
  };

  if (kind === 'COLOSSEUM') {
    // 10x8 cells. The southern facade is partly lost, exposing the cavea.
    // Leave a four-unit axial passage at north and south, also in the collision mask.
    const bays = 40;
    for (let i = 0; i < bays; i++) {
      const a = (i + 0.5) * Math.PI * 2 / bays;
      const x = 9.15 * Math.cos(a), z = 7.1 * Math.sin(a);
      const yaw = Math.atan2(7.1 * Math.cos(a), 9.15 * Math.sin(a));
      const width = Math.hypot(9.15 * Math.sin(a), 7.1 * Math.cos(a)) * Math.PI * 2 / bays;
      const gate = Math.abs(x) < 2.55;
      const ruined = Math.sin(a) > 0.15;
      for (let tier = 0; tier < (ruined ? 1 : 3); tier++) {
        if (gate && tier === 0) continue;
        const y0 = tier === 0 ? 0 : 3.4 + (tier - 1) * 2.15;
        const h = tier === 0 ? 3.4 : 2.15;
        const r = width * 0.33;
        const spring = y0 + h - r - 0.38;
        const pierX = x + Math.cos(yaw) * width / 2;
        const pierZ = z - Math.sin(yaw) * width / 2;
        box(width * 0.28, h - 0.24, 0.72, pierX, y0 + (h - 0.24) / 2, pierZ, STONE, yaw);
        arch(r, 0.18, 0.72, x, spring, z, yaw);
        box(width + 0.06, 0.22, 0.92, x, y0 + h - 0.11, z, MARBLE, yaw);
        // Engaged columns on the outside of every pier.
        cylinder(0.10, 0.13, h - 0.45, pierX + Math.sin(yaw) * 0.43,
          y0 + h / 2 - 0.1, pierZ + Math.cos(yaw) * 0.43, MARBLE, 8);
      }
      if (!ruined) {
        box(width + 0.03, 0.85, 0.7, x, 8.12, z, STONE, yaw);
        box(width + 0.09, 0.16, 0.92, x, 8.62, z, MARBLE, yaw);
        box(0.26, 0.36, 0.07, x + Math.sin(yaw) * 0.37, 8.13,
          z + Math.cos(yaw) * 0.37, AGED, yaw);
      }
      if (!gate) {
        // Stepped seating and exposed radial substructures inside the surviving shell.
        for (let step = 0; step < 4; step++) {
          const factor = 0.77 + step * 0.045;
          box(width * factor + 0.02, 0.3, 0.43, x * factor, 0.35 + step * 0.34,
            z * factor, step % 2 ? STONE : AGED, yaw);
        }
        if (ruined && i % 2 === 0) {
          box(0.36, 1.6, 1.8, x * 0.87, 0.8, z * 0.87, AGED, yaw);
        }
      }
    }
  } else if (kind === 'ARCH_OF_CONSTANTINE') {
    // 7x2 cells: four piers, three full north/south passages, higher central arch.
    for (const x of [-6, -2, 2, 6]) {
      box(1.85, 0.4, 3.8, x, 0.2, 0, AGED);
      box(1.6, 5.1, 2.8, x, 2.95, 0);
      for (const z of [-1.55, 1.55]) {
        column(x, z, 4.65, 0.4, 0.23);
        box(1.05, 0.55, 0.08, x, 2.0, z + Math.sign(z) * 0.13, MARBLE);
        // Attic statues on individual plinths above the projecting columns.
        box(0.66, 0.18, 0.66, x, 6.36, z, MARBLE);
        cylinder(0.14, 0.22, 0.66, x, 6.79, z, AGED, 8);
        cylinder(0.14, 0.14, 0.22, x, 7.23, z, MARBLE, 8);
      }
    }
    for (const x of [-4, 0, 4]) {
      arch(x === 0 ? 1.18 : 1.08, 0.28, 2.8, x, x === 0 ? 3.45 : 2.5, 0);
      if (x !== 0) {
        box(2.45, 1.25, 2.8, x, 4.75, 0);
        for (const z of [-1.43, 1.43]) for (const dx of [-0.55, 0.55]) {
          const medallion = new THREE.CylinderGeometry(0.31, 0.31, 0.08, 16);
          medallion.rotateX(Math.PI / 2);
          put(medallion, x + dx, 4.62, z, MARBLE);
        }
      }
    }
    box(13.8, 0.26, 3.7, 0, 5.6, 0, MARBLE);
    box(13.3, 1.1, 2.8, 0, 6.28, 0);
    box(13.7, 0.22, 3.3, 0, 6.94, 0, MARBLE);
    for (const z of [-1.43, 1.43]) {
      box(3.1, 0.74, 0.08, 0, 6.27, z, AGED);
      for (let line = 0; line < 4; line++) {
        box(2.65 - (line % 2) * 0.2, 0.035, 0.025, 0, 6.04 + line * 0.15,
          z + Math.sign(z) * 0.055, MARBLE);
      }
      for (const x of [-4, 4]) box(1.55, 0.66, 0.09, x, 6.3, z, MARBLE);
    }
  } else if (kind === 'FORUM_COLUMNS') {
    // Three surviving Corinthian columns and broken entablature on a low temple podium.
    box(5.9, 0.22, 1.9, 0, 0.11, 0, AGED);
    box(5.6, 0.18, 1.6, 0, 0.31, 0, STONE);
    for (const x of [-2, 0, 2]) {
      column(x, 0, 4.1, 0.4, 0.3);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        cylinder(0.05, 0.11, 0.3, x + Math.cos(a) * 0.3, 4.15, Math.sin(a) * 0.3, MARBLE, 5);
      }
    }
    box(5.6, 0.3, 0.9, 0, 4.65, 0, STONE);
    box(5.8, 0.22, 1.12, 0, 4.91, 0, MARBLE);
    for (let i = 0; i < 18; i++) box(0.13, 0.14, 0.15, -2.65 + i * 0.31, 4.77, 0.52, AGED);
  } else {
    throw new Error(`Unknown Rome landmark: ${kind}`);
  }
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
