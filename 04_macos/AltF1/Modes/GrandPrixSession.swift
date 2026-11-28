import AltF1Core
import Foundation
import Observation

/// Single player's Grand Prix (the web's `SinglePlayerGrandPrix`): the player in the team they
/// chose against 9 bots, the same rules as online (`GrandPrix` on an `OfflineRoom`): qualifying
/// (the player alone, 3 timed laps; the bots' times measured for their class), the grid with the
/// race distance (1/2/3, or 4 + ←/→ + Enter), the F1 start, the race with damage, mandatory stops
/// and the chosen weather, then the results. The player is the only manager.
@MainActor
@Observable
final class GrandPrixSession: RaceSession {
    static let playerId = Seat.playerId
    /// The bots' qualifying times spread up to this share above their class's lap.
    private static let qualifyingSpread = 0.01

    let circuit: CircuitEntry
    let seats: [Seat]
    let weather: Weather
    @ObservationIgnored let room: OfflineRoom
    @ObservationIgnored let keyboard = Keyboard()
    @ObservationIgnored private let squad: BotSquad
    /// Each class's flying lap by the wetness qualifying is run in (to the quarter).
    @ObservationIgnored private let classLaps: [Double: [BotLevel: Int]]
    @ObservationIgnored private var grandPrix: GrandPrix!
    @ObservationIgnored private var loop = GameLoop()
    @ObservationIgnored private(set) var previous: GameState
    @ObservationIgnored private(set) var lastInput = InputCommand.neutral
    @ObservationIgnored private let liveries: [CarId: Livery]

    /// The Grand Prix as shown: updated whenever it changes.
    /// Crashes' debris and yellow flags (R.2), as the Grand Prix has them.
    var yellowFlags: [YellowFlag] { info.yellowFlags }
    private(set) var info: GrandPrixInfo
    /// The race distance being chosen on the grid with key 4 (nil = not opened).
    private(set) var customLaps: Int?
    /// Who is in the pit lane: `PIT`, or `BOX` while stopped.
    private(set) var pits: [CarId: String] = [:]
    /// Red lights on (0..5).
    private(set) var lights = 0
    private(set) var speedKmh = 0
    /// The race is over and its result shown (the podium, the cards): the GP keys do nothing.
    private(set) var onResults = false

    /// The results' cards, in order.
    enum ResultsCard { case podium, classification, constructors }
    /// The card on show while `onResults`.
    private(set) var resultsCard = ResultsCard.podium
    /// The timing strip, told how to name the lap and the session's bests as the GP moves on.
    @ObservationIgnored weak var hud: TimingHud? {
        didSet { showOnHud() }
    }

    var track: Track { room.track }
    var current: GameState { room.state }
    var wetness: Double { trackWetness(room.sim.weather, room.state.tick) }
    var mayRain: Bool { weather != .dry }
    var ownPitBox: Int? { teamBoxes(seats)[Self.playerId] }
    var playerTeam: TeamId { seats.first { $0.kind == .player }!.team }

    /// Sets up the GP: the line-up, the room, the bots' qualifying laps measured for their class in
    /// every wetness this weather may start at, to the quarter (the slow part, in parallel: it is pure).
    static func prepare(circuit: CircuitEntry, team: TeamId, weather: Weather) async throws -> GrandPrixSession {
        let definition = try CircuitCatalog.definition(circuit.id)
        let seats = teamLineup(team, random: { Double.random(in: 0..<1) })
        var params: [CarId: CarParams] = [:]
        for seat in seats { if case .bot(let level) = seat.kind { params[seat.id] = botCarParams(.baseline, .baseline(level)) } }
        let room = try OfflineRoom(definition: definition, carParamsById: params, boxes: teamBoxes(seats))
        let starts: [Double] =
            switch weather {
            case .dry: [0]
            case .rain: [1]
            case .variable: [0, 0.5, 0.75, 1]
            }
        let sim = room.sim
        let track = room.track
        let classLaps = await withTaskGroup(of: (Double, BotLevel, Int).self) { group in
            for wetness in starts {
                for level in [BotLevel.hard, .medium] {
                    group.addTask {
                        var wet = sim
                        wet.weather =
                            wetness > 0
                            ? WetTrack(puddles: placePuddles(track), forecast: [ForecastPoint(tick: 0, wetness: wetness)]) : nil
                        return (wetness, level, botLapTicks(wet, level) ?? 6000)
                    }
                }
            }
            var laps: [Double: [BotLevel: Int]] = [:]
            for await (wetness, level, ticks) in group { laps[wetness, default: [:]][level] = ticks }
            return laps
        }
        return GrandPrixSession(circuit: circuit, seats: seats, weather: weather, room: room, classLaps: classLaps)
    }

    private init(
        circuit: CircuitEntry, seats: [Seat], weather: Weather, room: OfflineRoom, classLaps: [Double: [BotLevel: Int]]
    ) {
        self.circuit = circuit
        self.seats = seats
        self.weather = weather
        self.room = room
        self.classLaps = classLaps
        squad = BotSquad(track: room.track, bots: squadBots(seats))
        liveries = Dictionary(uniqueKeysWithValues: seats.map { ($0.id, Livery.team($0.team)) })
        previous = room.state
        info = GrandPrix(room: room).info
        newGrandPrix()
    }

