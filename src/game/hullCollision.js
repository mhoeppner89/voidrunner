// hullCollision.js — every ship's hull vs every kind of obstacle.
//
// Both the player and every NPC collide through the same envelope: an
// oriented ellipsoid whose half-extents track the GLB model the player sees
// (nose -Z, starboard +X, up +Y). This module owns all the contact geometry:
//
//   hullVsAsteroid — the rock's ACTUAL deformed-icosahedron mesh, so a bump
//       lands on the visible surface, dents and all, from any angle.
//   hullVsBox      — flat debris panels block their whole face (a sphere can
//       never approximate a slab; the box expands by the hull's per-face
//       reach, so a long freighter bumps at its nose, not its centre).
//   hullVsSphere   — wreck nodes and dock pylons, expanded by the hull's
//       reach along the approach direction (not a fixed ship radius).
//   hullVsRing / hullVsEngine — hollow troughs: the tube/bore expands by the
//       hull's cross-section in the hole plane, so fit-through is honest.
//   hullVsHull     — ship vs ship (ellipsoid vs ellipsoid).
//
// Every function is allocation-free scalar math (the codebase's hot-path
// convention): it writes into a caller-supplied `contact` object
// {x, y, z, push} — a world-space normal and the separation distance — and
// returns true when the hull touches. The caller pushes the ship out along
// the normal and reflects its velocity.
import { GRAVEYARD_GEOMETRY_PROFILES } from './worldData.js';

const clamp = (value, lo, hi) => (value < lo ? lo : value > hi ? hi : value);

// The hull's reach along a unit world direction — the ellipsoid support
// function. qix..qiw is the ship's INVERSE orientation (maps a world
// direction into the ship frame), hx..hz the frame half-extents.
const hullSupport = (qix, qiy, qiz, qiw, hx, hy, hz, nx, ny, nz) => {
    const tx = 2 * (qiy * nz - qiz * ny);
    const ty = 2 * (qiz * nx - qix * nz);
    const tz = 2 * (qix * ny - qiy * nx);
    const sx = nx + qiw * tx + (qiy * tz - qiz * ty);
    const sy = ny + qiw * ty + (qiz * tx - qix * tz);
    const sz = nz + qiw * tz + (qix * ty - qiy * tx);
    return Math.hypot(hx * sx, hy * sy, hz * sz);
};

// The hull's widest reach across a plane (used for hollow shapes: the ring's
// hole plane and the engine's bore plane). Samples 16 directions — accurate
// to ~1% and far cheaper than the exact 2D eigen-analysis.
const hullReachInPlane = (qix, qiy, qiz, qiw, hx, hy, hz, ux, uy, uz, vx, vy, vz) => {
    let best = 0;
    for (let i = 0; i < 16; i += 1) {
        const angle = (i / 16) * Math.PI * 2;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const reach = hullSupport(qix, qiy, qiz, qiw, hx, hy, hz, ux * c + vx * s, uy * c + vy * s, uz * c + vz * s);
        if (reach > best)
            best = reach;
    }
    return best;
};

// A module-local scratch for axis rotation — NEVER the caller's `out` (which
// holds the contact result mid-computation; reusing it clobbered the normal
// with an axis vector and poisoned the push with NaN).
const _axis = { x: 0, y: 0, z: 0 };
// Rotate a unit axis by a quaternion (scalar, no THREE) — used to bring each
// obstacle's local axes into world space for reach queries.
const rotateAxis = (qx, qy, qz, qw, x, y, z) => {
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    _axis.x = x + qw * tx + (qy * tz - qz * ty);
    _axis.y = y + qw * ty + (qz * tx - qx * tz);
    _axis.z = z + qw * tz + (qx * ty - qy * tx);
    return _axis;
};

