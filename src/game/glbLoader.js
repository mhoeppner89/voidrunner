import * as THREE from 'three';

// Minimal GLB loader for the static ship hulls in assets/models/. It supports
// the node, mesh, transform, embedded-texture, and PBR material features used
// by both the original player ships and the adapted Concord capital hulls.
// No animations, skins, morphs, or external buffers are shipped, so the full
// GLTFLoader addon would be dead weight. Geometry construction is deliberately
// synchronous after the embedded textures finish decoding.
const COMPONENT_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

const decodeImage = (bytes, mime) => {
    const blob = new Blob([bytes], { type: mime });
    if (typeof createImageBitmap === 'function') {
        return createImageBitmap(blob).catch(() => loadViaImage(blob));
    }
    return loadViaImage(blob);
};
const loadViaImage = (blob) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
    };
    image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('texture decode failed'));
    };
    image.src = url;
});

const parseContainer = (arrayBuffer) => {
    const view = new DataView(arrayBuffer);
    if (view.getUint32(0, true) !== 0x46546c67)
        throw new Error('GLB: bad magic');
    let jsonChunk;
    let bin = new Uint8Array(0);
    let offset = 12;
    while (offset + 8 <= arrayBuffer.byteLength) {
        const length = view.getUint32(offset, true);
        const type = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7));
        if (type === 'JSON')
            jsonChunk = new TextDecoder().decode(new Uint8Array(arrayBuffer, offset + 8, length));
        else if (type === 'BIN\0')
            bin = new Uint8Array(arrayBuffer, offset + 8, length);
        offset += 8 + length;
    }
    if (!jsonChunk)
        throw new Error('GLB: missing JSON chunk');
    return { json: JSON.parse(jsonChunk), bin };
};

