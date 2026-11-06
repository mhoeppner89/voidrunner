"""Build a proportional dialogue face from the bundled pixel font."""
from pathlib import Path
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[2]
font = TTFont(root / 'assets/fonts/void-vga.ttf')
metrics = font['hmtx'].metrics
for code, name in font.getBestCmap().items():
    if code == 32:
        metrics[name] = (400, 0)
        continue
    glyph = font['glyf'][name]
    if glyph.numberOfContours:
        metrics[name] = (min(800, max(300, glyph.xMax + 100)), 0)
for entry in font['name'].names:
    if entry.nameID in (1, 3, 4, 6):
        label = {1:'Void VGA Text', 3:'VoidVGAText-1.0', 4:'Void VGA Text Regular', 6:'VoidVGAText-Regular'}[entry.nameID]
        entry.string = label.encode(entry.getEncoding())
font.save(root / 'assets/fonts/void-vga-text.ttf')
