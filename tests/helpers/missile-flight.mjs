// Fixed-step trials use the game flight integrators, guidance and hull colliders.
import {pathToFileURL} from 'node:url';
import {Vector3,Quaternion} from '../../vendor/three.module.min.js';
import {integrateFlightTurn,integrateFlightVelocity} from '../../src/game/flightDynamics.js';
import {MISSILE_PADDING,guideMissile} from '../../src/game/weaponFlight.js';
import {LAUNCHERS} from '../../src/game/weapons.js';
import {segmentShipColliderHit} from '../../src/game/shipCollision.js';
import {npcShipScaleForVariant} from '../../src/game/render.js';
import {SHIPS} from '../../src/game/data.js';
import {session} from './session.mjs';

const dt=1/60,up=new Vector3(0,1,0),rollAxis=new Vector3(0,0,1);
export const steadyFlights = {
 'stationary broadside': {aspect:Math.PI/2, coast:[0,0,0]},
 'stationary oblique': {aspect:3*Math.PI/4, coast:[0,0,0]},
 'slow crossing 1': {aspect:Math.PI/2, coast:[-1,0,0]},
 'slow crossing 2': {aspect:Math.PI/2, coast:[-2,0,0]},
 'sideways drift': {aspect:Math.PI/2, coast:[0,0,40]},
 'rolling drift': {aspect:Math.PI/2, coast:[0,0,40], rollInput:1},
 'reverse axial': {aspect:Math.PI, coast:[0,0,-40]},
 'reverse broadside': {aspect:Math.PI/2, coast:[40,0,0]},
 'constant roll': {aspect:Math.PI, rollInput:1},
 'nose on': {aspect:Math.PI},
};
export function npcFixture(hullId='speedster'){
 const game=session();
 const ship=game.spawnShip('pirate',[0,0,-500],undefined,'Trial',{tier:'veteran',temperament:'steady'},{hullId,faction:'pirates'});
 return {game,ship,hullId};
}
export function missileTrial(id,range,lead,lane,roll,padding,aspect=Math.PI,options={}){
 // unpowered: the afterburner's turn boost without its speed (an empty capacitor).
 const {npc,circle,coast,rollInput=0,phase=0,bearing=0,rack=LAUNCHERS[id],unpowered}=options;
 const hull=SHIPS[npc?.hullId??options.hullId??'speedster'],stats=npc?npc.game.npcFlightStats(npc.ship):hull;
 const scale=npc?npcShipScaleForVariant(npc.ship.variant):1;
 const origin=new Vector3(range*Math.sin(bearing),0,-range*Math.cos(bearing));
 const target=origin.clone(),attitude=new Quaternion().setFromAxisAngle(up,aspect);
 attitude.multiply(new Quaternion().setFromAxisAngle(rollAxis,roll));
 // Hold the escape plane fixed in space to test a rolled hull crossing
 // the same incoming line. The default retains the original local-yaw trial.
 const breakAxis=options.fixedBreakPlane?new Vector3(Math.sin(roll),Math.cos(roll),0):up;
 const velocity=new Vector3(0,0,-stats.maxSpeed).applyQuaternion(attitude),spin=new Vector3(),forward=new Vector3();
 if(coast)velocity.fromArray(coast);
 const goal=new Quaternion(),turn=new Quaternion(),offset=new Vector3(),coords=[],orientation=[];
 const position=new Vector3(),end=new Vector3(),angle=2*Math.PI*(lane+.5)/rack.volley;
 const shot=new Vector3(rack.spreadRad*Math.cos(angle),rack.spreadRad*Math.sin(angle),-1).normalize().multiplyScalar(rack.speed);
 const missile={...rack,hitWeapon:rack},start=circle?-phase:lead>0?range/(rack.speed+velocity.z)-lead:Infinity;
 if(npc){npc.ship.flightAngularVelocity=spin;npc.ship.energy=npc.ship.combatFit?.stats?.energyCapacity??100;}
 for(let tick=Math.min(0,Math.floor(start/dt));tick<rack.life*60;tick++){
  const age=tick*dt-start,active=age>=0&&(circle||age<1);
  const yaw=active?(circle||age<.5?1:-1):0,burn=active&&circle!=='unboosted';
  // Drift and axial roll use explicit controls on either hull. The NPC pilot
  // normally steers toward a goal attitude and cannot command an unassisted drift.
  if(npc && !coast && !rollInput){
   goal.copy(attitude).multiply(turn.setFromAxisAngle(breakAxis,.98*Math.PI*yaw));
   npc.game.integrateNpcFlight(npc.ship,target,velocity,attitude,goal,burn?stats.afterburnSpeed:stats.maxSpeed,burn,true,dt);
   if(tick<0)target.copy(origin);
  }else{
   integrateFlightTurn(attitude,spin,breakAxis.x*yaw,breakAxis.y*yaw,rollInput,stats.angularAcceleration,stats.angularDamping,!coast,burn,dt);
   forward.set(0,0,-1).applyQuaternion(attitude);
   const ceiling=burn&&!unpowered&&velocity.length()>=.9*stats.maxSpeed?stats.afterburnSpeed:stats.maxSpeed;
   integrateFlightVelocity(velocity,forward,coast?0:ceiling,ceiling,stats.acceleration,!coast,burn,coast?0:1,dt);
   if(tick>=0)target.addScaledVector(velocity,dt);
  }
  if(tick<0)continue;
  missile.lostTrack=!guideMissile(shot,offset.copy(target).sub(position),missile,dt,velocity,attitude.toArray(orientation));
  end.copy(position).addScaledVector(shot,dt);
  if(segmentShipColliderHit(position,end,target.toArray(coords),orientation,hull.variant,scale,padding)!==undefined)return true;
  position.copy(end);
 }
 return false;
}
export function missileCells(id,{npc,hullId,lead=0,circle,aspect=Math.PI,coast,rollInput,fixedBreakPlane=false,rack=LAUNCHERS[id],padding=MISSILE_PADDING,unpowered=false}={}){
 const phases=circle?[.5,1,1.5,2,2.5,3,3.5,4]:[0];
 return [400,500,600].map(range=>{
  let hits=0,total=0;
  const byRoll=Array(8).fill(0),lanesByRoll=byRoll.map(()=>Array(rack.volley).fill(0));
  for(const phase of phases)for(let lane=0;lane<rack.volley;lane++)for(let roll=0;roll<8;roll++){
   const hit=Number(missileTrial(id,range,lead,lane,roll*Math.PI/4,padding,aspect,{npc,hullId,coast,rollInput,circle,phase,rack,fixedBreakPlane,unpowered}));
   byRoll[roll]+=hit;lanesByRoll[roll][lane]+=hit;hits+=hit;total++;
  }
  return {range,hits,total,byRoll,lanesByRoll};
 });
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const rows=[];
 for(const npc of [undefined,npcFixture()])for(const id of ['seeker','swarm','torpedo'])
  for(const move of [0,...Array.from({length:12},(_,i)=>(i+1)/4),'unboosted','boosted',...Object.keys(steadyFlights)]){
   const options=typeof move==='number'?{lead:move}:steadyFlights[move]??{circle:move};
   for(const cell of missileCells(id,{npc,...options}))rows.push({actor:npc?'NPC':'player',id,move,...cell});
  }
 if(process.argv.includes('--json'))console.log(JSON.stringify(rows));
 else console.table(rows);
}
