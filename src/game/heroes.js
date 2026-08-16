// Polygon-based hero models — replacements for the voxel placeholders.
//
// Design goals:
//   - Each ship variant has a distinct silhouette (forward-swept vs aft-swept
//     wings, pointed vs blunt nose, twin vs quad engines) so even an unlit
//     thumbnail is recognisable as a class.
//   - Beveled extrude hull with realistic edge highlights, not stepped voxels.
//   - Surface greebles: vents, intakes, antennae, panel seams, weapon mounts.
//   - Each ship's return value matches the contract the in-game renderer
//     already expects from `createVoxelShipModel`: { group, variant,
//     enginePorts, hullMaterial, glowMaterial, rimMaterial } so we can swap
//     them in without touching the renderer's per-frame logic.
//
// Coordinates:
//   - Ships face -z (their nose points toward -z); tail is +z.
//   - Up is +y; wings sweep along ±x.

import * as THREE from 'three';

const makeShellShape = (outline) => {
    const shape = new THREE.Shape();
    shape.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length; i += 1) shape.lineTo(outline[i][0], outline[i][1]);
    shape.closePath();
    return shape;
};

// Hull extrusion: extrude a top-down *outline* (Shape on the X-Y plane
// where Y == -Z so the nose end is positive Y) along the +Z axis. Beveled
// edges make the hull read as a fuselage rather than a stack of cubes.
// depth = ship width (Y axis lift), pivot = which face to center on.
const makeHull = (outline, { depth = 1, bevel = 0.18, pivot = -0.5 } = {}) => {
    const geo = new THREE.ExtrudeGeometry(makeShellShape(outline), {
        depth,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 5,
        curveSegments: 14,
    });
    // Translate so the ship is centered on origin. ExtrudeGeometry adds depth
    // along +z, so we shift -depth / 2 along z to center, then flip +z to -z
    // so the nose (positive Y in the outline) becomes the actual front.
    geo.translate(0, 0, depth * pivot);
    geo.computeVertexNormals();
    return geo;
};

// Tapered wing extrusion — a triangular plan swept through depth.
const makeWing = (rootHalfSpan, tipHalfSpan, sweep, rootChord, tipChord, thickness, zOffset = 0) => {
    // Define the wing as a quad with a trailing-edge sweep: a parallelogram in
    // x-y that we extrude by thickness. We don't have bevels on wings; we want
    // crisp edges that catch the front rim highlight.
    const shape = new THREE.Shape();
    const y0 = -rootChord / 2 + sweep; // forward-leading root edge
    shape.moveTo(-rootHalfSpan, y0);
    shape.lineTo(-rootHalfSpan, y0 + rootChord);
    shape.lineTo(-tipHalfSpan, y0 + rootChord - (rootChord - tipChord));
    shape.lineTo(-tipHalfSpan, y0 + rootChord - (rootChord - tipChord) + tipChord);
    shape.lineTo(0, 0);
    shape.lineTo(0, 0);
    return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 2 });
};

// Engine bells: short cones for the thruster nozzles. Each side gets one bell
// with a small dark "skirt" rim and an inner glow disk.
function makeEngineBell(radius, length, glowColor) {
    const group = new THREE.Group();
    const skirt = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 1.15, radius * 1.32, length * 0.55, 24, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.55, metalness: 0.6, flatShading: false }),
    );
    skirt.rotation.x = Math.PI / 2;
    skirt.position.z = length * 0.2;
    group.add(skirt);
    const inner = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.92, radius * 0.78, length * 0.4, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: glowColor, toneMapped: false, transparent: true, opacity: 0.78, side: THREE.DoubleSide }),
    );
    inner.rotation.x = Math.PI / 2;
    inner.position.z = length * 0.45;
    group.add(inner);
    const hotCore = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.6, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false, transparent: true, opacity: 0.95 }),
    );
    hotCore.position.z = length * 0.62;
    group.add(hotCore);
    return group;
}

const attachNavLights = (group, lights, palette) => {
    for (const [x, y, z, kind] of lights) {
        const color = kind === 'red' ? 0xc44a3a : kind === 'green' ? 0x4cd070 : (palette.window ?? 0xc3e2ee);
        const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat);
        m.position.set(x, y, z);
        group.add(m);
    }
};

const attachGreebles = (group, greebles, palette) => {
    for (const [pos, size, variant] of greebles) {
        const [w, h, d] = size;
        const color = variant === 'vent' ? 0x1a1d22 : variant === 'engine' ? (palette.engine ?? 0x6ad9f1)
            : variant === 'warning' ? (palette.warning ?? 0xe7794a)
            : variant === 'accent' ? (palette.accent ?? 0x6ad9f1) : (palette.hull ?? 0x6f7e88);
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.18, flatShading: variant === 'vent' });
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(...pos);
        group.add(m);
    }
};

