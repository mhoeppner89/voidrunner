import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
    LANDING_CAPTURE_SPEED,
    beginPlayerDocking,
    landingCaptureReady,
    playerBerth,
    playerBerths,
    nearestPlayerBerth,
    preparePlayerLaunch,
    stepPlayerDocking,
} from '../../src/game/playerDocking.js';
import { LOCATIONS, hyperdriveArrivalRadius } from '../../src/game/data.js';
import { STATION_DOCKS } from '../../src/game/stationDocks.js';
import {stationRotatePoint} from '../../src/game/stationOrientation.js';
import { stationVisualSurfaceRadius } from '../../src/game/stationTraffic.js';
import { GameSession } from '../../src/game/game.js';

const stationReports = JSON.parse(readFileSync(new URL('../fixtures/station-models.json', import.meta.url)));

function fixture(id) {
    const location = LOCATIONS[id];
    return {
        save: {
            player: {
                position: [location.position[0], location.position[1], location.position[2] - hyperdriveArrivalRadius(location)],
                rotation: [0, 1, 0, 0],
                velocity: [0, 0, 0],
                angularVelocity: [0, 0, 0],
                throttle: 0,
            },
        },
        playerHullExtents: () => [2, 6, 5],
        dockAt(id, landed) { this.completed = { id, landed }; },
    };
}

for (const id of Object.keys(STATION_DOCKS)) {
    test(`${id}: legacy capture respects the berth and cinematic launch returns control outside the station`, () => {
        const session = fixture(id);
        const berths = playerBerths(id, 6);
        assert.equal(berths.length, 1, 'station has one private player berth');
        assert.equal(STATION_DOCKS[id].lanes.length, 2, 'NPCs retain separate traffic lanes');
        for (const candidate of berths)
            assert.equal(nearestPlayerBerth(id, candidate.pad, 6).padIndex, candidate.padIndex);
        const berth = berths.at(-1);

        assert.equal(beginPlayerDocking(session, id), false, 'a distant approach does not start docking');
        assert.ok(landingCaptureReady(berth.pad, [0, 0, 0], berth));
        assert.equal(landingCaptureReady(berth.pad, [LANDING_CAPTURE_SPEED + 0.01, 0, 0], berth), false);
        assert.equal(landingCaptureReady([berth.pad[0] + berth.captureRadius + 1, berth.pad[1], berth.pad[2]], [0, 0, 0], berth), false);

        session.stationLandingBerth = berth;
        session.save.player.position = [berth.pad[0] + berth.captureRadius * 0.5, berth.pad[1], berth.pad[2]];
        assert.ok(beginPlayerDocking(session, id), 'a stopped ship inside the capture radius starts assisted touchdown');
        assert.equal(session.save.player.stationPadIndex, berth.padIndex, 'the selected landing spot is saved for launch');
        for (let i = 0; i < 100 && session.playerDocking; i++) {
            stepPlayerDocking(session, 1 / 60);
            assert.ok(session.save.player.position.every(Number.isFinite));
        }
        assert.deepEqual(session.completed, { id, landed: true });
        assert.deepEqual(session.save.player.position, berth.pad);
        assert.deepEqual(session.save.player.velocity, [0, 0, 0]);

        const launchBerth = preparePlayerLaunch(session, id);
        assert.ok(launchBerth);
        const beyond=new THREE.Vector3(...session.save.player.position).sub(new THREE.Vector3(...launchBerth.gate));
        assert.ok(beyond.length()>=59.999,'control resumes beyond the outer gate');
        assert.ok(Math.abs(Math.hypot(...session.save.player.velocity)-6)<1e-9);
        assert.deepEqual(session.save.player.angularVelocity, [0, 0, 0]);
        assert.equal(session.save.player.throttle, .18);
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().fromArray(session.save.player.rotation));
        const gateDirection = new THREE.Vector3(...launchBerth.gate).sub(new THREE.Vector3(...launchBerth.pad)).normalize();
        assert.ok(forward.distanceTo(gateDirection) < 1e-5, 'launch faces away from the station');assert.ok(beyond.dot(forward)>59.99);
        assert.equal(session.autopilot, false);
        assert.equal(session.afterburning, false);
    });
}

test('planet arrivals retain existing behavior', () => {
    const session = fixture('vesper');
    assert.equal(beginPlayerDocking(session, 'vesper'), false);
    assert.equal(preparePlayerLaunch(session, 'vesper'), null);
    assert.equal(hyperdriveArrivalRadius(LOCATIONS.vesper), LOCATIONS.vesper.radius + 7000);
});

test('station hyperdrive arrivals leave room for the full landing beacon approach', () => {
    for (const id of Object.keys(STATION_DOCKS)) {
        const location = LOCATIONS[id];
        const surfaceClearance = hyperdriveArrivalRadius(location) - stationVisualSurfaceRadius(id);
        assert.ok(surfaceClearance >= 400, `${id} drops ${surfaceClearance.toFixed(1)} km from the visible hull`);
    }
});

