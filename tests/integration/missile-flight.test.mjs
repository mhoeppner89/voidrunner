import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from '../../vendor/three.module.min.js';
import {MISSILE_PADDING,guideMissile,rackLockProgress,torpedoMobilityFactor} from '../../src/game/weaponFlight.js';
import {LAUNCHERS,fillLauncherMagazines,launcherMagazineEntries} from '../../src/game/weapons.js';
import {missileTrial,missileCells,npcFixture,steadyFlights} from '../helpers/missile-flight.mjs';
import {CRUISER_MOUNTS} from '../../src/game/cruiserModelData.js';
import {observeIncomingFire} from '../../src/game/combatPiloting.js';
import {session} from '../helpers/session.mjs';
import {tutorialFixture} from '../helpers/tutorial.mjs';

test('a lost seeker coasts even when the target crosses its nose again',()=>{
 for(const rack of Object.values(LAUNCHERS)){
  const shot={...rack},velocity=new Vector3(0,0,-rack.speed);
  const outside=(rack.seekerCone+1)*Math.PI/180;
  shot.lostTrack=!guideMissile(velocity,new Vector3(Math.sin(outside),0,-Math.cos(outside)),shot,1/60);
  assert.ok(shot.lostTrack);
  assert.equal(guideMissile(velocity,new Vector3(.1,0,-1),shot,1/60),false);
  assert.deepEqual(velocity.toArray(),[0,0,-rack.speed]);
 }
});
const hitRate=cells=>cells.reduce((sum,cell)=>sum+cell.hits,0)/cells.reduce((sum,cell)=>sum+cell.total,0);
// Expected per-range hit percentages at 400, 500 and 600 game units.
const hitWindows={
 seeker:{
  0:[100,100,100], .25:[100,100,100], .5:[100,0,0], .75:[0,0,0], 1:[0,0,0], 1.25:[0,0,0],
  1.5:[0,0,0], 1.75:[100,0,0], 2:[100,100,0], 2.25:[100,100,100], 2.5:[100,100,100],
 },
 swarm:{
  0:[100,100,100], .25:[100,100,100], .5:[0,0,0], .75:[0,0,0], 1:[0,0,0], 1.25:[0,0,0],
  1.5:[100,0,0], 1.75:[100,100,0], 2:[100,100,100], 2.5:[100,100,100],
 },
};
for(const [rack,times] of Object.entries(hitWindows)){
 for(const [time,expected] of Object.entries(times))test(`player Loki against ${rack}, break ${time}s before impact`,()=>{
  const cells=missileCells(rack,{lead:Number(time)});
  cells.forEach(({hits,total,range},i)=>{
   assert.ok(Math.abs(100*hits/total-expected[i])<=12.5,
    `${rack} at ${time}s, range ${range}: ${hits}/${total} hits, expected ${expected[i]}% ±12.5 points`);
  });
 });
}
test('roll affects a grazing hit, and a swarm salvo shares one outcome',()=>{
 const rolls=missileCells('seeker',{lead:.5,fixedBreakPlane:true})[0].byRoll;
 assert.ok(Math.min(...rolls)<Math.max(...rolls));
 // The 600-unit terminal phase converges all four lanes on the same plume
 // point, so one well-timed break shakes the whole salvo (or none of it).
 for(const lead of [.25,.5,1,1.75,2.5]){
  const lanes=[0,1,2,3].map(lane=>missileTrial('swarm',500,lead,lane,3*Math.PI/4,MISSILE_PADDING,3.01,{bearing:.1}));
  assert.ok(lanes.every(hit=>hit===lanes[0]),`lead ${lead}: ${lanes}`);
 }
});
test('seeker and swarm hit steady headings across rolls and launch ranges',()=>{
 for(const npc of [undefined,npcFixture()])for(const rack of ['seeker','swarm']){
  for(const [name,flight] of Object.entries(steadyFlights)){
   for(const {range,hits,total} of missileCells(rack,{npc,...flight}))
    assert.ok(hits/total>=.8,`${npc?'NPC':'player'} ${name} at ${range}: ${rack} hit ${hits}/${total}`);
  }
 }
});

