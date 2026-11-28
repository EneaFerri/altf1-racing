/// A bot's flying lap at `level` (ticks), driven for real on `context`'s track and weather (as wet as
/// at tick 0, on the tyres it asks for): alone,
/// from the grid, the best of its first two laps (the single-player GP's qualifying for the bots,
/// `ai/lapTime.ts`). Nil if it never completes a valid lap.
public func botLapTicks(_ context: SimContext, _ level: BotLevel) -> Int? {
    let track = context.track
    // As wet as at tick 0, on the tyres it asks for (`startingTyres`).
    let fitted = startingTyres(context.weather, context.tyres, 0)
    let wetness = trackWetness(context.weather, 0)
    let compound = fitted?.compound ?? weatherCompound(0)
    let plan = buildBotPlan(track, .baseline, .baseline(level), wet: planWet(compound, wetness, context.weather, context.tyres).wet)
    // Without damage: a qualifying lap on its own.
    var clean = context
    clean.damage = nil
    clean.carParamsById = ["bot": botCarParams(.baseline, .baseline(level))]
    var state = createGame(track, ["bot"], tyres: fitted)
    var memory = BotMemory.new
    let limit = (track.length / 20) * 2 * Double(tickRate)  // two laps at 20 m/s at worst
    var tick = 0
    while Double(tick) < limit, (state.lap("bot")?.laps ?? 0) < 2 {
        let car = state.car("bot")!
        let result = botInput(car, plan, memory)
        memory = result.memory
        let input = wetLift(car, result.input, trackWetness(context.weather, state.tick), context.tyres)
        state = stepGame(state, ["bot": input], clean)
        tick += 1
    }
    return state.lap("bot")?.bestLap?.ticks
}
