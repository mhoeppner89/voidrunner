// Combat review page: benchmark charts, recorded before/after duel replays,
// the two reversal manoeuvres, effect comparisons and the live FX lab.
// Data comes from output/combat-review/ (record.mjs, cliff-duel.mjs) and
// output/fx-review/ (fx-review/capture.mjs).
import * as THREE from 'three';
import { SCENARIOS } from '../fx-review/scenarios.js';

const $ = (id) => document.getElementById(id);
const fetchJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${url}`))));
const fmt = (value, digits = 2) => (Math.round(value * 10 ** digits) / 10 ** digits).toFixed(digits);
const TIERS = ['novice', 'veteran', 'ace'];
const SHIP_COLORS = [0xff6b5c, 0x6cb8ff];

// ---- Speed colour ramp: stopped red → half amber → full cyan → burner white.
const ramp = [[0, [1, .3, .3]], [.5, [1, .69, .23]], [1, [.39, .88, 1]], [1.25, [1, 1, 1]]];
function speedColor(f, out = new THREE.Color()) {
    f = Math.max(0, Math.min(1.25, f));
    for (let i = 1; i < ramp.length; i++) {
        if (f <= ramp[i][0]) {
            const [a, ca] = ramp[i - 1], [b, cb] = ramp[i], t = (f - a) / (b - a);
            return out.setRGB(ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t);
        }
    }
    return out.setRGB(1, 1, 1);
}

// ---- Overview cards and benchmark charts.
const METRICS = [
    { key: 'terrainDecelPerMin', label: 'Rock-forced hard brakes / min', lower: true },
    { key: 'terrainStopsPerMin', label: 'Rock-forced stops / min', lower: true },
    { key: 'bumpsPerMin', label: 'Wall contacts / min', lower: true },
    { key: 'limitedFrac', label: 'Time slowed by terrain', lower: true, percent: true },
    { key: 'meanSpeed', label: 'Mean speed (share of cruise)', lower: false, percent: true },
    { key: 'msPerShipStep', label: 'AI cost per ship step (ms)', lower: true, digits: 3 },
];
function renderBenchmark(bench) {
    const avg = (side, key) => TIERS.reduce((n, t) => n + bench[side][t][key], 0) / TIERS.length;
    const change = (key) => (avg('after', key) - avg('before', key)) / avg('before', key);
    const cards = [
        [`${Math.round(-change('terrainDecelPerMin') * 100)}%`, 'fewer rock-forced hard brakes'],
        [`${Math.round(-change('terrainStopsPerMin') * 100)}%`, 'fewer rock-forced stops'],
        [`${Math.round(-change('bumpsPerMin') * 100)}%`, 'fewer wall contacts'],
        [`${Math.round(-change('limitedFrac') * 100)}%`, 'less time slowed by terrain'],
        ['4', 'explosion kinds (was 1)'],
        ['7', 'distinct weapon/surface hits (was 1)'],
    ];
    $('cards').innerHTML = cards.map(([value, text]) => `<div class="card"><b>${value}</b><span>${text}</span></div>`).join('');
    $('bench').innerHTML = METRICS.map((m) => {
        const max = Math.max(...TIERS.flatMap((t) => [bench.before[t][m.key], bench.after[t][m.key]])) * 1.08;
        const show = (v) => (m.percent ? `${fmt(v * 100, 1)}%` : fmt(v, m.digits ?? 2));
        const rows = TIERS.map((t) => {
            const b = bench.before[t][m.key], a = bench.after[t][m.key], d = (a - b) / b;
            const good = m.lower ? d < -.02 : d > .02, bad = m.lower ? d > .02 : d < -.02;
            return `<div class="row"><span>${t}<br><span class="delta ${good ? 'good' : bad ? 'bad' : ''}">${d > 0 ? '+' : ''}${Math.round(d * 100)}%</span></span><div class="bars">
              <div class="bar before"><s><i style="width:${b / max * 100}%"></i></s><em>${show(b)}</em></div>
              <div class="bar after"><s><i style="width:${a / max * 100}%"></i></s><em>${show(a)}</em></div></div></div>`;
        }).join('');
        return `<div class="chart"><h4>${m.label}</h4>${rows}<div class="legend"><span><i style="background:var(--before)"></i>before</span><span><i style="background:var(--after)"></i>after</span></div></div>`;
    }).join('');
}

// ---- A 3D track view (one WebGL canvas) sharing an orbit with its partner.
class TrackView {
    constructor(canvas, orbit) {
        this.canvas = canvas; this.orbit = orbit;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x02050b);
        this.camera = new THREE.PerspectiveCamera(50, 1.6, 1, 20000);
        this.scene.add(new THREE.HemisphereLight(0xb8c8e8, 0x2a2018, 1.1));
        const sun = new THREE.DirectionalLight(0xfff0dc, 1.6); sun.position.set(.6, 1, .4); this.scene.add(sun);
        this.content = new THREE.Group(); this.scene.add(this.content);
        let drag;
        canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
        canvas.addEventListener('pointermove', (e) => {
            if (!drag) return;
            orbit.yaw -= (e.clientX - drag.x) * .006;
            orbit.pitch = Math.max(-1.45, Math.min(1.45, orbit.pitch + (e.clientY - drag.y) * .006));
            drag = { x: e.clientX, y: e.clientY };
        });
        canvas.addEventListener('pointerup', () => { drag = undefined; canvas.style.cursor = ''; });
        canvas.addEventListener('wheel', (e) => { orbit.distance *= Math.exp(e.deltaY * .001); e.preventDefault(); }, { passive: false });
    }
    clear() {
        this.content.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
        this.content.clear();
        this.trails = [];
    }
    // tracks: [{ samples, color }], samples [x,y,z,speed,flags,...] at `rate` Hz.
    load({ rock, tracks, rate, centre, target }) {
        this.clear(); this.rate = rate;
        this.content.position.set(-centre[0], -centre[1], -centre[2]);
        if (rock?.triangles?.length) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(rock.triangles, 3));
            geometry.computeVertexNormals();
            this.content.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: 0x7a6e60, transparent: true, opacity: .42, depthWrite: false, side: THREE.DoubleSide })));
            const edges = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x9a8a74, wireframe: true, transparent: true, opacity: .05, depthWrite: false }));
            this.content.add(edges);
        }
        for (const [x, y, z, r] of rock?.spheres ?? []) {
            const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshLambertMaterial({ color: 0x6e655a, transparent: true, opacity: .5, depthWrite: false, flatShading: true }));
            ball.position.set(x, y, z); this.content.add(ball);
        }
        if (target) {
            const mark = new THREE.Mesh(new THREE.OctahedronGeometry(6), new THREE.MeshBasicMaterial({ color: 0xe8b84a, wireframe: true }));
            mark.position.fromArray(target); this.content.add(mark);
        }
        const color = new THREE.Color();
        for (const { samples, color: shipColor } of tracks) {
            const n = samples.length, positions = new Float32Array(n * 3), colors = new Float32Array(n * 3);
            const events = [];
            samples.forEach((s, i) => {
                positions.set([s[0], s[1], s[2]], i * 3);
                speedColor(s[3], color).toArray(colors, i * 3);
                if (s[4] & 2) events.push([i, s, 0xff3b3b]);
                if (s[4] & 4) events.push([i, s, 0xffffff]);
                if (s[4] & 8) events.push([i, s, 0xff9a2e]);
            });
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            const ghost = new THREE.Line(geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .32 }));
            const live = new THREE.Line(geometry, new THREE.LineBasicMaterial({ vertexColors: true }));
            this.content.add(ghost, live);
            const eventGeometry = new THREE.BufferGeometry();
            eventGeometry.setAttribute('position', new THREE.Float32BufferAttribute(events.flatMap(([, s]) => [s[0], s[1], s[2]]), 3));
            eventGeometry.setAttribute('color', new THREE.Float32BufferAttribute(events.flatMap(([, , hex]) => color.setHex(hex).toArray()), 3));
            const points = new THREE.Points(eventGeometry, new THREE.PointsMaterial({ size: 10, sizeAttenuation: false, vertexColors: true, depthTest: false }));
            points.renderOrder = 2;
            this.content.add(points);
            const ship = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), new THREE.MeshBasicMaterial({ color: shipColor }));
            ship.renderOrder = 3; ship.material.depthTest = false;
            this.content.add(ship);
            this.trails.push({ samples, live, points, events, ship });
        }
    }
    setTime(t) {
        for (const trail of this.trails) {
            const index = Math.min(trail.samples.length - 1, Math.floor(t * this.rate));
            trail.live.geometry.setDrawRange(0, index + 1);
            trail.points.geometry.setDrawRange(0, trail.events.filter(([i]) => i <= index).length);
            const s = trail.samples[index];
            trail.ship.position.set(s[0], s[1], s[2]);
        }
    }
    render() {
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        if (!w || !h) return;
        if (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio())) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
        const o = this.orbit, d = o.distance;
        this.camera.position.set(Math.sin(o.yaw) * Math.cos(o.pitch) * d, Math.sin(o.pitch) * d, Math.cos(o.yaw) * Math.cos(o.pitch) * d);
        this.camera.lookAt(0, 0, 0);
        this.renderer.render(this.scene, this.camera);
    }
}

// ---- Speed-over-time strip under each view.
function drawSpeed(canvas, tracks, rate, duration, t) {
    const dpr = Math.min(2, devicePixelRatio), w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const x = (time) => 34 + (w - 44) * time / duration, y = (f) => h - 16 - (h - 26) * Math.min(1.6, f) / 1.6;
    g.font = '10px ui-monospace, Menlo, monospace'; g.fillStyle = '#8ea0bf';
    for (const [f, label] of [[0, '0'], [1, 'cruise'], [1.5, 'burn']]) {
        g.strokeStyle = f === 1 ? '#2d4266' : '#16233b'; g.beginPath(); g.moveTo(34, y(f)); g.lineTo(w - 10, y(f)); g.stroke();
        g.fillText(label, 2, y(f) + 3);
    }
    tracks.forEach(({ samples, color }) => {
        g.strokeStyle = `#${color.toString(16).padStart(6, '0')}`; g.lineWidth = 1.4; g.beginPath();
        samples.forEach((s, i) => { const px = x(i / rate), py = y(s[3]); i ? g.lineTo(px, py) : g.moveTo(px, py); });
        g.stroke();
        samples.forEach((s, i) => {
            const marks = [[2, '#ff3b3b'], [4, '#ffffff'], [8, '#ff9a2e']].filter(([bit]) => s[4] & bit);
            for (const [, c] of marks) { g.fillStyle = c; g.beginPath(); g.arc(x(i / rate), h - 7, 3.2, 0, Math.PI * 2); g.fill(); }
        });
    });
    g.strokeStyle = '#e8b84a'; g.lineWidth = 1; g.beginPath(); g.moveTo(x(t), 4); g.lineTo(x(t), h - 2); g.stroke();
}

