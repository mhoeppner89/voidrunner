import * as THREE from 'three';
import { LOCATIONS } from './data.js';
import { pick, randomBetween, randomInt, seededRandom } from './random.js';
import { t } from './i18n.js';
import { RACE_COURSES } from './racing.js';
import { GRAVEYARD_COLLISION_PROFILES } from './graveyardCollisionProfiles.js';
import { GRAVEYARD_MODEL_WRECKS, generateWreckNodes, miningClaimCandidates, miningClaimName } from './missionWorldData.js';

// Keep the historical worldData exports stable for game/render callers while
// missions imports the lightweight generator directly.
export { GRAVEYARD_MODEL_WRECKS, generateWreckNodes, miningClaimCandidates, miningClaimName };

// Fixed race courses need fixed flyable corridors. The surrounding fields may
// still vary by seed, but random rocks, fragments, and salvage nodes are never
// placed through an authored main or shortcut line. Large authored wrecks are
// left untouched: those are the meaningful obstacles the Mourning courses are
// designed around.
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
    const limitSq = (Math.max(0, reach) + RACE_CORRIDOR_MARGIN) ** 2;
    for (const [start, end] of RACE_CORRIDORS[zone] ?? [])
        if (pointSegmentDistanceSq(local, start, end) <= limitSq)
            return true;
    return false;
};
const closestRaceFrame = (zone, local, courseId) => {
    let bestDistanceSq = Infinity;
    let bestDirection = [0, 0, 1];
    let bestCenter = [...local];
    const segments = courseId ? courseCorridorSegments(RACE_COURSES[courseId]) : (RACE_CORRIDORS[zone] ?? []);
    for (const [start, end] of segments) {
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const dz = end[2] - start[2];
        const lengthSq = dx * dx + dy * dy + dz * dz;
        const along = lengthSq > 1e-8
            ? Math.max(0, Math.min(1, ((local[0] - start[0]) * dx + (local[1] - start[1]) * dy + (local[2] - start[2]) * dz) / lengthSq))
            : 0;
        const center = [start[0] + dx * along, start[1] + dy * along, start[2] + dz * along];
        const ox = local[0] - center[0];
        const oy = local[1] - center[1];
        const oz = local[2] - center[2];
        const distanceSq = ox * ox + oy * oy + oz * oz;
        if (distanceSq >= bestDistanceSq)
            continue;
        bestDistanceSq = distanceSq;
        bestDirection = [dx, dy, dz];
        bestCenter = center;
    }
    return { center: bestCenter, direction: bestDirection };
};
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
// Loose procedural wreckage stays outside the authored hull envelopes. Most
// salvage does too; the explicitly marked capital-belly hotspots are the sole
// exception. Clearances are placement envelopes, not collision surfaces.
export const overlapsGraveyardModelWreck = (local, reach = 0) => GRAVEYARD_MODEL_WRECKS.some((wreck) => {
    const dx = local[0] - wreck.local[0];
    const dy = local[1] - wreck.local[1];
    const dz = local[2] - wreck.local[2];
    const clearance = wreck.clearanceRadius + Math.max(0, reach);
    return dx * dx + dy * dy + dz * dz < clearance * clearance;
});

const interiorPoint = new THREE.Vector3();
const interiorQuaternion = new THREE.Quaternion();
const interiorEuler = new THREE.Euler();
const pointInWreckInterior = (wreck, local, reach = 0) => {
    if (!wreck.interior)
        return false;
    interiorEuler.set(...wreck.rotation, 'XYZ');
    interiorQuaternion.setFromEuler(interiorEuler).invert();
    interiorPoint.set(
        local[0] - wreck.local[0],
        local[1] - wreck.local[1],
        local[2] - wreck.local[2],
    ).applyQuaternion(interiorQuaternion).multiplyScalar(1 / wreck.scale);
    const padding = Math.max(0, reach) / wreck.scale;
    const bay = wreck.interior;
    return Math.abs(interiorPoint.x - bay.center[0]) <= bay.halfLength - padding
        && Math.abs(interiorPoint.z - bay.center[2]) <= bay.halfWidth - padding
        && Math.abs(interiorPoint.y - bay.center[1]) <= bay.halfHeight - padding;
};
export const graveyardWreckInteriorAt = (local, reach = 0) => GRAVEYARD_MODEL_WRECKS.find((wreck) => pointInWreckInterior(wreck, local, reach))?.id;

