import {COCKPITS} from '/src/game/cockpitDefinitions.js';
// Manual, unpainted Morrigan study. The sections below are measured from
// "Port forward armored prong" in the existing demon.blend, not generic wings.
// Mercury and Tyr retain their original approved cockpit frames.
const W=1851,H=850,focal=H/(2*Math.tan(32*Math.PI/180));
const scale=2/(8.622337341308594+7.059999942779541);
const center=[0,.9549999833106995,.7811686992645264];
const originalEye=[0,-.015,.18],stretch=[.9,.65];
export const MORRIGAN_FORWARD_PLACEMENT=COCKPITS.demon.forwardHullPlacement;
export const forwardHullPercent=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(30,Number(value))):13;
export const outwardHullPercent=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(35,Number(value))):0;
// Source +Z forward, +Y up after Blender -> glTF axis conversion. The packed
// runtime normalizes these original source positions uniformly, without
// changing the proportions. Each row is [z, half-width, roof, belly].
const sections=[
    [8.55,.62,0,-.82],
    [7.0453706,.72,.37,-.84],
    [4.7305555,.84,.95,-.86],
    [2.3,1.05,1.52,-.83],
    [.4,1.12,1.78,-.75],
    [-1.05,.93,1.05,-.58],
    [-2.2,.69,.62,-.45],
];
const native=p=>p.map((v,k)=>(v-center[k])*scale);
function ring([z,w,roof,belly]){
    const x=-3.05,h=roof-belly;
    return [[x-.7*w,roof,z],[x+.7*w,roof,z],[x+w,roof-.24*h,z],
        [x+w,belly+.25*h,z],[x+.7*w,belly,z],[x-.7*w,belly,z],
        [x-w,belly+.25*h,z],[x-w,roof-.24*h,z]].map(native);
}
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((v,x,k)=>v+x*b[k],0);
function forwardClip(face,eye){
    const out=[],near=eye[2]+.02;
    for(let i=0;i<face.length;i++){
        const a=face[i],b=face[(i+1)%face.length],insideA=a[2]>=near,insideB=b[2]>=near;
        if(insideA)out.push(a);
        if(insideA!==insideB){const t=(near-a[2])/(b[2]-a[2]);out.push(a.map((v,k)=>v+(b[k]-v)*t));}
    }
    return out;
}
function project(p,eye){
    const depth=p[2]-eye[2];
    return [W/2+(p[0]-eye[0])/depth*focal*stretch[0],H/2-(p[1]-eye[1])/depth*focal*stretch[1]];
}
const points=(face,eye)=>face.map(p=>project(p,eye).map(n=>n.toFixed(2)).join(',')).join(' ');
function leftProng(eye){
    const rings=sections.map(ring),faces=[];
    const fills=['#697986','#85929a','#4e5d6a','#354651','#263743','#354651','#4e5d6a','#85929a'];
    for(let i=0;i<rings.length-1;i++)for(let j=0;j<8;j++){
        const face=[rings[i][j],rings[i][(j+1)%8],rings[i+1][(j+1)%8],rings[i+1][j]];
        const normal=cross(sub(face[1],face[0]),sub(face[2],face[0]));
        if(dot(normal,sub(eye,face[0]))<=1e-10)continue;
        const clipped=forwardClip(face,eye);if(clipped.length<3)continue;
        faces.push({i,j,face:clipped,depth:clipped.reduce((n,p)=>n+p[2],0)/clipped.length,fill:fills[j]});
    }
    faces.sort((a,b)=>b.depth-a.depth);
    return faces.map(({face,fill,i,j})=>`<polygon data-section="${i}" data-facet="${j}" points="${points(face,eye)}" fill="${fill}" stroke="#60717e" stroke-width="1.1" stroke-linejoin="round"/>`).join('');
}
export const hasForwardHullBlockout=id=>id==='demon';
export function drawForwardHull(id,forwardPercent=13,outwardPercent=18){
    if(!hasForwardHullBlockout(id))return;
    const viewpointForward=forwardHullPercent(forwardPercent);
    const eye=[...originalEye];eye[2]+=viewpointForward*.02;
    const left=leftProng(eye),structuresOutward=outwardHullPercent(outwardPercent),offset=W*structuresOutward/100;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><g data-side="left" transform="translate(${-offset} 0)">${left}</g><g data-side="right" transform="translate(${W+offset} 0) scale(-1 1)">${left}</g></svg>`;
    const image=document.createElement('img');image.src=`data:image/svg+xml;base64,${btoa(svg)}`;image.className='pilot-forward-hull';image.alt='Morrigan manual prong study matched to its source model';
    Object.assign(image.style,{position:'absolute',inset:'0',width:'100%',height:'100%',objectFit:'fill',zIndex:'3',pointerEvents:'none'});
    return {image,source:id,kind:'manual-blockout',authoredSize:[W,H],revision:5,viewpointForward,structuresOutward,originalEye,
        sourcePart:'Port / Starboard forward armored prong',eye,stretch,sections,
        sourceTransform:{scale,center}};
}

// Fixed placement approved by the user; the review uses the same approved sprite as flight.
export function drawPaintedForwardHull(id){
    const hull=drawForwardHull(id,MORRIGAN_FORWARD_PLACEMENT.forward,MORRIGAN_FORWARD_PLACEMENT.outward);
    if(!hull)return;
    hull.image.src=COCKPITS[id].forwardHull;
    hull.image.alt='Morrigan painted exterior prongs at the approved position';
    hull.kind='painted-hull-review';return hull;
}
