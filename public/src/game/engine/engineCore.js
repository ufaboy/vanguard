import { BoxPowerUpPool } from '../terrains/boxes-loot.js';
import { normalizeComponentDamage, effectiveUpgradeTiers } from '../../sim/component-damage.js';
/** Core Three.js WebGL game loop, combat physics, and simulation. */

import { isCampaignMissionUnlocked } from '../campaign.js';
import * as THREE from 'three';
import { SurvivalDirector, ContractDirector } from './mode-directors.js';
import { AiDebugOverlay } from './ai-debug-overlay.js';
import { HangarOps } from './hangar-ops.js';
import { BossCombat } from './boss-combat.js';
import { DefenseTurretsController } from './defense-turrets.js';
import { buildHudSnapshot } from './hud-snapshot.js';
import { ForestFireController } from '../terrains/forest-fire.js';
import { ProfileSaveController } from './profile-save.js';
import { PowerupsController } from './powerups-controller.js';
import { InputCameraController } from './input-camera.js';
import { PhysicsController } from './physics.js';
import { ExplosionsController } from './explosions.js';
import { TerrainDestructionController } from './terrain-destruction.js';
import { SectorLoaderController } from './sector-loader.js';
import { ProjectilesController } from './projectiles.js';
import { EnemySpawnerController } from './enemy-spawner.js';
import { EnemyCombatController } from './enemy-combat.js';
import { PlayerController } from './player-controller.js';
import { EnemyAiController } from './enemy-ai.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  APS,
  TITAN,
  CANNON_AMMO,
  MISSILE,
  POWERUP_TYPES,
} from '../constants.js';
import { GameStatus } from '../types.js';
import { PLAYER_TANK_CONFIG } from '../tanks.js';
import {
  GRID_SIZE,
  SECTORS,
  TILE_SIZE,
  getBaseLayout,
} from '../levels.js';
import { ModelFactory } from '../render/models.js';
import { TileBatcher } from '../render/tile-batcher.js';
import { autoDisposeOwned, disposeOwned } from '../render/dispose.js';
import { FxSystem, createProjectileVisual } from '../effects/index.js';
import { sound } from '../sound.js';
import { ARMOR_PANEL_CATALOG, TERRAIN_SURFACES } from '../../sim/catalog.js';
import { createRepairKitState, createTankSubsystems } from '../../sim/subsystems.js';
import { resolveAssembledTank, SaveRepository, settleMission } from '../../sim/hangar.js';

/** Graphics quality presets. Pixel ratio, shadows and particle budget apply immediately;. */
export const QUALITY_PRESETS = Object.freeze({
  low: { label: 'Low', pixelRatio: 1, shadows: false, fx: 0.55, antialias: false, physicalWater: false },
  medium: { label: 'Medium', pixelRatio: 1.5, shadows: true, fx: 0.8, antialias: true, physicalWater: false },
  high: { label: 'High', pixelRatio: 2, shadows: true, fx: 1, antialias: true, physicalWater: true },
});
const IDLE_SCREEN_FPS = 15;
/** Half-amplitude (radians) of the KAMIKAZE zigzag during its final charge. */

