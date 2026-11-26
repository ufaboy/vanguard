/** Main controller for the BATTLE TANK 3D Map Editor. */
import { TileType } from '/public/src/game/terrains/surfaces.js';
import { railCurveCells } from '/public/src/game/terrains/terrain-format.js';
import { validateRailroadLayout } from '/public/src/game/terrains/rail-rules.js';
import {
  DECORATIONS,
  LANDMARKS,
  MARKERS,
  OBJECTS,
  OBJECT_BY_TILE,
  SURFACES,
  SURFACE_BY_TILE,
} from './catalog.js';
import { HistoryStack } from './history.js';
import {
  createBlankMap,
  downloadJson,
  fetchMapCatalog,
  parseMapState,
  saveJsonWithPicker,
  serializeMapState,
} from './map-io.js';
import { Viewport3D } from './viewport3d.js';

const $ = (id) => document.getElementById(id);

class MapEditorApp {
  constructor() {
    this.history = new HistoryStack(50);
    this.state = parseMapState(createBlankMap());
    this.fileHandle = null;
    this.currentFileName = 'custom-map.json';
    this.currentMapRelPath = null;
    this.dirty = false;

    this.activeTab = 'surfaces';
    this.activeTool = 'brush'; // brush | move | rotate | eraser | eyedropper | rect | fill
    this.brushSize = 1;
    this.placementRotation = 0;
    this.hoveredCell = null;
    this.selectedSurface = TileType.ROAD;
    this.selectedObject = TileType.BRICK;
    this.selectedMarker = 'playerSpawn';
    this.selectedLandmark = 'CONCORDE_OBELISK';
    this.selectedDecoration = 'crosswalk';

    this.strokeSnapshot = null;
    this.rectStartCell = null;
    this.strokeChanged = false;
    this.moveDrag = null;

    this.viewport = new Viewport3D($('viewport'), {
      isEyedropperActive: () => this.activeTool === 'eyedropper',
      onHoverCell: (cell) => this._updateCellInspector(cell),
      onPointerDownCell: (cell, e) => this._onPointerDownCell(cell, e),
      onPointerDragCell: (cell) => this._onPointerDragCell(cell),
      onPointerUpCell: (cell) => this._onPointerUpCell(cell),
      onEyedropperCell: (cell) => this._pickFromCell(cell),
    });

    this._bindUI();
    this._renderPalette();
    this._loadState(this.state, { resetHistory: true, fileName: 'custom-map.json' });
    this._loadCatalog();
    this._loadMapFromQuery();
  }

