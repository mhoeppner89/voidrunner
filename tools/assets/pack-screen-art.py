"""Produce verified lossless cockpit pixels and smaller screen-sized room/portrait cards."""
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import sys
from PIL import Image, features

root = Path(sys.argv[1])
cache = Path('.workbench/screen-delivery') / (Image.__version__ + '-' + features.version('webp'))
cache.mkdir(parents=True, exist_ok=True)
for image_path in (root / 'assets/cockpits').glob('*.png'):
    original = image_path.read_bytes()
    cached = cache / (sha256(original).hexdigest() + '.webp')
    with Image.open(BytesIO(original)) as image:
        if image.info.keys() & {'icc_profile', 'gamma', 'srgb'}:
            raise ValueError('Review cockpit colour metadata: ' + image_path.name)
        rgba = image.convert('RGBA')
        if not cached.exists():
            encoded = BytesIO()
            rgba.save(encoded, 'WEBP', lossless=True, exact=True, method=5)
            cached.write_bytes(encoded.getvalue())
        delivered = cached.read_bytes()
        with Image.open(BytesIO(delivered)) as decoded:
            if decoded.size != rgba.size or decoded.convert('RGBA').tobytes() != rgba.tobytes():
                raise ValueError('Changed cockpit alpha or colour: ' + image_path.name)
        image_path.with_suffix('.webp').write_bytes(delivered)
    image_path.unlink()

for category, box in [('locations', (960, 720)), ('portraits', (384, 448))]:
    base = root / 'art' / category
    for source in (base / 'simplified').rglob('*.webp'):
        dest = base / 'compact' / source.relative_to(base / 'simplified')
        dest.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as image:
            image.thumbnail(box, Image.Resampling.LANCZOS)
            image.save(dest, 'WEBP', quality=90, method=5)
