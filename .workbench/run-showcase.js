// Drive Puppeteer through every ship variant, both stations, both planets,
// the asteroid field, and the debris field. One model per PNG.

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const WORKBENCH = __dirname;
const SCREEN_DIR = path.join(WORKBENCH, 'showcase');
fs.mkdirSync(SCREEN_DIR, { recursive: true });
const PORT = Number(process.env.WB_PORT ?? 8770);
const CHROME = process.env.WB_CHROME
    ?? '/Users/mhoeppner/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
};

let server;
function startServer() {
    return new Promise((resolve) => {
        server = http.createServer((req, res) => {
            const parsed = url.parse(req.url);
            let pathname = decodeURIComponent(parsed.pathname || '/');
            if (pathname.includes('..')) { res.writeHead(400); return res.end('Bad path'); }
            if (pathname === '/') pathname = '/index.html';
            const filePath = path.join(ROOT, pathname);
            if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
            fs.stat(filePath, (err, stat) => {
                if (err) { res.writeHead(404); return res.end(`Not found: ${pathname}`); }
                if (stat.isDirectory()) {
                    fs.readFile(path.join(filePath, 'index.html'), (err2, buf) => {
                        if (err2) { res.writeHead(404); return res.end('No index'); }
                        res.setHeader('Content-Type', MIME['.html']);
                        res.end(buf);
                    });
                    return;
                }
                const ext = path.extname(filePath).toLowerCase();
                res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
                res.setHeader('Cache-Control', 'no-store');
                fs.createReadStream(filePath).pipe(res);
            });
        });
        server.listen(PORT, '127.0.0.1', () => resolve(PORT));
    });
}

// Multi-angle capture: every ship / station / planet gets 4 angles so
// each composite compares like-for-like against RGO references from
// multiple sides. Ships at ~1000u, stations at ~3000u, planets at ~11000u.
// Clusters keep their auto-frame and only get one shot per cluster.
// Per-model angles: front, top-down (catches belly/top), bottom-up, rear.
const TOP_DOWN_PITCH = 0.95;
const BOTTOM_UP_PITCH = -0.95;
const ANGLES = {
    ship: [
        { suffix: 'a-front',  yaw: 0.00,                 pitch: 0.18 },
        { suffix: 'b-top',    yaw: -0.45,                pitch: TOP_DOWN_PITCH },
        { suffix: 'c-bottom', yaw: -0.45,                pitch: BOTTOM_UP_PITCH },
        { suffix: 'd-rear',   yaw: Math.PI - 0.30,       pitch: -0.18 },
    ],
    station: [
        { suffix: 'a-front',  yaw: 0.00,                 pitch: 0.10 },
        { suffix: 'b-3qtr',   yaw: -0.55,                pitch: 0.20 },
        { suffix: 'c-side',   yaw: -Math.PI / 2 - 0.10,  pitch: 0.05 },
        { suffix: 'd-rear',   yaw: Math.PI - 0.40,       pitch: 0.0 },
    ],
    planet: [
        { suffix: 'a-front',  yaw: 0.00,                 pitch: 0.10 },
        { suffix: 'b-3qtr',   yaw: -0.55,                pitch: 0.20 },
        { suffix: 'c-side',   yaw: -Math.PI / 2,         pitch: 0.05 },
        { suffix: 'd-rear',   yaw: Math.PI - 0.30,       pitch: -0.05 },
    ],
    cluster: [
        { suffix: 'a-overview', yaw: 0.20,              pitch: 0.30 },
        { suffix: 'b-3qtr',     yaw: -0.55,             pitch: 0.20 },
        { suffix: 'c-low',      yaw: -0.95,             pitch: -0.45 },
        { suffix: 'd-overhead', yaw: -0.30,             pitch: Math.PI / 2 - 0.5 },
    ],
};
function angleSet(name) { return ANGLES[name] ?? ANGLES.ship; }

