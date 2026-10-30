import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {LOCATIONS} from '../../src/game/data.js';
import {SpaceRenderer} from '../../src/game/render.js';

test('both approaches cross the visible opening and reject the surrounding frame',()=>{
    const gate=LOCATIONS['verge-meridian-point'];
    const normal=new THREE.Vector3(...gate.position).normalize();
    const tangent=new THREE.Vector3().crossVectors(normal,new THREE.Vector3(0,1,0)).normalize();
    for(const side of [-1,1])for(const [radial,expected] of [[0,true],[0.50,true],[0.53,false]]){
        const {session,save}=tutorialFixture('complete');save.player.systemId=gate.systemId;
        session.armedJumpPointId=gate.id;session.setHyperdriveStatus=()=>{};
        const base=new THREE.Vector3(...gate.position).addScaledVector(tangent,gate.radius*radial);
        save.player.prevPosition=base.clone().addScaledVector(normal,side*10).toArray();
        const after=base.clone().addScaledVector(normal,-side*10);
        session.beginGalaxyGateTransition=point=>point===gate;
        assert.equal(session.checkArmedGalaxyGateCrossing(after),expected,`side=${side}, radius=${radial}`);
    }
});

test('a newly created gate starts with a faint aperture and faces its gameplay crossing axis',()=>{
    const renderer=Object.create(SpaceRenderer.prototype);
    renderer.jumpPointVisuals=[];renderer.radialTexture=()=>new THREE.Texture();
    const gate=LOCATIONS['verge-meridian-point'];
    const root=renderer.createJumpPointVisual(gate.id,gate,new THREE.Color(gate.accent),new THREE.Color(gate.secondary),()=>0.5);
    const visual=renderer.jumpPointVisuals[0];
    assert.ok(root.getObjectByName('jump-gate-structure'));
    assert.ok(visual.portal.material.opacity<0.04);
    assert.ok(visual.portalGlow.material.opacity<0.15);
    const forward=new THREE.Vector3(0,0,1).applyQuaternion(root.quaternion);
    assert.ok(forward.distanceTo(new THREE.Vector3(...gate.position).normalize())<1e-9);
});
