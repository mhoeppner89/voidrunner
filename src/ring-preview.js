import * as THREE from 'three';
import { SpaceRenderer } from './game/render.js';
import { LOCATIONS } from './game/data.js';

// Isolated visual study: no GameSession, saves, AI, audio, or game mutations.
const $ = id => document.getElementById(id);
const controls = [...document.querySelectorAll('button,select,input')];
controls.forEach(node => node.disabled = true);
const location = LOCATIONS.azure;
const center = new THREE.Vector3(...location.position);
const ringRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2.6, 0, .38));
const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(ringRotation);
const radial = new THREE.Vector3(1, 0, 0).applyQuaternion(ringRotation);
const tangent = new THREE.Vector3(0, 1, 0).applyQuaternion(ringRotation);
const position = new THREE.Vector3(), target = new THREE.Vector3();
const radius = location.radius;
const duration = 20;
let renderer, time = 0, last = 0, paused = false, frameId, failed = false;
let view = 'band', frameTimes = [], lastStatus = 0;
let ringSurface;
function cameraPose() {
    const fraction = view === 'gap' ? .462 : .30;
    const ringRadius = radius * (1.3 + 1.44 * fraction);
    const h = (1 - 2 * Math.min(1, time / duration)) * radius * .015;
    position.copy(center);
    if(view === 'above' || view === 'below') {
        position.addScaledVector(radial, radius*3.7).addScaledVector(normal, radius*(view==='above'?2.2:-2.2));
        target.copy(center);
    } else if(view === 'edge') {
        position.addScaledVector(radial,radius*3.3).addScaledVector(normal,radius*.025);
        target.copy(center).addScaledVector(radial,radius*1.8);
    } else {
        position.addScaledVector(radial,ringRadius).addScaledVector(normal,h);
        // Look forward and gently down; the original ring remains in view.
        target.copy(position).addScaledVector(tangent,180).addScaledVector(normal,view==='horizontal'?0:-100);
    }
    renderer.camera.position.copy(position);
    renderer.camera.up.copy(normal);
    renderer.camera.lookAt(target);
    renderer.camera.updateMatrixWorld(true);
    renderer.skyRoot.position.copy(position);
    renderer.ringVolumeEnabled = $('effect').checked;
    ringSurface.visible = !$('effect').checked;
}
function render(dt = 0) { cameraPose(); renderer.ringParticleDt = dt; renderer.render(); }
function reset() { time=0; frameTimes=[]; last=0; paused=false; $('pause').textContent='Pause'; }
function stats() {
    const sorted=[...frameTimes].sort((a,b)=>a-b);
    return { samples:sorted.length, averageFps:sorted.length?1000/(sorted.reduce((a,b)=>a+b,0)/sorted.length):null,
        p95FrameMs:sorted.length?sorted[Math.floor((sorted.length-1)*.95)]:null,
        framesOver50ms:sorted.filter(ms=>ms>50).length };
}
function loop(now) {
    if(failed) return;
    try {
        const dt=last?(now-last)/1000:0; last=now;
        if(!document.hidden && !paused) {
            if(dt>0 && dt<.25) { frameTimes.push(dt*1000); if(frameTimes.length>1200)frameTimes.shift(); time+=dt; }
            if((view==='band'||view==='gap'||view==='horizontal')&&time>=duration) {time=duration;paused=true;$('pause').textContent='Resume';}
        }
        render(paused || document.hidden ? 0 : dt);
        if(!failed && now-lastStatus>500) {
            const s=stats();
            $('status').textContent=`${$('view-select').selectedOptions[0].text} · ${view==='band'||view==='gap'||view==='horizontal'?`${time.toFixed(1)} / ${duration}s · `:''}${$('effect').checked?(renderer.ringParticles.diagnostics().density>0.001?'inside ring · particles active':'outside particle layer'):'original surface'} · ${s.averageFps?s.averageFps.toFixed(1)+' FPS':'warming up'}${paused?' · paused':''}`;
            lastStatus=now;
        }
        frameId=requestAnimationFrame(loop);
    } catch(error) { failed=true; $('status').textContent=`Preview failed: ${error.message}`; console.error(error); }
}
function download(blob,name) {
    const url=URL.createObjectURL(blob), a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
$('view-select').addEventListener('change',()=>{view=$('view-select').value;reset();});
$('effect').addEventListener('change',()=>{frameTimes=[];});
$('replay').addEventListener('click',reset);
$('pause').addEventListener('click',()=>{paused=!paused;$('pause').textContent=paused?'Resume':'Pause';});
$('capture').addEventListener('click',()=>{
    paused=true;$('pause').textContent='Resume';render();
    renderer.canvas.toBlob(blob=>{if(blob)download(blob,`azure-${view}-${time.toFixed(1)}s-${$('effect').checked?'dust':'original'}.png`);},'image/png');
});
$('report').addEventListener('click',()=>download(new Blob([JSON.stringify({preview:'ring-study-4',view,time,effect:$('effect').checked,
    particles:renderer.ringParticles.diagnostics(),viewport:[innerWidth,innerHeight],renderSize:[renderer.canvas.width,renderer.canvas.height],...stats()},null,2)],{type:'application/json'}),'azure-ring-timings.json'));
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(error){$('status').textContent=error.message;}});
document.addEventListener('visibilitychange',()=>{last=0;});
window.addEventListener('pagehide',()=>{cancelAnimationFrame(frameId);renderer?.dispose();},{once:true});
try {
    renderer = new SpaceRenderer($('view'),804140,[],[],[],'high','helios-verge');
    renderer.renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
        failed = true;
        $('status').textContent = 'Rendering error: ' + (gl.getShaderInfoLog(fragment) || gl.getShaderInfoLog(vertex) || gl.getProgramInfoLog(program));
    };
    renderer.locationMeshes.get('azure').traverse(object => {
        if (object.material?.uniforms?.uRingMap) ringSurface = object;
    });
    if (!ringSurface) throw new Error('Azure ring surface is missing.');
    $('view-select').value = view;
    controls.forEach(node=>node.disabled=false);
    frameId=requestAnimationFrame(loop);
} catch(error) { $('status').textContent=`Unable to start: ${error.message}`;console.error(error); }
