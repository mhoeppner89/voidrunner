# Morrigan forward hull overlay, v1

Generated with the built-in image generation tool on 2026-11-17. Separate transparent sprite; original cockpit PNG unchanged. User-approved manual placement: forward 13%, outward 18%. The user approved this composition and requested live integration on 2026-11-17.

Inputs: `demon-forward-hull-guide-v1.png` (exact geometry), existing cockpit plus guide composite (style/placement only), actual Morrigan model screenshot (exterior materials).

## Final prompt

Use case: sketch-to-render.
Asset type: transparent external-hull sprite overlay for a retro space-flight cockpit.
Input 1 is the exact approved geometry guide and EDIT TARGET. Input 2 is composition/style context only: the existing original Morrigan cockpit. Input 3 is the actual Morrigan spaceship exterior, reference only.
Paint ONLY the two cropped armored prongs in input 1. Preserve their exact silhouettes, positions, perspective, bevels, vertical placement and large transparent empty center. Canvas 1851 x 850, wide aspect 2.178:1. Each prong enters from the far left/right edge around y=496 and has its short inner end at x=248 on left and x=1603 on right around y=532–574, extending back/down out of the sides. Most of each structure is offscreen. Do NOT move them toward the center or enlarge them. Do not auto-crop or center the objects.
Material: match the actual ship's weathered muted dark red upper armor with charcoal gunmetal inner vertical faces, dark recessed seams, subtle machined bevels, occasional restrained wear and integrated rectangular service panels. Texture detail density, pixel-art rendering and restrained highlights should match input 2's detailed Wing Commander-like original cockpit art. These are solid faceted armor bodies, not wings, consoles or cockpit beams. Retain each visible face's existing orientation. Match ambient light to the red/charcoal cockpit, no bright new lights, no flames, no noise/grain overlay, no blur.
Output ONLY the two isolated hull fragments on genuine transparent alpha. Do not include any cockpit frame, canopy, monitors, instruments, hand, joystick, UI, buttons, typography, stars, planet or background. Preserve complete transparency everywhere that is transparent in input 1. The unchanged original cockpit will be layered above this sprite by code.
