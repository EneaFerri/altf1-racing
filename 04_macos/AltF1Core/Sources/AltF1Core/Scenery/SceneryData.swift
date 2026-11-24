import Foundation

/// A point given relative to the track (`placement.ts`'s `TrackSpot`): lap fraction (0 = start
/// line, along the main loop) and metres beyond the wall (+ right, − left).
public struct TrackSpot: Codable, Hashable, Sendable {
    public var at: Double
    public var gap: Double

    public init(_ at: Double, _ gap: Double) {
        self.at = at
        self.gap = gap
    }

    public init(from decoder: any Decoder) throws {
        var pair = try decoder.unkeyedContainer()
        at = try pair.decode(Double.self)
        gap = try pair.decode(Double.self)
    }

    public func encode(to encoder: any Encoder) throws {
        var pair = encoder.unkeyedContainer()
        try pair.encode(at)
        try pair.encode(gap)
    }
}

/// A building of a town circuit: its footprint, height and base (> 0: it stands on something, the
/// tunnel's roof), and `landmark` when it has its own model (`casino`, `chapel`, `sands`…).
public struct TownBuilding: Codable, Hashable, Sendable {
    public var points: [Vec2]
    public var height: Double
    public var base: Double
    public var name: String?
    public var landmark: String?
}

/// A pier: a walkway along `points`, or a deck over the area they close (`area`).
public struct Pier: Codable, Hashable, Sendable {
    public var points: [Vec2]
    public var area: Bool
}

/// The lap fractions a tunnel covers and its roof's top (m).
public struct TunnelSpan: Codable, Hashable, Sendable {
    public var from: Double
    public var to: Double
    public var height: Double
}

/// The land round an elevated circuit (`<id>Land.ts`): heights on a grid, m above sea level.
public struct LandGrid: Codable, Sendable {
    public var minX: Double
    public var minZ: Double
    public var cell: Double
    public var cols: Int
    public var rows: Int
    public var heights: [Double]
}

/// A real circuit's surroundings, as `01_tools/openf1/scenery.ts` generates them (`<id>Layout.ts`,
/// exported by `01_tools/swiftExport`): stands, pit lane and buildings, woods, and on a town circuit
/// every building, the sea, piers, pools, palms and the tunnel.
public struct CircuitScenery: Codable, Sendable {
    public struct Stand: Codable, Sendable {
        public var name: String
        public var footprint: [TrackSpot]
    }

    public struct PitLane: Codable, Sendable {
        public var width: Double
        public var path: [TrackSpot]
    }

    public var stands: [Stand]
    public var pitLane: PitLane
    public var pitBuildings: [[TrackSpot]]
    public var woods: [[Vec2]]
    public var city: [TownBuilding]?
    public var sea: [[Vec2]]?
    public var islands: [[Vec2]]?
    public var piers: [Pier]?
    public var pools: [[Vec2]]?
    public var palms: [Vec2]?
    public var tunnel: TunnelSpan?
}

extension CircuitCatalog {
    /// Circuit `id`'s scenery and, on an elevated circuit, its land.
    public static func scenery(_ id: String) throws -> (scenery: CircuitScenery, land: LandGrid?) {
        struct File: Decodable {
            let scenery: CircuitScenery
            let land: LandGrid?
        }
        let file = try JSONDecoder().decode(File.self, from: data(named: id))
        return (file.scenery, file.land)
    }
}
