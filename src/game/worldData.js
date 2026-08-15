import { LOCATIONS } from './data.js';
import { pick, randomBetween, randomInt, seededRandom } from './random.js';
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
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const generateAsteroidField = (seed, depleted, scanned = []) => {
    const rng = seededRandom(`${seed}:asteroid-field`);
    const center = LOCATIONS.shardbelt.position;
    const nodes = [];
    const shape = () => randomInt(rng, 0, 3);
    // Rock crown: a broad, flyable tunnel through a ring of massive static bodies.
    const ringRadius = 372;
    for (let index = 0; index < 36; index += 1) {
        const angle = (index / 36) * Math.PI * 2;
        const radial = ringRadius + randomBetween(rng, -30, 36);
        const local = [Math.cos(angle) * radial, Math.sin(angle) * radial * 0.78, randomBetween(rng, -78, 78)];
        const id = `rock-crown-${index}`;
        const remaining = Math.max(0, depleted[id] ?? randomBetween(rng, 3.4, 7.8));
        nodes.push({
            id,
            position: add(center, local),
            velocity: [0, 0, 0],
            radius: randomBetween(rng, 40, 80),
            scale: [randomBetween(rng, 0.8, 1.4), randomBetween(rng, 0.7, 1.3), randomBetween(rng, 0.8, 1.5)],
            rotation: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI],
            rotationSpeed: [0, 0, 0],
            moving: false,
            resource: 'ore',
            richness: randomBetween(rng, 1.5, 2.7),
            remaining,
            scanned: scanned.includes(id),
            tunnelPart: true,
            shape: shape(),
        });
    }
    // Monoliths: huge, jagged slabs you can tuck behind for cover or mine dry.
    for (let index = 0; index < 18; index += 1) {
        const offset = sphericalOffset(rng, 1860, 900);
        const id = `asteroid-monolith-${index}`;
        const remaining = Math.max(0, depleted[id] ?? randomBetween(rng, 4, 8));
        nodes.push({
            id,
            position: add(center, offset),
            velocity: [0, 0, 0],
            radius: randomBetween(rng, 70, 130),
            scale: [randomBetween(rng, 0.9, 1.6), randomBetween(rng, 0.7, 1.2), randomBetween(rng, 0.85, 1.5)],
            rotation: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI],
            rotationSpeed: [0, 0, 0],
            moving: false,
            resource: 'ore',
            richness: randomBetween(rng, 1.1, 2.2),
            remaining,
            scanned: scanned.includes(id),
            tunnelPart: false,
            shape: shape(),
        });
    }
    for (let index = 0; index < 330; index += 1) {
        let offset = sphericalOffset(rng, 2200, 210);
        // Keep the central tunnel approach readable.
        if (Math.hypot(offset[0], offset[1]) < 246 && Math.abs(offset[2]) < 990)
            offset = [offset[0] + 405, offset[1], offset[2]];
        const id = `asteroid-static-${index}`;
        const remaining = Math.max(0, depleted[id] ?? randomBetween(rng, 1.2, 5.4));
        nodes.push({
            id,
            position: add(center, offset),
            velocity: [0, 0, 0],
            radius: randomBetween(rng, 8, index < 110 ? 64 : 40),
            scale: [randomBetween(rng, 0.65, 1.5), randomBetween(rng, 0.6, 1.4), randomBetween(rng, 0.7, 1.55)],
            rotation: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI],
            rotationSpeed: [0, 0, 0],
            moving: false,
            resource: 'ore',
            richness: randomBetween(rng, 0.75, 2.4),
            remaining,
            scanned: scanned.includes(id),
            tunnelPart: false,
            shape: shape(),
        });
    }
    for (let index = 0; index < 150; index += 1) {
        const offset = sphericalOffset(rng, 2160, 114);
        const speed = randomBetween(rng, 0.25, 1.75);
        const theta = rng() * Math.PI * 2;
        const id = `asteroid-drift-${index}`;
        const remaining = Math.max(0, depleted[id] ?? randomBetween(rng, 0.4, 1.8));
        nodes.push({
            id,
            position: add(center, offset),
            velocity: [Math.cos(theta) * speed, randomBetween(rng, -0.25, 0.25), Math.sin(theta) * speed],
            radius: randomBetween(rng, 2, 11),
            scale: [randomBetween(rng, 0.7, 1.35), randomBetween(rng, 0.7, 1.35), randomBetween(rng, 0.7, 1.35)],
            rotation: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI],
            rotationSpeed: [randomBetween(rng, -0.25, 0.25), randomBetween(rng, -0.25, 0.25), randomBetween(rng, -0.25, 0.25)],
            moving: true,
            resource: 'ore',
            richness: randomBetween(rng, 0.45, 1.35),
            remaining,
            scanned: scanned.includes(id),
            tunnelPart: false,
            shape: shape(),
        });
    }
    return nodes;
};
export const generateGraveyardPieces = (seed) => {
    const rng = seededRandom(`${seed}:graveyard-pieces`);
    const center = LOCATIONS['mourning-line'].position;
    const pieces = [];
    // Ribbed capital-ship passage, scaled 3x. The center line stays open for flight.
    for (let rib = 0; rib < 11; rib += 1) {
        const z = center[2] - 735 + rib * 147;
        const radius = 190 + Math.sin(rib * 1.7) * 22;
        for (let segment = 0; segment < 12; segment += 1) {
            const angle = (segment / 12) * Math.PI * 2;
            pieces.push({
                id: `rib-${rib}-${segment}`,
                kind: 'beam',
                position: [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius, z],
                rotation: [0, 0, angle],
                scale: [7, 60, 8],
                collisionRadius: 33,
                moving: false,
                drift: [0, 0, 0],
                spin: [0, 0, 0],
            });
        }
    }
    pieces.push({
        id: 'carrier-keel-left',
        kind: 'hull',
        position: [center[0] - 354, center[1] - 90, center[2] + 114],
        rotation: [0.08, 0.12, -0.16],
        scale: [90, 42, 516],
        collisionRadius: 186,
        moving: false,
        drift: [0, 0, 0],
        spin: [0, 0, 0],
    });
    pieces.push({
        id: 'carrier-keel-right',
        kind: 'hull',
        position: [center[0] + 384, center[1] + 108, center[2] - 156],
        rotation: [-0.05, -0.1, 0.14],
        scale: [78, 36, 456],
        collisionRadius: 168,
        moving: false,
        drift: [0, 0, 0],
        spin: [0, 0, 0],
    });
    pieces.push({
        id: 'carrier-engine',
        kind: 'engine',
        position: [center[0] + 516, center[1] - 222, center[2] - 450],
        rotation: [0.2, 0.7, -0.15],
        scale: [102, 102, 156],
        collisionRadius: 138,
        moving: false,
        drift: [0, 0, 0],
        spin: [0, 0, 0],
    });
    pieces.push({
        id: 'hull-slab-north',
        kind: 'hull',
        position: [center[0] - 120, center[1] + 270, center[2] + 330],
        rotation: [0.7, -0.2, 0.5],
        scale: [132, 27, 78],
        collisionRadius: 120,
        moving: false,
        drift: [0, 0, 0],
        spin: [0, 0, 0],
    });
    pieces.push({
        id: 'hull-slab-south',
        kind: 'hull',
        position: [center[0] + 165, center[1] - 285, center[2] - 360],
        rotation: [-0.55, 0.25, -0.4],
        scale: [150, 30, 66],
        collisionRadius: 126,
        moving: false,
        drift: [0, 0, 0],
        spin: [0, 0, 0],
    });
    for (let index = 0; index < 260; index += 1) {
        const offset = sphericalOffset(rng, 2445, 285);
        const moving = index >= 150;
        const speed = moving ? randomBetween(rng, 0.08, 0.55) : 0;
        const heading = rng() * Math.PI * 2;
        const large = index < 110;
        pieces.push({
            id: `wreck-piece-${index}`,
            kind: pick(rng, ['panel', 'beam', 'hull', 'engine', 'spine', 'disc', 'ring']),
            position: add(center, offset),
            rotation: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI],
            scale: large
                ? [randomBetween(rng, 21, 72), randomBetween(rng, 9, 33), randomBetween(rng, 42, 162)]
                : [randomBetween(rng, 2.4, 15.6), randomBetween(rng, 1.8, 12.6), randomBetween(rng, 6.6, 39)],
            collisionRadius: large ? randomBetween(rng, 36, 96) : randomBetween(rng, 4.5, 19.5),
            moving,
            drift: moving ? [Math.cos(heading) * speed, randomBetween(rng, -0.18, 0.18), Math.sin(heading) * speed] : [0, 0, 0],
            spin: moving
                ? [randomBetween(rng, -0.12, 0.12), randomBetween(rng, -0.12, 0.12), randomBetween(rng, -0.12, 0.12)]
                : [0, 0, 0],
        });
    }
    return pieces;
};
export const generateWreckNodes = (seed, depleted, scanned = []) => {
    const rng = seededRandom(`${seed}:wreck-nodes`);
    const center = LOCATIONS['mourning-line'].position;
    const salvageTypes = ['scrap', 'electronics', 'machinery', 'arms'];
    const names = ['Courier bow', 'Patrol avionics bay', 'Freighter spindle', 'Carrier lifeboat rack', 'Gunship reactor shroud', 'Survey ship core'];
    const nodes = [];
    for (let index = 0; index < 64; index += 1) {
        const offset = sphericalOffset(rng, 2280, 165);
        const rarityRoll = rng();
        const rarity = rarityRoll > 0.9 ? 'rare' : rarityRoll > 0.62 ? 'uncommon' : 'common';
        const salvage = rarity === 'rare' ? pick(rng, ['electronics', 'arms']) : pick(rng, salvageTypes);
        const id = `salvage-node-${index}`;
        nodes.push({
            id,
            name: `${pick(rng, names)} ${String.fromCharCode(65 + randomInt(rng, 0, 18))}-${randomInt(rng, 10, 99)}`,
            position: add(center, offset),
            radius: randomBetween(rng, 4, 12),
            salvage,
            rarity,
            remaining: Math.max(0, depleted[id] ?? (rarity === 'rare' ? randomBetween(rng, 2.2, 4.2) : randomBetween(rng, 0.9, 2.8))),
            scanned: scanned.includes(id),
            hazard: rarity === 'rare' ? randomBetween(rng, 0.7, 1.5) : randomBetween(rng, 0.1, 0.9),
        });
    }
    return nodes;
};
export const buildStaticObstacles = (asteroids, graveyard) => {
    const obstacles = [];
    ['helix', 'rook', 'vesper', 'azure'].forEach((id) => {
        const location = LOCATIONS[id];
        obstacles.push({ id, kind: location.kind, position: [...location.position], radius: location.radius * (location.kind === 'planet' ? 1.04 : 0.78) });
    });
    asteroids.forEach((node) => obstacles.push({ id: node.id, kind: 'asteroid', position: node.position, radius: node.radius * 0.9, velocity: node.velocity }));
    graveyard.forEach((piece) => obstacles.push({ id: piece.id, kind: 'wreck', position: piece.position, radius: piece.collisionRadius, velocity: piece.drift }));
    return obstacles;
};
