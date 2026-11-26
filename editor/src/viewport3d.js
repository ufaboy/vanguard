/** Three.js 3D Isometric / Top-Down Map Editor Viewport. */
import * as THREE from 'three';
import { TileType } from '/public/src/game/terrains/surfaces.js';
import { ModelFactory } from '/public/src/game/render/models.js';
import { landmarkFootprintCenter } from '/public/src/game/terrains/landmarks.js';
import { computeBuildingLayout } from './building-layout.js';
import { computeBridgeLayout } from './bridge-layout.js';
import { BUILDING_MAX_HP } from '/public/src/game/terrains/building-models.js';
import { normalizeDecoration } from '/public/src/game/render/decoration.js';
import { createUrbanGroundTexture } from '/public/src/game/terrains/urban-ground.js';
import { GRID_SIZE, TILE_SIZE } from './catalog.js';

export function gridToWorld(row, col, size = GRID_SIZE) {
  return {
    x: (col - (size - 1) / 2) * TILE_SIZE,
    z: (row - (size - 1) / 2) * TILE_SIZE,
  };
}

export function worldToGrid(x, z, size = GRID_SIZE) {
  const col = Math.round(x / TILE_SIZE + (size - 1) / 2);
  const row = Math.round(z / TILE_SIZE + (size - 1) / 2);
  if (row < 0 || row >= size || col < 0 || col >= size) return null;
  return { row, col };
}