test('malformed fighter rotations fall back to the current hull intercept',()=>{
 const rack=LAUNCHERS.seeker,step=1/60,zero=new Vector3(),offset=new Vector3(0,0,-200);
 for(const rotation of [[0,NaN,0,1],[0,0,0,0],[Infinity,0,0,1]]){
  for(const atLock of [false,true]){
   const shot={hitWeapon:rack},v=new Vector3(0,0,-rack.speed);
   for(let i=0;i<12;i++)guideMissile(v,offset,shot,step,zero,atLock?rotation:[0,1,0,0]);
   assert.ok(shot.plumeOffset>0);
   const fresh={hitWeapon:rack},reference=v.clone(),crossing=new Vector3(10,0,0);
   guideMissile(reference,offset,fresh,step,crossing,[0,1,0,0]);
   assert.ok(guideMissile(v,offset,shot,step,crossing,rotation));
   assert.ok(v.distanceTo(reference)<1e-10);
  }
 }
});

test('maximum Precise cuts the acquired plume displacement by 20 percent',async()=>{
 const {createEquipmentRecord}=await import('../../src/game/equipmentInventory.js');
 const {launcherForOutfit}=await import('../../src/game/weapons.js');
 function acquire(rack,range){
  const shot={hitWeapon:rack},velocity=new Vector3(0,0,-rack.speed),offset=new Vector3(0,0,-range);
  const rest=new Vector3(),step=1/60;
  const broadside=[0,Math.SQRT1_2,0,Math.SQRT1_2],reversed=[0,-Math.SQRT1_2,0,Math.SQRT1_2];
  for(let i=0;i<rack.life/step;i++){
   guideMissile(velocity,offset,shot,step,rest,broadside);
   if(shot.plumeOffset!==undefined){
    assert.ok(Math.abs(velocity.x)<1e-10,'the aim must stay on the hull at acquisition');
    // Reverse the lateral axis and read the actual aim where the ray crosses the hull plane.
    guideMissile(velocity,offset,shot,1,rest,reversed);
    const displacement=Math.abs(offset.z*velocity.x/velocity.z);
    assert.ok(Math.abs(displacement-2*shot.plumeOffset)<1e-9);
    return displacement;
   }
   offset.addScaledVector(velocity,-step);
  }
  assert.fail(`No plume lock at range ${range}`);
 }
 for(const id of ['seeker','swarm']){
  const base=LAUNCHERS[id],record=createEquipmentRecord(id+'-launcher',
   {id:'eq-displacement-'+id,rarity:'uncommon',affixes:['precise'],rolls:[1]});
  const precise=launcherForOutfit(record.id);
  for(const range of [200,base.lockRange])
   assert.ok(Math.abs(acquire(precise,range)/acquire(base,range)-.8)<1e-9);
 }
});
test('rack, Precise roll and hull agility change the dodge window',async()=>{
 const {createEquipmentRecord}=await import('../../src/game/equipmentInventory.js');
 const {launcherForOutfit}=await import('../../src/game/weapons.js');
 const precise=launcherForOutfit(createEquipmentRecord('seeker-launcher',{id:'eq-window',rarity:'uncommon',affixes:['precise'],rolls:[1]}).id);
 // Slower seekers (0.8.2pw) leave a wider window; Precise still trims both edges.
 const middle=[.5,.75,1,1.25,1.5],window=[...middle,1.75,2];
 const mean=(id,options={},times=middle)=>times.reduce((sum,lead)=>sum+hitRate(missileCells(id,{...options,lead})),0)/times.length;
 assert.ok(mean('seeker',{rack:precise},window)-mean('seeker',{},window)>=.09);
 // Swarm warheads stay the harder rack to shake, by a smaller margin since 0.8.2pw.
 assert.ok(mean('swarm',{},window.slice(0,-1))-mean('seeker',{},window.slice(0,-1))>=.05);
 const hauler=mean('seeker',{npc:npcFixture('atlas')});
 for(const hull of ['speedster','talon','demon']){
  const npc=npcFixture(hull);
  assert.ok(hauler-mean('seeker',{npc})>=.25,hull);
 }
});
test('straight flight, early turns and circles stay hittable across the fighter trials',()=>{
 for(const npc of [undefined,npcFixture('speedster'),npcFixture('talon'),npcFixture('demon')]){
  for(const id of ['seeker','swarm','torpedo']){
   for(const cell of missileCells(id,{npc}))assert.ok(cell.hits/cell.total>=.95,`${id}: straight at ${cell.range}`);
   const center=hitRate(missileCells(id,{npc,lead:1}));
   if(id==='torpedo'){
    for(const lead of [1,1.5,2,2.5,3])assert.ok(hitRate(missileCells(id,{npc,lead}))<=.3);
    continue;
   }
   for(const lead of [2.5,2.75,3])assert.ok(hitRate(missileCells(id,{npc,lead}))>=.8,`${id}: early at ${lead}s`);
   for(const circle of ['boosted','unboosted']){
    const rate=hitRate(missileCells(id,{npc,circle}));
    assert.ok(rate>=.7 && rate>center,`${id}, ${circle}: ${rate}`);
   }
  }
 }
});
test('lock times follow aspect and skill, and a completed lock holds to 30 degrees',()=>{
 const rack=LAUNCHERS.seeker,cos=deg=>Math.cos(deg*Math.PI/180);
 for(const [tier,scale] of [[null,1],['ace',1],['veteran',1.5],['novice',2]]){
  for(const aspect of [-1,0,1]){
   const seconds=2*scale*(.75-.25*aspect);
   assert.ok(Math.abs(rackLockProgress(0,rack,tier,800,1,aspect,seconds/2)-.5)<1e-9);
  }
 }
 assert.equal(rackLockProgress(.5,rack,null,800,cos(21),0,.1),0);
 assert.equal(rackLockProgress(1,rack,null,800,cos(29),0,.1),1);
 assert.equal(rackLockProgress(1,rack,null,800,cos(31),0,.1),0);
 assert.equal(rackLockProgress(1,rack,null,801,1,0,.1),0);
});
test('career and Arena deny an unlocked shot, then launch one round on the missile action',()=>{
 for(const arena of [null,{run:true}]){
  const s=session(),p=s.save.player;s.arena=arena;
  p.outfitting.loadouts[p.shipId].launchers[0]='seeker-launcher';fillLauncherMagazines(p);const rounds=p.missiles;
  const ship=s.spawnShip('pirate',[0,0,-200]);ship.rotation=[0,0,0,1];p.currentTargetId=ship.id;
  s.getTargetRef=()=>({kind:'ship',id:ship.id});s.handleActions({missile:true});
  assert.equal(s.monitorStatusUntil,s.save.world.time+1);assert.equal(s.projectiles.length,0);assert.equal(p.missiles,rounds);
  for(let tick=0;tick<60;tick++)s.updatePlayerRackLocks(1/60);
  assert.equal(s.projectiles.length,0);s.handleActions({missile:true});assert.equal(s.projectiles.length,1);assert.equal(p.missiles,rounds-1);
 }
});

