// 3D cockpit scene for the code-drawn kit. Coordinates: metres, pilot eye at
// the origin, +z forward, +y up, +x right. The canopy frame follows the hull
// model's real pane seams (plan view exact); its vertical profile is remapped
// so the windscreen fills the view the flight camera actually shows.
import { Mesh, Camera, add, sub, mul, norm, cross, dot, lerp3, rotate } from './pixel3d.js';
import { rgba } from './pixelCanvas.js';
import { WAYFARER_CANOPY_GLASS } from './canopyWayfarer.js';

const R = (...hex) => hex.map(rgba);
export const KIT_MATERIALS = {
    frame: { ramp: R('#090d16', '#121a29', '#1c283b', '#283850', '#384c68', '#4f6787', '#7189aa') },
    trim: { ramp: R('#2b261c', '#4a4232', '#6d634b', '#938766', '#b8ab89', '#d8cdae', '#f2e9cf') },
    wall: { ramp: R('#05080f', '#0a101c', '#111a2b', '#18253b', '#21314c', '#2c3f5f') },
    panel: { ramp: R('#06090f', '#0c121d', '#141d2c', '#1d293d', '#283850', '#344867') },
    metal: { ramp: R('#14171d', '#232830', '#363c47', '#4d5562', '#6b7482', '#929cab', '#c3cbd6') },
    rubber: { ramp: R('#08090c', '#101216', '#191c22', '#24282f', '#30353e', '#3f4550') },
    grip: { ramp: R('#0a0b0e', '#14161b', '#1f2229', '#2b2f38', '#3a3f4a', '#4e5462') },
    glove: { ramp: R('#20140a', '#3a2614', '#563a20', '#77542f', '#9a7243', '#bd935e', '#dcb886', '#f0d6a8') },
    cuff: { ramp: R('#1c130b', '#2e2014', '#45311f', '#5f452c', '#7a5b3b') },
    sleeve: { ramp: R('#0b1428', '#122041', '#1a2e5a', '#244075', '#30548f', '#4268a8', '#5a82c2') },
    recess: { ramp: R('#020409', '#04070e', '#070b15') },
    red: { ramp: R('#3a0b08', '#6a1611', '#9b241b', '#c8382c', '#e65a43', '#ff8a6a') },
    amber: { ramp: R('#4a2a06', '#7a470c', '#b06a14', '#e0952a', '#ffb83d', '#ffe39a') },
    teal: { ramp: R('#06231f', '#0d3a35', '#16564f', '#21786f', '#36a093', '#69d6c4') },
    blue: { ramp: R('#08162e', '#0f2648', '#173a6a', '#2353904', '#2f63a8', '#4c84c8', '#7aa8e0') },
    hazard: { ramp: R('#1b1a17', '#e9b03a') },
};
KIT_MATERIALS.blue.ramp = R('#08162e', '#0f2648', '#173a6a', '#22508c', '#2f63a8', '#4c84c8', '#7aa8e0');
const lightOf = (hex) => ({ ramp: R(hex), emit: true });
export const LIGHTS = { amber: lightOf('#ffb83d'), green: lightOf('#7dffb0'), red: lightOf('#ff5a46'), cyan: lightOf('#69e4f2'), dim: lightOf('#3b2a12'), dimGreen: lightOf('#173a26') };

// ---- textures (u, v in metres on the face) -----------------------------
const frac = (x) => x - Math.floor(x);
// Riveted plating: seams every `step` m, rivets along them.
export const plating = (step = 0.12, rivet = 0.025) => (u, v) => {
    const sv = step * 0.75, fu = frac(u / step), fv = frac(v / sv);
    const du = Math.min(fu, 1 - fu) * step, dv = Math.min(fv, 1 - fv) * sv;
    if (du < 0.004 || dv < 0.004) return -0.36;               // seam
    if (fu < 0.5 ? du < 0.008 : false) return 0.1;            // lit seam lip
    if (fv < 0.5 && dv < 0.008) return 0.1;
    // Rivets in from each seam.
    const ru = frac(u / rivet) - 0.5;
    if (dv > 0.009 && dv < 0.016 && Math.abs(ru) < 0.16) return ru < 0 ? 0.32 : -0.2;
    return -0.06 * fv;                                         // plates catch light at the top
};
const vents = (pitch = 0.016) => (u, v) => (frac(v / pitch) < 0.45 ? -0.55 : 0.08);
const hazardTex = (u, v) => ({ c: KIT_MATERIALS.hazard.ramp[frac((u + v) / 0.05) < 0.5 ? 0 : 1] });

// ---- canopy (wayfarer.glb pane seams; native X fwd, Y up, Z side) ---------
export const WAYFARER_CANOPY = {
    // Roof/side seam rail, rear → front.
    rail: [[0.742, 0.131], [0.82, 0.097], [0.828, 0.093], [0.878, 0.071], [0.886, 0.067], [0.942, 0.042]],
    railZ: 0.0525,
    // Lower edge of the side panes (sill), rear → front, with Z.
    sill: [[0.74, 0.077, 0.125], [0.82, 0.046, 0.121], [0.827, 0.04, 0.118], [0.878, 0.02, 0.115], [0.886, 0.016, 0.114], [0.942, 0.04, 0.059]],
    bows: [0.824, 0.882],                       // cross frames between bays
    roofY: (X) => (X < 0.824 ? 0.134 - (X - 0.741) * 0.44 : X < 0.882 ? 0.095 - (X - 0.828) * 0.44 : 0.07 - (X - 0.886) * 0.46),
    tip: [0.943, 0.044, 0.05],
};

