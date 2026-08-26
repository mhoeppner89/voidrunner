// Headless regression probe: weapon projectiles must collide with asteroids.
//
// Guards the asteroid projectile-collision fix (v0.7.7b-test.5): the asteroid
// line test used to cull every shot once its step-start entered the rock's
// bounding sphere (both endpoints inside = "no hit"), so bolts sailed clean
// through the belt. This probe fires real laser bolts through the sim's
// updateProjectiles path and asserts each one dies ON the visible rock
// surface — never deep inside the rock, and never by running out of range.
//
// Scenarios:
//   - one large rock, fired from several approach directions (the bug was
//     direction-dependent on the old fat-box guard and universal once the
//     step-start entered the bounding sphere);
//   - one small drift-style rock (proportionally the worst case);
//   - empty space control: a bolt must fly its full range there (the fix must
//     not over-block open lanes).
// Also asserts the rock-hit flavour fires (matte chip burst + 'rock' audio),
// so the feedback added on top of the collision fix stays wired.
//
// Run: node probe-projectile-collision.mjs   (exit code 0 = all green)
import { register } from 'node:module';
await register(new URL('./probe-ai-resolver.mjs', import.meta.url));
const THREE = await import('three');
const { GameSession } = await import('./src/game/game.js');
const { EntityStore } = await import('./src/game/entityStore.js');
const { createNewSave } = await import('./src/game/save.js');
const { getAsteroidBaseMeshes } = await import('./src/game/worldData.js');

let passed = 0;
let failed = 0;
const check = (condition, message) => {
    if (condition) {
        passed += 1;
        console.log(`ok - ${message}`);
    }
    else {
        failed += 1;
        console.error(`FAIL: ${message}`);
    }
};

const STEP = 1 / 60;

// A session with everything updateProjectiles touches: the obstacle grid,
// projectile store, scratch vectors and renderer/audio spies. Built via the
// prototype — the constructor needs WebGL/DOM.
const makeSession = (asteroids) => {
    const save = createNewSave(1);
    save.world.time = 0;
    save.player.position = [0, 0, 0];
    save.player.velocity = [0, 0, 0];
    save.player.rotation = [0, 0, 0, 1];
    const session = Object.create(GameSession.prototype);
    session.save = save;
    session.activeInstanceId = 'shardbelt';
    session.asteroids = asteroids;
    session.graveyard = [];
    session.wreckNodes = [];
    session.obstacleGrid = null;
    session.obstacleSegmentGrid = null;
    session.obstacleGridInstance = undefined;
    session.obstacleGridBuiltAt = -Infinity;
    session.obstacleCellSize = 256;
    for (const name of ['tmpP0', 'tmpP1', 'tmpP2', 'tmpP3', 'tmpP4', 'tmpP5', 'tmpP6', 'tmpAudioLocal'])
        session[name] = new THREE.Vector3();
    session.tmpM4 = new THREE.Matrix4();
    session.tmpQ = new THREE.Quaternion();
    session.tmpQ2 = new THREE.Quaternion();
    session.tmpEuler = new THREE.Euler();
    session.tmpAudioOrientation = new THREE.Quaternion();
    session.ships = [];
    session.projectiles = [];
    session.projStore = new EntityStore(256);
    session.projectileCounter = 0;
    session.playerCollisionRadius = () => 1.4;
    const rockImpacts = [];
    const sounds = [];
    let impactCount = 0;
    session.renderer = {
        spawnImpact: () => { impactCount += 1; },
        spawnExplosion: () => undefined,
        spawnMuzzleFlash: () => undefined,
        spawnRockImpact: (position, center) => rockImpacts.push({ position, center }),
    };
    session.audio = {
        play: () => undefined,
        playAtDirection: (effect) => sounds.push(effect),
    };
    session.ui = { pushEvent: () => undefined };
    session._rockImpacts = rockImpacts;
    session._sounds = sounds;
    session._impactCount = () => impactCount;
    return session;
};

