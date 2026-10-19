"""Bake local contact occlusion into compact vertex colours, offline only."""
import math,struct
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def bake(doc,binary):
    data=bytearray(binary);verts=[];faces=[];primitives=[]
    def read(index,size):
        a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];fmt={5126:'f',5125:'I',5123:'H'}[a['componentType']];step=struct.calcsize(fmt);stride=v.get('byteStride',size*step);off=v.get('byteOffset',0)+a.get('byteOffset',0)
        return [struct.unpack_from('<'+fmt*size,data,off+i*stride)for i in range(a['count'])]
    for m in doc['meshes']:
        for p in m['primitives']:
            pos=read(p['attributes']['POSITION'],3);norm=read(p['attributes']['NORMAL'],3);idx=[x[0]for x in read(p['indices'],1)];offset=len(verts)
            verts.extend(pos);faces.extend(tuple(offset+j for j in idx[i:i+3])for i in range(0,len(idx),3));primitives.append((p,pos,norm))
    tree=BVHTree.FromPolygons(verts,faces,all_triangles=True);cache={};minimum=1
    # A few corner samples must not paint a giant triangular shadow across a
    # broad deck or wall. Keep those faces neutral; shade the smaller fittings.
    broad=set()
    for p,pos,norm in primitives:
        idx=[x[0]for x in read(p['indices'],1)]
        for i in range(0,len(idx),3):
            tri=idx[i:i+3]
            if max((Vector(pos[tri[a]])-Vector(pos[tri[b]])).length_squared for a,b in [(0,1),(1,2),(2,0)])>36:
                for j in tri:broad.add(tuple(round(x,4)for x in (*pos[j],*norm[j])))
    for p,pos,norm in primitives:
        keymat=doc['materials'][p['material']]['name'].split(' · ')[-1];colors=bytearray()
        for xyz,nn in zip(pos,norm):
            k=tuple(round(x,4)for x in (*xyz,*nn))
            ao=cache.get(k)
            if ao is None:
                n=Vector(nn).normalized();u=n.cross(Vector((0,0,1)))
                if u.length<.1:u=n.cross(Vector((0,1,0)))
                u.normalize();v=n.cross(u);origin=Vector(xyz)+n*.045;shade=0
                for dx,dy in [(1,0),(-1,0),(0,1),(0,-1),(.7,.7),(-.7,-.7)]:
                    direction=(n*.65+u*dx+v*dy).normalized();hit,normal,index,distance=tree.ray_cast(origin,direction,2.4)
                    if hit is not None:shade+=1-distance/2.4
                ao=1-.42*shade/6;cache[k]=ao
            if keymat in ['warm','cool']or k in broad:ao=1
            minimum=min(minimum,ao);colors.extend([round(255*ao)]*3)
        while len(data)%4:data.append(0)
        view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(data),'byteLength':len(colors),'target':34962});data.extend(colors)
        p['attributes']['COLOR_0']=len(doc['accessors']);doc['accessors'].append({'bufferView':view,'componentType':5121,'normalized':True,'count':len(pos),'type':'VEC3'})
    while len(data)%4:data.append(0)
    doc['buffers'][0]['byteLength']=len(data)
    return bytes(data),{'samples':6,'radius':2.4,'minimum':round(minimum,3),'vertices':sum(len(p)for _,p,n in primitives)}
