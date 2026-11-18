// Combat FX review: the live LaserFx / explosion code around a real hull,
// without the rest of the game. Projectiles fly at their real speeds and hit
// the hull's actual surface (or its shield ellipsoid), so impacts sit where
// they would in a fight.
import * as THREE from 'three';
import { LaserFx as CurrentLaserFx, stepTransientEffect } from '../../../src/game/laserFx.js';
import { createHullDebris } from '../../../src/game/explosionFx.js';
// ?legacy loads the previous release's impact and explosion code (exported by
// `git show HEAD:...` into output/combat-review/legacy/) for side-by-side
// captures with the same seed, aim and timing. Projectile visuals did not
// change, so the legacy LaserFx borrows them from the current module.
const legacy = new URLSearchParams(location.search).has('legacy');
const fxModule = legacy ? await import('/output/combat-review/legacy/laserFx.js') : { LaserFx: CurrentLaserFx };
const { createShipExplosion } = legacy ? await import('/output/combat-review/legacy/explosionFx.js') : await import('../../../src/game/explosionFx.js');
const LaserFx = fxModule.LaserFx;
if (!LaserFx.prototype.projectileFor) for (const name of ['projectileFor', 'cloudTexture']) LaserFx.prototype[name] = CurrentLaserFx.prototype[name];
import { loadPreviewGlb } from '../../../src/game/shipPreview.js';
import { WEAPONS } from '../../../src/game/weapons.js';
import { SCENARIOS } from './scenarios.js';

// ?seed=N makes every random choice (aim, sparks) repeatable for captures.
{
    const seed = new URLSearchParams(location.search).get('seed');
    if (seed !== null) { let state = +seed || 1; Math.random = () => ((state = Math.imul(state ^ state >>> 15, 2246822507) + 0x6d2b79f5 | 0) >>> 0) / 4294967296; }
}
const canvas = document.createElement('canvas');
document.body.prepend(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040a);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 6000);
scene.add(new THREE.HemisphereLight(0x8fa6d8, 0x1a1208, 0.55));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
sun.position.set(300, 220, 140);
scene.add(sun);

// A sparse starfield, so motion and additive glows read against something.
{
    const count = 1600, positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
        positions.set([Math.cos(a) * r * 3000, z * 3000, Math.sin(a) * r * 3000], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x9fb4d8, size: 1.4, sizeAttenuation: false })));
}

const effects = [];
const fx = new LaserFx(scene, effects);
const params = new URLSearchParams(location.search);
// ?scenario=name repeats one named moment live (scenarios.js) and takes its
// camera/surface/explosion settings unless the URL overrides them.
const scenario = SCENARIOS[params.get('scenario')];
for (const [key, value] of new URLSearchParams(scenario?.query ?? '')) if (!params.has(key)) params.set(key, value);
const hull = new THREE.Group();
scene.add(hull);
let hullMeshes = [];
let extents = new THREE.Vector3(10, 3, 9);
async function loadHull(variant) {
    hull.clear();
    const model = await loadPreviewGlb(variant);
    if (model) {
        hull.add(model);
        hull.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        box.getSize(extents).multiplyScalar(.5);
    } else {
        hull.add(new THREE.Mesh(new THREE.BoxGeometry(20, 6, 18), new THREE.MeshStandardMaterial({ color: 0x6b7480, metalness: .5, roughness: .6 })));
    }
    hullMeshes = [];
    hull.traverse((o) => { if (o.isMesh) hullMeshes.push(o); });
}
await loadHull(params.get('hull') ?? 'scrapper');

// Camera orbit.
const orbit = { yaw: 0.9, pitch: 0.28, distance: 60 };
function placeCamera() {
    const d = orbit.distance;
    camera.position.set(Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * d, Math.sin(orbit.pitch) * d, Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * d);
    camera.lookAt(0, 0, 0);
}
let drag;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    orbit.yaw -= (e.clientX - drag.x) * 0.006;
    orbit.pitch = Math.max(-1.4, Math.min(1.4, orbit.pitch + (e.clientY - drag.y) * 0.006));
    drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', () => { drag = undefined; });
canvas.addEventListener('wheel', (e) => { setDistance(orbit.distance * Math.exp(e.deltaY * 0.001)); e.preventDefault(); }, { passive: false });
const distanceInput = document.getElementById('distance');
function setDistance(value) {
    orbit.distance = Math.max(15, Math.min(220, value));
    distanceInput.value = orbit.distance;
    document.getElementById('distanceValue').textContent = `${Math.round(orbit.distance)} m`;
}
distanceInput.addEventListener('input', () => setDistance(+distanceInput.value));
setDistance(+(params.get('distance') ?? 60));
if (params.has('yaw')) orbit.yaw = +params.get('yaw');
if (params.has('pitch')) orbit.pitch = +params.get('pitch');

let timeScale = params.has('paused') ? 0 : 1;
const speedInput = document.getElementById('speed');
speedInput.addEventListener('input', () => {
    timeScale = +speedInput.value;
    document.getElementById('speedValue').textContent = `${timeScale.toFixed(2)}×`;
});