test('pilots see one closing, visible, tracking threat per swarm salvo',()=>{
 for(const arena of [null,{run:true}])for(const tier of ['novice','veteran','ace']){
  const s=session();s.arena=arena;
  const enemy=s.spawnShip('pirate',[0,0,-180],undefined,undefined,{tier});
  enemy.velocity=[0,0,0];enemy.rotation=[0,0,0,1];
  const slot=s.projStore.alloc(),shot={slot,id:'a',salvo:7,kind:'missile',targetId:enemy.id,ownerId:'player',life:3};
  s.projectiles.push(shot);s.projStore.setPos(slot,0,0,0);s.projStore.setVel(slot,0,0,300);
  const scan=()=>{s.save.world.time+=.25;observeIncomingFire(s,enemy);};
  scan();assert.equal(enemy.missileBreakUntil,undefined);
  s.projStore.setVel(slot,0,0,-300);s.lineBlocked=()=>true;scan();assert.equal(enemy.missileBreakUntil,undefined);
  s.lineBlocked=()=>false;shot.lostTrack=true;scan();assert.equal(enemy.missileBreakUntil,undefined);
  shot.lostTrack=false;shot.id='b';s.projStore.setPos(slot,0,0,-150);scan();
  const until=s.save.world.time+1;assert.equal(enemy.missileBreakUntil,until);
  shot.id='c';scan();assert.equal(enemy.missileBreakUntil,until);
 }
});

