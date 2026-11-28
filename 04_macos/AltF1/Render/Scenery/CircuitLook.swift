import AltF1Core

/// How a stretch of wall is drawn (the physics wall is the same everywhere; the web's `WallStyle`).
enum WallStyle: Sendable {
    /// Tyre stacks (beside gravel).
    case tyres
    /// A steel guard rail.
    case armco
    /// A guard rail with a tall catch fence on it (a street circuit: Monaco).
    case armcoFence
    /// Concrete with a fence on top (by the stands and the pits).
    case concrete
}

/// What differs between the real circuits' looks (the web's `RealCircuitLook`): their ground, their
/// trees, their barrier, a town's hills, a night race. A circuit without one keeps the plain
/// look (rule 5: one circuit at a time, 01_docs/macos.md#scenery-x5).
struct CircuitLook: Sendable {
    enum GroundKind: Sendable { case grass, paving }
    /// `real`: lifelike plane trees, Eldar pines and date palms, and a line of trees behind the
    /// walls (Baku: `SceneryGeometry.addRealTree`).
    enum Trees: Sendable { case pines, broadleaf, real }

    var ground: GroundKind
    var trees: Trees
    /// Trees scattered in the open, besides the woods.
    var parkTrees: Int
    var barrier: WallStyle
    /// Green-grey hills behind the town, away from the sea (Monaco).
    var hills: Bool
    /// The ground turns to green slopes from this height up (Monaco's Moyenne Corniche).
    var highland: Double?
    /// A night race (Singapore, Las Vegas).
    var night: Bool
    /// The town's facades: (wall, window frames); nil: the Riviera's (`SceneryGeometry.facades`).
    var facades: [(UInt32, UInt32)]? = nil
    /// Kerbs painted otherwise than red and white along a stretch (main-loop progress, m).
    var kerbs: [KerbPaint] = []
    /// A great city's skyline far off to the north (São Paulo's), hazy on the horizon.
    var skyline: Bool = false
    /// The lakes' water (São Paulo's: green-brown); nil: none.
    var lake: UInt32? = nil
    /// The share of low buildings with a flat concrete roof (São Paulo's slabs and water tanks) instead
    /// of terracotta tiles; 0: all tiled (the Riviera).
    var flatRoofs: Double = 0
    /// The sea's colour when not the Riviera's deep blue-green (Baku's grey-green Caspian).
    var seaTint: UInt32? = nil
    /// A circuit's own landmarks' materials (Baku's limestone, glass, carpet).
    var landmarks: Landmarks? = nil

    enum Landmarks: Sendable { case baku }

    /// A stretch of kerbs in their own colours, blocks in turn.
    struct KerbPaint: Sendable {
        var from: Double
        var to: Double
        var colors: [SIMD3<Float>]
    }

    /// The circuits whose scenery is done: Monaco (X.5a), Singapore (X.5b), São Paulo (X.5c), Baku
    /// (X.5d). Others
    /// are added one at a time.
    static func of(_ circuitId: String) -> CircuitLook? {
        switch circuitId {
        case "monaco":
            // Riviera stone paving and umbrella pines, guard rails with catch fences, the hills of
            // the Alpes-Maritimes behind the town, green slopes above it.
            CircuitLook(ground: .paving, trees: .pines, parkTrees: 0, barrier: .armcoFence, hills: true, highland: 75, night: false)
        case "singapore":
            // Marina Bay at night: the park's grass and broadleaf trees, guard rails with catch
            // fences, floodlights every 30 m, the town lit window by window, stars.
            CircuitLook(ground: .grass, trees: .broadleaf, parkTrees: 500, barrier: .armcoFence, hills: false, highland: nil, night: true)
        case "saoPaulo":
            // Interlagos: the park's grass and broadleaf woods, guard rails, the lake by the Descida
            // do Lago, the town's houses round the park in Brazil's colours with terracotta roofs, the
            // city's skyline to the north; the Senna S's kerbs in yellow, green and blue (the
            // tribute to Ayrton Senna), the others red and white.
            CircuitLook(
                ground: .grass, trees: .broadleaf, parkTrees: 700, barrier: .armco, hills: false, highland: nil,
                night: false,
                facades: [
                    (0xF2EFE6, 0x4D6F8A), (0xF0D27A, 0x6B5A3A), (0xE7A98A, 0x7A4B2C), (0x9CC7D8, 0xF2F2F2),
                    (0xB9D3A6, 0x5E6B4A), (0xE8DCC8, 0x8A5A3A), (0xD9876A, 0xF2EFE6), (0xC9C6C0, 0x3A4A5A),
                ],
                kerbs: [
                    KerbPaint(
                        from: 245, to: 600,
                        colors: [SIMD3(0.98, 0.80, 0.05), SIMD3(0.0, 0.55, 0.22), SIMD3(0.05, 0.25, 0.65)])
                ],
                skyline: true, lake: 0x3E5A44, flatRoofs: 0.4)
        case "baku":
            // Baku by the Caspian: the boulevard's stone paving, lifelike plane trees, Eldar pines and
            // date palms (a line of them behind the walls), guard
            // rails with catch fences; the town's honey sandstone (the oil boom's Belle Époque
            // blocks, flat roofs), the grey-green Caspian, the old town's limestone walls, the
            // Maiden Tower, Government House, the Carpet Museum and the Flame Towers on the hill.
            CircuitLook(
                ground: .paving, trees: .real, parkTrees: 0, barrier: .armcoFence, hills: false,
                highland: nil, night: false,
                facades: [
                    (0xDCC59C, 0x5A4A36), (0xE6D5B3, 0x4A5A66), (0xCFB385, 0x6B4E33), (0xEDE3CD, 0x3F4F5C),
                    (0xD4BC92, 0x7A6A55), (0xC9A97A, 0x4A3A2A),
                ],
                flatRoofs: 0.75, seaTint: 0x2C5258, landmarks: .baku)
        default:
            nil
        }
    }
}
