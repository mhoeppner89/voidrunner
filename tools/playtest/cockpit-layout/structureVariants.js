// Unpainted structural proposals only. Real displays/controls are never drawn here.
// All cabinetry stays below the coaming; the model-derived glazing stays open.
const pts=p=>p.map(a=>a.map(v=>+v.toFixed(2)).join(',')).join(' ');
const poly=(points,fill='#344c58',extra='')=>`<polygon points="${pts(points)}" fill="${fill}" stroke="#81969e" stroke-width="2" ${extra}/>`;
const line=(points,width=3,color='#81969e')=>`<polyline points="${pts(points)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"/>`;
function deckHardware(d){
 const s=d.structure,{width:W,height:H,housingTop}=d;
 const f=H/(2*Math.tan(32*Math.PI/180)),cy=H/2,cx=W/2,deckY=(cy-housingTop)/f;
 const project=([x,y,z])=>[cx+x*f/z,cy-y*f/z];
 let out='';
 for(const side of [-1,1]){
  // Fixtures share the console's 3D top plane and converge toward its horizon.
  // Their rear faces sit next to the outer instrument pods, never on the grip.
  const inner=(side<0?d.monitors.own.x-18:d.monitors.target.x+d.monitors.target.width+18)-cx;
  const x=inner/f-side*.025,z0=.64,z1=.77,w=-side*.10;
  const height={armored:.045,skeletal:.015,industrial:.065,faceted:.035,pressure:.025}[s.style];
  const a=[x,deckY,z0],b=[x+w,deckY,z0],c=[x+w,deckY,z1],e=[x,deckY,z1];
  const up=p=>[p[0],p[1]+height,p[2]];
  out+=`<g data-console-fixture="${side}" data-rootpoints="${pts([a,b,c,e].map(project))}">`;
  out+=poly([a,b,up(b),up(a)].map(project),'#223945');
  out+=poly([a,e,up(e),up(a)].map(project),'#2c4451');
  out+=poly([up(a),up(b),up(c),up(e)].map(project),s.style==='skeletal'?'#81949c':'#607780');
  if(s.style==='industrial'||s.style==='armored'){
   for(const t of [.28,.55,.78])out+=line([[x,deckY+height,z0+(z1-z0)*t],[x+w,deckY+height,z0+(z1-z0)*t]].map(project),2);
  }
  if(s.style==='skeletal')out+=line([a,c].map(project),3,'#a2b1b7');
  if(s.style==='faceted')out+=line([up(a),up(c)].map(project),3,'#c0cbd0');
  if(s.style==='pressure'){
   const p=project(up(a));out+=`<ellipse cx="${p[0]}" cy="${p[1]}" rx="12" ry="5" fill="#263f4d" stroke="#a1b2b8" stroke-width="3"/>`;
  }
  out+='</g>';
 }
 return out;
}
// Victoria: one supported, symmetric fighter console. Rear coaming and front
// fascia form a shallow folded deck; glass stays on the approved common plane.
function fighterConsole(d){
 const {own,radar,target}=d.monitors,left=own.x-18,right=target.x+target.width+18;
 const rear=[[left,584],[own.x+own.width+14,584],[radar.x-8,560],[radar.x+radar.width+8,560],[target.x-14,584],[right,584]];
 const front=[[left+8,604],[own.x+own.width+18,604],[radar.x-2,580],[radar.x+radar.width+2,580],[target.x-18,604],[right-8,604]];
 return {rear,front,body:[...front,[right-8,d.height],[left+8,d.height]],top:[...rear,...front.slice().reverse()]};
}
export function structureMarkup(d,canopy,bowPath){
 if(!d.structure)return {underlay:'',overlay:''};
 const {style}=d.structure,W=d.width,H=d.height,left=d.monitors.own.x-18,right=d.monitors.target.x+d.monitors.target.width+18;
 const center=W/2,top=d.housingTop;let underlay=['skeletal','pressure','faceted'].includes(style)?`<rect x="0" y="790" width="${W}" height="${H-790}" fill="#0b1923"/>`:'',overlay='';
 if(style==='armored'){
  // A full armored tub with a shallow overhead roof rib, matching the swept
  // bomber glazing stations. The center firing/aim area remains clear.
  underlay+=poly([[0,H],[0,663],[left-55,555],[left-5,529],[right+5,529],[right+55,555],[W,663],[W,H]],'#304752');
  underlay+=poly([[0,663],[left-55,555],[left-5,529],[left-5,563],[0,694]],'#7b8e97');
  underlay+=poly([[W,663],[right+55,555],[right+5,529],[right+5,563],[W,694]],'#7b8e97');
  const edges=canopy.beams.map(seg=>seg.map(([x,y])=>[x/1600*W,y/900*H]));
  const atY=(a,b,y)=>[a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]),y];
  underlay+=line([atY(...edges[0],295),atY(...edges.at(-1),295)],11,'#425a66');
  overlay+=line([[left+8,552],[right-8,552]],8,'#9bacb4');
 }else if(style==='skeletal'){
  // Open cockpit: small pods on feet, no solid connecting dashboard wall.
  for(const r of Object.values(d.monitors)){
   const y=r.y+r.height+14;
   underlay+=line([[r.x+18,y],[r.x+58,H],[r.x+r.width-58,H],[r.x+r.width-18,y]],8,'#9caeb7');
  }
 }else if(style==='industrial'){
  // Full-width workbench with a level brow and separate side service towers.
  underlay+=poly([[0,H],[0,620],[left-42,562],[right+42,562],[W,620],[W,H]],'#536974');
  underlay+=poly([[0,620],[left-42,562],[right+42,562],[W,620],[W,645],[right+26,590],[left-26,590],[0,645]],'#99a9b0');
  for(const x of [left-42,right+10]){
   overlay+=`<rect x="${x}" y="610" width="30" height="210" fill="#82959f" stroke="#314955" stroke-width="3"/>`;
   for(let i=0;i<8;i++)overlay+=line([[x+5,626+i*24],[x+25,626+i*24]],3,'#314955');
  }
  const ring=canopy.beams.map(seg=>seg.map(([x,y])=>[x/1600*W,y/900*H]));
  for(const side of [-1,1]){
   const x=center+side*425;
   const segment=ring.find(([a,b])=>Math.min(a[0],b[0])<=x&&Math.max(a[0],b[0])>=x&&Math.max(a[1],b[1])<300);
   const [a,b]=segment;const topPoint=[x,a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])];
   underlay+=line([topPoint,[center+side*500,562]],19,'#415965');
   underlay+=line([topPoint,[center+side*500,562]],2,'#a0b2ba');
  }
 }else if(style==='faceted'){
  const frame=fighterConsole(d);
  underlay+=poly(frame.body,'#334f5f');
  underlay+=poly(frame.top,'#8097a4');
  // Paired lower cheek plates follow the folded coaming into the side ledges.
  underlay+=poly([[left-20,608],[left,584],[left+8,604],[left+8,H],[left-20,H]],'#526d7c');
  underlay+=poly([[right+20,608],[right,584],[right-8,604],[right-8,H],[right+20,H]],'#526d7c');
  overlay+=line(frame.front,3,'#b0bec5');
 }else if(style==='pressure'){
  // Round central binnacle and independent side capsules, joined by pressure
  // arms rather than a slab. The joystick stands on its own curved pedestal.
  underlay+=`<path d="M ${d.monitors.own.x+d.monitors.own.width} 738 Q ${center} 690 ${d.monitors.target.x} 738" fill="none" stroke="#8ca3ae" stroke-width="22"/>`;
  underlay+=`<path d="M ${d.monitors.own.x+d.monitors.own.width} 738 Q ${center} 690 ${d.monitors.target.x} 738" fill="none" stroke="#344f5d" stroke-width="10"/>`;
 }
 // Small load-bearing hinge blocks lie on the actual lower ends of the canopy.
 const beams=canopy.beams.map(seg=>seg.map(([x,y])=>[x/1600*W,y/900*H]));
 for(const p of [beams[0][0],beams.at(-1)[1]]){
  const radius=style==='armored'?14:style==='skeletal'?6:10;
  underlay+=`<circle cx="${p[0]}" cy="${p[1]}" r="${radius}" fill="#203743" stroke="#93a6ae" stroke-width="3"/>`;
 }
 if(style==='pressure'){
  // Parallel inner gasket follows the curved pane ring, confined to the rim.
  const bow=[beams[0][0],...beams.map(seg=>seg[1])];
  const inset=bow.map(([x,y])=>[x+(center-x)*.018,y+9]);
  underlay+=bowPath?`<path d="${bowPath}" transform="translate(${center*.018} 9) scale(.982 1)" fill="none" stroke="#b0c0c5" stroke-width="3"/>`:line(inset,3,'#b0c0c5');
 }
 if(style==='industrial')overlay+=deckHardware(d);
 const mask=`<defs><mask id="structure-openings"><rect width="${W}" height="${H}" fill="white"/>${Object.values(d.monitors).map(r=>`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="black"/>`).join('')}</mask></defs>`;
 return {underlay:`${mask}<g data-structure="${style}" mask="url(#structure-openings)">${underlay}</g>`,overlay:`<g data-hardware="${style}" mask="url(#structure-openings)">${overlay}</g>`};
}

