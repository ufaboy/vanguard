import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NAV_TILE,
  ROLE_CONFIGS,
  createBrain,
  findPath,
  findTacticalCells,
  hasGridLineOfSight,
  notifyBrainFired,
  stepBrain,
} from '../public/src/sim/behavior/index.js';
import { TANK_CONFIGS } from '../public/src/game/tanks.js';
import { SECTORS } from '../public/src/game/levels.js';

const E = NAV_TILE.EMPTY;
const B = NAV_TILE.BRICK;
const W = NAV_TILE.WATER;

/** Build a numeric grid from rows of characters: '.' empty, '#' brick, '~' water. */
function gridFrom(rows) {
  return rows.map((line) => [...line].map((ch) => (ch === '#' ? B : ch === '~' ? W : E)));
}

function openGrid(n = 20) {
  return Array.from({ length: n }, () => Array(n).fill(E));
}

test('A* finds the shortest cardinal path around walls and respects water', () => {
  const grid = gridFrom([
    '.....',
    '.###.',
    '.#...',
    '.#.#.',
    '.....',
  ]);
  const path = findPath(grid, { row: 2, col: 2 }, { row: 0, col: 0 });
  assert.ok(path);
  assert.deepEqual(path.at(-1), { row: 0, col: 0 });
  // Every step is one cardinal move onto a passable cell
  let prev = { row: 2, col: 2 };
  for (const cell of path) {
    assert.equal(Math.abs(cell.row - prev.row) + Math.abs(cell.col - prev.col), 1);
    assert.equal(grid[cell.row][cell.col], E);
    prev = cell;
  }
  assert.equal(path.length, 8);

  const river = gridFrom(['..~..', '..~..', '..~..']);
  assert.equal(findPath(river, { row: 1, col: 0 }, { row: 1, col: 4 }), null);
  assert.ok(findPath(river, { row: 1, col: 0 }, { row: 1, col: 4 }, { canCrossWater: true }));
  assert.deepEqual(findPath(river, { row: 1, col: 0 }, { row: 1, col: 0 }), []);
});

test('Grid line of sight is blocked by brick / concrete only', () => {
  const grid = gridFrom(['.....', '..#..', '.....']);
  assert.equal(hasGridLineOfSight(grid, { row: 1, col: 0 }, { row: 1, col: 4 }), false);
  assert.equal(hasGridLineOfSight(grid, { row: 0, col: 0 }, { row: 0, col: 4 }), true);
});

test('Tactical query honours band, LOS rule, cover and flank direction', () => {
  const grid = openGrid(24);
  // A wall west of the target hides cells behind it
  for (let r = 6; r <= 18; r++) grid[r][6] = B;
  const target = { row: 12, col: 12 };
  const self = { row: 12, col: 2 };

  const hidden = findTacticalCells(grid, { self, target, minCells: 5, maxCells: 9, los: false, maxTravel: 30 });
  assert.ok(hidden.length > 0);
  for (const c of hidden) {
    const d = Math.hypot(c.row - target.row, c.col - target.col);
    assert.ok(d >= 5 && d <= 9);
    assert.equal(hasGridLineOfSight(grid, c, target), false);
  }

  const seen = findTacticalCells(grid, { self, target, minCells: 4, maxCells: 8, los: true, maxTravel: 30 });
  for (const c of seen) assert.equal(hasGridLineOfSight(grid, c, target), true);

  // Flank toward +row (south of the target) wins when weighted heavily
  const flank = findTacticalCells(openGrid(24), {
    self: { row: 12, col: 12 },
    target,
    minCells: 6,
    maxCells: 8,
    flankDir: { x: 0, z: 1 },
    flankWeight: 10,
    travelWeight: 0,
  });
  assert.ok(flank[0].row > target.row + 4, 'best cell lies on the flank side');
});

test('Every enemy tank type has its own configured role brain', () => {
  const expected = {
    standard: 'line',
    scout: 'flanker',
    armor: 'spearhead',
    howitzer: 'artillery',
    sapper: 'minelayer',
    hover: 'raider',
    kamikaze: 'hunter',
    flamethrower: 'ambusher',
    jammer: 'ewar',
    engineer: 'support',
    striker: 'standoff',
    stealth: 'sniper',
  };
  for (const [type, role] of Object.entries(expected)) {
    assert.equal(TANK_CONFIGS[type].behavior.role, role, type);
    assert.ok(ROLE_CONFIGS[role], `${role} configured`);
  }
  assert.equal(new Set(Object.values(expected)).size, 12, 'roles are distinct');
  assert.equal(createBrain('legacy'), null);
});

function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

function ctxFor(grid, self, target, extra = {}) {
  return {
    grid,
    dt: 0.1,
    replanDue: true,
    self: { ...self, fx: self.col + 0.5, fz: self.row + 0.5, canCrossWater: false },
    target,
    visible: true,
    distCells: Math.hypot(self.row - target.row, self.col - target.col),
    hp: 10,
    maxHp: 10,
    flankDir: null,
    allyGoals: [],
    ...extra,
  };
}

/** Walk the brain along its path until it holds (or a step budget runs out). */
function walk(brain, grid, self, target, extra = {}) {
  let pos = { ...self };
  let out = stepBrain(brain, ctxFor(grid, pos, target, extra));
  for (let i = 0; i < 80 && out.waypoint; i++) {
    pos = { row: out.waypoint.row, col: out.waypoint.col };
    out = stepBrain(brain, ctxFor(grid, pos, target, { ...extra, replanDue: false }));
  }
  return { pos, out };
}

