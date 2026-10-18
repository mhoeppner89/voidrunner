import {RACE_HULLS,raceHull} from './raceHulls.js';
import {updateRacePilot} from './racePilot.js';
import { LOCATIONS, SHIPS } from './data.js';
import { t } from './i18n.js';
import { seededRandom } from './random.js';
import {createRaceDrive,stepRaceDrive,raceDraft,raceBoostLayout,collectRaceStabilizer,sweptBoostHit} from './raceDynamics.js';
import { MOURNING_RACE_LAYOUTS } from './graveyardRacing.js';
import {SHARD_RACE_LAYOUTS} from './asteroidRoutes.js';

export const RACE_QUEST_ID = 'bar-circuit';

// Race layouts are authored in local field coordinates. The first point is a
// gathering point; every following point is a mandatory checkpoint. Keeping
// the points here (rather than deriving them from a seed) makes the six routes
// learnable and lets the field artists reserve the same safe corridors in the
// world generator.
const authoredCourse = (config) => Object.freeze({
    ...config,
    gateRadius: config.gateRadius * 1.4,
    finishRadius: config.finishRadius * 1.4,
    checkpointSpacing: config.checkpointSpacing * 1.2,
    localPoints: Object.freeze(config.localPoints.map((point) => Object.freeze([...point]))),
    shortcuts: Object.freeze((config.shortcuts ?? []).map((entry) => Object.freeze({
        ...entry,
        gates: Object.freeze(entry.gates.map((gate) => Object.freeze({
            localPosition: Object.freeze([...gate.localPosition]),
            radius: gate.radius,
        }))),
    }))),
    rivalPaces: Object.freeze([...config.rivalPaces]),
});

// Shared physical racing lines, also used to reserve debris clearance and
// draw the review. Checkpoints follow rounded bends instead of sharp corners.
const {carrier,breach,gauntlet} = MOURNING_RACE_LAYOUTS;

// The payout ladder is intentionally steep enough that a pilot can buy a
// faster hull with race winnings. Mourning Line starts at a higher tier: its
// tight wreck corridors are not intended to be competitive in a Wayfarer.
export const RACE_COURSES = Object.freeze({
    'shard-gauntlet': authoredCourse({
        id: 'shard-gauntlet',
        title: 'Shard Gauntlet',
        zone: 'shardbelt',
        origin: 'helix',
        tier: 1,
        unlock: null,
        difficulty: 'standard',
        issuer: 'Helix Pit Boss',
        entryFee: 500,
        payouts: Object.freeze([4200, 1600, -300, -800]),
        deadlineSeconds: 900,
        tunnelCourse: true,
        gateRadius: 80,
        racerLaneWidth: 6,
        checkpointSpacing: 250,
        finishRadius: 110,
        targetTimeSeconds: 40,
        target: '28–45 seconds',
        targetText: 'Rival times: ~29 / 37 / 42 seconds',
        recommendedShip: 'R-class loaner',
        recommendedShipText: 'Choose a race hull',
        centerFuelReward: .5,
        rivalPaces: [42, 44, 46],
        racerSpeed: 44,
        localPoints: SHARD_RACE_LAYOUTS['shard-gauntlet'].points,
        shortcuts: [],
        briefing: SHARD_RACE_LAYOUTS['shard-gauntlet'].description,
    }),
    'shard-switchback': authoredCourse({
        id: 'shard-switchback',
        title: 'Shard Switchback',
        zone: 'shardbelt',
        origin: 'helix',
        tier: 2,
        unlock: { courseId: 'shard-gauntlet', rankAtMost: 2 },
        difficulty: 'advanced',
        issuer: 'Helix Pit Boss',
        entryFee: 900,
        payouts: Object.freeze([7800, 3200, -500, -1200]),
        deadlineSeconds: 900,
        tunnelCourse: true,
        gateRadius: 80,
        racerLaneWidth: 6,
        checkpointSpacing: 250,
        finishRadius: 110,
        targetTimeSeconds: 43,
        target: '35–55 seconds',
        targetText: 'Rival times: ~36 / 45 / 55 seconds',
        recommendedShip: 'R-class loaner',
        recommendedShipText: 'Choose a race hull',
        centerFuelReward: .5,
        rivalPaces: [48, 50, 52],
        racerSpeed: 50,
        localPoints: SHARD_RACE_LAYOUTS['shard-switchback'].points,
        shortcuts: [],
        briefing: SHARD_RACE_LAYOUTS['shard-switchback'].description,
    }),
    'shard-miners-knife': authoredCourse({
        id: 'shard-miners-knife',
        title: "Miner's Knife",
        zone: 'shardbelt',
        origin: 'helix',
        tier: 3,
        unlock: { courseId: 'shard-switchback', rankAtMost: 2 },
        difficulty: 'expert',
        issuer: 'Helix Pit Boss',
        entryFee: 1500,
        payouts: Object.freeze([14000, 5600, -900, -2200]),
        deadlineSeconds: 900,
        tunnelCourse: true,
        gateRadius: 80,
        racerLaneWidth: 6,
        checkpointSpacing: 250,
        finishRadius: 110,
        targetTimeSeconds: 70,
        target: '56–90 seconds',
        targetText: 'Rival times: ~58 / 74 / 90 seconds',
        recommendedShip: 'R-class loaner',
        recommendedShipText: 'Choose a race hull',
        centerFuelReward: .3,
        rivalPaces: [56, 58, 60],
        racerSpeed: 58,
        localPoints: SHARD_RACE_LAYOUTS['shard-miners-knife'].points,
        shortcuts: [],
        briefing: SHARD_RACE_LAYOUTS['shard-miners-knife'].description,
    }),
    'mourning-run': authoredCourse({
        id: 'mourning-run',
        title: 'Mourning Run',
        zone: 'mourning-line',
        origin: 'cairn',
        tier: 1,
        unlock: null,
        difficulty: 'advanced',
        issuer: 'Cairn Race Steward',
        entryFee: 1800,
        payouts: Object.freeze([14000, 5600, -1200, -3200]),
        deadlineSeconds: 900,
        gateRadius: 100,
        racerLaneWidth: 12,
        checkpointSpacing: 300,
        finishRadius: 128,
        targetTimeSeconds: 50,
        target: '40–60 seconds',
        targetText: 'Rival times: ~39 / 48 / 61 seconds',
        recommendedShip: 'R-class loaner',
        recommendedShipText: 'Choose a race hull',
        centerFuelReward: .65,
        rivalPaces: [80, 83, 86],
        racerSpeed: 83,
        localPoints: carrier.points,
        shortcuts: [],
        briefing: 'Descend into the carrier hangar, pass the torn bow and skim the nearby frigate. Follow the carrier flank and drive before turning through its break debris.',
    }),
    'mourning-breach': authoredCourse({
        id: 'mourning-breach',
        title: 'Breach Crossing',
        zone: 'mourning-line',
        origin: 'cairn',
        tier: 2,
        unlock: { courseId: 'mourning-run', rankAtMost: 2 },
        difficulty: 'hard',
        issuer: 'Cairn Race Steward',
        entryFee: 3000,
        payouts: Object.freeze([24000, 9600, -1800, -5200]),
        deadlineSeconds: 900,
        gateRadius: 84,
        racerLaneWidth: 18,
        checkpointSpacing: 300,
        finishRadius: 108,
        targetTimeSeconds: 60,
        target: '50–70 seconds',
        targetText: 'Rival times: ~47 / 55 / 68 seconds',
        recommendedShip: 'R-class loaner',
        recommendedShipText: 'Choose a race hull',
        centerFuelReward: .65,
        rivalPaces: [86, 90, 94],
        racerSpeed: 90,
        localPoints: breach.points,
        shortcuts: [],
        briefing: 'Cross the battleship’s forward fracture, descend into its spine and leave through the aft break. Stay close around the drive and keel, then finish through the bow debris cloud.',
    }),
    'mourning-relict-gauntlet': authoredCourse({
        id: 'mourning-relict-gauntlet',
        title: 'Relict Gauntlet',
        zone: 'mourning-line',
        origin: 'cairn',
        tier: 3,
        unlock: { courseId: 'mourning-breach', rankAtMost: 2 },
        difficulty: 'expert',
        issuer: 'Cairn Race Steward',
        entryFee: 5000,
        payouts: Object.freeze([42000, 16800, -3000, -9000]),
        deadlineSeconds: 900,
        gateRadius: 68,
        racerLaneWidth: 8.5,
        checkpointSpacing: 300,
        finishRadius: 92,
        targetTimeSeconds: 105,
        target: '90–120 seconds',
        targetText: 'Rival times: ~106 / 118 / 129 seconds',
        recommendedShip: 'R-class loaner',
        recommendedShipText: 'Choose a race hull',
        centerFuelReward: .4,
        rivalPaces: [92, 97, 101],
        racerSpeed: 97,
        localPoints: gauntlet.points,
        shortcuts: [],
        briefing: 'Follow the carrier fracture, escort wrecks and the broadside cruiser’s interior. Cross the port debris cloud, skim the battleship’s broken hull and weave past two more frigates before the final cruiser break.',
    }),
});

