from pathlib import Path
from random import Random
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'assets' / 'remaster' / 'dock-lower-strip.webp'
rng = Random(44017)
w, h = 320, 48
im = Image.new('RGB', (w, h), (5, 8, 7))
d = ImageDraw.Draw(im)
# overhead pipes and segmented metal frame
d.rectangle((0, 0, w, 5), fill=(20, 22, 19))
d.line((0, 5, w, 5), fill=(100, 75, 34), width=1)
for x in range(5, w, 29):
    d.rectangle((x, 1, x + 17, 3), fill=(52, 47, 34))
    if rng.random() < 0.6:
        d.rectangle((x + 3, 2, x + 6, 2), fill=(192, 133, 45))
# window bays
for bay, x in enumerate((8, 70, 132, 194, 256)):
    d.rectangle((x, 9, x + 54, 37), fill=(12, 18, 18), outline=(44, 53, 49))
    d.rectangle((x + 3, 12, x + 51, 31), fill=(5, 18, 20), outline=(29, 77, 72))
    # distant hangar lights and silhouettes
    for k in range(7):
        lx = x + 6 + k * 6
        ly = 16 + rng.randrange(0, 10)
        d.rectangle((lx, ly, lx + rng.choice((1, 2)), ly + 1), fill=rng.choice(((46, 157, 139), (196, 122, 41), (91, 107, 91))))
    if bay % 2 == 0:
        d.polygon([(x + 17, 31), (x + 23, 23), (x + 35, 23), (x + 43, 31)], fill=(9, 11, 10))
        d.rectangle((x + 26, 20, x + 32, 23), fill=(14, 17, 15))
    else:
        d.polygon([(x + 10, 31), (x + 22, 25), (x + 43, 27), (x + 49, 31)], fill=(10, 12, 11))
# foreground rail and floor
d.rectangle((0, 36, w, 42), fill=(22, 25, 22))
d.line((0, 36, w, 36), fill=(111, 83, 38), width=1)
d.rectangle((0, 43, w, 48), fill=(7, 9, 8))
for x in range(-8, w + 8, 18):
    d.line((160, 38, x, 48), fill=(19, 45, 41), width=1)
# worker silhouettes
for _ in range(13):
    x = rng.randrange(10, w - 10)
    y = rng.randrange(31, 38)
    d.ellipse((x - 1, y - 6, x + 2, y - 3), fill=(4, 6, 5))
    d.polygon([(x - 2, y - 3), (x + 3, y - 3), (x + 4, y + 4), (x - 3, y + 4)], fill=(4, 6, 5))
    if rng.random() < 0.35:
        d.point((x + 2, y - 2), fill=(70, 177, 155))
# pixel grime and scanlines
px = im.load()
for y in range(h):
    for x in range(w):
        if rng.random() < 0.075:
            r, g, b = px[x, y]
            delta = rng.choice((-12, -7, 8))
            px[x, y] = (max(0, min(255, r + delta)), max(0, min(255, g + delta)), max(0, min(255, b + delta)))
for y in range(2, h, 3):
    d.line((0, y, w, y), fill=(0, 0, 0), width=1)
im = im.resize((1280, 192), Image.Resampling.NEAREST)
im.save(OUT, 'WEBP', quality=92, method=6)
print('Wrote', OUT)
