/// What the tow does to a car for one tick (`sim/slipstream.ts`).
public struct SlipstreamEffect: Sendable {
    /// Multiplier on air drag (1 = no tow).
    public var dragScale: Double
    /// Extra forward push while on throttle (m/s²).
    public var towAccel: Double

    public static let none = SlipstreamEffect(dragScale: 1, towAccel: 0)
}

/// How much `car` is towed (0..1), the strongest wake among `cars`
/// (01_docs/physics.md#slipstream).
public func slipstreamFactor(_ car: CarState, _ cars: [CarState], _ p: SlipstreamParams) -> Double {
    var best = 0.0
    for leader in cars {
        if leader.id == car.id { continue }
        if abs(wrapAngle(car.heading - leader.heading)) > p.maxHeadingDiff { continue }

        let offset = car.position - leader.position
        let behind = -offset.dot(.forward(leader.heading))
        if behind <= 0 { continue }  // alongside or ahead: no wake
        let lateral = abs(offset.dot(.right(leader.heading)))
        let leaderSpeed = leader.velocity.dot(.forward(leader.heading))

        let factor =
            fade(behind, p.range, p.fullGap) * fade(lateral, p.halfWidth, 0)
            * fade(leaderSpeed, p.minSpeed, p.fullSpeed)
        best = max(best, factor)
    }
    return best
}

public func slipstreamEffect(_ factor: Double, _ p: SlipstreamParams) -> SlipstreamEffect {
    SlipstreamEffect(dragScale: 1 - factor * p.dragCut, towAccel: factor * p.towAccel)
}

/// Linear 0..1: 0 at `zero`, 1 at `one`, clamped (works whichever way round they are).
private func fade(_ value: Double, _ zero: Double, _ one: Double) -> Double {
    min(1, max(0, (value - zero) / (one - zero)))
}
