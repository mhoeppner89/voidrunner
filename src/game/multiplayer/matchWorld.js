import { Quaternion, Vector3 } from 'three';
import { arenaSite } from '../arenaSites.js';
import { advanceCoverSearches, interruptFieldTactic } from '../combatTactics.js';
import { SHIPS } from '../data.js';
import { advanceFieldRoadmap } from '../fieldRoadmap.js';
import { registerHitReaction } from '../flightDynamics.js';
import { seededRandom } from '../random.js';
import { SHIP_COLLIDERS, shipVsObstacle, shipVsShip } from '../shipCollision.js';
import { GRAVEYARD_MODEL_COLLIDER_MAX_RADIUS } from '../worldData.js';
import { applyPilotWeaponHit } from './combatDamage.js';
import { BOT_REFIT_SECONDS, MatchBot, MatchBotEnvironment, refitMatchBot } from './matchBots.js';
import { createMatchCombat, initPilotCombat, stepMatchCombat } from './matchCombat.js';
import { stepPilotFlight } from './pilotFlight.js';
import { acceptPilotInput, createPilotInput, takePilotActions } from './pilotInput.js';

export const MATCH_STEP = 1 / 60;
export const ARENA_LIMIT = 1700;
const FIELD_REACH = Math.max(380, Math.ceil(GRAVEYARD_MODEL_COLLIDER_MAX_RADIUS + 4));
const FORWARD = new Vector3(0, 0, -1);
const ENVIRONMENT = Object.freeze({});
const SPAWN_COVER_RANGE = 1050;
const SPAWN_ENEMY_GAP = 430;
const SPAWN_WEAPON_RANGE = 650;
const SPAWN_WING_DISTANCE = 270;

function contactRadius(actor) {
    return (SHIP_COLLIDERS[actor.variant] ?? SHIP_COLLIDERS.kestrel).contactRadius * (actor.scale ?? 1);
}

export class MatchWorld {
    constructor(match, session, onEvents, publish) {
        this.match = match;
        this.session = session;
        this.onEvents = onEvents;
        this.publish = publish;
        this.tick = 0;
        this.accumulator = 0;
        this.inputs = new Map();
        this.bots = new Map();
        this.botRespawns = new Map();
        this.rosterDirty = false;
        this.site = arenaSite(match.settings.siteId);
        this.center = new Vector3().fromArray(session.save.player.position);
        this.position = new Vector3();
        this.otherPosition = new Vector3();
        this.velocity = new Vector3();
        this.rotation = new Quaternion();
        this.otherRotation = new Quaternion();
        this.normal = new Vector3();
        this.contact = {};
        this.events = [];
        this.spawnRandom = seededRandom(`${match.seed}:${match.round}:${match.settings.siteId}`);
        this.lastSpawn = new Map();
        this.lastDeath = new Map();
        this.combat = createMatchCombat({
            seed: match.seed,
            terrainHit: (from, to) => this.site.instanceId ? session.firstObstacleHitInfo(from, to) : undefined,
            canHit: (shooter, target) => match.canDamage(shooter.id, target.id),
        });
        this.spawnOptions = this.makeSpawnOptions();
    }

    makeSpawnOptions() {
        const { center, session } = this;
        const entries = (session.arenaStage?.entries ?? []).map(entry => new Vector3().fromArray(entry.position));
        const options = [center.clone(), ...entries];
        for (const radius of [350, 550, 800, 1050, 1300]) {
            const offset = this.spawnRandom() * Math.PI * 2;
            for (let i = 0; i < 12; i++) {
                const angle = offset + i * Math.PI / 6;
                const elevation = (i % 3 - 1) * .24 + (this.spawnRandom() - .5) * .16;
                options.push(center.clone().add(new Vector3(Math.cos(angle) * radius, elevation * radius, Math.sin(angle) * radius)));
            }
        }
        return options;
    }

