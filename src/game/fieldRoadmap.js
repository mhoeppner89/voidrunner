import * as THREE from 'three';
import { LOCATIONS } from './data.js';
import { SHARDBELT_PASSAGES } from './asteroidRoutes.js';
import { GRAVEYARD_MODEL_WRECKS } from './graveyardLayout.js';

// Field roadmap: pathfinding for combat pilots through terrain.
//
// The combat steering (fieldCombatSteering) is local: it sees ~500 km ahead
// and picks a side around the next blocker. That is right for rocks in the
// way, and wrong when the target sits behind a parent asteroid, inside a
// tunnel or on the far side of a wrecked battleship: the pilot grinds along
// the surface, brakes and loses the fight. The roadmap is the global layer:
//
// - Nodes: a lattice of free points around the fight (spacing per field) plus
//   "portal" points the lattice is too coarse for — the Shardbelt bores and
//   the open wreck interiors. A node is free when the conservative box test
//   says so, or (wreck fields, where hangars lie inside their section's box)
//   when six short mesh rays meet nothing. Mesh rays are double-sided, so a
//   point inside solid plating never counts as free.
// - Edges: neighbouring nodes whose straight segment is clear at the centre
//   and around the hull perimeter.
// - Query: A* from the ship to the nearest node that can see the target inside
//   engagement range, then string-pulled so the pilot cuts every corner the
//   terrain allows.
//
// The build is sliced (advanceFieldRoadmap, a few ms per simulation step) and
// one roadmap is kept per session, centred on the fight. Arena staging
// requests it at the site start, so it is complete during the countdown;
// career fights request it on the first blocked pursuit and fall back to the
// local controller until it is ready.
const SPACING = Object.freeze({ shardbelt: 270, 'mourning-line': 340 });
const DEFAULT_SPACING = 420;
// Half-width of the cube the roadmap covers around its centre.
const RADIUS = 1850;
// Free space a node needs (a fighter's reach plus a margin).
const NODE_CLEARANCE = 30;
// Radius of the wing rays around the centreline.
const EDGE_HALF_WIDTH = 16;
const WING_OFFSETS = Array.from({length: 8}, (_, i) => [
    EDGE_HALF_WIDTH * Math.cos(i * Math.PI / 4), EDGE_HALF_WIDTH * Math.sin(i * Math.PI / 4)
]);
const MAX_EXPANSIONS = 2500;
// The 13 forward lattice neighbours (the other 13 are their reverses).
const HALF_NEIGHBOURS = (() => {
    const list = [];
    for (let z = -1; z <= 1; z += 1) for (let y = -1; y <= 1; y += 1) for (let x = -1; x <= 1; x += 1) {
        if (z > 0 || (z === 0 && y > 0) || (z === 0 && y === 0 && x > 0)) list.push([x, y, z]);
    }
    return list;
})();
const RAYS = Object.freeze([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((d) => new THREE.Vector3(...d)));

// Bores and open wreck interiors: free space the lattice is too coarse for.
function portalPoints(instanceId) {
    if (instanceId === 'shardbelt') {
        const origin = LOCATIONS.shardbelt.position;
        return SHARDBELT_PASSAGES.map((passage) => passage.points.map((p) => [p[0] + origin[0], p[1] + origin[1], p[2] + origin[2]]));
    }
    if (instanceId === 'mourning-line') {
        const field = LOCATIONS['mourning-line'].position, chains = [];
        for (const wreck of GRAVEYARD_MODEL_WRECKS) {
            if (!wreck.interior) continue;
            const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...wreck.rotation, 'XYZ'));
            const center = new THREE.Vector3(...wreck.interior.center).multiplyScalar(wreck.scale).applyQuaternion(rotation)
                .add(new THREE.Vector3(field[0] + wreck.local[0], field[1] + wreck.local[1], field[2] + wreck.local[2]));
            const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation), half = wreck.interior.halfLength * wreck.scale + 200;
            const chain = [];
            for (let along = -half; along <= half; along += 110) chain.push(center.clone().addScaledVector(axis, along).toArray());
            chains.push(chain);
        }
        return chains;
    }
    return [];
}

export function fieldRoadmapState(session) { return session.fieldRoadmap; }

