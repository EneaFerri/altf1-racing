import AltF1Core
import SwiftUI

/// What race control tells a driver now (the web's `race/raceControlText.ts`, R.3): the safety
/// car's phase, the rule, the player's delta, an overtake to give back. Empty: hidden.
struct RaceControlContent: Equatable {
    /// The yellow flags out (R.2): `YELLOW FLAG · SECTOR 2 · SLOW DOWN, NO OVERTAKING`.
    var flag: String?
    var title: String?
    var rule: String?
    /// `DELTA +1.2` (ok: slower than the reference) or `DELTA −0.4` (too fast).
    var delta: (text: String, ok: Bool)?
    /// Beating the delta: `BACK ABOVE YOUR DELTA · 4 s`, the seconds left before the penalty.
    var deltaWarning: String?
    var giveBack: String?

    static let none = RaceControlContent()

    var isEmpty: Bool { flag == nil && title == nil && giveBack == nil }

    static func == (a: Self, b: Self) -> Bool {
        a.flag == b.flag && a.title == b.title && a.rule == b.rule && a.delta?.text == b.delta?.text && a.delta?.ok == b.delta?.ok
            && a.deltaWarning == b.deltaWarning && a.giveBack == b.giveBack
    }

    /// The board for player `ownId` at `tick` (`delta`: s, nil without one, only while the safety car
    /// waits for the leader; `graceLeft`: s left to get back above it, nil: not beating it; `name`: a
    /// driver's).
    static func of(
        _ info: GrandPrixInfo, ownId: CarId, delta: Double?, graceLeft: Double? = nil, tick: Int, name: (CarId) -> String
    ) -> Self {
        let sc = info.phase == .race ? info.safetyCar : nil
        let giveBack = info.giveBack.first { $0.attacker == ownId }.map { owed in
            let seconds = max(0, Int((Double(owed.until - tick) / Double(tickRate)).rounded(.up)))
            return "GIVE THE PLACE BACK TO \(name(owed.victim).uppercased()) · \(seconds) s"
        }
        let flag = yellowFlagText(info)
        guard let sc else { return RaceControlContent(flag: flag, giveBack: giveBack) }
        let released = sc.released.contains(ownId)
        let title =
            sc.phase == .restart ? "SAFETY CAR ENDING" : sc.inThisLap ? "SAFETY CAR IN THIS LAP" : "SAFETY CAR"
        let rule =
            switch sc.phase {
            case .restart: released ? "RACING · OVERTAKING ALLOWED" : "NO OVERTAKING UNTIL THE LINE"
            case .in: "NO OVERTAKING · SAFETY CAR GOING IN"
            case .out: "NO OVERTAKING · CATCH UP THE QUEUE"
            case .deployed: "NO OVERTAKING · KEEP ABOVE YOUR DELTA"
            }
        // The delta only while it waits for the leader (owner, 2026-11-25).
        let delta = sc.phase == .deployed ? delta : nil
        let warning = delta != nil ? graceLeft.map { "BACK ABOVE YOUR DELTA · \(max(0, Int($0.rounded(.up)))) s" } : nil
        return RaceControlContent(
            flag: flag, title: title, rule: rule, delta: delta.map(Self.deltaText), deltaWarning: warning,
            giveBack: giveBack)
    }

    /// The yellow flags out in qualifying and the race (sectors 1-based); nil: none.
    static func yellowFlagText(_ info: GrandPrixInfo) -> String? {
        guard info.phase == .qualifying || info.phase == .race else { return nil }
        let sectors = yellowSectors(info.yellowFlags).map { $0 + 1 }
        guard let first = sectors.first else { return nil }
        let which = sectors.count == 1 ? "SECTOR \(first)" : "SECTORS \(sectors.map(String.init).joined(separator: " & "))"
        return "YELLOW FLAG · \(which) · SLOW DOWN, NO OVERTAKING"
    }

    static func deltaText(_ delta: Double) -> (text: String, ok: Bool) {
        let rounded = (delta * 10).rounded() / 10
        let sign = rounded >= 0 ? "+" : "−"
        return ("DELTA \(sign)\(String(format: "%.1f", abs(rounded)))", delta >= 0)
    }

