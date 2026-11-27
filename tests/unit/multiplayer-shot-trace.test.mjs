import assert from 'node:assert/strict';
import { test } from 'node:test';
import { traceMatchShot } from '../../src/game/multiplayer/shotTrace.js';

const actor = (id, z, team = 'red') => ({
    id, team, hull: 100, variant: 'kestrel',
    position: [0, 0, z], rotation: [0, 0, 0, 1],
});
const from = { x: 0, y: 0, z: 0 };
const to = { x: 0, y: 0, z: -100 };
const shooter = actor('shooter', 0);

test('a beam or projectile hits the nearest eligible hull behind its muzzle', () => {
    const ally = actor('ally', -20);
    const far = actor('far', -75, 'blue');
    const near = actor('near', -55, 'blue');
    const dead = { ...actor('dead', -14, 'blue'), hull: 0 };
    const actors = [shooter, far, near, dead, ally];
    const canHit = (owner, target) => owner.team !== target.team;

    assert.equal(traceMatchShot(from, to, shooter, actors, { canHit }).actor, near);
    assert.equal(traceMatchShot(from, to, shooter, actors, { canHit, skipId: near.id }).actor, far);
    assert.equal(traceMatchShot(from, to, shooter, actors).actor, ally);
});

test('terrain hides a ship when its surface is first on the firing line', () => {
    const target = actor('target', -60, 'blue');
    const cover = { t: .35, obstacle: { id: 'rock' } };
    assert.equal(traceMatchShot(from, to, shooter, [target], { terrainHit: () => cover }), cover);
    assert.equal(traceMatchShot(from, to, shooter, [target], { terrainHit: () => ({ t: .9 }) }).actor, target);
});
