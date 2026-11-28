import Foundation

/// A track definition that can't be compiled.
public struct TrackError: Error, CustomStringConvertible {
    public let description: String
}

/// Compiles track data into geometry, surfaces and lookup grids (`track/buildTrack.ts`). Pure and
/// deterministic. With branches, also compiles one route per branch and outlines all the roads with
/// one set of walls; with `pitLane`, the pit lane's route too (Phase 4: the Grand Prix only).
public func buildTrack(_ def: TrackDefinition, pitLane: Bool = false) throws -> Track {
    let minWidth = def.minWidth ?? TrackRules.minWidth
    for (i, point) in def.points.enumerated() where point.width < minWidth {
        throw TrackError(description: "\(def.name): point \(i) is \(point.width) m wide, minimum is \(minWidth) m")
    }
    if let sectorPoints = def.sectorPoints {
        let increasing = sectorPoints.enumerated().allSatisfy { i, p in
            p > (i == 0 ? 0 : sectorPoints[i - 1])
        }
        if sectorPoints.count != TrackRules.sectorCount - 1 || !increasing
            || sectorPoints.contains(where: { $0 >= def.points.count })
        {
            throw TrackError(
                description: "\(def.name): sectorPoints must be \(TrackRules.sectorCount - 1) increasing control points after 0")
        }
    }
    for branch in def.branches ?? [] {
        for (i, point) in branch.points.enumerated() where point.width < TrackRules.minShortcutWidth {
            throw TrackError(description: "\(def.name): branch point \(i) is \(point.width) m wide")
        }
        if !(0 < branch.fromPoint && branch.fromPoint < branch.toPoint) {
            throw TrackError(description: "\(def.name): a branch must run forwards and not over the start line")
        }
    }

    let lane = pitLane ? def.pitLane : nil
    if pitLane && lane == nil { throw TrackError(description: "\(def.name): no pit lane in its data") }
    if let lane { try checkPitLane(def, lane) }

    let main = compileLoop(def, route: -1)
    var routes = (def.branches ?? []).enumerated().map { r, branch in
        compileRoute(def, branch, route: r, main: main)
    }
    if let lane { routes.append(compilePitLane(def, lane, route: routes.count, main: main)) }
    var track = main.track
    if routes.isEmpty { return track }
    let walls = outlineWalls(main.track, routes)
    track.walls = walls
    track.wallGrid = SegmentGrid(walls.map { ($0.a, $0.b) })
    track.routes = routes
    return track
}

private struct Loop {
    var track: Track
    /// Sample index of each control point.
    var controlIndices: [Int]
}

/// The main loop with `branch` driven instead of the stretch it skips, plus where the branch runs.
private func compileRoute(_ def: TrackDefinition, _ branch: TrackBranch, route: Int, main: Loop) -> Track {
    let fromPoint = branch.fromPoint
    let toPoint = branch.toPoint
    let removed = toPoint - fromPoint - 1
    let shift = branch.points.count - removed
    var routeDef = def
    routeDef.points = Array(def.points[0...fromPoint]) + branch.points + Array(def.points[toPoint...])
    // High kerbs keep their corners: ranges after the branch move with the points, inside it vanish.
    routeDef.highKerbs = def.highKerbs.compactMap { range in
        if range.toPoint <= fromPoint { return range }
        if range.fromPoint >= toPoint {
            return PointRange(fromPoint: range.fromPoint + shift, toPoint: range.toPoint + shift)
        }
        return nil
    }
    // Sectors are timed on main-loop progress: the route reuses the main loop's (set below).
    routeDef.sectorPoints = nil
    let loop = compileLoop(routeDef, route: route)
    func sampleAt(_ control: Int, _ of: Loop) -> TrackSample {
        of.track.samples[of.controlIndices[control]]
    }
    let span = BranchSpan(
        from: sampleAt(fromPoint, loop).distance,
        to: sampleAt(fromPoint + branch.points.count + 1, loop).distance,
        mainFrom: sampleAt(fromPoint, main).distance,
        mainTo: sampleAt(toPoint, main).distance,
        start: 0,
        mainLength: main.track.length)
    var track = loop.track
    track.sectorStarts = main.track.sectorStarts
    track.walls = loop.track.walls.map { wall in
        var w = wall
        w.progress = routeProgress(span, wall.progress)
        return w
    }
    track.branch = span
    return track
}

private func checkPitLane(_ def: TrackDefinition, _ lane: PitLaneDefinition) throws {
    let n = def.points.count
    func valid(_ p: Int) -> Bool { p >= 0 && p < n }
    if !valid(lane.fromPoint) || !valid(lane.toPoint) || lane.fromPoint == lane.toPoint {
        throw TrackError(description: "\(def.name): the pit lane must leave and rejoin at two of the track's points")
    }
    if lane.points.count < 2 || lane.points.contains(where: { !($0.width > 0) }) {
        throw TrackError(description: "\(def.name): the pit lane needs at least two points, each with a width")
    }
}

