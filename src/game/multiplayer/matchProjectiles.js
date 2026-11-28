import { Vector3 } from 'three';
import { SHIP_COLLIDERS } from '../shipCollision.js';
import { closestHullPoint, guideMissile, MISSILE_PADDING } from '../weaponFlight.js';
import { applyPilotWeaponHit } from './combatDamage.js';
import { traceMatchShot } from './shotTrace.js';

const start = new Vector3(), end = new Vector3(), velocity = new Vector3();
const offset = new Vector3(), targetVelocity = new Vector3(), impact = new Vector3();
const blastOrigin = new Vector3(), surface = new Vector3();
const relativeStart = new Vector3(), relativeMotion = new Vector3();

// The public projectile carries only values needed by a client. Keep references
// to this firing life and this target life out of network snapshots.
const sources = new WeakMap();
export function hullExtents(actor) {
    const extent = (SHIP_COLLIDERS[actor.variant] ?? SHIP_COLLIDERS.kestrel).extent;
    return actor.scale === undefined || actor.scale === 1 ? extent : extent.map(n => n * actor.scale);
}

export function fireMatchRound(combat, owner, weapon, mountId, muzzle, direction, target, options = {}) {
    const position = muzzle.toArray();
    const launcher = weapon.category === 'launcher';
    const shot = {
        id: 'p-' + ++combat.serial, slot: combat.projectiles.length, ownerId: owner.id, targetId: target?.id,
        weaponId: weapon.id, mountId, kind: launcher ? 'missile' : weapon.kind,
        hitWeapon: weapon,
        damage: options.damage ?? weapon.damageFlat ?? weapon.damage, tint: weapon.tint,
        life: weapon.life, position, velocity: velocity.copy(direction).multiplyScalar(weapon.speed)
            .add(targetVelocity.fromArray(owner.velocity)).toArray(),
    };
    if (launcher) Object.assign(shot, {
        launcherId: weapon.id, homingSpeed: weapon.homingSpeed, homingTurn: weapon.homingTurn,
        acceleration: weapon.acceleration, shield: weapon.projectileShield, salvo: options.salvo,
        volleyIndex: options.volleyIndex, lostTrack: false,
    });
    sources.set(shot, { owner, weapon, target, pierce: weapon.pierce ?? 0 });
    combat.projectiles.push(shot);
    return shot;
}

function queueHit(combat, owner, target, weapon, amount, position, splash = false) {
    combat.hits.push({ owner, target, weapon, amount, position, splash });
}

export function fireMatchBeam(combat, owner, weapon, mountId, muzzle, direction) {
    end.copy(muzzle).addScaledVector(direction, weapon.range);
    const hit = traceMatchShot(muzzle, end, owner, combat.actors, combat);
    if (hit) end.lerpVectors(muzzle, end, hit.t);
    const position = muzzle.toArray(), endpoint = end.toArray();
    combat.events.push({ type: 'beam', ownerId: owner.id, weaponId: weapon.id, mountId,
        kind: weapon.kind, position, end: endpoint, targetId: hit?.actor?.id, tint: weapon.tint });
    if (hit?.actor) queueHit(combat, owner, hit.actor, weapon, weapon.damageFlat, endpoint);
}

function splashDamage(combat, source, directTarget) {
    const { owner, weapon } = source;
    const radius = weapon.splashRadius;
    if (!(radius > 0)) return;
    blastOrigin.copy(impact).addScaledVector(velocity, -.2 / Math.max(1, velocity.length()));
    for (const target of combat.actors) {
        if (target === directTarget || target.hull <= 0 || !combat.canHit(owner, target)) continue;
        closestHullPoint(impact, target, hullExtents(target), surface);
        const distance = surface.distanceTo(impact);
        if (distance >= radius || combat.terrainHit?.(blastOrigin, surface)) continue;
        const minimum = weapon.splashMin ?? 0, maximum = weapon.splashDamage ?? weapon.damage;
        queueHit(combat, owner, target, weapon, maximum + (minimum - maximum) * distance / radius, surface.toArray(), true);
    }
}

// Relative-motion sweep against ordnance. All guided rounds have already
// advanced, so interceptor insertion order cannot change a crossing hit.
function ordnanceHit(from, to, missile, radius) {
    relativeStart.copy(from).sub(offset.fromArray(missile.previousPosition));
    relativeMotion.copy(to).sub(offset.fromArray(missile.position)).sub(relativeStart);
    const c = relativeStart.lengthSq() - radius * radius;
    if (c <= 0) return 0;
    const a = relativeMotion.lengthSq(), b = relativeStart.dot(relativeMotion);
    const discriminant = b * b - a * c;
    if (a === 0 || b >= 0 || discriminant < 0) return;
    const t = (-b - Math.sqrt(discriminant)) / a;
    if (t >= 0 && t <= 1) return t;
}