export class TankGameEngine {
  constructor(container, onHudUpdate, options = {}) {
    this.container = container;
    this.quality = QUALITY_PRESETS[options.quality] ? options.quality : 'high';
    this.fpsCap = options.fpsCap ?? 60;
    this.onHudUpdate = onHudUpdate;
    this.frameId = 0;
    this.isDisposed = false;

    this.cameraPreset = 'ISOMETRIC';
    this.cameraAzimuth = Math.PI * 0.25;
    this.cameraRotating = false;
    this.cameraDragPrevX = 0;
    this.aiDebugMode = false;
    this.inspectMode = false;

    this.frustumSize = 25;
    this.camCurrentLook = new THREE.Vector3(0, 0, 0);
    this.screenShake = 0;

    this.keys = {};
    this.mouseNdc = new THREE.Vector2(0, 0);
    this.aimWorld = new THREE.Vector3(0, 0, 0);
    this.raycaster = new THREE.Raycaster();
    this.isMouseDown = false;
    this._pendingTimeouts = new Set();

    this.status = GameStatus.MENU;
    this.currentSectorIndex = 0;
    this.upgrades = {
      cannon: 1,
      chassis: 1,
      frame: 1,
      engine: 1,
      armor: 1,
    };

    this.campaignSaveRepo = new SaveRepository(
      'iron_vanguard_player_save_v1',
      typeof localStorage !== 'undefined' ? localStorage : null
    );
    this.survivalSaveRepo = new SaveRepository(
      'iron_vanguard_survival_save_v1',
      typeof sessionStorage !== 'undefined' ? sessionStorage : null
    );
    this.contractSaveRepo = new SaveRepository(
      'iron_vanguard_contract_save_v1',
      typeof sessionStorage !== 'undefined' ? sessionStorage : null
    );
    this.profileMode = 'campaign';
    this.saveRepo = this.campaignSaveRepo;
    this.playerSave = this.saveRepo.loadPlayerSave();
    this.componentDamage = normalizeComponentDamage(this.playerSave.componentDamage);
    this.componentDamageCooldown = Math.max(0, Math.min(8, Number(this.playerSave.componentDamageCooldown) || 0));
    this.wasDefeated = false;
    this.assembledTank = resolveAssembledTank(this.playerSave);
    this.subsystems = createTankSubsystems();
    const savedRepairCharges = Number.isInteger(this.playerSave?.repairKitCharges)
      ? this.playerSave.repairKitCharges
      : 0;
    this.repairKitState = createRepairKitState(savedRepairCharges);
    this.playerArmorPanels = {
      SOCKET_ARMOR_FRONT: { ...ARMOR_PANEL_CATALOG.sb_40, integrity: 100, destroyed: false },
      SOCKET_ARMOR_LEFT: { ...ARMOR_PANEL_CATALOG.ekran_b25_left, integrity: 70, destroyed: false },
      SOCKET_ARMOR_RIGHT: { ...ARMOR_PANEL_CATALOG.ekran_b25_right, integrity: 70, destroyed: false },
      SOCKET_ARMOR_TURRET: { ...ARMOR_PANEL_CATALOG.turret_cheek_35, integrity: 85, destroyed: false },
    };
    this.smokeClouds = [];
    this.inSmoke = false;
    this.smokeCharges = 3;
    this.smokeCooldown = 0;
    this.priorityTargetId = null;
    this.sensorContacts = new Map();
    this.lootContainers = [];
    this.activeMissionRun = null;
    this.lastSettlementSummary = null;
    this.currentSurface = TERRAIN_SURFACES.dirt;
    this.playerForwardSpeed = 0;

    this.playerX = 0;
    this.playerZ = 12;
    this.playerVx = 0;
    this.playerVz = 0;
    this.playerHullAngle = Math.PI;
    this.playerTurretAngle = Math.PI;
    this.playerHp = PLAYER_TANK_CONFIG.base.hp;
    this.playerMaxHp = PLAYER_TANK_CONFIG.base.hp;
    this.playerFireCooldown = 0;
    this.playerMaxFireCooldown = 1.25;
    this.playerRecoil = 0;
    this.playerBarrelRecoils = [0, 0];
    this.playerSalvoShot = 0;
    this.playerSalvoResetTimer = 0;
    this.playerFlashTimer = 0;

    this.apsAmmo = Array.isArray(this.playerSave?.apsAmmo)
      ? [...this.playerSave.apsAmmo]
      : [...APS.INITIAL_PER_LAUNCHER];
    this.apsRearmTimer = 0;
    this.missileAmmo = Number.isInteger(this.playerSave.missileAmmo)
      ? Math.max(0, Math.min(MISSILE.MAX_AMMO, this.playerSave.missileAmmo)) : 2;
    this.cannonAmmo = CANNON_AMMO.START_ROUNDS;
    this.cannonBaseRearmTimer = 0;
    this.missileCooldown = 0;
    this.repairKitCount = 1;
    this.empTimer = 0;
    this.jammedTimer = 0;
    this.baseRepairSparkTimer = 0;
    this.inBaseRepairZone = false;
    this.isHangarOpen = false;
    this.isHangarPaused = false;
    this.isAdPaused = false;
    this.creditsEarnedThisMission = 0;
    this.baseAlive = true;
    this.enemyBaseAlive = false;
    this._enemyBaseCell = null;
    this.inForest = false;
    this.inSmoke = false;
    this.onIce = false;

    this.grid = [];
    this.componentWaterEgress = false;

    this._spawnerCells = null;
    this.mapGroup = new THREE.Group();
    this.tileBatcher = new TileBatcher(this.mapGroup);
    this.sceneOccluded = false;
    this.entityGroup = new THREE.Group();
    this.fxGroup = new THREE.Group();
    autoDisposeOwned(this.mapGroup);
    autoDisposeOwned(this.entityGroup);
    autoDisposeOwned(this.fxGroup);

    this.enemies = [];
    this.projectiles = [];
    this.mines = [];
    this.lasers = [];
    this.hazardZones = [];
    this.burningForests = [];
    this.enemySpawner.clearPendingTimeouts();
    this.pendingBarrelExplosions = [];
    this.particles = [];
    this.powerUps = [];
    this.boxPowerUpPool = new BoxPowerUpPool();

    this.nextEnemyId = 1;
    this.vanguardRemainingToSpawn = 0;
    this.spawnPoolCursor = 0;
    this.spawnTimer = 0;
    this.bossSpawned = false;
    this.statusBannerTimer = 0;
    this.statusMessage = null;

    this.kills = 0;
    this.blocksDestroyed = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.hudSyncAccumulator = 0;

    this.profileSave.loadSavedProgress();
    this.recomputePlayerStats(false);

    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && QUALITY_PRESETS[this.quality].antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight
    );

    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1120);
    this.scene.fog = new THREE.FogExp2(0x0b1120, 0.012);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    const aspect =
      (container.clientWidth || window.innerWidth) /
      (container.clientHeight || window.innerHeight);
    this.camera = new THREE.OrthographicCamera(
      (-this.frustumSize * aspect) / 2,
      (this.frustumSize * aspect) / 2,
      this.frustumSize / 2,
      -this.frustumSize / 2,
      0.1,
      300
    );
    this.camera.position.set(28, 34, 28);
    this.camera.lookAt(0, 0, 0);

    this.modelFactory = new ModelFactory(this.renderer, this.isSoftwareGl, options.pregenerated);
    this.modelFactory.onBrickModelsReady = () => {
      if (this.isDisposed) return;
      this.mapGroup.traverse(node => {
        if (node.userData.brickHp !== undefined) {
          this.modelFactory.updateBrickBlockDamage(node, node.userData.brickHp);
          this.tileBatcher.markDirty(node);
        }
      });
    };
    this.setupLighting();
    this.fx = new FxSystem({ lowQuality: this.isSoftwareGl, light: this.explosionLight });
    this.applyQuality();
    this.setupStaticEnvironment();
    this.setupAimReticle();

    this.scene.add(this.mapGroup);
    this.scene.add(this.tileBatcher.root);
    this.scene.add(this.entityGroup);
    this.scene.add(this.fxGroup);
    this.scene.add(this.fx.root);

    this.loadSector(0, false);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
      this.warmupEffectShaders();
      this.modelFactory.onModelReady = (model) => this.warmupTankShaders(model);
    }

    this.inputCamera.bindEvents();
    this.clock = new THREE.Timer();
    this.clock.connect(document);
    this.emitHudUpdate();
    this.startLoop();
  }

  get profileSave() {
    return (this._profileSave ||= new ProfileSaveController(this));
  }

  saveProgress() {
    this.profileSave.saveProgress();
  }

  syncCampaignCredits() {
    this.profileSave.syncCampaignCredits();
  }

  setProfileMode(mode = 'campaign', options = {}) {
    this.profileSave.setProfileMode(mode, options);
  }

  applyUpgrades(newUpgrades) {
    this.profileSave.applyUpgrades(newUpgrades);
  }

  startSector(sectorIdx) {
    this.profileSave.startSector(sectorIdx);
  }

  setCameraPreset(preset) {
    this.inspectMode = false;
    this.cycleCameraPreset(preset);
  }

  /** Switches the graphics quality preset (see QUALITY_PRESETS). */
  setQuality(quality) {
    if (!QUALITY_PRESETS[quality] || quality === this.quality) return;
    this.quality = quality;
    this.applyQuality();
  }

  applyQuality() {
    const preset = QUALITY_PRESETS[this.quality];
    const pixelRatio = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, preset.pixelRatio);
    if (this.renderer.getPixelRatio() !== pixelRatio) this.renderer.setPixelRatio(pixelRatio);

    const shadows = !this.isSoftwareGl && preset.shadows;
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.keyLight.castShadow = shadows;
      this.scene.traverse((node) => {
        if (!node.material) return;
        (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => {
          m.needsUpdate = true;
        });
      });
    }

    const fxScale = this.isSoftwareGl ? Math.min(0.55, preset.fx) : preset.fx;
    if (this.fx) this.fx.q = fxScale;
    this.modelFactory?.setQuality({ physicalWater: preset.physicalWater });
  }

  /** Compiles the shaders of objects that only appear mid-fight (shells, mines, power-ups). */
  warmupEffectShaders() {
    const group = new THREE.Group();
    group.add(this.modelFactory.createLandMineMesh());
    for (const type of Object.keys(POWERUP_TYPES)) group.add(this.modelFactory.createPowerUpMesh(type));
    group.add(createProjectileVisual(0xffb030, {}));
    Promise.all([
      this.renderer.compileAsync(group, this.camera, this.scene),
      this.renderer.compileAsync(this.fx.root, this.camera, this.scene),
    ])
      .catch(() => {})
      .finally(() => disposeOwned(group));
  }

  /** Compiles a freshly loaded tank model's shaders on a throwaway rig (see onModelReady). */
  warmupTankShaders(model) {
    if (this.isDisposed) return;
    const rig = model === 'player' ? this.playerRig : this.modelFactory.createEnemyTank(model);
    if (!rig) return;
    this.renderer
      .compileAsync(rig.root, this.camera, this.scene)
      .catch(() => {})
      .finally(() => {
        if (model !== 'player') disposeOwned(rig.root);
      });
  }

  /** Frame-rate cap in fps (0 = unlimited, follow the display refresh rate). */
  setFpsCap(fps) {
    this.fpsCap = Math.max(0, Number(fps) || 0);
  }

  /** Minimum time between rendered frames in ms (0 = render every display refresh). */
  getFrameInterval() {
    const resultScreen =
      this.status === GameStatus.PAUSED ||
      this.status === GameStatus.VICTORY ||
      this.status === GameStatus.GAME_OVER;
    if (resultScreen && !this.isHangarOpen && !this.inspectMode && !this.cameraRotating) {
      return 1000 / IDLE_SCREEN_FPS;
    }
    return this.fpsCap > 0 ? 1000 / this.fpsCap : 0;
  }

  /** The UI reports whether an opaque screen fully hides the 3D canvas. */
  setSceneOccluded(occluded) {
    this.sceneOccluded = Boolean(occluded);
  }

  setInspectMode(enabled) {
    this.inspectMode = Boolean(enabled);
    if (this.inspectMode) {
      this.frustumSize = 11.5;
      this.handleResize?.();
    } else {
      this.cycleCameraPreset(this.cameraPreset);
    }
  }

  get effectiveUpgrades() {
    return effectiveUpgradeTiers(this.upgrades, this.componentDamage);
  }

  recomputePlayerStats(preserveRatio = true) { this.playerController.recomputePlayerStats(preserveRatio); }

  getPlayerMaxCannonAmmo() { return this.playerController.getPlayerMaxCannonAmmo(); }

  getPlayerMaxApsAmmo() { return this.playerController.getPlayerMaxApsAmmo(); }

  getPlayerMaxMissileAmmo() { return this.playerController.getPlayerMaxMissileAmmo(); }

  addApsRounds(count) { this.playerController.addApsRounds(count); }

  syncApsVisuals() { this.playerController.syncApsVisuals(); }

  setupLighting() {
    this.hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.78);
    this.hemiLight.position.set(0, 60, 0);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfffbeb, 1.65);
    this.keyLight.position.set(36, 56, 30);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.width = 1024;
    this.keyLight.shadow.mapSize.height = 1024;
    const d = 44;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.camera.near = 5;
    this.keyLight.shadow.camera.far = 160;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
    rimLight.position.set(-38, 30, -34);
    this.scene.add(rimLight);

    this.explosionLight = new THREE.PointLight(0xf97316, 0, 20, 2);
    this.explosionLight.position.set(0, 2.5, 0);
    this.scene.add(this.explosionLight);
  }

  setupStaticEnvironment() {
    const arenaSpan = GRID_SIZE * TILE_SIZE;
    const groundMat = new THREE.MeshStandardMaterial({
      map: this.modelFactory.groundTex,
      roughness: 0.85,
      metalness: 0.1,
    });
    this.groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(arenaSpan, arenaSpan),
      groundMat
    );
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.legacyGroundDecal = this.modelFactory.createGroundDecalMesh(arenaSpan);
    this.groundMesh.add(this.legacyGroundDecal);
    this.scene.add(this.groundMesh);

    this.perimeterMesh = this.modelFactory.createOutdoorPerimeter();
    this.scene.add(this.perimeterMesh);
  }

  get survivalDirector() { return (this._survivalDirector ||= new SurvivalDirector(this)); }
  get contractDirector() { return (this._contractDirector ||= new ContractDirector(this)); }
  get aiDebugOverlay() { return (this._aiDebugOverlay ||= new AiDebugOverlay(this)); }
  get hangarOps() { return (this._hangarOps ||= new HangarOps(this)); }
  get bossCombat() { return (this._bossCombat ||= new BossCombat(this)); }
  get defenseTurretsCtrl() { return (this._defenseTurretsCtrl ||= new DefenseTurretsController(this)); }
  get forestFire() { return (this._forestFire ||= new ForestFireController(this)); }

  setupAimReticle() {
    this.aimReticle = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(0.45, 0.58, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.06;
    this.aimReticle.add(ring);

    const dotGeo = new THREE.CircleGeometry(0.12, 12);
    dotGeo.rotateX(-Math.PI / 2);
    const dot = new THREE.Mesh(dotGeo, ringMat);
    dot.position.y = 0.06;
    this.aimReticle.add(dot);

    this.scene.add(this.aimReticle);
  }

  get sectorLoader() {
    return (this._sectorLoader ||= new SectorLoaderController(this));
  }

  gridToWorld(row, col) {
    return this.sectorLoader.gridToWorld(row, col);
  }

  worldToGrid(x, z) {
    return this.sectorLoader.worldToGrid(x, z);
  }

  loadSector(sectorIdx, startPlaying = true) {
    this.sectorLoader.loadSector(sectorIdx, startPlaying);
  }

  clearGroup(group) {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
    }
  }

  setStatusBanner(msg, duration = 2.8) {
    this.statusMessage = msg;
    this.statusBannerTimer = duration;
    this.emitHudUpdate();
  }

  get enemySpawner() {
    return (this._enemySpawner ||= new EnemySpawnerController(this));
  }

  get enemyCombat() {
    return (this._enemyCombat ||= new EnemyCombatController(this));
  }

  get playerController() {
    return (this._playerController ||= new PlayerController(this));
  }

  get enemyAi() {
    return (this._enemyAi ||= new EnemyAiController(this));
  }

  /** Spawner cells, cached until a cell changes type (see invalidateSpawnerCache). */
  getSpawnerCells() {
    return this.enemySpawner.getSpawnerCells();
  }

  getSpawnPosition() {
    return this.enemySpawner.getSpawnPosition();
  }

  resolveBorderSpawn(targetCell, opts = {}) {
    return this.enemySpawner.resolveBorderSpawn(targetCell, opts);
  }

  spawnVanguardEnemy() {
    return this.enemySpawner.spawnVanguardEnemy();
  }

  callNextSurvivalWave() { return this.survivalDirector.callNextWave(); }

  spawnSpecificEnemy(enemyClass) {
    this.enemySpawner.spawnSpecificEnemy(enemyClass);
  }

  spawnBossEntry(sector, bossClass, bossCell) {
    this.enemySpawner.spawnBossEntry(sector, bossClass, bossCell);
  }

  spawnSectorBoss(overrideBossClass = null, overrideBossName = null) {
    this.enemySpawner.spawnSectorBoss(overrideBossClass, overrideBossName);
  }

  getEnemyLoadoutStats(enemyClass) {
    return this.enemySpawner.getEnemyLoadoutStats(enemyClass);
  }

  createEnemyAt(enemyClass, x, z, isBoss, entryTarget = null) {
    this.enemySpawner.createEnemyAt(enemyClass, x, z, isBoss, entryTarget);
  }

  /** Persists RM-1 Field Repair Kit charges to playerSave outside Survival sessions. */

  activateModuleSlot(slotNumber) { this.playerController.activateModuleSlot(slotNumber); }

  deploySmokeCloud(x, z, radius = 9.5, duration = 8.0) { this.playerController.deploySmokeCloud(x, z, radius, duration); }

  isPointInSmoke(x, z) { return this.playerController.isPointInSmoke(x, z); }

  isSegmentInSmoke(x0, z0, x1, z1) { return this.playerController.isSegmentInSmoke(x0, z0, x1, z1); }

  mountHangarPart(instanceId, socketId = null) { return this.hangarOps.mountPart(instanceId, socketId); }

  setHangarOpen(open) { return this.hangarOps.setOpen(open); }

  persistComponentDamage() { this.hangarOps.persistComponentDamage(); }

  tryDamageComponent(damage, hit) { this.hangarOps.tryDamageComponent(damage, hit); }

  repairComponentInHangar(track) { return this.hangarOps.repairComponent(track); }

  restoreAllComponents() { this.hangarOps.restoreAllComponents(); }

  upgradeTrackInHangar(track) { return this.hangarOps.upgradeTrack(track); }

  buyCannonAmmoInHangar() { return this.hangarOps.buyCannonAmmo(); }

  buyMissileInHangar() { return this.hangarOps.buyMissile(); }

  buyApsChargeInHangar() { return this.hangarOps.buyApsCharge(); }

  toggleFavoritePart(instanceId) { this.hangarOps.toggleFavoritePart(instanceId); }

  abortMissionToHangar() { this.hangarOps.abortMissionToHangar(); }

  get inputCamera() {
    return (this._inputCamera ||= new InputCameraController(this));
  }

  startMission(sectorIdx) {
    const index = typeof sectorIdx === 'number' ? sectorIdx : this.currentSectorIndex;
    const targetSector = SECTORS[index];
    if (
      !Number.isInteger(index) ||
      !targetSector ||
      (targetSector.gameMode !== 'contract' &&
        targetSector.gameMode !== 'survival' &&
        !isCampaignMissionUnlocked(targetSector.mapId, this.playerSave.completedMissions))
    ) {
      return;
    }
    if (this.status === GameStatus.GAME_OVER || this.wasDefeated) {
      this.restoreAllComponents();
      this.wasDefeated = false;
    }
    if (typeof sectorIdx === 'number') {
      this.currentSectorIndex = sectorIdx;
    }
    this.kills = 0;
    this.blocksDestroyed = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.loadSector(this.currentSectorIndex, true);
  }

  syncAudioPauseState() {
    const audioPaused =
      this.status === GameStatus.PAUSED ||
      Boolean(this.isHangarPaused) ||
      Boolean(this.isAdPaused);
    sound.setPaused(audioPaused);
  }

  /** Pauses or resumes simulation, input, and audio around ad breaks. */
  setAdPaused(paused) {
    const next = Boolean(paused);
    if (this.isAdPaused === next) return;
    this.isAdPaused = next;
    this.keys = {};
    this.isMouseDown = false;
    this.cameraRotating = false;
    this.syncAudioPauseState();
    if (!next && this.status === GameStatus.PLAYING) {
      this.renderer?.domElement?.focus?.({ preventScroll: true });
    }
    this.emitHudUpdate();
  }

  /** Grants bonus credits (e.g. from voluntary rewarded ads) and persists to save. */
  grantCredits(amount) {
    return this.profileSave.grantCredits(amount);
  }

  togglePause() {
    if (this.status === GameStatus.PLAYING) {
      this.status = GameStatus.PAUSED;
    } else if (this.status === GameStatus.PAUSED) {
      this.status = GameStatus.PLAYING;
    }
    this.syncAudioPauseState();
    this.emitHudUpdate();
  }

  firePlayerHomingMissile() { this.playerController.firePlayerHomingMissile(); }

  cycleCameraPreset(preset) {
    return this.inputCamera.cycleCameraPreset(preset);
  }

  get powerupsController() {
    return (this._powerupsController ||= new PowerupsController(this));
  }

  spawnPowerUpOnField(type) {
    this.powerupsController.spawnPowerUpOnField(type);
  }

  createPowerUpEntity(type, x, z) {
    return this.powerupsController.createPowerUpEntity(type, x, z);
  }

  startLoop() {
    const afterDraw = (cb) => {
      const gl = this.renderer.getContext();
      if (!gl || !gl.fenceSync) {
        this.frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.isDisposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    };

    this.lastFrameTime = 0;
    const tick = (now = performance.now()) => {
      if (this.isDisposed) return;

      const interval = this.isSoftwareGl ? 0 : this.getFrameInterval();
      if (interval > 0) {
        const since = now - this.lastFrameTime;
        if (since < interval - 1) {
          this.frameId = requestAnimationFrame(tick);
          return;
        }
        const overshoot = since >= interval ? since % interval : 0;
        this.lastFrameTime = now - Math.min(overshoot, interval / 2);
      } else {
        this.lastFrameTime = now;
      }

      this.clock.update();
      const rawDelta = this.clock.getDelta();
      const dt = Math.min(rawDelta, 0.05);

      if (!this.sceneOccluded) {
        this.update(dt);
        this.modelFactory?.updateAnimatedTextures(dt);
        if (this.isHangarOpen) {
          if (!this._hangarWindowEl?.isConnected) {
            this._hangarWindowEl = document.querySelector('.hangar-stage-window');
          }
          this.hangarStage.render(this.renderer, this._hangarWindowEl?.getBoundingClientRect());
        } else {
          this.tileBatcher.sync();
          this.renderer.render(this.scene, this.camera);
        }
      }

      if (this.isSoftwareGl) {
        afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    tick();
  }

  update(dt) {
    const elapsed = this.clock.getElapsed();
    if (this.isHangarOpen) {
      this.hangarStage.update(dt, this.effectiveUpgrades, this.missileAmmo, this.apsAmmo, elapsed);
      return;
    }

    sound.setListener(this.playerX, this.playerZ, this.playerStats?.sightRadius || 28.0);

    this.aimReticle.position.set(this.aimWorld.x, 0, this.aimWorld.z);
    this.aimReticle.rotation.y = elapsed * 2.2;

    if (this.explosionLight.intensity > 0) {
      this.explosionLight.intensity = THREE.MathUtils.damp(
        this.explosionLight.intensity,
        0,
        10,
        dt
      );
    }

    if (this.statusBannerTimer > 0) {
      this.statusBannerTimer -= dt;
      if (this.statusBannerTimer <= 0) {
        this.statusMessage = null;
        this.emitHudUpdate();
      }
    }

    if (this.isHangarPaused || this.isAdPaused) {
      if (this.playerRig) {
        this.playerRig.turret.rotation.y = this.playerHullAngle + Math.sin(elapsed * 0.85) * 0.55;
        this.playerController.syncPlayerVisuals(dt * 1.2, elapsed);
      }
      this.updateParticles(dt);
      this.inputCamera.updateCamera(dt, elapsed);
      this.fx.update(dt, this.camera, this.renderer);
      return;
    }

    if (this.status === GameStatus.PLAYING) {
      this.componentDamageCooldown = Math.max(0, this.componentDamageCooldown - dt);
      this.updatePlayer(dt, elapsed);
      this.playerController.updateBaseMaintenance(dt);
      this.updateApsInterception(dt);
      this.updateSpawnerLogic(dt);
      if (this.contractState) {
        this.contractDirector.update(dt, elapsed);
      }
      this.updateEnemies(dt, elapsed);
      this.defenseTurretsCtrl.update(dt, elapsed);
      this.updateProjectiles(dt);
      this.updateMines(dt, elapsed);
      this.updateLasers(dt);
      this.explosions.updateHazardZones(dt, elapsed);
      this.updatePowerUps(dt, elapsed);
      this.playerController.updateSmokeAndLoot(dt);
      this.updateBarrelExplosions(dt);
      this.updateBrickRubble(dt);
      this.forestFire.update(dt, elapsed);
    } else if (this.playerRig) {
      const canHover = Boolean(this.playerStats?.canHover);
      const hoverY = canHover ? 0.05 + Math.sin(elapsed * 4.0) * 0.012 : 0;
      this.playerRig.root.position.set(this.playerX, hoverY, this.playerZ);
      if (this.inspectMode) {
        this.playerRig.turret.rotation.y = this.playerHullAngle + Math.sin(elapsed * 0.85) * 0.55;
      }
      this.playerController.syncPlayerVisuals(dt * 1.2, elapsed);
    }

    this.updateParticles(dt);
    this.inputCamera.updateCamera(dt, elapsed);
    this.fx.update(dt, this.camera, this.renderer);

    this.hudSyncAccumulator += dt;
    const hudInterval = this.status === GameStatus.PLAYING ? 0.12 : 0.5;
    if (this.hudSyncAccumulator >= hudInterval) {
      this.hudSyncAccumulator = 0;
      this.emitHudUpdate();
    }
  }

  updatePlayer(dt, elapsed) { this.playerController.updatePlayer(dt, elapsed); }

  getBaseLayout() {
    return this.sectorLoader.getBaseLayout();
  }

  /** World centre of the two-cell Allied HQ. */

  setBasePerimeterMaterial(targetType) {
    this.sectorLoader.setBasePerimeterMaterial(targetType);
  }

  updateApsInterception() { this.playerController.updateApsInterception(); }

  tryPlayerFire() { this.playerController.tryPlayerFire(); }

  startContractCargoLoad() { return this.contractDirector.startCargoLoad(); }

  startContractExtract() { return this.contractDirector.startExtract(); }

  detonateSabotageRelay(relay) { this.contractDirector.detonateSabotageRelay(relay); }

  updateSpawnerLogic(dt) {
    this.enemySpawner.updateSpawnerLogic(dt);
  }

  /** Checks optical line-of-sight between two world coordinates (x0, z0) and (x1, z1). */

  hasLineOfSight(x0, z0, x1, z1) { return this.enemyAi.hasLineOfSight(x0, z0, x1, z1); }

  broadcastPlayerLocationFrom(spotter, targetX, targetZ) { this.enemyAi.broadcastPlayerLocationFrom(spotter, targetX, targetZ); }

  enemyRoleTarget(e, situation) { return this.enemyAi.enemyRoleTarget(e, situation); }

  enemyBaseCell() { return this.enemyAi.enemyBaseCell(); }

  getEnemyBaseCenter() { return this.enemyAi.getEnemyBaseCenter(); }

  updateEnemyMovement(e, dt, elapsed, situation) { this.enemyAi.updateEnemyMovement(e, dt, elapsed, situation); }

  bossBrainOverrides(enemyClass) { return this.enemyAi.bossBrainOverrides(enemyClass); }

  updateSquadDirector(dt, spottedLastFrame) { this.enemyAi.updateSquadDirector(dt, spottedLastFrame); }

  updateAiDebugOverlay() { this.aiDebugOverlay.update(); }

  enemyActionSummary(e) { return this.aiDebugOverlay.actionSummary(e); }

  isOnPlayerTrail(e) { return this.enemyAi.isOnPlayerTrail(e); }

  syncEnemyTurretVisuals(e, dt) { this.enemyAi.syncEnemyTurretVisuals(e, dt); }

  pickEscapeDirection(e, radius) { return this.enemyAi.pickEscapeDirection(e, radius); }

  updateEnemies(dt, elapsed) { this.enemyAi.updateEnemies(dt, elapsed); }

  get explosions() {
    return (this._explosions ||= new ExplosionsController(this));
  }

  plantMineAt(x, z) {
    this.explosions.plantMineAt(x, z);
  }

  updateMines(dt, elapsed) {
    this.explosions.updateMines(dt, elapsed);
  }

  detonateMine(index) {
    this.explosions.detonateMine(index);
  }

  /**
   * A contact ability (e.g. the KAMIKAZE warhead) went off. The tank is spent: it leaves the
   * battlefield without a kill reward. Returns false when the ability chose not to trigger.
   */

  enemyShotTarget(e, action, s, turretState = null) { return this.enemyCombat.enemyShotTarget(e, action, s, turretState); }

  updateEnemyGunnery(e, dt, s) { this.enemyCombat.updateEnemyGunnery(e, dt, s); }

  updateBossSecondaryWeapons(e, dt, s) { this.enemyCombat.updateBossSecondaryWeapons(e, dt, s); }

  spawnEnemyHomingMissile(x, z, dirX, dirZ, homing = true) { return this.enemyCombat.spawnEnemyHomingMissile(x, z, dirX, dirZ, homing); }

  crushBossObstacles(x, z, radius) { return this.enemyCombat.crushBossObstacles(x, z, radius); }

  titanAspectArmor(e, aspect) { return this.bossCombat.titanAspectArmor(e, aspect); }

  clearInfernoDashBeam(e) { this.bossCombat.clearInfernoDashBeam(e); }

  updateInfernoDash(e, dt, info) { return this.bossCombat.updateInfernoDash(e, dt, info); }

  callBossEscort(e, escortClasses = TITAN.ESCORT_CLASSES) { this.bossCombat.callEscort(e, escortClasses); }

  tryBossApsIntercept(projectile) { return this.bossCombat.tryApsIntercept(projectile); }

  setupDefenseTurrets() { this.defenseTurretsCtrl.setup(); }

  get physics() {
    return (this._physics ||= new PhysicsController(this));
  }

  /** Advances a rig's track and wheel animation (rig.gear uniforms, model metres) from how far the. */
  driveGear(rig, state, x, z, hullAngle) {
    this.physics.driveGear(rig, state, x, z, hullAngle);
  }

  get projectilesController() {
    return (this._projectilesController ||= new ProjectilesController(this));
  }

  /** Shell spawn point `dist` along (dirX, dirZ) from a tank centre, shifted sideways by. */
  traceMuzzle(x, z, dirX, dirZ, dist, fromPlayer, latX = 0, latZ = 0) {
    return this.projectilesController.traceMuzzle(x, z, dirX, dirZ, dist, fromPlayer, latX, latZ);
  }

  spawnProjectile(
    x,
    z,
    dirX,
    dirZ,
    fromPlayer,
    damage,
    penetration,
    bulletPower,
    speed,
    isHeavy,
    weaponId = null,
    opts = {}
  ) {
    this.projectilesController.spawnProjectile(
      x,
      z,
      dirX,
      dirZ,
      fromPlayer,
      damage,
      penetration,
      bulletPower,
      speed,
      isHeavy,
      weaponId,
      opts
    );
  }

  /** Unit flight direction of a projectile as [dx, dz]. */
  missileDir(p) {
    return this.projectilesController.missileDir(p);
  }

  /** Detonates a missile on contact with an obstacle, tank, or at end-of-life. */
  detonateMissile(p) {
    this.projectilesController.detonateMissile(p);
  }

  /** Per-frame flight effects for a projectile moving from (px,pz) to its current position. */
  emitProjectileTrail(p, prevX, prevZ, y) {
    this.projectilesController.emitProjectileTrail(p, prevX, prevZ, y);
  }

  removeProjectile(index) {
    this.projectilesController.removeProjectile(index);
  }

  updateProjectiles(dt) {
    this.projectilesController.updateProjectiles(dt);
  }

  createArtilleryStrike(
    startX,
    startZ,
    targetX,
    targetZ,
    radius,
    duration,
    damage,
    fromPlayer,
    startY = 1.0,
    weaponId = 'HOWITZER'
  ) {
    this.explosions.createArtilleryStrike(
      startX,
      startZ,
      targetX,
      targetZ,
      radius,
      duration,
      damage,
      fromPlayer,
      startY,
      weaponId
    );
  }

  get terrainDestruction() {
    return (this._terrainDestruction ||= new TerrainDestructionController(this));
  }

  /** Converts a terrain/obstacle cell (FOREST, BRICK, CONCRETE, ICE, WATER) into scorched SAND. */
  convertCellToSand(cell) {
    this.terrainDestruction.convertCellToSand(cell);
  }

  /** Rebuilds the continuous water / ice surface meshes after thermobaric vaporization. */
  rebuildWaterAndIceSurfaces(rebuildWater, rebuildIce) {
    this.terrainDestruction.rebuildWaterAndIceSurfaces(rebuildWater, rebuildIce);
  }

  /**
   * Thermobaric shell detonation (radius 2.5 cells = 5.0m):
   * triggers realistic fuel-air blast FX, sweeps FOREST/BRICK/CONCRETE/ICE/WATER into SAND,
   * and deals radial blast damage to vehicles.
   */
  detonateThermobaricAt(x, z, radius, damage, fromPlayer = false) {
    this.explosions.detonateThermobaricAt(x, z, radius, damage, fromPlayer);
  }

  detonateExplosionAt(x, z, radius, damage, fromPlayer, componentHit = null, isEnvironmental = false, penetration = 0) {
    this.explosions.detonateExplosionAt(x, z, radius, damage, fromPlayer, componentHit, isEnvironmental, penetration);
  }

  /** Armour of the hull side facing a blast centre (armour always works per side). */
  blastSideArmor(stats, tankX, tankZ, hullYaw, blastX, blastZ) {
    return this.explosions.blastSideArmor(stats, tankX, tankZ, hullYaw, blastX, blastZ);
  }

  triggerMissionVictory(bannerText) {
    if (this.status === GameStatus.VICTORY) return;
    this.status = GameStatus.VICTORY;
    sound.stopEngineLoop();
    if (this.activeMissionRun && !this.activeMissionRun.rewardsCommitted) {
      this.lastSettlementSummary = settleMission({
        playerSave: this.playerSave,
        missionRun: this.activeMissionRun,
        outcome: 'victory',
      });
      this.playerSave.completedMissions ||= {};
      this.playerSave.completedMissions[this.activeMissionRun.missionId] = { completedAt: Date.now() };
      this.playerSave.apsAmmo = [...this.apsAmmo];
      this.playerSave.repairKitCharges = this.repairKitState?.charges ?? 0;
      this.saveRepo.savePlayerSave(this.playerSave);
      this.saveRepo.recordMissionRun(this.activeMissionRun);
    }
    this.syncCampaignCredits();
    this.setStatusBanner(
      bannerText ||
        this.activeMapRules?.victoryBanner ||
        'SECTOR SECURED! REMAINING BATTLEFIELD LOOT AUTO-COLLECTED!',
      5.0
    );
    this.saveProgress();
    this.emitHudUpdate();
  }

  damageEnemyBase(cell, dmg, hitX, hitZ) {
    this.terrainDestruction.damageEnemyBase(cell, dmg, hitX, hitZ);
  }

  restoreCommandBase() {
    this.terrainDestruction.restoreCommandBase();
  }

  /** `fromPlayer`: only crates the player breaks yield loot; enemy fire just destroys their contents. */
  damageTileCell(cell, dmg, hitX, hitZ, fromPlayer = false) {
    this.terrainDestruction.damageTileCell(cell, dmg, hitX, hitZ, fromPlayer);
  }

  destroyTileCell(cell) {
    this.terrainDestruction.destroyTileCell(cell);
  }

  updateBrickRubble(dt) {
    this.terrainDestruction.updateBrickRubble(dt);
  }

  explodeBarrel(cell, fromPlayer = true) {
    this.terrainDestruction.explodeBarrel(cell, fromPlayer);
  }

  updateBarrelExplosions(dt) {
    this.terrainDestruction.updateBarrelExplosions(dt);
  }

  damageEnemy(enemy, dmg) { this.enemyCombat.damageEnemy(enemy, dmg); }

  damagePlayer(dmg, componentHit = null) { this.playerController.damagePlayer(dmg, componentHit); }

  updatePowerUps(dt, elapsed) {
    this.powerupsController.updatePowerUps(dt, elapsed);
  }

  applyPowerUp(type) {
    this.powerupsController.applyPowerUp(type);
  }

  updateLasers(dt) {
    this.projectilesController.updateLasers(dt);
  }

  /** Generic small effect burst. The colour picks the effect family so legacy call. */
  spawnSparks(x, y, z, color, count, fxSystem = this.fx) {
    switch (color) {
      case 0x10b981:
        fxSystem.repair(x, y, z, Math.max(2, count));
        break;
      case 0x475569:
        fxSystem.damageSmoke(x, y, z);
        break;
      case 0x06b6d4:
        fxSystem.electric(x, y, z, 0x38e8ff, Math.max(1, Math.round(count / 2)));
        break;
      case 0x38bdf8:
        fxSystem.ricochet(x, y, z);
        break;
      default:
        fxSystem.sparks(x, y, z, color, count);
    }
  }

  /** World-space muzzle position of a rig (falls back to a forward offset). */

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.fxGroup.remove(pt.mesh);
        this.particles.splice(i, 1);
        continue;
      }

      pt.vy -= pt.gravity * dt;
      pt.mesh.position.x += pt.vx * dt;
      pt.mesh.position.y = Math.max(0.05, pt.mesh.position.y + pt.vy * dt);
      pt.mesh.position.z += pt.vz * dt;
      pt.mesh.rotation.x += pt.rotSpeedX * dt;
      pt.mesh.rotation.y += pt.rotSpeedY * dt;

      const s = Math.max(0.05, pt.life / pt.maxLife);
      pt.mesh.scale.setScalar(s);
    }
  }

  checkTankEnemyCollision(e, testX, testZ, radius) {
    return this.physics.checkTankEnemyCollision(e, testX, testZ, radius);
  }

  resolveEnemyCollisions() {
    this.physics.resolveEnemyCollisions();
  }

  checkTankWallCollision(x, z, radius, canCrossWater = false) {
    return this.physics.checkTankWallCollision(x, z, radius, canCrossWater);
  }

  lerpAngle(current, target, alpha) {
    return this.physics.lerpAngle(current, target, alpha);
  }

  emitHudUpdate() {
    this.onHudUpdate?.(buildHudSnapshot(this), { ...this.upgrades });
  }

  checkAndIgniteForestOnEnemyKill(enemy) { this.forestFire.checkAndIgniteOnEnemyKill(enemy); }

  dispose() {
    this.isDisposed = true;
    this.hangarStage?.dispose();
    this.modelFactory.brickModels.dispose();
    this.enemySpawner.clearPendingTimeouts();
    this.pendingBarrelExplosions = [];
    this._aiDebugOverlay?.clear();
    this.clock?.dispose();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('resize', this.handleResize);
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    window.removeEventListener('pointerup', this.handlePointerUp);

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointermove', this.handlePointerMove);
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    canvas.removeEventListener('wheel', this.handleWheel);
    if (this.handleContextMenu) {
      canvas.removeEventListener('contextmenu', this.handleContextMenu);
    }

    this.clearGroup(this.mapGroup);
    this.clearGroup(this.entityGroup);
    this.clearGroup(this.fxGroup);
    this.fx?.clear();

    this.urbanGroundTexture?.dispose();
    if (this.perimeterMesh) {
      this.perimeterMesh.traverse(node => { if (node.isInstancedMesh) node.dispose(); });
      disposeOwned(this.perimeterMesh);
    }
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
