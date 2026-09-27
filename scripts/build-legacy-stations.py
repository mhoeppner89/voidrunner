"""Rebuild the ten original ports in a separate Blender scene via MCP.
Shared construction helpers come from the Acheron authoring script; no old meshes reused.
"""
from pathlib import Path
ROOT='/Users/mhoeppner/Desktop/Voidrunner'
base=Path(ROOT+'/scripts/build-acheron-stations.py').read_text().split('report=[]')[0]
exec(base.replace("'Acheron stations authoring'","'Original systems station rebuild'").replace("'Acheron structural panels 512'","'Station structural panels 512'"))
report=[]
def pad(x,y,z,w,d,theme):
 apron_activity(x,y,z+1.51,w,d,theme)
 box('Landing apron',(x,y,z),(w,d,3),'steel',1)
 for sx in [-1,1]:
  box('Apron curb',(x+sx*(w/2-1),y,z+1.8),(1,d,1),'ivory',0)
  for yy in [-d*.4,0,d*.4]:box('Apron lights',(x+sx*(w/2-1),y+yy,z+2.4),(1.2,1.5,.3),'warm',0)
 for yy in [-d*.35,d*.35]:box('Landing box stripe',(x,y+yy,z+1.55),(w*.55,.5,.1),'gold',0)
 for xx in [-w*.275,w*.275]:box('Landing box stripe',(x+xx,y,z+1.55),(.5,d*.7,.1),'gold',0)
def access_ramp(x,front,width,deck,bay):
 vs=[(x-width/2,front-5,deck),(x+width/2,front-5,deck),(x+width/2,front,bay),(x-width/2,front,bay),(x-width/2,front,deck),(x+width/2,front,deck)]
 me=bpy.data.meshes.new('Dock ramp');me.from_pydata(vs,[],[(0,1,2,3),(0,3,4),(1,5,2),(4,3,2,5),(0,4,5,1)]);me.update()
 o=bpy.data.objects.new('Dock access ramp',me);scene.collection.objects.link(o);finish(o,o.name,'steel')
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
# ROOK: Concord fleet fortress. Recessed twin docks, armored citadel, connected batteries.
cyl('Octagonal armored core',(0,5,-3),36,27,'steel',8,r2=32)
cyl('Lower armored skirt',(0,5,-19),30,8,'steel',8,r2=36)
box('Citadel lower barracks',(0,11,15),(44,44,12),'steel',2)
box('Citadel armored crown',(0,14,25),(34,33,9),'ivory',2)
box('Command gallery',(0,14,32),(24,23,5),'steel',.8)
box('Citadel roof armor',(0,14,35),(27,25,2),'ivory',.5)
# Four armored spokes and defense bastions, visibly continuous with the core.
for side in [-1,1]:
 for y in [-23,33]:
  beam('Armored connecting spine',(side*22,y*.65,-2),(side*52,y,-2),13)
  cyl('Octagonal defense bastion',(side*52,y,-1),14,24,'steel',8,r2=12)
  cyl('Bastion roof armor',(side*52,y,12),13,3,'ivory',8)
  cyl('Battery rotating collar',(side*52,y,15),5,3,'dark',12)
  box('Defense battery housing',(side*52,y,18),(9,9,5),'steel',1)
  for dx in [-2,2]:beam('Paired defensive cannon',(side*52+dx,y-2,19),(side*52+dx,y-12,20),.8,'dark')
  for z in [-8,-2,4]:
   box('Bastion armor rib',(side*52,y-12,z),(15,2,1.2),'ivory',.2)
 # Recessed front bays have armored casemates and smaller service docks.
 hangar(side*17,-34,-4,23,13,29,theme="military")
 box('Hangar upper casemate',(side*17,-29,6),(28,29,5),'steel',1)
 box('Concord dock stripe',(side*17,-44,8.55),(21,1.5,.12),'gold',0)
 hangar(side*44,7,-10,7,5,12,theme="military")
 beam('Service dock attachment',(side*28,8,-10),(side*44,8,-10),8)
 # Engineering modules tucked behind the fortress.
 box('Rear engineering block',(side*20,37,-3),(16,22,19),'steel',1)
 for j in range(7):box('Heat exchanger fins',(side*20-6+j*2,48.2,-3),(1,.6,13),'dark',0)
 dish(side*15,18,44,5)
 beam('Aerial foundation',(side*12,15,29),(side*15,18,39),2)
