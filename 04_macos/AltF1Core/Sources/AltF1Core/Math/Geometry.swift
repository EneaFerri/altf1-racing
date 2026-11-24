/// The closest point to a point on a segment (`math/geometry.ts`).
public struct SegmentProjection: Sendable {
    /// 0..1 position of the closest point along the segment.
    public let t: Double
    public let point: Vec2
}

/// Closest point to `p` on the segment a→b.
public func closestPointOnSegment(_ p: Vec2, _ a: Vec2, _ b: Vec2) -> SegmentProjection {
    let ab = b - a
    let lengthSq = ab.dot(ab)
    let t = lengthSq > 0 ? min(1, max(0, (p - a).dot(ab) / lengthSq)) : 0
    return SegmentProjection(t: t, point: a.lerp(to: b, t))
}
