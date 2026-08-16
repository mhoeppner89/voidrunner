// Polygon-based hero models — replacements for the voxel placeholders.
//
// Each ship and station is built from extruded, cylindrical, spherical, and
// box primitives rather than a stack of unit cubes, so the silhouette reads
// as a constructed vehicle silhouette instead of a Minecraft block.
//
// Coordinate convention:
//   - Ships face -z (their nose points toward -z, tail toward +z).
//   - Up is +y; wings sweep along ±x.
//   - The hull outline is in the X-Y plane where +Y == nose direction. We
//     extrude along +Z then translate the geometry so the visible ship is
//     centered around the origin in world space.

import * as THREE from 'three';

const makeShellShape = (outline) => {
    const shape = new THREE.Shape();
    shape.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length; i += 1) shape.lineTo(outline[i][0], outline[i][1]);
    shape.closePath();
    return shape;
};

// Hull extrude: a closed polygon (top-down view of the ship) is extruded
// along Z. Beveled edges so the leading plane catches warm reflections.
const makeHull = (outline, { depth = 1.4, bevel = 0.18 } = {}) => {
    const geo = new THREE.ExtrudeGeometry(makeShellShape(outline), {
        depth,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 5,
        curveSegments: 16,
    });
    // Center around the origin (extrusion goes 0..depth along Z).
    geo.translate(0, 0, -depth / 2);
    geo.computeVertexNormals();
    return geo;
};

// Wing as a closed trapezoidal plan extruded into depth. The wing is built
// along the +x half (root at x=0, tip at +tipHalfSpan). To put one on the
// LEFT side of the ship, scale by (-1, 1, 1) about the centerline AFTER
// translating the wing's *root* into the correct lateral position.
const makeWing = (rootChord, tipChord, rootHalfSpan, tipHalfSpan, sweep, thickness = 0.14) => {
    const shape = new THREE.Shape();
    const yLeadingRoot = -rootChord / 2 + sweep;       // root leading edge y
    const yTrailingRoot = yLeadingRoot + rootChord;     // root trailing edge y
    const yLeadingTip = yLeadingRoot + (rootChord - tipChord);
    const yTrailingTip = yLeadingTip + tipChord;
    // Walk clockwise around the wing plan starting at +x root corner.
    shape.moveTo(+rootHalfSpan, yLeadingRoot);
    shape.lineTo(+tipHalfSpan, yLeadingTip);
    shape.lineTo(+tipHalfSpan, yTrailingTip);
    shape.lineTo(+rootHalfSpan, yTrailingRoot);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, {
        depth: thickness,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.04,
        bevelSegments: 2,
        curveSegments: 4,
    });
};

const placeWings = (group, builder, palette, shipRootSpan = 0.85) => {
    for (const side of [-1, 1]) {
        const wg = builder();
        wg.translate(side * shipRootSpan, 0, 0);
        if (side === -1) wg.scale(-1, 1, 1);
        const mat = new THREE.MeshPhysicalMaterial({
            color: palette.hull, roughness: 0.32, metalness: 0.55,
            clearcoat: 0.9, clearcoatRoughness: 0.18, envMapIntensity: 1.6,
        });
        const wm = new THREE.Mesh(wg, mat);
        group.add(wm);
    }
};

// Engine bell: skirt + glow cone + hot core, all in a single group.
function makeEngineBell(radius, length, glowColor) {
    const group = new THREE.Group();
    const skirt = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 1.15, radius * 1.34, length * 0.55, 24, 1, false),
        new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5, metalness: 0.65, flatShading: false }),
    );
    skirt.rotation.x = Math.PI / 2;
    skirt.position.z = length * 0.2;
    group.add(skirt);
    const inner = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.94, radius * 0.78, length * 0.4, 24, 1, false),
        new THREE.MeshBasicMaterial({ color: glowColor, toneMapped: false, transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
    );
    inner.rotation.x = Math.PI / 2;
    inner.position.z = length * 0.45;
    group.add(inner);
    const hotCore = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.55, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }),
    );
    hotCore.position.z = length * 0.62;
    group.add(hotCore);
    return group;
}

const addNavLight = (group, x, y, z, kind) => {
    const color = kind === 'red' ? 0xc44a3a : kind === 'green' ? 0x4cd070 : 0xc3e2ee;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    m.position.set(x, y, z);
    group.add(m);
};

