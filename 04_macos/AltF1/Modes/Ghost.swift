import AltF1Core

/// Time trial's ghost (the web's `singleplayer/ghost.ts`): the own best valid lap of the session,
/// replayed in step with the current lap. Records the car at every tick of the lap being driven;
/// when a valid lap ends faster than the ghost (or there is none yet), that recording becomes it.
struct Ghost {
    private let carId: CarId
    /// The best lap: the car at each of its ticks from the start; nil before the first valid lap.
    private var best: [CarState]?
    /// The lap being driven, tick by tick from `lapStart`.
    private var recording: [CarState] = []
    /// Tick the lap being driven started on; nil on the out-lap.
    private var lapStart: Int?
    /// Laps completed when the current lap started.
    private var lapsDone = 0

    init(carId: CarId) { self.carId = carId }

    /// Takes the world after a tick: records the car, and keeps a finished lap if it's the best.
    mutating func record(_ state: GameState) {
        guard let lap = state.lap(carId), let car = state.car(carId) else { return }
        if lap.lapStartTick != lapStart {
            let finished = lap.laps > lapsDone ? lap.lastLap : nil
            if let finished, finished.valid, best == nil || finished.ticks < best!.count {
                let last = recording.last ?? car
                while recording.count < finished.ticks { recording.append(last) }
                best = Array(recording.prefix(finished.ticks))
            }
            lapStart = lap.lapStartTick
            lapsDone = lap.laps
            recording = []
        }
        if lapStart != nil { recording.append(car) }
    }

    /// The ghost at (fractional) tick `tick` of the current lap's clock: the two recorded states
    /// round it and how far between them; nil on the out-lap, before the first valid lap, and once
    /// the ghost has crossed the line (it waits for the next lap).
    func frame(at tick: Double) -> (before: CarState, after: CarState, alpha: Double)? {
        guard let best, let lapStart else { return nil }
        let t = tick - Double(lapStart)
        guard t >= 0, t < Double(best.count) else { return nil }
        let i = Int(t)
        return (best[i], best[min(i + 1, best.count - 1)], t - Double(i))
    }
}
