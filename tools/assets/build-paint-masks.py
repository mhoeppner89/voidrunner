"""Bake hull-specific pattern atlases and explicit UV coating/reference masks.

Original GLBs and their PBR maps remain untouched. Atlas paint cells are named
here per source family; glass/emissive materials and exposed metal are omitted.
The tiny reference channel removes the old pigment, retaining source panel wear.
Run python3 tools/assets/build-paint-masks.py [hull ...].
"""
import sys,json,struct,io,subprocess
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/paint';OUT.mkdir(exist_ok=True)
catalog=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {PAINT_LAYOUTS} from './src/game/paintDesign.js';console.log(JSON.stringify(PAINT_LAYOUTS))"],cwd=ROOT))
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
  elif hull=='scrapper':covered=~(((yy//128==1)&(xx//128<2))|((yy//128==2)&(xx//128==2))|((yy//128==0)&(xx//128==3)))
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
 # Four pattern tiles, with exact RGB weights for main / secondary / accent.
 n=128;y,x=np.mgrid[:n,:n];x=(x+.5)/n*2-1;z=1-(y+.5)/n*2
 spread,width,nose,engine,trim=catalog[hull];panels=[]
 for pattern in range(4):
  if pattern==0:secondary=(np.abs(x)>spread)&(z>engine);accent=(np.abs(z-engine)<.065)|(np.abs(z-nose)<.035)
  elif pattern==1:secondary=(np.abs(np.abs(x)-spread)<width)&(z>-.86);accent=(np.abs(np.abs(x)-(spread+width+.045))<.025)&(z>engine)
  elif pattern==2:secondary=((z+np.abs(x)*.65)>nose)|((z<engine)&(np.abs(x)>trim));accent=np.abs(z+np.abs(x)*.65-nose+.10)<.05
  else:secondary=(x>-.04)&(z+x*.38>engine);accent=(np.abs(x+trim)<.06)&(z>-.75)|(np.abs(z+x*.38-nose)<.045)
  secondary &=~accent;a=np.zeros((n,n,4),dtype=np.uint8);a[:,:,0]=(~(secondary|accent))*255;a[:,:,1]=secondary*255;a[:,:,2]=accent*255;a[:,:,3]=255;panels.append(a)
 Image.fromarray(np.concatenate(panels,axis=1)).save(OUT/f'{hull}-patterns.png',optimize=True)
 reports[hull]={'patterns':f'{hull}-patterns.png','surfaces':surfaces}
manifest_path.write_text('// Generated by tools/assets/build-paint-masks.py; original GLBs remain unchanged.\nexport const SHIP_PAINT_MASKS = '+json.dumps(reports,indent=2)+';\n')
print('Paint masks:',', '.join(chosen))
