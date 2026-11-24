import Foundation

/// What a bot aims for at each centreline sample of the road it drives (`ai/plan.ts`).
public struct BotPlan: Sendable {
    /// The closed road the bot drives: the main loop, or a route through a branch.
    public let road: Track
    /// Racing line: signed offset from the centreline (m, + = right), per sample.
    public let lateral: [Double]
    /// Racing line points, per sample.
    public let line: [Vec2]
    /// Highest speed to carry through each sample (m/s), braking zones included.
    public let speed: [Double]
}

/// The bot's car: the player's `CarParams` with `performance` on acceleration and top speed.
public func botCarParams(_ car: CarParams, _ bot: BotParams) -> CarParams {
    var next = car
    next.engineAccel = car.engineAccel * bot.performance
    next.maxSpeed = car.maxSpeed * bot.performance
    return next
}

/// A bot's racing line and speed profile for `track` (see the web's `buildBotPlan`).
public func buildBotPlan(
    _ track: Track, _ player: CarParams, _ bot: BotParams, slope: SlopeParams = .baseline, wet: WetParams? = nil
) -> BotPlan {
    // A shortcut, never the pit lane (that is `buildPitPlan`'s).
    let shortcut = track.routes.first { !$0.pit }
    let car = wet.map { wetPlanCar(player, $0) } ?? player
    return planRoad(bot.shortcuts ? (shortcut ?? track) : track, car, bot, slope)
}

/// A bot's plan for a lap through the pit lane to stop in box `box` (see the web's `buildPitPlan`).
public func buildPitPlan(
    _ track: Track, _ player: CarParams, _ bot: BotParams, box: Int, pit: PitParams,
    slope: SlopeParams = .baseline, wet: WetParams? = nil
) -> BotPlan {
    guard let road = track.routes.first(where: \.pit), let rules = road.pitRules else {
        preconditionFailure("\(track.name): no pit lane to plan a stop through")
    }
    let at = rules.boxes[box % rules.boxes.count]
    let car = wet.map { wetPlanCar(player, $0) } ?? player
    return planRoad(road, car, bot, slope) { sample in
        let d = sample.distance
        // Just before the box: slow enough for the stop to begin.
        if d >= at - pit.boxReach + pitStopMargin && d <= at { return pit.boxSpeed / 2 }
        if d >= rules.limitFrom && d <= rules.limitTo { return rules.speedLimit - pitLimitMargin }
        return .infinity
    }
}

/// The bot aims to be this far (m) inside its box's reach when it gets slow enough to stop.
private let pitStopMargin: Double = 1
/// The bot keeps this much (m/s) under the pit lane's speed limit.
private let pitLimitMargin: Double = 0.5
/// How much of the wet grip loss a bot takes off its cornering yaw.
private let wetYawShare: Double = 0.5
/// Braking never counts on less than this share of the planned deceleration (steep descents).
private let minBraking: Double = 0.25

/// The car as a bot plans it on a wet track: weaker brakes, less yaw counted on in corners.
private func wetPlanCar(_ car: CarParams, _ wet: WetParams) -> CarParams {
    var next = car
    next.brakeDecel = car.brakeDecel * wet.traction * wet.brake
    next.maxYawRate = car.maxYawRate * pow(wet.grip, wetYawShare)
    return next
}

/// The plan on `track`; `cap` limits the speed at each sample (the pit lane's limit and the stop).
private func planRoad(
    _ track: Track, _ player: CarParams, _ bot: BotParams, _ slope: SlopeParams,
    cap: ((TrackSample) -> Double)? = nil
) -> BotPlan {
    let car = botCarParams(player, bot)
    let samples = track.samples
    let n = samples.count

    let lateral = relaxLine(track, bot.lineCut)
    let line = (0..<n).map { samples[$0].position + samples[$0].normal * lateral[$0] }

    let topSpeed = bot.topSpeed * car.maxSpeed
    var speed = (0..<n).map { i in
        min(topSpeed, cornerSpeed(abs(lineCurvature(line, i)), car, bot), cap?(samples[i]) ?? .infinity)
    }

    // Braking: backwards round the loop (twice, so the start line wraps).
    let planned = bot.brakeUse * car.brakeDecel
    func decel(_ i: Int) -> Double {
        track.elevated
            ? max(minBraking * planned, planned + slope.gravity * slope.factor * samples[i].grade) : planned
    }
    for pass in 0..<(2 * n) {
        let i = n - 1 - (pass % n)
        let next = (i + 1) % n
        let reachable = (speed[next] * speed[next] + 2 * decel(i) * line[i].distance(to: line[next])).squareRoot()
        if reachable < speed[i] { speed[i] = reachable }
    }
    return BotPlan(road: track, lateral: lateral, line: line, speed: speed)
}

/// Signed curvature (1/m, + = right) of the racing line at point `i`, over two samples each side.
private func lineCurvature(_ line: [Vec2], _ i: Int) -> Double {
    let n = line.count
    func at(_ k: Int) -> Vec2 { line[wrapIndex(k, n)] }
    let before = at(i) - at(i - 2)
    let after = at(i + 2) - at(i)
    let arc = (at(i - 2).distance(to: at(i)) + at(i).distance(to: at(i + 2))) / 2
    return arc > 0 ? -wrapAngle(after.heading - before.heading) / arc : 0
}

/// Highest speed at which the car's yaw rate can follow `curvature`, using `cornerSpeed` of it.
private func cornerSpeed(_ curvature: Double, _ car: CarParams, _ bot: BotParams) -> Double {
    let yaw = bot.cornerSpeed * car.maxYawRate
    return yaw / (curvature + (yaw * car.highSpeedSteerLoss) / car.maxSpeed)
}

/// Racing line as signed offsets from the centreline: a string pulled tight between the edges.
private func relaxLine(_ track: Track, _ cut: Double) -> [Double] {
    let samples = track.samples
    let n = samples.count
    let span = max(1, Int(jsRound((BotDriver.lineSpan * Double(n)) / track.length)))
    let room = samples.map { cut * max(0, $0.halfWidth - BotDriver.edgeMargin) }
    var lateral = [Double](repeating: 0, count: n)
    func point(_ i: Int) -> Vec2 {
        let j = wrapIndex(i, n)
        return samples[j].position + samples[j].normal * lateral[j]
    }
    for _ in 0..<BotDriver.lineIterations {
        for i in 0..<n {
            let mid = (point(i - span) + point(i + span)) * 0.5
            let offset = (mid - samples[i].position).dot(samples[i].normal)
            lateral[i] = max(-room[i], min(room[i], offset))
        }
    }
    return lateral
}
