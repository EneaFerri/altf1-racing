/// A bot's flying lap at `level` (ticks), driven for real on `context`'s track and weather: alone,
/// from the grid, the best of its first two laps (the single-player GP's qualifying for the bots,
/// `ai/lapTime.ts`). Nil if it never completes a valid lap.
public func botLapTicks(_ context: SimContext, _ level: BotLevel) -> Int? {
    let track = context.track
    let plan = buildBotPlan(track, .baseline, .baseline(level), wet: context.weather?.params)
    // Without damage: a qualifying lap on its own.
    var clean = context
    clean.damage = nil
    clean.carParamsById = ["bot": botCarParams(.baseline, .baseline(level))]
    var state = createGame(track, ["bot"])
    var memory = BotMemory.new
    let limit = (track.length / 20) * 2 * Double(tickRate)  // two laps at 20 m/s at worst
    var tick = 0
    while Double(tick) < limit, (state.lap("bot")?.laps ?? 0) < 2 {
        let result = botInput(state.car("bot")!, plan, memory)
        memory = result.memory
        state = stepGame(state, ["bot": result.input], clean)
        tick += 1
    }
    return state.lap("bot")?.bestLap?.ticks
}
