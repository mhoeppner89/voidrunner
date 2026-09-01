import { GLB_TOP_DOWN_PROFILES } from './shipProfiles.js';

// The cockpit monitor only needs the 2D footprint of a hull. Keep this path
// free of Three.js and the voxel model builders so the title shell does not
// pull the renderer into its module graph just to draw a target schematic.
const profileCache = new Map();

const capitalMonitorProfile = (variant) => {
    if (variant !== 'concord-carrier' && variant !== 'concord-cruiser')
        return undefined;
    const filled = new Set();
    const cells = [];
    const rows = 44;
    for (let z = 0; z < rows; z += 1) {
        let halfWidth;
        if (variant === 'concord-carrier') {
            // Pointed bow, broad parallel flight deck, then a slightly pinched
            // engine block: the monitor reads "carrier" even at phone size.
            halfWidth = z < 6 ? 2 + Math.floor(z / 2)
                : z < 13 ? 5 + Math.floor((z - 6) / 2)
                    : z < 34 ? 11
                        : z < 40 ? 10
                            : 8;
        }
        else {
            // Long narrow prow, command shoulders, and a wide four-drive stern.
            halfWidth = z < 8 ? 1 + Math.floor(z / 3)
                : z < 24 ? 4
                    : z < 36 ? 5
                        : 7;
        }
        for (let x = -halfWidth; x <= halfWidth; x += 1) {
            filled.add(`${x},${z}`);
            cells.push([x, z]);
        }
    }
    const edges = [];
    const has = (x, z) => filled.has(`${x},${z}`);
    for (const [x, z] of cells) {
        if (!has(x + 1, z))
            edges.push([x + 1, z, x + 1, z + 1]);
        if (!has(x - 1, z))
            edges.push([x, z, x, z + 1]);
        if (!has(x, z + 1))
            edges.push([x, z + 1, x + 1, z + 1]);
        if (!has(x, z - 1))
            edges.push([x, z, x + 1, z]);
    }
    const maxX = variant === 'concord-carrier' ? 11 : 7;
    return { minX: -maxX, maxX, minZ: 0, maxZ: rows - 1, edges, cells };
};

// Before the GLB silhouettes were baked, unknown/capital variants fell back
// to the voxel Kestrel footprint. Keep that exact projected footprint here so
// capital frigates and battleships retain their existing monitor result while
// the monitor can remain independent from voxelModels.js.
const addColumns = (columns, x0, x1, z0, z1) => {
    const minX = Math.min(Math.round(x0), Math.round(x1));
    const maxX = Math.max(Math.round(x0), Math.round(x1));
    const minZ = Math.min(Math.round(z0), Math.round(z1));
    const maxZ = Math.max(Math.round(z0), Math.round(z1));
    for (let x = minX; x <= maxX; x += 1)
        for (let z = minZ; z <= maxZ; z += 1)
            columns.add(`${x},${z}`);
};
const addColumnLine = (columns, start, end) => {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const dz = end[2] - start[2];
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) * 1.2));
    for (let index = 0; index <= steps; index += 1) {
        const t = index / steps;
        addColumns(columns, Math.round(start[0] + dx * t), Math.round(start[0] + dx * t), Math.round(start[2] + dz * t), Math.round(start[2] + dz * t));
    }
};
const addFinColumns = (columns, side, anchorX, tipX, z0, z1) => {
    for (let z = z0; z <= z1; z += 1) {
        const t = (z - z0) / Math.max(1, z1 - z0);
        const x = Math.round(anchorX + (tipX - anchorX) * t);
        columns.add(`${x * side},${z}`);
    }
};
const fallbackKestrelProfile = () => {
    const columns = new Set();
    for (let z = -28; z <= 18; z += 1) {
        const t = (z + 28) / 46;
        const width = t < 0.18 ? 0.5 + t * 9 : t < 0.74 ? 3.4 : 2.7 - (t - 0.74) * 2.8;
        addColumns(columns, -Math.round(width), Math.round(width), z, z);
    }
    addColumns(columns, -2, 2, -4, 17);
    addColumns(columns, -1, 1, -4, 17);
    for (let z = -4; z <= 11; z += 1) {
        const span = Math.round(4 + (z + 4) * 0.72);
        const inner = Math.max(3, Math.round(4 - (z + 4) * 0.06));
        addColumns(columns, -span, -inner, z, z);
        addColumns(columns, inner, span, z, z);
    }
    addFinColumns(columns, -1, 4, 12, 4, 12);
    addFinColumns(columns, 1, 4, 12, 4, 12);
    addColumns(columns, -3, -1, 12, 19);
    addColumns(columns, 1, 3, 12, 19);
    addColumns(columns, -2, -2, 19, 23);
    addColumns(columns, 2, 2, 19, 23);
    addColumnLine(columns, [0, 2, -8], [0, 4, -16]);
    addColumnLine(columns, [0, 2, -8], [1, 5, -18]);
    for (let z = -14; z <= -7; z += 1) {
        const inset = z === -14 || z === -7 ? 1 : 0;
        addColumns(columns, -1 + inset, 1 - inset, z, z);
    }
    addColumns(columns, -1, 1, -14, -7);
    addColumns(columns, -1, 1, -2, 16);

    const cells = Array.from(columns, (column) => column.split(',').map(Number));
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of cells) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
    }
    const edges = [];
    const isFilled = (x, z) => columns.has(`${x},${z}`);
    for (const [x, z] of cells) {
        if (!isFilled(x + 1, z))
            edges.push([x + 1, z, x + 1, z + 1]);
        if (!isFilled(x - 1, z))
            edges.push([x, z, x, z + 1]);
        if (!isFilled(x, z + 1))
            edges.push([x, z + 1, x + 1, z + 1]);
        if (!isFilled(x, z - 1))
            edges.push([x, z, x + 1, z]);
    }
    return { minX, maxX, minZ, maxZ, edges, cells };
};

const fallbackProfile = fallbackKestrelProfile();

// A top-down hull schematic for the cockpit monitors: prefer the silhouette
// baked from the GLB hull and retain the old capital/unknown fallbacks.
export const shipTopDownProfile = (variant) => {
    if (profileCache.has(variant))
        return profileCache.get(variant);
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
    const capitalProfile = capitalMonitorProfile(variant);
    if (capitalProfile) {
        profileCache.set(variant, capitalProfile);
        return capitalProfile;
    }
    profileCache.set(variant, fallbackProfile);
    return fallbackProfile;
};
