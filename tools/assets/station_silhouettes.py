"""Station districts derived from the inhabited spaces in each location painting.

No universal decorative crown, arch or blade kit. Closed working modules connect
through pressure trunks, load-bearing galleries and real service foundations.
"""
import math
from mathutils import Vector,Matrix
import station_builder as B
from station_builder import box,beam,lathe,ring,tube
from station_volumes import collar,pressure_pod,manifold


def module(name,at,size,material='hull',rows=None):
    B.block(name,at,size,material,rows=rows or max(2,int(size[2]/2.4)))


def axial_module(name,a,b,r,material='hull',inhabited=False,n=20):
    a,b=Vector(a),Vector(b);start=len(B.parts)
    pressure_pod(name,(0,0,(b-a).length/2),r,(b-a).length,material,inhabited,n)
    transform=Matrix.Translation(a)@Vector((0,0,1)).rotation_difference((b-a).normalized()).to_matrix().to_4x4()
    for o in B.parts[start:]:o.matrix_world=transform@o.matrix_world


def utility_panel(name,root,at,size):
    # A restrained, thick thermal panel, on a legible two-arm equipment mount.
    x,y,z=at;w,d,h=size
    box(name,at,size,'radiator')
    for yy in [y-d*.35,y+d*.35]:
        beam(name+' load arm',(root[0],yy,root[2]),(x,yy,z),.85,'metal')
        box(name+' edge manifold',(x,yy,z),(w*1.8,.6,h+.5),'metal')
    tube(name+' coolant main',[root,(x,y,z),(x,y,z-h*.35)],.32,'copper')


def rook():
    # The main arrival wings define the silhouette; armor reinforces their joints.
    for s in [-1,1]:
        box('Rook casemate roof heat sink',(s*38,12,1.8),(15,10,.7),'dark',chamfer=.7)
        for yy in [9,12,15]:box('Casemate heat sink channel',(s*38,yy,2.2),(13,.45,.25),'metal')
    beam('Rook command gallery protected service trunk',(-17,14,22),(17,14,22),4,'armor')


def cairn():
    # A roof belongs to an occupied workshop wall and rear gallery, not four poles.
    module('Cairn upper workshop gallery',(-22,3,12.5),(13,36,12),'hull',5)
    module('Workshop roof occupied gallery',(-3,-7,8.7),(32,6,5.2),'armor',3)
    for y in [-18,-10]:
        beam('Workshop deep roof girder',(-19,y,4.6),(14,y,4.6),1.2,'metal')
    for y in [-14,-8]:
        beam('Workshop roof cantilever knee',(-18,y,0),(-11,y,4.6),1.3,'metal')
    # The original yellow gantry travels along the workshop's two running rails.
    for x in [-22,22]:beam('Salvage crane running rail',(x,-2,24.9),(x,17,24.9),.65,'metal')
    module('Cairn stern repair stores',(6,23,3),(27,12,10),'hull',4)
    tube('Workshop service main',[(-22,17,12),(-22,23,12),(5,23,7)],.6,'copper')


def argent():
    # One transverse working gantry leaves the frigate and central cradle legible.
    module('Argent transverse assembly control',(0,27,30),(66,6,5),'armor',2)
    for s in [-1,1]:
        beam('Assembly gantry torus load leg',(s*52,27,5),(s*31,27,29),3,'hull')
    box('Assembly gantry tool trolley',(0,27,26.5),(7,5,2),'ochre',chamfer=.4)
    for x in [-2,2]:beam('Assembly tool suspension',(x,27,26),(x,27,13),.18,'dark')
    box('Assembly suspended work head',(0,27,13),(5,4,1),'metal',chamfer=.3)
    module('Argent arrival observation lounge',(0,-59,12),(18,22,6),'hull',3)
    for start,end in [(.18,1.12),(math.pi+.2,math.pi+1.08)]:
        ring('Argent connected workshop sector',60,9,15,7,'hull',20,start,end)
        ring('Workshop sector roof',60,10,18.8,.6,'armor',20,start,end)
        B.window_arc('Workshop sector observation bays',64.5,13,3,20,start=start,end=end,pitch=2.5,row_pitch=1.3)
    for s in [-1,1]:
        module('Argent ring fabrication annex',(s*58,0,16),(10,22,12),'armor',5)
        beam('Ring annex seated load shoe',(s*58,0,8),(s*58,0,13),4,'hull')


