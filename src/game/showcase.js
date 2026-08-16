// Self-contained showroom renderer used by the Workbench harness.
// Constructs a clean Three.js scene, places every ship variant, station, and
// planet in-world at known positions and exposures, and renders one frame per
// pose on demand. The look matches what the in-game renderer paints, but lives
// in its own scene so a static screenshot has zero contamination from the
// player's actual location, asteroids, cockpit overlay, HUD, etc.
//
// Owns its own renderer + camera + scene + lights; shares nothing with
// SpaceRenderer so we can iterate the two paths independently.

import * as THREE from 'three';
import { createVoxelShipModel, createVoxelStationModel } from './voxelModels.js';
import { createHeroShipModel, createHeroStationModel } from './heroes.js';
import { LOCATIONS } from './data.js';

const SHIP_VARIANTS = ['kestrel', 'talon', 'warden', 'prospector', 'lancer', 'atlas-freighter'];
const SHIP_PALETTES = {
    kestrel:         { hull: 0xc7d8e6, dark: 0x233042, accent: 0x6ad7e8, engine: 0x6ad7e8, window: 0xeaf6ff, canopy: 0x86d5f0, warning: 0xf2a14a },
    talon:           { hull: 0x71443d, dark: 0x241818, accent: 0xc84b35, engine: 0xff7a3f, window: 0xffb359, canopy: 0xffcf7a, warning: 0xf2b04d },
    warden:          { hull: 0x839ba4, dark: 0x26333a, accent: 0x68c6e4, engine: 0x6ad9f1, window: 0x9be9ef, canopy: 0x7fe5f3, warning: 0xe7794a },
    prospector:      { hull: 0x9a8a68, dark: 0x342d24, accent: 0xd6aa4d, engine: 0xe8bd59, window: 0xa5ddd0, canopy: 0x7dcfc6, warning: 0xe46d43 },
    lancer:          { hull: 0xb0a292, dark: 0x322518, accent: 0xc46a3a, engine: 0xe8b04a, window: 0xd9b066, canopy: 0xe6c378, warning: 0xf2a14a },
    'atlas-freighter': { hull: 0x97876b, dark: 0x302b24, accent: 0xd39b52, engine: 0x6ad9f1, window: 0x98e7d4, canopy: 0x65d7c3, warning: 0xdf7140 },
};

