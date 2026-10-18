// Lightweight authoring source shared by mining contracts and flight terrain.
// Distances are kilometres in Shardbelt-local coordinates. The old 2340 km
// field boundary stays intact; only the distribution of rock changes.
import { LOCATIONS } from './data.js';
import {SHARDBELT_PASSAGES,SHARD_RACE_LAYOUTS} from './asteroidRoutes.js';
export {SHARDBELT_PASSAGES} from './asteroidRoutes.js';
import { seededRandom, randomBetween, randomInt } from './random.js';

export const SHARDBELT_PARENT_RADII = Object.freeze([1340, 910, 1570]);
export const SHARDBELT_LAYOUT_VERSION = 3;
const seeds = [
    [-660, 310, -920], [560, 340, -1010], [-130, -470, -1000],
    [-850, -120, -100], [-80, 530, -110], [750, -240, -160],
    [-590, 280, 850], [550, 320, 830], [10, -450, 770],
    [-120, -70, 100],
];
const stoneHash=(x,y,z)=>{
    let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,1274126177);
    h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/2147483647.5-1;
};
const fade=t=>t*t*t*(t*(t*6-15)+10);
const mix=(a,b,t)=>a+(b-a)*t;
// Aperiodic lattice values with a rotated domain. No summed sine waves or
// short repeating phase: each feature comes from a different hashed cell.
export function stoneNoise(x,y,z){
    const rx=x*.8+y*.36-z*.48,ry=-x*.48+y*.8+z*.36,rz=x*.36-y*.48+z*.8;
    const ix=Math.floor(rx),iy=Math.floor(ry),iz=Math.floor(rz),u=fade(rx-ix),v=fade(ry-iy),w=fade(rz-iz);
    return mix(mix(mix(stoneHash(ix,iy,iz),stoneHash(ix+1,iy,iz),u),mix(stoneHash(ix,iy+1,iz),stoneHash(ix+1,iy+1,iz),u),v),
        mix(mix(stoneHash(ix,iy,iz+1),stoneHash(ix+1,iy,iz+1),u),mix(stoneHash(ix,iy+1,iz+1),stoneHash(ix+1,iy+1,iz+1),u),v),w);
}
export const rockNoise=(x,y,z)=>stoneNoise(x*.0038,y*.0038,z*.0038)*40
    +stoneNoise(x*.0085+83,y*.0085-37,z*.0085+19)*10;
