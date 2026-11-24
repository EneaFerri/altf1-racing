import AltF1Core
import Foundation
import simd

/// The scenery's meshes before they reach the GPU: one `MeshBuilder` per material (few draw
/// calls), and the style of every wall. Pure data, built off the main thread.
nonisolated struct SceneryParts: Sendable {
    enum Part: Hashable, Sendable {
        case groundLow, groundHigh
        case facade(Int), glass, roofTiles, roofFlat
        case belleEpoque, copper, chapel
        case sea, piers, pool
        case hullWhite, hullNavy, superstructure, cabinGlass
        case palmTrunk, palmFronds, treeTrunk, treeCrown
        case standCrowd, standConcrete, standRoof, pitConcrete, pitGarage, pitLane
        case tunnelInside, tunnelOutside, tunnelLights
        case hills
        /// A night race: walls with lit windows (three tones, the towers), dark roofs.
        case nightWall(Int), nightTower, roofNight
        case floodPole, floodLamp
        /// Singapore's landmarks: the Flyer, Marina Bay Sands' SkyPark, the Esplanade's durians.
        case flyerSteel, flyerRim, flyerCapsule, skyParkDeck, skyParkEdge, durian
    }

    var meshes: [Part: MeshBuilder] = [:]
    /// The style of each of `track.walls`.
    var wallStyles: [WallStyle] = []

    subscript(part: Part) -> MeshBuilder {
        get { meshes[part] ?? MeshBuilder() }
        set { meshes[part] = newValue }
    }
}

