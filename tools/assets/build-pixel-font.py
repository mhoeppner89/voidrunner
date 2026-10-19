"""Build Void VGA from the public-domain font8x8 source; requires fontTools."""
from pathlib import Path
import re
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

root=Path(__file__).resolve().parents[2]
bitmaps={}
for file,start in [('font8x8_basic.h',0),('font8x8_ext_latin.h',0xa0)]:
    source=(root/'tools/assets/font8x8'/file).read_text()
    rows=re.findall(r'\{\s*((?:0x[0-9a-fA-F]{2}\s*,?\s*){8})\}',source)
    for i,row in enumerate(rows):
        if start+i>=32: bitmaps[start+i]=[int(v,16) for v in re.findall(r'0x[0-9a-fA-F]{2}',row)]
font=FontBuilder(1280,isTTF=True)
order=['.notdef']+[f'uni{code:04X}' for code in bitmaps]
font.setupGlyphOrder(order)
font.setupCharacterMap({code:f'uni{code:04X}' for code in bitmaps})
glyphs={};metrics={}
for code,name in [(63,'.notdef')]+[(c,f'uni{c:04X}') for c in bitmaps]:
    pen=TTGlyphPen(None)
    for row,bits in enumerate(bitmaps[code]):
        x=0
        while x<8:
            if not bits&(1<<x):x+=1;continue
            first=x
            while x<8 and bits&(1<<x):x+=1
            left,right=first*100,x*100;bottom=(6-row)*128;top=bottom+128
            pen.moveTo((left,bottom));pen.lineTo((left,top));pen.lineTo((right,top));pen.lineTo((right,bottom));pen.closePath()
    glyphs[name]=pen.glyph();metrics[name]=(800,0)
font.setupGlyf(glyphs);font.setupHorizontalMetrics(metrics)
font.setupHorizontalHeader(ascent=1024,descent=-256)
font.setupNameTable({'familyName':'Void VGA','styleName':'Regular','uniqueFontIdentifier':'VoidVGA-1.0','fullName':'Void VGA Regular','psName':'VoidVGA-Regular','version':'Version 1.0','licenseDescription':'Public domain; derived from dhepper/font8x8. See LICENSE-font8x8.txt.'})
font.setupOS2(sTypoAscender=1024,sTypoDescender=-256,usWinAscent=1024,usWinDescent=256)
font.setupPost();font.setupMaxp()
font.save(root/'assets/fonts/void-vga.ttf')
print('Built assets/fonts/void-vga.ttf')
