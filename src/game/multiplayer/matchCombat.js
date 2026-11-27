import { Quaternion, Vector3 } from 'three';
import { spendEnergy } from '../combatResources.js';
import { seededRandom } from '../random.js';
import { SHIP_MOUNT_ANCHORS } from '../shipMounts.js';
import { disruptionFactor } from '../weaponDamage.js';
import { rackLockProgress, relativeIntercept, torpedoMobilityFactor } from '../weaponFlight.js';
import { mountedGunEntries, mountedLauncherEntries, weaponAssistCone, weaponForSlot } from '../weapons.js';
import { stepPilotRecovery } from './combatDamage.js';
import { fireMatchBeam, fireMatchRound, resolveMatchFire } from './matchProjectiles.js';
import { createTurretSession, stepPilotTurrets } from './matchTurrets.js';

const rotation = new Quaternion(), targetRotation = new Quaternion();
const center = new Vector3(), nose = new Vector3(), right = new Vector3(), up = new Vector3();
const muzzle = new Vector3(), direction = new Vector3(), lane = new Vector3(), origin = new Vector3();
const bearing = new Vector3(), lead = new Vector3(), targetNose = new Vector3();
const gunAnchor = [0, -.6, -2.8], rackAnchor = [0, -.6, -1.8];
const lives = new WeakMap();

export function createMatchCombat({ seed = 1, terrainHit, canHit = () => true, aimAssist = true } = {}) {
    const combat = { terrainHit, canHit, aimAssist, random: seededRandom(seed), serial: 0,
        projectiles: [], missiles: [], hits: [], events: [], actors: [], time: 0 };
    combat.turrets = createTurretSession(combat);
    return combat;
}

// Call on a fresh actor built from createPilotFitting. Snapshot clients see
// the selections and progress. Only the authority owns individual mount clocks.
export function initPilotCombat(actor) {
    const fit = actor.outfitting.loadouts[actor.shipId];
    const guns = mountedGunEntries(actor);
    const racks = mountedLauncherEntries(actor);
    const groups = fit.fireGroups;
    const rates = { A: 0, B: 0 };
    for (const gun of guns) rates[gun.group] += 1 / gun.weapon.cooldown;
    lives.set(actor, {
        guns, racks, groups, rates, groupAt: { A: 0, B: 0 }, readyAt: {}, counts: {},
        locks: new Map(), target: null, nextGun: 0, switchAt: 0,
        hasTurrets: fit.turrets.some(Boolean),
    });
    actor.targetId = null;
    actor.lockProgress = 0;
    actor.activeGroup = groups.activeGroup;
    delete actor.turretRuntime;
    return actor;
}

function updateSelection(actor, life, actions) {
    if (actions.targetId !== undefined) actor.targetId = actions.targetId;
    const { guns, racks, groups } = life;
    let group = groups.activeGroup;
    if (actions.weaponSelect) {
        const id = weaponForSlot(actions.weaponSelect)?.id;
        group = guns.find(entry => entry.weaponId === id)?.group ?? group;
    }
    if (actions.weaponCycle && guns.length) {
        const choices = ['A', 'B'].filter(id => guns.some(gun => gun.group === id));
        choices.push('ALL');
        group = choices[(choices.indexOf(group) + 1) % choices.length];
    }
    if (actions.launcherCycle && racks.length) {
        const index = racks.findIndex(rack => rack.mount.id === actor.activeLauncherMountId);
        actor.activeLauncherMountId = racks[(index + 1) % racks.length].mount.id;
    }
    if (group === groups.activeGroup) return false;
    actor.activeGroup = groups.activeGroup = group;
    actor.weaponId = guns.find(gun => group === 'ALL' || gun.group === group)?.weaponId;
    return true;
}

function aimedDirection(combat, actor, target, weapon) {
    direction.copy(nose);
    const assist = actor.stats.assistMultiplier ?? 1;
    if (!target || !combat.aimAssist || (!actor.aimAssist && assist <= 1)) return;
    const cone = weaponAssistCone(weapon) * assist;
    if (weapon.kind === 'beam') {
        lead.fromArray(target.position).sub(center);
        if (lead.lengthSq() <= weapon.range ** 2 && direction.angleTo(lead) < cone)
            direction.fromArray(target.position).sub(muzzle).normalize();
        return;
    }
    const time = relativeIntercept(center, target.position, actor.velocity, target.velocity, weapon.speed, lead);
    if (!Number.isFinite(time) || time > weapon.life) return;
    const distance = lead.length();
    lead.normalize();
    if (direction.angleTo(lead) < cone) direction.lerp(lead, Math.min(.9, .34 * assist)).normalize();
    direction.multiplyScalar(distance).add(center).sub(muzzle).normalize();
}