const SHARD_RACE_IDS = Object.freeze(['shard-gauntlet', 'shard-switchback', 'shard-miners-knife']);
const MOURNING_RACE_IDS = Object.freeze(['mourning-run', 'mourning-breach', 'mourning-relict-gauntlet']);

// The old singular helper remains intentionally compatible with callers that
// only know about the first race at a dock. New boards use the plural helper.
export const raceOffersForLocation = (locationId) => {
    if (locationId === 'helix' || locationId === 'shardbelt')
        return [...SHARD_RACE_IDS];
    if (locationId === 'cairn' || locationId === 'mourning-line')
        return [...MOURNING_RACE_IDS];
    return [];
};

export const raceOfferForLocation = (locationId) => raceOffersForLocation(locationId)[0];

const finite = (value) => Number.isFinite(value) ? value : undefined;
const integerAtLeast = (value, fallback = 0) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
// Preserve gate indexes when a shortcut bypasses one or more mandatory gates.
// Compacting sparse arrays would compare a later shortcut split against the
// wrong gate on the next run. JSON stores the deliberate gaps as null.
const copySplits = (splits) => Array.isArray(splits)
    ? Array.from(splits, (value) => Number.isFinite(value) ? value : null)
    : undefined;

const pointComponent = (point, index) => Array.isArray(point) || ArrayBuffer.isView(point)
    ? (Number.isFinite(point[index]) ? point[index] : 0)
    : Number.isFinite(point?.[['x', 'y', 'z'][index]]) ? point[['x', 'y', 'z'][index]] : 0;

const writePoint = (out, x, y, z) => {
    if (Array.isArray(out) || ArrayBuffer.isView(out)) {
        out[0] = x;
        out[1] = y;
        out[2] = z;
    }
    else if (out) {
        out.x = x;
        out.y = y;
        out.z = z;
        // Some allocation-free callers use a tiny object that exposes both
        // named and numeric coordinates. Keep both views in sync.
        if (typeof out === 'object' && (0 in out || 1 in out || 2 in out)) {
            out[0] = x;
            out[1] = y;
            out[2] = z;
        }
    }
    return out;
};

const normalizeVector = (x, y, z, out, fallbackX = 0, fallbackY = 0, fallbackZ = 1) => {
    const length = Math.hypot(x, y, z);
    if (length < 1e-8) {
        out[0] = fallbackX;
        out[1] = fallbackY;
        out[2] = fallbackZ;
        return out;
    }
    out[0] = x / length;
    out[1] = y / length;
    out[2] = z / length;
    return out;
};

const directionBetween = (from, to, out) => normalizeVector(
    pointComponent(to, 0) - pointComponent(from, 0),
    pointComponent(to, 1) - pointComponent(from, 1),
    pointComponent(to, 2) - pointComponent(from, 2),
    out,
);

// Keep race records deliberately small and serializable. In particular, no
// replay/ghost/champion fields are copied from untrusted or old save data.
export const normalizeRaceRecord = (record) => {
    const source = record && typeof record === 'object' ? record : {};
    const normalized = {
        active: Boolean(source.active),
        attempts: integerAtLeast(source.attempts),
        failed: Boolean(source.failed),
    };
    const rank = finite(source.rank);
    const time = finite(source.time);
    const at = finite(source.at);
    const bestRank = finite(source.bestRank);
    const bestTime = finite(source.bestTime);
    const lastRank = finite(source.lastRank);
    const lastTime = finite(source.lastTime);
    const lastAt = finite(source.lastAt);
    const bestSplits = copySplits(source.bestSplits);
    const lastSplits = copySplits(source.lastSplits);
    if (rank !== undefined)
        normalized.rank = rank;
    if (time !== undefined)
        normalized.time = time;
    if (at !== undefined)
        normalized.at = at;
    if (bestRank !== undefined || rank !== undefined)
        normalized.bestRank = Math.min(bestRank ?? Infinity, rank ?? Infinity);
    if (bestTime !== undefined || time !== undefined)
        normalized.bestTime = Math.min(bestTime ?? Infinity, time ?? Infinity);
    if (bestSplits)
        normalized.bestSplits = bestSplits;
    else if (source.splits && (bestTime !== undefined || time !== undefined))
        normalized.bestSplits = copySplits(source.splits);
    if (lastRank !== undefined)
        normalized.lastRank = lastRank;
    if (lastTime !== undefined)
        normalized.lastTime = lastTime;
    if (lastAt !== undefined)
        normalized.lastAt = lastAt;
    if (lastSplits)
        normalized.lastSplits = lastSplits;
    if (source.lastFailed !== undefined)
        normalized.lastFailed = Boolean(source.lastFailed);
    return normalized;
};

