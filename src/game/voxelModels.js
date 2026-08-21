import * as THREE from 'three';
import { SHIPS } from './data.js';
import { GLB_TOP_DOWN_PROFILES } from './shipProfiles.js';
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
// Helpers for the RGO-style redesign pass.
// `addStripe` paints a thin emissive stripe along a span of z cells — useful
// for engine manifolds and hull trim. seed pushes a hue via accent/warning.
const addStripe = (grid, y, z0, z1, material) => {
    grid.fillBox(-1, 1, y, y, z0, z1, material);
};
// Antennas / stabilizer fins: thin greebling that makes the silhouette
// readable from a distance. `width` is the run along z, `wing` is the
// outward offset on the +x / -x side.
const addFin = (grid, side, anchorX, tipX, y, z0, z1, material = 'dark') => {
    for (let z = z0; z <= z1; z += 1) {
        const t = (z - z0) / Math.max(1, z1 - z0);
        const x = Math.round(anchorX + (tipX - anchorX) * t);
        const thickness = Math.max(0, Math.round((1 - t) * 1.5));
        if (thickness === 0) {
            grid.set(x * side, y, z, material);
        }
        else {
            grid.fillBox(x * side, x * side, y - thickness, y + thickness, z, z, material);
        }
    }
};
// Wing-tip nav lights: a single red/green emissive voxel at every wingtip —
// RGO ships always have these and they're the cheapest "this is a real ship"
// cue you can add.
const addNavLights = (grid, lights) => {
    for (const [x, y, z, kind] of lights) {
        if (kind === 'red') grid.set(x, y, z, 'warning');
        else if (kind === 'green') grid.set(x, y, z, 'accent');
        else grid.set(x, y, z, 'window');
    }
};
// Long engine plume cap: a trailing emissive beacon inside a darker skirt,
// for "this fighter just lit its afterburner" look.
const addEnginePlume = (grid, x, y, nose, tail, material = 'engine') => {
    grid.fillBox(x, x, y - 1, y + 1, nose, tail, 'dark');
    grid.fillBox(x, x, y, y, nose + 1, tail - 1, material);
};
const buildKestrel = () => {
    const grid = new VoxelGrid();
    // Sharper, longer nose + broader swept wings — a more chiseled
    // RGO-style silhouette than the older stubby-arrow version.
    fillTaperedBody(grid, -28, 18, (t) => ({
        width: t < 0.18 ? 0.5 + t * 9 : t < 0.74 ? 3.4 : 2.7 - (t - 0.74) * 2.8,
        height: t < 0.22 ? 0.6 + t * 4 : 1.7,
    }), 'hull');
    // Long belly spine (gives the ship a snaky read from the side).
    grid.fillBox(-2, 2, -2, 0, -4, 17, 'dark');
    addStripe(grid, 1, -4, 17, 'accent');
    // Swept wings — wider on the aft half where the engines flare.
    for (let z = -4; z <= 11; z += 1) {
        const span = Math.round(4 + (z + 4) * 0.72);
        const inner = Math.max(3, Math.round(4 - (z + 4) * 0.06));
        grid.fillBox(-span, -inner, 0, 1, z, z, 'hull');
        grid.fillBox(inner, span, 0, 1, z, z, 'hull');
        // Per-wing-tip nav light, alternating red/green for the silhouette read.
        if (z % 4 === 0) {
            grid.set(-span, 1, z, z % 8 === 0 ? 'warning' : 'accent');
            grid.set(span, 1, z, z % 8 === 0 ? 'accent' : 'warning');
        }
    }
    // Wingtip extensions (small fins that bow outward past the wing).
    addFin(grid, -1, 4, 12, 0, 4, 12, 'hull');
    addFin(grid, 1, 4, 12, 0, 4, 12, 'hull');
    // Twin engine cluster (was buried deep before; now reads as a thruster
    // block with a glowing cap).
    grid.fillBox(-3, -1, -1, 1, 12, 19, 'dark');
    grid.fillBox(1, 3, -1, 1, 12, 19, 'dark');
    addEnginePlume(grid, -2, 0, 19, 23, 'engine');
    addEnginePlume(grid, 2, 0, 19, 23, 'engine');
    // Forward-swept antennas on the spine.
    grid.line([0, 2, -8], [0, 4, -16], 0, 'dark');
    grid.line([0, 2, -8], [1, 5, -18], 0, 'dark');
    // Cockpit with a tinted upper canopy.
    markCanopy(grid, -1, 1, -14, -7, 2);
    addStripe(grid, 3, -14, -7, 'warning');
    // Belly warning stripe.
    addStripe(grid, -2, -2, 16, 'window');
    return {
        grid,
        unit: 0.235,
        enginePorts: [[-2, 0, 23.7], [2, 0, 23.7]],
    };
};
const buildTalon = () => {
    const grid = new VoxelGrid();
    // Bigger, more aggressive wing plan; pirate alloy has darker shards
    // embedded in the hull seams.
    fillTaperedBody(grid, -22, 19, (t) => ({
        width: t < 0.22 ? 1 + t * 9 : t < 0.72 ? 4.0 : 3.8 - (t - 0.72) * 6,
        height: t < 0.28 ? 0.7 + t * 4 : 1.7,
    }), 'hull');
    // Asymmetric damage: left wing has a notched-out chunk from the front.
    grid.fillBox(-3, -3, 0, 1, -12, -7, 'dark');
    // Belly spike for the RGO asymmetric silhouette.
    grid.fillBox(-2, 2, -3, -3, -8, 12, 'dark');
    addStripe(grid, -4, -6, 12, 'warning');
    // Razor wings with negative sweep at the tips (folds inward).
    for (let z = -10; z <= 12; z += 1) {
        const centerBias = 1 - Math.abs(z + 1) / 14;
        const span = Math.max(5, Math.round(10 + centerBias * 10));
        const inner = z < -3 ? 2 : 3;
        grid.fillBox(-span, -inner, 0, 1, z, z, z < -6 ? 'dark' : 'hull');
        grid.fillBox(inner, span, 0, 1, z, z, z < -6 ? 'dark' : 'hull');
        if (z % 3 === 0) {
            grid.set(-span, 1, z, 'accent');
            grid.set(span, 1, z, 'accent');
        }
    }
    // Wingtip dagger-fin extensions.
    addFin(grid, -1, 10, 16, 0, -2, 14, 'dark');
    addFin(grid, 1, 10, 16, 0, -2, 14, 'dark');
    // Twin engine cluster with longer plumes (hostile ships run hotter).
    grid.fillBox(-7, -4, -1, 1, 13, 19, 'dark');
    grid.fillBox(4, 7, -1, 1, 13, 19, 'dark');
    addEnginePlume(grid, -5.5, 0, 19, 24, 'engine');
    addEnginePlume(grid, 5.5, 0, 19, 24, 'engine');
    // Side-mounted gun pods.
    grid.fillBox(-9, -8, 0, 0, 4, 10, 'dark');
    grid.fillBox(8, 9, 0, 0, 4, 10, 'dark');
    grid.fillBox(-9, -9, 0, 0, 6, 8, 'warning');
    grid.fillBox(9, 9, 0, 0, 6, 8, 'warning');
    // Forward antenna pair.
    grid.line([-2, 2, -8], [-3, 5, -16], 0, 'dark');
    grid.line([2, 2, -8], [3, 5, -16], 0, 'dark');
    markCanopy(grid, -2, 2, -11, -3, 2);
    addStripe(grid, 3, -11, -3, 'warning');
    return {
        grid,
        unit: 0.24,
        enginePorts: [[-5.5, 0, 24.7], [5.5, 0, 24.7]],
    };
};
const buildWarden = () => {
    const grid = new VoxelGrid();
    fillTaperedBody(grid, -22, 21, (t) => ({
        width: t < 0.16 ? 1.4 + t * 22 : t < 0.78 ? 5.2 : 4.8 - (t - 0.78) * 7,
        height: t < 0.2 ? 1 + t * 8 : 2.7,
    }), 'hull');
    // Belly spine + carbon streaks.
    grid.fillBox(-4, 4, -3, 1, -2, 19, 'dark');
    addStripe(grid, 2, -2, 19, 'accent');
    // Wider sweep wings with strong nav lights.
    grid.fillBox(-13, -4, -1, 1, -3, 13, 'hull');
    grid.fillBox(4, 13, -1, 1, -3, 13, 'hull');
    addNavLights(grid, [[-13, 1, 4, 'green'], [13, 1, 4, 'red'], [-13, 1, 10, 'green'], [13, 1, 10, 'red']]);
    // Aft flank thrusters that come out of the wing shoulders.
    grid.fillBox(-12, -9, -2, 2, 6, 15, 'dark');
    grid.fillBox(9, 12, -2, 2, 6, 15, 'dark');
    grid.fillBox(-6, -4, 2, 7, 11, 19, 'dark');
    grid.fillBox(4, 6, 2, 7, 11, 19, 'dark');
    // Four-engine cluster with extra-long plumes (Concord patrol has the
    // largest engine bay of any escort).
    for (const [x, y, z0, z1] of [[-8, 0, 14, 21], [-3, 0, 14, 21], [3, 0, 14, 21], [8, 0, 21, 25]]) {
        addEnginePlume(grid, x, y, z0, z1, 'engine');
    }
    // Tail fins flanking the engine block.
    addFin(grid, -1, 4, 10, 1, 14, 20, 'dark');
    addFin(grid, 1, 4, 10, 1, 14, 20, 'dark');
    // Top antenna array + radar dish.
    markCanopy(grid, -2, 2, -10, -3, 3);
    grid.line([0, 3, -8], [0, 6, -14], 0, 'dark');
    grid.set(0, 6, -14, 'window');
    grid.fillBox(-1, 1, 3, 3, 1, 7, 'window');
    return {
        grid,
        unit: 0.245,
        enginePorts: [[-8, 0, 25.7], [-3, 0, 25.7], [3, 0, 25.7], [8, 0, 25.7]],
    };
};
const buildProspector = () => {
    const grid = new VoxelGrid();
    fillTaperedBody(grid, -19, 18, (t) => ({
        width: t < 0.22 ? 1.2 + t * 14 : t < 0.74 ? 4.5 : 4.4 - (t - 0.74) * 6,
        height: t < 0.22 ? 0.8 + t * 6 : 2.4,
    }), 'hull');
    grid.fillBox(-3, 3, -3, 2, -2, 17, 'dark');
    // Twin retractable mining arms (asymmetric: one tucked, one extended).
    for (const [side, extended] of [[-1, false], [1, true]]) {
        const x0 = side < 0 ? -11 : 7;
        const x1 = side < 0 ? -7 : 11;
        grid.fillBox(x0, x1, -3, 3, -3, 17, 'hull');
        grid.fillBox(x0, x1, -1, 1, 2, 7, 'accent');
        // Drill head always visible at the end of each arm.
        grid.fillBox(side * 12 - 1, side * 12 + 1, -2, 2, extended ? 2 : -2, 8, 'dark');
        grid.fillBox(side * 12, side * 12, -1, 1, extended ? -3 : 0, extended ? 0 : 4, 'warning');
        // Tether cable running belly->drill.
        grid.line([side * 5, -1, -12], [side * 7, -1, extended ? -25 : -22], 1, 'dark');
        grid.line([side * 7, -1, extended ? -25 : -22], [side * 7, -1, extended ? -30 : -27], 0, 'warning');
        // Engine cluster placed aft of the drill arm position.
        grid.fillBox(side * 9 - 1, side * 9 + 1, -2, 2, 13, 21, 'dark');
        addEnginePlume(grid, side * 9, 0, 21, 25, 'engine');
    }
    // Forward surveyor antenna.
    grid.line([0, 3, -10], [0, 6, -16], 0, 'dark');
    grid.set(0, 6, -16, 'accent');
    markCanopy(grid, -2, 2, -11, -4, 3);
    grid.fillBox(-1, 1, 2, 2, 0, 8, 'window');
    return {
        grid,
        unit: 0.24,
        enginePorts: [[-9, 0, 25.7], [9, 0, 25.7]],
    };
};
const buildLancer = () => {
    const grid = new VoxelGrid();
    // Razor-thin interceptor: longer nose + tail-stinger for the bounty hunter.
    fillTaperedBody(grid, -30, 19, (t) => ({
        width: t < 0.3 ? 0.5 + t * 8 : t < 0.7 ? 3.2 : 3.0 - (t - 0.7) * 4.2,
        height: t < 0.3 ? 0.5 + t * 4 : 1.5,
    }), 'hull');
    grid.fillBox(-2, 2, -2, 1, -6, 18, 'dark');
    // Razor delta wings — narrower but longer, with negative sweeps.
    for (let z = -10; z <= 13; z += 1) {
        const t = (z + 10) / 23;
        const span = Math.round(3 + t * 14);
        grid.fillBox(-span, -2, 0, 1, z, z, 'hull');
        grid.fillBox(2, span, 0, 1, z, z, 'hull');
        if (z % 4 === 0) {
            grid.set(-span, 1, z, 'warning');
            grid.set(span, 1, z, 'warning');
        }
    }
    // Twin forward-swept canards.
    for (const side of [-1, 1]) {
        grid.fillBox(side * 7 - 1, side * 7 + 1, -1, 0, -24, -10, 'dark');
        grid.fillBox(side * 12 - 1, side * 12 + 1, -1, 0, -19, -6, 'dark');
        grid.set(side * 12, 0, -19, 'accent');
    }
    // Three-engine cluster (the ripcord thrust to outrun police).
    for (const x of [-4, 0, 4]) {
        grid.fillBox(x - 1, x + 1, -1, 1, 13, 22, 'dark');
        addEnginePlume(grid, x, 0, 22, 27, 'engine');
    }
    // Dorsal spine antenna.
    markCanopy(grid, -1, 1, -16, -9, 2);
    addStripe(grid, 3, -16, -9, 'warning');
    grid.line([0, 4, -6], [0, 7, -10], 0, 'dark');
    return {
        grid,
        unit: 0.23,
        enginePorts: [[-4, 0, 27.7], [0, 0, 27.7], [4, 0, 27.7]],
    };
};
const buildAtlasFreighter = () => {
    const grid = new VoxelGrid();
    // Long central spine.
    grid.fillBox(-3, 3, -3, 3, -38, 38, 'dark');
    fillTaperedBody(grid, -42, -22, (t) => ({ width: 1 + t * 7, height: 1 + t * 3 }), 'hull');
    grid.fillBox(-6, 6, -4, 4, -27, -12, 'hull');
    grid.fillBox(-4, 4, 4, 8, -32, -19, 'dark');
    markCanopy(grid, -3, 3, -32, -23, 9);
    addStripe(grid, 10, -32, -23, 'warning');
    // Four cargo pods (two per side) instead of three — bigger silhouette
    // for the long-haul hauler.
    const cargoZ = [-12, -2, 10, 22];
    for (const z of cargoZ) {
        for (const side of [-1, 1]) {
            const cx = side * 14;
            const podHeight = Math.abs(z) > 10 ? 6 : 5;
            grid.fillBox(cx - 7, cx + 7, -podHeight, podHeight, z - 6, z + 6, 'hull');
            // Window strips on the pod so it reads as occupied.
            grid.fillBox(cx - 6, cx + 6, -1, 1, z - 5, z + 5, 'window');
            grid.fillBox(cx - 2, cx + 2, -podHeight - 1, -podHeight - 1, z - 4, z + 4, 'dark');
            // Connector strut from spine to pod.
            grid.line([side * 4, 0, z], [side * 7, 0, z], 1, 'dark');
            grid.set(side * 7, 0, z, 'accent');
        }
    }
    // Industrial radiator vents under the belly between cargo pods.
    for (const z of [-7, 5, 17]) {
        grid.fillBox(-2, 2, -5, -5, z - 1, z + 1, 'warning');
    }
    // Aft engine housing — wider than before.
    grid.fillBox(-12, 12, -5, 5, 33, 42, 'dark');
    addStripe(grid, 6, 33, 42, 'window');
    for (const x of [-9, -3, 3, 9]) {
        grid.fillBox(x - 2, x + 2, -3, 3, 36, 46, 'dark');
        addEnginePlume(grid, x, 0, 46, 52, 'engine');
    }
    // Dorsal antenna + long-running lights.
    addStripe(grid, 5, -32, 30, 'window');
    grid.line([0, 9, -28], [0, 14, -38], 0, 'dark');
    grid.set(0, 14, -38, 'warning');
    // Wing-tip nav lights.
    addNavLights(grid, [[-16, 7, -4, 'green'], [16, 7, -4, 'red'], [-16, 7, 24, 'green'], [16, 7, 24, 'red'], [-16, 7, 12, 'green'], [16, 7, 12, 'red']]);
    return {
        grid,
        unit: 0.35,
        enginePorts: [[-9, 0, 52.8], [-3, 0, 52.8], [3, 0, 52.8], [9, 0, 52.8]],
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
export const playerShipVariant = (shipId) => SHIPS[shipId]?.variant ?? 'kestrel';
const profileCache = new Map();
// A top-down hull schematic for the cockpit monitors: the ship's voxel footprint
// projected onto its XZ plane, returned as the set of filled columns plus the
// boundary edge segments between filled and empty columns.
export const shipTopDownProfile = (variant) => {
    if (profileCache.has(variant))
        return profileCache.get(variant);
    // Prefer the silhouette baked from the GLB hull (the model the game
    // actually flies); fall back to the voxel footprint for anything without
    // a GLB.
    const glb = GLB_TOP_DOWN_PROFILES[variant];
    if (glb) {
        const glbProfile = {
            minX: 0,
            maxX: glb.cols - 1,
            minZ: 0,
            maxZ: glb.rows - 1,
            edges: glb.edges,
            cells: glb.cells,
        };
        profileCache.set(variant, glbProfile);
        return glbProfile;
    }
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
        // The player's showroom paint: a neutral slate-and-amber livery that
        // reads as "your ship" without borrowing any faction's colors.
        case 'player':
            return {
                hull: 0x8a97a0,
                dark: 0x2a3238,
                accent: 0xe0a63f,
                canopy: 0x8ee0ef,
                engine: 0x7fd4ea,
                warning: 0xe7794a,
                window: 0xb4e6ee,
            };
    }
};
const createStationPaintTexture = (palette, seed) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    const base = new THREE.Color(palette.hull);
    const dark = new THREE.Color(palette.dark);
    const accent = new THREE.Color(palette.accent ?? palette.engine ?? 0xffffff);
    const baseHex = `#${base.getHexString()}`;
    const darkHex = `#${dark.getHexString()}`;
    const accentRgb = `${Math.round(accent.r * 255)}, ${Math.round(accent.g * 255)}, ${Math.round(accent.b * 255)}`;
    context.fillStyle = baseHex;
    context.fillRect(0, 0, 256, 256);
    // Pixelated noise so the painted hull reads as greebled sheet metal
    // rather than a plastic monotone.
    const rng = mulberry32(`${seed}:paint`);
    for (let y = 0; y < 256; y += 4) {
        for (let x = 0; x < 256; x += 4) {
            const variance = (rng() - 0.5) * 0.22;
            const row = base.clone().offsetHSL((rng() - 0.5) * 0.012, 0, variance);
            context.fillStyle = `#${row.getHexString()}`;
            context.fillRect(x, y, 4, 4);
        }
    }
    // Panel grid: every 64u a darker seam, every 32u a rivet row.
    context.strokeStyle = `rgba(${accentRgb}, 0.12)`;
    context.lineWidth = 2;
    for (let x = 0; x < 256; x += 64) {
        context.beginPath(); context.moveTo(x + 0.5, 0); context.lineTo(x + 0.5, 256); context.stroke();
    }
    for (let y = 0; y < 256; y += 64) {
        context.beginPath(); context.moveTo(0, y + 0.5); context.lineTo(256, y + 0.5); context.stroke();
    }
    context.strokeStyle = `rgba(0,0,0,0.6)`;
    context.lineWidth = 1;
    for (let x = 32; x < 256; x += 32) {
        context.beginPath(); context.moveTo(x + 0.5, 0); context.lineTo(x + 0.5, 256); context.stroke();
    }
    for (let y = 32; y < 256; y += 32) {
        context.beginPath(); context.moveTo(0, y + 0.5); context.lineTo(256, y + 0.5); context.stroke();
    }
    // Subtle rivets at panel intersections.
    context.fillStyle = darkHex;
    for (let y = 64; y < 256; y += 64) {
        for (let x = 64; x < 256; x += 64) {
            context.fillRect(x - 2, y - 2, 4, 4);
        }
    }
    // A handful of dark "weathering" streaks so the paint isn't sterile.
    context.fillStyle = `rgba(0,0,0,0.18)`;
    for (let i = 0; i < 12; i += 1) {
        const x = Math.floor(rng() * 240);
        const y = Math.floor(rng() * 240);
        context.fillRect(x, y, 6 + Math.floor(rng() * 14), 1);
    }
    // Bright accent chevrons at random — same accent color as the windows
    // so the hulls feel like they belong to the same colour family.
    context.fillStyle = `rgba(${accentRgb}, 0.9)`;
    for (let i = 0; i < 4; i += 1) {
        const x = Math.floor(rng() * 200);
        const y = Math.floor(rng() * 220);
        context.fillRect(x, y, 12, 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3.5, 3.5);
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
};
// Tiny mulberry32 keyed by string so the station paint variations stay
// deterministic for a given seed.
const mulberry32 = (seedString) => {
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
const createVoxelMeshes = (grid, unit, palette, roughness, metalness, hullMap = null) => {
    const group = new THREE.Group();
    // Glossy painted metal: a clearcoat over a faceted hull so the low-poly ship
    // catches the environment map and reads like a Rebel Galaxy Outlaw hull rather
    // than flat matte voxels. Stations may pass a hullMap so the paint panel
    // texture gets multiplied with the per-vertex faction color.
    const hullMaterial = new THREE.MeshPhysicalMaterial({
        map: hullMap,
        vertexColors: true,
        roughness,
        metalness,
        flatShading: true,
        emissive: 0x020303,
        emissiveIntensity: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.22,
        envMapIntensity: 1.85,
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
    // Fresnel rim: an inflated copy of the hull that glows at grazing angles.
    // Two-tone: sun-facing edges pick up a sodium-orange tint, shadow-facing
    // edges pick up cool cobalt, and the mid-band carries the faction accent.
    // This is the *distinct* Rebel Galaxy Outlaw silhouette cue — a single
    // neon accent alone reads flat.
    const sunColor = new THREE.Color(0xffb070);
    const shadowColor = new THREE.Color(0x4d6fa0);
    const rimMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(palette.accent ?? palette.engine ?? 0x6ad9f1) },
            uSun: { value: sunColor },
            uShadow: { value: shadowColor },
            uIntensity: { value: 0.95 },
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vView;
            varying vec3 vWorldNormal;
            void main() {
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vec4 mv = viewMatrix * worldPos;
                vNormal = normalize(mat3(modelMatrix) * normal);
                vWorldNormal = normalize(mat3(modelMatrix) * normal);
                vView = normalize(cameraPosition - worldPos.xyz);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: `
            uniform vec3 uColor;
            uniform vec3 uSun;
            uniform vec3 uShadow;
            uniform float uIntensity;
            varying vec3 vNormal;
            varying vec3 vView;
            varying vec3 vWorldNormal;
            void main() {
                vec3 n = normalize(vWorldNormal);
                vec3 v = normalize(vView);
                float facing = clamp(dot(n, v), 0.0, 1.0);
                float fresnel = pow(1.0 - facing, 2.4);
                // Faction tint when looking at the ship dead-on, sun where the
                // sun would hit the curve, cool on the back side.
                vec3 col = mix(uShadow, uColor, smoothstep(0.05, 0.55, facing));
                col = mix(col, uSun, smoothstep(0.45, 0.95, facing) * 0.85);
                gl_FragColor = vec4(col * fresnel * uIntensity, fresnel);
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
    // Long central spindle with multiple greebled segments.
    staticGrid.fillCylinderX(-46, 50, 5.5, 'hull');
    // Mid-body ribbed rings (the silhouette must read as a tower of discs).
    for (const x of [-30, -16, 0, 16, 30])
        staticGrid.fillCylinderX(x - 1, x + 1, 8, 'dark');
    // Front "Command bulb" — wide front cap with running lights.
    staticGrid.fillCylinderX(-58, -42, 6.5, 'dark', -10, 0);
    staticGrid.fillCylinderX(-58, -42, 6.5, 'hull', 0, 0);
    staticGrid.fillCylinderX(-58, -42, 6.5, 'dark', 10, 0);
    for (let y = -8; y <= 8; y += 4)
        staticGrid.set(-58, y, 0, 'window');
    staticGrid.fillBox(-60, -56, -16, 16, -7, 7, 'dark');
    staticGrid.fillBox(-61, -61, -14, 14, -4, 4, 'warning');
    staticGrid.fillBox(-62, -62, -10, 10, -2, 2, 'accent');
    // Aft engine block with three concentric thrust bells.
    staticGrid.fillCylinderX(38, 56, 11, 'dark');
    staticGrid.fillRingX(56, 58, 9, 1.5, 'hull');
    staticGrid.fillRingX(60, 62, 7, 1.5, 'hull');
    addHelixWindows(staticGrid, 9, 56);
    staticGrid.fillBox(63, 63, -7, 7, -7, 7, 'dark');
    staticGrid.fillBox(64, 64, -5, 5, -5, 5, 'engine');
    // Two side-mounted docking booms (the big visual tells: "this is a
    // station you can dock with").
    for (const side of [-1, 1]) {
        staticGrid.fillBox(-12, 22, side * 11 - 1, side * 11 + 1, -2, 2, 'dark');
        // Boom arms.
        staticGrid.fillBox(15, 30, side * 14 - 1, side * 14 + 1, -8, 8, 'hull');
        staticGrid.fillBox(28, 28, side * 14, side * 14, -6, 6, 'window');
        staticGrid.set(30, side * 14, 0, side > 0 ? 'warning' : 'accent');
    }
    // Vertical "fenestration strips" along the spine — ribbed tower of windows
    // for an airport-control-tower read.
    for (let index = 0; index < 11; index += 1) {
        const z = -32 + index * 6;
        staticGrid.fillBox(-22, -16, -3, 3, z, z + 2, index % 2 ? 'hull' : 'dark');
        staticGrid.fillBox(-19, -19, 4, 4, z, z + 2, index % 3 === 0 ? 'warning' : 'window');
    }
    // Long navigation antenna + base.
    staticGrid.line([-5, 7, -4], [-5, 28, -10], 1, 'dark');
    staticGrid.line([5, 7, 4], [5, 28, 10], 1, 'dark');
    staticGrid.set(-5, 29, -10, 'warning');
    staticGrid.set(5, 29, 10, 'window');
    staticGrid.set(0, 32, 0, 'accent');
    // Cross-beam solar arrays (additive wing-shaped panels either side).
    for (const z of [-22, 0, 22]) {
        for (const side of [-1, 1]) {
            staticGrid.fillBox(side * 35 - 2, side * 35 + 2, z - 8, z + 8, -1, 1, 'hull');
            staticGrid.fillBox(side * 35, side * 35, z - 7, z + 7, -1, 1, 'window');
            staticGrid.line([side * 36, 0, z - 8], [side * 36, 0, z + 8], 0, 'dark');
        }
    }
    const rotorGrid = new VoxelGrid();
    // Bigger rotating habitat ring with more spoke lights.
    rotorGrid.fillRingX(-2, 2, 30, 3, 'hull');
    rotorGrid.fillRingX(-2, 2, 24, 1.5, 'dark');
    rotorGrid.fillRingX(-1, 1, 18, 1.2, 'dark');
    for (let index = 0; index < 16; index += 1) {
        const angle = (index / 16) * Math.PI * 2;
        const y = Math.round(Math.cos(angle) * 30);
        const z = Math.round(Math.sin(angle) * 30);
        // Spoke from the axis out to the ring.
        rotorGrid.line([0, 0, 0], [0, y, z], 1, 'dark');
        // Habitation pod hanging off the ring.
        rotorGrid.fillBox(-4, 4, y - 3, y + 3, z - 3, z + 3, index % 2 ? 'dark' : 'hull');
        rotorGrid.fillBox(0, 0, y - 1, y + 1, z - 1, z + 1, index % 3 === 0 ? 'warning' : 'window');
        // A single nav light on each pod so the ring reads as alive at distance.
        if (index === 0 || index === 8)
            rotorGrid.set(0, y + 4, z, 'accent');
        if (index === 4 || index === 12)
            rotorGrid.set(0, y + 4, z, 'warning');
    }
    const paintTexture = createStationPaintTexture(palette, 'helix-station');
    const root = new THREE.Group();
    root.name = 'helix-voxel-station';
    const staticMeshes = createVoxelMeshes(staticGrid, unit, palette, 0.62, 0.55, paintTexture).group;
    const rotor = createVoxelMeshes(rotorGrid, unit, palette, 0.68, 0.5, paintTexture).group;
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
    // Beefier central core.
    grid.fillBox(-12, 12, -11, 11, -22, 22, 'hull');
    grid.fillBox(-10, 10, 12, 16, -28, 28, 'dark');
    grid.fillBox(-10, 10, -16, -12, -28, 28, 'dark');
    grid.fillBox(-16, 16, -7, 7, -27, -22, 'dark');
    grid.fillBox(-16, 16, -7, 7, 22, 27, 'dark');
    grid.fillBox(-7, 7, -7, 7, 27, 40, 'dark');
    grid.fillRingX(-1, 1, 7, 1.5, 'hull');
    // Halo of dock lights ringing the core.
    for (let index = 0; index < 18; index += 1) {
        const angle = (index / 18) * Math.PI * 2;
        grid.set(Math.round(Math.cos(angle) * 9), Math.round(Math.sin(angle) * 9), 41, index % 4 === 0 ? 'warning' : 'window');
    }
    // Window strips ringing the core shell.
    for (let z = -25; z <= 28; z += 4) {
        grid.fillBox(-12, -10, z, z, 0, 0, index => z % 8 === 0 ? 'warning' : 'window');
    }
    void (() => { let i = 0; for (let z = -25; z <= 28; z += 4) { grid.set(-12, 0, z, i++ % 3 === 0 ? 'warning' : 'window'); grid.set(12, 0, z, i % 3 === 0 ? 'warning' : 'window'); } })();
    // Reinforce the four arms — and add more interior detail.
    const armDirections = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    armDirections.forEach(([dx, dy], armIndex) => {
        for (let step = 13; step <= 38; step += 1) {
            const x = dx * step;
            const y = dy * step;
            const thickness = 4;
            grid.fillBox(x - (dy !== 0 ? thickness : 2), x + (dy !== 0 ? thickness : 2), y - (dx !== 0 ? thickness : 2), y + (dx !== 0 ? thickness : 2), -6, 10, 'dark');
            // Window strips on the arms.
            if (step % 3 === 0) {
                grid.set(x, y, 9, 'window');
                grid.set(x, y, -6, 'warning');
            }
        }
        const px = dx * 40;
        const py = dy * 40;
        grid.fillBox(px - 7, px + 7, py - 7, py + 7, -12, 14, 'hull');
        grid.fillBox(px - 5, px + 5, py - 5, py + 5, 15, 22, 'dark');
        grid.fillBox(px - 3, px + 3, py - 3, py + 3, 22, 30, 'dark');
        const barrelStart = [px, py, 30];
        const barrelEnd = [px + dx * 5, py + dy * 5, 38];
        grid.line(barrelStart, barrelEnd, 1, 'dark');
        grid.set(barrelEnd[0], barrelEnd[1], barrelEnd[2], armIndex === 2 ? 'warning' : 'accent');
        grid.fillBox(px - 4, px + 4, py - 4, py + 4, -13, -12, armIndex % 2 ? 'warning' : 'window');
        // Beacon light on top of each arm.
        grid.set(px, py, 23, 'accent');
    });
    // Long dorsal antenna trio.
    for (const x of [-9, 0, 9]) {
        grid.line([x, 16, -12], [x, 30 + Math.abs(x) * 0.3, -16 + x * 0.4], 0, 'dark');
        grid.set(x, Math.round(31 + Math.abs(x) * 0.3), Math.round(-16 + x * 0.4), x === 0 ? 'warning' : 'window');
    }
    for (const y of [-8, 0, 8]) {
        grid.fillBox(-13, -13, y, y, -16, 16, y === 0 ? 'warning' : 'window');
        grid.fillBox(13, 13, y, y, -16, 16, y === 0 ? 'warning' : 'window');
    }
    const root = createVoxelMeshes(grid, unit, palette, 0.74, 0.5, createStationPaintTexture(palette, 'rook-station')).group;
    root.name = 'rook-voxel-station';
    return root;
};
export const createVoxelStationModel = (id) => id === 'helix' ? buildHelixStation() : buildRookStation();
