// Recurring distress encounters: scheduling, actors, assistance and the
// exactly-once settlement of each event.
//
// The encounter is deliberately cheap when nobody is near it: a signal is a
// single save record, actors only spawn once the player resolves the contact,
// and all checks run at 2 Hz. One unresolved encounter exists at a time.
import * as THREE from '../../vendor/three.module.min.js';
import {combatWreckNode} from './careerLoot.js';
import {LOCATIONS} from './data.js';
import {cargoFree} from './economy.js';
import {isTutorialGuided} from './tutorialCampaign.js';
import {shipVsObstacle} from './shipCollision.js';
import {formatCredits, seededRandom} from './random.js';
import {
    DISTRESS_ANSWER_RANGE, DISTRESS_BEACON_FAIL_RANGE, DISTRESS_BEACON_RANGE, DISTRESS_DISCOVER_RANGE,
    DISTRESS_ESCORT_BURST, DISTRESS_ESCORT_CLEAN_BONUS, DISTRESS_ESCORT_HALF_WIDTH, DISTRESS_ESCORT_LAG,
    DISTRESS_ESCORT_RANGE, DISTRESS_ESCORT_SPINUP, DISTRESS_FIRST_MAX, DISTRESS_FIRST_MIN,
    DISTRESS_GAP_MAX, DISTRESS_GAP_MIN, DISTRESS_REPAIR_RANGE, DISTRESS_RETALIATION_TIME,
    DISTRESS_REWARD_PER_SURVIVOR, DISTRESS_SIGNAL_MAX_DISTANCE, DISTRESS_SIGNAL_MIN_DISTANCE,
    DISTRESS_SIGNAL_TIMEOUT,
    DISTRESS_TRANSFER_RANGE, DISTRESS_TRANSFER_SPEED, DISTRESS_VARIANTS, createDistressRecord,
    distressObjective, distressOpenLine, distressRoster, distressSetup, distressText,
    distressVariant, normalizeDistress,
} from './distressData.js';

const near = (a, b, radius) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= radius;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// Distance from a point to a polyline, clamped to the first and last segment.
// The escort corridor is a swept tube around these segments rather than a row
// of checkpoint spheres, so cutting a corner is not free.
const routeScratch = {index: 0, distance: Infinity, t: 0};
function routeProgress(route, point) {
    // One shared result: this runs twice per 60 Hz step while an escort is
    // active, and a fresh {index,distance,t} object would be pure GC churn.
    const best = routeScratch;
    best.index = 0;
    best.distance = Infinity;
    best.t = 0;
    for (let index = 0; index < route.length - 1; index++) {
        const a = route[index], b = route[index + 1];
        const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
        const lengthSq = abx * abx + aby * aby + abz * abz || 1;
        let t = ((point[0] - a[0]) * abx + (point[1] - a[1]) * aby + (point[2] - a[2]) * abz) / lengthSq;
        t = Math.max(0, Math.min(1, t));
        const dx = point[0] - (a[0] + abx * t), dy = point[1] - (a[1] + aby * t), dz = point[2] - (a[2] + abz * t);
        const off = Math.hypot(dx, dy, dz);
        if (off < best.distance) {
            best.index = index;
            best.distance = off;
            best.t = t;
        }
    }
    return best;
}
const ESCORT_TRAIL_POINTS = 900;
const offset = (point, delta, yaw = 0) => {
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    return [point[0] + delta[0] * cos + delta[2] * sin, point[1] + delta[1], point[2] - delta[0] * sin + delta[2] * cos];
};
const activeState = session => session.save?.world?.distress?.active;
const nowOf = session => Number(session.save?.world?.time) || 0;
const eventWrecks = (session, active) => Object.values(session.save.world.combatWrecks ?? {}).filter(entry => entry.distressEventId === active.id);
const eventShip = (session, active, key) => session.ships.find(ship => ship.distressEventId === active.id && ship.distressActor === key);
const liveEventShips = (session, active, filter = () => true) => session.ships.filter(ship => ship.distressEventId === active.id && ship.hull > 0 && filter(ship));

function archive(session, active, outcome, reward) {
    const data = session.save.world.distress;
    data.history.unshift({id: active.id, variant: active.variant, setup: active.setup, outcome, at: nowOf(session), reward: Math.max(0, Math.round(reward))});
    data.history = data.history.slice(0, 8);
}

function pay(session, active, reward) {
    if (active.progress?.betrayed) return 0;
    if (active.settlement.state === 'paid') return 0;
    const amount = Math.max(0, Math.round(Number(reward) || 0));
    if (amount > 0) {
        session.save.player.credits = Math.max(0, Number(session.save.player.credits) || 0) + amount;
        session.setOwnMonitorStatus?.(`+${formatCredits(amount)}`, 3400);
        session.audio?.play?.('success');
    }
    active.settlement.state = amount > 0 ? 'paid' : active.settlement.state;
    active.settlement.reward = amount;
    active.settlement.paidAt = nowOf(session);
    return amount;
}

function leaveActors(session, active) {
    const now = nowOf(session);
    for (const ship of session.ships) {
        if (ship.distressEventId !== active.id) continue;
        ship.distressLeaving = true;
        ship.distressLeaveAt = now + 30;
        ship.distressUntil = 0;
        ship.hostile = false;
        ship.authorizedTarget = false;
        ship.targetId = undefined;
        ship.distressTargetId = undefined;
        ship.distressAggroTargetId = undefined;
        ship.distressAggroUntil = 0;
        ship.standingDown = true;
        ship.poweredDown = false;
        // Survivors leave under their own power instead of blinking out while
        // the player watches; the sweep retires them once they are clear.
        const away = [ship.position[0] - active.position[0], 160, ship.position[2] - active.position[2]];
        const length = Math.hypot(away[0], away[2]) || 1;
        ship.destination = [ship.position[0] + away[0] / length * 5000, ship.position[1] + 160, ship.position[2] + away[2] / length * 5000];
        ship.task = undefined;
    }
}

// Encounter props leave with the event. A wreck's derelict stays as scenery,
// but locked claim wrecks and abandoned jettisoned containers must not linger
// as an unmarked, endlessly lootable freebie.
function clearDistressProps(session, active) {
    for (const [id, wreck] of Object.entries(session.save.world.combatWrecks ?? {})) {
        if (wreck.distressEventId !== active.id) continue;
        if (active.variant === 'wreck' && wreck.derelict) continue;
        // A transport lost to the solar front stays as a salvage scene: the
        // failure has to leave something in the world, not just a log line.
        if (wreck.distressPersistent) continue;
        delete session.save.world.combatWrecks[id];
        const index = session.wreckNodes?.findIndex(node => node.id === id) ?? -1;
        if (index >= 0) session.wreckNodes.splice(index, 1);
        session.renderer?.removeCombatLootNode?.(id);
        if (session.save.player?.currentTargetId === id) session.save.player.currentTargetId = undefined;
    }
}

function disposeEncounter(session, active, {outcome, reward = 0, message, farewell, tone = 'success'} = {}) {
    if (!active || !session.save.world.distress.active || session.save.world.distress.active.id !== active.id) return;
    // The event was the player's selected contact; a finished event must not
    // leave a dead id selected on the map, radar or target panel.
    if (session.save.player?.currentTargetId === active.id) session.save.player.currentTargetId = undefined;
    const amount = pay(session, active, reward);
    // A dispute pays its support fee when the side is chosen. Finish later
    // with reward 0 must still archive what the player actually received.
    const paid = Math.max(amount, active.settlement.state === 'paid' ? Number(active.settlement.reward) || 0 : 0);
    archive(session, active, outcome, paid);
    // The objective monitor was showing this encounter; clear it rather than
    // leaving a finished rescue on the cockpit glass.
    session.setMonitorStatus?.('', 0);
    leaveActors(session, active);
    clearDistressProps(session, active);
    session.save.world.distress.active = null;
    session.save.world.distress.nextAt = nowOf(session) + DISTRESS_GAP_MIN + seededRandom(`${active.seed}:gap:${active.id}`)() * (DISTRESS_GAP_MAX - DISTRESS_GAP_MIN);
    if (message) session.ui?.pushEvent?.(distressText(message), tone, 5600, distressText(distressVariant(active.variant)?.title ?? ['Notruf', 'Distress call']));
    if (farewell && session.playStoryLine) {
        const portrait = session.encounterPortraitForSpeaker?.(active.caller, undefined, active);
        session.playStoryLine(active.caller, distressText(farewell), 'friendly', 6500, undefined, portrait);
    }
    session.persistSave?.();
}