export class Viewport3D {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.state = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#18212a');

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.5, 400);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(this.renderer.domElement);

    // Lighting
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xfff6e5, 1.35);
    this.dirLight.position.set(35, 65, 30);
    this.scene.add(this.dirLight);

    // ModelFactory from the game (reuses Blender GLBs & procedural fallbacks)
    this.modelFactory = new ModelFactory(this.renderer, false);
    this.modelFactory.onBrickModelsReady = () => this.rebuildAll();
    this.modelFactory.onConcreteModelsReady = () => this.rebuildAll();
    this.modelFactory.onBuildingModelsReady = () => this.rebuildAll();

    // Scene layers
    const arenaSpan = GRID_SIZE * TILE_SIZE;
    const groundGeo = new THREE.PlaneGeometry(arenaSpan, arenaSpan);
    groundGeo.rotateX(-Math.PI / 2);
    this.groundMat = new THREE.MeshStandardMaterial({ color: 0x687478, roughness: 0.92, metalness: 0.05 });
    this.groundMesh = new THREE.Mesh(groundGeo, this.groundMat);
    this.groundMesh.position.y = -0.02;
    this.scene.add(this.groundMesh);

    this.gridHelper = new THREE.GridHelper(arenaSpan, GRID_SIZE, 0x38bdf8, 0x334155);
    this.gridHelper.position.y = 0.02;
    this.gridHelper.material.opacity = 0.35;
    this.gridHelper.material.transparent = true;
    this.scene.add(this.gridHelper);

    this.surfaceGroup = new THREE.Group();
    this.objectGroup = new THREE.Group();
    this.bridgeGroup = new THREE.Group();
    this.markerGroup = new THREE.Group();
    this.landmarkGroup = new THREE.Group();
    this.decoGroup = new THREE.Group();
    this.scene.add(
      this.surfaceGroup,
      this.objectGroup,
      this.bridgeGroup,
      this.markerGroup,
      this.landmarkGroup,
      this.decoGroup
    );

    this.surfaceCells = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
    this.objectCells = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
    this.buildingLayout = new Map();
    this.urbanGroundTexture = null;

    // Shared flat materials for water/ice/fallback
    this.waterGeo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
    this.waterGeo.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.25, metalness: 0.15 });
    this.iceMat = new THREE.MeshStandardMaterial({ color: 0xbae6fd, roughness: 0.15, metalness: 0.1 });

    // Hover cursor mesh
    const cursorGeo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
    cursorGeo.rotateX(-Math.PI / 2);
    const cursorMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    this.cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
    this.cursorMesh.position.y = 0.05;
    this.cursorMesh.renderOrder = 10;
    this.cursorMesh.visible = false;
    this.scene.add(this.cursorMesh);

    // Camera orbit/pan state
    this.camTarget = new THREE.Vector3(0, 0, 0);
    this.camDistance = 76;
    this.camAzimuth = 0; // 0 = looking from +Z toward -Z (North is up)
    this.camPolar = 0.72;
    this.isTopDown = false;
    this.savedIsoPolar = 0.72;

    this.keysDown = new Set();
    this.dragMode = null; // 'paint' | 'pan' | 'orbit'
    this.lastPointer = { x: 0, y: 0 };
    this.brushSize = 1;

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this._bindEvents();
    this._updateCamera();
    this._animate();
  }

  setState(state) {
    this.state = state;
    this.applyEnvironment();
    this.rebuildAll();
  }

  applyEnvironment() {
    if (!this.state) return;
    const { fogColor, groundColor, tint } = this.state.environment;
    this.scene.background = new THREE.Color(fogColor || '#18212a');
    if (!this.urbanGroundTexture) {
      this.groundMat.color.set(groundColor || '#687478');
    } else {
      this.groundMat.color.set('#ffffff');
    }
    this.dirLight.color.set(tint || '#fff6e5');
    this.rebuildDecorations();
  }

  setGridVisible(visible) {
    this.gridHelper.visible = visible;
  }

  setSurfaceVisible(visible) {
    this.surfaceGroup.visible = visible;
  }

  setObjectsVisible(visible) {
    this.objectGroup.visible = visible;
    this.bridgeGroup.visible = visible;
    this.landmarkGroup.visible = visible;
  }

  setBrushSize(size) {
    this.brushSize = size;
    this.cursorMesh.scale.set(size, 1, size);
  }

  toggleTopDown() {
    this.isTopDown = !this.isTopDown;
    if (this.isTopDown) {
      this.savedIsoPolar = this.camPolar;
      this.camPolar = 0.015;
    } else {
      this.camPolar = this.savedIsoPolar || 0.72;
    }
    this._updateCamera();
    return this.isTopDown;
  }

  resetCamera() {
    this.camTarget.set(0, 0, 0);
    this.camDistance = 76;
    this.camAzimuth = 0;
    this.camPolar = this.isTopDown ? 0.015 : 0.72;
    this._updateCamera();
  }

  rebuildAll() {
    if (!this.state) return;
    this.surfaceGroup.clear();
    this.objectGroup.clear();
    this.buildingLayout = computeBuildingLayout(
      this.state.objectGrid,
      this.state.environment?.theme || 'urban'
    );
    const size = this.state.size;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        this.surfaceCells[r][c] = null;
        this.objectCells[r][c] = null;
        this.updateCell(r, c, false);
      }
    }
    this.rebuildMarkers();
    this.rebuildLandmarks();
    this.rebuildBridges();
    this.rebuildDecorations();
  }

  rebuildBridges() {
    this.bridgeGroup.clear();
    if (!this.state || !this.modelFactory.landmarkModels) return;
    const bridges = computeBridgeLayout(this.state.objectGrid, this.state.surfaceGrid);
    for (const b of bridges) {
      const spanNS = b.orientation !== 'ew';
      const mesh = spanNS
        ? this.modelFactory.landmarkModels.createBridge(b.rows, b.cols)
        : this.modelFactory.landmarkModels.createBridge(b.cols, b.rows);
      if (!spanNS) mesh.rotation.y = Math.PI / 2;
      const origin = gridToWorld(b.row, b.col, this.state.size);
      mesh.position.set(
        origin.x + ((b.cols - 1) * TILE_SIZE) / 2,
        0,
        origin.z + ((b.rows - 1) * TILE_SIZE) / 2
      );
      this.bridgeGroup.add(mesh);
    }
  }

  refreshRoadNeighbors(r, c) {
    if (!this.state) return;
    const size = this.state.size;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      if (this.state.surfaceGrid[nr][nc] === TileType.ROAD) {
        this.updateCell(nr, nc, false);
      }
    }
  }

  syncBuildings() {
    if (!this.state) return;
    const prevLayout = this.buildingLayout;
    const nextLayout = computeBuildingLayout(
      this.state.objectGrid,
      this.state.environment?.theme || 'urban'
    );
    this.buildingLayout = nextLayout;

    for (const [key, next] of nextLayout.entries()) {
      const prev = prevLayout.get(key);
      if (
        !prev ||
        prev.kind !== next.kind ||
        prev.part !== next.part ||
        prev.yaw !== next.yaw ||
        prev.style !== next.style
      ) {
        const [r, c] = key.split(',').map(Number);
        this.updateCell(r, c, false);
      }
    }
  }

  updateCell(r, c, updateNeighbors = true) {
    if (!this.state) return;
    const size = this.state.size;
    if (r < 0 || r >= size || c < 0 || c >= size) return;

    // Remove previous meshes for (r, c)
    if (this.surfaceCells[r][c]) {
      this.surfaceGroup.remove(this.surfaceCells[r][c]);
      this.surfaceCells[r][c] = null;
    }
    if (this.objectCells[r][c]) {
      this.objectGroup.remove(this.objectCells[r][c]);
      this.objectCells[r][c] = null;
    }

    const { x, z } = gridToWorld(r, c, size);
    const surface = this.state.surfaceGrid[r][c];
    const object = this.state.objectGrid[r][c];

    // Surface mesh
    let sMesh = null;
    if (surface === TileType.ROAD && this.modelFactory.createRoadBlock) {
      const isRoad = (rr, cc) => {
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) return false;
        return this.state.surfaceGrid[rr][cc] === TileType.ROAD || this.state.objectGrid[rr][cc] === TileType.BRIDGE;
      };
      const n = isRoad(r - 1, c);
      const e = isRoad(r, c + 1);
      const s = isRoad(r + 1, c);
      const w = isRoad(r, c - 1);
      const roadMask = (n ? 1 : 0) | (e ? 2 : 0) | (s ? 4 : 0) | (w ? 8 : 0);
      sMesh = this.modelFactory.createRoadBlock(x, z, roadMask, 0);
    } else if (surface === TileType.WATER) {
      sMesh = new THREE.Mesh(this.waterGeo, this.waterMat);
      sMesh.position.set(x, 0.01, z);
    } else if (surface === TileType.ICE) {
      sMesh = new THREE.Mesh(this.waterGeo, this.iceMat);
      sMesh.position.set(x, 0.01, z);
    } else if (surface === TileType.SAND && this.modelFactory.createSandBlock) {
      sMesh = this.modelFactory.createSandBlock(x, z);
    } else if (surface === TileType.GRASS && this.modelFactory.createGrassBlock) {
      sMesh = this.modelFactory.createGrassBlock(x, z);
    } else if (surface === TileType.STONE && this.modelFactory.createStoneBlock) {
      sMesh = this.modelFactory.createStoneBlock(x, z);
    } else if (surface === TileType.SWAMP && this.modelFactory.createSwampBlock) {
      sMesh = this.modelFactory.createSwampBlock(x, z);
    } else if (surface === TileType.OIL_SLICK && this.modelFactory.createOilSlickBlock) {
      sMesh = this.modelFactory.createOilSlickBlock(x, z);
    } else if (surface === TileType.RAIL && this.modelFactory.createRailBlock) {
      const isRail = (rr, cc) =>
        rr >= 0 && rr < size && cc >= 0 && cc < size && this.state.surfaceGrid[rr][cc] === TileType.RAIL;
      const railMask =
        (isRail(r - 1, c) ? 1 : 0) |
        (isRail(r, c + 1) ? 2 : 0) |
        (isRail(r + 1, c) ? 4 : 0) |
        (isRail(r, c - 1) ? 8 : 0);
      sMesh = this.modelFactory.createRailBlock(x, z, railMask);
    }

    if (sMesh) {
      this.surfaceGroup.add(sMesh);
      this.surfaceCells[r][c] = sMesh;
    }

    // Object mesh
    let oMesh = null;
    if (object === TileType.BRICK) {
      oMesh = this.modelFactory.createBrickBlock().group;
      oMesh.position.set(x, 0, z);
    } else if (object === TileType.CONCRETE) {
      oMesh = this.modelFactory.createConcreteBlock();
      oMesh.position.set(x, 0, z);
    } else if (object === TileType.FOREST) {
      oMesh = this.modelFactory.createForestBlock();
      oMesh.position.set(x, 0, z);
    } else if (object === TileType.HEDGEHOG) {
      oMesh = this.modelFactory.createHedgehogBlock();
      oMesh.position.set(x, 0, z);
    } else if (object === TileType.BARREL) {
      oMesh = this.modelFactory.createBarrelBlock();
      oMesh.position.set(x, 0, z);
    } else if (object === TileType.BOXES) {
      oMesh = this.modelFactory.createBoxesBlock();
      oMesh.position.set(x, 0, z);
    } else if (object === TileType.CRATER && this.modelFactory.createCraterBlock) {
      oMesh = this.modelFactory.createCraterBlock(x, z);
    } else if (object === TileType.WATER_TOWER && this.modelFactory.createWaterTowerBlock) {
      oMesh = this.modelFactory.createWaterTowerBlock();
      oMesh.position.set(x, 0, z);
    } else if (object === TileType.CONTAINER && this.modelFactory.createContainerBlock) {
      const isCont = (rr, cc) =>
        rr >= 0 && rr < size && cc >= 0 && cc < size && this.state.objectGrid[rr][cc] === TileType.CONTAINER;
      const ewLink = isCont(r, c - 1) || isCont(r, c + 1);
      const nsLink = isCont(r - 1, c) || isCont(r + 1, c);
      oMesh = this.modelFactory.createContainerBlock((r * 3 + c * 7) % 4, ewLink && !nsLink ? 'ew' : 'ns', ewLink || nsLink);
      oMesh.position.set(x, 0, z);
    } else if (object === TileType.TRANSFORMER && this.modelFactory.createTransformerBlock) {
      oMesh = this.modelFactory.createTransformerBlock();
      oMesh.position.set(x, 0, z);
    } else if (object === TileType.SANDBAGS && this.modelFactory.createSandbagsBlock) {
      const isBags = (rr, cc) =>
        rr >= 0 && rr < size && cc >= 0 && cc < size && this.state.objectGrid[rr][cc] === TileType.SANDBAGS;
      const bagMask =
        (isBags(r - 1, c) ? 1 : 0) |
        (isBags(r, c + 1) ? 2 : 0) |
        (isBags(r + 1, c) ? 4 : 0) |
        (isBags(r, c - 1) ? 8 : 0);
      oMesh = this.modelFactory.createSandbagsBlock(bagMask);
      oMesh.position.set(x, 0, z);
    } else if (object === TileType.RAIL_CAR && this.modelFactory.createRailCarBlock) {
      const isRail = (rr, cc) =>
        rr >= 0 && rr < size && cc >= 0 && cc < size && this.state.surfaceGrid[rr][cc] === TileType.RAIL;
      const ewRail = isRail(r, c - 1) || isRail(r, c + 1);
      const nsRail = isRail(r - 1, c) || isRail(r + 1, c);
      oMesh = this.modelFactory.createRailCarBlock(ewRail && !nsRail ? 'ew' : 'ns');
      oMesh.position.set(x, 0, z);
    } else if (object === TileType.RUBBLE) {
      oMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.45, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x71717a, roughness: 0.9 })
      );
      oMesh.position.set(x, 0.225, z);
    } else if (object === TileType.HOUSE_1 || object === TileType.HOUSE_2) {
      const b = this.buildingLayout.get(`${r},${c}`) || {
        kind: object === TileType.HOUSE_2 ? 'house2' : 'house1',
        part: 'corner',
        yaw: 0,
        style: 0,
      };
      const hp = BUILDING_MAX_HP[b.kind] || 25;
      oMesh = this.modelFactory.createBuildingBlock(b.kind, b.part, b.yaw, hp, hp, b.style).group;
      oMesh.position.set(x, 0, z);
    } else if (object === TileType.ENEMY_BASE) {
      oMesh = this.modelFactory.createEnemyBaseBlock();
      oMesh.position.set(x, 0, z);
    }

    if (oMesh) {
      this.objectGroup.add(oMesh);
      this.objectCells[r][c] = oMesh;
    }

    if (updateNeighbors) {
      this.refreshRoadNeighbors(r, c);
      this.syncBuildings();
      this.rebuildBridges();
    }
  }

  rebuildMarkers() {
    this.markerGroup.clear();
    if (!this.state) return;

    // Player spawn marker
    const sp = gridToWorld(this.state.playerSpawnCell.row, this.state.playerSpawnCell.col, this.state.size);
    const spMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.85, 0.35, 16),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x166534, emissiveIntensity: 0.6 })
    );
    spMesh.position.set(sp.x, 0.2, sp.z);
    this.markerGroup.add(spMesh);

    // Allied HQ marker
    const bPos = gridToWorld(this.state.baseCell.row, this.state.baseCell.col, this.state.size);
    const hqMesh = this.modelFactory.createCommandBaseBlock();
    hqMesh.position.set(bPos.x + TILE_SIZE / 2, 0, bPos.z);
    this.markerGroup.add(hqMesh);

    // Powerups
    const pColors = {
      REPAIR: 0x22c55e,
      EMP: 0x06b6d4,
      BASE_RESTORE: 0x60a5fa,
      APS: 0xa855f7,
      MISSILE: 0xf97316,
      AMMO: 0xeab308,
    };
    for (const p of this.state.powerups) {
      const pos = gridToWorld(p.row, p.col, this.state.size);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.1, 1.1),
        new THREE.MeshStandardMaterial({
          color: pColors[p.type] || 0xffffff,
          emissive: pColors[p.type] || 0xffffff,
          emissiveIntensity: 0.35,
        })
      );
      box.position.set(pos.x, 0.65, pos.z);
      this.markerGroup.add(box);
    }

    if (this.modelFactory.createCrushableProp) {
      const theme = this.state.environment?.theme || 'urban';
      for (const p of this.state.props || []) {
        const pos = gridToWorld(p.row, p.col, this.state.size);
        const mesh = this.modelFactory.createCrushableProp(p.kind, theme, p.row * 31 + p.col * 17);
        mesh.position.set(pos.x, 0, pos.z);
        if (p.rotation) mesh.rotation.y = (p.rotation * Math.PI) / 180;
        this.markerGroup.add(mesh);
      }
    }
  }

  rebuildLandmarks() {
    this.landmarkGroup.clear();
    if (!this.state || !this.modelFactory.landmarkModels) return;
    this.modelFactory.landmarkModels.clearLiveGroups?.();
    const kinds = this.state.landmarks3d.map((entry) => entry.kind);
    if (kinds.length > 0) {
      this.modelFactory.landmarkModels.ensureLoaded?.(kinds);
    }
    for (const entry of this.state.landmarks3d) {
      try {
        const lmPos = landmarkFootprintCenter(
          entry.kind,
          entry.row,
          entry.col,
          (rr, cc) => gridToWorld(rr, cc, this.state.size),
          entry.rotation || 0
        );
        const lmMesh = this.modelFactory.landmarkModels.create(entry.kind);
        lmMesh.position.set(lmPos.x, 0, lmPos.z);
        if (entry.rotation) lmMesh.rotation.y = (entry.rotation * Math.PI) / 180;
        this.landmarkGroup.add(lmMesh);
      } catch {
        // Ignore unknown landmark kinds
      }
    }
  }

  rebuildDecorations() {
    this.decoGroup.clear();
    this.urbanGroundTexture?.dispose?.();
    this.urbanGroundTexture = null;

    if (!this.state) return;
    const size = this.state.size;
    const theme = this.state.environment?.theme || 'urban';
    const rawDeco = this.state.decoration;
    let decoration = null;
    if (rawDeco) {
      try {
        decoration = normalizeDecoration({
          environment: this.state.environment,
          decoration: rawDeco,
        });
      } catch {
        decoration = null;
      }
    }

    if (theme === 'urban' || decoration) {
      const grid = Array.from({ length: size }, (_, r) =>
        Array.from({ length: size }, (__, c) => this.state.objectGrid[r][c] ?? this.state.surfaceGrid[r][c])
      );
      const groundHex = this.state.environment?.groundColor || '#687478';
      const parsedGround = Number.parseInt(String(groundHex).replace(/^#/, ''), 16);
      const sectorProxy = {
        id: this.state.raw?.id ?? 1,
        theme,
        groundColor: Number.isNaN(parsedGround) ? 0x687478 : parsedGround,
        grid,
        surfaceGrid: this.state.surfaceGrid,
        objectGrid: this.state.objectGrid,
        decoration,
      };
      try {
        this.urbanGroundTexture = createUrbanGroundTexture(sectorProxy, {
          maxTextureSize: this.renderer.capabilities.maxTextureSize,
        });
      } catch (err) {
        console.warn('Editor ground decoration texture failed:', err);
        this.urbanGroundTexture = null;
      }
    }

    if (this.urbanGroundTexture) {
      this.groundMat.map = this.urbanGroundTexture;
      this.groundMat.color.set('#ffffff');
    } else {
      this.groundMat.map = null;
      this.groundMat.color.set(this.state.environment?.groundColor || '#687478');
    }
    this.groundMat.needsUpdate = true;
  }

  _pickCell(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return worldToGrid(hit.x, hit.z, this.state?.size || GRID_SIZE);
  }

  _updateCursor(cell) {
    if (!cell) {
      this.cursorMesh.visible = false;
      return;
    }
    const size = this.state?.size || GRID_SIZE;
    const offset = ((this.brushSize - 1) * TILE_SIZE) / 2;
    const pos = gridToWorld(cell.row, cell.col, size);
    this.cursorMesh.position.set(pos.x + offset, 0.05, pos.z + offset);
    this.cursorMesh.visible = true;
  }

  _updateCamera() {
    const sinP = Math.sin(this.camPolar);
    const cosP = Math.cos(this.camPolar);
    const sinA = Math.sin(this.camAzimuth);
    const cosA = Math.cos(this.camAzimuth);

    this.camera.position.set(
      this.camTarget.x + this.camDistance * sinP * sinA,
      this.camTarget.y + this.camDistance * cosP,
      this.camTarget.z + this.camDistance * sinP * cosA
    );
    this.camera.lookAt(this.camTarget);
  }

  _bindEvents() {
    const el = this.renderer.domElement;

    el.addEventListener('contextmenu', (e) => e.preventDefault());

    el.addEventListener('pointerdown', (e) => {
      this.lastPointer = { x: e.clientX, y: e.clientY };
      if (e.button === 2 || e.button === 1) {
        this.dragMode = 'pan';
        return;
      }
      if (e.button === 0 && e.altKey && !this.callbacks.isEyedropperActive?.()) {
        // Alt+Click eyedropper if stationary, or orbit if dragged; handle eyedropper on click
        this.dragMode = 'orbit';
        this._orbitMoved = false;
        return;
      }
      if (e.button === 0) {
        this.dragMode = 'paint';
        const cell = this._pickCell(e.clientX, e.clientY);
        if (cell) this.callbacks.onPointerDownCell?.(cell, e);
      }
    });

    window.addEventListener('pointermove', (e) => {
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };

      if (this.dragMode === 'pan') {
        const panScale = this.camDistance * 0.0014;
        const forward = new THREE.Vector3(-Math.sin(this.camAzimuth), 0, -Math.cos(this.camAzimuth));
        const right = new THREE.Vector3(Math.cos(this.camAzimuth), 0, -Math.sin(this.camAzimuth));
        this.camTarget.addScaledVector(right, -dx * panScale);
        this.camTarget.addScaledVector(forward, dy * panScale);
        this._updateCamera();
        return;
      }

      if (this.dragMode === 'orbit') {
        if (Math.abs(dx) + Math.abs(dy) > 2) this._orbitMoved = true;
        this.camAzimuth -= dx * 0.007;
        if (!this.isTopDown) {
          this.camPolar = Math.max(0.15, Math.min(1.35, this.camPolar - dy * 0.006));
        }
        this._updateCamera();
        return;
      }

      const cell = this._pickCell(e.clientX, e.clientY);
      this._updateCursor(cell);
      this.callbacks.onHoverCell?.(cell);
      if (this.dragMode === 'paint' && cell) {
        this.callbacks.onPointerDragCell?.(cell, e);
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (this.dragMode === 'orbit' && !this._orbitMoved && e.altKey) {
        const cell = this._pickCell(e.clientX, e.clientY);
        if (cell) this.callbacks.onEyedropperCell?.(cell);
      } else if (this.dragMode === 'paint') {
        const cell = this._pickCell(e.clientX, e.clientY);
        this.callbacks.onPointerUpCell?.(cell, e);
      }
      this.dragMode = null;
    });

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.camDistance = Math.max(16, Math.min(130, this.camDistance + e.deltaY * 0.06));
        this._updateCamera();
      },
      { passive: false }
    );

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      this.keysDown.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keysDown.delete(e.code));

    new ResizeObserver(() => {
      const w = this.container.clientWidth || 800;
      const h = this.container.clientHeight || 600;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }).observe(this.container);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    // Smooth keyboard pan & rotate
    const panSpeed = 0.65;
    const forward = new THREE.Vector3(-Math.sin(this.camAzimuth), 0, -Math.cos(this.camAzimuth));
    const right = new THREE.Vector3(Math.cos(this.camAzimuth), 0, -Math.sin(this.camAzimuth));
    let moved = false;
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) {
      this.camTarget.addScaledVector(forward, panSpeed);
      moved = true;
    }
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) {
      this.camTarget.addScaledVector(forward, -panSpeed);
      moved = true;
    }
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) {
      this.camTarget.addScaledVector(right, -panSpeed);
      moved = true;
    }
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) {
      this.camTarget.addScaledVector(right, panSpeed);
      moved = true;
    }
    if (this.keysDown.has('KeyQ')) {
      this.camAzimuth += 0.03;
      moved = true;
    }
    if (this.keysDown.has('KeyE')) {
      this.camAzimuth -= 0.03;
      moved = true;
    }
    if (moved) this._updateCamera();

    this.renderer.render(this.scene, this.camera);
  }
}
