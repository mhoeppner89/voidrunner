from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from random import Random
from typing import Iterable

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'public' / 'art'
REM = ROOT / 'art-source' / 'remaster'
RUNTIME_ART = ROOT / 'public' / 'assets' / 'remaster'


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip('#')
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))  # type: ignore[return-value]


def mix(a: tuple[int, int, int], b: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(int(a[i] * (1 - amount) + b[i] * amount) for i in range(3))  # type: ignore[return-value]


def clamp8(value: float) -> int:
    return max(0, min(255, int(value)))


def shade(color: tuple[int, int, int], factor: float) -> tuple[int, int, int]:
    return tuple(clamp8(channel * factor) for channel in color)  # type: ignore[return-value]


def pixel_noise(image: Image.Image, rng: Random, amount: float = 0.08) -> Image.Image:
    px = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            if rng.random() > amount:
                continue
            r, g, b = px[x, y][:3]
            delta = rng.choice((-18, -10, 8, 14))
            px[x, y] = (clamp8(r + delta), clamp8(g + delta), clamp8(b + delta))
    return image


def upscale(image: Image.Image, scale: int = 4) -> Image.Image:
    return image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)


def draw_scanline_texture(draw: ImageDraw.ImageDraw, width: int, height: int, alpha: int = 20) -> None:
    for y in range(1, height, 3):
        draw.line((0, y, width, y), fill=(0, 0, 0, alpha))


@dataclass(frozen=True)
class PortraitSpec:
    id: str
    seed: int
    accent: str
    role: str


PORTRAITS = [
    PortraitSpec('mara-vek', 12, '#d89a43', 'broker'),
    PortraitSpec('oskar-brill', 31, '#d89a43', 'merchant'),
    PortraitSpec('sana-kell', 53, '#d89a43', 'mechanic'),
    PortraitSpec('captain-dorne', 72, '#7fb7ca', 'marshal'),
    PortraitSpec('yara-tan', 87, '#7fb7ca', 'broker'),
    PortraitSpec('tovik', 103, '#7fb7ca', 'hunter'),
    PortraitSpec('devi-castor', 121, '#d77742', 'miner'),
    PortraitSpec('ren-iverson', 138, '#d77742', 'surveyor'),
    PortraitSpec('kes-ali', 147, '#d77742', 'union'),
    PortraitSpec('linh-sorel', 166, '#65c5b8', 'delegate'),
    PortraitSpec('ivo-senn', 179, '#65c5b8', 'courier'),
    PortraitSpec('doctor-ames', 191, '#65c5b8', 'doctor'),
]


