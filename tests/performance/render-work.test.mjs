import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
    return next(specifier === 'three' ? new URL('../../vendor/three.module.min.js', import.meta.url).href : specifier, context);
} });
const THREE = await import('three');
const { skipHiddenWorldMatrices, markAttributeSpan } = await import('../../src/game/renderWork.js');
const { CanvasSizeCache } = await import('../../src/game/canvasSizeCache.js');
const { SpaceRenderer } = await import('../../src/game/render.js');

function tree() {
    const scene = new THREE.Scene(), parent = new THREE.Group(), branch = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    scene.add(parent); parent.add(branch); branch.add(leaf);
    leaf.position.set(1, 2, 3); leaf.updateMatrix(); leaf.matrixAutoUpdate = false;
    return { scene, parent, branch, leaf };
}
test('hidden roots do no descendant matrix work; waking matches Three exactly', () => {
    const normal = tree(), guarded = tree();
    let visits = 0;
    const original = guarded.leaf.updateMatrixWorld;
    guarded.leaf.updateMatrixWorld = function(force) { visits++; original.call(this, force); };
    skipHiddenWorldMatrices(guarded.branch);
    const fn = guarded.branch.updateMatrixWorld;
    skipHiddenWorldMatrices(guarded.branch);
    assert.equal(guarded.branch.updateMatrixWorld, fn, 'installation is idempotent');
    for (let frame = 0; frame < 120; frame++) {
        for (const t of [normal, guarded]) {
            t.branch.visible = frame % 20 === 0;
            t.parent.position.set(frame, frame / 2, -frame);
            t.parent.rotation.y = frame * .01;
            t.branch.rotation.z = frame * .02;
            t.scene.updateMatrixWorld(true);
        }
        if (guarded.branch.visible)
            assert.deepEqual(guarded.leaf.matrixWorld.elements, normal.leaf.matrixWorld.elements);
    }
    assert.equal(visits, 6, 'only six visible frames update the leaf, not all 120');
    // Reparent while asleep, then reactivate with frozen locals and no force.
    for (const t of [normal, guarded]) {
        const nextParent = new THREE.Group();
        nextParent.position.set(-30, 4, 9); nextParent.rotation.x = .7;
        t.scene.add(nextParent); nextParent.add(t.branch);
        t.parent.matrixAutoUpdate = false;
        t.branch.updateMatrix(); t.branch.matrixAutoUpdate = false;
        t.leaf.position.set(8, 9, 10); t.leaf.updateMatrix();
        t.branch.visible = true;
        t.scene.updateMatrixWorld(false);
    }
    assert.deepEqual(guarded.leaf.matrixWorld.elements, normal.leaf.matrixWorld.elements);
});
test('explicit queries on a hidden root still update world coordinates', () => {
    const t = tree(); skipHiddenWorldMatrices(t.branch); t.branch.visible = false;
    t.parent.position.x = 50; t.branch.position.y = 12;
    assert.deepEqual(t.leaf.getWorldPosition(new THREE.Vector3()).toArray(), [51, 14, 3]);
});
test('guard preserves custom matrix update methods when visible', () => {
    const root = new THREE.Group(); let calls = 0;
    root.updateMatrixWorld = function(force) { calls++; assert.equal(force, true); };
    skipHiddenWorldMatrices(root);
    root.visible = false; root.updateMatrixWorld(true); assert.equal(calls, 0);
    root.visible = true; root.updateMatrixWorld(true); assert.equal(calls, 1);
});
test('upload span merges pending writes and preserves clean attribute versions', () => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(16 * 100), 16);
    a.addUpdateRange(0, 16); a.addUpdateRange(90 * 16, 16);
    const data = a.array.slice();
    markAttributeSpan(a, 20 * 16, 50 * 16);
    assert.deepEqual(a.updateRanges, [{ start: 0, count: 91 * 16 }]);
    assert.deepEqual(a.array, data, 'only transfer bookkeeping changes');
    const version = a.version;
    markAttributeSpan(a, Infinity, 0);
    assert.equal(a.version, version);
    a.clearUpdateRanges(); // emulate successful WebGL upload
    markAttributeSpan(a, 10 * 16, 11 * 16);
    assert.deepEqual(a.updateRanges, [{ start: 160, count: 16 }]);
});
test('interleaved moving debris queues one upload and keeps static matrices unchanged', () => {
    const r = Object.create(SpaceRenderer.prototype);
    r.camera = new THREE.PerspectiveCamera(); r.viewSphere = new THREE.Sphere();
    r.tmpPosition = new THREE.Vector3(); r.tmpScale = new THREE.Vector3();
    r.tmpEuler = new THREE.Euler(); r.tmpQuaternion = new THREE.Quaternion(); r.tmpMatrix = new THREE.Matrix4();
    const pieces = Array.from({ length: 100 }, (_, i) => ({ position: [i, 0, -100], rotation: [0, 0, 0], scale: [1, 1, 1], moving: i % 2 === 1 }));
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), pieces.length);
    r.graveyardBatches = [{ mesh, pieces, renderedPieces: [], originRadius: 2 }];
    r.updateGraveyardInstances(); mesh.instanceMatrix.clearUpdateRanges();
    const before = mesh.instanceMatrix.array.slice();
    for (const piece of pieces) if (piece.moving) piece.position[1] = 1;
    r.updateGraveyardInstances();
    assert.equal(mesh.count, 100);
    assert.deepEqual(mesh.instanceMatrix.updateRanges, [{ start: 16, count: 99 * 16 }]);
    for (let i = 0; i < pieces.length; i++) {
        if (i % 2 === 0) assert.deepEqual(mesh.instanceMatrix.array.slice(i * 16, (i + 1) * 16), before.slice(i * 16, (i + 1) * 16));
        else assert.equal(mesh.instanceMatrix.array[i * 16 + 13], 1);
    }
});
test('HUD sizing reads layout once, then handles resize, hidden state, and disconnect', () => {
    let callback, observed, disconnected = false, reads = 0;
    const canvas = { get clientWidth() { reads++; return 150; }, get clientHeight() { reads++; return 110; } };
    class Observer {
        constructor(cb) { callback = cb; }
        observe(c) { observed = c; }
        disconnect() { disconnected = true; }
    }
    const cache = new CanvasSizeCache(Observer);
    for (let i = 0; i < 300; i++) assert.deepEqual(cache.get(canvas), { width: 150, height: 110 });
    assert.equal(observed, canvas); assert.equal(reads, 2);
    callback([{ target: canvas, contentRect: { width: 211.6, height: 98.2 } }]);
    assert.deepEqual(cache.get(canvas), { width: 212, height: 98 }); assert.equal(reads, 2);
    callback([{ target: canvas, contentRect: { width: 0, height: 0 } }]);
    assert.deepEqual(cache.get(canvas), { width: 0, height: 0 });
    cache.disconnect(); assert.equal(disconnected, true);
    cache.get(canvas); assert.equal(reads, 4);
});
test('HUD sizing keeps the live-layout fallback on browsers without ResizeObserver', () => {
    const canvas = { clientWidth: 100, clientHeight: 80 }, cache = new CanvasSizeCache(null);
    assert.equal(cache.get(canvas).width, 100);
    canvas.clientWidth = 200; assert.equal(cache.get(canvas).width, 200);
});


