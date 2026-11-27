// Post-processes the Blender tank exports for the game:
//   assets/blender/<tank>/tank_<tank>.glb  ->  public/models/tank_<tank>.glb
//
//  1. Simplifies the geometry for the isometric camera (see simplifyTank): the Blender
//     exports are flat-shaded film-quality meshes (35-170k triangles per tank) while a tank
//     covers ~100 px on screen. Track meshes keep their exact topology.
//  2. Merges each model's per-part materials into ONE material backed by a shared texture
//     atlas (one atlas each for base colour, normal and ORM), remapping UVs. The game then
//     merges same-pivot meshes (models.js) so an enemy tank is ~3 draw calls.
//  3. Caps every atlas tile at MAX_TEXTURE (512 px).
//  4. Encodes textures to KTX2 / Basis Universal (KHR_texture_basisu) so they stay
//     GPU-compressed in VRAM: base colour (sRGB), ORM and normal maps as ETC1S
//     (NORMAL_CODEC=uastc encodes normal maps as UASTC + Zstd: better relief, much larger files).
//  5. Re-applies Draco geometry compression (custom running-gear attributes included).
//
// Usage: pnpm run optimize-models [-- tank_player tank_scout ...]   (default: every tank)
//        --no-ktx2 keeps PNG textures, --no-draco keeps raw geometry and --no-simplify keeps
//        the full Blender geometry (debugging); MODELS_OUT_DIR overrides the output directory.
//        --simplify-existing tank_player only simplifies the already optimized GLB in place
//        (its Blender source has untextured materials the atlas step rejects).
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO, TextureInfo } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, draco, prune, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { ktx2 } from 'ktx2-encoder/gltf-transform';

const SRC_ROOT = 'assets/blender';
// Simplification error relative to each mesh's size (meshoptimizer units); SIMPLIFY_ERROR
// overrides it. 0.004 is visually identical even in close-ups. Higher values, or meshoptimizer's
// 'Permissive' flag (collapses across UV seams), visibly smear armour plates and ERA blocks.
const SIMPLIFY_ERROR = Number(process.env.SIMPLIFY_ERROR) || 0.004;
// Faces meeting at a sharper angle keep a hard edge when normals are rebuilt
const CREASE_ANGLE_DEG = 35;
// Track meshes carry per-link scroll attributes (_TRK, _TRKSTEP): every link is its own
// vertex set, so simplification gains nothing there; they stay untouched
const KEEP_TOPOLOGY = /^Track/;
const OUT_DIR = process.env.MODELS_OUT_DIR || 'public/models';
const MAX_TEXTURE = 512;
// Normal maps: 'etc1s' (default, smallest files) or 'uastc' (best quality, ~3-4x larger files)
const NORMAL_CODEC = process.env.NORMAL_CODEC === 'uastc' ? 'uastc' : 'etc1s';
// Every tank merges its materials into a single atlas material (one draw per mesh group);
// the atlas is 2048 px wide when the tiles fit in 2048x2048, else 4096 px
const ATLAS_MAX_WIDTH = 4096;
// Background per slot so mip levels never pull in a foreign colour at tile borders
const SLOT_FILL = {
  baseColor: { r: 0, g: 0, b: 0, alpha: 1 },
  normal: { r: 128, g: 128, b: 255, alpha: 1 },
  orm: { r: 255, g: 255, b: 0, alpha: 1 },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});

const imageDecoder = async (buffer) => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};

const imageSize = async (texture) => {
  const meta = await sharp(texture.getImage()).metadata();
  return meta.width;
};

/** Renders one tile: content resized inside an edge-extended gutter that limits mip bleeding. */
async function renderTile(texture, size, pad) {
  const inner = size - pad * 2;
  // Decode to plain RGBA first: some baked maps are grayscale JPEGs
  const resized = await sharp(texture.getImage())
    .toColourspace('srgb')
    .ensureAlpha()
    .resize(inner, inner, { kernel: 'lanczos3', fit: 'fill' })
    .raw()
    .toBuffer();
  return sharp(resized, { raw: { width: inner, height: inner, channels: 4 } })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, extendWith: 'copy' })
    .png()
    .toBuffer();
}

