// Bounded veteran/ace commitments, all executed through ordinary flight controls.
// Keep the historical aceMove field for renderer/probe compatibility.
export function aceManeuver(ship, time, distance, noseDot, travelDot, range, safe, inField=false, firingDot=noseDot, velocityDot=travelDot) {
    const ace=ship.pilot?.tier==='ace',veteran=ship.pilot?.tier==='veteran';
    if ((!ace&&!veteran) || ship.tutorialEnemy || ship.tutorialCompanion || ship.capitalClass || ship.fleeing || ship.covering || ship.combatPlan?.recovery?.active || ship.combatPlan?.crossfire?.active || !safe) {
        if (ship.aceMove) ship.aceMoveReadyAt=time+(ace?5:8);
        ship.aceMove=undefined;
        return;
    }
    let move=ship.aceMove;
    const age=move?time-move.started:0;
    // Once a useful attitude is recovered, thrust can arrest the remaining
    // sideways motion. The old duration remains an upper bound, not a script.
    const recovered=move&&age>(move.kind==='boost-reversal'?.9:.4)&&firingDot>.99&&velocityDot>.2&&distance>Math.max(45,range*.3)&&!ship.combatPlan?.overshoot;
    const receding=move&&age>.6&&travelDot<-.6&&distance>range*1.15;
    if (move && (time>=move.until||recovered||receding)) {
        ship.aceMove=undefined;ship.aceMoveReadyAt=time+(ace?4:7)+(ship.aiRng?.() ?? .5)*3;
        return;
    }
    if (!move && time >= (ship.aceMoveReadyAt ?? 0) && time>=(ship.fireCommitUntil??0) && distance>65 && distance<Math.max(range*1.35,300)) {
        const speed=Math.hypot(...ship.velocity),evading=ship.combatIntent==='evade';
        if (ace && noseDot<-.2 && ship.fuel>5 && speed>ship.speed*.45) {
            const kind=inField&&((ship.aceBreakCount=(ship.aceBreakCount??0)+1)%2===1)?'rolling-break':'boost-reversal';
            move={kind,started:time,until:time+3.4,entry:ship.velocity.map(v=>v/speed)};
        } else if (speed>ship.speed*(evading?.85:.5) && noseDot>-.2 && Math.abs(travelDot)<.92 && (evading?travelDot<.25:distance<range*1.05)) {
            // Sideways momentum spoils the opponent's lead while the nose turns
            // onto a firing solution. The trajectory remains real, with no snap.
            move={kind:'drift-pass',started:time,until:time+(ace?1.6:1.1)};
        }
        ship.aceMove=move;
    }
    return move;
}
