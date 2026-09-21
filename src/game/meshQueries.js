// Exact triangle queries with a cached, conservative bounding-volume hierarchy.
// Vertices and indices are immutable collision geometry in worldData. Rotation
// and translation stay per-query, so drifting obstacles reuse the hierarchy.
// Weak keys release it with the geometry; editing geometry in place requires
// invalidateMeshQueryCache(vertices). No rendering or collision surface changes.
const trees = new WeakMap();
const LEAF_TRIANGLES = 12;

export function invalidateMeshQueryCache(vertices) {
    trees.delete(vertices);
}

function meshTree(vertices, indices, stats) {
    let byIndex = trees.get(vertices);
    if (!byIndex) trees.set(vertices, byIndex = new WeakMap());
    let tree = byIndex.get(indices);
    if (tree) return tree;
    tree = [];
    // Contiguous leaves retain authored triangle order, including ties. Build
    // bounds bottom-up once; no sorting or query-time traversal stack is needed.
    function build(first, end) {
        const at = tree.length;
        const node = { minX: Infinity, minY: Infinity, minZ: Infinity,
            maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity,
            first, end, leaf: end - first <= LEAF_TRIANGLES * 3, skip: 0 };
        tree.push(node);
        if (node.leaf) {
            for (let i = first; i < end; i++) {
                const offset = indices[i] * 3;
                node.minX = Math.min(node.minX, vertices[offset]);
                node.minY = Math.min(node.minY, vertices[offset + 1]);
                node.minZ = Math.min(node.minZ, vertices[offset + 2]);
                node.maxX = Math.max(node.maxX, vertices[offset]);
                node.maxY = Math.max(node.maxY, vertices[offset + 1]);
                node.maxZ = Math.max(node.maxZ, vertices[offset + 2]);
            }
        } else {
            const middle = first + Math.floor((end - first) / 6) * 3;
            const left = build(first, middle), right = build(middle, end);
            for (const axis of ['X', 'Y', 'Z']) {
                node['min' + axis] = Math.min(left['min' + axis], right['min' + axis]);
                node['max' + axis] = Math.max(left['max' + axis], right['max' + axis]);
            }
        }
        node.skip = tree.length;
        return node;
    }
    build(0, indices.length);
    byIndex.set(indices, tree);
    if (stats) { stats.treeBuilds = (stats.treeBuilds ?? 0) + 1; stats.treeNodes = (stats.treeNodes ?? 0) + tree.length; }
    return tree;
}

function intersectsBounds(node, sx, sy, sz, dx, dy, dz, limit) {
    // Expand conservatively for roundoff at shared edges and zero-width faces.
    // A box can admit extra triangles, but only the unchanged exact test hits.
    const pad = 1e-7 * Math.max(1, Math.abs(node.minX), Math.abs(node.maxX),
        Math.abs(node.minY), Math.abs(node.maxY), Math.abs(node.minZ), Math.abs(node.maxZ));
    let near = 0, far = limit + 1e-9;
    if (dx === 0) {
        if (sx < node.minX - pad || sx > node.maxX + pad) return false;
    } else {
        let a = (node.minX - pad - sx) / dx, b = (node.maxX + pad - sx) / dx;
        if (a > b) { const swap = a; a = b; b = swap; }
        near = Math.max(near, a); far = Math.min(far, b);
        if (near > far) return false;
    }
    if (dy === 0) {
        if (sy < node.minY - pad || sy > node.maxY + pad) return false;
    } else {
        let a = (node.minY - pad - sy) / dy, b = (node.maxY + pad - sy) / dy;
        if (a > b) { const swap = a; a = b; b = swap; }
        near = Math.max(near, a); far = Math.min(far, b);
        if (near > far) return false;
    }
    if (dz === 0) {
        if (sz < node.minZ - pad || sz > node.maxZ + pad) return false;
    } else {
        let a = (node.minZ - pad - sz) / dz, b = (node.maxZ + pad - sz) / dz;
        if (a > b) { const swap = a; a = b; b = swap; }
        near = Math.max(near, a); far = Math.min(far, b);
        if (near > far) return false;
    }
    return true;
}

