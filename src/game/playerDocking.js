import * as THREE from 'three';
import { LOCATIONS } from './data.js';
import { STATION_DOCKS } from './stationDocks.js';
import { stationPlayerBerths } from './stationTraffic.js';

export const LANDING_CAPTURE_SPEED = 1.5;
export const LANDING_ASSIST_SECONDS = 1.25;

// Player pads are authored on hangar floors and platform decks. Keep each
// marked spot out of the NPC lane and use a separate approach vector.
export function playerBerths(id, height = 2) {
    const spec = STATION_DOCKS[id], location = LOCATIONS[id];
    if (!spec || !location) return [];
    const scale = location.radius * (id === 'blackglass' ? .2 : .95) / spec.radius;
    return stationPlayerBerths(id, height).map((berth, padIndex) => {
        const padSpec = (spec.playerPads ?? spec.lanes)[padIndex];
        berth.id = id;
        berth.height = height;
        berth.captureRadius = Math.max(18, padSpec[3] * scale * .55);
        // The marking sits on the authored deck, below ship-center height.
        berth.surface = [berth.pad[0], berth.pad[1] - height, berth.pad[2]];
        berth.corridorRadius = Math.max(berth.captureRadius * 1.2, height * 3, 16);
        return berth;
    });
}

export function playerBerth(id, height = 2, padIndex = 0) {
    return playerBerths(id, height)[padIndex] ?? null;
}

export function nearestPlayerBerth(id, position, height = 2) {
    const berths = playerBerths(id, height);
    let nearest, nearestDistance = Infinity;
    for (const berth of berths) {
        const distance = Math.hypot(
            position[0] - berth.pad[0],
            position[1] - berth.pad[1],
            position[2] - berth.pad[2],
        );
        if (distance < nearestDistance) {
            nearest = berth;
            nearestDistance = distance;
        }
    }
    return nearest;
}

export function landingCaptureReady(position, velocity, berth) {
    if (!berth) return false;
    const distance = Math.hypot(
        position[0] - berth.pad[0],
        position[1] - berth.pad[1],
        position[2] - berth.pad[2],
    );
    return distance <= berth.captureRadius
        && Math.hypot(velocity[0], velocity[1], velocity[2]) <= LANDING_CAPTURE_SPEED;
}

const v = new THREE.Vector3();
const start = new THREE.Vector3();
const end = new THREE.Vector3();
const direction = new THREE.Vector3();
const q = new THREE.Quaternion();
const rotation = new THREE.Quaternion();
const forward = new THREE.Vector3(0, 0, -1);
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// Called only after the player reaches the berth capture area and nearly stops.
// The short assisted glide finishes the landing without taking over the whole
// approach.
export function beginPlayerDocking(session, id, selectedBerth = session.stationLandingBerth) {
    const p = session.save.player;
    const berth = selectedBerth?.id === id
        ? selectedBerth
        : playerBerth(id, session.playerHullExtents()[1], p.stationPadIndex ?? 0);
    if (!landingCaptureReady(p.position, p.velocity, berth)) return false;
    direction.set(
        berth.pad[0] - berth.gate[0],
        berth.pad[1] - berth.gate[1],
        berth.pad[2] - berth.gate[2],
    ).normalize();
    q.setFromUnitVectors(forward, direction);
    session.playerDocking = {
        id,
        ...berth,
        time: 0,
        start: [...p.position],
        rotation: [...p.rotation],
        landingRotation: q.toArray(),
    };
    p.stationPadIndex = berth.padIndex ?? 0;
    p.velocity.fill(0);
    p.angularVelocity.fill(0);
    p.throttle = 0;
    session.autopilot = false;
    session.afterburning = false;
    session.stationLandingGuideId = undefined;
    session.stationLandingBerth = undefined;
    session.renderer?.setLandingGuide?.(null);
    return true;
}

export function stepPlayerDocking(session, dt) {
    const d = session.playerDocking;
    if (!d) return false;
    const p = session.save.player;
    d.time += dt;
    const t = smooth(d.time / LANDING_ASSIST_SECONDS);
    v.lerpVectors(start.fromArray(d.start), end.fromArray(d.pad), t);
    rotation.fromArray(d.rotation).slerp(q.fromArray(d.landingRotation), t);
    for (let i = 0; i < 3; i++) {
        const value = v.getComponent(i);
        p.velocity[i] = (value - p.position[i]) / dt;
        p.position[i] = value;
    }
    rotation.toArray(p.rotation);
    p.throttle = 0;
    if (d.time >= LANDING_ASSIST_SECONDS) {
        p.position.splice(0, 3, ...d.pad);
        p.velocity.fill(0);
        delete session.playerDocking;
        session.dockAt(d.id, true);
    }
    return true;
}

// A station launch now releases the pilot at the marked pad. The Launch button
// starts the flight with engines at idle and the ship facing the clearance gate.
export function preparePlayerLaunch(session, id) {
    const p = session.save.player;
    const height = session.playerHullExtents()[1];
    const berth = playerBerth(id, height, p.stationPadIndex ?? 0) ?? playerBerth(id, height, 0);
    if (!berth) return null;
    direction.set(
        berth.gate[0] - berth.pad[0],
        berth.gate[1] - berth.pad[1],
        berth.gate[2] - berth.pad[2],
    ).normalize();
    q.setFromUnitVectors(forward, direction).toArray(p.rotation);
    p.position.splice(0, 3, ...berth.pad);
    p.velocity.fill(0);
    p.angularVelocity.fill(0);
    p.throttle = 0;
    session.autopilot = false;
    session.afterburning = false;
    session.stationLandingGuideId = undefined;
    session.stationLandingBerth = undefined;
    session.renderer?.setLandingGuide?.(null);
    return berth;
}
