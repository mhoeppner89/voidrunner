// Shared authored wreck layout. No rendering, collision or race imports.
// Race checkpoints and mission landmarks use this same model/world frame.

const WRECK_INTERIORS = Object.freeze({
    // Runtime/glTF axes are X=length, Y=height, Z=-Blender-side. These values
    // deliberately match the shipped GLB frame.
    battleship: Object.freeze({ sectionName: 'Battleship wreck midsection', center: Object.freeze([0.072063, 0.065, 0.05]), halfLength: 0.356085, halfWidth: 0.19, halfHeight: 0.14, hotspotCount: 10 }),
    carrier: Object.freeze({ sectionName: 'Carrier wreck flight deck', center: Object.freeze([0.087386, 0.015, -0.07]), halfLength: 0.382288, halfWidth: 0.205, halfHeight: 0.145, hotspotCount: 10 }),
    cruiser: Object.freeze({ sectionName: 'Cruiser wreck command hull', center: Object.freeze([0.033398, 0.19, 0.04]), halfLength: 0.421548, halfWidth: 0.13, halfHeight: 0.12, hotspotCount: 6 }),
});

// Fixed section arrangements share each hull's geometry and textures. Deltas
// act in the model frame (before the whole wreck rotation/scale). Keep the
// cruiser command hull unchanged: its interior contains authored race/salvage routes.
// Rotate each detached piece around its own centre, then move it clear of
// the neighbouring break. Interior hull sections keep their authored frame.
const sectionDelta = (offset,rotation,pivot=[0,0,0]) => {
    const [x,y,z]=rotation,c1=Math.cos(x/2),c2=Math.cos(y/2),c3=Math.cos(z/2),s1=Math.sin(x/2),s2=Math.sin(y/2),s3=Math.sin(z/2);
    const q=[s1*c2*c3+c1*s2*s3,c1*s2*c3-s1*c2*s3,c1*c2*s3+s1*s2*c3,c1*c2*c3-s1*s2*s3];
    const [qx,qy,qz,qw]=q,[px,py,pz]=pivot,tx=2*(qy*pz-qz*py),ty=2*(qz*px-qx*pz),tz=2*(qx*py-qy*px);
    const rotated=[px+qw*tx+qy*tz-qz*ty,py+qw*ty+qz*tx-qx*tz,pz+qw*tz+qx*ty-qy*tx];
    return Object.freeze({position:Object.freeze(offset.map((v,i)=>v+pivot[i]-rotated[i])),rotation:Object.freeze(rotation)});
};
const breakRoute=(id,x,y,length)=>Object.freeze({id,center:Object.freeze([x,y,0]),halfWidth:.045,halfHeight:.06,openingHalfWidth:.14,openingHalfHeight:.24,halfLength:length});
// These are clearances BETWEEN torn sections, never volumes cut from a hull.
export const WRECK_BREAK_ROUTES=Object.freeze({
    battleship:Object.freeze([breakRoute('bow-break',-.58,-.07,.95),breakRoute('drive-break',.72,-.07,.95)]),
    carrier:Object.freeze([breakRoute('bow-break',-.84,-.04,.95)]),
    cruiser:Object.freeze([breakRoute('drive-break',.90,-.04,.8)]),
});
const prow=[-.8,0,0],stern=[.9,-.04,0];
// Displaced source plating, rather than an empty space where a roof vanished.
const ejectedStructure=(label,y,side=1)=>{
    const pieces=label==='Carrier'?[
        [[-.10,.50,-.27],[-.65,.30,.31],[-.32,y,0]],
        [[.02,.59,.32],[.43,-.29,-.48],[.04,y,0]],
        [[.15,.48,-.19],[-.28,.51,.35],[.31,y,0]],
        [[-.02,.52,.20],[.60,.18,-.73],[.55,y,0]],
    ]:label==='Cruiser'?[
        [[-.08,.54,.24],[-.48,.22,.51],[-.18,y,0]],
        [[.12,.59,-.27],[.54,-.31,-.45],[.43,y,0]],
    ]:[
        [[-.035,.08,.08],[-.42,.25,.31],[.26,.10,0]],
        [[.04,.10,-.09],[.34,-.29,-.48],[.38,.10,0]],
    ];
    return Object.fromEntries(pieces.map(([offset,turn,pivot],i)=>[
        `${label} wreck ejected structure ${i+1}`,
        sectionDelta(offset.map((v,j)=>j===2?v*side:v),turn.map((v,j)=>j===0?v*side:v),pivot),
    ]));
};
const frigateBridge=(variant)=>({
    'Frigate wreck command tower':sectionDelta([.02,.05,variant%2?-.07:.08],[.18+variant*.05,-.16,.27-variant*.1],[.31,.18,0]),
    ...ejectedStructure('Frigate',.24,variant%2?-1:1),
});
export const WRECK_SECTION_VARIANTS = Object.freeze({
    battleship:Object.freeze([Object.freeze({
        'Battleship wreck bridge':sectionDelta([.035,.035,.06],[.23,-.17,.38],[.43,.27,0]),
        'Battleship wreck bridge support 1':sectionDelta([-.09,.11,.13],[.38,.2,-.32],[.35,.16,0]),
        'Battleship wreck bridge support 2':sectionDelta([.07,.08,-.15],[-.26,-.34,.25],[.42,.16,0]),
        'Battleship wreck bridge support 3':sectionDelta([.14,.16,.12],[.3,-.23,.45],[.49,.16,0]),
        'Battleship wreck forward section':sectionDelta([-.20,-.025,.04],[.07,.13,-.11],prow),
        'Battleship wreck detached engine pod':sectionDelta([.17,-.04,.08],[.08,.12,-.10],[1,0,.3]),
        'Battleship wreck engine section':sectionDelta([.22,-.04,-.035],[-.11,-.08,.15],stern),
    })]),
    carrier:Object.freeze([Object.freeze({
        'Carrier wreck bow':sectionDelta([-.45,-.04,.06],[-.14,-.09,.16],prow),
        'Carrier wreck detached engine pod':sectionDelta([.12,-.08,.18],[.27,.08,-.32],[.96,-.05,.3]),
        'Carrier wreck command island':sectionDelta([.03,.07,-.12],[-.26,.18,-.38],[.31,.23,0]),
        ...ejectedStructure('Carrier',.12),
    })]),
    cruiser:Object.freeze([
        Object.freeze({
            'Cruiser wreck detached engine pod':sectionDelta([.55,-.12,.21],[.38,.21,-.27],[.9,0,.3]),
            'Cruiser wreck engine cluster':sectionDelta([.55,-.04,.06],[.15,-.14,.12],stern),
            'Cruiser wreck command tower':sectionDelta([.02,.10,.13],[.32,-.2,.29],[.16,.4,0]),
            ...ejectedStructure('Cruiser',.25),
        }),
        Object.freeze({
            'Cruiser wreck broadside shell':sectionDelta([.02,-.05,.24],[.31,.08,-.09],[0,-.08,.29]),
            'Cruiser wreck command tower':sectionDelta([-.04,.08,-.15],[-.25,.26,-.37],[.16,.4,0]),
            ...ejectedStructure('Cruiser',.25,-1),
        }),
    ]),
    frigate:Object.freeze([
        Object.freeze({
            'Frigate wreck forward section':sectionDelta([-.10,.04,.02],[.13,-.09,.14],[-.6,0,0]),
            'Frigate wreck engine section':sectionDelta([.12,-.03,-.04],[-.16,.12,-.18],[.65,0,0]),
            ...frigateBridge(0),
        }),
        Object.freeze({
            'Frigate wreck engine section':sectionDelta([.25,.10,-.16],[.42,-.25,.18],[.9,-.04,0]),
            ...frigateBridge(1),
        }),
        Object.freeze({
            'Frigate wreck port armour':sectionDelta([-.03,.05,-.21],[-.36,.16,.12],[0,-.05,-.28]),
            ...frigateBridge(2),
        }),
        Object.freeze({
            'Frigate wreck engine section':sectionDelta([.23,-.13,.17],[-.36,.18,-.28],[.9,-.04,0]),
            ...frigateBridge(3),
        }),
    ]),
    wayfarer:Object.freeze([Object.freeze({
        'Wayfarer wreck prow':sectionDelta([-.09,.035,.04],[.11,.15,-.16],prow),
        'Wayfarer wreck cabin':sectionDelta([0,-.02,0],[-.08,-.10,.05],[.06,0,0]),
        'Wayfarer wreck drive':sectionDelta([.12,.04,-.05],[.18,-.14,.12],stern),
    })]),
    talon:Object.freeze([Object.freeze({
        'Talon wreck nose':sectionDelta([-.10,-.04,.06],[-.12,-.14,.13],prow),
        'Talon wreck wing core':sectionDelta([0,.02,0],[.07,.08,-.04],[.06,0,0]),
        'Talon wreck engine':sectionDelta([.12,.05,-.04],[.15,.16,-.14],stern),
    })]),
});
export const wreckSectionDelta = (wreck, name) => WRECK_SECTION_VARIANTS[wreck.class]?.[wreck.variant ?? 0]?.[name];

