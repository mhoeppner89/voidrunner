// Run npm run build first. TLS_CERT and TLS_KEY enable HTTPS for LAN browsers.
import {randomBytes} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile, realpath, stat} from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import {networkInterfaces} from 'node:os';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {SIGNAL_PATTERN} from '../../src/game/multiplayer/peerSignal.js';

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
const MAX_BODY = 26_000;
const MAX_ROOMS = 128;
const ROOM_TTL = 10 * 60_000;
const JOIN_TTL = 60_000;
const token = () => randomBytes(16).toString('hex');
const fail = (status, message) => { throw Object.assign(Error(message), {status}); };
const types = {
    '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css',
    '.json':'application/json', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml',
    '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.mp3':'audio/mpeg',
    '.ogg':'audio/ogg', '.glb':'model/gltf-binary', '.woff2':'font/woff2', '.ttf':'font/ttf',
};

async function readJson(req) {
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') fail(415, 'Send JSON.');
    if (Number(req.headers['content-length']) > MAX_BODY) fail(413, 'Request is too large.');
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
        length += chunk.length;
        if (length > MAX_BODY) fail(413, 'Request is too large.');
        chunks.push(chunk);
    }
    try {
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (input && typeof input === 'object' && !Array.isArray(input)) return input;
    } catch { /* report a bad request below */ }
    fail(400, 'Invalid JSON request.');
}

function signalService() {
    const rooms = new Map();
    const prune = () => {
        const now = Date.now();
        for (const [id, room] of rooms) {
            if (room.expires <= now) rooms.delete(id);
            else for (const [id, guest] of room.guests) if (guest.expires <= now) room.guests.delete(id);
        }
    };
    const janitor = setInterval(prune, 15_000);
    janitor.unref();
    function run(body) {
        prune();
        if (body.action === 'create') {
            if (rooms.size >= MAX_ROOMS) fail(503, 'Room service is full.');
            const id = token(), key = token();
            rooms.set(id, {key, guests:new Map(), expires:Date.now() + ROOM_TTL});
            return {room:id, key};
        }
        const room = rooms.get(body.room);
        if (!room) fail(410, 'This room has expired or closed.');
        if (body.action === 'join') {
            if (room.guests.size >= 3) fail(409, 'All three guest seats are reserved.');
            if (typeof body.offer !== 'string' || !SIGNAL_PATTERN.test(body.offer)) fail(400, 'Invalid invite.');
            const id = token(), key = token();
            room.guests.set(id, {key, offer:body.offer, result:null, expires:Date.now() + JOIN_TTL});
            return {id, key};
        }
        const guest = room.guests.get(body.id);
        if (body.action === 'read' || body.action === 'finish') {
            if (!guest || guest.key !== body.key) fail(403, 'Guest connection has closed.');
            if (body.action === 'finish') { room.guests.delete(body.id); return {}; }
            return guest.result || {};
        }
        if (room.key !== body.key) fail(403, 'Only the host can manage this room.');
        switch (body.action) {
            case 'poll':
                return {offers:[...room.guests].filter(([, g]) => !g.result).map(([id,g]) => ({id, offer:g.offer}))};
            case 'answer':
                if (!guest) fail(409, 'Guest connection has closed.');
                if (guest.result) return {};
                if (typeof body.answer === 'string' && SIGNAL_PATTERN.test(body.answer)) guest.result = {answer:body.answer};
                else if (typeof body.error === 'string' && body.error.length <= 200) guest.result = {error:body.error};
                else fail(400, 'Invalid reply.');
                return {};
            case 'close':
                rooms.delete(body.room);
                return {};
            default:
                fail(400, 'Unknown room request.');
        }
    }
    return {run, close:() => clearInterval(janitor)};
}

function json(res, status, data) {
    res.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
    res.end(JSON.stringify(data));
}

export async function createMultiplayerServer({tls} = {}) {
    let root;
    try { root = await realpath(DIST); await stat(resolve(root, 'index.html')); }
    catch { throw Error('Build the packed game with npm run build first.'); }
    const rooms = signalService();
    async function handle(req, res) {
        try {
            let path;
            try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
            catch { fail(400, 'Invalid path.'); }
            if (path === '/multiplayer') {
                if (req.method !== 'POST') fail(405, 'Use POST.');
                const origin = req.headers.origin;
                if (origin && new URL(origin).host !== req.headers.host) fail(403, 'Use the game site for room requests.');
                const result = rooms.run(await readJson(req));
                json(res, 200, result);
                return;
            }
            if (req.method !== 'GET' && req.method !== 'HEAD') fail(405, 'Use GET or HEAD.');
            if (path.split('/').some(part => part.startsWith('.')) || path.includes('\\') || path.includes('\0')) fail(404, 'File not found.');
            const file = await realpath(resolve(root, '.' + (path === '/' ? '/index.html' : path)));
            if (!file.startsWith(root + sep)) fail(404, 'File not found.');
            const info = await stat(file);
            if (!info.isFile()) fail(404, 'File not found.');
            res.writeHead(200, {'Content-Type':types[extname(file)] || 'application/octet-stream',
                'Content-Length':info.size, 'X-Content-Type-Options':'nosniff'});
            if (req.method === 'HEAD') { res.end(); return; }
            const stream = createReadStream(file);
            res.on('close', () => stream.destroy());
            stream.on('error', () => res.destroy());
            stream.pipe(res);
        } catch (error) {
            json(res, error.status || 404, error.status ? {error:error.message} : {error:'File not found.'});
        }
    }
    const server = tls ? https.createServer(tls, handle) : http.createServer(handle);
    server.requestTimeout = 15_000;
    server.headersTimeout = 10_000;
    server.on('close', rooms.close);
    return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    const port = Number(process.env.PORT || 4174);
    const host = process.env.HOST || '0.0.0.0';
    const {TLS_CERT, TLS_KEY} = process.env;
    if (Boolean(TLS_CERT) !== Boolean(TLS_KEY)) throw Error('Set both TLS_CERT and TLS_KEY for HTTPS.');
    const tls = TLS_CERT && {cert:await readFile(TLS_CERT), key:await readFile(TLS_KEY)};
    const server = await createMultiplayerServer({tls});
    server.listen(port, host, () => {
        const addresses = host === '0.0.0.0'
            ? Object.values(networkInterfaces()).flat().filter(a => a.family === 'IPv4' && !a.internal).map(a => a.address)
            : [host];
        for (const address of addresses) console.log('Open this address on the host and guests: ' +
            (tls ? 'https://' : 'http://') + address + ':' + server.address().port + '/');
    });
}
