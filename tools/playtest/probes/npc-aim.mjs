// NPC gun accuracy against a pilot who flies: per pilot tier, the share of
// enemy rounds that hit, pass close (within NEAR hull radii) or go wide.
// The player cruises at 75 % throttle, turns toward the enemy and weaves
// ±25° on a 3 s rhythm, firing short bursts; MOVE=still parks the player.
// The opponent cannot die or surrender, so every run lasts the full minute.
//   node tools/playtest/probes/npc-aim.mjs   (VR_BASE_URL, default :4173)
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{}),args:['--no-sandbox','--disable-gpu-sandbox','--use-gl=angle','--use-angle=swiftshader','--mute-audio']});
const tiers=(process.env.TIERS??'novice,veteran,ace').split(','),seeds=(process.env.SEEDS??'718,1501,9007').split(',').map(Number);
const move=process.env.MOVE??'weave',hulls=(process.env.HULLS??'scrapper,talon').split(','),NEAR=Number(process.env.NEAR??4);
const rows=[];
try {
 for(const hullId of hulls)for(const tier of tiers){
  const total={hullId,tier,shots:0,hits:0,near:0,wide:0,seconds:0};
  for(const seed of seeds){
   const page=await browser.newPage({serviceWorkers:'block'});
   await page.goto((process.env.VR_BASE_URL??'http://127.0.0.1:4173')+'/game.html?startup-probe=1');
   await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
   await page.evaluate(()=>__VOID_PRIVATEER__.newGame());
   const out=await page.evaluate(async({seed,tier,move,hullId,NEAR})=>{
    const r=__VOID_PRIVATEER__.getRuntime(),T=await import('/vendor/three.module.min.js');
    cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);
    const p=r.save.player;r.save.world.seed=seed;r.save.world.time=100;r.entityCounter=100;r.save.quests=[];r.clearTransientSpace();r.ships.length=0;
    p.dockedAt=undefined;p.position=[3500,6000,2100];p.rotation=[0,0,0,1];p.velocity=[0,0,0];p.throttle=move==='still'?0:.75;
    const ship=r.spawnShip('pirate',[3500,6000,1500],undefined,undefined,{tier,temperament:'steady'},{hullId,faction:'pirates'});
    ship.hostile=true;ship.mugCapable=false;ship.noSurrender=true;ship.targetId='player';ship.rotation=[0,1,0,0];p.currentTargetId=ship.id;
    const radius=Math.max(...r.playerHullExtents());
    const forward=new T.Vector3(0,0,-1),to=new T.Vector3(),me=new T.Vector3(),q=new T.Quaternion(),aim=new T.Quaternion(),side=new T.Quaternion(),up=new T.Vector3(0,1,0),pos=new T.Vector3();
    const closest=new Map();let shots=0,hits=0,close=0,wide=0,beams=0;
    const damage=r.damagePlayer.bind(r);
    r.damagePlayer=(amount,source)=>{if(source==='weapons fire'||source==='beam fire')hits++;p.hull=Math.max(p.hull,1);};
    const fire=r.fireNpcGun.bind(r);
    r.fireNpcGun=(s,...args)=>{const before=r.projectileCounter;const result=fire(s,...args);if(s===ship)for(let id=before+1;id<=r.projectileCounter;id++){closest.set(`p-${id}`,Infinity);shots++;}return result;};
    // Beams leave no projectile: count each ray as a shot; a ray that misses
    // is scored as near when it passes within NEAR radii of the hull.
    const beam=r.fireBeam.bind(r);
    r.fireBeam=(owner,w,start,dir,...rest)=>{if(owner===ship.id){shots++;beams++;const to=me.clone().sub(start),along=to.dot(dir),miss=Math.sqrt(Math.max(0,to.lengthSq()-along*along));if(miss<=radius*NEAR)close++;else wide++;}return beam(owner,w,start,dir,...rest);};
    for(let tick=0;tick<60*60;tick++){
     const t=tick/60;me.fromArray(p.position);to.fromArray(ship.position).sub(me).normalize();
     if(move!=='still'){
      aim.setFromUnitVectors(forward,to);side.setFromAxisAngle(up,25*Math.PI/180*Math.sin(t*2*Math.PI/3));aim.premultiply(side);
      q.fromArray(p.rotation).rotateTowards(aim,1.1/60).toArray(p.rotation);
     }
     ship.hull=ship.maxHull;
     r.updateSimulation(1/60,{pitch:0,yaw:0,roll:0,fire:move!=='still'&&tick%120<36});
     me.fromArray(p.position);
     for(const proj of r.projectiles){
      if(!closest.has(proj.id))continue;
      const d=r.projStore.getPos(proj.slot,pos).distanceTo(me);
      if(d<closest.get(proj.id))closest.set(proj.id,d);
     }
     const live=new Set(r.projectiles.map(x=>x.id));
     for(const [id,d] of closest)if(!live.has(id)){d<=radius*NEAR?close++:wide++;closest.delete(id);}
    }
    r.damagePlayer=damage;
    // Rounds still in flight: classify by closest approach so far.
    for(const d of closest.values())d<=radius*NEAR?close++:wide++;
    // Every hit passed close; the rest of the close rounds are near misses.
    return {shots,hits,near:Math.max(0,close-hits),wide,beams,radius};
   },{seed,tier,move,hullId,NEAR});
   await page.close();
   for(const k of ['shots','hits','near','wide','beams'])total[k]=(total[k]??0)+out[k];total.seconds+=60;total.radius=out.radius;
  }
  const pct=v=>total.shots?`${Math.round(100*v/total.shots)}%`:'—';
  const row={hull:total.hullId,tier,beamShare:pct(total.beams),shotsPerMin:+(total.shots*60/total.seconds).toFixed(1),hit:pct(total.hits),nearMiss:pct(total.near),wide:pct(total.wide),hitsPerMin:+(total.hits*60/total.seconds).toFixed(1)};
  rows.push(row);console.log(row);
 }
 const path=process.env.OUT??`output/npc-aim/${move}.json`;await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(rows,null,2));
} finally {await browser.close();}
