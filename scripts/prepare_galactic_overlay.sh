#!/bin/sh
set -eu

# Build a real transparent overlay from the approved galactic artwork. A raw
# luminance mask keeps pin-point stars crisp; a softer neighbourhood mask gives
# dark dust lanes partial coverage so they remain visible without carrying an
# opaque black sky around them.
galaxy_script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
galaxy_project_root=$(CDPATH= cd -- "$galaxy_script_dir/.." && pwd)
galaxy_source=${1:-"$galaxy_project_root/art/sky/milky-way-wide-v3.webp"}
galaxy_output=${2:-"$galaxy_project_root/art/sky/milky-way-wide-alpha-v3.webp"}
galaxy_temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/voidrunner-galaxy.XXXXXX")
galaxy_temp_png="$galaxy_temp_dir/milky-way-alpha.png"

galaxy_cleanup() {
    rm -f "$galaxy_temp_png"
    rmdir "$galaxy_temp_dir"
}
trap galaxy_cleanup EXIT HUP INT TERM

command -v ffmpeg >/dev/null 2>&1 || {
    echo "ffmpeg is required to build the galactic overlay" >&2
    exit 1
}
command -v cwebp >/dev/null 2>&1 || {
    echo "cwebp is required to build the galactic overlay" >&2
    exit 1
}

ffmpeg -y -loglevel error -i "$galaxy_source" -filter_complex \
    "[0:v]split=3[rgb][fine_src][soft_src];\
[rgb]format=rgba[rgb_rgba];\
[fine_src]format=gray,lut=y='clip((val-3)*5.2,0,255)'[fine];\
[soft_src]format=gray,gblur=sigma=14,lut=y='clip((val-2)*3.2,0,160)'[soft];\
[fine][soft]blend=all_expr='max(A,B)',gblur=sigma=0.7[alpha];\
[rgb_rgba][alpha]alphamerge[out]" \
    -map "[out]" -frames:v 1 "$galaxy_temp_png"

cwebp -quiet -q 92 -alpha_q 100 -m 6 "$galaxy_temp_png" -o "$galaxy_output"

echo "Wrote $galaxy_output"
