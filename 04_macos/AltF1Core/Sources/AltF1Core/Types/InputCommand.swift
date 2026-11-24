/// One frame of player intent, produced by the controller and consumed by the model
/// (`types/input.ts`). Plain serializable data, sent over the network as is.
public struct InputCommand: Codable, Hashable, Sendable {
    /// 0..1
    public var throttle: Double
    /// 0..1. Brakes to a stop, never reverses; how long it is held sets the pressure (see `stepCar`).
    public var brake: Double
    /// 0..1. Brakes like `brake` while rolling forward, then drives backwards.
    public var reverse: Double
    /// −1 (full left) … 1 (full right)
    public var steer: Double
    /// True for exactly one tick when the player asks to be put back on the track.
    public var reset: Bool
    /// Stopped in its box (the Grand Prix): the compound its driver chose, for one tick; fitted
    /// new at once. Ignored anywhere else.
    public var compound: TyreCompound?

    public init(
        throttle: Double = 0, brake: Double = 0, reverse: Double = 0, steer: Double = 0,
        reset: Bool = false, compound: TyreCompound? = nil
    ) {
        self.throttle = throttle
        self.brake = brake
        self.reverse = reverse
        self.steer = steer
        self.reset = reset
        self.compound = compound
    }

    public static let neutral = InputCommand()
}