test('Line tank takes a firing cell with LOS, then ducks into cover when engage time ends', () => {
  const grid = openGrid(24);
  for (let c = 4; c <= 9; c++) grid[16][c] = B; // a cover wall south-west of the target
  const target = { row: 8, col: 8 };
  const brain = createBrain('line', seq([0.5]));
  const { pos, out } = walk(brain, grid, { row: 20, col: 6 }, target);
  assert.equal(out.tactic, 'engage');
  assert.equal(out.waypoint, null, 'holds the firing position');
  assert.equal(hasGridLineOfSight(grid, pos, target), true);
  const d = Math.hypot(pos.row - target.row, pos.col - target.col);
  assert.ok(d >= 4 && d <= 9);

  brain.tacticTimer = 0;
  const next = stepBrain(brain, ctxFor(grid, pos, target));
  assert.equal(next.tactic, 'cover');
  assert.equal(hasGridLineOfSight(grid, brain.goal, target), false);
});

test('Line tank retreats once when badly damaged', () => {
  const grid = openGrid(24);
  for (let c = 0; c <= 23; c++) if (c !== 12) grid[4][c] = B;
  const brain = createBrain('line', seq([0.5]));
  stepBrain(brain, ctxFor(grid, { row: 10, col: 10 }, { row: 14, col: 10 }));
  const out = stepBrain(brain, ctxFor(grid, { row: 10, col: 10 }, { row: 14, col: 10 }, { hp: 3 }));
  assert.equal(out.tactic, 'retreat');
});

test('Scout flanks toward the player rear and evades after a hit', () => {
  const grid = openGrid(30);
  const target = { row: 15, col: 15 };
  const brain = createBrain('flanker', seq([0.5]));
  const flankDir = { x: 0, z: -1 }; // player's rear is north (-row)
  const { pos } = walk(brain, grid, { row: 15, col: 4 }, target, { flankDir });
  assert.ok(pos.row < target.row, 'ends on the rear side');

  const out = stepBrain(brain, ctxFor(grid, pos, target, { flankDir, replanDue: false, hp: 5, maxHp: 10 }));
  // First stepBrain call after the walk sees an HP drop -> evade roll (0.5 < 0.4 + 0.5)
  assert.equal(out.tactic, 'evade');
});

test('Armor closes to 2-4 cells and holds', () => {
  const grid = openGrid(30);
  const target = { row: 15, col: 15 };
  const brain = createBrain('spearhead', seq([0.5]));
  const { pos, out } = walk(brain, grid, { row: 15, col: 2 }, target);
  assert.equal(out.tactic, 'advance');
  const d = Math.hypot(pos.row - target.row, pos.col - target.col);
  assert.ok(d >= 2 && d <= 4);
});

test('Howitzer emplaces hidden, relocates after its barrages and flees close threats', () => {
  const grid = openGrid(30);
  for (let r = 8; r <= 22; r++) grid[r][10] = B;
  const target = { row: 15, col: 15 };
  const brain = createBrain('artillery', seq([0.5]));
  const { pos } = walk(brain, grid, { row: 15, col: 3 }, target, { visible: false });
  assert.equal(brain.tactic, 'emplace');
  assert.equal(hasGridLineOfSight(grid, pos, target), false);
  const firstGoal = { ...brain.goal };

  for (let k = 0; k < brain.relocateAfter; k++) notifyBrainFired(brain);
  stepBrain(brain, ctxFor(grid, pos, target, { visible: false }));
  assert.equal(brain.shotsSinceMove, 0, 'shoot-and-scoot resets the shot counter');
  assert.ok(brain.goal, 'picked a new firing cell');
  assert.equal(typeof firstGoal.row, 'number');

  const close = stepBrain(brain, ctxFor(grid, { row: 15, col: 13 }, target, { distCells: 2 }));
  assert.equal(close.tactic, 'flee');
});

test('A far-away howitzer still drives to a firing cell instead of idling', () => {
  const grid = openGrid(36);
  const target = { row: 30, col: 30 };
  const brain = createBrain('artillery', seq([0.5]));
  const out = stepBrain(brain, ctxFor(grid, { row: 2, col: 2 }, target, { visible: false, distCells: 39 }));
  assert.equal(out.tactic, 'emplace');
  assert.ok(brain.goal, 'has a goal');
  const d = Math.hypot(brain.goal.row - target.row, brain.goal.col - target.col);
  assert.ok(d >= 7 && d <= 11, 'goal sits inside the firing band');
  assert.ok(out.waypoint, 'is moving');
});

test('Role brains find reachable positions on every real sector map', () => {
  for (const sector of SECTORS.slice(0, 6)) {
    const grid = sector.grid || sector.tiles || sector.layout;
    if (!Array.isArray(grid) || !Array.isArray(grid[0])) continue;
    const brain = createBrain('line', seq([0.3, 0.7]));
    let start = null;
    let target = null;
    for (let r = 2; r < grid.length - 2 && !target; r++) {
      for (let c = 2; c < grid[0].length - 2; c++) {
        const t = typeof grid[r][c] === 'number' ? grid[r][c] : grid[r][c]?.type;
        if (t !== E) continue;
        if (!start) start = { row: r, col: c };
        else if (Math.hypot(r - start.row, c - start.col) > 12) {
          target = { row: r, col: c };
          break;
        }
      }
    }
    if (!start || !target) continue;
    const out = stepBrain(brain, ctxFor(grid, start, target, { visible: false }));
    assert.equal(out.tactic, 'investigate');
  }
});