# Protected approach spine and markings, no enormous free-floating roof.
box('Dock dividing armor',(0,-30,-3),(5,33,20),'ivory',.8)
box('Concord vertical identification',(0,-46.7,-2),(1.1,.15,12),'gold',0)
for x in [-8,8]:
 beam('Communications mast',(x,18,35),(x,18,57),.5)
 for z in [46,51]:beam('Communications array',(x-3,18,z),(x+3,18,z),.3)
cyl('Ventral utilities',(0,8,-31),14,18,'steel',12,r2=20)
for x in [-11,0,11]:box('Ventral heat sink',(x,8,-41),(6,23,4),'dark',.4)
save('rook')
# CAIRN: compact open maintenance yard with a supported service gantry.
pad(0,-8,-10,66,70,"salvage")
box('Repair workshop',(-19,22,0),(25,21,20),'steel',1.5)
hangar(12,21,0,23,16,22,theme="workshop")
access_ramp(12,10,14,-8.49,-7.14)
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
hangar(0,-81,2,26,13,24,theme="workshop")
for x in [-18,18]:beam('Terminal bridge',(x,-51,0),(x,-81,0),7)
tower(0,62,25)
for i in range(32):
 a=i*math.tau/32
 o=box('Outer ring navigation lamp',(68*math.cos(a),68*math.sin(a),0),(1,1,1),'warm',0)
save('argent')
# GATEHOUSE: customs terminal with two enclosed inspection docks and a supported scanner apron.
box('Customs docking foundation',(0,-8,-13),(78,83,7),'steel',2)
box('Customs apron surface',(0,-21,-9.35),(73,52,.3),'steel',0)
for x in [-36,36]:
 box('Apron edge armor',(x,-20,-8.5),(2,55,1.5),'ivory',.2)
 for y in [-42,-26,-10]:box('Apron inset navigation lamp',(x,y,-7.7),(.35,1.2,.12),'cool',0)
hangar(-19,13,-2,25,16,30,theme='military')
hangar(17,17,-3,22,14,22,theme='workshop')
box('Customs office foundation',(-20,18,8),(29,23,5),'steel',1)
box('Customs command gallery',(-20,20,14),(25,17,7),'ivory',1)
box('Customs dark glazing',(-20,11.42,14),(21,.12,2.5),'dark',0)
for x in range(-29,-10,2):box('Customs office windows',(x,11.32,14),(.5,.08,.3),'warm',0)
box('Bonded warehouse',(19,34,3),(28,12,24),'steel',1)
# Low scanner gantry reads as equipment sized to the ships, not a giant portal.
for x in [-12,12]:
 box('Scanner footing',(x,-27,-8),(3,5,2.5),'steel',.2)
 beam('Scanner column',(x,-27,-8),(x,-27,6),1.1,'ivory')
 box('Scanner sensor',(x,-27,1.5),(.55,2.5,4),'dark',0)
 box('Scanner indicator',(x*.97,-28.3,2),(.2,.06,1),'cool',0)
beam('Scanner overhead',(-12,-27,6),(12,-27,6),1.2,'ivory')
for x in [-8,8]:box('Inspection lane boundary',(x,-28,-9.15),(.14,32,.06),'gold',0)
for x in [-30,30]:
 box('Customs support pier',(x,0,-20),(7,47,12),'steel',1)
 beam('Apron diagonal brace',(x,-40,-15),(x,15,-26),2,'steel')
equipment(29,-9,-9.18,'military');equipment(-29,-16,-9.18,'rack')
dish(-20,21,25,5)
beam('Customs communications mast',(-30,26,18),(-30,26,40),.45)
for z in [31,36]:beam('Customs antenna element',(-33,26,z),(-27,26,z),.25)
save('gatehouse-twelve')
# BLACKGLASS: port apron and terraced galleries seated against the moon.
# GLB has a dedicated authored local origin; runtime embeds its rear in moon surface.
pad(0,-18,-15,94,68,"smuggler")
for x in [-36,36]:
 box('Cliff anchor',(x,13,-16),(14,28,38),'steel',2)
 beam('Apron support',(x,-46,-17),(x,16,-38),4)