    chooseSpawn(actor) {
        const others = this.actors().filter(other => other.id !== actor.id && this.inputs.has(other.id));
        const allies = [], enemies = [];
        const radius = contactRadius(actor);
        for (const other of others) {
            const position = new Vector3().fromArray(other.position);
            const projected = position.clone().addScaledVector(new Vector3().fromArray(other.velocity), .75);
            const pilot = { position, projected, gap: radius + contactRadius(other) + 32 };
            (actor.team && actor.team === other.team ? allies : enemies).push(pilot);
        }
        const avoidSpawn = this.lastSpawn.get(actor.id);
        const avoidDeath = this.lastDeath.get(actor.id);
        const occupied = [...allies, ...enemies];
        let bestCandidate;
        let bestDanger = Infinity;
        let best = -Infinity;
        const obstacles = this.site.instanceId ? this.session.activeFieldObstacles(this.site.instanceId) : [];
        const blocked = (from, to) => this.site.instanceId && this.session.lineBlocked(from, to);
        for (const candidate of this.spawnOptions) {
            const centerDistance = candidate.distanceTo(this.center);
            if (centerDistance > ARENA_LIMIT - Math.max(80, radius)) continue;
            if (occupied.some(pilot => candidate.distanceToSquared(pilot.position) < pilot.gap ** 2)) continue;
            if (!this.session.siteSpotClear(this.site, candidate, obstacles, Math.max(36, radius + 12))) continue;

            let nearestEnemy = Infinity, nearestVisible = Infinity;
            for (const enemy of enemies) {
                const distance = candidate.distanceTo(enemy.position);
                nearestEnemy = Math.min(nearestEnemy, distance, candidate.distanceTo(enemy.projected));
                if (distance <= SPAWN_COVER_RANGE && !blocked(enemy.position, candidate))
                    nearestVisible = Math.min(nearestVisible, distance);
            }
            // An ally or a recent-spawn preference cannot draw a pilot into a
            // worse threat band. Cover matters even when distances are similar.
            const danger = nearestEnemy < SPAWN_ENEMY_GAP ? 2 : nearestVisible < SPAWN_WEAPON_RANGE ? 1 : 0;
            if (danger > bestDanger) continue;
            const wingDistance = Math.min(...allies.map(ally => candidate.distanceTo(ally.position)));
            const score = Math.min(nearestEnemy, 950) * .42 + Math.min(nearestVisible, SPAWN_COVER_RANGE) * .35
                - (allies.length ? Math.abs(Math.min(wingDistance, 1600) - SPAWN_WING_DISTANCE) * .36 : 0)
                - Math.abs(centerDistance - 590) * .20
                - (avoidSpawn ? Math.max(0, 520 - candidate.distanceTo(avoidSpawn)) * .58 : 0)
                - (avoidDeath ? Math.max(0, 520 - candidate.distanceTo(avoidDeath)) * .45 : 0)
                + this.spawnRandom() * 95;
            if (danger < bestDanger || score > best) {
                bestCandidate = candidate;
                bestDanger = danger;
                best = score;
            }
        }
        return bestCandidate;
    }

    spawn(actor, point = this.chooseSpawn(actor)) {
        if (!point) return false;
        this.lastSpawn.set(actor.id, point);
        point.toArray(actor.position);
        this.normal.copy(this.center).sub(point);
        if (this.normal.lengthSq() < 1) this.normal.copy(FORWARD);
        this.rotation.setFromUnitVectors(FORWARD, this.normal.normalize()).toArray(actor.rotation);
        actor.scale = 1;
        actor.faction = actor.team || actor.id;
        actor.speed = actor.stats.maxSpeed;
        actor.afterburnSpeed = actor.stats.afterburnSpeed;
        actor.maxHull = actor.stats.hull;
        actor.maxShield = actor.stats.shield;
        initPilotCombat(actor);
        const bot = this.match.players.get(actor.id)?.bot;
        if (bot) {
            this.botEnvironment ??= new MatchBotEnvironment(this);
            this.bots.set(actor.id, new MatchBot(actor, bot, `${this.match.seed}:${this.match.round}`, ARENA_LIMIT));
        }
        // Continue rejecting stale packets across respawns and accept input
        // only with the life number of this actor.
        this.inputs.set(actor.id, createPilotInput());
        return true;
    }

    actors() {
        return [...this.match.players.values()].filter(pilot => pilot.alive && pilot.actor).map(pilot => pilot.actor);
    }

    receiveInput(id, packet) {
        const actor = this.match.players.get(id)?.actor;
        const input = this.inputs.get(id);
        if (!input || !actor || this.bots.has(id) || packet?.life !== actor.life) return;
        acceptPilotInput(input, packet, this.tick);
    }

    advance(seconds) {
        if (this.match.phase !== 'playing' || !(seconds > 0) || !Number.isFinite(seconds)) return;
        const previousBatch = Math.floor(this.tick / 3);
        this.accumulator = Math.min(this.accumulator + Math.min(seconds, this.match.remainingSeconds), MATCH_STEP * 6);
        while (this.accumulator >= MATCH_STEP && this.match.phase === 'playing') {
            this.accumulator -= MATCH_STEP;
            this.step();
        }
        const ended = this.match.tick(seconds);
        if (ended || Math.floor(this.tick / 3) !== previousBatch) {
            this.flushEvents();
            const force = ended || this.rosterDirty;
            this.rosterDirty = false;
            this.publish(force);
        }
    }

