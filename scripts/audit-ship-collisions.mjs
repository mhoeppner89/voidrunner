// Read-only geometry audit. Run with: node --import ./src/game/offlineImportHooks.mjs scripts/audit-ship-collisions.mjs
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from '../vendor/three.module.min.js';
import {buildGlbScene} from '../src/game/glbLoader.js';
import {GLB_SHIP_CONFIG,npcShipScaleForVariant} from '../src/game/render.js';
import {GameSession} from '../src/game/game.js';
import {FLEET_EQUIPMENT} from '../src/game/fleetEquipmentData.js';
import {createNewSave} from '../src/game/save.js';
import {segmentMeshHit} from '../src/game/meshQueries.js';
import {segmentShipColliderHit,segmentShipContactHullHit,shipVsSphere,PLAYER_CONTACT_SCALE} from '../src/game/shipCollision.js';
import {equipFrigate,segmentFrigateHullHit,segmentFrigateMountHit} from '../src/game/capitalCombat.js';
import {equipCruiser,segmentCruiserHullHit,segmentCruiserMountHit} from '../src/game/cruiserCombat.js';

globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
const destination='.freebuff/ship-collision-audit';
await mkdir(destination,{recursive:true});
const resolution=72, axes=['x','y','z'];
const views=[{name:'Top',a:0,b:2,depth:1},{name:'Side',a:2,b:1,depth:0},{name:'Front',a:0,b:1,depth:2}];
const round=n=>Math.round(n*10000)/10000;
const actor={position:[0,0,0],rotation:[0,0,0,1],speed:20};
const live=Object.create(GameSession.prototype);
live.save={player:{shipId:'wayfarer'}};
const reports=[],cards=[];

