/// Wall contacts (`sim/collision/walls.ts`, 01_docs/collisions.md#walls).
public struct WallContact: Sendable {
    /// Closest point on the wall (m).
    public var point: Vec2
    /// Unit push-out direction, towards the track.
    public var normal: Vec2
    /// Penetration (m), > 0.
    public var depth: Double
}

/// Below this speed along the wall (m/s) the nose is not turned parallel to it.
private let minAlignSpeed: Double = 3
/// Hits more head-on than this (rad, ~70°) get no alignment.
private let maxAlignAngle: Double = 1.22
/// How far behind a wall's line (m) a circle may have started its tick and still count as in front.
private let fromTolerance: Double = 0.25

/// Deepest wall contact of a circle, if any. Walls are one-sided; a circle up to `wallCatchDepth`
/// behind one is still pushed back, unless (with `from`, the centre at the tick's start) it started
/// behind it: a wall behind the car never pulls it through (the pit wall).
public func wallContact(_ walls: some WallSet, _ center: Vec2, _ radius: Double, _ from: Vec2? = nil)
    -> WallContact?
{
    var best: WallContact?
    let all = walls.walls
    for index in walls.wallGrid.query(center, radius + wallCatchDepth) {
        let wall = all[index]
        let point = closestPointOnSegment(center, wall.a, wall.b).point
        let offset = center - point
        let signed = offset.dot(wall.normal)
        let span = wall.b - wall.a
        // Unclamped projection: 0..1 (ends included) = right in front of or behind the segment.
        let along = (center - wall.a).dot(span) / span.dot(span)
        let distance: Double
        let normal: Vec2
        if along >= 0 && along <= 1 {
            if signed < -wallCatchDepth { continue }
            if signed < 0, let from, (from - wall.a).dot(wall.normal) < -fromTolerance { continue }
            distance = signed
            normal = wall.normal
        } else {
            // Past the segment's end: push away from the polyline corner.
            if signed < 0 { continue }
            distance = offset.length
            normal = distance > 0 ? offset * (1 / distance) : wall.normal
        }
        let depth = radius - distance
        if depth > 0 && (best == nil || depth > best!.depth) {
            best = WallContact(point: point, normal: normal, depth: depth)
        }
    }
    return best
}

/// Pushes every circle of the car out of the walls and applies the wall response. `before` is the
/// car at the start of the tick.
public func resolveWalls(_ car: CarState, _ walls: some WallSet, _ p: CollisionParams, _ before: CarState? = nil)
    -> (car: CarState, impact: ImpactEvent?)
{
    var result = car
    var impact: ImpactEvent?
    for ahead in CarCollider.circles {
        let center = Vec2.toWorld(result.position, result.heading, ahead: ahead, side: 0)
        let from = before.map { Vec2.toWorld($0.position, $0.heading, ahead: ahead, side: 0) }
        guard let contact = wallContact(walls, center, CarCollider.radius, from) else { continue }
        result.position = result.position + contact.normal * contact.depth
        guard let hit = wallHit(result, contact.normal, p) else { continue }
        result = hit.car
        if impact == nil || hit.strength > impact!.strength {
            impact = ImpactEvent(
                carId: car.id, other: "wall", point: contact.point, normal: contact.normal,
                strength: hit.strength)
        }
    }
    return (result, impact)
}

/// Wall response when the car moves into the wall: a small bounce, Coulomb friction along the wall
/// and a spin that turns the nose parallel to it.
private func wallHit(_ car: CarState, _ normal: Vec2, _ p: CollisionParams) -> (car: CarState, strength: Double)? {
    let vn = car.velocity.dot(normal)
    if vn >= 0 { return nil }
    let strength = -vn
    let along = car.velocity - normal * vn
    let alongSpeed = along.length
    let friction = min(alongSpeed, p.wallFriction * (1 + p.wallRestitution) * strength)
    let velocity =
        normal * (strength * p.wallRestitution)
        + (alongSpeed > 0 ? along * (1 - friction / alongSpeed) : .zero)
    let spin = alignSpin(car, along, p)
    return (applyHit(car, velocity, spin, p.maxAlignSpin), strength)
}

/// Spin that turns the nose parallel to the wall: `wallAlignSpin · (angle to the wall)`.
private func alignSpin(_ car: CarState, _ along: Vec2, _ p: CollisionParams) -> Double {
    if along.length < minAlignSpeed || Vec2.forward(car.heading).dot(along) <= 0 { return 0 }
    let error = wrapAngle(along.heading - car.heading)
    return abs(error) > maxAlignAngle ? 0 : p.wallAlignSpin * error
}