function fireGun(combat, actor, target, entry, life) {
    const { mount, weapon, index } = entry;
    muzzle.fromArray(SHIP_MOUNT_ANCHORS[actor.shipId]?.guns[index] ?? gunAnchor)
        .multiplyScalar(actor.scale ?? 1).applyQuaternion(rotation).add(center);
    aimedDirection(combat, actor, target, weapon);
    if (weapon.kind === 'beam') {
        fireMatchBeam(combat, actor, weapon, mount.id, muzzle, direction);
        return;
    }
    combat.events.push({ type: 'shot', ownerId: actor.id, targetId: target?.id, weaponId: weapon.id,
        kind: weapon.kind, mountId: mount.id, position: muzzle.toArray(), tint: weapon.tint });
    const pellets = weapon.pellets ?? 1;
    for (let i = 0; i < pellets; i++) {
        lane.copy(direction);
        if (weapon.spreadRad) {
            const angle = combat.random() * 2 * Math.PI;
            const radius = ((combat.random() + combat.random() + combat.random()) / 1.5 - 1) * weapon.spreadRad;
            lane.addScaledVector(right, Math.cos(angle) * radius).addScaledVector(up, Math.sin(angle) * radius).normalize();
        }
        origin.copy(muzzle);
        if (pellets > 1 || weapon.kind === 'pdc') origin.addScaledVector(lane, .35);
        let damage = weapon.damageFlat;
        if (weapon.critEvery) {
            life.counts[mount.id] = (life.counts[mount.id] ?? 0) + 1;
            if (life.counts[mount.id] % weapon.critEvery === 0) damage *= weapon.critMultiplier ?? 2;
        }
        fireMatchRound(combat, actor, weapon, mount.id, origin, lane, target, { damage });
    }
}

function fireGuns(combat, actor, life, target, factor) {
    const { guns, groups, readyAt } = life;
    if (life.switchAt > combat.time) return;
    const start = life.nextGun;
    for (let offset = 0; offset < guns.length; offset++) {
        const index = (start + offset) % guns.length;
        const entry = guns[index], group = entry.group, weapon = entry.weapon;
        if (groups.activeGroup !== 'ALL' && group !== groups.activeGroup) continue;
        if (combat.time < (readyAt[entry.mount.id] ?? 0)) continue;
        const alternating = groups.firingModes[group] === 'alternating';
        if (alternating && combat.time < life.groupAt[group]) continue;
        if (weapon.ammoId && !(actor.ammo[weapon.ammoId] > 0)) continue;
        if (!spendEnergy(actor, weapon.energyCost * factor)) { life.nextGun = index; break; }
        fireGun(combat, actor, target, entry, life);
        if (weapon.ammoId) actor.ammo[weapon.ammoId]--;
        readyAt[entry.mount.id] = combat.time + weapon.cooldown * factor;
        if (alternating) life.groupAt[group] = combat.time + factor / life.rates[group];
        life.nextGun = (index + 1) % guns.length;
    }
}

function updateLocks(combat, actor, life, target, dt) {
    actor.lockProgress = 0;
    if (life.target !== target) life.locks.clear();
    life.target = target;
    if (!target || !life.racks.length) return;
    bearing.fromArray(target.position);
    if (combat.terrainHit?.(center, bearing)) { life.locks.clear(); return; }
    bearing.sub(center);
    const distance = bearing.length();
    if (distance === 0) { life.locks.clear(); return; }
    bearing.divideScalar(distance);
    targetNose.set(0, 0, -1).applyQuaternion(targetRotation.fromArray(target.rotation));
    const alignment = nose.dot(bearing), aspect = targetNose.dot(bearing);
    let together = Infinity;
    for (const { mount, launcher } of life.racks) {
        const id = mount.id, selected = id === actor.activeLauncherMountId;
        if (!actor.launcherMagazines[id].rounds || (!selected && actor.launcherFireMode === 'single')) {
            life.locks.delete(id);
            continue;
        }
        const mobility = torpedoMobilityFactor(launcher, actor.velocity, target.velocity, bearing, distance);
        const previous = life.locks.get(id) ?? 0;
        const progress = rackLockProgress(previous, launcher, null, distance, alignment, aspect, dt, mobility);
        life.locks.set(id, progress);
        if (selected) actor.lockProgress = progress;
        if (actor.launcherFireMode === 'together' && distance <= launcher.lockRange && combat.time >= (life.readyAt[id] ?? 0))
            together = Math.min(together, progress);
    }
    if (actor.launcherFireMode === 'together') actor.lockProgress = Number.isFinite(together) ? together : 0;
    return distance;
}

