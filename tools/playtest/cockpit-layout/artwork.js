import {consoleSurfaces,consoleMarkup} from './consoleGeometry.js';
// Code-only structure. Art generation still waits for layout approval.
const points=line=>line.map(p=>p.map(v=>Number(v.toFixed(2))).join(',')).join(' ');
// Cardinal spline through the surveyed pane ring: one continuous bow, with
// matching tangents at every former facet, rather than eight straight pieces.
function curvedBow(bow){
    let path=`M ${points([bow[0]])}`;
    for(let i=0;i<bow.length-1;i++){
        const a=bow[Math.max(0,i-1)],b=bow[i],c=bow[i+1],d=bow[Math.min(bow.length-1,i+2)];
        path+=` C ${points([b.map((v,k)=>v+(c[k]-a[k])/6),c.map((v,k)=>v-(d[k]-b[k])/6),c])}`;
    }
    return path;
}
export function cockpitStructure(definition,canopy){
    const {width:W,height:H,monitors}=definition;
    const beams=canopy.beams.map(line=>line.map(([x,y])=>[x/1600*W,y/900*H]));
    const own=monitors.own,target=monitors.target;
    const ends=[beams[0]?.[0],beams.at(-1)?.[1]];
    const anchors=[[own.x-18,definition.housingTop],[target.x+target.width+18,definition.housingTop]];
    const rails=ends.flatMap((point,i)=>point?[[point,anchors[i]]]:[]);
    rails.push(anchors);
    const bow=[beams[0][0],...beams.map(line=>line[1])];
    const surfaces=consoleSurfaces(definition);
    const panels=surfaces.filter(s=>s.kind==='deck-top').map(s=>s.points);
    const continuous=definition.id==='talon';
    return {width:W,height:H,beams:[...beams,...rails],bowPath:continuous?curvedBow(bow):null,rails:continuous?rails:[...beams,...rails],panels,surfaces,monitors};
}
// Raised radar cowl blends into the neighboring console with swept shoulders,
// rather than standing up as a square box. Live button/glass geometry is fixed.
export function monitorHousings(definition){
    const {monitors,housingTop}=definition;
    return Object.entries(monitors).map(([id,r])=>{
        const roof=definition.housingTops?.[id]??housingTop,bottom=r.y+r.height+18;
        const swept=id==='radar'&&roof<housingTop;
        const outline=swept?[
            [monitors.own.x+monitors.own.width+18,housingTop],
            [r.x,roof],[r.x+r.width,roof],
            [monitors.target.x-18,housingTop],
            [r.x+r.width+18,housingTop+20],[r.x+r.width+18,bottom],
            [r.x-18,bottom],[r.x-18,housingTop+20],
        ]:[[r.x-18,roof],[r.x+r.width+18,roof],[r.x+r.width+18,bottom],[r.x-18,bottom]];
        const roofFace=swept?[[r.x,roof],[r.x+r.width,roof],[r.x+r.width+8,roof+10],[r.x-8,roof+10]]:null;
        return {id,glass:r,outline,roofFace};
    });
}
export function greyboxFrame(definition,canopy){
    const {width:W,height:H,bowPath,rails,panels,surfaces,monitors}=cockpitStructure(definition,canopy);
    const lines=(bowPath?`<path class="canopy-bow" d="${bowPath}"/>`:'')+rails.map(line=>`<polyline points="${points(line)}"/>`).join('');
    const sides=consoleMarkup(surfaces);
    const surrounds=monitorHousings(definition).map(({glass:r,outline,roofFace})=>{
        const outer=`M ${points(outline)} Z`,inner=`M ${r.x} ${r.y} v ${r.height} h ${r.width} v ${-r.height} Z`;
        return `<path fill-rule="evenodd" d="${outer} ${inner}"/>`+(roofFace?`<polygon points="${points(roofFace)}" fill="#b0bec1"/>`:'');
    }).join('');
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${sides}<g fill="none" stroke="#263f4d" stroke-width="13" stroke-linejoin="round">${lines}</g><g fill="none" stroke="#82979f" stroke-width="2" stroke-linejoin="round">${lines}</g><g fill="#263f4d" stroke="#82979f" stroke-width="2">${surrounds}</g></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
