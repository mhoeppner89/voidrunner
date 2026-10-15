# Location art v6

This set closes the visual gap between the four original Helios docks and the ten later dockable locations. Every PNG is exactly 1672×941.

## Runtime set

- Ten `concourse-*` plates remove baked-in spacecraft and reserve one clear landing pad for the live player-ship overlay.
- Four `mission-*` plates give Cairn, Gatehouse Twelve, Torchwell, and Shepherd Relay their own race or contract computer.
- Four `bar-*` plates replace the noisy Argent, Blackglass, Boreal, and Cinder interiors.
- Three `market-*` plates replace the noisy Argent, Blackglass, and Cinder markets.

The original v4/v5 images remain in place as source history. Runtime routing lives in `src/game/ui.js`; only active images are precached by `sw.js`.

## Image-generation prompt set

These images were made with the built-in image-generation tool in reference-edit mode. Each source plate was inspected before editing.

All concourse prompts used this shared instruction:

> Precise 16:9 environment-art revision. Preserve the location identity, camera, palette, and broad architecture. Remove every baked spacecraft, vehicle, person, cargo item, and loose foreground prop. Build one broad empty landing pad for a live player-ship sprite. Use large coherent forms, restrained wear, sparse practical light, open shadow detail, quiet UI-safe regions, and no crushed blacks, blown highlights, bloom, grain, noise, clutter, readable text, logos, or watermark.

Location variants retained Argent's orbital shipyard, Blackglass's asteroid cavern, Boreal's ice moon, Cairn's racing outpost, Cinder's foundry, Gatehouse's blue jump beacon, Meridian's white civic station, Nacre's ring observatory, Shepherd's relay platform, and Torchwell's red-lit fuel outpost.

The four mission-terminal prompts used this shared instruction:

> Create a dedicated unmanned contract-computer interior consistent with the referenced location. Place an abstract mission display upper-left, a guild/network display upper-right, and one central console. Use geometric route symbols only, with no letters or numbers. Keep the room sparse, readable, evenly exposed, and free of noise or clutter.

Cairn is the one staffed variant: it is a race briefing room with exactly two pilot silhouettes aligned to the two existing character hotspots.

The bar prompts used this shared instruction:

> Rebuild the referenced bar with far less micro-detail and softer contrast. Preserve the location identity and exactly three separated patrons aligned to x=18%/47%/75%. Keep abstract mission and guild displays in the upper corners. Use one counter, no more than two or three tables, very few pipes, cables, bottles, lamps, or props, and no readable text or noise.

The market prompts used this shared instruction:

> Rebuild the referenced market as three clear destinations: commodity cargo left, equipment display centre, and one ship-for-sale bay right. Use large simple forms, few props and silhouettes, controlled lighting, abstract diagrams only, and no readable text, grain, clutter, or repeated high-contrast detail.

## Quality checks

- `python3 scripts/audit_location_art.py` verifies resolution and reports clipping plus adjacent-pixel contrast.
- `node .freebuff/capture-location-art.mjs` opens every runtime dock plate at 1280×720 and every changed/legacy concourse layout at 844×390, checks source routing, dimensions, live-ship visibility, pointer bounds, overflow, and browser errors, and writes screenshots plus diagnostics to `.freebuff/location-art-shots/`.
