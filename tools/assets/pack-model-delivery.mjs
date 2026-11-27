// Repack existing accessor layouts without moving vertices or changing triangle order.
import {readFile, writeFile, readdir, mkdir} from 'node:fs/promises';
import {dirname, join, relative} from 'node:path';
import {createHash} from 'node:crypto';
import {MeshoptEncoder, MeshoptDecoder} from 'meshoptimizer';

const EXT = 'EXT_meshopt_compression';
const padded = length => Math.ceil(length / 4) * 4;
const tupleSize = {SCALAR:1, VEC2:2, VEC3:3, VEC4:4};
const componentSize = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
function geometryLayout(view, accessor) {
    if (!accessor) return;
    const stride = view.byteStride ?? tupleSize[accessor.type] * componentSize[accessor.componentType];
    const mode = view.target === 34963 ? 'INDICES' : 'ATTRIBUTES';
    if (!stride || view.byteLength % stride || (mode === 'ATTRIBUTES' && stride % 4)) return;
    return {mode, byteStride:stride, count:view.byteLength / stride};
}
export async function packModelDelivery(root) {
    await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
    const models = join(root,'assets/models');
    const shared = join(models,'shared');
    await mkdir(shared,{recursive:true});
    const usedImages = new Map();
    const files = (await readdir(models,{recursive:true})).filter(name=>name.endsWith('.glb') && !name.startsWith('wrecks/'));
    // First pass counts identical embedded images without retaining the source buffers.
    async function read(name) {
        const data = await readFile(join(models,name));
        const end = 20 + data.readUInt32LE(12);
        const scene = JSON.parse(data.toString('utf8',20,end));
        const views = scene.bufferViews.map(v => data.subarray(end+8+(v.byteOffset??0),end+8+(v.byteOffset??0)+v.byteLength));
        return {scene, views};
    }
    const digest = bytes=>createHash('sha256').update(bytes).digest('hex');
    for (const name of files) {
        const {scene,views} = await read(name);
        for (const image of scene.images ?? []) {
            const key = digest(views[image.bufferView]);
            usedImages.set(key,(usedImages.get(key)??0)+1);
        }
    }
    for (const name of files) {
        const {scene, views} = await read(name);
        const images = new Map((scene.images??[]).map(image=>[image.bufferView,image]));
        const chunks = [];
        let length = 0, virtualLength = 0;
        for (const [i,view] of scene.bufferViews.entries()) {
            let bytes = views[i];
            const image = images.get(i);
            const layout = geometryLayout(view, scene.accessors.find(a=>a.bufferView===i));
            if (image && name !== 'ships/wayfarer.glb' && usedImages.get(digest(bytes)) > 1) {
                const file = join(shared,digest(bytes)+'.'+({'image/png':'png','image/webp':'webp','image/jpeg':'jpg'}[image.mimeType]));
                await writeFile(file, bytes);
                image.uri = relative(dirname(join(models,name)),file).split('\\').join('/');
                delete image.bufferView;
                bytes = Buffer.alloc(4); // keep subsequent accessor indices stable
                view.byteLength = 4;
            }
            view.byteOffset = length;
            if (layout) {
                const encoded = MeshoptEncoder.encodeGltfBuffer(bytes,layout.count,layout.byteStride,layout.mode);
                if (encoded.length + 128 < bytes.length) {
                    const decoded = Buffer.alloc(bytes.length);
                    MeshoptDecoder.decodeGltfBuffer(decoded,layout.count,layout.byteStride,encoded,layout.mode);
                    if (!bytes.equals(decoded)) throw Error('Geometry mismatch: '+name+' bufferView '+i);
                    view.extensions = {...view.extensions,[EXT]:{buffer:0,byteOffset:length,byteLength:encoded.length,...layout}};
                    view.buffer = 1;
                    view.byteOffset = virtualLength;
                    virtualLength += padded(bytes.length);
                    bytes = encoded;
                }
            }
            chunks.push(bytes,Buffer.alloc(padded(bytes.length)-bytes.length));
            length += padded(bytes.length);
        }
        if (virtualLength) {
            scene.buffers.push({byteLength:virtualLength,extensions:{[EXT]:{fallback:true}}});
            for (const key of ['extensionsUsed','extensionsRequired']) (scene[key]??=[]).push(EXT);
        }
        scene.buffers[0].byteLength = length;
        const json = Buffer.from(JSON.stringify(scene));
        const jsonLength = padded(json.length);
        const header = Buffer.alloc(20);
        header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonLength+length,8);
        header.writeUInt32LE(jsonLength,12);header.write('JSON',16);
        const binHeader = Buffer.alloc(8);binHeader.writeUInt32LE(length);binHeader.write('BIN',4);
        await writeFile(join(models,name),Buffer.concat([header,json,Buffer.alloc(jsonLength-json.length,32),binHeader,...chunks]));
    }
}