// Sphere obstacle (wreck nodes, dock pylons): the sphere expands by the
// hull's reach along the centre→hull direction, so a long freighter bumps at
// its nose while a slender interceptor slips past closer.
export const hullVsSphere = (pos, hull, quatInv, cx, cy, cz, radius, contact) => {
    const hx = hull[0];
    const hy = hull[1];
    const hz = hull[2];
    const ox = pos.x - cx;
    const oy = pos.y - cy;
    const oz = pos.z - cz;
    const distSq = ox * ox + oy * oy + oz * oz;
    let nx;
    let ny;
    let nz;
    if (distSq > 1e-8) {
        const dist = Math.sqrt(distSq);
        nx = ox / dist;
        ny = oy / dist;
        nz = oz / dist;
    }
    else {
        // Centres coincide (a fast jump tunnelled in): push up.
        nx = 0;
        ny = 1;
        nz = 0;
    }
    const support = hullSupport(quatInv.x, quatInv.y, quatInv.z, quatInv.w, hx, hy, hz, nx, ny, nz);
    const minimum = radius + support;
    if (distSq >= minimum * minimum)
        return false;
    contact.x = nx;
    contact.y = ny;
    contact.z = nz;
    contact.push = minimum - Math.sqrt(distSq) + 0.08;
    return true;
};

// Debris is an oriented box (a flat panel, a hull slab), not a sphere: a
// sphere around a thin panel balloons into an invisible wall. The box expands
// by the hull's reach along each of its faces, and the contact push is the
// hull's reach along the actual push direction — a long ship bumps at its
// nose against a panel instead of clipping through it.
export const hullVsBox = (pos, hull, quatInv, obstacle, contact) => {
    const box = obstacle.box;
    const hx = hull[0];
    const hy = hull[1];
    const hz = hull[2];
    const qx = box.qx;
    const qy = box.qy;
    const qz = box.qz;
    const qw = box.qw;
    // The box's local axes in world space, for per-face reach.
    const ax = rotateAxis(qx, qy, qz, qw, 1, 0, 0);
    const supportX = hullSupport(quatInv.x, quatInv.y, quatInv.z, quatInv.w, hx, hy, hz, ax.x, ax.y, ax.z);
    const ay = rotateAxis(qx, qy, qz, qw, 0, 1, 0);
    const supportY = hullSupport(quatInv.x, quatInv.y, quatInv.z, quatInv.w, hx, hy, hz, ay.x, ay.y, ay.z);
    const az = rotateAxis(qx, qy, qz, qw, 0, 0, 1);
    const supportZ = hullSupport(quatInv.x, quatInv.y, quatInv.z, quatInv.w, hx, hy, hz, az.x, az.y, az.z);
    const bx = box.hx;
    const by = box.hy;
    const bz = box.hz;
    const ex = bx + supportX;
    const ey = by + supportY;
    const ez = bz + supportZ;
    // Transform the hull centre into the box's local frame.
    const dqx = -qx;
    const dqy = -qy;
    const dqz = -qz;
    const dqw = qw;
    const lx = pos.x - obstacle.x;
    const ly = pos.y - obstacle.y;
    const lz = pos.z - obstacle.z;
    const ltx = 2 * (dqy * lz - dqz * ly);
    const lty = 2 * (dqz * lx - dqx * lz);
    const ltz = 2 * (dqx * ly - dqy * lx);
    const fx = lx + dqw * ltx + (dqy * ltz - dqz * lty);
    const fy = ly + dqw * lty + (dqz * ltx - dqx * ltz);
    const fz = lz + dqw * ltz + (dqx * lty - dqy * ltx);
    if (fx < -ex || fx > ex || fy < -ey || fy > ey || fz < -ez || fz > ez)
        return false;
    const cx = clamp(fx, -bx, bx);
    const cy = clamp(fy, -by, by);
    const cz = clamp(fz, -bz, bz);
    let dx = fx - cx;
    let dy = fy - cy;
    let dz = fz - cz;
    const distSq = dx * dx + dy * dy + dz * dz;
    let nx;
    let ny;
    let nz;
    let push;
    if (distSq > 1e-9) {
        const dist = Math.sqrt(distSq);
        // The hull's reach along the push direction decides the contact.
        const pnx = dx / dist;
        const pny = dy / dist;
        const pnz = dz / dist;
        const wpx = rotateAxis(qx, qy, qz, qw, pnx, pny, pnz);
        const reach = hullSupport(quatInv.x, quatInv.y, quatInv.z, quatInv.w, hx, hy, hz, wpx.x, wpx.y, wpx.z);
        if (dist >= reach)
            return false;
        nx = pnx;
        ny = pny;
        nz = pnz;
        push = reach - dist + 0.08;
    }
    else {
        // The centre is inside the box (a fast jump tunnelled in): exit
        // through the nearest face.
        const px = bx - Math.abs(fx);
        const py = by - Math.abs(fy);
        const pz = bz - Math.abs(fz);
        if (px <= py && px <= pz) {
            nx = fx < 0 ? -1 : 1;
            ny = 0;
            nz = 0;
            push = px + supportX + 0.08;
        }
        else if (py <= pz) {
            nx = 0;
            ny = fy < 0 ? -1 : 1;
            nz = 0;
            push = py + supportY + 0.08;
        }
        else {
            nx = 0;
            ny = 0;
            nz = fz < 0 ? -1 : 1;
            push = pz + supportZ + 0.08;
        }
    }
    const w = rotateAxis(qx, qy, qz, qw, nx, ny, nz);
    contact.x = w.x;
    contact.y = w.y;
    contact.z = w.z;
    contact.push = push;
    return true;
};