/** Merges every material of the model into one atlas-backed material and remaps UVs. */
async function buildAtlas(doc, name) {
  const root = doc.getRoot();
  const materials = root.listMaterials();
  const tiles = [];
  for (const material of materials) {
    const baseColor = material.getBaseColorTexture();
    const normal = material.getNormalTexture();
    const orm = material.getMetallicRoughnessTexture();
    if (!baseColor || !normal || !orm) throw new Error(`${name}: material ${material.getName()} lacks a texture slot`);
    const size = Math.min(MAX_TEXTURE, await imageSize(baseColor));
    tiles.push({ material, size, pad: size >= 512 ? 8 : 4, textures: { baseColor, normal, orm } });
  }

  // Shelf packing, largest tiles first
  tiles.sort((a, b) => b.size - a.size);
  const area = tiles.reduce((sum, t) => sum + t.size * t.size, 0);
  const ATLAS_WIDTH = area <= 2048 * 2048 * 0.85 ? 2048 : ATLAS_MAX_WIDTH;
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const tile of tiles) {
    if (x + tile.size > ATLAS_WIDTH) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    tile.x = x;
    tile.y = y;
    x += tile.size;
    rowHeight = Math.max(rowHeight, tile.size);
  }
  const height = Math.ceil((y + rowHeight) / 4) * 4;

  const atlas = {};
  for (const slot of Object.keys(SLOT_FILL)) {
    // Sequential on purpose: dozens of parallel libvips pipelines intermittently fail on Windows
    const composites = [];
    for (const t of tiles) {
      composites.push({ input: await renderTile(t.textures[slot], t.size, t.pad), left: t.x, top: t.y });
    }
    const png = await sharp({ create: { width: ATLAS_WIDTH, height, channels: 4, background: SLOT_FILL[slot] } })
      .composite(composites)
      .png()
      .toBuffer();
    atlas[slot] = doc
      .createTexture(`${name}_atlas_${slot}`)
      .setImage(new Uint8Array(png))
      .setMimeType('image/png');
  }

  // One material for every part; remap each primitive's UVs into its tile
  const first = tiles[0].material;
  const merged = doc
    .createMaterial(`${name}_Atlas`)
    .setDoubleSided(first.getDoubleSided())
    .setMetallicFactor(first.getMetallicFactor())
    .setRoughnessFactor(first.getRoughnessFactor())
    .setBaseColorFactor(first.getBaseColorFactor())
    .setBaseColorTexture(atlas.baseColor)
    .setNormalTexture(atlas.normal)
    .setMetallicRoughnessTexture(atlas.orm);
  for (const info of [
    merged.getBaseColorTextureInfo(),
    merged.getNormalTextureInfo(),
    merged.getMetallicRoughnessTextureInfo(),
  ]) {
    info.setWrapS(TextureInfo.WrapMode.CLAMP_TO_EDGE).setWrapT(TextureInfo.WrapMode.CLAMP_TO_EDGE);
  }

  const tileByMaterial = new Map(tiles.map((t) => [t.material, t]));
  const el = [];
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const tile = tileByMaterial.get(prim.getMaterial());
      if (!tile) throw new Error(`${name}: primitive in ${mesh.getName()} has no atlas tile`);
      let uv = prim.getAttribute('TEXCOORD_0');
      if (uv.listParents().filter((p) => p.propertyType === 'Primitive').length > 1) {
        uv = uv.clone();
        prim.setAttribute('TEXCOORD_0', uv);
      }
      const inner = tile.size - tile.pad * 2;
      for (let i = 0; i < uv.getCount(); i++) {
        uv.getElement(i, el);
        const u = Math.min(1, Math.max(0, el[0]));
        const v = Math.min(1, Math.max(0, el[1]));
        uv.setElement(i, [
          (tile.x + tile.pad + u * inner) / ATLAS_WIDTH,
          (tile.y + tile.pad + v * inner) / height,
        ]);
      }
      prim.setMaterial(merged);
    }
  }
  materials.forEach((m) => m.dispose());
  return { width: ATLAS_WIDTH, height, tiles: tiles.length };
}