// Same impact palette as the game's projectile hits (game.js).
const IMPACT_COLOR = { missile: 0xff7a42, gauss: 0xbfe9ff, ion: 0x8fe4f0, mortar: 0xffa04d, pdc: 0xdce9ff, ripper: 0xffcb62, laser: 0xffcb62 };
const SHOTS = [
    { label: 'Pulse (player)', kind: 'laser', faction: 'player', weapon: 'pulse' },
    { label: 'Pulse (pirate)', kind: 'laser', faction: 'pirates', weapon: 'pulse' },
    { label: 'Pulse (patrol)', kind: 'laser', faction: 'patrol', weapon: 'pulse' },
    { label: 'Magrail', kind: 'gauss', faction: 'player', weapon: 'gauss' },
    { label: 'PDC burst', kind: 'pdc', faction: 'player', weapon: 'pdc', burst: 8 },
    { label: 'Ripper', kind: 'ripper', faction: 'player', weapon: 'ripper', pellets: 7 },
    { label: 'Ion', kind: 'ion', faction: 'player', weapon: 'ion' },
    { label: 'Plasma mortar', kind: 'mortar', faction: 'player', weapon: 'mortar' },
    { label: 'Seeker missile', kind: 'missile', faction: 'player', launcherId: 'seeker', speed: 160 },
    { label: 'Torpedo', kind: 'missile', faction: 'player', launcherId: 'torpedo', speed: 110 },
];
let surface = params.get('surface') ?? 'hull';
const projectiles = [];
const raycaster = new THREE.Raycaster();
const tmp = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), NEG_Z = new THREE.Vector3(0, 0, -1);

// Where a ray from `origin` along `direction` meets the hull or its shield.
function hitPoint(origin, direction) {
    if (surface === 'shield') {
        const s = tmp.copy(extents).multiplyScalar(1.8);
        const o = new THREE.Vector3(origin.x / s.x, origin.y / s.y, origin.z / s.z), d = new THREE.Vector3(direction.x / s.x, direction.y / s.y, direction.z / s.z);
        const a = d.lengthSq(), b = o.dot(d), c = o.lengthSq() - 1, disc = b * b - a * c;
        if (disc < 0) return;
        const t = (-b - Math.sqrt(disc)) / a;
        return { point: origin.clone().addScaledVector(direction, t), normal: new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t).normalize() };
    }
    raycaster.set(origin, direction);
    const hit = raycaster.intersectObjects(hullMeshes, false)[0];
    if (!hit) return;
    const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : direction.clone().negate();
    return { point: hit.point, normal, object: hit.object };
}

function hullPoint() {
    const mesh = hullMeshes[Math.floor(Math.random() * hullMeshes.length)];
    const position = mesh?.geometry?.getAttribute('position');
    if (!position) return new THREE.Vector3();
    return new THREE.Vector3().fromBufferAttribute(position, Math.floor(Math.random() * position.count)).applyMatrix4(mesh.matrixWorld);
}
function fire(shot) {
    const weapon = WEAPONS[shot.weapon];
    const speed = shot.speed ?? weapon?.speed ?? 500;
    // Fire from a muzzle off the left of the view, aimed at a real hull vertex.
    placeCamera();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), toCamera = camera.position.clone().normalize();
    const muzzle = right.multiplyScalar(-120).addScaledVector(toCamera, 25).add(new THREE.Vector3(0, 14, 0));
    const count = shot.pellets ?? 1, bursts = shot.burst ?? 1;
    for (let b = 0; b < bursts; b++) {
        const aim = hullPoint();
        for (let i = 0; i < count; i++) {
            const direction = aim.clone().sub(muzzle).normalize();
            if (count > 1) direction.add(new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(weapon.spreadRad * 2)).normalize();
            const hit = hitPoint(muzzle, direction);
            const mesh = fx.projectileFor({ kind: shot.kind, faction: shot.faction, launcherId: shot.launcherId });
            mesh.position.copy(muzzle);
            mesh.quaternion.copy(tmpQ.setFromUnitVectors(NEG_Z, direction));
            scene.add(mesh);
            projectiles.push({ mesh, shot, direction, speed, travelled: 0, delay: b * (weapon?.shotInterval ?? .07), length: hit ? hit.point.distanceTo(muzzle) : 400, hit });
        }
        if (b === 0) fx.muzzleFlash(muzzle.x, muzzle.y, muzzle.z, shot.faction === 'pirates' ? 0xff4b39 : shot.faction === 'patrol' ? 0x75cfff : shot.kind === 'gauss' ? 0xbfe9ff : 0xffc35a);
    }
}

