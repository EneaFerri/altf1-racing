/// What a bot remembers between ticks (`ai/driver.ts`). Plain data.
public struct BotMemory: Codable, Hashable, Sendable {
    /// Consecutive ticks spent nearly stopped.
    public var stuckTicks: Int
    /// How far the bot has moved off its racing line to pass a car (m, + = right).
    public var offset: Double

    public static let new = BotMemory(stuckTicks: 0, offset: 0)
}

/// Another car as a bot sees it, on its road.
private struct Traffic {
    /// Metres ahead along the road (negative = behind), the shorter way round.
    let gap: Double
    /// Its offset from the centreline (m, + = right).
    let lateral: Double
    /// Its speed along the road (m/s).
    let speed: Double
    /// How close sideways it may be passed (m, centre to centre).
    let width: Double
}

/// One tick of bot driving: the same `InputCommand` a player would send (see the web's `botInput`).
public func botInput(_ car: CarState, _ plan: BotPlan, _ memory: BotMemory, _ others: [CarState] = [])
    -> (input: InputCommand, memory: BotMemory)
{
    let speed = car.velocity.dot(.forward(car.heading))
    // Held in its pit box (or just leaving it) is not stuck.
    let stuckTicks = speed < BotDriver.stuckSpeed && car.pitStop == nil ? memory.stuckTicks + 1 : 0
    if Double(stuckTicks) >= BotDriver.stuckSeconds * Double(tickRate) {
        return (InputCommand(reset: true), .new)
    }

    let track = plan.road
    let selfLoc = locateOnTrack(track, car.position)
    let here = selfLoc.index
    let travel = max(0, speed)
    let traffic = trafficAround(track, car, selfLoc.distance, others)
    let offset = passOffset(track, plan, here, selfLoc.lateral, travel, memory.offset, traffic)
    let aim = aimPoint(
        track, plan, indexAhead(track, here, BotDriver.lookAheadBase + travel * BotDriver.lookAheadTime),
        offset, sideRoom(selfLoc.lateral, traffic))
    let planned = plan.speed[indexAhead(track, here, travel * BotDriver.speedLookAheadTime)]
    let corner = brakingAhead(track, plan, here, travel)
    let target = min(planned, trafficSpeed(track, plan, here, selfLoc.lateral, offset, traffic, corner))

    // Heading grows to the left and steer +1 is right, hence the minus sign.
    let error = wrapAngle((aim - car.position).heading - car.heading)
    let steer = max(-1, min(1, -error * BotDriver.steerGain))

    let gap = target - speed
    let brake = gap < -1 ? min(1, -gap / 4) : 0
    let input = InputCommand(throttle: brake == 0 && gap > 0 ? 1 : 0, brake: brake, steer: steer)
    return (input, BotMemory(stuckTicks: stuckTicks, offset: offset))
}

/// The other cars on `track` near the bot; cars off it (in the pit lane) are left out.
private func trafficAround(_ track: Track, _ car: CarState, _ distance: Double, _ others: [CarState]) -> [Traffic] {
    others.compactMap { other in
        if other.id == car.id { return nil }
        let loc = locateOnLoop(track, other.position)
        var gap = loc.distance - distance
        if gap > track.length / 2 { gap -= track.length }
        if gap < -track.length / 2 { gap += track.length }
        if abs(gap) > BotDriver.trafficRange || abs(loc.lateral) > loc.halfWidth + 1 { return nil }
        let parked = other.pitStop != nil && other.velocity.length < 0.5
        return Traffic(
            gap: gap, lateral: loc.lateral, speed: other.velocity.dot(loc.tangent),
            width: parked ? BotDriver.parkedWidth : BotDriver.carWidth)
    }
}

