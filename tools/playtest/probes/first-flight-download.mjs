// Use a single bandwidth limit for the page and its worker. Throttling a single
// CDP target misses requests issued by the installing service worker.
import {chromium, devices} from 'playwright';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {extname, join, resolve, sep} from 'node:path';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';

const root = resolve(process.env.VR_DIST ?? 'dist');
const out = process.env.VR_OUTPUT_DIR ?? 'output/optimize/budget';
const rate = Number(process.env.MBIT ?? 9);
const budget = Number(process.env.BUDGET_BYTES ?? 18_000_000);
const contentTypes = {'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json',
    '.webmanifest':'application/manifest+json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml',
    '.woff2':'font/woff2','.mp3':'audio/mpeg'};
assert.ok(rate >= 1 && rate <= 1000);
await mkdir(out,{recursive:true});
const pending = [], transfers = [], files = new Map();
let total = 0;
const interval = setInterval(() => {
    let allowance = Math.floor(rate * 125000 * .02);
    while (allowance > 0 && pending.length) {
        const job = pending.shift();
        if (job.res.destroyed) continue;
        const count = Math.min(4096,allowance,job.data.length-job.entry.bytes);
        job.res.write(job.data.subarray(job.entry.bytes,job.entry.bytes+count));
        job.entry.bytes += count;
        total += count;
        allowance -= count;
        if (job.entry.bytes < job.data.length) pending.push(job);
        else job.res.end();
    }
},20);
const server = createServer(async (req,res) => {
    try {
        const pathname = new URL(req.url,'http://local').pathname;
        const path = resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
        if (!path.startsWith(root+sep)) throw Error('Outside fixture');
        let file = files.get(path);
        if (!file) {
            let data = await readFile(path);
            const headers = {'content-type':contentTypes[extname(path)]??'application/octet-stream',
                'cache-control':'max-age=600',etag:'"'+data.length+'"'};
            if (/\.(js|html|css|json|svg)$/.test(path)) {
                data = gzipSync(data);
                headers['content-encoding'] = 'gzip';
            }
            headers['content-length'] = data.length;
            file = {headers,data};
            files.set(path,file);
        }
        setTimeout(() => {
            if (res.destroyed) return;
            if (req.headers['if-none-match'] === file.headers.etag) {
                res.writeHead(304,{etag:file.headers.etag});res.end();return;
            }
            res.writeHead(200,file.headers);
            const entry = {pathname,bytes:0};
            transfers.push(entry);
            pending.push({res,data:file.data,entry});
        },rate>=9?40:150);
    } catch { res.writeHead(404);res.end(); }
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({executablePath:existsSync(chrome)?chrome:undefined,
    args:['--mute-audio','--no-sandbox','--disable-gpu-sandbox','--use-angle='+(process.env.VR_ANGLE??'swiftshader')]});
try {
    const context = await browser.newContext(devices['Pixel 7 landscape']);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    // Fix only the two inputs to the normal new-career seed. Restore the clocks
    // before simulation, traffic generation and the loading screen run.
    await page.addInitScript(() => {
        window.seedNextCareer = () => {
            const now=Date.now,random=Math.random;
            Date.now=function(){
                if (new Error().stack.includes('at createNewSave')) {
                    Date.now=now;
                    Math.random=()=>{Math.random=random;return 0;};
                    return 4242;
                }
                return now();
            };
        };
        const proto=WebGL2RenderingContext.prototype, allocations=new Map();
        const store=proto.texStorage2D,release=proto.deleteTexture;
        proto.texStorage2D=function(target,levels,format,width,height){
            const cube=target===this.TEXTURE_CUBE_MAP;
            const texture=this.getParameter(cube?this.TEXTURE_BINDING_CUBE_MAP:this.TEXTURE_BINDING_2D);
            let pixels=0;
            for(let i=0;i<levels;i++){
                pixels+=width*height;width=Math.max(1,width>>1);height=Math.max(1,height>>1);
            }
            // RGBA8-equivalent estimate, including mip levels and cube faces.
            allocations.set(texture,pixels*(cube?6:1)*(format===this.RGBA16F?8:4));
            return store.apply(this,arguments);
        };
        proto.deleteTexture=function(texture){allocations.delete(texture);return release.call(this,texture);};
        window.textureBytes=()=>[...allocations.values()].reduce((a,b)=>a+b,0);
    });
    const memory=async()=>{
        await cdp.send('HeapProfiler.collectGarbage');
        return {heap:(await cdp.send('Runtime.getHeapUsage')).usedSize,gpu:await page.evaluate(()=>textureBytes())};
    };
    const url='http://127.0.0.1:'+server.address().port+'/game.html', report={rate,angle:process.env.VR_ANGLE??'swiftshader'};
    for(const phase of process.env.FULL_REPORT?['cold','warm']:['cold']){
        const began=Date.now(),bytes=total,offset=transfers.length;
        await page.goto(url,{waitUntil:'domcontentloaded',timeout:180000});
        await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
        let failures=0;
        const onConsole=message=>{if(message.text().startsWith('Session startup failed.')) failures++;};
        page.on('console',onConsole);
        for(let attempt=0;attempt<12;attempt++){
            await page.evaluate(()=>{
                seedNextCareer();
                document.querySelector('[data-ui-command="new"]').click();
                document.querySelector('[data-ui-command="skip-new-career"]').click();
            });
            // Old releases time out after 20s on a slow connection. Retry through
            // the same UI so the baseline records the delays a player encounters.
            await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared &&
                document.querySelector('#loading-screen').classList.contains('is-hidden') ||
                document.querySelector('#title-startup-error:not(.is-hidden)'),null,{timeout:22000}).catch(()=>{});
            if(failures<=attempt)break;
        }
        await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared &&
            document.querySelector('#loading-screen').classList.contains('is-hidden'),null,{timeout:180000});
        page.off('console',onConsole);
        const state=await page.evaluate(async()=>{
            const r=__VOID_PRIVATEER__.getRuntime();
            await r.launch();
            await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
            return {docked:r.save.player.dockedAt,seed:r.save.world.seed};
        });
        assert.equal(state.seed,4242);
        assert.ok(!state.docked);
        const elapsed=Date.now()-began;
        const requests=transfers.slice(offset).map(entry=>({...entry}));
        // A cold page can leave a large cache write running across navigation.
        // Separate that traffic from requests made by the returning page.
        report[phase]={ms:elapsed,bytes:total-bytes,requestBytes:requests.reduce((sum,r)=>sum+r.bytes,0),
            failures,...await memory()};
        console.log(phase,report[phase]);
        await writeFile(join(out,phase+'-requests.json'),JSON.stringify(requests,null,2));
        await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
        if(phase==='cold')assert.ok(report.cold.bytes<=budget,'Cold first flight exceeds '+budget+' body bytes');
        if (process.env.FULL_REPORT && phase==='cold') {
            await page.waitForFunction(()=>navigator.serviceWorker.controller);
            await page.evaluate(async()=>{
                const r=__VOID_PRIVATEER__.getRuntime();
                cancelAnimationFrame(r.frameId);
                await Promise.allSettled([...r.renderer.glbShipLoading.values(),...(r.renderer.stationModelLoads?.values()??[])]);
            });
            // Let the final cache writes and request bodies settle. The second
            // navigation starts with an idle link and the same installed worker.
            let idle=0;
            while(idle<6) {
                await new Promise(done=>setTimeout(done,250));
                idle=pending.length?0:idle+1;
            }
        }
    }
    if(process.env.FULL_REPORT){
        await page.evaluate(async()=>{seedNextCareer();await __VOID_PRIVATEER__.startArena('open','1v1','rookie');});
        report.arena=await memory();
        await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
    }
} finally {
    clearInterval(interval);await browser.close();server.closeAllConnections();server.close();
}
