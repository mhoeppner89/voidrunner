const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Close racing is intentional: defend against a closing pursuer, stay in a
// wake, then contest the shoulder rather than moving to a separate empty rail.
// Every chosen line still passes through the environment steering/clearance test.
export function planRaceTactics(ship,course,peers,player,dt,now) {
    const state=ship.raceTactics??={mode:'line',targetId:undefined,lane:ship.laneOffset??0,until:0};
    const v=ship.velocity,speed=Math.hypot(...v),gate=course.gates[ship.raceGateIndex??0];
    if(!gate||speed<15)return state;
    // Keep overtakes on open straights. Near a checkpoint or an obstacle,
    // leave the reserved racing line clear so a shoulder move cannot turn
    // into a missed gate or a wide debris recovery.
    const gateDistance=gate.pathDistance-(ship.raceLineDistance??0);
    if(course.racingLine&&(gateDistance<160||ship.raceNavigation?.clear===false)){
        state.mode='line';state.targetId=undefined;state.lane=ship.laneOffset??0;state.until=now+.2;
        ship.raceLane??=ship.laneOffset??0;
        ship.raceLane+=clamp(state.lane-ship.raceLane,-dt*1.3,dt*1.3);
        return state;
    }
    const fx=v[0]/speed,fy=v[1]/speed,fz=v[2]/speed,h=Math.hypot(fx,fz)||1,sx=fz/h,sz=-fx/h;
    if(now<(ship.raceRecoverUntil??0)){
        state.mode='recover';state.targetId=undefined;state.until=ship.raceRecoverUntil;
        state.lane=clamp((ship.laneOffset??0)+(ship.raceEscapeSign??1)*1.4,-1.65,1.65);
        ship.raceLane+=clamp(state.lane-ship.raceLane,-dt*1.6,dt*1.6);return state;
    }
    let target,along=0,lateral=0,score=Infinity;
    const count=peers.length+(player?1:0);
    for(let i=0;i<count;i++){
        const other=i<peers.length?peers[i]:player;
        if(other===ship||other.hull<=0||other.raceFinished||Math.abs((other.raceGateIndex??0)-(ship.raceGateIndex??0))>1)continue;
        const ov=other.velocity,os=Math.hypot(...ov);if(os<12||(ov[0]*fx+ov[1]*fy+ov[2]*fz)/os<.75)continue;
        const dx=other.position[0]-ship.position[0],dy=other.position[1]-ship.position[1],dz=other.position[2]-ship.position[2];
        const ahead=dx*fx+dy*fy+dz*fz,side=dx*sx+dz*sz;
        if(ahead < -65||ahead>85||Math.abs(side)>25||Math.abs(dy-ahead*fy)>14)continue;
        const priority=Math.abs(ahead)+Math.abs(side)*.7;
        if(priority<score){score=priority;target=other;along=ahead;lateral=side;}
    }
    let lane=ship.laneOffset??0,mode='line';
    if(target){
        const width=(course.racerLaneWidth??12)*(ship.raceLaneScale??1),base=ship.raceLane??lane;
        if(along<-12){mode='defend';lane=base+lateral/width;}
        else if(along>34){mode='draft';lane=base+lateral/width;}
        else{
            mode='shoulder';
            // Different drivers lean into different shoulders. Keep the line
            // bounded inside the reserved, collision-cleared racing corridor.
            const side=ship.raceAggression>.8?-1:1;
            lane=base+(lateral+side*5.5)/width;
        }
        lane=clamp(lane,-1.65,1.65);
        if(now>=state.until||state.targetId===(target.id??'player')){state.mode=mode;state.targetId=target.id??'player';state.lane=lane;state.until=now+.55;}
    }else if(now>=state.until){state.mode='line';state.targetId=undefined;state.lane=lane;}
    ship.raceLane??=ship.laneOffset??0;
    ship.raceLane+=clamp(state.lane-ship.raceLane,-dt*1.3,dt*1.3);
    return state;
}
