import * as THREE from 'three';
import {combatTargetEligible} from './combatTargeting.js';
import {corridorClear, planCombatRoute, requestFieldRoadmap} from './fieldRoadmap.js';
import {steerFlightTurn, integrateFlightVelocity} from './flightDynamics.js';
import {wingOrderGate} from './wingOrders.js';

// Hull roles govern engagement geometry and weapons; pilot skill governs execution.
// Shared immutable profiles keep the 60 Hz combat loop allocation-free.
const PROFILES = {
    interceptor: Object.freeze({ role: 'interceptor', range: 220, projectileSpeed: 185, life: 1.8, interval: 0.24, damage: 6.5, pass: 34, reset: 145, extend: 2.8, standoff: 12 }),
    fighter: Object.freeze({ role: 'fighter', range: 250, projectileSpeed: 195, life: 1.9, interval: 0.32, damage: 8, pass: 52, reset: 235, extend: 4.2, standoff: 23 }),
    gunship: Object.freeze({ role: 'gunship', range: 380, projectileSpeed: 250, life: 2, interval: 0.85, damage: 22, pass: 170, reset: 300, extend: 8, standoff: 10 }),
};
export function combatProfile(ship) {
    if (ship.tutorialEnemy || ship.tutorialCompanion || ship.capitalClass) return undefined;
    if (ship.combatFit) return ship.combatFit.profile;
    const variant = ship.variant;
    if (variant === 'lancer' || (!variant && ship.role === 'bounty')) return PROFILES.gunship;
    if (variant === 'kestrel' || (!variant && ship.role === 'escort')) return PROFILES.interceptor;
    if (variant === 'talon' || variant === 'scrapper' || variant === 'warden' || (!variant && (ship.role === 'pirate' || ship.role === 'patrol'))) return PROFILES.fighter;
    return undefined;
}
export function interceptTime(rx, ry, rz, vx, vy, vz, speed) {
    const a = vx*vx + vy*vy + vz*vz - speed*speed;
    const b = rx*vx + ry*vy + rz*vz;
    const c = rx*rx + ry*ry + rz*rz;
    if (Math.abs(a) < 1e-6) return b < 0 ? -c / (2*b) : Infinity;
    const d = b*b - a*c;
    if (d < 0) return Infinity;
    const root = Math.sqrt(d);
    const t1 = (-b-root)/a, t2 = (-b+root)/a;
    return Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
}

const position = new THREE.Vector3(), point = new THREE.Vector3(), pressureAxis = new THREE.Vector3();
const stoppingPoint = new THREE.Vector3(), approach = new THREE.Vector3();
const nose = new THREE.Vector3(), velocity = new THREE.Vector3(), heading = new THREE.Vector3(), orientation = new THREE.Quaternion();
const candidate = new THREE.Vector3(), best = new THREE.Vector3(), predicted = new THREE.Vector3(), sight = new THREE.Vector3();
const side = new THREE.Vector3(), radial = new THREE.Vector3(), leg = new THREE.Vector3(), previous = new THREE.Vector3();
const directions = [];
for (const x of [-1,0,1]) for (const y of [-1,0,1]) for (const z of [-1,0,1])
    if (x || y || z) directions.push(new THREE.Vector3(x,y,z).normalize());
const rolloutPosition = new THREE.Vector3(), rolloutVelocity = new THREE.Vector3(), rolloutAngular = new THREE.Vector3();
const rolloutRotation = new THREE.Quaternion(), rolloutDesired = new THREE.Quaternion(), rolloutFrom = new THREE.Vector3();
const rolloutNose = new THREE.Vector3(), rolloutGoal = new THREE.Vector3(), rolloutStop = new THREE.Vector3();
const rolloutEye = new THREE.Vector3(), rolloutCourse = new THREE.Vector3(), rolloutDelta = new THREE.Vector3();
const forward = new THREE.Vector3(0,0,-1);
const MAX_COVER_APPROACH = 8;
const forecastPoints = Array.from({length: MAX_COVER_APPROACH * 2 + 1}, () => new THREE.Vector3());
for (let i=0; i<60; i++) {
    const y = 1 - 2 * (i + .5) / 60, ring = Math.sqrt(1 - y*y);
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    directions.push(new THREE.Vector3(Math.cos(angle)*ring, y, Math.sin(angle)*ring));
}

