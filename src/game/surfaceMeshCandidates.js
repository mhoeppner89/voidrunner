// Conservative local-space BVH for surface-only hull collision queries.
// Original exact hull-space triangle tests remain in hullCollision.js.
const trees = new WeakMap();
const workspaces = new WeakMap();
const LEAF_TRIANGLES = 12;

export function invalidateSurfaceMeshIndex(vertices) { trees.delete(vertices); }

export function prepareSurfaceMeshIndex(vertices, indices) {
    let byIndices = trees.get(vertices);
    if (!byIndices) trees.set(vertices, byIndices = new WeakMap());
    let tree = byIndices.get(indices);
    if (tree) return tree;
    const count = indices.length / 3;
    if (!Number.isInteger(count)) throw new RangeError('Triangle index count must be divisible by three.');
    const order = Array.from({ length: count }, (_, i) => i * 3);
    const bounds = new Float64Array(count * 6);
    for (let n = 0; n < count; n++) {
        const out = n * 6;
        bounds[out] = bounds[out + 1] = bounds[out + 2] = Infinity;
        bounds[out + 3] = bounds[out + 4] = bounds[out + 5] = -Infinity;
        for (let j = 0; j < 3; j++) {
            const vertex = indices[n * 3 + j] * 3;
            for (let axis = 0; axis < 3; axis++) {
                const value = vertices[vertex + axis];
                bounds[out + axis] = Math.min(bounds[out + axis], value);
                bounds[out + 3 + axis] = Math.max(bounds[out + 3 + axis], value);
            }
        }
    }
    const nodes = [];
    function build(first, end) {
        const node = { minX: Infinity, minY: Infinity, minZ: Infinity,
            maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity,
            first, end, leaf: end - first <= LEAF_TRIANGLES, skip: 0 };
        nodes.push(node);
        for (let n = first; n < end; n++) {
            const at = order[n] * 2;
            node.minX = Math.min(node.minX, bounds[at]);
            node.minY = Math.min(node.minY, bounds[at + 1]);
            node.minZ = Math.min(node.minZ, bounds[at + 2]);
            node.maxX = Math.max(node.maxX, bounds[at + 3]);
            node.maxY = Math.max(node.maxY, bounds[at + 4]);
            node.maxZ = Math.max(node.maxZ, bounds[at + 5]);
        }
        if (!node.leaf) {
            const spans = [node.maxX - node.minX, node.maxY - node.minY, node.maxZ - node.minZ];
            const axis = spans[1] > spans[0] ? (spans[2] > spans[1] ? 2 : 1) : (spans[2] > spans[0] ? 2 : 0);
            // Cold build only: reorder triangle references, never source buffers.
            const sorted = order.slice(first, end).sort((a, b) =>
                (bounds[a * 2 + axis] + bounds[a * 2 + axis + 3])
                - (bounds[b * 2 + axis] + bounds[b * 2 + axis + 3]) || a - b);
            for (let n = 0; n < sorted.length; n++) order[first + n] = sorted[n];
            const middle = first + Math.floor((end - first) / 2);
            build(first, middle); build(middle, end);
        }
        node.skip = nodes.length;
    }
    if (count) build(0, count);
    tree = { nodes, order: Uint32Array.from(order) };
    byIndices.set(indices, tree);
    return tree;
}

/**
 * Returns a reused workspace, valid until the next call with this scratch.
 * Undefined means use the original full scan (solid meshes / invalid inputs).
 * All three hull extents must be positive and obstacle.box must be unit rotation,
 * as required by the original collider. Geometry changes require invalidation.
 */
export function surfaceMeshCandidates(pos, hull, obstacle, scratch) {
    if (!obstacle.surfaceOnly) return undefined;
    const vertices = obstacle.meshVerts, indices = obstacle.meshIndices;
    if (!vertices || !indices || !obstacle.box) return undefined;
    const radius = Math.max(hull[0], hull[1], hull[2]);
    if (!Number.isFinite(radius) || Math.min(hull[0], hull[1], hull[2]) <= 0) return undefined;
    const box = obstacle.box;
    const qx = -box.qx, qy = -box.qy, qz = -box.qz, qw = box.qw;
    const x = pos.x - obstacle.x, y = pos.y - obstacle.y, z = pos.z - obstacle.z;
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    const cx = x + qw * tx + qy * tz - qz * ty;
    const cy = y + qw * ty + qz * tx - qx * tz;
    const cz = z + qw * tz + qx * ty - qy * tx;
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) return undefined;
    // A cube around the hull's enclosing sphere is conservative under rotation.
    // Pad for boundary arithmetic and the Float32 scratch used by the old path.
    const pad = 1e-5 * Math.max(1, radius, Math.abs(cx), Math.abs(cy), Math.abs(cz));
    const reach = radius + pad;
    const minX = cx - reach, minY = cy - reach, minZ = cz - reach;
    const maxX = cx + reach, maxY = cy + reach, maxZ = cz + reach;
    const tree = prepareSurfaceMeshIndex(vertices, indices);
    let work = workspaces.get(scratch);
    const vertexCount = vertices.length / 3, triangleCount = indices.length / 3;
    if (!work || work.marks.length < vertexCount || work.triangles.length < triangleCount) {
        // Never shrink either capacity: alternating indexed/non-indexed meshes
        // can otherwise cause a fresh allocation on every collision query.
        const vertexCapacity = Math.max(vertexCount, work?.marks.length ?? 0);
        const triangleCapacity = Math.max(triangleCount, work?.triangles.length ?? 0);
        work = { vertices: new Uint32Array(vertexCapacity), marks: new Uint32Array(vertexCapacity),
            triangles: new Uint32Array(triangleCapacity), vertexCount: 0, triangleCount: 0,
            epoch: 0, boundsTests: 0 };
        workspaces.set(scratch, work);
    }
    work.vertexCount = 0; work.triangleCount = 0; work.boundsTests = 0;
    work.epoch = (work.epoch + 1) >>> 0;
    if (!work.epoch) { work.marks.fill(0); work.epoch = 1; }
    for (let at = 0; at < tree.nodes.length;) {
        const node = tree.nodes[at];
        work.boundsTests++;
        if (node.maxX < minX || node.minX > maxX || node.maxY < minY
            || node.minY > maxY || node.maxZ < minZ || node.minZ > maxZ) {
            at = node.skip; continue;
        }
        at++;
        if (!node.leaf) continue;
        for (let n = node.first; n < node.end; n++) {
            const t = tree.order[n];
            work.triangles[work.triangleCount++] = t;
            for (let j = 0; j < 3; j++) {
                const vertex = indices[t + j];
                if (work.marks[vertex] === work.epoch) continue;
                work.marks[vertex] = work.epoch;
                work.vertices[work.vertexCount++] = vertex;
            }
        }
    }
    return work;
}