// Ask for a roadmap around `center` in the active field. Keeps the current
// one when it is for the same field and close enough; otherwise starts a new
// build. Returns the roadmap (possibly still building) or undefined.
export function requestFieldRoadmap(session, center, recenter = false) {
    const instanceId = session.activeInstanceId;
    if (!instanceId || !LOCATIONS[instanceId]) return undefined;
    const current = session.fieldRoadmap;
    if (!recenter && current && current.instanceId === instanceId) {
        // Keep the graph while the target has a full cell of neighbours.
        // Opponents at opposite ends of one tunnel otherwise discard each
        // other's in-progress build despite both being inside its lattice.
        const interior = (current.n - 3) * current.spacing / 2;
        if (Math.max(Math.abs(current.center[0] - center[0]), Math.abs(current.center[1] - center[1]),
            Math.abs(current.center[2] - center[2])) <= interior) return current;
    }
    const spacing = SPACING[instanceId] ?? DEFAULT_SPACING, n = Math.floor(RADIUS * 2 / spacing) + 1;
    const snap = (v) => Math.round(v / spacing) * spacing;
    session.fieldRoadmap = {
        instanceId, spacing, n, center: [snap(center[0]), snap(center[1]), snap(center[2])],
        phase: 'nodes', cursor: 0, portals: portalPoints(instanceId), portalCursor: 0,
        lattice: new Int32Array(n * n * n).fill(-1), positions: [], edgeA: [], edgeB: [],
        meshFallback: instanceId === 'mourning-line', obstacles: session.activeFieldObstacles(instanceId).filter(o=>!o.cover),
        ready: false, buildMs: 0,
    };
    return session.fieldRoadmap;
}

// Advance the build for up to `budgetMs`. Cheap once the roadmap is ready.
export function advanceFieldRoadmap(session, budgetMs = 4) {
    const map = session.fieldRoadmap;
    if (!map || map.ready) return map;
    if (map.instanceId !== session.activeInstanceId) { session.fieldRoadmap = undefined; return undefined; }
    // The cached graph outlives drifting wreck cover: build it against the
    // field alone. Live route checks (entry legs, string-pulling) still see cover.
    session.ignoreCover = true;
    try { return buildFieldRoadmap(session, map, budgetMs); } finally { session.ignoreCover = false; }
}
function buildFieldRoadmap(session, map, budgetMs) {
    const started = performance.now(), deadline = started + budgetMs;
    const scratch = map.scratch ??= { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), side: new THREE.Vector3(), up: new THREE.Vector3() };
    const { n, spacing } = map, half = (n - 1) / 2;
    const nodeFree = (point) => {
        if (session.entryPositionClear(point, map.obstacles, NODE_CLEARANCE)) return true;
        if (!map.meshFallback) return false;
        for (const ray of RAYS) if (session.lineBlocked(point, scratch.d.copy(point).addScaledVector(ray, NODE_CLEARANCE * 1.3))) return false;
        return true;
    };
    const addNode = (x, y, z) => { map.positions.push(x, y, z); return map.positions.length / 3 - 1; };
    while (performance.now() < deadline) {
        if (map.phase === 'nodes') {
            const total = n * n * n;
            for (let step = 0; step < 64 && map.cursor < total; step += 1, map.cursor += 1) {
                const i = map.cursor, ix = i % n, iy = Math.floor(i / n) % n, iz = Math.floor(i / (n * n));
                scratch.a.set(map.center[0] + (ix - half) * spacing, map.center[1] + (iy - half) * spacing, map.center[2] + (iz - half) * spacing);
                if (nodeFree(scratch.a)) map.lattice[i] = addNode(scratch.a.x, scratch.a.y, scratch.a.z);
            }
            if (map.cursor >= total) { map.phase = 'portals'; map.cursor = 0; map.latticeCount = map.positions.length / 3; map.portalNodes = []; }
        }
        else if (map.phase === 'portals') {
            // Every portal point inside the cube becomes a node; consecutive
            // points of one bore are linked in the edge phase.
            for (const chain of map.portals) {
                const ids = [];
                for (const p of chain) {
                    if (Math.abs(p[0] - map.center[0]) > RADIUS || Math.abs(p[1] - map.center[1]) > RADIUS || Math.abs(p[2] - map.center[2]) > RADIUS) { ids.push(-1); continue; }
                    ids.push(nodeFree(scratch.a.fromArray(p)) ? addNode(p[0], p[1], p[2]) : -1);
                }
                map.portalNodes.push(ids);
            }
            map.phase = 'edges'; map.cursor = 0;
        }
        else if (map.phase === 'edges') {
            const total = n * n * n;
            for (let step = 0; step < 24 && map.cursor < total; step += 1, map.cursor += 1) {
                const i = map.cursor, a = map.lattice[i];
                if (a < 0) continue;
                const ix = i % n, iy = Math.floor(i / n) % n, iz = Math.floor(i / (n * n));
                for (const [dx, dy, dz] of HALF_NEIGHBOURS) {
                    const jx = ix + dx, jy = iy + dy, jz = iz + dz;
                    if (jx < 0 || jy < 0 || jz < 0 || jx >= n || jy >= n || jz >= n) continue;
                    const b = map.lattice[(jz * n + jy) * n + jx];
                    if (b >= 0 && edgeClear(session, map, a, b, scratch)) { map.edgeA.push(a); map.edgeB.push(b); }
                }
            }
            if (map.cursor >= total) { map.phase = 'portal-edges'; map.cursor = 0; }
        }
        else if (map.phase === 'portal-edges') {
            const chains = map.portalNodes;
            for (; map.cursor < chains.length; map.cursor += 1) {
                const ids = chains[map.cursor];
                for (let k = 0; k < ids.length; k += 1) {
                    const a = ids[k];
                    if (a < 0) continue;
                    // Along the bore: the next free point, and the one after
                    // so a single blocked sample does not cut the chain.
                    for (const step of [1, 2]) {
                        const b = ids[k + step];
                        if (b !== undefined && b >= 0 && edgeClear(session, map, a, b, scratch)) { map.edgeA.push(a); map.edgeB.push(b); break; }
                    }
                    // Out to the lattice: neighbouring cells within ~1.5 spacing.
                    const p = map.positions, x = p[a * 3], y = p[a * 3 + 1], z = p[a * 3 + 2];
                    const cx = Math.round((x - map.center[0]) / spacing + half), cy = Math.round((y - map.center[1]) / spacing + half), cz = Math.round((z - map.center[2]) / spacing + half);
                    for (let dz = -1; dz <= 1; dz += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
                        const jx = cx + dx, jy = cy + dy, jz = cz + dz;
                        if (jx < 0 || jy < 0 || jz < 0 || jx >= n || jy >= n || jz >= n) continue;
                        const b = map.lattice[(jz * n + jy) * n + jx];
                        if (b >= 0 && edgeClear(session, map, a, b, scratch)) { map.edgeA.push(a); map.edgeB.push(b); }
                    }
                }
                if (performance.now() >= deadline) { map.cursor += 1; break; }
            }
            if (map.cursor >= chains.length) finishRoadmap(map);
        }
        if (map.ready) break;
    }
    map.buildMs += performance.now() - started;
    return map;
}

