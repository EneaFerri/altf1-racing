import Foundation

/// Yellow flags and debris (`config/flags.ts`, R.2, 01_docs/flags.md): a car hitting a wall hard
/// leaves debris on the track and brings out the yellow flag in that sector, in a Grand Prix's
/// qualifying and race.
public struct FlagParams: Codable, Hashable, Sendable {
    /// A wall hit at least this hard (closing speed, m/s) leaves debris.
    public var debrisImpact: Double
    /// The debris stays, and the sector's yellow flag is out, this long (s).
    public var seconds: Double
    /// The same car's hits closer together than this (s) are one crash.
    public var sameCrash: Double

    public static let baseline = FlagParams(debrisImpact: 22, seconds: 15, sameCrash: 2)
}

/// A crash's debris and yellow flag (`race/flags.ts`): the debris lies round `point` until tick
/// `until`, the flag is out in timing sector `sector` (0-based) as long.
public struct YellowFlag: Codable, Hashable, Sendable {
    public var carId: CarId
    public var point: Vec2
    /// Main-loop progress there (m from the line).
    public var progress: Double
    public var sector: Int
    public var since: Int
    public var until: Int

    public init(carId: CarId, point: Vec2, progress: Double, sector: Int, since: Int, until: Int) {
        self.carId = carId
        self.point = point
        self.progress = progress
        self.sector = sector
        self.since = since
        self.until = until
    }
}

/// `flags` after a tick of `state` on `track`: expired ones gone, a new one for each hard wall hit by
/// one of `drivers` (not the same crash as a flag of that car's still out).
public func stepYellowFlags(
    _ flags: [YellowFlag], _ state: GameState, _ track: Track, drivers: [CarId], _ p: FlagParams = .baseline
) -> [YellowFlag] {
    let tick = state.tick
    var next = flags.filter { $0.until > tick }
    for impact in state.impacts where impact.other == "wall" && impact.strength >= p.debrisImpact {
        guard drivers.contains(impact.carId) else { continue }
        let sameCrash = next.contains {
            $0.carId == impact.carId && Double(tick - $0.since) < p.sameCrash * Double(tickRate)
        }
        if sameCrash { continue }
        let progress = locateOnLoop(track, impact.point).distance
        next.append(
            YellowFlag(
                carId: impact.carId, point: impact.point, progress: progress, sector: sectorAt(track, progress),
                since: tick, until: tick + Int(jsRound(p.seconds * Double(tickRate)))))
    }
    return next
}

/// The timing sector (0-based) at main-loop `progress`.
public func sectorAt(_ track: Track, _ progress: Double) -> Int {
    var sector = 0
    for (i, start) in track.sectorStarts.enumerated() where progress >= start { sector = i }
    return sector
}

/// The sectors under a yellow flag, in order, each once.
public func yellowSectors(_ flags: [YellowFlag]) -> [Int] { Array(Set(flags.map(\.sector))).sorted() }

/// One piece of a crash's debris (the web's `view/debrisLayout.ts`): where, how big, which way.
public struct DebrisPiece: Codable, Hashable, Sendable {
    public enum Kind: String, Codable, Sendable { case carbon, paint, white }
    public var x: Double
    /// The road's height there (0 on a flat track).
    public var y: Double
    public var z: Double
    public var width: Double
    public var height: Double
    public var length: Double
    public var yaw: Double
    public var kind: Kind
}

/// The side of the track `flag`'s crash was on: 1 right of the driving direction, −1 left.
public func crashSide(_ track: Track, _ flag: YellowFlag) -> Double {
    locateOnLoop(track, flag.point).lateral >= 0 ? 1 : -1
}

/// Where `flag`'s crash left its debris on `track`, exactly as the web lays it (the same seeded
/// numbers): 40 pieces of carbon and paint from 4 m before the hit to 35 m after, most near the
/// wall it came off, one in six a bigger chunk.
public func debrisLayout(_ track: Track, _ flag: YellowFlag) -> [DebrisPiece] {
    let hash = flag.carId.unicodeScalars.reduce(7.0) { h, c in
        jsMod(h * 31 + Double(String(c).utf16.first!), 1_000_003)
    }
    var state = jsMod(abs(floor(Double(flag.since) * 31 + hash)), 2_147_483_646) + 1
    func random() -> Double {
        state = jsMod(state * 16807, 2_147_483_647)
        return state / 2_147_483_647
    }
    let side = crashSide(track, flag)
    let n = track.samples.count
    let lap = track.length
    let (before, after) = (4.0, 35.0)
    return (0..<40).map { _ in
        let along = flag.progress - before + random() * (before + after)
        let i = Int(jsRound((jsMod(jsMod(along, lap) + lap, lap) / lap) * Double(n))) % n
        let sample = track.samples[i]
        let across = side * sample.halfWidth * (1 - 0.85 * random() * random())
        let roll = random()
        let kind: DebrisPiece.Kind = roll < 0.5 ? .carbon : roll < 0.82 ? .paint : .white
        let chunk = random() < 1.0 / 6
        let size = chunk ? 0.5 + random() * 0.5 : 0.18 + random() * 0.35
        let height = chunk ? 0.08 + random() * 0.12 : 0.03 + random() * 0.05
        let length = size * (0.4 + random() * 0.8)
        return DebrisPiece(
            x: sample.position.x + sample.normal.x * across, y: sample.height,
            z: sample.position.z + sample.normal.z * across, width: size, height: height, length: length,
            yaw: random() * .pi * 2, kind: kind)
    }
}
