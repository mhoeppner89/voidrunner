"""Pressure hulls and engineered undersides for the station source models.

Authored in Blender Z-up. Preserve every landing-floor/approach coordinate and
stay within the existing outer envelope. These are solid model surfaces, not
runtime props, emissive outlines or a second rendering layer.
"""
import math
from mathutils import Vector
import station_builder as B
from station_builder import box,beam,lathe,ring,tube,truss,block,radiator


def collar(name,at,r,width=.45,height=.6,material='metal',n=24):
    o=ring(name,r,width,at[2],height,material,n);o.location.x=at[0];o.location.y=at[1];return o


def pressure_pod(name,at,r,h,material='hull',inhabited=True,n=24):
    x,y,z=at
    profile=[(z-h*.5,r*.28),(z-h*.44,r*.64),(z-h*.28,r*.94),(z-h*.18,r),
             (z+h*.18,r),(z+h*.28,r*.94),(z+h*.44,r*.64),(z+h*.5,r*.28)]
    lathe(name+' pressure vessel',profile,material,n,(x,y))
    for dz in [-h*.19,h*.19]:collar(name+' welded equator seam',(x,y,z+dz),r+.035,.18,.26,n=n)
    if inhabited:
        B.window_arc(name+' inhabited decks',r,z-h*.15,2,n,center=(x,y),pitch=1.6,row_pitch=.6)
    # The end cap is physical; there is no hovering lid or unsupported antenna.
    lathe(name+' pressure end cap',[(z-h*.5-.16,r*.2),(z-h*.5,r*.3)],'metal',n,(x,y))


def manifold(name,a,b,r=.35):
    # Large readable pipe runs and endpoint clamps, without repetitive micro-detail.
    tube(name,[a,b],r,'copper',8)
    for p in [a,b]:box(name+' anchored coupling',p,(r*2.7,r*2.7,r*2.7),'metal',chamfer=r*.3)


def replace_slab(name,layers,at=(0,0),chamfer=2):
    """Keep the precise top/rim and taper the body into a solid keel below it."""
    matches=[o for o in B.parts if o.name==name]
    assert len(matches)==1,(name,[o.name for o in matches])
    original=matches[0];B.parts.remove(original);B.bpy.data.objects.remove(original,do_unlink=True)
    vs=[]
    for z,w,d,cx,cy in layers:
        x,y=at[0]+cx,at[1]+cy;c=min(chamfer,w*.18,d*.18)
        xy=[(-w/2+c,-d/2),(w/2-c,-d/2),(w/2,-d/2+c),(w/2,d/2-c),
            (w/2-c,d/2),(-w/2+c,d/2),(-w/2,d/2-c),(-w/2,-d/2+c)]
        vs.extend((x+a,y+b,z)for a,b in xy)
    # Layers run top-to-bottom. Correct outward winding on every closed surface.
    faces=[tuple(range(8)),tuple(reversed(range((len(layers)-1)*8,len(layers)*8)))]
    for level in range(len(layers)-1):
        k=level*8;j=k+8
        for i in range(8):n=(i+1)%8;faces.append((k+i,j+i,j+n,k+n))
    return B.mesh(name+' tapered pressure hull',vs,faces,'hull')


def keel_ribs(name,ys,width,top,bottom,root=.9):
    for y in ys:
        for s in [-1,1]:
            beam(name+' diagonal frame',(s*width,y,top),(s*width*.28,y+1,bottom),root,'metal')
        beam(name+' cross tie',(-width*.28,y+1,bottom),(width*.28,y+1,bottom),root,'metal')


def cairn():
    replace_slab('Salvage yard load deck',[
        (-11,59,63,0,0),(-15,59,63,0,0),(-20,47,54,0,2),(-28,30,39,1,5),(-32,12,27,2,5)],chamfer=3)
    keel_ribs('Reclaimed drydock keel',[-22,-7,9,24],27,-15.1,-28,1.1)
    # An asymmetric yard built around an old freighter's pressure spine.
    for y in [-12,13]:
        pressure_pod('Cairn reclaimed crew module',(-17,y,-21),7,13,'armor',True,n=20)
        beam('Crew module workshop trunk',(-17,y,-14),(-22,y,-5),2.5,'hull')
    pressure_pod('Cairn lower crew bow',(0,-24,-18.6),6.5,10,'armor',True,n=24)
    pressure_pod('Cairn starboard service blister',(27,-4,-15),3.5,10,'armor',True,n=20)
    pressure_pod('Cairn drive servicing sump',(11,9,-27),6,16,'metal',False,n=20)
    manifold('Yard power bus',(18,-22,-17),(17,22,-21),.48)
    for x in [-8,8]:box('Ventral service hatch',(x,7,-29),(4,8,.6),'armor',chamfer=.5)


