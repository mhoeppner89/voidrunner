import {hasForwardHullBlockout,forwardHullPercent,outwardHullPercent,MORRIGAN_FORWARD_PLACEMENT} from './hull-blockout.js';
import {COCKPITS} from '/src/game/cockpitDefinitions.js';
import {SHIPS} from '/src/game/data.js';

const $=s=>document.querySelector(s),params=new URLSearchParams(location.search);
const hulls=Object.values(SHIPS).filter(s=>s.tier===2&&COCKPITS[s.id]).sort((a,b)=>a.name.localeCompare(b.name));
let selected=hulls.find(s=>s.id===params.get('hull'))??hulls.find(s=>s.id==='prospector')??hulls[0];
const frame=document.createElement('iframe');frame.id='preview';frame.title='Interactive cockpit';frame.allow='fullscreen; gamepad';$('#stage').append(frame);
const preview=()=>frame.contentWindow;
$('#forward-hull').checked=params.get('hull-view')==='1';
$('#forward-view').value=forwardHullPercent(params.get('view-forward')??MORRIGAN_FORWARD_PLACEMENT.forward);
$('#outward-view').value=outwardHullPercent(params.get('hull-outward')??MORRIGAN_FORWARD_PLACEMENT.outward);
$('#painted-hull').checked=params.get('hull-art')==='1';
function viewControls(){
    const active=hasForwardHullBlockout(selected.id)&&$('#forward-hull').checked;
    $('#forward-view-label').hidden=!active;$('#forward-reset').hidden=!active;$('#outward-view-label').hidden=!active;
    $('#painted-hull-label').hidden=!active;
    const painted=active&&$('#painted-hull').checked;
    if(painted){$('#forward-view').value=MORRIGAN_FORWARD_PLACEMENT.forward;$('#outward-view').value=MORRIGAN_FORWARD_PLACEMENT.outward;}
    for(const id of ['forward-view','outward-view','forward-reset'])$('#'+id).disabled=painted;
    $('#forward-value').textContent=`${$('#forward-view').value}%`;
    $('#outward-value').textContent=`${$('#outward-view').value}%`;
}
$('#profile').value=['desktop','phone','fit'].includes(params.get('profile'))?params.get('profile'):matchMedia('(pointer:coarse)').matches?'phone':'desktop';
$('#scene').value=['navigation','combat','salvage'].includes(params.get('scene'))?params.get('scene'):'navigation';
for(const ship of hulls){
    const button=document.createElement('button');button.type='button';button.dataset.hull=ship.id;
    const name=document.createElement('b'),status=document.createElement('small');name.textContent=ship.name;
    status.textContent=COCKPITS[ship.id].status==='approved'?'In game':'Artwork review';button.append(name,status);
    button.onclick=()=>{selected=ship;load();};$('#ships').append(button);
}
function resize(){
    const host=$('#stage'),style=getComputedStyle(host),w=host.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),h=host.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
    const mode=$('#profile').value,[width,height]=mode==='phone'?[844,390]:mode==='desktop'?[1440,900]:[Math.max(1,w),Math.max(1,h)];
    const scale=Math.min(w/width,h/height,1);Object.assign(frame.style,{width:`${Math.floor(width)}px`,height:`${Math.floor(height)}px`,transform:`scale(${scale})`});
}
function address(){
    const url=new URL(location.href),detail=new URL('./index.html',location.href);
    url.searchParams.set('hull',selected.id);url.searchParams.set('profile',$('#profile').value);url.searchParams.set('scene',$('#scene').value);
    detail.searchParams.set('hull',selected.id);detail.searchParams.set('viewport',$('#profile').value);detail.searchParams.set('scene',$('#scene').value);
    const active=hasForwardHullBlockout(selected.id)&&$('#forward-hull').checked;
    for(const address of [url,detail]){
        if(active){address.searchParams.set('hull-view','1');address.searchParams.set('view-forward',$('#forward-view').value);address.searchParams.set('hull-outward',$('#outward-view').value);if($('#painted-hull').checked)address.searchParams.set('hull-art','1');else address.searchParams.delete('hull-art');}
        else{address.searchParams.delete('hull-view');address.searchParams.delete('view-forward');address.searchParams.delete('hull-outward');address.searchParams.delete('hull-art');}
    }
    history.replaceState(null,'',url);$('#individual').href=detail.href;
}
function load(){
    window.ready=false;window.reviewError=undefined;$('#error').hidden=true;
    for(const button of $('#ships').children)button.setAttribute('aria-pressed',String(button.dataset.hull===selected.id));
    $('#status').textContent=`Loading ${selected.name}…`;document.title=`${selected.name} · Tier II cockpit review`;frame.title=`${selected.name} interactive cockpit`;
    const url=new URL('./index.html',location.href);url.searchParams.set('embedded','1');url.searchParams.set('hull',selected.id);url.searchParams.set('scene',$('#scene').value);
    const hasHull=hasForwardHullBlockout(selected.id);$('#forward-label').hidden=!hasHull;viewControls();
    if(hasHull&&$('#forward-hull').checked){url.searchParams.set('hull-view','1');url.searchParams.set('view-forward',$('#forward-view').value);url.searchParams.set('hull-outward',$('#outward-view').value);if($('#painted-hull').checked)url.searchParams.set('hull-art','1');}
    viewControls();
    url.searchParams.set('touch',($('#profile').value==='phone'||$('#profile').value==='fit'&&matchMedia('(pointer:coarse)').matches)?'1':'0');
    frame.src=url.href;resize();address();
}
function sendControl(id){
    const control=preview().document.querySelector('#'+id);if(!control)return;
    if(id==='scene')control.value=$('#scene').value;
    if(id==='guides')control.checked=$('#guides').checked;
    control.dispatchEvent(new Event('change'));
}
window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==preview())return;
    if(event.data?.type==='cockpit-error'){window.reviewError=event.data.message;$('#error').textContent=event.data.message;$('#error').hidden=false;$('#status').textContent='Could not load cockpit';return;}
    if(event.data?.type!=='cockpit-ready')return;
    if(preview().cockpitReview?.definition.id!==selected.id)return;
    sendControl('scene');sendControl('guides');window.ready=true;
    if(preview().cockpitReview.forwardHull)updateView();
    $('#status').textContent=preview().cockpitReview.forwardHull?(preview().cockpitReview.forwardHull.kind==='painted-hull-review'?'Painted hull · 13% forward / 18% outward · approved / in game':'Hand-drawn shapes · placement approved at 13% / 18%'):COCKPITS[selected.id].status==='approved'?`${selected.name} · approved / in game`:`${selected.name} · finished artwork / awaiting approval`;
});
$('#previous').onclick=()=>{selected=hulls[(hulls.indexOf(selected)+hulls.length-1)%hulls.length];load();};
$('#next').onclick=()=>{selected=hulls[(hulls.indexOf(selected)+1)%hulls.length];load();};
$('#profile').onchange=load;$('#scene').onchange=()=>{if(window.ready)sendControl('scene');address();};$('#guides').onchange=()=>{if(window.ready)sendControl('guides');};
$('#forward-hull').onchange=load;$('#painted-hull').onchange=load;
function updateView(){
    viewControls();address();
    if(window.ready)preview().postMessage({type:'cockpit-forward-view',value:Number($('#forward-view').value),outward:Number($('#outward-view').value)},location.origin);
}
$('#forward-view').oninput=updateView;$('#outward-view').oninput=updateView;
$('#forward-reset').onclick=()=>{$('#forward-view').value=0;updateView();};
for(const [id,childId] of [['model','model-open'],['reset','reset']])$('#'+id).onclick=()=>{if(window.ready)preview().document.querySelector('#'+childId).click();};
function focus(on){document.body.classList.toggle('focus',on);$('#unfocus').hidden=!on;resize();if(on)preview().focus();}
$('#focus').onclick=()=>focus(true);$('#unfocus').onclick=()=>focus(false);window.addEventListener('keydown',event=>{if(event.code==='Escape')focus(false);});
window.addEventListener('resize',resize);
window.render_game_to_text=()=>preview().render_game_to_text?.()??'{}';window.advanceTime=ms=>preview().advanceTime?.(ms);
Object.defineProperty(window,'cockpitReview',{get:()=>preview().cockpitReview});
load();
