import * as THREE from 'three';
import { LOCATIONS, SUN_POSITION, sunPositionForSystem } from './data.js';
import { createVoxelShipModel, createVoxelStationModel, paletteForFaction, shipVariantForRole } from './voxelModels.js';
import { clamp, seededRandom } from './random.js';
import { GRAVEYARD_GEOMETRY_PROFILES, GRAVEYARD_MODEL_WRECKS, getAsteroidBaseMeshes, wreckNodeCollisionRadius } from './worldData.js';
import { loadGlb } from './glbLoader.js';
import { LaserFx } from './laserFx.js';
const tupleToVector = (tuple, out = new THREE.Vector3()) => out.set(tuple[0], tuple[1], tuple[2]);
const NEG_Z = new THREE.Vector3(0, 0, -1);
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1);
const tmpGateAxis = new THREE.Vector3();
const tmpRacePosition = new THREE.Vector3();
const tmpRaceCenter = new THREE.Vector3();
const tmpRacePrevious = new THREE.Vector3();
const cssHex = (value) => `#${value.toString(16).padStart(6, '0')}`;
// Cockpit sprite scale: idle is held slightly zoomed-in so the frame still
// fills the view when it relaxes to COCKPIT_ZOOM_BURN under afterburner.
const COCKPIT_ZOOM_IDLE = 1.018;
// Activity-field visibility cutoff: nearby hubs can see their neighboring
// field on the horizon (Helix/Shardbelt and Cairn/Mourning). Graveyard pieces
// beyond this range are also zero-scaled. Both fields remain instanced, so the
// distant silhouettes do not multiply draw calls.
const DEBRIS_CULL_RANGE = 25000;
const DEBRIS_CULL_RANGE_SQ = DEBRIS_CULL_RANGE * DEBRIS_CULL_RANGE;
const HIDDEN_SCALE = [0.0001, 0.0001, 0.0001];
const SYSTEM_RENDER_STYLE = Object.freeze({
    'helios-verge': { clear: 0x0d1a3c, fog: 0x2a1e44, density: 0.000115 },
    meridian: { clear: 0x10253a, fog: 0x284358, density: 0.000105 },
    redwake: { clear: 0x240f1b, fog: 0x4b2029, density: 0.00013 },
    'pale-ring': { clear: 0x101c2b, fog: 0x273b49, density: 0.000095 },
});
const SYSTEM_STAR_PROFILE = Object.freeze({
    'helios-verge': Object.freeze({
        radius: 22000,
        core: 0xffe1a0,
        corona: [
            ['#fff5cf', '#ffaf3d', 48000, 0.55],
            ['#ffd57a', '#ff6b2a', 110000, 0.32],
            ['#ffe9a8', '#e07a3a', 220000, 0.14],
        ],
        hemisphere: [0xffd2a8, 0x32284c, 2.4],
        fill: [0x7a6caa, 1.0],
        key: [0xffa566, 5.0],
        rim: [0x66b9ff, 1.4],
    }),
    meridian: Object.freeze({
        radius: 19000,
        core: 0xfff2c7,
        corona: [
            ['#fffbea', '#efc86f', 44000, 0.52],
            ['#fff0b0', '#d89038', 98000, 0.28],
            ['#fff7d5', '#d6a652', 190000, 0.12],
        ],
        hemisphere: [0xffe7bd, 0x263b55, 2.3],
        fill: [0x7195bc, 1.0],
        key: [0xffc978, 4.8],
        rim: [0x77c9ff, 1.35],
    }),
    redwake: Object.freeze({
        // A compact red dwarf: physically smaller on the far shell and much
        // redder than Helios, with a restrained corona rather than a recolored
        // copy of the same yellow star.
        radius: 11000,
        core: 0xff6046,
        corona: [
            ['#ffb08a', '#e33b25', 30000, 0.48],
            ['#ff6a48', '#971c24', 66000, 0.29],
            ['#ee4937', '#5d1021', 135000, 0.13],
        ],
        hemisphere: [0xff8c69, 0x321421, 2.15],
        fill: [0x6a405d, 0.9],
        key: [0xff5538, 4.4],
        rim: [0xb65f8f, 1.15],
    }),
    'pale-ring': Object.freeze({
        // Pale Ring is lit by a blue giant: a larger blue-white disc with a
        // broad cold corona and correspondingly cool key light.
        radius: 38000,
        core: 0xe9fbff,
        corona: [
            ['#ffffff', '#8fdcff', 78000, 0.62],
            ['#c8efff', '#418dff', 165000, 0.38],
            ['#9edcff', '#245bb8', 310000, 0.17],
        ],
        hemisphere: [0xc8efff, 0x192b4f, 2.65],
        fill: [0x638bc7, 1.15],
        key: [0x9bdcff, 5.6],
        rim: [0xd7f6ff, 1.65],
    }),
});
// Half the previous pull-back (was 0.97): the frame relaxes to 0.994 under
// burn, and the grime follows at half that rate via the 0.5 factor below.
const COCKPIT_ZOOM_BURN = 0.994;
const factionColor = (faction) => {
    switch (faction) {
        case 'concord':
            return 0x6eb4d0;
        case 'free-merchants':
            return 0xd39b52;
        case 'frontier-miners':
            return 0xbba06c;
        case 'salvage-union':
            return 0x76a69b;
        case 'red-talons':
            return 0xcf4d3c;
    }
};
// GLB hulls (assets/models/ships/, converted from glb_models/ by
// .workbench/convert-glb.mjs). One config per voxel variant: the file to
// load, the yaw that points the model's nose at -Z (the game's forward), the
// scale that matches the voxel ship's length, engine ports in model-local
// units (the models are ~±1 per axis), and the model-local rear axis for the
// exhaust trails. Yaw/port values are tuned against the reference renders.
// Exported so the shipyard's buy-ship preview (shipPreview.js) loads the same
// hulls with the same orientation and world scale.
export const GLB_SHIP_CONFIG = {
    kestrel: { file: 'wayfarer.glb', yaw: Math.PI / 2, scale: 6.1, rearAxis: [-1, 0, 0], enginePorts: [[-0.85, 0, -0.06], [-0.85, 0, 0.06]] },
    warden: { file: 'vanguard.glb', yaw: Math.PI / 2, scale: 5.9, rearAxis: [-1, 0, 0], enginePorts: [[-0.85, 0, -0.3], [-0.85, 0, 0.3]] },
    talon: { file: 'talon.glb', yaw: Math.PI / 2, scale: 5.65, rearAxis: [-1, 0, 0], enginePorts: [[-0.85, 0, -0.12], [-0.85, 0, 0.12]] },
    prospector: { file: 'prospector.glb', yaw: Math.PI / 2, scale: 6.7, rearAxis: [-1, 0, 0], enginePorts: [[-0.9, 0, -0.3], [-0.9, 0, 0.3]] },
    lancer: { file: 'lancer.glb', yaw: Math.PI / 2, scale: 6.65, rearAxis: [-1, 0, 0], enginePorts: [[-0.85, 0, -0.22], [-0.85, 0, 0], [-0.85, 0, 0.22]] },
    'atlas-freighter': { file: 'atlas.glb', yaw: Math.PI / 2, scale: 13.4, rearAxis: [-1, 0, 0], enginePorts: [[-0.9, 0, -0.25], [-0.9, 0, 0.25]] },
    // Capital hulls preserve their authored blue Concord paint and load only
    // when one actually enters the scene. Their exact lengths are 10x and
    // 100x the baked Talon hull respectively.
    'concord-frigate': {
        path: 'assets/models/capital/concord-frigate.glb', yaw: -Math.PI / 2, scale: 56.5,
        rearAxis: [1, 0, 0], enginePorts: [[0.89, -0.07, -0.22], [0.9, -0.07, 0], [0.89, -0.07, 0.22]],
        preload: false, preserveColor: true, placeholderVariant: 'warden', placeholderScale: 10,
        flareSize: 3.4, flareOpacity: 0.2, trailLength: 24, trailWidth: 1.8, trailOpacity: 0.54,
    },
    'concord-battleship': {
        path: 'assets/models/capital/concord-battleship.glb', yaw: -Math.PI / 2, scale: 565,
        rearAxis: [1, 0, 0], enginePorts: [[0.9, -0.14, -0.25], [0.9, 0.11, -0.25], [0.9, -0.14, 0.25], [0.9, 0.11, 0.25]],
        preload: false, preserveColor: true, placeholderVariant: 'warden', placeholderScale: 100,
        flareSize: 15, flareOpacity: 0.18, trailLength: 90, trailWidth: 7, trailOpacity: 0.42,
    },
};
// Race entities carry their own hull variant so the starting grid can show
// the actual ships that are about to race. Ordinary traffic still only has a
// role, so retain the role mapping as the fallback for every other ship.
const shipVariantForEntity = (entity) => entity?.variant ?? shipVariantForRole(entity?.role);
const paletteForEntity = (entity) => {
    const palette = paletteForFaction(entity?.faction, entity?.hostile);
    return entity?.race && entity?.raceLivery ? { ...palette, ...entity.raceLivery } : palette;
};
const vectorInto = (value, out) => {
    if (value?.isVector3)
        return out.copy(value);
    out.set(Number.isFinite(value?.[0]) ? value[0] : 0, Number.isFinite(value?.[1]) ? value[1] : 0, Number.isFinite(value?.[2]) ? value[2] : 0);
    return out;
};
const unitDirectionInto = (value, out) => {
    vectorInto(value, out);
    if (out.lengthSq() < 1e-6)
        out.set(0, 0, 1);
    return out.normalize();
};
// Per-variant engine glow tuning, applied on top of the shared defaults. The
// talon's twin ports sit close together, so its two additive flares overlap
// into one bright blob that reads hotter than any other ship.
const ENGINE_GLOW_TUNING = {
    talon: { flareScale: 0.8, flareOpacity: 0.7, trailOpacity: 0.65 },
};
// The near-field engine glow (the small additive sprite at each engine — NOT
// the exhaust plume) is deliberately faint: a running-light read at a
// distance, not a beacon. Hostile and burning states barely raise it.
const ENGINE_FLARE_OPACITY = 0.13;
const ENGINE_FLARE_OPACITY_ATLAS = 0.17;
const ENGINE_FLARE_SIZE = 0.9;
const ENGINE_FLARE_SIZE_ATLAS = 1.6;
const ENGINE_FLARE_HOSTILE_BOOST = 1.12;
const ENGINE_FLARE_BURNING_BOOST = 1.45;
export class SpaceRenderer {
    container;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(74, 1, 0.08, 2000000);
    renderer;
    shell;
    dynamicRoot = new THREE.Group();
    skyRoot = new THREE.Group();
    locationRoot = new THREE.Group();
    instanceRoots = new Map();
    locationMeshes = new Map();
    // Planet atmosphere shells (halo + haze) that share a camera-distance
    // near-fade uniform, updated every frame in render().
    atmosphereShells = [];
    shipMeshes = new Map();
    projectileMeshes = new Map();
    pickupMeshes = new Map();
    // Shared laser-FX (gauntlet overhaul): owns bolt/muzzle/impact assets in
    // src/game/laserFx.js. Lazily created on first bolt; everything it caches
    // is flagged userData.shared so disposeObject skips it, and it releases
    // the whole cache in dispose().
    laserFx = null;
    raceGateRoot = null;
    raceGateMeshes = [];
    raceShortcutMeshes = [];
    raceStartRoot = null;
    raceActiveGate;
    shipMeshCount = 0;
    // GLB ship hulls: per-variant cached model (or null when the load failed),
    // plus the in-flight promises so concurrent spawns share one fetch.
    glbShipModels = new Map();
    graveyardModelLoading = null;
    graveyardModelMeshes = [];
    glbShipLoading = new Map();
    projectileMeshCount = 0;
    pickupMeshCount = 0;
    graveyardBatches = [];
    wreckBatches = [];
    wreckNodeMeshes = new Map();
    effects = [];
    cockpit = new THREE.Group();
    cockpitWarning;
    hyperdriveFxRoot = new THREE.Group();
    hyperdriveStreaks;
    hyperdriveStreakMaterial;
    hyperdriveStreakSeeds;
    hyperdriveRings;
    hyperdriveRingMaterial;
    hyperdriveFlash;
    hyperdriveFlashMaterial;
    hyperdriveFxState = 'none';
    hyperdriveFxProgress = 0;
    hyperdriveFxPhase = 0;
    hyperdriveFxPulse = 0;
    reducedHyperdriveMotion = false;
    hyperdriveRingTint = new THREE.Color();
    utilityBeam;
    utilityBeamMaterial;
    tmpMatrix = new THREE.Matrix4();
    tmpPosition = new THREE.Vector3();
    tmpQuaternion = new THREE.Quaternion();
    // Fixed-timestep interpolation scratch: previous-state transforms are lerped
    // toward the current state by the per-frame alpha fraction.
    tmpPrevPos = new THREE.Vector3();
    tmpPrevQuat = new THREE.Quaternion();
    tmpCurQuat = new THREE.Quaternion();
    tmpScale = new THREE.Vector3();
    tmpEuler = new THREE.Euler();
    pixelTextures = new Set();
    screenTextures = [];
    forward = new THREE.Vector3();
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    asteroidMeshes = [];
    asteroids;
    regionalFields = new Map();
    regionalAsteroidMeshes = [];
    graveyard;
    wreckNodes;
    viewportWidth = 1;
    viewportHeight = 1;
    lastQualityScale = 1;
    // Hysteresis for the auto tier's bloom gate: once the governor drops the
    // scale low enough to cut bloom, it stays off until the device clearly
    // recovers — otherwise a machine hovering around the threshold would pop
    // the glow on and off every second.
    bloomOff = false;
    qualityMode;
    contextLost = false;
    bloomSceneTarget;
    bloomBlurTargets = [];
    bloomQuad;
    bloomCamera;
    bloomBrightMaterial;
    bloomBlurMaterial;
    bloomCompositeMaterial;
    fovTarget = 74;
    skyTime = 0;
    starShimmer;
    targetId;
    selectedAsteroidId;
    selectedWreckId;
    selectedLocationId;
    activeInstanceId;
    systemId = 'helios-verge';
    sunVisuals = [];
    starCoronas = [];
    starTextureCache = new Map();
    jumpPointVisuals = [];
    armedJumpPointId;
    starBody;
    hemisphereLight;
    fillLight;
    sunLight;
    rimLight;
    constructor(container, seed, asteroids, graveyard, wreckNodes, quality, systemId = 'helios-verge', regionalFields = new Map()) {
        this.container = container;
        this.asteroids = asteroids;
        this.regionalFields = regionalFields;
        this.qualityMode = quality;
        // Touch-primary devices get the phone render tier regardless of CSS
        // width — landscape phones are 900+ CSS px wide, and the old <900
        // check silently gave them the desktop 960p tier.
        this.touchDevice = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)').matches : 'ontouchstart' in window;
        this.shell = this.container.closest('#game-shell');
        this.graveyard = graveyard;
        this.wreckNodes = wreckNodes;
        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance',
            depth: true,
            stencil: false,
        });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.NeutralToneMapping;
        this.renderer.toneMappingExposure = 1.18;
        this.renderer.setPixelRatio(1);
        this.renderer.shadowMap.enabled = false;
        this.renderer.setClearColor(0x0d1a3c, 1);
        this.container.appendChild(this.renderer.domElement);
        this.renderer.domElement.id = 'space-canvas';
        this.renderer.domElement.classList.add('retro-pixel-canvas');
        this.renderer.domElement.style.imageRendering = 'pixelated';
        this.renderer.domElement.setAttribute('aria-label', 'Three-dimensional spaceflight view');
        // Keep the far wake readable while letting the closer wreck layers
        // separate from one another through a gentle distance falloff.
        this.scene.fog = new THREE.FogExp2(0x2a1e44, 0.000115);
        this.scene.add(this.skyRoot);
        this.scene.add(this.dynamicRoot);
        this.scene.add(this.locationRoot);
        this.locationRoot.name = 'persistent-locations';
        Object.keys(LOCATIONS).forEach((id) => {
            const root = new THREE.Group();
            root.name = `poi-instance-${id}`;
            root.visible = false;
            this.instanceRoots.set(id, root);
            this.scene.add(root);
        });
        this.scene.add(this.camera);
        this.createLighting();
        this.createEnvironmentMap();
        this.createStarfield(seed, quality);
        this.createNebulae(seed, quality);
        this.createFieldDust(seed, quality);
        this.createLocations();
        this.createAsteroids();
        this.createGraveyard();
        this.createWreckNodes();
        this.createHyperdriveFx();
        this.createCockpit();
        this.setSystem(systemId);
        this.setActiveInstance(undefined);
        this.utilityBeamMaterial = new THREE.MeshBasicMaterial({
            color: 0x83e7d4,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        this.utilityBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 1, 8, 1, true), this.utilityBeamMaterial);
        this.utilityBeam.visible = false;
        this.scene.add(this.utilityBeam);
        this.cockpitWarning = this.cockpit.getObjectByName('warning-light');
        this.cockpitZoom = COCKPIT_ZOOM_IDLE;
        window.addEventListener('resize', this.resize);
        this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
        this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
        this.resize();
        this.createBloomPipeline();
        // Fire the GLB hull fetches up front so the first ship you see is
        // already the real model, not a voxel placeholder.
        this.preloadGlbShips();
    }
    createLighting() {
        // Lighting now mimics Rebel Galaxy Outlaw's two-tone dusk: a warm sodium-
        // orange sun whose key light pushes hulls toward gold, paired with a cool
        // cyan counter-rim that catches the shadow side. Fill is held at half the
        // sun's strength so the unlit side never collapses to black.
        this.hemisphereLight = new THREE.HemisphereLight(0xffd2a8, 0x32284c, 2.4);
        this.scene.add(this.hemisphereLight);
        this.fillLight = new THREE.AmbientLight(0x7a6caa, 1.0);
        this.scene.add(this.fillLight);
        // Sun is positioned *forward* (slightly above horizon, in -y so the
        // player tends to look at it) so chase-camera frames include the
        // sun-lit silhouette against the warm sky.
        const sunDir = new THREE.Vector3(-0.45, 0.18, 1.0).normalize();
        this.sunLight = new THREE.DirectionalLight(0xffa566, 5.0);
        this.sunLight.position.copy(sunDir).multiplyScalar(1);
        this.scene.add(this.sunLight);
        this.rimLight = new THREE.DirectionalLight(0x66b9ff, 1.4);
        this.rimLight.position.set(0.58, -0.24, -0.78).normalize();
        this.scene.add(this.rimLight);
        // The sun sits on the star shell, far outside the playable system. The
        // body is a slightly oversized golden disc with two coronae stacked
        // around it (tight inner halo + broad out-of-system bloom) plus a thin
        // anamorphic streak so it reads as a *star* and not just a sphere.
        const sunPos = new THREE.Vector3(...SUN_POSITION);
        const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffe1a0, fog: false }));
        sun.position.copy(sunPos);
        this.skyRoot.add(sun);
        this.sunVisuals.push(sun);
        this.starBody = sun;
        const innerCorona = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.starTexture('#fff5cf', '#ffaf3d'),
            transparent: true,
            opacity: 0.55,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
        }));
        innerCorona.position.copy(sunPos);
        innerCorona.scale.setScalar(48000);
        this.skyRoot.add(innerCorona);
        this.sunVisuals.push(innerCorona);
        this.starCoronas.push(innerCorona);
        const outerCorona = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.starTexture('#ffd57a', '#ff6b2a'),
            transparent: true,
            opacity: 0.32,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
        }));
        outerCorona.position.copy(sunPos);
        outerCorona.scale.setScalar(110000);
        this.skyRoot.add(outerCorona);
        this.sunVisuals.push(outerCorona);
        this.starCoronas.push(outerCorona);
        const farHalo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.starTexture('#ffe9a8', '#e07a3a'),
            transparent: true,
            opacity: 0.14,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
        }));
        farHalo.position.copy(sunPos);
        farHalo.scale.setScalar(220000);
        this.skyRoot.add(farHalo);
        this.sunVisuals.push(farHalo);
        this.starCoronas.push(farHalo);
        // Persist the sun direction in render-space so other systems (rim shader,
        // engine flare bias, sub-light point glows) can use it without re-reading
        // the directional light.
        this.sunDirection = sunDir.clone();
        this.applySystemStarProfile('helios-verge');
    }
    starTexture(inner, outer) {
        const key = `${inner}:${outer}`;
        if (!this.starTextureCache.has(key))
            this.starTextureCache.set(key, this.radialTexture(inner, outer));
        return this.starTextureCache.get(key);
    }
    applySystemStarProfile(systemId) {
        const profile = SYSTEM_STAR_PROFILE[systemId] ?? SYSTEM_STAR_PROFILE['helios-verge'];
        if (this.starBody) {
            this.starBody.scale.setScalar(profile.radius);
            this.starBody.material.color.setHex(profile.core);
        }
        profile.corona.forEach(([inner, outer, scale, opacity], index) => {
            const sprite = this.starCoronas[index];
            if (!sprite)
                return;
            sprite.material.map = this.starTexture(inner, outer);
            sprite.material.opacity = opacity;
            sprite.material.needsUpdate = true;
            sprite.scale.setScalar(scale);
        });
        const [skyColor, groundColor, hemisphereIntensity] = profile.hemisphere;
        this.hemisphereLight?.color.setHex(skyColor);
        this.hemisphereLight?.groundColor.setHex(groundColor);
        if (this.hemisphereLight)
            this.hemisphereLight.intensity = hemisphereIntensity;
        const [fillColor, fillIntensity] = profile.fill;
        this.fillLight?.color.setHex(fillColor);
        if (this.fillLight)
            this.fillLight.intensity = fillIntensity;
        const [keyColor, keyIntensity] = profile.key;
        this.sunLight?.color.setHex(keyColor);
        if (this.sunLight)
            this.sunLight.intensity = keyIntensity;
        const [rimColor, rimIntensity] = profile.rim;
        this.rimLight?.color.setHex(rimColor);
        if (this.rimLight)
            this.rimLight.intensity = rimIntensity;
    }
    createEnvironmentMap() {
        // Painterly galactic sky used as an IBL environment so glossy, clearcoated
        // hulls and stations reflect a colorful deep-space gradient instead of
        // black. The horizon band stays hot orange/peach so any high-altitude
        // glossy part catches the warm sun reflection. Polar caps fade to deep
        // cobalt (still cool blue, but darker than before).
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        const gradient = context.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, '#0a122c');
        gradient.addColorStop(0.18, '#54264c');
        gradient.addColorStop(0.34, '#a35a3c');
        gradient.addColorStop(0.46, '#ee9e50');
        gradient.addColorStop(0.52, '#ffd070');
        gradient.addColorStop(0.58, '#e07250');
        gradient.addColorStop(0.72, '#56284e');
        gradient.addColorStop(1, '#0a1132');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 512, 256);
        for (const [cx, cy, radius, fill] of [
            [120, 132, 170, 'rgba(255,170,80,0.85)'],
            [396, 132, 160, 'rgba(255,140,90,0.7)'],
            [250, 50, 110, 'rgba(196,108,238,0.42)'],
            [70, 210, 100, 'rgba(140,158,196,0.36)'],
            [430, 220, 80, 'rgba(120,236,196,0.28)'],
        ]) {
            const blob = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
            blob.addColorStop(0, fill);
            blob.addColorStop(1, 'rgba(0,0,0,0)');
            context.fillStyle = blob;
            context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        }
        // No star dots in the IBL canvas: scene.environment feeds every
        // standard material's specular, and 1px stars at 512x256 alias into
        // speckled dots on any glossy surface seen from orbit (Azure's seas).
        // The visible starfield is the Points shell from createStarfield.
        const texture = new THREE.CanvasTexture(canvas);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        this.scene.environment = texture;
    }
    // Transparent canvases store empty pixels as transparent BLACK (0,0,0,0).
    // GPU mipmap generation averages RGB uniformly — not alpha-weighted — so
    // at distance the mip chain bleeds that black into the wisps' RGB while
    // alpha stays visible: distant clouds/rings speckle with dark dots. This
    // pass rewrites RGB to white under the existing alpha so mips fade to
    // white; blending only multiplies by material color, so near-field pixels
    // are unchanged.
    opaqueRgbUnderAlpha(context, width, height) {
        const image = context.getImageData(0, 0, width, height);
        const pixels = image.data;
        for (let i = 0; i < pixels.length; i += 4) {
            pixels[i] = 255;
            pixels[i + 1] = 255;
            pixels[i + 2] = 255;
        }
        context.putImageData(image, 0, 0);
    }
    radialTexture(inner, outer) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
        gradient.addColorStop(0, inner);
        gradient.addColorStop(0.22, inner);
        gradient.addColorStop(1, `${outer}00`);
        context.fillStyle = gradient;
        context.fillRect(0, 0, 256, 256);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }
    createStarfield(seed, quality) {
        const rng = seededRandom(`${seed}:stars`);
        // The shell sits far beyond the whole system so stars read as a fixed sky.
        const SHELL_RADIUS = 900000;
        const layer = (count, size, blending, tint) => {
            const positions = new Float32Array(count * 3);
            const colors = new Float32Array(count * 3);
            const color = new THREE.Color();
            for (let index = 0; index < count; index += 1) {
                const theta = rng() * Math.PI * 2;
                const phi = Math.acos(2 * rng() - 1);
                positions[index * 3] = Math.sin(phi) * Math.cos(theta) * SHELL_RADIUS;
                positions[index * 3 + 1] = Math.cos(phi) * SHELL_RADIUS;
                positions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * SHELL_RADIUS;
                tint(color, rng);
                colors[index * 3] = color.r;
                colors[index * 3 + 1] = color.g;
                colors[index * 3 + 2] = color.b;
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            const material = new THREE.PointsMaterial({
                size,
                sizeAttenuation: false,
                vertexColors: true,
                fog: false,
                transparent: blending === 'additive',
                opacity: 1,
                blending: blending === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
                depthWrite: blending !== 'additive',
            });
            this.skyRoot.add(new THREE.Points(geometry, material));
            return material;
        };
        // Dense field of mixed-temperature stars. Rebalanced toward warm
        // giants (40% warm, 50% cool-bluish, 10% distant red) so the sky keeps
        // its sunset lean when the camera looks upward in chase views.
        layer(quality === 'low' ? 1900 : 3400, 1.5, 'normal', (color, rng) => {
            const r = rng();
            if (r < 0.4) {
                color.setHSL(0.05 + rng() * 0.1, 0.55 + rng() * 0.32, 0.55 + rng() * 0.28);
            }
            else if (r < 0.9) {
                color.setHSL(0.55 + (rng() - 0.5) * 0.18, 0.22 + rng() * 0.32, 0.5 + rng() * 0.28);
            }
            else {
                color.setHSL(0.97 + rng() * 0.06, 0.45 + rng() * 0.3, 0.45 + rng() * 0.25);
            }
        });
        // Sparse bright layer that shimmers — the main source of "HDR glare", so its
        // peak lightness is capped below full white.
        this.starShimmer = layer(quality === 'low' ? 110 : 190, 2.7, 'additive', (color, rng) => {
            color.setHSL(0.06 + rng() * 0.08, 0.3 + rng() * 0.3, 0.6 + rng() * 0.16);
        });
    }
    createNebulae(seed, quality) {
        if (quality === 'low')
            return;
        const rng = seededRandom(`${seed}:nebula`);
        // Nebulae hang on the same far shell as the stars, so they read as a fixed
        // sky that barely moves as you fly — never a near-field billboard.
        const FAR = 880000;
        // Plane meshes facing the camera (at the sky root's origin) rather than
        // screen-aligned sprites, so the clouds roll with the view like the stars
        // instead of counter-rotating when the ship banks.
        const makeCloud = (texture, dir, width, height, opacity) => {
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                fog: false,
                side: THREE.DoubleSide,
            });
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
            plane.position.set(dir[0] * FAR, dir[1] * FAR, dir[2] * FAR);
            plane.lookAt(0, 0, 0);
            this.skyRoot.add(plane);
        };
        const count = quality === 'high' ? 12 : 9;
        // Distinct color themes — mostly one hue per nebula, with a minority of
        // two-tone clouds, so the sky reads as varied regions rather than one
        // repeating multicolor smear.
        const themes = [
            [[255, 122, 66]],
            [[90, 190, 255]],
            [[170, 120, 255]],
            [[255, 210, 130]],
            [[120, 240, 220]],
            [[255, 160, 200]],
            [[255, 122, 66], [170, 120, 255]],
            [[90, 190, 255], [255, 160, 200]],
            [[120, 240, 220], [255, 210, 130]],
        ];
        // A golden-angle spiral scatters the nebulae evenly across the sphere so no
        // two overlap; the random phase just rotates the whole sky per seed.
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        const phase = rng() * Math.PI * 2;
        for (let index = 0; index < count; index += 1) {
            const y = 1 - (index + 0.5) * (2 / count);
            const horizontal = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = phase + index * goldenAngle;
            const dir = [Math.cos(theta) * horizontal, y, Math.sin(theta) * horizontal];
            makeCloud(
                this.nebulaTexture(`${seed}:nebula:${index}`, themes[index % themes.length]),
                dir,
                280000 + rng() * 140000,
                180000 + rng() * 100000,
                0.24 + rng() * 0.1,
            );
        }
        // A faint cool milky band, barely brighter than the starfield.
        for (let index = 0; index < 3; index += 1) {
            const angle = phase + (index / 3) * Math.PI * 2;
            const dir = [Math.cos(angle) * 0.95, 0.08 + rng() * 0.1, Math.sin(angle) * 0.95];
            makeCloud(this.bandTexture(`${seed}:band:${index}`), dir, 680000, 160000 + rng() * 100000, 0.12);
        }
    }
    nebulaTexture(seed, theme) {
        // A nebula is an irregular polygon with rounded corners and a soft fade: the
        // colored interior (bright core, knots, a second hue, darker gaps) is drawn
        // full-canvas, then a Gaussian-blurred polygon mask is applied as its alpha.
        // The mask's blur rounds the corners and fades every edge to transparency,
        // so the silhouette reads as a polygon — not an ellipse or a hard-edged sprite.
        const SIZE = 512;
        const source = document.createElement('canvas');
        source.width = SIZE;
        source.height = SIZE;
        const sctx = source.getContext('2d');
        const rng = seededRandom(`${seed}:cloud`);
        sctx.clearRect(0, 0, SIZE, SIZE);
        const cx = SIZE / 2;
        const cy = SIZE / 2;
        const rgba = (color, alpha) => `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
        // Mild tilt + stretch so silhouettes vary across the sky.
        const stretch = 0.85 + rng() * 0.3;
        const tilt = rng() * Math.PI;
        sctx.translate(cx, cy);
        sctx.rotate(tilt);
        sctx.scale(1, stretch);
        sctx.translate(-cx, -cy);
        // 5–7 vertices with a wide radius spread: clearly an irregular polygon.
        const vertices = [];
        const pointCount = 5 + Math.floor(rng() * 2);
        const baseRadius = 118 + rng() * 40;
        for (let i = 0; i < pointCount; i += 1) {
            const angle = (i / pointCount) * Math.PI * 2 + (rng() - 0.5) * 0.35;
            const radius = baseRadius * (0.62 + rng() * 0.55);
            vertices.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
        }
        const maxR = Math.max(...vertices.map(([x, y]) => Math.hypot(x - cx, y - cy)));
        const trace = (ctx) => {
            ctx.beginPath();
            ctx.moveTo(vertices[0][0], vertices[0][1]);
            for (let i = 1; i < vertices.length; i += 1)
                ctx.lineTo(vertices[i][0], vertices[i][1]);
            ctx.closePath();
        };
        // Interior color, drawn full-canvas (the mask below shapes and softens it).
        const body = sctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 1.05);
        body.addColorStop(0, rgba(theme[0], 0.9));
        body.addColorStop(0.5, rgba(theme[0], 0.55));
        body.addColorStop(1, rgba(theme[0], 0.32));
        sctx.fillStyle = body;
        sctx.fillRect(0, 0, SIZE, SIZE);
        const core = sctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.5);
        core.addColorStop(0, rgba(theme[0], 0.35));
        core.addColorStop(1, rgba(theme[0], 0));
        sctx.fillStyle = core;
        sctx.fillRect(0, 0, SIZE, SIZE);
        const knotCount = 2;
        for (let i = 0; i < knotCount; i += 1) {
            const a = rng() * Math.PI * 2;
            const d = maxR * (0.3 + rng() * 0.4);
            const kx = cx + Math.cos(a) * d;
            const ky = cy + Math.sin(a) * d;
            const knot = sctx.createRadialGradient(kx, ky, 0, kx, ky, maxR * (0.28 + rng() * 0.14));
            knot.addColorStop(0, rgba(theme[0], 0.24));
            knot.addColorStop(1, rgba(theme[0], 0));
            sctx.fillStyle = knot;
            sctx.fillRect(0, 0, SIZE, SIZE);
        }
        if (theme.length > 1) {
            const bx = cx + (rng() - 0.5) * maxR * 0.7;
            const by = cy + (rng() - 0.5) * maxR * 0.7;
            const pocket = sctx.createRadialGradient(bx, by, 0, bx, by, maxR * 0.4);
            pocket.addColorStop(0, rgba(theme[1], 0.45));
            pocket.addColorStop(1, rgba(theme[1], 0));
            sctx.fillStyle = pocket;
            sctx.fillRect(0, 0, SIZE, SIZE);
        }
        // Mask: the same polygon drawn solid, Gaussian-blurred so its alpha fades at
        // every edge and its corners round off, then applied as destination-in.
        const mask = document.createElement('canvas');
        mask.width = SIZE;
        mask.height = SIZE;
        const mctx = mask.getContext('2d');
        mctx.translate(cx, cy);
        mctx.rotate(tilt);
        mctx.scale(1, stretch);
        mctx.translate(-cx, -cy);
        trace(mctx);
        mctx.fillStyle = '#fff';
        mctx.fill();
        const blurredMask = document.createElement('canvas');
        blurredMask.width = SIZE;
        blurredMask.height = SIZE;
        const bctx = blurredMask.getContext('2d');
        bctx.imageSmoothingEnabled = true;
        bctx.imageSmoothingQuality = 'high';
        bctx.filter = 'blur(30px)';
        bctx.drawImage(mask, 0, 0);
        bctx.filter = 'none';
        sctx.globalCompositeOperation = 'destination-in';
        sctx.drawImage(blurredMask, 0, 0);
        sctx.globalCompositeOperation = 'source-over';
        const texture = new THREE.CanvasTexture(source);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }
    bandTexture(seed) {
        // A faint, cool milky band: soft bluish-white streaks with feathered top and
        // bottom edges, so it never shows a hard rectangle against the sky.
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        const rng = seededRandom(`${seed}:band`);
        context.clearRect(0, 0, 512, 256);
        const colors = [[150, 190, 235], [205, 214, 240], [125, 150, 200]];
        for (let i = 0; i < 110; i += 1) {
            const color = colors[Math.floor(rng() * colors.length)];
            const x = rng() * 512;
            const y = 36 + rng() * 184;
            const radius = 24 + rng() * 120;
            const height = 4 + rng() * 20;
            const alpha = 0.05 + rng() * 0.15;
            const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`);
            gradient.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);
            context.fillStyle = gradient;
            context.save();
            context.translate(x, y);
            context.scale(1, height / radius);
            context.translate(-x, -y);
            context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
            context.restore();
        }
        context.globalCompositeOperation = 'destination-in';
        const falloff = context.createLinearGradient(0, 0, 0, 256);
        falloff.addColorStop(0, 'rgba(255, 255, 255, 0)');
        falloff.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
        falloff.addColorStop(1, 'rgba(255, 255, 255, 0)');
        context.fillStyle = falloff;
        context.fillRect(0, 0, 512, 256);
        // Same falloff along the horizontal axis: the streaks run edge to edge, so
        // without this the band's left/right borders keep ~8% alpha and show as
        // hard rectangular edges against the sky (top/bottom were already feathered
        // by the vertical pass above). Destination-in multiplies, so the two passes
        // feather all four sides.
        const falloffX = context.createLinearGradient(0, 0, 512, 0);
        falloffX.addColorStop(0, 'rgba(255, 255, 255, 0)');
        falloffX.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
        falloffX.addColorStop(1, 'rgba(255, 255, 255, 0)');
        context.fillStyle = falloffX;
        context.fillRect(0, 0, 512, 256);
        context.globalCompositeOperation = 'source-over';
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }
    configurePixelTexture(texture, repeatX = 1, repeatY = 1) {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestMipmapNearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeatX, repeatY);
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        this.pixelTextures.add(texture);
        return texture;
    }
    createPixelPanelTexture(seed, base, accent, kind = 'metal', size = 64, water = false) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        const rng = seededRandom(`pixel-texture:${seed}:${kind}`);
        const baseColor = new THREE.Color(base);
        const accentColor = new THREE.Color(accent);
        context.fillStyle = cssHex(base);
        context.fillRect(0, 0, size, size);
        const block = kind === 'planet' ? 2 : kind === 'rock' ? 4 : 8;
        for (let y = 0; y < size; y += block) {
            for (let x = 0; x < size; x += block) {
                const noise = (rng() - 0.5) * (kind === 'rock' ? 0.46 : kind === 'planet' ? 0.28 : 0.18);
                const shade = baseColor.clone().offsetHSL((rng() - 0.5) * 0.018, (rng() - 0.5) * 0.08, noise);
                if (kind === 'rust' && rng() > 0.72)
                    shade.lerp(new THREE.Color(0x6f3522), 0.55 + rng() * 0.3);
                if (kind === 'rock' && rng() > 0.83)
                    shade.lerp(accentColor, 0.18 + rng() * 0.22);
                context.fillStyle = `#${shade.getHexString()}`;
                context.fillRect(x, y, block, block);
            }
        }
        if (kind === 'hull' || kind === 'metal' || kind === 'rust') {
            context.strokeStyle = `rgba(${Math.round(accentColor.r * 255)}, ${Math.round(accentColor.g * 255)}, ${Math.round(accentColor.b * 255)}, .38)`;
            context.lineWidth = 1;
            for (let x = 0; x < size; x += 16)
                context.strokeRect(x + 0.5, 0.5, 15, size - 1);
            for (let y = 0; y < size; y += 16)
                context.strokeRect(0.5, y + 0.5, size - 1, 15);
            context.fillStyle = 'rgba(3, 5, 5, .6)';
            for (let i = 0; i < size / 8; i += 1) {
                const x = Math.floor(rng() * (size - 6));
                const y = Math.floor(rng() * (size - 2));
                context.fillRect(x, y, 4 + Math.floor(rng() * 8), 1);
            }
            if (kind === 'hull') {
                context.fillStyle = `rgba(${Math.round(accentColor.r * 255)}, ${Math.round(accentColor.g * 255)}, ${Math.round(accentColor.b * 255)}, .62)`;
                for (let i = 0; i < 6; i += 1) {
                    const x = 4 + Math.floor(rng() * (size - 12));
                    const y = 4 + Math.floor(rng() * (size - 12));
                    context.fillRect(x, y, 6, 2);
                }
            }
        }
        else if (kind === 'planet') {
            // Jupiter-style horizontal banding driven by sample-rows plus
            // latitude-driven brightness curves, so each band reads as its own
            // weather system even when the planet rotates.
            const accentC = new THREE.Color(accent);
            const baseC = baseColor;
            const phaseOffset = rng() * Math.PI * 2;
            // Pull palette geography from the seed so every planet gets a
            // unique mix of warm/cool regions instead of a flat single-hue disc.
            // Seeded value-noise fbm (wrapped in longitude so the sphere has no
            // seam) drives the water world: depth-graded oceans, archipelago
            // chains with pale shallows, noisy polar caps. The old path hue-
            // shifted ocean blue +0.11 for land — straight into violet — which
            // is where the magenta blotches came from.
            const makeLattice = (gridSize) => {
                const lattice = new Float32Array((gridSize + 1) * (gridSize + 1));
                for (let y = 0; y <= gridSize; y += 1)
                    for (let x = 0; x < gridSize; x += 1)
                        lattice[y * (gridSize + 1) + x] = rng();
                // Duplicate column 0 into the wrap column: seamless longitude.
                for (let y = 0; y <= gridSize; y += 1)
                    lattice[y * (gridSize + 1) + gridSize] = lattice[y * (gridSize + 1)];
                return (u, v) => {
                    const gx = (((u % 1) + 1) % 1) * gridSize;
                    const gy = Math.min(gridSize - 1e-6, Math.max(0, v * gridSize));
                    const x0 = Math.floor(gx);
                    const y0 = Math.floor(gy);
                    const tx = gx - x0;
                    const ty = gy - y0;
                    const sx = tx * tx * (3 - 2 * tx);
                    const sy = ty * ty * (3 - 2 * ty);
                    const x1 = (x0 + 1) % gridSize;
                    const row = gridSize + 1;
                    const i00 = y0 * row + x0;
                    const i10 = y0 * row + x1;
                    const i01 = (y0 + 1) * row + x0;
                    const i11 = (y0 + 1) * row + x1;
                    return (lattice[i00] * (1 - sx) + lattice[i10] * sx) * (1 - sy)
                        + (lattice[i01] * (1 - sx) + lattice[i11] * sx) * sy;
                };
            };
            if (water) {
                // Abyss stays clearly above black: near-black single-pixel
                // noise dips read as dirt speckle from orbit (and the bump map
                // amplifies them), not as ocean depth.
                const abyss = new THREE.Color(0x0e3a60);
                const ocean = new THREE.Color(0x1a5f97);
                const shelf = new THREE.Color(0x2f86b4);
                const sand = new THREE.Color(0xd0bd8a);
                const scrub = new THREE.Color(0x527e4c);
                const highland = new THREE.Color(0x8d9c72);
                const noiseA = makeLattice(6);
                const noiseB = makeLattice(14);
                const noiseC = makeLattice(34);
                const noiseD = makeLattice(64);
                // Land/ocean is decided by the LOW-frequency octaves only:
                // letting the 64-lattice octave into the threshold scatters
                // single-texel islands that render as dirt speckle from orbit.
                // The fine octave still shades land interiors and shallows.
                const fbmLow = (u, v) => noiseA(u, v) * 0.62 + noiseB(u, v) * 0.38;
                const fbm = (u, v) => fbmLow(u, v) + (noiseC(u, v) - 0.5) * 0.24 + (noiseD(u, v) - 0.5) * 0.12;
                const image = context.getImageData(0, 0, size, size);
                const pixels = image.data;
                const landThreshold = 0.6;
                for (let y = 0; y < size; y += 1) {
                    const v = y / size;
                    const lat = v * 2 - 1;
                    for (let x = 0; x < size; x += 1) {
                        const nLow = fbmLow(x / size, v);
                        const n = nLow + (noiseC(x / size, v) - 0.5) * 0.2 + (noiseD(x / size, v) - 0.5) * 0.1;
                        const idx = (y * size + x) * 4;
                        let r;
                        let g;
                        let b;
                        if (nLow > landThreshold) {
                            // Archipelago: sand rim → scrub → highland, with a
                            // second noise channel breaking the flat tone into
                            // vegetated/rocky patchwork.
                            const t = Math.min(1, (n - nLow) * 2.2 + (nLow - landThreshold) * 4.5);
                            const patch = noiseC((x + 137) / size, (v + 59) / size);
                            const c = sand.clone()
                                .lerp(scrub, Math.min(1, t * 3.2 + patch * 0.5))
                                .lerp(highland, Math.max(0, t - 0.5) * 1.6 * (0.5 + patch));
                            r = c.r;
                            g = c.g;
                            b = c.b;
                        }
                        else {
                            // Depth-graded ocean: pale shelf at the coast, deep
                            // basins beyond — the sea reads as water, not paint.
                            const d = landThreshold - nLow;
                            const c = shelf.clone().lerp(ocean, Math.min(1, d * 5)).lerp(abyss, Math.min(1, d * 1.5));
                            r = c.r;
                            g = c.g;
                            b = c.b;
                        }
                        // Noisy polar caps — low-frequency edge, no speckle.
                        const capEdge = 0.8 + (nLow - 0.5) * 0.14;
                        const capT = Math.min(1, Math.max(0, (Math.abs(lat) - capEdge) * 8));
                        if (capT > 0) {
                            r += (0.93 - r) * capT;
                            g += (0.96 - g) * capT;
                            b += (0.99 - b) * capT;
                        }
                        pixels[idx] = r * 255;
                        pixels[idx + 1] = g * 255;
                        pixels[idx + 2] = b * 255;
                        pixels[idx + 3] = 255;
                    }
                }
                context.putImageData(image, 0, 0);
                // Sparse bright storm speckles — small, soft, white; mid-lat.
                for (let i = 0; i < 30; i += 1) {
                    const sy = (0.2 + rng() * 0.6) * size;
                    const sx = rng() * size;
                    const r = 1.5 + rng() * 2.6;
                    const gradient = context.createRadialGradient(sx, sy, 0, sx, sy, r);
                    gradient.addColorStop(0, 'rgba(255,255,255,0.42)');
                    gradient.addColorStop(1, 'rgba(255,255,255,0)');
                    context.fillStyle = gradient;
                    context.fillRect(sx - r, sy - r, r * 2, r * 2);
                }
            }
            else {
            const hueShift = (rng() - 0.5) * 0.04 + (baseColor.r > baseColor.b ? 0.02 : -0.02);
            // Dry worlds: dense continents on a banded desert base.
            const continentCount = water ? 5 + Math.floor(rng() * 4) : 8 + Math.floor(rng() * 6);
            const continents = [];
            for (let i = 0; i < continentCount; i += 1) {
                continents.push({
                    cx: rng() * size,
                    cy: 0.14 + rng() * 0.78 * size,
                    rx: water ? 24 + rng() * 46 : 38 + rng() * 78,
                    ry: water ? 12 + rng() * 22 : 18 + rng() * 38,
                    rot: rng() * Math.PI * 2,
                    warmth: 0.32 + rng() * 0.34,
                });
            }
            for (let y = 0; y < size; y += 1) {
                const lat = (y / size) * 2 - 1;
                const band = Math.sin(lat * 10 + phaseOffset) * 0.5 + 0.5;
                const swirl = Math.sin(lat * 28 + phaseOffset * 1.7 + y * 0.13) * 0.5 + 0.5;
                const noise = (rng() - 0.5) * 0.22;
                const row = baseC.clone().lerp(accentC, 0.18 + band * 0.55 + noise);
                row.offsetHSL(hueShift * (swirl - 0.5), 0, (swirl - 0.5) * 0.06);
                if (Math.abs(lat) < 0.18)
                    row.offsetHSL(0, -0.05, -0.06);
                context.fillStyle = cssHex(row.getHex());
                context.fillRect(0, y, size, 1);
                // Landmass / ocean basin: for each row, only paint the columns
                // that fall inside at least one continent's rotated ellipse. The
                // continent "drift" is a sin-driven horizontal offset so the
                // continent has curvy coastlines.
                // Build a per-row mask once per row, then paint only those columns.
                // Islands push greener and brighter than the deep ocean so
                // they read as land, not depth shading.
                const continentHue = water ? 0.11 : (baseColor.b > baseColor.r ? 0.10 : 0.04);
                let lastColor = '';
                let runStart = -1;
                const flush = (endX) => {
                    if (runStart < 0 || endX <= runStart)
                        return;
                    context.fillRect(runStart, y, endX - runStart, 1);
                    runStart = -1;
                };
                for (let x = 0; x < size; x += 1) {
                    let bestD = Infinity;
                    for (const c of continents) {
                        const cosR = Math.cos(c.rot);
                        const sinR = Math.sin(c.rot);
                        const u = (Math.sin(((y * 1.7 + c.cy * 0.4) + (x * 0.04)) / size * Math.PI * 2) + 1) * size * 0.5;
                        const ox = (((u + c.cx) % size) + size) % size - c.cx;
                        const dx_ = y - c.cy;
                        const lx = (x - ox) * cosR - dx_ * sinR;
                        const ly = (x - ox) * sinR + dx_ * cosR;
                        const d = (lx * lx) / (c.rx * c.rx) + (ly * ly) / (c.ry * c.ry);
                        if (d < bestD)
                            bestD = d;
                    }
                    if (bestD <= 1) {
                        const warmth = 1 - Math.min(1, bestD);
                        const landShade = baseC.clone().offsetHSL(hueShift + continentHue + band * 0.02, water ? 0.16 : 0.10, (water ? 0.26 : 0.22) + warmth * 0.18);
                        const color = cssHex(landShade.getHex());
                        if (color !== lastColor) {
                            flush(x);
                            context.fillStyle = color;
                            lastColor = color;
                            runStart = x;
                        }
                    }
                    else {
                        flush(x);
                        lastColor = '';
                    }
                }
                flush(size);
            }
            // Storm-eye spots (Galilean-style) at varying latitudes; water
            // worlds carry more and bigger cyclones.
            const stormCount = water ? 4 + Math.floor(rng() * 3) : 3 + Math.floor(rng() * 3);
            for (let i = 0; i < stormCount; i += 1) {
                const sy = Math.floor((0.15 + rng() * 0.7) * size);
                const sx = Math.floor(rng() * size);
                const r = water ? 8 + Math.floor(rng() * 12) : 5 + Math.floor(rng() * 8);
                const rotate = rng() * Math.PI * 2;
                // Vortex: hotter core, dark outer ring, hot wisps trailing.
                for (let dy = -r; dy <= r; dy += 1) {
                    for (let dx = -r; dx <= r; dx += 1) {
                        const d2 = dx * dx + dy * dy;
                        if (d2 > r * r)
                            continue;
                        const px = ((sx + dx) % size + size) % size;
                        const py = sy + dy;
                        if (py < 0 || py >= size)
                            continue;
                        const t = Math.sqrt(d2) / r;
                        let alpha = 0;
                        let rC = accentC.r, gC = accentC.g, bC = accentC.b;
                        if (t < 0.32) {
                            // Hot eye: dusty amber, never white-pink — white
                            // cores over a blue ocean read as magenta scars.
                            alpha = 0.62 * (1 - t / 0.32);
                            rC = 0.93; gC = 0.72; bC = 0.48;
                        }
                        else if (t < 0.62) {
                            // Mid eye wall
                            alpha = 0.42;
                        }
                        else if (t < 0.95) {
                            // Trailing wisps (rotated)
                            const wa = Math.atan2(dy, dx) - rotate;
                            if (Math.abs(((wa + Math.PI) % (Math.PI * 0.42)) - Math.PI * 0.21) < 0.18) {
                                alpha = 0.34 * (1 - (t - 0.62) / 0.33);
                            }
                        }
                        if (alpha > 0.05) {
                            context.fillStyle = `rgba(${Math.round(rC * 255)},${Math.round(gC * 255)},${Math.round(bC * 255)},${alpha})`;
                            context.fillRect(px, py, 1, 1);
                        }
                    }
                }
            }
            }
            // Twin polar caps: dim white caps ringed by cooler bands. Water
            // worlds bake their own noisy caps per-pixel above.
            if (!water) {
            for (const poleY of [0, size]) {
                const grad = context.createLinearGradient(0, poleY === 0 ? 0 : size - 28, 0, poleY === 0 ? 28 : size);
                grad.addColorStop(0, 'rgba(232, 240, 246, 0.86)');
                grad.addColorStop(0.55, 'rgba(186, 210, 230, 0.42)');
                grad.addColorStop(1, 'rgba(120, 156, 188, 0)');
                context.fillStyle = grad;
                context.fillRect(0, poleY === 0 ? 0 : size - 28, size, 28);
            }
            }
            // Sparse cloud plumes: long thin warm streaks across the bandline.
            const plumes = water ? 10 + Math.floor(rng() * 7) : 6 + Math.floor(rng() * 6);
            for (let i = 0; i < plumes; i += 1) {
                const py = Math.floor((0.12 + rng() * 0.76) * size);
                const start = Math.floor(rng() * size);
                const width = 22 + Math.floor(rng() * 40);
                const alpha = 0.18 + rng() * 0.18;
                for (let d = 0; d < width; d += 1) {
                    const px = ((start + d) % size + size) % size;
                    const pxRow = py + Math.round(Math.sin(d * 0.32) * 2);
                    if (pxRow < 0 || pxRow >= size)
                        continue;
                    context.fillStyle = `rgba(214, 230, 240, ${alpha * (1 - d / width)})`;
                    context.fillRect(px, pxRow, 1, 2);
                }
            }
        }
        return this.configurePixelTexture(new THREE.CanvasTexture(canvas));
    }
    createInstrumentTexture(seed, accent = 0x62d4bc) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        const rng = seededRandom(`instrument:${seed}`);
        context.fillStyle = '#020807';
        context.fillRect(0, 0, 128, 64);
        context.strokeStyle = 'rgba(73, 122, 108, .55)';
        context.lineWidth = 1;
        for (let x = 0; x <= 128; x += 8) {
            context.beginPath();
            context.moveTo(x + 0.5, 0);
            context.lineTo(x + 0.5, 64);
            context.stroke();
        }
        for (let y = 0; y <= 64; y += 8) {
            context.beginPath();
            context.moveTo(0, y + 0.5);
            context.lineTo(128, y + 0.5);
            context.stroke();
        }
        const color = new THREE.Color(accent);
        context.fillStyle = `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},.9)`;
        for (let i = 0; i < 24; i += 1) {
            const x = 6 + Math.floor(rng() * 116);
            const y = 6 + Math.floor(rng() * 52);
            context.fillRect(x, y, 2 + Math.floor(rng() * 8), rng() > 0.72 ? 2 : 1);
        }
        context.strokeStyle = `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},.9)`;
        context.beginPath();
        context.moveTo(6, 50);
        for (let x = 8; x < 124; x += 4)
            context.lineTo(x, 42 - Math.floor(rng() * 18));
        context.stroke();
        const texture = this.configurePixelTexture(new THREE.CanvasTexture(canvas));
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        this.screenTextures.push(texture);
        return texture;
    }
    createGrimeTexture(seed) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 160;
        const context = canvas.getContext('2d');
        const rng = seededRandom(`grime:${seed}`);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = 'rgba(205, 184, 137, .12)';
        for (let i = 0; i < 85; i += 1) {
            const x = Math.floor(rng() * canvas.width);
            const y = Math.floor(rng() * canvas.height);
            const size = rng() > 0.9 ? 2 : 1;
            context.fillRect(x, y, size, size);
        }
        context.strokeStyle = 'rgba(192, 166, 118, .13)';
        context.lineWidth = 1;
        for (let i = 0; i < 10; i += 1) {
            const x = rng() * canvas.width;
            const y = rng() * canvas.height;
            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(x + (rng() - 0.5) * 48, y + (rng() - 0.5) * 16);
            context.stroke();
        }
        const texture = this.configurePixelTexture(new THREE.CanvasTexture(canvas));
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
    }
    createFieldDust(seed, quality) {
        const createCloud = (id, color, suffix) => {
            const rng = seededRandom(`${seed}:field-dust:${suffix}`);
            const count = quality === 'low' ? 360 : quality === 'high' ? 920 : 680;
            const location = LOCATIONS[id];
            const positions = new Float32Array(count * 3);
            for (let index = 0; index < count; index += 1) {
                const theta = rng() * Math.PI * 2;
                const phi = Math.acos(2 * rng() - 1);
                const radius = Math.cbrt(rng()) * location.radius * 1.06;
                positions[index * 3] = location.position[0] + Math.sin(phi) * Math.cos(theta) * radius;
                positions[index * 3 + 1] = location.position[1] + Math.cos(phi) * radius * 0.62;
                positions[index * 3 + 2] = location.position[2] + Math.sin(phi) * Math.sin(theta) * radius;
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const material = new THREE.PointsMaterial({
                color,
                size: quality === 'high' ? 1.3 : 1.05,
                transparent: true,
                opacity: id === 'shardbelt' ? 0.36 : 0.29,
                sizeAttenuation: true,
                depthWrite: false,
            });
            this.instanceRoots.get(id)?.add(new THREE.Points(geometry, material));
        };
        createCloud('shardbelt', 0x83b8d2, 'ore-dust');
        createCloud('mourning-line', 0x789c96, 'debris-dust');
    }
    tagTargetable(object, kind, id) {
        object.userData.targetKind = kind;
        object.userData.targetId = id;
        object.traverse((child) => {
            child.userData.targetKind = kind;
            child.userData.targetId = id;
        });
    }
    createLocations() {
        this.createPlanet('vesper', 0xa85f36, 0x281611, 0xd78a54, false);
        // Azure is a space-age water world: deep blue ocean, a few small
        // archipelagos, white storm clouds — not the teal gas-giant look it
        // previously read as from space.
        this.createPlanet('azure', 0x1e5d8f, 0x081e33, 0x79c8ea, true);
        this.createHelixStation();
        this.createRookStation();
        for (const id of Object.keys(LOCATIONS)) {
            if (this.locationMeshes.has(id) || id === 'shardbelt' || id === 'mourning-line')
                continue;
            this.createGenericLocation(id);
        }
    }
    createGenericLocation(id) {
        const location = LOCATIONS[id];
        if (!location)
            return;
        const group = new THREE.Group();
        group.name = `generic-location-${id}`;
        group.position.set(...location.position);
        const accent = new THREE.Color(location.accent ?? '#80bad0');
        const secondary = new THREE.Color(location.secondary ?? '#243444');
        const rng = seededRandom(`generic-location:${id}`);
        if (location.kind === 'planet') {
            const planet = new THREE.Mesh(
                new THREE.SphereGeometry(location.radius, 48, 28),
                new THREE.MeshStandardMaterial({
                    color: accent,
                    emissive: secondary,
                    emissiveIntensity: 0.2,
                    roughness: 0.82,
                    metalness: id === 'boreal' ? 0.08 : 0.02,
                    fog: false,
                }),
            );
            group.add(planet);
            const halo = new THREE.Mesh(
                new THREE.SphereGeometry(location.radius * 1.035, 36, 20),
                new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.09, side: THREE.BackSide, depthWrite: false, fog: false }),
            );
            halo.raycast = () => {};
            group.add(halo);
        }
        else if (location.kind === 'jump-point') {
            group.add(this.createJumpPointVisual(id, location, accent, secondary, rng));
        }
        else if (location.kind === 'field' || location.kind === 'rings') {
            this.createRegionalAsteroidField(group, id, location, accent, secondary);
        }
        else if (location.id === 'blackglass' && location.radius > 2500) {
            const moon = new THREE.Mesh(
                new THREE.IcosahedronGeometry(location.radius * 0.82, 3),
                new THREE.MeshStandardMaterial({ color: 0x181b23, roughness: 0.96, metalness: 0.04 }),
            );
            group.add(moon);
            const dockRing = new THREE.Mesh(
                new THREE.TorusGeometry(location.radius * 0.68, 90, 10, 64),
                new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.28, roughness: 0.5, metalness: 0.55 }),
            );
            dockRing.rotation.x = Math.PI / 2.7;
            group.add(dockRing);
        }
        else {
            const station = this.createDistinctStationModel(id, accent, secondary);
            station.rotation.set((rng() - 0.5) * 0.18, rng() * Math.PI * 2, (rng() - 0.5) * 0.14);
            // The normalized identity models are authored to fit the station's
            // physical collision sphere. Per-silhouette factors keep the
            // longest boom just inside that envelope while making approaches
            // read as stations rather than fighter-sized props.
            const stationScale = {
                cairn: 0.66,
                argent: 0.62,
                'gatehouse-twelve': 0.62,
                cinder: 0.58,
                torchwell: 0.62,
                nacre: 0.72,
                shepherd: 0.7,
            }[id] ?? 0.6;
            station.scale.setScalar(location.radius * stationScale);
            group.add(station);
            this.makeFogExempt(station);
        }
        this.tagTargetable(group, 'location', id);
        this.locationRoot.add(group);
        this.locationMeshes.set(id, group);
    }
    createJumpPointVisual(id, location, accent, secondary, rng) {
        const landmark = new THREE.Group();
        landmark.name = `jump-point-landmark-${id}`;
        const gateNormal = new THREE.Vector3(...location.position);
        if (gateNormal.lengthSq() < 0.0001)
            gateNormal.set(0, 0, 1);
        landmark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), gateNormal.normalize());
        landmark.userData.activationRadius = 1000;
        const radius = location.radius;
        const frameMaterial = new THREE.MeshStandardMaterial({
            color: secondary.clone().lerp(new THREE.Color(0x66717a), 0.18),
            roughness: 0.62,
            metalness: 0.78,
            emissive: secondary,
            emissiveIntensity: 0.16,
            fog: false,
        });
        const energizedMaterial = new THREE.MeshBasicMaterial({
            color: accent,
            transparent: true,
            opacity: 0.92,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
        });
        const outerRing = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.72, radius * 0.065, 10, 72), frameMaterial);
        landmark.add(outerRing);
        const innerRing = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.535, radius * 0.018, 8, 72), energizedMaterial);
        landmark.add(innerRing);

        // A heavy segmented frame and radial braces make the point read as a
        // built piece of infrastructure, even before the bright aperture does.
        const pylonGeometry = new THREE.BoxGeometry(radius * 0.18, radius * 0.31, radius * 0.095);
        const braceGeometry = new THREE.BoxGeometry(radius * 0.19, radius * 0.026, radius * 0.038);
        for (let index = 0; index < 12; index += 1) {
            const angle = index / 12 * Math.PI * 2;
            const pylon = new THREE.Mesh(pylonGeometry, index % 3 === 0 ? energizedMaterial : frameMaterial);
            pylon.position.set(Math.cos(angle) * radius * 0.72, Math.sin(angle) * radius * 0.72, 0);
            pylon.rotation.z = angle;
            landmark.add(pylon);
            const brace = new THREE.Mesh(braceGeometry, frameMaterial);
            brace.position.set(Math.cos(angle) * radius * 0.625, Math.sin(angle) * radius * 0.625, 0);
            brace.rotation.z = angle;
            landmark.add(brace);
        }

        const portal = new THREE.Mesh(
            new THREE.CircleGeometry(radius * 0.515, 64),
            new THREE.MeshBasicMaterial({
                color: accent,
                transparent: true,
                opacity: 0.13,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide,
                fog: false,
            }),
        );
        portal.name = 'jump-aperture';
        landmark.add(portal);
        const portalGlow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.radialTexture('#ffffff', cssHex(accent.getHex())),
            color: accent,
            transparent: true,
            opacity: 0.44,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
        }));
        portalGlow.scale.setScalar(radius * 1.17);
        landmark.add(portalGlow);

        // Six moving charge blocks give the aperture a clear sense of direction
        // without filling its traversable centre with another solid object.
        const spinner = new THREE.Group();
        const chargeGeometry = new THREE.BoxGeometry(radius * 0.09, radius * 0.035, radius * 0.045);
        for (let index = 0; index < 6; index += 1) {
            const angle = index / 6 * Math.PI * 2;
            const charge = new THREE.Mesh(chargeGeometry, energizedMaterial);
            charge.position.set(Math.cos(angle) * radius * 0.46, Math.sin(angle) * radius * 0.46, radius * 0.035);
            charge.rotation.z = angle;
            spinner.add(charge);
        }
        landmark.add(spinner);
        const beaconTexture = this.radialTexture('#ffffff', cssHex(accent.getHex()));
        const beacons = [];
        for (let index = 0; index < 4; index += 1) {
            const angle = index / 4 * Math.PI * 2 + Math.PI / 4;
            const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
                map: beaconTexture,
                color: accent,
                transparent: true,
                opacity: 0.7,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                fog: false,
            }));
            beacon.position.set(Math.cos(angle) * radius * 0.91, Math.sin(angle) * radius * 0.91, radius * 0.04);
            beacon.scale.setScalar(radius * 0.18);
            landmark.add(beacon);
            beacons.push(beacon);
        }
        this.jumpPointVisuals.push({ id, landmark, spinner, innerRing, portal, portalGlow, beacons, phase: rng() * Math.PI * 2 });
        return landmark;
    }
    createRegionalAsteroidField(group, id, location, accent, secondary) {
        const nodes = this.regionalFields.get(id) ?? [];
        if (!nodes.length)
            return;
        const style = {
            'foundry-lanes': { texture: 'foundry-slag', dark: 0x3f4447, light: 0xb99770, color: 0x9d8c78, roughness: 0.94, metalness: 0.2, dust: 0xb88a57 },
            'redwake-belt': { texture: 'redwake-rock', dark: 0x211d24, light: 0x8f4a3b, color: 0x66505a, roughness: 1, metalness: 0.03, dust: 0x8a3c36 },
            'pale-rings': { texture: 'pale-ring-ice', dark: 0x587381, light: 0xd8f2f5, color: 0xc8e0e8, roughness: 0.78, metalness: 0.015, dust: 0xafdfea, emissive: 0x102c42 },
        }[id];
        if (!style)
            return;
        const map = this.createPixelPanelTexture(style.texture, style.dark, style.light, 'rock', 128);
        map.repeat.set(3.6, 3.6);
        const material = new THREE.MeshStandardMaterial({
            color: style.color,
            map,
            bumpMap: map,
            bumpScale: id === 'pale-rings' ? 0.62 : 1.05,
            roughness: style.roughness,
            metalness: style.metalness,
            flatShading: true,
            vertexColors: true,
            emissive: style.emissive ?? 0x000000,
            emissiveIntensity: style.emissive ? 0.22 : 0,
            fog: false,
        });
        const geometries = getAsteroidBaseMeshes().map((entry) => entry.geometry);
        const byShape = new Map();
        nodes.forEach((node) => {
            const shape = node.shape ?? 0;
            const entries = byShape.get(shape) ?? [];
            entries.push(node);
            byShape.set(shape, entries);
        });
        const tint = new THREE.Color();
        byShape.forEach((entries, shape) => {
            const mesh = new THREE.InstancedMesh(geometries[shape % geometries.length], material, entries.length);
            mesh.name = `${id}-terrain-${shape}`;
            mesh.frustumCulled = false;
            entries.forEach((node, index) => {
                this.tmpPosition.set(
                    node.position[0] - location.position[0],
                    node.position[1] - location.position[1],
                    node.position[2] - location.position[2],
                );
                this.tmpEuler.set(...node.rotation);
                this.tmpQuaternion.setFromEuler(this.tmpEuler);
                this.tmpScale.set(node.radius * node.scale[0], node.radius * node.scale[1], node.radius * node.scale[2]);
                mesh.setMatrixAt(index, this.tmpMatrix.compose(this.tmpPosition, this.tmpQuaternion, this.tmpScale));
                tint.setHex(style.color).offsetHSL((index % 5 - 2) * 0.006, 0, (index % 7 - 3) * 0.018 + (node.landmark ? 0.045 : 0));
                mesh.setColorAt(index, tint);
            });
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor)
                mesh.instanceColor.needsUpdate = true;
            group.add(mesh);
            this.regionalAsteroidMeshes.push({ id, mesh, entries });
        });

        // Fine dust makes each field read as one environment at long range;
        // the solid deformed rocks remain the only collidable geometry.
        const dustCount = id === 'pale-rings' ? 220 : 130;
        const dustPositions = new Float32Array(dustCount * 3);
        const rng = seededRandom(`regional-dust:${id}`);
        for (let index = 0; index < dustCount; index += 1) {
            const angle = rng() * Math.PI * 2;
            const radial = location.radius * (0.18 + Math.sqrt(rng()) * 0.8);
            dustPositions[index * 3] = Math.cos(angle) * radial;
            dustPositions[index * 3 + 1] = (rng() - 0.5) * location.radius * (id === 'pale-rings' ? 0.08 : 0.36);
            dustPositions[index * 3 + 2] = Math.sin(angle) * radial;
        }
        const dustGeometry = new THREE.BufferGeometry();
        dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
        const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
            color: style.dust,
            size: id === 'pale-rings' ? 9 : 6,
            transparent: true,
            opacity: id === 'redwake-belt' ? 0.24 : 0.3,
            depthWrite: false,
            fog: false,
        }));
        dust.name = `${id}-dust`;
        group.add(dust);
    }
    createDistinctStationModel(id, accent, secondary) {
        const station = new THREE.Group();
        station.name = `station-identity-${id}`;
        station.userData.stationIdentity = id;

        const panelMap = this.createPixelPanelTexture(
            `station-${id}-panels`,
            secondary.clone().lerp(new THREE.Color(0x667178), 0.28).getHex(),
            accent.clone().lerp(new THREE.Color(0xd5d1bb), 0.38).getHex(),
            'metal',
            128,
        );
        panelMap.repeat.set(3, 3);
        panelMap.magFilter = THREE.LinearFilter;
        panelMap.minFilter = THREE.LinearMipmapLinearFilter;
        panelMap.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        panelMap.needsUpdate = true;
        const hull = new THREE.MeshStandardMaterial({
            color: 0xd4d8d7,
            map: panelMap,
            bumpMap: panelMap,
            bumpScale: 0.025,
            roughness: 0.56,
            metalness: 0.72,
            fog: false,
        });
        const dark = new THREE.MeshStandardMaterial({
            color: secondary.clone().multiplyScalar(0.42),
            roughness: 0.68,
            metalness: 0.72,
            fog: false,
        });
        const pale = new THREE.MeshStandardMaterial({
            color: secondary.clone().lerp(new THREE.Color(0xc9d1d0), 0.62),
            roughness: 0.42,
            metalness: 0.78,
            fog: false,
        });
        const trim = new THREE.MeshStandardMaterial({
            color: accent,
            emissive: accent,
            emissiveIntensity: 0.38,
            roughness: 0.32,
            metalness: 0.74,
            fog: false,
        });
        const windowMaterial = new THREE.MeshStandardMaterial({
            color: accent.clone().lerp(new THREE.Color(0xffffff), 0.48),
            emissive: accent,
            emissiveIntensity: 1.9,
            roughness: 0.18,
            metalness: 0.08,
            fog: false,
        });
        const radiatorMaterial = new THREE.MeshStandardMaterial({
            color: secondary.clone().lerp(new THREE.Color(0x101923), 0.48),
            roughness: 0.76,
            metalness: 0.42,
            emissive: accent,
            emissiveIntensity: 0.055,
            fog: false,
        });
        const light = new THREE.MeshBasicMaterial({ color: accent.clone().lerp(new THREE.Color(0xffffff), 0.24), fog: false });
        const unitBox = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
        const unitBeam = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false);
        const unitSphere = new THREE.SphereGeometry(1, 20, 12);
        const geometryCache = new Map();
        const cachedGeometry = (key, create) => {
            if (!geometryCache.has(key))
                geometryCache.set(key, create());
            return geometryCache.get(key);
        };
        const add = (geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale) => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = `${id}-detail-${station.children.length}`;
            mesh.position.set(...position);
            mesh.rotation.set(...rotation);
            if (scale)
                mesh.scale.set(...scale);
            station.add(mesh);
            return mesh;
        };
        const box = (size, position, material = hull, rotation = [0, 0, 0]) => add(unitBox, material, position, rotation, size);
        const cylinder = (radiusTop, radiusBottom, height, position, material = hull, rotation = [0, 0, 0], segments = 24) => add(
            cachedGeometry(`c:${radiusTop}:${radiusBottom}:${height}:${segments}`, () => new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 2, false)),
            material,
            position,
            rotation,
        );
        const torus = (radius, tube, position, material = trim, rotation = [0, 0, 0]) => add(
            cachedGeometry(`t:${radius}:${tube}`, () => new THREE.TorusGeometry(radius, tube, 12, 56)),
            material,
            position,
            rotation,
        );
        const sphere = (radius, position, material = hull, scale = [1, 1, 1]) => add(unitSphere, material, position, [0, 0, 0], scale.map((axis) => axis * radius));
        const beam = (from, to, radius = 0.025, material = dark) => {
            const a = new THREE.Vector3(...from);
            const b = new THREE.Vector3(...to);
            const delta = b.clone().sub(a);
            const length = delta.length();
            const midpoint = a.add(b).multiplyScalar(0.5);
            const mesh = add(unitBeam, material, [midpoint.x, midpoint.y, midpoint.z], [0, 0, 0], [radius, length, radius]);
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
            return mesh;
        };
        const beacon = (position, size = 0.038) => sphere(size, position, light);
        const window = (size, position, rotation = [0, 0, 0]) => box(size, position, windowMaterial, rotation);
        const dock = (position, radius = 0.16, rotation = [0, 0, 0]) => {
            torus(radius, radius * 0.13, position, trim, rotation);
            torus(radius * 0.73, radius * 0.035, [position[0], position[1], position[2] + 0.006], windowMaterial, rotation);
        };
        const radiator = (center, size = [0.72, 0.035, 0.34], rotation = [0, 0, 0]) => {
            box(size, center, radiatorMaterial, rotation);
            const horizontal = size[0] >= size[2];
            for (const offset of [-0.36, -0.12, 0.12, 0.36]) {
                const x = horizontal ? center[0] + offset * size[0] : center[0];
                const z = horizontal ? center[2] : center[2] + offset * size[2];
                box(horizontal ? [0.012, size[1] * 1.9, size[2] * 1.03] : [size[0] * 1.03, size[1] * 1.9, 0.012], [x, center[1], z], pale, rotation);
            }
        };
        const trussBox = (center, half = [0.4, 0.28, 0.3], radius = 0.018, material = dark) => {
            const [cx, cy, cz] = center;
            const [hx, hy, hz] = half;
            const corners = [
                [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz],
                [cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz],
                [cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz],
                [cx - hx, cy + hy, cz + hz], [cx + hx, cy + hy, cz + hz],
            ];
            [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7], [0, 3], [4, 7]].forEach(([a, b]) => beam(corners[a], corners[b], radius, material));
        };

        switch (id) {
            case 'cairn': {
                // Patchwork racing yard: a long service spine, three open start
                // hoops, salvage pods and an intentionally uneven workshop side.
                box([0.22, 0.2, 2.72], [0, 0, 0], dark);
                box([0.34, 0.1, 2.48], [0, 0.12, 0], hull);
                [-0.94, 0, 0.94].forEach((z, hoopIndex) => {
                    torus(0.48, 0.052, [0, 0, z], hoopIndex === 1 ? trim : pale);
                    torus(0.405, 0.012, [0, 0, z + 0.012], windowMaterial);
                    for (let index = 0; index < 8; index += 1) {
                        const angle = index / 8 * Math.PI * 2;
                        const inner = [Math.cos(angle) * 0.49, Math.sin(angle) * 0.49, z];
                        const outer = [Math.cos(angle) * 0.61, Math.sin(angle) * 0.61, z + (index % 2 ? 0.08 : -0.08)];
                        beam(inner, outer, 0.017, index % 2 ? dark : hull);
                        if (index % 2 === 0)
                            beacon([Math.cos(angle) * 0.535, Math.sin(angle) * 0.535, z + 0.025], 0.026);
                    }
                });
                box([1.18, 0.16, 0.44], [0, -0.25, -0.32], hull);
                trussBox([0, -0.28, -0.32], [0.64, 0.16, 0.28], 0.018);
                [[-0.58, 0.19, -0.52], [-0.49, 0.22, 0.24], [0.48, -0.04, 0.34], [0.57, 0.08, -0.2]].forEach((position, index) => {
                    box(index % 2 ? [0.42, 0.27, 0.42] : [0.52, 0.31, 0.5], position, index === 2 ? dark : hull, [0.04 * index, 0.07 * (index - 1), index % 2 ? 0.08 : -0.05]);
                    window([0.012, 0.055, 0.24], [position[0] + (position[0] < 0 ? -0.23 : 0.23), position[1] + 0.04, position[2]]);
                });
                [-0.72, 0.72].forEach((x, side) => {
                    beam([x * 0.35, 0, 0.58], [x, 0.03, 0.74], 0.035, hull);
                    cylinder(0.13, 0.13, 0.52, [x, 0.04, 0.75], pale, [0, 0, Math.PI / 2]);
                    cylinder(0.155, 0.155, 0.04, [x + (side ? 0.27 : -0.27), 0.04, 0.75], trim, [0, 0, Math.PI / 2]);
                });
                radiator([-0.78, -0.12, -0.82], [0.46, 0.025, 0.3], [0.08, 0.12, -0.12]);
                radiator([0.77, 0.19, 0.82], [0.48, 0.025, 0.28], [-0.06, -0.15, 0.08]);
                dock([0, -0.05, -1.4], 0.15);
                dock([0, 0.02, 1.4], 0.15);
                for (let z = -1.18; z <= 1.18; z += 0.24)
                    window([0.17, 0.025, 0.045], [0, 0.185, z]);
                break;
            }
            case 'argent': {
                // Monumental shipworks: three genuinely open drydocks hung from
                // a dense cross-braced yard, with cranes and a habitation drum.
                box([2.82, 0.14, 0.14], [0, 0, 0], dark);
                box([2.5, 0.055, 0.26], [0, 0.18, 0], hull);
                [-0.9, 0, 0.9].forEach((x, index) => {
                    trussBox([x, 0, 0], [0.23, 0.56, 0.51], 0.026, index === 1 ? pale : hull);
                    torus(0.43, 0.025, [x, 0, -0.52], trim, [0, Math.PI / 2, 0]);
                    [-0.36, 0, 0.36].forEach((y) => {
                        beam([x - 0.23, y, -0.51], [x + 0.23, -y, 0.51], 0.014, dark);
                        window([0.09, 0.025, 0.04], [x, y + 0.08, -0.545]);
                    });
                    const craneX = x + (index === 1 ? 0.16 : -0.16);
                    beam([craneX, 0.57, -0.5], [craneX, 0.83, 0.18], 0.024, trim);
                    beam([craneX, 0.83, 0.18], [craneX, 0.2, 0.26], 0.012, pale);
                    beacon([x, 0.64, index % 2 ? -0.52 : 0.52], 0.03);
                });
                cylinder(0.23, 0.23, 0.7, [0.08, -0.7, 0], hull, [0, 0, Math.PI / 2], 32);
                torus(0.245, 0.025, [-0.27, -0.7, 0], trim, [0, Math.PI / 2, 0]);
                torus(0.245, 0.025, [0.43, -0.7, 0], trim, [0, Math.PI / 2, 0]);
                for (let index = 0; index < 10; index += 1) {
                    const angle = index / 10 * Math.PI * 2;
                    window([0.035, 0.06, 0.08], [0.08, -0.7 + Math.cos(angle) * 0.225, Math.sin(angle) * 0.225], [0, 0, angle]);
                }
                box([0.46, 0.3, 0.38], [-1.23, 0.24, 0.22], pale);
                dock([-1.47, 0.24, 0.22], 0.14, [0, Math.PI / 2, 0]);
                radiator([1.2, -0.44, 0.46], [0.5, 0.025, 0.36], [0.12, -0.18, 0]);
                radiator([-1.15, -0.4, -0.45], [0.48, 0.025, 0.34], [-0.08, 0.14, 0]);
                break;
            }
            case 'gatehouse-twelve': {
                // Customs fortress: a clear scanner throat between armored
                // bastions, inspection piers and layered sensor architecture.
                torus(0.67, 0.075, [0, 0, 0], pale);
                torus(0.555, 0.025, [0, 0, 0.035], trim);
                torus(0.47, 0.012, [0, 0, 0.06], windowMaterial);
                for (let index = 0; index < 12; index += 1) {
                    const angle = index / 12 * Math.PI * 2;
                    box([0.2, 0.11, 0.18], [Math.cos(angle) * 0.69, Math.sin(angle) * 0.69, 0], index % 3 ? hull : trim, [0, 0, angle]);
                    beam([Math.cos(angle) * 0.47, Math.sin(angle) * 0.47, -0.05], [Math.cos(angle) * 0.63, Math.sin(angle) * 0.63, 0], 0.018, dark);
                }
                box([2.35, 0.16, 0.2], [0, 0, -0.06], dark);
                [-0.94, 0.94].forEach((x, side) => {
                    box([0.5, 0.58, 0.66], [x, 0, 0], hull);
                    box([0.38, 0.7, 0.48], [x, 0, -0.08], dark);
                    trussBox([x, 0, 0], [0.28, 0.42, 0.4], 0.018, pale);
                    dock([x + (side ? 0.27 : -0.27), -0.18, 0.08], 0.13, [0, Math.PI / 2, 0]);
                    for (let y = -0.22; y <= 0.28; y += 0.125)
                        window([0.02, 0.055, 0.22], [x + (side ? 0.256 : -0.256), y, 0.08]);
                    radiator([x, -0.54, -0.02], [0.42, 0.025, 0.4]);
                    beacon([x, 0.47, 0.33], 0.045);
                });
                box([0.34, 0.28, 0.66], [0, 0.91, 0], pale);
                cylinder(0.26, 0.07, 0.12, [0, 1.13, 0.05], trim, [Math.PI / 2, 0, 0], 32);
                beam([0, 0.92, 0], [0, 1.38, 0], 0.025, dark);
                beacon([0, 1.4, 0], 0.045);
                break;
            }
            case 'cinder': {
                // Vertical refinery: furnace stack, tank farm, pipe bridges,
                // heat radiators and an unmistakable flare-tower crown.
                cylinder(0.34, 0.42, 1.76, [0, 0, 0], hull, [0, 0, 0], 32);
                [-0.62, -0.28, 0.12, 0.48].forEach((y, index) => torus(0.39 - index * 0.015, 0.035, [0, y, 0], index === 2 ? trim : dark, [Math.PI / 2, 0, 0]));
                [[-0.6, -0.17, 0.12], [0.6, -0.1, -0.12], [-0.48, 0.35, -0.34], [0.47, 0.42, 0.34]].forEach((position, index) => {
                    cylinder(0.19 + (index % 2) * 0.03, 0.22 + (index % 2) * 0.03, 0.95 - index * 0.08, position, index % 2 ? dark : pale, [0, 0, 0], 24);
                    torus(0.215 + (index % 2) * 0.03, 0.018, [position[0], position[1] - 0.25, position[2]], trim, [Math.PI / 2, 0, 0]);
                    torus(0.215 + (index % 2) * 0.03, 0.018, [position[0], position[1] + 0.25, position[2]], dark, [Math.PI / 2, 0, 0]);
                    beam([position[0], position[1] + 0.35, position[2]], [0, position[1] + 0.35, 0], 0.026, trim);
                });
                [-1, 1].forEach((side) => {
                    beam([side * 0.25, 0.28, 0], [side * 0.88, 0.36, 0], 0.042, hull);
                    radiator([side * 0.91, 0.36, 0], [0.62, 0.03, 0.52], [0, 0, side * 0.15]);
                    dock([side * 1.19, -0.04, 0], 0.14, [0, Math.PI / 2, 0]);
                });
                cylinder(0.095, 0.14, 0.84, [0.12, 1.22, 0], dark, [0, 0, 0], 20);
                torus(0.145, 0.018, [0.12, 1.42, 0], trim, [Math.PI / 2, 0, 0]);
                sphere(0.09, [0.12, 1.67, 0], windowMaterial, [0.8, 1.35, 0.8]);
                for (let index = 0; index < 12; index += 1) {
                    const angle = index / 12 * Math.PI * 2;
                    window([0.055, 0.07, 0.018], [Math.cos(angle) * 0.345, 0.61, Math.sin(angle) * 0.345], [0, -angle, 0]);
                }
                break;
            }
            case 'torchwell': {
                // Skeletal fuel platform: paired tank cages on a narrow boom,
                // one service bay, radiators and a lonely long-range beacon.
                box([0.14, 0.14, 2.74], [0, 0, 0], dark);
                trussBox([0, 0, 0], [0.22, 0.22, 1.34], 0.016, pale);
                const tanks = [[-0.5, 0.08, -0.72], [0.48, -0.08, -0.45], [-0.46, -0.02, 0.08], [0.5, 0.1, 0.35], [-0.42, 0.04, 0.78], [0.44, -0.06, 0.96]];
                tanks.forEach((position, index) => {
                    cylinder(0.18, 0.18, 0.54, position, index % 3 === 0 ? pale : hull, [0, 0, Math.PI / 2], 24);
                    torus(0.185, 0.016, [position[0] - 0.2, position[1], position[2]], trim, [0, Math.PI / 2, 0]);
                    torus(0.185, 0.016, [position[0] + 0.2, position[1], position[2]], dark, [0, Math.PI / 2, 0]);
                    beam([position[0] * 0.35, 0, position[2]], position, 0.024, hull);
                });
                torus(0.43, 0.055, [0, 0, 1.23], pale);
                torus(0.35, 0.014, [0, 0, 1.245], windowMaterial);
                box([0.96, 0.09, 0.3], [0, -0.32, 0.72], hull);
                trussBox([0, -0.32, 0.72], [0.5, 0.13, 0.19], 0.016);
                radiator([-0.72, 0.34, -0.16], [0.72, 0.024, 0.3], [0.08, 0.04, 0.14]);
                radiator([0.72, -0.34, -0.02], [0.72, 0.024, 0.3], [-0.08, -0.04, -0.14]);
                dock([0, 0, -1.42], 0.14);
                beam([0, 0.1, -1.16], [0, 0.72, -1.16], 0.024, dark);
                beacon([0, 0.76, -1.16], 0.052);
                break;
            }
            case 'nacre': {
                // Precision research station: pearl core, nested articulated
                // instrument rings, isolated labs and symmetric sensor petals.
                sphere(0.43, [0, 0, 0], pale, [1, 0.86, 1]);
                torus(0.78, 0.048, [0, 0, 0], trim, [0.58, 0.18, 0.22]);
                torus(0.66, 0.026, [0, 0, 0], pale, [-0.44, 0.36, -0.18]);
                torus(0.54, 0.014, [0, 0, 0], windowMaterial, [0.16, -0.52, 0.44]);
                const labs = [[0.88, 0.12, 0], [-0.88, -0.12, 0], [0, 0.16, 0.88], [0, -0.16, -0.88], [0.62, -0.24, 0.58], [-0.62, 0.24, -0.58]];
                labs.forEach((position, index) => {
                    beam([position[0] * 0.42, position[1] * 0.42, position[2] * 0.42], [position[0] * 0.86, position[1] * 0.86, position[2] * 0.86], 0.022, pale);
                    sphere(0.19, position, index % 2 ? hull : pale, [1.05, 0.68, 1.05]);
                    torus(0.145, 0.012, position, trim, [Math.PI / 2, index * 0.4, 0]);
                    beacon([position[0] * 1.11, position[1] + 0.13, position[2] * 1.11], 0.026);
                });
                [-1, 1].forEach((side) => {
                    radiator([side * 1.04, 0, side * 0.16], [0.42, 0.02, 0.48], [0.14, side * 0.36, side * 0.22]);
                    cylinder(0.25, 0.045, 0.1, [side * 0.58, 0.58, 0], trim, [0, 0, side * Math.PI / 2], 32);
                });
                for (let index = 0; index < 14; index += 1) {
                    const angle = index / 14 * Math.PI * 2;
                    window([0.025, 0.055, 0.07], [Math.cos(angle) * 0.39, Math.sin(angle) * 0.335, 0], [0, 0, angle]);
                }
                dock([0, 0, -1.14], 0.13);
                break;
            }
            case 'shepherd': {
                // Long-range navigation relay: segmented mast, deep dish,
                // counterweights, sensor cages and redundant antenna arrays.
                cylinder(0.1, 0.14, 2.2, [0, 0, 0], dark, [0, 0, 0], 20);
                [-0.72, -0.24, 0.28, 0.72].forEach((y, index) => {
                    torus(0.21 + (index % 2) * 0.06, 0.022, [0, y, 0], index === 2 ? trim : pale, [Math.PI / 2, 0, 0]);
                    for (let spoke = 0; spoke < 4; spoke += 1) {
                        const angle = spoke / 4 * Math.PI * 2;
                        beam([0, y, 0], [Math.cos(angle) * 0.24, y, Math.sin(angle) * 0.24], 0.012, hull);
                    }
                });
                sphere(0.25, [0, -0.22, 0], hull, [1, 0.72, 1]);
                cylinder(0.5, 0.08, 0.17, [0, 0.77, 0.1], pale, [Math.PI / 2, 0, 0], 40);
                torus(0.37, 0.022, [0, 0.77, 0.19], trim);
                beam([0, 0.77, 0.14], [0, 0.77, 0.56], 0.018, trim);
                beacon([0, 0.77, 0.58], 0.034);
                [-1, 1].forEach((side) => {
                    beam([0, -0.62, 0], [side * 0.72, -0.72, side * 0.08], 0.032, pale);
                    cylinder(0.17, 0.17, 0.42, [side * 0.82, -0.74, side * 0.09], hull, [0, 0, Math.PI / 2], 24);
                    radiator([side * 0.82, -0.33, -side * 0.28], [0.48, 0.02, 0.32], [0.16, side * 0.14, side * 0.2]);
                    for (let tier = 0; tier < 3; tier += 1) {
                        const y = 0.18 + tier * 0.21;
                        beam([0, y, 0], [side * (0.35 + tier * 0.08), y + 0.04, 0], 0.013, dark);
                        beacon([side * (0.35 + tier * 0.08), y + 0.04, 0], 0.022);
                    }
                });
                dock([0, -1.13, 0], 0.12, [Math.PI / 2, 0, 0]);
                beam([0, 0.98, 0], [0, 1.39, 0], 0.018, pale);
                beacon([0, 1.42, 0], 0.048);
                break;
            }
            default:
                sphere(0.38, [0, 0, 0], hull);
                torus(0.7, 0.06, [0, 0, 0]);
                box([1.8, 0.16, 0.16], [0, 0, 0], dark);
                break;
        }
        station.userData.detailMeshes = station.children.length;
        station.userData.highDetail = true;
        return station;
    }
    // A BackSide atmosphere shell with a near-field dome fade. When the camera
    // is inside the shell, the shell surface right around it glows (the sky
    // dome); that dome would cut off abruptly the instant the camera crossed
    // the boundary. Fragments close to the camera are faded out as the camera
    // approaches the boundary, so entering and leaving the atmosphere read as
    // a gradient; the far-side limb glow (the atmosphere seen around the
    // planet from a distance) is untouched.
    createAtmosphereMaterial(atmosphere, shellRadius, intensity, scatterBoost, sunMod, center) {
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(atmosphere) },
                uSunDirection: { value: this.sunDirection.clone().normalize() },
                uShellRadius: { value: shellRadius },
                uCamDist: { value: 0 },
                uIntensity: { value: intensity },
                uScatterBoost: { value: scatterBoost },
                uSunMod: { value: sunMod },
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                varying vec3 vLocalNormal;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    vLocalNormal = normalize(normal);
                    gl_Position = projectionMatrix * viewMatrix * worldPosition;
                }`,
            fragmentShader: `
                uniform vec3 uColor;
                uniform vec3 uSunDirection;
                uniform float uShellRadius;
                uniform float uCamDist;
                uniform float uIntensity;
                uniform float uScatterBoost;
                uniform float uSunMod;
                varying vec3 vWorldPosition;
                varying vec3 vLocalNormal;
                void main() {
                    vec3 view = normalize(cameraPosition - vWorldPosition);
                    float facing = clamp(dot(vLocalNormal, view), -1.0, 1.0);
                    float limb = pow(clamp(1.0 - abs(facing), 0.0, 1.0), 2.7);
                    float scatter = exp(-max(0.0, abs(facing) * 2.6) * 2.8);
                    float sunFacing = smoothstep(-0.55, 1.0, dot(normalize(vLocalNormal), normalize(uSunDirection)));
                    float sunFactor = mix(1.0, mix(0.12, 1.0, sunFacing), uSunMod);
                    float alpha = (limb * 0.82 + scatter * uScatterBoost) * sunFactor * uIntensity;
                    vec3 color = mix(uColor, uColor * (0.34 + sunFacing * 0.9) + vec3(0.035, 0.055, 0.085) * scatter, uSunMod);
                    float shell = uCamDist / uShellRadius;
                    float fade = 1.0 - smoothstep(0.84, 0.995, shell);
                    float camFrag = length(cameraPosition - vWorldPosition) / uShellRadius;
                    float domeMask = mix(fade, 1.0, smoothstep(0.30, 0.55, camFrag));
                    gl_FragColor = vec4(color * alpha * 2.1 * domeMask, alpha * domeMask);
                }`,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
            toneMapped: false,
        });
        this.atmosphereShells.push({ material, center: new THREE.Vector3(...center), shellRadius });
        return material;
    }
    createPlanet(id, color, dark, atmosphere, ringed) {
        const location = LOCATIONS[id];
        const group = new THREE.Group();
        group.position.set(...location.position);
        group.name = `planet-${id}`;
        const surfaceTexture = this.createPixelPanelTexture(`${id}-surface`, color, atmosphere, 'planet', 1024, id === 'azure');
        surfaceTexture.repeat.set(1, 1);
        surfaceTexture.magFilter = THREE.LinearFilter;
        surfaceTexture.minFilter = THREE.LinearMipmapLinearFilter;
        surfaceTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        // Bump from a DOWNSAMPLED, blurred copy of the surface: the full-res
        // height field's screen-space derivatives explode at orbital distance
        // (bump mapping has no mip-aware falloff) and per-texel spikes alias
        // into black speckle on the lit disc. Blur keeps continent-scale
        // relief while killing the spikes.
        let bumpMap = surfaceTexture;
        if (id === 'azure') {
            const bumpCanvas = document.createElement('canvas');
            bumpCanvas.width = 128;
            bumpCanvas.height = 128;
            const bumpContext = bumpCanvas.getContext('2d');
            bumpContext.filter = 'blur(4px)';
            bumpContext.drawImage(surfaceTexture.image, 0, 0, 128, 128);
            bumpMap = new THREE.CanvasTexture(bumpCanvas);
            bumpMap.wrapS = THREE.RepeatWrapping;
            bumpMap.wrapT = THREE.RepeatWrapping;
        }
        const surface = new THREE.Mesh(new THREE.SphereGeometry(location.radius, 192, 128), new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: surfaceTexture,
            // Water reads smoother and slightly specular; land-heavy worlds
            // stay rough and dusty.
            roughness: id === 'azure' ? 0.5 : 0.94,
            metalness: id === 'azure' ? 0.14 : 0.02,
            emissive: dark,
            emissiveIntensity: id === 'azure' ? 0.12 : 0.32,
            bumpMap,
            bumpScale: id === 'azure' ? 2.2 : 18,
            flatShading: false,
            fog: false,
        }));
        surface.name = 'surface';
        group.add(surface);
        // Cloud decks scrapped (0.7.7b): Azure's two layers rendered at 0.11/0.13
        // opacity — invisible at play distances — and the dry worlds' 0.40 deck
        // washed the disc for two extra transparent sphere passes + per-frame
        // rotation updates on weak phones. The atmosphere halo/haze shells below
        // carry the limb depth cue instead.
        // A high, thin haze layer separates the opaque weather deck from the
        // atmosphere shell. It gives the planet an extra depth cue when the
        // camera is close to the limb without adding another raycast target.
        // The halo and haze share one shell shader (with the near-field dome
        // fade) so neither can pop off when the camera crosses its boundary.
        // Halo intensity 1.0 painted a hard soap-bubble edge around the whole
        // disc; 0.62 with a near-zero scatter boost keeps the limb glow and the
        // near-field dome fade but lets the lit surface read through it.
        // Atmosphere shells hug the surface: the limb glow and haze band read
        // as a thin atmosphere (a few percent of the radius), not a separate
        // bubble floating kilometres off the disc.
        const haloMaterial = this.createAtmosphereMaterial(atmosphere, location.radius * 1.06, 0.45, 0.05, 1.0, location.position);
        const hazeMaterial = this.createAtmosphereMaterial(atmosphere, location.radius * 1.02, id === 'azure' ? 0.047 : 0.076, 0.0, 0.0, location.position);
        const haze = new THREE.Mesh(new THREE.SphereGeometry(location.radius * 1.02, 112, 68), hazeMaterial);
        haze.name = 'haze';
        group.add(haze);
        const halo = new THREE.Mesh(new THREE.SphereGeometry(location.radius * 1.06, 96, 56), haloMaterial);
        group.add(halo);
        if (ringed) {
            // Gauntlet ring overhaul: one shader-driven ring instead of three
            // flat unlit discs. The sibling-built region texture (C/B/Cassini/
            // Encke bands) is sampled RADIALLY — RingGeometry's planar UVs used
            // to smear it into straight stripes — and the shader adds a soft
            // planet shadow across the anti-sun side plus sun-side brightening.
            const ring = new THREE.Mesh(new THREE.RingGeometry(location.radius * 1.3, location.radius * 2.74, 256, 1));
            ring.rotation.x = Math.PI / 2.6;
            ring.rotation.z = 0.38;
            // The shader needs the ring plane's TRUE normal. RingGeometry lies
            // in XY (normal +Z); deriving it from the mesh's own quaternion
            // keeps shader and geometry in lockstep — deriving it from the
            // Euler applied to (0,1,0) put the plane ~60° off, which made the
            // radial fade eat whole arcs of the ring.
            ring.material = this.createRingMaterial(location, new THREE.Vector3(0, 0, 1).applyQuaternion(ring.quaternion));
            group.add(ring);
            // Render-only: the ring must not swallow taps from behind the planet.
            ring.raycast = () => undefined;
        }
        // Atmospheric shells are huge transparent spheres that surround the launch
        // point (the halo/outer-halo BackSide spheres even enclose the camera right
        // after departure). If they stay raycastable they win every tap, so the
        // player could never select another target after leaving a planet. Only the
        // solid surface may be picked; the shells are render-only.
        halo.raycast = () => undefined;
        haze.raycast = () => undefined;
        this.tagTargetable(surface, 'location', id);
        this.locationRoot.add(group);
        this.locationMeshes.set(id, group);
    }
    createRingMaterial(location, ringNormal) {
        // One draw call, no lights: radial band profile from the region texture,
        // a soft planet shadow across the anti-sun side of the plane, and
        // sun-facing brightening. All per-fragment math, zero textures updated.
        // `ringNormal` is the mesh's true plane normal (from its quaternion).
        return new THREE.ShaderMaterial({
            uniforms: {
                uRingMap: { value: this.createRingTexture() },
                uSunDirection: { value: this.sunDirection.clone().normalize() },
                uPlanetCenter: { value: new THREE.Vector3(...location.position) },
                uPlanetRadius: { value: location.radius },
                uInnerRadius: { value: location.radius * 1.3 },
                uOuterRadius: { value: location.radius * 2.74 },
                uRingNormal: { value: ringNormal },
                uTint: { value: new THREE.Color(0xcfe2ee) },
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * viewMatrix * worldPosition;
                }`,
            fragmentShader: `
                uniform sampler2D uRingMap;
                uniform vec3 uSunDirection;
                uniform vec3 uPlanetCenter;
                uniform vec3 uRingNormal;
                uniform float uPlanetRadius;
                uniform float uInnerRadius;
                uniform float uOuterRadius;
                uniform vec3 uTint;
                varying vec3 vWorldPosition;
                void main() {
                    vec3 toFrag = vWorldPosition - uPlanetCenter;
                    vec3 radial = toFrag - uRingNormal * dot(toFrag, uRingNormal);
                    float r = length(radial);
                    float t = clamp((r - uInnerRadius) / (uOuterRadius - uInnerRadius), 0.0, 1.0);
                    vec4 band = texture2D(uRingMap, vec2(t, 0.5));
                    float alpha = band.a;
                    alpha *= smoothstep(0.0, 0.035, t) * (1.0 - smoothstep(0.955, 1.0, t));
                    if (alpha < 0.004)
                        discard;
                    // Analytic planet occlusion: the depth buffer cannot separate
                    // the ring plane from the surface at orbital range (near
                    // 0.08 / far 2e6 leaves kilometre-scale precision out there,
                    // so the far half of the ring passed the depth test and drew
                    // straight across the disc). Ray-test the camera→fragment
                    // segment against the planet sphere instead — exact at any
                    // distance, with a soft fade at the grazing limb so the cut
                    // doesn't alias. cameraPosition is a built-in uniform.
                    // Impact-parameter form via the CROSS product: the ray
                    // LINE's distance from the center is |oc × d| computed
                    // directly, so its precision at |camera-center| ~ 1e5 keeps
                    // ~7 digits where the naive b²−c discriminant (or even
                    // |oc|² − (oc·d)²) cancels catastrophically for grazing
                    // rays. oc points from the planet TO the camera, so for a
                    // ray aimed at the planet camAlong = oc·d is NEGATIVE and
                    // tHit = −camAlong − sqrt(r² − impact²) is the near-surface
                    // hit distance along the ray.
                    vec3 rayDir = vWorldPosition - cameraPosition;
                    float rayLen = length(rayDir);
                    rayDir /= rayLen;
                    vec3 oc = cameraPosition - uPlanetCenter;
                    float camAlong = dot(oc, rayDir);
                    vec3 impactVec = cross(oc, rayDir);
                    float impact2 = dot(impactVec, impactVec);
                    float r2 = uPlanetRadius * uPlanetRadius;
                    if (impact2 < r2) {
                        float tHit = -camAlong - sqrt(r2 - impact2);
                        if (tHit > 0.0 && tHit < rayLen) {
                            // The surface stands between the camera and this
                            // fragment: fade the alpha out across a
                            // view-distance-scaled band so the limb crossing
                            // stays smooth. (1 − smoothstep: fragments beyond
                            // the hit, rayLen − tHit > 0, must be HIDDEN.)
                            float fade = max(uPlanetRadius * 0.02, rayLen * 0.0015);
                            alpha *= 1.0 - smoothstep(-fade, fade, rayLen - tHit);
                            if (alpha < 0.004)
                                discard;
                        }
                    }
                    // Planet shadow: on the anti-sun side of the center, inside
                    // the shadow cylinder, the rings drop to 18% light.
                    vec3 sunDir = normalize(uSunDirection);
                    float along = dot(toFrag, sunDir);
                    float perp = length(toFrag - sunDir * along);
                    float shadow = mix(0.18, 1.0, smoothstep(uPlanetRadius * 0.92, uPlanetRadius * 1.14, perp));
                    shadow = mix(shadow, 1.0, smoothstep(-uPlanetRadius * 0.4, uPlanetRadius * 1.6, along));
                    float face = abs(dot(uRingNormal, sunDir));
                    float bright = 0.62 + 0.38 * face;
                    vec3 color = uTint * (0.72 + 0.5 * band.r) * bright * shadow;
                    gl_FragColor = vec4(color, alpha * 0.66);
                }`,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            fog: false,
            toneMapped: false,
        });
    }
    createRingTexture() {
        // Overhauled Azure ring plate: real ring systems read as MACRO regions
        // (dim C, bright B, the Cassini division, A with its Encke gap) each
        // filled with dozens of fine stochastic bands — one gradient of noise
        // reads as static, not as ice. 1024x32 so mipmaps stay crisp.
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 32;
        const context = canvas.getContext('2d');
        const rng = seededRandom('azure-ring-bands');
        // Macro regions: [start, end, base luminance, fine-band density].
        const regions = [
            { start: 0.0, end: 0.09, lum: 0.30, density: 0.5 },   // C ring: dim rubble
            { start: 0.10, end: 0.44, lum: 0.92, density: 1.0 },  // B ring: brightest
            { start: 0.44, end: 0.485, lum: 0.04, density: 0.2 }, // Cassini division
            { start: 0.49, end: 0.80, lum: 0.68, density: 0.85 }, // A ring
            { start: 0.795, end: 0.815, lum: 0.06, density: 0.2 },// Encke gap
            { start: 0.82, end: 0.97, lum: 0.5, density: 0.6 },   // outer A
            { start: 0.975, end: 1.0, lum: 0.22, density: 0.4 },  // fringe
        ];
        const gradient = context.createLinearGradient(0, 0, 1024, 0);
        for (const region of regions) {
            const bands = Math.round(14 + region.density * 46);
            let cursor = region.start;
            while (cursor < region.end) {
                const width = Math.min(region.end - cursor, 0.0022 + rng() * 0.010 * (0.4 + region.density));
                const end = cursor + width;
                const wobble = (rng() - 0.5) * 0.34;
                const alpha = Math.max(0, Math.min(1, (region.lum + wobble) * (0.55 + rng() * 0.45)));
                gradient.addColorStop(Math.min(1, cursor), `rgba(255, 255, 255, ${alpha.toFixed(3)})`);
                gradient.addColorStop(Math.min(1, end), `rgba(255, 255, 255, ${(alpha * 0.78).toFixed(3)})`);
                cursor = end + rng() * 0.0035;
            }
        }
        context.fillStyle = gradient;
        context.fillRect(0, 0, 1024, 32);
        // Same mip-bleed guard as the cloud decks: keep RGB white under the
        // alpha so the distant ring dims instead of speckling black.
        this.opaqueRgbUnderAlpha(context, 1024, 32);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.generateMipmaps = true;
        return texture;
    }
    createHelixStation() {
        const location = LOCATIONS.helix;
        const group = createVoxelStationModel('helix');
        group.position.set(...location.position);
        group.rotation.set(0.18, 0.45, -0.08);
        group.scale.setScalar(10);
        this.makeFogExempt(group);
        this.toneStationGlow(group);
        this.tagTargetable(group, 'location', 'helix');
        this.locationRoot.add(group);
        this.locationMeshes.set('helix', group);
    }
    createRookStation() {
        const location = LOCATIONS.rook;
        const group = createVoxelStationModel('rook');
        group.position.set(...location.position);
        group.rotation.set(-0.08, -0.36, 0.12);
        group.scale.setScalar(10);
        this.makeFogExempt(group);
        this.toneStationGlow(group);
        this.tagTargetable(group, 'location', 'rook');
        this.locationRoot.add(group);
        this.locationMeshes.set('rook', group);
    }
    makeFogExempt(root) {
        root.traverse((child) => {
            const material = child.material;
            if (!material)
                return;
            const materials = Array.isArray(material) ? material : [material];
            materials.forEach((entry) => {
                entry.fog = false;
            });
        });
    }
    toneStationGlow(root) {
        // Stations are ten times the size of a fighter, so the ship-grade fresnel
        // rim and additive window glow read as an overexposed halo. Dim both so the
        // station keeps its neon edges without drowning the bloom pass.
        root.traverse((child) => {
            if (child.name === 'voxel-glow') {
                const material = child.material;
                if (material) {
                    material.transparent = true;
                    material.opacity = 0.55;
                }
                return;
            }
            const material = child.material;
            if (material && material.type === 'ShaderMaterial' && material.uniforms && material.uniforms.uIntensity)
                material.uniforms.uIntensity.value = 0.42;
        });
    }
    createAsteroids() {
        // Several distinct distorted base rocks so the belt reads as varied terrain
        // rather than one rescaled boulder repeated hundreds of times.
        // The deformed-icosahedron base meshes are shared with the sim's hard
        // collision (worldData.getAsteroidBaseMeshes) so a bump lands exactly on
        // the rendered surface.
        const geometries = getAsteroidBaseMeshes().map((mesh) => mesh.geometry);
        // Three asteroid material kinds: iron (mid-grade metallic sand),
        // ice (pale frozen, drifts mostly), and dark (carbonaceous, monoliths/rock-crown).
        // Each gets its own pixel texture and slightly different roughness so a
        // belt cluster reads as varied terrain instead of one repeated rock.
        const ironMap = this.createPixelPanelTexture('shardbelt-iron', 0x54585d, 0xb8a98a, 'rock', 128);
        ironMap.repeat.set(3.4, 3.4);
        const ironMaterial = new THREE.MeshStandardMaterial({
            color: 0xb0b8c0,
            map: ironMap,
            // Matte: flat-shaded facets sweeping through a sharp GGX highlight
            // read as flickering light points in the belt — rocks are diffuse.
            roughness: 1,
            metalness: 0.08,
            bumpMap: ironMap,
            bumpScale: 1.15,
            flatShading: true,
            vertexColors: true,
        });
        const iceMap = this.createPixelPanelTexture('shardbelt-ice', 0xc7d6e2, 0x8eb6cc, 'rock', 128);
        iceMap.repeat.set(3.4, 3.4);
        const iceMaterial = new THREE.MeshStandardMaterial({
            color: 0xd6e6f0,
            map: iceMap,
            roughness: 0.85,
            metalness: 0.02,
            bumpMap: iceMap,
            bumpScale: 0.72,
            flatShading: true,
            vertexColors: true,
            emissive: 0x0a1822,
            emissiveIntensity: 0.18,
        });
        const darkMap = this.createPixelPanelTexture('shardbelt-dark', 0x232027, 0xa4553a, 'rock', 128);
        darkMap.repeat.set(3.4, 3.4);
        const darkMaterial = new THREE.MeshStandardMaterial({
            color: 0x6a5a5e,
            map: darkMap,
            roughness: 1,
            metalness: 0.04,
            bumpMap: darkMap,
            bumpScale: 1.35,
            flatShading: true,
            vertexColors: true,
        });
        const kindPalettes = {
            iron: { base: 0x9aa4b0, accent: 0xd0a060, scan: 0xc4ad7a },
            ice:  { base: 0xb8cee0, accent: 0xe6f4ff, scan: 0xa8c4dc },
            dark: { base: 0x5a4a52, accent: 0xb0483a, scan: 0x806868 },
        };
        const kindFor = (id) => {
            if (id.startsWith('rock-crown-')) return 'dark';
            if (id.startsWith('asteroid-monolith-')) return 'dark';
            // Hash the id so each drift and static cluster gets a stable kind
            // but the belt still reads as a mix of iron and ice.
            let hash = 2166136261;
            for (let i = 0; i < id.length; i += 1) {
                hash ^= id.charCodeAt(i);
                hash = (hash * 16777619) >>> 0;
            }
            return (hash & 0xff) < 160 ? 'iron' : 'ice';
        };
        const groups = new Map();
        this.asteroids.forEach((node, index) => {
            const shape = node.shape ?? 0;
            const kind = kindFor(node.id);
            const key = `${shape}:${kind}`;
            const list = groups.get(key) ?? [];
            list.push({ node, index, kind });
            groups.set(key, list);
        });
        const materialByKind = { iron: ironMaterial, ice: iceMaterial, dark: darkMaterial };
        this.asteroidMeshes = [];
        groups.forEach((entries, key) => {
            const [shapeStr, kind] = key.split(':');
            const shape = Number(shapeStr);
            const material = materialByKind[kind];
            const mesh = new THREE.InstancedMesh(geometries[shape % geometries.length], material, entries.length);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.frustumCulled = false;
            mesh.name = `shardbelt-asteroids-${kind}`;
            mesh.userData.targetKind = 'asteroid';
            mesh.userData.asteroidKind = kind;
            mesh.userData.nodeIndices = entries.map((entry) => entry.index);
            this.instanceRoots.get('shardbelt')?.add(mesh);
            this.asteroidMeshes.push({ mesh, entries, kind });
        });
        // Stash the palette cache for updateAsteroidInstances so the per-instance
        // tint logic stays in one place.
        this._asteroidPalettes = kindPalettes;
        this.updateAsteroidInstances();
        return this.asteroidMeshes[0]?.mesh;
    }
    updateAsteroidInstances(movingOnly = false) {
        const color = this._asteroidColor ?? (this._asteroidColor = new THREE.Color());
        const palettes = this._asteroidPalettes;
        for (const { mesh, entries, kind } of this.asteroidMeshes) {
            const palette = palettes[kind] ?? palettes.iron;
            let changed = false;
            entries.forEach(({ node }, instanceIndex) => {
                if (movingOnly && !node.moving)
                    return;
                changed = true;
                this.tmpEuler.set(...node.rotation);
                this.tmpPosition.set(...node.position);
                this.tmpQuaternion.setFromEuler(this.tmpEuler);
                this.tmpScale.set(node.radius * node.scale[0], node.radius * node.scale[1], node.radius * node.scale[2]);
                this.tmpMatrix.compose(this.tmpPosition, this.tmpQuaternion, this.tmpScale);
                mesh.setMatrixAt(instanceIndex, this.tmpMatrix);
                if (movingOnly) {
                    mesh.instanceMatrix.addUpdateRange(instanceIndex * 16, 16);
                }
                else {
                    if (node.id === this.selectedAsteroidId)
                        color.setHex(0xcfe884);
                    else if (node.scanned)
                        color.setHex(palette.scan);
                    else
                        color.setHex(palette.base);
                    mesh.setColorAt(instanceIndex, color);
                }
            });
            if (changed) {
                mesh.instanceMatrix.needsUpdate = true;
                if (!movingOnly && mesh.instanceColor)
                    mesh.instanceColor.needsUpdate = true;
            }
        }
    }
    createGraveyard() {
        const metalMap = this.createPixelPanelTexture('graveyard-metal', 0x4a565a, 0x93b2ad, 'metal');
        metalMap.repeat.set(3.5, 2.2);
        const rustMap = this.createPixelPanelTexture('graveyard-rust', 0x5a4436, 0xc27a48, 'rust');
        rustMap.repeat.set(4.2, 2.6);
        // Route frames are painted structural salvage, not emissive markers.
        // A shared map keeps the extra visual vocabulary cheap on mobile.
        const routeMap = this.createPixelPanelTexture('graveyard-route-paint', 0x625b50, 0xd1b06b, 'route');
        routeMap.repeat.set(5.2, 1.5);
        const distantMap = this.createPixelPanelTexture('graveyard-distant-metal', 0x333c4a, 0x697681, 'metal');
        distantMap.repeat.set(2.8, 1.8);
        const grouped = new Map();
        for (const piece of this.graveyard) {
            if (piece.render === false)
                continue;
            const finish = piece.finish ?? (piece.kind === 'panel' || piece.id.includes('carrier') ? 'rust' : 'metal');
            const key = `${piece.kind}:${finish}`;
            const list = grouped.get(key) ?? [];
            list.push(piece);
            grouped.set(key, list);
        }
        const extrudedProfileGeometry = (profile) => {
            const shape = new THREE.Shape();
            profile.outline.forEach(([x, z], index) => {
                if (index === 0)
                    shape.moveTo(x, z);
                else
                    shape.lineTo(x, z);
            });
            shape.closePath();
            const geometry = new THREE.ExtrudeGeometry(shape, {
                depth: profile.depth,
                steps: 1,
                bevelEnabled: true,
                bevelThickness: profile.bevelThickness,
                bevelSize: profile.bevelSize,
                bevelSegments: 1,
                curveSegments: 1,
            });
            // The outline is authored in local X/Z; rotate the extrusion's
            // local depth into Y so ship silhouettes have a thin vertical hull
            // and the existing oriented-box collision frame remains correct.
            geometry.rotateX(Math.PI / 2);
            geometry.center();
            return geometry;
        };
        const geometryFor = (kind) => {
            switch (kind) {
                case 'engine': {
                    const profile = GRAVEYARD_GEOMETRY_PROFILES.engine;
                    const rimDepth = Math.min(profile.rimDepth, profile.halfHeight * 0.3);
                    const innerTop = Math.max(0.05, profile.radiusTop - profile.wallThickness);
                    const innerBottom = Math.max(0.05, profile.radiusBottom - profile.wallThickness);
                    // LatheGeometry revolves this local-radius/local-Y
                    // section around Y. The final point closes the section so
                    // both open ends get a visible metal rim; the bore itself
                    // remains open for the player's fly-through.
                    const shellProfile = [
                        new THREE.Vector2(profile.radiusBottom, -profile.halfHeight),
                        new THREE.Vector2(profile.radiusBottom, -profile.halfHeight + rimDepth),
                        new THREE.Vector2(profile.radiusTop, profile.halfHeight - rimDepth),
                        new THREE.Vector2(profile.radiusTop, profile.halfHeight),
                        new THREE.Vector2(innerTop, profile.halfHeight),
                        new THREE.Vector2(innerTop, profile.halfHeight - rimDepth),
                        new THREE.Vector2(innerBottom, -profile.halfHeight + rimDepth),
                        new THREE.Vector2(innerBottom, -profile.halfHeight),
                        new THREE.Vector2(profile.radiusBottom, -profile.halfHeight),
                    ];
                    return new THREE.LatheGeometry(shellProfile, 12);
                }
                case 'carrierHull':
                case 'battleshipHull':
                case 'frigateHull':
                case 'bridge':
                    return extrudedProfileGeometry(GRAVEYARD_GEOMETRY_PROFILES[kind]);
                case 'panel': {
                    return extrudedProfileGeometry(GRAVEYARD_GEOMETRY_PROFILES.panel);
                }
                case 'disc': return new THREE.CylinderGeometry(1, 1, 0.16, 14);
                case 'turret': return new THREE.CylinderGeometry(0.72, 1, 0.34, 8);
                case 'ring': {
                    const profile = GRAVEYARD_GEOMETRY_PROFILES.ring;
                    return new THREE.TorusGeometry(profile.majorRadius, profile.tubeRadius, 6, 18);
                }
                case 'spine': return new THREE.BoxGeometry(0.34, 0.34, 1);
                case 'hull': return new THREE.DodecahedronGeometry(0.68, 0);
                case 'beam': return new THREE.OctahedronGeometry(0.68, 0);
                default: return new THREE.BoxGeometry(1, 1, 1);
            }
        };
        const root = this.instanceRoots.get('mourning-line');
        grouped.forEach((pieces, key) => {
            const [kindRaw, finish] = key.split(':');
            const kind = kindRaw;
            const finishStyle = (() => {
                switch (finish) {
                    case 'rust':
                        return { color: 0xbc9f88, map: rustMap, roughness: 0.92, metalness: 0.48 };
                    case 'route-gold':
                        return { color: 0xf0bd68, map: routeMap, roughness: 0.82, metalness: 0.5 };
                    case 'route-ice':
                        return { color: 0xaed6d8, map: routeMap, roughness: 0.8, metalness: 0.58 };
                    case 'route-copper':
                        return { color: 0xe19a66, map: routeMap, roughness: 0.84, metalness: 0.46 };
                    case 'route-teal':
                        return { color: 0x86c6bb, map: routeMap, roughness: 0.8, metalness: 0.54 };
                    case 'route-ash':
                        return { color: 0xb6afb1, map: routeMap, roughness: 0.9, metalness: 0.42 };
                    case 'distant':
                        return { color: 0x727785, map: distantMap, roughness: 0.96, metalness: 0.3 };
                    default:
                        return { color: 0xaeb6ba, map: metalMap, roughness: 0.76, metalness: 0.74 };
                }
            })();
            const material = new THREE.MeshStandardMaterial({
                ...finishStyle,
                flatShading: true,
                // Every graveyard piece can be viewed from behind while the
                // player flies through the cloud. This matters for thin slabs,
                // open-ended engines, and the other low-poly wreck shapes: a
                // reverse face must keep its texture instead of disappearing.
                side: THREE.DoubleSide,
            });
            const mesh = new THREE.InstancedMesh(geometryFor(kind), material, pieces.length);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.frustumCulled = false;
            mesh.name = `graveyard-${key}`;
            root?.add(mesh);
            this.graveyardBatches.push({ mesh, pieces });
        });
        this.updateGraveyardInstances();
    }
    // The two adapted wreck files are deliberately absent from the install
    // cache and boot preload. They begin loading when the surrounding field
    // first becomes visible; one frigate model is cloned for both casualties.
    ensureGraveyardModels() {
        if (this.graveyardModelLoading || this.graveyardModelMeshes.length)
            return this.graveyardModelLoading;
        const files = [...new Set(GRAVEYARD_MODEL_WRECKS.map((entry) => entry.file))];
        this.graveyardModelLoading = Promise.all(files.map(async (file) => {
            try {
                return [file, await loadGlb(file)];
            }
            catch (error) {
                console.warn(`Graveyard wreck ${file} failed to load.`, error);
                return [file, null];
            }
        })).then((loaded) => {
            const models = new Map(loaded);
            const root = this.instanceRoots.get('mourning-line');
            const center = LOCATIONS['mourning-line'].position;
            for (const config of GRAVEYARD_MODEL_WRECKS) {
                const source = models.get(config.file);
                if (!source || !root)
                    continue;
                const wreck = source.clone(true);
                wreck.traverse((child) => {
                    if (!(child.material instanceof THREE.MeshStandardMaterial))
                        return;
                    const material = child.material.clone();
                    // The wreck texture already carries a pale, desaturated
                    // battlefield wash. Preserve it instead of multiplying it
                    // by the old near-black soot tint.
                    const ember = material.emissive.r + material.emissive.g + material.emissive.b >= 0.001;
                    if (!ember && material.map)
                        material.color.lerp(new THREE.Color(0xe7e9e5), 0.18);
                    material.roughness = Math.max(0.88, material.roughness);
                    material.metalness = Math.min(0.48, material.metalness);
                    material.side = THREE.DoubleSide;
                    child.material = material;
                });
                wreck.name = config.id;
                wreck.position.set(center[0] + config.local[0], center[1] + config.local[1], center[2] + config.local[2]);
                wreck.rotation.set(...config.rotation);
                wreck.scale.setScalar(config.scale);
                root.add(wreck);
                this.graveyardModelMeshes.push(wreck);
            }
            this.updateGraveyardModelVisibility();
            return this.graveyardModelMeshes;
        });
        return this.graveyardModelLoading;
    }
    updateGraveyardModelVisibility() {
        const root = this.instanceRoots.get('mourning-line');
        const rootVisible = Boolean(root?.visible && this.systemId === 'helios-verge');
        const cam = this.camera.position;
        for (const wreck of this.graveyardModelMeshes) {
            const dx = wreck.position.x - cam.x;
            const dy = wreck.position.y - cam.y;
            const dz = wreck.position.z - cam.z;
            wreck.visible = rootVisible && dx * dx + dy * dy + dz * dz <= DEBRIS_CULL_RANGE_SQ;
        }
    }
    updateGraveyardInstances(movingOnly = false) {
        const cam = this.camera.position;
        for (const batch of this.graveyardBatches) {
            let changed = false;
            batch.pieces.forEach((piece, index) => {
                const dx = piece.position[0] - cam.x;
                const dy = piece.position[1] - cam.y;
                const dz = piece.position[2] - cam.z;
                const culled = dx * dx + dy * dy + dz * dz > DEBRIS_CULL_RANGE_SQ;
                const stateChanged = piece._culled !== culled;
                // Full pass rewrites only pieces whose cull state flipped;
                // the moving pass additionally rewrites visible drifting pieces.
                // Culled pieces keep their hidden matrix until they drift back
                // into range (the flip then rebuilds it from live state).
                if (!stateChanged && (movingOnly ? !piece.moving || culled : true))
                    return;
                piece._culled = culled;
                changed = true;
                this.tmpPosition.set(...piece.position);
                this.tmpEuler.set(...piece.rotation);
                this.tmpQuaternion.setFromEuler(this.tmpEuler);
                this.tmpScale.set(...(culled ? HIDDEN_SCALE : piece.scale));
                this.tmpMatrix.compose(this.tmpPosition, this.tmpQuaternion, this.tmpScale);
                batch.mesh.setMatrixAt(index, this.tmpMatrix);
            });
            if (changed)
                batch.mesh.instanceMatrix.needsUpdate = true;
        }
    }
    createWreckNodes() {
        // Salvage nodes are solid chunks of the wreck, not wireframe markers: a
        // handful of irregular geometries and a value tint read as debris worth
        // extracting rather than "yellow lines forming a shape".
        const root = this.instanceRoots.get('mourning-line');
        // Brighter base + stronger accent so the panel/dirt detail actually
        // reads on a small chunk instead of collapsing into a flat dark blob.
        // The material color stays a light value tint (it multiplies the map),
        // which keeps the detail visible rather than crushing it into shadow.
        const scrapMap = this.createPixelPanelTexture('wreck-node-scrap', 0x5c6a70, 0xa8b4ba, 'metal', 96);
        scrapMap.repeat.set(2.2, 2.2);
        const rustMap = this.createPixelPanelTexture('wreck-node-rust', 0x5c4638, 0xc48152, 'rust', 96);
        rustMap.repeat.set(2.2, 2.2);
        const geometries = [
            new THREE.IcosahedronGeometry(1, 1),
            new THREE.DodecahedronGeometry(1, 0),
            new THREE.BoxGeometry(1.2, 0.7, 1.6),
            new THREE.CylinderGeometry(0.55, 0.8, 1.5, 8),
        ];
        // Two value-tinted materials instead of one per chunk: tech wrecks
        // (arms/electronics) get the warm rust look, bulk wrecks (scrap/
        // machinery) the cool scrap grey. Sharing materials keeps 64 nodes
        // from becoming 64 state changes per frame.
        const techMaterial = new THREE.MeshStandardMaterial({
            color: 0xffe2a8,
            map: rustMap,
            roughness: 0.84,
            metalness: 0.42,
            flatShading: true,
            bumpMap: rustMap,
            bumpScale: 1.05,
            emissive: 0x000000,
            emissiveIntensity: 0,
            side: THREE.DoubleSide,
        });
        const bulkMaterial = new THREE.MeshStandardMaterial({
            color: 0xd4dce0,
            map: scrapMap,
            roughness: 0.84,
            metalness: 0.6,
            flatShading: true,
            bumpMap: scrapMap,
            bumpScale: 0.9,
            emissive: 0x000000,
            emissiveIntensity: 0,
            side: THREE.DoubleSide,
        });
        const materialFor = (node) => (node.salvage === 'arms' || node.salvage === 'electronics' ? techMaterial : bulkMaterial);
        const groups = new Map();
        this.wreckNodes.forEach((node, nodeIndex) => {
            let hash = 2166136261;
            for (let index = 0; index < node.id.length; index += 1) {
                hash ^= node.id.charCodeAt(index);
                hash = (hash * 16777619) >>> 0;
            }
            const geometryIndex = hash % geometries.length;
            const tier = materialFor(node) === techMaterial ? 'tech' : 'bulk';
            const key = `${geometryIndex}:${tier}`;
            const entries = groups.get(key) ?? [];
            entries.push({
                node,
                nodeIndex,
                rotation: [(hash % 5) * 0.7, (hash % 7) * 0.9, (hash % 3) * 0.5],
            });
            groups.set(key, entries);
        });
        // Wreck chunks share four geometries and two value-tinted materials.
        // Keeping them as one instanced batch per combination removes dozens of
        // draw calls without changing their shapes or scan targets.
        groups.forEach((entries, key) => {
            const [geometryIndex, tier] = key.split(':');
            const mesh = new THREE.InstancedMesh(geometries[Number(geometryIndex)], tier === 'tech' ? techMaterial : bulkMaterial, entries.length);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.frustumCulled = false;
            mesh.name = `wreck-nodes-${key}`;
            mesh.userData.targetKind = 'wreck';
            mesh.userData.nodeIndices = entries.map((entry) => entry.nodeIndex);
            root?.add(mesh);
            this.wreckBatches.push({ mesh, entries });
            entries.forEach((entry) => this.wreckNodeMeshes.set(entry.node.id, mesh));
        });
        this.updateWreckNodeInstances();
    }
    updateWreckNodeInstances(dt = 0) {
        const cam = this.camera.position;
        for (const batch of this.wreckBatches) {
            let changed = false;
            batch.entries.forEach((entry, index) => {
                const node = entry.node;
                const dx = node.position[0] - cam.x;
                const dy = node.position[1] - cam.y;
                const dz = node.position[2] - cam.z;
                const culled = dx * dx + dy * dy + dz * dz > DEBRIS_CULL_RANGE_SQ && node.id !== this.selectedWreckId;
                const depleted = node.remaining <= 0;
                const hidden = culled || depleted;
                const stateChanged = entry.hidden !== hidden;
                if (entry.initialized && !stateChanged && (hidden || dt <= 0))
                    return;
                if (!hidden && dt > 0) {
                    entry.rotation[0] += dt * 0.22;
                    entry.rotation[1] -= dt * 0.17;
                }
                entry.culled = culled;
                entry.hidden = hidden;
                entry.initialized = true;
                changed = true;
                this.tmpPosition.set(...node.position);
                this.tmpEuler.set(...entry.rotation);
                this.tmpQuaternion.setFromEuler(this.tmpEuler);
                this.tmpScale.setScalar(hidden ? HIDDEN_SCALE[0] : wreckNodeCollisionRadius(node));
                this.tmpMatrix.compose(this.tmpPosition, this.tmpQuaternion, this.tmpScale);
                batch.mesh.setMatrixAt(index, this.tmpMatrix);
            });
            if (changed)
                batch.mesh.instanceMatrix.needsUpdate = true;
        }
    }
    createHyperdriveStreakTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        const crossFade = context.createLinearGradient(0, 0, canvas.width, 0);
        crossFade.addColorStop(0, 'rgba(255,255,255,0)');
        crossFade.addColorStop(0.32, 'rgba(176,232,255,0.24)');
        crossFade.addColorStop(0.5, 'rgba(255,255,255,1)');
        crossFade.addColorStop(0.68, 'rgba(176,232,255,0.24)');
        crossFade.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = crossFade;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = 'destination-in';
        const lengthFade = context.createLinearGradient(0, 0, 0, canvas.height);
        lengthFade.addColorStop(0, 'rgba(255,255,255,0)');
        lengthFade.addColorStop(0.18, 'rgba(255,255,255,0.24)');
        lengthFade.addColorStop(0.7, 'rgba(255,255,255,1)');
        lengthFade.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = lengthFade;
        context.fillRect(0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        return texture;
    }
    createHyperdriveFlareTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        const glow = context.createRadialGradient(128, 128, 0, 128, 128, 128);
        glow.addColorStop(0, 'rgba(255,255,255,1)');
        glow.addColorStop(0.045, 'rgba(244,253,255,0.98)');
        glow.addColorStop(0.16, 'rgba(151,226,255,0.66)');
        glow.addColorStop(0.48, 'rgba(74,146,255,0.18)');
        glow.addColorStop(1, 'rgba(21,54,130,0)');
        context.fillStyle = glow;
        context.fillRect(0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        return texture;
    }
    createHyperdriveFx() {
        const streakCount = this.qualityMode === 'low' ? 44 : this.qualityMode === 'high' ? 88 : 68;
        const ringCount = this.qualityMode === 'low' ? 5 : 7;
        const rng = seededRandom('hyperdrive-world-fx');
        this.reducedHyperdriveMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.hyperdriveFxRoot.name = 'hyperdrive-world-fx';
        this.hyperdriveFxRoot.visible = false;

        this.hyperdriveStreakMaterial = new THREE.MeshBasicMaterial({
            map: this.createHyperdriveStreakTexture(),
            color: 0xb9edff,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
            fog: false,
            side: THREE.DoubleSide,
            toneMapped: false,
        });
        this.hyperdriveStreaks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.hyperdriveStreakMaterial, streakCount);
        this.hyperdriveStreaks.name = 'hyperdrive-streak-field';
        this.hyperdriveStreaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.hyperdriveStreaks.frustumCulled = false;
        this.hyperdriveStreaks.renderOrder = 900;
        this.hyperdriveStreakSeeds = new Float32Array(streakCount * 4);
        const tint = new THREE.Color();
        for (let index = 0; index < streakCount; index += 1) {
            const offset = index * 4;
            this.hyperdriveStreakSeeds[offset] = rng() * Math.PI * 2;
            this.hyperdriveStreakSeeds[offset + 1] = 0.12 + rng() * 0.62;
            this.hyperdriveStreakSeeds[offset + 2] = rng();
            this.hyperdriveStreakSeeds[offset + 3] = 0.72 + rng() * 0.62;
            tint.setRGB(0.78 + rng() * 0.22, 0.88 + rng() * 0.12, 1);
            this.hyperdriveStreaks.setColorAt(index, tint);
        }
        if (this.hyperdriveStreaks.instanceColor)
            this.hyperdriveStreaks.instanceColor.needsUpdate = true;
        this.hyperdriveFxRoot.add(this.hyperdriveStreaks);

        this.hyperdriveRingMaterial = new THREE.MeshBasicMaterial({
            color: 0x91dcff,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
            fog: false,
            side: THREE.DoubleSide,
            toneMapped: false,
        });
        this.hyperdriveRings = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.007, 3, 72), this.hyperdriveRingMaterial, ringCount);
        this.hyperdriveRings.name = 'hyperdrive-compression-rings';
        this.hyperdriveRings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.hyperdriveRings.frustumCulled = false;
        this.hyperdriveRings.renderOrder = 901;
        for (let index = 0; index < ringCount; index += 1)
            this.hyperdriveRings.setColorAt(index, this.hyperdriveRingTint.setRGB(1, 1, 1));
        if (this.hyperdriveRings.instanceColor) {
            this.hyperdriveRings.instanceColor.setUsage(THREE.DynamicDrawUsage);
            this.hyperdriveRings.instanceColor.needsUpdate = true;
        }
        this.hyperdriveFxRoot.add(this.hyperdriveRings);

        this.hyperdriveFlashMaterial = new THREE.SpriteMaterial({
            map: this.createHyperdriveFlareTexture(),
            color: 0xc7f5ff,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
            fog: false,
            toneMapped: false,
        });
        this.hyperdriveFlash = new THREE.Sprite(this.hyperdriveFlashMaterial);
        this.hyperdriveFlash.name = 'hyperdrive-transition-flare';
        this.hyperdriveFlash.position.set(0, 0, -18);
        this.hyperdriveFlash.frustumCulled = false;
        this.hyperdriveFlash.renderOrder = 902;
        this.hyperdriveFxRoot.add(this.hyperdriveFlash);
        // The camera-local group is rendered by WebGL behind the whole DOM HUD.
        // It therefore fills the canopy view while every frame rail and monitor
        // remains clean and readable in front of it.
        this.camera.add(this.hyperdriveFxRoot);
    }
    updateHyperdriveFx(dt) {
        if (!this.hyperdriveStreaks || !this.hyperdriveRings || !this.hyperdriveFlash)
            return;
        const state = this.hyperdriveFxState;
        const progress = this.hyperdriveFxProgress;
        if (state === 'none') {
            this.hyperdriveFxRoot.visible = false;
            this.hyperdriveStreakMaterial.opacity = 0;
            this.hyperdriveRingMaterial.opacity = 0;
            this.hyperdriveFlashMaterial.opacity = 0;
            return;
        }
        this.hyperdriveFxRoot.visible = true;
        this.hyperdriveFxPulse = Math.max(0, this.hyperdriveFxPulse - dt * 2.6);
        let streakOpacity = 0;
        let ringOpacity = 0;
        let flashOpacity = 0;
        let speed = 1;
        let color = 0xa8e8ff;
        if (state === 'spooling') {
            streakOpacity = 0.025 + progress * progress * 0.34;
            ringOpacity = 0.14 + progress * 0.5;
            flashOpacity = Math.max(0, (progress - 0.82) / 0.18) * 0.16;
            speed = 0.35 + progress * 1.6;
        }
        else if (state === 'active') {
            streakOpacity = 0.86;
            ringOpacity = 0.2;
            flashOpacity = 0.035 + this.hyperdriveFxPulse * 0.48;
            speed = 4.5;
        }
        else if (state === 'gate') {
            const envelope = Math.sin(progress * Math.PI);
            streakOpacity = 0.48 + envelope * 0.46;
            ringOpacity = 0.32 + envelope * 0.5;
            flashOpacity = 0.1 + envelope * 0.6;
            speed = 5.8;
            color = 0xd5faff;
        }
        else if (state === 'drop') {
            streakOpacity = progress * 0.58;
            ringOpacity = progress * 0.3;
            flashOpacity = Math.pow(progress, 1.25) * 0.34;
            speed = 2.8;
        }
        else if (state === 'interrupt') {
            streakOpacity = progress * 0.56;
            ringOpacity = progress * 0.46;
            flashOpacity = Math.pow(progress, 1.2) * 0.56;
            speed = 3.4;
            color = 0xff6548;
        }
        const motionScale = this.reducedHyperdriveMotion ? 0.16 : 1;
        this.hyperdriveFxPhase += dt * speed * motionScale;
        this.hyperdriveStreakMaterial.opacity = streakOpacity;
        this.hyperdriveRingMaterial.opacity = ringOpacity;
        this.hyperdriveFlashMaterial.opacity = flashOpacity;
        this.hyperdriveStreakMaterial.color.setHex(color);
        this.hyperdriveRingMaterial.color.setHex(state === 'interrupt' ? 0xff8169 : state === 'gate' ? 0xe3fcff : 0x91dcff);
        this.hyperdriveFlashMaterial.color.setHex(state === 'interrupt' ? 0xff4e32 : state === 'drop' ? 0x9bdfff : 0xd5f8ff);
        const intensity = clamp(streakOpacity / 0.86, 0, 1);
        const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
        const phase = this.hyperdriveFxPhase;
        const streakCount = this.hyperdriveStreaks.count;
        for (let index = 0; index < streakCount; index += 1) {
            const offset = index * 4;
            const angle = this.hyperdriveStreakSeeds[offset] + phase * 0.035;
            const lane = this.hyperdriveStreakSeeds[offset + 1];
            const travel = (this.hyperdriveStreakSeeds[offset + 2] + phase * 0.24) % 1;
            const depth = 170 - travel * 163;
            const near = travel * travel;
            const screenRadius = lane + near * (0.32 + lane * 0.18);
            const radius = screenRadius * depth * tanHalfFov;
            this.tmpPosition.set(Math.cos(angle) * radius * this.camera.aspect, Math.sin(angle) * radius, -depth);
            this.tmpEuler.set(0, 0, angle - Math.PI * 0.5);
            this.tmpQuaternion.setFromEuler(this.tmpEuler);
            const length = depth * (0.017 + intensity * 0.024 + near * 0.086) * this.hyperdriveStreakSeeds[offset + 3];
            const width = depth * (0.001 + intensity * 0.00135);
            this.tmpScale.set(width, length, 1);
            this.tmpMatrix.compose(this.tmpPosition, this.tmpQuaternion, this.tmpScale);
            this.hyperdriveStreaks.setMatrixAt(index, this.tmpMatrix);
        }
        this.hyperdriveStreaks.instanceMatrix.needsUpdate = true;
        const ringCount = this.hyperdriveRings.count;
        for (let index = 0; index < ringCount; index += 1) {
            const travel = (index / ringCount + phase * 0.14) % 1;
            const depth = 150 - travel * 145;
            this.tmpPosition.set(0, 0, -depth);
            this.tmpEuler.set(Math.sin(phase * 0.28 + index) * 0.055, Math.cos(phase * 0.24 + index * 0.7) * 0.045, phase * 0.025);
            this.tmpQuaternion.setFromEuler(this.tmpEuler);
            const radius = 12.5 + intensity * 2;
            this.tmpScale.setScalar(radius);
            this.tmpMatrix.compose(this.tmpPosition, this.tmpQuaternion, this.tmpScale);
            this.hyperdriveRings.setMatrixAt(index, this.tmpMatrix);
            const brightness = 0.14 + Math.pow(travel, 1.45) * 0.86;
            this.hyperdriveRingTint.setRGB(brightness, brightness, brightness);
            this.hyperdriveRings.setColorAt(index, this.hyperdriveRingTint);
        }
        this.hyperdriveRings.instanceMatrix.needsUpdate = true;
        if (this.hyperdriveRings.instanceColor)
            this.hyperdriveRings.instanceColor.needsUpdate = true;
        this.hyperdriveFlash.scale.set(30 * this.camera.aspect, 30, 1);
        this.hyperdriveFxRoot.rotation.z = state === 'interrupt'
            ? Math.sin(phase * 11) * 0.012 * progress
            : Math.sin(phase * 0.35) * 0.006;
    }
    hyperdriveFxSnapshot() {
        return {
            state: this.hyperdriveFxState,
            progress: this.hyperdriveFxProgress,
            rootVisible: this.hyperdriveFxRoot.visible,
            parent: this.hyperdriveFxRoot.parent === this.camera ? 'camera' : 'other',
            streakCount: this.hyperdriveStreaks?.count ?? 0,
            ringCount: this.hyperdriveRings?.count ?? 0,
            streakOpacity: this.hyperdriveStreakMaterial?.opacity ?? 0,
            ringOpacity: this.hyperdriveRingMaterial?.opacity ?? 0,
            flashOpacity: this.hyperdriveFlashMaterial?.opacity ?? 0,
            flashColor: this.hyperdriveFlashMaterial ? `#${this.hyperdriveFlashMaterial.color.getHexString()}` : '',
        };
    }
    createCockpit() {
        // Scrapped: every 3D cockpit mesh (frame rails, console boxes,
        // screen planes, instrument lamps, fasteners, canopy rails, vents,
        // bolts) is gone. The cockpit HUD is now delivered entirely by the
        // cockpit-frame.webp CSS overlay. The only thing we keep here is the
        // grime plane so the canopy still carries faint dirt specks.
        const grimeMaterial = new THREE.MeshBasicMaterial({
            map: this.createGrimeTexture('wayfarer-canopy'),
            transparent: true,
            opacity: 0.06,
            depthTest: false,
            depthWrite: false,
            blending: THREE.NormalBlending,
        });
        const grime = new THREE.Mesh(new THREE.PlaneGeometry(3.72, 2.38), grimeMaterial);
        grime.position.set(0, 0.08, -1.98);
        grime.renderOrder = 1005;
        grime.frustumCulled = false;
        grime.name = 'cockpit-grime';
        this.cockpit.add(grime);
        this.cockpit.traverse((object) => {
            object.frustumCulled = false;
            if (object instanceof THREE.Mesh) {
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                materials.forEach((material) => {
                    material.depthTest = false;
                    material.depthWrite = false;
                });
            }
        });
        this.camera.add(this.cockpit);
        this.cockpit.visible = false;
    }
    createPrismGeometry(points, thickness) {
        const vertices = [];
        const half = thickness * 0.5;
        for (const [x, z] of points)
            vertices.push(x, half, z);
        for (const [x, z] of points)
            vertices.push(x, -half, z);
        const indices = [];
        const count = points.length;
        for (let i = 1; i < count - 1; i += 1)
            indices.push(0, i, i + 1);
        for (let i = 1; i < count - 1; i += 1)
            indices.push(count, count + i + 1, count + i);
        for (let i = 0; i < count; i += 1) {
            const next = (i + 1) % count;
            indices.push(i, count + i, count + next, i, count + next, next);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    }
    engineFlameTexture() {
        // A side-on radial gradient: hot white/yellow core fading to orange
        // then red then transparent. Mapped on a stretched plane behind each
        // engine port so ships get proper exhaust trails in chase views.
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 32;
        const context = canvas.getContext('2d');
        const gradient = context.createLinearGradient(0, 0, 256, 0);
        gradient.addColorStop(0, 'rgba(255, 240, 200, 0)');
        gradient.addColorStop(0.18, 'rgba(255, 200, 110, 0.5)');
        gradient.addColorStop(0.36, 'rgba(255, 150, 70, 0.85)');
        gradient.addColorStop(0.5, 'rgba(255, 100, 50, 0.65)');
        gradient.addColorStop(0.78, 'rgba(200, 60, 40, 0.3)');
        gradient.addColorStop(1, 'rgba(80, 20, 0, 0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 256, 32);
        // Vertical fade so the trail isn't a flat ribbon.
        const vFade = context.createLinearGradient(0, 0, 0, 32);
        vFade.addColorStop(0, 'rgba(0,0,0,1)');
        vFade.addColorStop(0.5, 'rgba(0,0,0,0)');
        vFade.addColorStop(1, 'rgba(0,0,0,1)');
        context.globalCompositeOperation = 'destination-out';
        context.fillStyle = vFade;
        context.fillRect(0, 0, 256, 32);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        this.pixelTextures.add(texture);
        return texture;
    }
    createShipMesh(entity) {
        const variant = shipVariantForEntity(entity);
        const config = GLB_SHIP_CONFIG[variant];
        const voxelVariant = config?.placeholderVariant ?? variant;
        const palette = paletteForEntity(entity);
        const model = createVoxelShipModel(voxelVariant, palette);
        const group = model.group;
        const placeholderScale = config?.placeholderScale ?? 1;
        const baseScale = (variant === 'atlas-freighter' ? 0.92 : entity.role === 'miner' ? 1.04 : entity.role === 'bounty' ? 1.02 : 1) * placeholderScale;
        const engineColor = palette.engine;
        const engineFlareTexture = this.radialTexture(cssHex(engineColor), cssHex(engineColor));
        const flameTex = this.engineFlameTexture();
        const flares = [];
        // Per-port near-field flare (small bright sprite at the engine).
        const trail = [];
        for (const port of model.enginePorts) {
            const flare = new THREE.Sprite(new THREE.SpriteMaterial({
                map: engineFlareTexture,
                transparent: true,
                opacity: variant === 'atlas-freighter' ? ENGINE_FLARE_OPACITY_ATLAS : ENGINE_FLARE_OPACITY,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }));
            flare.position.copy(port).add(new THREE.Vector3(0, 0, 0.18));
            const flareSize = (config?.flareSize ?? (variant === 'atlas-freighter' ? ENGINE_FLARE_SIZE_ATLAS : ENGINE_FLARE_SIZE)) / placeholderScale;
            flare.scale.setScalar(flareSize);
            flare.userData.baseSize = flareSize;
            flare.userData.baseOpacity = config?.flareOpacity ?? (variant === 'atlas-freighter' ? ENGINE_FLARE_OPACITY_ATLAS : ENGINE_FLARE_OPACITY);
            flares.push(flare);
            group.add(flare);
            // Long exhaust trail: a thin plane stretched along the ship's
            // forward axis (z+ on the ship = behind the engine).
            const trailMat = new THREE.MeshBasicMaterial({
                map: flameTex,
                color: engineColor,
                transparent: true,
                opacity: 0.78 * (ENGINE_GLOW_TUNING[variant]?.trailOpacity ?? 1),
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide,
                toneMapped: false,
            });
            const trailLen = (config?.trailLength ?? (variant === 'atlas-freighter' ? 9 : variant === 'kestrel' ? 6 : 7)) / placeholderScale;
            const trailWidth = (config?.trailWidth ?? 0.45) / placeholderScale;
            trailMat.opacity = 0.78 * (config?.trailOpacity ?? ENGINE_GLOW_TUNING[variant]?.trailOpacity ?? 1);
            const trailMesh = new THREE.Mesh(new THREE.PlaneGeometry(trailWidth, trailLen), trailMat);
            trailMesh.position.copy(port).add(new THREE.Vector3(0, 0, trailLen * 0.45));
            trailMesh.rotation.x = Math.PI / 2;
            trailMesh.userData.isTrail = true;
            trail.push(trailMesh);
            group.add(trailMesh);
        }
        this.tagTargetable(group, 'ship', entity.id);
        group.scale.setScalar(baseScale);
        group.userData.baseScale = baseScale;
        group.userData.hullMaterial = model.hullMaterial;
        group.userData.rimMaterial = model.rimMaterial;
        group.userData.variant = variant;
        group.userData.engineFlares = flares;
        group.userData.engineTrails = trail;
        // Cache the emissive hull materials once so the per-frame sync does not
        // walk the whole ship graph looking for them.
        const emissiveMaterials = [];
        group.traverse((object) => {
            if (object.material instanceof THREE.MeshStandardMaterial)
                emissiveMaterials.push(object.material);
        });
        group.userData.emissiveMaterials = emissiveMaterials;
        return group;
    }
    // --- GLB hulls ----------------------------------------------------------
    // Start the per-variant fetches; ships spawn with the voxel placeholder
    // until a variant's model resolves (see swapShipMesh).
    preloadGlbShips() {
        for (const [variant, config] of Object.entries(GLB_SHIP_CONFIG))
            if (config.preload !== false)
                this.ensureGlbShipModel(variant);
    }
    ensureGlbShipModel(variant) {
        if (this.glbShipModels.has(variant) || this.glbShipLoading.has(variant))
            return;
        const config = GLB_SHIP_CONFIG[variant];
        if (!config)
            return;
        const promise = loadGlb(config.path ?? `assets/models/ships/${config.file}`)
            .then((model) => {
                const ready = this.prepareGlbShip(model, config);
                this.glbShipModels.set(variant, ready);
                return ready;
            })
            .catch((error) => {
                console.warn(`GLB hull ${variant} (${config.path ?? config.file}) failed to load; using voxels.`, error);
                this.glbShipModels.set(variant, null);
                return null;
            });
        this.glbShipLoading.set(variant, promise);
    }
    // Bake the per-variant yaw + scale into the shared model so every clone
    // inherits the same flight orientation and world size.
    prepareGlbShip(model, config) {
        model.rotation.y = config.yaw;
        model.scale.setScalar(config.scale);
        return model;
    }
    // A GLB ship with per-ship material tints (faction livery), engine flares
    // and exhaust trails, and the same userData the voxel path feeds the
    // per-frame sync. The model clone (carrying the baked yaw + scale) hangs
    // inside a wrapper the sync transforms freely: syncShips overwrites the
    // mesh's quaternion and scale every frame, which would wipe the yaw and
    // world size if they lived on the same object. Geometry and textures stay
    // shared with the cached model.
    createGlbShipMesh(entity, model, config, variantOverride) {
        const wrapper = new THREE.Group();
        const group = model.clone(true);
        wrapper.add(group);
        const variant = variantOverride ?? shipVariantForEntity(entity);
        const palette = paletteForEntity(entity);
        const tint = new THREE.Color(palette.hull);
        const emissiveMaterials = [];
        group.traverse((child) => {
            if (child.material instanceof THREE.MeshStandardMaterial) {
                const material = child.material.clone();
                if (!config.preserveColor)
                    material.color.copy(tint).lerp(new THREE.Color(0xffffff), 0.45);
                if (entity.race) {
                    // A low self-lit wash keeps the custom race paint readable
                    // while the ships idle at the gathering point and under
                    // the Shardbelt's uneven lighting.
                    material.emissive.copy(tint);
                    material.emissiveIntensity = 0.24;
                }
                child.material = material;
                emissiveMaterials.push(material);
            }
        });
        const baseScale = config.baseScale ?? (variant === 'atlas-freighter' ? 0.92 : entity.role === 'miner' ? 1.04 : entity.role === 'bounty' ? 1.02 : 1);
        const engineColor = palette.engine;
        const engineFlareTexture = this.radialTexture(cssHex(engineColor), cssHex(engineColor));
        const flameTex = this.engineFlameTexture();
        const flares = [];
        const trail = [];
        const rear = new THREE.Vector3(config.rearAxis[0], config.rearAxis[1], config.rearAxis[2]);
        const up = new THREE.Vector3(0, 1, 0);
        const trailLen = config.trailLength ?? (variant === 'atlas-freighter' ? 9 : variant === 'kestrel' ? 6 : 7);
        const trailWidth = config.trailWidth ?? 0.45;
        for (const port of config.enginePorts) {
            const flareOpacity = config.flareOpacity ?? (variant === 'atlas-freighter' ? ENGINE_FLARE_OPACITY_ATLAS : ENGINE_FLARE_OPACITY);
            const flareWorldSize = config.flareSize ?? (variant === 'atlas-freighter' ? ENGINE_FLARE_SIZE_ATLAS : ENGINE_FLARE_SIZE);
            const flare = new THREE.Sprite(new THREE.SpriteMaterial({
                map: engineFlareTexture,
                transparent: true,
                opacity: flareOpacity,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }));
            flare.position.set(port[0], port[1], port[2]);
            flare.scale.setScalar(flareWorldSize / config.scale);
            flare.userData.baseSize = flareWorldSize / config.scale;
            flare.userData.baseOpacity = flareOpacity;
            flares.push(flare);
            group.add(flare);
            // Long exhaust trail: a thin plane stretched along the model's rear
            // axis. Geometry sizes are divided by config.scale because the
            // group carries the world scale (children of it are in model
            // units).
            const trailMat = new THREE.MeshBasicMaterial({
                map: flameTex,
                color: engineColor,
                transparent: true,
                opacity: 0.78 * (config.trailOpacity ?? ENGINE_GLOW_TUNING[variant]?.trailOpacity ?? 1),
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide,
                toneMapped: false,
            });
            const trailMesh = new THREE.Mesh(new THREE.PlaneGeometry(trailWidth / config.scale, trailLen / config.scale), trailMat);
            trailMesh.quaternion.setFromUnitVectors(up, rear);
            trailMesh.position.set(port[0], port[1], port[2]).addScaledVector(rear, (trailLen * 0.45) / config.scale);
            trailMesh.userData.isTrail = true;
            trail.push(trailMesh);
            group.add(trailMesh);
        }
        this.tagTargetable(wrapper, 'ship', entity.id);
        wrapper.userData.baseScale = baseScale;
        wrapper.userData.variant = variant;
        wrapper.userData.engineFlares = flares;
        wrapper.userData.engineTrails = trail;
        wrapper.userData.emissiveMaterials = emissiveMaterials;
        wrapper.userData.glb = true;
        return wrapper;
    }
    // Replace a voxel placeholder with the real hull once its GLB resolves.
    swapShipMesh(entity, voxelMesh, model, variant) {
        const resolvedVariant = variant ?? shipVariantForEntity(entity);
        const glbMesh = this.createGlbShipMesh(entity, model, GLB_SHIP_CONFIG[resolvedVariant], resolvedVariant);
        glbMesh.position.copy(voxelMesh.position);
        glbMesh.quaternion.copy(voxelMesh.quaternion);
        this.dynamicRoot.remove(voxelMesh);
        this.disposeObject(voxelMesh);
        this.dynamicRoot.add(glbMesh);
        this.shipMeshes.set(entity.id, glbMesh);
    }
    // GLB ship clones share geometry and textures with the cached model, so
    // disposal only releases the per-ship material clones (and flare/trail
    // materials). The shared resources die with the renderer.
    disposeGlbShip(mesh) {
        mesh.traverse((child) => {
            if (!(child instanceof THREE.Mesh || child instanceof THREE.Sprite))
                return;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => material?.dispose?.());
        });
    }
    syncShips(entities, alpha = 0) {
        const now = performance.now();
        // Reconcile mesh liveness only when the entity count changed (spawns and
        // deaths) — steady state walks nothing and allocates nothing.
        if (entities.length !== this.shipMeshCount) {
            const live = new Set(entities.map((entity) => entity.id));
            for (const [id, mesh] of this.shipMeshes) {
                if (!live.has(id)) {
                    this.dynamicRoot.remove(mesh);
                    if (mesh.userData.glb)
                        this.disposeGlbShip(mesh);
                    else
                        this.disposeObject(mesh);
                    this.shipMeshes.delete(id);
                }
            }
            this.shipMeshCount = entities.length;
        }
        entities.forEach((entity) => {
            let mesh = this.shipMeshes.get(entity.id);
            const variant = shipVariantForEntity(entity);
            if (GLB_SHIP_CONFIG[variant] && !this.glbShipModels.has(variant) && !this.glbShipLoading.has(variant))
                this.ensureGlbShipModel(variant);
            // A race grid can supply an explicit hull variant even though the
            // entity role remains `trader`. Reconcile a changed variant just
            // like a newly spawned entity so a recycled id cannot keep the old
            // hull shape.
            if (mesh && mesh.userData.variant !== variant) {
                this.dynamicRoot.remove(mesh);
                if (mesh.userData.glb)
                    this.disposeGlbShip(mesh);
                else
                    this.disposeObject(mesh);
                this.shipMeshes.delete(entity.id);
                mesh = undefined;
            }
            if (!mesh) {
                const ready = this.glbShipModels.get(variant);
                if (ready) {
                    mesh = this.createGlbShipMesh(entity, ready, GLB_SHIP_CONFIG[variant], variant);
                }
                else {
                    mesh = this.createShipMesh(entity); // voxel placeholder
                    const loading = this.glbShipLoading.get(variant);
                    if (loading) {
                        const voxelMesh = mesh;
                        loading.then((loaded) => {
                            if (loaded && this.shipMeshes.get(entity.id) === voxelMesh)
                                this.swapShipMesh(entity, voxelMesh, loaded, variant);
                        });
                    }
                }
                this.dynamicRoot.add(mesh);
                this.shipMeshes.set(entity.id, mesh);
            }
            mesh.position.set(...entity.position);
            if (entity.prevPosition && alpha > 0) {
                this.tmpPrevPos.set(entity.prevPosition[0], entity.prevPosition[1], entity.prevPosition[2]);
                mesh.position.lerpVectors(this.tmpPrevPos, mesh.position, alpha);
            }
            mesh.quaternion.set(...entity.rotation);
            if (entity.prevRotation && alpha > 0) {
                this.tmpPrevQuat.set(...entity.prevRotation);
                this.tmpCurQuat.copy(mesh.quaternion);
                mesh.quaternion.copy(this.tmpPrevQuat).slerp(this.tmpCurQuat, alpha);
            }
            const damage = 1 - entity.hull / entity.maxHull;
            const baseScale = Number(mesh.userData.baseScale ?? 1);
            // Older/special entities may not carry spawnTime. A NaN phase
            // makes the whole object matrix NaN and silently draws nothing,
            // even though mesh.visible remains true.
            const spawnPhase = Number.isFinite(entity.spawnTime) ? entity.spawnTime : 0;
            mesh.scale.setScalar(baseScale * (1 + Math.sin(now * 0.013 + spawnPhase) * 0.006));
            mesh.visible = entity.hull > 0;
            const emissiveIntensity = entity.race ? 0.24 + damage * 0.12 : entity.hostile ? 0.18 + damage * 0.28 : damage * 0.12;
            const emissiveMaterials = mesh.userData.emissiveMaterials;
            if (emissiveMaterials) {
                for (const material of emissiveMaterials)
                    material.emissiveIntensity = emissiveIntensity;
            }
            const rimMaterial = mesh.userData.rimMaterial;
            if (rimMaterial?.uniforms) {
                rimMaterial.uniforms.uIntensity.value = entity.hostile ? 0.7 + damage * 0.2 : 0.62;
            }
            const flares = mesh.userData.engineFlares;
            if (flares) {
                const variant = mesh.userData.variant;
                const glow = ENGINE_GLOW_TUNING[variant];
                const boost = entity.burning ? ENGINE_FLARE_BURNING_BOOST : entity.race ? 1.65 : entity.hostile && entity.targetId ? ENGINE_FLARE_HOSTILE_BOOST : 1;
                const baseOpacity = (flares[0]?.userData.baseOpacity ?? (variant === 'atlas-freighter' ? ENGINE_FLARE_OPACITY_ATLAS : ENGINE_FLARE_OPACITY)) * (glow?.flareOpacity ?? 1);
                const baseSize = (flares[0]?.userData.baseSize ?? (variant === 'atlas-freighter' ? ENGINE_FLARE_SIZE_ATLAS : ENGINE_FLARE_SIZE)) * (glow?.flareScale ?? 1);
                for (const flare of flares) {
                    flare.material.opacity = baseOpacity * boost;
                    flare.scale.setScalar(baseSize * (boost > 1 ? 1.08 : 1));
                }
            }
        });
    }
    syncProjectiles(projectiles, store, alpha = 0) {
        // Meshes are keyed by flat-store slot; reconcile only when the live count
        // changes so steady state allocates nothing per frame.
        if (projectiles.length !== this.projectileMeshCount) {
            const live = new Set(projectiles.map((entity) => entity.slot));
            for (const [slot, mesh] of this.projectileMeshes) {
                if (!live.has(slot)) {
                    this.dynamicRoot.remove(mesh);
                    this.disposeObject(mesh);
                    this.projectileMeshes.delete(slot);
                }
            }
            this.projectileMeshCount = projectiles.length;
        }
        const pos = store.pos;
        const vel = store.vel;
        const prevPos = store.prevPos;
        projectiles.forEach((projectile) => {
            let mesh = this.projectileMeshes.get(projectile.slot);
            if (!mesh) {
                if (projectile.kind === 'laser') {
                    // Gauntlet overhaul: hot core + crossed additive glow pair
                    // + head sprite (see laserFx.js). Shared assets per faction;
                    // the per-bolt cost is just the small group wrapper.
                    this.laserFx ??= new LaserFx(this.scene, this.effects);
                    mesh = this.laserFx.boltFor(projectile.faction);
                }
                else if (projectile.kind === 'gauss') {
                    // Magrail slug: a long hypervelocity tracer — thin white-blue
                    // core, three times the laser bolt's length so the lane it
                    // owns reads at a glance, plus a cold additive glow at the head.
                    this.laserFx ??= new LaserFx(this.scene, this.effects);
                    mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 4.8, 3, 6), new THREE.MeshBasicMaterial({ color: 0xcfeeff }));
                    mesh.rotation.x = Math.PI / 2;
                    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
                        map: this.radialTexture('#eaffff', '#4fb8d8'),
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    }));
                    glow.scale.setScalar(1.4);
                    mesh.add(glow);
                }
                else if (projectile.kind === 'pdc') {
                    // Point-defense stub: a short COLD white-blue dart — kept
                    // far from the pulse laser's amber so the two streams
                    // never read as the same gun at combat distance.
                    mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.34, 3, 6), new THREE.MeshBasicMaterial({
                        color: projectile.faction === 'player' ? 0xdce9ff : 0xff8a5b,
                    }));
                    mesh.rotation.x = Math.PI / 2;
                }
                else if (projectile.kind === 'ripper') {
                    // Scattergun pellet: a small warm spark; seven per shell
                    // reads as a cloud without any one pellet drawing attention.
                    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffb066 }));
                    const glint = new THREE.Sprite(new THREE.SpriteMaterial({
                        map: this.radialTexture('#ffe9c9', '#ff7a2b'),
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    }));
                    glint.scale.setScalar(0.55);
                    mesh.add(glint);
                }
                else if (projectile.kind === 'ion') {
                    // Ion Lance bolt: a cool cyan blob with an arcing halo —
                    // reads as energy discharge rather than a kinetic round.
                    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0x69e4f2 }));
                    const arc = new THREE.Sprite(new THREE.SpriteMaterial({
                        map: this.radialTexture('#d8fbff', '#1f7fa8'),
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    }));
                    arc.scale.setScalar(1.5);
                    mesh.add(arc);
                }
                else if (projectile.kind === 'mortar') {
                    // Sunlance orb: big slow ember with a heavy additive halo —
                    // the slowest thing in the sky, so it must look dangerous.
                    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff9a3d }));
                    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
                        map: this.radialTexture('#ffd9a0', '#c33d12'),
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    }));
                    halo.scale.setScalar(2.6);
                    mesh.add(halo);
                }
                else {
                    // Missile overhaul: pale hull, twin stabilizer fins read at
                    // distance, and a hot exhaust plume at the tail that the
                    // per-frame pass flickers while the engine burns.
                    const group = new THREE.Group();
                    const body = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.55, metalness: 0.1 }));
                    body.rotation.x = -Math.PI / 2;
                    group.add(body);
                    const flare = new THREE.Sprite(new THREE.SpriteMaterial({
                        map: this.radialTexture('#fff1ad', '#ff5029'),
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    }));
                    flare.position.z = 0.55;
                    flare.scale.setScalar(2);
                    group.add(flare);
                    // Engine plume: an additive teardrop behind the nozzle —
                    // tagged so the frame pass can flicker it. Sized so the
                    // missile reads as a moving ember at 30-60 units.
                    const plume = new THREE.Sprite(new THREE.SpriteMaterial({
                        map: this.radialTexture('#ffe7b0', '#ff6a1f'),
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                        opacity: 0.95,
                    }));
                    plume.position.z = 1.15;
                    plume.scale.set(1.25, 3.1, 1);
                    plume.name = 'plume';
                    group.add(plume);
                    mesh = group;
                }
                this.dynamicRoot.add(mesh);
                this.projectileMeshes.set(projectile.slot, mesh);
            }
            const i = projectile.slot * 3;
            mesh.position.set(pos[i], pos[i + 1], pos[i + 2]);
            if (alpha > 0) {
                this.tmpPrevPos.set(prevPos[i], prevPos[i + 1], prevPos[i + 2]);
                mesh.position.lerpVectors(this.tmpPrevPos, mesh.position, alpha);
            }
            if (vel[i] || vel[i + 1] || vel[i + 2]) {
                this.forward.set(vel[i], vel[i + 1], vel[i + 2]).normalize();
                this.tmpQuaternion.setFromUnitVectors(NEG_Z, this.forward);
                mesh.quaternion.copy(this.tmpQuaternion);
            }
            if ((projectile.kind === 'laser' || projectile.kind === 'gauss') && this.laserFx) {
                // Close tracers shrink so a bolt crossing the camera doesn't
                // paint a screen-filling wash (allocation-free, see laserFx.js).
                // The magrail's long tracer is the worst close-pass offender —
                // it gets the same treatment.
                this.laserFx.attenuate(mesh, this.camera.position);
                if (projectile.visualScale)
                    mesh.scale.multiplyScalar(projectile.visualScale);
            }
            if (projectile.kind === 'missile' && this.laserFx) {
                // Same treatment for missiles: the plume must not wash the
                // frame when one crosses the camera's own space.
                this.laserFx.attenuate(mesh, this.camera.position);
            }
            if (projectile.kind === 'missile') {
                // Exhaust flicker: the engine plume strobes while the motor
                // burns. No smoke trail — there is no atmosphere out here to
                // suspend one (user report); the hot plume is the whole trail.
                const plume = mesh.getObjectByName('plume');
                if (plume)
                    plume.material.opacity = 0.72 + Math.sin(this.skyTime * 47 + projectile.slot * 3.3) * 0.26;
            }
        });
    }
    syncPickups(pickups, store, alpha = 0) {
        if (pickups.length !== this.pickupMeshCount) {
            const live = new Set(pickups.map((pickup) => pickup.slot));
            for (const [slot, mesh] of this.pickupMeshes) {
                if (!live.has(slot)) {
                    this.dynamicRoot.remove(mesh);
                    this.disposeObject(mesh);
                    this.pickupMeshes.delete(slot);
                }
            }
            this.pickupMeshCount = pickups.length;
        }
        const pos = store.pos;
        const prevPos = store.prevPos;
        pickups.forEach((pickup) => {
            let mesh = this.pickupMeshes.get(pickup.slot);
            if (!mesh) {
                const color = pickup.source === 'mining' ? 0xd7c07a : 0x80d1bf;
                const group = new THREE.Group();
                const body = new THREE.Mesh(pickup.source === 'mining' ? new THREE.DodecahedronGeometry(0.62, 0) : new THREE.BoxGeometry(0.9, 0.52, 0.72), new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.45, emissive: color, emissiveIntensity: 0.16 }));
                group.add(body);
                const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radialTexture(`#${color.toString(16).padStart(6, '0')}`, `#${color.toString(16).padStart(6, '0')}`), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
                glow.scale.setScalar(3.2);
                group.add(glow);
                mesh = group;
                // The group carries its target identity so a raycast hit walks
                // up to it (see pickTarget).
                group.userData.targetKind = 'pickup';
                group.userData.targetId = pickup.id;
                this.dynamicRoot.add(mesh);
                this.pickupMeshes.set(pickup.slot, mesh);
            }
            // A locked crate is a findable marker: the glow swells and
            // brightens while it's the current target, so the loot doesn't get
            // lost in the field.
            const selected = pickup.id === this.selectedPickupId;
            const glow = mesh.children[1];
            if (glow) {
                glow.scale.setScalar(selected ? 5 : 3.2);
                if (glow.material)
                    glow.material.opacity = selected ? 0.6 : 0.3;
            }
            const i = pickup.slot * 3;
            mesh.position.set(pos[i], pos[i + 1], pos[i + 2]);
            if (alpha > 0) {
                this.tmpPrevPos.set(prevPos[i], prevPos[i + 1], prevPos[i + 2]);
                mesh.position.lerpVectors(this.tmpPrevPos, mesh.position, alpha);
            }
            mesh.rotation.x += 0.018;
            mesh.rotation.y += 0.024;
        });
    }
    // Race presentation is deliberately render-only. None of these groups is
    // added to the dynamic entity store or tagged as a gameplay target, and
    // every child has a no-op raycast so a gate can never become a collision or
    // tap-selection surface by accident.
    ensureRaceGateRoot() {
        if (!this.raceGateRoot) {
            this.raceGateRoot = new THREE.Group();
            this.raceGateRoot.name = 'race-course-visuals';
            this.raceGateRoot.raycast = () => { };
            this.scene.add(this.raceGateRoot);
        }
        return this.raceGateRoot;
    }
    createRaceGateMesh() {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.055, 10, 40), new THREE.MeshBasicMaterial({ color: 0x53e6c8, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
        // Neutral glow texture tinted per state below (ported from the
        // parallel 0.7.7a branch — matches the radar's gate blip language).
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radialTexture('#ffffff', '#5a6a78'), transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        // The finish ring stays hidden for ordinary checkpoints. Keeping it in
        // every pooled group avoids allocating when a shorter course reuses a
        // renderer that previously displayed a finish gate.
        const finishRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 10, 40), new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
        finishRing.visible = false;
        finishRing.scale.setScalar(1.16);
        const group = new THREE.Group();
        group.name = 'race-gate';
        group.raycast = () => { };
        ring.raycast = () => { };
        glow.raycast = () => { };
        finishRing.raycast = () => { };
        group.add(ring);
        group.add(glow);
        group.add(finishRing);
        group.userData.baseRingScale = 1;
        group.userData.finishRingScale = 1.16;
        group.userData.glowOpacity = 0.34;
        group.userData.pulseUntil = 0;
        return group;
    }
    createRaceShortcutMesh() {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.042, 8, 28), new THREE.MeshBasicMaterial({ color: 0xc894ff, transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false }));
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radialTexture('#ffffff', '#9b68d8'), transparent: true, opacity: 0.27, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        glow.scale.setScalar(1.55);
        const group = new THREE.Group();
        group.name = 'race-shortcut-gate';
        group.raycast = () => { };
        ring.raycast = () => { };
        glow.raycast = () => { };
        group.add(ring);
        group.add(glow);
        group.userData.glowOpacity = 0.27;
        group.userData.baseRingScale = 1;
        return group;
    }
    // A compact physical marker at the gathering point. It is visible during
    // travel and the countdown but has no physics representation. The ring is
    // aligned to the supplied direction; the post remains upright so the
    // marker reads clearly even when approached from above or below.
    syncRaceStart(gathering, phase = 'travel') {
        if (!gathering?.position)
            return this.clearRaceStart();
        if (!this.raceStartRoot) {
            const root = new THREE.Group();
            root.name = 'race-gathering-marker';
            root.raycast = () => { };
            const frame = new THREE.Group();
            frame.name = 'race-start-frame';
            frame.raycast = () => { };
            const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x5be4d0, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
            const railMaterial = new THREE.MeshBasicMaterial({ color: 0x53b8cb, transparent: true, opacity: 0.48, depthWrite: false, toneMapped: false });
            const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.055, 10, 40), ringMaterial);
            const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radialTexture('#ffffff', '#4fcfc4'), transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
            glow.scale.setScalar(2.1);
            const railA = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1.5), railMaterial);
            railA.position.x = -0.44;
            const railB = railA.clone();
            railB.position.x = 0.44;
            railB.material = railMaterial;
            const crossbar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.035, 0.035), railMaterial);
            crossbar.position.z = 0.22;
            frame.add(ring);
            frame.add(glow);
            frame.add(railA);
            frame.add(railB);
            frame.add(crossbar);
            const postMaterial = new THREE.MeshBasicMaterial({ color: 0xf4c766, transparent: true, opacity: 0.76, depthWrite: false, toneMapped: false });
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, 1.25, 8), postMaterial);
            post.position.y = 0.7;
            const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radialTexture('#fff8db', '#e7ae4d'), transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
            beacon.position.y = 1.42;
            beacon.scale.setScalar(1.3);
            for (const object of [frame, ring, glow, railA, railB, crossbar, post, beacon])
                object.raycast = () => { };
            root.add(frame);
            root.add(post);
            root.add(beacon);
            root.userData.frame = frame;
            root.userData.ring = ring;
            root.userData.glow = glow;
            root.userData.post = post;
            root.userData.beacon = beacon;
            this.raceStartRoot = root;
            this.scene.add(root);
        }
        const root = this.raceStartRoot;
        const frame = root.userData.frame;
        const ring = root.userData.ring;
        const glow = root.userData.glow;
        const post = root.userData.post;
        const beacon = root.userData.beacon;
        const radius = Math.max(0.1, Number.isFinite(gathering.radius) ? gathering.radius : 1);
        // Arrival uses the full authored radius, but the world marker is only
        // a signpost. Capping its visual size keeps the three waiting hulls
        // visible through and around it during the approach.
        const visualRadius = Math.min(radius, 30);
        vectorInto(gathering.position, root.position);
        unitDirectionInto(gathering.direction, tmpGateAxis);
        frame.quaternion.setFromUnitVectors(FORWARD_AXIS, tmpGateAxis);
        frame.scale.setScalar(visualRadius);
        frame.userData.baseRadius = visualRadius;
        // Travel is cool teal; countdown warms the same marker to gold without
        // introducing a screen-space overlay or a new HUD card.
        const countdown = phase !== 'travel';
        ring.material.color.setHex(countdown ? 0xffd26b : 0x5be4d0);
        ring.material.opacity = countdown ? 0.92 : 0.8;
        glow.material.color.setHex(countdown ? 0xffc65b : 0x4fcfc4);
        glow.material.opacity = countdown ? 0.38 : 0.26;
        post.material.color.setHex(countdown ? 0xffd26b : 0xf4c766);
        post.material.opacity = countdown ? 0.88 : 0.76;
        beacon.material.color.setHex(countdown ? 0xffffe7 : 0xffe5a1);
        beacon.material.opacity = countdown ? 0.62 : 0.42;
        post.scale.setScalar(visualRadius);
        beacon.scale.setScalar(visualRadius * (countdown ? 1.55 : 1.3));
        beacon.position.y = visualRadius * 1.42;
        root.userData.phase = phase;
        root.userData.radius = visualRadius;
        root.visible = true;
    }
    clearRaceStart() {
        if (this.raceStartRoot)
            this.raceStartRoot.visible = false;
    }
    // Race gates: one ring per checkpoint, pooled and reused across races.
    // Static geometry — syncRaceGates only places/tints them; updateWorld
    // pulses the active ring so the next checkpoint reads at race speed.
    // `options.shortcuts` is intentionally separate from ordinary gates so a
    // branch can be shown only at the segment where it is actually usable.
    syncRaceGates(gates = [], activeIndex = 0, center = [0, 0, 0], options = {}) {
        if (!Array.isArray(gates) || gates.length === 0) {
            this.clearRaceGates();
            return;
        }
        const root = this.ensureRaceGateRoot();
        const currentIndex = Number.isFinite(activeIndex) ? activeIndex : 0;
        while (this.raceGateMeshes.length < gates.length) {
            const group = this.createRaceGateMesh();
            root.add(group);
            this.raceGateMeshes.push(group);
        }
        vectorInto(center, tmpRaceCenter);
        gates.forEach((gate, index) => {
            const group = this.raceGateMeshes[index];
            if (!gate?.position) {
                group.visible = false;
                return;
            }
            group.visible = true;
            vectorInto(gate.position, group.position);
            // Honor an authored gate direction. Older courses did not carry
            // one, so retain the predecessor/center fallback.
            if (gate.direction !== undefined && gate.direction !== null) {
                unitDirectionInto(gate.direction, tmpGateAxis);
            }
            else {
                vectorInto(index > 0 ? gates[index - 1]?.position : tmpRaceCenter, tmpRacePrevious);
                tmpGateAxis.subVectors(group.position, tmpRacePrevious);
                if (tmpGateAxis.lengthSq() < 1e-6)
                    tmpGateAxis.set(0, 0, 1);
                else
                    tmpGateAxis.normalize();
            }
            group.quaternion.setFromUnitVectors(FORWARD_AXIS, tmpGateAxis);
            const radius = Math.max(0.1, Number.isFinite(gate.radius) ? gate.radius : 1);
            group.scale.setScalar(radius);
            group.userData.baseRadius = radius;
            group.userData.finish = gate.kind === 'finish';
            group.userData.pulseUntil = 0;
            group.userData.pulseDuration = 0;
            const [ring, glow, finishRing] = group.children;
            const isFinish = gate.kind === 'finish';
            finishRing.visible = isFinish;
            finishRing.scale.setScalar(group.userData.finishRingScale);
            // Color language (matching the radar's gate blips): GREEN = fly
            // through now, YELLOW = next after that, GREY = later, and dim
            // GREY = passed. Only a gate explicitly marked `kind: 'finish'`
            // receives the gold/white double-ring treatment.
            if (isFinish) {
                ring.material.color.setHex(0xffd36b);
                ring.material.opacity = 0.96;
                glow.material.color.setHex(0xffd36b);
                glow.material.opacity = 0.52;
                finishRing.material.color.setHex(0xffffed);
                finishRing.material.opacity = 0.94;
                group.userData.glowOpacity = 0.52;
            }
            else if (index === currentIndex) {
                ring.material.color.setHex(0x3dff6e);
                ring.material.opacity = 0.95;
                glow.material.color.setHex(0x3dff6e);
                glow.material.opacity = 0.5;
                group.userData.glowOpacity = 0.5;
            }
            else if (index === currentIndex + 1) {
                ring.material.color.setHex(0xffd24a);
                ring.material.opacity = 0.8;
                glow.material.color.setHex(0xffd24a);
                glow.material.opacity = 0.3;
                group.userData.glowOpacity = 0.3;
            }
            else if (index === currentIndex + 2) {
                ring.material.color.setHex(0x9aa6b0);
                ring.material.opacity = 0.5;
                glow.material.color.setHex(0x9aa6b0);
                glow.material.opacity = 0.1;
                group.userData.glowOpacity = 0.1;
            }
            else if (index < currentIndex) {
                ring.material.color.setHex(0x6b7680);
                ring.material.opacity = 0.12;
                glow.material.color.setHex(0x6b7680);
                glow.material.opacity = 0.03;
                group.userData.glowOpacity = 0.03;
            }
            else {
                ring.material.color.setHex(0x9aa6b0);
                ring.material.opacity = 0.14;
                glow.material.color.setHex(0x9aa6b0);
                glow.material.opacity = 0.04;
                group.userData.glowOpacity = 0.04;
            }
            ring.scale.setScalar(group.userData.baseRingScale);
        });
        for (let index = gates.length; index < this.raceGateMeshes.length; index += 1)
            this.raceGateMeshes[index].visible = false;

        const shortcuts = Array.isArray(options?.shortcuts) ? options.shortcuts : [];
        while (this.raceShortcutMeshes.length < shortcuts.length) {
            const group = this.createRaceShortcutMesh();
            root.add(group);
            this.raceShortcutMeshes.push(group);
        }
        for (const group of this.raceShortcutMeshes)
            group.visible = false;
        shortcuts.forEach((shortcut, index) => {
            const group = this.raceShortcutMeshes[index];
            if (!shortcut || shortcut.atGateIndex !== currentIndex || !shortcut.position)
                return;
            group.visible = true;
            vectorInto(shortcut.position, group.position);
            if (shortcut.direction !== undefined && shortcut.direction !== null) {
                unitDirectionInto(shortcut.direction, tmpGateAxis);
            }
            else {
                const exitGate = gates[shortcut.exitGateIndex];
                vectorInto(exitGate?.position ?? gates[currentIndex]?.position, tmpRacePrevious);
                tmpGateAxis.subVectors(group.position, tmpRacePrevious);
                if (tmpGateAxis.lengthSq() < 1e-6)
                    tmpGateAxis.set(0, 0, 1);
                else
                    tmpGateAxis.normalize();
            }
            group.quaternion.setFromUnitVectors(FORWARD_AXIS, tmpGateAxis);
            const radius = Math.max(0.1, Number.isFinite(shortcut.radius) ? shortcut.radius : 1);
            group.scale.setScalar(radius);
            group.userData.id = shortcut.id;
            group.userData.atGateIndex = shortcut.atGateIndex;
            group.userData.exitGateIndex = shortcut.exitGateIndex;
            group.children[0].scale.setScalar(group.userData.baseRingScale);
            group.children[1].material.opacity = group.userData.glowOpacity;
        });
        this.raceActiveGate = currentIndex;
        root.visible = true;
    }
    clearRaceGates() {
        this.raceActiveGate = undefined;
        for (const group of this.raceGateMeshes ?? [])
            group.visible = false;
        for (const group of this.raceShortcutMeshes ?? [])
            group.visible = false;
        if (this.raceGateRoot)
            this.raceGateRoot.visible = false;
    }
    // A one-shot pulse stored on the pooled gate itself. It is cleared by the
    // normal world update, so callers never own an effect object or cleanup
    // callback. `finish` only strengthens the pulse; finish styling still
    // comes exclusively from gate.kind === 'finish'.
    pulseRaceGate(index, { centered = false, finish = false } = {}) {
        const group = this.raceGateMeshes[index];
        if (!group)
            return false;
        const duration = finish ? 1.1 : 0.68;
        group.userData.pulseUntil = this.skyTime + duration;
        group.userData.pulseDuration = duration;
        group.userData.pulseCentered = !!centered;
        group.userData.pulseFinish = !!finish;
        return true;
    }
    setTarget(targetId, asteroidId, wreckId, locationId, pickupId) {
        this.targetId = targetId;
        this.selectedAsteroidId = asteroidId;
        this.selectedWreckId = wreckId;
        this.selectedLocationId = locationId;
        this.selectedPickupId = pickupId;
        this.updateAsteroidInstances();
        if (this.activeInstanceId === 'mourning-line')
            this.updateWreckNodeInstances();
    }
    setArmedJumpPoint(id) {
        this.armedJumpPointId = id;
    }
    setSystem(systemId) {
        this.systemId = SYSTEM_RENDER_STYLE[systemId] ? systemId : 'helios-verge';
        const style = SYSTEM_RENDER_STYLE[this.systemId];
        this.renderer.setClearColor(style.clear, 1);
        if (this.scene.fog) {
            this.scene.fog.color.setHex(style.fog);
            this.scene.fog.density = style.density;
        }
        this.applySystemStarProfile(this.systemId);
        const sunPosition = sunPositionForSystem(this.systemId);
        for (const visual of this.sunVisuals)
            visual.position.set(...sunPosition);
        for (const [id, mesh] of this.locationMeshes)
            mesh.visible = LOCATIONS[id]?.systemId === this.systemId;
        if (this.selectedLocationId && LOCATIONS[this.selectedLocationId]?.systemId !== this.systemId)
            this.selectedLocationId = undefined;
        this.setActiveInstance(undefined);
    }
    setActiveInstance(id) {
        this.activeInstanceId = LOCATIONS[id]?.systemId === this.systemId ? id : undefined;
        this.instanceRoots.forEach((root, rootId) => {
            root.visible = rootId === this.activeInstanceId && LOCATIONS[rootId]?.systemId === this.systemId;
        });
        this.updateDistantInstanceVisibility();
        if (id === 'mourning-line') {
            void this.ensureGraveyardModels();
            this.updateWreckNodeInstances();
        }
    }
    updateDistantInstanceVisibility() {
        for (const id of ['shardbelt', 'mourning-line']) {
            const root = this.instanceRoots.get(id);
            if (!root)
                continue;
            if (this.systemId !== 'helios-verge') {
                root.visible = false;
                continue;
            }
            if (this.activeInstanceId === id) {
                root.visible = true;
                continue;
            }
            const center = LOCATIONS[id].position;
            const dx = this.camera.position.x - center[0];
            const dy = this.camera.position.y - center[1];
            const dz = this.camera.position.z - center[2];
            root.visible = dx * dx + dy * dy + dz * dz <= DEBRIS_CULL_RANGE_SQ;
            if (id === 'mourning-line' && root.visible)
                void this.ensureGraveyardModels();
        }
        this.updateGraveyardModelVisibility();
    }
    get canvas() {
        return this.renderer.domElement;
    }
    pickTarget(clientX, clientY) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0)
            return undefined;
        this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(this.pointer, this.camera);
        this.raycaster.params.Points.threshold = 5;
        const targets = [...this.shipMeshes.values()];
        // Planets and stations are persistent landmarks: always rendered, always tappable.
        for (const locationMesh of this.locationMeshes.values()) {
            if (locationMesh.visible)
                targets.push(locationMesh);
        }
        if (this.activeInstanceId === 'shardbelt') {
            for (const { mesh } of this.asteroidMeshes)
                targets.push(mesh);
        }
        if (this.activeInstanceId === 'mourning-line')
            targets.push(...this.wreckBatches.map(({ mesh }) => mesh));
        targets.push(...this.pickupMeshes.values());
        const hits = this.raycaster.intersectObjects(targets, true);
        for (const hit of hits) {
            const asteroidBatch = this.asteroidMeshes.find(({ mesh }) => mesh === hit.object);
            if (asteroidBatch && hit.instanceId !== undefined) {
                const node = this.asteroids[asteroidBatch.mesh.userData.nodeIndices[hit.instanceId]];
                if (node?.remaining && node.remaining > 0)
                    return { kind: 'asteroid', id: node.id };
            }
            const wreckBatch = this.wreckBatches.find(({ mesh }) => mesh === hit.object);
            if (wreckBatch && hit.instanceId !== undefined) {
                const node = this.wreckNodes[wreckBatch.mesh.userData.nodeIndices[hit.instanceId]];
                if (node?.remaining && node.remaining > 0)
                    return { kind: 'wreck', id: node.id };
            }
            let object = hit.object;
            while (object) {
                const kind = object.userData.targetKind;
                const id = object.userData.targetId;
                if (kind && id)
                    return { kind, id };
                object = object.parent;
            }
        }
        return undefined;
    }
    setCockpitVisible(visible) {
        if (this.cockpit) this.cockpit.visible = !!visible;
    }
    setDamageWarning(level) {
        const normalized = clamp(level, 0, 1);
        this.shell?.style.setProperty('--damage-warning', normalized.toFixed(3));
        const material = this.cockpitWarning?.material;
        if (material instanceof THREE.MeshBasicMaterial) {
            material.opacity = 0;
            material.transparent = true;
        }
    }
    setHyperdriveFx(fx, progress) {
        const state = fx && fx !== 'none' ? fx : 'none';
        if (state !== this.hyperdriveFxState) {
            this.hyperdriveFxPulse = state === 'active' || state === 'gate' || state === 'drop' || state === 'interrupt' ? 1 : 0;
            if (state === 'gate')
                this.hyperdriveFxPhase = 0;
        }
        this.hyperdriveFxState = state;
        this.hyperdriveFxProgress = clamp(progress, 0, 1);
        if (this.shell)
            this.shell.dataset.hyperdriveFx = state;
    }
    updateCamera(position, prevPosition, rotation, prevRotation, angularVelocity, speedRatio, afterburner, dt, alpha = 0) {
        this.camera.position.set(...position);
        if (prevPosition && alpha > 0) {
            this.tmpPrevPos.set(prevPosition[0], prevPosition[1], prevPosition[2]);
            this.camera.position.lerpVectors(this.tmpPrevPos, this.camera.position, alpha);
        }
        this.camera.quaternion.set(...rotation);
        if (prevRotation && alpha > 0) {
            this.tmpPrevQuat.set(...prevRotation);
            this.tmpCurQuat.copy(this.camera.quaternion);
            this.camera.quaternion.copy(this.tmpPrevQuat).slerp(this.tmpCurQuat, alpha);
        }
        this.updateDistantInstanceVisibility();
        this.skyRoot.position.copy(this.camera.position);
        // Tighter FOV swing so the cockpit frame doesn't punch in.
        this.fovTarget = afterburner ? 80 : 70 + speedRatio * 2.0;
        const previousFov = this.camera.fov;
        this.camera.fov += (this.fovTarget - this.camera.fov) * (1 - Math.exp(-5 * dt));
        if (Math.abs(this.camera.fov - previousFov) > 0.001)
            this.camera.updateProjectionMatrix();
        // The cockpit sprite pulls back a touch under afterburner. Drives
        // --cockpit-zoom, consumed as a scale by the frame/vignette overlays.
        const cockpitZoomTarget = afterburner ? COCKPIT_ZOOM_BURN : COCKPIT_ZOOM_IDLE;
        this.cockpitZoom += (cockpitZoomTarget - this.cockpitZoom) * (1 - Math.exp(-8 * dt));
        this.shell?.style.setProperty('--cockpit-zoom', this.cockpitZoom.toFixed(4));
        // The grime plane is a camera-space overlay, so widening the FOV
        // recedes it exactly as far as the starfield — the dirt reads as part
        // of the sky instead of sitting on the glass. Counter three quarters
        // of that FOV swing so the grime recedes only ~25% as far as the
        // stars: it hugs the canopy while the sky pulls back. Scale x/y only —
        // a uniform scale about the camera origin cancels out and does nothing.
        //   - cruise FOV 70°: grime scale = 1.000
        //   - mid FOV    74°: grime scale = 1.057
        //   - afterburn  80°: grime scale = 1.149  (quarter the starfield recede)
        if (this.cockpit) {
            const baseHalfFovTan = Math.tan(70 * 0.5 * Math.PI / 180);
            const currentHalfFovTan = Math.tan(this.camera.fov * 0.5 * Math.PI / 180);
            const fovCompScale = currentHalfFovTan / baseHalfFovTan;
            const grimeScale = 0.25 + 0.75 * fovCompScale;
            this.cockpit.scale.set(grimeScale, grimeScale, 1);
        }
        const shiftX = clamp(-angularVelocity[1] * 2.4, -7, 7);
        const shiftY = clamp(angularVelocity[0] * 1.8 - speedRatio * 1.4, -5, 4);
        const roll = clamp(-angularVelocity[2] * 0.30, -1.2, 1.2);
        this.shell?.style.setProperty('--cockpit-shift-x', `${shiftX.toFixed(2)}px`);
        this.shell?.style.setProperty('--cockpit-shift-y', `${shiftY.toFixed(2)}px`);
        this.shell?.style.setProperty('--cockpit-roll', `${roll.toFixed(2)}deg`);
    }
    setUtilityBeam(active, mode, start, end) {
        if (!active || !end) {
            this.utilityBeam.visible = false;
            this.utilityBeamMaterial.opacity = 0;
            return;
        }
        const a = tupleToVector(start, this.tmpPosition);
        const b = tupleToVector(end, this.forward);
        const distance = a.distanceTo(b);
        this.utilityBeam.position.copy(a).lerp(b, 0.5);
        this.utilityBeam.scale.set(mode === 'mining' ? 0.62 : 1.05, distance, mode === 'mining' ? 0.62 : 1.05);
        this.utilityBeam.quaternion.setFromUnitVectors(UP_AXIS, b.clone().sub(a).normalize());
        this.utilityBeamMaterial.color.setHex(mode === 'mining' ? 0xe2b45e : 0x74d5c4);
        this.utilityBeamMaterial.opacity = 0.54 + Math.sin(performance.now() * 0.03) * 0.18;
        this.utilityBeam.visible = true;
    }
    spawnExplosion(position, hostile = true, scale = 1) {
        const count = 28;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        const rng = seededRandom(`${position.join(':')}:${performance.now()}`);
        for (let index = 0; index < count; index += 1) {
            const vx = rng() - 0.5;
            const vy = rng() - 0.5;
            const vz = rng() - 0.5;
            const len = Math.hypot(vx, vy, vz) || 1;
            const speed = (2 + rng() * 9) * scale;
            velocities[index * 3] = (vx / len) * speed;
            velocities[index * 3 + 1] = (vy / len) * speed;
            velocities[index * 3 + 2] = (vz / len) * speed;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color: hostile ? 0xff7a3d : 0x7fc9d6,
            size: 1.8 * scale,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const points = new THREE.Points(geometry, material);
        points.position.set(...position);
        this.scene.add(points);
        this.effects.push({ object: points, points, velocities, life: 1.05, maxLife: 1.05 });
    }
    spawnImpact(position, color = 0xffc36a, heavy = false) {
        // Gauntlet overhaul: layered hit (flash + spark burst + embers) lives in
        // laserFx.js; heavy hits (missiles) add a slower ember afterglow.
        this.laserFx ??= new LaserFx(this.scene, this.effects);
        this.laserFx.impact(position, color, heavy);
    }
    // Rock hit: matte chip + dust burst on top of the impact spark (see
    // laserFx.js rockImpact). `rockCenter` biases the debris outward from the
    // surface so chips fly off the belt instead of through it.
    spawnRockImpact(position, rockCenter) {
        this.laserFx ??= new LaserFx(this.scene, this.effects);
        this.laserFx.rockImpact(position, rockCenter);
    }
    spawnMuzzleFlash(x, y, z, color = 0xffc35a) {
        // Brief additive flash at a gun port on fire (see laserFx.js).
        this.laserFx ??= new LaserFx(this.scene, this.effects);
        this.laserFx.muzzleFlash(x, y, z, color);
    }
    // An NPC hyperdrive departure: a short additive warp streak along the
    // ship's heading that flares and fades as the hull jumps away to another
    // port (see the despawn cull in updateShips).
    spawnHyperdriveStreak(position, velocity, color = 0x9fd8ff) {
        const streak = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 130), new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
        }));
        streak.position.set(...position);
        const direction = this.tmpPosition.set(velocity[0], velocity[1], velocity[2]);
        if (direction.lengthSq() < 1e-4)
            direction.set(0, 1, 0);
        direction.normalize();
        streak.quaternion.setFromUnitVectors(UP_AXIS, direction);
        this.scene.add(streak);
        this.effects.push({ object: streak, streak, velocities: [], life: 0.75, maxLife: 0.75 });
    }
    updateEffects(dt) {
        for (let index = this.effects.length - 1; index >= 0; index -= 1) {
            const effect = this.effects[index];
            effect.life -= dt;
            const ratio = clamp(effect.life / effect.maxLife, 0, 1);
            if (effect.points) {
                const positions = effect.points.geometry.getAttribute('position');
                const vel = effect.velocities;
                const count = vel.length / 3;
                for (let i = 0; i < count; i += 1) {
                    positions.setXYZ(i, positions.getX(i) + vel[i * 3] * dt, positions.getY(i) + vel[i * 3 + 1] * dt, positions.getZ(i) + vel[i * 3 + 2] * dt);
                }
                // Damped bursts (rock chips/dust) shed speed so they read as
                // solid debris — sparks keep flying at constant velocity.
                if (effect.damping) {
                    const damp = Math.max(0, 1 - effect.damping * dt);
                    for (let i = 0; i < count; i += 1) {
                        vel[i * 3] *= damp;
                        vel[i * 3 + 1] *= damp;
                        vel[i * 3 + 2] *= damp;
                    }
                }
                positions.needsUpdate = true;
                const material = effect.points.material;
                if (material instanceof THREE.PointsMaterial)
                    material.opacity = ratio;
            }
            else if (effect.streak) {
                // The warp streak extends along the heading as it fades.
                effect.streak.scale.y += dt * 300;
                const material = effect.streak.material;
                if (material instanceof THREE.MeshBasicMaterial)
                    material.opacity = ratio * 0.85;
            }
            else if (effect.muzzle) {
                // Muzzle pops fade at half opacity and do NOT grow — a flash,
                // not a bloom (the generic sprite branch below grows ×4.2/s,
                // which strobed the screen on every shot).
                const material = effect.object.material;
                if (material instanceof THREE.SpriteMaterial)
                    material.opacity = ratio * 0.5;
            }
            else if (effect.object instanceof THREE.Sprite) {
                effect.object.scale.multiplyScalar(1 + dt * 4.2);
                const material = effect.object.material;
                if (material instanceof THREE.SpriteMaterial)
                    material.opacity = ratio;
            }
            if (effect.life <= 0) {
                this.scene.remove(effect.object);
                this.disposeObject(effect.object);
                this.effects.splice(index, 1);
            }
        }
    }
    updateWorld(dt) {
        this.skyTime += dt;
        this.updateHyperdriveFx(dt);
        if (this.starShimmer)
            this.starShimmer.opacity = 0.42 + Math.sin(this.skyTime * 2.4) * 0.14;
        for (const visual of this.jumpPointVisuals) {
            if (LOCATIONS[visual.id]?.systemId !== this.systemId)
                continue;
            const pulse = 0.5 + Math.sin(this.skyTime * 2.1 + visual.phase) * 0.5;
            const armed = visual.id === this.armedJumpPointId;
            const radius = LOCATIONS[visual.id]?.radius ?? 460;
            visual.spinner.rotation.z += dt * (armed ? 1.75 : 0.24);
            visual.spinner.rotation.x = Math.sin(this.skyTime * 0.38 + visual.phase) * 0.08;
            visual.innerRing.rotation.y = Math.sin(this.skyTime * 0.31 + visual.phase) * 0.12;
            // Keep the throat visibly open. Arming energizes its edge and
            // charge blocks, but never turns the fly-through hole into a blue wall.
            visual.portal.material.opacity = (armed ? 0.055 : 0.018) + pulse * (armed ? 0.045 : 0.018);
            visual.portalGlow.material.opacity = (armed ? 0.2 : 0.09) + pulse * (armed ? 0.12 : 0.07);
            visual.portalGlow.scale.setScalar(radius * ((armed ? 1.16 : 1.1) + pulse * (armed ? 0.1 : 0.07)));
            visual.beacons.forEach((beacon, index) => {
                const beaconPulse = 0.5 + Math.sin(this.skyTime * 3.2 + visual.phase + index * Math.PI / 2) * 0.5;
                beacon.material.opacity = 0.42 + beaconPulse * 0.42;
                beacon.scale.setScalar(radius * (0.14 + beaconPulse * 0.07));
            });
        }
        this.asteroids.forEach((node) => {
            if (!node.moving)
                return;
            node.position[0] += node.velocity[0] * dt;
            node.position[1] += node.velocity[1] * dt;
            node.position[2] += node.velocity[2] * dt;
            node.rotation[0] += node.rotationSpeed[0] * dt;
            node.rotation[1] += node.rotationSpeed[1] * dt;
            node.rotation[2] += node.rotationSpeed[2] * dt;
            const center = LOCATIONS.shardbelt.position;
            const dx = node.position[0] - center[0];
            const dy = node.position[1] - center[1];
            const dz = node.position[2] - center[2];
            if (Math.hypot(dx, dy, dz) > LOCATIONS.shardbelt.radius + 55) {
                node.position[0] = center[0] - dx * 0.82;
                node.position[1] = center[1] - dy * 0.82;
                node.position[2] = center[2] - dz * 0.82;
            }
        });
        if (this.activeInstanceId === 'shardbelt')
            this.updateAsteroidInstances(true);
        this.graveyard.forEach((piece) => {
            if (!piece.moving)
                return;
            piece.position[0] += piece.drift[0] * dt;
            piece.position[1] += piece.drift[1] * dt;
            piece.position[2] += piece.drift[2] * dt;
            piece.rotation[0] += piece.spin[0] * dt;
            piece.rotation[1] += piece.spin[1] * dt;
            piece.rotation[2] += piece.spin[2] * dt;
        });
        if (this.instanceRoots.get('mourning-line')?.visible)
            this.updateGraveyardInstances(true);
        const helixRotor = this.locationMeshes.get('helix')?.getObjectByName('rotor');
        if (helixRotor)
            helixRotor.rotation.x += dt * 0.16;
        // Race visuals are pooled. The active gate breathes, while a caller's
        // one-shot pulse is represented by a short scale/glow envelope stored
        // in userData (no effect object to clean up after a finish transition).
        if (this.raceGateRoot?.visible) {
            for (let index = 0; index < this.raceGateMeshes.length; index += 1) {
                const group = this.raceGateMeshes[index];
                if (!group.visible)
                    continue;
                const ring = group.children[0];
                const glow = group.children[1];
                const finishRing = group.children[2];
                const active = index === this.raceActiveGate;
                const until = Number(group.userData.pulseUntil ?? 0);
                const duration = Number(group.userData.pulseDuration ?? 0);
                const remaining = until - this.skyTime;
                const pulseProgress = until > this.skyTime && duration > 0
                    ? clamp((duration - remaining) / duration, 0, 1)
                    : 0;
                const pulseEnvelope = pulseProgress > 0 ? Math.sin(pulseProgress * Math.PI) : 0;
                const baseScale = Number(group.userData.baseRingScale ?? 1);
                const activeBreath = active ? Math.sin(this.skyTime * 5.2) * 0.07 : 0;
                const pulseAmplitude = group.userData.pulseCentered ? 0.16 : 0.1;
                ring.rotation.z += dt * (active ? 1.6 : pulseEnvelope > 0 ? 0.34 : 0);
                ring.scale.setScalar(baseScale + activeBreath + pulseEnvelope * pulseAmplitude);
                if (finishRing?.visible) {
                    finishRing.rotation.z += dt * (active ? 1.6 : pulseEnvelope > 0 ? 0.34 : 0);
                    finishRing.scale.setScalar(Number(group.userData.finishRingScale ?? 1.16) + pulseEnvelope * (group.userData.pulseFinish ? 0.13 : 0.08));
                }
                if (glow?.material) {
                    const glowBase = Number(group.userData.glowOpacity ?? 0);
                    const glowBoost = group.userData.pulseFinish ? 1.3 : 0.8;
                    glow.material.opacity = clamp(glowBase * (1 + pulseEnvelope * glowBoost), 0, 1);
                }
                if (until > 0 && remaining <= 0) {
                    group.userData.pulseUntil = 0;
                    group.userData.pulseDuration = 0;
                    group.userData.pulseCentered = false;
                    group.userData.pulseFinish = false;
                }
            }
        }
        if (this.raceStartRoot?.visible) {
            const frame = this.raceStartRoot.userData.frame;
            const ring = this.raceStartRoot.userData.ring;
            const glow = this.raceStartRoot.userData.glow;
            const beacon = this.raceStartRoot.userData.beacon;
            const radius = Number(frame?.userData.baseRadius ?? this.raceStartRoot.userData.radius ?? 1);
            const breathe = 1 + Math.sin(this.skyTime * 3.1) * 0.045;
            if (frame) {
                frame.scale.setScalar(radius * breathe);
                if (ring)
                    ring.rotation.z += dt * 0.35;
            }
            if (glow?.material)
                glow.material.opacity = (this.raceStartRoot.userData.phase === 'travel' ? 0.26 : 0.38) * (0.9 + Math.sin(this.skyTime * 3.1) * 0.1);
            if (beacon?.material)
                beacon.material.opacity = (this.raceStartRoot.userData.phase === 'travel' ? 0.42 : 0.62) * (0.92 + Math.sin(this.skyTime * 4.2) * 0.08);
        }
        const vesper = this.locationMeshes.get('vesper');
        if (vesper) {
            const surface = vesper.getObjectByName('surface');
            if (surface)
                surface.rotation.y += dt * 0.012;
        }
        const azure = this.locationMeshes.get('azure');
        if (azure) {
            const surface = azure.getObjectByName('surface');
            if (surface)
                surface.rotation.y += dt * 0.009;
        }
        if (this.instanceRoots.get('mourning-line')?.visible)
            this.updateWreckNodeInstances(dt);
        this.updateEffects(dt);
    }
    createBloomPipeline() {
        // Lightweight HDR bloom: render the scene to a float target, threshold the
        // bright parts, blur them at half resolution, and add them back. This is the
        // glow that makes neon rims, engine flares and specular highlights read as
        // "lit" rather than flat — the core of the Rebel Galaxy Outlaw look.
        const vertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }`;
        this.bloomBrightMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                uThreshold: { value: 0.78 },
                uKnee: { value: 0.28 },
            },
            vertexShader,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float uThreshold;
                uniform float uKnee;
                varying vec2 vUv;
                void main() {
                    vec3 color = texture2D(tDiffuse, vUv).rgb;
                    float brightness = max(max(color.r, color.g), color.b);
                    float soft = brightness - uThreshold + uKnee;
                    soft = clamp(soft, 0.0, 2.0 * uKnee);
                    soft = soft * soft / (4.0 * uKnee + 1e-4);
                    float contribution = max(soft, brightness - uThreshold) / max(brightness, 1e-4);
                    gl_FragColor = vec4(color * contribution, 1.0);
                }`,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
        });
        this.bloomBlurMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                uDirection: { value: new THREE.Vector2(1, 0) },
                uResolution: { value: new THREE.Vector2(1, 1) },
            },
            vertexShader,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform vec2 uDirection;
                uniform vec2 uResolution;
                varying vec2 vUv;
                void main() {
                    vec2 texel = uDirection / uResolution;
                    vec4 sum = texture2D(tDiffuse, vUv) * 0.227027;
                    sum += texture2D(tDiffuse, vUv + texel * 1.384615) * 0.316216;
                    sum += texture2D(tDiffuse, vUv - texel * 1.384615) * 0.316216;
                    sum += texture2D(tDiffuse, vUv + texel * 3.230769) * 0.070270;
                    sum += texture2D(tDiffuse, vUv - texel * 3.230769) * 0.070270;
                    gl_FragColor = sum;
                }`,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
        });
        this.bloomCompositeMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tScene: { value: null },
                tBloom: { value: null },
                uStrength: { value: 0.6 },
                uExposure: { value: 1.2 },
            },
            vertexShader,
            fragmentShader: `
                uniform sampler2D tScene;
                uniform sampler2D tBloom;
                uniform float uStrength;
                uniform float uExposure;
                varying vec2 vUv;

                // three.js NeutralToneMapping, applied here in the final composite
                // because the intermediate float buffers hold linear HDR values.
                vec3 neutralToneMapping(vec3 color) {
                    float startCompression = 0.8 - 0.04;
                    float desaturation = 0.15;
                    color *= uExposure;
                    float x = min(color.r, min(color.g, color.b));
                    float offset = x < 0.08 ? x - 6.25 * x * x : 0.01125;
                    color.rgb += offset;
                    float peak = max(color.r, max(color.g, color.b));
                    if (peak < startCompression)
                        return color;
                    float d = 1.0 - startCompression;
                    float newPeak = 1.0 - d * d / (peak + d - startCompression);
                    color.rgb *= newPeak / peak;
                    float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
                    return mix(color.rgb, vec3(newPeak), g);
                }
                vec3 sRGBTransferOETF(vec3 color) {
                    return mix(color * 12.92, 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), color));
                }

                void main() {
                    vec3 scene = texture2D(tScene, vUv).rgb;
                    vec3 bloom = texture2D(tBloom, vUv).rgb;
                    vec3 color = neutralToneMapping(scene + bloom * uStrength);
                    gl_FragColor = vec4(sRGBTransferOETF(color), 1.0);
                }`,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
        });
        this.bloomCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.bloomQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bloomCompositeMaterial);
        this.bloomQuad.frustumCulled = false;
        this.resizeBloomTargets();
    }
    resizeBloomTargets() {
        const width = Math.max(2, Math.floor(this.renderer.domElement.width / 2));
        const height = Math.max(2, Math.floor(this.renderer.domElement.height / 2));
        const makeTarget = () => new THREE.WebGLRenderTarget(width, height, {
            type: THREE.HalfFloatType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: false,
            stencilBuffer: false,
            colorSpace: THREE.LinearSRGBColorSpace,
        });
        if (this.bloomSceneTarget)
            this.bloomSceneTarget.dispose();
        this.bloomSceneTarget = new THREE.WebGLRenderTarget(width * 2, height * 2, {
            type: THREE.HalfFloatType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: true,
            stencilBuffer: false,
            colorSpace: THREE.LinearSRGBColorSpace,
        });
        for (const target of this.bloomBlurTargets)
            target.dispose();
        this.bloomBlurTargets = [makeTarget(), makeTarget()];
        this.bloomBlurMaterial.uniforms.uResolution.value.set(width, height);
    }
    // Bloom costs three extra full-screen passes every frame, which is most of
    // the GPU bill on a weak chip. The Low quality tier and the auto governor's
    // low end skip it: the scene still composites through the tone-mapping
    // shader, just without the bright-pass glow. The governor turns bloom back
    // on once the device proves it can keep up.
    bloomEnabled() {
        if (this.qualityMode === 'high')
            return true;
        if (this.qualityMode === 'low')
            return false;
        const scale = this.lastQualityScale ?? 1;
        if (this.bloomOff)
            return scale >= 0.82 ? (this.bloomOff = false, true) : false;
        if (scale <= 0.72) {
            this.bloomOff = true;
            return false;
        }
        return true;
    }
    render() {
        if (this.contextLost)
            return;
        if (!this.bloomSceneTarget)
            this.resizeBloomTargets();
        // Keep the atmosphere shells' camera-distance uniform fresh so the
        // near-field dome fade tracks the pilot's altitude.
        const cam = this.camera.position;
        for (const shell of this.atmosphereShells) {
            shell.material.uniforms.uCamDist.value = Math.hypot(cam.x - shell.center.x, cam.y - shell.center.y, cam.z - shell.center.z);
        }
        const bloomOn = this.bloomEnabled();
        // Pass 1: the full scene into a float buffer.
        this.renderer.setRenderTarget(this.bloomSceneTarget);
        this.renderer.render(this.scene, this.camera);
        if (bloomOn) {
            // Pass 2: bright-only downsample into the first blur target.
            this.bloomBrightMaterial.uniforms.tDiffuse.value = this.bloomSceneTarget.texture;
            this.bloomQuad.material = this.bloomBrightMaterial;
            this.renderer.setRenderTarget(this.bloomBlurTargets[0]);
            this.renderer.render(this.bloomQuad, this.bloomCamera);
            // Pass 3: separable Gaussian blur (horizontal then vertical).
            this.bloomBlurMaterial.uniforms.uDirection.value.set(1, 0);
            this.bloomBlurMaterial.uniforms.tDiffuse.value = this.bloomBlurTargets[0].texture;
            this.bloomQuad.material = this.bloomBlurMaterial;
            this.renderer.setRenderTarget(this.bloomBlurTargets[1]);
            this.renderer.render(this.bloomQuad, this.bloomCamera);
            this.bloomBlurMaterial.uniforms.uDirection.value.set(0, 1);
            this.bloomBlurMaterial.uniforms.tDiffuse.value = this.bloomBlurTargets[1].texture;
            this.renderer.setRenderTarget(this.bloomBlurTargets[0]);
            this.renderer.render(this.bloomQuad, this.bloomCamera);
        }
        // Pass 4: composite scene + bloom to the screen. With bloom off the
        // strength is zeroed, so the pass is a plain tone-mapped copy.
        this.bloomCompositeMaterial.uniforms.uExposure.value = this.renderer.toneMappingExposure;
        this.bloomCompositeMaterial.uniforms.tScene.value = this.bloomSceneTarget.texture;
        this.bloomCompositeMaterial.uniforms.tBloom.value = this.bloomBlurTargets[0].texture;
        this.bloomCompositeMaterial.uniforms.uStrength.value = bloomOn ? 0.6 : 0;
        this.bloomQuad.material = this.bloomCompositeMaterial;
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.bloomQuad, this.bloomCamera);
    }
    projectToScreen(position) {
        // Runtime entities store transforms as tuples, while rendered meshes
        // expose THREE.Vector3 positions. Accept both: treating a Vector3 like
        // an array returns undefined coordinates and makes every live ship
        // marker disappear (NaN transforms), most visibly on pirates.
        const vector = position?.isVector3
            ? this.tmpPosition.copy(position).project(this.camera)
            : tupleToVector(position, this.tmpPosition).project(this.camera);
        const behind = vector.z > 1;
        return {
            x: (vector.x * 0.5 + 0.5) * this.viewportWidth,
            y: (-vector.y * 0.5 + 0.5) * this.viewportHeight,
            visible: vector.z >= -1 && vector.z <= 1 && vector.x >= -1.2 && vector.x <= 1.2 && vector.y >= -1.2 && vector.y <= 1.2,
            behind,
        };
    }
    projectTargetToScreen(kind, id, fallbackPosition) {
        let renderedPosition;
        if (kind === 'ship') {
            renderedPosition = this.shipMeshes.get(id)?.position;
        }
        else if (kind === 'pickup') {
            for (const mesh of this.pickupMeshes.values()) {
                if (mesh.userData.targetId === id) {
                    renderedPosition = mesh.position;
                    break;
                }
            }
        }
        return this.projectToScreen(renderedPosition ?? fallbackPosition);
    }
    getCameraForward(out = new THREE.Vector3()) {
        return out.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    }
    // The in-game Quality dropdown changes the render tier too (640/720/1280
    // base), not just the scale — otherwise Low/High mid-session do nothing
    // beyond the governor's scale tweak.
    setQualityMode(mode) {
        this.qualityMode = mode;
        this.resize();
    }
    setQualityScale(scale) {
        const next = clamp(scale, 0.55, 1.35);
        if (Math.abs(next - this.lastQualityScale) < 0.05)
            return;
        this.lastQualityScale = next;
        this.resize();
    }
    resize = () => {
        const rect = this.container.getBoundingClientRect();
        this.viewportWidth = Math.max(1, rect.width);
        this.viewportHeight = Math.max(1, rect.height);
        const aspect = this.viewportWidth / this.viewportHeight;
        const baseWidth = this.qualityMode === 'low'
            ? 640
            : this.qualityMode === 'high'
                ? 1280
                : this.touchDevice || this.viewportWidth < 900
                    ? 720
                    : 960;
        const renderWidth = Math.max(288, Math.round(Math.min(this.viewportWidth, baseWidth) * this.lastQualityScale));
        const renderHeight = Math.max(180, Math.round(renderWidth / aspect));
        this.renderer.setPixelRatio(1);
        this.renderer.setSize(renderWidth, renderHeight, false);
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.dataset.renderResolution = `${renderWidth}x${renderHeight}`;
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        if (this.bloomSceneTarget)
            this.resizeBloomTargets();
    };
    onContextLost = (event) => {
        event.preventDefault();
        this.contextLost = true;
    };
    onContextRestored = () => {
        this.contextLost = false;
        this.resize();
    };
    disposeObject(object) {
        object.traverse((child) => {
            if (!(child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Sprite))
                return;
            const mesh = child;
            // Assets flagged userData.shared (laserFx caches) are reused across
            // many live objects — a single bolt's death must not dispose them.
            if (mesh.geometry && !mesh.geometry.userData?.shared)
                mesh.geometry.dispose();
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((material) => {
                if (!material)
                    return;
                for (const value of Object.values(material)) {
                    if (value instanceof THREE.Texture && !value.userData?.shared)
                        value.dispose();
                }
                if (!material.userData?.shared)
                    material.dispose();
            });
        });
    }
    dispose() {
        window.removeEventListener('resize', this.resize);
        this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
        this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
        this.disposeObject(this.scene);
        this.laserFx?.dispose();
        this.laserFx = null;
        this.pixelTextures.forEach((texture) => texture.dispose());
        this.pixelTextures.clear();
        this.screenTextures.length = 0;
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
