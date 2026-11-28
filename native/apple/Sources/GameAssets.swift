import Foundation
import Network

// A real origin supports ES modules, fetch, Web Audio, Wasm and persistent
// localStorage on both WebKit ports. Keep this port stable across app updates.
final class GameAssets {
    static let port: UInt16 = 57823
    static let authority = "127.0.0.1:\(port)"
    static let origin = URL(string: "http://\(authority)/")!
    private static let cookieName = "VoidrunnerBundle"
    private let secret = UUID().uuidString
    private let directory: URL
    private let queue = DispatchQueue(label: "Voidrunner.bundle")
    private var listener: NWListener?
    private var requests: [ObjectIdentifier: NWConnection] = [:]

    init(directory: URL) { self.directory = directory.resolvingSymlinksInPath().standardizedFileURL }

    var cookie: HTTPCookie {
        return HTTPCookie(properties: [.name: Self.cookieName, .value: secret,
            .domain: "127.0.0.1", .path: "/", .originURL: Self.origin,
            HTTPCookiePropertyKey("HttpOnly"): "TRUE", HTTPCookiePropertyKey("SameSite"): "Strict"])!
    }

    static func contains(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.scheme == "http" && url.host == "127.0.0.1" && url.port == Int(port)
            && url.user == nil && url.password == nil
    }

    func start(ready: @escaping (Result<Void, Error>) -> Void) throws {
        let parameters = NWParameters.tcp
        parameters.requiredInterfaceType = .loopback
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: Self.port)!)
        // Do not reuse another process's listener or load its page if the port is occupied.
        let server = try NWListener(using: parameters)
        listener = server
        server.stateUpdateHandler = { state in
            switch state {
            case .ready: DispatchQueue.main.async { ready(.success(())) }
            case .failed(let issue): DispatchQueue.main.async { ready(.failure(issue)) }
            default: break
            }
        }
        server.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        server.start(queue: queue)
    }

    private func accept(_ connection: NWConnection) {
        guard requests.count < 48 else { connection.cancel(); return }
        let id = ObjectIdentifier(connection)
        requests[id] = connection
        connection.stateUpdateHandler = { [weak self] state in
            if case .cancelled = state { self?.requests.removeValue(forKey: id) }
        }
        connection.start(queue: queue)
        receive(connection, Data())
        queue.asyncAfter(deadline: .now() + 30) { [weak connection] in connection?.cancel() }
    }

    private func receive(_ connection: NWConnection, _ partial: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, ended, error in
            guard let self, let data, error == nil else { connection.cancel(); return }
            var header = partial
            header.append(data)
            guard header.count <= 16384 else { connection.cancel(); return }
            if let end = header.range(of: Data("\r\n\r\n".utf8)),
               let text = String(data: header[..<end.lowerBound], encoding: .utf8) {
                self.respond(connection, header: text)
            } else if ended { connection.cancel() }
            else { self.receive(connection, header) }
        }
    }

    private func respond(_ connection: NWConnection, header: String) {
        let lines = header.components(separatedBy: "\r\n")
        let request = (lines.first ?? "").split(separator: " ")
        var fields: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let key = line[..<colon].lowercased()
            fields[key] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        let cookies = (fields["cookie"] ?? "").split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }
        guard fields["host"] == Self.authority, cookies.contains("\(Self.cookieName)=\(secret)") else {
            write(connection, status: "403 Forbidden"); return
        }
        guard request.count == 3, request[0] == "GET" || request[0] == "HEAD" else {
            write(connection, status: "405 Method Not Allowed"); return
        }
        let raw = request[1].split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)[0]
        guard let path = String(raw).removingPercentEncoding, path.hasPrefix("/"),
              !path.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              !path.split(separator: "/").contains("..") else {
            write(connection, status: "400 Bad Request"); return
        }
        let file = directory.appendingPathComponent(path == "/" ? "index.html" : String(path.dropFirst()))
            .resolvingSymlinksInPath().standardizedFileURL
        guard file.path.hasPrefix(directory.path + "/"), let data = try? Data(contentsOf: file, options: .mappedIfSafe) else {
            write(connection, status: "404 Not Found"); return
        }
        let mime = Self.mime[file.pathExtension.lowercased()] ?? "application/octet-stream"
        var extra = "Content-Type: \(mime)\r\nAccept-Ranges: bytes\r\n"
        var range = 0..<data.count
        var status = "200 OK"
        if let requested = fields["range"] {
            guard let selected = byteRange(requested, length: data.count) else {
                write(connection, status: "416 Range Not Satisfiable", headers: "Content-Range: bytes */\(data.count)\r\n"); return
            }
            range = selected
            extra += "Content-Range: bytes \(range.lowerBound)-\(range.upperBound - 1)/\(data.count)\r\n"
            status = "206 Partial Content"
        }
        write(connection, status: status, headers: extra, length: range.count,
              body: request[0] == "HEAD" ? nil : data[range])
    }

    private func byteRange(_ text: String, length: Int) -> Range<Int>? {
        guard text.hasPrefix("bytes="), length > 0 else { return nil }
        let parts = text.dropFirst(6).split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        guard parts.count == 2 else { return nil }
        if parts[0].isEmpty {
            guard let suffix = Int(parts[1]), suffix > 0 else { return nil }
            return (length - min(length, suffix))..<length
        }
        guard let start = Int(parts[0]), start >= 0, start < length else { return nil }
        if parts[1].isEmpty { return start..<length }
        guard let last = Int(parts[1]), last >= start else { return nil }
        return start..<(min(last, length - 1) + 1)
    }

    private func write(_ connection: NWConnection, status: String, headers: String = "",
                       length: Int = 0, body: Data? = nil) {
        // The import map and game UI use inline script/style. Only packaged resources
        // and locally generated blobs may be fetched, and frames are disabled.
        let policy = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; " +
            "media-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self' blob: data:; " +
            "object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        let header = "HTTP/1.1 \(status)\r\n\(headers)Content-Length: \(length)\r\n" +
            "Content-Security-Policy: \(policy)\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
        connection.send(content: Data(header.utf8), completion: .contentProcessed { issue in
            guard issue == nil, let body, !body.isEmpty else { connection.cancel(); return }
            connection.send(content: body, completion: .contentProcessed { _ in connection.cancel() })
        })
    }

    private static let mime = ["html": "text/html; charset=utf-8", "js": "text/javascript", "mjs": "text/javascript",
        "css": "text/css", "json": "application/json", "webmanifest": "application/manifest+json",
        "webp": "image/webp", "png": "image/png", "svg": "image/svg+xml", "jpg": "image/jpeg",
        "woff2": "font/woff2", "ttf": "font/ttf", "mp3": "audio/mpeg", "glb": "model/gltf-binary",
        "gz": "application/gzip", "wasm": "application/wasm", "txt": "text/plain", "md": "text/plain"]
}
