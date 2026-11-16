import {InputManager} from '/src/game/input.js';
import {normalizeControllerBindings} from '/src/game/controllerBindings.js';
import {createCanopy} from './canopy.js';
import {mountInstruments} from './instruments.js';
import {greyboxFrame} from './artwork.js';
import {COCKPITS,getCockpitDefinition,cockpitManifest} from '/src/game/cockpitDefinitions.js';

const $=selector=>document.querySelector(selector),cockpit=$('#cockpit'),canvas=$('#space'),ctx=canvas.getContext('2d',{alpha:false});
const params=new URLSearchParams(location.search);
const hull=params.get('hull')??'talon';
const definition=getCockpitDefinition(hull,{review:true})??COCKPITS.talon;
const canopy=await createCanopy(definition.id);
const initialCanopy=canopy.project(definition.width/definition.height);
const mockup=params.get('mockup')==='1';
const shell=mockup?greyboxFrame(definition,initialCanopy):definition.shell??greyboxFrame(definition,initialCanopy);
const instruments=mountInstruments(cockpit,definition,shell),artwork=instruments.artwork;
const frame=cockpitManifest(definition.id);
$('#hull').value=definition.id;
$('.review-title').innerHTML=`${definition.name} <small>${definition.status==='approved'?'APPROVED REFERENCE':definition.shell?'ARTWORK · AWAITING APPROVAL':'UNPAINTED LAYOUT · AWAITING APPROVAL'}</small>`;
$('#review-options h1').textContent=`${definition.name} / shared cockpit layout`;
$('#artwork-label').textContent=definition.shell?'Show painted frame':'Show unpainted structure';
$('#model-dialog header b').textContent=`${definition.name} / actual exterior canopy`;
document.title=`${definition.name} · Cockpit layout review`;

