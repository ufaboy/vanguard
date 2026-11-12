import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NAV_TILE,
  assignBearingSlots,
  createBrain,
  createSquadDirector,
  hasGridLineOfSight,
  isChokeCell,
  notifyBrainFired,
  notifyBrainJammed,
  notifyBrainMined,
  stepBrain,
  updateAttackTokens,
} from '../public/src/sim/behavior/index.js';
import { SECTORS } from '../public/src/game/levels.js';

const E = NAV_TILE.EMPTY;
const B = NAV_TILE.BRICK;
const W = NAV_TILE.WATER;
const openGrid = (n = 30) => Array.from({ length: n }, () => Array(n).fill(E));
const seq = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

function ctxFor(grid, self, target, extra = {}) {
  return {
    grid,
    dt: 0.1,
    replanDue: true,
    self: { ...self, fx: self.col + 0.5, fz: self.row + 0.5, canCrossWater: extra.canCrossWater ?? false },
    target,
    visible: true,
    distCells: Math.hypot(self.row - target.row, self.col - target.col),
    hp: 10,
    maxHp: 10,
    flankDir: null,
    slotDir: null,
    allyGoals: [],
    playerTrail: [],
    mines: [],
    minesLeft: 3,
    playerCanCrossWater: false,
    alliesEngaged: false,
    specialReady: false,
    repairTarget: null,
    ...extra,
  };
}

function walk(brain, grid, self, target, extra = {}) {
  let pos = { ...self };
  let out = stepBrain(brain, ctxFor(grid, pos, target, extra));
  for (let i = 0; i < 80 && out.waypoint; i++) {
    pos = { row: out.waypoint.row, col: out.waypoint.col };
    out = stepBrain(brain, ctxFor(grid, pos, target, {
      ...extra,
      replanDue: false,
      distCells: Math.hypot(pos.row - target.row, pos.col - target.col),
    }));
  }
  return { pos, out };
}

const dist = (a, b) => Math.hypot(a.row - b.row, a.col - b.col);

test('Attack tokens cap simultaneous shooters and rotate to waiting tanks', () => {
  const d = createSquadDirector({ maxAttackers: 2, tokenHoldSec: 1, tokenRestSec: 0.5 });
  const all = [
    { id: 1, priority: -3 },
    { id: 2, priority: -5 },
    { id: 3, priority: -9 },
  ];
  let held = updateAttackTokens(d, all, 0.1);
  assert.deepEqual([...held].sort(), [1, 2], 'closest tanks get the first tokens');
  held = updateAttackTokens(d, all, 0.5);
  assert.equal(held.has(3), false, 'no rotation before the hold time');
  held = updateAttackTokens(d, all, 0.6);
  assert.equal(held.size, 2);
  assert.equal(held.has(3), true, 'waiting tank rotates in after the hold time');

  // A holder that stops wanting to shoot frees its token immediately
  held = updateAttackTokens(d, all.filter((c) => c.id !== 3), 0.1);
  assert.equal(held.has(3), false);
  assert.ok(held.size <= 2);
  assert.equal(updateAttackTokens(createSquadDirector(), [], 0.1).size, 0);
});

test('Sectors expose a positive maxAttackers', () => {
  for (const sector of SECTORS) assert.ok(sector.maxAttackers >= 1, sector.name);
});

test('Bearing slots spread tanks evenly around the player and keep their order', () => {
  const center = { x: 0, z: 0 };
  const slots = assignBearingSlots(
    [
      { id: 1, x: 10, z: 0.5 },
      { id: 2, x: 10, z: -0.5 },
    ],
    center
  );
  const a = slots.get(1);
  const b = slots.get(2);
  const dot = a.x * b.x + a.z * b.z;
  assert.ok(dot < -0.99, 'two tanks get opposite bearings (pincer)');
  const three = assignBearingSlots(
    [
      { id: 1, x: 5, z: 0 },
      { id: 2, x: 0, z: 5 },
      { id: 3, x: -5, z: 0 },
    ],
    center
  );
  const v = [...three.values()];
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const ang = Math.acos(Math.max(-1, Math.min(1, v[i].x * v[j].x + v[i].z * v[j].z)));
      assert.ok(Math.abs(ang - (2 * Math.PI) / 3) < 1e-6);
    }
  }
});

test('Choke cells are one-tile lanes', () => {
  const grid = [
    [B, E, B],
    [B, E, B],
    [E, E, E],
  ];
  assert.equal(isChokeCell(grid, 1, 1), true);
  assert.equal(isChokeCell(grid, 2, 1), false);
});