def rook():
    lathe('Bastion deep armored reactor casemate',[(-48,4),(-43,10),(-32,17),(-24,19)],'hull',16)
    for z,r in [(-32,17),(-39,12.8)]:collar('Casemate armored belt',(0,0,z),r,1.2,1.2,'armor',16)
    # Closed load-bearing hull fills the formerly open gap above the reactor.
    # It seats under the arrival floor and blends into both armored wings.
    B.pressure_building('Rook continuous armored lower keel',[
        (-26,0,-1,31,34),(-22,0,-7,34,43),(-12.25,0,-16,23,53)],'hull',2)
    # Barracks have actual armored pressure volumes below the gun bastions.
    for side in [-1,1]:
        pressure_pod('Bastion damage-control capsule',(side*30,13,-18),6,16,'hull',True,n=20)
        beam('Capsule armored transfer neck',(side*21,13,-14),(side*30,13,-14),3.2,'hull')


def argent():
    # Open shipyard structure stays open: three-dimensional bottom girders and
    # work pods replace the impression of a model resting on a long floor slab.
    replace_slab('Frigate drydock keel',[
        (-19.5,44,108,0,0),(-22.5,44,108,0,0),(-26,30,95,0,0),(-31,10,82,0,0)],chamfer=1)
    for side in [-1,1]:
        x=side*18
        truss('Assembly ventral longitudinal girder',(x,-45,-30),(x,45,-30),2.5)
        for y in [-36,36]:
            beam('Ventral ring load knee',(x,y,-30),(side*38,y,-3),1.5,'metal')
        pressure_pod('Ring utility pressure module',(side*52,0,-7),5.5,18,'armor',True,n=20)
        beam('Utility pod ring neck',(side*51,0,2),(side*58,0,2),2,'hull')
    for y in [-36,36]:beam('Cradle lower transverse load bearer',(-20,y,-30),(20,y,-30),1.6,'metal')
    for y in [-32,0,32]:manifold('Dry dock coolant crossfeed',(-18,y,-29),(18,y,-29),.45)


def gatehouse():
    replace_slab('Inspection load-bearing spine',[
        (-12.5,38,74,0,6),(-17.5,38,74,0,6),(-24,30,56,0,7),(-33,17,35,0,8),(-37,8,19,0,8)],chamfer=2)
    # Customs controls a vertical inhabited core, flanked by solid bonded vaults.
    for side in [-1,1]:
        pressure_pod('Bonded customs vault',(side*23,10,-23),7,18,'armor',True,n=20)
        beam('Customs vault pressure neck',(side*14,10,-19),(side*23,10,-19),3,'hull')
        manifold('Inspection utilities',(side*16,-22,-15),(side*23,10,-25),.4)
    pressure_pod('Customs power compartment',(0,10,-36),6,12,'metal',False,n=20)
    for y in [-20,0,22]:
        for side in [-1,1]:beam('Inspection underframe',(side*18,y,-17),(side*8,y,-29),1.1,'metal')


def blackglass():
    # A moon installation is anchored into the cliff rather than given an
    # orbital hull. Irregular massive rock shoulders carry the exposed apron.
    cliff=next(o for o in B.parts if o.name=='Moon rock cliff with excavated galleries')
    for v in cliff.data.vertices:
        x,y,z=v.co
        blend=max(0,min(1,(y-10)/22));blend=blend*blend*(3-2*blend)
        v.co.x=x*(1-.12*blend)
        v.co.y=y-blend*(3+2*math.sin(z*.13+x*.15))
        v.co.z=8+(z-8)*(1-.13*blend)
    cliff.data.update()
    vertices=[];count=14
    for layer,(z,rx,ry,cy)in enumerate([(-40,16,11,17),(-29,29,18,14),(-17,31,17,14),(2,24,12,17)]):
        for i in range(count):
            a=i*math.tau/count;rough=1+.055*math.sin(i*2.3+layer*.8)+.025*math.cos(i*1.3-layer)
            vertices.append((rx*math.cos(a)*rough,cy+ry*math.sin(a)*rough,z+1.1*math.sin(i*1.7+layer)))
    faces=[tuple(reversed(range(count))),tuple(range(3*count,4*count))]
    for layer in range(3):
        for i in range(count):
            j=(i+1)%count;faces.append((layer*count+i,layer*count+j,(layer+1)*count+j,(layer+1)*count+i))
    B.mesh('Natural fractured cliff foundation',vertices,faces,'rock')
    for side in [-1,1]:
        beam('Terrace deep rock anchor',(side*18,12,-31),(side*21,-23,-13),2,'metal')
        tube('Rock-side utility main',[(side*23,10,12),(side*23,10,-22),(side*12,-8,-22)],.38,'copper')
    pressure_pod('Embedded independent power pod',(0,10,-26),5.5,12,'hull',False,n=16)


