/** Arena landmark and decorative element placement rules. */

import { TileType } from './terrains/surfaces.js';

export const DECORATION_THEMES = Object.freeze({
  urban: { ground: '#555b58', accent: '#c1baa0' },
  forest: { ground: '#505143', accent: '#9a9975' },
  desert: { ground: '#a88d62', accent: '#ceba8b' },
  coast: { ground: '#666b62', accent: '#bbbda5' },
  alpine: { ground: '#888e8e', accent: '#c8ceca' },
  industrial: { ground: '#505557', accent: '#b5a276' },
  capital: { ground: '#646866', accent: '#c5bea4' },
});
export const DECORATION_SURFACES = Object.freeze({
  asphalt: '#343e44', pavers: '#696b61', concrete: '#72766e',
  dirt: '#695a43', gravel: '#66665b', sand: '#ae956c', snow: '#b5bfbd',
});
const DECORATION_DETAILS = Object.freeze(['cracks', 'patches', 'oil', 'leaves', 'rubble', 'tracks', 'weeds']);
const DECORATION_LANDMARKS = Object.freeze(['crosswalk', 'parking', 'manhole', 'loading', 'label']);
const has = (catalog, key) => Object.hasOwn(catalog, key);
const fail = message => { throw new Error(`Invalid decoration: ${message}`); };

export function normalizeDecoration(rawMap) {
  let raw = rawMap.decoration;
  if (raw === undefined && rawMap.environment?.roads?.length) {
    raw = { version: 1, seed: 1, theme: 'urban', paths: rawMap.environment.roads.map((road, i) => ({ id: `legacy-road-${i}`, ...road, surface: 'asphalt', marking: 'dashed' })), landmarks: (rawMap.environment.districts || []).map((district, i) => ({ id: `legacy-label-${i}`, kind: 'label', row: district.row, col: district.col, text: district.name, size: 3 })) };
  }
  if (raw === undefined) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('expected an object');
  for (const key of Object.keys(raw)) if (!['version','seed','theme','zones','paths','landmarks','exclusions'].includes(key)) fail(`unsupported field ${key}`);
  if (raw.version !== 1) fail('version must be 1');
  if (!Number.isInteger(raw.seed) || raw.seed < 0 || raw.seed > 0xffffffff) fail('seed must be an unsigned 32-bit integer');
  if (!has(DECORATION_THEMES, raw.theme)) fail('unknown theme');
  const size = rawMap.gridSize || 36;
  const list = key => {
    const items = raw[key] ?? [];
    if (!Array.isArray(items) || items.length > 64) fail(`${key} must be an array with at most 64 entries`);
    return items;
  };
  const ids = new Set();
  const identity = item => {
    if (!item || typeof item !== 'object' || !/^[a-z0-9-]{1,64}$/.test(item.id) || ids.has(item.id) || item.id.startsWith('automatic-')) fail('entries need unique lowercase IDs');
    ids.add(item.id);
  };
  const fields = (item, allowed) => { for (const key of Object.keys(item)) if (!allowed.includes(key)) fail(`unsupported ${item.id}.${key}`); };
  const coordinate = n => Number.isFinite(n) && n >= 0 && n <= size - 1;
  const bounds = value => {
    if (!Array.isArray(value) || value.length !== 4 || !value.every(n => Number.isInteger(n) && coordinate(n)) || value[0] > value[2] || value[1] > value[3]) fail('bounds must be inclusive [row0,col0,row1,col1] cell coordinates');
    return [...value];
  };
  const zones = list('zones').map(item => {
    identity(item); fields(item,['id','bounds','surface','density','details']);
    if (!has(DECORATION_SURFACES,item.surface)) fail(`unknown surface in ${item.id}`);
    const density = item.density ?? 0.3;
    if (!Number.isFinite(density) || density < 0 || density > 1) fail('density must be between 0 and 1');
    const details = item.details ?? ['cracks'];
    if (!Array.isArray(details) || details.length > 7 || details.some(kind => !DECORATION_DETAILS.includes(kind))) fail('unknown detail kind');
    return {id:item.id,bounds:bounds(item.bounds),surface:item.surface,density,details:[...new Set(details)]};
  });
  const paths = list('paths').map(item => {
    identity(item); fields(item,['id','points','width','surface','marking']);
    if (!Array.isArray(item.points) || item.points.length < 2 || item.points.length > 64 || item.points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(coordinate))) fail(`invalid path ${item.id}`);
    if (!Number.isFinite(item.width) || item.width <= 0 || item.width > 8) fail('path width must be in (0,8] cells');
    if (!has(DECORATION_SURFACES,item.surface)) fail('unknown path surface');
    const marking = item.marking ?? 'none';
    if (!['none','dashed','edges'].includes(marking)) fail('unknown path marking');
    return {id:item.id,points:item.points.map(p=>[...p]),width:item.width,surface:item.surface,marking};
  });
  const landmarks = list('landmarks').map(item => {
    identity(item); fields(item,['id','kind','row','col','size','rotation','text']);
    if (!DECORATION_LANDMARKS.includes(item.kind) || !coordinate(item.row) || !coordinate(item.col)) fail('unknown or out-of-bounds landmark');
    const scale=item.size??1; const rotation=item.rotation??0;
    if (!Number.isFinite(scale) || scale<=0 || scale>8 || !Number.isFinite(rotation) || Math.abs(rotation)>360) fail('invalid landmark size/rotation');
    if (item.kind==='label' && (typeof item.text!=='string' || !/^[\x20-\x7e]{1,40}$/.test(item.text))) fail('labels need 1–40 printable English ASCII characters');
    return {id:item.id,kind:item.kind,row:item.row,col:item.col,size:scale,rotation,text:item.text??''};
  });
  const exclusions = list('exclusions').map(item => {
    identity(item);fields(item,['id','bounds']);return {id:item.id,bounds:bounds(item.bounds)};
  });
  const protect = (cell, radius) => {
    if (!cell || !coordinate(cell.row) || !coordinate(cell.col)) return;
    exclusions.push({id:`automatic-${exclusions.length}`,bounds:[Math.max(0,Math.floor(cell.row-radius)),Math.max(0,Math.floor(cell.col-radius)),Math.min(size-1,Math.ceil(cell.row+radius)),Math.min(size-1,Math.ceil(cell.col+radius))]});
  };
  protect(rawMap.playerSpawnCell,1); protect(rawMap.baseCell,2);
  for (const entry of rawMap.enemies?.entrances || []) protect(entry,1);
  return {version:1,seed:raw.seed,theme:raw.theme,zones,paths,landmarks,exclusions};
}

