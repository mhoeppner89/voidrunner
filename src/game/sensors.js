// Sensor and emission model shared by the live game and deterministic tests.
// All helpers are scalar-only so the per-ship AI can use them without
// allocating vectors or temporary objects in its hot path.

export const SENSOR_HORIZON = 1000;
export const SENSOR_CONTACT_THRESHOLD = 0.16;
export const SENSOR_TRACK_THRESHOLD = 0.52;
export const SENSOR_IDENTIFY_THRESHOLD = 0.82;
export const SENSOR_CLOSE_VISUAL_RANGE = 70;

const BASE_SIGNATURE_BY_VARIANT = Object.freeze({
    kestrel: 105,
    talon: 125,
    lancer: 155,
    warden: 180,
    prospector: 210,
    'atlas-freighter': 260,
    'concord-frigate': 520,
    'concord-cruiser': 720,
    'concord-carrier': 850,
    'concord-battleship': 920,
});

const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const damp = (current, target, sharpness, dt) => target + (current - target) * Math.exp(-sharpness * Math.max(0, dt));

export const baseSignatureForVariant = (variant) => BASE_SIGNATURE_BY_VARIANT[variant] ?? 150;

// Drive heat follows power demand, not velocity. This is important for the
// hybrid flight model: boost, cut thrust, and coast keeps momentum while the
// hot drive gradually becomes quiet again.
export function stepDriveHeat(current, throttle, afterburning, dt) {
    const demand = clamp01(throttle);
    const target = Math.min(430, demand * demand * 315 + (afterburning ? 185 : 0));
    const sharpness = target > current ? 3.2 : 0.32;
    return damp(Math.max(0, current || 0), target, sharpness, dt);
}

export function stepEmissionHeat(current, dt) {
    return Math.max(0, (current || 0) - Math.max(0, dt) * 78);
}

export function addEmissionHeat(current, amount) {
    return Math.min(520, Math.max(0, current || 0) + Math.max(0, amount || 0));
}

export function physicalSignatureRange({
    variant,
    driveHeat = 0,
    emissionHeat = 0,
    utilityActive = false,
    hyperdriveActive = false,
    damagedFraction = 0,
    environmentMask = 1,
    horizon = SENSOR_HORIZON,
}) {
    return physicalSignatureRangeValues(variant, driveHeat, emissionHeat, utilityActive, hyperdriveActive, damagedFraction, environmentMask, horizon);
}

export function physicalSignatureRangeValues(
    variant,
    driveHeat = 0,
    emissionHeat = 0,
    utilityActive = false,
    hyperdriveActive = false,
    damagedFraction = 0,
    environmentMask = 1,
    horizon = SENSOR_HORIZON,
) {
    const machinery = Math.max(0, driveHeat) + Math.max(0, emissionHeat);
    const utility = utilityActive ? 420 : 0;
    const drive = hyperdriveActive ? horizon : 0;
    const damage = clamp01(damagedFraction) * 150;
    const raw = Math.max(drive, baseSignatureForVariant(variant) + machinery + utility + damage);
    return Math.max(SENSOR_CLOSE_VISUAL_RANGE, Math.min(horizon, raw * Math.max(0.55, Math.min(1, environmentMask))));
}

export function npcPhysicalSignatureRange({ variant, speed = 0, maxSpeed = 1, emissionHeat = 0, burning = false, horizon = SENSOR_HORIZON }) {
    return npcPhysicalSignatureRangeValues(variant, speed, maxSpeed, emissionHeat, burning, horizon);
}

export function npcPhysicalSignatureRangeValues(variant, speed = 0, maxSpeed = 1, emissionHeat = 0, burning = false, horizon = SENSOR_HORIZON) {
    const speedFraction = maxSpeed > 0 ? clamp01(speed / maxSpeed) : 0;
    return physicalSignatureRangeValues(variant, speedFraction * speedFraction * 280, (emissionHeat || 0) + (burning ? 260 : 0), false, false, 0, 1, horizon);
}

export function signatureBand(range, horizon = SENSOR_HORIZON) {
    const fraction = Math.max(0, range) / Math.max(1, horizon);
    if (fraction < 0.28)
        return 'low';
    if (fraction < 0.62)
        return 'medium';
    return 'high';
}

export function awarenessState(awareness) {
    if (awareness >= SENSOR_IDENTIFY_THRESHOLD)
        return 'identified';
    if (awareness >= SENSOR_TRACK_THRESHOLD)
        return 'tracked';
    if (awareness >= SENSOR_CONTACT_THRESHOLD)
        return 'contact';
    return 'hidden';
}

// A transponder resolves identity immediately once its signal has a clear path.
// A dark signature instead builds from a faint contact into a firing-quality
// track. At the edge this takes several seconds; close passes resolve quickly.
// Cover and leaving the signature envelope bleed the track away rather than
// popping it on/off in one frame.
export function stepSensorAwareness(current, distance, signatureRange, occluded, identityBroadcasting, dt) {
    let next = clamp01(current);
    const closeVisual = distance <= SENSOR_CLOSE_VISUAL_RANGE;
    const inside = distance <= Math.max(SENSOR_CLOSE_VISUAL_RANGE, signatureRange);
    if (!occluded && inside) {
        if (identityBroadcasting)
            return 1;
        const proximity = closeVisual ? 1 : clamp01(1 - distance / Math.max(1, signatureRange));
        const gain = 0.12 + proximity * proximity * 1.55;
        next += gain * Math.max(0, dt);
    }
    else {
        // Occlusion sheds a firing solution faster than an out-of-range signal,
        // but retains a brief last-known trace for search behavior.
        const decay = occluded ? 0.24 : 0.14;
        next -= decay * Math.max(0, dt);
    }
    return clamp01(next);
}
