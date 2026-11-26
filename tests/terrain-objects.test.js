import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { TileType, SURFACE_CONFIGS, SURFACE_TYPES } from '../public/src/game/terrains/surfaces.js';
import { canPlaceOnSurface, cellMovement, isTilePassable } from '../public/src/game/terrains/layers.js';
import { PROP_KINDS, railCurveCells, unpackTerrain } from '../public/src/game/terrains/terrain-format.js';
import { validateRailroadLayout } from '../public/src/game/terrains/rail-rules.js';
import { TacticalModels } from '../public/src/game/terrains/tactical-models.js';
import { packTerrain } from '../editor/src/terrain-pack.js';

test('canPlaceOnSurface enforces rules for new surfaces and objects', () => {
  assert.equal(canPlaceOnSurface(TileType.RAIL_CAR, TileType.RAIL), true);
  assert.equal(canPlaceOnSurface(TileType.RAIL_CAR, TileType.EMPTY), false);
  assert.equal(canPlaceOnSurface(TileType.RAIL_CAR, TileType.ROAD), false);
  assert.equal(canPlaceOnSurface(TileType.RAIL_CAR, TileType.WATER), false);
  assert.equal(canPlaceOnSurface(TileType.LOCOMOTIVE, TileType.RAIL), true);
  assert.equal(canPlaceOnSurface(TileType.LOCOMOTIVE, TileType.EMPTY), false);

  for (const obj of [TileType.CONTAINER, TileType.TRANSFORMER, TileType.SANDBAGS]) {
    assert.equal(canPlaceOnSurface(obj, TileType.EMPTY), true);
    assert.equal(canPlaceOnSurface(obj, TileType.ROAD), true);
    assert.equal(canPlaceOnSurface(obj, TileType.RAIL), true);
    assert.equal(canPlaceOnSurface(obj, TileType.WATER), false);
    assert.equal(canPlaceOnSurface(obj, TileType.ICE), false);
  }
});

test('cellMovement applies RAIL speed bonus dynamically from SURFACE_CONFIGS', () => {
  const cfg = SURFACE_CONFIGS[SURFACE_TYPES.RAIL];
  const mv = cellMovement({ surface: TileType.RAIL, object: null }, {});
  assert.equal(mv.speedMultiplier, cfg.speedMultiplier);
  assert.equal(mv.accelMultiplier, cfg.accelMultiplier);
});

test('isTilePassable allows SANDBAGS only when canCrushSandbags is true', () => {
  assert.equal(isTilePassable(TileType.SANDBAGS, false, false), false);
  assert.equal(isTilePassable(TileType.SANDBAGS, true, false), false);
  assert.equal(isTilePassable(TileType.SANDBAGS, false, true), true);
  assert.equal(isTilePassable(TileType.CONTAINER, false, true), false);
  assert.equal(isTilePassable(TileType.TRANSFORMER, false, true), false);
  assert.equal(isTilePassable(TileType.RAIL_CAR, false, true), false);
  assert.equal(isTilePassable(TileType.LOCOMOTIVE, false, true), false);
  assert.equal(isTilePassable(TileType.RAIL, false, false), true);
});

