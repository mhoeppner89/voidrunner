import * as THREE from 'three';

// Authored in gate-radius units: all solid structures remain outside the
// 0.515-radius crossing aperture. Static details are instanced by material so
// a detailed gate does not become hundreds of draw calls on a phone.
export function createJumpGateStructure(radius, accent) {
    const root = new THREE.Group();
    root.name = 'jump-gate-structure';
    root.scale.setScalar(radius);
    const makeMaterial = (color, metalness = 0.55, roughness = 0.72) => new THREE.MeshStandardMaterial({color, metalness, roughness, fog:false});
    const metal = makeMaterial(0x35424c, 0.72, 0.68);
    const armor = makeMaterial(0x80909a, 0.42, 0.76);
    const dark = makeMaterial(0x1a2730, 0.62, 0.76);
    const trim = makeMaterial(0xb09a75, 0.66, 0.65);
    const glass = new THREE.MeshStandardMaterial({color:0x315768, emissive:0x16333e, emissiveIntensity:0.38, metalness:0.35, roughness:0.5, fog:false});
    const lights = new THREE.MeshBasicMaterial({color:accent, fog:false});

    // An enclosed pressure-and-machinery annulus. Separate extruded sectors
    // have deep joints rather than coplanar overlays that shimmer at distance.
    const angle = Math.PI * 2 / 24;
    const shape = new THREE.Shape();
    const start = -angle * 0.475, end = angle * 0.475;
    for (let i=0; i<=4; i++) {
        const a = start + (end-start)*i/4, x=Math.cos(a)*0.755, y=Math.sin(a)*0.755;
        if (!i) shape.moveTo(x,y); else shape.lineTo(x,y);
    }
    for (let i=4; i>=0; i--) {
        const a=start+(end-start)*i/4;
        shape.lineTo(Math.cos(a)*0.557,Math.sin(a)*0.557);
    }
    shape.closePath();
    const sectorGeometry = new THREE.ExtrudeGeometry(shape,{depth:0.145, bevelEnabled:true, bevelSize:0.004, bevelThickness:0.004, bevelSegments:1, curveSegments:1});
    sectorGeometry.translate(0,0,-0.0725);
    const sectors = new THREE.InstancedMesh(sectorGeometry, metal, 24);
    const matrix = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3(), rot = new THREE.Quaternion();
    for(let i=0;i<24;i++) {
        rot.setFromAxisAngle(new THREE.Vector3(0,0,1), i*angle);
        matrix.compose(pos.set(0,0,0),rot,scale.set(1,1,1)); sectors.setMatrixAt(i,matrix);
    }
    sectors.name='armored-pressure-ring'; sectors.computeBoundingSphere(); root.add(sectors);

    const boxGeometry = new THREE.BoxGeometry(1,1,1);
    const groups = new Map([[armor,[]],[metal,[]],[dark,[]],[trim,[]],[glass,[]],[lights,[]]]);
    // Box local X is tangential, Y is radial, Z is the axis of travel.
    function part(material,a,r,z,w,h,d) {
        rot.setFromAxisAngle(new THREE.Vector3(0,0,1),a-Math.PI/2);
        matrix.compose(pos.set(Math.cos(a)*r,Math.sin(a)*r,z),rot,scale.set(w,h,d));
        groups.get(material).push(matrix.clone());
    }
    for(let i=0;i<24;i++) {
        const a=i*angle;
        // Paired armor caps and a raised transverse joint make each module
        // legible at both sides of the gate without z-fighting.
        for(const side of [-1,1]) {
            part(armor,a,0.659,side*0.083,0.115,0.158,0.014);
            part(dark,a,0.659,side*0.092,0.079,0.098,0.006);
            part(metal,a,0.659,side*0.097,0.067,0.086,0.004);
            part(trim,a,0.742,side*0.085,0.111,0.014,0.015);
            // Alternate between radiator banks, access hatches and occupied
            // service modules. Their fittings sit above their supporting
            // panel, so no two coplanar surfaces compete for depth.
            if(i%4===0) {
                for(let j=-2;j<=2;j++) part(armor,a,0.659+j*0.013,side*0.104,0.056,0.003,0.006);
            } else if(i%4===1) {
                part(armor,a,0.659,side*0.104,0.045,0.058,0.006);
                part(dark,a,0.659,side*0.109,0.033,0.044,0.004);
                part(trim,a-0.022,0.659,side*0.112,0.004,0.022,0.005);
                part(lights,a+0.02,0.685,side*0.112,0.004,0.004,0.005);
            } else if(i%4===2) {
                for(let j=-2;j<=2;j++) part(trim,a+j*0.014,0.659,side*0.104,0.003,0.068,0.006);
                part(dark,a,0.659,side*0.109,0.06,0.006,0.005);
            } else {
                part(armor,a,0.66,side*0.104,0.056,0.067,0.006);
                for(let j=-2;j<=2;j++) for(let k=-1;k<=1;k++)
                    part(glass,a+j*0.014,0.66+k*0.016,side*0.109,0.004,0.006,0.005);
            }
            part(dark,a,0.602,side*0.094,0.082,0.009,0.007);
            part(trim,a,0.602,side*0.1,0.048,0.003,0.004);
        }
        part(armor,a+angle/2,0.654,0,0.019,0.217,0.18);
        part(dark,a+angle/2,0.756,0,0.028,0.035,0.20);
    }
    // Four power plants sit outside the traffic ring, joined by heavy necks.
    // Each has layered radiators, a maintenance spine and crew-scale windows.
    for(let i=0;i<4;i++) {
        const a=i*Math.PI/2+Math.PI/4;
        part(metal,a,0.813,0,0.10,0.16,0.20);
        part(armor,a,0.936,0,0.20,0.22,0.25);
        part(dark,a,0.936,0,0.16,0.185,0.264);
        part(metal,a,0.936,0,0.136,0.165,0.276);
        part(armor,a,1.045,0,0.225,0.055,0.29);
        part(metal,a,1.11,0,0.11,0.095,0.17);
        part(trim,a,1.16,0,0.14,0.015,0.18);
        for(const side of [-1,1]) {
            part(dark,a,0.932,side*0.143,0.108,0.12,0.007);
            for(let j=-2;j<=2;j++) part(armor,a+j*0.021,0.935,side*0.149,0.004,0.105,0.004);
            part(trim,a,1.035,side*0.151,0.15,0.012,0.012);
            for(let j=-3;j<=3;j++) part(glass,a+j*0.019,1.049,side*0.151,0.007,0.008,0.008);
            part(lights,a,1.125,side*0.092,0.028,0.012,0.01);
        }
        // Reinforced edge rails connect each pod to the outer annulus.
        for(const side of [-1,1]) part(dark,a+side*0.105,0.815,0,0.026,0.22,0.11);
        // A pair of pressure conduits and armored machinery housings is
        // anchored back to the ring rather than floating beside the pod.
        for(const side of [-1,1]) {
            part(metal,a+side*0.12,0.965,0,0.035,0.18,0.16);
            part(armor,a+side*0.12,1.045,0,0.045,0.035,0.20);
            part(trim,a+side*0.12,0.925,side*0.085,0.025,0.06,0.012);
        }
    }
    for(const [material,transforms] of groups) {
        const mesh=new THREE.InstancedMesh(boxGeometry,material,transforms.length);
        transforms.forEach((m,i)=>mesh.setMatrixAt(i,m));
        mesh.name='gate-detail-'+(material===lights?'lights':material===glass?'windows':material===armor?'armor':material===trim?'trim':material===dark?'recesses':'machinery');
        mesh.computeBoundingSphere();root.add(mesh);
    }
    // Structural rails have genuine depth and an unobstructed bore.
    for(const [r,t,z,material] of [[0.552,0.012,0,armor],[0.765,0.014,0,trim],[0.785,0.012,0.09,metal],[0.785,0.012,-0.09,metal]]) {
        const rail=new THREE.Mesh(new THREE.TorusGeometry(r,t,8,96),material);rail.position.z=z;root.add(rail);
    }
    return root;
}
