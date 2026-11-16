// Minimal software 3D renderer that outputs pixel art: z-buffered triangles,
// ramp-palette lighting with ordered dither, perspective-correct procedural
// face textures and a one-pixel object outline. It renders the cockpit
// interior once per layout (and the hand once per stick pose), so the output
// is a plain 2D canvas with zero per-frame GPU cost.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// Rotate v about unit axis k by angle a (Rodrigues).
export function rotate(v, k, a) {
    const c = Math.cos(a), s = Math.sin(a), d = dot(k, v) * (1 - c), x = cross(k, v);
    return [v[0] * c + x[0] * s + k[0] * d, v[1] * c + x[1] * s + k[1] * d, v[2] * c + x[2] * s + k[2] * d];
}

// Camera at `eye` looking along +z (x right, y up), optional pitch (radians,
// positive looks up). `fov` is vertical, in degrees.
export class Camera {
    constructor({ eye = [0, 0, 0], pitch = 0, fov = 70, width, height }) {
        this.eye = eye; this.w = width; this.h = height;
        this.f = (height / 2) / Math.tan(fov * Math.PI / 360);
        const c = Math.cos(pitch), s = Math.sin(pitch);
        this.fw = [0, s, c]; this.up = [0, c, -s]; this.rt = [1, 0, 0];
    }
    view(p) {
        const d = sub(p, this.eye);
        return [dot(d, this.rt), dot(d, this.up), dot(d, this.fw)];
    }
    project(p) {
        const [x, y, z] = this.view(p);
        return [this.w / 2 + x / z * this.f, this.h / 2 - y / z * this.f, z];
    }
    // Screen point (logical px) → world point on the plane (o, n).
    unproject(sx, sy, o, n) {
        const dir = norm(add(add(mul(this.rt, (sx - this.w / 2) / this.f), mul(this.up, -(sy - this.h / 2) / this.f)), this.fw));
        const t = dot(sub(o, this.eye), n) / dot(dir, n);
        return add(this.eye, mul(dir, t));
    }
}

// A mesh is a flat list of triangles: { p:[a,b,c], n:[na,nb,nc] | flat n,
// m: material, o: object id, uv: { o, u, v } (world texture frame) }.
export class Mesh {
    tris = [];
    nextId = 1;
    id() { return this.nextId++; }
    poly(points, m, o, opts = {}) {
        const n = opts.n ?? norm(cross(sub(points[1], points[0]), sub(points[2], points[0])));
        for (let i = 1; i + 1 < points.length; i++)
            this.tris.push({ p: [points[0], points[i], points[i + 1]], n, vn: opts.vn ? [opts.vn[0], opts.vn[i], opts.vn[i + 1]] : undefined, m, o, uv: opts.uv });
        return n;
    }
    // Quad with a texture frame anchored at its first corner (u along a→b, v along a→d).
    quad(a, b, c, d, m, o, opts = {}) {
        let uv = opts.uv;
        if (!uv) {
            const u = norm(sub(b, a)), dv = sub(d, a);
            uv = { o: a, u, v: norm(sub(dv, mul(u, dot(dv, u)))) };   // orthonormal: no shear
        }
        return this.poly([a, b, c, d], m, o, { ...opts, uv });
    }
    // Oriented box: centre, half extents along unit axes ax/ay/az. `mats`
    // may override per face: { front (−z, toward a +z-looking viewer), back,
    // top, bottom, left, right }.
    box(c, [hx, hy, hz], m, o, { ax = [1, 0, 0], ay = [0, 1, 0], az = [0, 0, 1], mats = {} } = {}) {
        const P = (sx, sy, sz) => add(add(add(c, mul(ax, sx * hx)), mul(ay, sy * hy)), mul(az, sz * hz));
        const f = (k, a, b, cc, d) => this.quad(a, b, cc, d, mats[k] ?? m, o);
        f('front', P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1), P(-1, -1, -1));
        f('back', P(1, 1, 1), P(-1, 1, 1), P(-1, -1, 1), P(1, -1, 1));
        f('top', P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1));
        f('bottom', P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1));
        f('left', P(-1, 1, 1), P(-1, 1, -1), P(-1, -1, -1), P(-1, -1, 1));
        f('right', P(1, 1, -1), P(1, 1, 1), P(1, -1, 1), P(1, -1, -1));
    }
    // Tube through rings: path points with radii (rx across `side`, ry across
    // the other normal); smooth normals, optional end caps.
    tube(path, radii, m, o, { sides = 8, side = [1, 0, 0], caps = true, flatten = 1 } = {}) {
        const rings = path.map((p, i) => {
            const t = norm(sub(path[Math.min(i + 1, path.length - 1)], path[Math.max(i - 1, 0)]));
            let a = norm(sub(side, mul(t, dot(side, t))));
            if (!Number.isFinite(a[0]) || Math.hypot(...a) < 0.5) a = norm(cross(t, [0, 1, 0]));
            const b = cross(t, a);
            const r = Array.isArray(radii) ? radii[i] : radii;
            return Array.from({ length: sides }, (_, k) => {
                const ang = k / sides * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
                const nrm = norm(add(mul(a, ca), mul(b, sa * flatten)));
                return { p: add(p, add(mul(a, ca * r), mul(b, sa * r * flatten))), n: nrm };
            });
        });
        for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < sides; k++) {
            const k2 = (k + 1) % sides, A = rings[i][k], B = rings[i][k2], C = rings[i + 1][k2], D = rings[i + 1][k];
            this.poly([A.p, B.p, C.p, D.p], m, o, { vn: [A.n, B.n, C.n, D.n] });
        }
        if (caps) {
            const cap = (ring, centre, dir) => {
                for (let k = 0; k < sides; k++) {
                    const a = ring[k].p, b = ring[(k + 1) % sides].p;
                    this.poly(dir > 0 ? [centre, a, b] : [centre, b, a], m, o);
                }
            };
            cap(rings[0], path[0], 1);
            cap(rings.at(-1), path.at(-1), -1);
        }
    }
    // Ellipsoid with smooth normals.
    blob(c, [rx, ry, rz], m, o, { ax = [1, 0, 0], ay = [0, 1, 0], az = [0, 0, 1], seg = 10 } = {}) {
        const P = (th, ph) => {
            const x = Math.cos(ph) * Math.cos(th), y = Math.sin(ph), z = Math.cos(ph) * Math.sin(th);
            return {
                p: add(c, add(add(mul(ax, x * rx), mul(ay, y * ry)), mul(az, z * rz))),
                n: norm(add(add(mul(ax, x / rx), mul(ay, y / ry)), mul(az, z / rz))),
            };
        };
        const rows = Math.max(4, Math.round(seg / 2));
        for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) {
            const t0 = i / seg * 2 * Math.PI, t1 = (i + 1) / seg * 2 * Math.PI;
            const p0 = -Math.PI / 2 + j / rows * Math.PI, p1 = -Math.PI / 2 + (j + 1) / rows * Math.PI;
            const A = P(t0, p0), B = P(t1, p0), C = P(t1, p1), D = P(t0, p1);
            this.poly([A.p, D.p, C.p, B.p], m, o, { vn: [A.n, D.n, C.n, B.n] });
        }
    }
}