const APPROACH_LIMIT = 10, COVER_HOLD = 5, AMBUSH_HOLD = 4;
const eligible = ship => combatTargetEligible(ship) && ship.combatFit && !ship.pursuitHoldFire
    && !ship.stationDock && !ship.jumpPursuit && !ship.arrestedBy && !ship.tutorialPatrol
    && !ship.capitalClass && !ship.tutorialEnemy && (!ship.tutorialCompanion || ship.campaignCombat) && !ship.fleeing;

function directRoute(ship, goal) {
    const route = ship.fieldDirectRoute ??= [[0, 0, 0]];
    goal.toArray(route[0]);
    return route;
}

function startTactic(session, ship, kind, route, threat, now) {
    const tactic = ship.fieldTactic ??= {anchor: [0, 0, 0]};
    clearCoverSearch(ship);
    tactic.replanning = false;
    tactic.kind = kind;
    tactic.route = route;
    tactic.index = 0;
    tactic.targetId = ship.targetId;
    tactic.threatId = ship.targetId;
    tactic.until = now + APPROACH_LIMIT;
    tactic.checkAt = now;
    tactic.replans = 0;
    tactic.direct = false;
    tactic.started = now;
    tactic.lastSeen = now;
    tactic.nextPlan = now;
    tactic.firingUntil = 0;
    tactic.peekAt = Infinity;
    tactic.confirmed = false;
    tactic.holdUntil = 0;
    threat.toArray(tactic.anchor);
    // Clear the old pursuit leg when returning to normal combat.
    if (ship.combatRoute) {
        ship.combatRoute.active = false;
        ship.combatRoute.waypoints = null;
    }
    session.onFieldTactic?.(ship, kind);
    return tactic;
}

// Include the initial turn and the speed the hull already has down the leg.
// For a short dash the turn can take longer than the flight itself.
function departureTime(ship, start, end) {
    const stats = ship.combatFit.stats;
    heading.subVectors(end, start);
    const distance = heading.length();
    if (!distance) return 0;
    heading.multiplyScalar(1 / distance);
    nose.set(0,0,-1).applyQuaternion(orientation.fromArray(ship.rotation));
    const turn = nose.angleTo(heading) * stats.angularDamping / stats.angularAcceleration;
    const along = velocity.fromArray(ship.velocity).dot(heading);
    return turn + distance / ship.speed + Math.max(0, Math.min(distance / ship.speed,
        (ship.speed - along) / stats.acceleration));
}

function routeTime(ship, start, route) {
    let time = departureTime(ship, start, leg.fromArray(route[0]));
    for (let i = 1; i < route.length; i++) {
        previous.copy(leg);
        time += leg.fromArray(route[i]).distanceTo(previous) / ship.speed + 1;
    }
    return time;
}

function forecastStart(ship, start) {
    rolloutPosition.copy(start);
    rolloutVelocity.fromArray(ship.velocity);
    rolloutRotation.fromArray(ship.rotation);
    if (ship.flightAngularVelocity) rolloutAngular.copy(ship.flightAngularVelocity);
    else rolloutAngular.set(0,0,0);
}

export function tacticLegSpeed(cruise, alignment, acceleration, distance) {
    return Math.min(cruise * Math.max(0, alignment), Math.sqrt(2 * acceleration * distance));
}

// Use the same assisted turn, thrust and stopping distance as the live dash.
// Integrate four substeps per chord to include sideways drift during the turn.
function advanceForecast(ship, goal, duration) {
    const stats = ship.combatFit.stats, dt = duration / 4;
    for (let i=0;i<4;i++) {
        rolloutDelta.subVectors(goal, rolloutPosition);
        const distance = rolloutDelta.length();
        rolloutDelta.normalize();
        rolloutDesired.setFromUnitVectors(forward, rolloutDelta);
        const alignment = rolloutNose.copy(forward).applyQuaternion(rolloutRotation).dot(rolloutDelta);
        const speed = tacticLegSpeed(ship.speed, alignment, stats.acceleration, distance);
        steerFlightTurn(rolloutRotation,rolloutAngular,rolloutDesired,stats,true,false,dt,undefined,ship.pilot?.tier==='ace'?3.6:1);
        rolloutNose.copy(forward).applyQuaternion(rolloutRotation);
        integrateFlightVelocity(rolloutVelocity,rolloutNose,speed,ship.speed,stats.acceleration,true,false,1,dt,stats.lateralMultiplier);
        rolloutPosition.addScaledVector(rolloutVelocity,dt);
    }
}

function forecastLeg(session, ship, goal, duration) {
    rolloutFrom.copy(rolloutPosition);
    advanceForecast(ship, goal, duration);
    return corridorClear(session, rolloutFrom, rolloutPosition);
}

