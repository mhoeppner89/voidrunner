"""Run in Blender on an original 150k-triangle frigate; preserve UVs and silhouette.
Usage: blender --background --python scripts/prepare-frigate.py -- source.glb geometry.glb
Then node scripts/package-frigate.mjs for the approved 512px runtime package.
"""
import bpy, bmesh, numpy as np, math, sys
source, output = sys.argv[sys.argv.index('--')+1:][:2]
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.import_scene.gltf(filepath=source)
obj = next(o for o in bpy.context.selected_objects if o.type == 'MESH')
if sum(len(p.vertices)-2 for p in obj.data.polygons) < 100000:
    raise ValueError('Use the original frigate, not an already reduced export.')
bpy.context.view_layer.objects.active = obj
bm = bmesh.new(); bm.from_mesh(obj.data)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
bm.to_mesh(obj.data); bm.free()
m = obj.data; m.update()
co = np.array([v.co[:] for v in m.vertices]); normals = np.array([p.normal[:] for p in m.polygons])
faces = [list(p.vertices) for p in m.polygons]; centers = np.array([p.center[:] for p in m.polygons])
adj = [[] for _ in faces]; edges = {}
for i, face in enumerate(faces):
    for a,b in zip(face,face[1:]+face[:1]):
        key=tuple(sorted((a,b)))
        if key in edges:
            j=edges[key]; adj[i].append(j); adj[j].append(i)
        else: edges[key]=i
seen=set(); moved=set(); patches=0
for seed in np.argsort([-p.area for p in m.polygons]):
    seed=int(seed)
    if seed in seen: continue
    group=[seed]; seen.add(seed); queue=[seed]
    while queue:
        f=queue.pop()
        for j in adj[f]:
            if j not in seen and normals[j]@normals[seed]>.985 and abs((centers[j]-centers[seed])@normals[seed])<.003:
                seen.add(j); group.append(j); queue.append(j)
    if len(group)<12: continue
    ids=np.unique([v for f in group for v in faces[f]]); points=co[ids]; center=points.mean(axis=0)
    _,_,vh=np.linalg.svd(points-center,full_matrices=False); normal=vh[-1]; offsets=(points-center)@normal
    if np.max(np.abs(offsets))>.004: continue
    patches+=1; members=set(group)
    boundary=set(v for f in group for j in adj[f] if j not in members for v in set(faces[f])&set(faces[j]))
    for v,delta in zip(ids,offsets):
        if v not in boundary: m.vertices[int(v)].co=co[v]-delta*normal; moved.add(int(v))
m.update()
mod=obj.modifiers.new('Frigate silhouette reduction','DECIMATE'); mod.ratio=.267
bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(25),keep_sharp_edges=True)
bpy.ops.export_scene.gltf(filepath=output,export_format='GLB',use_selection=True,export_image_format='JPEG',export_materials='EXPORT')
print({'patches':patches,'straightened_vertices':len(moved),'triangles':sum(len(p.vertices)-2 for p in obj.data.polygons)})
