/// Collision response parameters (`config/collision.ts`, 01_docs/collisions.md).
public struct CollisionParams: Codable, Hashable, Sendable {
    /// Fraction of the speed into a wall that bounces back (0 = dead stop, 1 = elastic).
    public var wallRestitution: Double
    /// Speed lost along the wall per unit of impact (Coulomb).
    public var wallFriction: Double
    /// Spin (rad/s) per radian between the nose and the wall, turning the car parallel to it (1/s).
    public var wallAlignSpin: Double
    /// Cap on that alignment spin (rad/s).
    public var maxAlignSpin: Double
    /// Bounciness of car-vs-car contacts.
    public var carRestitution: Double
    /// Friction between two cars in contact.
    public var carFriction: Double
    /// Scales the spin an off-centre hit gives a car (0 = never rotates, 1 = rigid body).
    public var carSpinScale: Double
    /// Hits slower than this (m/s) give no spin, full spin from twice this.
    public var carSpinMinImpact: Double
    /// Car-vs-car hits never push `spin` beyond this (rad/s).
    public var maxImpactSpin: Double
    /// Solver passes per tick.
    public var solverIterations: Double

    public static let baseline = CollisionParams(
        wallRestitution: 0.1, wallFriction: 0.12, wallAlignSpin: 5, maxAlignSpin: 3,
        carRestitution: 0.3, carFriction: 0.1, carSpinScale: 0.5, carSpinMinImpact: 3,
        maxImpactSpin: 1.2, solverIterations: 3)
}

/// Car collision shape (`CAR_COLLIDER`): circles along the centre axis, all of one radius.
public enum CarCollider {
    public static let radius: Double = 1.1
    /// Centres, `ahead` of the car's centre (m), front to rear.
    public static let circles: [Double] = [1.7, 0, -1.3]
    /// Rotational inertia per unit mass (m²).
    public static let inertia: Double = 2.9
}

/// A circle up to this far behind a wall (m) is still pushed back in front of it (anti-tunnelling).
public let wallCatchDepth: Double = 2