test('unpackTerrain and packTerrain round-trip new tiles and props', () => {
  const terrain = {
    rail: [[10, 5, 1, 4]],
    rail_car: [[10, 6, 1, 2, 2]],
    locomotive: [[10, 8]],
    container: [[12, 8, 1, 2, 3]],
    transformer: [[14, 14]],
    sandbags: [[16, 10, 1, 3]],
    prop: [['lamp', 18, 19], ['car', 20, 12, 90]],
  };
  const unpacked = unpackTerrain(terrain, 40);
  assert.equal(unpacked.surfaceGrid[10][5], TileType.RAIL);
  assert.equal(unpacked.objectGrid[10][6], TileType.RAIL_CAR);
  assert.equal(unpacked.tacticalStyles[10][6], 2);
  assert.equal(unpacked.objectGrid[10][8], TileType.LOCOMOTIVE);
  assert.equal(unpacked.objectGrid[12][8], TileType.CONTAINER);
  assert.equal(unpacked.tacticalStyles[12][8], 3);
  assert.equal(unpacked.objectGrid[14][14], TileType.TRANSFORMER);
  assert.equal(unpacked.objectGrid[16][12], TileType.SANDBAGS);
  assert.equal(unpacked.props.length, 2);
  assert.deepEqual(unpacked.props[1], { kind: 'car', row: 20, col: 12, rotation: 90 });

  const repacked = packTerrain({
    surfaceGrid: unpacked.surfaceGrid,
    objectGrid: unpacked.objectGrid,
    tacticalStyles: unpacked.tacticalStyles,
    objectRotations: unpacked.objectRotations,
    fixedObjects: unpacked.fixedObjects,
    railBridges: unpacked.railBridges,
    props: unpacked.props,
  });
  assert.deepEqual(repacked.rail, [[10, 5, 1, 4]]);
  assert.deepEqual(repacked.rail_car, [[10, 6, 1, 2, 2]]);
  assert.deepEqual(repacked.fixed_object, [
    ['locomotive', 10, 8, 'ns'],
    ['container', 12, 8, 'ew', 3],
  ]);
  assert.deepEqual(repacked.transformer, [[14, 14]]);
  assert.deepEqual(repacked.sandbags, [[16, 10, 1, 3]]);
  assert.deepEqual(repacked.prop, [['lamp', 18, 19], ['car', 20, 12, 90]]);
});

test('unpackTerrain and packTerrain round-trip fixed_object 4-way rotations and rail_bridge', () => {
  const terrain = {
    water: [[5, 10, 1, 3]],
    rail_bridge: [[5, 10, 1, 3]],
    fixed_object: [
      ['locomotive', 5, 10, 'ew'],
      ['container', 12, 12, 'ns', 2],
    ],
    rotations: [[5, 10, 1, 2, 270], [12, 12, 2, 1, 180]],
  };
  const unpacked = unpackTerrain(terrain, 40);
  assert.equal(unpacked.railBridges.length, 3);
  assert.equal(unpacked.objectGrid[5][10], TileType.LOCOMOTIVE);
  assert.equal(unpacked.objectGrid[5][11], TileType.LOCOMOTIVE);
  assert.equal(unpacked.objectGrid[5][12], TileType.RAIL_BRIDGE);
  assert.equal(unpacked.objectRotations[5][10], 270);
  assert.equal(unpacked.objectRotations[12][12], 180);

  const repacked = packTerrain({
    surfaceGrid: unpacked.surfaceGrid,
    objectGrid: unpacked.objectGrid,
    tacticalStyles: unpacked.tacticalStyles,
    objectRotations: unpacked.objectRotations,
    fixedObjects: unpacked.fixedObjects,
    railBridges: unpacked.railBridges,
  });
  const reUnpacked = unpackTerrain(repacked, 40);
  assert.equal(reUnpacked.railBridges.length, 3);
  assert.equal(reUnpacked.objectRotations[5][10], 270);
  assert.equal(reUnpacked.objectRotations[12][12], 180);
  assert.deepEqual(reUnpacked.fixedObjects, unpacked.fixedObjects);
});

test('unpackTerrain and packTerrain round-trip objectRotations and decal rotation', () => {
  const terrain = {
    brick: [[5, 5, 2, 2], [9, 9]],
    transformer: [[12, 14]],
    rotations: [[5, 5, 2, 2, 90], [9, 9, 180], [12, 14, 270]],
    decal: [['chevron', 20, 22, 1, null, 270]],
  };
  const unpacked = unpackTerrain(terrain, 40);
  assert.equal(unpacked.objectRotations[5][5], 90);
  assert.equal(unpacked.objectRotations[6][6], 90);
  assert.equal(unpacked.objectRotations[9][9], 180);
  assert.equal(unpacked.objectRotations[12][14], 270);
  assert.equal(unpacked.objectRotations[0][0], 0);
  assert.equal(unpacked.decals[0].rotation, 270);

  const repacked = packTerrain({
    surfaceGrid: unpacked.surfaceGrid,
    objectGrid: unpacked.objectGrid,
    objectRotations: unpacked.objectRotations,
    decals: unpacked.decals,
  });
  assert.deepEqual(repacked.rotations, [[5, 5, 2, 2, 90], [9, 9, 180], [12, 14, 270]]);
  assert.deepEqual(repacked.decal, [['chevron', 20, 22, 1, null, 270]]);

  // Zero-rotation grids omit terrain.rotations completely
  const zeroUnpacked = unpackTerrain({ brick: [[3, 3]] }, 40);
  const zeroRepacked = packTerrain({
    surfaceGrid: zeroUnpacked.surfaceGrid,
    objectGrid: zeroUnpacked.objectGrid,
    objectRotations: zeroUnpacked.objectRotations,
  });
  assert.equal(zeroRepacked.rotations, undefined);
});

