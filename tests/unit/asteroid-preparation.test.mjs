import test from 'node:test';
import assert from 'node:assert/strict';

test('asteroid preparation yields to the event loop and shares the completed terrain',async()=>{
 const terrain=await import('../../src/game/asteroidTerrain.js?async-preparation');let ticks=0;
 const timer=setInterval(()=>ticks++,0);
 try{
  const [a,b]=await Promise.all([terrain.prepareAsteroidTerrain(),terrain.prepareAsteroidTerrain()]);
  assert.ok(ticks>2,'loading must yield so the interface can paint');
  assert.strictEqual(a,b);assert.strictEqual(terrain.getAsteroidTerrain(),a);
  assert.equal(a.fragments.length,10);assert.equal(a.triangles,134540);assert.equal(a.obstacles.length,2246);
 }finally{clearInterval(timer);}
});

test('a synchronous request during preparation retains one shared final terrain',async()=>{
 const terrain=await import('../../src/game/asteroidTerrain.js?async-race');
 const pending=terrain.prepareAsteroidTerrain(),immediate=terrain.getAsteroidTerrain();
 assert.strictEqual(await pending,immediate);assert.strictEqual(terrain.getAsteroidTerrain(),immediate);
});
