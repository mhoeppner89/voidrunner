// GPU-driven building blocks for weapon impacts and explosions.
//
// Every burst is one instanced draw whose motion, cooling and fading run in
// the vertex/fragment shaders from a single `time` uniform: no per-frame CPU
// loops over particles, no dynamic lights and no postprocessing. Programs are
// compiled once per kind (shared base materials, cheap per-burst clones for
// the uniforms); geometry buffers are small typed arrays per burst.
//
//   streaks — camera-facing quads stretched along each spark's motion, with
//             drag; white-hot heads cooling to the burst colour.
//   ring    — an expanding shock ring, camera-facing or in a world plane.
//   arcs    — jagged electric branches that re-strike every few frames.
//   glow    — a soft additive sprite, optionally parented to a hull so a
//             scorch keeps glowing on the plate that was hit.
import * as THREE from 'three';

const QUAD_CORNERS = new Float32Array([0, -1, 1, -1, 1, 1, 0, 1]);
const QUAD_INDEX = [0, 1, 2, 0, 2, 3];
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();

const STREAK_VERTEX = `
attribute vec2 corner; attribute vec3 dir; attribute vec4 spark;
uniform float time; uniform float drag; uniform float lag; uniform float widthScale; uniform float nearClip;
varying float vHeat; varying float vAlong; varying float vAlive;
float travel(float t){ return spark.x*(1.0-exp(-drag*t))/drag; }
void main(){
  float life=spark.y, t=max(0.0,time-spark.z), age=clamp(t/life,0.0,1.0);
  vec4 head=modelViewMatrix*vec4(dir*travel(t),1.0);
  vec4 tail=modelViewMatrix*vec4(dir*travel(max(0.0,t-lag)),1.0);
  if(nearClip>0.){
    // Clip both endpoints before perspective division. Crossing the near
    // plane must never stretch one fragment across the cockpit.
    if(min(-head.z,-tail.z)<nearClip){gl_Position=vec4(2.,2.,2.,1.);return;}
    vec2 focal=vec2(projectionMatrix[0][0],projectionMatrix[1][1]);
    vec2 tip=head.xy/(-head.z), delta=tail.xy/(-tail.z)-tip;
    tail.xy=(tip+delta*min(1.,.05/max(.00001,length(focal*delta))))*(-tail.z);
  }
  vec3 axis=head.xyz-tail.xyz;
  vec3 side=cross(axis,head.xyz);
  float sideLength=length(side);
  side=sideLength>1e-6?side/sideLength:vec3(1.0,0.0,0.0);
  float width=spark.w*widthScale*(1.0-age*0.55);
  vec3 p=mix(tail.xyz,head.xyz,corner.x)+side*corner.y*width;
  vHeat=1.0-age; vAlong=corner.x; vAlive=step(time,spark.z+life)*step(spark.z,time);
  gl_Position=projectionMatrix*vec4(p,1.0);
}`;
const STREAK_FRAGMENT = `
uniform vec3 hot; uniform vec3 cool; uniform float opacity;
varying float vHeat; varying float vAlong; varying float vAlive;
void main(){
  float heat=pow(vHeat,0.7);
  vec3 color=mix(cool,hot,heat);
  color=mix(color,vec3(1.0,0.97,0.9),smoothstep(0.7,1.0,heat)*vAlong);
  float alpha=vAlive*pow(vAlong,1.3)*pow(vHeat,0.6)*opacity;
  gl_FragColor=vec4(color*alpha,alpha);
}`;
const RING_VERTEX = `
attribute vec2 corner2;
uniform float time; uniform float life; uniform float radius; uniform float billboard;
varying vec2 vUv; varying float vAge;
void main(){
  vAge=clamp(time/life,0.0,1.0); vUv=corner2;
  float size=radius*(1.0-pow(1.0-vAge,3.0))+0.001;
  if(billboard>0.5){
    vec4 centre=modelViewMatrix*vec4(0.0,0.0,0.0,1.0);
    float scale=length(modelMatrix[0].xyz);
    gl_Position=projectionMatrix*(centre+vec4(corner2*size*scale,0.0,0.0));
  } else gl_Position=projectionMatrix*modelViewMatrix*vec4(corner2.x*size,corner2.y*size,0.0,1.0);
}`;
const RING_FRAGMENT = `
uniform vec3 color; uniform float opacity; uniform float thickness;
varying vec2 vUv; varying float vAge;
void main(){
  float r=length(vUv);
  float band=(r-(1.0-thickness))/thickness;
  float ring=exp(-band*band*4.0)*step(r,1.0);
  float inner=smoothstep(1.0,0.0,r)*0.18*(1.0-vAge);
  float alpha=(ring+inner)*pow(1.0-vAge,1.6)*opacity;
  gl_FragColor=vec4(color*alpha,alpha);
}`;
const ARC_VERTEX = `
attribute vec2 corner; attribute vec3 dir; attribute vec4 arc;
uniform float time; uniform float life; uniform float radius; uniform float strikes;
varying float vFade; varying float vAlong;
float hash(float n){ return fract(sin(n)*43758.5453); }
vec3 point(float k, float strike){
  float u=k/arc.y;
  vec3 a=normalize(cross(dir,abs(dir.y)<0.9?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0)));
  vec3 b=cross(dir,a);
  float s=arc.z*13.7+k*7.1+strike*3.3;
  float jitter=sin(3.14159*u)*radius*0.32;
  return dir*u*radius*arc.w+(a*(hash(s)-0.5)+b*(hash(s+1.9)-0.5))*2.0*jitter;
}
void main(){
  float strike=floor(time*strikes);
  vec4 p0=modelViewMatrix*vec4(point(arc.x,strike),1.0);
  vec4 p1=modelViewMatrix*vec4(point(arc.x+1.0,strike),1.0);
  vec3 axis=p1.xyz-p0.xyz; vec3 side=cross(axis,p0.xyz);
  float sideLength=length(side); side=sideLength>1e-6?side/sideLength:vec3(1.0,0.0,0.0);
  float age=clamp(time/life,0.0,1.0);
  float width=radius*0.035*(1.0-arc.x/arc.y*0.6);
  vec3 p=mix(p0.xyz,p1.xyz,corner.x)+side*corner.y*width;
  // Each branch flickers on its own beat and dies back toward the core.
  float on=step(0.35,hash(arc.z*5.1+strike*1.7));
  vFade=on*pow(1.0-age,1.2)*step(arc.x/arc.y,1.0-age*0.7);
  vAlong=arc.x/arc.y;
  gl_Position=projectionMatrix*vec4(p,1.0);
}`;
const ARC_FRAGMENT = `
uniform vec3 color; uniform float opacity;
varying float vFade; varying float vAlong;
void main(){
  vec3 c=mix(vec3(0.92,1.0,1.0),color,vAlong*0.8);
  float alpha=vFade*opacity;
  gl_FragColor=vec4(c*alpha,alpha);
}`;

