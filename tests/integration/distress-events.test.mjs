import test from 'node:test';
import assert from 'node:assert/strict';
import {session} from '../helpers/session.mjs';
import {hydrateSave, createNewSave} from '../../src/game/save.js';
import {dialogueText} from '../../src/game/adventureDialogues.js';
import {getLanguage, setLanguage} from '../../src/game/i18n.js';
import {repairTargetEligible, selectRepairTarget} from '../../src/game/repairDrones.js';
import {updateShipAI} from '../../src/game/shipAI.js';
import {
    DISTRESS_VARIANTS, DISTRESS_VARIANT_IDS, DISTRESS_FIRST_MIN, DISTRESS_FIRST_MAX,
    DISTRESS_GAP_MIN, DISTRESS_GAP_MAX, DISTRESS_DISCOVER_RANGE,
    DISTRESS_RETALIATION_TIME, DISTRESS_SIGNAL_MIN_DISTANCE, DISTRESS_SIGNAL_MAX_DISTANCE,
    DISTRESS_BEACON_FAIL_RANGE,
    distressDialogue, distressJournal, distressObjective, distressSetup, distressText, normalizeDistress,
} from '../../src/game/distressData.js';

function make() {
    const s = session();
    s.arena = null;
    s.save.arena = undefined;
    s.save.world.time = 100;
    s.persistSave = () => {};
    s.monitor = undefined;
    s.setMonitorStatus = text => { s.monitor = text; };
    s.lineBlocked = () => false;
    s.activeFieldObstacles = () => [];
    s.playerHullScale = () => 1;
    s.ui = {
        pushEvent() {}, pushSensor() {}, showStoryLine() {}, playStoryLine() {},
        hideShipMenu() {}, isShipMenuOpen() { return false; }, updateHud() {},
    };
    s.audio = {play() {}};
    s.renderer = {};
    s.wreckNodes = [];
    s.pickups = [];
    s.spawnShip = (role, position, missionId, name, pilot, options) => {
        const ship = {
            id: `actor-${s.ships.length}`, role, name, hullId: options?.hullId,
            position: [...position], velocity: [0, 0, 0], rotation: [0, 0, 0, 1],
            hull: 240, maxHull: 240, shield: 40, maxShield: 40,
            faction: options?.faction ?? 'independents', hostile: false,
            destination: [...position], dark: false,
        };
        s.ships.push(ship);
        return ship;
    };
    s.spawnPickup = (commodity, origin, source, amount) => {
        const pickup = {id: `pickup-${s.pickups.length + 1}`, commodity, source, amount, life: 140};
        s.pickups.push(pickup);
        return pickup;
    };
    s.initializeDistress();
    return s;
}

function tick(s) {
    s.distressTickAt = 0;
    s.updateDistress();
}

test('encounter ships receive a stable faction portrait index',()=>{
    const s=session();
    const first=s.spawnShip('pirate',[0,0,-100],'portrait-test','Red Talon',undefined,{faction:'pirates',hullId:'scrapper'});
    const repeated=s.spawnShip('pirate',[100,0,-100],'portrait-test','Red Talon',undefined,{faction:'pirates',hullId:'scrapper'});
    const alliance=s.spawnShip('patrol',[0,0,100],'portrait-test','CPV Ash',undefined,{faction:'alliance',hullId:'legionary'});
    for(const ship of [first,repeated,alliance])
        assert.ok(Number.isInteger(ship.portraitIndex)&&ship.portraitIndex>=0&&ship.portraitIndex<6);
    assert.equal(repeated.portraitIndex,first.portraitIndex);
});

function atEvent(s) {
    const active = s.save.world.distress.active;
    s.save.player.position = [...active.position];
    s.save.player.velocity = [0, 0, 0];
    return active;
}

test('eight authored variants, two setups each, and an 85/15 genuine/trap split', () => {
    assert.equal(DISTRESS_VARIANTS.length, 8);
    assert.deepEqual([...DISTRESS_VARIANT_IDS], ['convoy', 'wreck', 'trap', 'fuel', 'disabled', 'debris', 'jettison', 'dispute']);
    for (const variant of DISTRESS_VARIANTS) {
        assert.equal(variant.setups.length, 2, variant.id);
        assert.equal(new Set(variant.setups.map(setup => setup.caller)).size, 2, variant.id);
    }
    const total = DISTRESS_VARIANTS.reduce((sum, variant) => sum + variant.weight, 0);
    assert.equal(total, 100);
    assert.equal(DISTRESS_VARIANTS.find(variant => variant.id === 'trap').weight, 15);
});

test('scheduling waits for the first window, avoids the last two variants and never stacks events', () => {
    const s = make();
    const data = s.save.world.distress;
    assert.ok(data.nextAt >= 100 + DISTRESS_FIRST_MIN && data.nextAt <= 100 + DISTRESS_FIRST_MAX);
    data.nextAt = 100;
    tick(s);
    const first = data.active;
    assert.ok(first);
    assert.equal(data.lastVariants[0], first.variant);
    data.nextAt = 0;
    tick(s);
    assert.equal(data.active.id, first.id, 'an unresolved event must not be replaced');
    data.lastVariants = ['trap', 'wreck', 'fuel'];
    let sawOlder = false;
    for (let i = 0; i < 200; i++) {
        const picked = s.pickDistressVariant(() => i / 200);
        assert.ok(!['trap', 'wreck'].includes(picked), 'the two newest variants are not repeated');
        if (picked === 'fuel') sawOlder = true;
    }
    assert.ok(sawOlder, 'a variant older than the two newest stays eligible');
});

test('tutorials, races, docks and nearby combat suppress a new signal', () => {
    for (const blocked of ['race', 'dock', 'combat']) {
        const s = make();
        s.save.world.distress.nextAt = 100;
        if (blocked === 'race') s.activeRace = {};
        if (blocked === 'dock') s.save.player.dockedAt = 'helix';
        if (blocked === 'combat') s.ships.push({id: 'hostile', hull: 10, hostile: true, position: [...s.save.player.position]});
        tick(s);
        assert.equal(s.save.world.distress.active, null, blocked);
        if (blocked === 'combat') assert.ok(s.save.world.distress.nextAt > 100);
    }
});

