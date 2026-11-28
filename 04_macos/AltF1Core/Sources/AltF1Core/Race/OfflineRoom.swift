/// The simulation every machine of a Grand Prix runs (`net/simContext.ts`): damage in qualifying
/// and the race, the pit rules with each driver's box, the chosen weather (its forecast: a wet
/// track, with its puddles, as wet as it says when).
public func onlineSimContext(
    _ track: Track, damage: Bool = false, pitBoxes: [CarId: Int] = [:], forecast: Forecast = dryForecast
) -> SimContext {
    SimContext(
        track: track,
        damage: damage ? .baseline : nil,
        pit: track.routes.contains(where: \.pit) ? PitRules(boxes: pitBoxes) : nil,
        weather: everWet(forecast) ? WetTrack(puddles: placePuddles(track), forecast: forecast) : nil,
        tyres: track.routes.contains(where: \.pit) ? .baseline : nil)
}

/// Single player's Grand Prix room (`race/OfflineRoom.ts`): the race on this Mac, the track with its
/// pit lane, the bots' cars and the teams' fixed boxes. Pure (no clock).
public final class OfflineRoom: GrandPrixRoom {
    public let trackName: String
    public let track: Track
    public var hold: StartHold?
    public private(set) var state: GameState
    /// How wet the track is when.
    public private(set) var forecast = dryForecast
    /// What the simulation runs with now.
    public private(set) var sim: SimContext
    private var damage = false
    private let carParamsById: [CarId: CarParams]
    private let boxes: [CarId: Int]

    public init(definition: TrackDefinition, carParamsById: [CarId: CarParams], boxes: [CarId: Int]) throws {
        trackName = definition.name
        track = try buildTrack(definition, pitLane: true)
        self.carParamsById = carParamsById
        self.boxes = boxes
        state = createGame(track, [])
        sim = SimContext(track: track)
        sim = context()
    }

    public func setDamage(_ on: Bool) {
        guard on != damage else { return }
        damage = on
        sim = context()
        if !on { state = repairCars(state) }
    }

    /// Single player's boxes are the teams': the Grand Prix's numbering is ignored.
    public func setPitBoxes(_ boxes: [CarId: Int]) {}

    public func setWeather(_ forecast: Forecast) {
        guard forecast != self.forecast else { return }
        self.forecast = forecast
        sim = context()
    }

    /// On a wet track the cars start on the tyres it asks for (`startingTyres`).
    public func restart(_ order: [CarId]) {
        let tick = state.tick
        state = createGame(track, order, tyres: startingTyres(sim.weather, sim.tyres, tick))
        state.tick = tick
    }

    public func retire(_ id: CarId) { state = removeCar(state, id) }

    public func spawn(_ id: CarId) { state = spawnOnGrid(state, track, id) }

    /// One fixed tick with everyone's inputs (all neutral while the start holds the cars).
    public func step(_ inputs: InputMap) {
        state = stepGame(state, heldInputs(inputs, state.tick, hold), sim)
    }

    /// Whether the start lights still hold the cars at the step from now.
    public var held: Bool {
        guard let hold else { return false }
        return state.tick < hold.until
    }

    private func context() -> SimContext {
        var context = onlineSimContext(track, damage: damage, pitBoxes: boxes, forecast: forecast)
        context.carParamsById = carParamsById
        return context
    }
}
