// Runtime for the code-drawn cockpit kit. A tiny software renderer
// (pixel3d.js) draws the 3D cockpit scene (cockpitScene.js) into pixel-art
// canvases inside the HUD; the live DOM monitors and touch hit areas are
// placed on the same pixel grid by the layout (cockpitKitLayout.js).
//
// Layers and when they repaint:
//   frame    — canopy + interior, only on layout changes (resize, hull, touch size)
//   hand     — stick + gloved hand, when the quantised stick pose changes (cached)
//   throttle — lever handle, when the throttle setting moves a notch
//   caps     — console buttons, when a button's mode/press/disabled state changes (cached)
import { layoutCockpitKit, cssRect } from './cockpitKitLayout.js';
import { PixelCanvas, rgba } from './pixelCanvas.js';
import { renderMesh } from './pixel3d.js';
import { COCKPIT_SCENES, buildCockpit, buildHand, buildThrottle, buildCaps, kitCamera } from './cockpitScene.js';

export const hasCockpitKit = (shipId) => Object.hasOwn(COCKPIT_SCENES, shipId);

const BUTTONS = { fire: '#touch-fire', missile: '#touch-missile', launcher: '#touch-launcher-cycle', boost: '.touch-boost-right' };
const SCREENS = { own: '.cockpit-screen-own', radar: '.cockpit-screen-radar', target: '.cockpit-screen-target' };
const PLACED = ['left', 'top', 'width', 'height', 'padding', 'transform', '--cap-x', '--cap-y', '--cap-w', '--cap-h'];
const RENDER = { outlineColour: rgba('#02040a'), fill: [0.6, 0.4, -0.5] };
const CACHE_LIMIT = 48;

// Hand pose key: a few steps per axis keeps the cache small and the motion readable.
export function handPoseKey(pose) {
    const q = (v, n) => Math.round(Math.max(-1, Math.min(1, v || 0)) * n);
    return (((q(pose.x, 6) + 8) * 16 + (q(pose.y, 6) + 8)) * 8 + (q(pose.r, 2) + 4)) * 2 + (pose.fire ? 1 : 0);
}