// Allocation-free after cache warm-up: segment/mesh intersection for laser and beam line of sight
// against asteroids. The rock's deformed-icosahedron collision mesh (shared
// with the renderer and hard collision) is the exact visible surface, so a
// shot is blocked only where rock is actually drawn — the old enclosing OBB
// stuck out past the silhouette at its corners (up to ~1.56× on a round rock)
// and ate shots in open space. The segment is transformed into the rock's
// local frame (translate + inverse rotation), then Möller–Trumbore tests each
// triangle; t is preserved by the rigid transform.
export const segmentMeshHit = (start, end, obstacle, anyHit = false, stats) => {
    const mesh = obstacle.meshVerts;
    const indices = obstacle.meshIndices;
    if (!mesh || !indices)
        return undefined;
    // Cheap reject: the segment must pass within the rock's bounding reach
    // (losRadius is the OBB corner reach, which contains the whole mesh).
    // Use the closest-approach distance, NOT segmentSphereHit: that helper
    // returns undefined when BOTH endpoints are inside the sphere (both roots
    // fall outside [0, 1]) — exactly the case once a projectile's step-start
    // enters the rock's envelope. Treating that as a miss culled every shot
    // from the moment it entered the bounding reach (~3.4x the visible
    // surface along a diagonal) and let bolts sail clean through the rock.
    const ocx = start.x - obstacle.x;
    const ocy = start.y - obstacle.y;
    const ocz = start.z - obstacle.z;
    const sdx = end.x - start.x;
    const sdy = end.y - start.y;
    const sdz = end.z - start.z;
    const segLenSq = sdx * sdx + sdy * sdy + sdz * sdz;
    let closestSq;
    if (segLenSq < 1e-12) {
        closestSq = ocx * ocx + ocy * ocy + ocz * ocz;
    }
    else {
        const tc = Math.max(0, Math.min(1, -(ocx * sdx + ocy * sdy + ocz * sdz) / segLenSq));
        const ccx = ocx + sdx * tc;
        const ccy = ocy + sdy * tc;
        const ccz = ocz + sdz * tc;
        closestSq = ccx * ccx + ccy * ccy + ccz * ccz;
    }
    if (closestSq > obstacle.losRadius * obstacle.losRadius)
        return undefined;
    const box = obstacle.box;
    const qx = box.qx;
    const qy = box.qy;
    const qz = box.qz;
    const qw = box.qw;
    // World -> rock-local rotation (the same matrix segmentBoxHit builds).
    const m00 = 1 - 2 * (qy * qy + qz * qz);
    const m01 = 2 * (qx * qy - qz * qw);
    const m02 = 2 * (qx * qz + qy * qw);
    const m10 = 2 * (qx * qy + qz * qw);
    const m11 = 1 - 2 * (qx * qx + qz * qz);
    const m12 = 2 * (qy * qz - qx * qw);
    const m20 = 2 * (qx * qz - qy * qw);
    const m21 = 2 * (qy * qz + qx * qw);
    const m22 = 1 - 2 * (qx * qx + qy * qy);
    const sx = m00 * (start.x - obstacle.x) + m10 * (start.y - obstacle.y) + m20 * (start.z - obstacle.z);
    const sy = m01 * (start.x - obstacle.x) + m11 * (start.y - obstacle.y) + m21 * (start.z - obstacle.z);
    const sz = m02 * (start.x - obstacle.x) + m12 * (start.y - obstacle.y) + m22 * (start.z - obstacle.z);
    const ex = m00 * (end.x - obstacle.x) + m10 * (end.y - obstacle.y) + m20 * (end.z - obstacle.z);
    const ey = m01 * (end.x - obstacle.x) + m11 * (end.y - obstacle.y) + m21 * (end.z - obstacle.z);
    const ez = m02 * (end.x - obstacle.x) + m12 * (end.y - obstacle.y) + m22 * (end.z - obstacle.z);
    const dx = ex - sx;
    const dy = ey - sy;
    const dz = ez - sz;
    // A projectile starting inside the rock's envelope is already past the
    // blocker (a muzzle touching rock must not self-hit). The envelope is the
    // rock's INSCRIBED sphere (minReach), NOT the oriented box: the box's
    // corner reach overhangs the visible surface by up to ~2x along diagonals
    // (half-extents are 0.9x the mesh axes, but hypot(hx,hy,hz) spans the
    // corners), so a box test declared approaching shots "already past" once
    // their step-start entered the overhang and let them sail through the
    // rock. Any point within minReach is provably inside the closed mesh;
    // points beyond it are still tested against the real surface.
    if (Number.isFinite(obstacle.minReach) && ocx * ocx + ocy * ocy + ocz * ocz <= obstacle.minReach * obstacle.minReach)
        return undefined;
    return localMeshHit(mesh, indices, sx, sy, sz, dx, dy, dz, anyHit, stats);
};