// The carrier and battleship anchor opposite sides of the quiet entry.
// Two cruiser casualty sites flank them; the smaller escorts cluster around
// their parent ships. Core interiors keep their authored mission/race frames.
// High-detail wreck landmarks rendered from the same hulls that fly in live
// space. worldData.js re-exports this object for render/game callers so there
// remains one shared identity and one source of truth.
export const GRAVEYARD_MODEL_WRECKS = Object.freeze([
    Object.freeze({ id: 'concord-battleship-wreck', class: 'battleship', file: 'assets/models/wrecks/concord-battleship-wreck-v4.glb', local: [350, -700, 1900], rotation: [0.04, -0.12, 0.05], scale: 1130, clearanceRadius: 1780, passages:WRECK_BREAK_ROUTES.battleship, interior: WRECK_INTERIORS.battleship }),
    Object.freeze({ id: 'concord-carrier-wreck', class: 'carrier', file: 'assets/models/wrecks/concord-carrier-wreck-v4.glb', local: [-650, 850, -1850], rotation: [0.04, -1.21, 0.05], scale: 902.5508, clearanceRadius: 1520, passages:WRECK_BREAK_ROUTES.carrier, interior: WRECK_INTERIORS.carrier }),
    Object.freeze({ id: 'concord-cruiser-alpha-wreck', class: 'cruiser', file: 'assets/models/wrecks/concord-cruiser-wreck-v4.glb', local: [2850, 850, -1500], rotation: [-0.08, -0.42, 0.16], scale: 564.0943, clearanceRadius: 1130, passages:WRECK_BREAK_ROUTES.cruiser, interior: WRECK_INTERIORS.cruiser }),
    Object.freeze({ id: 'concord-cruiser-beta-wreck', variant: 1, class: 'cruiser', modelKey: 'cruiser-broadside', file: 'assets/models/wrecks/concord-cruiser-broadside.glb', local: [-3000, -650, 1200], rotation: [0.12, 0.82, -0.18], scale: 564.0943, clearanceRadius: 990, passages:Object.freeze([]), interior: WRECK_INTERIORS.cruiser }),
    Object.freeze({ id: 'concord-frigate-alpha-wreck', class: 'frigate', file: 'assets/models/wrecks/concord-frigate-wreck-v3.glb', local: [-2200, 1300, -850], rotation: [0.16, -1.91, 0.12], scale: 113, clearanceRadius: 230 }),
    Object.freeze({ id: 'concord-frigate-beta-wreck', variant: 1, class: 'frigate', modelKey: 'frigate-drive-loss', file: 'assets/models/wrecks/concord-frigate-drive-loss.glb', local: [1900, -1400, 100], rotation: [-0.2, -1.11, -0.14], scale: 113, clearanceRadius: 230 }),
    Object.freeze({ id: 'concord-frigate-gamma-wreck', variant: 2, class: 'frigate', modelKey: 'frigate-broadside', file: 'assets/models/wrecks/concord-frigate-broadside.glb', local: [-2450, 1100, -3000], rotation: [0.24, -1.05, 0.37], scale: 113, clearanceRadius: 230 }),
    Object.freeze({ id: 'concord-frigate-delta-wreck', variant: 3, class: 'frigate', modelKey: 'frigate-drive-loss', file: 'assets/models/wrecks/concord-frigate-drive-loss.glb', local: [3500, 400, -2450], rotation: [-0.32, -.36, -.48], scale: 113, clearanceRadius: 230 }),
    Object.freeze({ id: 'concord-frigate-epsilon-wreck', variant: 1, class: 'frigate', modelKey: 'frigate-drive-loss', file: 'assets/models/wrecks/concord-frigate-drive-loss.glb', local: [-4350, -700, 800], rotation: [.18, .68, .4], scale: 113, clearanceRadius: 230 }),
    Object.freeze({ id: 'concord-frigate-zeta-wreck', variant: 2, class: 'frigate', modelKey: 'frigate-broadside', file: 'assets/models/wrecks/concord-frigate-broadside.glb', local: [4300, 650, -750], rotation: [-.15, -.55, -.56], scale: 113, clearanceRadius: 230 }),
    Object.freeze({ id: 'concord-frigate-eta-wreck', variant: 3, class: 'frigate', modelKey: 'frigate-drive-loss', file: 'assets/models/wrecks/concord-frigate-drive-loss.glb', local: [-2000, -1250, 2800], rotation: [.21, -.28, .62], scale: 113, clearanceRadius: 230 }),
    Object.freeze({ id: 'concord-frigate-theta-wreck', class: 'frigate', file: 'assets/models/wrecks/concord-frigate-wreck-v3.glb', local: [2250, -800, 3200], rotation: [-.29, .12, -.34], scale: 113, clearanceRadius: 230 }),
    Object.freeze({ id: 'wayfarer-fighter-wreck', class: 'wayfarer', file: 'assets/models/wrecks/wayfarer-wreck.glb', local: [1100, 900, 3200], rotation: [0.34, -0.88, 0.28], scale: 18, clearanceRadius: 62 }),
    Object.freeze({ id: 'talon-fighter-wreck', class: 'talon', file: 'assets/models/wrecks/talon-wreck.glb', local: [-1650, -1050, -3250], rotation: [-0.26, 0.64, -0.31], scale: 18, clearanceRadius: 62 }),
]);


// Convert a source-model landmark to field coordinates. Kept scalar so the
// mission board can share race layouts without loading the rendering engine.
export const graveyardModelPoint = (id, point) => {
    const wreck = GRAVEYARD_MODEL_WRECKS.find((entry) => entry.id === id);
    if (!wreck) throw new Error(`Unknown graveyard wreck: ${id}`);
    const [x, y, z] = wreck.rotation;
    const c1=Math.cos(x/2), c2=Math.cos(y/2), c3=Math.cos(z/2);
    const s1=Math.sin(x/2), s2=Math.sin(y/2), s3=Math.sin(z/2);
    const qx=s1*c2*c3+c1*s2*s3, qy=c1*s2*c3-s1*c2*s3;
    const qz=c1*c2*s3+s1*s2*c3, qw=c1*c2*c3-s1*s2*s3;
    const [px,py,pz] = point.map((v) => v * wreck.scale);
    const tx=2*(qy*pz-qz*py), ty=2*(qz*px-qx*pz), tz=2*(qx*py-qy*px);
    return [px+qw*tx+qy*tz-qz*ty, py+qw*ty+qz*tx-qx*tz, pz+qw*tz+qx*ty-qy*tx]
        .map((v,i) => v + wreck.local[i]);
};