// ----------------------------------------------------------------------------
// Kestrel — small escort dart, twin engines.
// Outline coordinates: x = ±span, y = length axis (positive = forward / nose).
// ----------------------------------------------------------------------------
const kestrelOutline = [
    [0,    3.6],
    [0.7,  2.7],
    [0.95, 1.4],
    [0.95, 0.0],
    [0.85,-1.2],
    [0,   -2.2],
    [-0.85,-1.2],
    [-0.95, 0.0],
    [-0.95, 1.4],
    [-0.7,  2.7],
];
const buildKestrel = (palette) => {
    const group = new THREE.Group();
    group.name = 'hero-kestrel';
    const hullGeo = makeHull(kestrelOutline, { depth: 0.95, bevel: 0.22 });
    const hull = new THREE.Mesh(hullGeo, new THREE.MeshPhysicalMaterial({
        color: palette.hull, roughness: 0.32, metalness: 0.55,
        clearcoat: 0.9, clearcoatRoughness: 0.18, envMapIntensity: 1.7,
    }));
    group.add(hull);
    placeWings(group, () => makeWing(1.1, 0.3, 0.65, 2.6, 0.4, 0.14), palette, 0.95);
    addNavLight(group, -2.6, 0.15, 0.5, 'red');
    addNavLight(group, +2.6, 0.15, 0.5, 'green');
    const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({
            color: palette.canopy ?? 0x5d8a99, roughness: 0.15, metalness: 0.0,
            clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.9,
            transparent: true, opacity: 0.92, ior: 1.4, thickness: 0.3,
        }),
    );
    canopy.position.set(0, 0.5, 1.7); canopy.scale.set(1, 0.8, 1.5);
    group.add(canopy);
    const enginePorts = [];
    for (const side of [-1, 1]) {
        const port = new THREE.Vector3(side * 0.85, -0.1, -2.4);
        enginePorts.push(port);
        group.add(makeEngineBell(0.32, 0.65, palette.engine ?? 0x6ad9f1).clone().translateX(side * 0.85).translateY(-0.1).translateZ(-2.0));
        // Intake vent: dark recessed box on the side of the hull.
        const intake = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.2, 0.5),
            new THREE.MeshStandardMaterial({ color: 0x141821, roughness: 0.7, metalness: 0.3 }),
        );
        intake.position.set(side * 0.92, 0.0, 0.8);
        group.add(intake);
    }
    // Spine bright stripe: faction accent.
    const spine = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.07, 2.6),
        new THREE.MeshBasicMaterial({ color: palette.accent ?? 0x6ad9f1, toneMapped: false }),
    );
    spine.position.set(0, 0.43, 0);
    group.add(spine);
    // Antenna spike.
    const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6),
        new THREE.MeshStandardMaterial({ color: 0x6f7e88, metalness: 0.6, roughness: 0.4 }),
    );
    ant.position.set(0, 0.6, 3.0); ant.rotation.x = -0.18;
    group.add(ant);
    // Belly fin.
    const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.4, 1.0),
        new THREE.MeshStandardMaterial({ color: palette.dark, roughness: 0.6, metalness: 0.4 }),
    );
    fin.position.set(0, -0.55, -0.6);
    group.add(fin);
    return { group, mats: [hull.material], enginePorts };
};

