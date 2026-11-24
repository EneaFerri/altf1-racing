import AltF1Core
import Observation

/// One single-player session on screen (Time trial and Test; the web's `SinglePlayerGame`): the
/// model's state, its fixed-step loop, the player's keyboard; in Time trial the ghost and this
/// Mac's records, in Test the bot (B cycles its level). The view reads the last two states and
/// draws between them.
@MainActor
@Observable
final class DriveSession: RaceSession {
    static let playerId: CarId = "player"
    /// Test's bot opponent.
    static let botId: CarId = "bot"
    /// A bot switched back on appears at rest this far behind the player (m), never on top of them.
    private static let botRespawnDistance: Double = -40

    let circuit: CircuitEntry
    let mode: SinglePlayerMode
    @ObservationIgnored let track: Track
    @ObservationIgnored private(set) var context: SimContext
    @ObservationIgnored private(set) var previous: GameState
    @ObservationIgnored private(set) var current: GameState
    @ObservationIgnored let keyboard = Keyboard()
    @ObservationIgnored private var loop = GameLoop()
    /// The input of the last tick (for the debug overlay).
    @ObservationIgnored private(set) var lastInput = InputCommand.neutral
    /// Time trial only: the own best lap, raced as a see-through car.
    @ObservationIgnored private var ghost: Ghost?
    /// Time trial only: this Mac's best lap per circuit.
    @ObservationIgnored private let records: LocalRecords?
    /// Laps the player had completed after the last tick (to spot a lap just finished).
    @ObservationIgnored private var playerLaps = 0

    /// The player's speed for the HUD (km/h), updated every frame.
    private(set) var speedKmh = 0
    /// Test's bot level; nil = off (always, outside Test).
    private(set) var botLevel: BotLevel?
    @ObservationIgnored private var botMemory = BotMemory.new
    /// The bot's plan for its current level, built once per level.
    @ObservationIgnored private var botPlans: [BotLevel: BotPlan] = [:]

    /// How each car is painted and named.
    func livery(_ id: CarId) -> Livery {
        id == Self.playerId ? .red : id == Self.botId ? .blue : .grey
    }

    init(circuit: CircuitEntry, mode: SinglePlayerMode, records: LocalRecords = LocalRecords()) throws {
        self.circuit = circuit
        self.mode = mode
        track = try buildTrack(CircuitCatalog.definition(circuit.id))
        context = SimContext(track: track)
        botLevel = mode == .test ? .medium : nil
        current = createGame(track, mode == .test ? [Self.playerId, Self.botId] : [Self.playerId])
        previous = current
        ghost = mode == .timeTrial ? Ghost(carId: Self.playerId) : nil
        self.records = mode == .timeTrial ? records : nil
        if let botLevel {
            context.carParamsById = [Self.botId: botCarParams(.baseline, .baseline(botLevel))]
            // Built while the race loads, not on its first tick.
            botPlans[botLevel] = buildBotPlan(track, .baseline, .baseline(botLevel))
        }
    }

    /// Feeds one frame of real time: runs the ticks due, returns how far between the last two ticks
    /// the frame is (0..1) and the clamped frame time.
    func advance(_ frameSeconds: Double) -> (alpha: Double, seconds: Double) {
        let result = loop.advance(frameSeconds) { tick() }
        if let car = current.car(Self.playerId) {
            speedKmh = Int((car.velocity.length * 3.6).rounded())
        }
        return result
    }

    var followed: CarId { Self.playerId }

    /// B: Off → Easy → Medium → Hard → Off. A level change keeps the bot where it is.
    func cycleBot() {
        guard mode == .test else { return }
        let next = BotLevel.next(after: botLevel)
        if botLevel == nil {
            botMemory = .new
            changeCars { placeCar($0, self.track, Self.botId, Self.playerId, Self.botRespawnDistance) }
        } else if next == nil {
            changeCars { removeCar($0, Self.botId) }
        }
        botLevel = next
        if let next { context.carParamsById = [Self.botId: botCarParams(.baseline, .baseline(next))] }
    }

    /// Applies a change of cars to both states, so the view never interpolates a car across the map.
    private func changeCars(_ change: (GameState) -> GameState) {
        current = change(current)
        previous = change(previous)
    }

    /// Time trial: the ghost on the lap's clock, at the same in-between tick as the cars; nil when
    /// there is none to show.
    func ghostPose(alpha: Double) -> CarPose? {
        let tick = Double(previous.tick) + Double(current.tick - previous.tick) * alpha
        guard let frame = ghost?.frame(at: tick) else { return nil }
        return CarPose(frame.before, frame.after, alpha: frame.alpha, track: track)
    }

    private func tick() {
        var input = keyboard.sample()
        #if DEBUG
            if DevOptions.autopilot, let car = current.car(Self.playerId) { input = DevOptions.drive(car, track) }
        #endif
        lastInput = input
        var inputs: InputMap = [Self.playerId: input]
        if let level = botLevel, let bot = current.car(Self.botId) {
            // The bot races the player: it sees the other cars.
            let plan = botPlans[level] ?? buildBotPlan(track, .baseline, .baseline(level))
            botPlans[level] = plan
            let result = botInput(bot, plan, botMemory, current.cars)
            botMemory = result.memory
            inputs[Self.botId] = result.input
        }
        previous = current
        current = stepGame(current, inputs, context)
        ghost?.record(current)
        if records != nil { submitLap() }
    }

    /// Time trial: a valid lap just finished goes to this Mac's records (kept if the best).
    private func submitLap() {
        guard let lap = current.lap(Self.playerId), lap.laps != playerLaps else { return }
        playerLaps = lap.laps
        if let last = lap.lastLap, last.valid { records?.submit(circuit.name, ticks: last.ticks) }
    }
}
