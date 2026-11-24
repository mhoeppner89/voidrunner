// Fixed-step, armed duels in authored Arena entries using the career geometry.
// node --import ./tests/helpers/offline-imports.mjs tools/playtest/probes/npc-routes.mjs
// PAIRS=6 measures a twelve-fighter engagement. OUT selects the JSON file.
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import * as THREE from '../../../vendor/three.module.min.js';
import {fieldWorld} from '../../../tests/helpers/field-world.mjs';
import {advanceFieldRoadmap} from '../../../src/game/fieldRoadmap.js';
import {regenerateCombatResources} from '../../../src/game/combatResources.js';
import {weaponRange} from '../../../src/game/weapons.js';

const sites = (process.env.SITES ?? 'shardbelt-rim,shardbelt-heart,shardbelt-chimney,redwake-belt,mourning-center,mourning-carrier,foundry-lanes').split(',');
const tiers = (process.env.TIERS ?? 'novice,veteran,ace').split(',');
const seeds = (process.env.SEEDS ?? '175,718,941').split(',').map(Number);
const seconds = Number(process.env.SECONDS ?? 60), pairs = Number(process.env.PAIRS ?? 1);
const modes=(process.env.MODES??(pairs===1?'duel,search-hold':'duel')).split(',');
if(modes.some(mode=>mode!=='duel'&&mode!=='search-hold'))throw new Error('MODES accepts duel and search-hold');
const output = process.env.OUT ?? 'output/npc-routes/duels.json';
const forward = new THREE.Vector3(0,0,-1), direction = new THREE.Vector3(), position = new THREE.Vector3(), end = new THREE.Vector3();
const rays = [];
for (const x of [-1,0,1]) for (const y of [-1,0,1]) for (const z of [-1,0,1]) {
    if (x || y || z) rays.push(new THREE.Vector3(x,y,z).normalize());
}

function haltContext(ship, now) {
    const nav = ship.fieldNav;
    if (now - (ship.combatBumpAt ?? -Infinity) < .5) return 'contact';
    if (nav.speedLimit < ship.speed * .1) return nav.active ? 'blocked detour' : 'blocked approach';
    if (ship.aceMove) return ship.aceMove.kind;
    if (ship.pilotJudgment?.active && ship.pilotJudgment.until > now) return ship.pilotJudgment.kind;
    if (ship.combatPlan.recovery?.active) return 'combat recovery';
    return nav.active ? 'turning onto detour' : 'combat turn';
}

// Exclusive command attribution on each slow tick (60 Hz). Proximity and
// visibility samples run at 5 Hz and have a separate denominator.
function attackCause(ship,gun,beforeTerrain,firing,drifting,routed,ace,judgment,terrain){
    const nav=ship.fieldNav, plan=ship.combatPlan;
    if(firing && gun<ship.speed*.31 && beforeTerrain===gun && gun<=nav.speedLimit && !drifting)return 'gun request';
    if(nav.recovering && (nav.active||nav.noExit))return 'stuck';
    if(nav.speedLimit<beforeTerrain && nav.speedLimit<ship.speed*.65)return 'cap';
    if(nav.active)return 'detour';
    if(routed)return 'route';
    if(ace||judgment||terrain)return (ace||judgment||terrain).kind;
    if(plan.recovery?.active)return 'recharge';
    if(ship.combatIntent==='reposition'||plan.overshoot)return 'merge';
    if(gun<ship.speed*.99)return 'gunnery';
    if(drifting)return 'drift';
    return ship.combatIntent==='evade'?'evade':'pursuit';
}

