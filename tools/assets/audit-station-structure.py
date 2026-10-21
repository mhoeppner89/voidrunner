"""Check actual source-mesh contact, including enclosed parts and hollow rings.

Bounds only select candidates. Surface intersection or point-in-solid contact
must connect each structural group; broad ring bounds cannot hide an air gap.
Run in background Blender, optionally with -- station-id ... .
"""
import bpy,sys,json,re
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
direction=Vector((.912,.373,.169)).normalized()

def inside(point,tree,tolerance=.035):
    nearest=tree.find_nearest(point)
    if nearest[0]is not None and nearest[3]<=tolerance:return True
    origin=point.copy();count=0
    for _ in range(80):
        hit,normal,index,distance=tree.ray_cast(origin,direction,10000)
        if hit is None:return count%2==1
        count+=1;origin=hit+direction*.002
    return False

def audit():
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH'and 'windows'not in o.name.lower()]
    trees=[];vertices=[];lo=[];hi=[]
    for o in objects:
        vs=[o.matrix_world@v.co for v in o.data.vertices];vertices.append(vs)
        # Expanded BVH triangles can report repeated zero-distance ray hits,
        # corrupting parity. Use exact surfaces; nearest-point tests supply the
        # stated contact tolerance without inventing enclosed space.
        trees.append(BVHTree.FromPolygons(vs,[tuple(f.vertices)for f in o.data.polygons]))
        lo.append([min(v[k]for v in vs)for k in range(3)]);hi.append([max(v[k]for v in vs)for k in range(3)])
    lo=np.array(lo);hi=np.array(hi);parents=list(range(len(objects)))
    def find(i):
        while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
        return i
    for i in range(len(objects)):
        candidates=np.where(np.all(hi>=lo[i]-.05,axis=1)&np.all(lo<=hi[i]+.05,axis=1))[0]
        for j in candidates:
            j=int(j)
            if j<=i or find(i)==find(j):continue
            if trees[i].overlap(trees[j])or inside(vertices[i][0],trees[j])or inside(vertices[j][0],trees[i]):parents[find(j)]=find(i)
    groups={}
    for i,o in enumerate(objects):groups.setdefault(find(i),[]).append(o.name)
    main=max(groups,key=lambda k:len(groups[k]))
    return [g for k,g in groups.items()if k!=main]

