import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {test} from 'node:test';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../../vendor/three.module.min.js',import.meta.url).href:specifier,context);}});
const THREE=await import('three');
const {GameSession}=await import('../../src/game/game.js');
const {SpaceRenderer,isAppleTouchDevice,renderBaseWidth,sceneQualityForDevice,IOS_INITIAL_SCALE}=await import('../../src/game/render.js');
const {FrameBudget,flightFrameRate}=await import('../../src/game/frameBudget.js');
const {createRingVolume}=await import('../../src/game/ringVolume.js');
const {AudioManager}=await import('../../src/game/audio.js');
const {ShipEngineAudio}=await import('../../src/game/audioEngine.js');
const {createNewSave,hydrateSave}=await import('../../src/game/save.js');
const {LOCATIONS}=await import('../../src/game/data.js');

function frameSession(touch=true,powerMode='auto') {
    const s=Object.create(GameSession.prototype);s.save=createNewSave(41);s.save.player.dockedAt=undefined;s.save.settings.powerMode=powerMode;
    s.lastFrame=0;s.simAccumulator=0;s.ships=[];s.deathTimer=0;
    s.ui={isModalOpen:false};s.renderer={touchDevice:touch,renderRevision:0};
    s.input={setGamepadBlocked(blocked){this.gamepadBlocked=blocked;},getActions(){return {};}};s.refreshStoryLine=()=>{};s.updateTutorialRadio=()=>{};
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
test('iOS uses the bounded pixel resolve without bloom when the ring volume is inactive',()=>{
    const r=Object.create(SpaceRenderer.prototype);
    r.contextLost=false;r.isIOS=true;r.qualityMode='high';r.scene=new THREE.Scene();
    r.camera=new THREE.PerspectiveCamera(60,2,0.1,1000);r.viewProjection=new THREE.Matrix4();r.viewFrustum=new THREE.Frustum();
    r.atmosphereShells=[];r.instanceRoots=new Map();r.locationMeshes=new Map();r.ringVolumeEnabled=false;
    r.updateWorldVisuals=()=>{};
    let calls=0;let targetChanges=0;
    r.renderer={setRenderTarget(){targetChanges++;},render(){calls++;}};
    r.renderPixelScene=()=>{r.renderer.setRenderTarget({});r.renderer.render(r.scene,r.camera);r.renderer.setRenderTarget(null);r.renderer.render({},{});};
    r.render();
    assert.equal(calls,2,'iOS submits one scene and one bounded pixel resolve');
    assert.equal(targetChanges,2,'iOS resolves its logical scene target to the framebuffer');
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
test('flight preparation does not run combat or submit flight frames under the loading screen',()=>{
    const s=frameSession();s.flightPrepared=false;let handled=0;
    s.handleActions=()=>handled++;
    for(let now=50;now<=5000;now+=50)s.updateFrame(now);
    assert.equal(s.steps,0,'simulation must wait for flight readiness');
    assert.equal(s.draws.length,0,'warmup is the only renderer active while loading');
    assert.equal(handled,0,'flight actions cannot run while loading');
    assert.equal(s.audio.calls,0,'the flight audio loop waits too');
    s.flightPrepared=true;s.updateFrame(5017);
    assert.ok(s.steps<=2,'loading time must not cause a simulation catch-up');
    assert.equal(s.draws.length,1,'flight starts rendering on the first ready frame');
});
test('auto quality reacts to real elapsed time during severe stalls without treating a pause as slow flight',()=>{
    const s=frameSession();s.save.settings.quality='auto';s.qualityScale=1;s.fpsFrames=0;s.fpsAccumulator=0;
    s.renderer.setQualityScale=value=>{s.renderer.lastQualityScale=value;};
    for(const now of [1,501,1001,1501])s.updateFrame(now);
    assert.ok(s.qualityScale<1,'a 2 fps flight must reduce render load within the first 1.5 s');
    const beforePause=s.qualityScale;s.ui.isModalOpen=true;
    for(let now=1601;now<=5001;now+=100)s.updateFrame(now);
    s.ui.isModalOpen=false;
    for(let now=5018;now<=6218;now+=17)s.updateFrame(now);
    assert.ok(s.qualityScale>=beforePause,'time spent in a menu is not counted as slow flight');
});
test('observer flight uses the same adaptive quality sampling',()=>{
    const s=frameSession();s.save.settings.quality='auto';s.qualityScale=1;s.fpsFrames=0;s.arena={observer:true};
    s.renderer.setQualityScale=value=>{s.renderer.lastQualityScale=value;};
    s.renderer.setCockpitVisible=()=>{};s.renderer.updateObserverCamera=()=>{};
    s.updateObserverFocus=()=>[0,0,0];s.observerViewModel=()=>({});s.ui.updateObserverView=()=>{};
    for(const now of [1,501,1001,1501])GameSession.prototype.syncRender.call(s,.1,now);
    assert.ok(s.qualityScale<1,'a slow observer view should use the existing auto quality governor');
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
    const material=()=>({uniforms:{uResolution:{value:new THREE.Vector2()},uDirection:{value:new THREE.Vector2()},tDiffuse:{},uExposure:{},tScene:{},tDepth:{},uNearFar:{value:new THREE.Vector2()},tBloom:{},uStrength:{}}});
    r.bloomCompositeMaterial=material();r.bloomBrightMaterial=material();r.bloomBlurMaterial=material();r.bloomQuad={};
    r.qualityMode='high';let calls=0;r.renderer={toneMappingExposure:1,setRenderTarget(){},render(){calls++;}};
    r.ringParticles={update(){return false;}};
    r.camera.lookAt(0,0,2000);r.render();assert.equal(calls,5,'scene, three bloom passes and composite only');
    calls=0;r.camera.lookAt(0,0,0);r.render();assert.equal(calls,6,'visible ring adds its volume pass');
    calls=0;r.camera.position.set(200,0,0);r.camera.lookAt(200,100,0);r.render();assert.equal(calls,6,'horizontal inside-ring view retains its volume');
    calls=0;r.camera.position.set(0,0,150);r.camera.lookAt(0,0,300);r.render();
    assert.ok(r.viewFrustum.intersectsSphere(volume.bounds));
    assert.equal(calls,5,'looking away above the ring skips its full-screen pass');
    r.ringParticles.update=()=>true;calls=0;r.render();
    assert.equal(calls,7,'a lingering cockpit particle still composites over the scene');
    r.ringParticles.update=()=>false;
    r.qualityMode='low';calls=0;r.render();
    assert.equal(calls,2,'Low uses the scene and colour resolve only');
    assert.equal(r.pixelSceneTarget,undefined,'switching off bloom reuses the existing HDR colour and depth');
    assert.equal(r.bloomCompositeMaterial.uniforms.tScene.value,r.bloomSceneTarget.texture);
    assert.equal(r.bloomCompositeMaterial.uniforms.tDepth.value,r.bloomSceneTarget.depthTexture);
    assert.equal(r.bloomCompositeMaterial.uniforms.uStrength.value,0);
    r.qualityMode='high';calls=0;r.render();
    assert.equal(calls,5);assert.equal(r.bloomCompositeMaterial.uniforms.uStrength.value,.6);
    r.ringVolumeTarget?.dispose();volume.mesh.geometry.dispose();volume.mesh.material.dispose();
});
test('steady engine settings stop adding audio automation, changes still apply',()=>{
    let calls=0;const parameter=()=>({setTargetAtTime(){calls++;},cancelScheduledValues(){}});
    const manager=Object.create(AudioManager.prototype);Object.assign(manager,{context:{currentTime:0},stationMode:false,play(){},bank:{loopSource(){}}});
    const engine=Object.create(ShipEngineAudio.prototype);
    Object.assign(engine,{manager,spool:0,burn:0,turnLevel:0,lastTurn:0,voices:Array.from({length:8},()=>({gain:{gain:parameter()},source:{playbackRate:parameter()}})),
        filter:{frequency:parameter()},rushGain:{gain:parameter()},rushFilter:{frequency:parameter()},hissGain:{gain:parameter()},hissPan:{pan:parameter()}});
    const flight={speed:0.5,turn:0,yaw:0,hyper:false};
    const run=(frames,throttle,burn)=>{for(let i=0;i<frames;i++){manager.context.currentTime+=1/60;engine.update(1/60,throttle,burn,0,0,flight);}};
    // The reactor spools up, then every layer holds its level: no further scheduling.
    run(900,0.5,false);const settled=calls;assert.ok(settled>0&&settled<900,'spool-up schedules a bounded number of targets');
    run(600,0.5,false);assert.equal(calls,settled,'steady flight adds no audio automation');
    run(1,0.9,true);assert.ok(calls>settled,'throttle and afterburner changes still reach the graph');
    // Hostile input (negative or NaN steps, NaN flight state) never reaches an AudioParam.
    const seen=[];for(const voice of engine.voices)voice.gain.gain.setTargetAtTime=value=>{calls++;seen.push(value);};
    engine.update(-0.02,NaN,true,NaN,NaN,{speed:NaN,turn:NaN,yaw:NaN});engine.update(NaN,2,false,5,-3,undefined);
    assert.ok(seen.every(Number.isFinite));assert.ok(engine.spool>=0&&engine.spool<=1&&engine.burn>=0&&engine.burn<=1);
    // Docking silences every continuous layer at once.
    const before=calls;manager.stationMode=true;engine.silence();assert.ok(calls>=before+10);
});


test('controller menus suppress flight commands and disconnect pauses before simulation',()=>{
    const s=frameSession();
    s.ui.isModalOpen=true;s.updateFrame(17);
    assert.equal(s.input.gamepadBlocked,true);assert.equal(s.steps,0);
    s.ui.isModalOpen=false;s.ui.controller={blocksFlight:true};s.updateFrame(34);
    assert.equal(s.input.gamepadBlocked,true);
    s.ui.controller.blocksFlight=false;s.updateFrame(51);
    assert.equal(s.input.gamepadBlocked,false);
    const steps=s.steps;let notices=0;
    s.ui.showPause=()=>{s.ui.isModalOpen=true;};s.ui.showToast=()=>notices++;
    s.input.getActions=()=>({controllerDisconnected:true});s.updateFrame(68);
    assert.equal(s.ui.isModalOpen,true);assert.equal(s.steps,steps);assert.equal(notices,1);
    s.ui.isModalOpen=false;s.openShipMenu=()=>{s.ui.isModalOpen=true;};
    s.input.getActions=()=>({shipMenu:true});s.updateFrame(85);
    assert.equal(s.ui.isModalOpen,true);assert.equal(s.steps,steps);
});

test('auto promotes sustained headroom and falls back under load with a cooldown', () => {
    const budget = new FrameBudget();
    let now = 0;
    const run = (seconds, hz, cost, touch = true) => {
        const end = now + seconds * 1000;
        while (now < end) {
            now += 1000 / hz;
            const draw = budget.take(now, budget.target('auto', touch)) !== null;
            budget.observe(now, draw ? cost : 1, draw, touch);
        }
    };
    run(14, 60, 13);
    assert.equal(budget.target('auto', true), 30, 'busy submitted frames prevent promotion');
    run(14, 60, 5);
    assert.equal(budget.target('auto', true), 60);
    assert.equal(budget.target('battery', true), 30);
    run(2, 35, 5);
    run(4, 60, 5);
    assert.equal(budget.target('auto', true), 60, 'one slow window does not drop a healthy flight');
    run(6, 42, 5);
    assert.equal(budget.target('auto', true), 30, 'missed vsyncs reveal load outside JavaScript');
    run(25, 60, 5);
    assert.equal(budget.target('auto', true), 30, 'brief recovery cannot cause flapping');
    assert.equal(budget.target('performance', true), 60);
    budget.clear();
    run(14, 120, 2, false);
    assert.ok(budget.target('auto', false) >= 119, 'cheap desktop frames follow high refresh');
    budget.clear();
    assert.equal(budget.target('auto', false), 60);
});

test('auto cadence counts delivered frames, and menus cannot skip the cooldown', () => {
    const budget = new FrameBudget();
    let now = 0;
    const promote = (seconds = 14) => {
        for (const end = now + seconds * 1000; now < end;) {
            now += 1000 / 60;
            const draw = budget.take(now, budget.target('auto', true)) !== null;
            budget.observe(now, draw ? 5 : 1, draw, true);
        }
        assert.equal(budget.target('auto', true), 60);
    };
    promote();
    // A 120 Hz panel firing callbacks in a 1, 1, 4 tick rhythm: 60 callbacks
    // but only 40 delivered frames per second.
    const tick = 1000 / 120;
    for (let i = 0; i < 300; i++) {
        now += tick * [1, 1, 4][i % 3];
        const draw = budget.take(now, budget.target('auto', true)) !== null;
        budget.observe(now, draw ? 2 : 1, draw, true);
    }
    assert.equal(budget.target('auto', true), 30, 'missed submissions downshift although callbacks keep coming');
    // Opening the map resets timing each frame; cheap frames afterwards must
    // still wait out the 30 s cooldown.
    budget.reset();
    for (const end = now + 14000; now < end;) {
        now += 1000 / 60;
        const draw = budget.take(now, budget.target('auto', true)) !== null;
        budget.observe(now, draw ? 5 : 1, draw, true);
    }
    assert.equal(budget.target('auto', true), 30, 'cooldown survives a menu reset');
    promote(30);
    budget.restart();
    assert.equal(budget.target('auto', true), 30, 'a new launch starts at the safe rate');
});

test('slightly faster than nominal refresh does not accumulate phase error', () => {
    for (const target of [30, 60]) {
        const budget = new FrameBudget();
        let previous;
        for (let i = 0; i < 3600; i++) {
            const now = Math.round(i * 10000 / 60.02) / 10;
            if (budget.take(now, target) === null) continue;
            if (previous !== undefined) assert.ok(Math.abs(now - previous - 1000 / target) < 0.2);
            previous = now;
        }
    }
});

test('recorded WebKit callbacks keep every 30 fps draw two refreshes apart', () => {
    // Millisecond callback intervals from the two 5.5 s WebKit review traces.
    const traces = [
        '0 18 15 17 16 17 16 18 16 17 16 19 15 19 13 18 16 18 16 17 18 15 17 15 17 18 16 17 17 15 18 17 16 17 19 14 16 19 15 17 19 14 17 17 16 16 18 16 17 16 18 16 17 16 17 17 16 17 17 16 17 17 16 16 19 15 17 17 18 14 18 16 17 17 16 19 13 18 19 15 15 18 18 15 19 15 16 17 15 18 18 16 16 17 16 18 16 18 15 19 15 16 16 16 18 19 15 16 18 15 18 16 15 18 18 16 16 17 18 15 17 17 16 17 15 19 16 17 16 17 17 17 16 17 16 18 16 15 18 17 16 16 19 15 16 19 16 14 18 19 15 16 17 17 17 17 15 18 16 17 17 16 17 19 14 16 19 15 17 17 16 17 17 16 17 16 17 17 16 17 15 19 16 18 16 16 17 17 18 15 17 16 17 16 16 18 19 14 17 18 15 15 19 16 18 15 18 16 15 18 16 16 18 18 16 15 18 15 19 16 19 14 17 17 16 17 18 15 15 19 17 16 16 19 13 19 17 15 18 15 18 18 14 18 17 15 19 16 16 17 18 16 16 18 15 17 17 16 18 16 15 19 16 15 17 19 15 17 17 16 17 18 14 18 17 16 15 18 16 19 16 16 18 16 17 16 17 16 17 17 16 17 16 18 16 17 16 17 17 16 19 15 16 16 18 15 18 17 16 18 16 16 16 18 17 16 17 15 17 16 18 19 15 16 19 18 12 19 16 15 18',
        '0 17 16 17 17 16 19 15 18 15 16 16 18 16 18 15 18 17 16 19 14 17 17 19 14 17 17 16 17 15 18 19 15 15 18 15 19 16 17 18 15 15 18 19 14 17 17 17 15 19 16 16 19 13 18 17 16 17 15 19 15 19 16 16 18 14 18 17 15 17 18 17 16 17 17 15 18 18 14 18 18 15 19 14 17 16 16 18 17 16 17 16 17 17 17 15 18 19 14 17 17 16 17 17 16 17 17 15 17 19 16 17 14 18 19 14 19 15 17 17 16 17 16 19 15 17 16 17 16 17 17 16 17 18 15 19 15 16 17 17 16 17 17 16 19 15 18 15 17 17 16 17 17 16 17 17 16 17 16 17 16 16 18 17 16 19 15 17 15 17 17 17 17 16 17 17 17 16 16 19 15 17 16 17 17 16 17 17 17 17 14 18 16 19 16 15 19 14 18 19 15 16 17 16 17 19 15 16 17 17 17 15 18 16 17 16 16 18 17 16 18 15 16 18 15 18 17 16 17 16 17 17 17 16 17 16 19 16 14 19 16 18 16 16 17 16 16 18 17 16 17 17 16 17 15 18 18 16 16 16 19 15 17 16 17 16 18 16 17 18 15 17 16 18 16 17 16 16 18 15 18 17 15 19 15 16 18 15 17 18 17 16 17 17 16 17 17 16 17 16 17 17 15 18 17 15 19 14 17 18 17 15 18 17 19 14 17 16 16 18 16 18 15 17 19 15 16 19 15 16 17',
    ];
    for (const trace of traces) {
        const budget = new FrameBudget(), intervals = [];
        let now = 0, last;
        for (const elapsed of trace.split(' ').map(Number)) {
            now += elapsed;
            if (budget.take(now, 30) === null) continue;
            if (last !== undefined) intervals.push(now - last);
            last = now;
        }
        assert.ok(intervals.every(ms => Math.round(ms * 60 / 1000) === 2));
        assert.ok(Math.abs(intervals.reduce((a,b) => a+b, 0) / intervals.length - 1000/30) < 0.1);
    }
});
