# Play Void Privateer v0.2 — Pixel Remaster

This directory is the compiled, self-contained browser build with the revised high-resolution pixel-art cockpit, illustrated dock screens, character portraits, ship art, and mobile HUD.

1. Start any static HTTP server in this directory. With Python:

   ```bash
   python3 -m http.server 4173
   ```

2. Open `http://localhost:4173/` in a modern browser.
3. On a phone, rotate to landscape and press **Fullscreen**. Progress autosaves in that browser profile.

Do not open `index.html` through a `file://` URL; browser module and service-worker security rules require HTTP.

The build has no runtime network dependency. After the first served load, its service worker also supports offline reload. Detailed controls and scope are in `README.md`. The source archive contains the full validation reports and screenshots under `review/`.
