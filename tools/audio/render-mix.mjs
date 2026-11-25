// Offline mix renders: drives the real AudioManager through scripted flight
// scenarios inside headless Chrome (OfflineAudioContext, never the speakers)
// and writes WAVs plus loudness figures to output/audio-mix.
//
//   node tools/audio/render-mix.mjs                 all scenarios
//   node tools/audio/render-mix.mjs dogfight dock   named scenarios
//   VR_AUDIO_MODULE=/output/audio-ref/src/game/audio.js   render another build for comparison
//   node tools/audio/render-mix.mjs --pieces        every score piece, music only (output/audio-mix/music)
//   node tools/audio/render-mix.mjs --pieces open-pale-rime dock-nacre
//   VR_PIECE_SECONDS=60  length of each piece render (default 48)
//
// Needs the repository served (VR_BASE_URL, default http://127.0.0.1:4192) and ffmpeg.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const base = process.env.VR_BASE_URL ?? 'http://127.0.0.1:4192';
const moduleUrl = process.env.VR_AUDIO_MODULE ?? '/src/game/audio.js';
const pieceMode = process.argv.includes('--pieces');
const out = process.env.VR_AUDIO_OUT ?? (pieceMode ? 'output/audio-mix/music' : 'output/audio-mix');
const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
await mkdir(out, { recursive: true });

// Each scenario: seconds, a per-frame state(t) and timed one-shot actions.
// Scenario bodies run in the page, so they are passed as source text.
const SCENARIOS = {
    cruise: { seconds: 40, context: 'open', state: `(t) => ({ throttle: t < 6 ? 0.2 : t < 20 ? 0.85 : t < 30 ? 0.45 : 1, burn: t > 30 && t < 36, speed: Math.min(1, t / 12), turn: (t > 14 && t < 16) ? 0.8 : 0 })`, actions: `[]` },
    dogfight: {
        seconds: 45, context: 'open', seed: 'dogfight',
        state: `(t) => ({ throttle: 0.8, burn: t > 20 && t < 24, enemies: t < 4 ? 0 : t < 14 ? 1 : t < 34 ? 3 : 0, damage: t > 26 ? 0.75 : 0.1, speed: 0.8, turn: 0.4 + 0.4 * Math.sin(t), lockState: t < 14 || t >= 17.5 ? 'off' : t < 16.5 ? 'acquiring' : 'locked', missileThreat: t >= 17.5 && t < 20 ? .45 + .2 * (t - 17.5) : 0, missileBreak: t === 19, missileCommitted: t >= 19 && t < 20, shield: t > 18 && t < 30 ? 0 : 1 })`,
        actions: `(() => { const list = [];
            for (let t = 5; t < 34; t += 0.17) if (Math.sin(t * 0.9) > -0.2) list.push([t, (a) => a.play('laser', 0.72)]);
            for (let t = 8; t < 34; t += 1.1) list.push([t, (a) => a.play('gauss', 0.85)]);
            for (let t = 6; t < 34; t += 0.23) list.push([t, (a) => a.playAtDirection('laser', 0.5, 120 + 80 * Math.sin(t), 90 * Math.cos(t * 1.3), 60 * Math.sin(t))]);
            for (let t = 7; t < 34; t += 0.9) list.push([t, (a) => a.playAtDirection('impact', 0.45, 150, 60 * Math.sin(t * 2), -80)]);
            for (let t = 9; t < 30; t += 1.7) list.push([t, (a) => a.playCockpit(t > 18 ? 'hit' : 'shield', 1)]);
            for(let t=6;t<34;t+=.24)if(Math.sin(t*.9)>-.2)list.push([t,a=>a.playCockpit(t%3<2?'confirmShield':'confirmHull')]);
            list.push([18, (a) => a.playCockpit('shieldBreak', 1)]);
            for (const t of [12, 21, 27, 33]) list.push([t, (a) => { a.playAtDirection('explosion', 1.1, 140, 80, -60); a.play('kill', 0.8); }]);
            for (let t = 10; t < 32; t += 3.3) list.push([t, (a) => a.playAtDirection('flyby', 0.9, 40, t % 2 ? 30 : -30, 0)]);
            for (const t of [13, 13.65, 14.3]) list.push([t, (a) => a.playCockpit('rackSearch')]);
            list.push([13.4, (a) => a.playCockpit('rackDenied')], [14.95, (a) => a.playCockpit('rackReady')]);
            list.push([15, (a) => a.play('missile')], [17.5, (a) => a.playCockpit('missileLaunch', .9)], [25.5, (a) => a.playCockpit('targetShieldBreak', 0.7)]);
            return list; })()`,
    },
    beamScatter: {
        seconds: 12, effectsOnly: true, noMusic: true, state: `() => ({})`,
        actions: `(() => { const list = [];
            for (let t = 1; t < 8; t += 0.2) {
                list.push([t, (a) => a.play('beam', 0.72)]);
                list.push([t + 0.07, (a) => a.playAtDirection('beam', 0.55, 100, -60, -80)]);
                list.push([t + 0.14, (a) => a.playAtDirection('beam', 0.55, 120, 80, -90)]);
            }
            for (let t = 1.5; t < 8; t += 0.9) list.push([t, (a) => a.play('ripper', 0.72)]);
            return list; })()`,
    },
    hyper: { seconds: 22, context: 'open', state: `(t) => ({ throttle: 0.7, speed: t > 4 && t < 14 ? 1.3 : 0.6, hyper: t > 4 && t < 14 })`, actions: `[[2, (a) => a.play('hyperSpool')], [4, (a) => a.play('hyperActive')], [14, (a) => a.play('hyperDrop')], [16, (a) => a.play('dock')]]` },
    dock: { seconds: 40, docked: true, dockKind: 'station', state: `() => ({})`, actions: `[[3, (a) => a.play('ui')], [3.4, (a) => a.play('uiTab')], [5, (a) => a.play('purchase')], [7, (a) => a.play('deny')], [9, (a) => a.play('equip')], [11, (a) => a.play('confirm')], [13, (a) => a.play('uiOpen')], [14, (a) => a.play('uiClose')], [16, (a) => a.play('reward')]]` },
    planetDock: { seconds: 24, docked: true, dockKind: 'planet', state: `() => ({})`, actions: `[]` },
    planet: { seconds: 36, context: 'planet', state: `() => ({ throttle: 0.5, speed: 0.5 })`, actions: `[]` },
    field: { seconds: 30, context: 'field', state: `() => ({ throttle: 0.5, speed: 0.5 })`, actions: `[[6, (a) => a.play('scan')], [12, (a) => a.play('mining', 0.5)], [20, (a) => a.play('pickup', 0.7)]]` },
    graveyard: { seconds: 40, context: 'graveyard', state: `() => ({ throttle: 0.4, speed: 0.4 })`, actions: `[]` },
    stealth: { seconds: 24, context: 'stealth', state: `() => ({ throttle: 0.2, speed: 0.2 })`, actions: `[]` },
    combatMusic: { seconds: 40, context: 'open', musicOnly: true, state: `(t) => ({ throttle: 0, enemies: t < 12 ? 1 : t < 24 ? 2 : 4 })`, actions: `[]` },
    openMusic: { seconds: 40, context: 'open', musicOnly: true, state: `() => ({ throttle: 0 })`, actions: `[]` },
    stationMusic: { seconds: 30, docked: true, musicOnly: true, state: `() => ({})`, actions: `[]` },
};

