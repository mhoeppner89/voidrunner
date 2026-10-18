// Shardbelt-local kilometres. Natural bores and racing routes share these
// landmarks, so checkpoints follow the rock rather than carving racing tubes.
export function sampleAsteroidRoute(points,steps=12){
    const result=[];
    for(let i=0;i<points.length-1;i++)for(let j=0;j<steps;j++){
        const t=j/steps,p0=points[Math.max(0,i-1)],p1=points[i],p2=points[i+1],p3=points[Math.min(points.length-1,i+2)];
        result.push(p1.map((v,k)=>.5*(2*v+(-p0[k]+p2[k])*t+(2*p0[k]-5*v+4*p2[k]-p3[k])*t*t+(-p0[k]+3*v-3*p2[k]+p3[k])*t*t*t)));
    }
    result.push([...points.at(-1)]);return result;
}
const heart=[[-50,-100,-1850],[50,-90,-1200],[190,20,-600],[90,80,0],[-90,-40,650],[60,-90,1200],[100,-60,1850]];
const crosscut=[[-1550,100,-180],[-1000,90,-260],[-500,20,-130],[90,80,0],[650,130,210],[1100,40,340],[1550,-60,390]];
const chimney=[[-460,-1100,650],[-430,-650,650],[-340,-290,590],[-90,-40,650],[190,400,700],[250,780,850],[300,1250,1000]];
export const SHARDBELT_PASSAGES=Object.freeze([
    {id:'heart',name:'Heart of the asteroid',radius:118,points:sampleAsteroidRoute(heart,6)},
    {id:'crosscut',name:'Mineral gallery',radius:112,points:sampleAsteroidRoute(crosscut,6)},
    {id:'chimney',name:'Broken chimney',radius:106,points:sampleAsteroidRoute(chimney,6)},
]);
// Keep tunnel samples exact. Exterior connectors leave and approach each
// mouth along its tangent before rounding a crater or fracture outside.
const tunnel=id=>SHARDBELT_PASSAGES.find(p=>p.id===id).points;
const main=tunnel('heart'),gallery=tunnel('crosscut'),shaft=tunnel('chimney').toReversed().slice(6,-2);
const tangent=(a,b)=>{const d=b.map((v,i)=>v-a[i]),l=Math.hypot(...d);return d.map(v=>v/l);};
function connect(from,to,middle){
    const anchors=[from.at(-1),...middle,to[0]],points=[];
    const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
    const directions=anchors.map((p,i)=>i===0?tangent(from.at(-2),p):i===anchors.length-1?tangent(p,to[1]):tangent(anchors[i-1],anchors[i+1]));
    const strength=anchors.map((p,i)=>1.25*Math.min(i?distance(anchors[i-1],p):Infinity,i<anchors.length-1?distance(p,anchors[i+1]):Infinity));
    for(let i=0;i<anchors.length-1;i++)for(let j=0;j<18;j++){
        const t=j/18,t2=t*t,t3=t2*t;
        points.push(anchors[i].map((v,k)=>(2*t3-3*t2+1)*v+(t3-2*t2+t)*directions[i][k]*strength[i]+(-2*t3+3*t2)*anchors[i+1][k]+(t3-t2)*directions[i+1][k]*strength[i+1]));
    }
    points.push([...anchors.at(-1)]);return points;
}
const stitch=(...parts)=>parts.flatMap((p,i)=>i?p.slice(1):p);
const eastRim=[[1000,20,2070],[1740,180,1150],[1800,130,-200],[1400,0,-1450],[530,-90,-2150]];
const highRim=[[1700,350,700],[1250,950,1060],[650,1320,1120],[285,1100,950]];
const lowRim=[[-1040,-1100,80],[-1700,-500,-200]];
export const SHARD_RACE_LAYOUTS=Object.freeze({
    'shard-gauntlet':{
        points:stitch(main,connect(main,main,eastRim)),
        description:'Through the long central bore, then a sweeping return around the eastern crater rim.',
    },
    'shard-switchback':{
        points:stitch(gallery,connect(gallery,shaft,highRim),shaft,connect(shaft,gallery,lowRim)),
        description:'Cross the mineral gallery, climb over the broken crown and dive through the chimney. Return beneath the western fragments.',
    },
    'shard-miners-knife':{
        points:stitch(main,connect(main,gallery,[[-900,30,2070],[-1800,180,1000]]),gallery,connect(gallery,shaft,highRim),shaft,connect(shaft,main,[[-690,-1120,260],[-650,-900,-950],[-390,-420,-1950]])),
        description:'The full circuit: central bore, western fracture, mineral gallery, crown and chimney, then the deep southern rim.',
    },
});
