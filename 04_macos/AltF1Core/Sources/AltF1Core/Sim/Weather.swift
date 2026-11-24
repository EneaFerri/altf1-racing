/// A wet track, as the simulation feels it (`sim/weather.ts`, 01_docs/weather.md).
public struct WetTrack: Sendable {
    public var params: WetParams
    public var puddles: [Puddle]

    public init(params: WetParams = .baseline, puddles: [Puddle]) {
        self.params = params
        self.puddles = puddles
    }
}

/// A puddle on a wet track: a flat ellipse on the asphalt, its long axis along the track.
public struct Puddle: Codable, Hashable, Sendable {
    public var center: Vec2
    /// Unit vector along the track there (the long axis).
    public var axis: Vec2
    /// Unit vector across the track there (the short axis).
    public var normal: Vec2
    public var halfLength: Double
    public var halfWidth: Double
}

/// The puddles of `track` when it rains: one chance every `step` m, higher round the corners, none
/// on the grid; each wholly on the asphalt. Deterministic: seeded by the track's name, so the
/// server, every client and the view place exactly the same ones.
public func placePuddles(_ track: Track, _ p: PuddleParams = .baseline) -> [Puddle] {
    var random = SeededRandom(seed: hashName(track.name))
    let samples = track.samples
    let n = samples.count
    let spacing = track.length / Double(n)
    let every = max(1, Int(jsRound(p.step / spacing)))
    let window = Int(jsRound(p.bendWindow / spacing))
    var puddles: [Puddle] = []
    var i = 0
    while i < n {
        defer { i += every }
        // Every spot draws the same four numbers, kept or not: one change never shifts the rest.
        let roll = random.next()
        let length = random.next()
        let width = random.next()
        let across = random.next()
        let s = samples[i]
        if s.distance < p.gridAhead || s.distance > track.length - p.gridBack { continue }
        var bend = 0.0
        for k in -window...window {
            bend = max(bend, abs(samples[(i + k + n) % n].curvature))
        }
        if roll >= min(p.maxChance, p.baseChance + bend * p.bendChance) { continue }
        let halfLength = between(p.halfLength, length)
        let halfWidth = between(p.halfWidth, width)
        let room = s.halfWidth - track.kerbInset - p.edgeClearance - halfWidth
        if room <= 0 { continue }
        puddles.append(
            Puddle(
                center: s.position + s.normal * ((across * 2 - 1) * room), axis: s.tangent,
                normal: s.normal, halfLength: halfLength, halfWidth: halfWidth))
    }
    return puddles
}

/// Whether point `p` lies in one of `puddles`.
public func inPuddle(_ p: Vec2, _ puddles: [Puddle]) -> Bool {
    puddles.contains { puddle in
        let d = p - puddle.center
        let along = d.dot(puddle.axis) / puddle.halfLength
        let across = d.dot(puddle.normal) / puddle.halfWidth
        return along * along + across * across <= 1
    }
}

/// Share of `car`'s wheels in a puddle: 0, ¼, ½, ¾ or 1.
public func puddleShare(_ car: CarState, _ puddles: [Puddle]) -> Double {
    var wet = 0
    for wheel in carWheels
    where inPuddle(.toWorld(car.position, car.heading, ahead: wheel.ahead, side: wheel.side), puddles) {
        wet += 1
    }
    return Double(wet) / Double(carWheels.count)
}

/// The surfaces' `effect` on a wet track, `share` of the wheels in a puddle.
public func wetSurfaceEffect(_ effect: SurfaceEffect, _ share: Double, _ p: WetParams) -> SurfaceEffect {
    func puddle(_ factor: Double) -> Double { 1 + (factor - 1) * share }
    var next = effect
    next.grip = effect.grip * p.grip * puddle(p.puddleGrip)
    next.traction = effect.traction * p.traction * puddle(p.puddleTraction)
    next.brake = effect.brake * p.brake
    next.drag = effect.drag + p.puddleDrag * share
    return next
}

private func between(_ range: [Double], _ t: Double) -> Double {
    range[0] + (range[1] - range[0]) * t
}

/// FNV-1a over the name's UTF-16 code units (JavaScript's `charCodeAt`): a track's name as a seed.
private func hashName(_ name: String) -> UInt32 {
    var hash: UInt32 = 2_166_136_261
    for unit in name.utf16 {
        hash ^= UInt32(unit)
        hash = hash &* 16_777_619
    }
    return hash
}

/// Mulberry32: 0..1, the same sequence on every machine (and the web) for a seed.
private struct SeededRandom {
    var state: UInt32

    init(seed: UInt32) { state = seed }

    mutating func next() -> Double {
        state = state &+ 0x6D2B_79F5
        var t = state
        t = (t ^ (t >> 15)) &* (t | 1)
        t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
        return Double(t ^ (t >> 14)) / 4_294_967_296
    }
}
