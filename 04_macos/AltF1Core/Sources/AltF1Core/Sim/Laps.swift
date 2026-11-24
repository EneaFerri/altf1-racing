/// A completed lap (`sim/laps.ts`). Times are in ticks.
public struct LapTime: Codable, Hashable, Sendable {
    public var ticks: Int
    /// Ticks of each sector, in order; they add up to `ticks`.
    public var sectors: [Int]
    public var valid: Bool
}

/// Lap timing of one car. Plain data, part of `GameState` (01_docs/laps.md).
public struct LapState: Codable, Hashable, Sendable {
    public var carId: CarId
    /// Progress along the centreline at the last tick (m from the start line).
    public var distance: Double
    /// Sector being driven (0-based); −1 = out-lap, before the first crossing of the line.
    public var sector: Int
    /// Tick the current lap started on (nil during the out-lap).
    public var lapStartTick: Int?
    public var sectorStartTick: Int
    /// Ticks of the sectors already completed in this lap.
    public var currentSectors: [Int]
    /// False once something voids the current lap (a reset).
    public var valid: Bool
    /// Completed laps (valid or not).
    public var laps: Int
    public var lastLap: LapTime?
    /// Fastest valid lap.
    public var bestLap: LapTime?
    /// Fastest time per sector over all valid laps (nil = none yet).
    public var bestSectors: [Int?]

    public init(carId: CarId, distance: Double) {
        self.carId = carId
        self.distance = distance
        sector = -1
        lapStartTick = nil
        sectorStartTick = 0
        currentSectors = []
        valid = true
        laps = 0
        lastLap = nil
        bestLap = nil
        bestSectors = Array(repeating: nil, count: TrackRules.sectorCount)
    }
}

/// Distance along the track where sector `sector` ends; the last one ends on the start line (0).
public func sectorEnd(_ sector: Int, _ track: Track) -> Double {
    sector >= TrackRules.sectorCount - 1 ? 0 : track.sectorStarts[sector + 1]
}

/// Advances a car's timing to `tick`, given its new progress `distance` along the track. Only
/// moving forward across the boundary the car is expected to reach next counts. Pure.
public func stepLap(_ lap: LapState, _ distance: Double, _ reset: Bool, _ tick: Int, _ track: Track) -> LapState {
    let trackLength = track.length
    var current = lap
    current.distance = distance
    current.valid = lap.valid && !reset
    let delta = wrapDistance(distance - lap.distance, trackLength)
    let boundary = lap.sector < 0 ? 0 : sectorEnd(lap.sector, track)
    let ahead = mod(boundary - lap.distance, trackLength)
    if delta <= 0 || ahead == 0 || ahead > delta { return current }

    if lap.sector < 0 { return startLap(current, tick) }

    let currentSectors = current.currentSectors + [tick - current.sectorStartTick]
    if lap.sector < TrackRules.sectorCount - 1 {
        current.sector = lap.sector + 1
        current.sectorStartTick = tick
        current.currentSectors = currentSectors
        return current
    }
    return startLap(finishLap(current, currentSectors, tick), tick)
}

private func finishLap(_ lap: LapState, _ sectors: [Int], _ tick: Int) -> LapState {
    let lastLap = LapTime(ticks: tick - lap.lapStartTick!, sectors: sectors, valid: lap.valid)
    var next = lap
    next.laps = lap.laps + 1
    next.lastLap = lastLap
    if !lap.valid { return next }
    if let best = lap.bestLap, lastLap.ticks >= best.ticks {
        next.bestLap = best
    } else {
        next.bestLap = lastLap
    }
    next.bestSectors = lap.bestSectors.enumerated().map { i, best in
        if let best, sectors[i] >= best { return best }
        return sectors[i]
    }
    return next
}

private func startLap(_ lap: LapState, _ tick: Int) -> LapState {
    var next = lap
    next.sector = 0
    next.lapStartTick = tick
    next.sectorStartTick = tick
    next.currentSectors = []
    next.valid = true
    return next
}

private func mod(_ value: Double, _ length: Double) -> Double {
    jsMod(jsMod(value, length) + length, length)
}

/// Progress change wrapped into (−length/2, length/2], so crossing the start line isn't a huge jump.
private func wrapDistance(_ delta: Double, _ length: Double) -> Double {
    let wrapped = mod(delta, length)
    return wrapped > length / 2 ? wrapped - length : wrapped
}
