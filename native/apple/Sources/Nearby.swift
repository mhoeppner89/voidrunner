import Foundation
import Network
import dnssd

// All room and socket state belongs to the main queue. A read waits for WebKit
// to consume its frame before requesting another, even if the sender is faster.
final class Nearby {
    typealias Event = ([String: Any], @escaping () -> Void) -> Void
    private let deliver: Event
    private var session: String?
    private var listener: NWListener?
    private var browser: NWBrowser?
    private var rooms: [String: NWEndpoint] = [:]
    private var peers: [String: Peer] = [:]
    private var advertisedService: NWListener.Service?
    private var visible = false
    private var announced = false
    private static let serviceType = "_voidrunner._tcp"

    init(deliver: @escaping Event) { self.deliver = deliver }

    static func parameters() -> NWParameters {
        let tcp = NWProtocolTCP.Options()
        tcp.noDelay = true
        tcp.enableKeepalive = true
        tcp.keepaliveIdle = 10
        tcp.keepaliveInterval = 3
        tcp.keepaliveCount = 3
        let parameters = NWParameters(tls: nil, tcp: tcp)
        parameters.prohibitedInterfaceTypes = [.cellular]
        parameters.includePeerToPeer = false
        return parameters
    }

    func command(_ command: [String: Any]) {
        guard let id = command["session"] as? String, !id.isEmpty, id.utf8.count <= 128,
              let type = command["type"] as? String else { return }
        if (type == "browse" || type == "host") && session != id {
            stop()
            session = id
        }
        guard session == id else { return }
        switch type {
        case "browse":
            if listener == nil && peers.isEmpty {
                stopBrowsing()
                browse()
            }
        case "host":
            if listener == nil && peers.isEmpty { host(name: command["name"] as? String ?? "Voidrunner") }
        case "join":
            guard listener == nil, peers.isEmpty, let roomId = command["roomId"] as? String,
                  let endpoint = rooms[roomId] else {
                emit("error", ["code": "connection", "message": "This room is no longer available."])
                return
            }
            stopBrowsing()
            addPeer("host", connection: NWConnection(to: endpoint, using: Self.parameters()))
        case "visibility":
            visible = command["visible"] as? Bool ?? false
            if !visible { announced = false }
            listener?.service = visible ? advertisedService : nil
        case "send":
            if let id = command["peerId"] as? String, let payload = command["payload"] as? String {
                peers[id]?.send(payload, latest: command["latest"] as? Bool ?? false)
            }
        case "disconnect":
            if let id = command["peerId"] as? String { peers[id]?.finish("Disconnected.") }
        case "close": stop()
        default: break
        }
    }

    private func emit(_ type: String, _ fields: [String: Any] = [:], done: @escaping () -> Void = {}) {
        guard let session else { done(); return }
        var event = fields
        event["session"] = session
        event["type"] = type
        deliver(event, done)
    }

    private func error(_ error: NWError, permissionDenied: Bool = false) {
        var denied = permissionDenied
        if case .dns(let code) = error {
            denied = denied || [kDNSServiceErr_PolicyDenied, kDNSServiceErr_NoAuth].contains(Int(code))
        }
        if case .posix(let code) = error { denied = denied || code == .EACCES || code == .EPERM }
        emit("error", ["code": denied ? "permission" : "connection",
                       "message": denied ? "Allow Voidrunner to access the local network in Settings." :
                           "The local connection is unavailable. Check that both devices are on the same Wi-Fi."])
    }

    private func browse() {
        let search = NWBrowser(for: .bonjour(type: Self.serviceType, domain: "local."), using: Self.parameters())
        browser = search
        search.stateUpdateHandler = { [weak self, weak search] state in
            guard let self, let search, self.browser === search else { return }
            switch state {
            case .waiting(let issue): self.error(issue)
            case .failed(let issue): self.stopBrowsing(); self.error(issue)
            default: break
            }
        }
        search.browseResultsChangedHandler = { [weak self, weak search] results, _ in
            guard let self, let search, self.browser === search else { return }
            var updated: [String: NWEndpoint] = [:]
            for result in results.prefix(128) {
                guard case .service(let name, _, _, _) = result.endpoint else { continue }
                // Bonjour instance names are unique within the queried local domain.
                guard updated[name] == nil else { continue }
                updated[name] = result.endpoint
            }
            self.rooms = updated
            self.emit("rooms", ["rooms": updated.keys.sorted().map { ["id": $0, "name": $0] }])
        }
        search.start(queue: .main)
    }

    private func stopBrowsing() {
        browser?.cancel()
        browser = nil
        rooms.removeAll()
    }