const state={yaw:0,pitch:0,roll:0,handX:0,handY:0,throttle:.25,speed:0,energy:100,scene:'navigation',target:0,ownPage:0,navPage:0,transponder:true,wing:0,weapon:0,missiles:4,jumping:false,paused:false,firing:false,flash:0,shot:0,elapsed:0,messageUntil:0,lastInput:'keyboard/touch',shotsFired:0};
let preferences={};try{preferences=JSON.parse(localStorage.getItem('void-privateer-settings-v1'))??{};}catch{}
const input=new InputManager(cockpit);input.configureGamepad({...preferences,controllerBindings:normalizeControllerBindings(preferences.controllerBindings)});
input.vibrationEnabled=false;input.tiltEnabled=false;input.tiltInvertPitch=Boolean(preferences.tiltInvertPitch);input.tiltInvertYaw=Boolean(preferences.tiltInvertYaw);
// Nothing is written to career saves or global controller preferences.
let apertureInfo,previousTime=0,lastHud=-1,frameId,backgroundWidth=0,backgroundHeight=0;
const stars=Array.from({length:170},(_,i)=>({x:((i*7919)%997)/997,y:((i*3571)%991)/991,z:((i*13)%19+2)/21}));
const rocks=Array.from({length:9},(_,i)=>({x:.08+(i*.149)%1,y:.14+(i*.117)%.4,size:.01+(i%3)*.007}));
const scenes={navigation:['HELIX','8,420 KM','JUMP AVAILABLE'],combat:['CUTLASS','218 KM','SHIELDS / HULL'],salvage:['CARRIER DEBRIS','298 KM','CARGO IDENTIFIED']};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function message(text){const bar=$('#comms-bar');bar.textContent=`RIN: ${text}`;bar.classList.add('active');state.messageUntil=state.elapsed+7;instruments.ui.scheduleCommsFit();}
function setScene(name){
    if(!Object.hasOwn(scenes,name))return;
    state.scene=name;state.target=0;$('#scene').value=name;

    updateHud();
}
function updateHud(){instruments.update(state);}
function sampleAndAdvance(dt){
    const blocked=window.cockpitReview?.reviewBlocked||!$('#review-options').hidden||$('#model-dialog').open;
    input.setGamepadBlocked(blocked);
    const a=input.getActions();
    if(blocked){input.keys.clear();input.pressed.clear();return;}
    if(a.controllerDisconnected){state.paused=true;message('Controller disconnected. Preview paused.');}
    if(a.pause){state.paused=!state.paused;input.onBlur();updateHud();}
    if(state.paused)return;
    state.elapsed+=dt;
    if(a.throttleSet!==undefined)state.throttle=a.throttleSet;
    state.throttle=clamp(state.throttle+a.throttleDelta*dt,0,1);
    // Layout-only background motion; never calls or modifies the game simulation.
    state.yaw+=a.yaw*dt*.12;state.pitch=clamp(state.pitch+a.pitch*dt*.1,-.3,.3);state.roll+=(a.roll-state.roll)*Math.min(1,dt*6);
    const ease=1-Math.exp(-dt*16);state.handX+=(a.yaw-state.handX)*ease;state.handY+=(a.pitch-state.handY)*ease;
    state.firing=a.fire;state.boost=a.afterburner;
    state.speed+=((state.throttle*260+(a.afterburner?130:0))-state.speed)*Math.min(1,dt*2);
    state.energy=clamp(state.energy+(a.fire?-16:14)*dt,15,100);
    state.flash=Math.max(0,state.flash-dt*3);
    if(a.fire){state.shot+=dt;if(state.shot>.12){state.shot%=.12;state.shotsFired++;state.flash=.24;}}else state.shot=0;
    if(a.targetNext||a.targetNearestHostile){state.target=1-state.target;updateHud();}
    if(a.navNext||a.map){state.navPage=1-state.navPage;updateHud();}
    if(a.weaponCycle){state.weapon=1-state.weapon;updateHud();}
    if(a.launcherCycle)message('Launcher selection · missile rack / 4 ready.');
    if(a.missile&&state.missiles){state.missiles--;state.flash=.6;message('Missile launched. This is a layout preview.');}
    if(a.scan)message('Scan complete: coolant, 4 units. Fire to release cargo.');
    if(a.autopilot){state.jumping=!state.jumping;message(state.jumping?'Hyperdrive warm-up. Hold course.':'Hyperdrive cancelled.');}
    if(a.transponder){state.transponder=!state.transponder;updateHud();}
    if(a.wingOrder){state.wing=(state.wing+1)%3;updateHud();}
    if(a.shipMenu){state.ownPage=1-state.ownPage;updateHud();}
    state.lastInput=input.usingGamepad?'controller':Math.abs(input.joystickX)+Math.abs(input.joystickY)>.05?'touch':'keyboard/touch';
    if(state.elapsed>=state.messageUntil){$('#comms-bar').classList.remove('active');$('#comms-bar').textContent='';}
}

