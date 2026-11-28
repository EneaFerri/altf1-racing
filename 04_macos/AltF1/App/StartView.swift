import AltF1Core
import SwiftUI

/// The single-player modes, as named in the web menus (`singleplayer/start.ts`).
enum SinglePlayerMode: String, Hashable, CaseIterable {
    case grandPrix = "Grand Prix"
    case timeTrial = "Time trial"
    case test = "Test"

    var detail: String {
        switch self {
        case .grandPrix: "your team · 9 bots"
        case .timeTrial: "ghost · own records"
        case .test: "bot · telemetry · tuning"
        }
    }
}

/// Where the player is in the start menus.
private enum Screen: Hashable {
    case mode
    case singleplayer
    case track(SinglePlayerMode)
    case race(SinglePlayerMode, CircuitEntry)
    /// The Grand Prix: team → circuit → (where it may rain) weather → the GP.
    case team
    case gpTrack(TeamId)
    case gpWeather(TeamId, CircuitEntry)
    case grandPrix(TeamId, CircuitEntry, Weather)
    /// Multiplayer: nickname → mode → circuit → the room; a problem sends back to the start.
    case nickname
    case onlineMode
    case onlineTrack(OnlineMode)
    case room(OnlineMode, String)
    case lobbyProblem(label: String, LobbyProblem)
}

private enum GameMode: Hashable {
    case singleplayer, multiplayer
}

private let back = "W/S · Enter — Esc: back"

/// The start flow (the web's `singleplayer/start.ts`): mode → single-player mode → (Grand Prix: team)
/// → circuit → (Grand Prix, where it may rain: weather) → the session; and multiplayer's
/// (`multiplayer/start.ts`): nickname → mode → circuit → the online race.
struct StartView: View {
    @State private var screen = Screen.mode
    @State private var circuits: [CircuitEntry] = []
    @State private var lobby = Lobby()
    /// The selected circuit of the online track menu, for its record board.
    @State private var recordsTrack: String?

    var body: some View {
        ZStack {
            MenuBackdrop()
            content
                .id(screen)
                .transition(.blurReplace)
        }
        .animation(.smooth(duration: 0.35), value: screen)
        // From the mode menu on, a lost connection shows the DISCONNECTED screen.
        .onChange(of: lobby.disconnected) { _, lost in
            if lost { screen = .lobbyProblem(label: "DISCONNECTED", .disconnected) }
        }
        .task {
            circuits = (try? CircuitCatalog.entries()) ?? []
            #if DEBUG
                if let online = DevOptions.online {
                    let problem = await lobby.join(address: online.address, nickname: online.nickname)
                    NSLog("%@", "online: join \(problem.map { "\($0)" } ?? "welcomed") · rooms \(lobby.rooms.count)")
                    if problem == nil, await lobby.enter(online.mode, online.track) {
                        NSLog("%@", "online: entered \(online.track) with \(lobby.players.map(\.nickname))")
                        screen = .room(online.mode, online.track)
                    } else {
                        NSLog("%@", "online: could not join or enter (\(String(describing: problem)))")
                    }
                    return
                }
                if let id = DevOptions.startCircuit, let circuit = circuits.first(where: { $0.id == id }) {
                    screen =
                        DevOptions.mode == .grandPrix
                        ? .grandPrix(DevOptions.team, circuit, DevOptions.weather) : .race(DevOptions.mode, circuit)
                }
            #endif
        }
    }

