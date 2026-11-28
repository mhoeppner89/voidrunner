import {execFileSync} from 'node:child_process';
import {access, chmod, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile} from 'node:fs/promises';
import {basename, dirname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {COCKPITS, paintedCockpitAssets} from '../../src/game/cockpitDefinitions.js';
import {packWrecks, verifyWrecks} from '../assets/pack-graveyard-models.mjs';
import {packModelDelivery} from '../assets/pack-model-delivery.mjs';

const cockpitFiles = new Set(Object.keys(COCKPITS).flatMap(id => paintedCockpitAssets(id)).map(url => fileURLToPath(url)));
function includeRuntimeAsset(path) {
    const key = relative(process.cwd(), resolve(path)).split(sep).join('/');
    if (basename(path) === '.DS_Store') return false;
    if (/^art\/(locations|portraits)\/v\d+(\/|$)/.test(key)) return false;
    if (/^art\/portraits\/[^/]+\.webp$/.test(key) || /^art\/outfitting\/v2(\/|$)/.test(key)) return false;
    if (/^assets\/remaster\/(ship-isometric|landed-)/.test(key)) return false;
    if (key.startsWith('assets/cockpits/')) return cockpitFiles.has(resolve(path));
    // packWrecks emits one verified gzip payload for each current field wreck.
    return !/^assets\/models\/wrecks\/[^/]+\.glb(?:\.gz)?$/.test(key);
}

async function verifyOfflineShell(output) {
    const worker = await readFile(join(output,'sw.js'),'utf8');
    const listStart = worker.indexOf('const CORE_ASSETS');
    const list = worker.slice(listStart,worker.indexOf('];',listStart));
    const core = new Set([...list.matchAll(/['"]\.\/([^'"\n]*)['"]/g)].map(m => m[1]));
    let installBytes = 0;
    for (const key of core) {
        const path = key || 'index.html';
        const data = await readFile(join(output,path));
        installBytes += /\.(js|html|css|json|svg)$/.test(path) ? gzipSync(data).length : data.length;
    }
    if (installBytes > 3_000_000) throw Error(`Offline install exceeds 3 MB: ${installBytes} bytes`);
    console.log(`Offline install: ${installBytes} bytes`);

    const seen = new Set();
    async function checkShell(file) {
        if (seen.has(file)) return;
        seen.add(file);
        const key = relative(output,file).split(sep).join('/');
        if (!core.has(key)) throw Error('Offline title dependency missing from CORE_ASSETS: '+key);
        const text = await readFile(file,'utf8');
        for (const match of text.matchAll(/\bfrom\s*['"]([^'"]+)['"]|(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g)) {
            const name = match[1] ?? match[2];
            if (name === 'three') await checkShell(join(output,'vendor/three.module.min.js'));
            else if (name.startsWith('.') && name.endsWith('.js')) await checkShell(resolve(dirname(file),name));
        }
    }
    await checkShell(join(output,'src/main.js'));
}

async function packageRuntime(output) {
    const files = ['index.html','game.html','favicon.svg','manifest.webmanifest','sw.js','THIRD_PARTY_NOTICES.md'];
    for (const path of [...files,'src','vendor','assets','art'])
        await cp(path,join(output,path),{recursive:true,filter:includeRuntimeAsset});
    for (const name of ['game.html','index.html']) {
        const path = join(output,name);
        const html = await readFile(path,'utf8');
        await writeFile(path,html.replace(/<html\b/,'<html data-packed-models'));
    }
    await packWrecks(output);
    await verifyWrecks(output);
    execFileSync('python3',['tools/assets/pack-hull-textures.py',join(output,'assets/models/ships')],{stdio:'inherit'});
    await packModelDelivery(output);
    execFileSync('python3',['tools/assets/pack-screen-art.py',output],{stdio:'inherit'});
    // Source definitions still describe the approved PNG masters. Publish the
    // same names with the lossless WebP extension in the shipping modules.
    const definitions = join(output,'src/game/cockpitDefinitions.js');
    const kits = join(output,'src/game/cockpits');
    for (const file of [definitions,...(await readdir(kits)).filter(name=>name.endsWith('.js')).map(name=>join(kits,name))]) {
        const source = await readFile(file,'utf8');
        await writeFile(file,source.replace(/\.png'/g,".webp'"));
    }
    for (const path of cockpitFiles) {
        const dest = relative(process.cwd(),path).replace(/\.png$/,'.webp');
        await access(join(output,dest));
    }
    await verifyOfflineShell(output);
}

// Keep the last playable build available while preparing and checking assets.
const scratch = resolve('.workbench');
await mkdir(scratch,{recursive:true});
const output = await mkdtemp(join(scratch,'runtime-build-'));
try {
    await packageRuntime(output);
    // Native resource copies preserve the staging directory's mode.
    await chmod(output, 0o755);
    await rm(resolve('dist'),{recursive:true,force:true});
    await rename(output,resolve('dist'));
    console.log('Packaged game runtime in dist/.');
} finally {
    await rm(output,{recursive:true,force:true});
}
