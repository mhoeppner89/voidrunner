# Voidrunner new-system NPC portraits v3

This folder contains all twenty named dialogue portraits defined by the newer location catalog. Each runtime asset is a 1086×1290 WebP, matching the dialogue card's 16:19 display ratio.

## Generation mode

- Built-in ImageGen, `stylized-concept` reference workflow; no API or CLI fallback.
- Image 1: `art/portraits/v2/captain-dorne-hd-v2.webp`, used only for art direction, close dialogue framing, and small-card readability. No identity details were copied.
- Image 2: the NPC's home bar or Cairn race room, used for architecture, materials, palette, background, and light.
- Gatehouse Twelve, Torchwell, and Shepherd Relay have automated mission terminals and no named `people` entries, so they require no portrait assets.

## Shared prompt

```text
Create a brand-new stylized science-fiction game NPC dialogue portrait. Reference image 1 is only the target art direction and framing: a polished painterly pixel-brush hybrid, crisp expressive face, head-and-shoulders portrait, roughly 4:5 vertical composition. Do not copy that person's identity, facial structure, hair, clothing, or pose. Reference image 2 is the character's home dock; use its architecture, materials, color palette, and light for a softly defocused but recognizable background. One person only, centered chest-up, face fully visible, natural eye contact or slight three-quarter angle, grounded used-future clothing with convincing wear, dramatic two-color rim light, readable at small UI size. No words, letters, numbers, logos, interface elements, border, frame, weapon, full-body view, or helmet covering the face.
```

## Character set

| Asset | Character direction | Home reference |
| --- | --- | --- |
| `juno-rell-hd-v1.webp` | Wiry mid-30s race coordinator; cropped curls, copper accent, confident half-smile, amber-trim racing jacket | Cairn race room |
| `merrit-voss-hd-v1.webp` | Weathered late-50s mechanic; salt-and-pepper hair, stubble, brow scar, goggles and repair coveralls | Cairn race room |
| `leon-vale-hd-v1.webp` | Refined early-40s market factor; tailored navy-and-gold merchant coat, composed calculating expression | Meridian bar |
| `sela-orrin-hd-v1.webp` | Mid-40s customs liaison; close-cropped hair, precise slate uniform, calm authority | Meridian bar |
| `tomas-quin-hd-v1.webp` | Lively late-20s courier; wind-tossed hair, worn flight jacket, messenger strap | Meridian bar |
| `arden-kai-hd-v1.webp` | Late-50s shipwright foreman; short silver bob, reinforced work jacket, pragmatic confidence | Argent bar |
| `mira-kest-hd-v1.webp` | Sharp late-30s outfitting broker; asymmetric black bob, calibration lens, tailored technical coat | Argent bar |
| `bram-tel-hd-v1.webp` | Focused early-30s test pilot; shaved head, orange-striped flight suit and harness | Argent bar |
| `vesh-orr-hd-v1.webp` | Androgynous late-40s freeport fixer; shaved sides, silver-threaded braids, oxblood-lined coat | Blackglass bar |
| `nara-quill-hd-v1.webp` | Guarded mid-30s independent broker; pinned dark waves, plum scarf, worn trade coat | Blackglass bar |
| `kellan-rusk-hd-v1.webp` | Broad early-50s mercenary captain; iron-grey crop, crooked nose, battered field jacket | Blackglass bar |
| `mara-jen-hd-v1.webp` | Shrewd early-50s quartermaster; short salt-and-pepper crop, patched utility jacket | Cinder bar |
| `dax-hollis-hd-v1.webp` | Warm early-40s refinery engineer; bald head, close beard, welding lenses, heat-resistant coveralls | Cinder bar |
| `rhea-sol-hd-v1.webp` | Alert late-20s freight dispatcher; side shave, long braid, headset, rust-and-navy dispatch jacket | Cinder bar |
| `dr-elin-saye-hd-v1.webp` | Intense early-60s research director; silver curls, pearl research coat over navy pressure suit | Nacre bar |
| `pavel-orn-hd-v1.webp` | Wry early-40s survey dispatcher; sandy hair and beard, white-charcoal survey jacket and headset | Nacre bar |
| `tessa-rye-hd-v1.webp` | Resolute late-30s clinic quartermaster; short coils with silver streak, pearl medical utility coat | Nacre bar |
| `soren-vek-hd-v1.webp` | Weathered early-50s extraction supervisor; close-cropped hair, cold-burn scar, insulated mining parka | Boreal bar |
| `aya-north-hd-v1.webp` | Capable mid-30s colony medic; low braid, blue medical parka, steady compassionate expression | Boreal bar |
| `halden-ree-hd-v1.webp` | Guarded mid-60s ice-hauler captain; silver beard, watch cap, heavy midnight-blue parka | Boreal bar |

## Normalization and QA

The generated PNGs varied slightly in size. Each was top-safe cropped to the exact 16:19 dialogue ratio, scaled with Lanczos to 1086×1290, and encoded with `cwebp -q 88 -m 6 -sharp_yuv`. The complete source contact sheet and all forty live desktop/phone dialogue captures were reviewed. Runtime QA checks exact file routing, dimensions, ratio, smooth interpolation, alt text, viewport containment, and browser errors.