// Share heading evaluations between pilots on the same fixed simulation step.
const COVER_HEADINGS_PER_STEP = 5;

function clearCoverSearch(ship) {
    if (ship.coverSearch) ship.coverSearch.pending = ship.coverSearch.ready = false;
}

function beginCoverSearch(session, ship, start, attacker, motion, budget, threatId, replan) {
    const search = ship.coverSearch ??= {
        start: new THREE.Vector3(), attacker: new THREE.Vector3(), motion: new THREE.Vector3(), best: new THREE.Vector3(),
        velocity: [0,0,0], rotation: [0,0,0,1], flightAngularVelocity: new THREE.Vector3(),
    };
    search.start.copy(start);
    search.attacker.copy(attacker);
    search.motion.copy(motion);
    for (let i=0; i<3; i++) search.velocity[i]=ship.velocity[i];
    for (let i=0; i<4; i++) search.rotation[i]=ship.rotation[i];
    if (ship.flightAngularVelocity) search.flightAngularVelocity.copy(ship.flightAngularVelocity);
    else search.flightAngularVelocity.set(0,0,0);
    search.threatId = threatId;
    search.targetId = ship.targetId;
    search.field = session.activeInstanceId;
    search.budget = budget;
    search.fastest = budget + .5;
    search.index = -1;
    search.replan = replan;
    search.pending = true;
    search.ready = search.found = false;
    const queue = session.coverSearchQueue ??= [];
    if (!queue.includes(ship)) queue.push(ship);
    return search;
}

function evaluateCoverHeading(session, ship, search) {
    const {start, attacker, motion} = search;
    const stats = ship.combatFit.stats, targetSpeed = motion.length();
    const i = search.index++;
    const direction = i < 0 ? radial.fromArray(search.velocity).normalize() : directions[i];
    if (!direction.lengthSq()) return;
    forecastStart(search, start);
    rolloutGoal.copy(start).addScaledVector(direction,ship.speed * search.budget);
    rolloutEye.copy(attacker);
    rolloutCourse.copy(motion);
    forecastPoints[0].copy(start);
    for (let age=.5; age<search.fastest; age+=.5) {
        advanceForecast(ship, rolloutGoal, .5);
        const end = age * 2;
        forecastPoints[end].copy(rolloutPosition);
        // A pursuer can change bearing. Check its recent course as well
        // as a turning pursuit, based solely on this sighting.
        rolloutDelta.subVectors(rolloutPosition,rolloutEye).normalize().multiplyScalar(targetSpeed);
        rolloutCourse.lerp(rolloutDelta,.5);
        rolloutEye.addScaledVector(rolloutCourse,.5);
        if (!session.lineBlocked(rolloutPosition,rolloutEye,ship.id)) continue;
        rolloutStop.copy(rolloutPosition).addScaledVector(rolloutVelocity,Math.max(.5,rolloutVelocity.length()/(2*stats.acceleration)));
        predicted.copy(attacker).addScaledVector(motion,Math.min(age,3));
        if (!session.lineBlocked(rolloutStop,rolloutEye) || !session.lineBlocked(rolloutStop,predicted)
            || !corridorClear(session,rolloutPosition,rolloutStop) || !corridorClear(session,start,rolloutStop)) continue;
        // The expensive wing rays are only needed on a path with a real
        // shadow at its end. A blocked earlier chord rules out this turn.
        let clear = true;
        for (let j=1; j<=end; j++) {
            if (!corridorClear(session,forecastPoints[j-1],forecastPoints[j])) { clear = false; break; }
        }
        if (!clear) break;
        search.fastest=age;
        search.best.copy(rolloutStop);
        search.found=true;
        break;
    }
}

export function advanceCoverSearches(session) {
    const queue = session.coverSearchQueue;
    const now = session.save.world.time;
    if (!queue?.length || session.coverWorkAt === now) return;
    session.coverWorkAt = now;
    for (let i=0; i<COVER_HEADINGS_PER_STEP && queue.length; i++) {
        const ship = queue.shift(), search = ship.coverSearch;
        if (!search.pending || !eligible(ship) || search.targetId !== ship.targetId
            || search.field !== session.activeInstanceId || !session.ships.includes(ship)) {
            clearCoverSearch(ship);
            continue;
        }
        evaluateCoverHeading(session, ship, search);
        if (search.index < directions.length && search.fastest > .5) {
            queue.push(ship);
        } else {
            search.pending = false;
            search.ready = true;
            search.finishedAt = now;
            if (ship.combatPlan) ship.combatPlan.next = 0;
            if (search.replan) ship.fieldTactic.checkAt = 0;
        }
    }
}

