// Headless deterministic probe for the NPC pilot personalities (pilots.js).
// The sim is fixed-timestep and every roll is seeded, so the same seed must
// produce byte-identical behavior — these scenarios assert the pilot knobs that
// are otherwise only visible in flight:
//
//   1. aim     — novice bolts spray angular jitter, ace bolts go where aimed
//   2. surrender — gate opens at the first hull hit: timid gives up early,
//      aggressive fights on, and surrendered pilots plead once on approach
//   3. spiral  — flamboyant corkscrews far more (and longer) than steady
//   4. showboat— healthy flamboyant pilots still barrel-roll; steady never does
//   5. pass    — temperament pushes pass range: timid > steady > aggressive
//   6. drift   — same seed ⇒ identical pilot rolls, identical flight logs
//
// Run: node probe-ai.mjs   (exit code 0 = all green)
import { register } from 'node:module';
await register(new URL('./probe-ai-resolver.mjs', import.meta.url));
const THREE = await import('three');
const { GameSession } = await import('./src/game/game.js');
const { EntityStore } = await import('./src/game/entityStore.js');
const { createNewSave } = await import('./src/game/save.js');
const { PILOT_LINES, pilotMod, rollPilot } = await import('./src/game/pilots.js');
const { seededRandom } = await import('./src/game/random.js');
const { completeBountyMission, generateMissionOffers } = await import('./src/game/missions.js');
const { relationColor, callsignHandle } = await import('./src/game/ui.js');

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
const clampSigned = (value) => Math.min(1, Math.max(-1, value));

// A GameSession needs WebGL/DOM for its constructor, but the AI paths only read
// sim state and scratch vectors — so build the object via the prototype and
// initialize exactly the fields updateShips/updateAttackAI touch.
const makeSession = (seed) => {
    const save = createNewSave(seed);
    save.world.time = 0;
    save.player.position = [0, 0, 0];
    save.player.velocity = [0, 0, 0];
    save.player.rotation = [0, 0, 0, 1];
    save.player.angularVelocity = [0, 0, 0];
    const session = Object.create(GameSession.prototype);
    session.save = save;
    session.ships = [];
    session.projectiles = [];
    session.pickups = [];
    session.pilotLineHistory = new Map();
    session.projStore = new EntityStore(256);
    session.pickupStore = new EntityStore(64);
    session.projectileCounter = 0;
    session.pickupCounter = 0;
    session.entityCounter = 0;
    session.activeInstanceId = undefined;
    session.asteroids = [];
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
    // Render/audio/ui stubs: the probe never draws, but stray hits and scans
    // would poke these (spawnImpact on a bolt hit, audio on player damage,
    // setTarget on a scan, projectToScreen when building the HUD model).
    session.renderer = {
        spawnImpact: () => undefined,
        spawnExplosion: () => undefined,
        setTarget: () => undefined,
        projectToScreen: () => ({ x: 0, y: 0, visible: true, behind: false }),
    };
    session.audio = { play: () => undefined, playComms: () => undefined };
    session.ui = { showToast: () => undefined, showPilotLine: () => undefined };
    return session;
};
const STEP = 1 / 60;
const runFrames = (session, ship, frames) => {
    for (let index = 0; index < frames; index += 1) {
        session.save.world.time += STEP;
        session.updateShips(STEP);
    }
};

// 1. Aim: fire at a stationary target and measure each bolt's angular error
// against the true lead at fire time. Player sits still, so error == jitter.
const runAim = (seed, pilot) => {
    const session = makeSession(seed);
    const ship = session.spawnShip('pirate', [0, 0, -160], undefined, undefined, pilot);
    const errors = [];
    for (let frame = 0; frame < 1500; frame += 1) {
        session.save.world.time += STEP;
        const firedBefore = session.projectiles.length;
        session.updateShips(STEP);
        for (let index = firedBefore; index < session.projectiles.length; index += 1) {
            const projectile = session.projectiles[index];
            const boltDir = session.projStore.getVel(projectile.slot, new THREE.Vector3())
                .sub(new THREE.Vector3(ship.velocity[0], ship.velocity[1], ship.velocity[2])).normalize();
            // True lead at fire time: the bolt leaves at 150 plus the ship's own
            // velocity, so the ideal aim direction compensates for the shooter's
            // motion — normalize(r + w·t) with the exact quadratic intercept —
            // not just a point at the future position. Aces land on it (only
            // jitter remains); novices undershoot the correction.
            const origin = new THREE.Vector3(ship.position[0], ship.position[1], ship.position[2]);
            const target = new THREE.Vector3(...session.save.player.position);
            const r = target.sub(origin);
            const w = new THREE.Vector3(...session.save.player.velocity).sub(new THREE.Vector3(ship.velocity[0], ship.velocity[1], ship.velocity[2]));
            const rr = r.lengthSq();
            const rw = r.dot(w);
            const a = w.lengthSq() - 150 * 150;
            let intercept = Infinity;
            if (a !== 0) {
                const disc = rw * rw - a * rr;
                if (disc >= 0) {
                    const s = Math.sqrt(disc);
                    const candidates = [(-rw - s) / a, (-rw + s) / a].filter((t) => t > 0);
                    if (candidates.length)
                        intercept = Math.min(...candidates);
                }
            }
            if (!isFinite(intercept))
                intercept = Math.max(0.2, origin.distanceTo(target) / 150);
            const lead = r.addScaledVector(w, Math.max(0.2, intercept)).normalize();
            errors.push(Math.acos(clampSigned(boltDir.dot(lead))));
        }
    }
    return errors;
};
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

// 2. Surrender: strip shields/armor, then hit the hull with one bolt at a
// time (10 damage — the player's gun) until the pilot's surrender roll
// lands. The gate is open from the first hull hit: every hit rolls a
// personality-driven chance, so the surrender point is a draw from a
// distribution — measured as a mean over seeds. Returns the hull ratio at
// which they give up.
const surrenderPoint = (seed, pilot) => {
    const session = makeSession(seed);
    const ship = session.spawnShip('pirate', [0, 0, -200], undefined, undefined, pilot);
    ship.shield = 0;
    ship.armor = 0;
    let ratio = null;
    while (ship.hull > 2 && !ship.surrendered) {
        session.damageShip(ship, 10, 'player', [0, 0, 0]);
        if (ship.surrendered)
            ratio = ship.hull / ship.maxHull;
    }
    return ratio;
};
const surrenderPointMean = (prefix, pilot, seeds = 12) => {
    const points = [];
    for (let seed = 1; seed <= seeds; seed += 1)
        // A seed that never surrenders (fights to the death) counts as hull
        // 0 — otherwise the mean only sees the rare early-luck surrenders and
        // the stubborn pilots look jumpy.
        points.push(surrenderPoint(`${prefix}-${seed}`, pilot) ?? 0);
    return mean(points);
};

// 3/4. Spirals: count initiations and time spent corkscrewing. `forceEvasive`
// pins the "under fire" state so the gate roll is the only variable.
const spiralLog = (seed, pilot, frames, forceEvasive) => {
    const session = makeSession(seed);
    const ship = session.spawnShip('pirate', [0, 0, -150], undefined, undefined, pilot);
    if (forceEvasive) {
        ship.evasiveUntil = Number.MAX_SAFE_INTEGER;
        ship.evasiveLatencyUntil = 0;
    }
    else {
        ship.evasiveUntil = 0;
        ship.evasiveLatencyUntil = 0;
    }
    let spiraling = 0;
    let initiations = 0;
    let wasSpiraling = false;
    for (let frame = 0; frame < frames; frame += 1) {
        session.save.world.time += STEP;
        session.updateShips(STEP);
        if (ship.spiralT > 0)
            spiraling += STEP;
        if (ship.spiralT > 0 && !wasSpiraling)
            initiations += 1;
        wasSpiraling = ship.spiralT > 0;
    }
    return { spiraling, initiations };
};

const summary = (label, values) => {
    console.log(`  ${label}: n=${values.length} mean=${(mean(values) * 57.2958).toFixed(3)}° min=${(Math.min(...values) * 57.2958).toFixed(3)}° max=${(Math.max(...values) * 57.2958).toFixed(3)}°`);
};

// ---------------------------------------------------------------------------
console.log('pilotMod plumbing');
assert(pilotMod({ pilot: { passRangeMul: 1.35 } }, 55, 'passRangeMul') === 74.25, 'pilotMod applies the multiplier');
assert(pilotMod({}, 55, 'passRangeMul') === 55, 'pilotMod is a no-op without a pilot');
assert(pilotMod({ pilot: { fleeMul: 2.3 } }, 0.22, 'fleeMul') > 0.5, 'timid flee threshold clears half hull');
const seeded = rollPilot(seededRandom('probe'), 0.5, 'red-talons', { tier: 'ace' });
assert(seeded.tier === 'ace' && seeded.temperament !== undefined && seeded.aim > 0.9, 'override pins the tier and merges temperament');

// ---------------------------------------------------------------------------
console.log('aim: novice spray vs ace precision');
const noviceShots = runAim('aim-1', { tier: 'novice', temperament: 'steady' });
const aceShots = runAim('aim-1', { tier: 'ace', temperament: 'steady' });
assert(noviceShots.length >= 8, `novice fired enough shots (${noviceShots.length})`);
assert(aceShots.length >= 8, `ace fired enough shots (${aceShots.length})`);
summary('novice', noviceShots);
summary('ace', aceShots);
assert(mean(noviceShots) > mean(aceShots) * 3, `novice spread exceeds ace (${mean(noviceShots).toFixed(4)} vs ${mean(aceShots).toFixed(4)} rad)`);
assert(mean(aceShots) < 0.006, `ace shots hug the deflection point (${(mean(aceShots) * 57.2958).toFixed(2)}°)`);

// ---------------------------------------------------------------------------
console.log('surrender: the gate opens at the first hull hit, temperament-driven odds');
// Every hull hit rolls a chance that climbs as the hull degrades (timid's
// fleeMul makes it ~9% at full hull, aggressive's ~1.4%) — so the surrender
// point is a distribution, and the means must keep the personality order
// while the spread stays wide: timid often gives up with most of the hull
// intact, aggressive usually fights on until the hull is nearly gone.
const timidSurrender = surrenderPointMean('flee', { tier: 'veteran', temperament: 'timid' });
const steadySurrender = surrenderPointMean('flee', { tier: 'veteran', temperament: 'steady' });
const aggressiveSurrender = surrenderPointMean('flee', { tier: 'veteran', temperament: 'aggressive' });
console.log(`  mean surrender hull: timid ${timidSurrender.toFixed(3)} · steady ${steadySurrender.toFixed(3)} · aggressive ${aggressiveSurrender.toFixed(3)}`);
assert(timidSurrender > 0.5, `timid gives up with most of the hull intact (${timidSurrender.toFixed(3)})`);
assert(aggressiveSurrender < 0.3, `aggressive fights on through most of the hull (${aggressiveSurrender.toFixed(3)})`);
assert(timidSurrender > steadySurrender && steadySurrender > aggressiveSurrender, `surrender order: timid ${timidSurrender.toFixed(3)} > steady ${steadySurrender.toFixed(3)} > aggressive ${aggressiveSurrender.toFixed(3)}`);
const earlyTimid = surrenderPoint('flee-1', { tier: 'veteran', temperament: 'timid' });
assert(earlyTimid !== null && earlyTimid > 0.5, `a timid pilot can surrender with the hull mostly intact (${earlyTimid?.toFixed(3)})`);