// Add a rim shader pass to the group, identical contract to voxelModels.js.
const attachRimShader = (group, palette, intensityBase = 0.9) => {
    const rimGeometry = (() => {
        // Inflate the hull a smidge by capturing every child BoxGeometry /
        // ExtrudeGeometry, cloning, scaling each vertex along its normal.
        const merged = [];
        group.traverse((child) => {
            if (child.isMesh && child.geometry && child.geometry.attributes?.position
                && child.geometry.attributes?.normal && child.name !== 'hot-core') {
                merged.push(child);
            }
        });
        // Don't actually merge buffers - too expensive. We attach a separate
        // rim mesh that's a scaled copy of the most prominent mesh (the hull).
        const source = merged.find((m) => m.geometry?.type === 'ExtrudeGeometry') ?? merged[0];
        if (!source) return null;
        const clone = source.geometry.clone();
        const pos = clone.getAttribute('position');
        const norm = clone.getAttribute('normal');
        const inset = 0.08;
        for (let i = 0; i < pos.count; i += 1) {
            pos.setXYZ(i, pos.getX(i) + norm.getX(i) * inset, pos.getY(i) + norm.getY(i) * inset, pos.getZ(i) + norm.getZ(i) * inset);
        }
        pos.needsUpdate = true;
        clone.computeBoundingSphere();
        return clone;
    })();
    if (!rimGeometry) return null;
    const sunColor = new THREE.Color(0xffb070);
    const shadowColor = new THREE.Color(0x4d6fa0);
    const rimMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uColor:    { value: new THREE.Color(palette.accent ?? palette.engine ?? 0x6ad9f1) },
            uSun:      { value: sunColor },
            uShadow:   { value: shadowColor },
            uIntensity:{ value: intensityBase },
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vView;
            varying vec3 vWorldNormal;
            void main() {
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vNormal = normalize(mat3(modelMatrix) * normal);
                vWorldNormal = normalize(mat3(modelMatrix) * normal);
                vView = normalize(cameraPosition - worldPos.xyz);
                gl_Position = projectionMatrix * viewMatrix * worldPos;
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
                float fresnel = pow(1.0 - facing, 2.6);
                vec3 col = mix(uShadow, uColor, smoothstep(0.05, 0.55, facing));
                col = mix(col, uSun, smoothstep(0.45, 0.95, facing) * 0.85);
                gl_FragColor = vec4(col * fresnel * uIntensity, fresnel);
            }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
    });
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.name = 'hero-rim';
    rim.renderOrder = 2;
    group.add(rim);
    group.userData.rimMaterial = rimMaterial;
    return rimMaterial;
};

// ----------------------------------------------------------------------------
// Kestrel — small escort, slim dart shape, twin engines.
// Outline coordinates: x = ±span, y = length axis (positive = forward / nose).
// ----------------------------------------------------------------------------
const kestrelOutline = [
    [0,    3.6],   // nose tip
    [0.7,  2.7],
    [0.9,  1.4],
    [0.8,  0.0],
    [0.7, -1.2],
    [0,   -2.2],   // tail center (narrow)
    [-0.7, -1.2],
    [-0.8,  0.0],
    [-0.9,  1.4],
    [-0.7,  2.7],
];
const buildKestrel = (palette) => {
    const group = new THREE.Group();
    group.name = 'hero-kestrel';
    const hullGeo = makeHull(kestrelOutline, { depth: 0.85, bevel: 0.22 });
    const hullMesh = new THREE.Mesh(hullGeo, new THREE.MeshPhysicalMaterial({
        color: palette.hull, roughness: 0.32, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.18, envMapIntensity: 1.4, flatShading: false,
    }));
    group.add(hullMesh);
    // Wings: forward swept, span ±2.7, root chord ~1.5. Drawn as extruded triangles.
    for (const side of [-1, 1]) {
        const wg = makeWing(0.62, 2.6, 0.4, 1.1, 0.2, 0.14);
        wg.scale(side, 1, 1); // mirror
        wg.translate(side * 0.7, -0.3, 0.4);
        const wm = new THREE.Mesh(wg, new THREE.MeshPhysicalMaterial({
            color: palette.hull, roughness: 0.38, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.2, envMapIntensity: 1.4,
        }));
        group.add(wm);
        // Wingtip nav light marker.
        const color = side === -1 ? 0x4cd070 : 0xc44a3a;
        const nav = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
        nav.position.set(side * 2.6, -0.3, 0.4);
        group.add(nav);
    }
    // Canopy: rounded dome on top, slight forward bias. Use scaled sphere segment.
    const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({
            color: palette.canopy ?? 0x5d8a99, transmission: 0.6, roughness: 0.15, metalness: 0.0,
            clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.8, transparent: true, opacity: 0.92,
            ior: 1.4, thickness: 0.4,
        }),
    );
    canopy.position.set(0, 0.45, 1.6);
    canopy.scale.set(1, 0.8, 1.6);
    group.add(canopy);
    // Twin engines on the rear wing root, with bells.
    const enginePorts = [];
    for (const side of [-1, 1]) {
        const port = new THREE.Vector3(side * 0.7, -0.1, -2.3);
        enginePorts.push(port);
        const bell = makeEngineBell(0.32, 0.62, palette.engine ?? 0x6ad9f1);
        bell.position.copy(port);
        group.add(bell);
        // Small intake vent on the side of the hull behind the canopy.
        const intake = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.18, 0.4),
            new THREE.MeshStandardMaterial({ color: 0x141821, roughness: 0.6, metalness: 0.4 }),
        );
        intake.position.set(side * 0.78, 0.0, 1.0);
        group.add(intake);
    }
    // Antenna fin (thin cylinder up and forward).
    const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x6f7e88, metalness: 0.6, roughness: 0.4 }),
    );
    ant.position.set(0, 0.55, 2.9);
    ant.rotation.x = -0.2;
    group.add(ant);
    // Stripe along the spine: thin gold band.
    const spine = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.08, 2.6),
        new THREE.MeshBasicMaterial({ color: palette.accent ?? 0x6ad9f1, toneMapped: false }),
    );
    spine.position.set(0, 0.43, 0);
    group.add(spine);
    const mats = [hullMesh.material];
    return { group, mats, enginePorts };
};