def gatehouse_twelve():
    # Occupied inspection control sits above a deep framed lane and joins customs.
    B.pressure_building('Gatehouse inspection control floor',[(-.4,0,-23,34,28),(4.2,0,-23,34,28),(6,0,-21,30,24)],'hull',2)
    B.window_wall('Inspection floor berth observation bays',(0,-37.02,2),(1,0,0),(0,-1,0),4,1,pitch=6.5,width=4.5,height=1.1)
    for x in [-6,0,6]:
        box('Customs berth observation glazing',(x,5.4,12),(B.detail_units(12),.25,B.detail_units(4)),'glass')
    for x in [-6,0,6]:box('Control glazing heavy mullion',(x,5.2,12),(.1,.4,B.detail_units(4.5)),'metal')
    module('Gatehouse left bonded terminal',(-23,7,-1),(15,39,22),'hull',8)
    for y in [-35,-23,-11]:
        box('Inspection starboard structural pilaster',(16,y,-6),(2,2.5,12),'armor',chamfer=.4)
    module('Control floor administration passage',(0,2,2.7),(28,26,7.4),'hull',3)
    module('Gatehouse rear staffed inspection office',(5.75,-3,-6.9),(20.5,14,11.2),'hull',3)
    box('Inspection rear left wall return',(-14.75,-9.8,-6.9),(2.5,1,11.2),'hull')
    box('Service passage continuous upper fascia',(-9,-9.8,-2.9),(9,1,3.2),'hull')
    box('Staffed checkpoint panoramic glazing',(5,-10.12,-11.85),(B.detail_units(12),.26,B.detail_units(4)),'glass')
    box('Staffed checkpoint counter',(5,-10.7,-12.35),(5,.7,.3),'metal',chamfer=.1)
    B.crew_door('Checkpoint staff pressure entry',(-2.5,-10.01,-12.5),(1,0,0),(0,-1,0))
    # Existing low administration roof remains the dish's actual mounting floor.
    for o in B.parts:
        if o.name.startswith('Traffic control antenna'):o.location.z-=2
        if o.name.startswith('Antenna mounting column'):
            for v in o.data.vertices:
                if v.co.z>20:v.co.z-=2
    for s in [-1,1]:
        tube('Bonded terminal protected services',[(s*24,23,-13),(s*24,23,0),(s*12,23,0)],.65,'copper')


def blackglass():
    rock=next(o for o in B.parts if o.name=='Moon rock cliff with excavated galleries')
    for v in rock.data.vertices:
        x,y,z=v.co
        if z>30:
            weight=(z-30)/11
            v.co.z+=weight*(3*math.sin(x*.13)+2.2*math.sin(x*.31+1.2)-2)
            v.co.x+=weight*1.6*math.sin(x*.19)
        if abs(x)>24:v.co.x*=.86+.075*math.cos(z*.12)
        if y>15:
            v.co.y-=4+2*math.sin(x*.08+z*.06)
    module('Blackglass rock-seated service lock',(-28,0,-6),(7,10,9),'copper',4)
    beam('Rock service lock access ramp',(-26,-6,-12),(-26,-3,-10.4),2,'metal')
    for x in [-17,17]:
        beam('Cliff freight platform rock anchor',(x,-15,-14),(x,16,-24),1.4,'metal')
    # Broad fabric-coloured canopies stay recessed in the actual cave mouths.
    for x in [-14,0,14]:
        box('Upper cave trading canopy',(x,3,21.8),(9,7,.3),'ochre',chamfer=.5)
        for xx in [x-4,x+4]:beam('Trading canopy rock stay',(xx,6,23),(xx,0,21.8),.14,'metal')


def cinder():
    module('Cinder operations service street',(-1,19,-5),(25,11,9),'hull',4)
    axial_module('Cinder horizontal heat recovery drum',(-22,28,-12),(21,28,-12),4.5,'copper')
    for x in [-18,0,18]:beam('Heat recovery drum foundation',(x,28,-20),(x,28,-13),2,'metal')
    for x,y in [(-18,-4),(0,21),(20,10)]:
        tube('Refinery protected bulk process main',[(x,y,-17),(x,y,-24),(0,21,-24)],.8,'metal')
    path=[(-18,-4,6),(0,21,6),(20,10,6)]
    for a,b in zip(path,path[1:]):
        beam('Common process maintenance catwalk',a,b,1.8,'metal')
        tangent=(Vector(b)-Vector(a)).normalized();side=tangent.cross(Vector((0,0,1)))
        for sign in [-1,1]:tube('Process catwalk guard rail',[tuple(Vector(a)+side*sign*.8+Vector((0,0,1.2))),tuple(Vector(b)+side*sign*.8+Vector((0,0,1.2)))],.08,'metal')
    box('Refinery enclosed furnace recess',(-18,-13.1,-7),(3,.3,5),'dark')
    for x in [-18.8,-18,-17.2]:box('Contained furnace process glow',(x,-13.28,-7),(.3,.06,3.6),'warm')
    module('Refinery cargo office',(19,-11,1),(17,21,4),'armor',2)


