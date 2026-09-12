"""Preview an asymmetric Talon breakup: detached wing root and oblique nose break.
Run in background Blender. Retains source UVs; dark caps only on new fractures.
"""
import bpy,bmesh,math,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from prepare_fighter_wreck import join_source_meshes,make_cut_material,disable_emission,export_glb
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/models/ships/talon.glb'))
base=join_source_meshes();cut=make_cut_material();disable_emission()
# Coordinates are X forward, Y lateral, Z up. Wing root follows the swept
# fuselage edge, rather than slicing both wings into matching horizontal strips.
wing=(Vector((0,.27,0)),Vector((-.18,1,.12)).normalized())
nose=(Vector((.38,0,0)),Vector((1,.22,.32)).normalized())
def fracture(bm,plane,positive,material_index):
 origin,normal=plane
 tangent=normal.cross(Vector((0,0,1))).normalized();bitangent=normal.cross(tangent).normalized()
 def offset(p):return .012*(.6*math.sin(p.dot(tangent)*67)+.4*math.sin(p.dot(bitangent)*103+.7))
 for v in bm.verts:v.co-=normal*offset(v.co)
 result=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=origin,plane_no=normal,clear_inner=positive,clear_outer=not positive,dist=1e-7)
 edges=[e for e in result.get('geom_cut',[]) if isinstance(e,bmesh.types.BMEdge) and e.is_valid]
 if edges:
  faces=bmesh.ops.holes_fill(bm,edges=edges,sides=0).get('faces',[])
  for f in faces:f.material_index=material_index
  bmesh.ops.triangulate(bm,faces=faces)
 for v in bm.verts:v.co+=normal*offset(v.co)
for name,planes,rotation,translation in [
 ('Talon wreck engine',[(wing,False),(nose,False)],(-.05,.04,-.06),(-.04,0,0)),
 ('Talon wreck wing core',[(wing,True)],(.40,-.20,.35),(-.18,.48,.14)),
 ('Talon wreck nose',[(wing,False),(nose,True)],(-.19,.12,-.15),(.18,-.07,.09)),
]:
 obj=base.copy();obj.data=base.data.copy();obj.name=name;bpy.context.collection.objects.link(obj)
 obj.data.materials.append(cut);idx=len(obj.data.materials)-1
 bm=bmesh.new();bm.from_mesh(obj.data)
 for plane,positive in planes:fracture(bm,plane,positive,idx)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
 bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY',center='BOUNDS');obj.rotation_euler=rotation;obj.location+=Vector(translation)
 print(name,len(obj.data.polygons))
bpy.data.objects.remove(base,do_unlink=True)
export_glb(str(ROOT/'.freebuff/wreck-optimization/rebuilt/talon-wreck.glb'))