// Record one terminal attempt (including a failed attempt), retaining the
// legacy rank/time/at fields while accumulating personal-best data.
export const recordRaceResult = (record, result = {}) => {
    const previous = normalizeRaceRecord(record);
    const outcome = result && typeof result === 'object' ? result : {};
    const rank = finite(outcome.rank);
    const time = finite(outcome.time);
    const at = finite(outcome.at ?? outcome.worldTime);
    const splits = copySplits(outcome.splits);
    const failed = Boolean(outcome.failed);
    const next = {
        ...previous,
        active: outcome.active === true,
        attempts: previous.attempts + 1,
        failed,
    };
    if (rank !== undefined)
        next.rank = rank;
    if (time !== undefined)
        next.time = time;
    if (at !== undefined)
        next.at = at;
    if (rank !== undefined || time !== undefined || at !== undefined || splits) {
        if (rank !== undefined)
            next.lastRank = rank;
        if (time !== undefined)
            next.lastTime = time;
        if (at !== undefined)
            next.lastAt = at;
        if (splits)
            next.lastSplits = splits;
        next.lastFailed = failed;
    }
    if (!failed) {
        if (rank !== undefined)
            next.bestRank = Math.min(previous.bestRank ?? Infinity, rank);
        if (time !== undefined) {
            const isNewBest = previous.bestTime === undefined || time < previous.bestTime;
            next.bestTime = Math.min(previous.bestTime ?? Infinity, time);
            if (isNewBest && splits)
                next.bestSplits = [...splits];
        }
        else if (previous.bestTime !== undefined)
            next.bestTime = previous.bestTime;
        if (next.bestRank === Infinity)
            delete next.bestRank;
        if (next.bestTime === Infinity)
            delete next.bestTime;
    }
    return next;
};

const recordsFrom = (value) => value?.world?.raceRecords ?? value?.raceRecords ?? value ?? {};

export const raceCourseUnlocked = (courseId, recordsOrSave) => {
    const course = RACE_COURSES[courseId];
    if (!course)
        return false;
    if (!course.unlock)
        return true;
    const records = recordsFrom(recordsOrSave);
    const prerequisite = normalizeRaceRecord(records?.[course.unlock.courseId]);
    return Number.isFinite(prerequisite.bestRank) && prerequisite.bestRank <= course.unlock.rankAtMost;
};

const localToWorld = (local, center) => [
    center[0] + local[0],
    center[1] + local[1],
    center[2] + local[2],
];

const normalizeCourseShortcut = (course, config, mainGates) => {
    const gates = [];
    for (let index = 0; index < config.gates.length; index += 1) {
        const rawGate = config.gates[index];
        const localPosition = [...rawGate.localPosition];
        const position = localToWorld(localPosition, course.center);
        const previous = index === 0
            ? config.entryIndex > 0
                ? mainGates[Math.min(config.entryIndex - 1, mainGates.length - 1)]?.position
                : course.gatheringPosition
            : gates[index - 1].position;
        const next = index === config.gates.length - 1
            ? mainGates[Math.min(config.exitIndex, mainGates.length - 1)]?.position
            : localToWorld(config.gates[index + 1].localPosition, course.center);
        const directionFrom = index === 0 ? previous : gates[index - 1].position;
        const directionTo = index === config.gates.length - 1 ? next : position;
        const direction = [0, 0, 0];
        directionBetween(directionFrom ?? position, directionTo ?? position, direction);
        gates.push({
            id: `${course.id}-${config.id}-gate-${index}`,
            index,
            kind: 'shortcut',
            localPosition,
            position,
            radius: rawGate.radius,
            direction,
        });
    }
    return {
        id: config.id,
        entryIndex: config.entryIndex,
        exitIndex: config.exitIndex,
        gates,
    };
};

// `seed` is accepted for API compatibility, but intentionally does not affect
// layout. Every returned object owns its arrays so a hardened/edited runtime
// course cannot mutate the authored definition or another run.
export const generateRaceCourse = (courseId, _seed) => {
    const config = RACE_COURSES[courseId];
    if (!config)
        return undefined;
    const center = [...LOCATIONS[config.zone].position];
    const localPoints = config.localPoints.map((point) => [...point]);
    const gatheringLocal = localPoints[0];
    const gatheringPosition = localToWorld(gatheringLocal, center);
    const gatheringDirection = [0, 0, 0];
    directionBetween(localPoints[0], localPoints[1] ?? localPoints[0], gatheringDirection);
    const lineDistances = [0];
    for (let i = 1; i < localPoints.length; i++) {
        lineDistances.push(lineDistances[i - 1] + Math.hypot(...localPoints[i].map((v, j) => v - localPoints[i - 1][j])));
    }
    const routeLength = lineDistances.at(-1);
    const checkpointCount = config.checkpointSpacing ? Math.max(1, Math.floor(routeLength / config.checkpointSpacing)) : localPoints.length - 1;
    const gates = [];
    let segment = 1;
    for (let i = 1; i <= checkpointCount; i++) {
        const pathDistance = config.checkpointSpacing ? routeLength * i / checkpointCount : lineDistances[i];
        while (segment < localPoints.length - 1 && lineDistances[segment] < pathDistance) segment++;
        const previous = localPoints[segment - 1], next = localPoints[segment];
        const t = (pathDistance - lineDistances[segment - 1]) / (lineDistances[segment] - lineDistances[segment - 1]);
        const current = previous.map((v, j) => v + (next[j] - v) * t);
        const direction = [0, 0, 0];
        // Sparse rings use the local flight tangent, not a chord across a bend.
        if (config.checkpointSpacing) directionBetween(previous, next, direction);
        else directionBetween(previous, localPoints[Math.min(segment + 1, localPoints.length - 1)], direction);
        gates.push({
            id: `${config.id}-gate-${gates.length}`,
            index: gates.length,
            kind: i === checkpointCount ? 'finish' : 'mandatory',
            localPosition: current,
            position: localToWorld(current, center),
            radius: i === checkpointCount ? config.finishRadius : config.gateRadius,
            direction,
            pathDistance,
        });
    }
    const course = {
        ...config,
        center,
        boostPickups: config.zone === 'mourning-line' ? raceBoostLayout(localPoints).map(p=>({...p, position:localToWorld(p.position,center), approach:localToWorld(p.approach,center), rejoin:localToWorld(p.rejoin,center)})) : [],
        localPoints,
        gathering: {
            id: `${config.id}-gathering`,
            kind: 'gathering',
            localPosition: [...gatheringLocal],
            position: gatheringPosition,
            radius: Math.max(config.gateRadius, 54),
            arrivalRadius: Math.max(config.gateRadius, 54) * 2.2,
            direction: gatheringDirection,
            // The player occupies the centre of the start marker. Racers use
            // their persistent lateral slots around it (see stageRaceRacers).
            grid: { player: [...gatheringPosition] },
        },
        gates,
        gateCount: gates.length,
        routeLength,
        // Keep the collision-cleared curve separate from visible checkpoints.
        racingLine: config.checkpointSpacing ? localPoints.map(p => localToWorld(p, center)) : undefined,
        racingLineDistances: config.checkpointSpacing ? lineDistances : undefined,
        shortcuts: config.shortcuts.map((entry) => normalizeCourseShortcut({ id: config.id, center, gatheringPosition }, entry, gates)),
        // Compatibility alias for callers that used the first checkpoint as a
        // start marker before the gathering point became explicit.
        firstGate: gates[0],
    };
    course.rivalPaces = [...config.rivalPaces];
    course.payouts = [...config.payouts];
    course.unlock = config.unlock ? { ...config.unlock } : null;
    return course;
};

