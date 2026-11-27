import { Quaternion, Vector3 } from 'three';
import { arenaSite } from '../arenaSites.js';
import { SHIP_COLLIDERS, shipVsObstacle, shipVsShip } from '../shipCollision.js';
import { GRAVEYARD_MODEL_COLLIDER_MAX_RADIUS } from '../worldData.js';
import { activeLauncherMagazine } from '../weapons.js';
import { applyPilotWeaponHit } from './combatDamage.js';
import { createMatchCombat, initPilotCombat, stepMatchCombat } from './matchCombat.js';
import { stepPilotFlight } from './pilotFlight.js';
import { acceptPilotInput, createPilotInput, takePilotActions } from './pilotInput.js';

export const MATCH_STEP = 1 / 60;
export const ARENA_LIMIT = 1700;
const FIELD_REACH = Math.max(380, Math.ceil(GRAVEYARD_MODEL_COLLIDER_MAX_RADIUS + 4));
const FORWARD = new Vector3(0, 0, -1);
const ENVIRONMENT = Object.freeze({});

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
        this.combat = createMatchCombat({
            seed: match.seed,
            terrainHit: (from, to) => this.site.instanceId ? session.firstObstacleHitInfo(from, to) : undefined,
            canHit: (shooter, target) => match.canDamage(shooter.id, target.id),
        });
        this.spawnOptions = this.makeSpawnOptions();
    }

    makeSpawnOptions() {
        const { center, session, site } = this;
        const entries = (session.arenaStage?.entries ?? []).map(entry => new Vector3().fromArray(entry.position));
        const options = [center.clone(), ...entries];
        this.landmarkStarts = ['tunnel', 'bay'].includes(site.stage)
            ? options.filter(point => point.distanceToSquared(center) < (ARENA_LIMIT - 80) ** 2)
            : [];
        // Give open sites symmetric starts and add extra clear points at
        // crowded sites for respawns away from the current fight.
        const obstacles = site.instanceId ? session.activeFieldObstacles(site.instanceId) : [];
        for (const radius of [430, 640, 800]) {
            for (let i = 0; i < 8; i++) {
                const angle = (i + .5) * Math.PI / 4;
                const point = center.clone().add(new Vector3(Math.cos(angle) * radius, (i % 2 - .5) * 120, Math.sin(angle) * radius));
                if (session.siteSpotClear(site, point, obstacles)) options.push(point);
            }
        }
        return options.filter(point => point.distanceToSquared(center) < (ARENA_LIMIT - 80) ** 2);
    }

    spawn(actor) {
        const others = this.actors().filter(other => other !== actor && this.inputs.has(other.id));
        let point;
        let bestCandidate;
        let best = -Infinity;
        const seat = this.match.players.get(actor.id).slot;
        const obstacles = this.site.instanceId ? this.session.activeFieldObstacles(this.site.instanceId) : [];
        if (actor.life === 1) {
            point = this.landmarkStarts.find(candidate => this.session.siteSpotClear(this.site, candidate, obstacles)
                && others.every(other => this.position.fromArray(other.position).distanceToSquared(candidate) >= 190 ** 2));
        }
        for (let i = 0; !point && i < this.spawnOptions.length; i++) {
            const candidate = this.spawnOptions[(i + seat * 5) % this.spawnOptions.length];
            if (!this.session.siteSpotClear(this.site, candidate, obstacles)) continue;
            const separation = Math.min(800, ...others.map(other => this.position.fromArray(other.position).distanceTo(candidate)));
            // Prioritize a safe distance from other ships and keep the next
            // engagement within reach of the center.
            const score = separation - Math.abs(candidate.distanceTo(this.center) - 360) * .32;
            if (score > best) {
                bestCandidate = candidate;
                best = score;
            }
        }
        point ??= bestCandidate ?? this.center;
        point.toArray(actor.position);
        this.normal.copy(this.center).sub(point);
        if (this.normal.lengthSq() < 1) this.normal.copy(FORWARD);
        this.rotation.setFromUnitVectors(FORWARD, this.normal.normalize()).toArray(actor.rotation);
        actor.scale = 1;
        initPilotCombat(actor);
        // Continue rejecting stale packets across respawns and accept input
        // only with the life number of this actor.
        this.inputs.set(actor.id, createPilotInput());
    }

    actors() {
        return [...this.match.players.values()].filter(pilot => pilot.alive && pilot.actor).map(pilot => pilot.actor);
    }

    receiveInput(id, packet) {
        const actor = this.match.players.get(id)?.actor;
        const input = this.inputs.get(id);
        if (!input || !actor || packet?.life !== actor.life) return;
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
            this.publish(ended);
        }
    }

    step() {
        this.tick++;
        const time = this.tick * MATCH_STEP;
        this.session.save.world.time = time;
        this.session.renderer.updateWorld(MATCH_STEP);
        const actors = this.actors();
        const actions = new Map();
        for (const actor of actors) {
            const input = this.inputs.get(actor.id);
            if (!input) continue;
            const command = takePilotActions(input, this.tick);
            actions.set(actor.id, command);
            stepPilotFlight(actor, actor.stats, command, MATCH_STEP);
            this.resolveTerrain(actor, time);
        }
        this.resolveShipContacts(actors, time);
        const events = stepMatchCombat(this.combat, actors.filter(actor => actor.hull > 0), actions, time, MATCH_STEP);
        for (const event of events) {
            if (event.killed) this.recordDeath(event.targetId, event.ownerId, event.targetLife);
            this.events.push(event);
        }
    }

    flushEvents() {
        if (!this.events.length) return;
        const events = this.events.splice(0);
        this.onEvents(events);
    }

    recordDeath(victimId, killerId, victimLife) {
        const result = this.match.recordDeath(victimId, killerId, { victimLife, round: this.match.round });
        if (!result?.ok) return;
        this.inputs.delete(victimId);
        this.events.push({
            type: 'death', targetId: victimId, ownerId: result.killerId, points: result.points,
            credits: result.credits, position: [...result.actor.position],
        });
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
                position.addScaledVector(normal, contact.depth + .04);
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
                const separation = contact.depth * .5 + .04;
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
            const pilot = this.match.players.get(actor.id), rack = activeLauncherMagazine(actor);
            return {
                id: actor.id, name: pilot.name, team: pilot.team, life: actor.life,
                shipId: actor.shipId, variant: actor.variant, scale: actor.scale,
                position: [...actor.position], rotation: [...actor.rotation],
                velocity: [...actor.velocity], angularVelocity: [...actor.angularVelocity],
                throttle: actor.throttle, afterburning: actor.afterburning,
                shield: actor.shield, maxShield: actor.stats.shield, hull: actor.hull, maxHull: actor.stats.hull,
                energy: actor.energy, weaponId: actor.weaponId, group: actor.activeGroup, missiles: actor.missiles,
                targetId: actor.targetId, lockProgress: actor.lockProgress ?? 0,
                rack: rack ? { mountId: rack.mount.id, rounds: rack.rounds } : undefined,
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
