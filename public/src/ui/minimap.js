import { GRID_SIZE, RADAR_RANGE_CELLS, TILE_SIZE } from '../game/constants.js';
import { GameStatus } from '../game/types.js';
import { t } from '../i18n/index.js';
import { setAttr, setHidden, setHtml, syncPool } from './dom-helpers.js';

const MINIMAP_SKELETON = `
  <div class="hud-radar-wrap">
    <div class="hud-radar-screen">
      <svg viewBox="0 0 100 100" class="w-full h-full">
        <circle cx="50" cy="50" r="16" fill="none" stroke="rgba(74, 222, 128, 0.22)" stroke-width="0.7" />
        <circle cx="50" cy="50" r="32" fill="none" stroke="rgba(74, 222, 128, 0.22)" stroke-width="0.7" />
        <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(74, 222, 128, 0.35)" stroke-width="0.9" />
        <line x1="50" y1="2" x2="50" y2="98" stroke="rgba(74, 222, 128, 0.2)" stroke-width="0.6" />
        <line x1="2" y1="50" x2="98" y2="50" stroke="rgba(74, 222, 128, 0.2)" stroke-width="0.6" />
        <rect data-mm="hq" x="47" y="47" width="6" height="6" rx="1" fill="#38bdf8" opacity="0.9" />
        <g data-mm="contract"></g>
        <g data-mm="loot"></g>
        <g data-mm="contacts"></g>
        <g data-mm="player">
          <line data-mm="camera" x1="0" y1="0" stroke="#64748b" stroke-width="0.9" stroke-dasharray="1.5 1.5" />
          <g data-mm="hull"><rect x="-3.4" y="-4.4" width="6.8" height="8.8" rx="1.2" fill="#22c55e" stroke="#052e16" stroke-width="0.8" /></g>
          <g data-mm="turret"><line x1="0" y1="0" x2="0" y2="7.5" stroke="#bbf7d0" stroke-width="1.3" stroke-linecap="round" /><circle cx="0" cy="0" r="2.2" fill="#4ade80" /></g>
        </g>
      </svg>
    </div>
    <div data-mm="footer" class="hud-radar-meta"></div>
  </div>
`;

/**
 * The minimap is built once; each HUD tick only moves the existing SVG nodes, so moving
 * contacts no longer re-create the whole map several times per second.
 */
