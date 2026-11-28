import { Matrix4, Quaternion, Vector3 } from 'three';
import { aceManeuver, maneuverBank, maneuverHeading, maneuverSpeed } from '../aceManeuvers.js';
import { selectCombatFocus } from '../combatAwareness.js';
import { combatThrottle, combatTrackingRate, holdingFiringWindow, observeIncomingFire, updateCombatIntent } from '../combatPiloting.js';
import { combatPursuitDirection, friendlyFiringLaneBlocked, planCombatFlight } from '../combatPlanning.js';
import { flyFieldTactic, interruptFieldTactic } from '../combatTactics.js';
import { SHIPS } from '../data.js';
import { fieldCombatSteering } from '../fieldCombatNav.js';
import { combatRouteWaypoint } from '../fieldRoadmap.js';
import { flightTurnAxes } from '../flightDynamics.js';
import { applyNpcTurnLead, npcGunneryProfile, npcTrackedVelocity } from '../npcGunnery.js';
import { HULL_HARDPOINTS, LOADOUT_KEYS } from '../outfitting.js';
import { judgmentSpeed, pilotJudgment } from '../pilotJudgment.js';
import { rollPilot } from '../pilots.js';
import { seededRandom } from '../random.js';
import { shipVsObstacle } from '../shipCollision.js';
import { terrainCombatManeuver } from '../terrainManeuvers.js';
import { relativeIntercept } from '../weaponFlight.js';
import { mountedGunEntries, weaponRange } from '../weapons.js';
import { BOT_CHARACTERS } from './botProfiles.js';
import { hullExtents } from './matchProjectiles.js';

export const BOT_REFIT_SECONDS = 3;
const FORWARD = new Vector3(0, 0, -1);
const UP = new Vector3(0, 1, 0);
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const SEARCH_SECONDS = 8;
const SCAN_INTERVAL = { novice: .3, veteran: .2, ace: .1 };

// One role upgrade per new hull, then save for the next hull. At Tier 3
// fill out the rest of the role's fit using the same shop as human pilots.
export function refitMatchBot(match, pilot) {
    const shop = match.shopFor(pilot.id);
    if (!pilot.bot || !shop) return;
    const profile = BOT_CHARACTERS[pilot.bot.characterId];
    const tier = SHIPS[pilot.shipId].tier;
    const next = shop.hulls.find(hull => hull.id === profile.hulls[tier - 1]);
    const mounts = HULL_HARDPOINTS[pilot.shipId];
    const hasBoughtGear = LOADOUT_KEYS.some(slot => mounts[slot].some(mount => pilot.paidMounts.has(mount.id)));
    if (next && hasBoughtGear) {
        if (next.affordable) match.buyHull(pilot.id, next.id);
        return;
    }
    const fit = pilot.outfitting.loadouts[pilot.shipId];
    for (const baseId of profile.equipment) {
        const item = shop.equipment.find(offer => offer.baseId === baseId && offer.affordable);
        if (!item || LOADOUT_KEYS.some(slot => fit[slot].includes(item.id))) continue;
        const mount = item.slots.find(slot => !slot.itemId) ?? item.slots[0];
        if (match.buyEquipment(pilot.id, item.id, mount.slot, mount.index).ok) return;
    }
    if (next?.affordable) match.buyHull(pilot.id, next.id);
}

// The shared NPC planners see the authoritative match actors. The rendered
// session's player and contacts may be interpolated copies of those actors.
export class MatchBotEnvironment {
    constructor(world) {
        this.world = world;
        this.scene = world.session;
        this.activeInstanceId = world.site.instanceId;
        this.save = { world: this.scene.save.world, player: { hull: 0, dockedAt: true } };
        this.projectiles = world.combat.projectiles;
        this.ships = [];
    }

    lineBlocked(from, to, id) { return Boolean(this.activeInstanceId && this.scene.lineBlocked(from, to, id)); }
    npcHullExtents(actor) { return hullExtents(actor); }
    activeDockObstacle() { return undefined; }
    get largeSteeringObstacles() { return this.scene.largeSteeringObstacles; }
    get obstacleQueryStamp() { return this.scene.obstacleQueryStamp; }
    get fieldRoadmap() { return this.scene.fieldRoadmap; }
    set fieldRoadmap(map) { this.scene.fieldRoadmap = map; }
    forEachObstacleInBox(...args) { return this.scene.forEachObstacleInBox(...args); }
    activeFieldObstacles(id) { return this.scene.activeFieldObstacles(id); }