function edgeClear(session, map, a, b, s) {
    const p = map.positions;
    s.a.set(p[a * 3], p[a * 3 + 1], p[a * 3 + 2]);
    s.b.set(p[b * 3], p[b * 3 + 1], p[b * 3 + 2]);
    return corridorClear(session, s.a, s.b, s);
}

// Apply the graph's hull-width test to entry legs and shortcuts too. A
// visible node across a rock corner may still scrape a passing wing.
const corridorScratch = {
    c: new THREE.Vector3(), d: new THREE.Vector3(), side: new THREE.Vector3(), up: new THREE.Vector3()
};
export function corridorClear(session, start, end, s = corridorScratch) {
    if (session.lineBlocked(start, end)) return false;
    s.c.copy(end).sub(start).normalize();
    s.side.crossVectors(s.c, Math.abs(s.c.y) > .9 ? s.up.set(1,0,0) : s.up.set(0,1,0)).normalize();
    s.up.crossVectors(s.side, s.c).normalize();
    for (const [side, up] of WING_OFFSETS) {
        s.c.copy(start).addScaledVector(s.side, side).addScaledVector(s.up, up);
        s.d.copy(end).addScaledVector(s.side, side).addScaledVector(s.up, up);
        if (session.lineBlocked(s.c, s.d)) return false;
    }
    return true;
}

function finishRoadmap(map) {
    const count = map.positions.length / 3, degree = new Int32Array(count + 1);
    for (let e = 0; e < map.edgeA.length; e += 1) { degree[map.edgeA[e] + 1] += 1; degree[map.edgeB[e] + 1] += 1; }
    for (let i = 0; i < count; i += 1) degree[i + 1] += degree[i];
    const offsets = degree.slice(), fill = degree.slice(0, count), neighbours = new Int32Array(map.edgeA.length * 2);
    for (let e = 0; e < map.edgeA.length; e += 1) {
        const a = map.edgeA[e], b = map.edgeB[e];
        neighbours[fill[a]++] = b; neighbours[fill[b]++] = a;
    }
    map.positionsArray = Float64Array.from(map.positions);
    map.offsets = offsets; map.neighbours = neighbours; map.nodeCount = count; map.edgeCount = map.edgeA.length;
    // Query scratch, reused across plans (a stamp avoids refilling).
    map.cost = new Float64Array(count); map.parent = new Int32Array(count); map.stamp = new Uint32Array(count); map.closed = new Uint32Array(count); map.query = 0;
    map.positions = map.edgeA = map.edgeB = map.obstacles = undefined;
    map.phase = 'ready'; map.ready = true;
}

