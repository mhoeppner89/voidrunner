// Pure layout for the code-drawn cockpit kit. Everything is solved on one
// integer pixel grid ("logical pixels", `unit` CSS px each) so the painted
// frame, the live DOM monitors and the touch controls share exact edges.
//
// Module sizes are fixed per viewport, not per hull: every cockpit uses the
// same monitor, radar, hyperdrive, throttle, stick and button modules, so a
// player's thumbs land in the same places in every ship.

// Target rows of the logical grid. ~300 rows keeps the frame chunky enough to
// read as pixel art on every device while staying close to the 3D view.
export const KIT_ROWS = 300;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function kitUnit(cssHeight, dpr = 1) {
    const device = Math.max(1, cssHeight * dpr);
    const unitDevice = Math.max(2, Math.round(device / KIT_ROWS));
    return unitDevice / Math.max(0.5, dpr);
}

/**
 * @param {object} o
 * @param {number} o.width CSS viewport width
 * @param {number} o.height CSS viewport height
 * @param {number} [o.dpr]
 * @param {number} [o.touchScale] player control-size preference (≈0.8–1.4)
 * @param {{left:number,right:number,bottom:number,top:number}} [o.safe] CSS insets
 * @param {number} [o.cornerBottom] CSS bottom of the pause/fullscreen buttons
 */
