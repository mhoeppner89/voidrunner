// Transient racing resources, shared by the player and rivals. No hull stats
// or career inventory are modified. This module has no world dependencies.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const RACE_BOOST_SECONDS=3.2;
export const RACE_STABILIZER_SECONDS=5;
export function createRaceDrive(){return {charge:RACE_BOOST_SECONDS,locked:false,recovery:0,stabilizerTime:0,burning:false,draft:0};}
export function stepRaceDrive(drive,requested,dt,draft=0){
 drive.stabilizerTime=Math.max(0,drive.stabilizerTime-dt);drive.draft=draft;
 drive.burning=Boolean(requested&&!drive.locked&&drive.charge>0);
 if(drive.burning){
  drive.recovery=.65;
  drive.charge=Math.max(0,drive.charge-dt*(1-.3*draft));
  if(drive.charge<=0)drive.locked=true;
 }else{
  drive.recovery=Math.max(0,drive.recovery-dt);
  if(drive.recovery===0)drive.charge=Math.min(RACE_BOOST_SECONDS,drive.charge+dt*(RACE_BOOST_SECONDS/5)*(1+.6*draft));
  if(drive.charge>=RACE_BOOST_SECONDS)drive.locked=false;
 }
 return drive.burning;
}
export function collectRaceStabilizer(drive){drive.stabilizerTime=RACE_STABILIZER_SECONDS;}
export function raceDraft(ship,peers,out){
 const v=ship.velocity,speed=Math.hypot(v[0],v[1],v[2]);let strength=0,source;
 if(speed>1)for(let index=0;index<(Array.isArray(peers)?peers.length:1);index++){
  const other=Array.isArray(peers)?peers[index]:peers;
  if(other===ship||other.raceFinished||other.hull<=0)continue;
  const dx=other.position[0]-ship.position[0],dy=other.position[1]-ship.position[1],dz=other.position[2]-ship.position[2];
  const ahead=(dx*v[0]+dy*v[1]+dz*v[2])/speed;if(ahead<18||ahead>150)continue;
  const ov=other.velocity,os=Math.hypot(ov[0],ov[1],ov[2]);if(os<1||(v[0]*ov[0]+v[1]*ov[1]+v[2]*ov[2])/(speed*os)<.8)continue;
  const lateral=Math.sqrt(Math.max(0,dx*dx+dy*dy+dz*dz-ahead*ahead));
  const candidate=clamp((1-(ahead-18)/132)*(1-lateral/22),0,1);if(candidate>strength){strength=candidate;source=other;}
 }
 if(out){out.sourceId=source?.id;out.sourceName=source?.name;out.strength=strength;}
 return strength>=.08?strength:0;
}
export function sweptBoostHit(a,b,p,radius=12){
 const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],length=dx*dx+dy*dy+dz*dz;
 const t=length>0?clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy+(p[2]-a[2])*dz)/length,0,1):0;
 return (a[0]+dx*t-p[0])**2+(a[1]+dy*t-p[1])**2+(a[2]+dz*t-p[2])**2<=radius*radius;
}
// Place the optional line beside a long straight, rather than on the apex of
// a blind turn. The approach/rejoin and physical debris use this same data.
export function raceBoostLayout(points){
 const segments=[];let distance=0;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(...b.map((v,j)=>v-a[j]));segments.push({a,b,length,start:distance});distance+=length;}
 const used=[];return [.22,.53,.79].map((fraction,index)=>{
  const candidates=[];
  for(const segment of segments){
   if(segment.length<=340)continue;
   const count=Math.max(1,Math.floor((segment.length-310)/150));
   for(let i=0;i<count;i++){
    const along=count===1?segment.length*.5:155+(segment.length-310)*i/(count-1);
    const at=segment.start+along;
    if(used.some(previous=>Math.abs(previous-at)<=600))continue;
    candidates.push({...segment,t:along/segment.length,at,error:Math.abs(at-distance*fraction)});
   }
  }
  candidates.sort((a,b)=>a.error-b.error);
  const s=candidates[0];if(!s)return null;used.push(s.at);
  const direction=s.b.map((v,j)=>(v-s.a[j])/s.length),horizontal=Math.hypot(direction[0],direction[2])||1,sign=index%2? -1:1;
  const side=[direction[2]/horizontal*sign,0,-direction[0]/horizontal*sign],center=s.a.map((v,j)=>v+(s.b[j]-v)*s.t);
  return {index,pathDistance:s.at,position:center.map((v,j)=>v+side[j]*44),
   hazard:center.map((v,j)=>v+side[j]*80),direction,
   approach:center.map((v,j)=>v-direction[j]*155),rejoin:center.map((v,j)=>v+direction[j]*155)};
 }).filter(Boolean);
}
// Distance is projected only between the two validated checkpoint planes;
// crossing another leg in a tangled course cannot advance the live ranking.
export function raceDistance(ship,course){
 const index=ship.raceGateIndex??0;if(ship.raceFinished||index>=course.gates.length)return course.routeLength;
 const end=course.gates[index],start=index?course.gates[index-1]:course.gathering;
 const a=start.position,b=end.position,p=ship.position;
 const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],l=dx*dx+dy*dy+dz*dz;
 const t=l?clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy+(p[2]-a[2])*dz)/l,0,1):0;
 const low=start.pathDistance??0,high=end.pathDistance??((index+1)*course.routeLength/course.gates.length);
 return low+(high-low)*t;
}