/// The pit lane's route: the main loop from where the lane rejoins (`toPoint`) round to where it
/// leaves (`fromPoint`), then the lane back to the start. No run-off and no kerbs on the lane.
private func compilePitLane(_ def: TrackDefinition, _ lane: PitLaneDefinition, route: Int, main: Loop) -> Track {
    let n = def.points.count
    var around: [TrackPoint] = []
    var i = lane.toPoint
    while true {
        around.append(def.points[i])
        if i == lane.fromPoint { break }
        i = (i + 1) % n
    }
    var laneDef = def
    laneDef.points = around + lane.points
    laneDef.highKerbs = []
    laneDef.sectorPoints = nil
    laneDef.runoffWidth = 0
    laneDef.runoffAreas = nil
    let loop = compileLoop(laneDef, route: route)
    let span = BranchSpan(
        from: loop.track.samples[loop.controlIndices[around.count - 1]].distance,
        to: loop.track.length,
        mainFrom: main.track.samples[main.controlIndices[lane.fromPoint]].distance,
        mainTo: main.track.samples[main.controlIndices[lane.toPoint]].distance,
        start: main.track.samples[main.controlIndices[lane.toPoint]].distance,
        mainLength: main.track.length)
    func onLane(_ i: Int) -> Bool { loop.track.samples[i].distance >= span.from }
    // The lane's rules come in metres along its points (from `fromPoint`): onto the route's distances.
    func routeAt(_ k: Int) -> Double {
        loop.track.samples[loop.controlIndices[around.count - 1 + k]].distance
    }
    let polyline = ([def.points[lane.fromPoint]] + lane.points).map(\.at)
    var metres: [Double] = [0]
    for k in 1..<polyline.count {
        metres.append(metres[k - 1] + jsHypot(polyline[k].x - polyline[k - 1].x, polyline[k].z - polyline[k - 1].z))
    }
    func toRoute(_ m: Double) -> Double {
        let found = metres.firstIndex { $0 > m } ?? -1
        let k = max(0, min(metres.count - 2, found - 1))
        let gap = metres[k + 1] - metres[k]
        let f = (m - metres[k]) / (gap != 0 ? gap : 1)
        return routeAt(k) + (routeAt(k + 1) - routeAt(k)) * f
    }
    let pitRules = PitLaneRules(
        limitFrom: toRoute(lane.limit.from),
        limitTo: toRoute(lane.limit.to),
        speedLimit: lane.speedLimit,
        boxes: lane.boxes.map(toRoute),
        // The garages are beyond the lane, away from the track.
        garageSide: lane.side == .right ? 1 : -1)
    func noKerbs(_ kerb: [KerbKind]) -> [KerbKind] {
        kerb.enumerated().map { i, k in onLane(i) ? .none : k }
    }
    var track = loop.track
    track.sectorStarts = main.track.sectorStarts
    track.sides.left.kerb = noKerbs(loop.track.sides.left.kerb)
    track.sides.right.kerb = noKerbs(loop.track.sides.right.kerb)
    track.walls = loop.track.walls.map { wall in
        var w = wall
        w.progress = routeProgress(span, wall.progress)
        return w
    }
    track.branch = span
    track.pit = true
    track.pitRules = pitRules
    return track
}

/// One outline for all the roads: the main loop's walls plus each route's walls along its branch,
/// leaving out every segment that lies entirely inside another road's drivable area, so the roads
/// open into each other where they split and join.
private func outlineWalls(_ main: Track, _ routes: [Track]) -> [WallSegment] {
    let roads: [(track: Track, branchOnly: Bool)] = [(main, false)] + routes.map { ($0, true) }
    func onBranch(_ track: Track, _ distance: Double) -> Bool {
        guard let branch = track.branch else { return true }
        return distance >= branch.from && distance <= branch.to
    }
    func inside(_ road: Track, _ p: Vec2) -> Bool {
        let loc = locateOnLoop(road, p)
        if !onBranch(road, loc.distance) { return false }
        let side: TrackSide = loc.lateral >= 0 ? .right : .left
        return abs(loc.lateral) < loc.halfWidth + runoffAt(road, side, loc.index) - 0.01
    }
    var walls: [WallSegment] = []
    for (r, road) in roads.enumerated() {
        let others = roads.enumerated().filter { $0.offset != r }.map(\.element.track)
        for wall in road.track.walls {
            if road.branchOnly && !onBranch(road.track, road.track.samples[wall.sample].distance) { continue }
            let covered = others.contains { inside($0, wall.a) && inside($0, wall.b) }
            if !covered { walls.append(wall) }
        }
    }
    return walls
}

