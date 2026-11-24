import test from 'node:test';
import assert from 'node:assert/strict';
import {session} from '../helpers/session.mjs';
import {WEAPONS,LAUNCHERS,TRACKING_LASER} from '../../src/game/weapons.js';
import {CRUISER_GUN} from '../../src/game/cruiserCombat.js';
import {passiveShieldRechargeRate,regenerateCombatResources,registerCombatShieldHit,combatShieldRechargeScale,COMBAT_SHIELD_RECOVERY_SECONDS} from '../../src/game/combatResources.js';

function victim(kind){
 const s=session();s.save.world.time=0;s.save.settings.easyMode=false;
 s.onExplorationActorHit=()=>{};s.onDistressActorHit=()=>{};s.destroyShip=()=>{};
 s.setOwnMonitorStatus=()=>{};s.abandonMiningDrones=()=>{};s.recallPdcDrones=()=>{};
 s.playerStats=()=>({shield:70});
 const actor=kind==='player'?s.save.player:{id:'victim',position:[0,0,-100],surrendered:true,captured:true};
 Object.assign(actor,{hull:210,maxHull:210,shield:70,maxShield:70});
 return {s,actor,hit:(amount,weapon={},source='weapons fire')=>kind==='player'
  ?s.damagePlayer(amount,source,false,weapon)
  :s.damageShip(actor,amount,source==='collision'?'environment':kind==='player-owned'?'player':'attacker',undefined,weapon,undefined,Boolean(weapon.damage))};
}

function lethalVolleys(kind,weapon,scale=1){
 const {s,actor,hit}=victim(kind);let volleys=0;
 // Exercise the real damage and shield activation handlers at the real fire
 // cadence, including simultaneous pellets and launcher hull multipliers.
 while(actor.hull>0&&volleys<10000){
  s.save.world.time=++volleys*weapon.cooldown;
  for(let i=0;i<(weapon.pellets??weapon.volley??1)&&actor.hull>0;i++)hit((weapon.damageFlat??weapon.damage)*scale,weapon);
 }
 assert.ok(actor.hull<=0,'sustained fire must remain lethal');
 return volleys;
}

test('all owners use the same published damage and lethal volleys',()=>{
 for(const w of [WEAPONS.pulse,WEAPONS.beam,WEAPONS.ripper,WEAPONS.gauss,WEAPONS.mortar,LAUNCHERS.seeker,LAUNCHERS.swarm,TRACKING_LASER]){
  assert.equal(lethalVolleys('npc',w),lethalVolleys('player',w),w.id);
  assert.equal(lethalVolleys('player-owned',w),lethalVolleys('npc',w),w.id);
 }
});
test('beam and ordnance keep their impact and economy; physical guns reward landed hits more',()=>{
 const beam=WEAPONS.beam;
 assert.deepEqual({damage:beam.damageFlat,cooldown:beam.cooldown,energy:beam.energyCost,speed:beam.speed,range:beam.range,assist:beam.assist},
  {damage:10.4,cooldown:.4,energy:3.5,speed:100000,range:350,assist:1.4});
 for(const [w,damage] of [[LAUNCHERS.seeker,60],[TRACKING_LASER,6.4],[CRUISER_GUN,160]])assert.ok(Math.abs((w.damageFlat??w.damage)-damage)<1e-9,w.id);
 for(const [id,previous] of Object.entries({pulse:9.2,gauss:27.2,ripper:4,ion:4,mortar:56,pdc:.64})){
  const w=WEAPONS[id],old={...w,damageFlat:previous};
  assert.ok(lethalVolleys('npc',w)<lethalVolleys('npc',old),`${id}: fewer landed volleys`);
  assert.ok(w.damageFlat/w.energyCost>old.damageFlat/old.energyCost,`${id}: better damage for the same capacitor cost`);
 }
 assert.equal(WEAPONS.pulse.cooldown,.17);assert.equal(WEAPONS.pulse.speed,500);assert.equal(WEAPONS.pulse.energyCost,3.2);
 assert.ok(Math.abs(WEAPONS.mortar.splashDamage-22.4)<1e-9);assert.equal(WEAPONS.mortar.splashMin,3.2);
});
test('damage handlers never multiply a hit by ownership or combat mode',()=>{
 for(const mode of [null,{run:true},{scenario:'1v1'},{observer:true}])for(const attacker of ['player','npc','environment']){
  const {s,actor}=victim('npc');s.arena=mode;actor.shield=0;
  s.damageShip(actor,10,attacker,undefined,WEAPONS.pulse,undefined,true);assert.equal(actor.hull,200);
 }
});

test('physical collision and environmental damage are not reduced with weapon damage',()=>{
 for(const kind of ['npc','player']){
  const {actor,hit}=victim(kind);actor.shield=0;hit(17,{},'collision');
  assert.equal(actor.hull,193,kind);
 }
});

test('continuous capital shield recharge keeps its damage-to-repair ratio',()=>{
 for(const [kind,previous] of [['frigate',32],['cruiser',16],['carrier',16]]){
  const rate=passiveShieldRechargeRate(kind==='frigate'?32:8,kind);
  assert.equal(rate,previous*.5,kind);
 }
 assert.equal(passiveShieldRechargeRate(3.8),7.6,'ordinary out-of-combat recharge is preserved');
});

test('recent weapon hits reduce recharge equally, expire through simulation time, and never enter saves',()=>{
 const stats={shield:70,energyCapacity:500,reactorOutput:20,shieldRegeneration:10};
 for(const kind of ['npc','player']){
  const {s,actor,hit}=victim(kind);actor.energy=100;
  hit(10,WEAPONS.pulse);actor.shield=0;
  let result=regenerateCombatResources(actor,stats,1,0);
  assert.equal(result.shieldRestored,5,kind);assert.equal(result.generated,20);
  assert.equal(result.shieldEnergySpent,6.25,'unchanged energy cost per shield point');
  regenerateCombatResources(actor,stats,COMBAT_SHIELD_RECOVERY_SECONDS-1,5);
  actor.shield=0;result=regenerateCombatResources(actor,stats,1,0);
  assert.equal(result.shieldRestored,10,'normal recharge returns after twelve simulated seconds');
  hit(10,WEAPONS.pulse);actor.shield=0;
  const restored=JSON.parse(JSON.stringify(actor));
  assert.equal(combatShieldRechargeScale(restored,1),1,'a saved actor contains no transient combat penalty');
  // Legacy projectiles and splash do not always carry a weapon definition.
  if(kind==='npc')s.damageShip(actor,5,'attacker',undefined,undefined,undefined,true);
  else s.damagePlayer(5,'blast damage',false);
  assert.equal(regenerateCombatResources(actor,stats,1,0).shieldRestored,5,'blast/legacy hits share the same policy');
 }
});

test('collisions do not start or extend combat recovery and capitals cannot be reduced twice',()=>{
 for(const kind of ['npc','player']){
  const {actor,hit}=victim(kind);hit(5,{},'collision');
  assert.equal(combatShieldRechargeScale(actor,0),1);
  registerCombatShieldHit(actor);combatShieldRechargeScale(actor,11);hit(5,{},'collision');
  combatShieldRechargeScale(actor,1);
  assert.equal(combatShieldRechargeScale(actor,0),1,'collision did not refresh the combat timer');
 }
 const capital={capitalClass:'frigate'};registerCombatShieldHit(capital);
 assert.equal(combatShieldRechargeScale(capital,1),1,'passive capital scale is applied only once');
});
