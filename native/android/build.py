"""Build and verify a side-loadable APK from the current packed game in dist/."""
import os
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path

PROJECT = Path(__file__).resolve().parent
ROOT = PROJECT.parent.parent
OUT = ROOT / "output/native/android"
RUNTIME = ROOT / "dist"
TOOLS_REV = "37.0.0"


def run(*args):
    subprocess.run([str(arg) for arg in args], check=True)


def build():
    sdk_dir = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if not sdk_dir:
        raise SystemExit("Set ANDROID_HOME to your Android SDK with platform 37.0 and Build Tools 37.0.0.")
    sdk = Path(sdk_dir)
    platform = next((jar for jar in [sdk / "platforms" / version / "android.jar"
                                     for version in ("android-37.0", "android-37")] if jar.is_file()), None)
    tools = sdk / "build-tools" / TOOLS_REV
    if not platform or not (tools / "aapt2").is_file():
        raise SystemExit(f"Install platforms;android-37.0 and build-tools;{TOOLS_REV} in {sdk}.")
    java = os.environ.get("JAVA_HOME")
    if not java or not (Path(java) / "bin/javac").is_file():
        raise SystemExit("Set JAVA_HOME to a JDK 21 or later.")
    if not (RUNTIME / "src/game/multiplayer/nativeLink.js").is_file():
        raise SystemExit("Run npm run build to prepare dist/ with native multiplayer support.")
    version = re.search(r"""const GAME_VERSION = ['"]([^'"]+)['"]""",
                        (RUNTIME / "src/game/ui.js").read_text())[1]
    out_apk = OUT / "Voidrunner-debug.apk"
    OUT.mkdir(parents=True, exist_ok=True)
    signing = ROOT / ".workbench/native/android"
    signing.mkdir(parents=True, exist_ok=True)
    key = signing / "debug.keystore"
    if not key.is_file():
        run(Path(java) / "bin/keytool", "-genkeypair", "-keystore", key, "-storepass", "android",
            "-keypass", "android", "-alias", "androiddebugkey", "-keyalg", "RSA", "-keysize", "2048",
            "-validity", "10000", "-dname", "CN=Voidrunner Local Debug")
        key.chmod(0o600)

    with tempfile.TemporaryDirectory(dir=OUT) as scratch:
        work = Path(scratch)
        classes = work / "classes"
        classes.mkdir()
        compiled = work / "resources.zip"
        apk = work / "package.apk"
        aligned = work / "aligned.apk"
        signed = work / "signed.apk"
        run(Path(java) / "bin/javac", "-encoding", "UTF-8", "--release", "8", "-classpath", platform,
            "-d", classes, *sorted((PROJECT / "src").rglob("*.java")))
        run(tools / "d8", "--release", "--min-api", "26", "--lib", platform, "--output", work,
            *sorted(classes.rglob("*.class")))
        run(tools / "aapt2", "compile", "--dir", PROJECT / "res", "-o", compiled)
        run(tools / "aapt2", "link", "-I", platform, "--manifest", PROJECT / "AndroidManifest.xml",
            "--version-name", version, "-o", apk, compiled)
        with zipfile.ZipFile(apk, "a") as archive:
            archive.write(work / "classes.dex", "classes.dex", zipfile.ZIP_DEFLATED)
            for file in sorted(RUNTIME.rglob("*")):
                if file.is_file():
                    method = zipfile.ZIP_STORED if file.suffix in {
                        ".gz", ".mp3", ".png", ".webp", ".woff2"} else zipfile.ZIP_DEFLATED
                    archive.write(file, "assets/game/" + file.relative_to(RUNTIME).as_posix(), method)
        run(tools / "zipalign", "-f", "4", apk, aligned)
        run(tools / "apksigner", "sign", "--ks", key, "--ks-key-alias", "androiddebugkey",
            "--ks-pass", "pass:android", "--key-pass", "pass:android", "--out", signed, aligned)
        run(tools / "apksigner", "verify", "--verbose", signed)
        run(tools / "zipalign", "-c", "4", signed)
        with zipfile.ZipFile(signed) as archive:
            for entry in archive.namelist():
                if entry.startswith("assets/game/"):
                    archive.extract(entry, work / "verified")
        run("node", ROOT / "tools/native/verify-bundled-runtime.mjs", work / "verified/assets/game")
        os.replace(signed, out_apk)
    print(out_apk)


if __name__ == "__main__":
    build()
