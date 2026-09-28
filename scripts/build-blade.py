import bpy,math,json
from mathutils import Vector
from pathlib import Path
P=Path('/Users/mhoeppner/Desktop/Voidrunner/.freebuff/blade')
bpy.ops.wm.read_factory_settings(use_empty=True)
parts=[]
def mat(n,c,m=.35,r=.4):
 a=bpy.data.materials.new(n);a.diffuse_color=(*c,1);a.use_nodes=True;b=a.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*c,1);b.inputs['Metallic'].default_value=m;b.inputs['Roughness'].default_value=r;return a
navy=mat('Blade — midnight blue enamel',(.014,.025,.071),.18,.44)
silver=mat('Blade — cool silver markings',(.43,.46,.49),.55,.33)
dark=mat('Blade — panel joints and recesses',(.008,.012,.018),.3,.55)
steel=mat('Blade — gunmetal hardware',(.085,.095,.108),.8,.3)
glass=mat('Blade — black reflective canopy',(.008,.013,.021),.7,.13)
engine=mat('Blade — unlit engine ceramic',(.045,.05,.057),.65,.42)
def mesh(n,v,f,m=navy,bev=0):
 me=bpy.data.meshes.new(n);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(n,me);bpy.context.collection.objects.link(o);o.data.materials.append(m);parts.append(o)
 if bev:
  bpy.context.view_layer.objects.active=o;o.select_set(True);mod=o.modifiers.new('Fine manufactured edge','BEVEL');mod.width=bev;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name);o.select_set(False)
 return o
def box(n,loc,scale,m=navy,b=.002):
 x,y,z=loc;a,c,d=[v/2 for v in scale];return mesh(n,[(x+i*a,y+j*c,z+k*d) for k in [-1,1] for j in [-1,1] for i in [-1,1]],[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],m,b)
def cyl(n,a,b,r,m=steel,sides=12,inner=0):
 a,b=Vector(a),Vector(b);z=(b-a).normalized();x=z.cross(Vector((0,0,1)))
 if x.length<.01:x=z.cross(Vector((1,0,0)))
 x.normalize();y=z.cross(x);v=[]
 for p,rr in [(a,r),(b,r)]+([(a,inner),(b,inner)] if inner else []):
  v += [tuple(p+rr*(math.cos(i*2*math.pi/sides)*x+math.sin(i*2*math.pi/sides)*y)) for i in range(sides)]
 f=[]
 for i in range(sides):
  j=(i+1)%sides;f.append((i,j,sides+j,sides+i))
  if inner:f.extend([(i,2*sides+i,2*sides+j,j),(sides+i,sides+j,3*sides+j,3*sides+i),(2*sides+i,3*sides+i,3*sides+j,2*sides+j)])
 if not inner:f.extend([tuple(reversed(range(sides))),tuple(range(sides,2*sides))])
 return mesh(n,v,f,m)
def plate(n,pts,m=navy,depth=.006):
 v=[tuple(p) for p in pts]+[(p[0],p[1],p[2]-depth) for p in pts];k=len(pts);f=[tuple(range(k)),tuple(reversed(range(k,2*k)))]+[(i,(i+1)%k,(i+1)%k+k,i+k) for i in range(k)];return mesh(n,v,f,m)
def line(n,a,b,r=.0015,m=dark):return cyl(n,a,b,r,m,4)
def panel(n,p,m=navy,inset=.004):
 c=sum((Vector(q) for q in p),Vector())/len(p);q=[tuple(Vector(x)+(c-Vector(x)).normalized()*inset+Vector((0,0,.0035 if m!=silver else .007))) for x in p];return plate(n,q,m,.003)
# Hull loft: measured cross-sections, with explicit planar chines.
stations=[(-.997,.052,-.123,-.185),(-.84,.149,-.078,-.213),(-.61,.246,-.043,-.223),(-.34,.303,-.038,-.224),(-.18,.255,-.058,-.224),(.06,.258,-.025,-.215),(.72,.255,-.002,-.185)]
v=[]
for y,w,t,b in stations:v.extend([(-w*.68,y,t),(w*.68,y,t),(w,y,t-.043),(w*.97,y,b+.03),(w*.58,y,b),(-w*.58,y,b),(-w*.97,y,b+.03),(-w,y,t-.043)])
f=[tuple(reversed(range(8)))];f += [(i*8+j,i*8+(j+1)%8,(i+1)*8+(j+1)%8,(i+1)*8+j) for i in range(len(stations)-1) for j in range(8)];f.append(tuple(range(len(v)-8,len(v))));body=mesh('01 — continuous faceted fuselage',v,f,navy,.0025)
# Paint and panel seams follow the hull's actual faces.
for i in range(len(stations)-1):
 for j in [0,1,7]:
  ids=[i*8+j,i*8+(j+1)%8,(i+1)*8+(j+1)%8,(i+1)*8+j];pts=[tuple(Vector(v[k])+Vector((0,0,.001))) for k in ids];panel('Hull panel',pts,navy,.002)
