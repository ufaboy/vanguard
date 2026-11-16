import test from 'node:test';
import assert from 'node:assert/strict';
import { EnemyClass, TileType } from '../public/src/game/types.js';
import { MAP_MODES, VICTORY_CONDITIONS, resolveMapRules } from '../public/src/game/mapRules.js';
import { SECTORS } from '../public/src/game/levels.js';
import {
  SURVIVAL_CONFIG,
  buildSurvivalWaveSpec,
  createDefaultSurvivalRecords,
  createSurvivalState,
  recordSurvivalRun,
  buildSurvivalHudSnapshot,
} from '../public/src/sim/survival.js';

test('Survival mode rules and SECTORS registration for Paris: Last Stand', () => {
  const sector = SECTORS.find((s) => s.mapId === 'survival-paris-last-stand');
  assert.ok(sector, 'survival-paris-last-stand should be registered in SECTORS');
  assert.equal(sector.gameMode, MAP_MODES.SURVIVAL);
  assert.equal(sector.defeatOnBaseLoss, true);
  assert.equal(sector.baseMaxHp, 120);
  assert.equal(sector.baseModel, 'ELYSEE');
  assert.deepEqual(sector.baseFootprint, { cols: 4, rows: 2 });
  assert.equal(sector.landmarks3d.length, 6);
  assert.ok(sector.mines.length >= 25);
  assert.equal(sector.victoryCondition, VICTORY_CONDITIONS.ENDLESS_SURVIVAL);

  // Verify 4x2 Élysée HQ footprint is marked as TileType.BASE
  for (let dr = 0; dr < 2; dr++) {
    for (let dc = 0; dc < 4; dc++) {
      assert.equal(
        sector.grid[sector.baseCell.row + dr][sector.baseCell.col + dc],
        TileType.BASE
      );
    }
  }

  const rules = resolveMapRules({ gameMode: 'survival' });
  assert.equal(rules.gameMode, MAP_MODES.SURVIVAL);
  assert.equal(rules.defeatOnBaseLoss, true);
  assert.equal(rules.victoryOnAllEnemiesDestroyed, false);
  assert.equal(rules.spawnSectorBossOnClear, false);
});

test('buildSurvivalWaveSpec produces deterministic waves, Wave 7 finale boss, and Overtime boss rotation', () => {
  const w1 = buildSurvivalWaveSpec(1);
  assert.equal(w1.wave, 1);
  assert.equal(w1.isBossWave, false);
  assert.equal(w1.totalHostiles, w1.roster.length);

  const w5 = buildSurvivalWaveSpec(5);
  assert.equal(w5.isBossWave, false);

  const w7 = buildSurvivalWaveSpec(7);
  assert.equal(w7.isBossWave, true);
  assert.equal(w7.bossClass, EnemyClass.BOSS_MAMMOTH);
  assert.equal(w7.totalHostiles, w7.roster.length + 1);

  const w10 = buildSurvivalWaveSpec(10);
  assert.equal(w10.isBossWave, true);
  assert.equal(w10.bossClass, EnemyClass.BOSS_HYDRA);

  const w15 = buildSurvivalWaveSpec(15);
  assert.equal(w15.isBossWave, true);
  assert.equal(w15.bossClass, EnemyClass.BOSS_INFERNO);

  const w20 = buildSurvivalWaveSpec(20);
  assert.equal(w20.isBossWave, true);
  assert.equal(w20.bossClass, EnemyClass.BOSS_TITAN);

  const w25 = buildSurvivalWaveSpec(25);
  assert.equal(w25.isBossWave, true);
  assert.equal(w25.bossClass, EnemyClass.BOSS_MAMMOTH);
  assert.equal(w25.roster.length, w7.roster.length + 3);

  const w18 = buildSurvivalWaveSpec(18);
  assert.equal(w18.isBossWave, false);
  assert.ok(w18.roster.length > buildSurvivalWaveSpec(14).roster.length);
});