const counts = (side) => side.ships.reduce((n, s) => ({ brakes: n.brakes + s.brakes, stops: n.stops + s.stops, bumps: n.bumps + s.bumps }), { brakes: 0, stops: 0, bumps: 0 });
const countText = (c) => `· ${c.brakes} hard brakes · ${c.stops} stops · ${c.bumps} contacts`;

// ---- Page state and the shared animation loop.
const views = [];
let duels = [], duel, time = 0, playing = true, lastFrame = performance.now();
const duelOrbit = { yaw: .8, pitch: .45, distance: 900 }, revOrbit = { yaw: Math.PI / 2, pitch: .08, distance: 520 };

// Centre and camera distance that frame every sample of the given tracks.
function frameTracks(tracks) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const track of tracks) for (const s of track) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], s[k]); max[k] = Math.max(max[k], s[k]); }
    return { centre: [0, 1, 2].map((k) => (min[k] + max[k]) / 2), distance: Math.max(220, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) * 1.15) };
}
function selectDuel(index) {
    duel = duels[index];
    const { centre, distance } = frameTracks([...duel.before.ships, ...duel.after.ships].map((ship) => ship.track));
    duelOrbit.distance = distance;
    for (const [side, view] of [['before', views[0]], ['after', views[1]]]) {
        view.load({ rock: duel.rock, centre, rate: 10, tracks: duel[side].ships.map((ship, i) => ({ samples: ship.track, color: SHIP_COLORS[i] })) });
    }
    $('countBefore').textContent = countText(counts(duel.before));
    $('countAfter').textContent = countText(counts(duel.after));
    time = 0;
}

