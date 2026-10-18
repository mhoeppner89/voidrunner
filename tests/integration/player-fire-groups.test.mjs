import assert from 'node:assert/strict';
import {test} from 'node:test';
import {session} from '../helpers/session.mjs';
import {loadoutFor,HULL_HARDPOINTS,normalizeOutfitting} from '../../src/game/outfitting.js';
import {hydrateSave} from '../../src/game/save.js';
function fixture(mode='together'){
 const s=session(),p=s.save.player;s.persistSave=()=>{};const fit=loadoutFor(p);fit.guns=['pulse-cannon','pulse-cannon',null];fit.launchers=[null,null,'seeker-launcher'];fit.fireGroups.assignments['wayfarer-weapon-0']='A';fit.fireGroups.assignments['wayfarer-weapon-1']='A';fit.fireGroups.activeGroup='A';fit.fireGroups.firingModes={A:mode,B:'together'};
 p.outfitting.loadouts.wayfarer=fit;const shots=[],spawn=s.spawnPlayerGunProjectile;s.spawnPlayerGunProjectile=function(...args){shots.push({time:p===this.save.player?this.save.world.time:NaN,mount:args[7]});return spawn.apply(this,args);};
 return {s,p,fit,shots};
}
test('together fires both mounted guns in the same step; alternating staggers them without losing half the output',()=>{
 const logs={};for(const mode of ['together','alternating']){
  const {s,p,shots}=fixture(mode);for(let i=0;i<120;i++){s.save.world.time=i/60;p.energy=100;s.fireMountedPlayerGuns();}logs[mode]=shots;
  assert.equal(shots.filter(x=>x.time===0).length,mode==='together'?2:1);
  for(let i=1;i<shots.length;i++)if(mode==='alternating'){assert.ok(shots[i].time>shots[i-1].time);assert.notEqual(shots[i].mount,shots[i-1].mount);}
 }
 assert.ok(Math.abs(logs.together.length-logs.alternating.length)<=2,JSON.stringify({together:logs.together.length,alternating:logs.alternating.length}));
});
test('Fire All respects each group mode, excludes inactive groups and never bypasses energy or mount cooldowns',()=>{
 const {s,p,fit,shots}=fixture('alternating');fit.guns[2]='pulse-cannon';fit.launchers[2]=null;fit.fireGroups.assignments['wayfarer-weapon-2']='B';fit.fireGroups.activeGroup='ALL';p.energy=100;s.fireMountedPlayerGuns();
 assert.equal(shots.length,2);assert.ok(shots.some(x=>x.mount==='wayfarer-weapon-2'));
 const count=shots.length;s.fireMountedPlayerGuns();assert.equal(shots.length,count,'same-tick calls cannot bypass a mount cooldown');
 s.save.world.time=2;p.energy=0;s.fireMountedPlayerGuns();assert.equal(shots.length,count);assert.equal(p.energy,0);
 fit.fireGroups.activeGroup='B';s.save.world.time=3;p.energy=100;s.fireMountedPlayerGuns();assert.equal(shots.at(-1).mount,'wayfarer-weapon-2');assert.equal(shots.length,count+1);
});
test('cockpit assignments and modes work in career and Arena Run and persist through normalization/reload',()=>{
 for(const run of [false,true]){
  const {s,p,fit}=fixture();if(run)s.arena={run:true};
  assert.equal(s.setWeaponGroup('wayfarer-weapon-1','B'),true);assert.equal(s.setGroupFireMode('B','alternating'),true);
  assert.equal(s.selectFireGroup('B'),true);assert.equal(s.activeFireGroup(),'B');
  assert.equal(s.setWeaponGroup('wayfarer-weapon-2','B'),false,'launchers keep their separate trigger');assert.equal(s.setWeaponGroup('other-ship-weapon-0','B'),false);assert.equal(s.setGroupFireMode('ALL','alternating'),false);assert.equal(s.setGroupFireMode('A','invalid'),false);
  normalizeOutfitting(p);const saved=hydrateSave(JSON.parse(JSON.stringify(s.save))).player.outfitting.loadouts.wayfarer.fireGroups;
  assert.equal(saved.assignments['wayfarer-weapon-1'],'B');assert.equal(saved.activeGroup,'B');assert.deepEqual(saved.firingModes,{A:'together',B:'alternating'});
  assert.equal(s.setWeaponGroup('wayfarer-weapon-1','A'),true);assert.equal(p.outfitting.loadouts.wayfarer.fireGroups.activeGroup,'A','empty active group follows the remaining guns');
 }
});
test('old saves default to together and malformed modes cannot alter firing',()=>{
 const {p,fit}=fixture();delete fit.fireGroups.firingModes;normalizeOutfitting(p);assert.deepEqual(p.outfitting.loadouts.wayfarer.fireGroups.firingModes,{A:'together',B:'together'});
 p.outfitting.loadouts.wayfarer.fireGroups.firingModes={A:'invalid',B:'alternating'};normalizeOutfitting(p);assert.deepEqual(p.outfitting.loadouts.wayfarer.fireGroups.firingModes,{A:'together',B:'alternating'});
});
test('mid-wave control changes update Arena retry preferences without replacing its safe hull or capacitor',()=>{
 const {s,p}=fixture();s.arena={run:true};const checkpoint=JSON.parse(JSON.stringify(p));checkpoint.hull=123;checkpoint.energy=45;s.save.arenaRun={phase:'combat',checkpoint};p.hull=7;p.energy=3;
 assert.ok(s.setWeaponGroup('wayfarer-weapon-1','B'));assert.ok(s.setGroupFireMode('B','alternating'));
 assert.equal(checkpoint.outfitting.loadouts.wayfarer.fireGroups.assignments['wayfarer-weapon-1'],'B');assert.equal(checkpoint.outfitting.loadouts.wayfarer.fireGroups.firingModes.B,'alternating');assert.equal(checkpoint.hull,123);assert.equal(checkpoint.energy,45);
});
