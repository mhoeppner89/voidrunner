"""Rebuild the twelve ports after Helix with distinct, connected architecture.

Blender --background --python tools/assets/build-detailed-stations.py [-- rook ...]
Named editable components are saved before export batching. Dimensions are in the
Z-up author's frame; ship traffic and film cameras consume the exported report.
"""
import sys, math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import station_builder as B
import station_concourses as C
import station_detailing as D
import station_volumes as V
import station_silhouettes as S
import station_armament as W
from mathutils import Vector
from station_builder import box,beam,lathe,ring,tube,windows,tank,container,block,truss,radiator,dish,export_model

def mast(x,y,base,top):
    box('Antenna seated pedestal',(x,y,base+.5),(2,2,1),'metal')
    beam('Navigation mast',(x,y,base+.5),(x,y,top),.35)
    for z in [top-5,top-2]:beam('Antenna crossbar',(x-2,y,z),(x+2,y,z),.18)
    box('Navigation beacon',(x,y,top),(.45,.45,.55),'warm')

def roof_vents(x,y,z,count=3):
    for i in range(count):
        xx=x+(i-(count-1)/2)*3
        box('Seated ventilation casing',(xx,y,z+.45),(2.4,3,.9),'metal',chamfer=.15)
        for k in range(4):box('Ventilation inset',(xx-.8+k*.5,y,z+.91),(.13,2,.06),'dark')

def railing(a,b,z):
    a,b=Vector((*a,z)),Vector((*b,z));steps=max(1,int((b-a).length/3))
    for i in range(steps+1):
        p=a.lerp(b,i/steps);beam('Deck railing stanchion',p,p+Vector((0,0,.85)),.09)
    for h in [.4,.85]:beam('Continuous deck safety rail',a+Vector((0,0,h)),b+Vector((0,0,h)),.08,'ochre')

def service_skid(x,y,z):
    box('Maintenance skid',(x,y,z+.15),(3,4,.3),'metal')
    for side in [-1,1]:tank('Service gas reservoir',x+side*.7,y,z+1.3,.5,2.3)
    box('Service pump control',(x,y-1.4,z+.7),(1.3,.9,1.1),'hull',chamfer=.1)
    for k in [-.3,.3]:box('Pump status lamp',(x+k,y-1.86,z+.9),(.16,.05,.09),'cool')

def finish_details(station_id):
    if station_id=='rook':
        for side in [-1,1]:
            box('Casemate inset service armor',(side*47.95,5,-9),(.8,18,8),'dark')
            tube('Casemate protected power main',[(side*25,12,-14),(side*38,12,-14),(side*38,12,-5)],.55,'copper')
    elif station_id=='cairn':
        railing((28,-27),(28,28),-11);railing((-28,-27),(-28,-18),-11)
        for x in [13,21]:
            service_skid(x,-18,-11)
            box('Sorted alloy rack',(x,-6,-10.7),(4,4,.6),'metal')
            for i in range(3):box('Reclaimed hull plate',(x,-6,-10.30+i*.22),(3.8,3.6,.22),'armor',yaw=.06*i)
        for y in [-12,0,12]:
            box('Workshop structural pilaster',(-15.5,y,-2),(.6,1,18),'metal')
            tube('Workshop wall conduit',[(-15.1,y,-9),(-15.1,y,5),(-20,y,5)],.18,'copper')
    elif station_id=='gatehouse-twelve':
        for x in [-13,13]:
            for y in [-4,7,18]:box('Inspection floor lane',(x,y,-12.47),(.14,8,.06),'ochre')
            service_skid(x,31,-12.5)
    elif station_id=='blackglass':
        railing((-24,-29),(-24,-4),-12);railing((24,-29),(24,-4),-12)
        for x in [-20,20]:
            for y in [-18,-10]:container('Cliff terrace consignment',x,y,-12,1.8,3,1.2)
    elif station_id=='torchwell':
        railing((-31,-28),(-31,10),-10);railing((31,-28),(31,10),-10)
    elif station_id=='nacre':
        beam('Telescope foundation',(0,40,10),(0,40,14),1.1)
        dish('Astronomy reflector',(0,40,14),6)
        for x in [-40,40]:
            beam('Sample mast foot',(x,0,10),(x,0,13),.7)
            box('Sample analyser',(x,0,13),(2,3,2),'copper',chamfer=.3)
            box('Analyser glazed face',(x,-1.52,13),(1.4,.08,1),'glass')
    elif station_id=='shepherd':
        service_skid(14,-9,-14)
        for y in [-5,-10,-15]:container('Emergency supply container',-19,y,-14,1.5,3,1.2)
        railing((-21,-21),(-21,-8),-14);railing((21,-21),(21,-8),-14)