// ----------------------------------------------------------------------------
// Talon — pirate aft-swept runner with belly pod + 3 engines.
// ----------------------------------------------------------------------------
const talonOutline = [
    [0,    3.8],
    [0.95, 2.8],
    [1.15, 1.4],
    [1.10, 0.0],
    [0.95,-1.4],
    [0,   -2.4],
    [-0.95,-1.4],
    [-1.10, 0.0],
    [-1.15, 1.4],
    [-0.95, 2.8],
];
const buildTalon = (palette) => {
    const group = new THREE.Group();
    group.name = 'hero-talon';
    const hullGeo = makeHull(talonOutline, { depth: 1.05, bevel: 0.22 });
    const hull = new THREE.Mesh(hullGeo, new THREE.MeshPhysicalMaterial({
        color: palette.hull, roughness: 0.34, metalness: 0.55,
        clearcoat: 0.85, clearcoatRoughness: 0.2, envMapIntensity: 1.65,
    }));
    group.add(hull);
    placeWings(group, () => makeWing(1.4, 0.3, 0.75, 3.1, -0.5, 0.16), palette, 1.05);
    addNavLight(group, -3.1, -0.05, 0.4, 'red');
    addNavLight(group, +3.1, -0.05, 0.4, 'green');
    const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.65, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({
            color: palette.canopy ?? 0xc66644, roughness: 0.2, metalness: 0.0,
            clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.9,
            transparent: true, opacity: 0.86,
        }),
    );
    canopy.position.set(0, 0.55, 1.6); canopy.scale.set(1, 0.7, 1.5);
    group.add(canopy);
    const enginePorts = [];
    for (const x of [-0.95, 0, 0.95]) {
        const port = new THREE.Vector3(x, -0.15, -2.55);
        enginePorts.push(port);
        group.add(makeEngineBell(0.42, 0.85, palette.engine ?? 0xff5520).clone().translateX(x).translateY(-0.15).translateZ(-2.2));
    }
    // Pirate belly pod with warning stripes.
    const pod = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.36, 1.6),
        new THREE.MeshStandardMaterial({ color: 0x421f1b, roughness: 0.6, metalness: 0.3 }),
    );
    pod.position.set(0, -0.62, 0.0);
    group.add(pod);
    for (let i = -1; i <= 1; i += 1) {
        const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(0.56, 0.03, 0.35),
            new THREE.MeshBasicMaterial({ color: palette.warning ?? 0xffb358, toneMapped: false }),
        );
        stripe.position.set(0, -0.45, i * 0.55);
        group.add(stripe);
    }
    // Antenna whip.
    const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.85, 5),
        new THREE.MeshStandardMaterial({ color: 0x803020, metalness: 0.45, roughness: 0.5 }),
    );
    ant.position.set(0.15, 0.6, 3.0); ant.rotation.x = -0.35; ant.rotation.z = 0.12;
    group.add(ant);
    return { group, mats: [hull.material], enginePorts };
};

// ----------------------------------------------------------------------------
// Warden — Concord interceptor, boxy fuselage + vertical stabilisers.
// ----------------------------------------------------------------------------
const wardenOutline = [
    [0,    4.0],
    [0.85, 3.0],
    [1.10, 1.6],
    [1.20, 0.2],
    [1.05,-1.0],
    [0,   -2.2],
    [-1.05,-1.0],
    [-1.20, 0.2],
    [-1.10, 1.6],
    [-0.85, 3.0],
];
const buildWarden = (palette) => {
    const group = new THREE.Group();
    group.name = 'hero-warden';
    const hullGeo = makeHull(wardenOutline, { depth: 1.05, bevel: 0.24 });
    const hull = new THREE.Mesh(hullGeo, new THREE.MeshPhysicalMaterial({
        color: palette.hull, roughness: 0.32, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.16,
        envMapIntensity: 1.8,
    }));
    group.add(hull);
    // Vertical stabilisers.
    for (const x of [-0.85, 0.85]) {
        const tail = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 1.1, 0.7),
            new THREE.MeshPhysicalMaterial({ color: palette.dark, roughness: 0.5, metalness: 0.55 }),
        );
        tail.position.set(x, 0.85, -1.3);
        group.add(tail);
    }
    placeWings(group, () => makeWing(1.2, 0.4, 0.7, 3.0, 0.5, 0.16), palette, 1.0);
    addNavLight(group, -3.0, 0.15, 0.5, 'red');
    addNavLight(group, +3.0, 0.15, 0.5, 'green');
    const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.85, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({
            color: palette.canopy ?? 0x6ad9f1, roughness: 0.15, metalness: 0.0,
            clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.9,
            transparent: true, opacity: 0.86,
        }),
    );
    canopy.position.set(0, 0.55, 1.4); canopy.scale.set(1, 0.7, 1.6);
    group.add(canopy);
    const enginePorts = [];
    for (const side of [-1, 1]) {
        const port = new THREE.Vector3(side * 0.95, 0.0, -2.4);
        enginePorts.push(port);
        group.add(makeEngineBell(0.38, 0.7, palette.engine ?? 0x6ad9f1).clone().translateX(side * 0.95).translateZ(-2.1));
    }
    // Underwing weapon pods.
    for (const side of [-1, 1]) {
        const pod = new THREE.Mesh(
            new THREE.CylinderGeometry(0.13, 0.13, 0.7, 12),
            new THREE.MeshStandardMaterial({ color: palette.dark, roughness: 0.5, metalness: 0.6 }),
        );
        pod.position.set(side * 1.8, -0.25, 0.2);
        pod.rotation.z = Math.PI / 2;
        group.add(pod);
    }
    // Spine accent stripe.
    const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.06, 3.0),
        new THREE.MeshBasicMaterial({ color: palette.accent ?? 0x6ad9f1, toneMapped: false }),
    );
    stripe.position.set(0, 0.5, 0);
    group.add(stripe);
    return { group, mats: [hull.material], enginePorts };
};