def draw_portrait(spec: PortraitSpec) -> Image.Image:
    rng = Random(spec.seed)
    w, h = 72, 88
    im = Image.new('RGB', (w, h), '#060b0c')
    d = ImageDraw.Draw(im)
    accent = hex_rgb(spec.accent)
    background = shade(accent, 0.16)

    # Industrial booth background, different for each career.
    d.rectangle((2, 2, w - 3, h - 3), fill=background, outline=shade(accent, 0.68), width=1)
    for x in range(5, w - 4, 8):
        d.rectangle((x, 4, x + 2, h - 7), fill=shade(background, rng.uniform(0.7, 1.25)))
    for _ in range(10):
        x = rng.randrange(5, w - 7)
        y = rng.randrange(5, 36)
        if rng.random() < 0.62:
            d.rectangle((x, y, x + rng.choice((1, 2, 3)), y + 1), fill=mix(accent, (230, 242, 215), rng.uniform(0.05, 0.42)))
    d.rectangle((4, h - 9, w - 5, h - 6), fill=shade(accent, 0.55))
    d.line((4, h - 11, w - 5, h - 11), fill=mix(accent, (240, 210, 125), 0.22))

    skin_options = [(183, 119, 91), (132, 84, 67), (207, 154, 112), (104, 69, 57), (220, 170, 127), (157, 101, 78)]
    skin = skin_options[rng.randrange(len(skin_options))]
    shadow = shade(skin, 0.64)
    highlight = mix(skin, (255, 224, 182), 0.32)
    hair_options = [(18, 19, 18), (55, 35, 26), (172, 146, 102), (86, 47, 34), (32, 36, 38), (112, 35, 27)]
    hair = hair_options[rng.randrange(len(hair_options))]
    jacket_options = [(35, 55, 62), (67, 44, 34), (39, 48, 69), (64, 65, 43), (50, 44, 58), (28, 61, 58)]
    jacket = jacket_options[rng.randrange(len(jacket_options))]
    jacket_dark = shade(jacket, 0.45)

    # Torso with layered collar, shoulder pads and seams.
    d.polygon([(7, h), (10, 65), (22, 56), (50, 56), (63, 65), (68, h)], fill=jacket_dark)
    d.polygon([(10, h), (14, 66), (24, 59), (48, 59), (59, 66), (63, h)], fill=jacket)
    d.polygon([(25, 58), (35, 66), (47, 58), (44, 71), (28, 71)], fill=shade(jacket, 0.72))
    d.line((14, 69, 22, 65), fill=mix(jacket, accent, 0.45), width=2)
    d.line((58, 69, 50, 65), fill=mix(jacket, accent, 0.45), width=2)
    d.rectangle((12, 74, 15, 84), fill=shade(accent, 0.85))
    d.rectangle((57, 74, 60, 84), fill=shade(accent, 0.85))
    d.line((18, 82, 54, 82), fill=mix(accent, (225, 206, 141), 0.3), width=1)

    # Neck and head: deliberately angular, 16-bit style.
    d.rectangle((29, 49, 43, 62), fill=shadow)
    d.polygon([(21, 20), (27, 13), (46, 13), (53, 21), (52, 45), (45, 55), (29, 55), (20, 44)], fill=skin)
    d.polygon([(20, 25), (24, 18), (27, 17), (25, 45), (30, 53), (25, 49), (19, 42)], fill=shadow)
    d.polygon([(47, 17), (53, 23), (51, 44), (45, 52), (47, 38)], fill=shade(skin, 0.79))
    d.rectangle((28, 17, 39, 19), fill=highlight)
    d.rectangle((26, 23, 28, 34), fill=highlight)
    d.point((31, 42), fill=highlight)

    hair_style = rng.randrange(6)
    if spec.role in {'marshal', 'miner'} and rng.random() < 0.55:
        hair_style = 5
    if hair_style == 0:
        d.polygon([(20, 22), (22, 14), (29, 9), (46, 10), (53, 18), (50, 23), (43, 18), (29, 18)], fill=hair)
    elif hair_style == 1:
        d.polygon([(19, 23), (22, 12), (31, 8), (49, 12), (54, 20), (51, 28), (48, 19), (30, 18)], fill=hair)
        d.rectangle((48, 22, 53, 39), fill=hair)
    elif hair_style == 2:
        d.polygon([(20, 22), (22, 13), (29, 10), (53, 15), (51, 22), (37, 18)], fill=hair)
        d.rectangle((18, 22, 23, 41), fill=hair)
    elif hair_style == 3:
        d.polygon([(20, 21), (25, 11), (34, 6), (41, 7), (42, 15), (53, 19), (48, 22), (31, 17)], fill=hair)
        d.rectangle((18, 21, 23, 41), fill=hair)
    elif hair_style == 4:
        d.polygon([(19, 22), (22, 11), (32, 8), (49, 11), (54, 20), (51, 30), (48, 19), (28, 18)], fill=hair)
        d.rectangle((18, 22, 23, 42), fill=hair)
        d.rectangle((49, 22, 54, 43), fill=hair)
    else:  # cap / hard hat
        cap = mix(jacket, accent, 0.22)
        d.polygon([(20, 21), (23, 12), (31, 8), (48, 11), (53, 18), (51, 22)], fill=cap)
        d.rectangle((23, 17, 56, 21), fill=shade(cap, 0.78))
        d.rectangle((28, 10, 46, 12), fill=mix(cap, (225, 205, 130), 0.16))

    # Brows, eyes and asymmetry.
    d.rectangle((26, 28, 34, 30), fill=shade(hair, 0.7))
    d.rectangle((41, 28, 49, 30), fill=shade(hair, 0.7))
    eye = (10, 13, 12)
    d.rectangle((29, 31, 32, 33), fill=eye)
    d.rectangle((43, 31, 46, 33), fill=eye)
    if rng.random() < 0.38:
        d.point((30, 31), fill=accent)
        d.point((44, 31), fill=accent)
    d.polygon([(37, 32), (35, 42), (39, 43)], fill=shadow)
    d.rectangle((32, 47, 43, 49), fill=shade(shadow, 0.8))
    d.rectangle((35, 49, 41, 50), fill=mix(shadow, (120, 38, 31), 0.42))

    if rng.random() < 0.48 or spec.role in {'hunter', 'miner'}:
        d.rectangle((28, 51, 47, 53), fill=hair)
        d.rectangle((31, 54, 44, 56), fill=shade(hair, 0.84))

    # Role-specific equipment.
    if spec.role in {'mechanic', 'surveyor', 'courier'}:
        d.arc((16, 22, 57, 55), 210, 330, fill=shade(accent, 0.92), width=2)
        d.rectangle((52, 32, 56, 43), fill=shade(jacket, 0.56))
        d.rectangle((54, 36, 57, 39), fill=accent)
    if spec.role in {'broker', 'merchant'}:
        d.rectangle((21, 27, 52, 36), fill=mix(accent, (30, 48, 44), 0.46))
        d.line((23, 29, 36, 29), fill=mix(accent, (228, 245, 226), 0.48), width=1)
        d.rectangle((35, 35, 38, 36), fill=shade(accent, 0.55))
    if spec.role == 'marshal':
        d.polygon([(51, 68), (56, 70), (55, 78), (51, 81), (47, 78), (47, 71)], fill=mix(accent, (220, 220, 180), 0.42))
        d.line((49, 73, 54, 73), fill=(215, 235, 224), width=1)
    if spec.role == 'doctor':
        d.rectangle((49, 69, 57, 78), fill=(205, 214, 195))
        d.rectangle((52, 70, 54, 77), fill=accent)
        d.rectangle((50, 73, 56, 75), fill=accent)
    if spec.role in {'miner', 'union'}:
        d.rectangle((9, 62, 23, 66), fill=shade(accent, 0.6))
        d.line((10, 63, 21, 63), fill=mix(accent, (240, 205, 120), 0.5), width=1)
    if spec.role == 'hunter':
        d.line((45, 23, 49, 39), fill=(118, 48, 40), width=1)
        d.point((48, 38), fill=(210, 116, 73))

    # Dither and grime.
    pixel_noise(im, rng, 0.09)
    draw = ImageDraw.Draw(im, 'RGBA')
    draw_scanline_texture(draw, w, h, 16)
    return upscale(im, 4)


