import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve,relative} from 'node:path';
import * as THREE from '../../vendor/three.module.min.js';
import {fixture} from '../helpers/session.mjs';
import {CAPITAL_HULLS} from '../../src/game/capitalHulls.js';
import {updateFrigateBatteries} from '../../src/game/capitalCombat.js';
import {rollNpcCargo, tickTask} from '../../src/game/shipAI.js';
import {EntityStore} from '../../src/game/entityStore.js';
import {loadGame, saveGame} from '../../src/game/save.js';
import {normalizeControllerBindings, defaultControllerBindings} from '../../src/game/controllerBindings.js';
import {stationApproach} from '../../src/game/stationTraffic.js';

function career() {
    const session = fixture();
    session.arena = undefined;
    session.save.player.dockedAt = undefined;
    session.save.player.position = [400,0,0];
    session.save.player.rotation = [0,0,0,1];
    for (const key of ['Avoidance','ShipPos','ShipPlayer','RadarPos','RadarPlayer','AudioLocal'])
        session['tmp'+key] = new THREE.Vector3();
    session.tmpAudioOrientation = new THREE.Quaternion();
    session.hyperdriveInterceptIds = new Set();
    session.pickupStore = new EntityStore(32);
    session.pickups = [];
    session.pickupCounter = 0;
    session.wreckNodes = [];
    session.audio = {play(){}, playAtDirection(){}};
    session.ui = {pushEvent(){}, pushSensor(){}};
    session.chatterOpen = () => false;
    return session;
}

test('saving and resuming a convoy preserves its damaged pod and reduced hold', t => {
    const memory = new Map();
    const original = globalThis.window;
    globalThis.window = {localStorage:{
        getItem:key => memory.get(key) ?? null,
        setItem:(key,value) => memory.set(key,value),
        removeItem:key => memory.delete(key),
    }};
    t.after(() => { if (original) globalThis.window = original; else delete globalThis.window; });
    const session = career();
    session.ensureInitialTraffic();
    const ship = session.ships.find(x => x.variant === 'drover');
    ship.shield = 0;
    const pod = CAPITAL_HULLS.drover.mounts.find(m => m.node === 'pod_0');
    const generator = CAPITAL_HULLS.drover.mounts.find(m => m.kind === 'generator');
    for (const [mount,damage] of [[pod,pod.hull],[generator,10]]) {
        const hit = new THREE.Vector3(...mount.hitCenter).applyQuaternion(new THREE.Quaternion(...ship.rotation));
        session.damageShip(ship, damage, 'environment', hit.add(new THREE.Vector3(...ship.position)).toArray());
    }
    assert.deepEqual(ship.cargo, {electronics:7});
    assert.equal(session.pickups.length, 1);
    // Direct save writers and the normal flight checkpoint must agree.
    for (const persist of [() => saveGame(session.save), () => session.persistSave()]) {
        assert.ok(persist());
        const resumed = career();
        resumed.save = loadGame();
        resumed.ensureInitialTraffic();
        const next = resumed.ships.find(x => x.variant === 'drover');
        assert.equal(next.missingPods, 1);
        assert.equal(next.capitalMountHull[pod.index], 0);
        assert.equal(next.capitalMountHull[generator.index], generator.hull-10);
        assert.equal(next.hull, ship.hull);
        assert.deepEqual(next.cargo, ship.cargo);
        resumed.corvetteSubsystemDestroyed(next, pod.index);
        assert.equal(resumed.pickups.length, 0);
    }
    session.renderer.spawnExplosion = () => {};
    session.destroyShip(ship, 'environment');
    assert.ok(session.persistSave());
    const resumed = career();
    resumed.save = loadGame();
    resumed.ensureInitialTraffic();
    assert.ok(!resumed.ships.some(ship => ship.variant === 'drover'), 'destroyed traffic must stay consumed');
});

test('trading never fills a Drover with six detached pods', () => {
    const session = career(), ship = session.spawnCorvette('drover', [0,0,0]);
    ship.shield = 0;
    ship.rotation = [0,0,0,1];
    const full = rollNpcCargo(ship, session);
    for (const pod of CAPITAL_HULLS.drover.mounts.filter(m => m.kind === 'pod')) {
        session.damageShip(ship, pod.hull, 'environment', pod.hitCenter);
        if (pod.node !== 'pod_2') continue;
        const half = rollNpcCargo(ship, session);
        for (const [commodity,amount] of Object.entries(full))
            assert.equal(half[commodity] ?? 0, 3*Math.floor(amount/6) + Math.max(0,amount%6-3));
    }
    ship.task.port = 'rook';
    ship.task.phase = 'leg';
    ship.position = [...stationApproach('rook')];
    tickTask(ship, session, null);
    assert.equal(ship.task.phase, 'dwell');
    session.save.world.time = ship.task.dwellUntil+1;
    tickTask(ship, session, null);
    assert.deepEqual(ship.cargo, {});
});

