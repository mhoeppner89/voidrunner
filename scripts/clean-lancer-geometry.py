"""Blender MCP: smooth and reduce the optimized Lancer geometry.
Preserve original UVs, textures and canopy; export an isolated candidate.
Start from the pre-refinement optimized snapshot, not this script's output.
"""
import bpy, math, json
import numpy as np
from pathlib import Path
ROOT=Path('/Users/mhoeppner/Desktop/Voidrunner');OUT=ROOT/'.freebuff/ship-cleanup/geometry';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/models/ships/lancer.glb'))
obj=next(o for o in bpy.context.selected_objects if o.type=='MESH');obj.name='Lancer_Original_Paint_Clean_Geometry'
mesh=obj.data
# Smooth short-scale surface bumps with coincident UV vertices locked
# together. Keep canopy geometry, hard ridges, extrema and silhouette tips.
from mathutils import Vector
import bmesh
canopy_ids={i for f in mesh.polygons if mesh.materials[f.material_index].name.startswith('VR_Canopy_') for i in f.vertices}
canopy_points=[mesh.vertices[i].co.copy() for i in canopy_ids]
groups={}
for v in mesh.vertices:
    if v.index not in canopy_ids:groups.setdefault(tuple(round(c,6) for c in v.co),[]).append(v.index)
keys=list(groups);lookup={vi:k for k,key in enumerate(keys) for vi in groups[key]}
coords=np.array(keys,dtype=float);initial=coords.copy();adj=[set() for _ in keys];normals=[[] for _ in keys]
for f in mesh.polygons:
    if any(i in canopy_ids for i in f.vertices):continue
    ids=[lookup[i] for i in f.vertices]
    for k in ids:
        adj[k].update(j for j in ids if j!=k);normals[k].append(np.array(f.normal))
lo=coords.min(axis=0);hi=coords.max(axis=0);movable=[]
for k,p in enumerate(coords):
    ns=np.array(normals[k]);avg=ns.mean(axis=0) if len(ns) else np.zeros(3)
    avg/=max(np.linalg.norm(avg),1e-9)
    hard=not len(ns) or (ns@avg).min()<.7
    near_glass=min((np.linalg.norm(p-np.array(v)) for v in canopy_points),default=1)<.023
    extremum=np.any(abs(p-lo)<.004)|np.any(abs(p-hi)<.004)
    if not hard and not near_glass and not extremum and len(adj[k])>2:movable.append(k)
for iteration in range(5):
    updated=coords.copy()
    for k in movable:
        delta=(coords[list(adj[k])].mean(axis=0)-coords[k])*.27
        target=coords[k]+delta;offset=target-initial[k];length=np.linalg.norm(offset)
        if length>.006:target=initial[k]+offset*.006/length
        updated[k]=target
    coords=updated
# Broad wing skins should read as manufactured planes. Fit each side's
# upper and lower skin independently, leaving roots and tips protected.
for side in [-1,1]:
    for upper in [False,True]:
        candidates=[k for k in movable if side*coords[k,1]>.40 and side*coords[k,1]<.84 and coords[k,0]<.25 and coords[k,0]>-.40 and (coords[k,2]>-.10)==upper]
        if len(candidates)<30:continue
        q=coords[candidates];A=np.column_stack((q[:,0],q[:,1],np.ones(len(q))))
        fit=np.linalg.lstsq(A,q[:,2],rcond=None)[0]
        residual=q[:,2]-A@fit
        good=np.abs(residual)<.018
        if good.sum()<20:continue
        fit=np.linalg.lstsq(A[good],q[good,2],rcond=None)[0]
        for k in np.array(candidates)[good]:
            target=coords[k,0]*fit[0]+coords[k,1]*fit[1]+fit[2]
            coords[k,2]+=np.clip(target-coords[k,2],-.007,.007)
for k,key in enumerate(keys):
    for vi in groups[key]:mesh.vertices[vi].co=coords[k]
mesh.update()
moved=int(np.sum(np.linalg.norm(coords-initial,axis=1)>1e-6))
# A small further reduction on interior vertices only. UV boundaries and
# canopy vertices are locked to avoid holes or altered window outlines.
bpy.context.view_layer.objects.active=obj
bm=bmesh.new();bm.from_mesh(mesh);bm.verts.ensure_lookup_table()
locked=[v.index for v in bm.verts if v.is_boundary or v.index in canopy_ids];bm.free()
vg=obj.vertex_groups.new(name='Protected seams and canopy');vg.add(locked,1,'REPLACE')
dec=obj.modifiers.new('Conservative surface reduction','DECIMATE');dec.ratio=.97;dec.use_collapse_triangulate=True
dec.vertex_group=vg.name;dec.invert_vertex_group=True;dec.vertex_group_factor=1000
bpy.ops.object.modifier_apply(modifier=dec.name)
mesh=obj.data
selected=[p.index for p in mesh.polygons if not mesh.materials[p.material_index].name.startswith('VR_Canopy_')]
# Smooth only the new finish across duplicate UV seam vertices. Retain
# hard changes above 45 degrees and all existing canopy/hull normals elsewhere.
from mathutils import Vector
corner=[n.vector.copy() for n in mesh.corner_normals]
adj={}
for f in mesh.polygons:
    if mesh.materials[f.material_index].name.startswith('VR_Canopy_'):continue
    for vi in f.vertices:
        key=tuple(round(v,6) for v in mesh.vertices[vi].co)
        adj.setdefault(key,[]).append((f.normal.copy(),f.area))
for fi in selected:
    f=mesh.polygons[fi];f.use_smooth=True
    for li in f.loop_indices:
        key=tuple(round(v,6) for v in mesh.vertices[mesh.loops[li].vertex_index].co)
        n=Vector()
        for normal,area in adj[key]:
            if normal.dot(f.normal)>.707:n+=normal*area
        if n.length:corner[li]=n.normalized()
mesh.normals_split_custom_set(corner)
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'lancer.glb'),export_format='GLB',use_selection=True,export_yup=True,export_image_format='AUTO')
result={'smoothedPositionGroups':moved,'hullFaces':len(selected),'triangles':sum(len(p.vertices)-2 for p in mesh.polygons),'output':str(OUT/'lancer.glb')}
(ROOT/'docs/ship-cleanup/lancer-geometry-build.json').write_text(json.dumps(result,indent=2))
