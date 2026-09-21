import assert from 'node:assert/strict';
import { writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
if (!process.argv[2]) throw new Error('Usage: node scripts/compare-render-work.mjs BASELINE_DIRECTORY [REPORT_JSON]');
const baseline = pathToFileURL(resolve(process.argv[2]) + '/');
const current = new URL('../', import.meta.url);
registerHooks({ resolve(specifier, context, next) {
    return next(specifier === 'three' ? new URL('vendor/three.module.min.js', current).href : specifier, context);
} });
const THREE=await import('three');
const { SpaceRenderer: Old }=await import(new URL('src/game/render.js', baseline));
const { SpaceRenderer: New }=await import(new URL('src/game/render.js', current));
const { generateAsteroidField, generateGraveyardPieces, generateWreckNodes }=await import(new URL('src/game/worldData.js', current));
const { LOCATIONS }=await import(new URL('src/game/data.js', current));
function make(Type) {
    const r=Object.create(Type.prototype);
    r.camera=new THREE.PerspectiveCamera(74, 852/393, .08, 2000000);
    r.viewSphere=new THREE.Sphere(); r.tmpPosition=new THREE.Vector3(); r.tmpScale=new THREE.Vector3();
    r.tmpEuler=new THREE.Euler(); r.tmpQuaternion=new THREE.Quaternion(); r.tmpMatrix=new THREE.Matrix4();
    r.instanceRoots=new Map([['shardbelt',new THREE.Group()],['mourning-line',new THREE.Group()]]);
    r.asteroids=generateAsteroidField(804140, {}); r.graveyard=generateGraveyardPieces(804140); r.wreckNodes=generateWreckNodes(804140, {});
    r.graveyardBatches=[]; r.wreckBatches=[]; r.wreckNodeMeshes=new Map();
    // Pixel material generation is unchanged and excluded from this geometry test.
    r.createPixelPanelTexture=()=>new THREE.Texture();
    r.createAsteroids(); r.createGraveyard(); r.createWreckNodes();
    return r;
}
const a=make(Old), b=make(New);
const stats={baseline:{ranges:0,mergedUploads:0,bytes:0},proposed:{ranges:0,mergedUploads:0,bytes:0}};
function attributes(r) {return [...r.asteroidMeshes,...r.graveyardBatches,...r.wreckBatches].flatMap(batch=>[batch.mesh.instanceMatrix,batch.mesh.instanceColor].filter(Boolean));}
function flush(r,name,record) {
    for(const attribute of attributes(r)) {
        const ranges=attribute.updateRanges.map(range=>({...range})).sort((a,b)=>a.start-b.start);
        const merged=[];
        for(const range of ranges) {
            const previous=merged.at(-1);
            if(previous && range.start<=previous.start+previous.count+1) previous.count=Math.max(previous.count,range.start+range.count-previous.start);
            else merged.push(range);
        }
        if(record) {
            stats[name].ranges+=ranges.length; stats[name].mergedUploads+=merged.length;
            stats[name].bytes+=merged.reduce((sum,range)=>sum+range.count*attribute.array.BYTES_PER_ELEMENT,0);
        }
        attribute.clearUpdateRanges();
    }
}
flush(a,'baseline',false);flush(b,'proposed',false);
for(let frame=0;frame<240;frame++) {
    const id=frame<120?'shardbelt':'mourning-line', center=LOCATIONS[id].position;
    for(const r of [a,b]) {
        r.camera.position.set(center[0]+Math.cos(frame*.04)*1600,center[1]+Math.sin(frame*.03)*500,center[2]+Math.sin(frame*.04)*1600);
        r.camera.lookAt(...center);r.camera.updateMatrixWorld(true);
        const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(r.camera.projectionMatrix,r.camera.matrixWorldInverse));
        for(const node of r.asteroids) if(node.moving) node.rotation[1]+=.002;
        for(const piece of r.graveyard) if(piece.moving) piece.rotation[1]+=.002;
        r.selectedAsteroidId=r.asteroids[frame%r.asteroids.length].id;
        if(id==='shardbelt') r.updateAsteroidInstances(frustum);
        else { r.updateGraveyardInstances(frustum); r.updateWreckNodeInstances(1/60); }
    }
    const aa=attributes(a),bb=attributes(b); assert.equal(aa.length,bb.length);
    for(let i=0;i<aa.length;i++) assert.deepEqual(bb[i].array,aa[i].array,`attribute ${i}, frame ${frame}`);
    for(const kind of ['asteroidMeshes','graveyardBatches','wreckBatches']) for(let i=0;i<a[kind].length;i++) {
        assert.equal(b[kind][i].mesh.count,a[kind][i].mesh.count);
        assert.deepEqual(b[kind][i].mesh.userData.nodeIndices,a[kind][i].mesh.userData.nodeIndices);
    }
    flush(a,'baseline',true);flush(b,'proposed',true);
}
const result={frames:240,seed:804140,asteroids:a.asteroids.length,debris:a.graveyard.length,wreckNodes:a.wreckNodes.length,identicalBuffersAndPicking:true,method:'Actual generated fields and renderer update methods under a scripted camera sweep. Upload counts model the vendored Three r179 range-merging algorithm; no GPU or phone timing.',...stats};


