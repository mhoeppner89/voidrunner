#!/usr/bin/env python3
"""Report resolution, tonal clipping, and high-frequency contrast for location art."""

from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ART_ROOT = ROOT / "art" / "locations"
EXPECTED_SIZE = (1672, 941)


def image_paths():
    yield from sorted((ART_ROOT / "v3").glob("*-hd-v1.png"))
    yield from sorted((ART_ROOT / "v4").glob("*.webp"))
    yield from sorted((ART_ROOT / "v5").glob("*.png"))
    yield from sorted((ART_ROOT / "v6").glob("*.png"))


def metrics(path):
    with Image.open(path) as image:
        rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
        size = image.size
    luma = rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722
    dx = np.abs(np.diff(luma, axis=1))
    dy = np.abs(np.diff(luma, axis=0))
    adjacent = np.concatenate((dx.ravel(), dy.ravel()))
    relative_x = dx / (luma[:, 1:] + luma[:, :-1] + 16)
    relative_y = dy / (luma[1:, :] + luma[:-1, :] + 16)
    relative = np.concatenate((relative_x.ravel(), relative_y.ravel()))
    p05, median, p95 = np.percentile(luma, (5, 50, 95))
    return {
        "size": size,
        "p05": p05,
        "median": median,
        "p95": p95,
        "shadow_clip": np.mean(luma < 8) * 100,
        "highlight_clip": np.mean(luma > 247) * 100,
        "mean_delta": np.mean(adjacent),
        "harsh_delta": np.mean(adjacent > 48) * 100,
        "mean_relative": np.mean(relative) * 100,
        "harsh_relative": np.mean(relative > 0.25) * 100,
    }


def main():
    rows = []
    for path in image_paths():
        values = metrics(path)
        rows.append((values["harsh_relative"], path, values))
    print("file\tsize\tp05\tmedian\tp95\tshadow<8%\thighlight>247%\tmean-delta\tdelta>48%\tmean-relative%\trelative>25%")
    for _, path, values in sorted(rows, reverse=True):
        width, height = values["size"]
        print(
            f"{path.relative_to(ROOT)}\t{width}x{height}\t"
            f"{values['p05']:.1f}\t{values['median']:.1f}\t{values['p95']:.1f}\t"
            f"{values['shadow_clip']:.2f}\t{values['highlight_clip']:.3f}\t"
            f"{values['mean_delta']:.2f}\t{values['harsh_delta']:.2f}\t"
            f"{values['mean_relative']:.2f}\t{values['harsh_relative']:.2f}"
        )
    wrong_size = [str(path.relative_to(ROOT)) for _, path, values in rows if values["size"] != EXPECTED_SIZE]
    if wrong_size:
        raise SystemExit(f"Unexpected dimensions: {', '.join(wrong_size)}")


if __name__ == "__main__":
    main()