    @ViewBuilder private var content: some View {
        switch screen {
        case .mode:
            ListMenu(
                label: "MODE",
                items: [
                    ListMenuItem(name: "Singleplayer", detail: "tracks · bot", value: GameMode.singleplayer),
                    ListMenuItem(name: "Multiplayer", detail: "online lobby", value: GameMode.multiplayer),
                ],
                hint: "W/S · Enter"
            ) { screen = $0 == .singleplayer ? .singleplayer : .nickname }
        case .singleplayer:
            ListMenu(
                label: "SINGLEPLAYER · MODE",
                items: SinglePlayerMode.allCases.map {
                    ListMenuItem(name: $0.rawValue, detail: $0.detail, value: $0)
                },
                hint: back,
                back: { screen = .mode }
            ) { screen = $0 == .grandPrix ? .team : .track($0) }
        case .track(let mode):
            ListMenu(
                label: "\(mode.rawValue.uppercased()) · TRACK",
                items: circuits.map { ListMenuItem(name: $0.name, detail: detail(of: $0, in: mode), value: $0) },
                hint: back,
                back: { screen = .singleplayer }
            ) { screen = .race(mode, $0) }
        case .race(let mode, let circuit):
            RaceScreen(circuit: circuit, mode: mode) { screen = .track(mode) }
        case .team:
            ListMenu(
                label: "GRAND PRIX · TEAM",
                items: Teams.all.map { ListMenuItem(name: $0.name, detail: $0.drivers.joined(separator: " · "), value: $0.id) },
                hint: "\(back) — you take the seat of one of its drivers",
                back: { screen = .singleplayer }
            ) { screen = .gpTrack($0) }
        case .gpTrack(let team):
            ListMenu(
                label: "GRAND PRIX · TRACK",
                items: circuits.map { ListMenuItem(name: $0.name, detail: Format.length($0.length), value: $0) },
                hint: back,
                back: { screen = .team }
            ) { circuit in
                screen = Weather.offersRain(circuit.name) ? .gpWeather(team, circuit) : .grandPrix(team, circuit, .dry)
            }
        case .gpWeather(let team, let circuit):
            ListMenu(
                label: "GRAND PRIX · WEATHER",
                items: [
                    ListMenuItem(name: "Dry", detail: "a dry track", value: Weather.dry),
                    ListMenuItem(name: "Rain", detail: "wet track, puddles", value: Weather.rain),
                    ListMenuItem(
                        name: "Variable", detail: "it may start dry and rain, or start wet and dry", value: Weather.variable),
                ],
                hint: back,
                back: { screen = .gpTrack(team) }
            ) { screen = .grandPrix(team, circuit, $0) }
        case .grandPrix(let team, let circuit, let weather):
            GrandPrixScreen(circuit: circuit, team: team, weather: weather) { screen = .gpTrack(team) }
        case .nickname:
            NicknameView(lobby: lobby, joined: { screen = .onlineMode }, back: { screen = .mode })
        case .onlineMode:
            ListMenu(
                label: "MULTIPLAYER · MODE",
                items: LobbyText.modeItems(lobby.rooms),
                hint: "W/S · Enter — Esc: back to the start",
                back: leaveServer
            ) { screen = .onlineTrack($0) }
        case .onlineTrack(let mode):
            ListMenu(
                label: "\(LobbyText.modeName(mode).uppercased()) · TRACK",
                items: LobbyText.trackItems(mode, lobby.rooms, known: Set(circuits.map(\.name))),
                hint: "W/S · Enter — Esc: back to the start",
                back: leaveServer,
                content: OnlineMode.recordModes.contains(mode) ? AnyView(records(mode)) : nil,
                onSelect: { recordsTrack = $0 }
            ) { track in
                Task {
                    let entered = await lobby.enter(mode, track)
                    if !lobby.disconnected {
                        screen = entered ? .room(mode, track) : .lobbyProblem(label: "GRAND PRIX", .inProgress)
                    }
                }
            }
        case .room(let mode, let track):
            if let circuit = circuits.first(where: { $0.name == track }) {
                OnlineScreen(lobby: lobby, mode: mode, circuit: circuit, exit: leaveServer)
            }
        case .lobbyProblem(let label, let problem):
            ListMenu(
                label: label,
                items: [ListMenuItem(name: "Back to the start", detail: LobbyText.problem(problem), value: 0)],
                hint: "Enter / Esc",
                back: leaveServer
            ) { _ in leaveServer() }
        }
    }

    /// The record board of the online track menu's selected circuit (TOP 10).
    private func records(_ mode: OnlineMode) -> some View {
        let track = recordsTrack ?? ""
        return RecordTableView(
            title: "\(track.uppercased()) · TOP \(NetProtocol.recordsPerTrack)",
            rows: LobbyText.recordRows(lobby.records, mode, track, nickname: lobby.nickname))
    }

    /// Leaves the server, back to the start menu.
    private func leaveServer() {
        lobby.leave()
        screen = .mode
    }

    /// A circuit's row detail: Time trial's own record on it, else its length (as on the web).
    private func detail(of circuit: CircuitEntry, in mode: SinglePlayerMode) -> String {
        guard mode == .timeTrial else { return Format.length(circuit.length) }
        return LocalRecords().best(circuit.name).map { "best \(Format.lapTime($0))" } ?? "no record yet"
    }
}