export function renderNorthUpSensorMinimap(hud) {
  const el = document.getElementById('sensor-minimap');
  if (!el) return;

  if (hud.status !== GameStatus.PLAYING && hud.status !== GameStatus.PAUSED) {
    setHidden(el, true);
    return;
  }
  setHidden(el, false);

  setHtml(el, MINIMAP_SKELETON);
  if (!el.__mm) {
    el.__mm = {};
    el.querySelectorAll('[data-mm]').forEach((node) => (el.__mm[node.dataset.mm] = node));
  }
  const mm = el.__mm;

  const halfArena = (GRID_SIZE * TILE_SIZE) / 2;
  const RADAR_RADIUS = 45;
  const RADAR_RANGE = RADAR_RANGE_CELLS * TILE_SIZE;
  const playerX = hud.playerX || 0;
  const playerZ = hud.playerZ || 0;
  const toRadar = (wx, wz) => {
    const nx = ((wx - playerX) / RADAR_RANGE) * RADAR_RADIUS;
    const ny = ((wz - playerZ) / RADAR_RANGE) * RADAR_RADIUS;
    const dist = Math.hypot(nx, ny);
    if (dist > RADAR_RADIUS) {
      const scale = RADAR_RADIUS / dist;
      return { x: 50 + nx * scale, y: 50 + ny * scale, clamped: true };
    }
    return { x: 50 + nx, y: 50 + ny, clamped: false };
  };
  const fmt = (v) => v.toFixed(1);

  const hullDeg = ((hud.playerHullAngle || 0) * 180) / Math.PI;
  const turretDeg = ((hud.playerTurretAngle || 0) * 180) / Math.PI;
  const camDeg = ((hud.cameraAzimuth || 0) * 180) / Math.PI;

  if (mm.hq) {
    const baseCenter = hud.baseCenter || { x: 0, z: (GRID_SIZE / 2 - 1.5) * TILE_SIZE };
    const hqPos = toRadar(baseCenter.x, baseCenter.z);
    setAttr(mm.hq, 'x', fmt(hqPos.x - 3));
    setAttr(mm.hq, 'y', fmt(hqPos.y - 3));
    const hqOpacity = hud.baseAlive === false ? 0.25 : hqPos.clamped ? 0.65 : 0.9;
    setAttr(mm.hq, 'opacity', hqOpacity.toFixed(2));
  }

  const contacts = hud.sensorContacts || [];
  const contactNodes = syncPool(mm.contacts, 'circle', contacts.length);
  contacts.forEach((c, i) => {
    const node = contactNodes[i];
    const pos = toRadar(c.x, c.z);
    const baseOpacity = c.active ? 1.0 : Math.max(0.25, 1 - (c.age || 0) / 5.0);
    const opacity = pos.clamped ? baseOpacity * 0.75 : baseOpacity;
    const fill = c.active ? '#ef4444' : '#f59e0b';
    setAttr(node, 'cx', fmt(pos.x));
    setAttr(node, 'cy', fmt(pos.y));
    setAttr(node, 'r', c.active ? 3.2 : 2.5);
    setAttr(node, 'fill', fill);
    setAttr(node, 'fill-opacity', opacity.toFixed(2));
    setAttr(node, 'stroke', '#0b0f17');
    setAttr(node, 'stroke-width', 0.8);
  });

  const loot = (hud.lootContainers || []).filter((l) => l.status === 'dropped');
  const lootNodes = syncPool(mm.loot, 'rect', loot.length);
  loot.forEach((l, i) => {
    const node = lootNodes[i];
    const pos = toRadar(l.x, l.z);
    setAttr(node, 'x', fmt(pos.x - 1.8));
    setAttr(node, 'y', fmt(pos.y - 1.8));
    setAttr(node, 'width', 3.6);
    setAttr(node, 'height', 3.6);
    setAttr(node, 'fill', '#fbbf24');
  });

  if (mm.contract) {
    if (hud.contract?.containers?.length) {
      const cellToWorld = (cell) => (cell + 0.5) * TILE_SIZE - halfArena;
      const isSabotage = Boolean(hud.contract.isSabotage);
      const pad = hud.contract.deliveryPad;
      const padCenterX = ((pad.minCol + pad.maxCol + 1) * 0.5) * TILE_SIZE - halfArena;
      const padCenterZ = ((pad.minRow + pad.maxRow + 1) * 0.5) * TILE_SIZE - halfArena;
      const padPos = toRadar(padCenterX, padCenterZ);
      const padW = (((pad.maxCol - pad.minCol + 1) * TILE_SIZE) / RADAR_RANGE) * RADAR_RADIUS;
      const padH = (((pad.maxRow - pad.minRow + 1) * TILE_SIZE) / RADAR_RANGE) * RADAR_RADIUS;
      const cargoMarks = hud.contract.containers
        .map((c) => {
          const pos = toRadar(cellToWorld(c.col), cellToWorld(c.row));
          const color =
            c.status === 'delivered'
              ? '#10b981'
              : c.status === 'armed'
              ? '#f43f5e'
              : c.status === 'carried' || c.status === 'unloading'
              ? '#fbbf24'
              : isSabotage
              ? '#a855f7'
              : '#38bdf8';
          return `<rect x="${(pos.x - 2.6).toFixed(1)}" y="${(pos.y - 2.6).toFixed(1)}" width="5.2" height="5.2" rx="0.8" fill="${color}" stroke="#0b0f17" stroke-width="0.7" />`;
        })
        .join('');
      setHtml(
        mm.contract,
        `<rect x="${(padPos.x - padW / 2).toFixed(1)}" y="${(padPos.y - padH / 2).toFixed(1)}" width="${padW.toFixed(1)}" height="${padH.toFixed(1)}" fill="#10b981" fill-opacity="0.28" stroke="#34d399" stroke-width="0.8" />${cargoMarks}`
      );
    } else {
      setHtml(mm.contract, '');
    }
  }

  setAttr(mm.player, 'transform', 'translate(50, 50)');
  setAttr(mm.camera, 'x2', fmt(Math.sin(hud.cameraAzimuth || 0) * 12));
  setAttr(mm.camera, 'y2', fmt(Math.cos(hud.cameraAzimuth || 0) * 12));
  setAttr(mm.hull, 'transform', `rotate(${fmt(-hullDeg)})`);
  setAttr(mm.turret, 'transform', `rotate(${fmt(-turretDeg)})`);

  const footer = hud.radarJammed
    ? `${t('ECM JAMMED')} · ${t('CAM')} ${Math.round(camDeg)}°`
    : `${t('CAM')} ${Math.round(camDeg)}°`;
  if (mm.footer.textContent !== footer) mm.footer.textContent = footer;
  mm.footer.classList.remove('text-teal-300', 'text-purple-300', 'text-slate-500');
  mm.footer.classList.add(hud.radarJammed ? 'text-purple-300' : 'text-slate-500');
}