const baseMaterials = new Map();
function material(kind, uniforms) {
    let base = baseMaterials.get(kind);
    if (!base) {
        const shaders = { streak: [STREAK_VERTEX, STREAK_FRAGMENT], ring: [RING_VERTEX, RING_FRAGMENT], arc: [ARC_VERTEX, ARC_FRAGMENT] }[kind];
        base = new THREE.ShaderMaterial({
            uniforms: {}, vertexShader: shaders[0], fragmentShader: shaders[1],
            transparent: true, depthWrite: false, blending: THREE.CustomBlending,
            // Premultiplied additive: colour adds, alpha never darkens.
            blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, side: THREE.DoubleSide,
        });
        base.userData.shared = true;
        baseMaterials.set(kind, base);
    }
    const clone = base.clone();
    clone.uniforms = uniforms;
    clone.userData.shared = false;
    return clone;
}
const color = (hex) => new THREE.Color(hex);

// A spark burst. `direction(i, out)` fills each spark's unit direction; the
// default is an even sphere. Returns { object, life, maxLife, update, dispose }.
export function createStreakBurst({
    position = [0, 0, 0], count = 14, direction, speedMin = 18, speedMax = 40, drag = 2.6,
    lifeMin = .25, lifeMax = .55, delay = 0, width = .12, lag = .045, hot = 0xfff1c4, cool = 0xff6a1e, opacity = 1,
    velocity, random = Math.random, nearClip = 0,
}) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(QUAD_INDEX);
    geometry.setAttribute('corner', new THREE.Float32BufferAttribute(QUAD_CORNERS, 2));
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    const dirs = new Float32Array(count * 3), sparks = new Float32Array(count * 4);
    let longest = 0;
    for (let i = 0; i < count; i++) {
        if (direction) direction(i, tmpA, random);
        else { const z = random() * 2 - 1, a = random() * Math.PI * 2, r = Math.sqrt(1 - z * z); tmpA.set(Math.cos(a) * r, Math.sin(a) * r, z); }
        tmpA.normalize();
        dirs[i * 3] = tmpA.x; dirs[i * 3 + 1] = tmpA.y; dirs[i * 3 + 2] = tmpA.z;
        const life = lifeMin + (lifeMax - lifeMin) * random(), start = typeof delay === 'function' ? delay(i, random) : delay * random();
        sparks.set([speedMin + (speedMax - speedMin) * random(), life, start, width * (.6 + random() * .8)], i * 4);
        longest = Math.max(longest, start + life);
    }
    geometry.setAttribute('dir', new THREE.InstancedBufferAttribute(dirs, 3));
    geometry.setAttribute('spark', new THREE.InstancedBufferAttribute(sparks, 4));
    geometry.instanceCount = count;
    const uniforms = {
        time: { value: 0 }, drag: { value: drag }, lag: { value: lag }, widthScale: { value: 1 }, nearClip: { value: nearClip },
        hot: { value: color(hot) }, cool: { value: color(cool) }, opacity: { value: opacity },
    };
    const mesh = new THREE.Mesh(geometry, material('streak', uniforms));
    mesh.frustumCulled = false; mesh.raycast = () => undefined;
    mesh.position.fromArray(position);
    const drift = velocity ? new THREE.Vector3().fromArray(velocity) : undefined;
    return {
        object: mesh, life: longest, maxLife: longest,
        update(dt) { uniforms.time.value += dt; if (drift) mesh.position.addScaledVector(drift, dt); },
        dispose() { mesh.removeFromParent(); geometry.dispose(); mesh.material.dispose(); },
    };
}

