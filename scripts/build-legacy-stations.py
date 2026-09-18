"""Rebuild the ten original ports in a separate Blender scene via MCP.
Shared construction helpers come from the Acheron authoring script; no old meshes reused.
"""
from pathlib import Path
ROOT='/Users/mhoeppner/Desktop/Voidrunner'
base=Path(ROOT+'/scripts/build-acheron-stations.py').read_text().split('report=[]')[0]
exec(base.replace("'Acheron stations authoring'","'Original systems station rebuild'").replace("'Acheron structural panels 512'","'Station structural panels 512'"))
report=[]
def pad(x,y,z,w,d):
 box('Landing apron',(x,y,z),(w,d,3),'steel',1)
 for sx in [-1,1]:
  box('Apron curb',(x+sx*(w/2-1),y,z+1.8),(1,d,1),'ivory',0)
  for yy in [-d*.4,0,d*.4]:box('Apron lights',(x+sx*(w/2-1),y+yy,z+2.4),(1.2,1.5,.3),'warm',0)
 for yy in [-d*.35,d*.35]:box('Landing box stripe',(x,y+yy,z+1.55),(w*.55,.5,.1),'gold',0)
 for xx in [-w*.275,w*.275]:box('Landing box stripe',(x+xx,y,z+1.55),(.5,d*.7,.1),'gold',0)
def tank(x,y,z,r,h,material='steel'):
 cyl('Pressure vessel',(x,y,z),r,h,material,16)
 cyl('Vessel shoulder',(x,y,z+h/2+1.5),r,3,material,16,r2=r*.65)
 for zz in [-h*.4,0,h*.4]:
  o=ring('Vessel reinforcement',r+.15,.7,z+zz,1,'gold',16);o.location.x=x;o.location.y=y
 beam('Vessel ladder',(x+r,y,z-h/2),(x+r,y,z+h/2),.6)
def railing(a,b,z):
 beam('Safety railing',(*a,z),(*b,z),.35,'gold')
 for t in [0,.25,.5,.75,1]:
  x=a[0]+(b[0]-a[0])*t;y=a[1]+(b[1]-a[1])*t;beam('Rail post',(x,y,z-2),(x,y,z),.25)
def dish(x,y,z,r):
 beam('Aerial mount',(x,y,z-8),(x,y,z),1.5)
 # Open shallow paraboloid, not a solid dinner plate.
 vs=[(x,y,z)];n=24
 for rr in [r*.5,r]:vs += [(x+rr*math.cos(i*math.tau/n),y+rr*math.sin(i*math.tau/n),z+3*(rr/r)**2)for i in range(n)]
 fs=[(0,1+i,1+(i+1)%n)for i in range(n)]+[(1+i,1+n+i,1+n+(i+1)%n,1+(i+1)%n)for i in range(n)]
 me=bpy.data.meshes.new('Reflector');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('Communications reflector',me);scene.collection.objects.link(o);finish(o,o.name,'ivory')
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 mod=o.modifiers.new('Reflector shell','SOLIDIFY');mod.thickness=.35;bpy.ops.object.modifier_apply(modifier=mod.name);o.select_set(False)
 for i in range(3):
  a=i*math.tau/3;beam('Feed support',(x+r*.8*math.cos(a),y+r*.8*math.sin(a),z+2),(x,y,z+8),.35)
 cyl('Receiver',(x,y,z+7),.6,3,'dark',8)
def save(id):report.append(export(id))
# HELIX: dense rotating commercial decks around a tall refinery spindle.
cyl('Refinery spindle',(0,0,0),13,105,'steel',24)
for z,r in [(-28,34),(-10,44),(10,44),(29,33)]:
 cyl('Habitation drum',(0,0,z),r,12,'steel',32)
 ring('Deck overhang',r+1.5,5,z-6,2,'ivory')
 windows_ring(r+.08,z-3,3,64)
 for i in range(8):
  a=i*math.tau/8;beam('Deck support',(13*math.cos(a),13*math.sin(a),z-12),(r*math.cos(a),r*math.sin(a),z-5),1.8)
for i in range(8):
 a=i*math.tau/8
 if i==6:continue
 o=box('Freight terminal',(40*math.cos(a),40*math.sin(a),-32),(15,12,10),'steel');o.rotation_euler.z=a
