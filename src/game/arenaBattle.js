// Transient sortie state. Only the checkpoint at level start goes into the save.
import * as THREE from 'three';
import {capitalHull,capitalMountPosition} from './capitalHulls.js';
import {careerRaidTier} from './careerDanger.js';
import {arenaSite} from './arenaSites.js';
import {SHIP_COLLIDERS,shipVsSphere} from './shipCollision.js';
import {npcShipScaleForVariant} from './render.js';
import {SHIPS} from './data.js';
import {t} from './i18n.js';

const REGION_TIERS=['novice','veteran','ace'];
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
    return {groups,launchFighter:auxiliary(wave.launch?.fighter),group:0,serial:0,lastArrival:0,interval:index<5?45:60,limit:finalAct?4:3,
        aceLimit:finalAct?2:Infinity,
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
const KICKER={destroy:'Primary target',stop:'Intercept',defend:'Escort'};
function decide(session,battle,outcome,elapsed,wave) {
    battle.outcome=outcome;battle.warning=null;battle.endAt=undefined;
    session.ui.setRunInbound?.(null);
    const objective=wave?.objective;
    if(objective)session.ui.showObjectiveBanner?.({kicker:t(outcome==='success'?'Objective complete':'Objective failed'),
        title:t(outcome==='success'?objective.done??objective.label:objective.failed??objective.label),
        line:outcome!=='success'?t('No equipment reward this level.')
            :session.ships.some(s=>s.arenaRunEnemy&&alive(s))?t('Remaining hostiles are breaking off.')
            :objective.kind==='defend'?t('The Njord is jumping out.'):'',tone:outcome==='success'?'success':'failed',ms:4000});
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
        decide(session,battle,target.arenaJumped?'failed':'success',elapsed,wave);return;
    }
    const intercept=objective.kind==='stop';
    const drivesDead=intercept&&capitalHull(target).engines.every(m=>target.capitalMountHull[m.index]<=0);
    if(!alive(target)||drivesDead){
        if(drivesDead&&alive(target)){
            target.arenaRunEnemy=false;target.hostile=false;target.poweredDown=true;target.targetId=undefined;
            target.holdFire=true;target.pursuitHoldFire=true;
            target.velocity.fill(0);target.engineThrust=0;
        }
        decide(session,battle,intercept?'success':'failed',elapsed,wave);return;
    }
    const goal=target.arenaJumpPoint,pos=target.position;
    const remaining=Math.hypot(goal[0]-pos[0],goal[1]-pos[1],goal[2]-pos[2])/(target.arenaCruise*target.engineThrust);
    battle.remaining=remaining;
    if(remaining<=1/30){
        if(!intercept)thank(session,target);
        jump(session,target);decide(session,battle,intercept?'failed':'success',elapsed,wave);return;
    }
    // An escort that has beaten every wave is done: the Drover thanks the
    // pilot and jumps a moment later instead of flying out its clock.
    if(!intercept&&battle.group===battle.groups.length&&!battle.warning&&!session.ships.some(s=>s.arenaRunEnemy&&alive(s))){
        thank(session,target);battle.outro={jumpAt:elapsed+2.5};
        decide(session,battle,'success',elapsed,wave);return;
    }
    if(battle.thresholds.length&&remaining<=battle.thresholds[0]){
        const seconds=battle.thresholds.shift();
        logObjective(session,t('Njord jumps in {seconds} s.',{seconds}),'warning',t('Njord · {seconds} s',{seconds}));
    }
}
function thank(session,ship) {
    const line=t('All clear! Thank you, pilot. Jumping out.');
    session.ui.showPilotLine?.(ship.name,line,'ally',6000);
    session.ui.logCommsLine?.(ship.name,line,'ally');
}
const clock=seconds=>{const s=Math.max(0,Math.ceil(seconds));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
// The objective strip: name, shield and hull of the ship the level is about,
// and one status word. Published at 10 Hz; the UI repaints only on change.
function publishObjective(session,wave,battle,elapsed) {
    const objective=wave.objective,target=battle.target;
    if(!objective||!target||!session.ui.setObjectiveStrip)return;
    if(!battle.bannered){
        battle.bannered=true;
        session.ui.showObjectiveBanner?.({kicker:t(objective.clearLaunches?'Carrier strike':KICKER[objective.kind]??'Objective'),title:t(objective.label),line:t(wave.hint)});
    }
    if(elapsed<(battle.stripAt??0))return;
    battle.stripAt=elapsed+.1;
    const live=alive(target)&&!target.arenaJumped,decided=battle.outcome;
    let status;
    if(decided)status=t(decided==='success'?objective.done??'Complete':objective.failed??'Failed');
    else if(objective.kind!=='destroy')status=t('Jump {time}',{time:clock(battle.remaining??objective.seconds)});
    else if(battle.carrierDown){let n=0;for(const ship of session.ships)if(ship.arenaLaunched&&alive(ship))n++;status=t('Fighters {count}',{count:n});}
    else if(objective.clearLaunches){const bays=capitalHull(target).mounts.filter(m=>m.kind==='bay');status=t('Bays {left}/{total}',{left:bays.filter(m=>target.capitalMountHull[m.index]>0).length,total:bays.length});}
    else status=t('Destroy');
    session.ui.setObjectiveStrip({name:target.name,status,
        shield:live&&target.maxShield?target.shield/target.maxShield:0,hull:live?target.hull/target.maxHull:0,
        tone:decided?(decided==='success'?'done':'hostile'):objective.kind==='defend'?'friendly':'hostile'});
}
function announce(session,warning,elapsed) {
    if(!warning.announced){
        warning.at=Math.max(warning.at,elapsed+WARNING);
        warning.announced=true;
        const battle=session.runBattle;
        const title=warning.bay?t('CONTACTS'):t('WAVE {wave}/{total}',{wave:battle.group+1,total:battle.groups.length});
        session.runRadio(warning.line,title,t('INBOUND {seconds} S',{seconds:WARNING}));
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
    if(!battle.lanes){
        battle.mastIndex=config.mast?mounts.findIndex(m=>m.node===config.mast):undefined;
        battle.lanes=(config.bays??[{}]).map(bay=>({...bay,index:bay.subsystem?mounts.findIndex(m=>m.node===bay.subsystem):undefined,
            anchor:config.sockets?.[bay.socket],remaining:config.every}));
    }
    const mastDisabled=battle.mastIndex!==undefined&&!(target.capitalMountHull[battle.mastIndex]>0);
    const rate=mastDisabled?.5:1;
    const lanes=battle.lanes;
    for(const bay of lanes){
        bay.rate=rate;
        bay.open=bay.index===undefined||target.capitalMountHull[bay.index]>0;
        bay.retryIn=Math.max(0,(bay.retryIn??0)-dt);
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
        bay.pose={position:[0,0,0],socket:{normal:bay.anchor?.direction_game??mount.normal,rotation:ship.rotation}};
        bay.point=new THREE.Vector3();bay.origin=new THREE.Vector3();bay.rotation=new THREE.Quaternion();
    }
    if(bay.anchor)bay.point.fromArray(bay.anchor.game_position).applyQuaternion(bay.rotation.fromArray(ship.rotation)).add(bay.origin.fromArray(ship.position));
    else capitalMountPosition(ship,bay.mount.index,bay.point);
    bay.pose.socket.rotation=ship.rotation;
    bay.point.toArray(bay.pose.position);
    return bay.pose;
}
const capPosition=new THREE.Vector3(),capRotation=new THREE.Quaternion(),contact={};
// Reserve the two exits together. Move far enough to clear the carrier, then
// sweep the rail to those fixed exits. An obstruction holds this bay in place.
function railPair(session,battle,bay,anchor,spec) {
    const carrier=battle.target,variant=SHIPS[spec.hullId]?.variant??spec.hullId;
    const radius=Math.max(18,(SHIP_COLLIDERS[variant]?.contactRadius??18)*npcShipScaleForVariant(variant)+3);
    const outward=bay.outward??=new THREE.Vector3(),plans=bay.plans??=[{position:[0,0,0]},{position:[0,0,0]}];
    outward.fromArray(anchor.socket.normal).applyQuaternion(bay.rotation.fromArray(carrier.rotation)).normalize();
    const point=bay.point,origin=bay.origin.fromArray(anchor.position);
    capPosition.fromArray(carrier.position);capRotation.fromArray(carrier.rotation);
    let distance=16;
    for(;distance<=256;distance+=8){
        point.copy(origin).addScaledVector(outward,distance);
        if(!shipVsSphere(capPosition,capRotation,carrier.collisionVariant??carrier.variant,npcShipScaleForVariant(carrier.variant),point.x,point.y,point.z,radius,contact))break;
    }
    if(distance>256)return null;
    const spacing=Math.max(40,radius*2),reach=distance+spacing;
    const obstacles=session.launchRailObstacles(),site=arenaSite(session.arenaStage?.siteId);
    // Inflating by half the sample interval encloses the entire swept volume.
    if(obstacles.length)for(let d=0;d<reach+8;d+=8){
        point.copy(origin).addScaledVector(outward,Math.min(d,reach));
        if(!session.siteSpotClear(site,point,obstacles,radius+4))return null;
    }
    for(let i=0;i<2;i++){
        point.copy(origin).addScaledVector(outward,distance+i*spacing);
        for(const ship of session.ships){
            if(!alive(ship))continue;
            const model=ship.collisionVariant??ship.variant;
            if(shipVsSphere(capPosition.fromArray(ship.position),capRotation.fromArray(ship.rotation),model,npcShipScaleForVariant(ship.variant),point.x,point.y,point.z,radius,contact))return null;
        }
        const player=session.save.player;
        if(!session.arena?.observer&&!player.dockedAt&&capPosition.fromArray(player.position).distanceTo(point)<radius+session.playerCollisionRadius())return null;
        point.toArray(plans[i].position);
    }
    return plans;
}
// Find space near the advertised entry for conventional group arrivals.
function formationEntry(session,anchor,index,spec,capitals,obstacles){
    const point=new THREE.Vector3(), origin=new THREE.Vector3().fromArray(anchor.position);
    const rotation=new THREE.Quaternion().fromArray(session.save.player.rotation);
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
function groupPlans(session,specs,anchor) {
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
    return plans;
}
function arrive(session,battle,specs,anchor,bay) {
    const plans=bay?.socket?railPair(session,battle,bay,anchor,specs[0]):groupPlans(session,specs,anchor);
    if(!plans)return false;
    if(battle.trafficCarrier){
        const carrier=battle.trafficCarrier;
        specs[0].tier=carrier.observerTeam?carrier.pilot.tier:REGION_TIERS[careerRaidTier(session.careerRegionAt(carrier.position))-1];
    }
    const screen=specs.some(spec=>spec.hullId==='picket')?[]:null;
    for(const [i,spec] of specs.entries()){
        const carrier=battle.trafficCarrier;
        const ship=carrier?session.spawnShip('escort',plans[i].position,undefined,undefined,
            {tier:spec.tier},{faction:carrier.faction,hullId:spec.hullId}):session.spawnRunShip(spec,battle.serial++,plans[i]);
        if(!ship)return false;
        screen?.push(ship);
        if(spec.primary)battle.target=ship;
        if(bay){
            ship.launchOwner=battle.target.id;
            ship.frigateEncounterId=battle.target.frigateEncounterId;
            if(carrier){
                ship.targetId=carrier.targetId;ship.hostile=carrier.hostile;ship.observerTeam=carrier.observerTeam;
                ship.observerShipType=carrier.observerTeam?spec.hullId:undefined;
            }else ship.arenaLaunched=true;
            if(bay.socket){
                bay.rotation.setFromUnitVectors(NOSE,bay.outward).toArray(ship.rotation);
                bay.point.fromArray(battle.target.velocity).addScaledVector(bay.outward,ship.speed*.5).toArray(ship.velocity);
            }
        }
        if(spec.attackObjective){ship.arenaObjectiveAttacker=true;ship.targetId=battle.target?.id;}
    }
    if(screen){
        const picket=screen.find(ship=>ship.variant==='picket');
        let slot=-1;
        for(const escort of screen)if(escort!==picket){
            Object.assign(escort,{convoyLeader:picket,formationPoint:[0,0,0],formationTrail:-85,formationSlot:slot});slot=1;
        }
    }
    return true;
}
// Career and spectator carriers use the same socket transform, clearance and pair placement.
export function updateTrafficLaunches(session,ship,config,dt){
    const battle=ship.carrierBattle??={target:ship,trafficCarrier:ship};
    const lanes=launchCycle(battle,config,dt);
    for(const bay of lanes){
        if(!bay.open||bay.remaining>0||bay.retryIn>.00001)continue;
        let count=0;
        for(const fighter of session.ships)if(fighter.launchOwner===ship.id&&alive(fighter))count++;
        if(count+2>config.cap)return;
        const fighter=battle.fighter??={hullId:config.fighter};
        const pair=battle.pair??=[fighter,fighter],slot=launchEntry(session,battle,bay);
        if(slot&&arrive(session,battle,pair,slot,bay))bay.remaining=config.every;
        else bay.retryIn=2;
    }
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
    publishObjective(session,wave,battle,elapsed);
    if(battle.outcome){
        for(const ship of session.ships)if(alive(ship)&&elapsed>=ship.arenaRetreatAt)jump(session,ship);
        const outro=battle.outro;
        if(outro&&!outro.jumped&&elapsed>=outro.jumpAt){if(alive(battle.target))jump(session,battle.target);outro.jumped=true;}
        // Let the last jump read before the level ends: one more second.
        if(session.ships.some(s=>s.arenaRunEnemy&&alive(s))||outro&&!outro.jumped){battle.endAt=undefined;return false;}
        battle.endAt??=elapsed+1;
        return elapsed>=battle.endAt;
    }
    let survivors=0,launched=0;
    for(const ship of session.ships)if(ship.arenaRunEnemy&&alive(ship)){
        survivors++;if(ship.arenaLaunched)launched++;
    }
    const group=battle.groups[battle.group];
    const lanes=wave.launch?launchCycle(battle,wave.launch,dt):[];
    for(const bay of lanes){
        if(!bay.warned||!bay.open||bay.retryIn>.00001||launched+2>wave.launch.cap)continue;
        if(arrive(session,battle,battle.launchPair,launchEntry(session,battle,bay),bay)){
            bay.remaining=wave.launch.every;bay.warned=false;launched+=2;survivors+=2;
        }else bay.retryIn=2;
    }
    let pending=battle.warning;
    if(!pending){
        let specs,at,line,bay;
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
        if(wave.launch&&launched+2<=wave.launch.cap){
            bay=lanes.find(b=>b.open&&!b.warned&&b.remaining<=WARNING*b.rate);
            if(bay){specs=battle.launchPair??=[battle.launchFighter,battle.launchFighter];at=elapsed+WARNING;}
        }
        if(specs){
            let anchor=bay?launchEntry(session,battle,bay):entry(session,battle.serial,true);
            if(anchor&&isRunCapital(specs[0]))anchor=session.runCapitalEntry(specs[0],anchor);
            if(anchor){
                line??=t('Reinforcements inbound.');
                const marked=bay?.socket?anchor:{...anchor,position:[...anchor.position]};
                pending=battle.warning={specs,at,line,entry:marked,bay,limit:bay?battle.limit:group.limit};
            }
        }
    }
    if(pending){
        const {bay,specs}=pending;
        if(bay&&(!bay.open||!alive(battle.target))){
            battle.warning=null;session.ui.setRunInbound?.(null);
        }else{
            if(bay){
                pending.at=Math.max(pending.at,elapsed+bay.remaining/bay.rate);
                if(bay.socket)pending.entry=launchEntry(session,battle,bay);
            }
            announce(session,pending,elapsed);
            if(pending.announced && elapsed>=pending.at && (bay?bay.remaining<=.001:fits(session,battle,specs,pending.limit))){
                if(bay){
                    for(const lane of lanes){
                        if(!lane.open||lane.warned||lane.remaining>.001||launched+2>wave.launch.cap)continue;
                        if(arrive(session,battle,specs,launchEntry(session,battle,lane),lane)){
                            lane.remaining=wave.launch.every;launched+=2;
                        }else{lane.retryIn=2;lane.warned=true;}
                    }
                    battle.warning=null;session.ui.setRunInbound?.(null);
                }else if(arrive(session,battle,specs,pending.entry)){
                    battle.group++;battle.lastArrival=elapsed;
                    const arrival=t('Group {group}/{total}',{group:battle.group,total:battle.groups.length});
                    session.ui.pushEvent(arrival,'info',4000,arrival);
                    if(specs.some(s=>s.primary)){
                        battle.primaryAt=elapsed;
                        if(wave.objective?.seconds)runTransport(session,battle.target,wave.objective.seconds);
                        if(wave.objective)logObjective(session,t(wave.hint),'info',t(wave.objective.label));
                    }
                    battle.warning=null;session.ui.setRunInbound?.(null);
                }
            }
        }
    }
    return !wave.objective && battle.group===battle.groups.length && !session.ships.some(s=>s.arenaRunEnemy&&alive(s));
}
