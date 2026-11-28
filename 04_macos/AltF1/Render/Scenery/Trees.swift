import AltF1Core
import Foundation
import simd

/// Lifelike trees (`CircuitLook.Trees.real`, Baku first): plane trees with a forked trunk and a
/// crown of leaf clumps, Eldar pines in tiers of needle sprays, date palms with arching fronds.
/// Leaves are alpha-cut cards (`SceneryTextures.leaves`…) round a solid core, lit as one rounded
/// volume (normals from the crown's centre). And a line of them behind the walls wherever the
/// ground beside the track is free (01_docs/macos.md#scenery-x5).
nonisolated extension SceneryGeometry {
    /// Room a tree needs from the next one (m); a palm's.
    private static let treeSpacing = 7.0
    private static let palmSpacing = 5.0
    /// The rows behind the walls: (nearest, farthest) clearance past the wall (m), and how many
    /// of the free spots get a tree.
    private static let wallRows: [(near: Double, far: Double, share: Double)] = [(4, 6.5, 0.95), (10, 14, 0.7)]
    /// A crown's reach (m): no tree this close to a building's wall.
    private static let crownReach = 3.6

    // MARK: Behind the walls

    /// Spots behind the walls on both sides of the main loop, every few metres, in up to two rows:
    /// only where the ground is free (no building, water, stand, pit, the old town's walls) and
    /// clear of the trees and palms already standing (`taken`).
    static func wallTreeSpots(
        _ track: Track, _ scenery: CircuitScenery, blocked: [[Vec2]], avoid: [Circle], taken: [Vec2], palms: [Vec2]
    ) -> [Vec2] {
        var grid = SpotGrid(cell: treeSpacing)
        for p in taken { grid.insert(p, room: treeSpacing) }
        for p in palms { grid.insert(p, room: palmSpacing) }
        let bounds = blocked.map(polygonBounds)
        let walls = (scenery.cityWalls ?? []).map { alongTrack(track, $0.path, step: 4) }
        func nearBuilding(_ p: Vec2) -> Bool {
            blocked.indices.contains { i in
                let b = bounds[i]
                let m = crownReach
                guard p.x >= b.minX - m, p.x <= b.maxX + m, p.z >= b.minZ - m, p.z <= b.maxZ + m else { return false }
                return insidePolygon(p, blocked[i]) || distance(p, toRing: blocked[i]) < m
            }
        }
        func nearWall(_ p: Vec2) -> Bool {
            walls.contains { line in line.contains { $0.distance(to: p) < 9 } }
        }
        var random = SceneryRandom(31)
        var spots: [Vec2] = []
        var last = -Double.infinity
        for s in track.samples where s.distance - last >= treeSpacing {
            last = s.distance
            for side in [-1.0, 1.0] {
                for row in wallRows {
                    let jitter = random.next()
                    let along = (random.next() - 0.5) * 2.5
                    guard random.next() < row.share else { continue }
                    let gap = row.near + (row.far - row.near) * jitter
                    var p = s.position + s.normal * (side * (s.halfWidth + track.runoffWidth + gap)) + s.tangent * along
                    // A run-off area or another road nearby: step out until the clearance fits.
                    for _ in 0..<2 {
                        let c = clearance(track, p)
                        if c >= gap - 0.5 { break }
                        p = p + s.normal * (side * (gap - c))
                    }
                    let c = clearance(track, p)
                    guard c >= row.near - 0.5, c <= row.far + 2 else { continue }
                    guard !avoid.contains(where: { Vec2($0.x, $0.z).distance(to: p) < $0.r }) else { continue }
                    guard grid.isFree(p, room: treeSpacing), !nearBuilding(p), !nearWall(p) else { continue }
                    grid.insert(p, room: treeSpacing)
                    spots.append(p)
                }
            }
        }
        return spots
    }

    private static func distance(_ p: Vec2, toRing ring: [Vec2]) -> Double {
        var best = Double.infinity
        for i in ring.indices {
            let a = ring[i]
            let b = ring[(i + 1) % ring.count]
            let ab = b - a
            let len2 = ab.x * ab.x + ab.z * ab.z
            let t = len2 > 0 ? min(1, max(0, ((p.x - a.x) * ab.x + (p.z - a.z) * ab.z) / len2)) : 0
            best = min(best, (a + ab * t).distance(to: p))
        }
        return best
    }

    /// Points on a coarse grid, each with the room it keeps round it.
    private struct SpotGrid {
        let cell: Double
        var cells: [SIMD2<Int>: [(Vec2, Double)]] = [:]

        init(cell: Double) { self.cell = cell }

        private func key(_ p: Vec2) -> SIMD2<Int> { SIMD2(Int(floor(p.x / cell)), Int(floor(p.z / cell))) }

        mutating func insert(_ p: Vec2, room: Double) { cells[key(p), default: []].append((p, room)) }

        func isFree(_ p: Vec2, room: Double) -> Bool {
            let k = key(p)
            for dx in -1...1 {
                for dz in -1...1 {
                    for (q, r) in cells[k &+ SIMD2(dx, dz)] ?? [] where q.distance(to: p) < max(r, room) { return false }
                }
            }
            return true
        }
    }

    // MARK: The trees

    /// One lifelike tree at `base`: a plane tree, or (one in three) an Eldar pine.
    static func addRealTree(_ parts: inout SceneryParts, _ base: SIMD3<Float>, _ random: inout SceneryRandom) {
        let size = Float(0.85 + random.next() * 0.4)
        if random.next() < 0.34 {
            addEldarPine(&parts, base, size, &random)
        } else {
            addPlaneTree(&parts, base, size, &random)
        }
    }

    /// A plane tree: a mottled trunk forking at 3 m into four limbs, a rounded crown of nine leaf
    /// clumps (each a lumpy core and three crossed cards) round one big core.
    private static func addPlaneTree(_ parts: inout SceneryParts, _ base: SIMD3<Float>, _ size: Float, _ random: inout SceneryRandom) {
        let lean = SIMD3(Float(random.next() - 0.5) * 0.5, 0, Float(random.next() - 0.5) * 0.5) * size
        let fork = base + SIMD3(0, 3.2 * size, 0) + lean
        let centre = base + SIMD3(0, 6.6 * size, 0) + lean * 1.4
        let radius = SIMD3(3.6, 3.0, 3.6) * size * Float(0.9 + random.next() * 0.2)
        parts[.barkPlane].limb(base - SIMD3(0, 0.3, 0), fork, 0.34 * size, 0.24 * size, sides: 8)
        let turn = Float(random.next()) * 2 * .pi
        for k in 0..<4 {
            let a = turn + Float(k) / 4 * 2 * .pi + Float(random.next() - 0.5) * 0.6
            let up = Float(0.35 + random.next() * 0.4)
            let end = centre + SIMD3(cos(a) * radius.x * 0.6, (up - 0.2) * radius.y, sin(a) * radius.z * 0.6)
            parts[.barkPlane].limb(fork, end, 0.16 * size, 0.06 * size, sides: 6)
        }
        parts[.leafCore].lump(centre, radius * 0.5, around: centre, &random)
        let clumps = 9
        for i in 0..<clumps {
            // Spread over the crown (golden angle), fewer underneath.
            let y = 1 - 1.55 * (Float(i) + 0.5) / Float(clumps)
            let ring = sqrt(max(0, 1 - y * y))
            let a = Float(i) * 2.39996 + turn
            let at = centre + SIMD3(cos(a) * ring, y, sin(a) * ring) * radius * 0.72
                + SIMD3(Float(random.next() - 0.5), Float(random.next() - 0.5), Float(random.next() - 0.5)) * size
            let r = Float(1.7 + random.next() * 0.6) * size
            parts[.leafCore].lump(at, SIMD3(repeating: r * 0.45), around: centre, &random)
            for _ in 0..<3 {
                parts[.leaves].card(at, side: r * 2.5, facing: randomUnit(&random), around: centre, cell: Int(random.next() * 4), cells: 2)
            }
        }
    }

    /// An Eldar pine (Baku's own): a straight reddish trunk, tiers of needle sprays fanning out and
    /// drooping, wide at the foot, pointed on top, round a dark cone.
    private static func addEldarPine(_ parts: inout SceneryParts, _ base: SIMD3<Float>, _ size: Float, _ random: inout SceneryRandom) {
        let height = Float(10 + random.next() * 3) * size
        let top = base + SIMD3(0, height, 0)
        let axis = base + SIMD3(0, height * 0.55, 0)
        parts[.barkPine].limb(base - SIMD3(0, 0.3, 0), top, 0.3 * size, 0.05 * size, sides: 7)
        parts[.needleCore].prism(placed(base + SIMD3(0, height * 0.25, 0)), sides: 7, bottom: 0.9 * size, top: 0, height: height * 0.72)
        let tiers = 10
        var turn = Float(random.next()) * 2 * .pi
        for k in 0..<tiers {
            let t = Float(k) / Float(tiers - 1)
            let y = height * (0.2 + 0.74 * t)
            let reach = (2.9 - 2.3 * t) * size
            let sprays = k < tiers - 2 ? 7 : 4
            turn += 0.9
            for j in 0..<sprays {
                let a = turn + Float(j) / Float(sprays) * 2 * .pi + Float(random.next() - 0.5) * 0.4
                let out = SIMD3(cos(a), 0, sin(a))
                let root = base + SIMD3(0, y, 0)
                let tip = root + out * reach + SIMD3(0, reach * Float(random.next() * 0.3 - 0.2), 0)
                parts[.needles].spray(root, tip, width: reach * 0.85, around: axis)
            }
            // Crossed sprays in the tier's middle fill the volume seen from any side.
            if k % 2 == 0 {
                let at = base + SIMD3(0, y + 0.4 * size, 0)
                parts[.needles].card(at, side: reach * 1.6, facing: randomUnit(&random), around: axis, cell: 0, cells: 1)
            }
        }
        parts[.needles].card(top - SIMD3(0, 0.9 * size, 0), side: 1.8 * size, facing: SIMD3(1, 0, 0), around: axis, cell: 0, cells: 1)
    }

    /// A date palm: a ringed trunk curving slightly, a crown of fourteen pinnate fronds arching out
    /// and down from its head, a few dry ones hanging under them.
    static func addRealPalm(_ parts: inout SceneryParts, _ base: SIMD3<Float>, _ random: inout SceneryRandom) {
        let size = Float(0.8 + random.next() * 0.4)
        let height = 9 * size
        let bend = SIMD3(Float(random.next() - 0.5), 0, Float(random.next() - 0.5)) * 1.4 * size
        var head = base
        let segments = 4
        for k in 0..<segments {
            let t0 = Float(k) / Float(segments)
            let t1 = Float(k + 1) / Float(segments)
            let a = base + SIMD3(0, height * t0, 0) + bend * t0 * t0
            let b = base + SIMD3(0, height * t1, 0) + bend * t1 * t1
            parts[.palmBark].limb(k == 0 ? a - SIMD3(0, 0.3, 0) : a, b, (0.36 - 0.1 * t0) * size, (0.36 - 0.1 * t1) * size, sides: 8)
            head = b
        }
        let turn = Float(random.next()) * 2 * .pi
        let fronds = 14
        for k in 0..<fronds {
            let a = turn + Float(k) * 2.39996
            let rise = Float(0.15 + random.next() * 0.75)
            let length = Float(4.2 + random.next() * 1.2) * size
            parts[.palmLeaf].frond(head, yaw: a, rise: rise, length: length, width: 1.5 * size)
        }
        for k in 0..<4 {
            let a = turn + Float(k) / 4 * 2 * .pi + 0.4
            parts[.palmDry].frond(head - SIMD3(0, 0.2, 0), yaw: a, rise: -1.1, length: 2.6 * size, width: 0.9 * size)
        }
    }

    private static func randomUnit(_ random: inout SceneryRandom) -> SIMD3<Float> {
        let y = Float(random.next() * 2 - 1)
        let a = Float(random.next()) * 2 * .pi
        let r = sqrt(1 - y * y)
        return SIMD3(cos(a) * r, y, sin(a) * r)
    }
}