export const DistressMethods = {
    initializeDistress() {
        if (this.arena) return;
        const data = normalizeDistress(this.save.world);
        if (!data.active && data.nextAt <= 0) {
            const rng = seededRandom(`${this.save.world.seed}:distress:first:${Math.floor(nowOf(this))}`);
            data.nextAt = nowOf(this) + DISTRESS_FIRST_MIN + rng() * (DISTRESS_FIRST_MAX - DISTRESS_FIRST_MIN);
        }
        this.distressTickAt = 0;
    },

    distressEligible() {
        if (this.arena || this.activeRace || this.save.player?.raceReturn) return false;
        if (this.save.player?.dockedAt || this.save.player?.hull <= 0) return false;
        if (this.playerDocking || this.galaxyJump) return false;
        if (isTutorialGuided(this.save)) return false;
        return true;
    },

    distressBlocked() {
        if (!this.distressEligible() || this.autopilot) return true;
        if (this.ui?.adventure || this.ui?.isModalOpen) return true;
        if (this.activeMug?.()) return true;
        if (this.save.world.exploration?.finale === 'fighting' && this.ships.some(ship => ship.explorationGroup === 'salvagers' && ship.hull > 0)) return true;
        if (this.ships.filter(ship => ship.hull > 0).length > 16) return true;
        const player = this.save.player.position;
        if (this.ships.some(ship => ship.hull > 0 && ship.hostile && !ship.distressActor && near(ship.position, player, 2400))) return true;
        return false;
    },

    distressPreloadHulls(active) {
        const hulls = new Set(distressRoster(active.variant, active.setup).map(entry => entry.hullId).filter(Boolean));
        const setup = distressSetup(active.variant, active.setup);
        if (setup?.wreck?.derelict) hulls.add(setup.wreck.derelict);
        this.renderer?.preloadGlbShips?.([...hulls]);
    },

    // Pick a point 3,000–10,000 km along the current shipping vector. That is
    // beyond discovery range, so the contact stays a signal until the player
    // jumps; a local hyperdrive waypoint still reaches it. Candidate points
    // are collision-checked with the encounter hull envelope.
    distressSignalPosition(rng) {
        const player = this.save.player.position;
        const nav = LOCATIONS[this.save.player.navTargetId];
        let direction;
        if (nav?.systemId === this.save.player.systemId) {
            direction = [nav.position[0] - player[0], nav.position[1] - player[1], nav.position[2] - player[2]];
        }
        else {
            const rotation = this.save.player.rotation ?? [0, 0, 0, 1];
            const x = rotation[0], y = rotation[1], z = rotation[2], w = rotation[3];
            direction = [-2 * (x * z + w * y), 0, -(1 - 2 * (x * x + y * y))];
        }
        const length = Math.hypot(direction[0], direction[1], direction[2]) || 1;
        direction = direction.map(entry => entry / length);
        // Keep lateral offsets perpendicular to the shipping vector so the
        // final point is exactly the rolled distance from the player.
        const reference = Math.abs(direction[1]) > .9 ? [1, 0, 0] : [0, 1, 0];
        let side = [
            direction[1] * reference[2] - direction[2] * reference[1],
            direction[2] * reference[0] - direction[0] * reference[2],
            direction[0] * reference[1] - direction[1] * reference[0],
        ];
        const sideLength = Math.hypot(side[0], side[1], side[2]) || 1;
        side = side.map(entry => entry / sideLength);
        let up = [
            direction[1] * side[2] - direction[2] * side[1],
            direction[2] * side[0] - direction[0] * side[2],
            direction[0] * side[1] - direction[1] * side[0],
        ];
        const upLength = Math.hypot(up[0], up[1], up[2]) || 1;
        up = up.map(entry => entry / upLength);
        const distance = DISTRESS_SIGNAL_MIN_DISTANCE + rng() * (DISTRESS_SIGNAL_MAX_DISTANCE - DISTRESS_SIGNAL_MIN_DISTANCE);
        for (let attempt = 0; attempt < 14; attempt++) {
            // A widening cone around the shipping vector, always at the rolled distance.
            const spread = Math.min(.5, .12 + attempt * .045);
            const lateral = (rng() * 2 - 1) * spread;
            const vertical = (rng() * 2 - 1) * spread * .5;
            const vector = [
                direction[0] + side[0] * lateral + up[0] * vertical,
                direction[1] + side[1] * lateral + up[1] * vertical,
                direction[2] + side[2] * lateral + up[2] * vertical,
            ];
            const reach = Math.hypot(vector[0], vector[1], vector[2]) || 1;
            const point = [
                player[0] + vector[0] / reach * distance,
                player[1] + vector[1] / reach * distance,
                player[2] + vector[2] / reach * distance,
            ];
            if (this.distressPointClear(point)) return point;
        }
        return [
            player[0] + direction[0] * distance,
            player[1] + direction[1] * distance,
            player[2] + direction[2] * distance,
        ];
    },

    distressPointClear(point) {
        const obstacles = this.activeFieldObstacles?.() ?? [];
        if (!obstacles.length) return true;
        const position = this.distressPointScratch ??= new THREE.Vector3();
        const rotation = this.distressQuatScratch ??= new THREE.Quaternion();
        const contact = this.distressContactScratch ??= {};
        position.set(point[0], point[1], point[2]);
        rotation.identity();
        for (const obstacle of obstacles) {
            contact.hit = false;
            if (shipVsObstacle(position, rotation, 'mule', 2.4, obstacle, contact)) return false;
        }
        return true;
    },

    pickDistressVariant(rng) {
        const data = this.save.world.distress;
        // lastVariants is newest-first; avoid the last two calls, not the
        // oldest entries still retained in the three-slot ring.
        const avoid = new Set((data.lastVariants ?? []).slice(0, 2));
        let pool = DISTRESS_VARIANTS.filter(entry => !avoid.has(entry.id));
        if (!pool.length) pool = [...DISTRESS_VARIANTS];
        const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
        let roll = rng() * total;
        for (const entry of pool) {
            roll -= entry.weight;
            if (roll <= 0) return entry.id;
        }
        return pool[pool.length - 1].id;
    },

    beginDistressSignal() {
        const data = this.save.world.distress;
        const now = nowOf(this);
        const rng = seededRandom(`${this.save.world.seed}:distress:${data.counter + 1}:${Math.floor(now)}`);
        const variant = this.pickDistressVariant(rng);
        const setupIndex = Math.floor(rng() * distressVariant(variant).setups.length);
        const seed = Math.floor(rng() * 0x7fffffff) || 1;
        const position = this.distressSignalPosition(rng);
        const active = createDistressRecord({
            counter: data.counter + 1, variant, setup: setupIndex, seed, position,
            systemId: this.save.player.systemId, instanceId: this.activeInstanceId,
            now, caller: undefined, vessel: undefined,
        });
        data.counter += 1;
        data.active = active;
        data.nextAt = 0;
        data.lastVariants = [variant, ...(data.lastVariants ?? []).filter(entry => entry !== variant)].slice(0, 3);
        const setup = distressSetup(variant, setupIndex);
        this.distressPreloadHulls(active);
        this.ui?.pushEvent?.(distressText([`Notruf empfangen · ${active.caller}`, `Distress signal received · ${active.caller}`]), 'warning', 5600, distressText(distressVariant(variant).title));
        this.ui?.pushSensor?.(distressText(['Ein Notruf wurde aufgezeichnet. Koordinaten im Bordlogbuch.', 'A distress call was logged. Coordinates are in the ship journal.']), 'info', 5600);
        const portrait = this.encounterPortraitForSpeaker?.(active.caller, undefined, active);
        this.ui?.showStoryLine?.(active.caller, distressText(setup.signal), 'neutral', undefined, portrait?.faction, portrait?.portraitIndex);
        this.audio?.play?.('warning');
        this.persistSave?.();
    },

    updateDistress() {
        if (!this.distressEligible()) return;
        const now = nowOf(this);
        if (now < (this.distressTickAt ?? 0)) return;
        this.distressTickAt = now + 0.5;
        const data = this.save.world.distress ?? normalizeDistress(this.save.world);
        this.sweepDistressLeavers(now);
        const active = data.active;
        if (!active) {
            if (now < data.nextAt) return;
            if (this.distressBlocked()) {
                data.nextAt = now + 45;
                return;
            }
            this.beginDistressSignal();
            return;
        }
        if (active.systemId !== this.save.player.systemId
            || (active.instanceId && this.activeInstanceId && active.instanceId !== this.activeInstanceId)) {
            if (now - active.createdAt > 30) this.abandonDistress(active, 'withdrawn');
            return;
        }
        // An unanswered signal eventually fades, freeing the single active
        // slot. There is no reputation penalty for letting it go.
        if (active.phase === 'signal') {
            if (now - active.createdAt > DISTRESS_SIGNAL_TIMEOUT) {
                this.abandonDistress(active, 'declined');
                return;
            }
            // Flying into sensor range resolves the contact; the player still
            // chooses whether to answer, fight, help or leave.
            if (distance(active.position, this.save.player.position) <= DISTRESS_DISCOVER_RANGE)
                this.discoverDistress(active, now);
        }
        this.snapshotDistressActors(active);
        this.updateDistressActors(active, now);
        this.maybeBriefDistress(active, now);
        if (data.active?.id === active.id) this.updateDistressObjective(active, now);
        if (data.active?.id === active.id) this.updateDistressReminder(active, now);
        // Objectives live on the cockpit monitor for ten minutes at a time;
        // refresh them while the encounter is still running so a long repair
        // or salvage does not leave the pilot without a goal.
        if (data.active?.id === active.id && active.phase !== 'signal' && now >= (active.nextMonitorAt ?? 0)) {
            active.nextMonitorAt = now + 300;
            this.setDistressMonitor(active);
        }
    },

    sweepDistressLeavers(now) {
        const player = this.save.player.position;
        let changed = false;
        for (let index = this.ships.length - 1; index >= 0; index--) {
            const ship = this.ships[index];
            if (!ship.distressLeaving) continue;
            if (ship.hull <= 0) continue;
            if (now >= (ship.distressLeaveAt ?? 0) || !near(ship.position, player, 6500)) {
                this.ships.splice(index, 1);
                changed = true;
            }
        }
        if (changed) this.renderer?.syncShips?.(this.ships);
    },

    snapshotDistressActors(active) {
        if (!active) return;
        for (const ship of this.ships) {
            if (ship.distressEventId !== active.id || !ship.distressActor) continue;
            this.snapshotDistressActor(active, ship);
        }
    },

    snapshotDistressActor(active, ship) {
        const snapshot = {
            key: ship.distressActor,
            role: ship.distressRole ?? ship.role,
            hullId: ship.hullId ?? ship.variant,
            name: ship.name,
            faction: ship.faction,
            hull: Math.max(0, ship.hull),
            shield: Math.max(0, ship.shield),
            maxHull: ship.maxHull,
            position: [...ship.position],
            rotation: [...ship.rotation],
            velocity: [...ship.velocity],
            destroyed: ship.hull <= 0,
            surrendered: Boolean(ship.surrendered),
        };
        const index = active.actors.findIndex(actor => actor.key === snapshot.key);
        if (index < 0) active.actors.push(snapshot);
        else active.actors[index] = snapshot;
    },

    spawnDistressActors(active, now, {raidersOnly = false} = {}) {
        const yaw = seededRandom(`${active.seed}:roster:${active.id}`)() * Math.PI * 2;
        const roster = distressRoster(active.variant, active.setup);
        const setup = distressSetup(active.variant, active.setup);
        const spawned = [];
        for (const entry of roster) {
            if (raidersOnly && entry.role !== 'pirate') continue;
            if (!raidersOnly && active.variant === 'wreck' && entry.role === 'pirate') continue;
            // A trap's raiders stay dark until the deception is exposed; the
            // merchant's calm voice is the only contact the player gets.
            if (!raidersOnly && active.variant === 'trap' && !active.progress?.exposed && entry.role === 'pirate') continue;
            if (this.ships.some(ship => ship.distressEventId === active.id && ship.distressActor === entry.key && ship.hull >= 0)) continue;
            const legacyAlias = active.legacy === 'lantern' && entry.role === 'pirate' ? `raider-${entry.key.split('-').at(-1)}` : entry.key;
            const snapshot = active.actors.find(actor => actor.key === entry.key || actor.key === legacyAlias);
            if (snapshot?.destroyed) continue;
            const point = snapshot?.position ?? offset(active.position, entry.offset, yaw);
            const ship = this.spawnShip(entry.role, [...point], `distress-${active.id}`, entry.name, {tier: 'regular', temperament: 'steady'}, {hullId: entry.hullId, faction: entry.faction});
            ship.distressActor = entry.key;
            ship.distressEventId = active.id;
            ship.distressVariant = active.variant;
            ship.distressRole = entry.role;
            ship.distressNeutral = entry.neutral === true;
            ship.distressRepairEligible = entry.neutral === true;
            ship.distressTargetId = undefined;
            ship.dark = false;
            ship.mugCapable = false;
            ship.playerIdentified = true;
            ship.playerAwareness = 1;
            ship.playerSensorAwareness = 1;
            ship.cargo = {};
            ship.nextLineAt = Infinity;
            // Only the crew in trouble carries a distress beacon; raiders do
            // not masquerade as another call once the fight is running.
            ship.distressUntil = entry.neutral ? now + 900 : 0;
            ship.bountyValue = 0;
            // These crews are already in trouble when the call goes out. A
            // damaged starting hull is what makes parts, a repair drone or a
            // slow crew repair meaningful, instead of a full-health ship that
            // resolves the objective the moment it spawns.
            if (!snapshot && entry.neutral) {
                const hullFraction = active.variant === 'disabled' ? Math.max(.12, (setup?.repairTarget ?? .6) - .22)
                    : active.variant === 'debris' ? .55
                        : active.variant === 'fuel' ? .7
                            : active.variant === 'jettison' ? .82
                                : 1;
                if (hullFraction < 1) ship.hull = Math.max(1, Math.round(ship.maxHull * hullFraction));
            }
            if (snapshot && !snapshot.destroyed) {
                ship.hull = Math.min(ship.maxHull, Math.max(1, snapshot.hull));
                ship.shield = Math.min(ship.maxShield, Math.max(0, snapshot.shield ?? 0));
                if (snapshot.rotation?.length === 4) ship.rotation = [...snapshot.rotation];
                if (snapshot.velocity?.length === 3) ship.velocity = [...snapshot.velocity];
                if (snapshot.surrendered) {
                    ship.surrendered = true;
                    ship.hostile = false;
                    ship.authorizedTarget = false;
                    ship.poweredDown = true;
                }
            }
            const hostile = entry.role === 'pirate' && (active.variant !== 'trap' || active.progress?.exposed === true);
            ship.hostile = hostile;
            ship.authorizedTarget = hostile;
            if (entry.neutral) {
                ship.hostile = false;
                ship.authorizedTarget = false;
                ship.standingDown = true;
                ship.poweredDown = false;
                // An escorting transport is flown by the breadcrumb trail, not
                // by a fixed escape destination; the trail seeds on the next
                // simulation step.
                ship.destination = [...ship.position];
            }
            if (entry.disguise && !active.progress?.exposed) {
                ship.hostile = false;
                ship.authorizedTarget = false;
                ship.standingDown = true;
                ship.destination = [...ship.position];
            }
            if (active.variant === 'debris' && entry.neutral) {
                active.progress.escortHull = Math.max(0, Math.min(1, ship.hull / Math.max(1, ship.maxHull)));
                if (active.progress.method === 'escape') {
                    // A reload respawns the neutral crew; the escort flag has
                    // to override the parked hold or the transport never moves.
                    ship.standingDown = false;
                    ship.poweredDown = false;
                    ship.distressEscort = true;
                    ship.distressFollowDistance = DISTRESS_ESCORT_LAG;
                    ship.distressTrail = new Float32Array(ESCORT_TRAIL_POINTS * 3);
                    ship.distressTrailDist = new Float32Array(ESCORT_TRAIL_POINTS);
                    ship.distressTrailHead = 0;
                    ship.distressTrailCount = 0;
                    ship.distressTrailNextAt = 0;
                    ship.distressStraySince = 0;
                    ship.distressStrayHitAt = 0;
                }
            }
            if (active.variant === 'trap' && entry.role === 'pirate' && !active.progress?.exposed) {
                ship.poweredDown = true;
                ship.standingDown = true;
                ship.hostile = false;
                ship.authorizedTarget = false;
                ship.velocity.fill(0);
            }
            if (active.variant === 'convoy' && entry.role === 'pirate') {
                ship.hostile = true;
                ship.authorizedTarget = true;
                ship.poweredDown = false;
                ship.standingDown = false;
            }
            if (active.variant === 'dispute') {
                ship.hostile = false;
                ship.authorizedTarget = false;
                ship.standingDown = true;
                ship.destination = [...ship.position];
                // A taken side keeps fighting across a reload: the crew the
                // pilot backed stays calm, the other claimant is the enemy.
                if (active.progress?.sided) {
                    const rivalKey = setup.rival;
                    const strangerKey = roster.find(actor => actor.key !== rivalKey)?.key;
                    const enemyKey = active.progress.side === 'side-a' ? rivalKey : strangerKey;
                    if (entry.key === enemyKey && !snapshot?.surrendered) {
                        ship.hostile = true;
                        ship.authorizedTarget = true;
                        ship.standingDown = false;
                        ship.poweredDown = false;
                        ship.distressTargetId = 'player';
                    }
                }
            }
            spawned.push(ship);
        }
        return spawned;
    },

    // Convoy victims should already be trading fire when the player resolves
    // the contact, and they run for open space instead of waiting to die.
    distressPrefight(active) {
        if (active.variant !== 'convoy' || active.progress.prefight) return;
        active.progress.prefight = true;
        const rng = seededRandom(`${active.seed}:prefight`);
        const raiders = liveEventShips(this, active, ship => ship.distressRole === 'pirate');
        const victims = liveEventShips(this, active, ship => ship.distressRole !== 'pirate');
        for (const victim of victims) {
            victim.hull = Math.max(1, Math.round(victim.maxHull * (.62 + rng() * .2)));
            victim.shield = 0;
            victim.shieldDelay = 3;
            victim.lastAttackerHitAt = nowOf(this);
            const flee = [0, 0, 0];
            const away = raiders[0] ?? {position: active.position};
            for (let axis = 0; axis < 3; axis++) flee[axis] = victim.position[axis] - away.position[axis];
            const length = Math.hypot(...flee) || 1;
            victim.destination = [victim.position[0] + flee[0] / length * 3200, victim.position[1] + 180, victim.position[2] + flee[2] / length * 3200];
            victim.standingDown = false;
            victim.poweredDown = false;
            victim.task = undefined;
        }
        this.retargetDistress(active);
    },

    retargetDistress(active) {
        const live = liveEventShips(this, active);
        const now = nowOf(this);
        const victims = live.filter(ship => ship.distressRole !== 'pirate');
        const raiders = live.filter(ship => ship.distressRole === 'pirate');
        const raiderCount = raiders.length;
        let raiderIndex = 0;
        // Prospectors run from the nearest raider. The flee vector is a travel
        // destination, so it survives the same AI path as ordinary traffic.
        if (active.variant === 'convoy') {
            for (const ship of victims) {
                if (ship.distressFleeSet) continue;
                ship.distressFleeSet = true;
                const threat = raiders[0] ?? {position: active.position};
                const away = [ship.position[0] - threat.position[0], 0, ship.position[2] - threat.position[2]];
                const length = Math.hypot(away[0], away[2]) || 1;
                ship.destination = [ship.position[0] + away[0] / length * 3200, ship.position[1] + 180, ship.position[2] + away[2] / length * 3200];
                ship.standingDown = false;
                ship.poweredDown = false;
                ship.distressTargetId = undefined;
            }
        }
        for (const ship of live) {
            if (ship.distressRole !== 'pirate') {
                ship.distressTargetId = undefined;
                ship.targetId = undefined;
                continue;
            }
            // A raider that was shot holds its attacker instead of the victim
            // assigned below. Without this override the periodic retarget
            // silently put it back on the convoy, so player fire was ignored.
            if (ship.distressAggroTargetId) {
                if (ship.distressAggroUntil > now) {
                    const target = ship.distressAggroTargetId === 'player'
                        ? this.save.player
                        : this.ships.find(entry => entry.id === ship.distressAggroTargetId && entry.hull > 0 && !entry.surrendered);
                    if (target && !target.dockedAt && target.hull > 0) {
                        ship.distressTargetId = ship.distressAggroTargetId;
                        continue;
                    }
                }
                ship.distressAggroTargetId = undefined;
                ship.distressAggroUntil = 0;
            }
            if (active.variant === 'trap' && !active.progress?.exposed) {
                ship.distressTargetId = undefined;
                continue;
            }
            if (active.phase === 'involved' && active.variant !== 'convoy') {
                ship.distressTargetId = 'player';
                continue;
            }
            if (active.variant === 'convoy' && victims.length) {
                ship.distressTargetId = victims[raiderIndex % victims.length].id;
                raiderIndex++;
                continue;
            }
            ship.distressTargetId = active.phase === 'involved' || active.variant === 'wreck' || active.variant === 'trap' ? 'player' : undefined;
            if (raiderCount === 0) ship.distressTargetId = undefined;
        }
    },

    distressCombatTarget(ship) {
        if (!ship.distressActor) return undefined;
        const active = activeState(this);
        if (!active || active.id !== ship.distressEventId) return null;
        if (ship.distressRole !== 'pirate') {
            // A claimant that was attacked after the pilot took a side is a
            // normal hostile and uses the shared target acquisition.
            return ship.hostile && ship.distressTargetId === 'player' ? undefined : null;
        }
        const id = ship.distressTargetId;
        if (!id) return null;
        const actor = id === 'player' ? this.save.player : this.ships.find(entry => entry.id === id && entry.hull > 0 && !entry.surrendered);
        if (!actor || actor.dockedAt) {
            ship.targetId = undefined;
            return null;
        }
        ship.targetId = id;
        ship.npcTargetReason = 'distress';
        this.distressTargetScratch ??= {position: new THREE.Vector3(), velocity: new THREE.Vector3()};
        const target = this.distressTargetScratch;
        target.position.fromArray(actor.position);
        target.velocity.fromArray(actor.velocity ?? [0, 0, 0]);
        return target;
    },

    onDistressActorHit(ship, attackerId, amount) {
        if (!ship.distressActor || amount <= 0) return;
        const active = activeState(this);
        if (!active || active.id !== ship.distressEventId) return;
        const now = nowOf(this);
        active.progress.lastProgressAt = now;
        // Raiders answer fire. Any attacker outside the encounter (the player,
        // a patrol, a hired wingman) pulls the hit raider off its convoy victim
        // for a while; other raiders keep pressing the transports. A disguising
        // trap stays inert until its actual scan exposes the ambush.
        if (ship.distressRole === 'pirate' && !ship.surrendered && !ship.captured
            && !(active.variant === 'trap' && !active.progress?.exposed)) {
            const attacker = attackerId === 'player'
                ? this.save.player
                : this.ships.find(entry => entry.id === attackerId && entry.hull > 0 && !entry.surrendered);
            const sameEncounter = attacker?.distressEventId === active.id;
            if (attacker && !attacker.dockedAt && !sameEncounter) {
                const targetId = attackerId === 'player' ? 'player' : attacker.id;
                ship.distressAggroTargetId = targetId;
                ship.distressAggroUntil = now + DISTRESS_RETALIATION_TIME;
                ship.distressTargetId = targetId;
                ship.targetId = targetId;
                ship.npcTargetReason = 'distress';
                ship.hostile = true;
                ship.authorizedTarget = true;
                ship.standingDown = false;
                ship.poweredDown = false;
            }
        }
        if (attackerId !== 'player') return;
        // The claimant the pilot did not back is a legitimate target after a
        // side was taken; hitting the supported crew still breaks the deal.
        const sidedEnemy = active.variant === 'dispute' && active.progress?.sided === true && ship.hostile;
        if (ship.distressRole !== 'pirate' && !sidedEnemy) {
            if (active.variant === 'trap' && ship.distressActor === distressSetup(active.variant, active.setup).actors.find(entry => entry.disguise)?.key) {
                this.exposeDistressTrap(active, now);
                return;
            }
            // A dispute pays for backing one side up front. Attacking that
            // crew breaks the agreement, so the payment is taken back with it.
            if (active.settlement.state === 'paid' && active.settlement.reward > 0) {
                const clawback = active.settlement.reward;
                this.save.player.credits = Math.max(0, (Number(this.save.player.credits) || 0) - clawback);
                active.settlement.reward = 0;
            }
            active.progress.betrayed = true;
            active.settlement.state = 'forfeited';
            this.ui?.pushEvent?.(distressText(['Sie haben den Funk gekappt. Die Zahlung ist weg.', 'They have cut the channel. The payment is gone.']), 'danger', 5600);
            this.abandonDistress(active, 'betrayed');
            return;
        }
        if (active.variant === 'convoy' && active.phase !== 'involved') {
            active.choices.help = 'accepted';
            active.phase = 'involved';
            active.involvedAt = now;
            active.deadline = now + 240;
            this.retargetDistress(active);
            this.setDistressMonitor(active);
            this.ui?.pushEvent?.(distressText(['Du bist im Kampf · 2.000 cr pro Schiff, das durchkommt.', 'You are in the fight · 2,000 cr per ship that makes it out.']), 'warning', 5600);
        }
    },

    onDistressActorDefeated(ship) {
        if (!ship.distressActor) return;
        const active = activeState(this);
        if (!active || active.id !== ship.distressEventId) return;
        this.snapshotDistressActor(active, ship);
        this.setDistressMonitor(active);
        this.persistSave?.();
    },

    // Called by the ordinary salvage path when a container or wreck entry tied
    // to this event enters the hold. Keeps the cockpit objective live without
    // polluting the collection code with distress-specific rules.
    onDistressLoot(wreck) {
        const active = activeState(this);
        if (!active || !wreck || wreck.distressEventId !== active.id) return;
        active.progress.lastProgressAt = nowOf(this);
        this.setDistressMonitor(active);
        this.persistSave?.();
    },

    setDistressMonitor(active) {
        this.setMonitorStatus?.(distressText(distressObjective(active, this.save)), 600000);
    },

    updateDistressReminder(active, now) {
        if (!active.nextReminderAt) {
            active.nextReminderAt = now + 90;
            return;
        }
        if (now < active.nextReminderAt) return;
        if (now - (active.progress.lastProgressAt ?? now) < 60) return;
        this.ui?.pushSensor?.(distressText([`Erinnerung · ${distressText(distressObjective(active, this.save))}`, `Reminder · ${distressText(distressObjective(active, this.save))}`]), 'info', 5600);
        active.nextReminderAt = now + 90;
    },

    discoverDistress(active, now) {
        if (active.phase !== 'signal') return;
        active.phase = 'discovered';
        active.discoveredAt = now;
        active.progress.lastProgressAt = now;
        active.nextReminderAt = now + 90;
        const setup = distressSetup(active.variant, active.setup);
        // The seeded exit heading is shared by the local pocket's gap and the
        // projected route, so the corridor always leaves through open space.
        if (active.variant === 'debris' && !active.progress.exitYaw)
            active.progress.exitYaw = seededRandom(`${active.seed}:debris-exit:${active.id}`)() * Math.PI * 2;
        if (active.variant === 'wreck') {
            this.addDistressWreck(active, setup);
            this.addDistressSurvivorPods(active, now);
            if (setup.wreck?.attackers) active.progress.ambushAt = now + 14;
        }
        else if (active.variant === 'jettison') this.addDistressContainers(active);
        else if (active.variant === 'dispute') {
            this.addDistressWreck(active, {...setup, wreck: {name: setup.wreckName, derelict: 'atlas-freighter', cargo: [{commodity: 'electronics', quantity: 1}], locked: true}});
            this.spawnDistressActors(active, now);
        }
        else this.spawnDistressActors(active, now);
        if (active.variant === 'convoy') this.distressPrefight(active);
        this.retargetDistress(active);
        if (active.variant === 'wreck' && setup.recorder) {
            const portrait = this.encounterPortraitForSpeaker?.(active.caller, undefined, active);
            this.ui?.showStoryLine?.(active.caller, distressText(setup.recorder), 'neutral', undefined, portrait?.faction, portrait?.portraitIndex);
        }
        this.ui?.pushEvent?.(distressText([`Funkkontakt · ${active.caller}`, `Comms contact · ${active.caller}`]), 'info', 5200);
        this.setDistressMonitor(active);
        this.audio?.play?.('warning');
        this.persistSave?.();
    },

    addDistressWreck(active, setup) {
        const wreck = setup.wreck;
        if (!wreck) return;
        const id = `wreck-distress-${active.id}`;
        this.save.world.combatWrecks ??= {};
        if (this.save.world.combatWrecks[id]) return;
        const contents = (wreck.cargo ?? []).map((entry, index) => ({
            id: `distress-cargo-${active.id}-${index}`,
            kind: 'cargo',
            commodity: entry.commodity,
            quantity: entry.quantity,
        }));
        const record = {
            id,
            name: wreck.name,
            position: [...active.position],
            radius: 7,
            velocity: [0, 0, 0],
            systemId: active.systemId,
            instanceId: active.instanceId,
            sensorRange: 650,
            scanned: false,
            locked: Boolean(wreck.locked),
            derelict: wreck.derelict ?? 'atlas-freighter',
            distressEventId: active.id,
            contents,
        };
        this.save.world.combatWrecks[id] = record;
        const node = combatWreckNode(record);
        if (this.wreckNodes && !this.wreckNodes.some(entry => entry.id === id)) this.wreckNodes.push(node);
        this.renderer?.addCombatLootNode?.(node);
        this.renderer?.preloadGlbShips?.([record.derelict]);
    },

    addDistressContainers(active) {
        const setup = distressSetup(active.variant, active.setup);
        this.save.world.combatWrecks ??= {};
        this.wreckNodes ??= [];
        let serial = 0;
        for (const container of setup.containers ?? []) {
            for (let unit = 0; unit < container.quantity; unit++) {
                const id = `wreck-distress-${active.id}-c${serial++}`;
                if (this.save.world.combatWrecks[id]) continue;
                const record = {
                    id,
                    name: `${active.caller} · ${distressText(['Frachtcontainer', 'cargo container'])}`,
                    position: offset(active.position, [(serial - 2) * 26, (serial % 2 ? 12 : -8), (serial % 3) * 22]),
                    radius: 3,
                    velocity: [0, 0, 0],
                    systemId: active.systemId,
                    instanceId: active.instanceId,
                    sensorRange: 650,
                    scanned: false,
                    distressEventId: active.id,
                    contents: [{id: `distress-cargo-${active.id}-${serial}`, kind: 'cargo', commodity: container.commodity, quantity: 1}],
                };
                this.save.world.combatWrecks[id] = record;
                const node = combatWreckNode(record);
                this.wreckNodes.push(node);
                this.renderer?.addCombatLootNode?.(node);
            }
        }
    },

    addDistressSurvivorPods(active, now) {
        if (!this.spawnPickup) return;
        const setup = distressSetup(active.variant, active.setup);
        const total = setup.wreck?.survivors ?? 0;
        if (!total) return;
        const live = this.pickups.filter(pickup => pickup.distressEventId === active.id && pickup.life > 0).length;
        const missing = total - active.survivors.rescued - live;
        for (let index = 0; index < missing; index++) {
            const pickup = this.spawnPickup('medicine', offset(active.position, [60 + index * 40, 20, -40 - index * 30]), 'distress', 1);
            pickup.distressSurvivor = true;
            pickup.distressEventId = active.id;
            pickup.life = 900;
        }
        if (missing > 0) this.audio?.play?.('warning');
    },

    updateDistressActors(active, now) {
        // A signal is only a saved coordinate plus its comms line. Nothing is
        // simulated or spawned until the player answers and resolves contact.
        if (active.phase === 'signal') return;
        // A reload restores every survivor and raider that was still alive.
        // Destroyed snapshots are skipped, so no enemy comes back and no
        // survivor is duplicated.
        this.spawnDistressActors(active, now);
        // A migrated Lantern rescue (or a save made between contact and the
        // first combat tick) still opens with ships already trading fire.
        if (active.variant === 'convoy' && !active.progress?.prefight) this.distressPrefight(active);
        this.retargetDistress(active);
        if (active.variant === 'wreck') {
            if (active.survivors.rescued < active.survivors.total) this.addDistressSurvivorPods(active, now);
            const setup = distressSetup(active.variant, active.setup);
            if (setup.wreck?.attackers && active.progress.ambushAt && now >= active.progress.ambushAt && !active.progress.ambushSpawned) {
                active.progress.ambushSpawned = true;
                const spawned = this.spawnDistressActors(active, now, {raidersOnly: true});
                for (const ship of spawned) {
                    ship.hostile = true;
                    ship.authorizedTarget = true;
                    ship.distressTargetId = 'player';
                }
                if (spawned.length) {
                    this.ui?.pushSensor?.(distressText(['Die Schiffe sind zurück. Sie haben dich gesehen.', 'The ships are back. They have seen you.']), 'danger', 5200);
                    this.audio?.play?.('warning');
                }
            }
        }
        if (active.variant === 'trap' && active.progress.exposed === true) {
            this.retargetDistress(active);
        }
        if (active.variant === 'trap') {
            if (!active.progress.scanRevealed) {
                const spotted = this.ships.find(ship => ship.distressEventId === active.id && ship.distressRole !== 'pirate' && ship.scanned);
                if (spotted) {
                    active.progress.scanRevealed = true;
                    active.progress.lastProgressAt = now;
                    const setup = distressSetup(active.variant, active.setup);
                    this.ui?.pushSensor?.(distressText([`Scan · ${distressText(setup.clue)}`, `Scan · ${distressText(setup.clue)}`]), 'warning', 6200);
                }
            }
        }
        if (active.variant === 'disabled') {
            const setup = distressSetup(active.variant, active.setup);
            const target = liveEventShips(this, active, ship => ship.distressRole !== 'pirate')[0];
            if (target && active.progress.method === 'crew') {
                const proportion = target.hull / Math.max(1, target.maxHull);
                if (near(target.position, this.save.player.position, DISTRESS_REPAIR_RANGE) && !this.ships.some(ship => ship.hull > 0 && ship.hostile && near(ship.position, target.position, 1800))) {
                    target.hull = Math.min(target.maxHull, target.hull + .7);
                    active.progress.lastProgressAt = now;
                    this.audio?.play?.('repair', .4);
                }
                if (proportion >= setup.repairTarget) {
                    this.finishDistress(active, 'repaired', {
                        reward: setup.payment,
                        message: [`${active.caller} ist wieder manövrierfähig.`, `${active.caller} is under way again.`],
                        farewell: ['Danke. Die Überweisung ist raus.', 'Thank you. The transfer is on its way.'],
                    });
                    return;
                }
            }
            if (target && target.hull <= 0) this.abandonDistress(active, 'failed');
            if (now - active.createdAt > 1200) this.abandonDistress(active, 'withdrawn');
            return;
        }
        if (active.variant === 'convoy') {
            const raiders = liveEventShips(this, active, ship => ship.distressRole === 'pirate');
            const victims = liveEventShips(this, active, ship => ship.distressRole !== 'pirate');
            if (active.phase === 'involved' && raiders.length === 0 && victims.length > 0) {
                const reward = victims.length * DISTRESS_REWARD_PER_SURVIVOR;
                this.finishDistress(active, 'rescued', {
                    reward,
                    message: [`Konvoi gerettet · ${victims.length} ${victims.length === 1 ? 'Schiff' : 'Schiffe'} · ${formatCredits(reward)}`, `Convoy rescued · ${victims.length} ${victims.length === 1 ? 'ship' : 'ships'} · ${formatCredits(reward)}`],
                    farewell: [`Wir sind durch. Danke! ${formatCredits(reward)} cr sind unterwegs.`, `We made it. Thank you! Transferring ${formatCredits(reward)} cr.`],
                });
                return;
            }
            if (victims.length === 0) {
                this.abandonDistress(active, 'failed', [`Das Signal des Konvois ist abgerissen.`, `The convoy signal has been lost.`]);
                return;
            }
            if (active.phase === 'involved' && active.deadline && now >= active.deadline) {
                this.abandonDistress(active, 'failed', [`Der Konvoi konnte nicht gehalten werden.`, `The convoy could not be held.`]);
                return;
            }
            if (now - active.createdAt > 900) this.abandonDistress(active, 'failed');
            return;
        }
        if (active.variant === 'wreck') {
            const raiders = liveEventShips(this, active, ship => ship.distressRole === 'pirate');
            const wrecks = eventWrecks(this, active).filter(wreck => wreck.contents?.length);
            // Survivor pods stay collectible after the wreck is stripped; the
            // event itself closes once the manifest and any ambushers are done.
            if (raiders.length === 0 && wrecks.length === 0) {
                this.finishDistress(active, 'salvaged', {
                    reward: 0,
                    message: ['Wrack geborgen. Die Überlebenden werden bei Andocken abgerechnet.', 'Wreck recovered. Survivors are settled on docking.'],
                });
                return;
            }
            if (now - active.createdAt > 1200) this.abandonDistress(active, 'withdrawn');
            return;
        }
        if (active.variant === 'trap') {
            if (!active.progress.exposed) {
                if (now - active.createdAt > 900) this.abandonDistress(active, 'withdrawn');
                return;
            }
            const raiders = liveEventShips(this, active, ship => ship.distressRole === 'pirate');
            if (raiders.length === 0) {
                this.finishDistress(active, 'fought-off', {reward: 0, message: ['Die Raider sind ausgeschaltet.', 'The raiders are down.']});
                return;
            }
            if (now - active.createdAt > 600) this.abandonDistress(active, 'withdrawn');
            return;
        }
        if (active.variant === 'fuel') {
            if (now - active.createdAt > 900) this.abandonDistress(active, 'declined');
            return;
        }
        if (active.variant === 'debris') {
            const ship = liveEventShips(this, active, entry => entry.distressRole !== 'pirate')[0];
            if (!ship) {
                this.abandonDistress(active, 'failed');
                return;
            }
            // The escort run itself advances every simulation step (trail,
            // corridor damage, storm clock and jump) in updateDistressEscort.
            // This 2 Hz branch only owns the parked signal timeout, so it must
            // not re-issue a destination or finish on proximity.
            if (active.progress.method !== 'escape' && now - active.createdAt > 900) this.abandonDistress(active, 'withdrawn');
            return;
        }
        if (active.variant === 'jettison') {
            const remaining = eventWrecks(this, active).reduce((sum, wreck) => sum + (wreck.contents?.length ?? 0), 0);
            if (remaining === 0 && active.progress.keep) {
                this.finishDistress(active, 'salvaged', {reward: 0, message: ['Die Container sind deine.', 'The containers are yours.']});
                return;
            }
            if (now - active.createdAt > 1200) this.abandonDistress(active, 'withdrawn');
            return;
        }
        if (active.variant === 'dispute') {
            const setup = distressSetup(active.variant, active.setup);
            const rivalKey = setup.rival;
            const strangerKey = distressRoster(active.variant, active.setup).find(actor => actor.key !== rivalKey)?.key;
            const supportedKey = active.progress.side === 'side-a' ? strangerKey : rivalKey;
            const enemyKey = active.progress.side === 'side-a' ? rivalKey : strangerKey;
            const supported = eventShip(this, active, supportedKey);
            const enemy = eventShip(this, active, enemyKey);
            if (active.progress.sided && (!supported || supported.hull <= 0)) {
                this.abandonDistress(active, 'failed', ['Die unterstützte Crew ist ausgefallen.', 'The crew you backed is down.']);
                return;
            }
            if (active.progress.sided && (!enemy || enemy.hull <= 0 || distance(enemy.position, active.position) > 9000)) {
                this.finishDistress(active, 'settled', {reward: 0, message: ['Der Streit ist entschieden.', 'The dispute is decided.']});
                return;
            }
            if (now - active.createdAt > 900) this.abandonDistress(active, 'withdrawn');
        }
    },

    // One objective gate per variant. Kept out of updateDistressActors so the
    // actor lifecycle stays readable and each branch can persist exactly once.
    updateDistressObjective(active, now) {
        if (active.variant === 'disabled' && active.phase === 'involved' && active.progress.method === 'drone') {
            const setup = distressSetup(active.variant, active.setup);
            const target = liveEventShips(this, active, ship => ship.distressRole !== 'pirate')[0];
            if (target && target.hull / Math.max(1, target.maxHull) >= setup.repairTarget) {
                this.finishDistress(active, 'repaired', {
                    reward: setup.payment,
                    message: [`${active.caller} ist repariert.`, `${active.caller} is repaired.`],
                    farewell: ['Die Drohne hat gute Arbeit geleistet. Danke.', 'The drone did good work. Thank you.'],
                });
            }
        }
    },

    finishDistress(active, outcome, {reward = 0, message, farewell} = {}) {
        disposeEncounter(this, active, {outcome, reward, message, farewell});
        this.distressTickAt = 0;
    },

    abandonDistress(active, outcome = 'withdrawn', message) {
        disposeEncounter(this, active, {
            outcome,
            reward: 0,
            message: message ?? (outcome === 'declined'
                ? ['Der Notruf bleibt unbeantwortet.', 'The distress call goes unanswered.']
                : ['Der Kontakt ist abgebrochen.', 'The contact has gone quiet.']),
            farewell: undefined,
            tone: 'info',
        });
        this.distressTickAt = 0;
    },

    exposeDistressTrap(active, now) {
        if (active.progress.exposed) return;
        active.progress.exposed = true;
        active.progress.scanRevealed = true;
        active.progress.lastProgressAt = now;
        active.phase = 'involved';
        active.involvedAt = now;
        const setup = distressSetup(active.variant, active.setup);
        this.spawnDistressActors(active, now, {raidersOnly: true});
        for (const ship of this.ships) {
            if (ship.distressEventId !== active.id) continue;
            if (ship.distressRole === 'pirate') {
                ship.poweredDown = false;
                ship.standingDown = false;
                ship.hostile = true;
                ship.authorizedTarget = true;
                ship.distressTargetId = 'player';
            }
        }
        const portrait = this.encounterPortraitForSpeaker?.(active.caller, undefined, active);
        this.ui?.showStoryLine?.(active.caller, distressText(['Kluger Pilot. Zu klug.', 'Clever pilot. Too clever.']), 'hostile', undefined, portrait?.faction, portrait?.portraitIndex);
        this.ui?.pushSensor?.(distressText(setup.clue), 'danger', 6200);
        this.setDistressMonitor(active);
        this.persistSave?.();
    },

    distressHasRepairDrone() {
        const units = this.save.player?.droneFleet?.unitsById ?? {};
        return Object.values(units).some(unit => unit.type === 'repair' && unit.hull > 0 && unit.state !== 'destroyed');
    },

    distressJournalAction(action) {
        if (this.save.player.dockedAt) return false;
        const active = activeState(this);
        if (!active) return false;
        if (action === 'navigate') {
            if (active.systemId !== this.save.player.systemId) {
                const plotted = this.plotSystemRoute?.(active.systemId);
                if (plotted) this.ui?.hideShipMenu?.();
                return Boolean(plotted);
            }
            this.save.player.currentTargetId = active.id;
            this.ui?.hideShipMenu?.();
            this.updateAssetWarmup?.(true);
            return true;
        }
        if (action !== 'answer') return false;
        if (active.systemId !== this.save.player.systemId) return false;
        const gap = distance(active.position, this.save.player.position);
        if (gap > DISTRESS_ANSWER_RANGE) {
            this.setMonitorStatus?.(distressText([`Signal zu schwach · komm auf ${Math.round(DISTRESS_ANSWER_RANGE)} km ran`, `Signal too weak · get within ${Math.round(DISTRESS_ANSWER_RANGE)} km`]), 4200);
            this.ui?.pushSensor?.(distressText(['Der Notruf ist zu schwach. Folge dem Signal im Logbuch.', 'The signal is too weak. Follow it from the ship journal.']), 'info', 4200);
            return false;
        }
        if (active.phase === 'signal') this.discoverDistress(active, nowOf(this));
        this.hailDistress(active);
        this.ui?.hideShipMenu?.();
        return true;
    },

    hailDistress(active) {
        active.nextReminderAt = nowOf(this) + 90;
        const portrait = this.encounterPortraitForSpeaker?.(active.caller, active.id, active);
        this.ui?.showStoryLine?.(active.caller, distressOpenLine(active), 'neutral', active.id, portrait?.faction, portrait?.portraitIndex);
        this.persistSave?.();
    },

    // Every distress event introduces itself before it starts: once the pilot
    // flies into comms range the channel opens with the scenario card and its
    // choices — accept the escort, answer the wreck, scan the trap, agree a
    // fuel transfer. One auto-hail per event; closing the panel without
    // deciding leaves the journal action live for a pilot who wants it back.
    // A panel already open, a docked hull or an unrelated firefight defers the
    // hail to a later tick instead of burning it.
    maybeBriefDistress(active, now) {
        if (active.phase !== 'discovered' || active.progress?.method) return;
        if (active.progress?.briefedAt) return;
        if (this.ui?.adventure) return;
        if (this.save.player.dockedAt || this.playerDocking || this.galaxyJump || this.autopilot) return;
        // Fuel and repair handovers only work inside their own envelope, so the
        // card waits until the pilot is close enough to act on it. This is the
        // cheapest gate, so it runs before the roster and ship scans.
        const range = active.variant === 'fuel' ? DISTRESS_TRANSFER_RANGE
            : active.variant === 'disabled' ? DISTRESS_REPAIR_RANGE
                : DISTRESS_ANSWER_RANGE;
        if (distance(active.position, this.save.player.position) > range) return;
        // Someone has to be on the other end. Wreck signals are recorded
        // messages with no hull to talk to, so only variants that roster a
        // caller require a live one. An unrelated hostile contact means the
        // pilot is busy; the briefing waits.
        const speakers = distressRoster(active.variant, active.setup).filter(entry => entry.role !== 'pirate');
        if (speakers.length && !liveEventShips(this, active, entry => entry.distressRole !== 'pirate').length) return;
        if (this.ships.some(ship => ship.hull > 0 && ship.hostile && !ship.distressActor && near(ship.position, this.save.player.position, 2400))) return;
        // World time can legitimately be 0, so the "already briefed" stamp
        // needs an epsilon to stay truthy on a fresh session.
        active.progress.briefedAt = now + 1e-6;
        this.hailDistress(active);
    },

    chooseDistress(choice) {
        const data = this.save.world.distress;
        const active = data?.active;
        if (!active || !this.distressEligible()) return {ok: false};
        const setup = distressSetup(active.variant, active.setup);
        const now = nowOf(this);
        const gap = distance(active.position, this.save.player.position);
        const finish = (outcome, options) => {
            this.finishDistress(active, outcome, options);
            return {ok: true};
        };
        const keepOpen = () => ({ok: true});
        switch (choice) {
            case 'help': {
                if (active.variant !== 'convoy' || active.progress.betrayed) return {ok: false};
                if (active.phase === 'signal') this.discoverDistress(active, now);
                active.choices.help = 'accepted';
                active.phase = 'involved';
                active.involvedAt = now;
                active.deadline = now + 240;
                active.progress.lastProgressAt = now;
                this.retargetDistress(active);
                this.setDistressMonitor(active);
                this.playDistressLine(active, ['Wir haben dich. Halte sie von uns fern!', 'We have you. Keep them off us!']);
                this.persistSave?.();
                return keepOpen();
            }
            case 'decline': {
                this.abandonDistress(active, 'declined');
                return {ok: true};
            }
            case 'accept': {
                if (active.variant !== 'wreck') return {ok: false};
                active.phase = 'involved';
                active.involvedAt = now;
                active.choices.help = 'accepted';
                active.progress.lastProgressAt = now;
                this.setDistressMonitor(active);
                this.playDistressLine(active, ['Die Fracht liegt im Wrack. Nimm, was du tragen kannst.', 'The cargo is in the wreck. Take what you can carry.']);
                this.persistSave?.();
                return keepOpen();
            }
            case 'scan':
            case 'expose': {
                if (active.variant !== 'trap') return {ok: false};
                if (choice === 'expose' && gap > DISTRESS_ANSWER_RANGE) return {ok: false};
                this.exposeDistressTrap(active, now);
                this.playDistressLine(active, ['Du hättest weiterfliegen sollen.', 'You should have kept flying.']);
                return keepOpen();
            }
            case 'fight': {
                if (active.variant !== 'trap') return {ok: false};
                this.exposeDistressTrap(active, now);
                return keepOpen();
            }
            case 'transfer':
            case 'donate': {
                if (active.variant !== 'fuel') return {ok: false};
                const speed = Math.hypot(...(this.save.player.velocity ?? [0, 0, 0]));
                if (gap > DISTRESS_TRANSFER_RANGE || speed > DISTRESS_TRANSFER_SPEED) {
                    this.setMonitorStatus?.(distressText(['Zu weit oder zu schnell · komm ran und drossel.', 'Too far or too fast · close in and slow down.']), 4600);
                    return {ok: false};
                }
                if ((this.save.player.fuel ?? 0) < setup.fuel) {
                    this.setMonitorStatus?.(distressText(['Nicht genug Treibstoff für den Transfer.', 'Not enough fuel for the transfer.']), 4200);
                    return {ok: false};
                }
                this.save.player.fuel = Math.max(0, this.save.player.fuel - setup.fuel);
                const reward = choice === 'donate' ? 0 : setup.payment;
                finish('supplied', {
                    reward,
                    message: choice === 'donate'
                        ? [`${setup.fuel} Einheiten Treibstoff gespendet.`, `${setup.fuel} units of fuel donated.`]
                        : [`${setup.fuel} Einheiten Treibstoff geliefert · ${formatCredits(reward)}`, `${setup.fuel} units of fuel delivered · ${formatCredits(reward)}`],
                    farewell: choice === 'donate' ? ['Das vergessen wir nicht.', 'We will not forget this.'] : ['Danke. Die Überweisung ist raus.', 'Thanks. The transfer is on its way.'],
                });
                return {ok: true};
            }
            case 'parts': {
                if (active.variant !== 'disabled') return {ok: false};
                const have = Number(this.save.player.cargo?.machinery ?? 0);
                if (have < setup.parts) {
                    this.setMonitorStatus?.(distressText([`${setup.parts}× Maschinenteile benötigt.`, `${setup.parts}× machinery parts required.`]), 4200);
                    return {ok: false};
                }
                this.save.player.cargo.machinery = have - setup.parts;
                if (this.save.player.cargo.machinery <= 0) delete this.save.player.cargo.machinery;
                const ship = liveEventShips(this, active, entry => entry.distressRole !== 'pirate')[0];
                if (ship) ship.hull = Math.max(ship.hull, ship.maxHull * setup.repairTarget);
                finish('repaired', {
                    reward: setup.payment,
                    message: [`Teile geliefert · ${formatCredits(setup.payment)}`, `Parts delivered · ${formatCredits(setup.payment)}`],
                    farewell: ['Die Pumpe läuft wieder. Danke.', 'The pump is running again. Thank you.'],
                });
                return {ok: true};
            }
            case 'drone': {
                if (active.variant !== 'disabled') return {ok: false};
                active.phase = 'involved';
                active.involvedAt = now;
                active.progress.method = 'drone';
                active.progress.lastProgressAt = now;
                this.setDistressMonitor(active);
                this.playDistressLine(active, ['Wir halten still. Schick die Drohne.', 'We are holding still. Send the drone.']);
                this.persistSave?.();
                return keepOpen();
            }
            case 'crew': {
                if (active.variant !== 'disabled') return {ok: false};
                active.phase = 'involved';
                active.involvedAt = now;
                active.progress.method = 'crew';
                active.progress.lastProgressAt = now;
                this.setDistressMonitor(active);
                this.playDistressLine(active, ['Gut. Wir öffnen die Luke. Es wird dauern.', 'Good. We are opening the hatch. This will take a while.']);
                this.persistSave?.();
                return keepOpen();
            }
            case 'escape': {
                if (active.variant !== 'debris') return {ok: false};
                const ship = liveEventShips(this, active, entry => entry.distressRole !== 'pirate')[0];
                if (!ship) return {ok: false};
                active.phase = 'involved';
                active.involvedAt = now;
                active.progress.method = 'escape';
                active.progress.route = this.distressEscortRoute(active, ship);
                active.progress.exit = [...active.progress.route.at(-1)];
                // World time can legitimately be 0 on a fresh session, so a
                // timestamp used as a truthy "started" flag needs an epsilon;
                // otherwise jumpAt=0 reads as "not started" forever.
                active.progress.escortAt = now + 1e-6;
                // A hyperdrive drop lands 500 km from the signal, inside the
                // handover radius: accepting there links the transport on the
                // spot. Signing from farther out holds it until the pilot
                // closes, and only the handover starts the storm clock.
                const alongside = distance(this.save.player.position, ship.position) <= 700;
                active.progress.joinedAt = alongside ? now + 1e-6 : 0;
                active.progress.burstAt = alongside ? now + DISTRESS_ESCORT_BURST : 0;
                active.progress.burstStage = 0;
                active.progress.jumpAt = 0;
                active.progress.straySince = 0;
                active.progress.strayed = false;
                active.progress.onLine = false;
                active.progress.beaconsFailed = false;
                active.progress.outOfRangeAt = 0;
                active.progress.escortHull = Math.max(0, Math.min(1, ship.hull / Math.max(1, ship.maxHull)));
                ship.poweredDown = false;
                ship.standingDown = false;
                ship.hostile = false;
                ship.destination = [...ship.position];
                ship.task = undefined;
                ship.distressEscort = true;
                ship.distressFollowDistance = DISTRESS_ESCORT_LAG;
                ship.distressTrail = new Float32Array(ESCORT_TRAIL_POINTS * 3);
                ship.distressTrailDist = new Float32Array(ESCORT_TRAIL_POINTS);
                ship.distressTrailHead = 0;
                ship.distressTrailCount = 0;
                ship.distressTrailNextAt = 0;
                ship.distressStraySince = 0;
                ship.distressStrayHitAt = 0;
                this.setDistressMonitor(active);
                // The acknowledgement goes to the comms bar, not back through
                // the story queue: accepting must close the panel and put the
                // pilot in the seat, not open a second "continue" card.
                const ackPortrait = this.encounterPortraitForSpeaker?.(active.caller, undefined, active);
                const burstClock = `${Math.floor(DISTRESS_ESCORT_BURST / 60)}:${String(DISTRESS_ESCORT_BURST % 60).padStart(2, '0')}`;
                this.ui?.showPilotLine?.(active.caller, distressText(alongside
                    ? ['Kurs empfangen. Wir hängen an deiner Spur — die Front läuft.', 'Vector received. We are on your trail — the front is moving.']
                    : ['Kurs empfangen. Wir halten Position im Feld — komm längsseits, dann hängen wir uns an deine Spur.', 'Vector received. We are holding position in the field — come alongside and we are on your trail.']
                ), 'neutral', 6500, false, ackPortrait?.faction, ackPortrait?.portraitIndex);
                this.ui?.pushEvent?.(distressText(alongside
                    ? [`Übergabe · Sonnenfront in ${burstClock} · bleib auf der Spur`, `Handover · solar front in ${burstClock} · stay on the trail`]
                    : [`Sonnenfront in ${burstClock} · Uhr startet, wenn du längsseits bist`, `Solar front in ${burstClock} · clock starts when you are alongside`]
                ), 'warning', 6200);
                this.persistSave?.();
                return keepOpen();
            }
            case 'recover': {
                if (active.variant !== 'jettison') return {ok: false};
                if (cargoFree(this.save.player) < 1) {
                    this.setMonitorStatus?.(distressText(['Laderaum voll · erst Platz schaffen.', 'Hold full · make room first.']), 4200);
                    return keepOpen();
                }
                active.phase = 'involved';
                active.involvedAt = now;
                active.choices.help = 'accepted';
                active.progress.keep = false;
                active.progress.lastProgressAt = now;
                this.setDistressMonitor(active);
                this.playDistressLine(active, ['Gut. Wir warten hier.', 'Good. We will wait here.']);
                this.persistSave?.();
                return keepOpen();
            }
            case 'keep': {
                if (active.variant !== 'jettison') return {ok: false};
                active.phase = 'involved';
                active.involvedAt = now;
                active.choices.help = 'refused';
                active.progress.keep = true;
                active.progress.lastProgressAt = now;
                this.setDistressMonitor(active);
                this.playDistressLine(active, ['Dann eben so. Ich hoffe, du kannst damit schlafen.', 'Then take it. I hope you can sleep with that.']);
                this.persistSave?.();
                return keepOpen();
            }
            case 'handover': {
                if (active.variant !== 'jettison') return {ok: false};
                const cargo = this.save.player.cargo ?? {};
                if (!setup.containers.every(entry => (cargo[entry.commodity] ?? 0) >= entry.quantity)) {
                    this.setMonitorStatus?.(distressText(['Dir fehlt ein Teil der Fracht.', 'You are missing part of the cargo.']), 4200);
                    return {ok: false};
                }
                for (const entry of setup.containers) {
                    cargo[entry.commodity] -= entry.quantity;
                    if (cargo[entry.commodity] <= 0) delete cargo[entry.commodity];
                }
                finish('returned', {
                    reward: setup.returnPayment,
                    message: [`Fracht zurückgegeben · ${formatCredits(setup.returnPayment)}`, `Cargo returned · ${formatCredits(setup.returnPayment)}`],
                    farewell: ['Alles an Bord. Danke.', 'All aboard. Thank you.'],
                });
                return {ok: true};
            }
            case 'negotiate': {
                if (active.variant !== 'dispute') return {ok: false};
                this.unlockDistressWreck(active);
                finish('settled', {
                    reward: setup.negotiate,
                    message: [`Split vereinbart · ${formatCredits(setup.negotiate)}`, `Split agreed · ${formatCredits(setup.negotiate)}`],
                    farewell: ['Ein fairer Schnitt. Wir verschwinden.', 'A fair cut. We are leaving.'],
                });
                return {ok: true};
            }
            case 'side-a':
            case 'side-b': {
                if (active.variant !== 'dispute') return {ok: false};
                const rivalKey = setup.rival;
                const strangerKey = distressRoster(active.variant, active.setup).find(entry => entry.key !== rivalKey)?.key;
                const supportedKey = choice === 'side-a' ? strangerKey : rivalKey;
                const enemyKey = choice === 'side-a' ? rivalKey : strangerKey;
                const supportedShip = eventShip(this, active, supportedKey);
                const enemy = eventShip(this, active, enemyKey);
                pay(this, active, setup.support);
                active.phase = 'involved';
                active.involvedAt = now;
                active.progress.sided = true;
                active.progress.side = choice;
                active.progress.lastProgressAt = now;
                if (supportedShip) {
                    supportedShip.standingDown = true;
                    supportedShip.hostile = false;
                    supportedShip.destination = offset(active.position, [900, 220, 900]);
                }
                if (enemy) {
                    enemy.hostile = true;
                    enemy.authorizedTarget = true;
                    enemy.standingDown = false;
                    enemy.poweredDown = false;
                    enemy.distressTargetId = 'player';
                    enemy.faction = 'independents';
                }
                this.setDistressMonitor(active);
                this.playDistressLine(active, choice === 'side-a' ? ['Gute Wahl. Wir halten sie fest.', 'Good choice. We will hold them.'] : ['Endlich jemand mit Verstand. Wir übernehmen.', 'Finally someone with sense. We are taking over.'], choice === 'side-a' ? active.caller : distressSetup(active.variant, active.setup).actors.find(actor => actor.key === distressSetup(active.variant, active.setup).rival)?.name);
                this.persistSave?.();
                return keepOpen();
            }
            case 'withdraw': {
                this.abandonDistress(active, 'withdrawn');
                return {ok: true};
            }
            case 'close': return keepOpen();
            case 'leave': {
                this.abandonDistress(active, 'declined');
                return {ok: true};
            }
            default:
                return {ok: false};
        }
    },

    playDistressLine(active, line, speaker = active.caller) {
        const portrait = this.encounterPortraitForSpeaker?.(speaker, undefined, active);
        this.playStoryLine?.(speaker, distressText(line), 'neutral', 6500, undefined, portrait);
    },

    unlockDistressWreck(active) {
        const id = `wreck-distress-${active.id}`;
        const wreck = this.save.world.combatWrecks?.[id];
        if (wreck) wreck.locked = false;
        const node = this.wreckNodes?.find(entry => entry.id === id);
        if (node) node.locked = false;
    },

    distressEscapePoint(active, ship) {
        const rng = seededRandom(`${active.seed}:escape`);
        const direction = (rng() * Math.PI * 2) | 0;
        for (let attempt = 0; attempt < 20; attempt++) {
            const angle = direction + attempt * Math.PI / 10;
            const reach = 1300 + attempt * 90;
            const point = [ship.position[0] + Math.cos(angle) * reach, ship.position[1] + (attempt % 3 - 1) * 140, ship.position[2] + Math.sin(angle) * reach];
            if (this.distressPointClear(point)) return point;
        }
        return [ship.position[0], ship.position[1] + 1400, ship.position[2]];
    },

    // ------------------------------------------------------------- debris escort
    // The transport's nav computer is dead, so the pilot's ship projects the
    // route and the transport flies the pilot's own breadcrumb trail. The
    // corridor is a swept tube around the authored markers: straying damages
    // the pilot immediately and the transport when it reaches the same place.
    distressEscortRoute(active, ship) {
        const rng = seededRandom(`${active.seed}:escort-route:${active.id}`);
        const yaw = Number(active.progress.exitYaw) || 0;
        const direction = [Math.cos(yaw), 0, Math.sin(yaw)];
        const side = [-direction[2], 0, direction[0]];
        const baseY = ship.position[1];
        const route = [];
        const push = point => route.push([...point]);
        // The corridor starts at the stranded hull, not at the first ring: a
        // pilot still alongside the transport is on the line, not straying.
        push([ship.position[0], ship.position[1], ship.position[2]]);
        let cursor = [ship.position[0] + direction[0] * 240, baseY, ship.position[2] + direction[2] * 240];
        if (!this.distressPointClear(cursor))
            cursor = [ship.position[0] + direction[0] * 150, baseY + 60, ship.position[2] + direction[2] * 150];
        push(cursor);
        for (let marker = 0; marker < 5; marker++) {
            let placed;
            for (let attempt = 0; attempt < 30 && !placed; attempt++) {
                const turn = (rng() - .5) * .9 + (attempt % 2 ? 1 : -1) * Math.min(1.4, Math.ceil(attempt / 2) * .22);
                const step = 520 + rng() * 240;
                const forwardX = direction[0] * Math.cos(turn) - side[0] * Math.sin(turn);
                const forwardZ = direction[2] * Math.cos(turn) - side[2] * Math.sin(turn);
                const candidate = [
                    cursor[0] + forwardX * step,
                    Math.max(baseY - 260, Math.min(baseY + 260, cursor[1] + (rng() - .5) * 110)),
                    cursor[2] + forwardZ * step,
                ];
                if (!this.distressPointClear(candidate)) continue;
                const middle = [(cursor[0] + candidate[0]) / 2, (cursor[1] + candidate[1]) / 2, (cursor[2] + candidate[2]) / 2];
                if (!this.distressPointClear(middle)) continue;
                placed = candidate;
            }
            if (!placed)
                placed = [cursor[0] + direction[0] * 520, cursor[1], cursor[2] + direction[2] * 520];
            push(placed);
            cursor = placed;
        }
        // The jump point has to sit in open space: the transport can only spin
        // up its drive once it is clear of the pocket.
        let jump = [cursor[0] + direction[0] * 760, cursor[1] + 40, cursor[2] + direction[2] * 760];
        if (!this.distressPointClear(jump)) {
            for (let attempt = 1; attempt <= 16; attempt++) {
                const turn = (attempt % 2 ? 1 : -1) * Math.ceil(attempt / 2) * .18;
                const forwardX = direction[0] * Math.cos(turn) - side[0] * Math.sin(turn);
                const forwardZ = direction[2] * Math.cos(turn) - side[2] * Math.sin(turn);
                const reach = 760 + Math.floor(attempt / 2) * 60;
                const candidate = [cursor[0] + forwardX * reach, cursor[1] + 40, cursor[2] + forwardZ * reach];
                if (!this.distressPointClear(candidate)) continue;
                jump = candidate;
                break;
            }
        }
        push(jump);
        return route;
    },

    // Record the pilot's path at 10 Hz and retarget the transport to a fixed
    // lag behind the head. This copies the line the pilot actually flew (so a
    // clean line is proof the heavy hull fits) while the lag keeps the two
    // hulls apart when the pilot brakes.
    distressEscortTrailTarget(ship, now, player) {
        if (!ship.distressTrail) return;
        const trail = ship.distressTrail, distances = ship.distressTrailDist;
        const head = ship.distressTrailHead ?? 0;
        if (now >= (ship.distressTrailNextAt ?? 0)) {
            ship.distressTrailNextAt = now + .1;
            const count = ship.distressTrailCount ?? 0;
            const last = (head - 1 + ESCORT_TRAIL_POINTS) % ESCORT_TRAIL_POINTS;
            const px = player.position[0], py = player.position[1], pz = player.position[2];
            const moved = count
                ? Math.hypot(px - trail[last * 3], py - trail[last * 3 + 1], pz - trail[last * 3 + 2])
                : 0;
            if (!count || moved >= 2) {
                trail[head * 3] = px;
                trail[head * 3 + 1] = py;
                trail[head * 3 + 2] = pz;
                distances[head] = (count ? distances[last] : 0) + moved;
                ship.distressTrailHead = (head + 1) % ESCORT_TRAIL_POINTS;
                ship.distressTrailCount = Math.min(ESCORT_TRAIL_POINTS, count + 1);
            }
        }
        const count = ship.distressTrailCount ?? 0;
        if (!count) return;
        const newest = (ship.distressTrailHead - 1 + ESCORT_TRAIL_POINTS) % ESCORT_TRAIL_POINTS;
        const wanted = distances[newest] - (ship.distressFollowDistance ?? DISTRESS_ESCORT_LAG);
        let index = newest;
        for (let step = 0; step < count; step++) {
            const candidate = (ship.distressTrailHead - 1 - step + ESCORT_TRAIL_POINTS) % ESCORT_TRAIL_POINTS;
            index = candidate;
            if (distances[candidate] <= wanted) break;
        }
        ship.destination = [trail[index * 3], trail[index * 3 + 1], trail[index * 3 + 2]];
    },

    updateDistressEscort(dt) {
        const active = activeState(this);
        if (!active || active.variant !== 'debris' || active.phase !== 'involved' || active.progress.method !== 'escape') return;
        if (!this.distressEligible()) return;
        const now = nowOf(this), p = active.progress, player = this.save.player;
        const ship = liveEventShips(this, active, entry => entry.distressRole !== 'pirate')[0];
        if (!ship) return;
        p.escortHull = Math.max(0, Math.min(1, ship.hull / Math.max(1, ship.maxHull)));
        const gap = distance(player.position, ship.position);
        if (gap > DISTRESS_ESCORT_RANGE) {
            if (!p.outOfRangeAt) p.outOfRangeAt = now + 1e-6;
            if (now - p.outOfRangeAt > 25) {
                this.abandonDistress(active, 'withdrawn', ['Der Frachter ist aus dem Sichtbereich verschwunden.', 'The transport has drifted out of range.']);
                return;
            }
        } else p.outOfRangeAt = 0;
        if (!p.joinedAt && gap <= 700) {
            p.joinedAt = now + 1e-6;
            // Handover starts the storm: the transport is attached, the clock
            // is running, and the beacons are now the pilot's problem. A clock
            // that is already running is never pushed back.
            if (!p.burstAt) p.burstAt = now + DISTRESS_ESCORT_BURST;
            p.burstStage = 0;
            this.playDistressLine(active, ['Wir hängen an deiner Spur. Die Front läuft — bring uns raus.', 'We are on your trail. The front is moving — get us out.']);
            this.ui?.pushEvent?.(distressText([`Übergabe · Sonnenfront in ${Math.floor(DISTRESS_ESCORT_BURST / 60)}:${String(DISTRESS_ESCORT_BURST % 60).padStart(2, '0')} · bleib auf der Spur`, `Handover · solar front in ${Math.floor(DISTRESS_ESCORT_BURST / 60)}:${String(DISTRESS_ESCORT_BURST % 60).padStart(2, '0')} · stay on the trail`]), 'warning', 6200);
            this.setDistressMonitor(active);
        }
        // Until the handover the transport holds its position in the pocket:
        // it has no nav, so it cannot come to the pilot. The corridor starts
        // at its hull and the beacons point the way in.
        if (p.joinedAt) this.distressEscortTrailTarget(ship, now, player);

        // The solar front is a hard outer clock. It also degrades the pilot's
        // projected route in its final minute: the far beacons fail first, so
        // the last stretch has to be flown from memory.
        if (p.burstAt) {
            const left = p.burstAt - now;
            const stage = left <= 30 ? 3 : left <= 60 ? 2 : left <= 120 ? 1 : 0;
            if (stage > (p.burstStage ?? 0)) {
                p.burstStage = stage;
                if (stage === 1) this.playDistressLine(active, ['Noch zwei Minuten, dann ist die Front hier.', 'Two minutes until the front is here.']);
                if (stage === 2) {
                    p.beaconsFailed = true;
                    this.playDistressLine(active, ['Eine Minute. Deine Bojen fallen aus — wir sehen nur noch dich.', 'One minute. Your beacons are dropping — we only see you.']);
                    this.ui?.pushEvent?.(distressText(['Die Sonnenfront erreicht die Bojen. Der Kurs liegt jetzt bei dir.', 'The solar front is taking the beacons. The course is yours now.']), 'danger', 6200);
                }
                if (stage === 3) this.playDistressLine(active, ['Dreißig Sekunden! Wo ist der Vektor?', 'Thirty seconds! Where is the vector?']);
            }
            if (now >= p.burstAt) {
                this.loseDistressEscort(active, ship);
                return;
            }
        }

        const route = p.route;
        if (Array.isArray(route) && route.length > 1) {
            const jumpPoint = route[route.length - 1];
            if (!p.jumpAt && near(ship.position, jumpPoint, 180)) {
                p.jumpAt = now + 1e-6;
                p.escortHull = Math.max(0, Math.min(1, ship.hull / Math.max(1, ship.maxHull)));
                ship.standingDown = true;
                ship.destination = [...ship.position];
                this.playDistressLine(active, ['Vektor frei. Wir spulen hoch — acht Sekunden!', 'Vector clear. Spinning up — eight seconds!']);
                this.ui?.pushEvent?.(distressText(['Sprungkurs · 8 s bis zum Absprung', 'Jump vector · 8 s to departure']), 'warning', 5200);
                this.setDistressMonitor(active);
            }
            if (p.jumpAt && now >= p.jumpAt + DISTRESS_ESCORT_SPINUP) {
                this.completeDistressEscort(active, ship);
                return;
            }
        }

        if (Array.isArray(route) && route.length > 1 && !p.jumpAt && p.joinedAt) {
            const half = DISTRESS_ESCORT_HALF_WIDTH;
            const pilotOffset = routeProgress(route, player.position).distance;
            // Give the pilot three seconds after the handover to take the lead
            // before the tube starts biting. Accepting from a distance used to
            // arm the corridor immediately, so closing on the transport burned
            // hull and the clean-run bonus before the run had started.
            const joinedAt = p.joinedAt;
            // Arm the tube only once the pilot has actually flown the line: the
            // handover itself can happen up to 700 km out, which is far wider
            // than the corridor. After that, leaving it is on the pilot.
            if (pilotOffset <= half) p.onLine = true;
            if (p.onLine && pilotOffset > half + 40 && now >= joinedAt + 3) {
                if (!p.straySince) p.straySince = now + 1e-6;
                if (now - p.straySince >= 1.2 && now >= (p.strayHitAt ?? 0)) {
                    p.strayHitAt = now + 1.4;
                    p.strayed = true;
                    const ramp = Math.min(1, Math.max(0, now - p.straySince - 1.2) / 3);
                    this.damagePlayer(5 + 5 * ramp, 'debris strike', true);
                    this.renderer?.spawnImpact?.(player.position, 0xffd08a, false);
                    if (!p.strayLine) {
                        p.strayLine = true;
                        this.playDistressLine(active, ['Du bist zu weit raus! Wir sehen das Metall zu spät.', 'You are too wide! We see the metal too late.']);
                    }
                }
            } else p.straySince = 0;

            const transportOffset = routeProgress(route, ship.position).distance;
            if (p.onLine && transportOffset > half + 55 && now >= joinedAt + 4) {
                if (!ship.distressStraySince) ship.distressStraySince = now + 1e-6;
                if (now - ship.distressStraySince >= 1.2 && now >= (ship.distressStrayHitAt ?? 0)) {
                    ship.distressStrayHitAt = now + 1.2;
                    const ramp = Math.min(1, Math.max(0, now - ship.distressStraySince - 1.2) / 3);
                    this.damageShip(ship, 7 + 6 * ramp, 'environment', ship.position);
                    this.renderer?.spawnImpact?.(ship.position, 0xffb066, true);
                    p.escortHull = Math.max(0, Math.min(1, ship.hull / Math.max(1, ship.maxHull)));
                    if (!p.transportLine) {
                        p.transportLine = true;
                        this.playDistressLine(active, ['Wir haben Metall berührt. Halt die Linie!', 'We clipped metal. Hold the line!']);
                    }
                    if (ship.hull <= 0) {
                        this.loseDistressEscort(active, ship);
                        return;
                    }
                }
            } else ship.distressStraySince = 0;
        }

        if (now >= (p.nextEscortMonitorAt ?? 0)) {
            p.nextEscortMonitorAt = now + 1;
            this.setDistressMonitor(active);
        }
    },

    completeDistressEscort(active, ship) {
        const setup = distressSetup(active.variant, active.setup);
        const hullFraction = Math.max(0, Math.min(1, ship.hull / Math.max(1, ship.maxHull)));
        const base = Math.round(setup.payment * (0.55 + 0.45 * hullFraction));
        const clean = active.progress.strayed ? 0 : Math.round(setup.payment * DISTRESS_ESCORT_CLEAN_BONUS);
        const reward = base + clean;
        this.renderer?.spawnHyperdriveStreak?.(ship.position, [0, 0, 1], 0xf0b66b);
        this.ships = this.ships.filter(entry => entry !== ship);
        this.renderer?.syncShips?.(this.ships);
        this.finishDistress(active, 'escaped', {
            reward,
            message: [`${active.caller} ist gesprungen · Hülle ${Math.round(hullFraction * 100)}% · ${formatCredits(reward)}`, `${active.caller} jumped out · hull ${Math.round(hullFraction * 100)}% · ${formatCredits(reward)}`],
            farewell: clean
                ? ['Sauberer Lauf. Danke für die Augen.', 'Clean run. Thanks for the eyes.']
                : ['Wir sind raus. Danke — das war knapp.', 'We are out. Thanks — that was close.'],
        });
    },

    loseDistressEscort(active, ship) {
        const id = `wreck-distress-${active.id}-lost`;
        this.save.world.combatWrecks ??= {};
        if (!this.save.world.combatWrecks[id]) {
            const record = {
                id,
                name: `${active.caller} · ${distressText(['Wrack', 'wreck'])}`,
                position: [...ship.position],
                radius: 7,
                velocity: [...ship.velocity],
                systemId: active.systemId,
                instanceId: active.instanceId,
                sensorRange: 650,
                scanned: false,
                derelict: ship.hullId || 'mule',
                distressEventId: active.id,
                distressPersistent: true,
                contents: [{id: `distress-cargo-${active.id}-lost`, kind: 'cargo', commodity: 'machinery', quantity: 2}],
            };
            this.save.world.combatWrecks[id] = record;
            const node = combatWreckNode(record);
            this.wreckNodes ??= [];
            if (!this.wreckNodes.some(entry => entry.id === id)) this.wreckNodes.push(node);
            this.renderer?.addCombatLootNode?.(node);
        }
        ship.hull = 0;
        this.renderer?.spawnExplosion?.(ship.position, true, 1.5);
        this.ships = this.ships.filter(entry => entry !== ship);
        this.renderer?.syncShips?.(this.ships);
        this.finishDistress(active, 'lost', {
            reward: 0,
            message: ['Die Sonnenfront hat den Frachter erreicht.', 'The solar front reached the transport.'],
            farewell: ['Die Front hat uns. Wir schaffen es nicht mehr.', 'The front has us. We are not going to make it.'],
        });
    },

    distressBeaconView() {
        const active = activeState(this);
        if (!active || active.variant !== 'debris' || active.phase === 'signal' || active.progress.method !== 'escape') return undefined;
        const route = active.progress.route;
        if (!Array.isArray(route) || route.length < 2) return undefined;
        const ship = liveEventShips(this, active, entry => entry.distressRole !== 'pirate')[0];
        if (!ship) return undefined;
        const player = this.save.player;
        if (distance(player.position, ship.position) > DISTRESS_ESCORT_RANGE) return undefined;
        const progress = routeProgress(route, player.position);
        return {
            points: route,
            activeIndex: Math.min(route.length - 1, progress.index + 1),
            range: active.progress.beaconsFailed ? DISTRESS_BEACON_FAIL_RANGE : DISTRESS_BEACON_RANGE,
            player: [...player.position],
        };
    },

    distressPocketView() {
        const active = activeState(this);
        if (!active || active.variant !== 'debris' || active.phase === 'signal') return undefined;
        if (active.systemId !== this.save.player.systemId) return undefined;
        if (distance(active.position, this.save.player.position) > 8000) return undefined;
        return {
            key: `${active.id}:${Math.round((Number(active.progress.exitYaw) || 0) * 1000)}`,
            center: [...active.position],
            exitYaw: Number(active.progress.exitYaw) || 0,
        };
    },

    distressWaypoint() {
        const active = activeState(this);
        const player = this.save.player;
        if (!active || !player || player.dockedAt || this.arena || this.activeRace) return undefined;
        if (player.systemId !== active.systemId || player.currentTargetId !== active.id) return undefined;
        if (active.instanceId && this.activeInstanceId && active.instanceId !== this.activeInstanceId) return undefined;
        const title = distressText(distressVariant(active.variant)?.title ?? ['Notruf', 'Distress call']);
        return {
            id: active.id,
            kind: 'waypoint',
            exploration: true,
            distress: true,
            position: [...active.position],
            name: title,
            shortName: active.caller,
            radius: 0,
        };
    },

    distressSelect(id) {
        const active = activeState(this);
        if (!active || active.id !== id) return false;
        this.save.player.currentTargetId = id;
        this.ui?.hideShipMenu?.();
        this.updateAssetWarmup?.(true);
        return true;
    },

    // Docking settles survivor pods that were recovered by normal fly-over.
    settleDistressSurvivors() {
        if (this.save.arena) return 0;
        const pods = (this.save.player.sealedCargo ?? []).filter(item => typeof item.missionId === 'string' && item.missionId.startsWith('distress-survivor-'));
        if (!pods.length) return 0;
        const units = pods.reduce((sum, item) => sum + Math.max(0, Number(item.units) || 0), 0);
        if (units <= 0) return 0;
        const reward = units * DISTRESS_REWARD_PER_SURVIVOR;
        this.save.player.sealedCargo = this.save.player.sealedCargo.filter(item => !pods.includes(item));
        this.save.player.credits = Math.max(0, Number(this.save.player.credits) || 0) + reward;
        this.save.world.distress ??= {history: []};
        this.save.world.distress.history ??= [];
        this.save.world.distress.history.unshift({id: 'distress-survivors', variant: 'wreck', setup: 0, outcome: 'survivors-delivered', at: nowOf(this), reward});
        this.save.world.distress.history = this.save.world.distress.history.slice(0, 8);
        this.ui?.pushEvent?.(distressText([`${units} ${units === 1 ? 'Überlebender' : 'Überlebende'} abgeliefert · ${formatCredits(reward)}`, `${units} ${units === 1 ? 'survivor' : 'survivors'} delivered · ${formatCredits(reward)}`]), 'success', 5600, distressText(['Überlebende', 'Survivors']));
        this.audio?.play?.('success');
        this.persistSave?.();
        return reward;
    },

    // Deterministic entry point for the review environment and probes.
    debugStartDistress(variant, setup = 0, options = {}) {
        if (!distressVariant(variant)) return false;
        normalizeDistress(this.save.world);
        const data = this.save.world.distress;
        for (const ship of [...this.ships]) if (ship.distressActor) this.ships.splice(this.ships.indexOf(ship), 1);
        const now = nowOf(this);
        const position = options.position
            ? [...options.position]
            : offset(this.save.player.position, [options.distance ?? 240, 0, 0]);
        const active = createDistressRecord({
            counter: (data.counter ?? 0) + 1, variant, setup, seed: options.seed ?? 424242,
            position, systemId: this.save.player.systemId, instanceId: this.activeInstanceId, now,
        });
        data.counter = (data.counter ?? 0) + 1;
        const setupData = distressSetup(variant, setup);
        const targetPhase = options.phase === 'signal' ? 'signal' : options.phase === 'involved' ? 'involved' : 'discovered';
        active.survivors.total = setupData.wreck?.survivors ?? 0;
        if (options.exposed) {
            active.progress.exposed = true;
            active.progress.scanRevealed = true;
        }
        if (options.betrayed) active.progress.betrayed = true;
        if (options.deadline) active.deadline = now + options.deadline;
        data.active = active;
        data.nextAt = 0;
        if (targetPhase !== 'signal') {
            this.discoverDistress(active, now);
            if (targetPhase === 'involved') {
                active.phase = 'involved';
                active.involvedAt = now;
                active.progress.lastProgressAt = now;
                active.deadline = active.deadline || now + 240;
            }
        }
        if (options.damage) {
            for (const ship of this.ships) if (ship.distressEventId === active.id) ship.hull = Math.max(1, ship.maxHull * options.damage);
        }
        if (options.exposed) {
            active.phase = 'involved';
            active.involvedAt = active.involvedAt || now;
            for (const ship of this.ships) if (ship.distressEventId === active.id && ship.distressRole === 'pirate') {
                ship.poweredDown = false;
                ship.standingDown = false;
                ship.hostile = true;
                ship.authorizedTarget = true;
                ship.distressTargetId = 'player';
            }
            this.retargetDistress(active);
        }
        if (options.fuel !== undefined) this.save.player.fuel = options.fuel;
        if (options.cargo) this.save.player.cargo = {...options.cargo};
        if (options.parts !== undefined) this.save.player.cargo = {...(this.save.player.cargo ?? {}), machinery: options.parts};
        if (options.looted && active.variant === 'wreck') {
            for (const wreck of eventWrecks(this, active)) for (const entry of wreck.contents) entry.quantity = 0;
            for (const wreck of eventWrecks(this, active)) wreck.contents = [];
        }
        if (options.rescued) active.survivors.rescued = Math.min(active.survivors.total, options.rescued);
        this.snapshotDistressActors(active);
        this.setDistressMonitor(active);
        this.persistSave?.();
        return {id: active.id, variant, setup, phase: active.phase, position: [...position]};
    },
};