const RACER_DEFS = Object.freeze([
    Object.freeze({
        name: "Vex Marlow 'Slipstream'",
        variant: 'talon',
        laneOffset: -0.25,
        shortcut: true,
        livery: Object.freeze({ hull: 0xa94c3d, dark: 0x321815, accent: 0xff9b55, canopy: 0x9cf5f2, engine: 0xffad62, warning: 0xffd16f, window: 0xbdfaf3 }),
    }),
    Object.freeze({
        name: "Dara Quill 'Nine Lives'",
        variant: 'lancer',
        laneOffset: 0.25,
        shortcut: false,
        livery: Object.freeze({ hull: 0x3f7f99, dark: 0x142c3a, accent: 0x72ddff, canopy: 0xa5f3ff, engine: 0x77e5ff, warning: 0xffca69, window: 0xc4f7ff }),
    }),
    Object.freeze({
        name: "Osen Tarn 'Cold Read'",
        variant: 'kestrel',
        laneOffset: 0.5,
        shortcut: true,
        livery: Object.freeze({ hull: 0x7163a2, dark: 0x241f3b, accent: 0xc995ff, canopy: 0xafe8ff, engine: 0xc38cff, warning: 0xffcd66, window: 0xe5ceff }),
    }),
]);

const tmpStageForward = [0, 0, 1];
const tmpStageSide = [1, 0, 0];
const tmpStageUp = [0, 1, 0];
const tmpStageRotation = [0, 0, 0, 1];
const tmpRacerTarget = [0, 0, 0];
const tmpRacerDirection = [0, 0, 0];
const tmpRacerPrevious = [0, 0, 0];
const tmpRacerCurrent = [0, 0, 0];
const tmpRacerVelocity = [0, 0, 0];
const tmpGateDirection = [0, 0, 0];
const tmpTargetSide = [1, 0, 0];

const arrayRead3 = (value, out) => {
    out[0] = pointComponent(value, 0);
    out[1] = pointComponent(value, 1);
    out[2] = pointComponent(value, 2);
    return out;
};

const arrayWrite3 = (value, x, y, z) => {
    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        value[0] = x;
        value[1] = y;
        value[2] = z;
        return value;
    }
    if (value) {
        value.x = x;
        value.y = y;
        value.z = z;
    }
    return value;
};

const setFacingQuaternion = (rotation, direction) => {
    if (!rotation)
        return rotation;
    // Quaternion rotating the simulation's forward axis (0, 0, -1) onto the
    // supplied heading. This is the same convention used by the player ship.
    const fx = 0;
    const fy = 0;
    const fz = -1;
    const dot = fx * direction[0] + fy * direction[1] + fz * direction[2];
    const cx = fy * direction[2] - fz * direction[1];
    const cy = fz * direction[0] - fx * direction[2];
    const cz = fx * direction[1] - fy * direction[0];
    if (dot < -0.999999)
        return arrayWrite4(rotation, 0, 1, 0, 0);
    const scale = Math.sqrt((1 + dot) * 2);
    if (scale < 1e-7)
        return arrayWrite4(rotation, 0, 0, 0, 1);
    return arrayWrite4(rotation, cx / scale, cy / scale, cz / scale, scale * 0.5);
};

const arrayWrite4 = (value, x, y, z, w) => {
    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        value[0] = x;
        value[1] = y;
        value[2] = z;
        value[3] = w;
        return value;
    }
    if (value) {
        value.x = x;
        value.y = y;
        value.z = z;
        value.w = w;
    }
    return value;
};

const rotateVectorByQuaternion = (x, y, z, quaternion, out) => {
    const qx = quaternion[0];
    const qy = quaternion[1];
    const qz = quaternion[2];
    const qw = quaternion[3];
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return out;
};

const ensureRacerArrays = (ship) => {
    if (!ship.position)
        ship.position = [0, 0, 0];
    if (!ship.velocity)
        ship.velocity = [0, 0, 0];
    if (!ship.rotation)
        ship.rotation = [0, 0, 0, 1];
};

export const stageRaceRacers = (racers, course) => {
    if (!Array.isArray(racers) || !course?.gathering)
        return racers;
    const gathering = course.gathering;
    arrayRead3(gathering.direction, tmpStageForward);
    normalizeVector(tmpStageForward[0], tmpStageForward[1], tmpStageForward[2], tmpStageForward);
    // Derive the formation's right/up plane from the same no-roll rotation the
    // cockpit uses. A world-horizontal side vector turned into a steep screen
    // diagonal on pitched starts and put one rival behind the instrument
    // panel even though its world position looked reasonable.
    setFacingQuaternion(tmpStageRotation, tmpStageForward);
    rotateVectorByQuaternion(1, 0, 0, tmpStageRotation, tmpStageSide);
    rotateVectorByQuaternion(0, 1, 0, tmpStageRotation, tmpStageUp);
    const gx = pointComponent(gathering.position, 0);
    const gy = pointComponent(gathering.position, 1);
    const gz = pointComponent(gathering.position, 2);
    racers.forEach((ship, index) => {
        ensureRacerArrays(ship);
        // Leave a clear player's slot and enough room between rival hulls to
        // prevent the field colliding before the countdown ends. The three
        // opponents stay in the forward view, spread across two rows.
        const formationLane=index-1;
        const longitudinal = index === 1 ? 55 : 90;
        const lateral = index === 1 ? 0 : formationLane * 40;
        const vertical = index === 1 ? 2 : 8;
        arrayWrite3(ship.position,
            gx + tmpStageForward[0] * longitudinal + tmpStageSide[0] * lateral + tmpStageUp[0] * vertical,
            gy + tmpStageForward[1] * longitudinal + tmpStageSide[1] * lateral + tmpStageUp[1] * vertical,
            gz + tmpStageForward[2] * longitudinal + tmpStageSide[2] * lateral + tmpStageUp[2] * vertical);
        arrayWrite3(ship.velocity, 0, 0, 0);
        setFacingQuaternion(ship.rotation, tmpStageForward);
        ship.racePreviousPosition??=[0,0,0];
        arrayRead3(ship.position,ship.racePreviousPosition);
        ship.raceTactics=undefined;ship.raceContactUntil=0;ship.raceRecoverUntil=0;ship.raceGateRecovery=false;ship.raceGateReentry=false;
        ship.raceFuel=100;
        ship.raceDrive=createRaceDrive();ship.raceAngularVelocity=[0,0,0];
        ship.raceLane=ship.laneOffset;
        ship.raceSplits=[];
        ship.raceBoostCollected=new Set();
        ship.racePickupSkipped=new Set();ship.racePickupTarget=false;ship.racePickupTargetIndex=-1;ship.racePickupTargetStartedAt=undefined;ship.racePickupRejoinIndex=-1;ship.raceLaunchAt=undefined;
        ship.raceGateIndex = 0;
        ship.raceLineDistance = 0;
        ship.raceLineIndex = 1;
        ship.raceFinished = false;
        ship.raceFinishTime = undefined;
        ship.raceShortcutState = 'none';
        ship.raceShortcutIndex = -1;
        ship.raceShortcutId = undefined;
        ship.raceShortcut = undefined;
    });
    return racers;
};

