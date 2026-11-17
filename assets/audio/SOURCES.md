# Voidrunner sound credits

## Kenney — CC0
Impact Sounds: https://kenney.nl/assets/impact-sounds
Sci-Fi Sounds: https://kenney.nl/assets/sci-fi-sounds
License: https://creativecommons.org/publicdomain/zero/1.0/
Metal/plate/mining impacts, lasers, force fields, engine and thruster recordings form the basis of the energy weapons, impacts, engine loops and several ship-system cues. Edited through filtering, pitch adjustment, envelopes and mixing.

## Free Firearm Sound Library — CC0
By Ben Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney.
https://opengameart.org/content/the-free-firearm-sound-library
AR-15/D_24P.wav (PDC), Model 12/K_17P.wav (Ripper and pressure effects), Mosin Nagant/M_21P.wav (Magrail). Isolated reports, filtering, envelopes and gain adjustment.

## Explosion foundation — CC BY 4.0
“Explosion” by Iwiploppenisse: https://freesound.org/people/Iwiploppenisse/sounds/156031/
https://creativecommons.org/licenses/by/4.0/
Public HQ MP3 preview used as a foundation for capital explosions and some filtered pressure textures. Modified through trimming, filtering, resampling, layering and gain adjustment. The creator describes it as a composite of CinematicBoomNorm, glashouse and grenade.

## Workshop and docking recordings — CC0
“Arc Welding.wav” by squashy555: https://freesound.org/people/squashy555/sounds/256915/
“Electric Drill” by stomachache: https://freesound.org/people/stomachache/sounds/262213/
“door, close, space hatch, hydrolic.wav” by pointparkcinema: https://freesound.org/people/pointparkcinema/sounds/402501/
Public HQ MP3 previews used, with excerpts, filtering, boundary fades and gain adjustment; welding peaks softly limited.

## ElevenLabs generated effects
Shield hits and regular explosions: three variants each generated in the project owner's ElevenLabs account on 2026-09-22. Sunlance: supplied by the owner as a_spaceship_fires_a__#3-1790080855029.mp3. Generated with ElevenLabs (https://elevenlabs.io/); these are not CC0 recordings. Applicable ElevenLabs/account license governs these outputs. Designs retained with level adjustment and short boundary fades.

## Voidrunner sound forge — original synthesis
Everything in `fx/` is rendered by `tools/audio/forge.mjs` from the recipes in `tools/audio/forge/`: additive, FM, modal and filtered-noise synthesis written for this project. No recordings, samples or third-party material are involved. The files are regenerated with `npm run audio:forge`; `src/game/soundBankManifest.js` is generated alongside them. These layers (recoil, transients, energy tails, debris, hull and shield bodies, fly-bys, engine and hyperdrive loops, interface and alert tones, ambience details and the score's percussion) are stacked with the recordings above at run time; see `src/game/soundEvents.js`. Mono or stereo MP3 at 44.1 kHz, LAME VBR. Loop files carry 0.12 s of their own material before and after the loop window so decoder delay cannot open a gap.

The earlier synthesised interface tones (`ui-0`, `success-0`, `warning-0`, `scan-0`) were retired in 0.8.2ou in favour of the forged interface set.

All recorded assets above are mono MP3 at 44.1 kHz / 128 kbps. Engine beds have an overlap crossfade at the loop boundary. The local development scripts preserve original downloads and exact processing recipes.