// ---- per-hull scene specs -----------------------------------------------
export const COCKPIT_SCENES = {
    wayfarer: {
        canopy: WAYFARER_CANOPY, glass: WAYFARER_CANOPY_GLASS, scale: 6.1,
        eye: 0.70, ky: 2.7, kx: 1.85, fov: 70,
        dashZ: 0.9, stickDepth: 0.45, gripScale: 0.08,
    },
};

// Frames shared by the static render and the animated parts (deterministic).
export function cockpitFrames(L, spec, cam) {
    const facing = (o, tiltUp = 0) => norm(add(mul(norm(o), -1), [0, tiltUp, 0]));
    const basis = (n) => { const rt = norm(cross(n, [0, 1, 0])), up = cross(rt, n); return { rt, up, n }; };
    // Dash face: tilted back toward the pilot.
    const dashN = norm([0, 0.3, -1]), dashO = [0, 0, spec.dashZ];
    // Weapons console: a plate facing the eye, through the caps' centroid.
    const caps = Object.values(L.buttons).map((b) => b.cap);
    const cx = caps.reduce((t, c) => t + c.x + c.w / 2, 0) / caps.length, cy = caps.reduce((t, c) => t + c.y + c.h / 2, 0) / caps.length;
    const rC = cam.unproject(cx, cy, [0, 0, 0.6], [0, 0, -1]);
    const right = { o: rC, ...basis(facing(rC, 0.55)) };
    // Throttle tower face on the left.
    const tr = L.throttle.track;
    const tC = cam.unproject(tr.x + tr.w / 2, tr.y + tr.h / 2, [0, 0, 0.55], [0, 0, -1]);
    const tower = { o: tC, ...basis(facing(tC, 0.1)) };
    const on = (f, sx, sy) => cam.unproject(sx, sy, f.o, f.n);
    return { dash: { o: dashO, ...basis(dashN) }, right, tower, on };
}

const ICONS = {
    fire: ['....#....', '....#....', '..#####..', '.##...##.', '###.#.###', '.##...##.', '..#####..', '....#....', '....#....'],
    missile: ['....#....', '...###...', '...###...', '...###...', '...###...', '...###...', '..#####..', '.##.#.##.', '.#..#..#.'],
    afterburner: ['....#....', '...##....', '...###...', '..####...', '..##.##..', '.##..##..', '.##.###..', '..#####..', '...###...'],
    mine: ['.######..', '#......#.', '.....##..', '....##...', '...##....', '..##.....', '.##......', '##.......', '#........'],
    salvage: ['..##.##..', '.#.....#.', '.#.....#.', '..#...#..', '...###...', '....#....', '....#....', '....#....', '...###...'],
    scan: ['...###...', '.##...##.', '.#..#..#.', '#..###..#', '#.#####.#', '#..###..#', '.#..#..#.', '.##...##.', '...###...'],
    capture: ['.#######.', '.#.....#.', '.#######.', '..#...#..', '..#####..', '...#.#...', '...###...', '....#....', '.........'],
    brake: ['.........', '#.......#', '.#.....#.', '..#...#..', '.#.....#.', '#.......#', '.........', '.........', '.........'],
};

