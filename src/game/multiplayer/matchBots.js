import { Quaternion, Vector3 } from 'three';
import { SHIPS } from '../data.js';
import { HULL_HARDPOINTS, LOADOUT_KEYS } from '../outfitting.js';
import { seededRandom } from '../random.js';
import { relativeIntercept } from '../weaponFlight.js';
import { mountedGunEntries } from '../weapons.js';
import { BOT_CHARACTERS } from './botProfiles.js';

export const BOT_REFIT_SECONDS = 3;
const difficulty = {
    novice: { reaction: .31, lead: .55, error: .065, tracking: 1.65, burst: .66, evadeRange: 70, burn: false },
    veteran: { reaction: .17, lead: .87, error: .027, tracking: 2.1, burst: .81, evadeRange: 120, burn: true },
    ace: { reaction: .09, lead: 1, error: .012, tracking: 2.6, burst: .92, evadeRange: 165, burn: true },
};
const FORWARD = new Vector3(0, 0, -1);
const UP = new Vector3(0, 1, 0);
const RIGHT = new Vector3(1, 0, 0);
const BYPASS_DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 1], [-2, 1], [1, -2], [-1, -2]];
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

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

export class MatchBot {
    constructor(actor, bot, seed, arenaLimit) {
        this.actor = actor;
        this.profile = BOT_CHARACTERS[bot.characterId];
        this.skill = difficulty[bot.difficulty];
        this.phase = seededRandom(`${seed}:${actor.id}:${actor.life}`)() * Math.PI * 2;
        this.arenaLimit = arenaLimit;
        const guns = mountedGunEntries(actor);
        this.weapon = (guns.find(gun => actor.activeGroup === 'ALL' || gun.group === actor.activeGroup) ?? guns[0])?.weapon;
        this.nextPlan = 0;
        this.evadeUntil = 0;
        this.nextEvade = 0;
        this.targetId = null;
        this.fire = false;
        this.throttle = 0;
        this.burn = false;
        this.position = new Vector3();
        this.velocity = new Vector3();
        this.bearing = new Vector3();
        this.aim = new Vector3();
        this.aimSide = new Vector3();
        this.aimUp = new Vector3();
        this.heading = new Vector3();
        this.local = new Vector3();
        this.nose = new Vector3();
        this.end = new Vector3();
        this.candidate = new Vector3();
        this.side = new Vector3();
        this.up = new Vector3();
        this.inward = new Vector3();
        this.offset = new Vector3();
        this.pose = new Quaternion();
        this.command = { aimAssist: false, flightAssist: true };
    }

    actions(world, actors, time) {
        const { actor, command, pose, nose, local, skill } = this;
        pose.fromArray(actor.rotation);
        nose.copy(FORWARD).applyQuaternion(pose);
        if (time >= this.nextPlan) this.plan(world, actors, time);
        local.copy(this.heading).applyQuaternion(pose.invert());
        const pitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
        const yaw = Math.atan2(local.x, -local.z);
        const damping = actor.stats.angularDamping;
        const brake = Math.max(.15, .9 / Math.max(1, damping));
        command.pitch = clamp(pitch * skill.tracking - actor.angularVelocity[0] * brake, -1, 1);
        command.yaw = clamp(yaw * skill.tracking + actor.angularVelocity[1] * brake, -1, 1);
        command.throttleSet = this.throttle * (.30 + .70 * Math.max(0, nose.dot(this.heading)));
        command.afterburner = this.burn && command.throttleSet > .62 && actor.energy > actor.stats.energyCapacity * .28;
        command.fire = this.fire && nose.dot(this.aim) > .9995 && (time + this.phase) % 2.2 < 2.2 * skill.burst;
        command.targetId = this.targetId;
        command.missile = Boolean(this.targetId && this.visible && actor.lockProgress >= 1
            && nose.dot(this.bearing) > .91 && (time + this.phase) % 2.2 < 2.2 * skill.burst);
        return command;
    }

