import { GRID_SIZE, RADAR_RANGE_CELLS, TILE_SIZE } from '../game/constants.js';
import { GameStatus, TileType } from '../game/types.js';
import { t } from '../i18n/index.js';
import { setAttr, setHidden, setHtml, syncPool } from './dom-helpers.js';

const R_CENTER = 100;
const R_MAP = 80;
const R_BEZEL = 86;
const R_OUTER = 92;
const R_CARDINAL = 89;
const TERRAIN_CELL_PX = 6;
const TERRAIN_CANVAS_PX = GRID_SIZE * TERRAIN_CELL_PX;
const FOV_HALF_ANGLE_RAD = (42 * Math.PI) / 180;
const DEFAULT_CAMERA_AZIMUTH = Math.PI * 0.25;

function getRadarCameraRotationRad(cameraAzimuth) {
  const azimuth = Number.isFinite(cameraAzimuth) ? cameraAzimuth : DEFAULT_CAMERA_AZIMUTH;
  return azimuth - DEFAULT_CAMERA_AZIMUTH;
}

function buildCompassTicksSvg() {
  const parts = [];
  for (let deg = 0; deg < 360; deg += 5) {
    if (deg % 90 === 0) continue;
    const rad = ((deg - 90) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const isDiagonal = deg % 45 === 0;
    const isMajor = deg % 15 === 0;
    const rIn = isDiagonal ? 77 : 80.5;
    const rOut = isDiagonal ? 89.5 : isMajor ? 86.5 : 83.5;
    const stroke = isDiagonal
      ? 'rgba(255, 255, 255, 0.82)'
      : isMajor
      ? 'rgba(255, 255, 255, 0.45)'
      : 'rgba(255, 255, 255, 0.24)';
    const width = isDiagonal ? '1.35' : isMajor ? '0.9' : '0.55';
    parts.push(
      `<line x1="${(R_CENTER + cos * rIn).toFixed(2)}" y1="${(R_CENTER + sin * rIn).toFixed(2)}" x2="${(
        R_CENTER +
        cos * rOut
      ).toFixed(2)}" y2="${(R_CENTER + sin * rOut).toFixed(2)}" stroke="${stroke}" stroke-width="${width}" />`
    );
  }
  return parts.join('');
}

function buildCardinalBadge(cx, cy, label, key) {
  return `
    <g data-mm="${key}" transform="translate(${cx}, ${cy})">
      <polygon points="-8,-6.5 8,-6.5 9.5,-4.5 9.5,4.5 8,6.5 -8,6.5 -9.5,4.5 -9.5,-4.5" fill="#15191e" stroke="rgba(255,255,255,0.22)" stroke-width="0.9" />
      <text x="0" y="0.4" text-anchor="middle" dominant-baseline="central" fill="#f8fafc" font-size="10.5" font-weight="800" font-family="system-ui, -apple-system, sans-serif">${label}</text>
    </g>
  `;
}

const FOV_END_X = (Math.sin(FOV_HALF_ANGLE_RAD) * (R_MAP - 1)).toFixed(2);
const FOV_END_Y = (-Math.cos(FOV_HALF_ANGLE_RAD) * (R_MAP - 1)).toFixed(2);
const FOV_PATH = `M 0 0 L -${FOV_END_X} ${FOV_END_Y} A ${R_MAP - 1} ${R_MAP - 1} 0 0 1 ${FOV_END_X} ${FOV_END_Y} Z`;

const MINIMAP_SKELETON = `
  <div class="hud-radar-wrap" data-mm="wrap">
    <div class="hud-radar-screen">
      <canvas data-mm="terrain" width="160" height="160" class="hud-radar-terrain"></canvas>
      <div class="hud-radar-vignette"></div>
      <div data-mm="ecmOverlay" class="hud-radar-ecm hidden"></div>
    </div>
    <svg viewBox="0 0 200 200" class="hud-radar-svg">
      <defs>
        <radialGradient id="radar-fov-grad" cx="0" cy="0" r="${R_MAP}" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="rgba(74, 222, 128, 0.42)" />
          <stop offset="55%" stop-color="rgba(74, 222, 128, 0.18)" />
          <stop offset="100%" stop-color="rgba(74, 222, 128, 0.02)" />
        </radialGradient>
        <clipPath id="radar-map-clip">
          <circle cx="${R_CENTER}" cy="${R_CENTER}" r="${R_MAP}" />
        </clipPath>
      </defs>

      <!-- Tactical Grid & FOV Cone (clipped to inner map circle) -->
      <g clip-path="url(#radar-map-clip)">
        <g transform="translate(${R_CENTER}, ${R_CENTER})">
          <g data-mm="fov">
            <path d="${FOV_PATH}" fill="url(#radar-fov-grad)" />
            <line x1="0" y1="0" x2="-${FOV_END_X}" y2="${FOV_END_Y}" stroke="rgba(134, 239, 172, 0.32)" stroke-width="0.6" />
            <line x1="0" y1="0" x2="${FOV_END_X}" y2="${FOV_END_Y}" stroke="rgba(134, 239, 172, 0.32)" stroke-width="0.6" />
          </g>
        </g>

        <circle cx="${R_CENTER}" cy="${R_CENTER}" r="${(R_MAP / 3).toFixed(1)}" fill="none" stroke="rgba(255, 255, 255, 0.22)" stroke-width="0.65" />
        <circle cx="${R_CENTER}" cy="${R_CENTER}" r="${((R_MAP * 2) / 3).toFixed(1)}" fill="none" stroke="rgba(255, 255, 255, 0.22)" stroke-width="0.65" />
        <line x1="${R_CENTER}" y1="${R_CENTER - R_MAP}" x2="${R_CENTER}" y2="${R_CENTER + R_MAP}" stroke="rgba(255, 255, 255, 0.22)" stroke-width="0.65" />
        <line x1="${R_CENTER - R_MAP}" y1="${R_CENTER}" x2="${R_CENTER + R_MAP}" y2="${R_CENTER}" stroke="rgba(255, 255, 255, 0.22)" stroke-width="0.65" />

        <g data-mm="contract"></g>
        <rect data-mm="hq" x="97" y="97" width="6" height="6" rx="0.8" fill="#22c55e" stroke="#052e16" stroke-width="0.7" />
        <g data-mm="loot"></g>
        <g data-mm="mines"></g>
        <g data-mm="contacts"></g>

        <!-- Player Tank Silhouette (centered) -->
        <g data-mm="player" transform="translate(${R_CENTER}, ${R_CENTER})">
          <g data-mm="hull">
            <rect x="-5.8" y="-7.6" width="2.2" height="15.2" rx="0.7" fill="#22c55e" stroke="#052e16" stroke-width="0.65" />
            <rect x="3.6" y="-7.6" width="2.2" height="15.2" rx="0.7" fill="#22c55e" stroke="#052e16" stroke-width="0.65" />
            <rect x="-4" y="-6.6" width="8" height="13.2" rx="1.2" fill="#4ade80" stroke="#052e16" stroke-width="0.75" />
            <rect x="-2.4" y="2.2" width="4.8" height="2.8" rx="0.5" fill="#16a34a" opacity="0.75" />
          </g>
          <g data-mm="turret">
            <rect x="-0.9" y="-13" width="1.8" height="10.8" rx="0.6" fill="#86efac" stroke="#052e16" stroke-width="0.55" />
            <rect x="-2.8" y="-3.2" width="5.6" height="6.4" rx="1.6" fill="#4ade80" stroke="#052e16" stroke-width="0.7" />
            <circle cx="0.6" cy="0.4" r="1.2" fill="#bbf7d0" stroke="#052e16" stroke-width="0.45" />
          </g>
        </g>
      </g>

      <!-- Dark Metallic Bezel & Compass Ticks -->
      <circle cx="${R_CENTER}" cy="${R_CENTER}" r="${R_BEZEL}" fill="none" stroke="rgba(16, 20, 24, 0.94)" stroke-width="12" />
      <circle cx="${R_CENTER}" cy="${R_CENTER}" r="${R_OUTER}" fill="none" stroke="#363d45" stroke-width="1.2" />
      <circle cx="${R_CENTER}" cy="${R_CENTER}" r="${R_MAP}" fill="none" stroke="rgba(255, 255, 255, 0.28)" stroke-width="0.85" />
      ${buildCompassTicksSvg()}

      <!-- Cardinal Badges -->
      ${buildCardinalBadge(R_CENTER, R_CENTER - R_CARDINAL, 'N', 'cardN')}
      ${buildCardinalBadge(R_CENTER + R_CARDINAL, R_CENTER, 'E', 'cardE')}
      ${buildCardinalBadge(R_CENTER, R_CENTER + R_CARDINAL, 'S', 'cardS')}
      ${buildCardinalBadge(R_CENTER - R_CARDINAL, R_CENTER, 'W', 'cardW')}
    </svg>

    <div class="hud-radar-scale">
      <span data-mm="scaleLabel" class="hud-radar-scale-text">500 m</span>
      <span class="hud-radar-scale-bar"></span>
    </div>
  </div>
`;

function cellHash(r, c) {
  let h = (r * 374761393 + c * 668265263) ^ 0x5bd1e995;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function renderOffscreenTerrain(grid) {
  if (!renderOffscreenTerrain.canvas) {
    const off = document.createElement('canvas');
    off.width = TERRAIN_CANVAS_PX;
    off.height = TERRAIN_CANVAS_PX;
    renderOffscreenTerrain.canvas = off;
  }
  const off = renderOffscreenTerrain.canvas;
  const ctx = off.getContext('2d');
  if (!ctx) return off;

  ctx.fillStyle = '#22301f';
  ctx.fillRect(0, 0, TERRAIN_CANVAS_PX, TERRAIN_CANVAS_PX);

  const s = TERRAIN_CELL_PX;
  for (let r = 0; r < GRID_SIZE; r++) {
    const row = grid[r];
    if (!row) continue;
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = row[c];
      if (!cell) continue;
      const x = c * s;
      const y = r * s;
      const surf = cell.surface;
      const type = cell.type;
      const n = cellHash(r, c);

      // Base surface layer
      if (surf === TileType.ROAD || type === TileType.BRIDGE) {
        ctx.fillStyle = '#3f4a35';
        ctx.fillRect(x, y, s, s);
      } else if (surf === TileType.SAND) {
        ctx.fillStyle = '#3c4028';
        ctx.fillRect(x, y, s, s);
      } else if (surf === TileType.SWAMP) {
        ctx.fillStyle = '#1b2b23';
        ctx.fillRect(x, y, s, s);
      } else if (surf === TileType.STONE) {
        ctx.fillStyle = '#353b37';
        ctx.fillRect(x, y, s, s);
      } else if (surf === TileType.OIL_SLICK) {
        ctx.fillStyle = '#1d2224';
        ctx.fillRect(x, y, s, s);
      } else {
        ctx.fillStyle = n > 0.55 ? '#263622' : n < 0.25 ? '#1e2b1b' : '#22301f';
        ctx.fillRect(x, y, s, s);
      }

      // Object / terrain feature layer
      if (type === TileType.WATER) {
        ctx.fillStyle = '#16282d';
        ctx.fillRect(x, y, s, s);
      } else if (type === TileType.ICE) {
        ctx.fillStyle = '#384c52';
        ctx.fillRect(x, y, s, s);
      } else if (type === TileType.FOREST) {
        ctx.fillStyle = '#152312';
        ctx.beginPath();
        ctx.arc(x + s * 0.45, y + s * 0.45, s * 0.56, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1b2e17';
        ctx.beginPath();
        ctx.arc(x + s * 0.65, y + s * 0.6, s * 0.38, 0, Math.PI * 2);
        ctx.fill();
      } else if (type === TileType.BRICK || type === TileType.HOUSE_1 || type === TileType.HOUSE_2) {
        ctx.fillStyle = '#4d534e';
        ctx.fillRect(x + 0.5, y + 0.5, s - 1, s - 1);
        ctx.fillStyle = '#353a36';
        ctx.fillRect(x + 1, y + s - 1.5, s - 1.5, 1.2);
      } else if (type === TileType.CONCRETE || type === TileType.LANDMARK || type === TileType.WATER_TOWER) {
        ctx.fillStyle = '#5a615c';
        ctx.fillRect(x + 0.4, y + 0.4, s - 0.8, s - 0.8);
      } else if (type === TileType.CRATER || type === TileType.RUBBLE) {
        ctx.fillStyle = '#2c2f26';
        ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
      } else if (type === TileType.RAIL) {
        ctx.fillStyle = '#3f3f46';
        ctx.fillRect(x, y, s, s);
      } else if (type === TileType.CONTAINER) {
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(x + 0.5, y + 0.5, s - 1, s - 1);
      } else if (type === TileType.TRANSFORMER) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(x + 0.5, y + 0.5, s - 1, s - 1);
      } else if (type === TileType.SANDBAGS) {
        ctx.fillStyle = '#c2a67d';
        ctx.fillRect(x + 0.5, y + 0.5, s - 1, s - 1);
      } else if (type === TileType.RAIL_CAR) {
        ctx.fillStyle = '#9a3412';
        ctx.fillRect(x + 0.4, y + 0.4, s - 0.8, s - 0.8);
      }
    }
  }
  return off;
}

function drawTerrainViewport(canvas, hud) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (!hud.terrainGrid?.length) {
    ctx.fillStyle = '#22301f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const sectorChanged = canvas.__sectorId !== hud.sectorId;
  const blocksChanged = canvas.__blocksDestroyed !== hud.blocksDestroyed;
  const stale = !canvas.__lastRenderAt || now - canvas.__lastRenderAt > 1000;

  if (sectorChanged || blocksChanged || stale) {
    renderOffscreenTerrain(hud.terrainGrid);
    canvas.__sectorId = hud.sectorId;
    canvas.__blocksDestroyed = hud.blocksDestroyed;
    canvas.__lastRenderAt = now;
  }

  const off = renderOffscreenTerrain.canvas;
  const halfArena = (GRID_SIZE * TILE_SIZE) / 2;
  const playerCellX = ((hud.playerX || 0) + halfArena) / TILE_SIZE;
  const playerCellZ = ((hud.playerZ || 0) + halfArena) / TILE_SIZE;
  const srcCenterX = playerCellX * TERRAIN_CELL_PX;
  const srcCenterY = playerCellZ * TERRAIN_CELL_PX;
  const srcHalf = RADAR_RANGE_CELLS * TERRAIN_CELL_PX;
  const camRotRad = getRadarCameraRotationRad(hud.cameraAzimuth);
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#182216';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.save();
  ctx.translate(w * 0.5, h * 0.5);
  ctx.rotate(camRotRad);
  ctx.drawImage(
    off,
    srcCenterX - srcHalf,
    srcCenterY - srcHalf,
    srcHalf * 2,
    srcHalf * 2,
    -w * 0.5,
    -h * 0.5,
    w,
    h
  );
  ctx.restore();
}

/**
 * The minimap is built once; each HUD tick only moves the existing SVG nodes and updates
 * the clipped terrain viewport, rotated to match the active camera angle (Camera-Up).
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

  if (mm.terrain) {
    drawTerrainViewport(mm.terrain, hud);
  }

  const halfArena = (GRID_SIZE * TILE_SIZE) / 2;
  const RADAR_RADIUS = R_MAP - 3;
  const RADAR_RANGE = RADAR_RANGE_CELLS * TILE_SIZE;
  const playerX = hud.playerX || 0;
  const playerZ = hud.playerZ || 0;
  const camRotRad = getRadarCameraRotationRad(hud.cameraAzimuth);
  const camRotDeg = (camRotRad * 180) / Math.PI;
  const cosCam = Math.cos(camRotRad);
  const sinCam = Math.sin(camRotRad);
  const toRadar = (wx, wz) => {
    const rawX = ((wx - playerX) / RADAR_RANGE) * RADAR_RADIUS;
    const rawY = ((wz - playerZ) / RADAR_RANGE) * RADAR_RADIUS;
    const nx = rawX * cosCam - rawY * sinCam;
    const ny = rawX * sinCam + rawY * cosCam;
    const dist = Math.hypot(nx, ny);
    if (dist > RADAR_RADIUS) {
      const scale = RADAR_RADIUS / dist;
      return { x: R_CENTER + nx * scale, y: R_CENTER + ny * scale, clamped: true };
    }
    return { x: R_CENTER + nx, y: R_CENTER + ny, clamped: false };
  };
  const fmt = (v) => v.toFixed(1);

  const hullDeg = ((hud.playerHullAngle || 0) * 180) / Math.PI;
  const turretDeg = ((hud.playerTurretAngle || 0) * 180) / Math.PI;

  const updateCardinal = (node, baseAngleRad) => {
    if (!node) return;
    const ang = baseAngleRad + camRotRad;
    const cx = R_CENTER + Math.cos(ang) * R_CARDINAL;
    const cy = R_CENTER + Math.sin(ang) * R_CARDINAL;
    setAttr(node, 'transform', `translate(${fmt(cx)}, ${fmt(cy)})`);
  };
  updateCardinal(mm.cardN, -Math.PI * 0.5);
  updateCardinal(mm.cardE, 0);
  updateCardinal(mm.cardS, Math.PI * 0.5);
  updateCardinal(mm.cardW, Math.PI);

  if (mm.hq) {
    const baseCenter = hud.baseCenter || { x: 0, z: (GRID_SIZE / 2 - 1.5) * TILE_SIZE };
    const hqPos = toRadar(baseCenter.x, baseCenter.z);
    setAttr(mm.hq, 'x', fmt(hqPos.x - 3));
    setAttr(mm.hq, 'y', fmt(hqPos.y - 3));
    const hqOpacity = hud.baseAlive === false ? 0.25 : hqPos.clamped ? 0.7 : 0.95;
    setAttr(mm.hq, 'opacity', hqOpacity.toFixed(2));
  }

  const mines = (hud.discoveredMines || []).filter(
    (m) => Math.hypot(m.x - playerX, m.z - playerZ) <= RADAR_RANGE
  );
  const mineNodes = syncPool(mm.mines, 'g', mines.length);
  mines.forEach((m, i) => {
    const node = mineNodes[i];
    if (!node.__built) {
      node.__built = true;
      node.innerHTML =
        '<circle cx="0" cy="0" r="3.1" fill="#f59e0b" stroke="#1c1917" stroke-width="0.75" />' +
        '<path d="M-1.5,-1.5 L1.5,1.5 M1.5,-1.5 L-1.5,1.5" stroke="#1c1917" stroke-width="0.9" stroke-linecap="round" />';
    }
    const pos = toRadar(m.x, m.z);
    setAttr(node, 'transform', `translate(${fmt(pos.x)}, ${fmt(pos.y)})`);
  });

  const contacts = hud.sensorContacts || [];
  const contactNodes = syncPool(mm.contacts, 'g', contacts.length);
  contacts.forEach((c, i) => {
    const node = contactNodes[i];
    if (!node.__built) {
      node.__built = true;
      node.innerHTML =
        '<polygon points="0,-4.4 4.4,0 0,4.4 -4.4,0" stroke="#1a0505" stroke-width="0.7" />' +
        '<polygon points="0,-8.8 3.2,-5.8 1.6,-5.8 0,-7.3 -1.6,-5.8 -3.2,-5.8" />';
    }
    const pos = toRadar(c.x, c.z);
    const baseOpacity = c.active ? 1.0 : Math.max(0.28, 1 - (c.age || 0) / 5.0);
    const opacity = pos.clamped ? baseOpacity * 0.78 : baseOpacity;
    const fill = c.active ? '#ef4444' : '#f97316';
    setAttr(node, 'transform', `translate(${fmt(pos.x)}, ${fmt(pos.y)})`);
    setAttr(node, 'fill', fill);
    setAttr(node, 'opacity', opacity.toFixed(2));
  });

  const loot = (hud.lootContainers || []).filter((l) => l.status === 'dropped');
  const lootNodes = syncPool(mm.loot, 'rect', loot.length);
  loot.forEach((l, i) => {
    const node = lootNodes[i];
    const pos = toRadar(l.x, l.z);
    setAttr(node, 'x', fmt(pos.x - 2.2));
    setAttr(node, 'y', fmt(pos.y - 2.2));
    setAttr(node, 'width', 4.4);
    setAttr(node, 'height', 4.4);
    setAttr(node, 'rx', 0.6);
    setAttr(node, 'fill', '#4ade80');
    setAttr(node, 'stroke', '#052e16');
    setAttr(node, 'stroke-width', 0.65);
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
          return `<rect x="${(pos.x - 2.8).toFixed(1)}" y="${(pos.y - 2.8).toFixed(1)}" width="5.6" height="5.6" rx="0.8" fill="${color}" stroke="#0b0f17" stroke-width="0.7" />`;
        })
        .join('');
      setHtml(
        mm.contract,
        `<rect x="${(padPos.x - padW / 2).toFixed(1)}" y="${(padPos.y - padH / 2).toFixed(1)}" width="${padW.toFixed(1)}" height="${padH.toFixed(1)}" transform="rotate(${fmt(camRotDeg)} ${padPos.x.toFixed(1)} ${padPos.y.toFixed(1)})" fill="#10b981" fill-opacity="0.28" stroke="#34d399" stroke-width="0.8" />${cargoMarks}`
      );
    } else {
      setHtml(mm.contract, '');
    }
  }

  setAttr(mm.hull, 'transform', `rotate(${fmt(180 - hullDeg + camRotDeg)})`);
  setAttr(mm.turret, 'transform', `rotate(${fmt(180 - turretDeg + camRotDeg)})`);
  if (mm.fov) {
    setAttr(mm.fov, 'transform', `rotate(${fmt(180 - turretDeg + camRotDeg)})`);
  }

  if (mm.ecmOverlay) {
    setHidden(mm.ecmOverlay, !hud.radarJammed);
  }
  if (mm.scaleLabel) {
    const label = hud.radarJammed ? t('ECM JAMMED') : '500 m';
    if (mm.scaleLabel.textContent !== label) {
      mm.scaleLabel.textContent = label;
      mm.scaleLabel.classList.toggle('is-jammed', Boolean(hud.radarJammed));
    }
  }
}
