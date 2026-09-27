// Unmodified reference extracted before applying the surface optimization.
const triClosest = { x: 0, y: 0, z: 0 };
const triangleClosestDistSq = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const apx = -ax;
    const apy = -ay;
    const apz = -az;
    const d1 = abx * apx + aby * apy + abz * apz;
    const d2 = acx * apx + acy * apy + acz * apz;
    if (d1 <= 0 && d2 <= 0) {
        triClosest.x = ax;
        triClosest.y = ay;
        triClosest.z = az;
        return apx * apx + apy * apy + apz * apz;
    }
    const bpx = -bx;
    const bpy = -by;
    const bpz = -bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) {
        triClosest.x = bx;
        triClosest.y = by;
        triClosest.z = bz;
        return bpx * bpx + bpy * bpy + bpz * bpz;
    }
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const t = d1 / (d1 - d3);
        triClosest.x = ax + t * abx;
        triClosest.y = ay + t * aby;
        triClosest.z = az + t * abz;
        return triClosest.x * triClosest.x + triClosest.y * triClosest.y + triClosest.z * triClosest.z;
    }
    const cpx = -cx;
    const cpy = -cy;
    const cpz = -cz;
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) {
        triClosest.x = cx;
        triClosest.y = cy;
        triClosest.z = cz;
        return cpx * cpx + cpy * cpy + cpz * cpz;
    }
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
        const t = d2 / (d2 - d6);
        triClosest.x = ax + t * acx;
        triClosest.y = ay + t * acy;
        triClosest.z = az + t * acz;
        return triClosest.x * triClosest.x + triClosest.y * triClosest.y + triClosest.z * triClosest.z;
    }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
        const t = (d4 - d3) / (d4 - d3 + (d5 - d6));
        triClosest.x = bx + t * (cx - bx);
        triClosest.y = by + t * (cy - by);
        triClosest.z = bz + t * (cz - bz);
        return triClosest.x * triClosest.x + triClosest.y * triClosest.y + triClosest.z * triClosest.z;
    }
    const denom = 1 / (va + vb + vc);
    const v = vb * denom;
    const w = vc * denom;
    triClosest.x = ax + abx * v + acx * w;
    triClosest.y = ay + aby * v + acy * w;
    triClosest.z = az + abz * v + acz * w;
    return triClosest.x * triClosest.x + triClosest.y * triClosest.y + triClosest.z * triClosest.z;
};

