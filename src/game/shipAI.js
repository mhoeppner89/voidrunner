import { stationApproach, reserveStationDock, updateStationDock } from './stationTraffic.js';
// NPC ship AI hierarchy — task → interaction → behavior.
//
// Every ship runs a four-layer decision stack each frame, in this order:
//
//   1. Pilot (pilots.js) — personality knobs that modulate everything below.
//   2. Task (this module) — what the ship wants: trade a port-to-port route,
//      patrol a lane, work a mining claim, strip a wreck, smuggle dark cargo,
//      hunt prey, or flee a fight. A task is a small state machine that yields
//      a travel waypoint (ship.destination) and knows when it is done. Tasks
//      are transient per-ship state — ships are never persisted.
//   3. Interaction (this module) — what happens when tasks collide: a hunt
//      task that closes on the player rolls a mug standoff before opening
//      fire, and patrols flag dark smugglers. Civilian escape preempts combat;
//      combat/search otherwise preempt the working task.
//   4. Behavior (game.js) — how the ship moves this frame: updateAttackAI,
//      updateSearchAI, and updateTravelAI are pure movement primitives fed by
//      the layers above. updateTravelAI no longer re-rolls destinations by
//      role — tasks own waypoints.
//
// Determinism contract: every roll in this module rides the per-ship route
// stream (seededRandom(`...:route:${ship.id}:${bucket}`), a fresh stream per
// call, keyed exactly like the old travel-AI re-roll) — never the ship's
// aiRng/proxRng combat streams, so headless combat probes stay byte-identical.
import { COMMODITIES, LOCATIONS, activityLocationIdsForSystem, dockLocationIdsForSystem, marketLocationIdsForSystem } from './data.js';
import { deliverCargo } from './economy.js';
import { pick, randomBetween, seededRandom } from './random.js';
import { interruptFieldTactic, releaseUnavailablePilot, flyFieldTactic, tryFieldAmbush } from './combatTactics.js';
import { continueShieldRecovery } from './combatRecovery.js';
import { continueTerrainManeuver } from './terrainManeuvers.js';

// How close a ship must be to its waypoint before the task advances (matches
// updateTravelAI's arrival distance).
const ARRIVE = 30;
// Trade legs prefer the highest-markup port ~2/3 of the time; the rest keep
// the old random-dock roam so lanes stay varied.
const TRADE_MARKET_CHANCE = 0.65;
// Patrol lanes: how many seeded checkpoints a patrol walks around Rook.
const PATROL_LANE_POINTS = 6;
// Idle hunters lurch around their spawn anchor within this radius.
const HUNT_LOITER_RANGE = 160;
// How close a mug-capable hunter must be to the player before it can roll an
// emergent standoff.
const MUG_EMERGE_RANGE = 260;
// A surrendered pilot that chose to run flees toward open space; the despawn
// bubble culls them as the pilot's hyperdrive hop away to another port.
const FLEE_RUN_DISTANCE = 1200;
// A fleeing ship runs from the nearest hostile within this range (else the
// player — the usual source of the rout).
const THREAT_SEEK_RANGE = 600;
// Emergent mug odds — a hunter that gets the player in standoff range rolls
// this against mugging before committing to gunfire. Matches the spawn-time
// intercept odds (MUG_CHANCE in game.js).
export const MUG_CHANCE = 0.7;
// Portion of civilian station traffic that runs dark with a restricted hold.
export const SMUGGLE_CHANCE = 0.18;

