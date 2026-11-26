// Fuel is gone (0.8.2px): the afterburner draws energy. An empty capacitor
// keeps the burn's turn boost, so a missile break always works, but drops
// the extra speed. A race drive meters its own charge and costs nothing.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s==='three'?new URL('../../vendor/three.module.min.js',import.meta.url).href:s,c);}});
const {SHIPS}=await import('../../src/game/data.js');
const {getEffectiveShipStats,BURN_SECONDS}=await import('../../src/game/shipStats.js');
const {regenerateCombatResources}=await import('../../src/game/combatResources.js');
import {flight} from '../helpers/hyperdrive-flight.mjs';
import {missileCells} from '../helpers/missile-flight.mjs';

const burn={pitch:0,yaw:0,roll:0,throttleDelta:0,afterburner:true};
function cruise(s){const p=s.save.player,stats=s.playerStats();p.throttle=1;p.velocity=[0,0,-stats.maxSpeed];p.rotation=[0,0,0,1];return stats;}

test('every hull burns for about fifteen seconds on a full capacitor alone',()=>{
 for(const [id,hull] of Object.entries(SHIPS)){
  const stats=getEffectiveShipStats({shipId:id,equipment:[]});
  assert.equal(stats.fuel,undefined,`${id} has no fuel stat`);
  const seconds=stats.energyCapacity/(stats.burnEnergy-stats.reactorOutput);
  assert.ok(Math.abs(seconds-BURN_SECONDS)<1e-9,`${id}: ${seconds}`);
  assert.ok(stats.burnEnergy>hull.reactorOutput);
 }
});
test('the pilot burn draws energy, and recharge cannot keep up',()=>{
 const s=flight(),p=s.save.player,stats=cruise(s);p.energy=stats.energyCapacity;
 for(let i=0;i<60;i++){s.save.world.time+=1/60;s.updatePlayer(1/60,burn);}
 assert.ok(Math.abs(p.energy-(stats.energyCapacity-stats.burnEnergy))<1e-6,`${p.energy}`);
 p.energy=stats.energyCapacity;
 for(let i=0;i<60*30;i++){s.save.world.time+=1/60;regenerateCombatResources(p,stats,1/60,1);s.updatePlayer(1/60,burn);}
 assert.equal(p.energy,0,'thirty seconds of burn empty the capacitor');
});
test('an empty capacitor keeps the turn boost but not the speed',()=>{
 const s=flight(),p=s.save.player,stats=cruise(s);p.energy=0;
 for(let i=0;i<300;i++){s.save.world.time+=1/60;s.updatePlayer(1/60,burn);}
 assert.equal(s.afterburning,true,'the burn still doubles turn authority');
 assert.ok(Math.hypot(...p.velocity)<=stats.maxSpeed+.5,`${Math.hypot(...p.velocity)}`);
 p.energy=stats.energyCapacity;
 for(let i=0;i<300;i++){s.save.world.time+=1/60;s.updatePlayer(1/60,burn);}
 assert.ok(Math.hypot(...p.velocity)>stats.maxSpeed*1.1,`with charge the burn adds speed: ${Math.hypot(...p.velocity)} of ${stats.maxSpeed}`);
});
test('a turn-only break still beats seekers and swarms in the middle of the window',()=>{
 const miss=cells=>cells.every(cell=>cell.hits===0);
 for(const rack of ['seeker','swarm'])for(const lead of [.75,1,1.25])
  assert.ok(miss(missileCells(rack,{lead,unpowered:true})),`${rack} at ${lead}s`);
});
test('Comet Tail cuts the burn cost by 30%',async()=>{
 const {NAMED_EQUIPMENT}=await import('../../src/game/equipmentCatalog.js');
 assert.equal(NAMED_EQUIPMENT['engine-mk2'].effects.burnEnergyMultiplier,.7);
 assert.match(NAMED_EQUIPMENT['engine-mk2'].trait,/energy/);
});
