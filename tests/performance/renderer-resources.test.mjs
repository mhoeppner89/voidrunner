import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === 'three'
        ? new URL('../../vendor/three.module.min.js', import.meta.url).href
        : specifier, context);
} });
const THREE = await import('three');
const { SpaceRenderer } = await import('../../src/game/render.js');

// Canvas drawing is irrelevant to ownership; keep actual Three textures,
// geometries, materials, cloning and disposal events in these regressions.
globalThis.document = { createElement: () => ({ getContext: () => ({
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {},
}) }) };
function renderer() {
    const r = Object.create(SpaceRenderer.prototype);
    r.pixelTextures = new Set();
    return r;
}
function watch(resource) {
    let calls = 0;
    resource.addEventListener('dispose', () => calls++);
    return () => calls;
}
const config = { scale: 1, enginePorts: [[0, 0, 0], [1, 0, 0]] };
function fieldRenderer() {
    const r = renderer();
    r.camera = new THREE.PerspectiveCamera(90, 1, .1, 1000);
    r.viewSphere = new THREE.Sphere();
    r.tmpPosition = new THREE.Vector3(); r.tmpScale = new THREE.Vector3();
    r.tmpEuler = new THREE.Euler(); r.tmpQuaternion = new THREE.Quaternion(); r.tmpMatrix = new THREE.Matrix4();
    return r;
}
function frustum(camera) {
    camera.updateMatrixWorld(true);
    return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
}
function piece(position, moving = false) {
    return { position, rotation: [0, 0, 0], scale: [1, 1, 1], moving };
}
function batch(pieces) {
    const geometry = new THREE.BoxGeometry(2, 2, 2); geometry.computeBoundingSphere();
    return { mesh: new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), pieces.length),
        pieces, renderedPieces: [], originRadius: geometry.boundingSphere.radius };
}

test('debris compaction preserves edge objects, restores visibility and refreshes moved pieces', () => {
    const r = fieldRenderer();
    const pieces = [piece([0, 0, -10]), piece([100, 0, 0]), piece([11, 0, -10]), piece([0, 0, 20], true)];
    const b = batch(pieces); r.graveyardBatches = [b];
    const original = JSON.stringify(pieces);
    r.updateGraveyardInstances(frustum(r.camera));
    assert.equal(b.mesh.count, 2); // center-outside third piece overlaps the screen edge
    assert.equal(JSON.stringify(pieces), original, 'rendering must not mutate simulation');
    const version = b.mesh.instanceMatrix.version;
    r.updateGraveyardInstances(frustum(r.camera));
    assert.equal(b.mesh.instanceMatrix.version, version, 'static matrices need no repeat upload');
    r.camera.lookAt(0, 0, 20); r.updateGraveyardInstances(frustum(r.camera));
    assert.equal(b.mesh.count, 1);
    assert.equal(b.renderedPieces[0], pieces[3]);
    pieces[3].position[2] = 21;
    r.updateGraveyardInstances(frustum(r.camera));
    const m = new THREE.Matrix4(); b.mesh.getMatrixAt(0, m); assert.equal(m.elements[14], 21);
    r.camera.position.set(0, 50000, 0); r.updateGraveyardInstances(frustum(r.camera));
    assert.equal(b.mesh.count, 0); assert.equal(b.mesh.visible, false);
    r.camera.position.set(0, 0, 0); r.camera.lookAt(0, 0, -10);
    r.updateGraveyardInstances(frustum(r.camera));
    assert.equal(b.mesh.count, 2); assert.equal(b.mesh.visible, true);
    b.mesh.getMatrixAt(0, m); assert.equal(m.elements[14], -10);
});

