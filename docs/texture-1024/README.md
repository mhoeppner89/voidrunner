# 1024px ship textures — 0.8.2o

Compare http://localhost:4184/.freebuff/texture-1024/review.html : 0.8.2n on the left, approved 0.8.2o on the right. All six ships are selectable. These approved candidates are now installed as the game assets.

Build: node scripts/preview-1024-textures.mjs. Uses the separate glTF build tool installation from package-ship-models.mjs. For reproduction, start from the 0.8.2n runtime GLBs at commit 0f1c41a; do not reprocess the already-sharpened 0.8.2o assets. Color textures use Lanczos3 downsampling, 7% contrast around mid-gray, and restrained sharpening (sigma 0.6, limited bright/dark overshoot). JPEG quality 95 with full 4:4:4 chroma. Existing 1024px material masks are retained byte-for-byte, with no contrast/sharpening on physical material values.

All 12 maps are now 1024×1024. Wayfarer was already 1024px and receives only the color treatment. Accessor buffers (geometry, indices, UVs) remain byte-identical. Six GLBs validate without errors/warnings. Browser captures verify the decoded color texture size and no page errors; all six comparisons inspected. Fine source detail can still be lost when downsampling; sharpening cannot reconstruct details missing from the original.

Combined GLBs: 15.03 → 11.50 MB (23.5% smaller). Wayfarer grows slightly due to sharper JPEG detail and quality settings. Estimated RGBA8 texture allocation across all maps, including mipmaps, is 144 → 64 MiB; this is a budget estimate, not measured device GPU memory or FPS.
