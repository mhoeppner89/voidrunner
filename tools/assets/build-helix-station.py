"""Rebuild Helix. Run with Blender --background --python."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import station_builder as B
import station_concourses as C
import station_detailing as D
B.init('helix','Helix Freeport · commercial refinery')
from station_builder import *
# A recognizable refinery spindle, enclosed occupied decks and exposed services.
lathe('Central refinery spindle',[(-48,7),(-43,10),(-32,12),(-19,12),(28,12),(35,9),(52,8)],'hull',32)
for z,r,h in [(-24,27,8),(-5,39,9),(17,31,8)]:
    lathe('Pressure deck shell',[(z-h/2-1,r-2),(z-h/2,r),(z+h/2,r),(z+h/2+1,r-2)],'hull')
    for zz in [z-h/2-.3,z+h/2+.3]:
        ring('Deck structural lip',r+.4,2.4,zz,.65,'metal')
    windows(r,z-h/2+1,4,'Occupied deck windows')
    ring('Continuous roof shield mounting saddle',r-1,3.2,z+h/2+.25,1,'metal')
    for i in range(12):
        a=i*math.tau/12
        ring('Ceramic pressure shield',r+.15,2.9,z+h/2+.95,.65,'armor',4,a+.018,a+math.tau/12-.018)
        # Real radial ribs and inset service panels interrupt the broad plating.
        beam('Deck radial girder',(11.5*math.cos(a),11.5*math.sin(a),z-h/2-4),((r-2)*math.cos(a),(r-2)*math.sin(a),z-h/2-.5),.85)
        box('Roof maintenance hatch',((r-4)*math.cos(a),(r-4)*math.sin(a),z+h/2+1.08),(2.5,1.6,.19),'dark',yaw=a,chamfer=.15)
        box('Hatch rim',((r-4)*math.cos(a),(r-4)*math.sin(a),z+h/2+1.22),(1.9,1.1,.12),'metal',yaw=a)

# Vertical elevator towers tie the separate inhabited decks into one building.
for i in [0,2,3,5,6,8,9,11]:
    a=i*math.tau/12
    x,y=20*math.cos(a),20*math.sin(a)
    box('Interdeck elevator trunk',(x,y,-1),(3.4,4,43),'armor',yaw=a,chamfer=.4)
    box('Elevator machinery',(x*1.04,y*1.04,22),(3.9,4.5,3.2),'metal',yaw=a,chamfer=.4)
    for z in [-17,-11,2,9]:box('Elevator service collar',(x,y,z),(3.8,4.4,.55),'ochre',yaw=a)

# The side portal opens into a real shared multilevel atrium.
m=C.build('helix',('atlas','wayfarer'))

# A lopsided commercial freight pier makes the port's function visible at a glance.
box('Container pier',(-33,-30,-15.5),(19,29,2.2),'hull',chamfer=1)
beam('Freight pier bridge',(-12,-20,-21),(-33,-25,-14.4),4,'hull')
for xx in [-39,-34,-29]:
    for yy in [-39,-34,-29,-24]:
        for level in range(1+((int(xx+yy))%3==0)):
            container('Bonded freight container',xx,yy,-14.4+level*1.01)
for xx in [-41,-25]:
    beam('Freight crane pier',(xx,-32,-14.4),(xx,-32,-5),.65,'ochre')
    beam('Crane diagonal brace',(xx,-36,-14.4),(xx,-32,-8),.4)
beam('Freight crane beam',(-41,-32,-5),(-25,-32,-5),.9,'ochre')
box('Crane carriage',(-34,-32,-5.1),(2,1.8,1),'metal',chamfer=.15)
beam('Crane hoist',(-34,-32,-5.6),(-34,-32,-10),.12,'dark')
box('Crane lifting frame',(-34,-32,-10),(1.2,2.5,.25),'ochre')
for xx in [-40,-27]:beam('Pier lower support',(xx,-38,-16),(xx*.5,-16,-25),.8)

# Exposed refinery equipment below the occupied decks, with continuous plumbing.
for i in range(6):
    a=i*math.tau/6+.35;x,y=20*math.cos(a),20*math.sin(a)
    tank('Refinery pressure vessel',x,y,-34,2.3,13)
    beam('Pressure vessel structural mount',(x,y,-29.8),(x*.55,y*.55,-23),.8)
    tube('Refinery transfer main',[(x,y,-41),(x,y,-44),(x*.48,y*.48,-44)],.32,'copper')
ring('Ventral plant maintenance rim',12,2,-44,1.2,'metal',32)
for i in range(6):
    a=i*math.tau/6+.35
    beam('Ventral rim structural spoke',(8*math.cos(a),8*math.sin(a),-44),(12*math.cos(a),12*math.sin(a),-44),1.1)
for side in [-1,1]:
    beam('Radiator wing root',(side*17,13,14),(side*49,13,28),2,'hull')
    beam('Radiator wing brace',(side*17,13,-1),(side*49,13,20),1,'metal')
    for yy in [6,20]:
        box('Radiator manifold',(side*49,yy,29),(1.6,1.1,28),'metal')
        tube('Coolant riser',[(side*13,yy,14),(side*45,yy,25),(side*49,yy,25)],.28,'copper')
    box('Thick radiator plate',(side*49,13,29),(.62,15,25),'radiator')
    for z in range(18,42,2):box('Radiator cooling ribs',(side*49,13,z),(1.03,14,.16),'metal')
    for yy in [8,13,18]:box('Radiator channels',(side*49,yy,29),(.8,.17,24),'dark')

# Secondary equipment has larger readable shapes rather than random greebles:
# pressure-door modules, external duct bends and visible plant connections.
for i in [0,1,3,5,6,7,9,11]:
    a=i*math.tau/12+math.pi/48
    for z,r in [(-7,39),(15,31)]:
        if i==9 and z==-7:continue
        rr=r*math.cos(math.pi/48)
        B.crew_door('External EVA airlock',(rr*math.cos(a),rr*math.sin(a),z),
            (-math.sin(a),math.cos(a),0),(math.cos(a),math.sin(a),0))
for i in [1,4,7,10]:
    a=i*math.tau/12;x,y=28*math.cos(a),28*math.sin(a)
    tube('Upper promenade ventilation',[(x,y,21.8),(x,y,25),(x*.78,y*.78,25),(x*.78,y*.78,28)],.48,'metal')
    beam('Ventilation skid bracket',(x*.78,y*.78,21.8),(x*.78,y*.78,26.7),.7)
    box('Ventilation motor',(x*.78,y*.78,26.7),(2,2,2.8),'hull',yaw=a,chamfer=.3)

# A separate navigation/communications crown, supported and visibly inhabited.
lathe('Upper services cone',[(30,13),(33,16),(37,16),(41,11),(48,10)],'armor',24)
lathe('Command pressure cylinder',[(44,8),(56,8),(58,6)],'hull',24)
for z in [46,49,52]:
    ring('Command deck band',8.1,1.2,z,.4,'metal',24)
    windows(8,z+.65,2,'Command deck windows',24)
lathe('Command crown',[(56,9),(58,9),(62,5)],'armor',24)
for x,y,h in [(-5,1,80),(4,2,73),(0,-2,84)]:
    beam('Communications mast',(x,y,60),(x,y,h),.25)
    for zz in [h-5,h-2]:beam('Mast antenna crossbar',(x-1.6,y,zz),(x+1.6,y,zz),.16)
    box('Navigation beacon',(x,y,h+.2),(.4,.4,.4),'warm')
for side in [-1,1]:
    x,y=side*11,7
    beam('Reflector pedestal',(x,y,37),(x,y,46),.65)
    vs=[(x,y,46)]
    for r in [2,4.5]:vs += [(x+r*math.cos(i*math.tau/24),y+r*math.sin(i*math.tau/24),46+(r/4.5)**2*1.4)for i in range(24)]
    fs=[(0,1+i,1+(i+1)%24)for i in range(24)]+[(1+i,25+i,25+(i+1)%24,1+(i+1)%24)for i in range(24)]
    dish=mesh('Communications reflector with thickness',vs,fs,'armor')
    bpy.context.view_layer.objects.active=dish;dish.select_set(True);mod=dish.modifiers.new('Reflector skin','SOLIDIFY');mod.thickness=.18;bpy.ops.object.modifier_apply(modifier=mod.name);dish.select_set(False)
    for i in range(3):
        a=i*math.tau/3
        beam('Reflector feed supports',(x+3.5*math.cos(a),y+3.5*math.sin(a),47),(x,y,49),.12)


D.apply('helix',m)
export_model('helix',m,'Commercial refinery freeport with deep multilevel arrival atrium, central lift, inhabited galleries and connected freight pier.')
