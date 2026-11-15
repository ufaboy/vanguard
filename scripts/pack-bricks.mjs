import { Document, NodeIO } from '@gltf-transform/core';
import { dedup, mergeDocuments, prune, unpartition } from '@gltf-transform/functions';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const io = new NodeIO();
const document = new Document();
const scene = document.createScene('BrickStates');
const brickDir = new URL('../assets/blender/brick/', import.meta.url);
const { states } = JSON.parse(await readFile(new URL('manifest.json', brickDir), 'utf8'));
for (const { file } of states) {
  const source = await io.read(fileURLToPath(new URL(file, brickDir)));
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
console.log(`Packed ${states.length} BRICK states with one shared atlas/material.`);