// ----------------------------------------------------------------------------
// Talon — pirate interceptor, aggressive aft-swept wings, asymmetric bite.
// ----------------------------------------------------------------------------
const talonOutline = [
    [0,    3.8],
    [0.9,  2.8],
    [1.1,  1.4],
    [0.95, 0.0],
    [0.85, -1.4],
    [0,   -2.4],
    [-0.85, -1.4],
    [-0.95,  0.0],
    [-1.1,  1.4],
    [-0.9,  2.8],
];
const buildTalon = (palette) => {
    const group = new THREE.Group();
    group.name = 'hero-talon';
    const hullGeo = makeHull(talonOutline, { depth: 1.0, bevel: 0.22 });
    const hull = new THREE.Mesh(hullGeo, new THREE.MeshPhysicalMaterial({
        color: palette.hull, roughness: 0.36, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.16, envMapIntensity: 1.6,
    }));
    group.add(hull);
    // Aft-swept wings, sharper pointed tips.
    for (const side of [-1, 1]) {
        const wg = makeWing(0.7, 3.1, -0.6, 1.4, 0.25, 0.16);
        wg.scale(side, 1, 1);
        wg.translate(side * 0.8, -0.6, 0.2);
        const wm = new THREE.Mesh(wg, new THREE.MeshPhysicalMaterial({
            color: palette.hull, roughness: 0.42, metalness: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 1.5,
        }));
        group.add(wm);
        const color = side === -1 ? 0x4cd070 : 0xc44a3a;
        const nav = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
        nav.position.set(side * 3.1, -0.6, 0.2);
        group.add(nav);
    }
    // Larger canopy for pirate command cruiser feel.
    const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({
            color: palette.canopy ?? 0xaa3322, roughness: 0.2, metalness: 0.0,
            clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.8, transparent: true, opacity: 0.85,
        }),
    );
    canopy.position.set(0, 0.5, 1.6); canopy.scale.set(1, 0.7, 1.6);
    group.add(canopy);
    const enginePorts = [];
    for (const side of [-1, 1]) {
        const port = new THREE.Vector3(side * 0.85, -0.1, -2.6);
        enginePorts.push(port);
        const bell = makeEngineBell(0.42, 0.86, palette.engine ?? 0xff5520);
        bell.position.copy(port);
        group.add(bell);
    }
    // Centerline engine too — Talon is a 3-engine hot rod.
    const portC = new THREE.Vector3(0, -0.1, -2.6);
    enginePorts.push(portC);
    group.add(makeEngineBell(0.42, 0.86, palette.engine ?? 0xff5520).clone().translateX(0).translateZ(-2.6));
    // Spine antenna: crooked pirate whip antenna.
    const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5),
        new THREE.MeshStandardMaterial({ color: 0x803020, metalness: 0.45, roughness: 0.5 }),
    );
    ant.position.set(0, 0.55, 2.9); ant.rotation.x = -0.35; ant.rotation.z = 0.1;
    group.add(ant);
    // Underslung belly pod (cargo bay).
    const pod = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.36, 1.6),
        new THREE.MeshStandardMaterial({ color: 0x421f1b, roughness: 0.6, metalness: 0.3 }),
    );
    pod.position.set(0, -0.55, 0.0);
    group.add(pod);
    // Warning stripes on the pod.
    const stripe1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.02, 0.4),
        new THREE.MeshBasicMaterial({ color: palette.warning ?? 0xffb358 }),
    );
    stripe1.position.set(0, -0.36, 0.4);
    group.add(stripe1);
    const stripe2 = stripe1.clone(); stripe2.position.z = -0.4; group.add(stripe2);
    const mats = [hull.material];
    return { group, mats, enginePorts };
};