// What a trader actually hauls between ports (matches the surrender-eject
// pool, so the hold reads as real trade goods). Miners carry ore.
const TRADER_CARGO_POOL = ['water', 'food', 'medicine', 'electronics', 'machinery', 'luxuries'];
// Roll a deterministic hold for a civilian freighter. Uses the per-ship route
// stream (never the spawn/combat streams), so headless probes stay exact and
// the hold ejects on death and softens the destination market on delivery.
export const rollNpcCargo = (ship, session) => {
    const rng = routeRng(ship, session);
    const cargo = {};
    if (ship.role === 'miner') {
        cargo.ore = Math.round(randomBetween(rng, 6, 24));
        if (rng() < 0.35)
            cargo[pick(rng, ['machinery', 'scrap'])] = Math.round(randomBetween(rng, 2, 8));
        return cargo;
    }
    const count = 1 + Math.floor(rng() * 2);
    for (let index = 0; index < count; index += 1) {
        const commodity = pick(rng, TRADER_CARGO_POOL);
        cargo[commodity] = Math.round((cargo[commodity] ?? 0) + randomBetween(rng, 4, 18));
    }
    if (ship.cargoHolds && ship.missingPods) {
        // Divide indivisible units between the same numbered pods as a spill.
        for (const [commodity, full] of Object.entries(cargo)) {
            let loaded = 0;
            for (let pod = 0; pod < ship.cargoHolds; pod++) {
                if (!(ship.missingPods & (1 << pod))) loaded += Math.floor(full / ship.cargoHolds) + Number(pod < full % ship.cargoHolds);
            }
            if (loaded) cargo[commodity] = loaded;
            else delete cargo[commodity];
        }
    }
    return cargo;
};
const dist2 = (a, b) => {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return dx * dx + dy * dy + dz * dz;
};
const staleAt = (ship) => !ship.destination || dist2(ship.position, ship.destination) < ARRIVE * ARRIVE;
// The per-ship route stream, keyed exactly like the old travel-AI re-roll so
// each bucket is deterministic and the stream never touches aiRng/proxRng.
const routeRng = (ship, session) => seededRandom(`${session.save.world.seed}:route:${ship.id}:${Math.floor(ship.lifetime / 20)}`);
const dockPoint = (session, dock, rng) => stationApproach(dock) ?? [
    LOCATIONS[dock].position[0] + randomBetween(rng, -30, 30),
    LOCATIONS[dock].position[1] + randomBetween(rng, -20, 20),
    LOCATIONS[dock].position[2] + randomBetween(rng, -30, 30),
];
const activeDocks = (session) => dockLocationIdsForSystem(session.save.player.systemId);
const activeMarkets = (session) => marketLocationIdsForSystem(session.save.player.systemId);
const randomDock = (rng, session) => pick(rng, activeDocks(session));
// The port whose live market prices run highest on average — the trader's
// "good sell market". Undefined when the economy has no data yet.
const bestSellDock = (session, originId) => {
    const market = session.save.world.market;
    if (!market)
        return undefined;
    let bestId;
    let bestScore = -Infinity;
    for (const id of activeMarkets(session)) {
        if (id === originId)
            continue;
        const prices = market[id];
        if (!prices)
            continue;
        let score = 0;
        let count = 0;
        for (const commodityId of Object.keys(COMMODITIES)) {
            const item = prices[commodityId];
            const base = COMMODITIES[commodityId]?.basePrice;
            if (item && base > 0) {
                score += item.lastPrice / base;
                count += 1;
            }
        }
        if (count > 0 && score / count > bestScore) {
            bestScore = score / count;
            bestId = id;
        }
    }
    return bestId;
};

