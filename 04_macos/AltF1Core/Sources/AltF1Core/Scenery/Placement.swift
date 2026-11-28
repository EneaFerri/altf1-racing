import Foundation

/// Where props may stand round a track (the web's `scenery/placement.ts`). Pure.

/// A round footprint on the ground (m).
public struct Circle: Sendable {
    public var x: Double
    public var z: Double
    public var r: Double
}

public struct Area: Sendable {
    public var minX: Double
    public var maxX: Double
    public var minZ: Double
    public var maxZ: Double
}

/// Where a `TrackSpot` is on the ground.
public func fromTrack(_ track: Track, _ spot: TrackSpot) -> Vec2 {
    let n = track.samples.count
    let i = wrapIndex(Int(jsRound(spot.at * Double(n))) % n, n)
    let s = track.samples[i]
    let runoff = runoffAt(track, spot.gap >= 0 ? .right : .left, i)
    let offset = jsSign(spot.gap) * (s.halfWidth + runoff + abs(spot.gap))
    return s.position + s.normal * offset
}

/// A `TrackSpot` path as ground points every ~`step` m (interpolated along the track).
public func alongTrack(_ track: Track, _ path: [TrackSpot], step: Double) -> [Vec2] {
    var points: [Vec2] = []
    for (i, spot) in path.enumerated() {
        guard i + 1 < path.count else {
            points.append(fromTrack(track, spot))
            continue
        }
        let next = path[i + 1]
        // Lap fractions wrap over the line: take the short way round.
        let dAt = jsMod(jsMod(next.at - spot.at, 1) + 1.5, 1) - 0.5
        let steps = max(1, Int((abs(dAt) * track.length / step).rounded(.up)))
        for k in 0..<steps {
            let f = Double(k) / Double(steps)
            points.append(fromTrack(track, TrackSpot(spot.at + dAt * f, spot.gap + (next.gap - spot.gap) * f)))
        }
    }
    return points
}

/// A rectangular footprint beside the track: its front centre, facing direction and size.
public struct Footprint: Sendable {
    /// Middle of the side nearest the track, on the ground.
    public var front: Vec2
    /// Unit vector from the footprint towards the track.
    public var towardsTrack: Vec2
    /// Along the track, and away from it (m).
    public var length: Double
    public var depth: Double

    /// The four corners: front pair, then back pair.
    public var corners: [Vec2] {
        let t = towardsTrack
        let along = Vec2(-t.z, t.x)
        let back = front - t * depth
        return [front, back].flatMap { p in [-length / 2, length / 2].map { p + along * $0 } }
    }

    /// A circle covering it, to keep trees off it.
    public var cover: Circle {
        let c = front - towardsTrack * (depth / 2)
        return Circle(x: c.x, z: c.z, r: max(length, depth) / 2 + 6)
    }
}

/// The box around a footprint, aligned with the track beside it.
public func footprintBox(_ track: Track, _ spots: [TrackSpot]) -> Footprint {
    let points = spots.map { fromTrack(track, $0) }
    let c = points.reduce(Vec2.zero, +) * (1 / Double(points.count))
    let loc = locateOnTrack(track, c)
    let normal = roadOf(track, loc.route).samples[loc.index].normal
    let dir = loc.lateral >= 0 ? normal : normal * -1
    let along = points.map { ($0 - c).dot(loc.tangent) }
    let across = points.map { ($0 - c).dot(dir) }
    let midAlong = (along.max()! + along.min()!) / 2
    let front = across.min()!
    return Footprint(
        front: c + loc.tangent * midAlong + dir * front, towardsTrack: dir * -1,
        length: along.max()! - along.min()!, depth: across.max()! - front)
}

/// How far a drawn building reaches from its footprint's front: `back` behind, `roof` in front (m).
public struct Reach: Sendable {
    public var back: Double
    public var roof: Double

    public init(back: Double, roof: Double) {
        self.back = back
        self.roof = roof
    }
}

/// True when a building on `box` stays off the track: its body ≥ 0.5 m beyond the walls, its roof
/// at most 2.5 m over the run-off.
public func fitsBeside(_ track: Track, _ box: Footprint, _ reach: Reach) -> Bool {
    let t = box.towardsTrack
    let along = Vec2(-t.z, t.x)
    let half = box.length / 2 + 1
    let steps = max(2, Int((half / 2).rounded(.up)))
    let rows = Int((reach.back + reach.roof).rounded(.up))
    for i in -steps...steps {
        let a = half * Double(i) / Double(steps)
        for j in 0...rows {
            let d = -reach.back + (reach.back + reach.roof) * Double(j) / Double(rows)
            let p = box.front + along * a + t * d
            let body = d <= 0 && abs(a) <= box.length / 2
            if clearance(track, p) < (body ? 0.5 : -2.5) { return false }
        }
    }
    return true
}