// A route from `start` to a point that can see `target` within `engage`
// range: an array of [x, y, z] waypoints (the last one has the line of
// sight), or undefined when the roadmap is not ready or has no answer.
export function planCombatRoute(session, ship, start, target, engage, tactic, pressureAxis, maxLength = Infinity) {
    const map = session.fieldRoadmap;
    if (!map?.ready || map.instanceId !== session.activeInstanceId) return undefined;
    const s = map.planScratch ??= { a: new THREE.Vector3(), b: new THREE.Vector3(), heap: [], seen: new Map() };
    const p = map.positionsArray, q = ++map.query, n = map.n, half = (n - 1) / 2, spacing = map.spacing;
    const cell = (v, k) => Math.round((v - map.center[k]) / spacing + half);
    const node = (i, out) => out.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    const heap = s.heap; heap.length = 0;
    // A shadow or a side-on firing position can lie in any direction. Set
    // the heuristic to zero to find the nearest reachable one by route length.
    const f = tactic ? i => map.cost[i] : (i) => map.cost[i] + Math.max(0, Math.hypot(p[i * 3] - target.x, p[i * 3 + 1] - target.y, p[i * 3 + 2] - target.z) - engage * 0.8);
    const push = (i) => {
        heap.push(i);
        for (let k = heap.length - 1; k > 0;) { const up = (k - 1) >> 1; if (f(heap[k]) >= f(heap[up])) break; [heap[k], heap[up]] = [heap[up], heap[k]]; k = up; }
    };
    const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
            heap[0] = last;
            for (let k = 0; ;) { const l = k * 2 + 1, r = l + 1; let m = k; if (l < heap.length && f(heap[l]) < f(heap[m])) m = l; if (r < heap.length && f(heap[r]) < f(heap[m])) m = r; if (m === k) break; [heap[k], heap[m]] = [heap[m], heap[k]]; k = m; }
        }
        return top;
    };
    // Entry: the visible nodes in the ship's 5x5x5 neighbourhood, plus any
    // portal node close by (a ship inside a bore sits between lattice cells).
    const sx = cell(start.x, 0), sy = cell(start.y, 1), sz = cell(start.z, 2);
    let entries = 0;
    const enter = (i) => {
        if (i < 0 || map.stamp[i] === q) return;
        node(i, s.a);
        const d = s.a.distanceTo(start);
        if (d > maxLength || d > spacing * 2.6 || !corridorClear(session,start,s.a,map.scratch)) return;
        map.stamp[i] = q; map.cost[i] = d; map.parent[i] = -1; push(i); entries += 1;
    };
    for (let dz = -2; dz <= 2; dz += 1) for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
        const x = sx + dx, y = sy + dy, z = sz + dz;
        if (x < 0 || y < 0 || z < 0 || x >= n || y >= n || z >= n) continue;
        enter(map.lattice[(z * n + y) * n + x]);
    }
    for (let i = map.latticeCount; i < map.nodeCount; i += 1)
        if (Math.abs(p[i * 3] - start.x) < spacing * 2 && Math.abs(p[i * 3 + 1] - start.y) < spacing * 2 && Math.abs(p[i * 3 + 2] - start.z) < spacing * 2) enter(i);
    if (!entries) {
        if (tactic) return undefined;
        // A target can be inside a shared graph while its hunter cannot reach
        // even one entry. Build around this pair once, retaining ordinary
        // shared graphs (including a graph with entries but no route).
        const center = [start.x + target.x, start.y + target.y, start.z + target.z]
            .map(sum => Math.round(sum / (2 * spacing)) * spacing);
        const fits = (point, radius) => Math.max(Math.abs(point.x-center[0]),
            Math.abs(point.y-center[1]), Math.abs(point.z-center[2])) <= radius;
        if (center.some((value, axis) => value !== map.center[axis]) &&
            fits(start, half*spacing) && fits(target, (half-1)*spacing))
            requestFieldRoadmap(session, center, true);
        return undefined;
    }
    let goal = -1, expansions = 0;
    while (heap.length && expansions < MAX_EXPANSIONS) {
        const i = pop();
        if (map.closed[i] === q) continue;
        map.closed[i] = q; expansions += 1;
        node(i, s.a);
        if (tactic === 'cover') {
            if (session.lineBlocked(s.a, target, ship.id)) { goal = i; break; }
        } else if (s.a.distanceTo(target) <= engage && !session.lineBlocked(s.a, target, ship?.id)) {
            // The pressure axis points from the target to the bait. Require
            // at least a 90-degree split, reached by going around terrain.
            if (!tactic || (map.parent[i] >= 0 && s.b.subVectors(s.a, target).dot(pressureAxis) <= 0
                && session.lineBlocked(start, s.a))) { goal = i; break; }
        }
        for (let k = map.offsets[i]; k < map.offsets[i + 1]; k += 1) {
            const j = map.neighbours[k];
            if (map.closed[j] === q) continue;
            node(j, s.b);
            const cost = map.cost[i] + s.a.distanceTo(s.b);
            if (cost <= maxLength && (map.stamp[j] !== q || cost < map.cost[j])) { map.stamp[j] = q; map.cost[j] = cost; map.parent[j] = i; push(j); }
        }
    }
    if (goal < 0) return undefined;
    const chain = [];
    for (let i = goal; i >= 0; i = map.parent[i]) chain.push(i);
    chain.reverse();
    // String-pull: from the ship, skip to the furthest node still in clear
    // reach through a hull-width corridor.
    const waypoints = [];
    let from = s.b.copy(start), index = 0;
    while (index < chain.length) {
        let reach = index;
        for (let k = chain.length - 1; k > index; k -= 1) { if (corridorClear(session,from,node(chain[k], s.a),map.scratch)) { reach = k; break; } }
        const pick = chain[reach];
        waypoints.push([p[pick * 3], p[pick * 3 + 1], p[pick * 3 + 2]]);
        from = node(pick, s.b);
        index = reach + 1;
    }
    return waypoints;
}

