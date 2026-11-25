// Transient sortie state. Only the checkpoint at level start goes into the save.
import * as THREE from 'three';
import {capitalHull,capitalMountPosition} from './capitalHulls.js';
import {arenaSite} from './arenaSites.js';
import {SHIP_COLLIDERS,shipVsSphere} from './shipCollision.js';
import {npcShipScaleForVariant} from './render.js';
import {SHIPS} from './data.js';
import {t} from './i18n.js';

const WARNING = 5;
const MIN_GROUP_INTERVAL = 15;
const NOSE = new THREE.Vector3(0,0,-1);
const promotedTier=tier=>tier==='novice'?'veteran':tier==='veteran'?'ace':tier;
const alive = ship => ship && ship.hull > 0;
export const isRunCapital = spec => spec.capital || spec.role==='frigate';
export function battleState(wave, index, hard) {
    const finalAct = index >= 20;
    const groups = wave.groups.map(group => {
        let aceSlots = finalAct ? 2 - group.enemies.filter(s=>!isRunCapital(s)&&s.tier==='ace').length : Infinity;
        const enemies = group.enemies.map(spec=>{
            const promote = hard && spec.tier==='veteran' && (isRunCapital(spec) || aceSlots-- > 0);
            return {...spec,tier:promote||hard&&spec.tier==='novice'?promotedTier(spec.tier):spec.tier};
        });
        return {...group,enemies};
    });
    const auxiliary=spec=>hard&&spec?{...spec,tier:promotedTier(spec.tier)}:spec;
    return {groups,supportFighter:auxiliary(wave.support?.fighter),launchFighter:auxiliary(wave.launch?.fighter),group:0,serial:0,lastArrival:0,interval:index<5?45:60,limit:finalAct?4:3,
        aceLimit:finalAct?2:Infinity,supportCount:0,nextSupport:wave.support?.every,
        thresholds:[60,30,10],outcome:null};
}
function fits(session, battle, specs, limit=battle.limit) {
    let fighters=0, aces=0;
    for(const ship of session.ships){
        if(!ship.arenaRunEnemy||!alive(ship)||ship.capitalClass||ship.arenaLaunched)continue;
        fighters++;if(ship.pilot?.tier==='ace')aces++;
    }
    for(const spec of specs)if(!isRunCapital(spec)){fighters++;if(spec.tier==='ace')aces++;}
    return fighters<=limit && aces<=battle.aceLimit;
}
function entry(session,index,rear) {
    const plan=session.arenaSiteEntry(index,rear);
    if(plan)return plan;
    const position=session.runEntryPosition(index%3);
    return position&&{position};
}
function logObjective(session,line,tone='info',summary=line) {
    session.ui.pushEvent(line,tone,6000,summary);
    session.ui.logCommsLine?.(t('Range control'),line,'ally');
}
function jump(session,ship) {
    const direction = new THREE.Vector3().fromArray(ship.velocity);
    if(direction.lengthSq()<1)direction.copy(NOSE).applyQuaternion(new THREE.Quaternion().fromArray(ship.rotation));
    session.renderer.spawnHyperdriveStreak?.(ship.position,direction.toArray());
    ship.arenaJumped=true;ship.hull=-1;
}
function decide(session,battle,outcome,elapsed) {
    battle.outcome=outcome;battle.warning=null;
    session.ui.setRunInbound?.(null);
    logObjective(session,t(outcome==='success'?'Objective complete.':'Objective failed. No equipment reward.'),outcome==='success'?'success':'warning',t(outcome==='success'?'Objective complete.':'Objective failed'));
    let count=0;
    for(const ship of session.ships)if(ship.arenaRunEnemy&&alive(ship)){
        ship.arenaRetreatAt=elapsed+Math.min(9.5,2+count++*.6);
        ship.targetId=undefined;ship.holdFire=true;ship.pursuitHoldFire=true;
        const direction=new THREE.Vector3().fromArray(ship.position).sub(new THREE.Vector3().fromArray(session.save.player.position)).normalize();
        ship.arenaExit=direction.multiplyScalar(1500).add(new THREE.Vector3().fromArray(ship.position)).toArray();
    }
}
// The convoy flies straight along a clear lane at a known cruise speed. Its
// distance to the jump point determines both the jump and the radio countdown.
function runTransport(session,ship,seconds) {
    const speed=ship.speed*.75, origin=new THREE.Vector3().fromArray(ship.position);
    const dir=new THREE.Vector3(),end=new THREE.Vector3();
    for(let i=0;i<32;i++){
        const angle=i*2.399963;
        dir.set(Math.cos(angle),.35+i*.06,Math.sin(angle)).normalize();
        end.copy(origin).addScaledVector(dir,speed*seconds);
        if(!session.lineBlocked(origin,end,ship.id))break;
    }
    ship.arenaJumpPoint=end.toArray();ship.arenaCruise=speed;
    ship.rotation=new THREE.Quaternion().setFromUnitVectors(NOSE,dir).toArray();
    dir.multiplyScalar(speed).toArray(ship.velocity);
}
function objectiveTick(session,wave,battle,elapsed) {
    const objective=wave.objective,target=battle.target;
    if(!objective || !target)return;
    if(objective.kind==='destroy'){
        if(alive(target))return;
        if(objective.clearLaunches && session.ships.some(s=>s.arenaLaunched&&alive(s))){
            if(!battle.carrierDown)logObjective(session,t('Carrier down. Destroy the launched fighters.'),'warning',t('Clear fighters'));
            battle.carrierDown=true;return;
        }
        decide(session,battle,target.arenaJumped?'failed':'success',elapsed);return;
    }
    const intercept=objective.kind==='stop';
    const drivesDead=intercept&&capitalHull(target).engines.every(m=>target.capitalMountHull[m.index]<=0);
    if(!alive(target)||drivesDead){
        if(drivesDead&&alive(target)){
            target.arenaRunEnemy=false;target.hostile=false;target.poweredDown=true;target.targetId=undefined;
            target.holdFire=true;target.pursuitHoldFire=true;
            target.velocity.fill(0);target.engineThrust=0;
        }
        decide(session,battle,intercept?'success':'failed',elapsed);return;
    }
    const goal=target.arenaJumpPoint,pos=target.position;
    const remaining=Math.hypot(goal[0]-pos[0],goal[1]-pos[1],goal[2]-pos[2])/(target.arenaCruise*target.engineThrust);
    if(remaining<=1/30){jump(session,target);decide(session,battle,intercept?'failed':'success',elapsed);return;}
    if(battle.thresholds.length&&remaining<=battle.thresholds[0]){
        const seconds=battle.thresholds.shift();
        logObjective(session,t('Drover jumps in {seconds} s.',{seconds}),'warning',t('Drover · {seconds} s',{seconds}));
    }
}
function announce(session,warning,elapsed) {
    if(!warning.announced){
        if(!session.chatterOpen(true))return;
        warning.at=Math.max(warning.at,elapsed+WARNING);
        warning.announced=true;
        session.runRadio(warning.line);
        session.ui.pushEvent(warning.line,'warning',5000,warning.line);
    }
    const point=warning.entry.position;
    if(!session.renderer.camera)return;
    const vector=(session.runMarkerVector??=new THREE.Vector3()).fromArray(point).project(session.renderer.camera);
    const projection=warning.projection??={visible:true};
    projection.x=(vector.x+1)*session.renderer.viewportWidth/2;
    projection.y=(1-vector.y)*session.renderer.viewportHeight/2;
    projection.behind=vector.z>1;
    const marker=warning.marker??={};
    const edge=session.targetEdge(projection,false,marker);
    if(!edge){marker.x=projection.x;marker.y=projection.y;}
    marker.angle=marker.angleDeg;marker.edge=Boolean(edge);
    marker.seconds=Math.max(0,Math.ceil(warning.at-elapsed));
    session.ui.setRunInbound?.(marker);
}
// Bays progress independently. A destroyed mast slows the remaining launch
// cycle immediately. A bay names its damageable subsystem and flight socket.
export function launchCycle(battle,config,dt) {
    const target=battle.target;
    if(!alive(target))return [];
    const mounts=capitalHull(target).mounts;
    const intact=node=>mounts.some(m=>m.node===node&&target.capitalMountHull[m.index]>0);
    const rate=config.mast&&!intact(config.mast)?0.5:1;
    const lanes=battle.lanes??=(config.bays??[{}]).map(bay=>({...bay,anchor:config.sockets?.[bay.socket],remaining:config.every}));
    for(const bay of lanes){
        bay.rate=rate;
        bay.open=!bay.subsystem||intact(bay.subsystem);
        if(bay.open)bay.remaining=Math.max(0,bay.remaining-dt*rate);
    }
    return lanes;
}
function launchEntry(session,battle,bay) {
    if(!bay.socket)return entry(session,battle.serial,true);
    const ship=battle.target;
    if(!bay.pose){
        const mount=bay.anchor?null:capitalHull(ship).mounts.find(m=>m.node===bay.socket);
        if(!bay.anchor&&!mount)return null;
        bay.mount=mount;
        bay.pose={position:[0,0,0],socket:{normal:bay.anchor?.direction_game??mount.normal}};
        bay.point=new THREE.Vector3();bay.origin=new THREE.Vector3();bay.rotation=new THREE.Quaternion();
    }
    if(bay.anchor)bay.point.fromArray(bay.anchor.game_position).applyQuaternion(bay.rotation.fromArray(ship.rotation)).add(bay.origin.fromArray(ship.position));
    else capitalMountPosition(ship,bay.mount.index,bay.point);
    bay.point.toArray(bay.pose.position);
    return bay.pose;
}
const capPosition=new THREE.Vector3(),capRotation=new THREE.Quaternion(),contact={};
// Keep the advertised point if possible. Search outward from that point
// (or along the launch normal) when a moving obstacle occupies it.
function formationEntry(session,anchor,index,spec,capitals,obstacles){
    const socket=anchor.socket, point=new THREE.Vector3(), origin=new THREE.Vector3().fromArray(anchor.position);
    const rotation=new THREE.Quaternion().fromArray(socket?session.runBattle.target.rotation:session.save.player.rotation);
    const variant=SHIPS[spec.hullId]?.variant??spec.hullId??'concord-frigate';
    const radius=Math.max(18,(SHIP_COLLIDERS[variant]?.contactRadius??18)*npcShipScaleForVariant(variant)+3);
    const site=arenaSite(session.arenaStage?.siteId);
    const clear=()=>{
        if(!session.siteSpotClear(site,point,obstacles,Math.max(22,radius)))return false;
        for(const cap of capitals){
            if(shipVsSphere(capPosition.fromArray(cap.position),capRotation.fromArray(cap.rotation),
                cap.collisionVariant??cap.variant,npcShipScaleForVariant(cap.variant),point.x,point.y,point.z,radius,contact))return false;
        }
        return true;
    };
    if(socket){
        const outward=new THREE.Vector3().fromArray(socket.normal).applyQuaternion(rotation).normalize();
        for(let distance=16+index*24;distance<=256;distance+=8){
            point.copy(origin).addScaledVector(outward,distance);
            if(clear())return {...anchor,position:point.toArray()};
        }
        return null;
    }
    if(index){
        const angle=(index-1)*Math.PI*2/3;
        origin.add(point.set(Math.cos(angle)*58,Math.sin(angle)*58,10*index).applyQuaternion(rotation));
    }
    point.copy(origin);
    if(!clear()){
        // Increasing eight-unit shells keep displacement local even when a
        // capital's long axis crosses the original formation.
        let found=false;
        for(let distance=8;distance<=512&&!found;distance+=8){
            for(let i=0;i<32;i++){
                const y=1-2*(i+.5)/32,r=Math.sqrt(1-y*y),a=i*2.399963;
                point.set(r*Math.cos(a),y,r*Math.sin(a)).multiplyScalar(distance).add(origin);
                if(clear()){found=true;break;}
            }
        }
        if(!found)return null;
    }
    return {...anchor,position:point.toArray(),largeClear:Boolean(isRunCapital(spec))};
}
function arrive(session,battle,specs,anchor,bay) {
    let center=anchor;
    const obstacles=session.activeFieldObstacles(),capitals=session.ships.filter(ship=>ship.capitalClass&&alive(ship));
    const plans=new Array(specs.length);
    // Reserve every arriving capital before placing its escort, even when
    // the author lists a fighter first. No partial group is spawned on failure.
    for(const capitalPass of [true,false])for(const [i,spec] of specs.entries()){
        if(Boolean(isRunCapital(spec))!==capitalPass)continue;
        const plan=formationEntry(session,center,i,spec,capitals,obstacles);
        if(!plan)return false;
        plans[i]=plan;
        if(i===0)center=plan;
        if(capitalPass){
            const heading=new THREE.Vector3().fromArray(session.save.player.position).sub(capPosition.fromArray(plan.position)).normalize();
            capitals.push({variant:spec.hullId??'concord-frigate',position:plan.position,rotation:new THREE.Quaternion().setFromUnitVectors(NOSE,heading).toArray()});
        }
    }
    for(const [i,spec] of specs.entries()){
        const ship=session.spawnRunShip(spec,battle.serial++,plans[i]);
        if(!ship)return false;
        if(spec.primary)battle.target=ship;
        if(bay){
            ship.arenaLaunched=true;
            if(bay.socket){
                const direction=new THREE.Vector3().fromArray(anchor.socket.normal)
                    .applyQuaternion(new THREE.Quaternion().fromArray(battle.target.rotation)).normalize();
                new THREE.Quaternion().setFromUnitVectors(NOSE,direction).toArray(ship.rotation);
                direction.multiplyScalar(ship.speed*.5).add(new THREE.Vector3().fromArray(battle.target.velocity)).toArray(ship.velocity);
            }
        }
        if(spec.attackObjective){ship.arenaObjectiveAttacker=true;ship.targetId=battle.target?.id;}
    }
    return true;
}
function opening(session,wave,battle,elapsed) {
    const group=battle.groups[0],transport=wave.objective?.transport;
    if(transport&&!battle.target){
        // Put the convoy off the pilot's shoulder, within escort range.
        const origin=new THREE.Vector3().fromArray(session.save.player.position);
        const pos=new THREE.Vector3(120,45,-260).applyQuaternion(new THREE.Quaternion().fromArray(session.save.player.rotation)).add(origin);
        const ship=session.spawnRunShip({...transport,friendly:true},0,{position:pos.toArray()});
        if(!ship)return false;
        battle.target=ship;ship.arenaFriendlyObjective=true;
    }
    const anchor=entry(session,0,false);
    if(!anchor||!arrive(session,battle,group.enemies,anchor))return false;
    battle.group=1;battle.lastArrival=elapsed;
    if(wave.objective){
        if(wave.objective.seconds&&battle.target)runTransport(session,battle.target,wave.objective.seconds);
        logObjective(session,t(wave.hint),'info',t(wave.objective.label));
    }
    return true;
}
export function tickBattle(session,wave,elapsed,dt) {
    const battle=session.runBattle;
    if(!battle.group){opening(session,wave,battle,elapsed);return false;}
    if(!battle.outcome)objectiveTick(session,wave,battle,elapsed);
    if(battle.outcome){
        for(const ship of session.ships)if(alive(ship)&&elapsed>=ship.arenaRetreatAt)jump(session,ship);
        return !session.ships.some(s=>s.arenaRunEnemy&&alive(s));
    }
    let survivors=0,launched=0;
    for(const ship of session.ships)if(ship.arenaRunEnemy&&alive(ship)){
        survivors++;if(ship.arenaLaunched)launched++;
    }
    const group=battle.groups[battle.group];
    const lanes=wave.launch?launchCycle(battle,wave.launch,dt):[];
    let pending=battle.warning;
    if(!pending){
        let specs,at,line,bay,support=false;
        if(group&&fits(session,battle,group.enemies,group.limit)){
            let deadline=battle.lastArrival+battle.interval;
            if(group.at!==undefined)deadline=Math.min(deadline,(battle.primaryAt??0)+group.at);
            const hullGate=group.hullBelow&&battle.target?.hull<battle.target.maxHull*group.hullBelow;
            const earliest=battle.lastArrival+MIN_GROUP_INTERVAL;
            if(elapsed>=earliest-WARNING&&(survivors<=1||hullGate||elapsed>=deadline-WARNING)){
                specs=group.enemies;at=Math.max(earliest,elapsed+WARNING);
                line=t('Group {group}/{total} inbound.',{group:battle.group+1,total:battle.groups.length});
            }
        }
        if(wave.support&&alive(battle.target)&&battle.supportCount<wave.support.total&&elapsed>=battle.nextSupport-WARNING&&fits(session,battle,[battle.supportFighter])){
            support=true;specs=[battle.supportFighter];at=Math.max(battle.nextSupport,elapsed+WARNING);
        }
        if(wave.launch&&launched+2<=wave.launch.cap){
            bay=lanes.find(b=>b.open&&b.remaining<=WARNING*b.rate);
            if(bay){specs=[battle.launchFighter,battle.launchFighter];at=elapsed+WARNING;}
        }
        if(specs){
            let anchor=bay?launchEntry(session,battle,bay):entry(session,battle.serial,true);
            if(anchor&&isRunCapital(specs[0]))anchor=session.runCapitalEntry(specs[0],anchor);
            if(anchor){
                line??=t('Reinforcements inbound.');
                const marked=bay?.socket?anchor:{...anchor,position:[...anchor.position]};
                pending=battle.warning={specs,at,line,entry:marked,bay,support,limit:bay||support?battle.limit:group.limit};
            }
        }
    }
    if(pending){
        const {bay,support,specs}=pending;
        if((bay&&!bay.open)||((bay||support)&&!alive(battle.target))){
            battle.warning=null;session.ui.setRunInbound?.(null);
        }else{
            if(bay){
                pending.at=Math.max(pending.at,elapsed+bay.remaining/bay.rate);
                if(bay.socket)pending.entry=launchEntry(session,battle,bay);
            }
            announce(session,pending,elapsed);
            if(pending.announced && elapsed>=pending.at && (bay?bay.remaining<=.001:fits(session,battle,specs,pending.limit))){
                if(arrive(session,battle,specs,pending.entry,bay)){
                    if(bay){
                        bay.remaining=wave.launch.every;
                        // Bays that warmed together launch together. Count complete pairs.
                        let occupied=launched+2;
                        for(const sibling of lanes){
                            if(!sibling.open||sibling===bay||sibling.remaining>.001||occupied+2>wave.launch.cap)continue;
                            const slot=launchEntry(session,battle,sibling);
                            if(slot&&arrive(session,battle,specs,slot,sibling)){
                                sibling.remaining=wave.launch.every;occupied+=2;
                            }
                        }
                    }
                    else if(support){battle.supportCount++;battle.nextSupport=elapsed+wave.support.every;}
                    else{battle.group++;battle.lastArrival=elapsed;
                        const arrival=t('Group {group}/{total}',{group:battle.group,total:battle.groups.length});
                        session.ui.pushEvent(arrival,'info',4000,arrival);
                        if(specs.some(s=>s.primary)){
                            battle.primaryAt=elapsed;
                            if(wave.support)battle.nextSupport=elapsed+wave.support.every;
                            if(wave.objective?.seconds)runTransport(session,battle.target,wave.objective.seconds);
                            if(wave.objective)logObjective(session,t(wave.hint),'info',t(wave.objective.label));
                        }
                    }
                    battle.warning=null;session.ui.setRunInbound?.(null);
                }
            }
        }
    }
    return !wave.objective && battle.group===battle.groups.length && !session.ships.some(s=>s.arenaRunEnemy&&alive(s));
}
