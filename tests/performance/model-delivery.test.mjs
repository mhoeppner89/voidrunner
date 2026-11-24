import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {fetchModelBytes} from '../../src/game/modelDelivery.js';

async function deliveryDirectory(t) {
    await mkdir('output', {recursive:true});
    const directory = await mkdtemp('output/model-delivery-test-');
    t.after(() => rm(directory, {recursive:true,force:true}));
    return directory;
}

test('concurrent model consumers share one body and later reads prefer the HTTP cache',async t=>{
    const modes=[];
    t.mock.method(globalThis,'fetch',async (_url,options)=>{
        modes.push(options.cache);
        return new Response(new Uint8Array([1,2,3]));
    });
    const url='https://example.invalid/hull.glb';
    const [first,second]=await Promise.all([fetchModelBytes(url),fetchModelBytes(url)]);
    assert.equal(first,second);
    assert.deepEqual(modes,['default']);
    await fetchModelBytes(url);
    assert.deepEqual(modes,['default','force-cache']);
});

test('an interrupted model read can retry without using an incomplete response',async t=>{
    const modes=[];
    t.mock.method(globalThis,'fetch',async (_url,options)=>{
        modes.push(options.cache);
        if(modes.length===1)throw Error('offline');
        return new Response(new Uint8Array([1]));
    });
    const url='https://example.invalid/retry.glb';
    await assert.rejects(fetchModelBytes(url),/offline/);
    await fetchModelBytes(url);
    assert.deepEqual(modes,['default','default']);
});

test('the nine on-demand wreck payloads inflate to the exact sources within 18 MB',async t=>{
    const {writeFile,unlink}=await import('node:fs/promises');
    const {gzipSync}=await import('node:zlib');
    const {packWrecks,verifyWrecks}=await import('../../tools/assets/pack-graveyard-models.mjs');
    const destination=await deliveryDirectory(t);
    await packWrecks(destination);
    const total=await verifyWrecks(destination);
    assert.ok(total<=18_000_000,`packed fleet: ${total} bytes`);
    const file=destination+'/assets/models/wrecks/wayfarer-wreck.glb.gz';
    await writeFile(file,gzipSync('wrong model'));
    await assert.rejects(verifyWrecks(destination),/Wreck delivery mismatch/);
    await unlink(file);
    await assert.rejects(verifyWrecks(destination),{code:'ENOENT'});
});

test('packed models support both static gzip files and HTTP-decoded gzip responses',async t=>{
    const {gzipSync}=await import('node:zlib');
    const glb=Buffer.alloc(12);
    glb.write('glTF');glb.writeUInt32LE(2,4);glb.writeUInt32LE(12,8);
    t.mock.method(globalThis,'fetch',async url=>url.includes('/static/')
        ? new Response(gzipSync(glb))
        : new Response(glb,{headers:{'Content-Encoding':'gzip'}}));
    for(const host of ['static','encoded']){
        const bytes=await fetchModelBytes(`https://example.invalid/${host}/wreck.glb.gz`);
        assert.deepEqual(Buffer.from(bytes),glb);
    }
});

test('full-resolution shipping hulls stay within their transfer budgets and keep every geometry accessor',async t=>{
    const {readFile}=await import('node:fs/promises');
    const {createHash}=await import('node:crypto');
    const read=async path=>{
        const data=await readFile(new URL('../../'+path,import.meta.url));
        const end=20+data.readUInt32LE(12);
        const scene=JSON.parse(data.toString('utf8',20,end));
        const view=index=>{
            const range=scene.bufferViews[index],offset=end+8+(range.byteOffset??0);
            return data.subarray(offset,offset+range.byteLength);
        };
        return {scene,data,view};
    };
    const {execFileSync}=await import('node:child_process');
    const destination=await deliveryDirectory(t);
    execFileSync('python3',['tools/assets/pack-hull-textures.py',destination]);
    for(const [hull,maxBytes] of [['torsas',22_500_000],['lancer',6_900_000]]){
        const source=await read('assets/models/ships/'+hull+'.glb');
        const packed=await read(destination+'/'+hull+'.glb');
        assert.ok(packed.data.length<=maxBytes,hull);
        assert.equal(packed.scene.asset.extras.sourceSha256,createHash('sha256').update(source.data).digest('hex'));
        for(const key of ['accessors','meshes','nodes','materials','samplers'])assert.deepEqual(source.scene[key],packed.scene[key]);
        for(const a of source.scene.accessors)assert.deepEqual(source.view(a.bufferView),packed.view(a.bufferView));
        source.scene.textures.forEach((tex,i)=>{
            const out=packed.scene.textures[i];
            assert.equal(out.extensions?.EXT_texture_webp?.source??out.source,tex.source);
            const input=source.view(source.scene.images[tex.source].bufferView);
            const output=packed.view(packed.scene.images[tex.source].bufferView);
            if(output.toString('ascii',8,12)==='WEBP'){
                assert.equal(output.toString('ascii',12,16),'VP8L');
                const size=output.readUInt32LE(21);
                assert.equal((size&16383)+1,input.readUInt32BE(16));
                assert.equal(((size>>>14)&16383)+1,input.readUInt32BE(20));
            }else assert.deepEqual(input,output);
        });
    }
});