// Closest point on triangle ABC to the origin (Ericson, Real-Time Collision
// Detection). Writes the closest point to `out` and returns the squared
// distance. The origin is the ship's hull centre in player-hull space.
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

// Rings are toruses, not solid boxes. THREE.TorusGeometry lies in the local
// XY plane, so the opening runs along local Z. The tube expands by the hull's
// cross-section reach in that plane — a large opening stays flyable, a small
// opening naturally closes when the ship cannot fit through it.
export const hullVsRing = (pos, hull, quatInv, obstacle, contact) => {
    const box = obstacle.box;
    const scaleX = Math.max(0.001, obstacle.scale[0]);
    const scaleY = Math.max(0.001, obstacle.scale[1]);
    const scaleZ = Math.max(0.001, obstacle.scale[2]);
    const hx = hull[0];
    const hy = hull[1];
    const hz = hull[2];
    const dqx = -box.qx;
    const dqy = -box.qy;
    const dqz = -box.qz;
    const dqw = box.qw;
    const lx = pos.x - obstacle.x;
    const ly = pos.y - obstacle.y;
    const lz = pos.z - obstacle.z;
    const ltx = 2 * (dqy * lz - dqz * ly);
    const lty = 2 * (dqz * lx - dqx * lz);
    const ltz = 2 * (dqx * ly - dqy * lx);
    const localX = (lx + dqw * ltx + (dqy * ltz - dqz * lty)) / scaleX;
    const localY = (ly + dqw * lty + (dqz * ltx - dqx * ltz)) / scaleY;
    const localZ = (lz + dqw * ltz + (dqx * lty - dqy * ltx)) / scaleZ;
    const radial = Math.hypot(localX, localY);
    const radialDirectionX = radial > 1e-6 ? localX / radial : 1;
    const radialDirectionY = radial > 1e-6 ? localY / radial : 0;
    const deltaRadial = radial - GRAVEYARD_GEOMETRY_PROFILES.ring.majorRadius;
    // Non-uniformly scaled rings are elliptical. Expanding the tube by a hull
    // using the old smallest scale made the thin Z thickness close a huge XY
    // opening with invisible collision. Measure radial and axial support in
    // their own world directions so the collision follows the visible torus.
    const radialNormalLength = Math.hypot(radialDirectionX / scaleX, radialDirectionY / scaleY) || 1;
    const radialLocalNormalX = (radialDirectionX / scaleX) / radialNormalLength;
    const radialLocalNormalY = (radialDirectionY / scaleY) / radialNormalLength;
    const radialWorldNormal = rotateAxis(box.qx, box.qy, box.qz, box.qw, radialLocalNormalX, radialLocalNormalY, 0);
    const axialWorldNormal = rotateAxis(box.qx, box.qy, box.qz, box.qw, 0, 0, 1);
    const radialWorldScale = 1 / radialNormalLength;
    const radialAllowance = hullSupport(quatInv.x, quatInv.y, quatInv.z, quatInv.w, hx, hy, hz, radialWorldNormal.x, radialWorldNormal.y, radialWorldNormal.z) / radialWorldScale;
    const axialAllowance = hullSupport(quatInv.x, quatInv.y, quatInv.z, quatInv.w, hx, hy, hz, axialWorldNormal.x, axialWorldNormal.y, axialWorldNormal.z) / scaleZ;
    const expandedRadial = GRAVEYARD_GEOMETRY_PROFILES.ring.tubeRadius + radialAllowance;
    const expandedAxial = GRAVEYARD_GEOMETRY_PROFILES.ring.tubeRadius + axialAllowance;
    const normalizedDistance = Math.hypot(deltaRadial / expandedRadial, localZ / expandedAxial);
    if (normalizedDistance >= 1)
        return false;
    let normalRadial;
    let normalZ;
    if (normalizedDistance > 1e-6) {
        const gradientRadial = deltaRadial / (expandedRadial * expandedRadial);
        const gradientZ = localZ / (expandedAxial * expandedAxial);
        const gradientLength = Math.hypot(gradientRadial, gradientZ) || 1;
        normalRadial = gradientRadial / gradientLength;
        normalZ = gradientZ / gradientLength;
    }
    else {
        normalRadial = 1;
        normalZ = 0;
    }
    const wx = normalRadial * radialDirectionX * scaleX;
    const wy = normalRadial * radialDirectionY * scaleY;
    const wz = normalZ * scaleZ;
    const directionLength = Math.hypot(wx, wy, wz);
    const push = (1 - normalizedDistance) * Math.min(expandedRadial * radialWorldScale, expandedAxial * scaleZ) + 0.08;
    if (push < 1e-6 || directionLength < 1e-6)
        return false;
    const wr = rotateAxis(box.qx, box.qy, box.qz, box.qw, wx / directionLength, wy / directionLength, wz / directionLength);
    contact.x = wr.x;
    contact.y = wr.y;
    contact.z = wr.z;
    contact.push = push;
    return true;
};

