// npcNav.js — goal-directed sampled steering + waypoint synthesis for NPC ships.
//
// Replaces the per-frame radial-gradient avoidance (getAvoidanceVector) with a
// controller that samples candidate headings, scores them against the actual
// nearby obstacles (shape-aware: spheres, oriented boxes, ring holes), and
// picks the best clear line toward the goal. When the direct line to the goal
// is blocked by a nearby obstacle, a persisted tangent waypoint commits the
// ship to one side so it orbits deliberately instead of grinding a rock face.
//
// Determinism: the candidate set is fixed geometry — no RNG anywhere in the
// controller. Personality enters only through existing pilotMod knobs
// (passRangeMul doubles as the clearance margin), so headless probes stay
// byte-identical. In open space the controller is an exact no-op: the goal
// candidate always scores highest, so the returned direction is the goal
// direction unchanged.
//
// Allocation-free: all math uses the session's navScratch (lazily created), so
// Object.create-based headless harnesses work without touching the real
// constructor.
import * as THREE from 'three';
import { clamp } from './random.js';
import { GRAVEYARD_GEOMETRY_PROFILES } from './worldData.js';
import { pilotMod } from './pilots.js';

const FORWARD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);
// Candidate yaw offsets around the ship's up axis (radians).
const YAW_ANGLES = [-1.2, -0.8, -0.5, 0.5, 0.8, 1.2];
// Candidate pitch offsets around the ship's right axis.
const PITCH_ANGLES = [-0.7, -0.35, 0.35, 0.7];
// Steep vertical escapes (climb/descend out of the field plane).
const VERTICAL_ANGLES = [-1.5, 1.5];
// How far ahead the controller looks (seconds of flight at current speed).
const DEFAULT_HORIZON = 2.0;
const COMBAT_HORIZON = 1.4;
const MIN_LOOKAHEAD = 30;
const MAX_LOOKAHEAD = 170;
// Brake window: below this path clearance the ship starts throttling back.
const BRAKE_WINDOW = 30;
// How close a ship must be to its nav waypoint before it re-evaluates.
const WAYPOINT_ARRIVE = 30;
// How long a synthesized waypoint stays valid before re-synthesis. Short, so
// the parallel-lane waypoint tracks the ship's movement instead of going stale
// behind it; the deterministic side pick keeps the lane stable.
const WAYPOINT_LIFETIME = 1;
// Waypoint synthesis only kicks in when the first blocker is this close.
const SYNTHESIS_RANGE = 120;
// Fixed margin added to the obstacle query box (covers the largest rock).
const QUERY_MARGIN = 400;
// Fractional samples along a candidate's path used for box/ring proximity.
const PATH_SAMPLES = [0.5, 1];
// ==== Coarse grid route layer ====
// A cheap global planner above the sampled controller: a coarse 3D grid over
// the field (cells blocked where obstacles reach), a deterministic A* for a
// waypoint chain, then the sampled controller flies each hop. Only engaged
// for stable, far-away goals (transit/search); combat stays local so dodges
// stay snappy. The grid is cached per field and rebuilt on zone change or
// every ROUTE_REBUILD_AFTER seconds (rocks drift slowly).
const ROUTE_CELL = 40;           // grid cell size (units)
const ROUTE_MARK_MARGIN = 12;    // blocked-marking margin beyond obstacle radius
const ROUTE_MAX_CELLS = 250000;  // cap: coarsen the cell until the grid fits
const ROUTE_MIN_DIST = 200;      // only route goals farther than this
const ROUTE_ARRIVE = 26;         // advance when within this of a waypoint (units)
const ROUTE_STRAY_MUL = 1.5;     // recompute when this many cells off the segment
const ROUTE_MAX_AGE = 15;        // recompute after this many seconds (rocks drift)
const ROUTE_REBUILD_AFTER = 1.5; // rebuild the grid after this long (rocks drift)
const ROUTE_ITER_CAP = 200000;   // A* expansion cap (no path -> synthesis fallback)
const ROUTE_BAND_CELLS = 1;       // route may climb this many cells above/below the goal plane
const ROUTE_TRUST_WEIGHT = 1.6;   // goal-alignment multiplier while following a route waypoint
const TURN_BRAKE_MIN = 0.4;       // rad: route legs brake once the goal is this far off the nose
const TURN_BRAKE_FULL = 1.4;      // rad (80°): above this the ship stops and turns in place
// Vertical steps cost extra so routes stay in the field's plane. The hard
// guarantee is the goal-centered band (ROUTE_BAND_CELLS); the penalty keeps
// even in-band paths from zig-zagging vertically when a flat route exists.
const ROUTE_VERTICAL_PENALTY = 1.5;
// 26-neighbor offsets for the A* (fixed order keeps the search deterministic).
const NDX = [];
const NDY = [];
const NDZ = [];
for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
            if (dx !== 0 || dy !== 0 || dz !== 0) {
                NDX.push(dx);
                NDY.push(dy);
                NDZ.push(dz);
            }
        }
    }
}

const ensureScratch = (session) => {
    if (session.navScratch)
        return session.navScratch;
    session.navScratch = {
        obstacles: [],
        forward: new THREE.Vector3(),
        up: new THREE.Vector3(),
        candidate: new THREE.Vector3(),
        local: new THREE.Vector3(),
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
        out: new THREE.Vector3(),
    };
    return session.navScratch;
};

// Rotate a vector by a quaternion (Hamilton product). Pass the conjugate
// components to rotate by the inverse.
const rotateVec = (qx, qy, qz, qw, x, y, z, out) => {
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    out.x = x + qw * tx + (qy * tz - qz * ty);
    out.y = y + qw * ty + (qz * tx - qx * tz);
    out.z = z + qw * tz + (qx * ty - qy * tx);
    return out;
};
// Rotate a unit vector around an arbitrary axis (Rodrigues).
const rotateAround = (x, y, z, ax, ay, az, angle, out) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    out.x = (c + ax * ax * t) * x + (ax * ay * t - az * s) * y + (ax * az * t + ay * s) * z;
    out.y = (ay * ax * t + az * s) * x + (c + ay * ay * t) * y + (ay * az * t - ax * s) * z;
    out.z = (az * ax * t - ay * s) * x + (az * ay * t + ax * s) * y + (c + az * az * t) * z;
    return out;
};