# Silver nose arrow, seated on each segment of the dorsal plane.
for i in range(2):
 y,w,z,_=stations[i];yy,ww,zz,_=stations[i+1];plate('Nose silver centre band',[(-w*.45,y,z+.009),(w*.45,y,z+.009),(ww*.36,yy,zz+.009),(-ww*.36,yy,zz+.009)],silver,.002)
# Dorsal spine box/chamfer loft with a silver forward wedge.
sp=[(-.315,.097,.029),(-.09,.108,.04),(.17,.102,.065),(.72,.085,.07)]
v2=[]
for i,(y,w,z) in enumerate(sp):
 shoulder=.052 if i==0 else .025;roof=.56 if i==0 else .72
 v2 += [(-w,y,-.065),(w,y,-.065),(w,y,z-shoulder),(w*roof,y,z),(-w*roof,y,z),(-w,y,z-shoulder)]
mesh('02 — raised central dorsal spine',v2,[tuple(reversed(range(6))),tuple(range(18,24))]+[(i*6+j,i*6+(j+1)%6,(i+1)*6+(j+1)%6,(i+1)*6+j) for i in range(3) for j in range(6)],navy,0)
plate('Spine silver forward wedge',[(-.05432,-.315,.0291),(.05432,-.315,.0291),(.07776,-.09,.0401),(-.07776,-.09,.0401)],silver,.001)
# Canopy: continuous framed shell, six fitted dark panes.
can=[(-.85,.052,-.070),(-.65,.098,.007),(-.48,.112,.033),(-.315,.097,.029)]
cv=[]
for y,w,z in can:cv += [(-w,y,z-.052),(-w*.56,y,z),(w*.56,y,z),(w,y,z-.052)]
mesh('03 — canopy silver frame shell',cv,[(i*4+j,i*4+j+1,(i+1)*4+j+1,(i+1)*4+j) for i in range(3) for j in range(3)]+[(0,3,7,4),(12,13,14,15)],silver)
for i in range(3):
 for j in range(3):
  q=[Vector(cv[k]) for k in [i*4+j,i*4+j+1,(i+1)*4+j+1,(i+1)*4+j]];c=sum(q,Vector())/4;q=[tuple(p+(c-p).normalized()*.008+Vector((0,0,.0018))) for p in q];plate('Canopy fitted pane',q,glass,.002)