// Material: { ramp: packed colours dark→light, tex?: (u, v, tri) => number
// (shade offset, ±1 = one full ramp) | { c: packed } , emit?: true (unlit),
// gloss?: 0–1 specular-ish lift }.
export function renderMesh(mesh, cam, pc, opts = {}) {
    const W = pc.w, H = pc.h, N = W * H;
    const zb = opts.zbuf ?? (opts.zbuf = new Float32Array(N));
    const ib = opts.idbuf ?? (opts.idbuf = new Uint16Array(N));
    if (!opts.keep) { zb.fill(0); ib.fill(0); }
    // Render a sub-rectangle of the camera image into pc (ox/oy = its origin).
    const ox = opts.ox ?? 0, oy = opts.oy ?? 0;
    const L = norm(opts.light ?? [-0.35, 0.8, -0.45]);
    const L2 = opts.fill ? norm(opts.fill) : undefined, fillK = opts.fillK ?? 0.18;
    const amb = opts.ambient ?? 0.32, near = opts.near ?? 0.02;
    const data = pc.data;
    const shadeOf = (n) => amb + (1 - amb) * Math.max(0, -dot(n, L)) + (L2 ? fillK * Math.max(0, -dot(n, L2)) : 0);
    for (const t of mesh.tris) {
        const V = t.p.map((p) => cam.view(p));
        // Back-face cull in view space (two-sided materials skip it).
        const fn = t.n;
        const toEye = sub(cam.eye, t.p[0]);
        if (!t.m.twoSided && !t.vn && dot(fn, toEye) <= 0) continue;
        // Smooth shapes are lit from the eye side whichever way they wind.
        if (t.vn && dot(fn, toEye) < 0 && !t.flipChecked) { t.flipChecked = true; }
        // Near clip (Sutherland–Hodgman against z = near).
        let poly = V.map((v, i) => ({ v, i }));
        if (V.some((v) => v[2] < near)) {
            const out = [];
            for (let i = 0; i < poly.length; i++) {
                const a = poly[i], b = poly[(i + 1) % poly.length];
                const ia = a.v[2] >= near, ibn = b.v[2] >= near;
                if (ia) out.push(a);
                if (ia !== ibn) {
                    const s = (near - a.v[2]) / (b.v[2] - a.v[2]);
                    out.push({ v: lerp3(a.v, b.v, s), w: [a, b, s] });
                }
            }
            if (out.length < 3) continue;
            poly = out;
        }
        // Per-vertex attributes: shade (smooth or flat) and texture coords.
        const flat = t.vn ? 0 : shadeOf(fn);
        const attr = (k) => {
            if (k.w) { const [a, b, s] = k.w; const A = attr(a), B = attr(b); return [A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s, A[2] + (B[2] - A[2]) * s]; }
            const p = t.p[k.i];
            let vn = t.vn?.[k.i];
            if (vn && dot(vn, sub(cam.eye, p)) < 0) vn = mul(vn, -1);
            const sh = vn ? shadeOf(vn) : flat;
            if (!t.uv) return [sh, 0, 0];
            const d = sub(p, t.uv.o);
            return [sh, dot(d, t.uv.u), dot(d, t.uv.v)];
        };
        const P = poly.map((k) => {
            const z = k.v[2];
            return { x: cam.w / 2 + k.v[0] / z * cam.f - ox, y: cam.h / 2 - k.v[1] / z * cam.f - oy, iz: 1 / z, a: attr(k) };
        });
        for (let i = 1; i + 1 < P.length; i++) rasterTri(P[0], P[i], P[i + 1], t, W, H, zb, ib, data, opts);
    }
    if (opts.outline !== false) outlinePass(pc, zb, ib, opts);
    return opts;
}