test('all races show only the next five rings, with distinct next/following colors, and reuse their pool',()=>{
    const r=Object.create(SpaceRenderer.prototype);
    r.scene=new THREE.Scene();r.raceGateMeshes=[];r.raceShortcutMeshes=[];
    r.radialTexture=()=>null;
    const gates=Array.from({length:80},(_,i)=>({position:[i*100,0,0],direction:[1,0,0],radius:40,kind:i===79?'finish':'mandatory'}));
    r.syncRaceGates(gates,10);
    assert.deepEqual(r.raceGateMeshes.flatMap((g,i)=>g.visible?[i]:[]),[10,11,12,13,14]);
    assert.equal(r.raceGateMeshes[10].children[0].material.color.getHex(),0x3dff6e);
    assert.equal(r.raceGateMeshes[11].children[0].material.color.getHex(),0xffd24a);
    assert.ok([12,13,14].every(i=>r.raceGateMeshes[i].children[0].material.color.getHex()===0x9aa6b0));
    const pool=[...r.raceGateMeshes];r.syncRaceGates(gates,40);
    assert.equal(r.raceGateMeshes.length,80);
    assert.ok(r.raceGateMeshes.every((g,i)=>g===pool[i]),'gate changes reuse existing meshes');
    assert.equal(r.raceGateMeshes.filter(g=>g.visible).length,5);
    r.syncRaceGates(gates,78);
    assert.deepEqual(r.raceGateMeshes.flatMap((g,i)=>g.visible?[i]:[]),[78,79]);
    assert.equal(r.raceGateMeshes[79].children[0].material.color.getHex(),0xffd24a,'finish still follows the upcoming color');
    r.syncRaceGates(gates,79);
    assert.equal(r.raceGateMeshes[79].children[0].material.color.getHex(),0x3dff6e,'finish becomes green when next');
    r.syncRaceGates(gates,80);
    assert.equal(r.raceGateMeshes.filter(g=>g.visible).length,0);
    r.syncRaceGates(gates.slice(0,16),0);
    assert.equal(r.raceGateMeshes.filter(g=>g.visible).length,5,'small legacy courses follow the same five-ring rule');
});

