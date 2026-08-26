import * as THREE from 'three';
import { LOCATIONS } from './data.js';
import { pick, randomBetween, randomInt, seededRandom } from './random.js';
import { t } from './i18n.js';
// The asteroid surface is a detail-2 icosahedron whose vertices are pushed
// radially by a per-variant distortion function, then scaled per axis by the
// rock's radius × node.scale. That deformed mesh is the ONLY source of truth
// for both the rendered rock (render.js builds its instanced geometry from it)
// and the sim's hard collision (game.js tests the ship against these same
// triangles) — so a bump always lands on the exact visible surface.
let asteroidBaseMeshes = null;
const buildAsteroidBaseMeshes = () => {
    const meshes = [];
    for (let variant = 0; variant < 4; variant += 1) {
        const geometry = new THREE.IcosahedronGeometry(1, 2);
        const positions = geometry.getAttribute('position');
        const vertex = new THREE.Vector3();
        for (let index = 0; index < positions.count; index += 1) {
            vertex.fromBufferAttribute(positions, index);
            const seedPhase = variant * 7.31;
            const distortion = 0.72 + 0.32 * Math.sin(vertex.x * (6.3 + variant * 1.9) + vertex.y * (9.7 + variant * 2.3) + vertex.z * (13.1 + variant * 1.5) + seedPhase);
            vertex.multiplyScalar(distortion);
            positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
        }
        positions.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const index = geometry.getIndex();
        let indices;
        if (index) {
            indices = new Uint16Array(index.array);
        }
        else {
            // Non-indexed geometry stores vertices per-triangle in order.
            indices = new Uint16Array(positions.count);
            for (let i = 0; i < positions.count; i += 1)
                indices[i] = i;
        }
        meshes.push({
            geometry,
            positions: new Float32Array(positions.array),
            indices,
        });
    }
    asteroidBaseMeshes = meshes;
    return meshes;
};
export const getAsteroidBaseMeshes = () => asteroidBaseMeshes ?? buildAsteroidBaseMeshes();
// Per-rock collision triangles: the base mesh scaled to the rock's radius ×
// per-axis scale, cached on the node (field layout and scale are stable for a
// session; the rotation is applied by the collider at query time, so drifting
// rocks stay correct through grid rebuilds).
export const asteroidCollisionMesh = (node) => {
    if (!node._collisionMesh) {
        // A node without a shape (hand-built fixtures, legacy saves) falls
        // back to variant 0 so collision never dereferences an empty slot.
        const bases = getAsteroidBaseMeshes();
        const base = bases[Number.isFinite(node.shape) ? node.shape % bases.length : 0];
        const sx = node.radius * node.scale[0];
        const sy = node.radius * node.scale[1];
        const sz = node.radius * node.scale[2];
        const src = base.positions;
        const verts = new Float32Array(src.length);
        let minReachSq = Infinity;
        for (let i = 0; i < src.length; i += 3) {
            verts[i] = src[i] * sx;
            verts[i + 1] = src[i + 1] * sy;
            verts[i + 2] = src[i + 2] * sz;
            const d = verts[i] * verts[i] + verts[i + 1] * verts[i + 1] + verts[i + 2] * verts[i + 2];
            if (d < minReachSq)
                minReachSq = d;
        }
        // minReach is the rock's INSCRIBED sphere: the closest any surface
        // vertex sits to the center. It is the exact-conservative "inside the
        // rock" envelope for projectile line tests — see segmentMeshHit.
        node._collisionMesh = { verts, indices: base.indices, minReach: Math.sqrt(minReachSq) };
    }
    return node._collisionMesh;
};
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
const clamp01 = (value) => Math.max(0, Math.min(1, value));
// Depletion overlays a worked-out amount but must NOT re-order the rng stream:
// a field's layout (positions and per-node rolls) has to stay byte-identical
// whether or not a rock/wreck has been tapped. Always roll, then override with
// the depleted figure when present. This keeps mining-claim positions stable
// across saves and after any rock has been mined.
const depletedOrRoll = (rng, depleted, id, low, high) => {
    const roll = randomBetween(rng, low, high);
    return Math.max(0, depleted[id] ?? roll);
};
// Base half-extents of each graveyard debris geometry, before the per-piece
// scale. These must mirror createGraveyard's geometryFor so the collision box
// is exactly the shape the player sees (the 0.06-thick panels especially — a
// sphere can never approximate a flat slab).
export const GRAVEYARD_GEOMETRY_HALF_EXTENTS = {
    engine: [1, 0.5, 1],
    carrierHull: [0.58, 0.44, 0.62],
    battleshipHull: [0.6, 0.5, 0.68],
    frigateHull: [0.42, 0.38, 0.66],
    bridge: [0.52, 0.4, 0.56],
    // The panel is now a beveled, irregular extrusion rather than a paper-thin
    // box. Keep the collision envelope aligned with the generated geometry.
    panel: [0.56, 0.135, 0.56],
    disc: [1, 0.08, 1],
    turret: [1, 0.2, 1],
    // THREE.TorusGeometry lies in the local XY plane; its hole runs along Z.
    ring: [1.18, 1.18, 0.18],
    spine: [0.17, 0.17, 0.5],
    // Struts render as faceted octahedral members, not square bars.
    beam: [0.68, 0.68, 0.68],
    // Loose hull fragments use a faceted chunk rather than an aligned cube.
    hull: [0.68, 0.68, 0.68],
};
// Open graveyard forms keep their real profile in the simulation too. A box
// around a ring or engine would fill the visible hole and turn it into an
// invisible wall for the player.
export const GRAVEYARD_GEOMETRY_PROFILES = {
    panel: {
        // Local XY outline; render.js rotates the extrusion so its thickness
        // stays on local Y, matching the panel collision frame.
        outline: [
            [-0.5, -0.36],
            [-0.28, -0.5],
            [0.26, -0.47],
            [0.4, -0.29],
            [0.5, -0.18],
            [0.43, 0.4],
            [0.12, 0.5],
            [-0.08, 0.38],
            [-0.42, 0.42],
            [-0.46, 0.08],
        ],
        depth: 0.18,
        bevelThickness: 0.045,
        bevelSize: 0.05,
    },
    // Engines are hollow tapered wreck shells. Keep a real wall in the shared
    // profile so the renderer and the fly-through collision agree on the size
    // of the bore instead of treating the piece as a paper-thin mantle.
    engine: {
        radiusTop: 0.7,
        radiusBottom: 1,
        halfHeight: 0.5,
        wallThickness: 0.12,
        rimDepth: 0.07,
    },
    carrierHull: {
        outline: [
            [-0.36, -0.5], [0.36, -0.5], [0.48, -0.34], [0.5, -0.05],
            [0.34, 0.28], [0.14, 0.5], [0, 0.56], [-0.14, 0.5],
            [-0.34, 0.28], [-0.5, -0.05], [-0.48, -0.34],
        ],
        depth: 0.72,
        bevelThickness: 0.06,
        bevelSize: 0.05,
    },
    battleshipHull: {
        outline: [
            [-0.42, -0.5], [0.42, -0.5], [0.52, -0.22], [0.46, 0.12],
            [0.28, 0.34], [0.1, 0.56], [0, 0.64], [-0.1, 0.56],
            [-0.28, 0.34], [-0.46, 0.12], [-0.52, -0.22],
        ],
        depth: 0.82,
        bevelThickness: 0.07,
        bevelSize: 0.055,
    },
    frigateHull: {
        outline: [
            [-0.26, -0.5], [0.26, -0.5], [0.34, -0.25], [0.2, 0.14],
            [0.08, 0.5], [0, 0.64], [-0.08, 0.5], [-0.2, 0.14],
            [-0.34, -0.25],
        ],
        depth: 0.64,
        bevelThickness: 0.05,
        bevelSize: 0.045,
    },
    bridge: {
        outline: [
            [-0.45, -0.45], [0.45, -0.45], [0.38, 0.22], [0.2, 0.5],
            [-0.2, 0.5], [-0.38, 0.22],
        ],
        depth: 0.68,
        bevelThickness: 0.05,
        bevelSize: 0.045,
    },
    ring: { majorRadius: 1, tubeRadius: 0.18 },
};
// The debris field is composed as a handful of readable spaces rather than a
// uniform cloud. These are local coordinates around the mourning-line centre;
// the renderer uses the same data for the visual route markers and the game
// uses it for the compact zone label on the cockpit monitor.
export const GRAVEYARD_ZONE_DEFINITIONS = [
    { id: 'entry-pocket', label: 'ENTRY POCKET / QUIET APPROACH', center: [0, 0, 0], radius: 360 },
    { id: 'carrier-hangar', label: 'CARRIER HANGAR / TIGHT RUN', center: [0, 500, -930], radius: 540 },
    { id: 'battleship-breach', label: 'BATTLESHIP BREACH / CROSSING', center: [0, -300, 700], radius: 600 },
    { id: 'frigate-alpha', label: 'FRIGATE TUNNEL / PORT', center: [-760, 480, -520], radius: 500 },
    { id: 'frigate-beta', label: 'FRIGATE TUNNEL / STARBOARD', center: [760, -420, 820], radius: 520 },
    { id: 'outer-wake', label: 'OUTER WAKE / OPEN DRIFT', center: [0, 410, 2200], radius: 780 },
];
export const graveyardZoneAt = (position) => {
    const origin = LOCATIONS['mourning-line'].position;
    const px = (Array.isArray(position) ? position[0] : position?.x ?? origin[0]) - origin[0];
    const py = (Array.isArray(position) ? position[1] : position?.y ?? origin[1]) - origin[1];
    const pz = (Array.isArray(position) ? position[2] : position?.z ?? origin[2]) - origin[2];
    let nearest;
    let nearestDistance = Infinity;
    for (const zone of GRAVEYARD_ZONE_DEFINITIONS) {
        const dx = px - zone.center[0];
        const dy = py - zone.center[1];
        const dz = pz - zone.center[2];
        const distance = Math.hypot(dx, dy, dz);
        if (distance <= zone.radius && distance < nearestDistance) {
            nearest = zone;
            nearestDistance = distance;
        }
    }
    return nearest?.id ?? 'field-lanes';
};
export const graveyardZoneLabel = (zoneId) => t(GRAVEYARD_ZONE_DEFINITIONS.find((zone) => zone.id === zoneId)?.label ?? 'FIELD LANES / OPEN DEBRIS');
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
        const remaining = depletedOrRoll(rng, depleted, id, 3.4, 7.8);
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
        const remaining = depletedOrRoll(rng, depleted, id, 4, 8);
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
        const remaining = depletedOrRoll(rng, depleted, id, 1.2, 5.4);
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
        const remaining = depletedOrRoll(rng, depleted, id, 0.4, 1.8);
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
            remaining,
            scanned: scanned.includes(id),
            tunnelPart: false,
            shape: shape(),
        });
    }
    return nodes;
};
// The rendered rock is a distorted icosahedron scaled by node.scale on each
// axis, so the widest axis — not the nominal node.radius — is what a ship
// actually touches. This is the single source of truth for both hard collision
// and "distance to the surface" reads (scanning, mining, landing).
export const asteroidCollisionRadius = (node) => node.radius * Math.max(node.scale[0], node.scale[1], node.scale[2]);
// Wreck nodes use the same scale for their rendered collectible chunk and their
// spherical player/beam collision envelope. Keeping this in worldData avoids the
// renderer and simulation drifting apart as the chunk size is tuned.
export const wreckNodeCollisionRadius = (node) => node.radius * 1.6;
// A mining claim needs a specific, still-rich rock: contracts stake one of the
// monoliths (a big, landmark body) with enough ore left to be worth a trip.
// Replaying the field generation keeps the claim's ore exactly in sync with
// what the player finds on arrival, depletion included.
export const miningClaimCandidates = (seed, depleted, scanned = []) => {
    const field = generateAsteroidField(seed, depleted, scanned);
    const monoliths = field.filter((node) => node.id.startsWith('asteroid-monolith-') && node.remaining >= 4);
    // If every monolith is worked out, fall back to any solid static body with
    // a worthwhile seam (skip the tiny drifting fragments and the rock crown,
    // which is a landmark rather than a stakable claim).
    if (monoliths.length)
        return monoliths;
    return field.filter((node) => node.id.startsWith('asteroid-static-') && node.remaining >= 4);
};
export const miningClaimName = (nodeId) => {
    const parts = nodeId.split('-');
    const number = Number(parts[parts.length - 1]) + 1;
    return parts[1] === 'monolith' ? t('Monolith {number}', { number }) : t('Rock {number}', { number });
};
export const generateGraveyardPieces = (seed) => {
    const rng = seededRandom(`${seed}:graveyard-pieces`);
    const center = LOCATIONS['mourning-line'].position;
    const pieces = [];
    // Local field coordinates: +Z is the player's approach direction, +X is
    // starboard, and +Y is up. The fixed formations tell the battle story;
    // seeded fragment streams add variation without dissolving the landmarks.
    const worldPosition = (local) => add(center, local);
    const pushPiece = ({ id, kind, local, rotation = [0, 0, 0], scale, collisionRadius, moving = false, drift = [0, 0, 0], spin = [0, 0, 0], finish, collidable = true, zone, route }) => {
        const piece = {
            id,
            kind,
            position: worldPosition(local),
            rotation: [...rotation],
            scale: [...scale],
            collisionRadius: collisionRadius ?? Math.max(1, Math.hypot(...scale) * 0.5),
            moving,
            drift: [...drift],
            spin: [...spin],
        };
        if (finish)
            piece.finish = finish;
        if (!collidable)
            piece.collidable = false;
        if (zone)
            piece.zone = zone;
        if (route)
            piece.route = route;
        pieces.push(piece);
    };
    const rotateLocalOffset = ([x, y, z], yaw) => {
        const cosine = Math.cos(yaw);
        const sine = Math.sin(yaw);
        return [x * cosine + z * sine, y, -x * sine + z * cosine];
    };
    const offsetFrom = (anchor, offset, yaw = 0) => {
        const rotated = rotateLocalOffset(offset, yaw);
        return [anchor[0] + rotated[0], anchor[1] + rotated[1], anchor[2] + rotated[2]];
    };
    // Keep the carrier from presenting a perfectly head-on silhouette at the
    // clean entry point. Its broken length should be visible as the player
    // approaches, while the other wrecks retain their separate headings.
    const carrierYaw = 0.36;
    const carrierOffset = [0, 560, -420];
    const pushCarrierPiece = ({ local, rotation = [0, 0, 0], ...piece }) => pushPiece({
        ...piece,
        local: add(rotateLocalOffset(local, carrierYaw), carrierOffset),
        rotation: [rotation[0], rotation[1] + carrierYaw, rotation[2]],
        zone: piece.zone ?? 'carrier-hangar',
    });
    const addCarrierFrame = (index, z) => {
        // The carrier's hangar ribs are deliberately staggered and canted. A
        // perfectly repeated rectangle reads as scaffolding; changing the
        // shoulder, deck height, and missing keel makes this a broken ship
        // section instead of four aligned boxes.
        const section = [
            { shoulder: 322, top: 238, bottom: -210, cant: -0.18 },
            { shoulder: 286, top: 272, bottom: -232, cant: 0.12 },
            { shoulder: 350, top: 214, bottom: -176, cant: -0.24 },
            { shoulder: 252, top: 248, bottom: -220, cant: 0.2 },
        ][index];
        const span = section.shoulder * 2;
        const height = section.top - section.bottom;
        const centerY = (section.top + section.bottom) * 0.5;
        if (index !== 3)
            pushCarrierPiece({ id: `carrier-rib-${index}-port`, kind: 'beam', local: [-section.shoulder, centerY, z], rotation: [0, 0, section.cant], scale: [24, height, 18], finish: 'rust' });
        if (index !== 1)
            pushCarrierPiece({ id: `carrier-rib-${index}-starboard`, kind: 'beam', local: [section.shoulder, centerY, z], rotation: [0, 0, -section.cant], scale: [24, height, 18], finish: 'rust' });
        if (index === 0 || index === 2)
            pushCarrierPiece({ id: `carrier-rib-${index}-top`, kind: 'beam', local: [index % 2 ? -24 : 18, section.top, z], rotation: [0, 0, section.cant * 0.45], scale: [span, 24, 18], finish: 'rust' });
        if (index === 0)
            pushCarrierPiece({ id: `carrier-rib-${index}-keel`, kind: 'beam', local: [-18, section.bottom, z], rotation: [0, 0, -section.cant * 0.7], scale: [span * 0.9, 20, 18], finish: 'rust' });
        if (index === 3)
            pushCarrierPiece({ id: `carrier-rib-${index}-keel-fragment`, kind: 'beam', local: [section.shoulder * 0.42, section.bottom, z], rotation: [0, 0, -section.cant * 0.7], scale: [span * 0.42, 20, 18], finish: 'rust' });
    };
    // One carrier: a long, broken hangar spine with a readable central run.
    pushCarrierPiece({ id: 'carrier-keel-left', kind: 'carrierHull', local: [-260, -80, -610], rotation: [0.04, -0.08, -0.03], scale: [150, 74, 700], finish: 'rust', moving: true, spin: [0.0007, -0.0011, 0.0003] });
    pushCarrierPiece({ id: 'carrier-keel-right', kind: 'carrierHull', local: [250, 40, -500], rotation: [-0.03, 0.1, 0.04], scale: [135, 70, 640], finish: 'rust', moving: true, spin: [-0.0005, 0.0009, -0.0004] });
    pushCarrierPiece({ id: 'carrier-flight-deck', kind: 'carrierHull', local: [0, 170, -680], rotation: [0.04, 0, 0], scale: [380, 22, 620], finish: 'rust', moving: true, spin: [0.0003, 0.0006, -0.0002] });
    pushCarrierPiece({ id: 'carrier-bow', kind: 'carrierHull', local: [0, 45, -1390], rotation: [0, 0.08, 0], scale: [300, 110, 180], finish: 'rust', moving: true, spin: [-0.0004, 0.0003, 0.0002] });
    // Wide deck shoulders and a broken elevator plate make the flight deck
    // read as a carrier at a distance instead of a long rectangular wreck.
    pushCarrierPiece({ id: 'carrier-deck-edge-port', kind: 'carrierHull', local: [-382, 148, -760], rotation: [0.04, -0.02, -0.04], scale: [72, 18, 420], finish: 'rust' });
    pushCarrierPiece({ id: 'carrier-deck-edge-starboard', kind: 'carrierHull', local: [382, 155, -650], rotation: [0.03, 0.03, 0.05], scale: [70, 18, 360], finish: 'rust' });
    pushCarrierPiece({ id: 'carrier-elevator-plate', kind: 'disc', local: [-116, 202, -960], rotation: [0.02, 0.08, 0.02], scale: [92, 8, 148], finish: 'route-gold' });
    // Off-centre island: the asymmetry is the fastest long-range cue that this
    // is a carrier, not a generic beam cage.
    pushCarrierPiece({ id: 'carrier-island', kind: 'bridge', local: [215, 315, -760], rotation: [0.04, -0.12, 0.08], scale: [128, 112, 168], finish: 'rust' });
    pushCarrierPiece({ id: 'carrier-island-turret', kind: 'turret', local: [230, 425, -760], rotation: [0, -0.12, 0], scale: [34, 12, 34], finish: 'rust' });
    pushCarrierPiece({ id: 'carrier-island-mast', kind: 'spine', local: [245, 486, -760], rotation: [0, 0, 0], scale: [12, 12, 92], finish: 'rust' });
    [-1060, -820, -580, -340].forEach((z, index) => addCarrierFrame(index, z));
    pushCarrierPiece({ id: 'carrier-hangar-ring', kind: 'ring', local: [0, 0, -820], scale: [220, 220, 30], finish: 'rust' });
    // The engine bank is behind the hangar. Its central bore is an intentional
    // expert route rather than an accidental gap in the random field.
    const engineRotation = [Math.PI / 2, 0, 0];
    pushCarrierPiece({ id: 'carrier-engine-port', kind: 'engine', local: [-190, -35, 600], rotation: engineRotation, scale: [105, 105, 115], finish: 'rust', zone: 'outer-wake' });
    pushCarrierPiece({ id: 'carrier-engine-starboard', kind: 'engine', local: [190, 35, 630], rotation: [Math.PI / 2, 0.04, 0], scale: [105, 105, 115], finish: 'rust', zone: 'outer-wake' });
    pushCarrierPiece({ id: 'carrier-engine', kind: 'engine', local: [0, -30, 720], rotation: engineRotation, scale: [125, 125, 130], finish: 'rust', zone: 'outer-wake', moving: true, spin: [0.0002, -0.0004, 0.0003] });
    // One battleship crosses below the carrier at the impact point. Split
    // sections leave a narrow, visible gate through the centre instead of a
    // solid wall; the vertical offset makes it a separate layer of the scene.
    const battleshipOffset = [0, -380, 500];
    const pushBattleshipPiece = ({ local, rotation = [0, 0, 0], ...piece }) => pushPiece({
        ...piece,
        local: add(local, battleshipOffset),
        rotation: [rotation[0] + 0.05, rotation[1], rotation[2]],
        zone: piece.zone ?? 'battleship-breach',
    });
    pushBattleshipPiece({ id: 'battleship-bow', kind: 'battleshipHull', local: [520, 85, 120], rotation: [0, -0.12, 0.08], scale: [520, 120, 170], finish: 'metal', moving: true, spin: [0.0002, 0.0005, -0.0003] });
    pushBattleshipPiece({ id: 'battleship-stern', kind: 'battleshipHull', local: [-500, -55, 310], rotation: [0, 0.14, -0.05], scale: [430, 100, 150], finish: 'metal', moving: true, spin: [-0.0003, -0.0004, 0.0002] });
    // The raised prow and long dorsal keel are deliberately asymmetrical: the
    // battleship should read as a warship even when the bow is half lost in
    // the impact fan.
    pushBattleshipPiece({ id: 'battleship-prow', kind: 'battleshipHull', local: [852, 92, 108], rotation: [0.02, -0.2, 0.08], scale: [238, 78, 104], finish: 'metal' });
    pushBattleshipPiece({ id: 'battleship-dorsal-keel', kind: 'spine', local: [248, 116, 268], rotation: [0.02, Math.PI / 2, 0.02], scale: [18, 18, 350], finish: 'metal' });
    pushBattleshipPiece({ id: 'battleship-bow-array', kind: 'beam', local: [680, 258, 118], rotation: [0.06, -0.12, 0.22], scale: [18, 18, 150], finish: 'metal' });
    pushBattleshipPiece({ id: 'battleship-bridge', kind: 'bridge', local: [70, 205, 230], rotation: [0.04, -0.08, 0], scale: [150, 92, 160], finish: 'metal' });
    pushBattleshipPiece({ id: 'battleship-bridge-top', kind: 'bridge', local: [54, 292, 220], rotation: [0.08, -0.12, 0.04], scale: [92, 54, 98], finish: 'metal' });
    pushBattleshipPiece({ id: 'battleship-deck', kind: 'battleshipHull', local: [260, 210, 190], rotation: [0.06, -0.16, 0.03], scale: [260, 16, 145], finish: 'metal' });
    [[330, 235, 80], [650, 220, 165], [-300, 185, 345], [-620, 155, 390]].forEach(([x, y, z], index) => {
        pushBattleshipPiece({ id: `battleship-turret-${index}`, kind: 'turret', local: [x, y, z], rotation: [0, index % 2 ? 0.14 : -0.1, 0], scale: [62, 18, 62], finish: 'metal' });
        pushBattleshipPiece({ id: `battleship-gun-${index}`, kind: 'spine', local: [x + (index % 2 ? 42 : -42), y + 22, z + (index % 2 ? 70 : -70)], rotation: [0, Math.PI / 2, 0], scale: [14, 14, 130], finish: 'metal' });
    });
    pushBattleshipPiece({ id: 'battleship-gate-ring', kind: 'ring', local: [0, -10, 470], scale: [200, 200, 28], finish: 'metal' });
    const addFrigate = (name, anchor, yaw, roll, pitch) => {
        const place = (offset) => offsetFrom(anchor, offset, yaw);
        const rotation = [pitch, yaw, roll];
        pushPiece({ id: `${name}-mid`, kind: 'frigateHull', local: place([0, 0, 0]), rotation, scale: [72, 62, 245], finish: 'metal', zone: name });
        pushPiece({ id: `${name}-bow`, kind: 'frigateHull', local: place([0, 18, 185]), rotation: [pitch + 0.05, yaw, roll], scale: [78, 66, 135], finish: 'metal', zone: name, moving: true, spin: [0.0004, -0.0005, 0.0003] });
        pushPiece({ id: `${name}-deck`, kind: 'frigateHull', local: place([0, 72, 30]), rotation: [pitch + 0.08, yaw, roll], scale: [118, 10, 180], finish: 'metal', zone: name });
        pushPiece({ id: `${name}-prow`, kind: 'frigateHull', local: place([0, 12, 286]), rotation: [pitch + 0.08, yaw, roll], scale: [46, 42, 74], finish: 'metal', zone: name });
        pushPiece({ id: `${name}-keel`, kind: 'spine', local: place([0, -66, 18]), rotation, scale: [10, 10, 182], finish: 'metal', zone: name });
        // A small offset bridge and forward gun give each escort a readable
        // command end when viewed from the side of the field.
        pushPiece({ id: `${name}-bridge`, kind: 'bridge', local: place([32, 112, 18]), rotation: [pitch + 0.1, yaw, roll + 0.04], scale: [58, 48, 78], finish: 'metal', zone: name });
        pushPiece({ id: `${name}-turret`, kind: 'turret', local: place([-18, 150, 108]), rotation: [pitch + 0.04, yaw, roll], scale: [28, 9, 28], finish: 'metal', zone: name });
        pushPiece({ id: `${name}-mast`, kind: 'spine', local: place([35, 158, 8]), rotation: [pitch, yaw, roll], scale: [8, 8, 58], finish: 'metal', zone: name });
        pushPiece({ id: `${name}-engine`, kind: 'engine', local: place([0, -12, -205]), rotation: [Math.PI / 2 + pitch, yaw, roll], scale: [54, 54, 70], finish: 'metal', zone: name });
        pushPiece({ id: `${name}-gate`, kind: 'ring', local: place([0, 0, 120]), rotation: [pitch, yaw, 0], scale: [112, 112, 18], finish: 'metal', zone: name });
    };
    // Two frigates were thrown into distinct upper and lower routes, rather
    // than sharing the carrier/battleship plane.
    addFrigate('frigate-alpha', [-980, 560, -650], -0.34, 0.12, 0.16);
    addFrigate('frigate-beta', [980, -520, 980], 0.46, -0.14, -0.2);
    // Static, painted structural hoops make the routes legible without adding
    // beacon lights or extra animated effects. They are visual-only: a pilot
    // can cut across them, and the actual hull collision remains authoritative.
    const addRouteFrames = ({ route, zone, finish, points, widths, heights }) => {
        points.forEach((point, index) => {
            const next = points[Math.min(index + 1, points.length - 1)];
            const previous = points[Math.max(0, index - 1)];
            const dx = (next[0] - previous[0]) || 0;
            const dy = (next[1] - previous[1]) || 0;
            const dz = (next[2] - previous[2]) || 1;
            const horizontal = Math.hypot(dx, dz) || 1;
            const yaw = Math.atan2(dx, dz);
            const pitch = -Math.atan2(dy, horizontal);
            const width = widths[index] ?? widths[widths.length - 1];
            const height = heights[index] ?? heights[heights.length - 1];
            pushPiece({
                id: `route-${route}-${index}-hoop`,
                kind: 'ring',
                local: point,
                rotation: [pitch, yaw, 0],
                scale: [width / 2.36, height / 2.36, 16],
                finish,
                collidable: false,
                zone,
                route,
            });
            // Broken chevrons on the hoop sides indicate the route direction
            // even when the player approaches from an oblique roll angle.
            const sideX = Math.cos(yaw);
            const sideZ = -Math.sin(yaw);
            [-1, 1].forEach((side) => {
                pushPiece({
                    id: `route-${route}-${index}-fin-${side < 0 ? 'port' : 'starboard'}`,
                    kind: 'panel',
                    local: [point[0] + sideX * side * width * 0.34, point[1] + height * 0.08, point[2] + sideZ * side * width * 0.34],
                    rotation: [pitch, yaw + side * 0.34, side * 0.16],
                    scale: [width * 0.13, 5, 18],
                    finish,
                    collidable: false,
                    zone,
                    route,
                });
            });
        });
    };
    addRouteFrames({
        route: 'upper-hangar-run',
        zone: 'carrier-hangar',
        finish: 'route-gold',
        points: [[0, 90, -250], [0, 420, -620], [0, 520, -980]],
        widths: [260, 340, 300],
        heights: [160, 220, 195],
    });
    addRouteFrames({
        route: 'lower-breach-crossing',
        zone: 'battleship-breach',
        finish: 'route-ice',
        points: [[0, -80, 220], [0, -260, 520], [0, -340, 780]],
        widths: [300, 390, 340],
        heights: [170, 210, 180],
    });
    addRouteFrames({
        route: 'port-frigate-tunnel',
        zone: 'frigate-alpha',
        finish: 'route-copper',
        points: [[-150, 45, -150], [-500, 390, -370], [-790, 520, -560]],
        widths: [180, 220, 195],
        heights: [150, 180, 165],
    });
    addRouteFrames({
        route: 'starboard-frigate-tunnel',
        zone: 'frigate-beta',
        finish: 'route-teal',
        points: [[150, -45, 220], [520, -330, 600], [800, -480, 870]],
        widths: [180, 220, 195],
        heights: [150, 180, 165],
    });
    addRouteFrames({
        route: 'outer-wake-run',
        zone: 'outer-wake',
        finish: 'route-ash',
        points: [[0, 250, 1480], [0, 390, 2020]],
        widths: [420, 480],
        heights: [260, 280],
    });
    const fragmentScale = (kind, large) => {
        switch (kind) {
            case 'panel': return [randomBetween(rng, 14, large ? 34 : 22), randomBetween(rng, 3, large ? 9 : 6), randomBetween(rng, 20, large ? 56 : 36)];
            case 'beam': return [randomBetween(rng, 8, large ? 20 : 14), randomBetween(rng, 8, large ? 20 : 14), randomBetween(rng, 30, large ? 92 : 58)];
            case 'hull': return [randomBetween(rng, 22, large ? 52 : 34), randomBetween(rng, 10, large ? 25 : 17), randomBetween(rng, 38, large ? 105 : 68)];
            case 'engine': return [randomBetween(rng, 16, large ? 32 : 23), randomBetween(rng, 16, large ? 30 : 22), randomBetween(rng, 22, large ? 58 : 38)];
            case 'spine': return [randomBetween(rng, 5, large ? 12 : 8), randomBetween(rng, 5, large ? 12 : 8), randomBetween(rng, 24, large ? 70 : 46)];
            case 'disc': return [randomBetween(rng, 16, large ? 34 : 23), randomBetween(rng, 4, large ? 11 : 7), randomBetween(rng, 16, large ? 34 : 23)];
            default: return [20, 10, 40];
        }
    };
    const addFragmentStream = ({ prefix, origin, direction, length, spread, count, kinds, zone, route, finish }) => {
        const magnitude = Math.hypot(...direction) || 1;
        const unitDirection = direction.map((value) => value / magnitude);
        const yaw = Math.atan2(unitDirection[0], unitDirection[2]);
        for (let index = 0; index < count; index += 1) {
            const fraction = clamp01((index + randomBetween(rng, -0.28, 0.28)) / Math.max(1, count - 1));
            const distance = fraction * length;
            const local = [
                origin[0] + unitDirection[0] * distance + randomBetween(rng, -spread[0], spread[0]),
                origin[1] + unitDirection[1] * distance + randomBetween(rng, -spread[1], spread[1]),
                origin[2] + unitDirection[2] * distance + randomBetween(rng, -spread[2], spread[2]),
            ];
            // Preserve a readable central staging pocket. Fragments still fan
            // through the field, but a random wake point cannot land directly
            // on the combat-sim start and turn it into a surprise wall.
            const centralPocket = Math.hypot(local[0] / 300, local[1] / 360, local[2] / 480);
            if (centralPocket < 1 && distance > length * 0.08) {
                local[0] = (rng() < 0.5 ? -1 : 1) * randomBetween(rng, 360, 520);
                local[1] += (rng() < 0.5 ? -1 : 1) * randomBetween(rng, 180, 320);
            }
            const kind = pick(rng, kinds);
            const large = index < count * 0.18;
            const moving = index >= count * 0.48;
            const speed = moving ? randomBetween(rng, 0.12, 0.48) : 0;
            const drift = moving
                ? [unitDirection[0] * speed, unitDirection[1] * speed + randomBetween(rng, -0.05, 0.05), unitDirection[2] * speed]
                : [0, 0, 0];
            pushPiece({
                id: `${prefix}-${index}`,
                kind,
                local,
                rotation: [randomBetween(rng, -0.18, 0.18), yaw + randomBetween(rng, -0.24, 0.24), randomBetween(rng, -0.38, 0.38)],
                scale: fragmentScale(kind, large),
                moving,
                drift,
                spin: moving ? [randomBetween(rng, -0.08, 0.08), randomBetween(rng, -0.08, 0.08), randomBetween(rng, -0.08, 0.08)] : [0, 0, 0],
                zone,
                route,
                finish,
            });
        }
    };
    // Coherent wakes and impact fans replace the old uniform spherical scatter.
    addFragmentStream({ prefix: 'carrier-wake', origin: [0, 560, 320], direction: [0.08, 0.2, 1], length: 1500, spread: [360, 320, 230], count: 36, kinds: ['panel', 'beam', 'hull', 'spine', 'disc'], zone: 'outer-wake', route: 'upper-hangar-run' });
    addFragmentStream({ prefix: 'impact-port', origin: [-20, -280, 680], direction: [-0.86, 0.26, -0.3], length: 1450, spread: [230, 280, 220], count: 34, kinds: ['panel', 'beam', 'hull', 'engine', 'spine'], zone: 'battleship-breach', route: 'lower-breach-crossing' });
    addFragmentStream({ prefix: 'impact-starboard', origin: [35, -300, 720], direction: [0.84, -0.28, 0.34], length: 1480, spread: [230, 260, 220], count: 34, kinds: ['panel', 'beam', 'hull', 'engine', 'spine'], zone: 'battleship-breach', route: 'lower-breach-crossing' });
    addFragmentStream({ prefix: 'frigate-alpha-wake', origin: [-980, 560, -430], direction: [-0.68, 0.18, -0.65], length: 980, spread: [160, 170, 150], count: 22, kinds: ['panel', 'beam', 'hull', 'spine'], zone: 'frigate-alpha', route: 'port-frigate-tunnel' });
    addFragmentStream({ prefix: 'frigate-beta-wake', origin: [980, -520, 1120], direction: [0.62, -0.18, 0.78], length: 1040, spread: [170, 160, 150], count: 22, kinds: ['panel', 'beam', 'hull', 'engine', 'spine'], zone: 'frigate-beta', route: 'starboard-frigate-tunnel' });
    // A sparse, low-contrast outer wake gives the field a visible exit and
    // keeps the far boundary from ending abruptly at the battleship fan.
    addFragmentStream({ prefix: 'outer-wake', origin: [0, 360, 1420], direction: [0.04, 0.08, 1], length: 1800, spread: [420, 290, 260], count: 26, kinds: ['panel', 'beam', 'hull', 'spine', 'disc'], zone: 'outer-wake', route: 'outer-wake-run', finish: 'distant' });
    // Collision spheres may be tuned smaller than a long piece's visual extent
    // (the carrier keels keep the passage open), but they must never exceed the
    // visual bounding radius — an oversized sphere is an invisible wall that
    // traps the ship. The sphere survives only as the LOS blocking radius; hard
    // collision uses halfExtents as an oriented box so a flat panel blocks its
    // whole face without ballooning into an invisible sphere.
    for (const piece of pieces) {
        const base = GRAVEYARD_GEOMETRY_HALF_EXTENTS[piece.kind] ?? [0.5, 0.5, 0.5];
        piece.halfExtents = [base[0] * piece.scale[0], base[1] * piece.scale[1], base[2] * piece.scale[2]];
        const bounding = Math.hypot(piece.halfExtents[0], piece.halfExtents[1], piece.halfExtents[2]);
        piece.collisionRadius = Math.min(piece.collisionRadius, bounding);
    }
    return pieces;
};
export const generateWreckNodes = (seed, depleted, scanned = []) => {
    const rng = seededRandom(`${seed}:wreck-nodes`);
    const center = LOCATIONS['mourning-line'].position;
    const salvageTypes = ['scrap', 'electronics', 'machinery', 'arms'];
    const names = ['Courier bow', 'Patrol avionics bay', 'Freighter spindle', 'Carrier lifeboat rack', 'Gunship reactor shroud', 'Survey ship core'];
    const nodes = [];
    const salvageSites = [
        { id: 'carrier-hangar', zone: 'carrier-hangar', route: 'upper-hangar-run', label: 'Carrier hangar', center: [0, 520, -1240], spread: [270, 150, 250], count: 14 },
        { id: 'carrier-engines', zone: 'outer-wake', route: 'upper-hangar-run', label: 'Carrier engine bank', center: [0, 540, 300], spread: [280, 160, 200], count: 10 },
        { id: 'battleship-impact', zone: 'battleship-breach', route: 'lower-breach-crossing', label: 'Battleship breach', center: [40, -290, 800], spread: [310, 180, 270], count: 14 },
        { id: 'frigate-alpha', zone: 'frigate-alpha', route: 'port-frigate-tunnel', label: 'Frigate Alpha', center: [-980, 560, -650], spread: [180, 150, 210], count: 10 },
        { id: 'frigate-beta', zone: 'frigate-beta', route: 'starboard-frigate-tunnel', label: 'Frigate Beta', center: [980, -520, 980], spread: [180, 150, 210], count: 10 },
        { id: 'far-wake', zone: 'outer-wake', route: 'outer-wake-run', label: 'Impact wake', center: [0, 450, 2400], spread: [300, 220, 230], count: 6 },
    ];
    let index = 0;
    salvageSites.forEach((site) => {
        for (let siteIndex = 0; siteIndex < site.count; siteIndex += 1) {
            const local = [
                site.center[0] + randomBetween(rng, -site.spread[0], site.spread[0]),
                site.center[1] + randomBetween(rng, -site.spread[1], site.spread[1]),
                site.center[2] + randomBetween(rng, -site.spread[2], site.spread[2]),
            ];
            const salvage = pick(rng, salvageTypes);
            const id = `salvage-node-${index}`;
            nodes.push({
                id,
                name: `${t(site.label)} · ${t(pick(rng, names))} ${String.fromCharCode(65 + randomInt(rng, 0, 18))}-${randomInt(rng, 10, 99)}`,
                position: add(center, local),
                radius: randomBetween(rng, 4, 12),
                salvage,
                remaining: depletedOrRoll(rng, depleted, id, 0.9, 4.2),
                scanned: scanned.includes(id),
                zone: site.zone,
                route: site.route,
            });
            index += 1;
        }
    });
    return nodes;
};
export const buildStaticObstacles = (asteroids, graveyard) => {
    const obstacles = [];
    ['helix', 'rook', 'vesper', 'azure'].forEach((id) => {
        const location = LOCATIONS[id];
        obstacles.push({ id, kind: location.kind, position: [...location.position], radius: location.radius * (location.kind === 'planet' ? 1.04 : 0.78) });
    });
    asteroids.forEach((node) => obstacles.push({ id: node.id, kind: 'asteroid', position: node.position, radius: node.radius * 0.9, velocity: node.velocity }));
    graveyard.filter((piece) => piece.collidable !== false).forEach((piece) => obstacles.push({ id: piece.id, kind: 'wreck', position: piece.position, radius: piece.collisionRadius, velocity: piece.drift }));
    return obstacles;
};
