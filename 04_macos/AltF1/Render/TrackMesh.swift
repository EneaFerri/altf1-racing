import AltF1Core
import RealityKit

/// Triangles collected for one mesh: positions, normals and texture coordinates. Plain data, built
/// on any thread; only `entity` (the GPU upload) runs on the main actor.
nonisolated struct MeshBuilder: Sendable {
    var positions: [SIMD3<Float>] = []
    var normals: [SIMD3<Float>] = []
    var uvs: [SIMD2<Float>] = []
    var indices: [UInt32] = []

    var isEmpty: Bool { indices.isEmpty }

    /// A quad a0–a1 (one end) to b0–b1 (the other), with a normal and uv per corner.
    mutating func quad(
        _ a0: SIMD3<Float>, _ a1: SIMD3<Float>, _ b0: SIMD3<Float>, _ b1: SIMD3<Float>,
        normals na: SIMD3<Float>, _ nb: SIMD3<Float>,
        uv ua0: SIMD2<Float>, _ ua1: SIMD2<Float>, _ ub0: SIMD2<Float>, _ ub1: SIMD2<Float>
    ) {
        let base = UInt32(positions.count)
        positions += [a0, a1, b0, b1]
        normals += [na, na, nb, nb]
        uvs += [ua0, ua1, ub0, ub1]
        // Wound counter-clockwise round the given normal: RealityKit's front face, lit as given.
        if simd_dot(simd_cross(b0 - a0, a1 - a0), na) >= 0 {
            indices += [base, base + 2, base + 1, base + 1, base + 2, base + 3]
        } else {
            indices += [base, base + 1, base + 2, base + 1, base + 3, base + 2]
        }
    }

    @MainActor
    func entity(_ material: some RealityKit.Material, name: String) throws -> ModelEntity? {
        guard !isEmpty else { return nil }
        var descriptor = MeshDescriptor(name: name)
        descriptor.positions = MeshBuffer(positions)
        descriptor.normals = MeshBuffer(normals)
        descriptor.textureCoordinates = MeshBuffer(uvs)
        descriptor.primitives = .triangles(indices)
        let entity = ModelEntity(mesh: try MeshResource.generate(from: [descriptor]), materials: [material])
        entity.name = name
        return entity
    }
}

/// The circuit's meshes, built from the same compiled `Track` the simulation uses, so what you see
/// is exactly what the physics feels (the web's `TrackView.ts`, in PBR).
enum TrackMesh {
    // Heights above the road, stacked so overlapping layers never flicker (the web's values).
    private static let yRunoff: Float = 0.005
    private static let yGravel: Float = 0.01
    private static let yAsphalt: Float = 0.02
    private static let yEdgeLine: Float = 0.025
    private static let yKerb: Float = 0.03
    private static let yPaint: Float = 0.035
    private static let yHighKerb: Float = 0.12

    /// Metres per texture repeat.
    private static let asphaltTile: Float = 8
    private static let grassTile: Float = 10
    private static let gravelTile: Float = 5
    private static let kerbBlock: Float = 1.5
    private static let wallTile: Float = 3
    /// Painted white line just inside each asphalt edge (m).
    private static let edgeLineWidth: Float = 0.4
    private static let wallHeight: Float = 1.1