/// One closed road: samples, kerbs, run-off and its own walls (`route`: −1 = main loop).
private func compileLoop(_ def: TrackDefinition, route: Int) -> Loop {
    let spline = sampleClosedSpline(def.points.map(\.at), spacing: TrackRules.sampleSpacing)
    let points = spline.samples
    let params = spline.params
    let controlIndices = spline.controlIndices
    let n = points.count
    func at<T>(_ list: [T], _ i: Int) -> T { list[wrapIndex(i, n)] }

    let tangents = (0..<n).map { i in (at(points, i + 1) - at(points, i - 1)).normalized }
    func spacing(_ i: Int) -> Double {
        let a = at(points, i)
        let b = at(points, i + 1)
        return jsHypot(b.x - a.x, b.z - a.z)
    }

    var distance = 0.0
    var samples: [TrackSample] = []
    samples.reserveCapacity(n)
    for i in 0..<n {
        let tangent = tangents[i]
        // Heading decreases when turning right, so negate to make right turns positive.
        let turn = wrapAngle(at(tangents, i + 1).heading - at(tangents, i - 1).heading)
        samples.append(
            TrackSample(
                position: points[i],
                tangent: tangent,
                normal: .right(tangent.heading),
                distance: distance,
                curvature: -turn / (spacing(i - 1) + spacing(i)),
                halfWidth: widthAt(def, params[i]) / 2,
                height: heightAt(def, params[i]),
                grade: 0))
        distance += spacing(i)
    }
    let length = distance
    let elevated = def.points.contains { $0.height != nil }
    // Grade: the height's change over the samples either side.
    if elevated {
        let heights = samples.map(\.height)
        for i in 0..<n {
            let rise = at(heights, i + 1) - at(heights, i - 1)
            samples[i].grade = rise / (spacing(i - 1) + spacing(i))
        }
    }

    // Side of the corner's inside for each sample (curvature > 0 = right turn = inside is right).
    func inside(_ i: Int) -> TrackSide { samples[i].curvature > 0 ? .right : .left }

    var kerbLeft = [KerbKind](repeating: .none, count: n)
    var kerbRight = [KerbKind](repeating: .none, count: n)
    var runoffLeft = [RunoffKind](repeating: .grass, count: n)
    var runoffRight = [RunoffKind](repeating: .grass, count: n)
    func toSamples(_ metres: Double) -> Int { Int(jsRound(metres / TrackRules.sampleSpacing)) }

    // Low kerbs: both sides of every real corner, extended a little before and after.
    let kerbsEverywhere = def.kerbs == .everywhere
    let kerbReach = toSamples(TrackRules.kerbExtension)
    for i in 0..<n {
        if !kerbsEverywhere && abs(samples[i].curvature) < TrackRules.kerbMinCurvature { continue }
        for k in -kerbReach...kerbReach {
            let j = wrapIndex(i + k, n)
            kerbLeft[j] = .low
            kerbRight[j] = .low
        }
    }

    // Gravel traps outside tight corners, mostly downstream where cars run wide.
    for i in 0..<n {
        if abs(samples[i].curvature) < TrackRules.gravelMinCurvature { continue }
        let outsideIsLeft = inside(i) == .right
        for k in -toSamples(TrackRules.gravelBefore)...toSamples(TrackRules.gravelAfter) {
            let j = wrapIndex(i + k, n)
            if outsideIsLeft { runoffLeft[j] = .gravel } else { runoffRight[j] = .gravel }
        }
    }

    // High kerbs on the inside of the declared corners (e.g. a chicane), replacing low ones.
    for range in def.highKerbs {
        let from = controlIndices[range.fromPoint]
        let span = (controlIndices[range.toPoint] - from + n) % n
        for k in 0...span {
            let i = (from + k) % n
            if abs(samples[i].curvature) >= TrackRules.highKerbMinCurvature {
                if inside(i) == .right { kerbRight[i] = .high } else { kerbLeft[i] = .high }
            }
        }
    }

    let extra = extraRunoff(def, samples, controlIndices, length)
    // A run-off area is paved, as the real escape areas are.
    if let extra {
        for i in 0..<n {
            if extra.left[i] > 0 { runoffLeft[i] = .asphalt }
            if extra.right[i] > 0 { runoffRight[i] = .asphalt }
        }
    }
    let walls =
        buildWall(samples, def, .left, route: route, extra: extra?.left)
        + buildWall(samples, def, .right, route: route, extra: extra?.right)
    let centerSegments = (0..<n).map { i in (samples[i].position, at(samples, i + 1).position) }

    let track = Track(
        name: def.name,
        maxHalfWidth: samples.map(\.halfWidth).max() ?? 0,
        elevated: elevated,
        runoffWidth: def.runoffWidth,
        maxRunoffWidth: extra.map { def.runoffWidth + max($0.left.max() ?? 0, $0.right.max() ?? 0) },
        kerbInset: def.kerbBand?.inset ?? TrackRules.kerbInset,
        kerbOutset: def.kerbBand?.outset ?? TrackRules.kerbOutset,
        length: length,
        sectorStarts: sectorStarts(def, samples, controlIndices, length),
        samples: samples,
        sides: TrackSides(
            left: TrackSideInfo(kerb: kerbLeft, runoff: runoffLeft, extraRunoff: extra?.left),
            right: TrackSideInfo(kerb: kerbRight, runoff: runoffRight, extraRunoff: extra?.right)),
        walls: walls,
        centerGrid: SegmentGrid(centerSegments),
        wallGrid: SegmentGrid(walls.map { ($0.a, $0.b) }),
        routes: [])
    return Loop(track: track, controlIndices: controlIndices)
}

