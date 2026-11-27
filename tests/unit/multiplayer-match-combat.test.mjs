import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHIPS } from '../../src/game/data.js';
import { createOutfittingState } from '../../src/game/outfitting.js';
import { SHIP_MOUNT_ANCHORS } from '../../src/game/shipMounts.js';
import { TRACKING_LASER, WEAPONS, LAUNCHERS } from '../../src/game/weapons.js';
import { createPilotFitting } from '../../src/game/multiplayer/pilotFitting.js';
import { createMatchCombat, initPilotCombat, stepMatchCombat } from '../../src/game/multiplayer/matchCombat.js';

const dt = 1 / 60;
function pilot(id, position, { shipId = 'wayfarer', gun, rack, turret, yaw = 0, scale = 1, team = id } = {}) {
    const outfit = createOutfittingState([shipId]);
    const fit = outfit.loadouts[shipId];
    if (gun) { fit.guns.fill(null); fit.guns[0] = gun; }
    if (rack) fit.launchers[0] = rack;
    if (turret) fit.turrets[0] = turret;
    const { player, stats } = createPilotFitting(shipId, outfit);
    return initPilotCombat({ ...player, id, position, rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
        velocity: [0, 0, 0], stats, variant: SHIPS[shipId].variant, scale, team });
}
function match(actors, options) {
    const combat = createMatchCombat(options);
    let tick = 0;
    return { combat, step(input = {}) {
        return stepMatchCombat(combat, actors, new Map(Object.entries(input)), ++tick * dt, dt);
    } };
}
function wall(z) {
    return (a, b) => {
        if (a.z === b.z) return;
        const t = (z - a.z) / (b.z - a.z);
        if (t >= 0 && t <= 1) return { t };
    };
}

test('stock Wayfarer beams fire from both scaled mounts and spend capacitor at fitted cadence', () => {
    const shooter = pilot('a', [0, 0, 0], { scale: 2 }), target = pilot('b', [0, 0, -100]);
    const arena = match([shooter, target]);
    const fire = { a: { targetId: 'b', fire: true } };
    const events = arena.step(fire);
    const beams = events.filter(e => e.type === 'beam');
    assert.deepEqual(beams.map(e => e.position), SHIP_MOUNT_ANCHORS.wayfarer.guns.map(v => v.map(n => n * 2)));
    assert.ok(beams.every(e => e.end[2] < -90 && e.end[2] > -110));
    assert.equal(events.filter(e => e.type === 'hit').length, 2);
    assert.ok(Math.abs(target.shield - (target.stats.shield - 2 * WEAPONS.beam.damageFlat)) < 1e-8);
    assert.equal(shooter.energy, shooter.stats.energyCapacity - 2 * WEAPONS.beam.energyCost);
    assert.equal(arena.step(fire).filter(e => e.type === 'beam').length, 0);
    for (let i = 0; i < 30; i++) arena.step();
    shooter.energy = 0;
    assert.equal(arena.step(fire).filter(e => e.type === 'beam').length, 0);
});

test('simultaneous lethal beams credit both pilots once', () => {
    const a = pilot('a', [0, 0, 0]), b = pilot('b', [0, 0, -110], { yaw: Math.PI });
    for (const pilot of [a, b]) { pilot.shield = 0; pilot.hull = 1; pilot.shieldDelay = 2; }
    const events = match([a, b]).step({ a: { fire: true, targetId: 'b' }, b: { fire: true, targetId: 'a' } });
    assert.deepEqual(events.filter(e => e.killed).map(e => [e.ownerId, e.targetId]), [['a', 'b'], ['b', 'a']]);
});

test('cover, target validation and the host aim setting apply to both sides', () => {
    const a = pilot('a', [0, 0, 0]), friend = pilot('b', [0, 0, -35], { team: 'a' }), enemy = pilot('c', [15, 0, -140]);
    const arena = match([a, friend, enemy], { canHit: (a, b) => a.team !== b.team, terrainHit: wall(-80) });
    const events = arena.step({ a: { fire: true, targetId: 'c' } });
    assert.ok(events.some(e => e.type === 'beam' && e.end[2] === -80));
    assert.equal(events.some(e => e.type === 'hit'), false);
    arena.step({ a: { targetId: 'b' } });
    assert.equal(a.targetId, null);
    const freeShot = (aimAssist, preference) => {
        const a = pilot('a', [0, 0, 0]), b = pilot('b', [14, 0, -140]);
        return match([a, b], { aimAssist }).step({ a: { fire: true, targetId: 'b', aimAssist: preference } }).some(e => e.type === 'hit');
    };
    assert.equal(freeShot(true), true);
    assert.equal(freeShot(false), false);
    assert.equal(freeShot(true, false), false);
});

test('pellets have reproducible two-axis spread, inherit velocity and expire at fitted range', () => {
    const run = () => {
        const shooter = pilot('a', [0, 0, 0], { gun: 'ripper' });
        shooter.velocity = [25, 40, 60];
        const arena = match([shooter], { seed: 345 });
        const events = arena.step({ a: { fire: true } });
        assert.equal(events.filter(e => e.type === 'shot').length, 1);
        const velocities = arena.combat.projectiles.map(p => p.velocity.slice());
        const speed = WEAPONS.ripper.speed;
        for (const [x, y, z] of velocities) assert.ok(Math.abs(Math.hypot(x - 25, y - 40, z - 60) - speed) < 1e-6);
        for (let i = 0; i < 43; i++) arena.step();
        assert.equal(arena.combat.projectiles.length, 0);
        return velocities;
    };
    const v = run();
    assert.equal(v.length, WEAPONS.ripper.pellets);
    assert.equal(new Set(v.map(v => v[0])).size, v.length);
    assert.deepEqual(v, run());
});

