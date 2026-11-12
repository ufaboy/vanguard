import assert from 'node:assert/strict';
import test from 'node:test';
import { PowerUpPool, isUsefulPowerUp, nearestReachableDropCell } from '../public/src/game/powerup-drops.js';
import { POWERUP, POWERUP_DROP_TYPES, POWERUP_MAX_ON_MAP } from '../public/src/game/powerups.js';
import { TankGameEngine } from '../public/src/game/engine.js';
import { settleMission, createInitialPlayerSave, SaveRepository } from '../public/src/sim/hangar.js';
import { SeededRng } from '../public/src/sim/rng.js';

function player() {
  return {
    upgrades: { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 },
    missileAmmo: 2, apsAmmo: [1, 0, 0, 1], playerHp: 52, playerMaxHp: 52,
    repairKitCount: 1, baseAlive: true, empTimer: 0,
    activeMapRules: { defeatOnBaseLoss: true },
  };
}
function engine() {
  const e = Object.assign(Object.create(TankGameEngine.prototype), player(), {
    powerUpPool: new PowerUpPool(() => 0.3), powerUps: [], lootContainers: [],
    playerSave: createInitialPlayerSave(), activeMissionRun: {}, lootRng: new SeededRng(42),
  });
  e.findAccessibleDropPosition = () => ({ x: 2, z: 4 });
  e.createPowerUpEntity = (type, x, z, persistent = false, guaranteed = false) => {
    if (!guaranteed && e.powerUps.filter(p => Number.isFinite(p.life)).length >= POWERUP_MAX_ON_MAP) return null;
    const item = { type, x, z, life: persistent ? Infinity : 60 };
    e.powerUps.push(item);
    return item;
  };
  return e;
}

test('bag exhausts without repeats, then refills; empty eligibility terminates', () => {
  const pool = new PowerUpPool(() => 0.4);
  for (let cycle = 0; cycle < 3; cycle++) {
    const draws = POWERUP_DROP_TYPES.map(() => pool.draw(() => true));
    assert.equal(new Set(draws).size, POWERUP_DROP_TYPES.length);
  }
  assert.equal(pool.draw(() => false), null);
  assert.equal(pool.draw(type => type === POWERUP.REPAIR), POWERUP.REPAIR);
});

test('every fourth ordinary kill drops; guaranteed sources leave cadence intact', () => {
  const e = engine();
  for (let i = 1; i <= 40; i++) {
    e.powerUps = [];
    e.maybeDropPowerUp(0, 0);
    assert.equal(e.powerUps.length, i % 4 === 0 ? 1 : 0);
  }
  e.maybeDropPowerUp(0, 0);
  const count = e.powerUpPool.kills;
  e.maybeDropPowerUp(0, 0, true);
  assert.equal(e.powerUpPool.kills, count);
});

test('full map defers an earned drop instead of resetting its counter', () => {
  const e = engine();
  e.powerUps = Array.from({length:16}, () => ({type: POWERUP.EMP, life:10}));
  for (let i=0;i<4;i++) e.maybeDropPowerUp(0,0);
  assert.equal(e.powerUpPool.kills,4);
  e.powerUps=[];
  e.maybeDropPowerUp(0,0);
  assert.equal(e.powerUps.length,1);
  assert.equal(e.powerUpPool.kills,1);
});

test('eligibility excludes unknown types, pending duplicates, full ammo and absent HQ', () => {
  const state=player();
  assert.equal(isUsefulPowerUp('upgrade_cannon',state),false);
  assert.equal(isUsefulPowerUp(POWERUP.REPAIR,state,[{type:POWERUP.REPAIR}]),false);
  state.missileAmmo=5;
  state.apsAmmo=[3,3,3,3];
  state.playerHp=state.playerMaxHp*1.4;
  state.activeMapRules.defeatOnBaseLoss=false;
  for (const type of [POWERUP.MISSILE, POWERUP.APS, POWERUP.REPAIR]) {
    assert.equal(isUsefulPowerUp(type,state),false,type);
  }
  state.playerHp=5;
  assert.equal(isUsefulPowerUp(POWERUP.REPAIR,state),true);
});

test('reachable drop avoids water, walls and disconnected islands; amphibious chassis crosses water', () => {
  const grid=[[0,4,0],[0,4,0],[0,4,0]];
  const start={row:1,col:0}; const target={row:1,col:2};
  assert.deepEqual(nearestReachableDropCell(grid,start,target,false),start);
  assert.deepEqual(nearestReachableDropCell(grid,start,target,true),target);
  grid[1][1]=2;
  assert.deepEqual(nearestReachableDropCell(grid,start,target,true),target);
  assert.deepEqual(nearestReachableDropCell(grid,start,target,true,()=>false),start);
});

test('boss bypasses map cap and preserves its powerup reward across save reload', () => {
  const e=engine();
  e.powerUps=Array.from({length:16},()=>({type:POWERUP.REPAIR,life:10}));
  e.powerUpPool.kills=3;
  e.grantBossPowerUp(0,0);
  assert.equal(e.powerUps.length,17);
  assert.equal(e.powerUps.at(-1).bossReward,true);
  assert.equal(e.powerUpPool.kills,3);
  const summary=settleMission({playerSave:e.playerSave,missionRun:e.activeMissionRun});
  assert.equal(summary.bossReward.powerUp,e.playerSave.pendingBossPowerUps[0]);
  let saved;
  globalThis.localStorage={getItem:()=>saved,setItem:(key,value)=>{saved=value;}};
  const repo=new SaveRepository(); repo.savePlayerSave(e.playerSave);
  assert.deepEqual(repo.loadPlayerSave().pendingBossPowerUps,e.playerSave.pendingBossPowerUps);
});

test('obsolete pickup stays available and boss reserve is removed only on successful pickup', () => {
  const e=engine(); e.playerX=0; e.playerZ=0;
  const mesh={rotation:{},position:{},userData:{}};
  e.powerUps=[{type:POWERUP.MISSILE,x:0,z:0,life:Infinity,mesh,bossReserve:true}];
  e.playerSave.pendingBossPowerUps=[POWERUP.MISSILE];
  e.missileAmmo=5;
  e.entityGroup={remove:()=>{}};
  e.saveRepo={savePlayerSave:()=>{}};
  e.applyPowerUp=()=>{e.missileAmmo++;};
  e.updatePowerUps(0.1,1);
  assert.equal(e.powerUps.length,1);
  assert.equal(e.playerSave.pendingBossPowerUps.length,1);
  e.missileAmmo=4;
  e.updatePowerUps(0.1,2);
  assert.equal(e.powerUps.length,0);
  assert.equal(e.playerSave.pendingBossPowerUps.length,0);
  assert.equal(e.missileAmmo,5);
});