export function buildCockpit(L, spec, cam) {
    let mesh = new Mesh();
    const M = KIT_MATERIALS, C = spec.canopy, S = spec.scale, eye = spec.eye;
    const kx = spec.kx ?? 1;
    // Solve the vertical offset so the windscreen base sits on the dash top,
    // then stretch further if needed so no bow crosses the aiming reticle.
    const tipZ0 = (C.tip[0] - eye) * S, tipRow = L.dashTop - L.lip - 3;
    const reticleTop = (L.cssHeight / 2 - 52 - 14) / L.unit;
    let ky = spec.ky, yc;
    for (let i = 0; i < 60; i++) {
        yc = C.tip[1] + (tipRow - L.h / 2) / cam.f * tipZ0 / (S * ky);
        // Lowest edge of the forward bow: the pane behind it, minus the beam depth.
        const X = Math.max(...C.bows) + 0.004, row = cam.project([0, (C.roofY(X) - yc) * S * ky - 0.07, (X - eye) * S])[1];
        if (row <= reticleTop) break;
        ky += 0.15;
    }
    const P = (X, Y, Z) => [Z * S * kx, (Y - yc) * S * ky, (X - eye) * S];
    const F = cockpitFrames(L, spec, cam);
    const beam = (a, b, w, d, m, o, up) => {
        const dir = norm(sub(b, a));
        const side = norm(cross(dir, up));
        let inward = norm(cross(side, dir));
        if (dot(inward, mul(add(a, b), -0.5)) < 0) inward = mul(inward, -1);
        const k = (p) => [add(p, mul(side, w / 2)), add(p, mul(side, -w / 2)), add(add(p, mul(side, -w / 2)), mul(inward, d)), add(add(p, mul(side, w / 2)), mul(inward, d))];
        const A = k(a), B = k(b);
        for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0]]) mesh.quad(A[i], A[j], B[j], B[i], m, o);
        return { side, inward };
    };
    const box = (c, h, m, f, mats) => mesh.box(c, h, m, mesh.id(), { ax: f.rt, ay: f.up, az: mul(f.n, -1), mats });
    const lamp = (p, f, size, light) => {
        box(add(p, mul(f.n, size * 0.3)), [size * 1.5, size * 1.2, size * 0.4], M.recess, f);
        box(add(p, mul(f.n, size * 0.6)), [size, size * 0.7, size * 0.3], light, f);
    };
    const frameMat = { ...M.frame, tex: plating(0.18, 0.03), twoSided: true };
    const trimMat = { ...M.trim, tex: plating(0.35, 0.035), twoSided: true };

    // ---- canopy: one shell with the real glass panes cut out ------------
    const rail = [[0.6, 0.2], ...C.rail], sill = [[0.6, 0.16, 0.125], ...C.sill];
    const shellId = mesh.id();
    for (let i = 0; i + 1 < rail.length; i++) {
        const [Xa, Ya] = rail[i], [Xb, Yb] = rail[i + 1];
        mesh.quad(P(Xa, Ya, -C.railZ), P(Xa, Ya, C.railZ), P(Xb, Yb, C.railZ), P(Xb, Yb, -C.railZ), frameMat, shellId);
        for (const sgn of [-1, 1]) {
            const [Sa, Ta, Za] = sill[i], [Sb, Tb, Zb] = sill[i + 1];
            mesh.quad(P(Xa, Ya, sgn * C.railZ), P(Sa, Ta, sgn * Za), P(Sb, Tb, sgn * Zb), P(Xb, Yb, sgn * C.railZ), frameMat, shellId);
        }
    }
    const glass = { ramp: [0], cut: true, twoSided: true };
    for (const tri of spec.glass) mesh.poly(tri.map(([X, Y, Z]) => mul(P(X, Y, Z), 0.95)), glass, 0);
    // Inner flanges on rails and bows, cream sill trim, latches.
    for (const sgn of [-1, 1]) {
        const rp = C.rail.map(([X, Y]) => P(X, Y, sgn * C.railZ));
        const rid = mesh.id();
        for (let i = 0; i + 1 < rp.length; i++) beam(rp[i], rp[i + 1], 0.045, 0.045, frameMat, rid, [0, 0, 1]);
        const sp = C.sill.map(([X, Y, Z]) => P(X, Y, sgn * Z));
        const sid = mesh.id();
        for (let i = 0; i + 1 < sp.length; i++) beam(sp[i], sp[i + 1], 0.06, 0.07, trimMat, sid, [0, 0, 1]);
    }
    for (const X of C.bows) {
        const roofY = C.roofY(X), oid = mesh.id();
        const pts = [P(X, roofY, -C.railZ), P(X, roofY + 0.002, 0), P(X, roofY, C.railZ)];
        for (let i = 0; i + 1 < pts.length; i++) beam(pts[i], pts[i + 1], 0.04, 0.05, frameMat, oid, [0, 0, 1]);
    }
    // Hull walls below the sills, with a cable conduit and vent grilles.
    for (const sgn of [-1, 1]) {
        const oid = mesh.id();
        const sp = sill.map(([X, Y, Z]) => P(X, Y, sgn * Z));
        for (let i = 0; i + 1 < sp.length; i++) {
            const a = sp[i], b = sp[i + 1];
            mesh.quad(a, b, [b[0] * 1.08, -2.4, b[2]], [a[0] * 1.08, -2.4, a[2]], { ...M.wall, tex: plating(0.24, 0.035), twoSided: true }, oid);
        }
        const cond = sp.slice(1, -1).map((p) => add(p, [-sgn * 0.06, -0.16, 0]));
        mesh.tube(cond, 0.022, M.metal, mesh.id(), { sides: 8, side: [0, 1, 0] });
        mesh.tube(cond.map((p) => add(p, [0, -0.055, 0])), 0.016, M.rubber, mesh.id(), { sides: 8, side: [0, 1, 0] });
    }

    // Everything below is cockpit interior: rendered in a second pass so the
    // canopy glass (closer at the screen edges) never hides it.
    const canopy = mesh;
    mesh = new Mesh();
    mesh.nextId = canopy.nextId + 1;
    // ---- dash ----------------------------------------------------------
    const D = F.dash, on = (sx, sy, f = D) => F.on(f, sx, sy);
    const dl = 0, dr = L.w;
    const top = L.dashTop - L.lip - 1;
    const dTL = on(dl, top), dTR = on(dr, top), dBL = on(dl, L.h + 6), dBR = on(dr, L.h + 6);
    mesh.quad(dTL, dTR, dBR, dBL, { ...M.panel, tex: plating(0.16, 0.03) }, mesh.id());
    // Hood back to the windscreen base, rounded cream lip on its edge.
    const tip = P(C.tip[0], C.tip[1], 0);
    mesh.quad([dTL[0] * 1.3, tip[1] - 0.01, tip[2]], [dTR[0] * 1.3, tip[1] - 0.01, tip[2]], add(dTR, [0, 0.04, 0]), add(dTL, [0, 0.04, 0]), { ...M.frame, tex: plating(0.3, 0.04) }, mesh.id());
    mesh.tube([add(dTL, [0, -0.004, -0.02]), add(dTR, [0, -0.004, -0.02])], 0.02, M.trim, mesh.id(), { sides: 10, side: [0, 1, 0], caps: false });
    // Monitor housings: raised cream frames whose inner edge is the live glass.
    const hd = 0.035;
    const Dout = { o: add(D.o, mul(D.n, hd)), n: D.n, rt: D.rt, up: D.up };
    for (const key of ['own', 'radar', 'target']) {
        const g = L.monitors[key].glass, o = L.monitors[key].outer, oid = mesh.id();
        const iTL = on(g.x, g.y, Dout), iTR = on(g.x + g.w, g.y, Dout), iBR = on(g.x + g.w, g.y + g.h, Dout), iBL = on(g.x, g.y + g.h, Dout);
        const oTL = on(o.x, o.y, Dout), oTR = on(o.x + o.w, o.y, Dout), oBR = on(o.x + o.w, o.y + o.h, Dout), oBL = on(o.x, o.y + o.h, Dout);
        const back = (p) => sub(p, mul(D.n, hd));
        const tm = { ...M.trim, tex: plating(0.6, 0.03) };
        mesh.quad(oTL, oTR, iTR, iTL, tm, oid); mesh.quad(iBL, iBR, oBR, oBL, { ...M.trim, ramp: M.trim.ramp.slice(0, 6) }, oid);
        mesh.quad(oTL, iTL, iBL, oBL, tm, oid); mesh.quad(iTR, oTR, oBR, iBR, { ...M.trim, ramp: M.trim.ramp.slice(0, 6) }, oid);
        mesh.quad(back(oTL), back(oTR), oTR, oTL, M.trim, oid); mesh.quad(oBL, oBR, back(oBR), back(oBL), M.trim, oid);
        mesh.quad(back(oTL), oTL, oBL, back(oBL), M.trim, oid); mesh.quad(oTR, back(oTR), back(oBR), oBR, M.trim, oid);
        const sc = 0.006;
        for (const [sx, sy] of [[o.x + 2.5, o.y + 2.5], [o.x + o.w - 2.5, o.y + 2.5], [o.x + 2.5, o.y + o.h - 2.5], [o.x + o.w - 2.5, o.y + o.h - 2.5]])
            box(add(on(sx, sy, Dout), mul(D.n, 0.003)), [sc, sc, 0.003], M.metal, D);
        lamp(on(o.x + o.w - 6, o.y + o.h - L.b / 2, Dout), D, 0.006, key === 'target' ? LIGHTS.amber : LIGHTS.green);
    }
    // Instrument wings either side of the monitors: gauges and caution lamps.
    const wingX = [[L.groupLeft - L.b * 2.2, -1], [L.groupRight + L.b * 2.2, 1]];
    for (const [sx, sgn] of wingX) {
        const gy = L.monitors.own.outer.y + L.b * 2.5;
        // Round gauge with a lit face (needle angle differs per side).
        const gc = on(sx, gy), gr2 = Math.abs(on(sx + L.b * 1.4, gy)[0] - gc[0]);
        const ring = Array.from({ length: 14 }, (_, k) => { const a2 = k / 14 * Math.PI * 2; return add(add(gc, mul(D.rt, Math.cos(a2) * gr2)), add(mul(D.up, Math.sin(a2) * gr2), mul(D.n, 0.01))); });
        mesh.poly(ring.slice().reverse(), { ramp: M.recess.ramp, tex: (u, v) => {
            const r = Math.hypot(u, v) / gr2, ang = Math.atan2(v, u), need = sgn < 0 ? 2.3 : 0.7;
            if (r > 0.92) return { c: M.trim.ramp[4] };
            if (r > 0.78 && frac((ang + Math.PI) / (Math.PI * 2) * 12) < 0.18) return { c: LIGHTS.cyan.ramp[0] };
            if (r < 0.7 && Math.abs(Math.sin(ang - need)) * r < 0.06 && Math.cos(ang - need) > 0) return { c: LIGHTS.amber.ramp[0] };
            return { c: r < 0.18 ? M.metal.ramp[4] : M.recess.ramp[2] };
        } }, mesh.id(), { uv: { o: gc, u: D.rt, v: D.up } });
        for (let i = 0; i < 3; i++) lamp(on(sx - L.b * 0.9 + i * L.b * 0.9, gy + L.b * 2.8), D, 0.007, [LIGHTS.red, LIGHTS.amber, LIGHTS.dimGreen][(i + (sgn > 0 ? 1 : 0)) % 3]);
    }
    // Instrument pods on the glare shield above the side monitors: two dials each.
    const dial = (centre, rad, f, need, tint) => {
        const ring = Array.from({ length: 18 }, (_, k) => { const a2 = k / 18 * Math.PI * 2; return add(add(centre, mul(f.rt, Math.cos(a2) * rad)), mul(f.up, Math.sin(a2) * rad)); });
        mesh.poly(ring.slice().reverse(), { ramp: M.recess.ramp, tex: (u, v) => {
            const r = Math.hypot(u, v) / rad, ang = Math.atan2(v, u);
            if (r > 0.9) return { c: M.trim.ramp[r > 0.96 ? 3 : 5] };
            if (r > 0.72 && frac((ang + Math.PI) / (Math.PI * 2) * 16) < 0.22 && ang > -2.4 && ang < 2.4 + 3) return { c: tint };
            const d = ang - need;
            if (r < 0.74 && r > 0.08 && Math.abs(Math.sin(d)) * r < 0.07 && Math.cos(d) > 0) return { c: LIGHTS.amber.ramp[0] };
            return { c: r < 0.14 ? M.metal.ramp[5] : M.recess.ramp[1 + ((r * 6) | 0) % 2] };
        } }, mesh.id(), { uv: { o: centre, u: f.rt, v: f.up } });
    };
    for (const key of ['own', 'target']) {
        const o = L.monitors[key].outer, podW = Math.round(o.w * 0.42), podH = Math.round(podW * 0.42);
        const sx = o.x + o.w / 2 - podW / 2, sy = L.dashTop - L.lip - podH - 2;
        const pTL = on(sx, sy), pBR = on(sx + podW, sy + podH + L.lip + 2);
        const pC = lerp3(pTL, pBR, 0.5), pw = Math.abs(pBR[0] - pTL[0]) / 2, ph = Math.abs(pBR[1] - pTL[1]) / 2;
        box(add(pC, mul(D.n, 0.02)), [pw, ph, 0.05], { ...M.frame, tex: plating(0.08, 0.02) }, D, { front: M.panel });
        // Hood over the pod.
        box(add(add(pC, mul(D.up, ph)), mul(D.n, 0.04)), [pw * 1.06, 0.008, 0.07], M.trim, D);
        const rad = ph * 0.68;
        dial(add(add(pC, mul(D.rt, -pw * 0.48)), mul(D.n, 0.072)), rad, D, key === 'own' ? 2.0 : 0.9, LIGHTS.cyan.ramp[0]);
        dial(add(add(pC, mul(D.rt, pw * 0.1)), mul(D.n, 0.072)), rad, D, key === 'own' ? 0.4 : 2.6, LIGHTS.green.ramp[0]);
        for (let i = 0; i < 3; i++) lamp(add(add(pC, mul(D.rt, pw * 0.68)), mul(D.up, ph * (0.45 - i * 0.45))), D, rad * 0.16, [LIGHTS.red, LIGHTS.amber, LIGHTS.green][(i + (key === 'own' ? 0 : 1)) % 3]);
    }
    // Hyperdrive projector housing behind the live plate.
    const hp = L.hyper;
    const hTL = on(hp.x - 3, hp.y + 1, Dout), hBR = on(hp.x + hp.w + 3, hp.y + hp.h + 3, Dout);
    mesh.box(lerp3(hTL, hBR, 0.5), [Math.abs(hBR[0] - hTL[0]) / 2, Math.abs(hBR[1] - hTL[1]) / 2, 0.04], M.frame, mesh.id(), { ax: D.rt, ay: D.up, az: mul(D.n, -1) });

    // ---- left console under the stick hand, throttle tower ------------------
    const consoleTop = leftConsoleTop(L, cam);
    const lc = { ...M.panel, tex: plating(0.14, 0.03) };
    mesh.box([consoleTop.cx, consoleTop.y - 0.6, consoleTop.cz], [consoleTop.hw, 0.6, consoleTop.hd], lc, mesh.id(), { mats: { top: { ...M.frame, tex: plating(0.12, 0.025) } } });
    mesh.tube([[consoleTop.cx + consoleTop.hw * 0.98, consoleTop.y + 0.012, consoleTop.cz - consoleTop.hd], [consoleTop.cx + consoleTop.hw * 0.98, consoleTop.y + 0.012, consoleTop.cz + consoleTop.hd]], 0.018, M.trim, mesh.id(), { sides: 8 });
    // Switch row along the console's inner edge.
    for (let i = 0; i < 4; i++) {
        const p = [consoleTop.cx + consoleTop.hw * 0.6, consoleTop.y + 0.01, consoleTop.cz - consoleTop.hd * 0.7 + i * consoleTop.hd * 0.32];
        mesh.box(p, [0.018, 0.008, 0.014], M.recess, mesh.id());
        mesh.tube([add(p, [0, 0.006, 0]), add(p, [0, 0.04, -0.012])], 0.005, M.metal, mesh.id(), { sides: 6 });
        mesh.box(add(p, [0, 0.008, 0.02]), [0.006, 0.004, 0.004], [LIGHTS.green, LIGHTS.green, LIGHTS.amber, LIGHTS.dim][i], mesh.id());
    }
    const T = F.tower, tr = L.throttle.track;
    const tTL = F.on(T, tr.x - 7, tr.y - 12), tBR = F.on(T, tr.x + tr.w + 7, tr.y + tr.h + 10);
    const tCtr = lerp3(tTL, tBR, 0.5), thw = Math.abs(dot(sub(tBR, tTL), T.rt)) / 2, thh = Math.abs(dot(sub(tBR, tTL), T.up)) / 2;
    box(add(tCtr, mul(T.n, -0.06)), [thw, thh, 0.06], { ...M.panel, tex: plating(0.1, 0.02) }, T, { front: { ...M.trim, tex: plating(0.4, 0.03) } });
    // Pedestal: the quadrant stands on the console, not in mid-air.
    const pedTop = add(tCtr, mul(T.up, -thh)), pedH = 0.5;
    box(add(add(pedTop, mul(T.up, -pedH / 2)), mul(T.n, -0.09)), [thw * 0.7, pedH / 2, 0.07], { ...M.frame, tex: plating(0.12, 0.025) }, T);
    const sTL = F.on(T, tr.x, tr.y), sBR = F.on(T, tr.x + tr.w, tr.y + tr.h);
    const sC = lerp3(sTL, sBR, 0.5);
    box(add(sC, mul(T.n, 0.002)), [Math.abs(dot(sub(sBR, sTL), T.rt)) / 2, Math.abs(dot(sub(sBR, sTL), T.up)) / 2, 0.003], M.recess, T);
    for (let i = 0; i <= 10; i++) {
        const p = F.on(T, tr.x + tr.w + 3, tr.y + tr.h * (1 - i / 10));
        box(add(p, mul(T.n, 0.003)), [i % 5 ? 0.006 : 0.011, 0.0018, 0.002], i === 10 ? LIGHTS.amber : M.frame, T);
    }

    // ---- weapons console: plate, wells, rack display ---------------------
    const Rf = F.right;
    const plate = L.rightPanel.map(([sx, sy]) => F.on(Rf, sx, sy));
    const pid = mesh.id(), down = mul(Rf.n, -0.12);
    mesh.poly(plate.slice().reverse(), { ...M.panel, ramp: M.panel.ramp, tex: plating(0.09, 0.02) }, pid);
    for (let i = 0; i < plate.length; i++) {
        const a = plate[i], b = plate[(i + 1) % plate.length];
        mesh.quad(a, b, add(b, down), add(a, down), { ...M.frame, tex: plating(0.1, 0.02) }, pid);
    }
    // Cream edge only along the plate's upper edges.
    mesh.tube([plate[4], plate[0], plate[1]].map((p) => add(p, mul(Rf.n, 0.004))), 0.008, M.trim, mesh.id(), { sides: 6, side: Rf.up });
    for (const [id, bt] of Object.entries(L.buttons)) {
        const c = bt.cap, ctr = F.on(Rf, c.x + c.w / 2, c.y + c.h / 2);
        const rx = Math.abs(dot(sub(F.on(Rf, c.x + c.w, c.y), F.on(Rf, c.x, c.y)), Rf.rt)) / 2;
        if (id === 'launcher') {
            const ry = Math.abs(dot(sub(F.on(Rf, c.x, c.y + c.h), F.on(Rf, c.x, c.y)), Rf.up)) / 2;
            box(add(ctr, mul(Rf.n, 0.004)), [rx * 1.18, ry * 1.4, 0.006], M.trim, Rf);
            box(add(ctr, mul(Rf.n, 0.008)), [rx, ry, 0.004], { ramp: R('#07140e', '#0b1d14'), emit: true }, Rf);
            continue;
        }
        // Recessed well with a cream rim.
        const ringPts = (r, lift) => Array.from({ length: 16 }, (_, k) => { const a2 = k / 16 * Math.PI * 2; return add(add(ctr, mul(Rf.n, lift)), add(mul(Rf.rt, Math.cos(a2) * r), mul(Rf.up, Math.sin(a2) * r))); });
        mesh.poly(ringPts(rx * 1.3, 0.003).reverse(), M.trim, mesh.id());
        mesh.poly(ringPts(rx * 1.12, 0.005).reverse(), M.recess, mesh.id());
        if (id === 'boost') {
            const hz = ringPts(rx * 1.55, 0.002).reverse();
            mesh.poly(hz, { ramp: [0], tex: (u, v) => ({ c: KIT_MATERIALS.hazard.ramp[frac((u + v) / 0.018) < 0.5 ? 0 : 1] }) }, mesh.id(), { uv: { o: ctr, u: Rf.rt, v: Rf.up } });
        }
    }
    // Status lamp row along the plate top.
    const prow = L.rightPanel[1];
    for (let i = 0; i < 4; i++) lamp(F.on(Rf, prow[0] - 10 - i * 7, prow[1] + 6), Rf, 0.005, [LIGHTS.green, LIGHTS.amber, LIGHTS.dimGreen, LIGHTS.red][i]);
    return { canopy, interior: mesh, yc };
}

