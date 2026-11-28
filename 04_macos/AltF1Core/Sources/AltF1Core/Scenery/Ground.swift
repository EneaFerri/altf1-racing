import Foundation

/// The ground's height round an elevated track (the web's `scenery/ground.ts`, Phase 3). Pure.
public enum Ground {
    /// The ground sits this far under the road and its run-off, so it never shows through (m).
    public static let drop: Double = 0.5
    /// Under the sea the ground lies this deep (the water is drawn at 0).
    public static let seaFloor: Double = -3
    /// One sample in this many counts for the road's heights round a point.
    private static let every = 4
    /// Past the walls the ground follows the road up to `landFrom` m, then blends into the land.
    private static let landFrom: Double = 40
    private static let landTo: Double = 200

    /// The road's heights round a point (1/d⁴ weighted), and how far beyond the walls it lies.
    static func roadSurround(_ track: Track) -> @Sendable (Vec2) -> (beyond: Double, height: Double) {
        let points = track.samples.enumerated().filter { $0.offset % every == 0 }.map(\.element)
        let xs = points.map(\.position.x)
        let zs = points.map(\.position.z)
        let hs = points.map(\.height)
        var spacing = 0.0
        for i in 1..<track.samples.count { spacing = max(spacing, track.samples[i].distance - track.samples[i - 1].distance) }
        let wallReach = track.maxHalfWidth + (track.maxRunoffWidth ?? track.runoffWidth) + 2 * Double(every) * spacing
        return { p in
            var sum = 0.0
            var weights = 0.0
            var nearest = Double.infinity
            for i in xs.indices {
                let d2 = (xs[i] - p.x) * (xs[i] - p.x) + (zs[i] - p.z) * (zs[i] - p.z)
                if d2 < nearest { nearest = d2 }
                let w = 1 / ((d2 + 25) * (d2 + 25))
                sum += w * hs[i]
                weights += w
            }
            if nearest < wallReach * wallReach {
                let beyond = clearance(track, p)
                if beyond <= 0 { return (beyond, locateOnTrack(track, p).height) }
                return (beyond, sum / weights)
            }
            return (nearest.squareRoot(), sum / weights)
        }
    }

    /// The land's height at a point (bilinear, clamped at the grid's edges).
    public static func landHeight(_ land: LandGrid, _ p: Vec2) -> Double {
        let fx = min(Double(land.cols) - 1.001, max(0, (p.x - land.minX) / land.cell))
        let fz = min(Double(land.rows) - 1.001, max(0, (p.z - land.minZ) / land.cell))
        let c = Int(fx)
        let r = Int(fz)
        let u = fx - Double(c)
        let v = fz - Double(r)
        func at(_ dc: Int, _ dr: Int) -> Double { land.heights[(r + dr) * land.cols + c + dc] }
        return (at(0, 0) * (1 - u) + at(1, 0) * u) * (1 - v) + (at(0, 1) * (1 - u) + at(1, 1) * u) * v
    }

    /// The ground on the real land (Monaco): the road less `drop` under it; past the walls the
    /// road's heights round, then the land's; `seaFloor` inside the sea (the coast a quay wall).
    public static func onLand(_ track: Track, _ land: LandGrid, sea: [[Vec2]]) -> @Sendable (Vec2) -> Double {
        let road = roadSurround(track)
        let seaBounds = sea.map(polygonBounds)
        return { p in
            let r = road(p)
            if r.beyond <= 0 { return r.height - drop }
            for (i, ring) in sea.enumerated() {
                let b = seaBounds[i]
                if p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ && insidePolygon(p, ring) {
                    return seaFloor
                }
            }
            let f = min(1, max(0, (r.beyond - landFrom) / (landTo - landFrom)))
            let eased = f * f * (3 - 2 * f)
            return r.height + (landHeight(land, p) - r.height) * eased
        }
    }

    /// On the real land, a lake's bed lies this far under its water (m; the web's `LAKE_DEPTH`).
    public static let lakeDepth: Double = 2
    /// Past its shore, the land eases from the lake's level to its own over this far (m).
    public static let shoreBand: Double = 30

    /// Points along a ring's edges, about 4 m apart.
    private static func shorePoints(_ ring: [Vec2]) -> [Vec2] {
        ring.indices.flatMap { i -> [Vec2] in
            let a = ring[i]
            let b = ring[(i + 1) % ring.count]
            let steps = max(1, Int((jsHypot(b.x - a.x, b.z - a.z) / 4).rounded(.up)))
            return (0..<steps).map { k in a + (b - a) * (Double(k) / Double(steps)) }
        }
    }

    /// A lake's water level on the land (the web's `lakeLevel`): the median of the dry ground along
    /// its shore (the DEM counts the trees on the bank, so not its lowest point).
    public static func lakeLevel(_ dry: (Vec2) -> Double, _ ring: [Vec2]) -> Double {
        let heights = shorePoints(ring).map(dry).sorted()
        return heights[heights.count / 2]
    }

