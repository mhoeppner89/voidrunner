"""Concourse architecture follows the existing location paintings.

These are actual landing spaces in the shipped model: shared halls behind an
entrance, sheltered working decks, exterior platforms and open habitat courts.
The approved 2D backgrounds and ship placements remain unchanged.
"""
import math,bpy
from mathutils import Vector
import station_builder as B
from station_builder import box,beam,mesh,ring,lathe,tube,block,truss,container,tank

REFERENCES={
 'helix':('helix-hd-v1.webp','interior','Cylindrical multilevel atrium, central lift tower and broad side portal.'),
 'rook':('rook-hd-v1.webp','interior','Tall military landing hall with a vertical entrance and flanking galleries.'),
 'cairn':('concourse-cairn-hd-v2.webp','sheltered','Working salvage apron beneath a cantilevered workshop roof.'),
 'argent':('concourse-argent-hd-v2.webp','sheltered','Open-sided landing terrace integrated into the construction torus.'),
 'gatehouse-twelve':('concourse-gatehouse-twelve-hd-v2.webp','sheltered','Covered inspection hall, an open space-facing side and a service tunnel.'),
 'blackglass':('concourse-blackglass-hd-v2.webp','exterior','Open cliff platform beneath two warm cave galleries.'),
 'cinder':('concourse-cinder-hd-v2.webp','exterior','Refinery forecourt, processing plant behind it and a framed side opening.'),
 'torchwell':('concourse-torchwell-hd-v2.webp','exterior','Broad exposed fuel apron with reservoirs and service house at the rear.'),
 'nacre':('concourse-nacre-hd-v2.webp','exterior','Circular exposed terrace directly joined to the white pressure laboratories.'),
 'shepherd':('concourse-shepherd-hd-v2.webp','exterior','Flat open landing deck beside the relay tower.'),
 'haven':('acheron-haven-concourse.webp','courtyard','Open circular trading court, blue/gold galleries, awnings and skybridges.'),
 'league-yard':('acheron-unity-concourse.webp','interior','Large covered factory hall connected directly to the capital construction yard.'),
 'cinderfall':('acheron-cinderfall-concourse.webp','courtyard','Open industrial court enclosed by habitat walls, conveyors and warm refinery equipment.'),
}

# Inspection cameras frame the landing floor together with its surrounding rooms.
# Author coordinates: X across, -Y toward the arrival side, Z up.
VIEWS={
 'helix':([-8,-35,-9],[2,-20,-11]),
 'rook':([-6,-39,-6],[3,-27,-8]),
 'cairn':([-9,-29,-4],[2,-9,-10]),
 'argent':([-6,-68,3],[3,-50,3]),
 'gatehouse-twelve':([-12,-35,-8],[6,-14,-6]),
 'blackglass':([-29,-60,10],[1,-2,8]),
 'cinder':([-18,-38,-8],[5,-12,-15]),
 'torchwell':([-33,-47,13],[1,8,-1]),
 'nacre':([-26,-81,7],[0,-50,-10]),
 'shepherd':([-32,-47,7],[0,-7,-11]),
 'haven':([-11,-26,-5],[4,0,-7]),
 'league-yard':([-13,-79,-8],[3,-67,-12]),
 'cinderfall':([-10,-19,-13],[4,10,-9]),
}

def remove(o):
    if o in B.parts:B.parts.remove(o)
    bpy.data.objects.remove(o,do_unlink=True)

