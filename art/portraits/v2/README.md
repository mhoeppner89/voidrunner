# Voidrunner NPC portraits v2

This folder contains the twelve named dialogue portraits used by the four Helios bars. Each runtime asset is a 1086×1290 WebP, matching the dialogue card's 16:19 display ratio so `object-fit: cover` does not discard character art.

## Generation mode

- Built-in ImageGen reference-edit workflow; no API/CLI fallback.
- Image 1: the matching `art/portraits/<id>.webp`, used as the identity, clothing, and pose anchor.
- Image 2: the character's home bar plate in `art/locations/v3/`, used only for environmental light and background cues.
- The existing transparent outfitter mechanic remains in `art/outfitting/v2/`; it serves a different full-body overlay and did not need replacement.

## Shared prompt

```text
Use case: identity-preserve
Asset type: Voidrunner in-game NPC dialogue portrait
Input images: Image 1 is the identity, clothing, and crop anchor for <name>; Image 2 is only the <location> bar environment and lighting reference.
Primary request: Re-render the same <name> as a clean, high-resolution, stylized-realistic painted game portrait that belongs naturally inside <location>.
Subject: Preserve the recognizable face, skin tone, age, hair, clothing, expression, and overall identity from Image 1. This character is a <role>.
Scene/backdrop: A softly defocused suggestion of the environment in Image 2; simple shapes only, no people, no readable signage.
Style/medium: polished stylized realism, crisp deliberate shapes, natural facial anatomy and skin texture, restrained painterly finish; consistent with premium science-fiction game dialogue art.
Composition/framing: portrait 3:4; one character only; eye-level chest-up framing; full head and both shoulders safely inside the central crop; face large and immediately readable at a 128-by-152-pixel UI size.
Lighting/mood: controlled environmental key light with a subtle cool rim; balanced midtones, clear eyes and facial planes.
Constraints: preserve identity and costume; no redesign; no extreme pose; no extra accessories; no text; no symbols; no logos; no watermark; no frame or border.
Avoid: crushed blacks, clipped neon, glowing outlines, dense micro-detail, noisy high-frequency texture, over-sharpening, plastic skin, photorealistic camera look, anime, comic ink, pixel art.
```

## Character clauses

| Asset | Role and identity emphasis | Home light |
| --- | --- | --- |
| `mara-vek-hd-v2.webp` | Bartender and rumor broker; asymmetric dark undercut, amber eyewear, dark jacket, jewelry, confident expression | Helix industrial amber/cyan |
| `oskar-brill-hd-v2.webp` | Cargo factor; work cap, dark beard, layered work clothes, guarded expression | Helix industrial amber/cyan |
| `sana-kell-hd-v2.webp` | Dock mechanic; swept auburn hair, shearling-collar mechanic jacket, tools, focused expression | Helix industrial amber/cyan |
| `captain-dorne-hd-v2.webp` | Warrant marshal; short dark hair, trimmed beard, navy patrol uniform, stern expression | Rookhaven navy/steel |
| `yara-tan-hd-v2.webp` | Ship broker; swept red hair, translucent cyan visor, tailored blue jacket, poised expression | Rookhaven navy/steel |
| `tovik-hd-v2.webp` | Veteran bounty pilot; older pale face, shoulder-length blond hair, blond beard, tactical jacket | Rookhaven navy/steel |
| `devi-castor-hd-v2.webp` | Mining foreman; work cap, short goatee, mining vest and harness, level expression | Vesper desert copper/blue |
| `ren-iverson-hd-v2.webp` | Surveyor; survey cap, blue work uniform, sensor harness, serious expression | Vesper desert copper/blue |
| `kes-ali-hd-v2.webp` | Union organizer; close-cropped hair, trimmed beard, sturdy work jacket, resolute expression | Vesper desert copper/blue |
| `linh-sorel-hd-v2.webp` | Agronomy delegate; tied-back brown hair, blue agronomy uniform, composed expression | Azure daylight/teal |
| `ivo-senn-hd-v2.webp` | Courier; swept dark hair, translucent cyan brow visor, blue flight jacket, alert expression | Azure daylight/teal |
| `doctor-ames-hd-v2.webp` | Clinic director; short dark hair, teal medical uniform, small medical patch, calm expression | Azure daylight/teal |

## Normalization and QA

The built-in edits preserved the 1086×1448 reference dimensions. Each selected output was cropped from `y=32` to the exact 16:19 dialogue ratio and encoded with `cwebp -q 90 -m 6`, producing 1086×1290 runtime files. Review the set as one contact sheet and in every live dialogue at both desktop and 844×390 phone sizes; verify face visibility, exact image source, natural browser interpolation, viewport containment, and a clean console.