def practical_clearance(station_id,armament=None):
    """Check known crossing risks against the actual editable meshes.

    Connected-component checks alone accept a radiator through a building.
    These pairs must remain separate; their explicit brackets must make contact.
    Coordinates remain in the original author's frame, before normalization.
    """
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];cache={};checks=[]
    def select(prefix):
        matches=[o for o in objects if (o.name==prefix[:-1] if prefix.endswith('$') else o.name.startswith(prefix))]
        assert matches,(station_id,'missing clearance component',prefix)
        return matches
    def geometry(o):
        if o.name not in cache:
            vs=[o.matrix_world@v.co for v in o.data.vertices]
            cache[o.name]=(vs,BVHTree.FromPolygons(vs,[tuple(f.vertices)for f in o.data.polygons]))
        return cache[o.name]
    def touches(a,b):
        av,at=geometry(a);bv,bt=geometry(b)
        if any(max(v[k]for v in av)<min(v[k]for v in bv)-.01 or max(v[k]for v in bv)<min(v[k]for v in av)-.01 for k in range(3)):return False
        return bool(at.overlap(bt)or inside(av[0],bt,.005)or inside(bv[0],at,.005))
    def separate(label,a,b):
        crossings=[(x.name,y.name)for x in select(a)for y in select(b)if touches(x,y)]
        assert not crossings,(station_id,label,crossings)
        checks.append(label)
    def mounted(label,a,b):
        assert any(touches(x,y)for x in select(a)for y in select(b)),(station_id,label,'mount has an air gap')
        checks.append(label)
    pairs={
      'helix':[
        ('Circular pressure decks meet the original spindle','Pressure deck shell','Central refinery spindle'),
        ('Interdeck elevators join occupied decks','Interdeck elevator trunk','Pressure deck shell'),
        ('Port freight hold joins the pressure decks','Helix port sealed freight hold$','Pressure deck shell'),
        ('Starboard freight hold joins the pressure decks','Helix starboard sealed freight hold$','Pressure deck shell'),
        ('Command cylinder seats in the service cone','Command pressure cylinder','Upper services cone'),
        ('Radiator manifolds meet thick plates','Radiator manifold','Thick radiator plate')],
      'rook':[
        ('Command bridge meets armored wings','Rook overhead command bridge','Rook tall armored arrival wing'),
        ('Central roof joins the forward pressure gable','Rook central armored roof','Rook forward roof pressure gable'),
        ('Central roof joins the aft pressure gable','Rook central armored roof','Rook aft roof pressure gable'),
        ('Forward roof gable seats in the command bridge','Rook forward roof pressure gable','Rook overhead command bridge'),
        ('Aft roof gable seats in the stern command hull','Rook aft roof pressure gable','Rook inhabited stern command body'),
        ('Closed lower keel meets the arrival floor','Rook continuous armored lower keel','Concourse structural floor'),
        ('Closed lower keel meets the reactor casemate','Rook continuous armored lower keel','Bastion deep armored reactor casemate'),
        ('Closed lower keel joins both armored wings','Rook continuous armored lower keel','Rook tall armored arrival wing'),
        ('Casemate transfer seats in defense hull','Casemate occupied transfer','Rook integrated defense casemate'),
        ('Command service trunk meets stern body','Rook command gallery protected service trunk','Rook inhabited stern command body')],
      'cairn':[
        ('Upper gallery sits on workshop','Cairn upper workshop gallery','Side machine workshop'),
        ('Rear roof gallery seats on canopy','Workshop roof occupied gallery','Workshop landing canopy'),
        ('Crane rails meet gantry uprights','Salvage crane running rail','Overhead salvage crane upright')],
      'argent':[
        ('Assembly control meets supporting leg','Argent transverse assembly control','Assembly gantry torus load leg'),
        ('Gantry leg seats in inhabited torus','Assembly gantry torus load leg','Main assembly torus'),
        ('Arrival lounge seats on terrace roof','Argent arrival observation lounge','Torus terrace overhead')],
      'gatehouse-twelve':[
        ('Inspection control seats on hall','Gatehouse inspection control floor','Inspection hall roof'),
        ('Administration passage meets control floor','Control floor administration passage','Gatehouse inspection control floor'),
        ('Staffed rear checkpoint joins occupied upper floor','Gatehouse rear staffed inspection office','Control floor administration passage'),
        ('Rear checkpoint picture window seats in wall','Staffed checkpoint panoramic glazing','Gatehouse rear staffed inspection office'),
        ('Interior scanner heads meet structural beam','Supported scanner head','Inspection scanner overhead'),
        ('Dish column reaches reflector','Antenna mounting column','Traffic control antenna')],
      'blackglass':[
        ('Service lock embedded in real rock','Blackglass rock-seated service lock','Moon rock cliff with excavated galleries'),
        ('Platform braces meet rock','Cliff freight platform rock anchor','Moon rock cliff with excavated galleries')],
      'cinder':[
        ('Operations street meets refinery rooms','Cinder operations service street','Refinery operations'),
        ('Recovery drum rests on foundation','Cinder horizontal heat recovery drum','Heat recovery drum foundation')],
      'torchwell':[
        ('Access module connects through vestibule','Service-house pressurized vestibule','Torchwell services access module'),
        ('Vestibule seats in service house','Service-house pressurized vestibule','Low frontier service house'),
        ('Roof control cabin seats on service house','Torchwell roof control cabin','Low frontier service house roof')],
      'nacre':[
        ('Observation dome joins central habitat','Nacre central observation dome','Central science pressure hull'),
        ('Panoramic laboratory rooms seat in pressure hulls','Nacre panoramic laboratory rooms','Round pressure laboratory'),
        ('Terrace vestibule joins pressure laboratory','Science terrace entrance vestibule','Round pressure laboratory')],
      'shepherd':[
        ('Service gallery meets pressure neck','Shepherd relay service gallery','Tower service gallery pressure neck'),
        ('Gallery neck seats in tower','Tower service gallery pressure neck','Relay tower base'),
        ('Antenna mount seats in panel','Relay antenna wall mount','Relay rectangular antenna panel')],
      'haven':[
        ('Port civic district seats on conservatory','Haven port upper civic district','Habitat roof conservatory'),
        ('Rear district joins inhabited ring','Haven rear commercial district','Habitat courtyard pressure buildings')],
      'league-yard':[
        ('Factory arrival gallery seats on hall','League factory arrival upper gallery','Shared landing hall roof'),
        ('Bridge crane seats in original upright','League transverse traveling crane','Drydock upright'),
        ('Fabrication district joins service spine','League longitudinal fabrication district','Longitudinal drydock service spine')],
      'cinderfall':[
        ('Furnaces grounded in court','Cinderfall grounded process furnace','Open court structural foundation'),
        ('Process bridge meets grounded furnace','Cinderfall enclosed process bridge','Cinderfall grounded process furnace')]
    }
    for label,a,b in pairs[station_id]:mounted(label,a,b)
    if station_id=='helix':
        for feed in select('Reflector feed supports'):
            assert any(touches(feed,dish)for dish in select('Communications reflector with thickness')),'Reflector feed has an air gap'
        checks.append('Every original reflector feed seats in the dish skin')
        for prefix in ['Upper services cone','Command pressure cylinder','Command deck band','Command crown','Tower seated service spine']:
            separate('Reflector bowls clear '+prefix,'Communications reflector with thickness',prefix)
        mounted('Reflector outriggers seat in the service cone','Reflector seated outrigger','Upper services cone')
        for pedestal in select('Reflector pedestal'):
            assert any(touches(pedestal,root)for root in select('Reflector seated outrigger')),'Dish pedestal floats above its outrigger'
        checks.append('Both dish pedestals seat on structural outriggers')
        city=[o for o in objects if re.fullmatch(r'Helix city (middle|upper) district \d+ block \d+',o.name)]
        parks=[o for o in select('Helix enclosed park ')if o.name.endswith('glass dome')]
        assert len(city)+len(parks)>=83,'Housing and conservatories retain the full dense district layout'
        assert len(parks)==6,'Six glazed park courtyards occupy the urban ring'
        for building in city:
            for prefix in ['Interdeck elevator trunk','Elevator machinery','Upper services cone','Radiator wing root','Radiator wing brace','Coolant riser']:
                crossings=[other.name for other in select(prefix)if touches(building,other)]
                assert not crossings,(station_id,building.name,'crosses existing structure',crossings)
        for i,building in enumerate(city):
            assert not any(touches(building,other)for other in city[i+1:]),(station_id,building.name,'overlapping city buildings')
        checks.extend(['City pressure buildings clear elevator and engineering structures','City pressure buildings have separated occupied footprints'])
        # A connected building can still overhang a missing podium. Check its
        # entire base on the real pressure deck, not one contact or its bounds.
        decks=select('Pressure deck shell')
        for building in city:
            vs=geometry(building)[0];bottom=min(v.z for v in vs)
            for point in [v for v in vs if abs(v.z-bottom)<.001]:
                assert any(inside(point,geometry(deck)[1],.005)for deck in decks),(building.name,'unsupported foundation corner',list(point))
        checks.append('Every housing foundation corner embeds in a real pressure deck')
        for dome in select('Helix enclosed park '):
            if not dome.name.endswith('glass dome'):continue
            foundation=select(dome.name.replace('glass dome','full footprint foundation'))[0]
            assert touches(dome,foundation),(dome.name,'dome is not sealed to its foundation')
            assert not any(touches(dome,building)for building in city),(dome.name,'park glass crosses an occupied building')
            for point in geometry(foundation)[0]:
                if point.z>22:continue
                assert any(inside(point,geometry(deck)[1],.005)for deck in decks),(dome.name,'unsupported park foundation')
        checks.append('All six glazed conservatories seal against their deck foundations')
        facade_faces=0
        for o in objects:
            uv=o.data.uv_layers.active
            if not uv:continue
            district=json.loads(o['station_city_facade'])if o.get('station_city_facade')else None
            for p in o.data.polygons:
                facade=bool(district and abs(p.normal.z)<.01 and max(abs(p.normal.x),abs(p.normal.y))>.99)
                us=[uv.data[li].uv.x for li in p.loop_indices]
                assert all(-1e-6<=u<=.5+1e-6 for u in us)if facade else all(.5-1e-6<=u<=1+1e-6 for u in us),(o.name,'city atlas leaks onto a non-city surface')
                if facade:facade_faces+=1
        assert facade_faces>=len(city)*4,'Every dense housing block needs four mapped facades'
        checks.append('City window atlas stays isolated from structural and roof panels')
        for wing in select('Helix connected '):
            if 'common rooms'in wing.name:continue
            assert sum(touches(wing,building)for building in city)==2,(wing.name,'must connect two housing blocks')
            for prefix in ['Interdeck elevator trunk','Elevator machinery','Upper services cone','Radiator wing root','Radiator wing brace','Coolant riser']:
                assert not any(touches(wing,other)for other in select(prefix)),(wing.name,'crosses existing structure',prefix)
        checks.append('Enclosed housing wings join two blocks and clear engineering corridors')
        for brace in select('Radiator wing brace'):
            assert any(touches(brace,o)for o in select('Pressure deck shell')),'Radiator brace has no inner structural attachment'
        checks.append('Both original radiator braces seat in occupied decks')
    if station_id=='rook':
        roof=select('Rook central armored roof')[0]
        assert all(touches(roof,wing)for wing in select('Rook tall armored arrival wing')),'Central roof must seat in both bastions'
        checks.append('Central armored roof seats in both bastions')
        keel=select('Rook continuous armored lower keel')[0]
        assert all(inside(Vector(p),geometry(keel)[1],.005)for p in [(0,-26,-19),(0,-17,-24),(0,-36,-14)]),'Central underside gap remains open'
        checks.append('Marked central underside gap is filled by a closed pressure hull')
        for side in ['port','starboard']:
            mounted(side+' capital berth joins its lower pressure pod','Rook '+side+' capital pressure gangway','Bastion damage-control capsule')
            vs=geometry(select('Rook '+side+' capital pressure gangway')[0])[0]
            assert max(v.z for v in vs)-min(v.z for v in vs)<=1.51,'Side docking collar is too long'
        mounted('Heavy ventral port joins the reactor keel','Rook ventral heavy docking pressure trunk','Bastion deep armored reactor casemate')
        vs=geometry(select('Rook ventral heavy docking pressure trunk')[0])[0]
        assert max(v.z for v in vs)-min(v.z for v in vs)<=1.81,'Heavy docking collar is too long'
        checks.append('All capital collars are short and seated directly in their pressure hulls')
    if station_id=='argent':
        for light in select('Torus ceiling light'):
            assert any(touches(light,o)for o in select('Torus terrace overhead')),'Terrace lamp floats below ceiling'
        checks.append('All terrace lamps seat in ceiling')
    if station_id=='gatehouse-twelve':
        roof_bottom=min(v.z for o in select('Inspection hall roof')for v in geometry(o)[0])
        scanner_top=max(v.z for o in select('Inspection scanner overhead')+select('Supported scanner head')for v in geometry(o)[0])
        assert scanner_top<roof_bottom,(station_id,'Scanner must sit inside the inspection hall')
        checks.append('Scanner operates beneath the occupied hall roof')
    if armament:
        mounts=armament['mounts'];names=[m['name']for m in mounts]
        hull=[o for o in objects if not any(o.name.startswith(name)for name in names)]
        def combined(group):
            vs=[];faces=[]
            for o in group:
                offset=len(vs);vs.extend(geometry(o)[0]);faces.extend(tuple(offset+i for i in p.vertices)for p in o.data.polygons)
            return BVHTree.FromPolygons(vs,faces)
        tree=combined(hull)
        for m in mounts:
            p,n=Vector(m['position']),Vector(m['normal'])
            # Approach the outer skin from outside: editable assemblies retain
            # enclosed internal floor caps below the final roof surface.
            hit=tree.ray_cast(p+n*.25,-n,1.2)[0]
            assert hit is not None and(hit-p).length<.1,(station_id,m['name'],'bearing is not seated on the station hull')
            others=combined([o for o in objects if not o.name.startswith(m['name'])]);d=Vector(m['direction'])
            for muzzle in m['muzzles']:
                obstruction=others.ray_cast(Vector(muzzle)+d*.04,d,200)[0]
                assert obstruction is None,(station_id,m['name'],'barrel points through station geometry',list(obstruction))
        checks.extend(['All capital weapon bearings sit on real hull surfaces','Every barrel has an unobstructed outward firing line'])
    return {'checks':checks,'intersectionTolerance':.005,'frame':'source Z-up'}

