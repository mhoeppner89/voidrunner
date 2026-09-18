import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s==='three'?new URL('../vendor/three.module.min.js',import.meta.url).href:s,c);}});
const THREE=await import('../vendor/three.module.min.js');
const {GameSession}=await import('../src/game/game.js');
const {SpaceRenderer}=await import('../src/game/render.js');
const {EntityStore}=await import('../src/game/entityStore.js');
const {createNewSave,hydrateSave}=await import('../src/game/save.js');
const {WEAPONS,LEGACY_GUN_AMMO,AMMO_CAPACITY}=await import('../src/game/weapons.js');
const {weaponDamage,disruptWeapons}=await import('../src/game/weaponDamage.js');
const {getEffectiveShipStats}=await import('../src/game/shipStats.js');
const {loadoutFor,HULL_HARDPOINTS,itemFitsMount,OUTFIT_ITEMS}=await import('../src/game/outfitting.js');
const {createEnemyLoadout}=await import('../src/game/enemyLoadouts.js');
export function session(){
 const s=Object.create(GameSession.prototype);s.save=createNewSave(175,{tutorial:false});s.save.player.position=[0,0,0];s.save.player.velocity=[0,0,0];s.save.player.rotation=[0,0,0,1];s.save.player.dockedAt=undefined;
 s.ships=[];s.projectiles=[];s.projectileCounter=0;s.entityCounter=0;s.projStore=new EntityStore(1024);s.arena={};s.gunCooldown=0;
 for(const key of ['A','B','C','D','E','F','G','H','I','J','K','L','ShipAvoid','P0','P1','P2','P3','P4','P5','P6','BlastStart','BlastEnd','AudioLocal'])s['tmp'+key]=new THREE.Vector3();
 for(const key of ['tmpPlayerOrientation','tmpAudioOrientation','tmpQ','tmpQ2'])s[key]=new THREE.Quaternion();s.tmpM4=new THREE.Matrix4();
 s.ui={pushEvent(){}};s.audio={play(){},playAtDirection(){}};
 s.renderer={spawnMuzzleFlash(){},spawnExplosion(){},spawnImpact(){},spawnRockImpact(){},showCombatBeam(){}};
 s.obstacles=[];s.activeDockObstacle=()=>undefined;s.activeFieldObstacles=()=>s.obstacles;
 s.forEachObstacleAlongSegment=(a,b,fn)=>s.obstacles.forEach(fn);s.forEachObstacleInBox=(...args)=>s.obstacles.forEach(args.at(-1));
 s.playerStats=()=>getEffectiveShipStats(s.save.player);s.getTargetRef=()=>undefined;s.addPlayerEmission=()=>{};s.snapToCombatSpeed=()=>{};s.maybeHitTaunt=()=>{};
 return s;
}
test('all guns use energy; legacy stock refunds exactly once and missiles survive',()=>{
 assert.deepEqual(AMMO_CAPACITY,{});assert.ok(Object.values(WEAPONS).every(w=>w.ammoId===null&&w.energyCost>0));
 const old=createNewSave(3);old.version=12;old.player.credits=100;old.player.ammo={slugs:10,shells:5,cells:3,pods:2};
 const migrated=hydrateSave(old);assert.equal(migrated.player.credits,100+260+90+66+80);
 assert.deepEqual(migrated.player.ammo,{});assert.equal(migrated.player.missiles,old.player.missiles);
 assert.equal(hydrateSave(JSON.parse(JSON.stringify(migrated))).player.credits,migrated.player.credits);
 const fresh=createNewSave(3);assert.equal(hydrateSave(fresh).player.credits,fresh.player.credits);
});
test('bypass, shield overflow and hull bonuses are identical through player and NPC damage entry points',()=>{
 for(const shield of [0,10,100])for(const w of [WEAPONS.pulse,WEAPONS.gauss,WEAPONS.ripper,WEAPONS.ion]){
  const s=session(),player=s.save.player;player.hull=100;player.shield=shield;
  const ship={tutorialCompanion:true,hull:100,shield,position:[0,0,0]};
  s.damagePlayer(20,'test',false,w);s.damageShip(ship,20,'enemy',undefined,w);
  assert.equal(player.hull,ship.hull);assert.equal(player.shield,ship.shield);
 }
 assert.deepEqual(weaponDamage(100,20,WEAPONS.gauss),{shield:17,hull:3});
 assert.deepEqual(weaponDamage(10,20,WEAPONS.ripper),{shield:10,hull:13.5});
});
test('easy mode halves incoming player damage in career and arena sessions',()=>{
 for(const shield of [0,12])for(const arena of [false,true]){
  const normal=session(),easy=session();
  if(arena){
   normal.arena={run:true};easy.arena={run:true};
   normal.save.arenaRun={damage:0};easy.save.arenaRun={damage:0};
  }
  for(const s of [normal,easy]){s.save.player.shield=shield;s.save.player.hull=100;}
  normal.damagePlayer(20,'test',false,WEAPONS.pulse);
  easy.save.settings.easyMode=true;
  easy.damagePlayer(20,'test',false,WEAPONS.pulse);
  const normalLoss=shield-normal.save.player.shield+100-normal.save.player.hull;
  const easyLoss=shield-easy.save.player.shield+100-easy.save.player.hull;
  assert.equal(easyLoss,normalLoss*.5,arena?'arena hull damage':'career hull damage');
  if(arena)assert.equal(easy.save.arenaRun.damage,easyLoss,'arena score tracks reduced damage taken');
 }
});
test('ion cannot repeatedly disable weapons and shields prevent disruption',()=>{
 const actor={shield:1};assert.equal(disruptWeapons(actor,WEAPONS.ion,0),false);
 actor.shield=0;assert.equal(disruptWeapons(actor,WEAPONS.ion,0),true);
 assert.equal(disruptWeapons(actor,WEAPONS.ion,0.7),false);assert.equal(actor.disruptedUntil,1);
 assert.equal(disruptWeapons(actor,WEAPONS.ion,1.9),false);assert.equal(disruptWeapons(actor,WEAPONS.ion,2),true);
});
test('mounted pulse and magnetic guns keep independent cadence and stop on empty energy',()=>{
 const s=session();s.save.player.shipId='talon';s.save.player.ownedShips=['talon'];const fit=loadoutFor(s.save.player);fit.guns=['pulse-cannon',null,'gauss-cannon'];
 for(const m of HULL_HARDPOINTS.talon.guns)fit.fireGroups.assignments[m.id]='A';fit.fireGroups.activeGroup='A';s.save.player.outfitting.loadouts.talon=fit;
 for(let frame=0;frame<120;frame++){s.save.world.time=frame/60;s.save.player.energy=100;s.fireMountedPlayerGuns();}
 const pulse=s.projectiles.filter(p=>p.weaponId==='pulse').length,gauss=s.projectiles.filter(p=>p.weaponId==='gauss').length;
 assert.ok(pulse>=10);assert.ok(gauss>=2&&gauss<=3);assert.ok(pulse>gauss*3);
 s.save.world.time=5;s.save.player.energy=0;const count=s.projectiles.length;s.fireMountedPlayerGuns();assert.equal(s.projectiles.length,count);
});
test('beam assist snaps within its cone and respects range and the assist setting; arena equips two beams and an automatic laser turret',()=>{
 const s=session();s.save.settings.aimAssist=true;
 const ship={id:'aim',hull:100,position:[20,0,-100],velocity:[50,0,0]};s.ships=[ship];
 const base=new THREE.Vector3(0,0,-1),out=new THREE.Vector3(),target={kind:'ship',id:'aim'};
 const aim=()=>s.weaponAimDirection(new THREE.Vector3(),[0,0,0],WEAPONS.beam,target,base,out);
 assert.ok(aim().angleTo(new THREE.Vector3(...ship.position))<1e-7);
 ship.position=[40,0,-100];assert.ok(aim().equals(base));
 ship.position=[20,0,-WEAPONS.beam.range];assert.ok(aim().equals(base));
 ship.position=[20,0,-100];s.save.settings.aimAssist=false;assert.ok(aim().equals(base));
 s.configureArenaImpulseFit('beam');const fit=loadoutFor(s.save.player);
 assert.deepEqual(fit.guns,['beam-emitter','beam-emitter']);assert.deepEqual(fit.turrets,['tracking-turret']);
 assert.ok(Object.values(fit.fireGroups.assignments).every(g=>g==='A'));
 for(const [i,m] of HULL_HARDPOINTS.wayfarer.guns.entries())assert.ok(itemFitsMount(OUTFIT_ITEMS[fit.guns[i]],m));
});
test('holding beam fire produces separate pulses, with lower peak damage and better energy efficiency than accurate pulse shots',()=>{
 const s=session(),fit=loadoutFor(s.save.player);fit.guns=['beam-emitter',null];
 for(const m of HULL_HARDPOINTS.wayfarer.guns)fit.fireGroups.assignments[m.id]='A';fit.fireGroups.activeGroup='A';s.save.player.outfitting.loadouts.wayfarer=fit;
 const shots=[];s.fireBeam=()=>shots.push(s.save.world.time);
 for(let frame=0;frame<120;frame++){s.save.world.time=frame/60;s.save.player.energy=100;s.fireMountedPlayerGuns();}
 assert.equal(shots.length,5);
 for(let i=1;i<shots.length;i++)assert.ok(shots[i]-shots[i-1]>=0.4-1e-9);
 s.save.world.time=3;s.save.player.energy=WEAPONS.beam.energyCost-.01;s.fireMountedPlayerGuns();assert.equal(shots.length,5);
 const b=WEAPONS.beam,p=WEAPONS.pulse,damage=p.damageFlat;
 assert.ok(b.damageFlat/b.cooldown<damage/p.cooldown);
 assert.ok(b.damageFlat/b.energyCost>damage/p.energyCost);
});
test('beam damages the first hull only, respects obstacles and has bounded reusable visuals',()=>{
 const s=session();const a={id:'a',role:'pirate',position:[0,0,-80],rotation:[0,0,0,1],hull:100},b={...a,id:'b',position:[0,0,-150]};s.ships=[a,b];
 const hits=[];s.damageShip=(ship,damage)=>hits.push({id:ship.id,damage});
 let end;const impacts=[];s.renderer.spawnImpact=p=>impacts.push(p);s.renderer.showCombatBeam=(id,start,last)=>{end=last.clone();};
 for(let i=0;i<20;i++)s.fireBeam('player',WEAPONS.beam,new THREE.Vector3(),new THREE.Vector3(0,0,-1),'mount');
 assert.equal(hits.length,20);assert.ok(hits.every(x=>x.id==='a'));assert.ok(Math.abs(hits.reduce((sum,x)=>sum+x.damage,0)-20*WEAPONS.beam.damageFlat)<1e-8);assert.ok(end.z>-80);
 assert.equal(impacts.length,20);assert.deepEqual(impacts.at(-1),end.toArray());
 s.obstacles=[{id:'rock',x:0,y:0,z:-40,radius:8,losRadius:8}];hits.length=0;s.fireBeam('player',WEAPONS.beam,new THREE.Vector3(),new THREE.Vector3(0,0,-1),'mount');assert.equal(hits.length,0);assert.ok(end.z>-40);assert.equal(impacts.length,21);
 s.obstacles=[];s.ships=[];s.fireBeam('player',WEAPONS.beam,new THREE.Vector3(),new THREE.Vector3(0,0,-1),'mount');assert.equal(impacts.length,21);
 const r=Object.create(SpaceRenderer.prototype);r.scene=new THREE.Scene();
 for(let i=0;i<80;i++)r.showCombatBeam('beam-'+i,new THREE.Vector3(),new THREE.Vector3(0,0,-50),0xffffff);
 assert.equal(r.combatBeams.size,24);const first=r.combatBeams.get('beam-0');assert.ok(first.userData.life<WEAPONS.beam.cooldown/2);first.visible=false;r.showCombatBeam('replacement',new THREE.Vector3(),new THREE.Vector3(0,0,-30),0xff0000);assert.equal(r.combatBeams.size,24);assert.equal(r.combatBeams.get('replacement'),first);
});
test('explosions hit the direct victim once, include the player and stop at a wall',()=>{
 for(const wall of [false,true]){
  const s=session();s.save.player.position=[15,0,-20];
  const target={id:'target',role:'pirate',faction:'red-talons',hull:100,position:[0,0,-20],rotation:[0,0,0,1]};
  const bystander={...target,id:'behind',position:[-15,0,-20]};s.ships=[target,bystander];
  if(wall)s.obstacles=[{id:'wall',x:-10,y:0,z:-20,radius:5,losRadius:5}];
  const damage=new Map();s.damageShip=(ship,n)=>damage.set(ship.id,(damage.get(ship.id)??0)+n);s.damagePlayer=n=>damage.set('player',(damage.get('player')??0)+n);
  s.spawnPlayerGunProjectile(WEAPONS.mortar,new THREE.Vector3(0,0,-1),0,0,0,[0,0,0],'target','mount');
  for(let i=0;i<20;i++)s.updateProjectiles(1/60);
  assert.equal(damage.get('target'),WEAPONS.mortar.damageFlat);assert.ok(damage.get('player')>0);
  assert.equal(damage.has('behind'),!wall);
 }
});
test('enemy fittings obey mounts and finite missiles need a continuous lock and warning',()=>{
 for(let i=0;i<12;i++){
  const ship={role:'pirate',maxShield:58},fit=createEnemyLoadout(ship,i);
  fit.guns.forEach((id,index)=>assert.ok(itemFitsMount(OUTFIT_ITEMS[id],HULL_HARDPOINTS[fit.hullId].guns[index])));
 }
 const s=session(),ship=s.spawnShip('pirate',[0,0,180],undefined,undefined,{tier:'ace',temperament:'steady'});
 ship.rotation=[0,0,0,1];ship.targetId='player';ship.combatFit=createEnemyLoadout(ship,0);ship.combatFit.missiles=1;
 for(let i=0;i<90;i++){s.save.world.time=i/60;s.updateNpcOrdnance(ship,new THREE.Vector3(),1/60);}
 assert.equal(s.projectiles.length,0);assert.equal(ship.combatFit.warned,true);
 s.obstacles=[{x:0,y:0,z:90,radius:20,losRadius:20}];s.updateNpcOrdnance(ship,new THREE.Vector3(),1/60);assert.equal(ship.combatFit.lock,0);assert.equal(ship.combatFit.warned,false);s.obstacles=[];
 for(let i=0;i<1000;i++){s.save.world.time=2+i/60;s.updateNpcOrdnance(ship,new THREE.Vector3(),1/60);}
 assert.equal(s.projectiles.filter(p=>p.kind==='missile').length,1);assert.equal(ship.combatFit.missiles,0);
});
test('novices lock slowly and every subsequent missile requires a fresh warned lock',()=>{
 for(const tier of ['novice','veteran','ace']){
  const s=session(),ship=s.spawnShip('pirate',[0,0,180],undefined,undefined,{tier,temperament:'steady'});
  ship.rotation=[0,0,0,1];ship.targetId='player';ship.combatFit=createEnemyLoadout(ship,0);ship.combatFit.missiles=2;
  const warnings=[],launches=[];s.setOwnMonitorStatus=()=>warnings.push(s.save.world.time);
  for(let i=0;i<2400;i++){
   s.save.world.time=i/60;const before=s.projectiles.length;
   s.updateNpcOrdnance(ship,new THREE.Vector3(),1/60);
   if(s.projectiles.length>before)launches.push(s.save.world.time);
  }
  assert.equal(launches.length,2);assert.equal(warnings.length,2);
  const lock=tier==='novice'?4:2.5,gap=tier==='novice'?10:6;
  assert.ok(launches[0]>=lock-.02);assert.ok(launches[0]<lock+.1);
  assert.ok(launches[1]-launches[0]>=gap+lock-.02);
  launches.forEach((time,i)=>assert.ok(time-warnings[i]>=(tier==='novice'?2.6:1.1)));
  assert.equal(ship.combatFit.missiles,0);
 }
});
