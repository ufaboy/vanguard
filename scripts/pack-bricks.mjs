/** Packs the Blender damage states of a tile type into one GLB: `node scripts/pack-bricks.mjs [brick|concrete]`. */
import { Document, NodeIO } from '@gltf-transform/core';
import { dedup, mergeDocuments, prune, unpartition } from '@gltf-transform/functions';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const kind = process.argv[2] || 'brick';
if (!['brick', 'concrete'].includes(kind)) throw new Error(`Unknown tile type: ${kind}`);
const io = new NodeIO();
const document = new Document();
const scene = document.createScene(`${kind[0].toUpperCase()}${kind.slice(1)}States`);
const sourceDir = new URL(`../assets/blender/${kind}/`, import.meta.url);
const { states } = JSON.parse(await readFile(new URL('manifest.json', sourceDir), 'utf8'));
for (const { file } of states) {
  const source = await io.read(fileURLToPath(new URL(file, sourceDir)));
  const map = mergeDocuments(document, source);
  for (const sourceScene of source.getRoot().listScenes()) {
    const merged = map.get(sourceScene);
    for (const node of [...merged.listChildren()]) scene.addChild(node);
    merged.dispose();
  }
}
document.getRoot().setDefaultScene(scene);
await document.transform(unpartition(), dedup(), prune());
await mkdir('public/models/terrain', { recursive: true });
await io.write(`public/models/terrain/${kind}.glb`, document);
console.log(`Packed ${states.length} ${kind.toUpperCase()} states with one shared atlas/material.`);