def cinder():
    replace_slab('Industrial foundation',[
        (-21,61,68,0,2),(-27,61,68,0,2),(-32,48,55,0,5),(-43,24,32,0,10),(-47,10,20,0,10)],chamfer=3)
    keel_ribs('Fractionation plant armored rib',[-19,-1,18,30],27,-26.7,-38,1.5)
    for x,y in [(-17,-6),(17,10)]:
        pressure_pod('Ore smelter reduction vessel',(x,y,-34),6,20,'copper',False,n=20)
        manifold('Smelter lower feed',(x,y,-42),(x*.45,y,-24),.8)
    pressure_pod('Refinery engineering control',(0,6,-31),9,14,'hull',True,n=24)
    for side in [-1,1]:
        box('Plant ventral heat sink',(side*9,19,-42),(4,12,2.4),'radiator',chamfer=.4)
        beam('Heat sink plant mount',(side*9,19,-42),(side*9,19,-36),1.3,'metal')


def torchwell():
    replace_slab('Broad exposed fuel apron',[
        (-10,65,57,0,-4),(-14,65,57,0,-4),(-20,54,46,0,-3),(-26,34,30,0,-1),(-29,16,17,0,0)],chamfer=2)
    # The fuel is in real bulk tanks below the service deck. Spherical lobes,
    # asymmetric pipe manifolds and a central bus evoke a working frontier depot.
    for x,y,z,r,h in [(-16,1,-28,11,27),(15,6,-26,10,24),(0,-12,-31,10,25)]:
        pressure_pod('Torchwell bulk propellant sphere',(x,y,z),r,h,'copper',False,n=24)
        beam('Propellant tank load neck',(x,y,-17),(x,y,z+7),3.2,'hull')
        manifold('Propellant sphere fill main',(x,y,z-h*.35),(0,6,-23),.58)
    for side in [-1,1]:
        pressure_pod('Fuel depot lateral pressure house',(side*29,4,-12),3.7,10,'armor',True,n=24)
        beam('Lateral pressure house access neck',(side*21,4,-11),(side*29,4,-11),3.2,'hull')
    pressure_pod('Fuel depot engineering house',(5,16,-20),7,13,'hull',True,n=24)
    for side in [-1,1]:
        beam('Apron diagonal load arm',(side*28,-24,-14),(side*10,-12,-32),1.8,'metal')
    box('Valve access pressure trunk',(0,4,-20),(9,27,8),'metal',chamfer=1.5)


def nacre():
    # Science pods continue below the transfer tunnels instead of being discs
    # with long unsupported gas cylinders hanging off them.
    pressure_pod('Science station ventral core',(0,0,-28),12,22,'armor',True,n=32)
    for x,y in [(-40,0),(40,0),(0,40)]:
        beam('Laboratory lower pressure bridge',(x*.25,y*.25,-26),(x,y,-22),2.2,'hull')
        pressure_pod('Laboratory lower service chamber',(x,y,-25),5,10,'metal',False,n=20)
    # A distinct deep, bowl-shaped terrace connects to the south laboratory.
    lathe('Science terrace pressure bowl',[(-25,3),(-22,9),(-16,13),(-14,13)],'hull',32,(0,-53))
    for side in [-1,1]:beam('Science terrace stem',(side*6,-51,-21),(side*5,-40,-14),1.2,'metal')
    manifold('Sample-return pressure conduit',(0,-41,-20),(0,-51,-21),.65)


def shepherd():
    replace_slab('Relay service deck',[
        (-14,45,48,0,0),(-18,45,48,0,0),(-23,33,35,0,3),(-30,18,23,-2,6),(-32,10,14,-2,6)],chamfer=3)
    pressure_pod('Relay watch crew pressure hull',(12,9,-22),8,16,'armor',True,n=24)
    beam('Watch module service neck',(12,9,-16),(12,9,-8),4,'hull')
    lathe('Deep relay reactor shielding',[(-44,3),(-40,6),(-30,8)],'hull',20)
    for side in [-1,1]:
        beam('Relay ventral stabilizer root',(side*6,5,-31),(side*21,14,-35),1.4,'metal')
        box('Relay broad thermal fin',(side*21,14,-35),(.6,11,13),'radiator',chamfer=.2)
    manifold('Relay service power main',(0,8,-29),(-10,8,-19),.65)