class Layer {
    constructor(className, parent) {
        this.canvas = document.createElement('canvas');
        this.canvas.className = `kit-layer ${className}`;
        this.canvas.setAttribute('aria-hidden', 'true');
        parent.append(this.canvas);
        this.cache = new Map();
    }
    resize(rect, unit) {
        this.rect = rect;
        this.canvas.width = rect.w;
        this.canvas.height = rect.h;
        const r = cssRect(rect, unit);
        Object.assign(this.canvas.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        this.ctx = this.canvas.getContext('2d');
        this.pixels = new PixelCanvas(rect.w, rect.h);
        this.opts = { ...RENDER, ox: rect.x, oy: rect.y };
        this.cache.clear();
        this.key = undefined;
    }
    // Render `build()` for `key`, reusing a cached image when the key repeats.
    show(key, build) {
        if (key === this.key || !this.pixels) return;
        this.key = key;
        let image = this.cache.get(key);
        if (!image) {
            this.pixels.clear();
            renderMesh(build(), this.cam, this.pixels, this.opts);
            image = this.pixels.data.slice();
            if (this.cache.size >= CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value);
            this.cache.set(key, image);
        }
        this.pixels.data.set(image);
        this.pixels.blit(this.ctx);
    }
}

export class CockpitKit {
    active = false;
    shipId;
    layout;
    layoutKey = '';
    dirty = true;
    pose = { x: 0, y: 0, r: 0, fire: false };
    placed = new Set();
    engaged = {};
    constructor(root) {
        this.root = root;
    }
    ensureDom() {
        const instruments = this.root.querySelector('.cockpit-instruments');
        if (!instruments) return false;
        if (!this.frameCanvas?.isConnected) {
            this.frameCanvas = document.createElement('canvas');
            this.frameCanvas.className = 'kit-layer kit-frame';
            this.frameCanvas.setAttribute('aria-hidden', 'true');
            const art = instruments.querySelector('.cockpit-art');
            if (art) art.after(this.frameCanvas); else instruments.prepend(this.frameCanvas);
            this.hand = new Layer('kit-hand', instruments);
            // Throttle and caps sit with the touch controls, under their hit areas.
            const controls = this.root.querySelector('.touch-controls') ?? instruments;
            this.throttle = new Layer('kit-throttle', controls);
            this.caps = new Layer('kit-caps', controls);
            controls.prepend(this.throttle.canvas, this.caps.canvas);
            this.probe = document.createElement('div');
            this.probe.className = 'kit-safe-probe';
            this.probe.setAttribute('aria-hidden', 'true');
            instruments.append(this.probe);
            this.observer = new MutationObserver(() => { this.stateDirty = true; });
        }
        return true;
    }
    activate(shipId) {
        if (this.active && this.shipId === shipId) return;
        this.shipId = shipId;
        this.spec = COCKPIT_SCENES[shipId];
        this.active = true;
        this.root.dataset.cockpitKit = shipId;
        if (this.ensureDom()) {
            this.observer.disconnect();
            for (const sel of Object.values(BUTTONS)) {
                const el = this.root.querySelector(sel);
                if (el) this.observer.observe(el, { attributes: true, subtree: true, attributeFilter: ['class', 'disabled', 'data-touch-action'] });
            }
            const thumb = this.root.querySelector('[data-touch-throttle-thumb]');
            if (thumb) this.observer.observe(thumb, { attributes: true, attributeFilter: ['style'] });
        }
        this.stateDirty = true;
        this.invalidate();
    }
    deactivate() {
        if (!this.active) return;
        this.active = false;
        this.observer?.disconnect();
        delete this.root.dataset.cockpitKit;
        for (const el of this.placed) for (const p of PLACED) el.style.removeProperty(p);
        this.placed.clear();
        const stick = this.root.querySelector('[data-touch-stick]');
        if (stick) { delete stick.dataset.travel; delete stick.dataset.origin; }
        this.root.querySelector('.canopy-art-mask')?.removeAttribute('href');
        this.layout = undefined;
        this.layoutKey = '';
    }
    invalidate() {
        this.dirty = true;
    }
    measure() {
        const hud = this.root.querySelector('#hud') ?? this.root;
        const rect = hud.getBoundingClientRect?.();
        if (!rect || rect.width < 2 || rect.height < 2) return undefined;
        const px = (v) => parseFloat(v) || 0;
        const safe = this.probe ? getComputedStyle(this.probe) : undefined;
        const corner = this.root.querySelector('.hud-corner-buttons')?.getBoundingClientRect?.();
        return {
            width: rect.width,
            height: rect.height,
            dpr: globalThis.devicePixelRatio || 1,
            touchScale: px(this.root.style.getPropertyValue('--touch-scale')) || 1,
            safe: { left: px(safe?.paddingLeft), right: px(safe?.paddingRight), bottom: px(safe?.paddingBottom), top: px(safe?.paddingTop) },
            cornerBottom: corner?.height ? corner.bottom - rect.top : 54,
        };
    }
    place(el, rect, unit, extra) {
        if (!el) return;
        const r = cssRect(rect, unit);
        Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        if (extra) for (const [k, v] of Object.entries(extra)) el.style.setProperty(k, v);
        this.placed.add(el);
    }
    relayout() {
        if (!this.active || !this.ensureDom()) return false;
        const m = this.measure();
        if (!m) return false;
        const key = JSON.stringify([this.shipId, m]);
        if (key === this.layoutKey) return true;
        const L = layoutCockpitKit(m), u = L.unit, px = (v) => `${v}px`;
        this.layout = L;
        this.layoutKey = key;
        this.root.style.setProperty('--kit-unit', px(u));
        const cam = this.cam = kitCamera(L, { fov: this.spec.fov });

        // Static frame: canopy pass, then interior pass (fresh depth).
        const frame = new PixelCanvas(L.w, L.h);
        const { canopy, interior } = buildCockpit(L, this.spec, cam);
        renderMesh(canopy, cam, frame, { ...RENDER });
        renderMesh(interior, cam, frame, { ...RENDER });
        this.framePixels = frame;
        this.frameCanvas.width = frame.w;
        this.frameCanvas.height = frame.h;
        Object.assign(this.frameCanvas.style, { width: px(frame.w * u), height: px(frame.h * u) });
        frame.blit(this.frameCanvas.getContext('2d'));

        // Animated layers cover only their own area.
        const hand = L.stick.hand;
        this.hand.resize(hand, u);
        const t = L.throttle.hit, ty = Math.max(0, t.y - 30);
        this.throttle.resize({ x: 0, y: ty, w: Math.min(L.w, t.x + t.w + 24), h: Math.min(L.h - ty, t.h + 60) }, u);
        const caps = Object.values(L.buttons).map((b) => b.cap);
        const cx = Math.max(0, Math.min(...caps.map((c) => c.x)) - 24), cy = Math.max(0, Math.min(...caps.map((c) => c.y)) - 24);
        this.caps.resize({ x: cx, y: cy, w: L.w - cx, h: L.h - cy }, u);
        for (const layer of [this.hand, this.throttle, this.caps]) layer.cam = cam;

        // Live DOM on the same grid.
        for (const [id, sel] of Object.entries(SCREENS)) this.place(this.root.querySelector(sel), L.monitors[id].glass, u);
        this.place(this.root.querySelector('#hyperdrive-card'), L.hyper, u, { transform: 'none' });
        this.place(this.root.querySelector('[data-touch-throttle]'), L.throttle.hit, u);
        const stick = this.root.querySelector('[data-touch-stick]');
        this.place(stick, L.stick.hit, u);
        if (stick) {
            stick.dataset.travel = String(Math.round(Math.max(34, Math.min(64, hand.S * u * 0.2))));
            stick.dataset.origin = 'touch';
        }
        for (const [id, sel] of Object.entries(BUTTONS)) {
            const { hit, cap } = L.buttons[id];
            const pad = [cap.y - hit.y, hit.x + hit.w - cap.x - cap.w, hit.y + hit.h - cap.y - cap.h, cap.x - hit.x].map((v) => px(Math.max(0, v) * u)).join(' ');
            this.place(this.root.querySelector(sel), hit, u, { padding: pad, '--cap-x': px((cap.x - hit.x) * u), '--cap-y': px((cap.y - hit.y) * u), '--cap-w': px(cap.w * u), '--cap-h': px(cap.h * u) });
        }
        // Canopy fractures stay on the glass: the frame's alpha masks them.
        const mask = this.root.querySelector('.canopy-art-mask');
        if (mask) {
            this.root.querySelector('.canopy-aperture')?.setAttribute('points', '0,0 1000,0 1000,1000 0,1000');
            // Encoding the mask is the slowest step; keep it off the resize frame.
            clearTimeout(this.maskTimer);
            this.maskTimer = setTimeout(() => {
                if (this.layoutKey !== key) return;
                try { mask.setAttribute('href', this.frameCanvas.toDataURL()); } catch { mask.removeAttribute('href'); }
            }, 250);
        }
        this.paintHand(true);
        this.stateDirty = true;
        this.syncState();
        return true;
    }
    paintHand(force = false) {
        if (!this.layout) return;
        const pose = { ...this.pose }, key = handPoseKey(pose), now = performance.now();
        // New poses render at most ~30 times a second; cached poses show at once.
        if (!force && key !== this.hand.key && !this.hand.cache.has(key) && now - (this.handPaintedAt ?? 0) < 33) return;
        if (!this.hand.cache.has(key)) this.handPaintedAt = now;
        this.hand.show(key, () => buildHand(this.layout, this.spec, pose, this.cam));
    }
    // Read throttle and console-button state from the live DOM (set by GameUI).
    syncState() {
        if (!this.stateDirty || !this.layout) return;
        this.stateDirty = false;
        const thumb = this.root.querySelector('[data-touch-throttle-thumb]');
        const throttle = Math.round((parseFloat(thumb?.style.bottom) || 0) / 2.5) / 40;
        this.throttle.show(throttle, () => buildThrottle(this.layout, this.spec, this.cam, throttle));
        const states = {};
        for (const id of ['fire', 'missile', 'boost']) {
            const el = this.root.querySelector(BUTTONS[id]);
            if (!el) continue;
            const c = el.classList, pressed = c.contains('is-active') || c.contains('is-engaged');
            const icon = el.querySelector('svg:not(.is-hidden)')?.dataset.icon;
            const mode = id === 'boost' ? 'boost'
                : c.contains('is-mining') ? 'mine'
                    : c.contains('is-salvage') || c.contains('is-capture') || c.contains('is-scan') ? 'teal'
                        : id === 'missile' ? 'missile' : 'fire';
            states[id] = { mode, icon: id === 'boost' ? 'afterburner' : icon, pressed, disabled: el.disabled || c.contains('is-empty'), hidden: c.contains('is-hidden') };
        }
        this.caps.show(JSON.stringify(states), () => buildCaps(this.layout, this.spec, this.cam, states));
    }
    // Called every flying frame with the frame's input actions.
    update(dt, actions = {}) {
        if (!this.active) return;
        if (this.dirty) {
            if (!this.relayout()) return;
            this.dirty = false;
        }
        const a = 1 - Math.exp(-16 * Math.max(0, Math.min(0.1, dt || 0)));
        const p = this.pose;
        p.x += ((actions.yaw || 0) - p.x) * a;
        p.y += ((actions.pitch || 0) - p.y) * a;
        p.r += ((actions.roll || 0) - p.r) * a;
        p.fire = Boolean(actions.fire);
        this.paintHand();
        // Mirror keyboard/controller presses on the console caps.
        this.engaged.missileT = actions.missile || actions.miningDrones ? 0.16 : Math.max(0, (this.engaged.missileT ?? 0) - (dt || 0));
        this.setEngaged('fire', Boolean(actions.fire));
        this.setEngaged('boost', Boolean(actions.afterburner));
        this.setEngaged('missile', this.engaged.missileT > 0);
        this.syncState();
    }
    setEngaged(id, on) {
        if (this.engaged[id] === on) return;
        this.engaged[id] = on;
        this.root.querySelector(BUTTONS[id])?.classList.toggle('is-engaged', on);
    }
    // Screen-space visibility for HUD markers: true where the canopy is glass.
    pointVisible(x, y) {
        const L = this.layout, f = this.framePixels;
        if (!L || !f) return true;
        const px = Math.floor(x / L.unit), py = Math.floor(y / L.unit);
        if (px < 0 || py < 0 || px >= f.w || py >= f.h) return true;
        return f.data[py * f.w + px] === 0;
    }
}