def torchwell():
    # A small frontier depot: organized tank rack, staffed service rooms, open pad.
    for x in [-28,-11]:
        for y in [13,27]:beam('Propellant rack seated upright',(x,y,-10),(x,y,17),1.1,'metal')
    for z in [0,14]:beam('Propellant rack protective cross member',(-28,27,z),(-11,27,z),1.1,'metal')
    for y in [13,27]:beam('Reservoir rack deck anchor',(-28,y,-11),(-11,y,-11),2,'hull')
    module('Torchwell services access module',(25,17,-5),(5,9,9),'armor',3)
    beam('Service-house pressurized vestibule',(21,17,-5),(25,17,-5),3,'hull')
    module('Torchwell roof control cabin',(12,17,3.1),(13,12,5.7),'hull',3)
    for o in B.parts:
        if o.name.startswith(('Seated ventilation casing','Ventilation inset','Frontier link')):o.location.z+=6
    tube('Tank rack main delivery header',[(-24,12,-8),(-16,12,-8),(-16,2,-8),(12,2,-8),(12,9,-8)],.65,'copper')


def nacre():
    # Preserve the calm rounded laboratory family, connected by pressure necks.
    for o in list(B.parts):
        if o.name.startswith(('Antenna seated pedestal','Navigation mast','Antenna crossbar','Navigation beacon')):
            B.parts.remove(o);B.bpy.data.objects.remove(o,do_unlink=True)
    lathe('Nacre central observation dome',[(16,10),(19,10),(22,7),(24.5,.4)],'armor',32)
    B.window_arc('Observation dome panoramic windows',10,17,2,32,pitch=1.1,row_pitch=.6)
    # The reference's white pavilions have rooms behind large picture windows.
    for x,y,start in [(0,-40,math.pi),(40,0,-math.pi/2)]:
        n=24;start+=math.pi*.22;end=start+math.pi*.56
        h=B.detail_units(5);z=-1.7
        glass=ring('Nacre panoramic laboratory rooms',13.07,.2,z,h,'glass',n,start,end);glass.location.x=x;glass.location.y=y
        for zz in [z-h/2-.045,z+h/2+.045]:
            rim=ring('Panoramic room ivory sill and header',13.12,.22,zz,.09,'armor',n,start,end);rim.location.x=x;rim.location.y=y
        for i in range(13):
            a=start+(end-start)*i/12;xx=x+13.15*math.cos(a);yy=y+13.15*math.sin(a)
            beam('Panoramic room pressure mullion',(xx,yy,z-h/2),(xx,yy,z+h/2),.10,'armor')

    module('Science terrace entrance vestibule',(0,-48.5,-9.7),(4.5,6,4.6),'armor',2)
    B.crew_door('Science terrace staffed entry',(0,-51.52,-11.9),(1,0,0),(0,-1,0))
    for s in [-1,1]:
        beam('Lab personnel pressure neck',(s*13,0,1),(s*40,0,1),4,'armor')
        axial_module('Nacre attached sample pressure module',(s*24,10,-14),(s*24,22,-14),3,'hull',False,16)
        beam('Sample module laboratory root',(s*16,9,-9),(s*24,13,-12),2.5,'armor')


def shepherd():
    # Lighthouse scale is intentional. Communication hardware is identifiable.
    module('Shepherd relay service gallery',(3,8,-5),(17,14,6),'hull',4)
    beam('Tower service gallery pressure neck',(-10,8,-5),(3,8,-5),5,'armor')
    for z in [42,49]:
        box('Relay rectangular antenna panel',(-14,8,z),(.7,5,4),'dark')
        beam('Relay antenna wall mount',(-12,8,z),(-14,8,z),.6,'metal')
    for s in [-1,1]:beam('Service deck thick edge beam',(s*21,-21,-16),(s*21,20,-16),2,'armor')


def haven():
    # Unequal civic districts grow out of the occupied ring, not sculptural wedges.
    module('Haven port upper civic district',(-23,13,23),(12,19,11),'armor',6)
    module('Haven starboard civic district',(23,14,21),(11,16,7),'hull',4)
    module('Haven rear commercial district',(0,31,18),(22,10,9),'hull',6)
    for s in [-1,1]:
        beam('Civic district enclosed gallery',(s*20,18,17),(s*10,29,17),4,'armor')
        box('Market district gold cornice',(s*23,3.2 if s<0 else 5.7,20),(11,.7,.8),'ochre',chamfer=.2)
    for sign in [-1,1]:
        box('Continuous perimeter market canopy',(sign*23.8,3,-6.5),(5,29,.5),'ochre',chamfer=.5)
        for yy in [-11.2,17.2]:beam('Market canopy occupied-edge support',(sign*21.7,yy,-11),(sign*21.7,yy,-6.5),.25,'metal')
    beam('Rear district inhabited transfer',(0,27,9),(0,31,15),5,'hull')
    for x in [-5,5]:box('Rear civic district roof plant',(x,31,23.3),(3,4,1.2),'metal',chamfer=.3)


