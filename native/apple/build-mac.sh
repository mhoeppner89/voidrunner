#!/bin/bash
set -euo pipefail

apple_dir="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$apple_dir/../.." && pwd)"
out="$root/output/native/macos"
build="$out/build"
if [[ ! -f "$root/dist/index.html" || ! -f "$root/dist/src/game/multiplayer/nativeLink.js" ]]; then
    echo "Build the game first with npm run build." >&2
    exit 1
fi
mkdir -p "$build/modules"

# Some CLT upgrades leave the old module map next to its renamed replacement.
# Apply the workaround only when both define SwiftBridging, without editing the SDK.
compiler="$(xcrun --find swiftc)"
include="$(dirname "$compiler")/../include/swift"
flags=(-swift-version 5 -O -module-cache-path "$build/modules")
if [[ -f "$include/module.modulemap" && -f "$include/bridging.modulemap" ]] &&
   grep -q 'module SwiftBridging' "$include/module.modulemap" &&
   grep -q 'module SwiftBridging' "$include/bridging.modulemap"; then
    : > "$build/empty-modulemap"
    python3 - "$include/module.modulemap" "$build" <<'PY'
import json, pathlib, sys
duplicate, build = map(pathlib.Path, sys.argv[1:])
overlay = {"version": 0, "case-sensitive": "false", "roots": [{"type": "file", "name": str(duplicate.resolve()),
                                   "external-contents": str(build / "empty-modulemap")}]}
(build / "clt-overlay.json").write_text(json.dumps(overlay))
PY
    flags+=(-vfsoverlay "$build/clt-overlay.json" -Xcc -ivfsoverlay -Xcc "$build/clt-overlay.json")
fi
if [[ "${1:-}" == "--smoke" || "${1:-}" == "--peer" ]]; then
    if [[ "$1" == "--peer" && ( "$#" != 3 || ( "$2" != "host" && "$2" != "guest" ) ) ]]; then
        echo "Usage: native/apple/build-mac.sh --peer host|guest 'Room name'" >&2
        exit 2
    fi
    shift
    runtime="$out/Voidrunner.app/Contents/Resources/dist"
    if [[ ! -f "$runtime/index.html" ]]; then
        echo "First run native/apple/build-mac.sh to package Voidrunner." >&2
        exit 1
    fi
    probe="$build/Smoke.app/Contents"
    mkdir -p "$probe/MacOS"
    cp "$apple_dir/Mac-Info.plist" "$probe/Info.plist"
    plutil -replace CFBundleIdentifier -string game.voidrunner.smoke "$probe/Info.plist"
    plutil -replace CFBundleExecutable -string AppleSmoke "$probe/Info.plist"
    xcrun swiftc "${flags[@]}" -target "$(uname -m)-apple-macosx13.3" "$apple_dir/Sources/GameAssets.swift" \
        "$apple_dir/Sources/Nearby.swift" "$apple_dir/Sources/GameView.swift" "$apple_dir"/tests/*.swift -o "$probe/MacOS/AppleSmoke"
    codesign --force --sign - "$build/Smoke.app"
    exec "$probe/MacOS/AppleSmoke" "$runtime" "$@"
elif [[ "$#" -gt 0 ]]; then
    echo "Usage: native/apple/build-mac.sh [--smoke | --peer host|guest 'Room name']" >&2
    exit 2
fi

stage="$(mktemp -d "$build/package.XXXXXXXX")"
app="$stage/Voidrunner.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"

for arch in arm64 x86_64; do
    xcrun swiftc "${flags[@]}" -target "$arch-apple-macosx13.3" "$apple_dir"/Sources/*.swift -o "$build/Voidrunner-$arch"
done
xcrun lipo -create "$build/Voidrunner-arm64" "$build/Voidrunner-x86_64" -output "$app/Contents/MacOS/Voidrunner"
cp "$apple_dir/Mac-Info.plist" "$app/Contents/Info.plist"

cp "$apple_dir/Voidrunner.icns" "$app/Contents/Resources/"
ditto --norsrc --noextattr "$root/dist" "$app/Contents/Resources/dist"
chmod a+rx "$app/Contents/Resources/dist"
codesign --force --sign - "$app"
codesign --verify --strict "$app"
# Keep the last working bundle in place through compilation and signing.
python3 - "$stage" "$out/Voidrunner.app" <<'PY'
import pathlib, shutil, sys
stage, target = map(pathlib.Path, sys.argv[1:])
backup = stage / "previous.app"
if target.exists():
    target.rename(backup)
try:
    (stage / "Voidrunner.app").rename(target)
except OSError:
    if backup.exists():
        backup.rename(target)
    raise
shutil.rmtree(stage)
PY
echo "$out/Voidrunner.app"
