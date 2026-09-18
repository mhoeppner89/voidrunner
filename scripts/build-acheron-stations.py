"""Author Acheron station GLBs in Blender. Run through Blender MCP.
New scene only; existing scenes/objects are preserved. Units normalize to a 100-unit sphere.
"""
import bpy, math, random, json, os
from mathutils import Vector
import numpy as np
ROOT='/Users/mhoeppner/Desktop/Voidrunner'
OUT=ROOT+'/assets/models/stations'
os.makedirs(OUT,exist_ok=True)
scene=bpy.data.scenes.new('Acheron stations authoring')
bpy.context.window.scene=scene
random.seed(829)
# Shared 512-square panel map: sharp seams, fasteners, restrained wear.
size=512
rng=np.random.default_rng(829)
pixels=np.ones((size,size,4),dtype=np.float32)
a=np.full((size,size),.67,dtype=np.float32)
for y in range(0,512,64):
 for x in range(0,512,64):
  w=64;h=64;v=float(rng.uniform(.56,.78));a[y:y+h,x:x+w]=v
  a[y:y+2,x:x+w]=.16;a[y:y+h,x:x+2]=.16
  a[y+3:y+4,x+4:x+w-3]=v+.1;a[y+4:y+h-3,x+3:x+4]=v+.07
  for dx,dy in [(7,7),(56,7),(7,56),(56,56)]:a[y+dy:y+dy+2,x+dx:x+dx+2]=.25
  if (x//64+y//64)%3==0:
   for i in range(5):a[y+20+i*4:y+22+i*4,x+36:x+54]=.24
  for i in range(4):
   sx=int(rng.integers(9,52));sy=int(rng.integers(8,58));a[y+sy,x+sx:x+sx+int(rng.integers(2,8))]=v+.14
for k in range(3):pixels[:,:,k]=a
image=bpy.data.images.new('Acheron structural panels 512',width=size,height=size)
image.pixels.foreach_set(pixels.ravel());image.pack()
def mat(name,color,metal=.4,rough=.6,texture=False,emit=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 if texture:
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=image
  # Separate tinted materials share one bitmap; glTF baseColorFactor preserves tint.
  m.node_tree.links.new(t.outputs['Color'],n.inputs['Base Color'])
  m['export_tint']=list(color)
 if emit:n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emit
 return m
M={
 'ivory':mat('Warm ceramic armor',(.66,.61,.48),.25,.65,True),
 'steel':mat('Blue grey structural steel',(.27,.34,.39),.6,.5,True),
 'rust':mat('Oxide red refinery cladding',(.42,.15,.075),.35,.72,True),
 'gold':mat('Ochre docking identification',(.8,.48,.08),.3,.6,True),
 'dark':mat('Recesses and heat exchangers',(.028,.04,.047),.55,.78),
 'warm':mat('Occupied windows',(.85,.55,.22),.1,.35,False,1.5),
 'cool':mat('Dock guidance',(.2,.64,.66),.1,.3,False,1.5),
}
objects=[]
def finish(o,name,material):
 o.name=name;o.data.materials.append(M[material]);objects.append(o);return o
def box(name,loc,scale,material='steel',bevel=.3):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=scale
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('Manufactured corners','BEVEL');mod.width=min(bevel,min(scale)*.22);mod.segments=1
  bpy.ops.object.modifier_apply(modifier=mod.name)
 return finish(o,name,material)
def cyl(name,loc,r,depth,material='steel',vertices=16,r2=None):
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=depth,location=loc)
 return finish(bpy.context.object,name,material)
def beam(name,a,b,width,material='steel'):
 a,b=Vector(a),Vector(b);o=box(name,(a+b)/2,(width,width,(b-a).length),material,0);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def ring(name,r,thick,z,height,material='steel',n=32):
 verts=[]
 for zz in [z-height/2,z+height/2]:
  for rr in [r-thick/2,r+thick/2]:
   verts.extend([(rr*math.cos(i*2*math.pi/n),rr*math.sin(i*2*math.pi/n),zz)for i in range(n)])
 faces=[]
 for i in range(n):
  j=(i+1)%n
  faces.extend([(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),(i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)])
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o);return finish(o,name,material)
def quad(name,verts,material):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],[(0,1,2,3)]);mesh.update();o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o);return finish(o,name,material)
def windows_ring(r,z,rows,count=48,width=1.05,slope=0):
 for row in range(rows):
  for i in range(count):
   if (i+row*7)%9 in [0,1,5]:continue
   a=i*2*math.pi/count;d=width/r
   quad('Habitation window',[((r+slope*(zz-z))*math.cos(math.pi/32)/math.cos((t%(math.tau/32))-math.pi/32)*math.cos(t),(r+slope*(zz-z))*math.cos(math.pi/32)/math.cos((t%(math.tau/32))-math.pi/32)*math.sin(t),zz)for t,zz in [(a-d,z+row*2),(a+d,z+row*2),(a+d,z+row*2+.65),(a-d,z+row*2+.65)]],'warm')
