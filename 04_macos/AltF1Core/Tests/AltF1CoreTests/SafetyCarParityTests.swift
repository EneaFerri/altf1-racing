import Foundation
import Testing

@testable import AltF1Core

/// The safety car against the web's (R.3): its plans and the delta's speeds, its car's input out on
/// the track and into the pit lane among bots, the delta after a step, its grace.
@Suite struct SafetyCarParityTests {
    private struct Step: Decodable {
        let state: GameState
        let next: GameState
        let sc: SafetyCarInfo
        let input: InputCommand
        let delta: [String: Double?]
    }

    private struct Recording: Decodable {
        let circuit: String
        let steps: [Step]
        let exits: [Exit]
        let grace: [GraceStep]
    }

    /// A car beating its delta, then back above it: the delta and the grace left at each.
    private struct GraceStep: Decodable {
        let state: GameState
        let delta: Double?
        let graceLeft: Double?
    }

    /// Its car released from the pit exit, where it waits: its input at each recorded tick.
    private struct Exit: Decodable {
        let circuit: String
        let steps: [ExitStep]
    }

    private struct ExitStep: Decodable {
        let state: GameState
        let sc: SafetyCarInfo
        let input: InputCommand
    }

    private static func track(_ name: String) throws -> Track {
        let id = try #require(try CircuitCatalog.entries().first { $0.name == name }).id
        return try buildTrack(CircuitCatalog.definition(id), pitLane: true)
    }

    private static func summary(_ speed: [Double]) -> [String: Any] {
        ["count": speed.count, "speed": speed.enumerated().filter { $0.offset % 7 == 0 }.map(\.element)]
    }

    @Test func plansLikeTheWeb() throws {
        let fixture = try #require(try Fixture.json("safety-car") as? [String: Any])
        let plans = safetyCarPlans(try Self.track("Monza"))
        let actual: [String: Any] = [
            "race": Self.summary(plans.race.speed),
            "pit": Self.summary(try #require(plans.pit).speed),
            "delta": Self.summary(plans.delta),
        ]
        let diffs = differences(actual, fixture["plans"])
        #expect(diffs.isEmpty, "\(diffs.joined(separator: "\n"))")
    }

    @Test func drivesAndCountsTheDeltaLikeTheWeb() throws {
        let recording = try JSONDecoder().decode(Recording.self, from: Fixture.data("safety-car"))
        let track = try Self.track(recording.circuit)
        let plans = safetyCarPlans(track)
        var failures: [String] = []
        var steering = 0
        for step in recording.steps {
            let inputs = withSafetyCar([:], step.state, step.sc, track)
            let input = try #require(inputs[safetyCarId])
            if input.steer != 0 { steering += 1 }
            let delta = SafetyCarDelta()
            delta.update(step.state, step.sc, track, plans)
            delta.update(step.next, step.sc, track, plans)
            failures += differences(
                [try Fixture.jsonValue(input), json(delta.get("a")), json(delta.get("b"))],
                [try Fixture.jsonValue(step.input), json(step.delta["a"] ?? nil), json(step.delta["b"] ?? nil)],
                path: "tick \(step.state.tick)", limit: 3)
            if failures.count > 10 { break }
        }
        #expect(steering > 0)
        #expect(failures.isEmpty, "\(failures.joined(separator: "\n"))")
    }

    /// Out of the pit lane on the lane's own road, like the web (it once turned round there).
    @Test func leavesThePitExitLikeTheWeb() throws {
        let recording = try JSONDecoder().decode(Recording.self, from: Fixture.data("safety-car"))
        #expect(!recording.exits.isEmpty)
        var failures: [String] = []
        for exit in recording.exits {
            let track = try Self.track(exit.circuit)
            for step in exit.steps {
                let input = try #require(withSafetyCar([:], step.state, step.sc, track)[safetyCarId])
                failures += differences(
                    try Fixture.jsonValue(input), try Fixture.jsonValue(step.input),
                    path: "\(exit.circuit) tick \(step.state.tick)", limit: 3)
                if failures.count > 10 { break }
            }
        }
        #expect(failures.isEmpty, "\(failures.joined(separator: "\n"))")
    }

    /// The delta's grace while it waits for the leader, counted over skipped ticks, like the web.
    @Test func countsTheDeltasGraceLikeTheWeb() throws {
        let recording = try JSONDecoder().decode(Recording.self, from: Fixture.data("safety-car"))
        let track = try Self.track(recording.circuit)
        let plans = safetyCarPlans(track)
        let waiting = SafetyCarInfo(phase: .deployed, since: 0, inThisLap: false, released: [])
        let delta = SafetyCarDelta()
        var failures: [String] = []
        var beaten = false
        for (i, step) in recording.grace.enumerated() {
            delta.update(step.state, waiting, track, plans, ticks: i == 0 ? 1 : 10)
            let left = delta.graceLeft("a", tick: step.state.tick)
            if left != nil { beaten = true }
            failures += differences(
                [json(delta.get("a")), json(left)], [json(step.delta), json(step.graceLeft)],
                path: "tick \(step.state.tick)", limit: 3)
        }
        #expect(beaten)
        #expect(recording.grace.last?.graceLeft == nil)
        #expect(failures.isEmpty, "\(failures.joined(separator: "\n"))")
    }

    /// A delta as JSON holds it: a number, or null (no delta: the safety car going in).
    private func json(_ value: Double?) -> Any { value.map { $0 as Any } ?? NSNull() }

    @Test func decodesTheServersSafetyCar() throws {
        let json = """
            {"type":"grandPrix","phase":"race","manager":"p1","drivers":["p1"],"qualifying":[],
             "race":[{"id":"p1","name":"A","status":"running","laps":2,"time":null,"gap":null,
                      "lapsBehind":0,"best":null,"stops":0,"penalty":0,"timePenalty":300}],
             "raceLaps":12,"hold":null,"boxes":{},"weather":"dry","forecast":[{"tick":0,"wetness":0}],
             "sectorBests":[null,null,null],
             "safetyCar":{"phase":"out","since":10,"inThisLap":true,"released":[]},
             "giveBack":[{"attacker":"p1","victim":"p2","until":900}],
             "incidents":[{"tick":5,"id":"p1","reason":"delta"}],"yellowFlags":[]}
            """
        guard case .grandPrix(let info)? = ServerMessage.parse(json) else {
            Issue.record("not a grandPrix message")
            return
        }
        #expect(info.safetyCar == SafetyCarInfo(phase: .out, since: 10, inThisLap: true, released: []))
        #expect(info.giveBack.first?.victim == "p2")
        #expect(info.incidents.first?.reason == .delta)
        #expect(info.race.first?.timePenalty == 300)
    }
}
