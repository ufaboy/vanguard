/** Map JSON loading, parsing, serialization, and File System Access / download saving. */
import { TileType } from '/public/src/game/terrains/surfaces.js';
import {
  GRID_SIZE,
  OBJECT_CHAR_TO_TILE,
  OBJECT_TILE_TO_CHAR,
  SURFACE_CHAR_TO_TILE,
  SURFACE_TILE_TO_CHAR,
} from './catalog.js';

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
    powerups: [],
    landmarks3d: [],
    surfaceLayout: Array.from({ length: GRID_SIZE }, () => '.'.repeat(GRID_SIZE)),
    objectLayout: Array.from({ length: GRID_SIZE }, () => '.'.repeat(GRID_SIZE)),
  };
}

export function parseMapState(rawJson) {
  const size = rawJson.gridSize || GRID_SIZE;
  const surfaceGrid = Array.from({ length: size }, () => Array(size).fill(TileType.EMPTY));
  const objectGrid = Array.from({ length: size }, () => Array(size).fill(null));

  const rawSurface = rawJson.surfaceLayout || [];
  const rawObject = rawJson.objectLayout || [];
  for (let r = 0; r < size; r++) {
    const sRow = rawSurface[r];
    const oRow = rawObject[r];
    for (let c = 0; c < size; c++) {
      const sTok = sRow?.[c];
      if (typeof sTok === 'number') {
        surfaceGrid[r][c] = sTok;
      } else if (typeof sTok === 'string') {
        surfaceGrid[r][c] =
          SURFACE_CHAR_TO_TILE[sTok] ?? SURFACE_CHAR_TO_TILE[sTok.toUpperCase()] ?? TileType.EMPTY;
      }

      const oTok = oRow?.[c];
      if (typeof oTok === 'number') {
        objectGrid[r][c] = oTok === TileType.EMPTY ? null : oTok;
      } else if (typeof oTok === 'string') {
        objectGrid[r][c] =
          OBJECT_CHAR_TO_TILE[oTok] ?? OBJECT_CHAR_TO_TILE[oTok.toUpperCase()] ?? null;
      }
    }
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
    powerups: structuredClone(rawJson.powerups || []),
    landmarks3d: structuredClone(rawJson.landmarks3d || []),
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
  out.powerups = structuredClone(state.powerups);
  if (state.landmarks3d.length > 0 || out.landmarks3d !== undefined) {
    out.landmarks3d = structuredClone(state.landmarks3d);
  }
  out.surfaceLayout = state.surfaceGrid.map((row) =>
    row.map((tile) => SURFACE_TILE_TO_CHAR.get(tile) ?? '.').join('')
  );
  out.objectLayout = state.objectGrid.map((row) =>
    row.map((tile) => OBJECT_TILE_TO_CHAR.get(tile) ?? '.').join('')
  );
  return JSON.stringify(out, null, 2) + '\n';
}

export async function saveJsonWithPicker(jsonText, suggestedName, existingHandle = null) {
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
  const writable = await handle.createWritable();
  await writable.write(jsonText);
  await writable.close();
  return { handle, method: 'fs' };
}

export function downloadJson(jsonText, fileName) {
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