// World point → obstacle local frame (inverse rotation, then scale).
const pointToLocal = (px, py, pz, obstacle, out) => {
    const box = obstacle.box;
    rotateVec(-box.qx, -box.qy, -box.qz, box.qw, px - obstacle.x, py - obstacle.y, pz - obstacle.z, out);
    if (obstacle.scale) {
        out.x /= obstacle.scale[0];
        out.y /= obstacle.scale[1];
        out.z /= obstacle.scale[2];
    }
    return out;
};
// An obstacle's box is the honest clearance model only when it is genuinely
// stretched — for a near-spherical rock the AABB corners reach sqrt(3)x the
// faces, far beyond the actual mesh, and would block legitimate slides around
// the rock's edge (cover peeks, gap entries). The sphere (widest axis) is the
// accurate model for spherical rocks, and the box for stretched ones.
const stretchedBox = (o) => {
    const b = o.box;
    if (!b)
        return false;
    const mn = Math.min(b.hx, b.hy, b.hz);
    const mx = Math.max(b.hx, b.hy, b.hz);
    return mx > mn * 1.5;
};
// Signed clearance from a world point to an obstacle's avoidance surface
// (positive = clear, negative = inside). shipClearance is the ship's hull
// reach plus the pilot's margin.
const obstacleClearanceAt = (px, py, pz, obstacle, shipClearance, scratch) => {
    if (obstacle.shape === 'ring') {
        const local = pointToLocal(px, py, pz, obstacle, scratch.local);
        const profile = GRAVEYARD_GEOMETRY_PROFILES.ring;
        const axial = profile.tubeRadius + 1.5;
        if (Math.abs(local.z) > axial)
            return Math.abs(local.z) - axial;
        const r = Math.hypot(local.x, local.y);
        const inner = Math.max(0, profile.majorRadius - profile.tubeRadius);
        const outer = profile.majorRadius + profile.tubeRadius;
        if (r < inner)
            return inner - r;
        return r - outer;
    }
    if (obstacle.shape === 'engine' || stretchedBox(obstacle)) {
        const local = pointToLocal(px, py, pz, obstacle, scratch.local);
        const hx = obstacle.box.hx;
        const hy = obstacle.box.hy;
        const hz = obstacle.box.hz;
        const dx = Math.max(0, Math.abs(local.x) - hx);
        const dy = Math.max(0, Math.abs(local.y) - hy);
        const dz = Math.max(0, Math.abs(local.z) - hz);
        return Math.hypot(dx, dy, dz) - shipClearance;
    }
    // sphere (asteroid, wreck, dock)
    const dx = px - obstacle.x;
    const dy = py - obstacle.y;
    const dz = pz - obstacle.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - (obstacle.radius + shipClearance);
};
// Ray (P + c·t) vs sphere (O, R). Returns the entry t, or undefined.
const raySphereHit = (px, py, pz, cx, cy, cz, ox, oy, oz, R) => {
    const wx = ox - px;
    const wy = oy - py;
    const wz = oz - pz;
    const b = wx * cx + wy * cy + wz * cz;
    if (b < 0)
        return undefined;
    const c = wx * wx + wy * wy + wz * wz - R * R;
    const disc = b * b - c;
    if (disc < 0)
        return undefined;
    const t = b - Math.sqrt(disc);
    return t >= 0 ? t : undefined;
};
// Ray vs an oriented box inflated by shipClearance, in the obstacle's local
// frame. Returns the entry t, or undefined.
const rayBoxHit = (px, py, pz, cx, cy, cz, obstacle, shipClearance, scratch) => {
    const box = obstacle.box;
    pointToLocal(px, py, pz, obstacle, scratch.local);
    const ox = scratch.local.x;
    const oy = scratch.local.y;
    const oz = scratch.local.z;
    rotateVec(-box.qx, -box.qy, -box.qz, box.qw, cx, cy, cz, scratch.candidate);
    let dx = scratch.candidate.x;
    let dy = scratch.candidate.y;
    let dz = scratch.candidate.z;
    if (obstacle.scale) {
        dx /= obstacle.scale[0];
        dy /= obstacle.scale[1];
        dz /= obstacle.scale[2];
    }
    const hx = box.hx + shipClearance;
    const hy = box.hy + shipClearance;
    const hz = box.hz + shipClearance;
    let tmin = 0;
    let tmax = Infinity;
    const slab = (o, d, h) => {
        if (Math.abs(d) < 1e-9) {
            if (o < -h || o > h)
                return false;
        }
        else {
            let t1 = (-h - o) / d;
            let t2 = (h - o) / d;
            if (t1 > t2) {
                const tmp = t1;
                t1 = t2;
                t2 = tmp;
            }
            tmin = Math.max(tmin, t1);
            tmax = Math.min(tmax, t2);
            if (tmin > tmax)
                return false;
        }
        return true;
    };
    if (!slab(ox, dx, hx))
        return undefined;
    if (!slab(oy, dy, hy))
        return undefined;
    if (!slab(oz, dz, hz))
        return undefined;
    return tmin >= 0 ? tmin : 0;
};
// Ray vs a ring's solid tube, in the obstacle's local frame. Returns the entry
// t, or undefined (a ray through the hole is clear).
const rayRingHit = (px, py, pz, cx, cy, cz, obstacle, scratch) => {
    const box = obstacle.box;
    pointToLocal(px, py, pz, obstacle, scratch.local);
    const ox = scratch.local.x;
    const oy = scratch.local.y;
    const oz = scratch.local.z;
    rotateVec(-box.qx, -box.qy, -box.qz, box.qw, cx, cy, cz, scratch.candidate);
    let dx = scratch.candidate.x;
    let dy = scratch.candidate.y;
    let dz = scratch.candidate.z;
    if (obstacle.scale) {
        dx /= obstacle.scale[0];
        dy /= obstacle.scale[1];
        dz /= obstacle.scale[2];
    }
    const profile = GRAVEYARD_GEOMETRY_PROFILES.ring;
    const axial = profile.tubeRadius + 1.5;
    let t0 = 0;
    let t1 = Infinity;
    if (Math.abs(dz) < 1e-10) {
        if (oz < -axial || oz > axial)
            return undefined;
    }
    else {
        let near = (-axial - oz) / dz;
        let far = (axial - oz) / dz;
        if (near > far) {
            const tmp = near;
            near = far;
            far = tmp;
        }
        t0 = Math.max(t0, near);
        t1 = Math.min(t1, far);
        if (t0 > t1)
            return undefined;
    }
    const inner = Math.max(0, profile.majorRadius - profile.tubeRadius);
    const outer = profile.majorRadius + profile.tubeRadius;
    const innerSq = inner * inner;
    const outerSq = outer * outer;
    for (let k = 0; k <= 8; k += 1) {
        const t = t0 + (t1 - t0) * (k / 8);
        const px2 = ox + dx * t;
        const py2 = oy + dy * t;
        const r2 = px2 * px2 + py2 * py2;
        if (r2 >= innerSq && r2 <= outerSq)
            return t;
    }
    return undefined;
};

