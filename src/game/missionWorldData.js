import { generateShardbeltDeposits } from './asteroidFieldLayout.js';
import { LOCATIONS } from './data.js';
import { pick, randomBetween, randomInt, seededRandom } from './random.js';
import { t } from './i18n.js';
import { RACE_COURSES } from './racing.js';
import {GRAVEYARD_MODEL_WRECKS,WRECK_SECTION_VARIANTS,WRECK_BREAK_ROUTES,wreckSectionDelta} from './graveyardLayout.js';
export {GRAVEYARD_MODEL_WRECKS,WRECK_SECTION_VARIANTS,WRECK_BREAK_ROUTES,wreckSectionDelta};

// This module contains only the deterministic world data needed to build
// mission boards. Keep it free of render/collision-profile imports: save.js
// reaches missions during title boot, long before a flight scene exists.

// Fixed race courses reserve flyable corridors for mining claims and salvage
// hotspots. This is the same corridor calculation used by worldData.js, kept
// here so mission generation remains independent of the heavy collision data.
const RACE_CORRIDOR_MARGIN = 12;
const courseCorridorSegments = (course) => {
    const segments = [];
    const points = course?.localPoints ?? [];
    for (let index = 1; index < points.length; index += 1)
        segments.push([points[index - 1], points[index]]);
    for (const shortcut of course?.shortcuts ?? []) {
        const shortcutPoints = shortcut.gates?.map((gate) => gate.localPosition) ?? [];
        if (!shortcutPoints.length)
            continue;
        const entry = points[Math.max(0, Math.min(points.length - 1, shortcut.entryIndex))];
        const exit = points[Math.max(0, Math.min(points.length - 1, shortcut.exitIndex + 1))];
        const branch = [entry, ...shortcutPoints, exit].filter(Boolean);
        for (let index = 1; index < branch.length; index += 1)
            segments.push([branch[index - 1], branch[index]]);
    }
    return segments;
};
const buildRaceCorridors = (zone) => {
    const segments = [];
    for (const course of Object.values(RACE_COURSES)) {
        if (course.zone !== zone)
            continue;
        segments.push(...courseCorridorSegments(course));
    }
    return segments;
};
const RACE_CORRIDORS = {
    shardbelt: buildRaceCorridors('shardbelt'),
    'mourning-line': buildRaceCorridors('mourning-line'),
};
const pointSegmentDistanceSq = (point, start, end) => {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const dz = end[2] - start[2];
    const lengthSq = dx * dx + dy * dy + dz * dz;
    const along = lengthSq > 1e-8
        ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy + (point[2] - start[2]) * dz) / lengthSq))
        : 0;
    const ox = point[0] - (start[0] + dx * along);
    const oy = point[1] - (start[1] + dy * along);
    const oz = point[2] - (start[2] + dz * along);
    return ox * ox + oy * oy + oz * oz;
};
const intersectsRaceCorridor = (zone, local, reach) => {
    const limitSq = (Math.max(0, reach) + (zone === 'mourning-line' ? 30 : RACE_CORRIDOR_MARGIN)) ** 2;
    for (const [start, end] of RACE_CORRIDORS[zone] ?? [])
        if (pointSegmentDistanceSq(local, start, end) <= limitSq)
            return true;
    return false;
};

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sphericalOffset = (rng, radius, inner = 0) => {
    const u = rng();
    const v = rng();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const r = randomBetween(rng, inner, radius) * Math.cbrt(rng());
    return [
        Math.sin(phi) * Math.cos(theta) * r,
        Math.cos(phi) * r * 0.62,
        Math.sin(phi) * Math.sin(theta) * r,
    ];
};
const overlapsGraveyardModelWreck = (local, reach = 0) => GRAVEYARD_MODEL_WRECKS.some((wreck) => {
    const dx = local[0] - wreck.local[0];
    const dy = local[1] - wreck.local[1];
    const dz = local[2] - wreck.local[2];
    const clearance = wreck.clearanceRadius + Math.max(0, reach);
    return dx * dx + dy * dy + dz * dz < clearance * clearance;
});

