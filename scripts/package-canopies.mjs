// Uses the same separate glTF build tools as package-ship-models.mjs.
// Run after fix-canopy-seating.py through Blender MCP; review before shipping.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.GLTF_TOOLS_ROOT ?? '/tmp/voidrunner-gltf-tools', 'package.json'));
const { NodeIO } = require('@gltf-transform/core');
const { dedup, prune } = require('@gltf-transform/functions');
const io = new NodeIO();
for (const hull of (process.argv.slice(2).length ? process.argv.slice(2) : ['wayfarer', 'atlas', 'lancer'])) {
    const document = await io.read(`.freebuff/canopy-symmetry/${hull}.glb`);
    for (const material of document.getRoot().listMaterials()) {
        if (material.getName().startsWith('VR_Canopy_')) {
            material.setName(material.getName().split('.')[0]);
        }
    }
    // Preserve the already-packaged textures without another lossy encoding.
    await document.transform(dedup(), prune());
    await io.write(`.freebuff/ship-cleanup/packed/${hull}.glb`, document);
}
