import AppKit
import WebKit

// Use the packaged runtime and a separate native LAN guest. WebKit drives the
// actual room UI while the guest speaks the same framed JSON as an Android app.
@main
struct Smoke {
    @MainActor static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        let delegate = SmokeApplication()
        app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}

@MainActor
private final class SmokeApplication: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private var game: GameView?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let directory = URL(fileURLWithPath: CommandLine.arguments[1])
        let game = GameView(directory: directory)
        self.game = game
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1100, height: 700),
                              styleMask: [.titled, .closable], backing: .buffered, defer: false)
        self.window = window
        window.contentView = game.webView
        window.title = "Voidrunner native verification"
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        // The probe uses its own executable identity and never creates a career.
        Timer.scheduledTimer(timeInterval: 0.1, target: self, selector: #selector(runChecks), userInfo: nil, repeats: false)
    }

    @objc private func runChecks() {
        guard let game else { Smoke.fail("Missing test window.") }
        Smoke.check(game)
        NSApp.terminate(nil)
    }
}

extension Smoke {
    @MainActor static func check(_ game: GameView) {
        game.start { fail($0) }
        wait("packaged title", timeout: 35) {
            js(game, "!!document.querySelector('[data-ui-command=multiplayer]') && !!window.VoidrunnerNative") as? Bool == true
        }
        if CommandLine.arguments.count == 4 {
            checkExternalPeer(game, role: CommandLine.arguments[2], room: CommandLine.arguments[3])
            return
        }
        _ = js(game, """
        window.qaErrors = [];
        window.addEventListener('error', e => qaErrors.push(String(e.message)));
        window.addEventListener('unhandledrejection', e => qaErrors.push(String(e.reason)));
        const logError = console.error; console.error = (...x) => { qaErrors.push(x.map(String).join(' ')); logError(...x); }; void 0;
        """)
        let resources = """
        const image = new Image(); image.src = './art/title-cockpit.webp'; await image.decode();
        const full = await fetch('./assets/audio/laser-0.mp3');
        const audioBytes = await full.arrayBuffer();
        const length = audioBytes.byteLength;
        const signature = [...new Uint8Array(audioBytes).slice(0, 6)].join(',');
        let audioBuffer;
        try { audioBuffer = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(audioBytes); }
        catch (e) { throw Error('MP3 ' + full.status + ' ' + length + ' bytes (' + signature + '): ' + e.message); }
        const audio = await fetch('./assets/audio/laser-0.mp3?range-probe', {headers:{Range:'bytes=0-15'}});
        const {MeshoptDecoder} = await import('./vendor/meshoptimizer-0.24.0/meshopt_decoder.module.js');
        await MeshoptDecoder.ready;
        return image.naturalWidth > 0 && audioBuffer.duration > 0 && audio.status === 206 && (await audio.arrayBuffer()).byteLength === 16 && MeshoptDecoder.supported;
        """
        var decoded = false
        game.webView.callAsyncJavaScript(resources, arguments: [:], in: nil, in: .page) { result in
            switch result {
            case .success(let value): decoded = value as? Bool == true
            case .failure(let error): fail("Bundle decoding: \(error)")
            }
        }
        wait("bundled image, ranged audio and Wasm decoder") { decoded }
        _ = js(game, "document.querySelector('[data-ui-command=multiplayer]').click()")
        wait("installed room controls") { js(game, "!!document.querySelector('[data-match-action=host]')") as? Bool == true }
        let room = "Voidrunner QA " + UUID().uuidString.prefix(6)
        let pilot = "Guest Ω"
        let choose = """
        const input = document.querySelector('[data-match-field=name]');
        input.value = '\(room)'; input.dispatchEvent(new Event('input', {bubbles:true}));
        document.querySelector('[data-match-action=host]').click();
        """
        _ = js(game, choose)
        var guest: Nearby!
        var joined = false, welcomed = false, worldFrames = 0
        var readyRound: Int?
        let session = UUID().uuidString
        func command(_ type: String, _ fields: [String: Any] = [:]) {
            guest.command(fields.merging(["session": session, "type": type]) { _, new in new })
        }
        func send(_ fields: [String: Any]) {
            let data = try! JSONSerialization.data(withJSONObject: fields.merging(["v": 1]) { _, new in new })
            command("send", ["peerId": "host", "payload": String(decoding: data, as: UTF8.self)])
        }
        guest = Nearby { event, done in
            defer { done() }
            switch event["type"] as? String {
            case "error": fail("Native guest: \(event)")
            case "rooms":
                let rooms = event["rooms"] as? [[String: String]] ?? []
                if !joined, let id = rooms.first(where: { $0["name"] == room })?["id"] {
                    joined = true
                    command("join", ["roomId": id])
                }
            case "open": send(["type": "hello", "name": pilot])
            case "message":
                guard let payload = event["payload"] as? String,
                      let message = try? JSONSerialization.jsonObject(with: Data(payload.utf8)) as? [String: Any] else { fail("Invalid game message.") }
                if message["type"] as? String == "state", let state = message["state"] as? [String: Any] {
                    let players = state["players"] as? [[String: Any]] ?? []
                    welcomed = players.contains { $0["name"] as? String == pilot }
                    if state["phase"] as? String == "playing", let round = state["round"] as? Int, round != readyRound {
                        readyRound = round
                        send(["type": "ready", "round": round])
                    }
                }
                if message["type"] as? String == "world" { worldFrames += 1 }
            case "close": fail("Guest disconnected: \(event)")
            default: break
            }
        }
        var visibleToNewPilots = false
        let observer = Nearby { event, done in
            if let rooms = event["rooms"] as? [[String: String]] {
                visibleToNewPilots = rooms.contains { $0["name"] == room }
            }
            done()
        }
        observer.command(["session": UUID().uuidString, "type": "browse"])
        command("browse")
        wait("room advertisement") { visibleToNewPilots }
        wait("Bonjour discovery and guest roster") { welcomed }
        wait("host roster") {
            js(game, "document.querySelector('#multiplayer-panel').textContent.includes('\(pilot)') && !document.querySelector('[data-match-action=start]').disabled") as? Bool == true
        }
        _ = js(game, "document.querySelector('[data-match-action=start]').click()")
        let deadline = Date().addingTimeInterval(70)
        while worldFrames < 2 {
            if Date() >= deadline {
                let status = js(game, "JSON.stringify({errors:qaErrors,visibility:document.visibilityState,text:document.body.innerText.slice(-1400),state:JSON.parse(render_game_to_text()).screen})")
                fail("No arena snapshots, guest ready round \(String(describing: readyRound)), host \(String(describing: status))")
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        }
        wait("withdrawal from nearby rooms") { !visibleToNewPilots }
        observer.stop()
        command("close")
        print("PASS: packaged WebKit title, image, ranged audio, Wasm, Bonjour, native lobby and live match snapshots.")
    }

    @MainActor static func js(_ game: GameView, _ code: String) -> Any? {
        var done = false, value: Any?
        game.webView.evaluateJavaScript(code) { result, issue in
            if let issue { fail("WebKit: \(issue)") }
            value = result
            done = true
        }
        wait("WebKit response") { done }
        return value
    }

    @MainActor static func wait(_ stage: String, timeout: TimeInterval = 18, until condition: () -> Bool) {
        let stop = Date().addingTimeInterval(timeout)
        while !condition() {
            if Date() >= stop { fail("Timed out waiting for \(stage).") }
            RunLoop.current.run(until: Date().addingTimeInterval(0.04))
        }
        if stage != "WebKit response" { print("Passed " + stage); fflush(stdout) }
    }

    static func fail(_ message: String) -> Never {
        FileHandle.standardError.write(Data(("FAIL: " + message + "\n").utf8))
        exit(1)
    }
}
