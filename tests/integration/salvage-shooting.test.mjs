import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {wreckNodeCollisionMesh} from '../../src/game/worldData.js';
import {recoverWreckEntry,combatWreckNode} from '../../src/game/careerLoot.js';
import {hydrateSave} from '../../src/game/save.js';

function setup(step='earn-standing'){
 const f=tutorialFixture(step),s=f.session;f.save.player.dockedAt=undefined;s.activeInstanceId='mourning-line';s.arena=undefined;
 const node=s.wreckNodes.find(n=>n.zone==='frigate-alpha'&&!n.insideWreckId&&n.remaining>0);node.position=[0,0,-100];node.scanned=true;
 const mesh=wreckNodeCollisionMesh(node),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...node.rotation,'XYZ')),[hx,hy,hz]=mesh.halfExtents;
 const obstacle={id:node.id,shape:'wreck-node-mesh',x:0,y:0,z:-100,radius:mesh.radius,losRadius:mesh.radius,meshVerts:mesh.verts,meshIndices:mesh.indices,minReach:mesh.minReach,box:{hx,hy,hz,qx:q.x,qy:q.y,qz:q.z,qw:q.w}};
 s.forEachObstacleAlongSegment=(a,b,fn)=>fn(obstacle);s.activeDockObstacle=()=>undefined;s.renderer.showCombatBeam=()=>{};s.salvageAmbushTriggered=new Set();s.triggerSalvageAmbush=()=>{};
 f.save.player.position=[0,0,0];return {...f,node,obstacle};
}
function fireBeam(s){s.fireBeam('player',{kind:'beam',range:200,damageFlat:30},new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,-1),'test');}
test('wreckage must be selected and scanned in range before shots release its contents',()=>{
 const {session:s,save,node}=setup();node.scanned=false;save.player.position=[0,0,1000];s.selectTarget('wreck',node.id);s.scanCooldown=0;
 s.autoScanTarget();assert.equal(node.scanned,false);const before=node.remaining;fireBeam(s);assert.equal(node.remaining,before);assert.equal(Object.keys(save.world.combatWrecks??{}).length,0);
 save.player.position=[0,0,0];s.autoScanTarget();assert.equal(node.scanned,true);assert.ok(save.world.scannedNodes.includes(node.id));
 const restored=hydrateSave(JSON.parse(JSON.stringify(save)));assert.ok(restored.world.scannedNodes.includes(node.id));fireBeam(s);assert.ok(node.remaining<before);
});
test('actual beam hits release persistent cargo instead of filling the hold',()=>{
 const {session:s,save,node}=setup(),before=node.remaining,cargo={...save.player.cargo};fireBeam(s);
 assert.ok(node.remaining<before);assert.deepEqual(save.player.cargo,cargo);const drops=Object.values(save.world.combatWrecks);assert.equal(drops.length,1);
 assert.ok(['scrap',node.salvage].includes(drops[0].contents[0].commodity));assert.equal(drops[0].contents[0].sourceNodeId,node.id);
 const loaded=hydrateSave(JSON.parse(JSON.stringify(save)));assert.ok(loaded.world.combatWrecks[drops[0].id]);
 const commodity=drops[0].contents[0].commodity;save.player.position.splice(0,3,...drops[0].position);assert.equal(recoverWreckEntry(s,drops[0].id,drops[0].contents[0].id).ok,true);assert.equal(save.player.cargo[commodity],(cargo[commodity]??0)+1);
});
test('actual projectile impacts release cargo; misses and enemy weapons do not',()=>{
 const {session:s,save,node}=setup(),start=node.remaining;
 s.fireBeam('player',{kind:'beam',range:200,damageFlat:50},new THREE.Vector3(0,0,0),new THREE.Vector3(0,1,0),'miss');
 s.fireBeam('npc',{kind:'beam',range:200,damageFlat:50},new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,-1),'enemy');
 assert.equal(node.remaining,start);assert.equal(Object.keys(save.world.combatWrecks??{}).length,0);
 const slot=s.projStore.alloc();s.projStore.setPos(slot,0,0,0);s.projStore.setVel(slot,0,0,-200);
 s.projectiles.push({slot,kind:'laser',ownerId:'player',damage:30,life:1});s.updateProjectiles(1);
 assert.ok(node.remaining<start);assert.equal(Object.keys(save.world.combatWrecks).length,1);
});
test('flight recorder waits for cargo pickup and its drop survives reload',()=>{
 const {session:s,save,quest,node}=setup('salvage-black-box');quest.flags.blackBoxTargetId=node.id;fireBeam(s);
 assert.equal(quest.stepId,'salvage-black-box');const id=quest.flags.blackBoxDropId,drop=save.world.combatWrecks[id];assert.ok(drop);assert.equal(drop.contents[0].tutorialRecorder,true);
 const loaded=hydrateSave(JSON.parse(JSON.stringify(save))),restored=tutorialFixture('salvage-black-box',loaded);restored.save.player.dockedAt=undefined;restored.session.activeInstanceId='mourning-line';
 restored.session.wreckNodes.push(combatWreckNode(loaded.world.combatWrecks[id]));
 restored.session.ensureTutorialFieldTarget();assert.equal(restored.quest.flags.blackBoxDropId,id);
 restored.save.player.position.splice(0,3,...drop.position);assert.equal(recoverWreckEntry(restored.session,id,drop.contents[0].id).ok,true);
 assert.equal(restored.quest.stepId,'black-box-fight');assert.ok(restored.save.player.sealedCargo.some(c=>c.missionId==='tutorial-black-box'));
});
test('a salvage claim advances only when its own released cargo is collected',()=>{
 const {session:s,save,node}=setup();const mission={id:'salvage-claim',kind:'salvage',targetNodeId:node.id,commodity:node.salvage,quantity:1,salvaged:0,destination:'helix',salvagePickupAccounting:true};save.activeMissions.push(mission);
 fireBeam(s);const drop=Object.values(save.world.combatWrecks)[0],entry=drop.contents[0];assert.equal(entry.commodity,node.salvage);assert.equal(entry.sourceClaimId,mission.id);assert.equal(mission.salvaged,0);
 save.player.position.splice(0,3,...drop.position);save.player.cargo.ore=100000;
 assert.equal(recoverWreckEntry(s,drop.id,entry.id).ok,false);assert.equal(mission.salvaged,0);assert.ok(save.world.combatWrecks[drop.id]);
 save.player.cargo.ore=0;assert.equal(recoverWreckEntry(s,drop.id,entry.id).ok,true);assert.equal(mission.salvaged,1);
});
test('tractor upgrades increase damage to wreckage without filling the hold',()=>{
 const {session:s,save,node}=setup();s.playerStats=()=>({salvageRate:1.7});
 s.hitSalvageWreck(node.id,18,[0,0,-90],new THREE.Vector3(0,0,-1));
 assert.equal(Object.keys(save.world.combatWrecks).length,1);assert.equal(Object.values(save.world.combatWrecks)[0].contents[0].kind,'cargo');
});
test('ordinary wreckage yields both its commodity and scrap across deterministic drops',()=>{
 const {session:s,save,node}=setup();node.salvage='electronics';const results=new Set();
 for(let seed=1;seed<=40;seed++){save.world.seed=seed;node.remaining=1;s.hitSalvageWreck(node.id,30,[0,0,-90],new THREE.Vector3(0,0,-1));const drop=save.world.combatWrecks[`wreck-salvage-${save.world.lootShipCounter}`];results.add(drop.contents[0].commodity);}
 assert.deepEqual([...results].sort(),['electronics','scrap']);
});