/// The bot's offset from its racing line this tick (passing a slower car, holding a side by side).
private func passOffset(
    _ track: Track, _ plan: BotPlan, _ here: Int, _ lateral: Double, _ speed: Double, _ offset: Double,
    _ traffic: [Traffic]
) -> Double {
    let limit = usableHalfWidth(track, here)
    let path = plan.lateral[here] + offset
    let reach = BotDriver.passLookAhead + speed * BotDriver.passLookAheadTime
    let blockerIndex = traffic.indices
        .filter { traffic[$0].gap > 0 && traffic[$0].gap < reach && abs(traffic[$0].lateral - path) < traffic[$0].width }
        .filter { i in
            // What the bot would do there on its own: held up behind it, it is no faster any more.
            let free = plan.speed[indexAhead(track, here, traffic[i].gap)]
            return traffic[i].speed < max(speed, free) - BotDriver.passMargin
        }
        .min { traffic[$0].gap < traffic[$1].gap }
    let blocker = blockerIndex.map { traffic[$0] }
    /// Whether a car alongside takes the side `side` (+1 right, −1 left) of the bot.
    func taken(_ side: Double) -> Bool {
        traffic.indices.contains { i in
            let t = traffic[i]
            return i != blockerIndex && abs(t.gap) < BotDriver.alongside && jsSign(t.lateral - lateral) == side
                && abs(t.lateral - lateral) < t.width + 1
        }
    }
    let corner = brakingAhead(track, plan, here, speed)
    var wanted = 0.0
    // A car that is still (held in its pit box) is passed even into a braking zone: it won't move.
    if let blocker, !corner || blocker.speed < BotDriver.stuckSpeed {
        let preferred: Double = limit - blocker.lateral >= limit + blocker.lateral ? 1 : -1
        let side = !taken(preferred) ? preferred : !taken(-preferred) ? -preferred : 0
        wanted =
            side == 0
            ? offset : clamp(blocker.lateral + side * blocker.width, -limit, limit) - plan.lateral[here]
    } else if traffic.contains(where: { abs($0.gap) < BotDriver.alongside && abs($0.lateral - lateral) < $0.width }) {
        wanted = offset  // side by side: hold the line it has until clear
    }
    let step = BotDriver.passRate / Double(tickRate)
    return offset + clamp(wanted - offset, -step, step)
}

/// The speed the bot may carry with `traffic` around (following, giving way into a braking zone).
private func trafficSpeed(
    _ track: Track, _ plan: BotPlan, _ here: Int, _ lateral: Double, _ offset: Double, _ traffic: [Traffic],
    _ corner: Bool
) -> Double {
    var allowed = Double.infinity
    for t in traffic where t.gap > 0 {
        // Side by side into a braking zone: the one behind gives way and tucks in.
        if corner && t.gap < BotDriver.alongside && t.speed > BotDriver.stuckSpeed {
            allowed = min(allowed, max(0, t.speed - BotDriver.yieldDrop))
            continue
        }
        let there = plan.lateral[indexAhead(track, here, t.gap)] + offset
        let inTheWay = abs(t.lateral - lateral) < t.width || abs(t.lateral - there) < t.width
        if !inTheWay { continue }
        let ahead = plan.speed[indexAhead(track, here, t.gap)]
        let theirs = max(0, min(t.speed, ahead))
        let room = t.gap - BotDriver.followGap - max(0, t.speed) * BotDriver.followTime
        allowed = min(
            allowed,
            room > 0
                ? (theirs * theirs + 2 * BotDriver.trafficDecel * room).squareRoot()
                // Close behind a car held in its box: creep on to steer round it.
                : max(t.width == BotDriver.parkedWidth ? BotDriver.creepSpeed : 0, theirs - 2))
    }
    return allowed
}

/// Sideways room a bot keeps to: its side of every car alongside.
private func sideRoom(_ lateral: Double, _ traffic: [Traffic]) -> (min: Double, max: Double) {
    var low = -Double.infinity
    var high = Double.infinity
    for t in traffic where abs(t.gap) < BotDriver.alongside {
        if lateral >= t.lateral { low = max(low, t.lateral + t.width) } else { high = min(high, t.lateral - t.width) }
    }
    return low <= high ? (low, high) : (-.infinity, .infinity)
}

/// The racing line's point at sample `index`, moved `offset` m sideways, in the bot's room, on the asphalt.
private func aimPoint(_ track: Track, _ plan: BotPlan, _ index: Int, _ offset: Double, _ room: (min: Double, max: Double))
    -> Vec2
{
    let free = room.min == -.infinity && room.max == .infinity
    if offset == 0 && free { return plan.line[index] }
    let sample = track.samples[index]
    let limit = free ? usableHalfWidth(track, index) : max(0, sample.halfWidth - BotDriver.squeezeEdgeMargin)
    let wanted = clamp(plan.lateral[index] + offset, room.min, room.max)
    return sample.position + sample.normal * clamp(wanted, -limit, limit)
}

private func usableHalfWidth(_ track: Track, _ index: Int) -> Double {
    max(0, track.samples[index].halfWidth - BotDriver.passEdgeMargin)
}

private func clamp(_ value: Double, _ low: Double, _ high: Double) -> Double { max(low, min(high, value)) }

/// Whether the bot's line slows down hard close ahead (a braking zone).
private func brakingAhead(_ track: Track, _ plan: BotPlan, _ here: Int, _ speed: Double) -> Bool {
    plan.speed[indexAhead(track, here, speed * BotDriver.passAbortTime)] < speed - BotDriver.passAbortDrop
}

/// Index of the centreline sample `metres` ahead of sample `index`, wrapping over the start line.
private func indexAhead(_ track: Track, _ index: Int, _ metres: Double) -> Int {
    let n = track.samples.count
    let steps = Int(jsRound((metres * Double(n)) / track.length))
    return wrapIndex(index + steps, n)
}