// ----------------------------------------------------------------------------
// Prospector — chunky hammerhead, side cargo arms, mining lasers.
// ----------------------------------------------------------------------------
const prospectorOutline = [
    [0,    4.4],
    [1.4,  3.4],   // wide blunt nose shoulders
    [1.6,  1.8],
    [1.5,  0.0],
    [1.3, -1.4],
    [0,   -2.2],
    [-1.3, -1.4],
    [-1.5,  0.0],
    [-1.6,  1.8],
    [-1.4,  3.4],
];
const buildProspector = (palette) => {
    const group = new THREE.Group();
    group.name = 'hero-prospector';
    const hullGeo = makeHull(prospectorOutline, { depth: 1.5, bevel: 0.28 });
    const hull = new THREE.Mesh(hullGeo, new THREE.MeshPhysicalMaterial({
        color: palette.hull, roughness: 0.4, metalness: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.22, envMapIntensity: 1.5,
    }));
    group.add(hull);
    // Side cargo arms with striped markings.
    for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(
            new THREE.BoxGeometry(0.95, 0.85, 2.9),
            new THREE.MeshStandardMaterial({ color: palette.dark, roughness: 0.7, metalness: 0.35 }),
        );
        arm.position.set(side * 1.3, -1.1, 0.0);
        group.add(arm);
        for (let i = 0; i < 5; i += 1) {
            const seg = new THREE.Mesh(
                new THREE.BoxGeometry(0.96, 0.06, 0.55),
                new THREE.MeshBasicMaterial({ color: i % 2 ? 0x1f1612 : (palette.warning ?? 0xffb358) }),
            );
            seg.position.set(side * 1.3, -0.75, -1.2 + i * 0.6);
            group.add(seg);
        }
        // Forward mining laser.
        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.18, 1.6, 12),
            new THREE.MeshStandardMaterial({ color: palette.dark, metalness: 0.6, roughness: 0.4 }),
        );
        barrel.position.set(side * 1.7, -0.5, 2.5);
        barrel.rotation.x = Math.PI / 2;
        group.add(barrel);
        // Tip glow.
        const beamTip = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 10, 8),
            new THREE.MeshBasicMaterial({ color: palette.accent ?? 0xe8b85c, toneMapped: false }),
        );
        beamTip.position.set(side * 1.7, -0.5, 3.3);
        group.add(beamTip);
        addNavLight(group, side * 1.7, -0.7, -1.4, side === -1 ? 'green' : 'red');
    }
    // Cockpit dome looking down.
    const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({
            color: palette.canopy ?? 0x9accc0, roughness: 0.15, metalness: 0.0,
            clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.7,
            transparent: true, opacity: 0.86,
        }),
    );
    canopy.position.set(0, 0.75, 2.7); canopy.scale.set(0.85, 0.55, 1.3);
    group.add(canopy);
    const enginePorts = [];
    for (const side of [-1, 1]) {
        const port = new THREE.Vector3(side * 1.1, 0.0, -2.4);
        enginePorts.push(port);
        group.add(makeEngineBell(0.42, 0.85, palette.engine ?? 0xe8b85c).clone().translateX(side * 1.1).translateZ(-2.05));
    }
    // Antenna trio.
    for (const x of [-0.5, 0, 0.5]) {
        const ant = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.95, 5),
            new THREE.MeshStandardMaterial({ color: palette.dark, metalness: 0.5, roughness: 0.4 }),
        );
        ant.position.set(x, 1.1, 1.5);
        group.add(ant);
    }
    return { group, mats: [hull.material], enginePorts };
};

