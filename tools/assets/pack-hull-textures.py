"""Build full-resolution shipping GLBs from the approved ship assets (Pillow)."""
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import struct
import sys
import shutil
from tempfile import NamedTemporaryFile

from PIL import Image, features

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.workbench' / 'hull-delivery'


def pack(name, source, output):
    json_length, = struct.unpack_from('<I', source, 12)
    scene = json.loads(source[20:20 + json_length])
    binary = memoryview(source)[28 + json_length:]
    images = {image['bufferView']: image for image in scene['images']}
    packed = bytearray()
    for index, view in enumerate(scene['bufferViews']):
        start = view.get('byteOffset', 0)
        data = binary[start:start + view['byteLength']]
        if index in images:
            with Image.open(BytesIO(data)) as original:
                if original.info.keys() & {'icc_profile', 'gamma', 'srgb'}:
                    raise ValueError(f'{name}: review embedded colour metadata before transcoding')
                rgba = original.convert('RGBA')
                encoded = BytesIO()
                rgba.save(encoded, 'WEBP', lossless=True, method=5, exact=True)
                candidate = encoded.getvalue()
                if len(candidate) < len(data):
                    with Image.open(BytesIO(candidate)) as decoded:
                        if decoded.convert('RGBA').tobytes() != rgba.tobytes():
                            raise ValueError(f'{name}: lossless pixel round trip failed')
                    images[index]['mimeType'] = 'image/webp'
                    data = candidate
        view['byteOffset'] = len(packed)
        view['byteLength'] = len(data)
        packed.extend(data)
        packed.extend(bytes(-len(packed) % 4))

    for texture in scene['textures']:
        index = texture['source']
        if scene['images'][index]['mimeType'] == 'image/webp':
            texture.setdefault('extensions', {})['EXT_texture_webp'] = {'source': texture.pop('source')}
    for field in ('extensionsUsed', 'extensionsRequired'):
        scene.setdefault(field, []).append('EXT_texture_webp')
    scene['asset'].setdefault('extras', {})['sourceSha256'] = sha256(source).hexdigest()
    scene['buffers'][0]['byteLength'] = len(packed)
    metadata = json.dumps(scene, separators=(',', ':'), ensure_ascii=False).encode()
    metadata += b' ' * (-len(metadata) % 4)
    size = 28 + len(metadata) + len(packed)
    output.write(struct.pack('<4sIIII', b'glTF', 2, size, len(metadata), 0x4e4f534a)
                             + metadata + struct.pack('<I4s', len(packed), b'BIN\0') + packed)
    print(f'{name}: {len(source)} -> {size}')


def unpack(data):
    length, = struct.unpack_from('<I', data, 12)
    if struct.unpack_from('<4sII', data) != (b'glTF', 2, len(data)):
        raise ValueError('Invalid GLB header')
    if data[16:20] != b'JSON' or struct.unpack_from('<I4s', data, 20+length) != (len(data)-28-length, b'BIN\0'):
        raise ValueError('Invalid GLB chunk table')
    scene = json.loads(data[20:20+length])
    binary = memoryview(data)[28+length:]
    views = [binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
             for v in scene['bufferViews']]
    return scene, views


def verify(source, delivery):
    original, inputs = unpack(source)
    packed, outputs = unpack(delivery)
    if packed['asset']['extras']['sourceSha256'] != sha256(source).hexdigest():
        raise ValueError('Wrong source hash')
    for key in ('accessors', 'meshes', 'nodes', 'materials', 'samplers', 'scenes'):
        if packed[key] != original[key]:
            raise ValueError(f'Changed {key}')
    layout = lambda v: {key: value for key, value in v.items() if key not in ('byteOffset', 'byteLength')}
    if [layout(v) for v in packed['bufferViews']] != [layout(v) for v in original['bufferViews']]:
        raise ValueError('Changed buffer layout')
    images = {im['bufferView'] for im in original['images']}
    for i, (before, after) in enumerate(zip(inputs, outputs, strict=True)):
        if before == after:
            continue
        if i not in images:
            raise ValueError(f'Changed geometry buffer {i}')
        with Image.open(BytesIO(before)) as a, Image.open(BytesIO(after)) as b:
            if a.size != b.size or a.convert('RGBA').tobytes() != b.convert('RGBA').tobytes():
                raise ValueError(f'Changed texture {i}')
    for a, b in zip(original['images'], packed['images'], strict=True):
        if a['bufferView'] != b['bufferView']:
            raise ValueError('Changed image reference')
        with Image.open(BytesIO(outputs[b['bufferView']])) as image:
            if Image.MIME[image.format] != b['mimeType']:
                raise ValueError('Incorrect image format')
    for a, b in zip(original['textures'], packed['textures'], strict=True):
        if a.get('sampler') != b.get('sampler') or a['source'] != b.get('extensions', {}).get('EXT_texture_webp', b)['source']:
            raise ValueError('Changed texture reference')


if __name__ == '__main__':
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    encoder = f"{Image.__version__}-{features.version('webp')}-{sha256(Path(__file__).read_bytes()).hexdigest()[:16]}"
    for hull in ('lancer.glb', 'torsas.glb'):
        source = (ROOT / 'assets/models/ships' / hull).read_bytes()
        cache = CACHE / encoder / sha256(source).hexdigest() / hull
        if not cache.exists():
            cache.parent.mkdir(parents=True, exist_ok=True)
            stream = NamedTemporaryFile(dir=cache.parent, delete=False)
            temp = Path(stream.name)
            try:
                with stream:
                    pack(hull, source, stream)
                temp.replace(cache)
            finally:
                temp.unlink(missing_ok=True)
        target = out / hull
        shutil.copyfile(cache, target)
        verify(source, target.read_bytes())