// ----------------------------------------------------------------------------
// Warden — Concord patrol, broad shoulders, boxy fuselage, double tail fins.
// ----------------------------------------------------------------------------
const wardenOutline = [
    [0,    4.0],
    [0.85, 3.0],
    [1.05, 1.6],
    [1.15, 0.2],
    [1.0, -1.0],
    [0,   -2.2],
    [-1.0, -1.0],
    [-1.15, 0.2],
    [-1.05, 1.6],
    [-0.85, 3.0],
];
const buildWarden = (palette) => {
    const group = new THREE.Group();
    group.name = 'hero-warden';
    const hullGeo = makeHull(wardenOutline, { depth: 1.0, bevel: 0.24 });
    const hull = new THREE.Mesh(hullGeo, new THREE.MeshPhysicalMaterial({
        color: palette.hull, roughness: 0.34, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.14, envMapIntensity: 1.7,
    }));
    group.add(hull);
    // Vertical stabilizers (Concord tail fins).
    for (const x of [-0.9, 0.9]) {
        const tail = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 1.0, 0.7),
            new THREE.MeshPhysicalMaterial({ color: palette.dark, roughness: 0.5, metalness: 0.55 }),
        );
        tail.position.set(x, 0.85, -1.4);
        group.add(tail);
    }
    // Forward-swept wings (Concord preferred).
    for (const side of [-1, 1]) {
        const wg = makeWing(0.65, 3.0, 0.3, 1.1, 0.3, 0.16);
        wg.scale(side, 1, 1); wg.translate(side * 0.85, -0.1, 0.4);
        const wm = new THREE.Mesh(wg, new THREE.MeshPhysicalMaterial({
            color: palette.hull, roughness: 0.4, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.16, envMapIntensity: 1.6,
        }));
        group.add(wm);
        const color = side === -1 ? 0x4cd070 : 0xc44a3a;
        const nav = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
        nav.position.set(side * 3.0, -0.1, 0.4);
        group.add(nav);
    }
    // Big canopy.
    const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.85, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({
            color: palette.canopy ?? 0x6ad9f1, roughness: 0.15, metalness: 0.0,
            clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.8, transparent: true, opacity: 0.85,
        }),
    );
    canopy.position.set(0, 0.55, 1.4); canopy.scale.set(1, 0.7, 1.5);
    group.add(canopy);
    const enginePorts = [];
    for (const side of [-1, 1]) {
        const port = new THREE.Vector3(side * 0.85, 0.0, -2.4);
        enginePorts.push(port);
        const bell = makeEngineBell(0.36, 0.7, palette.engine ?? 0x6ad9f1);
        bell.position.copy(port);
        group.add(bell);
    }
    // Wings have weapon mounts: small pod on each inner wing.
    for (const side of [-1, 1]) {
        const pod = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 0.6, 12),
            new THREE.MeshStandardMaterial({ color: palette.dark, roughness: 0.5, metalness: 0.6 }),
        );
        pod.position.set(side * 1.8, -0.2, 0.2);
        pod.rotation.z = Math.PI / 2;
        group.add(pod);
    }
    // Concord accent stripe down the spine in faction color.
    const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.06, 3.0),
        new THREE.MeshBasicMaterial({ color: palette.accent ?? 0x6ad9f1, toneMapped: false }),
    );
    stripe.position.set(0, 0.5, 0);
    group.add(stripe);
    const mats = [hull.material];
    return { group, mats, enginePorts };
};

// ----------------------------------------------------------------------------
// Prospector — mining ship, chunky hammerhead with cargo arms.
// ----------------------------------------------------------------------------
const prospectorOutline = [
    [0,    4.4],
    [1.4,  3.4],   // wide blunt nose shoulders
    [1.6,  1.8],
    [1.4,  0.0],
    [1.2, -1.4],
    [0,   -2.2],
    [-1.2, -1.4],
    [-1.4,  0.0],
    [-1.6,  1.8],
    [-1.4,  3.4],
];
const buildProspector = (palette) => {
    const group = new THREE.Group();
    group.name = 'hero-prospector';
    const hullGeo = makeHull(prospectorOutline, { depth: 1.4, bevel: 0.28 });
    const hull = new THREE.Mesh(hullGeo, new THREE.MeshPhysicalMaterial({
        color: palette.hull, roughness: 0.4, metalness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.22, envMapIntensity: 1.4,
    }));
    group.add(hull);
    // Wide cargo arms extending below the hull.
    for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(
            new THREE.BoxGeometry(0.85, 0.78, 2.8),
            new THREE.MeshStandardMaterial({ color: palette.dark, roughness: 0.7, metalness: 0.35 }),
        );
        arm.position.set(side * 1.2, -1.05, 0.0);
        group.add(arm);
        // Cyclical stripes (warning yellow/black) on the arm.
        for (let i = 0; i < 4; i += 1) {
            const seg = new THREE.Mesh(
                new THREE.BoxGeometry(0.86, 0.06, 0.5),
                new THREE.MeshBasicMaterial({ color: i % 2 ? 0x1f1612 : (palette.warning ?? 0xffb358) }),
            );
            seg.position.set(side * 1.2, -0.7, -1.1 + i * 0.7);
            group.add(seg);
        }
        // Mining laser barrel extending forward.
        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.16, 1.5, 10),
            new THREE.MeshStandardMaterial({ color: palette.dark, metalness: 0.6, roughness: 0.4 }),
        );
        barrel.position.set(side * 1.6, -0.45, 2.5);
        barrel.rotation.x = Math.PI / 2;
        group.add(barrel);
        // Nav light.
        const color = side === -1 ? 0x4cd070 : 0xc44a3a;
        const nav = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
        nav.position.set(side * 1.6, -0.7, -1.5);
        group.add(nav);
    }
    // Cockpit small and centered, looking down at the rocks.
    const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({
            color: palette.canopy ?? 0x9accc0, roughness: 0.15, metalness: 0.0,
            clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.7, transparent: true, opacity: 0.86,
        }),
    );
    canopy.position.set(0, 0.7, 2.8); canopy.scale.set(0.8, 0.5, 1.3);
    group.add(canopy);
    const enginePorts = [];
    for (const side of [-1, 1]) {
        const port = new THREE.Vector3(side * 1.0, 0.0, -2.4);
        enginePorts.push(port);
        const bell = makeEngineBell(0.42, 0.84, palette.engine ?? 0xe8b85c);
        bell.position.copy(port);
        group.add(bell);
    }
    // Antenna array on top.
    for (const x of [-0.5, 0, 0.5]) {
        const ant = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.9, 5),
            new THREE.MeshStandardMaterial({ color: palette.dark, metalness: 0.5, roughness: 0.4 }),
        );
        ant.position.set(x, 1.05, 1.5);
        group.add(ant);
    }
    const mats = [hull.material];
    return { group, mats, enginePorts };
};

