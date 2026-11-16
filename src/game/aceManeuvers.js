// Short, situational commitments executed through ordinary flight controls.
// Keep aceMove for renderer/probe compatibility; novices use the simple break.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
// Temperament changes the chosen line and how long a pilot commits to it;
// skill and hull authority still decide which moves are physically available.
const STYLES={
    timid:{duration:1.08,width:1.12,vertical:.8,cut:.78,cooldown:1.12},
    steady:{duration:1,width:1,vertical:1,cut:1,cooldown:1},
    aggressive:{duration:.86,width:.82,vertical:.78,cut:1.15,cooldown:.88},
    flamboyant:{duration:1.08,width:1.16,vertical:1.2,cut:1.04,cooldown:.94},
};
const styleFor=ship=>STYLES[ship.pilot?.temperament]??STYLES.steady;
function finish(ship,time,ace,kind=ship.aceMove?.kind) {
    const style=styleFor(ship);
    ship.aceMove=undefined;
    ship.aceMoveLastKind=kind;
    ship.aceMoveRepeatAt=time+(ace?10:14);
    ship.aceMoveReadyAt=time+((ace?4:7)+(ship.aiRng?.()??.5)*3)*style.cooldown;
}
const canRepeat=(ship,kind,time)=>ship.aceMoveLastKind!==kind||time>=(ship.aceMoveRepeatAt??0);
function observedTurn(ship,out) {
    const motion=ship.gunAim,velocity=ship.combatPlan?.targetVelocity;
    if(!motion?.visible||motion.targetId!==ship.targetId||!velocity||!motion.acceleration)return 0;
    const acceleration=motion.acceleration,speedSq=velocity.lengthSq();
    if(speedSq<225)return 0;
    // Use only the sideways acceleration inferred from visible motion; a
    // straight target accelerating away is not evidence of a turn to cut.
    const along=acceleration.dot(velocity)/speedSq;
    const x=acceleration.x-velocity.x*along,y=acceleration.y-velocity.y*along,z=acceleration.z-velocity.z*along;
    const length=Math.hypot(x,y,z);
    if(out&&length>0){out[0]=x/length;out[1]=y/length;out[2]=z/length;}
    return length;
}
function begin(ship,kind,time,duration,speed,agile) {
    // Allocate once per pilot, not every maneuver or simulation step.
    const move=ship.maneuverState??={entry:[0,0,0],side:[1,0,0],up:[0,1,0],escape:[0,0,0],turn:[0,0,0]};
    move.turn??=[0,0,0];
    const plan=ship.combatPlan;
    const style=styleFor(ship);
    move.kind=kind;move.started=time;move.durationScale=style.duration;move.until=time+duration*style.duration;move.targetId=ship.targetId;move.agile=agile;
    move.width=style.width;move.vertical=style.vertical;move.cut=style.cut;
    ship.maneuverSide??=(ship.aiRng?.()??.5)<.5?-1:1;
    move.sign=ship.maneuverSide;ship.maneuverSide*=-1;
    for(let i=0;i<3;i++)move.entry[i]=ship.velocity[i]/Math.max(1,speed);
    if(plan?.right)plan.right.toArray(move.side);
    if(plan?.up)plan.up.toArray(move.up);
    observedTurn(ship,move.turn);
    if(kind==='oblique-intercept'&&plan?.offset?.lengthSq()>.01){
        const n=plan.offset.length();move.side[0]=plan.offset.x/n;move.side[1]=plan.offset.y/n;move.side[2]=plan.offset.z/n;
        move.sign=1; // Keep the wing's assigned side instead of crossing its leader.
    }
    if(plan?.escape?.lengthSq()>.1)plan.escape.toArray(move.escape);
    else for(let i=0;i<3;i++)move.escape[i]=move.entry[i]*.3+move.side[i]*move.sign;
    ship.aceManeuverClearanceAt=0;
    ship.aceMove=move;
    return move;
}
export function aceManeuver(ship,time,distance,noseDot,travelDot,range,safe,inField=false,firingDot=noseDot,velocityDot=travelDot,closing=0) {
    const ace=ship.pilot?.tier==='ace',veteran=ship.pilot?.tier==='veteran',novice=ship.pilot?.tier==='novice';
    const temperament=ship.pilot?.temperament,timid=temperament==='timid',aggressive=temperament==='aggressive',flamboyant=temperament==='flamboyant';
    const plan=ship.combatPlan;
    if ((!ace&&!veteran&&!novice)||ship.tutorialEnemy||ship.tutorialCompanion||ship.capitalClass||ship.race||ship.fleeing||ship.covering||ship.holdFire||ship.pursuitHoldFire||plan?.recovery?.active||plan?.crossfire?.active||plan?.visible===false||!safe) {
        if(ship.aceMove)finish(ship,time,ace);
        return;
    }
    let move=ship.aceMove;
    const age=move?(time-move.started)/(move.durationScale??1):0;
    const collisionBreak=time<(plan?.passUntil??0)||distance<=(plan?.clearance??0);
    const offensiveCut=move?.kind==='lead-cut'||move?.kind==='high-yo-yo';
    const recovered=move&&age>(move.kind==='boost-reversal'?.9:.4)&&firingDot>.99&&velocityDot>.2&&distance>Math.max(45,range*.3)&&!plan?.overshoot;
    const receding=move&&age>.6&&travelDot<-.6&&distance>(move.kind==='scissors'?Math.max(220,range*1.5):range*1.15);
    if(move&&(time>=move.until||recovered||receding||offensiveCut&&collisionBreak||move.targetId!==undefined&&move.targetId!==ship.targetId)){
        finish(ship,time,ace);return;
    }
    if(move)return move;
    if(time<(ship.aceMoveReadyAt??0)||time<(ship.fireCommitUntil??0)||distance<=65||distance>=Math.max(range*1.8,360))return;
    const speed=Math.hypot(...ship.velocity),stats=ship.combatFit?.stats;
    const agile=!stats||stats.angularAcceleration/Math.max(.1,stats.angularDamping)>.8&&stats.maxSpeed>55;
    const evading=ship.combatIntent==='evade';
    // A real observed threat is required. Being in a crowded battle alone does
    // not justify decorative corkscrews or losing an available firing solution.
    const underFire=evading&&time<(ship.combatThreatUntil??0);
    if(!timid&&!inField&&ace&&agile&&underFire&&noseDot<-.35&&closing>Math.max(18,ship.speed*.2)&&speed>ship.speed*.65&&distance<Math.max(150,range*.9)&&canRepeat(ship,'scissors',time))
        return begin(ship,'scissors',time,2.3,speed,agile);
    if(underFire&&noseDot<(timid?.88:aggressive?.58:.7)&&speed>ship.speed*.55){
        if(!timid&&(ace||flamboyant&&veteran)&&agile&&noseDot<(flamboyant?.2:-.15)&&canRepeat(ship,'rolling-break',time))return begin(ship,'rolling-break',time,2,speed,agile);
        if(canRepeat(ship,'break-turn',time))return begin(ship,'break-turn',time,novice?1.5:1.7,speed,agile);
    }
    if(novice)return;
    const targetTurning=!inField&&!collisionBreak&&agile&&observedTurn(ship)>4;
    if(targetTurning&&!underFire&&plan.pursuit==='lag'&&plan.overshoot&&closing>18&&noseDot>.65&&travelDot>.7&&distance>Math.max(90,(plan.clearance??0)*1.1)&&canRepeat(ship,'high-yo-yo',time))
        return begin(ship,'high-yo-yo',time,2,speed,agile);
    // Cut into a visibly turning, receding opponent's arc only while outside
    // useful gun range. A good shot and a straight chase keep the usual lead.
    if(targetTurning&&!underFire&&plan.pursuit==='lead'&&closing<(timid?-20:-12)&&noseDot>(timid?.55:.35)&&distance>range*(aggressive?1.03:1.08)&&distance<range*(timid?1.4:1.65)&&speed>ship.speed*.6&&canRepeat(ship,'lead-cut',time))
        return begin(ship,'lead-cut',time,1.65,speed,agile);
    // A fast, nearly head-on closure needs more path length before the merge.
    // Climb out of the attack plane, bleed some thrust, then roll back on lead.
    if(plan?.overshoot&&plan.movingEngagement&&closing>ship.speed*.55&&travelDot>.92&&noseDot>.65&&distance<range&&canRepeat(ship,'climbing-turn',time))
        return begin(ship,'climbing-turn',time,agile?1.8:2.2,speed,agile);
    // A wingman approaches on its assigned flank, then converges as the guns
    // enter useful range. The pressure pilot keeps the direct attack line.
    if(plan?.teamRole==='flank'&&!underFire&&distance>range*1.05&&noseDot>.25&&plan.offset?.lengthSq()>.01&&canRepeat(ship,'oblique-intercept',time))
        return begin(ship,'oblique-intercept',time,agile?1.8:2.2,speed,agile);
    if(distance>=Math.max(range*1.35,300))return;
    if(!timid&&ace&&agile&&noseDot<-.2&&ship.fuel>5&&speed>ship.speed*.45){
        // In a field, a powered rolling return keeps more control than a
        // coasting reversal. Both the drift corridor and exit must be clear.
        if(inField&&canRepeat(ship,'rolling-break',time))return begin(ship,'rolling-break',time,2,speed,agile);
        if(canRepeat(ship,'boost-reversal',time))return begin(ship,'boost-reversal',time,3.4,speed,agile);
    }
    if(agile&&speed>ship.speed*(evading?.85:.5)&&noseDot>-.2&&Math.abs(travelDot)<(timid?.78:.92)&&(evading?travelDot<.25:distance<range*1.05)&&canRepeat(ship,'drift-pass',time))
        return begin(ship,'drift-pass',time,ace?1.6:1.1,speed,agile);
}

