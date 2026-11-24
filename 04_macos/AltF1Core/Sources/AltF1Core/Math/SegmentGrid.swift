/// Uniform grid over a set of 2D segments, for fast "which segments are near this circle" queries
/// (`math/SegmentGrid.ts`). Used for the track centreline (surface lookup) and the walls (collisions).
public struct SegmentGrid: Sendable {
    private var cells: [Int: [Int]] = [:]
    private let cellSize: Double

    public init(_ segments: [(Vec2, Vec2)], cellSize: Double = 10) {
        self.cellSize = cellSize
        for (index, (a, b)) in segments.enumerated() {
            forEachCell(min(a.x, b.x), min(a.z, b.z), max(a.x, b.x), max(a.z, b.z)) { key in
                cells[key, default: []].append(index)
            }
        }
    }

    /// Indices of segments whose cells overlap the circle's bounding box, unique and ascending.
    public func query(_ center: Vec2, _ radius: Double) -> [Int] {
        var found: [Int] = []
        forEachCell(center.x - radius, center.z - radius, center.x + radius, center.z + radius) { key in
            if let cell = cells[key] { found.append(contentsOf: cell) }
        }
        found.sort()
        var unique: [Int] = []
        unique.reserveCapacity(found.count)
        for index in found where unique.last != index { unique.append(index) }
        return unique
    }

    private func forEachCell(
        _ minX: Double, _ minZ: Double, _ maxX: Double, _ maxZ: Double, _ visit: (Int) -> Void
    ) {
        let x0 = Int((minX / cellSize).rounded(.down))
        let x1 = Int((maxX / cellSize).rounded(.down))
        let z0 = Int((minZ / cellSize).rounded(.down))
        let z1 = Int((maxZ / cellSize).rounded(.down))
        guard x0 <= x1, z0 <= z1 else { return }
        for cx in x0...x1 {
            for cz in z0...z1 { visit((cx + 32768) * 65536 + (cz + 32768)) }
        }
    }
}