// ---------------------------------------------------------------------------
console.log('surrender outcomes: run, dump cargo, pay, or power down — and the fight ends');
// Once the surrender roll lands, the pilot picks an action by temperament
// weights: timid most often powers down (10/17 of the weight) and almost
// never runs (1/17); aggressive mostly runs (9/10) and almost never powers
// down (1/10). Every outcome clears the hostile flag; eject/pay drop
// pickups; power-down leaves the ship dark and drifting. Talking
// temperaments announce it, steady surrenders in silence.
const surrenderOutcome = (seed, pilot) => {
    const session = makeSession(seed);
    const messages = [];
    session.ui = { showToast: () => undefined, showPilotLine: (callsign, line) => messages.push(`${callsign}: “${line}”`) };
    const ship = session.spawnShip('pirate', [0, 0, -200], undefined, undefined, pilot);
    ship.shield = 0;
    ship.armor = 0;
    while (ship.hull > 2 && !ship.surrendered)
        session.damageShip(ship, 0.2, 'player', [0, 0, 0]);
    const pickups = session.pickups;
    return {
        surrendered: ship.surrendered,
        hostile: ship.hostile,
        poweredDown: ship.poweredDown,
        fleeing: ship.fleeing,
        recorded: session.save.world.surrenderedTo[ship.name],
        ejected: pickups.some((pickup) => pickup.commodity !== 'credits'),
        paid: pickups.some((pickup) => pickup.commodity === 'credits'),
        pickupCount: pickups.length,
        messages,
    };
};
const SUR_SEEDS = 24;
const surrenderRuns = (prefix, pilot) => {
    const runs = [];
    for (let seed = 1; seed <= SUR_SEEDS; seed += 1)
        runs.push(surrenderOutcome(`${prefix}-${seed}`, pilot));
    return runs;
};
const timidOutcomes = surrenderRuns('sur-timid', { tier: 'veteran', temperament: 'timid' });
const aggressiveOutcomes = surrenderRuns('sur-aggressive', { tier: 'veteran', temperament: 'aggressive' });
const timidDowns = timidOutcomes.filter((run) => run.poweredDown).length;
const timidRuns = timidOutcomes.filter((run) => run.fleeing).length;
const aggressiveDowns = aggressiveOutcomes.filter((run) => run.poweredDown).length;
const aggressiveRuns = aggressiveOutcomes.filter((run) => run.fleeing).length;
console.log(`  timid: ${timidDowns}/${SUR_SEEDS} powered down, ${timidRuns}/${SUR_SEEDS} ran · aggressive: ${aggressiveDowns}/${SUR_SEEDS} powered down, ${aggressiveRuns}/${SUR_SEEDS} ran`);
assert(timidOutcomes.every((run) => run.surrendered && !run.hostile), 'every surrender clears the hostile flag');
assert([...timidOutcomes, ...aggressiveOutcomes].every((run) => run.recorded === (run.poweredDown ? 'captured' : 'fled')), 'the surrender record matches whether the pilot powered down or fled');
assert(timidDowns > aggressiveDowns * 2, `timid powers down far more than aggressive (${timidDowns} vs ${aggressiveDowns})`);
assert(aggressiveRuns > timidRuns, `aggressive runs far more than timid (${aggressiveRuns} vs ${timidRuns})`);
assert(timidOutcomes.some((run) => run.ejected), 'a surrender jettisons cargo pickups');
assert(timidOutcomes.some((run) => run.paid), 'a surrender drops a credits pickup');
assert(timidOutcomes.every((run) => run.messages.length >= 1), 'timid pilots announce their surrender');
const steadySilent = surrenderOutcome('sur-steady', { tier: 'veteran', temperament: 'steady' });
assert(steadySilent.surrendered && steadySilent.messages.length === 0, 'steady pilots surrender in silence');
const surRepeat = surrenderOutcome('sur-timid-1', { tier: 'veteran', temperament: 'timid' });
assert(JSON.stringify(surRepeat) === JSON.stringify(timidOutcomes[0]), 'surrender outcome is byte-identical across runs of the same seed');

// ---------------------------------------------------------------------------
console.log('plead: a surrendered pilot begs once when you close in, then goes quiet');
// The surrender line itself pleads and names the action; when the player then
// closes on the surrendered ship it pleads once more (the plead pool — not
// its usual proximity mutter), and never repeats, even after the player
// leaves and comes back.
const pleadRun = (seed, temperament) => {
    const session = makeSession(seed);
    const lines = [];
    session.ui = { showToast: () => undefined, showPilotLine: (callsign, line) => lines.push(line) };
    session.audio = { play: () => undefined, playComms: () => undefined };
    const ship = session.spawnShip('pirate', [0, 0, -200], undefined, undefined, { tier: 'veteran', temperament });
    ship.shield = 0;
    ship.armor = 0;
    while (ship.hull > 2 && !ship.surrendered)
        session.damageShip(ship, 10, 'player', [0, 0, 0]);
    const surrenderLine = lines.at(-1);
    // The player closes in on the surrendered ship.
    session.save.player.position = [0, 0, -50];
    session.save.world.time = 10;
    lines.length = 0;
    runFrames(session, ship, 5);
    const firstPlead = lines.slice();
    runFrames(session, ship, 60); // player stays in range — no repeat
    const afterHold = lines.slice();
    // Player leaves, then comes back — still no second plea.
    session.save.player.position = [0, 0, -500];
    session.save.world.time = 20;
    runFrames(session, ship, 5);
    session.save.player.position = [0, 0, -50];
    session.save.world.time = 30;
    runFrames(session, ship, 5);
    return { surrenderLine, firstPlead, afterHold, repeated: lines.slice(firstPlead.length) };
};
const timidPlead = pleadRun('plead-1', 'timid');
const TIMID_PLEAD = PILOT_LINES.timid.plead;
const TIMID_SURRENDER_LINES = Object.values(PILOT_LINES.timid.surrender).flat();
console.log(`  surrender line: “${timidPlead.surrenderLine}” · approach plea: “${timidPlead.firstPlead[0] ?? 'none'}”`);
assert(TIMID_SURRENDER_LINES.includes(timidPlead.surrenderLine ?? ''), 'the surrender line pleads and names the action');
assert(timidPlead.firstPlead.length === 1 && TIMID_PLEAD.includes(timidPlead.firstPlead[0]), `a surrendered pilot pleads once when you close in (${timidPlead.firstPlead[0] ?? 'none'})`);
assert(timidPlead.afterHold.length === 1, 'the plea does not repeat while the player stays close');
assert(timidPlead.repeated.length === 0, 'the plea does not repeat after the player leaves and returns');
assert(JSON.stringify(timidPlead) === JSON.stringify(pleadRun('plead-1', 'timid')), 'the approach plea is seed-deterministic');

// ---------------------------------------------------------------------------
console.log('claim: capturing a surrendered pilot pays the bounty and registers the kill');
// Surrendered ships don't explode, so the destroyShip payoff never fires —
// claiming one (scan it, or dock while it's around) must pay the defense
// bounty, complete any active warrant into the registry, and count the kill.
// A beaten civilian has no bounty and is not claimable.
const claimRun = (seed, withMission) => {
    const session = makeSession(seed);
    const messages = [];
    session.ui = { showToast: (message) => messages.push(message), showPilotLine: () => undefined };
    const ship = session.spawnShip('pirate', [0, 0, -200], undefined, undefined, { tier: 'veteran', temperament: 'aggressive' });
    if (withMission) {
        const mission = { id: `${seed}-claim`, kind: 'bounty', title: 'Warrant: Claim Target', targetName: ship.name, reward: 5000, deposit: 250, danger: 2.5, guild: 'bounty', guildRep: 14, faction: 'concord', pilot: { tier: 'veteran', temperament: 'aggressive' }, status: 'active', deadline: session.save.world.time + 500 };
        session.save.activeMissions.push(mission);
        ship.missionId = mission.id;
    }
    ship.shield = 0;
    ship.armor = 0;
    while (ship.hull > 2 && !ship.surrendered)
        session.damageShip(ship, 0.2, 'player', [0, 0, 0]);
    const before = session.save.player.credits;
    const claimed = session.claimSurrendered(ship);
    const again = session.claimSurrendered(ship);
    return {
        claimed,
        again,
        bounty: ship.bountyValue,
        paid: session.save.player.credits - before,
        kills: session.save.player.stats.kills,
        concord: session.save.player.reputation.concord,
        registry: session.save.world.registry[ship.name],
        hull: ship.hull,
        messages,
    };
};
const plainClaim = claimRun('claim-1', false);
const missionClaim = claimRun('claim-2', true);
console.log(`  plain: paid ${plainClaim.paid} on a ${plainClaim.bounty} bounty, kills ${plainClaim.kills} · mission: paid ${missionClaim.paid}, registry ${JSON.stringify(missionClaim.registry)}`);
assert(plainClaim.claimed && plainClaim.paid === plainClaim.bounty && plainClaim.kills === 1 && plainClaim.concord > 0, 'claiming a surrendered pirate pays the defense bounty and counts the kill');
assert(plainClaim.hull === 0 && plainClaim.again === false, 'a claimed ship is gone and cannot be claimed twice');
assert(missionClaim.claimed && missionClaim.paid >= 5000 && missionClaim.registry?.count === 1, 'claiming a warrant target completes the mission into the registry');
assert(missionClaim.messages.some((message) => message.includes('complete')), 'warrant completion toast fires on claim');
const traderClaim = (seed) => {
    const session = makeSession(seed);
    const ship = session.spawnShip('trader', [0, 0, -200], undefined, undefined, { tier: 'veteran', temperament: 'timid' });
    ship.shield = 0;
    ship.armor = 0;
    while (ship.hull > 2 && !ship.surrendered)
        session.damageShip(ship, 0.2, 'player', [0, 0, 0]);
    return { claimed: session.claimSurrendered(ship), surrendered: ship.surrendered, kills: session.save.player.stats.kills };
};
assert(traderClaim('claim-trader').claimed === false && traderClaim('claim-trader').kills === 0, 'surrendered civilians are not claimable');
assert(JSON.stringify(plainClaim) === JSON.stringify(claimRun('claim-1', false)), 'claim outcome is seed-deterministic');