test('fighter racks follow a steady crossing and retreat at game speed',()=>{
 for(const id of ['seeker','swarm'])for(const aspect of [0,Math.PI/2]){
  for(const range of [200,400,600])for(let lane=0;lane<LAUNCHERS[id].volley;lane++)
   assert.ok(missileTrial(id,range,0,lane,0,MISSILE_PADDING,aspect),`${id} at ${range}`);
 }
});

test('torpedoes reach moving frigate and cruiser hulls at three launch ranges',()=>{
 for(const type of ['concord-frigate','concord-cruiser'])for(const range of [200,400,600]){
  const s=session(),p=s.save.player;
  const ship=s.spawnCapitalShip(type,[0,0,-range],'rook','Trial');
  ship.rotation=[0,-Math.SQRT1_2,0,Math.SQRT1_2];ship.velocity=[ship.speed,0,0];ship.targetId='player';ship.holdFire=true;
  // Isolate flight from point defence; an interception is not a dodge.
  ship.combatFit.turrets=[];
  if(ship.capitalClass==='cruiser')for(const m of CRUISER_MOUNTS)if(m.kind==='pdc')ship.capitalMountHull[m.index]=0;
  s.getAvoidanceVector=()=>new Vector3();s.lineBlocked=()=>false;
  const launcher=LAUNCHERS.torpedo,slot=s.projStore.alloc(),origin=new Vector3(...p.position),stationary=new Vector3();
  s.projStore.setPosV(slot,origin);s.projStore.setVel(slot,0,0,-launcher.speed);
  const shot={...launcher,slot,kind:'missile',targetId:ship.id,ownerId:'player',hitWeapon:launcher,launcherId:'torpedo',shield:launcher.projectileShield};
  s.projectiles.push(shot);
  let hit=false;s.damageShip=(victim)=>{hit=hit||victim===ship;};
  for(let i=0;i<600&&shot.life>0;i++){s.save.world.time+=1/60;s.updateAttackAI(ship,origin,stationary,1/60);s.updateProjectiles(1/60);}
  assert.ok(hit,`${type} at ${range}`);
 }
});

test('a live incoming round stays visible on radar while the navigation map opens',()=>{
 const {session:s}=tutorialFixture('earn-standing'),p=s.save.player;
 const slot=s.projStore.alloc();
 s.projStore.setPos(slot,p.position[0]+30,p.position[1],p.position[2]-100);
 const shot={slot,kind:'missile',life:2,targetId:'player'};
 s.projectiles.push(shot);
 assert.equal(s.radarContacts().at(-1).type,'missile');
 assert.ok(Array.isArray(s.buildNavigationMapModel().contacts));
 shot.lostTrack=true;
 assert.ok(!s.radarContacts().some(c=>c.type==='missile'));
});