    npcDepartureClear(ship, position, nav) {
        nav.q.fromArray(ship.rotation);
        return !nav.obstacles.some(obstacle => shipVsObstacle(position, nav.q, ship.variant, ship.scale, obstacle, nav.departureContact));
    }

    findCoverPoint() { return undefined; }
    tacticalBark() {}
    updateTravelAI(ship, dt, destination, speed) {
        ship.botTravelGoal = destination;
        ship.botTravelSpeed = speed;
    }

    projectileCanHitShip(projectile, ship) {
        return this.world.match.canDamage(projectile.ownerId, ship.id);
    }
}

export class MatchBot {
    constructor(actor, bot, seed, arenaLimit) {
        this.actor = actor;
        const profile = BOT_CHARACTERS[bot.characterId];
        actor.aiRng = seededRandom(`${seed}:${actor.id}:${actor.life}`);
        actor.pilot = rollPilot(actor.aiRng, 0, actor.faction, { tier: bot.difficulty, temperament: profile.temperament });
        this.arenaLimit = arenaLimit;
        const guns = mountedGunEntries(actor).filter(gun => actor.activeGroup === 'ALL' || gun.group === actor.activeGroup);
        this.guns = guns;
        actor.combatFit = {
            stats: actor.stats, profile, weapons: guns.map(gun => gun.weapon.id),
            weaponDefinitions: guns.map(gun => gun.weapon), fireAt: guns.map(() => 0),
        };
        this.nextScan = 0;
        this.seenAt = -Infinity;
        this.target = null;
        this.aimPoint = [0, 0, 0];
        this.trackVelocity = [0, 0, 0];
        this.lastSeen = new Vector3();
        this.position = new Vector3();
        this.velocity = new Vector3();
        this.targetVelocity = new Vector3();
        this.bearing = new Vector3();
        this.aim = new Vector3();
        this.heading = new Vector3();
        this.travel = new Vector3();
        this.nose = new Vector3();
        this.end = new Vector3();
        this.goal = new Vector3();
        this.navHeading = new Vector3();
        this.side = new Vector3();
        this.up = new Vector3();
        this.angular = new Vector3();
        this.axes = new Vector3();
        this.pose = new Quaternion();
        this.desiredPose = new Quaternion();
        this.rollPose = new Quaternion();
        this.basis = new Matrix4();
        this.command = { aimAssist: false, gunAim: this.aim };
    }

    acquireTarget(env, time) {
        const { actor, position, end } = this;
        const current = this.target;
        let target = null, best = Infinity;
        for (const other of env.ships) {
            if (other === actor || other.faction === actor.faction || other.hull <= 0) continue;
            end.fromArray(other.position);
            const distance = position.distanceTo(end);
            const cost = distance - (other === current ? 150 : 0) - (other.id === actor.combatThreatId && time < actor.combatThreatUntil ? 100 : 0);
            if (cost >= best || env.lineBlocked(position, end, actor.id)) continue;
            target = other;
            best = cost;
        }
        actor.targetId = target?.id ?? current?.id ?? null;
        actor.patrolMemoryActive = !target;
        if (target) {
            selectCombatFocus(env, actor);
            const focus = env.ships.find(other => other.id === actor.targetId && other.hull > 0);
            this.target = focus && (focus === target || !env.lineBlocked(position, end.fromArray(focus.position), actor.id)) ? focus : target;
            actor.targetId = this.target.id;
            if (this.target !== current) this.clearTactic(env);
            this.lastSeen.fromArray(this.target.position);
            this.seenAt = time;
        } else if (!current || current.hull <= 0 || !env.ships.includes(current) || time - this.seenAt >= SEARCH_SECONDS) {
            this.clearTactic(env);
            this.target = null;
            actor.targetId = null;
        }
        this.nextScan = time + SCAN_INTERVAL[actor.pilot.tier];
    }

    clearTactic(env) {
        const { actor } = this;
        interruptFieldTactic(env, actor);
        actor.combatRoute = undefined;
        actor.aceClearanceAt = 0;
        actor.aceMove = undefined;
        actor.gunDecisionTarget = undefined;
        if (actor.combatPlan) actor.combatPlan.targetId = undefined;
        if (actor.gunAim) actor.gunAim.visible = false;
    }