// ---------------------------------------------------------------------------
console.log('eject: a surrendered pilot dumps what they actually haul');
// The jettisoned hold matches the ship's role — trade goods from a freighter,
// ore from a miner, looted tech (never staples) from a pirate — instead of
// always electronics and scrap.
const ejectRun = (seed, role) => {
    const session = makeSession(seed);
    const ship = session.spawnShip(role, [0, 0, -200], undefined, undefined, { tier: 'veteran', temperament: 'timid' });
    ship.shield = 0;
    ship.armor = 0;
    while (ship.hull > 2 && !ship.surrendered)
        session.damageShip(ship, 0.2, 'player', [0, 0, 0]);
    return session.pickups.filter((pickup) => pickup.commodity !== 'credits').map((pickup) => pickup.commodity);
};
const ejectCommodities = (prefix, role, seeds) => {
    const commodities = new Set();
    for (let seed = 1; seed <= seeds; seed += 1)
        for (const commodity of ejectRun(`${prefix}-${seed}`, role))
            commodities.add(commodity);
    return [...commodities];
};
const TRADER_GOODS = ['water', 'food', 'medicine', 'electronics', 'machinery', 'luxuries'];
const traderEjects = ejectCommodities('eject-trader', 'trader', 12);
const minerEjects = ejectCommodities('eject-miner', 'miner', 12);
const pirateEjects = ejectCommodities('eject-pirate', 'pirate', 12);
console.log(`  trader: ${traderEjects.join(', ')} · miner: ${minerEjects.join(', ')} · pirate: ${pirateEjects.join(', ')}`);
assert(traderEjects.length > 0 && traderEjects.every((commodity) => TRADER_GOODS.includes(commodity)), `a trader's hold is trade goods (${traderEjects.join(', ')})`);
assert(minerEjects.includes('ore'), `a miner's hold carries ore (${minerEjects.join(', ')})`);
assert(pirateEjects.length >= 3 && !pirateEjects.includes('water') && !pirateEjects.includes('food'), `a pirate's hold is looted tech, not staples (${pirateEjects.join(', ')})`);
const ejectRepeat = ejectRun('eject-pirate-1', 'pirate');
assert(JSON.stringify(ejectRepeat) === JSON.stringify(ejectRun('eject-pirate-1', 'pirate')), 'eject contents are seed-deterministic');

// ---------------------------------------------------------------------------
console.log('recognition: a pilot you spared defers instead of re-engaging');
// Surrendering records the callsign in the save; when that same name spawns
// again, it recognizes the player — non-hostile, never acquires a combat
// target, and says exactly one deferential line when the player gets close.
// Fresh callsigns stay hostile as usual, and the outcome is seed-stable.
const surrenderToRecognition = (seed) => {
    const session = makeSession(seed);
    const messages = [];
    session.ui = { showToast: () => undefined, showPilotLine: (callsign, line) => messages.push(line) };
    session.audio = { play: () => undefined, playComms: () => undefined };
    const first = session.spawnShip('pirate', [0, 0, -200], undefined, undefined, { tier: 'veteran', temperament: 'aggressive' });
    first.shield = 0;
    first.armor = 0;
    while (first.hull > 2 && !first.surrendered)
        session.damageShip(first, 0.2, 'player', [0, 0, 0]);
    const recorded = session.save.world.surrenderedTo[first.name] !== undefined;
    const recordMatches = session.save.world.surrenderedTo[first.name] === (first.poweredDown ? 'captured' : 'fled');
    // Force a captured (deferential) re-encounter here; the wary path for
    // escaped pilots is covered separately below.
    session.save.world.surrenderedTo[first.name] = 'captured';
    first.hull = 0; // captured/left behind — only the re-encounter remains
    // Later encounter: the same callsign spawns again, this time at close range.
    const again = session.spawnShip('pirate', [0, 0, -120], undefined, first.name, { tier: 'veteran', temperament: 'aggressive' });
    session.save.world.time = 10;
    messages.length = 0;
    runFrames(session, again, 30);
    const targetId = again.targetId;
    runFrames(session, again, 60);
    session.save.player.currentTargetId = again.id;
    const model = session.buildHudModel();
    const readout = model.target?.readout ?? '';
    return {
        recorded,
        recordMatches,
        recognizes: again.recognizesPlayer,
        hostile: again.hostile,
        targetId,
        readout,
        lines: messages.slice(),
    };
};
const recognition = surrenderToRecognition('recognize-1');
const AGGRESSIVE_DEFERENCE = PILOT_LINES.aggressive.deference;
console.log(`  recorded: ${recognition.recorded} · recognizes: ${recognition.recognizes} · hostile: ${recognition.hostile} · lines: ${recognition.lines.length} (${recognition.lines[0] ?? 'none'})`);
assert(recognition.recorded && recognition.recordMatches, 'surrendering records the callsign and whether the pilot fled');
assert(recognition.recognizes && !recognition.hostile, 'a re-encountered captured callsign recognizes the player and spawns non-hostile');
assert(recognition.targetId === undefined, 'a deferential pilot never acquires a combat target');
assert(recognition.lines.length === 1 && AGGRESSIVE_DEFERENCE.includes(recognition.lines[0]), `the deferential line lands exactly once (${recognition.lines.length})`);
assert(recognition.readout.includes('✦') && recognition.readout.includes('Aggressive'), `the target monitor marks a spared pilot (${recognition.readout})`);
const fresh = makeSession('recognize-fresh');
const freshShip = fresh.spawnShip('pirate', [0, 0, -120], undefined, undefined, { tier: 'veteran', temperament: 'aggressive' });
assert(freshShip.recognizesPlayer === false && freshShip.hostile === true, 'a fresh callsign stays hostile as usual');
assert(JSON.stringify(recognition) === JSON.stringify(surrenderToRecognition('recognize-1')), 'recognition is seed-deterministic');

// ---------------------------------------------------------------------------
console.log('wary: a pilot who escaped after surrendering comes back hostile and jumpy');
// A pilot who fled after surrendering (recorded 'fled') re-encounters the
// player wary, not deferential: hostile again, they re-engage, say a wary
// line instead of the deference one, and give up earlier than their
// temperament would normally allow.
const waryRun = (seed) => {
    const session = makeSession(seed);
    const lines = [];
    session.ui = { showToast: () => undefined, showPilotLine: (callsign, line) => lines.push(line) };
    session.audio = { play: () => undefined, playComms: () => undefined };
    const first = session.spawnShip('pirate', [0, 0, -200], undefined, undefined, { tier: 'veteran', temperament: 'aggressive' });
    first.shield = 0;
    first.armor = 0;
    while (first.hull > 2 && !first.surrendered)
        session.damageShip(first, 0.2, 'player', [0, 0, 0]);
    session.save.world.surrenderedTo[first.name] = 'fled'; // they got away
    first.hull = 0;
    const again = session.spawnShip('pirate', [0, 0, -150], undefined, first.name, { tier: 'veteran', temperament: 'aggressive' });
    session.save.world.time = 10;
    lines.length = 0;
    runFrames(session, again, 30);
    const targetId = again.targetId;
    const waryLine = lines.some((line) => PILOT_LINES.aggressive.wary.includes(line));
    // Only the wary flag differs, so the mean surrender hull over seeds must
    // be higher (earlier) for the wary pilot — the 1.5x chance multiplier is
    // the sole driver.
    const measurePoint = (wary) => {
        const points = [];
        for (let index = 1; index <= 8; index += 1) {
            const measure = makeSession(`${seed}-${index}`);
            const ship = measure.spawnShip('pirate', [0, 0, -150], undefined, first.name, { tier: 'veteran', temperament: 'aggressive' });
            ship.waryOfPlayer = wary;
            ship.shield = 0;
            ship.armor = 0;
            let point = null;
            while (ship.hull > 2 && !ship.surrendered) {
                measure.damageShip(ship, 10, 'player', [0, 0, 0]);
                if (ship.surrendered)
                    point = ship.hull / ship.maxHull;
            }
            if (point !== null)
                points.push(point);
        }
        return mean(points);
    };
    session.save.player.currentTargetId = again.id;
    const model = session.buildHudModel();
    const readout = model.target?.readout ?? '';
    const normalPoint = measurePoint(false);
    const waryPoint = measurePoint(true);
    return { wary: again.waryOfPlayer, hostile: again.hostile, targetId, waryLine, readout, normalPoint, waryPoint };
};
const waryShip = waryRun('wary-1');
console.log(`  hostile ${waryShip.hostile} · re-engaged ${waryShip.targetId === 'player'} · wary line ${waryShip.waryLine} · gives up at hull ${waryShip.waryPoint?.toFixed(3)} vs normal ${waryShip.normalPoint?.toFixed(3)}`);
assert(waryShip.wary && waryShip.hostile === true, 'an escaped pilot comes back wary and hostile');
assert(waryShip.targetId === 'player', 'a wary pilot re-engages the player');
assert(waryShip.waryLine, 'a wary pilot says a wary line, not a deference one');
assert(waryShip.readout.includes('✦') && waryShip.readout.includes('Aggressive'), `the target monitor marks a wary pilot too (${waryShip.readout})`);
assert(waryShip.waryPoint !== null && waryShip.normalPoint !== null && waryShip.waryPoint > waryShip.normalPoint * 1.15, `a wary pilot gives up earlier (${waryShip.waryPoint?.toFixed(3)} vs ${waryShip.normalPoint?.toFixed(3)})`);

// ---------------------------------------------------------------------------
console.log('unauthorized fire: one stray bolt is a warning, sustained fire is an attack');
// Player hits on a non-hostile ship accumulate; crossing a damage threshold
// (15% of durability, min 25) turns an accident into a deliberate attack
// (hostile tag, rep loss, patrol alert). A single small bolt stays a warning.
const fireRun = (seed, hits, damage) => {
    const session = makeSession(seed);
    const toasts = [];
    session.ui = { showToast: (message) => toasts.push(message) };
    session.audio = { play: () => undefined, playComms: () => undefined };
    const trader = session.spawnShip('trader', [0, 0, -200], undefined, undefined, { tier: 'veteran', temperament: 'steady' });
    const repBefore = session.save.player.reputation['free-merchants'];
    for (let index = 0; index < hits; index += 1)
        session.damageShip(trader, damage, 'player', [0, 0, 0]);
    return {
        hostile: trader.hostile,
        repLost: repBefore - session.save.player.reputation['free-merchants'],
        toasts,
        damageTaken: trader.playerDamageTaken,
    };
};
const oneBolt = fireRun('fire-1', 1, 10);
const sustained = fireRun('fire-2', 12, 10);
console.log(`  one 10-damage bolt: hostile ${oneBolt.hostile} · rep -${oneBolt.repLost} · ${oneBolt.toasts.join(' / ')}`);
console.log(`  12 bolts: hostile ${sustained.hostile} · rep -${sustained.repLost} · ${sustained.toasts.join(' / ')}`);
assert(oneBolt.hostile === false && oneBolt.repLost === 0 && oneBolt.toasts.some((message) => message.includes('Watch your fire')), 'a single stray bolt is a warning, not an attack');
assert(sustained.hostile === true && sustained.repLost === 9 && sustained.toasts.some((message) => message.includes('Unauthorized attack')), 'sustained fire on a civilian escalates to unauthorized');
assert(JSON.stringify(oneBolt) === JSON.stringify(fireRun('fire-1', 1, 10)), 'fire escalation is seed-deterministic');

