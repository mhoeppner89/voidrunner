import * as THREE from 'three';
import { LOCATIONS, DEFAULT_NAV_LOCATION_BY_SYSTEM, sunPositionForSystem } from './data.js';
import { SHARDBELT_PASSAGES } from './asteroidRoutes.js';
import { GRAVEYARD_MODEL_WRECKS } from './graveyardLayout.js';
import { arenaSite } from './arenaSites.js';
import { requestFieldRoadmap } from './fieldRoadmap.js';

// Staging for the Arena sites (arenaSites.js): where the pilot starts and
// where opponents enter. Everything here runs once per wave, while the
// preparation screen or the countdown is up, never in the frame loop.
//
// An entry is { position, where, label }: `where` (ahead / flank / astern /
// cover / below / above) drives the reinforcement warning, `label` the arrival
// call. Opening contacts take front entries; reinforcements (a wave delay of
// REINFORCEMENT_DELAY or more, which the run announces four seconds ahead)
// prefer the flanking ones, so a second contact rarely comes from the same
// direction as the first.
const FORWARD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);
// Rock clearance around an arriving fighter.
export const ENTRY_CLEARANCE = 36;
// Never materialise an opponent on top of the pilot.
export const MIN_ENTRY_DISTANCE = 520;
export const REINFORCEMENT_DELAY = 4;
const COVER_SAMPLES = 96;
// Close enough that even a slow hull is in the fight within seconds.
const COVER_DISTANCES = [650, 850, 1050];
const COVER_MAX_DISTANCE = 1150;
// Rocks and hull sections big enough to hide a fighter behind.
const COVER_MIN_RADIUS = 40;
// Carrier hangar starts: [distance off the opening, lift, lateral], best first.
const BAY_STARTS = Object.freeze([[260, 95, 0], [330, 85, 0], [420, 100, 0], [420, 150, 0], [330, 60, 0], [520, 100, 0], [420, 0, -140], [250, 60, 0], [420, 0, 0]]);

export const ENTRY_WARNINGS = Object.freeze({
    ahead: 'Reinforcement ahead in {seconds} seconds.',
    flank: 'Reinforcement on the flank in {seconds} seconds.',
    astern: 'Reinforcement astern in {seconds} seconds.',
    cover: 'Reinforcement behind cover in {seconds} seconds.',
    below: 'Reinforcement below in {seconds} seconds.',
    above: 'Reinforcement above in {seconds} seconds.',
});