test('salvage batches draw and pick only the current hull and breach plate for each visible node', () => {
    const r = fieldRenderer();
    r.wreckNodes = [[0, 0, -20], [40, 0, -20], [80000, 0, -20]].map((position, index) => ({
        id: String(index), position, rotation: [0, 0, 0], shape: 2, salvage: 'scrap', radius: 2, remaining: 1,
    }));
    Object.assign(r, {
        wreckBatches: [], wreckRenderEntries: [], wreckNodeMeshes: new Map(), instanceRoots: new Map(),
        activeInstanceId: 'mourning-line', asteroidMeshes: [], shipMeshes: new Map(), locationMeshes: new Map(), pickupMeshes: new Map(),
        renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } },
        pointer: new THREE.Vector2(), raycaster: new THREE.Raycaster(),
        createPixelPanelTexture: () => new THREE.Texture(), simplifyAppleMaterial() {},
    });
    r.createWreckNodes();
    const intact = r.wreckBatches.find(batch => !batch.damaged);
    assert.equal(intact.mesh.count, 2);
    const [target, neighbor, distant] = r.wreckNodes;
    target.remaining = 0;
    for (let face = 0; face < 6; face++) {
        target.salvageImpactLocal = [0, 0, 0];
        target.salvageImpactLocal[face >> 1] = face % 2 === 0 ? 1 : -1;
        r.updateWreckNodeInstances(1 / 60);
        const damaged = r.wreckBatches.find(batch => batch.face === face);
        assert.equal(damaged.mesh.count, 1);
        assert.equal(damaged.plate.count, 1);
        assert.equal(r.wreckBatches.filter(batch => batch.mesh.visible).length, 2);
        assert.equal(intact.mesh.count, 1);
        assert.equal(intact.mesh.userData.nodeIndices[0], 1);
        for (const node of [target, neighbor]) {
            r.camera.lookAt(...node.position);
            r.camera.updateMatrixWorld();
            assert.deepEqual(r.pickTarget(50, 50), { kind: 'wreck', id: node.id });
        }
    }
    r.camera.position.x = 80000;
    r.selectedWreckId = target.id;
    r.updateWreckNodeInstances(0);
    assert.equal(intact.mesh.count, 1);
    assert.equal(intact.entries[0].node, distant);
    assert.equal(r.wreckBatches.find(batch => batch.face === 5).entries[0].node, target);
    const rotation = target.rotation.slice();
    r.selectedWreckId = undefined;
    r.updateWreckNodeInstances(1 / 60);
    assert.deepEqual(target.rotation, rotation);
    assert.equal(r.wreckBatches.filter(batch => batch.plate?.visible).length, 0);
});

