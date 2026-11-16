import * as THREE from 'three';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const PROFILES={
    novice:{chance:.12,duration:.85,cooldown:12,strength:.55},
    veteran:{chance:.04,duration:.55,cooldown:22,strength:.36},
    ace:{chance:.012,duration:.32,cooldown:36,strength:.22},
};
// Temperament changes the nature of a lapse; skill still determines most of
// its frequency and duration. These are mistakes, never free handling bonuses.
const TEMPERAMENTS={
    timid:{chance:1.05,duration:1,strength:1},
    steady:{chance:.9,duration:.9,strength:.86},
    aggressive:{chance:1.05,duration:1.08,strength:1},
    flamboyant:{chance:1.1,duration:1.16,strength:1.13},
};
function errorKind(temperament,braking,turning,roll){
    if(temperament==='timid')return roll<.6?'hesitate':turning&&roll<.85?'overcorrect':braking?'late-brake':'late-turn';
    if(temperament==='aggressive')return braking&&roll<.82?'late-brake':roll<.7?'fixation':'late-turn';
    if(temperament==='flamboyant')return turning&&roll<.82?'overcorrect':braking?'late-brake':'late-turn';
    return braking?'late-brake':roll<.75?'late-turn':'overcorrect';
}
function state(time){
    return {active:false,nextCheck:time+.5,readyAt:0,decisions:0,errors:0,entry:new THREE.Vector3(),turn:new THREE.Vector3()};
}
function finish(s,time,profile){
    s.active=false;s.readyAt=time+(profile?.cooldown??8);s.nextCheck=time+.5;
}

function nearCover(ship,nav){
    const margin=Math.hypot(...ship.velocity)*2+100,p=ship.position;
    if(!p)return false;
    for(const o of nav.obstacles??[]){
        const radius=o.box?Math.hypot(o.box.hx,o.box.hy,o.box.hz):o.radius??o.collisionRadius??0;
        if(Math.hypot(p[0]-o.x,p[1]-o.y,p[2]-o.z)<radius+margin)return true;
    }
    return false;
}

// Brief errors of judgment under real pressure, not noisy control inputs.
// Apply before terrain steering and ship avoidance; physical safety may always
// override the result. This state is transient and allocated once per pilot.
export function pilotJudgment(ship,time,desired,distance,closing){
    const profile=PROFILES[ship.pilot?.tier],plan=ship.combatPlan,nav=ship.fieldNav;
    let s=ship.pilotJudgment;
    const eligible=profile&&plan?.visible&&!ship.recoveryTargetHidden&&!ship.patrolMemoryActive&&ship.targetId
        &&!ship.tutorialEnemy&&!ship.tutorialCompanion&&!ship.tutorialPatrol&&!ship.storyPersonId
        &&!ship.capitalClass&&!ship.race&&!ship.fleeing&&!ship.covering&&!ship.holdFire&&!ship.pursuitHoldFire
        &&ship.role!=='trader'&&ship.role!=='miner'&&!ship.surrendered&&!ship.captured&&!ship.poweredDown
        &&!plan.recovery?.active&&!plan.crossfire?.active&&!ship.terrainManeuver?.active
        &&nav?.safeForManeuver&&!nav.active&&!nav.recovering&&!nearCover(ship,nav)
        &&time>=(plan.passUntil??0)&&distance>Math.max(110,(plan.clearance??40)*2)
        &&time-(ship.combatBumpAt??-Infinity)>3;
    if(!eligible){if(s?.active)finish(s,time,profile);return;}
    s??=ship.pilotJudgment=state(time);
    if(s.active&&(time>=s.until||s.targetId!==ship.targetId||time-s.lastUpdate>.15)){
        finish(s,time,profile);return;
    }
    if(!s.active){
        if(time<s.nextCheck||time<s.readyAt)return;
        s.nextCheck=time+.5;s.decisions++;
        const freshFire=time<(ship.combatThreatUntil??0)
            &&(time<(ship.evasiveUntil??0)||time-(ship.combatPressureAt??-Infinity)<2.2);
        if(!freshFire||ship.aceMove||time<(ship.fireCommitUntil??0)||!plan.nose)return;
        const speed=Math.hypot(...ship.velocity),facing=clamp(plan.nose.dot(desired),-1,1);
        const turning=facing<.96&&facing>-.2&&speed>ship.speed*.55;
        const braking=plan.overshoot&&closing>20&&speed>ship.speed*.78;
        if(!turning&&!braking)return;
        const rng=ship.aiRng;
        // No fallback entropy: a partially prepared actor simply remains steady.
        const temperament=TEMPERAMENTS[ship.pilot.temperament]?ship.pilot.temperament:'steady',nature=TEMPERAMENTS[temperament];
        if(typeof rng!=='function'||rng()>=profile.chance*nature.chance)return;
        s.kind=errorKind(temperament,braking,turning,rng());
        s.active=true;s.targetId=ship.targetId;s.started=time;s.until=time+profile.duration*nature.duration*(.85+rng()*.3);
        s.errors++;s.strength=profile.strength*nature.strength;s.entrySpeed=speed;
        // Fixation holds a once-valid observed bearing, never hidden target
        // coordinates. Hesitation holds the nose briefly while lifting thrust.
        s.entry.copy(s.kind==='fixation'?desired:plan.nose).normalize();
        s.turn.copy(desired).addScaledVector(s.entry,-facing).normalize();
        // An error abandons the optional flourish but never a safety route.
        ship.aceMove=undefined;
    }
    s.lastUpdate=time;
    const phase=clamp((time-s.started)/(s.until-s.started),0,1);
    if(s.kind==='late-turn'||s.kind==='hesitate'||s.kind==='fixation'){
        const weight=Math.min(.9,s.strength*(s.kind==='fixation'?1.15:s.kind==='hesitate'?.6:1))*(1-clamp((phase-.3)/.7,0,1));
        desired.lerp(s.entry,weight).normalize();
    }else if(s.kind==='overcorrect'){
        desired.addScaledVector(s.turn,Math.sin(phase*Math.PI)*s.strength*.65).normalize();
    }
    return s;
}

// A late brake retains entry speed; hesitation lifts the throttle too early.
// Neither grants thrust, boost, grip or immunity. Field speed limits still win.
export function judgmentSpeed(judgment,time,requestedSpeed,cruise){
    if(!judgment?.active||time>=judgment.until)return requestedSpeed;
    const phase=clamp((time-judgment.started)/(judgment.until-judgment.started),0,1);
    const hold=1-clamp((phase-.35)/.65,0,1);
    if(judgment.kind==='hesitate')return requestedSpeed*(1-judgment.strength*.42*hold);
    if(judgment.kind!=='late-brake')return requestedSpeed;
    const retained=Math.min(cruise,judgment.entrySpeed);
    return requestedSpeed+Math.max(0,retained-requestedSpeed)*hold;
}