function coverRoute(session, ship, start, attacker, motion, budget, threatId, replan) {
    let search = ship.coverSearch;
    const recent = search?.ready && session.save.world.time - search.finishedAt <= .5;
    if ((!search?.pending && !recent) || search.targetId !== ship.targetId
        || search.threatId !== threatId || search.replan !== replan || search.field !== session.activeInstanceId) {
        search = beginCoverSearch(session, ship, start, attacker, motion, budget, threatId, replan);
    }
    advanceCoverSearches(session);
    if (!search.ready) return;
    search.ready = false;
    ship.coverCheckAt = session.save.world.time + .5;
    // The pilot and attacker kept flying while the headings were evaluated.
    // Verify the entry and shadow from their latest observed positions.
    if (search.found && corridorClear(session,start,search.best)
        && session.lineBlocked(search.best,predicted.copy(attacker).addScaledVector(motion,Math.min(search.fastest,3)))) {
        return directRoute(ship, search.best);
    }
    if (motion.lengthSq() > 25 || !requestFieldRoadmap(session,ship.position)?.ready) return;
    const route = planCombatRoute(session,ship,start,attacker,0,'cover',null,ship.speed*budget);
    if (route && routeTime(ship,start,route) <= budget
        && session.lineBlocked(leg,predicted.copy(attacker).addScaledVector(motion,budget))) return route;
}

function activeFieldTactic(session, ship) {
    const tactic = ship.fieldTactic;
    return tactic?.kind && eligible(ship) && session.save.world.time < tactic.until
        && ship.targetId === tactic.targetId && (tactic.kind !== 'ambush' || ship.hostile && !ship.arenaRunWingman);
}

function teammateCommitted(session, ship) {
    for (const other of session.ships) {
        if (other !== ship && other.faction === ship.faction && other.targetId === ship.targetId
            && activeFieldTactic(session, other) && (other.fieldTactic.bait === ship || other.fieldTactic.kind !== 'flank')) return true;
    }
    return false;
}

export function planCoverBreak(session, ship, plan, now) {
    if (!eligible(ship) || !session.activeInstanceId || ship.fieldTactic?.kind || teammateCommitted(session, ship)) return;
    const attacker = actorById(session, plan.threatId ?? ship.targetId);
    const motion = approach.set(0,0,0);
    if (attacker?.velocity) motion.fromArray(attacker.velocity);
    const route = coverRoute(session, ship, plan.position, plan.threatPosition, motion, 5, plan.threatId ?? ship.targetId, false);
    if (!route) return;
    const tactic = startTactic(session, ship, 'cover', route, plan.threatPosition, now);
    tactic.until = now + Math.min(14, Math.ceil(routeTime(ship, plan.position, route)) + 2 + COVER_HOLD);
    motion.toArray(tactic.motion ??= [0,0,0]);
    tactic.threatId = plan.threatId ?? ship.targetId;
    return tactic;
}

// Pick the nearer shoulder of the pressure axis, leading only a sighted
// target. A single clear leg is enough when the terrain gives us one.
function sidePosition(session, start, target, motion, bait, range) {
    pressureAxis.fromArray(bait.position).sub(target).normalize();
    radial.subVectors(start, target);
    side.copy(radial).addScaledVector(pressureAxis, -radial.dot(pressureAxis));
    if (side.lengthSq() < 1) {
        side.crossVectors(pressureAxis, Math.abs(pressureAxis.y) < .9 ? side.set(0,1,0) : side.set(1,0,0));
    }
    side.normalize();
    const radius = Math.min(range * .6, Math.max(100, radial.length() * .6));
    predicted.copy(target).addScaledVector(motion, 2);
    candidate.copy(predicted).addScaledVector(side, radius).addScaledVector(pressureAxis, -radius * .5);
    if (!session.lineBlocked(candidate, predicted) && corridorClear(session, start, candidate)) return candidate;
}

function maintainsPressure(session, bait, targetId, target) {
    return eligible(bait) && bait.targetId === targetId && bait.combatPlan?.visible && !bait.search && !bait.patrolMemoryActive
        && !bait.fieldTactic?.kind && !bait.combatPlan.recovery?.active
        && (targetId !== 'player' || session.shipTracksPlayer(bait)) && bait.fireRange > 0
        && point.fromArray(bait.position).distanceToSquared(target) <= bait.fireRange ** 2
        && !session.lineBlocked(point, target, bait.id);
}

