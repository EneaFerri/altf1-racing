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

/// Single player's Grand Prix bots: each driven in traffic on its race plan, and through the pit lane
/// to its box when one of its mandatory stops is owed. `track` built with its pit lane.
/// A bot's tyres at a stop after `laps` laps (`botCompound`): softs when the stint ahead (to its
/// next scheduled stop, else the flag) is no longer than they last, else mediums.
public func botCompound(_ schedule: [Int], stops: Int, laps: Int, raceLaps: Int) -> TyreCompound {
    let next = stops < schedule.count ? schedule[stops] : raceLaps
    return Double(next - laps) <= TyreParams.baseline.lifeLaps[.soft]! ? .soft : .medium
}

public final class BotSquad {
    private enum Using { case race, pit }

    private struct Racer {
        let bot: SquadBot
        let race: BotPlan
        let pit: BotPlan
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

    public init(track: Track, bots: [SquadBot], wet: WetParams? = nil) {
        self.track = track
        var race: [BotLevel: BotPlan] = [:]
        racers = bots.map { bot in
            let plan = race[bot.level] ?? buildBotPlan(track, .baseline, .baseline(bot.level), wet: wet)
            race[bot.level] = plan
            return Racer(
                bot: bot, race: plan,
                pit: buildPitPlan(track, .baseline, .baseline(bot.level), box: bot.box, pit: .baseline, wet: wet))
        }
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

    /// Each bot's input for the next tick of `state`; none while the start lights hold the cars.
    public func inputs(_ state: GameState, held: Bool) -> InputMap {
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
            // Stopped in its box: its tyres for the stint ahead (the stop just counted).
            if let stop = car.pitStop, state.tick < stop.until, let raceLaps {
                let compound = botCompound(racers[i].schedule, stops: racers[i].stops, laps: laps, raceLaps: raceLaps)
                if car.tyres?.compound != compound || (car.tyres?.wear ?? 0) > 0 {
                    inputs[id] = InputCommand(compound: compound)
                    continue
                }
            }
            let want: Using = pitDue(racers[i].schedule, lapsDone: laps, stopsMade: racers[i].stops) ? .pit : .race
            if want != racers[i].using && canSwitchPlan(track, locateOnTrack(track, car.position).distance) {
                racers[i].using = want
            }
            let plan = racers[i].using == .pit ? racers[i].pit : racers[i].race
            let result = botInput(car, plan, racers[i].memory, state.cars)
            racers[i].memory = result.memory
            inputs[id] = result.input
        }
        return inputs
    }
}
