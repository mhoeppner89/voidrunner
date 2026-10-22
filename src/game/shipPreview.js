import {FLEET_EQUIPMENT,equipmentHullId,droneDock} from './fleetEquipmentData.js';
import {applyFleetPaint} from './fleetPaint.js';
import {fleetPaintPath,resolveFleetPaint} from './fleetPaintCatalog.js';
import {warmCustomPaint} from './customShipPaint.js';
import {normalizePaintDesign} from './paintDesign.js';
import * as THREE from 'three';
import { createVoxelShipModel, paletteForFaction } from './voxelModels.js';
import { loadGlb } from './glbLoader.js';
import { GLB_SHIP_CONFIG } from './render.js';
import { FrameBudget } from './frameBudget.js';
import { TURRET_LAYOUTS } from './turretLayouts.js';
import { createTurretModel, paintFrigateTurret } from './turretModels.js';
import {pixelRenderSize} from './retroDisplay.js';
import {createPixelResolveMaterial,createPixelSceneTarget,pixelTargetSamples,bindPixelResolve} from './pixelResolve.js';
import {stabilizeMaterialNormals} from './materialNormals.js';

// A bounding sphere fits every turntable angle, including wide hulls on a
// narrow card. Keep a little margin for turrets and the perspective near side.
export const previewCameraDistance = (radius, fov, aspect) => {
    const verticalHalf = THREE.MathUtils.degToRad(fov * .5);
    const horizontalHalf = Math.atan(Math.tan(verticalHalf) * Math.max(aspect, .0001));
    return Math.max(radius, .01) * 1.08 / Math.sin(Math.min(verticalHalf, horizontalHalf));
};

