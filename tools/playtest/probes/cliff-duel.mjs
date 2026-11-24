// Headless cliff duel: two AI fighters attack each other close to the
// shardbelt's fractured terrain (70-160 m from rock). Measures the "rock
// cycle" — approach a wall, brake, turn, accelerate into the next one — per
// ship-minute, plus speed, wall contacts and the per-ship AI cost.
//
//   node --import ./tests/helpers/offline-imports.mjs tools/playtest/probes/cliff-duel.mjs
//
// Env: CASES (default 12 per tier), TIERS (novice,veteran,ace), SECONDS (45),
// FIELD=open for an obstacle-free control run, ROOT=<checkout> to measure
// another copy of the sources (e.g. the previous commit) for an A/B.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const ROOT = pathToFileURL(resolve(process.env.ROOT ?? '.')).href;
const THREE = await import(`${ROOT}/vendor/three.module.min.js`);
const { session } = await import(`${ROOT}/tests/helpers/session.mjs`);
const { generateGraveyardPieces, generateAsteroidField } = await import(`${ROOT}/src/game/worldData.js`);
const { GameSession } = await import(`${ROOT}/src/game/game.js`);
const { LOCATIONS } = await import(`${ROOT}/src/game/data.js`);
const { shardbeltSolidDistance } = await import(`${ROOT}/src/game/asteroidFieldLayout.js`);

const SECONDS = +(process.env.SECONDS ?? 45), CASES = +(process.env.CASES ?? 12), OPEN = process.env.FIELD === 'open';
const TIERS = (process.env.TIERS ?? 'novice,veteran,ace').split(',');
const origin = new THREE.Vector3(...LOCATIONS.shardbelt.position);
const rng = (seed) => () => ((seed = Math.imul(seed ^ seed >>> 15, 2246822507) + 0x6d2b79f5 | 0) >>> 0) / 4294967296;

function world() {
    const s = session();s.pickups=[];
    s.tmpCollide = new THREE.Vector3(); s.tmpEuler = new THREE.Euler(); s.fireNpcGun = () => {}; s.damageShip = () => {};
    if (OPEN) return s;
    s.activeInstanceId = 'shardbelt'; s.asteroids = generateAsteroidField(718, []); s.graveyard = generateGraveyardPieces(718); s.wreckNodes = [];
    s.activeFieldObstacles = GameSession.prototype.activeFieldObstacles; s.obstacles = s.activeFieldObstacles();
    s.forEachObstacleInBox = GameSession.prototype.forEachObstacleInBox; s.obstacleCellSize = 180; s.obstacleQueryStamp = 0;
    for (const key of ['tmpEntryAnchor', 'tmpEntryCandidate', 'tmpEntryPreferredDirection']) s[key] = new THREE.Vector3();
    return s;
}
function spot(random, s) {
    if (OPEN) return new THREE.Vector3((random() * 2 - 1) * 400, (random() * 2 - 1) * 200, (random() * 2 - 1) * 400);
    for (let n = 0; n < 4000; n++) {
        const local = new THREE.Vector3((random() * 2 - 1) * 1500, (random() * 2 - 1) * 1100, (random() * 2 - 1) * 1800);
        const rock = shardbeltSolidDistance(local.x, local.y, local.z);
        if (rock < 70 || rock > 160) continue;
        const at = local.add(origin);
        if (s.entryPositionClear(at, s.obstacles, 60)) return at;
    }
}

const armed=process.env.ARMED==='1'; // Keep the original terrain-only control by default.
const totals = {};
for (let c = 0; c < CASES; c++) for (const tier of TIERS) {
    const s = world(), random = rng(1000 + c), a = spot(random, s);
    let b;
    for (let n = 0; n < 200 && a && !b; n++) { const q = spot(random, s); if (q && q.distanceTo(a) > 250 && q.distanceTo(a) < 700) b = q; }
    if (!a || !b) continue;
    const ships = [s.spawnShip('pirate', a.toArray(), undefined, undefined, { tier, temperament: 'steady' }),
        s.spawnShip('patrol', b.toArray(), undefined, undefined, { tier, temperament: 'steady' })];
    for (const [ship, other] of [[ships[0], ships[1]], [ships[1], ships[0]]]) {
        ship.rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(...other.position).sub(new THREE.Vector3(...ship.position)).normalize()).toArray();
        ship.velocity = [0, 0, 0]; ship.targetId = other.id; ship.combatFit.turrets = []; ship.hull = ship.maxHull = 1e9;
        if(!armed){ship.combatFit.missiles=0;for(const rack of ship.combatFit.racks??[])rack.missiles=0;}
        ship.metrics = { speed: 0, limited: 0, brakes: 0, stops: 0, bumps: 0, history: [], recentLimit: [], stopped: false, lastBump: -99, lastBrake: -999 };
    }
    const steps = SECONDS * 60, started = performance.now();
    for (let i = 0; i < steps; i++) {
        s.save.world.time = i / 60;
        for (const [ship, other] of [[ships[0], ships[1]], [ships[1], ships[0]]]) {
            s.updateAttackAI(ship, new THREE.Vector3(...other.position), new THREE.Vector3(...other.velocity), 1 / 60);
            s.resolveNpcCollisions(ship);
            const m = ship.metrics, max = s.npcFlightStats(ship).maxSpeed, speed = Math.hypot(...ship.velocity), fraction = speed / max;
            const limited = (ship.fieldNav?.speedLimit ?? Infinity) < max * .6;
            m.recentLimit.push(limited); if (m.recentLimit.length > 60) m.recentLimit.shift();
            const terrain = m.recentLimit.some(Boolean) || s.save.world.time - (ship.combatBumpAt ?? -99) < 2;
            m.speed += fraction; if (limited) m.limited++;
            // A stop: below 20% of max speed (re-armed above 50%). A hard brake:
            // from above 80% to below 40% within 1.5 s. Count terrain-caused ones.
            if (!m.stopped && fraction < .2) { m.stopped = true; if (i > 120 && terrain) m.stops++; }
            else if (m.stopped && fraction > .5) m.stopped = false;
            m.history.push(speed); if (m.history.length > 90) m.history.shift();
            if (i > 120 && fraction < .4 && Math.max(...m.history) > max * .8 && i - m.lastBrake > 90) { m.lastBrake = i; if (terrain) m.brakes++; }
            if (ship.combatBumpAt === s.save.world.time) { if (i - m.lastBump > 30) m.bumps++; m.lastBump = i; }
        }
        if(armed){
            s.updateProjectiles(1/60);
            s.cleanupEntities();
        }
    }
    const cost = (performance.now() - started) / steps / 2, minutes = SECONDS / 60;
    for (const ship of ships) {
        const m = ship.metrics, t = totals[tier] ??= { ships: 0, meanSpeed: 0, terrainBrakesPerMin: 0, terrainStopsPerMin: 0, bumpsPerMin: 0, terrainLimited: 0, msPerShipStep: 0 };
        if(armed)t.launches=(t.launches??0)+s.projectileCounter/2;
        t.ships++; t.meanSpeed += m.speed / steps; t.terrainBrakesPerMin += m.brakes / minutes; t.terrainStopsPerMin += m.stops / minutes;
        t.bumpsPerMin += m.bumps / minutes; t.terrainLimited += m.limited / steps; t.msPerShipStep += cost;
    }
}
for (const t of Object.values(totals)) for (const key of Object.keys(t)) if (key !== 'ships' && key !== 'launches') t[key] = +(t[key] / t.ships).toFixed(3);
console.log(JSON.stringify(totals, null, 1));