def haven():
    # A pressure-bearing bowl, lower inhabited torus and central machinery keel
    # make the open market court part of a complete orbital habitat.
    lathe('Haven continuous habitat bowl',[(-40,7),(-35,14),(-28,24),(-20,31),(-15,33),(-14,33)],'hull',48)
    lathe('Lower merchant residential belt',[(-30,20),(-28,24),(-22,27),(-19,27),(-17,29)],'armor',48)
    B.window_arc('Lower habitat residential windows',27,-21.5,3,48,pitch=1.5)
    collar('Residential belt lower pressure joint',(0,0,-28),24,.5,.6,'metal',48)
    for a in [0,math.pi*.55,math.pi*1.1,math.pi*1.65]:
        x,y=19*math.cos(a),19*math.sin(a)
        beam('Habitat radial load frame',(x*1.5,y*1.5,-15),(x*.4,y*.4,-36),1.5,'metal')
    pressure_pod('Habitat central life support',(0,0,-40),7,12,'metal',False,n=24)
    for x in [-24,24]:
        pressure_pod('Habitat external transfer vestibule',(x,9,-18),6,14,'hull',True,n=24)
        beam('Vestibule habitat root',(x,9,-12),(x,9,-17),3,'hull')


def league_yard():
    replace_slab('Cruiser drydock keel foundation',[
        (-14.5,47,132,0,0),(-19.5,47,132,0,0),(-24,34,124,0,0),(-28,13,112,0,0)],chamfer=2)
    for side in [-1,1]:
        truss('Cruiser yard lower chord',(side*20,-59,-31),(side*20,59,-31),3.2)
        for y in [-52,-25,3,31,57]:
            beam('Cradle lower diagonal',(side*27,y,-12),(side*20,y,-31),1.6,'metal')
            beam('Cradle under-keel tie',(side*20,y,-31),(0,y,-27),1.3,'metal')
        for y in [-34,27]:
            pressure_pod('Drydock engineering pressure module',(side*28,y,-22),6,16,'armor',True,n=20)
            beam('Engineering pod service root',(side*28,y,-18),(side*27,y,-9),2.2,'hull')
    for x in [-7,7]:manifold('Cruiser yard protected power bus',(x,-56,-28),(x,51,-28),.65)
    box('Yard power spine',(0,45,-27),(12,20,10),'hull',chamfer=2)


def cinderfall():
    lathe('Industrial habitat deep foundation bowl',[(-44,7),(-38,14),(-31,21),(-25,27),(-23,27)],'hull',40)
    for a in [0,math.pi*.4,math.pi*.8,math.pi*1.2,math.pi*1.6]:
        x,y=26*math.cos(a),26*math.sin(a)
        beam('Industrial court pressure rib',(x,y,-22),(x*.35,y*.35,-40),1.6,'metal')
    for x,y in [(-16,6),(15,11)]:
        pressure_pod('Industrial lower process globe',(x,y,-32),7,17,'copper',False,n=24)
        manifold('Industrial globe transfer main',(x,y,-37),(x,y,-19),.55)
    collar('Lower refinery access belt',(0,0,-30),21,.6,.8,'armor',40)
    B.window_arc('Lower refinery service windows',21,-30,2,40,pitch=2)


BUILDERS={name:globals()[name.replace('-','_')]for name in ['rook','cairn','argent','gatehouse','blackglass','cinder','torchwell','nacre','shepherd','haven','league-yard','cinderfall']}
BUILDERS['gatehouse-twelve']=BUILDERS.pop('gatehouse')

ENVELOPES={'helix': 84.42890708589043, 'rook': 66.17620712925944, 'cairn': 43.812098785609436, 'argent': 76.72142364228878, 'blackglass': 62.13694553162394, 'cinder': 67.62396025078685, 'torchwell': 56.588608523483096, 'nacre': 69.19421949553792, 'shepherd': 73.45663382096357, 'haven': 53.369191767187296, 'league-yard': 87.61906180075616, 'cinderfall': 56.65351361979899, 'gatehouse-twelve': 49.874241873349874}

def apply(station_id,metadata):
    B.bpy.context.view_layer.update()
    old_radius=ENVELOPES[station_id]
    start=len(B.parts)
    BUILDERS[station_id]()
    B.bpy.context.view_layer.update()
    radius=max((o.matrix_world@v.co).length for o in B.parts for v in o.data.vertices)
    assert radius<=old_radius+.02,(station_id,'architecture exceeds existing world envelope',old_radius,radius)
    metadata['architecture']={'revision':'pressure-hulls-v1','originalRadius':old_radius,'partsAdded':len(B.parts)-start,
        'strategy':{'rook':'paired armored arrival wings and deep service hull','cairn':'reclaimed freighter keel',
        'argent':'open assembly torus and suspended service frame','gatehouse-twelve':'bonded vault and vertical customs core',
        'blackglass':'rock-anchored cliff terrace','cinder':'deep fractionation and smelter hull',
        'torchwell':'bulk propellant spheres under an open service apron','nacre':'laboratory pressure cluster',
        'shepherd':'inhabited lighthouse and reactor keel','haven':'inhabited torus and pressure bowl',
        'league-yard':'longitudinal drydock frame and work modules','cinderfall':'industrial pressure bowl and reduction vessels'}[station_id]}