/// Where to draw a stand: its own box when that fits beside the track, else pieces about
/// `pieceLength` m long following the track at the footprint's nearest gap (those that fit).
public func standPieces(_ track: Track, _ spots: [TrackSpot], _ reach: Reach, pieceLength: Double) -> [Footprint] {
    let whole = footprintBox(track, spots)
    if fitsBeside(track, whole, reach) { return [whole] }
    let ats = spots.map(\.at)
    var from = ats.min()!
    var to = ats.max()!
    if to - from > 0.5 {
        from = ats.filter { $0 >= 0.5 }.min()!
        to = 1 + ats.filter { $0 < 0.5 }.max()!
    }
    let nearest = spots.min { abs($0.gap) < abs($1.gap) }!.gap
    let far = nearest + jsSign(nearest) * reach.back
    let count = max(1, Int(jsRound((to - from) * track.length / pieceLength)))
    return (0..<count).compactMap { k in
        let a = jsMod(from + (to - from) * Double(k) / Double(count), 1)
        let b = jsMod(from + (to - from) * Double(k + 1) / Double(count), 1)
        let piece = footprintBox(track, [TrackSpot(a, nearest), TrackSpot(b, nearest), TrackSpot(b, far), TrackSpot(a, far)])
        return fitsBeside(track, piece, reach) ? piece : nil
    }
}

