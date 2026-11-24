/// World centres of the car's collision circles (front to rear), all of radius `CarCollider.radius`
/// (`sim/collision/collider.ts`).
public func carCircles(_ car: CarState) -> [Vec2] {
    CarCollider.circles.map { .toWorld(car.position, car.heading, ahead: $0, side: 0) }
}

/// Applies the result of a hit to a car: the new velocity and a spin kick (see `kickSpin`).
public func applyHit(_ car: CarState, _ velocity: Vec2, _ spinKick: Double, _ maxSpin: Double) -> CarState {
    var next = car
    next.velocity = velocity
    next.spin = kickSpin(car.spin, spinKick, maxSpin)
    return next
}

/// Spin after a kick, limited to ±max. Kicks in the same direction don't stack; a kick the other
/// way adds. Spin already beyond max (a kerb) is kept.
public func kickSpin(_ spin: Double, _ kick: Double, _ max: Double) -> Double {
    let bounded = Swift.min(max, Swift.max(-max, kick))
    if jsSign(bounded) == jsSign(spin) {
        return abs(bounded) > abs(spin) ? bounded : spin
    }
    let limit = Swift.max(max, abs(spin))
    return Swift.min(limit, Swift.max(-limit, spin + bounded))
}