function impact(p) {
    const { shot, hit } = p;
    if (!hit) return;
    const heavy = shot.kind === 'missile' || shot.kind === 'mortar';
    const color = shot.kind === 'laser' && shot.faction !== 'player' ? (shot.faction === 'pirates' ? 0xff7050 : 0x7cffff) : IMPACT_COLOR[shot.kind] ?? 0xffcb62;
    if (!fx.weaponImpact) fx.impact(hit.point.toArray(), color, heavy);
    else fx.weaponImpact({ position: hit.point.toArray(), normal: hit.normal.toArray(), direction: p.direction.toArray(), kind: shot.kind, color, heavy,
        shielded: surface === 'shield', attach: surface === 'shield' ? undefined : hull });
    if (shot.kind === 'missile') explode(hit.point.toArray(), .65);
}

let variant = params.get('variant') ?? undefined, blastCount = 0;
function explode(position, scale = 1) {
    const effect = createShipExplosion(position, scale, { variant, seed: `review-${blastCount++}` });
    scene.add(effect.object);
    effects.push(effect);
}
const EXPLOSIONS = [
    { label: 'Fighter', scale: 1, debris: true },
    { label: 'Freighter', scale: 1.5, debris: true },
    { label: 'Missile', scale: .65 },
    { label: 'Frigate', scale: 6, debris: true },
];
function blowUp(e) {
    explode([0, 0, 0], e.scale);
    if (e.debris) { const d = createHullDebris([0, 0, 0], Math.max(.5, e.scale * .65), [0, 0, 0]); scene.add(d.object); effects.push(d); }
}

function button(parent, label, action) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', action);
    document.getElementById(parent).append(b);
    return b;
}
for (const shot of SHOTS) button('weapons', shot.label, () => fire(shot));
const surfaceButtons = ['hull', 'shield'].map((name) => button('surfaces', name === 'hull' ? 'Bare hull' : 'Shield', () => {
    surface = name;
    for (const b of surfaceButtons) b.classList.toggle('is-on', b.textContent === (name === 'hull' ? 'Bare hull' : 'Shield'));
}));
surfaceButtons[surface === 'hull' ? 0 : 1].classList.add('is-on');
for (const e of EXPLOSIONS) button('explosions', e.label, () => blowUp(e));
const variantButtons = ['random', 'fireball', 'chain', 'breach', 'breakup'].map((name) => button('variants', name, () => {
    variant = name === 'random' ? undefined : name;
    for (const b of variantButtons) b.classList.toggle('is-on', b.textContent === name);
}));
variantButtons.find((b) => b.textContent === (variant ?? 'random')).classList.add('is-on');
let demo = params.has('demo');
const demoButton = document.getElementById('demo');
demoButton.classList.toggle('is-on', demo);
demoButton.addEventListener('click', () => { demo = !demo; demoButton.classList.toggle('is-on', demo); });
document.getElementById('clear').addEventListener('click', () => {
    for (const e of effects.splice(0)) scene.remove(e.object);
    for (const p of projectiles.splice(0)) scene.remove(p.mesh);
});
addEventListener('keydown', (e) => { if (e.key === 'h' || e.key === 'H') document.getElementById('panel').classList.toggle('is-hidden'); });
if (params.has('nopanel')) { document.getElementById('panel').classList.add('is-hidden'); document.getElementById('hint').hidden = true; }

let demoAt = 0, demoIndex = 0, scenarioAt = .4;
const runActions = scenario ? new Function('fx', scenario.actions) : undefined;
function step(dt) {
    if (scenario && !params.has('paused') && (scenarioAt -= dt) <= 0) { runActions(window.__FX_REVIEW__); scenarioAt = scenario.period; }
    if (demo && (demoAt -= dt) <= 0) {
        const all = [...SHOTS.map((s) => () => fire(s)), () => blowUp(EXPLOSIONS[demoIndex % EXPLOSIONS.length])];
        all[demoIndex % all.length]();
        demoIndex++;
        demoAt = .7;
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        if ((p.delay -= dt) > 0) { p.mesh.visible = false; continue; }
        p.mesh.visible = true;
        p.travelled += p.speed * dt;
        p.mesh.position.addScaledVector(p.direction, p.speed * dt);
        if (p.shot.kind === 'laser' || p.shot.kind === 'gauss') fx.attenuate(p.mesh, camera.position);
        if (p.travelled >= p.length) { impact(p); scene.remove(p.mesh); projectiles.splice(i, 1); }
    }
    for (let i = effects.length - 1; i >= 0; i--) {
        const effect = effects[i];
        effect.life -= dt;
        stepTransientEffect(effect, dt, Math.max(0, Math.min(1, effect.life / effect.maxLife)));
        if (effect.life <= 0) { scene.remove(effect.object); effect.dispose?.(); effects.splice(i, 1); }
    }
}

let last = performance.now();
function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000) * timeScale;
    last = now;
    const w = innerWidth, h = innerHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    step(dt);
    placeCamera();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Probes drive the page deterministically through this hook.
window.__FX_REVIEW__ = { fire: (i) => fire(SHOTS[i]), blowUp: (i) => blowUp(EXPLOSIONS[i]), step, SHOTS, EXPLOSIONS, setSurface: (s) => { surface = s; }, orbit, effects, projectiles,
    setTimeScale: (value) => { timeScale = value; }, restart: () => { scenarioAt = 0; } };