test('physical plasma bursts damage nearby exposed enemies and respect shielded terrain and teams', () => {
    const a = pilot('a', [0, 0, 0], { gun: 'mortar' });
    const b = pilot('b', [0, 0, -65]), c = pilot('c', [10, 0, -63]), d = pilot('d', [-10, 0, -63], { team: 'a' });
    const run = terrainHit => {
        const arena = match([a, b, c, d], { terrainHit, canHit: (a, b) => a.team !== b.team });
        const out = [];
        for (let i = 0; i < 20; i++) out.push(...arena.step({ a: { targetId: 'b', fire: i === 0 } }));
        return out.filter(e => e.type === 'hit');
    };
    const events = run();
    assert.equal(events.filter(e => e.targetId === 'b').length, 1);
    assert.equal(events.find(e => e.targetId === 'b').splash, false);
    assert.ok(events.find(e => e.targetId === 'c').shield < WEAPONS.mortar.splashDamage);
    assert.equal(events.some(e => e.targetId === 'd'), false);
    initPilotCombat(a);
    const blocked = run((from, to) => from.x < 4 && to.x > 4 ? { t: (4 - from.x) / (to.x - from.x) } : undefined);
    assert.equal(blocked.some(e => e.targetId === 'c'), false);
});

test('a loaded rack needs a visible target, correct aspect, sufficient energy and one launch edge', () => {
    const a = pilot('a', [0, 0, 0], { rack: 'swarm-launcher' }), b = pilot('b', [0, 0, -400]);
    let blocked = true;
    const arena = match([a, b], { terrainHit: (from, to) => blocked ? wall(-200)(from, to) : undefined });
    const loaded = a.missiles;
    for (let i = 0; i < 120; i++) arena.step({ a: { targetId: 'b', missile: true } });
    assert.equal(a.lockProgress, 0);
    assert.equal(a.missiles, loaded);
    blocked = false;
    for (let i = 0; i < 60; i++) arena.step();
    assert.equal(a.lockProgress, 1);
    a.energy = 0;
    assert.equal(arena.step({ a: { missile: true } }).some(e => e.kind === 'missile'), false);
    a.energy = a.stats.energyCapacity;
    const events = arena.step({ a: { missile: true } });
    const salvo = arena.combat.projectiles;
    assert.equal(events.filter(e => e.kind === 'missile').length, 1);
    assert.equal(salvo.length, LAUNCHERS.swarm.volley);
    assert.equal(new Set(salvo.map(p => p.salvo)).size, 1);
    assert.equal(a.launcherMagazines[a.activeLauncherMountId].rounds, loaded - 1);
    assert.equal(a.missiles, loaded - 1);
    assert.equal(arena.step({ a: { missile: true } }).some(e => e.type === 'shot'), false);
    let hits = 0;
    for (let i = 0; i < 150; i++) hits += arena.step().filter(e => e.type === 'hit' && e.weaponId === 'swarm').length;
    assert.equal(hits, 4);
    assert.equal(a.missiles, loaded - 1);
    b.position = [0, 0, 400];
    arena.step();
    assert.equal(a.lockProgress, 0);
});

test('turrets acquire selected hostiles and fire without the pilot holding the trigger', () => {
    for (const turret of ['tracking-turret', 'pdc']) {
        const a = pilot('a', [0, 0, 0], { turret }), b = pilot('b', [0, -35, -60]);
        const arena = match([a, b]);
        const log = [];
        for (let i = 0; i < 180; i++) log.push(...arena.step({ a: { targetId: b.id } }));
        const shots = log.filter(e => e.type === (turret === 'pdc' ? 'shot' : 'beam'));
        assert.ok(shots.length >= 2, turret);
        assert.ok(shots.every(e => e.mountId.includes('turret') && e.ownerId === a.id));
        const hits = log.filter(e => e.type === 'hit');
        assert.ok(hits.some(e => e.targetId === b.id), turret);
        if (turret === 'tracking-turret') assert.ok(hits.every(e => e.shield === TRACKING_LASER.damageFlat));
    }
});

test('point defense intercepts an incoming seeker while the pilot has no selected target', () => {
    const a = pilot('a', [0, 0, 0]), b = pilot('b', [0, 0, -250], { turret: 'pdc' });
    // Present the Wayfarer's ventral PDC mount to the approaching missile.
    b.rotation = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
    const arena = match([a, b]), events = [];
    for (let i = 0; i < 240; i++)
        events.push(...arena.step({ a: { targetId: b.id, missile: i === 120 } }));
    assert.ok(events.some(e => e.type === 'impact' && e.weaponId === 'pdc' && e.targetId === 'p-1'));
    assert.equal(b.shield, b.stats.shield);
    assert.equal(arena.combat.projectiles.length, 0);
});

test('pilots can shoot down a hostile torpedo after breaking its casing shield', () => {
    const a = pilot('a', [0, 0, 0], { rack: 'torpedo-launcher' });
    const b = pilot('b', [0, 0, -300], { gun: 'pulse-cannon', yaw: Math.PI });
    const arena = match([a, b]), events = [];
    b.velocity[0] = 80;
    for (let i = 0; i < 210; i++) arena.step({ a: { targetId: b.id, missile: true } });
    assert.equal(a.lockProgress, 0);
    assert.equal(a.missiles, LAUNCHERS.torpedo.capacity);
    b.velocity[0] = 0;
    for (let i = 0; i < 180; i++) arena.step();
    arena.step({ a: { missile: true } });
    for (let i = 0; i < 220; i++)
        events.push(...arena.step({ b: { fire: true } }));
    assert.equal(events.filter(e => e.type === 'impact' && e.targetId === 'p-1').length, 2);
    assert.equal(events.some(e => e.type === 'hit' && e.weaponId === 'torpedo'), false);
});
