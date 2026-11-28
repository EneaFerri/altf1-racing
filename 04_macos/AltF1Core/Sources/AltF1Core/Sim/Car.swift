import Foundation

/// Below this forward speed (m/s, ~1 km/h) the reverse key drives backwards instead of braking.
private let reverseEngageSpeed = 0.3

public typealias CarId = String

/// One car (`sim/car.ts`). Plain data, part of `GameState`.
public struct CarState: Codable, Hashable, Sendable {
    public var id: CarId
    public var position: Vec2
    /// World-space velocity (m/s). Points slightly away from `heading` in corners (slip).
    public var velocity: Vec2
    /// Facing angle in radians: 0 = −Z, positive = counter-clockwise from above.
    public var heading: Double
    /// Smoothed turn rate of the heading (rad/s).
    public var yawRate: Double
    /// Extra rotation from external kicks (high kerbs, impacts), decays over time (rad/s).
    public var spin: Double
    /// Smoothed steering, −1 (left) … 1 (right).
    public var steer: Double
    /// Brake pressure 0..1.
    public var brakePressure: Double
    /// Surface under each wheel (order of `carWheels`), sampled at the start of the last tick.
    public var wheelSurfaces: [Surface]
    /// How much the car was towed by another car's wake in the last tick (0..1).
    public var slipstream: Double
    /// How damaged its parts are; only in a race with damage (the Grand Prix).
    public var damage: CarDamage?
    /// Its pit stop, from stopping in its box until it leaves the pit lane.
    public var pitStop: PitStop?
    /// Its tyres; only in a race with tyres (the Grand Prix); nil: new mediums.
    public var tyres: TyreState?

    public init(id: CarId = "car", position: Vec2 = .zero, heading: Double = 0) {
        self.id = id
        self.position = position
        velocity = .zero
        self.heading = heading
        yawRate = 0
        spin = 0
        steer = 0
        brakePressure = 0
        wheelSurfaces = [.asphalt, .asphalt, .asphalt, .asphalt]
        slipstream = 0
    }
}

/// Angle between where the car points and where it travels (rad). Positive = nose right of travel.
public func slipAngle(_ car: CarState) -> Double {
    if car.velocity.length < 0.5 { return 0 }
    return wrapAngle(car.velocity.heading - car.heading)
}

/// Advances one car by `dt` seconds on the given surface, towed by `slip`, pushed along its heading
/// by `slopeAccel` (m/s², + = forward: downhill). Pure. Tyres always grip; see 01_docs/physics.md.
public func stepCar(
    _ car: CarState,
    _ input: InputCommand,
    _ p: CarParams,
    _ dt: Double,
    surface: SurfaceEffect = .neutral,
    slip: SlipstreamEffect = .none,
    slopeAccel: Double = 0
) -> CarState {
    let steer = smoothSteer(car.steer, input.steer, p, dt)
    let spin = (car.spin + surface.spinKick + powerSlide(car, input, surface, dt)) * exp(-p.spinDamping * dt)
    let brakePressure = smoothBrake(
        car.brakePressure, input, car.velocity.dot(.forward(car.heading)), p, dt)
    let grip = p.lateralGrip * surface.grip

    // Split velocity into the car's own frame.
    let fwd = Vec2.forward(car.heading)
    let side = Vec2.right(car.heading)
    let vForward = longitudinal(
        car.velocity.dot(fwd), brakePressure, input, p, dt, surface, slip, slopeAccel)
    let vLateral = car.velocity.dot(side) * exp(-grip * dt)

    let speed = abs(vForward)
    let lowSpeedFactor = min(1, speed / p.fullTurnSpeed)
    let highSpeedFactor = 1 - p.highSpeedSteerLoss * min(1, speed / p.maxSpeed)
    // Steering right (+) turns clockwise (heading decreases); reversing flips it, like a real car.
    let targetYaw = -steer * p.maxYawRate * lowSpeedFactor * highSpeedFactor * jsSign(vForward)
    let yawRate = approach(car.yawRate, targetYaw, p.yawResponse, dt)

    let velocity = fwd * vForward + side * vLateral
    var next = car
    next.position = car.position + velocity * dt
    next.velocity = velocity
    next.heading = wrapAngle(car.heading + (yawRate + spin) * dt)
    next.yawRate = yawRate
    next.spin = spin
    next.steer = steer
    next.brakePressure = brakePressure
    return next
}