// Clearance of a ray (P, c) to a single obstacle's avoidance surface over the
// lookahead horizon. Negative = the path would collide.
const rayObstacleClearance = (px, py, pz, cx, cy, cz, obstacle, lookahead, shipClearance, scratch) => {
    if (obstacle.shape === 'ring') {
        let best = Infinity;
        for (const f of PATH_SAMPLES) {
            const clear = obstacleClearanceAt(px + cx * lookahead * f, py + cy * lookahead * f, pz + cz * lookahead * f, obstacle, shipClearance, scratch);
            if (clear < best)
                best = clear;
        }
        return best;
    }
    if (obstacle.shape === 'engine' || stretchedBox(obstacle)) {
        if (rayBoxHit(px, py, pz, cx, cy, cz, obstacle, shipClearance, scratch) !== undefined)
            return -10;
        let best = Infinity;
        for (const f of PATH_SAMPLES) {
            const clear = obstacleClearanceAt(px + cx * lookahead * f, py + cy * lookahead * f, pz + cz * lookahead * f, obstacle, shipClearance, scratch);
            if (clear < best)
                best = clear;
        }
        return best;
    }
    // sphere: exact closest approach of the ray to the avoidance sphere
    const R = obstacle.radius + shipClearance;
    const wx = obstacle.x - px;
    const wy = obstacle.y - py;
    const wz = obstacle.z - pz;
    const t = wx * cx + wy * cy + wz * cz;
    if (t > lookahead + R)
        return Infinity;
    if (t < 0)
        return Infinity;
    const hx = wx - t * cx;
    const hy = wy - t * cy;
    const hz = wz - t * cz;
    const h = Math.sqrt(hx * hx + hy * hy + hz * hz);
    return h - R;
};
// Score a candidate direction against the obstacle list. Returns
// { score, minClear }; score is -Infinity when the path would collide.
const scoreCandidate = (cx, cy, cz, gx, gy, gz, fx, fy, fz, px, py, pz, lookahead, obstacles, shipClearance, scratch, goalWeight, smoothWeight) => {
    let minClear = Infinity;
    for (let i = 0; i < obstacles.length; i += 1) {
        const clear = rayObstacleClearance(px, py, pz, cx, cy, cz, obstacles[i], lookahead, shipClearance, scratch);
        if (clear < minClear) {
            minClear = clear;
            if (minClear < 0)
                return { score: -Infinity, minClear };
        }
    }
    const goalScore = cx * gx + cy * gy + cz * gz;
    const smoothScore = cx * fx + cy * fy + cz * fz;
    const safeClearance = shipClearance * 2.5;
    let penalty = 0;
    if (minClear < safeClearance)
        penalty = (1 - minClear / safeClearance) * 0.9;
    return { score: goalWeight * goalScore + smoothWeight * smoothScore - penalty, minClear };
};
// Min clearance at a world point over obstacles in a box around it.
const clearanceAtPoint = (px, py, pz, session, shipClearance, scratch) => {
    let best = Infinity;
    const margin = 200;
    session.forEachObstacleInBox(px - margin, py - margin, pz - margin, px + margin, py + margin, pz + margin, (obstacle) => {
        const clear = obstacleClearanceAt(px, py, pz, obstacle, shipClearance, scratch);
        if (clear < best)
            best = clear;
    });
    return best;
};
// First obstacle in a list whose avoidance surface the goal ray hits within
// SYNTHESIS_RANGE, or undefined.
const firstBlockerInList = (px, py, pz, gx, gy, gz, obstacles, shipClearance, scratch) => {
    let bestT = Infinity;
    let bestObstacle;
    for (let i = 0; i < obstacles.length; i += 1) {
        const obstacle = obstacles[i];
        let t;
        if (obstacle.shape === 'ring')
            t = rayRingHit(px, py, pz, gx, gy, gz, obstacle, scratch);
        else if (obstacle.shape === 'engine' || stretchedBox(obstacle))
            t = rayBoxHit(px, py, pz, gx, gy, gz, obstacle, shipClearance, scratch);
        else
            t = raySphereHit(px, py, pz, gx, gy, gz, obstacle.x, obstacle.y, obstacle.z, obstacle.radius + shipClearance);
        if (t !== undefined && t < bestT && t <= SYNTHESIS_RANGE) {
            bestT = t;
            bestObstacle = obstacle;
        }
    }
    return bestObstacle ? { obstacle: bestObstacle, t: bestT } : undefined;
};
// Persisted tangent waypoint around the first blocker on the goal line. The
// waypoint commits the ship to one side (the side with more open space beyond
// the blocker) so it orbits deliberately instead of grinding.
const synthesizeWaypoint = (session, ship, goalX, goalY, goalZ, shipClearance, obstacles, scratch) => {
    const now = session.save.world.time;
    const px = ship.position[0];
    const py = ship.position[1];
    const pz = ship.position[2];
    let gx = goalX - px;
    let gy = goalY - py;
    let gz = goalZ - pz;
    const gl = Math.hypot(gx, gy, gz);
    if (gl < 1e-4) {
        ship.navWaypoint = undefined;
        return undefined;
    }
    gx /= gl;
    gy /= gl;
    gz /= gl;
    // Tight-spot gate: while the ship is boxed against obstacles, skip
    // synthesis — the controller's escape candidate and forward brake back it
    // out of the cluster, and a tangent waypoint there just jitters between
    // rocks. Synthesis only engages once there is room to commit to a side.
    for (let i = 0; i < obstacles.length; i += 1) {
        const o = obstacles[i];
        const dx = o.x - px;
        const dy = o.y - py;
        const dz = o.z - pz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1.6 * (o.radius + shipClearance)) {
            ship.navWaypoint = undefined;
            return undefined;
        }
    }
    // Reuse a live waypoint while it is still useful, but re-check the goal
    // line every frame: as soon as the direct line clears, drop the waypoint
    // so the ship resumes its route instead of over-orbiting the rock.
    if (ship.navWaypoint && now < (ship.navWaypointUntil ?? 0)) {
        const w = ship.navWaypoint;
        const dx = w[0] - px;
        const dy = w[1] - py;
        const dz = w[2] - pz;
        if (dx * dx + dy * dy + dz * dz > WAYPOINT_ARRIVE * WAYPOINT_ARRIVE) {
            if (!firstBlockerInList(px, py, pz, gx, gy, gz, obstacles, shipClearance, scratch))
                ship.navWaypoint = undefined;
            else
                return w;
        }
        else {
            ship.navWaypoint = undefined;
        }
    }
    const blocker = firstBlockerInList(px, py, pz, gx, gy, gz, obstacles, shipClearance, scratch);
    if (!blocker) {
        ship.navWaypoint = undefined;
        return undefined;
    }
    const obstacle = blocker.obstacle;
    const R = obstacle.radius + shipClearance;
    // Parallel-lane waypoint: fly a course offset from the goal line on the
    // side with more open space, ahead of the ship — the ship keeps making
    // progress toward the goal while the offset routes it around the blocker.
    // The goal-line re-check above drops the waypoint the moment the direct
    // line clears, so the ship never over-orbits.
    let lx = -gz;
    let ly = 0;
    let lz = gx;
    const ll = Math.hypot(lx, ly, lz);
    if (ll < 1e-4) {
        lx = 1;
        lz = 0;
    }
    else {
        lx /= ll;
        ly /= ll;
        lz /= ll;
    }
    const probe = SYNTHESIS_RANGE;
    const offset = R + 25;
    const s1 = clearanceAtPoint(px + gx * probe + lx * offset, py + gy * probe + ly * offset, pz + gz * probe + lz * offset, session, shipClearance, scratch);
    const s2 = clearanceAtPoint(px + gx * probe - lx * offset, py + gy * probe - ly * offset, pz + gz * probe - lz * offset, session, shipClearance, scratch);
    const side = s1 >= s2 ? 1 : -1;
    ship.navWaypoint = [px + gx * probe + lx * offset * side, py + gy * probe + ly * offset * side, pz + gz * probe + lz * offset * side];
    ship.navWaypointUntil = now + WAYPOINT_LIFETIME;
    return ship.navWaypoint;
};

