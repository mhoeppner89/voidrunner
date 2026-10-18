import {integrateFlightTurn,integrateFlightVelocity} from './flightDynamics.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Purpose-built race frames. These never enter the career equipment catalog.
export const RACE_HULLS=Object.freeze(Object.fromEntries([
 ['speedster','Speedster R','Agil',115,185,5,0.72,0x70e8ee,500],
 ['demon','Demon R','Sprint',115,185,5,1.1,0xffa16b,500],
 ['talon','Talon R','Präzision',115,185,5,0.9,0xb9b2ff,500],
 ['lancer','Lancer R','Durchsetzung',115,185,5,1.45,0xf1cc77,500],
].map(([id,name,style,acceleration,braking,angularAcceleration,mass,color,afterburnSpeed])=>[id,Object.freeze({
 id,name,style,acceleration,braking,angularAcceleration,mass,color,
 maxSpeed:145,afterburnSpeed,angularDamping:5.5,lateralMultiplier:1,hull:400,shield:400,
 energyCapacity:100,energyRegen:10,reactorOutput:10,shieldRegen:5,shieldRegeneration:5,shieldRechargeMultiplier:1,fuel:200,
})])));
export const raceHull=id=>RACE_HULLS[id]??RACE_HULLS.talon;
// Race frames use the same assisted turn and velocity solvers as an ordinary
// ship with afterburner engaged. Track pickups briefly damp sideways drift.
export const RACE_STABILIZER_DAMPING=4;
export function applyRaceStabilizer(v,nose,dt,active=true){
 if(!active)return;
 const forward=v.dot(nose),damping=Math.exp(-RACE_STABILIZER_DAMPING*dt);
 const lx=(v.x-nose.x*forward)*damping,ly=(v.y-nose.y*forward)*damping,lz=(v.z-nose.z*forward)*damping;
 v.set(nose.x*forward+lx,nose.y*forward+ly,nose.z*forward+lz);
}
export function integrateRaceTurn(q,w,pitch,yaw,roll,hull,_brake,dt,assisted=true){
 integrateFlightTurn(q,w,pitch,yaw,roll,hull.angularAcceleration,hull.angularDamping,assisted,true,dt);
}
export function integrateRaceVelocity(v,nose,hull,throttle,brake,_burning,dt,draft=0,stabilized=false,assisted=true){
 const limit=hull.afterburnSpeed*(1+draft*.14);
 // The race brake is a dedicated counterthrust control, so it still works
 // when the player turns Flight Assist off for freer coasting.
 if(brake>0&&!assisted){const speed=v.length();if(speed>0)v.multiplyScalar(Math.max(0,speed-hull.braking/1.25*clamp(brake,0,1)*dt)/speed);applyRaceStabilizer(v,nose,dt,stabilized);return;}
 // Thrust targets the afterburning race speed; coasting holds the current
 // forward speed while assisted flight gradually trims sideways drift.
 const target=brake>0?0:throttle>0?limit*clamp(throttle,0,1):Math.max(0,v.dot(nose));
 const acceleration=brake>0?hull.braking/1.25:hull.acceleration*(1+draft*.18);
 integrateFlightVelocity(v,nose,target,limit,acceleration,assisted,true,throttle,dt,hull.lateralMultiplier);
 applyRaceStabilizer(v,nose,dt,stabilized);
}
// NPC pilots track a requested speed directly. The player keeps the discrete
// counterthrust behavior above; treating any nonzero AI brake as a full stop
// caused repeated stop-start acceleration on every corner.
export function integrateRacePilotVelocity(v,nose,hull,targetSpeed,dt,draft=0,stabilized=false,recovering=false,speedScale=1){
 const limit=hull.afterburnSpeed*speedScale*(1+draft*.14),forward=v.dot(nose);
 const lateralX=v.x-nose.x*forward,lateralY=v.y-nose.y*forward,lateralZ=v.z-nose.z*forward;
 const desired=clamp(targetSpeed,0,limit);
 // Rival pilots keep afterburner engaged while racing. Keep their engine
 // acceleration independent of the stabilizer pickup; it only trims drift.
 const engine=hull.acceleration*1.65*(1+draft*.18);
 const counter=hull.braking/1.25;
 const change=desired-forward;
 const next=forward+clamp(change,-counter*dt,engine*dt);
 const damping=Math.exp(-(recovering?8:.62)*dt);
 v.set(nose.x*next+lateralX*damping,nose.y*next+lateralY*damping,nose.z*next+lateralZ*damping);
 applyRaceStabilizer(v,nose,dt,stabilized);
}
// Save-safe loaner: equipment/cargo stay in the player's own parked ship.
export function takeRaceHull(player,id){
 if(!player.raceReturn){
  const saved={};for(const key of ['shipId','hull','shield','energy','fuel','droneFleet','mode','weaponId'])saved[key]=player[key];
  for(const key of ['position','rotation'])saved[key]=[...player[key]];
  saved.velocity=[0,0,0];saved.angularVelocity=[0,0,0];saved.throttle=0;
  player.raceReturn=saved;
 }
 const hull=raceHull(id);player.shipId=hull.id;player.mode='combat';
 player.droneFleet={unitsById:{},bays:{}};
 for(const key of ['hull','shield','fuel'])player[key]=hull[key];player.energy=hull.energyCapacity;
 return hull;
}
export function returnRaceHull(player){
 if(!player.raceReturn)return false;
 Object.assign(player,player.raceReturn);delete player.raceReturn;return true;
}
