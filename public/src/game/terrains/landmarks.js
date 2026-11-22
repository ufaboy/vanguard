/**
 * Landmark catalog and 3D model loader (Paris monuments for Survival S-01
 * "Paris: Last Stand", Berlin monuments for campaign mission 02 "Brandenburg Gate",
 * Versailles palace and fountains for campaign mission 03 "Versailles", Brussels
 * monuments for campaign mission 04 "Brussels", Hofburg, Burgtor and Heldenplatz for
 * campaign mission 10 "Vienna: Hofburg").
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
import { getSharedGltfLoader } from '../render/gltf-loader.js';
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
  vienna: '../../../models/landmarks/vienna_landmarks.glb',
  amsterdam: '../../../models/landmarks/amsterdam_landmarks.glb',
  barcelona: '../../../models/landmarks/barcelona_landmarks.glb',
  alps: '../../../models/landmarks/alps_landmarks.glb',
  italy: '../../../models/landmarks/italy_landmarks.glb',
  germany: '../../../models/landmarks/germany_landmarks.glb',
  rotterdam: '../../../models/landmarks/rotterdam_landmarks.glb',
});

/** Cells `cols` of every row in a `cols` x `rows` footprint. */
const COLUMNS = (cols, rows) => ALL(Math.max(...cols) + 1, rows).filter(([, dc]) => cols.includes(dc));

