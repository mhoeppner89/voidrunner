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

const POSES = [
    // Six ship variants.
    { name: 'ship-kestrel',         out: '10-ship-kestrel.png',          yaw: -0.55, pitch: 0.10 },
    { name: 'ship-talon',           out: '11-ship-talon.png',            yaw: -0.65, pitch: 0.10 },
    { name: 'ship-warden',          out: '12-ship-warden.png',           yaw: -0.50, pitch: 0.10 },
    { name: 'ship-prospector',      out: '13-ship-prospector.png',       yaw: -0.55, pitch: 0.12 },
    { name: 'ship-lancer',          out: '14-ship-lancer.png',           yaw: -0.55, pitch: 0.10 },
    { name: 'ship-atlas-freighter', out: '15-ship-atlas.png',            yaw: -0.55, pitch: 0.10 },
    // Both stations.
    { name: 'station-helix',        out: '30-station-helix.png',         distance: 230, yaw: -0.55, pitch: 0.20 },
    { name: 'station-rook',         out: '31-station-rook.png',          distance: 220, yaw: -0.55, pitch: 0.10 },
    // Both planets.
    { name: 'planet-vesper',        out: '40-planet-vesper.png',         distance: 480, yaw: -0.5, pitch: 0.05 },
    { name: 'planet-azure',         out: '41-planet-azure.png',          distance: 540, yaw: -0.7, pitch: 0.05 },
    // Asteroid + debris field clusters (using the existing in-game data).
    { out: '50-asteroid-cluster.png', asteroids: true, seed: 'cluster-asteroids' },
    { out: '51-debris-cluster.png',  graveyard: true, seed: 'cluster-graveyard' },
];

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
            if (pose.asteroids || pose.graveyard) {
                await page.evaluate(async (cfg) => {
                    const sc = window.__VOID_PRIVATEER__.showcase.renderer;
                    // Drop the current cluster viewport to use a procedural cluster.
                    if (cfg.asteroids) sc.spawnAsteroidCluster(cfg.seed);
                    if (cfg.graveyard) sc.spawnDebrisCluster(cfg.seed);
                    sc.render('cluster', { yaw: -0.55, pitch: 0.10, distance: cfg.asteroids ? 180 : 280 });
                }, pose);
            } else {
                await page.evaluate((name, opts) => {
                    window.__VOID_PRIVATEER__.showcase.renderPose(name, opts);
                }, pose.name, { yaw: pose.yaw, pitch: pose.pitch, distance: pose.distance });
            }
            await new Promise((r) => setTimeout(r, 800));
            const out = path.join(SCREEN_DIR, pose.out);
            await page.screenshot({ path: out });
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
