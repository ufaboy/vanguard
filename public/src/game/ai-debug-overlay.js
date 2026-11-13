/** F3 AI telemetry overlay: world-space labels and A* path lines for enemies. */

import * as THREE from 'three';
import { GRID_SIZE, TILE_SIZE } from './levels.js';

export class AiDebugOverlay {
  constructor(engine) {
    this.engine = engine;
  }

  update() {
    const engine = this.engine;
    if (!engine.aiDebugMode) {
      if (engine.aiDebugEntries) this.clear();
      return;
    }
    if (!engine.aiDebugGroup) {
      engine.aiDebugGroup = new THREE.Group();
      engine.scene.add(engine.aiDebugGroup);
      engine.aiDebugEntries = new Map();
    }
    const alive = new Set();
    const half = (GRID_SIZE * TILE_SIZE) / 2;
    for (const e of engine.enemies) {
      alive.add(e.id);
      let entry = engine.aiDebugEntries.get(e.id);
      if (!entry) entry = this.createEntry(e);

      const brain = e.brain;
      const token = engine.attackTokens?.has(e.id) ? ' FIRE' : '';
      const actions = this.actionSummary(e);
      const text = `${(brain?.role ?? '-').toUpperCase()} · ${(e.ai?.state ?? '-').toUpperCase()}${token}|${actions.move} · ${actions.shot}`;
      if (text !== entry.text) this.drawLabel(entry, text, Boolean(token));
      entry.sprite.position.set(e.x, e.isBoss ? 3.6 : 2.6, e.z);

      const pos = entry.line.geometry.attributes.position;
      let n = 0;
      pos.setXYZ(n++, e.x, 0.25, e.z);
      const brainDriving = brain && brain.tactic !== 'idle';
      const route = brainDriving ? brain : e.movePlan;
      if (route && !route.direct) {
        for (let k = route.pathIdx; k < route.path.length && n < pos.count; k++) {
          const wp = route.path[k];
          pos.setXYZ(n++, wp.col * TILE_SIZE - half + TILE_SIZE / 2, 0.25, wp.row * TILE_SIZE - half + TILE_SIZE / 2);
        }
      } else if (brain?.direct) {
        pos.setXYZ(n++, engine.playerX, 0.25, engine.playerZ);
      }
      pos.needsUpdate = true;
      entry.line.geometry.setDrawRange(0, n);
      entry.line.visible = n > 1;
    }
    for (const [id, entry] of engine.aiDebugEntries) {
      if (!alive.has(id)) {
        this.disposeEntry(entry);
        engine.aiDebugEntries.delete(id);
      }
    }
  }

  createEntry(e) {
    const engine = this.engine;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })
    );
    sprite.scale.set(5.2, 0.975, 1);
    sprite.renderOrder = 999;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xa855f7, depthTest: false, transparent: true, opacity: 0.85 })
    );
    line.renderOrder = 998;
    line.frustumCulled = false;
    engine.aiDebugGroup.add(sprite, line);
    const entry = { canvas, texture, sprite, line, text: '' };
    engine.aiDebugEntries.set(e.id, entry);
    return entry;
  }

  /** Current movement order and shot with their dice results, for the F3 overlay and HUD. */
  actionSummary(e) {
    const plan = e.movePlan;
    const shot = e.gunner?.shot;
    return {
      move: plan ? `${plan.id.toUpperCase()} ${plan.success ? 'OK' : 'FAIL'}` : 'HOLD',
      shot: shot ? `${shot.actionId.toUpperCase()} ${shot.hit ? 'HIT' : 'MISS'}` : 'NO SHOT',
    };
  }

  drawLabel(entry, text, hasToken) {
    entry.text = text;
    const [top, bottom] = text.split('|');
    const ctx = entry.canvas.getContext('2d');
    ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
    ctx.fillStyle = 'rgba(11, 15, 23, 0.92)';
    ctx.fillRect(0, 0, entry.canvas.width, entry.canvas.height);
    ctx.strokeStyle = hasToken ? '#f97316' : '#a855f7';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, entry.canvas.width - 4, entry.canvas.height - 4);
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e9d5ff';
    ctx.fillText(top, entry.canvas.width / 2, 40, entry.canvas.width - 16);
    ctx.font = '26px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(bottom, entry.canvas.width / 2, 78, entry.canvas.width - 16);
    entry.texture.needsUpdate = true;
  }

  disposeEntry(entry) {
    this.engine.aiDebugGroup?.remove(entry.sprite, entry.line);
    entry.texture.dispose();
    entry.sprite.material.dispose();
    entry.line.geometry.dispose();
    entry.line.material.dispose();
  }

  clear() {
    const engine = this.engine;
    if (engine.aiDebugEntries) {
      for (const entry of engine.aiDebugEntries.values()) this.disposeEntry(entry);
    }
    if (engine.aiDebugGroup) engine.scene?.remove(engine.aiDebugGroup);
    engine.aiDebugGroup = null;
    engine.aiDebugEntries = null;
  }
}