test('Sapper mines a chokepoint on the player trail, then picks the next spot', () => {
  const grid = openGrid(24);
  // A wall with a single gap at (12, 8): the gap is a chokepoint
  for (let r = 0; r < 24; r++) if (r !== 12) grid[r][8] = B;
  const target = { row: 12, col: 3 };
  const trail = [{ row: 12, col: 10 }, { row: 12, col: 9 }, { row: 12, col: 8 }, { row: 12, col: 7 }];
  const brain = createBrain('minelayer', seq([0.5]));
  const { pos, out } = walk(brain, grid, { row: 12, col: 14 }, target, { visible: false, playerTrail: trail });
  assert.equal(out.tactic, 'mine');
  assert.equal(out.wantMine, true, 'wants to plant at the mining cell');
  assert.ok(trail.some((t) => dist(t, pos) <= 1.5), 'mining cell sits on the player route');
  notifyBrainMined(brain);
  assert.equal(brain.tactic, 'idle');
  assert.equal(brain.goal, null);
});

test('Sapper evades a close player and drops mines while doing it', () => {
  const brain = createBrain('minelayer', seq([0.5]));
  const out = stepBrain(brain, ctxFor(openGrid(), { row: 15, col: 15 }, { row: 15, col: 12 }));
  assert.equal(out.tactic, 'evade');
  assert.equal(out.wantMine, true);
});

test('Hover raider strikes from water the player cannot cross, then withdraws', () => {
  const grid = openGrid(30);
  for (let r = 0; r < 30; r++) for (let c = 18; c <= 21; c++) grid[r][c] = W;
  const target = { row: 15, col: 13 };
  const brain = createBrain('raider', seq([0.5]));
  const { pos, out } = walk(brain, grid, { row: 15, col: 25 }, target, { canCrossWater: true });
  assert.equal(out.tactic, 'strike');
  assert.equal(grid[pos.row][pos.col], W, 'firing from the water');
  brain.tacticTimer = 0;
  const next = stepBrain(brain, ctxFor(grid, pos, target, { canCrossWater: true }));
  assert.equal(next.tactic, 'withdraw');
});

test('Kamikaze stalks out of sight, then charges directly when close', () => {
  const grid = openGrid(30);
  for (let c = 8; c <= 22; c++) grid[11][c] = B;
  const target = { row: 15, col: 15 };
  const brain = createBrain('hunter', seq([0.5]));
  const far = stepBrain(brain, ctxFor(grid, { row: 3, col: 15 }, target));
  assert.equal(far.tactic, 'stalk');
  assert.equal(hasGridLineOfSight(grid, brain.goal, target), false, 'stalk cell is hidden');
  assert.ok(dist(brain.goal, target) <= 5);
  const near = stepBrain(brain, ctxFor(grid, { row: 15, col: 11 }, target));
  assert.equal(near.tactic, 'charge');
  assert.equal(near.direct, true);
  assert.equal(near.waypoint, null);
});

test('Flamethrower lurks hidden nearby and only rushes a close player', () => {
  const grid = openGrid(30);
  for (let r = 8; r <= 22; r++) grid[r][10] = B;
  const target = { row: 15, col: 15 };
  const brain = createBrain('ambusher', seq([0.5]));
  const { pos, out } = walk(brain, grid, { row: 15, col: 3 }, target, { visible: false });
  assert.equal(out.tactic, 'lurk');
  assert.equal(out.waypoint, null, 'waits in ambush');
  assert.equal(hasGridLineOfSight(grid, pos, target), false);
  const rush = stepBrain(brain, ctxFor(grid, pos, { row: 15, col: 12 }, { distCells: 3 }));
  assert.equal(rush.tactic, 'rush');
  assert.equal(rush.direct, true);
});

test('Jammer shadows out of sight, dashes into jam range only while allies fight', () => {
  const grid = openGrid(30);
  const target = { row: 15, col: 15 };
  const brain = createBrain('ewar', seq([0.5]));
  let out = stepBrain(brain, ctxFor(grid, { row: 15, col: 2 }, target, { visible: false }));
  assert.equal(out.tactic, 'shadow');
  brain.tactic = 'idle';
  const engaged = { visible: false, alliesEngaged: true, specialReady: true };
  const { out: jam } = walk(brain, grid, { row: 15, col: 2 }, target, engaged);
  assert.equal(jam.tactic, 'jam');
  assert.equal(jam.wantJam, true);
  notifyBrainJammed(brain);
  out = stepBrain(brain, ctxFor(grid, { row: 15, col: 11 }, target, { visible: false }));
  assert.equal(out.tactic, 'withdraw');
});