    func livery(_ id: CarId) -> Livery { liveries[id] ?? .grey }

    private func showOnHud() {
        hud?.lapNamer = GrandPrixText.lapName(info)
        hud?.sessionBests = info.sectorBests
    }

    func name(_ id: CarId) -> String { seats.first { $0.id == id }?.name ?? id }

    /// The car the camera follows: the player's; off the track (their qualifying or race done),
    /// the best placed car still on it.
    var followed: CarId {
        let state = room.state
        if state.car(Self.playerId) != nil { return Self.playerId }
        let order = info.race.isEmpty ? info.qualifying.map(\.id) : info.race.map(\.id)
        return order.first { state.car($0) != nil } ?? state.cars.first?.id ?? Self.playerId
    }

    /// A Grand Prix from the start: the bots' qualifying given, the player out on track to qualify.
    func newGrandPrix() {
        room.hold = nil
        let gp = GrandPrix(room: room)
        gp.add(Self.playerId, name: seats.first { $0.kind == .player }!.name)
        grandPrix = gp
        // The weather first (a variable one draws its turn): the bots' qualifying is in it.
        if weather != .dry { command(.weather(weather)) }
        let start = wetnessAt(room.forecast, 0)
        let nearest = classLaps.keys.min { abs($0 - start) < abs($1 - start) } ?? 0
        let laps = classLaps[nearest] ?? [:]
        for seat in seats {
            guard case .bot(let level) = seat.kind else { continue }
            let lap = Double(laps[level] ?? 6000)
            gp.addSimulated(seat.id, name: seat.name, best: Int(jsRound(lap * (1 + Double.random(in: 0..<1) * Self.qualifyingSpread))))
        }
        squad.setRace(nil)
        command(.start)
        previous = room.state
    }

    /// The player's command to the Grand Prix (always the manager here).
    func command(_ command: GrandPrixCommand) {
        if grandPrix.command(Self.playerId, command) { update() }
    }

    /// Enter (or the button) on the results: the next card, and from the last one a new GP.
    func nextResultsCard() {
        switch resultsCard {
        case .podium: resultsCard = .classification
        case .classification: resultsCard = .constructors
        case .constructors: newGrandPrix()
        }
    }

    /// A GP key: Enter moves it on (end qualifying, start over the chosen distance, end the race);
    /// 1–3 start the race over a preset distance; 4 opens any other, ←/→ change it.
    func handle(_ action: RaceAction) {
        guard !onResults else { return }
        switch (action, info.phase) {
        case (.confirm, .qualifying): command(.endQualifying)
        case (.confirm, .grid): if let customLaps { command(.startRace(laps: customLaps)) }
        case (.confirm, .race): command(.endRace)
        case (.choice(let n), .grid) where n <= GrandPrixRules.raceLaps.count:
            command(.startRace(laps: GrandPrixRules.raceLaps[n - 1]))
        case (.choice(4), .grid): customLaps = customLaps ?? GrandPrixRules.customLapsStart
        // On track, stopped in the box: 1 softs, 2 mediums, 3 intermediates, 4 full wets.
        case (.choice(let n), .qualifying), (.choice(let n), .race):
            if (1...4).contains(n) { keyboard.chooseCompound(TyreCompound.allCases[n - 1]) }
        case (.lapsDown, .grid): customLaps = customLaps.map { max(GrandPrixRules.customLapsMin, $0 - 1) }
        case (.lapsUp, .grid): customLaps = customLaps.map { min(GrandPrixRules.customLapsMax, $0 + 1) }
        default: break
        }
    }

    func advance(_ frameSeconds: Double) -> (alpha: Double, seconds: Double) {
        let result = loop.advance(frameSeconds) { tick() }
        let state = room.state
        speedKmh = state.car(Self.playerId).map { Int(($0.velocity.length * 3.6).rounded()) } ?? 0
        let on = lightsOn(state.tick, room.hold)
        if on != lights { lights = on }
        var now: [CarId: String] = [:]
        for car in state.cars {
            if let status = pitStatus(track, car, state.tick) { now[car.id] = status.stopLeft != nil ? "BOX" : "PIT" }
        }
        if now != pits { pits = now }
        return result
    }

    /// One fixed tick: the player's and the bots' inputs move the race, then the GP reads it.
    private func tick() {
        var inputs = squad.inputs(room.state, held: room.held, weather: room.sim.weather, tyres: room.sim.tyres)
        var input = keyboard.sample()
        #if DEBUG
            if DevOptions.autopilot, let car = room.state.car(Self.playerId) { input = DevOptions.drive(car, track) }
        #endif
        lastInput = input
        inputs[Self.playerId] = input
        previous = room.state
        room.step(inputs)
        if grandPrix.afterTick() { update() }
    }

    /// The Grand Prix changed: everything that shows it follows.
    private func update() {
        let before = info.phase
        info = grandPrix.info
        if info.phase == .race && before != .race { squad.setRace(info.raceLaps) }
        if info.phase != .grid { customLaps = nil }
        if info.phase == .results && !onResults { resultsCard = .podium }
        onResults = info.phase == .results
        showOnHud()
        // Cars moved to the grid: no blending across the map.
        if info.phase != before { previous = room.state }
    }
}