def save_portraits() -> None:
    out = ART / 'portraits'
    out.mkdir(parents=True, exist_ok=True)
    authored = {
        'mara-vek': REM / 'portrait-mara-vek.png',
        'oskar-brill': REM / 'portrait-oskar-brill.png',
        'sana-kell': REM / 'portrait-sana-kell.png',
    }
    for spec in PORTRAITS:
        if spec.id in authored and authored[spec.id].exists():
            image = Image.open(authored[spec.id]).convert('RGB').resize((288, 336), Image.Resampling.NEAREST)
            image = ImageEnhance.Contrast(image).enhance(1.08)
        else:
            image = draw_portrait(spec)
        image.save(out / f'{spec.id}.webp', 'WEBP', quality=92, method=6)


def starfield(draw: ImageDraw.ImageDraw, rng: Random, w: int, h: int, palette: tuple[int, int, int]) -> None:
    draw.rectangle((0, 0, w, h), fill=(3, 6, 9))
    for _ in range(int(w * h * 0.010)):
        x, y = rng.randrange(w), rng.randrange(h)
        value = rng.choice((110, 150, 185, 230))
        col = mix((value, value, value), palette, rng.uniform(0.0, 0.4))
        draw.point((x, y), fill=col)
        if value > 210 and rng.random() < 0.15:
            draw.point((x + 1, y), fill=shade(col, 0.65))


