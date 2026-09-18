import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {test} from 'node:test';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../vendor/three.module.min.js',import.meta.url).href:specifier,context);}});
const THREE=await import('three');
const {GameSession}=await import('../src/game/game.js');
const {SpaceRenderer,isAppleTouchDevice,renderBaseWidth,sceneQualityForDevice,IOS_INITIAL_SCALE}=await import('../src/game/render.js');
const {FrameBudget,flightFrameRate}=await import('../src/game/frameBudget.js');
const {createRingVolume}=await import('../src/game/ringVolume.js');
const {AudioManager}=await import('../src/game/audio.js');
const {createNewSave,hydrateSave}=await import('../src/game/save.js');
const {LOCATIONS}=await import('../src/game/data.js');

function frameSession(touch=true,powerMode='auto') {
    const s=Object.create(GameSession.prototype);s.save=createNewSave(41);s.save.player.dockedAt=undefined;s.save.settings.powerMode=powerMode;
    s.lastFrame=0;s.simAccumulator=0;s.ships=[];s.deathTimer=0;
    s.ui={isModalOpen:false};s.renderer={touchDevice:touch,renderRevision:0};
    s.input={getActions(){return {};}};s.refreshStoryLine=()=>{};s.updateTutorialRadio=()=>{};
    s.handleActions=()=>{};s.playerStats=()=>({hull:185,afterburnSpeed:100});s.currentNavLocationIds=()=>[];
    s.hyperdriveFxState=()=>({fx:'idle',progress:0});s.lastHudUpdate=Infinity;
    for(const method of ['setHyperdriveFx','updateCamera','setDamageWarning','syncShips','syncProjectiles','syncPickups','render'])s.renderer[method]=()=>{};
    s.audio={calls:0,update(){this.calls++;}};
    s.steps=0;s.draws=[];
    s.updateSimulation=dt=>{s.steps++;s.save.world.time+=dt;};
    s.syncRender=(dt,now)=>{s.draws.push({dt,now});GameSession.prototype.syncRender.call(s,dt,now);};
    return s;
}
test('phone rendering is bounded at 30 fps on 60/90/120 Hz screens without slowing simulation or dropping taps',()=>{
    for(const refresh of [60,90,120]){
        for(const mode of ['auto','battery','performance']){
            const s=frameSession(true,mode);let consumed=false,taps=0;
            s.input.getActions=()=>({fireGroup:!consumed && (consumed=true)});
            s.handleActions=actions=>{if(actions.fireGroup)taps++;};
            for(let frame=1;frame<=refresh*10;frame++)s.updateFrame(frame*1000/refresh);
            const target=mode==='performance'?600:300;
            assert.ok(Math.abs(s.draws.length-target)<=1,`${refresh} Hz ${mode}: ${s.draws.length} draws`);
            assert.equal(s.renderFrameCount,s.draws.length,'benchmark counts actual submissions, not callbacks');
            assert.ok(s.steps>=599 && s.steps<=600,`${s.steps} simulation steps`);
            assert.ok(Math.abs(s.save.world.time-10)<0.02);
            assert.equal(taps,1);
            assert.ok(s.draws.every(draw=>draw.dt>0 && draw.dt<0.06));
        }
    }
    assert.equal(flightFrameRate('auto',false),60);
    const saved=createNewSave(3);saved.settings.powerMode='battery';
    assert.equal(hydrateSave(JSON.parse(JSON.stringify(saved))).settings.powerMode,'battery');
    delete saved.settings.powerMode;
    assert.equal(hydrateSave(JSON.parse(JSON.stringify(saved))).settings.powerMode,'auto');
});
test('iPhone and desktop-mode iPad use the bounded render profile without changing Android',()=>{
    assert.equal(isAppleTouchDevice({ platform: 'iPhone', userAgent: 'Mozilla/5.0' }), true);
    assert.equal(isAppleTouchDevice({ platform: 'MacIntel', userAgent: 'Macintosh', maxTouchPoints: 5 }), true);
    assert.equal(isAppleTouchDevice({ platform: 'Linux armv8l', userAgent: 'Android', maxTouchPoints: 5 }), false);
    assert.equal(isAppleTouchDevice({ platform: 'MacIntel', userAgent: 'Macintosh', maxTouchPoints: 0 }), false);

    assert.equal(renderBaseWidth({ qualityMode: 'high', isIOS: true, touchDevice: true, viewportWidth: 1000 }), 640, 'iOS high mode is capped at the reduced phone render width');
    assert.equal(sceneQualityForDevice({ qualityMode: 'high', isIOS: true }), 'low', 'iOS high mode uses the low-density environment profile');
    assert.equal(sceneQualityForDevice({ qualityMode: 'high', isIOS: false }), 'high', 'Android high mode keeps its dense environment profile');
    assert.equal(IOS_INITIAL_SCALE, 0.82, 'iOS starts below full render scale so the governor can recover quickly');
    assert.equal(renderBaseWidth({ qualityMode: 'high', isIOS: false, touchDevice: true, viewportWidth: 1000 }), 1280, 'Android high mode keeps its existing render tier');
    const ios = Object.create(SpaceRenderer.prototype);
    ios.isIOS = true;
    assert.equal(ios.bloomEnabled(), false, 'iOS does not pay for HDR bloom');
    const appleMaterial = { bumpMap: {}, normalMap: {}, roughnessMap: {}, metalnessMap: {}, needsUpdate: false };
    ios.simplifyAppleMaterial(appleMaterial);
    assert.equal(appleMaterial.bumpMap, null, 'iOS removes bump-map shader work');
    assert.equal(appleMaterial.roughnessMap, null, 'iOS removes scalar-map shader work');
    assert.equal(appleMaterial.needsUpdate, true);

    const android = Object.create(SpaceRenderer.prototype);
    android.isIOS = false;
    android.qualityMode = 'high';
    android.lastQualityScale = 1;
    assert.equal(android.bloomEnabled(), true, 'Android keeps the high-fidelity bloom path');
});
test('iOS renders directly when the Azure ring volume is not active',()=>{
    const r=Object.create(SpaceRenderer.prototype);
    r.contextLost=false;r.isIOS=true;r.qualityMode='high';r.scene=new THREE.Scene();
    r.camera=new THREE.PerspectiveCamera(60,2,0.1,1000);r.viewProjection=new THREE.Matrix4();r.viewFrustum=new THREE.Frustum();
    r.atmosphereShells=[];r.instanceRoots=new Map();r.locationMeshes=new Map();r.ringVolumeEnabled=false;
    r.updateWorldVisuals=()=>{};
    let calls=0;let targetChanges=0;
    r.renderer={setRenderTarget(){targetChanges++;},render(){calls++;}};
    r.render();
    assert.equal(calls,1,'iOS submits one scene pass without bloom or a copy quad');
    assert.equal(targetChanges,1,'iOS selects the default framebuffer directly');
    assert.equal(r.bloomSceneTarget,undefined,'iOS does not allocate an HDR target for ordinary flight');
});
test('paused and hidden flight does no continuous rendering, redraws once on resize, and resumes without catch-up',()=>{
    const s=frameSession();s.updateFrame(17);const draws=s.draws.length,steps=s.steps;
    s.ui.isModalOpen=true;
    for(let now=34;now<=10000;now+=17)s.updateFrame(now);
    assert.equal(s.draws.length,draws);assert.equal(s.steps,steps);
    s.renderer.renderRevision++;s.updateFrame(10017);s.updateFrame(10034);
    assert.equal(s.draws.length,draws+1);assert.equal(s.draws.at(-1).dt,0);
    globalThis.document={hidden:true};const audioCalls=s.audio.calls;
    try {s.updateFrame(60000);assert.equal(s.audio.calls,audioCalls);assert.equal(s.steps,steps);}
    finally {delete globalThis.document;}
    s.ui.isModalOpen=false;s.updateFrame(60017);
    assert.equal(s.draws.length,draws+2);assert.ok(s.steps-steps<=2);
    s.save.player.dockedAt='helix';const dockDraws=s.draws.length;
    s.updateFrame(60100);assert.equal(s.draws.length,dockDraws);
});
test('render scheduling handles jitter and stalls without a burst of queued frames',()=>{
    const budget=new FrameBudget();let frames=0;
    for(let i=0;i<1200;i++)if(budget.take(i*1000/120+Math.sin(i)*0.4,30)!==null)frames++;
    assert.ok(frames>=299 && frames<=301);
    assert.equal(budget.take(100000,30),0.1);
    assert.equal(budget.take(100000,30),null);
    assert.equal(budget.take(100001,60),1/60,'changing mode takes effect immediately');
});
test('moving collision geometry keeps its full simulation rate while cosmetic work is batched',()=>{
    const r=Object.create(SpaceRenderer.prototype);
    r.skyTime=0;r.instanceRoots=new Map([['shardbelt',{visible:true}],['mourning-line',{visible:true}]]);
    r.asteroids=[{moving:true,position:LOCATIONS.shardbelt.position.slice(),velocity:[3,0,0],rotation:[0,0,0],rotationSpeed:[1,0,0]}];
    r.graveyard=[{moving:true,position:[0,0,0],drift:[0,2,0],rotation:[0,0,0],spin:[0,0,1]}];
    r.jumpPointVisuals=[];r.locationMeshes=new Map();
    let cosmetics=0,fxTime=0;
    r.updateHyperdriveFx=dt=>{cosmetics++;fxTime+=dt;};r.updateWreckNodeInstances=()=>{};r.updateEffects=()=>{};
    for(let i=1;i<=60;i++){r.updateWorld(1/60);if(i%2===0)r.updateWorldVisuals();}
    assert.ok(Math.abs(r.asteroids[0].position[0]-LOCATIONS.shardbelt.position[0]-3)<1e-6);
    assert.ok(Math.abs(r.graveyard[0].position[1]-2)<1e-9);
    assert.ok(Math.abs(r.graveyard[0].rotation[2]-1)<1e-9);
    assert.equal(cosmetics,30);assert.ok(Math.abs(fxTime-1)<1e-9);
    r.updateWorldVisuals();assert.equal(cosmetics,30,'no simulation time means no cosmetic animation work');
});
test('ring bounds reject offscreen ray marching and keep overhead and inside-ring views',()=>{
    const surface=new THREE.Mesh();surface.material.uniforms={uRingMap:{value:null},uSunDirection:{value:new THREE.Vector3(1,1,0).normalize()},uTint:{value:new THREE.Color()},uPlanetCenter:{value:new THREE.Vector3()}};
    const volume=createRingVolume(surface,100,true);
    const r=Object.create(SpaceRenderer.prototype);r.camera=new THREE.PerspectiveCamera(60,2.2,0.1,100000);
    r.camera.position.set(0,0,1000);r.viewProjection=new THREE.Matrix4();r.viewFrustum=new THREE.Frustum();
    r.instanceRoots=new Map();r.locationMeshes=new Map([['azure',{visible:true}]]);r.atmosphereShells=[];
    r.ringVolume=volume;r.ringVolumeEnabled=true;r.hyperdriveFxRoot={visible:false};r.bloomCamera=new THREE.Camera();
    r.bloomSceneTarget={width:100,height:50,texture:{},depthTexture:{}};r.bloomBlurTargets=[{texture:{}},{texture:{}}];
    const material=()=>({uniforms:{uResolution:{value:new THREE.Vector2()},uDirection:{value:new THREE.Vector2()},tDiffuse:{},uExposure:{},tScene:{},tBloom:{},uStrength:{}}});
    r.bloomCompositeMaterial=material();r.bloomBrightMaterial=material();r.bloomBlurMaterial=material();r.bloomQuad={};
    r.qualityMode='high';let calls=0;r.renderer={toneMappingExposure:1,setRenderTarget(){},render(){calls++;}};
    r.ringParticles={update(){return false;}};
    r.camera.lookAt(0,0,2000);r.render();assert.equal(calls,5,'scene, three bloom passes and composite only');
    calls=0;r.camera.lookAt(0,0,0);r.render();assert.equal(calls,6,'visible ring adds its volume pass');
    calls=0;r.camera.position.set(200,0,0);r.camera.lookAt(200,100,0);r.render();assert.equal(calls,6,'horizontal inside-ring view retains its volume');
    r.ringVolumeTarget?.dispose();volume.mesh.geometry.dispose();volume.mesh.material.dispose();
});
test('constant engine settings stop adding duplicate audio automation, changes still apply',()=>{
    const a=Object.create(AudioManager.prototype);a.context={currentTime:0};a.enabled=true;a.musicContext='open';a.currentContext='open';
    a.dangerLevel=0;a.musicTimer=100;a.musicVolume=0;a.effectsVolume=0.68;
    let calls=0;const parameter=()=>({setTargetAtTime(){calls++;},cancelScheduledValues(){}});
    for(const name of ['engineGain','engineWashGain','stationGain'])a[name]={gain:parameter()};
    for(const name of ['engineOscA','engineOscB','engineSub','engineFilter','engineWashFilter'])a[name]={frequency:parameter()};
    for(let i=0;i<600;i++){a.context.currentTime=i/60;a.update(1/60,0.5,false,0,0,'open');}
    assert.equal(calls,8,'one target per AudioParam rather than 4,800 duplicate calls');
    a.update(1/60,0.8,true,0,0,'open');assert.equal(calls,15);
    a.stationMode=true;a.currentContext='station';a.update(1/60,0.8,true,0,0,'open');
    const stopped=calls;assert.ok(stopped>15);
    a.stationMode=false;a.currentContext='open';a.update(1/60,0.8,true,0,0,'open');assert.ok(calls>stopped);
});