    /// Race control's word when a safety car period ends, the leader across the line.
    static let greenFlagNotice = "GREEN FLAG · RACING · OVERTAKING ALLOWED"

    /// Whether the race went green between `before` and `now`: a safety car period just over.
    static func wentGreen(_ before: GrandPrixInfo?, _ now: GrandPrixInfo) -> Bool {
        before?.phase == .race && before?.safetyCar != nil && now.phase == .race && now.safetyCar == nil
    }

    /// A penalty as told to its driver.
    static func notice(_ incident: RaceIncident) -> String {
        let seconds = Int(SafetyCarParams.baseline.penalty)
        return incident.reason == .delta
            ? "\(seconds) s TIME PENALTY · SAFETY CAR DELTA NOT RESPECTED"
            : "\(seconds) s TIME PENALTY · OVERTAKING UNDER THE SAFETY CAR"
    }
}

/// Race control's board, top right (the web's `RaceControlBoard`): the yellow flags out (R.2), the
/// blinking yellow `SAFETY CAR`
/// title, the rule, the delta (green fine, red too fast; beating it, the seconds left to get back
/// above it), an overtake to give back, a penalty or
/// the green flag (`noticeGreen`).
struct RaceControlBoard: View {
    let content: RaceControlContent
    let notice: String?
    var noticeGreen = false

    private static let yellow = Color(red: 0.96, green: 0.77, blue: 0.09)

    var body: some View {
        VStack(spacing: 0) {
            if let flag = content.flag {
                HStack(spacing: 0) {
                    Rectangle().fill(.black).frame(width: 6)
                    Text(flag).font(.system(size: 9, weight: .heavy)).foregroundStyle(.black)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity).padding(.vertical, 4).padding(.horizontal, 4)
                }
                .background(Self.yellow)
            }
            if let title = content.title {
                TimelineView(.periodic(from: .now, by: 0.5)) { context in
                    let blink = Int(context.date.timeIntervalSinceReferenceDate * 2) % 2 == 1
                    Text(title)
                        .font(.system(size: 12, weight: .heavy)).tracking(1.2)
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                        .background(blink ? Color(red: 1, green: 0.85, blue: 0.3) : Self.yellow)
                }
            }
            if let rule = content.rule {
                Text(rule).font(.system(size: 9, weight: .heavy)).tracking(0.5).foregroundStyle(Self.yellow)
                    .multilineTextAlignment(.center).padding(.top, 4).padding(.horizontal, 6)
            }
            if let delta = content.delta {
                Text(delta.text)
                    .font(.system(size: 15, weight: .heavy, design: .rounded).monospacedDigit())
                    .foregroundStyle(delta.ok ? Color(red: 0.23, green: 0.82, blue: 0.48) : Color(red: 1, green: 0.23, blue: 0.19))
                    .padding(.vertical, 2)
            }
            if let warning = content.deltaWarning {
                Text(warning).font(.system(size: 9, weight: .heavy).monospacedDigit()).foregroundStyle(.white)
                    .multilineTextAlignment(.center).frame(maxWidth: .infinity).padding(4)
                    .background(Color.altF1Red)
            }
            if let giveBack = content.giveBack {
                Text(giveBack).font(.system(size: 9, weight: .heavy)).foregroundStyle(.black)
                    .multilineTextAlignment(.center).frame(maxWidth: .infinity).padding(4)
                    .background(Color(red: 1, green: 0.48, blue: 0.1))
            }
            if let notice {
                Text(notice).font(.system(size: 9, weight: .heavy)).foregroundStyle(.white)
                    .multilineTextAlignment(.center).frame(maxWidth: .infinity).padding(4)
                    .background(noticeGreen ? Color(red: 0.12, green: 0.62, blue: 0.29) : Color.altF1Red)
            }
        }
        .padding(.bottom, content.rule != nil && content.delta == nil ? 4 : 0)
        // Compact (owner, 2026-11-24): a small corner box, never half the screen.
        .frame(width: 200)
        .glassEffect(.regular.tint(.black.opacity(0.4)), in: .rect(cornerRadius: 10))
        .clipShape(.rect(cornerRadius: 10))
    }
}