// An expanding ring. With `normal` it lies in that plane; without, it faces
// the camera. `radius` is the final radius in metres.
export function createShockRing({ position = [0, 0, 0], normal, radius = 6, life = .4, thickness = .18, hex = 0xffd9a0, opacity = .8, delay = 0, velocity }) {
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(QUAD_INDEX);
    geometry.setAttribute('corner2', new THREE.Float32BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    const uniforms = {
        time: { value: -delay }, life: { value: life }, radius: { value: radius }, billboard: { value: normal ? 0 : 1 },
        color: { value: color(hex) }, opacity: { value: opacity }, thickness: { value: thickness },
    };
    const mesh = new THREE.Mesh(geometry, material('ring', uniforms));
    mesh.frustumCulled = false; mesh.raycast = () => undefined;
    mesh.position.fromArray(position);
    if (normal) mesh.quaternion.setFromUnitVectors(tmpB.set(0, 0, 1), tmpC.fromArray(normal).normalize());
    mesh.visible = delay <= 0;
    const drift = velocity ? new THREE.Vector3().fromArray(velocity) : undefined;
    return {
        object: mesh, life: life + delay, maxLife: life + delay,
        update(dt) { uniforms.time.value += dt; mesh.visible = uniforms.time.value >= 0; if (drift) mesh.position.addScaledVector(drift, dt); },
        dispose() { mesh.removeFromParent(); geometry.dispose(); mesh.material.dispose(); },
    };
}

// Branching electric arcs around a point (ion strikes).
export function createArcBurst({ position = [0, 0, 0], branches = 6, segments = 7, radius = 4, life = .38, hex = 0x6be6ff, opacity = 1, strikes = 24, random = Math.random, around }) {
    const count = branches * segments;
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(QUAD_INDEX);
    geometry.setAttribute('corner', new THREE.Float32BufferAttribute(QUAD_CORNERS, 2));
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    const dirs = new Float32Array(count * 3), arcs = new Float32Array(count * 4);
    for (let b = 0; b < branches; b++) {
        const z = random() * 2 - 1, a = random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
        tmpA.set(Math.cos(a) * r, Math.sin(a) * r, z);
        // Bias branches out of the struck surface when its normal is known.
        if (around) { tmpB.fromArray(around); if (tmpA.dot(tmpB) < 0) tmpA.addScaledVector(tmpB, -2 * tmpA.dot(tmpB)); }
        const reach = .55 + random() * .45, seed = random() * 100;
        for (let s = 0; s < segments; s++) {
            const i = b * segments + s;
            dirs.set([tmpA.x, tmpA.y, tmpA.z], i * 3);
            arcs.set([s, segments, seed, reach], i * 4);
        }
    }
    geometry.setAttribute('dir', new THREE.InstancedBufferAttribute(dirs, 3));
    geometry.setAttribute('arc', new THREE.InstancedBufferAttribute(arcs, 4));
    geometry.instanceCount = count;
    const uniforms = { time: { value: 0 }, life: { value: life }, radius: { value: radius }, strikes: { value: strikes }, color: { value: color(hex) }, opacity: { value: opacity } };
    const mesh = new THREE.Mesh(geometry, material('arc', uniforms));
    mesh.frustumCulled = false; mesh.raycast = () => undefined;
    mesh.position.fromArray(position);
    return {
        object: mesh, life, maxLife: life,
        update(dt) { uniforms.time.value += dt; },
        dispose() { mesh.removeFromParent(); geometry.dispose(); mesh.material.dispose(); },
    };
}

// Directions in a cone around `axis` (unit [x,y,z]); spread is the cone's
// half-angle in radians. Used for spall and deflection sprays.
export function coneDirections(axis, spread) {
    const a = new THREE.Vector3().fromArray(axis).normalize();
    const u = new THREE.Vector3().crossVectors(a, Math.abs(a.y) < .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const v = new THREE.Vector3().crossVectors(a, u);
    return (i, out, random) => {
        const angle = Math.acos(1 - random() * (1 - Math.cos(spread))), turn = random() * Math.PI * 2;
        out.copy(a).multiplyScalar(Math.cos(angle)).addScaledVector(u, Math.sin(angle) * Math.cos(turn)).addScaledVector(v, Math.sin(angle) * Math.sin(turn));
    };
}