test('experienced Loki pilots can evade a player seeker in a live attack pass',()=>{
 const hits={novice:0,veteran:0,ace:0};
 for(const tier of Object.keys(hits))for(const range of [300,400,500,600])for(const heading of [-15,0,15]){
  const s=session(),origin=new Vector3(),rest=new Vector3();
  s.save.world.seed=718;s.save.world.time=12;
  s.getAvoidanceVector=()=>rest;s.lineBlocked=()=>false;s.fireNpcGun=()=>{};
  const enemy=s.spawnShip('pirate',[0,0,-range],undefined,'Trial',{tier,temperament:'steady'},{hullId:'speedster',faction:'pirates'});
  const attitude=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI+heading*Math.PI/180);
  enemy.rotation=attitude.toArray();
  enemy.velocity=new Vector3(0,0,-s.npcFlightStats(enemy).maxSpeed).applyQuaternion(attitude).toArray();
  enemy.targetId='player';enemy.combatFit.racks=[];enemy.combatFit.missiles=0;enemy.combatFit.turrets=[];
  const rack=LAUNCHERS.seeker,slot=s.projStore.alloc();
  s.projStore.setPosV(slot,origin);s.projStore.setVel(slot,0,0,-rack.speed);
  const shot={...rack,slot,kind:'missile',targetId:enemy.id,ownerId:'player',launcherId:'seeker',hitWeapon:rack};
  s.projectiles.push(shot);
  let hit=false;s.damageShip=victim=>{if(victim===enemy)hit=true;};
  for(let i=0;i<480&&shot.life>0;i++){
   s.save.world.time+=1/60;s.updateAttackAI(enemy,origin,rest,1/60);s.updateProjectiles(1/60);
  }
  if(hit)hits[tier]++;
 }
 assert.ok(hits.novice>=11,JSON.stringify(hits));
 assert.ok(hits.veteran<=10&&hits.ace>0&&hits.ace<=9,JSON.stringify(hits));
});

test('cover, an absent target and either active drive phase cancel acquisition and release',()=>{
 for(const block of ['cover','spooling','active','transit']){
  const s=session(),p=s.save.player,enemy=s.spawnShip('pirate',[0,0,-200]);
  enemy.rotation=[0,0,0,1];enemy.dark=true;p.currentTargetId=enemy.id;
  p.outfitting.loadouts[p.shipId].launchers[0]='seeker-launcher';fillLauncherMagazines(p);
  s.getTargetRef=()=>({kind:'ship',id:enemy.id});s.updatePlayerRackLocks(2);
  assert.equal(s.rackProgress,1);
  if(block==='cover')s.lineBlocked=()=>true;
  else if(block==='transit')enemy.jumpPursuit=true;
  else s.hyperdriveFx=block;
  const rounds=p.missiles;s.fireMissile();
  assert.equal(s.projectiles.length,0,block);assert.equal(p.missiles,rounds);
  s.updatePlayerRackLocks(10);assert.equal(s.rackProgress,0,block);
 }
});
test('Together holds the salvo for the slowest eligible rack and skips empty mounts',()=>{
 for(const empty of [false,true]){
  const s=session(),p=s.save.player; p.shipId='vanguard';
  const fit=p.outfitting.loadouts.vanguard=p.outfitting.loadouts.wayfarer;
  fit.guns.fill(null);fit.launchers=['torpedo-launcher','swarm-launcher',null];
  const [torpedo]=fillLauncherMagazines(p);
  p.activeLauncherMountId=torpedo.mount.id;p.launcherFireMode='together';
  if(empty)p.launcherMagazines[torpedo.mount.id].rounds=0;
  const ship=s.spawnShip('pirate',[0,0,-200]);ship.rotation=[0,0,0,1];p.currentTargetId=ship.id;
  s.getTargetRef=()=>({kind:'ship',id:ship.id});s.updatePlayerRackLocks(.5);
  assert.equal(s.rackProgress,empty?1:1/3);
  s.fireMissile();assert.equal(s.projectiles.length,empty?4:0);
  if(!empty){s.updatePlayerRackLocks(1);s.fireMissile();assert.equal(s.projectiles.length,5);assert.equal(new Set(s.projectiles.map(p=>p.salvo)).size,1);}
 }
});

