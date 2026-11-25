import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../../vendor/three.module.min.js';
import {buildGlbScene} from '../../src/game/glbLoader.js';
import {ShipWreckFactory} from '../../src/game/shipWreckFx.js';
import {SpaceRenderer, GLB_SHIP_CONFIG} from '../../src/game/render.js';
import {damageCapitalMount, segmentCapitalMountHit, updateCorvetteWeapons} from '../../src/game/capitalCombat.js';
import {CAPITAL_HULLS} from '../../src/game/capitalHulls.js';
import {shipVsObstacle, SHIP_COLLIDERS} from '../../src/game/shipCollision.js';
import {seededRandom} from '../../src/game/random.js';
import {t} from '../../src/game/i18n.js';
import {fixture} from '../helpers/session.mjs';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {fieldWorld} from '../helpers/field-world.mjs';

globalThis.createImageBitmap = async () => ({width:1, height:1, close(){}});
async function load(path) {
    const file = await readFile(path);
    return buildGlbScene(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
}

test('detached pods retain the warmed wreck geometry', async () => {
    const ship = fixture().spawnCorvette('drover', [0,0,0]);
    const renderer = Object.create(SpaceRenderer.prototype);
    const root = new THREE.Group();
    const config = GLB_SHIP_CONFIG.drover;
    root.userData.glb = true;
    root.add(renderer.prepareGlbShip(await load(config.path), config, 'drover'));
    const factory = new ShipWreckFactory();
    factory.prepare(root);
    const intact = factory.create(root, ship);
    const pieceCount = wreck => wreck.sections.reduce((sum, part) => sum + part.group.children.length, 0);
    const pod = root.getObjectByName('pod_0');
    let podMeshes = 0;
    pod.traverseVisible(child => { if (child.isMesh) podMeshes++; });
    pod.visible = false;
    const damaged = factory.create(root, ship);
    assert.equal(factory.cache.size, 1, 'missing pods must reuse the warm fracture');
    assert.ok(podMeshes > 0);
    assert.equal(pieceCount(damaged), pieceCount(intact) - podMeshes);
    damaged.dispose();
    intact.dispose();
    factory.dispose();
});

test('both broadside barrels receive projectile hits across traverse and elevation', async () => {
    const session = fixture(), ship = session.spawnCorvette('ironjaw', [0,0,0]);
    ship.rotation = [0,0,0,1];
    const renderer = Object.create(SpaceRenderer.prototype);
    Object.assign(renderer, {
        scene:new THREE.Scene(), turretMeshes:new Map(), shipMeshes:new Map(),
        broadsideModel:await load(GLB_SHIP_CONFIG.ironjaw.broadsidePath),
    });
    session.renderer.showTurret = (...args) => { if (args[4] === 'broadside') renderer.showTurret(...args); };
    updateCorvetteWeapons(session, ship, 1/60);
    const up = new THREE.Vector3(0,1,0);
    for (const mount of CAPITAL_HULLS.ironjaw.mounts.filter(m => m.kind === 'broadside')) {
        const id = ship.id + '-main-' + mount.index;
        const gun = renderer.turretMeshes.get(id);
        const seat = new THREE.Vector3(...mount.localPosition);
        const pivot = seat.clone().addScaledVector(up, 1.37);
        for (const [yaw,pitch] of [[0,0],[.55,.38],[-.31,-.22]]) {
            const forward = new THREE.Vector3(mount.bearing*Math.cos(yaw)*Math.cos(pitch), Math.sin(pitch), Math.sin(yaw)*Math.cos(pitch));
            ship.capitalRuntime.mounts[mount.index].direction.copy(forward);
            renderer.showTurret(id,seat,forward,'S','broadside',new THREE.Quaternion(),1,0,1,1,ship,mount.index);
            gun.updateWorldMatrix(true, true);
            // Even shallow grazing shots must find the muzzle rim and the
            // raised ribs. Check the exported vertices beyond the housing.
            gun.userData.pitch.traverse(child => {
                if (!child.isMesh) return;
                const vertices = child.geometry.attributes.position;
                for (let i=0; i<vertices.count; i++) {
                    const point = new THREE.Vector3().fromBufferAttribute(vertices,i);
                    if (point.z > -2) continue;
                    child.localToWorld(point);
                    const end = point.clone().addScaledVector(up,.001);
                    assert.notEqual(segmentCapitalMountHit(point,end,ship),undefined, 'barrel rim lies outside its mount collider');
                }
            });
            const tip = pivot.clone().addScaledVector(forward, 4.9);
            const right = new THREE.Vector3().crossVectors(forward, up).normalize();
            for (const side of [-1,1]) {
                const origin = tip.clone().addScaledVector(right, side*.66).addScaledVector(up, 10);
                const end = origin.clone().addScaledVector(up, -20);
                const ray = new THREE.Raycaster(origin, new THREE.Vector3(0,-1,0), 0, 20);
                assert.ok(ray.intersectObject(gun, true).length, 'probe must cross the rendered barrel');
                const fraction = segmentCapitalMountHit(origin, end, ship);
                assert.notEqual(fraction, undefined, 'projectile must cross a physical barrel');
                assert.equal(damageCapitalMount(ship, origin.lerp(end, fraction).toArray(), 1), mount.index);
            }
        }
    }
});

test('surrendered Drover displays boarding instructions', () => {
    const {session,save} = tutorialFixture();
    save.player.dockedAt = undefined;
    save.player.position = [0,0,1000];
    const ship = session.spawnCorvette('drover', [0,0,0]);
    ship.shield = 0;
    ship.rotation = [0,0,0,1];
    ship.identifiedByPlayer = ship.scanned = true;
    session.hyperdriveInterceptIds = new Set();
    session.chatterOpen = () => false;
    for (const engine of CAPITAL_HULLS.drover.engines) session.damageShip(ship, engine.hull, 'environment', engine.hitCenter);
    save.player.currentTargetId = ship.id;
    session.renderer.projectTargetToScreen = () => ({visible:false, x:0, y:0});
    session.targetEdge = () => undefined;
    session.getTargetRef = () => ({kind:'ship', id:ship.id, position:ship.position});
    const {target} = session.buildHudModel();
    assert.equal(target.boardable, true);
    assert.equal(target.readout, t('SURRENDERED · CLOSE IN TO BOARD'));
});

test('Shardbelt raid gunboat clears the field and arrives in sight', () => {
    const session = fieldWorld(718);
    session.stageArenaSite('shardbelt-heart');
    session.arena = undefined;
    session.entityCounter = 526;
    session.ships = [];
    const rng = seededRandom('review-field-263'), region = {danger:.8};
    const point = session.encounterPosition(rng, 800);
    const lead = session.spawnCareerRaider('pirate', point, region, rng);
    const ship = session.addRaidCorvette(lead, [], region, () => 0);
    assert.ok(ship);
    const eye = new THREE.Vector3(...session.save.player.position), position = new THREE.Vector3(...ship.position);
    const rotation = new THREE.Quaternion(...ship.rotation), reach = SHIP_COLLIDERS.ironjaw.contactRadius*2;
    const contact = {normal:new THREE.Vector3()};
    for (const obstacle of session.activeFieldObstacles(session.activeInstanceId)) {
        if (position.distanceTo(new THREE.Vector3(obstacle.x,obstacle.y,obstacle.z)) > obstacle.collisionRadius + reach) continue;
        assert.ok(!shipVsObstacle(position, rotation, 'ironjaw', 2, obstacle, contact), 'gunboat overlaps '+obstacle.id);
    }
    assert.equal(session.lineBlocked(eye, position), false);
});