    private func host(name: String) {
        stopBrowsing()
        do {
            let parameters = Self.parameters()
            parameters.acceptLocalOnly = true
            let server = try NWListener(using: parameters)
            var label = name.trimmingCharacters(in: .whitespacesAndNewlines)
            while label.utf8.count > 63 { label.removeLast() }
            advertisedService = NWListener.Service(name: label.isEmpty ? "Voidrunner" : label,
                                                   type: Self.serviceType, domain: "local.")
            visible = true
            announced = false
            listener = server
            server.service = advertisedService
            server.serviceRegistrationUpdateHandler = { [weak self, weak server] change in
                guard let self, let server, self.listener === server else { return }
                if case .add = change, self.visible, !self.announced {
                    self.announced = true
                    self.emit("hosting")
                }
            }
            server.stateUpdateHandler = { [weak self, weak server] state in
                guard let self, let server, self.listener === server else { return }
                switch state {
                case .waiting(let issue): self.error(issue)
                case .failed(let issue):
                    self.error(issue)
                    self.listener = nil
                    self.visible = false
                    server.cancel()
                    // A registration failure can occur during a round. Keep
                    // existing TCP peers until their own connections end.
                default: break
                }
            }
            server.newConnectionHandler = { [weak self, weak server] connection in
                guard let self, let server, self.listener === server, self.visible,
                      self.peers.count < 3 else { connection.cancel(); return }
                self.addPeer(UUID().uuidString, connection: connection)
            }
            server.start(queue: .main)
        } catch {
            emit("error", ["code": "connection", "message": "Could not open a room on this network."])
        }
    }

    private func addPeer(_ id: String, connection: NWConnection) {
        let peer = Peer(connection)
        peers[id] = peer
        peer.onOpen = { [weak self] in self?.emit("open", ["peerId": id]) }
        peer.onMessage = { [weak self] payload, done in
            guard let self else { done(); return }
            self.emit("message", ["peerId": id, "payload": payload], done: done)
        }
        peer.onError = { [weak self] issue, denied in
            // An individual incoming guest never tears down the host's lobby.
            if id == "host" { self?.error(issue, permissionDenied: denied) }
        }
        peer.onClose = { [weak self, weak peer] reason in
            guard let self, let peer, self.peers[id] === peer else { return }
            self.peers.removeValue(forKey: id)
            self.emit("close", ["peerId": id, "reason": reason])
        }
        peer.start()
    }

    func stop() {
        session = nil
        stopBrowsing()
        listener?.cancel()
        listener = nil
        visible = false
        advertisedService = nil
        let sockets = peers.values
        peers.removeAll()
        for peer in sockets { peer.finish("Room closed.") }
    }
}

private final class Peer {
    static let maxFrame = 1 << 20
    let connection: NWConnection
    var onOpen: (() -> Void)?
    var onMessage: ((String, @escaping () -> Void) -> Void)?
    var onClose: ((String) -> Void)?
    var onError: ((NWError, Bool) -> Void)?
    private var open = false
    private var closed = false
    private var receivedFrame = false
    private var pendingBytes = 0
    private var pendingFrames = 0

    init(_ connection: NWConnection) { self.connection = connection }

    func start() {
        connection.stateUpdateHandler = { [weak self] state in
            guard let self, !self.closed else { return }
            switch state {
            case .ready:
                guard !self.open else { return }
                self.open = true
                self.onOpen?()
                self.readHeader()
            case .waiting(let issue), .failed(let issue):
                self.onError?(issue, self.connection.currentPath?.unsatisfiedReason == .localNetworkDenied)
                self.finish("Connection lost.")
            case .cancelled: self.finish("Disconnected.")
            default: break
            }
        }
        connection.start(queue: .main)
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
            guard let self, !self.closed, !self.receivedFrame else { return }
            if !self.open { self.onError?(.posix(.ETIMEDOUT), false) }
            self.finish("The other pilot did not respond.")
        }
    }

    private func readHeader() {
        guard !closed else { return }
        connection.receive(minimumIncompleteLength: 4, maximumLength: 4) { [weak self] data, _, _, _ in
            guard let self, !self.closed else { return }
            guard let data, data.count == 4 else { self.finish("Disconnected."); return }
            let length = data.reduce(0) { ($0 << 8) | Int($1) }
            guard (1...Self.maxFrame).contains(length) else { self.finish("Invalid message length."); return }
            self.connection.receive(minimumIncompleteLength: length, maximumLength: length) { [weak self] bytes, _, _, _ in
                guard let self, !self.closed else { return }
                guard let bytes, bytes.count == length, let value = String(data: bytes, encoding: .utf8) else {
                    self.finish("Incomplete or invalid message.")
                    return
                }
                self.receivedFrame = true
                self.onMessage?(value) { [weak self] in self?.readHeader() }
            }
        }
    }

    func send(_ payload: String, latest: Bool) {
        guard open && !closed else { return }
        if latest && (pendingBytes > 32 * 1024 || pendingFrames >= 8) { return }
        let count = payload.utf8.count
        guard (1...Self.maxFrame).contains(count) else { finish("Message exceeds the size limit."); return }
        guard pendingBytes + count + 4 <= 2 * Self.maxFrame + 8, pendingFrames < 256 else {
            if !latest { finish("The other pilot could not keep up.") }
            return
        }
        var length = UInt32(count).bigEndian
        var frame = withUnsafeBytes(of: &length) { Data($0) }
        frame.append(contentsOf: payload.utf8)
        pendingBytes += frame.count
        pendingFrames += 1
        connection.send(content: frame, completion: .contentProcessed { [weak self] issue in
            guard let self, !self.closed else { return }
            self.pendingBytes -= count + 4
            self.pendingFrames -= 1
            if issue != nil { self.finish("Connection lost.") }
        })
    }

    func finish(_ reason: String) {
        guard !closed else { return }
        closed = true
        connection.cancel()
        onClose?(reason)
    }
}
