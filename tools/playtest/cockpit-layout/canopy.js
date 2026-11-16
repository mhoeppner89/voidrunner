import * as T from 'three';
import {loadGlb} from '/src/game/glbLoader.js';

// Native asset coordinates: +X forward, +Y up. This is a proposed eye point,
// not an authored seat marker. The review exposes it rather than implying an
// exact interior exists in the exterior-only hull asset.
export const PILOT_EYE=[.785,.08,0];
export const PILOT_LOOK=[1.785,.12,0];
export const PILOT_FOV=64;
const near=.001;

function clipNear(points){
    const result=[];
    for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length],insideA=a.z<=-near,insideB=b.z<=-near;
        if(insideA)result.push(a);
        if(insideA!==insideB){const t=(-near-a.z)/(b.z-a.z);result.push(a.clone().lerp(b,t));}
    }
    return result;
}
function projected(point,camera){
    const p=point.clone().applyMatrix4(camera.projectionMatrix);
    return `${((p.x+1)*800).toFixed(2)},${((1-p.y)*450).toFixed(2)}`;
}

export async function createCanopy(){
    const model=await loadGlb('/assets/models/ships/wayfarer.glb');
    model.updateMatrixWorld(true);
    const triangles=[],edges=[];
    model.traverse(mesh=>{
        if(!mesh.isMesh||!mesh.material.name.includes('Canopy'))return;
        const position=mesh.geometry.attributes.position,index=mesh.geometry.index;
        const read=i=>new T.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
        for(let i=0;i<(index?.count??position.count);i+=3){
            const points=[0,1,2].map(k=>read(index?index.getX(i+k):i+k));
            // The same material also coats a tiny nose sensor; it is not a window.
            if(points.every(p=>p.x<.96))triangles.push(points);
        }
        const outline=new T.EdgesGeometry(mesh.geometry,25),attr=outline.attributes.position;
        for(let i=0;i<attr.count;i+=2){
            const a=new T.Vector3().fromBufferAttribute(attr,i).applyMatrix4(mesh.matrixWorld),b=new T.Vector3().fromBufferAttribute(attr,i+1).applyMatrix4(mesh.matrixWorld);
            if(a.x<.96&&b.x<.96&&a.distanceTo(b)>.025)edges.push([a,b]);
        }
        outline.dispose();
    });
    const camera=new T.PerspectiveCamera(PILOT_FOV,16/9,near,10);
    camera.position.fromArray(PILOT_EYE);camera.lookAt(...PILOT_LOOK);camera.updateMatrixWorld(true);
    let renderer,referenceScene,referenceCamera,yaw=.7,pitch=.38,distance=1.4,whole=false;
    const target=new T.Vector3(.79,.02,0);
    // Frame centre lines follow the roof/side pane seams. Their interior trim
    // width is deliberately independent of the exterior armour's thickness.
    const ribs=[
        [[.742,.131,-.052],[.944,.042,-.054]],
        [[.742,.131,.052],[.944,.042,.054]],
        [[.824,.096,-.056],[.824,.096,.056]],
        [[.882,.069,-.058],[.882,.069,.058]],
        [[.882,.069,-.058],[.882,.018,-.114]],
        [[.882,.069,.058],[.882,.018,.114]],
    ].map(line=>line.map(p=>new T.Vector3(...p)));
    function projectLines(lines){return lines.map(line=>{
        let [a,b]=line.map(p=>p.clone().applyMatrix4(camera.matrixWorldInverse));
        if(a.z>-near&&b.z>-near)return '';
        if(a.z>-near)a.lerp(b,(-near-a.z)/(b.z-a.z));
        if(b.z>-near)b.lerp(a,(-near-b.z)/(a.z-b.z));
        return `<polyline points="${projected(a,camera)} ${projected(b,camera)}"/>`;
    }).join('');}
    function project(aspect){
        camera.aspect=aspect;camera.updateProjectionMatrix();
        const windows=triangles.map(triangle=>clipNear(triangle.map(p=>p.clone().applyMatrix4(camera.matrixWorldInverse))))
            .filter(p=>p.length>=3).map(points=>`<polygon points="${points.map(p=>projected(p,camera)).join(' ')}"/>`).join('');
        document.querySelector('#apertures').innerHTML=windows;
        document.querySelector('#canopy-edges').innerHTML=projectLines(edges);
        document.querySelector('#canopy-frame').innerHTML=projectLines(ribs);
        return {triangles:triangles.length,eye:PILOT_EYE,fov:PILOT_FOV,aspect};
    }
    function renderReference(){
        if(!renderer||!document.querySelector('#model-dialog').open)return;
        const host=document.querySelector('#model-stage'),w=host.clientWidth,h=host.clientHeight;
        if(!w||!h)return;
        renderer.setSize(w,h,false);referenceCamera.aspect=w/h;referenceCamera.updateProjectionMatrix();
        target.set(whole?.15:.79,.02,0);
        referenceCamera.position.set(Math.cos(yaw)*Math.cos(pitch),Math.sin(pitch),Math.sin(yaw)*Math.cos(pitch)).multiplyScalar(distance).add(target);
        referenceCamera.lookAt(target);renderer.render(referenceScene,referenceCamera);
    }
    function showReference(){
        if(!renderer){
            const canvas=document.createElement('canvas');document.querySelector('#model-stage').append(canvas);
            renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;
            referenceScene=new T.Scene();referenceScene.background=new T.Color(0x091521);
            referenceScene.add(new T.HemisphereLight(0xbbd5ec,0x24303b,2.5));
            const sun=new T.DirectionalLight(0xffefcc,3);sun.position.set(3,4,2);referenceScene.add(sun);
            const shown=model.clone(true);shown.traverse(n=>{if(n.isMesh&&n.material.name.includes('Canopy'))n.material=new T.MeshStandardMaterial({color:0x43becf,roughness:.6,metalness:.2});});referenceScene.add(shown);
            const eye=new T.Mesh(new T.SphereGeometry(.008,12,8),new T.MeshBasicMaterial({color:0xffcf75,depthTest:false}));eye.position.fromArray(PILOT_EYE);eye.renderOrder=10;referenceScene.add(eye);
            const aim=new T.ArrowHelper(new T.Vector3().fromArray(PILOT_LOOK).sub(eye.position).normalize(),eye.position,.15,0xffcf75,.022,.012);aim.traverse(n=>{if(n.material){n.material.depthTest=false;n.renderOrder=10;}});referenceScene.add(aim);
            referenceCamera=new T.PerspectiveCamera(40,1,.001,20);
            let pointer;
            canvas.addEventListener('pointerdown',e=>{pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
            canvas.addEventListener('pointermove',e=>{if(pointer?.id!==e.pointerId)return;yaw-=(e.clientX-pointer.x)*.007;pitch=Math.max(-1.3,Math.min(1.3,pitch+(e.clientY-pointer.y)*.007));pointer.x=e.clientX;pointer.y=e.clientY;renderReference();});
            const release=()=>{pointer=undefined;};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
            canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(.28,Math.min(5,distance*Math.exp(e.deltaY*.001)));renderReference();},{passive:false});
        }
        renderReference();
    }
    function setReferenceView(value){whole=value;distance=whole?3.3:.75;yaw=.7;pitch=.45;renderReference();}
    return {project,showReference,renderReference,setReferenceView,model,camera};
}
