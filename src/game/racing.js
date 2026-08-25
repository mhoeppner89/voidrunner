import { LOCATIONS } from './data.js';
import { clamp, proceduralCallsign, seededRandom } from './random.js';
import { t } from './i18n.js';

export const RACE_QUEST_ID = 'bar-circuit';

export const RACE_COURSES = {
    'shard-gauntlet': {
        id: 'shard-gauntlet',
        title: 'Shard Gauntlet',
        zone: 'shardbelt',
        difficulty: 'standard',
        issuer: 'Helix Pit Boss',
        entryFee: 500,
        payouts: [4200, 1600, -300, -800],
        deadlineSeconds: 900,
        gateCount: 13,
        baseRadius: 900,
        radiusJitter: 280,
        altitude: 280,
        gateRadius: 52,
        racerSpeed: 46,
        briefing: 'Buy into the Shard Gauntlet at the bar. Fly the marked rock course in open space and beat three hired pilots. Finish in the money or eat the loss.',
    },
    'mourning-run': {
        id: 'mourning-run',
        title: 'Mourning Run',
        zone: 'mourning-line',
        difficulty: 'hard',
        issuer: 'Salvage Union Steward',
        entryFee: 1200,
        payouts: [9200, 3400, -600, -1500],
        deadlineSeconds: 900,
        gateCount: 18,
        baseRadius: 800,
        radiusJitter: 340,
        altitude: 360,
        gateRadius: 34,
        racerSpeed: 52,
        briefing: 'The Union posts a tight wreck-corridor race. Small gates, dead hulls, and no second chances. High stakes: first place pays, last place pays the house.',
    },
};

const RACER_NAMES = ['Vex Marlow \'Slipstream\'', 'Dara Quill \'Nine Lives\'', 'Osen Tarn \'Cold Read\''];

export const raceOfferForLocation = (locationId) => {
    if (locationId === 'helix')
        return 'shard-gauntlet';
    if (locationId === 'rook')
        return 'mourning-run';
    return undefined;
};

export const generateRaceCourse = (courseId, seed) => {
    const config = RACE_COURSES[courseId];
    if (!config)
        return undefined;
    const rng = seededRandom(`${seed}:race:${courseId}`);
    const center = LOCATIONS[config.zone].position;
    const gates = [];
    let angle = rng() * Math.PI * 2;
    let radius = config.baseRadius;
    for (let index = 0; index < config.gateCount; index += 1) {
        angle += (Math.PI * 2) / config.gateCount + (rng() - 0.5) * 0.22;
        radius = clamp(radius + (rng() - 0.5) * config.radiusJitter, config.baseRadius * 0.55, config.baseRadius * 1.45);
        const height = Math.sin(angle * 2.4 + index * 0.35) * config.altitude;
        gates.push({
            id: `${courseId}-gate-${index}`,
            index,
            position: [
                center[0] + Math.cos(angle) * radius,
                center[1] + height,
                center[2] + Math.sin(angle) * radius,
            ],
            radius: config.gateRadius,
        });
    }
    return { ...config, gates };
};

export const createRaceRacers = (course, seed, worldTime) => {
    const rng = seededRandom(`${seed}:racers:${course.id}:${Math.floor(worldTime / 60)}`);
    // Everyone lines up behind Gate 1 on the outward axis, facing through it —
    // same grid geometry as the player in startRaceAt.
    const gate0 = course.gates[0];
    const center = LOCATIONS[course.zone].position;
    const outward = [
        gate0.position[0] - center[0],
        gate0.position[1] - center[1],
        gate0.position[2] - center[2],
    ];
    normalizeInPlace(outward);
    const behind = -(gate0.radius * 1.8);
    // Grid slots: racers take staggered wing positions behind Gate 1 (the
    // player holds a laterally offset slot — see startRaceAt). Slots must
    // stay clear of each other's hull envelopes: an overlapped grid pair used
    // to feed resolveShipContacts a degenerate contact and NaN the sim.
    return [0, 1, 2].map((index) => {
        const lateral = (index - 1) * 46;
        return {
            id: `race-racer-${index}`,
            name: RACER_NAMES[index] || proceduralCallsign(rng),
            role: 'trader',
            variant: index === 0 ? 'talon' : index === 1 ? 'lancer' : 'kestrel',
            faction: 'free-merchants',
            position: [
                gate0.position[0] + outward[0] * behind + outward[2] * lateral,
                gate0.position[1] + outward[1] * behind + (index % 2 ? 14 : -14),
                gate0.position[2] + outward[2] * behind - outward[0] * lateral,
            ],
            velocity: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            shield: 1,
            maxShield: 1,
            armor: 1,
            maxArmor: 1,
            hull: 1,
            maxHull: 1,
            speed: course.racerSpeed * (0.94 + index * 0.035),
            afterburnSpeed: course.racerSpeed,
            turnRate: 1.8,
            gunDamage: 0,
            hostile: false,
            dark: false,
            scanned: true,
            surrendered: false,
            claimed: true,
            captured: false,
            race: true,
            raceGateIndex: 0,
            raceFinished: false,
            raceFinishTime: undefined,
        };
    });
};

const tmpDirection = [0, 0, 0];
const normalizeInPlace = (vector) => {
    const length = Math.hypot(vector[0], vector[1], vector[2]);
    if (length < 1e-6)
        return vector;
    vector[0] /= length;
    vector[1] /= length;
    vector[2] /= length;
    return vector;
};

export const updateRaceRacer = (ship, course, dt, worldTime) => {
    if (ship.raceFinished || !course)
        return;
    const gate = course.gates[ship.raceGateIndex];
    if (!gate) {
        ship.raceFinished = true;
        ship.raceFinishTime = worldTime;
        return;
    }
    const dx = gate.position[0] - ship.position[0];
    const dy = gate.position[1] - ship.position[1];
    const dz = gate.position[2] - ship.position[2];
    const distance = Math.hypot(dx, dy, dz);
    if (distance <= gate.radius + 10) {
        ship.raceGateIndex += 1;
        if (ship.raceGateIndex >= course.gates.length) {
            ship.raceFinished = true;
            ship.raceFinishTime = worldTime;
            ship.velocity = [0, 0, 0];
        }
        return;
    }
    tmpDirection[0] = dx;
    tmpDirection[1] = dy;
    tmpDirection[2] = dz;
    normalizeInPlace(tmpDirection);
    const blend = clamp(dt * ship.turnRate, 0, 1);
    const vx = ship.velocity[0] * (1 - blend) + tmpDirection[0] * ship.speed * blend;
    const vy = ship.velocity[1] * (1 - blend) + tmpDirection[1] * ship.speed * blend;
    const vz = ship.velocity[2] * (1 - blend) + tmpDirection[2] * ship.speed * blend;
    ship.velocity = [vx, vy, vz];
    ship.position = [
        ship.position[0] + vx * dt,
        ship.position[1] + vy * dt,
        ship.position[2] + vz * dt,
    ];
};

export const raceRankLabel = (rank) => t(['1ST', '2ND', '3RD', '4TH'][rank - 1] ?? `${rank}TH`);

export const racePayout = (course, rank) => {
    const payouts = course.payouts;
    return payouts[Math.min(rank - 1, payouts.length - 1)];
};

export const raceBriefingLine = (course) => t(course.briefing);
