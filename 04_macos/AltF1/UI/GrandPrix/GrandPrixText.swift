import AltF1Core
import SwiftUI

/// The Grand Prix panel's content (the web's `race/grandPrixText.ts`).
struct GrandPrixContent: Equatable {
    struct Row: Equatable {
        var name: String
        var color: Color
        var note: String
        var own = false
        /// `PIT`, or `BOX` while stopped.
        var pit: String?
        /// Stops made / required, and whether short of them.
        var stops: String?
        var stopsShort = false
        /// The session's fastest lap (purple stopwatch).
        var fastest: String?
    }

    var title: String
    var rows: [Row]
    var hint: String
}

enum GrandPrixText {
    /// The panel for player `ownId`, by phase: the qualifying order (the grid), then the race order
    /// with the gaps, and what the player can do. Single player: the player is always the manager.
    static func content(_ session: GrandPrixSession) -> GrandPrixContent {
        let info = session.info
        let ownId = GrandPrixSession.playerId
        let fastest = fastestLap(
            info.phase == .race || info.phase == .results ? info.race.map { ($0.id, $0.best) } : info.qualifying.map { ($0.id, $0.best) })
        func time(_ best: Int?) -> String { best.map { Format.lapTime($0) } ?? "no time" }
        func row(_ id: CarId, _ name: String, _ note: String) -> GrandPrixContent.Row {
            GrandPrixContent.Row(
                name: name, color: session.livery(id).color, note: note, own: id == ownId, pit: session.pits[id],
                fastest: fastest?.id == id ? Format.lapTime(fastest!.best) : nil)
        }
        let rain = info.weather == .rain ? " · RAIN" : ""
        switch info.phase {
        case .lobby:
            return GrandPrixContent(title: "GRAND PRIX · WAITING\(rain)", rows: [], hint: "Enter: start the GP")
        case .qualifying:
            let own = info.qualifying.first { $0.id == ownId }
            let done = own?.done == true ? "Your laps are done — watching the others" : ""
            return GrandPrixContent(
                title: "GRAND PRIX · QUALIFYING\(rain)",
                rows: info.qualifying.enumerated().map { i, entry in
                    row(entry.id, "\(i + 1)  \(session.name(entry.id))", "\(time(entry.best)) · \(entry.done ? "done" : "Q\(entry.laps + 1)")")
                },
                hint: [done, "Three timed laps, Q1 to Q3 — Enter: end qualifying now"].filter { !$0.isEmpty }.joined(separator: " — "))
        case .grid:
            let choices = GrandPrixRules.raceLaps.enumerated().map { "\($0.offset + 1): \($0.element) laps" }.joined(separator: " · ")
            let hint =
                session.customLaps.map { laps in
                    ["Race over ◀ \(laps) laps ▶ (←/→)", stopsNote(laps)].filter { !$0.isEmpty }.joined(separator: " · ")
                        + " — Enter: start"
                } ?? "Start the race — \(choices) · 4: other"
            return GrandPrixContent(
                title: "GRAND PRIX · STARTING GRID\(rain)",
                rows: info.qualifying.enumerated().map { i, entry in
                    row(entry.id, "P\(i + 1)  \(session.name(entry.id))", time(entry.best))
                },
                hint: hint)
        case .race, .results:
            let laps = info.raceLaps ?? 0
            let required = requiredStops(laps)
            let own = info.race.first { $0.id == ownId }
            let rows = info.race.enumerated().map { i, standing in
                var line = row(standing.id, "\(i + 1)  \(standing.name)", raceNote(standing, i, laps))
                if info.phase == .results { line.pit = nil }
                if required > 0 && standing.status != .dnf {
                    line.stops = "\(standing.stops)/\(required)"
                    line.stopsShort = standing.stops < required
                }
                return line
            }
            if info.phase == .results { return GrandPrixContent(title: "GRAND PRIX · RESULTS", rows: rows, hint: "") }
            let done = own?.status == .finished ? "Finished — watching the others" : ""
            return GrandPrixContent(
                title: "GRAND PRIX · RACE · \(laps) LAPS\(rain)", rows: rows,
                hint: [done, stopsNote(laps), "Enter: end the race now"].filter { !$0.isEmpty }.joined(separator: " — "))
        }
    }