// Craters are authored on the original ellipsoid, so matching pieces retain
// a shared impact history. Large old bowls, small fresh pits and oblique
// impacts appear on every side, rather than repeating one circular stamp.
export const SHARDBELT_CRATERS = Object.freeze([
    [ .55, .65, .45, 310, .34, 1.08], [-.65, .60,-.50, 270, .40, .88],
    [ .15,-.80, .50, 240, .36, 1.16], [-.30, .90, .05, 235, .42, 1.04],
    [ .10, .70,-.70, 190, .34, .91], [ .80, .25,-.45, 225, .38, 1.18],
    [-.80, .15, .55, 205, .40, .84], [ .55,-.55,-.55, 220, .35, 1.07],
    [-.45,-.70,-.40, 195, .40, .93], [ .25, .40, .90, 175, .32, 1.12],
    [-.10,-.25,-.95, 205, .38, 1.05], [-.85,-.25,-.10, 165, .34, .88],
    [ .90, .10, .15, 145, .28, 1.14], [-.55, .50, .65, 145, .32, .92],
    [ .45, .85,-.20, 125, .30, 1.10], [-.25,-.90, .15, 150, .36, 1.04],
    [ .55,-.15, .85, 135, .30, .86], [-.55,-.30, .80, 165, .36, 1.12],
].map(([x,y,z,radius,lift,stretch],index)=>{
    const length=Math.hypot(x,y,z),p=[x/length*1340,y/length*910,z/length*1570];
    const nx=p[0]/(1340*1340),ny=p[1]/(910*910),nz=p[2]/(1570*1570),nl=Math.hypot(nx,ny,nz);
    return Object.freeze({center:Object.freeze([p[0]+nx/nl*radius*lift,p[1]+ny/nl*radius*lift,p[2]+nz/nl*radius*lift]),
        radius,stretch,roughness:4+index%4*2});
}));
export function parentSkinDistance(x, y, z) {
    const r = SHARDBELT_PARENT_RADII;
    return (Math.hypot(x / r[0], y / r[1], z / r[2]) - 1) * 950
        + 42 * stoneNoise(x*.0017+29,y*.0017-12,z*.0017+71)
        + rockNoise(x, y, z);
}
export function parentRockDistance(x, y, z) {
    let skin=parentSkinDistance(x,y,z),bowls=-Infinity;
    for(const crater of SHARDBELT_CRATERS){
        const dx=(x-crater.center[0])*crater.stretch,dy=y-crater.center[1],dz=(z-crater.center[2])/crater.stretch;
        const reach=crater.radius+100;
        if(Math.abs(dx)>reach||Math.abs(dy)>reach||Math.abs(dz)>reach)continue;
        const distance=Math.hypot(dx,dy,dz),edge=(distance-crater.radius)/32;
        // A low broken rim and uneven bowl avoid perfect hemispherical holes.
        skin-=Math.exp(-edge*edge)*12;
        bowls=Math.max(bowls,crater.radius-distance+stoneNoise(dx*.016+13,dy*.016-41,dz*.016+7)*crater.roughness);
    }
    return Math.max(skin,bowls);
}
export const SHARDBELT_FRAGMENTS = Object.freeze(seeds.map((seed, index) => {
    const angle = (index % 3 - 1) * .035, c = Math.cos(angle), s = Math.sin(angle);
    // Modest, different tilts separate broken faces without losing the parent
    // outline. Source-to-world is a Y rotation followed by radial separation.
    const offset = seed.map((v, axis) => v * (axis === 1 ? .19 : .16));
    return { id: `parent-${index}`, seed, c, s, offset,
        planes: seeds.filter(other => other !== seed).map(other => {
            const d = other.map((v, i) => v - seed[i]), len = Math.hypot(...d);
            const normal = d.map(v => v / len);
            return [...normal, normal.reduce((sum, v, i) => sum + v * (other[i] + seed[i]) * .5, 0)];
        }) };
}));
export function fragmentToWorld(f, x, y, z) {
    const dx = x - f.seed[0], dz = z - f.seed[2];
    return [f.seed[0] + dx * f.c + dz * f.s + f.offset[0], y + f.offset[1],
        f.seed[2] - dx * f.s + dz * f.c + f.offset[2]];
}
export function worldToFragment(f, x, y, z) {
    const dx = x - f.seed[0] - f.offset[0], dz = z - f.seed[2] - f.offset[2];
    return [f.seed[0] + dx * f.c - dz * f.s, y - f.offset[1], f.seed[2] + dx * f.s + dz * f.c];
}

const segment = (a, b, radius, natural) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    return { a, dx, dy, dz, inv: 1 / (dx * dx + dy * dy + dz * dz), radius, natural };
};
const bores=SHARDBELT_PASSAGES.flatMap(route=>{
    const p=route.points,extend=(a,b)=>{const d=a.map((v,i)=>v-b[i]),l=Math.hypot(...d);return a.map((v,i)=>v+d[i]/l*220);};
    const points=[extend(p[0],p[1]),...p,extend(p.at(-1),p.at(-2))];
    return points.slice(1).map((v,i)=>segment(points[i],v,route.radius,true));
});
const raceCorridors=Object.values(SHARD_RACE_LAYOUTS).flatMap(route=>route.points.slice(1).map((v,i)=>segment(route.points[i],v,110,false)));
function distanceToSegment(x, y, z, b) {
    const ox = x - b.a[0], oy = y - b.a[1], oz = z - b.a[2];
    const t = Math.max(0, Math.min(1, (ox * b.dx + oy * b.dy + oz * b.dz) * b.inv));
    return Math.hypot(ox - t * b.dx, oy - t * b.dy, oz - t * b.dz);
}
export function passageDistance(x, y, z) {
    let distance = Infinity;
    for (const bore of bores) distance = Math.min(distance, distanceToSegment(x, y, z, bore) - bore.radius);
    // Wavy erosion changes the aperture, with a guaranteed ~200 km core.
    distance += rockNoise(x * 1.4, y * 1.4, z * 1.4) * .28;
    return distance;
}
const wornIntersection=(a,b,width)=>{
    const blend=Math.max(0,width-Math.abs(a-b));
    return Math.max(a,b)+blend*blend/(4*width);
};
export function fragmentDistance(f, x, y, z) {
    let distance = parentRockDistance(x, y, z);
    const rough = rockNoise(x, y, z) * .52;
    // A narrow worn edge suppresses regular sawtooth tessellation where
    // fracture planes meet the crust, without sanding away the large breaks.
    for (const p of f.planes) distance = wornIntersection(distance, x * p[0] + y * p[1] + z * p[2] - p[3] + 34 + rough, 44);
    if (distance > 90) return distance;
    const w = fragmentToWorld(f, x, y, z);
    return wornIntersection(distance, -passageDistance(...w), 24);
}
export function shardbeltSolidDistance(x, y, z) {
    let distance = Infinity;
    for (const f of SHARDBELT_FRAGMENTS) {
        const p = worldToFragment(f, x, y, z);
        distance = Math.min(distance, fragmentDistance(f, ...p));
    }
    return distance;
}
export function shardbeltRaceClear(local, reach) {
    return raceCorridors.every(b => distanceToSegment(...local, b) > reach + b.radius + 8);
}