def league_yard():
    module('League factory arrival upper gallery',(0,-67,12),(34,23,7),'hull',3)
    for s in [-1,1]:
        box('League longitudinal fabrication district',(s*31,5,3),(10,92,21),'hull',chamfer=1)
        box('Fabrication district occupied roof',(s*31,5,14),(11,92,1),'armor',chamfer=.8)
        for y in [-30,-7,16,39]:
            B.window_wall('Fabrication district service rooms',(s*36.02,y,7),(0,s,0),(s,0,0),8,3,pitch=1,row_pitch=.7)
            B.crew_door('Fabrication district maintenance lock',(s*36.02,y,0),(0,s,0),(s,0,0))
        for y in [-30,14,36]:
            box('Fabrication district structural pier',(s*26,y,8),(2,3,36),'armor',chamfer=.4)
        beam('Factory district protected transfer',(s*14,-55,-8),(s*30,-40,-4),4,'hull')
    # Two actual bridge cranes repeat the tall portal rhythm in the paintings.
    for y in [-30,36]:
        beam('League transverse traveling crane',(-27,y,29),(27,y,29),3,'ochre')
        box('League crane traveling trolley',(0,y,27),(7,5,2),'metal',chamfer=.4)
    for y in [-25,15]:
        beam('Crane district enclosed upper gallery',(-31,y,14),(-31,y+8,14),3,'armor')


def cinderfall():
    for s in [-1,1]:
        x=s*18
        lathe('Cinderfall grounded process furnace',[(-19,5),(-17,6),(8,6),(12,4)],'copper',24,(x,16))
        for z in [-10,-2,7]:collar('Furnace protective service belt',(x,16,z),6.1,.7,.7,'metal',24)
        tube('Furnace seated flue',[(x,16,11),(x,16,22)],1.5,'metal',12)
        tube('Furnace floor process delivery',[(x,16,-15),(x,23,-15),(0,23,-15)],.8,'copper')
    beam('Cinderfall enclosed process bridge',(-18,16,5),(18,16,5),3.2,'hull')
    for x in [-10,10]:
        module('Industrial rear service district',(x,22,5),(9,11,9),'hull',5)
    for x in [-10,10]:
        box('Industrial contained furnace mouth',(x,16.4,3),(5,.3,3.5),'dark')
        box('Refractory furnace glow',(x,16.22,3),(3,.06,2),'warm')
    for a in [.3,1.1,2.2,3.05,3.9]:box('Industrial courtyard external structural bay',(30.25*math.cos(a),30.25*math.sin(a),-7),(.9,3,19),'metal',yaw=a)
    tube('Refinery upper process main',[(-18,16,10),(-10,23,10),(10,23,10),(18,16,10)],.65,'copper')


BUILDERS={name:globals()[name.replace('-','_')]for name in [
    'rook','cairn','argent','gatehouse-twelve','blackglass','cinder',
    'torchwell','nacre','shepherd','haven','league-yard','cinderfall']}


def apply(station_id,metadata):
    before={o.name for o in B.parts};BUILDERS[station_id]()
    B.bpy.context.view_layer.update()
    radius=max((o.matrix_world@v.co).length for o in B.parts for v in o.data.vertices)
    envelope=metadata['architecture']['originalRadius']
    assert radius<=envelope+.02,(station_id,'district exceeds approved world envelope',envelope,radius)
    metadata['architecture'].update(revision='inhabited-districts-v1',silhouettePartsAdded=sum(o.name not in before for o in B.parts),silhouette={
        'rook':'armored military bastions joined by a reinforced roof, narrow arrival hall and a continuous reactor keel',
        'cairn':'inhabited workshop bay, traveling salvage crane and stern repair stores',
        'argent':'inhabited assembly torus, observation lounge and one working gantry',
        'gatehouse-twelve':'deep inspection terminal with occupied control floor and bonded warehouses',
        'blackglass':'rock-seated freeport, recessed warm cave markets and anchored freight apron',
        'cinder':'fractionation towers, horizontal heat-recovery plant and operations street',
        'torchwell':'compact frontier fuel depot with tank racks and connected service rooms',
        'nacre':'rounded research habitat, panoramic observation dome and laboratory pressure necks',
        'shepherd':'navigation lighthouse with mounted antenna equipment and connected service gallery',
        'haven':'curved trading habitat, stepped civic districts and enclosed pedestrian galleries',
        'league-yard':'long fabrication districts, factory arrival hall and working bridge cranes',
        'cinderfall':'inhabited industrial court with grounded furnaces, flues and process bridges'}[station_id])