    /// The ground with its lakes in it (the web's `withLakes`): inside each, `lakeDepth` under its
    /// level; past the shore, eased from that level to the land over `shoreBand` m.
    public static func withLakes(_ dry: @escaping @Sendable (Vec2) -> Double, _ lakes: [[Vec2]]) -> @Sendable (Vec2) -> Double {
        let shores = lakes.map { ring in (ring: ring, bounds: polygonBounds(ring), level: lakeLevel(dry, ring)) }
        return { p in
            let h = dry(p)
            for shore in shores {
                let b = shore.bounds
                if p.x < b.minX - shoreBand || p.x > b.maxX + shoreBand || p.z < b.minZ - shoreBand || p.z > b.maxZ + shoreBand {
                    continue
                }
                if insidePolygon(p, shore.ring) { return shore.level - lakeDepth }
                var d = Double.infinity
                for (i, a) in shore.ring.enumerated() {
                    let e = shore.ring[(i + 1) % shore.ring.count] - a
                    let t = max(0, min(1, ((p.x - a.x) * e.x + (p.z - a.z) * e.z) / (e.x * e.x + e.z * e.z == 0 ? 1 : e.x * e.x + e.z * e.z)))
                    d = min(d, jsHypot(p.x - a.x - e.x * t, p.z - a.z - e.z * t))
                }
                if d >= shoreBand { continue }
                let f = d / shoreBand
                return shore.level + (h - shore.level) * f * f * (3 - 2 * f)
            }
            return h
        }
    }

    /// The ground as a grid of heights: `cols` × `rows` vertices `cell` m apart from (minX, minZ).
    public struct Grid: Sendable {
        public let minX: Double
        public let minZ: Double
        public let cell: Double
        public let cols: Int
        public let rows: Int
        public var heights: [Double]

        /// The triangle holding (x, z) as the mesh draws it (each cell split from (c, r) to (c+1, r+1)).
        func triangle(_ x: Double, _ z: Double) -> (vertices: [Int], weights: [Double])? {
            let fx = (x - minX) / cell
            let fz = (z - minZ) / cell
            let c = Int(fx.rounded(.down))
            let r = Int(fz.rounded(.down))
            guard c >= 0, r >= 0, c < cols - 1, r < rows - 1 else { return nil }
            let u = fx - Double(c)
            let v = fz - Double(r)
            func at(_ dc: Int, _ dr: Int) -> Int { (r + dr) * cols + c + dc }
            return u >= v
                ? ([at(0, 0), at(1, 0), at(1, 1)], [1 - u, u - v, v])
                : ([at(0, 0), at(1, 1), at(0, 1)], [1 - v, u, v - u])
        }

        /// The drawn ground's height at (x, z); nil off the grid.
        public func height(_ p: Vec2) -> Double? {
            guard let t = triangle(p.x, p.z) else { return nil }
            return zip(t.vertices, t.weights).reduce(0) { $0 + heights[$1.0] * $1.1 }
        }
    }

    /// The ground an elevated track is drawn on: `height` on an 8 m grid reaching 400 m past the
    /// track, lowered wherever its triangles would rise over the road or its run-off (with
    /// `routes`, over the pit lane too). Rows are computed in parallel.
    public static func grid(_ track: Track, height: @escaping @Sendable (Vec2) -> Double, routes: Bool = false) -> Grid {
        let area = trackBounds(track, margin: 400)
        let cell = 8.0
        let cols = Int(((area.maxX - area.minX) / cell).rounded(.up)) + 1
        let rows = Int(((area.maxZ - area.minZ) / cell).rounded(.up)) + 1
        var heights = [Double](repeating: 0, count: cols * rows)
        heights.withUnsafeMutableBufferPointer { buffer in
            nonisolated(unsafe) let out = buffer.baseAddress!
            DispatchQueue.concurrentPerform(iterations: rows) { r in
                for c in 0..<cols { out[r * cols + c] = height(Vec2(area.minX + Double(c) * cell, area.minZ + Double(r) * cell)) }
            }
        }
        var grid = Grid(minX: area.minX, minZ: area.minZ, cell: cell, cols: cols, rows: rows, heights: heights)
        settleUnderRoad(&grid, track, routes: routes)
        return grid
    }

    /// Lowers the grid wherever its triangles rise above the road or its run-off.
    static func settleUnderRoad(_ grid: inout Grid, _ track: Track, routes: Bool) {
        var under = track.samples.enumerated().map { i, s in
            (s, s.halfWidth + max(runoffAt(track, .left, i), runoffAt(track, .right, i)) + 0.5)
        }
        if routes {
            for road in track.routes {
                for s in road.samples where road.branch.map({ s.distance >= $0.from && s.distance <= $0.to }) ?? true {
                    under.append((s, s.halfWidth + road.runoffWidth + 0.5))
                }
            }
        }
        for _ in 0..<8 {
            var raised = 0
            for (s, reach) in under {
                var o = -reach
                while o <= reach {
                    defer { o += 1.5 }
                    let p = s.position + s.normal * o
                    guard let t = grid.triangle(p.x, p.z) else { continue }
                    let h = zip(t.vertices, t.weights).reduce(0) { $0 + grid.heights[$1.0] * $1.1 }
                    let excess = h - (s.height - drop)
                    if excess <= 0.01 { continue }
                    raised += 1
                    for i in t.vertices { grid.heights[i] -= excess }
                }
            }
            if raised == 0 { break }
        }
    }
}