const RACE_MISTAKE_GATES = Object.freeze({
    // These late, relatively straight sections make an over-cautious speed
    // check visibly cost time without affecting the route's difficult bends.
    'mourning-run': Object.freeze([32/38,33/38,34/38,35/38]),
    'mourning-breach': Object.freeze([23/39,31/39]),
    'mourning-relict-gauntlet': Object.freeze([27/72,37/72,40/72,45/72]),
});
const RACE_PACE_PROFILES=Object.freeze({
 'shard-gauntlet':Object.freeze([1,.8,.7]),
 'shard-switchback':Object.freeze([1,.8,.7]),
 'shard-miners-knife':Object.freeze([1,.8,.7]),
    'mourning-run':Object.freeze([1,.82,.7]),
 'mourning-breach':Object.freeze([1,.86,.7]),
 'mourning-relict-gauntlet':Object.freeze([1,.94,.84]),
});

const raceVariancePlan = (raceSeed, racerIndex, extraMistakeRacer, course) => {
    const rng = seededRandom(`${raceSeed}:mistake:${racerIndex}`);
    const skillRng=seededRandom(`${raceSeed}:corner-skill:${racerIndex}`);
    const paceRng=seededRandom(`${raceSeed}:pace:${racerIndex}`);
    const extraMistake=racerIndex===extraMistakeRacer;
    const mistakeGates=RACE_MISTAKE_GATES[course?.id]??[];
    const mistakeFraction=mistakeGates[Math.floor(rng()*mistakeGates.length)];
    const mistakeGate=extraMistake&&Number.isFinite(mistakeFraction)?Math.min(course.gates.length-2,Math.floor(mistakeFraction*course.gates.length)):-1;
    const baseCornerSkill=[1.18,1,.84][racerIndex]??1;
    const basePace=RACE_PACE_PROFILES[course?.id]?.[racerIndex]??1;
    return {
        // Rivals have distinct driving tiers rather than identical lap pace.
        // The best pilot carries more speed through curves; the others make
        // progressively safer choices. Seeded variation keeps every race fresh.
        corneringSkill:baseCornerSkill*(.97+skillRng()*.06),
        paceMultiplier:basePace*(.96+paceRng()*.08),
        // A fixed starting stagger and one seeded, late-course hesitation add
        // small human-like variation without changing the speed ceiling.
        launchDelay: .45 + racerIndex * .45,
        mistakeGate,
        mistakeDuration: extraMistake ? .8 + rng() * .6 : 0,
    };
};

export const createRaceRacers = (course, _seed, worldTime, playerHullId='talon') => {
    if (!course)
        return [];
    const raceSeed = `${_seed ?? 0}:${course.id}:${Math.floor(worldTime ?? 0)}`;
    const extraMistakeRacer = Math.floor(seededRandom(`${raceSeed}:extra-mistake`)() * RACER_DEFS.length);
    const hullIds=Object.keys(RACE_HULLS).filter(id=>id!==raceHull(playerHullId).id);
    const racers = RACER_DEFS.map((original, index) => {
        const definition={...original,variant:hullIds[index]};
        const raceFrame=raceHull(definition.variant);
        const variance=raceVariancePlan(raceSeed,index,extraMistakeRacer,course);
        const pace = course.rivalPaces[index] ?? course.racerSpeed ?? 45;
        return {
            id: `race-racer-${index}`,
            spawnTime: Number.isFinite(worldTime) ? worldTime : 0,
            name: definition.name,
            role: 'trader',
            variant: definition.variant,
            faction: 'independents',
            // Race paint is renderer-only identity metadata. It makes the
            // named field readable against dark rocks without changing
            // faction, targeting, collision, or combat rules.
            raceLivery: { ...definition.livery },
            laneOffset: definition.laneOffset,
            race: true,
            raceCourseId:course.id,
            raceTunnelCourse:Boolean(course.tunnelCourse),
            raceLineCourse:Boolean(course.racingLine),
            raceHull:raceFrame?.id,
            raceAggression:[.95,.65,.82][index],
            // Authored-line rivals cross the same visible aperture as players.
            raceGateTolerance:course.racingLine?0:70,
            // Rivals vary their launch reaction; one has a longer hesitation.
            raceVariance:variance,
            raceCorneringSkill:variance.corneringSkill,
            racePaceMultiplier:variance.paceMultiplier,
            raceLookAheadScale:course.racingLine?1.4/Math.max(.65,Math.min(1,variance.paceMultiplier)):1.6+(variance.corneringSkill-1)*.25,
            raceDirectGateSpeedScale:2.4+(variance.corneringSkill-1)*.4,
            raceLineDamping:course.racingLine?1.8:.4+(variance.corneringSkill-1)*.6,
            raceLaunchDelay:0,
            raceLaunchAt:undefined,
            raceResources:raceFrame??SHIPS[definition.variant]??SHIPS.speedster,
            energy:raceFrame.energyCapacity,
            shieldDelay:0,
            raceGateIndex: 0,
            raceFinished: false,
            raceFinishTime: undefined,
            raceShortcutChoice: Boolean(course.shortcuts?.length && definition.shortcut),
            shortcutChoice: Boolean(course.shortcuts?.length && definition.shortcut),
            raceShortcutState: 'none',
            raceShortcutIndex: -1,
            raceShortcutId: undefined,
            raceShortcut: undefined,
            position: [0, 0, 0],
            velocity: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            shield: raceFrame?.shield??SHIPS[definition.variant]?.shield??180,
            maxShield: raceFrame?.shield??SHIPS[definition.variant]?.shield??180,
            hull: raceFrame?.hull??SHIPS[definition.variant]?.hull??180,
            maxHull: raceFrame?.hull??SHIPS[definition.variant]?.hull??180,
            pace,
            speed: pace,
            afterburnSpeed: course.racingLine ? pace*1.6 : pace,
            acceleration: 26,
            turnRate: 2.4,
            gunDamage: 0,
            hostile: false,
            dark: false,
            scanned: true,
            surrendered: false,
            claimed: true,
            captured: false,
        };
    });
    const staged = stageRaceRacers(racers, course);
    for (const racer of staged) {
        racer.raceLaunchDelay = racer.raceVariance?.launchDelay ?? 0;
        racer.raceMistakeGate = racer.raceVariance?.mistakeGate ?? -1;
        racer.raceMistakeDuration = racer.raceVariance?.mistakeDuration ?? 0;
        racer.raceMistakeTriggered = false;
        racer.raceMistakeStartedAt = undefined;
        racer.racePickupSkipped = new Set();
    }
    return staged;
};

