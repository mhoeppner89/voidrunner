// Measure the GLB hulls exactly as the flight scene bakes them (yaw + scale),
// so the player's collision envelope can be fitted to the real model.
// Run: node probe-hull-measure.mjs
import { register } from 'node:module';
await register(new URL('./probe-ai-resolver.mjs', import.meta.url));
const fs = await import('node:fs');
// Node has no createImageBitmap/Image; the GLB textures only need a fake bitmap
// for the measurement (geometry is what matters here).
globalThis.createImageBitmap = async (blob) => ({ width: 2, height: 2, close: () => undefined });
globalThis.Image = class {
    constructor() {
        setTimeout(() => {
            this.onload?.();
        }, 0);
    }
};
const { buildGlbScene } = await import('./src/game/glbLoader.js');
const { GLB_SHIP_CONFIG } = await import('./src/game/render.js');

const modelBox = (scene) => {
    // The GLB root holds one mesh (possibly nested one level); walk it.
    const positions = [];
    const walk = (object) => {
        if (object.isMesh && object.geometry?.getAttribute('position'))
            positions.push(object.geometry.getAttribute('position').array);
        for (const child of object.children ?? [])
            walk(child);
    };
    walk(scene);
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (const array of positions) {
        for (let i = 0; i < array.length; i += 3) {
            min[0] = Math.min(min[0], array[i]);
            min[1] = Math.min(min[1], array[i + 1]);
            min[2] = Math.min(min[2], array[i + 2]);
            max[0] = Math.max(max[0], array[i]);
            max[1] = Math.max(max[1], array[i + 1]);
            max[2] = Math.max(max[2], array[i + 2]);
        }
    }
    return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
};

for (const [variant, config] of Object.entries(GLB_SHIP_CONFIG)) {
    // Capital hulls (preload: false, `path` not `file`) are authored GLBs that
    // only load when a capital ship enters the scene; they are not baked from
    // voxel ships, so there is nothing to measure against the baked envelope.
    if (!config.file)
        continue;
    const buffer = fs.readFileSync(`assets/models/ships/${config.file}`);
    const scene = await buildGlbScene(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    const dump = (object, depth = 0) => {
        console.log(`${' '.repeat(depth)}${object.type || object.constructor?.name} isMesh=${object.isMesh} children=${object.children?.length} hasPos=${Boolean(object.geometry?.getAttribute?.('position'))}`);
        for (const child of object.children ?? [])
            dump(child, depth + 2);
    };
    dump(scene);
    const { size } = modelBox(scene);
    // Baked by rotation.y = yaw (pi/2 about Y) then uniform scale:
    //   world x (starboard) = model z * scale, world y (up) = model y * scale,
    //   world z (forward/length) = model x * scale.
    const baked = [size[2], size[1], size[0]].map((v) => +(v * config.scale).toFixed(2));
    console.log(`${variant.padEnd(16)} model=${size.map((v) => +v.toFixed(3)).join('x')}  baked(x=starboard,y=up,z=length)=${baked.join('x')}`);
}
