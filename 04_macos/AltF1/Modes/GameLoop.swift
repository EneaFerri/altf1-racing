import AltF1Core

/// Fixed-timestep loop (the web's `core/GameLoop.ts`): the simulation always ticks at `tickRate`,
/// the view draws at whatever rate the display runs (120 Hz on ProMotion), interpolating between
/// the last two ticks.
struct GameLoop {
    /// Longest frame simulated; after a freeze the game skips time instead of catching up forever.
    static let maxFrameSeconds = 0.25
    /// Absorbs floating-point error so N frames of exactly `fixedDt` always produce N ticks.
    private static let epsilon = 1e-9

    private var accumulator = 0.0

    /// Feeds one frame of real time: runs `tick` as many times as due, returns how far the view is
    /// between the last two ticks (0..1) and the clamped frame time.
    mutating func advance(_ frameSeconds: Double, tick: () -> Void) -> (alpha: Double, seconds: Double) {
        let seconds = min(max(frameSeconds, 0), Self.maxFrameSeconds)
        accumulator += seconds
        while accumulator >= fixedDt - Self.epsilon {
            tick()
            accumulator -= fixedDt
        }
        return (min(max(accumulator / fixedDt, 0), 1), seconds)
    }
}
