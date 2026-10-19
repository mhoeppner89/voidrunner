import '/src/main.js';
import {LOCATIONS,SHIPS,DOCK_LOCATION_IDS} from '/src/game/data.js';
import {FLEET_PAINTS} from '/src/game/fleetPaintCatalog.js';
import {CONCOURSE_STAGING,concoursePose} from '/src/game/concourseShip.js';
import {createOutfittingState} from '/src/game/outfitting.js';

const until=(fn,ms=90000)=>new Promise((resolve,reject)=>{const end=performance.now()+ms;const step=()=>fn()?resolve():performance.now()>end?reject(Error('Die Vorschau konnte nicht geladen werden.')):setTimeout(step,30);step();});
const catalog={version:window.LANDING_REFERENCE_VERSION,ports:DOCK_LOCATION_IDS.map(id=>({id,name:LOCATIONS[id].name,scale:CONCOURSE_STAGING[id].scale,rotationDeg:CONCOURSE_STAGING[id].rotationDeg,placements:CONCOURSE_STAGING[id].placements})),hulls:Object.values(SHIPS).map(s=>({id:s.id,name:s.name,paints:FLEET_PAINTS[s.id].paints.map(p=>({id:p.id,name:p.name}))}))};
let rt,view,config;
async function boot(){
 await until(()=>window.__VOID_PRIVATEER__?.newGame);
 document.querySelector('[data-ui-command="new"]').click();document.querySelector('[data-ui-command="skip-new-career"]').click();
 await until(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&!__VOID_PRIVATEER__.getRuntime().ui.concourseArrivalPending&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
 rt=__VOID_PRIVATEER__.getRuntime();view=rt.ui.concourseShip;view.reducedMotion=true;view.pause();rt.ui.actions.launch=async()=>false;
 rt.save.world.underworld??={};for(const id of DOCK_LOCATION_IDS)rt.save.world.underworld[id]=1000;
 rt.ui.showDock(rt.save,'helix');await until(()=>!rt.ui.concourseArrivalPending);view.pause();
}
const ready=boot();
async function render(next){
 await ready;const previous=config;config=structuredClone(next);rt.ui.concoursePlacement=config.layout.placements[config.device];
 const changed=rt.ui.dockLocation!==config.port||view.loadedShipId!==config.hull||view.model?.userData.livery!==config.paint;
 if(changed){
  const p=rt.save.player;p.shipId=config.hull;p.outfitting=createOutfittingState([config.hull]);p.shipPaints??={};p.shipPaints[config.hull]=config.paint;p.dockedAt=config.port;p.systemId=LOCATIONS[config.port].systemId;
  rt.ui.showDock(rt.save,config.port);await until(()=>!rt.ui.concourseArrivalPending&&view.loadedShipId===config.hull&&view.location===config.port);
 }
 if(previous?.device!==config.device)await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 view.pause();view.profile=CONCOURSE_STAGING[config.port];view.setLayout(view.profile);
 view.applyPose(concoursePose('idle',0));view.renderer.shadowMap.needsUpdate=true;view.reflection.dirty=true;rt.ui.syncConcourseOverlay();view.render();
 document.querySelector('.scene-pointers').style.visibility=config.menus?'visible':'hidden';
 const scene=document.querySelector('.station-scene').getBoundingClientRect(),stage=view.host.getBoundingClientRect(),boxes={};
 const box=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height};};boxes.ship=box(document.querySelector('.concourse-hover-ship'));
 const buttons={};for(const key of ['services','market','bar','den']){const e=document.querySelector('.concourse-pointer-'+key);if(e){const b=box(e);boxes[key]=b;buttons[key]={x:(b.x-scene.x)/scene.width,y:(b.y-scene.y)/scene.height};}}
 return {port:config.port,hull:config.hull,paint:config.paint,boxes,scene:{x:scene.x,y:scene.y,w:scene.width,h:scene.height},placement:{ship:{x:(stage.x+stage.width/2-scene.x)/scene.width,y:(stage.y+stage.height/2-scene.y)/scene.height,zoom:view.camera.zoom},buttons}};
}
window.__LANDING_PREVIEW__={catalog,ready,render};
window.render_game_to_text=()=>JSON.stringify({port:config?.port,layout:config?.layout});