const seededRandom = (seedString) => {
    let h = 1779033703 ^ seedString.length;
    for (let i = 0; i < seedString.length; i += 1) {
        h = Math.imul(h ^ seedString.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

// Replicates the radial gradient sprite helper so the envmap and planet halos
// look identical to the in-game renderer. The actual *implementation* lives in
// SpaceRenderer.radialTexture; we cheat by making a tiny canvas helper here.
const radialTexture = (innerHex, outerHex, stops = 8) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (let i = 0; i <= stops; i += 1) {
        const t = i / stops;
        const c = new THREE.Color(innerHex).clone().lerp(new THREE.Color(outerHex), t);
        gradient.addColorStop(t, `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${1 - t * 0.6})`);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
};

export class ShowcaseRenderer {
    constructor(container) {
        this.container = container;
        this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, depth: true, stencil: false });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.NeutralToneMapping;
        this.renderer.toneMappingExposure = 1.18;
        this.renderer.setPixelRatio(1);
        this.renderer.setClearColor(0x0c1531, 1);
        console.log('three.js revision', this.renderer.capabilities?.isWebGL2 ? 'webgl2' : 'webgl1');
        if (container && container.appendChild) container.appendChild(this.renderer.domElement);
        this.renderer.domElement.id = 'showcase-canvas';
        this.renderer.domElement.style.imageRendering = 'pixelated';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x1a1228, 0.000020);
        this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 800000);
        this.scene.add(this.camera);

        this.poseItems = {}; // name -> { object3d, animation(time), scale, framing }
        this.spin = {}; // variantOrId -> rotation speed per axis
        this._buildLights();
        this._buildSky();
        this._buildStarfield('showcase-seed');
        this._buildNebula('showcase-seed');
        this._spawnShips();
        this._spawnPlanets();
        this._spawnStations();
        this._spawnAsteroidsForScale();

        this.resize();
        window.addEventListener('resize', this.resize);
        this.startTime = performance.now();
    }

    resize = () => {
        const w = this.container?.clientWidth ?? 1280;
        const h = this.container?.clientHeight ?? 800;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    };

    /**
     * Hide everything *except* the named subject and the warm sky/starfield.
     * Each per-model shot then reads as just that hero with a clean backdrop
     * rather than a busy field of decoys.
     */
    _isolateShot(name, isolated) {
        // Per-model shots hide every ship except the named one and pull every
        // auxiliary set piece (planets, stations, asteroids) off-stage. The
        // "lineup" pose keeps all six ships visible.
        const lineupOnly = name === 'lineup';
        if (this._allShips) {
            for (const [key, item] of this._allShips) {
                if (lineupOnly) {
                    item.object3d.position.y = 0;
                    item.object3d.visible = true;
                } else if (isolated) {
                    if (key === name) {
                        item.object3d.position.y = 0;
                        item.object3d.visible = true;
                    } else {
                        item.object3d.position.y = -30000;
                        item.object3d.visible = false;
                    }
                }
            }
        }
        const planets = this.scene.getObjectByName('planets-root');
        const stations = this.scene.getObjectByName('stations-root');
        const asteroids = this.scene.getObjectByName('asteroid-samples');
        const stationSubjects = ['station-helix', 'station-rook'];
        if (planets) planets.visible = lineupOnly;
        if (stations) {
            stations.visible = lineupOnly || stationSubjects.includes(name);
            for (const child of stations.children) {
                const isSubject = (name === 'station-helix' && child === this.poseItems['station-helix'].object3d)
                    || (name === 'station-rook' && child === this.poseItems['station-rook'].object3d);
                if (!lineupOnly && !isSubject) child.visible = false;
                else child.visible = true;
            }
        }
        if (asteroids) asteroids.visible = lineupOnly;
    }

    _buildLights() {
        // Two-tone key + cool counter, matching the in-game look — but stronger
        // so per-model showcases aren't lost in shadow.
        const ambient = new THREE.HemisphereLight(0xffd2a8, 0x4a3a78, 2.6);
        this.scene.add(ambient);
        const fill = new THREE.AmbientLight(0x9aa6cf, 1.3);
        this.scene.add(fill);
        // Sun position is *recomputed per pose* so the model is always lit
        // front-quarter rather than silhouetted. Default position is reused
        // here so the scene has a sun before any pose is set.
        this.sun = new THREE.DirectionalLight(0xffc890, 2.5);
        this.sun.position.set(8000, 5200, 8000);
        this.scene.add(this.sun);
        this.counterSun = new THREE.DirectionalLight(0x4d6fa0, 1.1);
        this.counterSun.position.set(-6000, -2000, -4000);
        this.scene.add(this.counterSun);
        // Visible sun group whose position we move in tandem with the sun
        // light. The corona sprites need to stay way out in the skybox.
        this.sunGroup = new THREE.Group();
        this.sunGroup.name = 'sun-group';
        const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffe1a0, fog: false }));
        this.sunGroup.add(sunMesh);
        for (const [map, scale, opacity] of [
            [radialTexture('#fff5cf', '#ffaf3d'), 2800, 0.55],
            [radialTexture('#ffd57a', '#ff6b2a'), 7200, 0.32],
            [radialTexture('#ffe9a8', '#e07a3a'), 14000, 0.14],
        ]) {
            const corona = new THREE.Sprite(new THREE.SpriteMaterial({
                map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
            }));
            corona.scale.setScalar(scale);
            this.sunGroup.add(corona);
        }
        this.scene.add(this.sunGroup);
        this._sunPositionDefault = this.sun.position.clone();
        this._sunGroupPositionDefault = new THREE.Vector3();
    }

    /** Move the sun light + sun-disc to a 3D point, plus its visual group.
     *  Used so each per-model shot has the warm key light from front-quarter
     *  and the visible glow sits over the model's shoulder. */
    _setSunPosition(worldPosition) {
        this.sun.position.copy(worldPosition);
        this.sunGroup.position.copy(worldPosition);
    }

    /**
     * Walk the visible sun group onto the camera so its angular size stays
     * constant rather than growing into the frame for close-up setups. Pass
     * pitch/yaw in camera-relative space. */
    _attachSunToCamera(pitch = 0.5, yaw = -1.4, distance = 18000) {
        const offset = new THREE.Vector3(
            Math.sin(yaw) * distance,
            Math.sin(pitch) * distance,
            -Math.cos(yaw) * distance,
        );
        // Re-parent to camera so the offset is camera-local.
        this.camera.add(this.sunGroup);
        this.sunGroup.position.copy(offset);
        // Disc + corona scales tuned for an 800-tall viewport at this unit
        // distance. Closer camera = smaller sprite, same screen footprint.
        const baseScales = [320, 880, 1700];
        const children = this.sunGroup.children;
        for (let i = 0; i < children.length; i += 1) {
            const child = children[i];
            if (child.isSprite && i - 1 >= 0 && i - 1 < baseScales.length) {
                child.scale.setScalar(baseScales[i - 1]);
            }
        }
        // Pin the directional light to the same offset so the sun's
        // apparent position matches its light direction.
        this.sun.target.position.set(0, 0, 0);
        this.scene.add(this.sun.target);
        this.sun.position.copy(offset.clone().multiplyScalar(0.6));
    }

    _buildSky() {
        // Procedural cosmic gradient — deep navy at the poles with a thin warm
        // horizon band. The horizon stays warm so the rim shader and clearcoat
        // hulls pick up gold, but the field around the equator is dark enough
        // that a single model reads as the focal element rather than a
        // bright sky background.
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0.0, '#040814');
        gradient.addColorStop(0.25, '#0a1430');
        gradient.addColorStop(0.45, '#1c264e');
        gradient.addColorStop(0.52, '#3a2c5e');   // thin warm horizon
        gradient.addColorStop(0.55, '#5a3666');
        gradient.addColorStop(0.62, '#392253');
        gradient.addColorStop(0.75, '#13193a');
        gradient.addColorStop(1.0, '#03060f');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 256);
        const sky = new THREE.Mesh(
            new THREE.SphereGeometry(640000, 64, 32),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.BackSide, fog: false, depthWrite: false }),
        );
        sky.name = 'sky';
        this.scene.add(sky);
        sky.material.map.colorSpace = THREE.SRGBColorSpace;
        // Cube the same gradient for the envmap.
        const envTexture = new THREE.CanvasTexture(canvas);
        envTexture.mapping = THREE.EquirectangularReflectionMapping;
        envTexture.colorSpace = THREE.SRGBColorSpace;
        this.scene.environment = envTexture;
    }

    _buildStarfield(seed) {
        const stars = [];
        const rng = seededRandom(`${seed}:stars`);
        for (let i = 0; i < 1400; i += 1) {
            const r = 360000 + rng() * 120000;
            const theta = rng() * Math.PI * 2;
            const phi = Math.acos(2 * rng() - 1);
            stars.push(new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta) * r,
                Math.cos(phi) * r,
                Math.sin(phi) * Math.sin(theta) * r,
            ));
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(stars.flatMap((v) => [v.x, v.y, v.z]), 3));
        const mat = new THREE.PointsMaterial({ color: 0xfff0d4, size: 80, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.95, depthWrite: false });
        const points = new THREE.Points(geom, mat);
        points.name = 'starfield';
        this.scene.add(points);
    }

    _buildNebula(seed) {
        const rng = seededRandom(`${seed}:nebula`);
        // Soft additive sprites scattered way out — give the void some colour.
        for (let i = 0; i < 6; i += 1) {
            const r = 240000 + rng() * 100000;
            const theta = rng() * Math.PI * 2;
            const phi = Math.acos(2 * rng() - 1);
            const x = Math.sin(phi) * Math.cos(theta) * r;
            const y = Math.cos(phi) * r * 0.4;
            const z = Math.sin(phi) * Math.sin(theta) * r;
            const color = ['#b54a4f', '#d18a4c', '#3c7fa3', '#7d4ca3', '#a35eb6', '#c46a3a'][i % 6];
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: radialTexture(color, '#0a0a30'),
                transparent: true,
                opacity: 0.18 + rng() * 0.12,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                fog: false,
            }));
            sprite.position.set(x, y, z);
            sprite.scale.setScalar(33000 + rng() * 22000);
            this.scene.add(sprite);
        }
    }

    _spawnShips() {
        // Six ships at fixed world positions. They live in the scene directly
        // (not a parent group) so per-pose visibility toggling works without
        // hiding the focal subject along with the rest.
        const spacing = 80;
        const lineupX = -((SHIP_VARIANTS.length - 1) / 2) * spacing;
        SHIP_VARIANTS.forEach((variant, idx) => {
            const palette = { ...SHIP_PALETTES[variant] };
            const build = createHeroShipModel(variant, palette);
            const group = build.group;
            group.position.set(lineupX + idx * spacing, 0, 0);
            const scale = variant === 'atlas-freighter' ? 14 : variant === 'prospector' ? 18 : 22;
            group.scale.setScalar(scale);
            group.rotation.y = idx * 0.6;
            this.scene.add(group);
            this.poseItems[`ship-${variant}`] = {
                object3d: group,
                framing: { distance: variant === 'atlas-freighter' ? 230 : 130, height: 4 },
            };
        });
        // Track all ship groups so we can reposition them for the lineup pose
        // and hide the non-focal ones for per-model shots.
        this._allShips = Object.entries(this.poseItems).filter(([k]) => k.startsWith('ship-'));
        this._lineupSpin = true;
    }

    _spawnPlanets() {
        const planets = new THREE.Group();
        planets.name = 'planets-root';
        const makePlanet = (id, color, dark, atmosphere, ringed, scale) => {
            const group = new THREE.Group();
            const location = LOCATIONS[id];
            const radius = location.radius * scale;
            const surfaceCanvas = this._planetSurfaceCanvas(id, color, atmosphere);
            const surface = new THREE.Mesh(
                new THREE.SphereGeometry(radius, 96, 60),
                new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    map: new THREE.CanvasTexture(surfaceCanvas),
                    roughness: id === 'azure' ? 0.42 : 0.86,
                    metalness: id === 'azure' ? 0.14 : 0.04,
                    emissive: dark,
                    emissiveIntensity: 0.22,
                    flatShading: true,
                    fog: false,
                }),
            );
            group.add(surface);
            const cloudCanvas = this._planetCloudCanvas(id);
            const clouds = new THREE.Mesh(
                new THREE.SphereGeometry(radius * 1.014, 64, 40),
                new THREE.MeshBasicMaterial({
                    map: new THREE.CanvasTexture(cloudCanvas),
                    color: atmosphere,
                    transparent: true,
                    opacity: id === 'azure' ? 0.46 : 0.4,
                    depthWrite: false,
                    fog: false,
                }),
            );
            group.add(clouds);
            const halo = new THREE.Mesh(
                new THREE.SphereGeometry(radius * 1.06, 32, 20),
                new THREE.MeshBasicMaterial({ color: atmosphere, transparent: true, opacity: 0.32, side: THREE.BackSide, depthWrite: false, fog: false }),
            );
            group.add(halo);
            const wideHalo = new THREE.Mesh(
                new THREE.SphereGeometry(radius * 1.18, 28, 16),
                new THREE.MeshBasicMaterial({ color: atmosphere, transparent: true, opacity: 0.14, side: THREE.BackSide, depthWrite: false, fog: false }),
            );
            group.add(wideHalo);
            if (ringed) {
                const ring = new THREE.Mesh(
                    new THREE.RingGeometry(radius * 1.42, radius * 2.2, 96),
                    new THREE.MeshBasicMaterial({ color: 0xa3c4bd, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, fog: false }),
                );
                ring.rotation.x = Math.PI / 2.4;
                ring.rotation.z = 0.32;
                group.add(ring);
                const innerRing = new THREE.Mesh(
                    new THREE.RingGeometry(radius * 1.32, radius * 1.42, 96),
                    new THREE.MeshBasicMaterial({ color: 0x88aaa6, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, fog: false }),
                );
                innerRing.rotation.copy(ring.rotation);
                group.add(innerRing);
            }
            return group;
        };
        const vesper = makePlanet('vesper', 0xa85f36, 0x281611, 0xd78a54, false, 0.55);
        vesper.position.set(380, -40, -260);
        vesper.rotation.y = 0.4;
        planets.add(vesper);
        this.poseItems['planet-vesper'] = { object3d: vesper, framing: { distance: 360, height: 30 } };

        const azure = makePlanet('azure', 0x2b8889, 0x0d2f3a, 0x83e0c7, true, 0.6);
        azure.position.set(-360, 50, 300);
        azure.rotation.y = -0.7;
        planets.add(azure);
        this.poseItems['planet-azure'] = { object3d: azure, framing: { distance: 460, height: 50 } };

        this.scene.add(planets);
    }

    _planetSurfaceCanvas(id, color, atmosphere) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 512;
        const ctx = canvas.getContext('2d');
        const baseC = new THREE.Color(color);
        const accentC = new THREE.Color(atmosphere);
        const phaseOffset = (seededRandom(`${id}:surface`)() * Math.PI * 2);
        for (let y = 0; y < 512; y += 1) {
            const lat = (y / 512) * 2 - 1;
            const band = Math.sin(lat * 10 + phaseOffset) * 0.5 + 0.5;
            const noise = (seededRandom(`${id}:surface:${y}`)() - 0.5) * 0.18;
            const row = baseC.clone().lerp(accentC, 0.16 + band * 0.55 + noise);
            ctx.fillStyle = '#' + row.getHexString();
            ctx.fillRect(0, y, 512, 1);
        }
        // Storm spots
        const stormCount = 2 + Math.floor(seededRandom(`${id}:storm`)() * 2);
        for (let i = 0; i < stormCount; i += 1) {
            const sx = 100 + seededRandom(`${id}:storm:${i}`)() * 312;
            const sy = 80 + seededRandom(`${id}:storm:${i}:y`)() * 360;
            const r = 22 + seededRandom(`${id}:storm:${i}:r`)() * 18;
            for (let dy = -r; dy <= r; dy += 1) {
                for (let dx = -r; dx <= r; dx += 1) {
                    if (dx * dx + dy * dy < r * r) {
                        const shade = baseC.clone().lerp(accentC, 0.35 + (1 - Math.hypot(dx, dy) / r) * 0.4);
                        ctx.fillStyle = '#' + shade.getHexString();
                        ctx.fillRect(sx + dx, sy + dy, 1, 1);
                    }
                }
            }
        }
        return canvas;
    }

    _planetCloudCanvas(id) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 256, 256);
        const rng = seededRandom(`${id}:clouds`);
        // Wispy streaks.
        for (let i = 0; i < 80; i += 1) {
            const cx = rng() * 256;
            const cy = rng() * 256;
            const w = 24 + rng() * 110;
            const h = 4 + rng() * 14;
            ctx.fillStyle = `rgba(255,255,255,${0.18 + rng() * 0.32})`;
            ctx.beginPath();
            ctx.ellipse(cx, cy, w * 0.5, h, rng() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
        return canvas;
    }

    _spawnStations() {
        const root = new THREE.Group();
        root.name = 'stations-root';
        const helix = createHeroStationModel('helix');
        helix.scale.setScalar(1.0);
        helix.position.set(-180, -10, -180);
        helix.rotation.set(0.18, 0.45, -0.08);
        root.add(helix);
        this.poseItems['station-helix'] = {
            object3d: helix,
            framing: { distance: 220, height: 60 },
        };

        const rook = createHeroStationModel('rook');
        rook.scale.setScalar(1.0);
        rook.position.set(180, -8, 180);
        rook.rotation.set(0.0, 0.6, 0.06);
        root.add(rook);
        this.poseItems['station-rook'] = {
            object3d: rook,
            framing: { distance: 200, height: 30 },
        };

        this.scene.add(root);
    }

    _spawnAsteroidsForScale() {
        // Three sample asteroids (one of each kind) at fixed positions so a
        // planet/station shot has foreground rocks for scale.
        const rng = seededRandom('showcase-asteroids');
        const root = new THREE.Group();
        for (let i = 0; i < 9; i += 1) {
            const geo = new THREE.IcosahedronGeometry(1, 1);
            const positions = geo.getAttribute('position');
            const v = new THREE.Vector3();
            const phase = rng() * 7.31 + i * 1.7;
            for (let j = 0; j < positions.count; j += 1) {
                v.fromBufferAttribute(positions, j);
                const distortion = 0.72 + 0.32 * Math.sin(v.x * 6.3 + v.y * 9.7 + v.z * 13.1 + phase);
                v.multiplyScalar(distortion);
                positions.setXYZ(j, v.x, v.y, v.z);
            }
            positions.needsUpdate = true;
            geo.computeVertexNormals();
            const kind = i % 3;
            const tone = ['#5b6170', '#b4c8d8', '#4a3a40'][kind];
            const mat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(tone),
                roughness: kind === 1 ? 0.42 : 0.86,
                metalness: kind === 1 ? 0.06 : 0.2,
                flatShading: true,
                fog: false,
            });
            const rock = new THREE.Mesh(geo, mat);
            const angle = (i / 9) * Math.PI * 2;
            rock.position.set(Math.cos(angle) * (140 + rng() * 60), (rng() - 0.5) * 80, Math.sin(angle) * (140 + rng() * 60));
            const rockScale = 3 + rng() * 9;
            rock.scale.setScalar(rockScale);
            rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
            root.add(rock);
        }
        root.name = 'asteroid-samples';
        this.scene.add(root);
    }

    /**
     * Camera positioning helper: place the camera at a fixed distance from the
     * pose target, on the orbit ring described by yaw/pitch. The "lineup" pose
     * is a wide cinematic framing that catches all six ships.
     *
     * The visible sun is parented to the camera so its angular size stays
     * constant across close-up and wide shots. The directional light is keyed
     * to a point *between* the camera and the model so the rim shader lights
     * the ship from front-upper-right.
     */
    poseCamera(name, { yaw = -0.6, pitch = 0.05, distance, lookAt, fov, hideOthers = true } = {}) {
        // Default: any per-model pose hides the other vehicles and locks the
        // camera onto a single subject so the shot is *just* that model. The
        // "lineup" pose keeps all six ships visible.
        this._isolateShot(name, hideOthers && name !== 'lineup');

        const sunYawDelta = -0.55;
        const sunPitch = 0.42;
        if (name === 'lineup') {
            // Six ships left to right; camera looks across the row.
            this.camera.fov = fov ?? 44;
            this.camera.updateProjectionMatrix();
            this.camera.position.set(0, 28, 220);
            this.camera.lookAt(0, 0, 0);
            // Sun visible from the camera's upper-right, far in the distance.
            this._attachSunToCamera(sunPitch, yaw + sunYawDelta, 18000);
            // Adjust the directional light to come from above-behind so it
            // rims each ship consistently.
            this.sun.position.set(-300, 220, -480);
            return;
        }
        const item = this.poseItems[name];
        if (!item) throw new Error(`Unknown showcase pose: ${name}`);
        const target = item.object3d.position.clone();
        const fr = item.framing;
        const dist = distance ?? fr.distance;
        const height = lookAt?.[1] ?? fr.height;
        const cosPitch = Math.cos(pitch);
        const offset = new THREE.Vector3(
            Math.sin(yaw) * dist * cosPitch,
            height + Math.sin(pitch) * dist,
            Math.cos(yaw) * dist * cosPitch,
        );
        this.camera.position.copy(target).add(offset);
        this.camera.fov = fov ?? 38;
        this.camera.updateProjectionMatrix();
        const lookAtPoint = lookAt ? new THREE.Vector3(...lookAt) : new THREE.Vector3(target.x, height, target.z);
        this.camera.lookAt(lookAtPoint);
        // (per-model isolation is handled by _isolateShot before this call)
        // The directional light's *target* stays at the model so the rim
        // shader, base lighting, and shadows all key from in front of the
        // model toward the camera. The light's *position* sits off to the
        // right and above so the sun side is lit warmly.
        this.sun.target.position.copy(target);
        this.sun.position.copy(target).add(new THREE.Vector3(dist * 0.7, dist * 0.8, dist));
    }

    /**
     * Apply per-item animations and the lineup spin.
     */
    tickAnimations(time = (performance.now() - this.startTime) / 1000) {
        if (this._lineupSpin) {
            for (const [, item] of this._allShips) {
                item.object3d.rotation.y = Math.sin(time * 0.18 + item.object3d.position.x * 0.01) * 0.06;
            }
        }
        for (const [name, item] of Object.entries(this.poseItems)) {
            if (item.animation) item.animation(item.object3d, time);
            if (name.startsWith('ship-')) this._pulseShip(item.object3d, time);
        }
    }

    _pulseShip(group, time) {
        const rims = group.getObjectsByProperty('name', 'hero-rim');
        for (const rim of rims) {
            const mat = rim.material;
            if (mat?.uniforms?.uIntensity) mat.uniforms.uIntensity.value = 0.6 + Math.sin(time * 1.3 + group.position.x) * 0.08;
        }
    }

    /** Force a single render at the supplied pose, optionally writing to a buffer. */
    render(pose, opts = {}) {
        this.poseCamera(pose, opts);
        this.tickAnimations();
        this._exposeInternal('uExposure', opts.exposure ?? this.renderer.toneMappingExposure);
        this.renderer.render(this.scene, this.camera);
    }

    _exposeInternal(_u, _v) { /* reserved */ }

    snapshot(pose, opts = {}) {
        this.render(pose, opts);
        return this.renderer.domElement;
    }

    dispose() {
        window.removeEventListener('resize', this.resize);
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
