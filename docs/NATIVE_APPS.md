# Voidrunner native apps

## Runtime contents

Run `npm ci`, install the pinned Python packages from `tools/assets/requirements.txt`, then run `npm run build` before packaging. The native apps use the production runtime in `dist/`, including the local engine, fonts, cockpit art, music, sound effects and models for all sites. The build checks the opening-screen assets and prepares the compressed models and textures.

After packaging, run the bundle audit with the directory that contains the app’s embedded `index.html`. You can pass multiple directories to check the same release across platforms.

```sh
node tools/native/verify-bundled-runtime.mjs path/to/embedded/runtime
```

The audit compares the size and SHA-256 of every release file against `dist/`, including files that the game loads only after launch. The `dist/` build must be the one used for those app packages.

## Build and install

### Mac

From the repository root, run the build script with the macOS Command Line Tools or Xcode installed.

```sh
bash native/apple/build-mac.sh
node tools/native/verify-bundled-runtime.mjs output/native/macos/Voidrunner.app/Contents/Resources/dist
```

Open `output/native/macos/Voidrunner.app` or drag it into Applications. The app runs on macOS 13.3 or later.

### iPhone

Open `native/apple/iOS/Voidrunner.xcodeproj` in Xcode after building `dist/`. Select your Apple signing team under **Signing & Capabilities** and set a unique bundle identifier if Xcode asks. Select the connected iPhone and click **Run** to install. The app runs on iOS 16.4 or later. To audit the Xcode build, use the `dist/` directory inside its built `Voidrunner.app`.

To keep your signing team local, set `DEVELOPMENT_TEAM` in `native/apple/iOS/Signing.local.xcconfig`. Git ignores that file.

### Android

Set `JAVA_HOME` to a JDK 21 or later and `ANDROID_HOME` to a local Android SDK with SDK Platform 37, Build Tools 37.0.0 and Platform Tools. Enable USB debugging on the phone and connect it. [Android SDK setup](https://developer.android.com/about/versions/17/setup-sdk)

```sh
python3 native/android/build.py
"$ANDROID_HOME/platform-tools/adb" install -r output/native/android/Voidrunner-debug.apk
```

The build audits the signed APK’s `assets/game/` directory before publishing the APK.

## Nearby room browser check

After `npm run build`, run `node tests/browser/native-multiplayer-lobby.mjs`. It opens the packaged title screen with a simulated native bridge, joins a room through the UI, checks the host’s lobby assignment, then checks that a full room withdraws and returns when a seat reopens.

## Offline play on real devices

1. Install the same release on a physical Android phone, iPhone and Mac. Before opening any app for the first time, connect all three to the same Wi-Fi. Disconnect the router’s internet uplink and turn off mobile data on both phones. Keep local Wi-Fi on. Use a network that allows its devices to reach one another.
2. Open each app from its installed icon and check that the opening art loads. Choose **New Career → Skip tutorial**, then **Launch** at the station. Check the cockpit, nearby geometry, music and sound effects. Quit and reopen the app while still offline, then select **Resume Flight** and check that the saved career loads.
3. For each row below, open **Multiplayer** on all three devices and enter distinct pilot names. Allow local-network access if the system asks. Select **Host room** on the host. On each guest, find the host under **Nearby rooms** and select **Join**. Keep each app visible while the round loads. Check that all three pilots appear in the lobby on each device.
4. Start a free-for-all at a different arena site for each host. On all three devices check that ships move, shots and hits are visible, and the timer and scoreboard agree. Confirm that a guest can leave and join again from **Nearby rooms** between rounds. Close the room before switching hosts.

| Host | Guests | Physical test |
| --- | --- | --- |
| Android | iPhone, Mac | Pending |
| iPhone | Android, Mac | Pending |
| Mac | Android, iPhone | Pending |

Record the OS versions, build version, test date and results for each row.

On November 27, 2026, build 0.8.2qe passed the bundled-file audit on macOS 14.6 and Android 17. The Mac and Pixel 8a found and joined each other's rooms over Wi-Fi. Both took a turn hosting a live match with game state and controls passing between devices. These matches ran with the internet uplink connected. The Pixel separately cold-started to the title screen in airplane mode with Wi-Fi off.

Xcode 16.2 built and development-signed the ARM64 iPhone app with the same 961 files. The app was installed and launched on an iPhone 14 Pro running iOS 18.6.2. Its Personal Team provisioning profile expires December 4, 2026.

The iPhone 14 Pro and Pixel 8a both joined a Mac-hosted room. The Mac recorded two ready messages, two remote ships and live flight input from both guests. The internet uplink was connected. The three-device offline rotation is pending.