// ---------------------------------------------------------------------------
console.log('favor: a spared pilot occasionally tips a wreck or a market contact on scan');
// The first scan of a recognizing ship rolls a seeded favor — a valuable
// wreck flagged on the scanner, or a market contact that moves a station's
// supply/demand so the tip is real. Later scans read "previously spared" and
// never re-roll, so the favor can't be farmed by re-scanning.
const favorRun = (seed, withWrecks) => {
    const session = makeSession(seed);
    if (withWrecks) {
        session.wreckNodes = [
            { id: 'salvage-node-tip', name: 'Carrier lifeboat rack A-12', position: [12000, 2000, 15000], radius: 6, salvage: 'electronics', rarity: 'rare', remaining: 3, scanned: false, hazard: 0.9 },
            { id: 'salvage-node-plain', name: 'Courier bow B-4', position: [11000, 1500, 14000], radius: 5, salvage: 'scrap', rarity: 'common', remaining: 2, scanned: false, hazard: 0.2 },
        ];
    }
    const toasts = [];
    session.ui = { showToast: (message) => toasts.push(message), showPilotLine: () => undefined };
    session.audio = { play: () => undefined, playComms: () => undefined };
    const first = session.spawnShip('pirate', [0, 0, -200], undefined, undefined, { tier: 'veteran', temperament: 'flamboyant' });
    first.shield = 0;
    first.armor = 0;
    while (first.hull > 2 && !first.surrendered)
        session.damageShip(first, 0.2, 'player', [0, 0, 0]);
    // Force a captured (deferential) re-encounter: favors come from spared
    // pilots, and the fled/wary branch is covered by the wary scenario.
    session.save.world.surrenderedTo[first.name] = 'captured';
    first.hull = 0;
    const again = session.spawnShip('pirate', [0, 0, -120], undefined, first.name, { tier: 'veteran', temperament: 'flamboyant' });
    session.save.player.currentTargetId = again.id;
    const marketBefore = JSON.stringify(session.save.world.market);
    session.scanTarget();
    const marketChanged = JSON.stringify(session.save.world.market) !== marketBefore;
    const scannedWrecks = session.wreckNodes.filter((node) => node.scanned).map((node) => node.id);
    const savedScanned = session.save.world.scannedNodes.filter((id) => session.wreckNodes.some((node) => node.id === id));
    session.scanCooldown = 0;
    session.save.world.time += 1;
    session.scanTarget();
    return {
        favorGiven: again.favorGiven,
        toasts,
        marketChanged,
        scannedWrecks,
        savedScanned,
    };
};
const marketFavor = favorRun('favor-9', false);
const wreckFavor = favorRun('favor-5', true);
console.log(`  no-wrecks seed: ${marketFavor.toasts.join(' / ')}`);
console.log(`  with-wrecks seed: ${wreckFavor.toasts.join(' / ')}`);
assert(marketFavor.favorGiven && marketFavor.toasts.length === 2, `the first scan decides a favor, later scans never re-roll (${marketFavor.toasts.join(' / ')})`);
assert(marketFavor.toasts[0].startsWith('Tip: my contact') && marketFavor.marketChanged, `a market favor actually moves the station market (${marketFavor.toasts[0]})`);
assert(marketFavor.toasts[1].includes('✦') && marketFavor.toasts[1].includes('PREVIOUSLY SPARED'), `the scan toast marks a previously spared pilot (${marketFavor.toasts[1]})`);
assert(wreckFavor.favorGiven && wreckFavor.toasts.length === 2, `the with-wrecks seed also decides exactly once (${wreckFavor.toasts.join(' / ')})`);
assert(wreckFavor.toasts[0].startsWith('Tip: ') && wreckFavor.scannedWrecks[0] === 'salvage-node-tip' && wreckFavor.savedScanned.length === 1, `a wreck favor flags the rare wreck and persists it to the save (${wreckFavor.toasts[0]})`);
assert(JSON.stringify(marketFavor) === JSON.stringify(favorRun('favor-9', false)), 'favor rolls are seed-deterministic');

// ---------------------------------------------------------------------------
console.log('spiral: flamboyant frequency vs steady (under fire)');
const steadySpiral = spiralLog('spiral-1', { tier: 'veteran', temperament: 'steady' }, 1800, true);
const flamboyantSpiral = spiralLog('spiral-1', { tier: 'veteran', temperament: 'flamboyant' }, 1800, true);
console.log(`  steady: ${steadySpiral.initiations} spirals, ${steadySpiral.spiraling.toFixed(1)}s corkscrewing`);
console.log(`  flamboyant: ${flamboyantSpiral.initiations} spirals, ${flamboyantSpiral.spiraling.toFixed(1)}s corkscrewing`);
assert(flamboyantSpiral.spiraling > steadySpiral.spiraling * 1.3, `flamboyant corkscrews far more (${flamboyantSpiral.spiraling.toFixed(1)}s vs ${steadySpiral.spiraling.toFixed(1)}s)`);
assert(steadySpiral.initiations >= 1, `steady still spirals under fire (${steadySpiral.initiations})`);

// ---------------------------------------------------------------------------
console.log('showboating: healthy flamboyant spirals, steady never does');
const healthySteady = spiralLog('showboat-1', { tier: 'veteran', temperament: 'steady' }, 3600, false);
const healthyFlamboyant = spiralLog('showboat-1', { tier: 'veteran', temperament: 'flamboyant' }, 3600, false);
console.log(`  healthy steady: ${healthySteady.initiations} spirals; healthy flamboyant: ${healthyFlamboyant.initiations} spirals`);
assert(healthySteady.initiations === 0, 'steady never barrel-rolls while healthy');
assert(healthyFlamboyant.initiations >= 1, `flamboyant showboats while healthy (${healthyFlamboyant.initiations} spirals)`);

// ---------------------------------------------------------------------------
console.log('pass range: temperament pushes the joust spacing');
const passRanges = (pilot) => {
    const session = makeSession('pass-1');
    const values = [];
    for (let index = 0; index < 6; index += 1)
        values.push(session.spawnShip('pirate', [0, 0, -120 - index * 5], undefined, undefined, pilot).passRange);
    return values;
};
const timidRanges = passRanges({ tier: 'veteran', temperament: 'timid' });
const steadyRanges = passRanges({ tier: 'veteran', temperament: 'steady' });
const aggressiveRanges = passRanges({ tier: 'veteran', temperament: 'aggressive' });
console.log(`  timid ${timidRanges.map((v) => v.toFixed(0)).join('/')} · steady ${steadyRanges.map((v) => v.toFixed(0)).join('/')} · aggressive ${aggressiveRanges.map((v) => v.toFixed(0)).join('/')}`);
assert(mean(timidRanges) > mean(steadyRanges) && mean(steadyRanges) > mean(aggressiveRanges), 'pass range ordering timid > steady > aggressive');

// ---------------------------------------------------------------------------
console.log('bounty warrants: rank raises pinned tier, profile in briefing');
const bountyTiers = (seed, rank, danger) => {
    const save = createNewSave(seed);
    save.player.guildRank.bounty = rank;
    save.world.danger = danger;
    const bounties = generateMissionOffers('helix', save).filter((mission) => mission.kind === 'bounty');
    return {
        aces: bounties.filter((mission) => mission.pilot?.tier === 'ace').length,
        veterans: bounties.filter((mission) => mission.pilot?.tier === 'veteran').length,
        total: bounties.length,
        profiled: bounties.filter((mission) => mission.briefing.includes('Pilot profile')).length,
    };
};
const lowBoard = bountyTiers('bounty-low', 0, 0.2);
const highBoard = bountyTiers('bounty-high', 3, 3.5);
console.log(`  rank 0/danger 0.2: ${lowBoard.aces} ace, ${lowBoard.veterans} veteran of ${lowBoard.total} · rank 3/danger 3.5: ${highBoard.aces} ace, ${highBoard.veterans} veteran of ${highBoard.total}`);
assert(lowBoard.aces === 0, `low-rank, low-danger board pins no aces (${lowBoard.aces}/${lowBoard.total})`);
assert(highBoard.aces >= 1, `high bounty rank pins at least one ace warrant (${highBoard.aces}/${highBoard.total})`);
assert(highBoard.profiled === highBoard.total && lowBoard.profiled === lowBoard.total, 'every warrant briefing exposes the pinned pilot profile');

// ---------------------------------------------------------------------------
console.log('registry: ace warrant kills pay bonus rep and are remembered');
const registryRun = (seed, tier) => {
    const save = createNewSave(seed);
    const mission = {
        id: `${seed}-${tier ?? 'none'}-0`,
        kind: 'bounty',
        title: `Warrant: Callsign ${tier ?? 'none'}`,
        targetName: `Callsign ${tier ?? 'none'}`,
        reward: 5000,
        deposit: 250,
        danger: 2.5,
        guild: 'bounty',
        guildRep: 14,
        faction: 'concord',
        pilot: tier ? { tier, temperament: 'flamboyant' } : undefined,
        status: 'active',
        deadline: save.world.time + 500,
    };
    save.activeMissions.push(mission);
    const before = save.player.guildRep.bounty;
    const result = completeBountyMission(save, mission.id);
    return {
        ok: result.ok,
        message: result.message,
        repGained: save.player.guildRep.bounty - before,
        entry: save.world.registry[mission.targetName],
    };
};
const aceKill = registryRun('registry-1', 'ace');
const noviceKill = registryRun('registry-1', 'novice');
console.log(`  ace: +${aceKill.repGained} bounty rep · registry ${JSON.stringify(aceKill.entry)}`);
console.log(`  novice: +${noviceKill.repGained} bounty rep · registry ${JSON.stringify(noviceKill.entry)}`);
assert(aceKill.ok && noviceKill.ok, 'bounty completions resolve');
assert(aceKill.repGained > noviceKill.repGained, `ace kill pays extra bounty rep (+${aceKill.repGained} vs +${noviceKill.repGained})`);
assert(aceKill.entry?.tier === 'ace' && aceKill.entry?.count === 1 && aceKill.entry?.clearedAt >= 0, 'ace callsign registered with tier, count, and timestamp');
assert(aceKill.message.includes('registry rep'), `completion toast announces the registry bonus (${aceKill.message})`);
const repeatRegistry = (seed) => {
    const save = createNewSave(seed);
    for (let index = 0; index < 2; index += 1) {
        save.activeMissions.push({ id: `${seed}-r${index}`, kind: 'bounty', title: 'Warrant: Repeat Callsign', targetName: 'Repeat Callsign', reward: 4000, deposit: 200, danger: 1.5, guild: 'bounty', guildRep: 11, faction: 'concord', pilot: { tier: 'veteran', temperament: 'steady' }, status: 'active', deadline: save.world.time + 500 });
        completeBountyMission(save, `${seed}-r${index}`);
    }
    return save.world.registry['Repeat Callsign'];
};
assert(repeatRegistry('registry-repeat').count === 2, 're-cleared callsigns accumulate in the registry');
assert(JSON.stringify(aceKill) === JSON.stringify(registryRun('registry-1', 'ace')), 'registry outcome is seed-deterministic');