function launchRack(combat, actor, target, entry, salvo) {
    const { launcher, index, mount } = entry;
    muzzle.fromArray(SHIP_MOUNT_ANCHORS[actor.shipId]?.launchers[index] ?? rackAnchor)
        .multiplyScalar(actor.scale ?? 1).applyQuaternion(rotation).add(center);
    combat.events.push({ type: 'shot', ownerId: actor.id, targetId: target.id, weaponId: launcher.id,
        kind: 'missile', mountId: mount.id, position: muzzle.toArray(), salvo, tint: launcher.tint });
    const count = launcher.volley ?? 1;
    for (let i = 0; i < count; i++) {
        const angle = (i + .5) * 2 * Math.PI / count;
        const x = Math.cos(angle), y = Math.sin(angle);
        lane.copy(nose).addScaledVector(right, x * launcher.spreadRad).addScaledVector(up, y * launcher.spreadRad).normalize();
        origin.copy(muzzle).addScaledVector(lane, .45);
        if (count > 1) origin.addScaledVector(right, x * .65).addScaledVector(up, y * .4);
        fireMatchRound(combat, actor, launcher, mount.id, origin, lane, target, { salvo, volleyIndex: i });
    }
}

function fireRacks(combat, actor, life, target, distance, factor) {
    const racks = life.racks, mode = actor.launcherFireMode;
    const first = racks.findIndex(rack => rack.mount.id === actor.activeLauncherMountId);
    if (first < 0) return;
    const ready = [];
    for (let i = 0; i < (mode === 'single' ? 1 : racks.length); i++) {
        const index = (first + i) % racks.length, rack = racks[index], id = rack.mount.id;
        if (!actor.launcherMagazines[id].rounds || distance > rack.launcher.lockRange || combat.time < (life.readyAt[id] ?? 0)) continue;
        if (life.locks.get(id) !== 1) {
            if (mode === 'together') return;
            continue;
        }
        ready.push(index);
        if (mode !== 'together') break;
    }
    const salvo = combat.serial + 1;
    for (const index of ready) {
        const rack = racks[index], id = rack.mount.id;
        if (!spendEnergy(actor, rack.launcher.energyCost * factor)) continue;
        launchRack(combat, actor, target, rack, salvo);
        actor.launcherMagazines[id].rounds--;
        actor.missiles--;
        life.readyAt[id] = combat.time + rack.launcher.cooldown * factor;
        if (mode === 'alternating') actor.activeLauncherMountId = racks[(index + 1) % racks.length].mount.id;
    }
}

// Sample all live triggers at the same simulation time. Resolving hits after
// every pilot has fired lets two opponents trade lethal shots on the same tick.
export function stepMatchCombat(combat, actors, actions, time, dt) {
    combat.events = [];
    combat.actors = actors;
    combat.time = time;
    for (const actor of actors) {
        if (actor.hull <= 0) continue;
        const life = lives.get(actor);
        const input = actions.get(actor.id) ?? {};
        actor.aimAssist = input.aimAssist !== false;
        stepPilotRecovery(actor, actor.stats, dt);
        if (updateSelection(actor, life, input)) life.switchAt = time + .12;
        const target = actors.find(other => other.id === actor.targetId && other !== actor
            && other.hull > 0 && combat.canHit(actor, other));
        if (!target) actor.targetId = null;
        center.fromArray(actor.position);
        rotation.fromArray(actor.rotation);
        nose.set(0, 0, -1).applyQuaternion(rotation);
        right.set(1, 0, 0).applyQuaternion(rotation);
        up.set(0, 1, 0).applyQuaternion(rotation);
        const distance = updateLocks(combat, actor, life, target, dt);
        const factor = disruptionFactor(actor, time);
        if (input.missile && target && distance !== undefined) fireRacks(combat, actor, life, target, distance, factor);
        if (input.fire) fireGuns(combat, actor, life, target, factor);
        if (life.hasTurrets) stepPilotTurrets(combat, actor, target, dt);
    }
    resolveMatchFire(combat, dt);
    return combat.events;
}