// ----------------------------------------------------------------------------
// Lancer — long bounty-hunter dart with forward canards.
// ----------------------------------------------------------------------------
const lancerOutline = [
    [0,    5.2],
    [0.6,  3.6],
    [0.8,  1.8],
    [0.75, 0.0],
    [0.65,-2.0],
    [0,   -3.1],
    [-0.65,-2.0],
    [-0.75, 0.0],
    [-0.8,  1.8],
    [-0.6,  3.6],
];
const buildLancer = (palette) => {
    const group = new THREE.Group();
    group.name = 'hero-lancer';
    const hullGeo = makeHull(lancerOutline, { depth: 0.95, bevel: 0.22 });
    const hull = new THREE.Mesh(hullGeo, new THREE.MeshPhysicalMaterial({
        color: palette.hull, roughness: 0.3, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.18, envMapIntensity: 1.7,
    }));
    group.add(hull);
    placeWings(group, () => makeWing(1.0, 0.2, 0.55, 2.6, 0.6, 0.12), palette, 0.85);
    addNavLight(group, -2.6, 0.05, 0.4, 'red');
    addNavLight(group, +2.6, 0.05, 0.4, 'green');
    // Forward canards.
    for (const side of [-1, 1]) {
        const c = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.08, 1.6),
            new THREE.MeshStandardMaterial({ color: palette.dark, metalness: 0.5, roughness: 0.45 }),
        );
        c.position.set(side * 0.8, 0.0, 2.8);
        c.rotation.z = side * -0.22;
        group.add(c);
    }
    const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.48, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({
            color: palette.canopy ?? 0xa8bf9a, roughness: 0.18, metalness: 0.0,
            clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.7,
            transparent: true, opacity: 0.86,
        }),
    );
    canopy.position.set(0, 0.5, 2.6); canopy.scale.set(0.7, 0.6, 2.0);
    group.add(canopy);
    const enginePorts = [];
    // Triple engine row.
    for (const x of [-0.55, 0, 0.55]) {
        const port = new THREE.Vector3(x, -0.15, -3.2);
        enginePorts.push(port);
        group.add(makeEngineBell(0.3, 0.6, palette.engine ?? 0xe8b85c).clone().translateX(x).translateZ(-2.93));
    }
    // Spine antenna+stripe.
    const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5),
        new THREE.MeshStandardMaterial({ color: 0x6f7e88, metalness: 0.5, roughness: 0.4 }),
    );
    ant.position.set(0, 0.55, 4.5); ant.rotation.x = -0.18;
    group.add(ant);
    const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.06, 4.0),
        new THREE.MeshBasicMaterial({ color: palette.accent ?? 0xc46a3a, toneMapped: false }),
    );
    stripe.position.set(0, 0.45, 0.5);
    group.add(stripe);
    return { group, mats: [hull.material], enginePorts };
};