// Engines are hollow tapered shells. Only the wall and its end rims collide;
// the two circular ends stay open, so a ship can pass down the bore when its
// cross-section fits the visible opening.
export const hullVsEngine = (pos, hull, quatInv, obstacle, contact) => {
    const box = obstacle.box;
    const scaleX = Math.max(0.001, obstacle.scale[0]);
    const scaleY = Math.max(0.001, obstacle.scale[1]);
    const scaleZ = Math.max(0.001, obstacle.scale[2]);
    const radialScale = Math.min(scaleX, scaleZ);
    const hx = hull[0];
    const hy = hull[1];
    const hz = hull[2];
    // The bore runs along local Y: the cross-section envelope is the hull's
    // reach across the local XZ plane.
    const ax = rotateAxis(box.qx, box.qy, box.qz, box.qw, 1, 0, 0);
    const az = rotateAxis(box.qx, box.qy, box.qz, box.qw, 0, 0, 1);
    const crossReach = hullReachInPlane(quatInv.x, quatInv.y, quatInv.z, quatInv.w, hx, hy, hz, ax.x, ax.y, ax.z, az.x, az.y, az.z);
    const localPlayerRadius = crossReach / radialScale;
    const ay = rotateAxis(box.qx, box.qy, box.qz, box.qw, 0, 1, 0);
    const yReach = hullSupport(quatInv.x, quatInv.y, quatInv.z, quatInv.w, hx, hy, hz, ay.x, ay.y, ay.z);
    const yAllowance = yReach / scaleY;
    const dqx = -box.qx;
    const dqy = -box.qy;
    const dqz = -box.qz;
    const dqw = box.qw;
    const lx = pos.x - obstacle.x;
    const ly = pos.y - obstacle.y;
    const lz = pos.z - obstacle.z;
    const ltx = 2 * (dqy * lz - dqz * ly);
    const lty = 2 * (dqz * lx - dqx * lz);
    const ltz = 2 * (dqx * ly - dqy * lx);
    const localX = (lx + dqw * ltx + (dqy * ltz - dqz * lty)) / scaleX;
    const localY = (ly + dqw * lty + (dqz * ltx - dqx * ltz)) / scaleY;
    const localZ = (lz + dqw * ltz + (dqx * lty - dqy * ltx)) / scaleZ;
    const profile = GRAVEYARD_GEOMETRY_PROFILES.engine;
    if (localY < -profile.halfHeight - yAllowance || localY > profile.halfHeight + yAllowance)
        return false;
    const surfaceY = clamp(localY, -profile.halfHeight, profile.halfHeight);
    const yFraction = (surfaceY + profile.halfHeight) / (profile.halfHeight * 2);
    const wallRadius = profile.radiusBottom + (profile.radiusTop - profile.radiusBottom) * yFraction;
    const innerRadius = Math.max(0.05, wallRadius - profile.wallThickness);
    const radial = Math.hypot(localX, localZ);
    const radialDirectionX = radial > 1e-6 ? localX / radial : 1;
    const radialDirectionZ = radial > 1e-6 ? localZ / radial : 0;
    let distanceToWall;
    let normalSign;
    if (radial < innerRadius) {
        distanceToWall = innerRadius - radial;
        if (distanceToWall >= localPlayerRadius)
            return false;
        normalSign = -1;
    }
    else if (radial > wallRadius) {
        distanceToWall = radial - wallRadius;
        if (distanceToWall >= localPlayerRadius)
            return false;
        normalSign = 1;
    }
    else {
        const innerDistance = radial - innerRadius;
        const outerDistance = wallRadius - radial;
        distanceToWall = Math.min(innerDistance, outerDistance);
        normalSign = innerDistance <= outerDistance ? -1 : 1;
    }
    const pushLocal = localPlayerRadius - distanceToWall + 0.08 / radialScale;
    const wx = normalSign * radialDirectionX * pushLocal * scaleX;
    const wz = normalSign * radialDirectionZ * pushLocal * scaleZ;
    const push = Math.hypot(wx, wz);
    if (push < 1e-6)
        return false;
    const we = rotateAxis(box.qx, box.qy, box.qz, box.qw, wx / push, 0, wz / push);
    contact.x = we.x;
    contact.y = we.y;
    contact.z = we.z;
    contact.push = push;
    return true;
};

