import AltF1Core
import Foundation
import Observation

/// An online race on this Mac (the web's `OnlineGame` and `OnlineGrandPrix`): sends this player's
/// numbered input every tick and draws the room as predicted from the server's snapshots
/// (`Predictor`), so the own car responds at once. In a Grand Prix: the panel and the start lights,
/// the manager's keys (Enter: start / end qualifying / end the race; on the grid 1–3: 4 / 8 / 12
/// laps, 4 + ←/→ any other; in the lobby of a track with rain 1/2: dry / rain), the tyres in the
/// box (1 / 2), which car to watch while the own one is off the track, the results.
/// See 01_docs/macos.md#online-x7.
@MainActor
@Observable
final class OnlineSession: RaceSession {
    /// A `ping` goes out every this many ticks (once a second).
    private static let pingEveryTicks = tickRate

    let playerId: CarId
    let mode: OnlineMode
    let track: Track
    @ObservationIgnored let keyboard = Keyboard()
    @ObservationIgnored private let lobby: Lobby
    @ObservationIgnored private let predictor: Predictor
    @ObservationIgnored private var loop = GameLoop()
    @ObservationIgnored private(set) var lastInput = InputCommand.neutral
    /// `seq` of the next input sent; one per tick.
    @ObservationIgnored private var nextSeq = 0
    /// Nothing drawn before the first snapshot.
    @ObservationIgnored private static let empty = GameState(tick: 0, cars: [], impacts: [], laps: [])

    /// Everyone in the room: nickname and livery index.
    private(set) var players: [PlayerInfo]
    /// The Grand Prix as last told by the server (nil outside one).
    private(set) var info: GrandPrixInfo?
    /// The manager's own race distance on the grid (key 4, then ←/→); nil = not chosen.
    private(set) var customLaps: Int?
    /// Who is in the pit lane: `PIT`, or `BOX` while stopped.
    private(set) var pits: [CarId: String] = [:]
    /// Red lights on (0..5).
    private(set) var lights = 0
    private(set) var speedKmh = 0
    /// The race this player drove just ended: the results are on screen until Enter (play again).
    private(set) var onResults = false
    /// The race shown on the results (frozen as it ended).
    private(set) var results: [RaceStanding] = []
    private(set) var resultsLaps = 0
    /// Last measured round trip (ms); nil before the first pong.
    private(set) var rttMs: Double?

    /// The timing strip, told how to name the lap and the session's bests as the GP moves on.
    @ObservationIgnored weak var hud: TimingHud? {
        didSet { showOnHud() }
    }

    init(lobby: Lobby, playerId: CarId, mode: OnlineMode, definition: TrackDefinition) throws {
        self.lobby = lobby
        self.playerId = playerId
        self.mode = mode
        // Only the Grand Prix drives the pit lane, like the server's room.
        track = try buildTrack(definition, pitLane: mode == .grandPrix)
        predictor = Predictor(playerId: playerId, track: track)
        players = lobby.players
        if let info = lobby.grandPrix { show(info) }
        lobby.onRaceMessage = { [weak self] message in self?.receive(message) }
    }

    var previous: GameState { predictor.before ?? Self.empty }
    var current: GameState { predictor.current ?? Self.empty }
    var ownPitBox: Int? { info?.boxes[playerId] }

    func livery(_ id: CarId) -> Livery {
        players.first { $0.id == id }.map { Livery.online($0.livery) } ?? .grey
    }

    func name(_ id: CarId) -> String { players.first { $0.id == id }?.nickname ?? id }

    /// Whether this circuit's Grand Prix may be run in the rain (the manager's 1/2 in the lobby).
    var canRain: Bool { Weather.offersRain(track.name) }

    var isManager: Bool { info?.manager == playerId }

    /// The car to watch: the own one; off the track (a GP driver who is done), the best placed one
    /// still on it (race order in the race, else qualifying order).
    var followed: CarId {
        let state = current
        if state.car(playerId) != nil { return playerId }
        let order = (info?.race.isEmpty ?? true) ? (info?.qualifying.map(\.id) ?? []) : info!.race.map(\.id)
        return order.first { state.car($0) != nil } ?? state.cars.first?.id ?? playerId
    }

    func advance(_ frameSeconds: Double) -> (alpha: Double, seconds: Double) {
        let result = loop.advance(frameSeconds) { tick() }
        predictor.decay(result.seconds)
        let state = current
        speedKmh = state.car(playerId).map { Int(($0.velocity.length * 3.6).rounded()) } ?? 0
        let on = lightsOn(state.tick, info?.hold)
        if on != lights { lights = on }
        if mode == .grandPrix {
            var now: [CarId: String] = [:]
            for car in state.cars {
                if let status = pitStatus(track, car, state.tick) { now[car.id] = status.stopLeft != nil ? "BOX" : "PIT" }
            }
            if now != pits { pits = now }
        }
        return result
    }

