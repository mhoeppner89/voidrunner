import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveStationDock, updateStationDock, stationBerth } from '../src/game/stationTraffic.js';
import { STATION_DOCKS } from '../src/game/stationDocks.js';
import { SHIP_LIVERIES, paintShipMaterial } from '../src/game/shipLivery.js';
for(const id of Object.keys(STATION_DOCKS))test(`${id}: continuous arrival, rest and departure`,()=>{
 const berth=stationBerth(id,0,2),ship={hull:100,position:berth.gate.map((n,i)=>n+(i===2?20:0)),velocity:[0,0,0],rotation:[0,0,0,1]},session={ships:[ship],save:{world:{time:0}},npcHullExtents:()=>[3,2,5]};
 assert.ok(reserveStationDock(session,ship,id));const phases=new Set();let maxStep=0;
 for(let n=0;n<30000&&ship.stationDock;n++){const prev=[...ship.position];session.save.world.time+=1/60;phases.add(ship.stationDock.phase);updateStationDock(session,ship,1/60);maxStep=Math.max(maxStep,Math.hypot(...ship.position.map((v,i)=>v-prev[i])));assert.ok(ship.position.every(Number.isFinite));if(ship.stationDock?.phase==='docked'){assert.deepEqual(ship.position,berth.pad);assert.deepEqual(ship.velocity,[0,0,0]);}}
 assert.equal(ship.stationDockCompleted,id);assert.ok(maxStep<1);for(const phase of ['inbound','landing','docked','launch','outbound'])assert.ok(phases.has(phase));
});
test('berths are exclusive and release after destruction',()=>{const s={ships:[],save:{world:{time:0}},npcHullExtents:()=>[2,2,3]},a={hull:100,position:[0,0,0],rotation:[0,0,0,1],velocity:[0,0,0]},b={...a,position:[0,0,0]};s.ships=[a,b];assert.ok(reserveStationDock(s,a,'haven'));assert.equal(reserveStationDock(s,b,'haven'),false);a.hull=0;assert.ok(reserveStationDock(s,b,'haven'));});
test('original paint bypasses recoloring',()=>{assert.ok(SHIP_LIVERIES.original);assert.equal(paintShipMaterial({},'original'),false);});
