import Foundation
import Testing

@testable import AltF1Core

/// `buildTrack` and the track queries against the web's, on every circuit (with its pit lane).
@Suite struct TrackParityTests {
    private static let stride = 7

    private static let kerbCode: [KerbKind: String] = [.none: "n", .low: "l", .high: "h"]
    private static let runoffCode: [RunoffKind: String] = [.grass: "g", .gravel: "v"]

    /// The same summary the fixture holds (01_tools/swiftExport/fixtures.ts, `trackSummary`).
    private static func summary(_ track: Track) throws -> [String: Any] {
        func every<T>(_ list: [T]) -> [T] { list.enumerated().filter { $0.offset % stride == 0 }.map(\.element) }
        var out: [String: Any] = [
            "name": track.name,
            "length": track.length,
            "maxHalfWidth": track.maxHalfWidth,
            "elevated": track.elevated,
            "kerbInset": track.kerbInset,
            "kerbOutset": track.kerbOutset,
            "sectorStarts": track.sectorStarts,
            "sampleCount": track.samples.count,
            "samples": try Fixture.jsonValue(every(track.samples)),
            "kerbs": [
                "left": track.sides.left.kerb.map { kerbCode[$0]! }.joined(),
                "right": track.sides.right.kerb.map { kerbCode[$0]! }.joined(),
            ],
            "runoff": [
                "left": track.sides.left.runoff.map { runoffCode[$0]! }.joined(),
                "right": track.sides.right.runoff.map { runoffCode[$0]! }.joined(),
            ],
            "wallCount": track.walls.count,
            "walls": every(track.walls).map { w -> [Any] in
                [w.a.x, w.a.z, w.b.x, w.b.z, w.route, w.sample, w.progress]
            },
            "routes": try track.routes.map(summary),
        ]
        if let b = track.branch {
            out["branch"] = [
                "from": b.from, "to": b.to, "mainFrom": b.mainFrom, "mainTo": b.mainTo,
                "start": b.start, "mainLength": b.mainLength,
            ]
        }
        if let r = track.pitRules {
            out["pitRules"] = [
                "limitFrom": r.limitFrom, "limitTo": r.limitTo, "speedLimit": r.speedLimit,
                "boxes": r.boxes, "garageSide": r.garageSide,
            ]
        }
        return out
    }

    private static func fixture(_ name: String) throws -> [String: Any] {
        let circuits = try #require(try Fixture.json("tracks") as? [[String: Any]])
        return try #require(circuits.first { $0["name"] as? String == name })
    }

    private static func track(named name: String) throws -> Track {
        let entry = try #require(try CircuitCatalog.entries().first { $0.name == name })
        return try buildTrack(CircuitCatalog.definition(entry.id), pitLane: true)
    }

    @Test(arguments: ["Monza", "Barcelona", "Monaco", "Mexico City", "Singapore", "Las Vegas", "São Paulo"])
    func compilesLikeTheWeb(_ name: String) throws {
        let fixture = try Self.fixture(name)
        let track = try Self.track(named: name)
        let diffs = differences(try Self.summary(track), fixture["track"])
        #expect(diffs.isEmpty, "\(name): \(diffs.joined(separator: "\n"))")
    }

    @Test(arguments: ["Monza", "Barcelona", "Monaco", "Mexico City", "Singapore", "Las Vegas", "São Paulo"])
    func locatesLikeTheWeb(_ name: String) throws {
        let fixture = try Self.fixture(name)
        let track = try Self.track(named: name)
        let probes = try #require(fixture["probes"] as? [[String: Any]])
        var diffs: [String] = []
        for (k, probe) in probes.enumerated() {
            let point = try #require(probe["p"] as? [String: Double])
            let p = Vec2(point["x"]!, point["z"]!)
            let loc = locateOnTrack(track, p)
            let actual: [String: Any] = [
                "p": point, "route": loc.route, "index": loc.index, "distance": loc.distance,
                "lateral": loc.lateral, "halfWidth": loc.halfWidth, "height": loc.height,
                "grade": loc.grade, "surface": surfaceAt(track, p).rawValue,
            ]
            diffs += differences(actual, probe, path: "probe \(k)", limit: 3)
        }
        #expect(diffs.isEmpty, "\(name): \(diffs.prefix(8).joined(separator: "\n"))")
    }

    @Test func placesThePuddlesLikeTheWeb() throws {
        let fixture = try #require(try Fixture.json("puddles") as? [[String: Any]])
        for entry in fixture {
            let name = try #require(entry["name"] as? String)
            let id = try #require(try CircuitCatalog.entries().first { $0.name == name }).id
            let puddles = placePuddles(try buildTrack(CircuitCatalog.definition(id)))
            #expect(!puddles.isEmpty)
            let diffs = differences(try Fixture.jsonValue(puddles), entry["puddles"], path: name)
            #expect(diffs.isEmpty, "\(diffs.joined(separator: "\n"))")
        }
    }
}