test('observer selects both corvette variants by their shipping identity', () => {
    const session = fixture();
    for (const id of ['drover','ironjaw']) assert.equal(session.observerShipType(id)?.capitalVariant, id);
    assert.equal(session.observerShipType('unknown-hull'), undefined);
    assert.equal(session.spawnObserverDraftUnit({shipType:'unknown-hull'}), undefined);
    assert.equal(session.ships.length, 0);
});

test('a migrated custom Map button has priority over the new subsystem default', () => {
    const old = defaultControllerBindings();
    delete old.flight.capitalSubtarget;
    old.flight.map = 11;
    const after = normalizeControllerBindings(old);
    assert.equal(after.flight.map, 11);
    assert.equal(after.flight.capitalSubtarget, null);
    old.flight.map = 8;
    assert.equal(normalizeControllerBindings(old).flight.capitalSubtarget, 11);
});

test('torpedo aspect cannot rotate the owning frigate’s gun seats', () => {
    const session = career(), ship = session.spawnCapitalShip('concord-frigate', [0,0,0], 'rook');
    session.save.world.time = 13;
    const player = session.save.player;
    player.position = [0,0,-380];
    player.shipId = 'atlas';
    player.rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), Math.PI/2).toArray();
    ship.rotation = [0,0,0,1];
    ship.targetId = 'player';
    ship.hostile = true;
    const mounted = [];
    session.renderer.showTurret = (id,position,direction,size,kind,rotation) => {
        if (!id.includes('-main-')) return;
        const index = Number(id.split('-').at(-1));
        const local = position.clone().applyQuaternion(rotation.clone().invert());
        const socket = CAPITAL_HULLS['concord-frigate'].mounts[index].localPosition;
        assert.ok(local.distanceTo(new THREE.Vector3(...socket)) < .001, 'battery left its socket');
        mounted.push(index);
    };
    updateFrigateBatteries(session,ship,1/60,new THREE.Vector3(...player.position),new THREE.Vector3());
    assert.ok(ship.combatFit.lock > 0);
    assert.equal(mounted.length, 4);
});

test('an Ironjaw searching a last-known position cannot shoot the dark player', () => {
    const session = career(), ship = session.spawnCorvette('ironjaw', [0,0,0]);
    session.save.player.transponder = false;
    session.playerDriveHeat = session.playerEmissionHeat = 0;
    Object.assign(ship, {rotation:[0,0,0,1], hostile:true, targetId:'player', playerAwareness:0,
        playerTrackOccluded:false, resolvedPlayerLast:false});
    session.beginSearch(ship, [0,0,-300], 'hostile');
    session.resolveNpcCollisions = () => {};
    session.getAvoidanceVector = () => new THREE.Vector3();
    for (const hook of ['maybeRecognitionLine','maybeProximityLine','maybePilotLine','maybeNeutralChatter','announceSearchStart'])
        session[hook] = () => {};
    const shots = [];
    session.spawnGunProjectile = (owner,weapon,start,dir,velocity,target) => {
        if (weapon.id === 'corvette-broadside') shots.push(target);
    };
    for (let i=0; i<240; i++) {
        session.save.world.time += 1/60;
        session.updateShips(1/60);
    }
    assert.equal(session.shipTracksPlayer(ship), false);
    assert.deepEqual(shots, []);
});

test('the title static import graph excludes flight collision data', () => {
    const pending = [resolve('src/main.js')], seen = new Set();
    const staticImport = /(?:^|\n)\s*(?:import\s+(?:[^;'"]*?\s*from\s*)?|export\s+(?:\{[^}]*\}|\*)\s*from\s*)['"](\.[^'"]+)['"]/g;
    while (pending.length) {
        const file = pending.pop();
        if (seen.has(file)) continue;
        seen.add(file);
        for (const match of readFileSync(file,'utf8').matchAll(staticImport))
            pending.push(resolve(dirname(file),match[1]));
    }
    const modules = [...seen].map(file => relative(process.cwd(),file));
    for (const name of ['shipCollisionData','graveyardCollisionProfiles','capitalMarkers'])
        assert.ok(!modules.includes('src/game/'+name+'.js'), name);
});
