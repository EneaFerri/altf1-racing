import AltF1Core
import Foundation
import simd

/// Baku's landmarks and the old town's walls (X.5d; the web's `createFlame`, `createMaidenTower`,
/// `createGovernmentHouse`, `createCarpetMuseum` and `scenery/cityWalls.ts`): each on its real OSM
/// footprint and height, in honey limestone, blue glass and carpet (01_docs/themes.md).
nonisolated extension SceneryGeometry {
    /// Facade texture repeats (m): one bay, one floor.
    private static let bay: Float = 3.2

    // MARK: The Flame Towers

    /// One Flame Tower: its footprint rising as a flame of blue glass, full-bodied most of the way
    /// up, then curling in to a pointed tip leaning towards the footprint's far end.
    static func addFlame(_ parts: inout SceneryParts, _ ring: [Vec2], base: Float, height: Float) {
        let rings = 24
        let tip: Double = 0.06
        let leanShare: Double = 0.35
        let c = ring.reduce(Vec2.zero, +) * (1 / Double(ring.count))
        let far = ring.max { ($0 - c).length < ($1 - c).length }!
        let levels: [[SIMD3<Float>]] = (0...rings).map { k in
            let t = Double(k) / Double(rings)
            let keep = 1 - (1 - tip) * pow(t, 5)
            let middle = c + (far - c) * (leanShare * t * t)
            return ring.map { p in
                let q = middle + (p - c) * keep
                return SIMD3(Float(q.x), base + height * Float(t), Float(q.z))
            }
        }
        let axisAt: (Int) -> SIMD3<Float> = { k in
            let l = levels[k]
            return l.reduce(.zero, +) / Float(l.count)
        }
        for k in 0..<rings {
            let (low, high) = (levels[k], levels[k + 1])
            let inside = (axisAt(k) + axisAt(k + 1)) / 2
            var u: Float = 0
            for i in 0..<low.count {
                let j = (i + 1) % low.count
                let du = simd_distance(low[i], low[j]) / bay
                let (v0, v1) = (low[i].y / 3.6, high[i].y / 3.6)
                parts[.flameGlass].face(
                    [low[i], low[j], high[j], high[i]], inside: inside,
                    uv: [SIMD2(u, v0), SIMD2(u + du, v0), SIMD2(u + du, v1), SIMD2(u, v1)])
                u += du
            }
        }
        // The tip: a fan up to a point 2 m above the last ring.
        let top = levels[rings]
        let point = axisAt(rings) + SIMD3(0, 2, 0)
        for i in 0..<top.count {
            parts[.flameGlass].face([top[i], top[(i + 1) % top.count], point], inside: axisAt(rings), uv: [])
        }
    }

    // MARK: The Maiden Tower

    /// The Maiden Tower (Qız Qalası, 12th century): a round limestone tower 16.5 m across and 29.5 m
    /// high, its buttress towards the sea (the track's side), battlements on top.
    static func addMaidenTower(_ parts: inout SceneryParts, _ track: Track, _ ring: [Vec2], base: Float) {
        let radius: Float = 8.25
        let height: Float = 29.5
        let c = ring.reduce(Vec2.zero, +) * (1 / Double(ring.count))
        let centre = SIMD3(Float(c.x), base, Float(c.z))
        addCylinder(&parts[.limestone], centre, bottom: radius * 1.04, top: radius, height: height, sides: 40, cap: true)
        let near = track.samples.min { $0.position.distance(to: c) < $1.position.distance(to: c) }!.position
        let yaw = Float(atan2(near.x - c.x, near.z - c.z))
        let out = SIMD3(sin(yaw), 0, cos(yaw))
        parts[.limestone].box(
            placed(centre + out * radius + SIMD3(0, (height - 2) / 2, 0), yaw: yaw, scale: SIMD3(7, height - 2, 6)),
            tile: bay)
        let merlons = 24
        for i in stride(from: 0, to: merlons, by: 2) {
            let a = Float(i) / Float(merlons) * 2 * .pi
            let at = centre + SIMD3(sin(a), 0, cos(a)) * (radius - 0.4) + SIMD3(0, height + 0.65, 0)
            parts[.limestone].box(placed(at, yaw: a, scale: SIMD3(1.4, 1.3, 0.8)), tile: bay)
        }
    }

    // MARK: Government House

    /// Government House (Hökumət Evi) on Azadliq Square: its U-shaped footprint and height in pale
    /// stone, a stepped tower on the middle of the wing facing the track, corner turrets.
    static func addGovernmentHouse(_ parts: inout SceneryParts, _ track: Track, _ ring: [Vec2], base: Float, height: Float) {
        let top = base + height
        parts[.belleEpoque].walls(ring, bottom: base, top: top, bay: 4, floor: 4.5)
        parts[.roofFlat].polygon(ring, y: top)
        let c = ring.reduce(Vec2.zero, +) * (1 / Double(ring.count))
        let near = track.samples.min { $0.position.distance(to: c) < $1.position.distance(to: c) }!.position
        let size = 18.0
        // The front wing: the middle of the edge facing the track, the tower stepped in by half its size.
        let edges = ring.indices.map { (ring[$0], ring[($0 + 1) % ring.count]) }.filter { $0.0.distance(to: $0.1) > size }
        guard
            let (a, b) = edges.min(by: { (($0.0 + $0.1) * 0.5 - near).length < (($1.0 + $1.1) * 0.5 - near).length })
        else { return }
        let mid = (a + b) * 0.5
        let inward = (c - mid) * (1 / max((c - mid).length, 1))
        let at = mid + inward * (size / 2)
        let yaw = Float(atan2(b.x - a.x, b.z - a.z))
        let rise: Float = 22
        let crown: Float = 9
        let foot = SIMD3(Float(at.x), 0, Float(at.z))
        parts[.belleEpoque].box(
            placed(foot + SIMD3(0, (base + top + rise) / 2, 0), yaw: yaw, scale: SIMD3(Float(size), top + rise - base, Float(size))),
            tile: 4)
        parts[.belleEpoque].box(
            placed(foot + SIMD3(0, top + rise + crown / 2, 0), yaw: yaw, scale: SIMD3(Float(size) * 0.6, crown, Float(size) * 0.6)),
            tile: 4)
        parts[.roofFlat].pyramid(
            placed(foot + SIMD3(0, top + rise + crown, 0), yaw: yaw + .pi / 4), sides: 4, radius: Float(size) * 0.42, height: 7)
        for corner in ring.sorted(by: { clearance(track, $0) < clearance(track, $1) }).dropFirst().prefix(2) {
            let p = corner + (c - corner) * 0.04
            let turret = SIMD3(Float(p.x), 0, Float(p.z))
            parts[.belleEpoque].box(placed(turret + SIMD3(0, (base + top + 6) / 2, 0), yaw: yaw, scale: SIMD3(6, top + 6 - base, 6)), tile: 4)
            parts[.roofFlat].pyramid(placed(turret + SIMD3(0, top + 6, 0), yaw: yaw + .pi / 4), sides: 4, radius: 4.2, height: 4)
        }
    }

    // MARK: The Carpet Museum

    /// The Carpet Museum on the boulevard: a carpet half rolled up along its footprint's long side,
    /// lying on the ground, its ends wound.
    static func addCarpetMuseum(_ parts: inout SceneryParts, _ ring: [Vec2], base: Float) {
        var (a, b) = (ring[0], ring[0])
        for p in ring {
            for q in ring where p.distance(to: q) > a.distance(to: b) { (a, b) = (p, q) }
        }
        let length = a.distance(to: b)
        let axis = (b - a) * (1 / length)
        let normal = Vec2(-axis.z, axis.x)
        let across = ring.map { ($0 - a).x * normal.x + ($0 - a).z * normal.z }
        let radius = Float(min(9, (across.max()! - across.min()!) / 2))
        let mid = (across.max()! + across.min()!) / 2
        let centre = (a + b) * 0.5 + normal * mid
        let half = length * 0.45
        let sides = 32
        let x = SIMD3(Float(axis.x), 0, Float(axis.z))
        let n = SIMD3(Float(normal.x), 0, Float(normal.z))
        let hub = SIMD3(Float(centre.x), base + radius, Float(centre.z))
        func rim(_ end: Float, _ k: Int) -> SIMD3<Float> {
            let angle = Float(k) / Float(sides) * 2 * .pi
            return hub + x * end + n * (cos(angle) * radius) + SIMD3(0, sin(angle) * radius, 0)
        }
        let facet = 2 * .pi * radius / Float(sides)
        for k in 0..<sides {
            let (u0, u1) = (Float(k) * facet / 8, Float(k + 1) * facet / 8)
            let (v0, v1) = (Float(0), Float(2 * half) / 8)
            parts[.carpet].face(
                [rim(-Float(half), k), rim(-Float(half), k + 1), rim(Float(half), k + 1), rim(Float(half), k)], inside: hub,
                uv: [SIMD2(u0, v0), SIMD2(u1, v0), SIMD2(u1, v1), SIMD2(u0, v1)])
        }
        for end in [-Float(half), Float(half)] {
            let corners = (0..<sides).map { rim(end, $0) }
            let uv = (0..<sides).map { k -> SIMD2<Float> in
                let angle = Float(k) / Float(sides) * 2 * .pi
                return SIMD2(0.5 + cos(angle) * 0.5, 0.5 + sin(angle) * 0.5)
            }
            parts[.carpetEnd].face(corners, inside: hub, uv: uv)
        }
    }

    // MARK: The old town's walls

    /// The old town's walls (Icherisheher, beside the castle section): limestone in ashlar courses on
    /// the ground, a walkway, battlements on the side away from the track, a round tower every 34 m
    /// standing out behind.
    static func addCityWalls(_ parts: inout SceneryParts, _ track: Track, _ walls: [CircuitScenery.CityWall], _ ground: (Vec2) -> Double) {
        let footing: Float = 1
        for wall in walls {
            let line = alongTrack(track, wall.path, step: 2)
            guard line.count >= 2 else { continue }
            let half = wall.thickness / 2
            let merlon: Float = 1.3
            let body = Float(wall.height) - merlon
            let away: Double = (wall.path.first?.gap ?? 1) >= 0 ? 1 : -1
            let sides: [Vec2] = line.indices.map { i in
                let a = line[max(0, i - 1)]
                let b = line[min(line.count - 1, i + 1)]
                let d = b - a
                let len = max(d.length, 1e-9)
                return Vec2(-d.z / len * away, d.x / len * away)
            }
            func at(_ i: Int, _ by: Double) -> Vec2 { line[i] + sides[i] * by }
            func p3(_ p: Vec2, _ y: Float) -> SIMD3<Float> { SIMD3(Float(p.x), Float(ground(p)) + y, Float(p.z)) }
            var u: Float = 0
            for i in 0..<(line.count - 1) {
                let du = Float(line[i].distance(to: line[i + 1])) / bay
                let centre = p3((line[i] + line[i + 1]) * 0.5, body / 2)
                for by in [-half, half] {
                    let (a, b) = (at(i, by), at(i + 1, by))
                    parts[.limestone].face(
                        [p3(a, -footing), p3(b, -footing), p3(b, body), p3(a, body)], inside: centre,
                        uv: [SIMD2(u, (body + footing) / bay), SIMD2(u + du, (body + footing) / bay), SIMD2(u + du, 0), SIMD2(u, 0)])
                }
                parts[.limestone].face(
                    [p3(at(i, -half), body), p3(at(i + 1, -half), body), p3(at(i + 1, half), body), p3(at(i, half), body)],
                    inside: centre - SIMD3(0, 1, 0), uv: [SIMD2(u, 0), SIMD2(u + du, 0), SIMD2(u + du, 1), SIMD2(u, 1)])
                u += du
            }
            for i in [0, line.count - 1] {
                let centre = p3(line[i], body / 2)
                let inward = i == 0 ? line[1] - line[0] : line[i - 1] - line[i]
                let probe = centre + SIMD3(Float(inward.x), 0, Float(inward.z)) * 0.1
                parts[.limestone].face(
                    [p3(at(i, -half), -footing), p3(at(i, half), -footing), p3(at(i, half), body), p3(at(i, -half), body)],
                    inside: probe, uv: [SIMD2(0, 1), SIMD2(1, 1), SIMD2(1, 0), SIMD2(0, 0)])
            }
            // Battlements on the outer edge, and round towers.
            var along = 0.0
            var nextMerlon = 0.0
            var nextTower = 17.0
            for i in 0..<(line.count - 1) {
                let step = line[i].distance(to: line[i + 1])
                let yaw = Float(atan2(line[i + 1].x - line[i].x, line[i + 1].z - line[i].z))
                while nextMerlon < along + step {
                    let f = (nextMerlon - along) / step
                    let p = at(i, half - 0.45) + (at(i + 1, half - 0.45) - at(i, half - 0.45)) * f
                    parts[.limestone].box(placed(p3(p, body + merlon / 2), yaw: yaw, scale: SIMD3(0.9, merlon, 1.2)), tile: 1.6)
                    nextMerlon += 2.4
                }
                if nextTower < along + step {
                    let f = (nextTower - along) / step
                    let reach = half + 3.4 * 0.4
                    let p = at(i, reach) + (at(i + 1, reach) - at(i, reach)) * f
                    addCylinder(
                        &parts[.limestone], p3(p, -footing), bottom: 3.8, top: 3.4,
                        height: Float(wall.height) + 1.8 + footing, sides: 20, cap: true)
                    nextTower += 34
                }
                along += step
            }
        }
    }

    // MARK: Helpers

    /// A round tower of `sides` facets standing on `foot`, its stone in whole bays round it and
    /// floors up it (the prism's uv spans each facet once: stretched on a tall one).
    private static func addCylinder(
        _ builder: inout MeshBuilder, _ foot: SIMD3<Float>, bottom: Float, top: Float, height: Float, sides: Int, cap: Bool
    ) {
        let axis = foot + SIMD3(0, height / 2, 0)
        let facet = 2 * .pi * bottom / Float(sides)
        let v = height / bay
        for k in 0..<sides {
            let (a0, a1) = (Float(k) / Float(sides) * 2 * .pi, Float(k + 1) / Float(sides) * 2 * .pi)
            let corners = [
                foot + SIMD3(cos(a0) * bottom, 0, sin(a0) * bottom), foot + SIMD3(cos(a1) * bottom, 0, sin(a1) * bottom),
                foot + SIMD3(cos(a1) * top, height, sin(a1) * top), foot + SIMD3(cos(a0) * top, height, sin(a0) * top),
            ]
            let (u0, u1) = (Float(k) * facet / bay, Float(k + 1) * facet / bay)
            builder.face(corners, inside: axis, uv: [SIMD2(u0, v), SIMD2(u1, v), SIMD2(u1, 0), SIMD2(u0, 0)])
        }
        if cap {
            let ring = (0..<sides).map { k -> SIMD3<Float> in
                let a = Float(k) / Float(sides) * 2 * .pi
                return foot + SIMD3(cos(a) * top, height, sin(a) * top)
            }
            builder.face(ring, inside: axis, uv: ring.map { SIMD2($0.x / bay, $0.z / bay) })
        }
    }
}
