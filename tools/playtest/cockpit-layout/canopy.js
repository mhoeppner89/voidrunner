import * as T from 'three';
import {loadGlb} from '/src/game/glbLoader.js';

// Hull-native coordinates, inspected per hull; eye/look set the forward axis.
// Eye points are proposals,
// not authored seats. The Mercury bow follows the GLB's x=.27 glazing ring.
const views={
    wayfarer:{eye:[.785,.08,0],look:[1.785,.12,0],fov:64,target:[.79,.02,0],kx:1,ky:1,
        ribs:[[[.742,.131,-.052],[.944,.042,-.054]],[[.742,.131,.052],[.944,.042,.054]],[[.824,.096,-.056],[.824,.096,.056]],[[.882,.069,-.058],[.882,.069,.058]],[[.882,.069,-.058],[.882,.018,-.114]],[[.882,.069,.058],[.882,.018,.114]]]},
    talon:{eye:[.15,-.03,0],look:[1.15,-.03,0],fov:64,target:[.25,-.015,0],kx:2.6,ky:1,
        ribs:[[[.27,-.031,-.051],[.27,-.0046,-.0471],[.27,.0178,-.0361],[.27,.0327,-.0195],[.27,.038,0],[.27,.0327,.0195],[.27,.0178,.0361],[.27,-.0046,.0471],[.27,-.031,.051]]]},

};
views.wayfarer.windowMaxX=.96;
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

export async function createCanopy(shipId='wayfarer'){
    const spec=views[shipId]??(['scrapper','speedster','demon','mule','prospector','legionary','andromeda','torsas'].includes(shipId)?(await import(`./hulls/${shipId}.js`)).default:undefined);
    if(!spec)throw new Error(`No canopy survey for ${shipId}`);
    const {eye:PILOT_EYE,look:PILOT_LOOK,fov:PILOT_FOV}=spec;
    const model=await loadGlb(`/assets/models/ships/${shipId}.glb`);
    model.updateMatrixWorld(true);
    const triangles=(spec.glassTriangles??[]).map(face=>face.map(p=>new T.Vector3(...p))),edges=[];
    const inWindow=p=>p.x<(spec.windowMaxX??Infinity)&&p.x>(spec.windowMinX??-Infinity)
        &&(!spec.windowBounds||[p.x,p.y,p.z].every((v,i)=>v>=spec.windowBounds.min[i]&&v<=spec.windowBounds.max[i]));
    model.traverse(mesh=>{
        if(!mesh.isMesh||spec.glassTriangles)return;
        const material=mesh.material?.name??'';
        if(spec.glassMaterials?!spec.glassMaterials.includes(material):!/^VR_Canopy/i.test(material))return;
        const position=mesh.geometry.attributes.position,index=mesh.geometry.index,uv=mesh.geometry.attributes.uv;
        const read=i=>new T.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
        for(let i=0;i<(index?.count??position.count);i+=3){
            const indices=[0,1,2].map(k=>index?index.getX(i+k):i+k);
            if(spec.glassUvBounds){
                const [u0,v0,u1,v1]=spec.glassUvBounds,eps=1e-6;
                if(!uv||!indices.every(n=>uv.getX(n)>=u0-eps&&uv.getX(n)<=u1+eps&&uv.getY(n)>=v0-eps&&uv.getY(n)<=v1+eps))continue;
            }
            const points=indices.map(read);
            // A shared material/atlas may also coat a sensor or the armor.
            if(points.every(inWindow))triangles.push(points);
        }
    });
    // Derive guide edges from the selected glass, never the full packed hull.
    const glassGeometry=new T.BufferGeometry();glassGeometry.setAttribute('position',new T.Float32BufferAttribute(triangles.flatMap(face=>face.flatMap(p=>p.toArray())),3));
    glassGeometry.computeVertexNormals();
    const outline=new T.EdgesGeometry(glassGeometry,25),attr=outline.attributes.position;
    for(let i=0;i<attr.count;i+=2){const a=new T.Vector3().fromBufferAttribute(attr,i),b=new T.Vector3().fromBufferAttribute(attr,i+1);if(a.distanceTo(b)>.025)edges.push([a,b]);}
    outline.dispose();
    const camera=new T.PerspectiveCamera(PILOT_FOV,16/9,near,10);
    camera.position.fromArray(PILOT_EYE);camera.lookAt(...PILOT_LOOK);camera.updateMatrixWorld(true);
    let renderer,referenceScene,referenceCamera,yaw=.7,pitch=.38,distance=1.4,whole=false;
    const target=new T.Vector3(...spec.target);
    const ribs=spec.ribs.map(line=>line.map(p=>new T.Vector3(...p)));
    function projectLines(lines){
        return lines.flatMap(line=>{
            const pieces=[];
            for(let i=1;i<line.length;i++){
                let [a,b]=[line[i-1],line[i]].map(p=>p.clone().applyMatrix4(camera.matrixWorldInverse));
                if(a.z>-near&&b.z>-near)continue;
                if(a.z>-near)a.lerp(b,(-near-a.z)/(b.z-a.z));
                if(b.z>-near)b.lerp(a,(-near-b.z)/(a.z-b.z));
                pieces.push([a,b].map(p=>{const q=p.clone().applyMatrix4(camera.projectionMatrix);return [800+q.x*800*spec.kx,450-q.y*450*spec.ky];}));
            }
            return pieces;
        });
    }
    function project(aspect){
        // The structural plate uses the same authored aspect as the approved
        // starter frame. Resizing cannot move ribs relative to the monitors.
        camera.aspect=1851/850;camera.updateProjectionMatrix();
        const windows=triangles.map(triangle=>clipNear(triangle.map(p=>p.clone().applyMatrix4(camera.matrixWorldInverse))))
            .filter(p=>p.length>=3).map(points=>`<polygon points="${points.map(p=>projected(p,camera)).join(' ')}"/>`).join('');
        document.querySelector('#apertures').innerHTML=windows;
        const beams=projectLines(ribs);
        const markup=lines=>lines.map(line=>`<polyline points="${line.map(p=>p.join(',')).join(' ')}"/>`).join('');
        document.querySelector('#canopy-edges').innerHTML=markup(projectLines(edges));
        document.querySelector('#canopy-frame').innerHTML=markup(beams);
        return {shipId,triangles:triangles.length,eye:PILOT_EYE,look:PILOT_LOOK,fov:PILOT_FOV,aspect,authoredAspect:1851/850,interiorStretch:[spec.kx,spec.ky],beams};
    }
    function renderReference(){
        if(!renderer||!document.querySelector('#model-dialog').open)return;
        const host=document.querySelector('#model-stage'),w=host.clientWidth,h=host.clientHeight;
        if(!w||!h)return;
        renderer.setSize(w,h,false);referenceCamera.aspect=w/h;referenceCamera.updateProjectionMatrix();
        target.fromArray(whole?[.15,0,0]:spec.target);
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
            const shown=model.clone(true);referenceScene.add(shown);
            referenceScene.add(new T.Mesh(glassGeometry,new T.MeshStandardMaterial({color:0x43becf,roughness:.6,metalness:.2,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1})));
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
    function setReferenceView(value){whole=value;distance=whole?3.3:shipId==='prospector'?.95:shipId==='talon'?.65:.75;yaw=.7;pitch=.45;renderReference();}
    return {project,showReference,renderReference,setReferenceView,model,camera};
}
