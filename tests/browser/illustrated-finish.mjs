// Real WebGL regression checks: contours, transparency, lighting and the
// concourse background. Every profile is muted; no career save is loaded.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit,devices} from 'playwright';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/illustrated-finish';
await mkdir(out,{recursive:true});
await writeFile(`${out}/fixture.html`,`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,">
<script type="importmap">{"imports":{"three":"/vendor/three.module.min.js"}}</script>
<script type="module">
import * as T from 'three';
const originalPhysical=T.ShaderChunk.lights_physical_pars_fragment;
const {createPixelResolveMaterial,createPixelSceneTarget,bindPixelResolve}=await import('/src/game/pixelResolve.js');
const {createConcourseFinish}=await import('/src/game/concourseFinish.js');
const size=64,r=new T.WebGLRenderer({antialias:false,alpha:true,preserveDrawingBuffer:true});
r.setSize(size,size);r.setPixelRatio(1);r.outputColorSpace=T.SRGBColorSpace;document.body.append(r.domElement);
const output=new T.WebGLRenderTarget(size,size,{depthBuffer:false,stencilBuffer:false});
const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1,.1,100);camera.position.z=5;
const quadCamera=new T.Camera(),quad=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial());quad.frustumCulled=false;
const target=createPixelSceneTarget(size,size,0);
const pixels=()=>{const a=new Uint8Array(size*size*4);r.readRenderTargetPixels(output,0,0,size,size,a);return a;};
const at=(a,x,y)=>Array.from(a.slice((y*size+x)*4,(y*size+x)*4+4));
const light=c=>c[0]+c[1]+c[2];
function resolveScene(preserveAlpha){
 const finish=createPixelResolveMaterial({preserveAlpha});quad.material=finish;
 r.setRenderTarget(target);r.clear();r.render(scene,camera);bindPixelResolve(finish,target.texture,target,camera,1.18);
 r.setRenderTarget(output);r.clear();r.render(quad,quadCamera);return pixels();
}
const plane=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({color:0x80b0e0}));scene.add(plane);
scene.background=new T.Color(0x102040);const img=resolveScene(false),row=32,bg=at(img,0,row),center=at(img,32,row);
let left=0;while(left<size&&light(at(img,left,row))===light(bg))left++;
const edge=at(img,left,row),inside=at(img,left+5,row),sky=at(img,2,row);
scene.background=null;r.setClearColor(0,0);const transparent=resolveScene(true);

// The ship alpha changes only the ship edge; the painted background and
// non-concourse transit pixels must be untouched by that silhouette effect.
const shipData=new Uint8Array(size*size*4),backData=new Uint8Array(size*size*4);
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const i=(y*size+x)*4,opaque=x>=16&&x<48&&y>=16&&y<48;
 shipData[i]=shipData[i+1]=shipData[i+2]=opaque?128:0;shipData[i+3]=opaque?255:0;
 backData[i]=40;backData[i+1]=70;backData[i+2]=120;backData[i+3]=255;
}
const tex=data=>{const t=new T.DataTexture(data,size,size,T.RGBAFormat);t.magFilter=t.minFilter=T.NearestFilter;t.needsUpdate=true;return t;};
const finish=createConcourseFinish();finish.uniforms.tScene.value=tex(shipData);finish.uniforms.tBackdrop.value=tex(backData);
finish.uniforms.uHasBackdrop.value=1;finish.uniforms.uSceneResolution.value.set(size,size);finish.uniforms.uExposure.value=1;
quad.material=finish;r.setRenderTarget(output);r.clear();r.render(quad,quadCamera);const dock=pixels();
finish.uniforms.uConcourse.value=0;r.clear();r.render(quad,quadCamera);const transit=pixels();

// Compare identical materials and lighting, bypassing the patched direct
// lighting chunk only for one reference material.
const litScene=new T.Scene(),ambient=new T.AmbientLight(0xffffff,.05),sun=new T.DirectionalLight(0xffffff,2.0);
sun.position.set(Math.sqrt(1-.13*.13),0,.13);litScene.add(ambient,sun);
const material=new T.MeshStandardMaterial({color:0xb5a080,roughness:1,metalness:0});
const reference=material.clone();reference.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <lights_physical_pars_fragment>',originalPhysical);};
reference.customProgramCacheKey=()=> 'unmodified-light-reference';
const litPlane=new T.Mesh(new T.PlaneGeometry(2,2),material);litScene.add(litPlane);
function lightPixel(m){litPlane.material=m;r.setRenderTarget(output);r.clear();r.render(litScene,camera);return at(pixels(),32,32);}
const styledLight=lightPixel(material),referenceLight=lightPixel(reference);
window.fixture={bg,sky,center,left,edge,inside,transparentSky:at(transparent,0,row),transparentCenter:at(transparent,32,row),
 dockBackground:at(dock,3,3),dockEdge:at(dock,16,32),dockCenter:at(dock,32,32),
 transitEdge:at(transit,16,32),transitCenter:at(transit,32,32),styledLight,referenceLight};
</script>`);

for(const [name,engine,device] of [
 ['desktop',chromium,{viewport:{width:960,height:540}}],
 ['android',chromium,devices['Pixel 7 landscape']],
 ['iphone',webkit,devices['iPhone 13 landscape']],
]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(45000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${base}/${out}/fixture.html`);await page.waitForFunction(()=>window.fixture);
  const result=await page.evaluate(()=>window.fixture),sum=rgb=>rgb[0]+rgb[1]+rgb[2];
  assert.deepEqual(result.sky,result.bg,'sky must not receive an outline');
  assert.ok(result.left>0&&result.left<32,JSON.stringify(result));
  assert.ok(sum(result.edge)<sum(result.inside)*.85,JSON.stringify({name,result}));
  assert.equal(result.transparentSky[3],0);assert.equal(result.transparentCenter[3],255);
  assert.deepEqual(result.dockBackground.slice(0,3),[40,70,120]);
  assert.ok(sum(result.dockEdge)<sum(result.dockCenter)*.85,JSON.stringify({name,result}));
  assert.deepEqual(result.transitEdge,result.transitCenter,'concourse outline does not alter transit');
  assert.notDeepEqual(result.styledLight,result.referenceLight,'direct-light response must differ from the unmodified material');
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}.json`,JSON.stringify(result,null,2));console.log(name,JSON.stringify(result));
 }finally{await browser.close();}
}
