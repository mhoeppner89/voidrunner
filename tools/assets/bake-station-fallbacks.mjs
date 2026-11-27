// Run with node --import ./tests/helpers/offline-imports.mjs tools/assets/bake-station-fallbacks.mjs
import {writeFile} from 'node:fs/promises';
import {VoxelGrid} from '../../src/game/voxelModels.js';
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
    // Micro-voxel service conduits and hull plating. These are small enough to
    // catch the rim shader without changing the station's readable silhouette.
    for (let x = -42; x <= 46; x += 4) {
        const jitter = ((x * 73) % 7) - 3;
        staticGrid.fillBox(x - 1, x + 1, 6 + (jitter % 2), 8, jitter - 1, jitter + 1, x % 12 === 0 ? 'accent' : 'dark');
        staticGrid.fillBox(x - 2, x + 2, -9 + (jitter % 2), -7, -jitter - 1, -jitter + 1, 'dark');
        if (((x + 42) / 4) % 3 === 0)
            staticGrid.fillBox(x, x, -5, 5, -6, -5, 'window');
    }
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
    for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        const x = Math.round(Math.cos(angle) * 3);
        const z = Math.round(Math.sin(angle) * 3);
        staticGrid.line([x, 12, z], [x * 2 + (index % 2 ? 1 : -1), 24 + index % 5, z * 2], index % 4 === 0 ? 1 : 0, 'dark');
        if (index % 2 === 0)
            staticGrid.set(x * 2 + (index % 2 ? 1 : -1), 25 + index % 5, z * 2, index % 4 === 0 ? 'warning' : 'window');
    }
    staticGrid.set(-5, 29, -10, 'warning');
    staticGrid.set(5, 29, 10, 'window');
    staticGrid.set(0, 32, 0, 'accent');
    // Cross-beam solar arrays (additive wing-shaped panels either side).
    for (const z of [-22, -14, 0, 14, 22]) {
        for (const side of [-1, 1]) {
            staticGrid.fillBox(side * 35 - 2, side * 35 + 2, z - 8, z + 8, -1, 1, 'hull');
            staticGrid.fillBox(side * 35, side * 35, z - 7, z + 7, -1, 1, 'window');
            staticGrid.line([side * 36, 0, z - 8], [side * 36, 0, z + 8], 0, 'dark');
            staticGrid.fillBox(side * 34, side * 36, Math.min(z, 0) - 1, Math.max(z, 0) + 1, 0, 1, 'dark');
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
    return {unit, palette, grids:[staticGrid, rotorGrid]};
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
    // Dense micro-greebles around the core: pipe runs, panel joints and
    // maintenance lights make the surface read as built machinery at close range.
    for (let y = -10; y <= 10; y += 2) {
        const hash = ((y + 20) * 37) % 11;
        grid.fillBox(-13, -11, y, y, -18 + hash, -18 + hash + 3, hash % 4 === 0 ? 'accent' : 'dark');
        grid.fillBox(11, 13, y, y, 15 - hash - 3, 15 - hash, hash % 5 === 0 ? 'warning' : 'dark');
        grid.set(hash > 5 ? -14 : 14, y, hash > 5 ? -16 : 16, hash % 2 ? 'window' : 'accent');
    }
    grid.fillBox(-10, 10, 12, 16, -28, 28, 'dark');
    grid.fillBox(-10, 10, -16, -12, -28, 28, 'dark');
    grid.fillBox(-16, 16, -7, 7, -27, -22, 'dark');
    grid.fillBox(-16, 16, -7, 7, 22, 27, 'dark');
    // Docking-bay ribs and hazard chevrons: the core should read as an active
    // industrial port even before its windows catch the bloom pass.
    for (let side = -1; side <= 1; side += 2) {
        for (let step = -18; step <= 18; step += 6) {
            grid.fillBox(side * 13, side * 15, step, step + 3, -20, 20, step % 12 === 0 ? 'warning' : 'dark');
            grid.set(side * 16, step + 1, step % 12 === 0 ? 19 : -19, step % 12 === 0 ? 'accent' : 'window');
        }
    }
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
    return {unit, palette, grids:[grid]};
};

// A rectangle only joins coplanar, touching faces with the same authored paint.
// Its plane, material, lower cell and two extents fit in six bytes.
function bakeGrid(grid, palette) {
    const materials = Object.keys(palette);
    const records = [[], []];
    for (let face = 0; face < 6; face++) {
        const axis = Math.floor(face / 2), u = (axis + 1) % 3, v = (axis + 2) % 3;
        const planes = new Map();
        for (const [key, paint] of grid.cells) {
            const index = materials.indexOf(paint);
            if (index < 0) continue;
            const xyz = key.split(',').map(Number), next = [...xyz];
            if (xyz.some(coord => coord < -128 || coord > 127)) throw Error('Station voxel outside the packed coordinate range');
            next[axis] += face % 2 === 0 ? 1 : -1;
            if (grid.get(...next)) continue;
            const id = [xyz[axis], index].join(',');
            if (!planes.has(id)) planes.set(id, new Set());
            planes.get(id).add((xyz[v] + 128) * 256 + xyz[u] + 128);
        }
        for (const [id, cells] of planes) {
            const [slice, material] = id.split(',').map(Number);
            const output = records[material < 3 ? 0 : 1];
            for (const cell of [...cells].sort((a,b) => a-b)) {
                if (!cells.has(cell)) continue;
                let width = 1, height = 1;
                while (cells.has(cell + width)) width++;
                while (Array.from({length:width}, (_,i) => cells.has(cell + height*256 + i)).every(Boolean)) height++;
                if (width > 255 || height > 255) throw Error('Station face outside the packed extent range');
                const pos = [];
                pos[axis] = slice + 128; pos[u] = cell % 256; pos[v] = Math.floor(cell / 256);
                output.push(face * 8 + material, ...pos, width, height);
                for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) cells.delete(cell + y*256 + x);
            }
        }
    }
    return records.map(bytes => Buffer.from(bytes).toString('base64'));
}
const data = {};
for (const [id, build] of Object.entries({helix:buildHelixStation, rook:buildRookStation})) {
    const {unit,palette,grids} = build();
    data[id] = {unit, palette, parts:grids.map(grid => bakeGrid(grid, palette))};
}
await writeFile(new URL('../../src/game/stationFallbackData.js',import.meta.url),
    '// Generated by tools/assets/bake-station-fallbacks.mjs.\nexport const stationFallbackData = ' + JSON.stringify(data,null,2) + ';\n');