/// Power oversteer on a wet track (`powerSlide`, 2.8): on the throttle past `surface.slideFrom`, a
/// yaw kick into the turn by the excess turn rate × `slideGain` × throttle, up to `slideMaxSpin`.
private func powerSlide(_ car: CarState, _ input: InputCommand, _ surface: SurfaceEffect, _ dt: Double) -> Double {
    guard let slideFrom = surface.slideFrom, let slideGain = surface.slideGain, input.throttle > 0 else { return 0 }
    if let maxSpin = surface.slideMaxSpin, abs(car.spin) >= maxSpin { return 0 }
    let speed = car.velocity.length
    if speed < 1 { return 0 }
    let rotation = car.yawRate + car.spin
    let over = abs(rotation) - slideFrom / speed
    return over > 0 ? jsSign(rotation) * slideGain * input.throttle * over * dt : 0
}

/// Frame-rate independent exponential approach of `value` towards `target` at `rate` (1/s).
private func approach(_ value: Double, _ target: Double, _ rate: Double, _ dt: Double) -> Double {
    value + (target - value) * (1 - exp(-rate * dt))
}

private func smoothSteer(_ current: Double, _ target: Double, _ p: CarParams, _ dt: Double) -> Double {
    let returning = target == 0 || jsSign(target) != jsSign(current)
    return moveToward(current, target, (returning ? p.steerReturnSpeed : p.steerSpeed) * dt)
}

/// Brake pressure after this tick: pressing jumps to brakeInitialPressure, holding ramps up to
/// full over brakeRampTime, releasing drops to 0 over brakeReleaseTime.
private func smoothBrake(
    _ current: Double, _ input: InputCommand, _ vForward: Double, _ p: CarParams, _ dt: Double
) -> Double {
    let demand = max(input.brake, vForward > reverseEngageSpeed ? input.reverse : 0)
    if current > demand { return moveToward(current, demand, dt / p.brakeReleaseTime) }
    let ramped = moveToward(current, demand, ((1 - p.brakeInitialPressure) / p.brakeRampTime) * dt)
    return max(ramped, p.brakeInitialPressure * demand)
}

/// New forward speed after engine, slipstream tow, slope, brakes, reverse, drag and surface.
private func longitudinal(
    _ vForward: Double, _ brakePressure: Double, _ input: InputCommand, _ p: CarParams, _ dt: Double,
    _ surface: SurfaceEffect, _ slip: SlipstreamEffect, _ slopeAccel: Double
) -> Double {
    var v = vForward
    let traction = surface.traction

    if input.throttle > 0 {
        v =
            v >= 0
            ? v + p.engineAccel * traction * input.throttle * (1 - v / p.maxSpeed) * dt
            : moveToward(v, 0, p.brakeDecel * traction * input.throttle * dt)  // throttle while rolling back = brake
        if vForward >= 0 { v += slip.towAccel * input.throttle * dt }
    }

    // The slope after the engine and before the brakes, so they can still hold the car on a hill.
    if slopeAccel != 0 { v += slopeAccel * dt }

    // The brake stops the car whichever way it rolls; only the reverse key drives backwards.
    if brakePressure > 0 {
        v = moveToward(v, 0, p.brakeDecel * traction * surface.brake * brakePressure * dt)
    }

    if input.reverse > 0 && v <= reverseEngageSpeed {
        v = max(v - p.reverseAccel * traction * input.reverse * dt, -p.maxReverseSpeed)
    }

    if input.throttle == 0 && input.brake == 0 && input.reverse == 0 {
        v = moveToward(v, 0, p.coastDecel * dt)
    }

    v = moveToward(v, 0, surface.drag * dt)
    return moveToward(v, 0, p.airDrag * slip.dragScale * v * v * dt)
}
