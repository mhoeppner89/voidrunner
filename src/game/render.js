import * as THREE from 'three';
import { LOCATIONS } from './data.js';
import { createVoxelShipModel, createVoxelStationModel, paletteForFaction, shipVariantForRole } from './voxelModels.js';
import { clamp, seededRandom } from './random.js';
const tupleToVector = (tuple, out = new THREE.Vector3()) => out.set(tuple[0], tuple[1], tuple[2]);
const NEG_Z = new THREE.Vector3(0, 0, -1);
const cssHex = (value) => `#${value.toString(16).padStart(6, '0')}`;
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
    shipMeshes = new Map();
    projectileMeshes = new Map();
    pickupMeshes = new Map();
    shipMeshCount = 0;
    projectileMeshCount = 0;
    pickupMeshCount = 0;
    graveyardBatches = [];
    wreckNodeMeshes = new Map();
    effects = [];
    cockpit = new THREE.Group();
    cockpitWarning;
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
    graveyard;
    wreckNodes;
    viewportWidth = 1;
    viewportHeight = 1;
    lastQualityScale = 1;
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
    stationBeacons = [];
    constructor(container, seed, asteroids, graveyard, wreckNodes, quality) {
        this.container = container;
        this.asteroids = asteroids;
        this.qualityMode = quality;
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
        this.renderer.toneMappingExposure = 1.4;
        this.renderer.setPixelRatio(1);
        this.renderer.shadowMap.enabled = false;
        this.renderer.setClearColor(0x0d1a3c, 1);
        this.container.appendChild(this.renderer.domElement);
        this.renderer.domElement.id = 'space-canvas';
        this.renderer.domElement.classList.add('retro-pixel-canvas');
        this.renderer.domElement.style.imageRendering = 'pixelated';
        this.renderer.domElement.setAttribute('aria-label', 'Three-dimensional spaceflight view');
        this.scene.fog = new THREE.FogExp2(0x2a1e44, 0.00010);
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
        this.createCockpit();
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
        window.addEventListener('resize', this.resize);
        this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
        this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
        this.resize();
        this.createBloomPipeline();
    }
    createLighting() {
        // Lighting now mimics Rebel Galaxy Outlaw's two-tone dusk: a warm sodium-
        // orange sun whose key light pushes hulls toward gold, paired with a cool
        // cyan counter-rim that catches the shadow side. Fill is held at half the
        // sun's strength so the unlit side never collapses to black.
        const ambient = new THREE.HemisphereLight(0xffc99e, 0x2c2f5a, 2.6);
        this.scene.add(ambient);
        const fillLight = new THREE.AmbientLight(0x6e6ba8, 1.05);
        this.scene.add(fillLight);
        const sunDir = new THREE.Vector3(-0.62, 0.31, 0.72).normalize();
        const sunLight = new THREE.DirectionalLight(0xffb46a, 4.4);
        sunLight.position.copy(sunDir).multiplyScalar(1);
        this.scene.add(sunLight);
        const rimLight = new THREE.DirectionalLight(0x66b9ff, 1.4);
        rimLight.position.set(0.58, -0.24, -0.78).normalize();
        this.scene.add(rimLight);
        // The sun sits on the star shell, far outside the playable system. The
        // body is a slightly oversized golden disc with two coronae stacked
        // around it (tight inner halo + broad out-of-system bloom) plus a thin
        // anamorphic streak so it reads as a *star* and not just a sphere.
        const sunPos = new THREE.Vector3(-480000, 154000, -745000);
        const sun = new THREE.Mesh(new THREE.SphereGeometry(22000, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffe1a0, fog: false }));
        sun.position.copy(sunPos);
        this.skyRoot.add(sun);
        const innerCorona = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.radialTexture('#fff5cf', '#ffaf3d'),
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
        }));
        innerCorona.position.copy(sunPos);
        innerCorona.scale.setScalar(96000);
        this.skyRoot.add(innerCorona);
        const outerCorona = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.radialTexture('#ffd57a', '#ff6b2a'),
            transparent: true,
            opacity: 0.78,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
        }));
        outerCorona.position.copy(sunPos);
        outerCorona.scale.setScalar(220000);
        this.skyRoot.add(outerCorona);
        const farHalo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.radialTexture('#ffe9a8', '#e07a3a'),
            transparent: true,
            opacity: 0.42,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
        }));
        farHalo.position.copy(sunPos);
        farHalo.scale.setScalar(540000);
        this.skyRoot.add(farHalo);
        // Persist the sun direction in render-space so other systems (rim shader,
        // engine flare bias, sub-light point glows) can use it without re-reading
        // the directional light.
        this.sunDirection = sunDir.clone();
    }
    createEnvironmentMap() {
        // Painterly galactic sky used as an IBL environment so glossy, clearcoated
        // hulls and stations reflect a colorful deep-space gradient instead of
        // black. The horizon band is hot orange/peach to match the new sun key
        // light; the polar caps fade to cobalt for high-glance reflections on
        // belly-mounted hull parts.
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        const gradient = context.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, '#101a40');
        gradient.addColorStop(0.28, '#3a2664');
        gradient.addColorStop(0.45, '#b86b4b');
        gradient.addColorStop(0.52, '#f5aa52');
        gradient.addColorStop(0.6, '#a6486c');
        gradient.addColorStop(0.78, '#2c2d5a');
        gradient.addColorStop(1, '#0a1132');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 512, 256);
        for (const [cx, cy, radius, fill] of [
            [120, 132, 160, 'rgba(255,168,80,0.78)'],
            [396, 132, 150, 'rgba(255,140,90,0.62)'],
            [250, 50, 100, 'rgba(196,108,238,0.46)'],
            [70, 210, 90, 'rgba(110,196,238,0.5)'],
            [430, 220, 70, 'rgba(120,236,196,0.36)'],
        ]) {
            const blob = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
            blob.addColorStop(0, fill);
            blob.addColorStop(1, 'rgba(0,0,0,0)');
            context.fillStyle = blob;
            context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        }
        for (let index = 0; index < 240; index += 1) {
            const x = Math.random() * 512;
            const y = Math.random() * 256;
            const r = 0.4 + Math.random() * 1.6;
            context.fillStyle = `rgba(255,230,180,${(0.25 + Math.random() * 0.75).toFixed(2)})`;
            context.beginPath();
            context.arc(x, y, r, 0, Math.PI * 2);
            context.fill();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        this.scene.environment = texture;
    }
    radialTexture(inner, outer) {
        // Accept either a CSS string (already prefixed with #) or a numeric hex —
        // caller code can be sloppy, and a bad color once crashed the whole
        // render. Always end up with a valid `#rrggbb` plus an alpha tail.
        const normalize = (value) => {
            if (typeof value === 'number')
                return cssHex(value);
            if (!value)
                return '#000000';
            return value.startsWith('#') ? value : `#${value}`;
        };
        const innerCss = normalize(inner);
        const outerCss = normalize(outer);
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
        gradient.addColorStop(0, innerCss);
        gradient.addColorStop(0.22, innerCss);
        gradient.addColorStop(1, `${outerCss}00`);
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
        // Dense field of mixed-temperature stars (cool blue-white with warm giants
        // sprinkled in). Kept dim enough that the bright end doesn't glare through the
        // bloom pass and steal attention from ships, rocks and stations.
        layer(quality === 'low' ? 1900 : 3400, 1.5, 'normal', (color, rng) => {
            if (rng() < 0.2) {
                color.setHSL(0.06 + rng() * 0.06, 0.5 + rng() * 0.32, 0.5 + rng() * 0.3);
            }
            else {
                color.setHSL(0.55 + (rng() - 0.5) * 0.22, 0.22 + rng() * 0.42, 0.52 + rng() * 0.3);
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
                0.34 + rng() * 0.12,
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
    createPixelPanelTexture(seed, base, accent, kind = 'metal', size = 64) {
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
            for (let y = 0; y < size; y += 1) {
                const lat = (y / size) * 2 - 1;
                const band = Math.sin(lat * 10 + phaseOffset) * 0.5 + 0.5;
                const noise = (rng() - 0.5) * 0.16;
                const row = baseC.clone().lerp(accentC, 0.18 + band * 0.55 + noise);
                if (Math.abs(lat) < 0.18)
                    row.offsetHSL(0, -0.05, -0.06);
                context.fillStyle = cssHex(row.getHex());
                context.fillRect(0, y, size, 1);
            }
            // 2-3 storm-eye spots (Galilean-style) at varying latitudes.
            const stormCount = 2 + Math.floor(rng() * 2);
            for (let i = 0; i < stormCount; i += 1) {
                const sy = Math.floor((0.15 + rng() * 0.7) * size);
                const sx = Math.floor(rng() * size);
                const r = 4 + Math.floor(rng() * 6);
                for (let dy = -r; dy <= r; dy += 1) {
                    for (let dx = -r; dx <= r; dx += 1) {
                        if (dx * dx + dy * dy > r * r)
                            continue;
                        const px = ((sx + dx) % size + size) % size;
                        const py = sy + dy;
                        if (py < 0 || py >= size)
                            continue;
                        context.fillStyle = `rgba(${Math.round(accentC.r * 255)},${Math.round(accentC.g * 255)},${Math.round(accentC.b * 255)},0.45)`;
                        context.fillRect(px, py, 1, 1);
                    }
                }
            }
            // Polar cap on whichever pole this render tipped.
            const cap = rng() > 0.5 ? 0 : size - 6;
            context.fillStyle = 'rgba(255,255,255,0.35)';
            context.fillRect(0, cap, size, 6);
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
        this.createPlanet('azure', 0x2b8889, 0x0d2f3a, 0x83e0c7, true);
        this.createHelixStation();
        this.createRookStation();
    }
    createCloudTexture(seed) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        const rng = seededRandom(`${seed}:clouds`);
        context.clearRect(0, 0, 256, 128);
        // Latitude-driven storm ribbons: 3 wide bands at varying latitudes
        // look like real atmospheric circulation, not random blotches.
        const bands = [
            { y: 36, h: 18, count: 22 },
            { y: 64, h: 22, count: 28 },
            { y: 96, h: 16, count: 20 },
        ];
        for (const band of bands) {
            for (let i = 0; i < band.count; i += 1) {
                const cx = rng() * 256;
                const cy = band.y + (rng() - 0.5) * band.h;
                const rx = 18 + rng() * 32;
                const ry = 4 + rng() * 6;
                const alpha = 0.18 + rng() * 0.34;
                const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
                gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha.toFixed(3)})`);
                gradient.addColorStop(0.55, `rgba(255, 255, 255, ${(alpha * 0.4).toFixed(3)})`);
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                context.fillStyle = gradient;
                context.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
            }
        }
        // Plus stray wisps between bands.
        for (let i = 0; i < 18; i += 1) {
            const x = rng() * 256;
            const y = rng() * 128;
            const r = 7 + rng() * 14;
            const gradient = context.createRadialGradient(x, y, 0, x, y, r);
            gradient.addColorStop(0, `rgba(255, 255, 255, ${(0.06 + rng() * 0.12).toFixed(3)})`);
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            context.fillStyle = gradient;
            context.fillRect(x - r, y - r, r * 2, r * 2);
        }
        const texture = this.configurePixelTexture(new THREE.CanvasTexture(canvas));
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 2);
        return texture;
    }
    createPlanet(id, color, dark, atmosphere, ringed) {
        const location = LOCATIONS[id];
        const group = new THREE.Group();
        group.position.set(...location.position);
        group.name = `planet-${id}`;
        const surfaceTexture = this.createPixelPanelTexture(`${id}-surface`, color, atmosphere, 'planet', 512);
        surfaceTexture.repeat.set(id === 'azure' ? 9 : 7, 4.5);
        const surface = new THREE.Mesh(new THREE.SphereGeometry(location.radius, 128, 80), new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: surfaceTexture,
            roughness: id === 'azure' ? 0.46 : 0.94,
            metalness: id === 'azure' ? 0.14 : 0.02,
            emissive: dark,
            emissiveIntensity: 0.28,
            flatShading: true,
            fog: false,
        }));
        surface.name = 'surface';
        group.add(surface);
        const clouds = new THREE.Mesh(new THREE.SphereGeometry(location.radius * 1.014, 96, 56), new THREE.MeshBasicMaterial({
            map: this.createCloudTexture(id),
            color: atmosphere,
            transparent: true,
            opacity: id === 'azure' ? 0.46 : 0.38,
            depthWrite: false,
            fog: false,
        }));
        clouds.name = 'clouds';
        group.add(clouds);
        // Three-tier atmosphere: tight Fresnel-style rim glow, broad hot halo,
        // and a far scatter shell that fades into the sky.
        const halo = new THREE.Mesh(new THREE.SphereGeometry(location.radius * 1.05, 64, 36), new THREE.MeshBasicMaterial({ color: atmosphere, transparent: true, opacity: 0.34, side: THREE.BackSide, depthWrite: false, fog: false }));
        group.add(halo);
        const wideHalo = new THREE.Mesh(new THREE.SphereGeometry(location.radius * 1.13, 56, 32), new THREE.MeshBasicMaterial({ color: atmosphere, transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false, fog: false }));
        group.add(wideHalo);
        const scatterShell = new THREE.Mesh(new THREE.SphereGeometry(location.radius * 1.32, 40, 24), new THREE.MeshBasicMaterial({ color: atmosphere, transparent: true, opacity: 0.06, side: THREE.BackSide, depthWrite: false, fog: false }));
        group.add(scatterShell);
        if (ringed) {
            const ring = new THREE.Mesh(new THREE.RingGeometry(location.radius * 1.42, location.radius * 2.55, 128), new THREE.MeshBasicMaterial({ color: 0xa3c4bd, transparent: true, opacity: 0.36, side: THREE.DoubleSide, depthWrite: false, fog: false }));
            ring.rotation.x = Math.PI / 2.6;
            ring.rotation.z = 0.38;
            group.add(ring);
            const outerRing = new THREE.Mesh(new THREE.RingGeometry(location.radius * 2.6, location.radius * 2.74, 128), new THREE.MeshBasicMaterial({ color: 0xb6cdc8, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, fog: false }));
            outerRing.rotation.copy(ring.rotation);
            group.add(outerRing);
            // Inner C-ring for a layered Saturn feel.
            const innerRing = new THREE.Mesh(new THREE.RingGeometry(location.radius * 1.32, location.radius * 1.42, 96), new THREE.MeshBasicMaterial({ color: 0x88aaa6, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, fog: false }));
            innerRing.rotation.copy(ring.rotation);
            group.add(innerRing);
            // Render-only: the rings must not swallow taps from behind the planet.
            ring.raycast = () => undefined;
            outerRing.raycast = () => undefined;
        }
        // Atmospheric shells are huge transparent spheres that surround the launch
        // point (the halo/outer-halo BackSide spheres even enclose the camera right
        // after departure). If they stay raycastable they win every tap, so the
        // player could never select another target after leaving a planet. Only the
        // solid surface may be picked; the shells are render-only.
        clouds.raycast = () => undefined;
        halo.raycast = () => undefined;
        wideHalo.raycast = () => undefined;
        scatterShell.raycast = () => undefined;
        this.tagTargetable(surface, 'location', id);
        this.locationRoot.add(group);
        this.locationMeshes.set(id, group);
    }
    createHelixStation() {
        const location = LOCATIONS.helix;
        const group = createVoxelStationModel('helix');
        group.position.set(...location.position);
        group.rotation.set(0.18, 0.45, -0.08);
        group.scale.setScalar(10);
        this.makeFogExempt(group);
        this.toneStationGlow(group);
        this.addStationGlow(location);
        this.addStationBeacons(group, location);
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
        this.addStationGlow(location);
        this.addStationBeacons(group, location);
        this.tagTargetable(group, 'location', 'rook');
        this.locationRoot.add(group);
        this.locationMeshes.set('rook', group);
    }
    addStationGlow(location) {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.radialTexture('#ffffff', location.accent),
            transparent: true,
            opacity: 0.18,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
        }));
        glow.position.set(...location.position);
        glow.scale.setScalar(location.radius * 1.8);
        this.locationRoot.add(glow);
        // Far-field scatter halo so the station reads as a *bright* point of
        // light from across the system.
        const scatter = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.radialTexture(location.accent, location.accent),
            transparent: true,
            opacity: 0.08,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
        }));
        scatter.position.set(...location.position);
        scatter.scale.setScalar(location.radius * 4.5);
        this.locationRoot.add(scatter);
    }
    addStationBeacons(group, location) {
        // Bright pulsing nav lights that make a station read as alive from far
        // away. Six beacons per station, varied colors so the silhouette has
        // its own color signature. All `colors` are stored already-`#`-prefixed
        // CSS strings so the radialTexture template doesn't double up the hash.
        const accent = location.accent?.startsWith('#') ? location.accent : cssHex(location.accent);
        const colors = ['#ff6a3d', '#8ff0ff', '#ffc04d', accent, '#66f0c8', '#ff9466'];
        const offsets = [
            [-34, 12, 10], [40, 8, -14], [4, 22, -6], [-22, -16, 22], [28, 18, 12], [0, -24, -8],
        ];
        offsets.forEach((offset, index) => {
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: this.radialTexture('#ffffff', colors[index]),
                transparent: true,
                opacity: 0.95,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                fog: false,
                toneMapped: false,
            }));
            sprite.position.set(...offset);
            sprite.scale.setScalar(8);
            group.add(sprite);
            this.stationBeacons.push({ sprite, phase: index * 2.1, color: colors[index] });
        });
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
        const variantCount = 4;
        const geometries = [];
        for (let variant = 0; variant < variantCount; variant += 1) {
            const geometry = new THREE.IcosahedronGeometry(1, 2);
            const positions = geometry.getAttribute('position');
            const vertex = new THREE.Vector3();
            for (let index = 0; index < positions.count; index += 1) {
                vertex.fromBufferAttribute(positions, index);
                const seedPhase = variant * 7.31;
                const distortion = 0.76 + 0.28 * Math.sin(vertex.x * (6.3 + variant * 1.9) + vertex.y * (9.7 + variant * 2.3) + vertex.z * (13.1 + variant * 1.5) + seedPhase);
                vertex.multiplyScalar(distortion);
                positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
            }
            positions.needsUpdate = true;
            geometry.computeVertexNormals();
            geometry.computeBoundingSphere();
            geometries.push(geometry);
        }
        const rockMap = this.createPixelPanelTexture('shardbelt-rock', 0x625e54, 0xb89d67, 'rock');
        rockMap.repeat.set(3.1, 3.1);
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: rockMap,
            roughness: 1,
            metalness: 0.06,
            flatShading: true,
            vertexColors: true,
        });
        const groups = new Map();
        this.asteroids.forEach((node, index) => {
            const shape = node.shape ?? 0;
            const list = groups.get(shape) ?? [];
            list.push({ node, index });
            groups.set(shape, list);
        });
        this.asteroidMeshes = [];
        groups.forEach((entries, shape) => {
            const mesh = new THREE.InstancedMesh(geometries[shape % geometries.length], material, entries.length);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.frustumCulled = false;
            mesh.name = 'shardbelt-asteroids';
            mesh.userData.targetKind = 'asteroid';
            mesh.userData.nodeIndices = entries.map((entry) => entry.index);
            this.instanceRoots.get('shardbelt')?.add(mesh);
            this.asteroidMeshes.push({ mesh, entries });
        });
        this.updateAsteroidInstances();
        return this.asteroidMeshes[0]?.mesh;
    }
    updateAsteroidInstances(movingOnly = false) {
        const color = new THREE.Color();
        for (const { mesh, entries } of this.asteroidMeshes) {
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
                        color.setHex(node.richness > 1.65 ? 0x9c8b68 : 0x696257);
                    else
                        color.setHex(0x5b5851);
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
        const metalMap = this.createPixelPanelTexture('graveyard-metal', 0x344144, 0x7ca79f, 'metal');
        metalMap.repeat.set(3.5, 2.2);
        const rustMap = this.createPixelPanelTexture('graveyard-rust', 0x48362f, 0xb7683e, 'rust');
        rustMap.repeat.set(4.2, 2.6);
        const grouped = new Map();
        for (const piece of this.graveyard) {
            const finish = piece.kind === 'panel' || piece.id.includes('carrier') ? 'rust' : 'metal';
            const key = `${piece.kind}:${finish}`;
            const list = grouped.get(key) ?? [];
            list.push(piece);
            grouped.set(key, list);
        }
        const geometryFor = (kind) => {
            switch (kind) {
                case 'engine': return new THREE.CylinderGeometry(0.7, 1, 1, 10, 1, true);
                case 'panel': return new THREE.BoxGeometry(1, 0.12, 1);
                case 'disc': return new THREE.CylinderGeometry(1, 1, 0.16, 14);
                case 'ring': return new THREE.TorusGeometry(1, 0.18, 6, 18);
                case 'spine': return new THREE.BoxGeometry(0.34, 0.34, 1);
                case 'beam':
                case 'hull':
                default: return new THREE.BoxGeometry(1, 1, 1);
            }
        };
        const root = this.instanceRoots.get('mourning-line');
        grouped.forEach((pieces, key) => {
            const [kindRaw, finish] = key.split(':');
            const kind = kindRaw;
            const material = new THREE.MeshStandardMaterial({
                color: finish === 'rust' ? 0x8f7768 : 0x879394,
                map: finish === 'rust' ? rustMap : metalMap,
                roughness: finish === 'rust' ? 0.92 : 0.76,
                metalness: finish === 'rust' ? 0.48 : 0.74,
                flatShading: true,
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
    updateGraveyardInstances(movingOnly = false) {
        for (const batch of this.graveyardBatches) {
            let changed = false;
            batch.pieces.forEach((piece, index) => {
                if (movingOnly && !piece.moving)
                    return;
                changed = true;
                this.tmpPosition.set(...piece.position);
                this.tmpEuler.set(...piece.rotation);
                this.tmpQuaternion.setFromEuler(this.tmpEuler);
                this.tmpScale.set(...piece.scale);
                this.tmpMatrix.compose(this.tmpPosition, this.tmpQuaternion, this.tmpScale);
                batch.mesh.setMatrixAt(index, this.tmpMatrix);
                if (movingOnly)
                    batch.mesh.instanceMatrix.addUpdateRange(index * 16, 16);
            });
            if (changed)
                batch.mesh.instanceMatrix.needsUpdate = true;
        }
    }
    createWreckNodes() {
        const geometry = new THREE.OctahedronGeometry(1, 0);
        const root = this.instanceRoots.get('mourning-line');
        this.wreckNodes.forEach((node) => {
            const material = new THREE.MeshBasicMaterial({
                color: node.rarity === 'rare' ? 0xd9b86f : node.rarity === 'uncommon' ? 0x79b9ae : 0x647279,
                transparent: true,
                opacity: 0.28,
                wireframe: true,
            });
            const marker = new THREE.Mesh(geometry, material);
            marker.position.set(...node.position);
            marker.scale.setScalar(node.radius * 1.6);
            marker.visible = node.scanned || node.id === this.selectedWreckId;
            this.tagTargetable(marker, 'wreck', node.id);
            root?.add(marker);
            this.wreckNodeMeshes.set(node.id, marker);
        });
    }
    createCockpit() {
        const frameMap = this.createPixelPanelTexture('cockpit-frame', 0x171a18, 0x8f7544, 'metal', 64);
        frameMap.repeat.set(5, 2);
        const consoleMap = this.createPixelPanelTexture('cockpit-console', 0x242821, 0xd29a3f, 'rust', 64);
        consoleMap.repeat.set(4, 2);
        const frameMaterial = new THREE.MeshBasicMaterial({ color: 0x77776a, map: frameMap, depthTest: false, depthWrite: false });
        const darkMaterial = new THREE.MeshBasicMaterial({ color: 0x343a35, map: consoleMap, depthTest: false, depthWrite: false });
        const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0x756e58, depthTest: false, depthWrite: false });
        const blackMaterial = new THREE.MeshBasicMaterial({ color: 0x050807, depthTest: false, depthWrite: false });
        const amberMaterial = new THREE.MeshBasicMaterial({ color: 0xe1a343, depthTest: false, depthWrite: false, toneMapped: false });
        const tealMaterial = new THREE.MeshBasicMaterial({ color: 0x55cdb8, depthTest: false, depthWrite: false, toneMapped: false });
        const warningMaterial = new THREE.MeshBasicMaterial({ color: 0x6f211a, depthTest: false, depthWrite: false, toneMapped: false });
        const leftScreenMaterial = new THREE.MeshBasicMaterial({ map: this.createInstrumentTexture('cockpit-left', 0x57d6bc), color: 0xb2ffe9, depthTest: false, depthWrite: false });
        const rightScreenMaterial = new THREE.MeshBasicMaterial({ map: this.createInstrumentTexture('cockpit-right', 0x58c8d6), color: 0xb9f6ff, depthTest: false, depthWrite: false });
        const addMesh = (geometry, material, position, rotation = [0, 0, 0], order = 999, name) => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(...position);
            mesh.rotation.set(...rotation);
            mesh.renderOrder = order;
            mesh.frustumCulled = false;
            if (name)
                mesh.name = name;
            this.cockpit.add(mesh);
            return mesh;
        };
        addMesh(new THREE.BoxGeometry(3.15, 0.5, 0.72), darkMaterial, [0, -0.98, -1.54], [-0.12, 0, 0]);
        addMesh(new THREE.BoxGeometry(1.25, 0.26, 0.42), frameMaterial, [0, -0.73, -1.76], [-0.07, 0, 0], 1000);
        addMesh(new THREE.BoxGeometry(3.28, 0.055, 0.07), edgeMaterial, [0, -0.69, -1.92], [0, 0, 0], 1002);
        addMesh(new THREE.BoxGeometry(0.62, 0.22, 0.36), blackMaterial, [0, -0.84, -1.91], [-0.03, 0, 0], 1001);
        const leftConsole = addMesh(new THREE.BoxGeometry(1.06, 0.82, 1.28), darkMaterial, [-1.38, -0.69, -1.29], [-0.09, -0.27, -0.07]);
        const rightConsole = addMesh(new THREE.BoxGeometry(1.06, 0.82, 1.28), darkMaterial, [1.38, -0.69, -1.29], [-0.09, 0.27, 0.07]);
        leftConsole.scale.z = rightConsole.scale.z = 1.04;
        addMesh(new THREE.BoxGeometry(0.74, 0.46, 0.07), frameMaterial, [-1.09, -0.56, -1.77], [-0.05, 0.18, -0.02], 1000);
        addMesh(new THREE.PlaneGeometry(0.62, 0.34), leftScreenMaterial, [-1.085, -0.555, -1.815], [-0.05, 0.18, -0.02], 1001);
        addMesh(new THREE.BoxGeometry(0.74, 0.46, 0.07), frameMaterial, [1.09, -0.56, -1.77], [-0.05, -0.18, 0.02], 1000);
        addMesh(new THREE.PlaneGeometry(0.62, 0.34), rightScreenMaterial, [1.085, -0.555, -1.815], [-0.05, -0.18, 0.02], 1001);
        // Dense rows of instrument lamps and physical switches.
        for (let row = 0; row < 2; row += 1) {
            for (let column = 0; column < 7; column += 1) {
                const x = -0.62 + column * 0.205;
                const material = column === 6 && row === 0 ? warningMaterial : (column + row) % 3 === 0 ? tealMaterial : amberMaterial;
                const lamp = addMesh(new THREE.BoxGeometry(0.11, 0.042, 0.024), material, [x, -0.708 - row * 0.075, -1.955], [0, 0, 0], 1003);
                if (column === 6 && row === 0)
                    lamp.name = 'warning-light';
            }
        }
        for (const side of [-1, 1]) {
            for (let column = 0; column < 3; column += 1) {
                addMesh(new THREE.BoxGeometry(0.085, 0.045, 0.024), column === 1 ? tealMaterial : amberMaterial, [side * (0.91 + column * 0.12), -0.85, -1.84], [0, side * -0.12, 0], 1003);
            }
        }
        // Heavy canopy rails, layered to create the enclosed Privateer-style cockpit silhouette.
        addMesh(new THREE.BoxGeometry(0.105, 2.55, 0.13), frameMaterial, [-1.08, 0.34, -1.56], [0, 0, -0.305], 998);
        addMesh(new THREE.BoxGeometry(0.105, 2.55, 0.13), frameMaterial, [1.08, 0.34, -1.56], [0, 0, 0.305], 998);
        addMesh(new THREE.BoxGeometry(0.052, 2.42, 0.15), edgeMaterial, [-1.01, 0.35, -1.64], [0, 0, -0.305], 999);
        addMesh(new THREE.BoxGeometry(0.052, 2.42, 0.15), edgeMaterial, [1.01, 0.35, -1.64], [0, 0, 0.305], 999);
        addMesh(new THREE.BoxGeometry(1.72, 0.12, 0.14), frameMaterial, [0, 1.13, -1.59], [0, 0, 0], 998);
        addMesh(new THREE.BoxGeometry(1.58, 0.045, 0.15), edgeMaterial, [0, 1.07, -1.66], [0, 0, 0], 999);
        addMesh(new THREE.BoxGeometry(0.5, 0.18, 0.2), darkMaterial, [0, 1.0, -1.69], [0, 0, 0], 999);
        // Console seams, vents, and fasteners.
        for (const x of [-1.42, -1.16, -0.9, 0.9, 1.16, 1.42]) {
            addMesh(new THREE.BoxGeometry(0.14, 0.025, 0.025), blackMaterial, [x, -0.91, -1.78], [0, 0, 0], 1002);
        }
        const boltGeometry = new THREE.CircleGeometry(0.025, 6);
        for (const [x, y] of [[-1.46, -0.47], [-0.82, -0.69], [0.82, -0.69], [1.46, -0.47], [-0.72, -0.93], [0.72, -0.93]]) {
            addMesh(boltGeometry, edgeMaterial, [x, y, -1.965], [0, 0, 0], 1004);
        }
        // A restrained grime layer gives the canopy a tactile, aged surface without hiding targets.
        addMesh(new THREE.PlaneGeometry(3.72, 2.38), new THREE.MeshBasicMaterial({
            map: this.createGrimeTexture('wayfarer-canopy'),
            transparent: true,
            opacity: 0.34,
            depthTest: false,
            depthWrite: false,
            blending: THREE.NormalBlending,
        }), [0, 0.08, -1.98], [0, 0, 0], 1005);
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
    createShipMesh(entity) {
        const variant = shipVariantForRole(entity.role);
        const palette = paletteForFaction(entity.faction, entity.hostile);
        const model = createVoxelShipModel(variant, palette);
        const group = model.group;
        const baseScale = variant === 'atlas-freighter' ? 0.92 : entity.role === 'miner' ? 1.04 : entity.role === 'bounty' ? 1.02 : 1;
        const engineColor = palette.engine;
        const engineFlareTexture = this.radialTexture(cssHex(engineColor), cssHex(engineColor));
        const flares = [];
        for (const port of model.enginePorts) {
            const flare = new THREE.Sprite(new THREE.SpriteMaterial({
                map: engineFlareTexture,
                transparent: true,
                opacity: variant === 'atlas-freighter' ? 0.42 : 0.34,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }));
            flare.position.copy(port).add(new THREE.Vector3(0, 0, 0.18));
            flare.scale.setScalar(variant === 'atlas-freighter' ? 2.8 : 1.42);
            flares.push(flare);
            group.add(flare);
        }
        this.tagTargetable(group, 'ship', entity.id);
        group.scale.setScalar(baseScale);
        group.userData.baseScale = baseScale;
        group.userData.hullMaterial = model.hullMaterial;
        group.userData.rimMaterial = model.rimMaterial;
        group.userData.variant = variant;
        group.userData.engineFlares = flares;
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
    syncShips(entities, alpha = 0) {
        // Reconcile mesh liveness only when the entity count changed (spawns and
        // deaths) — steady state walks nothing and allocates nothing.
        if (entities.length !== this.shipMeshCount) {
            const live = new Set(entities.map((entity) => entity.id));
            for (const [id, mesh] of this.shipMeshes) {
                if (!live.has(id)) {
                    this.dynamicRoot.remove(mesh);
                    this.disposeObject(mesh);
                    this.shipMeshes.delete(id);
                }
            }
            this.shipMeshCount = entities.length;
        }
        entities.forEach((entity) => {
            let mesh = this.shipMeshes.get(entity.id);
            if (!mesh) {
                mesh = this.createShipMesh(entity);
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
            mesh.scale.setScalar(baseScale * (1 + Math.sin(performance.now() * 0.013 + entity.spawnTime) * 0.006));
            mesh.visible = entity.hull > 0;
            const emissiveIntensity = entity.hostile ? 0.18 + damage * 0.28 : damage * 0.12;
            const emissiveMaterials = mesh.userData.emissiveMaterials;
            if (emissiveMaterials) {
                for (const material of emissiveMaterials)
                    material.emissiveIntensity = emissiveIntensity;
            }
            const rimMaterial = mesh.userData.rimMaterial;
            if (rimMaterial?.uniforms) {
                rimMaterial.uniforms.uIntensity.value = entity.hostile ? 1.35 + damage * 0.4 : 1.2;
            }
            const flares = mesh.userData.engineFlares;
            if (flares) {
                const variant = mesh.userData.variant;
                const boost = entity.burning ? 2.1 : entity.hostile && entity.targetId ? 1.4 : 1;
                const pulse = 0.7 + Math.sin(performance.now() * 0.02 + entity.spawnTime) * 0.3;
                const baseOpacity = variant === 'atlas-freighter' ? 0.42 : 0.34;
                const baseSize = variant === 'atlas-freighter' ? 2.8 : 1.42;
                for (const flare of flares) {
                    flare.material.opacity = baseOpacity * pulse * boost;
                    flare.scale.setScalar(baseSize * (0.75 + pulse * 0.45) * (boost > 1 ? 1.15 : 1));
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
                    mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.8, 3, 6), new THREE.MeshBasicMaterial({
                        color: projectile.faction === 'player' ? 0xffc35a : projectile.faction === 'red-talons' ? 0xff4b39 : 0x75cfff,
                    }));
                    mesh.rotation.x = Math.PI / 2;
                }
                else {
                    const group = new THREE.Group();
                    const body = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6), new THREE.MeshBasicMaterial({ color: 0xe8e0cb }));
                    body.rotation.x = -Math.PI / 2;
                    group.add(body);
                    const flare = new THREE.Sprite(new THREE.SpriteMaterial({
                        map: this.radialTexture('#fff1ad', '#ff5029'),
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    }));
                    flare.position.z = 0.55;
                    flare.scale.setScalar(1.4);
                    group.add(flare);
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
                const color = pickup.source === 'mining' ? 0xd7c07a : pickup.rarity === 'rare' ? 0xe3a9ff : 0x80d1bf;
                const group = new THREE.Group();
                const body = new THREE.Mesh(pickup.source === 'mining' ? new THREE.DodecahedronGeometry(0.62, 0) : new THREE.BoxGeometry(0.9, 0.52, 0.72), new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.45, emissive: color, emissiveIntensity: 0.16 }));
                group.add(body);
                const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radialTexture(`#${color.toString(16).padStart(6, '0')}`, `#${color.toString(16).padStart(6, '0')}`), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
                glow.scale.setScalar(3.2);
                group.add(glow);
                mesh = group;
                this.dynamicRoot.add(mesh);
                this.pickupMeshes.set(pickup.slot, mesh);
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
    setTarget(targetId, asteroidId, wreckId, locationId) {
        this.targetId = targetId;
        this.selectedAsteroidId = asteroidId;
        this.selectedWreckId = wreckId;
        this.selectedLocationId = locationId;
        this.updateAsteroidInstances();
        this.wreckNodeMeshes.forEach((mesh, id) => {
            const node = this.wreckNodes.find((entry) => entry.id === id);
            mesh.visible = Boolean(node?.scanned || id === wreckId);
            const material = mesh.material;
            if (material instanceof THREE.MeshBasicMaterial)
                material.opacity = id === wreckId ? 0.8 : 0.28;
        });
    }
    setActiveInstance(id) {
        this.activeInstanceId = id;
        this.instanceRoots.forEach((root, rootId) => {
            root.visible = rootId === id;
        });
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
            targets.push(...this.wreckNodeMeshes.values());
        const hits = this.raycaster.intersectObjects(targets, true);
        for (const hit of hits) {
            const asteroidBatch = this.asteroidMeshes.find(({ mesh }) => mesh === hit.object);
            if (asteroidBatch && hit.instanceId !== undefined) {
                const node = this.asteroids[asteroidBatch.mesh.userData.nodeIndices[hit.instanceId]];
                if (node?.remaining && node.remaining > 0)
                    return { kind: 'asteroid', id: node.id };
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
    setCockpitVisible(_visible) {
        // The remastered cockpit is a responsive DOM art layer; the legacy geometry would double the canopy struts.
        this.cockpit.visible = false;
    }
    // True third-person chase camera so screenshots and replays can step out of
    // the cockpit and frame the whole ship against the sky. The harness uses
    // this for the "chase" labels so we actually see the new hull silhouettes
    // we redrew this iteration.
    setChaseCamera(active, offset = [0, 1.6, -7]) {
        this.chaseCameraActive = !!active;
        if (active) {
            this.cockpit.visible = false;
            this.chaseOffset = offset;
        }
    }
    // Move the camera to a chase position behind the player for one render
    // pass. The renderer keeps no internal state about which view it was
    // showing, so the harness must call this *every* frame it wants chase.
    renderChaseFrame() {
        if (!this.chaseCameraActive || !this.chasePlayerPosition)
            return false;
        const off = new THREE.Vector3(...(this.chaseOffset ?? [0, 1.6, -7]));
        const fwd = (this.chaseForward ?? new THREE.Vector3(0, 0, -1)).clone();
        const up = new THREE.Vector3(0, 1, 0);
        const camPos = new THREE.Vector3(...this.chasePlayerPosition).addScaledVector(fwd, off.z).addScaledVector(up, off.y);
        const target = new THREE.Vector3(...this.chasePlayerPosition).addScaledVector(fwd, 4);
        this.camera.position.copy(camPos);
        this.camera.lookAt(target);
        this.skyRoot.position.copy(camPos);
        this.renderer.render(this.scene, this.camera);
        return true;
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
        if (!this.shell)
            return;
        const state = fx && fx !== 'none' ? fx : 'none';
        this.shell.dataset.hyperdriveFx = state;
        this.shell.style.setProperty('--hyperdrive-progress', clamp(progress, 0, 1).toFixed(3));
    }
    updateCamera(position, prevPosition, rotation, prevRotation, angularVelocity, speedRatio, afterburner, dt, alpha = 0) {
        // Cache the player position/forward so chase-camera helpers (used by
        // the screenshot harness) can place a third-person rig without
        // re-reading game state every frame.
        this.chasePlayerPosition = position;
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().set(...rotation));
        this.chaseForward = fwd;
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
        this.skyRoot.position.copy(this.camera.position);
        this.fovTarget = afterburner ? 84 : 74 + speedRatio * 2.5;
        const previousFov = this.camera.fov;
        this.camera.fov += (this.fovTarget - this.camera.fov) * (1 - Math.exp(-5 * dt));
        if (Math.abs(this.camera.fov - previousFov) > 0.001)
            this.camera.updateProjectionMatrix();
        const shiftX = clamp(-angularVelocity[1] * 2.8, -9, 9);
        const shiftY = clamp(angularVelocity[0] * 2.0 - speedRatio * 2.2, -7, 5);
        const roll = clamp(-angularVelocity[2] * 0.34, -1.5, 1.5);
        this.shell?.style.setProperty('--cockpit-shift-x', `${shiftX.toFixed(2)}px`);
        this.shell?.style.setProperty('--cockpit-shift-y', `${shiftY.toFixed(2)}px`);
        this.shell?.style.setProperty('--cockpit-roll', `${roll.toFixed(2)}deg`);
        this.shell?.style.setProperty('--cockpit-zoom', afterburner ? '1.035' : '1.018');
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
        this.utilityBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        this.utilityBeamMaterial.color.setHex(mode === 'mining' ? 0xe2b45e : 0x74d5c4);
        this.utilityBeamMaterial.opacity = 0.54 + Math.sin(performance.now() * 0.03) * 0.18;
        this.utilityBeam.visible = true;
    }
    spawnExplosion(position, hostile = true, scale = 1) {
        const count = 28;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = [];
        const rng = seededRandom(`${position.join(':')}:${performance.now()}`);
        for (let index = 0; index < count; index += 1) {
            positions[index * 3] = 0;
            positions[index * 3 + 1] = 0;
            positions[index * 3 + 2] = 0;
            velocities.push(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar((2 + rng() * 9) * scale));
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
    spawnImpact(position, color = 0xffc36a) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radialTexture('#ffffff', `#${color.toString(16).padStart(6, '0')}`), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        sprite.position.set(...position);
        sprite.scale.setScalar(3.4);
        this.scene.add(sprite);
        this.effects.push({ object: sprite, velocities: [], life: 0.18, maxLife: 0.18 });
    }
    updateEffects(dt) {
        for (let index = this.effects.length - 1; index >= 0; index -= 1) {
            const effect = this.effects[index];
            effect.life -= dt;
            const ratio = clamp(effect.life / effect.maxLife, 0, 1);
            if (effect.points) {
                const positions = effect.points.geometry.getAttribute('position');
                effect.velocities.forEach((velocity, particleIndex) => {
                    positions.setXYZ(particleIndex, positions.getX(particleIndex) + velocity.x * dt, positions.getY(particleIndex) + velocity.y * dt, positions.getZ(particleIndex) + velocity.z * dt);
                });
                positions.needsUpdate = true;
                const material = effect.points.material;
                if (material instanceof THREE.PointsMaterial)
                    material.opacity = ratio;
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
        if (this.starShimmer)
            this.starShimmer.opacity = 0.42 + Math.sin(this.skyTime * 2.4) * 0.14;
        for (const beacon of this.stationBeacons) {
            const blink = 0.35 + Math.abs(Math.sin(this.skyTime * 0.9 + beacon.phase)) * 0.65;
            beacon.sprite.material.opacity = blink;
            beacon.sprite.scale.setScalar(4 + blink * 4);
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
        if (this.activeInstanceId === 'mourning-line')
            this.updateGraveyardInstances(true);
        const helixRotor = this.locationMeshes.get('helix')?.getObjectByName('rotor');
        if (helixRotor)
            helixRotor.rotation.x += dt * 0.16;
        const vesper = this.locationMeshes.get('vesper');
        if (vesper) {
            const surface = vesper.getObjectByName('surface');
            const clouds = vesper.getObjectByName('clouds');
            if (surface)
                surface.rotation.y += dt * 0.012;
            if (clouds)
                clouds.rotation.y += dt * 0.018;
        }
        const azure = this.locationMeshes.get('azure');
        if (azure) {
            const surface = azure.getObjectByName('surface');
            const clouds = azure.getObjectByName('clouds');
            if (surface)
                surface.rotation.y += dt * 0.009;
            if (clouds)
                clouds.rotation.y += dt * 0.016;
        }
        this.wreckNodeMeshes.forEach((mesh) => {
            mesh.rotation.x += dt * 0.22;
            mesh.rotation.y -= dt * 0.17;
        });
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
                uThreshold: { value: 0.4 },
                uKnee: { value: 0.5 },
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
                uStrength: { value: 1.0 },
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
    render() {
        if (this.contextLost)
            return;
        if (!this.bloomSceneTarget)
            this.resizeBloomTargets();
        // Pass 1: the full scene into a float buffer.
        this.renderer.setRenderTarget(this.bloomSceneTarget);
        this.renderer.render(this.scene, this.camera);
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
        // Pass 4: composite scene + bloom to the screen.
        this.bloomCompositeMaterial.uniforms.uExposure.value = this.renderer.toneMappingExposure;
        this.bloomCompositeMaterial.uniforms.tScene.value = this.bloomSceneTarget.texture;
        this.bloomCompositeMaterial.uniforms.tBloom.value = this.bloomBlurTargets[0].texture;
        this.bloomQuad.material = this.bloomCompositeMaterial;
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.bloomQuad, this.bloomCamera);
    }
    projectToScreen(position) {
        const vector = tupleToVector(position, this.tmpPosition).project(this.camera);
        const behind = vector.z > 1;
        return {
            x: (vector.x * 0.5 + 0.5) * this.viewportWidth,
            y: (-vector.y * 0.5 + 0.5) * this.viewportHeight,
            visible: vector.z >= -1 && vector.z <= 1 && vector.x >= -1.2 && vector.x <= 1.2 && vector.y >= -1.2 && vector.y <= 1.2,
            behind,
        };
    }
    getCameraForward(out = new THREE.Vector3()) {
        return out.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
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
                : this.viewportWidth < 900
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
            mesh.geometry?.dispose?.();
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((material) => {
                if (!material)
                    return;
                for (const value of Object.values(material)) {
                    if (value instanceof THREE.Texture)
                        value.dispose();
                }
                material.dispose();
            });
        });
    }
    dispose() {
        window.removeEventListener('resize', this.resize);
        this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
        this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
        this.disposeObject(this.scene);
        this.pixelTextures.forEach((texture) => texture.dispose());
        this.pixelTextures.clear();
        this.screenTextures.length = 0;
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
