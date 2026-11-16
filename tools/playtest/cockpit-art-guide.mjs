// Image-generation reference: approved glass apertures and canopy ribs only.
// Controls, hand, telemetry, reticle and decoration deliberately stay out.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4212';
const out=new URL('../../output/cockpit-art/',import.meta.url);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio']});
try{
    const page=await browser.newPage({viewport:{width:736,height:370},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await page.goto(`${base}/output/cockpit-layout/index.html?revision=cockpit-art-guide-02`);
    await page.waitForFunction(()=>window.ready);
    const guide=await page.evaluate(()=>{
        const host=document.querySelector('#cockpit'),origin=host.getBoundingClientRect();
        const w=host.offsetWidth,h=host.offsetHeight,scale=origin.width/w;
        const rect=selector=>{const r=host.querySelector(selector).getBoundingClientRect();return {x:(r.x-origin.x)/scale,y:(r.y-origin.y)/scale,w:r.width/scale,h:r.height/scale};};
        const monitors=Object.fromEntries(['own','radar','target'].map(id=>[id,rect(`.cockpit-screen-${id}`)]));
        const beams=[...host.querySelectorAll('#canopy-frame polyline')].map(e=>e.getAttribute('points').trim().split(/\s+/).map(p=>p.split(',').map(Number)).map(([x,y])=>[x*w/1600,y*h/900]));
        const canvas=document.createElement('canvas');canvas.width=w*2;canvas.height=h*2;
        const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.fillStyle='#081523';ctx.fillRect(0,0,w,h);
        ctx.lineWidth=7;ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='#80919a';
        for(const points of beams){ctx.beginPath();for(let i=0;i<points.length;i++)ctx[i?'lineTo':'moveTo'](...points[i]);ctx.stroke();}
        for(const r of Object.values(monitors)){
            ctx.fillStyle='#80919a';ctx.fillRect(r.x-r.w*.08,r.y-r.h*.12,r.w*1.16,r.h*1.24);
            ctx.fillStyle='#03090f';ctx.fillRect(r.x,r.y,r.w,r.h);
        }
        return {png:canvas.toDataURL('image/png').split(',')[1],geometry:{width:w,height:h,monitors,beams}};
    });
    await writeFile(new URL('monitor-beam-guide-v2.png',out),Buffer.from(guide.png,'base64'));
    await writeFile(new URL('monitor-beam-guide-v2.json',out),JSON.stringify(guide.geometry,null,2)+'\n');
    console.log('Saved monitor-and-beam-only image-generation guide.');
}finally{await browser.close();}