// ----------------------------------------------------------------------------
// Atlas-Freighter — heavy hauler, 6 cargo pods on struts + 4 engines.
// ----------------------------------------------------------------------------
const atlasOutline = [
    [0,    6.0],
    [1.05, 4.4],
    [1.30, 2.4],
    [1.35, 0.4],
    [1.25,-1.8],
    [0,   -3.4],
    [-1.25,-1.8],
    [-1.35, 0.4],
    [-1.30, 2.4],
    [-1.05, 4.4],
];
const buildAtlas = (palette) => {
    const group = new THREE.Group();
    group.name = 'hero-atlas';
    const hullGeo = makeHull(atlasOutline, { depth: 1.8, bevel: 0.34 });
    const hull = new THREE.Mesh(hullGeo, new THREE.MeshPhysicalMaterial({
        color: palette.hull, roughness: 0.35, metalness: 0.5, clearcoat: 0.85, clearcoatRoughness: 0.2, envMapIntensity: 1.55,
    }));
    group.add(hull);
    // Dorsal keel / air-brake.
    const keel = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.6, 4.0),
        new THREE.MeshPhysicalMaterial({ color: palette.dark, roughness: 0.5, metalness: 0.5, clearcoat: 0.6 }),
    );
    keel.position.set(0, 1.15, -1.0);
    group.add(keel);
    // Six cargo pods (3 each side) — chamfered boxes with thruster secondary stripes.
    for (const side of [-1, 1]) {
        for (const z of [-2.6, -0.2, 2.2]) {
            const pod = new THREE.Mesh(
                new THREE.BoxGeometry(1.7, 1.0, 2.2),
                new THREE.MeshStandardMaterial({ color: palette.cargo ?? 0x8a7a5a, roughness: 0.6, metalness: 0.35 }),
            );
            pod.position.set(side * 2.85, -0.4, z);
            group.add(pod);
            // Strut from hull to pod.
            const strut = new THREE.Mesh(
                new THREE.CylinderGeometry(0.12, 0.12, 1.55, 8),
                new THREE.MeshStandardMaterial({ color: palette.dark, metalness: 0.5, roughness: 0.5 }),
            );
            strut.position.set(side * 1.83, -0.4, z);
            strut.rotation.z = Math.PI / 2;
            group.add(strut);
            // Cargo lamp stripes down the pod.
            for (let i = -1; i <= 1; i += 1) {
                const lamp = new THREE.Mesh(
                    new THREE.BoxGeometry(0.05, 0.05, 1.6),
                    new THREE.MeshBasicMaterial({ color: palette.window ?? 0xf4d090, toneMapped: false }),
                );
                lamp.position.set(side * 2.85 + (side > 0 ? 0.86 : -0.86), 0.2, z);
                group.add(lamp);
            }
        }
        addNavLight(group, side * 4.4, -0.4, -2.5, side === -1 ? 'green' : 'red');
    }
    // Forward bridge canopy.
    const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.85, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({
            color: palette.canopy ?? 0x65d7c3, roughness: 0.18, metalness: 0.0,
            clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.7,
            transparent: true, opacity: 0.88,
        }),
    );
    canopy.position.set(0, 0.95, 4.0); canopy.scale.set(0.9, 0.7, 1.2);
    group.add(canopy);
    const enginePorts = [];
    // Four engines.
    for (const x of [-1.4, -0.45, 0.45, 1.4]) {
        const port = new THREE.Vector3(x, 0.05, -3.55);
        enginePorts.push(port);
        group.add(makeEngineBell(0.55, 1.05, palette.engine ?? 0x6ad9f1).clone().translateX(x).translateZ(-3.0));
    }
    // Two Antennas.
    for (const x of [-0.5, 0.5]) {
        const ant = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6),
            new THREE.MeshStandardMaterial({ color: palette.dark, metalness: 0.45, roughness: 0.45 }),
        );
        ant.position.set(x, 1.45, -0.5);
        group.add(ant);
    }
    // Cargo deck lights.
    for (let i = -2; i <= 2; i += 1) {
        const lamp = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.05, 0.2),
            new THREE.MeshBasicMaterial({ color: palette.window ?? 0xf4d090, toneMapped: false }),
        );
        lamp.position.set(0, 0.92, i * 0.9);
        group.add(lamp);
    }
    return { group, mats: [hull.material], enginePorts };
};

