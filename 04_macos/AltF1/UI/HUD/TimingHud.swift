import AltF1Core
import Observation

/// The F1-style timing strip's content (the web's `Hud.ts`): lap, running time, sector bars, last
/// and best lap, slipstream, and a chip with each sector's gap to the best lap for a few seconds.
/// Fed the world every frame; changes only what really changes, so SwiftUI redraws little.
@MainActor
@Observable
final class TimingHud {
    /// How long the sector / lap chip stays under the strip (s).
    private static let chipSeconds = 3.0

    struct Chip: Equatable {
        var text: String
        var shade: SectorShade
    }

    private(set) var lapName = "OUT LAP"
    private(set) var time = "--:--.-"
    private(set) var valid = true
    private(set) var bars: [SectorShade?] = Array(repeating: nil, count: TrackRules.sectorCount)
    private(set) var last = "--:--.---"
    private(set) var lastStruck = false
    private(set) var best = "--:--.---"
    /// Slipstream tow (%).
    private(set) var slip = 0
    private(set) var chip: Chip?
    /// A Grand Prix's sector table: this lap's sectors and the own bests, each with its colour.
    private(set) var table: SectorTable?

    struct Cell: Equatable {
        var ticks: Int?
        var shade: SectorShade?
    }

    struct SectorTable: Equatable {
        var lap: [Cell]
        var best: [Cell]
    }

    /// How the lap being driven is named (Q1–Q3 in qualifying, `P2/6 · LAP 3/8` in a race).
    @ObservationIgnored var lapNamer: @MainActor (LapState) -> String = Format.lapName
    /// A Grand Prix: the session's best sectors of every driver; nil elsewhere. With them the
    /// sectors show as a table, in F1's colours.
    @ObservationIgnored var sessionBests: [Int?]?
    /// This lap's sector times as shown, and whether the lap is valid.
    @ObservationIgnored private var lapSectors: [Int?] = []
    @ObservationIgnored private var lapValid = true
    /// The own best of each sector, live: taken as each sector is done on a valid lap.
    @ObservationIgnored private var ownBests: [Int?] = []

    /// Bests as they were when the current lap started: what this lap's sectors are compared with.
    @ObservationIgnored private var bestSectors: [Int?] = []
    @ObservationIgnored private var bestLapSectors: [Int]?
    @ObservationIgnored private var lapStartTick: Int?
    @ObservationIgnored private var seenLaps = 0
    @ObservationIgnored private var seenSectors = 0
    @ObservationIgnored private var chipUntil = 0.0
    @ObservationIgnored private var shownChip: Chip?
    /// After a lap, its sector bars stay up while the chip shows; then they clear for the new lap.
    @ObservationIgnored private var clearBarsAt: Double?

    /// Call once per frame with the car to show; `now` in seconds.
    func update(_ state: GameState, carId: CarId, now: Double) {
        guard let timing = state.lap(carId), let car = state.car(carId) else { return }
        trackEvents(timing, now: now)
        set(\.lapName, lapNamer(timing))
        set(\.time, timing.lapStartTick.map { Format.lapTime(state.tick - $0, decimals: 1) } ?? "--:--.-")
        set(\.valid, timing.valid)
        set(\.last, timing.lastLap.map { Format.lapTime($0.ticks) } ?? "--:--.---")
        set(\.lastStruck, timing.lastLap?.valid == false)
        set(\.best, timing.bestLap.map { Format.lapTime($0.ticks) } ?? "--:--.---")
        set(\.slip, Format.slipstreamPercent(car.slipstream))
        set(\.chip, now > chipUntil ? nil : shownChip)
        if let clear = clearBarsAt, now > clear {
            set(\.bars, Array(repeating: nil, count: TrackRules.sectorCount))
            lapSectors = []
            clearBarsAt = nil
        }
        set(\.table, sessionBests.map { sectorTable(timing, $0) })
    }