def draw_station_location(kind: str, seed: int, accent_hex: str) -> Image.Image:
    rng = Random(seed)
    w, h = 320, 180
    im = Image.new('RGB', (w, h), '#030607')
    d = ImageDraw.Draw(im)
    accent = hex_rgb(accent_hex)
    dark = shade(accent, 0.16)
    starfield(d, rng, w, 104, accent)

    # Planet or station exterior through the concourse viewport.
    if kind == 'rook':
        d.ellipse((228, -34, 360, 98), fill=shade(accent, 0.28), outline=mix(accent, (210, 230, 230), 0.24), width=2)
        d.arc((233, -28, 355, 94), 190, 310, fill=mix(accent, (230, 245, 240), 0.35), width=3)
        # bastion silhouette
        d.rectangle((118, 28, 204, 67), fill=(28, 38, 43), outline=shade(accent, 0.75))
        d.rectangle((133, 18, 189, 77), fill=(18, 27, 32))
        d.rectangle((145, 10, 177, 82), fill=(38, 50, 56))
        d.rectangle((154, 4, 168, 84), fill=(18, 25, 29))
        for x in (124, 196):
            d.rectangle((x, 36, x + 26, 58), fill=(22, 31, 35))
            d.rectangle((x + 4, 40, x + 22, 42), fill=accent)
        d.line((118, 68, 204, 68), fill=mix(accent, (230, 240, 220), 0.25), width=2)
    elif kind == 'vesper':
        # red planet mining skyline
        d.rectangle((0, 0, w, 104), fill=(35, 16, 12))
        for _ in range(170):
            x, y = rng.randrange(w), rng.randrange(100)
            d.point((x, y), fill=rng.choice(((88, 43, 26), (125, 62, 34), (47, 24, 18))))
        d.ellipse((238, 9, 284, 55), fill=(180, 97, 48))
        d.polygon([(0, 87), (38, 53), (73, 78), (112, 42), (155, 82), (208, 50), (252, 75), (320, 46), (320, 108), (0, 108)], fill=(39, 22, 18))
        for x, width in ((43, 24), (88, 17), (205, 31), (252, 20)):
            d.rectangle((x, 72, x + width, 105), fill=(27, 26, 23))
            d.rectangle((x + 4, 77, x + width - 4, 80), fill=accent)
        d.line((0, 104, 320, 104), fill=mix(accent, (230, 180, 100), 0.25), width=2)
    elif kind == 'azure':
        d.rectangle((0, 0, w, 104), fill=(8, 28, 34))
        d.ellipse((228, -18, 350, 104), fill=shade(accent, 0.43), outline=mix(accent, (220, 238, 218), 0.3), width=2)
        d.arc((235, -12, 343, 96), 195, 340, fill=(173, 224, 207), width=3)
        # greenhouse/agroport structures
        for x, width in ((28, 53), (105, 74), (211, 58)):
            d.rectangle((x, 66, x + width, 104), fill=(17, 38, 39), outline=shade(accent, 0.56))
            d.arc((x, 47, x + width, 87), 180, 360, fill=mix(accent, (210, 235, 210), 0.24), width=2)
            for gx in range(x + 7, x + width, 10):
                d.line((gx, 57, gx, 98), fill=shade(accent, 0.42))
        d.line((0, 104, 320, 104), fill=accent, width=2)
    else:  # helix abstract freeport view
        d.rectangle((0, 0, w, h), fill=(8, 8, 7))
        # Use the concept-derived terminal if available elsewhere; this fallback is detailed.
        d.ellipse((200, 12, 294, 78), outline=shade(accent, 0.76), width=4)
        d.ellipse((221, 28, 273, 63), outline=mix(accent, (210, 190, 120), 0.25), width=4)
        d.line((184, 45, 310, 45), fill=shade(accent, 0.7), width=5)
        d.line((247, 2, 247, 88), fill=shade(accent, 0.7), width=5)
        for _ in range(120):
            x, y = rng.randrange(w), rng.randrange(105)
            d.point((x, y), fill=rng.choice(((55, 50, 39), (95, 70, 35), (25, 44, 41))))

    # Thick window frame and perspective concourse.
    metal = (25, 30, 28)
    metal_hi = (64, 67, 58)
    d.polygon([(0, 0), (16, 0), (55, 110), (41, 116)], fill=metal)
    d.polygon([(320, 0), (304, 0), (266, 110), (279, 116)], fill=metal)
    d.rectangle((0, 103, 320, 113), fill=metal_hi)
    d.rectangle((0, 109, 320, 118), fill=(10, 13, 12))
    d.line((16, 0, 55, 110), fill=mix(metal_hi, accent, 0.23), width=2)
    d.line((304, 0, 266, 110), fill=mix(metal_hi, accent, 0.23), width=2)

    # Floor with strong perspective grid.
    d.polygon([(0, 118), (320, 118), (320, 180), (0, 180)], fill=(8, 11, 10))
    for x in range(-80, 401, 24):
        d.line((160, 118, x, 180), fill=shade(accent, 0.32), width=1)
    for y in (124, 132, 142, 154, 168):
        d.line((0, y, 320, y), fill=shade(accent, 0.28), width=1)
    d.line((0, 118, 320, 118), fill=mix(accent, (215, 220, 180), 0.2), width=2)

    # Service consoles and terminal lamps.
    for x, width in ((24, 70), (221, 74)):
        d.polygon([(x, 133), (x + width, 133), (x + width - 6, 165), (x + 5, 165)], fill=(15, 22, 20), outline=(55, 65, 58))
        d.rectangle((x + 8, 139, x + width - 9, 144), fill=shade(accent, 0.6))
        for ix in range(x + 9, x + width - 8, 8):
            d.rectangle((ix, 141, ix + 3, 142), fill=mix(accent, (220, 240, 205), 0.22))

    # People silhouettes and atmospheric movement.
    for index in range(7):
        x = rng.randrange(45, 276)
        y = rng.randrange(132, 166)
        size = rng.choice((5, 6, 7))
        d.ellipse((x - 2, y - size - 4, x + 2, y - size), fill=(9, 10, 9))
        d.polygon([(x - 3, y - size), (x + 3, y - size), (x + 5, y + 4), (x - 5, y + 4)], fill=(10, 12, 11))
        if index % 3 == 0:
            d.line((x - 2, y - 2, x + 4, y + 4), fill=shade(accent, 0.55), width=1)

    # Lamps, grime and scanlines.
    for x in range(8, 316, 18):
        if rng.random() < 0.62:
            d.rectangle((x, 115, x + 4, 117), fill=mix(accent, (255, 210, 116), rng.uniform(0.1, 0.5)))
    pixel_noise(im, rng, 0.10)
    overlay = Image.new('RGBA', im.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay, 'RGBA')
    draw_scanline_texture(od, w, h, 18)
    im = Image.alpha_composite(im.convert('RGBA'), overlay).convert('RGB')
    return upscale(im, 4)