// ---------------------------------------------------------------------------
console.log('pilot profile: scan toast and target monitor');
const profileRun = (seed) => {
    const session = makeSession(seed);
    const toasts = [];
    session.ui = { showToast: (message) => toasts.push(message) };
    const ship = session.spawnShip('pirate', [0, 0, -100], undefined, undefined, { tier: 'ace', temperament: 'flamboyant' });
    session.save.player.currentTargetId = ship.id;
    session.scanTarget();
    const model = session.buildHudModel();
    return { toasts, readout: model.target?.readout };
};
const profile = profileRun('profile-1');
console.log(`  scan: ${profile.toasts[0]} · monitor readout: ${profile.readout}`);
assert(profile.toasts.length >= 1 && profile.toasts[0].includes('Ace') && profile.toasts[0].includes('Flamboyant'), `scan toast names tier and temperament (${profile.toasts[0]})`);
assert(profile.readout === 'Ace · Flamboyant', `target monitor readout shows the pilot profile (${profile.readout})`);

// ---------------------------------------------------------------------------
console.log('comms: temperament-driven combat lines');
const commsRun = (seed, pilot, setup) => {
    const session = makeSession(seed);
    const messages = [];
    const chirps = [];
    const relations = [];
    const durations = [];
    session.ui = { showPilotLine: (callsign, line, relation, duration = 6000) => { messages.push(`${callsign}: “${line}”`); relations.push(relation); durations.push(duration); } };
    session.audio = { playComms: (temperament) => chirps.push(temperament) };
    const ship = session.spawnShip('pirate', [0, 0, -120], undefined, undefined, pilot);
    ship.targetId = 'player';
    setup(ship);
    session.save.player.shield = 5000;
    session.save.player.armor = 5000;
    session.save.player.hull = 5000;
    runFrames(session, ship, 2400);
    return { messages, chirps, relations, durations };
};
const taunts = commsRun('comms-1', { tier: 'veteran', temperament: 'flamboyant' }, () => undefined);
const distress = commsRun('comms-2', { tier: 'veteran', temperament: 'timid' }, (ship) => {
    ship.hull = ship.maxHull * 0.3;
    ship.fleeing = true;
});
const quiet = commsRun('comms-3', { tier: 'veteran', temperament: 'steady' }, () => undefined);
const threats = commsRun('comms-4', { tier: 'veteran', temperament: 'aggressive' }, () => undefined);
console.log(`  flamboyant: ${taunts.messages.length} taunts/${taunts.chirps.length} chirps · timid: ${distress.messages.length}/${distress.chirps.length} · aggressive: ${threats.messages.length}/${threats.chirps.length} · steady: ${quiet.messages.length}`);
if (taunts.messages.length)
    console.log(`  sample: ${taunts.messages[0]}`);
assert(taunts.messages.length >= 1, `flamboyant pilot taunts while engaged (${taunts.messages.length})`);
assert(distress.messages.length >= 1, `timid pilot cries for help when hurt and fleeing (${distress.messages.length})`);
assert(threats.messages.length >= 1, `aggressive pilot threatens in combat (${threats.messages.length})`);
assert(quiet.messages.length === 0, 'steady pilots stay silent professionals');
assert(taunts.chirps.length === taunts.messages.length && threats.chirps.length === threats.messages.length && distress.chirps.length === distress.messages.length, 'every pilot line lands with a comms chirp');
assert(taunts.relations.length === taunts.messages.length && taunts.relations.every((relation) => relation === 'hostile'), 'hostile talkers are tagged hostile for the red relation color');
assert(taunts.durations.length === taunts.messages.length && taunts.durations.every((duration) => duration >= 5000), 'chat lines stay on screen at least 5s');
assert(taunts.chirps.length > 0 && taunts.chirps.every((temperament) => temperament === 'flamboyant') && distress.chirps.every((temperament) => temperament === 'timid'), 'chirp carries the talker temperament');
assert(quiet.chirps.length === 0, 'no lines, no chirps');
const repeatComms = commsRun('comms-1', { tier: 'veteran', temperament: 'flamboyant' }, () => undefined);
assert(JSON.stringify(taunts) === JSON.stringify(repeatComms), 'comms and chirps are seed-deterministic');
// Situation awareness and diversity: the first line of an engagement is a
// contact line (said once per ship), the fight then rotates through the
// temperament pools instead of repeating, and a losing player draws gloating.
const lineOf = (message) => message.split(': “')[1]?.slice(0, -1);
assert(taunts.messages.some((message) => PILOT_LINES.flamboyant.contact.includes(lineOf(message))), 'flamboyant chatter includes a contact line');
assert(new Set(taunts.messages.map(lineOf)).size >= 2, `flamboyant chatter rotates through distinct lines (${new Set(taunts.messages.map(lineOf)).size})`);
assert(threats.messages.some((message) => PILOT_LINES.aggressive.contact.includes(lineOf(message))), 'aggressive chatter includes a contact line');
const losingRun = (seed, pilot) => {
    const session = makeSession(seed);
    const messages = [];
    const chirps = [];
    session.ui = { showPilotLine: (callsign, line) => messages.push(`${callsign}: “${line}”`) };
    session.audio = { playComms: (temperament) => chirps.push(temperament) };
    const ship = session.spawnShip('pirate', [0, 0, -120], undefined, undefined, pilot);
    ship.targetId = 'player';
    // The player is nearly dead (but shielded, so the fight keeps running):
    // the ladder must switch from chatter to gloating.
    session.save.player.shield = 50000;
    session.save.player.armor = 50000;
    session.save.player.hull = 1;
    runFrames(session, ship, 2400);
    return { messages, chirps };
};
const losingTaunts = losingRun('losing-1', { tier: 'veteran', temperament: 'flamboyant' });
assert(losingTaunts.messages.some((message) => PILOT_LINES.flamboyant.gloat.includes(lineOf(message))), 'a losing player draws a gloat line');

// ---------------------------------------------------------------------------
console.log('context lines: rank and valuable load change what hostiles say');
// A high bounty rank earns a one-shot name-drop carrying the player's actual
// title, and valuable sealed cargo — especially the diplomatic case — draws a
// line calling it out. Both are gated on player state and land once per ship.
const contextRun = (seed, pilot, setup) => {
    const session = makeSession(seed);
    const messages = [];
    session.ui = { showPilotLine: (callsign, line) => messages.push(`${callsign}: “${line}”`) };
    session.audio = { playComms: () => undefined };
    const ship = session.spawnShip('pirate', [0, 0, -120], undefined, undefined, pilot);
    ship.targetId = 'player';
    session.save.player.shield = 5000;
    session.save.player.armor = 5000;
    session.save.player.hull = 5000;
    setup(session);
    runFrames(session, ship, 2400);
    return { messages };
};
const rankSetup = (session) => { session.save.player.guildRank.bounty = 2; };
const ranked = contextRun('context-1', { tier: 'veteran', temperament: 'aggressive' }, rankSetup);
const unranked = contextRun('context-1', { tier: 'veteran', temperament: 'aggressive' }, () => undefined);
const caseRun = contextRun('context-2', { tier: 'veteran', temperament: 'flamboyant' }, (session) => { session.save.player.sealedCargo.push({ missionId: 'm1', label: 'sealed diplomatic case', units: 1, mass: 3 }); });
const holdRun = contextRun('context-3', { tier: 'veteran', temperament: 'aggressive' }, (session) => { session.save.player.sealedCargo.push({ missionId: 'm2', label: 'reactor-control package', units: 1, mass: 4 }); });
const emptyRun = contextRun('context-4', { tier: 'veteran', temperament: 'aggressive' }, () => undefined);
const rankLines = ranked.messages.filter((message) => message.includes('Hunter'));
const caseLines = caseRun.messages.filter((message) => PILOT_LINES.flamboyant.case.includes(lineOf(message)));
const holdLines = holdRun.messages.filter((message) => PILOT_LINES.aggressive.cargo.includes(lineOf(message)));
console.log(`  rank: ${rankLines.length} Hunter line(s) · case: ${caseLines.length} · hold: ${holdLines.length}`);
if (rankLines.length)
    console.log(`  sample: ${rankLines[0]}`);
assert(rankLines.length === 1, 'a high bounty rank earns exactly one name-drop with the title');
assert(!unranked.messages.some((message) => message.includes('Hunter')), 'no rank lines at low rank');
assert(caseLines.length === 1, 'a diplomatic case in the hold draws one case-specific line');
assert(holdLines.length === 1, 'valuable sealed cargo draws one cargo line');
assert(!emptyRun.messages.some((message) => PILOT_LINES.aggressive.cargo.includes(lineOf(message)) || PILOT_LINES.aggressive.case.includes(lineOf(message))), 'no cargo lines with an empty hold');
assert(JSON.stringify(ranked) === JSON.stringify(contextRun('context-1', { tier: 'veteran', temperament: 'aggressive' }, rankSetup)), 'context lines are seed-deterministic');

// ---------------------------------------------------------------------------
console.log('proximity: a mutter when the player closes to short range');
// Closing inside PROXIMITY_RANGE draws a one-off muttered line on top of the
// timed combat chatter. It fires on the approach edge and rolls on its own
// seeded stream, so it never perturbs the combat rolls.
const proximityRun = (seed, distance) => {
    const session = makeSession(seed);
    const lines = [];
    session.ui = { showPilotLine: (callsign, line) => lines.push(line) };
    session.audio = { playComms: () => undefined };
    const ship = session.spawnShip('pirate', [0, 0, -distance], undefined, undefined, { tier: 'veteran', temperament: 'flamboyant' });
    ship.targetId = 'player';
    session.save.player.shield = 5000;
    session.save.player.armor = 5000;
    session.save.player.hull = 5000;
    runFrames(session, ship, 2400);
    return { lines, mutters: lines.filter((line) => PILOT_LINES.flamboyant.proximity.includes(line)) };
};
const nearRun = proximityRun('prox-1', 120);
console.log(`  live flight at 120u: ${nearRun.mutters.length} mutter(s) of ${nearRun.lines.length} lines`);
if (nearRun.mutters.length)
    console.log(`  sample: ${nearRun.mutters[0]}`);