test('a signal is only a saved coordinate until answered, then expires without a penalty', () => {
    const s = make();
    s.debugStartDistress('convoy', 0, {phase: 'signal', distance: 2800});
    assert.equal(s.ships.length, 0);
    tick(s);
    assert.equal(s.ships.length, 0, 'nothing spawns while the call is unanswered');
    const active = s.save.world.distress.active;
    active.createdAt = s.save.world.time - 601;
    s.distressTickAt = 0;
    s.updateDistress();
    assert.equal(s.save.world.distress.active, null);
    assert.equal(s.save.world.distress.history[0].outcome, 'declined');
    assert.ok(s.save.world.distress.nextAt >= s.save.world.time + DISTRESS_GAP_MIN);
});

test('disabled ships arrive damaged, so crew help is a real timed repair', () => {
    const s = make();
    s.debugStartDistress('disabled', 0, {phase: 'discovered'});
    atEvent(s);
    const ship = s.ships[0];
    assert.ok(ship.hull < ship.maxHull * .5, 'the machinery failure starts well below the target');
    s.chooseDistress('crew');
    const before = ship.hull;
    s.save.world.time += 1;
    tick(s);
    assert.ok(ship.hull > before && ship.hull < ship.maxHull, 'crew repair advances slowly instead of resolving instantly');
    assert.ok(s.save.world.distress.active);
});

test('damaged distress ships hold station instead of circling', () => {
    const s = make();
    s.debugStartDistress('disabled', 0, {phase: 'discovered'});
    atEvent(s);
    const ship = s.ships.find(entry => entry.distressEventId === s.save.world.distress.active.id);
    ship.velocity = [6, 0, 3];
    const start = [...ship.position];
    for (let i = 0; i < 600; i++) updateShipAI(s, ship, 1 / 60);
    const speed = Math.hypot(...ship.velocity);
    const drift = Math.hypot(...ship.position.map((value, index) => value - start[index]));
    assert.ok(speed < .05, `held ship still has speed ${speed}`);
    assert.ok(drift < 10, `held ship drifted ${drift} km in ten seconds`);
    assert.ok(ship.position.every(Number.isFinite));
});

test('a trap stays disguised until an actual scan reveals it', () => {
    const s = make();
    s.debugStartDistress('trap', 0, {phase: 'discovered'});
    atEvent(s);
    tick(s);
    assert.equal(s.save.world.distress.active.progress.scanRevealed, false);
    assert.equal(s.ships.some(ship => ship.hostile), false);
    assert.equal(s.ships.filter(ship => ship.distressRole === 'pirate').length, 0, 'raiders stay hidden behind the merchant signal');
    s.ships.find(ship => ship.distressRole !== 'pirate').scanned = true;
    tick(s);
    assert.equal(s.save.world.distress.active.progress.scanRevealed, true);
    assert.equal(s.save.world.distress.active.progress.exposed, false);
    s.chooseDistress('scan');
    assert.equal(s.save.world.distress.active.progress.exposed, true);
    const raiders = s.ships.filter(ship => ship.distressRole === 'pirate');
    assert.equal(raiders.length, 2, 'the hidden raiders appear when the trap is exposed');
    assert.ok(raiders.every(ship => ship.hostile && ship.distressTargetId === 'player'));
});

test('convoy contact already fights, pays per surviving ship and never pays twice', () => {
    const s = make();
    s.debugStartDistress('convoy', 0, {phase: 'discovered'});
    const active = s.save.world.distress.active;
    const pirates = s.ships.filter(ship => ship.distressRole === 'pirate');
    const victims = s.ships.filter(ship => ship.distressRole !== 'pirate');
    assert.equal(s.ships.length, 4);
    assert.ok(pirates.every(ship => ship.hostile));
    assert.ok(victims.every(ship => ship.hull < ship.maxHull), 'ships are already damaged when found');
    assert.ok(pirates.every(ship => victims.some(victim => victim.id === ship.distressTargetId)));
    assert.deepEqual(s.chooseDistress('help'), {ok: true});
    assert.equal(active.phase, 'involved');
    const before = s.save.player.credits;
    pirates[0].hull = 0;
    tick(s);
    assert.equal(s.save.world.distress.active, active);
    pirates[1].hull = 0;
    tick(s);
    assert.equal(s.save.world.distress.active, null);
    assert.equal(s.save.player.credits - before, 4000, 'two surviving prospectors');
    assert.equal(s.save.world.distress.history[0].outcome, 'rescued');
    assert.equal(s.monitor, '', 'the finished objective no longer covers the monitor');
    tick(s);
    assert.equal(s.save.player.credits - before, 4000);
});