// ---------------------------------------------------------------------------
// Task creation
// ---------------------------------------------------------------------------
export function createTask(ship, session) {
    if (ship.role === 'patrol')
        return createPatrolTask(ship, session);
    if (ship.role === 'miner')
        return session.getWorldZone(ship.position) === 'graveyard' ? createSalvageTask(ship, session) : createMineTask(ship, session);
    if (ship.role === 'trader')
        return createTradeTask(ship, session);
    // Pirates, escorts, bounty targets, and anything else: hunt.
    return { kind: 'hunt', anchor: [...ship.position], destination: undefined };
}
// Each creator seeds ship.destination with the first waypoint so a fresh
// spawn flies immediately (travelAI reads ship.destination; the task object's
// own fields are just the state machine).
const createTradeTask = (ship, session) => {
    const task = { kind: 'trade', phase: 'leg', origin: undefined, port: undefined, dwellUntil: 0, dwellPoint: undefined };
    ship.destination = nextTradeLeg(ship, session, task);
    return task;
};
const createPatrolTask = (ship, session, homeId = ship.patrolHome ?? activeDocks(session)[0] ?? 'rook') => {
    const rng = routeRng(ship, session);
    const home = ship.patrolAnchor ?? LOCATIONS[homeId]?.position ?? LOCATIONS.rook.position;
    const radiusMin = ship.patrolRadiusMin ?? 80;
    const radiusMax = ship.patrolRadiusMax ?? 135;
    const vertical = ship.patrolVertical ?? 40;
    const points = [];
    for (let index = 0; index < PATROL_LANE_POINTS; index += 1) {
        const angle = (index / PATROL_LANE_POINTS) * Math.PI * 2 + rng() * 0.6;
        const radius = radiusMin + rng() * Math.max(0, radiusMax - radiusMin);
        points.push([
            home[0] + Math.cos(angle) * radius,
            home[1] + randomBetween(rng, -vertical, vertical),
            home[2] + Math.sin(angle) * radius,
        ]);
    }
    const start = Math.floor(rng() * PATROL_LANE_POINTS);
    ship.destination = points[start];
    return { kind: 'patrol', home: homeId, points, pointIndex: start, dwellUntil: 0, dwellPoint: undefined };
};
// Rebuild a patrol's lane around a different home station (station traffic
// spawns a patrol at its own port instead of the bastion, so the beat is
// where the smugglers actually are).
export const rebasePatrolTask = (ship, session, homeId) => {
    ship.patrolHome = homeId;
    ship.task = createPatrolTask(ship, session, homeId);
    return ship.task;
};
const createMineTask = (ship, session) => {
    const task = { kind: 'mine', phase: 'transit', workUntil: 0, workPoint: undefined };
    ship.destination = nextMinePoint(ship, session);
    return task;
};
const createSalvageTask = (ship, session) => {
    const task = { kind: 'salvage', phase: 'transit', workUntil: 0, workPoint: undefined };
    ship.destination = nextSalvagePoint(ship, session);
    return task;
};
// A smuggler runs dark between non-patrol ports. The spawner builds this when
// station traffic rolls a dark hold (see updateStationTraffic).
export const createSmuggleTask = (ship, session, port) => {
    const task = { kind: 'smuggle', port, phase: 'leg', dwellUntil: 0, dwellPoint: undefined };
    ship.destination = dockPoint(session, port, routeRng(ship, session));
    return task;
};