// Push one pulse-laser bolt from `origin` toward the rock centre.
const fireBolt = (session, origin, dir, speed = 205, life = 1.35) => {
    const slot = session.projStore.alloc();
    session.projStore.setPos(slot, origin[0], origin[1], origin[2]);
    session.projStore.setVel(slot, dir[0] * speed, dir[1] * speed, dir[2] * speed);
    const projectile = { id: `p-${++session.projectileCounter}`, kind: 'laser', ownerId: 'player', slot, damage: 10, life, faction: 'player' };
    session.projectiles.push(projectile);
    return projectile;
};

// Step updateProjectiles until the bolt dies (life <= 0) or maxSeconds
// elapses. Dead bolts stay in the array (cleanup runs elsewhere), so death is
// detected on the bolt's own life, and "died on a hit" via the impact spy.
// Returns the flight trace (pre-step distances to the rock centre) and death
// info. A hit sets life to exactly 0; range expiry leaves it negative.
const runBolt = (session, rockCenter) => {
    const traces = [];
    let diedAtStep = -1;
    let diedOnHit = false;
    for (let step = 0; step < Math.ceil(4 * 60) && session.projectiles.length > 0; step += 1) {
        const bolt = session.projectiles[0];
        const p = session.projStore.getPos(bolt.slot, new THREE.Vector3());
        traces.push(Math.hypot(p.x - rockCenter[0], p.y - rockCenter[1], p.z - rockCenter[2]));
        const impactsBefore = session._impactCount();
        session.save.world.time += STEP;
        session.updateProjectiles(STEP);
        if (bolt.life <= 0) {
            diedAtStep = step;
            diedOnHit = session._impactCount() > impactsBefore;
            break;
        }
    }
    return { traces, diedAtStep, diedOnHit };
};

// The ENTRY face of the rock along `dir`: ray from far outside toward the
// centre, first crossing of the actual deformed mesh (Möller–Trumbore). This
// is the surface a projectile approaching from outside actually touches —
// raycasting from the centre instead finds interior dents.
const entryFaceAlong = (node, dir) => {
    const base = getAsteroidBaseMeshes()[node.shape % 4];
    const sx = node.radius * node.scale[0];
    const sy = node.radius * node.scale[1];
    const sz = node.radius * node.scale[2];
    const p = base.positions;
    const ind = base.indices;
    const BIG = 5000;
    const ox = -dir[0] * BIG;
    const oy = -dir[1] * BIG;
    const oz = -dir[2] * BIG;
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
        const pvecx = dir[1] * e2z - dir[2] * e2y;
        const pvecy = dir[2] * e2x - dir[0] * e2z;
        const pvecz = dir[0] * e2y - dir[1] * e2x;
        const det = e1x * pvecx + e1y * pvecy + e1z * pvecz;
        if (Math.abs(det) < 1e-12)
            continue;
        const invDet = 1 / det;
        const tx = ox - ax;
        const ty = oy - ay;
        const tz = oz - az;
        const u = (tx * pvecx + ty * pvecy + tz * pvecz) * invDet;
        if (u < 0 || u > 1)
            continue;
        const qx = ty * e1z - tz * e1y;
        const qy = tz * e1x - tx * e1z;
        const qz = tx * e1y - ty * e1x;
        const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * invDet;
        if (v < 0 || u + v > 1)
            continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * invDet;
        if (tt > 1e-6 && tt < best)
            best = tt;
    }
    // dir is unit and the ray starts at distance BIG from the centre, so the
    // hit sits BIG - best units from the centre.
    return best === Infinity ? null : BIG - best;
};

// A rock like the belt's: non-uniform scale, a fixed (non-identity) rotation
// so the collision box is genuinely rotated relative to the approach.
const beltRock = (radius, scale, rotation) => ({
    id: 'probe-rock',
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    radius,
    scale,
    rotation,
    rotationSpeed: [0, 0, 0],
    moving: false,
    resource: 'ore',
    remaining: 10,
    scanned: false,
    tunnelPart: false,
    shape: 1,
});