def save_locations() -> None:
    out = ART / 'locations'
    out.mkdir(parents=True, exist_ok=True)
    # Distinct location backplates contain no baked interface text; the live DOM remains readable and interactive.
    draw_station_location('helix', 201, '#d89a43').save(out / 'helix.webp', 'WEBP', quality=91, method=6)
    for kind, seed, accent in (
        ('rook', 311, '#7fb7ca'),
        ('vesper', 419, '#d77742'),
        ('azure', 523, '#65c5b8'),
    ):
        draw_station_location(kind, seed, accent).save(out / f'{kind}.webp', 'WEBP', quality=91, method=6)


def draw_ship(kind: str, accent_hex: str, seed: int) -> Image.Image:
    rng = Random(seed)
    w, h = 192, 96
    im = Image.new('RGB', (w, h), '#03070a')
    d = ImageDraw.Draw(im)
    accent = hex_rgb(accent_hex)
    starfield(d, rng, w, h, accent)
    d.rectangle((3, 3, w - 4, h - 4), outline=shade(accent, 0.55), width=1)
    d.line((10, h - 12, w - 11, h - 12), fill=shade(accent, 0.82), width=1)

    if kind == 'wayfarer':
        hull = (69, 70, 62)
        hull_dark = (32, 35, 34)
        hull_hi = (112, 102, 78)
        # rugged multipurpose asymmetric wedge, original design
        d.polygon([(25, 53), (40, 38), (77, 23), (129, 25), (157, 43), (151, 59), (111, 70), (59, 67)], fill=hull_dark)
        d.polygon([(39, 48), (78, 27), (129, 29), (151, 43), (134, 53), (74, 55)], fill=hull)
        d.polygon([(33, 55), (61, 55), (49, 68), (22, 61)], fill=(48, 50, 45))
        d.polygon([(73, 28), (95, 18), (127, 24), (113, 34), (83, 35)], fill=hull_hi)
        d.polygon([(89, 24), (114, 25), (125, 34), (82, 35)], fill=shade(accent, 0.52))
        # cargo blisters and paneling
        for x in (66, 80, 96, 112):
            d.rectangle((x, 40, x + 9, 49), fill=(43, 45, 41), outline=(88, 78, 59))
        d.line((45, 50, 133, 52), fill=(126, 103, 65), width=1)
        d.line((59, 58, 121, 59), fill=(26, 29, 28), width=2)
        # triple engines, offset tail boom
        for x in (145, 158, 171):
            d.ellipse((x - 7, 40, x + 6, 58), fill=(18, 22, 22), outline=(82, 78, 61))
            d.rectangle((x + 3, 44, x + 10, 54), fill=shade(accent, 0.92))
            d.rectangle((x + 10, 46, x + 14, 52), fill=mix(accent, (255, 213, 122), 0.5))
        d.polygon([(132, 36), (153, 27), (165, 36), (151, 43)], fill=(42, 44, 41))
    else:
        hull = (62, 75, 81)
        hull_dark = (24, 32, 36)
        hull_hi = (108, 127, 128)
        # Vanguard: broader, heavier, fast interceptor/trader
        d.polygon([(20, 50), (51, 30), (96, 18), (144, 29), (174, 48), (149, 65), (92, 75), (46, 66)], fill=hull_dark)
        d.polygon([(38, 48), (66, 30), (103, 23), (142, 34), (162, 48), (139, 56), (78, 56)], fill=hull)
        d.polygon([(47, 45), (18, 34), (43, 55), (69, 57)], fill=(45, 57, 62))
        d.polygon([(134, 42), (176, 32), (154, 57), (127, 59)], fill=(45, 57, 62))
        d.polygon([(76, 30), (101, 16), (127, 27), (118, 40), (82, 40)], fill=hull_hi)
        d.polygon([(88, 25), (113, 23), (123, 34), (84, 36)], fill=shade(accent, 0.63))
        # armor ribs and weapon housings
        for x in (58, 72, 132, 146):
            d.rectangle((x, 45, x + 8, 54), fill=(23, 29, 31), outline=(89, 105, 105))
        d.line((49, 61, 148, 61), fill=mix(accent, (225, 221, 160), 0.22), width=2)
        for x in (151, 164):
            d.ellipse((x - 8, 42, x + 6, 60), fill=(14, 20, 22), outline=(89, 102, 102))
            d.rectangle((x + 3, 46, x + 13, 56), fill=shade(accent, 0.88))
            d.rectangle((x + 11, 48, x + 17, 54), fill=mix(accent, (240, 224, 155), 0.42))
        d.rectangle((42, 42, 55, 46), fill=shade(accent, 0.72))
        d.rectangle((143, 40, 156, 44), fill=shade(accent, 0.72))

    # Pixel highlights, panel seams, and thruster glow.
    for _ in range(28):
        x = rng.randrange(30, 158)
        y = rng.randrange(25, 65)
        if rng.random() < 0.55:
            d.point((x, y), fill=rng.choice(((122, 116, 92), shade(accent, 0.8), (33, 35, 34))))
    glow = Image.new('RGBA', im.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow, 'RGBA')
    for center in ((177, 49), (164, 51)):
        gd.ellipse((center[0] - 13, center[1] - 7, center[0] + 13, center[1] + 7), fill=(*mix(accent, (255, 180, 70), 0.6), 54))
    glow = glow.filter(ImageFilter.GaussianBlur(4))
    im = Image.alpha_composite(im.convert('RGBA'), glow).convert('RGB')
    pixel_noise(im, rng, 0.06)
    overlay = Image.new('RGBA', im.size, (0, 0, 0, 0))
    draw_scanline_texture(ImageDraw.Draw(overlay, 'RGBA'), w, h, 14)
    im = Image.alpha_composite(im.convert('RGBA'), overlay).convert('RGB')
    return upscale(im, 4)


def save_ships() -> None:
    out = ART / 'ships'
    out.mkdir(parents=True, exist_ok=True)
    draw_ship('wayfarer', '#d89a43', 701).save(out / 'wayfarer.webp', 'WEBP', quality=92, method=6)
    draw_ship('vanguard', '#6fb8c8', 809).save(out / 'vanguard.webp', 'WEBP', quality=92, method=6)


def save_runtime_textures() -> None:
    RUNTIME_ART.mkdir(parents=True, exist_ok=True)
    source_path = REM / 'helix-terminal-reference.png'
    if source_path.exists():
        texture = Image.open(source_path).convert('RGB').resize((1280, 720), Image.Resampling.LANCZOS)
        texture = ImageEnhance.Contrast(texture).enhance(1.08)
        texture = ImageEnhance.Color(texture).enhance(0.72)
        texture.save(RUNTIME_ART / 'dock-industrial-texture.jpg', quality=86, optimize=True, progressive=True)


def main() -> None:
    save_portraits()
    save_locations()
    save_ships()
    save_runtime_textures()
    print('Remaster art generated in', ART)


if __name__ == '__main__':
    main()