test('a novice warning spans the head-on lock and Rapid shortens the firing interval',async()=>{
 const {createEquipmentRecord}=await import('../../src/game/equipmentInventory.js');
 const {launcherForOutfit}=await import('../../src/game/weapons.js');
 for(const rapid of [false,true]){
  const s=session(),target=new Vector3(),ship=s.spawnShip('pirate',[0,0,-200],undefined,'Trial',{tier:'novice'});
  ship.rotation=[0,1,0,0];ship.targetId='player';ship.holdFire=false;ship.energy=100;
  const item=rapid?createEquipmentRecord('seeker-launcher',{id:'eq-test-rapid',rarity:'uncommon',affixes:['rapid'],rolls:[1]}).id:'seeker-launcher';
  const fit=ship.combatFit;fit.racks=[{itemId:item,launcher:'seeker',missiles:2}];fit.launchAt=0;
  let notices=0;s.ui.pushEvent=()=>notices++;
  for(let i=1;i<=240;i++){
   s.save.world.time=i/60;s.updateNpcOrdnance(ship,target,1/60);
   assert.ok(s.ownMonitorStatusUntil>=s.save.world.time);
   if(i<240)assert.equal(s.projectiles.length,0);
  }
  assert.equal(notices,1);assert.equal(s.projectiles.length,1);
  assert.equal(fit.launchAt-4,10*launcherForOutfit(item).cooldown/LAUNCHERS.seeker.cooldown);
 }
});

test('swarm refunds follow physical magazines through hydration, installation and Arena retries',async()=>{
 const {createNewSave,hydrateSave}=await import('../../src/game/save.js');
 const {newArenaRun,readArenaRun,writeArenaRun}=await import('../../src/game/arenaRun.js');
 const {createEquipmentRecord,equipmentAction}=await import('../../src/game/equipmentInventory.js');
 const {createOutfittingState}=await import('../../src/game/outfitting.js');
 const original=createNewSave(718,{tutorial:false}),p=original.player;
 const rack=(id,baseId)=>Object.assign(createEquipmentRecord(baseId,{id,location:{kind:'station',stationId:'helix'}}),{rounds:12});
 const fitted=rack('eq-fitted','swarm-launcher'),stored=rack('eq-stored','shield-swarm-launcher'),locker=rack('eq-locker','swarm-launcher');
 for(const r of [fitted,stored,locker])p.inventory.items[r.id]=r;
 p.outfitting.loadouts.wayfarer.launchers[0]=fitted.id;p.launcherMagazines={'wayfarer-launcher-0':{launcherId:'swarm',rounds:10}};
 p.ownedShips.push('scrapper');p.outfitting.loadouts.scrapper=createOutfittingState(['scrapper']).loadouts.scrapper;
 p.outfitting.loadouts.scrapper.guns[0]=null;p.outfitting.loadouts.scrapper.launchers[0]=stored.id;
 p.storedShips.scrapper={locationId:'helix',resources:{missiles:12,launcherMagazines:{'scrapper-launcher-0':{launcherId:'shield-swarm',rounds:12}}}};
 const h=hydrateSave(original),balance=p.credits+(6+8+8)*240;
 assert.equal(h.player.credits,balance);assert.equal(h.player.swarmRefund,22);
 assert.equal(h.player.launcherMagazines['wayfarer-launcher-0'].rounds,4);assert.equal(h.player.storedShips.scrapper.resources.missiles,4);
 assert.ok(equipmentAction(h.player,'install',{id:locker.id,mountId:'wayfarer-launcher-0'}).ok);
 assert.equal(h.player.launcherMagazines['wayfarer-launcher-0'].rounds,4);
 assert.equal(h.player.inventory.items[fitted.id].rounds,4);assert.equal(h.player.inventory.items[stored.id].rounds,4);
 delete h.player.swarmRefund;const again=hydrateSave(h);assert.equal(again.player.credits,balance);assert.equal(again.player.swarmRefund,undefined);
 const run=newArenaRun(false,719),reward=rack('eq-arena-swarm','shield-swarm-launcher');
 run.arenaRun.rewardRecords={[reward.id]:reward};run.player.outfitting.loadouts.wayfarer.launchers[0]=reward.id;
 run.player.launcherMagazines={'wayfarer-launcher-0':{launcherId:'shield-swarm',rounds:12}};
 run.arenaRun.checkpoint=structuredClone(run.player);
 const local=new Map(),prev=globalThis.window;
 try{
  globalThis.window={localStorage:{getItem:k=>local.get(k),setItem:(k,v)=>local.set(k,v)}};
  writeArenaRun(run);const loaded=readArenaRun();
  for(const player of [loaded.player,loaded.arenaRun.checkpoint]){
   assert.equal(player.credits,run.player.credits+8*240);assert.equal(player.launcherMagazines['wayfarer-launcher-0'].rounds,4);
  }
  assert.equal(loaded.arenaRun.rewardRecords[reward.id].rounds,4);writeArenaRun(loaded);
  assert.equal(readArenaRun().player.credits,loaded.player.credits);
 }finally{if(prev===undefined)delete globalThis.window;else globalThis.window=prev;}
});