/// Where each timing sector starts: at the declared control points, or every length / count.
private func sectorStarts(
    _ def: TrackDefinition, _ samples: [TrackSample], _ controlIndices: [Int], _ length: Double
) -> [Double] {
    let count = TrackRules.sectorCount
    let ends =
        def.sectorPoints.map { $0.map { samples[controlIndices[$0]].distance } }
        ?? (0..<(count - 1)).map { i in (Double(i + 1) * length) / Double(count) }
    return [0] + ends
}

/// Width at spline parameter `param`, eased between control points so edges stay smooth.
private func widthAt(_ def: TrackDefinition, _ param: Double) -> Double {
    let n = def.points.count
    let i = Int(param.rounded(.down))
    let f = param - Double(i)
    let a = def.points[i % n].width
    let b = def.points[(i + 1) % n].width
    return a + ((b - a) * (1 - cos(Double.pi * f))) / 2
}

/// Height at spline parameter `param`: a Catmull-Rom curve through the points' heights (0 where
/// they have none), so the grade changes smoothly too.
private func heightAt(_ def: TrackDefinition, _ param: Double) -> Double {
    let n = def.points.count
    let i = Int(param.rounded(.down))
    let t = param - Double(i)
    func h(_ k: Int) -> Double { def.points[wrapIndex(i + k, n)].height ?? 0 }
    let p0 = h(-1)
    let p1 = h(0)
    let p2 = h(1)
    let p3 = h(2)
    // Same order of operations as the web, so both compute the very same heights.
    let a = 2 * p1
    let b = (p2 - p0) * t
    let c = (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
    let d = (3 * p1 - p0 - 3 * p2 + p3) * t * t * t
    return 0.5 * (a + b + c + d)
}

/// Wall polyline offset from the centreline (local width + run-off), each segment facing the track.
private func buildWall(
    _ samples: [TrackSample], _ def: TrackDefinition, _ side: TrackSide, route: Int, extra: [Double]?
) -> [WallSegment] {
    let sign: Double = side == .right ? 1 : -1
    let points = samples.enumerated().map { i, s in
        s.position + s.normal * (sign * (s.halfWidth + def.runoffWidth + (extra?[i] ?? 0)))
    }
    return points.enumerated().map { i, a in
        let b = points[(i + 1) % points.count]
        let toRight = Vec2.right((b - a).heading)
        // The right wall faces left (towards the track) and vice versa.
        return WallSegment(
            a: a, b: b, normal: side == .right ? toRight * -1 : toRight, route: route, sample: i,
            progress: samples[i].distance)
    }
}

/// Each side's run-off beyond `runoffWidth` per sample, from `def.runoffAreas` (nil without any):
/// each area's `width` from its first control point to its last, eased in and out (smoothstep)
/// over `TrackRules.runoffAreaRamp` inside its ends.
private func extraRunoff(
    _ def: TrackDefinition, _ samples: [TrackSample], _ controlIndices: [Int], _ length: Double
) -> (left: [Double], right: [Double])? {
    guard let areas = def.runoffAreas, !areas.isEmpty else { return nil }
    let n = samples.count
    var left = [Double](repeating: 0, count: n)
    var right = [Double](repeating: 0, count: n)
    let ramp = TrackRules.runoffAreaRamp
    for area in areas {
        let from = controlIndices[area.fromPoint]
        let span = (controlIndices[area.toPoint] - from + n) % n
        /// Metres along the area from its start to sample `i` (over the line if it must).
        func along(_ i: Int) -> Double {
            (samples[i].distance - samples[from].distance + length).truncatingRemainder(dividingBy: length)
        }
        let total = along((from + span) % n)
        for k in 0...span {
            let i = (from + k) % n
            let m = along(i)
            let f = min(1, min(m, total - m) / ramp)
            let w = area.width * f * f * (3 - 2 * f)
            if area.side == .left { left[i] = max(left[i], w) } else { right[i] = max(right[i], w) }
        }
    }
    return (left, right)
}