function localMeshHit(mesh, indices, sx, sy, sz, dx, dy, dz, anyHit, stats) {
    // Tiny colliders cost less to scan directly than to walk a hierarchy.
    const tree = indices.length > LEAF_TRIANGLES * 3 ? meshTree(mesh, indices, stats) : null;
    let best;
    for (let nodeIndex = 0; nodeIndex < (tree?.length ?? 1);) {
        const node = tree?.[nodeIndex];
        if (node) {
            if (stats) stats.boundsTests = (stats.boundsTests ?? 0) + 1;
            if (!intersectsBounds(node, sx, sy, sz, dx, dy, dz, best ?? 1)) {
                nodeIndex = node.skip;
                continue;
            }
            nodeIndex++;
            if (!node.leaf) continue;
        } else nodeIndex++;
        for (let t = node?.first ?? 0, end = node?.end ?? indices.length; t < end; t += 3) {
            if (stats) stats.triangleTests = (stats.triangleTests ?? 0) + 1;
            const i0 = indices[t] * 3;
            const i1 = indices[t + 1] * 3;
            const i2 = indices[t + 2] * 3;
            const ax = mesh[i0];
            const ay = mesh[i0 + 1];
            const az = mesh[i0 + 2];
            const bx = mesh[i1];
            const by = mesh[i1 + 1];
            const bz = mesh[i1 + 2];
            const cx = mesh[i2];
            const cy = mesh[i2 + 1];
            const cz = mesh[i2 + 2];
            const e1x = bx - ax;
            const e1y = by - ay;
            const e1z = bz - az;
            const e2x = cx - ax;
            const e2y = cy - ay;
            const e2z = cz - az;
            const hx = dy * e2z - dz * e2y;
            const hy = dz * e2x - dx * e2z;
            const hz = dx * e2y - dy * e2x;
            const det = e1x * hx + e1y * hy + e1z * hz;
            if (det > -1e-9 && det < 1e-9)
                continue;
            const invDet = 1 / det;
            const ox = sx - ax;
            const oy = sy - ay;
            const oz = sz - az;
            const u = invDet * (ox * hx + oy * hy + oz * hz);
            if (u < 0 || u > 1)
                continue;
            // Möller–Trumbore: q = s × e1 (not e2), and t = f * (e2 · q). The two
            // are easy to swap, and doing so both misses real surface hits and
            // fabricates phantom ones.
            const qx2 = oy * e1z - oz * e1y;
            const qy2 = oz * e1x - ox * e1z;
            const qz2 = ox * e1y - oy * e1x;
            const v = invDet * (dx * qx2 + dy * qy2 + dz * qz2);
            if (v < 0 || u + v > 1)
                continue;
            const tt = invDet * (e2x * qx2 + e2y * qy2 + e2z * qz2);
            if (tt >= 0 && tt <= 1 && (best === undefined || tt < best)) {
                if (anyHit) return tt;
                best = tt;
            }
        }
    }
    return best;
}
