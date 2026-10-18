import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {solidifyWreckSurfaces} from '../../tools/assets/wreck-solidify.mjs';

const vertex=p=>({p,n:[0,0,1],uv:p.slice(0,2),c:[1,1,1]});
const triangle=(a,b,c)=>({mat:0,v:[a,b,c].map(vertex)});
const square=[triangle([0,0,0],[1,0,0],[1,1,0]),triangle([0,0,0],[1,1,0],[0,1,0])];
const volume=ts=>Math.abs(ts.reduce((s,t)=>s+new T.Vector3(...t.v[0].p).dot(new T.Vector3(...t.v[1].p).cross(new T.Vector3(...t.v[2].p)))/6,0));
test('open decks get a closed backing without moving their painted face or UVs',()=>{
    const {triangles,stats}=solidifyWreckSurfaces(square,1);
    assert.equal(stats.backedTriangles,2);assert.equal(triangles.length,12);
    assert.ok(Math.abs(volume(triangles)-.006)<1e-9);
    assert.deepEqual(triangles[0],square[0]);assert.deepEqual(triangles[2],square[1]);
    assert.equal(triangles.filter(t=>t.mat===1).length,8);
});
test('existing closed volumes are retained and doubled zero-volume planes are thickened',()=>{
    const closed=solidifyWreckSurfaces(square,1).triangles;
    const again=solidifyWreckSurfaces(closed,1);
    assert.equal(again.stats.backedTriangles,0);assert.equal(again.triangles.length,closed.length);
    const doubled=[...square,...square.map(t=>({...t,v:[...t.v].reverse()}))];
    const repaired=solidifyWreckSurfaces(doubled,1);
    assert.equal(repaired.stats.backedTriangles,4);assert.ok(volume(repaired.triangles)>.005);
});