let reversals;
function setupReversals(data) {
    reversals = data.reversals;
    const flip = reversals.find((r) => r.kind === 'boost-reversal'), loop = reversals.find((r) => r.kind === 'immelmann');
    const { centre, distance } = frameTracks([flip.track, loop.track, [[...flip.target]]]);
    revOrbit.distance = distance * .9;
    for (const [rev, view, label] of [[flip, views[2], 'revFlip'], [loop, views[3], 'revLoop']]) {
        view.load({ centre, rate: 20, target: rev.target, tracks: [{ samples: rev.track, color: 0xe8b84a }] });
        const min = Math.min(...rev.track.slice(5).map((s) => s[3]));
        $(label).textContent = `· slowest ${Math.round(min * 100)}% of cruise`;
    }
}

function frame(now) {
    const dt = Math.min(.1, (now - lastFrame) / 1000); lastFrame = now;
    if (duel) {
        const duration = duel.before.ships[0].track.length / 10;
        if (playing) time = (time + dt * +$('rate').value) % duration;
        $('scrub').value = time / duration * 1000;
        $('clock').textContent = `${time.toFixed(1)} s`;
        views[0].setTime(time); views[1].setTime(time);
        drawSpeed($('speedBefore'), duel.before.ships.map((s, i) => ({ samples: s.track, color: SHIP_COLORS[i] })), 10, duration, time);
        drawSpeed($('speedAfter'), duel.after.ships.map((s, i) => ({ samples: s.track, color: SHIP_COLORS[i] })), 10, duration, time);
    }
    if (reversals) {
        const duration = reversals[0].track.length / 20, t = (now / 1000 * 1.2) % duration;
        views[2].setTime(t); views[3].setTime(t);
        drawSpeed($('speedFlip'), [{ samples: reversals[0].track, color: 0xe8b84a }], 20, duration, t);
        drawSpeed($('speedLoop'), [{ samples: reversals[1].track, color: 0xe8b84a }], 20, duration, t);
    }
    for (const view of views) view.render();
    requestAnimationFrame(frame);
}

