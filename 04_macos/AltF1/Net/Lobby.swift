import AltF1Core
import Foundation
import Observation

/// The player's time on the server (the web's `multiplayer/start.ts`): join with a nickname, then
/// enter one room of a mode and circuit; what the menus show, kept up to date.
@Observable
final class Lobby {
    /// The accepted nickname and the server's welcome; nil until joined.
    private(set) var playerId: CarId?
    private(set) var nickname = ""
    private(set) var rooms: [RoomInfo] = []
    private(set) var records: [RecordBoard] = []
    /// The players in the room entered, live.
    private(set) var players: [PlayerInfo] = []
    /// The connection ended while joined (the server stopped, the network went away).
    private(set) var disconnected = false
    /// The room's Grand Prix as last told (it comes right after `entered`, before the race is on
    /// screen); nil outside a Grand Prix room.
    @ObservationIgnored private(set) var grandPrix: GrandPrixInfo?

    @ObservationIgnored private let client = NetClient()
    @ObservationIgnored private var joining: CheckedContinuation<LobbyProblem?, Never>?
    @ObservationIgnored private var entering: CheckedContinuation<Bool, Never>?
    /// In a room: the race's messages (snapshots, pongs, the Grand Prix), to the race on screen.
    @ObservationIgnored var onRaceMessage: ((ServerMessage) -> Void)?

    init() {
        client.onMessage = { [weak self] in self?.handle($0) }
        client.onClose = { [weak self] in self?.closed() }
    }

    /// Connects to `address` and says hello: nil once welcomed, else why not.
    func join(address: String, nickname raw: String) async -> LobbyProblem? {
        leave()
        guard case .success(let nickname) = Nickname.check(raw) else { return .rejected(.invalid) }
        guard let url = ServerAddress.url(address) else { return .unreachable("not an address") }
        do {
            try await client.connect(to: url)
        } catch NetClient.ConnectError.unreachable(let reason) {
            return .unreachable(reason)
        } catch {
            return .unreachable(nil)
        }
        let problem = await withCheckedContinuation { done in
            joining = done
            client.send(.hello(nickname: nickname))
        }
        if problem == nil { self.nickname = nickname } else { client.close() }
        return problem
    }

    /// Goes into the room of `mode` on `track`: false if refused (its Grand Prix has started).
    func enter(_ mode: OnlineMode, _ track: String) async -> Bool {
        await withCheckedContinuation { done in
            entering = done
            client.send(.enter(mode: mode, track: track))
        }
    }

    /// A message to the server (the race's inputs, pings and the Grand Prix's commands).
    func send(_ message: ClientMessage) {
        client.send(message)
    }

    /// Leaves the server (back to the start menu).
    func leave() {
        onRaceMessage = nil
        client.close()
        finishJoin(.disconnected)
        finishEnter(false)
        playerId = nil
        rooms = []
        records = []
        players = []
        grandPrix = nil
        disconnected = false
    }

    private func handle(_ message: ServerMessage) {
        switch message {
        case .welcome(let id, let rooms, let records):
            playerId = id
            self.rooms = rooms
            self.records = records
            finishJoin(nil)
        case .rejected(let reason):
            finishJoin(.rejected(reason))
        case .entered(_, let players):
            self.players = players
            finishEnter(true)
        case .refused:
            finishEnter(false)
        case .players(let players):
            self.players = players
            onRaceMessage?(message)
        case .grandPrix(let info):
            grandPrix = info
            onRaceMessage?(message)
        default:
            onRaceMessage?(message)
        }
    }

    private func closed() {
        // Rejected connections are closed by the server; the rejection arrived first.
        if joining != nil {
            finishJoin(.disconnected)
            return
        }
        finishEnter(false)
        // Only a joined player was disconnected; a rejected one is told why on the nickname screen.
        if playerId != nil { disconnected = true }
    }

    private func finishJoin(_ problem: LobbyProblem?) {
        joining?.resume(returning: problem)
        joining = nil
    }

    private func finishEnter(_ entered: Bool) {
        entering?.resume(returning: entered)
        entering = nil
    }
}
