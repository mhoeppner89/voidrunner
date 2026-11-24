import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {gzipSync, gunzipSync} from 'node:zlib';
import {GRAVEYARD_MODEL_WRECKS} from '../../src/game/graveyardLayout.js';

const wreckFiles = new Set(GRAVEYARD_MODEL_WRECKS.map(wreck => wreck.file));

export async function packWrecks(destination) {
    for (const file of wreckFiles) {
        const output = join(destination, file + '.gz');
        await mkdir(dirname(output), {recursive:true});
        await writeFile(output, gzipSync(await readFile(file), {level:9}));
    }
}

export async function verifyWrecks(destination) {
    let total = 0;
    for (const file of wreckFiles) {
        const packed = await readFile(join(destination, file + '.gz'));
        if (!gunzipSync(packed).equals(await readFile(file))) throw Error('Wreck delivery mismatch: ' + file);
        total += packed.length;
    }
    return total;
}