def rook():
    # glTF material factors are linear; use the fleet's sRGB paint colors.
    def paint(rgb):
        channels=[((rgb>>shift)&255)/255 for shift in [16,8,0]]
        return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in channels)
    B.init('rook','Rook Bastion · fortified vertical hangar',{
        'hull':paint(0x182d4d),'armor':paint(0xe3e5df),'ochre':paint(0xd8ad56),
        'metal':paint(0x65788c),'copper':paint(0x96723b)})
    # Thick armored wings flank the landing hall; a common stern body joins them.
    for side in [-1,1]:
        x=side*20
        B.pressure_building('Rook tall armored arrival wing',[(-22,x,-10,19,50),(-17,x,-10,23,58),(26,x,-10,23,58),(33,x,-8,18,50),(37,x,-6,12,36)],'hull',3)
        for y in [-29,-10,9]:box('Arrival wing armored buttress',(side*31.7,y,5),(2,3,39),'armor',chamfer=.6)
        box('Arrival wing crown shoulder',(x,-6,37),(12,35,1),'armor',chamfer=1)
        box('Arrival wing inset armor field',(side*31.70,-10,6),(.5,39,25),'dark')
        for z in [-12,-2,9,20]:B.window_wall('Protected arrival wing slit bank',(x,-39.02,z),(1,0,0),(0,-1,0),4,1,pitch=2.2,width=1.5,height=.4)
        B.text('Military station identification','ROOK',(x,-39.02,15),1.4,'armor')
        block('Rear engineering block',(side*17,29,-9),(13,20,12),rows=4)
        # Two integrated low casemates, rather than four giant detached barrels.
        box('Rook integrated defense casemate',(side*38,5,-9),(20,29,21),'hull',chamfer=3)
        beam('Casemate occupied transfer',(side*25,5,-8),(side*38,5,-8),8,'armor')
    block('Rook inhabited stern command body',(0,18,2),(40,26,42),'hull',rows=7)
    block('Rook overhead command bridge',(0,-24,24.5),(37,14,10),'armor',rows=4)
    for x in [-7,7]:B.window_wall('Command bridge observation rooms',(x,-31,24.5),(1,0,0),(0,-1,0),4,2,pitch=1.5,row_pitch=.5,width=.8,height=.3)
    m=C.build('rook',('vanguard','lancer'))
    # Give the portal frame a visible raised lip. Its old front was only .05
    # ahead of the shoulder wall, below the flight depth buffer's precision.
    for o in B.parts:
        if o.name.startswith('Main concourse portal'):o.location.y-=.20
    # A closed armored vault covers the upper central slot. Its eaves embed
    # in both stepped bastions; front/rear pressure gables seat in the command
    # hulls. The genuine flight doorway and its existing ceiling stay below.
    top=[(-14.5,32.2),(-12,34.2),(-4,36.2),(4,36.2),(12,34.2),(14.5,32.2)]
    cross=top+[(x,z-1.4)for x,z in reversed(top)];n=len(cross)
    vs=[(x,y,z)for y in [-33.8,18.2]for x,z in cross]
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    fs.extend((i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n))
    roof=B.mesh('Rook central armored roof',vs,fs,'armor');roof['station_panel_scale']=5
    for label,y,depth,base in [('forward',-30,8,28.7),('aft',15,6,22.9)]:
        B.pressure_building('Rook '+label+' roof pressure gable',[
            (base,0,y,28,depth),(31,0,y,28,depth),(33,0,y,23.6,depth),(35,0,y,8,depth)],'hull',.45)
    # Load ribs wrap the roof profile rather than floating above the plating.
    for y in [-31.5,-12,13.8]:
        for (x0,z0),(x1,z1)in zip(top,top[1:]):
            beam('Rook roof transverse armor rib',(x0,y,z0+.025),(x1,y,z1+.025),.28,'metal')
    for side in [-1,1]:
        beam('Rook roof longitudinal armored sill',(side*14.35,-33.7,32.13),(side*14.35,16.8,32.13),.4,'metal')
        for y in [-21,1]:
            x=side*8;z=35.2;angle=side*math.atan(.25)
            panel=box('Rook roof seated service panel',(x,y,z+.08),(3.2,7,.4),'metal',chamfer=.18);panel.rotation_euler.y=angle
            for dy in [-2,-.8,.4,1.6]:
                grille=box('Rook roof seated cooling grille',(x,y+dy,z+.30),(2.3,.28,.16),'dark');grille.rotation_euler.y=angle
    for z in [30.3,31.4]:
        B.window_wall('Roof command gallery small rooms',(0,-34.01,z),(1,0,0),(0,-1,0),8,1,pitch=1.6,width=B.detail_units(3),height=B.detail_units(1.4))
    box('Rook roof gallery armored brow',(0,-34.10,32.3),(18,.45,.35),'metal',chamfer=.1)
    roof_vents(0,3,36.13,3);mast(0,11,36.16,46)
    m['centralRoof']={'front':-33.8,'back':18.2,'ridgeHeight':36.2,'thickness':1.4,'gableFront':-34,'gableBack':18}
    # Compact pod-mounted pressure collars. Frigates dock belly-up so their
    # broad ventral hull meets the seal, without a long stalk or mast collisions.
    ports=[]
    for side in [-1,1]:
        label='port'if side<0 else'starboard'
        lathe('Rook '+label+' capital pressure gangway',[(-26.7,1.65),(-26.25,1.65),(-25.8,2.0),(-25.2,2.65)],'hull',16,(side*30,13))
        for z,r in [(-25.65,2.2),(-26.65,1.95)]:
            collar=ring('Rook '+label+' capital docking collar',r,.7,z,.3,'armor',16)
            collar.location.x=side*30;collar.location.y=13
        for xoff in [-1,1]:
            box('Rook '+label+' docking alignment lamp',(side*30+xoff*1.9,13,-26.7),(.28,.7,.18),'cool')
        ports.append({'id':label,'position':[side*30,13,-26.7],'outward':[0,0,-1],'occupied':True,'collarLength':1.5})
        m['occupants'].append({'id':'rook-'+label+'-frigate','hull':'concord-frigate','capital':True,'moored':True,
            'at':[side*30,13,-37.5],'size':[23,21,76],'roll':math.pi,'dockPort':[side*30,13,-26.7],'outward':[0,0,-1]})
    tube('Rook ventral heavy docking pressure trunk',[(0,0,-47.3),(0,0,-49.1)],3.0,'hull',16)
    for z in [-47.7,-49]:ring('Rook ventral heavy capital collar',3.5,1.2,z,.35,'armor',20)
    for side in [-1,1]:
        box('Rook ventral heavy docking guidance',(side*3.3,0,-49.1),(.5,.8,.18),'cool')
    ports.append({'id':'ventral-heavy','position':[0,0,-49.1],'outward':[0,0,-1],'occupied':False,'collarLength':1.8})
    m['capitalPorts']=ports
    return m,'Paired deep armored arrival wings joined by a closed pitched armored roof above the vertical landing hall, with an inhabited command bridge, continuous lower keel and stern engineering body.'