def hangar(x,y,z,w=20,h=10,depth=16):
 # Open toward -Y; floor, deep rear wall and connected jambs form a real recess.
 box('Dock floor',(x,y,z-h/2),(w+4,depth,1.7),'steel')
 box('Dock roof',(x,y,z+h/2),(w+4,depth,2),'ivory')
 for side in [-1,1]:
  box('Dock jamb',(x+side*(w/2+1),y,z),(2,depth,h),'ivory')
  box('Dock mouth marking',(x+side*(w/2+1),y-depth/2-.08,z),(2.15,.3,h*.75),'gold',0)
  box('Dock approach light',(x+side*(w/2-.2),y-depth/2-.25,z),( .35,.4,h*.6),'cool',0)
 box('Dock rear bulkhead',(x,y+depth/2-.4,z),(w,1,h),'dark',0)
 for i in range(4):box('Dock floor lane',(x+(i-1.5)*w/5,y,z-h/2+.9),(.35,depth*.85,.04),'gold',0)
def tower(x,y,z):
 box('Command neck',(x,y,z),(10,10,18),'steel')
 box('Command gallery',(x,y,z+9),(18,13,5),'ivory')
 box('Bridge glazing',(x,y-6.52,z+9),(15,.1,1.5),'dark',0)
 for i in range(7):box('Bridge lights',(x-6+i*2,y-6.59,z+9),(1.1,.1,.45),'warm',0)
 cyl('Antenna mast',(x,y,z+20),.4,18,'steel',8)
 beam('Antenna spar',(x-5,y,z+22),(x+5,y,z+22),.35)
def export(id):
 # Apply parts, planar UVs aligned to local structural faces, batch by material.
 bpy.context.view_layer.update()
 for o in objects:
  bpy.context.view_layer.objects.active=o;o.select_set(True)
  bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);o.select_set(False)
  uv=o.data.uv_layers.new(name='Structural panel UV')
  for poly in o.data.polygons:
   axis=max(range(3),key=lambda k:abs(poly.normal[k]));axes=[k for k in range(3)if k!=axis]
   for li in poly.loop_indices:
    v=o.data.vertices[o.data.loops[li].vertex_index].co+o.location
    uv.data[li].uv=(v[axes[0]]/64,v[axes[1]]/64)
 maxr=max((o.matrix_world@v.co).length for o in objects for v in o.data.vertices)
 for o in objects:o.location*=100/maxr;o.scale*=100/maxr
 groups={key:[o for o in objects if o.data.materials[0]==m]for key,m in M.items()}
 for key,group in groups.items():
  if not group:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in group:o.select_set(True)
  bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();group[0].name=id+' / '+key
 bpy.ops.object.select_all(action='DESELECT')
 current=[o for o in scene.objects if o.type=='MESH'and not o.hide_render]
 for o in current:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=OUT+'/'+id+'.glb',export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_extras=False)
 tris=sum(len(p.vertices)-2 for o in current for p in o.data.polygons)
 bounds={ 'id':id,'triangles':tris,'materials':len(current),'sourceRadius':maxr }
 for o in current:o.hide_set(True);o.hide_render=True
 objects.clear();return bounds
report=[]
# HAVEN: dense layered trading sphere; deeply recessed equatorial docks.
cyl('Central pressure hull',(0,0,0),29,39,'steel',32)
cyl('Lower habitation slope',(0,0,-24),23,18,'ivory',32,r2=36)
cyl('Upper habitation slope',(0,0,23),38,18,'ivory',32,r2=24)
for z,r in [(-32,24.3),(-16,35),(15,38),(33,25)]:ring('Armored belt',r,3,z,3,'ivory')
for z,r in [(-11,29.08),(2,29.08)]:windows_ring(r,z,3,64)
windows_ring(38-(19-14)*14/18+.08,19,3,64,slope=-14/18)
for i in range(12):
 if i==9:continue # keep the main docking mouth unobstructed
 a=i*math.tau/12;x,y=43*math.cos(a),43*math.sin(a)
 beam('Dock radial spine',(20*math.cos(a),20*math.sin(a),0),(x,y,0),6)
 o=box('Dock sector armor',(x,y,3),(17,14,9),'ivory');o.rotation_euler.z=a
 o=box('Service deck',(x,y,-4),(18,16,3),'steel');o.rotation_euler.z=a
# Signature front bay below the city tiers, actually attached to hull.
hangar(0,-42,-3,24,12,24)
for x in [-14,14]:
 box('Freight transfer trunk',(x,-34,-17),(8,17,14),'steel')
 for z in [-22,-17,-12]:box('Container stack',(x,-43,z),(7,8,3.4),'gold' if z==-17 else 'rust')
for i in range(8):
 a=i*math.tau/8
 o=box('Crown habitation block',(19*math.cos(a),19*math.sin(a),39),(9,8,13+3*(i%3)),'ivory');o.rotation_euler.z=a
 cyl('Crown base',(0,0,33),24,3,'steel',24) if i==0 else None