// Ship vs ship: ellipsoid vs oriented ellipsoid. B is transformed into A's
// unit-sphere frame (A's hull is the unit sphere there), then the closest
// point on B's ellipsoid to the origin is found exactly via the quadratic
// minimizer on the unit sphere — the KKT condition reduces to a 1-D
// monotone equation in λ, solved with a deterministic bisection (the
// distance between two smooth, near shapes; broadphase rejects everything
// far apart first). The contact normal points from B toward A.
export const hullVsHull = (posA, hullA, quatA, posB, hullB, quatB, contact) => {
    const eax = hullA[0];
    const eay = hullA[1];
    const eaz = hullA[2];
    const ebx = hullB[0];
    const eby = hullB[1];
    const ebz = hullB[2];
    // Broadphase: sphere of each hull's longest extent around its centre.
    const ra = Math.max(eax, eay, eaz);
    const rb = Math.max(ebx, eby, ebz);
    const gx = posB.x - posA.x;
    const gy = posB.y - posA.y;
    const gz = posB.z - posA.z;
    const gapSq = gx * gx + gy * gy + gz * gz;
    const reachSum = ra + rb;
    if (gapSq >= reachSum * reachSum)
        return false;
    // B's centre and orientation in A's frame.
    const qax = quatA.x;
    const qay = quatA.y;
    const qaz = quatA.z;
    const qaw = quatA.w;
    const iqx = -qax;
    const iqy = -qay;
    const iqz = -qaz;
    const iqw = qaw;
    const tX = 2 * (iqy * gz - iqz * gy);
    const tY = 2 * (iqz * gx - iqx * gz);
    const tZ = 2 * (iqx * gy - iqy * gx);
    const cbx = gx + iqw * tX + (iqy * tZ - iqz * tY);
    const cby = gy + iqw * tY + (iqz * tX - iqx * tZ);
    const cbz = gz + iqw * tZ + (iqx * tY - iqy * tX);
    // qAB = qA^-1 * qB (rotate B's local frame into A's frame).
    const qbw = quatB.w;
    const qbx = quatB.x;
    const qby = quatB.y;
    const qbz = quatB.z;
    const abw = iqw * qbw - iqx * qbx - iqy * qby - iqz * qbz;
    const abx = iqw * qbx + iqx * qbw + iqy * qbz - iqz * qby;
    const aby = iqw * qby - iqx * qbz + iqy * qbw + iqz * qbx;
    const abz = iqw * qbz + iqx * qby - iqy * qbx + iqz * qbw;
    // Query point (origin) in B's local frame: v = conj(ab) ⊙ (0 - cb),
    // i.e. rotate -cb by the inverse of B's-in-A orientation. Using the
    // shared quaternion-rotate primitive keeps the convention identical to
    // the rest of the module (the hand-rolled matrix had a transposed row).
    // conj(ab) = (-abx, -aby, -abz, abw): rotate -cb by the conjugate so the
    // query lands in B's local frame.
    const cabx = -abx;
    const caby = -aby;
    const cabz = -abz;
    const ncx = -cbx;
    const ncy = -cby;
    const ncz = -cbz;
    const tvx = 2 * (caby * ncz - cabz * ncy);
    const tvy = 2 * (cabz * ncx - cabx * ncz);
    const tvz = 2 * (cabx * ncy - caby * ncx);
    const vx = ncx + abw * tvx + (caby * tvz - cabz * tvy);
    const vy = ncy + abw * tvy + (cabz * tvx - cabx * tvz);
    const vz = ncz + abw * tvz + (cabx * tvy - caby * tvx);
    // A's centre inside B? When the hull centre is INSIDE the other hull, the
    // closest surface point lies BEHIND the centre, so the (centre − surface
    // point) normal points INTO the other hull and the push jams the ship
    // deeper every frame instead of separating — a fast ram can embed the
    // player's centre inside an Atlas's tail in a single frame. Exit radially
    // from B's centre instead, the direction every ray leaves an ellipsoid.
    const cbLen = Math.hypot(cbx, cby, cbz);
    if (cbLen > 1e-9) {
        const ux = ncx / cbLen;
        const uy = ncy / cbLen;
        const uz = ncz / cbLen;
        // B's support along û: rotate û into B's local frame (conj(ab) ⊙ û).
        const tux = 2 * (caby * uz - cabz * uy);
        const tuy = 2 * (cabz * ux - cabx * uz);
        const tuz = 2 * (cabx * uy - caby * ux);
        const bx = ux + abw * tux + (caby * tuz - cabz * tuy);
        const by = uy + abw * tuy + (cabz * tux - cabx * tuz);
        const bz = uz + abw * tuz + (cabx * tuy - caby * tux);
        const supportB = Math.hypot(ebx * bx, eby * by, ebz * bz);
        if (cbLen < supportB) {
            const supportA = Math.hypot(eax * ux, eay * uy, eaz * uz);
            const push = supportA + supportB - cbLen;
            if (push <= 0)
                return false;
            // Rotate û into world space with A's orientation.
            const t2x = 2 * (qay * uz - qaz * uy);
            const t2y = 2 * (qaz * ux - qax * uz);
            const t2z = 2 * (qax * uy - qay * ux);
            contact.x = ux + qaw * t2x + (qay * t2z - qaz * t2y);
            contact.y = uy + qaw * t2y + (qaz * t2x - qax * t2z);
            contact.z = uz + qaw * t2z + (qax * t2y - qay * t2x);
            contact.push = push;
            return true;
        }
    }
    // a_i = eB_i · v_i.
    const a1 = ebx * vx;
    const a2 = eby * vy;
    const a3 = ebz * vz;
    const minE = Math.min(ebx, eby, ebz);
    const maxE = Math.max(ebx, eby, ebz);
    // Solve Σ a_i² / (e_i² - λ)² = 1 for λ < min(e_i²). g is strictly
    // increasing on that interval (g(-∞) = -1, g(min²⁻) = +∞), so bisection
    // is exact and deterministic.
    const g = (lam) => {
        const t1 = a1 / (ebx * ebx - lam);
        const t2 = a2 / (eby * eby - lam);
        const t3 = a3 / (ebz * ebz - lam);
        return t1 * t1 + t2 * t2 + t3 * t3 - 1;
    };
    let lam;
    if (a1 * a1 + a2 * a2 + a3 * a3 < 1e-12) {
        // Query point is exactly at B's centre: distance is the smallest
        // semi-axis.
        lam = 0;
    }
    else {
        let lo = -(maxE * maxE + reachSum * reachSum + 4);
        let hi = minE * minE * (1 - 1e-9);
        for (let i = 0; i < 60; i += 1) {
            const mid = (lo + hi) * 0.5;
            if (g(mid) < 0)
                lo = mid;
            else
                hi = mid;
        }
        lam = (lo + hi) * 0.5;
    }
    const u1 = a1 / (ebx * ebx - lam);
    const u2 = a2 / (eby * eby - lam);
    const u3 = a3 / (ebz * ebz - lam);
    // Closest point on B to the origin, in A's frame.
    const ux = u1 * ebx;
    const uy = u2 * eby;
    const uz = u3 * ebz;
    const tpx = 2 * (aby * uz - abz * uy);
    const tpy = 2 * (abz * ux - abx * uz);
    const tpz = 2 * (abx * uy - aby * ux);
    const px = cbx + ux + abw * tpx + (aby * tpz - abz * tpy);
    const py = cby + uy + abw * tpy + (abz * tpx - abx * tpz);
    const pz = cbz + uz + abw * tpz + (abx * tpy - aby * tpx);
    const dist = Math.hypot(px, py, pz);
    if (dist < 1e-9) {
        // B's centre coincides with the origin: any axis is a valid exit.
        contact.x = 1;
        contact.y = 0;
        contact.z = 0;
        contact.push = Math.min(eax, eay, eaz);
        return true;
    }
    // Normal from B's surface point toward A's centre, in A's frame.
    const nx = -px / dist;
    const ny = -py / dist;
    const nz = -pz / dist;
    // A is an axis-aligned ellipsoid in its own frame: its surface reach along
    // this normal decides whether B's closest point is inside A.
    const supportA = Math.hypot(eax * nx, eay * ny, eaz * nz);
    if (dist >= supportA)
        return false;
    // Rotate the normal into world space with A's orientation.
    const t2x = 2 * (qay * nz - qaz * ny);
    const t2y = 2 * (qaz * nx - qax * nz);
    const t2z = 2 * (qax * ny - qay * nx);
    contact.x = nx + qaw * t2x + (qay * t2z - qaz * t2y);
    contact.y = ny + qaw * t2y + (qaz * t2x - qax * t2z);
    contact.z = nz + qaw * t2z + (qax * t2y - qay * t2x);
    contact.push = supportA - dist;
    return true;
};
