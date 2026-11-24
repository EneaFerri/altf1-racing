/// Simulation ticks per second (`config/sim.ts`). The model always advances in fixed steps of `fixedDt`.
public let tickRate = 60

/// Duration of one simulation tick, in seconds.
public let fixedDt = 1 / Double(tickRate)