# Symmetrical wing panels, pod bodies and fins.
for sign in [-1,1]:
 side='Port' if sign<0 else 'Starboard'
 def pts(q):return [(sign*x,y,z) for x,y,z in q]
 def wp(x,y):
  # Broader inboard shoulder, retaining the swept outer wing and fin anchors.
  y-=.025*max(0,1-abs(x-.49)/.25)*max(0,1-(y+.075)/.40)
  return (x,y,-.06+.025*y)
 wing=[wp(.24,-.19),wp(.49,-.075),wp(.66,.065),wp(.965,.61),wp(.976,.96),wp(.635,.715),wp(.25,.72)]
 # A chamfered leading edge joins the upper skin to a narrower underside.
 # The front chine carries the outline, with the top edge set aft into the wing.
 upper=[(x,y+(.018 if i<4 else 0),z) for i,(x,y,z) in enumerate(wing)]
 chine=[(x,y,z-.019) for x,y,z in wing]
 lower=[(x,y+(.010 if i<4 else 0),z-.058) for i,(x,y,z) in enumerate(wing)]
 k=len(wing);wv=pts(upper+chine+lower)
 wf=[tuple(range(k)),tuple(reversed(range(2*k,3*k)))]+[(j*k+i,j*k+(i+1)%k,(j+1)*k+(i+1)%k,(j+1)*k+i) for j in range(2) for i in range(k)]
 mesh(side+' swept wing with bevelled leading edge',wv,wf,navy)
 # Cut the wing surface into logical, broad panels.
 tiles=[[(.24,-.19),(.49,-.075),(.47,.16),(.25,.12)],[(.49,-.075),(.66,.065),(.65,.27),(.47,.16)],[(.25,.12),(.47,.16),(.46,.42),(.25,.42)],[(.47,.16),(.65,.27),(.64,.48),(.46,.42)],[(.25,.42),(.46,.42),(.46,.72),(.25,.72)],[(.46,.42),(.64,.48),(.635,.715),(.46,.72)],[(.66,.065),(.79,.30),(.77,.45),(.65,.27)],[(.79,.30),(.90,.49),(.87,.62),(.77,.45)],[(.90,.49),(.965,.61),(.97,.78),(.87,.62)],[(.65,.27),(.77,.45),(.87,.62),(.64,.48)],[(.64,.48),(.87,.62),(.97,.78),(.976,.96),(.635,.715)]]
 for n,t in enumerate(tiles):
  q=[wp(x,y) for x,y in t]
  for i,(x,y,z) in enumerate(q):
   for wx,wy,wz in wing[:4]:
    if abs(x-wx)<1e-6 and abs(y-wy)<1e-6:q[i]=(x,y+.018,z)
  # These panels sit on the solid wing; their hidden undersides need no faces.
  ob=panel(side+' wing plating %02d'%n,pts(q),navy,.002)
  import bmesh
  bm=bmesh.new();bm.from_mesh(ob.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.faces[1]],context='FACES');bm.to_mesh(ob.data);bm.free()
 # Silver wing stripe across the swept outer panel, and shoulder marking.
 panel(side+' silver wing chevron',pts([wp(.72,.36),wp(.89,.55),wp(.943,.685),wp(.706,.46)]),silver,.001)
 panel(side+' silver shoulder',pts([wp(.31,-.14),wp(.45,-.075),wp(.43,.02),wp(.30,-.035)]),silver,.001)
 # Launcher housing with sloped forward face: exact six ports per pod.
 x=.4;w=.145;y0=.10;y1=.245;y2=.72;zb=-.07;zt=.132
 q=[(x-w,y0,zb),(x+w,y0,zb),(x+w,y2,zb),(x-w,y2,zb),(x-w*.78,y1,zt),(x+w*.78,y1,zt),(x+w*.78,y2,zt),(x-w*.78,y2,zt)]
 mesh(side+' six-cell launcher housing',pts(q),[(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7),(0,3,2,1)],navy,.002)
 # Flush dark sloping cavity, sockets point perpendicular to its front plane.
 def face(u,t,offset=0):return (sign*(x+u),y0+(y1-y0)*t-offset,zb+(zt-zb)*t+.002)
 plate(side+' recessed launcher face',[face(-.108,.12,.001),face(.108,.12,.001),face(.091,.86,.001),face(-.091,.86,.001)],dark,.006)
 normal=Vector((0,-(zt-zb),y1-y0)).normalized()
 for row,t in enumerate([.36,.68]):
  for col,u in enumerate([-.066,0,.066]):
   p=Vector(face(u,t,.002));cyl(side+f' launcher rim {row}-{col}',p,p+normal*.007,.024,steel,8,.016)
   cyl(side+' dark launch tube',p-normal*.002,p,.016,dark,8)
 # Silver band over rear pod and down its sides.
 plate(side+' pod roof silver band',pts([(x-w*.78,.49,zt+.002),(x+w*.78,.49,zt+.002),(x+w*.78,.57,zt+.002),(x-w*.78,.57,zt+.002)]),silver)
 for sg in [-1,1]:
  plate(side+' pod side silver band',pts([(x+sg*w,.49,zb+.006),(x+sg*w,.57,zb+.006),(x+sg*w*.78,.57,zt+.002),(x+sg*w*.78,.49,zt+.002)]),silver)
 # Tall wingtip fin; closed thick angular profile.
 def fin(n,x,profile,thick,m=navy):
  vv=[(sign*(x+d),y,z) for d in [-thick/2,thick/2] for y,z in profile];k=len(profile);return mesh(n,vv,[tuple(range(k)),tuple(reversed(range(k,2*k)))]+[(i,(i+1)%k,(i+1)%k+k,i+k) for i in range(k)],m,0)
 fin(side+' tall swept tip fin',.964,[(.515,-.09),(.80,.245),(.99,.249),(.99,-.14),(.60,-.14)],.047)
 box(side+' fin silver cap',(sign*.964,.895,.248),(.050,.19,.012),silver,0)
 # Visible structural seams on fin outer face.
 for a,b in [((sign*.990,.78,.218),(sign*.990,.72,-.11)),((sign*.990,.60,-.09),(sign*.990,.975,-.09))]:line(side+' fin joint',a,b)
 fin(side+' pod dorsal stabilizer',.4,[(.36,.132),(.52,.245),(.70,.245),(.73,.14)],.023)
 # Underwing gun cradles and physical hollow barrels.
 box(side+' weapon rack',(sign*.65,.22,-.145),(.23,.34,.08),dark)
 for k,xx in enumerate([.59,.72]):
  xx*=sign;cyl(side+' barrel jacket',(xx,.31,-.181),(xx,-.012,-.181),.043,steel,8)
  if k==0:
   for dx in [-.015,.015]:cyl(side+' twin cannon',(xx+dx,.0,-.181),(xx+dx,-.105,-.181),.012,steel,6,.007)
  else:
   cyl(side+' rotary muzzle',(xx,.005,-.181),(xx,-.047,-.181),.039,steel,8,.027)
   for j in range(6):
    a=j*math.pi/3;dx=.018*math.cos(a);dz=.018*math.sin(a);cyl(side+' rotary bore',(xx+dx,-.026,-.181+dz),(xx+dx,-.051,-.181+dz),.006,dark,4)
 # Nose silver shoulder panels and inset black service grilles.
 panel(side+' forward silver shoulder',pts([(.18,-.63,-.068),(.235,-.56,-.075),(.285,-.37,-.079),(.244,-.34,-.050)]),silver,.004)
 for y,x,z in [(-.70,.15,-.072),(-.47,.238,-.060),(-.27,.18,-.034)]:
  plate(side+' service access',pts([(x-.027,y-.035,z),(x+.027,y-.035,z),(x+.027,y+.035,z),(x-.027,y+.035,z)]),steel)
  plate(side+' vent dark interior',pts([(x-.020,y-.025,z+.002),(x+.020,y-.025,z+.002),(x+.020,y+.025,z+.002),(x-.020,y+.025,z+.002)]),dark)
 # Wing intake grille follows its panel slope.
 x=.60;y=.19;z=wp(x,y)[2]+.007;box(side+' wing vent frame',(sign*x,y,z),(.095,.13,.006),silver,.001)
 box(side+' wing vent recess',(sign*x,y,z+.004),(.078,.11,.003),dark,0)
 for yy in [-.035,0,.035]:box(side+' wing vent vane',(sign*x,y+yy,z+.006),(.079,.006,.004),steel,0)