assert(nearRun.mutters.length === 1, `closing to short range draws exactly one proximity mutter (${nearRun.mutters.length})`);
// The range gate, measured directly: inside 350 a clean approach edge fires
// the mutter; beyond it nothing does.
const gateRun = (seed, distance) => {
    const session = makeSession(seed);
    const lines = [];
    session.ui = { showPilotLine: (callsign, line) => lines.push(line) };
    session.audio = { playComms: () => undefined };
    session.spawnShip('pirate', [0, 0, -distance], undefined, undefined, { tier: 'veteran', temperament: 'flamboyant' });
    session.save.world.time = 10; // past the spawn grace, no prior proximity
    const pos = new THREE.Vector3(0, 0, -distance);
    const playerPos = new THREE.Vector3(0, 0, 0);
    session.maybeProximityLine(session.ships[0], pos, playerPos);
    return lines;
};
const inRange = gateRun('gate-1', 300);
const outRange = gateRun('gate-2', 380);
assert(inRange.length === 1 && PILOT_LINES.flamboyant.proximity.includes(inRange[0]), 'closing inside 350 draws a mutter');
assert(outRange.length === 0, 'no mutter beyond 350');
assert(JSON.stringify(nearRun) === JSON.stringify(proximityRun('prox-1', 120)), 'proximity mutters are seed-deterministic');

// ---------------------------------------------------------------------------
console.log('story seam: a story line silences all chatter');
// While a story line is up (storyLineUntil in the future) every chatter
// emitter returns before rolling: no lines, no chirps, no consumed cooldowns
// or one-shot markers — so story missions hold the floor, and chatter
// resumes promptly once the story ends.
const storySeamRun = () => {
    const session = makeSession('story-1');
    const messages = [];
    const chirps = [];
    session.ui = { showPilotLine: (callsign, line) => messages.push(`${callsign}: “${line}”`) };
    session.audio = { play: () => undefined, playComms: (temperament) => chirps.push(temperament) };
    const ship = session.spawnShip('pirate', [0, 0, -120], undefined, undefined, { tier: 'veteran', temperament: 'flamboyant' });
    ship.targetId = 'player';
    session.save.player.shield = 5000;
    session.save.player.armor = 5000;
    session.save.player.hull = 5000;
    session.storyLineUntil = Number.POSITIVE_INFINITY;
    const nextLineBefore = ship.nextLineAt;
    runFrames(session, ship, 1200);
    const result = {
        muted: messages.length + chirps.length,
        historyDuring: session.pilotLineHistory.size,
        cooldownUntouched: ship.nextLineAt === nextLineBefore,
    };
    session.storyLineUntil = -1; // story ends — chatter may resume
    runFrames(session, ship, 600);
    result.resumed = messages.length >= 1;
    return result;
};
const seam = storySeamRun();
console.log(`  during story: ${seam.muted} emissions · after: ${seam.resumed ? 'lines resume' : 'silent'}`);
assert(seam.muted === 0, 'a story line silences all chatter (no lines, no chirps)');
assert(seam.historyDuring === 0, 'the pause consumes no rolls (nothing marked said)');
assert(seam.cooldownUntouched, 'the pause consumes no chatter cooldown');
assert(seam.resumed, 'chatter resumes promptly once the story ends');

// ---------------------------------------------------------------------------
console.log('story line: mock story mission end-to-end');
// playStoryLine pins a story transmission and mutes all chatter; dismissing
// the bar (or the duration elapsing) clears the mute and chatter resumes.
const storyLineRun = () => {
    const session = makeSession('story-2');
    const lines = [];
    const chirps = [];
    const shown = [];
    session.ui = {
        showPilotLine: (callsign, line) => lines.push(line),
        showStoryLine: (name, text) => shown.push(`${name}: ${text}`),
        dismissStory: () => undefined,
    };
    session.audio = { play: () => undefined, playComms: (temperament) => chirps.push(temperament) };
    const ship = session.spawnShip('pirate', [0, 0, -120], undefined, undefined, { tier: 'veteran', temperament: 'flamboyant' });
    ship.targetId = 'player';
    session.save.player.shield = 5000;
    session.save.player.armor = 5000;
    session.save.player.hull = 5000;
    runFrames(session, ship, 300); // a few seconds of normal chatter first
    const beforeStory = lines.length + chirps.length;
    session.playStoryLine('Helix Control', 'The Meridian is gone. Whatever you find, don\'t let it find you.', 'neutral', 30);
    runFrames(session, ship, 900); // story up: chatter must stay muted
    const duringStory = lines.length + chirps.length;
    session.ui.storyDismissed = true; // the player taps CONTINUE
    session.refreshStoryLine();
    const activeAfterDismiss = session.storyLineActive();
    runFrames(session, ship, 600);
    const afterStory = lines.length + chirps.length;
    return { shown, beforeStory, duringStory, activeAfterDismiss, afterStory };
};
const storyLine = storyLineRun();
console.log(`  shown: ${storyLine.shown.length} · muted while up: ${storyLine.duringStory - storyLine.beforeStory} new · resumes: ${storyLine.afterStory - storyLine.duringStory} new`);
assert(storyLine.shown.length === 1 && storyLine.shown[0].includes('Meridian'), 'playStoryLine pins the story transmission');
assert(storyLine.duringStory === storyLine.beforeStory, 'all chatter is muted while the story line is up');
assert(storyLine.activeAfterDismiss === false, 'dismissing the story clears the mute');
assert(storyLine.afterStory > storyLine.duringStory, 'chatter resumes after dismissal');
const timeoutClears = (() => {
    const session = makeSession('story-3');
    session.ui = { showPilotLine: () => undefined, showStoryLine: () => undefined, dismissStory: () => undefined };
    session.audio = { play: () => undefined, playComms: () => undefined };
    session.playStoryLine('X', 'Y', 'neutral', 10);
    session.save.world.time += 11;
    session.refreshStoryLine();
    return session.storyLineActive();
})();
assert(timeoutClears === false, 'the story mute expires on its own after the duration');

// ---------------------------------------------------------------------------
console.log('talker indicator: relation color and callsign-only text');
// The comms surfaces color each line by the speaker's relation to the player
// (hostiles red, allies blue, neutral white) and show just the callsign — the
// quoted combat handle when there is one, the plain name otherwise.
console.log(`  hostile → ${relationColor('hostile')} · ally → ${relationColor('ally')} · neutral → ${relationColor('neutral')}`);
assert(relationColor('hostile') !== relationColor('ally') && relationColor('ally') !== relationColor('neutral'), 'relation colors are distinct per relation');
assert(relationColor('hostile').startsWith('#ff6') && relationColor('ally').startsWith('#6fb') && relationColor('neutral').startsWith('#e9'), 'hostile reads red, ally blue, neutral white');
assert(callsignHandle('Kade Harker “Black Kite”') === 'Black Kite', 'callsign text uses the quoted combat handle');
assert(callsignHandle('MV 42') === 'MV 42', 'callsign text falls back to the plain name');

// ---------------------------------------------------------------------------
console.log('hit taunts: aces, flamboyants and aggressive pilots react to scoring');
// A successful shot at the player is a moment worth talking about: ace-tier
// and flamboyant pilots roll a seeded chance to rub it in, aggressive pilots
// threaten with a smaller chance, and a steady veteran lands hits but stays
// silent — the taunt needs the ace tier, the flamboyant streak, or the
// aggressive temper. The frame loop runs updateProjectiles so bolts actually
// reach the player.
const hitTauntRun = (seed, pilot) => {
    const session = makeSession(seed);
    const messages = [];
    const chirps = [];
    let attempts = 0;
    session.ui = { showPilotLine: (callsign, line) => messages.push(`${callsign}: “${line}”`) };
    session.audio = { play: () => undefined, playComms: (temperament) => chirps.push(temperament) };
    const originalHitTaunt = session.maybeHitTaunt.bind(session);
    session.maybeHitTaunt = (attackerId) => { attempts += 1; originalHitTaunt(attackerId); };
    const ship = session.spawnShip('pirate', [0, 0, -130], undefined, undefined, pilot);
    ship.targetId = 'player';
    session.save.player.shield = 5000;
    session.save.player.armor = 5000;
    session.save.player.hull = 5000;
    for (let frame = 0; frame < 2400; frame += 1) {
        session.save.world.time += STEP;
        session.updateShips(STEP);
        session.updateProjectiles(STEP);
    }
    return { attempts, messages, chirps };
};
const aceHits = hitTauntRun('hittaunt-1', { tier: 'ace', temperament: 'steady' });
const veteranHits = hitTauntRun('hittaunt-1', { tier: 'veteran', temperament: 'steady' });
const flamboyantHits = hitTauntRun('hittaunt-2', { tier: 'veteran', temperament: 'flamboyant' });
const aggressiveHits = hitTauntRun('hittaunt-3', { tier: 'veteran', temperament: 'aggressive' });
console.log(`  ace: ${aceHits.attempts} hits → ${aceHits.messages.length} taunts · veteran: ${veteranHits.attempts} hits → ${veteranHits.messages.length} · flamboyant: ${flamboyantHits.attempts} → ${flamboyantHits.messages.length} · aggressive: ${aggressiveHits.attempts} hits → ${aggressiveHits.messages.length} threats`);
if (aceHits.messages.length)
    console.log(`  sample: ${aceHits.messages[0]}`);
assert(aceHits.attempts >= 1, `ace landed hits on the player (${aceHits.attempts})`);
assert(aceHits.messages.length >= 1, `ace taunts when a shot lands (${aceHits.messages.length})`);
assert(flamboyantHits.messages.length >= 1, `flamboyant taunts when a shot lands (${flamboyantHits.messages.length})`);
assert(aggressiveHits.messages.length >= 1, `aggressive pilot threatens when a shot lands (${aggressiveHits.messages.length})`);
assert(veteranHits.attempts >= 1 && veteranHits.messages.length === 0, `steady veteran lands hits but never taunts (${veteranHits.attempts} hits, ${veteranHits.messages.length} lines)`);
assert(aceHits.chirps.length === aceHits.messages.length, 'hit taunts chirp with the toast');
assert(JSON.stringify(aceHits) === JSON.stringify(hitTauntRun('hittaunt-1', { tier: 'ace', temperament: 'steady' })), 'hit taunts are seed-deterministic');
// The smaller aggressive chance is hard to see through the 6-14s cooldown,
// so neutralize it: every landed hit rolls the gate, and the seeded counts
// must still order ace > aggressive.
const tauntRateRun = (seed, pilot) => {
    const session = makeSession(seed);
    let attempts = 0;
    const messages = [];
    session.ui = { showPilotLine: (callsign, line) => messages.push(`${callsign}: “${line}”`) };
    session.audio = { play: () => undefined, playComms: () => undefined };
    const originalHitTaunt = session.maybeHitTaunt.bind(session);
    session.maybeHitTaunt = (attackerId) => {
        attempts += 1;
        originalHitTaunt(attackerId);
        const ship = session.ships.find((entry) => entry.id === attackerId);
        if (ship)
            ship.nextHitTauntAt = 0;
    };
    const ship = session.spawnShip('pirate', [0, 0, -130], undefined, undefined, pilot);
    ship.targetId = 'player';
    session.save.player.shield = 5000;
    session.save.player.armor = 5000;
    session.save.player.hull = 5000;
    for (let frame = 0; frame < 2400; frame += 1) {
        session.save.world.time += STEP;
        session.updateShips(STEP);
        session.updateProjectiles(STEP);
    }
    return { attempts, messages };
};
const aceRate = tauntRateRun('rate-1', { tier: 'ace', temperament: 'steady' });
const aggressiveRate = tauntRateRun('rate-1', { tier: 'veteran', temperament: 'aggressive' });
console.log(`  taunt rates (cooldown off): ace ${aceRate.messages.length}/${aceRate.attempts} · aggressive ${aggressiveRate.messages.length}/${aggressiveRate.attempts}`);
assert(aceRate.attempts >= 8 && aggressiveRate.attempts >= 8, 'both pilots landed enough hits to compare taunt rates');
assert(aggressiveRate.messages.length * 1.5 < aceRate.messages.length, `aggressive threatens less often than ace (${aggressiveRate.messages.length} vs ${aceRate.messages.length})`);

