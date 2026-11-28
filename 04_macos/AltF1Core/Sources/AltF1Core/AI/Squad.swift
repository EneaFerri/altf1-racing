/// One bot of single player's Grand Prix (`ai/squad.ts`).
public struct SquadBot: Sendable {
    public let id: CarId
    public let level: BotLevel
    /// Its pit box (its team's).
    public let box: Int
    /// Laps its stops come later than the schedule's (the second driver of a team sharing a box).
    public let pitLag: Int

    public init(id: CarId, level: BotLevel, box: Int, pitLag: Int) {
        self.id = id
        self.level = level
        self.box = box
        self.pitLag = pitLag
    }
}

/// A bot's tyres at a stop after `laps` laps (`botCompound`): softs when the stint ahead (to its
/// next scheduled stop, else the flag) ends before they would wear to a puncture, else mediums.
public func botCompound(_ schedule: [Int], stops: Int, laps: Int, raceLaps: Int) -> TyreCompound {
    let next = stops < schedule.count ? schedule[stops] : raceLaps
    let softLaps = TyreParams.baseline.lifeLaps[.soft]! * DamageParams.baseline.punctureWear
    return Double(next - laps) < softLaps ? .soft : .medium
}

/// When single player's GP bots pit for other tyres as the weather turns (`BOT_TYRE_SWITCH`, 2.8).
public enum BotTyreSwitch {
    public static let slickAbove = 0.3
    public static let intermediateAbove = 0.75
    public static let intermediateBelow = 0.05
    public static let wetBelow = 0.4
}

/// Whether `compound` no longer suits a track `wetness` wet (`wrongTyres`).
public func wrongTyres(_ compound: TyreCompound, _ wetness: Double) -> Bool {
    switch compound {
    case .intermediate: wetness > BotTyreSwitch.intermediateAbove || wetness < BotTyreSwitch.intermediateBelow
    case .wet: wetness < BotTyreSwitch.wetBelow
    case .soft, .medium: wetness > BotTyreSwitch.slickAbove
    }
}

/// Single player's GP bots lift off the throttle once their cornering load reaches this share of
/// where the rear breaks loose (`BOT_SLIDE_MARGIN`, 2.8).
public let botSlideMargin = 0.9

/// A bot's `input` on a track `wetness` wet (`wetLift`): off the throttle near `slideFrom`, so it
/// never spins itself round.
public func wetLift(_ car: CarState, _ input: InputCommand, _ wetness: Double, _ tyres: TyreParams?) -> InputCommand {
    guard let tyres, wetness > 0, input.throttle > 0 else { return input }
    let limit = slideFrom(car.tyres?.compound ?? .medium, wetness, tyres)
    let load = abs(car.yawRate + car.spin) * car.velocity.length
    guard load >= limit * botSlideMargin else { return input }
    var lifted = input
    lifted.throttle = 0
    return lifted
}

/// The wet params a bot plans with on `compound` on a track `wetness` wet (`planWet`): for the next
/// quarter of wetness up and the compound's own grip; none on slicks on a dry track; without
/// `tyres`, the rain's own params.
public func planWet(_ compound: TyreCompound, _ wetness: Double, _ weather: WetTrack?, _ tyres: TyreParams?)
    -> (key: String, wet: WetParams?)
{
    let quarter = (wetness * 4).rounded(.up) / 4
    if weather == nil || quarter == 0 {
        if tyres == nil || compound.isSlick { return ("dry", nil) }
    }
    guard let tyres else { return ("rain", weather!.params) }
    let noDrag = WetParams(grip: 1, traction: 1, brake: 1, puddleGrip: 1, puddleTraction: 1, puddleDrag: 0)
    var wet = tyreWetParams(compound, quarter, tyres, weather?.params ?? noDrag)
    wet.grip = wet.grip * tyres.grip[compound]!
    return ("\(compound.isSlick ? "slick" : compound.rawValue):\(quarter)", wet)
}

/// Single player's Grand Prix bots (`BotSquad`): each driven in traffic on its race plan, and through
/// the pit lane to its box when one of its mandatory stops is owed, a tyre is flat or its tyres no
/// longer suit the weather (2.8). Each plan is built the first time a bot needs it: for its level
/// (its box), its tyres and how wet the track is. `track` built with its pit lane.
public final class BotSquad {
    private enum Using { case race, pit }