// ----------------------------------------------------------------------------
// Stations
// ----------------------------------------------------------------------------
const buildHelixStation = () => {
    const group = new THREE.Group();
    group.name = 'hero-helix';
    const spindleMat = new THREE.MeshPhysicalMaterial({ color: 0x8d856e, roughness: 0.38, metalness: 0.6, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 1.5 });
    const spindle = new THREE.Mesh(
        new THREE.CylinderGeometry(3.0, 3.0, 50, 32, 1, false),
        spindleMat,
    );
    group.add(spindle);
    // Mid-body ribbed rings (the "this is a refinery" tell).
    for (const y of [-18, -9, 0, 9, 18]) {
        const ring = new THREE.Mesh(
            new THREE.CylinderGeometry(4.2, 4.2, 1.2, 36, 1, false),
            new THREE.MeshStandardMaterial({ color: 0x6a5d44, roughness: 0.6, metalness: 0.5 }),
        );
        ring.position.y = y;
        group.add(ring);
        // Window strip around each ring.
        for (let i = 0; i < 16; i += 1) {
            const angle = (i / 16) * Math.PI * 2;
            const win = new THREE.Mesh(
                new THREE.BoxGeometry(0.18, 0.18, 0.18),
                new THREE.MeshBasicMaterial({ color: i % 4 === 0 ? 0xff7040 : 0x6ad9f1, toneMapped: false }),
            );
            win.position.set(Math.cos(angle) * 4.25, y, Math.sin(angle) * 4.25);
            group.add(win);
        }
    }
    // Command bulb at the top of the spindle.
    const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(3.6, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({ color: 0x9a8d6e, roughness: 0.4, metalness: 0.5, clearcoat: 0.8, envMapIntensity: 1.6 }),
    );
    bulb.position.y = 24;
    group.add(bulb);
    // Aft engine block (heavy industrial thrust).
    const aft = new THREE.Mesh(
        new THREE.CylinderGeometry(3.6, 5.0, 6.0, 28),
        new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.7, metalness: 0.4 }),
    );
    aft.position.y = -28;
    group.add(aft);
    for (const r of [3.5, 2.5, 1.6]) {
        const bell = new THREE.Mesh(
            new THREE.CylinderGeometry(r * 0.9, r * 1.18, 1.8, 24),
            new THREE.MeshStandardMaterial({ color: 0x2a261f, metalness: 0.7, roughness: 0.4 }),
        );
        bell.position.y = -32.5;
        group.add(bell);
    }
    const aftGlow = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6, 0.6, 0.6, 24),
        new THREE.MeshBasicMaterial({ color: 0xff9a4a, toneMapped: false }),
    );
    aftGlow.position.y = -32.5;
    group.add(aftGlow);
    // Habitat ring (torus).
    const habitat = new THREE.Mesh(
        new THREE.TorusGeometry(15, 2.2, 16, 56),
        new THREE.MeshPhysicalMaterial({ color: 0x897a5d, roughness: 0.45, metalness: 0.5, clearcoat: 0.7, envMapIntensity: 1.4 }),
    );
    habitat.position.y = -4;
    habitat.rotation.x = Math.PI / 2;
    group.add(habitat);
    // Spoke lights.
    for (let i = 0; i < 16; i += 1) {
        const angle = (i / 16) * Math.PI * 2;
        const spoke = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.18, 15, 6),
            new THREE.MeshStandardMaterial({ color: 0x6a5d44, roughness: 0.5, metalness: 0.55 }),
        );
        spoke.position.set(Math.cos(angle) * 7.5, -4, Math.sin(angle) * 7.5);
        spoke.rotation.z = Math.PI / 2;
        spoke.rotation.y = -angle;
        group.add(spoke);
        const pod = new THREE.Mesh(
            new THREE.BoxGeometry(2.0, 0.9, 0.6),
            new THREE.MeshStandardMaterial({ color: 0x726047, roughness: 0.6, metalness: 0.45 }),
        );
        pod.position.set(Math.cos(angle) * 15, -4, Math.sin(angle) * 15);
        pod.lookAt(0, -4, 0);
        group.add(pod);
        // Pod running light (warm lamp face).
        const lamp = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.25, 0.25),
            new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xff7040 : 0x80e0e0, toneMapped: false }),
        );
        lamp.position.set(Math.cos(angle) * 15.5, -3.7, Math.sin(angle) * 15.5);
        group.add(lamp);
    }
    // Side docking booms.
    for (const side of [-1, 1]) {
        const boom = new THREE.Mesh(
            new THREE.BoxGeometry(10.0, 1.6, 1.8),
            new THREE.MeshStandardMaterial({ color: 0x6a5d44, roughness: 0.55, metalness: 0.5 }),
        );
        boom.position.set(side * 8.0, -2, -3);
        group.add(boom);
        const lamp = new THREE.Mesh(
            new THREE.SphereGeometry(0.45, 12, 8),
            new THREE.MeshBasicMaterial({ color: side > 0 ? 0xff7040 : 0x6ad9f1, toneMapped: false }),
        );
        lamp.position.set(side * 13.5, -2, -3);
        group.add(lamp);
    }
    // Beacon top antenna.
    const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 4.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x5a503b, metalness: 0.6, roughness: 0.5 }),
    );
    ant.position.y = 28.5;
    group.add(ant);
    const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xff8030, toneMapped: false }),
    );
    beacon.position.y = 31;
    group.add(beacon);
    const halo = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xff8030, toneMapped: false, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending }),
    );
    halo.position.y = 31;
    group.add(halo);
    return { group };
};