test('compacted asteroids retain raycast identity and natural colors when selected or scanned', () => {
    const r = fieldRenderer();
    const nodes = [piece([0, 0, -10]), piece([100, 0, 0])];
    nodes.forEach((node, index) => Object.assign(node, { id: String(index), radius: 1 }));
    const b = batch(nodes);
    b.kind = 'iron'; b.entries = nodes.map((node, index) => ({ node, index })); b.renderedEntries = [];
    b.mesh.userData.nodeIndices = [0, 1]; r.asteroidMeshes = [b];
    r._asteroidPalettes = { iron: { base: 0x123456, scan: 0xabcdef } };
    const ray = new THREE.Raycaster();
    for (const index of [0, 1, 0]) {
        r.camera.lookAt(...nodes[index].position);
        r.selectedAsteroidId = String(index);
        r.updateAsteroidInstances(frustum(r.camera));
        assert.equal(b.mesh.count, 1);
        b.mesh.updateMatrixWorld(true);
        ray.setFromCamera(new THREE.Vector2(), r.camera);
        const hit = ray.intersectObject(b.mesh)[0];
        assert.ok(hit, 'tap ray still hits the visible asteroid');
        assert.equal(b.mesh.userData.nodeIndices[hit.instanceId], index);
        const color = new THREE.Color(); b.mesh.getColorAt(0, color);
        assert.equal(color.getHex(), 0x123456);
        const version = b.mesh.instanceColor.version;
        nodes[index].scanned = true;
        r.selectedAsteroidId = undefined;
        r.updateAsteroidInstances(frustum(r.camera));
        b.mesh.getColorAt(0, color);
        assert.equal(color.getHex(), 0x123456);
        assert.equal(b.mesh.instanceColor.version, version, 'selection and scanning need no color upload');
    }
});
test('cached shadow frames cull rocks but a shadow refresh includes off-camera casters', () => {
    const r = fieldRenderer(), nodes = [piece([0, 0, -10]), piece([0, 0, 20])];
    const b = batch(nodes);
    b.kind = 'iron'; b.entries = nodes.map((node, index) => ({ node: {...node, radius: 1}, index }));
    b.renderedEntries = []; b.mesh.userData.nodeIndices = [];
    Object.assign(r, { asteroidMeshes: [b], _asteroidPalettes: {iron: {base: 0xffffff}},
        isIOS: true, atmosphereShells: [], viewProjection: new THREE.Matrix4(), viewFrustum: new THREE.Frustum(),
        instanceRoots: new Map([['shardbelt', { visible: true }]]), sunLight: { shadow: {} },
        renderer: {shadowMap: {enabled: true, autoUpdate: false, needsUpdate: false}},
        renderPixelScene() {}, skyTime: 5, asteroidShadowRefreshAt: 5.25 });
    r.render();
    assert.equal(b.mesh.count, 1);
    r.skyTime = 5.25; r.render();
    assert.equal(r.sunLight.shadow.needsUpdate, true);
    assert.equal(b.mesh.count, 2, 'the rock behind the camera can still cast a shadow');
    r.renderer.shadowMap.needsUpdate = false; // the driver has consumed the new shadow map
    r.camera.lookAt(0, 0, 20); r.skyTime += .04; r.render();
    assert.equal(b.mesh.count, 1); assert.equal(b.mesh.userData.nodeIndices[0], 1);
});

test('rotated off-center long rocks keep their visible tips when the origin is outside the view', () => {
    const r = fieldRenderer(), geometry = new THREE.BoxGeometry(12, 2, 3).translate(5, 0, 0);
    geometry.computeBoundingSphere();
    const node = {...piece([35, 0, -13]), scale: [5, 1.7, .8], radius: 1, moving: true};
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 1);
    mesh.userData.nodeIndices = [];
    r.asteroidMeshes = [{mesh, entries: [{node, index: 17}], renderedEntries: [], kind: 'iron',
        originRadius: geometry.boundingSphere.center.length() + geometry.boundingSphere.radius}];
    r._asteroidPalettes = {iron: {base: 0xffffff}};
    const view = frustum(r.camera), position = new THREE.Vector3().fromArray(node.position);
    assert.equal(view.containsPoint(position), false);
    let visiblePoses = 0;
    for (let angle = 0; angle < 24; angle++) {
        node.rotation = [.3, angle * Math.PI / 12, .1];
        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...node.rotation));
        const expected = new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(...node.scale));
        r.updateAsteroidInstances(view);
        const observed = new THREE.Matrix4(); mesh.getMatrixAt(0, observed);
        let visible = false;
        for (let i = 0; i < geometry.attributes.position.count; i++) {
            const local = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, i);
            const world = local.clone().applyMatrix4(expected);
            if (!view.containsPoint(world)) continue;
            visible = true;
            assert.equal(mesh.count, 1); assert.equal(mesh.userData.nodeIndices[0], 17);
            assert.ok(world.distanceTo(local.applyMatrix4(observed)) < .00001);
        }
        if (visible) visiblePoses++;
    }
    assert.ok(visiblePoses > 2 && visiblePoses < 24);
});

function model() {
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: new THREE.Texture() })));
    return source;
}

