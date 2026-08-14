from math import sqrt
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art-source' / 'remaster' / 'wayfarer-cockpit-sprite-source.png'
OUTPUT = ROOT / 'public' / 'assets' / 'remaster' / 'cockpit-frame.webp'
EXPECTED_SIZE = (1672, 941)
KEY = (0, 255, 0)


def generate() -> None:
    source = Image.open(SOURCE).convert('RGB')
    if source.size != EXPECTED_SIZE:
        raise ValueError(f'Expected {EXPECTED_SIZE}, got {source.size}')

    # The generated source is a flat-key sprite: canopy and exterior are
    # green, while the hardware and powered-off monitors are not. Keep the
    # monitors opaque and remove only the key-colored areas.
    alpha = Image.new('L', source.size, 255)
    alpha_pixels = alpha.load()
    source_pixels = source.load()
    for y in range(source.height):
        for x in range(source.width):
            r, g, b = source_pixels[x, y]
            distance = sqrt((r - KEY[0]) ** 2 + (g - KEY[1]) ** 2 + (b - KEY[2]) ** 2)
            if distance <= 12:
                alpha_pixels[x, y] = 0
            elif distance < 220:
                alpha_pixels[x, y] = round((distance - 12) / 208 * 255)

    rgba = source.convert('RGBA')
    rgba.putalpha(alpha)
    transparent = Image.new('RGBA', source.size, (0, 0, 0, 0))
    output = Image.composite(rgba, transparent, alpha)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    output.save(OUTPUT, 'WEBP', lossless=True, method=6)
    print(f'Wrote {OUTPUT}')


if __name__ == '__main__':
    generate()