def carve(name,low,high):
    """Make a real opening in the existing body, not a black rectangle on it."""
    bpy.context.view_layer.update();targets=list(B.parts)
    cutter=box(name,[(a+b)/2 for a,b in zip(low,high)],[b-a for a,b in zip(low,high)],'dark')
    for o in targets:
        vs=[o.matrix_world@Vector(v)for v in o.bound_box]
        lo=[min(v[k]for v in vs)for k in range(3)];hi=[max(v[k]for v in vs)for k in range(3)]
        if any(lo[k]>=high[k]-.001 or hi[k]<=low[k]+.001 for k in range(3)):continue
        if all(lo[k]>=low[k]and hi[k]<=high[k]for k in range(3)):
            remove(o);continue
        if 'windows' in o.name.lower():
            # Surface decals have no closed volume for a Boolean operation.
            faces=[]
            for p in o.data.polygons:
                c=o.matrix_world@p.center
                if not all(low[k]<c[k]<high[k]for k in range(3)):faces.append(tuple(p.vertices))
            if not faces:remove(o);continue
            data=bpy.data.meshes.new(o.name+' clipped');data.from_pydata([v.co for v in o.data.vertices],[],faces)
            for m in o.data.materials:data.materials.append(m)
            o.data=data;continue
        mod=o.modifiers.new('Real concourse opening','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
        if not o.data.polygons:remove(o)
    remove(cutter)

def portal(name,x,y,z,w,h,thick=.7):
    """Solid chamfered frame. The inside is a flyable opening."""
    def contour(width,height,c):
        return [(-width/2+c,0),(width/2-c,0),(width/2,c),(width/2,height-c),(width/2-c,height),(-width/2+c,height),(-width/2,height-c),(-width/2,c)]
    inner=contour(w,h,min(1,w*.1,h*.1));outer=[(a*(w+thick*2)/w,(b-h/2)*(h+thick*2)/h+h/2)for a,b in inner]
    vs=[(x+a,y+dy,z+b)for dy in [-thick/2,thick/2]for points in [outer,inner]for a,b in points];fs=[]
    for i in range(8):
        j=(i+1)%8
        fs.extend([(i,j,8+j,8+i),(16+i,24+i,24+j,16+j),(i,16+i,16+j,j),(8+i,8+j,24+j,24+i)])
    mesh(name,vs,fs,'armor')
    for side in [-1,1]:
        box(name+' guidance',(x+side*(w/2+.13),y-thick/2-.025,z+h*.48),(.12,.09,h*.5),'cool')

def railing(a,b,z,colour='metal'):
    a,b=Vector((*a,z)),Vector((*b,z));n=max(1,int((b-a).length/2.5))
    for i in range(n+1):
        p=a.lerp(b,i/n);beam('Concourse guard post',p,p+Vector((0,0,.7)),.085,colour)
    for h in [.34,.7]:beam('Concourse guard rail',a+Vector((0,0,h)),b+Vector((0,0,h)),.075,colour)

def circle(name,x,y,z,r,material='ochre',segments=64):
    o=ring(name,r,.055,z+.015,.05,material,segments);o.location.x=x;o.location.y=y
    for dx in [-r*.4,r*.4]:box(name+' centre mark',(x+dx,y,z+.015),(.08,r*.6,.05),material)

def floor_lights(x,y,z,width):
    for side in [-1,1]:
        for dy in [-3,-1,1,3]:box('Inset landing deck lamp',(x+side*width,y+dy,z+.015),(.16,.4,.05),'cool')

def metadata(station_id,positions,floor,npcs,door_width,door_height,hall=None,roof=False):
    """Positions are actual touchdown centres; compensate the legacy pad offset."""
    specs=[[x,y+7*.28,floor,4,7]for x,y in positions]
    for i,(x,y)in enumerate(positions):
        circle('Shared concourse landing circle'if i==0 else 'Traffic landing circle',x,y,floor,3 if i==0 else 2.5,'armor'if station_id=='nacre'else'ochre',
            (32 if i==0 else 24)if station_id=='helix'else 64)
        floor_lights(x,y,floor,2.7 if i==0 else 2.2)
    occupants=[{'hull':h,'at':[x,y+3.8,floor],'size':[2,1.5,3]}for(x,y),h in zip(positions[1:],npcs)]
    ref,kind,description=REFERENCES[station_id]
    p=positions[0]
    point=[p[0],floor+2,-p[1]]
    # Camera coordinates below use the author's frame, before GLB normalization.
    camera={'position':VIEWS[station_id][0],'target':VIEWS[station_id][1]}
    return {'portalWidth':door_width,'portalHeight':door_height,'playerPads':[specs[0]],'lanes':specs[1:],'occupants':occupants,
     'cinematic':{'entrySide':.10,'exitSide':.08,'elevation':.10,'lift':.06},
     'views':{'terminal':{'point':point,'distance':37,'yaw':.35,'pitch':.22},'concourse':camera},
     'concourse':{'kind':kind,'reference':'art/locations/simplified/'+ref,'description':description,'touchdowns':[[x,y,floor]for x,y in positions],'roofOverPlayer':roof,'hall':hall}}

def hall(station_id,front,back,floor,width,height,opening,positions,npcs,carve_body=False,curved=False,factory=False):
    if carve_body:carve('Concourse interior excavation',(-width/2-.1,front-1,floor-.2),(width/2+.1,back+3,floor+height-.1))
    center=(front+back)/2;depth=back-front
    box('Concourse structural floor',(0,center,floor-.65),(width+1.8,depth+1,1.3),'hull',chamfer=.5)
    # Roof and walls enclose one connected floor, not three separate garages.
    box('Shared landing hall roof',(0,center,floor+height+.45),(width+2,depth+1,.9),'armor',chamfer=.6)
    for side in [-1,1]:
        x=side*(width/2+.35)
        box('Concourse side pressure wall',(x,center,floor+height/2),(.7,depth,height),'hull')
        for yy in range(math.ceil(front+2),math.floor(back),4):
            box('Hall structural pier',(side*(width/2-.15),yy,floor+height/2),(.8,.7,height),'metal')
            box('Pier inset light',(side*(width/2-.57),yy,floor+3),(.09,.35,2),'warm')
        for level in range(4,math.floor(height)-1,4):
            xx=side*(width/2-1)
            box('Inhabited concourse balcony',(xx,center,floor+level),(1.8,depth,.4),'metal')
            railing((side*(width/2-1.85),front+.6),(side*(width/2-1.85),back-.5),floor+level+.2)
    gate_h=height if station_id=='rook'else min(height-1,9 if not factory else 15)
    for side in [-1,1]:
        strip=(width-opening)/2
        box('Entrance shoulder',(side*(opening/2+strip/2),front,floor+height/2),(strip,1,height),'hull')
    if gate_h<height:box('Landing hall entrance lintel',(0,front,floor+(height+gate_h)/2),(opening,1,height-gate_h),'hull')
    portal('Main concourse portal',0,front-.25,floor,opening,gate_h,.6)
    for y in range(math.ceil(front+1),math.floor(back),5):
        beam('Hall roof load beam',(-width/2,y,floor+height-.25),(width/2,y,floor+height-.25),.65)
        box('Ceiling recessed work light',(0,y,floor+height-.59),(width*.45,.2,.08),'warm')
    # Factory ships and machinery share the wider assembly volume behind the
    # landing hall. Other ports continue through a human/service transfer route.
    tw,th=(18,15)if factory else(5,4)
    for side in [-1,1]:
        span=(width-tw)/2
        box('Rear service gallery wall',(side*(tw/2+span/2),back,floor+height/2),(span,1,height),'hull')
    box('Rear transfer lintel',(0,back,floor+(height+th)/2),(tw,1,height-th),'hull')
    box('Rear transfer floor',(0,back+2,floor-.25),(tw,4,.5),'metal')
    box('Rear transfer roof',(0,back+2,floor+th+.25),(tw,4,.5),'armor')
    for side in [-1,1]:box('Rear transfer tunnel wall',(side*(tw/2+.1),back+2,floor+th/2),(.3,4,th),'hull')
    if curved:
        # Helix's cylindrical elevator/operations core and curved upper galleries.
        cy=back-2.8
        lathe('Atrium central elevator',[(floor,2),(floor+height,2),(floor+height+.8,2.8)],'metal',32,(0,cy))
        for h in [4,8,12]:
            o=ring('Atrium lift balcony',3.1,.9,floor+h,.4,'armor',32);o.location.y=cy
            beam('Lift gallery connection',(-width/2,cy,floor+h),(width/2,cy,floor+h),.65)
            for x in [-1.4,-.7,0,.7,1.4]:box('Lift occupied glazing',(x,cy-math.sqrt(4-x*x)+.04,floor+h+1),(.32,.18,.45),'glass')
    if factory:
        for side in [-1,1]:
            for yy in [back-3,back-9]:
                xx=side*(width/2-3)
                box('Factory service cradle',(xx,yy,floor+.3),(3,5,.6),'metal')
                box('Factory machinery',(xx,yy,floor+1.5),(2,3,2.4),'hull',chamfer=.3)
            box('Factory gold wall banner',(side*(width/2-.6),center,floor+height*.65),(.08,1.6,6),'ochre')
    # Floor connects to the source body through rear roots, below the landing volume.
    if station_id=='helix':
        for x in [-9,9]:beam('Atrium lower load root',(x,back-3,floor-.7),(x,-20,-24),1.3)
    return metadata(station_id,positions,floor,npcs,opening,gate_h,{'width':width,'front':front,'back':back,'height':height},True)

def courtyard(station_id,floor,radius,industrial=False):
    lathe('Open court structural foundation',[(floor-4,radius-3),(floor-2,radius+1),(floor,radius+1)],'hull',64)
    start=math.pi*1.5+.40;end=math.pi*1.5+math.tau-.40
    height=22 if industrial else 25
    ring('Habitat courtyard pressure buildings',radius-3,6,floor+height/2,height,'hull',80,start,end)
    for h in [4,11,18]:
        ring('Continuous inhabited court gallery',radius-6.2,2,floor+h,.45,'armor',80,start,end)
        ring('Gallery outer structural band',radius-.1,.7,floor+h,.7,'metal',80,start,end)
    for i in range(24):
        a=start+(end-start)*i/23;x,y=(radius-6.6)*math.cos(a),(radius-6.6)*math.sin(a)
        beam('Court gallery pier',(x,y,floor),(x,y,floor+height),.7,'armor')
    # The entrance is part of the habitat ring and leads straight to the court.
    front=-radius+1
    box('Court entry bridge',(0,front,floor+height-.8),(radius*.64,3,1.6),'armor')
    for side in [-1,1]:
        x=side*(radius*.3)
        box('Court entry load tower',(x,front,floor+height/2),(1.2,3,height),'hull')
    # Banners, stalls and conveyors establish the different places in the paintings.
    for side in [-1,1]:
        for y in [-7,3,13]:
            x=side*(radius-10)
            if industrial:
                box('Industrial hopper trestle',(x,y,floor+2),(4,5,4),'copper',chamfer=.4)
                for z in [floor+1,floor+3]:box('Hopper protective band',(x,y,z),(4.3,5.3,.2),'metal')
            else:
                block('Trading court shop',(x,y,floor+1.7),(4.5,6,3.4),rows=2)
                box('Warm market awning',(x-side*2.3,y,floor+3.7),(3.4,6.6,.3),'ochre')
                for yy in [y-3,y+3]:beam('Awning supported post',(x-side*3.5,yy,floor),(x-side*3.5,yy,floor+3.7),.16)
    if not industrial:
        # A high inhabited bridge joins the surrounding buildings, above the ship route.
        block('Court skybridge',(0,8,floor+15),(radius*1.65,3.5,3),rows=2)
        for side in [-1,1]:beam('Skybridge foundation column',(side*(radius*.76),8,floor),(side*(radius*.76),8,floor+15),1)
    else:
        beam('Industrial overhead conveyor',(-radius+5,10,floor+9),(radius-5,18,floor+9),1.3,'copper')
        for x,y in [(-radius+5,10),(radius-5,18)]:beam('Conveyor seated tower',(x,y,floor),(x,y,floor+9),1)
    positions=[(0,-15),(-6,-21),(6,-21)]
    return metadata(station_id,positions,floor,('prospector','atlas')if industrial else('andromeda','speedster'),radius*.6,height,
        {'width':2*(radius-7),'front':-radius,'back':radius-7,'height':height},False)

def build(station_id,npcs=('atlas','wayfarer')):
    if station_id=='helix':return hall('helix',-43,-7,-13.5,24,15,14,[(0,-26),(-5,-32),(5,-32)],npcs,True,True)
    if station_id=='rook':
        m=hall('rook',-43,-16,-11,19,30,5.25,[(0,-27),(-2.8,-34),(2.8,-34)],npcs,True)
        # One small door, then a real manoeuvring area before the two berths.
        m['sharedEntry']={'x':0,'innerY':-38,'frontY':-43,'width':5.25}
        for occupant in m['occupants']:occupant['at'][1]+=6
        return m
    if station_id=='league-yard':return hall('league-yard',-84,-54,-14,34,22,23,[(0,-67),(-8,-75),(8,-75)],npcs,True,factory=True)
    if station_id=='cairn':
        # The actual yard floor is the landing space; its workshop roof shelters the centre.
        box('Workshop landing canopy',(-3,-12,5.4),(36,16,1.6),'armor',chamfer=1)
        for x in [-19,14]:
            for y in [-5]:beam('Workshop canopy support',(x,y,-11),(x,y,5.4),1.8)
        for y in [-18,-10]:beam('Canopy roof girder',(-18,y,4.8),(12,y,4.8),.55)
        return metadata('cairn',[(0,-17),(-9,-27),(9,-27)],-11,npcs,24,16,{'width':30,'front':-28,'back':-4,'height':16},True)
    if station_id=='argent':
        carve('Torus open landing terrace',(-9,-69,-.2),(9,-48,8.5))
        box('Torus landing terrace',(0,-59,-.65),(19,23,1.3),'hull',chamfer=.5)
        box('Torus terrace overhead',(0,-59,8.9),(19,23,.8),'armor',chamfer=.5)
        for x in [-9,9]:
            box('Torus terrace flank',(x,-59,4.2),(.8,23,8.4),'hull')
            for y in [-68,-60,-50]:beam('Torus terrace pier',(x,y,0),(x,y,8.9),.7)
        portal('Torus open terrace frame',0,-70,0,17,8,.6)
        for y in [-67,-60,-52]:box('Torus ceiling light',(0,y,8.49),(6,.2,.15),'warm')
        return metadata('argent',[(0,-57),(-5,-64),(5,-64)],0,npcs,17,8,{'width':18,'front':-70,'back':-48,'height':8.5},True)
    if station_id=='gatehouse-twelve':
        # An open side preserves the space view; the left tunnel joins the warehouse.
        box('Inspection hall floor extension',(0,-37.5,-13.15),(38,13,1.3),'hull')
        box('Inspection hall roof',(0,-24,-.8),(34,29,1),'armor',chamfer=.5)
        for x in [-16,16]:
            for y in [-37,-23,-11]:beam('Inspection hall pier',(x,y,-12.5),(x,y,-.8),.9)
        box('Inspection left pressure wall',(-16,-24,-6.5),(.7,29,12),'hull')
        portal('Inspection entry frame',0,-38,-12.5,30,11,.6)
        for y in [-34,-28,-21,-14]:
            beam('Inspection ceiling beam',(-16,y,-1.6),(16,y,-1.6),.6)
            box('Inspection ceiling illumination',(0,y,-1.96),(12,.15,.12),'cool')
        # The painting's left doorway continues into the bonded administration
        # block, with a genuine opening in its wall rather than a dark decal.
        carve('Inspection service tunnel opening',(-13.5,4.5,-12.7),(-4.5,9,-4))
        portal('Left inspection service portal',-9,-10,-12.5,9,8,.6)
        box('Inspection transfer floor',(-9,-2,-12.75),(10,16,.5),'metal')
        box('Inspection transfer roof',(-9,-2,-3.75),(10,16,.5),'armor')
        for x in [-13.8,-4.2]:box('Inspection tunnel pressure wall',(x,-2,-8.25),(.6,16,8.5),'hull')
        return metadata('gatehouse-twelve',[(0,-23),(-7,-31),(7,-31)],-12.5,npcs,30,11,{'width':32,'front':-38,'back':-10,'height':12},True)
    if station_id=='cinder':
        return metadata('cinder',[(0,-23),(-10,-28),(11,-28)],-21,npcs,19,10,None,False)
    if station_id=='nacre':
        lathe('Laboratory circular landing terrace',[(-14,13),(-12.8,15),(-12,15)],'armor',64,(0,-53))
        for side in [-1,1]:truss('Terrace laboratory attachment',(side*9,-53,-14),(side*5,-40,-11),1.4)
        o=ring('Science terrace outer band',14.6,.35,-12.2,.4,'metal',64);o.location.y=-53
        # Rear balustrade leaves the entire arrival side clear.
        o=ring('Terrace rear balustrade',14.4,.14,-11.65,.7,'metal',32,0,math.pi);o.location.y=-53
        return metadata('nacre',[(0,-57),(-6,-57),(6,-57)],-12,npcs,26,0,None,False)
    if station_id=='shepherd':return metadata('shepherd',[(0,-13),(-9,-18),(9,-18)],-14,npcs,30,0,None,False)
    if station_id=='torchwell':return metadata('torchwell',[(3,-12),(-10,-20),(18,-20)],-10,npcs,38,0,None,False)
    if station_id=='blackglass':return metadata('blackglass',[(0,-15),(-7,-23),(7,-23)],-12,npcs,30,0,None,False)
    if station_id=='haven':return courtyard('haven',-11,36)
    if station_id=='cinderfall':return courtyard('cinderfall',-19,30,True)
    raise ValueError(station_id)
