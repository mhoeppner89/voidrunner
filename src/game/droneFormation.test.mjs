import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GameSession } from './game.js';
import { createNewSave } from './save.js';
import { createDroneFleet, createDroneUnit, droneBayLayoutFor } from './droneData.js';
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);
function fixture(shipId,count) {
 const rt=Object.create(GameSession.prototype), save=createNewSave(42), p=save.player;
 p.shipId=shipId;p.position=[100,200,300];p.velocity=[0,0,0];p.rotation=[0,0,0,1];p.angularVelocity=[0,0,0];p.dockedAt=null;
 p.droneFleet=createDroneFleet();
 p.outfitting.loadouts[shipId]={droneBays:droneBayLayoutFor(shipId).map((b,i)=>{
  const id=`pdc-${i}`; if(i<count)p.droneFleet.unitsById[id]=createDroneUnit(id,'pdc');
  return {...b,mode:'pdc',unitIds:[i<count?id:null]};
 })};
 rt.save=save;rt.projectiles=[];save.world.time=0;return rt;
}
const single=fixture('wayfarer',1), s=single.preparePdcDroneContext();
const anchor=s.escortAnchors['pdc-0'];
near(anchor.position[0],100);assert.ok(anchor.position[1]<185,'single drone opposite top turret');
const fixed=[...anchor.position];single.save.world.time=3;single.preparePdcDroneContext();assert.deepEqual(anchor.position,fixed);
for(const count of [2,3]) {
 const rt=fixture('prospector',count), p=rt.save.player;
 const snapshot=()=>{const c=rt.preparePdcDroneContext();return c.unitIds.map(id=>({p:c.escortAnchors[id].position.map((v,i)=>v-p.position[i]),v:[...c.escortAnchors[id].velocity]}));};
 const initial=snapshot(), radius=Math.hypot(...initial[0].p);
 for(let axis=0;axis<3;axis++)near(initial.reduce((sum,a)=>sum+a.p[axis],0),0);
 for(const a of initial){near(a.p[2],0);near(Math.hypot(...a.p),radius);near(a.p[0]*a.v[0]+a.p[1]*a.v[1],0);}
 rt.save.world.time=3;const quarter=snapshot();near(quarter[0].p[0],0);near(quarter[0].p[1],radius);
 const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
 p.rotation=rotation.toArray();const turned=snapshot();near(turned[0].p[1],0);near(turned[0].p[2],radius);
 p.rotation=[0,0,0,1];rt.save.world.time=0;
 for(let i=0;i<720;i++){rt.save.world.time+=1/60;const c=rt.preparePdcDroneContext(1/60);rt.pdcDroneController.update(p.droneFleet,1/60,c,[]);}
 const c=rt.preparePdcDroneContext();
 for(const id of c.unitIds){const u=p.droneFleet.unitsById[id];assert.equal(u.state,'escorting');assert.ok(Math.hypot(...u.position.map((v,i)=>v-c.escortAnchors[id].position[i]))<1,'drone follows orbit');}
 p.droneFleet.pdcPolicy='stow';
 for(let i=0;i<600;i++){rt.save.world.time+=1/60;const c=rt.preparePdcDroneContext(1/60);rt.pdcDroneController.update(p.droneFleet,1/60,c,[]);}
 assert.ok(Object.values(p.droneFleet.unitsById).every(u=>u.state==='stowed'),'orbiting drones return to bays');
}
console.log('PDC formation: single opposite turret; 2/3 evenly spaced; quarter orbit; ship rotation; physical tracking and recall passed.');
