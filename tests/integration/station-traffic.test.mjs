import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveStationDock, updateStationDock, stationBerth } from '../../src/game/stationTraffic.js';
import { STATION_DOCKS } from '../../src/game/stationDocks.js';
import { SHIP_LIVERIES, paintShipMaterial } from '../../src/game/shipLivery.js';
for(const id of Object.keys(STATION_DOCKS))test(`${id}: continuous arrival, rest and departure`,()=>{
 const berth=stationBerth(id,0,2),ship={hull:100,position:berth.gate.map((n,i)=>n+(i===2?20:0)),velocity:[0,0,0],rotation:[0,0,0,1]},session={ships:[ship],save:{world:{time:0}},npcHullExtents:()=>[3,2,5]};
 assert.ok(reserveStationDock(session,ship,id));const phases=new Set();let maxStep=0;
 for(let n=0;n<30000&&ship.stationDock;n++){const prev=[...ship.position];session.save.world.time+=1/60;phases.add(ship.stationDock.phase);updateStationDock(session,ship,1/60);maxStep=Math.max(maxStep,Math.hypot(...ship.position.map((v,i)=>v-prev[i])));assert.ok(ship.position.every(Number.isFinite));if(ship.stationDock?.phase==='docked'){assert.deepEqual(ship.position,berth.pad);assert.deepEqual(ship.velocity,[0,0,0]);}}
 assert.equal(ship.stationDockCompleted,id);assert.ok(maxStep<1);for(const phase of ['inbound','landing','docked','launch','outbound'])assert.ok(phases.has(phase));
});
test('berths are exclusive and release after destruction',()=>{
 for(const [id,dock]of Object.entries(STATION_DOCKS)){
  const s={ships:[],save:{world:{time:0}},npcHullExtents:()=>[2,2,3]};
  s.ships=Array.from({length:dock.lanes.length+1},()=>({hull:100,position:[0,0,0],rotation:[0,0,0,1],velocity:[0,0,0]}));
  for(let i=0;i<dock.lanes.length;i++){assert.ok(reserveStationDock(s,s.ships[i],id));assert.equal(s.ships[i].stationDock.lane,i);s.ships[i].stationDock.phase='docked';}
  const waiting=s.ships.at(-1);assert.equal(reserveStationDock(s,waiting,id),false);
  s.ships[0].hull=0;assert.ok(reserveStationDock(s,waiting,id));assert.equal(waiting.stationDock.lane,0);
 }
});
test('original paint bypasses recoloring',()=>{assert.ok(SHIP_LIVERIES.original);assert.equal(paintShipMaterial({},'original'),false);});

test('Rook serializes its narrow door while keeping both internal berths usable',()=>{
 const ships=Array.from({length:2},()=>({hull:100,position:stationBerth('rook').gate.slice(),velocity:[0,0,0],rotation:[0,0,0,1]}));
 const s={ships,save:{world:{time:0}},npcHullExtents:()=>[3,2,5]};
 assert.ok(reserveStationDock(s,ships[0],'rook'));
 assert.equal(reserveStationDock(s,ships[1],'rook'),false,'second arrival waits outside');
 ships[0].stationDock.phase='docked';ships[0].stationDock.until=Infinity;
 assert.ok(reserveStationDock(s,ships[1],'rook'));
 assert.equal(ships[1].stationDock.lane,1);
 assert.equal(ships[0].stationDock.gate[0],ships[1].stationDock.gate[0],'same door centreline');
 assert.notEqual(ships[0].stationDock.pad[0],ships[1].stationDock.pad[0],'separate interior berths');
 ships[0].stationDock.until=0;updateStationDock(s,ships[0],1/60);
 assert.equal(ships[0].stationDock.phase,'docked','departure waits for incoming traffic');
 ships[1].stationDock.phase='docked';ships[1].stationDock.until=0;
 updateStationDock(s,ships[0],1/60);updateStationDock(s,ships[1],1/60);
 assert.equal(ships[0].stationDock.phase,'launch');assert.equal(ships[1].stationDock.phase,'docked','one departure at a time');
});
