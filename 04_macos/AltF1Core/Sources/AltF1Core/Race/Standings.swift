public enum RaceStatus: String, Codable, Sendable {
    case running, finished, dnf
}

/// One driver's race so far (`race/standings.ts`). Times in ticks.
public struct RaceDriver: Codable, Hashable, Sendable {
    public var id: CarId
    public var name: String
    /// Tick of every timing line passed: the start line, then each sector line.
    public var passes: [Int]
    public var status: RaceStatus
    /// Fastest valid lap of the race.
    public var best: Int?
    /// Pit stops made in the race.
    public var stops: Int
}

/// A line of the race classification. Times in ticks.
public struct RaceStanding: Codable, Hashable, Sendable {
    public var id: CarId
    public var name: String
    public var status: RaceStatus
    /// Laps completed.
    public var laps: Int
    /// Race time, lights out to the flag, with the pit penalty; nil until finished.
    public var time: Int?
    /// Behind the leader at the last timing line both passed; nil for the leader, a DNF, or before the start.
    public var gap: Int?
    /// Whole laps behind the leader.
    public var lapsBehind: Int
    public var best: Int?
    public var stops: Int
    /// Time penalty for mandatory stops missing (ticks), once finished (or in the final result).
    public var penalty: Int
}

/// Timing lines passed according to a car's lap timing: 0 before the start line.
public func timingLinesPassed(_ lap: LapState) -> Int {
    lap.lapStartTick == nil ? 0 : lap.laps * TrackRules.sectorCount + lap.sector + 1
}

/// The race order, like an F1 timing tower at every timing line (see the web's `raceStandings`).
/// `drivers` in grid order, which settles ties; `start` = lights-out tick.
public func raceStandings(_ drivers: [RaceDriver], start: Int, final: Bool = false) -> [RaceStanding] {
    let sectors = TrackRules.sectorCount
    func lapsOf(_ d: RaceDriver) -> Int { max(0, Int(floorDiv(d.passes.count - 1, sectors))) }
    var penalties: [CarId: Int] = [:]
    for d in drivers {
        let counted = d.status == .finished || (final && d.status == .running)
        penalties[d.id] = counted ? pitPenaltyTicks(stops: d.stops, laps: lapsOf(d)) : 0
    }
    func at(_ d: RaceDriver, _ line: Int) -> Int { d.passes[line] + penalties[d.id]! }
    let order = drivers.enumerated().sorted { x, y in
        let (a, b) = (x.element, y.element)
        if (a.status == .dnf) != (b.status == .dnf) { return b.status == .dnf }
        if a.passes.count != b.passes.count { return a.passes.count > b.passes.count }
        if a.passes.isEmpty { return x.offset < y.offset }
        let ta = at(a, a.passes.count - 1)
        let tb = at(b, b.passes.count - 1)
        return ta != tb ? ta < tb : x.offset < y.offset
    }.map(\.element)
    guard let leader = order.first else { return [] }
    return order.enumerated().map { i, d in
        let last = d.passes.count - 1
        let behind = i > 0 && d.status != .dnf && last >= 0 && last < leader.passes.count
        let penalty = penalties[d.id]!
        return RaceStanding(
            id: d.id, name: d.name, status: d.status, laps: lapsOf(d),
            time: d.status == .finished ? d.passes.last! - start + penalty : nil,
            gap: behind ? at(d, last) - at(leader, last) : nil,
            lapsBehind: behind ? (leader.passes.count - 1 - last) / sectors : 0,
            best: d.best, stops: d.stops, penalty: penalty)
    }
}

/// JavaScript's `Math.floor(a / b)` on integers (towards −∞).
private func floorDiv(_ a: Int, _ b: Int) -> Int {
    let q = a / b
    return (a % b != 0 && (a < 0) != (b < 0)) ? q - 1 : q
}

/// Each driver's points from the final classification: F1's 25…1 to the first ten, 0 below and to a DNF.
public func racePoints(_ race: [RaceStanding]) -> [CarId: Int] {
    Dictionary(uniqueKeysWithValues: race.enumerated().map { i, s in
        (s.id, s.status == .dnf || i >= GrandPrixRules.points.count ? 0 : GrandPrixRules.points[i])
    })
}

/// A team in the constructors' standings of one race.
public struct ConstructorStanding: Sendable {
    public let team: TeamId
    public let points: Int
    /// Its two drivers with their points, best placed first.
    public let drivers: [(id: CarId, name: String, points: Int)]
}

/// The constructors' standings of one race: each team the sum of its drivers' points, most first;
/// a tie to the team with the better placed driver.
public func constructorStandings(_ race: [RaceStanding], _ points: [CarId: Int], _ seats: [Seat]) -> [ConstructorStanding] {
    func place(_ id: CarId) -> Int { race.firstIndex { $0.id == id } ?? race.count }
    let teams = Teams.all.map { team -> ConstructorStanding in
        let drivers = seats.filter { $0.team == team.id }
            .map { (id: $0.id, name: $0.name, points: points[$0.id] ?? 0) }
            .sorted { place($0.id) < place($1.id) }
        return ConstructorStanding(team: team.id, points: drivers.reduce(0) { $0 + $1.points }, drivers: drivers)
    }
    return teams.sorted {
        $0.points != $1.points ? $0.points > $1.points : place($0.drivers[0].id) < place($1.drivers[0].id)
    }
}