hangar(0,-59,-10,27,13,25)
for x in [-19,19]:box('Dock connector',(x,-44,-10),(10,27,10),'steel')
tower(0,0,57)
for x in [-22,22]:tank(x,0,38,5,15,'rust');beam('Tank foundation',(x,0,29),(0,0,29),4)
save('helix')
# ROOK: heavily armored twin bastions around a high, unobstructed gate.
box('Bastion foundation',(0,0,-39),(89,44,13),'steel',3)
for s in [-1,1]:
 box('Armored fortress pier',(s*32,0,0),(26,39,85),'steel',3)
 for z in [-25,-8,9,26]:
  box('Layered bastion armor',(s*32,-20,z),(25,3,12),'ivory',1)
  box('Armor stripe',(s*32,-21.6,z-3),(20,.2,.8),'gold',0)
 for x in [s*22,s*42]:box('Vertical reinforcement',(x,-23,0),(2,5,79),'steel')
 for z in range(-28,35,10):box('Slit guidance',(s*18.7,-14,z),(.4,6,2),'cool',0)
 box('Rear barracks',(s*32,25,-5),(25,16,47),'steel')
 for z in [-16,-5,6]:
  for x in range(5):box('Barracks windows',(s*32-8+x*4,33.1,z),(1.4,.1,.8),'warm',0)
box('Gate lintel',(0,0,43),(88,41,10),'steel',2)
box('Command gallery',(0,-3,50),(48,24,7),'ivory')
for x in range(-20,21,4):box('Command windows',(x,-15.1,50),(2,.1,1.2),'warm',0)
pad(0,-22,-31,34,68)
for s in [-1,1]:dish(s*32,5,57,8)
save('rook')
# CAIRN: compact open maintenance yard with a supported service gantry.
pad(0,-8,-10,66, 70)
box('Repair workshop',(-19,22,0),(25,21,20),'steel',1.5)
hangar(12,21,0,23,16,22)
for x in [-28,28]:
 box('Crane footing',(x,0,-4),(6,12,9),'steel')
 beam('Crane column',(x,0,-5),(x,0,28),3)
beam('Overhead crane',(-28,0,28),(28,0,28),4,'gold')
box('Hoist trolley',(-4,0,25),(12,6,4),'steel');beam('Hoist cable',(-4,0,23),(-4,0,13),.4)
box('Service coupling',(-4,0,12),(3,3,3),'gold')
for x in [-24,-13]:tank(x,25,17,4,15,'rust')
for x in [-24,24]:
 beam('Apron underbrace',(x,-37,-11),(x,20,-26),3)
box('Utilities keel',(0,18,-21),(45,21,19),'steel')
for x in [-27,27]:railing((x,-36),(x,30),-6)
save('cairn')
# ARGENT: orbital assembly ring around a clear construction volume.
ring('Shipworks outer hull',62,10,0,13,'steel',48)
for z in [-7,7]:ring('Armored ring edge',63,12,z,2,'ivory',48)
for i in range(8):
 a=i*math.tau/8;x,y=62*math.cos(a),62*math.sin(a)
 o=box('Ring works module',(x,y,10),(17,15,12),'steel');o.rotation_euler.z=a
 beam('Suspended cradle strut',(x,y,-5),(x*.52,y*.52,-20),2.5)
ring('Assembly cradle',32,4,-21,4,'gold',32)
for x in [-18,18]:
 box('Drydock keel',(x,0,-16),(5,93,6),'steel')
 for y in [-34,-12,12,34]:
  beam('Drydock stanchion',(x,y,-16),(x*1.6,y,12),2)
  beam('Drydock work arm',(x*1.6,y,12),(x*.8,y,17),1.4,'gold')
hangar(0,-81,2,26,13,24)
for x in [-18,18]:beam('Terminal bridge',(x,-51,0),(x,-81,0),7)
tower(0,62,25)
for i in range(32):
 a=i*math.tau/32
 o=box('Outer ring navigation lamp',(68*math.cos(a),68*math.sin(a),0),(1,1,1),'warm',0)