// ---- Live game: both builds in spectator mode, staged at one moment.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const LIVE = [
    { frame: $('liveBefore'), url: 'output/combat-review/previous/game.html?revision=0.8.2pe' },
    { frame: $('liveAfter'), url: 'game.html?revision=0.8.2pg' },
];
async function gameApi(frame) {
    for (let i = 0; i < 480; i++) { const api = frame.contentWindow?.__VOID_PRIVATEER__; if (api?.startObserver) return api; await sleep(250); }
    throw new Error('game did not start');
}
// Spectator editor → 1v1 of the chosen hull and tier → both fighters moved to
// the recorded start. The battle itself starts in `go`, for both panes at once.
async function prepareDuel(api, start, tier, hull) {
    if (!api.getRuntime?.()?.arena?.observer) await api.startObserver('asteroid-field');
    const r = api.getRuntime();
    if (!r.observerEditor) r.observerReturnToEditor();
    r.audio?.setVolumes?.(0, 0);
    r.observerSetDifficulty(tier); r.observerSelectShip(hull); r.observerPreset('1v1');
    const ships = r.ships.filter((ship) => ship.observerTeam && ship.hull > 0).sort((a, b) => (a.observerTeam === 'blue' ? -1 : 1) - (b.observerTeam === 'blue' ? -1 : 1));
    ships.forEach((ship, i) => {
        for (let k = 0; k < 3; k++) ship.position[k] = start[i][k];
        ship.maxHull = ship.hull = 1e6;
    });
    return r;
}
let liveRuntimes = [];
async function stageLive() {
    const duelEntry = duels[+$('liveStart').value];
    if (!duelEntry) return;
    $('liveRestart').disabled = $('liveKill').disabled = true;
    $('liveStatus').textContent = 'Loading both builds (terrain takes a few seconds)…';
    try {
        const apis = await Promise.all(LIVE.map((pane) => gameApi(pane.frame)));
        liveRuntimes = await Promise.all(apis.map((api) => prepareDuel(api, duelEntry.start, $('liveTier').value, $('liveHull').value)));
        for (const r of liveRuntimes) r.observerStartBattle();
        $('liveStatus').textContent = 'Live. Both started together from the same spot.';
        $('liveRestart').disabled = $('liveKill').disabled = false;
    } catch (error) { $('liveStatus').textContent = `Could not stage the duel: ${error.message}`; }
}
$('liveGo').addEventListener('click', () => {
    for (const pane of LIVE) if (!pane.frame.src) pane.frame.src = pane.url;
    $('liveGo').textContent = 'Reload duel';
    stageLive();
});
$('liveRestart').addEventListener('click', stageLive);
$('liveKill').addEventListener('click', () => {
    for (const r of liveRuntimes) {
        const red = r.ships.find((ship) => ship.observerTeam === 'red' && ship.hull > 0), blue = r.ships.find((ship) => ship.observerTeam === 'blue');
        if (red) { red.shield = 0; r.damageShip(red, red.hull + 10, blue?.id ?? 'player', red.position); }
    }
});

