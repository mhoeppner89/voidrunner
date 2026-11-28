import Foundation
import WebKit

extension Smoke {
    // Each role uses a separate physical peer. Count the unchanged game's packets
    // at the JS/native boundary while it renders its normal foreground cockpit.
    @MainActor static func checkExternalPeer(_ game: GameView, role: String, room: String) {
        guard ["host", "guest"].contains(role), !room.isEmpty, room.count <= 24 else {
            fail("Choose host or guest and use a room name of 1–24 characters.")
        }
        let settings = ProcessInfo.processInfo.environment
        let timeout = Double(settings["VR_PEER_WAIT_SECONDS"] ?? "") ?? 300
        let hold = Double(settings["VR_PEER_HOLD_SECONDS"] ?? "") ?? 45
        guard let pilotCount = Int(settings["VR_PEER_PILOTS"] ?? "2"), (2...4).contains(pilotCount) else {
            fail("VR_PEER_PILOTS must be between 2 and 4.")
        }
        var attached = false
        game.webView.callAsyncJavaScript("""
            const {NativeLink} = await import('./src/game/multiplayer/nativeLink.js');
            const counts = window.qaPackets = {
                sentWorld:0, sentInput:0, receivedWorld:0, receivedInput:0, receivedReady:0, peersWithInput:0
            };
            const inputPeers = new Set();
            const errors = window.qaErrors = [];
            window.addEventListener('unhandledrejection', event => errors.push(String(event.reason?.stack ?? event.reason)));
            window.addEventListener('error', event => { if (event.message) errors.push(event.message); });
            const logError = console.error;
            console.error = (...args) => { errors.push(args.map(String).join(' ')); logError(...args); };
            const send = NativeLink.prototype.send, receive = NativeLink.prototype.receive;
            NativeLink.prototype.send = function(id, message, options) {
                const accepted = send.call(this, id, message, options);
                if (accepted && message.type === 'world') counts.sentWorld++;
                if (accepted && message.type === 'input') counts.sentInput++;
                return accepted;
            };
            NativeLink.prototype.receive = function(text) {
                const event = JSON.parse(text);
                if (event.session === this.session && event.type === 'message' && this.peers.has(event.peerId)) {
                    const message = JSON.parse(event.payload);
                    if (message.type === 'world') counts.receivedWorld++;
                    if (message.type === 'input') {
                        counts.receivedInput++;
                        inputPeers.add(event.peerId);
                        counts.peersWithInput = inputPeers.size;
                    }
                    if (message.type === 'ready') counts.receivedReady++;
                }
                return receive.call(this, text);
            };
            window.qaRoom = room;
            document.querySelector('[data-ui-command=multiplayer]').click();
            """, arguments: ["room": room], in: nil, in: .page) { result in
                if case .failure(let error) = result { fail("Game controls: \(error)") }
                attached = true
            }
        wait("native game bridge") { attached }
        wait("nearby room controls") { js(game, "!!document.querySelector('[data-match-action=host]')") as? Bool == true }

        let pilotName = role == "host" ? room : "Mac guest"
        let literal = String(decoding: try! JSONEncoder().encode(pilotName), as: UTF8.self)
        _ = js(game, """
            const field = document.querySelector('[data-match-field=name]');
            field.value = \(literal); field.dispatchEvent(new Event('input', {bubbles:true})); void 0;
            """)
        if role == "host" {
            _ = js(game, "document.querySelector('[data-match-action=host]').click()")
            wait("host lobby") { js(game, "!!document.querySelector('[data-match-action=open-loadout]')") as? Bool == true }
            _ = js(game, """
                document.querySelector('[data-match-action=open-loadout]').click();
                document.querySelector('[data-match-action=loadout-equipment]').click();
                document.querySelector('[data-match-action=confirm-loadout]').click();
                """)
            print("Hosting \(room). Join this room on the remaining devices."); fflush(stdout)
            wait("all pilots in host lobby", timeout: timeout) {
                js(game, """
                    document.querySelector('[data-match-action=start]')?.disabled === false
                        && document.querySelectorAll('.match-table tbody tr').length === \(pilotCount)
                    """) as? Bool == true
            }
            let roster = js(game, "document.querySelector('.match-table')?.innerText")
            print("Mac host roster: \(roster ?? "")"); fflush(stdout)
            _ = js(game, "document.querySelector('[data-match-action=start]').click()")
        } else {
            print("Browsing for \(room). Host this room on the phone."); fflush(stdout)
            _ = js(game, "document.querySelector('[data-match-action=refresh-nearby]').click()")
            let choose = """
            (() => {
                const button = [...document.querySelectorAll('[data-match-action=join-nearby]')]
                    .find(b => b.closest('li').querySelector('b').textContent === window.qaRoom);
                if (!button || button.disabled) return false;
                button.click(); return true;
            })()
            """
            wait("phone room from Bonjour", timeout: timeout) { js(game, choose) as? Bool == true }
            wait("phone lobby assignment", timeout: timeout) {
                js(game, "JSON.parse(render_game_to_text()).screen === 'lobby'") as? Bool == true
            }
            let roster = js(game, "document.querySelector('.match-table')?.innerText")
            _ = js(game, """
                document.querySelector('[data-match-action=open-loadout]').click();
                document.querySelector('[data-match-action=loadout-equipment]').click();
                document.querySelector('[data-match-action=confirm-loadout]').click();
                """)
            print("Mac guest roster: \(roster ?? ""). Start the round on the phone."); fflush(stdout)
        }
        let traffic = role == "host" ? "qaPackets.sentWorld >= 3 && qaPackets.receivedInput >= 3 && qaPackets.peersWithInput >= \(pilotCount - 1)"
                                    : "qaPackets.receivedWorld >= 3 && qaPackets.sentInput >= 3"
        let live = """
        (() => {
            const state = JSON.parse(render_game_to_text());
            const game = __VOID_PRIVATEER__.getRuntime();
            const canvas = game?.renderer?.renderer?.domElement || document.querySelector('canvas');
            return state.screen === 'flight' && state.phase === 'playing' && !!state.player?.shipId
                && !!game?.arena?.multiplayer && state.contacts?.length >= \(pilotCount - 1)
                && canvas?.width > 0 && canvas?.height > 0 && (\(traffic));
        })()
        """
        var nextReport = Date().addingTimeInterval(15)
        wait("live cockpit and two-way game traffic", timeout: timeout) {
            if js(game, live) as? Bool == true { return true }
            if Date() >= nextReport {
                let status = js(game, """
                (() => {
                    const state = JSON.parse(render_game_to_text());
                    return JSON.stringify({screen:state.screen, phase:state.phase, contacts:state.contacts?.length,
                        hasRuntime:!!__VOID_PRIVATEER__.getRuntime(), visibility:document.visibilityState,
                        assets:performance.getEntriesByType('resource').slice(-8).map(item=>new URL(item.name).pathname),
                        packets:qaPackets, errors:qaErrors.slice(-4)});
                })()
                """)
                print("Waiting for match (Mac \(role)): \(status ?? "")"); fflush(stdout)
                nextReport = Date().addingTimeInterval(15)
            }
            return false
        }
        let report = js(game, """
        (() => {
            const s = JSON.parse(render_game_to_text());
            return JSON.stringify({phase:s.phase, screen:s.screen, pilot:s.pilot?.name, hull:s.player.shipId,
                contacts:s.contacts.map(c=>c.name), packets:qaPackets});
        })()
        """)
        print("MATCH LIVE (Mac \(role)): \(report ?? "")"); fflush(stdout)
        // Keep the round open while the other device's HUD is checked.
        if hold > 0 { RunLoop.current.run(until: Date().addingTimeInterval(hold)) }
    }
}