    /// `wallStyles`: how each wall
    /// is drawn (a circuit with its scenery); nil: tyres beside gravel, guard rails elsewhere.
    /// `groundPlane`: the plain grass to the horizon (false where the scenery brings the land).
    static func build(
        _ track: Track, _ m: RaceMaterials, wallStyles: [WallStyle]? = nil, groundPlane: Bool = true,
        runoff runoffMaterial: (any RealityKit.Material)? = nil
    ) throws -> Entity {
        let root = Entity()
        root.name = "track"
        var asphalt = MeshBuilder()
        var lines = MeshBuilder()
        var lowKerbs = MeshBuilder()
        var highKerbs = MeshBuilder()
        var gravel = MeshBuilder()
        var runoff = MeshBuilder()

        ribbon(track, &asphalt, y: yAsphalt, tile: asphaltTile, across: asphaltTile) { s in (-s.halfWidth, s.halfWidth) }
        for side in [TrackSide.left, .right] {
            let k: Double = side == .right ? 1 : -1
            let info = track.sides[side]
            ribbon(track, &lines, y: yEdgeLine, tile: 1) { s in
                (k * (s.halfWidth - Double(edgeLineWidth)), k * s.halfWidth)
            }
            ribbon(track, &gravel, y: yGravel, tile: gravelTile, across: gravelTile, include: { info.runoff[$0] == .gravel }) { s in
                (k * s.halfWidth, k * (s.halfWidth + track.runoffWidth - 0.3))
            }
            if track.elevated {
                // Elevated tracks get their own grass beside the road (the land comes with the scenery).
                ribbon(track, &runoff, y: yRunoff, tile: grassTile, across: grassTile) { s in
                    (k * s.halfWidth, k * (s.halfWidth + track.runoffWidth + 0.3))
                }
            }
            let band: (TrackSample) -> (Double, Double) = { s in
                (k * (s.halfWidth - track.kerbInset), k * (s.halfWidth + track.kerbOutset))
            }
            ribbon(track, &lowKerbs, y: yKerb, tile: kerbBlock * 2, include: { info.kerb[$0] == .low }, band)
            ribbon(track, &highKerbs, y: yHighKerb, tile: 2, include: { info.kerb[$0] == .high }, band)
        }
        // An elevated circuit's run-off: its own ground where it has scenery (Monaco's paving), else grass.
        let parts: [(MeshBuilder, any RealityKit.Material, String)] = [
            (asphalt, m.asphalt, "asphalt"), (lines, m.line, "lines"), (lowKerbs, m.lowKerb, "kerbs"),
            (highKerbs, m.highKerb, "highKerbs"), (gravel, m.gravel, "gravel"), (runoff, runoffMaterial ?? m.grass, "runoff"),
        ]
        for (builder, material, name) in parts {
            if let entity = try builder.entity(material, name: name) { root.addChild(entity) }
        }
        for (route, road) in track.routes.enumerated() {
            for entity in try routeRoad(track, road, route, m) { root.addChild(entity) }
        }
        if let lane = track.routes.first(where: \.pit) {
            for entity in try pitMarkings(track, lane, m) { root.addChild(entity) }
        }
        for entity in try walls(track, m, wallStyles) { root.addChild(entity) }
        if let start = try startLine(track, m) { root.addChild(start) }
        if let grid = try gridBoxes(track, m) { root.addChild(grid) }
        if groundPlane { root.addChild(try ground(track, m, runoffMaterial)) }
        return root
    }

    /// Strip along the track within `band` (signed offsets, + = right), `y` above the road; V along
    /// the track (`tile` m per repeat), U across 0..1 or in metres / `across`.
    private static func ribbon(
        _ track: Track, _ builder: inout MeshBuilder, y: Float, tile: Float, across: Float? = nil,
        include: (Int) -> Bool = { _ in true }, _ band: (TrackSample) -> (Double, Double)
    ) {
        let samples = track.samples
        let n = samples.count
        for i in 0..<n where include(i) {
            let a = samples[i]
            let b = samples[(i + 1) % n]
            let vA = Float(a.distance) / tile
            let vB = Float(i + 1 == n ? track.length : b.distance) / tile
            let (a0, a1) = band(a)
            let (b0, b1) = band(b)
            func corner(_ s: TrackSample, _ offset: Double) -> SIMD3<Float> {
                SIMD3(Float(s.position.x + s.normal.x * offset), y + Float(s.height), Float(s.position.z + s.normal.z * offset))
            }
            func u(_ offset: Double, _ edge: Float) -> Float { across.map { Float(offset) / $0 } ?? edge }
            builder.quad(
                corner(a, a0), corner(a, a1), corner(b, b0), corner(b, b1),
                normals: surfaceNormal(a), surfaceNormal(b),
                uv: SIMD2(u(a0, 0), vA), SIMD2(u(a1, 1), vA), SIMD2(u(b0, 0), vB), SIMD2(u(b1, 1), vB))
        }
    }