// The left console's top plane, shared by the static render and the hand occluder.
export function leftConsoleTop(L, cam) {
    const zoneR = L.monitors.own.outer.x;
    const p = cam.unproject(zoneR * 0.55, L.h - L.stick.hand.S * 0.12, [0, 0, 0.5], [0, 0, -1]);
    return { cx: p[0] - 0.25, y: p[1], cz: 0.55, hw: 0.45, hd: 0.4 };
}

// Throttle lever handle at fraction t (0 idle … 1 full) on the tower slot.
export function buildThrottle(L, spec, cam, t) {
    const mesh = new Mesh(), M = KIT_MATERIALS, F = cockpitFrames(L, spec, cam), T = F.tower, tr = L.throttle.track;
    const p = F.on(T, tr.x + tr.w / 2, tr.y + tr.h * (1 - Math.max(0, Math.min(1, t))));
    const w = Math.abs(dot(sub(F.on(T, tr.x + tr.w, tr.y), F.on(T, tr.x, tr.y)), T.rt));
    const id = mesh.id(), f = { ax: T.rt, ay: T.up, az: mul(T.n, -1) };
    mesh.box(add(p, mul(T.n, 0.03)), [w * 0.22, w * 0.22, 0.03], M.metal, id, f);
    mesh.box(add(p, mul(T.n, 0.065)), [w * 1.25, w * 0.42, w * 0.38], M.grip, id, f);
    mesh.box(add(add(p, mul(T.n, 0.07)), mul(T.up, w * 0.42)), [w * 1.1, w * 0.08, w * 0.3], M.trim, id, f);
    return mesh;
}

