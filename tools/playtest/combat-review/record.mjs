// Records cliff duels (and two reversal manoeuvres) for the combat review
// page: the same starts flown by an older checkout (OLD_ROOT) and by this
// one, with ship tracks, speeds, terrain limits, stops and wall contacts,
// plus the nearby rock surface so the page can draw where they flew.
//
//   OLD_ROOT=<previous checkout> node --import ./tests/helpers/offline-imports.mjs tools/playtest/combat-review/record.mjs
//
// Writes output/combat-review/duels.json. Env: SCAN (starts searched per
// tier, default 16), PICK (duels kept per tier, default 2), SECONDS (40).
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const SECONDS = +(process.env.SECONDS ?? 40), SCAN = +(process.env.SCAN ?? 16), PICK = +(process.env.PICK ?? 2);
const roots = { before: process.env.OLD_ROOT, after: '.' };
if (!roots.before) throw new Error('Set OLD_ROOT to a checkout of the previous version.');
const load = async (root) => {
    const url = pathToFileURL(resolve(root)).href;
    return {
        THREE: await import(`${url}/vendor/three.module.min.js`),
        session: (await import(`${url}/tests/helpers/session.mjs`)).session,
        world: await import(`${url}/src/game/worldData.js`),
        GameSession: (await import(`${url}/src/game/game.js`)).GameSession,
        LOCATIONS: (await import(`${url}/src/game/data.js`)).LOCATIONS,
        layout: await import(`${url}/src/game/asteroidFieldLayout.js`),
        terrain: await import(`${url}/src/game/asteroidTerrain.js`),
        ace: await import(`${url}/src/game/aceManeuvers.js`),
    };
};
const versions = { before: await load(roots.before), after: await load(roots.after) };
const rng = (seed) => () => ((seed = Math.imul(seed ^ seed >>> 15, 2246822507) + 0x6d2b79f5 | 0) >>> 0) / 4294967296;

