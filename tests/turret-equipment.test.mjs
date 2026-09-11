import {test} from 'node:test';
import assert from 'node:assert/strict';
import {session} from './weapon-overhaul.test.mjs';
import {createNewSave,hydrateSave} from '../src/game/save.js';
import {loadoutFor,normalizeOutfitting,createOutfittingState,quoteOutfitting,commitOutfitting,HULL_HARDPOINTS} from '../src/game/outfitting.js';
import {getEffectiveShipStats} from '../src/game/shipStats.js';
import {regenerateCombatResources} from '../src/game/combatResources.js';

test('new starter is two beams and an empty turret; displaced duplicate weapons survive repeated reloads',()=>{
 const fresh=createNewSave(8);assert.deepEqual(fresh.player.outfitting.loadouts.wayfarer.guns,['beam-emitter','beam-emitter']);
 assert.deepEqual(fresh.player.outfitting.loadouts.wayfarer.turrets,[null]);assert.equal(fresh.player.outfitting.loadouts.wayfarer.fireGroups.activeGroup,'ALL');
 const old=createNewSave(8);old.version=13;old.player.shipId='lancer';old.player.ownedShips=['lancer'];old.player.outfitting=createOutfittingState(['lancer']);
 old.player.outfitting.schema=1;old.player.outfitting.loadouts.lancer.guns=['gauss-cannon','gauss-cannon','gauss-cannon'];
 old.player.outfitting.factory.lancer.guns=[false,false,false];
 const a=hydrateSave(old),b=hydrateSave(JSON.parse(JSON.stringify(a)));
 for(const save of [a,b]){assert.equal(save.player.outfitting.locker['gauss-cannon'],1);assert.deepEqual(save.player.outfitting.loadouts.lancer.guns,['gauss-cannon','gauss-cannon']);}
});

test('Fire all cycles with populated groups only and low energy cannot starve one gun',()=>{
 const s=session(),p=s.save.player,fit=p.outfitting.loadouts.wayfarer;
 fit.fireGroups.assignments['wayfarer-gun-1']='B';
 for(const group of ['A','B','ALL','A']){s.cycleWeapon();assert.equal(s.activeFireGroup(),group);}
 fit.fireGroups.assignments['wayfarer-gun-1']='A';s.cycleWeapon();assert.equal(s.activeFireGroup(),'ALL');
 const counts={};s.fireBeam=(owner,w,start,dir,id)=>counts[id]=(counts[id]??0)+1;
 p.energy=0;s.gunCooldown=0;
 for(let i=0;i<600;i++){s.save.world.time=i/60;regenerateCombatResources(p,s.playerStats(),1/60);s.fireMountedPlayerGuns();}
 assert.ok(counts['wayfarer-gun-0']>5);assert.ok(counts['wayfarer-gun-1']>5);
 assert.ok(Math.abs(counts['wayfarer-gun-0']-counts['wayfarer-gun-1'])<=1);
});

