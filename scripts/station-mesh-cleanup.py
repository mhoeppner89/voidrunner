"""Remove overlapping, equally-facing coplanar faces before station UV generation.
Subtract convex face footprints, retaining real geometry rather than depth bias.
Primitive faces are convex; polygon subtraction returns convex fragments.
"""
import bpy
from mathutils import Vector

def clean_station_surfaces(objects):
    eps = 1e-5
    planes = {}
    changed = 0
    def side(a,b,p): return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
    def area(poly): return abs(sum(poly[i][0]*poly[(i+1)%len(poly)][1]-poly[(i+1)%len(poly)][0]*poly[i][1] for i in range(len(poly))))*.5
    def half(poly,a,b,inside):
        out=[]
        for i,t in enumerate(poly):
            s=poly[i-1];cs=side(a,b,s);ct=side(a,b,t)
            si=cs>=-eps if inside else cs<=eps;ti=ct>=-eps if inside else ct<=eps
            if si!=ti and abs(cs-ct)>eps:
                f=cs/(cs-ct);out.append((s[0]+f*(t[0]-s[0]),s[1]+f*(t[1]-s[1])))
            if ti:out.append(t)
        result=[]
        for p in out:
            if not result or (Vector(p)-Vector(result[-1])).length>eps:result.append(p)
        if len(result)>1 and (Vector(result[0])-Vector(result[-1])).length<eps:result.pop()
        return result if len(result)>2 and area(result)>eps else []
    def subtract(poly,cutter):
        intersection=poly
        for i,b in enumerate(cutter):
            intersection=half(intersection,cutter[i-1],b,True)
            if not intersection:return [poly],False
        if area(intersection)<eps:return [poly],False
        out=[];inside=poly
        for i,b in enumerate(cutter):
            outside=half(inside,cutter[i-1],b,False)
            if outside:out.append(outside)
            inside=half(inside,cutter[i-1],b,True)
            if not inside:break
        return out,True
    def bounds(p):return(min(v[0] for v in p),min(v[1] for v in p),max(v[0] for v in p),max(v[1] for v in p))
    for o in objects:
        vertices=[];faces=[];inv=o.matrix_world.inverted();dirty=False
        for p in o.data.polygons:
            world=[o.matrix_world@o.data.vertices[i].co for i in p.vertices]
            n=p.normal.copy();axis=max(range(3),key=lambda k:abs(round(n[k],4)));axes=[k for k in range(3) if k!=axis];d=n.dot(world[0])
            key=tuple(round(v,4) for v in n)+(round(d,3),)
            xy=[(v[axes[0]],v[axes[1]]) for v in world]
            signed=sum(xy[i][0]*xy[(i+1)%len(xy)][1]-xy[(i+1)%len(xy)][0]*xy[i][1] for i in range(len(xy)))
            if signed<0:xy.reverse()
            parts=[xy];bb=bounds(xy)
            for prev,pbb in planes.get(key,[]):
                if bb[2]<=pbb[0]+eps or pbb[2]<=bb[0]+eps or bb[3]<=pbb[1]+eps or pbb[3]<=bb[1]+eps:continue
                nextparts=[]
                for part in parts:
                    pieces,cut=subtract(part,prev);nextparts.extend(pieces)
                    if cut:dirty=True;changed+=1
                parts=nextparts
                if not parts:break
            planes.setdefault(key,[]).append((xy,bb))
            for part in parts:
                if signed<0:part=list(reversed(part))
                inds=[]
                for x,y in part:
                    v=Vector((0,0,0));v[axes[0]]=x;v[axes[1]]=y;v[axis]=(d-n[axes[0]]*x-n[axes[1]]*y)/n[axis]
                    inds.append(len(vertices));vertices.append(inv@v)
                faces.append(inds)
        if dirty:
            old=o.data;mesh=bpy.data.meshes.new(old.name+' clean');mesh.from_pydata(vertices,[],faces);mesh.update()
            for m in old.materials:mesh.materials.append(m)
            o.data=mesh
            if old.users==0:bpy.data.meshes.remove(old)
    return changed