def cairn():
    B.init('cairn','Cairn Anchorage · salvage and repair yard',{'armor':(.60,.55,.40),'hull':(.26,.32,.33),'copper':(.44,.20,.10)})
    box('Salvage yard load deck',(0,0,-13),(59,63,4),'hull',chamfer=3)
    for x in [-22,0,22]:truss('Ventral deck keel',(x,-28,-15),(x,27,-15),3)
    block('Side machine workshop',(-22,4,-2),(13,39,18),rows=10)
    block('Rear reclaimed parts store',(5,22,-5),(37,16,12),rows=6)
    block('Crane control cabin',(-19,-8,9.7),(9,8,5),rows=3)
    for x in [-22,22]:
        beam('Overhead salvage crane upright',(x,2,-11),(x,2,25.5),1.7,'ochre')
        beam('Crane foot brace',(x,-6,-11),(x,2,7),.9)
        box('Crane foundation shoe',(x,2,-10.4),(4,5,1.2),'metal')
    beam('Salvage crane crossbeam',(-22,2,24),(22,2,24),2,'ochre')
    for z in [22.8,25.1]:beam('Crane guide rail',(-22,2,z),(22,2,z),.4)
    box('Hoist trolley',(5,2,23),(5,4,2),'metal',chamfer=.4)
    for x in [4,6]:beam('Tensioned hoist cable',(x,2,22),(x,2,8),.12,'dark')
    box('Suspended engine lifting frame',(5,2,8),(5,6,.6),'ochre')
    for x in [1,10,19]:
        box('Recovered drive pallet',(x,5,-10.7),(5,8,.6),'metal')
        lathe('Recovered engine housing',[(-10.4,1.8),(-8,2.2),(-4,1.7)],'metal',12,(x,5))
        ring_obj=B.ring('Engine flange',2.3,.4,-7,.3,'copper',12);ring_obj.location.x=x;ring_obj.location.y=5
    for x in [0,7,14,21]:
        for y in [19,24]:container('Recovered alloy container',x,y,-11,1.8,3,1.5)
    for y in [-15,-3,9]:
        tank('Workshop gas cylinder',-30,y,-5,1.6,10)
        beam('Tank workshop saddle',(-28,y,-5),(-30,y,-5),1)
    m=C.build('cairn',('prospector', 'talon'))
    mast(-23,20,7.2,28);roof_vents(-22,10,7.2)
    return m,'Open salvage yard with a tensioned gantry hoist, machine shops, reclaimed engines and a sheltered working landing apron.'