    /// The own best of each sector: the finished laps' and the live ones.
    private func personalBests(_ timing: LapState) -> [Int?] {
        timing.bestSectors.enumerated().map { i, best in
            let live = i < ownBests.count ? ownBests[i] : nil
            guard let best else { return live }
            return live.map { min(best, $0) } ?? best
        }
    }

    /// The table, recoloured every frame against the session's bests (a purple beaten by another
    /// driver turns green).
    private func sectorTable(_ timing: LapState, _ session: [Int?]) -> SectorTable {
        let count = TrackRules.sectorCount
        let lap = (0..<count).map { i -> Cell in
            guard i < lapSectors.count, let ticks = lapSectors[i] else { return Cell() }
            let before = i < bestSectors.count ? bestSectors[i] : nil
            return Cell(ticks: ticks, shade: lapValid ? .gp(ticks, personalBefore: before, sessionBest: session[i]) : .invalid)
        }
        let own = personalBests(timing)
        let best = (0..<count).map { i -> Cell in
            guard let ticks = own[i] else { return Cell() }
            return Cell(ticks: ticks, shade: .gpBest(ticks, sessionBest: session[i]))
        }
        return SectorTable(lap: lap, best: best)
    }

    /// Colours finished sectors and shows the chip; snapshots the bests when a new lap starts.
    private func trackEvents(_ timing: LapState, now: Double) {
        let lastSector = TrackRules.sectorCount - 1
        var lapFinished = false
        if timing.laps != seenLaps, let lapTime = timing.lastLap {
            showSector(lastSector, lapTime.sectors, valid: lapTime.valid, now: now)
            shownChip?.text += " · LAP \(Format.lapTime(lapTime.ticks))"
            seenLaps = timing.laps
            lapFinished = true
        }
        if timing.lapStartTick != lapStartTick {
            lapStartTick = timing.lapStartTick
            seenSectors = 0
            // Fresh timing (a new session, the car put back on the track): no bests any more.
            if timing.lapStartTick == nil {
                seenLaps = timing.laps
                ownBests = []
            }
            bestSectors = sessionBests != nil ? personalBests(timing) : timing.bestSectors
            bestLapSectors = timing.bestLap?.sectors
            clearBarsAt = lapFinished ? chipUntil : now
        }
        while seenSectors < timing.currentSectors.count {
            showSector(seenSectors, timing.currentSectors, valid: timing.valid, now: now)
            seenSectors += 1
        }
    }

    private func showSector(_ index: Int, _ sectors: [Int], valid: Bool, now: Double) {
        let ticks = sectors[index]
        let reference = bestLapSectors
        let before = index < bestSectors.count ? bestSectors[index] : nil
        let shade: SectorShade
        if !valid {
            shade = .invalid
        } else if let session = sessionBests {
            shade = .gp(ticks, personalBefore: before, sessionBest: session[index])
        } else {
            shade = .of(ticks, best: before, bestLapSector: reference.flatMap { index < $0.count ? $0[index] : nil })
        }
        while lapSectors.count <= index { lapSectors.append(nil) }
        lapSectors[index] = ticks
        lapValid = valid
        while ownBests.count <= index { ownBests.append(nil) }
        if valid, ownBests[index].map({ ticks < $0 }) ?? true { ownBests[index] = ticks }
        var bars = self.bars
        bars[index] = shade
        set(\.bars, bars)
        // Gap to the best lap at the same point, or the sector time if there is no best lap yet.
        func upTo(_ list: [Int]) -> Int { list.prefix(index + 1).reduce(0, +) }
        let gap = reference.map { Format.delta(upTo(sectors) - upTo($0)) } ?? Format.lapTime(ticks)
        shownChip = Chip(text: "S\(index + 1)  \(gap)", shade: shade)
        chipUntil = now + Self.chipSeconds
    }

    /// Assigns only a changed value: an unchanged one would still make SwiftUI redraw.
    private func set<Value: Equatable>(_ key: ReferenceWritableKeyPath<TimingHud, Value>, _ value: Value) {
        if self[keyPath: key] != value { self[keyPath: key] = value }
    }
}