test('the closest live round cues the break once, at its best moment, and once per salvo',async()=>{
 const {updateMissileWarning}=await import('../../src/game/weaponFlight.js');
 const s=session(),flight={},scan=()=>updateMissileWarning(flight,s.projectiles,s.projStore,s.save.player);
 const slot=s.projStore.alloc(),shot={slot,kind:'missile',targetId:'player',life:5,hitWeapon:LAUNCHERS.seeker};
 s.projectiles.push(shot);s.projStore.setVel(slot,0,0,300);
 // 300 km/s closing: 600 km is early, 360 km crosses the seeker's 1.3 s cue, 120 km is past it.
 for(const [distance,breaking,committed] of [[600,false,false],[360,true,true],[350,false,true],[120,false,true]]){
  s.projStore.setPos(slot,0,0,-distance);scan();assert.ok(flight.missileThreat>0);assert.equal(flight.missileBreak,breaking,`${distance}`);assert.equal(flight.missileCommitted,committed);
 }
 const later={...shot,breakCued:undefined,slot:s.projStore.alloc()};s.projectiles.push(later);
 s.projStore.setPos(later.slot,0,0,-300);s.projStore.setVel(later.slot,0,0,300);
 scan();assert.equal(flight.missileBreak,false);
 shot.lostTrack=true;scan();assert.equal(flight.missileBreak,true);
 later.targetId='npc';scan();assert.equal(flight.trackingMissile,false);assert.equal(flight.missileThreat,0);assert.equal(flight.missileBreak,false);
 later.targetId='player';s.projStore.setVel(later.slot,0,0,-300);scan();assert.equal(flight.missileThreat,0);
 assert.equal(flight.trackingMissile,true,'a turning seeker still lights LOCK outside the closing-pip window');
});

test('torpedo acquisition multiplies speed and relative angular-rate falloffs',()=>{
 const rack=LAUNCHERS.torpedo,bearing=new Vector3(0,0,-1),range=200;
 for(const [speed,speedFactor] of [[30,1],[40,1],[50,.5],[60,0],[70,0]]){
  for(const [degrees,crossingFactor] of [[3,1],[5,1],[10,.5],[15,0],[20,0]]){
   const shooter=[range*degrees*Math.PI/180,0,0],target=[0,0,speed];
   const factor=torpedoMobilityFactor(rack,shooter,target,bearing,range);
   assert.ok(Math.abs(factor-speedFactor*crossingFactor)<1e-10,`${speed} units/s, ${degrees}°/s`);
   assert.ok(Math.abs(rackLockProgress(0,rack,null,range,1,-1,1.5,factor)-.5*factor)<1e-10);
   for(const other of [LAUNCHERS.seeker,LAUNCHERS.swarm])
    assert.equal(torpedoMobilityFactor(other,shooter,target,bearing,range),1);
  }
 }
 assert.equal(torpedoMobilityFactor(rack,[35,0,0],[35,0,0],bearing,20),1,'shared transverse drift cancels');
 assert.equal(rackLockProgress(.75,rack,null,range,1,-1,.75,0),.5,'blocked progress decays at the ordinary rate');
});

