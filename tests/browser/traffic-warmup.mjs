// Compare a live painted hull's program with the programs prepared for its
// later arrival. The scene is tiny, real WebGL, and always muted.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit,devices} from 'playwright';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/traffic-warmup';
await mkdir(out,{recursive:true});
await writeFile(`${out}/fixture.html`,`<!doctype html><link rel="icon" href="data:,">
<script type="importmap">{"imports":{"three":"/vendor/three.module.min.js"}}</script>
<script type="module">
import * as T from 'three';import {SpaceRenderer} from '/src/game/render.js';
import {prepareRenderScene} from '/src/game/renderWork.js';import {applyIndependentPaint} from '/src/game/independentPaints.js';import {stabilizeMaterialNormals} from '/src/game/materialNormals.js';
const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(48,48);renderer.outputColorSpace=T.SRGBColorSpace;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1,.1,100);camera.position.z=5;
scene.add(new T.HemisphereLight(0xffffff,0x404040,.7),new T.DirectionalLight(0xffffff,1.5));
const texture=new T.DataTexture(new Uint8Array([200,180,160,255]),1,1);texture.needsUpdate=true;
const normals=new T.DataTexture(new Uint8Array([128,128,255,255]),1,1);normals.needsUpdate=true;
const material=new T.MeshStandardMaterial({map:texture,normalMap:normals});material.name='Hull plating';
const geometry=new T.BoxGeometry();geometry.computeTangents();const template=new T.Group();template.add(new T.Mesh(geometry,material));
const root=new T.Group();root.position.set(1e9,1e9,1e9);scene.add(root);
const owner=Object.create(SpaceRenderer.prototype);owner.glbShipModels=new Map([['demon',template]]);owner.prepareTrafficWarmup(root);
const target=new T.WebGLRenderTarget(48,48,{type:T.HalfFloatType});
const ready=await prepareRenderScene(renderer,root,camera,target,{lightingScene:scene,timeoutMs:30000});
const prepared=new Set(renderer.info.programs.map(p=>p.cacheKey));scene.remove(root);
const live=new T.Group(),ship=new T.Mesh(geometry,material);live.add(ship);applyIndependentPaint(live,'independent-surveyor','demon');stabilizeMaterialNormals(ship.material);scene.add(live);
renderer.setRenderTarget(target);renderer.render(scene,camera);
const program=renderer.properties.get(ship.material).currentProgram;
window.result={ready,prepared:prepared.has(program.cacheKey),key:program.cacheKey,programs:renderer.info.programs.length};
</script>`);

for(const [name,engine,device] of [['desktop',chromium,{viewport:{width:800,height:600}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const gpu=process.env.VR_GPU==='metal'?'metal':'swiftshader';
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle',`--use-angle=${gpu}`]}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${base}/${out}/fixture.html`);await page.waitForFunction(()=>window.result,null,{timeout:60000});
  const result=await page.evaluate(()=>window.result);assert.ok(result.ready,`${name}: warmup completed`);assert.ok(result.prepared,`${name}: first visible painted hull must reuse a prepared program: ${JSON.stringify(result)}`);
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}.json`,JSON.stringify(result,null,2));console.log(name,JSON.stringify(result));
 }finally{await browser.close();}
}