for(const [variant,config] of Object.entries(GLB_SHIP_CONFIG)){
 const file=config.path??`assets/models/ships/${config.file}`;
 const buffer=await readFile(file);
 const hull=await buildGlbScene(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
 hull.rotation.y=config.yaw;hull.scale.setScalar(config.scale*(config.baseScale??1)*npcShipScaleForVariant(variant));hull.updateMatrixWorld(true);
 const box=new T.Box3().setFromObject(hull),extent=axes.map(a=>Math.max(Math.abs(box.min[a]),Math.abs(box.max[a])));
 const points=[],indices=[],v=new T.Vector3();let triangles=0;
 hull.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const p=mesh.geometry.attributes.position,index=mesh.geometry.index,offset=points.length/3;
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);points.push(v.x,v.y,v.z);}
  const count=index?.count??p.count;
  for(let i=0;i<count;i++)indices.push(offset+(index?index.getX(i):i));
  triangles+=count/3;
 });
 const obstacle={x:0,y:0,z:0,losRadius:Math.hypot(...extent),box:{qx:0,qy:0,qz:0,qw:1},meshVerts:new Float32Array(points),meshIndices:new Uint32Array(indices)};
 const e=live.npcHullExtents({variant});
 const ship={...actor,variant,capitalClass:variant==='concord-frigate'?'frigate':variant==='concord-cruiser'?'cruiser':undefined};
 if(ship.capitalClass==='frigate')equipFrigate(ship);
 if(ship.capitalClass==='cruiser')equipCruiser(ship);
 const entry=Object.entries(FLEET_EQUIPMENT).find(([,h])=>h.variant===variant);
 const playerId=entry?.[0],N=npcShipScaleForVariant(variant);
 let playerExtents,playerRadius;
 if(playerId){live.save.player.shipId=playerId;playerExtents=live.playerHullExtents().map(n=>n*N);playerRadius=live.playerCollisionRadius()*N;}
 const report={variant,file,sha256:createHash('sha256').update(buffer).digest('hex'),triangles,npcScale:N,
  modelBounds:{min:axes.map(a=>round(box.min[a])),max:axes.map(a=>round(box.max[a]))},
  modelCenterOffset:axes.map(a=>round((box.min[a]+box.max[a])/2)),
  modelHalfExtents:extent.map(round),npcCollisionHalfExtents:e.map(round),
  sizeErrorPercent:e.map((n,i)=>round((n/extent[i]-1)*100)),
  weaponProxy:'fitted hull triangles + capital component envelopes',
  playerId,playerPhysicalHalfExtents:playerExtents?.map(n=>round(n/N)),legacyPlayerWeaponRadius:playerRadius===undefined?undefined:round(playerRadius/N),views:[]};
 if(variant==='kestrel'){
  const physical=playerExtents.map(n=>n/N),point=[extent[0]/N+.3,0,physical[2]*.56],radius=.05,contact={};
  report.physicalContactWitness={obstacleCenter:point.map(round),obstacleRadius:radius,visibleHullMaxX:round(box.max.x/N),
   outsideVisibleHullBounds:point[0]-radius>box.max.x/N,
   sphereContactReported:shipVsSphere(new T.Vector3(),new T.Quaternion(),variant,PLAYER_CONTACT_SCALE,...point,radius,contact),push:round(contact.push??0)};
 }
 const panels=[];
 for(const view of views){
  const limits=[Math.max(extent[view.a],e[view.a])*1.04,Math.max(extent[view.b],e[view.b])*1.04];
  const start=new T.Vector3(),end=new T.Vector3();
  const physical=[],weapons=[],playerPhysical=[],playerWeapons=[],actual=[];
  const tally=()=>({trueHit:0,falseHit:0,missedHull:0,modelPixels:0,proxyPixels:0});
  const counts={physical:tally(),weapons:tally(),playerPhysical:tally(),playerWeapons:tally()};
  for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
   const a=((x+.5)/resolution*2-1)*limits[0],b=(1-(y+.5)/resolution*2)*limits[1];
   start.set(0,0,0).setComponent(view.a,a).setComponent(view.b,b).setComponent(view.depth,-extent[view.depth]*2-1);
   end.copy(start).setComponent(view.depth,extent[view.depth]*2+1);
   const real=segmentMeshHit(start,end,obstacle,true)!==undefined;
   const ellipse=segmentShipContactHullHit(start,end,[0,0,0],[0,0,0,1],variant,N)!==undefined;
   let hit=segmentShipColliderHit(start,end,[0,0,0],[0,0,0,1],variant,N)!==undefined;
   if(ship.capitalClass==='frigate')hit=hit||segmentFrigateMountHit(start,end,ship)!==undefined;
   if(ship.capitalClass==='cruiser')hit=hit||segmentCruiserMountHit(start,end,ship)!==undefined;
   const pp=playerId?segmentShipContactHullHit(start,end,[0,0,0],[0,0,0,1],variant,N*PLAYER_CONTACT_SCALE)!==undefined:false;
   const pw=playerId?segmentShipColliderHit(start,end,[0,0,0],[0,0,0,1],variant,N)!==undefined:false;
   if(playerId&&view.name==='Side'&&real&&pw&&!report.beamWitness){
    const testSession=Object.create(GameSession.prototype);testSession.save=createNewSave(1,{tutorial:false});
    testSession.save.player.shipId=playerId;testSession.save.player.position=[0,0,0];
    testSession.ships=[];testSession.firstObstacleHit=()=>undefined;
    testSession.renderer={spawnImpact(){},showCombatBeam(){}};
    let playerHits=0,npcHits=0;testSession.damagePlayer=()=>playerHits++;testSession.damageShip=()=>npcHits++;
    const direction=end.clone().sub(start).normalize(),range=start.distanceTo(end)+1;
    const weapon={kind:'beam',range:range/N,damageFlat:10};
    testSession.fireBeam('audit-enemy',weapon,start.clone().divideScalar(N),direction,'audit');
    testSession.ships=[{id:'audit-victim',variant,position:[0,0,0],rotation:[0,0,0,1],hull:100}];
    testSession.fireBeam('player',{...weapon,range},start,direction,'audit');
    if(playerHits!==1||npcHits!==1)throw new Error(`${variant}: live beam path disagrees with audit`);
    report.beamWitness={startAtPlayerScale:start.toArray().map(n=>round(n/N)),endAtPlayerScale:end.toArray().map(n=>round(n/N)),visibleHullHit:true,livePlayerHit:true,liveNpcHit:true};
   }
   actual.push(real);physical.push(ellipse);weapons.push(hit);playerPhysical.push(pp);playerWeapons.push(pw);
   for(const [key,proxy] of Object.entries({physical:ellipse,weapons:hit,playerPhysical:pp,playerWeapons:pw})){
    const c=counts[key];if(real)c.modelPixels++;if(proxy)c.proxyPixels++;
    if(real&&proxy)c.trueHit++;else if(real)c.missedHull++;else if(proxy)c.falseHit++;
   }
  }
  for(const c of Object.values(counts)){c.missedHullPercent=round(c.missedHull/Math.max(1,c.modelPixels)*100);c.emptyHitPercent=round(c.falseHit/Math.max(1,c.proxyPixels)*100);c.intersectionOverUnion=round(c.trueHit/Math.max(1,c.trueHit+c.falseHit+c.missedHull));}
  report.views.push({name:view.name,...counts});
  const raster=(mask)=>{
   const paths={both:[],miss:[],empty:[]};
   for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
    const i=y*resolution+x,key=actual[i]&&mask[i]?'both':actual[i]?'miss':mask[i]?'empty':undefined;
    if(key)paths[key].push(`M${x} ${y}h1v1h-1z`);
   }
   const ratio=limits[0]/limits[1];
   return `<svg viewBox="0 0 ${resolution*ratio} ${resolution}" role="img" aria-label="${view.name} collision overlap"><g transform="scale(${ratio} 1)"><path fill="#80c2cc" d="${paths.both.join('')}"/><path fill="#ffc657" d="${paths.miss.join('')}"/><path fill="#f47979" d="${paths.empty.join('')}"/></g></svg>`;
  };
  panels.push(`<div><h4>${view.name}</h4><div class="proxies"><figure>${raster(physical)}<figcaption>NPC physical<br>${counts.physical.missedHullPercent}% missed · ${counts.physical.emptyHitPercent}% empty</figcaption></figure><figure>${raster(weapons)}<figcaption>NPC weapon hull<br>${counts.weapons.missedHullPercent}% missed · ${counts.weapons.emptyHitPercent}% empty</figcaption></figure>${playerId?`<figure>${raster(playerWeapons)}<figcaption>Player weapon hull<br>${counts.playerWeapons.missedHullPercent}% missed</figcaption></figure>`:''}</div></div>`);
 }
 reports.push(report);
 cards.push(`<section id="${variant}"><h2>${playerId??variant}</h2><p>Dimensions error X/Y/Z: ${report.sizeErrorPercent.map(v=>`${v}%`).join(' / ')}. NPC weapon proxy: ${report.weaponProxy}.${playerId?` Player physical contact tolerance 4%; weapon surface matches NPC hull.`:''}</p><div class="views">${panels.join('')}</div></section>`);
 console.log(JSON.stringify({variant,sizeErrorPercent:report.sizeErrorPercent,topNpcMiss:report.views[0].weapons.missedHullPercent,topNpcEmpty:report.views[0].weapons.emptyHitPercent,topPlayerMiss:playerId?report.views[0].playerWeapons.missedHullPercent:undefined}));
 hull.traverse(o=>{o.geometry?.dispose();if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}});
}
await writeFile(`${destination}/results.json`,JSON.stringify({resolution,method:'Orthographic, double-sided full-depth ray sampling of the shipped GLBs with runtime yaw, scale and baseScale. Percentages describe projected hull silhouettes, not damage probabilities. No shield envelope, projectile padding, separate equipment or animated aiming included. Capital component envelopes may extend into excluded turret geometry. Player surface compared at equivalent NPC display scale; physical overlay is the actual merged solid contact shape.',ships:reports},null,2)+'\n');
await writeFile(`${destination}/index.html`,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ship collision audit</title><style>body{font:15px system-ui;background:#081321;color:#e1edf2;margin:24px}h1{margin-bottom:8px}p{color:#b8c8d2;max-width:1050px}section{border-top:1px solid #405568;padding:14px 0}.views{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.proxies{display:flex;gap:8px}figure{margin:0;flex:1;min-width:0}svg{width:100%;background:#101e2e}figcaption{font-size:12px;line-height:1.5}h4{margin:5px 0}.legend{display:flex;gap:20px}nav a{color:#80c2cc;margin:0 12px 8px 0;display:inline-block}@media(max-width:850px){.views{grid-template-columns:1fr}body{margin:14px}}</style><h1>Current ship collision audit</h1><p>Measured from all 19 shipped models. Top, side and front rays compare the actual hull with the collision proxy. These are silhouette mismatch measurements, not combat hit rates. Separate mounted equipment, shield envelopes and projectile padding are excluded.</p><div class="legend"><span style="color:#80c2cc">■ Hull + proxy</span><span style="color:#ffc657">■ Visible hull missed</span><span style="color:#f47979">■ Empty space counted as hull</span></div><p>Player and NPC weapon hits use the same fitted surfaces. Physical contacts use merged solid cells with a 4% player tolerance. Frigate and cruiser component envelopes remain active.</p><nav>${reports.map(r=>`<a href="#${r.variant}">${r.playerId??r.variant}</a>`).join('')}</nav>${cards.join('')}</html>`);
