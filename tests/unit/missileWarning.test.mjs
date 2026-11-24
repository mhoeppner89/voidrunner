import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stepMissileWarning,MISSILE_PIP_FLOOR,MISSILE_CUE_SPACING} from '../../src/game/audio.js';
import {breakCueTime,breakCueEnd,breakCueStart,BREAK_REACTION} from '../../src/game/weaponFlight.js';
import {LAUNCHERS} from '../../src/game/weapons.js';

const dt=1/60;
// Drive the warning with a timeline of {threat, cue, committed} and record what plays.
function run(seconds,at){
    const state={},alerts=[],cues=[];
    for(let i=0;i<seconds/dt;i++){
        const t=i*dt,{threat,cue=false,committed=false}=at(t),out=stepMissileWarning(state,dt,threat,cue,committed,false);
        if(out.alert>0)alerts.push([t,out.alert]);
        if(out.cue>0)cues.push([t,out.cue]);
    }
    return {alerts,cues};
}
// One round: closes over 3 s. Its cue fires once at 2 s; afterwards it is committed.
const round=(launch,t)=>{const age=t-launch;return age>=0&&age<3?{threat:.25+.25*age,cue:Math.abs(age-2)<dt/2,committed:age>=2-dt/2}:{threat:0};};
const merge=(...rounds)=>t=>rounds.map(r=>r(t)).reduce((a,b)=>({threat:Math.max(a.threat,b.threat),cue:a.cue||b.cue,committed:a.committed||b.committed}),{threat:0,cue:false,committed:false});

test('the break cue sits mid-window, early by the reaction time, for every rack',()=>{
    for(const rack of [LAUNCHERS.seeker,LAUNCHERS.swarm,LAUNCHERS.torpedo]){
        const at=breakCueTime(rack),turn=at-BREAK_REACTION;
        assert.ok(Math.abs(turn-(breakCueEnd(rack)+breakCueStart(rack))/2)<1e-9,rack.id);
        assert.ok(turn>breakCueEnd(rack)&&turn<breakCueStart(rack),`${rack.id}: the reacting pilot turns inside the window`);
    }
    assert.ok(breakCueTime(LAUNCHERS.swarm)<breakCueTime(LAUNCHERS.seeker),'swarm warheads are shaken later than seekers');
});

test('a single round pips on approach, cues once, then falls silent',()=>{
    const {alerts,cues}=run(4,t=>round(0,t));
    assert.equal(cues.length,1);assert.ok(Math.abs(cues[0][0]-2)<2*dt);
    assert.ok(alerts.length>=3&&alerts.every(([t])=>t<2),`${alerts.length} pips, all before the cue`);
});

test('a salvo or back-to-back rounds give one cue, not a burst of them',()=>{
    const salvo=merge(...[0,.15,.3].map(at=>t=>round(at,t)));
    assert.equal(run(5,salvo).cues.length,1);
    const spaced=merge(t=>round(0,t),t=>round(MISSILE_CUE_SPACING+.2,t));
    assert.equal(run(6,spaced).cues.length,2,'rounds further apart than the spacing each get their cue');
});

test('the pips never chatter, even with several rounds inbound',()=>{
    const barrage=merge(...[0,.4,.9,1.3,2,2.6].map(at=>t=>round(at,t)));
    const {alerts}=run(8,barrage);
    for(let i=1;i<alerts.length;i++)assert.ok(alerts[i][0]-alerts[i-1][0]>=.44,'at most one pip burst every ~0.45 s');
});

test('a sustained barrage settles: later approaches warn softer and slower',()=>{
    const rounds=[0,3.5,7,10.5,14,17.5];
    const {alerts,cues}=run(21,merge(...rounds.map(at=>t=>round(at,t))));
    const first=alerts.filter(([t])=>t<2).map(([,v])=>v),late=alerts.filter(([t])=>t>=14&&t<16).map(([,v])=>v);
    assert.ok(Math.max(...late)<=Math.max(...first)*.6+1e-9,'later rounds are quieter');
    assert.ok(late.length<first.length,'and pip less often');
    assert.ok(late.length>=2 && Math.min(...late)>=.3,'but a real threat is never silenced');
    assert.ok(cues.at(-1)[1]>=.7,'the break cue always stays clear');
});

test('fatigue wears off with the clock, even after continuous tracking',()=>{
    const state={};
    for(let i=0;i<5;i++){for(let t=0;t<2;t+=dt)stepMissileWarning(state,dt,.6,false,false,false);for(let t=0;t<.5;t+=dt)stepMissileWarning(state,dt,0,false,false,false);}
    for(let t=0;t<60;t+=dt)stepMissileWarning(state,dt,.6,false,false,false);
    for(let t=0;t<.5;t+=dt)stepMissileWarning(state,dt,0,false,false,false);
    let first=0;for(let t=0;t<2&&!first;t+=dt)first=stepMissileWarning(state,dt,.6,false,false,false).alert;
    assert.ok(first>=.55,`fresh warning after the window: ${first}`);
});

test('a dropped frame of tracking cannot fire an early pip',()=>{
    const state={},pips=[];let clock=0;
    const step=threat=>{const out=stepMissileWarning(state,dt,threat,false,false,false);clock+=dt;if(out.alert>0)pips.push(clock);};
    for(let i=0;i<40;i++)step(1);
    step(0);
    for(let i=0;i<40;i++)step(1);
    for(let i=1;i<pips.length;i++)assert.ok(pips[i]-pips[i-1]>=MISSILE_PIP_FLOOR-1e-9,`pips ${(pips[i]-pips[i-1]).toFixed(3)} s apart`);
});