// ----------------------------------------------------------------------------
// Lancer — bounty hunter, long sleek dart with twin canards.
// ----------------------------------------------------------------------------
const lancerOutline = [
    [0,    5.0],
    [0.55, 3.6],
    [0.75, 1.8],
    [0.7,  0.0],
    [0.6, -2.0],
    [0,   -3.0],
    [-0.6, -2.0],
    [-0.7,  0.0],
    [-0.75, 1.8],
    [-0.55, 3.6],
];
const buildLancer = (palette) => {
    const group = new THREE.Group();
    group.name = 'hero-lancer';
    const hullGeo = makeHull(lancerOutline, { depth: 0.85, bevel: 0.22 });
    const hull = new THREE.Mesh(hullGeo, new THREE.MeshPhysicalMaterial({
        color: palette.hull, roughness: 0.3, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.18, envMapIntensity: 1.7,
    }));
    group.add(hull);
    // Forward-swept narrow wings.
    for (const side of [-1, 1]) {
        const wg = makeWing(0.45, 2.4, 0.6, 1.0, 0.18, 0.12);
        wg.scale(side, 1, 1); wg.translate(side * 0.5, -0.1, 0.4);
        const wm = new THREE.Mesh(wg, new THREE.MeshPhysicalMaterial({
            color: palette.hull, roughness: 0.36, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.18, envMapIntensity: 1.6,
        }));
        group.add(wm);
        const color = side === -1 ? 0x4cd070 : 0xc44a3a;
        const nav = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
        nav.position.set(side * 2.4, -0.1, 0.4);
        group.add(nav);
    }
    // Forward canards near the nose.
    for (const side of [-1, 1]) {
        const c = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.08, 1.6),
            new THREE.MeshStandardMaterial({ color: palette.dark, metalness: 0.5, roughness: 0.45 }),
        );
        c.position.set(side * 0.7, 0.0, 2.8);
        c.rotation.z = side * -0.25;
        group.add(c);
    }
    // Long narrow canopy.
    const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({
            color: palette.canopy ?? 0xa8bf9a, roughness: 0.18, metalness: 0.0,
            clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.7, transparent: true, opacity: 0.85,
        }),
    );
    canopy.position.set(0, 0.45, 2.6); canopy.scale.set(0.7, 0.6, 2.0);
    group.add(canopy);
    const enginePorts = [];
    // Triple engine row.
    for (const x of [-0.5, 0, 0.5]) {
        const port = new THREE.Vector3(x, -0.1, -3.2);
        enginePorts.push(port);
        const bell = makeEngineBell(0.3, 0.58, palette.engine ?? 0xe8b85c);
        bell.position.copy(port);
        group.add(bell);
    }
    // Spine antenna.
    const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5),
        new THREE.MeshStandardMaterial({ color: 0x6f7e88, metalness: 0.5, roughness: 0.4 }),
    );
    ant.position.set(0, 0.55, 4.4); ant.rotation.x = -0.18;
    group.add(ant);
    // Accent stripe along spine.
    const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.06, 4.0),
        new THREE.MeshBasicMaterial({ color: palette.accent ?? 0xc46a3a, toneMapped: false }),
    );
    stripe.position.set(0, 0.45, 0.5);
    group.add(stripe);
    const mats = [hull.material];
    return { group, mats, enginePorts };
};

