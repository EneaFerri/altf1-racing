import Foundation

/// 2D vector on the ground plane (`math/vec2.ts`): RealityKit's ground axes, like Three.js', so no
/// conversion is needed in the view. Heading 0 faces −Z, positive = counter-clockwise from above.
public struct Vec2: Codable, Hashable, Sendable {
    public var x: Double
    public var z: Double

    public init(_ x: Double, _ z: Double) {
        self.x = x
        self.z = z
    }

    public static let zero = Vec2(0, 0)

    public static func + (a: Vec2, b: Vec2) -> Vec2 { Vec2(a.x + b.x, a.z + b.z) }
    public static func - (a: Vec2, b: Vec2) -> Vec2 { Vec2(a.x - b.x, a.z - b.z) }
    public static func * (v: Vec2, s: Double) -> Vec2 { Vec2(v.x * s, v.z * s) }

    public func dot(_ b: Vec2) -> Double { x * b.x + z * b.z }

    /// 2D cross product. Positive when `b` points to the right of `self` (clockwise from above).
    public func cross(_ b: Vec2) -> Double { x * b.z - z * b.x }

    public var length: Double { jsHypot(x, z) }

    public func distance(to b: Vec2) -> Double { jsHypot(x - b.x, z - b.z) }

    /// Unit vector in the same direction, or `.zero` for a zero-length vector.
    public var normalized: Vec2 {
        let len = length
        return len > 0 ? Vec2(x / len, z / len) : .zero
    }

    public func lerp(to b: Vec2, _ t: Double) -> Vec2 {
        Vec2(x + (b.x - x) * t, z + (b.z - z) * t)
    }

    /// Unit vector the car faces for a given heading (0 = −Z, positive = counter-clockwise).
    public static func forward(_ heading: Double) -> Vec2 { Vec2(-sin(heading), -cos(heading)) }

    /// Unit vector to the car's right for a given heading.
    public static func right(_ heading: Double) -> Vec2 { Vec2(cos(heading), -sin(heading)) }

    /// Heading that `forward()` would map to this vector's direction. Inverse of `forward`.
    public var heading: Double { atan2(-x, -z) }

    /// World position of a point given in a car's local frame (`ahead` along forward, `side` along right).
    public static func toWorld(_ origin: Vec2, _ heading: Double, ahead: Double, side: Double) -> Vec2 {
        origin + (forward(heading) * ahead + right(heading) * side)
    }
}