    /// One fixed tick: this player's numbered input goes to the server (R rides along as `reset`)
    /// and moves the predicted world.
    private func tick() {
        lastInput = keyboard.sample()
        #if DEBUG
            if DevOptions.autopilot, let car = current.car(playerId) { lastInput = DevOptions.drive(car, track) }
        #endif
        if nextSeq % Self.pingEveryTicks == 0 {
            lobby.send(.ping(t: ProcessInfo.processInfo.systemUptime * 1000))
        }
        lobby.send(.input(seq: nextSeq, input: lastInput))
        predictor.step(nextSeq, lastInput)
        nextSeq += 1
    }

    private func receive(_ message: ServerMessage) {
        switch message {
        case .snapshot(let state, let acks, let inputs): predictor.reconcile(state: state, acks: acks, inputs: inputs)
        case .players(let players): self.players = players
        case .pong(let t): rttMs = ProcessInfo.processInfo.systemUptime * 1000 - t
        case .grandPrix(let info): show(info)
        default: break
        }
    }

    /// The server's news about the Grand Prix.
    private func show(_ info: GrandPrixInfo) {
        let raceOver = info.phase == .results && self.info?.phase != .results && info.drivers.contains(playerId)
        self.info = info
        if !(info.phase == .grid && info.manager == playerId) { customLaps = nil }
        predictor.hold = info.hold
        predictor.setDamage(damageInPhase(info.phase))
        predictor.setPitBoxes(info.boxes)
        predictor.setWeather(info.weather)
        if raceOver {
            results = info.race
            resultsLaps = info.raceLaps ?? 0
            onResults = true
        }
        showOnHud()
    }

    private func showOnHud() {
        guard let info else { return }
        hud?.lapNamer = GrandPrixText.lapName(info, ownId: playerId)
        hud?.sessionBests = info.sectorBests
    }

    /// The panel's content (Grand Prix only).
    var panel: GrandPrixContent? {
        guard let info else { return nil }
        return GrandPrixText.online(
            info, ownId: playerId, names: Dictionary(uniqueKeysWithValues: players.map { ($0.id, $0.nickname) }),
            colors: Dictionary(uniqueKeysWithValues: players.map { ($0.id, Livery.online($0.livery).color) }),
            pits: pits, canRain: canRain, customLaps: customLaps)
    }

    /// Enter on the results: a new lobby on the same circuit (or join the one already there).
    func playAgain() {
        lobby.send(.gp(.playAgain))
        onResults = false
    }

    /// A GP key. The server ignores a command from anyone but the manager, or in the wrong phase.
    func handle(_ action: RaceAction) {
        guard let info, !onResults else { return }
        switch (action, info.phase) {
        case (.confirm, .lobby): command(.start)
        case (.confirm, .qualifying): command(.endQualifying)
        case (.confirm, .grid): if let customLaps { command(.startRace(laps: customLaps)) }
        case (.confirm, .race): command(.endRace)
        case (.choice(let n), .grid) where n <= GrandPrixRules.raceLaps.count:
            command(.startRace(laps: GrandPrixRules.raceLaps[n - 1]))
        case (.choice(4), .grid) where isManager: customLaps = customLaps ?? GrandPrixRules.customLapsStart
        case (.lapsDown, .grid): customLaps = customLaps.map { max(GrandPrixRules.customLapsMin, $0 - 1) }
        case (.lapsUp, .grid): customLaps = customLaps.map { min(GrandPrixRules.customLapsMax, $0 + 1) }
        case (.choice(let n), .lobby) where canRain && n <= 2: command(.weather(n == 1 ? .dry : .rain))
        // On track, stopped in the box: 1 softs, 2 mediums (ignored anywhere else).
        case (.choice(1), .qualifying), (.choice(1), .race): keyboard.chooseCompound(.soft)
        case (.choice(2), .qualifying), (.choice(2), .race): keyboard.chooseCompound(.medium)
        default: break
        }
    }

    private func command(_ command: GrandPrixCommand) {
        if isManager { lobby.send(.gp(command)) }
    }

    /// Leaving the race: the lobby stops forwarding to it.
    func stop() {
        keyboard.stop()
        lobby.onRaceMessage = nil
    }
}