// ----------------------------------------------------------------------------
// Atlas-Freighter — heavy hauler, 4 cargo pods + 4 engines.
// ----------------------------------------------------------------------------
const atlasOutline = [
    [0,    6.0],
    [1.05, 4.4],
    [1.25, 2.4],
    [1.3,  0.4],
    [1.2, -1.8],
    [0,   -3.4],
    [-1.2, -1.8],
    [-1.3,  0.4],
    [-1.25, 2.4],
    [-1.05, 4.4],
];
const buildAtlas = (palette) => {
    const group = new THREE.Group();
    group.name = 'hero-atlas';
    const hullGeo = makeHull(atlasOutline, { depth: 1.6, bevel: 0.32 });
    const hull = new THREE.Mesh(hullGeo, new THREE.MeshPhysicalMaterial({
        color: palette.hull, roughness: 0.36, metalness: 0.5, clearcoat: 0.9, clearcoatRoughness: 0.2, envMapIntensity: 1.5,
    }));
    group.add(hull);
    // Dorsal fin/keel that doubles as an air-brake.
    const keel = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.6, 4.0),
        new THREE.MeshPhysicalMaterial({ color: palette.dark, roughness: 0.5, metalness: 0.5, clearcoat: 0.6 }),
    );
    keel.position.set(0, 1.05, -1.0);
    group.add(keel);
    // Cargo pods — two on each side. Each pod is a chamfered box with a green
    // "cargo" stripe.
    for (const [side, z] of [[-1, -2.6], [-1, -0.2], [-1, 2.2], [1, -2.6], [1, -0.2], [1, 2.2]]) {
        const pod = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, 1.0, 2.2),
            new THREE.MeshStandardMaterial({ color: palette.cargo ?? 0x8a7a5a, roughness: 0.6, metalness: 0.35 }),
        );
        pod.position.set(side * 2.7, -0.4, z);
        group.add(pod);
        // Strut from hull to pod.
        const strut = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 1.5, 8),
            new THREE.MeshStandardMaterial({ color: palette.dark, metalness: 0.5, roughness: 0.5 }),
        );
        strut.position.set(side * 1.7, -0.4, z);
        strut.rotation.z = Math.PI / 2;
        group.add(strut);
    }
    // Canopy forward.
    const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({
            color: palette.canopy ?? 0x65d7c3, roughness: 0.18, metalness: 0.0,
            clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.7, transparent: true, opacity: 0.88,
        }),
    );
    canopy.position.set(0, 0.85, 4.2); canopy.scale.set(0.85, 0.7, 1.2);
    group.add(canopy);
    const enginePorts = [];
    // Four engines across the rear, fanned out laterally.
    for (const x of [-1.2, -0.4, 0.4, 1.2]) {
        const port = new THREE.Vector3(x, 0.05, -3.55);
        enginePorts.push(port);
        const bell = makeEngineBell(0.5, 1.0, palette.engine ?? 0x6ad9f1);
        bell.position.copy(port);
        group.add(bell);
    }
    // Baggage pods on the back: telescoping antenna.
    for (const x of [-0.5, 0.5]) {
        const ant = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6),
            new THREE.MeshStandardMaterial({ color: palette.dark, metalness: 0.45, roughness: 0.45 }),
        );
        ant.position.set(x, 1.4, -0.5);
        group.add(ant);
    }
    // Cargo deck lights as bright squares on top.
    for (let i = -2; i <= 2; i += 1) {
        const lamp = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.05, 0.2),
            new THREE.MeshBasicMaterial({ color: palette.window ?? 0xf4d090, toneMapped: false }),
        );
        lamp.position.set(0, 0.82, i * 0.9);
        group.add(lamp);
    }
    const mats = [hull.material];
    return { group, mats, enginePorts };
};

