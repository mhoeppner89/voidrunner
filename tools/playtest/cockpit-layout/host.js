// Preview frames have their own real viewport: phone CSS/media queries must
// respond to the chosen phone dimensions, not to the desktop surrounding it.
const $=s=>document.querySelector(s),params=new URLSearchParams(location.search);
const host=$('#viewport-host');host.replaceChildren();
const frame=document.createElement('iframe');frame.id='review-frame';frame.title='Interactive cockpit layout';host.append(frame);
if(['navigation','combat','salvage'].includes(params.get('scene')))$('#scene').value=params.get('scene');
$('#hull').value=[...$('#hull').options].some(o=>o.value===params.get('hull'))?params.get('hull'):'scrapper';
$('#review-viewport').value=['desktop','phone'].includes(params.get('viewport'))?params.get('viewport'):'fit';
const child=()=>frame.contentWindow;
function resize(){
    const css=getComputedStyle(host),w=host.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight),h=host.clientHeight-parseFloat(css.paddingBottom);
    const preset=$('#review-viewport').value,size=preset==='phone'?[844,390]:preset==='desktop'?[1440,900]:[w,h];
    const scale=Math.min(w/size[0],h/size[1],1);
    Object.assign(frame.style,{width:`${Math.floor(size[0])}px`,height:`${Math.floor(size[1])}px`,transform:`scale(${scale})`});
}
function load(){
    window.ready=false;window.reviewError=undefined;
    const url=new URL(location.href);url.searchParams.set('embedded','1');url.searchParams.set('hull',$('#hull').value);url.searchParams.delete('viewport');
    const phone=$('#review-viewport').value==='phone'||$('#review-viewport').value==='fit'&&(navigator.maxTouchPoints>0||matchMedia('(pointer:coarse)').matches);
    url.searchParams.set('touch',phone?'1':'0');url.searchParams.set('scene',$('#scene').value);
    frame.src=url.href;resize();
    const address=new URL(location.href);address.searchParams.set('hull',$('#hull').value);address.searchParams.set('viewport',$('#review-viewport').value);history.replaceState(null,'',address);
}
window.addEventListener('message',event=>{
    if(event.source!==child())return;
    if(event.data?.type==='cockpit-error'){window.reviewError=event.data.message;return;}
    if(event.data?.type!=='cockpit-ready')return;
    const review=child().cockpitReview,definition=review.definition;
    $('.review-title').innerHTML=`${definition.name} <small>${review.mockup?'SHADED PERSPECTIVE MOCKUP':definition.status==='approved'?'APPROVED REFERENCE':definition.shell?'ARTWORK · AWAITING APPROVAL':'UNPAINTED LAYOUT · AWAITING APPROVAL'}</small>`;
    $('#review-options h1').textContent=`${definition.name} / shared cockpit layout`;
    $('#artwork-label').textContent=definition.shell?'Show painted frame':'Show unpainted structure';
    document.title=`${definition.name} · Cockpit layout review`;
    child().document.querySelector('#guides').checked=$('#guides').checked;
    child().document.querySelector('#guides').dispatchEvent(new Event('change'));
    child().document.querySelector('#artwork-enabled').checked=$('#artwork-enabled').checked;
    child().document.querySelector('#artwork-enabled').dispatchEvent(new Event('change'));
    review.reviewBlocked=!$('#review-options').hidden;window.ready=true;
});
function options(open){$('#review-options').hidden=!open;$('#review-open').setAttribute('aria-expanded',String(open));if(child().cockpitReview){child().cockpitReview.reviewBlocked=open;child().cockpitReview.input.onBlur();}if(!open)child().focus();}
$('#review-open').onclick=()=>options($('#review-options').hidden);$('#review-close').onclick=()=>options(false);
$('#hull').onchange=load;$('#review-viewport').onchange=load;
for(const id of ['scene','guides','artwork-enabled'])$('#'+id).onchange=()=>{
    const e=child().document.querySelector('#'+id);if(!e)return;
    e.value=$('#'+id).value;e.checked=$('#'+id).checked;e.dispatchEvent(new Event('change'));
};
for(const id of ['reset','model-open'])$('#'+id).onclick=()=>{options(false);child().document.querySelector('#'+id).click();};
$('#fullscreen').onclick=async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();};
window.addEventListener('keydown',e=>{if(e.code==='Escape')options(false);});window.addEventListener('resize',resize);
window.render_game_to_text=()=>child().render_game_to_text?.()??'{}';window.advanceTime=ms=>child().advanceTime?.(ms);
Object.defineProperty(window,'cockpitReview',{get:()=>child().cockpitReview});
load();
