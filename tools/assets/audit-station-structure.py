"""Check actual source-mesh contact, including enclosed parts and hollow rings.

Bounds only select candidates. Surface intersection or point-in-solid contact
must connect each structural group; broad ring bounds cannot hide an air gap.
Run in background Blender, optionally with -- station-id ... .
"""
import bpy,sys,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
direction=Vector((.912,.373,.169)).normalized()

def inside(point,tree):
    origin=point.copy();count=0
    for _ in range(80):
        hit,normal,index,distance=tree.ray_cast(origin,direction,10000)
        if hit is None:return count%2==1
        if distance<.035:return True
        count+=1;origin=hit+direction*.0001
    return False

def audit():
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH'and 'windows'not in o.name.lower()]
    trees=[];vertices=[];lo=[];hi=[]
    for o in objects:
        vs=[o.matrix_world@v.co for v in o.data.vertices];vertices.append(vs)
        trees.append(BVHTree.FromPolygons(vs,[tuple(f.vertices)for f in o.data.polygons],epsilon=.025))
        lo.append([min(v[k]for v in vs)for k in range(3)]);hi.append([max(v[k]for v in vs)for k in range(3)])
    lo=np.array(lo);hi=np.array(hi);parents=list(range(len(objects)))
    def find(i):
        while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
        return i
    for i in range(len(objects)):
        candidates=np.where(np.all(hi>=lo[i]-.05,axis=1)&np.all(lo<=hi[i]+.05,axis=1))[0]
        for j in candidates:
            j=int(j)
            if j<=i or find(i)==find(j):continue
            if trees[i].overlap(trees[j])or inside(vertices[i][0],trees[j])or inside(vertices[j][0],trees[i]):parents[find(j)]=find(i)
    groups={}
    for i,o in enumerate(objects):groups.setdefault(find(i),[]).append(o.name)
    main=max(groups,key=lambda k:len(groups[k]))
    return [g for k,g in groups.items()if k!=main]

ids=sys.argv[sys.argv.index('--')+1:]if '--'in sys.argv else [p.name for p in (ROOT/'authoring/models/stations').iterdir()if(p/(p.name+'.blend')).exists()]
reports={}
for station_id in ids:
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'authoring/models/stations'/station_id/(station_id+'.blend')))
    bpy.context.view_layer.update();groups=audit();reports[station_id]=groups
    path=ROOT/'authoring/models/stations'/station_id/'model-report.json'
    report=json.loads(path.read_text());report['physicalDetachedGroups']=groups;report['physicalContactTolerance']=.05
    path.write_text(json.dumps(report,indent=2)+'\n')
    print('STRUCTURE',station_id,[(g[:3],len(g))for g in groups],flush=True)
out=ROOT/'output/station-review/physical-structure.json'
previous=json.loads(out.read_text())if out.exists()else{}
out.write_text(json.dumps({**previous,**reports},indent=2)+'\n')
assert not any(reports.values()),'Detached structural groups remain; inspect physical-structure.json.'