export function planTerrainFlank(session, ship, plan, team, target, now) {
    if (!session.activeInstanceId || !eligible(ship) || ship.arenaRunWingman || ship.tutorialCompanion
        || ship.targetId === 'player' && !ship.hostile
        || team?.leader === ship || !team?.leader || team.members.length < 2
        || !plan.visible || plan.recovery.active || ship.fieldTactic?.kind
        || now < (ship.nextFieldFlank ?? 0) || now < (team.flankUntil ?? 0)) return;
    ship.nextFieldFlank = now + 3;
    if (now - (ship.lastCombatShotAt ?? -Infinity) < 2) return;
    // The bait must actually have contact. A stale lock behind rock does not count.
    if (!team.members.includes(ship) || !maintainsPressure(session, team.leader, ship.targetId, target)) return;
    const map = requestFieldRoadmap(session, ship.position);
    if (!map?.ready) return;
    pressureAxis.fromArray(team.leader.position).sub(target).normalize();
    const start = plan.position, range = Math.min(ship.fireRange, 500);
    if (start.distanceTo(target) > range * 1.5) return;
    if (start.distanceTo(target) <= range && radial.subVectors(start, target).dot(pressureAxis) <= 0) return;
    const motion = plan.targetVelocity;
    const moving = motion && motion.lengthSq() > 100;
    const direct = moving && sidePosition(session, start, target, motion, team.leader, range);
    const route = direct ? directRoute(ship, direct) : planCombatRoute(session, ship, start, target, range,
        'flank', pressureAxis, ship.speed * 8);
    if (!route || routeTime(ship, start, route) > APPROACH_LIMIT + 2) return;
    const tactic = startTactic(session, ship, 'flank', route, target, now);
    start.toArray(tactic.departure ??= [0,0,0]);
    tactic.bait = team.leader;
    tactic.range = range;
    tactic.until = now + Math.min(14, Math.ceil(routeTime(ship, start, route)) + 4);
    team.flankUntil = now + 15;
    ship.nextFieldFlank = now + 30;
}

function ambusherAvailable(session, ship) {
    if (ship.ambushTried || ship.passPhase >= Math.PI * 2 * .4 || !ship.hostile || ship.targetId !== 'player'
        || !session.activeInstanceId || !eligible(ship) || ship.arenaRunWingman || ship.fieldTactic?.kind) return false;
    for (const other of session.ships) {
        if (other.fieldTactic?.kind === 'ambush' && activeFieldTactic(session, other)) return false;
    }
    return true;
}

// From a sighting, look for a nearby shadow the approaching pilot will pass.
// Both the way in and the shot out must be clear on the observed trajectory.
export function planApproachAmbush(session, ship, plan, target, now) {
    if (!plan.visible || plan.recovery.active || plan.targetVelocity.lengthSq() < 15 ** 2
        || now < (ship.ambushCheckAt ?? 0) || !ambusherAvailable(session, ship)) return;
    ship.ambushCheckAt = now + 1;
    approach.copy(target).addScaledVector(plan.targetVelocity, 3);
    if (session.lineBlocked(target, approach)) return;
    let cover = session.findCoverPoint(plan.position, target, true, approach);
    let peek = false;
    if (!cover || plan.position.distanceTo(cover) > ship.speed * 2) {
        if (plan.travel.lengthSq() < 20 ** 2) return;
        let fastest = 3;
        cover = undefined;
        for (const direction of directions) {
            candidate.copy(plan.position).addScaledVector(direction, 60);
            const eta = departureTime(ship, plan.position, candidate);
            if (eta >= fastest || !session.lineBlocked(target, candidate)
                || !corridorClear(session, plan.position, candidate)
                || !corridorClear(session, previous.copy(plan.travel).multiplyScalar(.5).add(plan.position), candidate)) continue;
            const needsPeek = session.lineBlocked(approach, candidate);
            if (needsPeek && session.lineBlocked(approach, plan.position)) continue;
            fastest = eta;
            cover = best.copy(candidate);
            peek = needsPeek;
        }
    }
    if (!cover || teammateCommitted(session, ship)) return;
    const futureRange = approach.distanceTo(cover);
    if (futureRange > Math.min(ship.fireRange, 400) || futureRange + 20 > target.distanceTo(cover)) return;
    // A clear straight leg is insufficient if the pilot will slide past it.
    // The hull must actually reach shadow before the approaching mark does.
    forecastStart(ship,plan.position);
    let entersShadow = false;
    for (let age=.5; age<=3; age+=.5) {
        if (!forecastLeg(session,ship,cover,.5)) return;
        predicted.copy(target).addScaledVector(plan.targetVelocity,age);
        if (rolloutPosition.distanceToSquared(cover) < 60**2 && session.lineBlocked(rolloutPosition,predicted)) {
            entersShadow = true;
            break;
        }
    }
    if (!entersShadow) return;
    ship.ambushTried = true;
    const tactic = startTactic(session, ship, 'ambush', directRoute(ship, cover), target, now);
    approach.toArray(tactic.look ??= [0,0,0]);
    tactic.peek = peek ? plan.position.toArray(tactic.peek ?? [0,0,0]) : null;
    tactic.until = now + 4;
}