// ---- Live effects: the same moment with the old and the new effect code.
const FX = [{ frame: $('fxBefore'), legacy: true }, { frame: $('fxAfter'), legacy: false }];
let moment = 'pulse-impact';
const fxHook = (frame) => frame.contentWindow?.__FX_REVIEW__;
function loadMoment(name) {
    moment = name;
    for (const button of document.querySelectorAll('#moments button')) button.classList.toggle('is-on', button.dataset.moment === name);
    // The panes are smaller than the full review: start the camera closer.
    const query = new URLSearchParams(SCENARIOS[name].query);
    query.set('distance', Math.round(+(query.get('distance') ?? 60) * .7));
    for (const pane of FX) pane.frame.src = `tools/playtest/fx-review/index.html?nopanel&scenario=${name}&${query}${pane.legacy ? '&legacy' : ''}`;
}
$('moments').innerHTML = Object.entries(SCENARIOS).map(([name, entry]) => `<button data-moment="${name}">${entry.label}</button>`).join('');
$('moments').addEventListener('click', (e) => { const name = e.target.dataset?.moment; if (name) loadMoment(name); });
$('fxReplay').addEventListener('click', () => { for (const pane of FX) fxHook(pane.frame)?.restart(); });
// Keep both panes on one camera and one clock.
let lastOrbit;
function syncFx() {
    const hooks = FX.map((pane) => fxHook(pane.frame));
    if (hooks.every(Boolean)) {
        // A freshly loaded pair starts its loop together.
        if (hooks.some((hook) => !hook.paired)) for (const hook of hooks) { hook.paired = true; hook.restart(); }
        const speed = +$('fxSpeed').value;
        for (const hook of hooks) hook.setTimeScale(speed);
        const key = (o) => `${o.yaw.toFixed(4)}|${o.pitch.toFixed(4)}|${o.distance.toFixed(2)}`;
        const moved = hooks.find((hook) => key(hook.orbit) !== lastOrbit) ?? hooks[0];
        for (const hook of hooks) if (hook !== moved) Object.assign(hook.orbit, { yaw: moved.orbit.yaw, pitch: moved.orbit.pitch, distance: moved.orbit.distance });
        lastOrbit = key(moved.orbit);
    }
    requestAnimationFrame(syncFx);
}
new IntersectionObserver((entries, observer) => {
    if (entries.some((entry) => entry.isIntersecting)) { loadMoment(moment); observer.disconnect(); }
}).observe($('fxAfter'));
requestAnimationFrame(syncFx);

// ---- Wire everything up.
views.push(new TrackView($('viewBefore'), duelOrbit), new TrackView($('viewAfter'), duelOrbit), new TrackView($('viewFlip'), revOrbit), new TrackView($('viewLoop'), revOrbit));
$('play').addEventListener('click', () => { playing = !playing; $('play').textContent = playing ? 'Pause' : 'Play'; });
$('scrub').addEventListener('input', () => { if (!duel) return; playing = false; $('play').textContent = 'Play'; time = $('scrub').value / 1000 * duel.before.ships[0].track.length / 10; });
$('duel').addEventListener('change', () => selectDuel(+$('duel').value));
$('labLoad').addEventListener('click', () => { $('labFrame').src = 'tools/playtest/fx-review/index.html'; $('labLoad').remove(); });
fetchJson('output/combat-review/benchmark.json').then(renderBenchmark).catch(() => {
    $('bench').innerHTML = '<div class="missing">Benchmark data missing: run tools/playtest/probes/cliff-duel.mjs for both versions.</div>';
});
fetchJson('output/combat-review/duels.json').then((data) => {
    duels = data.duels;
    $('duel').innerHTML = duels.map((d, i) => {
        const b = counts(d.before), a = counts(d.after), total = (c) => c.brakes + c.stops + c.bumps;
        return `<option value="${i}">${d.tier} · rock events ${total(b)} → ${total(a)}</option>`;
    }).join('');
    const best = duels.reduce((bi, d, i) => (counts(d.before).brakes + counts(d.before).stops + counts(d.before).bumps - counts(d.after).brakes - counts(d.after).stops - counts(d.after).bumps) >
        (counts(duels[bi].before).brakes + counts(duels[bi].before).stops + counts(duels[bi].before).bumps - counts(duels[bi].after).brakes - counts(duels[bi].after).stops - counts(duels[bi].after).bumps) ? i : bi, 0);
    $('duel').value = best;
    selectDuel(best);
    setupReversals(data);
    $('liveStart').innerHTML = duels.map((d, i) => `<option value="${i}">${d.tier} cliff start ${d.id.split('-')[1]}</option>`).join('');
    $('liveStart').value = best; $('liveTier').value = duels[best].tier;
    $('liveStart').addEventListener('change', () => { $('liveTier').value = duels[+$('liveStart').value].tier; });
}).catch(() => {
    for (const id of ['viewBefore', 'viewAfter', 'viewFlip', 'viewLoop']) $(id).closest('figure').insertAdjacentHTML('beforeend', '<div class="missing">Recording missing: run tools/playtest/combat-review/record.mjs (see its header).</div>');
});
requestAnimationFrame(frame);
