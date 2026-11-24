import Foundation

/// Where the multiplayer server is, from what the player types. The web reaches it through Vite's
/// `/ws` proxy on the page's own host; the app may go there too (the address friends open in the
/// browser, e.g. `http://100.64.0.7:5173`) or straight to the server (`npm run server`, port 8787).
public enum ServerAddress {
    /// The server's own port (`01_packages/server/src/main.ts`).
    public static let serverPort = 8787
    /// The socket's path, on the server and through Vite's proxy.
    public static let path = "/ws"
    /// Nothing typed: the server on this Mac.
    public static let local = "localhost"

    /// The socket's URL for `input`: a host (`localhost`, `100.64.0.7`, a Tailscale name) goes to
    /// the server's port; `host:port` to that port; a URL keeps its host and port, `http(s)` becomes
    /// `ws(s)`, and `/ws` is added when it has no path. nil when it can't be an address.
    public static func url(_ input: String) -> URL? {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let withScheme = text.isEmpty ? "ws://\(local)" : text.contains("://") ? text : "ws://\(text)"
        guard var parts = URLComponents(string: withScheme), let host = parts.host, !host.isEmpty else {
            return nil
        }
        switch parts.scheme?.lowercased() {
        case "ws", "http": parts.scheme = "ws"
        case "wss", "https": parts.scheme = "wss"
        default: return nil
        }
        if !text.contains("://"), parts.port == nil { parts.port = serverPort }
        if parts.path.isEmpty || parts.path == "/" { parts.path = path }
        parts.query = nil
        parts.fragment = nil
        return parts.url
    }
}
