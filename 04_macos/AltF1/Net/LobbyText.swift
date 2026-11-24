import AltF1Core
import Foundation

/// Why the lobby can't go on: the server's reasons plus what can go wrong on the way to it, and a
/// circuit whose Grand Prix has started (the web's `LobbyProblem`).
enum LobbyProblem: Hashable {
    case rejected(RejectReason)
    /// The system's reason, when it gave one (shown after the text).
    case unreachable(String?)
    case disconnected
    case inProgress
}

/// The online menus' texts and rows, as on the web (`multiplayer/lobbyText.ts`, `recordsText.ts`).
enum LobbyText {
    /// Hint under the nickname field while typing.
    static func nicknameProblem(_ problem: Nickname.Problem) -> String {
        switch problem {
        case .tooShort: "At least \(Nickname.minLength) characters"
        case .tooLong: "At most \(Nickname.maxLength) characters"
        case .badChars: "Only letters, digits, space, _ and -"
        }
    }

    /// Message shown when joining fails or the connection ends.
    static func problem(_ problem: LobbyProblem) -> String {
        switch problem {
        case .rejected(.taken): "Nickname already in use — pick another one"
        case .rejected(.invalid): "Nickname not allowed"
        case .rejected(.full): "Server full (\(NetProtocol.maxPlayers) players) — try again later"
        case .rejected(.version): "This app is out of date — update it"
        case .unreachable(let reason):
            "Server unreachable — is it running? (npm run server)" + (reason.map { " — \($0)" } ?? "")
        case .disconnected: "Disconnected from the server"
        case .inProgress: "A Grand Prix is in progress on this circuit — try another one"
        }
    }

    /// Shown in place of the record rows when a board is still empty.
    static let noRecords = "No times yet — set the first one"

    static func modeName(_ mode: OnlineMode) -> String {
        switch mode {
        case .practice: "Free practice"
        case .grandPrix: "Grand Prix"
        }
    }

    /// The mode menu's rows, every mode in order: the ones the server offers rooms for with how
    /// many are playing, the others disabled as work in progress.
    static func modeItems(_ rooms: [RoomInfo]) -> [ListMenuItem<OnlineMode>] {
        OnlineMode.allCases.map { mode in
            let offered = rooms.filter { $0.mode == mode }
            let players = offered.reduce(0) { $0 + $1.players }
            return ListMenuItem(
                name: modeName(mode),
                detail: offered.isEmpty ? "Work in progress" : players == 0 ? "empty" : "\(players) online",
                value: mode,
                disabled: offered.isEmpty)
        }
    }

    /// The track menu's rows for `mode`: the circuits this app knows, with who is on each.
    static func trackItems(_ mode: OnlineMode, _ rooms: [RoomInfo], known: Set<String>) -> [ListMenuItem<String>] {
        rooms.filter { $0.mode == mode && known.contains($0.track) }.map { room in
            ListMenuItem(
                name: room.track,
                detail: room.status == .running ? "GP in progress" : room.players == 0 ? "empty" : "\(room.players) online",
                value: room.track,
                disabled: room.status == .running)
        }
    }

    /// One row of a lap-record board.
    struct RecordRow: Hashable {
        let position: String
        let nickname: String
        let time: String
        /// The day it was set (UTC).
        let date: String
        /// The player's own record.
        let own: Bool
    }

    /// The board of `mode` on `track` (fastest first), `nickname`'s own row (any case) marked.
    static func recordRows(_ boards: [RecordBoard], _ mode: OnlineMode, _ track: String, nickname: String) -> [RecordRow] {
        let own = Nickname.key(nickname)
        let board = boards.first { $0.mode == mode && $0.track == track }?.records ?? []
        return board.enumerated().map { index, record in
            RecordRow(
                position: String(index + 1),
                nickname: record.nickname,
                time: Format.lapTime(record.ticks),
                date: String(record.setAt.prefix(10)),
                own: Nickname.key(record.nickname) == own)
        }
    }
}