// Seconds a pursuit must stay blocked before it plans a route: a passing
// rock is the local controller's business.
export const ROUTE_BLOCKED_DELAY = 0.4;
const ROUTE_REPLAN = 2.5;
const ROUTE_TARGET_MOVED = 260;
const WAYPOINT_REACHED = 60;

// The waypoint a pilot should fly while its line to `target` is blocked by
// terrain, written to `out`; undefined while the line is clear (normal
// combat) or no route exists. Route state lives on ship.combatRoute.
export function combatRouteWaypoint(session, ship, position, target, engage, out) {
    const now = session.save.world.time;
    const r = ship.combatRoute ??= { waypoints: null, index: 0, plannedAt: -Infinity, target: [0, 0, 0], blockedSince: undefined, checkAt: 0, blocked: false, failedUntil: 0, active: false, leg: 0, scratch: new THREE.Vector3() };
    if (now >= r.checkAt || now < r.checkAt - 1) {
        r.checkAt = now + 0.2;
        r.blocked = session.lineBlocked(position, target, ship.id);
        // Corner-cutting: the next waypoint is in sight, so this one is done.
        if (r.active && r.waypoints && r.index + 1 < r.waypoints.length && session.fieldRoadmap?.scratch && corridorClear(session,position,r.scratch.fromArray(r.waypoints[r.index + 1]),session.fieldRoadmap.scratch)) r.index += 1;
    }
    if (!r.blocked) {
        r.blockedSince = undefined;
        r.active = false; r.waypoints = null;
        return undefined;
    }
    r.blockedSince ??= now;
    if (now - r.blockedSince < ROUTE_BLOCKED_DELAY) return undefined;
    const moved = Math.hypot(r.target[0] - target.x, r.target[1] - target.y, r.target[2] - target.z);
    if ((!r.waypoints || r.index >= r.waypoints.length || now - r.plannedAt > ROUTE_REPLAN || moved > ROUTE_TARGET_MOVED) && now >= r.failedUntil) {
        target.toArray(r.target);
        requestFieldRoadmap(session, r.target);
        const plan = planCombatRoute(session, ship, position, target, engage);
        r.plannedAt = now;
        if (plan?.length) { r.waypoints = plan; r.index = 0; }
        else { r.waypoints = null; r.failedUntil = now + 1; }
    }
    if (!r.waypoints) { r.active = false; return undefined; }
    // The checked corner cut above is the only handoff. Proximity alone
    // cannot authorize a shortcut across a wall.
    const waypoint = r.scratch.fromArray(r.waypoints[r.index]);
    r.leg = position.distanceTo(waypoint);
    if (r.index === r.waypoints.length - 1 && r.leg < WAYPOINT_REACHED) { r.active = false; return undefined; }
    r.active = true;
    return out.copy(waypoint);
}
