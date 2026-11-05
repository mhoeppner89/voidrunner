// Decode the baker's integer deltas straight into the shared collision arrays.
// Coordinates were authored to six decimal places. Keep them as doubles until
// after applying each wreck's scale, just as with the original numeric literals.
function unpack(encoded, target, start, stride, divisor) {
    const bytes = atob(encoded);
    let previous = 0, offset = 0;
    for (let i = start; i < target.length; i += stride) {
        let word = 0, shift = 0, byte;
        do {
            byte = bytes.charCodeAt(offset++);
            word |= (byte & 127) << shift;
            shift += 7;
        } while (byte & 128);
        previous += (word >>> 1) ^ -(word & 1);
        target[i] = previous / divisor;
    }
}

export function unpackWreckProfiles(profiles) {
    for (const sections of Object.values(profiles)) {
        for (let i = 0; i < sections.length; i++) {
            const {vertexCount, indexCount, axes, order, ...metadata} = sections[i];
            const vertices = new Float64Array(vertexCount * 3);
            const indices = new Uint16Array(indexCount);
            for (let axis = 0; axis < 3; axis++) unpack(axes[axis], vertices, axis, 3, 1e6);
            unpack(order, indices, 0, 1, 1);
            sections[i] = {...metadata, vertices, indices};
        }
    }
    return Object.freeze(profiles);
}
