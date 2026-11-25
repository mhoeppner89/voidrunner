import * as THREE from 'three';
import { FRIGATE_MOUNTS } from './frigateMounts.js';
import { CRUISER_MOUNTS } from './cruiserModelData.js';
import { CORVETTES } from './corvetteMounts.js';
import { t } from './i18n.js';

export const FRIGATE_EXTENTS = [37.46, 44.92, 112.9];

// Place the sightline on the visible assembly, clear of its mounting surface.
// Frigate sockets are normalized to hull extents. Other hulls use flight units.
function markerLift(mount, frigate, radius) {
    if (mount.kind === 'engine' && mount.halfLength) return mount.halfLength;
    if (typeof mount.size === 'number') return mount.size * .75;
    if (mount.visualScale) return mount.visualScale;
    if (frigate && (mount.kind === 'generator' || mount.kind === 'torpedo')) return (mount.hitOffset ?? 3) + 1;
    if (frigate && mount.size) return radius * .65;
    return .12;
}

function define(sockets, readout, extents) {
    const counts = {};
    const mounts = sockets.map((socket, index) => {
        const { kind } = socket;
        const serial = counts[kind] = (counts[kind] ?? 0) + 1;
        const hull = socket.hull ?? (kind === 'battery' ? 100 : 65);
        const radius = socket.radius ?? (kind === 'battery' ? 6.2 : 4);
        const labelKey = socket.label === 'MAIN BATTERY' || socket.label === 'PDC'
            ? kind.toUpperCase() + ' ' + serial : socket.label;
        const normal = socket.normal ?? [0, 1, 2].map(a => a === (socket.axis ?? 2) ? socket.side ?? 1 : 0);
        const localPosition = socket.position.map((n, axis) => n * (extents?.[axis] ?? 1));
        const deckSystem = extents && (kind === 'generator' || kind === 'torpedo');
        const offset = socket.hitCenterOffset ?? (deckSystem ? [0, socket.side * (socket.hitOffset ?? 3), 0] : [0, 0, 0]);
        const hitCenter = localPosition.map((n, axis) => n + offset[axis]);
        const lift = markerLift(socket, extents, radius);
        const markerPosition = localPosition.map((n, axis) => n + normal[axis] * lift);
        const targetable = kind === 'generator' || kind === 'engine';
        const compact = targetable ? (kind === 'generator' ? 'SHIELD ' : 'ENGINE ') + serial : undefined;
        return { ...socket, index, hull, radius, labelKey, compact, normal, localPosition, hitCenter, markerPosition, targetable };
    });
    const engines = mounts.filter(m => m.kind === 'engine');
    const weapons = mounts.filter(m => ['battery', 'pdc', 'laser', 'broadside'].includes(m.kind));
    return { mounts, engines, weapons, readout };
}

export const CAPITAL_HULLS = {
    'concord-frigate': define(FRIGATE_MOUNTS, 'BATTERIES {guns}/4 · PDC {pdc}/4', FRIGATE_EXTENTS),
    'concord-cruiser': define(CRUISER_MOUNTS, 'BATTERIES {guns}/4 · PDC {pdc}/6'),
    drover: define(CORVETTES.drover.mounts, CORVETTES.drover.readout),
    ironjaw: define(CORVETTES.ironjaw.mounts, CORVETTES.ironjaw.readout),
};

const classDefaults = { frigate: CAPITAL_HULLS['concord-frigate'], cruiser: CAPITAL_HULLS['concord-cruiser'] };
export function capitalHull(ship) {
    // Some older frigate and cruiser fixtures have only the class identifier.
    return CAPITAL_HULLS[ship.variant] ?? classDefaults[ship.capitalClass];
}

const rotation = new THREE.Quaternion(), origin = new THREE.Vector3();
export function capitalMountPosition(ship, index, out) {
    return out.fromArray(capitalHull(ship).mounts[index].localPosition)
        .applyQuaternion(rotation.fromArray(ship.rotation)).add(origin.fromArray(ship.position));
}

export function capitalReadout(ship) {
    const hull = capitalHull(ship), counts = { guns: 0, pdc: 0, turrets: 0, pods: 0 };
    for (const m of hull.mounts) {
        if (ship.capitalMountHull[m.index] <= 0) continue;
        if (m.kind === 'battery' || m.kind === 'broadside') counts.guns++;
        if (m.kind === 'pdc') counts.pdc++;
        if (m.kind === 'pdc' || m.kind === 'laser') counts.turrets++;
        if (m.kind === 'pod') counts.pods++;
    }
    return t(hull.readout, counts);
}
