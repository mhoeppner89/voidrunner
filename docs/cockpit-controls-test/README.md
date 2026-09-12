# Cockpit controls — 0.8.2f

Open http://localhost:4184/game.html?drone-test=1 or double-click PLAY_COCKPIT_TEST.command. The drone-test URL uses an isolated test save and resets on reload. Choose Joystick in Pause → steering; tilt remains available. The title screen also provides a Joystick button.

- Left stick steers; release to centre. Left slider sets thrust and stays where placed.
- Right flame button: hold for boost while steering. Main button always fires guns. Secondary button: missile for combat, drone deployment/recall for asteroids, hold to salvage wrecks, capture beam for surrendered opponents. Selected targets scan automatically in range.
- Tap the radar plot for navigation. The transponder switch is in the ship menu (tap the own-ship monitor).
- Landscape remains required on phones.

Verification: existing input test suite (8 groups: keyboard, touch, blur, gamepad and tilt), JavaScript syntax, and browser controls at 667×375, 844×390, 1024×768 and 1440×900. Browser harness: `.freebuff/probe-cockpit-controls.mjs`, run from the repository with the local server on 4184. The committed phone-clean-radar.png shows the final cockpit. Earlier flight, service and equipment captures remain available locally. Desktop-sized captures use touch emulation to show the controls. Physical phone tilt/ergonomics still need a hands-on check.

Final browser result: full steering input, release/blur recentring, simultaneous steering + boost, and touch cancellation passed; no browser errors. Inspected the rendered phone cockpit, compact service rows and equipment layouts.

Monitor-fit preview: the sprite and monitors share their transform; the centre knob is 21px. Maximum touch scaling expands the joystick to the own-monitor edge. Maximum-scale captures remain available locally.
