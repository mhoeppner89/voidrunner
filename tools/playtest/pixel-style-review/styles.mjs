// Review-only colour experiments. No shipping shader or source artwork changes.
export const STYLES=[
 {id:'clean',letter:'A',name:'Clean',colors:256,legacy:true,radius:1,passes:1,threshold:24,description:'Fine shading. No checkerboard texture.'},
 {id:'balanced',letter:'B',name:'Painted',colors:96,legacy:true,radius:2,passes:2,threshold:34,description:'Broader plain areas, with clear material and colour differences.'},
 {id:'bold',letter:'C',name:'Bold',colors:48,legacy:true,radius:2,passes:3,threshold:43,description:'Large colour blocks and stronger, visible shading steps.'},
 {id:'natural',letter:'D',name:'Natural',legacy:true,colors:null,quantizer:'none',colorLabel:'Full colour',radius:2,passes:2,threshold:34,description:'Noise reduction only. Original contrast and saturation.'},
 {id:'rich',letter:'E',name:'Rich',legacy:true,colors:4096,quantizer:'adaptive',colorLabel:'4,096 colours',radius:2,passes:2,threshold:34,description:'A larger palette, adapted to the artwork. Original contrast and saturation.'},
 {id:'vivid',letter:'F',name:'Vivid',legacy:true,colors:4096,quantizer:'adaptive',colorLabel:'4,096 colours',saturation:1.12,contrast:.16,radius:2,passes:2,threshold:34,description:'Same colour budget as E, with a little more contrast and saturation.'},
 {id:'crisp',letter:'G',name:'Original colours',colors:null,quantizer:'none',colorLabel:'Crisp pixels',radius:0,passes:0,threshold:0,description:'Current game. No added grain, smoothing, tint or palette reduction.'},
];
// Protect UI/loot/navigation colours while learning the remaining shared palette
// from all five scenes. This is a TOTAL palette count, not levels per channel.
const anchors=['000000','071426','10283e','24425a','3b5668','687b88','99a5ab','c8ceca','f3e6bf','ffffff','ebca72','64d7e8','72d69b','78b7f5','e97462','ad97d9'].map(s=>[0,2,4].map(i=>parseInt(s.slice(i,i+2),16)));
const rgbDistance=(r,g,b)=>.30*r*r+.59*g*g+.11*b*b;
function smooth(data,width,height,style){
 let src=data.slice();const radius=style.radius,limit=style.threshold**2;
 for(let pass=0;pass<style.passes;pass++){
  const dst=src.slice();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const i=(y*width+x)*4,r=src[i],g=src[i+1],b=src[i+2];let red=0,green=0,blue=0,total=0;
   for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=width||yy>=height)continue;const j=(yy*width+xx)*4;
    const delta=rgbDistance(src[j]-r,src[j+1]-g,src[j+2]-b);if(delta>=limit)continue;
    // Smooth nearby paint tones, preserving high-contrast lettering, silhouettes
    // and edges. Unlike a blur, light never bleeds across those boundaries.
    const w=(1-delta/limit)**2/(1+(dx*dx+dy*dy)*.4);red+=src[j]*w;green+=src[j+1]*w;blue+=src[j+2]*w;total+=w;
   }
   dst[i]=Math.round(red/total);dst[i+1]=Math.round(green/total);dst[i+2]=Math.round(blue/total);
  }src=dst;
 }return src;
}
function paletteFor(frames,count,shift=3){
 const histogram=new Map();
 const side=256>>shift;
 for(const {data}of frames)for(let i=0;i<data.length;i+=8){const key=(data[i]>>shift)*side*side+(data[i+1]>>shift)*side+(data[i+2]>>shift);let cell=histogram.get(key);if(!cell){cell={n:0,r:0,g:0,b:0};histogram.set(key,cell);}cell.n++;cell.r+=data[i];cell.g+=data[i+1];cell.b+=data[i+2];}
 const points=[...histogram.values()].map(c=>({n:c.n,c:[c.r/c.n,c.g/c.n,c.b/c.n]}));
 function box(points){let n=0,sum=[0,0,0],square=[0,0,0];for(const p of points){n+=p.n;for(let k=0;k<3;k++){sum[k]+=p.c[k]*p.n;square[k]+=p.c[k]**2*p.n;}}const variance=sum.map((v,k)=>(square[k]-v*v/n)*[.30,.59,.11][k]);return{points,n,mean:sum.map(v=>Math.round(v/n)),variance,score:Math.max(...variance)};}
 const boxes=[box(points)];
 while(boxes.length<count-anchors.length){
  let index=-1,score=-1;for(let i=0;i<boxes.length;i++)if(boxes[i].points.length>1&&boxes[i].score>score){index=i;score=boxes[i].score;}if(index<0)break;
  const b=boxes[index],axis=b.variance.indexOf(Math.max(...b.variance));b.points.sort((a,c)=>a.c[axis]-c.c[axis]);let weight=0,split=1;
  for(let i=0;i<b.points.length-1;i++){weight+=b.points[i].n;if(weight>=b.n/2){split=i+1;break;}}
  boxes.splice(index,1,box(b.points.slice(0,split)),box(b.points.slice(split)));
 }
 return [...anchors,...boxes.map(b=>b.mean)];
}
function lookup(palette){
 const lut=new Uint16Array(64**3);
 for(let r=0;r<64;r++)for(let g=0;g<64;g++)for(let b=0;b<64;b++){
  let best=0,distance=Infinity;for(let i=0;i<palette.length;i++){const p=palette[i],d=rgbDistance(r*255/63-p[0],g*255/63-p[1],b*255/63-p[2]);if(d<distance){distance=d;best=i;}}
  lut[r*4096+g*64+b]=best;
 }return lut;
}
// A richer palette needs a finer lookup than the earlier 64-level preview.
// KD-tree nearest neighbours keep this offline build bounded. The same lookup
// could later be sampled as a 3D texture without a runtime palette search.
function adaptiveLookup(palette){
 const weights=[.30,.59,.11],side=128,scale=255/(side-1),lut=new Uint16Array(side**3);
 function node(ids,depth=0){
  if(!ids.length)return null;const axis=depth%3;ids.sort((a,b)=>palette[a][axis]-palette[b][axis]);const mid=ids.length>>1;
  return{id:ids[mid],axis,left:node(ids.slice(0,mid),depth+1),right:node(ids.slice(mid+1),depth+1)};
 }
 const root=node(palette.map((_,i)=>i));let best,bestDistance,rgb=[0,0,0];
 function search(n){
  if(!n)return;const p=palette[n.id],d=rgbDistance(rgb[0]-p[0],rgb[1]-p[1],rgb[2]-p[2]);if(d<bestDistance){bestDistance=d;best=n.id;}
  const delta=rgb[n.axis]-p[n.axis],near=delta<0?n.left:n.right,far=delta<0?n.right:n.left;search(near);if(delta*delta*weights[n.axis]<bestDistance)search(far);
 }
 for(let r=0;r<side;r++)for(let g=0;g<side;g++)for(let b=0;b<side;b++){rgb[0]=r*scale;rgb[1]=g*scale;rgb[2]=b*scale;best=0;bestDistance=Infinity;search(root);lut[(r*side+g)*side+b]=best;}
 return lut;
}
function grade(data,style){
 if(!style.saturation&&!style.contrast)return data;const dst=data.slice();
 for(let i=0;i<data.length;i+=4){const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255,luma=.2126*r+.7152*g+.0722*b;
  for(let k=0;k<3;k++){let c=luma+(data[i+k]/255-luma)*(style.saturation??1);c=Math.max(0,Math.min(1,c));if(style.contrast)c+=style.contrast*c*(1-c)*(2*c-1);dst[i+k]=Math.round(c*255);}
 }return dst;
}
export async function buildStyles(scenes,previousAvailable=false){
 const sources=[];
 for(const scene of scenes){const image=new Image();image.src=`./${scene.id}-source.png`;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);sources.push({id:scene.id,width:image.width,height:image.height,data:ctx.getImageData(0,0,image.width,image.height).data});}
 const files=[],manifest={revision:'clean-pixels-4',generated:new Date().toISOString(),sourceSize:[1440,900],logicalSize:[1440,900],shippingChanged:true,previousAvailable,scenes,styles:[]},smoothed=new Map();
 for(const style of STYLES){
  const key=[style.radius,style.passes,style.threshold].join(':');let frames=smoothed.get(key);if(!frames){frames=sources.map(f=>({...f,data:smooth(f.data,f.width,f.height,style)}));smoothed.set(key,frames);}
  const graded=frames.map(f=>({...f,data:grade(f.data,style)})),adaptive=style.quantizer==='adaptive',palette=style.quantizer==='none'?null:paletteFor(graded,style.colors,adaptive?2:3),lut=palette?(adaptive?adaptiveLookup(palette):lookup(palette)):null,side=adaptive?128:64,last=side-1,counts={};
  for(const frame of graded){const bytes=new Uint8ClampedArray(frame.data.length),seen=new Set();for(let i=0;i<bytes.length;i+=4){
   if(lut){const p=lut[(Math.round(frame.data[i]*last/255)*side+Math.round(frame.data[i+1]*last/255))*side+Math.round(frame.data[i+2]*last/255)];bytes.set(palette[p],i);}
   else bytes.set(frame.data.subarray(i,i+3),i);
   bytes[i+3]=255;seen.add(bytes[i]*65536+bytes[i+1]*256+bytes[i+2]);
  }
   const full=document.createElement('canvas');full.width=frame.width;full.height=frame.height;full.getContext('2d').putImageData(new ImageData(bytes,frame.width,frame.height),0,0);files.push({name:`${frame.id}-${style.id}.png`,data:full.toDataURL('image/png')});counts[frame.id]=seen.size;
  }
  manifest.styles.push({...style,palette,counts,dither:0});
 }return{files,manifest};
}
