/// Car-vs-car contacts (`sim/collision/cars.ts`, 01_docs/collisions.md).
public struct CarContact: Sendable {
    /// Middle of the overlap (m).
    public var point: Vec2
    /// Unit vector from car `a` towards car `b`.
    public var normal: Vec2
    /// Overlap (m), > 0.
    public var depth: Double
}

/// Cars whose centres are farther apart than this can't touch (two collider lengths).
private let broadPhase = 2 * ((CarCollider.circles.map(abs).max() ?? 0) + CarCollider.radius)

/// Deepest overlap between the circles of two cars, if they touch.
public func carContact(_ a: CarState, _ b: CarState) -> CarContact? {
    if a.position.distance(to: b.position) > broadPhase { return nil }
    let r = CarCollider.radius
    var best: CarContact?
    for ca in carCircles(a) {
        for cb in carCircles(b) {
            let gap = ca.distance(to: cb)
            let depth = 2 * r - gap
            if depth <= 0 { continue }
            if let best, depth <= best.depth { continue }
            // Exactly coincident circles: separate along the line between the car centres.
            let normal = gap > 0 ? (cb - ca) * (1 / gap) : fallbackNormal(a, b)
            best = CarContact(point: ca + normal * (r - depth / 2), normal: normal, depth: depth)
        }
    }
    return best
}

/// Separates two touching cars (equal mass, half the overlap each) and, if they are closing in,
/// exchanges a normal impulse, a small friction and the spin an off-centre hit gives each car.
public func resolveCarPair(_ a: CarState, _ b: CarState, _ p: CollisionParams)
    -> (a: CarState, b: CarState, impacts: [ImpactEvent])
{
    guard let contact = carContact(a, b) else { return (a, b, []) }
    let push = contact.normal * (contact.depth / 2)
    var nextA = a
    nextA.position = a.position - push
    var nextB = b
    nextB.position = b.position + push
    let relative = b.velocity - a.velocity
    let vn = relative.dot(contact.normal)
    if vn >= 0 { return (nextA, nextB, []) }
    let strength = -vn
    // Velocity change of each car along the normal (equal masses share the impulse).
    let j = ((1 + p.carRestitution) * strength) / 2
    let sliding = relative - contact.normal * vn
    let slideSpeed = sliding.length
    let friction = slideSpeed > 0 ? min(slideSpeed / 2, p.carFriction * j) / slideSpeed : 0
    // Impulse (per unit mass) on b; a gets the opposite.
    let impulse = contact.normal * j - sliding * friction
    nextA = applyHit(
        nextA, nextA.velocity - impulse,
        spinFrom(nextA, contact.point, impulse * -1, strength, p), p.maxImpactSpin)
    nextB = applyHit(
        nextB, nextB.velocity + impulse,
        spinFrom(nextB, contact.point, impulse, strength, p), p.maxImpactSpin)
    return (
        nextA, nextB,
        [
            ImpactEvent(
                carId: a.id, other: b.id, point: contact.point, normal: contact.normal * -1,
                strength: strength),
            ImpactEvent(
                carId: b.id, other: a.id, point: contact.point, normal: contact.normal,
                strength: strength),
        ]
    )
}

/// Heading-rate change (rad/s) from an impulse at `point`; faded out for gentle contacts.
private func spinFrom(_ car: CarState, _ point: Vec2, _ impulse: Vec2, _ strength: Double, _ p: CollisionParams)
    -> Double
{
    let minImpact = p.carSpinMinImpact
    let fade = minImpact > 0 ? min(1, max(0, (strength - minImpact) / minImpact)) : 1
    return (-(point - car.position).cross(impulse) / CarCollider.inertia) * p.carSpinScale * fade
}

private func fallbackNormal(_ a: CarState, _ b: CarState) -> Vec2 {
    let between = b.position - a.position
    let gap = between.length
    return gap > 0 ? between * (1 / gap) : Vec2(1, 0)
}