const buildRookStation = () => {
    const group = new THREE.Group();
    group.name = 'hero-rook';
    const coreMat = new THREE.MeshPhysicalMaterial({ color: 0x8fa3a7, roughness: 0.4, metalness: 0.55, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 1.55 });
    const core = new THREE.Mesh(
        new THREE.BoxGeometry(8, 6, 8),
        coreMat,
    );
    group.add(core);
    // Top dome.
    const dome = new THREE.Mesh(
        new THREE.SphereGeometry(3.4, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({ color: 0x6c818a, roughness: 0.35, metalness: 0.5, clearcoat: 1, envMapIntensity: 1.6 }),
    );
    dome.position.y = 3;
    group.add(dome);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x27343b, roughness: 0.55, metalness: 0.55 });
    for (const axis of ['x', 'z']) {
        for (const sign of [-1, 1]) {
            const arm = new THREE.Mesh(
                new THREE.BoxGeometry(axis === 'x' ? 16 : 4, 2.5, axis === 'z' ? 16 : 4),
                armMat,
            );
            arm.position.set(axis === 'x' ? sign * 14 : 0, 0, axis === 'z' ? sign * 14 : 0);
            group.add(arm);
            const drum = new THREE.Mesh(
                new THREE.CylinderGeometry(2.2, 2.2, 3.4, 20),
                coreMat,
            );
            drum.position.set(axis === 'x' ? sign * 22 : 0, 0, axis === 'z' ? sign * 22 : 0);
            group.add(drum);
            for (let i = 0; i < 8; i += 1) {
                const angle = (i / 8) * Math.PI * 2;
                const lamp = new THREE.Mesh(
                    new THREE.BoxGeometry(0.22, 0.22, 0.22),
                    new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xff7040 : 0x80e0e0, toneMapped: false }),
                );
                lamp.position.set(
                    (axis === 'x' ? sign * 22 : 0) + Math.cos(angle) * 1.7,
                    1.5,
                    (axis === 'z' ? sign * 22 : 0) + Math.sin(angle) * 1.7,
                );
                group.add(lamp);
            }
            for (let i = 0; i < 5; i += 1) {
                const win = new THREE.Mesh(
                    new THREE.BoxGeometry(0.2, 0.2, 0.4),
                    new THREE.MeshBasicMaterial({ color: 0x68c6e4, toneMapped: false }),
                );
                win.position.set(
                    axis === 'x' ? sign * (8 + i * 3) : Math.cos((i + 2) * 0.4) * 0.4,
                    1.2,
                    axis === 'z' ? sign * (8 + i * 3) : Math.sin((i + 2) * 0.4) * 0.4,
                );
                group.add(win);
            }
        }
    }
    for (const x of [-2.0, 0, 2.0]) {
        const ant = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.15, 4.5, 6),
            new THREE.MeshStandardMaterial({ color: 0x6c818a, metalness: 0.5, roughness: 0.4 }),
        );
        ant.position.set(x, 6.0, 0);
        group.add(ant);
        const lamp = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 10, 8),
            new THREE.MeshBasicMaterial({ color: x === 0 ? 0xfff050 : 0xff7040, toneMapped: false }),
        );
        lamp.position.set(x, 8.4, 0);
        group.add(lamp);
    }
    const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xff8030, toneMapped: false }),
    );
    beacon.position.set(0, 3.5, 0);
    group.add(beacon);
    const halo = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xff8030, toneMapped: false, transparent: true, opacity: 0.36, blending: THREE.AdditiveBlending }),
    );
    halo.position.set(0, 3.5, 0);
    group.add(halo);
    // Hull windows front/back.
    for (let z = -3; z <= 3; z += 1) {
        for (const sign of [-1, 1]) {
            const win = new THREE.Mesh(
                new THREE.BoxGeometry(0.22, 0.22, 0.22),
                new THREE.MeshBasicMaterial({ color: 0x80e0e0, toneMapped: false }),
            );
            win.position.set(sign * 4.05, z % 2 === 0 ? -1.0 : 1.0, z * 0.8);
            group.add(win);
        }
    }
    return { group };
};

const shipBuilders = {
    kestrel: buildKestrel,
    talon: buildTalon,
    warden: buildWarden,
    prospector: buildProspector,
    lancer: buildLancer,
    'atlas-freighter': buildAtlas,
};
const stationBuilders = { helix: buildHelixStation, rook: buildRookStation };

const safeDefaultPalette = {
    hull: 0x6f7e88, dark: 0x2c3540, accent: 0x6ad9f1, canopy: 0x6ad9f1,
    engine: 0x6ad9f1, warning: 0xff7040, window: 0xc3e2ee, cargo: 0x8a7a5a,
};

export const createHeroShipModel = (variant, palette) => {
    const builder = shipBuilders[variant] ?? shipBuilders.kestrel;
    const { group, mats, enginePorts } = builder({ ...safeDefaultPalette, ...palette });
    group.userData.variant = variant;
    group.userData.hullMaterials = mats;
    group.userData.emissiveMaterials = mats;
    return {
        group,
        variant,
        enginePorts: enginePorts.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
        hullMaterial: mats[0],
        glowMaterial: mats[0],
        rimMaterial: null,
    };
};

export const createHeroStationModel = (id) => {
    const builder = stationBuilders[id] ?? buildHelixStation;
    const { group } = builder();
    return group;
};