test('raiders break off their convoy victim to answer fire from the player or another ship', () => {
    const s = make();
    s.debugStartDistress('convoy', 0, {phase: 'discovered'});
    const active = s.save.world.distress.active;
    const raiders = s.ships.filter(ship => ship.distressRole === 'pirate');
    const victims = s.ships.filter(ship => ship.distressRole !== 'pirate');
    const raider = raiders[0];
    const other = raiders[1];
    assert.ok(victims.some(victim => victim.id === raider.distressTargetId), 'the raider starts on its convoy victim');

    s.onDistressActorHit(raider, 'player', 5);
    assert.equal(active.phase, 'involved', 'shooting a raider still means joining the fight');
    assert.equal(raider.distressTargetId, 'player');
    assert.equal(raider.distressAggroTargetId, 'player');
    // The periodic retarget must not undo the response a moment later.
    s.save.world.time += 1;
    tick(s);
    assert.equal(raider.distressTargetId, 'player');
    assert.ok(victims.some(victim => victim.id === other.distressTargetId), 'the other raider keeps pressing the convoy');
    const target = s.distressCombatTarget(raider);
    assert.ok(target);
    assert.equal(raider.targetId, 'player');
    assert.deepEqual(target.position.toArray(), s.save.player.position);

    // A third-party ship is a valid attacker too, not just the player.
    const patrol = s.spawnShip('patrol', [100, 0, 100]);
    const secondHitAt = s.save.world.time;
    s.onDistressActorHit(raider, patrol.id, 5);
    assert.equal(raider.distressAggroTargetId, patrol.id);
    assert.equal(raider.distressAggroUntil, secondHitAt + DISTRESS_RETALIATION_TIME);
    s.save.world.time += 1;
    tick(s);
    assert.equal(raider.distressTargetId, patrol.id);

    // The response is a break-off, not a permanent rewrite of the encounter.
    s.save.world.time += DISTRESS_RETALIATION_TIME + 1;
    tick(s);
    assert.ok(victims.some(victim => victim.id === raider.distressTargetId), 'the raider resumes the convoy target after the window');
    assert.equal(raider.distressAggroTargetId, undefined);
});

test('declining and attacking a neutral leave the rescue unpaid', () => {
    const declined = make();
    declined.debugStartDistress('convoy', 0, {phase: 'discovered'});
    const before = declined.save.player.credits;
    declined.chooseDistress('decline');
    assert.equal(declined.save.world.distress.active, null);
    assert.equal(declined.save.player.credits, before);
    assert.equal(declined.save.world.distress.history[0].outcome, 'declined');
    assert.ok(declined.save.world.distress.nextAt >= 100 + DISTRESS_GAP_MIN && declined.save.world.distress.nextAt <= 100 + DISTRESS_GAP_MAX);

    const betrayed = make();
    betrayed.debugStartDistress('convoy', 0, {phase: 'discovered'});
    const victim = betrayed.ships.find(ship => ship.distressRole !== 'pirate');
    const baseline = betrayed.save.player.credits;
    betrayed.onDistressActorHit(victim, 'player', 5);
    assert.equal(betrayed.save.world.distress.active, null);
    assert.equal(betrayed.save.player.credits, baseline);
    assert.equal(betrayed.save.world.distress.history[0].outcome, 'betrayed');
});

test('fuel transfers deduct the stated reserve once and insufficient tanks are explained', () => {
    const s = make();
    s.debugStartDistress('fuel', 0, {phase: 'discovered', fuel: 40});
    atEvent(s);
    const before = s.save.player.credits;
    assert.deepEqual(s.chooseDistress('transfer'), {ok: true});
    assert.equal(s.save.player.fuel, 32);
    assert.equal(s.save.player.credits - before, 1200);
    assert.equal(s.save.world.distress.active, null);
    assert.equal(s.save.world.distress.history[0].outcome, 'supplied');

    const short = make();
    short.debugStartDistress('fuel', 0, {phase: 'discovered', fuel: 5});
    atEvent(short);
    const oldLanguage = getLanguage();
    setLanguage('en');
    const script = distressDialogue(short.save.world.distress.active.id, short.save);
    assert.match(script.nodes.main.text, /only have 5 units/);
    setLanguage(oldLanguage);
    assert.deepEqual(script.nodes.main.choices.map(choice => choice.distressChoice), ['decline']);
    assert.deepEqual(short.chooseDistress('transfer'), {ok: false});
    assert.ok(short.save.world.distress.active);

    const far = make();
    far.debugStartDistress('fuel', 0, {phase: 'discovered', fuel: 40});
    far.save.player.position = [5000, 0, 0];
    assert.deepEqual(far.chooseDistress('transfer'), {ok: false});
    assert.equal(far.save.player.fuel, 40);
});

test('parts repairs consume normal cargo; a drone repair resolves when the hull target is met', () => {
    const s = make();
    s.debugStartDistress('disabled', 0, {phase: 'discovered', parts: 2});
    atEvent(s);
    const before = s.save.player.credits;
    assert.deepEqual(s.chooseDistress('parts'), {ok: true});
    assert.equal(s.save.player.cargo.machinery ?? 0, 0);
    assert.equal(s.save.player.credits - before, 1800);
    assert.equal(s.save.world.distress.history[0].outcome, 'repaired');

    const drone = make();
    drone.debugStartDistress('disabled', 0, {phase: 'discovered'});
    atEvent(drone);
    assert.deepEqual(drone.chooseDistress('drone'), {ok: true});
    assert.equal(drone.save.world.distress.active.progress.method, 'drone');
    const target = drone.ships[0];
    target.hull = target.maxHull;
    tick(drone);
    assert.equal(drone.save.world.distress.active, null);
    assert.equal(drone.save.world.distress.history[0].outcome, 'repaired');
});

test('a destroyed freighter exposes real cargo and a fly-over survivor pod that pays on docking', () => {
    const s = make();
    s.debugStartDistress('wreck', 0, {phase: 'discovered'});
    atEvent(s);
    assert.equal(s.pickups.length, 1);
    const wreck = Object.values(s.save.world.combatWrecks)[0];
    assert.ok(wreck);
    assert.equal(wreck.contents[0].quantity, 2);
    s.chooseDistress('accept');
    wreck.contents = [];
    tick(s);
    assert.equal(s.save.world.distress.active, null);
    assert.equal(s.save.world.distress.history[0].outcome, 'salvaged');

    const pod = s.pickups[0];
    const before = s.save.player.credits;
    s.collectPickup(pod);
    assert.equal(pod.life, 0);
    assert.equal(s.save.player.sealedCargo.length, 1);
    assert.equal(s.settleDistressSurvivors(), 2000);
    assert.equal(s.save.player.credits - before, 2000);
    assert.equal(s.save.player.sealedCargo.length, 0);
    assert.equal(s.settleDistressSurvivors(), 0);
});