// ----------------------------------------------------------------------------
// Stations
// ----------------------------------------------------------------------------
const buildHelixStation = () => {
    const group = new THREE.Group();
    group.name = 'hero-helix';
    // Central spindle: tall vertical cylinder.
    const spindleTop = 25, spindleBottom = -25;
    const spindleMat = new THREE.MeshPhysicalMaterial({ color: 0x8d856e, roughness: 0.4, metalness: 0.55, clearcoat: 0.7, clearcoatRoughness: 0.25, envMapIntensity: 1.4 });
    const spindle = new THREE.Mesh(
        new THREE.CylinderGeometry(2.5, 2.5, spindleTop - spindleBottom, 32, 1, false),
        spindleMat,
    );
    spindle.position.y = (spindleTop + spindleBottom) / 2;
    group.add(spindle);
    // Mid-body ribbed rings.
    for (const y of [-18, -9, 0, 9, 18]) {
        const ring = new THREE.Mesh(
            new THREE.CylinderGeometry(3.8, 3.8, 0.9, 36, 1, false),
            new THREE.MeshStandardMaterial({ color: 0x6a5d44, roughness: 0.5, metalness: 0.55 }),
        );
        ring.position.y = y;
        group.add(ring);
    }
    // Command bulb at the front (top).
    const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(3.4, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({ color: 0x9a8d6e, roughness: 0.4, metalness: 0.5, clearcoat: 0.8, envMapIntensity: 1.5 }),
    );
    bulb.position.y = spindleTop - 1;
    group.add(bulb);
    // Window strip around the bulb.
    for (let i = 0; i < 24; i += 1) {
        const angle = (i / 24) * Math.PI * 2;
        const win = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.18, 0.18),
            new THREE.MeshBasicMaterial({ color: i % 5 === 0 ? 0xff7040 : 0x6ad9f1, toneMapped: false }),
        );
        win.position.set(Math.cos(angle) * 3.42, spindleTop - 1.5 + Math.sin(angle) * 0.0, Math.sin(angle) * 3.42 + (i % 3) * 0.05);
        // Re-anchor windows around bulb equator.
        win.position.set(Math.cos(angle) * 3.42, spindleTop + 0.05, Math.sin(angle) * 3.42);
        group.add(win);
    }
    // Aft engine block.
    const aft = new THREE.Mesh(
        new THREE.CylinderGeometry(3.2, 4.4, 6.0, 28),
        new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.7, metalness: 0.4 }),
    );
    aft.position.y = spindleBottom - 3;
    group.add(aft);
    // Aft thrust bells (3 concentric cones).
    for (const r of [3.5, 2.5, 1.6]) {
        const bell = new THREE.Mesh(
            new THREE.CylinderGeometry(r * 0.9, r * 1.15, 1.6, 24),
            new THREE.MeshStandardMaterial({ color: 0x2a261f, metalness: 0.7, roughness: 0.4 }),
        );
        bell.position.y = spindleBottom - 7.5;
        group.add(bell);
    }
    const aftGlow = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6, 0.6, 0.6, 24),
        new THREE.MeshBasicMaterial({ color: 0xff9a4a, toneMapped: false }),
    );
    aftGlow.position.y = spindleBottom - 7.5;
    group.add(aftGlow);
    // Habitat ring (torus).
    const habitat = new THREE.Mesh(
        new THREE.TorusGeometry(11.5, 1.6, 16, 56),
        new THREE.MeshPhysicalMaterial({ color: 0x897a5d, roughness: 0.45, metalness: 0.5, clearcoat: 0.7, envMapIntensity: 1.4 }),
    );
    habitat.position.y = -4;
    habitat.rotation.x = Math.PI / 2;
    group.add(habitat);
    // Spoke lights along the habitat ring.
    for (let i = 0; i < 16; i += 1) {
        const angle = (i / 16) * Math.PI * 2;
        const spoke = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 11.5, 6),
            new THREE.MeshStandardMaterial({ color: 0x6a5d44, roughness: 0.5, metalness: 0.55 }),
        );
        spoke.position.set(Math.cos(angle) * 5.75, -4, Math.sin(angle) * 5.75);
        spoke.rotation.z = Math.PI / 2;
        spoke.rotation.y = -angle;
        group.add(spoke);
        // Habitation pods hanging off the ring.
        const pod = new THREE.Mesh(
            new THREE.SphereGeometry(0.6, 12, 8),
            new THREE.MeshStandardMaterial({ color: 0x726047, roughness: 0.6, metalness: 0.45 }),
        );
        pod.position.set(Math.cos(angle) * 11.5, -4, Math.sin(angle) * 11.5);
        group.add(pod);
        // Pod running light.
        const lamp = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.18, 0.18),
            new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xff7040 : 0x80e0e0, toneMapped: false }),
        );
        lamp.position.set(Math.cos(angle) * 11.5, -3.4, Math.sin(angle) * 11.5);
        group.add(lamp);
    }
    // Side docking booms.
    for (const side of [-1, 1]) {
        const boom = new THREE.Mesh(
            new THREE.BoxGeometry(8.5, 1.4, 1.6),
            new THREE.MeshStandardMaterial({ color: 0x6a5d44, roughness: 0.55, metalness: 0.5 }),
        );
        boom.position.set(side * 7.0, -2, -3);
        group.add(boom);
        // Boom tip warning lamp.
        const lamp = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 12, 8),
            new THREE.MeshBasicMaterial({ color: side > 0 ? 0xff7040 : 0x6ad9f1, toneMapped: false }),
        );
        lamp.position.set(side * 11.5, -2, -3);
        group.add(lamp);
    }
    // Beacon top antenna.
    const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 4.0, 8),
        new THREE.MeshStandardMaterial({ color: 0x5a503b, metalness: 0.6, roughness: 0.5 }),
    );
    ant.position.y = spindleTop + 2;
    group.add(ant);
    const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xff8030, toneMapped: false }),
    );
    beacon.position.y = spindleTop + 4;
    group.add(beacon);
    // Beacon additive halo.
    const halo = new THREE.Mesh(
        new THREE.SphereGeometry(1.4, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xff8030, toneMapped: false, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending }),
    );
    halo.position.y = spindleTop + 4;
    group.add(halo);
    return { group };
};

