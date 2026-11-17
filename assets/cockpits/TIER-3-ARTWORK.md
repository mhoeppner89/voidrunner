# Tier III cockpit artwork

Generated with the built-in image-generation tool on 2026-11-17 from the five user-approved unpainted layouts and actual ship references. The user approved integration; all five frames are active in career and Arena in 0.8.2ow.

| Hull | Selected original PNG | Exact generation prompt |
| --- | --- | --- |
| Bellona | [vanguard-paint-v2.png](vanguard-paint-v2.png) | [Initial prompt](VANGUARD-PROMPT.md), [material correction](VANGUARD-MATERIAL-V2-PROMPT.md) |
| Artemis | [lancer-paint-v1.png](lancer-paint-v1.png) | [LANCER-PROMPT.md](LANCER-PROMPT.md) |
| Atlas Hauler | [atlas-paint-v1.png](atlas-paint-v1.png) | [ATLAS-PROMPT.md](ATLAS-PROMPT.md) |
| Victoria | [blade-paint-v1.png](blade-paint-v1.png) | [BLADE-PROMPT.md](BLADE-PROMPT.md) |
| Odin | [astra-paint-v2.png](astra-paint-v2.png) | [ASTRA-PROMPT.md](ASTRA-PROMPT.md) |

All selected images are original 1850×850 RGBA outputs. Their 1851×850 approved layout guides and 1000×700 model references are retained beside them as `<id>-layout-guide-v1.png` and `<id>-model-reference-v1.png`. Odin v1 is retained as provenance; v2 removes hardware that intruded into its screen apertures.

Canonical monitor rectangles, control positions and pilot-rig geometry remain unchanged. Per-hull content padding and glass underlap fit the painted lips without altering the PNGs. The renderer reuses the navy/white hand strip and stationary joystick base; neither appears in the generation inputs. No aperture stencil, sliced bezel reconstruction, resampling or bitmap cleanup was applied.

Review: `/output/cockpit-layout/tier-3.html?revision=tier3-art-1`. Rebuild with `node tools/playtest/cockpit-layout.mjs`. All five definitions are `approved`; the review uses the same definitions and renderer as live flight.

Bellona v2 replaces the rejected leather-like brown trim with charcoal molded impact protection. Geometry and shared instrument/control/rig placement stay fixed; v1 is retained.
