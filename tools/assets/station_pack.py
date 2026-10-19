"""Weld identical exported vertices without changing topology or UV seams.

No geometry decoder or compressed-texture extension is needed at runtime.
"""
import numpy as np

def pack(doc,binary):
    out=bytearray();views=[];accessors=[];before=after=0
    types={5121:np.uint8,5123:np.uint16,5125:np.uint32,5126:np.float32};sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
    def read(index):
        a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];dtype=types[a['componentType']];size=sizes[a['type']];step=np.dtype(dtype).itemsize
        return np.ndarray((a['count'],size),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',size*step),step)).copy()
    def blob(raw,target=None):
        while len(out)%4:out.append(0)
        v={'buffer':0,'byteOffset':len(out),'byteLength':len(raw)}
        if target:v['target']=target
        views.append(v);out.extend(raw);return len(views)-1
    def attr(values,template,target):
        a={k:v for k,v in template.items()if k not in ['bufferView','byteOffset','count','min','max']};a['bufferView']=blob(values.tobytes(),target);a['count']=len(values)
        if 'min'in template:a['min']=values.min(axis=0).tolist();a['max']=values.max(axis=0).tolist()
        accessors.append(a);return len(accessors)-1
    for mesh in doc['meshes']:
        for p in mesh['primitives']:
            names=list(p['attributes']);arrays=[];templates=[]
            for name in names:
                i=p['attributes'][name];a=read(i)
                if a.dtype==np.float32:a=np.round(a,4 if name=='NORMAL'else 5)
                arrays.append(a);templates.append(doc['accessors'][i])
            key=np.ascontiguousarray(np.concatenate([a.view(np.uint8).reshape(len(a),-1)for a in arrays],axis=1));key=key.view('V'+str(key.shape[1])).ravel()
            _,first,inverse=np.unique(key,return_index=True,return_inverse=True);before+=len(key);after+=len(first)
            for name,a,t in zip(names,arrays,templates):p['attributes'][name]=attr(a[first],t,34962)
            indices=inverse[read(p['indices']).ravel()].astype(np.uint16 if len(first)<65536 else np.uint32).reshape(-1,1)
            p['indices']=attr(indices,{'componentType':5123 if indices.dtype==np.uint16 else 5125,'type':'SCALAR'},34963)
    for image in doc.get('images',[]):
        v=doc['bufferViews'][image['bufferView']];start=v.get('byteOffset',0);image['bufferView']=blob(binary[start:start+v['byteLength']])
    while len(out)%4:out.append(0)
    doc['bufferViews']=views;doc['accessors']=accessors;doc['buffers'][0]['byteLength']=len(out)
    return bytes(out),{'verticesBefore':before,'verticesAfter':after,'positionPrecision':.00001}