test('railCurveCells and rail_curve round-trip across all 4 rotations', () => {
  for (const rot of [0, 90, 180, 270]) {
    const cells = railCurveCells(10, 20, rot);
    assert.equal(cells.length, 5);
    for (const c of cells) {
      assert.equal(c.row >= 10 && c.row <= 12, true);
      assert.equal(c.col >= 20 && c.col <= 22, true);
    }
  }
  assert.deepEqual(railCurveCells(10, 20, 0)[0], { row: 12, col: 20 });
  assert.deepEqual(railCurveCells(10, 20, 0)[4], { row: 10, col: 22 });

  const terrain = {
    rail: [[13, 20], [10, 23]],
    rail_curve: [[10, 20], [15, 25, 90]],
  };
  const unpacked = unpackTerrain(terrain, 40);
  assert.equal(unpacked.railCurves.length, 2);
  assert.equal(unpacked.surfaceGrid[12][20], TileType.RAIL);
  assert.equal(unpacked.surfaceGrid[11][21], TileType.RAIL);
  assert.equal(unpacked.surfaceGrid[10][22], TileType.RAIL);
  assert.equal(unpacked.surfaceGrid[17][27], TileType.RAIL);
  assert.equal(unpacked.surfaceGrid[15][25], TileType.RAIL);

  const repacked = packTerrain({
    surfaceGrid: unpacked.surfaceGrid,
    objectGrid: unpacked.objectGrid,
    railCurves: unpacked.railCurves,
  });
  assert.deepEqual(repacked.rail_curve, [[10, 20], [15, 25, 90]]);
  // Curve cells must not be duplicated into terrain.rail
  assert.deepEqual(repacked.rail, [[10, 23], [13, 20]]);
});

test('validateRailroadLayout enforces continuity, curve limit, no 90° turns, and train consist', () => {
  // Valid line with coupled loco + rail_car, standalone rail_car, and dead-end
  const valid = unpackTerrain({
    rail: [[10, 5, 1, 10]],
    locomotive: [[10, 6, 1, 2]],
    rail_car: [[10, 8, 1, 2], [10, 12]],
  }, 40);
  assert.equal(validateRailroadLayout(valid).ok, true);

  // Valid 2 curves
  const twoCurves = unpackTerrain({
    rail: [[10, 2, 1, 5]],
    locomotive: [[10, 2, 1, 2]],
    rail_car: [[10, 4]],
    rail_curve: [[10, 10], [15, 15, 90]],
  }, 40);
  assert.equal(validateRailroadLayout(twoCurves).ok, true);

  // 3 curves -> rail_curve_limit
  const threeCurves = unpackTerrain({
    rail: [[10, 2, 1, 5]],
    locomotive: [[10, 2, 1, 2]],
    rail_car: [[10, 4]],
    rail_curve: [[10, 10], [15, 15, 90], [20, 20, 180]],
  }, 40);
  assert.equal(validateRailroadLayout(threeCurves).issues.some((i) => i.code === 'rail_curve_limit'), true);

  // Sharp 90° L-corner & T-junction -> rail_right_angle_turn, but full '+' crossing -> ok
  const sharpCorner = unpackTerrain({
    rail: [[10, 5, 1, 5], [11, 5, 3, 1]],
    locomotive: [[10, 6, 1, 2]],
    rail_car: [[10, 8]],
  }, 40);
  assert.equal(validateRailroadLayout(sharpCorner).issues.some((i) => i.code === 'rail_right_angle_turn'), true);

  const tJunction = unpackTerrain({
    rail: [[10, 3, 1, 7], [11, 5, 3, 1]],
    locomotive: [[10, 6, 1, 2]],
    rail_car: [[10, 8]],
  }, 40);
  assert.equal(validateRailroadLayout(tJunction).issues.some((i) => i.code === 'rail_right_angle_turn'), true);

  const fullCrossing = unpackTerrain({
    rail: [[10, 3, 1, 9], [7, 5, 7, 1]],
    locomotive: [[10, 7, 1, 2]],
    rail_car: [[10, 9]],
  }, 40);
  assert.equal(validateRailroadLayout(fullCrossing).ok, true);

  // Interrupted by road -> rail_interrupted
  const interrupted = unpackTerrain({
    rail: [[10, 2, 1, 4], [10, 7, 1, 4]],
    road: [[10, 6]],
    locomotive: [[10, 2, 1, 2]],
    rail_car: [[10, 4]],
  }, 40);
  assert.equal(validateRailroadLayout(interrupted).issues.some((i) => i.code === 'rail_interrupted'), true);

  // Missing coupled train -> rail_missing_train
  const noTrain = unpackTerrain({
    rail: [[10, 2, 1, 6]],
    rail_car: [[10, 3]],
  }, 40);
  assert.equal(validateRailroadLayout(noTrain).issues.some((i) => i.code === 'rail_missing_train'), true);
});

