// One stock novice against a stationary starter with a bounded turn rate and
// short trigger bursts. Fight time ends on surrender, destruction or pilot loss.
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{}),args:['--no-sandbox','--disable-gpu-sandbox','--use-gl=angle','--use-angle=swiftshader','--mute-audio']});
const results=[],arena=process.env.MODE==='arena';
try {
 for(const seed of [718,1501,9007]){
  const page=await browser.newPage({serviceWorkers:'block'});
  await page.goto((process.env.VR_BASE_URL??'http://127.0.0.1:4173')+'/game.html?startup-probe=1');
  await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.evaluate(arena=>arena?__VOID_PRIVATEER__.startArena('open','1v1','novice'):__VOID_PRIVATEER__.newGame(),arena);
  const result=await page.evaluate(async seed=>{
   const r=__VOID_PRIVATEER__.getRuntime(),T=await import('/vendor/three.module.min.js');
   cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);
   const p=r.save.player;r.save.world.seed=seed;r.save.world.time=100;r.entityCounter=100;r.save.quests=[];r.clearTransientSpace();r.ships.length=0;
   p.dockedAt=undefined;p.position=[3500,6000,2100];p.rotation=[0,0,0,1];p.velocity=[0,0,0];p.throttle=0;
   const ship=r.spawnShip('pirate',[3500,6000,1400],undefined,undefined,{tier:'novice',temperament:'steady'},{hullId:'scrapper',faction:'pirates'});
   if(r.arena)ship.noSurrender=true; // A manually staged Arena opponent follows the normal sortie rule.
   ship.hostile=true;ship.mugCapable=false;ship.targetId='player';ship.rotation=[0,1,0,0];p.currentTargetId=ship.id;
   const {weaponRange}=await import('/src/game/weapons.js');
   const range=Math.max(0,...ship.combatFit.weaponDefinitions.filter(Boolean).map(w=>weaponRange(w)));
   const forward=new T.Vector3(0,0,-1),offset=new T.Vector3(),origin=new T.Vector3(),q=new T.Quaternion(),aim=new T.Quaternion();
   let seconds=0,shots=0,hits=0,visible=0,hidden=0,maxGap=0,gap=0,merges=0,close=false,firstShot=null,inRange=null;
   const fire=r.fireNpcGun.bind(r),damage=r.damagePlayer.bind(r);
   r.fireNpcGun=(s,...args)=>{const energy=s.energy,counter=r.projectileCounter;const out=fire(s,...args);if(s===ship&&s.targetId==='player'&&(s.energy<energy||counter!==r.projectileCounter)){shots++;firstShot??=seconds;}return out;};
   r.damagePlayer=(amount,source,...rest)=>{if(['weapons fire','beam fire','missile strike'].includes(source))hits++;return damage(amount,source,...rest);};
   for(let tick=0;tick<90*60&&ship.hull>0&&!ship.surrendered&&p.hull>0;tick++){
    seconds=(tick+1)/60;origin.fromArray(p.position);offset.fromArray(ship.position);const d=offset.distanceTo(origin);
    if(d<range){inRange??=seconds;if(!r.lineBlocked(origin,offset,ship.id))visible++;}
    if(!r.shipTracksPlayer(ship)){hidden++;gap++;maxGap=Math.max(maxGap,gap);}else gap=0;
    if(d<100&&!close){merges++;close=true;}else if(d>160)close=false;
    aim.setFromUnitVectors(forward,offset.sub(origin).normalize());q.fromArray(p.rotation).rotateTowards(aim,.9/60).toArray(p.rotation);
    const aligned=q.angleTo(aim)<.12;
    r.updateSimulation(1/60,{pitch:0,yaw:0,roll:0,fire:aligned&&tick%120<42});
   }
   return {seed,range,seconds,firstShot,fromRange:firstShot===null||inRange===null?null:Math.max(0,firstShot-inRange),lofr:visible/(seconds*60),mergesPerMin:merges*60/seconds,hiddenSeconds:hidden/60,maxHidden:maxGap/60,shotsPerMin:shots*60/seconds,hitsPerMin:hits*60/seconds,outcome:ship.surrendered?'surrender':ship.hull<=0?'kill':p.hull<=0?'pilot lost':'timeout'};
  },seed);
  results.push(result);console.log(result);await page.close();
 }
 const path=process.env.OUT??'output/career-combat/benchmark.json';await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(results,null,2));
} finally {await browser.close();}
