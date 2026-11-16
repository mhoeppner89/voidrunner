// Image-generation reference: approved glass apertures and canopy ribs only.
// Controls, hand, telemetry, reticle and decoration deliberately stay out.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4212',hull=process.env.VR_COCKPIT_HULL??'wayfarer';
const apertureGuide=process.env.VR_APERTURE_GUIDE==='1';
const out=new URL('../../output/cockpit-art/',import.meta.url);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio']});
try{
    const page=await browser.newPage({viewport:{width:736,height:370},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await page.goto(`${base}/output/cockpit-layout/index.html?hull=${encodeURIComponent(hull)}`);
    await page.waitForFunction(()=>window.ready);
    const frame=page.frames().find(f=>f.url().includes('embedded=1'));
    const guide=await frame.evaluate(async apertureGuide=>{
        const {cockpitStructure,monitorHousings}=await import('./artwork.js');
        const {drawConsoleSurfaces}=await import('./consoleGeometry.js');
        const review=cockpitReview,structure=cockpitStructure(review.definition,JSON.parse(render_game_to_text()).canopy);
        const {width:w,height:h,beams,bowPath,rails,panels,surfaces,monitors:apertures}=structure,housingTop=review.definition.housingTop;
        const monitors=Object.fromEntries(Object.entries(apertures).map(([id,r])=>[id,{x:r.x,y:r.y,w:r.width,h:r.height}]));
        const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#081523';ctx.fillRect(0,0,w,h);
        drawConsoleSurfaces(ctx,surfaces);
        ctx.lineWidth=13;ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='#80919a';
        if(bowPath)ctx.stroke(new Path2D(bowPath));
        for(const points of rails){ctx.beginPath();for(let i=0;i<points.length;i++)ctx[i?'lineTo':'moveTo'](...points[i]);ctx.stroke();}
        const polygon=points=>{ctx.beginPath();points.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](x,y));ctx.closePath();};
        for(const {glass:r,outline,roofFace} of monitorHousings(review.definition)){
            ctx.fillStyle='#80919a';polygon(outline);ctx.fill();
            if(roofFace){ctx.fillStyle='#b0bec1';polygon(roofFace);ctx.fill();}
            ctx.fillStyle=apertureGuide?'#00ffff':'#03090f';ctx.fillRect(r.x,r.y,r.width,r.height);
            if(apertureGuide){ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.strokeRect(r.x-1,r.y-1,r.width+2,r.height+2);}
        }
        return {png:canvas.toDataURL('image/png').split(',')[1],geometry:{width:w,height:h,monitors,beams,bowPath,panels,surfaces}};
    },apertureGuide);
    await writeFile(new URL(`monitor-beam-guide-${hull}${apertureGuide?'-apertures':''}.png`,out),Buffer.from(guide.png,'base64'));
    await writeFile(new URL(`monitor-beam-guide-${hull}${apertureGuide?'-apertures':''}.json`,out),JSON.stringify(guide.geometry,null,2)+'\n');
    console.log('Saved monitor-and-beam-only image-generation guide.');
}finally{await browser.close();}