// A waiting hunter uses the last sighting or entry briefing as its approach
// lane. Only a real sensor track can spring the trap.
export function tryFieldAmbush(session, ship, now) {
    if (ship.search?.kind !== 'hostile' || !ship.playerTrackOccluded
        || now < (ship.shadowCheckAt ?? 0) || !ambusherAvailable(session, ship)) return;
    ship.shadowCheckAt = now + 1;
    point.fromArray(ship.search.anchor);
    position.fromArray(ship.position);
    const range = Math.min(ship.fireRange || ship.combatFit.profile.range,500);
    if (position.distanceToSquared(point) > range * range || teammateCommitted(session, ship)) return;
    const track = ship.gunAim;
    approach.copy(point);
    if (track?.targetId === 'player' && now - track.observedAt <= 2) approach.addScaledVector(track.velocity,2);
    const speed = Math.hypot(...ship.velocity);
    const brakingTime = speed / ship.combatFit.stats.acceleration;
    stoppingPoint.fromArray(ship.velocity).multiplyScalar(brakingTime * .5).add(position);
    if (!corridorClear(session, position, stoppingPoint) || !session.lineBlocked(stoppingPoint, point, ship.id)
        || session.lineBlocked(point, approach) || stoppingPoint.distanceTo(approach) > range) return;
    let peek;
    if (session.lineBlocked(stoppingPoint, approach)) {
        let fastest = 3;
        for (const direction of directions) {
            candidate.copy(stoppingPoint).addScaledVector(direction,60);
            const eta = departureTime(ship,stoppingPoint,candidate);
            if (eta >= fastest || session.lineBlocked(candidate,approach)
                || !corridorClear(session,stoppingPoint,candidate) || !corridorClear(session,position,candidate)) continue;
            fastest = eta;
            peek = best.copy(candidate);
        }
        if (!peek) return;
    }
    ship.ambushTried = true;
    const tactic = startTactic(session, ship, 'ambush', directRoute(ship, stoppingPoint), point, now);
    approach.toArray(tactic.look ??= [0,0,0]);
    if (peek) peek.toArray(tactic.route[0]);
    tactic.peekAt = peek ? now + 1 : Infinity;
    tactic.holdUntil = now + AMBUSH_HOLD;
    tactic.until = peek ? tactic.peekAt + 4 : tactic.holdUntil;
}

function finishTactic(ship, tactic, now) {
    if (tactic.kind === 'cover') {
        const recovery = ship.combatPlan.recovery;
        recovery.active = false;
        recovery.finishedAt = now;
        recovery.lastResult = ship.shield >= recovery.shieldGoal ? 'recovered' : 'ended';
        recovery.readyAt = now + 30;
        ship.repositionUntil = ship.breakUntil = 0;
    }
    clearCoverSearch(ship);
    tactic.kind = null;
    tactic.firingUntil = 0;
    tactic.route = null;
    tactic.bait = null;
    if (ship.combatPlan) ship.combatPlan.next = 0;
}

export function interruptFieldTactic(session, ship) {
    clearCoverSearch(ship);
    const tactic = ship.fieldTactic;
    if (!tactic?.kind) return;
    session.onFieldTacticEnd?.(ship, ship.hull <= 0 ? 'killed' : 'unavailable');
    finishTactic(ship, tactic, session.save.world.time);
}

export function releaseUnavailablePilot(session, ship) {
    if ((ship.fieldTactic?.kind || ship.coverSearch?.pending || ship.coverSearch?.ready) && !eligible(ship))
        interruptFieldTactic(session, ship);
}

function actorById(session, id) {
    if (id === 'player') return session.save.player;
    for (const other of session.ships) if (other.id === id) return other;
}

function observeAttacker(session, ship, tactic) {
    const attacker = actorById(session, tactic.threatId);
    if (!attacker || (tactic.threatId === 'player' && !session.shipTracksPlayer(ship))) return false;
    point.fromArray(attacker.position);
    if (session.lineBlocked(position, point, ship.id)) return false;
    point.toArray(tactic.anchor);
    if (attacker.velocity) approach.fromArray(attacker.velocity).toArray(tactic.motion);
    tactic.lastSeen = session.save.world.time;
    return true;
}

