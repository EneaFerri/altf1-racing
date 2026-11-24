/// Handling parameters (`config/car.ts`). SI units (m, s, m/s, rad); meaning of each value in
/// 01_docs/physics.md. `baseline` = the web's `CAR_PARAMS`, the frozen tuning baseline.
public struct CarParams: Codable, Hashable, Sendable {
    /// Engine speed limit: thrust fades to 0 here. Real top speed is lower because of air drag.
    public var maxSpeed: Double
    /// Forward acceleration from standstill at full throttle (m/s²).
    public var engineAccel: Double
    /// Braking deceleration at full brake pressure (m/s²).
    public var brakeDecel: Double
    /// Brake pressure (0..1) the instant the brake is pressed: a tap already slows the car.
    public var brakeInitialPressure: Double
    /// Time held to go from brakeInitialPressure to full pressure (s).
    public var brakeRampTime: Double
    /// Time for the pressure to drop from full to 0 once released (s).
    public var brakeReleaseTime: Double
    /// Acceleration in reverse (m/s²).
    public var reverseAccel: Double
    public var maxReverseSpeed: Double
    /// Deceleration when no pedal is pressed (m/s²).
    public var coastDecel: Double
    /// Quadratic air drag coefficient: deceleration = airDrag · speed².
    public var airDrag: Double
    /// How fast the steering moves towards the input (full lock per second).
    public var steerSpeed: Double
    /// How fast the steering re-centres when released or reversed.
    public var steerReturnSpeed: Double
    /// Yaw rate at full lock (rad/s).
    public var maxYawRate: Double
    /// How quickly the actual yaw rate follows the steering (1/s).
    public var yawResponse: Double
    /// Below this speed steering authority fades towards 0, so the car can't turn on the spot.
    public var fullTurnSpeed: Double
    /// Fraction of steering lost at maxSpeed (0 = none, 1 = all).
    public var highSpeedSteerLoss: Double
    /// How quickly sideways sliding is killed (1/s). Higher = more grip.
    public var lateralGrip: Double
    /// How quickly external spin (kerb kicks, impacts) dies out (1/s).
    public var spinDamping: Double

    public static let baseline = CarParams(
        maxSpeed: 95, engineAccel: 18, brakeDecel: 30, brakeInitialPressure: 0.3,
        brakeRampTime: 0.6, brakeReleaseTime: 0.1, reverseAccel: 8, maxReverseSpeed: 10,
        coastDecel: 1.5, airDrag: 0.0005, steerSpeed: 3, steerReturnSpeed: 5, maxYawRate: 2.7,
        yawResponse: 9.5, fullTurnSpeed: 8, highSpeedSteerLoss: 0.6, lateralGrip: 6,
        spinDamping: 4)
}

/// A wheel's contact point in the car's local frame (m): `ahead` along forward, `side` along right.
public struct WheelPosition: Sendable {
    public let ahead: Double
    public let side: Double
}

/// The wheels (`CAR_WHEELS`): front-left, front-right, rear-left, rear-right. Shared by surface
/// sampling and the car's look.
public let carWheels: [WheelPosition] = [
    WheelPosition(ahead: 1.5, side: -0.95),
    WheelPosition(ahead: 1.5, side: 0.95),
    WheelPosition(ahead: -1.4, side: -0.95),
    WheelPosition(ahead: -1.4, side: 0.95),
]