function fieldSession(v) {
    const { THREE, GameSession } = v, s = v.session();
    s.tmpCollide = new THREE.Vector3(); s.tmpEuler = new THREE.Euler(); s.fireNpcGun = () => {}; s.damageShip = () => {};
    s.activeInstanceId = 'shardbelt'; s.asteroids = v.world.generateAsteroidField(718, []); s.graveyard = v.world.generateGraveyardPieces(718); s.wreckNodes = [];
    s.activeFieldObstacles = GameSession.prototype.activeFieldObstacles; s.obstacles = s.activeFieldObstacles();
    s.forEachObstacleInBox = GameSession.prototype.forEachObstacleInBox; s.obstacleCellSize = 180; s.obstacleQueryStamp = 0;
    for (const key of ['tmpEntryAnchor', 'tmpEntryCandidate', 'tmpEntryPreferredDirection']) s[key] = new THREE.Vector3();
    return s;
}
function starts(v, c) {
    const { THREE } = v, s = fieldSession(v), random = rng(1000 + c), origin = new THREE.Vector3(...v.LOCATIONS.shardbelt.position);
    const spot = () => {
        for (let n = 0; n < 4000; n++) {
            const local = new THREE.Vector3((random() * 2 - 1) * 1500, (random() * 2 - 1) * 1100, (random() * 2 - 1) * 1800);
            const rock = v.layout.shardbeltSolidDistance(local.x, local.y, local.z);
            if (rock < 70 || rock > 160) continue;
            const at = local.add(origin);
            if (s.entryPositionClear(at, s.obstacles, 60)) return at;
        }
    };
    const a = spot(); let b;
    for (let n = 0; n < 200 && a && !b; n++) { const q = spot(); if (q && q.distanceTo(a) > 250 && q.distanceTo(a) < 700) b = q; }
    return a && b ? [a.toArray(), b.toArray()] : undefined;
}
// One duel: returns per-ship tracks at 10 Hz and the rock-cycle counts.
function duel(v, start, tier, record) {
    const { THREE } = v, s = fieldSession(v);
    const ships = [s.spawnShip('pirate', start[0], undefined, undefined, { tier, temperament: 'steady' }), s.spawnShip('patrol', start[1], undefined, undefined, { tier, temperament: 'steady' })];
    const pairs = [[ships[0], ships[1]], [ships[1], ships[0]]];
    for (const [ship, other] of pairs) {
        ship.rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(...other.position).sub(new THREE.Vector3(...ship.position)).normalize()).toArray();
        ship.velocity = [0, 0, 0]; ship.targetId = other.id; ship.combatFit.turrets = []; ship.combatFit.missiles = 0; ship.hull = ship.maxHull = 1e9;
        ship.track = []; ship.m = { brakes: 0, stops: 0, bumps: 0, history: [], recent: [], stopped: false, lastBump: -99, lastBrake: -999 };
    }
    for (let i = 0; i < SECONDS * 60; i++) {
        s.save.world.time = i / 60;
        for (const [ship, other] of pairs) {
            s.updateAttackAI(ship, new THREE.Vector3(...other.position), new THREE.Vector3(...other.velocity), 1 / 60);
            s.resolveNpcCollisions(ship);
            const m = ship.m, max = s.npcFlightStats(ship).maxSpeed, speed = Math.hypot(...ship.velocity), fraction = speed / max;
            const limited = (ship.fieldNav?.speedLimit ?? Infinity) < max * .6;
            m.recent.push(limited); if (m.recent.length > 60) m.recent.shift();
            const terrain = m.recent.some(Boolean) || s.save.world.time - (ship.combatBumpAt ?? -99) < 2;
            let flags = limited ? 1 : 0;
            if (!m.stopped && fraction < .2) { m.stopped = true; if (i > 120 && terrain) { m.stops++; flags |= 4; } }
            else if (m.stopped && fraction > .5) m.stopped = false;
            m.history.push(speed); if (m.history.length > 90) m.history.shift();
            if (i > 120 && fraction < .4 && Math.max(...m.history) > max * .8 && i - m.lastBrake > 90) { m.lastBrake = i; if (terrain) { m.brakes++; flags |= 8; } }
            if (ship.combatBumpAt === s.save.world.time) { if (i - m.lastBump > 30) { m.bumps++; flags |= 2; } m.lastBump = i; }
            ship.pendingFlags = (ship.pendingFlags ?? 0) | flags;
            if (record && i % 6 === 0) {
                ship.track.push([...ship.position.map((x) => Math.round(x * 10) / 10), Math.round(fraction * 100) / 100, ship.pendingFlags, ship.aceMove?.kind ?? '']);
                ship.pendingFlags = 0;
            }
        }
    }
    return { ships: ships.map((ship) => ({ role: ship.role, hull: ship.combatFit.hullId, track: ship.track, ...ship.m, history: undefined, recent: undefined })), score: ships.reduce((n, ship) => n + ship.m.brakes + ship.m.stops + ship.m.bumps, 0) };
}

// Nearby rock: terrain triangles and loose asteroids around both tracks.
function rocks(v, tracks) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const track of tracks) for (const p of track) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
    for (let k = 0; k < 3; k++) { min[k] -= 120; max[k] += 120; }
    const inside = (x, y, z) => x > min[0] && x < max[0] && y > min[1] && y < max[1] && z > min[2] && z < max[2];
    const triangles = [];
    for (const o of v.terrain.getAsteroidTerrain().obstacles) {
        if (o.x + o.radius < min[0] || o.x - o.radius > max[0] || o.y + o.radius < min[1] || o.y - o.radius > max[1] || o.z + o.radius < min[2] || o.z - o.radius > max[2]) continue;
        const vtx = o.meshVerts, idx = o.meshIndices;
        for (let t = 0; t < idx.length; t += 3) {
            const tri = [];
            for (let j = 0; j < 3; j++) { const q = idx[t + j] * 3; tri.push(Math.round((vtx[q] + o.x) * 10) / 10, Math.round((vtx[q + 1] + o.y) * 10) / 10, Math.round((vtx[q + 2] + o.z) * 10) / 10); }
            if (inside((tri[0] + tri[3] + tri[6]) / 3, (tri[1] + tri[4] + tri[7]) / 3, (tri[2] + tri[5] + tri[8]) / 3)) triangles.push(...tri);
        }
    }
    const s = fieldSession(v), spheres = [];
    for (const o of s.obstacles) if (!o.terrain && o.shape === 'asteroid' && inside(o.x, o.y, o.z)) spheres.push([Math.round(o.x), Math.round(o.y), Math.round(o.z), Math.round(o.collisionRadius ?? o.radius)]);
    return { triangles, spheres, min, max };
}

