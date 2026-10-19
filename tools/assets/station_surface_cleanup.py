"""Subtract overlapping coplanar faces in the export copy, retaining UVs.

Editable source components remain intact. Unlike depth bias, this removes the
competing surface entirely, including overlaps between two textured decks.
"""
import math,bpy,bmesh
from mathutils import Vector
from collections import defaultdict
import numpy as np
EPS=1e-7

def area(p):return sum(a[0]*b[1]-a[1]*b[0]for a,b in zip(p,p[1:]+p[:1]))*.5

def half(poly,a,b,sign):
    out=[]
    def d(p):return sign*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))
    for p,q in zip(poly,poly[1:]+poly[:1]):
        dp,dq=d(p),d(q);ip,iq=dp>=-EPS,dq>=-EPS
        if ip:out.append(p)
        if ip!=iq:
            t=dp/(dp-dq);out.append((p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t))
    return out

def intersection(p,q):
    sign=1 if area(q)>0 else-1
    for a,b in zip(q,q[1:]+q[:1]):
        p=half(p,a,b,sign)
        if len(p)<3:return []
    return p

def difference(p,q):
    sign=1 if area(q)>0 else-1;out=[]
    for a,b in zip(q,q[1:]+q[:1]):
        ext=half(p,a,b,-sign)
        if len(ext)>2 and abs(area(ext))>EPS:out.append(ext)
        p=half(p,a,b,sign)
        if len(p)<3:break
    return out

def clean(objects):
    groups=defaultdict(list);counts=defaultdict(int);outputs=defaultdict(list)
    priority={'warm':9,'cool':9,'glass':8,'ochre':7,'dark':6,'armor':4,'metal':3,'copper':2,'radiator':1,'rock':0,'hull':0}
    for oi,o in enumerate(objects):
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.update()
        uv=o.data.uv_layers.active.data
        for face in o.data.polygons:
            xyz=[tuple(o.matrix_world@o.data.vertices[i].co)for i in face.vertices]
            n=(Vector(xyz[1])-Vector(xyz[0])).cross(Vector(xyz[2])-Vector(xyz[0]))
            if n.length<1e-9:continue
            n.normalize();d=n.dot(Vector(xyz[0]));key=tuple(round(v,5)for v in n)+(round(d,4),)
            axis=max(range(3),key=lambda i:abs(n[i]));axes=[k for k in range(3)if k!=axis]
            poly=[(p[axes[0]],p[axes[1]])for p in xyz];tex=[tuple(uv[i].uv)for i in face.loop_indices]
            mat=o.data.materials[0].name.split(' · ')[-1]
            groups[key].append((priority.get(mat,0),oi,poly,xyz,tex))
    clipped=0;removed_area=0
    for plane,faces in groups.items():
        faces.sort(key=lambda f:-f[0]);accepted=[];bounds=[]
        for _,oi,poly,xyz,tex in faces:
            lo=np.min(poly,axis=0);hi=np.max(poly,axis=0);pieces=[poly]
            if bounds:
                bb=np.asarray(bounds);candidates=np.where(np.all(bb[:,:2]<hi-EPS,axis=1)&np.all(bb[:,2:]>lo+EPS,axis=1))[0]
                for j in candidates:
                    q=accepted[j];new=[]
                    for part in pieces:
                        overlap=intersection(part,q)
                        if len(overlap)>2 and abs(area(overlap))>EPS:
                            clipped+=1;removed_area+=abs(area(overlap));new.extend(difference(part,q))
                        else:new.append(part)
                    pieces=new
                    if not pieces:break
            # Accepted pieces do not overlap, so each new subtraction is final.
            for part in pieces:
                if abs(area(part))<EPS:continue
                accepted.append(part);b=np.asarray(part);bounds.append([*b.min(axis=0),*b.max(axis=0)])
                # Barycentric interpolation preserves the original panel UVs.
                a,b,c=poly;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
                if abs(den)<EPS:continue
                verts=[];uvs=[]
                for p in part:
                    u=((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/den
                    v=((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/den;w=1-u-v
                    verts.append(tuple(round(u*xyz[0][k]+v*xyz[1][k]+w*xyz[2][k],6)for k in range(3)))
                    uvs.append(tuple(round(u*tex[0][k]+v*tex[1][k]+w*tex[2][k],6)for k in range(2)))
                for j in range(1,len(verts)-1):outputs[oi].append(([verts[0],verts[j],verts[j+1]],[uvs[0],uvs[j],uvs[j+1]],plane[:3]))
    for i,o in enumerate(objects):
        tris=outputs[i];mat=o.data.materials[0];data=bpy.data.meshes.new(o.name+' exposed surfaces')
        data.from_pydata([v for vs,uv,n in tris for v in vs],[],[(j,j+1,j+2)for j in range(0,len(tris)*3,3)]);data.materials.append(mat)
        uv=data.uv_layers.new(name='Physical structural panels');vals=[v for vs,uvs,n in tris for v in uvs]
        for j,v in enumerate(vals):uv.data[j].uv=v
        data.update()
        for face in data.polygons:face.use_smooth=True
        data.normals_split_custom_set([n for vs,uvs,n in tris for _ in vs])
        o.data=data;o.matrix_world.identity()
    return {'coplanarSubtractions':clipped,'overlapAreaRemoved':round(removed_area,4),'tolerance':.0001}