/** Expands an indexed primitive into one vertex per triangle corner (all attributes). */
function unindexPrimitive(doc, prim) {
  const indices = prim.getIndices().getArray();
  const buffer = doc.getRoot().listBuffers()[0];
  for (const semantic of prim.listSemantics()) {
    const attr = prim.getAttribute(semantic);
    const size = attr.getElementSize();
    const src = attr.getArray();
    const out = new src.constructor(indices.length * size);
    for (let i = 0; i < indices.length; i++) {
      for (let k = 0; k < size; k++) out[i * size + k] = src[indices[i] * size + k];
    }
    prim.setAttribute(
      semantic,
      doc.createAccessor().setType(attr.getType()).setArray(out).setNormalized(attr.getNormalized()).setBuffer(buffer)
    );
  }
  prim.setIndices(null);
}

/** Rebuilds vertex normals on an unindexed primitive: smooth below CREASE_ANGLE_DEG, hard edges above. */
function rebuildCreaseNormals(doc, prim) {
  const pos = prim.getAttribute('POSITION').getArray();
  const triCount = pos.length / 9;
  const faceN = new Float32Array(triCount * 3); // area-weighted
  const unitN = new Float32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const ax = pos[o + 3] - pos[o], ay = pos[o + 4] - pos[o + 1], az = pos[o + 5] - pos[o + 2];
    const bx = pos[o + 6] - pos[o], by = pos[o + 7] - pos[o + 1], bz = pos[o + 8] - pos[o + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    faceN.set([nx, ny, nz], t * 3);
    unitN.set([nx / len, ny / len, nz / len], t * 3);
  }
  // Corners sharing a position (quantized) are smoothing candidates
  const key = (i) => `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
  const groups = new Map();
  for (let c = 0; c < triCount * 3; c++) {
    const k = key(c);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(c);
  }
  const cosLimit = Math.cos((CREASE_ANGLE_DEG * Math.PI) / 180);
  const normals = new Float32Array(triCount * 9);
  for (const corners of groups.values()) {
    for (const c of corners) {
      const t = (c / 3) | 0;
      let sx = 0, sy = 0, sz = 0;
      for (const other of corners) {
        const u = (other / 3) | 0;
        const dot = unitN[t * 3] * unitN[u * 3] + unitN[t * 3 + 1] * unitN[u * 3 + 1] + unitN[t * 3 + 2] * unitN[u * 3 + 2];
        if (dot < cosLimit) continue;
        sx += faceN[u * 3];
        sy += faceN[u * 3 + 1];
        sz += faceN[u * 3 + 2];
      }
      const len = Math.hypot(sx, sy, sz) || 1;
      normals.set([sx / len, sy / len, sz / len], c * 3);
    }
  }
  prim.setAttribute(
    'NORMAL',
    doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(doc.getRoot().listBuffers()[0])
  );
}

/**
 * Reduces triangle count. The exports are flat-shaded (no shared vertices), so normals are
 * dropped first and the mesh welded by position + UV + custom attributes; meshoptimizer then
 * collapses edges within the error bound without crossing UV seams, and normals are rebuilt
 * with a crease angle so hard-surface edges stay sharp.
 */
async function simplifyTank(doc) {
  await MeshoptSimplifier.ready;
  const error = SIMPLIFY_ERROR;
  const targets = [];
  for (const mesh of doc.getRoot().listMeshes()) {
    if (KEEP_TOPOLOGY.test(mesh.getName())) continue;
    for (const prim of mesh.listPrimitives()) {
      prim.setAttribute('NORMAL', null);
      targets.push(prim);
    }
  }
  await doc.transform(weld());

  let before = 0;
  let after = 0;
  for (const prim of targets) {
    const indices = new Uint32Array(prim.getIndices().getArray());
    const positions = new Float32Array(prim.getAttribute('POSITION').getArray());
    const [simplified] = MeshoptSimplifier.simplify(indices, positions, 3, 0, error, []);
    before += indices.length / 3;
    after += simplified.length / 3;
    prim.getIndices().setArray(simplified);
    compactPrimitive(prim);
    unindexPrimitive(doc, prim);
    rebuildCreaseNormals(doc, prim);
  }
  await doc.transform(weld(), prune());
  return { before, after, error };
}

async function optimize(name) {
  const src = path.join(SRC_ROOT, name.replace(/^tank_/, ''), `${name}.glb`);
  const out = path.join(OUT_DIR, `${name}.glb`);
  const doc = await io.read(src);
  const before = fs.statSync(src).size;
  let atlasInfo = null;
  const simplified = NO_SIMPLIFY ? null : await simplifyTank(doc);

  // The atlas caps each tile at MAX_TEXTURE itself; the atlas sheets must not be shrunk
  atlasInfo = await buildAtlas(doc, name);

  const encodeTextures = !NO_KTX2;
  await doc.transform(
    prune(),
    ...(encodeTextures ? [ktx2({
      slots: /^baseColorTexture$/,
      isUASTC: false,
      isPerceptual: true,
      isSetKTX2SRGBTransferFunc: true,
      qualityLevel: 192,
      compressionLevel: 2,
      generateMipmap: true,
      enableDebug: false,
      imageDecoder,
    }),
    ktx2(
      NORMAL_CODEC === 'etc1s'
        ? {
            slots: /^normalTexture$/,
            isUASTC: false,
            isNormalMap: true,
            isPerceptual: false,
            // Data maps must stay linear (the encoder defaults to an sRGB transfer function)
            isSetKTX2SRGBTransferFunc: false,
            qualityLevel: 255,
            generateMipmap: true,
            enableDebug: false,
            imageDecoder,
          }
        : {
            slots: /^normalTexture$/,
            isUASTC: true,
            isNormalMap: true,
            isPerceptual: false,
            // Data maps must stay linear (the encoder defaults to an sRGB transfer function)
            isSetKTX2SRGBTransferFunc: false,
            needSupercompression: true,
            generateMipmap: true,
            enableDebug: false,
            imageDecoder,
          }
    ),
    ktx2({
      slots: /^metallicRoughnessTexture$/,
      isUASTC: false,
      isPerceptual: false,
      isSetKTX2SRGBTransferFunc: false,
      qualityLevel: 160,
      compressionLevel: 2,
      generateMipmap: true,
      enableDebug: false,
      imageDecoder,
    })] : []),
    ...(NO_DRACO
      ? [
          // The extension stays registered after reading; drop it or the writer re-encodes
          (d) => d.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'KHR_draco_mesh_compression')?.dispose(),
        ]
      : [
          draco({
            quantizePosition: 14,
            quantizeNormal: 10,
            // Atlas UVs span a 4096 px texture: keep sub-texel precision
            quantizeTexcoord: atlasInfo ? 15 : 12,
            quantizeGeneric: 14,
          }),
        ])
  );

  await io.write(out, doc);
  const after = fs.statSync(out).size;
  const root = doc.getRoot();
  console.log(
    `${name}: ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB, ` +
      `${root.listMaterials().length} material(s), ${root.listTextures().length} texture(s)` +
      (atlasInfo ? `, atlas ${atlasInfo.width}x${atlasInfo.height} (${atlasInfo.tiles} tiles)` : '') +
      (simplified ? `, ${simplified.before} -> ${simplified.after} triangles (error ${simplified.error})` : '')
  );
}

async function optimizeWorldGlb(filePath) {
  const doc = await io.read(filePath);
  const before = fs.statSync(filePath).size;
  const hasUncompressedTextures = doc
    .getRoot()
    .listTextures()
    .some((t) => t.getMimeType() !== 'image/ktx2');
  const encodeTextures = !NO_KTX2 && hasUncompressedTextures;

  await doc.transform(
    dedup(),
    prune({ keepLeaves: true }),
    ...(encodeTextures
      ? [
          ktx2({
            slots: /^(baseColorTexture|emissiveTexture)$/,
            isUASTC: false,
            isPerceptual: true,
            isSetKTX2SRGBTransferFunc: true,
            qualityLevel: 192,
            compressionLevel: 2,
            generateMipmap: true,
            enableDebug: false,
            imageDecoder,
          }),
          ktx2({
            slots: /^normalTexture$/,
            isUASTC: false,
            isNormalMap: true,
            isPerceptual: false,
            isSetKTX2SRGBTransferFunc: false,
            qualityLevel: 255,
            generateMipmap: true,
            enableDebug: false,
            imageDecoder,
          }),
          ktx2({
            slots: /^(metallicRoughnessTexture|occlusionTexture)$/,
            isUASTC: false,
            isPerceptual: false,
            isSetKTX2SRGBTransferFunc: false,
            qualityLevel: 160,
            compressionLevel: 2,
            generateMipmap: true,
            enableDebug: false,
            imageDecoder,
          }),
        ]
      : []),
    ...(NO_DRACO
      ? [
          (d) =>
            d
              .getRoot()
              .listExtensionsUsed()
              .find((e) => e.extensionName === 'KHR_draco_mesh_compression')
              ?.dispose(),
        ]
      : [
          draco({
            quantizePosition: 14,
            quantizeNormal: 10,
            quantizeTexcoord: 12,
            quantizeGeneric: 14,
          }),
        ])
  );

  await io.write(filePath, doc);
  const after = fs.statSync(filePath).size;
  const root = doc.getRoot();
  console.log(
    `${path.relative(process.cwd(), filePath)}: ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB, ` +
      `${root.listMaterials().length} material(s), ${root.listTextures().length} texture(s)`
  );
  return { before, after };
}

function collectWorldGlbs() {
  const targets = [];
  for (const subdir of ['terrain', 'landmarks']) {
    const dir = path.join(OUT_DIR, subdir);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.glb')) targets.push(path.join(dir, f));
    }
  }
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.startsWith('air_') && f.endsWith('.glb')) {
      targets.push(path.join(OUT_DIR, f));
    }
  }
  return targets.sort();
}

const args = process.argv.slice(2);
const NO_KTX2 = args.includes('--no-ktx2');
const NO_DRACO = args.includes('--no-draco');
const NO_SIMPLIFY = args.includes('--no-simplify');
const WORLD_MODE = args.includes('--world');
const SIMPLIFY_EXISTING = args.includes('--simplify-existing');
const requested = args.filter((a) => !a.startsWith('--'));

/**
 * Simplifies an already optimized public/models/<name>.glb in place (textures untouched).
 * For models whose Blender source no longer passes the full pipeline (tank_player).
 */
async function simplifyExisting(name) {
  const file = path.join(OUT_DIR, `${name}.glb`);
  const doc = await io.read(file);
  const before = fs.statSync(file).size;
  const simplified = await simplifyTank(doc);
  await doc.transform(
    draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 15, quantizeGeneric: 14 })
  );
  await io.write(file, doc);
  console.log(
    `${name}: ${(before / 1e6).toFixed(2)} MB -> ${(fs.statSync(file).size / 1e6).toFixed(2)} MB, ` +
      `${simplified.before} -> ${simplified.after} triangles (error ${simplified.error})`
  );
}

if (SIMPLIFY_EXISTING) {
  for (const name of requested) await simplifyExisting(name);
} else if (WORLD_MODE) {
  const files = requested.length ? requested : collectWorldGlbs();
  let totalBefore = 0;
  let totalAfter = 0;
  for (const file of files) {
    const { before, after } = await optimizeWorldGlb(file);
    totalBefore += before;
    totalAfter += after;
  }
  console.log(
    `World GLBs total: ${(totalBefore / 1e6).toFixed(2)} MB -> ${(totalAfter / 1e6).toFixed(2)} MB ` +
      `(-${(((totalBefore - totalAfter) / Math.max(1, totalBefore)) * 100).toFixed(1)}%)`
  );
} else {
  const names = requested.length
    ? requested
    : fs
        .readdirSync(SRC_ROOT)
        .map((dir) => `tank_${dir}`)
        .filter((name) => fs.existsSync(path.join(SRC_ROOT, name.replace(/^tank_/, ''), `${name}.glb`)));
  for (const name of names) await optimize(name);
}