// Primary instrument architecture, not a common three-box fascia with new trim.
// The live rectangular apertures remain invariant inside these different mounts.
export function structureHousingMarkup(d){
 const style=d.structure?.style;if(!style)return;
 const box=(r,p=12,cut=0)=>poly(cut?[
  [r.x-p+cut,r.y-p],[r.x+r.width+p-cut,r.y-p],[r.x+r.width+p,r.y-p+cut],
  [r.x+r.width+p,r.y+r.height+p-cut],[r.x+r.width+p-cut,r.y+r.height+p],
  [r.x-p+cut,r.y+r.height+p],[r.x-p,r.y+r.height+p-cut],[r.x-p,r.y-p+cut]
 ]:[[r.x-p,r.y-p],[r.x+r.width+p,r.y-p],[r.x+r.width+p,r.y+r.height+p],[r.x-p,r.y+r.height+p]],'#263f4d');
 const {own,radar,target}=d.monitors;let out='';
 if(style==='armored'||style==='industrial'){
  for(const r of [own,radar,target]){
   out+=box(r,style==='armored'?20:10,style==='armored'?6:0);
   out+=`<rect x="${r.x-5}" y="${r.y-5}" width="${r.width+10}" height="${r.height+10}" fill="none" stroke="#a9b8bf" stroke-width="${style==='armored'?7:3}"/>`;
  }
 }else if(style==='skeletal'){
  for(const r of [own,radar,target])out+=box(r,14,22);
  out+=poly([[radar.x-10,633],[radar.x+10,582],[radar.x+radar.width-10,582],[radar.x+radar.width+10,633]],'#455f6c');
  out+=line([[radar.x-5,647],[radar.x-5,633],[radar.x+radar.width+5,633],[radar.x+radar.width+5,647]],5);
 }else if(style==='faceted'){
  // Flush recesses share the same fascia; no skewed or floating monitor pods.
  for(const r of [own,radar,target]){
   out+=box(r,8,8);
   out+=`<rect x="${r.x-3}" y="${r.y-3}" width="${r.width+6}" height="${r.height+6}" fill="none" stroke="#a4b5bf" stroke-width="3"/>`;
  }
 }else if(style==='pressure'){
  const cx=radar.x+radar.width/2,cy=radar.y+radar.height/2;
  out+=`<ellipse cx="${cx}" cy="${cy}" rx="187" ry="205" fill="#4d6772" stroke="#a4b6be" stroke-width="8"/><ellipse cx="${cx}" cy="${cy}" rx="171" ry="189" fill="none" stroke="#253e4b" stroke-width="6"/>`;
  for(const r of [own,target])out+=`<rect x="${r.x-24}" y="${r.y-24}" width="${r.width+48}" height="${r.height+48}" rx="48" fill="#3c5966" stroke="#a3b5bd" stroke-width="5"/>`;
 }
 return `<g data-instrument-mounts="${style}" mask="url(#structure-openings)">${out}</g>`;
}