const POSES = [];
function pushMulti(kind, prefix, name, baseDistance) {
    for (const a of angleSet(kind)) {
        POSES.push({
            kind,
            name,
            out: `${prefix}-${a.suffix}.png`,
            distance: baseDistance,
            yaw: a.yaw, pitch: a.pitch,
        });
    }
}

// Ships at 1000u (Atlas 1200u) — see the top and bottom.
pushMulti('ship', '10-ship-kestrel',         'ship-kestrel',         1000);
pushMulti('ship', '11-ship-talon',           'ship-talon',           1000);
pushMulti('ship', '12-ship-warden',          'ship-warden',          1000);
pushMulti('ship', '13-ship-prospector',      'ship-prospector',      1000);
pushMulti('ship', '14-ship-lancer',          'ship-lancer',          1000);
pushMulti('ship', '15-ship-atlas',           'ship-atlas-freighter', 1200);
// Stations at 3000u.
pushMulti('station', '30-station-helix',     'station-helix',        3000);
pushMulti('station', '31-station-rook',      'station-rook',         3000);
// Planets at 12500u (Vesper) / 15000u (Azure).
pushMulti('planet',  '40-planet-vesper',     'planet-vesper',       12500);
pushMulti('planet',  '41-planet-azure',      'planet-azure',        15000);
// Clusters: shardbelt asteroids + mourning-line debris, 4 angles each.
pushMulti('cluster', '50-asteroid-cluster',  'cluster',              4500);
pushMulti('cluster', '51-debris-cluster',    'cluster',              3500);

async function main() {
    const port = await startServer();
    console.log(`[showcase] serving ${ROOT} on http://127.0.0.1:${port}`);

    const browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: 'new',
        args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle',
            '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist', '--disable-features=SkiaGlyphCache',
            '--in-process-gpu'],
        defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
    });

    const page = await browser.newPage();
    page.on('console', (msg) => {
        const t = msg.type();
        if (t === 'error' || t === 'warning') console.log(`[browser ${t}]`, msg.text());
    });
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));
    await page.goto(`http://127.0.0.1:${port}/?test=showcase&t=${Date.now()}`, { waitUntil: 'networkidle2', timeout: 30_000 });
    await page.waitForFunction('!!window.__VOID_PRIVATEER__?.isShowcase', { timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 1000));

    for (const pose of POSES) {
        try {
            if (pose.kind === 'cluster') {
                const isAsteroid = pose.out.startsWith('50-');
                await page.evaluate(async (cfg) => {
                    const sc = window.__VOID_PRIVATEER__.showcase.renderer;
                    if (cfg.isAsteroid) sc.spawnAsteroidCluster(cfg.seed);
                    else sc.spawnDebrisCluster(cfg.seed);
                    sc.render('cluster', { yaw: cfg.yaw, pitch: cfg.pitch, distance: cfg.distance });
                }, { isAsteroid, seed: 'cluster-' + (isAsteroid ? 'asteroids' : 'graveyard'),
                     yaw: pose.yaw, pitch: pose.pitch, distance: pose.distance });
            } else {
                await page.evaluate((name, opts) => {
                    window.__VOID_PRIVATEER__.showcase.renderPose(name, opts);
                }, pose.name, { yaw: pose.yaw, pitch: pose.pitch, distance: pose.distance });
            }
            await new Promise((r) => setTimeout(r, 800));
            const out = path.join(SCREEN_DIR, pose.out);
            // Screenshot only the showcase canvas so background overlays
            // (HUD, title-cockpit.webp, etc.) don't smudge the captured pose.
            const handle = await page.$('#showcase-canvas');
            await handle.screenshot({ path: out, type: 'png' });
            console.log(`wrote ${out}`);
        } catch (e) {
            console.log(`[err]`, pose.out, e.message);
        }
    }
    await browser.close();
    server.close();
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    if (server) server.close();
    process.exit(1);
});
