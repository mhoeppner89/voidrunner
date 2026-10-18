import './review.js';
import * as T from 'three';
import {RACE_COURSES,generateRaceCourse} from '/src/game/racing.js';
const review=window.asteroidReview,{scene,camera}=review;
const colors=[0x62dfed,0xffd173,0xff998d],ids=['shard-gauntlet','shard-switchback','shard-miners-knife'];
const picker=document.querySelector('#course'),slider=document.querySelector('#progress'),play=document.querySelector('#play');
const routes=ids.map((id,i)=>{
 const config=RACE_COURSES[id],course=generateRaceCourse(id),points=config.localPoints.map(p=>new T.Vector3(...p)),group=new T.Group(),labels=new T.Group(),line=new T.Group();scene.add(group);group.add(line,labels);
 picker.add(new Option(config.title,id));
 const geometry=new T.BufferGeometry().setFromPoints(points),path=new T.Line(geometry,new T.LineBasicMaterial({color:colors[i],transparent:true,opacity:.95}));line.add(path);
 const hidden=new T.Line(geometry,new T.LineDashedMaterial({color:colors[i],transparent:true,opacity:.22,depthTest:false,dashSize:25,gapSize:20}));hidden.computeLineDistances();hidden.renderOrder=2;line.add(hidden);
 const ringMaterial=new T.MeshBasicMaterial({color:colors[i]}),ringGeometry=new T.TorusGeometry(course.gateRadius,3,5,36),finishGeometry=new T.TorusGeometry(course.finishRadius,4,5,40);
 const start=new T.Mesh(finishGeometry,ringMaterial);start.position.fromArray(course.gathering.localPosition);start.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(...course.gathering.direction));group.add(start);
 course.gates.forEach((gate,j)=>{
  const ring=new T.Mesh(gate.kind==='finish'?finishGeometry:ringGeometry,ringMaterial);ring.position.fromArray(gate.localPosition);ring.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(...gate.direction));group.add(ring);
  if(j%5!==0&&j!==course.gates.length-1)return;
  const c=document.createElement('canvas');c.width=c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#071321ed';ctx.beginPath();ctx.arc(48,48,35,0,Math.PI*2);ctx.fill();ctx.fillStyle='#'+colors[i].toString(16);ctx.font='bold 37px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(gate.kind==='finish'?'F':String(j+1),48,49);
  const sprite=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(c),depthTest:false}));sprite.position.copy(ring.position).add(new T.Vector3(0,95,0));sprite.scale.set(95,95,1);labels.add(sprite);
 });
 return {id,config,course,group,line,labels,points,distances:course.racingLineDistances,length:course.routeLength};
});
let selected=-1,progress=0,playing=false;
document.querySelector('#xray').onclick=event=>{
 const active=event.target.getAttribute('aria-pressed')!=='true';event.target.setAttribute('aria-pressed',String(active));
 const materials=new Set([...review.terrain.children,...review.batches].map(m=>m.material));for(const m of materials){m.transparent=active;m.opacity=active?.18:1;m.depthWrite=!active;m.needsUpdate=true;}
};
function pointAt(f){const r=routes[Math.max(0,selected)],d=T.MathUtils.clamp(f,0,1)*r.length;let j=1;while(j<r.distances.length-1&&r.distances[j]<d)j++;return r.points[j-1].clone().lerp(r.points[j],(d-r.distances[j-1])/(r.distances[j]-r.distances[j-1]));}
function survey(above=false){playing=false;play.textContent='Fly route';routes.forEach(r=>r.line.visible=true);review.setOrbit(new T.Vector3(),above?4400:5400,-2.4,above?1.55:.5);if(selected>=0)routes[selected].labels.visible=true;camera.fov=52;camera.updateProjectionMatrix();}
function choose(index){selected=index;picker.value=ids[Math.max(0,index)];progress=0;slider.value=0;survey();routes.forEach((r,i)=>{r.group.visible=index<0||i===index;r.labels.visible=i===index;});play.disabled=slider.disabled=index<0;document.querySelector('#all').setAttribute('aria-pressed',String(index<0));const r=routes[Math.max(0,index)],facts=document.querySelector('#facts');facts.style.setProperty('--color','#'+colors[Math.max(0,index)].toString(16));facts.querySelector('h1').textContent=index<0?'Three routes through Shardbelt':r.config.title;facts.querySelector('p').textContent=index<0?'Central bore · mineral gallery · broken chimney. Choose a track to inspect its gates.':r.config.briefing;document.querySelector('#numbers').textContent=index<0?routes.map(r=>(r.length/1000).toFixed(1)+'k km').join(' / '):`${Math.round(r.length).toLocaleString('en')} km · ${r.course.gates.length} gates · ${Math.round(r.course.gates[0].radius*2)} km aperture`;document.querySelector('#race').href=`../race-session/index.html?course=${r.id}&revision=0.8.2ij`;history.replaceState(null,'','?course='+(index<0?'all':r.id)+'&revision=0.8.2ij');document.querySelector('#checkpoint').textContent='—';}
function flyView(dt){const r=routes[selected];r.line.visible=false;r.labels.visible=false;if(playing){progress=Math.min(1,progress+dt/(r.length/150));slider.value=Math.round(progress*1000);if(progress>=1){playing=false;play.textContent='Replay';}}const p=pointAt(progress),ahead=pointAt(Math.min(.99999,progress+.003));camera.position.copy(p);camera.up.set(0,1,0);if(p.distanceToSquared(ahead)<.001)ahead.copy(p).add(p.clone().sub(pointAt(progress-.003)));camera.lookAt(ahead);camera.fov=70;camera.updateProjectionMatrix();document.querySelector('#checkpoint').textContent=`${Math.min(r.course.gates.length,1+r.course.gates.filter(g=>g.pathDistance<progress*r.length).length)}/${r.course.gates.length}`;}
picker.onchange=()=>choose(ids.indexOf(picker.value));document.querySelector('#all').onclick=()=>choose(-1);document.querySelector('#above').onclick=()=>survey(true);document.querySelector('#survey').onclick=()=>survey();play.onclick=()=>{if(progress>=1)progress=0;playing=!playing;play.textContent=playing?'Pause':'Resume';review.setCameraDriver(flyView);};slider.oninput=()=>{progress=Number(slider.value)/1000;playing=false;play.textContent='Resume';review.setCameraDriver(flyView);flyView(0);};
window.raceReview={routes,choose,scrub:f=>{slider.value=f*1000;slider.oninput();}};choose(ids.indexOf(new URLSearchParams(location.search).get('course')));window.raceReady=true;