function advanceOrdnance(combat, shot, source, dt) {
    const { target } = source;
    start.fromArray(shot.position);
    start.toArray(shot.previousPosition ??= []);
    velocity.fromArray(shot.velocity);
    if (!shot.lostTrack) {
        shot.lostTrack = !target || target.hull <= 0 || !combat.actors.includes(target)
            || !guideMissile(velocity, offset.fromArray(target.position).sub(start), source.guidance,
                dt, targetVelocity.fromArray(target.velocity), target.rotation);
    }
    velocity.toArray(shot.velocity);
    start.addScaledVector(velocity, dt).toArray(shot.position);
}

function traceProjectile(combat, shot, source, from, to) {
    const hit = traceMatchShot(from, to, source.owner, combat.actors, {
        canHit: combat.canHit, terrainHit: combat.terrainHit, skipId: source.lastHitId,
        padding: shot.launcherId ? MISSILE_PADDING : .12,
    });
    if (shot.launcherId) return hit;
    let nearest = hit;
    for (const missile of combat.missiles) {
        if (missile.life <= 0 || shot.ownerId === missile.ownerId) continue;
        const assigned = missile === shot.targetMissile;
        if (!assigned && missile.launcherId !== 'torpedo') continue;
        if (!combat.canHit(sources.get(missile).owner, source.owner)) continue;
        const t = ordnanceHit(from, to, missile, assigned ? 1.6 : 3);
        if (t !== undefined && t < (nearest?.t ?? Infinity)) nearest = { t, missile };
    }
    return nearest;
}

function sweepProjectile(combat, shot, dt) {
    const source = sources.get(shot);
    const seconds = Math.min(dt, shot.life);
    start.fromArray(shot.previousPosition ?? shot.position);
    velocity.fromArray(shot.velocity);
    end.copy(start).addScaledVector(velocity, seconds);
    shot.life -= seconds;
    for (;;) {
        const hit = traceProjectile(combat, shot, source, start, end);
        if (!hit) {
            end.toArray(shot.position);
            return;
        }
        impact.lerpVectors(start, end, hit.t);
        const position = impact.toArray();
        combat.events.push({ type: 'impact', ownerId: shot.ownerId, weaponId: shot.weaponId,
            kind: shot.kind, projectileId: shot.id, targetId: hit.actor?.id ?? hit.missile?.id, position });
        if (hit.missile) {
            if (hit.missile.shield > 0) hit.missile.shield = Math.max(0, hit.missile.shield - shot.damage);
            else hit.missile.life = 0;
        } else {
            if (hit.actor) queueHit(combat, source.owner, hit.actor, source.weapon, shot.damage, position);
            splashDamage(combat, source, hit.actor);
        }
        if (!hit.actor || source.pierce <= 0) {
            shot.life = 0;
            return;
        }
        --source.pierce;
        source.lastHitId = hit.actor.id;
        start.copy(impact);
    }
}

export function resolveMatchFire(combat, dt) {
    combat.missiles.length = 0;
    for (const shot of combat.projectiles) {
        if (!shot.launcherId || shot.life <= 0) continue;
        const source = sources.get(shot);
        source.guidance ??= { hitWeapon: source.weapon, homingSpeed: shot.homingSpeed,
            homingTurn: shot.homingTurn, acceleration: shot.acceleration };
        advanceOrdnance(combat, shot, source, Math.min(shot.life, dt));
        combat.missiles.push(shot);
    }
    // A defender can destroy a warhead during its approach.
    for (const shot of combat.projectiles) if (!shot.launcherId && shot.life > 0) sweepProjectile(combat, shot, dt);
    for (const shot of combat.missiles) if (shot.life > 0) sweepProjectile(combat, shot, dt);
    let count = 0;
    for (const shot of combat.projectiles) if (shot.life > 0) {
        shot.slot = count;
        combat.projectiles[count++] = shot;
    }
    combat.projectiles.length = count;

    for (const { owner, target, weapon, amount, position, splash } of combat.hits) {
        const damage = applyPilotWeaponHit(target, amount, weapon, combat.time);
        if (!(damage.shield > 0 || damage.hull > 0)) continue;
        combat.events.push({ type: 'hit', ownerId: owner.id, ownerShipId: owner.shipId, ownerLife: owner.life,
            targetId: target.id, targetLife: target.life,
            weaponId: weapon.id, position, splash, ...damage });
        if (!splash && weapon.siphon > 0 && owner.hull > 0) owner.energy = Math.min(owner.stats.energyCapacity,
            owner.energy + weapon.energyCost * weapon.siphon / (weapon.pellets ?? 1));
    }
    combat.hits.length = 0;
}