const modelColliderMeshCache = new Map();
const scaledColliderMesh = (profileName, sectionIndex, profile, scale) => {
    const key = `${profileName}:${sectionIndex}:${scale}`;
    let cached = modelColliderMeshCache.get(key);
    if (cached)
        return cached;
    const vertices = new Float32Array(profile.vertices.length);
    let radiusSq = 0;
    for (let index = 0; index < profile.vertices.length; index += 3) {
        const x = profile.vertices[index] * scale;
        const y = profile.vertices[index + 1] * scale;
        const z = profile.vertices[index + 2] * scale;
        vertices[index] = x;
        vertices[index + 1] = y;
        vertices[index + 2] = z;
        radiusSq = Math.max(radiusSq, x * x + y * y + z * z);
    }
    const indices = new Uint16Array(profile.indices);
    let minReach = Infinity;
    for (let index = 0; index < indices.length; index += 3) {
        const ia = indices[index] * 3;
        const ib = indices[index + 1] * 3;
        const ic = indices[index + 2] * 3;
        const ax = vertices[ia];
        const ay = vertices[ia + 1];
        const az = vertices[ia + 2];
        const abx = vertices[ib] - ax;
        const aby = vertices[ib + 1] - ay;
        const abz = vertices[ib + 2] - az;
        const acx = vertices[ic] - ax;
        const acy = vertices[ic + 1] - ay;
        const acz = vertices[ic + 2] - az;
        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;
        const normalLength = Math.hypot(nx, ny, nz);
        if (normalLength > 1e-8)
            minReach = Math.min(minReach, Math.abs(ax * nx + ay * ny + az * nz) / normalLength);
    }
    cached = Object.freeze({
        verts: vertices,
        indices,
        radius: Math.sqrt(radiusSq),
        minReach: Number.isFinite(minReach) ? minReach : 0,
    });
    modelColliderMeshCache.set(key, cached);
    return cached;
};

const buildGraveyardModelColliders = () => {
    const center = new THREE.Vector3(...LOCATIONS['mourning-line'].position);
    const configQuaternion = new THREE.Quaternion();
    const sectionCenter = new THREE.Vector3();
    const worldCenter = new THREE.Vector3();
    const colliders = [];
    for (const wreck of GRAVEYARD_MODEL_WRECKS) {
        const profiles = GRAVEYARD_COLLISION_PROFILES[wreck.class] ?? [];
        configQuaternion.setFromEuler(new THREE.Euler(...wreck.rotation, 'XYZ'));
        profiles.forEach((profile, sectionIndex) => {
            const mesh = scaledColliderMesh(wreck.class, sectionIndex, profile, wreck.scale);
            sectionCenter.set(...profile.center).multiplyScalar(wreck.scale).applyQuaternion(configQuaternion);
            worldCenter.copy(center).add(new THREE.Vector3(...wreck.local)).add(sectionCenter);
            const halfExtents = profile.halfExtents.map((extent) => extent * wreck.scale);
            colliders.push(Object.freeze({
                id: `${wreck.id}:section:${sectionIndex}`,
                modelWreckId: wreck.id,
                modelClass: wreck.class,
                sectionName: profile.name,
                position: Object.freeze(worldCenter.toArray()),
                halfExtents: Object.freeze(halfExtents),
                quaternion: Object.freeze(configQuaternion.toArray()),
                collisionRadius: mesh.radius,
                meshVerts: mesh.verts,
                meshIndices: mesh.indices,
                minReach: mesh.minReach,
                surfaceOnly: profile.surfaceOnly === true,
            }));
        });
    }
    return Object.freeze(colliders);
};

// Every collider is a simplified copy of the rendered surface. A torn opening
// therefore stays empty instead of being filled by a convex wrapper.
export const GRAVEYARD_MODEL_COLLIDERS = buildGraveyardModelColliders();
export const GRAVEYARD_MODEL_COLLIDER_MAX_RADIUS = GRAVEYARD_MODEL_COLLIDERS.reduce((largest, collider) => Math.max(largest, collider.collisionRadius), 0);
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