def argent():
    B.init('argent','Argent Spindle · orbital assembly ring',{'armor':(.68,.68,.61),'hull':(.27,.34,.41),'ochre':(.75,.53,.12)})
    ring('Main assembly torus',60,8,5,12,'hull',64)
    for z in [-1,11]:ring('Torus armor lip',60,9,z,1.2,'armor',64)
    for i in range(16):
        a=i*math.tau/16;x,y=60*math.cos(a),60*math.sin(a)
        box('Torus segment service module',(x,y,6),(5,9,6),'armor',yaw=a,chamfer=.5)
        if i%4==0:truss('Assembly ring keel support',(x,y,-1),(x*.35,y*.77,-20),3)
    box('Frigate drydock keel',(0,0,-21),(44,108,3),'hull',chamfer=1)
    for x in [-18,18]:
        beam('Continuous capital cradle rail',(x,-51,-18.8),(x,51,-18.8),1.5,'ochre')
        for y in [-37,-12,13,38]:
            beam('Fixed assembly workarm',(x*1.8,y,0),(x*1.8,y,21),1.2)
            beam('Workarm outer root',(x,y,-20),(x*1.8,y,0),1.2)
            box('Assembly tool carrier',(x*1.8,y,21),(4,3,3),'ochre',chamfer=.5)
    block('Assembly control block',(0,54,25),(30,15,17),rows=10)
    for x in [-12,12]:beam('Control block ring leg',(x,54,3),(x,54,17),3,'hull')
    mast(0,54,33.7,54)
    m=C.build('argent',('lancer', 'atlas'))
    m['occupants'].append({'hull':'concord-frigate','capital':True,'deck':-19.5,'keel':18,'at':[0,0,-15],'size':[23,21,76]})
    return m,'Orbital assembly torus around a working frigate drydock; ring workstations and supported assembly arms.'

