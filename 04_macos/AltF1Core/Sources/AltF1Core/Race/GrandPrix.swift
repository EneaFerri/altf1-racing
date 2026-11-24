/// What the Grand Prix needs from its room's simulation (`race/GrandPrix.ts`): the server's room
/// online, single player's own room offline (both run the same rules).
public protocol GrandPrixRoom: AnyObject {
    var trackName: String { get }
    var state: GameState { get }
    /// Cars held on the grid (and the start lights); nil while they may drive.
    var hold: StartHold? { get set }
    /// Every car in `order` back on the grid (the others off the track), timing reset.
    func restart(_ order: [CarId])
    /// Takes a car off the track (its driver is done).
    func retire(_ id: CarId)
    /// Puts a car back on the track.
    func spawn(_ id: CarId)
    func setDamage(_ on: Bool)
    func setPitBoxes(_ boxes: [CarId: Int])
    func setWeather(_ weather: Weather)
}

/// A Grand Prix as its drivers see it.
public struct GrandPrixInfo: Sendable {
    public var phase: GrandPrixPhase
    /// The manager: the first driver in.
    public var manager: CarId?
    public var drivers: [CarId]
    /// Qualifying in order (live, then the grid); empty in the lobby.
    public var qualifying: [QualifyingEntry]
    /// The race classification, live; empty before the race.
    public var race: [RaceStanding]
    public var raceLaps: Int?
    public var hold: StartHold?
    public var boxes: [CarId: Int]
    public var weather: Weather
    /// The session's best time of each sector over every driver.
    public var sectorBests: [Int?]
}

/// The rules of one circuit's Grand Prix, driving its room through the phases: lobby → qualifying
/// (3 timed laps each, then off the track) → grid (qualifying order, held) → race (start lights,
/// timing at every line, finishers off the track) → results → (play again) a new lobby. The first
/// driver in is the manager. Pure apart from `random` (lights out).
public final class GrandPrix {
    private var phase = GrandPrixPhase.lobby
    private var drivers: [CarId] = []
    private var names: [CarId: String] = [:]
    private var boxes: [CarId: Int] = [:]
    private var results: [CarId: QualifyingEntry] = [:]
    /// The race by driver, in grid order (`racerOrder`).
    private var racers: [CarId: RaceDriver] = [:]
    private var racerOrder: [CarId] = []
    private var raceLaps: Int?
    private var weather = Weather.dry
    private var sectorBests: [Int?] = Array(repeating: nil, count: TrackRules.sectorCount)
    /// Drivers with a given qualifying time (`addSimulated`).
    private var simulated: [CarId: Int] = [:]
    /// The race's last counted pit stop of each driver (its end tick).
    private var stopsCounted: [CarId: Int] = [:]
    private let room: GrandPrixRoom
    private let random: () -> Double

    public init(room: GrandPrixRoom, random: @escaping () -> Double = { Double.random(in: 0..<1) }) {
        self.room = room
        self.random = random
    }

    public var isOpen: Bool { phase == .lobby }
    public var isTimed: Bool { phase == .qualifying || phase == .race }

    public var info: GrandPrixInfo {
        GrandPrixInfo(
            phase: phase, manager: drivers.first, drivers: drivers, qualifying: order(),
            race: raceStandings(racerOrder.compactMap { racers[$0] }, start: room.hold?.until ?? 0, final: phase == .results),
            raceLaps: raceLaps, hold: room.hold, boxes: boxes, weather: weather, sectorBests: sectorBests)
    }

    public func add(_ id: CarId, name: String) {
        drivers.append(id)
        names[id] = name
        giveBox(id)
    }

    /// A driver whose qualifying is given (`best` ticks) instead of driven: single player's bots.
    public func addSimulated(_ id: CarId, name: String, best: Int) {
        add(id, name: name)
        simulated[id] = best
    }

    /// A driver left: out of the Grand Prix (racing: DNF).
    public func remove(_ id: CarId) {
        drivers.removeAll { $0 == id }
        if boxes.removeValue(forKey: id) != nil { room.setPitBoxes(boxes) }
        results.removeValue(forKey: id)
        simulated.removeValue(forKey: id)
        if drivers.isEmpty { return }
        if phase == .qualifying && allDone() { toGrid() }
        if phase == .race, var racer = racers[id], racer.status == .running {
            racer.status = .dnf
            racers[id] = racer
            if !anyRacing() { setPhase(.results) }
        }
    }