test('a full hold explains why jettisoned cargo cannot be recovered yet', () => {
    const s = make();
    s.debugStartDistress('jettison', 0, {phase: 'discovered', cargo: {water: 999}});
    atEvent(s);
    const oldLanguage = getLanguage();
    setLanguage('en');
    const script = distressDialogue(s.save.world.distress.active.id, s.save);
    assert.match(script.nodes.main.text, /hold is full/i);
    assert.deepEqual(script.nodes.main.choices.map(choice => choice.distressChoice), ['close', 'decline']);
    setLanguage(oldLanguage);
    assert.deepEqual(s.chooseDistress('recover'), {ok: true});
    assert.equal(s.save.world.distress.active.phase, 'discovered', 'the event waits instead of trapping the player');
});

test('jettisoned containers are persistent wrecks; handing them over consumes the real cargo', () => {
    const s = make();
    s.debugStartDistress('jettison', 0, {phase: 'discovered'});
    atEvent(s);
    const wrecks = Object.values(s.save.world.combatWrecks).filter(wreck => wreck.distressEventId === s.save.world.distress.active.id);
    assert.equal(wrecks.length, 3);
    assert.ok(wrecks.every(wreck => wreck.contents[0].commodity === 'electronics'));
    s.chooseDistress('recover');
    s.save.player.cargo.electronics = 3;
    const before = s.save.player.credits;
    assert.deepEqual(s.chooseDistress('handover'), {ok: true});
    assert.equal(s.save.player.cargo.electronics, undefined);
    assert.equal(s.save.player.credits - before, 1600);
    assert.equal(s.save.world.distress.history[0].outcome, 'returned');

    const keep = make();
    keep.debugStartDistress('jettison', 0, {phase: 'discovered'});
    atEvent(keep);
    keep.chooseDistress('keep');
    for (const wreck of Object.values(keep.save.world.combatWrecks)) wreck.contents = [];
    assert.match(distressObjective(keep.save.world.distress.active, keep.save)[1], /Keep the cargo/);
    tick(keep);
    assert.equal(keep.save.world.distress.active, null);
    assert.equal(keep.save.world.distress.history[0].outcome, 'salvaged');
    assert.equal(keep.save.world.distress.history[0].reward, 0);
});

test('disputed salvage can be negotiated or backed without turning both claimants into pirates', () => {
    const s = make();
    s.debugStartDistress('dispute', 0, {phase: 'discovered'});
    atEvent(s);
    assert.ok(s.ships.every(ship => !ship.hostile), 'neither claimant is automatically hostile');
    const before = s.save.player.credits;
    assert.deepEqual(s.chooseDistress('negotiate'), {ok: true});
    assert.equal(s.save.player.credits - before, 1400);
    assert.equal(s.save.world.distress.history[0].outcome, 'settled');

    const side = make();
    side.debugStartDistress('dispute', 0, {phase: 'discovered'});
    atEvent(side);
    const baseline = side.save.player.credits;
    assert.deepEqual(side.chooseDistress('side-a'), {ok: true});
    assert.equal(side.save.player.credits - baseline, 2200);
    const rival = side.ships.find(ship => ship.distressActor === 'gannet');
    assert.equal(rival.hostile, true);
    assert.ok(side.ships.find(ship => ship.distressActor === 'marrow').hostile === false);
    side.onDistressActorHit(rival, 'player', 5);
    assert.ok(side.save.world.distress.active, 'attacking the opposing claimant is part of the deal');
    assert.equal(side.save.world.distress.active.progress.betrayed, false);
    assert.equal(side.save.player.credits - baseline, 2200, 'the advance is not clawed back');
    rival.hull = 0;
    tick(side);
    assert.equal(side.save.world.distress.active, null);
    assert.equal(side.save.player.credits - baseline, 2200, 'the side payment is not repeated');
    assert.equal(side.save.world.distress.history[0].reward, 2200, 'the journal records the advance actually paid');

    const betray = make();
    betray.debugStartDistress('dispute', 0, {phase: 'discovered'});
    atEvent(betray);
    const wallet = betray.save.player.credits;
    betray.chooseDistress('side-a');
    const supported = betray.ships.find(ship => ship.distressActor === 'marrow');
    betray.onDistressActorHit(supported, 'player', 5);
    assert.equal(betray.save.world.distress.active, null);
    assert.equal(betray.save.player.credits, wallet, 'breaking the agreement forfeits the advance');
    assert.equal(betray.save.world.distress.history[0].outcome, 'betrayed');

    const sideB = make();
    sideB.debugStartDistress('dispute', 0, {phase: 'discovered'});
    atEvent(sideB);
    sideB.chooseDistress('side-b');
    const rivalSide = sideB.ships.find(ship => ship.distressActor === 'gannet');
    const enemySide = sideB.ships.find(ship => ship.distressActor === 'marrow');
    assert.equal(rivalSide.hostile, false);
    assert.equal(enemySide.hostile, true);
    enemySide.hull = 0;
    tick(sideB);
    assert.equal(sideB.save.world.distress.active, null);
    assert.equal(sideB.save.world.distress.history[0].outcome, 'settled');

    const reload = make();
    reload.debugStartDistress('dispute', 0, {phase: 'discovered'});
    atEvent(reload);
    reload.chooseDistress('side-b');
    reload.save = hydrateSave(JSON.parse(JSON.stringify(reload.save)));
    reload.ships = [];
    tick(reload);
    assert.equal(reload.ships.find(ship => ship.distressActor === 'marrow').hostile, true, 'the enemy claimant stays hostile after reload');
    assert.equal(reload.ships.find(ship => ship.distressActor === 'gannet').hostile, false, 'the supported claimant stays calm after reload');
});

