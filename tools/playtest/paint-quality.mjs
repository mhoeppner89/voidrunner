// Muted five-angle visual review, using the normal in-memory paint workshop.
import {chromium} from 'playwright';
import {PAINT_LAYOUTS} from '../../src/game/paintDesign.js';
import {mkdir,writeFile} from 'node:fs/promises';
const out='output/repaint-shapes/views';await mkdir(out,{recursive:true});
const b=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=metal']});
const p=await b.newPage({viewport:{width:1280,height:900},serviceWorkers:'block'}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
const views={hero:[1,.85,-1],top:[0,1,.001],belly:[0,-1,.001],port:[-1,.17,0],starboard:[1,.17,0]};
try{
 await p.goto('http://127.0.0.1:4192/output/repaint/index.html?revision=0.8.2kq');
 await p.waitForFunction(()=>window.paintReview?.shipPreviews[0]?.model?.paintSources);
 const hulls=process.env.VR_HULLS?.split(',')??await p.locator('#review-hull option').evaluateAll(a=>a.map(o=>o.value));const report=[];
 for(const hull of hulls){
  await p.selectOption('#review-hull',hull);await p.waitForFunction(h=>window.paintReview?.shipPreviews[0]?.model?.paintSources&&paintReview.save.player.shipId===h&&!paintReview.shipPreviews[0].dirty,hull);
  await p.locator('[data-palette="1"]').click();
  const patterns=[{id:'original',name:'Original finish'},...await p.locator('[data-pattern]').evaluateAll(a=>a.map(n=>({id:n.dataset.pattern,name:n.getAttribute('aria-label')})))];
  for(const pattern of patterns){
   await p.locator(pattern.id==='original'?'[data-ui-command="paint-factory"]':`[data-pattern="${pattern.id}"]`).click();
   // Restoring the original also resets the draft colors. Reapply the common
   // palette to each custom choice so the comparison isolates the pattern.
   if(pattern.id!=='original')await p.locator('[data-palette="1"]').click();
   await p.waitForFunction(id=>{const u=paintReview,s=u.shipPreviews[0];return !u.paintPreviewPending&&!s.dirty&&(id==='original'?s.model.userData.livery==='original':s.model.customPaintState?.design.pattern===id);},pattern.id);
   for(const[view,direction]of Object.entries(views)){
    await p.evaluate(async({direction,view})=>{
     const T=await import('three'),s=paintReview.shipPreviews[0],normal=new T.Vector3(...direction).normalize(),up= Math.abs(normal.y)>.99?new T.Vector3(0,0,-1):new T.Vector3(0,1,0),right=new T.Vector3().crossVectors(up,normal).normalize(),vertical=new T.Vector3().crossVectors(normal,right);
     s.pivot.rotation.set(0,0,0);s.pivot.updateMatrixWorld(true);let d=0;const point=new T.Vector3(),tv=Math.tan(T.MathUtils.degToRad(s.camera.fov*.5)),th=tv*s.camera.aspect;
     for(let i=0;i<s.paintFitPositions.length;i+=3){point.fromArray(s.paintFitPositions,i);d=Math.max(d,normal.dot(point)+Math.max(Math.abs(right.dot(point))/th,Math.abs(vertical.dot(point))/tv)*1.12);}
     s.camera.up.copy(up);s.camera.position.copy(normal).multiplyScalar(d);s.camera.lookAt(0,0,0);s.camera.updateProjectionMatrix();s.renderer.render(s.scene,s.camera);s.dirty=false;
    },{direction,view});
    await p.locator('.paint-editor-preview canvas').screenshot({path:`${out}/${hull}-${pattern.id}-${view}.png`});
   }
   report.push({hull,...pattern,views:Object.keys(views)});
  }
  console.log(hull,patterns.length-1,'patterns + original, five angles');
 }
 await writeFile('output/repaint-shapes/visual-report.json',JSON.stringify({report,errors},null,2));if(errors.length)throw Error(errors.join('\n'));
}finally{await b.close();}

const hullCount=Object.keys(PAINT_LAYOUTS).length,designCount=Object.values(PAINT_LAYOUTS).reduce((n,l)=>n+l.patterns.length,0);
const card=(h,d,original=false)=>`<article class="${original?'factory-card':''}"><img loading="lazy" width="480" height="300" data-hull="${h}" data-pattern="${d.id}" src="views/${h}-${d.id}-hero.png" alt="${h}: ${d.name}"><h3>${d.name}</h3></article>`;
const designs=Object.entries(PAINT_LAYOUTS).map(([h,l])=>`<section id="${h}"><h2>${h[0].toUpperCase()+h.slice(1)} <a href="/output/repaint/index.html?hull=${h}&revision=0.8.2kq">Customize ↗</a></h2><div class="hull-designs">${card(h,{id:'original',name:'Original finish'},true)}<div class="patterns">${l.patterns.map(d=>card(h,d)).join('')}</div></div></section>`).join('');
await writeFile('output/repaint-shapes/index.html',`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/favicon.svg"><title>Voidrunner · Hull paint designs</title><style>body{margin:0;background:#08121e;color:#e5e8dd;font:16px system-ui,sans-serif}header{position:sticky;top:0;z-index:1;background:#091929ef;border-bottom:1px solid #3d5b70;padding:16px 24px}h1{font-size:24px;margin:0 0 8px;color:#e7c77c}header p{margin:0 0 12px;color:#a9c2cb}nav{display:flex;gap:8px;flex-wrap:wrap}button{font:inherit;min-height:44px;padding:8px 18px;background:#102941;border:1px solid #4b7489;color:#e5e8dd;cursor:pointer}button[aria-pressed=true]{border-color:#e7c77c;color:#e7c77c}main{max-width:1400px;margin:auto;padding:16px 24px}h2{font-size:21px;margin:32px 0 10px}h2 a{float:right;font-size:15px;font-weight:400;color:#72d2dc}.hull-designs{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:12px}.patterns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.factory-card{display:flex;flex-direction:column}.factory-card img{flex:1;min-height:0;object-fit:contain}article{min-width:0;border:1px solid #294556;background:#0b1a29}img{width:100%;height:auto;aspect-ratio:1.6;object-fit:contain;display:block}h3{padding:12px;margin:0;font-size:16px;color:#e7c77c}@media(max-width:750px){.hull-designs,.patterns{grid-template-columns:1fr}.factory-card img{flex:none;max-height:360px}main{padding:10px 14px}header{padding:12px 14px}h2 a{float:none;display:block;margin:6px 0}}</style></head><body><header><h1>Hull paint designs</h1><p>${hullCount} hulls · ${designCount} fitted patterns + original finishes · Surveyor colors</p><nav>${Object.keys(views).map(v=>`<button data-view="${v}" aria-pressed="${v==='hero'}">${v[0].toUpperCase()+v.slice(1)}</button>`).join('')}</nav></header><main>${designs}</main><script>document.querySelector('nav').onclick=e=>{const b=e.target.closest('[data-view]');if(!b)return;for(const n of document.querySelectorAll('[data-view]'))n.setAttribute('aria-pressed',n===b);for(const im of document.querySelectorAll('img'))im.src='views/'+im.dataset.hull+'-'+im.dataset.pattern+'-'+b.dataset.view+'.png';};</script></body></html>`);
console.log('All-hull gallery: /output/repaint-shapes/index.html');