// A single generator also supplies mining-claim candidates. Re-rolling after
// depletion must not move deposits or consume a different random sequence.
const depositLayouts = new Map();
function buildShardbeltDeposits(seed) {
    const rng = seededRandom(`${seed}:shattered-shardbelt`), nodes = [], center = LOCATIONS.shardbelt.position;
    for (let index = 0; index < 560; index++) {
        const large = index < 24, moving = index >= 430;
        const id = large ? `asteroid-monolith-${index}` : moving ? `asteroid-drift-${index - 430}` : `asteroid-static-${index - 24}`;
        let local, radius, scale, reach, accepted = false;
        for (let attempt = 0; attempt < 70; attempt++) {
            const angle = rng() * Math.PI * 2, vertical = randomBetween(rng, -.78, .78);
            const inFracture = index >= 150 && index < 390 && index % 2 === 0;
            const radial = randomBetween(rng, large ? 1470 : inFracture ? 350 : 850, large ? 2040 : inFracture ? 1700 : 2250);
            local = [Math.cos(angle) * radial * Math.sqrt(1 - vertical * vertical), vertical * radial * .64, Math.sin(angle) * radial * Math.sqrt(1 - vertical * vertical)];
            radius = randomBetween(rng, large ? 65 : moving ? 2.5 : 5, large ? 140 : moving ? 12 : index < 150 ? 70 : 35);
            scale = [randomBetween(rng, .75, 1.45), randomBetween(rng, .55, 1.1), randomBetween(rng, .75, 1.55)];
            reach = radius * Math.max(...scale, .9 * Math.hypot(...scale));
            // Loose pieces collect near the fracture mouths rather than
            // obscuring the navigable bores or being buried in solid terrain.
            if (Math.hypot(...local) + reach > 2330 || !shardbeltRaceClear(local, reach + (moving ? 35 : 0))) continue;
            if (passageDistance(...local) < reach + 22 || shardbeltSolidDistance(...local) < reach + 20) continue;
            accepted = true; break;
        }
        const stock = randomInt(rng, large ? 9 : moving ? 1 : 3, large ? 22 : moving ? 3 : 8);
        const rotation = [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI];
        const spin = [randomBetween(rng, -.12, .12), randomBetween(rng, -.12, .12), randomBetween(rng, -.12, .12)];
        const shape = randomInt(rng, 4, 7), speed = randomBetween(rng, .15, .65);
        if (!accepted) continue;
        nodes.push({ id, position: local.map((v, i) => v + center[i]), radius, scale, rotation,
            velocity: moving ? local.map(v => v / Math.hypot(...local) * speed) : [0, 0, 0],
            rotationSpeed: moving ? spin : [0, 0, 0], moving, shape, resource: 'ore',
            remaining: stock, scanned: false, tunnelPart: false,
            finish: large ? 'dark' : index % 11 === 0 ? 'ice' : 'iron' });
    }
    return nodes;
}
export function generateShardbeltDeposits(seed, depleted = {}, scanned = []) {
    let layout = depositLayouts.get(seed);
    if (!layout) {
        layout = buildShardbeltDeposits(seed);
        if (depositLayouts.size >= 4) depositLayouts.delete(depositLayouts.keys().next().value);
        depositLayouts.set(seed, layout);
    }
    return layout.map(node => ({ ...node, position: [...node.position], velocity: [...node.velocity],
        scale: [...node.scale], rotation: [...node.rotation], rotationSpeed: [...node.rotationSpeed],
        remaining: Math.ceil(Math.max(0, depleted[node.id] ?? node.remaining)), scanned: scanned.includes(node.id) }));
}
