import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
    return next(specifier === 'three' ? new URL('../vendor/three.module.min.js', import.meta.url).href : specifier, context);
} });
const { buildGlbScene } = await import('../src/game/glbLoader.js');

function fixture({ stride = 12, offset = 4, indexType = 5123 } = {}) {
    const bin = new Uint8Array(128), view = new DataView(bin.buffer);
    const positions = [1.5, -2, 3, 4, 5.25, -6, 7, 8, 9];
    for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++)
        view.setFloat32(offset + i * stride + k * 4, positions[i * 3 + k], true);
    const indexSize = indexType === 5123 ? 2 : 4;
    [2, 1, 0].forEach((value, i) => indexSize === 2 ? view.setUint16(96 + i * 2, value, true) : view.setUint32(96 + i * 4, value, true));
    const json = {
        asset: { version: '2.0' }, buffers: [{ byteLength: bin.length }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 96, byteStride: stride }, { buffer: 0, byteOffset: 96, byteLength: 3 * indexSize }],
        accessors: [
            { bufferView: 0, byteOffset: offset, componentType: 5126, type: 'VEC3', count: 3 },
            { bufferView: 1, componentType: indexType, type: 'SCALAR', count: 3 },
        ],
        materials: [{ name: 'hull', pbrMetallicRoughness: { baseColorFactor: [.3, .5, .7, 1], roughnessFactor: .62, metallicFactor: .4 } }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
        nodes: [{ mesh: 0, translation: [10, 20, 30] }], scenes: [{ nodes: [0] }], scene: 0,
    };
    const text = Buffer.from(JSON.stringify(json)), jsonLength = Math.ceil(text.length / 4) * 4;
    const file = Buffer.alloc(12 + 8 + jsonLength + 8 + bin.length);
    file.writeUInt32LE(0x46546c67, 0); file.writeUInt32LE(2, 4); file.writeUInt32LE(file.length, 8);
    file.writeUInt32LE(jsonLength, 12); file.write('JSON', 16); file.fill(0x20, 20, 20 + jsonLength); text.copy(file, 20);
    file.writeUInt32LE(bin.length, 20 + jsonLength); file.write('BIN\0', 24 + jsonLength); Buffer.from(bin).copy(file, 28 + jsonLength);
    return { buffer: file.buffer.slice(file.byteOffset, file.byteOffset + file.length), positions };
}
for (const stride of [12, 20]) for (const offset of [0, 4, 1]) for (const indexType of [5123, 5125]) {
    test(`GLB keeps packed/strided geometry exact (stride=${stride}, offset=${offset}, indices=${indexType})`, async () => {
        const { buffer, positions } = fixture({ stride, offset, indexType });
        const input = new Uint8Array(buffer).slice();
        const root = await buildGlbScene(buffer), node = root.children[0], mesh = node.children[0];
        assert.deepEqual(Array.from(mesh.geometry.attributes.position.array), positions);
        assert.deepEqual(Array.from(mesh.geometry.index.array), [2, 1, 0]);
        assert.equal(mesh.geometry.index.array.constructor, indexType === 5123 ? Uint16Array : Uint32Array);
        assert.equal(node.matrixAutoUpdate, false);
        root.updateMatrixWorld(true);
        assert.deepEqual(node.matrixWorld.elements.slice(12, 15), [10, 20, 30]);
        assert.equal(mesh.material.roughness, .62); assert.equal(mesh.material.metalness, .4);
        mesh.geometry.attributes.position.array[0] = 999;
        assert.deepEqual(new Uint8Array(buffer), input, 'geometry must not retain a mutable view into the GLB');
        mesh.geometry.dispose(); mesh.material.dispose();
    });
}
