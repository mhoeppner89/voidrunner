// Perspective blockout for the SIDE CONSOLES, rather than a flat triangular
// outline. The monitor fascia sits at z=1; the support decks extend toward
// the pilot on one level plane. Their inner cabinet returns close the space below the decks.
export function consoleSurfaces(definition){
    const {width:W,height:H,monitors,housingTop}=definition;
    const focal=H/(2*Math.tan(32*Math.PI/180)),cx=W/2,cy=H/2;
    const project=([x,y,z])=>[cx+x*focal/z,cy-y*focal/z];
    const profile=definition.structure??{};
    const deckY=(cy-housingTop)/focal,near=profile.near??.35,depth=profile.depth??.085;
    const result=[];
    for(const [side,rearPixel]of [[-1,monitors.own.x-18],[1,monitors.target.x+monitors.target.width+18]]){
        const rearX=(rearPixel-cx)/focal;
        const edgeDepth=Math.abs(rearX*focal/cx);
        const nearX=((side<0?(profile.front??240):W-(profile.front??240))-cx)*near/focal;
        const rear=[rearX,deckY,1],outer=[rearX,deckY,edgeDepth];
        const front=[nearX,deckY,near],frontOuter=[rearX+side*.32,deckY,near];
        const lower=(p,d=depth)=>[p[0],p[1]-d,p[2]];
        const face=(kind,vertices,fill)=>result.push({side,kind,points:vertices.map(project),fill});
        face('inner-return',[rear,front,lower(front,.42),lower(rear,.42)],'#152a38');
        face('outer-return',[outer,frontOuter,lower(frontOuter),lower(outer)],'#10212e');
        const top=[outer,rear,front,frontOuter];
        face('deck-top',top,'#526d7a');
        // A narrow coplanar chamfer, not a front-facing decorative stripe.
        const inset=p=>[p[0]+side*(profile.bevel??.018),p[1],p[2]];
        face('inner-bevel',[rear,front,inset(front),inset(rear)],'#9aaeb3');
        // Two depth lines and one longitudinal seam expose foreshortening in
        // the guide. They are clipped to the actual top face by the SVG/canvas.
        const grid=[];
        for(const z of [.48,.68])grid.push([[rearX+side*.5,deckY,z],[nearX-side*.2,deckY,z]].map(project));
        grid.push([[rearX+side*.08,deckY,.3],[rearX+side*.08,deckY,1.2]].map(project));
        result.push({side,kind:'deck-seams',clip:top.map(project),lines:grid,fill:'#8099a4'});
    }
    return result;
}
export function drawConsoleSurfaces(ctx,surfaces){
    for(const s of surfaces){
        const polygon=p=>{ctx.beginPath();p.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](x,y));ctx.closePath();};
        if(s.lines){ctx.save();polygon(s.clip);ctx.clip();ctx.strokeStyle=s.fill;ctx.lineWidth=1.5;
            for(const line of s.lines){ctx.beginPath();line.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](x,y));ctx.stroke();}ctx.restore();
        }else{polygon(s.points);ctx.fillStyle=s.fill;ctx.fill();ctx.strokeStyle='#718b98';ctx.lineWidth=1;ctx.stroke();}
    }
}
export function consoleMarkup(surfaces,definition){
    const points=p=>p.map(v=>v.map(n=>Number(n.toFixed(2))).join(',')).join(' ');
    const markup=surfaces.map(s=>s.lines
        ? `<svg overflow="hidden"><defs><clipPath id="deck-${s.side}"><polygon points="${points(s.clip)}"/></clipPath></defs><g clip-path="url(#deck-${s.side})" fill="none" stroke="${s.fill}" stroke-width="1.5">${s.lines.map(line=>`<polyline points="${points(line)}"/>`).join('')}</g></svg>`
        : `<polygon data-face="${s.kind}" points="${points(s.points)}" fill="${s.fill}" stroke="#718b98" stroke-width="1"/>`).join('');
    const style=definition?.structure?.style,W=definition?.width,H=definition?.height;
    if(!['skeletal','faceted','pressure'].includes(style))return markup;
    const left=style==='skeletal'
        ?`M0 ${H} V805 Q0 775 55 775 H210 L235 800 L285 ${H} Z M178 795 L205 807 L410 617 L396 594 Z`
        :style==='pressure'
        ?`M0 ${H} V810 Q0 760 80 755 Q152 752 205 784 Q275 765 322 700 L398 590 L420 620 L295 ${H} Z`
        :`M0 ${H} V785 L70 761 L220 787 L398 584 L420 614 L292 ${H} Z`;
    const right=`<path d="${left}" transform="translate(${W} 0) scale(-1 1)"/>`;
    return `<defs><clipPath id="console-cutouts"><path d="${left}"/>${right}</clipPath></defs><g data-console-form="${style}" clip-path="url(#console-cutouts)">${markup}</g>`;
}