  /** Loads a map JSON served by the editor's static server (catalog entry or `?map=` path). */
  async _loadMapUrl(url, fileName) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const relPath = url.replace(/^\//, '');
      this._loadState(parseMapState(json), { resetHistory: true, fileName, relPath });
      this._toast(`Loaded ${fileName}`);
    } catch (err) {
      this._toast(`Failed to load map: ${err.message}`);
    }
  }

  /** `?map=/public/maps/drafts/foo.json` opens any map under the repository root on startup. */
  _loadMapFromQuery() {
    const raw = new URLSearchParams(location.search).get('map');
    if (!raw) return;
    const url = raw.startsWith('/') ? raw : `/${raw}`;
    this._loadMapUrl(url, url.split('/').pop() || 'map.json');
  }

  async _loadCatalog() {
    const groups = await fetchMapCatalog();
    const select = $('map-select');
    for (const grp of groups) {
      const og = document.createElement('optgroup');
      og.label = grp.group;
      for (const item of grp.items) {
        const opt = document.createElement('option');
        opt.value = item.url;
        opt.textContent = item.label;
        opt.dataset.filename = item.fileName;
        og.appendChild(opt);
      }
      select.appendChild(og);
    }
  }

  _snapshot() {
    return JSON.stringify({
      surfaceGrid: this.state.surfaceGrid,
      objectGrid: this.state.objectGrid,
      tacticalStyles: (this.state.tacticalStyles || []).map((row) => Array.from(row)),
      objectRotations: (this.state.objectRotations || []).map((row) => Array.from(row)),
      baseCell: this.state.baseCell,
      playerSpawnCell: this.state.playerSpawnCell,
      powerups: this.state.powerups,
      props: this.state.props || [],
      railCurves: this.state.railCurves || [],
      landmarks3d: this.state.landmarks3d,
      decoration: this.state.decoration,
      environment: this.state.environment,
      meta: this.state.meta,
    });
  }

  _restoreSnapshot(jsonStr) {
    const data = JSON.parse(jsonStr);
    this.state.surfaceGrid = data.surfaceGrid;
    this.state.objectGrid = data.objectGrid;
    if (Array.isArray(data.tacticalStyles)) {
      this.state.tacticalStyles = data.tacticalStyles.map((row) => Int8Array.from(row));
    }
    if (Array.isArray(data.objectRotations)) {
      this.state.objectRotations = data.objectRotations.map((row) => Int16Array.from(row));
    }
    this.state.baseCell = data.baseCell;
    this.state.playerSpawnCell = data.playerSpawnCell;
    this.state.powerups = data.powerups;
    this.state.props = data.props || [];
    this.state.railCurves = data.railCurves || [];
    this.state.landmarks3d = data.landmarks3d;
    this.state.decoration = data.decoration ?? null;
    this.state.environment = data.environment;
    this.state.meta = data.meta;
    this.viewport.setState(this.state);
    this._syncInspector();
    this._setDirty(true);
    this._updateUndoRedoButtons();
  }

  _commitSnapshot(prevSnapshot) {
    if (!prevSnapshot) return;
    this.history.push(prevSnapshot);
    this._setDirty(true);
    this._updateUndoRedoButtons();
  }

  _loadState(newState, { resetHistory = false, fileName = 'map.json', handle = null, relPath = null } = {}) {
    this.state = newState;
    this.currentFileName = fileName;
    this.currentMapRelPath = relPath;
    this.fileHandle = handle;
    if (resetHistory) this.history.clear();
    this.viewport.setState(this.state);
    this._syncInspector();
    this._setDirty(false);
    this._updateUndoRedoButtons();
  }

  _setDirty(val) {
    this.dirty = val;
    $('dirty-indicator').classList.toggle('hidden', !val);
  }

  _updateUndoRedoButtons() {
    $('btn-undo').disabled = !this.history.canUndo();
    $('btn-redo').disabled = !this.history.canRedo();
  }

  _toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), 2400);
  }

  _applyCell(r, c, mode, updateNeighbors = true) {
    const size = this.state.size;
    if (r < 0 || r >= size || c < 0 || c >= size) return false;

    if (mode === 'eraser') {
      if (this.activeTab === 'decorations') {
        return this._clearDecorationsAt(r, c);
      }
      if (this.activeTab === 'landmarks') {
        const list = this.state.landmarks3d;
        const idx = list.findIndex((l) => l.row === r && l.col === c);
        if (idx < 0) return false;
        list.splice(idx, 1);
        return true;
      }
      if (this.activeTab === 'markers') {
        const rcIdx = (this.state.railCurves || []).findIndex((rc) =>
          railCurveCells(rc.row, rc.col, rc.rotation || 0).some((p) => p.row === r && p.col === c)
        );
        if (rcIdx >= 0) {
          const [removed] = this.state.railCurves.splice(rcIdx, 1);
          this._syncRailCurveSurface(removed, false);
          this.viewport.rebuildRailCurves();
          this.viewport.refreshRailRegion(removed.row, removed.col);
          return true;
        }
        const list = this.state.powerups;
        const idx = list.findIndex((p) => p.row === r && p.col === c);
        if (idx < 0) return false;
        list.splice(idx, 1);
        return true;
      }
      const hadObj = this.state.objectGrid[r][c] !== null;
      const hadSurf = this.state.surfaceGrid[r][c] !== TileType.EMPTY;
      if (hadObj) {
        this.state.objectGrid[r][c] = null;
        if (this.state.objectRotations?.[r]) this.state.objectRotations[r][c] = 0;
        if (this.state.tacticalStyles?.[r]) this.state.tacticalStyles[r][c] = -1;
      } else if (hadSurf) {
        this.state.surfaceGrid[r][c] = TileType.EMPTY;
      } else {
        return false;
      }
      this.viewport.updateCell(r, c, updateNeighbors);
      if (!updateNeighbors) this.viewport.refreshRoadNeighbors(r, c);
      return true;
    }

    if (this.activeTab === 'surfaces') {
      if (this.state.surfaceGrid[r][c] === this.selectedSurface) return false;
      this.state.surfaceGrid[r][c] = this.selectedSurface;
      this.viewport.updateCell(r, c, updateNeighbors);
      if (!updateNeighbors) this.viewport.refreshRoadNeighbors(r, c);
      return true;
    }

    if (this.activeTab === 'objects') {
      const curRot = this.state.objectRotations?.[r]?.[c] || 0;
      if (this.state.objectGrid[r][c] === this.selectedObject && curRot === this.placementRotation) {
        return false;
      }
      this.state.objectGrid[r][c] = this.selectedObject;
      if (this.state.objectRotations?.[r]) {
        this.state.objectRotations[r][c] = this.selectedObject === null ? 0 : this.placementRotation;
      }
      this.viewport.updateCell(r, c, updateNeighbors);
      if (!updateNeighbors) this.viewport.refreshRoadNeighbors(r, c);
      return true;
    }

    if (this.activeTab === 'decorations') {
      if (this.selectedDecoration === null) {
        return this._clearDecorationsAt(r, c);
      }
      if (!this.state.decoration) {
        this.state.decoration = {
          version: 1,
          seed: 1,
          theme: this.state.environment.theme || 'urban',
          landmarks: [],
          zones: [],
        };
      }
      if (String(this.selectedDecoration).startsWith('zone:')) {
        const surface = String(this.selectedDecoration).slice('zone:'.length);
        this.state.decoration.zones ||= [];
        const zones = this.state.decoration.zones;
        const already = zones.some(
          (z) =>
            z.surface === surface &&
            z.bounds?.[0] === r &&
            z.bounds?.[1] === c &&
            z.bounds?.[2] === r &&
            z.bounds?.[3] === c
        );
        if (already) return false;
        if (zones.length >= 64) {
          this._toast('Max 64 decoration zones per map');
          return false;
        }
        zones.push({
          id: `zone-${surface}-${r}-${c}-${Date.now().toString(36).slice(-4)}`,
          bounds: [r, c, r, c],
          surface,
          density: 0.35,
          details: ['cracks'],
        });
        return true;
      }
      if (!Array.isArray(this.state.decoration.landmarks)) {
        this.state.decoration.landmarks = [];
      }
      const list = this.state.decoration.landmarks;
      const existing = list.find((d) => d.row === r && d.col === c);
      if (existing) {
        if (existing.kind === this.selectedDecoration && (existing.rotation || 0) === this.placementRotation) {
          return false;
        }
        existing.kind = this.selectedDecoration;
        if (this.placementRotation) existing.rotation = this.placementRotation;
        else delete existing.rotation;
        if (this.selectedDecoration === 'label' && !existing.text) existing.text = 'SECTOR';
        return true;
      }
      if (list.length >= 64) {
        this._toast('Max 64 decoration landmarks per map');
        return false;
      }
      const id = `deco-${this.selectedDecoration.replace(/_/g, '-')}-${r}-${c}`;
      const entry = {
        id,
        kind: this.selectedDecoration,
        row: r,
        col: c,
        size: 1,
        ...(this.placementRotation ? { rotation: this.placementRotation } : {}),
      };
      if (this.selectedDecoration === 'label') entry.text = 'SECTOR';
      list.push(entry);
      return true;
    }

    return false;
  }

  _applyBrushAt(centerCell, mode) {
    let changed = false;
    for (let dr = 0; dr < this.brushSize; dr++) {
      for (let dc = 0; dc < this.brushSize; dc++) {
        if (this._applyCell(centerCell.row + dr, centerCell.col + dc, mode, false)) {
          changed = true;
        }
      }
    }
    if (changed) {
      if (this.activeTab === 'decorations') {
        this.viewport.rebuildDecorations();
        this._syncLists();
      } else if (this.activeTab === 'landmarks') {
        this.viewport.rebuildLandmarks();
        this._syncLists();
      } else if (this.activeTab === 'markers') {
        this.viewport.rebuildMarkers();
        this._syncLists();
      } else {
        this.viewport.syncBuildings();
        this.viewport.rebuildBridges();
      }
    }
    return changed;
  }

  _floodFill(startCell) {
    const size = this.state.size;
    const isSurf = this.activeTab === 'surfaces';
    const grid = isSurf ? this.state.surfaceGrid : this.state.objectGrid;
    const targetVal = grid[startCell.row][startCell.col];
    const replaceVal =
      this.activeTool === 'eraser'
        ? isSurf
          ? TileType.EMPTY
          : null
        : isSurf
        ? this.selectedSurface
        : this.selectedObject;

    if (targetVal === replaceVal) return;

    const prev = this._snapshot();
    const queue = [[startCell.row, startCell.col]];
    const visited = new Set([`${startCell.row},${startCell.col}`]);

    while (queue.length > 0) {
      const [r, c] = queue.shift();
      grid[r][c] = replaceVal;
      this.viewport.updateCell(r, c, false);

      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const key = `${nr},${nc}`;
        if (visited.has(key)) continue;
        if (grid[nr][nc] === targetVal) {
          visited.add(key);
          queue.push([nr, nc]);
        }
      }
    }

    if (isSurf || targetVal === TileType.BRIDGE || replaceVal === TileType.BRIDGE) {
      const roadNeighbors = new Set();
      for (const cellKey of visited) {
        const [r, c] = cellKey.split(',').map(Number);
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          const nKey = `${nr},${nc}`;
          if (!visited.has(nKey) && this.state.surfaceGrid[nr][nc] === TileType.ROAD) {
            roadNeighbors.add(nKey);
          }
        }
      }
      for (const nKey of roadNeighbors) {
        const [nr, nc] = nKey.split(',').map(Number);
        this.viewport.updateCell(nr, nc, false);
      }
    }
    this.viewport.syncBuildings();
    this.viewport.rebuildBridges();

    this._commitSnapshot(prev);
    this._toast(`Flood filled ${visited.size} cells`);
  }

  _findRailCurveAt(row, col) {
    return (this.state.railCurves || []).find((rc) =>
      railCurveCells(rc.row, rc.col, rc.rotation || 0).some((p) => p.row === row && p.col === col)
    );
  }

  _syncRailCurveSurface(rc, add) {
    const size = this.state.size;
    const stillCovered = new Set();
    if (!add) {
      for (const other of this.state.railCurves || []) {
        if (other === rc) continue;
        for (const p of railCurveCells(other.row, other.col, other.rotation || 0)) {
          stillCovered.add(`${p.row},${p.col}`);
        }
      }
    }
    for (const p of railCurveCells(rc.row, rc.col, rc.rotation || 0)) {
      if (p.row < 0 || p.row >= size || p.col < 0 || p.col >= size) continue;
      if (add) {
        this.state.surfaceGrid[p.row][p.col] = TileType.RAIL;
      } else if (!stillCovered.has(`${p.row},${p.col}`)) {
        this.state.surfaceGrid[p.row][p.col] = TileType.EMPTY;
      }
    }
  }

  _placeMarkerOrLandmark(cell) {
    const prev = this._snapshot();
    if (this.activeTab === 'markers') {
      if (this.selectedMarker === 'playerSpawn') {
        this.state.playerSpawnCell = { row: cell.row, col: cell.col };
      } else if (this.selectedMarker === 'baseCell') {
        this.state.baseCell = { row: cell.row, col: Math.min(cell.col, this.state.size - 2) };
      } else if (this.selectedMarker === 'railCurve') {
        this.state.railCurves ||= [];
        const existingIdx = this.state.railCurves.findIndex((rc) =>
          railCurveCells(rc.row, rc.col, rc.rotation || 0).some((p) => p.row === cell.row && p.col === cell.col)
        );
        if (existingIdx >= 0) {
          const [removed] = this.state.railCurves.splice(existingIdx, 1);
          this._syncRailCurveSurface(removed, false);
          this.viewport.rebuildRailCurves();
          this.viewport.refreshRailRegion(removed.row, removed.col);
        } else {
          const r = Math.min(cell.row, this.state.size - 3);
          const c = Math.min(cell.col, this.state.size - 3);
          const rc = { row: r, col: c, ...(this.placementRotation ? { rotation: this.placementRotation } : {}) };
          this.state.railCurves.push(rc);
          this._syncRailCurveSurface(rc, true);
          this.viewport.rebuildRailCurves();
          this.viewport.refreshRailRegion(r, c);
        }
      } else if (this.selectedMarker.startsWith('powerup:')) {
        const type = MARKERS.find((m) => m.id === this.selectedMarker)?.powerupType || 'REPAIR';
        const existingIdx = this.state.powerups.findIndex(
          (p) => p.row === cell.row && p.col === cell.col
        );
        if (existingIdx >= 0) {
          this.state.powerups.splice(existingIdx, 1);
        } else {
          if (this.state.powerups.length >= 16) {
            this._toast('Max 16 powerups per map');
            return;
          }
          this.state.powerups.push({ type, row: cell.row, col: cell.col });
        }
      } else if (this.selectedMarker.startsWith('prop:')) {
        const kind = MARKERS.find((m) => m.id === this.selectedMarker)?.propKind || 'lamp';
        this.state.props ||= [];
        const existingIdx = this.state.props.findIndex(
          (p) => p.row === cell.row && p.col === cell.col
        );
        if (existingIdx >= 0) {
          this.state.props.splice(existingIdx, 1);
        } else {
          this.state.props.push({
            kind,
            row: cell.row,
            col: cell.col,
            ...(this.placementRotation ? { rotation: this.placementRotation } : {}),
          });
        }
      }
      this.viewport.rebuildMarkers();
      this._syncLists();
      this._commitSnapshot(prev);
    } else if (this.activeTab === 'landmarks') {
      const existingIdx = this.state.landmarks3d.findIndex(
        (l) => l.row === cell.row && l.col === cell.col
      );
      if (existingIdx >= 0) {
        this.state.landmarks3d.splice(existingIdx, 1);
      } else {
        this.state.landmarks3d.push({
          kind: this.selectedLandmark,
          row: cell.row,
          col: cell.col,
          ...(this.placementRotation ? { rotation: this.placementRotation } : {}),
        });
      }
      this.viewport.rebuildLandmarks();
      this._syncLists();
      this._commitSnapshot(prev);
    } else if (this.activeTab === 'decorations') {
      if (!this.state.decoration) {
        this.state.decoration = {
          version: 1,
          seed: 1,
          theme: this.state.environment.theme || 'urban',
          landmarks: [],
        };
      }
      if (!Array.isArray(this.state.decoration.landmarks)) {
        this.state.decoration.landmarks = [];
      }
      const list = this.state.decoration.landmarks;
      const existingIdx = list.findIndex((d) => d.row === cell.row && d.col === cell.col);
      if (existingIdx >= 0) {
        list.splice(existingIdx, 1);
      } else {
        const id = `deco-${this.selectedDecoration.replace(/_/g, '-')}-${cell.row}-${cell.col}`;
        const entry = {
          id,
          kind: this.selectedDecoration,
          row: cell.row,
          col: cell.col,
          size: 1,
        };
        if (this.selectedDecoration === 'label') {
          entry.text = 'SECTOR';
        }
        list.push(entry);
      }
      this.viewport.rebuildDecorations();
      this._syncLists();
      this._commitSnapshot(prev);
    }
  }

  _pickFromCell(cell) {
    const obj = this.state.objectGrid[cell.row][cell.col];
    const surf = this.state.surfaceGrid[cell.row][cell.col];
    if (obj !== null) {
      this.selectedObject = obj;
      this._setTab('objects');
      this._setTool('brush');
      this._toast(`Picked object: ${OBJECT_BY_TILE.get(obj)?.name || obj}`);
    } else {
      this.selectedSurface = surf;
      this._setTab('surfaces');
      this._setTool('brush');
      this._toast(`Picked surface: ${SURFACE_BY_TILE.get(surf)?.name || surf}`);
    }
  }

  _startMoveAt(cell) {
    if (this.brushSize > 1) {
      this._startRegionMoveAt(cell);
      return;
    }
    const { row, col } = cell;

    // 1. Landmark (anchor cell)
    const lm = this.state.landmarks3d.find((l) => l.row === row && l.col === col);
    if (lm) {
      this.moveDrag = {
        kind: 'landmark',
        item: lm,
        fromRow: row,
        fromCol: col,
        originRotation: lm.rotation || 0,
        snapshot: this._snapshot(),
      };
      this._toast(`Moving landmark ${lm.kind}`);
      return;
    }

    // 2. Crushable prop
    const pr = (this.state.props || []).find((p) => p.row === row && p.col === col);
    if (pr) {
      this.moveDrag = {
        kind: 'prop',
        item: pr,
        fromRow: row,
        fromCol: col,
        originRotation: pr.rotation || 0,
        snapshot: this._snapshot(),
      };
      this._toast(`Moving prop ${pr.kind}`);
      return;
    }

    // 2.5 Rail Curve (3x3)
    const rc = this._findRailCurveAt(row, col);
    if (rc) {
      this.moveDrag = {
        kind: 'railCurve',
        item: rc,
        fromRow: rc.row,
        fromCol: rc.col,
        rowOffset: row - rc.row,
        colOffset: col - rc.col,
        originRotation: rc.rotation || 0,
        snapshot: this._snapshot(),
      };
      this._syncRailCurveSurface(rc, false);
      this._toast('Moving Rail Curve (3×3)');
      return;
    }

    // 3. Powerup crate
    const pw = this.state.powerups.find((p) => p.row === row && p.col === col);
    if (pw) {
      this.moveDrag = { kind: 'powerup', item: pw, fromRow: row, fromCol: col, snapshot: this._snapshot() };
      this._toast(`Moving crate ${pw.type}`);
      return;
    }

    // 3. Player spawn
    if (this.state.playerSpawnCell.row === row && this.state.playerSpawnCell.col === col) {
      this.moveDrag = { kind: 'playerSpawn', fromRow: row, fromCol: col, snapshot: this._snapshot() };
      this._toast('Moving Player Spawn');
      return;
    }

    // 4. Allied HQ (2x1 footprint: anchor or col+1)
    if (
      this.state.baseCell.row === row &&
      (this.state.baseCell.col === col || this.state.baseCell.col + 1 === col)
    ) {
      this.moveDrag = { kind: 'baseCell', fromRow: this.state.baseCell.row, fromCol: this.state.baseCell.col, snapshot: this._snapshot() };
      this._toast('Moving Allied HQ');
      return;
    }

    // 5. Grid object (moves only the object, without decorations or surface)
    const obj = this.state.objectGrid[row][col];
    if (obj !== null) {
      const rot = this.state.objectRotations?.[row]?.[col] || 0;
      const style = this.state.tacticalStyles?.[row]?.[col] ?? -1;
      this.moveDrag = {
        kind: 'object',
        value: obj,
        rotation: rot,
        originRotation: rot,
        style,
        fromRow: row,
        fromCol: col,
        snapshot: this._snapshot(),
      };
      this._toast(`Moving ${OBJECT_BY_TILE.get(obj)?.name || 'object'}`);
      return;
    }

    // 6. Ground layer: decorations together with surface
    const decos = (this.state.decoration?.landmarks || []).filter((d) => d.row === row && d.col === col);
    const surf = this.state.surfaceGrid[row][col];
    const hasSurf = surf !== TileType.EMPTY;
    if (decos.length > 0 || hasSurf) {
      const parts = [];
      if (decos.length > 0) parts.push(decos.length === 1 ? decos[0].kind : `${decos.length} decorations`);
      if (hasSurf) parts.push(SURFACE_BY_TILE.get(surf)?.name || 'surface');
      this.moveDrag = {
        kind: 'ground',
        decorations: decos.map((item) => ({ item, originRow: item.row, originCol: item.col })),
        surface: hasSurf ? surf : null,
        fromRow: row,
        fromCol: col,
        snapshot: this._snapshot(),
      };
      this._toast(`Moving ${parts.join(' + ')}`);
      return;
    }

    this._toast('Nothing to move on this cell');
  }

  _startRegionMoveAt(cell) {
    const size = this.state.size;
    const r0 = cell.row;
    const c0 = cell.col;
    const r1 = Math.min(size - 1, r0 + this.brushSize - 1);
    const c1 = Math.min(size - 1, c0 + this.brushSize - 1);
    const inBox = (r, c) => r >= r0 && r <= r1 && c >= c0 && c <= c1;

    const objects = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const obj = this.state.objectGrid[r][c];
        if (obj !== null) objects.push({ row: r, col: c, value: obj });
      }
    }

    let landmarks = [];
    let decorations = [];
    let powerups = [];
    let playerSpawn = null;
    let baseCell = null;
    const surfaces = [];

    if (objects.length === 0) {
      landmarks = this.state.landmarks3d
        .filter((l) => inBox(l.row, l.col))
        .map((item) => ({ item, originRow: item.row, originCol: item.col }));
      decorations = (this.state.decoration?.landmarks || [])
        .filter((d) => inBox(d.row, d.col))
        .map((item) => ({ item, originRow: item.row, originCol: item.col }));
      powerups = this.state.powerups
        .filter((p) => inBox(p.row, p.col))
        .map((item) => ({ item, originRow: item.row, originCol: item.col }));
      playerSpawn = inBox(this.state.playerSpawnCell.row, this.state.playerSpawnCell.col)
        ? { originRow: this.state.playerSpawnCell.row, originCol: this.state.playerSpawnCell.col }
        : null;
      baseCell =
        inBox(this.state.baseCell.row, this.state.baseCell.col) ||
        inBox(this.state.baseCell.row, this.state.baseCell.col + 1)
          ? { originRow: this.state.baseCell.row, originCol: this.state.baseCell.col }
          : null;

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const surf = this.state.surfaceGrid[r][c];
          if (surf !== TileType.EMPTY) surfaces.push({ row: r, col: c, value: surf });
        }
      }
    }

    const total =
      landmarks.length +
      decorations.length +
      powerups.length +
      (playerSpawn ? 1 : 0) +
      (baseCell ? 1 : 0) +
      objects.length +
      surfaces.length;
    if (total === 0) {
      this._toast('Nothing to move in brush area');
      return;
    }

    this.moveDrag = {
      kind: 'region',
      fromRow: r0,
      fromCol: c0,
      landmarks,
      decorations,
      powerups,
      playerSpawn,
      baseCell,
      objects,
      surfaces,
      snapshot: this._snapshot(),
    };
    this._toast(`Moving ${total} element(s) (${this.brushSize}×${this.brushSize})`);
  }

  _applyRegionOffsets(drag, dRow, dCol) {
    const size = this.state.size;
    const clamp = (v, max) => Math.max(0, Math.min(max, v));
    for (const entry of drag.landmarks) {
      entry.item.row = clamp(entry.originRow + dRow, size - 1);
      entry.item.col = clamp(entry.originCol + dCol, size - 1);
    }
    if (drag.landmarks.length) this.viewport.rebuildLandmarks();

    for (const entry of drag.decorations) {
      entry.item.row = clamp(entry.originRow + dRow, size - 1);
      entry.item.col = clamp(entry.originCol + dCol, size - 1);
    }
    if (drag.decorations.length) this.viewport.rebuildDecorations();

    for (const entry of drag.powerups) {
      entry.item.row = clamp(entry.originRow + dRow, size - 1);
      entry.item.col = clamp(entry.originCol + dCol, size - 1);
    }
    if (drag.playerSpawn) {
      this.state.playerSpawnCell = {
        row: clamp(drag.playerSpawn.originRow + dRow, size - 1),
        col: clamp(drag.playerSpawn.originCol + dCol, size - 1),
      };
    }
    if (drag.baseCell) {
      this.state.baseCell = {
        row: clamp(drag.baseCell.originRow + dRow, size - 1),
        col: clamp(drag.baseCell.originCol + dCol, size - 2),
      };
    }
    if (drag.powerups.length || drag.playerSpawn || drag.baseCell) {
      this.viewport.rebuildMarkers();
    }
  }

  _cyclePlacementRotation(delta = 90) {
    this.placementRotation = (((this.placementRotation + delta) % 360) + 360) % 360;
    const btn = $('btn-placement-rot');
    if (btn) btn.textContent = `↻ ${this.placementRotation}°`;
    this.viewport.setPlacementRotation(this.placementRotation);
  }

  _rotateCellAt(cell, delta = 90) {
    if (!cell) return false;
    const { row, col } = cell;
    const step = (cur) => (((((cur || 0) + delta) % 360) + 360) % 360);

    const lm = this.state.landmarks3d.find((l) => l.row === row && l.col === col);
    if (lm) {
      const prev = this._snapshot();
      lm.rotation = step(lm.rotation);
      this.viewport.rebuildLandmarks();
      this._syncLists();
      this._commitSnapshot(prev);
      this._updateCellInspector(cell);
      this._toast(`Rotated ${lm.kind} to ${lm.rotation}°`);
      return true;
    }

    const pr = (this.state.props || []).find((p) => p.row === row && p.col === col);
    if (pr) {
      const prev = this._snapshot();
      const next = step(pr.rotation);
      if (next) pr.rotation = next;
      else delete pr.rotation;
      this.viewport.rebuildMarkers();
      this._syncLists();
      this._commitSnapshot(prev);
      this._updateCellInspector(cell);
      this._toast(`Rotated prop ${pr.kind} to ${next}°`);
      return true;
    }

    const obj = this.state.objectGrid[row]?.[col];
    if (obj !== null && obj !== undefined) {
      const prev = this._snapshot();
      const next = step(this.state.objectRotations?.[row]?.[col] || 0);
      if (this.state.objectRotations?.[row]) this.state.objectRotations[row][col] = next;
      this.viewport.updateCell(row, col, false);
      this._commitSnapshot(prev);
      this._updateCellInspector(cell);
      this._toast(`Rotated ${OBJECT_BY_TILE.get(obj)?.name || 'object'} to ${next}°`);
      return true;
    }

    const rc = this._findRailCurveAt(row, col);
    if (rc) {
      const prev = this._snapshot();
      this._syncRailCurveSurface(rc, false);
      const next = step(rc.rotation);
      if (next) rc.rotation = next;
      else delete rc.rotation;
      this._syncRailCurveSurface(rc, true);
      this.viewport.rebuildRailCurves();
      this.viewport.refreshRailRegion(rc.row, rc.col);
      this._commitSnapshot(prev);
      this._updateCellInspector(cell);
      this._toast(`Rotated Rail Curve to ${next}°`);
      return true;
    }

    const deco = (this.state.decoration?.landmarks || []).find((d) => d.row === row && d.col === col);
    if (deco) {
      const prev = this._snapshot();
      const next = step(deco.rotation);
      if (next) deco.rotation = next;
      else delete deco.rotation;
      this.viewport.rebuildDecorations();
      this._syncLists();
      this._commitSnapshot(prev);
      this._updateCellInspector(cell);
      this._toast(`Rotated ${deco.kind} to ${next}°`);
      return true;
    }

    this._toast('Nothing to rotate on this cell');
    return false;
  }

  _onPointerDownCell(cell, e) {
    if (this.activeTool === 'eyedropper') {
      this._pickFromCell(cell);
      return;
    }
    if (this.activeTool === 'rotate') {
      this._rotateCellAt(cell, e?.shiftKey ? -90 : 90);
      return;
    }
    if (this.activeTool === 'move') {
      this._startMoveAt(cell);
      return;
    }
    if ((this.activeTab === 'markers' || this.activeTab === 'landmarks') && this.activeTool !== 'eraser') {
      this._placeMarkerOrLandmark(cell);
      return;
    }
    if (this.activeTool === 'fill') {
      this._floodFill(cell);
      return;
    }
    if (this.activeTool === 'rect') {
      this.rectStartCell = cell;
      this.strokeSnapshot = this._snapshot();
      return;
    }
    this.strokeSnapshot = this._snapshot();
    this.strokeChanged = this._applyBrushAt(cell, this.activeTool);
  }

  _onPointerDragCell(cell) {
    if (this.activeTool === 'move' && this.moveDrag) {
      if (this.moveDrag.kind === 'landmark') {
        this.moveDrag.item.row = cell.row;
        this.moveDrag.item.col = cell.col;
        this.viewport.rebuildLandmarks();
      } else if (this.moveDrag.kind === 'ground') {
        if (this.moveDrag.decorations.length > 0) {
          for (const entry of this.moveDrag.decorations) {
            entry.item.row = cell.row;
            entry.item.col = cell.col;
          }
          this.viewport.rebuildDecorations();
        }
      } else if (this.moveDrag.kind === 'prop') {
        this.moveDrag.item.row = cell.row;
        this.moveDrag.item.col = cell.col;
        this.viewport.rebuildMarkers();
      } else if (this.moveDrag.kind === 'railCurve') {
        const size = this.state.size;
        this.moveDrag.item.row = Math.max(0, Math.min(size - 3, cell.row - this.moveDrag.rowOffset));
        this.moveDrag.item.col = Math.max(0, Math.min(size - 3, cell.col - this.moveDrag.colOffset));
        this.viewport.rebuildRailCurves();
      } else if (this.moveDrag.kind === 'powerup') {
        this.moveDrag.item.row = cell.row;
        this.moveDrag.item.col = cell.col;
        this.viewport.rebuildMarkers();
      } else if (this.moveDrag.kind === 'playerSpawn') {
        this.state.playerSpawnCell = { row: cell.row, col: cell.col };
        this.viewport.rebuildMarkers();
      } else if (this.moveDrag.kind === 'baseCell') {
        this.state.baseCell = { row: cell.row, col: Math.min(cell.col, this.state.size - 2) };
        this.viewport.rebuildMarkers();
      } else if (this.moveDrag.kind === 'region') {
        this._applyRegionOffsets(this.moveDrag, cell.row - this.moveDrag.fromRow, cell.col - this.moveDrag.fromCol);
      }
      return;
    }
    if (
      this.activeTool === 'eraser' ||
      (this.activeTool === 'brush' &&
        (this.activeTab === 'surfaces' || this.activeTab === 'objects' || this.activeTab === 'decorations'))
    ) {
      if (this._applyBrushAt(cell, this.activeTool)) {
        this.strokeChanged = true;
      }
    }
  }

  _onPointerUpCell(cell) {
    if (this.activeTool === 'move' && this.moveDrag) {
      const drag = this.moveDrag;
      this.moveDrag = null;
      if (drag.kind === 'region') {
        const dRow = cell ? cell.row - drag.fromRow : 0;
        const dCol = cell ? cell.col - drag.fromCol : 0;
        if (!cell || (dRow === 0 && dCol === 0)) {
          this._applyRegionOffsets(drag, 0, 0);
          return;
        }
        const size = this.state.size;
        this._applyRegionOffsets(drag, dRow, dCol);

        for (const o of drag.objects) {
          this.state.objectGrid[o.row][o.col] = null;
          this.viewport.updateCell(o.row, o.col, false);
          this.viewport.refreshRoadNeighbors(o.row, o.col);
        }
        for (const o of drag.objects) {
          const nr = o.row + dRow;
          const nc = o.col + dCol;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
            this.state.objectGrid[nr][nc] = o.value;
            this.viewport.updateCell(nr, nc, false);
            this.viewport.refreshRoadNeighbors(nr, nc);
          }
        }
        if (drag.objects.length > 0) {
          this.viewport.syncBuildings();
        }

        for (const s of drag.surfaces) {
          this.state.surfaceGrid[s.row][s.col] = TileType.EMPTY;
          this.viewport.updateCell(s.row, s.col, false);
          this.viewport.refreshRoadNeighbors(s.row, s.col);
        }
        for (const s of drag.surfaces) {
          const nr = s.row + dRow;
          const nc = s.col + dCol;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
            this.state.surfaceGrid[nr][nc] = s.value;
            this.viewport.updateCell(nr, nc, false);
            this.viewport.refreshRoadNeighbors(nr, nc);
          }
        }
        if (drag.surfaces.length > 0 && drag.objects.length === 0) {
          this.viewport.rebuildBridges();
        }

        if (
          drag.landmarks.length ||
          drag.decorations.length ||
          drag.powerups.length ||
          drag.playerSpawn ||
          drag.baseCell
        ) {
          this._syncLists();
        }
        this._commitSnapshot(drag.snapshot);
        this._toast(`Moved region by (${dRow >= 0 ? '+' : ''}${dRow}, ${dCol >= 0 ? '+' : ''}${dCol})`);
        return;
      }
      const rotatedItem =
        (drag.kind === 'landmark' && (drag.item.rotation || 0) !== (drag.originRotation || 0)) ||
        (drag.kind === 'prop' && (drag.item.rotation || 0) !== (drag.originRotation || 0)) ||
        (drag.kind === 'railCurve' && (drag.item.rotation || 0) !== (drag.originRotation || 0)) ||
        (drag.kind === 'object' && drag.rotation !== drag.originRotation);
      if ((!cell || (cell.row === drag.fromRow && cell.col === drag.fromCol)) && !rotatedItem && drag.kind !== 'railCurve') {
        if (drag.kind === 'ground' && drag.decorations.length > 0) {
          for (const entry of drag.decorations) {
            entry.item.row = entry.originRow;
            entry.item.col = entry.originCol;
          }
          this.viewport.rebuildDecorations();
        }
        return;
      }
      if (drag.kind === 'object') {
        const destRow = cell ? cell.row : drag.fromRow;
        const destCol = cell ? cell.col : drag.fromCol;
        this.state.objectGrid[drag.fromRow][drag.fromCol] = null;
        if (this.state.objectRotations?.[drag.fromRow]) this.state.objectRotations[drag.fromRow][drag.fromCol] = 0;
        if (this.state.tacticalStyles?.[drag.fromRow]) this.state.tacticalStyles[drag.fromRow][drag.fromCol] = -1;
        this.state.objectGrid[destRow][destCol] = drag.value;
        if (this.state.objectRotations?.[destRow]) this.state.objectRotations[destRow][destCol] = drag.rotation || 0;
        if (this.state.tacticalStyles?.[destRow]) this.state.tacticalStyles[destRow][destCol] = drag.style ?? -1;
        this.viewport.updateCell(drag.fromRow, drag.fromCol, false);
        this.viewport.refreshRoadNeighbors(drag.fromRow, drag.fromCol);
        this.viewport.updateCell(destRow, destCol, false);
        this.viewport.refreshRoadNeighbors(destRow, destCol);
        this.viewport.syncBuildings();
        this.viewport.rebuildBridges();
      } else if (drag.kind === 'railCurve') {
        if (drag.item.row === drag.fromRow && drag.item.col === drag.fromCol && !rotatedItem) {
          this._syncRailCurveSurface(drag.item, true);
          this.viewport.rebuildRailCurves();
          return;
        }
        this._syncRailCurveSurface(drag.item, true);
        this.viewport.rebuildRailCurves();
        this.viewport.refreshRailRegion(drag.fromRow, drag.fromCol);
        this.viewport.refreshRailRegion(drag.item.row, drag.item.col);
        this._commitSnapshot(drag.snapshot);
        this._toast(`Moved Rail Curve to (${drag.item.row}, ${drag.item.col})`);
        return;
      } else if (drag.kind === 'ground') {
        if (drag.decorations.length > 0) {
          for (const entry of drag.decorations) {
            entry.item.row = cell.row;
            entry.item.col = cell.col;
          }
          this.viewport.rebuildDecorations();
          this._syncLists();
        }
        if (drag.surface !== null) {
          this.state.surfaceGrid[drag.fromRow][drag.fromCol] = TileType.EMPTY;
          this.state.surfaceGrid[cell.row][cell.col] = drag.surface;
          this.viewport.updateCell(drag.fromRow, drag.fromCol, false);
          this.viewport.refreshRoadNeighbors(drag.fromRow, drag.fromCol);
          this.viewport.updateCell(cell.row, cell.col, false);
          this.viewport.refreshRoadNeighbors(cell.row, cell.col);
          this.viewport.rebuildBridges();
        }
      } else {
        this._syncLists();
      }
      this._commitSnapshot(drag.snapshot);
      this._toast(`Moved to (${cell.row}, ${cell.col})`);
      return;
    }

    if (this.activeTool === 'rect' && this.rectStartCell && cell) {
      const r0 = Math.min(this.rectStartCell.row, cell.row);
      const r1 = Math.max(this.rectStartCell.row, cell.row);
      const c0 = Math.min(this.rectStartCell.col, cell.col);
      const c1 = Math.max(this.rectStartCell.col, cell.col);
      if (this.activeTab === 'decorations' && String(this.selectedDecoration).startsWith('zone:')) {
        const surface = String(this.selectedDecoration).slice('zone:'.length);
        this.state.decoration ||= {
          version: 1,
          seed: 1,
          theme: this.state.environment.theme || 'urban',
          landmarks: [],
          zones: [],
        };
        this.state.decoration.zones ||= [];
        if (this.state.decoration.zones.length >= 64) {
          this._toast('Max 64 decoration zones per map');
        } else {
          this.state.decoration.zones.push({
            id: `zone-${surface}-${r0}-${c0}-${Date.now().toString(36).slice(-4)}`,
            bounds: [r0, c0, r1, c1],
            surface,
            density: 0.35,
            details: ['cracks'],
          });
          this.viewport.rebuildDecorations();
          this._syncLists();
          this._commitSnapshot(this.strokeSnapshot);
        }
        this.rectStartCell = null;
        this.strokeSnapshot = null;
        return;
      }
      let changed = false;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (this._applyCell(r, c, 'brush', false)) changed = true;
        }
      }
      if (changed) {
        if (this.activeTab === 'decorations') {
          this.viewport.rebuildDecorations();
          this._syncLists();
        } else {
          this.viewport.syncBuildings();
          this.viewport.rebuildBridges();
        }
        this._commitSnapshot(this.strokeSnapshot);
      }
      this.rectStartCell = null;
      this.strokeSnapshot = null;
      return;
    }

    if (this.strokeChanged) {
      this._commitSnapshot(this.strokeSnapshot);
    }
    this.strokeSnapshot = null;
    this.strokeChanged = false;
  }

  _setTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    this._renderPalette();
    this._updateStatusActive();
  }

  _setTool(tool) {
    this.activeTool = tool;
    document.querySelectorAll('#tool-buttons button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
  }

  _setBrushSize(size) {
    this.brushSize = size;
    this.viewport.setBrushSize(size);
    document.querySelectorAll('#brush-sizes button').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.size) === size);
    });
  }

  _renderPalette() {
    const list = $('palette-list');
    list.innerHTML = '';

    if (this.activeTab === 'surfaces') {
      for (const s of SURFACES) {
        const btn = this._makePaletteItem(s.name, `Token: '${s.char}'`, s.color, s.tile === this.selectedSurface);
        btn.onclick = () => {
          this.selectedSurface = s.tile;
          if (this.activeTool === 'eraser') this._setTool('brush');
          this._renderPalette();
          this._updateStatusActive();
        };
        list.appendChild(btn);
      }
    } else if (this.activeTab === 'objects') {
      for (const o of OBJECTS) {
        const btn = this._makePaletteItem(o.name, `Token: '${o.char}'`, o.color, o.tile === this.selectedObject);
        btn.onclick = () => {
          this.selectedObject = o.tile;
          if (this.activeTool === 'eraser') this._setTool('brush');
          this._renderPalette();
          this._updateStatusActive();
        };
        list.appendChild(btn);
      }
    } else if (this.activeTab === 'markers') {
      for (const m of MARKERS) {
        const btn = this._makePaletteItem(m.name, m.sub, m.color, m.id === this.selectedMarker);
        btn.onclick = () => {
          this.selectedMarker = m.id;
          this._renderPalette();
          this._updateStatusActive();
        };
        list.appendChild(btn);
      }
    } else if (this.activeTab === 'landmarks') {
      for (const l of LANDMARKS) {
        const btn = this._makePaletteItem(l.name, 'Click cell to place/remove', l.color, l.kind === this.selectedLandmark);
        btn.onclick = () => {
          this.selectedLandmark = l.kind;
          this._renderPalette();
          this._updateStatusActive();
        };
        list.appendChild(btn);
      }
    } else if (this.activeTab === 'decorations') {
      for (const d of DECORATIONS) {
        const sub = d.sub || (d.group === 'zone' ? '2D ground zone (Brush/Rect)' : `Ground decal (${d.kind})`);
        const btn = this._makePaletteItem(d.name, sub, d.color, d.kind === this.selectedDecoration);
        btn.onclick = () => {
          this.selectedDecoration = d.kind;
          if (this.activeTool === 'eraser') this._setTool('brush');
          this._renderPalette();
          this._updateStatusActive();
        };
        list.appendChild(btn);
      }
    }
  }

  _makePaletteItem(name, sub, color, selected) {
    const btn = document.createElement('button');
    btn.className = `pal-item${selected ? ' selected' : ''}`;
    btn.innerHTML = `
      <span class="pal-swatch" style="background:${color}"></span>
      <span class="pal-meta">
        <span class="pal-name">${name}</span>
        <span class="pal-sub">${sub}</span>
      </span>
    `;
    return btn;
  }

  _updateStatusActive() {
    let label = '';
    if (this.activeTab === 'surfaces') {
      const s = SURFACE_BY_TILE.get(this.selectedSurface);
      label = `Surface: ${s?.name} (${s?.char})`;
    } else if (this.activeTab === 'objects') {
      const o = OBJECT_BY_TILE.get(this.selectedObject);
      label = `Object: ${o?.name} (${o?.char})`;
    } else if (this.activeTab === 'markers') {
      label = `Marker: ${this.selectedMarker}`;
    } else if (this.activeTab === 'landmarks') {
      label = `Landmark: ${this.selectedLandmark}`;
    } else {
      const d = DECORATIONS.find((item) => item.kind === this.selectedDecoration);
      label = this.selectedDecoration === null ? 'Deco: Empty (Clear)' : `Deco: ${d?.name || this.selectedDecoration}`;
    }
    $('status-active').textContent = label;
  }

  _clearDecorationsAt(r, c) {
    if (!this.state.decoration) return false;
    const decals = this.state.decoration.landmarks;
    if (Array.isArray(decals)) {
      const idx = decals.findIndex((d) => Math.round(d.row) === r && Math.round(d.col) === c);
      if (idx >= 0) {
        decals.splice(idx, 1);
        return true;
      }
    }
    const zones = this.state.decoration.zones;
    if (Array.isArray(zones)) {
      for (let i = zones.length - 1; i >= 0; i--) {
        const b = zones[i].bounds;
        if (b && r >= b[0] && r <= b[2] && c >= b[1] && c <= b[3]) {
          zones.splice(i, 1);
          return true;
        }
      }
    }
    return false;
  }

  _getCellDecorations(row, col) {
    const dec = this.state.decoration;
    if (!dec) return { decals: [], zones: [], paths: [], exclusions: [] };
    const decals = (dec.landmarks || []).filter((d) => Math.round(d.row) === row && Math.round(d.col) === col);
    const zones = (dec.zones || []).filter(
      (z) => z.bounds && row >= z.bounds[0] && row <= z.bounds[2] && col >= z.bounds[1] && col <= z.bounds[3]
    );
    const paths = (dec.paths || []).filter((p) => {
      const pts = p.points || [];
      const halfW = Math.max(0.6, (p.width || 1) * 0.5);
      for (let i = 1; i < pts.length; i++) {
        const [r0, c0] = pts[i - 1];
        const [r1, c1] = pts[i];
        const dr = r1 - r0;
        const dc = c1 - c0;
        const len2 = dr * dr + dc * dc;
        const t = len2 ? Math.max(0, Math.min(1, ((row - r0) * dr + (col - c0) * dc) / len2)) : 0;
        if (Math.hypot(row - r0 - t * dr, col - c0 - t * dc) <= halfW) return true;
      }
      return false;
    });
    const exclusions = (dec.exclusions || []).filter(
      (ex) => ex.bounds && row >= ex.bounds[0] && row <= ex.bounds[2] && col >= ex.bounds[1] && col <= ex.bounds[3]
    );
    return { decals, zones, paths, exclusions };
  }

  _updateCellInspector(cell) {
    this.hoveredCell = cell;
    if (!cell) {
      $('status-coords').textContent = 'Row: —, Col: —';
      $('info-coords').textContent = '—';
      $('info-surface').textContent = '—';
      $('info-object').textContent = '—';
      $('info-rotation').textContent = '—';
      $('info-deco').textContent = '—';
      $('info-extra').textContent = '—';
      return;
    }
    $('status-coords').textContent = `Row: ${cell.row}, Col: ${cell.col}`;
    $('info-coords').textContent = `${cell.row}, ${cell.col}`;
    const s = this.state.surfaceGrid[cell.row][cell.col];
    const o = this.state.objectGrid[cell.row][cell.col];
    $('info-surface').textContent = SURFACE_BY_TILE.get(s)?.name || String(s);
    $('info-object').textContent = o === null ? 'None' : OBJECT_BY_TILE.get(o)?.name || String(o);

    const extras = [];
    if (this.state.playerSpawnCell.row === cell.row && this.state.playerSpawnCell.col === cell.col) {
      extras.push('Player Spawn');
    }
    if (this.state.baseCell.row === cell.row && this.state.baseCell.col === cell.col) {
      extras.push('Allied HQ');
    }
    const pw = this.state.powerups.find((p) => p.row === cell.row && p.col === cell.col);
    if (pw) extras.push(`Crate: ${pw.type}`);
    const pr = (this.state.props || []).find((p) => p.row === cell.row && p.col === cell.col);
    if (pr) extras.push(`Prop: ${pr.kind}`);
    const lm = this.state.landmarks3d.find((l) => l.row === cell.row && l.col === cell.col);
    if (lm) extras.push(`Landmark: ${lm.kind}`);
    const rc = this._findRailCurveAt(cell.row, cell.col);
    if (rc) extras.push('Rail Curve (3×3)');
    const deco = (this.state.decoration?.landmarks || []).find((d) => d.row === cell.row && d.col === cell.col);

    let rotText = '—';
    if (lm) rotText = `${lm.rotation || 0}°`;
    else if (pr) rotText = `${pr.rotation || 0}°`;
    else if (o !== null) rotText = `${this.state.objectRotations?.[cell.row]?.[cell.col] || 0}°`;
    else if (rc) rotText = `${rc.rotation || 0}°`;
    else if (deco) rotText = `${deco.rotation || 0}°`;
    $('info-rotation').textContent = rotText;

    const cellDeco = this._getCellDecorations(cell.row, cell.col);
    const decoParts = [
      ...cellDeco.decals.map((d) => `decal:${d.kind}`),
      ...cellDeco.zones.map((z) => `zone:${z.surface}`),
      ...cellDeco.paths.map((p) => `path:${p.surface}${p.marking && p.marking !== 'none' ? `(${p.marking})` : ''}`),
      ...cellDeco.exclusions.map(() => 'excl'),
    ];
    $('info-deco').textContent = decoParts.length ? decoParts.join(', ') : '—';

    $('info-extra').textContent = extras.length ? extras.join(', ') : '—';
  }

  _syncInspector() {
    $('meta-name').value = this.state.meta.name;
    $('meta-code').value = this.state.meta.code;
    $('meta-subtitle').value = this.state.meta.subtitle;
    $('meta-gamemode').value = this.state.meta.gameMode;
    $('env-theme').value = this.state.environment.theme;
    $('env-tint').value = this.state.environment.tint;
    $('env-fog').value = this.state.environment.fogColor;
    $('env-ground').value = this.state.environment.groundColor;
    this._syncLists();
  }

  _syncLists() {
    $('powerup-count').textContent = String(this.state.powerups.length);
    const pList = $('powerup-list');
    pList.innerHTML = '';
    this.state.powerups.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<span>${p.type} (${p.row}, ${p.col})</span>`;
      const del = document.createElement('button');
      del.textContent = '×';
      del.onclick = () => {
        const prev = this._snapshot();
        this.state.powerups.splice(idx, 1);
        this.viewport.rebuildMarkers();
        this._syncLists();
        this._commitSnapshot(prev);
      };
      row.appendChild(del);
      pList.appendChild(row);
    });

    $('landmark-count').textContent = String(this.state.landmarks3d.length);
    const lList = $('landmark-list');
    lList.innerHTML = '';
    this.state.landmarks3d.forEach((l, idx) => {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<span>${l.kind} (${l.row}, ${l.col})${l.rotation ? ` ${l.rotation}°` : ''}</span>`;
      const actions = document.createElement('span');
      const rotBtn = document.createElement('button');
      rotBtn.textContent = '↻';
      rotBtn.title = 'Rotate 90°';
      rotBtn.onclick = () => {
        const prev = this._snapshot();
        l.rotation = ((l.rotation || 0) + 90) % 360;
        this.viewport.rebuildLandmarks();
        this._syncLists();
        this._commitSnapshot(prev);
      };
      const del = document.createElement('button');
      del.textContent = '×';
      del.onclick = () => {
        const prev = this._snapshot();
        this.state.landmarks3d.splice(idx, 1);
        this.viewport.rebuildLandmarks();
        this._syncLists();
        this._commitSnapshot(prev);
      };
      actions.appendChild(rotBtn);
      actions.appendChild(del);
      row.appendChild(actions);
      lList.appendChild(row);
    });

    const decos = this.state.decoration?.landmarks || [];
    const zones = this.state.decoration?.zones || [];
    const paths = this.state.decoration?.paths || [];
    const exclusions = this.state.decoration?.exclusions || [];
    $('deco-count').textContent = String(decos.length + zones.length + paths.length + exclusions.length);
    const dList = $('deco-list');
    dList.innerHTML = '';
    decos.forEach((d, idx) => {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<span>[decal] ${d.kind} (${d.row}, ${d.col})${d.rotation ? ` ${d.rotation}°` : ''}</span>`;
      const actions = document.createElement('span');
      const rotBtn = document.createElement('button');
      rotBtn.textContent = '↻';
      rotBtn.title = 'Rotate 90°';
      rotBtn.onclick = () => {
        const prev = this._snapshot();
        const next = ((d.rotation || 0) + 90) % 360;
        if (next) d.rotation = next;
        else delete d.rotation;
        this.viewport.rebuildDecorations();
        this._syncLists();
        this._commitSnapshot(prev);
      };
      const del = document.createElement('button');
      del.textContent = '×';
      del.onclick = () => {
        const prev = this._snapshot();
        decos.splice(idx, 1);
        this.viewport.rebuildDecorations();
        this._syncLists();
        this._commitSnapshot(prev);
      };
      actions.appendChild(rotBtn);
      actions.appendChild(del);
      row.appendChild(actions);
      dList.appendChild(row);
    });
    zones.forEach((z, idx) => {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<span>[zone] ${z.surface} [${(z.bounds || []).join(',')}]</span>`;
      const del = document.createElement('button');
      del.textContent = '×';
      del.onclick = () => {
        const prev = this._snapshot();
        zones.splice(idx, 1);
        this.viewport.rebuildDecorations();
        this._syncLists();
        this._commitSnapshot(prev);
      };
      row.appendChild(del);
      dList.appendChild(row);
    });
    paths.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<span>[path] ${p.surface}/${p.marking || 'none'} (${p.points?.length || 0}pt)</span>`;
      const del = document.createElement('button');
      del.textContent = '×';
      del.onclick = () => {
        const prev = this._snapshot();
        paths.splice(idx, 1);
        this.viewport.rebuildDecorations();
        this._syncLists();
        this._commitSnapshot(prev);
      };
      row.appendChild(del);
      dList.appendChild(row);
    });
    exclusions.forEach((ex, idx) => {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<span>[excl] [${(ex.bounds || []).join(',')}]</span>`;
      const del = document.createElement('button');
      del.textContent = '×';
      del.onclick = () => {
        const prev = this._snapshot();
        exclusions.splice(idx, 1);
        this.viewport.rebuildDecorations();
        this._syncLists();
        this._commitSnapshot(prev);
      };
      row.appendChild(del);
      dList.appendChild(row);
    });
  }

  async _saveMap() {
    try {
      const jsonText = serializeMapState(this.state);
      const res = await saveJsonWithPicker(jsonText, this.currentFileName, this.fileHandle);
      if (res.handle) this.fileHandle = res.handle;
      this._setDirty(false);
      if (res.fallbackError) {
        this._toast(`Direct save failed (${res.fallbackError}); downloaded ${this.currentFileName}`);
      } else {
        const railCheck = validateRailroadLayout(this.state);
        if (!railCheck.ok) {
          console.warn('Railroad validation warnings:', railCheck.issues);
          this._toast(
            `Saved ${this.currentFileName} (⚠ ${railCheck.issues.length} railroad warning(s): ${railCheck.issues[0].message})`
          );
        } else {
          this._toast(res.method === 'fs' ? `Saved ${this.currentFileName}` : `Downloaded ${this.currentFileName}`);
        }
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        this._toast(`Save failed: ${err.message}`);
      }
    }
  }

  _bindUI() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.onclick = () => this._setTab(b.dataset.tab);
    });

    // Tools & brush size
    document.querySelectorAll('#tool-buttons button').forEach((b) => {
      b.onclick = () => this._setTool(b.dataset.tool);
    });
    document.querySelectorAll('#brush-sizes button').forEach((b) => {
      b.onclick = () => this._setBrushSize(Number(b.dataset.size));
    });
    const rotBtn = $('btn-placement-rot');
    if (rotBtn) rotBtn.onclick = () => this._cyclePlacementRotation(90);

    // Map loading
    $('map-select').onchange = async (e) => {
      const url = e.target.value;
      if (!url) return;
      const opt = e.target.selectedOptions[0];
      await this._loadMapUrl(url, opt?.dataset?.filename || 'map.json');
    };

    $('btn-new').onclick = () => {
      this._loadState(parseMapState(createBlankMap()), {
        resetHistory: true,
        fileName: 'custom-map.json',
      });
      $('map-select').value = '';
      this._toast('Created new blank 40×40 map');
    };

    $('btn-import').onclick = () => $('file-input').click();
    $('file-input').onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        this._loadState(parseMapState(json), { resetHistory: true, fileName: file.name });
        this._toast(`Imported ${file.name}`);
      } catch (err) {
        this._toast(`Invalid JSON: ${err.message}`);
      }
      e.target.value = '';
    };

    $('btn-save').onclick = () => this._saveMap();
    $('btn-export').onclick = () => {
      downloadJson(serializeMapState(this.state), this.currentFileName);
      this._toast(`Exported ${this.currentFileName}`);
    };

    // Undo / Redo
    $('btn-undo').onclick = () => {
      const prev = this.history.undo(this._snapshot());
      if (prev) this._restoreSnapshot(prev);
    };
    $('btn-redo').onclick = () => {
      const next = this.history.redo(this._snapshot());
      if (next) this._restoreSnapshot(next);
    };

    // View toggles
    $('btn-cam-mode').onclick = () => {
      const top = this.viewport.toggleTopDown();
      $('btn-cam-mode').classList.toggle('active', top);
      $('status-cam').textContent = `Camera: ${top ? 'Top-Down' : 'Isometric'}`;
    };
    $('btn-cam-reset').onclick = () => this.viewport.resetCamera();
    $('btn-toggle-grid').onclick = (e) => {
      const on = e.target.classList.toggle('active');
      this.viewport.setGridVisible(on);
    };
    $('btn-toggle-surface').onclick = (e) => {
      const on = e.target.classList.toggle('active');
      this.viewport.setSurfaceVisible(on);
    };
    $('btn-toggle-objects').onclick = (e) => {
      const on = e.target.classList.toggle('active');
      this.viewport.setObjectsVisible(on);
    };

    // Metadata & environment bindings
    const bindMeta = (id, key) => {
      $(id).onchange = (e) => {
        const prev = this._snapshot();
        this.state.meta[key] = e.target.value;
        this._commitSnapshot(prev);
      };
    };
    bindMeta('meta-name', 'name');
    bindMeta('meta-code', 'code');
    bindMeta('meta-subtitle', 'subtitle');
    bindMeta('meta-gamemode', 'gameMode');

    const bindEnv = (id, key) => {
      $(id).oninput = (e) => {
        this.state.environment[key] = e.target.value;
        this.viewport.applyEnvironment();
        if (key === 'theme') this.viewport.syncBuildings();
        this._setDirty(true);
      };
    };
    bindEnv('env-theme', 'theme');
    bindEnv('env-tint', 'tint');
    bindEnv('env-fog', 'fogColor');
    bindEnv('env-ground', 'groundColor');

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (this.moveDrag?.kind === 'landmark') {
          this.moveDrag.item.rotation = ((this.moveDrag.item.rotation || 0) + 90) % 360;
          this.viewport.rebuildLandmarks();
          this._syncLists();
          this._toast(`Rotated ${this.moveDrag.item.kind} to ${this.moveDrag.item.rotation}°`);
        } else if (this.moveDrag?.kind === 'prop') {
          this.moveDrag.item.rotation = ((this.moveDrag.item.rotation || 0) + 90) % 360;
          this.viewport.rebuildMarkers();
          this._syncLists();
          this._toast(`Rotated prop ${this.moveDrag.item.kind} to ${this.moveDrag.item.rotation}°`);
        } else if (this.moveDrag?.kind === 'railCurve') {
          this.moveDrag.item.rotation = ((this.moveDrag.item.rotation || 0) + 90) % 360;
          this.viewport.rebuildRailCurves();
          this._toast(`Rotated Rail Curve to ${this.moveDrag.item.rotation}°`);
        } else if (this.moveDrag?.kind === 'object') {
          this.moveDrag.rotation = ((this.moveDrag.rotation || 0) + 90) % 360;
          if (this.state.objectRotations?.[this.moveDrag.fromRow]) {
            this.state.objectRotations[this.moveDrag.fromRow][this.moveDrag.fromCol] = this.moveDrag.rotation;
          }
          this.viewport.updateCell(this.moveDrag.fromRow, this.moveDrag.fromCol, false);
          this._toast(`Rotated object to ${this.moveDrag.rotation}°`);
        } else {
          this._cyclePlacementRotation(e.shiftKey ? -90 : 90);
          this._toast(`Placement angle: ${this.placementRotation}°`);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) $('btn-redo').click();
        else $('btn-undo').click();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault();
        $('btn-redo').click();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        e.preventDefault();
        this._saveMap();
      } else if (e.code === 'KeyB') {
        this._setTool('brush');
      } else if (e.code === 'KeyM') {
        this._setTool('move');
      } else if (e.code === 'KeyO') {
        this._setTool('rotate');
      } else if (e.code === 'KeyE' && !e.ctrlKey) {
        // Note: E also rotates camera if held; only switch if Shift+E or keep simple: X for eraser
      } else if (e.code === 'KeyX') {
        this._setTool('eraser');
      } else if (e.code === 'KeyI') {
        this._setTool('eyedropper');
      } else if (e.code === 'KeyR') {
        this._setTool('rect');
      } else if (e.code === 'KeyF') {
        this._setTool('fill');
      } else if (e.code === 'KeyT') {
        $('btn-cam-mode').click();
      } else if (e.code === 'KeyG') {
        $('btn-toggle-grid').click();
      } else if (e.code === 'Home') {
        this.viewport.resetCamera();
      } else if (e.code === 'Digit1') {
        this._setBrushSize(1);
      } else if (e.code === 'Digit2') {
        this._setBrushSize(2);
      } else if (e.code === 'Digit3') {
        this._setBrushSize(3);
      }
    });
  }
}

new MapEditorApp();