# Recessed engine bells: continuous external casing, rolled lip and tapered throat.
def nozzle(name,x,z,r,front=.685,back=.85,sides=12):
 profile=[(front,r*.84),(.745,r),(back,r),(back+.003,r*.78),(.795,r*.64),(.746,r*.51)]
 vv=[(x+rr*math.cos(j*2*math.pi/sides),yy,z+rr*math.sin(j*2*math.pi/sides)) for yy,rr in profile for j in range(sides)]
 ff=[(k*sides+j,k*sides+(j+1)%sides,(k+1)*sides+(j+1)%sides,(k+1)*sides+j) for k in range(len(profile)-1) for j in range(sides)]
 ob=mesh(name,vv,ff,steel);ob.data.materials.append(dark)
 for face in ob.data.polygons:
  if face.index>=3*sides:face.material_index=1
 cyl(name+' recessed ceramic core',(x,.739,z),(x,.745,z),r*.50,engine,8)
 # Internal radial vanes stop at the throat, leaving a visible dark cavity.
 for j in range(6 if r>.06 else 0):
  a=j*math.pi/3;cyl(name+' throat vane',(x+r*.15*math.cos(a),.749,z+r*.15*math.sin(a)),(x+r*.49*math.cos(a),.749,z+r*.49*math.sin(a)),.0025,steel,4)
for sign in [-1,1]:
 side='Port' if sign<0 else 'Starboard'
 # The main engines emerge directly from the aft launcher/nacelle casing.
 nozzle(side+' main engine',sign*.40,.014,.101)
 # Small outboard manoeuvring engines have structural fairings into the wing.
 box(side+' auxiliary engine fairing',(sign*.615,.682,-.091),(.104,.14,.084),navy,.001)
 nozzle(side+' auxiliary engine',sign*.615,-.096,.043,.66,.825,8)
 # Heat-resistant collar and aft access seam.
 line(side+' nacelle aft joint',(sign*.283,.711,.127),(sign*.512,.711,.127),.002)