// Equivalent to THREE.Quaternion.setFromEuler(new THREE.Euler(..., 'XYZ')),
// kept scalar so mission generation does not load Three.js just to place a
// salvage marker inside a wreck belly.
const eulerQuaternionXYZ = (rotation) => {
    const [x, y, z] = rotation;
    const c1 = Math.cos(x / 2);
    const c2 = Math.cos(y / 2);
    const c3 = Math.cos(z / 2);
    const s1 = Math.sin(x / 2);
    const s2 = Math.sin(y / 2);
    const s3 = Math.sin(z / 2);
    const qx = s1 * c2 * c3 + c1 * s2 * s3;
    const qy = c1 * s2 * c3 - s1 * c2 * s3;
    const qz = c1 * c2 * s3 + s1 * s2 * c3;
    const qw = c1 * c2 * c3 - s1 * s2 * s3;
    return [qx, qy, qz, qw];
};
const applyQuaternion = (vector, quaternion) => {
    const [qx, qy, qz, qw] = quaternion;
    const tx = 2 * (qy * vector[2] - qz * vector[1]);
    const ty = 2 * (qz * vector[0] - qx * vector[2]);
    const tz = 2 * (qx * vector[1] - qy * vector[0]);
    return [
        vector[0] + qw * tx + qy * tz - qz * ty,
        vector[1] + qw * ty + qz * tx - qx * tz,
        vector[2] + qw * tz + qx * ty - qy * tx,
    ];
};
const inverseEulerXYZ = (vector, rotation) => {
    const [qx, qy, qz, qw] = eulerQuaternionXYZ(rotation);
    // Inverse of a unit quaternion is its conjugate.
    return applyQuaternion(vector, [-qx, -qy, -qz, qw]);
};
const pointInWreckInterior = (wreck, local, reach = 0) => {
    if (!wreck.interior)
        return false;
    const point = inverseEulerXYZ([
        local[0] - wreck.local[0],
        local[1] - wreck.local[1],
        local[2] - wreck.local[2],
    ], wreck.rotation).map((value) => value / wreck.scale);
    const padding = Math.max(0, reach) / wreck.scale;
    const bay = wreck.interior;
    return Math.abs(point[0] - bay.center[0]) <= bay.halfLength - padding
        && Math.abs(point[2] - bay.center[2]) <= bay.halfWidth - padding
        && Math.abs(point[1] - bay.center[1]) <= bay.halfHeight - padding;
};
const graveyardWreckInteriorAt = (local, reach = 0) => GRAVEYARD_MODEL_WRECKS.find((wreck) => pointInWreckInterior(wreck, local, reach))?.id;

// The four salvage-node geometries are fixed and their exact bounding radii
// are the only collision detail needed for deterministic placement. These
// values match the vertices used by worldData.getWreckNodeGeometry().
const WRECK_NODE_GEOMETRY_RADII = [
    1.0000000091763788, // IcosahedronGeometry(1, 1)
    0.9999999820517685, // DodecahedronGeometry(1, 0)
    1.0594810255551494, // BoxGeometry(1.2, 0.7, 1.6)
    1.0965856368819007, // CylinderGeometry(0.55, 0.8, 1.5, 8)
];
const wreckNodeCollisionRadius = (node) => {
    const shape = Math.abs(Math.trunc(node.shape ?? 0)) % WRECK_NODE_GEOMETRY_RADII.length;
    return node.radius * 1.6 * WRECK_NODE_GEOMETRY_RADII[shape];
};