const shortcutForShip = (ship, course) => {
    const candidate = course?.shortcuts?.[0];
    if (!candidate)
        return undefined;
    if (ship.raceShortcutState === 'active' || ship.raceShortcutState === 'complete')
        return candidate;
    // entryIndex is the next mandatory gate at which the racer may commit to
    // the optional route. This matches the player's raceGateIndex semantics:
    // index N always means "the next gate is N".
    if (ship.raceGateIndex >= candidate.entryIndex && ship.raceGateIndex <= candidate.exitIndex) {
        if (ship.raceShortcutChoice || ship.shortcutChoice) {
            ship.raceShortcutState = 'active';
            ship.raceShortcutIndex = Math.max(0, ship.raceShortcutIndex);
            ship.raceShortcutId = candidate.id;
            ship.raceShortcut = {
                data: candidate,
                committed: true,
                index: ship.raceShortcutIndex,
                entryIndex: candidate.entryIndex,
                exitIndex: candidate.exitIndex,
            };
            return candidate;
        }
        ship.raceShortcutState = 'skipped';
        ship.raceShortcutIndex = -1;
    }
    return undefined;
};

const updateRaceLineProgress = (ship,course,gate) => {
    const line=course.racingLine,distances=course.racingLineDistances;
    let segment=ship.raceLineIndex??1;
    const progress=ship.raceLineDistance??0;
    let nearest=Infinity,best=progress;
    // Only search forward locally: crossing an earlier leg must never jump a
    // rival to a later loop or skip a mandatory checkpoint.
    const limit=Math.min(progress+160,gate.pathDistance+35);
    for(let i=segment;i<line.length&&distances[i-1]<=limit;i++){
        const a=line[i-1],b=line[i],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
        const length=distances[i]-distances[i-1];
        const t=Math.max(0,Math.min(1,((ship.position[0]-a[0])*dx+(ship.position[1]-a[1])*dy+(ship.position[2]-a[2])*dz)/(length*length)));
        const along=Math.min(limit,distances[i-1]+length*t);
        if(along<progress)continue;
        const fraction=(along-distances[i-1])/length;
        const d=(ship.position[0]-a[0]-dx*fraction)**2+(ship.position[1]-a[1]-dy*fraction)**2+(ship.position[2]-a[2]-dz*fraction)**2;
        if(d<nearest){nearest=d;best=along;segment=i;}
    }
    ship.raceLineDistance=best;
    ship.raceLineIndex=segment;
};

export const raceRacerTarget = (ship, course, out = [0, 0, 0]) => {
    if (!ship || !course)
        return writePoint(out, 0, 0, 0);
    const shortcutRoute = shortcutForShip(ship, course);
    const shortcutGate = shortcutRoute?.gates?.[ship.raceShortcutIndex >= 0 ? ship.raceShortcutIndex : 0];
    const gate = shortcutRoute && ship.raceShortcutState === 'active' && shortcutGate
        ? shortcutGate
        : course.gates?.[ship.raceGateIndex];
    if (!gate)
        return writePoint(out, pointComponent(ship.position, 0), pointComponent(ship.position, 1), pointComponent(ship.position, 2));
    if(ship.raceHull&&!course.racingLine){
        const plane=(ship.position[0]-gate.position[0])*gate.direction[0]+(ship.position[1]-gate.position[1])*gate.direction[1]+(ship.position[2]-gate.position[2])*gate.direction[2];
        if(plane>10)ship.raceGateRecovery=true;
        if(ship.raceGateRecovery){if(plane> -45)return writePoint(out,gate.position[0]-gate.direction[0]*65,gate.position[1]-gate.direction[1]*65,gate.position[2]-gate.direction[2]*65);ship.raceGateRecovery=false;}
    }
    if (course.racingLine) {
        updateRaceLineProgress(ship,course,gate);
        const plane=(ship.position[0]-gate.position[0])*gate.direction[0]+(ship.position[1]-gate.position[1])*gate.direction[1]+(ship.position[2]-gate.position[2])*gate.direction[2];
        if(plane>15&&!ship.raceGateRecovery){ship.raceGateRecovery=true;ship.raceGateReentry=false;}
        if(plane>30&&ship.raceGateReentry)ship.raceGateReentry=false;
        if(ship.raceGateRecovery){
            const approach=ship.raceHull?(ship.raceRecoveryApproach??(course.racingLine?120:80)):45,exit=course.racingLine?120:ship.raceHull?0:90;
            if(!ship.raceGateReentry){
                const ax=gate.position[0]-gate.direction[0]*approach,ay=gate.position[1]-gate.direction[1]*approach,az=gate.position[2]-gate.direction[2]*approach;
                const dx=ship.position[0]-ax,dy=ship.position[1]-ay,dz=ship.position[2]-az;
                const reentryRadius=ship.raceHull?35:55;
                if(dx*dx+dy*dy+dz*dz>reentryRadius*reentryRadius)return writePoint(out,ax,ay,az);
                ship.raceGateReentry=true;ship.raceLineDistance=Math.max(0,gate.pathDistance-approach);ship.raceLineIndex=1;
                while(ship.raceLineIndex<course.racingLine.length-1&&course.racingLineDistances[ship.raceLineIndex]<ship.raceLineDistance)ship.raceLineIndex++;
            }
            return writePoint(out,gate.position[0]+gate.direction[0]*exit,gate.position[1]+gate.direction[1]*exit,gate.position[2]+gate.direction[2]*exit);
        }
        ship.racePickupTarget=false;
        const line = course.racingLine, distances = course.racingLineDistances;
        const segment=ship.raceLineIndex??1,best=ship.raceLineDistance??0;
        const speed = Math.hypot(ship.velocity[0],ship.velocity[1],ship.velocity[2]);
        const lookAhead = Math.min(best + Math.max(32, speed*(ship.raceLookAheadScale??1.6)), distances.at(-1));
        let targetSegment = segment;
        while (targetSegment < line.length - 1 && distances[targetSegment] < lookAhead) targetSegment++;
        const a = line[targetSegment - 1], b = line[targetSegment];
        const length = distances[targetSegment] - distances[targetSegment - 1];
        const t = (lookAhead - distances[targetSegment - 1])/length;
        normalizeVector(b[0]-a[0], b[1]-a[1], b[2]-a[2], tmpGateDirection);
        normalizeVector(tmpGateDirection[2], 0, -tmpGateDirection[0], tmpTargetSide, 1, 0, 0);
        const offset = (ship.raceLane ?? ship.laneOffset ?? 0) * (course.racerLaneWidth ?? 12);
        return writePoint(out, a[0]+(b[0]-a[0])*t+tmpTargetSide[0]*offset,
            a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t+tmpTargetSide[2]*offset);
    }
    // Rivals do not fly a conga line through the centre. Their persistent lane
    // offset is deliberately small (at most 25% of the current aperture), so
    // the target remains a valid gate crossing while the three hulls read as
    // separate pilots on approach.
    normalizeVector(
        pointComponent(gate.direction, 0),
        pointComponent(gate.direction, 1),
        pointComponent(gate.direction, 2),
        tmpGateDirection,
    );
    tmpTargetSide[0] = tmpGateDirection[2];
    tmpTargetSide[1] = 0;
    tmpTargetSide[2] = -tmpGateDirection[0];
    normalizeVector(tmpTargetSide[0], tmpTargetSide[1], tmpTargetSide[2], tmpTargetSide, 1, 0, 0);
    const lateral = Math.min((Number.isFinite(gate.radius) ? gate.radius : 0) * 0.25, course.racerLaneWidth ?? 12);
    const lane = Number.isFinite(ship.raceLane) ? ship.raceLane : Number.isFinite(ship.laneOffset) ? ship.laneOffset : 0;
    return writePoint(out,
        pointComponent(gate.position, 0) + tmpTargetSide[0] * lane * lateral,
        pointComponent(gate.position, 1) + tmpTargetSide[1] * lane * lateral,
        pointComponent(gate.position, 2) + tmpTargetSide[2] * lane * lateral);
};