    /// A route's own road (a branch, the pit lane) where it leaves the main loop: asphalt and edge
    /// lines, a hair lower so the main road wins where they overlap. The pit lane isn't drawn where
    /// it lies on the track's asphalt: there it is the track.
    private static func routeRoad(_ track: Track, _ road: Track, _ route: Int, _ m: RaceMaterials) throws -> [ModelEntity] {
        guard let branch = road.branch else { return [] }
        let include: (Int) -> Bool = { i in
            let s = road.samples[i]
            guard s.distance >= branch.from && s.distance <= branch.to else { return false }
            if !road.pit { return true }
            let main = locateOnLoop(track, s.position)
            return abs(main.lateral) > main.halfWidth
        }
        var asphalt = MeshBuilder()
        var lines = MeshBuilder()
        ribbon(road, &asphalt, y: yAsphalt - 0.002, tile: asphaltTile, across: asphaltTile, include: include) { s in
            (-s.halfWidth, s.halfWidth)
        }
        for k: Double in [-1, 1] {
            ribbon(road, &lines, y: yEdgeLine - 0.002, tile: 1, include: include) { s in
                (k * (s.halfWidth - 0.3), k * s.halfWidth)
            }
        }
        return [try asphalt.entity(m.asphalt, name: "route\(route)"), try lines.entity(m.line, name: "routeLines\(route)")]
            .compactMap { $0 }
    }

    /// A pit box's size (m): length, width and its painted frame.
    private static let pitBox = (length: 6.5, width: 3.2, line: 0.25)

    /// A rectangle painted flat on the road, `from`…`to` ahead and `left`…`right` beside the spot.
    private static func paint(
        _ builder: inout MeshBuilder, _ track: Track, _ position: Vec2, _ heading: Double,
        _ from: Double, _ to: Double, _ left: Double, _ right: Double
    ) {
        let up = SIMD3<Float>(0, 1, 0)
        func at(_ ahead: Double, _ side: Double) -> SIMD3<Float> {
            let p = Vec2.toWorld(position, heading, ahead: ahead, side: side)
            return SIMD3(Float(p.x), roadHeight(track, p) + yPaint, Float(p.z))
        }
        builder.quad(at(from, left), at(from, right), at(to, left), at(to, right), normals: up, up,
                     uv: .zero, .zero, .zero, .zero)
    }

    /// The pit lane's markings: a white frame for each box and the two limit lines across the lane.
    /// The player's own box is painted apart (`ownBoxMark`): online it can change during a race.
    private static func pitMarkings(_ track: Track, _ lane: Track, _ m: RaceMaterials) throws -> [ModelEntity] {
        guard let rules = lane.pitRules else { return [] }
        var white = MeshBuilder()
        let (l, w, line) = (pitBox.length / 2, pitBox.width / 2, pitBox.line)
        for box in rules.boxes.indices {
            let spot = boxSpot(lane, box, .baseline)
            paint(&white, track, spot.position, spot.heading, -l, l, -w, -w + line)
            paint(&white, track, spot.position, spot.heading, -l, l, w - line, w)
            paint(&white, track, spot.position, spot.heading, l - line, l, -w, w)
            paint(&white, track, spot.position, spot.heading, -l, -l + line, -w, w)
        }
        for at in [rules.limitFrom, rules.limitTo] {
            let s = lane.samples.first { $0.distance >= at } ?? lane.samples[0]
            paint(&white, track, s.position, s.tangent.heading, -0.3, 0.3, -s.halfWidth, s.halfWidth)
        }
        return [try white.entity(m.line, name: "pitBoxes")].compactMap { $0 }
    }

