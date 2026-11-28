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
        if(objective.clearLaunches && session.ships.some(s=>s.launchOwner===target.id&&alive(s))){
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
    else if(battle.carrierDown){let n=0;for(const ship of session.ships)if(ship.launchOwner===target.id&&alive(ship))n++;status=t('Fighters {count}',{count:n});}
    else if(objective.clearLaunches){const bays=capitalHull(target).mounts.filter(m=>m.kind==='bay');status=t('Bays {left}/{total}',{left:bays.filter(m=>target.capitalMountHull[m.index]>0).length,total:bays.length});}
    else status=t('Destroy');
    session.ui.setObjectiveStrip({name:target.name,status,
        shield:live&&target.maxShield?target.shield/target.maxShield:0,hull:live?target.hull/target.maxHull:0,
        tone:decided?(decided==='success'?'done':'hostile'):objective.kind==='defend'?'friendly':'hostile'});
}
function announce(session,warning,elapsed) {
    if(!warning.announced){
        if(!warning.bay)warning.at=Math.max(warning.at,elapsed+WARNING);
        warning.announced=true;
        const battle=session.runBattle;
        const title=warning.bay?t('CONTACTS'):t('WAVE {wave}/{total}',{wave:battle.group+1,total:battle.groups.length});
        const seconds=warning.bay?Math.max(1,Math.ceil(warning.at-elapsed-.0001)):WARNING;
        session.runRadio(warning.line,title,t('INBOUND {seconds} S',{seconds}));
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
// Each hangar owns one fighter. An intact bay keeps its slot occupied for the
// full life of that fighter, regardless of where it flies.
export const CARRIER_REPLACEMENT_SECONDS = 30;
const FIRST_LAUNCH_SECONDS = 6;
const LAUNCH_STAGGER_SECONDS = 1.5;
const RAIL_RETRY_SECONDS = 2;

export function carrierSlots(battle, config, startTime) {
    if (!battle.lanes) {
        const mounts = capitalHull(battle.target).mounts;
        battle.mastIndex = config.mast ? mounts.findIndex(m => m.node === config.mast) : undefined;
        battle.lanes = config.bays.map((bay, order) => ({
            ...bay, order, index: mounts.findIndex(m => m.node === bay.subsystem),
            anchor: config.sockets?.[bay.socket], nextAt: startTime + FIRST_LAUNCH_SECONDS + order * LAUNCH_STAGGER_SECONDS,
        }));
    }
    return battle.lanes;
}
function loseFighter(bay, at) {
    bay.fighter = undefined;
    bay.fighterId = undefined;
    bay.nextAt = at + CARRIER_REPLACEMENT_SECONDS;
    bay.retryAt = undefined;
    bay.replacement = true;
    bay.warned = false;
}
export function carrierFighterDestroyed(session, fighter) {
    if (!fighter.launchOwner || !fighter.launchBay) return;
    const owner = session.ships.find(ship => ship.id === fighter.launchOwner);
    const battle = session.runBattle?.target === owner ? session.runBattle : owner?.carrierBattle;
    const bay = battle?.lanes?.find(slot => slot.subsystem === fighter.launchBay);
    if (bay?.fighterId === fighter.id) loseFighter(bay, session.save.world.time);
}
function launchEntry(battle, bay) {
    const ship = battle.target;
    if (!bay.pose) {
        const mount = bay.anchor ? null : capitalHull(ship).mounts.find(m => m.node === bay.socket);
        if (!bay.anchor && !mount) return null;
        bay.mount = mount;
        bay.pose = {position: [0,0,0]};
        bay.point = new THREE.Vector3();bay.origin = new THREE.Vector3();
        bay.outward = new THREE.Vector3();bay.rotation = new THREE.Quaternion();
    }
    bay.rotation.fromArray(ship.rotation);
    if (bay.anchor) bay.point.fromArray(bay.anchor.game_position).applyQuaternion(bay.rotation).add(bay.origin.fromArray(ship.position));
    else capitalMountPosition(ship,bay.mount.index,bay.point);
    bay.point.toArray(bay.pose.position);
    return bay.pose;
}
const capPosition=new THREE.Vector3(),capRotation=new THREE.Quaternion(),contact={};
// Find the closest clear exit outside the carrier. Rechecking from the
// moving socket keeps a blocked hangar from launching through cover or traffic.
function railExit(session, carrier, bay, anchor, spec) {
    const variant=SHIPS[spec.hullId]?.variant??spec.hullId;
    const radius=Math.max(18,(SHIP_COLLIDERS[variant]?.contactRadius??18)*npcShipScaleForVariant(variant)+3);
    const {point,outward}=bay,origin=bay.origin.fromArray(anchor.position);
    outward.fromArray(bay.anchor?.direction_game ?? bay.mount.normal).applyQuaternion(bay.rotation).normalize();
    capPosition.fromArray(carrier.position);capRotation.fromArray(carrier.rotation);
    let distance=16;
    for(;distance<=256;distance+=8){
        point.copy(origin).addScaledVector(outward,distance);
        if(!shipVsSphere(capPosition,capRotation,carrier.collisionVariant??carrier.variant,npcShipScaleForVariant(carrier.variant),point.x,point.y,point.z,radius,contact))break;
    }
    if(distance>256)return null;
    const start=bay.anchor?.start_game_position;
    const interior=start?point.fromArray(start).distanceTo(capPosition.fromArray(bay.anchor.game_position)):0;
    const obstacles=session.launchRailObstacles(),site=arenaSite(session.arenaStage?.siteId);
    // Inflating by half the sample interval encloses the entire swept volume.
    if(obstacles.length)for(let d=-interior;d<distance+8;d+=8){
        point.copy(origin).addScaledVector(outward,Math.min(d,distance));
        if(!session.siteSpotClear(site,point,obstacles,radius+4))return null;
    }
    const player=session.save.player;
    for(let d=start?-interior:distance;d<distance+8;d+=8){
        point.copy(origin).addScaledVector(outward,Math.min(d,distance));
        for(const ship of session.ships){
            if(!alive(ship)||ship===carrier)continue;
            const model=ship.collisionVariant??ship.variant;
            if(shipVsSphere(capPosition.fromArray(ship.position),capRotation.fromArray(ship.rotation),model,npcShipScaleForVariant(ship.variant),point.x,point.y,point.z,radius,contact))return null;
        }
        if(!session.arena?.observer&&!player.dockedAt&&capPosition.fromArray(player.position).distanceTo(point)<radius+session.playerCollisionRadius())return null;
    }
    if(start){
        point.fromArray(start).applyQuaternion(bay.rotation).add(capPosition.fromArray(carrier.position));
        anchor.railLength=distance+interior;
    }
    point.toArray(anchor.position);
    return anchor;
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
function arrive(session,battle,specs,anchor) {
    const plans=groupPlans(session,specs,anchor);
    if(!plans)return false;
    const screen=specs.some(spec=>spec.hullId==='picket')?[]:null;
    for(const [i,spec] of specs.entries()){
        const ship=session.spawnRunShip(spec,battle.serial++,plans[i]);
        if(!ship)return false;
        screen?.push(ship);
        if(spec.primary)battle.target=ship;
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
function deployFighter(session, battle, bay, spec) {
    const carrier = battle.target, origin = launchEntry(battle, bay);
    const plan = origin && railExit(session, carrier, bay, origin, spec);
    if (!plan) return false;
    const traffic = battle.trafficCarrier;
    let fighter;
    if (traffic) {
        const tier=carrier.observerTeam?carrier.pilot.tier:REGION_TIERS[careerRaidTier(session.careerRegionAt(carrier.position))-1];
        fighter=session.spawnShip('escort',plan.position,undefined,undefined,{tier},{faction:carrier.faction,hullId:spec.hullId});
    } else fighter=session.spawnRunShip(spec,battle.serial++,plan);
    if (!fighter) return false;
    fighter.launchOwner=carrier.id;
    fighter.launchBay=bay.subsystem;
    fighter.frigateEncounterId=carrier.frigateEncounterId;
    if (traffic) {
        fighter.targetId=carrier.targetId;fighter.hostile=carrier.hostile;fighter.observerTeam=carrier.observerTeam;
        fighter.observerShipType=carrier.observerTeam?spec.hullId:undefined;
        if (!carrier.observerTeam) {
            fighter.convoyLeader=carrier;
            fighter.formationSlot=(Math.sign(bay.anchor?.direction_game[0]) || 1)*(1+bay.order%3*.45);
            fighter.formationPoint=[0,0,0];
            fighter.formationTrail=55+bay.order%3*20;
        }
    } else fighter.arenaLaunched=true;
    bay.rotation.setFromUnitVectors(NOSE,bay.outward).toArray(fighter.rotation);
    if(bay.anchor?.start_game_position){
        fighter.carrierLaunch={
            localStart:bay.anchor.start_game_position,localDirection:bay.anchor.direction_game,
            length:plan.railLength,duration:Math.max(1.8,plan.railLength/(fighter.speed*.48)),elapsed:0,
            framePosition:[...carrier.position],frameRotation:[...carrier.rotation],frameVelocity:[...carrier.velocity],
        };
    }
    const rail=fighter.carrierLaunch;
    const speed=rail?rail.length*.2/rail.duration:fighter.speed*.5;
    bay.point.fromArray(carrier.velocity).addScaledVector(bay.outward,speed).toArray(fighter.velocity);
    bay.fighter=fighter;bay.fighterId=fighter.id;
    return true;
}

const departurePoint=new THREE.Vector3(),departureDirection=new THREE.Vector3();
const departureRotation=new THREE.Quaternion(),departureFrame=new THREE.Quaternion();
export function updateCarrierDeparture(session,fighter,dt){
    const rail=fighter.carrierLaunch;
    if(!rail)return false;
    if(fighter.captured||fighter.surrendered||fighter.poweredDown){
        fighter.carrierLaunch=undefined;
        return false;
    }
    const carrier=session.ships.find(ship=>ship.id===fighter.launchOwner&&alive(ship));
    for(let i=0;i<3;i++){
        rail.framePosition[i]=carrier?carrier.position[i]:rail.framePosition[i]+rail.frameVelocity[i]*dt;
        if(carrier)rail.frameVelocity[i]=carrier.velocity[i];
    }
    if(carrier)for(let i=0;i<4;i++)rail.frameRotation[i]=carrier.rotation[i];
    rail.elapsed=Math.min(rail.duration,rail.elapsed+dt);
    const progress=rail.elapsed/rail.duration;
    const distance=rail.length*progress*(.2+.8*progress);
    departureFrame.fromArray(rail.frameRotation);
    departureDirection.fromArray(rail.localDirection);
    departurePoint.fromArray(rail.localStart).addScaledVector(departureDirection,distance).applyQuaternion(departureFrame);
    departurePoint.x+=rail.framePosition[0];departurePoint.y+=rail.framePosition[1];departurePoint.z+=rail.framePosition[2];
    departureDirection.applyQuaternion(departureFrame);
    departureRotation.setFromUnitVectors(NOSE,departureDirection).toArray(fighter.rotation);
    if(dt>0){
        fighter.velocity[0]=(departurePoint.x-fighter.position[0])/dt;
        fighter.velocity[1]=(departurePoint.y-fighter.position[1])/dt;
        fighter.velocity[2]=(departurePoint.z-fighter.position[2])/dt;
    }
    departurePoint.toArray(fighter.position);
    if(rail.elapsed>=rail.duration)fighter.carrierLaunch=undefined;
    return true;
}
function updateCarrierWing(session,battle,config,spec) {
    const carrier=battle.target;
    if(!alive(carrier)||carrier.poweredDown||carrier.captured||carrier.surrendered)return [];
    const now=session.save.world.time;
    const lanes=carrierSlots(battle,config,carrier.spawnTime??now);
    const mastDisabled=battle.mastIndex!==undefined&&!(carrier.capitalMountHull[battle.mastIndex]>0);
    for(const bay of lanes){
        if(bay.fighter?.hull===0)loseFighter(bay,now);
        bay.open=carrier.capitalMountHull[bay.index]>0;
        if(!bay.open||bay.fighterId)continue;
        // Flight-control loss delays the opening launch only. Combat losses
        // always get their full, fixed 30-second turnaround.
        if(mastDisabled&&!bay.replacement&&!bay.controlLost){
            bay.nextAt+=Math.max(0,bay.nextAt-now);
            bay.controlLost=true;
        }
        if(now+1e-6<Math.max(bay.nextAt,bay.retryAt??0))continue;
        // Legacy saves can have more pilots than bays. Let those pilots fly
        // out their existing lives before filling spare berths.
        let aloft=0;
        for(const fighter of session.ships)if(fighter.launchOwner===carrier.id&&alive(fighter))aloft++;
        if(aloft>=lanes.length)break;
        if(!deployFighter(session,battle,bay,spec))bay.retryAt=now+RAIL_RETRY_SECONDS;
    }
    return lanes;
}
export function updateTrafficLaunches(session,ship,config) {
    const battle=ship.carrierBattle??={target:ship,trafficCarrier:ship,fighter:{hullId:config.fighter}};
    return updateCarrierWing(session,battle,config,battle.fighter??={hullId:config.fighter});
}
function warnCarrierWing(session,battle,lanes,elapsed) {
    const now=session.save.world.time;
    let warning=battle.wingWarning;
    if(warning&&(!warning.bay.open||warning.bay.fighterId||!alive(battle.target))){
        battle.wingWarning=null;
        if(!battle.warning)session.ui.setRunInbound?.(null);
        warning=null;
    }
    if(battle.warning)return;
    if(!warning){
        const bay=lanes.find(slot=>slot.open&&!slot.fighterId&&!slot.warned&&slot.nextAt-now<=WARNING+.001);
        if(!bay)return;
        const anchor=launchEntry(battle,bay);
        if(!anchor)return;
        warning=battle.wingWarning={bay,at:elapsed+Math.max(0,bay.nextAt-now),entry:anchor,line:t('Carrier fighter inbound.')};
        bay.warned=true;
    }
    warning.entry=launchEntry(battle,warning.bay);
    warning.at=elapsed+Math.max(0,warning.bay.nextAt-now,(warning.bay.retryAt??0)-now);
    announce(session,warning,elapsed);
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
export function tickBattle(session,wave,elapsed) {
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
    let survivors=0;
    for(const ship of session.ships)if(ship.arenaRunEnemy&&alive(ship))survivors++;
    const group=battle.groups[battle.group];
    const lanes=wave.launch&&battle.target?updateCarrierWing(session,battle,wave.launch,battle.launchFighter):[];
    let pending=battle.warning;
    if(!pending&&group&&fits(session,battle,group.enemies,group.limit)){
        let deadline=battle.lastArrival+battle.interval;
        if(group.at!==undefined)deadline=Math.min(deadline,(battle.primaryAt??0)+group.at);
        const hullGate=group.hullBelow&&battle.target?.hull<battle.target.maxHull*group.hullBelow;
        const earliest=battle.lastArrival+MIN_GROUP_INTERVAL;
        if(elapsed>=earliest-WARNING&&(survivors<=1||hullGate||elapsed>=deadline-WARNING)){
            const specs=group.enemies;
            let anchor=entry(session,battle.serial,true);
            if(anchor&&isRunCapital(specs[0]))anchor=session.runCapitalEntry(specs[0],anchor);
            if(anchor)pending=battle.warning={specs,at:Math.max(earliest,elapsed+WARNING),
                line:t('Group {group}/{total} inbound.',{group:battle.group+1,total:battle.groups.length}),
                entry:{...anchor,position:[...anchor.position]},limit:group.limit};
        }
    }
    if(pending){
        announce(session,pending,elapsed);
        const {specs}=pending;
        if(elapsed>=pending.at&&fits(session,battle,specs,pending.limit)&&arrive(session,battle,specs,pending.entry)){
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
    if(wave.launch)warnCarrierWing(session,battle,lanes,elapsed);
    return !wave.objective && battle.group===battle.groups.length && !session.ships.some(s=>s.arenaRunEnemy&&alive(s));
}
