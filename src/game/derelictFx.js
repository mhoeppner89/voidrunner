import * as THREE from 'three';
import {prepareSurfaceMeshIndex} from './surfaceMeshCandidates.js';
import {prepareMeshQueryIndex} from './meshQueries.js';

// Bake the already posed, stationary wreck once. Collision uses exactly the
// drawn triangles, including torn caps and structural ribs, never a hull box.
export function derelictSurfaceObstacles(root,id){
    root.updateWorldMatrix(true,true);
    const obstacles=[],point=new THREE.Vector3(),bounds=new THREE.Box3();
    root.traverseVisible(mesh=>{
        const position=mesh.geometry?.attributes.position;
        if(!mesh.isMesh||!position||!mesh.material?.isMeshStandardMaterial)return;
        bounds.copy(mesh.geometry.boundingBox??(mesh.geometry.computeBoundingBox(),mesh.geometry.boundingBox)).applyMatrix4(mesh.matrixWorld);
        const center=bounds.getCenter(new THREE.Vector3()),half=bounds.getSize(new THREE.Vector3()).multiplyScalar(.5);
        const matrix=mesh.matrixWorld.clone();matrix.elements[12]-=center.x;matrix.elements[13]-=center.y;matrix.elements[14]-=center.z;
        const vertices=new Float32Array(position.count*3);let radius=0;
        for(let i=0;i<position.count;i++){point.fromBufferAttribute(position,i).applyMatrix4(matrix);point.toArray(vertices,i*3);radius=Math.max(radius,point.length());}
        const indices=mesh.geometry.index?.array??Uint32Array.from({length:position.count},(_,i)=>i);
        prepareSurfaceMeshIndex(vertices,indices);prepareMeshQueryIndex(vertices,indices);
        obstacles.push({id:`${id}:surface:${obstacles.length}`,x:center.x,y:center.y,z:center.z,
            radius,collisionRadius:radius,losRadius:radius,minReach:0,surfaceOnly:true,shape:'wreck-mesh',
            meshVerts:vertices,meshIndices:indices,box:{hx:half.x,hy:half.y,hz:half.z,qx:0,qy:0,qz:0,qw:1}});
    });
    return obstacles;
}

// Persistent leaking fuel/coolant at three torn faces. One batched GPU draw,
// with moving, cooling puffs; no lights, texture uploads or per-frame particles.
export function createDerelictVents(root,sections){
    root.updateWorldMatrix(true,true);
    const inverse=root.matrixWorld.clone().invert(),anchors=[],normal=new THREE.Vector3(),point=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    for(const section of sections){
        const mesh=section.group.children.find(m=>m.userData.wreckCutFace);
        if(!mesh)continue;
        const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;
        let best=-1,triangle=0;
        for(let i=0;i+2<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);const area=b.sub(a).cross(c.sub(a)).lengthSq();if(area>best){best=area;triangle=i;}}
        const matrix=new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld),normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix);
        point.fromBufferAttribute(p,triangle).add(a.fromBufferAttribute(p,triangle+1)).add(b.fromBufferAttribute(p,triangle+2)).multiplyScalar(1/3).applyMatrix4(matrix);
        normal.fromBufferAttribute(n,triangle).applyMatrix3(normalMatrix).normalize();
        anchors.push({position:point.clone().addScaledVector(normal,.6),normal:normal.clone()});
        if(anchors.length===3)break;
    }
    const count=anchors.length*6,geometry=new THREE.InstancedBufferGeometry();
    geometry.setIndex([0,1,2,0,2,3]);geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
    const origins=new Float32Array(count*3),directions=new Float32Array(count*3),phases=new Float32Array(count),flames=new Float32Array(count);
    for(let i=0;i<count;i++){anchors[Math.floor(i/6)].position.toArray(origins,i*3);anchors[Math.floor(i/6)].normal.toArray(directions,i*3);phases[i]=(i%6)/2+(Math.floor(i/6)*.37);flames[i]=i%6===0?1:0;}
    geometry.setAttribute('origin',new THREE.InstancedBufferAttribute(origins,3));geometry.setAttribute('direction',new THREE.InstancedBufferAttribute(directions,3));geometry.setAttribute('phase',new THREE.InstancedBufferAttribute(phases,1));geometry.setAttribute('flame',new THREE.InstancedBufferAttribute(flames,1));geometry.instanceCount=count;
    const time={value:0},material=new THREE.ShaderMaterial({uniforms:{time},transparent:true,depthWrite:false,
        vertexShader:`attribute vec3 origin;attribute vec3 direction;attribute float phase;attribute float flame;uniform float time;varying vec2 puffUv;varying float age;varying float seed;
        void main(){age=mix(mod(time+phase,3.),.12+.035*sin(time*11.+phase*7.),flame);seed=phase;puffUv=position.xy;
            vec3 centre=origin+direction*age*(3.+phase*.4);centre+=vec3(sin(phase*4.+age),cos(phase*3.+age*.7),sin(age*.9))*age*.65;
            vec4 view=modelViewMatrix*vec4(centre,1.);view.xy+=position.xy*(.8+age*2.+flame*1.1)*length(modelMatrix[0].xyz);gl_Position=projectionMatrix*view;}`,
        fragmentShader:`precision highp float;varying vec2 puffUv;varying float age;varying float seed;
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec4 h=fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1,0),vec2(127.1,311.7)),dot(i+vec2(0,1),vec2(127.1,311.7)),dot(i+vec2(1,1),vec2(127.1,311.7))))*43758.5453);return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);}
        void main(){float r=length(puffUv);if(r>1.)discard;float n=noise(puffUv*3.+seed+age*.5);
            float shape=1.-smoothstep(.1,1.,r+(n-.5)*.35),hot=(1.-smoothstep(.18,.9,age))*(.7+n*.3);
            vec3 smoke=mix(vec3(.055,.065,.075),vec3(.3,.31,.32),n),fire=mix(vec3(.9,.14,.015),vec3(1.,.65,.13),n);
            float fade=smoothstep(0.,.08,age)*(1.-smoothstep(1.5,3.,age));gl_FragColor=vec4(mix(smoke,fire,hot),shape*fade*(.48+hot*.4));}`});
    const object=new THREE.Mesh(geometry,material);object.name='Kestrel Nine leaking fuel and smoke';object.frustumCulled=false;object.raycast=()=>undefined;root.add(object);
    return {object,anchors,update(dt){time.value=(time.value+dt)%300;},dispose(){object.removeFromParent();geometry.dispose();material.dispose();}};
}
