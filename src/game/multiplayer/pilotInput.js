import { weaponForSlot } from '../weapons.js';

// At 60 Hz this leaves 350 ms for a fresh input packet before releasing
// controls on a paused, backgrounded, or disconnected client.
const INPUT_TIMEOUT_STEPS = 21;
const IDLE_ACTIONS = Object.freeze({
    pitch: 0,
    yaw: 0,
    roll: 0,
    throttleDelta: 0,
    afterburner: false,
    fire: false,
    flightAssist: true,
    aimAssist: true,
});

function boundedNumber(value, min, max) {
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0;
}

export function createPilotInput() {
    return { sequence: -1, receivedAt: -Infinity, held: IDLE_ACTIONS, edges: {} };
}

export function clearPilotInput(input) {
    input.receivedAt = -Infinity;
    input.held = IDLE_ACTIONS;
    input.edges = {};
}

export function acceptPilotInput(input, packet, step) {
    const sequence = packet?.sequence;
    if (!Number.isSafeInteger(sequence) || sequence <= input.sequence) return false;

    input.sequence = sequence;
    input.receivedAt = step;
    input.held = {
        pitch: boundedNumber(packet.pitch, -1, 1),
        yaw: boundedNumber(packet.yaw, -1, 1),
        roll: boundedNumber(packet.roll, -1, 1),
        // Keyboard and controller can contribute at the same time.
        throttleDelta: boundedNumber(packet.throttleDelta, -.88, .88),
        afterburner: packet.afterburner === true,
        fire: packet.fire === true,
        flightAssist: packet.flightAssist !== false,
        aimAssist: packet.aimAssist !== false,
    };

    const edges = input.edges;
    if (Number.isFinite(packet.throttleSet)) edges.throttleSet = boundedNumber(packet.throttleSet, 0, 1);
    if (Number.isInteger(packet.weaponSelect) && weaponForSlot(packet.weaponSelect))
        edges.weaponSelect = packet.weaponSelect;
    if (packet.weaponCycle === true) edges.weaponCycle = true;
    if (packet.launcherCycle === true) edges.launcherCycle = true;
    if (packet.missile === true) edges.missile = true;
    if (packet.targetId === null || (typeof packet.targetId === 'string' && packet.targetId.length <= 64))
        edges.targetId = packet.targetId;
    return true;
}

export function takePilotActions(input, step) {
    if (step - input.receivedAt >= INPUT_TIMEOUT_STEPS) {
        clearPilotInput(input);
        return IDLE_ACTIONS;
    }

    const actions = { ...input.held, ...input.edges };
    input.edges = {};
    return actions;
}
