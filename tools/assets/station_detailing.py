"""Role-specific station detail. Static geometry, kept away from flight lanes."""
import math
import station_builder as B
from station_builder import box,beam,ring,tube,lathe,truss,mesh
from mathutils import Matrix,Vector

# Personnel doors use the same dimensions on the concourse and occupied modules.
# Freight shutters are separate, deliberately ship-sized industrial entrances.
def side_door(x,y,z,side=1):
    B.crew_door('Crew airlock',(x,y,z),(0,-side,0),(-side,0,0))

def front_airlock(x,y,z):
    B.crew_door('Crew airlock',(x,y,z),(1,0,0),(0,-1,0))

def front_door(x,y,z,w=3,h=3.8):
    # Each fixture overlaps the wall rather than sitting on a competing plane.
    box('Workshop rolling door',(x,y-.08,z+h/2),(w,.28,h),'dark')
    for xx in [x-w/2,x+w/2]:box('Roller door jamb',(xx,y-.22,z+h/2),(.25,.6,h+.5),'metal')
    box('Roller door housing',(x,y-.25,z+h+.2),(w+.5,.9,.6),'armor',chamfer=.12)
    for zz in range(1,math.floor(h*2)):
        box('Roller door reinforced slat',(x,y-.26,z+zz*.5),(w-.25,.16,.22),'metal')
    box('Service door illuminated panel',(x,y-.75,z+h+.2),(w*.55,.12,.13),'warm')

def scale_fixture(first,anchor,world_height,source_height):
    scale=min(1,B.detail_units(world_height)/source_height)
    a=Vector(anchor);transform=Matrix.Translation(a)@Matrix.Scale(scale,4)@Matrix.Translation(-a)
    for o in B.parts[first:]:o.matrix_world=transform@o.matrix_world

def wall_equipment(x,y,z,side=1):
    first=len(B.parts)
    box('Recessed wall plant backplate',(x,y,z+1.8),(.4,2.8,3.6),'metal')
    for yy in [y-.7,y+.7]:
        box('Wall plant enclosure',(x-side*.4,yy,z+1.8),(.7,.9,2.9),'armor',chamfer=.12)
        for zz in [z+1,z+1.6,z+2.2]:box('Plant cooling slot',(x-side*.8,yy,zz),(.12,.6,.19),'dark')
    tube('Wall plant common conduit',[(x,y-1.2,z+.2),(x-side*.45,y-1.2,z+.2),(x-side*.45,y+1.2,z+.2),(x,y+1.2,z+.2)],.15,'copper')

    scale_fixture(first,(x,y,z),6,3.6)

def roof_machine(x,y,z,w=3):
    first=len(B.parts)
    box('Plant seated plinth',(x,y,z+.15),(w+1,3.8,.3),'metal')
    box('Plant angular enclosure',(x,y,z+1.1),(w,3,1.9),'armor',chamfer=.35)
    for dy in [-.8,0,.8]:box('Plant grille duct',(x,y+dy,z+2.1),(w*.7,.35,.25),'dark')
    tube('Plant insulated feed',[(x+w/2,y,z+.7),(x+w/2+.7,y,z+.7),(x+w/2+.7,y,z+.05)],.22,'copper')

    scale_fixture(first,(x,y,z),5,2.225)