// Rendering and collision share these exact base geometries. Keeping one
// source of truth matters most for flat plates and faceted chunks: an enclosing
// box around either shape creates corners the player cannot see.
const graveyardGeometryCache = new Map();
const extrudedGraveyardGeometry = (profile) => {
    const shape = new THREE.Shape();
    profile.outline.forEach(([x, z], index) => {
        if (index === 0)
            shape.moveTo(x, z);
        else
            shape.lineTo(x, z);
    });
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: profile.depth,
        steps: 1,
        bevelEnabled: true,
        bevelThickness: profile.bevelThickness,
        bevelSize: profile.bevelSize,
        bevelSegments: 1,
        curveSegments: 1,
    });
    geometry.rotateX(Math.PI / 2);
    geometry.center();
    return geometry;
};
export const getGraveyardGeometry = (kind) => {
    let geometry = graveyardGeometryCache.get(kind);
    if (geometry)
        return geometry;
    switch (kind) {
        case 'engine': {
            const profile = GRAVEYARD_GEOMETRY_PROFILES.engine;
            const rimDepth = Math.min(profile.rimDepth, profile.halfHeight * 0.3);
            const innerTop = Math.max(0.05, profile.radiusTop - profile.wallThickness);
            const innerBottom = Math.max(0.05, profile.radiusBottom - profile.wallThickness);
            geometry = new THREE.LatheGeometry([
                new THREE.Vector2(profile.radiusBottom, -profile.halfHeight),
                new THREE.Vector2(profile.radiusBottom, -profile.halfHeight + rimDepth),
                new THREE.Vector2(profile.radiusTop, profile.halfHeight - rimDepth),
                new THREE.Vector2(profile.radiusTop, profile.halfHeight),
                new THREE.Vector2(innerTop, profile.halfHeight),
                new THREE.Vector2(innerTop, profile.halfHeight - rimDepth),
                new THREE.Vector2(innerBottom, -profile.halfHeight + rimDepth),
                new THREE.Vector2(innerBottom, -profile.halfHeight),
                new THREE.Vector2(profile.radiusBottom, -profile.halfHeight),
            ], 12);
            break;
        }
        case 'carrierHull':
        case 'battleshipHull':
        case 'frigateHull':
        case 'bridge':
        case 'panel':
            geometry = extrudedGraveyardGeometry(GRAVEYARD_GEOMETRY_PROFILES[kind]);
            break;
        case 'disc': geometry = new THREE.CylinderGeometry(1, 1, 0.16, 14); break;
        case 'turret': geometry = new THREE.CylinderGeometry(0.72, 1, 0.34, 8); break;
        case 'ring': {
            const profile = GRAVEYARD_GEOMETRY_PROFILES.ring;
            geometry = new THREE.TorusGeometry(profile.majorRadius, profile.tubeRadius, 6, 18);
            break;
        }
        case 'spine': geometry = new THREE.BoxGeometry(0.34, 0.34, 1); break;
        case 'hull': geometry = new THREE.DodecahedronGeometry(0.68, 0); break;
        case 'beam': geometry = new THREE.OctahedronGeometry(0.68, 0); break;
        default: geometry = new THREE.BoxGeometry(1, 1, 1); break;
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    graveyardGeometryCache.set(kind, geometry);
    return geometry;
};

const scaledGeometryCollisionMesh = (geometry, scale) => {
    const source = geometry.getAttribute('position');
    const vertices = new Float32Array(source.count * 3);
    let radiusSq = 0;
    let maxX = 0;
    let maxY = 0;
    let maxZ = 0;
    for (let index = 0; index < source.count; index += 1) {
        const offset = index * 3;
        const x = source.getX(index) * scale[0];
        const y = source.getY(index) * scale[1];
        const z = source.getZ(index) * scale[2];
        vertices[offset] = x;
        vertices[offset + 1] = y;
        vertices[offset + 2] = z;
        const reachSq = x * x + y * y + z * z;
        radiusSq = Math.max(radiusSq, reachSq);
        maxX = Math.max(maxX, Math.abs(x));
        maxY = Math.max(maxY, Math.abs(y));
        maxZ = Math.max(maxZ, Math.abs(z));
    }
    const geometryIndex = geometry.getIndex();
    let indices;
    if (geometryIndex) {
        indices = source.count > 65535
            ? new Uint32Array(geometryIndex.array)
            : new Uint16Array(geometryIndex.array);
    }
    else {
        indices = source.count > 65535 ? new Uint32Array(source.count) : new Uint16Array(source.count);
        for (let index = 0; index < source.count; index += 1)
            indices[index] = index;
    }
    let minReach = Infinity;
    for (let index = 0; index < indices.length; index += 3) {
        const ia = indices[index] * 3;
        const ib = indices[index + 1] * 3;
        const ic = indices[index + 2] * 3;
        const ax = vertices[ia];
        const ay = vertices[ia + 1];
        const az = vertices[ia + 2];
        const abx = vertices[ib] - ax;
        const aby = vertices[ib + 1] - ay;
        const abz = vertices[ib + 2] - az;
        const acx = vertices[ic] - ax;
        const acy = vertices[ic + 1] - ay;
        const acz = vertices[ic + 2] - az;
        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;
        const normalLength = Math.hypot(nx, ny, nz);
        if (normalLength > 1e-8)
            minReach = Math.min(minReach, Math.abs(ax * nx + ay * ny + az * nz) / normalLength);
    }
    return Object.freeze({
        verts: vertices,
        indices,
        radius: Math.sqrt(radiusSq),
        minReach: Number.isFinite(minReach) ? minReach : 0,
        halfExtents: Object.freeze([maxX, maxY, maxZ]),
    });
};

export const graveyardCollisionMesh = (piece) => {
    if (!piece._collisionMesh) {
        const mesh = scaledGeometryCollisionMesh(getGraveyardGeometry(piece.kind), piece.scale);
        // Hollow/non-convex shapes have no safe inscribed solid sphere. Their
        // mesh is used for exact weapon rays while hard collision keeps the
        // analytical open ring/engine test.
        piece._collisionMesh = piece.kind === 'ring' || piece.kind === 'engine'
            ? Object.freeze({ ...mesh, minReach: 0 })
            : mesh;
    }
    return piece._collisionMesh;
};

const wreckNodeGeometryCache = [];
export const getWreckNodeGeometry = (shape = 0) => {
    const index = Math.abs(Math.trunc(shape)) % 4;
    if (!wreckNodeGeometryCache[index]) {
        wreckNodeGeometryCache[index] = [
            () => new THREE.IcosahedronGeometry(1, 1),
            () => new THREE.DodecahedronGeometry(1, 0),
            () => new THREE.BoxGeometry(1.2, 0.7, 1.6),
            () => new THREE.CylinderGeometry(0.55, 0.8, 1.5, 8),
        ][index]();
        wreckNodeGeometryCache[index].computeBoundingBox();
        wreckNodeGeometryCache[index].computeBoundingSphere();
    }
    return wreckNodeGeometryCache[index];
};
export const wreckNodeVisualScale = (node) => node.radius * 1.6;
export const wreckNodeCollisionMesh = (node) => {
    node._collisionMesh ??= scaledGeometryCollisionMesh(getWreckNodeGeometry(node.shape), [wreckNodeVisualScale(node), wreckNodeVisualScale(node), wreckNodeVisualScale(node)]);
    return node._collisionMesh;
};
// The debris field is composed as a handful of readable spaces rather than a
// uniform cloud. These are local coordinates around the mourning-line centre;
// the renderer uses the same data for the visual route markers and the game
// uses it for the compact zone label on the cockpit monitor.
export const GRAVEYARD_ZONE_DEFINITIONS = [
    { id: 'entry-pocket', label: 'ENTRY POCKET / QUIET APPROACH', center: [0, 0, 0], radius: 520 },
    { id: 'carrier-hangar', label: 'CARRIER SALVAGE BAY / NORTH RUN', center: [-650, 850, -1850], radius: 1450 },
    { id: 'battleship-breach', label: 'BATTLESHIP SALVAGE BAY / SOUTH RUN', center: [350, -700, 1900], radius: 1450 },
    { id: 'cruiser-alpha', label: 'CRUISER BREAK / STARBOARD', center: [2850, 850, -1500], radius: 1050 },
    { id: 'cruiser-beta', label: 'CRUISER BREAK / PORT', center: [-3000, -650, 1200], radius: 1050 },
    { id: 'frigate-alpha', label: 'FRIGATE SCREEN / PORT', center: [-2200, 1300, -850], radius: 900 },
    { id: 'frigate-beta', label: 'FRIGATE SCREEN / STARBOARD', center: [1900, -1400, 100], radius: 900 },
    { id: 'outer-wake', label: 'OUTER ESCORT LINE / OPEN DRIFT', center: [0, 100, 3400], radius: 1900 },
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
    const pushIfRaceClear = (node, local, movingMargin = 0) => {
        // Clear the rock's full envelope (sphere ∪ box corner reach), not just
        // its bounding sphere: a rock that misses the corridor by its sphere
        // can still have a spawn-clearance box corner intruding on a gate.
        const reach = asteroidEnvelopeReach(node) + movingMargin;
        if (!intersectsRaceCorridor('shardbelt', local, reach))
            nodes.push(node);
    };
    // Rock crown: a broad, flyable tunnel through a ring of massive static bodies.
    const ringRadius = 372;
    for (let index = 0; index < 36; index += 1) {
        const angle = (index / 36) * Math.PI * 2;
        const radial = ringRadius + randomBetween(rng, -30, 36);
        const local = [Math.cos(angle) * radial, Math.sin(angle) * radial * 0.78, randomBetween(rng, -78, 78)];
        const id = `rock-crown-${index}`;
        const remaining = depletedOrRoll(rng, depleted, id, 3.4, 7.8);
        const node = {
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
        };
        pushIfRaceClear(node, local);
    }
    // Monoliths: huge, jagged slabs you can tuck behind for cover or mine dry.
    for (let index = 0; index < 18; index += 1) {
        const offset = sphericalOffset(rng, 1860, 900);
        const id = `asteroid-monolith-${index}`;
        const remaining = depletedOrRoll(rng, depleted, id, 4, 8);
        const node = {
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
        };
        pushIfRaceClear(node, offset);
    }
    for (let index = 0; index < 330; index += 1) {
        let offset = sphericalOffset(rng, 2200, 210);
        // Keep the central tunnel approach readable.
        if (Math.hypot(offset[0], offset[1]) < 246 && Math.abs(offset[2]) < 990)
            offset = [offset[0] + 405, offset[1], offset[2]];
        const id = `asteroid-static-${index}`;
        const remaining = depletedOrRoll(rng, depleted, id, 1.2, 5.4);
        const node = {
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
        };
        pushIfRaceClear(node, offset);
    }
    for (let index = 0; index < 150; index += 1) {
        const offset = sphericalOffset(rng, 2160, 114);
        const speed = randomBetween(rng, 0.25, 1.75);
        const theta = rng() * Math.PI * 2;
        const id = `asteroid-drift-${index}`;
        const remaining = depletedOrRoll(rng, depleted, id, 0.4, 1.8);
        const node = {
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
        };
        // Drifters remain genuine live hazards, but do not begin directly in
        // a race line. The extra band gives a pilot time to read their motion.
        pushIfRaceClear(node, offset, 34);
    }
    return nodes;
};

// These secondary fields are environmental terrain rather than mining nodes.
// They still use the exact same deformed base meshes as Shardbelt so their
// visible surfaces and hard collision stay in lockstep.
export const REGIONAL_ASTEROID_FIELD_IDS = Object.freeze([
    'foundry-lanes',
    'redwake-belt',
    'pale-rings',
]);
const REGIONAL_FIELD_PROFILES = Object.freeze({
    'foundry-lanes': Object.freeze({ count: 92, flatten: 0.34, corridor: 250, maxRock: 66, landmarks: 7 }),
    'redwake-belt': Object.freeze({ count: 138, flatten: 0.58, corridor: 210, maxRock: 82, landmarks: 12 }),
    'pale-rings': Object.freeze({ count: 168, flatten: 0.075, corridor: 180, maxRock: 58, landmarks: 9, rings: true }),
});
export const generateRegionalAsteroidField = (seed, locationId) => {
    const location = LOCATIONS[locationId];
    const profile = REGIONAL_FIELD_PROFILES[locationId];
    if (!location || !profile)
        return [];
    const rng = seededRandom(`${seed}:regional-asteroids:${locationId}`);
    const nodes = [];
    for (let index = 0; index < profile.count; index += 1) {
        const angle = rng() * Math.PI * 2;
        let local;
        if (profile.rings) {
            // Pale Ring is a broad, thin ice sheet with a readable inner lane.
            // A little radial wobble keeps it natural rather than diagrammatic.
            const radial = location.radius * (0.24 + Math.sqrt(rng()) * 0.7);
            local = [
                Math.cos(angle) * radial * randomBetween(rng, 0.88, 1.12),
                randomBetween(rng, -location.radius * profile.flatten, location.radius * profile.flatten),
                Math.sin(angle) * radial * randomBetween(rng, 0.82, 1.16),
            ];
        }
        else {
            local = sphericalOffset(rng, location.radius * 0.91, location.radius * 0.12);
            local[1] *= profile.flatten;
        }
        // Preserve one long approach corridor through every field. The rocks
        // remain dense to either side, but a new arrival is never born inside
        // an unreadable wall of geometry.
        if (Math.hypot(local[0], local[1]) < profile.corridor && Math.abs(local[2]) < location.radius * 0.78) {
            const side = local[0] < 0 ? -1 : 1;
            local[0] += side * (profile.corridor + randomBetween(rng, 35, 150));
        }
        const landmark = index < profile.landmarks;
        const radius = landmark
            ? randomBetween(rng, profile.maxRock * 1.05, profile.maxRock * 1.75)
            : randomBetween(rng, profile.rings ? 5 : 8, profile.maxRock);
        const scale = profile.rings
            ? [randomBetween(rng, 1.15, 2.35), randomBetween(rng, 0.16, 0.42), randomBetween(rng, 0.7, 1.65)]
            : [randomBetween(rng, 0.68, 1.58), randomBetween(rng, 0.62, 1.34), randomBetween(rng, 0.72, 1.66)];
        nodes.push({
            id: `${locationId}-asteroid-${index}`,
            fieldId: locationId,
            position: add(location.position, local),
            velocity: [0, 0, 0],
            radius,
            scale,
            rotation: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI],
            rotationSpeed: [0, 0, 0],
            moving: false,
            shape: randomInt(rng, 0, 3),
            landmark,
        });
    }
    return nodes;
};
// The rendered rock is a distorted icosahedron scaled by node.scale on each
// axis, so the widest axis — not the nominal node.radius — is what a ship
// actually touches. This is the single source of truth for both hard collision
// and "distance to the surface" reads (scanning, mining, landing).
export const asteroidCollisionRadius = (node) => node.radius * Math.max(node.scale[0], node.scale[1], node.scale[2]);
// The spawn-clearance envelope game.js builds for each rock is an oriented box
// scaled to radius·scale·ASTEROID_COLLISION_FACTOR (0.9). Its corners reach
// 0.9·radius·hypot(scale), which on anisotropic rocks pokes up to ~56% past the
// bounding sphere that asteroidCollisionRadius reports — the hard-collision
// mesh lives between the two. Corridor reservation must clear the LARGER of
// the sphere and the box corner reach, or a rock's box can still intrude on an
// authored gate even though its sphere missed the race line.
export const ASTEROID_COLLISION_FACTOR = 0.9;
export const asteroidEnvelopeReach = (node) => {
    const sx = node.scale[0];
    const sy = node.scale[1];
    const sz = node.scale[2];
    return node.radius * Math.max(Math.max(sx, sy, sz), ASTEROID_COLLISION_FACTOR * Math.hypot(sx, sy, sz));
};
// Broad-phase queries use the exact rendered chunk mesh's farthest vertex.
// Hard collision and weapon hits use the triangles themselves below.
export const wreckNodeCollisionRadius = (node) => wreckNodeCollisionMesh(node).radius;
export const generateGraveyardPieces = (seed) => {
    const rng = seededRandom(`${seed}:graveyard-pieces`);
    const center = LOCATIONS['mourning-line'].position;
    const pieces = [];
    const looseDebrisClearances = [];
    // Local field coordinates: +Z is the player's approach direction, +X is
    // starboard, and +Y is up. The fixed formations tell the battle story;
    // seeded fragment streams add variation without dissolving the landmarks.
    const worldPosition = (local) => add(center, local);
    const pushPiece = ({ id, kind, local, rotation = [0, 0, 0], scale, collisionRadius, halfExtents, moving = false, drift = [0, 0, 0], spin = [0, 0, 0], finish, collidable = true, render = true, zone, route, reserveRaceCorridor = false }) => {
        // Fixed wreck structures are authored around the courses and remain
        // meaningful obstacles. Seeded loose debris is different: reject it
        // before insertion when its full visual reach would intrude into a
        // fixed main or shortcut line.
        const geometryHalfExtents = GRAVEYARD_GEOMETRY_HALF_EXTENTS[kind] ?? [0.5, 0.5, 0.5];
        const visualReach = Math.max(1, Math.hypot(
            geometryHalfExtents[0] * scale[0],
            geometryHalfExtents[1] * scale[1],
            geometryHalfExtents[2] * scale[2],
        ));
        const raceReach = Math.max(collisionRadius ?? 0, visualReach) + (moving ? 28 : 0);
        if (reserveRaceCorridor) {
            if (intersectsRaceCorridor('mourning-line', local, raceReach) || overlapsGraveyardModelWreck(local, raceReach))
                return false;
            for (const placed of looseDebrisClearances) {
                const dx = local[0] - placed.local[0];
                const dy = local[1] - placed.local[1];
                const dz = local[2] - placed.local[2];
                const separation = raceReach + placed.reach + 6;
                if (dx * dx + dy * dy + dz * dz < separation * separation)
                    return false;
            }
        }
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
        if (!render)
            piece.render = false;
        if (halfExtents)
            piece.halfExtents = [...halfExtents];
        if (zone)
            piece.zone = zone;
        if (route)
            piece.route = route;
        pieces.push(piece);
        if (reserveRaceCorridor)
            looseDebrisClearances.push({ local: [...local], reach: raceReach });
        return true;
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
        // The enlarged authored Concord wrecks now carry the field's scale.
        // Retain the carrier silhouette and hangar route, but trim its old
        // oversized proxy chunks so they read as secondary debris.
        scale: piece.scale.map((value) => value * 0.72),
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
    addFrigate('frigate-alpha', [-1220, 760, -1050], -0.34, 0.12, 0.16);
    addFrigate('frigate-beta', [1500, -780, 100], 0.46, -0.14, -0.2);
    // Painted structural hoops make the routes legible without beacon lights.
    // Their torus walls and broken fins are physical; the openings remain true
    // holes, so a precise pilot can thread them while a clipped edge collides.
    const addRouteFrames = ({ route, course, zone, finish, points, widths, heights }) => {
        points.forEach((point, index) => {
            // Face each physical hoop down the nearest authored race segment.
            // A hoop at a bend aligned to the next decorative hoop instead of
            // the incoming flight line forced racers through its visible wall.
            const frame = closestRaceFrame('mourning-line', point, course);
            const [dx, dy, dz] = frame.direction;
            const frameCenter = frame.center;
            const hoopQuaternion = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, 1),
                new THREE.Vector3(dx, dy, dz).normalize(),
            );
            const hoopEuler = new THREE.Euler().setFromQuaternion(hoopQuaternion, 'XYZ');
            const pitch = hoopEuler.x;
            const yaw = hoopEuler.y;
            const width = widths[index] ?? widths[widths.length - 1];
            const height = heights[index] ?? heights[heights.length - 1];
            pushPiece({
                id: `route-${route}-${index}-hoop`,
                kind: 'ring',
                local: frameCenter,
                rotation: [pitch, yaw, 0],
                scale: [width / 2.36, height / 2.36, 16],
                finish,
                zone,
                route,
            });
            // Broken chevrons on the hoop sides indicate the route direction
            // even when the player approaches from an oblique roll angle.
            const sideVector = new THREE.Vector3(1, 0, 0).applyQuaternion(hoopQuaternion);
            [-1, 1].forEach((side) => {
                pushPiece({
                    id: `route-${route}-${index}-fin-${side < 0 ? 'port' : 'starboard'}`,
                    kind: 'panel',
                    local: [frameCenter[0] + sideVector.x * side * width * 0.34, frameCenter[1] + sideVector.y * side * width * 0.34 + height * 0.08, frameCenter[2] + sideVector.z * side * width * 0.34],
                    rotation: [pitch, yaw + side * 0.34, side * 0.16],
                    scale: [width * 0.13, 5, 18],
                    finish,
                    zone,
                    route,
                });
            });
        });
    };
    addRouteFrames({
        route: 'upper-hangar-run',
        course: 'mourning-run',
        zone: 'carrier-hangar',
        finish: 'route-gold',
        points: [[0, 90, -250], [0, 420, -620], [0, 520, -980]],
        widths: [260, 340, 300],
        heights: [160, 220, 195],
    });
    addRouteFrames({
        route: 'lower-breach-crossing',
        course: 'mourning-breach',
        zone: 'battleship-breach',
        finish: 'route-ice',
        points: [[0, -90, 420], [60, -260, 900], [110, -400, 1480]],
        widths: [330, 430, 390],
        heights: [185, 230, 205],
    });
    addRouteFrames({
        route: 'port-frigate-tunnel',
        course: 'mourning-relict-gauntlet',
        zone: 'frigate-alpha',
        finish: 'route-copper',
        points: [[-260, 100, -240], [-760, 480, -650], [-1130, 710, -980]],
        widths: [180, 220, 195],
        heights: [150, 180, 165],
    });
    addRouteFrames({
        route: 'starboard-frigate-tunnel',
        course: 'mourning-relict-gauntlet',
        zone: 'frigate-beta',
        finish: 'route-teal',
        points: [[400, -420, 950], [720, -180, 900], [800, -480, 870]],
        widths: [240, 260, 240],
        heights: [200, 220, 200],
    });
    addRouteFrames({
        route: 'outer-wake-run',
        course: 'mourning-relict-gauntlet',
        zone: 'outer-wake',
        finish: 'route-ash',
        points: [[180, -180, 2700], [0, 420, 3500]],
        widths: [480, 560],
        heights: [285, 320],
    });
    const fragmentScale = (kind, large) => {
        switch (kind) {
            case 'panel': return [randomBetween(rng, 14, large ? 34 : 22), randomBetween(rng, 3, large ? 9 : 6), randomBetween(rng, 20, large ? 56 : 36)];
            case 'beam': return [randomBetween(rng, 8, large ? 20 : 14), randomBetween(rng, 8, large ? 20 : 14), randomBetween(rng, 30, large ? 92 : 58)];
            case 'hull': return [randomBetween(rng, 22, large ? 52 : 34), randomBetween(rng, 10, large ? 25 : 17), randomBetween(rng, 38, large ? 105 : 68)];
            case 'engine': return [randomBetween(rng, 16, large ? 32 : 23), randomBetween(rng, 16, large ? 30 : 22), randomBetween(rng, 22, large ? 58 : 38)];
            case 'spine': return [randomBetween(rng, 5, large ? 12 : 8), randomBetween(rng, 5, large ? 12 : 8), randomBetween(rng, 24, large ? 70 : 46)];
            case 'disc': return [randomBetween(rng, 16, large ? 34 : 23), randomBetween(rng, 4, large ? 11 : 7), randomBetween(rng, 16, large ? 34 : 23)];
            case 'ring': {
                const radius = randomBetween(rng, 16, large ? 46 : 30);
                return [radius, radius * randomBetween(rng, 0.72, 1.12), randomBetween(rng, 4, large ? 10 : 7)];
            }
            default: return [20, 10, 40];
        }
    };
    const addFragmentStream = ({ prefix, origin, direction, length, spread, count, kinds, zone, route, finish }) => {
        const magnitude = Math.hypot(...direction) || 1;
        const unitDirection = direction.map((value) => value / magnitude);
        const yaw = Math.atan2(unitDirection[0], unitDirection[2]);
        let accepted = 0;
        let attempts = 0;
        while (accepted < count && attempts < count * 32) {
            attempts += 1;
            // Impact fragments bunch close to their parent wreck and thin into
            // a directional wake. This preserves the requested quantity while
            // making the field read as several breakups instead of one cloud.
            const fraction = Math.pow(rng(), 1.62);
            const distance = fraction * length;
            const scatter = 0.2 + fraction * 0.8;
            const local = [
                origin[0] + unitDirection[0] * distance + randomBetween(rng, -spread[0] * scatter, spread[0] * scatter),
                origin[1] + unitDirection[1] * distance + randomBetween(rng, -spread[1] * scatter, spread[1] * scatter),
                origin[2] + unitDirection[2] * distance + randomBetween(rng, -spread[2] * scatter, spread[2] * scatter),
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
            // Only a few loose pieces get the upper size range now that the
            // landmark wrecks themselves supply the field's large silhouettes.
            const large = fraction < 0.2 && rng() < 0.38;
            const moving = fraction > 0.54;
            const speed = moving ? randomBetween(rng, 0.12, 0.48) : 0;
            const drift = moving
                ? [unitDirection[0] * speed, unitDirection[1] * speed + randomBetween(rng, -0.05, 0.05), unitDirection[2] * speed]
                : [0, 0, 0];
            const inserted = pushPiece({
                id: `${prefix}-${accepted}`,
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
                reserveRaceCorridor: true,
            });
            if (inserted)
                accepted += 1;
        }
    };
    // Coherent wakes and impact fans replace a uniform spherical scatter. The
    // mix deliberately contains many plates, bars, rings, and faceted chunks;
    // retrying rejected candidates keeps the density stable after the race
    // corridors and all twelve authored wrecks have been reserved.
    addFragmentStream({ prefix: 'carrier-wake', origin: [-650, 850, -1850], direction: [0.16, -0.04, 1], length: 2650, spread: [500, 330, 280], count: 38, kinds: ['panel', 'panel', 'beam', 'hull', 'spine', 'disc', 'ring'], zone: 'carrier-hangar', route: 'upper-hangar-run' });
    addFragmentStream({ prefix: 'impact-port', origin: [350, -700, 1900], direction: [-0.86, 0.26, -0.3], length: 2700, spread: [400, 340, 330], count: 28, kinds: ['panel', 'panel', 'beam', 'hull', 'hull', 'engine', 'spine', 'ring'], zone: 'battleship-breach', route: 'lower-breach-crossing' });
    addFragmentStream({ prefix: 'impact-starboard', origin: [350, -700, 1900], direction: [0.84, -0.28, 0.34], length: 2700, spread: [400, 330, 330], count: 28, kinds: ['panel', 'beam', 'beam', 'hull', 'hull', 'engine', 'spine', 'ring'], zone: 'battleship-breach', route: 'lower-breach-crossing' });
    addFragmentStream({ prefix: 'cruiser-alpha-shatter', origin: [2850, 850, -1500], direction: [0.55, 0.18, -0.82], length: 1550, spread: [240, 200, 220], count: 20, kinds: ['panel', 'beam', 'hull', 'hull', 'spine', 'disc', 'ring'], zone: 'cruiser-alpha' });
    addFragmentStream({ prefix: 'cruiser-beta-shatter', origin: [-3000, -650, 1200], direction: [-0.62, -0.1, 0.78], length: 1550, spread: [240, 200, 220], count: 20, kinds: ['panel', 'beam', 'hull', 'hull', 'spine', 'disc', 'ring'], zone: 'cruiser-beta' });
    addFragmentStream({ prefix: 'frigate-alpha-wake', origin: [-2200, 1300, -850], direction: [-0.68, 0.18, -0.65], length: 1450, spread: [210, 190, 190], count: 16, kinds: ['panel', 'beam', 'hull', 'spine', 'ring'], zone: 'frigate-alpha', route: 'port-frigate-tunnel' });
    addFragmentStream({ prefix: 'frigate-beta-wake', origin: [1900, -1400, 100], direction: [0.62, -0.18, 0.78], length: 1450, spread: [210, 190, 190], count: 16, kinds: ['panel', 'beam', 'hull', 'engine', 'spine', 'ring'], zone: 'frigate-beta', route: 'starboard-frigate-tunnel' });
    addFragmentStream({ prefix: 'escort-crossfire', origin: [-2700, 300, 3300], direction: [1, -0.1, 0.06], length: 5300, spread: [190, 170, 160], count: 22, kinds: ['panel', 'panel', 'beam', 'beam', 'hull', 'spine', 'disc', 'ring'], zone: 'outer-wake' });
    addFragmentStream({ prefix: 'outer-wake', origin: [0, 250, 3000], direction: [0.04, 0.08, 1], length: 2200, spread: [620, 420, 380], count: 24, kinds: ['panel', 'beam', 'hull', 'hull', 'spine', 'disc', 'ring'], zone: 'outer-wake', route: 'outer-wake-run', finish: 'distant' });
    // Finish every physical piece from the same geometry the renderer uses.
    // Rings and engine shells retain their analytical hollow collision; plates,
    // bars, discs, and chunks use their exact triangles.
    for (const piece of pieces) {
        // Procedural stand-ins for the landmark hulls are replaced by adapted
        // GLBs. Route hoops and the carrier impact wake remain, but duplicate
        // hull art and its old oversized collision are suppressed.
        const replacedBattleship = piece.id.startsWith('battleship-');
        const replacedCarrier = piece.id.startsWith('carrier-') && !piece.id.startsWith('carrier-wake-');
        const replacedFrigate = /^frigate-(?:alpha|beta)-(?:mid|bow|deck|prow|keel|bridge|turret|mast|engine|gate)$/.test(piece.id);
        const base = GRAVEYARD_GEOMETRY_HALF_EXTENTS[piece.kind] ?? [0.5, 0.5, 0.5];
        const visualReach = Math.hypot(base[0] * piece.scale[0], base[1] * piece.scale[1], base[2] * piece.scale[2]);
        const local = [piece.position[0] - center[0], piece.position[1] - center[1], piece.position[2] - center[2]];
        const overlapsModel = !piece.id.startsWith('route-') && overlapsGraveyardModelWreck(local, visualReach);
        if (replacedBattleship || replacedCarrier || replacedFrigate || overlapsModel) {
            piece.render = false;
            piece.collidable = false;
        }
        if (piece.collidable !== false && piece.kind !== 'ring' && piece.kind !== 'engine') {
            const collisionMesh = graveyardCollisionMesh(piece);
            piece.halfExtents = [...collisionMesh.halfExtents];
            piece.collisionRadius = collisionMesh.radius;
        }
        else {
            piece.halfExtents ??= [base[0] * piece.scale[0], base[1] * piece.scale[1], base[2] * piece.scale[2]];
            const bounding = Math.hypot(piece.halfExtents[0], piece.halfExtents[1], piece.halfExtents[2]);
            piece.collisionRadius = Math.min(piece.collisionRadius, bounding);
        }
    }
    return pieces;
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
