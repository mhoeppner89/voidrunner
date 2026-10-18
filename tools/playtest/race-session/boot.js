import {displaySpeed} from '/src/game/data.js';
import {RACE_COURSES,generateRaceCourse,createRaceRacers} from '/src/game/racing.js';
import {RACE_HULLS,raceHull} from '/src/game/raceHulls.js';
import {shipTopDownProfile,shipProfilePath} from '/src/game/shipTopDownProfile.js';
const overlay=document.querySelector('#race-ready'),go=document.querySelector('#race-go'),restart=document.querySelector('#race-restart'),specs=document.querySelector('#race-specs'),heading=document.querySelector('#race-heading'),choices=document.querySelector('#race-hulls'),coursePicker=document.querySelector('#race-course');
const wait=async(test)=>{const end=Date.now()+120000;while(!test()){if(Date.now()>end)throw Error('Die Flugsysteme brauchen zu lange. Bitte neu laden.');await new Promise(r=>setTimeout(r,60));}};
try{
 await import('/src/main.js');
 await wait(()=>window.__VOID_PRIVATEER__&&document.querySelector('[data-ui-command="new"]'));
 document.querySelector('[data-ui-command="new"]').click();
 await wait(()=>document.querySelector('[data-ui-command="skip-new-career"]'));
 document.querySelector('[data-ui-command="skip-new-career"]').click();
 await wait(()=>window.__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
 const rt=window.__VOID_PRIVATEER__.getRuntime(),player=rt.save.player;
 const normalModal=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(rt.ui),'isModalOpen').get;
 Object.defineProperty(rt.ui,'isModalOpen',{get(){return !overlay.hidden||normalModal.call(this);}});
 rt.persistSave=()=>true;
 for(const name of ['updateDynamicEncounters','updateBountySpawns','updateStationTraffic','updateCapitalTraffic','spawnInitialTraffic'])rt[name]=()=>{};
 const params=new URLSearchParams(location.search),requested=params.get('course');let selected=raceHull(params.get('hull')).id,generation=0;
 const courseIds=Object.keys(RACE_COURSES),initialCourse=courseIds.includes(requested)?requested:'mourning-breach';let course=generateRaceCourse(initialCourse);
 coursePicker.innerHTML=courseIds.map(id=>`<option value="${id}">${RACE_COURSES[id].title}</option>`).join('');coursePicker.value=initialCourse;
 heading.textContent=course.title;document.title=`${course.title} — Rennklasse R`;
 choices.innerHTML=Object.values(RACE_HULLS).map(h=>{const p=shipTopDownProfile(h.id);return `<button data-hull="${h.id}" aria-pressed="${h.id===selected}"><svg viewBox="${p.minX-2} ${p.minZ-2} ${p.maxX-p.minX+4} ${p.maxZ-p.minZ+4}" aria-hidden="true"><path d="${shipProfilePath(shipTopDownProfile(h.id))}"/></svg><b>${h.name}</b><span>${h.style}</span></button>`;}).join('');
 await rt.launch();
 const prepare=async(id=selected)=>{
  const request=++generation;selected=raceHull(id).id;
  overlay.hidden=false;restart.hidden=true;go.disabled=true;coursePicker.disabled=true;go.textContent='Lädt …';
  if(window.isolatedRace)window.isolatedRace.ready=false;
  rt.ui.hidePause();rt.ui.hideMap();rt.ui.hideShipMenu();rt.ui.hideStory(false);rt.endRaceField();
  rt.deathTimer=0;rt.playerDocking=undefined;rt.departureClearance=undefined;
  player.raceHullChoice=selected;player.position.splice(0,3,...course.gathering.position);player.velocity.fill(0);player.angularVelocity.fill(0);
  rt.projectiles=[];rt.pickups=[];rt.ships=[];rt.autopilot=false;rt.afterburning=false;rt.updateActiveInstance(true);
  if(course.zone==='mourning-line')await rt.renderer.ensureGraveyardModels();
  const racers=createRaceRacers(course,175,rt.save.world.time,selected);rt.ships=racers;
  rt.activeRace=rt.createRaceState(course,racers,Infinity);rt.startRaceAt(course);
  rt.ui.clearStatusMessages();rt.ui.updateHud(rt.buildHudModel());rt.simAccumulator=0;
  const hull=raceHull(selected);specs.textContent=`${Math.round(course.routeLength).toLocaleString('de-DE')} km · ${course.gates.length} Tore · ${displaySpeed(hull.maxSpeed)} / ${displaySpeed(hull.afterburnSpeed)} km/s`;
  for(const button of choices.querySelectorAll('button')){button.disabled=true;button.setAttribute('aria-pressed',String(button.dataset.hull===selected));}
  rt.renderer.syncShips(rt.ships);
  await Promise.all(rt.ships.map(ship=>rt.renderer.glbShipLoading.get(ship.variant)));
  if(request!==generation)return;
  rt.renderer.syncShips(rt.ships);rt.renderer.raceSpeedIntensity=1;rt.renderer.updateRaceSpeedLines(0);
  await rt.renderer.prepareActiveScene({timeoutMs:30000});
  if(request!==generation)return;
  rt.renderer.raceSpeedIntensity=0;rt.renderer.updateRaceSpeedLines(0);rt.syncRender(0,performance.now());
  go.disabled=false;coursePicker.disabled=false;go.textContent='Start';for(const button of choices.querySelectorAll('button'))button.disabled=false;
  go.onclick=()=>{void rt.audio.enable().catch(()=>{});rt.activeRace.startedAt=rt.save.world.time+4;rt.ui.hidePause();overlay.hidden=true;restart.hidden=false;};
  window.isolatedRace={ready:true,courseId:course.id,hullId:selected,tuning:{ship:selected,maxSpeed:hull.maxSpeed,afterburnSpeed:hull.afterburnSpeed},restart:prepare,selectHull:prepare,selectCourse:id=>{if(!courseIds.includes(id))throw new Error(`Unbekannte Strecke: ${id}`);course=generateRaceCourse(id);coursePicker.value=id;heading.textContent=course.title;document.title=`${course.title} — Rennklasse R`;const nextParams=new URLSearchParams(location.search);nextParams.set('course',id);history.replaceState(null,'',`${location.pathname}?${nextParams}`);return prepare();}};
 };
 choices.onclick=event=>{const button=event.target.closest('[data-hull]');if(button&&!button.disabled)void prepare(button.dataset.hull);};
 coursePicker.onchange=()=>{void window.isolatedRace.selectCourse(coursePicker.value);};
 await prepare();restart.onclick=()=>{heading.textContent=course.title;void prepare();};
 setInterval(()=>{
  if(overlay.hidden&&(rt.activeRace?.state==='finished'||rt.activeRace?.state==='failed'||!rt.activeRace||rt.deathTimer>0)){
   const result=rt.activeRace?.finishResult;heading.textContent=result?`${result.rank}. Platz · ${result.time.toFixed(1)} s`:'Noch ein Versuch?';
   overlay.hidden=false;restart.hidden=true;go.textContent='Neustart';go.onclick=()=>{heading.textContent=course.title;void prepare();};
  }
 },250);
}catch(error){specs.textContent=error.message;console.error(error);}
