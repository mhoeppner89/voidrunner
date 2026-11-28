// Full flight coordinates, with +X starboard and -Z toward the bow.
const stations = [-19, 0, 19];
const sides = [[-1, 'port'], [1, 'starboard']];
export const SKIDBLADNIR_LAUNCH_SOCKETS = {};
export const SKIDBLADNIR_MOUNTS = [];

for (const [sign, side] of sides) {
    for (const [index, z] of stations.entries()) {
        const key = side + '_' + (index + 1);
        SKIDBLADNIR_LAUNCH_SOCKETS['launch_' + key] = {
            game_position: [sign * 19.5, 0, z], direction_game: [sign, 0, 0],
        };
        // The aperture remains hollow. A shot through its centre reaches the rear bulkhead.
        SKIDBLADNIR_MOUNTS.push({
            node: 'bay_' + key, kind: 'bay', label: side.toUpperCase() + ' BAY ' + (index + 1),
            position: [sign * 6.55, 0, z], normal: [sign, 0, 0], bearing: sign,
            hull: 180, radius: 4, markerLift: .4, exportedSurface: true,
        });
    }
}

for (const [sign, side] of sides) {
    SKIDBLADNIR_MOUNTS.push({
        node: 'generator_' + side, kind: 'generator', label: side.toUpperCase() + ' GENERATOR',
        position: [sign * 14.4, 0, 37], normal: [sign, 0, 0],
        hull: 95, radius: 2.4, markerLift: .3, exportedSurface: true,
    });
}
for (const [index, name] of ['port', 'centre', 'starboard'].entries()) {
    SKIDBLADNIR_MOUNTS.push({
        node: 'engine_' + name, kind: 'engine', label: name.toUpperCase() + ' ENGINE',
        position: [(index - 1) * 7.3, -1, 58], normal: [0, 0, 1],
        hull: 150, radius: 3.3, markerLift: .15, exhaustRadius: 2.45, exportedSurface: true,
    });
}
for (const [sign, side] of sides) {
    for (const [kind, z] of [['laser', -12], ['pdc', 12]]) {
        SKIDBLADNIR_MOUNTS.push({
            node: 'mount_' + kind + '_' + side, kind, label: side.toUpperCase() + ' ' + kind.toUpperCase(),
            position: [sign * 5.5, 10.25, z], normal: [0, 1, 0], axis: 1, side: 1,
            hull: 65, radius: 1.45, size: kind === 'laser' ? 'M' : 'S', pedestal: 0,
            visualScale: kind === 'laser' ? 1.85 : 2, restDirection: [0, 0, -1],
            hitCenterOffset: [0, .7, 0],
        });
    }
}
