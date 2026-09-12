"""Preview reduction of shipped wreck meshes; run with Blender --background --python.
Weld coincident geometry while retaining per-corner UVs; protect open cuts. Do not fill holes or smooth damage.
"""
import bpy,bmesh,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.freebuff/wreck-optimization/geometry'
OUT.mkdir(parents=True,exist_ok=True)
files=['concord-battleship-wreck-v4','concord-carrier-wreck-v4','concord-cruiser-wreck-v4','concord-frigate-wreck-v3','wayfarer-wreck','talon-wreck']
report=[]
for name in files:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/models/wrecks'/f'{name}.glb'))
 for obj in list(bpy.context.scene.objects):
  if obj.type!='MESH':continue
  bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
  obj.data.calc_loop_triangles();before=len(obj.data.loop_triangles)
  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7);bm.verts.ensure_lookup_table();bm.verts.index_update()
  boundary=[v.index for v in bm.verts if v.is_boundary or len({f.material_index for f in v.link_faces})>1];bm.to_mesh(obj.data);bm.free()
  group=obj.vertex_groups.new(name='Protected cut and UV edges')
  if boundary:group.add(boundary,1,'REPLACE')
  dec=obj.modifiers.new('Conservative wreck reduction','DECIMATE');dec.ratio=.55
  dec.vertex_group=group.name;dec.invert_vertex_group=True;dec.vertex_group_factor=1000;dec.use_collapse_triangulate=True
  bpy.ops.object.modifier_apply(modifier=dec.name)
  obj.data.calc_loop_triangles();report.append({'file':name,'mesh':obj.data.name,'before':before,'after':len(obj.data.loop_triangles)})
 bpy.ops.export_scene.gltf(filepath=str(OUT/f'{name}.glb'),export_format='GLB',export_yup=True,export_apply=True,export_image_format='AUTO')
(ROOT/'docs/wreck-optimization/geometry.json').write_text(json.dumps(report,indent=2))
