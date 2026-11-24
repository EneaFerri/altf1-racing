/// How damaged a car's parts are, each from 0 (as new) to 1 (fully damaged) (`sim/damage.ts`,
/// 01_docs/damage.md). Only cars in a race with damage (the Grand Prix) have it.
public struct CarDamage: Codable, Hashable, Sendable {
    public var frontWing: Double
    public var rearWing: Double
    /// One per wheel, in the order of `carWheels`: front left, front right, rear left, rear right.
    public var tyres: [Double]

    public static let none = CarDamage(frontWing: 0, rearWing: 0, tyres: [0, 0, 0, 0])
}

/// Where a hit landed on the car.
public enum HitZone: Sendable {
    case front, rear, left, right
}

/// The zone of `car` a contact at `point` hits: by how far ahead of its centre it is, else its side.
public func hitZone(_ car: CarState, _ point: Vec2, _ p: DamageParams) -> HitZone {
    let offset = point - car.position
    let ahead = offset.dot(.forward(car.heading))
    if ahead > p.frontZone { return .front }
    if ahead < -p.rearZone { return .rear }
    return offset.dot(.right(car.heading)) < 0 ? .left : .right
}

/// `damage` after the car took `impact`: above the threshold, the part hit and its tyres get damage
/// growing with the closing speed.
public func impactDamage(_ damage: CarDamage, _ car: CarState, _ impact: ImpactEvent, _ p: DamageParams)
    -> CarDamage
{
    let amount = max(0, impact.strength - p.impactThreshold) * p.impactDamage
    if amount == 0 { return damage }
    let t = damage.tyres
    let end = amount * p.endTyreShare
    let side = amount * p.sideTyreShare
    var next = damage
    switch hitZone(car, impact.point, p) {
    case .front:
        next.frontWing = damage.frontWing + amount
        next.tyres = [t[0] + end, t[1] + end, t[2], t[3]]
    case .rear:
        next.rearWing = damage.rearWing + amount
        next.tyres = [t[0], t[1], t[2] + end, t[3] + end]
    case .left:
        next.tyres = [t[0] + side, t[1], t[2] + side, t[3]]
    case .right:
        next.tyres = [t[0], t[1] + side, t[2], t[3] + side]
    }
    return capped(next)
}

/// `damage` after `dt` seconds with the wheels on `wheelSurfaces`: each wheel on grass or gravel
/// wears its tyre, fully from `offTrackSpeed` on, less when slower, none at rest.
public func offTrackDamage(
    _ damage: CarDamage, _ wheelSurfaces: [Surface], _ speed: Double, _ dt: Double, _ p: DamageParams
) -> CarDamage {
    let pace = min(1, speed / p.offTrackSpeed) * dt
    if pace == 0 { return damage }
    func rate(_ wheel: Int) -> Double {
        guard wheel < wheelSurfaces.count else { return 0 }
        switch wheelSurfaces[wheel] {
        case .grass: return p.grassDamage
        case .gravel: return p.gravelDamage
        default: return 0
        }
    }
    let tyres = (0..<4).map { damage.tyres[$0] + rate($0) * pace }
    if tyres == damage.tyres { return damage }
    var next = damage
    next.tyres = tyres
    return capped(next)
}

/// `car`'s damage after one tick: its own impacts of the tick, then the surfaces under its wheels.
public func stepDamage(_ car: CarState, _ impacts: [ImpactEvent], _ dt: Double, _ p: DamageParams)
    -> CarDamage
{
    var damage = car.damage ?? .none
    for impact in impacts where impact.carId == car.id {
        damage = impactDamage(damage, car, impact, p)
    }
    return offTrackDamage(damage, car.wheelSurfaces, car.velocity.length, dt, p)
}

/// The car a damaged car drives: `params` with less top speed, turning and grip, each by what its
/// parts cost, but never below its floor.
public func damagedParams(_ params: CarParams, _ damage: CarDamage, _ p: DamageParams) -> CarParams {
    let tyres = damage.tyres.reduce(0, +) / Double(damage.tyres.count)
    func share(_ front: Double, _ rear: Double, _ tyre: Double, _ floor: Double) -> Double {
        max(floor, 1 - damage.frontWing * front - damage.rearWing * rear - tyres * tyre)
    }
    var next = params
    next.maxSpeed =
        params.maxSpeed * share(p.frontWingSpeedLoss, p.rearWingSpeedLoss, p.tyreSpeedLoss, p.minSpeed)
    next.maxYawRate =
        params.maxYawRate * share(p.frontWingTurnLoss, p.rearWingTurnLoss, p.tyreTurnLoss, p.minTurn)
    next.lateralGrip =
        params.lateralGrip * share(p.frontWingGripLoss, p.rearWingGripLoss, p.tyreGripLoss, p.minGrip)
    return next
}

/// `input` with the pull of uneven tyres: steering added towards the side whose tyres are more
/// damaged (right = +), within the steering range.
public func damagedInput(_ input: InputCommand, _ damage: CarDamage, _ p: DamageParams) -> InputCommand {
    let t = damage.tyres
    let pull = ((t[1] - t[0] + (t[3] - t[2])) / 2) * p.tyrePull
    if pull == 0 { return input }
    var next = input
    next.steer = max(-1, min(1, input.steer + pull))
    return next
}

/// Every part limited to 1.
private func capped(_ damage: CarDamage) -> CarDamage {
    CarDamage(
        frontWing: min(1, damage.frontWing), rearWing: min(1, damage.rearWing),
        tyres: damage.tyres.map { min(1, $0) })
}
