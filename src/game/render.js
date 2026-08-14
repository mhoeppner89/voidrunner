import * as THREE from 'three';
import { LOCATIONS } from './data.js';
import { createVoxelShipModel, createVoxelStationModel, paletteForFaction, shipVariantForRole } from './voxelModels.js';
import { clamp, seededRandom } from './random.js';
const tupleToVector = (tuple, out = new THREE.Vector3()) => out.set(tuple[0], tuple[1], tuple[2]);
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
    camera = new THREE.PerspectiveCamera(74, 1, 0.08, 60000);
    renderer;
    shell;
    dynamicRoot = new THREE.Group();
    skyRoot = new THREE.Group();
    instanceRoots = new Map();
    locationMeshes = new Map();
    shipMeshes = new Map();
    projectileMeshes = new Map();
    pickupMeshes = new Map();
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
    tmpScale = new THREE.Vector3();
    pixelTextures = new Set();
    screenTextures = [];
    forward = new THREE.Vector3();
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    asteroidMesh;
    asteroids;
    graveyard;
    wreckNodes;
    viewportWidth = 1;
    viewportHeight = 1;
    lastQualityScale = 1;
    qualityMode;
    contextLost = false;
    fovTarget = 74;
    targetId;
    selectedAsteroidId;
    selectedWreckId;
    selectedLocationId;
    activeInstanceId;
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
        this.renderer.toneMappingExposure = 1.24;
        this.renderer.setPixelRatio(1);
        this.renderer.shadowMap.enabled = false;
        this.renderer.setClearColor(0x061331, 1);
        this.container.appendChild(this.renderer.domElement);
        this.renderer.domElement.id = 'space-canvas';
        this.renderer.domElement.classList.add('retro-pixel-canvas');
        this.renderer.domElement.style.imageRendering = 'pixelated';
        this.renderer.domElement.setAttribute('aria-label', 'Three-dimensional spaceflight view');
        this.scene.fog = new THREE.FogExp2(0x071945, 0.00022);
        this.scene.add(this.skyRoot);
        this.scene.add(this.dynamicRoot);
        Object.keys(LOCATIONS).forEach((id) => {
            const root = new THREE.Group();
            root.name = `poi-instance-${id}`;
            root.visible = false;
            this.instanceRoots.set(id, root);
            this.scene.add(root);
        });
        this.scene.add(this.camera);
        this.createLighting();
        this.createStarfield(seed, quality);
        this.createNebulae(seed, quality);
        this.createFieldDust(seed, quality);
        this.createLocations();
        this.asteroidMesh = this.createAsteroids();
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
    }
    createLighting() {
        const ambient = new THREE.HemisphereLight(0x9dc7ec, 0x151a36, 1.82);
        this.scene.add(ambient);
        const sunLight = new THREE.DirectionalLight(0xffe2aa, 3.3);
        sunLight.position.set(-0.62, 0.31, 0.72).normalize();
        this.scene.add(sunLight);
        const rimLight = new THREE.DirectionalLight(0x5e9fd2, 0.72);
        rimLight.position.set(0.58, -0.24, -0.78).normalize();
        this.scene.add(rimLight);
        const sun = new THREE.Mesh(new THREE.SphereGeometry(17, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffd889 }));
        sun.position.set(-1120, 360, -1740);
        this.skyRoot.add(sun);
        const corona = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.radialTexture('#fff0b2', '#ff8f36'),
            transparent: true,
            opacity: 0.74,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
        }));
        corona.position.copy(sun.position);
        corona.scale.setScalar(118);
        this.skyRoot.add(corona);
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
        const count = quality === 'low' ? 1250 : 2200;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const color = new THREE.Color();
        for (let index = 0; index < count; index += 1) {
            const radius = 1200 + rng() * 1200;
            const theta = rng() * Math.PI * 2;
            const phi = Math.acos(2 * rng() - 1);
            positions[index * 3] = Math.sin(phi) * Math.cos(theta) * radius;
            positions[index * 3 + 1] = Math.cos(phi) * radius;
            positions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
            color.setHSL(0.57 + (rng() - 0.5) * 0.2, 0.32 + rng() * 0.48, 0.74 + rng() * 0.24);
            colors[index * 3] = color.r;
            colors[index * 3 + 1] = color.g;
            colors[index * 3 + 2] = color.b;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const material = new THREE.PointsMaterial({ size: quality === 'low' ? 1.3 : 1.6, sizeAttenuation: false, vertexColors: true });
        material.fog = false;
        this.skyRoot.add(new THREE.Points(geometry, material));
    }
    createNebulae(seed, quality) {
        if (quality === 'low')
            return;
        const rng = seededRandom(`${seed}:nebula`);
        const texture = this.nebulaTexture(seed);
        for (let index = 0; index < 3; index += 1) {
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
            const angle = rng() * Math.PI * 2;
            sprite.position.set(Math.cos(angle) * 1500, (rng() - 0.5) * 650, Math.sin(angle) * 1500);
            sprite.scale.set(900 + rng() * 500, 500 + rng() * 300, 1);
            sprite.material.fog = false;
            this.skyRoot.add(sprite);
        }
    }
    nebulaTexture(seed) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext('2d');
        const rng = seededRandom(`${seed}:nebula-texture`);
        context.clearRect(0, 0, 512, 512);
        for (let i = 0; i < 42; i += 1) {
            const x = rng() * 512;
            const y = rng() * 512;
            const radius = 35 + rng() * 120;
            const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
            const hue = rng() > 0.55 ? '52, 105, 126' : '93, 57, 104';
            gradient.addColorStop(0, `rgba(${hue}, ${0.035 + rng() * 0.08})`);
            gradient.addColorStop(1, `rgba(${hue}, 0)`);
            context.fillStyle = gradient;
            context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
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
            context.globalAlpha = 0.52;
            for (let y = 4; y < size; y += 7) {
                context.fillStyle = rng() > 0.5 ? cssHex(accent) : 'rgba(255,255,255,.08)';
                context.fillRect(0, y, size, rng() > 0.8 ? 2 : 1);
            }
            context.globalAlpha = 1;
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
    createPlanet(id, color, dark, atmosphere, ringed) {
        const location = LOCATIONS[id];
        const group = new THREE.Group();
        group.position.set(...location.position);
        group.name = `planet-${id}`;
        const surfaceTexture = this.createPixelPanelTexture(`${id}-surface`, color, atmosphere, 'planet', 128);
        surfaceTexture.repeat.set(5, 2.4);
        const surface = new THREE.Mesh(new THREE.SphereGeometry(location.radius, 48, 30), new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: surfaceTexture,
            roughness: 0.94,
            metalness: 0.02,
            emissive: dark,
            emissiveIntensity: 0.18,
            flatShading: true,
        }));
        surface.name = 'surface';
        group.add(surface);
        const clouds = new THREE.Mesh(new THREE.SphereGeometry(location.radius * 1.012, 40, 26), new THREE.MeshBasicMaterial({
            color: atmosphere,
            transparent: true,
            opacity: id === 'azure' ? 0.14 : 0.065,
            depthWrite: false,
            wireframe: id === 'vesper',
        }));
        clouds.name = 'clouds';
        group.add(clouds);
        const halo = new THREE.Mesh(new THREE.SphereGeometry(location.radius * 1.075, 40, 24), new THREE.MeshBasicMaterial({ color: atmosphere, transparent: true, opacity: 0.1, side: THREE.BackSide, depthWrite: false }));
        group.add(halo);
        if (ringed) {
            const ring = new THREE.Mesh(new THREE.RingGeometry(location.radius * 1.42, location.radius * 2.18, 96), new THREE.MeshBasicMaterial({ color: 0x7f9e95, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
            ring.rotation.x = Math.PI / 2.7;
            ring.rotation.z = 0.38;
            group.add(ring);
            const outerRing = new THREE.Mesh(new THREE.RingGeometry(location.radius * 2.24, location.radius * 2.31, 96), new THREE.MeshBasicMaterial({ color: 0x93aaa3, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
            outerRing.rotation.copy(ring.rotation);
            group.add(outerRing);
        }
        this.tagTargetable(group, 'location', id);
        this.instanceRoots.get(id)?.add(group);
        this.locationMeshes.set(id, group);
    }
    createHelixStation() {
        const location = LOCATIONS.helix;
        const group = createVoxelStationModel('helix');
        group.position.set(...location.position);
        group.rotation.set(0.18, 0.45, -0.08);
        this.tagTargetable(group, 'location', 'helix');
        this.instanceRoots.get('helix')?.add(group);
        this.locationMeshes.set('helix', group);
    }
    createRookStation() {
        const location = LOCATIONS.rook;
        const group = createVoxelStationModel('rook');
        group.position.set(...location.position);
        group.rotation.set(-0.08, -0.36, 0.12);
        this.tagTargetable(group, 'location', 'rook');
        this.instanceRoots.get('rook')?.add(group);
        this.locationMeshes.set('rook', group);
    }
    createAsteroids() {
        const geometry = new THREE.IcosahedronGeometry(1, 2);
        const positions = geometry.getAttribute('position');
        const vertex = new THREE.Vector3();
        for (let index = 0; index < positions.count; index += 1) {
            vertex.fromBufferAttribute(positions, index);
            const distortion = 0.84 + 0.19 * Math.sin(vertex.x * 8.7 + vertex.y * 11.3 + vertex.z * 14.1);
            vertex.multiplyScalar(distortion);
            positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
        }
        positions.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
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
        const mesh = new THREE.InstancedMesh(geometry, material, this.asteroids.length);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.name = 'shardbelt-asteroids';
        mesh.userData.targetKind = 'asteroid';
        this.instanceRoots.get('shardbelt')?.add(mesh);
        this.asteroidMesh = mesh;
        this.updateAsteroidInstances();
        return mesh;
    }
    updateAsteroidInstances() {
        if (!this.asteroidMesh)
            return;
        const color = new THREE.Color();
        this.asteroids.forEach((node, index) => {
            this.tmpPosition.set(...node.position);
            this.tmpQuaternion.setFromEuler(new THREE.Euler(...node.rotation));
            this.tmpScale.set(node.radius * node.scale[0], node.radius * node.scale[1], node.radius * node.scale[2]);
            this.tmpMatrix.compose(this.tmpPosition, this.tmpQuaternion, this.tmpScale);
            this.asteroidMesh.setMatrixAt(index, this.tmpMatrix);
            if (node.id === this.selectedAsteroidId)
                color.setHex(0xcfe884);
            else if (node.scanned)
                color.setHex(node.richness > 1.65 ? 0x9c8b68 : 0x696257);
            else
                color.setHex(0x5b5851);
            this.asteroidMesh.setColorAt(index, color);
        });
        this.asteroidMesh.instanceMatrix.needsUpdate = true;
        if (this.asteroidMesh.instanceColor)
            this.asteroidMesh.instanceColor.needsUpdate = true;
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
                case 'ring': return new THREE.TorusGeometry(1, 0.18, 6, 18);
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
    updateGraveyardInstances() {
        for (const batch of this.graveyardBatches) {
            batch.pieces.forEach((piece, index) => {
                this.tmpPosition.set(...piece.position);
                this.tmpQuaternion.setFromEuler(new THREE.Euler(...piece.rotation));
                this.tmpScale.set(...piece.scale);
                this.tmpMatrix.compose(this.tmpPosition, this.tmpQuaternion, this.tmpScale);
                batch.mesh.setMatrixAt(index, this.tmpMatrix);
            });
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
            group.add(flare);
        }
        this.tagTargetable(group, 'ship', entity.id);
        group.scale.setScalar(baseScale);
        group.userData.baseScale = baseScale;
        group.userData.hullMaterial = model.hullMaterial;
        group.userData.variant = variant;
        return group;
    }
    syncShips(entities) {
        const live = new Set(entities.map((entity) => entity.id));
        for (const [id, mesh] of this.shipMeshes) {
            if (!live.has(id)) {
                this.dynamicRoot.remove(mesh);
                this.disposeObject(mesh);
                this.shipMeshes.delete(id);
            }
        }
        entities.forEach((entity) => {
            let mesh = this.shipMeshes.get(entity.id);
            if (!mesh) {
                mesh = this.createShipMesh(entity);
                this.dynamicRoot.add(mesh);
                this.shipMeshes.set(entity.id, mesh);
            }
            mesh.position.set(...entity.position);
            mesh.quaternion.set(...entity.rotation);
            const damage = 1 - entity.hull / entity.maxHull;
            const baseScale = Number(mesh.userData.baseScale ?? 1);
            mesh.scale.setScalar(baseScale * (1 + Math.sin(performance.now() * 0.013 + entity.spawnTime) * 0.006));
            mesh.visible = entity.hull > 0;
            mesh.traverse((object) => {
                if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
                    object.material.emissiveIntensity = entity.hostile ? 0.18 + damage * 0.28 : damage * 0.12;
                }
            });
        });
    }
    syncProjectiles(projectiles) {
        const live = new Set(projectiles.map((entity) => entity.id));
        for (const [id, mesh] of this.projectileMeshes) {
            if (!live.has(id)) {
                this.dynamicRoot.remove(mesh);
                this.disposeObject(mesh);
                this.projectileMeshes.delete(id);
            }
        }
        projectiles.forEach((projectile) => {
            let mesh = this.projectileMeshes.get(projectile.id);
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
                this.projectileMeshes.set(projectile.id, mesh);
            }
            mesh.position.set(...projectile.position);
            if (projectile.velocity[0] || projectile.velocity[1] || projectile.velocity[2]) {
                this.forward.set(projectile.velocity[0], projectile.velocity[1], projectile.velocity[2]).normalize();
                this.tmpQuaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.forward);
                mesh.quaternion.copy(this.tmpQuaternion);
            }
        });
    }
    syncPickups(pickups) {
        const live = new Set(pickups.map((pickup) => pickup.id));
        for (const [id, mesh] of this.pickupMeshes) {
            if (!live.has(id)) {
                this.dynamicRoot.remove(mesh);
                this.disposeObject(mesh);
                this.pickupMeshes.delete(id);
            }
        }
        pickups.forEach((pickup) => {
            let mesh = this.pickupMeshes.get(pickup.id);
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
                this.pickupMeshes.set(pickup.id, mesh);
            }
            mesh.position.set(...pickup.position);
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
        if (this.activeInstanceId) {
            const locationMesh = this.locationMeshes.get(this.activeInstanceId);
            if (locationMesh?.visible)
                targets.push(locationMesh);
            if (this.activeInstanceId === 'shardbelt')
                targets.push(this.asteroidMesh);
            if (this.activeInstanceId === 'mourning-line')
                targets.push(...this.wreckNodeMeshes.values());
        }
        const hits = this.raycaster.intersectObjects(targets, true);
        for (const hit of hits) {
            if (hit.object === this.asteroidMesh && hit.instanceId !== undefined) {
                const node = this.asteroids[hit.instanceId];
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
    setDamageWarning(level) {
        const normalized = clamp(level, 0, 1);
        this.shell?.style.setProperty('--damage-warning', normalized.toFixed(3));
        const material = this.cockpitWarning?.material;
        if (material instanceof THREE.MeshBasicMaterial) {
            material.opacity = 0;
            material.transparent = true;
        }
    }
    updateCamera(position, rotation, angularVelocity, speedRatio, afterburner, dt) {
        this.camera.position.set(...position);
        this.camera.quaternion.set(...rotation);
        this.skyRoot.position.copy(this.camera.position);
        this.fovTarget = afterburner ? 84 : 74 + speedRatio * 2.5;
        this.camera.fov += (this.fovTarget - this.camera.fov) * (1 - Math.exp(-5 * dt));
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
            this.updateAsteroidInstances();
        let graveyardMoved = false;
        this.graveyard.forEach((piece) => {
            if (!piece.moving)
                return;
            piece.position[0] += piece.drift[0] * dt;
            piece.position[1] += piece.drift[1] * dt;
            piece.position[2] += piece.drift[2] * dt;
            piece.rotation[0] += piece.spin[0] * dt;
            piece.rotation[1] += piece.spin[1] * dt;
            piece.rotation[2] += piece.spin[2] * dt;
            graveyardMoved = true;
        });
        if (graveyardMoved && this.activeInstanceId === 'mourning-line')
            this.updateGraveyardInstances();
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
    render() {
        if (this.contextLost)
            return;
        this.renderer.render(this.scene, this.camera);
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