    step() {
        this.tick++;
        const time = this.tick * MATCH_STEP;
        this.session.save.world.time = time;
        this.session.renderer.updateWorld(MATCH_STEP);
        if (this.botRespawns.size) this.relaunchBots(time);
        const actors = this.actors();
        if (this.bots.size) {
            this.botEnvironment.ships = actors;
            if (this.site.instanceId) advanceFieldRoadmap(this.session, 2);
            advanceCoverSearches(this.botEnvironment);
        }
        const actions = new Map();
        for (const actor of actors) {
            const input = this.inputs.get(actor.id);
            if (!input) continue;
            const command = this.bots.get(actor.id)?.actions(this.botEnvironment, time, MATCH_STEP) ?? takePilotActions(input, this.tick);
            actions.set(actor.id, command);
            stepPilotFlight(actor, actor.stats, command, MATCH_STEP);
            this.resolveTerrain(actor, time);
        }
        this.resolveShipContacts(actors, time);
        const events = stepMatchCombat(this.combat, actors.filter(actor => actor.hull > 0), actions, time, MATCH_STEP);
        for (const event of events) {
            const bot = event.type === 'hit' && this.bots.get(event.targetId)?.actor;
            if (bot && !event.killed && event.ownerId) {
                bot.combatThreatId = event.ownerId;
                bot.combatThreatUntil = time + 2;
                registerHitReaction(bot, time, event.shield + event.hull);
            }
            if (event.killed) this.recordDeath(event.targetId, event.ownerId, event.targetLife, event.ownerLife);
            this.events.push(event);
        }
    }

    flushEvents() {
        if (!this.events.length) return;
        const events = this.events.splice(0);
        this.onEvents(events);
    }

    recordDeath(victimId, killerId, victimLife, killerLife) {
        const result = this.match.recordDeath(victimId, killerId, { victimLife, killerLife, round: this.match.round });
        if (!result?.ok) return;
        this.inputs.delete(victimId);
        if (this.bots.delete(victimId)) {
            interruptFieldTactic(this.botEnvironment, result.actor);
            this.botRespawns.set(victimId, { due: this.tick * MATCH_STEP + BOT_REFIT_SECONDS });
        }
        this.lastDeath.set(victimId, new Vector3().fromArray(result.actor.position));
        this.events.push({
            type: 'death', targetId: victimId, ownerId: result.killerId, points: result.points,
            credits: result.credits, position: [...result.actor.position],
            variant: result.actor.variant, rotation: [...result.actor.rotation], velocity: [...result.actor.velocity],
        });
    }

    relaunchBots(time) {
        for (const [id, respawn] of this.botRespawns) {
            if (time < respawn.due) continue;
            const pilot = this.match.players.get(id);
            if (!pilot?.bot || !this.match.canRefit(pilot)) {
                this.botRespawns.delete(id);
                continue;
            }
            if (!respawn.refitted) {
                refitMatchBot(this.match, pilot);
                respawn.refitted = true;
            }
            const point = this.chooseSpawn({ id, team: pilot.team, variant: SHIPS[pilot.shipId].variant });
            if (!point) {
                respawn.due = time + .5;
                continue;
            }
            this.spawn(this.match.respawn(id).actor, point);
            this.botRespawns.delete(id);
            this.rosterDirty = true;
        }
    }

    resolveTerrain(actor, time) {
        const { position, velocity, rotation, normal, contact } = this;
        position.fromArray(actor.position);
        velocity.fromArray(actor.velocity);
        rotation.fromArray(actor.rotation);
        let damage = 0;
        if (this.site.instanceId) {
            const reach = contactRadius(actor);
            this.session.forEachHullObstacle(position, FIELD_REACH + reach, reach, obstacle => {
                if (!shipVsObstacle(position, rotation, actor.variant, actor.scale, obstacle, contact)) return;
                normal.set(contact.x, contact.y, contact.z);
                if (actor.fieldNav) {
                    actor.combatBumpAt = time;
                    actor.fieldNav.contactNormal.copy(normal);
                }
                position.addScaledVector(normal, contact.push + .04);
                const inward = -velocity.dot(normal);
                if (inward > 0) velocity.addScaledVector(normal, inward * 1.5);
                damage = Math.max(damage, Math.min(actor.stats.hull / 4, (inward - 3) * 1.65));
            });
        }
        normal.copy(position).sub(this.center);
        const distance = normal.length();
        if (distance > ARENA_LIMIT) {
            normal.multiplyScalar(1 / distance);
            position.addScaledVector(normal, ARENA_LIMIT - distance);
            velocity.addScaledVector(normal, -Math.max(0, velocity.dot(normal)) * 1.5);
        }
        position.toArray(actor.position);
        velocity.toArray(actor.velocity);
        if (damage > 0) this.collisionDamage(actor, damage, null, time);
    }