const oldLoader = await import(new URL('src/game/glbLoader.js', baseline));
const newLoader = await import(new URL('src/game/glbLoader.js', current));
const hash = array => createHash('sha256').update(Buffer.from(array.buffer ?? array, array.byteOffset ?? 0, array.byteLength)).digest('hex');
// Texture bytes remain identical. This test deliberately does not measure
// browser image decoding, GPU upload, shading, or physical-phone frame rate.
globalThis.createImageBitmap = async blob => ({ width: 1, height: 1, digest: hash(await blob.arrayBuffer()) });
function fingerprint(root) {
    root.updateMatrixWorld(true); const result = [];
    root.traverse(object => {
        const row = { name: object.name, matrix: object.matrixWorld.toArray() };
        if (object.geometry) {
            row.attributes = Object.fromEntries(Object.entries(object.geometry.attributes).map(([key, value]) => [key, { type: value.array.constructor.name, count: value.count, hash: hash(value.array) }]));
            row.index = object.geometry.index ? hash(object.geometry.index.array) : null;
            const m = object.material;
            row.material = { name: m.name, color: m.color.toArray(), roughness: m.roughness, metalness: m.metalness, opacity: m.opacity, side: m.side, emissive: m.emissive.toArray(), transparent: m.transparent, alphaTest: m.alphaTest, depthWrite: m.depthWrite, emissiveIntensity: m.emissiveIntensity, vertexColors: m.vertexColors };
            row.textures = Object.fromEntries(Object.entries(m).filter(([,value]) => value?.isTexture).map(([key, texture]) => [key, { bytes: texture.image.digest, colorSpace: texture.colorSpace, wrapS: texture.wrapS, wrapT: texture.wrapT, anisotropy: texture.anisotropy }]));
        }
        result.push(row);
    });
    return result;
}

const dir = new URL('assets/models/', current);
const files = (await readdir(dir, { recursive: true })).filter(file => file.endsWith('.glb')).sort();
const models = [];
for (const file of files) {
    const bytes = await readFile(new URL(file, dir));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
    const before = fingerprint(await oldLoader.buildGlbScene(buffer));
    const after = fingerprint(await newLoader.buildGlbScene(buffer));
    assert.deepEqual(after, before, file);
    models.push({ file, identical: true, meshes: after.filter(row => row.attributes).length });
}
result.models = models;
result.modelMethod = 'Exact geometry/index bytes, node world transforms, material values and embedded texture bytes. Browser texture decoding and final pixels are not tested.';
await writeFile(process.argv[3] ?? 'render-work-report.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, models: models.length }, null, 2));
