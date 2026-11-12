import { Document, NodeIO } from '@gltf-transform/core';
import { dedup, mergeDocuments, prune, unpartition } from '@gltf-transform/functions';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const io = new NodeIO();
const document = new Document();
const scene = document.createScene('BrickStates');
for (let hp = 0; hp <= 4; hp++) {
  const source = await io.read(fileURLToPath(new URL(`../assets/blender/brick/brick_hp_${hp}.glb`, import.meta.url)));
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
await io.write('public/models/terrain/brick.glb', document);
console.log('Packed BRICK states with one shared atlas/material.');
