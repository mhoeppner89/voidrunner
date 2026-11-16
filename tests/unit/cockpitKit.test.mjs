import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutCockpitKit, kitUnit } from '../../src/game/cockpitKitLayout.js';
import { PixelCanvas } from '../../src/game/pixelCanvas.js';
import { renderMesh } from '../../src/game/pixel3d.js';
import { COCKPIT_SCENES, buildCockpit, buildHand, buildCaps, buildThrottle, kitCamera } from '../../src/game/cockpitScene.js';
import { handPoseKey } from '../../src/game/cockpitKit.js';

const VIEWPORTS = [
    { name: 'small phone', width: 667, height: 375, dpr: 2 },
    { name: 'pixel 7', width: 863, height: 360, dpr: 2.625 },
    { name: 'iphone 13', width: 750, height: 342, dpr: 3 },
    { name: 'iphone notch', width: 844, height: 390, dpr: 3, safe: { left: 47, right: 47, bottom: 21 } },
    { name: 'tablet', width: 1180, height: 820, dpr: 2 },
    { name: 'desktop', width: 1440, height: 900, dpr: 1 },
    { name: 'desktop 4:3', width: 1280, height: 1024, dpr: 1 },
    { name: 'ultrawide', width: 2560, height: 1080, dpr: 1 },
    { name: 'large touch', width: 900, height: 420, dpr: 2, touchScale: 1.3 },
];
const css = (r, u) => ({ x: r.x * u, y: r.y * u, r: (r.x + r.w) * u, b: (r.y + r.h) * u });
const overlap = (a, b) => a.x < b.r - 0.01 && b.x < a.r - 0.01 && a.y < b.b - 0.01 && b.y < a.b - 0.01;
const inside = (a, b) => a.x >= b.x - 0.01 && a.y >= b.y - 0.01 && a.r <= b.r + 0.01 && a.b <= b.b + 0.01;

test('pixel unit lands on whole device pixels with roughly 300 art rows', () => {
    for (const v of VIEWPORTS) {
        const u = kitUnit(v.height, v.dpr);
        assert.ok(Number.isInteger(Math.round(u * v.dpr * 1e6) / 1e6), `${v.name}: integer device pixels`);
        const rows = v.height / u;
        assert.ok(rows > 200 && rows < 420, `${v.name}: ${rows} rows`);
    }
});

test('cockpit kit layout keeps every module separate, on screen and consistently sized', () => {
    for (const v of VIEWPORTS) {
        const L = layoutCockpitKit(v), u = L.unit, view = { x: 0, y: 0, r: v.width, b: v.height };
        const { own, radar, target } = L.monitors;
        assert.equal(own.glass.w, target.glass.w, `${v.name}: side monitors match`);
        assert.equal(own.glass.h, radar.glass.h, `${v.name}: one monitor height`);
        assert.equal(radar.glass.w, radar.glass.h, `${v.name}: radar is square`);
        assert.ok(own.glass.h * u >= 69, `${v.name}: readable monitors`);
        const solids = [own.outer, radar.outer, target.outer, L.stick.hit, L.throttle.hit, ...Object.values(L.buttons).map((b) => b.hit)].map((r) => css(r, u));
        for (let i = 0; i < solids.length; i++) {
            assert.ok(inside(solids[i], { ...view, r: v.width + u, b: v.height + u }), `${v.name}: element ${i} on screen`);
            for (let j = i + 1; j < solids.length; j++) assert.ok(!overlap(solids[i], solids[j]), `${v.name}: ${i} overlaps ${j}`);
        }
        for (const [id, b] of Object.entries(L.buttons)) {
            const cap = css(b.cap, u), hit = css(b.hit, u);
            assert.ok(inside(cap, hit), `${v.name}: ${id} cap inside its hit area`);
            assert.ok(inside(hit, view), `${v.name}: ${id} hit area inside the viewport`);
            assert.ok((hit.r - hit.x) * (hit.b - hit.y) > (cap.r - cap.x) * (cap.b - cap.y) * 1.5, `${v.name}: ${id} hit area larger than the cap`);
            assert.ok(cap.x >= (v.safe?.left ?? 0) - 0.01 && cap.r <= v.width - (v.safe?.right ?? 0) + 0.01, `${v.name}: ${id} clear of the notch`);
        }
        assert.ok(css(L.stick.hit, u).r <= css(own.glass, u).x, `${v.name}: stick zone left of the monitors`);
        assert.ok(L.stick.hand.x + L.stick.hand.w <= own.glass.x, `${v.name}: hand never covers the own monitor glass`);
        assert.ok(!overlap(css(L.hyper, u), css(radar.glass, u)), `${v.name}: hyperdrive plate clears the radar glass`);
    }
});