// ---------------------------------------------------------------------------
// Dispatch ladder
// ---------------------------------------------------------------------------
// The per-ship AI entry point, called from updateShips. Civilian flight comes
// before combat; working tasks otherwise yield to searches and engagements.
export function updateShipAI(session, ship, dt) {
    releaseUnavailablePilot(session, ship);
    if (updateStationDock(session, ship, dt)) return;
    // A captured hull and a powered-down surrender are inert: no task, no
    // interaction — the travel AI bleeds off their momentum.
    if (ship.captured || ship.poweredDown) {
        session.updateTravelAI(ship, dt);
        return;
    }
    // A neutral distress crew holds its position while the player repairs,
    // transfers fuel or recovers cargo. Sending an already-parked ship back
    // through the travel planner made it chase its own zero-length vector.
    if (ship.distressActor && !ship.hostile && ship.standingDown
        && (!ship.destination || dist2(ship.position, ship.destination) < 900)) {
        session.holdDistressStation(ship, dt);
        return;
    }

    // Sensors advance before target resolution. A hunter may want the player,
    // but it cannot receive the player's live position until it has built a
    // firing-quality track; otherwise it follows its fixed intelligence point.
    session.updateSensorAwareness?.(ship, dt);

    // A working freighter must choose escape before self-defence resolves a
    // target and sends it into fighter attack passes. Authored encounters and
    // surrender/arrest decisions retain their own movement rules.
    if (isAmbientCivilian(session, ship)) {
        interruptFieldTactic(session, ship);
        const threat = huntedBy(session, ship) ?? null;
        // Hostility records the attack/reputation consequence; it must not
        // make a rescued freighter turn back and hunt the player afterwards.
        ship.targetId = undefined;
        if (!updateCivilianEscape(session, ship, dt, threat)) {
            tickTask(ship, session, threat);
            if (!updateStationDock(session, ship, dt)) session.updateTravelAI(ship, dt);
        }
        return;
    }

    if (flyFieldTactic(session, ship, dt)) return;
    if (continueShieldRecovery(session, ship, dt)) return;
    if (continueTerrainManeuver(session, ship, dt)) return;

    // Search/inspection runs before live target resolution. That prevents the
    // unconditional player target from leaking the current position into a
    // ship that should only know the last observed point.
    const searching = session.updateSearchAI(ship, dt);
    if (searching) {
        tryFieldAmbush(session, ship, session.save.world.time);
        if (flyFieldTactic(session, ship, dt)) return;
        session.updateTravelAI(ship, dt);
        return;
    }

    const target = session.resolveShipTarget(ship);
    const deferring = session.deferentialPilot(ship);
    // Hunt-task pursuit: when a hunter acquires a fresh non-hostile ship
    // victim (a trader or miner — never another fighter) it hails and closes
    // before the guns come up; the victim bolts, so the beat reads as a chase.
    const freshVictim = !session.arena?.observer && ship.npcTargetReason === 'mark'
        && ship.targetId && ship.targetId !== 'player' && ship.targetId !== ship.prevTargetId
        ? session.ships.find((entry) => entry.id === ship.targetId) : undefined;
    if (target && !deferring && freshVictim && !freshVictim.hostile && ship.task?.kind === 'hunt') {
        ship.pursuitHoldFire = true;
        ship.pursuitUntil = session.save.world.time + 6 + ship.aiRng() * 5;
        session.hailHuntChase?.(ship);
    }
    ship.prevTargetId = ship.targetId;
    // A patrol that engages (or is provoked) drops any open search — the fight
    // takes over, and the sweep bookkeeping restarts clean.
    if (target && !deferring && ship.role === 'patrol') {
        session.clearSearch(ship);
        session.updateAttackAI(ship, target.position, target.velocity, dt);
        return;
    }
    if (target && !deferring) {
        // Interaction layer: a hunt-task pirate that closes on the player
        // mid-lane rolls a standoff before opening fire — muggings emerge from
        // the hunt task meeting a mark, instead of only being scripted at
        // spawn. Gated on session.emergentMugs (the live game) so headless
        // combat probes — which spawn pirates directly — always see straight
        // fights.
        if (tryEmergentMug(session, ship))
            return;
        // The pursuit hold-fire window is only for ship victims: a hunter with
        // the player (or a new mark) stops delaying its shots.
        if (ship.targetId === 'player')
            ship.pursuitHoldFire = false;
        else if (ship.pursuitHoldFire && session.save.world.time >= (ship.pursuitUntil ?? 0))
            ship.pursuitHoldFire = false;
        session.updateAttackAI(ship, target.position, target.velocity, dt);
        return;
    }
    if (deferring)
        ship.targetId = undefined;
    if (ship.pursuitHoldFire && !target)
        ship.pursuitHoldFire = false;
    // Interaction layer: a patrol with a live arrest chases the smuggler;
    // otherwise the task layer yields the travel waypoint.
    if (ship.role === 'patrol' && ship.faction === 'concord' && session.updatePatrolArrest?.(ship)) {
        session.updateTravelAI(ship, dt);
        return;
    }
    if(ship.explorationGroup||ship.distressActor){session.updateTravelAI(ship,dt);return;}
    // Task layer: what the ship wants right now, yielding the travel waypoint.
    tickTask(ship, session);
    if (!updateStationDock(session, ship, dt)) session.updateTravelAI(ship, dt);
}

