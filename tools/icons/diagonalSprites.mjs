// Crisp 45° pixel weapons. A weapon is a list of parts in its own frame:
// u runs along the barrel (muzzle at +u, up-right on screen), v across it
// (negative v is the lit top face, toward the top-left light). Pixels are
// tested exactly in that frame, so every edge is a clean 1:1 staircase, and
// each part is shaded in bands across v: highlight row, lit face, body,
// shadow. Materials: hull (tier paint), dark (vents, recesses), trim
// (tier line colour), glow (the item's accent, recoloured at runtime).
export const N=32;
// Screen pixel (x,y) to the weapon frame: u along the up-right diagonal,
// v along the down-right normal; one diagonal step is 1 unit in both.
const frame=(x,y)=>({u:(x-y)/2,v:(x+y-(N-1))/2});
// A part: [material, u0, u1, v0, v1, {taper:[v0end,v1end]}] — v bounds may
// change linearly toward u1 (taper) for cones, warheads and flares.
// Scale a design so its farthest corner leaves room for the ink outline
// plus one clear pixel (the gallery audit keeps paint off the edge). A
// corner (u,v) lands at x=u+v+15.5, y=v-u+15.5.
export function fitDiagonal(parts,margin=14,scaleFrom=parts){
  let reach=0;
  for(const [, u0,u1,v0,v1,opt={}] of scaleFrom){
    const ends=[[u0,v0,v1],[u1,opt.taper?.[0]??v0,opt.taper?.[1]??v1]];
    for(const [u,a,b] of ends)for(const v of [a,b])reach=Math.max(reach,Math.abs(u+v),Math.abs(v-u));
  }
  const k=margin/Math.max(reach,1e-6);
  return parts.map(([m,u0,u1,v0,v1,opt={}])=>[m,u0*k,u1*k,v0*k,v1*k,opt.taper?{...opt,taper:opt.taper.map(v=>v*k)}:opt]);
}
export function renderDiagonal(raw,{fit=true,scaleFrom=raw}={}){
  const parts=fit?fitDiagonal(raw,14,scaleFrom):raw;
  const owner=new Array(N*N).fill(-1);
  parts.forEach((p,index)=>{
    const [, u0,u1,v0,v1,opt={}]=p;
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const {u,v}=frame(x,y);if(u<u0-.01||u>u1+.01)continue;
      const t=u1>u0?(u-u0)/(u1-u0):0,lo=opt.taper?v0+(opt.taper[0]-v0)*t:v0,hi=opt.taper?v1+(opt.taper[1]-v1)*t:v1;
      if(v>=lo-.01&&v<=hi+.01)owner[y*N+x]=index;
    }
  });
  // Shade each pixel by its position across its part.
  const cell=new Array(N*N).fill(null);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=y*N+x,o=owner[i];if(o<0)continue;
    const [mat,u0,u1,v0,v1,opt={}]=parts[o],{u,v}=frame(x,y);
    const t=u1>u0?(u-u0)/(u1-u0):0,lo=opt.taper?v0+(opt.taper[0]-v0)*t:v0,hi=opt.taper?v1+(opt.taper[1]-v1)*t:v1;
    const s=hi>lo?(v-lo)/(hi-lo):.5;
    // Silhouette edges facing the light (up and left) catch a highlight; the
    // far side falls into shadow. Seams between parts stay unlit, or every
    // inner boundary would turn into a dotted diagonal.
    const up=y>0?owner[i-N]:-1,left=x>0?owner[i-1]:-1,down=y<N-1?owner[i+N]:-1,right=x<N-1?owner[i+1]:-1;
    const litEdge=up<0&&left<0,shadowEdge=down<0&&right<0;
    let tone;
    if(mat==='glow')tone=s<.34||litEdge?'h':'a';
    else tone=litEdge?'hi':shadowEdge||s>.7?'lo':s<.4?'lit':'mid';
    cell[i]={mat,tone};
  }
  return cell;
}