// The rock's actual deformed mesh. The hull becomes the unit sphere at the
// origin (transform the mesh into hull space, divide by the extents), so the
// test is sphere-vs-mesh against the visible surface — a bump lands on the
// rock from every angle, dents included, instead of an enclosing box that
// bumps in empty air past a rock's corners.
// `scratch` is a caller-owned Float32Array at least as long as
// obstacle.meshVerts (the game reuses one buffer across frames).
export const hullVsAsteroid = (pos, hull, quat, quatInv, obstacle, scratch, contact) => {
    const mesh = obstacle.meshVerts;
    const indices = obstacle.meshIndices;
    if (!mesh || !indices)
        return false;
    const hx = hull[0];
    const hy = hull[1];
    const hz = hull[2];
    const box = obstacle.box;
    // Cheap reject: the rock's bounding reach plus the hull's longest.
    const reach = Math.max(obstacle.radius, obstacle.losRadius ?? obstacle.radius) + Math.max(hx, hy, hz) + 4;
    const ox = pos.x - obstacle.x;
    const oy = pos.y - obstacle.y;
    const oz = pos.z - obstacle.z;
    if (ox * ox + oy * oy + oz * oz >= reach * reach)
        return false;
    const rqx = box.qx;
    const rqy = box.qy;
    const rqz = box.qz;
    const rqw = box.qw;
    const sqx = quatInv.x;
    const sqy = quatInv.y;
    const sqz = quatInv.z;
    const sqw = quatInv.w;
    const invHx = 1 / hx;
    const invHy = 1 / hy;
    const invHz = 1 / hz;
    for (let i = 0; i < mesh.length; i += 3) {
        // rock-local -> world, then world -> player-hull space.
        let x = mesh[i];
        let y = mesh[i + 1];
        let z = mesh[i + 2];
        let tX = 2 * (rqy * z - rqz * y);
        let tY = 2 * (rqz * x - rqx * z);
        let tZ = 2 * (rqx * y - rqy * x);
        x = x + rqw * tX + (rqy * tZ - rqz * tY) - ox;
        y = y + rqw * tY + (rqz * tX - rqx * tZ) - oy;
        z = z + rqw * tZ + (rqx * tY - rqy * tX) - oz;
        tX = 2 * (sqy * z - sqz * y);
        tY = 2 * (sqz * x - sqx * z);
        tZ = 2 * (sqx * y - sqy * x);
        scratch[i] = (x + sqw * tX + (sqy * tZ - sqz * tY)) * invHx;
        scratch[i + 1] = (y + sqw * tY + (sqz * tX - sqx * tZ)) * invHy;
        scratch[i + 2] = (z + sqw * tZ + (sqx * tY - sqy * tX)) * invHz;
    }
    // Closest point on the transformed mesh to the origin (hull centre).
    let bestDistSq = Infinity;
    let bestTri = -1;
    let bestCx = 0;
    let bestCy = 0;
    let bestCz = 0;
    for (let t = 0; t < indices.length; t += 3) {
        const i0 = indices[t] * 3;
        const i1 = indices[t + 1] * 3;
        const i2 = indices[t + 2] * 3;
        const distSq = triangleClosestDistSq(scratch[i0], scratch[i0 + 1], scratch[i0 + 2], scratch[i1], scratch[i1 + 1], scratch[i1 + 2], scratch[i2], scratch[i2 + 1], scratch[i2 + 2]);
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestTri = t;
            bestCx = triClosest.x;
            bestCy = triClosest.y;
            bestCz = triClosest.z;
        }
    }
    if (bestTri < 0)
        return false;
    const dist = Math.sqrt(bestDistSq);
    const i0 = indices[bestTri] * 3;
    const i1 = indices[bestTri + 1] * 3;
    const i2 = indices[bestTri + 2] * 3;
    const e1x = scratch[i1] - scratch[i0];
    const e1y = scratch[i1 + 1] - scratch[i0 + 1];
    const e1z = scratch[i1 + 2] - scratch[i0 + 2];
    const e2x = scratch[i2] - scratch[i0];
    const e2y = scratch[i2 + 1] - scratch[i0 + 1];
    const e2z = scratch[i2 + 2] - scratch[i0 + 2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const nLength = Math.hypot(nx, ny, nz);
    if (nLength > 1e-9) {
        nx /= nLength;
        ny /= nLength;
        nz /= nLength;
    }
    const cX = bestCx;
    const cY = bestCy;
    const cZ = bestCz;
    // Origin inside the rock (a fast jump tunnelled in) vs outside: the
    // closest face points away from an interior point, toward an exterior
    // one. A deep inside point has a large nearest-face distance, so this
    // must be decided before the surface test below.
    // The rock centre from the hull centre, in hull space (used by both the
    // inside/outside decision and the tunnelling exit).
    const rax = -ox;
    const ray = -oy;
    const raz = -oz;
    const rtX = 2 * (sqy * raz - sqz * ray);
    const rtY = 2 * (sqz * rax - sqx * raz);
    const rtZ = 2 * (sqx * ray - sqy * rax);
    const rcx = (rax + sqw * rtX + (sqy * rtZ - sqz * rtY)) * invHx;
    const rcy = (ray + sqw * rtY + (sqz * rtX - sqx * rtZ)) * invHy;
    const rcz = (raz + sqw * rtZ + (sqx * rtY - sqy * rtX)) * invHz;
    const dotInterior = cX * nx + cY * ny + cZ * nz;
    let interior;
    let exitT = Infinity;
    let rockDist = 0;
    let dirX;
    let dirY;
    let dirZ;
    if (obstacle.surfaceOnly) {
        // Wreck shells can be open, concave and multiply connected. Their
        // collision is the visible skin only: never infer a filled interior
        // from a ray cast through a torn aperture.
        interior = false;
    }
    else if (dist >= 1 && dotInterior <= -0.3 * dist) {
        // Clearly outside and the closest face faces the ship: the dot test
        // is decisive, no extra pass needed.
        interior = false;
    }
    else {
        // Not a decisive face contact: the winning triangle's normal can sit
        // nearly perpendicular to the closest point (grazing an edge or a
        // dent's side wall), where the dot flips and an EXTERIOR ship gets
        // misread as interior and teleported along the exit ray. For a
        // star-shaped rock the ray from the rock centre through the ship
        // leaves the surface exactly once, so the ship is inside iff it lies
        // between the centre and that crossing — and the same ray is the
        // tunnelling exit, so the interior path needs no second cast.
        rockDist = Math.hypot(rcx, rcy, rcz);
        if (rockDist < 1e-9) {
            interior = true; // centred on the rock: definitely inside
            exitT = dist;
            dirX = 0;
            dirY = 1;
            dirZ = 0;
        }
        else {
            // Exit ray: from the rock centre (rc) through the ship (origin).
            // The rock is star-shaped, so this ray leaves the surface exactly
            // once — the FIRST crossing, which is immune to the shared-edge
            // double-counting that would skew a crossing-parity count.
            dirX = -rcx / rockDist;
            dirY = -rcy / rockDist;
            dirZ = -rcz / rockDist;
            for (let t = 0; t < indices.length; t += 3) {
                const j0 = indices[t] * 3;
                const j1 = indices[t + 1] * 3;
                const j2 = indices[t + 2] * 3;
                const a1x = scratch[j1] - scratch[j0];
                const a1y = scratch[j1 + 1] - scratch[j0 + 1];
                const a1z = scratch[j1 + 2] - scratch[j0 + 2];
                const a2x = scratch[j2] - scratch[j0];
                const a2y = scratch[j2 + 1] - scratch[j0 + 1];
                const a2z = scratch[j2 + 2] - scratch[j0 + 2];
                const pvx = dirY * a2z - dirZ * a2y;
                const pvy = dirZ * a2x - dirX * a2z;
                const pvz = dirX * a2y - dirY * a2x;
                const det = a1x * pvx + a1y * pvy + a1z * pvz;
                if (Math.abs(det) < 1e-12)
                    continue;
                const invDet = 1 / det;
                const tvx = rcx - scratch[j0];
                const tvy = rcy - scratch[j0 + 1];
                const tvz = rcz - scratch[j0 + 2];
                const u = (tvx * pvx + tvy * pvy + tvz * pvz) * invDet;
                if (u < 0 || u > 1)
                    continue;
                const qvx = tvy * a1z - tvz * a1y;
                const qvy = tvz * a1x - tvx * a1z;
                const qvz = tvx * a1y - tvy * a1x;
                const v = (dirX * qvx + dirY * qvy + dirZ * qvz) * invDet;
                if (v < 0 || u + v > 1)
                    continue;
                const hit = (a2x * qvx + a2y * qvy + a2z * qvz) * invDet;
                if (hit > 1e-6 && hit < exitT)
                    exitT = hit;
            }
            if (exitT === Infinity)
                exitT = dist;
            // The ship is inside iff it lies between the centre and that
            // surface point.
            interior = rockDist < exitT;
        }
    }
    if (!interior && dist >= 1)
        return false;
    let pushPlayer;
    if (interior) {
        // Rare tunnelling: the exit ray above already found where the
        // centre→ship ray leaves the mesh; push just past that surface
        // point (a dent's side walls can't wedge the ship). exitT is
        // measured from the rock centre (rc), but the push starts at the
        // ship — subtract the centre-to-ship distance so the hull lands
        // just past the surface, not past it by the ship's own offset.
        pushPlayer = Math.max(1.08, exitT - rockDist + 1 + 0.08);
    }
    else if (dist > 1e-6) {
        // The closest surface point lies between the hull centre and the
        // rock, so push AWAY from it (negate) to separate.
        dirX = -cX / dist;
        dirY = -cY / dist;
        dirZ = -cZ / dist;
        pushPlayer = 1 - dist;
    }
    else {
        dirX = nx;
        dirY = ny;
        dirZ = nz;
        pushPlayer = 1;
    }
    // Map back to world: scale the player-space direction by the hull
    // extents (ship frame), rotate by the ship quaternion.
    const sqFx = quat.x;
    const sqFy = quat.y;
    const sqFz = quat.z;
    const sqFw = quat.w;
    let wX = dirX * hx;
    let wY = dirY * hy;
    let wZ = dirZ * hz;
    let tX = 2 * (sqFy * wZ - sqFz * wY);
    let tY = 2 * (sqFz * wX - sqFx * wZ);
    let tZ = 2 * (sqFx * wY - sqFy * wX);
    wX = wX + sqFw * tX + (sqFy * tZ - sqFz * tY);
    wY = wY + sqFw * tY + (sqFz * tX - sqFx * tZ);
    wZ = wZ + sqFw * tZ + (sqFx * tY - sqFy * tX);
    const support = Math.hypot(dirX * hx, dirY * hy, dirZ * hz);
    const worldLength = Math.hypot(wX, wY, wZ) || 1;
    wX /= worldLength;
    wY /= worldLength;
    wZ /= worldLength;
    const push = pushPlayer * support + 0.08;
    contact.x = wX;
    contact.y = wY;
    contact.z = wZ;
    contact.push = push;
    return true;
};