test('cockpit renders headless: real canopy glass is open, frame and controls are painted', () => {
    const spec = COCKPIT_SCENES.wayfarer;
    for (const v of [VIEWPORTS[1], VIEWPORTS[5]]) {
        const L = layoutCockpitKit(v), cam = kitCamera(L, { fov: spec.fov });
        const frame = new PixelCanvas(L.w, L.h);
        const { canopy, interior } = buildCockpit(L, spec, cam);
        renderMesh(canopy, cam, frame); renderMesh(interior, cam, frame);
        const at = (x, y) => frame.data[Math.round(y) * frame.w + Math.round(x)];
        // The aiming reticle is open glass; corners and dash are painted.
        const rr = Math.floor(52 / L.unit);   // the 104 px reticle
        for (let y = L.h / 2 - rr; y <= L.h / 2 + rr; y += 2) for (let x = L.w / 2 - rr; x <= L.w / 2 + rr; x += 2)
            assert.equal(at(x, y), 0, `${v.name}: reticle area must stay clear (${x},${y})`);
        assert.notEqual(at(L.monitors.own.outer.x + 1, L.monitors.own.outer.y + 1), 0, `${v.name}: monitor housing painted`);
        const g = L.monitors.radar.glass, filled = frame.data.reduce((n, c) => n + (c ? 1 : 0), 0);
        assert.ok(filled > L.w * L.h * 0.25 && filled < L.w * L.h * 0.8, `${v.name}: frame covers part of the view (${filled / (L.w * L.h)})`);
        void g;
        const hand = new PixelCanvas(L.stick.hand.w, L.stick.hand.h);
        renderMesh(buildHand(L, spec, { x: 0, y: 0, r: 0 }, cam), cam, hand, { ox: L.stick.hand.x, oy: L.stick.hand.y });
        const handPixels = hand.data.reduce((n, c) => n + (c ? 1 : 0), 0);
        assert.ok(handPixels > hand.w * hand.h * 0.1, `${v.name}: hand visible in its zone`);
        const moved = new PixelCanvas(hand.w, hand.h);
        renderMesh(buildHand(L, spec, { x: 1, y: -1, r: 0 }, cam), cam, moved, { ox: L.stick.hand.x, oy: L.stick.hand.y });
        assert.notDeepEqual([...moved.data], [...hand.data], 'stick deflection moves the hand');
        const caps = new PixelCanvas(L.w, L.h);
        renderMesh(buildCaps(L, spec, cam, { fire: { mode: 'fire', icon: 'fire' }, missile: { mode: 'missile', icon: 'missile' }, boost: { mode: 'boost', icon: 'afterburner' } }), cam, caps);
        for (const id of ['fire', 'missile', 'boost']) {
            const c = L.buttons[id].cap;
            assert.notEqual(caps.data[Math.round(c.y + c.h / 2) * caps.w + Math.round(c.x + c.w / 2)], 0, `${v.name}: ${id} cap drawn under its hit area`);
        }
        const lever = new PixelCanvas(L.w, L.h);
        renderMesh(buildThrottle(L, spec, cam, 0.5), cam, lever);
        assert.ok(lever.data.some((c) => c), 'throttle lever drawn');
    }
    assert.equal(handPoseKey({ x: 0.01, y: 0, r: 0 }), handPoseKey({ x: 0, y: 0, r: 0 }), 'sub-step jitter keeps the cached pose');
    assert.notEqual(handPoseKey({ x: 0, y: 0, r: 0, fire: true }), handPoseKey({ x: 0, y: 0, r: 0 }));
});
