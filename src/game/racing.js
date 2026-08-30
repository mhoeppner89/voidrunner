import { LOCATIONS } from './data.js';
import { t } from './i18n.js';

export const RACE_QUEST_ID = 'bar-circuit';

// Race layouts are authored in local field coordinates. The first point is a
// gathering point; every following point is a mandatory checkpoint. Keeping
// the points here (rather than deriving them from a seed) makes the six routes
// learnable and lets the field artists reserve the same safe corridors in the
// world generator.
const authoredCourse = (config) => Object.freeze({
    ...config,
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

const shardCrownPoints = [
    [0, 0, -1080],
    [-150, -120, -820],
    [150, 120, -560],
    [-150, 120, -300],
    [160, -120, -40],
    [-160, 120, 220],
    [160, -120, 480],
    [-150, 110, 740],
    [0, 0, 980],
    [0, 0, 1240],
];
const shardSwitchbackPoints = [
    [0, 0, -1400],
    [-220, -110, -1120],
    [210, 120, -820],
    [-230, 140, -520],
    [220, -140, -220],
    [-220, 130, 80],
    [220, -130, 380],
    [-220, 120, 680],
    [210, -100, 980],
    [-250, 140, 1260],
    [0, -180, 1500],
    [240, 100, 1760],
];
const shardKnifePoints = [
    [0, 0, -1850],
    [-420, -220, -1500],
    [-500, 220, -1050],
    [-420, 260, -500],
    [-500, 0, 0],
    [-420, -260, 500],
    [-360, 220, 1000],
    [0, 0, 1450],
    [360, -220, 1700],
    [500, 220, 1400],
    [520, -160, 900],
    [500, 200, 350],
    [480, -220, -250],
    [400, 180, -850],
    [0, 0, -1850],
];
const mourningCarrierPoints = [
    [0, 0, -160],
    [0, 90, -250],
    [0, 260, -440],
    [0, 420, -620],
    [0, 520, -980],
    [160, 480, -1180],
    [-170, 300, -1450],
    [0, 80, -1560],
    [260, -40, -1250],
    [220, -80, -800],
    [0, -20, -420],
    [0, 0, 160],
];
const mourningBreachPoints = [
    [0, 0, -180],
    [0, -30, 50],
    [0, -80, 220],
    [0, -260, 520],
    [0, -340, 780],
    [260, -300, 900],
    [520, -260, 1030],
    [720, -120, 1250],
    [420, 50, 1350],
    [0, 120, 1250],
    [-420, -100, 1100],
    [-700, -250, 900],
    [-520, -330, 650],
    [-220, -400, 420],
    [0, -260, 180],
    [0, 0, 160],
];
const mourningRelictPoints = [
    [0, 0, -220],
    [0, 90, -250],
    [0, 420, -620],
    [0, 520, -980],
    [-200, 360, -1250],
    [-150, 45, -150],
    [-500, 390, -370],
    [-790, 520, -560],
    [-600, 300, -100],
    [-200, 0, 100],
    [0, -80, 220],
    [0, -260, 520],
    [0, -340, 780],
    [400, -420, 950],
    [720, -180, 900],
    [800, -480, 870],
    [500, -250, 1200],
    [0, 250, 1480],
    [0, 390, 2020],
];

const shortcut = (id, entryIndex, exitIndex, radius, points) => ({
    id,
    entryIndex,
    exitIndex,
    gates: points.map((localPosition) => ({ localPosition, radius })),
});

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
        gateRadius: 64,
        finishRadius: 76,
        targetTimeSeconds: 75,
        target: '60–75 seconds',
        targetText: 'Podium target: 60–75 seconds',
        recommendedShip: 'Wayfarer',
        recommendedShipText: 'Wayfarer or faster',
        centerFuelReward: 1.25,
        rivalPaces: [42, 44, 46],
        racerSpeed: 44,
        localPoints: shardCrownPoints,
        shortcuts: [shortcut('shard-gauntlet-shortcut', 3, 5, 14, [
            [-40, 0, -180],
            [40, 0, 80],
        ])],
        briefing: 'A marked rock crown with a tight zig-zag through the centre. Take the short cut only if you can thread its narrow rings without losing your line.',
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
        gateRadius: 52,
        finishRadius: 64,
        targetTimeSeconds: 105,
        target: '85–105 seconds',
        targetText: 'Podium target: 85–105 seconds',
        recommendedShip: 'Wayfarer',
        recommendedShipText: 'Wayfarer with afterburner bursts',
        centerFuelReward: 1.5,
        rivalPaces: [48, 50, 52],
        racerSpeed: 50,
        localPoints: shardSwitchbackPoints,
        shortcuts: [shortcut('shard-switchback-shortcut', 5, 7, 14, [
            [0, 0, 200],
            [0, 0, 500],
        ])],
        briefing: 'The Pit Boss sends the field runners deep, then doubles them back through alternating rock lanes. A very tight inner cut saves time but punishes a late turn.',
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
        gateRadius: 40,
        finishRadius: 56,
        targetTimeSeconds: 145,
        target: '120–145 seconds',
        targetText: 'Podium target: 120–145 seconds',
        recommendedShip: 'Wayfarer',
        recommendedShipText: 'Wayfarer with heavy afterburner use',
        centerFuelReward: 1.75,
        rivalPaces: [56, 58, 60],
        racerSpeed: 58,
        localPoints: shardKnifePoints,
        shortcuts: [shortcut('shard-miners-knife-shortcut', 3, 6, 12, [
            [-240, 0, -160],
            [-220, 0, 260],
            [-230, 0, 700],
        ])],
        briefing: 'The hard Shardbelt line dives around the miner monoliths and closes back on itself. It is feasible in a Wayfarer, but only with disciplined heavy-afterburner bursts and a clean exit from the knife cut.',
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
        gateRadius: 50,
        finishRadius: 64,
        targetTimeSeconds: 50,
        target: '42–50 seconds',
        targetText: 'Podium target: 42–50 seconds',
        recommendedShip: 'Talon or Lancer',
        recommendedShipText: 'Talon or Lancer recommended',
        centerFuelReward: 1.5,
        rivalPaces: [80, 83, 86],
        racerSpeed: 83,
        localPoints: mourningCarrierPoints,
        shortcuts: [shortcut('mourning-run-shortcut', 4, 6, 16, [
            [0, 318, -902],
            [0, 209, -1203],
            [0, 142, -1391],
        ])],
        briefing: 'A Salvage Union sprint through the carrier wake and its broken hangar ribs. The short cut is barely wider than a hull and the wreck field gives slow ships no room to recover.',
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
        gateRadius: 42,
        finishRadius: 54,
        targetTimeSeconds: 57,
        target: '48–57 seconds',
        targetText: 'Podium target: 48–57 seconds',
        recommendedShip: 'Talon or Lancer',
        recommendedShipText: 'Talon or Lancer required to contest',
        centerFuelReward: 1.75,
        rivalPaces: [86, 90, 94],
        racerSpeed: 90,
        localPoints: mourningBreachPoints,
        shortcuts: [shortcut('mourning-breach-shortcut', 3, 5, 14, [
            [40, -290, 650],
            [150, -300, 780],
        ])],
        briefing: 'Cross the battleship breach on a rising diagonal, then reverse across the open rib cage. The narrow inside line is fast only for a ship with the turn authority to hold it.',
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
        gateRadius: 34,
        finishRadius: 46,
        targetTimeSeconds: 90,
        target: '75–90 seconds',
        targetText: 'Podium target: 75–90 seconds',
        recommendedShip: 'Talon or Lancer',
        recommendedShipText: 'Talon or Lancer strongly recommended',
        centerFuelReward: 2,
        rivalPaces: [92, 97, 101],
        racerSpeed: 97,
        localPoints: mourningRelictPoints,
        shortcuts: [shortcut('mourning-relict-gauntlet-shortcut', 10, 13, 12, [
            [180, -120, 460],
            // Skim above the battleship deck, then dive back toward the bow.
            // The former -180 line put the ring inside the visible deck plate.
            [390, -80, 680],
            [560, -135, 800],
        ])],
        briefing: 'The Union’s full relic circuit links the carrier, frigate tunnels, and battleship wake. It is a precision run for fast hulls: one missed gate costs more than the shortcut can save.',
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
    const gates = [];
    for (let pointIndex = 1; pointIndex < localPoints.length; pointIndex += 1) {
        const previous = localPoints[pointIndex - 1];
        const current = localPoints[pointIndex];
        const next = localPoints[Math.min(pointIndex + 1, localPoints.length - 1)];
        const direction = [0, 0, 0];
        directionBetween(previous, next === current ? current : next, direction);
        gates.push({
            id: `${config.id}-gate-${gates.length}`,
            index: gates.length,
            kind: pointIndex === localPoints.length - 1 ? 'finish' : 'mandatory',
            localPosition: [...current],
            position: localToWorld(current, center),
            radius: pointIndex === localPoints.length - 1 ? config.finishRadius : config.gateRadius,
            direction,
        });
    }
    const course = {
        ...config,
        center,
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
        laneOffset: -1,
        shortcut: true,
        livery: Object.freeze({ hull: 0xa94c3d, dark: 0x321815, accent: 0xff9b55, canopy: 0x9cf5f2, engine: 0xffad62, warning: 0xffd16f, window: 0xbdfaf3 }),
    }),
    Object.freeze({
        name: "Dara Quill 'Nine Lives'",
        variant: 'lancer',
        laneOffset: 0,
        shortcut: false,
        livery: Object.freeze({ hull: 0x3f7f99, dark: 0x142c3a, accent: 0x72ddff, canopy: 0xa5f3ff, engine: 0x77e5ff, warning: 0xffca69, window: 0xc4f7ff }),
    }),
    Object.freeze({
        name: "Osen Tarn 'Cold Read'",
        variant: 'kestrel',
        laneOffset: 1,
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
        const lane = Number.isFinite(ship.laneOffset) ? ship.laneOffset : index - 1;
        // Keep all three rivals inside the player's forward cockpit view: a
        // centre ship on the second row and two ships on the front row. The
        // earlier wide formation put the outside ships ~69 degrees off-axis
        // and the third behind the player, so the real meshes existed but the
        // pilot could not actually see the waiting field. The player now owns
        // the open rear slot and must race through the stagger.
        const longitudinal = index === 1 ? 25 : 45;
        const lateral = index === 1 ? 0 : lane * 14;
        const vertical = index === 1 ? 2 : 7;
        arrayWrite3(ship.position,
            gx + tmpStageForward[0] * longitudinal + tmpStageSide[0] * lateral + tmpStageUp[0] * vertical,
            gy + tmpStageForward[1] * longitudinal + tmpStageSide[1] * lateral + tmpStageUp[1] * vertical,
            gz + tmpStageForward[2] * longitudinal + tmpStageSide[2] * lateral + tmpStageUp[2] * vertical);
        arrayWrite3(ship.velocity, 0, 0, 0);
        setFacingQuaternion(ship.rotation, tmpStageForward);
        ship.raceGateIndex = 0;
        ship.raceFinished = false;
        ship.raceFinishTime = undefined;
        ship.raceShortcutState = 'none';
        ship.raceShortcutIndex = -1;
        ship.raceShortcutId = undefined;
        ship.raceShortcut = undefined;
    });
    return racers;
};