function measure(site, tier, seed, mode) {
    const s = fieldWorld(seed);
    s.stageArenaSite(site);
    advanceFieldRoadmap(s, Infinity);
    const start = [...s.save.player.position], entry = s.arenaStage.entries.find(e=>e.front).position;
    s.save.player.position = [1e7,1e7,1e7];
    s.tmpEuler = new THREE.Euler(); s.tmpCollide = new THREE.Vector3(); s.pickups = [];
    for (const name of ['spawnMuzzleFlash','spawnImpact','spawnRockImpact','showCombatBeam','spawnExplosion']) s.renderer[name] = ()=>{};
    const metrics = new Map(), trace = [];
    let cause='unmeasured';
    if(process.env.TIMING_ONLY!=='1')s.onNpcThrottle=(ship,gun,requested,firing,drifting,routed,ace,judgment,terrain)=>{
        cause=attackCause(ship,gun,requested,firing,drifting,routed,ace,judgment,terrain);
    };
    for (let i=0; i<pairs*2; i++) {
        const side = i%2, at = [...(side ? entry : start)], target = side ? start : entry;
        at[0] += Math.floor(i/2)*30;
        const ship = s.spawnShip(side ? 'patrol' : 'pirate', at, undefined, undefined, {tier,temperament:'steady'});
        direction.fromArray(target).sub(position.fromArray(at)).normalize();
        new THREE.Quaternion().setFromUnitVectors(forward,direction).toArray(ship.rotation);
        direction.multiplyScalar(ship.speed*.6).toArray(ship.velocity);
        ship.combatFit.turrets = []; ship.combatFit.missiles = 0;
        for (const rack of ship.combatFit.racks ?? []) rack.missiles = 0;
        const range = Math.max(...ship.combatFit.weaponDefinitions.filter(Boolean).map(w=>weaponRange(w)));
        metrics.set(ship.id,{id:ship.id,hull:ship.hullId,range,slow:{},modeTicks:{},slow30:0,slow10:0,halts:[],brakes:0,contacts:0,nearSpeed:0,near:0,samples:0,visible:0,shots:0,hits:0,first:null,history:new Float64Array(90),lastBrake:-100,lastContact:-100,halt:null,approach:[]});
    }
    if(mode==='search-hold'){
        for(let i=0;i<s.ships.length;i+=2){
            const hunter=s.ships[i];
            hunter.hostile=true;hunter.targetId='player';hunter.playerAwareness=0;hunter.playerTrackOccluded=true;
            s.beginSearch(hunter,s.ships[i+1].position,'hostile');
        }
    }
    const fire = s.fireNpcGun.bind(s);
    s.fireNpcGun = (ship,...args)=>{
        const energy=ship.energy, counter=s.projectileCounter;
        fire(ship,...args);
        if (ship.energy<energy || s.projectileCounter!==counter) {
            const m=metrics.get(ship.id); m.shots++; m.first ??= s.save.world.time;
        }
    };
    s.damageShip = (ship,amount,owner)=>{ if (metrics.has(owner)) metrics.get(owner).hits++; };
    let aiMs=0;
    for (let step=0; step<seconds*60; step++) {
        const now = s.save.world.time = step/60;
        if (s.fieldRoadmap && !s.fieldRoadmap.ready) advanceFieldRoadmap(s,4);
        for (const [index,ship] of s.ships.entries()) {
            const other=s.ships[index^1], m=metrics.get(ship.id);
            if(mode==='duel')ship.targetId=other.id;
            ship.fireCooldown-=1/60;
            regenerateCombatResources(ship,ship.combatFit.resources,1/60,0);
            position.fromArray(other.position);direction.fromArray(other.velocity);
            const t=performance.now();
            let controller;
            if(mode==='duel'){
                controller='attack';
                s.updateAttackAI(ship,position,direction,1/60);
            }else if(ship.search){
                controller='search';
                s.updateSearchAI(ship,1/60);
                s.updateTravelAI(ship,1/60);
                cause='search';
            }else{
                controller='hold';
                s.holdDistressStation(ship,1/60);
                cause='hold';
            }
            aiMs+=performance.now()-t;
            m.modeTicks[controller]=(m.modeTicks[controller]??0)+1;
            s.resolveNpcCollisions(ship);
            const speed=Math.hypot(...ship.velocity), fraction=speed/s.npcFlightStats(ship).maxSpeed;
            if (step%12===0) {
                const nav=ship.fieldNav;
                m.approach.push({step,speed,cap:nav?.speedLimit,arc:nav?.pathClear,detour:nav?.active,
                    recovery:nav?.recovering,waypointDistance:nav?.active?nav.position.distanceTo(nav.waypoint):null});
                if (m.approach.length>11) m.approach.shift();
            }
            if (fraction<.3) {
                m.slow30++;
                m.slow[cause]=(m.slow[cause]??0)+1;
            }
            if (fraction<.1) m.slow10++;
            if (fraction<.05) {
                m.halt ??= {start:step,ticks:0,cause:controller==='attack'?haltContext(ship,now):controller,approach:[...m.approach]};
                m.halt.ticks++;
            } else if (m.halt) {
                if (m.halt.ticks>=30) m.halts.push(m.halt);
                m.halt=null;
            }
            if (fraction<.4 && step-m.lastBrake>90 && m.history.some(f=>f>.8)) {m.brakes++;m.lastBrake=step;}
            m.history[step%90]=fraction;
            if (ship.combatBumpAt===now) {
                if (step-m.lastContact>30) m.contacts++;
                m.lastContact=step;
            }
            if (step%12===0) {
                position.fromArray(ship.position); end.fromArray(other.position); m.samples++;
                if (position.distanceTo(end)<m.range && !s.lineBlocked(position,end)) m.visible++;
                const near=4*Math.max(...s.npcHullExtents(ship));
                if (rays.some(ray=>s.lineBlocked(position,end.copy(position).addScaledVector(ray,near)))) {m.near++;m.nearSpeed+=speed;}
                if (index===0 && pairs===1) trace.push([...ship.position,speed]);
            }
        }
        s.updateProjectiles(1/60); s.cleanupEntities();
    }
    for (const m of metrics.values()) {
        if (m.halt?.ticks>=30) m.halts.push(m.halt);
        for (const key of ['halt','history','lastContact','lastBrake','approach']) delete m[key];
    }
    return {mode,site,tier,seed,seconds,ticksPerFighter:seconds*60,aiMsPerStep:aiMs/(seconds*60),ships:[...metrics.values()],trace};
}