test('reload restores damaged actors and never returns destroyed ones', () => {
    const s = make();
    s.debugStartDistress('convoy', 0, {phase: 'involved'});
    atEvent(s);
    s.ships[0].hull = 55;
    s.ships[2].hull = 0;
    tick(s);
    const loaded = hydrateSave(JSON.parse(JSON.stringify(s.save)));
    s.save = loaded;
    s.ships = [];
    s.distressTickAt = 0;
    s.updateDistress();
    assert.deepEqual(s.ships.map(ship => [ship.distressActor, ship.hull]), [['lantern-1', 55], ['lantern-2', 186], ['cutlass-2', 240]]);
    assert.equal(s.ships.some(ship => ship.distressActor === 'cutlass-1'), false);
});

test('repeated encounters leave no actors, props or unbounded history behind', () => {
    const s = make();
    for (const variant of ['convoy', 'wreck', 'jettison', 'dispute', 'fuel']) {
        s.debugStartDistress(variant, 0, {phase: 'discovered'});
        atEvent(s);
        s.chooseDistress('decline');
        tick(s);
    }
    assert.equal(s.save.world.distress.active, null);
    assert.ok(s.save.world.distress.history.length <= 8);
    s.save.world.time += 31;
    tick(s);
    assert.equal(s.ships.filter(ship => ship.distressActor).length, 0, 'departed actors are swept');
    assert.equal(Object.values(s.save.world.combatWrecks ?? {}).filter(wreck => wreck.distressEventId && !wreck.derelict).length, 0, 'abandoned containers and claim wrecks do not linger');
    assert.equal(s.wreckNodes.filter(node => node.id.startsWith('wreck-distress-') && !node.derelict).length, 0);
});

test('normalization bounds history and rejects malformed active records', () => {
    const world = {
        time: 10,
        distress: {
            active: {variant: 'not-a-variant', phase: 'involved', position: [0, 0, 0]},
            history: Array.from({length: 20}, (_, index) => ({id: `x${index}`, variant: index % 2 ? 'fuel' : 'bad', setup: 9, outcome: 'declined', at: -5, reward: 1e9})),
            nextAt: -12, counter: -4, lastVariants: ['fuel', 'bad', 'trap', 'wreck'], migrated: true,
        },
    };
    const data = normalizeDistress(world);
    assert.equal(data.active, null);
    assert.equal(data.history.length, 8);
    assert.ok(data.history.every(entry => entry.variant === 'fuel' && entry.reward <= 20000));
    assert.equal(data.nextAt, 0);
    assert.equal(data.counter, 0);
    assert.deepEqual(data.lastVariants, ['fuel', 'trap', 'wreck']);
});

test('repair drones accept neutral event ships but not hostile raiders', () => {
    const s = make();
    s.debugStartDistress('disabled', 0, {phase: 'discovered'});
    atEvent(s);
    const target = s.ships[0];
    target.position = [...s.save.player.position];
    target.position[0] += 20;
    s.save.player.hull = s.playerStats().hull;
    target.hull = 80;
    assert.equal(repairTargetEligible(s, s.save.player, target), true);
    target.hostile = true;
    assert.equal(repairTargetEligible(s, s.save.player, target), false);
    target.hostile = false;
    assert.equal(selectRepairTarget(s, s.save.player, {id: 'drone', position: [...s.save.player.position]}), target);
});

test('every variant opens readable German and English comms with actionable choices', () => {
    for (const variant of DISTRESS_VARIANT_IDS) {
        const s = make();
        s.debugStartDistress(variant, 0, {phase: 'discovered'});
        atEvent(s);
        const active = s.save.world.distress.active;
        const script = distressDialogue(active.id, s.save);
        assert.ok(script, variant);
        for (const node of Object.values(script.nodes)) {
            assert.ok(dialogueText(node.text, 'de').length > 20, variant);
            assert.ok(dialogueText(node.text, 'en').length > 20, variant);
            assert.ok(node.choices?.length >= 2, variant);
            for (const choice of node.choices) {
                assert.ok(choice.distressChoice || choice.next, variant);
                assert.ok(dialogueText(choice.label, 'de').length > 3, variant);
                assert.ok(!Array.isArray(choice.label), `${variant} must localize choice labels`);
            }
        }
        const rows = distressJournal(s.save);
        assert.ok(rows[0]?.actions?.some(action => action.id === 'navigate'), variant);
    }
});

test('guided careers keep the first signal out until the tutorial releases flight', () => {
    const s = make();
    s.save = createNewSave(77, {tutorial: true});
    s.save.player.dockedAt = undefined;
    s.save.world.time = 100;
    s.initializeDistress();
    s.save.world.distress.nextAt = 0;
    tick(s);
    assert.equal(s.save.world.distress.active, null);
});

test('new distress signals stay 3,000–10,000 km away until the player jumps', () => {
    for (const seed of [1, 7, 42, 99, 2026]) {
        const s = make();
        s.save.player.position = [0, 0, 0];
        s.save.player.navTargetId = 'shardbelt';
        s.save.player.rotation = [0, 0, 0, 1];
        let state = seed >>> 0;
        const rng = () => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 2 ** 32;
        };
        const point = s.distressSignalPosition(rng);
        const distance = Math.hypot(point[0], point[1], point[2]);
        assert.ok(distance >= DISTRESS_SIGNAL_MIN_DISTANCE && distance <= DISTRESS_SIGNAL_MAX_DISTANCE, `seed ${seed}: ${distance}`);
        assert.ok(distance > DISTRESS_DISCOVER_RANGE, `seed ${seed}: still a signal at ${distance}`);
    }
    const event = make();
    event.save.player.position = [0, 0, 0];
    event.save.world.time = 100;
    event.beginDistressSignal();
    const active = event.save.world.distress.active;
    assert.equal(active.phase, 'signal');
    assert.equal(event.ships.length, 0, 'a long-range signal stays quiet until contact');
    const distance = Math.hypot(...active.position);
    assert.ok(distance >= DISTRESS_SIGNAL_MIN_DISTANCE && distance <= DISTRESS_SIGNAL_MAX_DISTANCE, `event: ${distance}`);
});