// Test a complete motion segment against a gate's forward-facing plane and
// circular aperture. A point merely passing near a ring, or crossing it from
// the exit side, does not count.
export const crossedRaceGate = (previous, current, gate, apertureMargin = 0) => {
    if (!previous || !current || !gate?.position)
        return false;
    const px = pointComponent(gate.position, 0);
    const py = pointComponent(gate.position, 1);
    const pz = pointComponent(gate.position, 2);
    normalizeVector(
        pointComponent(gate.direction, 0),
        pointComponent(gate.direction, 1),
        pointComponent(gate.direction, 2),
        tmpGateDirection,
    );
    const prevX = pointComponent(previous, 0);
    const prevY = pointComponent(previous, 1);
    const prevZ = pointComponent(previous, 2);
    const currentX = pointComponent(current, 0);
    const currentY = pointComponent(current, 1);
    const currentZ = pointComponent(current, 2);
    const previousSide = (prevX - px) * tmpGateDirection[0] + (prevY - py) * tmpGateDirection[1] + (prevZ - pz) * tmpGateDirection[2];
    const currentSide = (currentX - px) * tmpGateDirection[0] + (currentY - py) * tmpGateDirection[1] + (currentZ - pz) * tmpGateDirection[2];
    const epsilon = 1e-7;
    if (previousSide > epsilon || currentSide < -epsilon || currentSide - previousSide < epsilon)
        return false;
    const alpha = Math.max(0, Math.min(1, -previousSide / (currentSide - previousSide)));
    const hitX = prevX + (currentX - prevX) * alpha - px;
    const hitY = prevY + (currentY - prevY) * alpha - py;
    const hitZ = prevZ + (currentZ - prevZ) * alpha - pz;
    const axial = hitX * tmpGateDirection[0] + hitY * tmpGateDirection[1] + hitZ * tmpGateDirection[2];
    const radialX = hitX - tmpGateDirection[0] * axial;
    const radialY = hitY - tmpGateDirection[1] * axial;
    const radialZ = hitZ - tmpGateDirection[2] * axial;
    const radius = (Number.isFinite(gate.radius) ? Math.max(0, gate.radius) : 0) + Math.max(0, apertureMargin);
    return radialX * radialX + radialY * radialY + radialZ * radialZ <= radius * radius + 1e-7;
};

// Once an AI has missed a gate, count a close, forward-moving return through
// the visible ring's short depth. This prevents tiny plane-crossing offsets
// from trapping a rival in a repeated U-turn recovery loop.
const recoveredNpcGatePass = (ship, previous, current, gate, apertureMargin = 0) => {
    if(!ship.raceHull||!ship.raceGateRecovery||!previous||!current)return false;
    normalizeVector(pointComponent(gate.direction,0),pointComponent(gate.direction,1),pointComponent(gate.direction,2),tmpGateDirection);
    const gx=pointComponent(gate.position,0),gy=pointComponent(gate.position,1),gz=pointComponent(gate.position,2);
    const px=pointComponent(previous,0)-gx,py=pointComponent(previous,1)-gy,pz=pointComponent(previous,2)-gz;
    const cx=pointComponent(current,0)-gx,cy=pointComponent(current,1)-gy,cz=pointComponent(current,2)-gz;
    const previousSide=px*tmpGateDirection[0]+py*tmpGateDirection[1]+pz*tmpGateDirection[2];
    const currentSide=cx*tmpGateDirection[0]+cy*tmpGateDirection[1]+cz*tmpGateDirection[2];
    const vx=pointComponent(ship.velocity,0),vy=pointComponent(ship.velocity,1),vz=pointComponent(ship.velocity,2);
    if(previousSide>36||currentSide<0||currentSide-previousSide<1e-7||vx*tmpGateDirection[0]+vy*tmpGateDirection[1]+vz*tmpGateDirection[2]<=0)return false;
    const radius=(Number.isFinite(gate.radius)?Math.max(0,gate.radius):0)+Math.max(0,apertureMargin);
    const radialX=cx-tmpGateDirection[0]*currentSide,radialY=cy-tmpGateDirection[1]*currentSide,radialZ=cz-tmpGateDirection[2]*currentSide;
    return radialX*radialX+radialY*radialY+radialZ*radialZ<=radius*radius;
};

const advanceRacerGate = (ship, course, worldTime) => {
    const shortcutRoute = ship.raceShortcutState === 'active' ? course.shortcuts?.[0] : undefined;
    if (shortcutRoute) {
        ship.raceShortcutIndex += 1;
        if (ship.raceShortcut)
            ship.raceShortcut.index = ship.raceShortcutIndex;
        if (ship.raceShortcutIndex < shortcutRoute.gates.length)
            return true;
        ship.raceShortcutState = 'complete';
        ship.raceShortcutId = shortcutRoute.id;
        if (ship.raceShortcut)
            ship.raceShortcut.committed = false;
        // exitIndex is the mandatory gate to rejoin, i.e. the next gate after
        // the shortcut. Keep it as the current next-gate index so the racer
        // and player lifecycle share the same shortcut semantics.
        ship.raceGateIndex = Math.min(course.gates.length, shortcutRoute.exitIndex);
        ship.raceShortcutIndex = -1;
    }
    else {
        ship.raceGateIndex += 1;
        ship.raceGateRecovery=false;ship.raceGateReentry=false;
        shortcutForShip(ship, course);
    }
    if (ship.raceGateIndex >= course.gates.length) {
        ship.raceFinished = true;
        ship.raceFinishTime = worldTime;
        return false;
    }
    return true;
};