// A lightweight turntable renderer for the selected showroom hull. The old
// card grid created several small WebGL contexts; the broker now keeps one
// large preview alive and disposes it when the market re-renders or the player
// launches. A voxel hull renders immediately, then the flight GLB swaps in.
export class ShipPreview {
    constructor(container, variant, options={}) {
        this.container = container;
        this.paintPreview = !!options.paintPreview;
        this.options=options;this.dirty=true;this.paintGeneration=0;
        this.variant = variant;
        this.disposed = false;
        this.visible = true;
        this.frameBudget = new FrameBudget();
        const touchDevice = this.touchDevice = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
        this.motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
        this.turntable=!this.paintPreview||container.hasAttribute('data-repaint-preview');
        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: true,
            powerPreference: touchDevice ? 'low-power' : 'default',
            depth: false,
            stencil: false,
        });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.NeutralToneMapping;
        this.renderer.toneMappingExposure = 1.18;
        this.renderer.setPixelRatio(1);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.domElement.className = 'ship-preview-canvas';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.imageRendering = 'pixelated';
        this.renderer.domElement.setAttribute('aria-hidden', 'true');
        container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        // The same linear-HDR resolve as spaceflight, preserving alpha over
        // the dock artwork. One bounded pixel grid, without blur or grading.
        this.pixelTarget=createPixelSceneTarget(1,1,touchDevice?0:pixelTargetSamples(this.renderer));
        this.pixelFinish=createPixelResolveMaterial({preserveAlpha:true});
        this.pixelQuad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.pixelFinish);
        this.pixelQuad.frustumCulled=false;this.pixelCamera=new THREE.Camera();
        this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 1000);
        this.scene.add(this.camera);
        this.createLighting();
        this.scene.environment = this.createEnvironment();

        // The voxel hull is an instant placeholder: it keeps the card from
        // flashing empty while the GLB fetch is in flight, exactly like the
        // flight scene's voxel-until-GLB path.
        const placeholder = createVoxelShipModel(variant, paletteForFaction('player'));
        this.pivot = new THREE.Group();
        this.model = placeholder.group;
        this.pivot.add(this.model);
        this.scene.add(this.pivot);
        this.frameModel();

        // Swap in the real hull once it loads; it carries the same baked yaw +
        // scale the flight scene uses, so the showroom matches the ship you fly.
        loadPreviewGlb(variant,options).then((glb) => {
            if (this.disposed) {
                if (glb)
                    disposeObject(glb);
                return;
            }
            if (!glb)
                return; // load failed; keep the voxel placeholder
            this.pivot.remove(this.model);
            disposeObject(this.model);
            this.model = glb;
            this.model.traverse(n=>{if(!n.isMesh)return;for(const m of Array.isArray(n.material)?n.material:[n.material]){
                stabilizeMaterialNormals(m);
                for(const v of Object.values(m))if(v?.isTexture){v.magFilter=THREE.NearestFilter;v.minFilter=THREE.LinearMipmapLinearFilter;v.anisotropy=2;}
            }});
            this.pivot.add(glb);
            this.frameModel();
            this.dirty=true;
            if(this.paintPreview)void this.setPaint(this.options.paint??'original');
        });

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(container);
        if (typeof IntersectionObserver === 'function') {
            this.visibilityObserver = new IntersectionObserver(entries => {
                this.visible = entries.some(entry => entry.isIntersecting);
                this.frameBudget.reset();
            });
            this.visibilityObserver.observe(container);
        }
        this.resize();
        const canvas=this.renderer.domElement;canvas.style.touchAction='none';
        canvas.onpointerdown=e=>{if(!this.turntable||e.button!==0)return;canvas.setPointerCapture(e.pointerId);this.drag=[e.clientX,e.clientY];};
        const endDrag=()=>{if(this.drag)this.rotateAfter=performance.now()+2000;this.drag=null;};
        canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=endDrag;
        canvas.onpointermove=e=>{if(!this.drag)return;this.pivot.rotation.y+=(e.clientX-this.drag[0])*.009;this.pivot.rotation.x=THREE.MathUtils.clamp(this.pivot.rotation.x+(e.clientY-this.drag[1])*.008,-1.5,1.5);this.drag=[e.clientX,e.clientY];this.dirty=true;};
        this.rafId = requestAnimationFrame(this.tick);
    }
    createLighting() {
        // Shared inspection light: factory and custom finishes have the same
        // colour response in the broker and repaint service.
        this.scene.add(new THREE.HemisphereLight(0xe8f2ff,0x465566,2.4));
        this.scene.add(new THREE.AmbientLight(0xffffff,1.0));
        const sun = new THREE.DirectionalLight(0xffffff,3.0);
        sun.position.set(-0.45, 0.18, 1.0).normalize();
        this.scene.add(sun);
        const rim = new THREE.DirectionalLight(0x66b9ff, 1.4);
        rim.position.set(0.58, -0.24, -0.78).normalize();
        this.scene.add(rim);
    }
    createEnvironment() {
        // A painterly horizon gradient so the glossy clearcoated hulls reflect
        // color instead of black. Kept simpler than the flight scene's IBL.
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        const gradient = context.createLinearGradient(0, 0, 0, 128);
        gradient.addColorStop(0, '#9fbbd2');
        gradient.addColorStop(.5, '#556d83');
        gradient.addColorStop(1, '#172330');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 256, 128);
        const texture = new THREE.CanvasTexture(canvas);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }
    frameModel() {
        // Center the model on the pivot origin, then pull the camera back to a
        // 3/4 top-front showroom angle that fits the whole hull in frame.
        const rotation = this.pivot.quaternion.clone();
        this.pivot.quaternion.identity();
        const box = new THREE.Box3().setFromObject(this.pivot);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        this.model.position.sub(center);
        this.modelRadius = size.length() * 0.5;
        // Bound actual surfaces, not the empty corners of a fighter's box.
        // This fixed sphere fits every inspection angle without shrinking a
        // thin swept hull unnecessarily. Cache points for the review tool too.
        this.pivot.updateMatrixWorld(true);const points=[],point=new THREE.Vector3();let radiusSq=0;
        this.pivot.traverse(n=>{const p=n.geometry?.attributes.position;if(!n.isMesh||!p)return;for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(n.matrixWorld);points.push(point.x,point.y,point.z);radiusSq=Math.max(radiusSq,point.lengthSq());}});
        if(radiusSq>0)this.modelRadius=Math.sqrt(radiusSq);
        this.paintFitPositions=new Float32Array(points);
        this.pivot.quaternion.copy(rotation);
        this.updateCameraFraming();
    }
    updateCameraFraming() {
        const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
        const distance = previewCameraDistance(this.modelRadius ?? 1, this.camera.fov, aspect);
        const azimuth = Math.PI/3,elevation = Math.PI/6;
        this.camera.position.set(
            distance * Math.cos(elevation) * Math.sin(azimuth),
            distance * Math.sin(elevation),
            -distance * Math.cos(elevation) * Math.cos(azimuth),
        );
        this.camera.lookAt(0, 0, 0);
    }
    resize() {
        if (this.disposed)
            return;
        const width = Math.max(1, this.container.clientWidth);
        const height = Math.max(1, this.container.clientHeight);
        const scale=pixelRenderSize(window.innerWidth,window.innerHeight,this.touchDevice?720:960).scale;
        if(width===this.cssWidth&&height===this.cssHeight&&scale===this.pixelScale)return;
        this.cssWidth=width;this.cssHeight=height;this.pixelScale=scale;
        const w=Math.ceil(width/scale),h=Math.ceil(height/scale);
        this.renderer.setSize(w,h,false);this.pixelTarget.setSize(w,h);
        const canvas=this.renderer.domElement;canvas.style.width=`${w*scale}px`;canvas.style.height=`${h*scale}px`;canvas.dataset.pixelScale=String(scale);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.updateCameraFraming();
        this.dirty=true;
    }
    async setPaint(paint){
        this.options.paint=paint;
        const own=++this.paintGeneration;
        if(normalizePaintDesign(paint,equipmentHullId(this.variant)))await warmCustomPaint(equipmentHullId(this.variant));
        if(this.disposed||own!==this.paintGeneration||!this.model?.paintSources)return;
        applyFleetPaint(this.model,equipmentHullId(this.variant),{id:'player',faction:'player',livery:paint});
        this.model.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])stabilizeMaterialNormals(m);});
        this.dirty=true;
    }
    attach(container){
        if(this.container!==container){
            this.resizeObserver.unobserve(this.container);this.visibilityObserver?.unobserve(this.container);
            this.container=container;container.append(this.renderer.domElement);
            this.turntable=!this.paintPreview||container.hasAttribute('data-repaint-preview');
            this.drag=null;
            this.resizeObserver.observe(container);this.visibilityObserver?.observe(container);this.visible=true;
        }
        this.resize();
    }
    tick = (now) => {
        if (this.disposed)
            return;
        if (this.visible && !document.hidden && this.container.isConnected) {
            const rotating=this.turntable&&!this.motionQuery.matches&&!this.drag&&now>=(this.rotateAfter??0);
            if(this.dirty||rotating){const dt=this.frameBudget.take(now,30);if(dt!==null){
                if(rotating)this.pivot.rotation.y+=dt*.5;
                this.render();this.dirty=false;
            }}else this.frameBudget.reset();
        }else this.frameBudget.reset();
        this.rafId = requestAnimationFrame(this.tick);
    };
    render(){
        this.renderer.setRenderTarget(this.pixelTarget);
        this.renderer.render(this.scene,this.camera);
        this.sceneDrawCalls=this.renderer.info.render.calls;
        bindPixelResolve(this.pixelFinish,this.pixelTarget.texture,this.pixelTarget,this.camera,this.renderer.toneMappingExposure);
        this.renderer.setRenderTarget(null);this.renderer.render(this.pixelQuad,this.pixelCamera);
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        cancelAnimationFrame(this.rafId);
        this.resizeObserver.disconnect();
        this.visibilityObserver?.disconnect();
        disposeObject(this.pivot);
        this.scene.environment?.dispose?.();
        this.pixelTarget.dispose();this.pixelFinish.dispose();this.pixelQuad.geometry.dispose();
        const canvas=this.renderer.domElement;
        canvas.onpointerdown=canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=canvas.onpointermove=null;
        this.renderer.dispose();
        // Mobile browsers limit live WebGL contexts. Releasing a discarded
        // preview immediately protects the long-lived concourse/flight views.
        this.renderer.forceContextLoss?.();
        this.renderer.domElement.remove();
    }
}
// Load one GLB hull for the showroom, baking in the same per-variant yaw and
// world scale the flight scene applies. Each preview owns its copy, so cards
// can be disposed independently (variants never repeat in a dock's stock).
export const loadPreviewGlb = async (variant,options={}) => {
 const config=GLB_SHIP_CONFIG[variant];if(!config)return null;
 const hullId=equipmentHullId(variant),hull=FLEET_EQUIPMENT[hullId];
 const entity={id:'player',faction:'player',livery:options.paint??'original'};
 const paint=resolveFleetPaint(hullId,entity);
 try {
  if(paint==='custom'||options.paintPreview)await warmCustomPaint(hullId);
  const model=await loadGlb(fleetPaintPath(hullId,paint)??config.path??`assets/models/ships/${config.file}`);
  model.rotation.y=config.yaw;model.scale.setScalar(config.scale*(config.baseScale??1));
  model.userData.paintHullRoot=true;
  const assembly=new THREE.Group();assembly.add(model);model.updateMatrixWorld(true);
  let armor;model.traverse(o=>{if(!armor&&o.material?.map&&!/glass|canopy|window/i.test(o.material.name))armor=o.material;});
  for(const [i,t]of (hull?.turrets??[]).entries()) {
   if(t.embedded||options.fit&&!options.fit.turrets?.[i])continue;
   const turret=createTurretModel(t.kind,t.size,t.pedestal??0,t.footprintScale??1);turret.name=`equipped-turret-${i}`;
   turret.position.fromArray(t.position);turret.quaternion.copy(equipmentRotation(t.normal));turret.scale.multiplyScalar(t.scale);
   if(hullId==='legionary'||hullId==='blade'&&Math.abs(t.normal[2])>.9)turret.userData.pitch.rotation.x=Math.PI/2;
   if(armor)paintFrigateTurret(turret,armor);assembly.add(turret);
  }
  applyFleetPaint(assembly,hullId,entity);
  // Only fitted, surviving stowed drones are shown on the owned ship.
  const bays=options.fit?.droneBays;
  if(bays)for(let bay=0;bay<bays.length;bay++)for(let slot=0;slot<bays[bay].unitIds.length;slot++) {
   const unit=options.fleet?.unitsById?.[bays[bay].unitIds[slot]];if(!unit||unit.hull<=0||unit.state!=='stowed')continue;
   const dock=droneDock(hullId,unit.type,bay,slot);if(!dock)continue;
   const drone=await loadGlb(`assets/models/drones/${unit.type==='mining'?'mining':'combat'}-drone.glb`);
   drone.scale.setScalar(1.15);drone.position.fromArray(dock.position);drone.quaternion.copy(equipmentRotation(dock.normal));
   if(unit.type==='repair')drone.traverse(o=>{if(o.isMesh)o.material.color.lerp(new THREE.Color(0x68ffb0),.25);});
   assembly.add(drone);
  }
  assembly.userData.livery=paint;return assembly;
 }catch(error){console.warn(`GLB hull ${variant} failed to load for the shipyard preview.`,error);return null;}
};
function equipmentRotation(normal) {
 const n=new THREE.Vector3(...normal).normalize(),z=new THREE.Vector3(0,0,1).addScaledVector(n,-n.z);
 if(z.lengthSq()<.01)z.set(1,0,0);z.normalize();const x=n.clone().cross(z).normalize();z.crossVectors(x,n);
 return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,n,z));
}
// Release the GPU resources (geometry, materials, textures) of one model
// subtree. Used both when a placeholder is swapped out and on final dispose.
export const disposeObject = (root) => {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    root.traverse((object) => {
        if(object.paintSources)for(const original of object.paintSources.values())for(const m of Array.isArray(original)?original:[original])if(m&&!m.userData.shared)materials.add(m);
        if (!(object instanceof THREE.Mesh))
            return;
        if (object.geometry && !object.geometry.userData.shared) geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
            if (material && !material.userData.shared) materials.add(material);
    });
    for (const material of materials)
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
};