    actions(env, time, dt) {
        const { actor, command, pose, nose, position, velocity, heading, goal, travel, end } = this;
        const stats = actor.stats;
        nose.copy(FORWARD).applyQuaternion(pose.fromArray(actor.rotation));
        position.fromArray(actor.position);
        velocity.fromArray(actor.velocity);
        const currentSpeed = velocity.length();
        travel.copy(currentSpeed > 0 ? velocity : nose).normalize();
        observeIncomingFire(env, actor);
        if (time >= this.nextScan || this.target && (this.target.hull <= 0 || !env.ships.includes(this.target))) this.acquireTarget(env, time);
        const target = this.target;
        actor.targetId = target?.id ?? null;
        const visible = target && !actor.patrolMemoryActive && !env.lineBlocked(position, end.fromArray(target.position), actor.id);
        actor.patrolMemoryActive = !visible;
        if (visible) {
            this.lastSeen.copy(end);
            this.seenAt = time;
        }
        command.targetId = visible ? target.id : null;
        command.fire = false;
        command.missile = false;
        let speed = stats.maxSpeed, burn = false, assisted = true, bank = 0, track = false;
        let move, nav;
        actor.botTravelGoal = null;
        if (target && flyFieldTactic(env, actor, dt)) {
            const point = actor.botTravelGoal;
            if (point.isVector3) goal.copy(point); else goal.fromArray(point);
            heading.copy(goal).sub(position).normalize();
            const stoppingSpeed = Math.sqrt(2 * stats.acceleration * Math.max(0, position.distanceTo(goal) - 25));
            speed = Math.min(actor.botTravelSpeed, stoppingSpeed);
        } else if (target) {
            const { bearing, lastSeen, targetVelocity, aim, guns } = this;
            bearing.copy(lastSeen).sub(position);
            const distance = bearing.length();
            if (distance > .001) bearing.divideScalar(distance); else bearing.copy(nose);
            if (visible) targetVelocity.fromArray(target.velocity); else targetVelocity.set(0, 0, 0);
            const closing = velocity.dot(bearing) - targetVelocity.dot(bearing);
            const fit = actor.combatFit;
            let index = guns.findIndex((gun, i) => time >= fit.fireAt[i] && distance < weaponRange(gun.weapon)
                && (!gun.weapon.ammoId || actor.ammo[gun.weapon.ammoId] > 0));
            if (index < 0) index = guns.length ? 0 : -1;
            const gun = guns[index], weapon = gun?.weapon;
            actor.fireRange = weapon ? weaponRange(weapon) : 0;
            actor.combatWeaponIndex = index;
            aim.copy(bearing);
            let canIntercept = true;
            if (weapon?.kind !== 'beam' && weapon?.speed) {
                const tracked = npcTrackedVelocity(actor, targetVelocity, end);
                const intercept = relativeIntercept(position, lastSeen.toArray(this.aimPoint), actor.velocity,
                    tracked.toArray(this.trackVelocity), weapon.speed, aim);
                canIntercept = intercept <= weapon.life;
                if (Number.isFinite(intercept) && visible) {
                    // Predict the opponent's motion while fully compensating for inherited drift.
                    aim.addScaledVector(tracked, intercept * (npcGunneryProfile(actor).lead - 1));
                    applyNpcTurnLead(actor, aim, intercept, time);
                    aim.normalize();
                } else aim.copy(bearing);
            }

            const plan = planCombatFlight(env, actor, lastSeen, targetVelocity, aim, distance, closing);
            updateCombatIntent(actor, time, distance, closing);
            const missileBreak = time < (actor.missileBreakUntil ?? 0) && !plan.recovery.active;
            goal.copy(lastSeen);
            if (missileBreak) heading.copy(actor.missileBreak);
            else if (plan.recovery.active) heading.copy(plan.recovery.direction);
            else if (plan.crossfire?.active) heading.copy(plan.crossfire.direction);
            else if (actor.combatIntent === 'reposition' && time < plan.passUntil) heading.copy(plan.passDirection);
            else if (actor.combatIntent === 'reposition' && time < plan.reapproachUntil) heading.copy(plan.reapproach);
            else if (actor.combatIntent === 'evade' && plan.escape.lengthSq() > 0) heading.copy(plan.escape);
            else if (!visible && distance < 90) {
                const sweep = (time - this.seenAt) * 1.4;
                heading.set(Math.cos(sweep), Math.sin(sweep * 1.6) * .35, Math.sin(sweep)).normalize();
                goal.copy(position).addScaledVector(heading, 200);
            } else if (visible) combatPursuitDirection(actor, lastSeen, aim, distance, heading);
            else heading.copy(bearing);

            const committed = visible && holdingFiringWindow(actor, time) && actor.combatIntent === 'hunt';
            if (committed && !missileBreak && !plan.crossfire?.active) heading.copy(aim);
            const escaping = missileBreak || plan.recovery.active || plan.crossfire?.active;
            if (escaping) goal.copy(position).addScaledVector(heading, 400);
            const route = env.activeInstanceId && !escaping && !plan.finishing
                ? combatRouteWaypoint(env, actor, position, goal, clamp(actor.fireRange * .9, 250, 700), this.navHeading)
                : undefined;
            if (route) {
                goal.copy(route);
                heading.copy(goal).sub(position).normalize();
            }
            const judgment = env.activeInstanceId && pilotJudgment(actor, time, heading, distance, closing);
            const terrainMove = !route && !missileBreak && !judgment && env.activeInstanceId
                && terrainCombatManeuver(env, actor, lastSeen, aim, heading);
            if (terrainMove) {
                goal.copy(terrainMove.waypoint);
                if (terrainMove.started === time) actor.fieldNav.until = actor.fieldNav.nextPlan = 0;
            }
            if (env.activeInstanceId) nav = fieldCombatSteering(env, actor, goal, heading, dt, heading, !route && Boolean(visible));

            if (visible && !route && !missileBreak && !plan.recovery.active && !judgment && !terrainMove) {
                if (time >= (actor.aceClearanceAt ?? 0)) {
                    actor.aceClearanceAt = time + .2;
                    actor.acePathClear = !env.lineBlocked(position, end.copy(position).addScaledVector(velocity, 1.8), actor.id);
                }
                const safe = (!nav || nav.safeForManeuver) && actor.acePathClear;
                move = aceManeuver(actor, time, distance, nose.dot(bearing), travel.dot(bearing), plan.preferredRange,
                    safe, Boolean(nav?.obstacles.length), nose.dot(aim), nose.dot(travel), closing);
                if (move) {
                    const candidate = maneuverHeading(move, time, aim, distance, plan.preferredRange, this.navHeading);
                    if (time >= actor.aceManeuverClearanceAt) {
                        actor.aceManeuverClearanceAt = time + .2;
                        actor.aceManeuverPathClear = !env.lineBlocked(position, end.copy(position).addScaledVector(candidate, Math.max(100, currentSpeed * 1.25)), actor.id);
                    }
                    if (actor.aceManeuverPathClear) {
                        heading.copy(candidate);
                        bank = maneuverBank(move, time);
                    } else {
                        aceManeuver(actor, time, distance, 0, 0, plan.preferredRange, false);
                        move = undefined;
                    }
                }
            }
            const canBoost = !nav || nav.canBoost;
            const firingPass = visible && (weapon?.id === 'gauss' || weapon?.id === 'mortar') && canIntercept
                && distance < actor.fireRange && nose.dot(aim) > .998 && actor.energy >= weapon.energyCost && time >= fit.fireAt[index];
            speed = combatThrottle(actor, time, distance, closing, targetVelocity.dot(bearing), nose.dot(bearing),
                plan.preferredRange, canBoost, nose.angleTo(heading), firingPass);
            burn = actor.burning;
            if (canBoost && (missileBreak || move?.kind === 'boost-reversal' || move?.kind === 'immelmann')) {
                burn = true;
                speed = stats.afterburnSpeed;
            }
            const maneuverThrottle = maneuverSpeed(move, time, speed, stats.maxSpeed);
            if (maneuverThrottle < speed) burn = false;
            speed = judgmentSpeed(judgment, time, maneuverThrottle, stats.maxSpeed);
            if (judgment?.kind === 'late-brake' || judgment?.kind === 'hesitate') burn = false;
            if (terrainMove) {
                speed = Math.min(speed, stats.maxSpeed * terrainMove.speedFactor);
                burn = burn && terrainMove.canBoost;
                bank += terrainMove.bank;
            }
            const flankShot = visible && time < (actor.flankShotUntil ?? 0) && actor.targetId === actor.flankShotTarget
                && !missileBreak && !route && nav?.safeForManeuver;
            if (flankShot) heading.copy(aim);
            const reversalAge = move && (time - move.started) / (move.durationScale ?? 1);
            if (flankShot || move?.kind === 'drift-pass' || move?.kind === 'boost-reversal' && reversalAge >= .65 && reversalAge < 2.4
                || committed && !judgment && !terrainMove && !plan.overshoot && (!nav || nav.safeForManeuver)
                    && Math.abs(velocity.dot(bearing)) < currentSpeed * .85) {
                assisted = false;
                speed = 0;
                burn = false;
            }
            const attack = visible && !route && !missileBreak && !plan.recovery.active && !actor.fieldTactic?.kind;
            command.fire = Boolean(attack && gun && canIntercept && distance < actor.fireRange
                && time >= (actor.energyRecoverUntil ?? 0)
                && nose.dot(aim) > .92
                && !env.lineBlocked(position, end.copy(position).addScaledVector(aim, distance), actor.id)
                && !friendlyFiringLaneBlocked(env, actor, position, aim, distance));
            command.gunIndex = gun?.index;
            command.missile = Boolean(attack && actor.lockProgress >= 1 && distance > 80 && nose.dot(bearing) > .9
                && !friendlyFiringLaneBlocked(env, actor, position, bearing, distance));
            track = visible && !nav?.active && !route && !missileBreak && !move && !terrainMove && !judgment
                && actor.combatIntent === 'hunt';
        } else {
            goal.copy(env.world.center);
            heading.copy(goal).sub(position).normalize();
            speed *= .7;
        }

        // Enforce the same arena perimeter even during a break or search.
        const inward = end.copy(env.world.center).sub(position);
        if (inward.lengthSq() > (this.arenaLimit - 210) ** 2 && heading.dot(inward.normalize()) < .2) {
            heading.copy(inward);
            goal.copy(env.world.center);
            nav = undefined;
            command.fire = command.missile = false;
            burn = false;
            assisted = true;
            track = false;
            speed = stats.maxSpeed * .8;
        }
        if (env.activeInstanceId && !nav) nav = fieldCombatSteering(env, actor, goal, heading, dt, heading, false);
        if (nav) {
            speed = Math.min(speed, nav.speedLimit);
            burn = burn && nav.canBoost;
            bank += nav.bank;
        }
        if (heading.lengthSq() < 1e-6) heading.copy(nose);
        const turnSign = Math.sign(this.side.crossVectors(heading, nose).y);
        bank += turnSign * Math.min(1.2, nose.angleTo(heading)) * .45;
        this.side.crossVectors(heading, UP);
        if (this.side.lengthSq() < 1e-6) this.side.set(1, 0, 0); else this.side.normalize();
        this.up.crossVectors(this.side, heading).normalize();
        this.desiredPose.setFromRotationMatrix(this.basis.makeBasis(this.side, this.up, end.copy(heading).negate()));
        this.desiredPose.multiply(this.rollPose.setFromAxisAngle(FORWARD, bank));
        const tracking = track ? combatTrackingRate(actor, pose, this.desiredPose, dt) : undefined;
        if (!track && actor.flightTracking) {
            actor.flightTracking.previous.copy(this.desiredPose);
            actor.flightTracking.world.set(0, 0, 0);
        }
        flightTurnAxes(pose, this.angular.fromArray(actor.angularVelocity), this.desiredPose, stats, assisted, burn,
            tracking, actor.pilot.tier === 'ace' ? 3.6 : 1, this.axes);
        command.pitch = clamp(this.axes.x, -1, 1);
        command.yaw = clamp(-this.axes.y, -1, 1);
        command.roll = clamp(-this.axes.z, -1, 1);
        command.afterburner = actor.burning = Boolean(burn);
        const ceiling = burn && actor.energy > 0 && currentSpeed >= stats.maxSpeed * .9 ? stats.afterburnSpeed : stats.maxSpeed;
        command.throttleSet = clamp(speed / ceiling, 0, 1);
        command.flightAssist = assisted;
        return command;
    }
}