// Advance a fixed race fit without replacing transform arrays. Mourning
// pilots share boost/recovery rules and plan speed around upcoming bends;
// collision steering supplies the safe local direction and braking demand.
export const updateRaceRacer = (ship, course, dt, worldTime = 0, steering) => {
    if (!ship || !course || ship.raceFinished || !(dt > 0))
        return ship;
    ensureRacerArrays(ship);
    const pace = Number.isFinite(ship.pace) ? ship.pace : Number.isFinite(ship.speed) ? ship.speed : course.racerSpeed ?? 45;
    arrayRead3(ship.position, tmpRacerPrevious);
    arrayRead3(ship.position,ship.racePreviousPosition??=[0,0,0]);
    raceRacerTarget(ship, course, tmpRacerTarget);
    const steeringDirection = steering?.direction;
    if (steeringDirection && Math.hypot(pointComponent(steeringDirection, 0), pointComponent(steeringDirection, 1), pointComponent(steeringDirection, 2)) > 1e-7) {
        normalizeVector(pointComponent(steeringDirection, 0), pointComponent(steeringDirection, 1), pointComponent(steeringDirection, 2), tmpRacerDirection);
    }
    else {
        normalizeVector(
            tmpRacerTarget[0] - tmpRacerPrevious[0],
            tmpRacerTarget[1] - tmpRacerPrevious[1],
            tmpRacerTarget[2] - tmpRacerPrevious[2],
            tmpRacerDirection,
        );
    }
    if(ship.raceHull&&course.racingLine){
        updateRacePilot(ship,course,tmpRacerTarget,dt,worldTime,steering);
        if(!steering?.deferGates)advanceRaceRacerGates(ship,course,ship.racePreviousPosition,ship.position,worldTime);
        return ship;
    }
    const brake = Math.max(0, Math.min(1, Number.isFinite(steering?.brake) ? steering.brake : 0));
    arrayRead3(ship.velocity, tmpRacerVelocity);
    const velocityLength = Math.hypot(...tmpRacerVelocity);
    let desiredSpeed=pace*(1-brake*.7),acceleration=ship.acceleration??26,stabilized=false;
    if(course.racingLine){
        const drive=ship.raceDrive??=createRaceDrive();
        stabilized=drive.stabilizerTime>0;
        const draft=steering?.peers?Math.max(raceDraft(ship,steering.peers),steering.player?raceDraft(ship,steering.player):0):0;
        const alignment=velocityLength>1?(tmpRacerDirection[0]*tmpRacerVelocity[0]+tmpRacerDirection[1]*tmpRacerVelocity[1]+tmpRacerDirection[2]*tmpRacerVelocity[2])/velocityLength:1;
        // Look beyond the steering target: brake before the bend, spend boost
        // on an exit/straight. No catch-up speed or player-class scaling.
        const line=course.racingLine,distances=course.racingLineDistances;
        let i=Math.max(1,ship.raceLineIndex??1),end=i;
        while(end<line.length-1&&distances[end]<(ship.raceLineDistance??0)+Math.max(160,velocityLength*1.8))end++;
        let bend=1;
        for(let j=i+1;j<=end;j++){
            const a=line[j-2],b=line[j-1],c=line[j];
            const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-b[0],vy=c[1]-b[1],vz=c[2]-b[2];
            bend=Math.min(bend,(ux*vx+uy*vy+uz*vz)/(Math.hypot(ux,uy,uz)*Math.hypot(vx,vy,vz)));
        }
        const burning=stepRaceDrive(drive,worldTime>=(ship.raceContactUntil??0)&&(ship.raceFuel??100)>.5&&brake<.08&&bend>.975&&alignment>.99,dt,draft);
        ship.burning=burning;
        if(burning)ship.raceFuel=Math.max(0,(ship.raceFuel??100)-dt*1.025*(1-.38*draft));
        const ceiling=burning?ship.afterburnSpeed:pace;
        desiredSpeed=ceiling*(1+draft*.14)*(1-brake*.7)*Math.max(.65,1-(1-bend)*6);
        acceleration*= (burning?1.65:1)*(1+draft*.18);

    }
    const nextSpeed=course.racingLine?velocityLength+Math.max(-acceleration*1.25*dt,Math.min(acceleration*dt,desiredSpeed-velocityLength)):desiredSpeed;
    const blend=velocityLength<1e-7?1:Math.min(1,dt*(ship.turnRate??2.4)*(stabilized?2.5:1));
    let vx=tmpRacerVelocity[0]*(1-blend)+tmpRacerDirection[0]*Math.max(nextSpeed,1e-6)*blend;
    let vy=tmpRacerVelocity[1]*(1-blend)+tmpRacerDirection[1]*Math.max(nextSpeed,1e-6)*blend;
    let vz=tmpRacerVelocity[2]*(1-blend)+tmpRacerDirection[2]*Math.max(nextSpeed,1e-6)*blend;
    const length=Math.hypot(vx,vy,vz)||1;vx*=nextSpeed/length;vy*=nextSpeed/length;vz*=nextSpeed/length;
    arrayWrite3(ship.velocity, vx, vy, vz);
    const currentX = tmpRacerPrevious[0] + vx * dt;
    const currentY = tmpRacerPrevious[1] + vy * dt;
    const currentZ = tmpRacerPrevious[2] + vz * dt;
    arrayWrite3(ship.position, currentX, currentY, currentZ);
    tmpRacerCurrent[0] = currentX;
    tmpRacerCurrent[1] = currentY;
    tmpRacerCurrent[2] = currentZ;
    setFacingQuaternion(ship.rotation, velocityLength < 1e-7 ? tmpRacerDirection : normalizeVector(vx, vy, vz, tmpRacerDirection));

    if(!steering?.deferGates)advanceRaceRacerGates(ship,course,ship.racePreviousPosition,ship.position,worldTime);
    return ship;
};

export function advanceRaceRacerGates(ship,course,previous,current,worldTime){
    if(ship.raceFinished||ship.hull<=0)return;
    for(const pickup of course.boostPickups??[]){
        const collected=ship.raceBoostCollected??=new Set();
        if(!collected.has(pickup.index)&&sweptBoostHit(previous,current,pickup.position,ship.raceHull?18:12)){
            collected.add(pickup.index);ship.racePickupRejoinIndex=pickup.index;
            ship.racePickupTarget=false;ship.racePickupTargetIndex=-1;ship.racePickupTargetStartedAt=undefined;
            collectRaceStabilizer(ship.raceDrive??=createRaceDrive());
        }
    }

    // A long step may cross more than one plane. Re-use the same endpoint and
    // cap the loop so malformed data cannot turn this hot path into an unbounded
    // loop.
    for (let crossed = 0; crossed < 8 && !ship.raceFinished; crossed += 1) {
        const shortcutRoute = ship.raceShortcutState === 'active' ? course.shortcuts?.[0] : undefined;
        const shortcutGate = shortcutRoute?.gates?.[ship.raceShortcutIndex >= 0 ? ship.raceShortcutIndex : 0];
        const gate = shortcutRoute && shortcutGate ? shortcutGate : course.gates?.[ship.raceGateIndex];
        const aiApertureMargin=ship.raceHull?Math.max(0,Math.min(70,ship.raceGateTolerance??24)):0;
        if (!gate || (!crossedRaceGate(previous, current, gate, aiApertureMargin)&&!(!course.racingLine&&recoveredNpcGatePass(ship,previous,current,gate,aiApertureMargin))))
            break;
        (ship.raceSplits??=[])[ship.raceGateIndex]=worldTime;
        if (!advanceRacerGate(ship, course, worldTime)) {
            arrayWrite3(ship.velocity, 0, 0, 0);
            break;
        }
    }
    return ship;
};

export const raceRankLabel = (rank) => t(['1ST', '2ND', '3RD', '4TH'][rank - 1] ?? `${rank}TH`);

export const racePayout = (course, rank) => {
    const payouts = course?.payouts ?? [];
    return payouts[Math.min(Math.max(0, rank - 1), payouts.length - 1)] ?? 0;
};

export const raceBriefingLine = (course) => t(course?.briefing ?? 'Race the marked course and beat the rival pilots.');