def gatehouse():
    B.init('gatehouse-twelve','Gatehouse Twelve · customs checkpoint',{'hull':(.24,.30,.36),'armor':(.63,.64,.58),'ochre':(.82,.51,.08)})
    box('Inspection load-bearing spine',(0,6,-15),(38,74,5),'hull',chamfer=2)
    for side in [-1,1]:
        x=side*23
        box('Bonded warehouse foundation',(x,12,-13),(15,48,3),'metal',chamfer=1)
        block('Bonded warehouse',(x,18,-5),(15,32,13),rows=3)
        for y in [6,17,28]:
            box('Warehouse wall brace',(x+side*7.4,y,-4),(1,1.8,12),'armor')
            container('Sealed inspected freight',x,-4+y*.1,-11.5,2.2,4,1.8)
        box('Scanner seated floor shoe',(side*14.8,-20,-12.3),(2.5,3,.4),'metal')
        beam('Scanning gantry leg',(side*14.8,-20,-12.5),(side*14.8,-20,-2.2),1,'metal')
    beam('Inspection scanner overhead',(-14.8,-20,-2.2),(14.8,-20,-2.2),.8,'metal')
    for x in range(-12,13,6):
        box('Supported scanner head',(x,-20,-2.9),(1.8,1.5,1.2),'ochre',chamfer=.2)
        box('Scanner emitter',(x,-20,-3.52),(.9,1,.06),'cool')
    block('Customs administration',(0,15,2.5),(25,19,30),rows=15)
    roof_vents(0,18,17.7,4);mast(-8,15,17.7,41)
    dish('Traffic control antenna',(8,16,22),5);beam('Antenna mounting column',(8,16,17.7),(8,16,22),1)
    m=C.build('gatehouse-twelve',('atlas', 'vanguard'))
    for x in [-18,18]:
        for y in [-7,5]:container('Customs evidence container',x,y,-12.5,1.5,3,1.2)
    return m,'Customs checkpoint with a full inspection gantry, bonded warehouses, administration and a covered shared inspection deck.'

def blackglass():
    B.init('blackglass','Blackglass · moon-cliff freeport',{'hull':(.20,.22,.23),'armor':(.43,.41,.36),'copper':(.36,.13,.09),'ochre':(.63,.36,.14),'rock':(.22,.23,.24)})
    stone=B.M['rock'].node_tree.nodes.get('Principled BSDF');stone.inputs['Metallic'].default_value=0;stone.inputs['Roughness'].default_value=.97
    # A solid irregular cliff embeds into the moon. Recessed tavern galleries
    # are excavated out of it, with real floors, lintels and deep occupied rooms.
    nx,nz=12,12;vs=[]
    for z in range(nz+1):
        for x in range(nx+1):
            xx=-34+x*68/nx;zz=-24+z*65/nz
            yy=1.8+1.5*math.sin(x*1.17+z*.41)+.8*math.cos(z*.93-x*.33)
            vs.append((xx,yy,zz))
    fs=[]
    for z in range(nz):
        for x in range(nx):
            i=z*(nx+1)+x;fs.append((i,i+1,i+nx+2,i+nx+1))
    perimeter=list(range(nx+1))+[z*(nx+1)+nx for z in range(1,nz+1)]+[nz*(nx+1)+x for x in range(nx-1,-1,-1)]+[z*(nx+1)for z in range(nz-1,0,-1)]
    back=[]
    for i in perimeter:back.append(len(vs));xx,yy,zz=vs[i];vs.append((xx,32,zz))
    fs.append(tuple(reversed(back)))
    for i,j in enumerate(perimeter):fs.append((j,perimeter[(i+1)%len(perimeter)],back[(i+1)%len(back)],back[i]))
    B.mesh('Moon rock cliff with excavated galleries',vs,fs,'rock')
    for level in [2,16]:
        C.carve('Cave gallery excavation',(-21,-5,level),(21,15,level+7))
        for side in [-1,1]:
            # Rock cheeks form irregular arched corners around each real cave.
            tri=[(side*22,level+3.8),(side*17.5,level+7.5),(side*22,level+8)]
            vv=[(x,y,z)for y in [-1,8]for x,z in tri]
            B.mesh('Cave mouth broken rock cheek',vv,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],'rock')
        box('Deep cave occupied back wall',(0,12,level+3.5),(42,2,7),'copper')
        box('Cave gallery slab',(0,3.5,level-.3),(44,18,.6),'metal',chamfer=.6)
        box('Cave gallery warm ceiling',(0,3.5,level+7.2),(44,18,.6),'hull',chamfer=1)
        for x in [-20,-10,10,20]:beam('Cave gallery rock pier',(x,2,level),(x,2,level+7),1.5,'hull')
        for x in [-15,-5,5,15]:
            block('Cliff tavern recess',(x,10,level+2.2),(6,3,4.4),'copper',rows=3)
            box('Warm tavern canopy',(x,5.5,level+5),(7,9,.4),'ochre')
            for xx in [x-3,x+3]:beam('Canopy rock anchor',(xx,2,level),(xx,2,level+5),.25)
        railing((-20,-5),(20,-5),level)
    box('Cliff landing terrace',(0,-14,-13),(51,38,2),'metal',chamfer=2)
    for x in [-21,-7,7,21]:
        truss('Cliff terrace cantilever',(x,15,-23),(x,-28,-13),2)
        beam('Rock embedded foundation bolt',(x,12,-23),(x,31,-23),2)
    for x in [-29,29]:mast(x,8,20,38)
    m=C.build('blackglass',('demon', 'scrapper'))
    return m,'Open moon-cliff terrace below two deeply excavated warm tavern galleries, with rock anchors and cantilevered foundations.'