const local = (id, offset) => new THREE.Vector3(...LOCATIONS[id].position).add(new THREE.Vector3(...offset));
const passage = (id) => SHARDBELT_PASSAGES.find((entry) => entry.id === id)?.points.map((point) => local('shardbelt', point));
// Evenly spread unit directions (Fibonacci sphere): deterministic, no clumps.
const sphereDirection = (index, count, out) => {
    const y = 1 - (index + 0.5) * 2 / count, r = Math.sqrt(Math.max(0, 1 - y * y)), phi = index * 2.399963229728653;
    return out.set(Math.cos(phi) * r, y, Math.sin(phi) * r);
};
const RAY_DIRECTIONS = Object.freeze([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((d) => new THREE.Vector3(...d)));
const entry = (position, where, label, front = where !== 'astern' && where !== 'flank') => ({ position, where, label, front });

export const ArenaStagingMethods = {
    // Put the pilot at the site's start, in its system and field, and plan the
    // entry points. Returns the pose; the plan is kept on `this.arenaStage`.
    stageArenaSite(siteId) {
        const site = arenaSite(siteId), player = this.save.player;
        if (player.systemId !== site.systemId || this.renderer?.systemId !== site.systemId) {
            player.systemId = site.systemId;
            this.renderer?.setSystem?.(site.systemId);
        }
        // Activate the field first: planning needs its obstacle grid for
        // line-of-sight checks.
        if (site.instanceId) {
            player.position = [...LOCATIONS[site.instanceId].position];
            this.updateActiveInstance?.(true);
        }
        const pose = this.siteStartPose(site);
        player.position = pose.position.toArray();
        player.rotation = new THREE.Quaternion().setFromUnitVectors(FORWARD, pose.forward).toArray();
        player.navTargetId = site.instanceId ?? DEFAULT_NAV_LOCATION_BY_SYSTEM[site.systemId] ?? 'shardbelt';
        this.updateActiveInstance?.(true);
        // Start the combat roadmap now: it completes during the countdown.
        if (site.instanceId && this.activeInstanceId === site.instanceId) requestFieldRoadmap(this, player.position);
        const entries = [...(pose.entries ?? []), ...this.siteFillEntries(site, pose)];
        this.arenaStage = { siteId, entries: entries.map((item) => ({ ...item, position: item.position.toArray() })) };
        return pose;
    },

    siteStartPose(site) {
        // The field helpers reuse these class-field scratches; headless
        // harnesses build sessions without the constructor.
        for (const key of ['tmpEntryAnchor', 'tmpEntryCandidate', 'tmpEntryPreferredDirection', 'tmpEntryDirection', 'tmpEntryNormal', 'tmpEntryLocal'])
            if (!(this[key] instanceof THREE.Vector3)) this[key] = new THREE.Vector3();
        const position = new THREE.Vector3(), forward = FORWARD.clone(), entries = [];
        const obstacles = site.instanceId ? this.activeFieldObstacles(site.instanceId) : [];
        const clear = (point, clearance = ENTRY_CLEARANCE) => this.siteSpotClear(site, point, obstacles, clearance);
        // The first clear point of a list of candidates; the start pose falls
        // back to its first candidate, an entry is simply left out.
        const firstClear = (candidates, clearance) => candidates.find((point) => clear(point, clearance));
        const startAt = (candidates, clearance) => firstClear(candidates, clearance) ?? candidates[0];
        const add = (point, ...rest) => { if (point) entries.push(entry(point, ...rest)); };
        const center = site.instanceId ? new THREE.Vector3(...LOCATIONS[site.instanceId].position) : new THREE.Vector3();
        switch (site.stage) {
        case 'horizon': {
            // Face the black hole: the disk is the brightest thing in the sky
            // and the opening contacts come straight out of it.
            forward.copy(new THREE.Vector3(...sunPositionForSystem(site.systemId))).normalize();
            for (const [x, y] of [[0, 0], [-160, 60]])
                add(position.clone().addScaledVector(forward, 1150).add(new THREE.Vector3(x, y, 0)), 'ahead', 'Contact out of the glare ahead.');
            break;
        }
        case 'rim': {
            this.setFieldEntryPosition(position, site.instanceId, FORWARD);
            forward.copy(FORWARD).negate();
            break;
        }
        case 'tunnel': {
            // Inside the bore, a third of the way in. Opponents come head-on from
            // further down; reinforcements enter through the mouth behind.
            const points = passage(site.passage), start = 7;
            position.copy(points[start]);
            forward.copy(points[start + 1]).sub(points[start - 1]).normalize();
            const bore = points.slice(start + 9, start + 17).filter((point) => clear(point));
            add(bore[Math.min(2, bore.length - 1)], 'ahead', 'Contact at the far end of the tunnel.');
            if (bore.length > 1) add(bore.at(-1), 'ahead', 'Contact at the far end of the tunnel.');
            add(firstClear([points[1], points[0], points[2], points[3]]), 'astern', 'Contact entering the tunnel behind you.');
            break;
        }
        case 'mouth': {
            // Hanging off the upper mouth, facing the rock and the open shaft.
            // The opening contacts come around the rock's shoulders; a late
            // one climbs the shaft. The bore is the pilot's escape route.
            const points = passage(site.passage), mouth = points.at(-1), out = mouth.clone().sub(points.at(-2)).normalize();
            position.copy(startAt([mouth.clone().addScaledVector(out, 260), mouth.clone().addScaledVector(out, 340), mouth.clone().addScaledVector(out, 180)], this.playerSpawnClearance()));
            forward.copy(out).negate();
            add(firstClear([points.at(-10), points.at(-9), points.at(-11), points.at(-12)]), 'ahead', 'Contact coming up the shaft.', false);
            break;
        }
        case 'pocket': {
            this.setFieldArenaPosition(position, site.instanceId);
            break;
        }
        case 'bay': {
            // The open end of the carrier's hangar deck, looking down its
            // centreline. The opening contacts enter at the far end, so the
            // fight starts as a joust down the deck.
            // On the deck's centreline: the box-based entry clearance would
            // lift the pilot to the hangar ceiling, and every contact would
            // then aim up into it. The mesh decides free space here.
            const bay = this.carrierBayAxis();
            // Far enough off the opening that the dogfight after the joust happens in
            // front of the carrier, not inside its hangar walls. A torn hull plate
            // lies across the centreline about 200 off the opening, so the start
            // sits above it: the first clear spot that sees down the whole deck.
            const start = bay && this.carrierBayStart(bay, (point) => clear(point, this.playerSpawnClearance()));
            if (start) { position.copy(start); forward.copy(bay.center).sub(start).normalize(); }
            else forward.fromArray(this.setDebrisCollisionTestPosition(position));
            if (bay) {
                const far = bay.center.clone().addScaledVector(bay.axis, bay.halfLength + 12);
                const side = new THREE.Vector3().crossVectors(bay.axis, UP).normalize();
                add(firstClear([far, far.clone().addScaledVector(bay.axis, 80)]), 'ahead', 'Contact coming down the hangar deck.');
                add(firstClear([far.clone().addScaledVector(side, 70), far.clone().addScaledVector(side, -70), far.clone().addScaledVector(bay.axis, 160)]), 'ahead', 'Contact coming down the hangar deck.');
            }
            break;
        }
        case 'wreck': {
            // The battleship arrival pocket, looking at the hull. Contacts come
            // over and under it (planned as cover entries below).
            this.setMourningEntryPosition(position, FORWARD);
            const wreck = GRAVEYARD_MODEL_WRECKS.find((item) => item.id === 'concord-battleship-wreck');
            if (!wreck) break;
            const anchor = center.clone().add(new THREE.Vector3(...wreck.local));
            forward.copy(anchor).sub(position).normalize();
            // One contact over the hull, one under it: behind the midline, out
            // of sight from the start where the wreck allows it.
            const outward = forward.clone().negate(), side = new THREE.Vector3().crossVectors(outward, UP).normalize();
            for (const sign of [1, -1]) {
                let best;
                for (const height of [450, 600, 750, 900]) for (const depth of [-500, -250, 0]) for (const across of [0, 260, -260]) {
                    const point = anchor.clone().addScaledVector(UP, sign * height).addScaledVector(outward, -depth).addScaledVector(side, across);
                    if (point.distanceTo(position) < MIN_ENTRY_DISTANCE || !clear(point)) continue;
                    const hidden = this.lineBlocked?.(position, point);
                    if (hidden) { best = point; break; }
                    best ??= point;
                }
                if (best) entries.push(entry(best, sign > 0 ? 'above' : 'below', sign > 0 ? 'Contact coming over the hull.' : 'Contact coming under the hull.'));
            }
            break;
        }
        case 'lane': {
            // One end of the field's cleared lane (local Z), opponents at the
            // other: the rock walls keep the joust honest.
            position.copy(startAt([460, 520, 400, 580].map((z) => center.clone().add(new THREE.Vector3(0, 0, z))), this.playerSpawnClearance()));
            forward.set(0, 0, -1);
            for (const x of [0, 70])
                add(firstClear([-440, -500, -380, -560].map((z) => center.clone().add(new THREE.Vector3(x, 20, z)))), 'ahead', 'Contact coming down the lane.');
            break;
        }
        case 'shell': {
            // Inside the belt's rock shell, flying along it.
            const radius = LOCATIONS[site.instanceId].radius * 0.91, candidates = [];
            for (const angle of [0, 0.7, 1.4, 2.1, 2.8, 3.5, 4.2, 4.9]) for (const offset of [0, -220, 220]) {
                const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
                candidates.push(center.clone().addScaledVector(out, radius + offset));
            }
            position.copy(startAt(candidates, this.playerSpawnClearance() + 60));
            forward.crossVectors(UP, position.clone().sub(center).normalize()).normalize();
            break;
        }
        case 'sheet': {
            // Above the thin ice ring: they rise through it ahead of and below
            // the pilot; a late one climbs from under the ring behind.
            position.copy(startAt([[2300, 380, 0], [2400, 400, 120], [2200, 420, -120]].map(([x, y, z]) => center.clone().add(new THREE.Vector3(x, y, z))), this.playerSpawnClearance() + 40));
            forward.set(-0.25, -0.3, -1).normalize();
            const ice = (x, y, z) => center.clone().add(new THREE.Vector3(x, y, z));
            add(firstClear([ice(2050, 0, -1050), ice(2130, -40, -1000), ice(1970, 30, -1120), ice(2230, 0, -1080)]), 'below', 'Contact rising through the ice.');
            add(firstClear([ice(1850, -30, -980), ice(2250, 20, -1150), ice(1910, 0, -1220), ice(1790, 0, -1100)]), 'below', 'Contact rising through the ice.');
            add(firstClear([ice(2300, -480, 650), ice(2400, -440, 720), ice(2180, -520, 600)]), 'below', 'Contact climbing from under the ring.', false);
            break;
        }
        default: break; // open: the system origin, facing -Z
        }
        return { position, forward, entries };
    },

    // Entries beyond the authored ones: cover positions in fields, flanks in
    // open space, and a plain line ahead as the last resort everywhere.
    siteFillEntries(site, pose) {
        const result = [], origin = pose.position, forward = pose.forward;
        const right = new THREE.Vector3().crossVectors(forward, UP);
        if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
        right.normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();
        const at = (x, y, z) => origin.clone().addScaledVector(right, x).addScaledVector(up, y).addScaledVector(forward, -z);
        const obstacles = site.instanceId ? this.activeFieldObstacles(site.instanceId) : [];
        const clear = (point) => this.siteSpotClear(site, point, obstacles);
        // Inside a bore the authored entries are the fight; cover elsewhere in
        // the rock would put an opponent in another tunnel or outside.
        if (site.instanceId && site.stage !== 'tunnel') result.push(...this.siteCoverEntries(site, origin, forward));
        const authored = pose.entries ?? [], all = () => [...authored, ...result];
        // Every site keeps two opening entries and one flank: a plain line
        // ahead and open flanks fill in wherever the terrain offers less.
        for (const [x, y, z] of [[0, 30, -1000], [-140, 60, -1050], [140, -40, -1050], [0, 120, -1250], [-260, 0, -900], [260, 0, -900]]) {
            if (all().filter((item) => item.front).length >= 2) break;
            const point = at(x, y, z);
            if (clear(point)) result.push(entry(point, 'ahead', 'Contact ahead.'));
        }
        for (const [x, y, z, where, label] of [[-950, 140, -350, 'flank', 'Contact on the flank.'], [950, -120, -300, 'flank', 'Contact on the flank.'], [0, 380, 900, 'astern', 'Contact high astern.'], [-700, -300, 700, 'astern', 'Contact low astern.']]) {
            if (site.instanceId && all().filter((item) => !item.front).length >= 2) break;
            const point = at(x, y, z);
            if (clear(point)) result.push(entry(point, where, label));
        }
        return result;
    },

    // Points in the field that the pilot cannot see from the start: an
    // opponent there arrives from behind rock or wreckage. Front ones open the
    // wave, the rest serve as flanks for reinforcements.
    siteCoverEntries(site, origin, forward) {
        const obstacles = this.activeFieldObstacles(site.instanceId), direction = new THREE.Vector3(), picks = [];
        if (!obstacles.length) return picks;
        const candidates = [], seen = this.tmpCoverPoint ??= new THREE.Vector3();
        const consider = (point) => {
            const range = point.distanceTo(origin);
            if (range < MIN_ENTRY_DISTANCE || range > COVER_MAX_DISTANCE) return false;
            if (!this.entryPositionClear(point, obstacles, ENTRY_CLEARANCE) || !this.lineBlocked(origin, point)) return false;
            const heading = point.clone().sub(origin).normalize();
            candidates.push({ point, direction: heading, facing: heading.dot(forward) });
            return true;
        };
        // In the shadow of a large rock or hull section: sparse belts hide a
        // fighter only behind their big pieces, which sampling would miss.
        for (const obstacle of obstacles) {
            const radius = obstacle.radius ?? 0;
            if (radius < COVER_MIN_RADIUS || !Number.isFinite(obstacle.x)) continue;
            seen.set(obstacle.x, obstacle.y, obstacle.z);
            const distance = seen.distanceTo(origin);
            if (distance < 350 || distance > COVER_MAX_DISTANCE - 150) continue;
            const away = seen.clone().sub(origin).normalize();
            for (const extra of [70, 160]) if (consider(seen.clone().addScaledVector(away, Math.min(radius, 400) * 1.1 + extra))) break;
        }
        for (let index = 0; index < COVER_SAMPLES; index += 1) {
            sphereDirection(index, COVER_SAMPLES, direction);
            for (const distance of COVER_DISTANCES)
                if (consider(origin.clone().addScaledVector(direction, distance))) break;
        }
        // Front cover first (best centred), then the widest flanks; keep picks
        // at least ~35° apart so contacts never stack on one rock.
        candidates.sort((a, b) => b.facing - a.facing);
        const take = (filter, limit) => {
            for (const candidate of candidates) {
                if (picks.length >= limit) return;
                if (!filter(candidate) || picks.some((pick) => pick.direction.dot(candidate.direction) > 0.82)) continue;
                picks.push(candidate);
            }
        };
        // At a tunnel mouth or inside a belt shell, rock to the side is the
        // ambush itself: anything short of dead astern opens the wave.
        const frontLimit = site.stage === 'shell' ? -0.3 : 0.1;
        take((c) => c.facing > frontLimit, 2);
        take((c) => c.facing <= frontLimit, 4);
        return picks.map(({ point, facing }) => {
            const vertical = point.y - origin.y;
            const front = facing > frontLimit;
            if (site.stage === 'wreck') return entry(point, vertical > 0 ? 'above' : 'below', vertical > 0 ? 'Contact coming over the hull.' : 'Contact coming under the hull.', front);
            return entry(point, front ? 'cover' : 'flank', front ? 'Contact behind cover ahead.' : 'Contact behind cover on the flank.', front);
        });
    },

    // Room for a fighter at a point. The box test is conservative; the carrier
    // hangar lies inside its section's bounding box, so there the hull mesh
    // decides: short rays in six directions must not meet it.
    siteSpotClear(site, point, obstacles, clearance = ENTRY_CLEARANCE) {
        if (!obstacles.length || this.entryPositionClear(point, obstacles, clearance)) return true;
        if (site.stage !== 'bay') return false;
        const end = this.tmpSiteRay ??= new THREE.Vector3();
        return RAY_DIRECTIONS.every((direction) => !this.lineBlocked(point, end.copy(point).addScaledVector(direction, clearance * 1.5)));
    },

    // A start off the hangar's open end with a clear view down the deck.
    carrierBayStart(bay, clear) {
        const side = new THREE.Vector3().crossVectors(bay.axis, UP).normalize(), up = new THREE.Vector3().crossVectors(side, bay.axis).normalize();
        const deck = [0, 0.45, 0.9].map((share) => bay.center.clone().addScaledVector(bay.axis, bay.halfLength * share));
        for (const [out, lift, lateral] of BAY_STARTS) {
            const spot = bay.center.clone().addScaledVector(bay.axis, -(bay.halfLength + out)).addScaledVector(up, lift).addScaledVector(side, lateral);
            if (clear(spot) && deck.every((point) => !this.lineBlocked(spot, point))) return spot;
        }
        return undefined;
    },

    // The carrier hangar deck in field coordinates (see setDebrisCollisionTestPosition).
    carrierBayAxis() {
        const field = LOCATIONS['mourning-line'], wreck = GRAVEYARD_MODEL_WRECKS.find((item) => item.id === 'concord-carrier-wreck');
        if (!field || !wreck?.interior) return undefined;
        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...wreck.rotation, 'XYZ'));
        const center = new THREE.Vector3(...wreck.interior.center).multiplyScalar(wreck.scale).applyQuaternion(rotation)
            .add(new THREE.Vector3(field.position[0] + wreck.local[0], field.position[1] + wreck.local[1], field.position[2] + wreck.local[2]));
        return { center, axis: new THREE.Vector3(1, 0, 0).applyQuaternion(rotation).normalize(), halfLength: wreck.interior.halfLength * wreck.scale };
    },

    // The entry for the index-th opponent of a wave. Reinforcements prefer
    // flanking entries; any entry must be clear and well away from the pilot
    // right now. Returns { position, where, label } or undefined.
    arenaSiteEntry(index, reinforcement = false) {
        const entries = this.arenaStage?.entries;
        if (!entries?.length) return undefined;
        const player = this.save.player.position, site = arenaSite(this.arenaStage.siteId);
        const obstacles = site.instanceId ? this.activeFieldObstacles(site.instanceId) : [];
        const usable = (item) => {
            const [x, y, z] = item.position;
            if (Math.hypot(x - player[0], y - player[1], z - player[2]) < MIN_ENTRY_DISTANCE) return false;
            return this.siteSpotClear(site, new THREE.Vector3(x, y, z), obstacles);
        };
        const front = entries.filter((item) => item.front), rear = entries.filter((item) => !item.front);
        const order = reinforcement ? [rear, front] : [front, rear];
        for (const group of order) {
            for (let step = 0; step < group.length; step += 1) {
                const item = group[(index + step) % group.length];
                if (usable(item)) return item;
            }
        }
        return undefined;
    },
};