save('argent')
# GATEHOUSE: compact pass-through inspection frame and paired control wings.
for s in [-1,1]:
 box('Inspection block',(s*26,0,0),(18,42,34),'steel',2)
 box('Armor face',(s*26,-22,0),(18,3,30),'ivory',1)
 for z in [-12,12]:beam('Chamfered throat',(s*17,-23,z),(s*10,-23,z*1.7),3,'ivory')
 beam('Continuous inspection jamb',(s*17,-23,-12),(s*17,-23,12),3,'ivory')
 box('Inspection floodlight',(s*16.8,-10,0),(.35,20,8),'cool',0)
 box('Customs office',(s*27,1,21),(20,26,9),'ivory')
 for x in [-6,-2,2,6]:box('Office glazing',(s*27+x,-12.1,21),(2,.1,1),'warm',0)
 for y in [-12,12]:beam('Sensor boom',(s*34,y,0),(s*50,y,4),2);cyl('Sensor pod',(s*50,y,6),3,7,'steel',8)
for z in [-20.4,20.4]:beam('Frame crossbar',(-10,-23,z),(10,-23,z),3,'ivory')
for z in [-22,22]:box('Throat cross member',(0,0,z),(55,42,5),'steel',1)
for x in [-11,11]:box('Approach strip',(x,0,-19.4),(.5,39,.1),'cool',0)
dish(0,8,32,9);beam('Aerial plinth',(0,8,22),(0,8,26),5)
save('gatehouse-twelve')
# BLACKGLASS: port apron and terraced galleries seated against the moon.
# GLB has a dedicated authored local origin; runtime embeds its rear in moon surface.
pad(0,-18,-15,94,68)
for x in [-36,36]:
 box('Cliff anchor',(x,13,-16),(14,28,38),'steel',2)
 beam('Apron support',(x,-46,-17),(x,16,-38),4)
for z,w in [(0,83),(16,69),(31,51)]:
 box('Rock-cut gallery housing',(0,14,z),(w,22,12),'steel',2)
 box('Recessed gallery',(0,2.8,z),(w-7,.6,7),'dark',0)
 box('Balcony floor',(0,-1,z-5),(w+3,10,2),'steel')
 for x in range(-int(w/2)+7,int(w/2)-3,7):box('Tavern lamps',(x,2.3,z),(2,.2,2.4),'warm',0)
 railing((-w/2,-5),(w/2,-5),z-2)
hangar(-24,-15,-6.3,17,13,20);hangar(24,-15,-6.3,17,13,20)
for x in [-24,24]:box('Dock rock anchor',(x,1,-8),(21,14,10),'steel')
for x in [-45,45]:beam('Port beacon',(x,-45,-13),(x,-45,1),.8);cyl('Beacon lamp',(x,-45,2),.8,2,'warm',8)
save('blackglass')
# CINDER: dense industrial towers, linked catwalks and a tall freight gantry.
pad(0,-22,-20,85,61)
box('Refinery foundation',(0,21,-24),(78,48,19),'steel',2)
for x,y,r,h in [(-24,18,10,68),(0,29,12,88),(25,24,9,53),(-29,39,6,39)]:
 tank(x,y,-12+h/2,r,h)
 beam('Process feed',(x,y,-10),(x,-1,-10),2.3,'rust')
 beam('Process riser',(x,-1,-10),(x,-1,9),2.3,'rust')
for z in [5,28]:
 box('Catwalk',(-5,12,z),(65,6,1.8),'steel')
 railing((-37,8), (27,8),z+3)
for x in [-36,36]:beam('Cargo gantry',(x,-18,-18),(x,-18,23),4)
beam('Cargo lintel',(-36,-18,23),(36,-18,23),5)
for x in [-30,-18,-6,6,18,30]:box('Lintel lights',(x,-21,21),(3,.4,1),'warm',0)
hangar(23,2,-8,20,18,22)
for x in [-34,34]:beam('Underside brace',(x,-44,-22),(x,29,-42),4)
box('Rear load bearing keel',(0,29,-36),(78,12,18),'steel',1)
save('cinder')
# TORCHWELL: small worn fuel depot, three silo heights beside a broad apron.
pad(0,-12,-15, 80,65)
box('Fuel services',(15,22,-1),(39,26,26),'steel',1.5)
hangar(12,3,-2,22,19,18)
for x,y,h in [(-27,22,57),(-39,14, 30),(-17, 30,42)]:
 tank(x,y,-12+h/2,6,h,'ivory')
 beam('Fuel manifold',(x,y,-9),(x,-5,-9),1.8,'rust')