// ---------------------------------------------------------------------------
console.log('press: aggressive threats are backed by a closing pass');
// Talk is backed by action: when an aggressive pilot threatens on a landed
// hit, the next pass commits deeper (tighter standoff) and the extend is
// abbreviated, so the ship stays in the fight instead of flying off.
const pressWiring = (seed, temperament) => {
    const session = makeSession(seed);
    const ship = session.spawnShip('pirate', [0, 0, -100], undefined, undefined, { tier: 'veteran', temperament });
    ship.aiRng = () => 0.01; // force the threat chance roll through
    session.maybeHitTaunt(ship.id);
    return ship.pressingUntil ?? undefined;
};
const aggressivePressAt = pressWiring('press-wire-1', 'aggressive');
const steadyPressAt = pressWiring('press-wire-1', 'steady');
assert(aggressivePressAt > 0, 'aggressive threat opens a press window');
assert(steadyPressAt === undefined, 'steady pilots never press');
const pressRun = (seed, pressing) => {
    const session = makeSession(seed);
    const ship = session.spawnShip('pirate', [0, 0, -130], undefined, undefined, { tier: 'veteran', temperament: 'aggressive' });
    ship.targetId = 'player';
    if (pressing)
        ship.pressingUntil = 5;
    session.save.player.shield = 5000;
    session.save.player.armor = 5000;
    session.save.player.hull = 5000;
    let closeFrames = 0;
    let flipDist = undefined;
    let lastPhase = ship.attackPhase;
    for (let frame = 0; frame < 900; frame += 1) {
        session.save.world.time += STEP;
        const dist = Math.hypot(ship.position[0], ship.position[1], ship.position[2]);
        const windowActive = session.save.world.time < (ship.pressingUntil ?? -1);
        if (windowActive && ship.attackPhase === 'extend' && lastPhase === 'approach' && flipDist === undefined)
            flipDist = dist;
        if (dist < 60)
            closeFrames += 1;
        lastPhase = ship.attackPhase;
        session.updateShips(STEP);
    }
    return { closeFrames, flipDist, passRange: ship.passRange };
};
const noPress = pressRun('press-1', false);
const pressed = pressRun('press-1', true);
console.log(`  pressing: ${pressed.closeFrames} close frames vs ${noPress.closeFrames} · pass breaks at ${pressed.flipDist?.toFixed(1)} vs standoff ${pressed.passRange.toFixed(1)}`);
assert(pressed.closeFrames > noPress.closeFrames, `a pressing pilot spends more time at close range (${pressed.closeFrames} vs ${noPress.closeFrames} frames)`);
assert(pressed.flipDist !== undefined && pressed.flipDist < pressed.passRange * 0.8, `the pressed pass commits deeper than the standoff (breaks at ${pressed.flipDist?.toFixed(1)} vs passRange ${pressed.passRange.toFixed(1)})`);
const pressedRepeat = pressRun('press-1', true);
assert(pressedRepeat.closeFrames === pressed.closeFrames && pressedRepeat.flipDist === pressed.flipDist, 'press behavior is seed-deterministic');

// ---------------------------------------------------------------------------
console.log('distress: timid pilots call for help when hit — but not from long-range potshots');
// Every temperament reacts to scoring: attackers taunt/threaten, but timid
// pilots are on the receiving end — each player hit rolls a seeded chance to
// cry for help, cooldown-capped. At close range any hit qualifies; out past
// the distress range a hit has to actually bite hull (shields down, fight
// real) or the MAYDAY stays silent. World time advances between hits so the
// cooldown expires; steady victims stay silent.
const distressRun = (seed, setup) => {
    const session = makeSession(seed);
    const messages = [];
    const chirps = [];
    session.ui = { showToast: () => undefined, showPilotLine: (callsign, line) => messages.push(`${callsign}: “${line}”`) };
    session.audio = { play: () => undefined, playComms: (t) => chirps.push(t) };
    const ship = session.spawnShip('pirate', setup.position, undefined, undefined, { tier: 'veteran', temperament: setup.temperament ?? 'timid' });
    ship.shield = setup.shield ?? 5000;
    ship.armor = setup.armor ?? 5000;
    for (let index = 0; index < setup.hits; index += 1) {
        session.save.world.time += 15;
        session.damageShip(ship, setup.damage ?? 1, 'player', [0, 0, 0]);
    }
    return { messages, chirps };
};
const timidClose = distressRun('distress-1', { position: [0, 0, -100], hits: 200 });
const timidFarShield = distressRun('distress-2', { position: [0, 0, -400], hits: 200 });
const timidFarHull = distressRun('distress-3', { position: [0, 0, -400], shield: 0, armor: 0, hits: 40, damage: 1 });
const steadyClose = distressRun('distress-1', { position: [0, 0, -100], hits: 200, temperament: 'steady' });
console.log(`  close-range plinks: ${timidClose.messages.length} calls · far-range plinks: ${timidFarShield.messages.length} · far-range hull hits: ${timidFarHull.messages.length} · steady: ${steadyClose.messages.length}`);
if (timidClose.messages.length)
    console.log(`  sample: ${timidClose.messages[0]}`);
assert(timidClose.messages.length >= 3, `timid pilot calls for help when hit at close range (${timidClose.messages.length})`);
assert(timidFarShield.messages.length === 0, `long-range shield plinks don't draw MAYDAY calls (${timidFarShield.messages.length})`);
assert(timidFarHull.messages.length >= 3, `long-range hull damage still calls for help (${timidFarHull.messages.length})`);
assert(steadyClose.messages.length === 0, 'steady victims stay silent under fire');
assert(timidClose.chirps.length === timidClose.messages.length, 'distress calls chirp with the subtitle');
assert(JSON.stringify(timidClose) === JSON.stringify(distressRun('distress-1', { position: [0, 0, -100], hits: 200 })), 'distress calls are seed-deterministic');

// ---------------------------------------------------------------------------
console.log('dogfight: ace vs veteran, identical hulls, 300s of jousting');
// Two pirates with the same role stats — the only difference is the pilot
// tier. The opponent is a VETERAN, not a novice: the corrected lead already
// makes an ace slaughter a novice (24/24 wins, ~4.7x damage), which proves
// nothing. Against a veteran the fight is close enough to discriminate — the
// ace must still accumulate a decisive damage edge through tighter aim,
// faster fire and better evasion, without trivializing the matchup.
const DOGFIGHT_SEEDS = 24;
const DOGFIGHT_FRAMES = 18000;
const dogfight = (seed) => {
    const session = makeSession(seed);
    const ace = session.spawnShip('pirate', [400, 0, -180], undefined, undefined, { tier: 'ace', temperament: 'steady' });
    const foe = session.spawnShip('pirate', [400, 0, 180], undefined, undefined, { tier: 'veteran', temperament: 'steady' });
    ace.targetId = foe.id;
    foe.targetId = ace.id;
    const face = (ship, toward) => {
        const dir = new THREE.Vector3(...toward).sub(new THREE.Vector3(...ship.position)).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
        ship.rotation = [q.x, q.y, q.z, q.w];
    };
    face(ace, foe.position);
    face(foe, ace.position);
    const dt = 1 / 60;
    let aceDamage = 0;
    let foeDamage = 0;
    let lastFoe = { shield: foe.shield, armor: foe.armor, hull: foe.hull };
    let lastAce = { shield: ace.shield, armor: ace.armor, hull: ace.hull };
    for (let frame = 0; frame < DOGFIGHT_FRAMES; frame += 1) {
        session.save.world.time += dt;
        session.updateShips(dt);
        session.updateProjectiles(dt);
        const drain = (now, prev) => (prev.shield - now.shield) + (prev.armor - now.armor) + (prev.hull - Math.max(0, now.hull));
        aceDamage += drain({ shield: foe.shield, armor: foe.armor, hull: foe.hull }, lastFoe);
        foeDamage += drain({ shield: ace.shield, armor: ace.armor, hull: ace.hull }, lastAce);
        lastFoe = { shield: foe.shield, armor: foe.armor, hull: foe.hull };
        lastAce = { shield: ace.shield, armor: ace.armor, hull: ace.hull };
        if (ace.hull <= 0 || foe.hull <= 0)
            break;
    }
    return { aceDamage, foeDamage, aceKilled: ace.hull <= 0, foeKilled: foe.hull <= 0 };
};
const dogfights = [];
for (let seed = 1; seed <= DOGFIGHT_SEEDS; seed += 1)
    dogfights.push(dogfight(`dogfight-${seed}`));
const aceWins = dogfights.filter((r) => r.aceDamage > r.foeDamage).length;
const aceKills = dogfights.filter((r) => r.foeKilled).length;
const foeKills = dogfights.filter((r) => r.aceKilled).length;
const aceTotal = dogfights.reduce((sum, r) => sum + r.aceDamage, 0);
const foeTotal = dogfights.reduce((sum, r) => sum + r.foeDamage, 0);
console.log(`  ace wins-on-damage ${aceWins}/${DOGFIGHT_SEEDS} (kills ${aceKills} vs ${foeKills}) · aggregate ${aceTotal.toFixed(0)} vs ${foeTotal.toFixed(0)} damage`);
assert(aceWins >= Math.ceil((DOGFIGHT_SEEDS * 3) / 4), `ace wins on damage in at least 3/4 of seeded runs against a veteran (${aceWins}/${DOGFIGHT_SEEDS})`);
assert(aceTotal > foeTotal * 1.5, `ace aggregate damage is at least 1.5x the veteran's (${aceTotal.toFixed(0)} vs ${foeTotal.toFixed(0)})`);
const repeat = dogfight('dogfight-1');
const firstRun = dogfights[0];
assert(repeat.aceDamage === firstRun.aceDamage && repeat.foeDamage === firstRun.foeDamage, 'dogfight outcome is byte-identical across runs of the same seed');