// ------------------------------------------------------- debris escort
// The transport's nav is dead: the pilot projects a beacon route, the
// transport copies the pilot's breadcrumb trail, and the solar front is the
// clock. These tests cover the route, the follow, the shared stray damage and
// both endings.

function escort() {
    const s = make();
    s.playerDamage = 0;
    s.damagePlayer = amount => { s.playerDamage += amount; };
    s.damageShip = (ship, amount) => { ship.hull = Math.max(0, ship.hull - amount); };
    s.renderer = {
        spawnImpact() {}, spawnExplosion() {}, syncShips() {},
        spawnHyperdriveStreak() {}, addCombatLootNode() {}, removeCombatLootNode() {},
    };
    s.debugStartDistress('debris', 0, {phase: 'discovered', distance: 300});
    const active = s.save.world.distress.active;
    const ship = s.ships.find(entry => entry.distressEventId === active.id);
    ship.speed = 60;
    ship.turnRate = 1.2;
    s.chooseDistress('escape');
    return {s, active, ship};
}

test('debris escort plots a beacon route; accepting alongside starts the clock', () => {
    const {s, active} = escort();
    const p = active.progress;
    assert.equal(p.method, 'escape');
    assert.ok(p.route.length >= 6, `route points: ${p.route.length}`);
    assert.ok(p.route.every(point => Array.isArray(point) && point.every(Number.isFinite)));
    // This pilot accepted 300 km out: already alongside, so the transport is
    // linked on the spot and the storm clock runs from acceptance.
    assert.ok(p.joinedAt > 0, 'accepting inside the handover radius links the transport');
    assert.ok(p.burstAt > s.save.world.time, 'the clock starts with the handover');
    assert.equal(p.jumpAt, 0);
    assert.equal(Math.round(p.escortHull * 100), 55);
    const view = s.distressBeaconView();
    assert.equal(view.points.length, p.route.length);
    assert.ok(view.activeIndex >= 1);
    assert.equal(view.range, 4000);
});

test('the final minute drops the far beacons and warns on the radio', () => {
    const {s, active} = escort();
    active.progress.burstAt = s.save.world.time + 59;
    s.updateDistressEscort(1 / 60);
    assert.equal(active.progress.beaconsFailed, true);
    assert.equal(s.distressBeaconView().range, DISTRESS_BEACON_FAIL_RANGE);
});

test('the transport follows the pilot breadcrumb instead of a fixed vector', () => {
    const {s, ship} = escort();
    const start = [...ship.position];
    for (let step = 0; step < 240; step++) {
        s.save.world.time += 1 / 60;
        s.save.player.position[0] += 1.2;
        s.updateDistressEscort(1 / 60);
        updateShipAI(s, ship, 1 / 60);
    }
    assert.ok(ship.position.every(Number.isFinite));
    assert.ok(ship.destination.every(Number.isFinite));
    assert.ok(Math.hypot(ship.position[0] - start[0], ship.position[2] - start[2]) > 20, 'the transport moved');
    const lag = Math.hypot(
        ship.destination[0] - s.save.player.position[0],
        ship.destination[1] - s.save.player.position[1],
        ship.destination[2] - s.save.player.position[2],
    );
    assert.ok(lag > 100 && lag < 260, `trail lag ${lag}`);
});

test('leaving the corridor damages the pilot, then the transport on the same line', () => {
    const {s, active, ship} = escort();
    const p = active.progress;
    // Fly the line once so the tube is armed, then leave it.
    s.save.player.position = [...p.route[1]];
    s.save.world.time += 1 / 60;
    s.updateDistressEscort(1 / 60);
    assert.equal(p.onLine, true);
    const a = p.route[1], b = p.route[2];
    const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz) || 1;
    s.save.player.position = [a[0] - dz / length * 420, a[1] + 40, a[2] + dx / length * 420];
    const hull = ship.hull;
    for (let step = 0; step < 360; step++) {
        s.save.world.time += 1 / 60;
        s.updateDistressEscort(1 / 60);
    }
    assert.ok(s.playerDamage > 0, 'the pilot takes debris damage');
    assert.equal(p.strayed, true);
    ship.position[0] = s.save.player.position[0];
    ship.position[2] = s.save.player.position[2];
    for (let step = 0; step < 180; step++) {
        s.save.world.time += 1 / 60;
        s.updateDistressEscort(1 / 60);
    }
    assert.ok(ship.hull < hull, 'the transport takes delayed damage on the same stray line');
});

test('the solar front destroys a late transport and leaves a persistent wreck', () => {
    const {s, active, ship} = escort();
    active.progress.burstAt = s.save.world.time + 0.01;
    ship.hull = Math.max(1, ship.hull * 0.4);
    s.save.world.time += 0.2;
    s.updateDistressEscort(1 / 60);
    assert.equal(s.save.world.distress.active, null);
    const wreck = Object.values(s.save.world.combatWrecks ?? {}).find(entry => entry.id.endsWith('-lost'));
    assert.ok(wreck, 'the lost transport leaves a wreck');
    assert.equal(wreck.distressPersistent, true);
    assert.equal(s.save.world.distress.history[0].outcome, 'lost');
});

test('a transport at the jump point spins up and pays the rescue', () => {
    const {s, active, ship} = escort();
    const credits = s.save.player.credits;
    ship.position = [...active.progress.route.at(-1)];
    active.progress.burstAt = s.save.world.time + 60;
    s.updateDistressEscort(1 / 60);
    assert.ok(active.progress.jumpAt > 0, 'spin-up started');
    for (let step = 0; step < 540; step++) {
        s.save.world.time += 1 / 60;
        s.updateDistressEscort(1 / 60);
    }
    assert.equal(s.save.world.distress.active, null);
    assert.ok(s.save.player.credits > credits);
    assert.equal(s.save.world.distress.history[0].outcome, 'escaped');
    assert.ok(s.save.world.distress.history[0].reward > 0);
});