    /// The player's pit box `box` filled in yellow inside its frame (the web's `createOwnBoxMark`);
    /// nil without a pit lane. `boxSpot` wraps a box past the last one, like the sim's stop.
    static func ownBoxMark(_ track: Track, box: Int) throws -> ModelEntity? {
        guard let lane = track.routes.first(where: \.pit), lane.pitRules != nil else { return nil }
        let spot = boxSpot(lane, box, .baseline)
        let (l, w) = (pitBox.length / 2 - pitBox.line, pitBox.width / 2 - pitBox.line)
        var yellow = MeshBuilder()
        paint(&yellow, track, spot.position, spot.heading, -l, l, -w, w)
        var gold = PhysicallyBasedMaterial()
        gold.baseColor = .init(tint: .init(red: 0.96, green: 0.77, blue: 0.09, alpha: 1))
        gold.roughness = 0.5
        gold.faceCulling = .none
        return try yellow.entity(gold, name: "ownBox")
    }

    /// The road's normal at a sample: up, tilted by its grade (across × along).
    private static func surfaceNormal(_ s: TrackSample) -> SIMD3<Float> {
        let across = SIMD3<Float>(Float(s.normal.x), 0, Float(s.normal.z))
        let along = SIMD3<Float>(Float(s.tangent.x), Float(s.grade), Float(s.tangent.z))
        return simd_normalize(simd_cross(across, along))
    }

    /// The walls, each in its style: tyre stacks, guard rails (galvanised steel), a guard rail with a
    /// tall catch fence, concrete with a fence on top.
    private static func walls(_ track: Track, _ m: RaceMaterials, _ styles: [WallStyle]?) throws -> [ModelEntity] {
        var armco = MeshBuilder()
        var tyres = MeshBuilder()
        var concrete = MeshBuilder()
        var fence = MeshBuilder()
        var along: Float = 0
        for (index, wall) in track.walls.enumerated() {
            let road = roadOf(track, wall.route)
            let sample = road.samples[wall.sample]
            // The right wall faces left (towards the track): its normal points against the sample's.
            let side: TrackSide = wall.normal.dot(sample.normal) < 0 ? .right : .left
            let gravel = road.sides[side].runoff[wall.sample] == .gravel
            let hA = Float(sample.height)
            let hB = Float(road.samples[(wall.sample + 1) % road.samples.count].height)
            let length = Float(wall.a.distance(to: wall.b))
            let normal = SIMD3<Float>(Float(wall.normal.x), 0, Float(wall.normal.z))
            let u0 = along / wallTile
            let u1 = (along + length) / wallTile
            along += length
            let a = SIMD3<Float>(Float(wall.a.x), hA, Float(wall.a.z))
            let b = SIMD3<Float>(Float(wall.b.x), hB, Float(wall.b.z))
            let style = styles.flatMap { index < $0.count ? $0[index] : nil } ?? (gravel ? .tyres : .armco)
            func strip(_ builder: inout MeshBuilder, _ bottom: Float, _ top: Float, tile: Float) {
                let lo = SIMD3<Float>(0, bottom, 0)
                let hi = SIMD3<Float>(0, top, 0)
                let v = (top - bottom) / tile
                builder.quad(
                    a + lo, a + hi, b + lo, b + hi, normals: normal, normal,
                    uv: SIMD2(u0, v), SIMD2(u0, 0), SIMD2(u1, v), SIMD2(u1, 0))
            }
            switch style {
            case .tyres: strip(&tyres, 0, wallHeight, tile: wallHeight)
            case .armco: strip(&armco, 0, wallHeight, tile: wallHeight)
            case .armcoFence:
                strip(&armco, 0, 1.2, tile: 1.2)
                strip(&fence, 1.2, 4.5, tile: 2)
            case .concrete:
                strip(&concrete, 0, 1.1, tile: 3)
                strip(&fence, 1.1, 3.3, tile: 2)
            }
        }
        return [
            try armco.entity(m.armco, name: "armco"), try tyres.entity(m.tyreWall, name: "tyres"),
            try concrete.entity(m.concrete, name: "concreteWalls"), try fence.entity(m.fence, name: "fences"),
        ].compactMap { $0 }
    }

