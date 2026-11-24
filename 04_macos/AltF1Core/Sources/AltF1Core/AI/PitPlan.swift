/// When a bot makes its mandatory stops in a race over `raceLaps` laps (`ai/pitPlan.ts`): stop `j`
/// is due once it has completed `floor(j · raceLaps / (stops + 1))` laps (at least 1).
public func pitSchedule(_ raceLaps: Int) -> [Int] {
    let stops = requiredStops(raceLaps)
    return (0..<stops).map { i in max(1, ((i + 1) * raceLaps) / (stops + 1)) }
}

/// Whether a bot that has completed `lapsDone` laps and made `stopsMade` stops still owes one now.
public func pitDue(_ schedule: [Int], lapsDone: Int, stopsMade: Int) -> Bool {
    stopsMade < schedule.filter { lapsDone >= $0 }.count
}

/// Whether a car at main-loop `progress` may switch between its race plan and its pit plan: only
/// outside the stretch the pit lane runs beside, with `margin` m either side.
public func canSwitchPlan(_ track: Track, _ progress: Double, margin: Double = 30) -> Bool {
    guard let branch = track.routes.first(where: \.pit)?.branch else { return true }
    func along(_ d: Double) -> Double {
        jsMod(jsMod(d - (branch.mainFrom - margin), branch.mainLength) + branch.mainLength, branch.mainLength)
    }
    return along(progress) > along(branch.mainTo + margin)
}