// Console caps: state = { mode: 'fire'|'mine'|'salvage'|'teal'|'missile'|'boost',
// icon, pressed, disabled, hidden } per button.
export function buildCaps(L, spec, cam, states) {
    const mesh = new Mesh(), M = KIT_MATERIALS, F = cockpitFrames(L, spec, cam), Rf = F.right;
    const ramps = { fire: M.red, mine: M.amber, salvage: M.teal, teal: M.teal, missile: M.trim, boost: M.blue };
    for (const id of ['fire', 'missile', 'boost']) {
        const st = states[id];
        if (!st || st.hidden) continue;
        const c = L.buttons[id].cap, ctr = F.on(Rf, c.x + c.w / 2, c.y + c.h / 2);
        const r = Math.abs(dot(sub(F.on(Rf, c.x + c.w, c.y), F.on(Rf, c.x, c.y)), Rf.rt)) / 2;
        const h = r * (st.pressed ? 0.18 : 0.5);
        const base = ramps[st.mode] ?? M.red;
        // Disabled caps stay readable: same colour family, dimmed.
        const mat = st.disabled ? { ramp: base.ramp.slice(0, Math.max(3, base.ramp.length - 3)) } : st.pressed ? { ramp: base.ramp.slice(1) } : base;
        const oid = mesh.id();
        mesh.tube([add(ctr, mul(Rf.n, 0.004)), add(ctr, mul(Rf.n, h))], [r, r * 0.95], mat, oid, { sides: 16, side: Rf.rt, caps: false });
        const ring = Array.from({ length: 16 }, (_, k) => { const a2 = k / 16 * Math.PI * 2; return add(add(ctr, mul(Rf.n, h)), add(mul(Rf.rt, Math.cos(a2) * r * 0.95), mul(Rf.up, Math.sin(a2) * r * 0.95))); });
        const icon = ICONS[st.icon];
        const ink = st.disabled ? rgba('#6b6250') : st.mode === 'missile' ? rgba('#0d1b33') : rgba('#fff3cf');
        mesh.poly(ring.slice().reverse(), { ...mat, tex: (u, v) => {
            const rr = Math.hypot(u, v) / (r * 0.95);
            if (rr > 0.84) return v > 0 ? 0.22 : -0.18;             // bevel lit from above
            if (!icon) return 0.08 - v / r * 0.12;
            const gx = Math.floor((u / (r * 0.62) + 1) * 4.5), gy = Math.floor((1 - v / (r * 0.62)) * 4.5);
            if (gx >= 0 && gx < 9 && gy >= 0 && gy < 9 && icon[gy][gx] === '#') return { c: ink };
            return 0.08 - v / r * 0.12;
        } }, oid, { uv: { o: add(ctr, mul(Rf.n, h)), u: Rf.rt, v: Rf.up } });
    }
    return mesh;
}