test('TacticalModels loads both single-mesh and multi-primitive GLTF groups and tints painted slots', () => {
  const scene = new THREE.Scene();
  const matSteel = new THREE.MeshStandardMaterial({ name: 'Tactical_Steel', color: 0xffffff });
  const matPainted = new THREE.MeshStandardMaterial({ name: 'Tactical_Painted', color: 0xffffff });

  const singleMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matSteel);
  singleMesh.name = 'SANDBAGS_STRAIGHT';
  scene.add(singleMesh);

  const multiGroup = new THREE.Group();
  multiGroup.name = 'LOCOMOTIVE';
  const child1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matSteel);
  child1.name = 'LOCOMOTIVE_1';
  const child2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matPainted);
  child2.name = 'LOCOMOTIVE_2';
  multiGroup.add(child1, child2);
  scene.add(multiGroup);

  const tm = new TacticalModels();
  assert.equal(tm.loadFromScene(scene), true);

  const target = new THREE.Group();
  assert.equal(tm.apply(target, 'LOCOMOTIVE', { paintHex: 0x2563eb }), true);
  assert.equal(target.children.length, 2);
  assert.equal(target.children[0].material, matSteel);
  assert.equal(target.children[1].material.color.getHex(), 0x2563eb);

  assert.equal(tm.recolor(target, { paintHex: 0xca8a04 }), true);
  assert.equal(target.children[1].material.color.getHex(), 0xca8a04);

  const bags = new THREE.Group();
  assert.equal(tm.apply(bags, 'SANDBAGS_STRAIGHT'), true);
  assert.equal(bags.children.length, 1);

  tm.dispose();
});

test('all maps place RAIL_CAR on RAIL and use valid prop kinds', () => {
  const mapDirs = ['public/maps/campaign', 'public/maps/contracts', 'public/maps/survival'];
  const validKinds = new Set(PROP_KINDS);
  for (const dir of mapDirs) {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json') || file === 'index.json') continue;
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const size = raw.gridSize || 40;
      const { surfaceGrid, objectGrid, railCurves, props } = unpackTerrain(raw.terrain, size);
      const railCheck = validateRailroadLayout({ surfaceGrid, objectGrid, railCurves });
      assert.equal(
        railCheck.ok,
        true,
        `${file}: railroad layout violation: ${railCheck.issues.map((i) => i.message).join('; ')}`
      );
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (objectGrid[r][c] === TileType.RAIL_CAR || objectGrid[r][c] === TileType.LOCOMOTIVE) {
            assert.equal(
              surfaceGrid[r][c],
              TileType.RAIL,
              `${file}: rail rolling stock at (${r},${c}) must sit on RAIL`
            );
          }
        }
      }
      for (const p of props) {
        assert.equal(validKinds.has(p.kind), true, `${file}: invalid prop kind ${p.kind}`);
        assert.equal(p.row >= 0 && p.row < size && p.col >= 0 && p.col < size, true);
      }
    }
  }
});