// Only the desired heading changes. Thrust, angular acceleration and momentum
// still pass through the same integrator as ordinary flight.
export function maneuverHeading(move,time,lead,distance,range,out) {
    const age=(time-move.started)/(move.durationScale??1),width=move.width??1,vertical=move.vertical??1,cutStrength=move.cut??1;
    if(move.kind==='boost-reversal'&&age<.65)return out.fromArray(move.entry);
    if(move.kind==='break-turn'){
        const returnToAim=clamp((age-.55)/.85,0,1);
        out.fromArray(move.escape).normalize();
        out.x+=move.side[0]*move.sign*(width-1)*.5;
        out.y+=move.side[1]*move.sign*(width-1)*.5;
        out.z+=move.side[2]*move.sign*(width-1)*.5;
        return out.normalize().lerp(lead,returnToAim).normalize();
    }
    if(move.kind==='scissors'){
        const phase=clamp(age/1.65,0,1),bend=Math.sin(phase*Math.PI*2)*.85*move.sign*width;
        out.fromArray(move.entry);
        out.x+=move.side[0]*bend+move.up[0]*Math.sin(phase*Math.PI)*.12*vertical;
        out.y+=move.side[1]*bend+move.up[1]*Math.sin(phase*Math.PI)*.12*vertical;
        out.z+=move.side[2]*bend+move.up[2]*Math.sin(phase*Math.PI)*.12*vertical;
        return out.normalize().lerp(lead,clamp((age-1.25)/.85,0,1)).normalize();
    }
    if(move.kind==='high-yo-yo'){
        const lift=Math.cos(Math.PI*.5*clamp(age/1.6,0,1));
        out.copy(lead);
        out.x+=(-move.turn[0]*.45*width+move.up[0]*.65*move.sign*vertical)*lift;
        out.y+=(-move.turn[1]*.45*width+move.up[1]*.65*move.sign*vertical)*lift;
        out.z+=(-move.turn[2]*.45*width+move.up[2]*.65*move.sign*vertical)*lift;
        return out.normalize();
    }
    if(move.kind==='lead-cut'){
        const cut=.5*cutStrength*Math.cos(Math.PI*.5*clamp(age/1.4,0,1));
        out.copy(lead);out.x+=move.turn[0]*cut;out.y+=move.turn[1]*cut;out.z+=move.turn[2]*cut;
        return out.normalize();
    }
    if(move.kind==='rolling-break'){
        const phase=age*3.5*move.sign,amplitude=.55*Math.sin(Math.PI*clamp(age/1.6,0,1));
        const side=move.side,up=move.up;
        out.fromArray(move.entry);
        out.x+=side[0]*Math.cos(phase)*amplitude*width+up[0]*Math.sin(phase)*amplitude*vertical;
        out.y+=side[1]*Math.cos(phase)*amplitude*width+up[1]*Math.sin(phase)*amplitude*vertical;
        out.z+=side[2]*Math.cos(phase)*amplitude*width+up[2]*Math.sin(phase)*amplitude*vertical;
        return out.normalize().lerp(lead,clamp((age-.9)/.8,0,1)).normalize();
    }
    if(move.kind==='climbing-turn'){
        const height=Math.cos(Math.PI*.5*clamp((time-move.started)/(move.until-move.started),0,1))*(move.agile?.85:.5)*move.sign*vertical;
        out.copy(lead);out.x+=move.up[0]*height;out.y+=move.up[1]*height;out.z+=move.up[2]*height;
        return out.normalize();
    }
    if(move.kind==='oblique-intercept'){
        const offset=clamp((distance/range-.8)/.6,0,1)*.55*width*(1-clamp((time-move.started)/(move.until-move.started),0,1));
        out.copy(lead);out.x+=move.side[0]*offset;out.y+=move.side[1]*offset;out.z+=move.side[2]*offset;
        return out.normalize();
    }
    return out.copy(lead);
}

export function maneuverSpeed(move,time,speed,cruise) {
    if(!move)return speed;
    const age=(time-move.started)/(move.durationScale??1);
    if(move.kind==='climbing-turn'&&age<1)return Math.min(speed,cruise*.72);
    if(move.kind==='high-yo-yo'&&age<.9)return Math.min(speed,cruise*.74);
    if(move.kind==='scissors'&&age<.65)return Math.min(speed,cruise*.7);
    return speed;
}

export function maneuverBank(move,time) {
    if(!move)return 0;
    const age=(time-move.started)/(move.durationScale??1),vertical=move.vertical??1;
    if(move.kind==='rolling-break')return Math.sin(age*Math.PI/2)*1.4*move.sign*vertical;
    if(move.kind==='climbing-turn'||move.kind==='high-yo-yo')return Math.sin((time-move.started)*Math.PI/(move.until-move.started))*.4*move.sign*vertical;
    if(move.kind==='scissors')return Math.sin(Math.PI*2*clamp(age/1.65,0,1))*.65*move.sign;
    if(move.kind==='lead-cut')return Math.sin((time-move.started)*Math.PI/(move.until-move.started))*.3*move.sign;
    return 0;
}
