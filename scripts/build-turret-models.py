import bpy, math, json
from pathlib import Path
root=Path('/Users/mhoeppner/Desktop/Voidrunner')
collection=bpy.data.collections.new('Voidrunner_Turrets');bpy.context.scene.collection.children.link(collection)
materials={}
for name,color,metal in [('armor',(0.20,0.27,0.30,1),.75),('dark',(0.045,0.065,0.075,1),.65),('brass',(.62,.43,.16,1),.8),('lens',(.08,.75,.85,1),.25)]:
 m=bpy.data.materials.new('Turret_'+name);m.diffuse_color=color;m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=color;m.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value=metal;m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.38;materials[name]=m
parts=[]
def box(kind,part,name,loc,scale,mat='armor'):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=kind+'_'+name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 bevel=o.modifiers.new('Machined edges','BEVEL');bevel.width=.035;bevel.segments=1;bpy.ops.object.modifier_apply(modifier=bevel.name)
 finish(o,kind,part,mat)
def cyl(kind,part,name,loc,radius,depth,mat='dark',axis='Y'):
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=radius,depth=depth,location=loc,rotation=(math.pi/2,0,0) if axis=='Y' else (0,0,0));o=bpy.context.object;o.name=kind+'_'+name;finish(o,kind,part,mat)
def finish(o,kind,part,mat):
 for c in list(o.users_collection):c.objects.unlink(o)
 collection.objects.link(o);o.data.materials.append(materials[mat]);o['kind']=kind;o['part']=part;parts.append(o)
for kind in ['laser','pdc']:
 cyl(kind,'base','foot',(0,-.5,0),.48,.18,'dark')
 cyl(kind,'base','bearing',(0,-.35,0),.35,.15,'brass')
 for x in [-.38,.38]:box(kind,'base','bolted_flange',(x,-.47,0),(.15,.16,.55))
 box(kind,'yaw','cradle',(0,-.21,.02),(.67,.18,.62))
 for x in [-.32,.32]:box(kind,'yaw','trunnion',(x,-.06,.02),(.13,.4,.35),'brass')
 if kind=='laser':
  box(kind,'pitch','emitter_housing',(0,.04,-.08),(.44,.33,.58))
  box(kind,'pitch','emitter_shroud',(0,.04,-.55),(.28,.24,.48),'dark')
  box(kind,'pitch','lens',(0,.04,-.8),(.20,.15,.025),'lens')
  for z in [.05,.16,.27]:box(kind,'pitch','cooling_fin',(0,.10,z),(.55,.045,.035),'brass')
 else:
  box(kind,'pitch','receiver',(0,.02,.06),(.48,.34,.55))
  for x in [-.105,.105]:
   for y in [-.065,.125]:cyl(kind,'pitch','barrel',(x,y,-.46),.06,.95,'dark',axis='Z')
  box(kind,'pitch','ammo_drum',(.35,.02,.10),(.22,.38,.43),'brass')
  box(kind,'pitch','sensor',(-.31,.19,.03),(.13,.12,.17),'lens')
# Bake evaluated Blender meshes into a compact browser mesh module. The same
# source geometry is saved as .blend for editing; no runtime modelling occurs.
data={k:[] for k in ['laser','pdc']}
for o in parts:
 mesh=o.data;mesh.calc_loop_triangles();positions=[];normals=[]
 for tri in mesh.loop_triangles:
  for index in tri.vertices:
   v=o.matrix_world @ mesh.vertices[index].co;positions.extend(round(c,5) for c in v)
   n=o.matrix_world.to_3x3() @ tri.normal; n.normalize();normals.extend(round(c,5) for c in n)
 mat=o.data.materials[0];data[o['kind']].append({'part':o['part'],'positions':positions,'normals':normals,'color':list(mat.diffuse_color)[:3]})
(root/'src/game/turretModelData.js').write_text('// Generated in Blender by scripts/build-turret-models.py.\nexport const TURRET_MODEL_DATA='+json.dumps(data,separators=(',',':'))+';\n')
# Save an isolated model asset without overwriting the current working scene.
bpy.data.libraries.write(str(root/'assets/models/turrets/turrets.blend'),{collection},fake_user=True)
result={'objects':len(parts),'triangles':sum(len(x['positions'])//9 for v in data.values() for x in v),'blend':str(root/'assets/models/turrets/turrets.blend')}