def hall(r):
    h=r['concourse']['hall'];w=h['width'];front=h['front'];back=h['back'];floor=r['concourse']['touchdowns'][0][2]
    for side in [-1,1]:
        x=side*w/2
        for y in [front+7,back-5]:side_door(x,y,floor,side)
        wall_equipment(x,(front+back)/2,floor+.3,side)
        for level in range(4,int(h['height'])-1,4):
            # Upper concourse rooms, deep frames and gallery support knees.
            for y in range(math.ceil(front+4),math.floor(back-3),7):
                side_door(x,y,floor+level+.2,side)
                beam('Gallery supporting knee',(x,y,floor+level-1.3),(x-side*1.65,y,floor+level),.24)
        for yy in [front+3,back-3]:
            beam('Hall roof angled haunch',(x,yy,floor+h['height']-2.5),(x-side*2.5,yy,floor+h['height']-.3),.5,'armor')
    for side in [-1,1]:
        for level in range(0,int(h['height'])-1,4):
            for y in range(math.ceil(front+4),math.floor(back-3),4):
                B.window_wall('Landing hall occupied rooms',(side*w/2,y+.9,floor+level+1.05),
                    (0,-side,0),(-side,0,0),3,2,pitch=.62,row_pitch=.48,width=.32,height=.18)
    # Rear galleries are occupied too; keep the existing transfer opening clear.
    transfer=18 if r['id']=='league-yard' else 5
    span=(w-transfer)/2
    for side in [-1,1]:
        for level in range(0,int(h['height'])-1,4):
            B.window_wall('Rear concourse inhabited rooms',
                (side*(w+transfer)/4,back-.5,floor+level+1.05),
                (1,0,0),(0,-1,0),min(6,int(span/1.1)),2,pitch=1.0,row_pitch=.48,width=.32)
    for side in [-1,1]:
        x=side*(w/2-.04)
        for y in [front+9,back-6]:
            B.window_wall('Staffed concourse service frontage',(x,y,floor+1.7),(0,-side,0),(-side,0,0),3,1,pitch=1.25,width=1.05,height=.7)
            box('Occupied-edge service counter',(x-side*.20,y,floor+.65),(.4,4,1.3),'metal',chamfer=.12)
        for y in [front+4,back-3]:side_door(x,y,floor,side)
        beam('Concourse protected walkway datum',(x,front+.7,floor+.25),(x,back-.7,floor+.25),.18,'ochre')
    if r['id']=='helix':
        cy=back-2.8
        for z in [floor+4,floor+8,floor+12]:
            o=ring('Atrium lift illuminated collar',2.09,.16,z+.75,.22,'cool',16);o.location.y=cy
            for side in [-1,1]:
                box('Elevator articulated guide',(side*1.3,cy-1.42,z-1.1),(.22,.6,2.4),'metal')
        front_airlock(0,cy-2,floor)
        for z in [floor+4.2,floor+8.2,floor+12.2]:front_airlock(0,cy-2,z)
    if r['id']=='rook':
        for side in [-1,1]:
            # Attached, angular armor rather than thin floating stickers.
            x=side*(w/2-.3)
            for y in [front+3,back-3]:box('Military blast bulkhead',(x,y,floor+2),(1,1.6,4),'armor',chamfer=.3)
    if r['id']=='league-yard':
        for side in [-1,1]:
            x=side*(w/2-3)
            for y in [back-5,back-11]:
                box('Machinery recessed motor',(x,y,floor+1.5),(2,2.6,2),'dark',chamfer=.3)
                tube('Service cradle hydraulic feed',[(x,y,floor+.1),(x+side*.8,y,floor+.1),(x+side*.8,y,floor+2.6)],.17,'copper')
            beam('Factory crane running rail',(side*(w/2-2),front+1,floor+h['height']-.2),(side*(w/2-2),back-1,floor+h['height']-.2),.4,'ochre')

