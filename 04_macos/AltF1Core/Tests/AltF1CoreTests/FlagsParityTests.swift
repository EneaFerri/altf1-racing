import Foundation
import Testing

@testable import AltF1Core

/// Debris and yellow flags against the web's (R.2): the flags tick by tick, every crash's pieces.
@Suite struct FlagsParityTests {
    private struct Step: Decodable {
        let state: GameState
        let before: [YellowFlag]
        let after: [YellowFlag]
    }

    private struct Crash: Decodable {
        let flag: YellowFlag
        let pieces: [DebrisPiece]
    }

    private struct Recording: Decodable {
        let circuit: String
        let steps: [Step]
        let debris: [Crash]
    }

    private static func track(_ name: String) throws -> Track {
        let id = try #require(try CircuitCatalog.entries().first { $0.name == name }).id
        return try buildTrack(CircuitCatalog.definition(id), pitLane: true)
    }

    @Test func flagsAndDebrisLikeTheWeb() throws {
        let recording = try JSONDecoder().decode(Recording.self, from: Fixture.data("flags"))
        let track = try Self.track(recording.circuit)
        var failures: [String] = []
        for step in recording.steps {
            let after = stepYellowFlags(step.before, step.state, track, drivers: ["a", "b"])
            failures += differences(
                try Fixture.jsonValue(after), try Fixture.jsonValue(step.after), path: "tick \(step.state.tick)", limit: 3)
        }
        #expect(recording.debris.count == 4)
        for crash in recording.debris {
            failures += differences(
                try Fixture.jsonValue(debrisLayout(track, crash.flag)), try Fixture.jsonValue(crash.pieces),
                path: "\(crash.flag.carId)@\(crash.flag.since)", limit: 3)
        }
        #expect(failures.isEmpty, "\(failures.joined(separator: "\n"))")
    }
}