// World-space center of a grid cell.
const routeCellCenter = (grid, ci) => {
    const nx = grid.nx;
    const cx = ci % nx;
    const cy = Math.floor(ci / nx) % grid.ny;
    const cz = Math.floor(ci / (nx * grid.ny));
    return [grid.minX + (cx + 0.5) * grid.cell, grid.minY + (cy + 0.5) * grid.cell, grid.minZ + (cz + 0.5) * grid.cell];
};
// Field identity for grid caching: instance + obstacle counts. Counts catch
// zone switches and wreck depletion; drifting rocks are handled by the
// time-based rebuild in ensureRouteGrid.
const routeFingerprint = (session) => {
    const a = session.asteroids?.length ?? 0;
    const g = session.graveyard?.length ?? 0;
    const w = session.wreckNodes?.length ?? 0;
    return `${session.activeInstanceId}:${a}:${g}:${w}`;
};
// The coarse field grid, cached on the session (rebuilt when the field
// changes or goes stale). Obstacles come from activeFieldObstacles so the
// route layer sees exactly the shapes the collider and controller use.
const ensureRouteGrid = (session) => {
    const fingerprint = routeFingerprint(session);
    const now = session.save.world.time;
    const cached = session.routeGrid;
    if (cached && cached.fingerprint === fingerprint && now - cached.builtAt < ROUTE_REBUILD_AFTER)
        return cached;
    const obstacles = session.activeFieldObstacles();
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < obstacles.length; i += 1) {
        const o = obstacles[i];
        const reach = o.radius + ROUTE_MARK_MARGIN;
        if (o.x - reach < minX)
            minX = o.x - reach;
        if (o.y - reach < minY)
            minY = o.y - reach;
        if (o.z - reach < minZ)
            minZ = o.z - reach;
        if (o.x + reach > maxX)
            maxX = o.x + reach;
        if (o.y + reach > maxY)
            maxY = o.y + reach;
        if (o.z + reach > maxZ)
            maxZ = o.z + reach;
    }
    if (!isFinite(minX)) {
        session.routeGrid = { fingerprint, builtAt: now, empty: true };
        return session.routeGrid;
    }
    let cell = ROUTE_CELL;
    let nx;
    let ny;
    let nz;
    for (;;) {
        nx = Math.max(1, Math.ceil((maxX - minX) / cell) + 1);
        ny = Math.max(1, Math.ceil((maxY - minY) / cell) + 1);
        nz = Math.max(1, Math.ceil((maxZ - minZ) / cell) + 1);
        if (nx * ny * nz <= ROUTE_MAX_CELLS)
            break;
        cell *= 2;
    }
    const blocked = new Uint8Array(nx * ny * nz);
    for (let i = 0; i < obstacles.length; i += 1) {
        const o = obstacles[i];
        // Mark the obstacle's AABB (rotated collision box, or a sphere for
        // box-less nodes) plus the margin. A sphere of the widest axis would
        // be wrong for stretched rocks: a tall monolith's sphere mark covers
        // the gaps beside it and closes the maze it is meant to define.
        let rx;
        let ry;
        let rz;
        if (o.box) {
            const hx = o.box.hx;
            const hy = o.box.hy;
            const hz = o.box.hz;
            const qx = o.box.qx;
            const qy = o.box.qy;
            const qz = o.box.qz;
            const qw = o.box.qw;
            const m00 = 1 - 2 * (qy * qy + qz * qz);
            const m01 = 2 * (qx * qy - qz * qw);
            const m02 = 2 * (qx * qz + qy * qw);
            const m10 = 2 * (qx * qy + qz * qw);
            const m11 = 1 - 2 * (qx * qx + qz * qz);
            const m12 = 2 * (qy * qz - qx * qw);
            const m20 = 2 * (qx * qz - qy * qw);
            const m21 = 2 * (qy * qz + qx * qw);
            const m22 = 1 - 2 * (qx * qx + qy * qy);
            rx = Math.abs(m00) * hx + Math.abs(m01) * hy + Math.abs(m02) * hz;
            ry = Math.abs(m10) * hx + Math.abs(m11) * hy + Math.abs(m12) * hz;
            rz = Math.abs(m20) * hx + Math.abs(m21) * hy + Math.abs(m22) * hz;
        }
        else {
            rx = o.radius;
            ry = o.radius;
            rz = o.radius;
        }
        const reachX = rx + ROUTE_MARK_MARGIN;
        const reachY = ry + ROUTE_MARK_MARGIN;
        const reachZ = rz + ROUTE_MARK_MARGIN;
        const cx0 = Math.max(0, Math.floor((o.x - reachX - minX) / cell));
        const cy0 = Math.max(0, Math.floor((o.y - reachY - minY) / cell));
        const cz0 = Math.max(0, Math.floor((o.z - reachZ - minZ) / cell));
        const cx1 = Math.min(nx - 1, Math.floor((o.x + reachX - minX) / cell));
        const cy1 = Math.min(ny - 1, Math.floor((o.y + reachY - minY) / cell));
        const cz1 = Math.min(nz - 1, Math.floor((o.z + reachZ - minZ) / cell));
        for (let cz = cz0; cz <= cz1; cz += 1) {
            const wz = minZ + (cz + 0.5) * cell - o.z;
            if (Math.abs(wz) > reachZ)
                continue;
            for (let cy = cy0; cy <= cy1; cy += 1) {
                const wy = minY + (cy + 0.5) * cell - o.y;
                if (Math.abs(wy) > reachY)
                    continue;
                for (let cx = cx0; cx <= cx1; cx += 1) {
                    const wx = minX + (cx + 0.5) * cell - o.x;
                    if (Math.abs(wx) <= reachX)
                        blocked[(cz * ny + cy) * nx + cx] = 1;
                }
            }
        }
    }
    // The obstacle list rides along so the A* thinning can test EXACT
    // clearance along a segment (oriented boxes for rocks/panels, spheres
    // for the rest) instead of a fat cell box — a cell-based corridor check
    // can never merge a straight line through a 1-cell-wide gap, because the
    // wall cells beside the gap are always inside the check box.
    const grid = { fingerprint, builtAt: now, empty: false, blocked, nx, ny, nz, cell, minX, minY, minZ, obstacles };
    session.routeGrid = grid;
    return grid;
};
// A* over the coarse grid. Deterministic: a binary heap keyed by (f, cell
// index) with a fixed 26-neighbor order, so the same field always yields the
// same route. The start/goal snap to the nearest free cell (a ship can be
// pushed inside a rock's mark), and the result is thinned to the furthest
// waypoint whose straight segment keeps a clearance corridor free.
const routeAStar = (grid, sx, sy, sz, gx, gy, gz, shipClearance) => {
    const { blocked, nx, ny, nz, cell, minX, minY, minZ } = grid;
    const total = nx * ny * nz;
    const idx = (x, y, z) => (z * ny + y) * nx + x;
    const cellOf = (wx, wy, wz) => [
        Math.max(0, Math.min(nx - 1, Math.floor((wx - minX) / cell))),
        Math.max(0, Math.min(ny - 1, Math.floor((wy - minY) / cell))),
        Math.max(0, Math.min(nz - 1, Math.floor((wz - minZ) / cell))),
    ];
    const freeNear = (wx, wy, wz) => {
        const [x0, y0, z0] = cellOf(wx, wy, wz);
        if (blocked[idx(x0, y0, z0)] === 0)
            return [x0, y0, z0];
        // BFS outward for the nearest free cell (bounded, deterministic order).
        for (let r = 1; r <= 6; r += 1) {
            for (let dz = -r; dz <= r; dz += 1) {
                for (let dy = -r; dy <= r; dy += 1) {
                    for (let dx = -r; dx <= r; dx += 1) {
                        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r)
                            continue;
                        const x = x0 + dx;
                        const y = y0 + dy;
                        const z = z0 + dz;
                        if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz)
                            continue;
                        if (blocked[idx(x, y, z)] === 0)
                            return [x, y, z];
                    }
                }
            }
        }
        return undefined;
    };
    const start = freeNear(sx, sy, sz);
    const goal = freeNear(gx, gy, gz);
    if (!start || !goal)
        return undefined;
    const sIdx = idx(start[0], start[1], start[2]);
    const gIdx = idx(goal[0], goal[1], goal[2]);
    // Goal-centered vertical band: routes stay near the goal's plane
    // (spawns, docks, trades and fights all sit in the belt plane), and
    // without the band the A* happily climbs beside a rock wall and crosses
    // it at altitude — a wall must be a wall. The band follows the GOAL, not
    // the ship: a ship that climbed off-plane gets snapped into the band and
    // pulled back down by its own route instead of legitimizing the altitude.
    const bandLo = goal[1] - ROUTE_BAND_CELLS;
    const bandHi = goal[1] + ROUTE_BAND_CELLS;
    // Snap the start into the band: a ship that climbed off-plane gets
    // pulled back down by its own route.
    if (start[1] < bandLo)
        start[1] = bandLo;
    if (start[1] > bandHi)
        start[1] = bandHi;
    if (sIdx === gIdx)
        return [routeCellCenter(grid, sIdx)];
    // Goal cell center in world space (for the heuristic).
    const ggx = minX + (goal[0] + 0.5) * cell;
    const ggy = minY + (goal[1] + 0.5) * cell;
    const ggz = minZ + (goal[2] + 0.5) * cell;
    const gCost = new Float64Array(total).fill(Infinity);
    const parent = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);
    gCost[sIdx] = 0;
    const hOf = (ci) => {
        const cx = ci % nx;
        const cy = Math.floor(ci / nx) % ny;
        const cz = Math.floor(ci / (nx * ny));
        const dx = minX + (cx + 0.5) * cell - ggx;
        const dy = minY + (cy + 0.5) * cell - ggy;
        const dz = minZ + (cz + 0.5) * cell - ggz;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };
    const heapCmp = (a, b) => {
        const fa = gCost[a] + hOf(a);
        const fb = gCost[b] + hOf(b);
        return fa !== fb ? fa - fb : a - b;
    };
    const heap = [sIdx];
    const heapPush = (v) => {
        heap.push(v);
        let i = heap.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (heapCmp(heap[i], heap[p]) >= 0)
                break;
            const t = heap[i];
            heap[i] = heap[p];
            heap[p] = t;
            i = p;
        }
    };
    const heapPop = () => {
        const top = heap[0];
        const last = heap.pop();
        if (heap.length) {
            heap[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1;
                const r = 2 * i + 2;
                let s = i;
                if (l < heap.length && heapCmp(heap[l], heap[s]) < 0)
                    s = l;
                if (r < heap.length && heapCmp(heap[r], heap[s]) < 0)
                    s = r;
                if (s === i)
                    break;
                const t = heap[i];
                heap[i] = heap[s];
                heap[s] = t;
                i = s;
            }
        }
        return top;
    };
    let iterations = 0;
    let found = false;
    while (heap.length && iterations < ROUTE_ITER_CAP) {
        iterations += 1;
        const cur = heapPop();
        if (closed[cur])
            continue;
        closed[cur] = 1;
        if (cur === gIdx) {
            found = true;
            break;
        }
        const cx = cur % nx;
        const cy = Math.floor(cur / nx) % ny;
        const cz = Math.floor(cur / (nx * ny));
        for (let k = 0; k < 26; k += 1) {
            const ndx = NDX[k];
            const ndy = NDY[k];
            const ndz = NDZ[k];
            const ncx = cx + ndx;
            const ncy = cy + ndy;
            const ncz = cz + ndz;
            if (ncx < 0 || ncy < 0 || ncz < 0 || ncx >= nx || ncy >= ny || ncz >= nz)
                continue;
            if (ncy < bandLo || ncy > bandHi)
                continue;
            const ni = idx(ncx, ncy, ncz);
            if (closed[ni] || blocked[ni])
                continue;
            // No corner cutting: a diagonal step must keep the axis-aligned
            // neighbors of its bounding box free, or the path slices through
            // rock corners that the cell centers just miss (a single diagonal
            // hop can cut 30+ units off a rock whose corner sits between the
            // cells).
            if (ndx !== 0 && blocked[idx(ncx, cy, cz)])
                continue;
            if (ndy !== 0 && blocked[idx(cx, ncy, cz)])
                continue;
            if (ndz !== 0 && blocked[idx(cx, cy, ncz)])
                continue;
            if (ndx !== 0 && ndy !== 0 && blocked[idx(ncx, ncy, cz)])
                continue;
            if (ndx !== 0 && ndz !== 0 && blocked[idx(ncx, cy, ncz)])
                continue;
            if (ndy !== 0 && ndz !== 0 && blocked[idx(cx, ncy, ncz)])
                continue;
            const step = Math.sqrt(ndx * ndx + ndy * ndy + ndz * ndz) * cell * (1 + Math.abs(ndy) * (ROUTE_VERTICAL_PENALTY - 1));
            const ng = gCost[cur] + step;
            if (ng < gCost[ni]) {
                gCost[ni] = ng;
                parent[ni] = cur;
                heapPush(ni);
            }
        }
    }
    if (!found)
        return undefined;
    const path = [];
    let cur = gIdx;
    while (cur !== -1) {
        path.push(cur);
        if (cur === sIdx)
            break;
        cur = parent[cur];
    }
    path.reverse();
    const waypoints = path.map((ci) => routeCellCenter(grid, ci));
    // Greedy thinning: from each waypoint, jump to the furthest one whose
    // straight segment keeps the SHIP's clearance free at every sample point
    // (exact oriented-box clearance against the grid's obstacles — the same
    // model the sampled steering uses). Cell-box corridors can never merge a
    // line through a 1-cell-wide gap: the wall cells beside the gap are
    // always inside the box. 15-unit samples are fine: clearance changes are
    // smooth across obstacle faces, and the segment endpoints are waypoints
    // the grid already validated.
    const obstacles = grid.obstacles ?? [];
    const pt = { x: 0, y: 0, z: 0 };
    const boxClearAt = (wx, wy, wz, o, clear) => {
        if (stretchedBox(o)) {
            const box = o.box;
            const dx = wx - o.x;
            const dy = wy - o.y;
            const dz = wz - o.z;
            rotateVec(-box.qx, -box.qy, -box.qz, box.qw, dx, dy, dz, pt);
            const ex = Math.max(0, Math.abs(pt.x) - box.hx);
            const ey = Math.max(0, Math.abs(pt.y) - box.hy);
            const ez = Math.max(0, Math.abs(pt.z) - box.hz);
            return Math.hypot(ex, ey, ez) - clear;
        }
        const rx = wx - o.x;
        const ry = wy - o.y;
        const rz = wz - o.z;
        // Near-spherical rocks: the sphere (widest axis) — matches the
        // steering's clearance model so route segments never pass closer
        // than the sampled controller will accept.
        return Math.sqrt(rx * rx + ry * ry + rz * rz) - (o.radius + clear);
    };
    // Segments keep a comfortable margin (2x the bare clearance): the sampled
    // controller never flies the exact line — its turn arcs cut ~10-15 units
    // inside it, and a segment validated at the bare minimum turns those cuts
    // into hull clips. (The maze's 42-unit gaps still pass: 42 > 2 x 16.4.)
    const SEGMENT_CLEAR_MUL = 2;
    const segmentClear = (a, b) => {
        const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 15));
        for (let s = 0; s <= steps; s += 1) {
            const t = s / steps;
            const wx = a[0] + (b[0] - a[0]) * t;
            const wy = a[1] + (b[1] - a[1]) * t;
            const wz = a[2] + (b[2] - a[2]) * t;
            for (let i = 0; i < obstacles.length; i += 1) {
                if (boxClearAt(wx, wy, wz, obstacles[i], shipClearance * SEGMENT_CLEAR_MUL) < 0)
                    return false;
            }
        }
        return true;
    };
    const thinned = [];
    let i = 0;
    while (i < waypoints.length - 1) {
        let j = waypoints.length - 1;
        while (j > i + 1 && !segmentClear(waypoints[i], waypoints[j]))
            j -= 1;
        thinned.push(waypoints[i]);
        i = j;
    }
    thinned.push(waypoints[waypoints.length - 1]);
    return thinned;
};
// Squared distance from a world point to a waypoint.
const distToSq = (px, py, pz, wp) => {
    const dx = px - wp[0];
    const dy = py - wp[1];
    const dz = pz - wp[2];
    return dx * dx + dy * dy + dz * dz;
};
// Point-to-segment distance squared (world space).
const distToSegmentSq = (px, py, pz, a, b) => {
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const abz = b[2] - a[2];
    const apx = px - a[0];
    const apy = py - a[1];
    const apz = pz - a[2];
    const lenSq = abx * abx + aby * aby + abz * abz;
    let t = lenSq > 0 ? (apx * abx + apy * aby + apz * abz) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = a[0] + abx * t;
    const qy = a[1] + aby * t;
    const qz = a[2] + abz * t;
    const dx = px - qx;
    const dy = py - qy;
    const dz = pz - qz;
    return dx * dx + dy * dy + dz * dz;
};
// True when an obstacle's avoidance surface comes within ROUTE_ENGAGE_MARGIN
// of the ship->goal line. The route layer only engages on a genuinely blocked
// goal line: a clear line is best flown by the sampled controller (which
// handles local rocks smoothly), and routing a clear line would replace the
// smooth local path with a zig-zag cell staircase that slow turners oscillate
// on.
const goalLineBlocked = (session, px, py, pz, goalX, goalY, goalZ, shipClearance) => {
    const dx = goalX - px;
    const dy = goalY - py;
    const dz = goalZ - pz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1)
        return false;
    const ux = dx / len;
    const uy = dy / len;
    const uz = dz / len;
    // The line counts as blocked when it crosses an obstacle's avoidance
    // surface (radius + the ship's own clearance). No extra margin: a
    // borderline rock 60 units off the line is best flown by the local
    // controller, and routing it replaces a smooth pass with a detour.
    const reach = shipClearance;
    let blocked = false;
    session.forEachObstacleAlongSegment({ x: px, y: py, z: pz }, { x: goalX, y: goalY, z: goalZ }, (o) => {
        if (blocked)
            return;
        const wx = o.x - px;
        const wy = o.y - py;
        const wz = o.z - pz;
        const t = wx * ux + wy * uy + wz * uz;
        if (t < 0 || t > len)
            return;
        const hx = wx - t * ux;
        const hy = wy - t * uy;
        const hz = wz - t * uz;
        if (hx * hx + hy * hy + hz * hz < (o.radius + reach) * (o.radius + reach))
            blocked = true;
    });
    return blocked;
};
// The route waypoint the ship should steer at this frame, or undefined (then
// the sampled controller + synthesis handle the goal directly). Route state
// lives on the ship: recomputed on goal change, when the ship strays off the
// segment, when the route ages out (rocks drift), or when it is exhausted.
const nextRouteWaypoint = (session, ship, goalX, goalY, goalZ, shipClearance) => {
    const px = ship.position[0];
    const py = ship.position[1];
    const pz = ship.position[2];
    const gdx = goalX - px;
    const gdy = goalY - py;
    const gdz = goalZ - pz;
    if (gdx * gdx + gdy * gdy + gdz * gdz < ROUTE_MIN_DIST * ROUTE_MIN_DIST)
        return undefined;
    // Engage only on a genuinely blocked goal line (see goalLineBlocked).
    if (!goalLineBlocked(session, px, py, pz, goalX, goalY, goalZ, shipClearance)) {
        if (ship.navRoute)
            ship.navRoute = undefined;
        return undefined;
    }
    const grid = ensureRouteGrid(session);
    if (!grid || grid.empty)
        return undefined;
    const now = session.save.world.time;
    const goalSame = ship.navRouteGoal
        && ship.navRouteGoal[0] === goalX && ship.navRouteGoal[1] === goalY && ship.navRouteGoal[2] === goalZ;
    let route = ship.navRoute;
    let idx = ship.navRouteIdx ?? 0;
    // Ship forward (rotation only: the nose leads the velocity through turns).
    const rot = ship.rotation;
    const fwdX = -2 * (rot[3] * rot[1] + rot[0] * rot[2]);
    const fwdY = 2 * (rot[3] * rot[0] - rot[1] * rot[2]);
    const fwdZ = 2 * (rot[0] * rot[0] + rot[1] * rot[1]) - 1;
    // Advance past waypoints already reached or BEHIND the ship: steering at
    // a point behind the nose forces a huge turn whose arc can clip rocks the
    // straight route line clears. The raw goal steers the turn instead, and
    // the route takes over once the ship is roughly facing its destination.
    const skip = (wp) => {
        const dx = wp[0] - px;
        const dy = wp[1] - py;
        const dz = wp[2] - pz;
        return dx * dx + dy * dy + dz * dz < ROUTE_ARRIVE * ROUTE_ARRIVE
            || dx * fwdX + dy * fwdY + dz * fwdZ < 0;
    };
    let stale = !route || !goalSame || now - (ship.navRouteAt ?? 0) > ROUTE_MAX_AGE;
    if (!stale) {
        // Rescan from the start every frame: the ship advances past reached
        // waypoints, and a waypoint that ends up BEHIND the nose (a turn away
        // from the route) drops out so the raw goal steers until the ship is
        // facing its destination again — steering at a point behind the nose
        // forces a huge turn whose arc can clip rocks the straight route line
        // clears.
        idx = 0;
        while (idx < route.length - 1 && skip(route[idx]))
            idx += 1;
        // Arriving at the last waypoint clears the route so direct steering
        // finishes the leg.
        if (idx >= route.length - 1 && distToSq(px, py, pz, route[idx]) < ROUTE_ARRIVE * ROUTE_ARRIVE) {
            ship.navRoute = undefined;
            return undefined;
        }
        ship.navRouteIdx = idx;
        // Stray check (only while actively following a segment — a deferred
        // route whose waypoints are all behind has no segment to stray from,
        // so it must not re-plan every frame): pushed off the line
        // (collision) -> re-plan.
        if (idx < route.length - 1) {
            const a = idx === 0 ? ship.navRouteStart : route[idx - 1];
            if (distToSegmentSq(px, py, pz, a, route[idx]) > (ROUTE_STRAY_MUL * grid.cell) ** 2)
                stale = true;
        }
    }
    if (stale) {
        const waypoints = routeAStar(grid, px, py, pz, goalX, goalY, goalZ, shipClearance);
        if (!waypoints || waypoints.length < 2) {
            ship.navRoute = undefined;
            return undefined;
        }
        ship.navRoute = waypoints;
        ship.navRouteGoal = [goalX, goalY, goalZ];
        ship.navRouteStart = [px, py, pz];
        ship.navRouteAt = now;
        route = waypoints;
        idx = 0;
        while (idx < route.length - 1 && skip(route[idx]))
            idx += 1;
        ship.navRouteIdx = idx;
    }
    // Only steer at the waypoint when it is ahead of the nose; a last
    // waypoint left behind (ship turned away mid-route) defers to the raw
    // goal for this frame while the route stays for the turn.
    if (idx >= route.length - 1) {
        const wp = route[idx];
        if ((wp[0] - px) * fwdX + (wp[1] - py) * fwdY + (wp[2] - pz) * fwdZ < 0)
            return undefined;
    }
    return route[idx];
};
// Main entry: pick the best clear heading toward the goal and write it into
// `out` (a THREE.Vector3). Returns the brake amount in [0, 1].
//
// options:
//   goalDir     — optional unit direction (tactical intent). When absent, the
//                 direction to goalPos is used.
//   speed       — current speed, for the lookahead distance.
//   horizon     — lookahead seconds (default 2.0, combat callers pass ~1.4).
//   goalWeight  — weight of goal alignment (default 1).
//   smoothWeight— weight of heading continuity (default 0.15).
//   brakeScale  — how hard the predictive brake pulls (default 0.5).
//   marginMul   — clearance margin multiplier (defaults to passRangeMul).
//   synthesize  — allow tangent waypoints (default true; combat evasion passes
//                 false so dodges stay snappy).
//   route       — engage the coarse grid route layer for this goal (default
//                 false; travel passes true, combat stays local).
export function steerToward(session, ship, goalPos, options, out) {
    const scratch = ensureScratch(session);
    const target = out ?? scratch.out;
    const px = ship.position[0];
    const py = ship.position[1];
    const pz = ship.position[2];
    const speed = options.speed ?? 0;
    const horizon = options.horizon ?? DEFAULT_HORIZON;
    const goalWeight = options.goalWeight ?? 1;
    const smoothWeight = options.smoothWeight ?? 0.15;
    const brakeScale = options.brakeScale ?? 0.5;
    const marginMul = options.marginMul ?? pilotMod(ship, 1, 'passRangeMul');
    const extents = session.npcHullExtents(ship);
    const shipClearance = Math.max(extents[0], extents[1], extents[2]) + 3 * marginMul;
    // Ship frame axes from the orientation.
    const rot = ship.rotation;
    rotateVec(rot[0], rot[1], rot[2], rot[3], FORWARD.x, FORWARD.y, FORWARD.z, scratch.forward);
    const fx = scratch.forward.x;
    const fy = scratch.forward.y;
    const fz = scratch.forward.z;
    rotateVec(rot[0], rot[1], rot[2], rot[3], UP.x, UP.y, UP.z, scratch.up);
    const ux = scratch.up.x;
    const uy = scratch.up.y;
    const uz = scratch.up.z;
    const rx = fy * uz - fz * uy;
    const ry = fz * ux - fx * uz;
    const rz = fx * uy - fy * ux;
    const rl = Math.hypot(rx, ry, rz) || 1;
    const rxn = rx / rl;
    const ryn = ry / rl;
    const rzn = rz / rl;
    // Coarse route layer: for stable, far-away goals (transit/search) steer
    // at the current route waypoint so long routes through dense fields
    // follow a planned path. Combat callers keep routing off — their goals
    // move every frame, so planning is noise (and stale travel routes are
    // cleared so they can't linger into a fight).
    let goalX = goalPos.x;
    let goalY = goalPos.y;
    let goalZ = goalPos.z;
    // Route trust: while a coarse-grid waypoint is active, the route layer has
    // already validated the line (its thinning corridor keeps obstacles clear),
    // so goal alignment must outrank the local clearance penalty. Without it,
    // a tight-but-valid gap line scores lower than a clearer candidate 45° off
    // the line, and the ship drifts off the route — overshooting a gap mouth,
    // tripping the stray check, and re-planning around the whole wall.
    let routeWeight = 1;
    if (options.route) {
        const wp = nextRouteWaypoint(session, ship, goalX, goalY, goalZ, shipClearance);
        if (wp) {
            goalX = wp[0];
            goalY = wp[1];
            goalZ = wp[2];
            routeWeight = ROUTE_TRUST_WEIGHT;
        }
    }
    else if (ship.navRoute) {
        ship.navRoute = undefined;
    }
    // Goal direction.
    let gx;
    let gy;
    let gz;
    if (options.goalDir) {
        gx = options.goalDir.x;
        gy = options.goalDir.y;
        gz = options.goalDir.z;
    }
    else {
        const dx = goalX - px;
        const dy = goalY - py;
        const dz = goalZ - pz;
        const dl = Math.hypot(dx, dy, dz);
        if (dl > 1e-4) {
            gx = dx / dl;
            gy = dy / dl;
            gz = dz / dl;
        }
        else {
            gx = fx;
            gy = fy;
            gz = fz;
        }
    }
    const lookahead = clamp(speed * horizon, MIN_LOOKAHEAD, MAX_LOOKAHEAD);
    // One broadphase pass: collect nearby obstacles.
    const obstacles = scratch.obstacles;
    obstacles.length = 0;
    const margin = lookahead + QUERY_MARGIN;
    const dock = session.activeDockObstacle();
    if (dock)
        obstacles.push(dock);
    else
        session.forEachObstacleInBox(px - margin, py - margin, pz - margin, px + margin, py + margin, pz + margin, (obstacle) => obstacles.push(obstacle));
    // Waypoint synthesis: when the direct line to the goal is blocked by a
    // nearby obstacle (and the ship has room to commit), steer at a persisted
    // tangent waypoint instead of grinding the rock face.
    if (options.synthesize !== false) {
        const wp = synthesizeWaypoint(session, ship, goalX, goalY, goalZ, shipClearance, obstacles, scratch);
        if (wp) {
            const dx = wp[0] - px;
            const dy = wp[1] - py;
            const dz = wp[2] - pz;
            const dl = Math.hypot(dx, dy, dz);
            if (dl > 1e-4) {
                gx = dx / dl;
                gy = dy / dl;
                gz = dz / dl;
            }
        }
    }
    // Score candidates; rejected (colliding) candidates can never win, and if
    // every candidate collides the goal direction is kept as the fallback.
    let bestScore = -Infinity;
    let bestX = gx;
    let bestY = gy;
    let bestZ = gz;
    let bestClear = Infinity;
    const scoringGoalWeight = goalWeight * routeWeight;
    const consider = (cx, cy, cz) => {
        const res = scoreCandidate(cx, cy, cz, gx, gy, gz, fx, fy, fz, px, py, pz, lookahead, obstacles, shipClearance, scratch, scoringGoalWeight, smoothWeight);
        if (res.score > bestScore) {
            bestScore = res.score;
            bestX = cx;
            bestY = cy;
            bestZ = cz;
            bestClear = res.minClear;
        }
    };
    consider(gx, gy, gz);
    consider(fx, fy, fz);
    for (const a of YAW_ANGLES) {
        const c = rotateAround(gx, gy, gz, ux, uy, uz, a, scratch.candidate);
        consider(c.x, c.y, c.z);
    }
    for (const a of PITCH_ANGLES) {
        const c = rotateAround(gx, gy, gz, rxn, ryn, rzn, a, scratch.candidate);
        consider(c.x, c.y, c.z);
    }
    for (const a of VERTICAL_ANGLES) {
        const c = rotateAround(gx, gy, gz, rxn, ryn, rzn, a, scratch.candidate);
        consider(c.x, c.y, c.z);
    }
    // Emergency escape: when the ship is close to an obstacle, the direct away
    // direction is a candidate so a trapped ship can always back out instead
    // of grinding the rock face (all goal-based candidates may collide).
    {
        let nearest = -1;
        let nearestSq = Infinity;
        for (let i = 0; i < obstacles.length; i += 1) {
            const o = obstacles[i];
            const dx = px - o.x;
            const dy = py - o.y;
            const dz = pz - o.z;
            const sq = dx * dx + dy * dy + dz * dz;
            if (sq < nearestSq) {
                nearestSq = sq;
                nearest = i;
            }
        }
        if (nearest >= 0) {
            const o = obstacles[nearest];
            const dl = Math.sqrt(nearestSq) || 1;
            consider((px - o.x) / dl, (py - o.y) / dl, (pz - o.z) / dl);
        }
    }
    // Predictive brake from the tighter of the chosen path's clearance and the
    // current heading's clearance: a ship that must turn away from a rock
    // brakes while it turns instead of accelerating into it (momentum beats
    // steering on slow hulls).
    let brakeClear = bestClear;
    for (let i = 0; i < obstacles.length; i += 1) {
        const clear = rayObstacleClearance(px, py, pz, fx, fy, fz, obstacles[i], lookahead, shipClearance, scratch);
        if (clear < brakeClear)
            brakeClear = clear;
    }
    let brake = brakeClear < BRAKE_WINDOW ? clamp((BRAKE_WINDOW - brakeClear) / BRAKE_WINDOW, 0, 1) * brakeScale : 0;
    // Turn brake (route legs only): when the next waypoint is far off the
    // nose, slow way down so the turn happens mostly in place. Without it a
    // ponderous hull flies backward away from its goal for the whole turn
    // (the nose leads the velocity), drifting 100+ units off the route and
    // overshooting gap mouths it is meant to thread.
    if (routeWeight > 1) {
        const gDot = clamp(fx * gx + fy * gy + fz * gz, -1, 1);
        const turnAngle = Math.acos(gDot);
        if (turnAngle > TURN_BRAKE_MIN) {
            // Ramp to a FULL stop by 80°: a ship whose goal is mostly behind
            // it must not creep backward the whole turn (the nose leads the
            // velocity), or it drifts into rocks behind its spawn — a
            // 100+ unit drift past a gap mouth that the route meant to thread.
            const t = clamp((turnAngle - TURN_BRAKE_MIN) / (TURN_BRAKE_FULL - TURN_BRAKE_MIN), 0, 1);
            brake = Math.max(brake, Math.min(1, t * 1.3));
        }
    }
    target.x = bestX;
    target.y = bestY;
    target.z = bestZ;
    return brake;
}