def cinder():
    B.init('cinder','Cinder Works · vertical ore processing plant',{'hull':(.29,.25,.23),'armor':(.52,.50,.44),'copper':(.49,.17,.075),'ochre':(.75,.36,.07)})
    box('Industrial foundation',(0,2,-24),(61,68,6),'hull',chamfer=3)
    for x,y,h in [(-18,-4,43),(0,21,62),(20,10,32)]:
        lathe('Ore fractionation tower',[(-21,7),(-17,9),(h-4,9),(h,6)],'copper',24,(x,y))
        for z in range(-12,h-3,9):
            o=ring('Tower service ring',9.2,1.5,z,.9,'metal',24);o.location.x=x;o.location.y=y
            box('Tower access ladder',(x+8.8,y,z+4),(.5,.8,8),'ochre')
        tube('Main process riser',[(x+9,y,-20),(x+9,y,h-7),(x+4,y,h-7)],.7,'metal')
        box('Tower top heat exchanger',(x,y,h),(6,6,2),'metal',chamfer=.5)
    for a,b,z in [((-18,-4),(0,21),18),((0,21),(20,10),27)]:
        truss('Tower maintenance bridge',(*a,z),(*b,z),2.2)
        tube('Ore transfer pipe',[(*a,z-2),(*b,z-2)],.7,'copper')
        for x,y in [a,b]:beam('Bridge seated bracket',(x,y,z-4),(x,y,z),.7)
    block('Refinery operations',(-20,24,-9),(16,18,24),rows=15)
    block('Freight sorting house',(19,-11,-11),(18,22,20),rows=7)
    for x in [-28,28]:
        truss('Heat wing pedestal',(x,19,-22),(x,19,-4),3)
        radiator('Process cooling wing',(x,19,-4),(x*1.9,24,-4),20)
    for y in [-26,-19,-12]:container('Ore transport skip',-27,y,-21,2.6,5,2)
    m=C.build('cinder',('atlas', 'prospector'))
    mast(-20,24,3.2,25)
    return m,'Tall connected ore-fractionation towers with pipe bridges, sorting house, cooling wings and freight berths.'

def torchwell():
    B.init('torchwell','Torchwell · frontier fuel depot',{'hull':(.30,.32,.30),'armor':(.60,.54,.40),'copper':(.42,.24,.13)})
    box('Broad exposed fuel apron',(0,-4,-12),(65,57,4),'hull',chamfer=2)
    box('Rear reservoir foundation',(-14,22,-12),(35,32,4),'metal',chamfer=1)
    for x,y,h in [(-24,12,20),(-16,22,35),(-7,28,25)]:
        tank('Main rear fuel reservoir',x,y,-10+h/2,4.5,h)
        for dx in [-2,2]:beam('Reservoir seated saddle',(x+dx,y,-10),(x+dx,y,-8),1)
        tube('Fuel distribution manifold',[(x,y,-9),(x,-1,-9),(-29,-1,-9)],.5,'copper')
    block('Low frontier service house',(12,17,-5),(20,16,10),rows=6)
    roof_vents(12,19,.2,3);mast(18,20,.2,30)
    dish('Frontier link',(7,19,5),3.5);beam('Frontier link pedestal',(7,19,.2),(7,19,5),1)
    for x in [-29,29]:service_skid(x,2,-10)
    radiator('Depot heat exchanger',(-12,30,-12),(-37,34,-9),10)
    m=C.build('torchwell',('prospector', 'wayfarer'))
    return m,'Exposed refueling apron, a rear triad of reservoirs and low service house, matching the open frontier concourse.'

