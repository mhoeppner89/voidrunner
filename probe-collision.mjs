// Headless probe for the player-vs-asteroid collision shape.
//
// The asteroid's collision surface is the rock's ACTUAL rendered mesh (a
// detail-2 icosahedron with per-vertex radial distortion, scaled per axis).
// The player's hull is an oriented ellipsoid fitted to the GLB ship model in
// the ship frame (nose -Z). Together a bump lands on the visible surface from
// every angle, and a long ship bumps at its nose, not at a tiny sphere around
// its centre.
//
// The deformed surface is bumpy (vertex radius 0.4..1.04 of the rock radius),
// so the collision reach along a given direction is NOT monotonic: an approach
// can brush a protruding face, pass a gap, then touch a deeper dent. Binary
// search is only valid on directions whose first contact is a true peak (the
// peak and diagonal directions); for the dent direction the probe checks
// direct contact at the dent floor instead.
//
// Run: node probe-collision.mjs   (exit code 0 = all green)
import { register } from 'node:module';
await register(new URL('./probe-ai-resolver.mjs', import.meta.url));
const THREE = await import('three');
const { GameSession } = await import('./src/game/game.js');
const { createNewSave } = await import('./src/game/save.js');
const { generateAsteroidField, getAsteroidBaseMeshes } = await import('./src/game/worldData.js');

let passed = 0;
const assert = (condition, message) => {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        process.exitCode = 1;
    }
    else {
        passed += 1;
        console.log(`ok - ${message}`);
    }
};

// A session containing exactly one asteroid: the collider is exercised in
// isolation so neighbouring rocks can never push the ship or fire spuriously.
// `hull` is the ship-frame half-extents [starboard, up, forward]; `rotation`
// the ship's world quaternion [x, y, z, w].
const makeSession = (asteroids, hull = [1.38, 2.37, 6.09], rotation = [0, 0, 0, 1]) => {
    const save = createNewSave(1);
    save.player.position = [0, 0, 0];
    save.player.velocity = [0, 0, 0];
    save.player.rotation = rotation;
    const session = Object.create(GameSession.prototype);
    session.save = save;
    session.activeInstanceId = 'shardbelt';
    session.asteroids = asteroids;
    session.graveyard = [];
    session.wreckNodes = [];
    session.obstacleGrid = null;
    session.obstacleGridInstance = undefined;
    session.obstacleGridBuiltAt = -Infinity;
    session.obstacleCellSize = 256;
    for (const name of ['tmpA', 'tmpB', 'tmpC', 'tmpD', 'tmpE', 'tmpF', 'tmpG', 'tmpH', 'tmpI', 'tmpJ', 'tmpK', 'tmpL', 'tmpAvoidance', 'tmpShipAvoid', 'tmpCollide', 'tmpP0', 'tmpP1', 'tmpP2', 'tmpP3', 'tmpP4'])
        session[name] = new THREE.Vector3();
    session.tmpM4 = new THREE.Matrix4();
    session.tmpQ = new THREE.Quaternion();
    session.tmpQ2 = new THREE.Quaternion();
    session.ui = { pushEvent: () => undefined };
    session.collisionMessageCooldown = 0;
    session.autopilot = true;
    session.damagePlayer = () => undefined;
    session._probeHull = hull;
    session.playerHullExtents = () => hull;
    return session;
};

// Does the collider fire with the ship centre at `dist` from the rock centre
// along `dir`? Returns true when autopilot was cancelled (a bump).
const firesAt = (session, obstacle, dir, dist) => {
    const position = new THREE.Vector3(obstacle.x + dir.x * dist, obstacle.y + dir.y * dist, obstacle.z + dir.z * dist);
    session.autopilot = true;
    session.resolvePlayerCollisions(position, new THREE.Vector3(0, 0, 0));
    return !session.autopilot;
};

