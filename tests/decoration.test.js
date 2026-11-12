import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDecoration, buildDecorationPlan, decorationCellAllowed } from '../public/src/game/decoration.js';
import { normalizeMapDefinition, SECTORS } from '../public/src/game/levels.js';
import { paintDecoration, createUrbanGroundTexture } from '../public/src/game/terrains/urban-ground.js';
import map from '../public/maps/campaign/mission-01-first-contact.json' with { type: 'json' };

// Record clip regions and canvas ownership without a DOM/WebGL dependency.
function recordingContext() {
  const clips=[]; let rects=[]; let depth=0;
  const ctx=new Proxy({
    beginPath(){rects=[];}, rect(...args){rects.push(args);},
    clip(){clips.push([...rects]);}, save(){depth++;}, restore(){depth--;assert.ok(depth>=0);},
  },{get(target,key){return key in target?target[key]:()=>{};}});
  return {ctx,clips,depth:()=>depth};
}

test('Decoration is reproducible, low quality is a subset, and protected cells stay clear',()=>{
  for(const sector of SECTORS){
    const before=JSON.stringify(sector);
    const full=buildDecorationPlan(sector), low=buildDecorationPlan(sector,{lowQuality:true});
    assert.deepEqual(full,buildDecorationPlan(sector));
    assert.ok(full.details.length>0 && full.details.length<=2048);
    const keys=new Set(full.details.map(x=>JSON.stringify(x)));
    assert.ok(low.details.every(x=>keys.has(JSON.stringify(x))));
    for(const item of full.details) assert.ok(decorationCellAllowed(sector,Math.floor(item.row+.5),Math.floor(item.col+.5),true));
    assert.equal(JSON.stringify(sector),before);
  }
});

test('Schema rejects unsupported visuals, duplicate IDs and malformed geometry',()=>{
  for(const patch of [{version:2},{seed:-1},{theme:'bogus'},{props:[]},{zones:[{id:'bad',surface:'lava',bounds:[0,0,1,1]}]},{paths:[{id:'bad',surface:'asphalt',width:0,points:[[0,0],[1,1]]}]}]){
    assert.throws(()=>normalizeDecoration({...map,decoration:{...map.decoration,...patch}}),/Invalid decoration/);
  }
  const duplicate=structuredClone(map.decoration); duplicate.zones.push(duplicate.zones[0]);
  assert.throws(()=>normalizeDecoration({...map,decoration:duplicate}),/unique/);
  const changed=normalizeMapDefinition({...map,decoration:{...map.decoration,seed:42}});
  assert.notDeepEqual(buildDecorationPlan(changed).details,buildDecorationPlan(normalizeMapDefinition(map)).details);
});

test('Renderer clips paths and landmarks to separate safe cell masks and balances canvas state',()=>{
  const sector=normalizeMapDefinition(map),record=recordingContext();
  paintDecoration(record.ctx,sector,{},360);
  assert.equal(record.depth(),0);assert.equal(record.clips.length,2);
  for(const [i,mask] of record.clips.entries()){
    const expected=[];
    for(let r=0;r<36;r++)for(let c=0;c<36;c++)if(decorationCellAllowed(sector,r,c,i===1))expected.push([c*10,r*10,10,10]);
    assert.deepEqual(mask,expected);
  }
});

test('Texture size respects software quality and GPU limits; texture can release its resources',()=>{
  const original=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>recordingContext().ctx})};
  try {
    const sector=normalizeMapDefinition(map);
    for(const [options,size] of [[{},1024],[{lowQuality:true},512],[{maxTextureSize:256},256]]){
      const texture=createUrbanGroundTexture(sector,options);
      assert.equal(texture.image.width,size);assert.equal(texture.image.height,size);
      let disposed=false;texture.addEventListener('dispose',()=>{disposed=true;});texture.dispose();assert.ok(disposed);
    }
  } finally { if(original===undefined)delete globalThis.document;else globalThis.document=original; }
});

test('Legacy city metadata adapts without changing gameplay and explicit empty decoration wins',()=>{
  const legacy=structuredClone(map); delete legacy.decoration;
  legacy.environment.roads=[{points:[[5,5],[5,15]],width:3}];
  legacy.environment.districts=[{name:'OLD DEPOT',row:5,col:5}];
  assert.equal(normalizeDecoration(legacy).paths.length,1);
  const minimal={version:1,seed:1,theme:'forest'};
  assert.equal(normalizeDecoration({...legacy,decoration:minimal}).paths.length,0);
  const decorated=normalizeMapDefinition(map),plain=normalizeMapDefinition({...map,decoration:undefined});
  assert.deepEqual(decorated.grid,plain.grid);assert.deepEqual(decorated.encounters,plain.encounters);
  assert.deepEqual(decorated.enemyPool,plain.enemyPool);
});