export const generateWreckNodes = (seed, depleted, scanned = []) => {
    const rng = seededRandom(`${seed}:wreck-nodes`);
    const center = LOCATIONS['mourning-line'].position;
    const salvageTypes = ['scrap', 'electronics', 'machinery', 'arms'];
    const hotspotSalvageTypes = ['electronics', 'machinery', 'arms', 'electronics', 'machinery'];
    const names = ['Armor plate', 'Avionics bay', 'Drive spindle', 'Lifeboat rack', 'Reactor shroud', 'Sensor core', 'Gun mount', 'Coolant manifold'];
    const nodes = [];
    const salvageSites = GRAVEYARD_MODEL_WRECKS.map((wreck) => {
        const suffix = wreck.id.replace(/^concord-/, '').replace(/-wreck$/, '').split('-').map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join(' ');
        const isAlpha = wreck.id.includes('frigate-alpha');
        const isBeta = wreck.id.includes('frigate-beta');
        return {
            wreck,
            label: suffix,
            count: wreck.class === 'battleship' ? 16 : wreck.class === 'carrier' ? 14 : wreck.class === 'cruiser' ? 10 : 5,
            interiorCount: wreck.interior?.hotspotCount ?? 0,
            zone: wreck.class === 'carrier'
                ? 'carrier-hangar'
                : wreck.class === 'battleship'
                    ? 'battleship-breach'
                    : wreck.id.includes('cruiser-alpha')
                        ? 'cruiser-alpha'
                        : wreck.id.includes('cruiser-beta')
                            ? 'cruiser-beta'
                            : isAlpha
                                ? 'frigate-alpha'
                                : isBeta
                                    ? 'frigate-beta'
                                    : 'outer-wake',
            route: wreck.class === 'carrier' ? 'upper-hangar-run' : wreck.class === 'battleship' ? 'lower-breach-crossing' : isAlpha ? 'port-frigate-tunnel' : isBeta ? 'starboard-frigate-tunnel' : undefined,
        };
    });
    let index = 0;
    const overlapsNode = (node, extra = 4) => nodes.some((placed) => {
        const reach = wreckNodeCollisionRadius(node) + wreckNodeCollisionRadius(placed) + extra;
        const dx = node.position[0] - placed.position[0];
        const dy = node.position[1] - placed.position[1];
        const dz = node.position[2] - placed.position[2];
        return dx * dx + dy * dy + dz * dz < reach * reach;
    });
    const createNode = (site, hotspot) => {
        const candidateIndex = index;
        index += 1;
        const shape = candidateIndex % 4;
        const radius = randomBetween(rng, 2.6, 7.2);
        const salvage = pick(rng, hotspot ? hotspotSalvageTypes : salvageTypes);
        const id = `salvage-node-${candidateIndex}`;
        const name = `${t(site.label)} · ${t(pick(rng, names))} ${String.fromCharCode(65 + randomInt(rng, 0, 18))}-${randomInt(rng, 10, 99)}`;
        // Keep the same random draw for every save; the original capacity lets
        // the renderer recognize a partially opened piece after a reload.
        const initialRemaining = randomBetween(rng, hotspot ? 1.6 : 0.9, hotspot ? 5.4 : 4.2);
        return {
            id,
            name,
            position: [0, 0, 0],
            radius,
            shape,
            rotation: [
                (candidateIndex * 0.73) % Math.PI,
                (candidateIndex * 1.17) % Math.PI,
                (candidateIndex * 0.41) % Math.PI,
            ],
            salvage,
            initialRemaining,
            remaining: Math.max(0, depleted[id] ?? initialRemaining),
            salvageDamaged: Object.hasOwn(depleted,id) && depleted[id] < initialRemaining,
            scanned: scanned.includes(id),
            zone: site.zone,
            route: site.route,
            hotspot: hotspot ? `${site.wreck.id}:belly` : undefined,
            insideWreckId: hotspot ? site.wreck.id : undefined,
        };
    };
    const fieldLocalFromModel = (wreck, modelLocal) => {
        // Rotate the model-space offset by the forward quaternion. Keeping
        // this scalar avoids loading Three.js for mission generation.
        const [x, y, z] = wreck.rotation;
        const c1 = Math.cos(x / 2);
        const c2 = Math.cos(y / 2);
        const c3 = Math.cos(z / 2);
        const s1 = Math.sin(x / 2);
        const s2 = Math.sin(y / 2);
        const s3 = Math.sin(z / 2);
        const qx = s1 * c2 * c3 + c1 * s2 * s3;
        const qy = c1 * s2 * c3 - s1 * c2 * s3;
        const qz = c1 * c2 * s3 + s1 * s2 * c3;
        const qw = c1 * c2 * c3 - s1 * s2 * s3;
        const rotate = (vector) => {
            const tx = 2 * (qy * vector[2] - qz * vector[1]);
            const ty = 2 * (qz * vector[0] - qx * vector[2]);
            const tz = 2 * (qx * vector[1] - qy * vector[0]);
            return [
                vector[0] + qw * tx + qy * tz - qz * ty,
                vector[1] + qw * ty + qz * tx - qx * tz,
                vector[2] + qw * tz + qx * ty - qy * tx,
            ];
        };
        const rotated = rotate([modelLocal[0] * wreck.scale, modelLocal[1] * wreck.scale, modelLocal[2] * wreck.scale]);
        return [wreck.local[0] + rotated[0], wreck.local[1] + rotated[1], wreck.local[2] + rotated[2]];
    };
    for (const site of salvageSites) {
        // Capital bellies are purposeful reward spaces: salvage sits in side
        // pockets while the middle half stays open for flight and racing.
        let interiorAccepted = 0;
        let interiorAttempts = 0;
        while (interiorAccepted < site.interiorCount && interiorAttempts < site.interiorCount * 48) {
            interiorAttempts += 1;
            const node = createNode(site, true);
            const bay = site.wreck.interior;
            const reach = wreckNodeCollisionRadius(node);
            const modelPadding = reach / site.wreck.scale;
            const pairIndex = Math.floor(interiorAccepted / 2);
            const pairCount = Math.ceil(site.interiorCount / 2);
            const side = interiorAccepted % 2 === 0 ? -1 : 1;
            const xFraction = -0.72 + (pairIndex / Math.max(1, pairCount - 1)) * 1.44;
            const modelLocal = [
                bay.center[0] + bay.halfLength * xFraction + randomBetween(rng, -0.018, 0.018),
                bay.center[1] - bay.halfHeight * randomBetween(rng, 0.08, 0.28),
                bay.center[2] + side * (bay.halfWidth * randomBetween(rng, 0.69, 0.8)),
            ];
            modelLocal[0] = Math.max(bay.center[0] - bay.halfLength + modelPadding, Math.min(bay.center[0] + bay.halfLength - modelPadding, modelLocal[0]));
            modelLocal[1] = Math.max(bay.center[1] - bay.halfHeight + modelPadding, Math.min(bay.center[1] + bay.halfHeight - modelPadding, modelLocal[1]));
            modelLocal[2] = Math.max(bay.center[2] - bay.halfWidth + modelPadding, Math.min(bay.center[2] + bay.halfWidth - modelPadding, modelLocal[2]));
            const local = fieldLocalFromModel(site.wreck, modelLocal);
            node.position = add(center, local);
            if (intersectsRaceCorridor('mourning-line', local, reach)
                || graveyardWreckInteriorAt(local, reach) !== site.wreck.id
                || overlapsNode(node, 8))
                continue;
            nodes.push(node);
            interiorAccepted += 1;
        }

        let accepted = 0;
        let attempts = 0;
        const exteriorCount = site.count - interiorAccepted;
        while (accepted < exteriorCount && attempts < Math.max(1, exteriorCount) * 96) {
            attempts += 1;
            const node = createNode(site, false);
            const nodeReach = wreckNodeCollisionRadius(node);
            const theta = rng() * Math.PI * 2;
            const vertical = randomBetween(rng, -0.68, 0.68);
            const planar = Math.sqrt(1 - vertical * vertical);
            const radial = site.wreck.clearanceRadius + nodeReach + randomBetween(rng, 70, site.wreck.class === 'frigate' ? 240 : 380);
            const local = [
                site.wreck.local[0] + Math.cos(theta) * planar * radial,
                site.wreck.local[1] + vertical * radial,
                site.wreck.local[2] + Math.sin(theta) * planar * radial,
            ];
            node.position = add(center, local);
            if (Math.hypot(...local) > 5300 || intersectsRaceCorridor('mourning-line', local, nodeReach) || overlapsGraveyardModelWreck(local, nodeReach))
                continue;
            if (overlapsNode(node))
                continue;
            nodes.push(node);
            accepted += 1;
        }
    }
    // The tutorial selects the first external fragment by the port frigate.
    // Move just that fragment closer after generation, so the RNG stream and
    // other salvage IDs in existing saves never change.
    const recorder = nodes.find(node => node.zone === 'frigate-alpha' && !node.insideWreckId);
    const frigate = GRAVEYARD_MODEL_WRECKS.find(wreck => wreck.id === 'concord-frigate-alpha-wreck');
    if (recorder && frigate) {
        const local = recorder.position.map((value, i) => value - center[i]);
        const direction = local.map((value, i) => value - frigate.local[i]);
        const length = Math.hypot(...direction), reach = wreckNodeCollisionRadius(recorder);
        for (const shift of [50, 40, 30, 20, 10]) {
            const candidate = local.map((value, i) => value - direction[i] / length * shift);
            if (overlapsGraveyardModelWreck(candidate, reach) || intersectsRaceCorridor('mourning-line', candidate, reach)) continue;
            const world = add(center, candidate);
            if (nodes.some(other => other !== recorder && Math.hypot(...other.position.map((v,i) => v - world[i])) < reach + wreckNodeCollisionRadius(other) + 4)) continue;
            recorder.position = world;
            break;
        }
    }
    return nodes;
};

// A mining claim needs a specific, still-rich rock: contracts stake one of
// the monoliths, with static bodies as a deterministic fallback.
export const miningClaimCandidates = (seed, depleted, scanned = []) => {
    const field = generateShardbeltDeposits(seed, depleted, scanned);
    const monoliths = field.filter((node) => node.id.startsWith('asteroid-monolith-') && node.remaining >= 4);
    if (monoliths.length)
        return monoliths;
    return field.filter((node) => node.id.startsWith('asteroid-static-') && node.remaining >= 4);
};
export const miningClaimName = (nodeId) => {
    const parts = nodeId.split('-');
    const number = Number(parts[parts.length - 1]) + 1;
    return parts[1] === 'monolith' ? t('Monolith {number}', { number }) : t('Rock {number}', { number });
};
