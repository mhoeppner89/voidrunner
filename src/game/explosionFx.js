import * as THREE from 'three';
import { seededRandom } from './random.js';

// Two batched draws per blast. All motion and cooling are GPU-driven; no
// per-frame particle allocations, dynamic lights, or postprocessing passes.
export function createShipExplosion(position, scale = 1) {
    const random = seededRandom(position.join(':') + ':blast');
    const root = new THREE.Group();
    root.position.fromArray(position);
    root.scale.setScalar(Math.max(.1, scale));
    const time = { value: 0 };
    // Capital destruction takes longer, with secondary hull sections igniting
    // after the first flash. Small ship timing stays unchanged.
    const capital = Math.max(0, Math.min(1, (scale - 3) / 9));
    const pace = { value: 1 + capital * 1.8 };
    const delay = capital * 3;
    const count = 14;
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0, 1,-1,0, 1,1,0, -1,1,0], 3));
    const drift = new Float32Array(count * 3), params = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const z = random()*2-1, a = random()*Math.PI*2, r = Math.sqrt(1-z*z);
        drift.set([Math.cos(a)*r, Math.sin(a)*r, z], i*3);
        params.set(i === 0 ? [0, 0, 0] : [1.8+random()*2, random()*19, random()*(.14+delay)], i*3);
    }
    geometry.setAttribute('drift', new THREE.InstancedBufferAttribute(drift, 3));
    geometry.setAttribute('params', new THREE.InstancedBufferAttribute(params, 3));
    geometry.instanceCount = count;
    const material = new THREE.ShaderMaterial({
        uniforms: { time, pace }, transparent: true, depthWrite: false,
        vertexShader: `
            attribute vec3 drift; attribute vec3 params; uniform float time; uniform float pace;
            varying vec2 blastUv; varying float age; varying float seed; varying float flash;
            void main() {
                blastUv=position.xy; age=max(0.,(time-params.z)/pace); seed=params.y;
                flash=1.-step(.1,params.x);
                if(flash>.5) age=time;
                float spread=1.-exp(-age*2.2);
                vec3 centre=drift*params.x*spread*2.2;
                vec4 view=modelViewMatrix*vec4(centre,1.);
                float radius=mix((.65+spread*2.8)*(0.85+params.x*.12), 2.+age*32., flash);
                float worldScale=length(modelMatrix[0].xyz);
                view.xy+=position.xy*radius*worldScale;
                gl_Position=projectionMatrix*view;
            }`,
        fragmentShader: `
            precision highp float;
            varying vec2 blastUv; varying float age; varying float seed; varying float flash;
            float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
            float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
                return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
            void main(){
                float r=length(blastUv);
                if(r>1.) discard;
                if(flash>.5){
                    float a=exp(-r*r*5.)*max(0.,1.-age/.22);
                    gl_FragColor=vec4(1.,.89,.65,a); return;
                }
                vec2 p=blastUv*3.8+seed;
                float n=noise(p+age*.23)*.6+noise(p*2.1-age*.31)*.28+noise(p*4.3)*.12;
                float density=smoothstep(.02,.55,1.-r+(n-.5)*.65);
                float heat=clamp(1.3-age*.9+(n-.5)*1.3-r*.3,0.,1.);
                vec3 smoke=vec3(.14,.12,.105)*(0.8+n*.7);
                vec3 fire=mix(vec3(.62,.075,.009),vec3(1.,.48,.055),smoothstep(.1,.65,heat));
                fire=mix(fire,vec3(1.,.94,.69),smoothstep(.7,1.,heat));
                vec3 color=mix(smoke,fire,smoothstep(.12,.55,heat));
                float fade=(1.-smoothstep(1.3,2.5,age))*smoothstep(0.,.08,age);
                gl_FragColor=vec4(color,density*fade*.86);
            }`,
    });
    const cloud = new THREE.Mesh(geometry, material);
    cloud.frustumCulled = false; cloud.raycast = () => undefined;
    root.add(cloud);
    const streakGeometry = new THREE.BufferGeometry();
    const vectors = new Float32Array(36*2*3), ends = new Float32Array(36*2);
    for(let i=0;i<36;i++) {
        const z=random()*2-1,a=random()*Math.PI*2,r=Math.sqrt(1-z*z),speed=8+random()*17;
        for(let end=0;end<2;end++) {vectors.set([Math.cos(a)*r*speed,Math.sin(a)*r*speed,z*speed],(i*2+end)*3);ends[i*2+end]=end;}
    }
    streakGeometry.setAttribute('position',new THREE.BufferAttribute(vectors,3));
    streakGeometry.setAttribute('tail',new THREE.BufferAttribute(ends,1));
    const streakMaterial=new THREE.ShaderMaterial({uniforms:{time,pace},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
        vertexShader:`attribute float tail; uniform float time; uniform float pace; varying float brightness;
            void main(){float age=max(0.,time/pace-tail*.055); float travel=(1.-exp(-age*.7))/.7;
                brightness=(1.-tail*.8)*pow(max(0.,1.-time/pace/1.65),1.5);
                gl_Position=projectionMatrix*modelViewMatrix*vec4(position*travel,1.);}`,
        fragmentShader:`varying float brightness; void main(){gl_FragColor=vec4(1.,.48,.09,brightness);}`});
    const streaks=new THREE.LineSegments(streakGeometry,streakMaterial);
    streaks.frustumCulled=false;streaks.raycast=()=>undefined;root.add(streaks);
    const duration = 2.65 * pace.value + delay;
    return {object:root,life:duration,maxLife:duration,update(dt){time.value+=dt;}};
}

