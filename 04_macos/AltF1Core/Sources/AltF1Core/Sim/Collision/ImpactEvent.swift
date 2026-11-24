/// One car hitting something during a tick (`sim/collision/types.ts`). Plain data: the view turns
/// these into sparks and sounds.
public struct ImpactEvent: Codable, Hashable, Sendable {
    public var carId: CarId
    /// The other car's id, or "wall".
    public var other: String
    /// Contact point (m).
    public var point: Vec2
    /// Unit vector pushing `carId` away from what it hit.
    public var normal: Vec2
    /// Closing speed along `normal` at the moment of contact (m/s): how hard the hit was.
    public var strength: Double
}