function rasterTri(a, b, c, t, W, H, zb, ib, data, opts) {
    const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(area) < 1e-9) return;
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))), x1 = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))), y1 = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
    if (x0 > x1 || y0 > y1) return;
    const m = t.m, ramp = m.ramp, rn = ramp.length - 1, tex = m.tex, id = t.o, inv = 1 / area;
    const sgn = area > 0 ? 1 : -1;
    for (let y = y0; y <= y1; y++) {
        const py = y + 0.5;
        for (let x = x0; x <= x1; x++) {
            const px = x + 0.5;
            let w0 = ((b.x - px) * (c.y - py) - (b.y - py) * (c.x - px)) * sgn;
            let w1 = ((c.x - px) * (a.y - py) - (c.y - py) * (a.x - px)) * sgn;
            let w2 = ((a.x - px) * (b.y - py) - (a.y - py) * (b.x - px)) * sgn;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            w0 *= inv * sgn; w1 *= inv * sgn; w2 *= inv * sgn;
            const iz = w0 * a.iz + w1 * b.iz + w2 * c.iz, i = y * W + x;
            if (iz <= zb[i]) continue;
            if (m.cut) { zb[i] = iz; ib[i] = 0; data[i] = 0; continue; }   // glass / occluder: clear
            const pa = w0 * a.iz, pb = w1 * b.iz, pc2 = w2 * c.iz, k = 1 / iz;
            let s = (pa * a.a[0] + pb * b.a[0] + pc2 * c.a[0]) * k;
            let col;
            if (tex) {
                const u = (pa * a.a[1] + pb * b.a[1] + pc2 * c.a[1]) * k, v = (pa * a.a[2] + pb * b.a[2] + pc2 * c.a[2]) * k;
                const r = tex(u, v, x, y);
                if (r === null) continue;            // cut-out
                if (typeof r === 'object') col = r.c;
                else s += r;
            }
            if (col === undefined) {
                if (m.emit) s = 1;
                const f = Math.max(0, Math.min(0.9999, s)) * rn, j = Math.floor(f);
                col = ramp[BAYER[(y & 3) * 4 + (x & 3)] < Math.round((f - j) * 16) ? j + 1 : j];
            }
            zb[i] = iz; ib[i] = id; data[i] = col;
        }
    }
}

// Dark line where a nearer object overlaps a farther one or empty space.
function outlinePass(pc, zb, ib, opts) {
    const { w, h, data } = pc, line = opts.outlineColour, mark = new Uint8Array(w * h);
    const outer = opts.outerOutline !== false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, id = ib[i];
        const test = (j) => {
            const o = ib[j];
            if (o === id) return;
            if (!id) { if (outer) mark[i] = 1; return; }
            if (!o) return;
            if (zb[j] > zb[i] * 1.004) mark[i] = 1;   // neighbour is nearer
        };
        if (x > 0) test(i - 1); if (x < w - 1) test(i + 1); if (y > 0) test(i - w); if (y < h - 1) test(i + w);
    }
    for (let i = 0; i < mark.length; i++) if (mark[i]) data[i] = line;
}

export function ditherPick(ramp, s, x, y) {
    const rn = ramp.length - 1, f = Math.max(0, Math.min(0.9999, s)) * rn, j = Math.floor(f);
    return ramp[BAYER[(y & 3) * 4 + (x & 3)] < Math.round((f - j) * 16) ? j + 1 : j];
}
