// Deliberate, bounded commitments. Every move uses ordinary flight inputs.
export function aceManeuver(ship, time, distance, noseDot, travelDot, range, safe, inField=false) {
    if (ship.pilot?.tier !== 'ace' || ship.tutorialEnemy || ship.tutorialCompanion || ship.capitalClass || ship.fleeing || ship.covering || !safe) {
        if (ship.aceMove) ship.aceMoveReadyAt=time+8;
        ship.aceMove=undefined;
        return;
    }
    let move=ship.aceMove;
    if (move && (time>=move.until || (move.kind==='boost-reversal' && time-move.started>1.4 && noseDot>0.97))) {
        ship.aceMove=undefined;ship.aceMoveReadyAt=time+8+(ship.aiRng?.() ?? 0.5)*4;
        ship.attackPhase='approach';
        return;
    }
    if (!move && time >= (ship.aceMoveReadyAt ?? 0) && distance>65 && distance<Math.max(range*1.2,240)) {
        const speed=Math.hypot(...ship.velocity);
        if (ship.attackPhase==='extend' && noseDot < -0.2 && ship.fuel>5 && speed>ship.speed*0.45) {
            const kind=inField&&((ship.aceBreakCount=(ship.aceBreakCount??0)+1)%2===1)?'rolling-break':'boost-reversal';
            move={kind,started:time,until:time+4.2,entry:ship.velocity.map(v=>v/speed)};
        } else if (ship.attackPhase==='approach' && distance<range*0.85 && travelDot>0.1 && travelDot<0.9 && speed>ship.speed*0.5 && noseDot>0) {
            move={kind:'drift-pass',started:time,until:time+1.25};
        }
        ship.aceMove=move;
    }
    return move;
}
