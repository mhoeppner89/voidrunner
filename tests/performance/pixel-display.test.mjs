import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {pixelRenderSize} from '../../src/game/retroDisplay.js';
import {createPixelResolveMaterial,pixelTargetSamples} from '../../src/game/pixelResolve.js';
import {SpaceRenderer} from '../../src/game/render.js';

test('logical pixels upscale by whole numbers across desktop, phone and quality changes',()=>{
 for(const [w,h,desired]of [[1440,900,960],[1920,1080,1280],[750,342,525],[915,412,720],[390,844,390],[2560,1440,960]]){
  const s=pixelRenderSize(w,h,desired);assert.ok(Number.isInteger(s.scale));assert.ok(s.width<=desired);assert.ok(s.width*s.scale>=w&&s.width*s.scale-w<s.scale);assert.ok(s.height*s.scale>=h&&s.height*s.scale-h<s.scale);
 }
 assert.deepEqual(pixelRenderSize(1440,900,900),pixelRenderSize(1440,900,880),'small adaptive-quality changes must not resize the render buffers');
});
test('pixel resolve reuses buffers each frame and releases the previous target only when resizing',()=>{
 const r=Object.create(SpaceRenderer.prototype);r.renderer={domElement:{width:640,height:360}};
 r.ensurePixelPipeline();const target=r.pixelSceneTarget,material=r.pixelResolveMaterial,geometry=r.pixelQuad.geometry;let disposed=0;target.addEventListener('dispose',()=>disposed++);
 for(let i=0;i<120;i++)r.ensurePixelPipeline();assert.equal(r.pixelSceneTarget,target);assert.equal(r.pixelResolveMaterial,material);assert.equal(r.pixelQuad.geometry,geometry);assert.equal(disposed,0);
 r.renderer.domElement.width=720;r.ensurePixelPipeline();assert.equal(disposed,1);assert.notEqual(r.pixelSceneTarget,target);assert.equal(r.pixelSceneTarget.width,720);assert.equal(r.pixelResolveMaterial,material);
 r.pixelSceneTarget.dispose();material.dispose();geometry.dispose();
});
test('scene edges use only supported, bounded multisampling',()=>{
 const renderer=counts=>({getContext:()=>({getInternalformatParameter:()=>counts})});
 assert.equal(pixelTargetSamples(renderer(new Int32Array([8,4,2]))),2);assert.equal(pixelTargetSamples(renderer([8,4])),0);assert.equal(pixelTargetSamples(renderer([8])),0);assert.equal(pixelTargetSamples({}),0);
 const m=createPixelResolveMaterial();assert.equal(m.uniforms.uStrength.value,0,'the phone resolve has no bloom work');assert.equal(m.toneMapped,false);m.dispose();
});
test('painted pixel textures keep close pixels but blend between distant mip levels',()=>{
 const r=Object.create(SpaceRenderer.prototype);r.pixelTextures=new Set();r.renderer={capabilities:{getMaxAnisotropy:()=>16}};
 const texture=r.configurePixelTexture(new THREE.Texture());assert.equal(texture.magFilter,THREE.NearestFilter);assert.equal(texture.minFilter,THREE.LinearMipmapLinearFilter);assert.equal(texture.anisotropy,4);assert.ok(texture.generateMipmaps);texture.dispose();
});

test('display installation keeps source artwork and instruments free from colour conversion',async()=>{
 const {installRetroDisplay}=await import('../../src/game/retroDisplay.js');
 const root={style:{removeProperty:key=>assert.equal(key,'filter')},dataset:{}};
 installRetroDisplay(root);assert.equal(root.dataset.pixelFinish,'native');
 assert.equal(root.retroSpriteObserver,undefined,'no mutation observer or sprite conversion pipeline');
});