# Three fixed attachment rings only. Actual gun assemblies remain movable.
mounts=[('turret_rear_center',(0,.659,.077),(0,0,1)),('turret_ventral_port',(-.48,.50,-.112),(0,0,-1)),('turret_ventral_starboard',(.48,.50,-.112),(0,0,-1))]
for name,pos,normal in mounts:
 p=Vector(pos);n=Vector(normal)
 cyl(name+' armoured socket',p-n*.010,p+n*.005,.052,steel,10)
 cyl(name+' bearing ring',p+n*.005,p+n*.014,.044,navy,10,.030)
 cyl(name+' sealed mounting face',p+n*.006,p+n*.008,.030,dark,10)
# Spine vents.
for y in [.30,.47]:
 box('Spine vent rim',(0,y,.073),(.081,.10,.005),steel,0);box('Spine vent shadow',(0,y,.077),(.064,.08,.003),dark,0)
# Fit nose markings and access covers to the rebuilt hull, not estimated Z planes.
for ob in parts:
 if any(t in ob.name for t in ['forward silver shoulder','service access','vent dark interior']):
  offset=.012 if 'vent dark interior' in ob.name else .008
  for vi,vert in enumerate(ob.data.vertices):
   hit,loc,normal,index=body.ray_cast(Vector((vert.co.x,vert.co.y,1)),Vector((0,0,-1)))
   if hit:vert.co.z=loc.z+offset-(.003 if vi>=len(ob.data.vertices)//2 else 0)
# Seat gun clusters beneath the wing leading edges rather than protruding ahead.
for ob in parts:
 if any(t in ob.name for t in ['weapon rack','barrel jacket','twin cannon','rotary muzzle','rotary bore']):ob.location.y+=.18
 if any(t in ob.name for t in ['barrel jacket','twin cannon','rotary muzzle','rotary bore']):ob.location.z-=.025
# Recalculate outward normals and merge by material for a small draw-call count.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;o.name='Blade';bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
# Enforce exact bilateral symmetry after bevels and surface fitting.
import bmesh
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=(0,0,0),plane_no=(1,0,0),clear_inner=True,clear_outer=False);bm.to_mesh(o.data);bm.free()
mod=o.modifiers.new('Exact centreline symmetry','MIRROR');mod.use_axis[0]=True;mod.use_clip=True;mod.merge_threshold=.00001;bpy.ops.object.modifier_apply(modifier=mod.name)
o.data.calc_loop_triangles();tri=len(o.data.loop_triangles);print('FINAL_TRIANGLES',tri)
if tri>5000:raise RuntimeError('Triangle budget exceeded')
# UV map all surfaces; materials carry crisp paint without a noisy baked atlas.
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT')
for name,pos,normal in mounts:
 socket=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(socket);socket.location=Vector(pos)+Vector(normal)*.014;socket.rotation_euler=Vector(normal).to_track_quat('Z','Y').to_euler();socket.empty_display_size=.05;socket['role']='turret_socket';socket['mount_normal']=normal;socket.select_set(True)
(P/'mounts.json').write_text(json.dumps([{'name':name,'position':list(Vector(pos)+Vector(normal)*.014),'normal':normal,'coordinates':'Blender Z-up; nose -Y'} for name,pos,normal in mounts],indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(P/'blade-rebuilt.blend'))
bpy.ops.export_scene.gltf(filepath=str(P/'blade.glb'),export_format='GLB',use_selection=True,export_yup=True)
(P/'stats.json').write_text(json.dumps({'triangles':tri,'vertices':len(o.data.vertices),'materials':len(o.data.materials),'sourceTriangles':400000},indent=2))
# Shared studio renders, matching the source inspection cameras.
sc=bpy.context.scene;sc.render.engine='BLENDER_EEVEE';sc.render.resolution_x=1000;sc.render.resolution_y=800;sc.render.resolution_percentage=100
sc.world=bpy.data.worlds.new('Studio');sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.14,.16,.2,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.6
for loc,energy,size in [((2,-3,4),450,4),((-3,-1,2),250,3),((0,4,3),600,3)]:
 bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=energy;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(-l.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;sc.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=2.8
for name,loc in [('iso',(2,-3,2)),('top',(0,0,4)),('front',(0,-4,.01)),('side',(4,0,.01)),('rear',(2,3,1.5)),('bottom',(0,0,-4))]:
 cam.location=loc;cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();sc.render.filepath=str(P/'renders'/('rebuilt-'+name+'.png'));bpy.ops.render.render(write_still=True)
