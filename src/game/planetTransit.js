import * as THREE from 'three';

// An exterior camera shot, not a second flight simulation. It borrows the
// already-loaded painted hull and dock renderer; all scenery is procedural.
export const PLANET_TRANSIT_DURATION = {entry:4000,exit:3500};
export function planetTransitPalette(id){
 const palettes={
  vesper:{sky:0x6796b8,haze:0xe3bd91,land:0xa67149,sea:0x584a3b,cloud:0xefe0c9,water:0,seed:3},
  azure:{sky:0x569aba,haze:0xb4e2de,land:0x719675,sea:0x1d627d,cloud:0xe5f0e9,water:1,seed:11},
  'meridian-prime':{sky:0x689cb5,haze:0xc6d9cc,land:0x7f9673,sea:0x345c6d,cloud:0xe7e5d4,water:1,seed:19},
  boreal:{sky:0x638ba8,haze:0xc2dbe5,land:0xb6c4c7,sea:0x3c657c,cloud:0xe9edf0,water:1,seed:29},
 };
 return palettes[id]??palettes.vesper;
}
const ease=t=>t*t*(3-2*t);
export function planetTransitPose(direction,t){
 const q=ease(THREE.MathUtils.clamp(t,0,1));
 return direction==='entry'
  ? {altitude:1-q,x:.5-q*.9,y:.35-q*.65,z:-q*1.5,yaw:-.18+q*.3,pitch:.09,roll:Math.sin(q*Math.PI)*-.13,scale:1,thrust:.34,fade:Math.min(1,t/.08,(1-t)/.1)}
  : {altitude:q,x:-.7+q*2,y:-.25+q*2.4,z:-q*20,yaw:-.1,pitch:.16-q*.03,roll:Math.sin(q*Math.PI)*-.06,scale:1,thrust:1.1,fade:Math.min(1,t/.08,(1-t)/.1)};
}
const vertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,1.,1.);}';
const noise=`
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
 float terrain(vec2 p){return noise(p)*.56+noise(p*2.03+7.1)*.28+noise(p*4.07-3.2)*.11+noise(p*8.1)*.05;}
`;
function uniforms(p,surface){return {uSurface:{value:surface??null},uHasSurface:{value:surface?.image?1:0},uAspect:{value:1},uDeparture:{value:0},uPlanetCenter:{value:new THREE.Vector2()},uPlanetRadius:{value:1},uAltitude:{value:1},uTravel:{value:0},uSeed:{value:p.seed},uSky:{value:new THREE.Color(p.sky)},uHaze:{value:new THREE.Color(p.haze)},uLand:{value:new THREE.Color(p.land)},uSea:{value:new THREE.Color(p.sea)},uCloud:{value:new THREE.Color(p.cloud)},uWater:{value:p.water}};}
export class PlanetTransit {
 constructor(pivot,environment,id,direction,surface){
  this.direction=direction;this.duration=PLANET_TRANSIT_DURATION[direction];this.palette=planetTransitPalette(id);
  this.scene=new THREE.Scene();this.scene.environment=environment;this.scene.add(pivot);
  this.camera=new THREE.PerspectiveCamera(36,1,.1,160);
  // A fixed planet behind the outbound flight path, in cinematic world units.
  // Project it through the actual tracking camera so it recedes behind the tail.
  this.departurePlanet=new THREE.Vector3(0,-10,14);this.departureRadius=12;this.planetPoint=new THREE.Vector3();
  this.look=new THREE.Vector3();this.uniforms=uniforms(this.palette,surface);
  this.geometry=new THREE.PlaneGeometry(2,2);
  this.background=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,depthTest:false,depthWrite:false,toneMapped:false,fragmentShader:`
   varying vec2 vUv;uniform float uAspect,uAltitude,uTravel,uSeed,uWater,uHasSurface,uDeparture,uPlanetRadius;uniform vec2 uPlanetCenter;uniform sampler2D uSurface;uniform vec3 uSky,uHaze,uLand,uSea,uCloud;
   ${noise}
   void main(){
    vec2 p=(vUv-.5)*vec2(uAspect,1.);float low=1.-uAltitude;
    vec3 space=vec3(.003,.006,.017);vec2 cell=floor((p+4.)*180.);
    float star=step(.997,hash(cell))*pow(hash(cell+19.),4.)*.75;
    vec3 col=space+vec3(star)*uAltitude;
    float radius=uDeparture>.5?uPlanetRadius:mix(1.85,12.,low*low),top=mix(-.035,.04,low);
    vec2 center=uDeparture>.5?uPlanetCenter:vec2(.3,-radius+top);
    vec2 d=p-center;float dist=length(d),edge=radius-dist;
    vec3 normal=vec3(d/radius,sqrt(max(0.,1.-dot(d,d)/(radius*radius))));
    float atmosphere=exp(-abs(edge)*mix(95.,28.,low));
    col+=uSky*atmosphere*(.65+.35*low);
    if(edge>0.){
     vec2 angles=vec2(atan(normal.x,normal.z),asin(clamp(normal.y,-1.,1.)));
     vec2 uv=(uDeparture>.5?angles*4.:vec2(normal.x*6.,normal.z*6.+normal.y*3.))+vec2(uSeed,uTravel*.12);
     float light=.36+.64*max(0.,dot(normal,normalize(vec3(-.6,.8,.6))));
     // The outbound view reveals the whole disc. Put its poles on the
     // vertical axis, rather than pointing a texture pole at the camera.
     vec2 globe=uDeparture>.5
      ? vec2(angles.x/6.2831853+.5+uTravel*.025,angles.y/3.14159265+.5)
      : vec2(atan(normal.x,normal.y)/6.2831853+.5+uTravel*.025,asin(clamp(normal.z,-1.,1.))/3.14159265+.4);
     vec3 ground;
     if(uHasSurface>.5)ground=texture2D(uSurface,globe).rgb;
     else{float n=terrain(uv*2.2);vec3 rock=uLand*(.7+.5*n),ocean=uSea*(.75+.35*n);ground=mix(rock,mix(ocean,rock,smoothstep(.46,.56,n)),uWater);}
     float cloud=smoothstep(.57,.76,terrain(uv*1.7+vec2(8.,uTravel*.08)))*mix(.35,1.,uWater);
     // Broad cloud banks cast a little shade onto the surface, rather than
     // making the entire day side uniformly luminous.
     ground*=1.-cloud*.17;
     ground=mix(ground,uCloud*.925,cloud*mix(.8,.3,low))*light;
     float limb=pow(1.-normal.z,4.);ground=mix(ground,uHaze,.15+limb*.48);
     col=mix(col,ground,smoothstep(0.,.006,edge));
    }
    float air=low*low;vec3 sky=mix(uSky*.55,uHaze*.8,clamp(1.-vUv.y,0.,1.));
    col=mix(col,sky,air*(edge>0.?.18:.94));
    vec2 sun=p-vec2(-uAspect*.31,.30);float r=length(sun);
    col+=vec3(1.,.81,.59)*(exp(-r*13.)*.16+(.4+.6*uAltitude)*(1.-smoothstep(.017,.021,r))*1.7)*step(edge,0.);
    gl_FragColor=vec4(col,1.);
   }`});
  const background=new THREE.Mesh(this.geometry,this.background);background.frustumCulled=false;background.renderOrder=-100;this.scene.add(background);
  this.clouds=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,fragmentShader:`
   varying vec2 vUv;uniform float uAspect,uAltitude,uTravel,uSeed,uDeparture;uniform vec3 uCloud;
   ${noise}
   void main(){
    vec2 p=(vUv-.5)*vec2(uAspect,1.);
    vec2 wind=uTravel*mix(vec2(1.1,.14),vec2(1.6,.7),uDeparture);
    float n=terrain((p+wind)*vec2(2.2,5.)+uSeed);
    float banks=smoothstep(.46,.76,n);
    float borders=smoothstep(.08,.48,abs(vUv.y-.51)+abs(vUv.x-.5)*.35);
    float altitude=1.-smoothstep(.05,.85,uAltitude);
    float veil=banks*altitude*(.15+borders*.75);
    gl_FragColor=vec4(uCloud*(.62+n*.3),veil);
   }`});
  const foreground=new THREE.Mesh(this.geometry,this.clouds);foreground.frustumCulled=false;foreground.renderOrder=100;this.scene.add(foreground);
  const p=this.palette;
  this.hemi=new THREE.HemisphereLight(p.sky,p.land,2.1);this.scene.add(this.hemi);
  this.key=new THREE.DirectionalLight(0xffe4c1,3.8);this.key.position.set(-6,7,-3);this.scene.add(this.key);
  this.fill=new THREE.DirectionalLight(p.haze,1.1);this.fill.position.set(5,-1,5);this.scene.add(this.fill);
  this.engineLight=new THREE.PointLight(0x61bfff,2.5,10,2);this.engineLight.position.set(0,.3,2.4);this.scene.add(this.engineLight);
  this.update(0);
 }
 configure(pivot,environment,id,direction,surface){
  this.scene.add(pivot);this.scene.environment=environment;this.direction=direction;this.duration=PLANET_TRANSIT_DURATION[direction];
  const p=this.palette=planetTransitPalette(id),u=this.uniforms;
  u.uSurface.value=surface??null;u.uHasSurface.value=surface?.image?1:0;u.uWater.value=p.water;u.uSeed.value=p.seed;
  for(const [name,key]of [['uSky','sky'],['uHaze','haze'],['uLand','land'],['uSea','sea'],['uCloud','cloud']])u[name].value.setHex(p[key]);
  this.hemi.color.setHex(p.sky);this.hemi.groundColor.setHex(p.land);this.fill.color.setHex(p.haze);this.update(0);
 }
 resize(aspect){this.camera.aspect=aspect;this.camera.zoom=Math.min(1,aspect/1.35);this.camera.updateProjectionMatrix();this.uniforms.uAspect.value=aspect;}
 update(t){
  this.progress=t;const pose=planetTransitPose(this.direction,t),q=ease(t);
  const outbound=this.direction==='exit',u=this.uniforms;
  u.uAltitude.value=pose.altitude;u.uTravel.value=t;u.uDeparture.value=outbound?1:0;
  if(outbound){
   // Front-quarter tracking shot: the nose heads into clear space while the
   // fixed planet stays aft. Arrival retains its rear-quarter descent camera.
   this.camera.position.set(pose.x+9-q*.8,pose.y+4+q*.6,pose.z-12+q);
   this.look.set(pose.x,pose.y+.1,pose.z-.5);
  }else{
   this.camera.position.set(9-q*1.8,3.8-q*.8,10-q);
   this.look.set(pose.x*.35,pose.y*.25,-.8-q);
  }
  this.camera.lookAt(this.look);this.camera.updateMatrixWorld();
  if(outbound){
   this.planetPoint.copy(this.departurePlanet).project(this.camera);
   u.uPlanetCenter.value.set(this.planetPoint.x*this.camera.aspect*.5,this.planetPoint.y*.5);
   this.planetPoint.copy(this.departurePlanet).applyMatrix4(this.camera.matrixWorldInverse);
   const depth=-this.planetPoint.z,r=this.departureRadius;
   u.uPlanetRadius.value=r*this.camera.zoom/(2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov*.5))*Math.sqrt(Math.max(1,depth*depth-r*r)));
  }
  this.key.intensity=3.1+.7*(1-pose.altitude);this.fill.intensity=1.1+.6*(1-pose.altitude);
  this.engineLight.position.set(pose.x,pose.y+.3,pose.z+2.4);
  return pose;
 }
 release(){this.scene.environment=null;this.uniforms.uSurface.value=null;this.uniforms.uHasSurface.value=0;}
 dispose(){this.release();this.geometry.dispose();this.background.dispose();this.clouds.dispose();}
}