test('trail-free ships reuse glow textures and preserve cached hulls', () => {
    const r = renderer(), source = model();
    const hull = source.children[0];
    const hullGeometry = watch(hull.geometry), hullTexture = watch(hull.material.map), hullMaterial = watch(hull.material);
    for (let i = 0; i < 30; i++) {
        const ship = r.createGlbShipMesh({ id: String(i), role: 'pirate', hostile: true }, source, config, 'talon');
        const flare = ship.userData.engineFlares[0].material.map;
        const flareDisposed = watch(flare);
        assert.equal(ship.children[0].children.filter(child => child.isMesh).length, 1, 'only the hull mesh remains');
        const tintDisposed = watch(ship.children[0].children[0].material);
        r.disposeGlbShip(ship);
        assert.equal(flareDisposed(), 0, 'shared glow stays alive for the next ship');
        assert.equal(r.radialTextureCache.size, 1, 'identical ship glows use one bitmap');
        assert.equal(tintDisposed(), 1);
    }
    assert.equal(hullGeometry(), 0);
    assert.equal(hullTexture(), 0);
    assert.equal(hullMaterial(), 0);
    assert.equal(r.pixelTextures.size, 0, 'no exhaust texture is allocated');
});

test('retiring healthy or damaged turrets preserves the hull textures they borrow', async () => {
    const {createTurretModel, paintFrigateTurret} = await import('../../src/game/turretModels.js');
    const {setFrigateComponentDamage} = await import('../../src/game/frigateComponents.js');
    const r = renderer();
    const hull = new THREE.MeshStandardMaterial({
        map: new THREE.Texture(), normalMap: new THREE.Texture(),
        roughnessMap: new THREE.Texture(), metalnessMap: new THREE.Texture(),
    });
    const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap'];
    const disposed = maps.map(slot => watch(hull[slot]));
    const neighbor = createTurretModel('laser', 'M');
    paintFrigateTurret(neighbor, hull);
    for (const health of [100, 0]) {
        const turret = createTurretModel('laser', 'M');
        paintFrigateTurret(turret, hull);
        setFrigateComponentDamage(turret, health, 100);
        const privateMaterials = new Set();
        turret.traverse(o => {
            if (o.isMesh && !o.material.userData.shared) privateMaterials.add(o.material);
        });
        const privateDisposals = [...privateMaterials].map(watch);
        r.disposeObject(turret);
        assert.ok(disposed.every(read => read() === 0), 'live hull maps must stay resident');
        assert.ok(privateDisposals.every(read => read() === 1), 'private damage materials are released');
        neighbor.traverse(o => {
            if (o.isMesh) for (const slot of maps) assert.equal(o.material[slot], hull[slot]);
        });
    }
    r.disposeObject(neighbor);
    assert.ok(disposed.every(read => read() === 0));
    // The cached hull remains the owner and releases its maps at shutdown.
    r.disposeObject(new THREE.Mesh(new THREE.BoxGeometry(), hull));
    assert.ok(disposed.every(read => read() === 1));
});

test('a freshly refreshed turret survives accumulated simulation time before rendering', () => {
    const r = renderer();
    Object.assign(r, {
        scene: new THREE.Scene(), skyTime: 10, instanceRoots: new Map(),
        locationMeshes: new Map(), jumpPointVisuals: [], effects: [],
        updatePdcTracers() {}, updateRailPlumes() {}, updateHyperdriveFx() {},
    });
    const show = () => r.showTurret('npc-0', new THREE.Vector3(), new THREE.Vector3(0,0,-1), 'S');
    show();
    const turret = r.turretMeshes.get('npc-0');
    // Three catch-up steps have run since the previous draw. The mount was
    // refreshed on the last step, so none of that earlier time should age it.
    r.pendingWorldVisualDt = .3;
    r.updateWorldVisuals();
    assert.equal(r.turretMeshes.get('npc-0'), turret);
    r.skyTime = 10.2; show();
    r.pendingWorldVisualDt = .2; r.updateWorldVisuals();
    assert.equal(r.turretMeshes.get('npc-0'), turret);
    r.skyTime = 10.46;
    r.pendingWorldVisualDt = .26; r.updateWorldVisuals();
    assert.equal(r.turretMeshes.has('npc-0'), false, 'unrefreshed mounts still retire');
});

