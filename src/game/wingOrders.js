// Standing orders for a player-commanded wing. The Arena Run's hired veterans
// and the campaign's story companion share this vocabulary and these gates, so
// a wing behaves the same whether it is flying a gauntlet wave or the family
// prologue. Every wingman carries its OWN order (a hired pair can fly different
// tactics side by side); the arena run keeps a run-wide default for legacy
// saves, the Y key and the save migration. Distances are world units
// (1 unit = 1 km), and every gate is measured from the PILOT rather than from
// the wingman: a chase is reined in by the pilot's own position, so a wing
// cannot be dragged across the map by a running opponent.
import {combatTargetEligible} from './combatTargeting.js';

export const WING_ORDERS=['aggressive','defensive','breakoff'];
export const WING_ORDER_LABEL={aggressive:'AGGRESSIVE',defensive:'DEFENSIVE',breakoff:'BREAK OFF'};
// The same three orders in the width a cockpit monitor can spare. The cockpit
// plaques (the own-ship screen and the floating chip) print these next to the
// wing's size; the run screen and the event log keep the long names.
export const WING_ORDER_SHORT={aggressive:'AGG',defensive:'DEF',breakoff:'OFF'};
export const WING_ORDER_HINT={
    aggressive:'Engages hostiles within 1000 km of you and returns to formation past 1500 km.',
    defensive:'Engages your target within 600 km and returns to formation past 1000 km.',
    breakoff:'Runs out of the fight and stays clear until you call it back.',
};
// acquire: how close to the pilot a target must be to be taken on. release: how
// far it may drift while the lock is held. That gap is the hysteresis which
// stops a target hovering on the boundary from making the wing break and
// re-commit every second.
export const WING_ORDER_GATE={aggressive:{acquire:1000,release:1500},defensive:{acquire:600,release:1000}};
// Orders shipped before the range gates were named engage/formation.
const LEGACY_WING_ORDER={engage:'aggressive',formation:'defensive'};
export const normalizeWingOrder=value=>WING_ORDERS.includes(value)?value:LEGACY_WING_ORDER[value]??WING_ORDERS[0];
export const nextWingOrder=value=>WING_ORDERS[(WING_ORDERS.indexOf(normalizeWingOrder(value))+1)%WING_ORDERS.length];
export const wingOrderGate=order=>WING_ORDER_GATE[normalizeWingOrder(order)];

// Which live ships a wing may legally engage is the caller's rule — the arena
// spawns its opponents hostile, the prologue marks its raider — so it arrives
// as a predicate. The shared part is that a candidate must be shootable at all.
const defaultOpponent=entry=>entry.hostile===true;
export const wingOrderCandidates=(session,ship,isOpponent=defaultOpponent)=>{
    const out=[];
    for(const entry of session.ships??[])
        if(entry!==ship&&combatTargetEligible(entry)&&isOpponent(entry))out.push(entry);
    return out;
};
export const wingOrderPilotDistance=(entry,pilotPosition)=>Math.hypot(
    entry.position[0]-pilotPosition[0],entry.position[1]-pilotPosition[1],entry.position[2]-pilotPosition[2]);
// The closest live hostile to the wingman itself, used by every break-off leg.
export const nearestWingThreat=(session,ship)=>{
    let best,bestDistance=Infinity;
    for(const other of session.ships??[]){
        if(other===ship||other.hull<=0||!other.hostile)continue;
        const distance=(other.position[0]-ship.position[0])**2+(other.position[1]-ship.position[1])**2+(other.position[2]-ship.position[2])**2;
        if(distance<bestDistance){bestDistance=distance;best=other;}
    }
    return best;
};

// The single opponent a range-gated order allows, or undefined when the wing
// should re-form. A target the wing already holds (heldId) is kept out to the
// release gate while a fresh one must be inside the acquire gate. break off has
// no gate at all: it never engages.
export const wingOrderTarget=(session,ship,order,heldId,{isOpponent=defaultOpponent}={})=>{
    const gate=wingOrderGate(order);
    if(!gate)return undefined;
    const player=session.save.player;
    const fromPilot=entry=>wingOrderPilotDistance(entry,player.position);
    const legal=entry=>fromPilot(entry)<=(entry.id===heldId?gate.release:gate.acquire);
    const candidates=wingOrderCandidates(session,ship,isOpponent);
    const nearestOf=predicate=>{
        let best,nearest=Infinity;
        for(const entry of candidates){
            if(!predicate(entry))continue;
            const distance=fromPilot(entry);
            if(distance<nearest){nearest=distance;best=entry;}
        }
        return best;
    };
    // The pilot's own mark outranks everything, so the wing piles onto whatever
    // the player is already shooting instead of picking its own duel.
    const mark=player.currentTargetId&&player.currentTargetId!=='player'
        ?session.ships.find(entry=>entry.id===player.currentTargetId):undefined;
    if(mark&&mark!==ship&&combatTargetEligible(mark)&&isOpponent(mark)&&legal(mark))return mark;
    // Answering fire outranks hunting: anything shooting the wing inside the
    // release band is legal for either gated order and is dropped the moment it
    // leaves the band, so a gunner never gets a free pass but is never chased
    // across the field either.
    const attacker=nearestOf(entry=>(entry.targetId===ship.id
        ||(entry.id===ship.combatThreatId&&session.save.world.time<(ship.combatThreatUntil??-Infinity)))
        &&fromPilot(entry)<=gate.release);
    if(attacker)return attacker;
    // Defensive engages no target of its own: with no mark and no attacker it
    // re-forms rather than choosing a fight.
    return normalizeWingOrder(order)==='defensive'?undefined:nearestOf(legal);
};