/// The trees' pieces, merged into one mesh per material like the rest of the scenery.
nonisolated extension MeshBuilder {
    /// A tapered limb from `a` to `b` (radii `ra`, `rb`), its bark in metres (one repeat 1.5 m).
    mutating func limb(_ a: SIMD3<Float>, _ b: SIMD3<Float>, _ ra: Float, _ rb: Float, sides: Int) {
        let axis = simd_normalize(b - a)
        let helper: SIMD3<Float> = abs(axis.y) > 0.9 ? SIMD3(1, 0, 0) : SIMD3(0, 1, 0)
        let u = simd_normalize(simd_cross(axis, helper))
        let w = simd_cross(axis, u)
        let length = simd_distance(a, b)
        let tile: Float = 1.5
        let base = UInt32(positions.count)
        for k in 0...sides {
            let angle = Float(k) / Float(sides) * 2 * .pi
            let n = u * cos(angle) + w * sin(angle)
            let s = Float(k) / Float(sides) * max(1, (2 * .pi * ra / tile).rounded())
            positions += [a + n * ra, b + n * rb]
            normals += [n, n]
            uvs += [SIMD2(s, length / tile), SIMD2(s, 0)]
        }
        for k in 0..<UInt32(sides) {
            let (i, j) = (base + 2 * k, base + 2 * k + 2)
            indices += [i, j, i + 1, i + 1, j, j + 1]
        }
    }

    /// A lumpy blob (an icosahedron, its corners pushed in and out) of `radius` on `centre`, lit
    /// as part of the volume round `around`.
    mutating func lump(_ centre: SIMD3<Float>, _ radius: SIMD3<Float>, around: SIMD3<Float>, _ random: inout SceneryRandom) {
        let g: Float = 1.618034
        let corners: [SIMD3<Float>] = [
            SIMD3(-1, g, 0), SIMD3(1, g, 0), SIMD3(-1, -g, 0), SIMD3(1, -g, 0),
            SIMD3(0, -1, g), SIMD3(0, 1, g), SIMD3(0, -1, -g), SIMD3(0, 1, -g),
            SIMD3(g, 0, -1), SIMD3(g, 0, 1), SIMD3(-g, 0, -1), SIMD3(-g, 0, 1),
        ]
        let faces: [UInt32] = [
            0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
            3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
        ]
        let base = UInt32(positions.count)
        for c in corners {
            let d = simd_normalize(c) * Float(0.8 + random.next() * 0.35)
            let p = centre + d * radius
            positions.append(p)
            normals.append(simd_normalize(simd_normalize(p - around) + SIMD3(0, 0.35, 0)))
            uvs.append(.zero)
        }
        // Wound so the outside is the front.
        for f in stride(from: 0, to: faces.count, by: 3) {
            let (i, j, k) = (faces[f], faces[f + 1], faces[f + 2])
            let (a, b, c) = (positions[Int(base + i)], positions[Int(base + j)], positions[Int(base + k)])
            let outward = simd_dot(simd_cross(b - a, c - a), (a + b + c) / 3 - centre) >= 0
            indices += outward ? [base + i, base + j, base + k] : [base + i, base + k, base + j]
        }
    }

    /// A square leaf card of `side` on `centre`, square to `facing`, showing one cell of a
    /// `cells` × `cells` atlas; lit as part of the volume round `around` (both faces alike).
    mutating func card(_ centre: SIMD3<Float>, side: Float, facing: SIMD3<Float>, around: SIMD3<Float>, cell: Int, cells: Int) {
        let helper: SIMD3<Float> = abs(facing.y) > 0.9 ? SIMD3(1, 0, 0) : SIMD3(0, 1, 0)
        let u = simd_normalize(simd_cross(helper, facing)) * side / 2
        let v = simd_cross(facing, u)
        let corners = [centre - u - v, centre + u - v, centre + u + v, centre - u + v]
        let size = 1 / Float(cells)
        let (c0, r0) = (Float(cell % cells) * size, Float(cell / cells % cells) * size)
        let uv: [SIMD2<Float>] = [SIMD2(c0, r0 + size), SIMD2(c0 + size, r0 + size), SIMD2(c0 + size, r0), SIMD2(c0, r0)]
        let base = UInt32(positions.count)
        for (p, t) in zip(corners, uv) {
            positions.append(p)
            normals.append(simd_normalize(simd_normalize(p - around) + SIMD3(0, 0.5, 0)))
            uvs.append(t)
        }
        indices += [base, base + 1, base + 2, base, base + 2, base + 3]
    }

    /// A needle spray from `root` to `tip`, `width` across: a flat card lying along the branch
    /// (the needle texture's branch runs along its length).
    mutating func spray(_ root: SIMD3<Float>, _ tip: SIMD3<Float>, width: Float, around: SIMD3<Float>) {
        let along = tip - root
        let flatSide = simd_normalize(simd_cross(along, SIMD3(0, 1, 0))) * width / 2
        let corners = [root - flatSide * 0.3, root + flatSide * 0.3, tip + flatSide, tip - flatSide]
        let uv: [SIMD2<Float>] = [SIMD2(0, 0.35), SIMD2(0, 0.65), SIMD2(1, 1), SIMD2(1, 0)]
        let base = UInt32(positions.count)
        for (p, t) in zip(corners, uv) {
            positions.append(p)
            normals.append(simd_normalize(simd_normalize(p - around) + SIMD3(0, 0.8, 0)))
            uvs.append(t)
        }
        indices += [base, base + 1, base + 2, base, base + 2, base + 3]
    }

    /// A palm frond from `head`: its midrib rising at `rise` (radians) then arching down under its
    /// own weight, `length` long, `width` across at its widest; the texture's leaflets along it.
    mutating func frond(_ head: SIMD3<Float>, yaw: Float, rise: Float, length: Float, width: Float) {
        let out = SIMD3(cos(yaw), 0, sin(yaw))
        let across = SIMD3(-sin(yaw), 0, cos(yaw))
        let steps = 5
        var points: [SIMD3<Float>] = []
        var p = head
        var pitch = rise
        for _ in 0...steps {
            points.append(p)
            p += (out * cos(pitch) + SIMD3(0, sin(pitch), 0)) * (length / Float(steps))
            pitch -= 0.32
        }
        let base = UInt32(positions.count)
        for (k, q) in points.enumerated() {
            let t = Float(k) / Float(steps)
            let half = width / 2 * (0.35 + 0.65 * sin(min(1, t * 1.15) * .pi))
            // The leaflets fold up a little along the midrib, a V seen end on.
            let fold = SIMD3<Float>(0, half * 0.25, 0)
            let n = simd_normalize(SIMD3(0, 1, 0) + out * 0.3)
            positions += [q - across * half + fold, q + across * half + fold]
            normals += [n, n]
            uvs += [SIMD2(0, t), SIMD2(1, t)]
        }
        for k in 0..<UInt32(steps) {
            let (i, j) = (base + 2 * k, base + 2 * k + 2)
            indices += [i, j, i + 1, i + 1, j, j + 1]
        }
    }
}
