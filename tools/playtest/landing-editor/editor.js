const $=s=>document.querySelector(s),storageKey='voidrunner-landing-editor-v2';
const frame=$('iframe'),viewport=$('.viewport'),wrapper=$('.frame'),surface=$('.drag-surface');
const labels={ship:'Schiff',services:'Service',market:'Markt',bar:'Bar / Aufträge',den:'Schmuggler'};
let bridge,catalog,state,defaults,history=[],pending,running=false,device='desktop',menus=true,selected='ship',geometry,drag;
const clone=value=>structuredClone(value),round=n=>Math.round(n*100000)/100000,clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const dimensions=()=>device==='phone'?[844,390]:[1440,900];
function fit(){const[w,h]=dimensions(),scale=Math.max(.05,Math.min((viewport.clientWidth-4)/w,(viewport.clientHeight-36)/h,1));wrapper.style.width=`${w*scale}px`;wrapper.style.height=`${h*scale}px`;Object.assign(frame.style,{width:`${w}px`,height:`${h}px`,transform:`scale(${scale})`});$('#frame-size').textContent=`${w} × ${h}`;}
new ResizeObserver(fit).observe(viewport);
function notice(text){$('#status').textContent=text;}
function remember(){try{localStorage.setItem(storageKey,JSON.stringify(state));$('#saved').textContent='Automatisch lokal gespeichert';}catch{$('#saved').textContent='Lokales Speichern nicht verfügbar';}}
function options(select,items,value){select.replaceChildren(...items.map(i=>new Option(i.name,i.id)));select.value=value;}
const placement=()=>state?.locations[state.port].placements[device];
const target=()=>selected==='ship'?placement()?.ship:placement()?.buttons[selected];
function fields(){
 if(!state)return;const index=catalog.ports.findIndex(p=>p.id===state.port),p=target();
 const fingerprint=p=>JSON.stringify(p,(_,v)=>typeof v==='number'?round(v):v);
 for(const option of $('#port').options){const port=catalog.ports.find(p=>p.id===option.value);option.textContent=port.name+(fingerprint(state.locations[port.id].placements[device])!==fingerprint(defaults[port.id].placements[device])?' •':'');}
 $('#port').value=state.port;$('#port-count').textContent=`ORT ${String(index+1).padStart(2,'0')} / ${catalog.ports.length}`;
 $('#view-name').textContent=device==='phone'?'Smartphone':'Desktop';$('#controls').disabled=!p;
 for(const axis of ['x','y'])$('#position-'+axis).value=p?Math.round(p[axis]*1000)/10:'';
 $('#size-control').hidden=selected!=='ship';for(const id of ['#size-number','#size-range'])$(id).value=placement()?Math.round(placement().ship.zoom*100):100;
 $('#undo').disabled=!history.length;
}
function handles(){
 if(!geometry)return;const focused=surface.contains(document.activeElement)?document.activeElement.dataset.element:undefined,[w,h]=dimensions();surface.replaceChildren();
 for(const[key,b]of Object.entries(geometry.boxes)){
  if(key!=='ship'&&!menus)continue;const handle=document.createElement('button');handle.type='button';handle.className='move-handle'+(selected===key?' is-selected':'');handle.dataset.element=key;handle.setAttribute('aria-label',`${labels[key]} verschieben`);
  Object.assign(handle.style,{left:`${b.x/w*100}%`,top:`${b.y/h*100}%`,width:`${b.w/w*100}%`,height:`${b.h/h*100}%`});const tag=document.createElement('span');tag.className='tag';tag.textContent=labels[key];handle.append(tag);surface.append(handle);
 }
 options($('#element'),Object.keys(geometry.boxes).map(id=>({id,name:labels[id]})),selected);
 if(focused)surface.querySelector(`[data-element="${focused}"]`)?.focus({preventScroll:true});
}
function record(){history.push({state:clone(state),device});if(history.length>100)history.shift();}
function update(){if(!state)return;fields();remember();pending={port:state.port,hull:state.hull,paint:state.paint,layout:clone(state.locations[state.port]),device,menus};void drain();}
async function drain(){
 if(running||!bridge)return;running=true;$('#loading').hidden=false;
 try{while(pending){const next=pending;pending=null;const result=await bridge.render(next);
  if(next.port!==state.port||next.hull!==state.hull||next.paint!==state.paint||next.device!==device)continue;
  geometry=result;if(!placement()){state.locations[state.port].placements[device]=clone(result.placement);remember();}
  if(!geometry.boxes[selected])selected='ship';fields();handles();notice('');
 }}catch(error){notice(error.message);}finally{running=false;$('#loading').hidden=true;}
}
function move(x,y){const p=target();if(!p)return;p.x=round(clamp(x,0,1));p.y=round(clamp(y,0,1));update();}
for(const axis of ['x','y']){
 const input=$('#position-'+axis);input.onfocus=record;input.oninput=()=>{const n=Number(input.value);if(input.value.trim()!==''&&Number.isFinite(n)&&n>=0&&n<=100){const p=target();move(axis==='x'?n/100:p.x,axis==='y'?n/100:p.y);}};input.onchange=fields;
}
for(const id of ['#size-number','#size-range']){
 const input=$(id);input.onfocus=()=>{if(input.type==='number')record();};input.onpointerdown=()=>{if(input.type==='range')record();};input.oninput=()=>{const n=Number(input.value);if(input.value.trim()!==''&&n>=20&&n<=150&&placement()){placement().ship.zoom=n/100;update();}};input.onchange=fields;
}
$('#element').onchange=()=>{selected=$('#element').value;fields();handles();};
$('#port').onchange=()=>{state.port=$('#port').value;geometry=undefined;update();};
function movePort(delta){state.port=catalog.ports[(catalog.ports.findIndex(p=>p.id===state.port)+delta+catalog.ports.length)%catalog.ports.length].id;geometry=undefined;update();}
$('#previous').onclick=()=>movePort(-1);$('#next').onclick=()=>movePort(1);
$('#hull').onchange=()=>{state.hull=$('#hull').value;const paints=catalog.hulls.find(h=>h.id===state.hull).paints;state.paint=paints.some(p=>p.id===state.paint)?state.paint:paints[0].id;options($('#paint'),paints,state.paint);update();};
$('#paint').onchange=()=>{state.paint=$('#paint').value;update();};
$('#reset').onclick=()=>{record();const base=defaults[state.port].placements[device];if(base)state.locations[state.port].placements[device]=clone(base);else delete state.locations[state.port].placements[device];update();};
$('#undo').onclick=()=>{if(!history.length)return;({state,device}=history.pop());$('#hull').value=state.hull;options($('#paint'),catalog.hulls.find(h=>h.id===state.hull).paints,state.paint);deviceButtons();fit();update();};
$('#toggle').onclick=()=>{const hidden=document.body.classList.toggle('hide-controls');$('#toggle').setAttribute('aria-expanded',String(!hidden));fit();};
$('#menus').onclick=()=>{menus=!menus;$('#menus').setAttribute('aria-pressed',String(menus));if(!menus)selected='ship';update();};
function deviceButtons(){for(const b of document.querySelectorAll('[data-device]'))b.classList.toggle('active',b.dataset.device===device);}
for(const button of document.querySelectorAll('[data-device]'))button.onclick=()=>{device=button.dataset.device;geometry=undefined;deviceButtons();fit();update();};
surface.onpointerdown=e=>{
 const handle=e.target.closest('[data-element]');if(!handle||!geometry||!placement()||e.button!==0)return;
 selected=handle.dataset.element;record();const p=target(),[w]=dimensions();drag={x:e.clientX,y:e.clientY,start:clone(p),ratio:wrapper.clientWidth/w,scene:clone(geometry.scene)};fields();handles();surface.querySelector(`[data-element="${selected}"]`)?.focus({preventScroll:true});surface.setPointerCapture(e.pointerId);e.preventDefault();
};
surface.onpointermove=e=>{if(drag)move(drag.start.x+(e.clientX-drag.x)/drag.ratio/drag.scene.w,drag.start.y+(e.clientY-drag.y)/drag.ratio/drag.scene.h);};
surface.onpointerup=surface.onpointercancel=()=>{drag=null;};
surface.onkeydown=e=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta||!geometry||!target())return;e.preventDefault();record();const p=target(),step=e.shiftKey?10:1;move(p.x+delta[0]*step/geometry.scene.w,p.y+delta[1]*step/geometry.scene.h);};
function validate(data){
 if(data?.format!=='voidrunner-landing-layout'||![1,2].includes(data.version)||!data.locations||typeof data.locations!=='object')throw Error('Keine gültige Landeplatz-Datei.');
 const result={};for(const[id,value]of Object.entries(data.locations)){
  if(!Object.hasOwn(defaults,id))throw Error(`Unbekannter Ort: ${id}`);const entry=clone(defaults[id]);
  if(data.version===2){
   if(value.scale!==entry.scale||['yaw','pitch','roll'].some(k=>value.rotationDeg?.[k]!==entry.rotationDeg[k]))throw Error('Die freigegebene Ausrichtung ist fixiert.');
   for(const[view,p]of Object.entries(value.placements??{})){
    if(!['desktop','phone'].includes(view)||!p?.ship||!p.buttons)throw Error('Ungültige Ansicht.');
    const point=p=>{if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)throw Error('Ungültige Position.');return{x:p.x,y:p.y};};
    const ship=point(p.ship);if(!Number.isFinite(p.ship.zoom)||p.ship.zoom<.2||p.ship.zoom>1.5)throw Error('Ungültige Anzeigegröße.');ship.zoom=p.ship.zoom;
    const buttons={};for(const[key,b]of Object.entries(p.buttons)){if(!['services','market','bar','den'].includes(key))throw Error('Unbekannte Schaltfläche.');buttons[key]=point(b);}
    entry.placements[view]={ship,buttons};
   }
  }result[id]=entry;
 }if(!Object.keys(result).length)throw Error('Die Datei enthält keine Landeplätze.');return result;
}
$('#import').onclick=()=>$('#file').click();
$('#file').onchange=async()=>{try{const file=$('#file').files[0];if(!file)return;const result=validate(JSON.parse(await file.text()));record();Object.assign(state.locations,result);update();}catch(error){notice(error.message);}finally{$('#file').value='';}};
$('#export').onclick=()=>{
 const data={format:'voidrunner-landing-layout',version:2,coordinateSpace:'scene-normalized',referenceRuntime:catalog.version,exportedAt:new Date().toISOString(),preview:{hull:state.hull,paint:state.paint},locations:state.locations};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='voidrunner-landing-layout.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('JSON exportiert');
};
try{
 await new Promise((resolve,reject)=>{const end=performance.now()+120000;const check=()=>{bridge=frame.contentWindow?.__LANDING_PREVIEW__;if(bridge)resolve();else if(performance.now()>end)reject(Error('Vorschau nicht erreichbar. Bitte neu laden.'));else setTimeout(check,50);};check();});
 catalog=bridge.catalog;defaults=Object.fromEntries(catalog.ports.map(p=>[p.id,{scale:p.scale,rotationDeg:{...p.rotationDeg},placements:clone(p.placements??{})}]));
 state={port:'helix',hull:'wayfarer',paint:catalog.hulls.find(h=>h.id==='wayfarer').paints[0].id,locations:clone(defaults)};
 try{const stored=JSON.parse(localStorage.getItem(storageKey));if(stored){Object.assign(state.locations,validate({format:'voidrunner-landing-layout',version:2,locations:stored.locations}));if(catalog.ports.some(p=>p.id===stored.port))state.port=stored.port;if(catalog.hulls.some(h=>h.id===stored.hull))state.hull=stored.hull;if(catalog.hulls.find(h=>h.id===state.hull).paints.some(p=>p.id===stored.paint))state.paint=stored.paint;else state.paint=catalog.hulls.find(h=>h.id===state.hull).paints[0].id;}}catch{}
 options($('#port'),catalog.ports,state.port);options($('#hull'),catalog.hulls,state.hull);options($('#paint'),catalog.hulls.find(h=>h.id===state.hull).paints,state.paint);
 await bridge.ready;for(const element of document.querySelectorAll('button,select'))element.disabled=false;update();
}catch(error){$('#loading').textContent=error.message;}
window.render_game_to_text=()=>JSON.stringify({port:state?.port,layout:state?.locations[state.port],busy:running,device,selected});