// Actual opaque armor shards, separate from the short-lived glowing trails.
export function createHullDebris(position, scale = 1, velocity = [0,0,0]) {
    const random=seededRandom(position.join(':')+':hull-shards');
    const root=new THREE.Group();root.position.fromArray(position);
    const inheritedVelocity=new THREE.Vector3().fromArray(velocity);
    const geometry=new THREE.BoxGeometry(1,1,1);
    const material=new THREE.MeshStandardMaterial({color:0xb1a89c,roughness:.87,metalness:.35});
    const chunks=new THREE.InstancedMesh(geometry,material,12);
    chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);chunks.frustumCulled=false;
    chunks.raycast=()=>undefined;root.add(chunks);
    const parts=[],matrix=new THREE.Object3D(),color=new THREE.Color();
    for(let i=0;i<12;i++) {
        const z=random()*2-1,a=random()*Math.PI*2,r=Math.sqrt(1-z*z),speed=(3+random()*8)*scale;
        parts.push({velocity:[Math.cos(a)*r*speed,Math.sin(a)*r*speed,z*speed],
            size:[(.3+random()*.65)*scale,(.07+random()*.16)*scale,(.25+random()*.6)*scale],
            spin:[random()*3-1.5,random()*3-1.5,random()*3-1.5]});
        color.setHex(i%3===0?0x7c4a27:i%3===1?0x687580:0xc1b69d);chunks.setColorAt(i,color);
    }
    let age=0;
    const effect={object:root,life:14,maxLife:14,update(dt){
        age+=dt;root.position.addScaledVector(inheritedVelocity,dt);const fade=Math.min(1,Math.max(0,(14-age)/3));
        for(let i=0;i<parts.length;i++) {const p=parts[i];
            matrix.position.set(p.velocity[0]*age,p.velocity[1]*age,p.velocity[2]*age);
            matrix.rotation.set(p.spin[0]*age,p.spin[1]*age,p.spin[2]*age);
            matrix.scale.set(p.size[0]*fade,p.size[1]*fade,p.size[2]*fade);matrix.updateMatrix();chunks.setMatrixAt(i,matrix.matrix);
        }chunks.instanceMatrix.needsUpdate=true;
    }};effect.update(0);return effect;
}