// ---------------------------------------------------------------------------
// Interaction layer
// ---------------------------------------------------------------------------
// An emergent mug: a mug-capable hunter (pirate/escort) that has the player
// resolved and closes to standoff range rolls a standoff before committing to
// gunfire. Uses the existing openMug machinery, so an empty/broke target makes
// them break off, compliance ends it, and a shot resolves it — no new states.
const tryEmergentMug = (session, ship) => {
    if (!session.emergentMugs || session.arena || ship.mug || ship.search || (!ship.mugCapable && !ship.pendingMugLeaderId))
        return false;
    if (ship.targetId !== 'player')
        return false;
    if (dist2(ship.position, session.save.player.position) > MUG_EMERGE_RANGE * MUG_EMERGE_RANGE)
        return false;
    // No mugging what you cannot see — a dark pilot gets searched, not shaken
    // down.
    if (!session.shipTracksPlayer?.(ship))
        return false;
    if (ship.pendingMug) {
        session.activatePendingMug?.(ship);
        return true;
    }
    // Escorts waiting on a lead's hail keep manoeuvring but hold their fire.
    if (ship.pendingMugLeaderId && ship.pendingMugLeaderId !== ship.id) {
        const leader = session.ships.find((entry) => entry.id === ship.pendingMugLeaderId && entry.hull > 0 && entry.pendingMug);
        if (!leader) {
            ship.pendingMugLeaderId = undefined;
            ship.holdFire = false;
            ship.demandUntil = 0;
        }
        return false;
    }
    // This is an opening decision for this encounter. Once the pirate has
    // chosen violence, a missed shot or another pass does not reopen talks.
    ship.mugCapable = false;
    if (ship.lastCombatShotAt !== undefined || ship.combatThreatId === 'player' || ship.aiRng() >= MUG_CHANCE)
        return false;
    session.openMug(ship, []);
    return true;
};