const out = { seconds: SECONDS, duels: [], reversals: [] };
for (const tier of ['novice', 'veteran', 'ace']) {
    // Find the starts where the previous version cycled most against rock.
    const scored = [];
    for (let c = 0; c < SCAN; c++) {
        const start = starts(versions.before, c);
        if (!start) continue;
        scored.push({ c, start, score: duel(versions.before, start, tier, false).score });
        process.stdout.write(`\rscan ${tier} ${c + 1}/${SCAN}`);
    }
    scored.sort((a, b) => b.score - a.score);
    for (const pick of scored.slice(0, PICK)) {
        const before = duel(versions.before, pick.start, tier, true), after = duel(versions.after, pick.start, tier, true);
        const all = [...before.ships, ...after.ships].map((ship) => ship.track);
        out.duels.push({ id: `${tier}-${pick.c}`, tier, start: pick.start, before, after, rock: rocks(versions.after, all) });
    }
    process.stdout.write(`\rrecorded ${tier}            \n`);
}

// Reversals in open space: each manoeuvre's own steering law flown through
// the real flight integrator, exactly as updateAttackAI applies it (heading
// from maneuverHeading; the flip-and-burn coasts unassisted from 0.65 s to
// 2.4 s while the nose comes round, the Immelmann burns assisted).
{
    const v = versions.after, { THREE } = v, UP = new THREE.Vector3(0, 1, 0);
    for (const kind of ['boost-reversal', 'immelmann']) {
        const s = v.session();
        const ship = s.spawnShip('pirate', [0, 0, 0], undefined, undefined, { tier: 'ace', temperament: 'steady' }, { hullId: 'talon' });
        const stats = s.npcFlightStats(ship);
        ship.rotation = [0, 0, 0, 1]; ship.velocity = [0, 0, -stats.maxSpeed]; ship.fuel = 80;
        const pull = v.ace.immelmannPull ? v.ace.immelmannPull(stats) : 2.4;
        const move = { kind, pull, started: 0, until: kind === 'immelmann' ? pull + 1.05 : 3.4, entry: [0, 0, -1], up: [0, 1, 0], side: [1, 0, 0], sign: 1, vertical: 1, durationScale: 1 };
        const position = new THREE.Vector3(), velocity = new THREE.Vector3(), orientation = new THREE.Quaternion(), desired = new THREE.Quaternion();
        const heading = new THREE.Vector3(), lead = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), m = new THREE.Matrix4(), back = new THREE.Vector3();
        const target = new THREE.Vector3(0, 0, 180), track = [];
        for (let i = 0; i < 8 * 60; i++) {
            const t = i / 60;
            position.fromArray(ship.position); velocity.fromArray(ship.velocity); orientation.fromArray(ship.rotation);
            lead.copy(target).sub(position).normalize();
            if (t < move.until) v.ace.maneuverHeading(move, t, lead, position.distanceTo(target), 235, heading); else heading.copy(lead);
            right.crossVectors(heading, UP); if (right.lengthSq() < 1e-6) right.set(1, 0, 0); right.normalize();
            up.crossVectors(right, heading).normalize();
            desired.setFromRotationMatrix(m.makeBasis(right, up, back.copy(heading).negate()));
            const coasting = kind === 'boost-reversal' && t >= .65 && t < 2.4;
            const burn = kind === 'immelmann' ? t < move.until : t >= 2.4 && t < 4.5;
            s.integrateNpcFlight(ship, position, velocity, orientation, desired, coasting ? 0 : burn ? stats.afterburnSpeed : stats.maxSpeed, burn, !coasting, 1 / 60);
            position.toArray(ship.position); velocity.toArray(ship.velocity); orientation.toArray(ship.rotation);
            if (i % 3 === 0) track.push([...ship.position.map((x) => Math.round(x * 10) / 10), Math.round(velocity.length() / stats.maxSpeed * 100) / 100, 0, t < move.until ? kind : '']);
        }
        out.reversals.push({ kind, target: target.toArray(), track });
    }
}
mkdirSync('output/combat-review', { recursive: true });
writeFileSync('output/combat-review/duels.json', JSON.stringify(out));
console.log('wrote output/combat-review/duels.json', (JSON.stringify(out).length / 1e6).toFixed(2), 'MB');