cyl('Communications core',(0,0,39),9,20,'steel',12,r2=7)
tower(0,0,52)
for x in [-10,10]:beam('Ventral communications',(x,0,-29),(x*.7,0,-53),1.3)
report.append(export('haven'))
# UNITY: longitudinal open drydock, connected ribs, paired service arms.
box('Keel foundation',(0,0,-9),(43,130,10),'steel',2)
box('Inset drydock floor',(0,0,-3.8),(32,125,.8),'dark',0)
for x in [-22,22]:
 box('Armored dock spine',(x,0,0),(10,132,15),'ivory',1.5)
 box('Identification belt',(x,-1,7.7),(9,125,.55),'gold',0)
 for y in [-51,-25,1,27,53]:
  box('Gantry pier',(x,y,19),(6,8,35),'steel',.6)
  beam('Pier buttress',(x*1.55,y,-6),(x,y,30),3)
  box('Outboard service block',(x*1.45,y,-1),(13,17,11),'steel')
  for j in range(3):box('Service cooling fins',(x*1.65,y-5+j*5,5.5),(12,1.2,2),'dark',0)
for y in [-51,-25,1,27,53]:
 beam('Roof arch left',(-22,y,34),(-12,y,43),4)
 beam('Roof arch crown',(-12,y,43),(12,y,43),4)
 beam('Roof arch right',(12,y,43),(22,y,34),4)
 for x in [-16,16]:
  box('Dock crane rail',(x,y,29),(2,10,3),'gold')
  beam('Crane arm',(x,y,29),(x*.42,y,23),1.8,'steel')
for x in [-12,12]:
 box('Guidance strip',(x,0,-3.25),(.55,123,.1),'cool',0)
 for y in range(-55,61,10):box('Dock floor stripe',(x*.4,y,-3.2),(6,1.7,.12),'gold',0)
box('Rear dock support',(0,62,13),(43,8,40),'steel')
tower(0,59,39)
for x in [-39,39]:
 cyl('Propellant reservoir',(x,29,-2),6,27,'ivory',16)
 for z in [-13,-2,9]:ring('Tank straps',6.3,1,z,1.1,'gold',16).location.x=x;objects[-1].location.y=29
 beam('Reservoir connector',(x,29,-6),(x*.57,29,-6),4)
# two exterior service berths, each with supported floor.
hangar(-34,-69,-4,12,8,20);hangar(34,-69,-4,12,8,20)
report.append(export('league-yard'))
# CINDERFALL: pressure-shielded habitat above a heavy working refinery.
cyl('Habitat main drum',(0,0,15),22,35,'ivory',32)
cyl('Radiation shield',(0,0,37),32,6,'steel',32,r2=28)
ring('Habitat collar',23,4,28,4,'rust',32)
windows_ring(22.15,7,6,64,.8)
cyl('Foundation pressure taper',(0,0,-9),17,14,'steel',24,r2=23)
ring('Refinery service platform',38,17,-16,5,'steel',32)
for i in range(6):
 a=i*math.tau/6;x,y=34*math.cos(a),34*math.sin(a)
 beam('Refinery main service trunk',(0,0,-15),(x,y,-15),6)
 cyl('Fractionation vessel',(x,y,-3),7,36,'rust',16,r2=6)
 cyl('Vessel domed cap',(x,y,16.8),6,3.5,'ivory',16,r2=3)
 for z in [-17,-8,3,13]:
  o=ring('Vessel hoop',7-(z+21)/36,.8,z,1,'steel',16);o.location.x=x;o.location.y=y
 beam('Feed pipe',(x,y,-21),(x*.48,y*.48,-28),1.8,'gold')
for side in [-1,1]:
 beam('Radiator yoke',(side*19,0,24),(side*62,0,24),4)
 box('Radiator backing',(side*54,0,23),(23,43,1.8),'dark',.2)
 for j in range(9):box('Heat rejection fins',(side*54,-19+j*4.7,24),(22,.8,2.5),'steel',0)
 for x in [side*43,side*65]:beam('Radiator edge',(x,-22,23),(x,22,23),1.2,'rust')
hangar(0,-34,-4,20,10,22)
tower(0,0,46)
cyl('Ventral heat stack',(0,0,-32),9,30,'steel',16,r2=12)
for z in [-43,-35,-27]:ring('Heat stack jacket',12,2,z,2,'rust',24)
report.append(export('cinderfall'))
# Save only this scene and its dependencies, preserving the user's open file.
for o in scene.objects:
 o.hide_set(False);o.hide_render=False;o.location.x += {'haven':-260,'league-yard':0,'cinderfall':260}[o.name.split(' / ')[0]]
bpy.data.libraries.write(ROOT+'/glb_models/acheron-stations.blend',{scene},fake_user=True)
with open(ROOT+'/.freebuff/acheron-stations/build-report.json','w')as f:json.dump(report,f,indent=2)
result={'models':report,'source':ROOT+'/glb_models/acheron-stations.blend'}
