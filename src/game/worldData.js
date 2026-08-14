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
    // Rock crown: a broad, flyable tunnel through a ring of massive static bodies.
    const ringRadius = 116;
    for (let index = 0; index < 28; index += 1) {
        const angle = (index / 28) * Math.PI * 2;
        const radial = ringRadius + randomBetween(rng, -8, 10);
        const local = [Math.cos(angle) * radial, Math.sin(angle) * radial * 0.78, randomBetween(rng, -22, 22)];
        const id = `rock-crown-${index}`;
        const remaining = Math.max(0, depleted[id] ?? randomBetween(rng, 2.8, 5.8));
        nodes.push({
            id,
            position: add(center, local),
            velocity: [0, 0, 0],
            radius: randomBetween(rng, 17, 34),
            scale: [randomBetween(rng, 0.8, 1.4), randomBetween(rng, 0.7, 1.3), randomBetween(rng, 0.8, 1.5)],
            rotation: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI],
            rotationSpeed: [0, 0, 0],
            moving: false,
            resource: 'ore',
            richness: randomBetween(rng, 1.4, 2.5),
            remaining,
            scanned: scanned.includes(id),
            tunnelPart: true,
        });
    }
    for (let index = 0; index < 180; index += 1) {
        let offset = sphericalOffset(rng, 735, 70);
        // Keep the central tunnel approach readable.
        if (Math.hypot(offset[0], offset[1]) < 82 && Math.abs(offset[2]) < 330)
            offset = [offset[0] + 135, offset[1], offset[2]];
        const id = `asteroid-static-${index}`;
        const remaining = Math.max(0, depleted[id] ?? randomBetween(rng, 1.2, 5.4));
        nodes.push({
            id,
            position: add(center, offset),
            velocity: [0, 0, 0],
            radius: randomBetween(rng, 4.8, index < 36 ? 29 : 18),
            scale: [randomBetween(rng, 0.65, 1.5), randomBetween(rng, 0.6, 1.4), randomBetween(rng, 0.7, 1.55)],
            rotation: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI],
            rotationSpeed: [0, 0, 0],
            moving: false,
            resource: 'ore',
            richness: randomBetween(rng, 0.75, 2.4),
            remaining,
            scanned: scanned.includes(id),
            tunnelPart: false,
        });
    }
    for (let index = 0; index < 74; index += 1) {
        const offset = sphericalOffset(rng, 720, 38);
        const speed = randomBetween(rng, 0.25, 1.75);
        const theta = rng() * Math.PI * 2;
        const id = `asteroid-drift-${index}`;
        const remaining = Math.max(0, depleted[id] ?? randomBetween(rng, 0.4, 1.8));
        nodes.push({
            id,
            position: add(center, offset),
            velocity: [Math.cos(theta) * speed, randomBetween(rng, -0.25, 0.25), Math.sin(theta) * speed],
            radius: randomBetween(rng, 1.1, 6.4),
            scale: [randomBetween(rng, 0.7, 1.35), randomBetween(rng, 0.7, 1.35), randomBetween(rng, 0.7, 1.35)],
            rotation: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI],
            rotationSpeed: [randomBetween(rng, -0.25, 0.25), randomBetween(rng, -0.25, 0.25), randomBetween(rng, -0.25, 0.25)],
            moving: true,
            resource: 'ore',
            richness: randomBetween(rng, 0.45, 1.35),
            remaining,
            scanned: scanned.includes(id),
            tunnelPart: false,
        });
    }
    return nodes;
};
export const generateGraveyardPieces = (seed) => {
    const rng = seededRandom(`${seed}:graveyard-pieces`);
    const center = LOCATIONS['mourning-line'].position;
    const pieces = [];
    // Ribbed capital-ship passage. The center line stays open for flight.
    for (let rib = 0; rib < 11; rib += 1) {
        const z = center[2] - 245 + rib * 49;
        const radius = 64 + Math.sin(rib * 1.7) * 7.5;
        for (let segment = 0; segment < 12; segment += 1) {
            const angle = (segment / 12) * Math.PI * 2;
            pieces.push({
                id: `rib-${rib}-${segment}`,
                kind: 'beam',
                position: [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius, z],
                rotation: [0, 0, angle],
                scale: [2.4, 20, 2.6],
                collisionRadius: 11,
                moving: false,
                drift: [0, 0, 0],
                spin: [0, 0, 0],
            });
        }
    }
    pieces.push({
        id: 'carrier-keel-left',
        kind: 'hull',
        position: [center[0] - 105, center[1] - 28, center[2] + 35],
        rotation: [0.08, 0.12, -0.16],
        scale: [22, 10, 135],
        collisionRadius: 48,
        moving: false,
        drift: [0, 0, 0],
        spin: [0, 0, 0],
    });
    pieces.push({
        id: 'carrier-keel-right',
        kind: 'hull',
        position: [center[0] + 112, center[1] + 34, center[2] - 48],
        rotation: [-0.05, -0.1, 0.14],
        scale: [19, 9, 118],
        collisionRadius: 43,
        moving: false,
        drift: [0, 0, 0],
        spin: [0, 0, 0],
    });
    pieces.push({
        id: 'carrier-engine',
        kind: 'engine',
        position: [center[0] + 168, center[1] - 70, center[2] - 145],
        rotation: [0.2, 0.7, -0.15],
        scale: [27, 27, 42],
        collisionRadius: 38,
        moving: false,
        drift: [0, 0, 0],
        spin: [0, 0, 0],
    });
    for (let index = 0; index < 128; index += 1) {
        const offset = sphericalOffset(rng, 815, 95);
        const moving = index >= 76;
        const speed = moving ? randomBetween(rng, 0.08, 0.55) : 0;
        const heading = rng() * Math.PI * 2;
        const large = index < 34;
        pieces.push({
            id: `wreck-piece-${index}`,
            kind: pick(rng, ['panel', 'beam', 'hull', 'engine']),
            position: add(center, offset),
            rotation: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI],
            scale: large
                ? [randomBetween(rng, 5, 18), randomBetween(rng, 2.5, 9), randomBetween(rng, 11, 42)]
                : [randomBetween(rng, 0.8, 5.2), randomBetween(rng, 0.6, 4.2), randomBetween(rng, 2.2, 13)],
            collisionRadius: large ? randomBetween(rng, 9, 25) : randomBetween(rng, 1.5, 6.5),
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
    for (let index = 0; index < 48; index += 1) {
        const offset = sphericalOffset(rng, 760, 55);
        const rarityRoll = rng();
        const rarity = rarityRoll > 0.9 ? 'rare' : rarityRoll > 0.62 ? 'uncommon' : 'common';
        const salvage = rarity === 'rare' ? pick(rng, ['electronics', 'arms']) : pick(rng, salvageTypes);
        const id = `salvage-node-${index}`;
        nodes.push({
            id,
            name: `${pick(rng, names)} ${String.fromCharCode(65 + randomInt(rng, 0, 18))}-${randomInt(rng, 10, 99)}`,
            position: add(center, offset),
            radius: randomBetween(rng, 3.2, 9.8),
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