// Score pieces: each rendered on its own through the review page's audition
// hook, docked at its first location; combat climbs through all three tiers.
if (pieceMode) {
    const { MUSIC_PIECES } = await import('../../src/game/musicScore.js');
    for (const key of Object.keys(SCENARIOS)) delete SCENARIOS[key];
    const seconds = Number(process.env.VR_PIECE_SECONDS) || 48;
    for (const piece of MUSIC_PIECES) {
        const combat = piece.context === 'combat';
        SCENARIOS[piece.id] = {
            seconds, musicOnly: true, piece: piece.id, docked: piece.context === 'station', dockId: piece.locations?.[0],
            context: combat ? 'open' : piece.context === 'station' ? 'open' : piece.context,
            state: combat ? `(t) => ({ enemies: t < ${seconds / 3} ? 1 : t < ${seconds * 2 / 3} ? 2 : 4 })` : `() => ({})`, actions: `[]`,
        };
    }
}

const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox', '--disable-gpu-sandbox', '--mute-audio'] });
const rows = [];
try {
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
        if (only.length && !only.includes(name)) continue;
        if (process.env.VR_STEM === 'music') scenario.musicOnly = true;
        if (process.env.VR_STEM === 'effects') scenario.noMusic = true;
        const page = await browser.newPage();
        page.on('pageerror', (error) => console.error(name, 'page error:', error.message));
        page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') console.error(name, message.text()); });
        await page.goto(`${base}/tools/audio/render-host.html`);
        const result = await page.evaluate(async ({ moduleUrl, scenario }) => {
            // Hold the score, sample variants and ambience constant when balancing cockpit alerts.
            if (scenario.seed) Math.random = (await import('/src/game/random.js')).seededRandom(scenario.seed);
            const rate = 48000, real = new OfflineAudioContext(2, rate * scenario.seconds, rate);
            let clock = 0, created = 0;
            const proxy = new Proxy(real, { get(target, key) {
                if (key === 'currentTime') return clock;
                if (key === 'state') return 'running';
                if (key === 'resume' || key === 'close') return async () => {};
                const value = Reflect.get(target, key, target);
                if (typeof value !== 'function') return value;
                return (...args) => { if (String(key).startsWith('create')) created += 1; return value.apply(target, args); };
            } });
            window.AudioContext = function () { return proxy; };
            const { AudioManager } = await import(moduleUrl);
            const audio = new AudioManager();
            audio.setVolumes(scenario.noMusic ? 0 : 0.34, scenario.musicOnly ? 0 : 0.68);
            await audio.enable();
            if (scenario.seed && audio.music) audio.music.seed = Math.floor(Math.random() * 0x100000000) || 1;
            await audio.samplesReady;
            if (audio.bank) { await audio.bank.load('music'); await audio.bank.load('dock'); }
            if (scenario.musicOnly) audio.effectsVolume = 0;
            if (scenario.piece) audio.music.audition = { id: scenario.piece, bars: 1e6 };
            const state = eval(scenario.state), actions = eval(scenario.actions).sort((a, b) => a[0] - b[0]);
            audio.setStationMode(Boolean(scenario.docked));
            if (scenario.effectsOnly) audio.engine?.silence();
            const flight = {}, baseline = created;
            let next = 0, steady = 0;
            for (let frame = 0; frame < scenario.seconds * 60; frame += 1) {
                clock = frame / 60;
                const s = state(clock);
                Object.assign(flight, { speed: s.speed ?? 0, turn: s.turn ?? 0, yaw: s.turn ?? 0, shield: s.shield ?? 1, hyper: Boolean(s.hyper), lockState: s.lockState, missileThreat: s.missileThreat ?? 0, missileBreak: Boolean(s.missileBreak), missileCommitted: Boolean(s.missileCommitted), dockKind: scenario.dockKind, dockId: scenario.dockId, systemId: 'helios-verge' });
                while (next < actions.length && actions[next][0] <= clock) { actions[next][1](audio); next += 1; }
                if (!scenario.effectsOnly) audio.update(1 / 60, s.throttle ?? 0, Boolean(s.burn), s.damage ?? 0, s.enemies ?? 0, scenario.context, 0, flight);
            }
            const buffer = await real.startRendering();
            const frames = buffer.length, left = buffer.getChannelData(0), right = buffer.getChannelData(1);
            const pcm = new Int16Array(frames * 2);
            let peak = 0, bad = 0;
            for (let i = 0; i < frames; i += 1) {
                if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) bad += 1;
                peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
                pcm[i * 2] = Math.max(-1, Math.min(1, left[i])) * 32767; pcm[i * 2 + 1] = Math.max(-1, Math.min(1, right[i])) * 32767;
            }
            const bytes = new Uint8Array(pcm.buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
            return { pcm: btoa(binary), peak, bad, nodes: created - baseline, voices: audio.activeVoices ?? null };
        }, { moduleUrl, scenario });
        await page.close();
        const pcm = Buffer.from(result.pcm, 'base64'), header = Buffer.alloc(44);
        header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(48000, 24); header.writeUInt32LE(48000 * 4, 28);
        header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
        const wav = `${out}/${name}.wav`;
        await writeFile(wav, Buffer.concat([header, pcm]));
        const loudness = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
        const pickLast = (pattern) => [...loudness.matchAll(pattern)].pop()?.[1] ?? '?';
        spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-lavfi', 'showspectrumpic=s=1200x360:legend=0:scale=log:fscale=log:drange=90', `${out}/${name}.png`]);
        const row = { name, lufs: pickLast(/I:\s+(-?[\d.]+) LUFS/g), range: pickLast(/LRA:\s+(-?[\d.]+) LU/g), truePeak: pickLast(/Peak:\s+(-?[\d.inf]+) dBFS/g), samplePeak: (20 * Math.log10(Math.max(1e-9, result.peak))).toFixed(1), nodesPerSecond: (result.nodes / scenario.seconds).toFixed(0), nonFinite: result.bad };
        rows.push(row);
        console.log(JSON.stringify(row));
        if (result.bad) process.exitCode = 1;
    }
}
finally { await browser.close(); }
await writeFile(`${out}/summary.json`, JSON.stringify(rows, null, 1));
