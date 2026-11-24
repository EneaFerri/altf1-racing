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
    enum Trees: Sendable { case pines, broadleaf }

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

    /// The circuits whose scenery is done: Monaco (X.5a), Singapore (X.5b). Others are added one at a time.
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
        default:
            nil
        }
    }
}