test('the escort offer opens itself once the pilot is in comms range', () => {
    const s = make();
    const offered = [];
    s.ui = {...s.ui, showStoryLine: (...args) => offered.push(args)};
    s.debugStartDistress('debris', 0, {phase: 'discovered', distance: 2400});
    const active = s.save.world.distress.active;
    tick(s);
    assert.equal(offered.length, 0, 'out of range: no panel, the journal carries it');
    atEvent(s);
    tick(s);
    assert.equal(offered.length, 1, 'in range: the channel opens');
    assert.equal(offered[0][3], active.id, 'the panel is the event conversation');
    assert.ok(active.progress.briefedAt > 0);
    tick(s);
    assert.equal(offered.length, 1, 'the channel is offered exactly once');
});

test('the offer reads as a contract: objective, storm window, risk and payment', () => {
    const s = make();
    s.debugStartDistress('debris', 0, {phase: 'discovered', distance: 300});
    const active = atEvent(s);
    const node = distressDialogue(active.id, s.save).nodes.main;
    assert.ok(node.mission, 'the offer carries a mission brief');
    assert.equal(node.mission.rows.length, 4);
    const labels = node.mission.rows.map(row => row.label);
    assert.deepEqual(labels, ['AUFGABE', 'FENSTER', 'RISIKO', 'BEZAHLUNG']);
    assert.ok(node.mission.rows.some(row => row.value.includes('3:30')), 'the clock is on the terms');
    assert.ok(node.mission.rows.some(row => row.value.includes('1.600 cr')), 'the payout is on the terms');
    const accept = node.choices.find(choice => choice.distressChoice === 'escape');
    assert.equal(accept.primary, true);
    assert.match(accept.label, /ANNEHMEN/);
});

test('accepting the offer closes the panel and starts the storm clock', () => {
    const s = make();
    s.ui = {...s.ui, showStoryLine() {}};
    s.damagePlayer = () => {};
    s.damageShip = ship => { ship.hull = Math.max(0, ship.hull); };
    s.renderer = {spawnImpact() {}, spawnExplosion() {}, syncShips() {}, spawnHyperdriveStreak() {}, addCombatLootNode() {}, removeCombatLootNode() {}};
    s.debugStartDistress('debris', 0, {phase: 'discovered', distance: 300});
    const active = atEvent(s);
    s.distressTickAt = 0;
    s.updateDistress();
    assert.ok(active.progress.briefedAt > 0, 'the offer opened on approach');
    const result = s.chooseDistress('escape');
    assert.equal(result.ok, true, 'ok closes the panel');
    assert.equal(active.phase, 'involved');
    assert.equal(active.progress.method, 'escape');
    // The offer was accepted 300 km out, so the transport is already alongside:
    // the handover happens with the acceptance and the clock starts at once.
    assert.ok(active.progress.joinedAt > 0, 'alongside means handover');
    assert.ok(active.progress.burstAt > s.save.world.time, 'the clock starts at handover');
    assert.ok(active.progress.route.length >= 6);
});

test('a closed offer stays in the journal instead of popping back up', () => {
    const s = make();
    let opened = 0;
    s.ui = {...s.ui, showStoryLine() { opened++; }};
    s.debugStartDistress('debris', 0, {phase: 'discovered', distance: 300});
    const active = atEvent(s);
    s.distressTickAt = 0;
    s.updateDistress();
    assert.equal(opened, 1);
    // The pilot leaves the conversation with the exit button: the offer is
    // spent, but answering from the journal still works.
    assert.equal(s.distressJournalAction('answer'), true);
    assert.equal(opened, 2);
    s.distressTickAt = 0;
    s.updateDistress();
    assert.equal(opened, 2, 'no auto-hail repeats');
});

test('accepting from long range holds the transport until the pilot comes alongside', () => {
    const s = make();
    s.playerDamage = 0;
    s.damagePlayer = amount => { s.playerDamage += amount; };
    s.damageShip = (ship, amount) => { ship.hull = Math.max(0, ship.hull - amount); };
    s.renderer = {
        spawnImpact() {}, spawnExplosion() {}, syncShips() {},
        spawnHyperdriveStreak() {}, addCombatLootNode() {}, removeCombatLootNode() {},
    };
    s.debugStartDistress('debris', 0, {phase: 'discovered', distance: 1200});
    const active = s.save.world.distress.active;
    const ship = s.ships.find(entry => entry.distressEventId === active.id);
    // Comms range (1,400 km) but far outside the handover distance.
    s.save.player.position = [active.position[0] - 1200, active.position[1], active.position[2]];
    s.chooseDistress('escape');
    assert.equal(active.progress.method, 'escape');
    assert.equal(active.progress.joinedAt, 0);
    assert.equal(active.progress.burstAt, 0, 'the storm clock has not started');
    // A transport with no nav cannot come to the pilot: it holds its patch of
    // the pocket while the pilot closes.
    const holding = [...ship.position];
    for (let step = 0; step < 60; step++) {
        s.save.world.time += 1 / 60;
        s.updateDistressEscort(1 / 60);
    }
    assert.deepEqual(ship.position.map(value => Math.round(value)), holding.map(value => Math.round(value)));
    // The corridor only arms on handover: closing from a distance must not
    // cost hull or the clean-run bonus before the run has started.
    for (let step = 0; step < 240; step++) {
        s.save.world.time += 1 / 60;
        s.updateDistressEscort(1 / 60);
    }
    assert.equal(s.playerDamage, 0);
    assert.equal(active.progress.strayed, false);
    // Alongside, the trail takes over and the tube arms once the pilot is on it.
    s.save.player.position = [...ship.position];
    s.save.world.time += 1 / 60;
    s.updateDistressEscort(1 / 60);
    assert.ok(active.progress.joinedAt > 0);
    assert.ok(active.progress.burstAt > s.save.world.time, 'the handover starts the storm clock');
    assert.equal(active.progress.onLine, true);
    // Joining from 700 km out is still outside the corridor; only a pilot who
    // has flown the line is charged for leaving it.
    active.progress.onLine = false;
    s.save.player.position = [ship.position[0] + 500, ship.position[1], ship.position[2]];
    for (let step = 0; step < 240; step++) {
        s.save.world.time += 1 / 60;
        s.updateDistressEscort(1 / 60);
    }
    assert.equal(s.playerDamage, 0, 'the tube is not armed before the pilot flies the line');
});