beam('Common fuel main',(-39,-5,-9),(3,-5,-9),2.2,'rust')
box('Control booth',( 30,5,0),(13,13,12),'steel')
box('Control window',(30,-1.6,2),(10,.1,4),'dark',0)
for x in [26,30,34]:box('Control light',(x,-1.7,2),(1,.1,1),'warm',0)
for x in [-33,33]:beam('Deck support',(x,-40,-17),(x,25,-33),3)
box('Service foundation',(0,23,-23),( 90,18,20),'steel',1)
save('torchwell')
M['ivory']=mat('Pale scientific ceramic',(.74,.79,.82),.25,.53,True)
# NACRE: clean domed laboratories joined by pressure tunnels.
def lab(x,y,z,r):
 cyl('Laboratory pressure deck',(x,y,z),r,10,'ivory',32)
 cyl('Observation band',(x,y,z+7),r*.91,5,'dark',32)
 for i in range(24):
  a=i*math.tau/24
  box('Window mullion',(x+r*.91*math.cos(a),y+r*.91*math.sin(a),z+7),(.65,.65,5),'ivory',0)
  if i%3:box('Lab interior light',(x+r*.913*math.cos(a),y+r*.913*math.sin(a),z+6),(1,1,.5),'warm',0)
 # Faceted hemispherical roof with explicit latitude rings.
 vs=[];n=32
 for j in range(6):
  a=j*math.pi/12;rr=max(.01,r*.95*math.cos(a));vs += [(x+rr*math.cos(i*math.tau/n),y+rr*math.sin(i*math.tau/n),z+10+r*.55*math.sin(a))for i in range(n)]
 fs=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i)for j in range(5)for i in range(n)]
 vs.append((x,y,z+10+r*.55));fs.extend([(5*n+i,5*n+(i+1)%n,6*n)for i in range(n)])
 me=bpy.data.meshes.new('Dome shell');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('Scientific dome',me);scene.collection.objects.link(o);finish(o,o.name,'ivory')
 for zz in [z-5,z+10]:
  o=ring('Laboratory collar',r*.97,1.5,zz,1.6,'steel',32);o.location.x=x;o.location.y=y
lab(0,10,0,26)
for s in [-1,1]:beam('Pressure transfer tunnel',(s*16,10,-.6),(s*44,10,-.6),7.2,'ivory');lab(s*44,10,-2,15)
cyl('Circular landing deck',(0,-29,-8),31,4,'ivory',48)
o=ring('Landing circle',20,.6,-5.82,.12,'gold',48);o.location.y=-29
box('Landing deck attachment',(0,-10,-10),(32,30,7.5),'steel')
cyl('Instrument keel',(0,7,-17),14,25,'steel',24,r2=20)
for x in [-17,17]:beam('Apron supports',(x,-48,-11),(x*.72,10,-27),2,'steel')
save('nacre')
# SHEPHERD: solitary communications lighthouse with landing pad and dish.
pad(0,-15,-15,65,65)
tank(-18,13,6,9,43,'steel')
cyl('Control gallery',(-18,13,26),12,7,'ivory',24)
box('Relay window',(-18,1,26),(10,.2,3),'dark',0)
for x in [-21,-18,-15]:box('Watch room light',(x,.8,26),(1,.2,1),'warm',0)
tank(-18,13, 40,5,23,'steel')
beam('Signal mast',(-18,13,51),(-18,13,70),.65)
cyl('Signal beacon',(-18,13,67),1.1,2,'warm',8)
dish(-4,14,33,9);beam('Dish bracket',(-17,13,23),(-4,14,26),3)
box('Service hut',(18,13,-5),(16,16,18),'steel');tank(18,13,7,4,5)
for x in [-27,27]:railing((x,-43),(x,10),-10);beam('Platform truss',(x,-40,-17),(x,13,-35),2.5)
cyl('Ventral utilities',(-5,10,-29),12,25,'steel',16)
box('Platform load beam',(0,13,-28),(58,10,21),'steel',1)
save('shepherd')
for i,id in enumerate([r['id']for r in report]):
 for o in scene.objects:
  if o.name.startswith(id+' / '):o.hide_set(False);o.hide_render=False;o.location.x+=(i%5)*240;o.location.y+=(i//5)*240
bpy.data.libraries.write(ROOT+'/glb_models/original-stations-rebuilt.blend',{scene},fake_user=True)
Path(ROOT+'/.freebuff/station-rebuild/build-report.json').write_text(json.dumps(report,indent=2))
result={'models':report,'source':ROOT+'/glb_models/original-stations-rebuilt.blend'}
