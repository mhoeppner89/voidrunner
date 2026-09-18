import assert from 'node:assert/strict';
import {orientDrone,DRONE_PORTS} from './droneFlight.js';
for(const velocity of [[1,0,0],[0,1,0],[0,0,1],[1,2,-3]]){
 const u={rotation:[0,0,0,1],position:[0,0,0],velocity};
 orientDrone(u,1/60,[0,0,0]);
 assert.ok(2*Math.acos(Math.min(1,u.rotation[3]))<=5/60+1e-8,'bounded turn');
 for(let i=0;i<120;i++)orientDrone(u,1/60,[0,0,0]);
 const [x,y,z,w]=u.rotation,front=[-2*(x*z+w*y),-2*(y*z-w*x),-1+2*(x*x+y*y)];
 assert.ok(front.reduce((a,v,i)=>a+v*velocity[i],0)/Math.hypot(...velocity)>.999,'nose follows travel');
 assert.ok(Math.abs(Math.hypot(...u.rotation)-1)<1e-8);
}
const stopped={rotation:[0,0,0,1],position:[0,0,0],velocity:[0,0,0]};orientDrone(stopped,1/60,[0,0,0]);assert.deepEqual(stopped.rotation,[0,0,0,1]);
assert.equal(DRONE_PORTS.wayfarer.length,1);assert.equal(DRONE_PORTS.prospector.length,3);
console.log('Drone flight: bounded turn, all axes, normalized orientation, idle stability, dedicated ports passed.');