test('renderer shutdown releases postprocessing and cached resources', () => {
    const r = renderer();
    globalThis.window = { removeEventListener() {} };
    r.scene = new THREE.Scene();
    r.scene.environment = new THREE.Texture();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    r.scene.add(sprite);
    r.shipMeshes = new Map();
    r.glbShipModels = new Map([['talon', model()]]);
    r.glbShipLoading = new Map();
    r.stationColliders = new Map([['helix',{}]]);
    r.stationDockObstacles = new Map([['helix',[]]]);
    r.dynamicRoot = new THREE.Group();
    r.screenTextures = [];
    r.bloomSceneTarget = new THREE.WebGLRenderTarget(2, 2);
    r.pixelSceneTarget = new THREE.WebGLRenderTarget(2,2);
    r.pixelResolveMaterial = new THREE.ShaderMaterial();
    r.pixelQuad = new THREE.Mesh(new THREE.PlaneGeometry(),r.pixelResolveMaterial);
    r.sunLight=new THREE.DirectionalLight();r.sunLight.shadow.map=new THREE.WebGLRenderTarget(2,2);
    r.bloomBlurTargets = [new THREE.WebGLRenderTarget(2, 2), new THREE.WebGLRenderTarget(2, 2)];
    r.bloomBrightMaterial = new THREE.ShaderMaterial();
    r.bloomBlurMaterial = new THREE.ShaderMaterial();
    r.bloomCompositeMaterial = new THREE.ShaderMaterial();
    r.bloomQuad = new THREE.Mesh(new THREE.PlaneGeometry(), r.bloomCompositeMaterial);
    r.renderer = { domElement: { removeEventListener() {}, remove() {} }, dispose() {} };
    const glow = r.radialTexture('#ffffff', '#123456');
    const resources = [sprite.geometry, sprite.material, glow, r.scene.environment, r.sunLight.shadow.map, r.bloomSceneTarget, ...r.bloomBlurTargets,
        r.bloomBrightMaterial, r.bloomBlurMaterial, r.bloomCompositeMaterial, r.bloomQuad.geometry,
        r.pixelSceneTarget,r.pixelResolveMaterial,r.pixelQuad.geometry,
        r.glbShipModels.get('talon').children[0].geometry];
    const counts = resources.map(watch);
    r.dispose();
    assert.deepEqual(counts.map(count => count()), resources.map(() => 1));
    assert.equal(r.radialTextureCache.size, 0);
    assert.equal(r.stationColliders.size, 0);
    assert.equal(r.stationDockObstacles.size, 0);
});

test('shared source materials are tinted once per ship and released once', () => {
    const r = renderer(), source = model();
    source.add(new THREE.Mesh(source.children[0].geometry, source.children[0].material));
    const a = r.createGlbShipMesh({ id: 'a', role: 'pirate', hostile: true }, source, config, 'talon');
    const b = r.createGlbShipMesh({ id: 'b', role: 'trader', faction: 'concord' }, source, config, 'talon');
    const material = a.children[0].children[0].material;
    assert.equal(material, a.children[0].children[1].material);
    assert.notEqual(material, source.children[0].material, 'source palette stays untouched');
    assert.notEqual(material, b.children[0].children[0].material, 'different ships keep independent palettes');
    assert.equal(a.userData.emissiveMaterials.length, 1);
    const disposed = watch(material); r.disposeGlbShip(a); assert.equal(disposed(), 1);
    r.disposeGlbShip(b);
});
test('glow cache has bounded retention; overflow textures remain individually owned', () => {
    const r = renderer();
    for (let i = 0; i < 70; i++) {
        const texture = r.radialTexture('#ffffff', `#${i.toString(16).padStart(6, '0')}`);
        assert.equal(Boolean(texture.userData.shared), i < 64);
        if (i >= 64) {
            const disposed = watch(texture);
            r.disposeObject(new THREE.Sprite(new THREE.SpriteMaterial({ map: texture })));
            assert.equal(disposed(), 1);
        }
    }
    assert.equal(r.radialTextureCache.size, 64);
});