export function decorationCellAllowed(sector,row,col,details=false) {
  const tile=sector.grid[row]?.[col];
  if (tile!==TileType.EMPTY && (details || tile!==TileType.BRICK)) return false;
  return !sector.decoration.exclusions.some(({bounds:[r0,c0,r1,c1]})=>row>=r0&&row<=r1&&col>=c0&&col<=c1);
}
function randomFor(seed,id) {
  let state=seed>>>0;
  for(const char of id)state=Math.imul(state^char.charCodeAt(0),16777619)>>>0;
  return () => { state=(state+0x6d2b79f5)>>>0;let t=Math.imul(state^(state>>>15),1|state);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296; };
}
function nearestPath(paths,row,col) {
  let nearest={distance:Infinity,angle:0,width:0};
  for(const path of paths)for(let i=1;i<path.points.length;i++) {
    const [r0,c0]=path.points[i-1], [r1,c1]=path.points[i];
    const dr=r1-r0,dc=c1-c0;const length=dr*dr+dc*dc;
    const t=length?Math.max(0,Math.min(1,((row-r0)*dr+(col-c0)*dc)/length)):0;
    const distance=Math.hypot(row-r0-t*dr,col-c0-t*dc);
    if(distance<nearest.distance)nearest={distance,angle:Math.atan2(dr,dc),width:path.width};
  }
  return nearest;
}
export function buildDecorationPlan(sector,{lowQuality=false}={}) {
  const config=sector.decoration;
  if(!config)return null;
  const details=[];
  let totalPlaced=0;
  for(const zone of config.zones) {
    if(!zone.details.length)continue;
    const rng=randomFor(config.seed,zone.id);
    const [r0,c0,r1,c1]=zone.bounds;
    const count=Math.min(256,Math.floor((r1-r0+1)*(c1-c0+1)*zone.density*2));
    let placed=0;
    for(let attempt=0;attempt<count*10&&placed<count&&totalPlaced<2048;attempt++) {
      const row=r0+rng()*(r1-r0+1)-0.5,col=c0+rng()*(c1-c0+1)-0.5;
      const kind=zone.details[Math.floor(rng()*zone.details.length)];
      const scale=0.16+rng()*0.34;
      const cellRow=Math.floor(row+0.5),cellCol=Math.floor(col+0.5);
      let fits=true;
      for(let r=Math.floor(row+0.5-scale);r<=Math.floor(row+0.5+scale);r++)for(let c=Math.floor(col+0.5-scale);c<=Math.floor(col+0.5+scale);c++)if(!decorationCellAllowed(sector,r,c,true))fits=false;
      if(!fits)continue;
      const edge=[[1,0],[-1,0],[0,1],[0,-1]].some(([dr,dc])=>[TileType.BRICK,TileType.CONCRETE].includes(sector.grid[cellRow+dr]?.[cellCol+dc]));
      if(['leaves','rubble','weeds'].includes(kind)&&!edge&&rng()<0.8)continue;
      const path=nearestPath(config.paths,row,col);
      if(kind==='tracks'&&path.distance>path.width/2)continue;
      const angle=kind==='tracks'?path.angle:rng()*Math.PI*2;
      const variant=rng();
      const item={zone:zone.id,kind,row,col,scale,angle,variant};
      if(!lowQuality || placed%2===0)details.push(item);
      placed++; totalPlaced++;
    }
  }
  return {config,details};
}
