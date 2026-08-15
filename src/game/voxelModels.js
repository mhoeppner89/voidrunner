import * as THREE from 'three';
const keyOf = (x, y, z) => `${x},${y},${z}`;
const FACE_DEFS = [
    {
        direction: [1, 0, 0],
        normal: [1, 0, 0],
        corners: [
            [1, -1, -1],
            [1, 1, -1],
            [1, 1, 1],
            [1, -1, 1],
        ],
    },
    {
        direction: [-1, 0, 0],
        normal: [-1, 0, 0],
        corners: [
            [-1, -1, 1],
            [-1, 1, 1],
            [-1, 1, -1],
            [-1, -1, -1],
        ],
    },
    {
        direction: [0, 1, 0],
        normal: [0, 1, 0],
        corners: [
            [-1, 1, -1],
            [-1, 1, 1],
            [1, 1, 1],
            [1, 1, -1],
        ],
    },
    {
        direction: [0, -1, 0],
        normal: [0, -1, 0],
        corners: [
            [-1, -1, 1],
            [-1, -1, -1],
            [1, -1, -1],
            [1, -1, 1],
        ],
    },
    {
        direction: [0, 0, 1],
        normal: [0, 0, 1],
        corners: [
            [-1, -1, 1],
            [1, -1, 1],
            [1, 1, 1],
            [-1, 1, 1],
        ],
    },
    {
        direction: [0, 0, -1],
        normal: [0, 0, -1],
        corners: [
            [1, -1, -1],
            [-1, -1, -1],
            [-1, 1, -1],
            [1, 1, -1],
        ],
    },
];
const coordinateShade = (x, y, z) => {
    const value = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return value - Math.floor(value);
};
export class VoxelGrid {
    cells = new Map();
    set(x, y, z, material) {
        this.cells.set(keyOf(Math.round(x), Math.round(y), Math.round(z)), material);
    }
    get(x, y, z) {
        return this.cells.get(keyOf(x, y, z));
    }
    fillBox(x0, x1, y0, y1, z0, z1, material) {
        const minX = Math.min(Math.round(x0), Math.round(x1));
        const maxX = Math.max(Math.round(x0), Math.round(x1));
        const minY = Math.min(Math.round(y0), Math.round(y1));
        const maxY = Math.max(Math.round(y0), Math.round(y1));
        const minZ = Math.min(Math.round(z0), Math.round(z1));
        const maxZ = Math.max(Math.round(z0), Math.round(z1));
        for (let x = minX; x <= maxX; x += 1) {
            for (let y = minY; y <= maxY; y += 1) {
                for (let z = minZ; z <= maxZ; z += 1)
                    this.set(x, y, z, material);
            }
        }
    }
    fillCylinderX(x0, x1, radius, material, cy = 0, cz = 0) {
        const r = Math.max(1, Math.round(radius));
        for (let x = Math.round(Math.min(x0, x1)); x <= Math.round(Math.max(x0, x1)); x += 1) {
            for (let y = -r; y <= r; y += 1) {
                for (let z = -r; z <= r; z += 1) {
                    if (y * y + z * z <= radius * radius)
                        this.set(x, cy + y, cz + z, material);
                }
            }
        }
    }
    fillCylinderZ(z0, z1, radius, material, cx = 0, cy = 0) {
        const r = Math.max(1, Math.round(radius));
        for (let z = Math.round(Math.min(z0, z1)); z <= Math.round(Math.max(z0, z1)); z += 1) {
            for (let x = -r; x <= r; x += 1) {
                for (let y = -r; y <= r; y += 1) {
                    if (x * x + y * y <= radius * radius)
                        this.set(cx + x, cy + y, z, material);
                }
            }
        }
    }
    fillRingX(x0, x1, majorRadius, tubeRadius, material) {
        const outer = Math.ceil(majorRadius + tubeRadius);
        for (let x = Math.round(Math.min(x0, x1)); x <= Math.round(Math.max(x0, x1)); x += 1) {
            for (let y = -outer; y <= outer; y += 1) {
                for (let z = -outer; z <= outer; z += 1) {
                    const radial = Math.hypot(y, z);
                    if (Math.abs(radial - majorRadius) <= tubeRadius)
                        this.set(x, y, z, material);
                }
            }
        }
    }
    line(start, end, radius, material) {
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const dz = end[2] - start[2];
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) * 1.2));
        const r = Math.max(0, Math.round(radius));
        for (let index = 0; index <= steps; index += 1) {
            const t = index / steps;
            const x = Math.round(start[0] + dx * t);
            const y = Math.round(start[1] + dy * t);
            const z = Math.round(start[2] + dz * t);
            this.fillBox(x - r, x + r, y - r, y + r, z - r, z + r, material);
        }
    }
    buildGeometry(unit, palette, materials) {
        const positions = [];
        const normals = [];
        const colors = [];
        const indices = [];
        const half = unit * 0.5;
        let vertexOffset = 0;
        for (const [key, material] of this.cells) {
            if (!materials.has(material))
                continue;
            const [xRaw, yRaw, zRaw] = key.split(',').map(Number);
            const x = xRaw ?? 0;
            const y = yRaw ?? 0;
            const z = zRaw ?? 0;
            const base = new THREE.Color(palette[material]);
            const shade = (coordinateShade(x, y, z) - 0.5) * (material === 'dark' ? 0.09 : 0.055);
            base.offsetHSL(0, 0, shade);
            for (const face of FACE_DEFS) {
                if (this.get(x + face.direction[0], y + face.direction[1], z + face.direction[2]))
                    continue;
                for (const corner of face.corners) {
                    positions.push(x * unit + corner[0] * half, y * unit + corner[1] * half, z * unit + corner[2] * half);
                    normals.push(face.normal[0], face.normal[1], face.normal[2]);
                    colors.push(base.r, base.g, base.b);
                }
                indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
                vertexOffset += 4;
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return geometry;
    }
}
const fillTaperedBody = (grid, z0, z1, profile, material) => {
    const minZ = Math.min(z0, z1);
    const maxZ = Math.max(z0, z1);
    const length = Math.max(1, maxZ - minZ);
    for (let z = minZ; z <= maxZ; z += 1) {
        const t = (z - minZ) / length;
        const { width, height } = profile(t);
        grid.fillBox(-Math.round(width), Math.round(width), -Math.round(height), Math.round(height), z, z, material);
    }
};
const markCanopy = (grid, x0, x1, z0, z1, y) => {
    for (let z = z0; z <= z1; z += 1) {
        const inset = z === z0 || z === z1 ? 1 : 0;
        grid.fillBox(x0 + inset, x1 - inset, y, y, z, z, 'canopy');
    }
};
const buildKestrel = () => {
    const grid = new VoxelGrid();
    fillTaperedBody(grid, -23, 17, (t) => ({
        width: t < 0.2 ? 1 + t * 8 : t < 0.72 ? 3.2 : 2.6 - (t - 0.72) * 2.6,
        height: t < 0.24 ? 0.7 + t * 4 : 1.7,
    }), 'hull');
    grid.fillBox(-2, 2, -2, 2, -5, 15, 'dark');
    for (let z = -6; z <= 9; z += 1) {
        const span = Math.round(5 + (z + 6) * 0.62);
        const inner = Math.max(3, Math.round(4 - (z + 6) * 0.05));
        grid.fillBox(-span, -inner, 0, 0, z, z, 'hull');
        grid.fillBox(inner, span, 0, 0, z, z, 'hull');
        grid.set(-span, 0, z, 'accent');
        grid.set(span, 0, z, 'accent');
    }
    grid.fillBox(-4, -2, -1, 1, 11, 20, 'dark');
    grid.fillBox(2, 4, -1, 1, 11, 20, 'dark');
    grid.fillBox(-3, -2, -1, 1, 20, 20, 'engine');
    grid.fillBox(2, 3, -1, 1, 20, 20, 'engine');
    grid.fillBox(-9, -8, -1, 0, -12, -4, 'dark');
    grid.fillBox(8, 9, -1, 0, -12, -4, 'dark');
    markCanopy(grid, -1, 1, -12, -5, 2);
    grid.fillBox(0, 0, 2, 2, -3, 8, 'accent');
    return { grid, unit: 0.23, enginePorts: [[-2.5, 0, 20.7], [2.5, 0, 20.7]] };
};
const buildTalon = () => {
    const grid = new VoxelGrid();
    fillTaperedBody(grid, -18, 16, (t) => ({
        width: t < 0.25 ? 1.2 + t * 9 : t < 0.7 ? 3.7 : 3.7 - (t - 0.7) * 5,
        height: t < 0.28 ? 0.8 + t * 4 : 1.7,
    }), 'hull');
    grid.fillBox(-2, 2, -2, 1, -3, 15, 'dark');
    for (let z = -12; z <= 10; z += 1) {
        const centerBias = 1 - Math.abs(z + 1) / 13;
        const span = Math.max(5, Math.round(9 + centerBias * 8));
        const inner = z < -5 ? 2 : 3;
        grid.fillBox(-span, -inner, 0, 0, z, z, z < -8 ? 'dark' : 'hull');
        grid.fillBox(inner, span, 0, 0, z, z, z < -8 ? 'dark' : 'hull');
        if (z % 3 === 0) {
            grid.set(-span, 0, z, 'accent');
            grid.set(span, 0, z, 'accent');
        }
    }
    grid.line([-17, 0, -8], [-13, 2, -15], 0, 'accent');
    grid.line([17, 0, -8], [13, 2, -15], 0, 'accent');
    grid.fillBox(-7, -4, -1, 1, 10, 19, 'dark');
    grid.fillBox(4, 7, -1, 1, 10, 19, 'dark');
    grid.fillBox(-6, -5, -1, 1, 19, 19, 'engine');
    grid.fillBox(5, 6, -1, 1, 19, 19, 'engine');
    markCanopy(grid, -2, 2, -10, -3, 2);
    grid.fillBox(-1, 1, 2, 2, -1, 7, 'warning');
    return { grid, unit: 0.235, enginePorts: [[-5.5, 0, 19.7], [5.5, 0, 19.7]] };
};
const buildWarden = () => {
    const grid = new VoxelGrid();
    fillTaperedBody(grid, -17, 18, (t) => ({
        width: t < 0.18 ? 1.5 + t * 17 : t < 0.78 ? 4.7 : 4.7 - (t - 0.78) * 6,
        height: t < 0.2 ? 1 + t * 7 : 2.5,
    }), 'hull');
    grid.fillBox(-4, 4, -3, 2, -2, 16, 'dark');
    grid.fillBox(-12, -4, -1, 1, -3, 11, 'hull');
    grid.fillBox(4, 12, -1, 1, -3, 11, 'hull');
    grid.fillBox(-11, -8, -2, 2, 5, 14, 'dark');
    grid.fillBox(8, 11, -2, 2, 5, 14, 'dark');
    grid.fillBox(-6, -4, 2, 7, 10, 18, 'dark');
    grid.fillBox(4, 6, 2, 7, 10, 18, 'dark');
    for (const x of [-8, -3, 3, 8]) {
        grid.fillBox(x - 1, x + 1, -2, 1, 14, 21, 'dark');
        grid.fillBox(x, x, -1, 1, 21, 21, 'engine');
    }
    markCanopy(grid, -2, 2, -10, -3, 3);
    grid.fillBox(-12, -12, 1, 1, -1, 8, 'accent');
    grid.fillBox(12, 12, 1, 1, -1, 8, 'accent');
    grid.fillBox(-1, 1, 3, 3, 1, 7, 'window');
    return {
        grid,
        unit: 0.24,
        enginePorts: [[-8, 0, 21.7], [-3, 0, 21.7], [3, 0, 21.7], [8, 0, 21.7]],
    };
};
const buildProspector = () => {
    const grid = new VoxelGrid();
    fillTaperedBody(grid, -16, 16, (t) => ({
        width: t < 0.22 ? 1.3 + t * 12 : t < 0.75 ? 4.2 : 4.2 - (t - 0.75) * 5,
        height: t < 0.22 ? 0.8 + t * 5 : 2.2,
    }), 'hull');
    grid.fillBox(-3, 3, -3, 2, -2, 15, 'dark');
    for (const side of [-1, 1]) {
        const x0 = side < 0 ? -11 : 7;
        const x1 = side < 0 ? -7 : 11;
        grid.fillBox(x0, x1, -3, 3, -3, 16, 'hull');
        grid.fillBox(x0, x1, -1, 1, 2, 7, 'accent');
        grid.line([side * 5, -1, -12], [side * 7, -1, -25], 1, 'dark');
        grid.line([side * 7, -1, -25], [side * 7, -1, -29], 0, 'warning');
        grid.fillBox(side * 9 - 1, side * 9 + 1, -2, 2, 13, 21, 'dark');
        grid.fillBox(side * 9, side * 9, -1, 1, 21, 21, 'engine');
    }
    markCanopy(grid, -2, 2, -11, -4, 3);
    grid.fillBox(-1, 1, 2, 2, 0, 8, 'window');
    return { grid, unit: 0.235, enginePorts: [[-9, 0, 21.7], [9, 0, 21.7]] };
};
const buildLancer = () => {
    const grid = new VoxelGrid();
    fillTaperedBody(grid, -26, 17, (t) => ({
        width: t < 0.3 ? 0.7 + t * 7 : t < 0.72 ? 2.8 : 2.8 - (t - 0.72) * 2.7,
        height: t < 0.3 ? 0.6 + t * 3.5 : 1.5,
    }), 'hull');
    grid.fillBox(-2, 2, -2, 1, -6, 16, 'dark');
    for (let z = -12; z <= 11; z += 1) {
        const t = (z + 12) / 23;
        const span = Math.round(4 + t * 12);
        grid.fillBox(-span, -2, 0, 0, z, z, 'hull');
        grid.fillBox(2, span, 0, 0, z, z, 'hull');
        if (z % 4 === 0) {
            grid.set(-span, 0, z, 'accent');
            grid.set(span, 0, z, 'accent');
        }
    }
    for (const side of [-1, 1]) {
        grid.fillBox(side * 7 - 1, side * 7 + 1, -1, 0, -22, -7, 'dark');
        grid.fillBox(side * 12 - 1, side * 12 + 1, -1, 0, -18, -4, 'dark');
    }
    for (const x of [-4, 0, 4]) {
        grid.fillBox(x - 1, x + 1, -1, 1, 12, 21, 'dark');
        grid.fillBox(x, x, -1, 1, 21, 21, 'engine');
    }
    markCanopy(grid, -1, 1, -14, -7, 2);
    grid.fillBox(-1, 1, 2, 2, -4, 5, 'accent');
    return { grid, unit: 0.225, enginePorts: [[-4, 0, 21.7], [0, 0, 21.7], [4, 0, 21.7]] };
};
const buildAtlasFreighter = () => {
    const grid = new VoxelGrid();
    grid.fillBox(-3, 3, -3, 3, -34, 34, 'dark');
    fillTaperedBody(grid, -38, -18, (t) => ({ width: 1 + t * 6, height: 1 + t * 3 }), 'hull');
    grid.fillBox(-6, 6, -4, 4, -23, -10, 'hull');
    grid.fillBox(-4, 4, 4, 8, -28, -15, 'dark');
    markCanopy(grid, -3, 3, -28, -19, 9);
    const cargoZ = [-8, 8, 24];
    for (const z of cargoZ) {
        for (const side of [-1, 1]) {
            const cx = side * 13;
            grid.fillBox(cx - 6, cx + 6, -6, 6, z - 7, z + 7, 'hull');
            grid.fillBox(cx - 6, cx + 6, -1, 1, z - 7, z + 7, 'accent');
            grid.fillBox(cx - 2, cx + 2, -7, -7, z - 5, z + 5, 'dark');
            grid.line([side * 4, 0, z], [side * 7, 0, z], 1, 'dark');
        }
    }
    grid.fillBox(-11, 11, -4, 4, 29, 38, 'dark');
    for (const x of [-9, -3, 3, 9]) {
        grid.fillBox(x - 2, x + 2, -3, 3, 32, 42, 'dark');
        grid.fillBox(x - 1, x + 1, -2, 2, 42, 42, 'engine');
    }
    grid.fillBox(-1, 1, 5, 5, -11, 28, 'window');
    grid.fillBox(-16, -16, 7, 7, -4, 25, 'warning');
    grid.fillBox(16, 16, 7, 7, -4, 25, 'warning');
    return {
        grid,
        unit: 0.34,
        enginePorts: [[-9, 0, 42.8], [-3, 0, 42.8], [3, 0, 42.8], [9, 0, 42.8]],
    };
};
const SHIP_BUILDERS = {
    kestrel: buildKestrel,
    talon: buildTalon,
    warden: buildWarden,
    prospector: buildProspector,
    lancer: buildLancer,
    'atlas-freighter': buildAtlasFreighter,
};
export const shipVariantForRole = (role) => {
    switch (role) {
        case 'trader':
            return 'atlas-freighter';
        case 'miner':
            return 'prospector';
        case 'patrol':
            return 'warden';
        case 'pirate':
            return 'talon';
        case 'bounty':
            return 'lancer';
        case 'escort':
            return 'kestrel';
    }
};
// The player's purchasable hulls map onto the shared voxel builders so the
// cockpit schematic can draw the same silhouette the hangar renders in 3D.
export const playerShipVariant = (shipId) => (shipId === 'vanguard' ? 'warden' : 'kestrel');
const profileCache = new Map();
// A top-down hull schematic for the cockpit monitors: the ship's voxel footprint
// projected onto its XZ plane, returned as the set of filled columns plus the
// boundary edge segments between filled and empty columns.
export const shipTopDownProfile = (variant) => {
    if (profileCache.has(variant))
        return profileCache.get(variant);
    const builder = SHIP_BUILDERS[variant] ?? SHIP_BUILDERS.kestrel;
    const { grid } = builder();
    const filled = new Set();
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const key of grid.cells.keys()) {
        const parts = key.split(',');
        const x = Number(parts[0]);
        const z = Number(parts[2]);
        const column = `${x},${z}`;
        if (filled.has(column))
            continue;
        filled.add(column);
        if (x < minX)
            minX = x;
        if (x > maxX)
            maxX = x;
        if (z < minZ)
            minZ = z;
        if (z > maxZ)
            maxZ = z;
    }
    const edges = [];
    const isFilled = (x, z) => filled.has(`${x},${z}`);
    for (const column of filled) {
        const parts = column.split(',');
        const x = Number(parts[0]);
        const z = Number(parts[1]);
        if (!isFilled(x + 1, z))
            edges.push([x + 1, z, x + 1, z + 1]);
        if (!isFilled(x - 1, z))
            edges.push([x, z, x, z + 1]);
        if (!isFilled(x, z + 1))
            edges.push([x, z + 1, x + 1, z + 1]);
        if (!isFilled(x, z - 1))
            edges.push([x, z, x + 1, z]);
    }
    const profile = {
        minX,
        maxX,
        minZ,
        maxZ,
        edges,
        cells: Array.from(filled, (column) => {
            const parts = column.split(',');
            return [Number(parts[0]), Number(parts[1])];
        }),
    };
    profileCache.set(variant, profile);
    return profile;
};
export const paletteForFaction = (faction, hostile) => {
    if (hostile) {
        return {
            hull: 0x71443d,
            dark: 0x241818,
            accent: 0xc84b35,
            canopy: 0xff6a45,
            engine: 0xff7a3f,
            warning: 0xf0b24d,
            window: 0xffb359,
        };
    }
    switch (faction) {
        case 'concord':
            return {
                hull: 0x839ba4,
                dark: 0x26333a,
                accent: 0x68c6e4,
                canopy: 0x7fe5f3,
                engine: 0x6ad9f1,
                warning: 0xe7794a,
                window: 0x9be9ef,
            };
        case 'frontier-miners':
            return {
                hull: 0x9a8a68,
                dark: 0x342d24,
                accent: 0xd6aa4d,
                canopy: 0x7dcfc6,
                engine: 0xe8bd59,
                warning: 0xe46d43,
                window: 0xa5ddd0,
            };
        case 'salvage-union':
            return {
                hull: 0x738c86,
                dark: 0x25322f,
                accent: 0x79b4a6,
                canopy: 0x86d8c7,
                engine: 0x73d6c3,
                warning: 0xd88045,
                window: 0xa7e7d8,
            };
        case 'free-merchants':
            return {
                hull: 0x97876b,
                dark: 0x302b24,
                accent: 0xd39b52,
                canopy: 0x65d7c3,
                engine: 0x6ad9f1,
                warning: 0xdf7140,
                window: 0x98e7d4,
            };
        case 'red-talons':
            return {
                hull: 0x71443d,
                dark: 0x241818,
                accent: 0xc84b35,
                canopy: 0xff6a45,
                engine: 0xff7a3f,
                warning: 0xf0b24d,
                window: 0xffb359,
            };
    }
};
const createVoxelMeshes = (grid, unit, palette, roughness, metalness) => {
    const group = new THREE.Group();
    // Glossy painted metal: a clearcoat over a faceted hull so the low-poly ship
    // catches the environment map and reads like a Rebel Galaxy Outlaw hull rather
    // than flat matte voxels.
    const hullMaterial = new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness,
        metalness,
        flatShading: true,
        emissive: 0x020303,
        emissiveIntensity: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.22,
        envMapIntensity: 1.35,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
        vertexColors: true,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: false,
    });
    const hullGeometry = grid.buildGeometry(unit, palette, new Set(['hull', 'dark', 'accent']));
    const glowGeometry = grid.buildGeometry(unit, palette, new Set(['canopy', 'engine', 'warning', 'window']));
    const hull = new THREE.Mesh(hullGeometry, hullMaterial);
    hull.name = 'voxel-hull';
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.name = 'voxel-glow';
    // Fresnel rim: an inflated copy of the hull that glows at grazing angles, giving
    // every ship a neon edge-light in its faction accent.
    const rimMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(palette.accent ?? palette.engine ?? 0x6ad9f1) },
            uIntensity: { value: 1.05 },
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vView;
            void main() {
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vNormal = normalize(normalMatrix * normal);
                vView = normalize(-mv.xyz);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: `
            uniform vec3 uColor;
            uniform float uIntensity;
            varying vec3 vNormal;
            varying vec3 vView;
            void main() {
                float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
                gl_FragColor = vec4(uColor * fresnel * uIntensity, fresnel);
            }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
    });
    const rimGeometry = hullGeometry.clone();
    const inset = unit * 0.55;
    const rimPos = rimGeometry.getAttribute('position');
    const rimNorm = rimGeometry.getAttribute('normal');
    for (let index = 0; index < rimPos.count; index += 1) {
        rimPos.setXYZ(index, rimPos.getX(index) + rimNorm.getX(index) * inset, rimPos.getY(index) + rimNorm.getY(index) * inset, rimPos.getZ(index) + rimNorm.getZ(index) * inset);
    }
    rimPos.needsUpdate = true;
    rimGeometry.computeBoundingSphere();
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.name = 'hull-rim';
    rim.renderOrder = 2;
    group.add(hull, glow, rim);
    group.userData.rimMaterial = rimMaterial;
    return { group, hullMaterial, glowMaterial, rimMaterial };
};
export const createVoxelShipModel = (variant, palette) => {
    const blueprint = SHIP_BUILDERS[variant]();
    const { group, hullMaterial, glowMaterial, rimMaterial } = createVoxelMeshes(blueprint.grid, blueprint.unit, palette, 0.42, 0.25);
    group.name = `voxel-ship-${variant}`;
    group.userData.baseScale = 1;
    group.userData.variant = variant;
    return {
        group,
        variant,
        enginePorts: blueprint.enginePorts.map(([x, y, z]) => new THREE.Vector3(x * blueprint.unit, y * blueprint.unit, z * blueprint.unit)),
        hullMaterial,
        glowMaterial,
        rimMaterial,
    };
};
const addHelixWindows = (grid, radius, x) => {
    for (let index = 0; index < 24; index += 1) {
        const angle = (index / 24) * Math.PI * 2;
        const y = Math.round(Math.cos(angle) * radius);
        const z = Math.round(Math.sin(angle) * radius);
        grid.fillBox(x - 1, x + 1, y, y, z, z, index % 5 === 0 ? 'warning' : 'window');
    }
};
const buildHelixStation = () => {
    const palette = {
        hull: 0x8d856e,
        dark: 0x292b27,
        accent: 0xd99d46,
        canopy: 0x6bd8c1,
        engine: 0x6bd8c1,
        warning: 0xe66c3f,
        window: 0x62d8c0,
    };
    const unit = 1.28;
    const staticGrid = new VoxelGrid();
    staticGrid.fillCylinderX(-35, 34, 4.5, 'hull');
    for (const x of [-28, -14, 0, 14, 28])
        staticGrid.fillCylinderX(x - 1, x + 1, 7, 'dark');
    staticGrid.fillCylinderX(-43, -31, 5.5, 'dark', -9, 0);
    staticGrid.fillCylinderX(-43, -31, 5.5, 'hull', 0, 0);
    staticGrid.fillCylinderX(-43, -31, 5.5, 'dark', 9, 0);
    staticGrid.fillBox(-48, -44, -15, 15, -7, 7, 'dark');
    staticGrid.fillBox(-49, -49, -13, 13, -5, 5, 'warning');
    staticGrid.fillCylinderX(30, 47, 10, 'dark');
    staticGrid.fillRingX(46, 48, 8, 1.5, 'hull');
    addHelixWindows(staticGrid, 8, 48);
    staticGrid.fillBox(49, 49, -6, 6, -6, 6, 'dark');
    for (const side of [-1, 1]) {
        staticGrid.fillBox(-10, 20, side * 10 - 1, side * 10 + 1, -2, 2, 'dark');
        staticGrid.fillBox(12, 20, side * 13 - 1, side * 13 + 1, -7, 7, 'hull');
        staticGrid.fillBox(20, 20, side * 13, side * 13, -5, 5, 'window');
    }
    for (let index = 0; index < 8; index += 1) {
        const z = -24 + index * 7;
        staticGrid.fillBox(-22, -14, -3, 3, z, z + 2, index % 2 ? 'hull' : 'dark');
        staticGrid.fillBox(-18, -18, 4, 4, z, z + 2, index % 3 === 0 ? 'warning' : 'window');
    }
    staticGrid.line([-5, 7, -4], [-5, 25, -10], 1, 'dark');
    staticGrid.line([5, 7, 4], [5, 25, 10], 1, 'dark');
    staticGrid.set(-5, 26, -10, 'warning');
    staticGrid.set(5, 26, 10, 'window');
    const rotorGrid = new VoxelGrid();
    rotorGrid.fillRingX(-2, 2, 22, 2.5, 'hull');
    rotorGrid.fillRingX(-1, 1, 15, 1.2, 'dark');
    for (let index = 0; index < 12; index += 1) {
        const angle = (index / 12) * Math.PI * 2;
        const y = Math.round(Math.cos(angle) * 22);
        const z = Math.round(Math.sin(angle) * 22);
        rotorGrid.line([0, 0, 0], [0, Math.round(Math.cos(angle) * 18), Math.round(Math.sin(angle) * 18)], 0, 'dark');
        rotorGrid.fillBox(-4, 4, y - 3, y + 3, z - 3, z + 3, index % 2 ? 'dark' : 'hull');
        rotorGrid.fillBox(4, 4, y - 1, y + 1, z - 1, z + 1, index % 3 === 0 ? 'warning' : 'window');
    }
    const root = new THREE.Group();
    root.name = 'helix-voxel-station';
    const staticMeshes = createVoxelMeshes(staticGrid, unit, palette, 0.72, 0.5).group;
    const rotor = createVoxelMeshes(rotorGrid, unit, palette, 0.74, 0.5).group;
    rotor.name = 'rotor';
    rotor.userData.rotationAxis = 'x';
    root.add(staticMeshes, rotor);
    return root;
};
const buildRookStation = () => {
    const palette = {
        hull: 0x8fa3a7,
        dark: 0x27343b,
        accent: 0x6cc6df,
        canopy: 0x7fe5f3,
        engine: 0x7fe5f3,
        warning: 0xe56343,
        window: 0x78d8e9,
    };
    const unit = 1.34;
    const grid = new VoxelGrid();
    grid.fillBox(-10, 10, -9, 9, -18, 18, 'hull');
    grid.fillBox(-8, 8, 10, 14, -22, 22, 'dark');
    grid.fillBox(-8, 8, -14, -10, -22, 22, 'dark');
    grid.fillBox(-14, 14, -6, 6, -23, -18, 'dark');
    grid.fillBox(-14, 14, -6, 6, 18, 23, 'dark');
    grid.fillBox(-6, 6, -6, 6, 23, 34, 'dark');
    grid.fillRingX(-1, 1, 6, 1.5, 'hull');
    for (let index = 0; index < 12; index += 1) {
        const angle = (index / 12) * Math.PI * 2;
        grid.set(Math.round(Math.cos(angle) * 7), Math.round(Math.sin(angle) * 7), 35, index % 4 === 0 ? 'warning' : 'window');
    }
    const armDirections = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    armDirections.forEach(([dx, dy], armIndex) => {
        for (let step = 11; step <= 32; step += 1) {
            const x = dx * step;
            const y = dy * step;
            grid.fillBox(x - (dy !== 0 ? 3 : 1), x + (dy !== 0 ? 3 : 1), y - (dx !== 0 ? 3 : 1), y + (dx !== 0 ? 3 : 1), -5, 9, 'dark');
        }
        const px = dx * 34;
        const py = dy * 34;
        grid.fillBox(px - 6, px + 6, py - 6, py + 6, -10, 13, 'hull');
        grid.fillBox(px - 4, px + 4, py - 4, py + 4, 14, 20, 'dark');
        grid.fillBox(px - 2, px + 2, py - 2, py + 2, 20, 27, 'dark');
        const barrelStart = [px, py, 27];
        const barrelEnd = [px + dx * 4, py + dy * 4, 35];
        grid.line(barrelStart, barrelEnd, 1, 'dark');
        grid.set(barrelEnd[0], barrelEnd[1], barrelEnd[2], armIndex === 2 ? 'warning' : 'accent');
        grid.fillBox(px - 3, px + 3, py - 3, py + 3, -12, -11, armIndex % 2 ? 'warning' : 'window');
    });
    for (const x of [-8, 0, 8]) {
        grid.line([x, 14, -9], [x, 28 + Math.abs(x) * 0.3, -14 + x * 0.4], 0, 'dark');
        grid.set(x, Math.round(29 + Math.abs(x) * 0.3), Math.round(-14 + x * 0.4), x === 0 ? 'warning' : 'window');
    }
    for (const y of [-7, 0, 7]) {
        grid.fillBox(-11, -11, y, y, -13, 13, y === 0 ? 'warning' : 'window');
        grid.fillBox(11, 11, y, y, -13, 13, y === 0 ? 'warning' : 'window');
    }
    const root = createVoxelMeshes(grid, unit, palette, 0.79, 0.48).group;
    root.name = 'rook-voxel-station';
    return root;
};
export const createVoxelStationModel = (id) => id === 'helix' ? buildHelixStation() : buildRookStation();