def nacre():
    B.init('nacre','Nacre Research · pressure-laboratory cluster',{'hull':(.41,.47,.50),'armor':(.75,.76,.69),'copper':(.27,.43,.48),'ochre':(.34,.62,.63)})
    lathe('Central science pressure hull',[(-19,10),(-15,18),(8,18),(13,13),(17,10)],'armor',48)
    for z in [-11,-3,5]:windows(18,z,5,'Science occupied windows')
    for i in range(4):
        a=i*math.tau/4;x,y=40*math.cos(a),40*math.sin(a)
        beam('Enclosed laboratory transfer tunnel',(x*.35,y*.35,0),(x,y,0),5,'hull')
        lathe('Round pressure laboratory',[(-12,5),(-10,10),(-5,13),(2,13),(6,11),(9,7),(10,1)],'armor',48,(x,y))
        # Window bands follow their local cylindrical module, including its offset.
        before=len(B.parts);windows(13,-3,4,'Laboratory occupied windows')
        for o in B.parts[before:]:o.location.x=x;o.location.y=y
        for z in [-5,1]:
            o=ring('Laboratory equator band',13.1,1,z,.5,'metal',48);o.location.x=x;o.location.y=y
        tank('Laboratory life support',x,y,-21,2.5,15)
        beam('Lab utility neck',(x,y,-11),(x,y,-15),2)
        box('Laboratory roof hatch',(x,y,10),(3,3,.5),'metal',chamfer=.3)
    # Offset terminal preserves an unobstructed central approach in front of the south lab.
    m=C.build('nacre',('talon', 'lancer'))
    mast(0,0,23,43)
    for side in [-1,1]:radiator('Laboratory thermal array',(side*13,8,-12),(side*31,25,-16),10)
    return m,'Pearlescent laboratory cluster with pressure vessels, enclosed transfer tunnels, life support and an exposed circular science terrace.'

def shepherd():
    B.init('shepherd','Shepherd Relay · navigation lighthouse',{'hull':(.29,.34,.37),'armor':(.64,.61,.51),'ochre':(.78,.47,.10)})
    box('Relay service deck',(0,0,-16),(45,48,4),'hull',chamfer=3)
    lathe('Relay tower base',[(-25,8),(-18,11),(26,7),(30,9),(37,9),(40,5),(54,4)],'hull',48,(-10,8))
    for z,r in [(-12,10),(22,8),(29,9.1),(37,9.1)]:
        o=ring('Relay tower structural band',r,1.3,z,.8,'armor',48);o.location.x=-10;o.location.y=8
    before=len(B.parts);windows(9,31,3,'Watch room windows')
    for o in B.parts[before:]:o.location.x=-10;o.location.y=8
    panoramic=ring('Watch level panoramic glazing',9.03,.12,32.1,B.detail_units(5),'glass',48);panoramic.location.x=-10;panoramic.location.y=8
    mast(-10,8,54,72)
    truss('Reflector supported outrigger',(-10,8,22),(12,8,31),3)
    dish('Primary deep-space reflector',(12,8,31),13)
    block('Remote maintenance house',(13,9,-8),(14,23,12),rows=5)
    roof_vents(13,14,-1.8,2)
    lathe('Ventral power plant',[(-33,5),(-28,9),(-17,9)],'metal',24)
    for x in [-16,16]:truss('Deck to generator knee',(x,-14,-17),(0,0,-31),2)
    radiator('Remote power cooling',(0,8,-25),(29,16,-23),12)
    m=C.build('shepherd',('wayfarer', 'talon'))
    return m,'A tall inhabited navigation lighthouse, braced deep-space dish, remote service workshop and open landing aprons.'

def haven():
    B.init('haven','Haven Anchorage · inhabited trading habitat',{'hull':(.20,.30,.42),'armor':(.63,.65,.59),'copper':(.43,.25,.14),'ochre':(.75,.50,.16)})
    m=C.build('haven',('andromeda', 'speedster'))
    for side in [-1,1]:
        block('Habitat roof conservatory',(side*24,12,17),(10,14,8),rows=4)
        roof_vents(side*24,12,21.2,2)
    mast(24,12,21.2,39)
    lathe('Habitat ventral services',[(-24,7),(-20,13),(-14,13)],'metal',32)
    radiator('Habitat cooling',(-12,6,-13),(-29,30,-20),12)
    return m,'Open circular trading courtyard within an inhabited blue-and-gold habitat ring, linked galleries, market awnings and high skybridge.'

