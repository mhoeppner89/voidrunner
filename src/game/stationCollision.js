import * as THREE from 'three';

// Static station surfaces, before docked ships, lights and traffic are added.
// Keep concave hangar mouths and gaps; a station-wide box/sphere fills them in.
export function buildStationCollider(model, origin) {
    model.updateMatrixWorld(true);
    const triangles = [];
    const point = new THREE.Vector3();
    model.traverse(mesh => {
        if (!mesh.isMesh || !mesh.visible) return;
        const positions = mesh.geometry?.attributes.position;
        if (!positions) return;
        const indices = mesh.geometry.index;
        const count = indices?.count ?? positions.count;
        for (let i = 0; i + 2 < count; i += 3) {
            for (let j = 0; j < 3; j++) {
                point.fromBufferAttribute(positions, indices ? indices.getX(i + j) : i + j).applyMatrix4(mesh.matrixWorld);
                triangles.push(point.x, point.y, point.z);
            }
        }
    });
    const vertices = new Float64Array(triangles);
    const order = Array.from({length:vertices.length / 9}, (_,i) => i);
    const nodes = [];
    function branch(first, last) {
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let i = first; i < last; i++) for (let j = 0; j < 9; j++) {
            const axis = j % 3, value = vertices[order[i] * 9 + j];
            min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
        }
        const index = nodes.length, node = {min, max, first, last, left:-1, right:-1};
        nodes.push(node);
        if (last - first > 12) {
            const span = max.map((v,i) => v - min[i]);
            const axis = span.indexOf(Math.max(...span));
            const centroid = i => vertices[i*9+axis] + vertices[i*9+3+axis] + vertices[i*9+6+axis];
            const sorted = order.slice(first,last).sort((a,b) => centroid(a)-centroid(b));
            for (let i=0;i<sorted.length;i++) order[first+i]=sorted[i];
            const middle = (first + last) >> 1;
            node.left = branch(first,middle); node.right = branch(middle,last);
        }
        return index;
    }
    if (order.length) branch(0,order.length);
    return {origin:[...origin],vertices,order:new Uint32Array(order),nodes,stack:new Uint32Array(nodes.length)};
}

const triangle = new THREE.Triangle();
const closest = new THREE.Vector3(), zero = new THREE.Vector3();
const normal = new THREE.Vector3(), rotation = new THREE.Quaternion();
const unitHullPoint = (point,hull) => point.set(point.x/hull[0],point.y/hull[1],point.z/hull[2]);

// Transform nearby triangles into the oriented hull's unit-sphere frame.
// Closest-point testing catches faces AND edges without filling empty interiors.
// BVH traversal and contact work reuse storage; no per-step vectors/arrays.
export function hullVsStation(position, hull, inverse, collider, contact) {
    if (!collider?.nodes.length) return false;
    const x=position.x-collider.origin[0], y=position.y-collider.origin[1], z=position.z-collider.origin[2];
    const reach=Math.max(hull[0],hull[1],hull[2]), {vertices,order,nodes,stack}=collider;
    let pending=1, hit=false, deepest=0; stack[0]=0;
    rotation.copy(inverse).invert();
    while (pending) {
        const node=nodes[stack[--pending]], {min,max}=node;
        if(x+reach<min[0] || x-reach>max[0] || y+reach<min[1] || y-reach>max[1] || z+reach<min[2] || z-reach>max[2]) continue;
        if(node.left>=0) {stack[pending++]=node.left;stack[pending++]=node.right;continue;}
        for(let i=node.first;i<node.last;i++) {
            const offset=order[i]*9;
            triangle.a.set(vertices[offset]-x,vertices[offset+1]-y,vertices[offset+2]-z).applyQuaternion(inverse);
            triangle.b.set(vertices[offset+3]-x,vertices[offset+4]-y,vertices[offset+5]-z).applyQuaternion(inverse);
            triangle.c.set(vertices[offset+6]-x,vertices[offset+7]-y,vertices[offset+8]-z).applyQuaternion(inverse);
            unitHullPoint(triangle.a,hull);unitHullPoint(triangle.b,hull);unitHullPoint(triangle.c,hull);
            // Degenerate decorative faces have no collision surface.
            triangle.getNormal(normal);
            if(normal.lengthSq()<1e-12) continue;
            triangle.closestPointToPoint(zero,closest);
            const distance=closest.length();
            if(distance>=1) continue;
            if(distance>1e-8) normal.copy(closest).multiplyScalar(-1/distance);
            normal.set(normal.x/hull[0],normal.y/hull[1],normal.z/hull[2]);
            const gradient=normal.length();
            const push=(1-distance)/gradient+.08;
            if(push<=deepest) continue;
            normal.multiplyScalar(1/gradient).applyQuaternion(rotation);
            contact.x=normal.x;contact.y=normal.y;contact.z=normal.z;contact.push=push;
            deepest=push;hit=true;
        }
    }
    return hit;
}