test('recordSurvivalRun updates personal Survival Records without modifying persistent credits or upgrades', () => {
  const playerSave = {
    credits: 4200,
    upgrades: { cannon: 4, chassis: 3, frame: 3, engine: 4, armor: 3 },
    survivalRecords: createDefaultSurvivalRecords(),
  };

  const state = createSurvivalState();
  state.wave = 7;
  state.wavesCleared = 6;
  state.elapsedSec = 420;
  state.victoryAchieved = true;
  state.bossesDefeated = 1;

  const summary = recordSurvivalRun(playerSave, state, 58, { victoryAchieved: true });
  assert.equal(summary.isNewWaveRecord, true);
  assert.equal(summary.isNewKillRecord, true);
  assert.equal(summary.isNewTimeRecord, true);
  assert.equal(summary.victoryAchieved, true);
  assert.equal(playerSave.survivalRecords.bestWave, 7);
  assert.equal(playerSave.survivalRecords.bestWavesCleared, 6);
  assert.equal(playerSave.survivalRecords.bestKills, 58);
  assert.equal(playerSave.survivalRecords.bestTimeSec, 420);
  assert.equal(playerSave.survivalRecords.bestHoldSec, 420);
  assert.equal(playerSave.survivalRecords.parisVictories, 1);
  assert.equal(playerSave.survivalRecords.totalRuns, 1);
  assert.equal(playerSave.survivalRecords.bossesDefeated, 1);
  assert.equal(playerSave.credits, 4200);
  assert.deepEqual(playerSave.upgrades, { cannon: 4, chassis: 3, frame: 3, engine: 4, armor: 3 });

  const snap = buildSurvivalHudSnapshot(state, 3, 2);
  assert.equal(snap.wave, 7);
  assert.equal(snap.hostilesRemaining, 5);
  assert.equal(snap.holdRemainingSec, 0);
  assert.equal(snap.victoryAchieved, true);
  assert.equal(snap.earlyCallBonus, SURVIVAL_CONFIG.EARLY_CALL_BONUS);
});

test('Paris LandmarkModels procedural fallback and footprint helpers cover all landmarks', async () => {
  const {
    PLACEABLE_LANDMARKS,
    landmarkBlockedCells,
    landmarkFootprintCenter,
    LandmarkModels,
  } = await import('../public/src/game/terrains/landmarks.js');

  assert.equal(PLACEABLE_LANDMARKS.length, 6);
  const eiffelBlocked = landmarkBlockedCells({ kind: 'EIFFEL_TOWER', row: 33, col: 6 });
  assert.equal(eiffelBlocked.length, 4);
  const arcBlocked = landmarkBlockedCells({ kind: 'ARC_DE_TRIOMPHE', row: 7, col: 6 });
  assert.equal(arcBlocked.length, 4);
  const center = landmarkFootprintCenter('ELYSEE', 18, 18, (r, c) => ({ x: c * 2, z: r * 2 }));
  assert.deepEqual(center, { x: 39, z: 37 });

  const models = new LandmarkModels();
  for (const kind of [...PLACEABLE_LANDMARKS, 'ELYSEE', 'ELYSEE_RUINED', 'MINE_SIGN']) {
    const group = models.create(kind);
    assert.ok(group && group.children.length > 0, `${kind} should create a populated 3D group`);
  }
  assert.ok(models.createBridge(2, 2).children.length > 0, 'bridge should create a populated 3D group');
  assert.equal(models.getMaterials().stone.userData?.landmarkFinishApplied, true);
});

test('HQ (TileType.BASE) blocks player cannon shells and direct line of sight across it', async () => {
  const { hasGridLineOfSight } = await import('../public/src/sim/behavior/navgrid.js');
  const { ProjectilesController } = await import('../public/src/game/engine/projectiles.js');
  const sector = SECTORS.find((s) => s.mapId === 'survival-paris-last-stand');

  // North of Élysée HQ (row 17, col 19) to South of Élysée HQ (row 20, col 19) crosses BASE at rows 18..19
  assert.equal(
    hasGridLineOfSight(sector.grid, { row: 17, col: 19 }, { row: 20, col: 19 }),
    false,
    'line of sight across the 4x2 Élysée HQ should be blocked'
  );

  let baseDamaged = false;
  let masonryHitCalled = false;
  const engine = {
    grid: sector.grid.map((row) => row.map((type) => ({ type }))),
    enemies: [],
    mines: [],
    defenseTurrets: [],
    projectiles: [
      {
        x: 0,
        z: 0,
        vx: 0,
        vz: -10,
        speed: 10,
        life: 1.0,
        fromPlayer: true,
        isMissile: false,
        mesh: { position: { set() {} }, rotation: { y: 0 } },
      },
    ],
    fxGroup: { remove() {} },
    fx: {
      shellTrail() {},
      masonryHit() {
        masonryHitCalled = true;
      },
    },
    terrainDestruction: {
      damageCommandBase() {
        baseDamaged = true;
      },
    },
    emitProjectileTrail() {},
    tryBossApsIntercept: () => false,
    worldToGrid: () => ({ row: 18, col: 19 }),
    removeProjectile(idx) {
      this.projectiles.splice(idx, 1);
    },
  };
  const ctrl = new ProjectilesController(engine);
  ctrl.updateProjectiles(0.016);

  assert.equal(engine.projectiles.length, 0, 'player shell should stop on HQ cell');
  assert.equal(masonryHitCalled, true, 'player shell hitting HQ should spawn masonry impact FX');
  assert.equal(baseDamaged, false, 'player shell should not deal friendly-fire damage to HQ');
});