// ---------------------------------------------------------------------------
console.log('dogfight 2v1: quantity can\'t buy the ace at the bottom, but two veterans are close');
// Quantity vs quality at each tier. Two novices (simultaneous) are still
// decisively out-fought: poor aim can't punish the ace's evasion, so it wins
// ~9 of 10 runs at 3x+ damage. Two veterans are a different story — the
// bursty post-damage evasion that makes damaged ships finishable also makes a
// focused ace hittable, and simultaneous crossfire is a foregone ace-loss
// (measured ~0.8x damage, ~4/24 wins). The fair measure is a realistic
// staggered pursuit: the second veteran starts 600 units away and has to
// close, so the ace must win the first duel fast and then face a fresh foe.
// Sampled over four seed sets this lands 7-13/24 wins at 1.0-1.35x damage —
// genuinely close, swinging on seed noise in either direction.
const DOGFIGHT_2V1_FRAMES = 18000;
const dogfight2v1 = (seed, foeTier, foeBDist) => {
    const session = makeSession(seed);
    const ace = session.spawnShip('pirate', [400, 0, -180], undefined, undefined, { tier: 'ace', temperament: 'steady' });
    const foeA = session.spawnShip('pirate', [400, 0, 180], undefined, undefined, { tier: foeTier, temperament: 'steady' });
    const foeB = session.spawnShip('pirate', [400, 26, foeBDist], undefined, undefined, { tier: foeTier, temperament: 'steady' });
    ace.targetId = foeA.id;
    foeA.targetId = ace.id;
    foeB.targetId = ace.id;
    const face = (ship, toward) => {
        const dir = new THREE.Vector3(...toward).sub(new THREE.Vector3(...ship.position)).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
        ship.rotation = [q.x, q.y, q.z, q.w];
    };
    face(ace, foeA.position);
    face(foeA, ace.position);
    face(foeB, ace.position);
    const dt = 1 / 60;
    let aceDamage = 0;
    let foeDamage = 0;
    let lastFoes = { a: { shield: foeA.shield, armor: foeA.armor, hull: foeA.hull }, b: { shield: foeB.shield, armor: foeB.armor, hull: foeB.hull } };
    let lastAce = { shield: ace.shield, armor: ace.armor, hull: ace.hull };
    const drain = (now, prev) => (prev.shield - now.shield) + (prev.armor - now.armor) + (prev.hull - Math.max(0, now.hull));
    for (let frame = 0; frame < DOGFIGHT_2V1_FRAMES; frame += 1) {
        session.save.world.time += dt;
        session.updateShips(dt);
        session.updateProjectiles(dt);
        const nowFoes = { a: { shield: foeA.shield, armor: foeA.armor, hull: foeA.hull }, b: { shield: foeB.shield, armor: foeB.armor, hull: foeB.hull } };
        aceDamage += drain(nowFoes.a, lastFoes.a) + drain(nowFoes.b, lastFoes.b);
        foeDamage += drain({ shield: ace.shield, armor: ace.armor, hull: ace.hull }, lastAce);
        lastFoes = nowFoes;
        lastAce = { shield: ace.shield, armor: ace.armor, hull: ace.hull };
        // Re-acquire: keep the ace on a living foe (resolveShipTarget would
        // fall back to the stationary player once its target dies).
        if (ace.hull <= 0 || (foeA.hull <= 0 && foeB.hull <= 0))
            break;
        if (foeA.hull <= 0 || foeB.hull <= 0) {
            const living = foeA.hull > 0 ? foeA : foeB;
            if (ace.targetId !== living.id)
                ace.targetId = living.id;
        }
    }
    return { aceDamage, foeDamage, aceKilled: ace.hull <= 0, foeKilled: foeA.hull <= 0 && foeB.hull <= 0 };
};
const run2v1 = (prefix, tier, dist) => {
    const results = [];
    for (let seed = 1; seed <= DOGFIGHT_SEEDS; seed += 1)
        results.push(dogfight2v1(`${prefix}-${seed}`, tier, dist));
    return results;
};
const summarize2v1 = (results) => ({
    wins: results.filter((r) => r.aceDamage > r.foeDamage).length,
    kills: results.filter((r) => r.foeKilled).length,
    deaths: results.filter((r) => r.aceKilled).length,
    ratio: results.reduce((sum, r) => sum + r.aceDamage, 0) / Math.max(1, results.reduce((sum, r) => sum + r.foeDamage, 0)),
});
const noviceResults = run2v1('2v1-novice', 'novice', 220);
const veteranResults = run2v1('2v1-veteran', 'veteran', 600);
const novicePair = summarize2v1(noviceResults);
const veteranPair = summarize2v1(veteranResults);
console.log(`  2x novice: ace ${novicePair.wins}/${DOGFIGHT_SEEDS} wins · ${novicePair.kills} kills · ${novicePair.deaths} deaths · ${novicePair.ratio.toFixed(2)}x damage`);
console.log(`  2x veteran (staggered): ace ${veteranPair.wins}/${DOGFIGHT_SEEDS} wins · ${veteranPair.kills} kills · ${veteranPair.deaths} deaths · ${veteranPair.ratio.toFixed(2)}x damage`);
assert(novicePair.wins >= Math.ceil((DOGFIGHT_SEEDS * 3) / 4), `ace beats two novices in at least 3/4 of runs (${novicePair.wins}/${DOGFIGHT_SEEDS})`);
assert(novicePair.ratio > 2, `ace out-damages two novices by at least 2x (${novicePair.ratio.toFixed(2)}x)`);
assert(veteranPair.wins >= Math.ceil(DOGFIGHT_SEEDS / 4) && veteranPair.wins <= Math.ceil((DOGFIGHT_SEEDS * 2) / 3), `two veterans are a close fight for the ace, no sweep either way (${veteranPair.wins}/${DOGFIGHT_SEEDS})`);
assert(veteranPair.ratio > 0.75 && veteranPair.ratio < 1.5, `two veterans trade damage near even (${veteranPair.ratio.toFixed(2)}x)`);
const repeat2v1 = dogfight2v1('2v1-veteran-1', 'veteran', 600);
assert(repeat2v1.aceDamage === veteranResults[0].aceDamage && repeat2v1.foeDamage === veteranResults[0].foeDamage, '2v1 outcome is byte-identical across runs of the same seed');

// ---------------------------------------------------------------------------
console.log('finish: damaged ships are finishable (bursty evasion, no stall)');
// A pre-damaged ship must not dodge forever: post-damage evasion alternates
// dodge bursts with rest windows, so an accurate shooter can actually finish
// it instead of the fight stalling at partial hull.
const FINISH_SEEDS = 16;
const finishFight = (seed) => {
    const session = makeSession(seed);
    const ace = session.spawnShip('pirate', [400, 0, -180], undefined, undefined, { tier: 'ace', temperament: 'steady' });
    const novice = session.spawnShip('pirate', [400, 0, 180], undefined, undefined, { tier: 'novice', temperament: 'steady' });
    // No shields at all: this isolates the evasion stall from the shield-regen
    // arms race (regen is a separate, intentional combat mechanic).
    novice.shield = 0;
    novice.maxShield = 0;
    novice.armor = 0;
    novice.hull = novice.maxHull * 0.4;
    ace.targetId = novice.id;
    novice.targetId = ace.id;
    const face = (ship, toward) => {
        const dir = new THREE.Vector3(...toward).sub(new THREE.Vector3(...ship.position)).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
        ship.rotation = [q.x, q.y, q.z, q.w];
    };
    face(ace, novice.position);
    face(novice, ace.position);
    const dt = 1 / 60;
    let restFrames = 0;
    let frames = 0;
    for (; frames < 24000; frames += 1) {
        session.save.world.time += dt;
        session.updateShips(dt);
        session.updateProjectiles(dt);
        if (novice.evadePhase === 'rest')
            restFrames += 1;
        if (novice.hull <= 0)
            return { finished: true, frames, restFraction: restFrames / frames };
        if (ace.hull <= 0)
            return { finished: false, frames, restFraction: restFrames / frames };
    }
    return { finished: false, frames, restFraction: restFrames / frames };
};
const finishes = [];
for (let seed = 1; seed <= FINISH_SEEDS; seed += 1)
    finishes.push(finishFight(`finish-${seed}`));
const finishedCount = finishes.filter((r) => r.finished).length;
const avgRest = finishes.reduce((sum, r) => sum + r.restFraction, 0) / finishes.length;
console.log(`  ace finished the damaged novice in ${finishedCount}/${FINISH_SEEDS} fights · damaged ship rested ${(avgRest * 100).toFixed(0)}% of the time`);
assert(finishedCount >= Math.ceil((FINISH_SEEDS * 2) / 3), `a damaged ship is finishable in at least 2/3 of fights (${finishedCount}/${FINISH_SEEDS})`);
assert(avgRest > 0.3, `post-damage evasion is bursty, not perpetual (${(avgRest * 100).toFixed(0)}% resting)`);
const firstFinish = finishes[0];
const repeatFinish = finishFight('finish-1');
assert(firstFinish.finished === repeatFinish.finished && firstFinish.frames === repeatFinish.frames, 'finish outcome is seed-deterministic');

// ---------------------------------------------------------------------------
console.log('determinism: same seed, identical behavior');
const a = runAim('drift-1', { tier: 'novice', temperament: 'flamboyant' });
const b = runAim('drift-1', { tier: 'novice', temperament: 'flamboyant' });
assert(JSON.stringify(a) === JSON.stringify(b), `two runs with the same seed produce identical bolt logs (${a.length} bolts)`);
const first = makeSession('drift-2').spawnShip('pirate', [0, 0, -120], undefined, undefined, { tier: 'veteran', temperament: 'aggressive' });
const second = makeSession('drift-2').spawnShip('pirate', [0, 0, -120], undefined, undefined, { tier: 'veteran', temperament: 'aggressive' });
assert(JSON.stringify(first.pilot) === JSON.stringify(second.pilot) && first.passRange === second.passRange && first.resetRange === second.resetRange, 'seeded spawn rolls the identical pilot and ranges');
const rolled = makeSession('drift-3').spawnShip('pirate', [0, 0, -120]);
const rolledAgain = makeSession('drift-3').spawnShip('pirate', [0, 0, -120]);
assert(['novice', 'veteran', 'ace'].includes(rolled.pilot.tier) && ['timid', 'steady', 'aggressive', 'flamboyant'].includes(rolled.pilot.temperament), `plain spawn rolls a valid pilot (${rolled.pilot.tier}/${rolled.pilot.temperament})`);
assert(rolled.pilot.tier === rolledAgain.pilot.tier && rolled.pilot.temperament === rolledAgain.pilot.temperament, 'plain spawn pilot roll is seed-stable');

// ---------------------------------------------------------------------------
console.log(`\n${passed} assertions passed${process.exitCode ? ' (with failures)' : ''}.`);