function missile(s,position,targetId='player') {
 const slot=s.projStore.alloc();s.projStore.setPos(slot,...position);s.projStore.setVel(slot,0,0,0);
 const p={id:'m-'+slot,slot,kind:'missile',acceleration:0,damage:42,ownerId:'enemy',targetId,life:10};s.projectiles.push(p);return p;
}
function tick(s,count=90){for(let i=0;i<count;i++){s.save.world.time+=1/60;s.updateTurrets(s.save.player,'player',1/60);s.updateProjectiles(1/60);}}
test('PDC obeys its hemisphere, finite cadence, energy reserve and hold-fire control',()=>{
 const s=session(),p=s.save.player;p.outfitting.loadouts.wayfarer.turrets=['pdc'];p.mode='mining';
 const above=missile(s,[0,60,0]),below=missile(s,[0,-60,0]),other=missile(s,[0,30,0],'ally');
 tick(s);assert.equal(above.life,0);assert.ok(below.life>0);assert.ok(other.life>0);
 const one=missile(s,[0,40,0]),two=missile(s,[0,50,0]);tick(s,1);assert.ok(one.life>0||two.life>0);
 p.turretsHeld=true;const held=missile(s,[0,20,0]);tick(s);assert.ok(held.life>0);
 p.turretsHeld=false;p.energy=18;tick(s);assert.ok(held.life>0);assert.equal(p.turretRuntime[0].status,'TURRETS WAITING FOR ENERGY');
});
test('tracking turret requires a selected hostile and clear sight; banking changes coverage',()=>{
 const s=session(),p=s.save.player;p.outfitting.loadouts.wayfarer.turrets=['tracking-turret'];
 const ship={id:'target',hostile:false,hull:100,position:[0,70,0]};s.ships=[ship];s.getTargetRef=()=>({kind:'ship',id:ship.id});let fired=0;s.fireBeam=()=>fired++;
 tick(s);assert.equal(fired,0);ship.hostile=true;s.lineBlocked=()=>true;tick(s);assert.equal(fired,0);
 s.lineBlocked=()=>false;tick(s);assert.ok(fired>0);const before=fired;
 p.rotation=[0,0,1,0];tick(s);assert.equal(fired,before);
});
test('power, shield and engine alternatives have real opposing effects',()=>{
 const p=createNewSave(8).player,base=getEffectiveShipStats(p),fit=p.outfitting.loadouts.wayfarer;
 fit.power=['capacitor-bank'];let stats=getEffectiveShipStats(p);assert.ok(stats.energyCapacity>base.energyCapacity&&stats.reactorOutput<base.reactorOutput);
 fit.power=['sustained-reactor'];stats=getEffectiveShipStats(p);assert.ok(stats.energyCapacity<base.energyCapacity&&stats.reactorOutput>base.reactorOutput);
 fit.drive=['engine-mk2'];stats=getEffectiveShipStats(p);assert.ok(stats.maxSpeed>base.maxSpeed&&stats.angularAcceleration<base.angularAcceleration&&stats.burnFuelMultiplier>1);
 fit.drive=['thrusters-mk2'];stats=getEffectiveShipStats(p);assert.ok(stats.maxSpeed<base.maxSpeed&&stats.angularAcceleration>base.angularAcceleration&&stats.lateralMultiplier>1);
 fit.defense=['recovery-shield'];stats=getEffectiveShipStats(p);assert.ok(stats.shield<base.shield&&stats.shieldRechargeMultiplier>1);
});


test('buying to storage leaves help closed; the first installed gun shows it once',()=>{
 const s=session(),p=s.save.player;p.dockedAt='helix';p.credits=100000;
 s.arena=undefined;s.persistSave=()=>{};s.handleTutorialEvent=()=>{};
 const buy=s.previewOutfitting(p.shipId,loadoutFor(p),{purchases:{'pulse-cannon':1}});
 assert.equal(buy.ok,true,buy.code);const bought=s.applyOutfitting(buy);assert.equal(bought.ok,true,bought.code);
 assert.equal(p.weaponGroupHelpSeen,undefined);assert.equal(s.ui.outfitGroupHelp,undefined);
 const draft=loadoutFor(p);draft.guns[0]='pulse-cannon';
 const install=s.previewOutfitting(p.shipId,draft);
 assert.equal(install.ok,true,install.code);assert.equal(s.applyOutfitting(install).ok,true);
 assert.equal(p.weaponGroupHelpSeen,true);assert.equal(s.ui.outfitGroupHelp,true);
 s.ui.outfitGroupHelp=false;s.save=hydrateSave(JSON.parse(JSON.stringify(s.save)));
 const again=loadoutFor(s.save.player);again.guns[1]='pulse-cannon';
 assert.equal(s.applyOutfitting(s.previewOutfitting(p.shipId,again)).ok,true);
 assert.equal(s.ui.outfitGroupHelp,false);
});

test('Fire all reserves enough energy for a slower, more expensive magnetic gun',()=>{
 const s=session(),p=s.save.player;p.shipId='talon';p.ownedShips=['talon'];
 const fit=loadoutFor(p);fit.guns=['pulse-cannon',null,'gauss-cannon'];fit.fireGroups.activeGroup='ALL';p.outfitting.loadouts.talon=fit;
 p.energy=0;
 for(let i=0;i<600;i++){s.save.world.time=i/60;regenerateCombatResources(p,s.playerStats(),1/60);s.fireMountedPlayerGuns();}
 assert.ok(s.projectiles.filter(p=>p.weaponId==='gauss').length>=5);
 assert.ok(s.projectiles.filter(p=>p.weaponId==='pulse').length>=10);
});
