import * as T from 'three';

// Offline only. Clipping a hull can leave open source skins or isolated deck
// faces. Give each open shell a backing and close its edges after all cutting
// and displacement, so later damage cannot turn it back into a single plane.
export function solidifyWreckSurfaces(input, edgeMaterial, thickness = .006) {
    const triangles = input.filter(t => {
        const [a,b,c] = t.v.map(v => new T.Vector3(...v.p));
        return b.sub(a).cross(c.sub(a)).lengthSq() > 1e-20;
    });
    const key = p => p.map(v => Math.round(v * 1e7)).join(',');
    const edgeKey = (a,b) => a < b ? a+'|'+b : b+'|'+a;
    const edges = new Map(), parents = triangles.map((_,i) => i);
    const find = i => { while(parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
    const join = (a,b) => { parents[find(a)] = find(b); };
    const normals = triangles.map(t => {
        const [a,b,c] = t.v.map(v => new T.Vector3(...v.p));
        return b.sub(a).cross(c.sub(a)).normalize();
    });
    triangles.forEach((t,i) => {
        for(let j=0;j<3;j++) {
            const a=key(t.v[j].p), b=key(t.v[(j+1)%3].p), k=edgeKey(a,b);
            if(!edges.has(k)) edges.set(k,[]);
            edges.get(k).push({i,j,a,b});
        }
    });
    for(const entries of edges.values()) for(let j=1;j<entries.length;j++) join(entries[0].i,entries[j].i);
    const open = new Set();
    for(const entries of edges.values()) if(entries.length !== 2 || entries[0].a === entries[1].a) open.add(find(entries[0].i));
    // Coincident front/back triangles can report no boundary at all while
    // enclosing zero volume. These still need a physical backing.
    const volumes=new Map();
    triangles.forEach((t,i)=>{
        const id=find(i);if(!volumes.has(id))volumes.set(id,{volume:0,area:0});
        const [a,b,c]=t.v.map(v=>new T.Vector3(...v.p)),s=volumes.get(id);
        s.volume+=a.dot(b.clone().cross(c))/6;
        s.area+=b.sub(a).cross(c.sub(a)).length()/2;
    });
    for(const [id,s]of volumes)if(Math.abs(s.volume)<s.area*1e-7)open.add(id);
    const needsBacking = triangles.map((_,i) => open.has(find(i)));
    // Separate sharp folds into overlapping solid plates. This avoids a
    // cancelled extrusion normal where an exposed deck meets a vertical wall.
    parents.forEach((_,i) => parents[i]=i);
    for(const entries of edges.values()) if(entries.length===2) {
        const [a,b]=entries;
        if(needsBacking[a.i] && needsBacking[b.i] && normals[a.i].dot(normals[b.i])>.64) join(a.i,b.i);
    }
    const patches = new Map(), result = [], stats = {thickness, originalTriangles:triangles.length, backedTriangles:0, edgeTriangles:0};
    triangles.forEach((t,i) => {
        if(!needsBacking[i]) { result.push(t); return; }
        const id=find(i); if(!patches.has(id)) patches.set(id,[]);
        patches.get(id).push(i);
    });
    for(const indices of patches.values()) {
        const vertexNormals=new Map(), incidentNormals=new Map(), patchEdges=new Map();
        for(const i of indices) {
            const t=triangles[i];
            for(let j=0;j<3;j++) {
                const k=key(t.v[j].p);
                if(!vertexNormals.has(k)) { vertexNormals.set(k,new T.Vector3()); incidentNormals.set(k,[]); }
                incidentNormals.get(k).push(normals[i]);
                // Angle weights keep offsets independent of texture tessellation.
                const a=new T.Vector3(...t.v[(j+1)%3].p).sub(new T.Vector3(...t.v[j].p)).normalize();
                const b=new T.Vector3(...t.v[(j+2)%3].p).sub(new T.Vector3(...t.v[j].p)).normalize();
                vertexNormals.get(k).addScaledVector(normals[i],Math.acos(T.MathUtils.clamp(a.dot(b),-1,1)));
                const next=key(t.v[(j+1)%3].p), e=edgeKey(k,next);
                if(!patchEdges.has(e)) patchEdges.set(e,[]);
                patchEdges.get(e).push({a:t.v[j],b:t.v[(j+1)%3]});
            }
        }
        for(const n of vertexNormals.values()) n.normalize();
        const backs=new Map();
        for(const i of indices) for(const v of triangles[i].v) {
            const k=key(v.p); if(backs.has(k)) continue;
            const n=vertexNormals.get(k);
            // Limit corner miters while keeping a visible plate edge.
            let dot=1;
            for(const faceNormal of incidentNormals.get(k)) dot=Math.min(dot,n.dot(faceNormal));
            backs.set(k,new T.Vector3(...v.p).addScaledVector(n,-thickness/Math.max(.5,dot)).toArray());
        }
        for(const i of indices) {
            const t=triangles[i]; result.push(t,{mat:t.mat,v:[...t.v].reverse().map(v=>({...v,p:backs.get(key(v.p)),n:v.n.map(x=>-x)}))});stats.backedTriangles++;
        }
        for(const entries of patchEdges.values()) {
          // Cancel opposite oriented shared edges. Overlapping cut fragments
          // can leave three edges or two with equal winding; a count-only
          // boundary test would miss their exposed sides.
          const remaining=[];
          for(const e of entries) {
              const opposite=remaining.findIndex(r=>key(r.a.p)===key(e.b.p)&&key(r.b.p)===key(e.a.p));
              if(opposite<0)remaining.push(e);else remaining.splice(opposite,1);
          }
          for(const {a,b}of remaining) {
            const points=[b.p,a.p,backs.get(key(a.p)),backs.get(key(b.p))];
            const normal=new T.Vector3(...points[1]).sub(new T.Vector3(...points[0])).cross(new T.Vector3(...points[2]).sub(new T.Vector3(...points[0]))).normalize().toArray();
            const vertices=points.map((p,i)=>({p,n:normal,uv:[[0,0],[1,0],[1,1],[0,1]][i],c:[1,1,1]}));
            result.push({mat:edgeMaterial,v:[vertices[0],vertices[1],vertices[2]]},{mat:edgeMaterial,v:[vertices[0],vertices[2],vertices[3]]});stats.edgeTriangles+=2;
          }
        }
    }
    return {triangles:result,stats};
}
