#!/usr/bin/env python3
"""Build a review HTML that shows every showcase model alone — one shot per
section, no composites. Each section includes the raw PNG embedded as base64 so
the page is self-contained."""
from __future__ import annotations
import base64
from pathlib import Path

WBROOT = Path(__file__).resolve().parent
SCREEN_DIR = WBROOT / "showcase"
OUT = WBROOT / "comparisons" / "showcase.html"

ROWS = [
    ("Original ship models (one at a time)", [
        ("Kestrel (escort fighter)",           "10-ship-kestrel.png"),
        ("Talon (pirate interceptor)",         "11-ship-talon.png"),
        ("Warden (Concord patrol)",            "12-ship-warden.png"),
        ("Prospector (mining)",                "13-ship-prospector.png"),
        ("Lancer (bounty hunter)",             "14-ship-lancer.png"),
        ("Atlas-Freighter (heavy hauler)",     "15-ship-atlas.png"),
    ]),
    ("Original stations", [
        ("Helix Freeport (rotating freeport)", "30-station-helix.png"),
        ("Rookhaven Bastion (patrol fortress)","31-station-rook.png"),
    ]),
    ("Original planets", [
        ("Vesper (dry mining world)",          "40-planet-vesper.png"),
        ("Azure Reach (oceanic, ringed)",      "41-planet-azure.png"),
    ]),
    ("Original clusters", [
        ("Asteroid cluster (shardbelt)",       "50-asteroid-cluster.png"),
        ("Debris cluster (mourning-line)",     "51-debris-cluster.png"),
    ]),
]

def embed(path):
    mime = "image/png"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")

def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    parts = [
        "<!doctype html><html><head><meta charset='utf-8'>",
        "<title>Voidrunner Original Models</title>",
        "<style>",
        "  body { background: #0a1228; color: #d6e0f0; font-family: -apple-system, sans-serif; margin: 0; padding: 32px; }",
        "  h1 { font-size: 24px; margin: 0 0 8px; }",
        "  h2 { font-size: 18px; color: #d6e0f0; margin: 36px 0 12px; border-bottom: 1px solid #1b2741; padding-bottom: 6px; }",
        "  .shot { margin-bottom: 12px; }",
        "  .shot .label { font-size: 13px; color: #8aa3cf; margin-bottom: 4px; letter-spacing: 0.04em; text-transform: uppercase; }",
        "  .shot img { display: block; max-width: 900px; width: 100%; border: 1px solid #1b2741; border-radius: 6px; background: #050a1a; }",
        "</style></head><body>",
        "<h1>Voidrunner Original Models</h1>",
        "<p>One shot per model. 6 ship variants + 2 stations + 2 planets + 2 field clusters &mdash; each rendered in the studio scene with no HUD, no asteroids, no player ship. The 12 files live in <code>.workbench/showcase/</code>.</p>",
    ]
    for section_label, entries in ROWS:
        parts.append(f"<h2>{section_label}</h2>")
        for label, fname in entries:
            path = SCREEN_DIR / fname
            if not path.exists():
                continue
            parts.append("<div class='shot'>")
            parts.append(f"<div class='label'>{label} &middot; {fname}</div>")
            parts.append(f"<img src='{embed(path)}' alt='{label}'>")
            parts.append("</div>")
    parts.append("</body></html>")
    OUT.write_text("\n".join(parts))
    print(f"wrote {OUT}")

if __name__ == "__main__":
    main()