    /// Applies `command` if `id` is the manager and it fits the phase; whether anything changed.
    @discardableResult
    public func command(_ id: CarId, _ command: GrandPrixCommand) -> Bool {
        if command == .playAgain { return playAgain(id) }
        guard id == drivers.first else { return false }
        switch command {
        case .weather(let wanted) where phase == .lobby:
            let allowed = wanted == .dry || Weather.offersRain(room.trackName)
            guard allowed, wanted != weather else { return false }
            weather = wanted
            room.setWeather(wanted)
            return true
        case .start where phase == .lobby:
            setPhase(.qualifying)
            for driver in drivers {
                results[driver] =
                    simulated[driver].map {
                        QualifyingEntry(id: driver, best: $0, setAt: 0, laps: GrandPrixRules.qualifyingLaps, done: true)
                    } ?? QualifyingEntry(id: driver, best: nil, setAt: nil, laps: 0, done: false)
            }
            // Only those who drive their qualifying go out on track.
            room.restart(drivers.filter { simulated[$0] == nil })
            return true
        case .endQualifying where phase == .qualifying:
            toGrid()
            return true
        case .startRace(let laps) where phase == .grid:
            setPhase(.race)
            raceLaps = laps
            room.hold = startHold(room.state.tick, random())
            racerOrder = order().map(\.id)
            for id in racerOrder {
                racers[id] = RaceDriver(id: id, name: names[id]!, passes: [], status: .running, best: nil, stops: 0)
            }
            return true
        case .endRace where phase == .race:
            setPhase(.results)
            return true
        default:
            return false
        }
    }

    /// Reads the room after a tick: the session's best sectors; qualifying laps (cars off the track
    /// once done); in the race every timing line, finishers off the track. Whether the GP changed.
    @discardableResult
    public func afterTick() -> Bool {
        let bests = newSectorBests()
        if phase == .race { return raceTick() || bests }
        guard phase == .qualifying else { return bests }
        var changed = bests
        for lap in room.state.laps {
            guard var entry = results[lap.carId], !entry.done, lap.laps != entry.laps else { continue }
            let time = lap.lastLap?.valid == true ? lap.lastLap?.ticks : nil
            let better = time.map { t in entry.best.map { t < $0 } ?? true } ?? false
            entry.done = lap.laps >= GrandPrixRules.qualifyingLaps
            if better {
                entry.best = time
                entry.setAt = room.state.tick
            }
            entry.laps = lap.laps
            results[lap.carId] = entry
            if entry.done { room.retire(lap.carId) }
            changed = true
        }
        if changed && allDone() { toGrid() }
        return changed
    }

    private func playAgain(_ id: CarId) -> Bool {
        if phase == .results {
            setPhase(.lobby)
            drivers = [id]
            boxes = [:]
            giveBox(id)
            results = [:]
            simulated = [:]
            racers = [:]
            racerOrder = []
            stopsCounted = [:]
            raceLaps = nil
            room.hold = nil
            room.restart([id])
            return true
        }
        guard phase == .lobby, !drivers.contains(id) else { return false }
        drivers.append(id)
        giveBox(id)
        room.spawn(id)
        return true
    }

    private func raceTick() -> Bool {
        let state = room.state
        var changed = false
        // A pit stop counts when it begins (one per pass through the pits).
        for car in state.cars {
            guard let stop = car.pitStop, var racer = racers[car.id], racer.status == .running,
                stopsCounted[car.id] != stop.until
            else { continue }
            stopsCounted[car.id] = stop.until
            racer.stops += 1
            racers[car.id] = racer
            changed = true
        }
        for lap in state.laps {
            guard var racer = racers[lap.carId], racer.status == .running else { continue }
            let lines = timingLinesPassed(lap)
            guard lines > racer.passes.count else { continue }
            let finished = lap.laps >= raceLaps!
            // One line per tick at most while driving; any skipped one is timed now.
            racer.passes += Array(repeating: state.tick, count: lines - racer.passes.count)
            racer.status = finished ? .finished : .running
            racer.best = lap.bestLap?.ticks
            racers[lap.carId] = racer
            if finished { room.retire(lap.carId) }
            changed = true
        }
        if changed && !anyRacing() { setPhase(.results) }
        return changed
    }

    /// Every car's sector times into the session's bests, live.
    private func newSectorBests() -> Bool {
        var improved = false
        func take(_ time: Int?, _ i: Int) {
            guard let time, i < sectorBests.count else { return }
            if let best = sectorBests[i], time >= best { return }
            sectorBests[i] = time
            improved = true
        }
        for lap in room.state.laps {
            for (i, best) in lap.bestSectors.enumerated() { take(best, i) }
            if lap.valid { for (i, time) in lap.currentSectors.enumerated() { take(time, i) } }
        }
        return improved
    }

    /// `id`'s pit box: the lowest no driver has.
    private func giveBox(_ id: CarId) {
        let taken = Set(boxes.values)
        var box = 0
        while taken.contains(box) { box += 1 }
        boxes[id] = box
        room.setPitBoxes(boxes)
    }

    /// Every phase change: a new session (its own bests), the damage following the phase.
    private func setPhase(_ next: GrandPrixPhase) {
        phase = next
        sectorBests = Array(repeating: nil, count: TrackRules.sectorCount)
        room.setDamage(damageInPhase(next))
    }

    private func anyRacing() -> Bool { racers.values.contains { $0.status == .running } }

    private func order() -> [QualifyingEntry] { qualifyingOrder(drivers.compactMap { results[$0] }) }

    private func allDone() -> Bool { drivers.allSatisfy { results[$0]?.done == true } }

    private func toGrid() {
        setPhase(.grid)
        room.restart(order().map(\.id))
        room.hold = .held
    }
}
