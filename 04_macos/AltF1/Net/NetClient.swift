import AltF1Core
import Foundation

/// The app's end of the multiplayer socket (the web's `multiplayer/NetClient.ts`): typed messages
/// in and out over one WebSocket to the same server as the web. See 01_docs/macos.md#online-x7.
final class NetClient {
    enum ConnectError: Error {
        /// No answer in `connectTimeout`.
        case timeout
        /// Refused or unreachable: the system's reason, if it gave one.
        case unreachable(String?)
    }

    /// Give up connecting after this long (the web's `CONNECT_TIMEOUT_MS`).
    static let connectTimeout: Duration = .seconds(5)

    /// Every message from the server, in order, on the main actor.
    var onMessage: (ServerMessage) -> Void = { _ in }
    /// An open connection ended (server stopped, network lost, rejected); not called by `close`.
    var onClose: () -> Void = {}

    private var task: URLSessionWebSocketTask?
    private var receiving: Task<Void, Never>?

    /// Opens the socket: returns once the server answers, throws if it can't be reached in time.
    func connect(to url: URL) async throws {
        close()
        let task = URLSession.shared.webSocketTask(with: url)
        // A snapshot is ~0.3 KB (2.6b) but a welcome carries every record board.
        task.maximumMessageSize = 4 << 20
        task.resume()
        do {
            try await Self.opened(task)
        } catch {
            #if DEBUG
                NSLog("%@", "NetClient: could not open \(url): \(error) — task error: \(String(describing: task.error))")
            #endif
            task.cancel(with: .goingAway, reason: nil)
            throw error
        }
        self.task = task
        receiving = Task { await self.receive(from: task) }
    }

    func send(_ message: ClientMessage) {
        task?.send(.string(message.encoded())) { _ in }
    }

    /// Ends the connection on purpose (`onClose` is not called).
    func close() {
        receiving?.cancel()
        receiving = nil
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
    }

    private func receive(from task: URLSessionWebSocketTask) async {
        while !Task.isCancelled {
            let frame: URLSessionWebSocketTask.Message
            do {
                frame = try await task.receive()
            } catch {
                break
            }
            let raw: String? =
                switch frame {
                case .string(let text): text
                case .data(let data): String(data: data, encoding: .utf8)
                @unknown default: nil
                }
            if let raw, let message = ServerMessage.parse(raw) { onMessage(message) }
        }
        guard self.task === task else { return }  // closed or replaced on purpose
        self.task = nil
        receiving = nil
        onClose()
    }

    /// The socket is open once the server answers a WebSocket ping; a timeout or a refused
    /// connection throws.
    private static func opened(_ task: URLSessionWebSocketTask) async throws {
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
                    task.sendPing { error in
                        #if DEBUG
                            if let error { NSLog("%@", "NetClient: ping failed: \(error)") }
                        #endif
                        if let error {
                            done.resume(throwing: ConnectError.unreachable(error.localizedDescription))
                        } else {
                            done.resume()
                        }
                    }
                }
            }
            group.addTask {
                try await Task.sleep(for: connectTimeout)
                throw ConnectError.timeout
            }
            defer { group.cancelAll() }
            try await group.next()
        }
    }
}
