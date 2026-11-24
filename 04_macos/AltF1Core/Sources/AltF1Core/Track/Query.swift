/// Where things are on a track (`track/query.ts`).
public struct TrackLocation: Sendable {
    /// The road the point is on: −1 = main loop, else the index in `Track.routes`.
    public var route: Int
    /// Segment index on that road (from sample `index` to the next one).
    public var index: Int
    /// Closest point on the centreline.
    public var point: Vec2
    /// Driving direction at that point (unit).
    public var tangent: Vec2
    /// Signed distance from the centreline: positive = right of the driving direction (m).
    public var lateral: Double
    /// Progress from the start line (m), measured along the main loop (also on a branch).
    public var distance: Double
    /// Half of the asphalt width at this point (m).
    public var halfWidth: Double
    /// Height of the road at this point (m; 0 on a flat track).
    public var height: Double
    /// Slope along the driving direction here (+ = uphill; 0 on a flat track).
    public var grade: Double
}

/// Where `p` is on the track: the closest centreline point of the road it is most inside (main
/// loop, or a branch), with progress measured along the main loop. On the main loop's asphalt the
/// pit lane never wins: where they meet, the track is the track.
public func locateOnTrack(_ track: Track, _ p: Vec2) -> TrackLocation {
    let main = locateOnLoop(track, p)
    let onMainAsphalt = abs(main.lateral) <= main.halfWidth
    var best = main
    for (route, road) in track.routes.enumerated() {
        if road.pit && onMainAsphalt { continue }
        var loc = locateOnLoop(road, p)
        let branch = road.branch!
        if loc.distance < branch.from || loc.distance > branch.to { continue }
        if abs(loc.lateral) - loc.halfWidth < abs(best.lateral) - best.halfWidth {
            loc.route = route
            loc.distance = routeProgress(branch, loc.distance)
            best = loc
        }
    }
    return best
}

/// Main-loop progress of distance `d` along a route: the same as the main loop's before its branch
/// (from `start`), linear across it, offset after it; wrapped over the line.
public func routeProgress(_ span: BranchSpan, _ d: Double) -> Double {
    func wrap(_ x: Double) -> Double {
        jsMod(jsMod(x, span.mainLength) + span.mainLength, span.mainLength)
    }
    if d <= span.from { return wrap(span.start + d) }
    if d >= span.to { return wrap(d - span.to + span.mainTo) }
    let mainSpan = wrap(span.mainTo - span.mainFrom)
    return wrap(span.mainFrom + ((d - span.from) / (span.to - span.from)) * mainSpan)
}

/// The road `route` of `track` (−1 = the main loop itself).
public func roadOf(_ track: Track, _ route: Int) -> Track {
    route < 0 ? track : track.routes[route]
}

/// Closest point of one closed road's centreline to `p`, ignoring branches (distance along that
/// road). Uses the grid near the road, a full scan far away.
public func locateOnLoop(_ track: Track, _ p: Vec2) -> TrackLocation {
    let samples = track.samples
    let n = samples.count
    let nearby = track.centerGrid.query(p, track.maxHalfWidth + track.runoffWidth + 10)
    let candidates = nearby.isEmpty ? Array(0..<n) : nearby

    var bestIndex = 0
    var bestT = 0.0
    var bestPoint = samples[0].position
    var bestDist = Double.infinity
    for i in candidates {
        let projection = closestPointOnSegment(p, samples[i].position, samples[(i + 1) % n].position)
        let dist = p.distance(to: projection.point)
        if dist < bestDist {
            bestIndex = i
            bestT = projection.t
            bestPoint = projection.point
            bestDist = dist
        }
    }

    let a = samples[bestIndex]
    let b = samples[(bestIndex + 1) % n]
    let tangent = a.tangent.lerp(to: b.tangent, bestT).normalized
    let normal = a.normal.lerp(to: b.normal, bestT).normalized
    let segmentLength = a.position.distance(to: b.position)
    return TrackLocation(
        route: -1,
        index: bestIndex,
        point: bestPoint,
        tangent: tangent,
        lateral: (p - bestPoint).dot(normal),
        distance: jsMod(a.distance + segmentLength * bestT, track.length),
        halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * bestT,
        height: a.height + (b.height - a.height) * bestT,
        grade: a.grade + (b.grade - a.grade) * bestT)
}

/// Surface under point `p`, from its lateral distance to the centreline (01_docs/track.md).
public func surfaceAt(_ track: Track, _ p: Vec2) -> Surface {
    let loc = locateOnTrack(track, p)
    let side: TrackSide = loc.lateral >= 0 ? .right : .left
    let offset = abs(loc.lateral)
    let info = roadOf(track, loc.route).sides[side]
    let kerb = info.kerb[loc.index]
    let edge = loc.halfWidth

    if offset <= edge - track.kerbInset { return .asphalt }
    if offset <= edge + track.kerbOutset && kerb != .none {
        return kerb == .high ? .highKerb : .kerb
    }
    if offset <= edge { return .asphalt }
    return info.runoff[loc.index] == .gravel ? .gravel : .grass
}

/// A position and the unit driving direction there.
public struct Pose: Sendable {
    public var position: Vec2
    public var direction: Vec2
}

/// Lateral offset of the two grid columns from the centreline (m).
private let gridColumnOffset: Double = 4

/// Grid slots painted on a real circuit, as on an F1 grid (spawns use the first ones).
public let gridSlots = 20

/// Starting grid slot `slot` (0 = pole): staggered rows behind the start line.
public func gridSlot(_ track: Track, _ slot: Int) -> Pose {
    let n = track.samples.count
    let metresBack = 10 + Double(slot) * 8
    let index = (n - Int(jsRound(metresBack / TrackRules.sampleSpacing))) % n
    let sample = track.samples[index]
    let lateral = (slot % 2 == 0 ? -1.0 : 1.0) * gridColumnOffset
    return Pose(position: sample.position + sample.normal * lateral, direction: sample.tangent)
}
