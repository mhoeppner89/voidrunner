// Fixed-step salvos use live rack, fuze, hull and damage code. Record raw
// shield-equivalent damage so shield recovery and pilot death don't censor it.
import {pathToFileURL} from 'node:url';
import {Vector3,Quaternion} from '../../vendor/three.module.min.js';
import {session} from './session.mjs';
import {updateBargeLaunchers} from '../../src/game/bargeLaunchers.js';
import {updateMissileWarning} from '../../src/game/weaponFlight.js';
import {integrateFlightVelocity,integrateFlightTurn} from '../../src/game/flightDynamics.js';
import {SHIPS} from '../../src/game/data.js';
import {seededRandom} from '../../src/game/random.js';

export function flakTrial(mode,seed,breakAt){
    const dt=1/60,original=Math.random;Math.random=seededRandom(seed);
    try{
        const s=session(),ship=s.spawnCorvette('barge',[0,0,0]),p=s.save.player;
        s.lineBlocked=()=>false;s.firstObstacleHitInfo=()=>undefined;
        Object.assign(ship,{hostile:true,rotation:[0,0,0,1],velocity:[0,0,0],targetId:'player',holdFire:false});
        const rush=mode==='rush',large=mode==='drover',target=large?s.spawnCorvette('drover',[0,0,-900]):p;
        ship.targetId=large?target.id:'player';
        if(large)p.position=[10000,0,0];
        target.position=[0,0,rush?-590:-900];target.velocity=rush?[0,0,65]:[large?5:15,0,0];
        const velocity=new Vector3(...target.velocity),position=new Vector3(...target.position),spin=new Vector3();
        const orientation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),rush?Math.PI:-Math.PI/2);
        const stats=SHIPS.wayfarer,forward=new Vector3(),flight={};
        let damage=0,hits=0,launchAt,firstCue,cues=0,turnAt;
        const record=d=>{damage+=d;hits++;};
        s.damagePlayer=d=>{if(!large)record(d);};s.damageShip=(actor,d)=>{if(actor===target)record(d);};
        for(let i=0;i<1500;i++){
            const now=s.save.world.time+=dt;
            const age=now-(launchAt??Infinity);
            const change=rush?age>=.3:mode==='break'&&age>=(breakAt??((firstCue??Infinity)+.3));
            if(change){
                turnAt??=age;
                integrateFlightTurn(orientation,spin,0,age-turnAt<.8?1:0,0,stats.angularAcceleration,stats.angularDamping,true,true,dt);
                forward.set(0,0,-1).applyQuaternion(orientation);
                integrateFlightVelocity(velocity,forward,stats.afterburnSpeed,stats.afterburnSpeed,stats.acceleration,true,true,1,dt);
            }
            position.addScaledVector(velocity,dt).toArray(target.position);velocity.toArray(target.velocity);
            orientation.toArray(target.rotation);
            if(launchAt===undefined||age<1)updateBargeLaunchers(s,ship,dt,position);
            if(s.projectiles.length)launchAt??=now;
            s.updateProjectiles(dt);
            updateMissileWarning(flight,s.projectiles,s.projStore,p);
            if(flight.missileBreak){firstCue??=now-launchAt;cues++;}
            if(age>1&&s.projectiles.every(x=>x.life<=0))break;
        }
        return {damage,hits,rockets:s.projectiles.length,cues,firstCue};
    }finally{Math.random=original;}
}
export function flakPanel(mode,n=64,breakAt){
    let damage=0,hits=0,cues=0,firstCue=0;
    for(let i=0;i<n;i++){const r=flakTrial(mode,1000+i,breakAt);damage+=r.damage;hits+=r.hits;cues+=r.cues;firstCue+=r.firstCue??0;}
    return {mode,breakAt,damage:damage/n,hits:hits/n,cues:cues/n,firstCue:firstCue/n};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
    const rows=['straight','break','rush','drover'].map(mode=>flakPanel(mode));
    for(const t of [0,.75,3,6,8,9,9.5,10])rows.push(flakPanel('break',64,t));
    console.table(rows);
}