test('racing hulls skip unused fracture preparation while combat ships retain it',()=>{
 const r=renderer(),source=model(),scheduled=[];r.wreckFactory={schedule:ship=>scheduled.push(ship)};
 const racer=r.createGlbShipMesh({id:'race',role:'racer',race:{},faction:'independents'},source,config,'talon');
 assert.equal(scheduled.length,0);assert.ok(racer.userData.glb);
 const combat=r.createGlbShipMesh({id:'combat',role:'pirate',hostile:true},source,config,'talon');
 assert.deepEqual(scheduled,[combat]);r.disposeGlbShip(racer);r.disposeGlbShip(combat);
});

test('mining delivery cycles retain hidden drone buffers and shader references until the unit is removed',()=>{
 const r=renderer();r.droneVisuals={};r.droneSyncRevision=0;r.dynamicRoot=new THREE.Group();r.camera=new THREE.PerspectiveCamera();r.dronePrevPosition=new THREE.Vector3();r.dronePrevRotation=new THREE.Quaternion();
 let created=0,disposed=0;r.createDroneVisual=unit=>{created++;const root=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());body.geometry.addEventListener('dispose',()=>disposed++);root.add(body);r.dynamicRoot.add(root);return{root,beam:new THREE.Group(),engine:new THREE.Group(),lamp:new THREE.Mesh(),type:unit.type,glow:.2};};
 r.updateMiningDebris=r.updateRepairSparks=()=>{};
 const unit={id:'miner',type:'mining',hull:10,state:'mining',position:[0,0,-50],rotation:[0,0,0,1]},fleet={unitsById:{miner:unit}},player={shipId:'wayfarer',outfitting:{loadouts:{wayfarer:{droneBays:[{unitIds:['miner']}]}}}};
 r.syncDrones(fleet,undefined,1,player);const visual=r.droneVisuals.miner;
 for(let i=0;i<30;i++){
  unit.state='stowed';r.syncDrones(fleet,undefined,1,player);assert.equal(r.droneVisuals.miner,visual);assert.equal(visual.root.visible,false);
  unit.state='mining';r.syncDrones(fleet,undefined,1,player);assert.equal(r.droneVisuals.miner,visual);assert.equal(visual.root.visible,true);
 }
 assert.equal(created,1);assert.equal(disposed,0);
 unit.state='stowed';player.outfitting.loadouts.wayfarer.droneBays[0].unitIds=[];r.syncDrones(fleet,undefined,1,player);assert.equal(disposed,1);assert.equal(r.droneVisuals.miner,undefined,'uninstalled stock must not retain GPU resources');
});

test('environment shader preparation restores hidden regions and shadow settings',async()=>{
 const r=renderer(),region=new THREE.Group(),scene=new THREE.Scene(),originalTarget={};region.visible=false;scene.add(region);const calls=[];let target=originalTarget;
 Object.assign(r,{scene,camera:new THREE.PerspectiveCamera(),instanceRoots:new Map([['shardbelt',region]]),sunLight:{castShadow:false},isIOS:false,bloomSceneTarget:{},bloomEnabled:()=>true,prepareCombatWarmup:()=>new THREE.Group(),renderer:{shadowMap:{enabled:false,type:THREE.PCFShadowMap},getRenderTarget:()=>target,setRenderTarget:t=>{target=t;},compileAsync:async()=>{calls.push({region:region.visible,shadow:r.renderer.shadowMap.enabled,type:r.renderer.shadowMap.type});}}});
 await r.prepareActiveScene();assert.equal(calls.length,4);assert.ok(calls.every(c=>c.region));assert.ok(calls.some(c=>c.shadow&&c.type===THREE.PCFSoftShadowMap));
 assert.equal(region.visible,false);assert.equal(r.renderer.shadowMap.enabled,false);assert.equal(r.renderer.shadowMap.type,THREE.PCFShadowMap);assert.equal(r.sunLight.castShadow,false);assert.equal(target,originalTarget);
});
