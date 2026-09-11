import * as THREE from 'three';

// One reusable draw for nearby grains and eight short-lived canopy contacts.
export function createRingParticles(ringTexture) {
    const grains = 256, contacts = 8, count = grains + contacts, span = 64;
    const positions = new Float32Array(count * 3);
    const appearance = new Float32Array(count * 2);
    const seeds = new Float32Array(grains * 3);
    const life = new Float32Array(contacts);
    let seed = 31791, nextContact = 0, travelled = 0, initialized = false;
    const random = () => ((seed = (Math.imul(seed,1664525)+1013904223) >>> 0) / 4294967296);
    for (let i=0;i<seeds.length;i++) seeds[i]=random()*span;
    const image = ringTexture.image;
    const pixels = image.getContext('2d').getImageData(0,Math.floor(image.height/2),image.width,1).data;
    const previous = new THREE.Vector3();
    const motion = new THREE.Vector3(), inverseCamera = new THREE.Quaternion();
    let activeContacts = 0;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('appearance',new THREE.BufferAttribute(appearance,2).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
        transparent:true, depthTest:false, depthWrite:false, toneMapped:false,
        uniforms:{density:{value:0},pixelScale:{value:300},resolution:{value:new THREE.Vector2()},sceneDepth:{value:null},cameraMotion:{value:new THREE.Vector3()},streak:{value:0}},
        vertexShader:`
            attribute vec2 appearance;
            uniform float density, pixelScale, streak;
            uniform vec3 cameraMotion;
            varying vec2 streakDirection;
            varying float elongation;
            varying float opacity, contact;
            void main() {
                contact = appearance.x;
                streakDirection = vec2(0.0,1.0);
                elongation = 1.0;
                if (contact > 0.5) {
                    gl_Position = vec4(position.xy,0.0,1.0);
                    gl_PointSize = 8.0 + 5.0*appearance.y;
                    opacity = appearance.y*0.65;
                } else {
                    vec4 p = modelViewMatrix*vec4(position,1.0);
                    float distanceToCamera = length(p.xyz);
                    opacity = sqrt(density)*0.90*smoothstep(0.7,2.0,distanceToCamera)
                        *(1.0-smoothstep(22.0,30.0,distanceToCamera));
                    vec2 projectedMotion = -cameraMotion.xy*max(0.1,-p.z)-p.xy*cameraMotion.z;
                    float motionLength = length(projectedMotion);
                    if (motionLength>0.0001) streakDirection = projectedMotion/motionLength;
                    elongation = mix(1.0,2.8,streak);
                    gl_PointSize = clamp(pixelScale*0.35/max(1.0,-p.z),2.0,5.0)*elongation;
                    gl_Position = projectionMatrix*p;
                }
            }`,
        fragmentShader:`
            uniform sampler2D sceneDepth;
            uniform vec2 resolution;
            varying float opacity, contact;
            varying vec2 streakDirection;
            varying float elongation;
            void main() {
                if (contact < 0.5 && gl_FragCoord.z > texture2D(sceneDepth,gl_FragCoord.xy/resolution).x + 0.000001) discard;
                vec2 p = (gl_PointCoord-0.5)*2.0;
                vec2 shaped = vec2(dot(p,streakDirection),dot(p,vec2(-streakDirection.y,streakDirection.x))*elongation);
                float shape = 1.0-smoothstep(0.25,1.0,length(shaped));
                float alpha = opacity*shape;
                if (alpha<0.005) discard;
                gl_FragColor = vec4(1.30,1.45,1.55,alpha);
            }`,
    });
    const mesh = new THREE.Points(geometry,material);
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    const smooth = (a,b,x) => {const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
    const wrap = x => ((x%span)+span)%span-span/2;
    return {
        mesh,
        diagnostics() { return { density: material.uniforms.density.value, activeContacts, visible: mesh.visible }; },
        update(camera,localCamera,dt,enabled,sceneTarget) {
            const distance = initialized ? camera.position.distanceTo(previous) : 0;
            motion.subVectors(camera.position,previous);
            previous.copy(camera.position); initialized=true;
            const validMotion = dt>0 && dt<0.2 && distance<1000;
            inverseCamera.copy(camera.quaternion).invert();
            if (validMotion) motion.divideScalar(dt).applyQuaternion(inverseCamera);
            else motion.set(0,0,0);
            material.uniforms.cameraMotion.value.copy(motion);
            material.uniforms.streak.value = smooth(3,45,motion.length());
            const radial = (Math.hypot(localCamera.x,localCamera.y)-1.3)/1.44;
            const band = radial>0 && radial<1 ? pixels[Math.min(image.width-1,Math.floor(radial*image.width))*4+3]/255 : 0;
            const density = enabled ? band*(1-smooth(.0004,.004,Math.abs(localCamera.z)))
                *smooth(0,.035,radial)*(1-smooth(.955,1,radial)) : 0;
            if (!enabled || distance>=1000) {life.fill(0);travelled=0;}
            if (validMotion && density>0 && distance/dt>3) {
                travelled += Math.min(distance,dt*120)*density;
                if (travelled>16) {
                    travelled %= 16;
                    life[nextContact]=0.55;
                    positions[(grains+nextContact)*3]=(random()-.5)*1.5;
                    positions[(grains+nextContact)*3+1]=-.25+random()*.95;
                    nextContact=(nextContact+1)%contacts;
                }
            } else if (density===0) travelled=0;
            activeContacts=0;
            for(let i=0;i<contacts;i++) {
                if(validMotion)life[i]=Math.max(0,life[i]-dt);
                appearance[(grains+i)*2]=1;
                appearance[(grains+i)*2+1]=life[i]/.55;
                if(life[i]>0)activeContacts++;
            }
            material.uniforms.density.value=density;
            mesh.visible = density>.001 || activeContacts>0;
            if(!mesh.visible)return false;
            mesh.position.copy(camera.position);
            for(let i=0;i<grains;i++) {
                positions[i*3]=wrap(seeds[i*3]-camera.position.x);
                positions[i*3+1]=wrap(seeds[i*3+1]-camera.position.y);
                positions[i*3+2]=wrap(seeds[i*3+2]-camera.position.z);
            }
            geometry.attributes.position.needsUpdate=true;
            geometry.attributes.appearance.needsUpdate=true;
            material.uniforms.pixelScale.value=sceneTarget.height*.5;
            material.uniforms.resolution.value.set(sceneTarget.width,sceneTarget.height);
            material.uniforms.sceneDepth.value=sceneTarget.depthTexture;
            return true;
        },
        dispose(){geometry.dispose();material.dispose();},
    };
}