for z,w in [(0,83),(16,69),(31,51)]:
 box('Rock-cut gallery housing',(0,14,z),(w,22,12),'steel',2)
 box('Recessed gallery',(0,2.8,z),(w-7,.6,7),'dark',0)
 box('Balcony floor',(0,-1,z-5),(w+3,10,2),'steel')
 for x in range(-int(w/2)+7,int(w/2)-3,7):box('Tavern lamps',(x,2.3,z),(2,.2,2.4),'warm',0)
 railing((-w/2,-5),(w/2,-5),z-2)
hangar(-24,-15,-6.3,17,13,20,theme="smuggler");hangar(24,-15,-6.3,17,13,20,theme="workshop")
access_ramp(-24,-25,10,-13.49,-11.94);access_ramp(24,-25,10,-13.49,-11.94)
for x in [-24,24]:box('Dock rock anchor',(x,1,-8),(21,14,10),'steel')
for x in [-45,45]:beam('Port beacon',(x,-45,-13),(x,-45,1),.8);cyl('Beacon lamp',(x,-45,2),.8,2,'warm',8)
save('blackglass')
# CINDER: dense industrial towers, linked catwalks and a tall freight gantry.
pad(0,-22,-20,85,61,"refinery")
box('Refinery foundation',(0,21,-24),(78,48,19),'steel',2)
for x,y,r,h in [(-24,18,10,68),(0,29,12,88),(25,24,9,53),(-29,39,6,39)]:
 tank(x,y,-12+h/2,r,h)
 beam('Process downfeed',(x,y,-10),(x,y,-25),2.3,'rust')
 beam('Underdeck process feed',(x,y,-25),(x,-10,-25),2.3,'rust')
for z in [5,28]:
 box('Catwalk',(-5,12,z),(65,6,1.8),'steel')
 railing((-37,8), (27,8),z+3)
for x in [-36,36]:beam('Cargo gantry',(x,-18,-18),(x,-18,23),4)
beam('Cargo lintel',(-36,-18,23),(36,-18,23),5)
for x in [-30,-18,-6,6,18,30]:box('Lintel lights',(x,-21,21),(3,.4,1),'warm',0)
hangar(23,2,-8,20,18,22,theme="refinery")
access_ramp(23,-9,12,-18.49,-16.14)
for x in [-34,34]:beam('Underside brace',(x,-44,-22),(x,29,-42),4)
box('Rear load bearing keel',(0,29,-36),(78,12,18),'steel',1)
save('cinder')
# TORCHWELL: small worn fuel depot, three silo heights beside a broad apron.
pad(0,-12,-15,80,65,"frontier")
box('Fuel services',(15,26,-1),(39,22,26),'steel',1.5)
hangar(12,3,-2,22,19,18,theme="refinery")
access_ramp(12,-6,13,-13.49,-10.64)
for x,y,h in [(-27,22,57),(-39,14, 30),(-17, 30,42)]:
 tank(x,y,-12+h/2,6,h,'ivory')
 beam('Fuel downfeed',(x,y,-9),(x,y,-20),1.8,'rust')
 beam('Underdeck fuel manifold',(x,y,-20),(x,-5,-20),1.8,'rust')
beam('Underdeck common fuel main',(-39,-5,-20),(3,-5,-20),2.2,'rust')
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
 before=len(objects)
 windows_ring(r*.91+.05,z+5,2,64)
 for o in objects[before:]:o.location.x=x;o.location.y=y
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
equipment(-16,-31,-5.96,"science")
equipment(17,-30,-5.96,"science")
box('Lab transfer cart',(16,-35,-5.5),(1.4,2.1,.8),'ivory',0)
save('nacre')
# SHEPHERD: solitary communications lighthouse with landing pad and dish.
pad(0,-15,-15,65,65,"repair")
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