// Build a THREE.Group from a GLB buffer. Textures are decoded asynchronously
// first (createImageBitmap), then geometry/materials are built synchronously.
export async function loadGlb(url) {
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`GLB ${url}: HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return buildGlbScene(arrayBuffer);
}

export async function buildGlbScene(arrayBuffer) {
    const { json, bin } = parseContainer(arrayBuffer);
    const dataView = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);

    // Decode embedded textures first: every material slot is a separate image
    // in these models (base color, metallic-roughness).
    const bitmaps = [];
    for (const image of json.images ?? []) {
        const bufferView = json.bufferViews[image.bufferView];
        const bytes = bin.subarray(bufferView.byteOffset, bufferView.byteOffset + bufferView.byteLength);
        const bitmap = await decodeImage(bytes, image.mimeType ?? 'image/png');
        bitmaps.push(bitmap);
    }
    const wrapping = (value) => value === 33071 ? THREE.ClampToEdgeWrapping : value === 33648 ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    const textureDefs = json.textures ?? bitmaps.map((_, source) => ({ source }));
    const textures = textureDefs.map((definition, index) => {
        const bitmap = bitmaps[definition.source ?? index];
        if (!bitmap)
            return undefined;
        const texture = new THREE.Texture(bitmap);
        const sampler = json.samplers?.[definition.sampler];
        if (sampler?.wrapS !== undefined)
            texture.wrapS = wrapping(sampler.wrapS);
        if (sampler?.wrapT !== undefined)
            texture.wrapT = wrapping(sampler.wrapT);
        texture.needsUpdate = true;
        return texture;
    });

    const materials = (json.materials ?? []).map((definition) => {
        const pbr = definition.pbrMetallicRoughness ?? {};
        const factor = pbr.baseColorFactor ?? [1, 1, 1, 1];
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(factor[0], factor[1], factor[2]),
            opacity: factor[3] ?? 1,
            roughness: pbr.roughnessFactor ?? 1,
            metalness: pbr.metalnessFactor ?? 1,
            side: definition.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        });
        if (pbr.baseColorTexture !== undefined) {
            const texture = textures[pbr.baseColorTexture.index];
            if (pbr.baseColorTexture.texCoord && pbr.baseColorTexture.texCoord > 0)
                console.warn('GLB: extra UV sets unsupported');
            if (texture) {
                texture.colorSpace = THREE.SRGBColorSpace;
                material.map = texture;
            }
        }
        if (pbr.metallicRoughnessTexture !== undefined) {
            const texture = textures[pbr.metallicRoughnessTexture.index];
            // GLTF packs R=occlusion, G=roughness, B=metalness; three.js reads
            // the same channels, and the texture is linear data, not sRGB.
            if (texture) {
                texture.colorSpace = THREE.NoColorSpace;
                material.roughnessMap = texture;
                material.metalnessMap = texture;
            }
        }
        const emissiveFactor = definition.emissiveFactor;
        if (emissiveFactor)
            material.emissive.setRGB(emissiveFactor[0], emissiveFactor[1], emissiveFactor[2]);
        if (definition.emissiveTexture !== undefined) {
            const texture = textures[definition.emissiveTexture.index];
            if (texture) {
                texture.colorSpace = THREE.SRGBColorSpace;
                material.emissiveMap = texture;
            }
        }
        material.emissiveIntensity = definition.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1;
        if (definition.alphaMode === 'MASK')
            material.alphaTest = definition.alphaCutoff ?? 0.5;
        else if (definition.alphaMode === 'BLEND' || material.opacity < 1)
            material.transparent = true;
        material.name = definition.name ?? '';
        return material;
    });

    const buildGeometry = (primitive) => {
        const geometry = new THREE.BufferGeometry();
        const readAccessor = (index) => {
            const accessor = json.accessors[index];
            const bufferView = json.bufferViews[accessor.bufferView];
            const byteOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
            const componentSize = COMPONENT_SIZE[accessor.componentType] ?? 4;
            const itemSize = TYPE_COUNT[accessor.type] ?? 1;
            const stride = bufferView.byteStride ?? componentSize * itemSize;
            const out = new (accessor.componentType === 5126 ? Float32Array : accessor.componentType === 5123 ? Uint16Array : Uint32Array)(accessor.count * itemSize);
            const reader = accessor.componentType === 5126
                ? (o) => dataView.getFloat32(o, true)
                : accessor.componentType === 5123
                    ? (o) => dataView.getUint16(o, true)
                    : (o) => dataView.getUint32(o, true);
            for (let i = 0; i < accessor.count; i += 1) {
                const base = byteOffset + i * stride;
                for (let k = 0; k < itemSize; k += 1)
                    out[i * itemSize + k] = reader(base + k * componentSize);
            }
            return out;
        };
        const position = readAccessor(primitive.attributes.POSITION);
        geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
        if (primitive.attributes.NORMAL !== undefined)
            geometry.setAttribute('normal', new THREE.BufferAttribute(readAccessor(primitive.attributes.NORMAL), 3));
        if (primitive.attributes.TEXCOORD_0 !== undefined)
            geometry.setAttribute('uv', new THREE.BufferAttribute(readAccessor(primitive.attributes.TEXCOORD_0), 2));
        if (primitive.indices !== undefined)
            geometry.setIndex(new THREE.BufferAttribute(readAccessor(primitive.indices), 1));
        geometry.computeBoundingSphere();
        return geometry;
    };

    const root = new THREE.Group();
    root.name = 'glb-root';
    const buildNode = (nodeIndex, parent) => {
        const node = json.nodes[nodeIndex];
        const object = new THREE.Group();
        object.name = node.name ?? '';
        if (node.matrix) {
            object.matrix.fromArray(node.matrix);
            object.matrixAutoUpdate = false;
        }
        else {
            if (node.translation)
                object.position.fromArray(node.translation);
            if (node.rotation)
                object.quaternion.fromArray(node.rotation);
            if (node.scale)
                object.scale.fromArray(node.scale);
        }
        if (node.mesh !== undefined) {
            for (const primitive of json.meshes[node.mesh].primitives) {
                const mesh = new THREE.Mesh(buildGeometry(primitive), materials[primitive.material ?? 0]);
                mesh.name = json.meshes[node.mesh].name ?? object.name;
                mesh.castShadow = true;
                object.add(mesh);
            }
        }
        parent.add(object);
        for (const child of node.children ?? [])
            buildNode(child, object);
    };
    const scene = json.scenes?.[json.scene ?? 0] ?? json.scenes?.[0];
    for (const node of scene?.nodes ?? [0])
        buildNode(node, root);
    return root;
}