test('Engineer drives to the damaged ally; flees a close player', () => {
  const grid = openGrid(30);
  const ally = { id: 9, row: 5, col: 25 };
  const brain = createBrain('support', seq([0.5]));
  const { pos, out } = walk(brain, grid, { row: 20, col: 5 }, { row: 15, col: 15 }, {
    visible: false,
    repairTarget: ally,
  });
  assert.equal(out.tactic, 'repair');
  assert.ok(dist(pos, ally) <= 2.5);
  const flee = stepBrain(brain, ctxFor(grid, pos, { row: 5, col: 22 }, { distCells: 3, repairTarget: ally }));
  assert.equal(flee.tactic, 'flee');
});

test('Striker holds a stand-off LOS cell and shifts after launching', () => {
  const grid = openGrid(30);
  const target = { row: 15, col: 15 };
  const brain = createBrain('standoff', seq([0.5]));
  const { pos } = walk(brain, grid, { row: 15, col: 2 }, target);
  assert.equal(brain.tactic, 'launch');
  const d = dist(pos, target);
  assert.ok(d >= 7 && d <= 10);
  const first = { ...brain.goal };
  for (let k = 0; k < brain.relocateAfter; k++) notifyBrainFired(brain);
  stepBrain(brain, ctxFor(grid, pos, target));
  assert.ok(dist(brain.goal, first) >= 2, 'moved to a different firing cell');
});

test('Stealth sniper overwatches from range and slips away after its shot', () => {
  const grid = openGrid(30);
  for (let r = 4; r <= 26; r++) if (r < 14 || r > 16) grid[r][10] = B;
  const target = { row: 15, col: 15 };
  const brain = createBrain('sniper', seq([0.5]));
  const { pos } = walk(brain, grid, { row: 15, col: 2 }, target);
  assert.equal(brain.tactic, 'overwatch');
  assert.ok(dist(pos, target) >= 8);
  notifyBrainFired(brain);
  const out = stepBrain(brain, ctxFor(grid, pos, target));
  assert.equal(out.tactic, 'reposition');
});

test('Boss configs carry their own role brains', async () => {
  const { SECTOR_BOSS_CONFIGS } = await import('../public/src/game/tanks.js');
  assert.equal(SECTOR_BOSS_CONFIGS.bossMammoth.behavior.role, 'dreadnought');
  assert.equal(SECTOR_BOSS_CONFIGS.bossHydra.behavior.role, 'cruiser');
  assert.equal(SECTOR_BOSS_CONFIGS.bossInferno.behavior.role, 'juggernaut');
  assert.equal(SECTOR_BOSS_CONFIGS.bossTitan.behavior.role, 'fortress');
});

test('Mammoth closes to brawling range and side-steps on later cycles', () => {
  const grid = openGrid(30);
  const target = { row: 15, col: 15 };
  const brain = createBrain('dreadnought', seq([0.5]));
  const { pos } = walk(brain, grid, { row: 15, col: 2 }, target);
  assert.equal(brain.tactic, 'advance');
  const d = dist(pos, target);
  assert.ok(d >= 3 && d <= 6);
  const first = { ...brain.goal };
  brain.tacticTimer = 0;
  stepBrain(brain, ctxFor(grid, pos, target)); // cycle 2 -> side-step
  assert.ok(dist(brain.goal, first) >= 2);
});

test('Hydra keeps its stand-off band, then presses closer in phase 2', () => {
  const grid = openGrid(36);
  const target = { row: 18, col: 18 };
  const brain = createBrain('cruiser', seq([0.5]), {
    standoff: { minCells: 10, maxCells: 13, los: true, travelWeight: 0.1, maxTravel: 16 },
    pressCells: [6, 10],
  });
  let { pos } = walk(brain, grid, { row: 18, col: 16 }, target);
  assert.equal(brain.tactic, 'standoff');
  let d = dist(pos, target);
  assert.ok(d >= 10 && d <= 13, `backs off to the band (${d})`);
  ({ pos } = walk(brain, grid, pos, target, { bossPhase2: true }));
  assert.equal(brain.tactic, 'press');
  d = dist(pos, target);
  assert.ok(d >= 6 && d <= 10, `presses into salvo range (${d})`);
});

test('Titan advances to its hold distance and stays', () => {
  const grid = openGrid(30);
  const target = { row: 15, col: 15 };
  const brain = createBrain('fortress', seq([0.5]), {
    hold: { minCells: 3, maxCells: 4, los: true, travelWeight: 0.3, maxTravel: 24 },
  });
  const { pos, out } = walk(brain, grid, { row: 15, col: 1 }, target);
  assert.equal(out.tactic, 'hold');
  assert.equal(out.waypoint, null);
  const d = dist(pos, target);
  assert.ok(d >= 3 && d <= 4);
});