export const LANDMARK_SPECS = Object.freeze({
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
  HOFBURG_PALACE: Object.freeze({ cols: 6, rows: 2, blocked: ALL(6, 2), height: 6.92, pack: 'vienna' }),
  ST_STEPHENS_CATHEDRAL: Object.freeze({ cols: 4, rows: 2, blocked: ALL(4, 2), height: 12.0, pack: 'vienna' }),
  // Hofburg Michaelertrakt, front facing north; both wings block, cell 3 is the open dome gate.
  MICHAELERTRAKT: Object.freeze({ cols: 7, rows: 2, blocked: COLUMNS([0, 1, 2, 4, 5, 6], 2), height: 9.9, pack: 'vienna' }),
  // Outer castle gate: piers (cells 0, 2, 4, 6) block, cells 1, 3, 5 are north-south passages.
  BURGTOR: Object.freeze({ cols: 7, rows: 2, blocked: COLUMNS([0, 2, 4, 6], 2), height: 6.9, pack: 'vienna' }),
  HELDENPLATZ_STATUE: Object.freeze({ cols: 1, rows: 1, blocked: [[0, 0]], height: 3.9, pack: 'vienna' }),
  AMSTERDAM_CANAL_HOUSES: Object.freeze({ cols: 4, rows: 2, blocked: ALL(4, 2), height: 5.94, pack: 'amsterdam' }),
  WESTERKERK: Object.freeze({ cols: 3, rows: 2, blocked: ALL(3, 2), height: 11.36, pack: 'amsterdam' }),
  SAGRADA_FAMILIA: Object.freeze({ cols: 4, rows: 4, blocked: ALL(4, 4), height: 13.0, pack: 'barcelona' }),
  BARCELONA_CATHEDRAL: Object.freeze({ cols: 3, rows: 2, blocked: ALL(3, 2), height: 9.55, pack: 'barcelona' }),
  MONTJUIC_CASTLE: Object.freeze({ cols: 5, rows: 3, blocked: ALL(5, 3), height: 6.16, pack: 'barcelona' }),
  COLUMBUS_MONUMENT: Object.freeze({ cols: 2, rows: 2, blocked: ALL(2, 2), height: 11.02, pack: 'barcelona' }),
  W_HOTEL_BARCELONA: Object.freeze({ cols: 3, rows: 2, blocked: ALL(3, 2), height: 11.25, pack: 'barcelona' }),
  NEUSCHWANSTEIN: Object.freeze({ cols: 5, rows: 3, blocked: ALL(5, 3), height: 10.5, pack: 'alps' }),
  HOHENSALZBURG: Object.freeze({ cols: 5, rows: 3, blocked: ALL(5, 3), height: 8.09, pack: 'alps' }),
  MONTSERRAT_MONASTERY: Object.freeze({ cols: 5, rows: 2, blocked: ALL(5, 2), height: 6.5, pack: 'alps' }),
  MILAN_DUOMO: Object.freeze({ cols: 4, rows: 3, blocked: ALL(4, 3), height: 9.5, pack: 'italy' }),
  VERONA_ARENA: Object.freeze({ cols: 6, rows: 5, blocked: [
    '.#..#.', '##..##', '#....#', '##..##', '.#..#.',
  ].flatMap((line, row) => [...line].flatMap((cell, col) => cell === '#' ? [[row, col]] : [])), height: 6.0, pack: 'italy' }),
  PANTHEON: Object.freeze({ cols: 4, rows: 4, blocked: ALL(4, 4), height: 7.5, pack: 'italy' }),
  REICHSTAG_DOME: Object.freeze({ cols: 5, rows: 3, blocked: ALL(5, 3), height: 8.46, pack: 'germany' }),
  FRAUENKIRCHE: Object.freeze({ cols: 3, rows: 3, blocked: ALL(3, 3), height: 10.5, pack: 'germany' }),
  ZOLLVEREIN_TOWER: Object.freeze({ cols: 3, rows: 2, blocked: ALL(3, 2), height: 11.0, pack: 'germany' }),
  ERASMUS_BRIDGE: Object.freeze({ cols: 7, rows: 2, blocked: [], height: 11.53, pack: 'rotterdam' }),
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
  'HOFBURG_PALACE',
  'ST_STEPHENS_CATHEDRAL',
  'MICHAELERTRAKT',
  'BURGTOR',
  'HELDENPLATZ_STATUE',
  'AMSTERDAM_CANAL_HOUSES',
  'WESTERKERK',
  'SAGRADA_FAMILIA',
  'BARCELONA_CATHEDRAL',
  'MONTJUIC_CASTLE',
  'COLUMBUS_MONUMENT',
  'W_HOTEL_BARCELONA',
  'NEUSCHWANSTEIN',
  'HOHENSALZBURG',
  'MONTSERRAT_MONASTERY',
  'MILAN_DUOMO',
  'VERONA_ARENA',
  'PANTHEON',
  'REICHSTAG_DOME',
  'FRAUENKIRCHE',
  'ZOLLVEREIN_TOWER',
  'ERASMUS_BRIDGE',
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
        float fwH = fwidth(wp.y / courseH);
        float fwV = fwidth(wallU / blockW);
        float mortarH = (1.0 - smoothstep(0.0, max(0.08, fwH * 1.25), min(rowFrac, 1.0 - rowFrac))) * (1.0 - smoothstep(0.18, 0.45, fwH));
        float mortarV = (1.0 - smoothstep(0.0, max(0.05, fwV * 1.25), min(colFrac, 1.0 - colFrac))) * (1.0 - smoothstep(0.18, 0.45, fwV));
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
  constructor(renderer = null) {
    this.renderer = renderer;
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
    const gltf = await getSharedGltfLoader(this.renderer).loadAsync(glbUrl);
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
    autoDisposeOwned(group);
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
    box(width - 0.7, 0.03, length - 0.02, m.asphalt, 0, deckTop + 0.005, 0);
    const dashes = Math.max(2, Math.round(length / 0.9));
    for (let i = 0; i < dashes; i++) {
      const z = -halfL + (length * (i + 0.5)) / dashes;
      box(0.08, 0.01, 0.45, m.roadPaint, 0, deckTop + 0.023, z);
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
      box(0.24, 0.09, length - 0.3, m.stone, px, deckTop + 0.035, 0);
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
        box(0.34, 0.52, 0.34, m.stone, px, deckTop + 0.24, z);
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
      box(width + 0.3, 0.7, 0.7, m.darkStone, 0, -0.36, z);
      for (const sx of [-1, 1]) {
        add(cutwater, m.darkStone, sx * (halfW + 0.15), -0.3, z).scale.set(1, 1, 0.83);
        box(0.5, 0.06, 0.5, m.stone, sx * (halfW + 0.15), 0.06, z).rotation.y = Math.PI / 4;
      }
    }
    // Abutments where the bridge meets each bank.
    for (const sz of [-1, 1]) {
      box(width + 0.5, 0.59, 0.45, m.stone, 0, -0.225, sz * (halfL - 0.05));
    }
    return markOwned(group, { geometries: true, materials: false });
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
    const m = this.getMaterials();
    const spec = LANDMARK_SPECS[kind] || { cols: 1, rows: 1, height: 2 };
    const w = Math.max(1.2, spec.cols * 2 - 0.25);
    const d = Math.max(1.2, spec.rows * 2 - 0.25);
    const bodyH = Math.max(0.5, spec.height - 0.24);
    const addBox = (bw, bh, bd, mat, y) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
      mesh.position.set(0, y, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(markOwned(mesh, { geometries: true, materials: false }));
      return mesh;
    };
    addBox(w, 0.24, d, m.darkStone, 0.12);
    addBox(w * 0.86, bodyH, d * 0.86, m.stone, 0.24 + bodyH * 0.5);
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