    /// Chequered strip across the track on the start line.
    private static func startLine(_ track: Track, _ m: RaceMaterials) throws -> ModelEntity? {
        let s = track.samples[0]
        let depth = 1.0
        var builder = MeshBuilder()
        let y = yPaint + Float(s.height) + Float(abs(s.grade) * depth / 2)
        func at(_ ahead: Double, _ side: Double) -> SIMD3<Float> {
            let p = s.position + s.tangent * ahead + s.normal * side
            return SIMD3(Float(p.x), y, Float(p.z))
        }
        let hw = s.halfWidth
        let uMax = Float(hw * 2) / 8
        builder.quad(
            at(-depth / 2, -hw), at(-depth / 2, hw), at(depth / 2, -hw), at(depth / 2, hw),
            normals: surfaceNormal(s), surfaceNormal(s),
            uv: SIMD2(0, 0), SIMD2(uMax, 0), SIMD2(0, 1), SIMD2(uMax, 1))
        return try builder.entity(m.checker, name: "startLine")
    }

    /// The starting grid: an F1-style box at every slot, open at the back (the web's values).
    private static func gridBoxes(_ track: Track, _ m: RaceMaterials) throws -> ModelEntity? {
        var builder = MeshBuilder()
        let front = 3.3
        let half = 1.6
        let tick = 2.0
        let line = 0.3
        for slot in 0..<gridSlots {
            let pose = gridSlot(track, slot)
            let heading = pose.direction.heading
            func paint(_ from: Double, _ to: Double, _ left: Double, _ right: Double) {
                func at(_ ahead: Double, _ side: Double) -> SIMD3<Float> {
                    let p = Vec2.toWorld(pose.position, heading, ahead: ahead, side: side)
                    return SIMD3(Float(p.x), roadHeight(track, p) + yPaint, Float(p.z))
                }
                let up = SIMD3<Float>(0, 1, 0)
                builder.quad(at(from, left), at(from, right), at(to, left), at(to, right), normals: up, up,
                             uv: .zero, .zero, .zero, .zero)
            }
            paint(front - line, front, -half, half)
            paint(front - tick, front, -half, -half + line)
            paint(front - tick, front, half - line, half)
        }
        return try builder.entity(m.line, name: "grid")
    }

    /// Grass to the horizon round the circuit (under the road on an elevated one).
    /// `material`: the circuit's own ground (a night race's darker grass), else grass.
    private static func ground(_ track: Track, _ m: RaceMaterials, _ material: (any RealityKit.Material)?) throws -> ModelEntity {
        let xs = track.samples.map(\.position.x)
        let zs = track.samples.map(\.position.z)
        let margin = 3000.0
        let minX = Float((xs.min() ?? 0) - margin)
        let maxX = Float((xs.max() ?? 0) + margin)
        let minZ = Float((zs.min() ?? 0) - margin)
        let maxZ = Float((zs.max() ?? 0) + margin)
        let y: Float = track.elevated ? Float(track.samples.map(\.height).min() ?? 0) - 1 : 0
        var builder = MeshBuilder()
        let up = SIMD3<Float>(0, 1, 0)
        builder.quad(
            SIMD3(minX, y, minZ), SIMD3(maxX, y, minZ), SIMD3(minX, y, maxZ), SIMD3(maxX, y, maxZ),
            normals: up, up,
            uv: SIMD2(minX, minZ) / grassTile, SIMD2(maxX, minZ) / grassTile,
            SIMD2(minX, maxZ) / grassTile, SIMD2(maxX, maxZ) / grassTile)
        if let material { return try builder.entity(material, name: "ground")! }
        return try builder.entity(m.grass, name: "ground")!
    }

    /// The road's height under `p` (0 on a flat track, which is never located).
    static func roadHeight(_ track: Track, _ p: Vec2) -> Float {
        track.elevated ? Float(locateOnTrack(track, p).height) : 0
    }
}