test('Helix beacon lane clears the station hull while off-lane contact still collides', () => {
    const location = LOCATIONS.helix;
    const berth = playerBerth('helix', 6);
    const session = Object.create(GameSession.prototype);
    Object.assign(session, {
        save: { player: { rotation: [0, 0, 0, 1], transponder: true } },
        activeInstanceId: 'helix',
        currentDockLocationIds: () => ['helix'],
        playerHullExtents: () => [12, 16, 22],
        collisionMessageCooldown: 0,
        autopilot: false,
        stationLandingBeaconId: 'helix',
        stationLandingBerth: berth,
        damagePlayer() {},
        ui: { pushEvent() {} },
        tmpCollide: new THREE.Vector3(),
    });
    const dock = session.activeDockObstacle();
    assert.equal(dock.collisionRadius, location.radius * 0.72);
    const inside = new THREE.Vector3(...berth.pad);
    assert.ok(inside.distanceTo(new THREE.Vector3(...location.position)) < dock.collisionRadius + 22,
        'the ship hull overlaps the station collision envelope at touchdown');
    const velocity = new THREE.Vector3();
    const before = inside.clone();
    session.resolvePlayerCollisions(inside, velocity);
    assert.ok(inside.distanceTo(before) < 1e-9, 'the marked hangar lane stays clear');

    session.stationLandingBeaconId = undefined;
    // Test a solid fallback wall, not an open pad with invented oversized hulls.
    const offLane = new THREE.Vector3(...location.position);
    offLane.x += dock.collisionRadius*.95;
    const offLaneBefore = offLane.clone();
    session.resolvePlayerCollisions(offLane, velocity);
    assert.ok(offLane.distanceTo(offLaneBefore) > 0, 'the station hull still blocks an unmarked approach');
});

test('Helix landing gates enter through the authored hangar mouth', () => {
    const location = LOCATIONS.helix;
    const spec = STATION_DOCKS.helix;
    const scale = stationVisualSurfaceRadius('helix') / spec.radius;
    const report = stationReports.helix;
    const hangar = report.concourse.hall;
    const floorTop = report.concourse.touchdowns[0][2];
    const roofBottom = floorTop + report.portalHeight;
    const halfShipHeight = 6 / scale;

    assert.equal(stationVisualSurfaceRadius('helix'), location.radius * 0.95);
    for (const berth of playerBerths('helix', 6)) {
        const toModel = (world) => {const point=stationRotatePoint('helix',world,location.position,true);return [
            (point[0] - location.position[0]) / scale,
            -(point[2] - location.position[2]) / scale,
            (point[1] - location.position[1]) / scale,
        ];};
        const pad = toModel(berth.pad);
        const gate = toModel(berth.gate);
        const mouthY = hangar.front;
        assert.ok(pad[1] > mouthY && pad[1] < hangar.back && Math.abs(pad[0]) < hangar.width / 2,
            `${berth.label} touchdown is inside the actual hangar floor bounds`);
        const t = (mouthY - gate[1]) / (pad[1] - gate[1]);
        const crossing = gate.map((value, axis) => value + (pad[axis] - value) * t);

        assert.ok(t > 0 && t < 1, `${berth.label} route crosses the hangar entrance`);
        assert.ok(Math.abs(crossing[0]) < report.portalWidth / 2 - 1, `${berth.label} fits between the hangar jambs`);
        assert.ok(crossing[2] - halfShipHeight >= floorTop - 1e-6, `${berth.label} clears the hangar floor`);
        assert.ok(crossing[2] + halfShipHeight <= roofBottom + 1e-6, `${berth.label} clears the hangar roof`);
    }
});

test('station approach starts the film near the outer hull, without requiring a manual pad landing',()=>{
 const s=Object.create(GameSession.prototype),id='helix',l=LOCATIONS[id];let docked=0;
 Object.assign(s,{save:{player:{position:[l.position[0],l.position[1],l.position[2]+stationVisualSurfaceRadius(id)+150],velocity:[0,0,7],currentTargetId:id,systemId:l.systemId,transponder:true}},renderer:{setLandingGuide(){}},currentDockLocationIds:()=>[id],activeInstanceId:id,dockAt:()=>docked++});
 s.updateStationLandingGuidance();assert.equal(s.stationLandingClearanceGranted,true);s.autoDockCheck();assert.equal(docked,1);
 s.save.player.velocity[2]=9;s.autoDockCheck();assert.equal(docked,1,'fast flybys do not dock');s.save.player.velocity[2]=0;s.save.player.currentTargetId=undefined;s.autoDockCheck();assert.equal(docked,1,'requires a deliberate station lock');
 s.save.player.currentTargetId=id;s.save.player.transponder=false;s.darkDockPolicy=()=> 'deny';s.updateStationLandingGuidance();assert.equal(s.stationLandingClearanceGranted,false);s.autoDockCheck();assert.equal(docked,1,'restricted stations still require a transponder');
 s.darkDockPolicy=()=> 'syndicate';s.updateStationLandingGuidance();s.autoDockCheck();assert.equal(docked,2,'syndicate payment is handled after docking');
 s.save.player.raceReturn={};s.autoDockCheck();assert.equal(docked,2,'a race never initiates station docking');
});