    plan(world, actors, time) {
        const { actor, position, velocity, bearing, aim, aimSide, aimUp, heading, nose, offset, inward, skill, profile, weapon } = this;
        this.nextPlan = time + skill.reaction;
        position.fromArray(actor.position);
        velocity.fromArray(actor.velocity);
        inward.copy(world.center).sub(position);
        const centerDistance = inward.length();
        inward.normalize();
        let target, ally, targetCost = Infinity, allyGap = Infinity;
        let visible = false, distance = Infinity;
        for (const other of actors) {
            if (other === actor || other.hull <= 0) continue;
            offset.fromArray(other.position);
            const gap = position.distanceTo(offset);
            if (actor.team && other.team === actor.team) {
                if (gap < allyGap) { ally = other; allyGap = gap; }
                continue;
            }
            const clear = !this.blocked(world, offset);
            const cost = gap + (clear ? 0 : 270) - (other.id === this.targetId ? 145 : 0);
            if (cost >= targetCost) continue;
            target = other;
            targetCost = cost;
            visible = clear;
            distance = gap;
        }
        this.targetId = target?.id ?? null;
        this.visible = false;
        this.fire = false;
        this.burn = false;
        const wingDirection = ally && allyGap > 280;
        heading.copy(wingDirection ? offset.fromArray(ally.position).sub(position).normalize() : inward);
        if (!heading.lengthSq()) heading.copy(nose);
        this.throttle = wingDirection ? .62 : 0;

        if (target) {
            bearing.fromArray(target.position).sub(position).normalize();
            heading.copy(bearing);
            const preferredRange = Math.min(profile.range, (weapon?.range ?? 420) * .74);
            aim.copy(bearing);
            if (weapon?.kind !== 'beam' && weapon?.speed) {
                const intercept = relativeIntercept(position, target.position, actor.velocity, target.velocity, weapon.speed, offset);
                if (intercept <= weapon.life) aim.lerp(offset.normalize(), skill.lead).normalize();
            }
            // Sustained tracking error produces near misses rather than hidden damage bonuses.
            aimSide.crossVectors(aim, Math.abs(aim.y) < .95 ? UP : RIGHT).normalize();
            aimUp.crossVectors(aimSide, aim).normalize();
            aim.addScaledVector(aimSide, Math.sin(time * 2 + this.phase) * skill.error)
                .addScaledVector(aimUp, Math.cos(time * 1.6 + this.phase) * skill.error * .72).normalize();
            const inRange = distance < (weapon?.range ?? 0) * .97;
            const side = Math.sin(this.phase) < 0 ? -1 : 1;
            if (visible && inRange) heading.copy(aim);
            else heading.addScaledVector(aimSide, side * profile.strafe).addScaledVector(aimUp, profile.strafe * .20).normalize();
            this.throttle = Math.min(1, profile.aggression * clamp((distance - preferredRange * .66) / preferredRange, 0, 1.12));
            this.burn = skill.burn && distance > preferredRange + 365;
            if (time >= this.nextEvade && world.combat.missiles.some(shot => shot.targetId === actor.id && !shot.lostTrack
                && position.distanceToSquared(offset.fromArray(shot.position)) < skill.evadeRange ** 2)) {
                this.evadeUntil = time + 1.05;
                this.nextEvade = time + 2.2;
            }
            const breaking = time < this.evadeUntil || distance < 68;
            if (breaking) {
                const direction = Math.sin(this.phase + Math.floor(time * .5)) < 0 ? -1 : 1;
                heading.copy(aimSide).multiplyScalar(direction).addScaledVector(bearing, -.30)
                    .addScaledVector(aimUp, direction * profile.strafe).normalize();
                this.throttle = 1;
                this.burn = skill.burn;
            }
            this.visible = visible && !this.wingInFireLine(actors, distance);
            this.fire = !breaking && this.visible && inRange;
        }

        if (centerDistance > this.arenaLimit - 220 && heading.dot(inward) < .12) {
            heading.copy(inward);
            this.fire = false;
        }
        if (world.site.instanceId && this.throttle > 0) this.avoidTerrain(world, distance);
    }

    blocked(world, point) {
        return world.site.instanceId && world.session.lineBlocked(this.position, point);
    }

    wingInFireLine(actors, distance) {
        if (!this.actor.team) return false;
        for (const other of actors) {
            if (other === this.actor || other.team !== this.actor.team || other.hull <= 0) continue;
            this.offset.fromArray(other.position).sub(this.position);
            const ahead = this.offset.dot(this.aim);
            if (ahead > 0 && ahead < distance && this.offset.lengthSq() - ahead * ahead < 18 ** 2) return true;
        }
        return false;
    }

    avoidTerrain(world, distance) {
        const { position, velocity, heading, side, up, end, candidate, offset, inward } = this;
        const speed = velocity.length();
        const lookAhead = Math.min(310, Math.max(105, speed * 2.2));
        const forwardRange = Math.min(lookAhead, Math.max(80, distance));
        const driftBlocked = speed > 10 && this.blocked(world, end.copy(position).addScaledVector(velocity, 1.05));
        side.crossVectors(heading, Math.abs(heading.y) < .95 ? UP : RIGHT).normalize();
        up.crossVectors(side, heading).normalize();
        const clear = (direction, range) => {
            end.copy(position).addScaledVector(direction, range);
            if (this.blocked(world, end)) return false;
            return !this.blocked(world, end.addScaledVector(side, 16))
                && !this.blocked(world, end.addScaledVector(side, -32));
        };
        if (!driftBlocked && clear(heading, forwardRange)) return;
        let best = -Infinity;
        for (const [x, y] of BYPASS_DIRECTIONS) {
            candidate.copy(heading).addScaledVector(side, x * .9).addScaledVector(up, y * .9).normalize();
            if (!clear(candidate, forwardRange)) continue;
            const score = candidate.dot(heading) + candidate.dot(inward) * .13 + (x > 0 ? .025 : 0) * Math.sin(this.phase);
            if (score > best) { best = score; offset.copy(candidate); }
        }
        if (best > -Infinity) heading.copy(offset);
        else heading.negate();
        this.throttle = best > -Infinity ? Math.min(this.throttle, driftBlocked ? .25 : .63) : 0;
        this.fire = false;
        this.burn = false;
    }
}
