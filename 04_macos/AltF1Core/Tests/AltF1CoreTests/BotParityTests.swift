import Foundation
import Testing

@testable import AltF1Core

/// The bots against the web's: their plans, one tick of driving in traffic, their qualifying laps.
@Suite struct BotParityTests {
    private static func track(_ name: String, pitLane: Bool = true) throws -> Track {
        let id = try #require(try CircuitCatalog.entries().first { $0.name == name }).id
        return try buildTrack(CircuitCatalog.definition(id), pitLane: pitLane)
    }

    private static func summary(_ plan: BotPlan) -> [String: Any] {
        func every(_ list: [Double]) -> [Double] { list.enumerated().filter { $0.offset % 7 == 0 }.map(\.element) }
        return ["road": plan.road.name, "count": plan.lateral.count, "lateral": every(plan.lateral), "speed": every(plan.speed)]
    }

    @Test(arguments: ["Monza", "Monaco"])
    func plansLikeTheWeb(_ name: String) throws {
        let all = try #require(try Fixture.json("bot-plans") as? [[String: Any]])
        let fixture = try #require(all.first { $0["name"] as? String == name })
        let track = try Self.track(name)
        var actual: [String: Any] = [
            "pit": Self.summary(buildPitPlan(track, .baseline, .baseline(.medium), box: 2, pit: .baseline))
        ]
        actual["race"] = Dictionary(
            uniqueKeysWithValues: BotLevel.allCases.map { ($0.rawValue, Self.summary(buildBotPlan(track, .baseline, .baseline($0)))) })
        actual["name"] = name
        let diffs = differences(actual, fixture)
        #expect(diffs.isEmpty, "\(diffs.joined(separator: "\n"))")
    }

    private struct DrivingStep: Decodable {
        struct Bot: Decodable {
            let id: CarId
            let level: BotLevel
            let pit: Bool
            let memory: BotMemory
            let input: InputCommand
            let next: BotMemory
        }
        let state: GameState
        let bots: [Bot]
    }

    private struct Driving: Decodable {
        let circuit: String
        let steps: [DrivingStep]
    }

    @Test func drivesInTrafficLikeTheWeb() throws {
        let driving = try JSONDecoder().decode(Driving.self, from: Fixture.data("bot-driving"))
        let track = try Self.track(driving.circuit)
        var plans: [String: BotPlan] = [:]
        func plan(_ level: BotLevel, pit: Bool) -> BotPlan {
            let key = "\(level.rawValue)-\(pit)"
            if let plan = plans[key] { return plan }
            let made =
                pit
                ? buildPitPlan(track, .baseline, .baseline(level), box: 1, pit: .baseline)
                : buildBotPlan(track, .baseline, .baseline(level))
            plans[key] = made
            return made
        }
        var failures: [String] = []
        var steering = 0
        for step in driving.steps {
            for bot in step.bots {
                let car = try #require(step.state.car(bot.id))
                let result = botInput(car, plan(bot.level, pit: bot.pit), bot.memory, step.state.cars)
                if bot.input.steer != 0 { steering += 1 }
                failures += differences(
                    [try Fixture.jsonValue(result.input), try Fixture.jsonValue(result.memory)],
                    [try Fixture.jsonValue(bot.input), try Fixture.jsonValue(bot.next)],
                    path: "tick \(step.state.tick) \(bot.id)", limit: 3)
            }
            if failures.count > 10 { break }
        }
        #expect(steering > 0)
        #expect(failures.isEmpty, "\(failures.joined(separator: "\n"))")
    }

    @Test func qualifiesLikeTheWeb() throws {
        let fixture = try #require(try Fixture.json("bot-laps") as? [String: Any])
        let laps = try #require(fixture["laps"] as? [String: Int])
        let context = SimContext(track: try Self.track("Monza", pitLane: false))
        for level in BotLevel.allCases {
            let ticks = try #require(botLapTicks(context, level))
            let expected = try #require(laps[level.rawValue])
            // A whole lap driven alone: the libm's last bits may move the line by a tick at most.
            #expect(abs(ticks - expected) <= 2, "\(level): \(ticks) ticks, the web \(expected)")
        }
    }

    @Test func schedulesTheStopsLikeTheWeb() {
        #expect(pitSchedule(8) == [2, 5])
        #expect(pitSchedule(3) == [])
        #expect(pitSchedule(16) == [3, 6, 9, 12])
        #expect(pitDue([2, 5], lapsDone: 2, stopsMade: 0))
        #expect(!pitDue([2, 5], lapsDone: 2, stopsMade: 1))
    }
}