// A route can enter shadow before its last node. Stop at the first shadow
// deep enough for the hull's braking run, and release it if the attacker
// rounds the obstacle. A parked pilot no longer needs the old approach leg.
function canHoldCover(session, ship, tactic) {
    point.fromArray(tactic.anchor);
    const hidden = tactic.threatId === 'player' ? ship.playerTrackOccluded : session.lineBlocked(position, point, ship.id);
    if (!hidden) return false;
    if (tactic.holdUntil) return true;
    stoppingPoint.fromArray(ship.velocity);
    const brakingTime = stoppingPoint.length() / ship.combatFit.stats.acceleration;
    stoppingPoint.multiplyScalar(Math.max(.5, brakingTime * .5)).add(position);
    point.addScaledVector(approach.fromArray(tactic.motion), Math.min(1, session.save.world.time - (tactic.lastSeen ?? tactic.started)));
    return corridorClear(session, position, stoppingPoint) && session.lineBlocked(stoppingPoint, point, ship.id);
}

function rerouteToCover(session, ship, tactic) {
    const remaining = tactic.until - session.save.world.time;
    if (tactic.replans >= 4 || remaining <= 1) return false;
    const route = coverRoute(session, ship, position, sight.fromArray(tactic.anchor), approach.fromArray(tactic.motion), Math.min(MAX_COVER_APPROACH, remaining - 1), tactic.threatId, true);
    tactic.replanning = ship.coverSearch.pending;
    if (!route) return tactic.replanning;
    tactic.route = route;
    tactic.index = 0;
    tactic.replans++;
    return true;
}

function routeEndReason(session, ship, tactic, now) {
    const route = tactic.route, last = route.length - 1;
    const cover = tactic.kind === 'cover';
    if (cover) {
        const visible = observeAttacker(session, ship, tactic);
        if (!visible && canHoldCover(session, ship, tactic)) {
            if (!tactic.holdUntil) {
                clearCoverSearch(ship);
                tactic.replanning = false;
                tactic.holdUntil = now + COVER_HOLD;
            }
            if (!tactic.confirmed && now >= tactic.holdUntil - COVER_HOLD + .5) {
                tactic.confirmed = true;
                session.onFieldTactic?.(ship, 'covered');
                session.tacticalBark(ship, 'cover');
            }
            if (now >= tactic.holdUntil) return 'holdExpired';
            if (tactic.confirmed && ship.shield >= ship.combatPlan.recovery.shieldGoal) return 'recharged';
            return;
        }
        if (tactic.holdUntil) return 'exposed';
        if (tactic.replanning) return rerouteToCover(session, ship, tactic) ? undefined : 'routeFailed';
        // A pursuer can round the rock before the pilot reaches it. Only
        // re-evaluate its shadow from a sighting the pilot actually has.
        if (visible) {
            stoppingPoint.fromArray(route[last]);
            const remaining = Math.min(2, position.distanceTo(stoppingPoint) / ship.speed);
            predicted.copy(point).addScaledVector(approach.fromArray(tactic.motion), remaining);
            if (!session.lineBlocked(point, stoppingPoint, ship.id) && !session.lineBlocked(predicted, stoppingPoint, ship.id))
                return rerouteToCover(session, ship, tactic) ? undefined : 'exposed';
        }
    }
    else {
        const target = actorById(session, tactic.targetId);
        if (!maintainsPressure(session, tactic.bait, tactic.targetId, sight.fromArray(target.position))) return 'pressureLost';
        const visible = (tactic.targetId !== 'player' || session.shipTracksPlayer(ship))
            && !session.lineBlocked(position, sight.fromArray(target.position), ship.id);
        if (visible) {
            pressureAxis.fromArray(tactic.bait.position).sub(sight).normalize();
            radial.subVectors(position, sight);
            if (radial.length() <= tactic.range && radial.dot(pressureAxis) <= 0
                && position.distanceToSquared(point.fromArray(tactic.departure)) >= 50 ** 2) {
                ship.flankShotUntil = now + 2;
                ship.flankShotTarget = tactic.targetId;
                session.onFieldTactic?.(ship, 'flankArrival');
                session.tacticalBark(ship, 'flank');
                return 'arrived';
            }
            if (now >= tactic.nextPlan && approach.fromArray(target.velocity).lengthSq() > 100) {
                tactic.nextPlan = now + 1;
                const goal = sidePosition(session, position, sight, approach, tactic.bait, tactic.range);
                if (goal) {
                    goal.toArray(route[last]);
                    tactic.index = last;
                }
            }
        }
    }
    // The actual ship must clear the full wing corridor before cutting a corner.
    if (tactic.index < last && corridorClear(session, position, point.fromArray(route[tactic.index + 1]))) tactic.index++;
    point.fromArray(route[tactic.index]);
    if (!corridorClear(session, position, point)) {
        // Momentum or drifting debris can close a previously clear leg.
        return cover && rerouteToCover(session, ship, tactic) ? undefined : 'routeFailed';
    }
}