export function kitCamera(L, opts = {}) {
    return new Camera({ eye: [0, 0, 0], fov: opts.fov ?? 70, width: L.w, height: L.h });
}

// ---- stick and hand ---------------------------------------------------------
// The stick pivots under the console. Its grip top is placed by unprojecting
// the layout's grip anchor, and its size follows the stick zone, so the hand
// fills the lower-left corner in true perspective on every screen.
export function buildHand(L, spec, pose, cam) {
    const mesh = new Mesh(), M = KIT_MATERIALS;
    const g = L.stick.grip, depth = spec.stickDepth;
    const top0 = cam.unproject(g.x, g.y, [0, 0, depth], [0, 0, -1]);
    const zoneW = L.monitors.own.glass.x;
    const gr = zoneW * (spec.gripScale ?? 0.12) / cam.f * depth;     // grip radius (world)
    const len = gr * 12, G = gr * 4.4;
    const pivot = add(top0, [0, -len, gr * 1.5]);
    const cl = (v) => Math.max(-1, Math.min(1, v || 0));
    const px = cl(pose.x), py = cl(pose.y), pr = cl(pose.r);
    // Lean: yaw tilts about +z, pitch tilts about +x (pull back = toward the eye).
    let axis = norm(sub(top0, pivot));
    axis = rotate(axis, [0, 0, 1], -px * 0.17);
    axis = rotate(axis, [1, 0, 0], -py * 0.2);
    const top = add(pivot, mul(axis, len));
    const a = axis;
    let r = norm(cross(a, [0, 0, 1])); if (r[0] < 0) r = mul(r, -1);
    let f = norm(cross(r, a)); if (f[2] < 0) f = mul(f, -1);
    const tw = pr * 0.35;
    const r2 = norm(add(mul(r, Math.cos(tw)), mul(f, Math.sin(tw)))), f2 = norm(add(mul(f, Math.cos(tw)), mul(r, -Math.sin(tw))));
    // Local frame in grip radii: ua along the stick (0 = top), ur right, uf forward.
    const at = (ua, ur, uf) => add(add(add(top, mul(a, ua * gr)), mul(r2, ur * gr)), mul(f2, uf * gr));
    const frame = { ax: r2, ay: a, az: f2 };
    const GL = G / gr;
    // Shaft and boot (mostly below the console edge).
    mesh.tube([at(-GL - 6, 0, 0), at(-GL + 0.2, 0, 0)], gr * 0.42, M.metal, mesh.id(), { sides: 8, side: r2 });
    mesh.tube([at(-GL - 0.6, 0, 0), at(-GL - 0.1, 0, 0)], gr * 0.85, M.rubber, mesh.id(), { sides: 10, side: r2 });
    // Grip: tapered, slightly flattened, with a forward-leaning head.
    const gid = mesh.id();
    mesh.tube([at(-GL, 0, 0), at(-GL * 0.6, 0, 0.15), at(-GL * 0.2, 0, 0.22), at(0, 0, 0.1)], [gr * 0.92, gr * 1.02, gr * 1.08, gr * 1.0], M.grip, gid, { sides: 12, side: r2, flatten: 0.86 });
    mesh.blob(at(0.15, 0, 0.25), [gr * 1.12, gr * 0.6, gr * 1.3], M.grip, gid, { ...frame, seg: 12 });
    // Hat switch (top-back) and red pickle (top-front).
    mesh.box(at(0.62, -0.05, -0.35), [gr * 0.34, gr * 0.2, gr * 0.3], M.metal, mesh.id(), frame);
    mesh.box(at(0.55, 0.45, 0.75), [gr * 0.24, gr * 0.16, gr * 0.24], M.red, mesh.id(), frame);
    // Forearm: from off-screen lower-left (in front of the eye, no clipping).
    const wrist = at(-GL * 0.62, -2.5, -1.3);
    // The forearm rests over the console, elbow back beside the pilot.
    const ctop = leftConsoleTop(L, cam);
    const elbow = [top[0] - gr * 14, ctop.y + gr * 2.5, 0.1];
    const sid = mesh.id();
    const fa = (t) => lerp3(elbow, wrist, t);
    mesh.tube([fa(0), fa(0.5), fa(0.96)], [gr * 3.4, gr * 2.9, gr * 2.25], M.sleeve, sid, { sides: 12, side: [0, 1, 0], caps: false });
    for (const t of [0.72, 0.82, 0.9]) mesh.tube([fa(t - 0.02), fa(t + 0.02)], gr * (3.55 - t * 1.5), { ramp: M.sleeve.ramp.slice(0, 4) }, sid, { sides: 12, side: [0, 1, 0], caps: false });
    // Gauntlet cuff.
    mesh.tube([fa(0.95), fa(0.975), fa(0.995)], [gr * 2.35, gr * 2.3, gr * 2.1], M.cuff, mesh.id(), { sides: 12, side: [0, 1, 0] });
    const hid = mesh.id();
    // Back of the hand, left of the grip, and a padded knuckle guard.
    mesh.blob(at(-GL * 0.45, -1.55, -0.45), [gr * 1.25, G * 0.5, gr * 1.7], M.glove, hid, { ...frame, seg: 14 });
    mesh.blob(at(-GL * 0.45, -2.15, -0.3), [gr * 0.5, G * 0.34, gr * 1.1], M.cuff, hid, { ...frame, seg: 10 });
    // Knuckle ridge and a wrist strap across the back of the glove.
    for (let i = 0; i < 4; i++) mesh.blob(at(-GL * (0.16 + i * 0.2), -1.05, -0.75), [gr * 0.42, gr * 0.36, gr * 0.42], M.glove, hid, { ...frame, seg: 8 });
    mesh.tube([at(-GL * 0.92, -2.9, -0.2), at(-GL * 0.95, -2.2, -1.7), at(-GL * 0.85, -0.9, -1.6)], gr * 0.3, M.cuff, mesh.id(), { sides: 6, side: a });
    // Fingers wrap from the knuckles (left) over the far side; only their
    // tips come round on the right. The index finger curls in on FIRE.
    const curl = pose.fire ? 0.12 : 0;
    const reaches = [1.72 + curl, 1.95, 1.88, 1.74];
    for (let i = 0; i < 4; i++) {
        const h = -GL * (0.16 + i * 0.2) - (i === 0 ? curl : 0), fr = gr * (0.44 - i * 0.03);
        const centre = at(h, 0, 0.12);
        const path = [];
        for (let k = 0; k <= 6; k++) {
            const ang = Math.PI * (1.08 - reaches[i] * k / 6 * 0.62);
            path.push(add(centre, add(mul(r2, Math.cos(ang) * gr * 1.4), mul(f2, Math.sin(ang) * gr * 1.4))));
        }
        mesh.tube(path, fr, M.glove, hid, { sides: 8, side: a });
    }
    // Thumb over the top, resting on the hat.
    mesh.tube([at(-GL * 0.28, -1.7, -0.9), at(0.35, -0.95, -0.85), at(0.75, 0.1, -0.35)], [gr * 0.64, gr * 0.52, gr * 0.44], M.glove, hid, { sides: 10, side: f2 });
    // The console top hides the shaft and boot below it.
    const ct = leftConsoleTop(L, cam);
    mesh.box([ct.cx, ct.y - 0.6, ct.cz], [ct.hw, 0.6, ct.hd], { ramp: [0], cut: true }, 0);
    return mesh;
}