// Independent surface radius: ray from the rock centre along `dir` (unit) to
// the first crossing of the actual mesh (Möller–Trumbore). For a star-shaped
// rock this is the visible surface distance in that direction.
const surfaceRadiusAlong = (node, dir) => {
    const base = getAsteroidBaseMeshes()[node.shape % 4];
    const sx = node.radius * node.scale[0];
    const sy = node.radius * node.scale[1];
    const sz = node.radius * node.scale[2];
    const p = base.positions;
    const ind = base.indices;
    let best = Infinity;
    for (let t = 0; t < ind.length; t += 3) {
        const i0 = ind[t] * 3;
        const i1 = ind[t + 1] * 3;
        const i2 = ind[t + 2] * 3;
        const ax = p[i0] * sx;
        const ay = p[i0 + 1] * sy;
        const az = p[i0 + 2] * sz;
        const bx = p[i1] * sx;
        const by = p[i1 + 1] * sy;
        const bz = p[i1 + 2] * sz;
        const cx = p[i2] * sx;
        const cy = p[i2 + 1] * sy;
        const cz = p[i2 + 2] * sz;
        const e1x = bx - ax;
        const e1y = by - ay;
        const e1z = bz - az;
        const e2x = cx - ax;
        const e2y = cy - ay;
        const e2z = cz - az;
        const pvecx = dir.y * e2z - dir.z * e2y;
        const pvecy = dir.z * e2x - dir.x * e2z;
        const pvecz = dir.x * e2y - dir.y * e2x;
        const det = e1x * pvecx + e1y * pvecy + e1z * pvecz;
        if (Math.abs(det) < 1e-12)
            continue;
        const invDet = 1 / det;
        const tvecx = -ax;
        const tvecy = -ay;
        const tvecz = -az;
        const u = (tvecx * pvecx + tvecy * pvecy + tvecz * pvecz) * invDet;
        if (u < 0 || u > 1)
            continue;
        const qvecx = tvecy * e1z - tvecz * e1y;
        const qvecy = tvecz * e1x - tvecx * e1z;
        const qvecz = tvecx * e1y - tvecy * e1x;
        const v = (dir.x * qvecx + dir.y * qvecy + dir.z * qvecz) * invDet;
        if (v < 0 || u + v > 1)
            continue;
        const tHit = (e2x * qvecx + e2y * qvecy + e2z * qvecz) * invDet;
        if (tHit > 1e-6 && tHit < best)
            best = tHit;
    }
    return best;
};

// The collider's actual reach along `dir` for the session's hull: the FIRST
// centre distance (approaching from far away) at which a bump fires. Scan
// inward with coarse steps; on the first firing sample, bisect against the
// last clear sample above it. This finds the outermost contact even on a
// bumpy face (where firing can pause in a gap and resume deeper in).
const colliderReach = (session, obstacle, dir) => {
    const hi = Math.max(obstacle.radius, obstacle.losRadius) + Math.max(...session._probeHull) + 20;
    const step = 2;
    let lastClear = hi;
    for (let d = hi; d > 0; d -= step) {
        if (firesAt(session, obstacle, dir, d)) {
            let lo = d;
            let hiD = lastClear;
            for (let i = 0; i < 30; i += 1) {
                const mid = (lo + hiD) / 2;
                if (firesAt(session, obstacle, dir, mid))
                    lo = mid;
                else
                    hiD = mid;
            }
            return (lo + hiD) / 2;
        }
        lastClear = d;
    }
    return -1;
};

// A rock with identity rotation and uniform scale isolates the shape test.
const uniformRock = (radius = 40, scale = 1) => ({
    id: 'probe-rock',
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    radius,
    scale: [scale, scale, scale],
    rotation: [0, 0, 0],
    rotationSpeed: [0, 0, 0],
    moving: false,
    resource: 'ore',
    remaining: 10,
    scanned: false,
    tunnelPart: false,
    shape: 1,
});

const PR = 1.3; // kestrel cross-section for the sphere probe
const rock = uniformRock();
const session = makeSession([rock], [PR, PR, PR]);
const obstacle = session.activeFieldObstacles()[0];
const base = getAsteroidBaseMeshes()[rock.shape % 4];

// Find the peak, dent, and diagonal directions from the base mesh vertices.
let peakDir;
let peakR = -Infinity;
let dentDir;
let dentR = Infinity;
for (let i = 0; i < base.positions.length; i += 3) {
    const r = Math.hypot(base.positions[i], base.positions[i + 1], base.positions[i + 2]);
    if (r > peakR) {
        peakR = r;
        peakDir = new THREE.Vector3(base.positions[i], base.positions[i + 1], base.positions[i + 2]).normalize();
    }
    if (r < dentR) {
        dentR = r;
        dentDir = new THREE.Vector3(base.positions[i], base.positions[i + 1], base.positions[i + 2]).normalize();
    }
}
const diagDir = new THREE.Vector3(1, 1, 1).normalize();

// Peak and diagonal: the surface is convex along these rays, so the bump must
// land at the visible surface + the ship's radius, and clear just beyond.
for (const [name, dir] of Object.entries({ peak: peakDir, diagonal: diagDir })) {
    const surface = surfaceRadiusAlong(rock, dir);
    assert(Number.isFinite(surface) && surface > 1, `${name}: surface radius ${surface.toFixed(1)} measured`);
    const reach = colliderReach(session, obstacle, dir);
    assert(Math.abs(reach - (surface + PR)) < 1.5, `${name}: reach ${reach.toFixed(1)} ≈ surface ${surface.toFixed(1)} + ship ${PR} (${(surface + PR).toFixed(1)})`);
    assert(!firesAt(session, obstacle, dir, surface + PR + 2.5), `${name}: clear ${(surface + PR + 2.5).toFixed(1)} past the visible surface`);
}