await mkdir(dirname(output),{recursive:true});
const rows=[];
for (const mode of modes) for (const site of sites) for (const tier of tiers) for (const seed of seeds) {
    const row=measure(site,tier,seed,mode); rows.push(row);
    console.log(site,tier,seed,row.ships.flatMap(s=>s.halts).map(h=>h.cause));
}
await writeFile(output,JSON.stringify(rows));

// Pool fighter-time, including pilots that never got a shot. First-shot
// latency alone excludes those pilots, so report their number beside it.
const groups=new Map();
for(const row of rows){
    const key=row.mode+' '+row.site+' '+row.tier;
    const group=groups.get(key) ?? {mode:row.mode,site:row.site,tier:row.tier,minutes:0,slow30:0,slow10:0,halts:0,
        haltSeconds:0,brakes:0,contacts:0,nearSpeed:0,near:0,shots:0,hits:0,samples:0,visible:0,
        first:0,fired:0,silent:0,slow:{}};
    groups.set(key,group);
    for(const ship of row.ships){
        group.minutes+=row.seconds/60;
        for(const [cause,ticks] of Object.entries(ship.slow))group.slow[cause]=(group.slow[cause]??0)+ticks;
        for(const k of ['slow30','slow10','brakes','contacts','nearSpeed','near','shots','hits','samples','visible'])group[k]+=ship[k];
        group.halts+=ship.halts.length;
        for(const halt of ship.halts)group.haltSeconds+=halt.ticks/60;
        if(ship.first==null)group.silent++;
        else {group.first+=ship.first;group.fired++;}
    }
}
const round=n=>Number(n.toFixed(2));
console.table([...groups.values()].map(g=>({
    mode:g.mode,site:g.site,tier:g.tier,minutes:g.minutes,slow30Pct:round(g.slow30/(g.minutes*36)),slow10Pct:round(g.slow10/(g.minutes*36)),
    halts:g.halts,haltSeconds:round(g.haltSeconds),brakesPerMin:round(g.brakes/g.minutes),
    nearSpeed:g.near?round(g.nearSpeed/g.near):null,contactsPerMin:round(g.contacts/g.minutes),
    firstShot:g.fired?round(g.first/g.fired):null,silent:g.silent,visiblePct:round(100*g.visible/g.samples),
    shotsPerMin:round(g.shots/g.minutes),hitsPerMin:round(g.hits/g.minutes)
})));

console.log('Seconds below 30% cruise by command');
console.table([...groups.values()].map(g=>({mode:g.mode,site:g.site,tier:g.tier,
    ...Object.fromEntries(Object.entries(g.slow).map(([cause,ticks])=>[cause,round(ticks/60)]))
})));
