import {raceHull} from './raceHulls.js';
import * as THREE from 'three';
import {hullVsAsteroid, hullVsRing, hullVsEngine} from './hullCollision.js';
import {steerToward} from './npcNav.js';
const routeOptions={route:true,speed:0,horizon:1.8,brakeScale:.55,synthesize:true};

function createRaceNavigation(session,ship){
    const extents=session.npcHullExtents(ship),reach=Math.max(extents[0],extents[1],extents[2])+12;
    const state={
        wait:0,gate:-1,shortcut:-1,recovery:false,contactUntil:undefined,clear:false,reach,hullType:ship.raceHull,
        position:new THREE.Vector3(),sample:new THREE.Vector3(),direction:new THREE.Vector3(),coast:new THREE.Vector3(),
        identity:new THREE.Quaternion(),hull:[reach,reach,reach],contact:{},scratch:new Float32Array(0),travel:null,length:0,steps:0,
        options:{route:false,speed:0,horizon:1.9,brakeScale:.7,synthesize:true},visit:null,
    };
    state.visit=obstacle=>checkRaceObstacle(state,obstacle);
    return state;
}

function checkRaceObstacle(state,obstacle){
    if(!state.clear)return;
    const {position,travel,length,steps}=state,radius=obstacle.radius+state.reach;
    const along=(obstacle.x-position.x)*travel.x+(obstacle.y-position.y)*travel.y+(obstacle.z-position.z)*travel.z;
    // Preserve the original <=6 m sample lattice while skipping samples that
    // cannot be inside this obstacle's bounding sphere.
    const first=steps?Math.max(0,Math.floor((along-radius)*steps/length)-1):0;
    const last=steps?Math.min(steps,Math.ceil((along+radius)*steps/length)+1):0;
    if(first>last)return;
    if((obstacle.meshVerts?.length??0)>state.scratch.length)
        state.scratch=new Float32Array(2**Math.ceil(Math.log2(obstacle.meshVerts.length)));
    for(let i=first;i<=last;i++){
        const p=state.sample.copy(position).addScaledVector(travel,length*i/Math.max(1,steps));
        if((p.x-obstacle.x)**2+(p.y-obstacle.y)**2+(p.z-obstacle.z)**2>radius*radius)continue;
        const hit=obstacle.shape==='ring'
            ? hullVsRing(p,state.hull,state.identity,obstacle,state.contact)
            : obstacle.shape==='engine'
            ? hullVsEngine(p,state.hull,state.identity,obstacle,state.contact)
            : hullVsAsteroid(p,state.hull,state.identity,state.identity,obstacle,state.scratch,state.contact);
        if(hit){state.clear=false;break;}
    }
}

// Follow the local race target at 60 Hz; refresh clearance and blocked-path
// avoidance at 10 Hz. Flight integration and close tactics remain at 60 Hz.
export function steerRacePilot(session, ship, goal, dt, out) {
    const speed = Math.hypot(ship.velocity[0],ship.velocity[1],ship.velocity[2]);
    if (session.activeInstanceId !== 'mourning-line' && session.activeInstanceId !== 'shardbelt') {
        routeOptions.speed=speed;
        return steerToward(session,ship,goal,routeOptions,out);
    }
    const state = ship.raceNavigation ??= createRaceNavigation(session,ship);
    state.position.fromArray(ship.position);
    state.direction.copy(goal).sub(state.position).normalize();
    state.wait -= dt;
    const recovery=Boolean(ship.raceGateRecovery);
    if (state.wait <= 1e-9 || state.gate !== ship.raceGateIndex || state.shortcut !== ship.raceShortcutIndex || state.recovery !== recovery || state.contactUntil !== ship.raceContactUntil || state.hullType !== ship.raceHull) {
        state.wait = .1;
        state.gate = ship.raceGateIndex;
        state.shortcut = ship.raceShortcutIndex;
        state.recovery=recovery;
        state.contactUntil=ship.raceContactUntil;
        if(state.hullType!==ship.raceHull){
            const extents=session.npcHullExtents(ship);
            state.reach=Math.max(extents[0],extents[1],extents[2])+2;
            state.hull.fill(state.reach);
            state.hullType=ship.raceHull;
        }
        const reach=state.reach;
        const drifting=Boolean(ship.raceHull)&&speed>10;
        // Around a wreck or winding bore the coast ray can hit the next wall even
        // when the authored turn is clear. Probe the planned local chord;
        // the curvature controller already brakes for the following bend.
        const coastingProbe=drifting&&!ship.raceLineCourse;
        const travel=coastingProbe?state.coast.fromArray(ship.velocity).normalize():state.direction;
        // Include enough inertial travel for the pilot to turn before impact;
        // braking distance alone catches wreck plating too late at medium speed.
        const horizon=drifting?Math.max(140,speed*speed/(2*raceHull(ship.raceHull).braking)+speed*1.3+75):Math.max(45,speed*1.8);
        const length = coastingProbe?Math.max(30,horizon):Math.min(state.position.distanceTo(goal),horizon);
        const end = state.sample.copy(state.position).addScaledVector(travel, length);
        const x0=Math.min(end.x,state.position.x)-reach, x1=Math.max(end.x,state.position.x)+reach;
        const y0=Math.min(end.y,state.position.y)-reach, y1=Math.max(end.y,state.position.y)+reach;
        const z0=Math.min(end.z,state.position.z)-reach, z1=Math.max(end.z,state.position.z)+reach;
        state.clear = true;
        state.travel=travel;
        state.length=length;
        state.steps=Math.ceil(length/6);
        session.forEachObstacleInBox(x0,y0,z0,x1,y1,z1,state.visit);
    }
    if (state.clear) {out.copy(state.direction);return 0;}
    // The obstacle test is safely cached at 10 Hz, but avoidance must track the
    // changing local target every step so fast-moving racers don't follow stale turns.
    state.options.speed=speed;
    const brake=steerToward(session,ship,goal,state.options,out);
    if(!ship.raceHull)return brake;
    // Gauntlet gaps are tighter and a hard stop at a blocked sample tends to
    // pin pilots against broad hull faces. Breach's station-side turns need a
    // firmer obstacle response to clear protruding wreck sections.
    return ship.raceCourseId==='mourning-breach'?Math.max(.8,brake*.85):Math.max(.65,brake*.65);
}
