import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readdir, stat} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

async function fileDigest(file) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}

async function runtimeFiles(root, directory = '') {
    const files = new Map();
    for (const entry of await readdir(join(root, directory), {withFileTypes: true})) {
        const path = join(directory, entry.name);
        if (entry.isFile()) {
            files.set(path, await stat(join(root, path)));
        } else if (entry.isDirectory()) {
            for (const [nestedPath, info] of await runtimeFiles(root, path)) files.set(nestedPath, info);
        }
    }
    return files;
}

const targets = process.argv.slice(2);
if (!targets.length) {
    console.error('Usage: node tools/native/verify-bundled-runtime.mjs <bundle-runtime> [...]');
    process.exit(2);
}

const release = fileURLToPath(new URL('../../dist/', import.meta.url));
const expected = await runtimeFiles(release).catch(error => {
    if (error.code === 'ENOENT') return new Map();
    throw error;
});
if (!expected.has('index.html') || !expected.has(join('src', 'main.js'))) {
    console.error('Run npm run build to create the release runtime in dist/.');
    process.exit(2);
}

let totalBytes = 0;
for (const [path, info] of expected) {
    totalBytes += info.size;
    expected.set(path, {size: info.size, digest: await fileDigest(join(release, path))});
}

for (const target of targets) {
    const root = resolve(target);
    const files = await runtimeFiles(root).catch(error => {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
        throw error;
    });
    if (!files) {
        console.error(`${target}: bundle runtime directory not found`);
        process.exitCode = 1;
        continue;
    }
    const differences = [];
    for (const [path, {size, digest}] of expected) {
        const file = files.get(path);
        if (!file) differences.push(`missing ${path}`);
        else if (file.size !== size || await fileDigest(join(root, path)) !== digest)
            differences.push(`changed ${path}`);
    }
    if (differences.length) {
        console.error(`${target}: ${differences.length} release files differ`);
        for (const difference of differences.slice(0, 20)) console.error(`  ${difference}`);
        if (differences.length > 20) console.error(`  ${differences.length - 20} more`);
        process.exitCode = 1;
    } else {
        console.log(`${target}: verified ${expected.size} release files (${totalBytes} bytes)`);
    }
}
