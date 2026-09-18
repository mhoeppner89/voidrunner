import{createRequire}from'node:module';import fs from'node:fs/promises';
const require=createRequire('/tmp/voidrunner-gltf-tools/package.json');
const{NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),{dedup,prune,weld}=require('@gltf-transform/functions'),validator=require('gltf-validator');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);const report=[];
const tint={'Warm ceramic armor':[.66,.61,.48,1],'Blue grey structural steel':[.27,.34,.39,1],'Oxide red refinery cladding':[.42,.15,.075,1],'Ochre docking identification':[.8,.48,.08,1]};
for(const id of ['haven','league-yard','cinderfall']){
 const path=`assets/models/stations/${id}.glb`,d=await io.read(path);
 for(const m of d.getRoot().listMaterials())for(const[key,value]of Object.entries(tint))if(m.getName().startsWith(key))m.setBaseColorFactor(value);
 await d.transform(weld(),dedup(),prune());await io.write(path,d);
 const bytes=await fs.readFile(path),v=await validator.validateBytes(bytes);if(v.issues.numErrors)throw Error(JSON.stringify(v.issues));
 const tris=d.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((s,p)=>s+p.getIndices().getCount()/3,0);
 if(tris>10000)throw Error(id+' exceeds budget');
 let radius=0;
 for(const n of d.getRoot().listNodes()){const m=n.getWorldMatrix();for(const p of n.getMesh()?.listPrimitives()??[]){const a=p.getAttribute('POSITION');for(let i=0;i<a.getCount();i++){const [x,y,z]=a.getElement(i,[]);radius=Math.max(radius,Math.hypot(m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]));}}}
 if(radius>100.01)throw Error(id+' exceeds collision envelope: '+radius);
 for(const t of d.getRoot().listTextures()){const size=t.getSize();if(size[0]!==512||size[1]!==512)throw Error('Texture budget '+size);}

 report.push({id,triangles:tris,radius,bytes:bytes.length,materials:d.getRoot().listMaterials().length,errors:v.issues.numErrors});
}await fs.writeFile('.freebuff/acheron-stations/asset-report.json',JSON.stringify(report,null,2));console.log(report);