// The old enclosing-box envelope: face at 0.9·R, corner at 0.9·R·√3.
const boxFaceReach = 0.9 * rock.radius + PR;
const boxCornerReach = 0.9 * rock.radius * Math.sqrt(3) + PR;
const diagSurface = surfaceRadiusAlong(rock, diagDir);
assert(boxCornerReach > diagSurface + PR + 2, `box corner ${boxCornerReach.toFixed(1)} still pokes far past the visible diagonal surface ${(diagSurface + PR).toFixed(1)} (the phantom gap being removed)`);

// Dents: the collision follows the actual surface, so a ship can tuck into a
// dent far inside the old enclosing-box face — and the bump fires exactly at
// the dent floor, not at the box.
const dentSurface = surfaceRadiusAlong(rock, dentDir);
assert(dentSurface < boxFaceReach - PR - 2, `dent floor ${dentSurface.toFixed(1)} sits well inside the old box face ${boxFaceReach.toFixed(1)} (a real concavity)`);
{
    // Tucked deep inside the concavity, well inside the old box face: the
    // collision follows the dent, so no bump yet. (The walls converge toward
    // the floor, so the hull clears here but fires once it reaches them.)
    const tuck = boxFaceReach - 3;
    assert(!firesAt(session, obstacle, dentDir, tuck), `tucked at ${tuck.toFixed(1)} (inside old box face ${boxFaceReach.toFixed(1)}) stays clear of the dent`);
    // Just overlapping the dent floor: fires.
    const overlap = dentSurface + PR - 0.5;
    assert(firesAt(session, obstacle, dentDir, overlap), `overlapping the dent floor at ${overlap.toFixed(1)} fires`);
    // Far inside the dent (centre below the floor): fires (interior exit).
    const deep = dentSurface - 3;
    assert(firesAt(session, obstacle, dentDir, deep), `deep in the dent at ${deep.toFixed(1)} fires and pushes out`);
}

// Push-out: after a bump the hull must sit clear of the surface (no repeated
// collisions while stationary).
{
    const t = diagSurface + PR - 0.5;
    const dir = diagDir;
    const position = new THREE.Vector3(obstacle.x + dir.x * t, obstacle.y + dir.y * t, obstacle.z + dir.z * t);
    session.autopilot = true;
    session.resolvePlayerCollisions(position, new THREE.Vector3(0, 0, 0));
    assert(!session.autopilot, 'bump fires just inside the diagonal surface');
    session.autopilot = true;
    session.resolvePlayerCollisions(position, new THREE.Vector3(0, 0, 0));
    assert(session.autopilot, 'after the push the hull sits clear of the surface');
}

// Hull directionality: on the SAME rock direction, the kestrel hull
// [1.38, 2.37, 6.09] fires earlier nose-first (forward -Z reaches out 6.09)
// than side-first (starboard +X reaches only 1.38). The ship is rotated, not
// the approach direction, so the rock's bumpiness cannot skew the comparison.
{
    const hull = [1.38, 2.37, 6.09];
    const axis = new THREE.Vector3(0, 0, 1); // approach along +Z toward the rock
    const surface = surfaceRadiusAlong(rock, axis);
    // Nose-first: forward (-Z) already faces the rock at identity rotation.
    const noseSession = makeSession([rock], hull);
    const noseObstacle = noseSession.activeFieldObstacles()[0];
    const noseReach = colliderReach(noseSession, noseObstacle, axis);
    assert(Math.abs(noseReach - (surface + hull[2])) < 1.5, `nose-first reach ${noseReach.toFixed(1)} ≈ surface ${surface.toFixed(1)} + hull length ${hull[2]} (${(surface + hull[2]).toFixed(1)})`);
    // Side-first: rotate the ship so starboard (+X) faces the rock (-Z).
    const sideQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1));
    const sideSession = makeSession([rock], hull, [sideQuat.x, sideQuat.y, sideQuat.z, sideQuat.w]);
    const sideObstacle = sideSession.activeFieldObstacles()[0];
    const sideReach = colliderReach(sideSession, sideObstacle, axis);
    // Side-first fires no sooner than a hull barely touching the surface (the
    // long body rotated sideways clips the dent's sloping walls first, so the
    // exact surface + width bound does not hold — the comparison below is the
    // directionality proof).
    assert(sideReach > surface + 0.5, `side-first reach ${sideReach.toFixed(1)} fires no sooner than surface ${surface.toFixed(1)} + margin`);
    // The long axis must fire earlier than the short axis on the same rock.
    assert(noseReach - sideReach > 2, `nose-first reach ${noseReach.toFixed(1)} exceeds side-first ${sideReach.toFixed(1)} by the hull's forward extent`);
}

console.log(`\n${passed} assertions passed.`);