export const createRaceRacers = (course, _seed, worldTime) => {
    if (!course)
        return [];
    const racers = RACER_DEFS.map((definition, index) => {
        const pace = course.rivalPaces[index] ?? course.racerSpeed ?? 45;
        return {
            id: `race-racer-${index}`,
            spawnTime: Number.isFinite(worldTime) ? worldTime : 0,
            name: definition.name,
            role: 'trader',
            variant: definition.variant,
            faction: 'free-merchants',
            // Race paint is renderer-only identity metadata. It makes the
            // named field readable against dark rocks without changing
            // faction, targeting, collision, or combat rules.
            raceLivery: { ...definition.livery },
            laneOffset: definition.laneOffset,
            race: true,
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
            shield: 1,
            maxShield: 1,
            hull: 1,
            maxHull: 1,
            pace,
            speed: pace,
            afterburnSpeed: pace,
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
    return stageRaceRacers(racers, course);
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
    const lateral = Math.min((Number.isFinite(gate.radius) ? gate.radius : 0) * 0.25, 12);
    const lane = Number.isFinite(ship.laneOffset) ? ship.laneOffset : 0;
    return writePoint(out,
        pointComponent(gate.position, 0) + tmpTargetSide[0] * lane * lateral,
        pointComponent(gate.position, 1) + tmpTargetSide[1] * lane * lateral,
        pointComponent(gate.position, 2) + tmpTargetSide[2] * lane * lateral);
};

// Test a complete motion segment against a gate's forward-facing plane and
// circular aperture. A point merely passing near a ring, or crossing it from
// the exit side, does not count.
export const crossedRaceGate = (previous, current, gate) => {
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
    const radius = Number.isFinite(gate.radius) ? Math.max(0, gate.radius) : 0;
    return radialX * radialX + radialY * radialY + radialZ * radialZ <= radius * radius + 1e-7;
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
        shortcutForShip(ship, course);
    }
    if (ship.raceGateIndex >= course.gates.length) {
        ship.raceFinished = true;
        ship.raceFinishTime = worldTime;
        return false;
    }
    return true;
};

// Advance one kinematic racer without allocating new transform arrays. The
// optional steering hook is useful for tests and future rival personalities;
// normal racers steer toward their active mandatory/shortcut gate.
export const updateRaceRacer = (ship, course, dt, worldTime = 0, steering) => {
    if (!ship || !course || ship.raceFinished || !(dt > 0))
        return ship;
    ensureRacerArrays(ship);
    const pace = Number.isFinite(ship.pace) ? ship.pace : Number.isFinite(ship.speed) ? ship.speed : course.racerSpeed ?? 45;
    arrayRead3(ship.position, tmpRacerPrevious);
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
    const brake = Math.max(0, Math.min(1, Number.isFinite(steering?.brake) ? steering.brake : 0));
    const desiredSpeed = pace * (1 - brake * 0.7);
    arrayRead3(ship.velocity, tmpRacerVelocity);
    const velocityLength = Math.hypot(tmpRacerVelocity[0], tmpRacerVelocity[1], tmpRacerVelocity[2]);
    const blend = velocityLength < 1e-7 ? 1 : Math.max(0, Math.min(1, dt * (ship.turnRate ?? 2.4)));
    const vx = velocityLength < 1e-7 ? tmpRacerDirection[0] * desiredSpeed : tmpRacerVelocity[0] * (1 - blend) + tmpRacerDirection[0] * desiredSpeed * blend;
    const vy = velocityLength < 1e-7 ? tmpRacerDirection[1] * desiredSpeed : tmpRacerVelocity[1] * (1 - blend) + tmpRacerDirection[1] * desiredSpeed * blend;
    const vz = velocityLength < 1e-7 ? tmpRacerDirection[2] * desiredSpeed : tmpRacerVelocity[2] * (1 - blend) + tmpRacerDirection[2] * desiredSpeed * blend;
    arrayWrite3(ship.velocity, vx, vy, vz);
    const currentX = tmpRacerPrevious[0] + vx * dt;
    const currentY = tmpRacerPrevious[1] + vy * dt;
    const currentZ = tmpRacerPrevious[2] + vz * dt;
    arrayWrite3(ship.position, currentX, currentY, currentZ);
    tmpRacerCurrent[0] = currentX;
    tmpRacerCurrent[1] = currentY;
    tmpRacerCurrent[2] = currentZ;
    setFacingQuaternion(ship.rotation, velocityLength < 1e-7 ? tmpRacerDirection : normalizeVector(vx, vy, vz, tmpRacerDirection));

    // A long step may cross more than one plane. Re-use the same endpoint and
    // cap the loop so malformed data cannot turn this hot path into an unbounded
    // loop.
    for (let crossed = 0; crossed < 8 && !ship.raceFinished; crossed += 1) {
        const shortcutRoute = ship.raceShortcutState === 'active' ? course.shortcuts?.[0] : undefined;
        const shortcutGate = shortcutRoute?.gates?.[ship.raceShortcutIndex >= 0 ? ship.raceShortcutIndex : 0];
        const gate = shortcutRoute && shortcutGate ? shortcutGate : course.gates?.[ship.raceGateIndex];
        if (!gate || !crossedRaceGate(tmpRacerPrevious, tmpRacerCurrent, gate))
            break;
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
