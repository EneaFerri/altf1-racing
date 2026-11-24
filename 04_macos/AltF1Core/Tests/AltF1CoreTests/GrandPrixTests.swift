import Foundation
import Testing

@testable import AltF1Core

/// The Grand Prix's rules (the web's `race/*.test.ts`) and a whole single-player Grand Prix, headless.
@Suite struct GrandPrixTests {
    @Test func startLightsComeOnOneASecondThenGoOut() {
        let hold = startHold(100, 0.5)
        #expect(hold.lightsFrom == 160)
        #expect(hold.until == 160 + 4 * 60 + 36)
        #expect(lightsOn(159, hold) == 0)
        #expect(lightsOn(160, hold) == 1)
        #expect(lightsOn(400, hold) == 5)
        #expect(lightsOn(hold.until, hold) == 0)
        #expect(heldInputs(["a": InputCommand(throttle: 1)], 399, hold).isEmpty)
    }

    @Test func qualifyingOrdersByTimeThenWhoSetItFirst() {
        let entries = [
            QualifyingEntry(id: "slow", best: 5000, setAt: 10, laps: 3, done: true),
            QualifyingEntry(id: "none", best: nil, setAt: nil, laps: 3, done: true),
            QualifyingEntry(id: "late", best: 4800, setAt: 90, laps: 3, done: true),
            QualifyingEntry(id: "early", best: 4800, setAt: 50, laps: 3, done: true),
        ]
        #expect(qualifyingOrder(entries).map(\.id) == ["early", "late", "slow", "none"])
    }

    @Test func standingsCountLinesThenTimeAndPenalties() {
        // 8 laps: 2 stops required; b made none and finishes 2 s ahead → 50 s behind.
        let lines = 8 * 3 + 1
        let a = RaceDriver(id: "a", name: "A", passes: (0..<lines).map { 1000 + $0 * 100 + 120 }, status: .finished, best: 4000, stops: 2)
        let b = RaceDriver(id: "b", name: "B", passes: (0..<lines).map { 1000 + $0 * 100 }, status: .finished, best: 3900, stops: 0)
        let c = RaceDriver(id: "c", name: "C", passes: [1000, 1100], status: .dnf, best: nil, stops: 0)
        let race = raceStandings([b, a, c], start: 1000)
        #expect(race.map(\.id) == ["a", "b", "c"])
        #expect(race[1].penalty == 2 * 25 * 60)
        #expect(race[1].gap == 2 * 25 * 60 - 120)
        #expect(race[2].gap == nil)
        let points = racePoints(race)
        #expect(points == ["a": 25, "b": 18, "c": 0])
    }

    @Test func theLineupSeatsThePlayerAndRanksTheBots() {
        let seats = teamLineup(.mclaren, random: { 0.7 })
        #expect(seats.count == 10)
        #expect(seats.first { $0.kind == .player }?.team == .mclaren)
        #expect(seats.first { $0.id == "mclaren-0" }?.name == "Norris")
        #expect(seats.filter { $0.kind == .bot(.hard) }.count == 5)
        let bots = squadBots(seats)
        #expect(bots.count == 9)
        #expect(bots.first { $0.id == "mclaren-0" }?.box == 3)
        #expect(bots.first { $0.id == "ferrari-1" }?.pitLag == 1)
        #expect(teamBoxes(seats)[Seat.playerId] == 5)
        let standings = constructorStandings(
            [], racePoints([]), seats)
        #expect(standings.count == 5)
    }

    /// Lobby → qualifying (every time given, ended by the manager) → grid → a one-lap race driven by ten bots → results.
    @Test func runsAWholeGrandPrix() throws {
        let definition = try CircuitCatalog.definition("monza")
        let seats = teamLineup(.ferrari, random: { 0.2 })
        let bots = squadBots(seats)
        // The player's seat is driven by a bot too, here.
        let all = bots + [SquadBot(id: Seat.playerId, level: .medium, box: 5, pitLag: 0)]
        let room = try OfflineRoom(
            definition: definition,
            carParamsById: Dictionary(uniqueKeysWithValues: all.map { ($0.id, botCarParams(.baseline, .baseline($0.level))) }),
            boxes: teamBoxes(seats))
        let gp = GrandPrix(room: room, random: { 0.5 })
        for (i, seat) in seats.enumerated() { gp.addSimulated(seat.id, name: seat.name, best: 4700 + i * 10) }
        #expect(gp.command(Seat.playerId, .start) == false)  // only the manager (the first in) moves it on
        let manager = seats[0].id
        #expect(gp.command(manager, .start))
        // Every time given, nobody drives: qualifying waits, as on the web, for the manager to end it.
        #expect(gp.info.phase == .qualifying)
        #expect(gp.command(manager, .endQualifying))
        #expect(gp.info.phase == .grid)
        #expect(gp.info.qualifying.first?.id == manager)
        #expect(room.state.cars.count == 10)
        #expect(gp.command(manager, .startRace(laps: 1)))
        let squad = BotSquad(track: room.track, bots: all)
        squad.setRace(1)
        var ticks = 0
        while gp.info.phase == .race && ticks < 12_000 {
            room.step(squad.inputs(room.state, held: room.held))
            gp.afterTick()
            ticks += 1
        }
        let info = gp.info
        #expect(info.phase == .results)
        #expect(info.race.count == 10)
        #expect(info.race.filter { $0.status == .finished }.count >= 8)
        let points = racePoints(info.race)
        #expect(points.values.reduce(0, +) <= 101)
        #expect(constructorStandings(info.race, points, seats).first!.points > 0)
    }
}