test('the monitor says the transport is closing until the handover', () => {
    const s = make();
    s.debugStartDistress('debris', 0, {phase: 'discovered', distance: 300});
    const active = s.save.world.distress.active;
    s.save.player.position = [active.position[0] - 900, active.position[1], active.position[2]];
    s.chooseDistress('escape');
    assert.match(distressText(distressObjective(active, s.save)), /längsseits/);
    active.progress.joinedAt = s.save.world.time;
    assert.match(distressText(distressObjective(active, s.save)), /Bojen folgen/);
});

test('finishing an event clears its dead id from the target panel', () => {
    const s = make();
    s.debugStartDistress('debris', 0, {phase: 'discovered', distance: 300});
    const active = s.save.world.distress.active;
    s.save.player.currentTargetId = active.id;
    s.finishDistress(active, 'withdrawn');
    assert.equal(s.save.player.currentTargetId, undefined);
    assert.equal(s.distressWaypoint(), undefined);
});

test('every distress variant opens its briefing once the pilot reaches comms range', () => {
    for (const variant of DISTRESS_VARIANT_IDS) {
        const s = make();
        const offered = [];
        s.ui = {...s.ui, showStoryLine: (...args) => offered.push(args)};
        s.debugStartDistress(variant, 0, {phase: 'discovered', distance: 2200});
        const active = s.save.world.distress.active;
        // Recorder and signal lines share the story channel; only the event
        // conversation (the id passed as the fourth argument) is the briefing.
        const briefings = () => offered.filter(args => args[3] === active.id);
        tick(s);
        assert.equal(briefings().length, 0, `${variant}: no briefing from outside comms range`);
        atEvent(s);
        tick(s);
        assert.equal(briefings().length, 1, `${variant}: the briefing opens itself on arrival`);
        assert.ok(active.progress.briefedAt > 0, `${variant}: the briefing is spent once shown`);
        tick(s);
        assert.equal(briefings().length, 1, `${variant}: the briefing does not repeat`);
    }
});

test('the briefing names the contact and the situation without spoiling a trap', () => {
    const s = make();
    s.debugStartDistress('wreck', 0, {phase: 'discovered', distance: 300});
    const active = s.save.world.distress.active;
    const node = distressDialogue(active.id, s.save).nodes.main;
    assert.ok(node.mission, 'the wreck briefing carries a scenario card');
    assert.equal(node.mission.kicker, 'NOTRUF · KONTAKT');
    assert.match(node.mission.title, /Cold Harbor/);
    assert.equal(node.mission.rows[0].label, 'LAGE');
    assert.ok(node.mission.rows[0].value.length > 0);

    // A false call must read like any other contact: the card names the
    // vessel, never the authored variant.
    const trap = make();
    trap.debugStartDistress('trap', 0, {phase: 'discovered', distance: 300});
    const trapActive = trap.save.world.distress.active;
    const trapNode = distressDialogue(trapActive.id, trap.save).nodes.main;
    assert.ok(trapNode.mission);
    assert.equal(trapNode.mission.title, 'Frachter Bright Mercy');
    assert.doesNotMatch(trapNode.mission.kicker, /FALSCH|TRAP/i);
    assert.doesNotMatch(trapNode.mission.title, /Falscher Notruf/);
});

test('a fuel briefing waits for transfer range', () => {
    const s = make();
    const offered = [];
    s.ui = {...s.ui, showStoryLine: (...args) => offered.push(args)};
    s.debugStartDistress('fuel', 0, {phase: 'discovered', distance: 1200});
    tick(s);
    assert.equal(offered.length, 0, 'too far to hand over fuel: the card waits');
    atEvent(s);
    tick(s);
    assert.equal(offered.length, 1, 'inside transfer range the card opens');
});

test('an open panel defers the briefing instead of consuming it', () => {
    const s = make();
    const offered = [];
    s.ui = {...s.ui, showStoryLine: (...args) => offered.push(args), adventure: {}};
    s.debugStartDistress('wreck', 0, {phase: 'discovered', distance: 300});
    const active = atEvent(s);
    const briefings = () => offered.filter(args => args[3] === active.id);
    tick(s);
    assert.equal(briefings().length, 0, 'another conversation is still open');
    assert.ok(!active.progress.briefedAt, 'deferring must not spend the hail');
    s.ui.adventure = undefined;
    tick(s);
    assert.equal(briefings().length, 1, 'as soon as the panel closes the briefing arrives');
});

test('the arrival briefing is remembered across a reload', () => {
    const s = make();
    s.ui = {...s.ui, showStoryLine() {}};
    s.debugStartDistress('wreck', 0, {phase: 'discovered', distance: 300});
    const active = atEvent(s);
    tick(s);
    assert.ok(active.progress.briefedAt > 0);
    const world = {distress: JSON.parse(JSON.stringify(s.save.world.distress))};
    const restored = normalizeDistress(world);
    assert.ok(restored.active.progress.briefedAt > 0, 'reloading does not re-open the briefing');
});

test('an alongside acceptance begins on the trail without a holding phase', () => {
    const s = make();
    s.ui = {...s.ui, showStoryLine() {}};
    s.renderer = {spawnImpact() {}, spawnExplosion() {}, syncShips() {}, spawnHyperdriveStreak() {}, addCombatLootNode() {}, removeCombatLootNode() {}};
    s.debugStartDistress('debris', 0, {phase: 'discovered', distance: 300});
    const active = atEvent(s);
    s.chooseDistress('escape');
    assert.ok(active.progress.joinedAt > 0);
    assert.match(distressText(distressObjective(active, s.save)), /Bojen folgen/);
});
