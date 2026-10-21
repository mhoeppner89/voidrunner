"""Bake hull-specific pattern atlases and explicit UV coating/reference masks.

Original GLBs and their PBR maps remain untouched. Atlas paint cells are named
here per source family; glass/emissive materials and exposed metal are omitted.
The tiny reference channel removes the old pigment, retaining source panel wear.
Run python3 tools/assets/build-paint-masks.py [hull ...].
"""
import sys,json,struct,io,subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/paint';OUT.mkdir(exist_ok=True)
catalog=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {PAINT_LAYOUTS} from './src/game/paintDesign.js';import {FLEET_EQUIPMENT} from './src/game/fleetEquipmentData.js';console.log(JSON.stringify(Object.fromEntries(Object.entries(PAINT_LAYOUTS).map(([h,l])=>[h,{...l,aspect:FLEET_EQUIPMENT[h].extents[0]/FLEET_EQUIPMENT[h].extents[2]}]))))"],cwd=ROOT))
chosen=sys.argv[1:]or list(catalog)
manifest_path=ROOT/'src/game/shipPaintMaskCatalog.js'
reports={}
if manifest_path.exists():reports=json.loads(manifest_path.read_text().split(' = ',1)[1].strip().removesuffix(';'))
def linear(a):return np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4)
for hull in chosen:
 b=(ROOT/'assets/models/ships'/(hull+'.glb')).read_bytes();length=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+length]);binary=28+length
 surfaces={}
 for material in g['materials']:
  name=material.get('name','');pbr=material.get('pbrMetallicRoughness',{});slot=pbr.get('baseColorTexture')
  if not slot or any(s in name.lower()for s in ['canopy','glass','glazing','pdc','turret','emissive','drive face']):continue
  image=g['images'][g['textures'][slot['index']]['source']];view=g['bufferViews'][image['bufferView']];start=binary+view.get('byteOffset',0)
  source=Image.open(io.BytesIO(b[start:start+view['byteLength']])).convert('RGB')
  # Coverage is edited in the source atlas's UV frame, not inferred per frame.
  rgb=np.asarray(source.resize((512,512),Image.Resampling.BOX),dtype=float)/255
  h,w=rgb.shape[:2];yy,xx=np.mgrid[:h,:w];row=yy//64;col=xx//64
  covered=np.ones((h,w),dtype=bool)
  tiled=hull in ['wayfarer','talon','demon','mule','blade','speedster','legionary','prospector']and not 'detailed'in name
  if hull=='wayfarer':covered=row<4
  elif hull=='talon':covered=(row<4)|(row==6)
  elif hull=='demon':covered=(row==0)|(row==3)|((row==1)&np.isin(col,[0,1,2,5,7]))
  elif hull=='mule'and 'PDC'not in name:covered=row!=2
  elif hull in ['speedster','legionary']:covered=(row==0)|(row==3)|((row==1)&np.isin(col,[0,1,2,5,7]))
  elif hull=='blade':covered=np.isin(row,[0,1,6,7])|((row==3)&np.isin(col,[0,2,4,6]))|((row==4)&np.isin(col,[1,4]))
  elif hull=='prospector'and tiled:covered=row!=2
  elif hull=='scrapper':
   sr=yy//128;sc=xx//128
   # Coated red/grey armor and wing markings; protect canopy, grille,
   # dark spaceframe and machinery cells from the authored 4x4 atlas.
   covered=((sr==0)&np.isin(sc,[1,2]))|((sr==1)&np.isin(sc,[1,2,3]))|(sr==2)|((sr==3)&np.isin(sc,[0,2]))
  # In unwrapped color atlases, paint is ivory, navy, ochre or red. Exposed
  # charcoal/steel and black vents stay outside the coating. Emissive pixels
  # are explicitly protected using the authored emission atlas as well.
  mx=rgb.max(2);mn=rgb.min(2);chroma=mx-mn
  if not tiled and hull in ['lancer','vanguard']:
   covered=(mx>.55)|((rgb[:,:,2]>rgb[:,:,0]*1.25)&(rgb[:,:,2]>.10))|((rgb[:,:,0]>rgb[:,:,2]*1.4)&(chroma>.13))
  elif not tiled and hull in ['torsas','astra','atlas','andromeda']:
   covered=mx>.16
  e=material.get('emissiveTexture')
  if e:
   im=g['images'][g['textures'][e['index']]['source']];v=g['bufferViews'][im['bufferView']];s=binary+v.get('byteOffset',0)
   glow=np.asarray(Image.open(io.BytesIO(b[s:s+v['byteLength']])).convert('RGB').resize((512,512),Image.Resampling.NEAREST),dtype=float)/255
   covered &= glow.max(2)<.2
  lum=(linear(rgb)*[.2126,.7152,.0722]).sum(2)
  if tiled:
   ref=np.ones((h,w))
   for r in range(8):
    for c in range(8):
     cell=(row==r)&(col==c);ref[cell]=max(.001,float(np.percentile(lum[cell],65)))
  else:
   # Separate broad old pigments, retaining fine texture contrast within them.
   labels=np.where(mx<.16,0,np.where(mx>.55,1,np.where(rgb[:,:,2]>rgb[:,:,0]*1.18,2,np.where(rgb[:,:,0]>rgb[:,:,2]*1.3,3,4))))
   ref=np.ones((h,w))
   for label in range(5):
    cell=labels==label
    if cell.any():ref[cell]=max(.001,float(np.percentile(lum[cell],65)))
  mask=np.zeros((h,w,4),dtype=np.uint8);mask[:,:,0]=(np.sqrt(ref).clip(0,1)*255).round();mask[:,:,1]=covered*255;mask[:,:,3]=255
  filename=f'{hull}-surface-{len(surfaces)}.png';Image.fromarray(mask).save(OUT/filename,optimize=True);surfaces[name]=filename
 # Each pattern has a dorsal/ventral plan and two explicitly authored side
 # profiles. Rasterize the shared vector artwork with antialiasing; thumbnails
 # and the runtime atlas therefore show the same hull-specific design.
 n=192;scale=4;tiles=[];layout=catalog[hull]
 def paint(shapes):
  im=Image.new('RGB',(n*scale,n*scale),(255,0,0));draw=ImageDraw.Draw(im)
  for shape in shapes:
   points=[((x+1)*.5*n*scale,(1-z)*.5*n*scale)for x,z in shape['points']]
   color=[(255,0,0),(0,255,0),(0,0,255)][shape['color']]
   if 'width'in shape:draw.line(points,fill=color,width=max(1,round(shape['width']*.5*n*scale)),joint='curve')
   else:draw.polygon(points,fill=color)
  return np.asarray(im.resize((n,n),Image.Resampling.LANCZOS))
 by_id={p['id']:p for p in layout['patterns']}
 assert set(by_id)=={'panels','stripes','blocks','asymmetric'},f'{hull}: four explicit designs required'
 for pattern in ['panels','stripes','blocks','asymmetric']:
  design=by_id[pattern]
  # Profile x is z noseward, and profile y is actual hull height.
  tiles.append(np.concatenate([paint(design[view])for view in ['top','port','starboard']],axis=0))
 filename=f'{hull}-patterns-v3.png'
 (OUT/f'{hull}-patterns-v2.png').unlink(missing_ok=True)
 Image.fromarray(np.concatenate(tiles,axis=1)).save(OUT/filename,optimize=True)
 (OUT/f'{hull}-patterns.png').unlink(missing_ok=True)
 reports[hull]={'patterns':filename,'tileSize':n,'aspect':layout['aspect'],'surfaces':surfaces}
manifest_path.write_text('// Generated by tools/assets/build-paint-masks.py; original GLBs remain unchanged.\nexport const SHIP_PAINT_MASKS = '+json.dumps(reports,indent=2)+';\n')
print('Paint masks:',', '.join(chosen))