function drawSpace(){
    const w=backgroundWidth,h=backgroundHeight;
    ctx.fillStyle='#071420';ctx.fillRect(0,0,w,h);
    ctx.save();ctx.translate(w/2,h*.42);ctx.rotate(state.roll*.045);ctx.translate(-w/2,-h*.42);
    for(const star of stars){
        const x=((star.x-state.yaw*star.z)%1+1)%1*w,y=((star.y-state.pitch*star.z)%1+1)%1*h;
        ctx.globalAlpha=.25+star.z*.6;ctx.fillStyle=star.z>.6?'#bdd8df':'#7993ab';ctx.fillRect(Math.round(x),Math.round(y),star.z>.7?2:1,star.z>.7?2:1);
    }
    ctx.globalAlpha=1;
    const px=(.76-state.yaw*.15)*w,py=(.23-state.pitch*.15)*h,pr=h*.12;
    ctx.fillStyle='#3d626e';ctx.beginPath();ctx.arc(px,py,pr,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#152936';ctx.beginPath();ctx.ellipse(px+pr*.3,py,pr*.8,pr,0,0,Math.PI*2);ctx.fill();
    if(state.scene==='salvage')for(const rock of rocks){const x=(rock.x-state.yaw*.35)*w,y=(rock.y-state.pitch*.35)*h,r=rock.size*w;ctx.fillStyle='#4a5358';ctx.beginPath();for(let i=0;i<7;i++){const angle=i/7*Math.PI*2,rr=r*(.75+(i%3)*.12);ctx.lineTo(x+Math.cos(angle)*rr,y+Math.sin(angle)*rr);}ctx.closePath();ctx.fill();}
    const tx=(.5-state.yaw*.4)*w,ty=(.44-state.pitch*.4)*h;
    ctx.strokeStyle=state.scene==='combat'?'#d68b78':'#d8c181';ctx.lineWidth=1;ctx.setLineDash([]);
    const s=w*.024,bracket=$('#target-bracket');
    bracket.classList.remove('is-hidden');bracket.classList.toggle('is-hostile',state.scene==='combat');bracket.style.transform=`translate(${tx}px,${ty}px)`;
    if(state.scene==='combat'){
        ctx.fillStyle='#9aaeb3';ctx.beginPath();ctx.moveTo(tx,ty-s*.4);ctx.lineTo(tx-s*.6,ty+s*.2);ctx.lineTo(tx+s*.6,ty+s*.2);ctx.closePath();ctx.fill();
    }else if(state.scene==='navigation'){ctx.fillStyle='#e4c77c';ctx.fillRect(tx-2,ty-2,4,4);}
    if(state.firing){const phase=(state.shot/.12);ctx.strokeStyle='#b7eae2';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(w*.24,h*.76);ctx.lineTo(tx-s*(1-phase),ty+s*(1-phase));ctx.moveTo(w*.77,h*.76);ctx.lineTo(tx+s*(1-phase),ty+s*(1-phase));ctx.stroke();}
    ctx.restore();
    artwork.showPose(state.handX,state.handY);
    $('#hit-flash').style.opacity=state.flash;
}

function resize(){
    const host=$('#viewport-host'),mode=$('#review-viewport').value;
    let w=host.clientWidth,h=host.clientHeight;
    // Respect safe-area padding before calculating the optional review frame.
    const style=getComputedStyle(host);w-=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight);h-=parseFloat(style.paddingBottom);
    let scale=1;
    if(mode!=='fit'){const frame=mode==='phone'?[844,390]:[1440,900];scale=Math.min(w/frame[0],h/frame[1],1);[w,h]=frame;}
    cockpit.dataset.reviewPreset=mode;
    cockpit.dataset.touchPlay=String(params.get('touch')==='1');
    cockpit.style.transform=`scale(${scale})`;
    cockpit.style.width=`${Math.floor(w)}px`;cockpit.style.height=`${Math.floor(h)}px`;
    backgroundWidth=canvas.width=Math.max(1,Math.floor(w));backgroundHeight=canvas.height=Math.max(1,Math.floor(h));
    apertureInfo=canopy?.project(w/h);
    $('#portrait-hint').hidden=w>=h;
    instruments.layout();
    instruments.invalidate();updateHud();instruments.ui.scheduleCommsFit();

    canopy?.renderReference();drawSpace();
}
function reset(){
    Object.assign(state,{yaw:0,pitch:0,roll:0,handX:0,handY:0,throttle:.25,speed:0,energy:100,target:0,ownPage:0,navPage:0,transponder:true,wing:0,weapon:0,missiles:4,jumping:false,paused:false,firing:false,flash:0,shot:0,shotsFired:0});
    input.onBlur();setScene($('#scene').value);message('Try the stick, throttle and console controls.');drawSpace();
}
function toggleOptions(open){$('#review-options').hidden=!open;$('#review-open').setAttribute('aria-expanded',open);input.onBlur();if(!open)$('#review-open').focus();}
$('#review-open').onclick=()=>toggleOptions($('#review-options').hidden);$('#review-close').onclick=()=>toggleOptions(false);
$('#review-viewport').onchange=resize;$('#scene').onchange=e=>setScene(e.target.value);$('#guides').onchange=e=>cockpit.classList.toggle('show-guides',e.target.checked);
$('#artwork-enabled').onchange=e=>{artwork.frame.style.visibility=e.target.checked?'':'hidden';};
$('#hull').onchange=e=>{const url=new URL(location.href);url.searchParams.set('hull',e.target.value);location.href=url.href;};
$('#reset').onclick=reset;$('.cockpit-screen-own').onclick=()=>{state.ownPage=1-state.ownPage;updateHud();};
$('#comms-bar').onclick=()=>message('Keep your nose on the contact. The target display shows its shields and hull.');
$('#model-open').onclick=()=>{input.onBlur();$('#model-dialog').showModal();try{canopy.showReference();canopy.setReferenceView(false);}catch(error){$('#model-stage').textContent=`3D reference unavailable: ${error.message}`;}};
$('#model-close').onclick=()=>$('#model-dialog').close();$('#model-dialog').addEventListener('close',()=>input.onBlur());
$('#model-front').onclick=()=>canopy.setReferenceView(false);$('#model-whole').onclick=()=>canopy.setReferenceView(true);
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{message('Fullscreen is unavailable in this browser.');}};
window.addEventListener('keydown',e=>{if(e.code==='Escape'&&!$('#review-options').hidden&&!$('#model-dialog').open){toggleOptions(false);e.stopImmediatePropagation();e.preventDefault();}},{capture:true});
// The shared input manager handles touch capture and cancellation. Keyboard
// access to the two slider controls is added only for this review page.
$('[data-touch-throttle]').addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','Home','End'].includes(e.code)){e.preventDefault();e.stopPropagation();input.keys.delete(e.code);state.throttle=e.code==='Home'?0:e.code==='End'?1:clamp(state.throttle+(e.code==='ArrowUp'?.05:-.05),0,1);updateHud();}});
$('.pause-button').onclick=()=>{state.paused=!state.paused;input.onBlur();updateHud();};
$('.fullscreen-button').onclick=()=>$('#fullscreen').click();
$('#radar').onclick=()=>{state.navPage=1-state.navPage;message('Navigation map · Helix system.');};
$('#hud-wing-tactics').onclick=()=>{state.wing=(state.wing+1)%3;updateHud();};
window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{previousTime=0;input.onBlur();});
function tick(now){
    const dt=previousTime?Math.min((now-previousTime)/1000,.04):0;previousTime=now;
    if(!document.hidden){sampleAndAdvance(dt);drawSpace();if(now-lastHud>100){updateHud();lastHud=now;}}
    frameId=requestAnimationFrame(tick);
}
window.addEventListener('pagehide',()=>{cancelAnimationFrame(frameId);input.dispose();},{once:true});
window.render_game_to_text=()=>JSON.stringify({mode:'cockpit-layout-review',hull:definition.id,approval:definition.status,artworkGenerated:Boolean(definition.shell),coordinates:'screen origin top-left; yaw right / pitch down',scene:state.scene,hand:[state.handX,state.handY],throttle:state.throttle,speed:state.speed,ownPage:state.ownPage,missiles:state.missiles,shotsFired:state.shotsFired,paused:state.paused,input:state.lastInput,canopy:apertureInfo,careerModified:false});
window.advanceTime=ms=>{for(let n=0;n<Math.ceil(ms/(1000/60));n++)sampleAndAdvance(1/60);drawSpace();updateHud();};
window.cockpitReview={mockup,state,input,instruments,definition,manifest:frame,resize,setScene,get canopy(){return canopy;},get artwork(){return artwork;}};
setScene(params.get('scene')??'navigation');if(['desktop','phone'].includes(params.get('viewport')))$('#review-viewport').value=params.get('viewport');
resize();
try{await artwork.ready;if(artwork.loadError)throw new Error(artwork.loadError);resize();window.ready=true;parent.postMessage({type:'cockpit-ready'},location.origin);}catch(error){message(`Cockpit could not load: ${error.message}`);window.reviewError=error.message;parent.postMessage({type:'cockpit-error',message:error.message},location.origin);}
frameId=requestAnimationFrame(tick);