const bigRock = beltRock(70, [1.5, 1.2, 1.1], [0.9, 2.2, 0.5]);
const smallRock = beltRock(8, [1.25, 0.9, 1.15], [1.7, 0.4, 2.6]);
const CENTER = [0, 0, 0];
const SPEED = 205;
const RANGE = SPEED * 1.35; // pulse laser range — a pass-through dies here

// One scenario: fire a bolt at the rock from `origin`, assert it dies on the
// visible surface (not deep inside, not by range) and fires the rock FX.
const runRockScenario = (label, rock, origin) => {
    const session = makeSession([rock]);
    const dir = [-origin[0], -origin[1], -origin[2]];
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    dir[0] /= len;
    dir[1] /= len;
    dir[2] /= len;
    const obstacle = session.activeFieldObstacles()[0];
    const minReach = obstacle.minReach;
    const entry = entryFaceAlong(rock, dir);
    // Tolerance: the dying step starts up to one full step outside the entry
    // face, and the sim can graze a bumpy face a couple of steps early.
    const surfaceTolerance = SPEED * STEP * 2 + 6;
    fireBolt(session, origin, dir, SPEED);
    const { traces, diedAtStep, diedOnHit } = runBolt(session, CENTER);
    const minDistance = Math.min(...traces);
    const travel = len - traces[traces.length - 1];
    check(diedAtStep >= 0, `${label}: bolt died (step ${diedAtStep})`);
    check(diedOnHit, `${label}: bolt died on a hit, not by running out of range (traveled ${travel.toFixed(1)} of ${RANGE.toFixed(0)})`);
    check(minDistance >= minReach * 0.9, `${label}: bolt stopped at the surface (min distance ${minDistance.toFixed(1)} >= inscribed sphere ${minReach.toFixed(1)}) — did not pass through the rock`);
    check(entry !== null && minDistance >= entry - surfaceTolerance, `${label}: bolt stopped at the entry face (${minDistance.toFixed(1)} vs entry ${entry?.toFixed(1)})`);
    check(session._rockImpacts.length >= 1, `${label}: rock chip/dust burst spawned (${session._rockImpacts.length})`);
    check(session._sounds.includes('rock'), `${label}: 'rock' impact sound played`);
};

// ---- Scenario 1: one large rock, several approach directions ---------------
// Slightly off-axis so the ray is not degenerate against the triangulated
// surface (an exactly-axial ray can graze vertex/edge contacts).
runRockScenario('large rock +X approach', bigRock, [260, 4, -3]);
runRockScenario('large rock +Y approach', bigRock, [3, 260, -2]);
runRockScenario('large rock -Z approach', bigRock, [-2, 4, -260]);
runRockScenario('large rock diagonal approach', bigRock, [150, 130, -160]);

// ---- Scenario 2: a small drift-style rock ---------------------------------
runRockScenario('small rock approach', smallRock, [4, -3, -120]);

// ---- Scenario 3: empty-space control --------------------------------------
{
    const session = makeSession([]);
    fireBolt(session, [0, 0, 0], [1, 0, 0], SPEED);
    const { traces, diedAtStep, diedOnHit } = runBolt(session, CENTER);
    const travel = traces[traces.length - 1];
    check(diedAtStep >= 0 && !diedOnHit, 'open space: bolt dies of old age, no hit');
    check(travel >= RANGE * 0.95, `open space: full range covered (${travel.toFixed(1)} of ${RANGE.toFixed(0)})`);
    check(session._rockImpacts.length === 0, 'open space: no rock FX fired');
    check(!session._sounds.includes('rock'), 'open space: no rock sound fired');
}

console.log(`\n${passed} checks passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
