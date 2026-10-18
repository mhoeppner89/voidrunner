// Rounded, model-relative racing lines. Built once at module load; no curve
// solving runs in flight. Circular fillets keep each leg tangent to its turn.
import {graveyardModelPoint} from './graveyardLayout.js';
const model=(name,p)=>graveyardModelPoint(`concord-${name}-wreck`,p);
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function rounded(anchors){
 const points=[anchors[0].p];
 for(let i=1;i<anchors.length-1;i++){
  const a=anchors[i-1].p,b=anchors[i].p,c=anchors[i+1].p;
  const before=distance(a,b),after=distance(b,c),trim=Math.min(anchors[i].r??450,before*.38,after*.38);
  const u=mix(b,a,trim/before),v=mix(b,c,trim/after);
  const incoming=b.map((n,j)=>(n-a[j])/before),outgoing=c.map((n,j)=>(n-b[j])/after);
  const angle=Math.acos(Math.max(-1,Math.min(1,incoming.reduce((n,v,j)=>n+v*outgoing[j],0))));
  if(angle<.035){points.push(b);continue;}
  points.push(u);
  // A circular fillet: tangent to each straight leg, with bounded heading
  // changes even on hairpins. No interpolating spline can overshoot a hull.
  const tangent=Math.tan(angle/2),radius=trim/tangent;
  const bisector=incoming.map((n,j)=>outgoing[j]-n),bisectorLength=Math.hypot(...bisector);
  const center=b.map((n,j)=>n+bisector[j]/bisectorLength*radius/Math.cos(angle/2));
  const start=u.map((n,j)=>(n-center[j])/radius),end=v.map((n,j)=>(n-center[j])/radius);
  const cosine=Math.max(-1,Math.min(1,start.reduce((n,v,j)=>n+v*end[j],0))),sweep=Math.acos(cosine),sin=Math.sin(sweep),steps=Math.max(2,Math.ceil(sweep/(Math.PI/9)));
  for(let j=1;j<=steps;j++){const t=j/steps;points.push(center.map((n,k)=>n+radius*(start[k]*Math.sin((1-t)*sweep)+end[k]*Math.sin(t*sweep))/sin));}
 }
 points.push(anchors.at(-1).p);
 return {points};
}
const m=(name,p,r=450)=>({p:model(name,p),r});
const field=(p,r=400)=>({p,r});
const carrier=rounded([
 m('carrier',[-.20,1.0,-.07],0),m('carrier',[-.20,.42,-.07],90),m('carrier',[-.20,.015,-.07],100),
 m('carrier',[-.48,.16,-.07],65),m('carrier',[-.84,.16,-.07],120),m('carrier',[-.84,.16,.62],180),
 field([-2600,1250,-2620],500),field([-2750,1200,-3320],500),
 field([-2100,1100,-3500],500),m('carrier',[-1.35,.15,-.65],400),
 m('carrier',[1.25,.15,-.65],400),m('carrier',[1.65,.18,-.1],550),
 field([-150,1450,-200],500),m('carrier',[.25,.95,.55],220),m('carrier',[-.2,1.0,-.07],0),
]);
const breach=rounded([
 m('battleship',[-.58,-.07,-.65],0),m('battleship',[-.58,-.07,-.45],100),m('battleship',[-.58,-.07,.55],80),
 m('battleship',[-.45,.40,.70],150),m('battleship',[-.20,.65,.35],180),m('battleship',[-.20,.065,.05],150),
 m('battleship',[.35,.065,.05],120),m('battleship',[.72,-.07,0],160),m('battleship',[.72,-.07,-.62],230),
 m('battleship',[1.65,-.3,-.55],400),m('battleship',[1.65,-.45,.55],400),
 m('battleship',[.1,-.40,.55],450),field([-1400,-500,2900],500),field([-1550,-400,2350],500),m('battleship',[-.58,-.07,.6],0),
]);
const gauntlet=rounded([
 m('carrier',[-.84,-.04,-.65],0),m('carrier',[-.84,-.04,.65],250),
 m('frigate-alpha',[0,.30,-3.2],220),m('frigate-alpha',[0,.30,3.5],280),
 field([-2300,-100,900],550),m('cruiser-beta',[-.8,1.0,.04],250),m('cruiser-beta',[-.20,.19,.04],100),
 m('cruiser-beta',[.35,.19,.04],100),m('cruiser-beta',[1.1,1.1,.04],200),
 field([-1320,-400,2750],450),m('battleship',[-.58,-.07,.6],250),
 m('battleship',[.72,-.07,.6],250),m('battleship',[.72,-.07,-.6],220),
 m('frigate-beta',[-6.0,.8,-2.6],650),m('frigate-beta',[6.0,.8,-2.6],650),
 m('frigate-delta',[0,1.7,2.3],500),
 m('cruiser-alpha',[.90,-.04,-.85],180),m('cruiser-alpha',[.90,-.04,.85],150),m('cruiser-alpha',[1.8,-.1,.85],0),
]);

export const MOURNING_RACE_LAYOUTS={carrier,breach,gauntlet};
