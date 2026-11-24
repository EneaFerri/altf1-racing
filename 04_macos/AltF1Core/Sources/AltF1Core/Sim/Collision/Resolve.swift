/// Collision pass, run once per tick after every car has moved (`sim/collision/resolve.ts`). Each
/// solver pass resolves all car pairs (in id order) and then the walls. Returns the strongest
/// impact per car and per thing it hit, in the order first met. `before`: the cars at the start of
/// the tick, in the same order.
public func resolveCollisions(
    _ cars: [CarState], _ walls: some WallSet, _ p: CollisionParams, _ before: [CarState]? = nil
) -> (cars: [CarState], impacts: [ImpactEvent]) {
    var result = cars
    var impacts: [ImpactEvent] = []
    var slot: [String: Int] = [:]
    func record(_ impact: ImpactEvent) {
        let key = "\(impact.carId)|\(impact.other)"
        if let index = slot[key] {
            if impact.strength > impacts[index].strength { impacts[index] = impact }
        } else {
            slot[key] = impacts.count
            impacts.append(impact)
        }
    }
    let passes = max(1, Int(jsRound(p.solverIterations)))
    for _ in 0..<passes {
        for i in 0..<result.count {
            for k in (i + 1)..<max(i + 1, result.count) {
                let pair = resolveCarPair(result[i], result[k], p)
                result[i] = pair.a
                result[k] = pair.b
                pair.impacts.forEach(record)
            }
        }
        for i in 0..<result.count {
            let resolved = resolveWalls(result[i], walls, p, before?[i])
            result[i] = resolved.car
            if let impact = resolved.impact { record(impact) }
        }
    }
    return (result, impacts)
}