export function layoutCockpitKit({ width, height, dpr = 1, touchScale = 1, safe = {}, cornerBottom = 54 } = {}) {
    const W = Math.max(320, width), H = Math.max(200, height);
    const unit = kitUnit(H, dpr);
    const w = Math.ceil(W / unit), h = Math.ceil(H / unit);
    // Art covers the viewport (ceil); touch areas stay inside it (floor).
    const wf = Math.floor(W / unit), hf = Math.floor(H / unit);
    const L = (css) => Math.round(css / unit);
    const safeL = L(Math.max(0, safe.left ?? 0)), safeR = L(Math.max(0, safe.right ?? 0)), safeB = L(Math.max(0, safe.bottom ?? 0));
    const ts = clamp(touchScale || 1, 0.7, 1.5);
    // Desktop-sized viewports scale the console up from the phone design.
    const sf = clamp(H / 412, 1, 1.55);

    // ---- side zones ------------------------------------------------------
    // The stick hand needs room on the left, the weapons console on the right.
    // The monitor group is centred when it fits and nudged otherwise.
    const k = sf * Math.max(1, ts);
    const leftNeed = safeL + L(120 * sf), rightNeed = safeR + L(162 * k);

    // ---- monitor group --------------------------------------------------
    // 88 CSS px keeps phone readouts at the established legibility floor.
    let gh = Math.max(Math.ceil(88 / unit), Math.round(h * 0.215));
    gh = Math.min(gh, L(236));
    const b = Math.max(4, Math.round(gh * 0.075));           // bezel thickness
    const seam = Math.max(2, Math.round(b * 0.4));            // gap between housings
    const groupMax = Math.max(L(300), Math.min(w - leftNeed - rightNeed, w - 2 * Math.round(w * 0.22)));
    const fixed = 6 * b + 2 * seam;
    let sw = Math.floor((groupMax - fixed - gh) / 2);
    if (sw < gh * 1.35) {
        gh = Math.max(L(70), Math.floor((groupMax - fixed) / (2 * 1.35 + 1)));
        sw = Math.floor((groupMax - fixed - gh) / 2);
    }
    sw = Math.min(sw, Math.round(gh * 1.85));
    const rw = gh;
    const groupW = 2 * sw + rw + fixed;
    const gx = clamp(Math.round((w - groupW) / 2), Math.min(leftNeed, w - groupW), Math.max(0, w - rightNeed - groupW));
    // Displays may sit over the home-indicator inset; only touch caps avoid it.
    const bottomPad = Math.max(2, Math.round(h * 0.008));
    const glassBottom = h - bottomPad - b;
    const glassTop = glassBottom - gh;
    const housingTop = glassTop - b;
    const monitor = (x, gw) => ({
        outer: { x, y: housingTop, w: gw + 2 * b, h: gh + 2 * b },
        glass: { x: x + b, y: glassTop, w: gw, h: gh },
    });
    const own = monitor(gx, sw);
    const radar = monitor(own.outer.x + own.outer.w + seam, rw);
    const target = monitor(radar.outer.x + radar.outer.w + seam, sw);
    const groupLeft = own.outer.x, groupRight = target.outer.x + target.outer.w;

    // ---- canopy & dash ----------------------------------------------------
    const lip = Math.max(3, Math.round(b * 0.7));
    const dashTop = housingTop - lip;
    const hdr = Math.max(4, Math.round(h * 0.03));
    const pillarTop = Math.round(w * 0.04);
    const pillarFoot = Math.round(b * 1.2);
    const aperture = [
        [pillarTop + hdr, hdr], [w - pillarTop - hdr, hdr],
        [w - pillarTop, hdr + hdr], [groupRight + pillarFoot, dashTop],
        [groupLeft - pillarFoot, dashTop], [pillarTop, hdr + hdr],
    ];
    // Inner edge of the left/right walls at a given row (for mounting parts).
    const wallEdge = (y, side) => {
        const t = clamp((y - 2 * hdr) / Math.max(1, dashTop - 2 * hdr), 0, 1);
        const left = pillarTop + (groupLeft - pillarFoot - pillarTop) * t;
        return side === 'left' ? left : w - left;
    };

    // ---- hyperdrive plate on the glare shield ----------------------------
    // Sits low on the radar housing so it stays clear of the centre reticle.
    // On short screens it shrinks (to a 20px floor) to clear the 104px reticle.
    const reticleBottom = L(H / 2 + 54);
    const ph = Math.max(L(20), Math.min(Math.max(L(26), Math.round(h * 0.044)), radar.glass.y - 1 - reticleBottom));
    const pw = Math.max(L(150), radar.outer.w + 2 * b);
    const hyper = { x: Math.round(radar.glass.x + radar.glass.w / 2 - pw / 2), y: radar.glass.y - ph - 1, w: pw, h: ph };

    // ---- left: stick hand, throttle quadrant above it ----------------------
    // The hand canvas spans from the screen edge to the own monitor's glass so
    // the sleeve always leaves through the bottom edge; the grip's widest
    // right lean stays clear of the glass.
    const glassLeft = own.glass.x;
    const handS = Math.min(Math.round(h * 0.5), Math.round((glassLeft - safeL) * 1.12), L(440));
    const wellX = clamp(Math.round(safeL + (glassLeft - safeL) * 0.6), Math.round(handS * 0.42), glassLeft - 2 - Math.round(handS * 0.34));
    const hand = { x: 0, y: h - handS, w: glassLeft - 1, h: handS, S: handS, wellX };
    // Screen anchor for the 3D grip top (the scene unprojects it).
    const grip = { x: Math.round(safeL + (glassLeft - safeL) * 0.5), y: h - Math.round(handS * 0.66) };
    const stickTop = h - Math.round(handS * 0.86);
    const trackW = Math.max(L(14), Math.round(h * 0.022), 5);
    const trackBottom = stickTop - L(18);
    const trackTop = Math.max(L(cornerBottom + 16), 2 * hdr + 4, trackBottom - Math.round(h * 0.32));
    // Keep the quadrant on the wall: its right edge stays left of the pillar.
    const trackX = safeL + Math.max(L(14), Math.min(Math.round(wallEdge(trackTop, 'left')) - safeL - trackW - L(16), L(30)));
    const trackH = Math.max(L(72), trackBottom - trackTop);
    const throttle = {
        track: { x: trackX, y: trackTop, w: trackW, h: trackH },
        hit: { x: 0, y: trackTop, w: Math.max(trackX + trackW + L(36), L(76)), h: trackH },
    };
    const stickHit = { x: 0, y: trackTop + trackH + L(10), w: groupLeft - L(4), h: 0 };
    stickHit.h = hf - stickHit.y;

    // ---- right: weapons console ------------------------------------------
    // Caps sit on a thumb arc from the bottom-right corner: FIRE at the
    // resting thumb, afterburner above it, missile with its rack display to
    // the left. Visible caps are small; hit areas tile the whole zone.
    const capSize = (css) => Math.max(6, Math.round(css * ts * sf / unit / 2) * 2);
    const pivotX = wf - safeR, pivotY = hf - safeB;
    const zoneX = groupRight + L(6);
    const at = (dx, dy) => [pivotX + L(dx * k), pivotY + L(dy * k)];
    const caps0 = { fire: capSize(62), missile: capSize(44), boost: capSize(44), launcherW: capSize(44), launcherH: Math.max(6, Math.round(22 * sf / unit / 2) * 2) };
    // (The rack display is a rarely used tap target; it doesn't grow with touch size.)
    const colX = Math.min(L(150 * k), pivotX - zoneX - Math.round(Math.max(caps0.missile, caps0.launcherW) / 2) - L(4));
    const fireC = at(-68, -70), boostC = at(-56, -160);
    // Narrow zones: keep a gap between the missile column and FIRE.
    const colRight = pivotX - colX + Math.round(caps0.missile / 2);
    const gapDeficit = colRight + L(8) - (fireC[0] - Math.round(caps0.fire / 2));
    if (gapDeficit > 0) fireC[0] = Math.min(fireC[0] + gapDeficit, pivotX - Math.round(caps0.fire / 2) - L(4));
    let launcherC = [pivotX - colX, pivotY + L(-96 * k)];
    launcherC[1] = Math.max(launcherC[1], dashTop + Math.round(caps0.launcherH / 2) + L(6));
    let missileC = [pivotX - colX, Math.max(pivotY + L(-42 * k), launcherC[1] + Math.round((caps0.launcherH + caps0.missile) / 2) + L(10))];
    missileC[1] = Math.min(missileC[1], pivotY - Math.round(caps0.missile / 2) - L(6));
    const cap = ([cx, cy], cw, ch = cw) => ({ x: Math.round(cx - cw / 2), y: Math.round(cy - ch / 2), w: cw, h: ch });
    const caps = {
        fire: cap(fireC, caps0.fire),
        missile: cap(missileC, caps0.missile),
        launcher: cap(launcherC, caps0.launcherW, caps0.launcherH),
        boost: cap(boostC, caps0.boost),
    };
    const zoneY = Math.min(caps.boost.y, caps.launcher.y) - L(30 * k);
    const splitX = Math.round((caps.missile.x + caps.missile.w + caps.fire.x) / 2);
    const splitLeftY = Math.round((caps.launcher.y + caps.launcher.h + caps.missile.y) / 2);
    const splitRightY = Math.round((caps.boost.y + caps.boost.h + caps.fire.y) / 2);
    const hits = {
        launcher: { x: zoneX, y: Math.max(zoneY, dashTop), w: splitX - zoneX, h: splitLeftY - Math.max(zoneY, dashTop) },
        missile: { x: zoneX, y: splitLeftY, w: splitX - zoneX, h: hf - splitLeftY },
        boost: { x: splitX, y: zoneY, w: wf - splitX, h: splitRightY - zoneY },
        fire: { x: splitX, y: splitRightY, w: wf - splitX, h: hf - splitRightY },
    };
    const buttons = Object.fromEntries(Object.keys(caps).map((id) => [id, { hit: hits[id], cap: caps[id] }]));
    // Console plate behind the caps (clipped later by the canopy opening).
    const m = L(14 * k);
    const plateTop = caps.boost.y - m, plateLeft = Math.min(caps.launcher.x, caps.missile.x) - m;
    const chamfer = Math.round((caps.launcher.y - plateTop) * 0.9);
    const rightPanel = [[plateLeft + chamfer, plateTop], [w, plateTop], [w, h], [plateLeft, h], [plateLeft, plateTop + chamfer]];

    return {
        unit, w, h, cssWidth: W, cssHeight: H, b, seam, lip, hdr, dashTop,
        aperture, wallEdge, pillarTop, pillarFoot,
        monitors: { own, radar, target }, groupLeft, groupRight,
        hyper, throttle, stick: { hit: stickHit, hand, grip }, buttons, rightPanel,
    };
}

// Logical rect → CSS px rect.
export function cssRect(r, unit) {
    return { left: r.x * unit, top: r.y * unit, width: r.w * unit, height: r.h * unit };
}

export function pointInPolygon(points, x, y) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i], [xj, yj] = points[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}