# Guard the containment test itself: neither a contained solid nor an exterior
# point along a ray through the box may be classified by repeated surface hits.
cube=BVHTree.FromPolygons([Vector((x,y,z))for z in [-1,1]for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]],[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
assert inside(Vector((0,0,0)),cube)and not inside(Vector((-2,0,0)),cube),'Invalid point-in-solid audit'

ids=sys.argv[sys.argv.index('--')+1:]if '--'in sys.argv else [p.name for p in (ROOT/'authoring/models/stations').iterdir()if(p/(p.name+'.blend')).exists()]
reports={}
for station_id in ids:
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'authoring/models/stations'/station_id/(station_id+'.blend')))
    bpy.context.view_layer.update();groups=audit();reports[station_id]=groups
    path=ROOT/'authoring/models/stations'/station_id/'model-report.json'
    report=json.loads(path.read_text());report['physicalDetachedGroups']=groups;report['physicalContactTolerance']=.05
    # Measure actual native pane edges, after every placement/rotation. Report
    # metadata alone cannot catch an oversized window left in a helper.
    scale=report['detailScale']['sourceToWorld'];sizes=[]
    for o in bpy.context.scene.objects:
        if o.type!='MESH' or ' windows · ' not in o.name:continue
        for f in o.data.polygons:
            vs=[o.matrix_world@o.data.vertices[i].co for i in f.vertices]
            sizes.append(min((vs[(i+1)%len(vs)]-v).length for i,v in enumerate(vs))*scale)
    assert sizes and max(sizes)<1.401,(station_id,'ordinary windows exceed capital-reference scale',max(sizes,default=0))
    report['windowSizeAudit']={'panes':len(sizes),'maximumShortEdgeWorld':max(sizes),'capitalReferenceHeight':2.486}
    clearance=practical_clearance(station_id,report.get('armament'))
    if clearance['checks']:report['practicalClearance']=clearance
    path.write_text(json.dumps(report,indent=2)+'\n')
    print('STRUCTURE',station_id,[(g[:3],len(g))for g in groups],flush=True)
    print('CLEARANCE',station_id,len(clearance['checks']),'checks passed',flush=True)
out=ROOT/'output/station-review/physical-structure.json'
previous=json.loads(out.read_text())if out.exists()else{}
out.write_text(json.dumps({**previous,**reports},indent=2)+'\n')
assert not any(reports.values()),'Detached structural groups remain; inspect physical-structure.json.'