test('race boost markers and peripheral streaks reuse bounded pools and clear after racing',()=>{
 const r=Object.create(SpaceRenderer.prototype);r.scene=new THREE.Scene();r.camera=new THREE.PerspectiveCamera(80,1.6);r.scene.add(r.camera);r.skyTime=10;
 const pickups=Array.from({length:3},(_,i)=>({index:i,position:[i*300,0,0],pathDistance:i*300+100,direction:[0,0,1]}));
 r.syncRaceBoosts(pickups,new Set());assert.equal(r.raceBoostMeshes.filter(m=>m.visible).length,3);const refs=[...r.raceBoostMeshes];
 r.syncRaceBoosts(pickups,new Set([1]));assert.equal(r.raceBoostMeshes[1].visible,false);
 r.syncRaceBoosts([]);assert.ok(r.raceBoostMeshes.every(m=>!m.visible));r.syncRaceBoosts(pickups);assert.ok(r.raceBoostMeshes.every((m,i)=>m===refs[i]));
 r.raceSpeedIntensity=1;r.updateRaceSpeedLines(1/60);const geometry=r.raceSpeedLines.geometry,buffer=geometry.attributes.position.array;
 for(let i=0;i<60;i++){r.skyTime+=1/60;r.updateRaceSpeedLines(1/60);}
 assert.equal(r.raceSpeedLines.geometry,geometry);assert.equal(geometry.attributes.position.array,buffer);assert.equal(buffer.length,32*6);
 r.raceSpeedIntensity=0;r.updateRaceSpeedLines(1/60);assert.equal(r.raceSpeedLines.visible,false);
 r.raceSpeedIntensity=1;r.reducedHyperdriveMotion=true;r.updateRaceSpeedLines(1/60);assert.equal(r.raceSpeedLines.visible,false);
});

test('flight warmup retains canvas and HDR effect programs and restores the current target',async()=>{
    const hdr={},previous={},compiled=[],warmup=new THREE.Group();let target=previous,initialized=0;
    const s=Object.create(SpaceRenderer.prototype);
    Object.assign(s,{scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),isIOS:false,
        bloomSceneTarget:hdr,bloomEnabled:()=>true,prepareCombatWarmup:()=>warmup,
        renderer:{info:{programs:[{getUniforms:()=>initialized++}]},getRenderTarget:()=>target,setRenderTarget:value=>target=value,
            compileAsync:async()=>{compiled.push(target);}}});
    await s.prepareActiveScene();
    assert.deepEqual(compiled,[null,hdr]);assert.equal(target,previous);assert.equal(initialized,1);
    assert.equal(warmup.parent,null);assert.equal(s.pendingShaderCompiles.size,0);
    compiled.length=0;s.isIOS=true;await s.prepareActiveScene();
    assert.deepEqual(compiled,[null],'iOS uses the direct canvas path');
});


test('off-scene postprocess and planetary ring passes are prepared before flight',async()=>{
    const s=Object.create(SpaceRenderer.prototype),hdr={},blurA={},blurB={},calls=[];
    const material={},quad={material},bright={},blur={},composite={},volume={},particles={};let target=null;
    Object.assign(s,{scene:new THREE.Scene(),camera:{},bloomCamera:{},isIOS:false,
        bloomSceneTarget:hdr,bloomBlurTargets:[blurA,blurB],bloomQuad:quad,
        bloomBrightMaterial:bright,bloomBlurMaterial:blur,bloomCompositeMaterial:composite,
        ringVolumeEnabled:true,ringVolume:{mesh:volume},ringParticles:{mesh:particles},
        bloomEnabled:()=>true,prepareCombatWarmup:()=>new THREE.Group(),
        renderer:{getRenderTarget:()=>target,setRenderTarget:value=>target=value,
            compileAsync:async object=>{calls.push({object,material:object.material,target});}}});
    await s.prepareActiveScene();
    assert.deepEqual(calls.map(call=>call.target),[null,hdr,blurA,blurB,null,hdr,hdr]);
    assert.deepEqual(calls.slice(2,5).map(call=>call.material),[bright,blur,composite]);
    assert.equal(calls[5].object,volume);assert.equal(calls[6].object,particles);
    assert.equal(quad.material,material);assert.equal(target,null);
});
