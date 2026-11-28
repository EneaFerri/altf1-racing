import Foundation
import Testing

@testable import AltF1Core

/// `stepGame` against the web's: each recorded tick (a state, the inputs of every car) stepped once
/// in Swift must give the web's next state (cars, impacts, laps).
@Suite struct SimParityTests {
    private struct Step: Decodable {
        let state: GameState
        let inputs: InputMap
        let next: GameState
    }

    private struct Scenario: Decodable {
        let circuit: String
        let pitLane: Bool
        let damage: Bool
        let rain: Bool
        let tyres: Bool
        /// How wet when (2.8); nil: soaked all along.
        let forecast: Forecast?
        let boxes: [CarId: Int]?
        let steps: [Step]
    }

    @Test(arguments: ["monza", "monaco", "saoPaulo"])
    func stepsLikeTheWeb(_ name: String) throws {
        let scenario = try JSONDecoder().decode(Scenario.self, from: Fixture.data("sim-\(name)"))
        let raw = try #require(try Fixture.json("sim-\(name)") as? [String: Any])
        let rawSteps = try #require(raw["steps"] as? [[String: Any]])
        let id = try #require(try CircuitCatalog.entries().first { $0.name == scenario.circuit }).id
        let track = try buildTrack(CircuitCatalog.definition(id), pitLane: scenario.pitLane)
        let ctx = SimContext(
            track: track,
            damage: scenario.damage ? .baseline : nil,
            pit: scenario.boxes.map { PitRules(boxes: $0) },
            weather: scenario.rain ? WetTrack(puddles: placePuddles(track), forecast: scenario.forecast) : nil,
            tyres: scenario.tyres ? .baseline : nil)

        var failures: [String] = []
        for (k, step) in scenario.steps.enumerated() {
            let next = stepGame(step.state, step.inputs, ctx)
            let diffs = differences(try Fixture.jsonValue(next), rawSteps[k]["next"], path: "tick \(step.state.tick)", limit: 4)
            failures += diffs
            if failures.count >= 12 { break }
        }
        #expect(!scenario.steps.isEmpty)
        #expect(failures.isEmpty, "\(name): \(failures.joined(separator: "\n"))")
    }

    @Test func theScenariosCoverWhatMatters() throws {
        var impacts = 0
        var stops = 0
        var laps = 0
        var damaged = 0
        var softs = 0
        var rainTyres = 0
        var worn = 0
        for name in ["monza", "monaco", "saoPaulo"] {
            let scenario = try JSONDecoder().decode(Scenario.self, from: Fixture.data("sim-\(name)"))
            for step in scenario.steps {
                impacts += step.next.impacts.count
                stops += step.next.cars.filter { $0.pitStop?.until == step.next.tick }.count
                laps += zip(step.state.laps, step.next.laps).filter { $0.laps != $1.laps }.count
                damaged += step.next.cars.filter { ($0.damage?.frontWing ?? 0) > 0 }.count
                softs += step.next.cars.filter { $0.tyres?.compound == .soft }.count
                rainTyres += step.next.cars.filter { $0.tyres.map { !$0.compound.isSlick } ?? false }.count
                worn += step.next.cars.filter { ($0.tyres?.wear ?? 0) > 0.01 }.count
            }
        }
        #expect(softs > 0)
        #expect(rainTyres > 0)
        #expect(worn > 0)
        #expect(impacts > 0)
        #expect(stops > 0)
        #expect(laps > 0)
        #expect(damaged > 0)
    }
}