    private struct Racer {
        let bot: SquadBot
        var using = Using.race
        var memory = BotMemory.new
        var stops = 0
        /// The end tick of its last stop counted.
        var lastStop: Int?
        var schedule: [Int] = []
    }

    private var racers: [Racer]
    private let track: Track
    /// The race's laps; nil in qualifying (no stops).
    private var raceLaps: Int?
    /// Plans built so far, by road, level (and box), tyres and wetness.
    private var plans: [String: BotPlan] = [:]

    public init(track: Track, bots: [SquadBot]) {
        self.track = track
        racers = bots.map { Racer(bot: $0) }
    }

    /// A new race over `raceLaps` laps (nil: qualifying, no stops): stops counted afresh.
    public func setRace(_ raceLaps: Int?) {
        self.raceLaps = raceLaps
        let base = raceLaps.map(pitSchedule) ?? []
        let latest = (raceLaps ?? 0) - 2
        for i in racers.indices {
            let lag = racers[i].bot.pitLag
            // Later by its lag if that is still before the last two laps, else earlier.
            racers[i].schedule = base.map { $0 + lag <= latest ? $0 + lag : max(1, $0 - lag) }
            racers[i].stops = 0
            racers[i].lastStop = nil
            racers[i].using = .race
            racers[i].memory = .new
        }
    }

    /// `bot`'s plan for `using` with `wet` (`key`): built the first time.
    private func plan(_ bot: SquadBot, _ using: Using, _ key: String, _ wet: WetParams?) -> BotPlan {
        let id = using == .race ? "race:\(bot.level):\(key)" : "pit:\(bot.level):\(bot.box):\(key)"
        if let plan = plans[id] { return plan }
        let plan =
            using == .race
            ? buildBotPlan(track, .baseline, .baseline(bot.level), wet: wet)
            : buildPitPlan(track, .baseline, .baseline(bot.level), box: bot.box, pit: .baseline, wet: wet)
        plans[id] = plan
        return plan
    }

    /// Each bot's input for the next tick of `state`, on a track as wet as `weather` says (with
    /// `tyres`: each on its compound); none while the start lights hold the cars.
    public func inputs(_ state: GameState, held: Bool, weather: WetTrack? = nil, tyres: TyreParams? = nil) -> InputMap {
        let wetness = trackWetness(weather, state.tick)
        var inputs: InputMap = [:]
        for i in racers.indices {
            let id = racers[i].bot.id
            guard let car = state.car(id) else { continue }
            if let stop = car.pitStop, stop.until != racers[i].lastStop {
                racers[i].lastStop = stop.until
                racers[i].stops += 1
            }
            if held {
                racers[i].memory = .new
                inputs[id] = .neutral
                continue
            }
            let laps = state.lap(id)?.laps ?? 0
            // Stopped in its box: its tyres for the stint ahead (the stop just counted), the weather's.
            if let stop = car.pitStop, state.tick < stop.until, let raceLaps {
                let wanted = tyres.map { weatherCompound(wetness, $0) } ?? .medium
                let compound =
                    wanted == .medium
                    ? botCompound(racers[i].schedule, stops: racers[i].stops, laps: laps, raceLaps: raceLaps)
                    : wanted
                if car.tyres?.compound != compound || (car.tyres?.wear ?? 0) > 0 {
                    inputs[id] = InputCommand(compound: compound)
                    continue
                }
            }
            // A flat tyre (only in a race with damage, the one with `car.damage`): to the pits now.
            let flat = car.damage != nil && puncturedTyres(car.damage, car.tyres, .baseline).contains(true)
            let compound = car.tyres?.compound ?? .medium
            let weatherStop = tyres != nil && raceLaps != nil && wrongTyres(compound, wetness)
            let due = pitDue(racers[i].schedule, lapsDone: laps, stopsMade: racers[i].stops)
            let want: Using = flat || due || weatherStop ? .pit : .race
            if want != racers[i].using && canSwitchPlan(track, locateOnTrack(track, car.position).distance) {
                racers[i].using = want
            }
            let (key, wet) = planWet(compound, wetness, weather, tyres)
            let plan = plan(racers[i].bot, racers[i].using, key, wet)
            let result = botInput(car, plan, racers[i].memory, state.cars)
            racers[i].memory = result.memory
            inputs[id] = wetLift(car, result.input, wetness, tyres)
        }
        return inputs
    }
}
