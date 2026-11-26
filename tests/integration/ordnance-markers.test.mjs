import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '../../vendor/three.module.min.js';
import {LAUNCHERS} from '../../src/game/weapons.js';
import {OrdnanceMarkers} from '../../src/game/ordnanceMarkers.js';
import {session} from '../helpers/session.mjs';

// A torpedo 60 units ahead, closing on the player, and a gun round fired at it.
function torpedoDuel(ally=false){
 const s=session();s.lineBlocked=()=>false;s.getAvoidanceVector=()=>new Vector3();
 const owner=s.spawnShip('pirate',[0,0,-900]);
 if(ally){owner.hostile=false;owner.arenaRunWingman=true;s.arena={run:true};}
 const launcher=LAUNCHERS.torpedo,slot=s.projStore.alloc();
 s.projStore.setPos(slot,0,0,-60);s.projStore.setVel(slot,0,0,launcher.speed);
 const torpedo={id:'t',slot,kind:'missile',launcherId:'torpedo',ownerId:owner.id,targetId:'none',hitWeapon:launcher,damage:launcher.damage,life:launcher.life,shield:launcher.projectileShield};
 s.projectiles.push(torpedo);
 const fire=()=>{const shot=s.projStore.alloc();s.projStore.setPos(shot,0,0,-2);s.projStore.setVel(shot,0,0,-500);
  s.projectiles.push({id:'g'+shot,slot:shot,kind:'laser',ownerId:'player',damage:20,life:1});};
 return {s,torpedo,fire};
}
const run=(s,steps=20)=>{for(let i=0;i<steps;i++){s.save.world.time+=1/60;s.updateProjectiles(1/60);}};

test('torpedoes fly slower than the fighters they hunt, and the pilot can shoot one down',()=>{
 assert.equal(LAUNCHERS.torpedo.speed,90);
 const {s,torpedo,fire}=torpedoDuel();
 fire();run(s);
 assert.ok(torpedo.life>0&&torpedo.shield<LAUNCHERS.torpedo.projectileShield,'the first round strips its casing shield');
 fire();run(s);
 assert.ok(torpedo.life<=0,'the second round destroys it');
});

test('the pilot cannot shoot down an ally’s torpedo by accident',()=>{
 const {s,torpedo,fire}=torpedoDuel(true);
 fire();run(s,10);fire();run(s,10);
 assert.equal(torpedo.shield,LAUNCHERS.torpedo.projectileShield);
 assert.ok(torpedo.life>0);
});

// A fake projection: x/y straight from world x/y, everything in front visible.
function markerSession(){
 const s=session();s.lineBlocked=()=>false;
 s.renderer.camera={position:new Vector3()};
 s.renderer.projectToScreen=(v,out={})=>{const p=v.isVector3?v:new Vector3(...v);out.x=400+p.x;out.y=300-p.y;out.behind=p.z>0;out.visible=!out.behind;return out;};
 s.renderer.viewportWidth=800;s.renderer.viewportHeight=600;
 s.ui.cockpitPointVisible=()=>true;
 return s;
}
const shot=(s,pos,vel,extra)=>{const slot=s.projStore.alloc();s.projStore.setPos(slot,...pos);s.projStore.setVel(slot,...vel);const p={id:'m'+slot,slot,kind:'missile',life:3,...extra};s.projectiles.push(p);return p;};

test('hostile torpedoes get a diamond and a gun lead; inbound rounds a ring or an edge chevron',()=>{
 const s=markerSession(),markers=new OrdnanceMarkers();
 s.ships.push({id:'raider',hostile:true,hull:100,faction:'pirates'});
 shot(s,[20,10,-300],[0,0,90],{launcherId:'torpedo',ownerId:'raider',targetId:'npc'});
 shot(s,[-30,0,-200],[0,0,200],{launcherId:'seeker',ownerId:'raider',targetId:'player'});
 shot(s,[0,0,200],[0,0,-200],{launcherId:'seeker',ownerId:'raider',targetId:'player'});
 shot(s,[0,0,-200],[0,0,200],{launcherId:'seeker',ownerId:'raider',targetId:'player',lostTrack:true});
 shot(s,[0,0,-200],[0,0,200],{launcherId:'seeker',ownerId:'player',targetId:'raider'});
 const gun={speed:500,life:1.6};
 const count=markers.update(s,()=>gun);
 assert.equal(count,3,'a lost or outgoing round gets no marker');
 const [torpedo,ahead,behind]=markers.entries;
 assert.equal(torpedo.kind,'torpedo');assert.equal(torpedo.inbound,false);assert.equal(torpedo.lead,true);
 assert.ok(Math.abs(torpedo.leadX-torpedo.x)<1e-9&&torpedo.leadY<torpedo.y+1e-9,'the lead sits on the closing line');
 assert.equal(ahead.kind,'missile');assert.equal(ahead.edge,false);assert.equal(ahead.inbound,true);
 assert.equal(behind.edge,true,'a round from behind points from the screen edge');
});

test('an ally’s torpedo and a torpedo beyond 2 km stay unmarked',()=>{
 const s=markerSession(),markers=new OrdnanceMarkers();
 s.ships.push({id:'wing',arenaRunWingman:true,hull:100,faction:'concord'},{id:'raider',hostile:true,hull:100,faction:'pirates'});
 s.arena={run:true};
 shot(s,[0,0,-300],[0,0,90],{launcherId:'torpedo',ownerId:'wing',targetId:'npc'});
 shot(s,[0,0,-2100],[0,0,90],{launcherId:'torpedo',ownerId:'raider',targetId:'npc'});
 assert.equal(markers.update(s,()=>undefined),0);
});
