// Tiny software rasteriser for code-drawn pixel art. Shapes are filled at
// pixel centres without anti-aliasing, so every edge lands on the logical grid
// and the result can be scaled up with `image-rendering: pixelated`.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const colourCache = new Map();
// Hex (#rgb, #rrggbb, #rrggbbaa) → packed little-endian RGBA for Uint32Array.
export function rgba(hex) {
    let packed = colourCache.get(hex);
    if (packed !== undefined) return packed;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
    packed = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
    colourCache.set(hex, packed);
    return packed;
}

export class PixelCanvas {
    constructor(width, height) {
        this.w = Math.max(1, Math.round(width));
        this.h = Math.max(1, Math.round(height));
        this.data = new Uint32Array(this.w * this.h);
    }
    clear() { this.data.fill(0); }
    // A fill is a packed colour or a (x, y) => packed colour shader.
    plot(x, y, fill) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        const c = typeof fill === 'function' ? fill(x, y) : fill;
        if (c) this.data[y * this.w + x] = c;
    }
    get(x, y) {
        return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.data[y * this.w + x];
    }
    span(x0, x1, y, fill) {
        if (y < 0 || y >= this.h) return;
        const a = Math.max(0, x0), b = Math.min(this.w - 1, x1);
        if (a > b) return;
        const row = y * this.w;
        if (typeof fill === 'function') {
            for (let x = a; x <= b; x++) { const c = fill(x, y); if (c) this.data[row + x] = c; }
        } else if (fill !== undefined) this.data.fill(fill, row + a, row + b + 1); // 0 erases
    }
    rect(x, y, w, h, fill) {
        x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
        for (let j = y; j < y + h; j++) this.span(x, x + w - 1, j, fill);
    }
    // Rectangle with stepped (chamfered) corners — the pixel-art rounded box.
    box(x, y, w, h, fill, chamfer = 1) {
        x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
        for (let j = 0; j < h; j++) {
            const edge = Math.min(j, h - 1 - j), inset = Math.max(0, chamfer - edge);
            this.span(x + inset, x + w - 1 - inset, y + j, fill);
        }
    }
    // Even-odd scanline polygon fill sampled at pixel centres.
    poly(points, fill) {
        if (points.length < 3) return;
        let minY = Infinity, maxY = -Infinity;
        for (const [, y] of points) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
        const y0 = Math.max(0, Math.ceil(minY - 0.5)), y1 = Math.min(this.h - 1, Math.floor(maxY - 0.5));
        const xs = [];
        for (let y = y0; y <= y1; y++) {
            const sy = y + 0.5;
            xs.length = 0;
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                const [xi, yi] = points[i], [xj, yj] = points[j];
                if ((yi > sy) !== (yj > sy)) xs.push(xi + (sy - yi) / (yj - yi) * (xj - xi));
            }
            xs.sort((a, b) => a - b);
            for (let k = 0; k + 1 < xs.length; k += 2)
                this.span(Math.ceil(xs[k] - 0.5), Math.floor(xs[k + 1] - 0.5), y, fill);
        }
    }
    ellipse(cx, cy, rx, ry, fill) {
        if (rx <= 0 || ry <= 0) return;
        const y0 = Math.ceil(cy - ry - 0.5), y1 = Math.floor(cy + ry - 0.5);
        for (let y = y0; y <= y1; y++) {
            const t = (y + 0.5 - cy) / ry, half = rx * Math.sqrt(Math.max(0, 1 - t * t));
            this.span(Math.ceil(cx - half - 0.5), Math.floor(cx + half - 0.5), y, fill);
        }
    }
    line(x0, y0, x1, y1, fill) {
        x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        for (;;) {
            this.plot(x0, y0, fill);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    }
    // Thick segment as a quad (width in pixels).
    stroke(x0, y0, x1, y1, width, fill) {
        const len = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / len * width / 2, ny = (x1 - x0) / len * width / 2;
        this.poly([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], fill);
    }
    // Draw a 1px outline in `fill` on every empty pixel touching an opaque one.
    outline(fill, diagonal = false) {
        const { w, h, data } = this, out = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (data[i]) continue;
            if ((x > 0 && data[i - 1]) || (x < w - 1 && data[i + 1]) || (y > 0 && data[i - w]) || (y < h - 1 && data[i + w])
                || (diagonal && ((x > 0 && y > 0 && data[i - w - 1]) || (x < w - 1 && y > 0 && data[i - w + 1])
                    || (x > 0 && y < h - 1 && data[i + w - 1]) || (x < w - 1 && y < h - 1 && data[i + w + 1])))) out[i] = 1;
        }
        for (let i = 0; i < out.length; i++) if (out[i]) data[i] = fill;
    }
    // Recolour every opaque pixel that touches a transparent one (inner rim).
    rim(fill) {
        const { w, h, data } = this, hit = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (!data[i]) continue;
            if ((x > 0 && !data[i - 1]) || (x < w - 1 && !data[i + 1]) || (y > 0 && !data[i - w]) || (y < h - 1 && !data[i + w])) hit.push(i);
        }
        for (const i of hit) data[i] = fill;
    }
    blit(target) {
        if (this.image?.width !== this.w || this.image?.height !== this.h) {
            this.image = target.createImageData(this.w, this.h);
            this.image32 = new Uint32Array(this.image.data.buffer);
        }
        this.image32.set(this.data);
        target.putImageData(this.image, 0, 0);
    }
}

// Ordered-dither between two packed colours; level 0 → a, 1 → b.
export function dither(a, b, level) {
    const threshold = Math.round(Math.max(0, Math.min(1, level)) * 16);
    return (x, y) => (BAYER4[(y & 3) * 4 + (x & 3)] < threshold ? b : a);
}
// Per-pixel ordered dither without allocating a shader (hot loops).
export const pick = (a, b, level, x, y) => (BAYER4[(y & 3) * 4 + (x & 3)] < Math.round(level * 16) ? b : a);
// Vertical ordered gradient over [y0, y1] through a list of packed colours.
export function gradientY(colours, y0, y1) {
    const n = colours.length - 1;
    return (x, y) => {
        const t = Math.max(0, Math.min(0.9999, (y - y0) / Math.max(1, y1 - y0))) * n;
        const i = Math.floor(t), f = t - i;
        return BAYER4[(y & 3) * 4 + (x & 3)] < Math.round(f * 16) ? colours[i + 1] : colours[i];
    };
}

// 3×5 engraving font for console labels.
const GLYPHS = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
    F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', L: '100100100100111',
    M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', R: '110101110101101',
    S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101',
    Y: '101101010010010', K: '101101110101101', X: '101101010101101', ' ': '000000000000000',
};
export function engrave(canvas, text, x, y, fill, shadow) {
    let cx = Math.round(x);
    for (const ch of text.toUpperCase()) {
        const glyph = GLYPHS[ch];
        if (glyph) for (let i = 0; i < 15; i++) if (glyph[i] === '1') {
            const px = cx + (i % 3), py = Math.round(y) + Math.floor(i / 3);
            if (shadow) canvas.plot(px, py + 1, shadow);
            canvas.plot(px, py, fill);
        }
        cx += 4;
    }
}
export const engraveWidth = (text) => Math.max(0, text.length * 4 - 1);