def court(r):
    industrial=r['id']=='cinderfall';radius=30 if industrial else 36;floor=r['concourse']['touchdowns'][0][2]
    start=math.pi*1.5+.4;end=start+math.tau-.8
    for z in [floor+4,floor+11,floor+18]:
        ring('Courtyard gallery handrail',radius-7.12,.12,z+1,.14,'metal',72,start,end)
        for i in range(29):
            a=start+(end-start)*i/28
            x,y=(radius-7.12)*math.cos(a),(radius-7.12)*math.sin(a)
            beam('Court gallery guard post',(x,y,z+.2),(x,y,z+1),.12)
    for level in [1.1,5.2,8.2,12.2,15.2,19.2]:
        for inward in [True,False]:
            B.window_arc('Court occupied pressure rooms',radius-6 if inward else radius,floor+level,2,80,
                start=start,end=end,inward=inward,pitch=1.25,row_pitch=.55)
    for side in [-1,1]:
        for y in [-7,3,13]:
            x=side*(radius-10)
            if industrial:
                # A flared metal hopper and discharge throat on its existing trestle.
                vs=[(x+dx*wx,y+dy*wy,z)for z,wx,wy in [(floor+3.8,1.2,1.5),(floor+6.2,3,3.5)]for dx,dy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
                mesh('Refinery flared hopper',vs,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'copper')
                box('Hopper dark mouth',(x,y,floor+6.12),(5.7,6.7,.2),'dark')
                for xx in [x-3,x+3]:box('Hopper heavy upper rim',(xx,y,floor+6.25),(.3,7.3,.4),'metal')
                for yy in [y-3.5,y+3.5]:box('Hopper heavy upper rim',(x,yy,floor+6.25),(6.3,.3,.4),'metal')
            else:
                # Raised shutters, small canopies and shopfront display cases.
                sx=x-side*2.35
                for yy in [y-1.5,y+1.5]:box('Shop recessed display',(sx,y+(yy-y),floor+1.6),(.25,1.6,1.9),'glass')
                for yy in [y-2.8,y+2.8]:beam('Market canopy diagonal',(x,yy,floor+3.2),(x-side*3.2,yy,floor+3.7),.18)
                box('Shop counter',(x-side*2.8,y,floor+.8),(1,5.5,1.4),'metal',chamfer=.2)
                box('Shop warm sign',(x-side*3.5,y,floor+3.55),(.15,3,.22),'warm')

def apply(station_id,r):
    detail_start=len(B.parts);r['id']=station_id
    if r['concourse']['kind']=='interior':hall(r)
    if r['concourse']['kind']=='courtyard':court(r)
    if station_id=='helix':
        for x in [-7,7]:roof_machine(x,-18,2.38)
    elif station_id=='rook':
        for x in [-17,17]:roof_machine(x,29,-2.8,4)
    elif station_id=='cairn':
        for y in [-10,3,16]:side_door(-15.5,y,-11,-1)
        for x in [1,10,19]:
            o=ring('Salvage engine service collar',2.05,.25,-6.2,.5,'ochre',16);o.location.x=x;o.location.y=5
            for side in [-1,1]:tube('Salvage engine attached loom',[(x+side*1.7,5,-10),(x+side*2.2,5,-8),(x+side*1.7,5,-5)],.16,'copper')
        roof_machine(-22,12,7.4,4)
    elif station_id=='argent':
        for side in [-1,1]:
            side_door(side*8.6,-55,.1,side)
            wall_equipment(side*8.85,-63,.3,side)
        for x in [-10,10]:roof_machine(x,54,33.9,4)
    elif station_id=='gatehouse-twelve':
        side_door(-15.65,-19,-12.5,-1)
        box('Customs scanning console base',(13,-17,-11.8),(2.8,3,1.4),'metal')
        box('Customs scanning console',(13,-17,-10.1),(2.2,2,2),'armor',chamfer=.3)
        box('Customs console display',(13,-18.05,-10),(1.7,.15,1.1),'cool')
        roof_machine(4,17,17.9,4)
    elif station_id=='blackglass':
        for z in [2,16]:
            for x in [-15,-5,5,15]:
                box('Tavern counter',(x,6,z+.8),(4,1.3,1.6),'copper',chamfer=.2)
                B.window_wall('Tavern divided glazing',(x,8.5,z+2.7),(1,0,0),(0,-1,0),5,2,pitch=.73,row_pitch=.44)
                front_airlock(x+2,8.5,z)
                for side in [-1,1]:beam('Cave canopy curved support',(x+side*2.8,2,z+4.2),(x+side*2.8,5,z+5),.18,'metal')
        for x in [-29,29]:
            box('Cliff terrace braced light post',(x*.8,-8,-8.2),(.7,.7,7.6),'metal')
            box('Cliff terrace hooded lamp',(x*.8,-8,-4.5),(1.1,1.4,.4),'warm')
    elif station_id=='cinder':
        for x,y,z in [(-18,-4,15),(0,21,33),(20,10,10)]:
            for side in [-1,1]:tube('Process tower instrumentation',[(x+side*5,y-6,z-6),(x+side*5,y-6,z+3),(x+side*3,y-7,z+3)],.24,'metal')
        front_door(19,-22,-21,6,6)
        front_airlock(14.6,-22,-21)
        roof_machine(-20,24,3.4,4)
    elif station_id=='torchwell':
        front_door(12,9,-10,5,5)
        front_airlock(8.5,9,-10)
        for x,y,h in [(-24,12,20),(-16,22,35),(-7,28,25)]:
            o=ring('Fuel reservoir valve platform',4.6,.7,-10+h*.73,.45,'metal',24);o.location.x=x;o.location.y=y
            tube('Fuel reservoir external riser',[(x-4,y,-10),(x-4,y,-10+h*.7),(x,y,-10+h*.7)],.28,'ochre')
        roof_machine(12,17,6.33,4)
    elif station_id=='nacre':
        # Clean glazed observation pods remain behind the open landing circle.
        for x in [-9,9]:
            box('Science apron instrument pedestal',(x,-50,-11.5),(2,2,1),'metal')
            lathe('Sample transfer capsule',[(-11, .6),(-10.6,.9),(-8.3,.9),(-8,.6)],'armor',16,(x,-50))
            box('Capsule sample window',(x,-50.8,-9.6),(B.detail_units(3),.3,B.detail_units(1.4)),'glass')
        for x in [-40,40]:roof_machine(x,0,10.25,3)
        for i in range(4):
            a=i*math.tau/4+math.pi/48;cx,cy=40*math.cos(i*math.tau/4),40*math.sin(i*math.tau/4)
            rr=13*math.cos(math.pi/48)
            B.crew_door('Laboratory EVA airlock',(cx+rr*math.cos(a),cy+rr*math.sin(a),.2),
                (-math.sin(a),math.cos(a),0),(math.cos(a),math.sin(a),0))
    elif station_id=='shepherd':
        front_door(13,-2.5,-14,4,5)
        front_airlock(9.8,-2.5,-14)
        for z in [15,20,25]:
            o=ring('Relay tower guide collar',11-(z+18)/11+.15,.65,z,.5,'metal',32);o.location.x=-10;o.location.y=8
        roof_machine(13,14,-1.6,3)
    elif station_id=='haven':
        for x in [-24,24]:roof_machine(x,12,21.4,3)
    elif station_id=='league-yard':
        for x in [-7,7]:roof_machine(x,59,27.4,4)
    elif station_id=='cinderfall':
        for x,y in [(-21,13),(21,20)]:
            tube('Courtyard tower feed',[(x,y,-17),(x+3,y,-17),(x+3,y,0),(x,y,0)],.3,'metal')
        roof_machine(0,23,13.4,4)
    if station_id=='rook':
        pass
    elif station_id=='argent':
        before=len(B.parts)
        for inward in [False,True]:B.window_arc('Assembly torus occupied rooms',56 if inward else 64,2.2,4,64,inward=inward,pitch=1.35)
        # The cut-out is the existing landing terrace, not a pressure wall.
        for o in B.parts[before:]:
            faces=[tuple(p.vertices) for p in o.data.polygons if not(-9.1<p.center.x<9.1 and p.center.y<-47.9 and p.center.z<8.6)]
            data=B.bpy.data.meshes.new(o.name+' clear terrace');data.from_pydata([v.co for v in o.data.vertices],[],faces);data.materials.append(o.data.materials[0]);o.data=data
        for side in [-1,1]:
            for y in [-64,-57,-52]:B.window_wall('Terrace occupied side',(side*8.6,y,2.6),(0,-side,0),(-side,0,0),5,3,pitch=.7)
    elif station_id=='gatehouse-twelve':
        for y in [-32,-25,-17]:B.window_wall('Customs overlooking gallery',(-15.65,y,-8.3),(0,1,0),(1,0,0),6,3,pitch=.68)
    elif station_id=='league-yard':
        for side in [-1,1]:
            for y in [-52,-30,-8,14,36,57]:
                B.window_wall('Drydock pier workroom',(side*27+side*3.5,y,0),(0,side,0),(side,0,0),6,2)
    r['crewDoorHeight']=B.detail_units(3)
    r['crewDoorWidth']=B.detail_units(3)*B.CREW_DOOR_WIDTH/B.CREW_DOOR_HEIGHT
    r['detailParts']=len(B.parts)-detail_start