    /// An online Grand Prix's panel for player `ownId` (the web's `grandPrixContent`): as above, but
    /// the manager's keys only for the manager, the others told whom they wait for; in the lobby of
    /// a track with rain the manager's 1/2; a GP that started without the player.
    static func online(
        _ info: GrandPrixInfo, ownId: CarId, names: [CarId: String], colors: [CarId: Color],
        pits: [CarId: String], canRain: Bool, customLaps: Int?
    ) -> GrandPrixContent {
        let fastest = fastestLap(
            info.phase == .race || info.phase == .results ? info.race.map { ($0.id, $0.best) } : info.qualifying.map { ($0.id, $0.best) })
        func time(_ best: Int?) -> String { best.map { Format.lapTime($0) } ?? "no time" }
        func row(_ id: CarId, _ name: String, _ note: String) -> GrandPrixContent.Row {
            GrandPrixContent.Row(
                name: name, color: colors[id] ?? Livery.grey.color, note: note, own: id == ownId, pit: pits[id],
                fastest: fastest?.id == id ? Format.lapTime(fastest!.best) : nil)
        }
        let isManager = info.manager == ownId
        let manager = info.manager.flatMap { names[$0] } ?? "the manager"
        let leftOut = info.phase != .lobby && info.phase != .results && !info.drivers.contains(ownId)
        if leftOut {
            return GrandPrixContent(
                title: "GRAND PRIX · IN PROGRESS", rows: [], hint: "The new GP started without you — Esc: back to the start")
        }
        let weather = info.weather == .rain ? " · RAIN" : canRain && info.phase == .lobby ? " · DRY" : ""
        switch info.phase {
        case .lobby:
            let hint =
                isManager
                ? "You are the GP manager — \(canRain ? "1: dry · 2: rain · " : "")Enter: start the GP"
                : info.manager == nil
                    ? "Waiting for a driver: the next one in is the manager" : "Waiting for \(manager) to start the GP"
            return GrandPrixContent(
                title: "GRAND PRIX · WAITING\(weather)",
                rows: info.drivers.map { row($0, names[$0] ?? $0, $0 == info.manager ? "manager" : "") },
                hint: hint)
        case .qualifying:
            let own = info.qualifying.first { $0.id == ownId }
            let done = own?.done == true ? "Your laps are done — watching the others" : ""
            return GrandPrixContent(
                title: "GRAND PRIX · QUALIFYING\(weather)",
                rows: info.qualifying.enumerated().map { i, entry in
                    row(entry.id, "\(i + 1)  \(names[entry.id] ?? entry.id)", "\(time(entry.best)) · \(entry.done ? "done" : "Q\(entry.laps + 1)")")
                },
                hint: isManager
                    ? [done, "Enter: end qualifying now"].filter { !$0.isEmpty }.joined(separator: " — ")
                    : done.isEmpty ? "Three timed laps, Q1 to Q3: the best one counts" : done)
        case .grid:
            let choices = GrandPrixRules.raceLaps.enumerated().map { "\($0.offset + 1): \($0.element) laps" }.joined(separator: " · ")
            let hint =
                !isManager
                ? "Waiting for \(manager) to start the race"
                : customLaps.map { laps in
                    ["Race over ◀ \(laps) laps ▶ (←/→)", stopsNote(laps)].filter { !$0.isEmpty }.joined(separator: " · ")
                        + " — Enter: start"
                } ?? "Start the race — \(choices) · 4: other"
            return GrandPrixContent(
                title: "GRAND PRIX · STARTING GRID\(weather)",
                rows: info.qualifying.enumerated().map { i, entry in
                    row(entry.id, "P\(i + 1)  \(names[entry.id] ?? entry.id)", time(entry.best))
                },
                hint: hint)
        case .race, .results:
            let laps = info.raceLaps ?? 0
            let required = requiredStops(laps)
            let own = info.race.first { $0.id == ownId }
            let rows = info.race.enumerated().map { i, standing in
                // A driver who left is drawn grey, by the name the server kept.
                var line = row(standing.id, "\(i + 1)  \(standing.name)", raceNote(standing, i, laps))
                if info.phase == .results { line.pit = nil }
                if required > 0 && standing.status != .dnf {
                    line.stops = "\(standing.stops)/\(required)"
                    line.stopsShort = standing.stops < required
                }
                return line
            }
            if info.phase == .results { return GrandPrixContent(title: "GRAND PRIX · RESULTS", rows: rows, hint: "") }
            let done = own?.status == .finished ? "Finished — watching the others" : ""
            return GrandPrixContent(
                title: "GRAND PRIX · RACE · \(laps) LAPS\(weather)", rows: rows,
                hint: [done, stopsNote(laps), isManager ? "Enter: end the race now" : ""].filter { !$0.isEmpty }
                    .joined(separator: " — "))
        }
    }

    /// `2 mandatory pit stops (+25 s each one missing)`; empty when none is required.
    static func stopsNote(_ laps: Int) -> String {
        let required = requiredStops(laps)
        guard required > 0 else { return "" }
        return "\(required) mandatory pit stop\(required > 1 ? "s" : "") (+\(GrandPrixRules.penaltySeconds) s each one missing)"
    }

    /// The fastest lap among `entries`: the first in their order with the lowest time.
    static func fastestLap(_ entries: [(CarId, Int?)]) -> (id: CarId, best: Int)? {
        var fastest: (id: CarId, best: Int)?
        for (id, best) in entries {
            if let best, fastest == nil || best < fastest!.best { fastest = (id, best) }
        }
        return fastest
    }

    /// DNF; the leader's lap (or race time once finished); the others' gap, or the laps they are down.
    static func raceNote(_ standing: RaceStanding, _ position: Int, _ raceLaps: Int) -> String {
        if standing.status == .dnf { return "DNF" }
        if position == 0 {
            return standing.time.map { Format.lapTime($0) } ?? "LAP \(min(standing.laps + 1, raceLaps))/\(raceLaps)"
        }
        if standing.lapsBehind > 0 { return "+\(standing.lapsBehind) LAP\(standing.lapsBehind > 1 ? "S" : "")" }
        return standing.gap.map { Format.delta($0) } ?? ""
    }

    /// How the HUD names the player's lap: Q1–Q3 in qualifying, position and lap in the race.
    static func lapName(_ info: GrandPrixInfo, ownId: CarId = GrandPrixSession.playerId) -> @MainActor (LapState) -> String {
        switch info.phase {
        case .qualifying:
            return { $0.lapStartTick == nil ? "OUT LAP" : "Q\($0.laps + 1)" }
        case .race:
            let laps = info.raceLaps ?? 0
            let position = (info.race.firstIndex { $0.id == ownId } ?? 0) + 1
            let count = info.race.count
            return { "P\(position)/\(count) · LAP \(min($0.laps + 1, laps))/\(laps)" }
        default:
            return Format.lapName
        }
    }
}