def league_yard():
    B.init('league-yard','League Yard · cruiser construction cradle',{'hull':(.24,.30,.36),'armor':(.58,.61,.60),'ochre':(.73,.48,.13)})
    box('Cruiser drydock keel foundation',(0,0,-17),(47,132,5),'hull',chamfer=2)
    for side in [-1,1]:
        x=side*27
        box('Longitudinal drydock service spine',(x,0,-11),(9,130,11),'hull',chamfer=1)
        for y in [-52,-30,-8,14,36,57]:
            beam('Drydock rib foot',(side*20,y,-16),(x,y,-10),3)
            beam('Drydock upright',(x,y,-10),(x,y,28),1.6,'armor')
            beam('Crane inward arm',(x,y,28),(side*18,y,31),1.4,'ochre')
            box('Crane work head',(side*18,y,31),(3,4,3),'metal',chamfer=.4)
            box('Drydock pier workroom',(x,y,-1),(7,9,7),'armor',chamfer=.5)
            for k in [-2,0,2]:box('Pier occupied window',(x+k,y-4.52,0),(.7,.07,.3),'warm')
        for y in [-39,5,47]:
            tank('Yard propellant reservoir',side*36,y,-9,3.8,19)
            beam('Reservoir drydock saddle',(x,y,-10),(side*36,y,-10),2)
    block('Rear yard command tower',(0,57,6),(22,18,42),rows=28)
    roof_vents(0,59,27.2,4);mast(0,58,27.2,54)
    for x in [-14,14]:beam('Cruiser keel bearer rail',(x,-60,-13.8),(x,60,-13.8),1.4,'ochre')
    m=C.build('league-yard',('speedster', 'astra'))
    m['occupants'].append({'hull':'concord-cruiser','capital':True,'deck':-14.5,'keel':14,'at':[0,-2,-11],'size':[24,34,82]})
    return m,'Long cruiser drydock with connected crane ribs, service spines, propellant saddles and a directly connected factory landing hall.'

def cinderfall():
    B.init('cinderfall','Cinderfall · industrial courtyard habitat',{'hull':(.31,.27,.24),'armor':(.59,.54,.43),'copper':(.50,.20,.095),'ochre':(.78,.44,.11)})
    m=C.build('cinderfall',('prospector', 'atlas'))
    lathe('Ventral heat stack',[(-42,4),(-38,8),(-23,8),(-21,12)],'metal',24)
    for z in [-38,-34,-30]:ring('Heat stack collar',8.1,1,z,.7,'copper',24)
    for x,y in [(-21,13),(21,20)]:
        tank('Courtyard processing tower',x,y,-9,3.4,17)
        tube('Court process manifold',[(x,y,-17),(x,20,-20),(0,20,-20)],.5,'copper')
    block('Rear refinery control house',(0,23,8),(18,10,10),rows=7)
    for x in [-7,7]:beam('Control house visible foundation pier',(x,20,-19),(x,20,3),1.2,'armor')
    beam('Control house front bearing',(-9,18,2.7),(9,18,2.7),.8,'metal')
    mast(0,23,13.2,34)
    for side in [-1,1]:
        radiator('Refinery heat wing',(side*17,8,-22),(side*44,12,-20),20)
        tube('Heat wing feed',[(side*12,8,-22),(side*17,8,-22),(side*44,12,-20)],.6,'copper')
    return m,'Open industrial court within inhabited pressure galleries, warm process towers, conveyor and exposed ventral heat plant.'

BUILDERS={'rook':rook,'cairn':cairn,'argent':argent,'gatehouse-twelve':gatehouse,'blackglass':blackglass,'cinder':cinder,'torchwell':torchwell,'nacre':nacre,'shepherd':shepherd,'haven':haven,'league-yard':league_yard,'cinderfall':cinderfall}
requested=sys.argv[sys.argv.index('--')+1:]if '--'in sys.argv else list(BUILDERS)
for station_id in requested:
    metadata,description=BUILDERS[station_id]()
    V.apply(station_id,metadata)
    S.apply(station_id,metadata)
    finish_details(station_id)
    D.apply(station_id,metadata)
    if station_id=='rook':W.rook(metadata)
    export_model(station_id,metadata,description)