test('a fast fighter prevents player release and shows TOO FAST; a cruising Atlas or parked fighter locks normally',()=>{
 const s=session(),p=s.save.player,enemy=s.spawnShip('pirate',[0,0,-350]);
 enemy.rotation=[0,1,0,0];enemy.velocity=[0,0,70];p.currentTargetId=enemy.id;
 p.outfitting.loadouts[p.shipId].launchers[0]='torpedo-launcher';fillLauncherMagazines(p);
 s.getTargetRef=()=>({kind:'ship',id:enemy.id});
 for(let i=0;i<600;i++)s.updatePlayerRackLocks(1/60);
 assert.equal(s.rackProgress,0);assert.equal(s.rackLocks.get(p.activeLauncherMountId).tooFast,true);
 s.fireMissile();assert.equal(s.projectiles.length,0);assert.equal(s.rackMotionBlocksLaunch(launcherMagazineEntries(p),enemy.id),true);
 for(const [id,speed] of [['atlas',35],['talon',0]]){
  enemy.hullId=id;enemy.velocity=[0,0,speed];s.rackLocks.clear();
  for(let i=0;i<179;i++)s.updatePlayerRackLocks(1/60);
  assert.equal(s.rackLocks.get(p.activeLauncherMountId).tooFast,false);assert.ok(s.rackProgress>.99&&s.rackProgress<1);
  s.updatePlayerRackLocks(1/60);assert.equal(s.rackProgress,1);
 }
 // Even a zero-time release check must reject an old completed lock.
 enemy.velocity=[0,0,70];s.fireMissile();assert.equal(s.projectiles.length,0);
 s.updatePlayerRackLocks(.75);assert.equal(s.rackProgress,.75);
 p.currentTargetId=undefined;s.updatePlayerRackLocks(0);assert.equal(s.rackLocks.size,0);
});

test('NPC tubes prefer a lockable enemy capital or transport while guns keep their fighter target',()=>{
 for(const preferred of ['frigate','corvette','transport']){
  const s=session(),p=s.save.player;p.position=[1000,0,0];
  const bomber=s.spawnShip('pirate',[0,0,0],undefined,'Thor',{tier:'ace'},{hullId:'andromeda',faction:'pirates'});
  bomber.rotation=[0,0,0,1];bomber.velocity=[0,0,0];bomber.energy=100;bomber.holdFire=false;
  const fighter=s.spawnShip('patrol',[-70,0,-250]);fighter.velocity=[0,0,70];bomber.targetId=fighter.id;
  const add=(role,position,faction='concord')=>{
   const actor=s.spawnShip(role,position,undefined,undefined,undefined,{faction});
   actor.holdFire=false;actor.pendingMug=false;actor.velocity=[0,0,25];return actor;
  };
  const ally=add('escort',[-88,0,-300],'pirates');ally.capitalClass='frigate';
  const fast=add('patrol',[15,0,-170]);fast.capitalClass='frigate';fast.velocity=[0,0,70];
  const hidden=add('patrol',[25,0,-190]);hidden.capitalClass='frigate';
  s.lineBlocked=(_start,end)=>end.x===25;
  const mark=add('escort',[45,0,-340]);
  if(preferred==='transport')mark.hullId='mule';else mark.capitalClass=preferred;
  const fit=bomber.combatFit;fit.racks=[{launcher:'swarm',missiles:1},{launcher:'torpedo',missiles:1}];
  for(let i=0;i<240&&!s.projectiles.length;i++){
   s.save.world.time=i/60;s.updateNpcOrdnance(bomber,new Vector3(...fighter.position),1/60);
  }
  assert.equal(bomber.targetId,fighter.id);assert.equal(s.projectiles.length,1,preferred);
  assert.equal(s.projectiles[0].launcherId,'torpedo');assert.equal(s.projectiles[0].targetId,mark.id);
  assert.equal(fit.racks[0].missiles,1);
 }
});