    resolveShipContacts(actors, time) {
        const { position, otherPosition, rotation, otherRotation, normal, contact } = this;
        for (let i = 0; i < actors.length; i++) {
            const a = actors[i];
            if (a.hull <= 0) continue;
            for (let j = i + 1; j < actors.length; j++) {
                const b = actors[j];
                if (a.hull <= 0 || b.hull <= 0) continue;
                position.fromArray(a.position);
                otherPosition.fromArray(b.position);
                if (position.distanceToSquared(otherPosition) > (contactRadius(a) + contactRadius(b)) ** 2) continue;
                rotation.fromArray(a.rotation);
                otherRotation.fromArray(b.rotation);
                if (!shipVsShip(position, rotation, a.variant, a.scale, otherPosition, otherRotation, b.variant, b.scale, contact)) continue;
                normal.set(contact.x, contact.y, contact.z);
                const separation = contact.push * .5 + .04;
                position.addScaledVector(normal, separation).toArray(a.position);
                otherPosition.addScaledVector(normal, -separation).toArray(b.position);
                const closing = this.velocity.fromArray(b.velocity).sub(this.otherPosition.fromArray(a.velocity)).dot(normal);
                if (closing <= 0) continue;
                this.velocity.fromArray(a.velocity).addScaledVector(normal, closing * .65).toArray(a.velocity);
                this.velocity.fromArray(b.velocity).addScaledVector(normal, -closing * .65).toArray(b.velocity);
                if (closing > 6) {
                    const damage = (closing - 6) * .85;
                    if (this.match.canDamage(a.id, b.id) === true) {
                        this.collisionDamage(a, Math.min(damage, a.stats.hull / 4), b.id, time);
                        this.collisionDamage(b, Math.min(damage, b.stats.hull / 4), a.id, time);
                    }
                }
            }
        }
    }

    collisionDamage(actor, damage, ownerId, time) {
        const applied = applyPilotWeaponHit(actor, damage, ENVIRONMENT, time);
        this.events.push({ type: 'hit', targetId: actor.id, ownerId, position: [...actor.position], ...applied });
        if (applied.killed) this.recordDeath(actor.id, ownerId);
    }

    snapshot() {
        const actors = this.actors().map(actor => {
            const pilot = this.match.players.get(actor.id);
            const mountId = actor.activeLauncherMountId;
            const rack = actor.launcherMagazines[mountId];
            return {
                id: actor.id, name: pilot.name, team: pilot.team, life: actor.life,
                shipId: actor.shipId, variant: actor.variant, scale: actor.scale,
                position: [...actor.position], rotation: [...actor.rotation],
                velocity: [...actor.velocity], angularVelocity: [...actor.angularVelocity],
                throttle: actor.throttle, afterburning: actor.afterburning,
                shield: actor.shield, maxShield: actor.stats.shield, hull: actor.hull, maxHull: actor.stats.hull,
                energy: actor.energy, weaponId: actor.weaponId, group: actor.activeGroup, missiles: actor.missiles,
                targetId: actor.targetId, lockProgress: actor.lockProgress ?? 0,
                rack: rack ? { mountId, rounds: rack.rounds } : undefined,
            };
        });
        const projectiles = this.combat.projectiles.map(shot => ({
            id: shot.id, ownerId: shot.ownerId, targetId: shot.targetId, kind: shot.kind,
            weaponId: shot.weaponId, launcherId: shot.launcherId, position: Array.from(shot.position),
            velocity: Array.from(shot.velocity), life: shot.life, tint: shot.tint, salvo: shot.salvo, lostTrack: shot.lostTrack,
        }));
        return { tick: this.tick, remainingSeconds: this.match.remainingSeconds, actors, projectiles };
    }

    fittingFor(id) {
        const actor = this.match.players.get(id)?.actor;
        if (actor) return { life: actor.life, outfitting: actor.outfitting };
    }
}
