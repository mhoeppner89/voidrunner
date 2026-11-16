// Padded source for the navy/white hand edit. Keep the original pose pixels
// unchanged, with room for the forearm to continue below/left of the viewport.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4212';
const out=new URL('../../output/cockpit-art/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio']});
try{
    const page=await browser.newPage();await page.goto(`${base}/output/cockpit-layout/index.html`);
    const png=await page.evaluate(async()=>{
        const image=new Image();image.src='/assets/cockpits/wayfarer-hand-pitch-v4.png';await image.decode();
        const canvas=document.createElement('canvas');canvas.width=3072;canvas.height=1086;const ctx=canvas.getContext('2d');
        for(let i=0;i<3;i++)ctx.drawImage(image,i*724,0,724,724,i*1024+300,0,724,724);
        return canvas.toDataURL('image/png').split(',')[1];
    });
    await writeFile(new URL('hand-expanded-guide-v4.png',out),Buffer.from(png,'base64'));
}finally{await browser.close();}
