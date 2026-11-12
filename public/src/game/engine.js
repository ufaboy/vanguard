import { apsInterceptCost, bossApsCanIntercept } from '../sim/aps.js';
import { emitFlamePuff } from './abilities/flame-stream.js';
import { BoxPowerUpPool, rollBoxLoot } from './terrains/boxes-loot.js';
import { COMPONENT_TRACKS, normalizeComponentDamage, effectiveUpgradeTiers, rollComponentDamage, componentRepairCost, COMPONENT_DAMAGE_COOLDOWN } from '../sim/component-damage.js';
/** Core Three.js WebGL game loop, combat physics, and simulation. */

import { isUsefulPowerUp } from './powerup-drops.js';
import { isCampaignMissionUnlocked } from './campaign.js';
import { findBorderIngressCell } from './campaign-navigation.js';
import { createUrbanGroundTexture } from './terrains/urban-ground.js';
import { createEncounterState, remainingEncounterEnemies, updateEncounters } from './encounters.js';
import * as THREE from 'three';
import { HangarStage } from './hangar-stage.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  APS,
  ARTILLERY,
  BOSS_APS,
  HYDRA,
  INFERNO,
  MAMMOTH,
  TITAN,
  FLAME_STREAM,
  LAND_MINE,
  TANK_HIT_RADIUS,
  BASE_REPAIR,
  BULLET_POWER,
  computeEffectiveDamage,
  computeTankStats,
  CANNON_AMMO,
  getMaxApsAmmo,
  getMaxMissileAmmo,
  getMaxCannonAmmo,
  DEFENSE_TURRET_CONFIGS,
  DEFENSE_TURRET_TYPES,
  DURABILITY,
  ENEMY_KILL_CREDITS,
  ENEMY_VISIBILITY,
  MISSILE,
  PLAYER_UPGRADES,
  POWERUP,
  POWERUP_DROP_TYPES,
  POWERUP_MAX_ON_MAP,
  POWERUP_TYPES,
  REPAIR_KIT,
  TRACK_UPGRADE_COSTS,
  UPGRADE,
  UPGRADE_MAX_LEVEL,
} from './constants.js';
import {
  EnemyClass,
  GameStatus,
  SPECIAL_ENEMY_CATALOG,
  TANK_CONFIGS,
  TANK_TYPES,
  TileType,
  resolveMapRules,
  checkMapVictory,
  checkMapDefeat,
} from './types.js';
import { PLAYER_TANK_CONFIG, SECTOR_BOSS_CONFIGS } from './tanks.js';
import { BASE_CELL, GRID_SIZE, SECTORS, TILE_SIZE, getBaseLayout } from './levels.js';
import { ModelFactory, deckClearance } from './models.js';
import { TileBatcher } from './tile-batcher.js';
import { autoDisposeOwned, disposeOwned, markOwned } from './dispose.js';
import { FxSystem, createProjectileVisual, createMissileVisual, animateMissileVisual } from './fx.js';
import { sound } from './sound.js';
import { SeededRng } from '../sim/rng.js';
import {
  ARMOR_PANEL_CATALOG,
  HULL_CATALOG,
  TERRAIN_SURFACES,
  TURRET_CATALOG,
} from '../sim/catalog.js';
import { determineHitAspect, resolveArmorHit } from '../sim/ballistics.js';
import { equipAbilities, fireAbilityWeapon, inContactRange, updateAbilities } from './abilities/index.js';
import {
  activateRepairKit,
  applySubsystemDamage,
  computeSubsystemModifiers,
  createRepairKitState,
  createTankSubsystems,
  stepAutomaticTrackRepair,
  stepRepairKit,
} from '../sim/subsystems.js';
import {
  createEnemyAIState,
  getObservedEnemyCondition,
  normalizeAngleSigned,
  stepAngleTowards,
  updatePlayerSensorContacts,
} from '../sim/ai.js';
import {
  ACTION_KIND,
  ACTION_TUNING,
  BRAIN_REPLAN_SEC,
  GUNNER,
  ROLE_CONFIGS,
  actionLuck,
  armShot,
  assignBearingSlots,
  createBrain,
  createGunnerState,
  createSquadDirector,
  findPath,
  findTacticalCells,
  indirectMissPoint,
  isBossHardSolid,
  missAngle,
  notifyBrainFired,
  updateAttackTokens,
  onGunnerFired,
  randomCellAround,
  randomCellInOtherZone,
  randomCellInZone,
  resetBrain,
  resolveBehaviorActions,
  rollLuck,
  selectAction,
  shotArmedFor,
  stepBrain,
  stepGunner,
  zoneOf,
} from '../sim/behavior/index.js';
import {
  mountPartInHangar,
  resolveAssembledTank,
  SaveRepository,
  settleMission,
} from '../sim/hangar.js';
import {
  CARGO_STATUS,
  CONTRACT_TIMING,
  CONTRACT_TYPES,
  CONTRACTS_CATALOG,
  LAST_CARGO_CONTRACT,
  LAST_CARGO_GATES,
  buildContractHudSnapshot,
  commitContractCargoDelivery,
  createContractState,
  startCargoLoading,
  startContractExtraction,
  stepContractCargo,
  stepContractScheduler,
} from '../sim/contract.js';
import {
  SURVIVAL_CONFIG,
  buildSurvivalHudSnapshot,
  buildSurvivalWaveSpec,
  createSurvivalState,
  recordSurvivalRun,
} from '../sim/survival.js';
import { sampleMissionTerrain } from '../sim/missions.js';

const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** Graphics quality presets. Pixel ratio, shadows and particle budget apply immediately;. */
export const QUALITY_PRESETS = Object.freeze({
  low: { label: 'Low', pixelRatio: 1, shadows: false, fx: 0.55, antialias: false, physicalWater: false },
  medium: { label: 'Medium', pixelRatio: 1.5, shadows: true, fx: 0.8, antialias: true, physicalWater: false },
  high: { label: 'High', pixelRatio: 2, shadows: true, fx: 1, antialias: true, physicalWater: true },
});
const _intersectPoint = new THREE.Vector3();
const DEFAULT_SENSOR_TURRET = Object.freeze({ visionRange: 75 });
const IDLE_SCREEN_FPS = 15;
/** Half-amplitude (radians) of the KAMIKAZE zigzag during its final charge. */
const HUNTER_ZIGZAG_RAD = 0.45;

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
    this.codexOpen = false;
    this.codexItem = null;
    this.codexTurntableAngle = 0.55;
    this.codexAutoRotate = true;
    this.codexDragging = false;
    this.codexDragPrevX = 0;
    this.codexDemoTimer = 0;
    this.codexRecoil = 0;
    this.codexNextBarrel = 0;
    this.codexBarrelRecoils = [0, 0];
    this.codexFlashTimer = 0;
    this.codexPreviewUpgrades = {
      cannon: 1,
      chassis: 1,
      frame: 1,
      engine: 1,
      armor: 1,
      aps: true,
      missile: true,
    };
    this.codexGroup = new THREE.Group();
    this.codexStageGroup = new THREE.Group();
    this.codexFxGroup = new THREE.Group();
    autoDisposeOwned(this.codexStageGroup);
    autoDisposeOwned(this.codexFxGroup);
    this.codexTankRig = null;
    this.codexSecondaryRig = null;
    this.codexHazardRing = null;
    this.codexHazardFill = null;
    this.codexArcShell = null;

    this.frustumSize = 25;
    this.camCurrentLook = new THREE.Vector3(0, 0, 0);
    this.screenShake = 0;

    this.keys = {};
    this.mouseNdc = new THREE.Vector2(0, 0);
    this.aimWorld = new THREE.Vector3(0, 0, 0);
    this.raycaster = new THREE.Raycaster();
    this.isMouseDown = false;

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
    this.manualRoutePoints = [];
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
    this.cannonAmmo = this.playerSave.cannonAmmo;
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

    this.loadSavedProgress();
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
      for (const group of [this.mapGroup, this.codexStageGroup]) {
        group.traverse(node => {
          if (node.userData.brickHp !== undefined) {
            this.modelFactory.updateBrickBlockDamage(node, node.userData.brickHp);
            this.tileBatcher.markDirty(node);
          }
        });
      }
    };
    this.setupLighting();
    this.fx = new FxSystem({ lowQuality: this.isSoftwareGl, light: this.explosionLight });
    this._codexFx = null;
    this.applyQuality();
    this.setupStaticEnvironment();
    this.setupAimReticle();
    this.setupCodexStage();

    this.scene.add(this.mapGroup);
    this.scene.add(this.tileBatcher.root);
    this.scene.add(this.entityGroup);
    this.scene.add(this.fxGroup);
    this.scene.add(this.fx.root);
    this.scene.add(this.codexGroup);

    this.loadSector(0, false);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
      this.warmupEffectShaders();
      this.modelFactory.onModelReady = (model) => this.warmupTankShaders(model);
    }

    this.bindEvents();
    this.clock = new THREE.Timer();
    this.clock.connect(document);
    this.emitHudUpdate();
    this.startLoop();
  }

  getUpgradesStorage() {
    if (this.profileMode === 'survival') {
      return {
        storage: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
        key: 'iron_vanguard_survival_upgrades_v1',
      };
    }
    if (this.profileMode === 'contract') {
      return {
        storage: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
        key: 'iron_vanguard_contract_upgrades_v1',
      };
    }
    return {
      storage: typeof localStorage !== 'undefined' ? localStorage : null,
      key: 'iron_vanguard_upgrades_v3',
    };
  }

  loadSavedProgress() {
    try {
      if (this.profileMode === 'campaign' && typeof localStorage !== 'undefined') {
        localStorage.removeItem('iron_vanguard_highscore');
      }
      const { storage, key } = this.getUpgradesStorage();
      const savedUpgrades = storage?.getItem(key);
      if (savedUpgrades) {
        const parsed = JSON.parse(savedUpgrades);
        this.upgrades = {
          cannon: Math.min(UPGRADE_MAX_LEVEL.cannon, Math.max(1, parsed.cannon || 1)),
          chassis: Math.min(
            UPGRADE_MAX_LEVEL.chassis,
            Math.max(1, parsed.chassis || parsed.vehicleFrame || 1)
          ),
          frame: Math.min(
            UPGRADE_MAX_LEVEL.frame,
            Math.max(1, parsed.frame || parsed.vehicleFrame || 1)
          ),
          engine: Math.min(UPGRADE_MAX_LEVEL.engine, Math.max(1, parsed.engine || 1)),
          armor: Math.min(UPGRADE_MAX_LEVEL.armor, Math.max(1, parsed.armor || 1)),
        };
      } else {
        this.upgrades = { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 };
      }
    } catch {
    }
  }

  saveProgress() {
    try {
      const { storage, key } = this.getUpgradesStorage();
      storage?.setItem(key, JSON.stringify(this.upgrades));
    } catch {
    }
  }

  syncCampaignCredits() {
    if (this.profileMode !== 'contract' || !this.campaignSaveRepo) return;
    const campaignSave = this.campaignSaveRepo.loadPlayerSave();
    campaignSave.credits = this.playerSave?.credits ?? campaignSave.credits;
    this.campaignSaveRepo.savePlayerSave(campaignSave);
  }

  resetToStockTank() {
    this.upgrades = { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 };
    this.componentDamage = Object.fromEntries(COMPONENT_TRACKS.map((t) => [t, false]));
    this.componentDamageCooldown = 0;
    this.componentWaterEgress = false;
    this.initApsLaunchers(APS.START_ROUNDS);
    this.missileAmmo = 2;
    this.repairKitState = createRepairKitState(0);
  }

  setProfileMode(mode = 'campaign', { resetTank = false } = {}) {
    this.profileMode = mode;
    if (mode === 'survival') {
      this.saveRepo = this.survivalSaveRepo;
    } else if (mode === 'contract') {
      this.saveRepo = this.contractSaveRepo;
    } else {
      this.saveRepo = this.campaignSaveRepo;
    }
    this.playerSave = this.saveRepo.loadPlayerSave();

    if (mode !== 'campaign' && resetTank) {
      this.resetToStockTank();
      if (this.playerSave) {
        this.playerSave.credits =
          mode === 'survival'
            ? SURVIVAL_CONFIG.STARTING_CREDITS
            : this.campaignSaveRepo?.loadPlayerSave().credits ?? this.playerSave.credits;
        this.playerSave.apsAmmo = [...this.apsAmmo];
        this.playerSave.missileAmmo = this.missileAmmo;
        this.playerSave.cannonAmmo = this.cannonAmmo;
        this.playerSave.repairKitCharges = 0;
        this.playerSave.componentDamage = { ...this.componentDamage };
        this.playerSave.componentDamageCooldown = 0;
        this.saveRepo.savePlayerSave(this.playerSave);
      }
      this.saveProgress();
    } else {
      this.loadSavedProgress();
      this.componentDamage = normalizeComponentDamage(this.playerSave?.componentDamage);
      this.componentDamageCooldown = Math.max(0, Math.min(8, Number(this.playerSave?.componentDamageCooldown) || 0));
      this.componentWaterEgress = false;
      this.apsAmmo = Array.isArray(this.playerSave?.apsAmmo)
        ? [...this.playerSave.apsAmmo]
        : [...APS.INITIAL_PER_LAUNCHER];
      this.missileAmmo = Number.isInteger(this.playerSave?.missileAmmo)
        ? Math.max(0, Math.min(MISSILE.MAX_AMMO, this.playerSave.missileAmmo))
        : 2;
      const savedRepairCharges = Number.isInteger(this.playerSave?.repairKitCharges)
        ? this.playerSave.repairKitCharges
        : 0;
      this.repairKitState = createRepairKitState(savedRepairCharges);
    }
    this.recomputePlayerStats(false);
  }

  applyUpgrades(newUpgrades) {
    if (!newUpgrades) return;
    this.upgrades = { ...this.upgrades, ...newUpgrades };
    this.recomputePlayerStats(true);
    this.saveProgress();
    this.emitHudUpdate();
  }

  startSector(sectorIdx) {
    this.startMission(sectorIdx);
  }

  setCameraPreset(preset) {
    this.inspectMode = false;
    this.cycleCameraPreset(preset);
  }

  get codexFx() {
    if (!this._codexFx) {
      this._codexFx = new FxSystem({ lowQuality: this.isSoftwareGl, light: this.explosionLight });
      this._codexFx.q = this.fx.q;
      this.codexGroup.add(this._codexFx.root);
    }
    return this._codexFx;
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
    if (this._codexFx) this._codexFx.q = fxScale;
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
    if (resultScreen && !this.codexOpen && !this.isHangarOpen && !this.inspectMode && !this.cameraRotating) {
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
      this.handleResize();
    } else {
      this.cycleCameraPreset(this.cameraPreset);
    }
  }

  get effectiveUpgrades() {
    return effectiveUpgradeTiers(this.upgrades, this.componentDamage);
  }

  syncPlayerVisuals(wheelDelta = 0, elapsed = 0) {
    if (!this.playerRig || !this.modelFactory) return;
    this.modelFactory.updatePlayerTankVisuals(
      this.playerRig,
      this.effectiveUpgrades,
      Boolean(this.playerStats?.canHover),
      this.missileAmmo,
      this.apsAmmo,
      wheelDelta,
      elapsed
    );
  }

  recomputePlayerStats(preserveRatio = true) {
    const prevMax = this.playerMaxHp || PLAYER_TANK_CONFIG.base.hp;
    const gun = PLAYER_UPGRADES[UPGRADE.CANNON][(this.effectiveUpgrades.cannon || 1) - 1];
    const baseChassis =
      PLAYER_UPGRADES[UPGRADE.CHASSIS][(this.effectiveUpgrades.chassis || 1) - 1];
    const chassis = baseChassis;
    const frame = PLAYER_UPGRADES[UPGRADE.FRAME][(this.effectiveUpgrades.frame || 1) - 1];
    const engine = PLAYER_UPGRADES[UPGRADE.ENGINE][(this.effectiveUpgrades.engine || 1) - 1];
    const armor = PLAYER_UPGRADES[UPGRADE.ARMOR][(this.effectiveUpgrades.armor || 1) - 1];

    const optEquip = [];
    if (this.missileAmmo > 0) {
      optEquip.push('ROCKET_LAUNCHER');
    }

    this.playerStats = computeTankStats({
      gun,
      chassis,
      frame,
      engine,
      armor,
      optionalEquipment: optEquip,
    }, PLAYER_TANK_CONFIG.base);

    this.playerMaxHp = this.playerStats.maxHP;
    if (preserveRatio) {
      const delta = this.playerMaxHp - prevMax;
      if (delta > 0) {
        this.playerHp = Math.min(
          this.playerMaxHp * DURABILITY.OVERHEAL_MAX_RATIO,
          this.playerHp + delta
        );
      } else {
        this.playerHp = Math.min(
          this.playerMaxHp * DURABILITY.OVERHEAL_MAX_RATIO,
          this.playerHp
        );
      }
    } else {
      this.playerHp = this.playerMaxHp;
    }

    if (this.playerStats?.barrels !== 2) {
      this.playerSalvoShot = 0;
      this.playerSalvoResetTimer = 0;
    }

    this.syncPlayerVisuals(0, this.clock ? this.clock.getElapsed() : 0);
  }

  getPlayerMaxCannonAmmo() {
    return getMaxCannonAmmo(this.upgrades?.frame || 1);
  }

  getPlayerMaxApsAmmo() {
    return getMaxApsAmmo(this.upgrades?.frame || 1);
  }

  getPlayerMaxMissileAmmo() {
    return getMaxMissileAmmo(this.upgrades?.frame || 1);
  }

  initApsLaunchers(rounds) {
    this.apsAmmo = [0, 0, 0, 0];
    this.addApsRounds(rounds);
  }

  addApsRounds(count) {
    const maxTotal = this.getPlayerMaxApsAmmo();
    const maxPerLauncher = Math.ceil(maxTotal / APS.LAUNCHERS.length);
    let currentTotal = this.apsAmmo.reduce((a, b) => a + b, 0);
    let remaining = count;
    while (remaining > 0 && currentTotal < maxTotal) {
      let addedAny = false;
      for (const launcherIdx of APS.FILL_ORDER) {
        if (currentTotal < maxTotal && this.apsAmmo[launcherIdx] < maxPerLauncher) {
          this.apsAmmo[launcherIdx]++;
          currentTotal++;
          remaining--;
          addedAny = true;
          if (remaining <= 0 || currentTotal >= maxTotal) break;
        }
      }
      if (!addedAny) break;
    }
    this.syncApsVisuals();
  }

  syncApsVisuals() {
    this.syncPlayerVisuals(0, this.clock ? this.clock.getElapsed() : 0);
  }

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

  setupCodexStage() {
    this.codexGroup.visible = false;

    const floorMat = new THREE.MeshStandardMaterial({
      map: this.modelFactory.groundTex,
      color: 0x0f172a,
      roughness: 0.8,
      metalness: 0.18,
    });
    const floorMesh = new THREE.Mesh(new THREE.CircleGeometry(18, 48), floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.26;
    floorMesh.receiveShadow = true;
    this.codexGroup.add(floorMesh);

    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.42,
      metalness: 0.72,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.3,
      metalness: 0.85,
    });
    const pedestalOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(3.45, 3.85, 0.24, 24),
      rimMat
    );
    pedestalOuter.position.y = -0.13;
    pedestalOuter.receiveShadow = true;
    this.codexGroup.add(pedestalOuter);

    const pedestalTop = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.35, 0.06, 24),
      baseMat
    );
    pedestalTop.position.y = -0.03;
    pedestalTop.receiveShadow = true;
    this.codexGroup.add(pedestalTop);

    const ringGeo = new THREE.RingGeometry(2.95, 3.08, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this.codexRingMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ringMesh = new THREE.Mesh(ringGeo, this.codexRingMat);
    ringMesh.position.y = 0.01;
    this.codexGroup.add(ringMesh);

    const innerRingGeo = new THREE.RingGeometry(1.85, 1.9, 36);
    innerRingGeo.rotateX(-Math.PI / 2);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
    });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.position.y = 0.01;
    this.codexGroup.add(innerRing);

    this.codexGroup.add(this.codexStageGroup);
    this.codexGroup.add(this.codexFxGroup);
  }

  setCodexMode(enabled, item = null, previewUpgrades = null) {
    this.codexOpen = Boolean(enabled);
    if (previewUpgrades) {
      this.codexPreviewUpgrades = {
        ...this.codexPreviewUpgrades,
        ...previewUpgrades,
      };
    } else if (this.codexOpen && !item) {
      this.codexPreviewUpgrades = {
        ...this.upgrades,
        aps: true,
        missile: true,
      };
    }

    this.mapGroup.visible = !this.codexOpen;
    this.entityGroup.visible = !this.codexOpen;
    this.fxGroup.visible = !this.codexOpen;
    this.fx.root.visible = !this.codexOpen;
    if (this.groundMesh) this.groundMesh.visible = !this.codexOpen;
    if (this.perimeterMesh) this.perimeterMesh.visible = !this.codexOpen;
    if (this.aimReticle) this.aimReticle.visible = !this.codexOpen;
    this.codexGroup.visible = this.codexOpen;

    if (this.codexOpen) {
      this.frustumSize = 10.2;
      this.handleResize();
      if (item) {
        this.loadCodexShowcaseItem(item);
      }
    } else {
      this.clearGroup(this.codexStageGroup);
      this.clearGroup(this.codexFxGroup);
      this._codexFx?.clear();
      if (this.inspectMode) {
        this.frustumSize = 11.5;
        this.handleResize();
      } else {
        this.cycleCameraPreset(this.cameraPreset);
      }
    }
    this.syncAudioPauseState();
  }

  updateCodexPreviewUpgrades(previewUpgrades) {
    this.codexPreviewUpgrades = {
      ...this.codexPreviewUpgrades,
      ...previewUpgrades,
    };
    if (this.codexOpen && this.codexItem?.isPlayerMbt && this.codexTankRig) {
      const hoverActive =
        (this.codexPreviewUpgrades.chassis || 1) >= 5;
      const apsArr = this.codexPreviewUpgrades.aps ? [3, 3, 3, 3] : [0, 0, 0, 0];
      const missileCount = this.codexPreviewUpgrades.missile ? 4 : 0;
      this.modelFactory.updatePlayerTankVisuals(
        this.codexTankRig,
        this.codexPreviewUpgrades,
        hoverActive,
        missileCount,
        apsArr,
        0,
        this.clock ? this.clock.getElapsed() : 0
      );
    }
  }

  loadCodexShowcaseItem(item) {
    if (!item) return;
    this.codexItem = item;
    this.clearGroup(this.codexStageGroup);
    this.clearGroup(this.codexFxGroup);
    this._codexFx?.clear();
    this.codexMines = null;
    this.codexMissile = null;
    this.codexArcPrev = 0;
    this.codexTankRig = null;
    this.codexSecondaryRig = null;
    this.codexHazardRing = null;
    this.codexHazardFill = null;
    this.codexArcShell = null;
    this.codexDemoTimer = 0.6;
    this.codexRecoil = 0;
    this.codexBarrelRecoils = [0, 0];
    this.codexNextBarrel = 0;
    this.codexFlashTimer = 0;

    if (this.codexRingMat && item.accentHex) {
      this.codexRingMat.color.set(item.accentHex);
    }

    if (item.category === 'TANKS') {
      if (item.isPlayerMbt) {
        this.codexTankRig = this.modelFactory.createPlayerTank();
        this.codexStageGroup.add(this.codexTankRig.root);
        this.updateCodexPreviewUpgrades(this.codexPreviewUpgrades);
      } else if (item.enemyClass) {
        this.codexTankRig = this.modelFactory.createEnemyTank(item.enemyClass);
        this.codexStageGroup.add(this.codexTankRig.root);
      }
    } else if (item.category === 'SURFACES') {
      if (item.turretType) {
        const rig = this.modelFactory.createDefenseTurretRig(item.turretType);
        rig.root.position.set(0, 0, 0);
        rig.root.scale.setScalar(1.25);
        if (rig.hpBarBg) rig.hpBarBg.visible = false;
        if (rig.hpBarFill) rig.hpBarFill.visible = false;
        this.codexStageGroup.add(rig.root);
        this.codexTankRig = rig;
        return;
      }
      const offsets = [
        { x: -1.05, z: -1.05 },
        { x: 1.05, z: -1.05 },
        { x: -1.05, z: 1.05 },
        { x: 1.05, z: 1.05 },
      ];
      offsets.forEach((pos, idx) => {
        let block = null;
        if (item.surfaceType === 'BRICK') {
          const brick = this.modelFactory.createBrickBlock();
          if (idx === 1) this.modelFactory.updateBrickBlockDamage(brick.group, 2);
          block = brick.group;
        } else if (
          item.surfaceType === 'CONCRETE' ||
          item.surfaceType === 'STEEL'
        ) {
          block = this.modelFactory.createConcreteBlock();
          if (idx === 1) {
            this.modelFactory.updateConcreteBlockDamage(block, 12, 16);
          } else if (idx === 3) {
            this.modelFactory.updateConcreteBlockDamage(block, 6, 16);
          }
        } else if (item.surfaceType === 'FOREST') {
          block = this.modelFactory.createForestBlock();
        } else if (item.surfaceType === 'WATER') {
          if (idx === 0) this.codexStageGroup.add(this.modelFactory.createWaterBlock([[1, 1], [1, 1]]));
          return;
        } else if (item.surfaceType === 'ICE') {
          if (idx === 0) this.codexStageGroup.add(this.modelFactory.createIceBlock([[1, 1], [1, 1]]));
          return;
        } else if (item.surfaceType === 'BASE') {
          if (idx === 0) {
            const hq = this.modelFactory.createCommandBaseBlock();
            hq.position.set(0, 0, 0.7);
            hq.scale.setScalar(0.9);
            this.codexStageGroup.add(hq);

            // The concrete line that covers the HQ from the enemy side, one free lane away.
            for (const x of [-0.9, 0.9]) {
              const concrete = this.modelFactory.createConcreteBlock();
              concrete.position.set(x, 0, -1.6);
              concrete.scale.setScalar(0.8);
              this.codexStageGroup.add(concrete);
            }
          }
          return;
        } else if (item.surfaceType === 'HEDGEHOG') {
          block = this.modelFactory.createHedgehogBlock();
        } else if (item.surfaceType === 'BOXES') {
          block = this.modelFactory.createBoxesBlock();
          if (idx > 0) this.modelFactory.updateBoxesDamage(block, 1);
        } else if (item.surfaceType === 'BARREL') {
          block = this.modelFactory.createBarrelBlock();
        } else if (item.surfaceType === 'ENEMY_BASE') {
          if (idx === 0) {
            const citadel = this.modelFactory.createEnemyBaseBlock();
            citadel.position.set(0, -0.2, 0.4);
            citadel.scale.setScalar(0.95);
            this.codexStageGroup.add(citadel);

            const leftConcrete = this.modelFactory.createConcreteBlock();
            leftConcrete.position.set(-1.6, 0, -1.1);
            leftConcrete.scale.setScalar(0.8);
            this.codexStageGroup.add(leftConcrete);

            const rightConcrete = this.modelFactory.createConcreteBlock();
            rightConcrete.position.set(1.6, 0, -1.1);
            rightConcrete.scale.setScalar(0.8);
            this.codexStageGroup.add(rightConcrete);
          }
          return;
        }
        if (block) {
          block.position.set(pos.x, 0, pos.z);
          this.codexStageGroup.add(block);
        }
      });
    } else if (item.category === 'POWERUPS') {
      const crate = this.modelFactory.createPowerUpMesh(item.powerupType);
      crate.scale.setScalar(1.5);
      crate.position.set(0, 0.35, 0);
      this.codexStageGroup.add(crate);
      this.codexTankRig = { root: crate, isCrate: true };
    } else if (item.category === 'EFFECTS') {
      this.setupCodexEffectScene(item.effectType);
    }
  }

  setupCodexEffectScene(effectType) {
    if (effectType === 'CANNON') {
      this.codexTankRig = this.modelFactory.createPlayerTank();
      this.codexTankRig.root.position.set(-1.35, 0, 0);
      this.codexTankRig.hull.rotation.y = Math.PI / 2;
      this.codexTankRig.turret.rotation.y = Math.PI / 2;
      this.modelFactory.updatePlayerTankVisuals(
        this.codexTankRig,
        { cannon: 4, vehicleFrame: 3, engine: 3, armor: 3 },
        false,
        2,
        [1, 1, 1, 1],
        0,
        0
      );
      this.codexStageGroup.add(this.codexTankRig.root);

      const targetConcrete = this.modelFactory.createConcreteBlock();
      this.modelFactory.updateConcreteBlockDamage(targetConcrete, 7, 16);
      targetConcrete.position.set(1.65, 0, 0);
      this.codexStageGroup.add(targetConcrete);
    } else if (effectType === 'MISSILE') {
      this.codexTankRig = this.modelFactory.createPlayerTank();
      this.codexTankRig.root.position.set(-1.35, 0, 0);
      this.codexTankRig.hull.rotation.y = Math.PI / 2;
      this.codexTankRig.turret.rotation.y = Math.PI / 2;
      this.modelFactory.updatePlayerTankVisuals(
        this.codexTankRig,
        { cannon: 3, vehicleFrame: 2, engine: 3, armor: 3 },
        false,
        4,
        [1, 1, 1, 1],
        0,
        0
      );
      this.codexStageGroup.add(this.codexTankRig.root);

      this.codexSecondaryRig = this.modelFactory.createEnemyTank(EnemyClass.HEAVY);
      this.codexSecondaryRig.root.position.set(1.55, 0, 0);
      this.codexSecondaryRig.hull.rotation.y = -Math.PI / 2;
      this.codexSecondaryRig.turret.rotation.y = -Math.PI / 2;
      this.codexStageGroup.add(this.codexSecondaryRig.root);
    } else if (effectType === 'ARTILLERY') {
      this.codexTankRig = this.modelFactory.createEnemyTank(EnemyClass.ARTILLERY);
      this.codexTankRig.root.position.set(-1.45, 0, 0);
      this.codexTankRig.hull.rotation.y = Math.PI / 2;
      this.codexTankRig.turret.rotation.y = Math.PI / 2;
      this.codexStageGroup.add(this.codexTankRig.root);

      const ringGeo = new THREE.RingGeometry(1.05, 1.2, 28);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      });
      this.codexHazardRing = new THREE.Mesh(ringGeo, ringMat);
      this.codexHazardRing.position.set(1.25, 0.05, 0);
      this.codexStageGroup.add(this.codexHazardRing);

      const fillGeo = new THREE.CircleGeometry(1.2, 28);
      fillGeo.rotateX(-Math.PI / 2);
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.28,
      });
      this.codexHazardFill = new THREE.Mesh(fillGeo, fillMat);
      this.codexHazardFill.position.set(1.25, 0.04, 0);
      this.codexStageGroup.add(this.codexHazardFill);

      this.codexArcShell = createProjectileVisual(0xff5a2a, {
        radius: 0.2,
        length: 0.3,
        glow: 1.2,
      });
      this.codexStageGroup.add(this.codexArcShell);
    } else if (effectType === 'APS') {
      this.codexTankRig = this.modelFactory.createPlayerTank();
      this.modelFactory.updatePlayerTankVisuals(
        this.codexTankRig,
        { cannon: 3, vehicleFrame: 3, engine: 3, armor: 3 },
        false,
        2,
        [3, 3, 3, 3],
        0,
        0
      );
      this.codexStageGroup.add(this.codexTankRig.root);
    } else if (effectType === 'FLAME') {
      this.codexTankRig = this.modelFactory.createEnemyTank(EnemyClass.FLAMETHROWER);
      this.codexTankRig.root.position.set(-1.1, 0, 0);
      this.codexTankRig.hull.rotation.y = Math.PI / 2;
      this.codexTankRig.turret.rotation.y = Math.PI / 2;
      this.codexStageGroup.add(this.codexTankRig.root);

      const forest = this.modelFactory.createForestBlock();
      forest.position.set(1.4, 0, 0);
      this.codexStageGroup.add(forest);
    } else if (effectType === 'MINE') {
      this.codexTankRig = this.modelFactory.createEnemyTank(EnemyClass.MINE_LAYER);
      this.codexTankRig.root.position.set(-1.15, 0, 0);
      this.codexTankRig.hull.rotation.y = -Math.PI / 2;
      this.codexTankRig.turret.rotation.y = -Math.PI / 2;
      this.codexStageGroup.add(this.codexTankRig.root);

      const positions = [
        [0.8, 0],
        [1.55, 0.75],
        [1.55, -0.75],
      ];
      this.codexMines = positions.map(([mx, mz]) => {
        const group = this.modelFactory.createLandMineMesh();
        group.position.set(mx, 0, mz);
        group.scale.setScalar(1.3);
        this.codexStageGroup.add(group);
        return { group, lightMesh: group.children[1] };
      });
    } else if (effectType === 'JAMMER') {
      this.codexTankRig = this.modelFactory.createEnemyTank(EnemyClass.JAMMER);
      this.codexStageGroup.add(this.codexTankRig.root);
    } else if (effectType === 'REPAIR') {
      const hq = this.modelFactory.createCommandBaseBlock();
      hq.position.set(-1.7, 0, -0.4);
      hq.scale.setScalar(0.8);
      this.codexStageGroup.add(hq);

      this.codexTankRig = this.modelFactory.createPlayerTank();
      this.codexTankRig.root.position.set(1.05, 0, 0);
      this.modelFactory.updatePlayerTankVisuals(
        this.codexTankRig,
        this.upgrades,
        false,
        2,
        [1, 1, 1, 1],
        0,
        0
      );
      this.codexStageGroup.add(this.codexTankRig.root);
    }
  }

  triggerCodexDemo() {
    if (!this.codexOpen || !this.codexItem) return;
    this.codexDemoTimer = 0.01;
    if (this.codexItem.turretType === 'MLRS') {
      sound.playMissileLaunch();
    } else {
      sound.playCannonShot(true);
    }
  }

  /** Muzzle position of a Codex rig in Codex-FX local space (stage and FX rotate together). */
  getCodexMuzzle(rig, fallbackX, fallbackY, fallbackZ) {
    if (!rig?.muzzleFlash) return { x: fallbackX, y: fallbackY, z: fallbackZ };
    rig.muzzleFlash.updateWorldMatrix(true, false);
    const v = rig.muzzleFlash.getWorldPosition(new THREE.Vector3());
    this.codexFx.root.updateWorldMatrix(true, false);
    this.codexFx.root.worldToLocal(v);
    return { x: v.x, y: v.y, z: v.z };
  }

  updateCodexShowcase(dt, elapsed) {
    if (this.codexAutoRotate && !this.codexDragging) {
      this.codexTurntableAngle += dt * 0.42;
    }
    this.codexStageGroup.rotation.y = this.codexTurntableAngle;
    this.codexFxGroup.rotation.y = this.codexTurntableAngle;
    this.codexFx.root.rotation.y = this.codexTurntableAngle;

    const item = this.codexItem;
    if (!item) return;

    if (item.category === 'TANKS' && this.codexTankRig) {
      this.codexRecoil = THREE.MathUtils.damp(this.codexRecoil, 0, 14, dt);
      this.codexBarrelRecoils[0] = THREE.MathUtils.damp(
        this.codexBarrelRecoils[0],
        0,
        16,
        dt
      );
      this.codexBarrelRecoils[1] = THREE.MathUtils.damp(
        this.codexBarrelRecoils[1],
        0,
        16,
        dt
      );
      if (this.codexTankRig.turrets?.length > 1) {
        const [t0, t1] = this.codexTankRig.turrets;
        t0.turret.rotation.y = Math.sin(elapsed * 0.85) * 0.52;
        t1.turret.rotation.y = Math.PI + Math.cos(elapsed * 0.72) * 0.58;
        t0.barrelPivot.position.z = (t0.baseBarrelZ ?? 0.38) - this.codexBarrelRecoils[0];
        t1.barrelPivot.position.z = (t1.baseBarrelZ ?? 0.38) - this.codexBarrelRecoils[1];
        if (this.codexFlashTimer > 0) {
          this.codexFlashTimer -= dt;
          t0.muzzleFlash.material.opacity = 0;
          t1.muzzleFlash.material.opacity = 0;
        }
      } else {
        if (this.codexTankRig.barrelPivot) {
          const baseZ = item.id?.startsWith('boss_') ? 0.68 : 0.46;
          this.codexTankRig.barrelPivot.position.z = baseZ - this.codexRecoil;
        }
        if (this.codexTankRig.c5Barrels) {
          this.codexTankRig.c5Barrels[0].position.z = -this.codexBarrelRecoils[0];
          this.codexTankRig.c5Barrels[1].position.z = -this.codexBarrelRecoils[1];
        }
        if (this.codexFlashTimer > 0) {
          this.codexFlashTimer -= dt;
          if (this.codexTankRig.muzzleFlash) {
            this.codexTankRig.muzzleFlash.material.opacity = 0;
          }
        }
        if (this.codexTankRig.turret) {
          this.codexTankRig.turret.rotation.y = Math.sin(elapsed * 0.9) * 0.45;
        }
      }
      if (this.codexTankRig.gear) {
        const gear = this.codexTankRig.gear;
        gear.left.value += (dt * 0.9) / gear.scale;
        gear.right.value += (dt * 0.9) / gear.scale;
      }
      if (this.codexTankRig.radarDish) {
        this.codexTankRig.radarDish.rotation.y = elapsed * 3.5;
      }
      if (item.isPlayerMbt) {
        const hoverActive = (this.codexPreviewUpgrades.chassis || 1) >= 5;
        const hoverY = hoverActive ? 0.05 + Math.sin(elapsed * 4.0) * 0.012 : 0;
        this.codexTankRig.root.position.y = hoverY;
        const apsArr = this.codexPreviewUpgrades.aps ? [3, 3, 3, 3] : [0, 0, 0, 0];
        const missileCount = this.codexPreviewUpgrades.missile ? 4 : 0;
        this.modelFactory.updatePlayerTankVisuals(
          this.codexTankRig,
          this.codexPreviewUpgrades,
          hoverActive,
          missileCount,
          apsArr,
          dt * 2.2,
          elapsed
        );
      }

      this.codexDemoTimer -= dt;
      if (this.codexDemoTimer <= 0) {
        if (this.codexTankRig.turrets?.length > 1) {
          const tIdx = this.codexNextBarrel % this.codexTankRig.turrets.length;
          this.codexNextBarrel = (tIdx + 1) % this.codexTankRig.turrets.length;
          const slot = this.codexTankRig.turrets[tIdx];
          this.codexDemoTimer = 1.05;
          this.codexFlashTimer = 0.08;
          this.codexBarrelRecoils[tIdx] = 0.22;
          const tAngle = slot.turret.rotation.y || 0;
          const dirX = Math.sin(tAngle);
          const dirZ = Math.cos(tAngle);
          const perpX = Math.cos(tAngle);
          const perpZ = -Math.sin(tAngle);
          const m = this.getCodexMuzzle(slot, dirX * 1.45, 0.95, slot.pivotZ + dirZ * 1.45);
          for (const lat of [-0.14, 0.14]) {
            this.codexFx.muzzleFlash(
              m.x + perpX * lat,
              m.y,
              m.z + perpZ * lat,
              dirX,
              dirZ,
              { scale: 1.15 }
            );
          }
        } else {
          const isC5 =
            item.isPlayerMbt && (this.codexPreviewUpgrades.cannon || 1) === 5;
          this.codexDemoTimer = isC5 ? 0.55 : 2.2;
          this.codexFlashTimer = 0.08;
          const turretAngle = this.codexTankRig.turret?.rotation.y || 0;
          const dirX = Math.sin(turretAngle);
          const dirZ = Math.cos(turretAngle);
          const perpX = Math.cos(turretAngle);
          const perpZ = -Math.sin(turretAngle);

          if (isC5) {
            const bIdx = this.codexNextBarrel % 2;
            this.codexNextBarrel = (bIdx + 1) % 2;
            this.codexRecoil = 0.06;
            this.codexBarrelRecoils[bIdx] = 0.24;
            const lat = bIdx === 0 ? -0.14 : 0.14;
            if (this.codexTankRig.muzzleFlash) {
              this.codexTankRig.muzzleFlash.position.x = lat;
            }
            const m = this.getCodexMuzzle(
              this.codexTankRig,
              dirX * 1.65 + perpX * lat,
              0.9,
              dirZ * 1.65 + perpZ * lat
            );
            this.codexFx.muzzleFlash(m.x, m.y, m.z, dirX, dirZ, { scale: 0.85 });
          } else {
            this.codexRecoil = 0.22;
            if (this.codexTankRig.muzzleFlash) {
              this.codexTankRig.muzzleFlash.position.x = 0;
            }
            const m = this.getCodexMuzzle(this.codexTankRig, dirX * 1.45, 0.9, dirZ * 1.45);
            this.codexFx.muzzleFlash(m.x, m.y, m.z, dirX, dirZ, {
              scale: item.isBoss || item.id?.startsWith('boss_') ? 1.2 : 0.95,
            });
          }
        }
      }
    }

    if (item.turretType && this.codexTankRig) {
      this.codexRecoil = THREE.MathUtils.damp(this.codexRecoil, 0, 12, dt);
      if (this.codexTankRig.barrelPivot) {
        this.codexTankRig.barrelPivot.position.z = -this.codexRecoil;
      }
      if (this.codexTankRig.turret) {
        this.codexTankRig.turret.rotation.y = Math.sin(elapsed * 0.95) * 0.45;
      }
      this.codexDemoTimer -= dt;
      if (this.codexDemoTimer <= 0) {
        const tType = item.turretType;
        const reloadTime = tType === 'HOWITZER' ? 3.8 : tType === 'MLRS' ? 3.2 : 2.0;
        this.codexDemoTimer = reloadTime;
        const turretAngle = this.codexTankRig.turret?.rotation.y || 0;
        const dirX = Math.sin(turretAngle);
        const dirZ = Math.cos(turretAngle);
        this.codexRecoil = tType === 'HOWITZER' ? 0.28 : tType === 'MLRS' ? 0.16 : 0.24;
        const muzzleDist = this.codexTankRig.muzzleDist || 1.4;
        const mX = dirX * muzzleDist;
        const mY = 0.85;
        const mZ = dirZ * muzzleDist;

        if (tType === 'HOWITZER') {
          sound.playCannonShot(true);
          this.codexFx.muzzleFlash(mX, mY, mZ, dirX, dirZ, { scale: 1.45, tint: 0x2dd4bf });
          this.codexFx.shockwave(mX, 0.05, mZ, 0.2, 2.2, 0x2dd4bf, 0.35, 0.85);
        } else if (tType === 'MLRS') {
          sound.playMissileLaunch();
          this.codexFx.muzzleFlash(mX, mY, mZ, dirX, dirZ, { scale: 1.15, tint: 0xf87171, smoke: true });
          this.codexFx.sparks(mX, mY, mZ, 0xf87171, 6);
        } else {
          sound.playCannonShot(false);
          this.codexFx.muzzleFlash(mX, mY, mZ, dirX, dirZ, { scale: 1.25, tint: 0x38bdf8 });
        }
      }
    }

    if (item.category === 'POWERUPS' && this.codexTankRig?.isCrate) {
      const crate = this.codexTankRig.root;
      crate.position.y = 0.35 + Math.sin(elapsed * 3) * 0.1;
      crate.rotation.y = elapsed * 1.2;
      const grounded = crate.userData.grounded;
      if (grounded) {
        grounded.position.y = -crate.position.y / crate.scale.y;
        grounded.rotation.y = -crate.rotation.y;
      }
    }

    if (item.category === 'EFFECTS') {
      const fx = item.effectType;
      this.codexDemoTimer -= dt;

      if (fx === 'CANNON' && this.codexTankRig) {
        this.codexRecoil = THREE.MathUtils.damp(this.codexRecoil, 0, 14, dt);
        this.codexTankRig.barrelPivot.position.z = 0.46 - this.codexRecoil;
        if (this.codexDemoTimer <= 0) {
          this.codexDemoTimer = 1.6;
          this.codexRecoil = 0.22;
          const m = this.getCodexMuzzle(this.codexTankRig, 0.3, 0.85, 0);
          this.codexFx.muzzleFlash(m.x, m.y, m.z, 1, 0, { scale: 1.1 });
          const impactX = 0.68;
          this.codexFx.schedule(0.04, () => {
            this.codexFx.shellTrail(m.x + 0.2, m.y, m.z, impactX, m.y, m.z, 0xffb030, 0.2, 0.16);
          });
          this.codexFx.schedule(0.07, () => {
            this.codexFx.masonryHit(impactX, m.y, m.z, { concrete: true, heavy: true });
            this.codexFx.point('glow', {
              x: impactX, y: m.y, z: m.z,
              life: 0.1, size: 1.4, tex: 3, color: [1, 0.95, 0.8],
            });
          });
        }
      } else if (fx === 'MISSILE') {
        this.updateCodexMissile(dt);
        if (this.codexDemoTimer <= 0) {
          this.codexDemoTimer = 2.6;
          this.launchCodexMissile();
        }
      } else if (fx === 'ARTILLERY') {
        const cycle = (elapsed * 0.6) % 1;
        if (this.codexHazardFill) {
          this.codexHazardFill.scale.setScalar(Math.max(0.08, cycle));
        }
        if (this.codexHazardRing) {
          this.codexHazardRing.visible = Math.floor(elapsed * 10) % 2 === 0;
        }
        const wrapped = cycle < (this.codexArcPrev ?? 0);
        this.codexArcPrev = cycle;
        const m = this.getCodexMuzzle(this.codexTankRig, -0.6, 1.2, 0);
        if (wrapped) {
          this.codexFx.explosion(1.25, 0.3, 0, { scale: 0.75, scorchLife: 2.5 });
          this.codexFx.muzzleFlash(m.x, m.y, m.z, 1, 0, { scale: 1.0, light: false });
        }
        if (this.codexArcShell) {
          const sx = THREE.MathUtils.lerp(m.x, 1.25, cycle);
          const sz = THREE.MathUtils.lerp(m.z, 0, cycle);
          const sy = THREE.MathUtils.lerp(m.y, 0.3, cycle) + Math.sin(cycle * Math.PI) * 3.2;
          this.codexArcShell.position.set(sx, sy, sz);
          this.codexArcShell.visible = true;
          this.codexFx.shellSmokeTrail(sx, sy, sz, true);
        }
      } else if (fx === 'APS' && this.codexTankRig) {
        this.modelFactory.updatePlayerTankVisuals(
          this.codexTankRig,
          { cannon: 3, vehicleFrame: 3, engine: 3, armor: 3 },
          false,
          2,
          [3, 3, 3, 3],
          0,
          elapsed
        );
        if (this.codexDemoTimer <= 0) {
          this.codexDemoTimer = 1.3;
          const angle = Math.random() * Math.PI * 2;
          const cx = Math.cos(angle);
          const cz = Math.sin(angle);
          const startR = 3.4;
          const killR = 1.85;
          const speed = 16;
          this.codexFx.streak({
            x: cx * startR, y: 0.95, z: cz * startR,
            vx: -cx * speed, vy: 0, vz: -cz * speed,
            life: (startR - killR) / speed,
            len: 0.03,
            width: 0.16,
            color: [1, 0.4, 0.15],
            cool: false,
            shrink: false,
          });
          this.codexFx.schedule((startR - killR) / speed, () => {
            this.codexFx.apsIntercept(
              Math.sign(cx || 1) * 0.55,
              1.0,
              Math.sign(cz || 1) * 0.7,
              cx * killR,
              0.95,
              cz * killR
            );
          });
        }
      } else if (fx === 'FLAME') {
        const m = this.getCodexMuzzle(this.codexTankRig, -0.25, 0.72, 0);
        this.codexFlameAcc = (this.codexFlameAcc || 0) + dt;
        const step = 1 / 45 / this.codexFx.q;
        while (this.codexFlameAcc >= step) {
          this.codexFlameAcc -= step;
          for (let k = 0; k < 2; k++) {
            const reach = Math.random();
            const spread = (Math.random() - 0.5) * 0.35 * reach;
            this.codexFx.flameJet(m.x + reach * 1.7, m.y + reach * 0.05, m.z + spread, 6, 0, reach);
          }
        }
        if (this.codexDemoTimer <= 0) {
          this.codexDemoTimer = 2.5;
          this.codexFx.addEmitter('burn', 1.4, 0.55, 0, 3.0, 0.9);
        }
      } else if (fx === 'MINE' && this.codexMines) {
        const blink = Math.floor(elapsed * 6) % 2 === 0;
        this.codexMines.forEach((m) => {
          m.lightMesh.visible = blink;
        });
        if (this.codexDemoTimer <= 0) {
          this.codexDemoTimer = 2.0;
          this.codexMineIdx = ((this.codexMineIdx ?? -1) + 1) % this.codexMines.length;
          const mine = this.codexMines[this.codexMineIdx];
          if (mine.group.visible) {
            const { x, z } = mine.group.position;
            mine.group.visible = false;
            this.codexFx.explosion(x, 0.15, z, { scale: 0.6, scorchLife: 3 });
            sound.playEnvironmentalExplosion({ x, z });
            this.codexFx.schedule(1.5, () => {
              mine.group.visible = true;
            });
          }
        }
      } else if (fx === 'JAMMER' && this.codexTankRig) {
        if (this.codexTankRig.radarDish) {
          this.codexTankRig.radarDish.rotation.y = elapsed * 4.0;
        }
        this.codexArcTimer = (this.codexArcTimer || 0) - dt;
        if (this.codexArcTimer <= 0) {
          this.codexArcTimer = 0.22;
          this.codexFx.electric(0, 1.4, 0, 0xc084fc, 1, 0.6);
        }
        if (this.codexDemoTimer <= 0) {
          this.codexDemoTimer = 1.5;
          this.codexFx.jammerPulse(0, 1.2, 0, 3.0);
        }
      } else if (fx === 'REPAIR') {
        this.codexRepairTimer = (this.codexRepairTimer || 0) - dt;
        if (this.codexRepairTimer <= 0) {
          this.codexRepairTimer = 0.14;
          this.codexFx.repair(1.05, 0.75, 0, 2);
        }
        if (this.codexDemoTimer <= 0) {
          this.codexDemoTimer = 1.6;
          this.codexFx.segment(-1.2, 1.45, 0, 1.05, 1.0, 0, [0.3, 1, 0.6], 0.1, 0.45, 0.9);
          this.codexFx.shockwave(-1.2, 0.05, 0, 0.4, 2.8, 0x34d399, 0.8, 0.6);
          this.codexFx.repair(1.05, 0.9, 0, 6);
        }
      }
    }
  }

  launchCodexMissile() {
    if (this.codexMissile) {
      this.codexFxGroup.remove(this.codexMissile.mesh);
      this.codexMissile = null;
    }
    const mesh = createMissileVisual('player', 0.8);
    this.codexFxGroup.add(mesh);
    const start = { x: -0.95, y: 1.35, z: 0.25 };
    const end = { x: 1.3, y: 0.85, z: 0 };
    this.codexMissile = { mesh, t: 0, dur: 0.85, start, end, prevX: start.x, prevZ: start.z };
    this.codexFx.missileLaunch(start.x - 0.2, start.y, start.z, 1, 0, { scale: 0.6, light: false });
    sound.playMissileLaunch();
  }

  updateCodexMissile(dt) {
    const ms = this.codexMissile;
    if (!ms) return;
    ms.t += dt;
    const k = Math.min(1, ms.t / ms.dur);
    const x = THREE.MathUtils.lerp(ms.start.x, ms.end.x, k);
    const z = THREE.MathUtils.lerp(ms.start.z, ms.end.z, k) + Math.sin(k * Math.PI * 2) * 0.18;
    const y = THREE.MathUtils.lerp(ms.start.y, ms.end.y, k) + Math.sin(k * Math.PI) * 0.7;
    const dx = x - ms.prevX;
    const dz = z - ms.prevZ;
    const len = Math.hypot(dx, dz) || 1;
    ms.mesh.position.set(x, y, z);
    const heading = Math.atan2(dx, dz);
    let turn = heading - ms.mesh.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    ms.mesh.rotation.y = heading;
    animateMissileVisual(ms.mesh, dt, dt > 0 ? turn / dt : 0);
    this.codexFx.missileExhaust(x, y, z, dx / len, dz / len, {
      smokeEvery: true,
      prevX: ms.prevX,
      prevZ: ms.prevZ,
    });
    ms.prevX = x;
    ms.prevZ = z;
    if (k >= 1) {
      this.codexFxGroup.remove(ms.mesh);
      this.codexMissile = null;
      this.codexFx.missileImpact(ms.end.x, ms.end.y, ms.end.z, dx / len, dz / len, { scale: 0.7 });
      sound.playExplosion(0.9);
    }
  }

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

  gridToWorld(row, col) {
    const half = (GRID_SIZE * TILE_SIZE) / 2;
    return {
      x: col * TILE_SIZE - half + TILE_SIZE / 2,
      z: row * TILE_SIZE - half + TILE_SIZE / 2,
    };
  }

  worldToGrid(x, z) {
    const half = (GRID_SIZE * TILE_SIZE) / 2;
    const col = Math.floor((x + half) / TILE_SIZE);
    const row = Math.floor((z + half) / TILE_SIZE);
    return { row, col };
  }

  loadSector(sectorIdx, startPlaying = true) {
    const prevSectorIdx = this.currentSectorIndex;
    if (this.status === GameStatus.GAME_OVER || this.wasDefeated) {
      this.restoreAllComponents();
      this.wasDefeated = false;
    }
    this.currentSectorIndex = Math.max(0, Math.min(SECTORS.length - 1, sectorIdx));
    this.squadDirector = null;
    this.attackTokens = null;
    this.squadFrame = null;
    this.playerTrail = [];
    const sector = SECTORS[this.currentSectorIndex];

    this.scene.background = new THREE.Color(sector.fogColor);
    this.scene.fog = new THREE.FogExp2(sector.fogColor, 0.012);
    this.urbanGroundTexture?.dispose();
    this.urbanGroundTexture = (sector.theme === 'urban' || sector.decoration) ? createUrbanGroundTexture(sector, { lowQuality: this.isSoftwareGl || this.quality === 'low', maxTextureSize: this.renderer.capabilities.maxTextureSize }) : null;
    if (this.legacyGroundDecal) this.legacyGroundDecal.visible = !sector.decoration;
    this.groundMesh.material.map = this.urbanGroundTexture || this.modelFactory.groundTex;
    this.groundMesh.material.needsUpdate = true;

    this.clearGroup(this.mapGroup);
    this.tileBatcher.reset();
    this.clearGroup(this.entityGroup);
    this.clearGroup(this.fxGroup);
    this.fx.clear();

    this.pendingBarrelExplosions = [];
    this.enemies = [];
    this.brickRubble = [];
    if (this.projectiles) {
      for (const p of this.projectiles) {
        if (p.soundHandle) sound.stopMissileLoop(p.soundHandle);
      }
    }
    sound.stopEngineLoop();
    this.projectiles = [];
    this.mines = [];
    this.lasers = [];
    this.hazardZones = [];
    this.burningForests = [];
    this.particles = [];
    this.powerUps = [];
    this.boxPowerUpPool = new BoxPowerUpPool();
    if (this.defenseTurrets) {
      for (const t of this.defenseTurrets) {
        t.alive = false;
        if (t.rig?.root) this.mapGroup.remove(t.rig.root);
      }
    }
    this.defenseTurrets = [];
    this.baseAlive = true;
    this.empTimer = 0;
    this.activeMapRules = sector.rules || resolveMapRules(sector);
    this.enemyBaseAlive = false;
    this._enemyBaseCell = null;
    this.enemyBaseMaxHp = this.activeMapRules.enemyBaseMaxHp || 48;
    this.enemyBaseHp = 0;
    this.enemyBaseName =
      this.activeMapRules.enemyBaseName || 'Enemy Fortified Citadel';

    this.grid = [];
    this.componentWaterEgress = false;

    this._spawnerCells = null;
    for (let r = 0; r < GRID_SIZE; r++) {
      const rowCells = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        const supply = sector.powerups?.find((item) => item.row === r && item.col === c);
        const type = supply ? TileType.BOXES : sector.grid[r][c];
        const { x, z } = this.gridToWorld(r, c);
        let mesh = null;
        let subMeshes;
        let hp = 1;

        if (type === TileType.BRICK) {
          const brick = this.modelFactory.createBrickBlock();
          brick.group.position.set(x, 0, z);
          this.mapGroup.add(brick.group);
          mesh = brick.group;
          subMeshes = brick.subMeshes;
          hp = 4;
        } else if (type === TileType.CONCRETE) {
          const concrete = this.modelFactory.createConcreteBlock();
          concrete.position.set(x, 0, z);
          this.mapGroup.add(concrete);
          mesh = concrete;
          hp = 16;
        } else if (type === TileType.FOREST) {
          const forest = this.modelFactory.createForestBlock();
          forest.position.set(x, 0, z);
          this.mapGroup.add(forest);
          mesh = forest;
        } else if (type === TileType.WATER) {
          // Water is rendered as one continuous sector surface below.
          mesh = null;
        } else if (type === TileType.ICE) {
          // Ice is rendered as one continuous sector surface below.
          mesh = null;
        } else if (type === TileType.SPAWNER) {
          const spawner = this.modelFactory.createSpawnerPad();
          spawner.position.set(x, 0, z);
          this.mapGroup.add(spawner);
          mesh = spawner;
          hp = 6;
        } else if (type === TileType.BASE) {
          // One hangar model spans both HQ cells; it hangs on the anchor cell.
          const anchor = sector.baseCell || BASE_CELL;
          if (r === anchor.row && c === anchor.col) {
            const baseBlock = this.modelFactory.createCommandBaseBlock();
            baseBlock.position.set(x + TILE_SIZE / 2, 0, z);
            this.mapGroup.add(baseBlock);
            mesh = baseBlock;
          }
          hp = 1;
        } else if (type === TileType.ENEMY_BASE) {
          const enemyBaseBlock = this.modelFactory.createEnemyBaseBlock();
          enemyBaseBlock.position.set(x, 0, z);
          this.mapGroup.add(enemyBaseBlock);
          mesh = enemyBaseBlock;
          hp = this.enemyBaseMaxHp;
          this.enemyBaseAlive = true;
          this.enemyBaseHp = hp;
          this._enemyBaseCell = { row: r, col: c };
        } else if (type === TileType.HEDGEHOG) {
          const hedgehog = this.modelFactory.createHedgehogBlock();
          hedgehog.position.set(x, 0, z);
          this.mapGroup.add(hedgehog);
          mesh = hedgehog;
          hp = 1;
        } else if (type === TileType.BOXES) {
          mesh = this.modelFactory.createBoxesBlock();
          mesh.position.set(x, 0, z);
          this.mapGroup.add(mesh);
          hp = 2;
        } else if (type === TileType.BARREL) {
          const barrel = this.modelFactory.createBarrelBlock();
          barrel.position.set(x, 0, z);
          this.mapGroup.add(barrel);
          mesh = barrel;
          hp = 1;
        }

        rowCells.push({
          row: r,
          col: c,
          type,
          hp,
          maxHp: hp,
          mesh,
          subMeshes,
        });
      }
      this.grid.push(rowCells);
    }

    if (this.activeMapRules.hasEnemyFortifiedBase && !this.enemyBaseAlive) {
      const ebCell = this.activeMapRules.enemyBaseCell || { row: 2, col: 17 };
      const cell = this.grid[ebCell.row]?.[ebCell.col];
      if (cell) {
        if (cell.mesh) this.mapGroup.remove(cell.mesh);
        const { x, z } = this.gridToWorld(ebCell.row, ebCell.col);
        const enemyBaseBlock = this.modelFactory.createEnemyBaseBlock();
        enemyBaseBlock.position.set(x, 0, z);
        this.mapGroup.add(enemyBaseBlock);
        cell.type = TileType.ENEMY_BASE;
        this._spawnerCells = null;
        cell.hp = this.enemyBaseMaxHp;
        cell.maxHp = this.enemyBaseMaxHp;
        cell.mesh = enemyBaseBlock;
        cell.subMeshes = undefined;
        this.enemyBaseAlive = true;
        this.enemyBaseHp = this.enemyBaseMaxHp;
        this._enemyBaseCell = { row: ebCell.row, col: ebCell.col };
      }
    }
    this.setupDefenseTurrets();

    this.waterSurfaceMesh = this.modelFactory.createWaterBlock(
      this.grid.map(row => row.map(cell => cell.type)), TileType.WATER
    );
    this.mapGroup.add(this.waterSurfaceMesh);
    this.iceSurfaceMesh = this.modelFactory.createIceBlock(
      this.grid.map(row => row.map(cell => cell.type)), TileType.ICE
    );
    this.mapGroup.add(this.iceSurfaceMesh);

    this.playerRig = this.modelFactory.createPlayerTank();
    const pSpawnCell = sector.playerSpawnCell || {
      row: BASE_CELL.row,
      col: BASE_CELL.col - 3,
    };
    const spawnPos = this.gridToWorld(pSpawnCell.row, pSpawnCell.col);
    this.playerX = spawnPos.x;
    this.playerZ = spawnPos.z;
    this.playerVx = 0;
    this.playerVz = 0;
    this.playerForwardSpeed = 0;
    this.playerHullAngle = Math.PI;
    this.playerTurretAngle = Math.PI;

    const isContractSector = sector.gameMode === 'contract';
    const isSurvivalSector = sector.gameMode === 'survival';
    const isIsolatedSector = isSurvivalSector || isContractSector;
    if (isSurvivalSector) {
      this.setProfileMode('survival', { resetTank: startPlaying });
    } else if (isContractSector) {
      this.setProfileMode('contract', { resetTank: startPlaying });
    } else {
      this.setProfileMode('campaign');
    }

    this.jammedTimer = 0;
    this.recomputePlayerStats(false);

    this.assembledTank = resolveAssembledTank(this.playerSave);
    this.subsystems = createTankSubsystems();
    const savedRepairCharges = isIsolatedSector
      ? 0
      : Number.isInteger(this.playerSave?.repairKitCharges)
      ? this.playerSave.repairKitCharges
      : 0;
    this.repairKitState = createRepairKitState(savedRepairCharges);
    this.playerArmorPanels = {
      SOCKET_ARMOR_FRONT: {
        ...ARMOR_PANEL_CATALOG.sb_40,
        ...(this.assembledTank.armorPanels?.SOCKET_ARMOR_FRONT || {}),
        integrity: this.assembledTank.armorPanels?.SOCKET_ARMOR_FRONT?.maxIntegrity || 100,
        destroyed: false,
      },
      SOCKET_ARMOR_LEFT: {
        ...ARMOR_PANEL_CATALOG.ekran_b25_left,
        ...(this.assembledTank.armorPanels?.SOCKET_ARMOR_LEFT || {}),
        integrity: this.assembledTank.armorPanels?.SOCKET_ARMOR_LEFT?.maxIntegrity || 70,
        destroyed: false,
      },
      SOCKET_ARMOR_RIGHT: {
        ...ARMOR_PANEL_CATALOG.ekran_b25_right,
        ...(this.assembledTank.armorPanels?.SOCKET_ARMOR_RIGHT || {}),
        integrity: this.assembledTank.armorPanels?.SOCKET_ARMOR_RIGHT?.maxIntegrity || 70,
        destroyed: false,
      },
      SOCKET_ARMOR_TURRET: {
        ...ARMOR_PANEL_CATALOG.turret_cheek_35,
        ...(this.assembledTank.armorPanels?.SOCKET_ARMOR_TURRET || {}),
        integrity: this.assembledTank.armorPanels?.SOCKET_ARMOR_TURRET?.maxIntegrity || 85,
        destroyed: false,
      },
    };
    this.smokeClouds = [];
    this.inSmoke = false;
    this.smokeCharges = 3;
    this.smokeCooldown = 0;
    this.priorityTargetId = null;
    this.sensorContacts.clear();
    this.lootContainers = [];
    this.lastSettlementSummary = null;
    this.creditsEarnedThisMission = 0;

    const authoredMission = {
      id: sector.mapId, code: sector.code, title: sector.name,
      subtitle: sector.subtitle, completionReward: sector.completionReward,
    };
    this.activeMissionRun = {
      runId: `run_${Date.now()}_${this.currentSectorIndex}`,
      missionId: authoredMission.id,
      isContract: isContractSector,
      isSurvival: isSurvivalSector,
      contractId: sector.contractId || (isContractSector ? sector.mapId : null),
      status: 'in_progress',
      rewardsCommitted: false,
      deliveredCargoFlags: {},
      contractCargoCredits: 0,
      completionReward: { ...authoredMission.completionReward },
      lootContainers: this.lootContainers,
    };

    if (startPlaying && !isSurvivalSector && sectorIdx > prevSectorIdx && this.playerHp > 0) {
      this.playerHp = Math.min(
        this.playerMaxHp,
        this.playerHp + DURABILITY.STAGE_CLEAR_REPAIR
      );
    } else {
      this.playerHp = this.playerMaxHp;
    }

    if (isIsolatedSector) {
      this.initApsLaunchers(APS.START_ROUNDS);
      this.missileAmmo = 2;
      this.cannonAmmo = CANNON_AMMO.START_ROUNDS;
    } else if (Array.isArray(this.playerSave?.apsAmmo)) {
      this.apsAmmo = [...this.playerSave.apsAmmo];
      const total = this.apsAmmo.reduce((a, b) => a + b, 0);
      if (total < APS.START_ROUNDS) {
        this.addApsRounds(APS.START_ROUNDS - total);
      }
    } else {
      this.initApsLaunchers(APS.START_ROUNDS);
    }
    this.apsRearmTimer = 0;
    if (!isIsolatedSector) {
      this.missileAmmo = Math.max(this.missileAmmo, 2);
    }
    this.missileCooldown = 0;
    this.repairKitCount = REPAIR_KIT.MAX;

    this.playerRig.root.position.set(this.playerX, 0, this.playerZ);
    this.syncPlayerVisuals(0, 0);
    this.entityGroup.add(this.playerRig.root);

    // Honor previously earned boss reserves without creating new battlefield drops.
    if (startPlaying && !isSurvivalSector && this.playerSave.pendingBossPowerUps?.length) {
      for (const type of this.playerSave.pendingBossPowerUps) this.applyPowerUp(type);
      this.playerSave.pendingBossPowerUps = [];
      this.saveRepo.savePlayerSave(this.playerSave);
    }

    this.modelFactory.ensureEnemyModels(
      isSurvivalSector
        ? [
            ...Object.values(TANK_TYPES),
            EnemyClass.BOSS_MAMMOTH,
            EnemyClass.BOSS_HYDRA,
            EnemyClass.BOSS_INFERNO,
            EnemyClass.BOSS_TITAN,
          ]
        : [
            ...(sector.enemyPool || []),
            ...(sector.fixedSpawns || []).map((sp) => sp.enemyClass),
            ...(sector.rules?.spawnSectorBossOnClear
              ? [
                  sector.bossClass,
                  ...(sector.bossSequence
                    ? sector.bossSequence.flat().map((b) => b.enemyClass)
                    : []),
                  ...MAMMOTH.ESCORT_CLASSES,
                  ...HYDRA.ESCORT_CLASSES,
                  ...INFERNO.ESCORT_CLASSES,
                  ...TITAN.ESCORT_CLASSES,
                ]
              : []),
          ]
    );

    this.enemySpawnQueue = Array.isArray(sector.enemyPool)
      ? [...sector.enemyPool]
      : [];
    this.vanguardRemainingToSpawn = this.enemySpawnQueue.length;
    this.spawnPoolCursor = 0;
    this.spawnerRoundRobinIdx = 0;
    this.bossSpawned = false;
    this.bossSequenceStarted = false;
    this.bossStageIndex = 0;
    this.spawnTimer = sector.spawnIntervalSec ?? 2.6;

    const maxConcurrent = sector.maxConcurrentEnemies ?? 8;

    this.encounterState = null;
    this.contractState = null;
    this.survivalState = null;
    this.contractCargoMeshes = null;
    this.contractPadMesh = null;
    this.contractLandmarksMesh = null;
    this.carriedCargoIndicator = null;

    if (isSurvivalSector) {
      this.survivalState = createSurvivalState();
      this.startSurvivalWave(1, false);
    } else if (isContractSector) {
      const contractDef =
        CONTRACTS_CATALOG.find(
          (item) => item.id === sector.contractId || item.id === sector.mapId
        ) || LAST_CARGO_CONTRACT;
      const isSabotage = contractDef.contractType === CONTRACT_TYPES.SABOTAGE_PROTOCOL;
      this.contractState = createContractState(contractDef, (r, c) => this.gridToWorld(r, c));
      this.contractPadMesh = this.modelFactory.createDeliveryPadMesh(this.contractState.deliveryPad);
      this.mapGroup.add(this.contractPadMesh);
      this.contractLandmarksMesh = this.modelFactory.createContractLandmarks((r, c) => this.gridToWorld(r, c));
      this.mapGroup.add(this.contractLandmarksMesh);
      this.contractCargoMeshes = new Map();
      for (const c of this.contractState.containers) {
        const mesh = isSabotage
          ? this.modelFactory.createRadarRelayMesh(c.slot, c.code, c.accentHex)
          : this.modelFactory.createCargoContainerMesh(c.slot, c.code, c.accentHex);
        mesh.position.set(c.x, 0, c.z);
        this.entityGroup.add(mesh);
        this.contractCargoMeshes.set(c.id, mesh);
      }
      this.carriedCargoIndicator = this.modelFactory.createCarriedCargoIndicator();
      this.playerRig.root.add(this.carriedCargoIndicator);

      // Admit G0's first packet of 3 immediately at contract start
      stepContractScheduler(
        this.contractState,
        0.01,
        this.enemies.length,
        (unitType, assignment, groupEntry) => this.spawnContractEnemy(unitType, assignment, groupEntry)
      );
      this.vanguardRemainingToSpawn =
        this.contractState.scheduler.totalBudget - this.contractState.scheduler.totalSpawned;
      this.enemySpawnQueue = [];
    } else if (sector.encounters?.length) {
      const opening = sector.encounters[0];
      const count = Math.min(sector.initialSpawnCount, opening.enemies.length, maxConcurrent);
      for (let i = 0; i < count; i++) {
        const cell = opening.initialCells[i];
        const enemyClass = opening.enemies[i];
        const spawn = this.resolveBorderSpawn(cell, { enemyClass });
        if (!spawn) continue;
        this.createEnemyAt(enemyClass, spawn.spawnPos.x, spawn.spawnPos.z, false, spawn.entryTarget);
        this.enemies.at(-1).campaignPatrolRoute = opening.patrolRoute;
      }
      this.encounterState = createEncounterState(sector.encounters, count);
      this.vanguardRemainingToSpawn = remainingEncounterEnemies(this.encounterState);
      this.enemySpawnQueue = [];
    } else {
    if (Array.isArray(sector.fixedSpawns)) {
      for (const fixed of sector.fixedSpawns) {
        if (this.enemies.length >= maxConcurrent) break;
        const spawn = this.resolveBorderSpawn(fixed, { enemyClass: fixed.enemyClass });
        if (!spawn) continue;
        this.createEnemyAt(fixed.enemyClass, spawn.spawnPos.x, spawn.spawnPos.z, false, spawn.entryTarget);
      }
    }

    const initialCount = Math.min(
      sector.initialSpawnCount ?? 4,
      maxConcurrent,
      this.vanguardRemainingToSpawn
    );
    for (let i = 0; i < initialCount; i++) {
      if (this.enemies.length >= maxConcurrent) break;
      this.spawnVanguardEnemy();
    }

    }

    if (startPlaying) {
      this.status = GameStatus.PLAYING;
      this.syncAudioPauseState();
      sound.startEngineLoop();
      this.setStatusBanner(
        `${authoredMission.code}: ${authoredMission.title.toUpperCase()} — ${authoredMission.subtitle.toUpperCase()}`,
        3.2
      );
    } else {
      this.status = GameStatus.MENU;
      this.syncAudioPauseState();
    }

    this.emitHudUpdate();
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

  /** Spawner cells, cached until a cell changes type (see invalidateSpawnerCache). */
  getSpawnerCells() {
    if (this._spawnerCells) return this._spawnerCells;
    const list = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.grid[r][c].type === TileType.SPAWNER) {
          list.push(this.grid[r][c]);
        }
      }
    }
    this._spawnerCells = list;
    return list;
  }

  getSpawnPosition() {
    const safeMinDist = 14.0;
    const pickSafePosition = (positions) => {
      if (!positions.length) return null;
      const far = positions.filter(
        (p) => Math.hypot(p.x - this.playerX, p.z - this.playerZ) >= safeMinDist
      );
      if (far.length > 0) {
        const idx = (this.spawnerRoundRobinIdx || 0) % far.length;
        this.spawnerRoundRobinIdx = (this.spawnerRoundRobinIdx || 0) + 1;
        return far[idx];
      }
      let farthest = positions[0];
      let maxDist = -1;
      for (const p of positions) {
        const d = Math.hypot(p.x - this.playerX, p.z - this.playerZ);
        if (d > maxDist) {
          maxDist = d;
          farthest = p;
        }
      }
      this.spawnerRoundRobinIdx = (this.spawnerRoundRobinIdx || 0) + 1;
      return farthest;
    };

    const spawners = this.getSpawnerCells();
    if (spawners.length > 0) {
      const freePositions = spawners
        .map((cell) => this.gridToWorld(cell.row, cell.col))
        .filter((pos) => !this.enemies.some((e) => Math.hypot(e.x - pos.x, e.z - pos.z) < 1.8));
      return pickSafePosition(freePositions);
    }
    const fallbackEntries = [
      { row: 2, col: 5 },
      { row: 2, col: 13 },
      { row: 2, col: 22 },
      { row: 2, col: 30 },
    ];
    const freeFallbacks = fallbackEntries
      .map((entry) => this.gridToWorld(entry.row, entry.col))
      .filter((pos) => !this.enemies.some((e) => Math.hypot(e.x - pos.x, e.z - pos.z) < 1.8));
    return pickSafePosition(freeFallbacks) || this.gridToWorld(2, 17);
  }

  /**
   * Resolves a clear, unoccupied border spawn position and straight entry target
   * for an enemy heading toward `targetCell`.
   */
  resolveBorderSpawn(targetCell, {
    enemyClass = null,
    isBoss = false,
    canCrossWater = null,
    outsideMargin = null,
    minPlayerDist = 10,
    losAvoidDist = 0,
  } = {}) {
    const radius = isBoss ? 1.12 : 0.72;
    const margin = outsideMargin ?? (isBoss ? 3.6 : 2.8);
    const halfArena = (GRID_SIZE * TILE_SIZE) / 2;
    const waterAllowed = canCrossWater ?? Boolean(
      isBoss || (enemyClass && this.getEnemyLoadoutStats(enemyClass)?.canCrossWater)
    );
    const toSpawnCoords = (edge, entryX, entryZ) => {
      const inset = isBoss ? 1.35 : TILE_SIZE * 0.5;
      if (edge === 'west') {
        return {
          spawnPos: { x: -halfArena - margin, z: entryZ },
          entryTarget: { x: -halfArena + inset, z: entryZ },
        };
      }
      if (edge === 'east') {
        return {
          spawnPos: { x: halfArena + margin, z: entryZ },
          entryTarget: { x: halfArena - inset, z: entryZ },
        };
      }
      return {
        spawnPos: { x: entryX, z: -halfArena - margin },
        entryTarget: { x: entryX, z: -halfArena + inset },
      };
    };

    const ingress = findBorderIngressCell(this.grid, targetCell, waterAllowed, {
      radius,
      tileSize: TILE_SIZE,
      isOccupied: (wx, wz, info) => {
        const { spawnPos } = toSpawnCoords(info.edge, wx, wz);
        return this.enemies.some((e) => {
          const minSep = radius + (e.isBoss ? 1.12 : 0.72) + 0.65;
          return (
            Math.hypot(e.x - wx, e.z - wz) < minSep ||
            Math.hypot(e.x - spawnPos.x, e.z - spawnPos.z) < minSep
          );
        });
      },
      isCrowded: (wx, wz, info) => {
        const { spawnPos } = toSpawnCoords(info.edge, wx, wz);
        return this.enemies.some((e) => (
          Math.hypot(e.x - wx, e.z - wz) < 4.6 ||
          Math.hypot(e.x - spawnPos.x, e.z - spawnPos.z) < 4.6
        ));
      },
      isSafeFromPlayer: (wx, wz) => {
        if (this.playerX === undefined || this.playerZ === undefined) return true;
        const d = Math.hypot(this.playerX - wx, this.playerZ - wz);
        if (d < minPlayerDist) return false;
        if (losAvoidDist > 0 && d < losAvoidDist && this.hasLineOfSight?.(this.playerX, this.playerZ, wx, wz)) {
          return false;
        }
        return true;
      },
    });

    if (!ingress) return null;
    return {
      ingress,
      ...toSpawnCoords(ingress.edge, ingress.entryX, ingress.entryZ),
    };
  }

  spawnVanguardEnemy() {
    const sector = SECTORS[this.currentSectorIndex];
    const maxConcurrent =
      this.survivalState?.waveSpec?.maxConcurrentEnemies ??
      sector?.maxConcurrentEnemies ??
      8;
    if (
      this.vanguardRemainingToSpawn <= 0 ||
      this.enemies.length >= maxConcurrent
    ) {
      return false;
    }

    const targetPos = this.getSpawnPosition();
    if (!targetPos) return false;
    const cell = this.worldToGrid(targetPos.x, targetPos.z);
    const pool = sector.enemyPool || [];
    const hasQueue = this.enemySpawnQueue && this.enemySpawnQueue.length > 0;
    const enemyClass = hasQueue
      ? this.enemySpawnQueue[0]
      : pool[this.spawnPoolCursor % Math.max(1, pool.length)];
    const spawn = this.resolveBorderSpawn(cell, { enemyClass });
    if (!spawn) return false;

    if (hasQueue) {
      this.enemySpawnQueue.shift();
    }
    this.spawnPoolCursor++;

    this.createEnemyAt(enemyClass, spawn.spawnPos.x, spawn.spawnPos.z, false, spawn.entryTarget);
    this.vanguardRemainingToSpawn = this.enemySpawnQueue
      ? this.enemySpawnQueue.length
      : Math.max(0, this.vanguardRemainingToSpawn - 1);
    return true;
  }

  startSurvivalWave(waveNumber = 1, isEarlyCall = false) {
    if (!this.survivalState) return;
    const spec = buildSurvivalWaveSpec(waveNumber);
    this.survivalState.wave = spec.wave;
    this.survivalState.phase = 'combat';
    this.survivalState.intermissionTimer = 0;
    this.survivalState.waveSpec = spec;
    this.survivalState.nextWaveSpec = buildSurvivalWaveSpec(spec.wave + 1);

    this.enemySpawnQueue = [...spec.roster];
    this.vanguardRemainingToSpawn = this.enemySpawnQueue.length;
    this.bossSpawned = false;
    this.spawnTimer = 0.7;
    this.squadDirector = createSquadDirector({ maxAttackers: spec.maxAttackers });

    if (spec.wave >= 2) {
      this.spawnSurvivalWaveSupplies(
        SURVIVAL_CONFIG.SUPPLY_CRATES_PER_WAVE,
        SURVIVAL_CONFIG.BARRELS_PER_WAVE
      );
    }

    const openingBatch = Math.min(3, spec.maxConcurrentEnemies, this.vanguardRemainingToSpawn);
    for (let i = 0; i < openingBatch; i++) {
      this.spawnVanguardEnemy();
    }

    if (isEarlyCall) {
      this.setStatusBanner(
        `WAVE ${spec.wave}: ${spec.title} (+$${SURVIVAL_CONFIG.EARLY_CALL_BONUS} EARLY CALL BONUS)`,
        3.6
      );
    } else if (spec.isBossWave) {
      sound.playBossAlarm();
      this.setStatusBanner(
        `⚠ BOSS WAVE ${spec.wave}: ${spec.bossName} & ESCORT INBOUND!`,
        4.2
      );
    } else {
      this.setStatusBanner(
        `WAVE ${spec.wave}: ${spec.title} (${spec.totalHostiles} HOSTILES)`,
        3.4
      );
    }
    this.emitHudUpdate();
  }

  spawnSurvivalWaveSupplies(crateCount = 3, barrelCount = 2) {
    let cratesPlaced = 0;
    for (let attempt = 0; attempt < 60 && cratesPlaced < crateCount; attempt++) {
      const r = 6 + Math.floor(Math.random() * (GRID_SIZE - 12));
      const c = 3 + Math.floor(Math.random() * (GRID_SIZE - 6));
      const cell = this.grid[r]?.[c];
      if (!cell || cell.type !== TileType.EMPTY) continue;
      const { x, z } = this.gridToWorld(r, c);
      if (Math.hypot(this.playerX - x, this.playerZ - z) < 3.5) continue;
      if (this.enemies.some((e) => Math.hypot(e.x - x, e.z - z) < 3.0)) continue;
      const mesh = this.modelFactory.createBoxesBlock();
      mesh.position.set(x, 0, z);
      this.mapGroup.add(mesh);
      cell.type = TileType.BOXES;
      cell.hp = 2;
      cell.maxHp = 2;
      cell.mesh = mesh;
      cell.subMeshes = undefined;
      cratesPlaced++;
    }

    let barrelsPlaced = 0;
    for (let attempt = 0; attempt < 40 && barrelsPlaced < barrelCount; attempt++) {
      const r = 5 + Math.floor(Math.random() * (GRID_SIZE - 12));
      const c = 4 + Math.floor(Math.random() * (GRID_SIZE - 8));
      const cell = this.grid[r]?.[c];
      if (!cell || cell.type !== TileType.EMPTY) continue;
      const { x, z } = this.gridToWorld(r, c);
      if (Math.hypot(this.playerX - x, this.playerZ - z) < 4.5) continue;
      if (this.enemies.some((e) => Math.hypot(e.x - x, e.z - z) < 3.0)) continue;
      const barrel = this.modelFactory.createBarrelBlock();
      barrel.position.set(x, 0, z);
      this.mapGroup.add(barrel);
      cell.type = TileType.BARREL;
      cell.hp = 1;
      cell.maxHp = 1;
      cell.mesh = barrel;
      cell.subMeshes = undefined;
      cell._exploding = false;
      barrelsPlaced++;
    }
    this.tileBatcher?.sync();
  }

  onSurvivalWaveCleared() {
    if (!this.survivalState || this.survivalState.phase === 'intermission') return;
    const spec = this.survivalState.waveSpec;
    this.survivalState.wavesCleared = this.survivalState.wave;
    const reward = spec?.waveRewardCredits || 300;
    if (this.playerSave) {
      this.playerSave.credits = (this.playerSave.credits || 0) + reward;
    }
    this.creditsEarnedThisMission = (this.creditsEarnedThisMission || 0) + reward;
    this.survivalState.lastWaveReward = reward;

    if (spec?.isBossWave && this.baseAlive) {
      this.setBasePerimeterMaterial(TileType.CONCRETE);
    }

    this.survivalState.phase = 'intermission';
    this.survivalState.intermissionTimer = SURVIVAL_CONFIG.INTERMISSION_SEC;
    this.survivalState.intermissionDuration = SURVIVAL_CONFIG.INTERMISSION_SEC;
    sound.playPowerUp();
    this.setStatusBanner(
      `WAVE ${this.survivalState.wave} CLEARED! +$${reward} CREDITS · 15s REARM INTERMISSION ([N] CALL NEXT WAVE +$${SURVIVAL_CONFIG.EARLY_CALL_BONUS})`,
      4.5
    );
    this.emitHudUpdate();
  }

  callNextSurvivalWave() {
    if (
      !this.survivalState ||
      this.survivalState.phase !== 'intermission' ||
      this.status !== GameStatus.PLAYING
    ) {
      return false;
    }
    const bonus = SURVIVAL_CONFIG.EARLY_CALL_BONUS;
    if (this.playerSave) {
      this.playerSave.credits = (this.playerSave.credits || 0) + bonus;
    }
    this.creditsEarnedThisMission = (this.creditsEarnedThisMission || 0) + bonus;
    this.survivalState.earlyWaveCalls = (this.survivalState.earlyWaveCalls || 0) + 1;
    sound.playPowerUp();
    this.startSurvivalWave(this.survivalState.wave + 1, true);
    return true;
  }

  spawnSpecificEnemy(enemyClass) {
    if (this.status !== GameStatus.PLAYING) {
      this.startMission(this.currentSectorIndex);
    }
    const sector = SECTORS[this.currentSectorIndex];
    const maxConcurrent = sector?.maxConcurrentEnemies ?? 8;
    if (this.enemies.length >= maxConcurrent) {
      this.setStatusBanner(
        `MAX CONCURRENT HOSTILES (${maxConcurrent}) REACHED ON BATTLEFIELD`,
        2.2
      );
      return;
    }
    const { x, z } = this.getSpawnPosition();
    this.createEnemyAt(enemyClass, x + (Math.random() - 0.5) * 1.5, z, false);
    const meta =
      TANK_CONFIGS[enemyClass] ||
      SPECIAL_ENEMY_CATALOG.find((m) => m.id === enemyClass);
    if (meta) {
      this.setStatusBanner(
        `DEPLOYED: ${meta.name.toUpperCase()} (${meta.loadoutSummary})`,
        2.6
      );
    }
    this.emitHudUpdate();
  }

  spawnBossEntry(sector, bossClass, bossCell) {
    const bossPos = this.gridToWorld(bossCell.row, bossCell.col);
    const bRow = bossCell.row;
    const bCol = bossCell.col;
    const breachCells = [];

    if (Array.isArray(sector.bossBreachCells)) {
      breachCells.push(...sector.bossBreachCells);
    } else if (Array.isArray(sector.boss?.breachCells)) {
      breachCells.push(...sector.boss.breachCells);
    } else {
      const rMin = Math.max(1, bRow - 2);
      const rMax = Math.min(GRID_SIZE - 2, bRow <= 12 ? bRow + 6 : bRow + 2);
      const cMin = Math.max(1, bCol - 3);
      const cMax = Math.min(GRID_SIZE - 2, bCol + 3);

      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          breachCells.push({ row: r, col: c });
        }
      }
    }

    for (const b of breachCells) {
      const cell = this.grid[b.row]?.[b.col];
      if (!cell || cell.type === TileType.EMPTY) continue;
      if (
        cell.type === TileType.BOXES || cell.type === TileType.BRICK ||
        cell.type === TileType.CONCRETE ||
        cell.type === TileType.HEDGEHOG
      ) {
        this.destroyTileCell(cell);
      } else if (cell.type === TileType.BARREL) {
        this.explodeBarrel(cell, false);
      }
    }

    const fallbackBossPos = { x: bossPos.x + TILE_SIZE * 0.5, z: bossPos.z };
    const spawn = this.resolveBorderSpawn(bossCell, {
      enemyClass: bossClass,
      isBoss: true,
      canCrossWater: true,
      outsideMargin: 3.6,
    });
    const spawnBossPos = spawn
      ? spawn.spawnPos
      : { x: fallbackBossPos.x, z: -((GRID_SIZE * TILE_SIZE) / 2) - 3.6 };
    const entryTarget = spawn ? spawn.entryTarget : fallbackBossPos;

    this.createEnemyAt(
      bossClass,
      spawnBossPos.x,
      spawnBossPos.z,
      true,
      entryTarget
    );
  }

  spawnBossStage(stageIndex) {
    const sector = SECTORS[this.currentSectorIndex];
    const sequence = sector?.bossSequence;
    if (!Array.isArray(sequence) || !sequence[stageIndex]) return false;

    this.bossStageIndex = stageIndex;
    this.bossSequenceStarted = true;
    this.bossSpawned = stageIndex >= sequence.length - 1;

    const entries = sequence[stageIndex];
    const names = [];
    for (const entry of entries) {
      const bossClass = entry.enemyClass || sector.bossClass;
      const bossCell = entry.spawnCell || sector.bossSpawnCell || { row: 3, col: 17 };
      this.spawnBossEntry(sector, bossClass, bossCell);
      names.push((entry.name || SECTOR_BOSS_CONFIGS[bossClass]?.name || bossClass).toUpperCase());
    }

    sound.playBossAlarm();
    sound.playExplosion(1.6);
    this.screenShake = 1.35;
    for (let k = 1; k <= 3; k++) {
      setTimeout(() => {
        this.screenShake = Math.max(this.screenShake, 0.7);
        sound.playExplosion(1.15);
      }, 140 * k);
    }

    const stageTag = `BOSS WAVE ${stageIndex + 1}/${sequence.length}`;
    this.setStatusBanner(
      `${stageTag}: ${names.join(' & ')} DEPLOYED!`,
      4.8
    );
    this.emitHudUpdate();
    return true;
  }

  spawnSectorBoss(overrideBossClass = null, overrideBossName = null) {
    if (this.bossSequenceStarted || this.bossSpawned) return;

    const sector = SECTORS[this.currentSectorIndex];
    if (Array.isArray(sector?.bossSequence) && sector.bossSequence.length > 0 && !overrideBossClass && !this.survivalState) {
      this.spawnBossStage(0);
      return;
    }

    this.bossSequenceStarted = true;
    this.bossSpawned = true;

    const bossClass =
      overrideBossClass ||
      this.survivalState?.waveSpec?.bossClass ||
      sector.bossClass;
    const bossName =
      overrideBossName ||
      this.survivalState?.waveSpec?.bossName ||
      SECTOR_BOSS_CONFIGS[bossClass]?.name ||
      sector.bossName;
    const bossCell = sector.bossSpawnCell || { row: 3, col: 17 };
    this.spawnBossEntry(sector, bossClass, bossCell);

    sound.playBossAlarm();
    sound.playExplosion(1.6);
    this.screenShake = 1.35;

    for (let k = 1; k <= 3; k++) {
      setTimeout(() => {
        this.screenShake = Math.max(this.screenShake, 0.7);
        sound.playExplosion(1.15);
      }, 140 * k);
    }

    const bossTitle = (bossName || 'SECTOR COMMANDER').toUpperCase();
    this.setStatusBanner(
      `CRITICAL PERIMETER BREACH! ${bossTitle} DEMOLISHED THE BASTION!`,
      4.8
    );
    this.emitHudUpdate();
  }

  getEnemyLoadoutStats(enemyClass) {
    if (
      enemyClass === EnemyClass.BOSS_MAMMOTH ||
      enemyClass === EnemyClass.BOSS_HYDRA ||
      enemyClass === EnemyClass.BOSS_INFERNO ||
      enemyClass === EnemyClass.BOSS_TITAN
    ) {
      const bossCfg = SECTOR_BOSS_CONFIGS[enemyClass];
      return computeTankStats(bossCfg.loadout, bossCfg.base);
    }
    const cfg = TANK_CONFIGS[enemyClass];
    if (cfg && cfg.loadout) {
      return computeTankStats(cfg.loadout, cfg.base);
    }
    const fallback = TANK_CONFIGS[TANK_TYPES.STANDARD];
    return computeTankStats(fallback.loadout, fallback.base);
  }

  createEnemyAt(enemyClass, x, z, isBoss, entryTarget = null) {
    const rig = this.modelFactory.createEnemyTank(enemyClass);
    rig.root.position.set(x, 0, z);
    if (rig.hpBarBg) rig.hpBarBg.visible = this.aiDebugMode;
    if (rig.hpBarFill) rig.hpBarFill.visible = this.aiDebugMode;
    this.entityGroup.add(rig.root);

    const cfg =
      TANK_CONFIGS[enemyClass] ||
      SECTOR_BOSS_CONFIGS[enemyClass] ||
      (isBoss
        ? SECTOR_BOSS_CONFIGS[EnemyClass.BOSS_MAMMOTH]
        : TANK_CONFIGS[TANK_TYPES.STANDARD]);
    const stats = this.getEnemyLoadoutStats(enemyClass);
    const { sightRadius, radioAlertRadius } = stats;
    const firstShotDelay =
      enemyClass === EnemyClass.HOWITZER
        ? ARTILLERY.FIRST_SHOT_MIN +
          Math.random() * (ARTILLERY.FIRST_SHOT_MAX - ARTILLERY.FIRST_SHOT_MIN)
        : 0.2 + Math.random() * 0.25;

    const isHeavyUnit =
      isBoss ||
      enemyClass === EnemyClass.ARMOR ||
      enemyClass === EnemyClass.FLAMETHROWER;

    const hullDef = isHeavyUnit ? HULL_CATALOG.bastion_m2 : HULL_CATALOG.bars_m1;
    const turretDef = isHeavyUnit ? TURRET_CATALOG.t_02 : TURRET_CATALOG.t_01;

    const enemyId = this.nextEnemyId;
    const behaviorRng = new SeededRng(
      20261105 + this.currentSectorIndex * 7919 + enemyId * 104729
    );
    const rngNext = () => behaviorRng.next();
    const actions = resolveBehaviorActions(cfg?.behavior);

    const patrolWaypoints = [
      { x, z },
      { x: THREE.MathUtils.clamp(x + (Math.random() > 0.5 ? 10 : -10), -28, 28), z },
      { x, z: THREE.MathUtils.clamp(z + 10, -28, 26) },
    ];

    const initialHullAngle = entryTarget
      ? Math.atan2(entryTarget.x - x, entryTarget.z - z)
      : Math.PI;

    const turrets = rig.turrets?.length
      ? rig.turrets.map((slot, idx) => ({
          index: idx,
          slot,
          angle: initialHullAngle + (slot.defaultYawOffset || 0),
          gunner: createGunnerState(rngNext),
          fireCooldown: firstShotDelay + idx * 0.55,
          recoil: 0,
          flashTimer: 0,
          gunElevation: 0,
          randomShotTarget: null,
          randomShotTimer: 4.0 + idx * 2.5 + Math.random() * 5.0,
        }))
      : null;

    this.enemies.push({
      id: this.nextEnemyId++,
      actions,
      movePlan: null,
      lastSpecial: null,
      artilleryCfg: {
        aimSec: cfg?.artillery?.aimSec ?? ARTILLERY.AIM_TIME,
        flightSec: cfg?.artillery?.flightSec ?? ARTILLERY.FLIGHT_TIME,
      },
      missileCfg: { homing: cfg?.missile?.homing ?? true },
      indirectAim: null,
      gunner: turrets ? turrets[0].gunner : createGunnerState(rngNext),
      turrets,
      brain: cfg?.behavior
        ? createBrain(cfg.behavior.role, rngNext, this.bossBrainOverrides(enemyClass))
        : null,
      brainHolding: false,
      behaviorRng: rngNext,
      name: isBoss
        ? this.survivalState?.waveSpec?.bossName ||
          SECTOR_BOSS_CONFIGS[enemyClass]?.name ||
          SECTORS[this.currentSectorIndex].bossName
        : cfg?.name || `${enemyClass} Unit`,
      enemyClass,
      isBoss,
      hitRadius:
        TANK_HIT_RADIUS[enemyClass] ?? (isBoss ? TANK_HIT_RADIUS.DEFAULT_BOSS : TANK_HIT_RADIUS.DEFAULT),
      gunElevation: 0,
      missileSide: 0,
      stats,
      sightRadius,
      radioAlertRadius,
      hasDetectedPlayer: false,
      alertTarget: null,
      alertTimer: 0,
      radioCooldown: 0,
      entryTarget: entryTarget ? { ...entryTarget } : null,
      x,
      z,
      vx: 0,
      vz: 0,
      hullAngle: initialHullAngle,
      turretAngle: initialHullAngle,
      hullYaw: initialHullAngle,
      turretYaw: initialHullAngle,
      hp: stats.maxHP,
      maxHp: stats.maxHP,
      hullHP: stats.maxHP * 10,
      maxHullHP: stats.maxHP * 10,
      hull: { ...hullDef },
      turret: { ...turretDef },
      armorPanels: isBoss
        ? {
            SOCKET_ARMOR_FRONT: {
              ...ARMOR_PANEL_CATALOG.sb_40,
              integrity: 80,
              destroyed: false,
            },
          }
        : {},
      ai: createEnemyAIState({
        homeX: x,
        homeZ: z,
        patrolWaypoints,
        pursuitLimit: 36,
        hardLimit: 54,
        preferredRange: 22,
      }),
      fireCooldown: firstShotDelay,
      specialCooldown: 2.5 + Math.random(),
      randomShotTimer: 4.0 + Math.random() * 8.0,
      aiTimer: 0.4,
      targetDirX: 0,
      targetDirZ: 1,
      recoil: 0,
      flashTimer: 0,
      stealthRevealTimer: 0,
      minesRemaining: 0,
      hydraMissileCooldown: 3.0,
      mammothMissileCooldown: 4.5,
      infernoMissileCooldown: 3.5,
      infernoDashCooldown: 5.5,
      infernoDashWindup: 0,
      infernoDashTimer: 0,
      infernoDashDirX: 0,
      infernoDashDirZ: 0,
      infernoDashBeam: null,
      infernoDashHitPlayer: false,
      hydraFlameCooldown: 0,
      mammothEnraged: false,
      hydraEnraged: false,
      infernoEnraged: false,
      titanEscortCalled: false,
      titanOverload: false,
      phaseShieldTimer: 0,
      phaseShieldMesh: null,
      apsCharges: isBoss ? BOSS_APS.MAX_CHARGES : 0,
      apsMaxCharges: isBoss ? BOSS_APS.MAX_CHARGES : 0,
      apsRearmTimer: 0,
      apsRechargeTimer: BOSS_APS.RECHARGE_SEC,
      rig,
    });
    const created = this.enemies[this.enemies.length - 1];
    this.syncEnemyTurretVisuals(created, 0);
    equipAbilities(created, cfg?.abilities, this);
  }

  /** Persists RM-1 Field Repair Kit charges to playerSave outside Survival sessions. */
  persistRepairKitCharges() {
    if (!this.playerSave) return;
    this.playerSave.repairKitCharges = this.repairKitState?.charges ?? 0;
    this.saveRepo?.savePlayerSave?.(this.playerSave);
  }

  /** Activates installed player tactical module in slot 1, 2, or 3 (Section 7.2 & 11.4):. */
  activateModuleSlot(slotNumber) {
    if (this.status !== GameStatus.PLAYING) return;

    if (slotNumber === 1) {
      const res = activateRepairKit(this.repairKitState, this.subsystems,
        this.playerHp < this.playerMaxHp || Object.values(this.componentDamage).some(Boolean));
      if (res.started) {
        const hp = this.playerHp;
        this.restoreAllComponents();
        this.playerHp = hp;
        this.persistRepairKitCharges();
        sound.playEngineerWeld();
        this.setStatusBanner(
          'RM-1: COMPONENTS RESTORED / REGENERATING 25 HP OVER 10s',
          2.2
        );
      } else {
        this.setStatusBanner(`[1] RM-1 REPAIR KIT: ${res.reason.toUpperCase()}`, 2.0);
      }
      this.emitHudUpdate();
      return;
    }

    if (slotNumber === 2) {
      if (this.smokeCharges <= 0 || this.smokeCooldown > 0) {
        this.setStatusBanner(
          this.smokeCharges <= 0
            ? '[2] TUCHA-S SMOKE: NO CHARGES REMAINING'
            : `[2] TUCHA-S SMOKE ON COOLDOWN (${this.smokeCooldown.toFixed(1)}s)`,
          2.0
        );
        return;
      }
      this.smokeCharges--;
      this.smokeCooldown = 25;
      this.deploySmokeCloud(this.playerX, this.playerZ, 9.5, 8.0);
      sound.playFlamethrower();
      this.setStatusBanner(
        '[2] TUCHA-S AEROSOL SMOKE SCREEN DEPLOYED (OPTICAL LOS BLOCKED FOR 8s)',
        2.6
      );
      this.emitHudUpdate();
      return;
    }
  }

  deploySmokeCloud(x, z, radius = 9.5, duration = 8.0) {
    let group = null;
    let puffMat = null;
    if (this.fxGroup && typeof this.fxGroup.add === 'function') {
      group = new THREE.Group();
      group.position.set(x, 0.2, z);
      const puffGeo = new THREE.SphereGeometry(radius * 0.44, 12, 10);
      puffMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.95,
        metalness: 0.05,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      });
      const centerPuff = new THREE.Mesh(puffGeo, puffMat);
      centerPuff.position.set(0, 1.35, 0);
      centerPuff.scale.set(1.15, 0.85, 1.15);
      group.add(centerPuff);
      for (let i = 0; i < 6; i++) {
        const puff = new THREE.Mesh(puffGeo, puffMat);
        const ang = (i / 6) * Math.PI * 2;
        puff.position.set(Math.cos(ang) * (radius * 0.34), 0.95 + (i % 2) * 0.35, Math.sin(ang) * (radius * 0.34));
        puff.scale.set(1.0, 0.8 + (i % 2) * 0.15, 1.0);
        group.add(puff);
      }
      markOwned(group);
      this.fxGroup.add(group);
    }
    this.smokeClouds.push({
      x,
      z,
      radius,
      remaining: duration,
      maxDuration: duration,
      mesh: group,
      material: puffMat,
    });
    this.breakEnemyLockInSmoke();
  }

  /** Checks whether world point `(x, z)` lies inside an active smoke screen. */
  isPointInSmoke(x, z) {
    if (!Array.isArray(this.smokeClouds) || this.smokeClouds.length === 0) return false;
    for (const cloud of this.smokeClouds) {
      if (!cloud || cloud.remaining <= 0) continue;
      const radius = cloud.radius || 4.75;
      if (Math.hypot(x - cloud.x, z - cloud.z) <= radius) {
        return true;
      }
    }
    return false;
  }

  /** Checks whether segment `(x0, z0) -> (x1, z1)` intersects any active smoke screen. */
  isSegmentInSmoke(x0, z0, x1, z1) {
    if (!Array.isArray(this.smokeClouds) || this.smokeClouds.length === 0) return false;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const distSq = dx * dx + dz * dz;
    for (const cloud of this.smokeClouds) {
      if (!cloud || cloud.remaining <= 0) continue;
      const radius = cloud.radius || 4.75;
      let t = 0;
      if (distSq > 1e-6) {
        t = Math.max(0, Math.min(1, ((cloud.x - x0) * dx + (cloud.z - z0) * dz) / distSq));
      }
      const projX = x0 + t * dx;
      const projZ = z0 + t * dz;
      if (Math.hypot(cloud.x - projX, cloud.z - projZ) <= radius) {
        return true;
      }
    }
    return false;
  }

  /** Clears active enemy target locks, alerts, aims, and pursuit blocked by smoke. */
  breakEnemyLockInSmoke() {
    this.inSmoke = this.isPointInSmoke(this.playerX, this.playerZ);
    if (this.inSmoke) {
      this.playerSpottedByEnemies = false;
    }
    if (!Array.isArray(this.enemies)) return;
    for (const e of this.enemies) {
      const blocked =
        this.inSmoke ||
        !this.hasLineOfSight(e.x, e.z, this.playerX, this.playerZ) ||
        (e.alertTarget && this.isPointInSmoke(e.alertTarget.x, e.alertTarget.z));
      if (!blocked) continue;

      e.hasDetectedPlayer = false;
      e.alertTarget = null;
      e.alertTimer = 0;
      e.indirectAim = null;
      e.bossBarrage = null;
      e.movePlan = null;
      e.breachTarget = null;
      e.aiTimer = 0;
      e.brainCharging = false;
      if (e.infernoDashWindup > 0) {
        e.infernoDashWindup = 0;
        this.clearInfernoDashBeam?.(e);
      }
      if (e.ai) {
        e.ai.state = 'patrol';
        e.ai.lastKnownTargetPos = null;
      }
      if (e.brain) resetBrain(e.brain);
      if (e.gunner) {
        e.gunner.contactTime = 0;
        e.gunner.lostTime = 999;
        e.gunner.shot = null;
      }
      if (Array.isArray(e.turrets)) {
        for (const t of e.turrets) {
          if (t.gunner) {
            t.gunner.contactTime = 0;
            t.gunner.lostTime = 999;
            t.gunner.shot = null;
          }
        }
      }
    }
  }

  mountHangarPart(instanceId, socketId = null) {
    const res = mountPartInHangar(this.playerSave, instanceId, socketId);
    if (res.success) {
      this.saveRepo.savePlayerSave(this.playerSave);
      this.assembledTank = resolveAssembledTank(this.playerSave);
      this.upgrades = {
        ...this.upgrades,
        cannon: this.assembledTank.gun?.visualTier || this.upgrades.cannon,
        chassis: this.assembledTank.hull?.visualTiers?.chassis || this.upgrades.chassis,
        frame: this.assembledTank.hull?.visualTiers?.frame || this.upgrades.frame,
        engine: this.assembledTank.hull?.visualTiers?.engine || this.upgrades.engine,
        armor: this.assembledTank.hull?.visualTiers?.armor || this.upgrades.armor,
      };
      this.recomputePlayerStats(true);
      sound.playPowerUp();
    }
    this.emitHudUpdate();
    return res;
  }

  setHangarOpen(open) {
    if (open) {
      if (this.status === GameStatus.PLAYING || this.status === GameStatus.BOSS_INTRO) {
        if (!this.inBaseRepairZone) {
          this.setStatusBanner(
            'HANGAR UNAVAILABLE: RETURN TO ALLIED BASE REPAIR ZONE TO UPGRADE',
            2.5
          );
          return false;
        }
        this.isHangarPaused = true;
      }
      this.isHangarOpen = true;
      this.isHangarPaused = this.status !== GameStatus.MENU;
      this.keys = {};
      this.isMouseDown = false;
      this.hangarStage ||= new HangarStage(this.modelFactory, this.scene.environment, this.isSoftwareGl);
      this.syncAudioPauseState();
      this.emitHudUpdate();
      return true;
    } else {
      this.isHangarOpen = false;
      this.isHangarPaused = false;
      this.setInspectMode(false);
      this.syncAudioPauseState();
      this.emitHudUpdate();
      return true;
    }
  }

  persistComponentDamage() {
    if (!this.playerSave) return;
    this.playerSave.componentDamage = { ...this.componentDamage };
    this.playerSave.componentDamageCooldown = this.componentDamageCooldown;
    this.saveRepo.savePlayerSave(this.playerSave);
  }

  tryDamageComponent(damage, hit) {
    const track = rollComponentDamage(this.upgrades, this.componentDamage,
      this.componentDamageCooldown, { ...hit, damage });
    if (!track) return;
    const couldCrossWater = this.playerStats?.canCrossWater;
    this.componentDamage[track] = true;
    this.componentDamageCooldown = COMPONENT_DAMAGE_COOLDOWN;
    const hp = this.playerHp;
    this.recomputePlayerStats(true);
    this.playerHp = Math.min(hp, this.playerHp);
    if (couldCrossWater && !this.playerStats.canCrossWater) {
      const { row, col } = this.worldToGrid(this.playerX, this.playerZ);
      this.componentWaterEgress = this.grid[row]?.[col]?.type === TileType.WATER;
    }
    this.persistComponentDamage();
    this.setStatusBanner(`${track.toUpperCase()} DAMAGED: TIER ${this.upgrades[track]} -> ${this.effectiveUpgrades[track]}. HANGAR REPAIR $${componentRepairCost(this.upgrades[track])}`, 4);
    this.emitHudUpdate();
  }

  repairComponentInHangar(track) {
    if (!this.isHangarOpen) return { success: false, reason: 'Open the hangar to repair components.' };
    if (!Object.hasOwn(this.componentDamage, track) || !this.componentDamage[track]) {
      return { success: false, reason: 'This component does not need repair.' };
    }
    const repairCost = componentRepairCost(this.upgrades[track]);
    if ((this.playerSave.credits || 0) < repairCost) {
      return { success: false, reason: `Insufficient credits. Repair costs $${repairCost}.` };
    }
    this.playerSave.credits -= repairCost;
    this.componentDamage[track] = false;
    this.recomputePlayerStats(true);
    this.persistComponentDamage();
    this.emitHudUpdate();
    return { success: true, reason: `${track.toUpperCase()} restored to Tier ${this.upgrades[track]}. Paid $${repairCost}.` };
  }

  restoreAllComponents() {
    this.componentDamage = Object.fromEntries(COMPONENT_TRACKS.map((t) => [t, false]));
    this.componentDamageCooldown = 0;
    this.componentWaterEgress = false;
    this.persistComponentDamage();
    this.recomputePlayerStats(true);
    this.emitHudUpdate();
  }

  upgradeTrackInHangar(track) {
    if (!this.isHangarOpen || !Object.hasOwn(UPGRADE_MAX_LEVEL, track)) {
      return { success: false, reason: 'Select a system in the hangar first.' };
    }
    const curLvl = this.upgrades[track] || 1;
    const maxLvl = UPGRADE_MAX_LEVEL[track] || 5;
    if (curLvl >= maxLvl) {
      return { success: false, reason: 'Already at maximum tier (Tier 5).' };
    }
    const nextTier = curLvl + 1;
    const cost = TRACK_UPGRADE_COSTS[nextTier] || 500;
    const credits = this.playerSave?.credits || 0;
    if (credits < cost) {
      return {
        success: false,
        reason: `Insufficient Credits (Need $${cost}).`,
      };
    }

    this.playerSave.credits -= cost;
    this.upgrades[track] = nextTier;
    this.syncCampaignCredits();
    this.saveRepo?.savePlayerSave?.(this.playerSave);
    this.saveProgress();
    this.recomputePlayerStats(true);
    sound.playPowerUp();
    this.setStatusBanner(
      `${track.toUpperCase()} UPGRADED TO TIER ${nextTier}! (-$${cost})`,
      2.5
    );
    this.emitHudUpdate();
    return { success: true, reason: `Upgraded to Tier ${nextTier}` };
  }

  buyCannonAmmoInHangar() {
    if (!this.isHangarOpen) return { success: false, reason: 'Open the hangar to purchase ammunition.' };
    const maxAmmo = this.getPlayerMaxCannonAmmo();
    if (this.cannonAmmo >= maxAmmo) {
      return { success: false, reason: `Ammunition magazine is full (${maxAmmo} shells).` };
    }
    const cost = CANNON_AMMO.CREDIT_PRICE_PER_PACK;
    if ((this.playerSave.credits || 0) < cost) {
      return { success: false, reason: `Insufficient Credits (Need ${cost}).` };
    }
    this.playerSave.credits -= cost;
    this.cannonAmmo = Math.min(maxAmmo, this.cannonAmmo + CANNON_AMMO.SHELLS_PER_PACK);
    this.syncCampaignCredits();
    this.playerSave.cannonAmmo = this.cannonAmmo;
    this.saveRepo.savePlayerSave(this.playerSave);
    sound.playPowerUp();
    this.setStatusBanner(`+${CANNON_AMMO.SHELLS_PER_PACK} SHELLS PURCHASED! (${this.cannonAmmo}/${maxAmmo}) (-${cost})`, 2.5);
    this.emitHudUpdate();
    return { success: true, reason: `+${CANNON_AMMO.SHELLS_PER_PACK} shells purchased (${this.cannonAmmo}/${maxAmmo}).` };
  }

  buyMissileInHangar() {
    if (!this.isHangarOpen) return { success: false, reason: 'Open the hangar to purchase missiles.' };
    const maxMissiles = this.getPlayerMaxMissileAmmo();
    if (this.missileAmmo >= maxMissiles) {
      return { success: false, reason: `Missile magazine is full (${maxMissiles}).` };
    }
    const cost = MISSILE.CREDIT_PRICE;
    if ((this.playerSave.credits || 0) < cost) {
      return { success: false, reason: `Insufficient Credits (Need $${cost}).` };
    }
    this.playerSave.credits -= cost;
    this.missileAmmo++;
    this.syncCampaignCredits();
    this.playerSave.missileAmmo = this.missileAmmo;
    this.saveRepo.savePlayerSave(this.playerSave);
    this.recomputePlayerStats(true);
    sound.playPowerUp();
    this.setStatusBanner(`+1 MISSILE PURCHASED! (${this.missileAmmo}/${maxMissiles}) (-$${cost})`, 2.5);
    this.emitHudUpdate();
    return { success: true, reason: `+1 missile purchased (${this.missileAmmo}/${maxMissiles}).` };
  }

  buyApsChargeInHangar() {
    if (!this.isHangarOpen) {
      return { success: false, reason: 'Open the hangar to purchase APS charges.' };
    }
    const maxAps = this.getPlayerMaxApsAmmo();
    const currentTotal = this.apsAmmo.reduce((a, b) => a + b, 0);
    if (currentTotal >= maxAps) {
      return { success: false, reason: `APS magazine is already at maximum capacity (${maxAps} charges).` };
    }
    const cost = APS.CHARGE_CREDIT_PRICE || 1000;
    const credits = this.playerSave?.credits || 0;
    if (credits < cost) {
      return {
        success: false,
        reason: `Insufficient Credits (Need $${cost}).`,
      };
    }

    this.playerSave.credits -= cost;
    this.addApsRounds(1);
    this.syncCampaignCredits();
    this.playerSave.apsAmmo = [...this.apsAmmo];
    this.playerSave.repairKitCharges = this.repairKitState?.charges ?? 0;
    this.saveRepo.savePlayerSave(this.playerSave);
    sound.playPowerUp();
    const newTotal = this.apsAmmo.reduce((a, b) => a + b, 0);
    this.setStatusBanner(
      `+1 APS CHARGE PURCHASED! (${newTotal}/${maxAps}) (-$${cost})`,
      2.5
    );
    this.emitHudUpdate();
    return { success: true, total: newTotal, reason: `+1 APS charge purchased (${newTotal}/${maxAps}).` };
  }

  toggleFavoritePart(instanceId) {
    const part = (this.playerSave.parts || []).find((p) => p.instanceId === instanceId);
    if (part) {
      part.isFavorite = !part.isFavorite;
      this.saveRepo.savePlayerSave(this.playerSave);
      this.emitHudUpdate();
    }
  }

  abortMissionToHangar() {
    if (this.survivalState) {
      const campaignSave = this.campaignSaveRepo?.loadPlayerSave();
      if (campaignSave && !this.survivalState.recordSummary) {
        this.survivalState.recordSummary = recordSurvivalRun(
          campaignSave,
          this.survivalState,
          this.kills
        );
        this.campaignSaveRepo.savePlayerSave(campaignSave);
      }
      this.survivalState = null;
      this.setProfileMode('campaign');
      this.status = GameStatus.MENU;
      sound.stopEngineLoop();
      this.syncAudioPauseState();
      this.emitHudUpdate();
      return;
    }
    if (this.activeMissionRun && !this.activeMissionRun.rewardsCommitted) {
      const summary = settleMission({
        playerSave: this.playerSave,
        missionRun: this.activeMissionRun,
        outcome: 'defeat',
      });
      this.lastSettlementSummary = summary;
      this.playerSave.apsAmmo = [...this.apsAmmo];
      this.playerSave.repairKitCharges = this.repairKitState?.charges ?? 0;
      this.saveRepo.savePlayerSave(this.playerSave);
      this.saveRepo.recordMissionRun(this.activeMissionRun);
      this.syncCampaignCredits();
      this.saveProgress();
    }
    if (this.profileMode !== 'campaign') {
      this.setProfileMode('campaign');
    }
    this.status = GameStatus.MENU;
    sound.stopEngineLoop();
    this.syncAudioPauseState();
    this.emitHudUpdate();
  }

  addManualRoutePoint(worldX, worldZ) {
    this.manualRoutePoints.push({ x: worldX, z: worldZ });
    if (this.manualRoutePoints.length > 6) {
      this.manualRoutePoints.shift();
    }
    this.emitHudUpdate();
  }

  clearManualRoute() {
    this.manualRoutePoints = [];
    this.emitHudUpdate();
  }

  bindEvents() {
    this.handleKeyDown = (e) => {
      if (this.isHangarOpen || this.isAdPaused) return;
      this.keys[e.code] = true;
      if (e.code === 'F3') {
        e.preventDefault();
        this.aiDebugMode = !this.aiDebugMode;
        for (const unit of this.enemies) {
          if (unit.rig?.hpBarBg) unit.rig.hpBarBg.visible = this.aiDebugMode;
          if (unit.rig?.hpBarFill) unit.rig.hpBarFill.visible = this.aiDebugMode;
        }
        this.setStatusBanner(
          `DEVELOPER AI TELEMETRY OVERLAY: ${this.aiDebugMode ? 'ENABLED' : 'HIDDEN'}`,
          2.0
        );
        return;
      }
      if (this.status !== GameStatus.PLAYING) return;
      if (e.code === 'Digit1') {
        this.activateModuleSlot(1);
      } else if (e.code === 'Digit2') {
        this.activateModuleSlot(2);
      } else if (e.code === 'KeyE') {
        e.preventDefault();
        if (this.contractState) {
          this.interactContractObjective();
        } else {
          this.firePlayerHomingMissile();
        }
      } else if (e.code === 'KeyN') {
        if (this.survivalState) {
          e.preventDefault();
          this.callNextSurvivalWave();
        }
      } else if (e.code === 'Space') {
        e.preventDefault();
        this.firePlayerHomingMissile();
      }
    };

    this.handleKeyUp = (e) => {
      this.keys[e.code] = false;
    };

    this.handlePointerMove = (e) => {
      if (this.isHangarOpen) return;
      if (this.codexOpen && this.codexDragging) {
        const dx = e.clientX - this.codexDragPrevX;
        this.codexDragPrevX = e.clientX;
        this.codexTurntableAngle += dx * 0.012;
        return;
      }

      if (this.cameraRotating) {
        const dx = e.clientX - this.cameraDragPrevX;
        this.cameraDragPrevX = e.clientX;
        this.cameraAzimuth = normalizeAngleSigned(this.cameraAzimuth - dx * 0.0085);
        return;
      }

      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouseNdc, this.camera);
      if (this.raycaster.ray.intersectPlane(_plane, _intersectPoint)) {
        const limit = (GRID_SIZE * TILE_SIZE) / 2 - 1.2;
        this.aimWorld.x = THREE.MathUtils.clamp(_intersectPoint.x, -limit, limit);
        this.aimWorld.z = THREE.MathUtils.clamp(_intersectPoint.z, -limit, limit);
      }
    };

    this.handlePointerDown = (e) => {
      if (this.isHangarOpen) return;
      if (this.codexOpen) {
        if (e.button === 0) {
          this.codexDragging = true;
          this.codexDragPrevX = e.clientX;
        }
        return;
      }

      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault();
        this.cameraRotating = true;
        this.cameraDragPrevX = e.clientX;
        return;
      }

      this.handlePointerMove(e);
      if (this.status !== GameStatus.PLAYING || this.isAdPaused) return;

      if (e.button === 2) {
        let clickedEnemy = null;
        let bestDist = 2.6;
        for (const unit of this.enemies) {
          const d = Math.hypot(unit.x - this.aimWorld.x, unit.z - this.aimWorld.z);
          if (d <= bestDist) {
            bestDist = d;
            clickedEnemy = unit;
          }
        }
        if (clickedEnemy) {
          this.priorityTargetId = clickedEnemy.id;
          const cond = getObservedEnemyCondition(clickedEnemy);
          this.setStatusBanner(
            `PRIORITY TARGET DESIGNATED: ${clickedEnemy.name.toUpperCase()} [OBSERVED: ${cond}]`,
            2.4
          );
          this.emitHudUpdate();
        } else if (this.priorityTargetId !== null) {
          this.priorityTargetId = null;
          this.setStatusBanner('PRIORITY TARGET DESIGNATION CLEARED', 1.8);
          this.emitHudUpdate();
        } else {
          this.firePlayerHomingMissile();
        }
      } else if (e.button === 0) {
        this.isMouseDown = true;
        this.tryPlayerFire();
      }
    };

    this.handlePointerUp = (e) => {
      if (e.button === 0) {
        this.isMouseDown = false;
        this.codexDragging = false;
        this.cameraRotating = false;
      } else if (e.button === 1) {
        this.cameraRotating = false;
      }
    };

    this.handleWheel = (e) => {
      if (this.isHangarOpen) return;
      if (this.codexOpen) return;
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * 2.2;
      this.frustumSize = THREE.MathUtils.clamp(this.frustumSize + delta, 14, 46);
      this.handleResize();
    };

    this.handleResize = () => {
      if (this.isDisposed) return;
      const width = this.container.clientWidth || window.innerWidth;
      const height = this.container.clientHeight || window.innerHeight;
      const aspect = width / height;

      this.camera.left = (-this.frustumSize * aspect) / 2;
      this.camera.right = (this.frustumSize * aspect) / 2;
      this.camera.top = this.frustumSize / 2;
      this.camera.bottom = -this.frustumSize / 2;
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(width, height);
    };

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('resize', this.handleResize);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    window.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
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
      Boolean(this.isAdPaused) ||
      Boolean(this.codexOpen);
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
    const delta = Math.max(0, Math.floor(Number(amount) || 0));
    if (!delta || !this.playerSave) return 0;
    this.playerSave.credits = (this.playerSave.credits || 0) + delta;
    this.saveRepo?.savePlayerSave?.(this.playerSave);
    this.emitHudUpdate();
    return delta;
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

  firePlayerHomingMissile() {
    if (this.status !== GameStatus.PLAYING) return;
    if (this.jammedTimer > 0) {
      sound.playJammerPulse();
      this.setStatusBanner(
        'ECM JAMMING ACTIVE! HOMING ATGM TELEMETRY LOCKED!',
        2.0
      );
      return;
    }
    if (this.missileAmmo <= 0 || this.missileCooldown > 0) return;

    this.missileAmmo--;
    this.playerSave.missileAmmo = this.missileAmmo;
    this.saveRepo.savePlayerSave(this.playerSave);
    this.missileCooldown = MISSILE.COOLDOWN;
    this.recomputePlayerStats(true);
    sound.playMissileLaunch();

    const dirX = Math.sin(this.playerTurretAngle);
    const dirZ = Math.cos(this.playerTurretAngle);
    const startX = this.playerX + dirX * 1.25;
    const startZ = this.playerZ + dirZ * 1.25;
    const soundHandle = sound.startMissileLoop({ x: startX, z: startZ });

    const mesh = createMissileVisual('player', 1.15);
    mesh.position.set(startX, 1.35, startZ);
    mesh.rotation.y = this.playerTurretAngle;
    this.fxGroup.add(mesh);
    this.fx.missileLaunch(startX - dirX * 0.45, 1.35, startZ - dirZ * 0.45, dirX, dirZ, { scale: 1 });

    const worldSpeed = MISSILE.SPEED * TILE_SIZE;
    this.projectiles.push({
      x: startX,
      z: startZ,
      vx: dirX * worldSpeed,
      vz: dirZ * worldSpeed,
      fromPlayer: true,
      damage: MISSILE.DAMAGE,
      penetration: MISSILE.PENETRATION,
      bulletPower: BULLET_POWER.HEAVY,
      speed: worldSpeed,
      radius: MISSILE.HIT_RADIUS * TILE_SIZE * 0.5,
      life: MISSILE.MAX_LIFETIME,
      isHeavy: true,
      isMissile: true,
      soundHandle,
      mesh,
    });

    this.emitHudUpdate();
  }

  cycleCameraPreset(preset) {
    this.cameraAzimuth = Math.PI * 0.25;
    if (preset) {
      this.cameraPreset = preset;
    } else {
      const order = ['ISOMETRIC', 'TACTICAL_HIGH', 'CLOSE_COMBAT'];
      const nextIdx = (order.indexOf(this.cameraPreset) + 1) % order.length;
      this.cameraPreset = order[nextIdx];
    }

    if (this.cameraPreset === 'ISOMETRIC') this.frustumSize = 28;
    else if (this.cameraPreset === 'TACTICAL_HIGH') this.frustumSize = 44;
    else if (this.cameraPreset === 'CLOSE_COMBAT') this.frustumSize = 20;

    this.handleResize();
    return this.cameraPreset;
  }

  spawnPowerUpOnField(type) {
    if (this.powerUps.length >= POWERUP_MAX_ON_MAP) return;
    const chosenType =
      type ||
      POWERUP_DROP_TYPES[Math.floor(Math.random() * POWERUP_DROP_TYPES.length)];

    for (let attempt = 0; attempt < 25; attempt++) {
      const r = 2 + Math.floor(Math.random() * (GRID_SIZE - 4));
      const c = 2 + Math.floor(Math.random() * (GRID_SIZE - 4));
      const cell = this.grid[r]?.[c];
      if (cell && (cell.type === TileType.EMPTY || cell.type === TileType.ICE)) {
        const pos = this.gridToWorld(r, c);
        if (Math.hypot(pos.x - this.playerX, pos.z - this.playerZ) > 4.0) {
          this.createPowerUpEntity(chosenType, pos.x, pos.z);
          return;
        }
      }
    }
  }

  createPowerUpEntity(type, x, z) {
    const mesh = this.modelFactory.createPowerUpMesh(type);
    mesh.position.set(x, 0, z);
    this.entityGroup.add(mesh);

    const item = {
      type,
      x,
      z,
      mesh,
    };
    this.powerUps.push(item);
    return item;
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
        if (this.isDisposed) return;
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

      if (!this.sceneOccluded || this.codexOpen) {
        this.update(dt);
        this.modelFactory?.updateAnimatedTextures(dt);
        if (this.isHangarOpen) {
          this.hangarStage.render(this.renderer, document.querySelector('.hangar-stage-window')?.getBoundingClientRect());
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

    if (this.codexOpen) {
      sound.setListener(0, 0, 28.0);
      this.updateCodexShowcase(dt, elapsed);
      this.updateParticles(dt);
      this.updateCamera(dt, elapsed);
      this.codexFx.update(dt, this.camera, this.renderer);
      return;
    }

    if (this.isHangarPaused || this.isAdPaused) {
      if (this.playerRig) {
        this.playerRig.turret.rotation.y = this.playerHullAngle + Math.sin(elapsed * 0.85) * 0.55;
        this.syncPlayerVisuals(dt * 1.2, elapsed);
      }
      this.updateParticles(dt);
      this.updateCamera(dt, elapsed);
      this.fx.update(dt, this.camera, this.renderer);
      return;
    }

    if (this.status === GameStatus.PLAYING) {
      this.componentDamageCooldown = Math.max(0, this.componentDamageCooldown - dt);
      this.updatePlayer(dt, elapsed);
      this.updateBaseMaintenance(dt);
      this.updateApsInterception(dt);
      this.updateSpawnerLogic(dt);
      if (this.contractState) {
        this.updateContractLogic(dt, elapsed);
      }
      this.updateEnemies(dt, elapsed);
      this.updateDefenseTurrets(dt, elapsed);
      this.updateProjectiles(dt);
      this.updateMines(dt, elapsed);
      this.updateLasers(dt);
      this.updateHazardZones(dt, elapsed);
      this.updatePowerUps(dt, elapsed);
      this.updateSmokeAndLoot(dt);
      this.updateBarrelExplosions(dt);
      this.updateBrickRubble(dt);
      this.updateBurningForests(dt, elapsed);
    } else if (this.playerRig) {
      const canHover = Boolean(this.playerStats?.canHover);
      const hoverY = canHover ? 0.05 + Math.sin(elapsed * 4.0) * 0.012 : 0;
      this.playerRig.root.position.set(this.playerX, hoverY, this.playerZ);
      if (this.inspectMode) {
        this.playerRig.turret.rotation.y = this.playerHullAngle + Math.sin(elapsed * 0.85) * 0.55;
      }
      this.syncPlayerVisuals(dt * 1.2, elapsed);
    }

    this.updateParticles(dt);
    this.updateCamera(dt, elapsed);
    this.fx.update(dt, this.camera, this.renderer);

    this.hudSyncAccumulator += dt;
    const hudInterval = this.status === GameStatus.PLAYING ? 0.12 : 0.5;
    if (this.hudSyncAccumulator >= hudInterval) {
      this.hudSyncAccumulator = 0;
      this.emitHudUpdate();
    }
  }

  updateSmokeAndLoot(dt) {
    for (let i = this.smokeClouds.length - 1; i >= 0; i--) {
      const s = this.smokeClouds[i];
      s.remaining -= dt;
      if (s.remaining <= 0) {
        if (s.mesh) this.fxGroup?.remove(s.mesh);
        this.smokeClouds.splice(i, 1);
      } else {
        if (s.mesh) s.mesh.rotation.y += dt * 0.18;
        if (s.material) {
          const fadeWindow = Math.min(2.0, s.maxDuration || 2.0);
          s.material.opacity = s.remaining < fadeWindow ? (s.remaining / fadeWindow) * 0.78 : 0.78;
        }
      }
    }
    this.inSmoke = this.isPointInSmoke(this.playerX, this.playerZ);

    const sp = (this._sensorParams ||= {
      player: { x: 0, z: 0, turret: null },
      obstacles: [],
      fadeDuration: 5.0,
    });
    sp.contactMap = this.sensorContacts;
    sp.player.x = this.playerX;
    sp.player.z = this.playerZ;
    sp.player.turret = this.assembledTank?.turret || DEFAULT_SENSOR_TURRET;
    sp.enemies = this.enemies;
    sp.smokeClouds = this.smokeClouds;
    sp.dt = dt;
    updatePlayerSensorContacts(sp);
  }

  updatePlayer(dt, elapsed) {
    const subMods = computeSubsystemModifiers(this.subsystems);
    if (this.playerFireCooldown > 0) this.playerFireCooldown -= dt;
    if (this.playerSalvoResetTimer > 0) {
      this.playerSalvoResetTimer -= dt;
      if (this.playerSalvoResetTimer <= 0) {
        this.playerSalvoShot = 0;
      }
    }
    if (this.missileCooldown > 0)
      this.missileCooldown = Math.max(0, this.missileCooldown - dt);
    if (this.apsRearmTimer > 0)
      this.apsRearmTimer = Math.max(0, this.apsRearmTimer - dt);
    if (this.empTimer > 0) this.empTimer = Math.max(0, this.empTimer - dt);
    if (this.smokeCooldown > 0) this.smokeCooldown = Math.max(0, this.smokeCooldown - dt);

    stepAutomaticTrackRepair(this.subsystems, dt);
    const repairDone = stepRepairKit(this.repairKitState, this.subsystems, dt);
    if (repairDone?.healing && this.playerHp < this.playerMaxHp) {
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + repairDone.healing);
    }
    if (repairDone?.completed) {
      sound.playPowerUp();
      this.setStatusBanner(
        'RM-1 FIELD REPAIR COMPLETE',
        2.6
      );
    }

    if (this.jammedTimer > 0) {
      this.jammedTimer = Math.max(0, this.jammedTimer - dt);
    }

    const canHover = this.playerStats.canHover;
    const allTerrain = Boolean(this.playerStats.allTerrain);

    const { row, col } = this.worldToGrid(this.playerX, this.playerZ);
    const currentCell = this.grid[row]?.[col];
    // A damaged amphibious chassis may leave its current water crossing without becoming trapped.
    if (this.componentWaterEgress && !this.checkTankWallCollision(
      this.playerX, this.playerZ, TANK_HIT_RADIUS.PLAYER, false
    )) this.componentWaterEgress = false;
    const canCrossWater = this.playerStats.canCrossWater || this.componentWaterEgress;
    this.onIce = !canHover && !allTerrain && currentCell?.type === TileType.ICE;
    this.onSand = !canHover && !allTerrain && currentCell?.type === TileType.SAND;
    this.inForest = currentCell?.type === TileType.FOREST && !currentCell?.isBurning;
    this.inSmoke = this.isPointInSmoke(this.playerX, this.playerZ);

    const authoredMission =
      SECTORS[this.currentSectorIndex];
    const terrainSample = sampleMissionTerrain(authoredMission, this.playerX, this.playerZ);
    this.currentSurface = this.onIce
      ? { ...TERRAIN_SURFACES.sand, label: 'Low-Friction Ice', speedMultiplier: 0.85 }
      : this.onSand
      ? { ...TERRAIN_SURFACES.sand, label: 'Scorched Sand', speedMultiplier: 0.78 }
      : terrainSample.surface;

    let inFwd = 0;
    let inRight = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) inFwd += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) inFwd -= 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) inRight -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) inRight += 1;

    const len = Math.hypot(inFwd, inRight);
    if (len > 0) {
      inFwd /= len;
      inRight /= len;
    }

    const hpRatio = this.playerHp / this.playerMaxHp;
    const lowHpMult = hpRatio < DURABILITY.LOW_RATIO ? DURABILITY.LOW_SPEED_MULT : 1.0;
    const rawSurfMult = this.currentSurface?.speedMultiplier || 1.0;
    const surfMult = allTerrain ? Math.max(1.0, rawSurfMult) : rawSurfMult;
    const maxSpeed =
      this.playerStats.moveSpeed *
      TILE_SIZE *
      lowHpMult *
      surfMult *
      subMods.speedMultiplier;

    if (hpRatio < DURABILITY.LOW_RATIO && Math.random() < 0.25) {
      this.spawnSparks(this.playerX, 0.65, this.playerZ, 0x475569, 1);
    }

    const surfAccel = this.currentSurface?.accelMultiplier || 1.0;
    const surfBrake = this.currentSurface?.brakeMultiplier || 1.0;
    const accel = (this.onIce ? 4.5 : 22.0) * (allTerrain ? Math.max(1.0, surfAccel) : surfAccel);
    const drag = (this.onIce ? 1.8 : 20.0) * (allTerrain ? Math.max(1.0, surfBrake) : surfBrake);

    if (!subMods.immobilized && len > 0) {
      const quadrantOffset =
        Math.round((this.cameraAzimuth - Math.PI * 0.25) / (Math.PI * 0.5)) *
        (Math.PI * 0.5);
      const rawX = inRight;
      const rawZ = -inFwd;
      const cosA = Math.cos(quadrantOffset);
      const sinA = Math.sin(quadrantOffset);
      const moveX = rawX * cosA - rawZ * sinA;
      const moveZ = rawX * sinA + rawZ * cosA;

      const desiredHullAngle = Math.atan2(moveX, moveZ);
      const maxHullTurnStep =
        (((this.assembledTank?.hull?.turnRate || 160) * Math.PI) / 180) *
        subMods.turnMultiplier *
        dt *
        4.2;
      this.playerHullAngle = stepAngleTowards(
        this.playerHullAngle,
        desiredHullAngle,
        maxHullTurnStep
      );

      if (subMods.asymmetricPull !== 0) {
        this.playerHullAngle = normalizeAngleSigned(
          this.playerHullAngle + subMods.asymmetricPull * 0.45 * dt
        );
      }

      this.playerVx = THREE.MathUtils.damp(
        this.playerVx,
        moveX * maxSpeed,
        accel,
        dt
      );
      this.playerVz = THREE.MathUtils.damp(
        this.playerVz,
        moveZ * maxSpeed,
        accel,
        dt
      );
    } else {
      this.playerVx = THREE.MathUtils.damp(this.playerVx, 0, drag, dt);
      this.playerVz = THREE.MathUtils.damp(this.playerVz, 0, drag, dt);
    }

    const playerSpeed = Math.hypot(this.playerVx, this.playerVz);
    const speedRatio = maxSpeed > 0 ? Math.min(1.0, playerSpeed / maxSpeed) : 0;
    sound.updateEngineLoop(speedRatio, this.hangarOpen || this.status !== GameStatus.PLAYING);

    if (this.ramCooldown > 0) {
      this.ramCooldown = Math.max(0, this.ramCooldown - dt);
    }

    const radius = 0.72;
    const nextX = this.playerX + this.playerVx * dt;
    if (
      !this.checkTankWallCollision(
        nextX,
        this.playerZ,
        radius,
        canCrossWater
      )
    ) {
      this.playerX = nextX;
    } else {
      this.playerVx = 0;
    }

    const nextZ = this.playerZ + this.playerVz * dt;
    if (
      !this.checkTankWallCollision(
        this.playerX,
        nextZ,
        radius,
        canCrossWater
      )
    ) {
      this.playerZ = nextZ;
    } else {
      this.playerVz = 0;
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e) continue;
      const eRadius = e.isBoss ? 1.12 : 0.72;
      const minDist = radius + eRadius;
      const dxE = this.playerX - e.x;
      const dzE = this.playerZ - e.z;
      const distE = Math.hypot(dxE, dzE);

      if (distE < minDist) {
        if (e.contactAbility && this.spendContactEnemy(e)) continue;

        const nx = distE > 1e-4 ? dxE / distE : Math.sin(this.playerHullAngle);
        const nz = distE > 1e-4 ? dzE / distE : Math.cos(this.playerHullAngle);
        const overlap = minDist - distE;

        const pushedX = this.playerX + nx * overlap;
        const pushedZ = this.playerZ + nz * overlap;
        if (
          !this.checkTankWallCollision(
            pushedX,
            pushedZ,
            radius,
            canCrossWater
          )
        ) {
          this.playerX = pushedX;
          this.playerZ = pushedZ;
        }

        const impactSpeed = Math.hypot(this.playerVx, this.playerVz);
        this.playerVx *= 0.25;
        this.playerVz *= 0.25;

        if ((this.ramCooldown || 0) <= 0 && impactSpeed > 1.8) {
          this.ramCooldown = 0.65;
          const frameTier = this.effectiveUpgrades.frame || 1;
          const ramDamage = Math.round(6 + frameTier * 4 + impactSpeed * 1.4);
          const selfRamDamage = Math.max(1, Math.round(6 - frameTier));
          const hitX = (this.playerX + e.x) * 0.5;
          const hitZ = (this.playerZ + e.z) * 0.5;
          sound.playSteelHit({ x: hitX, z: hitZ });
          this.spawnSparks(hitX, 0.75, hitZ, 0xf59e0b, 10);
          this.screenShake = Math.max(this.screenShake, 0.32);
          this.damageEnemy(e, ramDamage);
          this.damagePlayer(selfRamDamage);
        }
      }
    }

    const dx = this.aimWorld.x - this.playerX;
    const dz = this.aimWorld.z - this.playerZ;
    if (dx * dx + dz * dz > 0.01) {
      const targetTurretAngle = Math.atan2(dx, dz);
      const maxTurretStep =
        (((this.assembledTank?.turret?.turnRate || 240) * Math.PI) / 180) *
        subMods.turretTurnMultiplier *
        dt *
        4.0;
      this.playerTurretAngle = stepAngleTowards(
        this.playerTurretAngle,
        targetTurretAngle,
        maxTurretStep
      );
    }

    this.playerRecoil = THREE.MathUtils.damp(this.playerRecoil, 0, 14, dt);
    this.playerBarrelRecoils[0] = THREE.MathUtils.damp(
      this.playerBarrelRecoils[0],
      0,
      16,
      dt
    );
    this.playerBarrelRecoils[1] = THREE.MathUtils.damp(
      this.playerBarrelRecoils[1],
      0,
      16,
      dt
    );
    this.playerRig.barrelPivot.position.z = 0.46 - this.playerRecoil;
    this.playerGunElevation = THREE.MathUtils.damp(
      this.playerGunElevation || 0,
      deckClearance(this.playerRig, this.playerTurretAngle - this.playerHullAngle),
      10,
      dt
    );
    this.playerRig.barrelPivot.rotation.x = -this.playerGunElevation;
    if (this.playerRig.c5Barrels) {
      this.playerRig.c5Barrels[0].position.z = -this.playerBarrelRecoils[0];
      this.playerRig.c5Barrels[1].position.z = -this.playerBarrelRecoils[1];
    }

    if (this.playerFlashTimer > 0) {
      this.playerFlashTimer -= dt;
      this.playerRig.muzzleFlash.material.opacity = 0;
    }

    const hoverY = canHover ? 0.05 + Math.sin(elapsed * 4.0) * 0.012 : 0;
    this.playerRig.root.position.set(this.playerX, hoverY, this.playerZ);
    this.playerRig.hull.rotation.y = this.playerHullAngle;
    this.playerGearState = this.playerGearState || {};
    this.driveGear(this.playerRig, this.playerGearState, this.playerX, this.playerZ, this.playerHullAngle);
    this.playerRig.turret.rotation.y = this.playerTurretAngle;

    const speedMag = Math.hypot(this.playerVx, this.playerVz);
    this.playerForwardSpeed = speedMag;
    this.syncPlayerVisuals(speedMag * dt * 2.5, elapsed);

    if (this.isMouseDown) {
      this.tryPlayerFire();
    }
  }

  getBaseLayout() {
    return getBaseLayout(SECTORS[this.currentSectorIndex]?.baseCell || BASE_CELL);
  }

  /** World centre of the two-cell Allied HQ. */
  getCommandBaseCenter() {
    const baseCell = SECTORS[this.currentSectorIndex]?.baseCell || BASE_CELL;
    const pos = this.gridToWorld(baseCell.row, baseCell.col);
    return { x: pos.x + TILE_SIZE / 2, z: pos.z };
  }

  updateBaseMaintenance(dt) {
    if (!this.baseAlive) {
      this.inBaseRepairZone = false;
      return;
    }

    const baseWorld = this.getCommandBaseCenter();
    const distCells =
      Math.hypot(this.playerX - baseWorld.x, this.playerZ - baseWorld.z) /
      TILE_SIZE;

    const wasInZone = this.inBaseRepairZone;
    this.inBaseRepairZone = distCells <= BASE_REPAIR.RADIUS_CELLS + 1.0;

    if (this.inBaseRepairZone) {
      let repairedAny = false;

      if (this.playerHp < this.playerMaxHp) {
        this.playerHp = Math.min(
          this.playerMaxHp,
          this.playerHp + BASE_REPAIR.RATE * dt
        );
        repairedAny = true;
      }

      const subRate = (BASE_REPAIR.SUBSYSTEM_RATE || 10.0) * dt;
      if (this.subsystems) {
        for (const sub of Object.values(this.subsystems)) {
          if (sub && typeof sub.hp === 'number' && sub.hp < sub.maxHp) {
            sub.hp = Math.min(sub.maxHp, sub.hp + subRate);
            sub.repairProgress = 0;
            sub.repairDelayTimer = 0;
            sub.status =
              sub.hp >= sub.maxHp * 0.5
                ? 'normal'
                : sub.hp > 0
                  ? 'damaged'
                  : 'destroyed';
            repairedAny = true;
          }
        }
      }

      if (this.playerArmorPanels) {
        for (const panel of Object.values(this.playerArmorPanels)) {
          const maxInt = panel?.maxIntegrity || 100;
          if (panel && typeof panel.integrity === 'number' && panel.integrity < maxInt) {
            panel.integrity = Math.min(maxInt, panel.integrity + 4.5 * dt);
            if (panel.integrity >= 15) {
              panel.destroyed = false;
            }
            repairedAny = true;
          }
        }
      }

      const maxCannon = this.getPlayerMaxCannonAmmo();
      if (this.cannonAmmo < maxCannon) {
        this.cannonBaseRearmTimer += dt;
        if (this.cannonBaseRearmTimer >= CANNON_AMMO.BASE_REARM_INTERVAL_SEC) {
          this.cannonBaseRearmTimer = 0;
          this.cannonAmmo = Math.min(maxCannon, this.cannonAmmo + 1);
          this.playerSave.cannonAmmo = this.cannonAmmo;
          this.spawnSparks(this.playerX, 0.7, this.playerZ, 0xf59e0b, 2);
          repairedAny = true;
          this.emitHudUpdate();
        }
      } else {
        this.cannonBaseRearmTimer = 0;
      }

      if (repairedAny) {
        if (!wasInZone && !this.statusMessage) {
          this.setStatusBanner(
            'ALLIED BASE REPAIR & REARM BAY ACTIVE',
            2.2
          );
        }
        this.baseRepairSparkTimer -= dt;
        if (this.baseRepairSparkTimer <= 0) {
          this.baseRepairSparkTimer = BASE_REPAIR.SPARK_INTERVAL;
          this.spawnSparks(this.playerX, 0.7, this.playerZ, 0x10b981, 2);
        }
      }
    }
  }

  setBasePerimeterMaterial(targetType) {
    for (const p of this.getBaseLayout().wall) {
      const cell = this.grid[p.row]?.[p.col];
      if (!cell) continue;
      if (cell.mesh) {
        this.mapGroup.remove(cell.mesh);
        cell.mesh = null;
      }
      const { x, z } = this.gridToWorld(p.row, p.col);
      if (targetType === TileType.CONCRETE) {
        const concrete = this.modelFactory.createConcreteBlock();
        concrete.position.set(x, 0, z);
        this.mapGroup.add(concrete);
        cell.type = TileType.CONCRETE;
        this._spawnerCells = null;
        cell.hp = 16;
        cell.maxHp = 16;
        cell.mesh = concrete;
        cell.subMeshes = undefined;
      } else {
        const brick = this.modelFactory.createBrickBlock();
        brick.group.position.set(x, 0, z);
        this.mapGroup.add(brick.group);
        cell.type = TileType.BRICK;
        this._spawnerCells = null;
        cell.hp = 4;
        cell.maxHp = 4;
        cell.mesh = brick.group;
        cell.subMeshes = brick.subMeshes;
      }
    }
  }

  updateApsInterception() {
    if (this.apsRearmTimer > 0 || this.jammedTimer > 0) return;
    const totalAmmo = this.apsAmmo.reduce((a, b) => a + b, 0);
    if (totalAmmo <= 0) return;

    const detectWorldRadius = APS.DETECT_RADIUS * TILE_SIZE;
    // Player hull collision radius is TANK_HIT_RADIUS.PLAYER (0.85). Add safety margin for projectile & hull boundaries.
    const directHitThreatMargin = TANK_HIT_RADIUS.PLAYER + 0.45; // ~1.30m

    // 1. Direct-fire projectiles (shells, missiles, rockets)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const cost = apsInterceptCost(p);
      if (!cost || totalAmmo < cost) continue;

      const toPlayerX = this.playerX - p.x;
      const toPlayerZ = this.playerZ - p.z;
      const dist = Math.hypot(toPlayerX, toPlayerZ);
      if (dist > detectWorldRadius) continue;

      // Check if projectile is moving towards the player
      const speed = Math.hypot(p.vx, p.vz);
      const dot = toPlayerX * p.vx + toPlayerZ * p.vz;

      // If moving away and already beyond player hit boundary, ignore it
      if (dot <= 0 && dist > TANK_HIT_RADIUS.PLAYER + 0.2) continue;

      // Trajectory closest approach distance check for straight-flying projectiles
      if (speed > 0.1 && !p.isHoming) {
        // Cross product / speed gives perpendicular distance to the line of flight
        const cross = Math.abs(toPlayerX * p.vz - toPlayerZ * p.vx);
        const closestDistance = cross / speed;
        // If projectile line of flight does not intersect player's threat radius, ignore it
        if (closestDistance > directHitThreatMargin) continue;
      }

      // Check if an impassable obstacle (Brick or Concrete) stands between projectile and player
      if (!this.hasLineOfSight(p.x, p.z, this.playerX, this.playerZ)) continue;

      if (this.consumeApsLauncherTowards(p.x, p.z, 0.95, cost)) {
        this.removeProjectile(i);
        return;
      }
    }

    // 2. Incoming artillery hazard zones (Howitzer, MLRS, Boss barrages)
    // Only intercept if the impact area will actually splash/damage the player
    const maxArtilleryThreatRadius = (ARTILLERY.SPLASH_RADIUS || 1.5) * TILE_SIZE + TANK_HIT_RADIUS.PLAYER + 0.25; // ~3.75 - 4.10m
    for (let i = this.hazardZones.length - 1; i >= 0; i--) {
      const hz = this.hazardZones[i];
      const cost = apsInterceptCost(hz);
      if (!cost || totalAmmo < cost) continue;
      const progress = 1 - hz.timer / hz.maxTimer;
      if (progress >= APS.ARTILLERY_ENGAGE_PROGRESS) {
        const dist = Math.hypot(hz.x - this.playerX, hz.z - this.playerZ);
        if (dist <= maxArtilleryThreatRadius && dist <= detectWorldRadius) {
          const shell = hz.shellMesh.position;
          if (this.consumeApsLauncherTowards(shell.x, shell.z, shell.y, cost)) {
            this.fxGroup.remove(hz.ringMesh);
            this.fxGroup.remove(hz.fillMesh);
            this.fxGroup.remove(hz.shellMesh);
            this.hazardZones.splice(i, 1);
            return;
          }
        }
      }
    }
  }

  consumeApsLauncherTowards(threatX, threatZ, threatY = 0.95, cost = 1) {
    if (this.apsAmmo.reduce((sum, rounds) => sum + rounds, 0) < cost) return false;
    let remaining = cost;
    for (const idx of APS.FILL_ORDER) {
      const spent = Math.min(this.apsAmmo[idx], remaining);
      this.apsAmmo[idx] -= spent;
      remaining -= spent;
      if (!remaining) break;
    }

    this.apsRearmTimer = APS.REARM_TIME;
    this.syncApsVisuals();
    sound.playApsIntercept({ x: threatX, z: threatZ });

    const toX = threatX - this.playerX;
    const toZ = threatZ - this.playerZ;
    const toLen = Math.hypot(toX, toZ) || 1;
    this.fx.apsIntercept(
      this.playerX + (toX / toLen) * 0.75,
      1.05,
      this.playerZ + (toZ / toLen) * 0.75,
      threatX,
      threatY,
      threatZ
    );
    this.emitHudUpdate();
    return true;
  }

  tryPlayerFire() {
    if (this.playerFireCooldown > 0) return;
    if (this.cannonAmmo <= 0) {
      sound.playDryFire();
      this.setStatusBanner('OUT OF AMMO! REARM AT BASE OR FIND AMMO CRATES', 2.0);
      return;
    }
    this.cannonAmmo--;
    this.playerSave.cannonAmmo = this.cannonAmmo;

    this.playerFlashTimer = 0.06;
    this.shotsFired++;

    const dirX = Math.sin(this.playerTurretAngle);
    const dirZ = Math.cos(this.playerTurretAngle);
    const perpX = Math.cos(this.playerTurretAngle);
    const perpZ = -Math.sin(this.playerTurretAngle);
    const cannonIdx = Math.max(0, Math.min(4, (this.effectiveUpgrades.cannon || 1) - 1));
    const flashOffset = this.playerRig?.flashOffsets?.[cannonIdx];
    const muzzleDist =
      flashOffset != null ? 0.46 + flashOffset : 1.48 + cannonIdx * 0.14;
    const { x: muzzleX, z: muzzleZ } = this.traceMuzzle(
      this.playerX,
      this.playerZ,
      dirX,
      dirZ,
      muzzleDist,
      true
    );

    const worldSpeed = this.playerStats.bulletSpeed * TILE_SIZE;
    const isHeavy = this.playerStats.bulletPower === BULLET_POWER.HEAVY;

    if (this.playerStats.barrels === 2) {
      const barrelIdx = this.playerSalvoShot || 0;
      const isSecondShot = barrelIdx === 1;

      if (isSecondShot) {
        const fullCooldown = this.playerStats.fireCooldown || 0.88;
        this.playerFireCooldown = fullCooldown;
        this.playerMaxFireCooldown = fullCooldown;
        this.playerSalvoShot = 0;
        this.playerSalvoResetTimer = 0;
      } else {
        const interCooldown = this.playerStats.interBarrelCooldown || 0.5;
        this.playerFireCooldown = interCooldown;
        this.playerMaxFireCooldown = interCooldown;
        this.playerSalvoShot = 1;
        this.playerSalvoResetTimer = this.playerStats.fireCooldown || 0.88;
      }

      this.playerRecoil = 0.07;
      this.playerBarrelRecoils[barrelIdx] = 0.24;

      const sideSign = barrelIdx === 0 ? -1 : 1;
      const latOffset =
        sideSign * (this.playerStats.barrelOffset || 0.22) * TILE_SIZE * 0.45;

      if (this.playerRig?.muzzleFlash) {
        this.playerRig.muzzleFlash.position.x = sideSign * 0.14;
      }

      const { x: shotX, z: shotZ } = this.traceMuzzle(
        this.playerX,
        this.playerZ,
        dirX,
        dirZ,
        muzzleDist,
        true,
        perpX * latOffset,
        perpZ * latOffset
      );
      this.spawnProjectile(
        shotX,
        shotZ,
        dirX,
        dirZ,
        true,
        this.playerStats.damage,
        this.playerStats.penetration,
        this.playerStats.bulletPower,
        worldSpeed,
        isHeavy
      );
      this.firePlayerMuzzleFx(shotX, shotZ, dirX, dirZ, isHeavy);
    } else {
      const fullCooldown = this.playerStats.fireCooldown || 1.25;
      this.playerFireCooldown = fullCooldown;
      this.playerMaxFireCooldown = fullCooldown;
      this.playerRecoil = 0.22;
      if (this.playerRig?.muzzleFlash) {
        this.playerRig.muzzleFlash.position.x = 0;
      }
      this.spawnProjectile(
        muzzleX,
        muzzleZ,
        dirX,
        dirZ,
        true,
        this.playerStats.damage,
        this.playerStats.penetration,
        this.playerStats.bulletPower,
        worldSpeed,
        isHeavy
      );
      this.firePlayerMuzzleFx(muzzleX, muzzleZ, dirX, dirZ, isHeavy);
    }
    sound.playCannonShot(isHeavy);
  }

  firePlayerMuzzleFx(x, z, dirX, dirZ, isHeavy) {
    const muzzle = this.getRigMuzzle(this.playerRig, this.playerX, this.playerZ, dirX, dirZ);
    const cannonTier = this.effectiveUpgrades.cannon || 1;
    this.fx.muzzleFlash(x, muzzle.y, z, dirX, dirZ, {
      scale: (isHeavy ? 1.15 : 0.9) + cannonTier * 0.05,
      tint: 0xffb347,
    });
  }

  spawnEncounterEnemy(enemyClass, group) {
    const liveStealth = this.enemies.filter(enemy => enemy.enemyClass === EnemyClass.STEALTH).length;
    const liveJammer = this.enemies.some(enemy => enemy.enemyClass === EnemyClass.JAMMER);
    if (enemyClass === EnemyClass.STEALTH && (liveStealth >= 2 || (liveJammer && liveStealth >= 1))) return false;
    if (enemyClass === EnemyClass.JAMMER && liveStealth >= 2) return false;
    if (enemyClass === EnemyClass.JAMMER && this.enemies.some(enemy => enemy.enemyClass === EnemyClass.JAMMER)) return false;
    if (enemyClass === EnemyClass.HOWITZER && this.enemies.filter(enemy => enemy.enemyClass === EnemyClass.HOWITZER).length >= 2) return false;
    if (enemyClass === EnemyClass.FLAMETHROWER && this.enemies.filter(enemy => enemy.enemyClass === EnemyClass.FLAMETHROWER).length >= 2) return false;
    if (enemyClass === EnemyClass.ENGINEER && this.enemies.filter(enemy => enemy.enemyClass === EnemyClass.ENGINEER).length >= 2) return false;
    const sector = SECTORS[this.currentSectorIndex];
    const kamikazeLimit = sector.id >= 33 ? 2 : 1;
    if (enemyClass === EnemyClass.KAMIKAZE && this.enemies.filter(enemy => enemy.enemyClass === EnemyClass.KAMIKAZE).length >= kamikazeLimit) return false;
    const candidates = sector.entrances.filter(entry => group.entrances.includes(entry.id));
    for (let offset = 0; offset < candidates.length; offset++) {
      const entry = candidates[(this.spawnerRoundRobinIdx + offset) % candidates.length];
      const pos = this.gridToWorld(entry.row, entry.col);
      const distance = Math.hypot(this.playerX - pos.x, this.playerZ - pos.z);
      if (distance < 14 || (distance < 24 && this.hasLineOfSight(this.playerX, this.playerZ, pos.x, pos.z))) continue;
      if (this.enemies.some(enemy => Math.hypot(enemy.x - pos.x, enemy.z - pos.z) < 2.6)) continue;
      const spawn = this.resolveBorderSpawn(entry, { enemyClass, minPlayerDist: 14, losAvoidDist: 24 });
      if (!spawn) continue;
      this.createEnemyAt(enemyClass, spawn.spawnPos.x, spawn.spawnPos.z, false, spawn.entryTarget);
      this.enemies.at(-1).campaignPatrolRoute = group.patrolRoute;
      this.spawnerRoundRobinIdx++;
      return true;
    }
    if (candidates.length > 0) {
      const fallbackEntry = candidates[this.spawnerRoundRobinIdx % candidates.length];
      const spawn = this.resolveBorderSpawn(fallbackEntry, { enemyClass, minPlayerDist: 14, losAvoidDist: 24 });
      if (spawn) {
        this.createEnemyAt(enemyClass, spawn.spawnPos.x, spawn.spawnPos.z, false, spawn.entryTarget);
        this.enemies.at(-1).campaignPatrolRoute = group.patrolRoute;
        this.spawnerRoundRobinIdx++;
        return true;
      }
    }
    return false;
  }

  spawnContractEnemy(enemyClass, assignment, groupEntry) {
    const gateIds = [
      assignment?.gateId,
      groupEntry?.primaryGateId,
      groupEntry?.secondaryGateId,
    ].filter(Boolean);
    const uniqueGateIds = [...new Set(gateIds)];

    for (const gateId of uniqueGateIds) {
      const gate = LAST_CARGO_GATES[gateId];
      if (!gate) continue;
      for (const dc of [0, -1, 1]) {
        const col = gate.col + dc;
        const entryRow = gate.entryTarget?.row ?? 3;
        const cell = this.grid[0]?.[col];
        if (!cell || cell.type !== TileType.EMPTY) continue;
        const borderPos = this.gridToWorld(0, col);
        // Never spawn near the player or on top of an existing enemy
        if (Math.hypot(this.playerX - borderPos.x, this.playerZ - borderPos.z) < 10.0) continue;
        if (this.enemies.some((e) => Math.hypot(e.x - borderPos.x, e.z - borderPos.z) < 2.3)) continue;

        const targetPos = this.gridToWorld(entryRow, col);
        const spawnZ = -((GRID_SIZE * TILE_SIZE) / 2) - 2.8;
        this.createEnemyAt(enemyClass, borderPos.x, spawnZ, false, targetPos);
        const spawned = this.enemies.at(-1);
        if (spawned) {
          spawned.campaignPatrolRoute = assignment?.patrolRoute || [{ row: entryRow, col }];
          spawned.contractHomeZone = assignment?.homeZone || null;
          spawned.contractAssignment = assignment || null;
        }
        return true;
      }
    }
    return false;
  }

  isPlayerCurrentlyMoving() {
    const moveKeysPressed = Boolean(
      this.keys.KeyW ||
        this.keys.ArrowUp ||
        this.keys.KeyS ||
        this.keys.ArrowDown ||
        this.keys.KeyA ||
        this.keys.ArrowLeft ||
        this.keys.KeyD ||
        this.keys.ArrowRight
    );
    return moveKeysPressed || Math.abs(this.playerForwardSpeed || 0) > 0.15;
  }

  startContractCargoLoad() {
    if (!this.contractState || this.status !== GameStatus.PLAYING) return false;
    const isSabotage = this.contractState.contractType === CONTRACT_TYPES.SABOTAGE_PROTOCOL;
    const res = startCargoLoading(
      this.contractState,
      this.playerX,
      this.playerZ,
      this.isPlayerCurrentlyMoving(),
      TILE_SIZE
    );
    if (res.started && !res.alreadyLoading) {
      sound.playCargoLoad();
      this.setStatusBanner(
        isSabotage
          ? 'ARMING DEMOLITION CHARGE — HOLD POSITION FOR 2.5s!'
          : 'LOADING DATA CONTAINER — HOLD POSITION FOR 2.0s',
        2.2
      );
      this.emitHudUpdate();
      return true;
    }
    if (!res.started && res.reason) {
      this.setStatusBanner(res.reason.toUpperCase(), 2.0);
    }
    return false;
  }

  startContractExtract() {
    if (!this.contractState || this.status !== GameStatus.PLAYING) return false;
    const res = startContractExtraction(this.contractState, this.playerX, this.playerZ);
    if (res.started && !res.alreadyActive) {
      sound.playContractExtract();
      this.setStatusBanner('EXTRACTION INITIATED — STAY ON PAD FOR 3.0s!', 3.0);
      this.emitHudUpdate();
      return true;
    }
    if (!res.started && res.reason) {
      this.setStatusBanner(res.reason.toUpperCase(), 2.0);
    }
    return false;
  }

  interactContractObjective() {
    if (!this.contractState || this.status !== GameStatus.PLAYING) return false;
    const isSabotage = this.contractState.contractType === CONTRACT_TYPES.SABOTAGE_PROTOCOL;
    const snap = buildContractHudSnapshot(this.contractState, this.playerX, this.playerZ, TILE_SIZE);
    if (snap?.canLoadCargo) {
      return this.startContractCargoLoad();
    }
    if (snap?.canExtract) {
      return this.startContractExtract();
    }
    if (snap?.armedCargo) {
      this.setStatusBanner('CHARGE ARMED — CLEAR THE 3-CELL BLAST ZONE BEFORE DETONATION!', 2.4);
    } else if (snap?.carriedCargo) {
      this.setStatusBanner('DRIVE ONTO THE SOUTHERN DELIVERY PAD AND HOLD FOR 2.0s TO UNLOAD', 2.4);
    } else {
      this.setStatusBanner(
        isSabotage
          ? 'STOP WITHIN 1.5 CELLS OF A RADAR RELAY AND PRESS [E] TO PLANT CHARGE'
          : 'STOP WITHIN 1.5 CELLS OF A DATA CONTAINER AND PRESS [E] TO LOAD',
        2.4
      );
    }
    return false;
  }

  detonateSabotageRelay(relay) {
    if (!relay) return;
    const { x, z, row, col } = relay;
    sound.playEnvironmentalExplosion({ x, z });
    this.screenShake = Math.max(this.screenShake, 0.9);
    this.fx.explosion(x, 0.7, z, { scale: 2.25, boss: true, tint: 0xa855f7 });
    this.fx.shockwave(x, 0.12, z, 0.5, 6.2, 0xc084fc, 0.55);
    this.fx.scorch(x, z, 3.2);
    this.fx.sparks(x, 0.7, z, 0xe879f9, 32, { speed: 2.8, up: 1.8 });

    const blastRadius = CONTRACT_TIMING.BLAST_RADIUS_CELLS * TILE_SIZE;
    const maxDamage = 42;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy || enemy.hp <= 0) continue;
      const dist = Math.hypot(enemy.x - x, enemy.z - z);
      if (dist <= blastRadius) {
        const falloff = 1 - (dist / blastRadius) * 0.45;
        const dmg = Math.round(maxDamage * Math.max(0.45, falloff));
        this.damageEnemy(enemy, dmg, x, z);
        this.fx.armorHit(enemy.x, 0.6, enemy.z, { scale: 1.35, colorHex: 0xc084fc });
      }
    }

    if (this.playerHp > DURABILITY.ZERO_HP) {
      const pDist = Math.hypot(this.playerX - x, this.playerZ - z);
      if (pDist <= blastRadius) {
        const falloff = 1 - (pDist / blastRadius) * 0.5;
        const dmg = Math.round(32 * Math.max(0.35, falloff));
        this.damagePlayer(dmg);
        this.fx.armorHit(this.playerX, 0.6, this.playerZ, { scale: 1.35, colorHex: 0xef4444 });
      }
    }

    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (Math.hypot(dr, dc) > 2.3) continue;
        const neighbor = this.grid[row + dr]?.[col + dc];
        if (!neighbor || neighbor.type === TileType.EMPTY) continue;
        const nPos = this.gridToWorld(neighbor.row, neighbor.col);
        if (neighbor.type === TileType.BRICK || neighbor.type === TileType.FOREST) {
          this.destroyTileCell(neighbor);
        } else if (neighbor.type === TileType.CONCRETE) {
          this.damageTileCell(neighbor, 6, nPos.x, nPos.z);
        } else if (neighbor.type === TileType.BARREL && !neighbor._exploding) {
          this.explodeBarrel(neighbor, true);
        }
      }
    }
  }

  updateContractLogic(dt, elapsed) {
    if (!this.contractState) return;
    const isSabotage = this.contractState.contractType === CONTRACT_TYPES.SABOTAGE_PROTOCOL;
    const isMoving = this.isPlayerCurrentlyMoving();
    const events = stepContractCargo(this.contractState, dt, {
      playerX: this.playerX,
      playerZ: this.playerZ,
      isMoving,
      tileSize: TILE_SIZE,
    });

    if (events.loadCancelled) {
      this.setStatusBanner(
        isSabotage
          ? 'CHARGE ARMING CANCELLED — REMAIN STATIONARY WITHIN 1.5 CELLS'
          : 'CARGO LOADING CANCELLED — REMAIN STATIONARY WITHIN 1.5 CELLS',
        2.2
      );
      this.emitHudUpdate();
    }

    if (events.armedCargo) {
      sound.playBossAlarm();
      const extra =
        events.triggeredGroup === 'G1'
          ? ' · STEALTH HUNTERS alerted!'
          : events.triggeredGroup
          ? ` · ${events.triggeredGroup} QRF INBOUND!`
          : '';
      this.setStatusBanner(
        `CHARGE ARMED ON ${events.armedCargo.name.toUpperCase()} — DETONATION IN 8.0s! CLEAR 3-CELL RADIUS!${extra}`,
        4.2
      );
      this.emitHudUpdate();
    }

    if (events.loadedCargo) {
      sound.playCargoLoad();
      const extra =
        events.triggeredGroup === 'G1'
          ? ' · TERMINAL ALARM TRIGGERED!'
          : events.triggeredGroup
          ? ` · ${events.triggeredGroup} REINFORCEMENTS QUEUED!`
          : '';
      this.setStatusBanner(
        `${events.loadedCargo.name.toUpperCase()} LOADED — RETURN TO SOUTH DELIVERY PAD${extra}`,
        3.6
      );
      this.emitHudUpdate();
    }

    if (events.unloadReset) {
      this.setStatusBanner('UNLOADING RESET — REMAIN ON DELIVERY PAD FOR 2.0s', 2.2);
      this.emitHudUpdate();
    }

    if (events.detonatedCargo) {
      this.detonateSabotageRelay(events.detonatedCargo);
    }

    if (events.deliveredCargo) {
      if (!events.detonatedCargo) {
        sound.playCargoDeliver();
      }
      const payout = commitContractCargoDelivery(
        this.playerSave,
        this.activeMissionRun,
        events.deliveredCargo.id
      );
      if (payout.paid) {
        events.deliveredCargo.rewardPaid = true;
        this.creditsEarnedThisMission = (this.creditsEarnedThisMission || 0) + payout.amount;
        this.saveRepo.savePlayerSave(this.playerSave);
        this.syncCampaignCredits();
      }
      const delivered = this.contractState.deliveredCount;
      const objLabel = isSabotage ? 'RELAY' : 'CARGO';
      const actionVerb = isSabotage ? 'DEMOLISHED' : 'DELIVERED';
      if (delivered === 1) {
        this.setStatusBanner(
          `${objLabel} ${events.deliveredCargo.code} ${actionVerb} (+$${payout.amount} SECURED) — 1/2 ${actionVerb}!`,
          3.6
        );
      } else if (delivered === 2) {
        this.setStatusBanner(
          `${objLabel} ${events.deliveredCargo.code} ${actionVerb} (+$${payout.amount} SECURED) — EXTRACTION READY [E] OR RISK 3RD ${objLabel} (+$4,000)!`,
          4.5
        );
      } else {
        this.setStatusBanner(
          `ALL 3 ${objLabel}S ${actionVerb} (+$${payout.amount} SECURED) — HEAD SOUTH TO EXTRACTION PAD [E]!`,
          4.5
        );
      }
      this.emitHudUpdate();
    }

    if (events.extractCancelled) {
      this.setStatusBanner('EXTRACTION CANCELLED — REMAIN ON THE EXTRACTION PAD!', 2.4);
      this.emitHudUpdate();
    }

    if (events.extracted) {
      sound.playContractExtract();
      this.triggerMissionVictory(
        this.contractState.deliveredCount >= 3
          ? isSabotage
            ? 'BLACKOUT PROTOCOL COMPLETE — ALL 3 RELAYS DEMOLISHED & BONUS SECURED!'
            : 'FULL CONTRACT EXTRACTION COMPLETE — ALL 3 CONTAINERS & BONUS SECURED!'
          : isSabotage
          ? 'BLACKOUT PROTOCOL COMPLETE — RADAR RELAYS DEMOLISHED!'
          : 'CONTRACT EXTRACTION COMPLETE — DATA CONTAINERS SECURED!'
      );
      return;
    }

    stepContractScheduler(
      this.contractState,
      dt,
      this.enemies.length,
      (unitType, assignment, groupEntry) => this.spawnContractEnemy(unitType, assignment, groupEntry),
      (group) => {
        sound.playBossAlarm();
        const gateLabel = LAST_CARGO_GATES[group.primaryGateId]?.label || 'NORTH GATE';
        this.setStatusBanner(`${group.label} · ${gateLabel} IN 6s`, 3.6);
      }
    );
    this.vanguardRemainingToSpawn =
      this.contractState.scheduler.totalBudget - this.contractState.scheduler.totalSpawned;

    // Update 3D visuals for containers / relays, carried indicator, and delivery pad
    if (this.contractCargoMeshes) {
      for (const c of this.contractState.containers) {
        const mesh = this.contractCargoMeshes.get(c.id);
        if (!mesh) continue;
        const isArmed = c.status === CARGO_STATUS.ARMED;
        const visible =
          c.status === CARGO_STATUS.AVAILABLE ||
          c.status === CARGO_STATUS.LOADING ||
          isArmed;
        mesh.visible = visible;
        if (visible && mesh.userData) {
          if (mesh.userData.dataCrest) {
            mesh.userData.dataCrest.rotation.y = elapsed * (isArmed ? 9.5 : 2.2);
          }
          if (mesh.userData.ringMat) {
            mesh.userData.ringMat.opacity =
              c.status === CARGO_STATUS.LOADING || isArmed
                ? 0.55 + Math.sin(elapsed * 16) * 0.4
                : 0.85;
          }
          if (mesh.userData.blastRing && mesh.userData.blastRingMat) {
            mesh.userData.blastRing.visible = isArmed;
            if (isArmed) {
              mesh.userData.blastRingMat.opacity = 0.45 + Math.sin(elapsed * 18) * 0.35;
            }
          }
        }
      }
    }

    if (this.carriedCargoIndicator) {
      const isCarrying = Boolean(this.contractState.carriedCargoId);
      this.carriedCargoIndicator.visible = isCarrying;
      if (isCarrying && this.carriedCargoIndicator.userData?.diamond) {
        this.carriedCargoIndicator.userData.diamond.rotation.y = elapsed * 2.6;
      }
    }

    if (this.contractPadMesh?.userData?.borderMat) {
      const mat = this.contractPadMesh.userData.borderMat;
      if (this.contractState.extraction.available) {
        mat.color.setHex(0x10b981);
        mat.emissive.setHex(0x059669);
      } else if (this.contractState.carriedCargoId) {
        mat.color.setHex(0xf59e0b);
        mat.emissive.setHex(0xd97706);
      } else {
        mat.color.setHex(0x38bdf8);
        mat.emissive.setHex(0x0284c7);
      }
    }
  }

  updateSpawnerLogic(dt) {
    if (this.contractState) {
      return;
    }
    if (this.survivalState) {
      this.survivalState.elapsedSec += dt;
      if (this.survivalState.phase === 'intermission') {
        this.survivalState.intermissionTimer -= dt;
        if (this.survivalState.intermissionTimer <= 0) {
          this.startSurvivalWave(this.survivalState.wave + 1, false);
        }
        return;
      }

      const spec = this.survivalState.waveSpec;
      const maxConcurrent = spec?.maxConcurrentEnemies ?? 6;
      const spawnInterval = spec?.spawnIntervalSec ?? 2.0;

      if (this.vanguardRemainingToSpawn > 0) {
        if (this.enemies.length < maxConcurrent) {
          this.spawnTimer -= dt;
          if (this.spawnTimer <= 0) {
            const spawned = this.spawnVanguardEnemy();
            this.spawnTimer = spawned ? spawnInterval : 0.6;
          }
        }
      }

      if (
        spec?.isBossWave &&
        !this.bossSpawned &&
        this.vanguardRemainingToSpawn <= 2 &&
        this.enemies.length < maxConcurrent
      ) {
        this.spawnSectorBoss(spec.bossClass, spec.bossName);
      }

      if (
        this.vanguardRemainingToSpawn === 0 &&
        (!spec?.isBossWave || this.bossSpawned) &&
        this.enemies.length === 0
      ) {
        this.onSurvivalWaveCleared();
      }
      return;
    }
    if (this.encounterState) {
      const sector = SECTORS[this.currentSectorIndex];
      updateEncounters(this.encounterState, dt, this.enemies.length,
        sector.maxConcurrentEnemies, sector.spawnIntervalSec,
        (type, group) => this.spawnEncounterEnemy(type, group),
        label => this.setStatusBanner(label, 4));
      this.vanguardRemainingToSpawn = remainingEncounterEnemies(this.encounterState);
      if (this.vanguardRemainingToSpawn === 0 && this.enemies.length === 0) {
        if (this.activeMapRules?.spawnSectorBossOnClear !== false && !this.bossSpawned) {
          this.spawnSectorBoss();
        } else if (this.activeMapRules.victoryOnAllEnemiesDestroyed) {
          const totalHostiles = sector.enemyPool.length + (this.activeMapRules?.spawnSectorBossOnClear !== false ? 1 : 0);
          this.triggerMissionVictory(`${sector.name.toUpperCase()} COMPLETE — ALL ${totalHostiles} HOSTILES ELIMINATED`);
        }
      }
      return;
    }
    const spawners = this.getSpawnerCells();
    const sector = SECTORS[this.currentSectorIndex];
    const maxConcurrent = sector?.maxConcurrentEnemies ?? 8;
    const spawnInterval = sector?.spawnIntervalSec ?? 2.6;

    if (this.vanguardRemainingToSpawn > 0 && spawners.length > 0) {
      if (this.enemies.length < maxConcurrent) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          const spawned = this.spawnVanguardEnemy();
          this.spawnTimer = spawned ? spawnInterval : 0.6;
        }
      }
    } else if (!this.bossSpawned && this.enemies.length === 0) {
      if (this.activeMapRules?.spawnSectorBossOnClear !== false) {
        this.spawnSectorBoss();
      } else {
        const victoryRes = checkMapVictory(this.activeMapRules, {
          enemyBaseDestroyed: !this.enemyBaseAlive,
          vanguardRemainingToSpawn: 0,
          activeEnemiesCount: 0,
          bossDefeated: true,
        });
        if (victoryRes.isVictory) {
          this.triggerMissionVictory(victoryRes.banner);
        }
      }
    }
  }

  /** Checks optical line-of-sight between two world coordinates (x0, z0) and (x1, z1). */
  canEngageCommandBase(x0, z0) {
    const baseWorld = this.getCommandBaseCenter();
    const dx = baseWorld.x - x0;
    const dz = baseWorld.z - z0;
    const dist = Math.hypot(dx, dz);
    if (dist > 7.5 * TILE_SIZE) return false;
    const half = (GRID_SIZE * TILE_SIZE) / 2;
    const steps = Math.max(2, Math.ceil(dist / (TILE_SIZE * 0.45)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const col = Math.floor((x0 + dx * t + half) / TILE_SIZE);
      const row = Math.floor((z0 + dz * t + half) / TILE_SIZE);
      if (this.grid[row]?.[col]?.type === TileType.CONCRETE) return false;
    }
    return true;
  }

  hasLineOfSight(x0, z0, x1, z1) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const dist = Math.hypot(dx, dz);
    if (dist <= 0.5) return true;

    if (this.isSegmentInSmoke(x0, z0, x1, z1)) return false;

    const half = (GRID_SIZE * TILE_SIZE) / 2;
    const steps = Math.max(2, Math.ceil(dist / (TILE_SIZE * 0.45)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const sx = x0 + dx * t;
      const sz = z0 + dz * t;
      const col = Math.floor((sx + half) / TILE_SIZE);
      const row = Math.floor((sz + half) / TILE_SIZE);
      const cell = this.grid[row]?.[col];
      if (
        cell &&
        (cell.type === TileType.BOXES || cell.type === TileType.BRICK || cell.type === TileType.CONCRETE)
      ) {
        return false;
      }
    }
    return true;
  }

  /** When an enemy tank spots the Player, it broadcasts the Player's current coordinates. */
  broadcastPlayerLocationFrom(spotter, targetX, targetZ) {
    const alertRadius =
      spotter.radioAlertRadius ?? ENEMY_VISIBILITY.RADIO_ALERT_RADIUS;
    spotter.radioCooldown = ENEMY_VISIBILITY.RADIO_BROADCAST_COOLDOWN_SEC;

    for (const ally of this.enemies) {
      if (ally === spotter) continue;
      const distToAlly = Math.hypot(ally.x - spotter.x, ally.z - spotter.z);
      if (distToAlly > alertRadius) continue;

      if (!ally.hasDetectedPlayer && ally.alertTimer <= 0) {
        if (Math.random() < ENEMY_VISIBILITY.RADIO_RESPONSE_CHANCE) {
          const scatterAngle = Math.random() * Math.PI * 2;
          const scatterDist = Math.random() * 2.5;
          ally.alertTarget = {
            x: targetX + Math.cos(scatterAngle) * scatterDist,
            z: targetZ + Math.sin(scatterAngle) * scatterDist,
          };
          ally.alertTimer = ENEMY_VISIBILITY.ALERT_PURSUIT_DURATION_SEC;
          ally.aiTimer = 0;
          if (ally.ai) {
            ally.ai.state = 'alert_move';
            ally.ai.lastKnownTargetPos = { x: targetX, z: targetZ };
          }
          this.spawnSparks(ally.x, 1.35, ally.z, 0xf59e0b, 3);
        }
      }
    }
  }

  /** Seconds until the next role-brain re-plan. */
  enemyReplanDelay(e) {
    const random = e.behaviorRng ?? Math.random;
    const [lo, hi] = BRAIN_REPLAN_SEC;
    return lo + random() * (hi - lo);
  }

  /** What the enemy knows about its role target (the player, or a damaged ally for support). */
  enemyRoleTarget(e, { canSeePlayer, hasActiveAlert, spotted }) {
    const role = e.brain?.role;
    const usesSpotters = role === 'artillery' || role === 'ewar';
    const repairTarget = role === 'support' ? this.findRepairTarget(e) : null;
    const knows =
      canSeePlayer ||
      hasActiveAlert ||
      (usesSpotters && spotted) ||
      Boolean(repairTarget) ||
      Boolean(e.isBoss && !this.inSmoke);
    return { knows, usesSpotters, repairTarget };
  }

  /** Condition of a movement action (sim/behavior/actions.js) for this enemy right now. */
  isMoveActionAvailable(e, action, situation) {
    switch (action.id) {
      case 'move_to_player':
        return Boolean(e.brain) && situation.roleTarget.knows;
      case 'move_to_player_base':
        return Boolean(this.activeMapRules?.defeatOnBaseLoss && this.baseAlive);
      case 'defend_enemy_base': {
        const cell = this.enemyBaseCell();
        if (!cell) return false;
        const pos = this.gridToWorld(cell.row, cell.col);
        const trigger = (action.triggerCells ?? ACTION_TUNING.DEFEND_TRIGGER_CELLS) * TILE_SIZE;
        return Math.hypot(this.playerX - pos.x, this.playerZ - pos.z) <= trigger;
      }
      case 'move_to_zone':
        return Boolean(action.zone);
      case 'follow_route':
        return (e.campaignPatrolRoute?.length ?? 0) > (e.campaignPatrolIndex || 0);
      case 'patrol_zone':
        return true;
      case 'take_cover': {
        if (this.movePlanActive(e, action.id)) return true;
        if (!this.enemyThreatPos(situation)) return false;
        const afterHit = action.afterHitSec ?? ACTION_TUNING.COVER_AFTER_HIT_SEC;
        const lowHp = action.hpBelow !== undefined && e.hp / e.maxHp < action.hpBelow;
        return e.sinceHit <= afterHit || lowHp;
      }
      case 'ambush': {
        // Sprung: the player came close enough, the next action (usually move_to_player) takes over
        const trigger = (action.triggerCells ?? ACTION_TUNING.AMBUSH_TRIGGER_CELLS) * TILE_SIZE;
        if (situation.canSeePlayer && situation.distToPlayer <= trigger) return false;
        return this.movePlanActive(e, action.id) || Boolean(this.ambushAnchor(situation));
      }
      default:
        return false;
    }
  }

  /** The tank is still carrying out a movement order of this action. */
  movePlanActive(e, id) {
    const plan = e.movePlan;
    return Boolean(plan && plan.id === id && !plan.done && plan.timer > 0);
  }

  /** Where the enemy believes the player is (seen or remembered), or null. */
  enemyThreatPos(situation) {
    if (situation.canSeePlayer) return { x: this.playerX, z: this.playerZ };
    if (situation.hasActiveAlert) return { x: situation.navTargetX, z: situation.navTargetZ };
    return null;
  }

  /** Ambush anchor: the known player position, the spotted player, else the player HQ. */
  ambushAnchor(situation) {
    const threat = this.enemyThreatPos(situation);
    if (threat) return threat;
    if (situation.spotted && !this.inSmoke) return { x: this.playerX, z: this.playerZ };
    if (this.activeMapRules?.defeatOnBaseLoss && this.baseAlive) return this.getCommandBaseCenter();
    return null;
  }

  /** Best tactical cell (positions.js) around `target` for this tank, or null. */
  pickTacticalGoal(e, here, target, query) {
    const avoid = [];
    for (const ally of this.enemies) {
      if (ally !== e && ally.movePlan?.goal) avoid.push(ally.movePlan.goal);
    }
    const cells = findTacticalCells(this.grid, {
      ...query,
      self: here,
      target,
      avoid,
      canCrossWater: Boolean(e.stats.canCrossWater),
      noise: 0.6,
      random: e.behaviorRng ?? Math.random,
    });
    return cells[0] ? { row: cells[0].row, col: cells[0].col } : null;
  }

  /** Grid cell of the living enemy base, or null. */
  enemyBaseCell() {
    if (!this.enemyBaseAlive) return null;
    if (this._enemyBaseCell) {
      const cell = this.grid[this._enemyBaseCell.row]?.[this._enemyBaseCell.col];
      if (cell && cell.type === TileType.ENEMY_BASE && cell.hp > 0) return this._enemyBaseCell;
    }
    if (this.grid && this.grid.length > 0) {
      for (let r = 0; r < this.grid.length; r++) {
        const rowCells = this.grid[r];
        if (!rowCells) continue;
        for (let c = 0; c < rowCells.length; c++) {
          if (rowCells[c]?.type === TileType.ENEMY_BASE && rowCells[c].hp > 0) {
            this._enemyBaseCell = { row: r, col: c };
            return this._enemyBaseCell;
          }
        }
      }
    }
    return this.activeMapRules?.enemyBaseCell || null;
  }

  /** World centre of the Fortified Enemy Base, or null if dead/absent. */
  getEnemyBaseCenter() {
    const cell = this.enemyBaseCell();
    if (!cell) return null;
    return this.gridToWorld(cell.row, cell.col);
  }

  /**
   * Where a movement action wants the tank to go, before the dice roll.
   * `goal` is a cell for path-following orders; `zone` is the zone a failed roll must avoid.
   */
  intendedMoveGoal(e, action, here, situation) {
    const random = e.behaviorRng ?? Math.random;
    const canCross = Boolean(e.stats.canCrossWater);
    switch (action.id) {
      case 'move_to_player': {
        const threat = this.enemyThreatPos(situation);
        const pos = threat || (!this.inSmoke ? { x: this.playerX, z: this.playerZ } : { x: e.x, z: e.z });
        const target = this.worldToGrid(pos.x, pos.z);
        return { goal: null, zone: zoneOf(target.row, target.col) };
      }
      case 'move_to_player_base': {
        const baseCell = SECTORS[this.currentSectorIndex]?.baseCell || BASE_CELL;
        const center = { row: baseCell.row, col: baseCell.col + 0.5 };
        const goal = randomCellAround(this.grid, center, ACTION_TUNING.BASE_ATTACK_CELLS, random, canCross, (r, c) => {
          const p = this.gridToWorld(r, c);
          return this.canEngageCommandBase(p.x, p.z);
        });
        return { goal, zone: zoneOf(baseCell.row, baseCell.col), holdSec: Infinity };
      }
      case 'defend_enemy_base': {
        const cell = this.enemyBaseCell();
        const goal = cell ? randomCellAround(this.grid, cell, ACTION_TUNING.DEFEND_CELLS, random, canCross) : null;
        return { goal, zone: cell ? zoneOf(cell.row, cell.col) : null };
      }
      case 'move_to_zone':
        return { goal: randomCellInZone(this.grid, action.zone, random, canCross), zone: action.zone };
      case 'follow_route': {
        const goal = e.campaignPatrolRoute[e.campaignPatrolIndex || 0];
        return { goal, zone: zoneOf(goal.row, goal.col) };
      }
      case 'patrol_zone': {
        const home = action.zone ?? e.contractHomeZone ?? zoneOf(here.row, here.col);
        const zone = {
          row: Math.max(0, home.row + Math.floor(random() * 3) - 1),
          col: Math.max(0, home.col + Math.floor(random() * 3) - 1),
        };
        const goal =
          randomCellInZone(this.grid, zone, random, canCross) ??
          randomCellInZone(this.grid, home, random, canCross);
        return { goal, zone: home };
      }
      case 'take_cover': {
        const pos = this.enemyThreatPos(situation) ?? { x: this.playerX, z: this.playerZ };
        const threat = this.worldToGrid(pos.x, pos.z);
        const [minCells, maxCells] = ACTION_TUNING.COVER_CELLS;
        const goal = this.pickTacticalGoal(e, here, threat, {
          minCells,
          maxCells,
          los: false,
          coverWeight: 1.0,
          travelWeight: 0.45,
          maxTravel: ACTION_TUNING.COVER_MAX_TRAVEL,
        });
        const [lo, hi] = ACTION_TUNING.COVER_HOLD_SEC;
        return { goal, zone: zoneOf(here.row, here.col), holdSec: lo + random() * (hi - lo) };
      }
      case 'ambush': {
        const pos = this.ambushAnchor(situation);
        if (!pos) return { goal: null, zone: null };
        const anchor = this.worldToGrid(pos.x, pos.z);
        const [minCells, maxCells] = ACTION_TUNING.AMBUSH_CELLS;
        const goal = this.pickTacticalGoal(e, here, anchor, {
          minCells,
          maxCells,
          los: false,
          forestBonus: 1.5,
          coverWeight: 0.8,
          chokeWeight: 1.0,
          preferCells: this.playerTrail,
          preferWeight: 1.0,
          travelWeight: 0.2,
          maxTravel: ACTION_TUNING.AMBUSH_MAX_TRAVEL,
        });
        return { goal, zone: zoneOf(anchor.row, anchor.col), holdSec: Infinity };
      }
      default:
        return { goal: null, zone: null };
    }
  }

  /** Assigns a movement order: one dice roll against the action's luck. */
  assignMovePlan(e, action, situation) {
    const random = e.behaviorRng ?? Math.random;
    const here = this.worldToGrid(e.x, e.z);
    const intended = this.intendedMoveGoal(e, action, here, situation);
    const success = rollLuck(action.luck, random);
    const goal = success
      ? intended.goal
      : randomCellInOtherZone(
          this.grid,
          [intended.zone, zoneOf(here.row, here.col)],
          random,
          Boolean(e.stats.canCrossWater)
        );
    const [lo, hi] = success ? ACTION_TUNING.MOVE_PLAN_SEC : ACTION_TUNING.FAILED_MOVE_SEC;
    e.aiTimer = 0;
    return {
      id: action.id,
      success,
      goal,
      path: [],
      pathIdx: 0,
      timer: lo + random() * (hi - lo),
      // Seconds to stay once the goal is reached (Infinity: until the order expires)
      holdSec: success ? intended.holdSec : undefined,
      done: false,
    };
  }

  /**
   * Movement: take the first available movement action of the behavior; keep the order until
   * it ends, expires, or a higher-priority action becomes available, then roll again.
   */
  updateEnemyMovement(e, dt, elapsed, situation) {
    const action = selectAction(e.actions, ACTION_KIND.MOVE, (a) => this.isMoveActionAvailable(e, a, situation));
    let plan = e.movePlan;
    if (!action) {
      e.movePlan = null;
      if (e.brain && e.brain.tactic !== 'idle') resetBrain(e.brain);
      e.targetDirX = 0;
      e.targetDirZ = 0;
      return;
    }
    if (!plan || plan.id !== action.id || plan.done || plan.timer <= 0) {
      plan = e.movePlan = this.assignMovePlan(e, action, situation);
    }
    plan.timer -= dt;

    if (plan.success && plan.id === 'move_to_player') {
      this.stepEnemyBrain(e, dt, elapsed, situation);
      return;
    }
    if (e.brain && e.brain.tactic !== 'idle') resetBrain(e.brain);
    e.brainHolding = false;
    e.brainCharging = false;
    if (e.ai) e.ai.state = plan.success ? plan.id : 'wander';
    this.followMovePlan(e, plan, dt);
  }

  /** Drives a path-following movement order toward its goal cell. */
  followMovePlan(e, plan, dt) {
    if (!plan.goal) {
      // Nothing to drive to: hold here and re-roll soon
      plan.timer = Math.min(plan.timer, 1);
      e.targetDirX = 0;
      e.targetDirZ = 0;
      return;
    }
    const half = (GRID_SIZE * TILE_SIZE) / 2;
    const fx = (e.x + half) / TILE_SIZE;
    const fz = (e.z + half) / TILE_SIZE;
    const arrived =
      Math.hypot(fx - (plan.goal.col + 0.5), fz - (plan.goal.row + 0.5)) <= ACTION_TUNING.ARRIVE_CELLS;
    if (arrived) {
      if (plan.id === 'follow_route' && plan.success) {
        e.campaignPatrolIndex = (e.campaignPatrolIndex || 0) + 1;
      }
      // Firing positions, cover and ambush cells are held; other goals end the order
      if (plan.holdSec === undefined) plan.done = true;
      else if ((plan.holdSec -= dt) <= 0) plan.done = true;
      e.targetDirX = 0;
      e.targetDirZ = 0;
      return;
    }
    if (e.aiTimer <= 0 || plan.pathIdx >= plan.path.length) {
      e.aiTimer = 1.0;
      const from = { row: Math.floor(fz), col: Math.floor(fx) };
      const occupiedCells = new Set();
      for (const ally of this.enemies) {
        if (ally === e || ally.hp <= 0) continue;
        const ag = this.worldToGrid(ally.x, ally.z);
        occupiedCells.add(ag.row * GRID_SIZE + ag.col);
      }
      const opts = {
        canCrossWater: Boolean(e.stats.canCrossWater),
        occupiedCells,
        wideClearance: Boolean(e.isBoss),
        bossCrushable: Boolean(e.isBoss),
      };
      const path =
        findPath(this.grid, from, plan.goal, opts) ||
        (e.armed !== false ? findPath(this.grid, from, plan.goal, { ...opts, allowBreach: true }) : null);
      if (!path) {
        plan.done = true;
        return;
      }
      plan.path = path;
      plan.pathIdx = 0;
    }
    const wpTol = e.isBoss ? 0.55 : 0.3;
    while (plan.pathIdx < plan.path.length) {
      const wp = plan.path[plan.pathIdx];
      if (Math.hypot(fx - (wp.col + 0.5), fz - (wp.row + 0.5)) > wpTol) break;
      plan.pathIdx++;
    }
    this.steerEnemyToWaypoint(e, plan.path[plan.pathIdx] ?? plan.goal);
  }

  /** Steer toward a waypoint cell; a destructible wall on it becomes the breach target. */
  steerEnemyToWaypoint(e, waypoint) {
    const p = this.gridToWorld(waypoint.row, waypoint.col);
    const cell = this.grid[waypoint.row]?.[waypoint.col];
    const shouldBreach = e.isBoss
      ? cell?.type === TileType.CONCRETE
      : cell?.type === TileType.BOXES || cell?.type === TileType.BRICK || cell?.type === TileType.CONCRETE;
    if (cell && shouldBreach && cell.hp > 0) {
      e.breachTarget = { row: waypoint.row, col: waypoint.col, x: p.x, z: p.z };
      e.targetDirX = 0;
      e.targetDirZ = 0;
      return true;
    }
    if (e.isBoss) {
      const canCross = Boolean(e.stats?.canCrossWater);
      const hardL = isBossHardSolid(this.grid, waypoint.row, waypoint.col - 1, canCross);
      const hardR = isBossHardSolid(this.grid, waypoint.row, waypoint.col + 1, canCross);
      if (hardL && !hardR) p.x += TILE_SIZE * 0.35;
      else if (hardR && !hardL) p.x -= TILE_SIZE * 0.35;
      const hardU = isBossHardSolid(this.grid, waypoint.row - 1, waypoint.col, canCross);
      const hardD = isBossHardSolid(this.grid, waypoint.row + 1, waypoint.col, canCross);
      if (hardU && !hardD) p.z += TILE_SIZE * 0.35;
      else if (hardD && !hardU) p.z -= TILE_SIZE * 0.35;
    }
    const ang = Math.atan2(p.x - e.x, p.z - e.z);
    e.targetDirX = Math.sin(ang);
    e.targetDirZ = Math.cos(ang);
    return false;
  }

  /** Role brain (sim/behavior/brain.js) drives the tank during a successful move_to_player order. */
  stepEnemyBrain(e, dt, elapsed, { canSeePlayer, navTargetX, navTargetZ, spotted, roleTarget }) {
    const brain = e.brain;
    const { usesSpotters, repairTarget } = roleTarget;

    const half = (GRID_SIZE * TILE_SIZE) / 2;
    const fx = (e.x + half) / TILE_SIZE;
    const fz = (e.z + half) / TILE_SIZE;
    const live = canSeePlayer || (usesSpotters && spotted && !this.inSmoke);
    const hasTargetPos = live || navTargetX !== null;
    const tx = live ? this.playerX : navTargetX ?? e.x;
    const tz = live ? this.playerZ : navTargetZ ?? e.z;
    const target = this.worldToGrid(tx, tz);
    const replanDue = e.aiTimer <= 0;
    if (replanDue) e.aiTimer = this.enemyReplanDelay(e);

    const occupiedCells = new Set();
    const allyGoals = [];
    for (const ally of this.enemies) {
      if (ally !== e) {
        if (ally.brain?.goal) allyGoals.push(ally.brain.goal);
        const ag = this.worldToGrid(ally.x, ally.z);
        allyGoals.push(ag);
        occupiedCells.add(ag.row * GRID_SIZE + ag.col);
      }
    }
    const flankDir = {
      x: -Math.sin(this.playerHullAngle),
      z: -Math.cos(this.playerHullAngle),
    };

    const out = stepBrain(brain, {
      grid: this.grid,
      dt,
      replanDue,
      self: {
        row: Math.floor(fz),
        col: Math.floor(fx),
        fx,
        fz,
        canCrossWater: Boolean(e.stats.canCrossWater),
      },
      isBoss: Boolean(e.isBoss),
      target,
      visible: canSeePlayer,
      distCells: hasTargetPos ? Math.hypot(tx - e.x, tz - e.z) / TILE_SIZE : Infinity,
      hp: e.hp,
      maxHp: e.maxHp,
      flankDir,
      slotDir: this.squadFrame?.slots.get(e.id) ?? null,
      allyGoals,
      occupiedCells,
      playerTrail: this.playerTrail,
      mines: this.squadFrame?.mineCells ?? [],
      minesLeft: e.minesRemaining ?? 0,
      playerCanCrossWater: Boolean(this.playerStats?.canCrossWater),
      alliesEngaged: spotted,
      specialReady: e.specialCooldown <= 0,
      repairTarget,
      bossPhase2: Boolean(e.mammothEnraged || e.hydraEnraged || e.infernoEnraged || e.titanOverload),
    });

    if (e.ai) e.ai.state = out.tactic;
    e.brainCharging = out.direct && brain.role === 'hunter';
    if (out.direct) {
      let ang = Math.atan2(this.playerX - e.x, this.playerZ - e.z);
      if (brain.role === 'hunter') {
        ang += Math.sin(elapsed * Math.PI * 2.5 + e.id) * HUNTER_ZIGZAG_RAD;
        if (Math.floor(elapsed * 6) !== e.chargeBlinkTick) {
          e.chargeBlinkTick = Math.floor(elapsed * 6);
          if (e.chargeBlinkTick % 2 === 0) this.spawnSparks(e.x, 1.2, e.z, 0xef4444, 4);
        }
      }
      e.targetDirX = Math.sin(ang);
      e.targetDirZ = Math.cos(ang);
      e.brainHolding = false;
    } else if (out.waypoint) {
      e.brainHolding = this.steerEnemyToWaypoint(e, out.waypoint);
    } else {
      e.targetDirX = 0;
      e.targetDirZ = 0;
      e.brainHolding = true;
    }
    return true;
  }

  /** Boss role brains take their distance bands from the boss tuning in constants.js. */
  bossBrainOverrides(enemyClass) {
    if (enemyClass === EnemyClass.BOSS_HYDRA) {
      const sightCells = (SECTOR_BOSS_CONFIGS[enemyClass]?.base.sightRadius ?? 28) / TILE_SIZE;
      return {
        standoff: {
          ...ROLE_CONFIGS.cruiser.standoff,
          minCells: HYDRA.PREFERRED_MIN_CELLS,
          maxCells: Math.min(HYDRA.PREFERRED_MAX_CELLS, sightCells - 1),
        },
        pressCells: [HYDRA.SALVO_MIN_CELLS, HYDRA.PREFERRED_MIN_CELLS],
      };
    }
    if (enemyClass === EnemyClass.BOSS_TITAN) {
      return {
        hold: {
          ...ROLE_CONFIGS.fortress.hold,
          minCells: Math.max(1, TITAN.HOLD_DISTANCE_CELLS - 1),
          maxCells: TITAN.HOLD_DISTANCE_CELLS,
        },
      };
    }
    return null;
  }

  /** ENGINEER: the most damaged ally within reach, as a grid cell with its id. */
  findRepairTarget(e) {
    let best = null;
    let bestRatio = 0.8;
    for (const ally of this.enemies) {
      if (ally === e || ally.hp <= 0) continue;
      const ratio = ally.hp / Math.max(1, ally.maxHp);
      if (ratio >= bestRatio) continue;
      if (Math.hypot(ally.x - e.x, ally.z - e.z) > 14 * TILE_SIZE) continue;
      bestRatio = ratio;
      best = ally;
    }
    if (!best) return null;
    return { id: best.id, ...this.worldToGrid(best.x, best.z) };
  }

  /** Squad Director tick (sim/behavior/squad.js): player trail, bearing slots and. */
  updateSquadDirector(dt, spottedLastFrame) {
    const sector = SECTORS[this.currentSectorIndex];
    if (!this.squadDirector) {
      this.squadDirector = createSquadDirector({ maxAttackers: sector?.maxAttackers });
    }
    if (!this.playerTrail) this.playerTrail = [];
    const cell = this.worldToGrid(this.playerX, this.playerZ);
    const last = this.playerTrail.at(-1);
    if (!last || last.row !== cell.row || last.col !== cell.col) {
      this.playerTrail.push(cell);
      if (this.playerTrail.length > 30) this.playerTrail.shift();
    }

    const slotUnits = [];
    const candidates = [];
    for (const e of this.enemies) {
      const role = e.brain?.role;
      if (e.brain && e.brain.tactic !== 'idle' && !['artillery', 'ewar', 'support', 'sniper'].includes(role)) {
        slotUnits.push(e);
      }
      if (e.isBoss || e.armed === false) continue;
      const artilleryFed = role === 'artillery' && spottedLastFrame;
      if (e.hasDetectedPlayer || artilleryFed) {
        candidates.push({ id: e.id, priority: -Math.hypot(e.x - this.playerX, e.z - this.playerZ) });
      }
    }
    this.attackTokens = updateAttackTokens(this.squadDirector, candidates, dt);
    this.squadFrame = {
      slots: assignBearingSlots(slotUnits, { x: this.playerX, z: this.playerZ }),
      mineCells: this.mines.map((m) => this.worldToGrid(m.x, m.z)),
    };
  }

  /** F3 AI telemetry overlay: a floating label per enemy (role, tactic, Luck, attack. */
  updateAiDebugOverlay() {
    if (!this.aiDebugMode) {
      if (this.aiDebugEntries) this.clearAiDebugOverlay();
      return;
    }
    if (!this.aiDebugGroup) {
      this.aiDebugGroup = new THREE.Group();
      this.scene.add(this.aiDebugGroup);
      this.aiDebugEntries = new Map();
    }
    const alive = new Set();
    const half = (GRID_SIZE * TILE_SIZE) / 2;
    for (const e of this.enemies) {
      alive.add(e.id);
      let entry = this.aiDebugEntries.get(e.id);
      if (!entry) entry = this.createAiDebugEntry(e);

      const brain = e.brain;
      const token = this.attackTokens?.has(e.id) ? ' FIRE' : '';
      const actions = this.enemyActionSummary(e);
      const text = `${(brain?.role ?? '-').toUpperCase()} · ${(e.ai?.state ?? '-').toUpperCase()}${token}|${actions.move} · ${actions.shot}`;
      if (text !== entry.text) this.drawAiDebugLabel(entry, text, Boolean(token));
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
        pos.setXYZ(n++, this.playerX, 0.25, this.playerZ);
      }
      pos.needsUpdate = true;
      entry.line.geometry.setDrawRange(0, n);
      entry.line.visible = n > 1;
    }
    for (const [id, entry] of this.aiDebugEntries) {
      if (!alive.has(id)) {
        this.disposeAiDebugEntry(entry);
        this.aiDebugEntries.delete(id);
      }
    }
  }

  createAiDebugEntry(e) {
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
    this.aiDebugGroup.add(sprite, line);
    const entry = { canvas, texture, sprite, line, text: '' };
    this.aiDebugEntries.set(e.id, entry);
    return entry;
  }

  /** Current movement order and shot with their dice results, for the F3 overlay and HUD. */
  enemyActionSummary(e) {
    const plan = e.movePlan;
    const shot = e.gunner?.shot;
    return {
      move: plan ? `${plan.id.toUpperCase()} ${plan.success ? 'OK' : 'FAIL'}` : 'HOLD',
      shot: shot ? `${shot.actionId.toUpperCase()} ${shot.hit ? 'HIT' : 'MISS'}` : 'NO SHOT',
    };
  }

  drawAiDebugLabel(entry, text, hasToken) {
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

  disposeAiDebugEntry(entry) {
    this.aiDebugGroup?.remove(entry.sprite, entry.line);
    entry.texture.dispose();
    entry.sprite.material.dispose();
    entry.line.geometry.dispose();
    entry.line.material.dispose();
  }

  clearAiDebugOverlay() {
    if (this.aiDebugEntries) {
      for (const entry of this.aiDebugEntries.values()) this.disposeAiDebugEntry(entry);
    }
    if (this.aiDebugGroup) this.scene?.remove(this.aiDebugGroup);
    this.aiDebugGroup = null;
    this.aiDebugEntries = null;
  }

  /** SAPPER on patrol: only mine cells the player has actually driven through. */
  isOnPlayerTrail(e) {
    const cell = this.worldToGrid(e.x, e.z);
    return (this.playerTrail || []).some(
      (t) => Math.abs(t.row - cell.row) + Math.abs(t.col - cell.col) <= 1
    );
  }

  /** Attack token check: bosses always fire; everyone else waits for a free token. */
  hasAttackToken(e) {
    return e.isBoss || !this.attackTokens || this.attackTokens.has(e.id);
  }

  /** Updates recoil, barrel elevation, muzzle flash fade, and turret pivot positions/rotations. */
  syncEnemyTurretVisuals(e, dt) {
    if (e.turrets?.length) {
      for (const t of e.turrets) {
        const slot = t.slot;
        t.recoil = THREE.MathUtils.damp(t.recoil || 0, 0, 12, dt);
        if (slot.barrelPivot) {
          slot.barrelPivot.position.z = (slot.baseBarrelZ ?? (e.isBoss ? 0.68 : 0.46)) - t.recoil;
          t.gunElevation = THREE.MathUtils.damp(
            t.gunElevation || 0,
            deckClearance(slot, t.angle - e.hullAngle),
            10,
            dt
          );
          slot.barrelPivot.rotation.x = -t.gunElevation;
        }
        if (t.flashTimer > 0) {
          t.flashTimer -= dt;
          if (slot.muzzleFlash) slot.muzzleFlash.material.opacity = 0;
        }
        if (slot.turret) {
          const pz = slot.pivotZ || 0;
          slot.turret.position.set(
            Math.sin(e.hullAngle) * pz,
            slot.turretY ?? slot.turret.position.y,
            Math.cos(e.hullAngle) * pz
          );
          slot.turret.rotation.y = t.angle;
        }
      }
      e.turretAngle = e.turrets[0].angle;
      e.recoil = e.turrets[0].recoil;
      return;
    }

    e.recoil = THREE.MathUtils.damp(e.recoil, 0, 12, dt);
    e.rig.barrelPivot.position.z = (e.isBoss ? 0.68 : 0.46) - e.recoil;
    e.gunElevation = THREE.MathUtils.damp(
      e.gunElevation || 0,
      deckClearance(e.rig, e.turretAngle - e.hullAngle),
      10,
      dt
    );
    e.rig.barrelPivot.rotation.x = -e.gunElevation;
    if (e.flashTimer > 0) {
      e.flashTimer -= dt;
      e.rig.muzzleFlash.material.opacity = 0;
    }
    e.rig.turret.rotation.y = e.turretAngle;
  }

  /** Finds a clear escape direction (preferring inward / sidesteps over backing into borders or allies). */
  pickEscapeDirection(e, radius) {
    const rawX = e.targetDirX || Math.sin(e.hullAngle);
    const rawZ = e.targetDirZ || Math.cos(e.hullAngle);
    const len = Math.hypot(rawX, rawZ) || 1;
    const hx = rawX / len;
    const hz = rawZ / len;
    const sign = e.id % 2 === 0 ? 1 : -1;
    const halfArena = (GRID_SIZE * TILE_SIZE) / 2;
    const candidates = [
      { x: -hz * sign, z: hx * sign },
      { x: hz * sign, z: -hx * sign },
    ];
    // When hugging a border or corner, prioritize moving inward toward the arena interior
    const nearEdgeX = Math.abs(e.x) > halfArena - 4.0;
    const nearEdgeZ = Math.abs(e.z) > halfArena - 4.0;
    if (nearEdgeX || nearEdgeZ) {
      const inX = nearEdgeX ? -Math.sign(e.x) : 0;
      const inZ = nearEdgeZ ? -Math.sign(e.z) : 0;
      const inLen = Math.hypot(inX, inZ) || 1;
      candidates.unshift({ x: inX / inLen, z: inZ / inLen });
    }
    candidates.push({ x: -hx, z: -hz });

    const probeDist = radius + 0.5;
    for (const dir of candidates) {
      const midX = e.x + dir.x * (probeDist * 0.5);
      const midZ = e.z + dir.z * (probeDist * 0.5);
      const farX = e.x + dir.x * probeDist;
      const farZ = e.z + dir.z * probeDist;
      if (
        !this.checkTankWallCollision(midX, midZ, radius, e.stats.canCrossWater) &&
        !this.checkTankEnemyCollision(e, midX, midZ, radius) &&
        !this.checkTankWallCollision(farX, farZ, radius, e.stats.canCrossWater) &&
        !this.checkTankEnemyCollision(e, farX, farZ, radius)
      ) {
        return dir;
      }
    }
    return null;
  }

  updateEnemies(dt, elapsed) {
    const empStunned = this.empTimer > 0;
    const spottedLastFrame = Boolean(this.playerSpottedByEnemies);
    this.playerSpottedByEnemies = false;
    this.updateSquadDirector(dt, spottedLastFrame);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.phaseShieldTimer > 0) {
        e.phaseShieldTimer = Math.max(0, e.phaseShieldTimer - dt);
        this.syncBossPhaseShieldVisual(e, elapsed);
      } else if (e.phaseShieldMesh?.visible) {
        e.phaseShieldMesh.visible = false;
      }

      if (empStunned) {
        if (Math.random() < 0.12) {
          this.spawnSparks(e.x, 0.9, e.z, 0x06b6d4, 2);
        }
        continue;
      }

      e.aiTimer -= dt;
      e.fireCooldown -= dt;
      e.specialCooldown -= dt;
      if (e.apsRearmTimer > 0) e.apsRearmTimer = Math.max(0, e.apsRearmTimer - dt);
      if (e.isBoss && e.apsCharges < e.apsMaxCharges) {
        e.apsRechargeTimer -= dt;
        if (e.apsRechargeTimer <= 0) {
          e.apsCharges += 1;
          e.apsRechargeTimer = BOSS_APS.RECHARGE_SEC;
        }
      }
      if (e.randomShotTimer > 0) e.randomShotTimer -= dt;
      if (e.turrets?.length) {
        for (const t of e.turrets) {
          t.fireCooldown -= dt;
          if (t.randomShotTimer > 0) t.randomShotTimer -= dt;
        }
      }
      if (e.enemyClass === EnemyClass.BOSS_HYDRA) {
        e.hydraMissileCooldown -= dt;
        if (e.hydraFlameCooldown > 0) e.hydraFlameCooldown = Math.max(0, e.hydraFlameCooldown - dt);
      } else if (e.enemyClass === EnemyClass.BOSS_MAMMOTH) {
        e.mammothMissileCooldown -= dt;
      } else if (e.enemyClass === EnemyClass.BOSS_INFERNO) {
        e.infernoMissileCooldown -= dt;
        if (e.infernoDashCooldown > 0 && !(e.infernoDashWindup > 0) && !(e.infernoDashTimer > 0)) {
          e.infernoDashCooldown -= dt;
        }
      }
      if (e.stealthRevealTimer > 0) e.stealthRevealTimer -= dt;
      if (e.radioCooldown > 0) e.radioCooldown -= dt;
      if (e.alertTimer > 0) {
        e.alertTimer -= dt;
        if (e.alertTimer <= 0) {
          e.alertTimer = 0;
          e.alertTarget = null;
          if (e.ai && !e.hasDetectedPlayer) {
            e.ai.state = 'patrol';
          }
        }
      }

      if (e.rig.radarDish) {
        e.rig.radarDish.rotation.y = elapsed * 3.5;
      }

      const toPlayerX = this.playerX - e.x;
      const toPlayerZ = this.playerZ - e.z;
      const distToPlayer = Math.hypot(toPlayerX, toPlayerZ);

      const baseSightRadius =
        e.sightRadius ?? ENEMY_VISIBILITY.DEFAULT_SIGHT_RADIUS;
      const effectiveSightRadius = this.inForest
        ? Math.min(baseSightRadius, ENEMY_VISIBILITY.FOREST_SIGHT_RADIUS)
        : baseSightRadius;

      const canSeePlayer =
        !this.inSmoke &&
        distToPlayer <= effectiveSightRadius &&
        this.hasLineOfSight(e.x, e.z, this.playerX, this.playerZ);

      if (canSeePlayer) {
        const newlySpotted = !e.hasDetectedPlayer;
        e.hasDetectedPlayer = true;
        this.playerSpottedByEnemies = true;
        e.alertTarget = { x: this.playerX, z: this.playerZ };
        e.alertTimer =
          ENEMY_VISIBILITY.MEMORY_DURATION_SEC;
        if (e.ai) {
          e.ai.state = 'engage';
          e.ai.lastKnownTargetPos = { x: this.playerX, z: this.playerZ };
        }
        if (newlySpotted || e.radioCooldown <= 0) {
          this.broadcastPlayerLocationFrom(e, this.playerX, this.playerZ);
        }
      } else {
        e.hasDetectedPlayer = false;
        if (e.alertTarget && e.alertTimer > 0) {
          const distToAlert = Math.hypot(
            e.alertTarget.x - e.x,
            e.alertTarget.z - e.z
          );
          if (distToAlert <= ENEMY_VISIBILITY.ALERT_ARRIVAL_RADIUS) {
            e.alertTarget = null;
            e.alertTimer = 0;
            if (e.ai) e.ai.state = 'patrol';
          }
        }
      }

      const hasActiveAlert = Boolean(e.alertTarget && e.alertTimer > 0);
      const navTargetX = canSeePlayer
        ? this.playerX
        : hasActiveAlert
        ? e.alertTarget.x
        : e.isBoss && !this.inSmoke
        ? this.playerX
        : null;
      const navTargetZ = canSeePlayer
        ? this.playerZ
        : hasActiveAlert
        ? e.alertTarget.z
        : e.isBoss && !this.inSmoke
        ? this.playerZ
        : null;

      if (e.enemyClass === EnemyClass.STEALTH && e.rig.stealthMaterials) {
        const revealed = distToPlayer < 6.2 || e.stealthRevealTimer > 0;
        const moving = Math.hypot(e.targetDirX, e.targetDirZ) > 0.05;
        const targetOpacity = revealed ? 0.96 : moving ? 0.3 : 0.12;
        for (const mat of e.rig.stealthMaterials) {
          mat.opacity = THREE.MathUtils.damp(mat.opacity, targetOpacity, 8, dt);
        }
        if (e.rig.hpBarBg && e.rig.hpBarFill) {
          e.rig.hpBarBg.visible = revealed;
          e.rig.hpBarFill.visible = revealed;
        }
      }

      if (inContactRange(e, distToPlayer) && this.spendContactEnemy(e)) continue;

      // Seconds since the last hit (take_cover)
      e.sinceHit = e.prevHp !== undefined && e.hp < e.prevHp ? 0 : (e.sinceHit ?? Infinity) + dt;
      e.prevHp = e.hp;

      const halfArena = (GRID_SIZE * TILE_SIZE) / 2;
      const arenaInset = e.isBoss ? 1.25 : 1.0;
      const isInsideArena = (x, z) =>
        Math.abs(x) <= halfArena - arenaInset && Math.abs(z) <= halfArena - arenaInset;

      // Cross the out-of-bounds entry strip while keeping turret & gunnery combat-ready
      if (e.entryTarget) {
        const toTgtX = e.entryTarget.x - e.x;
        const toTgtZ = e.entryTarget.z - e.z;
        const distToTgt = Math.hypot(toTgtX, toTgtZ);
        if (isInsideArena(e.x, e.z) || distToTgt <= 0.05) {
          e.entryTarget = null;
        } else {
          e.targetDirX = toTgtX / distToTgt;
          e.targetDirZ = toTgtZ / distToTgt;
          const desiredAngle = Math.atan2(e.targetDirX, e.targetDirZ);
          e.hullAngle = this.lerpAngle(e.hullAngle, desiredAngle, 10 * dt);
          const worldSpeed = Math.max(2.4, e.stats.moveSpeed * TILE_SIZE);
          const entryRadius = e.isBoss ? 1.12 : 0.72;
          const nextEntryX = e.x + e.targetDirX * worldSpeed * dt;
          const nextEntryZ = e.z + e.targetDirZ * worldSpeed * dt;
          if (!this.checkTankEnemyCollision(e, nextEntryX, e.z, entryRadius)) {
            e.x = nextEntryX;
          }
          if (!this.checkTankEnemyCollision(e, e.x, nextEntryZ, entryRadius)) {
            e.z = nextEntryZ;
          }
          if (isInsideArena(e.x, e.z)) {
            e.entryTarget = null;
          }
        }
      }

      if (!e.entryTarget) {
        const entrySafeRadius = e.isBoss ? 1.12 : 0.72;
        const maxBound = halfArena - entrySafeRadius - 0.02;
        if (Math.abs(e.x) > maxBound) e.x = Math.sign(e.x) * maxBound;
        if (Math.abs(e.z) > maxBound) e.z = Math.sign(e.z) * maxBound;
        const roleTarget = this.enemyRoleTarget(e, { canSeePlayer, hasActiveAlert, spotted: spottedLastFrame });
        this.updateEnemyMovement(e, dt, elapsed, {
          canSeePlayer,
          hasActiveAlert,
          navTargetX,
          navTargetZ,
          spotted: spottedLastFrame,
          distToPlayer,
          roleTarget,
        });

        let dashSpeedMult = 1.0;
        if (e.enemyClass === EnemyClass.BOSS_INFERNO) {
          dashSpeedMult = this.updateInfernoDash(e, dt, {
            canSeePlayer,
            toPlayerX,
            toPlayerZ,
            distToPlayer,
          });
        }

        const hpRatio = e.hp / e.maxHp;
        const lowSpeedMult =
          !e.isBoss && hpRatio < DURABILITY.LOW_RATIO ? DURABILITY.LOW_SPEED_MULT : 1.0;
        const { row: eRow, col: eCol } = this.worldToGrid(e.x, e.z);
        const eCell = this.grid[eRow]?.[eCol];
        const eOnSand = eCell?.type === TileType.SAND && !e.stats.canHover && !e.stats.allTerrain;
        const sandSpeedMult = eOnSand ? 0.78 : 1.0;
        const worldSpeed = e.stats.moveSpeed * TILE_SIZE * lowSpeedMult * sandSpeedMult * dashSpeedMult;

        if (e.yieldTimer > 0) {
          e.yieldTimer -= dt;
          if (e.yieldDirX !== undefined && e.yieldDirZ !== undefined) {
            e.targetDirX = e.yieldDirX;
            e.targetDirZ = e.yieldDirZ;
          }
        }

        const startX = e.x;
        const startZ = e.z;
        const radius = e.isBoss ? 1.12 : 0.72;
        const nextX = e.x + e.targetDirX * worldSpeed * dt;
        const nextZ = e.z + e.targetDirZ * worldSpeed * dt;
        const isTryingToMove = Math.hypot(e.targetDirX, e.targetDirZ) > 0.1;

        if (e.isBoss && isTryingToMove) {
          this.crushBossObstacles(nextX, e.z, radius);
        }
        let blocked = false;
        if (
          !this.checkTankWallCollision(nextX, e.z, radius, e.stats.canCrossWater) &&
          !this.checkTankEnemyCollision(e, nextX, e.z, radius) &&
          Math.hypot(nextX - this.playerX, e.z - this.playerZ) > radius + 0.72
        ) {
          e.x = nextX;
        } else {
          blocked = true;
        }

        if (e.isBoss && isTryingToMove) {
          this.crushBossObstacles(e.x, nextZ, radius);
        }
        if (
          !this.checkTankWallCollision(e.x, nextZ, radius, e.stats.canCrossWater) &&
          !this.checkTankEnemyCollision(e, e.x, nextZ, radius) &&
          Math.hypot(e.x - this.playerX, nextZ - this.playerZ) > radius + 0.72
        ) {
          e.z = nextZ;
        } else {
          blocked = true;
        }

        const distMoved = Math.hypot(e.x - startX, e.z - startZ);

        if (isTryingToMove && distMoved < 0.2 * dt * worldSpeed) {
          if (e.yieldTimer > 0) {
            e.yieldTimer = 0;
            e.aiTimer = 0;
          }
          e.stuckTimer = (e.stuckTimer || 0) + dt;
          // An unarmed rammer that sees the player keeps its charge heading instead of re-planning.
          if (e.armed !== false || !canSeePlayer) {
            e.aiTimer = 0;
          }

          // 1. Check if blocked by a destructible wall directly ahead:
          if (e.stuckTimer > 0.35 && !e.breachTarget) {
            const checkDist = radius + 0.85;
            const aheadX = e.x + (e.targetDirX || Math.sin(e.hullAngle)) * checkDist;
            const aheadZ = e.z + (e.targetDirZ || Math.cos(e.hullAngle)) * checkDist;
            const aheadGrid = this.worldToGrid(aheadX, aheadZ);
            const aheadCell = this.grid[aheadGrid.row]?.[aheadGrid.col];
            if (
              aheadCell &&
              (aheadCell.type === TileType.BOXES || aheadCell.type === TileType.BRICK || aheadCell.type === TileType.CONCRETE) &&
              aheadCell.hp > 0
            ) {
              const cellCenter = this.gridToWorld(aheadGrid.row, aheadGrid.col);
              e.breachTarget = {
                row: aheadGrid.row,
                col: aheadGrid.col,
                x: cellCenter.x,
                z: cellCenter.z,
              };
              e.targetDirX = 0;
              e.targetDirZ = 0;
              e.stuckTimer = 0;
            }
          }

          // 2. Check if jammed with an ally or corner/border:
          if (e.stuckTimer > 0.55 && (e.yieldTimer || 0) <= 0) {
            const aheadDist = radius + 1.2;
            const aheadX = e.x + (e.targetDirX || Math.sin(e.hullAngle)) * aheadDist;
            const aheadZ = e.z + (e.targetDirZ || Math.cos(e.hullAngle)) * aheadDist;
            let blockingAlly = null;
            let minAllyDist = Infinity;
            for (const ally of this.enemies) {
              if (ally === e || ally.hp <= 0) continue;
              const d = Math.hypot(ally.x - aheadX, ally.z - aheadZ);
              if (d < 1.4 && d < minAllyDist) {
                minAllyDist = d;
                blockingAlly = ally;
              }
            }

            const canYield =
              !blockingAlly ||
              (!e.isBoss &&
                (blockingAlly.isBoss || (e.id > blockingAlly.id && (blockingAlly.yieldTimer || 0) <= 0)));
            const escape = canYield ? this.pickEscapeDirection(e, radius) : null;
            if (escape) {
              e.yieldTimer = blockingAlly ? 0.9 + (e.id % 3) * 0.2 : 0.6;
              e.yieldDirX = escape.x;
              e.yieldDirZ = escape.z;
              e.targetDirX = escape.x;
              e.targetDirZ = escape.z;
            }
            if (e.movePlan?.path) {
              e.movePlan.pathIdx = e.movePlan.path.length;
            }
            e.aiTimer = 0;
            e.stuckTimer = 0;
          }
        } else {
          e.stuckTimer = Math.max(0, (e.stuckTimer || 0) - dt * 2);
        }

        if (e.enemyClass === EnemyClass.BOSS_TITAN && canSeePlayer) {
          const turnRate = e.titanOverload ? TITAN.HULL_TURN_RATE_OVERLOAD : TITAN.HULL_TURN_RATE;
          const bearingToPlayer = Math.atan2(toPlayerX, toPlayerZ);
          // Angle the hull ~20 deg inside the frontal Aegis cone so both front and rear turrets unmask past the central citadel
          const angleSign = normalizeAngleSigned(e.hullAngle - bearingToPlayer) >= 0 ? 1 : -1;
          const dreadnoughtHeading = bearingToPlayer + angleSign * 0.34;
          e.hullAngle = this.lerpAngle(e.hullAngle, dreadnoughtHeading, turnRate * dt);
        } else if (Math.hypot(e.targetDirX, e.targetDirZ) > 0.05) {
          const desiredHull = Math.atan2(e.targetDirX, e.targetDirZ);
          e.hullAngle = this.lerpAngle(e.hullAngle, desiredHull, 8 * dt);
        } else if (e.brainHolding && canSeePlayer) {
          e.hullAngle = this.lerpAngle(e.hullAngle, Math.atan2(toPlayerX, toPlayerZ), 3 * dt);
        }
      }

      // Special slot & gunnery remain active even while crossing the border onto the arena.
      const brainActive = Boolean(!e.entryTarget && e.brain && e.brain.tactic !== 'idle');
      updateAbilities(e, this, { brainActive, canSeePlayer });

      this.updateEnemyGunnery(e, dt, {
        canSeePlayer,
        hasActiveAlert,
        navTargetX,
        navTargetZ,
        spotted: spottedLastFrame,
        distToPlayer,
        toPlayerX,
        toPlayerZ,
      });

      const enemyHoverY = e.stats.canHover
        ? 0.05 + Math.sin(elapsed * 4.0 + e.id) * 0.012
        : 0;
      e.rig.root.position.set(e.x, enemyHoverY, e.z);
      e.rig.hull.rotation.y = e.hullAngle;
      this.driveGear(e.rig, e, e.x, e.z, e.hullAngle);
      this.syncEnemyTurretVisuals(e, dt);

      if (e.rig.hpBarFill) {
        const ratio = Math.max(0.01, e.hp / e.maxHp);
        e.rig.hpBarFill.scale.x = ratio;
      }
    }

    this.resolveEnemyCollisions();
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      e.rig.root.position.x = e.x;
      e.rig.root.position.z = e.z;
    }

    this.updateAiDebugOverlay();
  }

  plantMineAt(x, z) {
    const mesh = this.modelFactory.createLandMineMesh();
    mesh.position.set(x, 0, z);
    this.entityGroup.add(mesh);
    sound.playMinePlant();

    this.mines.push({
      id: this.nextEnemyId++,
      x,
      z,
      armTimer: LAND_MINE.ARM_SEC,
      life: LAND_MINE.LIFE_SEC,
      damage: LAND_MINE.DAMAGE,
      mesh,
    });
  }

  updateMines(dt, elapsed) {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      if (!m) continue;
      if (m.armTimer > 0) m.armTimer -= dt;
      m.life -= dt;

      m.mesh.rotation.y = elapsed * 1.5;

      if (m.life <= 0) {
        this.entityGroup.remove(m.mesh);
        this.mines.splice(i, 1);
        continue;
      }

      if (
        m.armTimer <= 0 &&
        Math.hypot(this.playerX - m.x, this.playerZ - m.z) <= LAND_MINE.TRIGGER_RADIUS
      ) {
        this.detonateMine(i);
        i = Math.min(i, this.mines.length);
      }
    }
  }

  detonateMine(index) {
    const m = this.mines[index];
    if (!m) return;
    this.entityGroup.remove(m.mesh);
    this.mines.splice(index, 1);
    const blastRadius = LAND_MINE.BLAST_RADIUS_CELLS * TILE_SIZE;
    this.fx?.shockwave?.(m.x, 0.1, m.z, 0.35, blastRadius, 0xff5a14, 0.48);
    this.detonateExplosionAt(
      m.x,
      m.z,
      blastRadius,
      m.damage ?? LAND_MINE.DAMAGE,
      false,
      null,
      true,
      LAND_MINE.PENETRATION
    );
    // Chain-detonate adjacent mines caught in the blast.
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const other = this.mines[i];
      if (!other) continue;
      if (Math.hypot(other.x - m.x, other.z - m.z) <= blastRadius * 0.85) {
        this.detonateMine(i);
        i = Math.min(i, this.mines.length);
      }
    }
  }

  /**
   * A contact ability (e.g. the KAMIKAZE warhead) went off. The tank is spent: it leaves the
   * battlefield without a kill reward. Returns false when the ability chose not to trigger.
   */
  spendContactEnemy(e) {
    if (!e.contactAbility?.onContact(e, this)) return false;
    this.clearInfernoDashBeam(e);
    this.sensorContacts.delete(e.id);
    if (this.priorityTargetId === e.id) this.priorityTargetId = null;
    this.checkAndIgniteForestOnEnemyKill(e);
    this.entityGroup.remove(e.rig.root);
    const index = this.enemies.indexOf(e);
    if (index >= 0) this.enemies.splice(index, 1);
    return true;
  }

  /** Indirect-fire range check: between ARTILLERY.MIN_RANGE and `maxCells` from the tank. */
  inArtilleryRange(e, x, z, maxCells) {
    const d = Math.hypot(x - e.x, z - e.z);
    return d >= ARTILLERY.MIN_RANGE * TILE_SIZE && d <= maxCells * TILE_SIZE;
  }

  clampToArena(point) {
    const limit = (GRID_SIZE * TILE_SIZE) / 2 - 2;
    return {
      x: THREE.MathUtils.clamp(point.x, -limit, limit),
      z: THREE.MathUtils.clamp(point.z, -limit, limit),
    };
  }

  /** Target of one shoot action (sim/behavior/actions.js), or null when its condition fails. */
  enemyShotTarget(e, action, s, turretState = null) {
    const indirect = e.enemyClass === EnemyClass.ARTILLERY;
    const small = TILE_SIZE * 0.5;
    const state = turretState || e;
    switch (action.id) {
      case 'shoot_player': {
        const player = { x: this.playerX, z: this.playerZ };
        if (s.canSeePlayer) {
          if (indirect && !this.inArtilleryRange(e, player.x, player.z, ARTILLERY.MAX_RANGE)) return null;
          return { kind: 'player', key: 'player', target: player, radius: TANK_HIT_RADIUS.PLAYER, react: true };
        }
        // Indirect fire also works on spotter data or on the remembered position
        if (!indirect) return null;
        const pos = s.spotted && !this.inSmoke ? player : s.hasActiveAlert ? { x: s.navTargetX, z: s.navTargetZ } : null;
        if (!pos || !this.inArtilleryRange(e, pos.x, pos.z, ARTILLERY.MAX_RANGE)) return null;
        return { kind: 'player', key: 'player', target: pos, radius: TANK_HIT_RADIUS.PLAYER, react: false };
      }
      case 'shoot_player_base': {
        if (!(this.activeMapRules?.defeatOnBaseLoss && this.baseAlive)) return null;
        const base = this.getCommandBaseCenter();
        const inRange = indirect
          ? this.inArtilleryRange(e, base.x, base.z, ARTILLERY.BASE_MAX_RANGE)
          : this.canEngageCommandBase(e.x, e.z);
        if (!inRange) return null;
        return { kind: 'base', key: 'base', target: base, radius: TILE_SIZE, react: false };
      }
      case 'shoot_obstacle': {
        const b = e.breachTarget;
        if (!b) return null;
        return { kind: 'breach', key: `breach:${b.row},${b.col}`, target: b, radius: small, react: false };
      }
      case 'shoot_random': {
        if (!state.randomShotTarget) {
          if (state.randomShotTimer > 0 || state.fireCooldown > 0) return null;
          state.randomShotTarget = this.findRandomTerrainTarget(e);
          if (!state.randomShotTarget) {
            state.randomShotTimer = 3.5 + Math.random() * 4.0;
            return null;
          }
        }
        const t = state.randomShotTarget;
        return { kind: 'terrain', key: `terrain:${t.x},${t.z}`, target: t, radius: small, react: false };
      }
      default:
        return null;
    }
  }

  /**
   * Gunnery: take the first shoot action of the behavior whose target is present, roll its luck
   * once per shot (hit = exact aim, miss = deliberate miss), aim and fire.
   */
  updateEnemyGunnery(e, dt, s) {
    if (e.breachTarget) {
      const cell = this.grid[e.breachTarget.row]?.[e.breachTarget.col];
      const solid =
        cell &&
        cell.hp > 0 &&
        (cell.type === TileType.BOXES || cell.type === TileType.BRICK || cell.type === TileType.CONCRETE);
      if (!solid) e.breachTarget = null;
    }
    if (e.armed === false) {
      e.breachTarget = null;
      e.turretAngle = this.lerpAngle(e.turretAngle, e.hullAngle, 4 * dt);
      return;
    }
    this.updateBossSecondaryWeapons(e, dt, s);

    if (e.turrets?.length > 1) {
      this.updateMultiTurretGunnery(e, dt, s);
      return;
    }

    let action = null;
    let shot = null;
    for (const a of e.actions) {
      if (a.kind !== ACTION_KIND.SHOOT) continue;
      shot = this.enemyShotTarget(e, a, s);
      if (shot) {
        action = a;
        break;
      }
    }
    if (!action) {
      stepGunner(e.gunner, { dt, shooter: e, target: null, visible: false });
      e.indirectAim = null;
      const look = s.hasActiveAlert
        ? Math.atan2(s.navTargetX - e.x, s.navTargetZ - e.z)
        : e.hullAngle;
      e.turretAngle = this.lerpAngle(e.turretAngle, look, 4.5 * dt);
      return;
    }

    if (!shotArmedFor(e.gunner, action.id, shot.key)) {
      armShot(e.gunner, action.id, shot.key, rollLuck(action.luck, e.behaviorRng ?? Math.random));
    }
    const aim = stepGunner(e.gunner, {
      dt,
      shooter: { x: e.x, z: e.z, turretAngle: e.turretAngle },
      target: shot.target,
      targetKey: shot.key,
      visible: true,
      targetRadius: shot.radius,
      react: shot.react,
    });

    if (e.enemyClass === EnemyClass.ARTILLERY) {
      this.updateIndirectFire(e, dt, shot, aim);
    } else {
      this.updateDirectFire(e, dt, shot, aim, s);
    }
    // A harassing shot is spent once the gun has fired at it
    if (shot.kind === 'terrain' && !e.gunner.shot) {
      e.randomShotTarget = null;
      e.randomShotTimer = 8.0 + Math.random() * 12.0;
    }
  }

  /**
   * Independent dual-turret gunnery (e.g. SUPREME DREADNOUGHT / BOSS_TITAN): each turret
   * checks line of sight from its own mount, selects a target, aims, and fires independently.
   */
  updateMultiTurretGunnery(e, dt, s) {
    const baseSightRadius = e.sightRadius ?? ENEMY_VISIBILITY.DEFAULT_SIGHT_RADIUS;
    const effectiveSightRadius = this.inForest
      ? Math.min(baseSightRadius, ENEMY_VISIBILITY.FOREST_SIGHT_RADIUS)
      : baseSightRadius;

    for (const t of e.turrets) {
      const pz = t.slot.pivotZ || 0;
      const tx = e.x + Math.sin(e.hullAngle) * pz;
      const tz = e.z + Math.cos(e.hullAngle) * pz;
      const distFromTurret = Math.hypot(this.playerX - tx, this.playerZ - tz);
      const turretCanSeePlayer =
        !this.inSmoke &&
        (s.canSeePlayer ||
          (distFromTurret <= effectiveSightRadius &&
            this.hasLineOfSight(tx, tz, this.playerX, this.playerZ)));
      const ts = { ...s, canSeePlayer: turretCanSeePlayer, distToPlayer: distFromTurret };

      let action = null;
      let shot = null;
      for (const a of e.actions) {
        if (a.kind !== ACTION_KIND.SHOOT) continue;
        shot = this.enemyShotTarget(e, a, ts, t);
        if (shot) {
          action = a;
          break;
        }
      }

      if (!action) {
        stepGunner(t.gunner, { dt, shooter: { x: tx, z: tz, turretAngle: t.angle }, target: null, visible: false });
        const defaultYaw = e.hullAngle + (t.slot.defaultYawOffset || 0);
        const look = s.hasActiveAlert
          ? Math.atan2(s.navTargetX - tx, s.navTargetZ - tz)
          : defaultYaw;
        t.angle = this.lerpAngle(t.angle, look, 4.5 * dt);
        continue;
      }

      if (!shotArmedFor(t.gunner, action.id, shot.key)) {
        armShot(t.gunner, action.id, shot.key, rollLuck(action.luck, e.behaviorRng ?? Math.random));
      }
      const aim = stepGunner(t.gunner, {
        dt,
        shooter: { x: tx, z: tz, turretAngle: t.angle },
        target: shot.target,
        targetKey: shot.key,
        visible: true,
        targetRadius: shot.radius,
        react: shot.react,
      });

      const turnSpeed = (e.isBoss ? 6.5 : 5.8) * (e.titanOverload ? 1.35 : 1.0);
      t.angle = this.lerpAngle(t.angle, aim.desiredTurretAngle, turnSpeed * dt);

      if (t.fireCooldown <= 0) {
        const token = shot.kind !== 'player' || this.hasAttackToken(e);
        if (aim.canFire && token) {
          const reloadMult = e.titanOverload ? (TITAN.OVERLOAD_RELOAD_MULT ?? 0.65) : 1.0;
          t.fireCooldown = e.stats.fireCooldown * reloadMult + onGunnerFired(t.gunner);
          this.fireEnemyTurretWeapon(e, t, tx, tz);
        }
      }

      if (shot.kind === 'terrain' && !t.gunner.shot) {
        t.randomShotTarget = null;
        t.randomShotTimer = 8.0 + Math.random() * 12.0;
      }
    }
  }

  /** Fires one independent turret (single or twin-barrel) from its world mount `(tx, tz)`. */
  fireEnemyTurretWeapon(e, t, tx, tz) {
    notifyBrainFired(e.brain);
    t.recoil = 0.22;
    t.flashTimer = 0.08;
    e.recoil = t.recoil;
    e.flashTimer = t.flashTimer;

    const dx = Math.sin(t.angle);
    const dz = Math.cos(t.angle);
    const perpX = Math.cos(t.angle);
    const perpZ = -Math.sin(t.angle);
    const muzzleDist = t.slot.muzzleDist ?? e.rig.muzzleDist ?? 1.35;
    const muzzleY = this.getRigMuzzle(t.slot, tx, tz, dx, dz, muzzleDist).y;
    const flashScale = e.isBoss ? 1.35 : 1.05;
    const worldSpeed = (e.stats.bulletSpeed || 7.2) * TILE_SIZE;
    const isHeavy = e.stats.bulletPower === BULLET_POWER.HEAVY;
    const rawGunId = (TANK_CONFIGS[e.enemyClass] || SECTOR_BOSS_CONFIGS[e.enemyClass])?.loadout.gun;
    const weaponId = rawGunId === 'TITAN_RAIL' ? 'BOSS_DUAL' : rawGunId;

    if (e.stats.barrels === 2) {
      const offsetWorld = (e.stats.barrelOffset || 0.3) * TILE_SIZE * 0.5;
      [-offsetWorld, offsetWorld].forEach((latOffset) => {
        const shot = this.traceMuzzle(tx, tz, dx, dz, muzzleDist, false, perpX * latOffset, perpZ * latOffset);
        this.spawnProjectile(
          shot.x,
          shot.z,
          dx,
          dz,
          false,
          e.stats.damage,
          e.stats.penetration,
          e.stats.bulletPower,
          worldSpeed,
          isHeavy,
          weaponId
        );
        this.fx.muzzleFlash(shot.x, muzzleY, shot.z, dx, dz, {
          scale: flashScale,
          tint: 0xff9a40,
        });
      });
      this.screenShake = Math.max(this.screenShake, 0.18);
      sound.playCannonShot(true, 1, e);
    } else {
      const shot = this.traceMuzzle(tx, tz, dx, dz, muzzleDist, false);
      this.fx.muzzleFlash(shot.x, muzzleY, shot.z, dx, dz, {
        scale: flashScale,
        tint: 0xff9a40,
      });
      this.spawnProjectile(
        shot.x,
        shot.z,
        dx,
        dz,
        false,
        e.stats.damage,
        e.stats.penetration,
        e.stats.bulletPower,
        worldSpeed,
        isHeavy,
        weaponId
      );
      sound.playCannonShot(isHeavy, 1, e);
    }
  }

  updateDirectFire(e, dt, shot, aim, s) {
    e.turretAngle = this.lerpAngle(e.turretAngle, aim.desiredTurretAngle, (e.isBoss ? 7 : 5.8) * dt);
    if (e.fireCooldown > 0) return;
    const token = shot.kind !== 'player' || this.hasAttackToken(e);
    const hit = e.gunner.shot.hit;

    if (e.weaponAbility) {
      const ctx = { target: shot.kind, distToPlayer: s.distToPlayer, aimReady: aim.canFire, token };
      if (fireAbilityWeapon(e, this, ctx)) onGunnerFired(e.gunner);
    } else if (shot.kind === 'player' && e.enemyClass === EnemyClass.BOSS_HYDRA) {
      const cells = s.distToPlayer / TILE_SIZE;
      if (aim.reacted && cells >= HYDRA.SALVO_MIN_CELLS && cells <= HYDRA.SALVO_MAX_CELLS) {
        // A missed salvo keeps the whole rocket triangle clear of the player
        const clearance = (HYDRA.SALVO_TRIANGLE_CELLS + (e.stats.blastCells || 1)) * TILE_SIZE;
        const point = hit ? shot.target : indirectMissPoint(shot.target, clearance, e.behaviorRng);
        e.fireCooldown =
          e.stats.fireCooldown * (e.hydraEnraged ? HYDRA.PHASE2_RELOAD_MULT : 1) +
          onGunnerFired(e.gunner);
        this.triggerHydraSalvo(e, this.clampToArena(point));
      }
    } else if (aim.canFire && token) {
      const reloadMult =
        e.enemyClass === EnemyClass.BOSS_MAMMOTH && e.mammothEnraged
          ? MAMMOTH.PHASE2_RELOAD_MULT
          : e.enemyClass === EnemyClass.BOSS_INFERNO && e.infernoEnraged
          ? INFERNO.PHASE2_RELOAD_MULT
          : 1;
      e.fireCooldown = e.stats.fireCooldown * reloadMult + onGunnerFired(e.gunner);
      this.fireEnemyWeapon(e, { homing: hit && e.missileCfg.homing });
    }
  }

  /** HOWITZER: aim for `artillery.aimSec` (turret tracks the target), then lob a shell. */
  updateIndirectFire(e, dt, shot, aim) {
    e.turretAngle = this.lerpAngle(
      e.turretAngle,
      Math.atan2(shot.target.x - e.x, shot.target.z - e.z),
      4.5 * dt
    );
    if (e.indirectAim && e.indirectAim.key !== shot.key) e.indirectAim = null;
    if (!e.indirectAim) {
      if (e.fireCooldown > 0 || !aim.reacted) return;
      if (shot.kind === 'player' && !this.hasAttackToken(e)) return;
      e.indirectAim = { key: shot.key, timer: e.artilleryCfg.aimSec };
    }
    e.indirectAim.timer -= dt;
    if (e.indirectAim.timer > 0) return;
    e.indirectAim = null;

    const random = e.behaviorRng ?? Math.random;
    const point = e.gunner.shot?.hit
      ? shot.target
      : indirectMissPoint(shot.target, ARTILLERY.SPLASH_RADIUS * TILE_SIZE, random);
    e.fireCooldown = ARTILLERY.RELOAD_MIN + random() * (ARTILLERY.RELOAD_MAX - ARTILLERY.RELOAD_MIN);
    onGunnerFired(e.gunner);
    this.triggerEnemyArtilleryBarrage(e, this.clampToArena(point));
  }

  /** Boss extra weapons: Hydra ATGM salvo, Mammoth artillery barrage. */
  updateBossSecondaryWeapons(e, dt, s) {
    const random = e.behaviorRng ?? Math.random;
    if (e.bossBarrage) {
      e.bossBarrage.timer -= dt;
      if (e.bossBarrage.timer <= 0) {
        const player = { x: this.playerX, z: this.playerZ };
        const point = e.bossBarrage.hit
          ? player
          : indirectMissPoint(player, ARTILLERY.SPLASH_RADIUS * TILE_SIZE, random);
        e.bossBarrage = null;
        this.triggerEnemyArtilleryBarrage(e, this.clampToArena(point));
      }
    }
    if (!e.isBoss || !s.canSeePlayer) return;
    const reacted = e.gunner.contactTime >= GUNNER.REACTION_SEC;
    const shootLuck = actionLuck(e.actions, 'shoot_player', 0);

    if (e.enemyClass === EnemyClass.BOSS_HYDRA) {
      if (reacted && e.hydraFlameCooldown <= 0 && s.distToPlayer <= HYDRA.FLAME_RANGE) {
        const aimAngle = Math.atan2(s.toPlayerX, s.toPlayerZ);
        if (Math.abs(normalizeAngleSigned(e.turretAngle - aimAngle)) <= 0.48) {
          emitFlamePuff(this, e, {
            speed: HYDRA.FLAME_SPEED,
            life: HYDRA.FLAME_LIFE,
            damage: HYDRA.FLAME_DAMAGE,
          });
          e.hydraFlameCooldown = FLAME_STREAM.PUFF_INTERVAL;
        }
      }
      if (reacted && e.hydraMissileCooldown <= 0 && s.distToPlayer <= HYDRA.MISSILE_RANGE_CELLS * TILE_SIZE) {
        e.hydraMissileCooldown = HYDRA.MISSILE_COOLDOWN;
        this.fireBossMissileSalvo(e, s.toPlayerX, s.toPlayerZ, rollLuck(shootLuck, random), HYDRA.MISSILE_SALVO, HYDRA.MISSILE_SPREAD_RAD);
      }
    } else if (e.enemyClass === EnemyClass.BOSS_MAMMOTH && reacted) {
      if (e.specialCooldown <= 0 && !e.bossBarrage) {
        // BOSS_MAMMOTH: telegraph-free barrage after `artillery.aimSec`
        e.specialCooldown = MAMMOTH.BARRAGE_COOLDOWN * (e.mammothEnraged ? MAMMOTH.PHASE2_RELOAD_MULT : 1);
        e.bossBarrage = { timer: e.artilleryCfg.aimSec, hit: rollLuck(shootLuck, random) };
      }
      if (e.mammothMissileCooldown <= 0 && s.distToPlayer <= MAMMOTH.MISSILE_RANGE_CELLS * TILE_SIZE) {
        e.mammothMissileCooldown = MAMMOTH.MISSILE_COOLDOWN * (e.mammothEnraged ? MAMMOTH.PHASE2_RELOAD_MULT : 1);
        this.fireBossMissileSalvo(e, s.toPlayerX, s.toPlayerZ, rollLuck(shootLuck, random), MAMMOTH.MISSILE_SALVO, MAMMOTH.MISSILE_SPREAD_RAD);
      }
    } else if (e.enemyClass === EnemyClass.BOSS_INFERNO && reacted) {
      if (e.infernoMissileCooldown <= 0 && s.distToPlayer <= INFERNO.MISSILE_RANGE_CELLS * TILE_SIZE) {
        e.infernoMissileCooldown = INFERNO.MISSILE_COOLDOWN * (e.infernoEnraged ? INFERNO.PHASE2_RELOAD_MULT : 1);
        const salvoCount = e.infernoEnraged ? INFERNO.PHASE2_MISSILE_SALVO : INFERNO.MISSILE_SALVO;
        this.fireBossMissileSalvo(e, s.toPlayerX, s.toPlayerZ, rollLuck(shootLuck, random), salvoCount, INFERNO.MISSILE_SPREAD_RAD);
      }
    }
  }

  findRandomTerrainTarget(e, maxRangeCells = 8) {
    const { row: eRow, col: eCol } = this.worldToGrid(e.x, e.z);
    const candidates = [];

    const minR = Math.max(0, eRow - maxRangeCells);
    const maxR = Math.min(GRID_SIZE - 1, eRow + maxRangeCells);
    const minC = Math.max(0, eCol - maxRangeCells);
    const maxC = Math.min(GRID_SIZE - 1, eCol + maxRangeCells);

    const fwdX = Math.sin(e.hullAngle);
    const fwdZ = Math.cos(e.hullAngle);

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const cell = this.grid[r]?.[c];
        if (!cell) continue;

        if (
          cell.type === TileType.FOREST ||
          cell.type === TileType.BOXES || cell.type === TileType.BRICK ||
          cell.type === TileType.CONCRETE
        ) {
          const pos = this.gridToWorld(r, c);
          const dx = pos.x - e.x;
          const dz = pos.z - e.z;
          const distSq = dx * dx + dz * dz;

          if (distSq < 3.24 || distSq > (maxRangeCells * TILE_SIZE) ** 2) continue;

          const dist = Math.sqrt(distSq);
          const dirX = dx / dist;
          const dirZ = dz / dist;

          // Check if any ally tank is in the direct line of fire
          let allyInLine = false;
          for (let j = 0; j < this.enemies.length; j++) {
            const ally = this.enemies[j];
            if (ally === e) continue;
            const allyDx = ally.x - e.x;
            const allyDz = ally.z - e.z;
            const dot = allyDx * dirX + allyDz * dirZ;
            if (dot > 0.5 && dot < dist) {
              const perpDistSq = (allyDx - dirX * dot) ** 2 + (allyDz - dirZ * dot) ** 2;
              if (perpDistSq < 1.0) {
                allyInLine = true;
                break;
              }
            }
          }
          if (allyInLine) continue;

          const fwdDot = dirX * fwdX + dirZ * fwdZ;
          const weight = fwdDot > 0.2 ? 3 : 1;

          candidates.push({ x: pos.x, z: pos.z, type: cell.type, weight });
        }
      }
    }

    if (candidates.length === 0) return null;

    const totalWeight = candidates.reduce((sum, item) => sum + item.weight, 0);
    let rand = Math.random() * totalWeight;
    for (const cand of candidates) {
      rand -= cand.weight;
      if (rand <= 0) return cand;
    }
    return candidates[0];
  }

  fireEnemyWeapon(e, { homing = false } = {}) {
    notifyBrainFired(e.brain);
    e.recoil = 0.2;
    e.flashTimer = 0.07;
    if (e.enemyClass === EnemyClass.STEALTH) {
      e.stealthRevealTimer = 1.9;
    }

    const dx = Math.sin(e.turretAngle);
    const dz = Math.cos(e.turretAngle);
    const perpX = Math.cos(e.turretAngle);
    const perpZ = -Math.sin(e.turretAngle);

    if (e.enemyClass === EnemyClass.MISSILES) {
      const mounts = e.rig.missileMounts;
      const mount = mounts?.length ? mounts[e.missileSide++ % mounts.length] : null;
      const lat = mount ? mount.left : 0;
      const start = this.traceMuzzle(
        e.x,
        e.z,
        dx,
        dz,
        mount ? Math.max(0.3, mount.forward) : 1.25,
        false,
        perpX * lat,
        perpZ * lat
      );
      this.spawnEnemyHomingMissile(start.x, start.z, dx, dz, homing);
      sound.playMissileLaunch(e);
      return;
    }
    const muzzleDist = e.rig.muzzleDist ?? 1.25;
    const muzzleY = this.getRigMuzzle(e.rig, e.x, e.z, dx, dz).y;
    const flashScale = (isHeavyShot) => (e.isBoss ? 1.35 : isHeavyShot ? 1.05 : 0.85);

    const worldSpeed = (e.stats.bulletSpeed || 7.2) * TILE_SIZE;
    const isHeavy = e.stats.bulletPower === BULLET_POWER.HEAVY;

    if (e.stats.barrels === 2) {
      const offsetWorld = (e.stats.barrelOffset || 0.3) * TILE_SIZE * 0.5;
      [-offsetWorld, offsetWorld].forEach((latOffset) => {
        const shot = this.traceMuzzle(e.x, e.z, dx, dz, muzzleDist, false, perpX * latOffset, perpZ * latOffset);
        this.spawnProjectile(
          shot.x,
          shot.z,
          dx,
          dz,
          false,
          e.stats.damage,
          e.stats.penetration,
          e.stats.bulletPower,
          worldSpeed,
          isHeavy,
          (TANK_CONFIGS[e.enemyClass] || SECTOR_BOSS_CONFIGS[e.enemyClass])?.loadout.gun
        );
        this.fx.muzzleFlash(shot.x, muzzleY, shot.z, dx, dz, {
          scale: flashScale(isHeavy),
          tint: 0xff9a40,
        });
      });
      sound.playCannonShot(true, 1, e);
    } else {
      const shot = this.traceMuzzle(e.x, e.z, dx, dz, muzzleDist, false);
      const gunId = (TANK_CONFIGS[e.enemyClass] || SECTOR_BOSS_CONFIGS[e.enemyClass])?.loadout.gun;
      const isThermo = gunId === 'INFERNO_THERMO';
      const distToAimTarget = isThermo
        ? Math.min(24, Math.max(4.5, Math.hypot(this.playerX - shot.x, this.playerZ - shot.z) + 0.6))
        : 0;
      this.fx.muzzleFlash(shot.x, muzzleY, shot.z, dx, dz, {
        scale: isThermo ? 1.75 : flashScale(isHeavy),
        tint: isThermo ? 0xff4500 : 0xff9a40,
      });
      this.spawnProjectile(
        shot.x,
        shot.z,
        dx,
        dz,
        false,
        e.stats.damage,
        e.stats.penetration,
        e.stats.bulletPower,
        worldSpeed,
        isHeavy,
        gunId,
        isThermo ? { isThermobaric: true, blastCells: e.stats.blastCells || INFERNO.BLAST_CELLS, detonateDist: distToAimTarget } : {}
      );
      sound.playCannonShot(isHeavy, 1, e);
    }
  }

  /** Enemy missile; `homing` missiles steer toward the player after launch. */
  spawnEnemyHomingMissile(x, z, dirX, dirZ, homing = true) {
    const mesh = createMissileVisual('enemy', 1.0);
    mesh.position.set(x, 0.9, z);
    mesh.rotation.y = Math.atan2(dirX, dirZ);
    this.fxGroup.add(mesh);
    this.fx.missileLaunch(x - dirX * 0.35, 0.9, z - dirZ * 0.35, dirX, dirZ, {
      enemy: true,
      scale: 0.7,
      light: false,
    });
    const soundHandle = sound.startMissileLoop({ x, z });

    const speed = 13.0;
    this.projectiles.push({
      x,
      z,
      vx: dirX * speed,
      vz: dirZ * speed,
      fromPlayer: false,
      damage: 22,
      penetration: 40,
      bulletPower: BULLET_POWER.NORMAL,
      speed,
      radius: 0.22,
      life: 3.4,
      isHeavy: true,
      isMissile: true,
      isHoming: homing,
      soundHandle,
      mesh,
    });
  }

  /** Lobs one shell at `target`; flight time comes from the tank's `artillery.flightSec`. */
  triggerEnemyArtilleryBarrage(e, target) {
    sound.playCannonShot(true, 5, e);
    notifyBrainFired(e.brain);
    const { x: tx, z: tz } = target;
    const muzzle = this.aimRigAtAndGetMuzzle(e, tx, tz);
    this.createArtilleryStrike(
      muzzle.x,
      muzzle.z,
      tx,
      tz,
      ARTILLERY.SPLASH_RADIUS * TILE_SIZE,
      e.artilleryCfg?.flightSec ?? ARTILLERY.FLIGHT_TIME,
      e.stats.damage || 40,
      false,
      muzzle.y
    );
    return true;
  }

  /** Swing an enemy turret onto a ground target and return its world muzzle tip, so. */
  aimRigAtAndGetMuzzle(e, tx, tz) {
    e.turretAngle = Math.atan2(tx - e.x, tz - e.z);
    if (e.rig?.turret) e.rig.turret.rotation.y = e.turretAngle;
    const dx = Math.sin(e.turretAngle);
    const dz = Math.cos(e.turretAngle);
    return this.getRigMuzzle(e.rig, e.x, e.z, dx, dz, e.rig?.muzzleDist ?? 1.25);
  }

  /** BOSS_HYDRA MLRS salvo: three telegraphed rockets in a triangle whose first vertex is the. */
  triggerHydraSalvo(e, aim) {
    sound.playMissileLaunch(e);
    const limit = (GRID_SIZE * TILE_SIZE) / 2 - 2;
    const side = HYDRA.SALVO_TRIANGLE_CELLS * TILE_SIZE;
    const rot = Math.random() * Math.PI * 2;
    const points = [
      aim,
      { x: aim.x + Math.sin(rot) * side, z: aim.z + Math.cos(rot) * side },
      { x: aim.x + Math.sin(rot + Math.PI / 3) * side, z: aim.z + Math.cos(rot + Math.PI / 3) * side },
    ];
    const muzzle = this.aimRigAtAndGetMuzzle(e, aim.x, aim.z);
    points.forEach((p, idx) => {
      this.createArtilleryStrike(
        muzzle.x,
        muzzle.z,
        THREE.MathUtils.clamp(p.x, -limit, limit),
        THREE.MathUtils.clamp(p.z, -limit, limit),
        (e.stats.blastCells || 1) * TILE_SIZE,
        HYDRA.SALVO_FLIGHT_TIMES[idx] ?? ARTILLERY.FLIGHT_TIME,
        e.stats.damage || 30,
        false,
        muzzle.y,
        'HYDRA_MLRS'
      );
    });
  }

  /** Fires a fan of homing ATGMs from a boss's ROCKET_LAUNCHER pod toward the player. */
  fireBossMissileSalvo(e, toPlayerX, toPlayerZ, hit, count = HYDRA.MISSILE_SALVO, spreadRad = HYDRA.MISSILE_SPREAD_RAD) {
    const half = (count - 1) / 2;
    // A missed salvo fans out beside the player and does not home
    const sign = (e.behaviorRng ?? Math.random)() < 0.5 ? -1 : 1;
    const miss = hit
      ? 0
      : sign * half * spreadRad +
        missAngle(Math.hypot(toPlayerX, toPlayerZ), TANK_HIT_RADIUS.PLAYER, sign);
    const base = Math.atan2(toPlayerX, toPlayerZ) + miss;
    const homing = hit && e.missileCfg?.homing;
    for (let k = 0; k < count; k++) {
      const ang = base + (k - half) * spreadRad;
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      const start = this.traceMuzzle(e.x, e.z, dx, dz, 1.8, false);
      this.spawnEnemyHomingMissile(start.x, start.z, dx, dz, homing);
    }
    sound.playMissileLaunch(e);
    this.setStatusBanner(`${e.name.toUpperCase()}: HOMING ATGM SALVO INBOUND`, 1.6);
  }

  /** Super-heavy bosses crush BRICK and BOXES obstacles under their hull mass when advancing. */
  crushBossObstacles(x, z, radius) {
    if (!this.grid?.length) return false;
    const half = (GRID_SIZE * TILE_SIZE) / 2;
    const minCol = Math.max(0, Math.floor((x - radius + half) / TILE_SIZE));
    const maxCol = Math.min(GRID_SIZE - 1, Math.floor((x + radius + half) / TILE_SIZE));
    const minRow = Math.max(0, Math.floor((z - radius + half) / TILE_SIZE));
    const maxRow = Math.min(GRID_SIZE - 1, Math.floor((z + radius + half) / TILE_SIZE));
    let crushed = false;
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = this.grid[r]?.[c];
        if (!cell) continue;
        if (cell.type === TileType.BRICK || cell.type === TileType.BOXES) {
          this.destroyTileCell(cell);
          crushed = true;
        }
      }
    }
    if (crushed) {
      sound.playArmorHit({ x, z });
      this.screenShake = Math.max(this.screenShake || 0, 0.14);
    }
    return crushed;
  }

  /** Aegis plating: armour % by hit aspect (rear drops to 0 during overload). */
  titanAspectArmor(e, aspect) {
    if (aspect === 'rear' && e.titanOverload) return TITAN.ARMOR_REAR_OVERLOAD;
    return e.stats.armorByAspect[aspect] ?? e.stats.armor;
  }

  clearInfernoDashBeam(e) {
    if (e?.infernoDashBeam) {
      this.fxGroup?.remove(e.infernoDashBeam);
      disposeOwned(e.infernoDashBeam);
      e.infernoDashBeam = null;
    }
  }

  /**
   * BOSS_INFERNO Overdrive Ram ("форсаж-таран"): locks onto player heading for 0.85s
   * with a glowing hazard telegraph line, then surges forward at 3.4x speed, smashing
   * brick/crates/forests and ramming the player hull on impact.
   */
  updateInfernoDash(e, dt, { canSeePlayer, toPlayerX, toPlayerZ, distToPlayer }) {
    if (e.infernoDashWindup > 0) {
      e.infernoDashWindup -= dt;
      e.targetDirX = 0;
      e.targetDirZ = 0;
      const lockAngle = Math.atan2(e.infernoDashDirX, e.infernoDashDirZ);
      e.hullAngle = this.lerpAngle(e.hullAngle, lockAngle, 12 * dt);
      if (Math.random() < 0.7) {
        const bx = e.x - Math.sin(e.hullAngle) * 1.8;
        const bz = e.z - Math.cos(e.hullAngle) * 1.8;
        this.fx.flameJet(bx, 0.75, bz, -e.infernoDashDirX * 5, -e.infernoDashDirZ * 5, 0.25);
      }
      if (e.infernoDashWindup <= 0) {
        this.clearInfernoDashBeam(e);
        e.infernoDashTimer = INFERNO.DASH_DURATION_SEC;
        e.infernoDashCooldown = e.infernoEnraged ? INFERNO.PHASE2_DASH_COOLDOWN : INFERNO.DASH_COOLDOWN;
        sound.playExplosion(1.15, { x: e.x, z: e.z });
        this.screenShake = Math.max(this.screenShake || 0, 0.4);
      }
      return 1.0;
    }

    if (e.infernoDashTimer > 0) {
      e.infernoDashTimer -= dt;
      e.targetDirX = e.infernoDashDirX;
      e.targetDirZ = e.infernoDashDirZ;

      const bx = e.x - e.infernoDashDirX * 1.9;
      const bz = e.z - e.infernoDashDirZ * 1.9;
      this.fx.flameJet(bx, 0.72, bz, -e.infernoDashDirX * 8, -e.infernoDashDirZ * 8, 0.15);

      const radius = 1.45;
      this.crushBossObstacles(e.x + e.infernoDashDirX * 0.9, e.z + e.infernoDashDirZ * 0.9, radius);

      // Vaporize trees in front of the heated dozer blade into sand.
      const half = (GRID_SIZE * TILE_SIZE) / 2;
      const frontX = e.x + e.infernoDashDirX * 1.4;
      const frontZ = e.z + e.infernoDashDirZ * 1.4;
      const minCol = Math.max(0, Math.floor((frontX - radius + half) / TILE_SIZE));
      const maxCol = Math.min(GRID_SIZE - 1, Math.floor((frontX + radius + half) / TILE_SIZE));
      const minRow = Math.max(0, Math.floor((frontZ - radius + half) / TILE_SIZE));
      const maxRow = Math.min(GRID_SIZE - 1, Math.floor((frontZ + radius + half) / TILE_SIZE));
      let forestConverted = false;
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const cell = this.grid[r]?.[c];
          if (cell?.type === TileType.FOREST) {
            this.convertCellToSand(cell);
            forestConverted = true;
          }
        }
      }
      if (forestConverted) this.tileBatcher?.sync();

      // Drop a proximity mine behind midway through the overdrive sprint.
      if (
        e.infernoDashTimer <= INFERNO.DASH_DURATION_SEC * 0.5 &&
        e.minesRemaining > 0 &&
        this.mines &&
        this.mines.length < 10 &&
        !e._dashMineDropped
      ) {
        e._dashMineDropped = true;
        e.minesRemaining--;
        this.plantMineAt(bx, bz);
      }

      // Ram collision check against the player tank.
      if (!e.infernoDashHitPlayer && distToPlayer <= radius + TANK_HIT_RADIUS.PLAYER + 0.35) {
        e.infernoDashHitPlayer = true;
        e.infernoDashTimer = 0;
        const aspect = this.blastSideArmor(
          this.playerStats,
          this.playerX,
          this.playerZ,
          this.playerHullAngle,
          e.x,
          e.z
        );
        const dmg = computeEffectiveDamage(INFERNO.DASH_RAM_DAMAGE, 35, aspect);
        this.damagePlayer(dmg, { zone: 'hull', aspect: 'front' });
        this.fx.explosion(this.playerX, 0.7, this.playerZ, { scale: 1.35, tint: 0xff4500 });
        sound.playExplosion(1.3, { x: this.playerX, z: this.playerZ });
        this.screenShake = Math.max(this.screenShake || 0, 0.85);
        this.setStatusBanner('CRITICAL RAM IMPACT FROM CERBERUS-T!', 2.2);
      }

      if (e.infernoDashTimer <= 0) {
        e._dashMineDropped = false;
      }
      return INFERNO.DASH_SPEED_MULT;
    }

    const cells = distToPlayer / TILE_SIZE;
    if (
      canSeePlayer &&
      e.infernoDashCooldown <= 0 &&
      cells >= INFERNO.DASH_MIN_CELLS &&
      cells <= INFERNO.DASH_MAX_CELLS &&
      distToPlayer > 0.1
    ) {
      e.infernoDashDirX = toPlayerX / distToPlayer;
      e.infernoDashDirZ = toPlayerZ / distToPlayer;
      e.infernoDashWindup = INFERNO.DASH_WINDUP_SEC;
      e.infernoDashHitPlayer = false;
      e._dashMineDropped = false;

      const beamLen = Math.min(22, distToPlayer + 4);
      const geo = new THREE.PlaneGeometry(2.4, beamLen);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0, beamLen / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff4500,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const beam = new THREE.Mesh(geo, mat);
      beam.position.set(e.x, 0.09, e.z);
      beam.rotation.y = Math.atan2(e.infernoDashDirX, e.infernoDashDirZ);
      markOwned(beam);
      this.fxGroup.add(beam);
      e.infernoDashBeam = beam;

      sound.playBossAlarm();
      this.setStatusBanner(`${e.name.toUpperCase()}: OVERDRIVE RAM ENGAGED!`, 1.8);
      return 1.0;
    }

    return 1.0;
  }

  /** Next un-triggered HP-gate for a boss, ordered from highest HP ratio to lowest. */
  nextBossPhaseGate(e) {
    if (!e?.isBoss) return null;
    if (e.enemyClass === EnemyClass.BOSS_MAMMOTH && !e.mammothEnraged) {
      return { ratio: MAMMOTH.PHASE2_HP_RATIO, id: 'mammoth_phase2' };
    }
    if (e.enemyClass === EnemyClass.BOSS_HYDRA && !e.hydraEnraged) {
      return { ratio: HYDRA.PHASE2_HP_RATIO, id: 'hydra_phase2' };
    }
    if (e.enemyClass === EnemyClass.BOSS_INFERNO && !e.infernoEnraged) {
      return { ratio: INFERNO.PHASE2_HP_RATIO, id: 'inferno_phase2' };
    }
    if (e.enemyClass === EnemyClass.BOSS_TITAN) {
      if (!e.titanEscortCalled) return { ratio: TITAN.ESCORT_HP_RATIO, id: 'titan_escort' };
      if (!e.titanOverload) return { ratio: TITAN.OVERLOAD_HP_RATIO, id: 'titan_overload' };
    }
    return null;
  }

  ensureBossPhaseShieldMesh(e) {
    if (!e?.rig?.root) return null;
    if (!e.phaseShieldMesh) {
      const radius = (e.hitRadius ?? TANK_HIT_RADIUS.DEFAULT_BOSS) * 1.45;
      const geo = new THREE.SphereGeometry(radius, 20, 14);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.28,
        wireframe: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0.85, 0);
      markOwned(mesh);
      e.rig.root.add(mesh);
      e.phaseShieldMesh = mesh;
    }
    e.phaseShieldMesh.visible = true;
    return e.phaseShieldMesh;
  }

  syncBossPhaseShieldVisual(e, elapsed) {
    const mesh = e.phaseShieldMesh;
    if (!mesh) return;
    mesh.visible = e.phaseShieldTimer > 0;
    if (!mesh.visible) return;
    mesh.rotation.y = elapsed * 1.8;
    const fade = Math.min(1, e.phaseShieldTimer / 0.45);
    mesh.material.opacity = (0.22 + Math.sin(elapsed * 14) * 0.08) * fade;
  }

  triggerBossPhaseTransition(e, phaseId) {
    e.phaseShieldTimer = BOSS_APS.PHASE_SHIELD_SEC;
    this.ensureBossPhaseShieldMesh(e);
    sound.playBossAlarm();
    this.fx?.shockwave?.(e.x, 0.2, e.z, 0.6, 5.5, 0x38bdf8, 0.5);

    if (phaseId === 'mammoth_phase2') {
      e.mammothEnraged = true;
      this.screenShake = Math.max(this.screenShake || 0, 0.55);
      this.callBossEscort(e, MAMMOTH.ESCORT_CLASSES);
      this.setStatusBanner?.(
        `${e.name.toUpperCase()}: CITADEL OVERDRIVE & PHASE SHIELD - ESCORT INBOUND`,
        3.2
      );
    } else if (phaseId === 'hydra_phase2') {
      e.hydraEnraged = true;
      this.screenShake = Math.max(this.screenShake || 0, 0.55);
      this.callBossEscort(e, HYDRA.ESCORT_CLASSES);
      this.setStatusBanner?.(
        `${e.name.toUpperCase()}: LAUNCHER HEADS OVERCLOCKED & SHIELD UP - ESCORT INBOUND`,
        3.2
      );
    } else if (phaseId === 'inferno_phase2') {
      e.infernoEnraged = true;
      e.minesRemaining = Math.max(e.minesRemaining || 0, 3);
      this.screenShake = Math.max(this.screenShake || 0, 0.65);
      this.callBossEscort(e, INFERNO.ESCORT_CLASSES);
      this.setStatusBanner?.(
        `${e.name.toUpperCase()}: THERMOBARIC OVERDRIVE & PHASE SHIELD - INCENDIARY ESCORT INBOUND`,
        3.4
      );
    } else if (phaseId === 'titan_escort') {
      e.titanEscortCalled = true;
      this.screenShake = Math.max(this.screenShake || 0, 0.5);
      this.callBossEscort(e, TITAN.ESCORT_CLASSES);
      this.setStatusBanner?.(
        `${e.name.toUpperCase()}: PHASE SHIELD ACTIVE - ESCORT REINFORCEMENTS INBOUND`,
        3.2
      );
    } else if (phaseId === 'titan_overload') {
      e.titanOverload = true;
      this.screenShake = Math.max(this.screenShake || 0, 0.65);
      this.setStatusBanner?.(
        `${e.name.toUpperCase()}: REACTOR OVERLOAD & PHASE SHIELD - REAR RADIATORS EXPOSED`,
        3.4
      );
    }
  }

  /** Spawns a boss escort group from the northern border. */
  callBossEscort(e, escortClasses = TITAN.ESCORT_CLASSES) {
    if (!this.grid?.length) return;
    escortClasses.forEach((escortClass) => {
      const targetPos = this.getSpawnPosition();
      const cell = this.worldToGrid(targetPos.x, targetPos.z);
      const spawn = this.resolveBorderSpawn(cell, { enemyClass: escortClass });
      if (spawn) {
        this.createEnemyAt(escortClass, spawn.spawnPos.x, spawn.spawnPos.z, false, spawn.entryTarget);
      }
    });
    this.emitHudUpdate?.();
  }

  /** Onboard boss APS intercepts incoming player ATGMs when charges and LOS allow. */
  tryBossApsIntercept(projectile) {
    if (!bossApsCanIntercept(projectile)) return false;
    const detectRadius = BOSS_APS.DETECT_RADIUS * TILE_SIZE;
    for (const e of this.enemies) {
      if (!e.isBoss || e.hp <= DURABILITY.ZERO_HP) continue;
      if ((e.apsCharges || 0) <= 0 || (e.apsRearmTimer || 0) > 0 || (e.phaseShieldTimer || 0) > 0) continue;
      const toBossX = e.x - projectile.x;
      const toBossZ = e.z - projectile.z;
      const dist = Math.hypot(toBossX, toBossZ);
      if (dist > detectRadius) continue;
      if (toBossX * projectile.vx + toBossZ * projectile.vz <= 0) continue;
      if (this.hasLineOfSight && !this.hasLineOfSight(projectile.x, projectile.z, e.x, e.z)) continue;

      e.apsCharges -= 1;
      e.apsRearmTimer = BOSS_APS.REARM_SEC;
      if ((e.apsRechargeTimer || 0) <= 0) e.apsRechargeTimer = BOSS_APS.RECHARGE_SEC;
      sound.playApsIntercept({ x: projectile.x, z: projectile.z });
      const len = dist || 1;
      this.fx?.apsIntercept?.(
        e.x - (toBossX / len) * 0.95,
        1.15,
        e.z - (toBossZ / len) * 0.95,
        projectile.x,
        1.35,
        projectile.z
      );
      this.setStatusBanner?.(
        `${e.name.toUpperCase()}: APS INTERCEPTED ATGM (${e.apsCharges}/${e.apsMaxCharges})`,
        1.4
      );
      return true;
    }
    return false;
  }

  setupDefenseTurrets() {
    if (this.defenseTurrets) {
      for (const t of this.defenseTurrets) {
        t.alive = false;
        if (t.rig?.root) this.mapGroup.remove(t.rig.root);
      }
    }
    this.defenseTurrets = [];
    if (!this.activeMapRules.hasEnemyFortifiedBase) return;
    const ebCell = this.activeMapRules.enemyBaseCell;
    if (!ebCell) return;

    // 4 corner turrets always:
    // South corners face player: CANNON
    // North corners: HOWITZER (mortar barrage)
    const slots = [
      { row: ebCell.row + 1, col: ebCell.col - 1, type: DEFENSE_TURRET_TYPES.CANNON },
      { row: ebCell.row + 1, col: ebCell.col + 1, type: DEFENSE_TURRET_TYPES.CANNON },
      { row: ebCell.row - 1, col: ebCell.col - 1, type: DEFENSE_TURRET_TYPES.HOWITZER },
      { row: ebCell.row - 1, col: ebCell.col + 1, type: DEFENSE_TURRET_TYPES.HOWITZER },
    ];

    // On complex maps, add 2 flanking HYDRA_MLRS batteries:
    const sectorId = this.currentSectorIndex;
    const isComplexAssault = [9, 14, 18, 21, 26, 29, 31, 33].includes(sectorId);
    if (isComplexAssault) {
      const wCol = ebCell.col - 2;
      const eCol = ebCell.col + 2;
      if (wCol >= 0 && wCol < GRID_SIZE) {
        slots.push({ row: ebCell.row, col: wCol, type: DEFENSE_TURRET_TYPES.MLRS });
      }
      if (eCol >= 0 && eCol < GRID_SIZE) {
        slots.push({ row: ebCell.row, col: eCol, type: DEFENSE_TURRET_TYPES.MLRS });
      }
    }

    for (const slot of slots) {
      const cfg = DEFENSE_TURRET_CONFIGS[slot.type];
      const { x, z } = this.gridToWorld(slot.row, slot.col);
      const rig = this.modelFactory.createDefenseTurretRig(slot.type);
      rig.root.position.set(x, 0, z);
      this.mapGroup.add(rig.root);

      // Remove generic concrete box mesh at that tile if present
      const cell = this.grid[slot.row]?.[slot.col];
      if (cell && cell.mesh) {
        this.mapGroup.remove(cell.mesh);
        cell.mesh = null;
      }

      // Turret starts facing south (towards player spawn)
      rig.turret.rotation.y = Math.PI;

      const turretEntity = {
        id: `turret_${slot.row}_${slot.col}`,
        type: slot.type,
        name: cfg.name,
        cfg,
        row: slot.row,
        col: slot.col,
        x,
        z,
        radius: 0.88,
        hp: cfg.maxHp || 100,
        maxHp: cfg.maxHp || 100,
        armor: cfg.armor,
        turretAngle: Math.PI,
        recoil: 0,
        fireCooldown: 1.5 + Math.random() * 2.0,
        salvoRemaining: 0,
        salvoTimer: 0,
        rig,
        alive: true,
      };
      this.defenseTurrets.push(turretEntity);
      if (cell) cell.defenseTurret = turretEntity;
    }
  }

  updateDefenseTurrets(dt, elapsed) {
    if (!this.defenseTurrets || this.defenseTurrets.length === 0) return;
    const empStunned = this.empTimer > 0;

    for (const t of this.defenseTurrets) {
      if (!t.alive) continue;

      if (empStunned) {
        if (Math.random() < 0.12) this.spawnSparks(t.x, 0.9, t.z, 0x06b6d4, 2);
        continue;
      }

      t.fireCooldown -= dt;
      t.recoil = THREE.MathUtils.damp(t.recoil, 0, 10, dt);
      if (t.rig?.barrelPivot) {
        t.rig.barrelPivot.position.z = -t.recoil;
      }

      if (t.salvoRemaining > 0) {
        t.salvoTimer -= dt;
        if (t.salvoTimer <= 0) {
          t.salvoRemaining--;
          t.salvoTimer = t.cfg.salvoInterval || 0.22;
          this.fireTurretMlrsRocket(t);
        }
      }

      const toPlayerX = this.playerX - t.x;
      const toPlayerZ = this.playerZ - t.z;
      const dist = Math.hypot(toPlayerX, toPlayerZ);

      const maskedBySmoke = this.inSmoke || this.isSegmentInSmoke(t.x, t.z, this.playerX, this.playerZ);
      const canEngage =
        dist <= t.cfg.range &&
        !maskedBySmoke &&
        (t.type === 'HOWITZER' || this.hasLineOfSight(t.x, t.z, this.playerX, this.playerZ));

      if (canEngage) {
        const desiredAngle = Math.atan2(toPlayerX, toPlayerZ);
        t.turretAngle = this.lerpAngle(t.turretAngle, desiredAngle, 3.8 * dt);
        t.rig.turret.rotation.y = t.turretAngle;

        const angleDiff = Math.abs(normalizeAngleSigned(t.turretAngle - desiredAngle));
        if (angleDiff < 0.24 && t.fireCooldown <= 0) {
          this.fireDefenseTurret(t, dist);
        }
      }
    }
  }

  fireDefenseTurret(t, dist) {
    if (t.type === DEFENSE_TURRET_TYPES.CANNON) {
      this.fireTurretCannon(t);
    } else if (t.type === DEFENSE_TURRET_TYPES.HOWITZER) {
      if (dist >= (t.cfg.minRange || 4.0)) {
        this.fireTurretHowitzer(t);
      }
    } else if (t.type === DEFENSE_TURRET_TYPES.MLRS) {
      t.fireCooldown = t.cfg.fireCooldown + Math.random() * 0.8;
      t.salvoRemaining = t.cfg.salvoCount || 3;
      t.salvoTimer = 0.05;
    }
  }

  fireTurretCannon(t) {
    t.fireCooldown = t.cfg.fireCooldown + Math.random() * 0.4;
    t.recoil = 0.35;
    const muzzleDist = t.cfg.muzzleDist || 1.6;
    const dirX = Math.sin(t.turretAngle);
    const dirZ = Math.cos(t.turretAngle);
    const spawnX = t.x + dirX * muzzleDist;
    const spawnZ = t.z + dirZ * muzzleDist;

    this.spawnProjectile(
      spawnX,
      spawnZ,
      dirX,
      dirZ,
      false,
      t.cfg.damage || 24,
      t.cfg.penetration || 0,
      BULLET_POWER.HEAVY,
      t.cfg.bulletSpeed || 22,
      true
    );

    this.fx.muzzleFlash(spawnX, 0.75, spawnZ, dirX, dirZ, {
      scale: 1.1,
      tint: 0xf97316,
    });
    this.spawnSparks(spawnX, 0.75, spawnZ, 0xfde047, 4);
    sound.playCannonShot(false, 3, { x: spawnX, z: spawnZ });
  }

  fireTurretHowitzer(t) {
    t.fireCooldown = t.cfg.fireCooldown + Math.random() * 0.8;
    t.recoil = 0.45;
    const targetX = this.playerX + (Math.random() - 0.5) * 1.4;
    const targetZ = this.playerZ + (Math.random() - 0.5) * 1.4;
    const muzzleDist = t.cfg.muzzleDist || 1.4;
    const spawnX = t.x + Math.sin(t.turretAngle) * muzzleDist;
    const spawnZ = t.z + Math.cos(t.turretAngle) * muzzleDist;

    sound.playCannonShot(true, 4, { x: spawnX, z: spawnZ });
    this.createArtilleryStrike(
      spawnX,
      spawnZ,
      targetX,
      targetZ,
      (t.cfg.blastRadius || 2.2) * TILE_SIZE,
      ARTILLERY.FLIGHT_TIME,
      t.cfg.damage || 40,
      false,
      1.1
    );
  }

  fireTurretMlrsRocket(t) {
    const spread = (Math.random() - 0.5) * 0.18;
    const dirX = Math.sin(t.turretAngle + spread);
    const dirZ = Math.cos(t.turretAngle + spread);
    const spawnX = t.x + dirX * 1.2;
    const spawnZ = t.z + dirZ * 1.2;

    sound.playMissileLaunch({ x: spawnX, z: spawnZ });
    this.spawnEnemyHomingMissile(spawnX, spawnZ, dirX, dirZ);
  }

  damageDefenseTurret(turret, p) {
    if (!turret.alive) return;
    const pen = p.isMissile ? 60 : (this.playerStats?.armorPenetration ?? 20);
    const effectiveArmor = turret.armor * (1 - pen / 100);
    const finalDmg = Math.max(1, (p.damage || 0) * (1 - effectiveArmor / 100));
    turret.hp = Math.max(0, turret.hp - finalDmg);
    if (turret.rig?.hpBarFill) {
      const ratio = turret.hp / turret.maxHp;
      turret.rig.hpBarFill.scale.x = Math.max(0.01, ratio);
      if (ratio < 0.33) turret.rig.hpBarFill.material.color.setHex(0xef4444);
      else if (ratio < 0.66) turret.rig.hpBarFill.material.color.setHex(0xeab308);
    }
    this.spawnSparks(p.x, 0.9, p.z, 0xf97316, 6);
    sound.playArmorHit({ x: p.x, z: p.z });
    if (turret.hp <= 0) this.destroyDefenseTurret(turret);
  }

  destroyDefenseTurret(turret) {
    if (!turret.alive) return;
    turret.alive = false;
    this.mapGroup.remove(turret.rig.root);
    this.convertTurretCellToSand(turret);
    this.detonateExplosionAt(turret.x, turret.z, 2.2, 25, false);
    this.screenShake = Math.max(this.screenShake, 0.45);
    const bounty = 300;
    this.playerSave.credits = (this.playerSave.credits || 0) + bounty;
    this.creditsEarnedThisMission = (this.creditsEarnedThisMission || 0) + bounty;
    this.saveRepo.savePlayerSave(this.playerSave);
    this.emitHudUpdate();
    sound.playExplosionLarge();
    this.setStatusBanner(`${turret.name.toUpperCase()} DESTROYED! +300 CREDITS`, 2.5);
  }

  /** A destroyed turret leaves passable sand where its concrete barbette stood. */
  convertTurretCellToSand(turret) {
    const cell = this.grid[turret.row]?.[turret.col];
    if (!cell) return;
    cell.defenseTurret = null;
    if (cell.mesh) {
      this.mapGroup.remove(cell.mesh);
      cell.mesh = null;
    }
    cell.type = TileType.SAND;
    cell.hp = 0;
    const sandMesh = this.modelFactory.createSandBlock(turret.x, turret.z);
    this.mapGroup.add(sandMesh);
    cell.mesh = sandMesh;
    this.tileBatcher?.sync();
  }

  /** Advances a rig's track and wheel animation (rig.gear uniforms, model metres) from how far the. */
  driveGear(rig, state, x, z, hullAngle) {
    const gear = rig?.gear;
    if (state.gearX === undefined) {
      state.gearX = x;
      state.gearZ = z;
      state.gearYaw = hullAngle;
      return;
    }
    const dx = x - state.gearX;
    const dz = z - state.gearZ;
    let dyaw = hullAngle - state.gearYaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    state.gearX = x;
    state.gearZ = z;
    state.gearYaw = hullAngle;
    if (!gear) return;
    let forward = dx * Math.sin(hullAngle) + dz * Math.cos(hullAngle);
    if (Math.abs(forward) > 2) forward = 0;
    const turn = dyaw * 0.42;
    gear.left.value += (forward - turn) / gear.scale;
    gear.right.value += (forward + turn) / gear.scale;
  }

  /** Shell spawn point `dist` along (dirX, dirZ) from a tank centre, shifted sideways by. */
  traceMuzzle(x, z, dirX, dirZ, dist, fromPlayer, latX = 0, latZ = 0) {
    const STEP = 0.2;
    const MIN = 0.6;
    let safeX = x + dirX * MIN + latX;
    let safeZ = z + dirZ * MIN + latZ;
    for (let t = MIN; t <= dist + 1e-6; t += STEP) {
      const px = x + dirX * t + latX;
      const pz = z + dirZ * t + latZ;
      if (this.checkTankWallCollision(px, pz, 0.05, true)) return { x: safeX, z: safeZ };
      if (fromPlayer) {
        if (this.enemies.some((en) => Math.hypot(en.x - px, en.z - pz) <= (en.hitRadius ?? TANK_HIT_RADIUS.DEFAULT))) {
          return { x: px, z: pz };
        }
      } else if (Math.hypot(this.playerX - px, this.playerZ - pz) <= TANK_HIT_RADIUS.PLAYER) {
        return { x: px, z: pz };
      }
      safeX = px;
      safeZ = pz;
    }
    return { x: x + dirX * dist + latX, z: z + dirZ * dist + latZ };
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
    const isThermobaric = Boolean(opts.isThermobaric);
    const color = isThermobaric ? 0xff4500 : fromPlayer ? 0xffb030 : isHeavy ? 0xff4a2a : 0xff7a1e;
    const radius = isThermobaric ? 0.28 : isHeavy ? 0.19 : 0.14;
    const mesh = createProjectileVisual(color, {
      radius,
      length: isThermobaric ? 0.62 : isHeavy ? 0.5 : 0.38,
      glow: isThermobaric ? 1.55 : isHeavy ? 1.15 : 1,
    });
    mesh.position.set(x, 0.75, z);
    mesh.rotation.y = Math.atan2(dirX, dirZ);
    this.fxGroup.add(mesh);

    this.projectiles.push({
      x,
      z,
      vx: dirX * speed,
      vz: dirZ * speed,
      fromPlayer,
      damage,
      penetration,
      bulletPower,
      speed,
      radius,
      life: 2.4,
      traveled: 0,
      isHeavy,
      isThermobaric,
      blastCells: opts.blastCells || 0,
      detonateDist: opts.detonateDist || 0,
      weaponId,
      mesh,
      trailColor: color,
      trailWidth: isThermobaric ? 0.32 : isHeavy ? 0.2 : 0.15,
      trailLife: isThermobaric ? 0.22 : isHeavy ? 0.16 : 0.12,
    });
  }

  /** Unit flight direction of a projectile as [dx, dz]. */
  missileDir(p) {
    const len = Math.hypot(p.vx, p.vz) || 1;
    return [p.vx / len, p.vz / len];
  }

  /** Detonates a missile on contact with an obstacle, tank, or at end-of-life. */
  detonateMissile(p) {
    if (!p.isMissile) return;
    const [dirX, dirZ] = this.missileDir(p);
    const scale = p.fromPlayer ? 0.85 : 0.75;
    if (this.fx?.missileImpact) {
      this.fx.missileImpact(p.x, 0.85, p.z, dirX, dirZ, { enemy: !p.fromPlayer, scale });
    }
    sound.playExplosion(1.1, { x: p.x, z: p.z });
    this.screenShake = Math.max(this.screenShake || 0, 0.35);
  }

  /** Per-frame flight effects for a projectile moving from (px,pz) to its current position. */
  emitProjectileTrail(p, prevX, prevZ, y) {
    if (p.isThermobaric) {
      this.fx.shellTrail(prevX, y, prevZ, p.x, y, p.z, 0xff5a14, 0.34, 0.22);
      if (this.fx.q >= 1 || Math.random() < 0.7) {
        this.fx.flameJet(p.x, y, p.z, -p.vx * 0.25, -p.vz * 0.25, 0.25);
        this.fx.shellSmokeTrail(p.x, y, p.z, true);
      }
      return;
    }
    if (p.isFlame) {
      const age01 = 1 - p.life / (p.maxLife || FLAME_STREAM.PUFF_LIFE);
      if (this.fx.q >= 1 || Math.random() < 0.6) {
        this.fx.flameJet(p.x, y, p.z, p.vx, p.vz, THREE.MathUtils.clamp(age01, 0, 1));
      }
      return;
    }
    if (p.isMissile) {
      const len = Math.hypot(p.vx, p.vz) || 1;
      p.smokeAcc = (p.smokeAcc || 0) + Math.hypot(p.x - prevX, p.z - prevZ);
      const smoke = p.smokeAcc >= 0.24;
      if (smoke) p.smokeAcc = 0;
      this.fx.missileExhaust(p.x, y, p.z, p.vx / len, p.vz / len, {
        enemy: !p.fromPlayer,
        smokeEvery: smoke,
        prevX,
        prevZ,
      });
      return;
    }
    if (p.trailColor != null) {
      this.fx.shellTrail(prevX, y, prevZ, p.x, y, p.z, p.trailColor, p.trailWidth, p.trailLife);
    }
  }

  removeProjectile(index) {
    const p = this.projectiles[index];
    if (!p) return;
    if (p.soundHandle) {
      sound.stopMissileLoop(p.soundHandle);
      p.soundHandle = null;
    }
    this.fxGroup.remove(p.mesh);
    this.projectiles.splice(index, 1);
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.isThermobaric) {
          this.detonateThermobaricAt(
            p.x,
            p.z,
            (p.blastCells || INFERNO.BLAST_CELLS) * TILE_SIZE,
            p.damage,
            p.fromPlayer
          );
        } else if (p.isMissile) {
          this.detonateMissile(p);
        }
        this.removeProjectile(i);
        continue;
      }

      if (p.isMissile) {
        if (p.soundHandle) {
          sound.updateMissileLoop(p.soundHandle, { x: p.x, z: p.z });
        }
        const headingBefore = Math.atan2(p.vx, p.vz);
        if (p.fromPlayer) {
          let nearest = null;
          let minDist = Infinity;
          for (const e of this.enemies) {
            if (e.hp <= 0) continue;
            const d = Math.hypot(e.x - p.x, e.z - p.z);
            if (d < minDist) {
              minDist = d;
              nearest = e;
            }
          }
          let targetX = this.aimWorld?.x ?? p.x;
          let targetZ = this.aimWorld?.z ?? p.z;
          if (nearest) {
            targetX = nearest.x;
            targetZ = nearest.z;
          } else if (this.enemyBaseAlive) {
            const basePos = this.getEnemyBaseCenter();
            if (basePos) {
              targetX = basePos.x;
              targetZ = basePos.z;
            }
          }
          const curAngle = Math.atan2(p.vx, p.vz);
          const targetAngle = Math.atan2(targetX - p.x, targetZ - p.z);
          const nextAngle = this.lerpAngle(
            curAngle,
            targetAngle,
            MISSILE.TURN_RATE * dt
          );
          p.vx = Math.sin(nextAngle) * p.speed;
          p.vz = Math.cos(nextAngle) * p.speed;
          p.mesh.rotation.y = nextAngle;
        } else if (
          p.isHoming &&
          !this.inForest &&
          !this.inSmoke &&
          !this.isPointInSmoke(p.x, p.z)
        ) {
          const curAngle = Math.atan2(p.vx, p.vz);
          const targetAngle = Math.atan2(
            this.playerX - p.x,
            this.playerZ - p.z
          );
          const nextAngle = this.lerpAngle(curAngle, targetAngle, 2.4 * dt);
          p.vx = Math.sin(nextAngle) * p.speed;
          p.vz = Math.cos(nextAngle) * p.speed;
          p.mesh.rotation.y = nextAngle;
        }
        let turn = Math.atan2(p.vx, p.vz) - headingBefore;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        animateMissileVisual(p.mesh, dt, dt > 0 ? turn / dt : 0);
      }

      const prevX = p.x;
      const prevZ = p.z;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.traveled = (p.traveled || 0) + Math.hypot(p.x - prevX, p.z - prevZ);
      const flightY = p.isMissile ? (p.fromPlayer ? 1.35 : 0.9) : p.isFlame ? 0.72 : 0.75;
      p.mesh.position.set(p.x, flightY, p.z);
      this.emitProjectileTrail(p, prevX, prevZ, flightY);

      if (p.isThermobaric && p.detonateDist > 0 && p.traveled >= p.detonateDist) {
        this.detonateThermobaricAt(
          p.x,
          p.z,
          (p.blastCells || INFERNO.BLAST_CELLS) * TILE_SIZE,
          p.damage,
          p.fromPlayer
        );
        this.removeProjectile(i);
        continue;
      }

      if (this.tryBossApsIntercept(p)) {
        this.removeProjectile(i);
        continue;
      }

      const halfArena = (GRID_SIZE * TILE_SIZE) / 2;
      if (
        p.x < -halfArena ||
        p.x > halfArena ||
        p.z < -halfArena ||
        p.z > halfArena
      ) {
        if (p.isMissile) this.detonateMissile(p);
        this.removeProjectile(i);
        continue;
      }

      const { row, col } = this.worldToGrid(p.x, p.z);
      const cell = this.grid[row]?.[col];

      if (p.fromPlayer && this.enemyBaseAlive) {
        const inCell = cell && cell.type === TileType.ENEMY_BASE;
        const ebCenter = this.getEnemyBaseCenter();
        const inRadius = ebCenter && Math.hypot(ebCenter.x - p.x, ebCenter.z - p.z) <= 1.0;
        if (inCell || inRadius) {
          const ebCell = this.enemyBaseCell();
          const targetCell = (inCell ? cell : null) || this.grid[ebCell?.row]?.[ebCell?.col];
          if (targetCell && targetCell.type === TileType.ENEMY_BASE) {
            if (p.isMissile) this.detonateMissile(p);
            const citadelDmg = p.isMissile
              ? 16
              : p.bulletPower === BULLET_POWER.HEAVY
              ? 8
              : 4;
            this.damageEnemyBase(targetCell, citadelDmg, p.x, p.z);
            this.removeProjectile(i);
            continue;
          }
        }
      }

      if (p.isThermobaric && cell) {
        const hitsBlocking =
          cell.defenseTurret?.alive ||
          [
            TileType.BOXES,
            TileType.BARREL,
            TileType.BRICK,
            TileType.CONCRETE,
            TileType.BASE,
            TileType.ENEMY_BASE,
          ].includes(cell.type);
        if (hitsBlocking) {
          this.detonateThermobaricAt(
            p.x,
            p.z,
            (p.blastCells || INFERNO.BLAST_CELLS) * TILE_SIZE,
            p.damage,
            p.fromPlayer
          );
          this.removeProjectile(i);
          continue;
        }
      }

      // A live turret owns its whole cell: player rounds hit the turret, enemy rounds stop on it.
      if (cell?.defenseTurret?.alive && (!p.isMissile || !p.fromPlayer)) {
        if (p.fromPlayer) {
          this.shotsHit++;
          this.damageDefenseTurret(cell.defenseTurret, p);
        }
        if (p.isMissile) this.detonateMissile(p);
        this.removeProjectile(i);
        continue;
      }

      // Player missiles cruise above every tile, crates included
      if (cell?.type === TileType.BOXES && !(p.fromPlayer && p.isMissile)) {
        if (p.isMissile) this.detonateMissile(p);
        this.damageTileCell(cell, 1, p.x, p.z, p.fromPlayer);
        this.removeProjectile(i);
        continue;
      }
      if (cell && !(p.fromPlayer && p.isMissile)) {
        if (cell.type === TileType.BARREL) {
          if (p.isMissile) this.detonateMissile(p);
          this.explodeBarrel(cell, p.fromPlayer);
          this.removeProjectile(i);
          continue;
        } else if (p.isFlame && cell.type === TileType.FOREST) {
          this.destroyTileCell(cell);
        } else if (cell.type === TileType.BRICK) {
          if (p.isMissile) this.detonateMissile(p);
          if (p.pierceBricks) {
            this.destroyTileCell(cell);
          } else {
            const brickDmg = p.isMissile ? 4 : (p.bulletPower === BULLET_POWER.HEAVY ? 2 : 1);
            this.damageTileCell(cell, brickDmg, p.x, p.z);
            this.removeProjectile(i);
            continue;
          }
        } else if (cell.type === TileType.CONCRETE) {
          if (p.isMissile) this.detonateMissile(p);
          const concreteDmg = p.isFlame
            ? 0.35
            : (p.isMissile || p.bulletPower === BULLET_POWER.HEAVY)
            ? 4
            : 1;
          this.damageTileCell(cell, concreteDmg, p.x, p.z);
          this.removeProjectile(i);
          continue;
        } else if (cell.type === TileType.SPAWNER && p.fromPlayer) {
          if (p.isMissile) this.detonateMissile(p);
          this.damageTileCell(cell, 1, p.x, p.z);
          this.removeProjectile(i);
          continue;
        } else if (cell.type === TileType.BASE && !p.fromPlayer) {
          if (p.isMissile) this.detonateMissile(p);
          this.destroyCommandBase();
          this.removeProjectile(i);
          continue;
        } else if (cell.type === TileType.ENEMY_BASE && !p.fromPlayer) {
          if (p.isMissile) this.detonateMissile(p);
          this.removeProjectile(i);
          continue;
        }
      }

      if (p.fromPlayer) {
        const mineTriggerDist = p.isMissile
          ? MISSILE.MINE_TRIGGER_RADIUS * TILE_SIZE
          : 0.65;
        let hitMine = false;
        const mineCount = this.mines ? this.mines.length : 0;
        for (let m = mineCount - 1; m >= 0; m--) {
          if (
            Math.hypot(this.mines[m].x - p.x, this.mines[m].z - p.z) <=
            mineTriggerDist
          ) {
            this.detonateMine(m);
            hitMine = true;
            if (!p.isMissile) break;
          }
        }
        if (hitMine && !p.isMissile) {
          this.removeProjectile(i);
          continue;
        }

        let hitTurret = false;
        if (this.defenseTurrets && this.defenseTurrets.length > 0) {
          for (const turret of this.defenseTurrets) {
            if (!turret.alive) continue;
            if (Math.hypot(turret.x - p.x, turret.z - p.z) <= turret.radius) {
              hitTurret = true;
              this.shotsHit++;
              this.damageDefenseTurret(turret, p);
              break;
            }
          }
        }
        if (hitTurret) {
          this.removeProjectile(i);
          continue;
        }

        let hitEnemy = false;
        for (const enemy of this.enemies) {
          const hitR = enemy.hitRadius ?? (enemy.isBoss ? TANK_HIT_RADIUS.DEFAULT_BOSS : TANK_HIT_RADIUS.DEFAULT);
          if (Math.hypot(enemy.x - p.x, enemy.z - p.z) <= hitR) {
            this.shotsHit++;
            enemy.stealthRevealTimer = 2.0;

            enemy.hullYaw = enemy.hullAngle;
            enemy.turretYaw = enemy.turretAngle;
            const isTitan = enemy.enemyClass === EnemyClass.BOSS_TITAN;
            // Directional reinforcement follows the hull, regardless of turret rotation.
            const hitZone = enemy.stats.directionalArmor ? 'hull' : Math.random() < 0.35 ? 'turret' : 'hull';
            const armorRes = resolveArmorHit({
              projectile: {
                vx: p.vx,
                vz: p.vz,
                penetration: p.isMissile ? 240 : 140 + (this.effectiveUpgrades.cannon || 1) * 35,
                baseDamage: p.damage * 3.2,
                moduleDamage: 24 + (this.effectiveUpgrades.cannon || 1) * 8,
                ricochetAngleDeg: 80,
              },
              target: enemy,
              hitPoint: { x: p.x, y: hitZone === 'turret' ? 1.35 : 0.72, z: p.z },
              hitZone,
            });

            const outcome = String(armorRes?.outcome || 'penetration').toLowerCase();
            const aspectStr = String(armorRes?.aspect || armorRes?.zone || 'front');
            const angleDeg = Number(armorRes?.impactAngleDeg ?? 0);

            if (
              enemy.isBoss &&
              !p.isMissile &&
              (outcome === 'panel_stopped' || outcome === 'stopped_by_panel')
            ) {
              sound.playSteelHit({ x: p.x, z: p.z });
              this.spawnSparks(p.x, 0.9, p.z, 0x38bdf8, 10);
              this.setStatusBanner(
                `${enemy.name.toUpperCase()}: STOPPED BY DREADNOUGHT CITADEL PANEL (${aspectStr.toUpperCase()})`,
                1.6
              );
            } else if (
              enemy.isBoss &&
              !p.isMissile &&
              outcome === 'ricochet' &&
              angleDeg >= 78
            ) {
              sound.playSteelHit({ x: p.x, z: p.z });
              this.spawnSparks(p.x, 0.9, p.z, 0x38bdf8, 10);
              this.setStatusBanner(
                `${enemy.name.toUpperCase()}: RICOCHET (${angleDeg.toFixed(0)}°)`,
                1.6
              );
            } else {
              const legacyScaleDmg = computeEffectiveDamage(
                p.damage,
                p.penetration,
                isTitan ? this.titanAspectArmor(enemy, aspectStr) : enemy.stats.armorByAspect[aspectStr] ?? enemy.stats.armor
              );
              const aspectBonus = isTitan
                ? 1.0
                : aspectStr === 'rear'
                  ? 1.35
                  : aspectStr === 'left' || aspectStr === 'right'
                  ? 1.15
                  : 1.0;
              this.damageEnemy(enemy, legacyScaleDmg * aspectBonus);
              if (p.isMissile) {
                this.detonateMissile(p);
              } else {
                this.fx.armorHit(p.x, 0.85, p.z, { scale: p.isHeavy ? 1.15 : 0.9 });
                sound.playArmorHit({ x: p.x, z: p.z });
              }
            }
            hitEnemy = true;
            break;
          }
        }
        if (hitEnemy) {
          this.removeProjectile(i);
          continue;
        }
      } else {
        if (Math.hypot(this.playerX - p.x, this.playerZ - p.z) <= TANK_HIT_RADIUS.PLAYER) {
          if (p.isThermobaric) {
            this.detonateThermobaricAt(
              p.x,
              p.z,
              (p.blastCells || INFERNO.BLAST_CELLS) * TILE_SIZE,
              p.damage,
              p.fromPlayer
            );
            this.removeProjectile(i);
            continue;
          }
          const playerTarget = {
            x: this.playerX,
            z: this.playerZ,
            hullYaw: this.playerHullAngle,
            turretYaw: this.playerTurretAngle,
            hull: this.assembledTank?.hull || HULL_CATALOG.bars_m1,
            turret: this.assembledTank?.turret || TURRET_CATALOG.t_01,
            armorPanels: this.playerArmorPanels,
          };
          const hitZone = p.isFlame ? 'hull' : Math.random() < 0.3 ? 'turret' : 'hull';
          const armorRes = resolveArmorHit({
            projectile: {
              vx: p.vx,
              vz: p.vz,
              penetration: p.isFlame ? 65 : 85 + (p.penetration || 0) * 1.35,
              baseDamage: p.damage * 10,
              moduleDamage: p.isFlame ? 8 : 34,
              ricochetAngleDeg: 70,
            },
            target: playerTarget,
            hitPoint: { x: p.x, y: hitZone === 'turret' ? 1.35 : 0.72, z: p.z },
            hitZone,
          });

          // Flame does not pierce armour, it burns through it: a puff is never stopped or
          // deflected; the side's armour still reduces its damage via computeEffectiveDamage.
          const outcome = p.isFlame
            ? 'penetration'
            : String(armorRes?.outcome || 'penetration').toLowerCase();
          const aspectStr = String(armorRes?.aspect || armorRes?.zone || 'front');
          const angleDeg = Number(armorRes?.impactAngleDeg ?? 0);
          const effArmor = Number(armorRes?.effectiveArmor ?? 100);
          const subTarget = armorRes?.subsystemTarget || armorRes?.subsystemHit || null;
          const modDmg = Number(armorRes?.moduleDamage ?? armorRes?.subsystemDamage ?? 0);

          if (
            outcome === 'ricochet' ||
            outcome === 'non_penetration' ||
            outcome === 'panel_stopped' ||
            outcome === 'stopped_by_panel'
          ) {
            sound.playSteelHit({ x: p.x, z: p.z });
            this.spawnSparks(p.x, 0.9, p.z, 0x38bdf8, 9);
            if (subTarget && modDmg > 0) {
              applySubsystemDamage(this.subsystems, subTarget, modDmg * 0.45);
            }
            const msg =
              outcome === 'panel_stopped' || outcome === 'stopped_by_panel'
                ? `ADD-ON ARMOR PANEL ABSORBED HIT!${armorRes?.panelBroke ? ' (PANEL SHATTERED!)' : ''}`
                : outcome === 'ricochet'
                ? `SHELL RICOCHETED OFF ${aspectStr.toUpperCase()} ARMOR (${angleDeg.toFixed(0)}°)!`
                : `ARMOR STOPPED SHELL (${aspectStr.toUpperCase()} ${effArmor.toFixed(0)}mm)!`;
            this.setStatusBanner(msg, 2.0);
            this.emitHudUpdate();
          } else {
            if (subTarget && modDmg > 0) {
              const subRes = applySubsystemDamage(
                this.subsystems,
                subTarget,
                modDmg
              );
              if (subRes?.destroyed) {
                this.setStatusBanner(
                  `CRITICAL HIT: ${subTarget.toUpperCase()} DISABLED! AUTO-REPAIR IN 7s OR PRESS [1] RM-1`,
                  2.8
                );
              }
            }
            const effDamage = computeEffectiveDamage(
              p.damage,
              p.penetration,
              this.playerStats.armorByAspect[aspectStr] ?? this.playerStats.armor
            );
            this.damagePlayer(effDamage, p.isFlame ? null : { zone: hitZone, aspect: aspectStr });
            if (p.isFlame) {
              this.fx.flameJet(p.x, 0.8, p.z, p.vx * 0.3, p.vz * 0.3, 1);
            } else if (p.isMissile) {
              this.detonateMissile(p);
            } else {
              this.fx.armorHit(p.x, 0.85, p.z, { scale: p.isHeavy ? 1.1 : 0.85, colorHex: 0xff6a30 });
            }
          }

          this.removeProjectile(i);
          continue;
        }
      }
    }
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
    const color = fromPlayer ? 0xf59e0b : 0xef4444;
    const ringGeo = new THREE.RingGeometry(radius - 0.14, radius, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(targetX, 0.07, targetZ);

    const fillGeo = new THREE.CircleGeometry(radius, 28);
    fillGeo.rotateX(-Math.PI / 2);
    const fillMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.25,
    });
    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
    fillMesh.position.set(targetX, 0.06, targetZ);
    fillMesh.scale.setScalar(0.05);

    const shellMesh = createProjectileVisual(fromPlayer ? 0xffb030 : 0xff5a2a, {
      radius: 0.2,
      length: 0.34,
      glow: 1.25,
    });
    shellMesh.position.set(startX, startY, startZ);
    shellMesh.rotation.y = Math.atan2(targetX - startX, targetZ - startZ);
    const launchLen = Math.hypot(targetX - startX, targetZ - startZ) || 1;
    this.fx.muzzleFlash(startX, startY, startZ, (targetX - startX) / launchLen, (targetZ - startZ) / launchLen, {
      scale: 0.9,
      tint: 0xffa040,
    });

    markOwned(ringMesh);
    markOwned(fillMesh);
    this.fxGroup.add(ringMesh);
    this.fxGroup.add(fillMesh);
    this.fxGroup.add(shellMesh);

    this.hazardZones.push({
      x: targetX,
      z: targetZ,
      startX,
      startZ,
      startY,
      weaponId,
      radius,
      timer: duration,
      maxTimer: duration,
      damage,
      fromPlayer,
      ringMesh,
      fillMesh,
      shellMesh,
    });
  }

  updateHazardZones(dt, elapsed) {
    for (let i = this.hazardZones.length - 1; i >= 0; i--) {
      const hz = this.hazardZones[i];
      hz.timer -= dt;
      const progress = Math.min(1, Math.max(0, 1 - hz.timer / hz.maxTimer));
      hz.fillMesh.scale.setScalar(Math.max(0.05, progress));

      hz.ringMesh.visible =
        Math.floor(elapsed * ARTILLERY.MARKER_BLINK_RATE * 2) % 2 === 0;

      const curX = THREE.MathUtils.lerp(hz.startX, hz.x, progress);
      const curZ = THREE.MathUtils.lerp(hz.startZ, hz.z, progress);
      const arcY =
        THREE.MathUtils.lerp(hz.startY ?? 0.8, 0.3, progress) + Math.sin(progress * Math.PI) * 6.5;
      hz.shellMesh.position.set(curX, arcY, curZ);
      hz.trailAcc = (hz.trailAcc || 0) + dt;
      if (hz.trailAcc >= 0.03 / this.fx.q) {
        hz.trailAcc = 0;
        this.fx.shellSmokeTrail(curX, arcY, curZ, true);
      }

      if (hz.timer <= 0) {
        this.fxGroup.remove(hz.ringMesh);
        this.fxGroup.remove(hz.fillMesh);
        this.fxGroup.remove(hz.shellMesh);
        this.detonateExplosionAt(
          hz.x,
          hz.z,
          hz.radius,
          hz.damage,
          hz.fromPlayer, { zone: 'turret', aspect: 'front' }
        );
        this.hazardZones.splice(i, 1);
      }
    }
  }

  /** Converts a terrain/obstacle cell (FOREST, BRICK, CONCRETE, ICE, WATER) into scorched SAND. */
  convertCellToSand(cell) {
    if (!cell || cell.type === TileType.SAND) return;
    if (cell.type === TileType.FOREST && this.burningForests?.length) {
      const idx = this.burningForests.findIndex((bf) => bf.cell === cell);
      if (idx >= 0) this.burningForests.splice(idx, 1);
    }
    cell.isBurning = false;
    if (cell.mesh) {
      this.mapGroup?.remove(cell.mesh);
      cell.mesh = null;
    }
    if (cell.type === TileType.BRICK || cell.type === TileType.CONCRETE || cell.type === TileType.FOREST) {
      this.blocksDestroyed = (this.blocksDestroyed || 0) + 1;
    }
    cell.type = TileType.SAND;
    cell.hp = 0;
    cell.subMeshes = undefined;
    if (this.modelFactory?.createSandBlock && this.mapGroup) {
      const pos = this.gridToWorld(cell.row, cell.col);
      const sandMesh = this.modelFactory.createSandBlock(pos.x, pos.z);
      this.mapGroup.add(sandMesh);
      cell.mesh = sandMesh;
    }
  }

  /** Rebuilds the continuous water / ice surface meshes after thermobaric vaporization. */
  rebuildWaterAndIceSurfaces(rebuildWater, rebuildIce) {
    if (!this.mapGroup || !this.modelFactory) return;
    const typeGrid = this.grid.map((row) => row.map((cell) => cell.type));
    if (rebuildWater) {
      if (this.waterSurfaceMesh) {
        this.mapGroup.remove(this.waterSurfaceMesh);
        disposeOwned(this.waterSurfaceMesh);
      }
      this.waterSurfaceMesh = this.modelFactory.createWaterBlock(typeGrid, TileType.WATER);
      this.mapGroup.add(this.waterSurfaceMesh);
    }
    if (rebuildIce) {
      if (this.iceSurfaceMesh) {
        this.mapGroup.remove(this.iceSurfaceMesh);
        disposeOwned(this.iceSurfaceMesh);
      }
      this.iceSurfaceMesh = this.modelFactory.createIceBlock(typeGrid, TileType.ICE);
      this.mapGroup.add(this.iceSurfaceMesh);
    }
  }

  /**
   * Thermobaric shell detonation (radius 2.5 cells = 5.0m):
   * triggers realistic fuel-air blast FX, sweeps FOREST/BRICK/CONCRETE/ICE/WATER into SAND,
   * and deals radial blast damage to vehicles.
   */
  detonateThermobaricAt(x, z, radius, damage, fromPlayer = false) {
    sound.playExplosion(1.9, { x, z });
    this.screenShake = Math.max(this.screenShake || 0, 0.85);
    if (this.fx?.thermobaricExplosion) {
      this.fx.thermobaricExplosion(x, 0.55, z, radius);
    } else {
      this.fx?.explosion?.(x, 0.55, z, { scale: 2.0, tint: 0xff4500 });
    }

    let rebuildWater = false;
    let rebuildIce = false;
    let touchedSand = false;

    for (let r = 0; r < this.grid.length; r++) {
      const row = this.grid[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell) continue;
        const pos = this.gridToWorld(r, c);
        if (Math.hypot(pos.x - x, pos.z - z) > radius + 0.35) continue;

        if (
          cell.type === TileType.FOREST ||
          cell.type === TileType.BRICK ||
          cell.type === TileType.CONCRETE ||
          cell.type === TileType.ICE ||
          cell.type === TileType.WATER
        ) {
          if (cell.type === TileType.WATER) rebuildWater = true;
          if (cell.type === TileType.ICE) rebuildIce = true;
          this.convertCellToSand(cell);
          touchedSand = true;
        } else if (cell.type === TileType.BARREL) {
          this.explodeBarrel(cell, fromPlayer);
        } else if (cell.type === TileType.BOXES) {
          this.damageTileCell(cell, 2, pos.x, pos.z, fromPlayer);
        } else if (cell.type === TileType.SPAWNER) {
          this.destroyTileCell(cell);
        } else if (cell.type === TileType.BASE && !fromPlayer) {
          this.destroyCommandBase();
        } else if (cell.type === TileType.ENEMY_BASE && fromPlayer) {
          this.damageEnemyBase(cell, 16, pos.x, pos.z);
        }
      }
    }

    if (touchedSand) {
      this.tileBatcher?.sync();
      this.rebuildWaterAndIceSurfaces(rebuildWater, rebuildIce);
    }

    if (fromPlayer) {
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        const dist = Math.hypot(e.x - x, e.z - z);
        if (dist <= radius + (e.isBoss ? 1.2 : 0.7)) {
          const edgeRatio = dist > radius * 0.5 ? INFERNO.EDGE_DAMAGE_RATIO : 1.0;
          const eff = computeEffectiveDamage(
            damage * edgeRatio,
            25,
            this.blastSideArmor(e.stats, e.x, e.z, e.hullAngle, x, z)
          );
          this.damageEnemy(e, eff);
        }
      }
    } else if (this.playerHp > DURABILITY.ZERO_HP) {
      const dist = Math.hypot(this.playerX - x, this.playerZ - z);
      if (dist <= radius + TANK_HIT_RADIUS.PLAYER) {
        const edgeRatio = dist > radius * 0.5 ? INFERNO.EDGE_DAMAGE_RATIO : 1.0;
        const eff = computeEffectiveDamage(
          damage * edgeRatio,
          25,
          this.blastSideArmor(this.playerStats, this.playerX, this.playerZ, this.playerHullAngle, x, z)
        );
        this.damagePlayer(eff, { zone: 'hull', aspect: 'front' });
      }
    }
  }

  detonateExplosionAt(x, z, radius, damage, fromPlayer, componentHit = null, isEnvironmental = false, penetration = 0) {
    if (isEnvironmental) {
      sound.playEnvironmentalExplosion({ x, z });
    } else {
      sound.playExplosion(1.4, { x, z });
    }
    this.screenShake = Math.max(this.screenShake, 0.55);
    this.fx.explosion(x, 0.55, z, { scale: THREE.MathUtils.clamp(radius / 2.4, 0.75, 1.6) });

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = this.grid[r][c];
        if (cell.type === TileType.EMPTY) continue;
        const pos = this.gridToWorld(r, c);
        if (Math.hypot(pos.x - x, pos.z - z) <= radius + 0.5) {
          if (cell.type === TileType.BOXES) {
            this.damageTileCell(cell, 1, pos.x, pos.z, fromPlayer);
          } else if (cell.type === TileType.BRICK || cell.type === TileType.SPAWNER) {
            this.destroyTileCell(cell);
          } else if (cell.type === TileType.BARREL) {
            this.explodeBarrel(cell, fromPlayer);
          } else if (cell.type === TileType.CONCRETE) {
            this.damageTileCell(cell, 6, pos.x, pos.z);
          } else if (cell.type === TileType.BASE && !fromPlayer) {
            this.destroyCommandBase();
          } else if (cell.type === TileType.ENEMY_BASE && fromPlayer) {
            this.damageEnemyBase(cell, 12, pos.x, pos.z);
          }
        }
      }
    }

    if (fromPlayer) {
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        const dist = Math.hypot(e.x - x, e.z - z);
        if (dist <= radius + (e.isBoss ? 1.2 : 0.7)) {
          const edgeRatio =
            dist > radius * 0.5 ? ARTILLERY.EDGE_DAMAGE_RATIO : 1.0;
          const eff = computeEffectiveDamage(
            damage * edgeRatio,
            penetration,
            this.blastSideArmor(e.stats, e.x, e.z, e.hullAngle, x, z)
          );
          this.damageEnemy(e, eff);
        }
      }
    } else {
      const dist = Math.hypot(this.playerX - x, this.playerZ - z);
      if (dist <= radius + 0.65) {
        const edgeRatio =
          dist > radius * 0.5 ? ARTILLERY.EDGE_DAMAGE_RATIO : 1.0;
        const eff = computeEffectiveDamage(
          damage * edgeRatio,
          penetration,
          this.blastSideArmor(this.playerStats, this.playerX, this.playerZ, this.playerHullAngle, x, z)
        );
        this.damagePlayer(eff, componentHit);
      }
    }
  }

  /** Armour of the hull side facing a blast centre (armour always works per side). */
  blastSideArmor(stats, tankX, tankZ, hullYaw, blastX, blastZ) {
    if (!stats.directionalArmor) return stats.armor;
    if (Math.hypot(blastX - tankX, blastZ - tankZ) < 0.05) return stats.armor;
    const aspect = determineHitAspect({ x: tankX, z: tankZ, hullYaw: hullYaw || 0 }, { x: blastX, z: blastZ }, 'hull');
    return stats.armorByAspect[aspect] ?? stats.armor;
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
    if (!this.enemyBaseAlive || cell.type !== TileType.ENEMY_BASE) return;
    cell.hp = Math.max(0, cell.hp - dmg);
    this.enemyBaseHp = cell.hp;
    sound.playSteelHit({ x: hitX, z: hitZ });
    this.fx.armorHit(hitX, 0.95, hitZ, { scale: dmg >= 8 ? 1.2 : 0.9 });

    for (const ally of this.enemies) {
      ally.alertTarget = { x: this.playerX, z: this.playerZ };
      ally.alertTimer = ENEMY_VISIBILITY.ALERT_PURSUIT_DURATION_SEC;
      ally.aiTimer = 0;
    }

    if (cell.hp <= 0) {
      this.enemyBaseAlive = false;
      this.enemyBaseHp = 0;
      this._enemyBaseCell = null;
      const { x, z } = this.gridToWorld(cell.row, cell.col);
      this.destroyTileCell(cell);
      sound.playExplosion(2.0);
      this.screenShake = Math.max(this.screenShake, 1.0);
      this.fx.tankDestroyed(x, z, { boss: true, tint: 0xff5a2a });

      if (this.activeMapRules?.spawnSectorBossOnClear && !this.bossSpawned) {
        this.spawnSectorBoss();
        this.setStatusBanner(
          'ENEMY COMMAND CORE DESTROYED! ELIMINATE THE SECTOR BOSS!',
          4.0
        );
      }

      const victoryRes = checkMapVictory(this.activeMapRules, {
        enemyBaseDestroyed: true,
        vanguardRemainingToSpawn: this.vanguardRemainingToSpawn,
        activeEnemiesCount: this.enemies.length,
        bossDefeated: this.bossSpawned && !this.enemies.some((u) => u.isBoss),
      });
      if (victoryRes.isVictory) {
        this.triggerMissionVictory(victoryRes.banner);
        return;
      }
    }
    this.emitHudUpdate();
  }

  destroyCommandBase() {
    if (!this.baseAlive) return;
    this.baseAlive = false;
    this.inBaseRepairZone = false;
    const basePos = this.getCommandBaseCenter();
    for (const { row, col } of this.getBaseLayout().cells) {
      const baseCell = this.grid[row]?.[col];
      if (baseCell?.type === TileType.BASE) this.destroyTileCell(baseCell);
    }
    this.fx.tankDestroyed(basePos.x, basePos.z, { boss: true, tint: 0xff7a2a });
    sound.playExplosion(1.6);

    const defeatRes = checkMapDefeat(this.activeMapRules, {
      playerHp: this.playerHp,
      baseAlive: false,
    });
    if (defeatRes.isDefeat) {
      this.status = GameStatus.GAME_OVER;
      sound.stopEngineLoop();
      this.wasDefeated = true;
      this.restoreAllComponents();
      if (this.activeMissionRun && !this.activeMissionRun.rewardsCommitted) {
        this.lastSettlementSummary = settleMission({
          playerSave: this.playerSave,
          missionRun: this.activeMissionRun,
          outcome: 'defeat',
        });
        this.saveRepo.savePlayerSave(this.playerSave);
        this.saveRepo.recordMissionRun(this.activeMissionRun);
      }
      this.setStatusBanner(defeatRes.banner, 5.0);
    } else {
      this.setStatusBanner(
        this.activeMapRules?.baseLostBanner ||
          'REPAIR BASE DESTROYED! FIELD REPAIR BAY OFFLINE — CONTINUE THE ASSAULT!',
        4.5
      );
    }
    this.saveProgress();
    this.emitHudUpdate();
  }

  restoreCommandBase() {
    if (this.baseAlive || this.status !== GameStatus.PLAYING) return;
    const cells = this.getBaseLayout().cells.map(({ row, col }) => this.grid[row]?.[col]);
    if (!cells.length || cells.some((cell) => !cell)) return;
    const pos = this.getCommandBaseCenter();
    const mesh = this.modelFactory.createCommandBaseBlock();
    mesh.position.set(pos.x, 0, pos.z);
    this.mapGroup.add(mesh);
    cells.forEach((cell, i) => {
      if (cell.type !== TileType.EMPTY) this.destroyTileCell(cell);
      Object.assign(cell, { type: TileType.BASE, hp: 1, maxHp: 1, mesh: i === 0 ? mesh : null });
    });
    this.baseAlive = true;
    this.tileBatcher.sync();
    this.setStatusBanner('ALLIED HQ REBUILT! FIELD REPAIR BAY ONLINE!', 3);
    this.saveProgress();
  }

  /** `fromPlayer`: only crates the player breaks yield loot; enemy fire just destroys their contents. */
  damageTileCell(cell, dmg, hitX, hitZ, fromPlayer = false) {
    // The concrete under a live turret is its barbette; only the turret itself takes damage.
    if (cell.defenseTurret?.alive) return;
    if (cell.type === TileType.BOXES) {
      if (cell.hp <= 0 || dmg <= 0) return;
      cell.hp = Math.max(0, cell.hp - 1);
      this.modelFactory.updateBoxesDamage(cell.mesh, cell.hp);
      this.tileBatcher.markDirty(cell.mesh);
      sound.playBrickHit({ x: hitX, z: hitZ });
      if (cell.hp === 0) {
        this.destroyTileCell(cell);
        if (fromPlayer) {
          const pos = this.gridToWorld(cell.row, cell.col);
          const type = rollBoxLoot(this.boxPowerUpPool, Math.random, this);
          if (type) this.createPowerUpEntity(type, pos.x, pos.z);
        }
      } else this.fx.blockDestroyed(hitX, hitZ, 'boxes');
      this.emitHudUpdate();
      return;
    }
    cell.hp -= dmg;

    if (cell.type === TileType.CONCRETE) {
      sound.playBrickHit({ x: hitX, z: hitZ });
      this.fx.masonryHit(hitX, 0.78, hitZ, { concrete: true, heavy: dmg >= 4 });
      if (cell.mesh) {
        this.modelFactory.updateConcreteBlockDamage(
          cell.mesh,
          cell.hp,
          cell.maxHp || 16
        );
      }
    } else {
      sound.playBrickHit({ x: hitX, z: hitZ });
      if (cell.type === TileType.SPAWNER) {
        this.fx.armorHit(hitX, 0.6, hitZ, { scale: 0.8, colorHex: 0xff5a3a });
      } else {
        this.fx.masonryHit(hitX, 0.7, hitZ, { concrete: false, heavy: dmg >= 2 });
      }
    }

    if (cell.type === TileType.BRICK) this.modelFactory.updateBrickBlockDamage(cell.mesh, cell.hp);
    this.tileBatcher.markDirty(cell.mesh);

    if (cell.hp <= 0) {
      this.destroyTileCell(cell);
    }
  }

  destroyTileCell(cell) {
    if (!cell || cell.type === TileType.EMPTY) return;
    if (cell.type === TileType.BARREL) {
      this.explodeBarrel(cell, true);
      return;
    }
    const { x, z } = this.gridToWorld(cell.row, cell.col);

    if (cell.type === TileType.BRICK && this.modelFactory.useBlenderBricks && this.modelFactory.brickModels.states.size) {
      const rubble = new THREE.Group();
      rubble.userData.batchTile = true;
      this.modelFactory.brickModels.apply(rubble, 0);
      rubble.position.set(x, 0, z);
      this.mapGroup.add(rubble);
      this.brickRubble.push({ mesh: rubble, life: 12 });
      if (this.brickRubble.length > 32) this.mapGroup.remove(this.brickRubble.shift().mesh);
    }
    if (cell.mesh) {
      this.mapGroup.remove(cell.mesh);
      cell.mesh = null;
    }

    const wasSpawner = cell.type === TileType.SPAWNER;
    const wasBoxes = cell.type === TileType.BOXES;
    const wasConcrete = cell.type === TileType.CONCRETE;
    const wasForest = cell.type === TileType.FOREST;
    cell.type = TileType.EMPTY;
    this._spawnerCells = null;
    cell.hp = 0;
    this.blocksDestroyed++;

    this.fx.blockDestroyed(
      x,
      z,
      wasBoxes ? 'boxes' : wasSpawner ? 'spawner' : wasConcrete ? 'concrete' : wasForest ? 'forest' : 'brick'
    );

    if (wasSpawner) {
      sound.playExplosion(1.1, { x, z });
    }
    if (this.tileBatcher) {
      this.tileBatcher.sync();
    }
  }

  updateBrickRubble(dt) {
    for (let i = this.brickRubble.length - 1; i >= 0; i--) {
      const item = this.brickRubble[i];
      item.life -= dt;
      if (item.life <= 0) {
        this.mapGroup.remove(item.mesh);
        this.brickRubble.splice(i, 1);
      }
    }
  }

  explodeBarrel(cell, fromPlayer = true) {
    if (!cell || cell.type !== TileType.BARREL || cell._exploding) return;
    cell._exploding = true;
    const { x, z } = this.gridToWorld(cell.row, cell.col);

    if (cell.mesh) {
      this.mapGroup.remove(cell.mesh);
      cell.mesh = null;
    }
    cell.type = TileType.EMPTY;
    cell.hp = 0;
    this.blocksDestroyed++;

    sound.playEnvironmentalExplosion({ x, z });
    this.screenShake = Math.max(this.screenShake, 0.75);

    this.fx.explosion(x, 0.45, z, { scale: 1.85, boss: false, tint: 0xff3b14 });
    this.fx.shockwave(x, 0.1, z, 0.4, 4.8, 0xff5500, 0.45);
    this.fx.scorch(x, z, 2.4);
    this.fx.sparks(x, 0.5, z, 0xffa040, 24, { speed: 2.4, up: 1.5 });

    const blastRadius = 2.8 * TILE_SIZE;
    const maxDamage = 35;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy || enemy.hp <= 0) continue;
      const dist = Math.hypot(enemy.x - x, enemy.z - z);
      if (dist <= blastRadius) {
        const falloff = 1 - (dist / blastRadius) * 0.5;
        const dmg = Math.round(maxDamage * Math.max(0.4, falloff));
        this.damageEnemy(enemy, dmg, x, z);
        this.fx.armorHit(enemy.x, 0.5, enemy.z, { scale: 1.3, colorHex: 0xff4500 });
      }
    }

    if (this.playerHp > DURABILITY.ZERO_HP) {
      const pDist = Math.hypot(this.playerX - x, this.playerZ - z);
      if (pDist <= blastRadius) {
        const falloff = 1 - (pDist / blastRadius) * 0.5;
        const dmg = Math.round(maxDamage * Math.max(0.4, falloff));
        this.damagePlayer(dmg);
        this.fx.armorHit(this.playerX, 0.5, this.playerZ, { scale: 1.4, colorHex: 0xff2200 });
      }
    }

    const row = cell.row;
    const col = cell.col;
    const chainBarrels = [];

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const neighbor = this.grid[row + dr]?.[col + dc];
        if (!neighbor || neighbor.type === TileType.EMPTY) continue;
        const nPos = this.gridToWorld(neighbor.row, neighbor.col);

        if (neighbor.type === TileType.BOXES) {
          this.damageTileCell(neighbor, 1, nPos.x, nPos.z, fromPlayer);
        } else if (neighbor.type === TileType.BRICK) {
          this.destroyTileCell(neighbor);
        } else if (neighbor.type === TileType.CONCRETE) {
          this.damageTileCell(neighbor, 6, nPos.x, nPos.z);
        } else if (neighbor.type === TileType.FOREST) {
          this.destroyTileCell(neighbor);
        } else if (neighbor.type === TileType.BARREL && !neighbor._exploding) {
          chainBarrels.push(neighbor);
        }
      }
    }

    if (chainBarrels.length > 0) {
      this.pendingBarrelExplosions ||= [];
      chainBarrels.forEach((b, idx) => {
        this.pendingBarrelExplosions.push({ cell: b, fromPlayer, remaining: 0.075 * (idx + 1) });
      });
    }

    if (this.tileBatcher) {
      this.tileBatcher.sync();
    }
  }

  updateBarrelExplosions(dt) {
    if (this.isDisposed || this.isHangarPaused || this.isAdPaused || this.status !== GameStatus.PLAYING) return;
    const pending = this.pendingBarrelExplosions || [];
    this.pendingBarrelExplosions = [];
    for (const event of pending) {
      const { cell } = event;
      if (this.grid[cell.row]?.[cell.col] !== cell || cell.type !== TileType.BARREL) continue;
      event.remaining -= dt;
      if (event.remaining > 0 || this.status !== GameStatus.PLAYING) {
        this.pendingBarrelExplosions.push(event);
      } else {
        this.explodeBarrel(cell, event.fromPlayer);
      }
    }
  }

  damageEnemy(enemy, dmg) {
    if (!enemy || enemy.hp <= DURABILITY.ZERO_HP) return;
    if (enemy.isBoss && enemy.phaseShieldTimer > 0) {
      sound.playSteelHit({ x: enemy.x, z: enemy.z });
      this.spawnSparks?.(enemy.x, 1.0, enemy.z, 0x38bdf8, 8);
      return;
    }

    const nextHp = enemy.hp - dmg;
    const gate = this.nextBossPhaseGate(enemy);
    if (gate) {
      const gateHp = enemy.maxHp * gate.ratio;
      if (nextHp <= gateHp) {
        enemy.hp = Math.min(enemy.hp, gateHp);
        enemy.hullHP = Math.max(0, enemy.hp * 10);
        this.triggerBossPhaseTransition(enemy, gate.id);
        return;
      }
    }

    enemy.hp = nextHp;
    enemy.hullHP = Math.max(0, enemy.hp * 10);
    if (enemy.hp <= DURABILITY.ZERO_HP) {
      const idx = this.enemies.indexOf(enemy);
      if (idx === -1) return;
      if (idx !== -1) {
        this.enemies.splice(idx, 1);
      }
      if (this.priorityTargetId === enemy.id) {
        this.priorityTargetId = null;
      }
      this.clearInfernoDashBeam(enemy);
      this.sensorContacts.delete(enemy.id);
      this.entityGroup.remove(enemy.rig.root);
      this.kills++;
      const unitClass = String(enemy.enemyClass || 'hostile').toUpperCase();
      const unitName =
        enemy.name ||
        TANK_CONFIGS[enemy.enemyClass]?.name ||
        SECTOR_BOSS_CONFIGS[enemy.enemyClass]?.name ||
        unitClass;
      const bounty =
        ENEMY_KILL_CREDITS[enemy.enemyClass] ||
        (enemy.isBoss ? 750 : 75);
      this.playerSave.credits = (this.playerSave.credits || 0) + bounty;
      this.creditsEarnedThisMission = (this.creditsEarnedThisMission || 0) + bounty;
      this.syncCampaignCredits();
      this.saveRepo.savePlayerSave(this.playerSave);
      this.setStatusBanner(`+ $${bounty} CREDITS (${unitName})`, 1.8);
      this.screenShake = Math.max(this.screenShake, enemy.isBoss ? 0.9 : 0.35);
      this.fx.tankDestroyed(enemy.x, enemy.z, { boss: enemy.isBoss });
      sound.playExplosion(enemy.isBoss ? 2.0 : 1.7, { x: enemy.x, z: enemy.z });
      this.checkAndIgniteForestOnEnemyKill(enemy);

      if (this.survivalState) {
        if (enemy.isBoss) {
          this.survivalState.bossesDefeated = (this.survivalState.bossesDefeated || 0) + 1;
        }
        const spec = this.survivalState.waveSpec;
        if (
          this.vanguardRemainingToSpawn === 0 &&
          (!spec?.isBossWave || this.bossSpawned) &&
          this.enemies.length === 0
        ) {
          this.onSurvivalWaveCleared();
        } else if (enemy.isBoss) {
          this.setStatusBanner(
            `${unitName.toUpperCase()} DESTROYED! ELIMINATE REMAINING ESCORT!`,
            3.2
          );
        }
      } else {
        const sector = SECTORS[this.currentSectorIndex];
        const hasPendingBossStage =
          enemy.isBoss &&
          Array.isArray(sector?.bossSequence) &&
          this.bossStageIndex + 1 < sector.bossSequence.length &&
          !this.enemies.some((u) => u.isBoss);
        if (hasPendingBossStage) {
          this.spawnBossStage(this.bossStageIndex + 1);
          this.saveProgress();
          return;
        }
        const victoryRes = checkMapVictory(this.activeMapRules, {
          enemyBaseDestroyed: !this.enemyBaseAlive,
          vanguardRemainingToSpawn: this.vanguardRemainingToSpawn,
          activeEnemiesCount: this.enemies.length,
          bossDefeated: this.bossSpawned && !this.enemies.some((u) => u.isBoss),
        });
        if (victoryRes.isVictory) {
          this.triggerMissionVictory(
            enemy.isBoss ? 'SECTOR BOSS DESTROYED! CREDITS SECURED!' : victoryRes.banner
          );
        } else {
          if (enemy.isBoss) {
            const msg =
              this.activeMapRules?.victoryOnEnemyBaseDestroyed && this.enemyBaseAlive
                ? `${unitName.toUpperCase()} DESTROYED! DESTROY THE ENEMY COMMAND CORE!`
                : `${unitName.toUpperCase()} DESTROYED! ELIMINATE REMAINING ESCORT!`;
            this.setStatusBanner(msg, 3.2);
          }
          this.saveProgress();
        }
      }
    } else if (!this.inSmoke && !this.isSegmentInSmoke(enemy.x, enemy.z, this.playerX, this.playerZ)) {
      enemy.alertTarget = { x: this.playerX, z: this.playerZ };
      enemy.alertTimer = ENEMY_VISIBILITY.MEMORY_DURATION_SEC;
      enemy.aiTimer = 0;
      if (enemy.radioCooldown <= 0) {
        this.broadcastPlayerLocationFrom(enemy, this.playerX, this.playerZ);
      }
    }
  }

  damagePlayer(dmg, componentHit = null) {
    if (!(dmg > 0) || this.playerHp <= 0) return;
    this.playerHp -= dmg;
    if (componentHit) this.tryDamageComponent(dmg, componentHit);
    this.screenShake = Math.max(this.screenShake, 0.4);
    sound.playArmorHit({ x: this.playerX, z: this.playerZ });

    const triggerThreshold = this.playerMaxHp * REPAIR_KIT.TRIGGER_RATIO;
    if (
      this.repairKitCount > 0 &&
      (this.playerHp <= triggerThreshold || this.playerHp <= DURABILITY.ZERO_HP)
    ) {
      this.repairKitCount--;
      this.playerHp = Math.max(1, this.playerHp) + REPAIR_KIT.RESTORE_AMOUNT;
      sound.playPowerUp();
      sound.playEngineerWeld({ x: this.playerX, z: this.playerZ });
      this.spawnSparks(this.playerX, 0.9, this.playerZ, 0x10b981, 14);
      this.setStatusBanner(
        `EMERGENCY REPAIR KIT TRIGGERED! RESTORED +${REPAIR_KIT.RESTORE_AMOUNT} HP`,
        3.0
      );
      this.emitHudUpdate();
      return;
    }

    if (this.playerHp <= DURABILITY.ZERO_HP) {
      this.playerHp = 0;
      this.status = GameStatus.GAME_OVER;
      this.wasDefeated = true;
      sound.stopEngineLoop();
      sound.playExplosion(1.8, { x: this.playerX, z: this.playerZ });
      this.fx.tankDestroyed(this.playerX, this.playerZ, { boss: false });
      if (this.survivalState) {
        const campaignSave = this.campaignSaveRepo?.loadPlayerSave();
        if (campaignSave) {
          this.survivalState.recordSummary = recordSurvivalRun(
            campaignSave,
            this.survivalState,
            this.kills
          );
          this.campaignSaveRepo.savePlayerSave(campaignSave);
        }
      } else {
        this.restoreAllComponents();
        if (this.activeMissionRun && !this.activeMissionRun.rewardsCommitted) {
          this.lastSettlementSummary = settleMission({
            playerSave: this.playerSave,
            missionRun: this.activeMissionRun,
            outcome: 'defeat',
          });
          this.saveRepo.savePlayerSave(this.playerSave);
          this.saveRepo.recordMissionRun(this.activeMissionRun);
        }
        this.syncCampaignCredits();
        this.saveProgress();
      }
      this.emitHudUpdate();
    }
  }

  updatePowerUps(dt, elapsed) {
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const item = this.powerUps[i];
      item.mesh.rotation.y = elapsed * 1.2;
      item.mesh.position.y = Math.sin(elapsed * 3) * 0.1;
      const grounded = item.mesh.userData.grounded;
      if (grounded) {
        grounded.position.y = -item.mesh.position.y;
        grounded.rotation.y = -item.mesh.rotation.y;
      }

      if (Math.hypot(this.playerX - item.x, this.playerZ - item.z) <= 1.3) {
        if (!isUsefulPowerUp(item.type, this)) continue;
        this.applyPowerUp(item.type);
        this.entityGroup.remove(item.mesh);
        this.powerUps.splice(i, 1);
      }
    }
  }

  applyPowerUp(type) {
    sound.playPowerUp();

    switch (type) {
      case POWERUP.REPAIR:
        if (
          this.playerHp >= this.playerMaxHp &&
          this.repairKitState.charges < this.repairKitState.maxCharges
        ) {
          this.repairKitState.charges++;
          this.persistRepairKitCharges();
          this.setStatusBanner(
            'RM-1 FIELD REPAIR KIT ACQUIRED / PRESS [1] TO REPAIR',
            2.6
          );
        } else {
          const maxOverheal = this.playerMaxHp * DURABILITY.OVERHEAL_MAX_RATIO;
          this.playerHp = Math.min(
            maxOverheal,
            this.playerHp + DURABILITY.REPAIR_POWERUP
          );
          this.setStatusBanner(
            `HULL REPAIRED: +${DURABILITY.REPAIR_POWERUP} HP (OVERHEAL UP TO 140%)`,
            2.6
          );
        }
        break;

      case POWERUP.EMP:
        this.empTimer = POWERUP_TYPES[POWERUP.EMP].duration;
        this.setStatusBanner(
          'EMP BLAST ACTIVATED! ALL HOSTILE ARMOR DISABLED FOR 10s!',
          2.8
        );
        break;

      case POWERUP.BASE_RESTORE:
        this.restoreCommandBase();
        break;

      case POWERUP.APS:
        this.addApsRounds(APS.PICKUP_ROUNDS);
        this.setStatusBanner(
          `ACTIVE PROTECTION SYSTEM (APS): +${APS.PICKUP_ROUNDS} INTERCEPT CHARGES`,
          2.6
        );
        break;

      case POWERUP.AMMO: {
        const maxShells = this.getPlayerMaxCannonAmmo();
        this.cannonAmmo = Math.min(maxShells, this.cannonAmmo + CANNON_AMMO.PICKUP_AMMO);
        this.playerSave.cannonAmmo = this.cannonAmmo;
        this.saveRepo.savePlayerSave(this.playerSave);
        this.setStatusBanner(`AMMO CRATE COLLECTED: +${CANNON_AMMO.PICKUP_AMMO} SHELLS (${this.cannonAmmo}/${maxShells})`, 2.5);
        break;
      }

      case POWERUP.MISSILE: {
        const maxMissiles = this.getPlayerMaxMissileAmmo();
        this.missileAmmo = Math.min(
          maxMissiles,
          this.missileAmmo + MISSILE.PICKUP_AMMO
        );
        this.playerSave.missileAmmo = this.missileAmmo;
        this.saveRepo.savePlayerSave(this.playerSave);
        this.recomputePlayerStats(true);
        this.setStatusBanner(
          `HOMING ATGM MISSILE ACQUIRED (${this.missileAmmo}/${maxMissiles}) [SPACE / RMB]`,
          2.6
        );
        break;
      }
    }

    this.emitHudUpdate();
  }

  updateLasers(dt) {
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      l.life -= dt;
      if (l.life <= 0) {
        this.fxGroup.remove(l.mesh);
        this.lasers.splice(i, 1);
      } else {
        const ratio = l.life / l.maxLife;
        l.mesh.material.opacity = ratio;
      }
    }
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
  getRigMuzzle(rig, x, z, dirX, dirZ, fallbackDist = 1.4, out = { x: 0, y: 0.85, z: 0 }) {
    if (rig?.muzzleFlash) {
      rig.muzzleFlash.updateWorldMatrix(true, false);
      const v = rig.muzzleFlash.getWorldPosition(this._tmpMuzzle || (this._tmpMuzzle = new THREE.Vector3()));
      out.x = v.x;
      out.y = v.y;
      out.z = v.z;
      return out;
    }
    out.x = x + dirX * fallbackDist;
    out.y = 0.85;
    out.z = z + dirZ * fallbackDist;
    return out;
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        if (pt.inCodex) {
          this.codexFxGroup.remove(pt.mesh);
        } else {
          this.fxGroup.remove(pt.mesh);
        }
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

  updateCamera(dt, elapsed) {
    if (this.codexOpen) {
      this.camera.position.set(11.5, 9.2, 11.5);
      this.camera.lookAt(0, 0.65, 0);
      return;
    }

    if (this.inspectMode) {
      const orbitAngle = elapsed * 0.45;
      const radius = 14;
      this.camCurrentLook.x = THREE.MathUtils.damp(
        this.camCurrentLook.x,
        this.playerX,
        8,
        dt
      );
      this.camCurrentLook.z = THREE.MathUtils.damp(
        this.camCurrentLook.z,
        this.playerZ,
        8,
        dt
      );
      this.camera.position.set(
        this.camCurrentLook.x + Math.cos(orbitAngle) * radius,
        11.5,
        this.camCurrentLook.z + Math.sin(orbitAngle) * radius
      );
      this.camera.lookAt(this.camCurrentLook.x, 0.75, this.camCurrentLook.z);
      return;
    }

    if (this.status === GameStatus.MENU) {
      const radius = 44;
      const angle = elapsed * 0.16;
      this.camera.position.set(
        Math.cos(angle) * radius,
        36,
        Math.sin(angle) * radius
      );
      this.camera.lookAt(0, 0, 0);
      return;
    }

    const halfArena = (GRID_SIZE * TILE_SIZE) / 2;
    const panLimit = Math.max(8, halfArena - 9);
    const targetX = THREE.MathUtils.clamp(
      this.playerX * 0.76 + this.aimWorld.x * 0.24,
      -panLimit,
      panLimit
    );
    const targetZ = THREE.MathUtils.clamp(
      this.playerZ * 0.76 + this.aimWorld.z * 0.24,
      -panLimit,
      panLimit
    );

    this.camCurrentLook.x = THREE.MathUtils.damp(
      this.camCurrentLook.x,
      targetX,
      6.5,
      dt
    );
    this.camCurrentLook.z = THREE.MathUtils.damp(
      this.camCurrentLook.z,
      targetZ,
      6.5,
      dt
    );

    let horizontalDist = 36.8;
    let offsetY = 32;

    if (this.cameraPreset === 'TACTICAL_HIGH') {
      horizontalDist = 29.7;
      offsetY = 48;
    } else if (this.cameraPreset === 'CLOSE_COMBAT') {
      horizontalDist = 25.4;
      offsetY = 22;
    }

    const offsetX = Math.sin(this.cameraAzimuth) * horizontalDist;
    const offsetZ = Math.cos(this.cameraAzimuth) * horizontalDist;

    let shakeX = 0;
    let shakeZ = 0;
    if (this.screenShake > 0.01) {
      shakeX = (Math.random() - 0.5) * this.screenShake * 1.6;
      shakeZ = (Math.random() - 0.5) * this.screenShake * 1.6;
      this.screenShake = THREE.MathUtils.damp(this.screenShake, 0, 8, dt);
    } else {
      this.screenShake = 0;
    }

    this.camera.position.set(
      this.camCurrentLook.x + offsetX + shakeX,
      offsetY,
      this.camCurrentLook.z + offsetZ + shakeZ
    );
    this.camera.lookAt(this.camCurrentLook.x, 0, this.camCurrentLook.z);
  }

  checkTankEnemyCollision(e, testX, testZ, radius) {
    for (let i = 0; i < this.enemies.length; i++) {
      const other = this.enemies[i];
      if (other === e) continue;
      const otherRadius = other.isBoss ? 1.12 : 0.72;
      const minDist = radius + otherRadius;
      const minDistSq = minDist * minDist;

      const curDistSq = (e.x - other.x) ** 2 + (e.z - other.z) ** 2;
      const nextDistSq = (testX - other.x) ** 2 + (testZ - other.z) ** 2;

      if (nextDistSq < minDistSq && nextDistSq < curDistSq) {
        return true;
      }
    }
    return false;
  }

  resolveEnemyCollisions() {
    const count = this.enemies.length;
    for (let i = 0; i < count; i++) {
      const a = this.enemies[i];
      if (!a) continue;
      const aRadius = a.isBoss ? 1.12 : 0.72;

      for (let j = i + 1; j < count; j++) {
        const b = this.enemies[j];
        if (!b) continue;
        const bRadius = b.isBoss ? 1.12 : 0.72;
        const minDist = aRadius + bRadius;

        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          let nx = 1;
          let nz = 0;
          if (dist > 1e-4) {
            nx = dx / dist;
            nz = dz / dist;
          } else {
            const angle = ((a.id * 73 + b.id * 37) % 360) * (Math.PI / 180);
            nx = Math.cos(angle);
            nz = Math.sin(angle);
          }
          const overlap = minDist - dist;

          let aWeight = 0.5;
          let bWeight = 0.5;
          if (a.isBoss && !b.isBoss) {
            aWeight = 0.0;
            bWeight = 1.0;
          } else if (b.isBoss && !a.isBoss) {
            aWeight = 1.0;
            bWeight = 0.0;
          }

          if (aWeight > 0) {
            const pushAx = a.x - nx * overlap * aWeight;
            const pushAz = a.z - nz * overlap * aWeight;
            if (!this.checkTankWallCollision(pushAx, a.z, aRadius, a.stats.canCrossWater)) {
              a.x = pushAx;
            }
            if (!this.checkTankWallCollision(a.x, pushAz, aRadius, a.stats.canCrossWater)) {
              a.z = pushAz;
            }
          }

          if (bWeight > 0) {
            const pushBx = b.x + nx * overlap * bWeight;
            const pushBz = b.z + nz * overlap * bWeight;
            if (!this.checkTankWallCollision(pushBx, b.z, bRadius, b.stats.canCrossWater)) {
              b.x = pushBx;
            }
            if (!this.checkTankWallCollision(b.x, pushBz, bRadius, b.stats.canCrossWater)) {
              b.z = pushBz;
            }
          }
        }
      }
    }
  }

  checkTankWallCollision(x, z, radius, canCrossWater = false) {
    if (this.defenseTurrets && this.defenseTurrets.length > 0) {
      for (const t of this.defenseTurrets) {
        if (t.alive && Math.hypot(x - t.x, z - t.z) < radius + t.radius) {
          return true;
        }
      }
    }

    const half = (GRID_SIZE * TILE_SIZE) / 2;
    if (
      x - radius < -half ||
      x + radius > half ||
      z - radius < -half ||
      z + radius > half
    ) {
      return true;
    }

    const minCol = Math.max(0, Math.floor((x - radius + half) / TILE_SIZE));
    const maxCol = Math.min(
      GRID_SIZE - 1,
      Math.floor((x + radius + half) / TILE_SIZE)
    );
    const minRow = Math.max(0, Math.floor((z - radius + half) / TILE_SIZE));
    const maxRow = Math.min(
      GRID_SIZE - 1,
      Math.floor((z + radius + half) / TILE_SIZE)
    );

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = this.grid[r]?.[c];
        if (!cell) continue;
        if (
          cell.type === TileType.BOXES || cell.type === TileType.BRICK ||
          cell.type === TileType.CONCRETE ||
          cell.type === TileType.BASE ||
          cell.type === TileType.ENEMY_BASE ||
          cell.type === TileType.HEDGEHOG ||
          cell.type === TileType.BARREL ||
          (cell.type === TileType.WATER && !canCrossWater)
        ) {
          return true;
        }
      }
    }

    return false;
  }

  lerpAngle(current, target, alpha) {
    let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return current + diff * Math.min(1, alpha);
  }

  emitHudUpdate() {
    const sector = SECTORS[this.currentSectorIndex];
    const boss = this.enemies.find((e) => e.isBoss);
    const spawnersRemaining = this.getSpawnerCells().length;

    const cannonSpec =
      PLAYER_UPGRADES[UPGRADE.CANNON][(this.effectiveUpgrades.cannon || 1) - 1];
    const baseChassisSpec =
      PLAYER_UPGRADES[UPGRADE.CHASSIS][(this.effectiveUpgrades.chassis || 1) - 1];
    const chassisSpec = baseChassisSpec;
    const frameSpec =
      PLAYER_UPGRADES[UPGRADE.FRAME][(this.effectiveUpgrades.frame || 1) - 1];
    const engineSpec =
      PLAYER_UPGRADES[UPGRADE.ENGINE][(this.effectiveUpgrades.engine || 1) - 1];
    const armorSpec =
      PLAYER_UPGRADES[UPGRADE.ARMOR][(this.effectiveUpgrades.armor || 1) - 1];

    const apsTotal = this.apsAmmo.reduce((a, b) => a + b, 0);

    let observedTarget = null;
    const priorityUnit = this.enemies.find((e) => e.id === this.priorityTargetId);
    const aimedUnit =
      priorityUnit ||
      this.enemies.find((e) => Math.hypot(e.x - this.aimWorld.x, e.z - this.aimWorld.z) <= 2.4);
    if (aimedUnit) {
      observedTarget = {
        id: aimedUnit.id,
        name: aimedUnit.name,
        condition: getObservedEnemyCondition(aimedUnit),
        isPriority: aimedUnit.id === this.priorityTargetId,
        aiState: this.aiDebugMode ? aimedUnit.ai?.state : null,
        aiActions: this.aiDebugMode ? this.enemyActionSummary(aimedUnit) : null,
      };
    }

    const sensorContactsList = Array.from(this.sensorContacts.values()).map((c) => ({
      enemyId: c.enemyId,
      x: c.x,
      z: c.z,
      active: c.active,
      age: c.age,
      source: c.source,
    }));

    const snapshot = {
      status: this.status,
      sectorId: this.currentSectorIndex,
      credits: this.playerSave?.credits ?? 0,
      creditsEarnedThisMission: this.creditsEarnedThisMission || 0,
      isHangarOpen: this.isHangarOpen,
      isHangarPaused: this.isHangarPaused,
      trackUpgradeCosts: TRACK_UPGRADE_COSTS,
      componentDamage: { ...this.componentDamage },
      effectiveUpgrades: this.effectiveUpgrades,
      playerHp: Math.round(this.playerHp * 10) / 10,
      playerMaxHp: this.playerMaxHp,
      playerStats: this.playerStats,
      cannonName: cannonSpec.name,
      chassisName: chassisSpec.name,
      frameName: frameSpec.name,
      engineName: engineSpec.name,
      armorName: armorSpec.name,
      playerFireCooldown: Math.max(0, this.playerFireCooldown),
      playerMaxFireCooldown: Math.max(0.1, this.playerMaxFireCooldown || this.playerStats?.fireCooldown || 1.25),
      speedKmh: Math.round(Math.abs(this.playerForwardSpeed || 0) * 9.5),
      currentSurface:
        typeof this.currentSurface === 'string'
          ? this.currentSurface
          : this.currentSurface?.label || this.currentSurface?.id || 'asphalt',
      subsystems: this.subsystems,
      playerArmorPanels: this.playerArmorPanels,
      repairKitState: this.repairKitState,
      smokeCharges: this.smokeCharges,
      smokeCooldown: this.smokeCooldown,
      priorityTargetId: this.priorityTargetId,
      observedTarget,
      sensorContacts: sensorContactsList,
      lootContainers: this.lootContainers.map((c) => ({
        id: c.id,
        x: c.x,
        z: c.z,
        status: c.status,
        reward: c.reward,
      })),
      contract: buildContractHudSnapshot(this.contractState, this.playerX, this.playerZ, TILE_SIZE),
      survival: buildSurvivalHudSnapshot(
        this.survivalState,
        this.enemies.length,
        this.vanguardRemainingToSpawn
      ),
      playerSave: this.playerSave,
      assembledTank: this.assembledTank,
      lastSettlementSummary: this.lastSettlementSummary,
      aiDebugMode: this.aiDebugMode,
      manualRoutePoints: this.manualRoutePoints,
      playerX: this.playerX,
      playerZ: this.playerZ,
      playerHullAngle: this.playerHullAngle,
      playerTurretAngle: this.playerTurretAngle,
      cameraAzimuth: this.cameraAzimuth,
      apsAmmo: [...this.apsAmmo],
      apsTotal,
      apsMaxAmmo: this.getPlayerMaxApsAmmo(),
      missileAmmo: this.missileAmmo,
      missileMaxAmmo: this.getPlayerMaxMissileAmmo(),
      cannonAmmo: this.cannonAmmo,
      cannonMaxAmmo: this.getPlayerMaxCannonAmmo(),
      missileCooldown: this.missileCooldown,
      repairKitCount: this.repairKitCount,
      empTimer: this.empTimer,
      jammedTimer: this.jammedTimer,
      inBaseRepairZone: this.inBaseRepairZone,
      baseAlive: this.baseAlive,
      gameMode: this.activeMapRules?.gameMode || sector.gameMode || 'extermination',
      mapModeName: this.activeMapRules?.name || 'Total Extermination',
      mapObjectiveLabel:
        this.activeMapRules?.shortLabel || 'DESTROY ALL HOSTILES',
      defeatOnBaseLoss: Boolean(this.activeMapRules?.defeatOnBaseLoss),
      enemyBaseAlive: Boolean(this.enemyBaseAlive),
      enemyBaseHp: Math.ceil(this.enemyBaseHp || 0),
      enemyBaseMaxHp: this.enemyBaseMaxHp || 48,
      enemyBaseName: this.enemyBaseName || 'Enemy Fortified Citadel',
      enemiesRemaining: this.survivalState
        ? this.enemies.length +
          this.vanguardRemainingToSpawn +
          (this.survivalState.waveSpec?.isBossWave && !this.bossSpawned ? 1 : 0)
        : this.enemies.length +
          this.vanguardRemainingToSpawn +
          (sector.rules.spawnSectorBossOnClear
            ? sector.bossSequence?.length
              ? this.bossSequenceStarted
                ? sector.bossSequence.slice(this.bossStageIndex + 1).reduce((s, st) => s + st.length, 0)
                : sector.bossSequence.reduce((s, st) => s + st.length, 0)
              : !this.bossSpawned
              ? 1
              : 0
            : 0),
      totalEnemiesInSector: this.survivalState
        ? this.survivalState.waveSpec?.totalHostiles || 1
        : sector.vanguardCount +
          (sector.rules.spawnSectorBossOnClear
            ? sector.bossSequence?.length
              ? sector.bossSequence.reduce((s, st) => s + st.length, 0)
              : 1
            : 0),
      spawnersRemaining,
      minesActive: this.mines.length,
      bossActive: Boolean(boss),
      bossName:
        this.enemies.filter((u) => u.isBoss).length > 1
          ? this.enemies
              .filter((u) => u.isBoss)
              .map((u) => u.name)
              .join(' & ')
          : boss?.name ||
            this.survivalState?.waveSpec?.bossName ||
            sector.bossName,
      bossTitle:
        SECTOR_BOSS_CONFIGS[boss?.enemyClass]?.role ||
        this.survivalState?.waveSpec?.bossTitle ||
        sector.bossTitle,
      bossCondition: boss ? getObservedEnemyCondition(boss) : 'INTACT',
      bossHp: boss ? Math.ceil(boss.hp) : 0,
      bossMaxHp: boss ? boss.maxHp : 1,
      bossPhaseLabel: boss
        ? boss.titanOverload
          ? 'OVERLOAD'
          : boss.mammothEnraged || boss.hydraEnraged || boss.infernoEnraged || boss.titanEscortCalled
          ? 'PHASE 2'
          : 'PHASE 1'
        : 'PHASE 1',
      bossPhaseShield: boss ? Math.max(0, Math.round((boss.phaseShieldTimer || 0) * 10) / 10) : 0,
      bossApsCharges: boss ? boss.apsCharges ?? 0 : 0,
      bossApsMaxCharges: boss ? boss.apsMaxCharges ?? 0 : 0,
      inForest: this.inForest,
      inSmoke: this.inSmoke,
      onIce: this.onIce,
      onSand: this.onSand,
      kills: this.kills,
      blocksDestroyed: this.blocksDestroyed,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      statusMessage: this.statusMessage,
    };

    if (typeof this.onHudUpdate === 'function') {
      this.onHudUpdate(snapshot, { ...this.upgrades });
    }
  }

  checkAndIgniteForestOnEnemyKill(enemy) {
    const { row, col } = this.worldToGrid(enemy.x, enemy.z);
    const centerCell = this.grid[row]?.[col];
    const isInsideOrNearForest =
      centerCell?.type === TileType.FOREST || this.hasForestNearby(enemy.x, enemy.z, 1.1);

    if (isInsideOrNearForest) {
      const radius = enemy.isBoss ? 2.2 : 1.35;
      this.igniteForestAt(enemy.x, enemy.z, radius);
    }
  }

  hasForestNearby(x, z, radius) {
    const half = (GRID_SIZE * TILE_SIZE) / 2;
    const minCol = Math.max(0, Math.floor((x - radius + half) / TILE_SIZE));
    const maxCol = Math.min(GRID_SIZE - 1, Math.floor((x + radius + half) / TILE_SIZE));
    const minRow = Math.max(0, Math.floor((z - radius + half) / TILE_SIZE));
    const maxRow = Math.min(GRID_SIZE - 1, Math.floor((z + radius + half) / TILE_SIZE));

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        if (this.grid[r]?.[c]?.type === TileType.FOREST) {
          const pos = this.gridToWorld(r, c);
          if (Math.hypot(pos.x - x, pos.z - z) <= radius + 0.6) return true;
        }
      }
    }
    return false;
  }

  igniteForestAt(x, z, radius = 1.35) {
    const half = (GRID_SIZE * TILE_SIZE) / 2;
    const minCol = Math.max(0, Math.floor((x - radius + half) / TILE_SIZE));
    const maxCol = Math.min(GRID_SIZE - 1, Math.floor((x + radius + half) / TILE_SIZE));
    const minRow = Math.max(0, Math.floor((z - radius + half) / TILE_SIZE));
    const maxRow = Math.min(GRID_SIZE - 1, Math.floor((z + radius + half) / TILE_SIZE));

    let ignitedAny = false;
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = this.grid[r]?.[c];
        if (!cell || cell.type !== TileType.FOREST || cell.isBurning) continue;

        const cellPos = this.gridToWorld(r, c);
        if (Math.hypot(cellPos.x - x, cellPos.z - z) <= radius + 0.6) {
          this.startBurningForest(cell, cellPos.x, cellPos.z);
          ignitedAny = true;
        }
      }
    }
    if (ignitedAny) {
      sound.playFlamethrower();
      this.screenShake = Math.max(this.screenShake, 0.45);
    }
  }

  startBurningForest(cell, x, z) {
    cell.isBurning = true;
    if (cell.mesh) {
      cell.mesh.userData.batchTile = false;
    }
    if (this.tileBatcher) {
      this.tileBatcher.sync();
    }

    this.burningForests.push({
      cell,
      x,
      z,
      timer: 10.0,
      maxTimer: 10.0,
    });
  }

  updateBurningForests(dt, elapsed) {
    for (let i = this.burningForests.length - 1; i >= 0; i--) {
      const bf = this.burningForests[i];
      bf.timer -= dt;

      const progress = THREE.MathUtils.clamp(1 - bf.timer / bf.maxTimer, 0, 1);

      this.fx.flameJet(
        bf.x + (Math.random() - 0.5) * 1.2,
        0.35 + Math.random() * 0.4,
        bf.z + (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3,
        Math.random() * 0.6
      );

      if (Math.random() < 0.4) {
        this.fx.point('smoke', {
          x: bf.x + (Math.random() - 0.5) * 0.9,
          y: 0.7 + Math.random() * 0.6,
          z: bf.z + (Math.random() - 0.5) * 0.9,
          vx: (Math.random() - 0.5) * 0.25,
          vy: 0.9 + Math.random() * 0.9,
          vz: (Math.random() - 0.5) * 0.25,
          life: 1.2,
          size: 0.45,
          size1: 1.5,
          color: [0.15, 0.14, 0.13],
          alpha: 0.55,
          tex: 2,
          ramp: 3,
          fadeIn: 0.1,
          rotV: (Math.random() - 0.5) * 2,
        });
      }

      if (Math.random() < 0.08) {
        this.fx.flash(bf.x, 0.5, bf.z, 0xff5500, 1.8);
      }

      if (bf.cell.mesh) {
        const hScale = Math.max(0.12, 1 - progress * 0.75);
        const wScale = Math.max(0.3, 1 - progress * 0.45);
        bf.cell.mesh.scale.set(wScale, hScale, wScale);
      }

      const distPlayer = Math.hypot(this.playerX - bf.x, this.playerZ - bf.z);
      if (distPlayer < 1.15) {
        this.damagePlayer(2.5 * dt);
        if (Math.random() < 0.2) {
          this.spawnSparks(this.playerX, 0.8, this.playerZ, 0xff7700, 3);
        }
      }
      for (const e of this.enemies) {
        const distE = Math.hypot(e.x - bf.x, e.z - bf.z);
        if (distE < 1.15) {
          e.hp -= 2.5 * dt;
          if (e.hp <= 0.0001) {
            this.damageEnemy(e, 1);
          }
        }
      }

      if (bf.timer <= 0) {
        bf.cell.isBurning = false;

        if (bf.cell.mesh) {
          this.mapGroup.remove(bf.cell.mesh);
          bf.cell.mesh = null;
        }

        bf.cell.type = TileType.SAND;

        const sandMesh = this.modelFactory.createSandBlock(bf.x, bf.z);
        this.mapGroup.add(sandMesh);
        bf.cell.mesh = sandMesh;

        this.fx.blockDestroyed(bf.x, bf.z, 'forest');
        this.fx.flash(bf.x, 0.4, bf.z, 0xffaa44, 2.0);

        if (this.tileBatcher) {
          this.tileBatcher.sync();
        }

        this.burningForests.splice(i, 1);
      }
    }
  }

  dispose() {
    this.isDisposed = true;
    this.hangarStage?.dispose();
    this.modelFactory.brickModels.dispose();
    this.pendingBarrelExplosions = [];
    this.clearAiDebugOverlay();
    this.clock?.dispose();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pointerup', this.handlePointerUp);

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointermove', this.handlePointerMove);
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    canvas.removeEventListener('wheel', this.handleWheel);

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