/// Builds a real circuit's surroundings (the web's `realCircuitTheme.ts` and `scenery/*`): on the
/// real land when it has one, every building on its footprint, the sea, piers, pools, yachts,
/// palms, trees in the woods, grandstands, pit buildings, the tunnel, the landmarks.
nonisolated enum SceneryGeometry {
    /// Riviera facades: (wall, shutter), the web's six.
    static let facades: [(UInt32, UInt32)] = [
        (0xEFE2C4, 0x5E7D4F), (0xE2AD6A, 0x7A4B2C), (0xEAA98F, 0x5E7D4F),
        (0xF0D98E, 0x8A8F93), (0xF3F0E8, 0x4D6F8A), (0xD98F6A, 0xEFE2C4),
    ]
    /// Buildings taller than this get the glass facade (m); those over 20 m a flat roof.
    private static let tower = 45.0
    /// A building on a slope rises at least this much above its uphill side (m).
    private static let uphillFloor = 3.2
    /// The sea's surface (m).
    static let seaLevel: Float = 0.15

    struct Result: Sendable {
        var parts: SceneryParts
        /// The drawn ground (nil on a flat circuit: the plain ground plane stays).
        var ground: Ground.Grid?
    }

    static func build(_ track: Track, _ scenery: CircuitScenery, _ land: LandGrid?, _ look: CircuitLook) -> Result {
        var parts = SceneryParts()
        let sea = scenery.sea ?? []
        // The ground: on the real land (Monaco), else flat at 0.
        var grid: Ground.Grid?
        if let land, track.elevated {
            let height = Ground.onLand(track, land, sea: sea)
            grid = Ground.grid(track, height: height, routes: track.routes.contains(where: \.pit))
        }
        let ground: (Vec2) -> Double = { p in grid?.height(p) ?? 0 }
        if let grid { addGround(&parts, grid, look) }

        parts.wallStyles = wallStyles(track, scenery, look.barrier)
        var keepClear: [Circle] = []
        addStands(&parts, track, scenery, ground, &keepClear)
        addPit(&parts, track, scenery, ground, &keepClear)

        let city = (scenery.city ?? []).map { b -> TownBuilding in
            guard track.elevated else { return b }
            var on = b
            if b.base > 0 {
                // On the tunnel's roof: from the road under it.
                let c = b.points.reduce(Vec2.zero, +) * (1 / Double(b.points.count))
                on.base = b.base + locateOnTrack(track, c).height
            } else {
                let under = b.points.map(ground)
                on.base = under.min()!
                on.height = max(b.height, under.max()! - on.base + uphillFloor)
            }
            return on
        }
        addTown(&parts, track, city, look)
        if look.night { addFloodlights(&parts, track, ground) }
        addWater(&parts, track, scenery, ground)
        if let tunnel = scenery.tunnel { addTunnel(&parts, track, tunnel) }
        if look.hills { addHills(&parts, track, sea) }
        addTrees(&parts, track, scenery, city, look, ground, keepClear)
        return Result(parts: parts, ground: grid)
    }

    // MARK: Ground

    /// The land as a mesh: stone paving in the town, green slopes above `look.highland`.
    private static func addGround(_ parts: inout SceneryParts, _ grid: Ground.Grid, _ look: CircuitLook) {
        var low = MeshBuilder()
        var high = MeshBuilder()
        func h(_ c: Int, _ r: Int) -> Float { Float(grid.heights[r * grid.cols + c]) }
        func point(_ c: Int, _ r: Int) -> SIMD3<Float> {
            SIMD3(Float(grid.minX + Double(c) * grid.cell), h(c, r), Float(grid.minZ + Double(r) * grid.cell))
        }
        func normal(_ c: Int, _ r: Int) -> SIMD3<Float> {
            let dx = h(min(c + 1, grid.cols - 1), r) - h(max(c - 1, 0), r)
            let dz = h(c, min(r + 1, grid.rows - 1)) - h(c, max(r - 1, 0))
            return simd_normalize(SIMD3(-dx, 2 * Float(grid.cell), -dz))
        }
        let tile: Float = 6
        for r in 0..<(grid.rows - 1) {
            for c in 0..<(grid.cols - 1) {
                // Split along (c, r)–(c+1, r+1), as `Ground.Grid.triangle` reads it.
                for tri in [[(c, r), (c + 1, r), (c + 1, r + 1)], [(c, r), (c + 1, r + 1), (c, r + 1)]] {
                    let average = tri.reduce(Float(0)) { $0 + h($1.0, $1.1) } / 3
                    let isHigh = look.highland.map { average > Float($0) } ?? false
                    let base = UInt32(isHigh ? high.positions.count : low.positions.count)
                    for (cc, rr) in tri {
                        let p = point(cc, rr)
                        if isHigh {
                            high.positions.append(p)
                            high.normals.append(normal(cc, rr))
                            high.uvs.append(SIMD2(p.x, p.z) / 10)
                        } else {
                            low.positions.append(p)
                            low.normals.append(normal(cc, rr))
                            low.uvs.append(SIMD2(p.x, p.z) / tile)
                        }
                    }
                    // Counter-clockwise seen from above.
                    if isHigh { high.indices += [base, base + 2, base + 1] } else { low.indices += [base, base + 2, base + 1] }
                }
            }
        }
        parts[.groundLow] = low
        parts[.groundHigh] = high
    }

    // MARK: Walls

    /// Concrete by the stands and the pit lane, tyres beside gravel, else the circuit's barrier.
    static func wallStyles(_ track: Track, _ scenery: CircuitScenery, _ barrier: WallStyle) -> [WallStyle] {
        let margin = 15 / track.length
        func stretches(_ spots: [TrackSpot]) -> [(TrackSide, Double, Double)] {
            let side: TrackSide = spots[0].gap >= 0 ? .right : .left
            let ats = spots.map(\.at)
            var from = ats.min()!
            var to = ats.max()!
            if to - from > 0.5 {
                from = ats.filter { $0 < 0.5 }.max()!
                to = ats.filter { $0 >= 0.5 }.min()!
                return [(side, to - margin, 1), (side, 0, from + margin)]
            }
            return [(side, from - margin, to + margin)]
        }
        let concrete = scenery.stands.flatMap { stretches($0.footprint) } + stretches(scenery.pitLane.path)
        return track.walls.map { wall in
            if wall.route >= 0 { return .concrete }
            let side: TrackSide = wall.normal.dot(track.samples[wall.sample].normal) < 0 ? .right : .left
            let at = wall.progress / track.length
            if concrete.contains(where: { $0.0 == side && at >= $0.1 && at <= $0.2 }) { return .concrete }
            if track.sides[side].runoff[wall.sample] == .gravel { return .tyres }
            return barrier
        }
    }

    // MARK: Stands and pits

    /// Grandstands: seven stepped rows of spectators, a back wall, a roof sloping towards the track.
    private static func addStands(
        _ parts: inout SceneryParts, _ track: Track, _ scenery: CircuitScenery, _ ground: (Vec2) -> Double,
        _ keepClear: inout [Circle]
    ) {
        let rows = 7
        let rowDepth: Float = 1.4
        let rowRise: Float = 0.9
        let reach = Reach(back: Double(Float(rows) * rowDepth) + 0.6, roof: 3)
        for stand in scenery.stands {
            for box in standPieces(track, stand.footprint, reach, pieceLength: 15) {
                let y = Float(track.elevated ? box.corners.map(ground).min()! : 0)
                let frame = placed(
                    SIMD3(Float(box.front.x), y, Float(box.front.z)), yaw: Float(atan2(box.towardsTrack.x, box.towardsTrack.z)))
                let length = Float(box.length)
                let depth = Float(rows) * rowDepth
                for row in 0..<rows {
                    let height = Float(row + 1) * rowRise
                    parts[.standCrowd].box(
                        frame * placed(SIMD3(0, height / 2, -(Float(row) + 0.5) * rowDepth), scale: SIMD3(length, height, rowDepth)),
                        tile: 4)
                }
                let back = Float(rows) * rowRise + 5
                parts[.standConcrete].box(frame * placed(SIMD3(0, back / 2, -depth - 0.3), scale: SIMD3(length, back, 0.6)), tile: 3)
                parts[.standRoof].box(
                    frame * placed(SIMD3(0, back, -depth / 2 + 1), pitch: 0.12, scale: SIMD3(length + 2, 0.4, depth + 4)), tile: 3)
                keepClear.append(box.cover)
            }
        }
    }

    /// The pit buildings (garages facing the lane) and, outside the Grand Prix, the pit lane itself.
    private static func addPit(
        _ parts: inout SceneryParts, _ track: Track, _ scenery: CircuitScenery, _ ground: (Vec2) -> Double,
        _ keepClear: inout [Circle]
    ) {
        let drivable = track.routes.contains(where: \.pit)
        let onLane = pitLaneFootprint(track, margin: 1)
        for building in scenery.pitBuildings {
            let box = footprintBox(track, building)
            if box.corners.contains(where: { c in onLane.contains { hypot(c.x - $0.x, c.z - $0.z) < $0.r } }) { continue }
            let height: Float = box.length > 150 ? 9 : 6
            let depth = Float(max(8, box.depth))
            let y = Float(track.elevated ? box.corners.map(ground).min()! : 0)
            let frame = placed(SIMD3(Float(box.front.x), y, Float(box.front.z)), yaw: Float(atan2(box.towardsTrack.x, box.towardsTrack.z)))
            parts[.pitConcrete].box(frame * placed(SIMD3(0, height / 2, -depth / 2), scale: SIMD3(Float(box.length), height, depth)), tile: 4)
            // The garages: a row of doors on the face towards the lane.
            parts[.pitGarage].box(frame * placed(SIMD3(0, 2.6, 0.03), scale: SIMD3(Float(box.length) - 1, 5, 0.05)), tile: 6)
            keepClear.append(box.cover)
        }
        if drivable {
            keepClear += pitLaneFootprint(track, margin: 4)
        } else {
            let path = alongTrack(track, scenery.pitLane.path, step: 8)
            addRibbon(&parts[.pitLane], path, width: Float(scenery.pitLane.width), lift: 0.03, ground: ground, tile: 8)
            keepClear += polylineFootprint(path, r: scenery.pitLane.width / 2 + 4, step: 8)
        }
    }

    /// A flat strip `width` wide along an open polyline, on the ground.
    static func addRibbon(_ builder: inout MeshBuilder, _ points: [Vec2], width: Float, lift: Float, ground: (Vec2) -> Double, tile: Float) {
        guard points.count >= 2 else { return }
        let half = Double(width / 2)
        var along: Float = 0
        for i in 0..<(points.count - 1) {
            let (a, b) = (points[i], points[i + 1])
            let d = (b - a).normalized
            let n = Vec2(-d.z, d.x)
            func at(_ p: Vec2) -> SIMD3<Float> { SIMD3(Float(p.x), Float(ground(p)) + lift, Float(p.z)) }
            let length = Float(a.distance(to: b))
            let up = SIMD3<Float>(0, 1, 0)
            builder.quad(
                at(a - n * half), at(a + n * half), at(b - n * half), at(b + n * half), normals: up, up,
                uv: SIMD2(0, along / tile), SIMD2(width / tile, along / tile), SIMD2(0, (along + length) / tile),
                SIMD2(width / tile, (along + length) / tile))
            along += length
        }
    }

    // MARK: Town

    /// Every building on its real footprint and height: pastel facades (seeded per building), glass
    /// towers, terracotta or flat roofs; the Casino and the chapel by their own models.
    private static func addTown(_ parts: inout SceneryParts, _ track: Track, _ city: [TownBuilding], _ look: CircuitLook) {
        var random = SceneryRandom(11)
        for b in city {
            let ring = open(b.points)
            guard ring.count >= 3 else { continue }
            switch b.landmark ?? "" {
            case "casino":
                addCasino(&parts, track, ring, base: Float(b.base), height: Float(max(b.height, 18)))
                continue
            case "chapel":
                addChapel(&parts, track, ring, base: Float(b.base), height: Float(min(b.height, 9)))
                continue
            case "flyer":
                addFlyer(&parts, track, ring, base: Float(b.base))
                continue
            case "durian":
                addDurian(&parts, ring, base: Float(b.base))
                continue
            default: break
            }
            let pick = Int(random.next() * Double(facades.count))
            let top = Float(b.base + b.height)
            if look.night {
                // Dark walls lit window by window; eight bays and floors per texture repeat.
                let wall: SceneryParts.Part = b.height > tower ? .nightTower : .nightWall(pick % 3)
                parts[wall].walls(ring, bottom: Float(b.base), top: top, cells: 8)
                parts[.roofNight].polygon(ring, y: top)
            } else {
                if b.height > tower {
                    parts[.glass].walls(ring, bottom: Float(b.base), top: top, bay: 3, floor: 3.6)
                } else {
                    parts[.facade(pick)].walls(ring, bottom: Float(b.base), top: top)
                }
                parts[b.height > 20 ? .roofFlat : .roofTiles].polygon(ring, y: top)
            }
        }
        // Marina Bay Sands: its three towers are buildings; the SkyPark joins them on top.
        let sands = city.filter { $0.landmark == "sands" }
        if sands.count > 1 { addSkyPark(&parts, sands) }
    }

    // MARK: Singapore's landmarks

    /// The Singapore Flyer: a 75 m wheel on its hub 90 m up, lit rim, 28 capsules, its face to the track.
    private static func addFlyer(_ parts: inout SceneryParts, _ track: Track, _ ring: [Vec2], base: Float) {
        let c = ring.reduce(Vec2.zero, +) * (1 / Double(ring.count))
        let near = track.samples.min { $0.position.distance(to: c) < $1.position.distance(to: c) }!.position
        let radius: Float = 75
        let hub: Float = 90
        // The wheel's own frame: X and Y in its plane, its face (+Z) towards the track.
        let frame = placed(SIMD3(Float(c.x), base + hub, Float(c.z)), yaw: Float(atan2(near.x - c.x, near.z - c.z)))
        func at(_ angle: Float, _ r: Float) -> SIMD3<Float> { SIMD3(cos(angle) * r, sin(angle) * r, 0) }
        let segments = 48
        for k in 0..<segments {
            let a0 = Float(k) / Float(segments) * 2 * .pi
            let a1 = Float(k + 1) / Float(segments) * 2 * .pi
            let mid = (at(a0, radius) + at(a1, radius)) / 2
            let length = simd_distance(at(a0, radius), at(a1, radius)) + 0.3
            parts[.flyerRim].box(frame * placed(mid, roll: (a0 + a1) / 2 + .pi / 2, scale: SIMD3(length, 2.2, 2.2)))
        }
        for k in 0..<16 {
            let a = Float(k) / 16 * 2 * .pi
            parts[.flyerSteel].box(frame * placed(at(a, radius / 2), roll: a + .pi / 2, scale: SIMD3(radius, 0.5, 0.5)))
        }
        for k in 0..<28 {
            let a = Float(k) / 28 * 2 * .pi
            parts[.flyerCapsule].box(frame * placed(at(a, radius + 3), scale: SIMD3(4, 3, 6)))
        }
        parts[.flyerSteel].prism(frame * placed(SIMD3(0, 0, -4), pitch: .pi / 2), sides: 10, bottom: 3, top: 3, height: 8)
        // Two pairs of legs from the ground to the hub, either side of the wheel.
        for side: Float in [-1, 1] {
            for lean: Float in [-1, 1] {
                parts[.flyerSteel].box(frame * placed(SIMD3(lean * 12, -hub / 2, side * 6), roll: lean * 0.13, scale: SIMD3(2, hub * 1.05, 2)))
            }
        }
    }

    /// One of the Esplanade's "durians": a faceted steel-grey shell over its footprint.
    private static func addDurian(_ parts: inout SceneryParts, _ ring: [Vec2], base: Float) {
        let c = ring.reduce(Vec2.zero, +) * (1 / Double(ring.count))
        let rx = Float((ring.map(\.x).max()! - ring.map(\.x).min()!) / 2)
        let rz = Float((ring.map(\.z).max()! - ring.map(\.z).min()!) / 2)
        parts[.durian].dome(SIMD3(Float(c.x), base, Float(c.z)), rx: rx, ry: min(rx, rz) * 1.5, rz: rz)
    }

    /// Marina Bay Sands' SkyPark: a 44 m deck along the two towers furthest apart, running 35 m past
    /// them, a lit edge under it.
    private static func addSkyPark(_ parts: inout SceneryParts, _ towers: [TownBuilding]) {
        let centres = towers.map { $0.points.reduce(Vec2.zero, +) * (1 / Double($0.points.count)) }
        var (a, b) = (centres[0], centres[0])
        for p in centres { for q in centres where p.distance(to: q) > a.distance(to: b) { (a, b) = (p, q) } }
        let length = Float(a.distance(to: b)) + 70
        let top = Float(towers.map { $0.base + $0.height }.max()!)
        let mid = a.lerp(to: b, 0.5)
        let frame = placed(SIMD3(Float(mid.x), top + 5, Float(mid.z)), yaw: Float(atan2(b.x - a.x, b.z - a.z)))
        parts[.skyParkDeck].box(frame * placed(.zero, scale: SIMD3(44, 10, length)))
        parts[.skyParkEdge].box(frame * placed(SIMD3(0, -5, 0), scale: SIMD3(44.6, 2.5, length + 0.6)))
    }

    /// A night race's floodlight poles behind the walls: a pole, an arm over the wall, a lamp.
    private static func addFloodlights(_ parts: inout SceneryParts, _ track: Track, _ ground: (Vec2) -> Double) {
        for spot in floodlightSpots(track, spacing: 30, offset: 1.5) {
            let y = Float(ground(spot.at))
            let frame = placed(SIMD3(Float(spot.at.x), y, Float(spot.at.z)), yaw: Float(atan2(spot.facing.x, spot.facing.z)))
            parts[.floodPole].box(frame * placed(SIMD3(0, 5, 0), scale: SIMD3(0.3, 10, 0.3)))
            parts[.floodPole].box(frame * placed(SIMD3(0, 9.9, 1.25), scale: SIMD3(0.2, 0.2, 2.5)))
            parts[.floodLamp].box(frame * placed(SIMD3(0, 9.65, 2.2), scale: SIMD3(1.6, 0.3, 0.9)))
        }
    }

    /// A footprint without its closing point (OSM rings repeat the first at the end).
    static func open(_ ring: [Vec2]) -> [Vec2] {
        ring.count > 3 && ring.first == ring.last ? Array(ring.dropLast()) : ring
    }

    /// The `count` footprint corners closest to the track (the building's front).
    private static func nearestToTrack(_ track: Track, _ ring: [Vec2], _ count: Int) -> [Vec2] {
        Array(ring.sorted { clearance(track, $0) < clearance(track, $1) }.prefix(count))
    }

    /// Monte-Carlo's Casino: Belle Époque walls, a copper mansard, two towers facing the track.
    private static func addCasino(_ parts: inout SceneryParts, _ track: Track, _ ring: [Vec2], base: Float, height: Float) {
        let top = base + height
        parts[.belleEpoque].walls(ring, bottom: base, top: top, bay: 4, floor: 4.5)
        let c = ring.reduce(Vec2.zero, +) * (1 / Double(ring.count))
        let inset = ring.map { $0 + (c - $0) * 0.15 }
        parts[.copper].walls(inset, bottom: top, top: top + 4)
        parts[.copper].polygon(ring, y: top)
        parts[.copper].polygon(inset, y: top + 4)
        for corner in nearestToTrack(track, ring, 2) {
            let at = corner + (c - corner) * 0.08
            let towerTop = top + 9
            parts[.belleEpoque].box(placed(SIMD3(Float(at.x), (base + towerTop) / 2, Float(at.z)), scale: SIMD3(6, towerTop - base, 6)), tile: 4)
            parts[.copper].pyramid(placed(SIMD3(Float(at.x), towerTop, Float(at.z)), yaw: .pi / 4), sides: 4, radius: 4.5, height: 7)
        }
    }

    /// The Chapelle Sainte-Dévote: ochre walls, a tiled pyramid roof, a small bell tower.
    private static func addChapel(_ parts: inout SceneryParts, _ track: Track, _ ring: [Vec2], base: Float, height: Float) {
        let top = base + height
        parts[.chapel].walls(ring, bottom: base, top: top)
        let c = ring.reduce(Vec2.zero, +) * (1 / Double(ring.count))
        let radius = Float(ring.map { $0.distance(to: c) }.max() ?? 4)
        parts[.roofTiles].pyramid(placed(SIMD3(Float(c.x), top, Float(c.z)), yaw: .pi / 4), sides: 4, radius: radius, height: radius * 0.6)
        if let corner = nearestToTrack(track, ring, 1).first {
            parts[.chapel].box(placed(SIMD3(Float(corner.x), base + 8, Float(corner.z)), scale: SIMD3(3, 16, 3)), tile: 3.2)
            parts[.roofTiles].pyramid(placed(SIMD3(Float(corner.x), base + 16, Float(corner.z)), yaw: .pi / 4), sides: 4, radius: 2.3, height: 3)
        }
    }

    // MARK: Water

    /// The sea, Port Hercule's piers and their yachts moored stern-to, the pools.
    private static func addWater(_ parts: inout SceneryParts, _ track: Track, _ scenery: CircuitScenery, _ ground: (Vec2) -> Double) {
        let sea = scenery.sea ?? []
        for ring in sea { parts[.sea].polygon(open(ring), y: seaLevel, tile: 12) }
        for ring in scenery.islands ?? [] { parts[.groundLow].polygon(open(ring), y: seaLevel + 0.01, tile: 6) }
        let piers = scenery.piers ?? []
        for pier in piers {
            if pier.area {
                parts[.piers].polygon(open(pier.points), y: 0.5, tile: 3)
            } else {
                addRibbon(&parts[.piers], pier.points, width: 3, lift: 0.5, ground: { _ in 0 }, tile: 3)
            }
        }
        let boats = mooredBoats(piers, water: sea, clear: { clearance(track, $0) > 3 }, seed: 17)
        addYachts(&parts, boats)
        for ring in scenery.pools ?? [] {
            let r = open(ring)
            parts[.pool].polygon(r, y: 0, tile: 4, heights: r.map { Float(ground($0)) + 0.06 })
        }
    }

    /// Each yacht: a white or navy hull with a pointed bow, a white superstructure with dark
    /// windows, a second deck on the big ones.
    private static func addYachts(_ parts: inout SceneryParts, _ boats: [Mooring]) {
        var random = SceneryRandom(19)
        // The hull's outline (x across, z to the bow) on a 1 × 1 footprint, 1 high.
        let outline: [(Float, Float)] = [(-0.5, -0.5), (0.5, -0.5), (0.5, 0.15), (0, 0.5), (-0.5, 0.15)]
        for boat in boats {
            let length = Float(boat.length)
            let beam = length * Float(Mooring.beam)
            let freeboard = length * 0.09
            let frame = placed(SIMD3(Float(boat.at.x), seaLevel, Float(boat.at.z)), yaw: Float(atan2(boat.bow.x, boat.bow.z)))
            func p(_ x: Float, _ y: Float, _ z: Float) -> SIMD3<Float> {
                let v = frame * SIMD4(x * beam, y * freeboard, z * length, 1)
                return SIMD3(v.x, v.y, v.z)
            }
            let hull: SceneryParts.Part = random.next() > 0.25 ? .hullWhite : .hullNavy
            let inside = p(0, 0.5, 0)
            for k in 0..<outline.count {
                let (a, b) = (outline[k], outline[(k + 1) % outline.count])
                parts[hull].face([p(a.0, 0, a.1), p(b.0, 0, b.1), p(b.0, 1, b.1), p(a.0, 1, a.1)], inside: inside, uv: [])
            }
            parts[.superstructure].face(outline.map { p($0.0, 1, $0.1) }, inside: p(0, 0, 0), uv: [])
            parts[.superstructure].box(frame * placed(SIMD3(0, freeboard + 0.9, -0.1 * length), scale: SIMD3(beam * 0.72, 1.8, length * 0.5)))
            parts[.cabinGlass].box(frame * placed(SIMD3(0, freeboard + 1.1, -0.1 * length), scale: SIMD3(beam * 0.74, 0.6, length * 0.46)))
            if length > 26 {
                parts[.superstructure].box(frame * placed(SIMD3(0, freeboard + 2.5, -0.14 * length), scale: SIMD3(beam * 0.56, 1.5, length * 0.3)))
            }
        }
    }

    // MARK: Tunnel

    /// The tunnel over the track (Monaco's, under the Fairmont): walls past the run-off, the
    /// ceiling and the roof slab, portals, a row of glowing lights.
    private static func addTunnel(_ parts: inout SceneryParts, _ track: Track, _ span: TunnelSpan) {
        let n = track.samples.count
        func at(_ i: Int) -> Double { track.samples[i].distance / track.length }
        func inSpan(_ i: Int) -> Bool { span.from <= span.to ? at(i) >= span.from && at(i) <= span.to : at(i) >= span.from || at(i) <= span.to }
        guard let first = (0..<n).first(where: { inSpan($0) && !inSpan(($0 - 1 + n) % n) }) else { return }
        var samples: [TrackSample] = []
        var k = 0
        while k < n && inSpan((first + k) % n) {
            samples.append(track.samples[(first + k) % n])
            k += 1
        }
        guard samples.count >= 2 else { return }
        let innerHeight: Float = 6.5
        let roof = Float(span.height)
        func inner(_ s: TrackSample, _ side: Double) -> Double { side * (s.halfWidth + track.runoffWidth + 0.3) }
        func outer(_ s: TrackSample, _ side: Double) -> Double { inner(s, side) + side * 1.5 }
        func point(_ s: TrackSample, _ offset: Double, _ y: Float) -> SIMD3<Float> {
            let p = s.position + s.normal * offset
            return SIMD3(Float(p.x), Float(s.height) + y, Float(p.z))
        }
        var distance: Float = 0
        for i in 0..<(samples.count - 1) {
            let (a, b) = (samples[i], samples[i + 1])
            let centre = point(a, 0, innerHeight / 2)
            let length = Float(a.position.distance(to: b.position))
            let uv: [SIMD2<Float>] = [SIMD2(distance / 3, 1), SIMD2((distance + length) / 3, 1), SIMD2((distance + length) / 3, 0), SIMD2(distance / 3, 0)]
            for side in [-1.0, 1.0] {
                // Inside walls face the road; outside walls face away from it.
                parts[.tunnelInside].face(
                    [point(a, inner(a, side), 0), point(b, inner(b, side), 0), point(b, inner(b, side), innerHeight), point(a, inner(a, side), innerHeight)],
                    inside: point(a, inner(a, side) * 2, innerHeight / 2), uv: uv)
                parts[.tunnelOutside].face(
                    [point(a, outer(a, side), 0), point(b, outer(b, side), 0), point(b, outer(b, side), roof), point(a, outer(a, side), roof)],
                    inside: centre, uv: uv)
            }
            parts[.tunnelInside].face(
                [point(a, inner(a, -1), innerHeight), point(b, inner(b, -1), innerHeight), point(b, inner(b, 1), innerHeight), point(a, inner(a, 1), innerHeight)],
                inside: point(a, 0, innerHeight + 2), uv: uv)
            parts[.tunnelOutside].face(
                [point(a, outer(a, -1), roof), point(b, outer(b, -1), roof), point(b, outer(b, 1), roof), point(a, outer(a, 1), roof)],
                inside: centre, uv: uv)
            distance += length
        }
        // Portals: the wall and roof ends at both mouths.
        for (s, away) in [(samples[0], -1.0), (samples[samples.count - 1], 1.0)] {
            let beyond = point(s, 0, innerHeight / 2) + SIMD3(Float(s.tangent.x * away), 0, Float(s.tangent.z * away)) * -1
            for side in [-1.0, 1.0] {
                parts[.tunnelOutside].face(
                    [point(s, inner(s, side), 0), point(s, outer(s, side), 0), point(s, outer(s, side), roof), point(s, inner(s, side), roof)],
                    inside: beyond, uv: [])
            }
            parts[.tunnelOutside].face(
                [point(s, inner(s, -1), innerHeight), point(s, inner(s, 1), innerHeight), point(s, inner(s, 1), roof), point(s, inner(s, -1), roof)],
                inside: beyond, uv: [])
        }
        // A strip light every 6 m down the middle of the ceiling.
        var last = -1.0
        for s in samples where s.distance - last >= 6 {
            last = s.distance
            parts[.tunnelLights].box(
                placed(point(s, 0, innerHeight - 0.1), yaw: Float(atan2(s.tangent.x, s.tangent.z)), scale: SIMD3(0.5, 0.15, 2.4)))
        }
    }

    // MARK: Hills and trees

    /// Green-grey hills behind the town on the side away from the sea (Monaco's Alpes-Maritimes).
    private static func addHills(_ parts: inout SceneryParts, _ track: Track, _ sea: [[Vec2]]) {
        let b = trackBounds(track)
        let centre = Vec2((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2)
        let water = sea.flatMap { $0 }
        let toSea = water.isEmpty ? 0 : atan2(water.map(\.z).reduce(0, +) / Double(water.count) - centre.z, water.map(\.x).reduce(0, +) / Double(water.count) - centre.x)
        let land = toSea + .pi
        var random = SceneryRandom(23)
        let count = 34
        for i in 0..<count {
            let angle = land - 1.2 + 2.4 * Double(i) / Double(count) + random.next() * 0.15
            let distance = 1100 + random.next() * 550
            let height = Float(160 + random.next() * 260)
            let radius = height * Float(0.9 + random.next() * 0.6)
            let p = centre + Vec2(cos(angle), sin(angle)) * distance
            parts[.hills].pyramid(placed(SIMD3(Float(p.x), -10, Float(p.z)), yaw: Float(random.next() * 6)), sides: 5 + Int(random.next() * 3), radius: radius, height: height)
        }
    }

    /// Trees: dense in the woods, sparse in the open, never in a building, the water or a stand.
    private static func addTrees(
        _ parts: inout SceneryParts, _ track: Track, _ scenery: CircuitScenery, _ city: [TownBuilding], _ look: CircuitLook,
        _ ground: (Vec2) -> Double, _ keepClear: [Circle]
    ) {
        let blocked = city.map(\.points) + (scenery.sea ?? [])
        let blockedBounds = blocked.map(polygonBounds)
        func free(_ p: Vec2) -> Bool {
            !blocked.indices.contains { i in
                let b = blockedBounds[i]
                return p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ && insidePolygon(p, blocked[i])
            }
        }
        var spots: [Vec2] = []
        for (i, wood) in scenery.woods.enumerated() {
            let b = polygonBounds(wood)
            let count = min(400, Int(jsRound((b.maxX - b.minX) * (b.maxZ - b.minZ) * 0.5 / 81)))
            spots += scatter(track, count: count, area: b, seed: 101 + i, margin: 8, spacing: 9, avoid: keepClear, inside: wood)
        }
        spots = Array(spots.prefix(2400))
        if look.parkTrees > 0 {
            spots += scatter(track, count: look.parkTrees, area: trackBounds(track, margin: 350), seed: 7, margin: 8, spacing: 24, avoid: keepClear)
        }
        var random = SceneryRandom(5)
        for spot in spots where free(spot) {
            let size = Float(0.8 + random.next() * 0.5)
            let y = Float(ground(spot))
            let turn = Float(random.next() * 6.28)
            let base = SIMD3(Float(spot.x), y, Float(spot.z))
            switch look.trees {
            case .pines:
                // An umbrella pine: a slim leaning trunk, a wide flat crown.
                parts[.treeTrunk].prism(placed(base, yaw: turn, pitch: Float(random.next() - 0.5) * 0.25), sides: 6, bottom: 0.45 * size, top: 0.3 * size, height: 8 * size)
                parts[.treeCrown].prism(placed(base + SIMD3(0, 7.8 * size, 0), yaw: turn), sides: 9, bottom: 5 * size, top: 3 * size, height: 1.6 * size)
            case .broadleaf:
                parts[.treeTrunk].prism(placed(base, yaw: turn), sides: 6, bottom: 0.4 * size, top: 0.3 * size, height: 5 * size)
                parts[.treeCrown].prism(placed(base + SIMD3(0, 3.5 * size, 0), yaw: turn), sides: 8, bottom: 3.2 * size, top: 1.2 * size, height: 5.5 * size)
            }
        }
        // Palms along the promenades.
        var palmRandom = SceneryRandom(13)
        for spot in scenery.palms ?? [] {
            let size = Float(0.8 + palmRandom.next() * 0.4)
            let lean = SIMD2(Float(palmRandom.next() - 0.5) * 0.15, Float(palmRandom.next() - 0.5) * 0.15)
            let base = SIMD3(Float(spot.x), Float(ground(spot)), Float(spot.z))
            parts[.palmTrunk].prism(placed(base, pitch: lean.y, roll: -lean.x), sides: 6, bottom: 0.32 * size, top: 0.22 * size, height: 9 * size)
            let top = base + SIMD3(lean.x * 9 * size, 9 * size, lean.y * 9 * size)
            let turn = Float(palmRandom.next() * 6.28)
            for k in 0..<7 {
                let droop = Float(0.35 + palmRandom.next() * 0.25)
                let frond = placed(top, yaw: turn + Float(k) / 7 * 2 * .pi, pitch: droop) * placed(SIMD3(0, 0, 1.8 * size), scale: SIMD3(0.9, 0.08, 3.6) * size)
                parts[.palmFronds].box(frond)
            }
        }
    }
}