const buildRookStation = () => {
    const group = new THREE.Group();
    group.name = 'hero-rook';
    // Central core.
    const coreMat = new THREE.MeshPhysicalMaterial({ color: 0x8fa3a7, roughness: 0.45, metalness: 0.55, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 1.5 });
    const core = new THREE.Mesh(
        new THREE.BoxGeometry(8, 6, 8),
        coreMat,
    );
    group.add(core);
    // Top dome with command view.
    const dome = new THREE.Mesh(
        new THREE.SphereGeometry(3.4, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({ color: 0x6c818a, roughness: 0.35, metalness: 0.5, clearcoat: 1, envMapIntensity: 1.6 }),
    );
    dome.position.y = 3;
    group.add(dome);
    // 4 arms extending out in a + cross (XZ plane).
    const armMat = new THREE.MeshStandardMaterial({ color: 0x27343b, roughness: 0.55, metalness: 0.55 });
    for (const [dir, axis, sign] of [['x', 'x', 1], ['x', 'x', -1], ['z', 'z', 1], ['z', 'z', -1]]) {
        const arm = new THREE.Mesh(
            new THREE.BoxGeometry(axis === 'x' ? 16 : 4, 2.5, axis === 'z' ? 16 : 4),
            armMat,
        );
        arm.position.set(axis === 'x' ? sign * 14 : 0, 0, axis === 'z' ? sign * 14 : 0);
        group.add(arm);
        // Outer drum at the end of the arm.
        const drum = new THREE.Mesh(
            new THREE.CylinderGeometry(2.0, 2.0, 3.0, 20),
            coreMat,
        );
        drum.position.set(axis === 'x' ? sign * 22 : 0, 0, axis === 'z' ? sign * 22 : 0);
        group.add(drum);
        // Drum running lights.
        for (let i = 0; i < 8; i += 1) {
            const angle = (i / 8) * Math.PI * 2;
            const lamp = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, 0.2, 0.2),
                new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xff7040 : 0x80e0e0, toneMapped: false }),
            );
            lamp.position.set(
                (axis === 'x' ? sign * 22 : 0) + Math.cos(angle) * 1.6,
                1.5,
                (axis === 'z' ? sign * 22 : 0) + Math.sin(angle) * 1.6,
            );
            group.add(lamp);
        }
        // Window strip down the arm.
        for (let i = 0; i < 5; i += 1) {
            const win = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, 0.2, 0.4),
                new THREE.MeshBasicMaterial({ color: 0x68c6e4, toneMapped: false }),
            );
            win.position.set(
                axis === 'x' ? sign * (8 + i * 3) : Math.cos((i + 2) * 0.4) * 0.5,
                1.2,
                axis === 'z' ? sign * (8 + i * 3) : Math.sin((i + 2) * 0.4) * 0.5,
            );
            group.add(win);
        }
    }
    // Antenna trio at the top.
    for (const x of [-2.0, 0, 2.0]) {
        const ant = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.15, 4.5, 6),
            new THREE.MeshStandardMaterial({ color: 0x6c818a, metalness: 0.5, roughness: 0.4 }),
        );
        ant.position.set(x, 6.0, 0);
        group.add(ant);
        // Tip lamp.
        const lamp = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 10, 8),
            new THREE.MeshBasicMaterial({ color: x === 0 ? 0xfff050 : 0xff7040, toneMapped: false }),
        );
        lamp.position.set(x, 8.4, 0);
        group.add(lamp);
    }
    // Central beacon.
    const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xff8030, toneMapped: false }),
    );
    beacon.position.set(0, 3.5, 0);
    group.add(beacon);
    const halo = new THREE.Mesh(
        new THREE.SphereGeometry(1.4, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xff8030, toneMapped: false, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending }),
    );
    halo.position.set(0, 3.5, 0);
    group.add(halo);
    // Hull window rings.
    for (let z = -3; z <= 3; z += 1) {
        for (let sign of [-1, 1]) {
            const win = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, 0.2, 0.2),
                new THREE.MeshBasicMaterial({ color: 0x80e0e0, toneMapped: false }),
            );
            win.position.set(sign * 4.05, z % 2 === 0 ? -1.0 : 1.0, z * 0.8);
            group.add(win);
        }
    }
    return { group };
};

// ----------------------------------------------------------------------------
// Dispatch tables.
// ----------------------------------------------------------------------------
const shipBuilders = {
    kestrel: buildKestrel,
    talon: buildTalon,
    warden: buildWarden,
    prospector: buildProspector,
    lancer: buildLancer,
    'atlas-freighter': buildAtlas,
};
const stationBuilders = {
    helix: buildHelixStation,
    rook: buildRookStation,
};

const safeDefaultPalette = {
    hull: 0x6f7e88, dark: 0x2c3540, accent: 0x6ad9f1, canopy: 0x6ad9f1,
    engine: 0x6ad9f1, warning: 0xff7040, window: 0xc3e2ee, cargo: 0x8a7a5a,
};

export const createHeroShipModel = (variant, palette) => {
    const builder = shipBuilders[variant] ?? shipBuilders.kestrel;
    const { group, mats, enginePorts } = builder({ ...safeDefaultPalette, ...palette });
    // Populate the same fields the in-game renderer expects from the voxel
    // builder so the rest of render.js works without changes.
    const userData = group.userData;
    userData.variant = variant;
    userData.hullMaterials = mats;
    userData.emissiveMaterials = mats; // alias for syncShips
    attachRimShader(group, palette, 0.7);
    return {
        group,
        variant,
        enginePorts: enginePorts.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
        hullMaterial: mats[0],
        glowMaterial: mats[0],
        rimMaterial: group.userData.rimMaterial,
    };
};

export const createHeroStationModel = (id) => {
    const builder = stationBuilders[id] ?? buildHelixStation;
    const { group } = builder();
    return group;
};
