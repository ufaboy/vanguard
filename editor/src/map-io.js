/** Map JSON loading, parsing, serialization, and File System Access / download saving. */
import { TileType } from '/public/src/game/terrains/surfaces.js';
import { unpackTerrain } from '/public/src/game/terrains/terrain-format.js';
import { computeBridgeLayout } from './bridge-layout.js';
import { computeBuildingLayout } from './building-layout.js';
import { packTerrain, formatMapJson } from './terrain-pack.js';
import { GRID_SIZE } from './catalog.js';

const MAP_COLLECTIONS = [
  { label: 'Campaign', indexUrl: '/public/maps/campaign/index.json' },
  {
    label: 'Survival',
    staticFiles: [
      'maps/survival/iron-crucible.json',
      'maps/survival/paris-last-stand.json',
    ],
  },
  {
    label: 'Contracts',
    staticFiles: [
      'maps/contracts/blackout-protocol.json',
      'maps/contracts/last-cargo.json',
    ],
  },
];

export async function fetchMapCatalog() {
  const groups = [];
  for (const col of MAP_COLLECTIONS) {
    try {
      let relPaths = col.staticFiles || [];
      if (col.indexUrl) {
        const res = await fetch(col.indexUrl);
        if (!res.ok) continue;
        const data = await res.json();
        relPaths = data.maps || [];
      }
      const items = relPaths.map((relPath) => {
        const clean = relPath.replace(/^\.\//, '');
        const url = `/public/${clean}`;
        const fileName = clean.split('/').pop();
        return { label: fileName.replace(/\.json$/, ''), url, fileName };
      });
      groups.push({ group: col.label, items });
    } catch {
      // Ignore missing collections
    }
  }
  return groups;
}

export function createBlankMap() {
  return {
    id: 999,
    mapId: 'custom-map',
    code: 'CUSTOM // 40×40',
    name: 'Untitled Sector',
    subtitle: 'Custom tactical sector.',
    gameMode: 'extermination',
    gridSize: GRID_SIZE,
    tileSize: 2,
    baseCell: { row: 39, col: 19 },
    playerSpawnCell: { row: 35, col: 19 },
    environment: {
      theme: 'urban',
      tint: '#d6e7a0',
      fogColor: '#18212a',
      groundColor: '#687478',
    },
    defaultSurface: 'asphalt',
    terrain: {},
  };
}

export function parseMapState(rawJson) {
  const size = rawJson.gridSize || GRID_SIZE;
  const {
    surfaceGrid,
    objectGrid,
    landmarks3d,
    powerups,
    mines,
    mineSigns,
    decals,
  } = unpackTerrain(rawJson.terrain, size);

  let decoration = rawJson.decoration ? structuredClone(rawJson.decoration) : null;
  if (decals.length > 0) {
    decoration = {
      version: 1,
      seed: 1,
      theme: rawJson.environment?.theme || 'urban',
      ...(decoration || {}),
      landmarks: decals,
    };
  }

  return {
    raw: structuredClone(rawJson),
    size,
    surfaceGrid,
    objectGrid,
    baseCell: {
      row: rawJson.baseCell?.row ?? 39,
      col: rawJson.baseCell?.col ?? 19,
    },
    playerSpawnCell: {
      row: rawJson.playerSpawnCell?.row ?? 35,
      col: rawJson.playerSpawnCell?.col ?? 19,
    },
    powerups,
    landmarks3d,
    mines,
    mineSigns,
    decoration,
    environment: {
      theme: rawJson.environment?.theme || 'urban',
      tint: rawJson.environment?.tint || '#d6e7a0',
      fogColor: rawJson.environment?.fogColor || '#18212a',
      groundColor: rawJson.environment?.groundColor || '#687478',
    },
    meta: {
      name: rawJson.name || 'Untitled Sector',
      code: rawJson.code || '',
      subtitle: rawJson.subtitle || '',
      gameMode: rawJson.gameMode || 'extermination',
    },
  };
}

export function serializeMapState(state) {
  const out = structuredClone(state.raw);
  out.gridSize = state.size;
  out.name = state.meta.name;
  out.code = state.meta.code;
  out.subtitle = state.meta.subtitle;
  out.gameMode = state.meta.gameMode;
  out.baseCell = { row: state.baseCell.row, col: state.baseCell.col };
  out.playerSpawnCell = { row: state.playerSpawnCell.row, col: state.playerSpawnCell.col };
  out.environment = {
    ...(out.environment || {}),
    ...state.environment,
  };

  delete out.surfaceLayout;
  delete out.objectLayout;
  delete out.bridges;
  delete out.buildings;
  delete out.landmarks3d;
  delete out.powerups;
  delete out.mines;
  delete out.mineSigns;

  if (state.decoration) {
    const deco = structuredClone(state.decoration);
    delete deco.landmarks;
    const hasProcedural =
      (Array.isArray(deco.zones) && deco.zones.length > 0) ||
      (Array.isArray(deco.paths) && deco.paths.length > 0) ||
      (Array.isArray(deco.exclusions) && deco.exclusions.length > 0);
    if (hasProcedural) {
      out.decoration = deco;
    } else {
      delete out.decoration;
    }
  } else {
    delete out.decoration;
  }

  const bridges = computeBridgeLayout(state.objectGrid, state.surfaceGrid);
  const buildingLayout = computeBuildingLayout(
    state.objectGrid,
    state.environment?.theme || 'urban'
  );
  out.terrain = packTerrain({
    surfaceGrid: state.surfaceGrid,
    objectGrid: state.objectGrid,
    bridges,
    buildingLayout,
    landmarks3d: state.landmarks3d || [],
    powerups: state.powerups || [],
    mines: state.mines || [],
    mineSigns: state.mineSigns || [],
    decals: state.decoration?.landmarks || [],
  });

  return formatMapJson(out);
}

export async function saveJsonWithPicker(jsonText, suggestedName, existingHandle = null) {
  if (!jsonText || jsonText.length < 2) {
    throw new Error('Serialized map JSON is empty');
  }
  if (!window.showSaveFilePicker) {
    downloadJson(jsonText, suggestedName);
    return { handle: null, method: 'download' };
  }
  const handle =
    existingHandle ||
    (await window.showSaveFilePicker({
      suggestedName,
      types: [{ description: 'JSON Map File', accept: { 'application/json': ['.json'] } }],
    }));

  let writable = null;
  try {
    writable = await handle.createWritable();
    await writable.write(new TextEncoder().encode(jsonText));
    await writable.close();
    return { handle, method: 'fs' };
  } catch (err) {
    await writable?.abort?.().catch(() => {});
    downloadJson(jsonText, suggestedName);
    return { handle: null, method: 'download', fallbackError: err?.message };
  }
}

export function downloadJson(jsonText, fileName) {
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