// ---------------------------------------------------------------------------
// Task state machines
// ---------------------------------------------------------------------------
export function tickTask(ship, session, knownThreat) {
    const task = ship.task;
    if (!task)
        return;
    // Flight triggers: a beaten pilot that chose to run, a civilian being
    // actively hunted by a hostile (trader/miner bolt for open space instead
    // of holding course while shot at — the pirate's pursuit is a chase), or
    // a smuggler being chased by an arresting patrol.
    const hunted = knownThreat === undefined
        ? huntedBy(session, ship) || (ship.arrestedBy ? session.ships.find((entry) => entry.id === ship.arrestedBy && entry.hull > 0) : undefined)
        : knownThreat;
    if ((ship.fleeing || hunted) && task.kind !== 'flee') {
        ship.task = { kind: 'flee', prior: task, priorDestination: ship.destination,
            awayFrom: [...ship.position], destination: [...ship.position], clearAt: 0,
            civilian: knownThreat !== undefined };
        if (hunted) {
            ship.task.clearAt = session.save.world.time + 4;
            ship.task.threatId = hunted === session.save.player ? 'player' : hunted.id;
        }
        fleeTick(ship, session, ship.task, hunted);
        return;
    }
    if (task.kind === 'flee') {
        if (hunted) {
            task.clearAt = session.save.world.time + 4;
            task.threatId = hunted === session.save.player ? 'player' : hunted.id;
        }
        if (ship.fleeing || hunted || task.civilian && session.save.world.time < task.clearAt) {
            fleeTick(ship, session, task, hunted);
        }
        else {
            ship.task = task.prior ?? { kind: 'trade', phase: 'leg', origin: undefined, port: undefined, dwellUntil: 0, dwellPoint: undefined };
            ship.destination = task.priorDestination;
        }
        return;
    }
    switch (task.kind) {
        case 'hunt':
            huntTick(ship, session, task);
            break;
        case 'patrol':
            patrolTick(ship, session, task);
            break;
        case 'mine':
            mineTick(ship, session, task);
            break;
        case 'salvage':
            salvageTick(ship, session, task);
            break;
        case 'smuggle':
            legTick(ship, session, task, nextSmuggleLeg);
            break;
        default:
            legTick(ship, session, task, nextTradeLeg);
            break;
    }
}
// Port-to-port run (trade and smuggle share the same cadence: fly a leg, dwell
// at the dock long enough to read as loading, roll the next leg).
const legTick = (ship, session, task, nextLeg) => {
    const time = session.save.world.time;
    if (task.phase === 'dwell') {
        if (time < (task.dwellUntil ?? 0)) {
            if (!task.dwellPoint)
                task.dwellPoint = [...ship.position];
            ship.destination = task.dwellPoint;
            return;
        }
        task.phase = 'leg';
        task.dwellPoint = undefined;
        // Loaded for the outbound leg: a trader picks up a fresh hold at the
        // port (smugglers ship what the manifest cannot show — no market hit).
        if (task.kind === 'trade') {
            ship.cargo = rollNpcCargo(ship, session);
            if (ship.capitalSpawnKey) session.checkpointCorvette(ship);
        }
        ship.destination = nextLeg(ship, session, task);
        return;
    }
    const approach = stationApproach(task.port);
    if (approach && !ship.stationDockCompleted) {
        ship.destination = approach;
        if (ship.stationQueue === task.port || Math.hypot(approach[0]-ship.position[0],approach[1]-ship.position[1],approach[2]-ship.position[2]) < 65) {
            // A bulk hauler exchanges cargo at the outer approach. Fighter berths are too small.
            if(ship.cargoHolds)ship.stationDockCompleted=task.port;
            else reserveStationDock(session, ship, task.port);
        }
        if(!ship.stationDockCompleted)return;
    }
    if (ship.stationDockCompleted || staleAt(ship)) {
        delete ship.stationDockCompleted;
        task.phase = 'dwell';
        task.dwellUntil = approach ? time : time + 4 + routeRng(ship, session)() * 6;
        task.dwellPoint = [...ship.position];
        ship.destination = task.dwellPoint;
        // Delivered the inbound hold: the stock lands on the exchange and
        // softens the port's price (see economy.deliverCargo).
        if (task.kind === 'trade' && ship.cargo && Object.keys(ship.cargo).some((id) => ship.cargo[id] > 0)) {
            deliverCargo(session.save.world.market, task.port, ship.cargo, session.save.world.seed, session.save.world.economyClock);
            ship.cargo = {};
            if (ship.capitalSpawnKey) session.checkpointCorvette(ship);
        }
        return;
    }
};
const nextTradeLeg = (ship, session, task) => {
    const rng = routeRng(ship, session);
    let dock;
    if (rng() < TRADE_MARKET_CHANCE) {
        // Prefer the best sell market over the ship's home port (station
        // traffic tags its port; roaming traders read the player's dock).
        const origin = task.origin ?? session.save.player.dockedAt ?? session.save.player.lastDockedAt;
        dock = bestSellDock(session, origin);
    }
    if (!dock)
        dock = randomDock(rng, session);
    task.port = dock;
    return dockPoint(session, dock, rng);
};
const nextSmuggleLeg = (ship, session, task) => {
    const rng = routeRng(ship, session);
    // Smugglers steer clear of the Concord bastion.
    const ports = activeDocks(session).filter((id) => id !== 'rook' && id !== task.port);
    const dock = pick(rng, ports);
    task.port = dock;
    return dockPoint(session, dock, rng);
};
// A patrol walks its seeded lane around Rook, pausing briefly at each
// checkpoint so the sweep reads as a station beat, not a continuous orbit.
const patrolTick = (ship, session, task) => {
    const time = session.save.world.time;
    if (task.dwellUntil && time < task.dwellUntil) {
        if (!task.dwellPoint)
            task.dwellPoint = [...ship.position];
        ship.destination = task.dwellPoint;
        return;
    }
    if (staleAt(ship)) {
        task.pointIndex = (task.pointIndex + 1) % task.points.length;
        ship.destination = task.points[task.pointIndex];
        task.dwellUntil = time + 1 + routeRng(ship, session)() * 2;
        task.dwellPoint = undefined;
    }
};
// A miner works the Shardbelt in pockets: transit to a site, work it (dwell),
// then the next site — the field's traffic reads as labour, not wandering.
const mineTick = (ship, session, task) => {
    const time = session.save.world.time;
    if (task.phase === 'work') {
        if (time < (task.workUntil ?? 0)) {
            if (!task.workPoint)
                task.workPoint = [...ship.position];
            ship.destination = task.workPoint;
            return;
        }
        task.phase = 'transit';
        ship.destination = nextMinePoint(ship, session);
        return;
    }
    if (staleAt(ship)) {
        task.phase = 'work';
        task.workUntil = time + 6 + routeRng(ship, session)() * 8;
        task.workPoint = [...ship.position];
        ship.destination = task.workPoint;
    }
};
const nextMinePoint = (ship, session) => {
    const rng = routeRng(ship, session);
    const zoneId = activityLocationIdsForSystem(session.save.player.systemId)[0] ?? 'shardbelt';
    const belt = LOCATIONS[zoneId].position;
    return [
        belt[0] + randomBetween(rng, -110, 110),
        belt[1] + randomBetween(rng, -55, 55),
        belt[2] + randomBetween(rng, -110, 110),
    ];
};
// Graveyard recovery crews strip a wreck node, dwell on the work, then move to
// the next intact hull.
const salvageTick = (ship, session, task) => {
    const time = session.save.world.time;
    if (task.phase === 'work') {
        if (time < (task.workUntil ?? 0)) {
            if (!task.workPoint)
                task.workPoint = [...ship.position];
            ship.destination = task.workPoint;
            return;
        }
        task.phase = 'transit';
        ship.destination = nextSalvagePoint(ship, session);
        return;
    }
    if (staleAt(ship)) {
        task.phase = 'work';
        task.workUntil = time + 6 + routeRng(ship, session)() * 8;
        task.workPoint = [...ship.position];
        ship.destination = task.workPoint;
    }
};
const nextSalvagePoint = (ship, session) => {
    const rng = routeRng(ship, session);
    const nodes = (session.wreckNodes ?? []).filter((node) => node.remaining > 0);
    if (nodes.length)
        return [...nodes[Math.floor(rng() * nodes.length)].position];
    // No intact wrecks left: drift across the field so the crew still reads
    // as working the graveyard.
    const zoneId = activityLocationIdsForSystem(session.save.player.systemId)[0] ?? 'mourning-line';
    const grave = LOCATIONS[zoneId].position;
    return [
        grave[0] + randomBetween(rng, -140, 140),
        grave[1] + randomBetween(rng, -70, 70),
        grave[2] + randomBetween(rng, -140, 140),
    ];
};
// A hunter with no mark: lurch around the spawn anchor, waiting for prey.
// A broken-off or deferential hunter instead departs — the old roam to a
// random port, so a stood-down pirate actually leaves the field. Standing
// down is only a truce: if the player keeps firing and the pirate flips
// hostile again, it re-engages instead of flying off.
const huntTick = (ship, session, task) => {
    if (ship.standingDown && !ship.hostile) {
        if (staleAt(ship)) {
            const rng = routeRng(ship, session);
            ship.destination = dockPoint(session, randomDock(rng, session), rng);
        }
        return;
    }
    if (staleAt(ship)) {
        const rng = routeRng(ship, session);
        const angle = rng() * Math.PI * 2;
        const radial = 60 + rng() * HUNT_LOITER_RANGE;
        const anchor = task.anchor;
        ship.destination = [
            anchor[0] + Math.cos(angle) * radial,
            anchor[1] + (rng() - 0.5) * 80,
            anchor[2] + Math.sin(angle) * radial,
        ];
    }
};
// Flee the fight: run from the arresting patrol, the nearest hostile (else
// the player), always outward — the despawn bubble culls the ship as the
// pilot's hyperdrive hop to another port.
const fleeTick = (ship, session, task, activeThreat) => {
    const hunter = ship.arrestedBy ? session.ships.find((entry) => entry.id === ship.arrestedBy && entry.hull > 0) : undefined;
    const threat = activeThreat || hunter || (!task.civilian && nearestThreat(session, ship));
    const awayFrom = threat ? threat.position : task.civilian ? task.awayFrom : session.save.player.position;
    for (let i = 0; i < 3; i++) task.awayFrom[i] = awayFrom[i];
    const position = ship.position;
    let dx = position[0] - awayFrom[0];
    const dy = position[1] - awayFrom[1];
    const dz = position[2] - awayFrom[2];
    if (dx * dx + dy * dy + dz * dz < 0.01) dx = 1;
    const length = Math.hypot(dx, dy, dz) || 1;
    const destination = task.destination ??= [0, 0, 0];
    destination[0] = position[0] + (dx / length) * FLEE_RUN_DISTANCE;
    destination[1] = position[1] + (dy / length) * FLEE_RUN_DISTANCE;
    destination[2] = position[2] + (dz / length) * FLEE_RUN_DISTANCE;
    ship.destination = destination;
};
const nearestThreat = (session, ship) => {
    let best;
    let bestD2 = THREAT_SEEK_RANGE * THREAT_SEEK_RANGE;
    for (const other of session.ships) {
        if (other === ship || other.hull <= 0 || !other.hostile)
            continue;
        const d2 = dist2(ship.position, other.position);
        if (d2 < bestD2) {
            bestD2 = d2;
            best = other;
        }
    }
    return best;
};
// How close an actively hunting hostile must be before its civilian mark
// bolts (trader/miner flight — see tickTask).
const CIVILIAN_FLEE_RANGE = 420;
const isAmbientCivilian = (session, ship) => {
    return !(session.arena || ship.race || ship.tutorialCompanion || ship.tutorialEncounter
        || ship.storyPersonId || ship.explorationGroup || ship.distressActor || ship.authorizedTarget
        || ship.surrendered || ship.fleeing || ship.standingDown || ship.arrestedBy
        || (ship.role !== 'trader' && ship.role !== 'miner') || !ship.task);
};
const updateCivilianEscape = (session, ship, dt, threat) => {
    if (!threat && !ship.task.civilian) return false;
    tickTask(ship, session, threat ?? null);
    if (ship.task.kind !== 'flee') return false;
    ship.targetId = undefined;
    ship.pursuitHoldFire = false;
    if (ship.combatPlan?.recovery) ship.combatPlan.recovery.active = false;
    session.updateTravelAI(ship, dt);
    return true;
};
// A trader or miner that is another ship's current target (a hostile hunting
// it, not the player) runs instead of holding course.
const huntedBy = (session, ship) => {
    if (ship.role !== 'trader' && ship.role !== 'miner')
        return undefined;
    const recentThreat = session.save.world.time < (ship.combatThreatUntil ?? -Infinity) ? ship.combatThreatId : undefined;
    const player = session.save.player;
    // Once hit, keep escaping while that player remains nearby. Missed shots
    // or the short damage-memory timeout must not turn the freighter around.
    const escapingPlayer = ship.task?.civilian && ship.task.threatId === 'player';
    if ((recentThreat === 'player' || escapingPlayer) && player.hull > 0 && !player.dockedAt
        && dist2(player.position, ship.position) < THREAT_SEEK_RANGE * THREAT_SEEK_RANGE)
        return player;
    let nearest;
    let rangeSq = CIVILIAN_FLEE_RANGE * CIVILIAN_FLEE_RANGE;
    for (const other of session.ships) {
        if (other === ship || other.hull <= 0 || other.surrendered || other.captured || other.poweredDown || other.standingDown
            || (other.id !== recentThreat && (!(other.hostile || other.faction === 'pirates') || other.targetId !== ship.id)))
            continue;
        const distance = dist2(other.position, ship.position);
        if (distance < rangeSq) { nearest = other; rangeSq = distance; }
    }
    return nearest;
};