/// True when `p` is inside the polygon (even-odd rule).
public func insidePolygon(_ p: Vec2, _ polygon: [Vec2]) -> Bool {
    var inside = false
    var j = polygon.count - 1
    for i in 0..<polygon.count {
        let a = polygon[i]
        let b = polygon[j]
        if (a.z > p.z) != (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x { inside.toggle() }
        j = i
    }
    return inside
}

public func polygonBounds(_ polygon: [Vec2]) -> Area {
    Area(
        minX: polygon.map(\.x).min()!, maxX: polygon.map(\.x).max()!,
        minZ: polygon.map(\.z).min()!, maxZ: polygon.map(\.z).max()!)
}

/// How far `p` is outside the walls (asphalt + run-off); negative = inside the drivable area.
public func clearance(_ track: Track, _ p: Vec2) -> Double {
    let loc = locateOnTrack(track, p)
    let side: TrackSide = loc.lateral >= 0 ? .right : .left
    // A run-off area widens the main loop's only.
    let runoff = loc.route < 0 ? runoffAt(track, side, loc.index) : track.runoffWidth
    return abs(loc.lateral) - loc.halfWidth - runoff
}

/// The track's bounding box, grown by `margin` on every side.
public func trackBounds(_ track: Track, margin: Double = 0) -> Area {
    let xs = track.samples.map(\.position.x)
    let zs = track.samples.map(\.position.z)
    return Area(minX: xs.min()! - margin, maxX: xs.max()! + margin, minZ: zs.min()! - margin, maxZ: zs.max()! + margin)
}

/// The same sequence on every load (Park–Miller, as the web's), so the scenery never changes.
public struct SceneryRandom {
    private var state: Double

    public init(_ seed: Int) { state = Double(seed) }

    public mutating func next() -> Double {
        state = (state * 16807).truncatingRemainder(dividingBy: 2_147_483_647)
        return state / 2_147_483_647
    }
}

/// Up to `count` seeded random points in `area` (and `inside` a polygon), each at least `margin`
/// outside the walls, outside every `avoid` circle and `spacing` from the others.
public func scatter(
    _ track: Track, count: Int, area: Area, seed: Int, margin: Double, spacing: Double,
    avoid: [Circle] = [], inside: [Vec2]? = nil
) -> [Vec2] {
    let roads = [track] + track.routes
    func near(_ p: Vec2) -> Bool {
        roads.contains {
            !$0.centerGrid.query(p, $0.maxHalfWidth + ($0.maxRunoffWidth ?? $0.runoffWidth) + margin).isEmpty
        }
    }
    var random = SceneryRandom(seed)
    var points: [Vec2] = []
    var attempt = 0
    while attempt < count * 30 && points.count < count {
        attempt += 1
        let p = Vec2(area.minX + random.next() * (area.maxX - area.minX), area.minZ + random.next() * (area.maxZ - area.minZ))
        if let inside, !insidePolygon(p, inside) { continue }
        if avoid.contains(where: { hypot(p.x - $0.x, p.z - $0.z) < $0.r }) { continue }
        if points.contains(where: { $0.distance(to: p) < spacing }) { continue }
        if near(p) && clearance(track, p) < margin { continue }
        points.append(p)
    }
    return points
}

/// Circles of radius `r` every `step` metres along a polyline.
public func polylineFootprint(_ points: [Vec2], r: Double, step: Double? = nil) -> [Circle] {
    let step = step ?? r
    var circles: [Circle] = []
    for i in 0..<max(0, points.count - 1) {
        let a = points[i]
        let b = points[i + 1]
        let steps = max(1, Int((a.distance(to: b) / step).rounded(.up)))
        for k in 0..<steps {
            let p = a.lerp(to: b, Double(k) / Double(steps))
            circles.append(Circle(x: p.x, z: p.z, r: r))
        }
    }
    if let last = points.last { circles.append(Circle(x: last.x, z: last.z, r: r)) }
    return circles
}

/// The drivable pit lane's ground (a track built with it), circles `margin` m beyond its edges.
public func pitLaneFootprint(_ track: Track, margin: Double) -> [Circle] {
    guard let lane = track.routes.first(where: \.pit), let branch = lane.branch else { return [] }
    let samples = lane.samples.filter { $0.distance >= branch.from }
    let half = samples.map(\.halfWidth).max() ?? 0
    return polylineFootprint(samples.map(\.position), r: half + margin, step: 4)
}

/// A boat moored stern-to: its middle, the unit direction its bow points, its length (m).
public struct Mooring: Sendable {
    public var at: Vec2
    public var bow: Vec2
    public var length: Double

    /// Beam per length.
    public static let beam = 0.22

    /// Stern pair, then bow pair.
    var corners: [Vec2] {
        let beam = length * Mooring.beam
        return [-1.0, 1.0].flatMap { f in
            [-1.0, 1.0].map { g in
                Vec2(at.x + bow.x * f * length / 2 - bow.z * g * beam / 2, at.z + bow.z * f * length / 2 + bow.x * g * beam / 2)
            }
        }
    }

    func covers(_ p: Vec2) -> Bool {
        let d = p - at
        return abs(d.dot(bow)) < length / 2 && abs(-d.x * bow.z + d.z * bow.x) < length * Mooring.beam / 2
    }
}

/// Boats moored stern-to along pontoons (Monaco's way): both sides of every pier line, the outer
/// side of every edge of a pier area; kept only on the water, off the piers, `clear`, never
/// overlapping (the web's `mooredBoats`).
public func mooredBoats(_ piers: [Pier], water: [[Vec2]], clear: (Vec2) -> Bool, seed: Int) -> [Mooring] {
    var random = SceneryRandom(seed)
    let edges = piers.map { pier -> [(Vec2, Vec2)] in
        let ps = pier.area ? pier.points + [pier.points[0]] : pier.points
        return (1..<ps.count).map { (ps[$0 - 1], ps[$0]) }
    }
    let allEdges = edges.flatMap { $0 }
    let areas = piers.filter(\.area).map(\.points)
    func toPier(_ p: Vec2) -> Double { allEdges.map { closestPointOnSegment(p, $0.0, $0.1).point.distance(to: p) }.min() ?? .infinity }
    var boats: [Mooring] = []
    for (k, pier) in piers.enumerated() {
        let sternOff = pier.area ? 0.5 : 2.0
        for (a, b) in edges[k] {
            let len = a.distance(to: b)
            if len < 1 { continue }
            let along = (b - a) * (1 / len)
            let middle = a.lerp(to: b, 0.5)
            let sides = [1.0, -1.0].filter { side in
                !pier.area || !insidePolygon(Vec2(middle.x - along.z * side * 2, middle.z + along.x * side * 2), pier.points)
            }
            for side in sides {
                let bow = Vec2(-along.z * side, along.x * side)
                var t = 1.2
                while t < len {
                    let length = 14 + random.next() * (46 - 14)
                    let beam = length * Mooring.beam
                    let s = t + beam / 2
                    t += beam + 1.2
                    if s > len { break }
                    let boat = Mooring(at: a + along * s + bow * (length / 2 + sternOff), bow: bow, length: length)
                    let corners = boat.corners
                    let onWater = corners.allSatisfy { c in
                        water.contains { insidePolygon(c, $0) } && !areas.contains { insidePolygon(c, $0) }
                    }
                    if !onWater || !corners.allSatisfy(clear) { continue }
                    if corners[2...].contains(where: { toPier($0) < 1 }) { continue }
                    func overlaps(_ x: Mooring, _ y: Mooring) -> Bool { ([y.at] + y.corners).contains { x.covers($0) } }
                    if boats.contains(where: { overlaps($0, boat) || overlaps(boat, $0) }) { continue }
                    boats.append(boat)
                }
            }
        }
    }
    return boats
}

/// A floodlight pole: where it stands and the way it faces (towards the track).
public struct Floodlight: Sendable {
    public var at: Vec2
    public var facing: Vec2
}

/// Floodlight poles along the main loop's walls, both sides, one every `spacing` m per side,
/// `offset` m behind the wall (a night race).
public func floodlightSpots(_ track: Track, spacing: Double, offset: Double) -> [Floodlight] {
    var spots: [Floodlight] = []
    var next: [TrackSide: Double] = [.left: spacing / 2, .right: 0]
    for wall in track.walls where wall.route < 0 {
        let side: TrackSide = wall.normal.dot(track.samples[wall.sample].normal) < 0 ? .right : .left
        if wall.progress < next[side]! { continue }
        next[side] = wall.progress + spacing
        let at = wall.a.lerp(to: wall.b, 0.5) - wall.normal * offset
        if clearance(track, at) < offset - 0.5 { continue }
        spots.append(Floodlight(at: at, facing: wall.normal))
    }
    return spots
}