function tacticEndReason(session, ship, tactic, now) {
    if (!eligible(ship)) return ship.hull <= 0 ? 'killed' : 'unavailable';
    if (now >= tactic.until) return tactic.firingUntil ? 'noShot' : 'expired';
    if (ship.targetId !== tactic.targetId) return 'targetChanged';
    if (ship.arenaRunWingman && (!wingOrderGate(ship.wingOrder) || ship.wingmanTargetId !== tactic.targetId)) return 'wingOrder';
    const target = actorById(session, tactic.targetId);
    if (!target || target.hull <= 0) return 'targetLost';
    position.fromArray(ship.position);
    if (tactic.kind !== 'ambush') return routeEndReason(session, ship, tactic, now);
    if (tactic.firingUntil) return;
    if (!tactic.holdUntil) {
        point.fromArray(tactic.route[0]);
        if (!corridorClear(session, position, point)) return 'routeFailed';
        if (position.distanceTo(point) < 80 && ship.playerTrackOccluded
            && session.lineBlocked(position, sight.fromArray(tactic.anchor), ship.id)) {
            tactic.holdUntil = tactic.until = now + AMBUSH_HOLD;
            if (tactic.peek) {
                point.fromArray(tactic.peek).toArray(tactic.route[0]);
                tactic.peekAt = now + 1;
            }
        }
        return;
    }
    if (!session.shipTracksPlayer(ship) || position.distanceTo(point.fromArray(target.position)) >= (ship.fireRange || ship.combatFit.profile.range)) return;
    tactic.firingUntil = tactic.until = now + 4;
    if (ship.combatPlan) ship.combatPlan.next = 0;
}

// Sensors still step while the pilot follows a snapshot. Releasing a tactic
// returns control to normal search/target resolution on the same tick.
export function flyFieldTactic(session, ship, dt) {
    const tactic = ship.fieldTactic;
    if (!tactic?.kind) return false;
    const now = session.save.world.time;
    if (tactic.replanning) advanceCoverSearches(session);
    const holdLimit = tactic.holdUntil && (tactic.kind === 'cover' || tactic.kind === 'ambush' && !tactic.firingUntil && now < tactic.peekAt);
    if (now >= tactic.checkAt || (holdLimit && now >= tactic.holdUntil) || (tactic.kind === 'cover' && now >= tactic.until)) {
        tactic.checkAt = now + .25;
        const reason = tacticEndReason(session, ship, tactic, now);
        if (reason) {
            session.onFieldTacticEnd?.(ship, reason);
            finishTactic(ship, tactic, now);
            return false;
        }
        tactic.direct = false;
        if (!tactic.replanning && tactic.kind !== 'flank' && (!tactic.holdUntil || now >= tactic.peekAt)) {
            forecastStart(ship,position.fromArray(ship.position));
            point.fromArray(tactic.route[tactic.index]);
            tactic.direct = forecastLeg(session, ship, point, .5) && forecastLeg(session, ship, point, .5)
                && corridorClear(session,rolloutPosition,rolloutStop.copy(rolloutPosition).addScaledVector(rolloutVelocity,.75));
        }
    }
    if (tactic.firingUntil) return false;
    const holding = tactic.replanning || tactic.holdUntil > 0 && now < tactic.peekAt;
    session.updateTravelAI(ship, dt, holding ? (tactic.kind === 'ambush' ? tactic.look : tactic.anchor) : tactic.route[tactic.index], holding ? 0 : ship.speed);
    return true;
}

export function ambushShot(session, ship, targetId) {
    const tactic = ship.fieldTactic;
    if (!tactic?.firingUntil || targetId !== tactic.targetId) return;
    session.onFieldTactic?.(ship, 'spring');
    session.onFieldTacticEnd?.(ship, 'sprung');
    session.tacticalBark(ship, 'spring');
    finishTactic(ship, tactic, session.save.world.time);
}
