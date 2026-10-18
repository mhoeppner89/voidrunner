import * as THREE from 'three';
import { generateShardbeltDeposits } from './asteroidFieldLayout.js';
import { LOCATIONS } from './data.js';
import { pick, randomBetween, randomInt, seededRandom } from './random.js';
import { t } from './i18n.js';
import {raceBoostLayout} from './raceDynamics.js';
import { RACE_COURSES } from './racing.js';
import { GRAVEYARD_COLLISION_PROFILES } from './graveyardCollisionProfiles.js';
import { wreckSectionDelta, GRAVEYARD_MODEL_WRECKS, generateWreckNodes, miningClaimCandidates, miningClaimName } from './missionWorldData.js';

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
        if(zone==='mourning-line')for(const p of raceBoostLayout(course.localPoints))segments.push([p.approach,p.position],[p.position,p.rejoin]);
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
// Asteroid surfaces use detail-1/2 icosahedra whose vertices are pushed
// radially by a per-variant distortion function, then scaled per axis by the
// rock's radius × node.scale. That deformed mesh is the ONLY source of truth
// for both the rendered rock (render.js builds its instanced geometry from it)
// and the sim's hard collision (game.js tests the ship against these same
// triangles) — so a bump always lands on the exact visible surface.
let asteroidBaseMeshes = null;
const buildAsteroidBaseMeshes = () => {
    const meshes = [];
    for (let variant = 0; variant < 8; variant += 1) {
        const geometry = new THREE.IcosahedronGeometry(1, variant < 4 ? 2 : 1);
        const positions = geometry.getAttribute('position');
        const vertex = new THREE.Vector3();
        for (let index = 0; index < positions.count; index += 1) {
            vertex.fromBufferAttribute(positions, index);
            const seedPhase = variant * 7.31;
            const distortion = variant < 4
                ? 0.72 + 0.32 * Math.sin(vertex.x * (6.3 + variant * 1.9) + vertex.y * (9.7 + variant * 2.3) + vertex.z * (13.1 + variant * 1.5) + seedPhase)
                : .84 + .11 * Math.sin(vertex.x * 3.3 + vertex.y * 4.1 + vertex.z * 3.7 + seedPhase)
                    + .035 * Math.sin(vertex.x * 9.1 - vertex.z * 7.3 + seedPhase);
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
    // Deposits are whole cargo units. Legacy fractional remnants still yield
    // their final unit, matching the former beam extraction behavior.
    return Math.ceil(Math.max(0, depleted[id] ?? roll));
};
// Base half-extents of each graveyard debris geometry, before the per-piece
// scale. These must mirror createGraveyard's geometryFor so the collision box
// is exactly the shape the player sees (the 0.06-thick panels especially — a
// sphere can never approximate a flat slab).
export const GRAVEYARD_GEOMETRY_HALF_EXTENTS = {
    engine: [1, 0.5, 1],
    girder: [0.5, 0.5, 0.5],
    machinery: [0.5, 0.5, 0.5],
    vessel: [0.5, 0.5, 0.5],
    carrierHull: [0.58, 0.44, 0.62],
    battleshipHull: [0.6, 0.5, 0.68],
    frigateHull: [0.42, 0.38, 0.66],
    bridge: [0.52, 0.4, 0.56],
    // The panel is now a beveled, irregular extrusion rather than a paper-thin
    // box. Keep the collision envelope aligned with the generated geometry.
    panel: [0.56, 0.135, 0.56],
    shard: [0.54, 0.2, 0.54],
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
    const sectionQuaternion = new THREE.Quaternion();
    const colliderQuaternion = new THREE.Quaternion();
    const worldCenter = new THREE.Vector3();
    const colliders = [];
    for (const wreck of GRAVEYARD_MODEL_WRECKS) {
        const profiles = GRAVEYARD_COLLISION_PROFILES[wreck.modelKey??wreck.class] ?? [];
        configQuaternion.setFromEuler(new THREE.Euler(...wreck.rotation, 'XYZ'));
        profiles.forEach((profile, sectionIndex) => {
            const mesh = scaledColliderMesh(wreck.modelKey??wreck.class, sectionIndex, profile, wreck.scale);
            const delta = wreckSectionDelta(wreck, profile.name);
            sectionQuaternion.setFromEuler(new THREE.Euler(...(delta?.rotation ?? [0, 0, 0]), 'XYZ'));
            colliderQuaternion.copy(configQuaternion).multiply(sectionQuaternion);
            sectionCenter.set(...profile.center).applyQuaternion(sectionQuaternion);
            if (delta) sectionCenter.add(new THREE.Vector3(...delta.position));
            sectionCenter.multiplyScalar(wreck.scale).applyQuaternion(configQuaternion);
            worldCenter.copy(center).add(new THREE.Vector3(...wreck.local)).add(sectionCenter);
            const halfExtents = profile.halfExtents.map((extent) => extent * wreck.scale);
            colliders.push(Object.freeze({
                id: `${wreck.id}:section:${sectionIndex}`,
                modelWreckId: wreck.id,
                modelClass: wreck.class,
                modelAssetKey: wreck.modelKey??wreck.class,
                sectionName: profile.name,
                position: Object.freeze(worldCenter.toArray()),
                halfExtents: Object.freeze(halfExtents),
                quaternion: Object.freeze(colliderQuaternion.toArray()),
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
        case 'shard': {
            geometry=extrudedGraveyardGeometry({outline:[[-.49,-.42],[-.2,-.5],[.16,-.37],[.47,-.44],[.32,-.12],[.5,.12],[.11,.5],[-.04,.25],[-.4,.4]],depth:.055,bevelThickness:.012,bevelSize:.014});
            const a=geometry.attributes.position;
            for(let i=0;i<a.count;i++){const x=a.getX(i),z=a.getZ(i);a.setY(i,a.getY(i)+Math.max(0,z+.05)*.38+Math.max(0,-x-.2)*.22);}
            geometry.center();geometry.computeVertexNormals();break;
        }
        case 'disc': geometry = new THREE.CylinderGeometry(1, 1, 0.16, 14); break;
        case 'turret': geometry = new THREE.CylinderGeometry(0.72, 1, 0.34, 8); break;
        case 'ring': {
            const profile = GRAVEYARD_GEOMETRY_PROFILES.ring;
            geometry = new THREE.TorusGeometry(profile.majorRadius, profile.tubeRadius, 6, 18);
            break;
        }
        case 'machinery': {
            geometry=extrudedGraveyardGeometry({outline:[[-.44,-.5],[.44,-.5],[.5,-.44],[.5,.44],[.44,.5],[-.44,.5],[-.5,.44],[-.5,-.44]],depth:.9,bevelThickness:.025,bevelSize:.025});
            geometry.computeBoundingBox();
            const size=geometry.boundingBox.getSize(new THREE.Vector3());geometry.scale(1/size.x,1/size.y,1/size.z);
            break;
        }
        case 'vessel':
            geometry=new THREE.LatheGeometry([[0,-.5],[.38,-.5],[.5,-.38],[.5,.38],[.38,.5],[0,.5]].map(p=>new THREE.Vector2(...p)),12);
            break;
        case 'girder': {
            // Closed I-section. The flange/web triangles are used by both
            // instanced rendering and the exact surface collider.
            const positions=[], normals=[], uvs=[];
            for(const [w,h,y] of [[1,.14,-.43],[.18,.72,0],[1,.14,.43]]) {
                const box=new THREE.BoxGeometry(w,h,1).toNonIndexed();box.translate(0,y,0);
                positions.push(...box.attributes.position.array);normals.push(...box.attributes.normal.array);uvs.push(...box.attributes.uv.array);box.dispose();
            }
            geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
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
// Mining boards and the live field use one lightweight, deterministic layout.
export const generateAsteroidField = generateShardbeltDeposits;

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
    const pushPiece = ({ id, kind, local, rotation = [0, 0, 0], scale, collisionRadius, halfExtents, moving = false, drift = [0, 0, 0], spin = [0, 0, 0], finish, collidable = true, render = true, zone, route, attachedWreckId, interiorPart, debrisCloud, reserveRaceCorridor = false }) => {
        // Fixed wreck structures are authored around the courses and remain
        // meaningful obstacles. Seeded loose debris is different: reject it
        // before insertion when its full visual reach would intrude into a
        // fixed main or shortcut line.
        const geometryHalfExtents = GRAVEYARD_GEOMETRY_HALF_EXTENTS[kind] ?? [0.5, 0.5, 0.5];
        if(kind === 'panel') {
            // A real extrusion can still read as a vanishing plane when its
            // Y scale is tiny. Keep a readable edge on every loose plate,
            // including the dense small-debris clouds, before clearance checks.
            const depth = Math.max(.2,Math.min(scale[0],scale[2])*.045);
            scale = [scale[0],Math.max(scale[1],depth/(2*geometryHalfExtents[1])),scale[2]];
        }
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
        if (attachedWreckId) piece.attachedWreckId=attachedWreckId;
        if (interiorPart) piece.interiorPart=interiorPart;
        if (debrisCloud) piece.debrisCloud=debrisCloud;
        if (zone)
            piece.zone = zone;
        if (route)
            piece.route = route;
        pieces.push(piece);
        if (reserveRaceCorridor)
            looseDebrisClearances.push({ local: [...local], reach: raceReach });
        return true;
    };
    // Optional racing stabilizers lie alongside physical wreck fragments. The
    // ship-width approach and return are reserved too, across every seed.
    for(const course of Object.values(RACE_COURSES))if(course.zone==='mourning-line')for(const p of raceBoostLayout(course.localPoints)){
        const parent=GRAVEYARD_MODEL_WRECKS.find(w=>Math.hypot(...p.hazard.map((v,j)=>v-w.local[j]))<w.clearanceRadius+26);
        pushPiece({id:`boost-debris-${course.id}-${p.index}`,kind:'machinery',local:p.hazard,scale:[12,18,38],rotation:[.2,.4,-.3],finish:'structure',attachedWreckId:parent?.id});
    }
    // Substantial wreckage inside otherwise empty bends. These are torn
    // assemblies, not race furniture: thick folded skins, broken spars and
    // exposed machinery. Existing geometry/material batches are reused.
    const turnDebris = [
        {id:'carrier-torn-drive', center:[-180,1440,-180], size:100, rotation:[.25,.6,-.35]},
        {id:'battleship-keel-section', center:[-1400,-200,2720], size:170, rotation:[-.2,-.3,.4]},
        {id:'cruiser-reactor-spar', center:[-2100,40,850], size:240, rotation:[.35,.45,-.25]},
    ];
    for (const assembly of turnDebris) {
        const {id,center:anchor,size,rotation}=assembly;
        const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
        const part=(name,kind,offset,dimensions,turn=[0,0,0])=>{
            const local=new THREE.Vector3(...offset).multiplyScalar(size).applyQuaternion(q).add(new THREE.Vector3(...anchor));
            const orientation=q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...turn)));
            const e=new THREE.Euler().setFromQuaternion(orientation);
            pushPiece({id:`turn-debris-${id}-${name}`,kind,local:local.toArray(),scale:dimensions.map(v=>v*size),rotation:[e.x,e.y,e.z],finish:kind==='shard'?'metal':'structure'});
        };
        part('port-spar','girder',[-.22,0,0],[.055,.075,1.05]);
        part('starboard-spar','girder',[.22,0,.08],[.055,.075,.88],[.08,0,.12]);
        part('cross-member','girder',[0,0,-.2],[.05,.06,.57],[0,Math.PI/2,0]);
        part('torn-skin','shard',[-.1,.08,-.05],[.56,.28,.74],[.12,.15,.35]);
        part('folded-skin','shard',[.2,-.06,.2],[.35,.25,.46],[-.2,.2,-.7]);
        part('power-unit','machinery',[0,-.05,-.1],[.26,.21,.32],[.1,0,.1]);
        part('severed-tank','vessel',[.15,-.08,.23],[.17,.3,.17],[.25,0,.4]);
        // Keep subsequent seeded debris from interpenetrating this assembly.
        looseDebrisClearances.push({local:anchor,reach:size*.7});
    }
    // The GLB casualties are the only large hulls. Old proxy ships and
    // freestanding race hoops made the battlefield read as a training course.
    // Racing keeps its existing gates; ordinary exploration sees real debris.
    const fragmentScale = (kind, large) => {
        switch(kind) {
            case 'shard': {const length=randomBetween(rng,large?55:24,large?140:70);return [length*randomBetween(rng,.35,.8),length*.7,length];}
            case 'girder': return [randomBetween(rng,5,large?12:8),randomBetween(rng,6,large?16:10),randomBetween(rng,35,large?170:78)];
            case 'engine': return [randomBetween(rng,16,large?44:24),randomBetween(rng,20,large?70:40),randomBetween(rng,16,large?44:24)];
            case 'spine': return [randomBetween(rng,8,large?18:12),randomBetween(rng,8,large?18:12),randomBetween(rng,30,large?100:60)];
            default: return [randomBetween(rng,22,large?100:44),randomBetween(rng,4,large?15:8),randomBetween(rng,30,large?150:70)];
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
            const selectedKind=pick(rng,kinds),kind=selectedKind==='panel'&&rng()<.45?'shard':selectedKind;
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
                rotation: [randomBetween(rng,-Math.PI,Math.PI),yaw+randomBetween(rng,-Math.PI,Math.PI),randomBetween(rng,-Math.PI,Math.PI)],
                scale: fragmentScale(kind, large),
                moving,
                drift,
                spin: moving ? [randomBetween(rng, -0.08, 0.08), randomBetween(rng, -0.08, 0.08), randomBetween(rng, -0.08, 0.08)] : [0, 0, 0],
                zone,
                route,
                finish:kind==='shard'?'metal':finish,
                reserveRaceCorridor: true,
            });
            if (inserted)
                accepted += 1;
        }
    };
    // Coherent wakes and impact fans replace a uniform spherical scatter. The
    // mix contains torn plates, I-beams, severed spars and engine shrouds;
    // retrying rejected candidates keeps the density stable after the race
    // corridors and all fourteen authored wrecks have been reserved.
    addFragmentStream({ prefix: 'carrier-wake', origin: [-650, 850, -1850], direction: [0.16, -0.04, 1], length: 2650, spread: [500, 330, 280], count: 38, kinds: ['panel', 'panel', 'girder', 'panel', 'spine', 'spine', 'panel'], zone: 'carrier-hangar', route: 'upper-hangar-run' });
    addFragmentStream({ prefix: 'impact-port', origin: [350, -700, 1900], direction: [-0.86, 0.26, -0.3], length: 2700, spread: [400, 340, 330], count: 28, kinds: ['panel', 'panel', 'girder', 'panel', 'panel', 'engine', 'spine', 'panel'], zone: 'battleship-breach', route: 'lower-breach-crossing' });
    addFragmentStream({ prefix: 'impact-starboard', origin: [350, -700, 1900], direction: [0.84, -0.28, 0.34], length: 2700, spread: [400, 330, 330], count: 28, kinds: ['panel', 'girder', 'girder', 'panel', 'panel', 'engine', 'spine', 'panel'], zone: 'battleship-breach', route: 'lower-breach-crossing' });
    addFragmentStream({ prefix: 'cruiser-alpha-shatter', origin: [2850, 850, -1500], direction: [0.55, 0.18, -0.82], length: 1550, spread: [240, 200, 220], count: 20, kinds: ['panel', 'girder', 'panel', 'panel', 'spine', 'spine', 'panel'], zone: 'cruiser-alpha' });
    addFragmentStream({ prefix: 'cruiser-beta-shatter', origin: [-3000, -650, 1200], direction: [-0.62, -0.1, 0.78], length: 1550, spread: [240, 200, 220], count: 20, kinds: ['panel', 'girder', 'panel', 'panel', 'spine', 'spine', 'panel'], zone: 'cruiser-beta' });
    addFragmentStream({ prefix: 'frigate-alpha-wake', origin: [-2200, 1300, -850], direction: [-0.68, 0.18, -0.65], length: 1450, spread: [210, 190, 190], count: 16, kinds: ['panel', 'girder', 'panel', 'spine', 'panel'], zone: 'frigate-alpha', route: 'port-frigate-tunnel' });
    addFragmentStream({ prefix: 'frigate-beta-wake', origin: [1900, -1400, 100], direction: [0.62, -0.18, 0.78], length: 1450, spread: [210, 190, 190], count: 16, kinds: ['panel', 'girder', 'panel', 'engine', 'spine', 'panel'], zone: 'frigate-beta', route: 'starboard-frigate-tunnel' });
    addFragmentStream({ prefix: 'escort-crossfire', origin: [-2000, -1250, 2800], direction: [1, -0.1, 0.06], length: 5300, spread: [190, 170, 160], count: 22, kinds: ['panel', 'panel', 'girder', 'girder', 'panel', 'spine', 'spine', 'panel'], zone: 'outer-wake' });
    addFragmentStream({ prefix: 'outer-wake', origin: [0, 250, 3000], direction: [0.04, 0.08, 1], length: 2200, spread: [620, 420, 380], count: 24, kinds: ['panel', 'girder', 'panel', 'panel', 'spine', 'spine', 'panel'], zone: 'outer-wake', route: 'outer-wake-run', finish: 'distant' });
    // Dense local pockets, rather than another uniform layer across the
    // field. Independent RNG leaves existing debris and salvage identities alone.
    const cloudRandom=seededRandom(`${seed}:graveyard-small-clouds`);
    const clouds=[
        ['carrier-break',[-150,1450,-200],[155,85,120]],
        ['battleship-break',[-1320,-400,2750],[170,100,125]],
        ['cruiser-alpha-break',[3900,1050,-2500],[110,70,100]],
        ['cruiser-beta-break',[-3700,-450,1850],[115,75,100]],
    ];
    for(const [id,anchor,spread]of clouds) {
        let accepted=0;
        for(let attempt=0;accepted<96&&attempt<6000;attempt++) {
            const local=anchor.map((v,i)=>v+randomBetween(cloudRandom,-spread[i],spread[i]));
            if(Math.hypot(...local.map((v,i)=>(v-anchor[i])/spread[i]))>1)continue;
            const kind=pick(cloudRandom,['panel','panel','panel','girder','spine']);
            const length=randomBetween(cloudRandom,2,11),scale=kind==='panel'?[length*.7,randomBetween(cloudRandom,.25,1),length]:[randomBetween(cloudRandom,.5,1.4),randomBetween(cloudRandom,.5,1.4),length];
            if(pushPiece({id:`cloud-${id}-${accepted}`,kind,local,scale,rotation:[cloudRandom()*Math.PI,cloudRandom()*Math.PI,cloudRandom()*Math.PI],finish:'structure',debrisCloud:id,collidable:length>=7,reserveRaceCorridor:true}))accepted++;
        }
    }
    const passageBoxes=wreck=>(wreck.passages??[]).map(route=>{
        const margin=16/wreck.scale;
        return new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...route.center),new THREE.Vector3(2*(route.halfWidth+margin),2*(route.halfHeight+margin),2*route.halfLength));
    });
    // All attached equipment shares the hull/section transform and collision.
    // Keep the whole authored interior volume free, including salvage pockets.
    const component=(wreck,id,kind,point,dimensions,localRotation=[0,0,0],section)=>{
        const sectionPose=section?wreckSectionDelta(wreck,section):undefined;
        const partRotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...localRotation));
        const sectionRotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(sectionPose?.rotation??[0,0,0])));
        const local=new THREE.Vector3(...point).applyQuaternion(sectionRotation);
        if(sectionPose)local.add(new THREE.Vector3(...sectionPose.position));
        const modelBounds=new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(),new THREE.Vector3(...dimensions)).applyMatrix4(new THREE.Matrix4().compose(local,sectionRotation.clone().multiply(partRotation),new THREE.Vector3(1,1,1)));
        if(passageBoxes(wreck).some(box=>modelBounds.intersectsBox(box)))return;
        const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...wreck.rotation));
        const world=local.clone().multiplyScalar(wreck.scale).applyQuaternion(rotation).add(new THREE.Vector3(...wreck.local));
        const orientation=rotation.clone().multiply(sectionRotation).multiply(partRotation),euler=new THREE.Euler().setFromQuaternion(orientation);
        const scale=dimensions.map(v=>v*wreck.scale),reach=Math.hypot(...scale)*.5;
        if(intersectsRaceCorridor('mourning-line',world.toArray(),reach))return;
        if(wreck.interior) {
            const box=new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...point),new THREE.Vector3(...dimensions));
            const bay=wreck.interior,pad=14/wreck.scale;
            const free=new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...bay.center),new THREE.Vector3(2*(bay.halfLength+pad),2*(bay.halfHeight*.9+pad),2*(bay.halfWidth*.9+pad)));
            if(box.intersectsBox(free))return;
        }
        pushPiece({id:`interior-${wreck.id}-${id}`,kind,local:world.toArray(),scale,rotation:[euler.x,euler.y,euler.z],finish:kind==='vessel'?'structure':'machinery',attachedWreckId:wreck.id,interiorPart:id});
    };
    // Exposed load-bearing frames sit at the walls and below the flight
    // lane. They belong to each hull, unlike the old freestanding torus hoops.
    // They use the same transformed triangle geometry for collision.
    for(const wreck of GRAVEYARD_MODEL_WRECKS.filter(w=>w.interior)) {
        const bay=wreck.interior, rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...wreck.rotation));
        const transform=p=>new THREE.Vector3(...p).multiplyScalar(wreck.scale).applyQuaternion(rotation).add(new THREE.Vector3(...wreck.local));
        const strut=(id,a,b,width)=>{
            const bounds=new THREE.Box3().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]).expandByScalar(width/wreck.scale);
            if(passageBoxes(wreck).some(box=>bounds.intersectsBox(box)))return;
            const from=transform(a),to=transform(b),delta=to.clone().sub(from),mid=from.clone().add(to).multiplyScalar(.5);
            const reach=delta.length()*.5+width;
            if(intersectsRaceCorridor('mourning-line',mid.toArray(),reach))return;
            const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),delta.normalize());
            const e=new THREE.Euler().setFromQuaternion(q);
            pushPiece({id:`structure-${wreck.id}-${id}`,kind:'girder',local:mid.toArray(),rotation:[e.x,e.y,e.z],scale:[width,width,from.distanceTo(to)],finish:'structure',attachedWreckId:wreck.id});
        };
        // Find the real inner wall instead of building a rectangular cage
        // from a clearance box. A missing wall means a torn opening: no post
        // is allowed to hang in open space just to complete the frame.
        const profile=GRAVEYARD_COLLISION_PROFILES[wreck.modelKey??wreck.class].find(p=>p.name===bay.sectionName);
        const ray=new THREE.Ray(),v0=new THREE.Vector3(),v1=new THREE.Vector3(),v2=new THREE.Vector3(),hit=new THREE.Vector3();
        const surface=(start,direction,max)=>{
            ray.set(new THREE.Vector3(...start).sub(new THREE.Vector3(...profile.center)),new THREE.Vector3(...direction));
            let nearest=max,result;
            for(let i=0;i<profile.indices.length;i+=3) {
                v0.fromArray(profile.vertices,profile.indices[i]*3);v1.fromArray(profile.vertices,profile.indices[i+1]*3);v2.fromArray(profile.vertices,profile.indices[i+2]*3);
                if(ray.intersectTriangle(v0,v1,v2,false,hit)) {
                    const distance=hit.distanceTo(ray.origin);
                    if(distance<nearest&&distance>.008){nearest=distance;result=hit.clone().add(new THREE.Vector3(...profile.center));}
                }
            }
            return result?.toArray();
        };
        let priorFloor=[];
        for(const [i,fraction]of [-.78,-.26,.26,.78].entries()) {
            const x=bay.center[0]+bay.halfLength*fraction,y=bay.center[1],z=bay.center[2],w=Math.max(3,wreck.scale*.004),floor=[];
            for(const [j,side]of [-1,1].entries()) {
                const low=surface([x,y-bay.halfHeight*.5,z],[0,0,side],bay.halfWidth*3.2);
                const high=surface([x,y+bay.halfHeight*.5,z],[0,0,side],bay.halfWidth*3.2);
                if(low&&high)strut(`rib-${i}-${side}`,low,high,w);
                floor[j]=surface([x,y,z+side*bay.halfWidth*.6],[0,-1,0],bay.halfHeight*3.2);
                if(floor[j]&&priorFloor[j])strut(`sill-${i}-${side}`,priorFloor[j],floor[j],w);
            }
            if(floor[0]&&floor[1])strut(`deck-${i}`,floor[0],floor[1],w);
            // Machinery occupies surviving space outside the navigable bay,
            // with different equipment in hangars, weapons decks and cruisers.
            const cellLength=bay.halfLength*.38;
            for(const side of [-1,1]) {
                const inner=bay.center[2]+side*(bay.halfWidth+.002);
                const samples=[-.15,0,.15].map(f=>surface([x+cellLength*f,y,z],[0,0,side],bay.halfWidth*3.2));
                if(samples.every(Boolean)) {
                    const outer=side<0?Math.max(...samples.map(p=>p[2]))+.012:Math.min(...samples.map(p=>p[2]))-.012;
                    const depth=(outer-inner)*side;
                    if(depth>.02) {
                        const midZ=(inner+outer)*.5,roof=surface([x,y,midZ],[0,1,0],bay.halfHeight*4),bottom=surface([x,y,midZ],[0,-1,0],bay.halfHeight*4);
                        if(roof&&bottom){
                            const height=Math.min(bay.halfHeight*.9,(roof[1]-y)*1.65,(y-bottom[1])*1.65);
                            if(height>.015)component(wreck,`systems-${i}-${side}`,'machinery',[x,y,midZ],[cellLength,height,depth*.88]);
                            const tankHeight=Math.min(bay.halfHeight*.55,(roof[1]-y-height*.5)*.7);
                            if(i%2===0&&tankHeight>.018)component(wreck,`tank-${i}-${side}`,'vessel',[x,y+height*.5+tankHeight*.55,midZ],[cellLength*.65,tankHeight,depth*.65]);
                        }
                    }
                }
            }
            for(const [j,side]of [-1,1].entries())if(floor[j]) {
                const floorY=floor[j][1]+.004,top=bay.center[1]-bay.halfHeight-.015,height=top-floorY;
                if(height>.015) {
                    const point=[x,floorY+height*.5,z+side*bay.halfWidth*.58];
                    component(wreck,`lower-bay-${i}-${side}`,wreck.class==='carrier'?'machinery':'vessel',point,[cellLength,height*.85,bay.halfWidth*.62]);
                    component(wreck,`deck-${i}-${side}`,'machinery',[x,top+.009,point[2]],[cellLength*1.04,.012,bay.halfWidth*.68]);
                }
            }
            priorFloor=floor;
        }
    }
    // Smaller hulls retain compact systems instead of becoming empty tubes.
    // Cores stay inside the central portion of each torn section, with conduits
    // and transverse ribs visible at the break. No new fly-through route here.
    for(const wreck of GRAVEYARD_MODEL_WRECKS)for(const [i,profile]of GRAVEYARD_COLLISION_PROFILES[wreck.modelKey??wreck.class].entries()) {
        if(profile.name===wreck.interior?.sectionName)continue;
        const [hx,hy,hz]=profile.halfExtents,centre=profile.center;
        const ray=new THREE.Ray(),v0=new THREE.Vector3(),v1=new THREE.Vector3(),v2=new THREE.Vector3(),hit=new THREE.Vector3();
        const wall=(point,direction)=>{
            ray.set(new THREE.Vector3(...point).sub(new THREE.Vector3(...centre)),new THREE.Vector3(...direction));let nearest=Infinity;
            for(let j=0;j<profile.indices.length;j+=3) {
                v0.fromArray(profile.vertices,profile.indices[j]*3);v1.fromArray(profile.vertices,profile.indices[j+1]*3);v2.fromArray(profile.vertices,profile.indices[j+2]*3);
                if(ray.intersectTriangle(v0,v1,v2,false,hit)){const d=hit.distanceTo(ray.origin);if(d>.002)nearest=Math.min(nearest,d);}
            }
            return nearest;
        };
        let fit;
        for(const y of [0,-.25,-.5]) {
            const point=[centre[0],centre[1]+hy*y,centre[2]],h=Math.min(wall(point,[0,1,0]),wall(point,[0,-1,0])),w=Math.min(wall(point,[0,0,1]),wall(point,[0,0,-1]));
            if(!Number.isFinite(h*w)||h<.008||w<.008)continue;
            if(!fit||h*w>fit.h*fit.w)fit={point,h,w};
        }
        if(!fit)continue;
        const height=fit.h*.85,width=fit.w*.85,length=hx*.75;
        component(wreck,`equipment-core-${i}`,'machinery',fit.point,[length,height,width],[0,0,0],profile.name);
        for(const side of [-1,1]) {
            component(wreck,`conduit-${i}-${side}`,'vessel',[fit.point[0],fit.point[1]+height*.48,fit.point[2]+side*width*.36],[Math.min(height,width)*.16,length*.92,Math.min(height,width)*.16],[0,0,Math.PI/2],profile.name);
            component(wreck,`bulkhead-${i}-${side}`,'machinery',[fit.point[0]+side*length*.36,fit.point[1],fit.point[2]],[length*.045,height*1.2,width*1.2],[0,0,0],profile.name);
        }
    }
    // Fine fragments around the torn bridge support accompany the retained
    // source-model chunks. Their spread stays above the exploration lanes.
    for(const wreck of GRAVEYARD_MODEL_WRECKS.filter(w=>!['wayfarer','talon'].includes(w.class))){
        const small=wreck.class==='frigate',count=wreck.class==='battleship'?28:small?8:24;
        const random=seededRandom(`${seed}:${wreck.id}:command-breakup`),rotation=new THREE.Euler(...wreck.rotation);
        const base=wreck.class==='battleship'?[.43,.32,0]:wreck.class==='carrier'?[.31,.25,0]:wreck.class==='cruiser'?[.16,.39,0]:[.31,.18,0];
        for(let i=0;i<count;i++){
            const local=new THREE.Vector3(base[0]+randomBetween(random,-.22,.22),base[1]+randomBetween(random,0,.18),base[2]+randomBetween(random,-.25,.25));
            const kind=pick(random,['shard','shard','girder','spine']),length=randomBetween(random,small?.7:4,small?2.2:15);
            const scale=kind==='shard'?[length*.65,length*.45,length]:[length*.12,length*.12,length];
            const bounds=new THREE.Box3().setFromCenterAndSize(local,new THREE.Vector3().setScalar(length/wreck.scale));
            if(passageBoxes(wreck).some(box=>bounds.intersectsBox(box)))continue;
            const point=local.multiplyScalar(wreck.scale).applyEuler(rotation).add(new THREE.Vector3(...wreck.local));
            if(intersectsRaceCorridor('mourning-line',point.toArray(),length))continue;
            pushPiece({id:`command-break-scatter-${wreck.id}-${i}`,kind,local:point.toArray(),scale,rotation:[random()*Math.PI,random()*Math.PI,random()*Math.PI],finish:kind==='shard'?'metal':'structure',attachedWreckId:wreck.id});
        }
    }
    // Finish every physical piece from the same geometry the renderer uses.
    // Rings and engine shells retain their analytical hollow collision; plates,
    // bars, discs, and chunks use their exact triangles.
    for (const piece of pieces) {
        const base = GRAVEYARD_GEOMETRY_HALF_EXTENTS[piece.kind] ?? [0.5, 0.5, 0.5];
        const visualReach = Math.hypot(base[0]*piece.scale[0],base[1]*piece.scale[1],base[2]*piece.scale[2]);
        const local=piece.position.map((value,index)=>value-center[index]);
        if(!piece.attachedWreckId&&overlapsGraveyardModelWreck(local,visualReach)) {
            piece.render=false;piece.collidable=false;
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
