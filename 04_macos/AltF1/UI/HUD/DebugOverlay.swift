import AltF1Core
import Foundation
import Observation
import SwiftUI

/// The developer overlay (F3, the web's `DebugOverlay.ts`): tick, measured TPS/FPS, the input and
/// the car's telemetry. Open from the start in Test.
@MainActor
@Observable
final class DebugOverlay {
    /// How often FPS/TPS are measured and the text refreshed (s).
    private static let refresh = 0.25

    var visible: Bool
    private(set) var text = ""

    @ObservationIgnored private var frames = 0
    @ObservationIgnored private var windowStart = 0.0
    @ObservationIgnored private var windowStartTick = 0
    @ObservationIgnored private var fps = 0.0
    @ObservationIgnored private var tps = 0.0
    /// Last impact of the inspected car and the tick it happened on.
    @ObservationIgnored private var lastImpact: (event: ImpactEvent, tick: Int)?

    private static let surfaceLabel: [Surface: String] = [
        .asphalt: "asp", .kerb: "krb", .highKerb: "HKB", .grass: "GRS", .gravel: "GRV",
    ]

    init(visible: Bool) { self.visible = visible }

    private static func number(_ value: Double) -> String { String(format: "%.2f", value) }

    func toggle() { visible.toggle() }

    /// Call once per rendered frame with the car to inspect (the player's).
    func update(_ state: GameState, car: CarState, input: InputCommand, now: Double) {
        frames += 1
        if let impact = state.impacts.first(where: { $0.carId == car.id }) { lastImpact = (impact, state.tick) }
        let elapsed = now - windowStart
        guard elapsed >= Self.refresh else { return }
        fps = Double(frames) / elapsed
        tps = Double(state.tick - windowStartTick) / elapsed
        frames = 0
        windowStart = now
        windowStartTick = state.tick
        guard visible else { return }
        let vF = car.velocity.dot(.forward(car.heading))
        let vL = car.velocity.dot(.right(car.heading))
        let impact = lastImpact.map { "\($0.event.other) \(String(format: "%.1f", $0.event.strength)) m/s, \(state.tick - $0.tick) ticks ago" } ?? "-"
        text = [
            "tick      \(state.tick)",
            "tps       \(String(format: "%.1f", tps))",
            "fps       \(String(format: "%.0f", fps))",
            "input     throttle \(Self.number(input.throttle))  brake \(Self.number(input.brake))  reverse \(Self.number(input.reverse))  steer \(Self.number(input.steer))",
            "",
            "speed     \(String(format: "%.0f", car.velocity.length * 3.6)) km/h",
            "vF / vL   \(String(format: "%.1f", vF)) / \(String(format: "%.1f", vL)) m/s",
            "heading   \(String(format: "%.0f", car.heading * 180 / .pi))°",
            "steer     \(String(format: "%.2f", car.steer)) (smoothed)",
            "pressure  \(String(format: "%.0f", car.brakePressure * 100))%",
            "slip      \(String(format: "%.0f", slipAngle(car) * 180 / .pi))°",
            "tow       \(Format.slipstreamPercent(car.slipstream))% (slipstream)",
            "spin      \(String(format: "%.2f", car.spin)) rad/s",
            "wheels    \(car.wheelSurfaces.map { Self.surfaceLabel[$0]! }.joined(separator: " "))  (FL FR RL RR)",
            "impact    \(impact)",
        ].joined(separator: "\n")
    }
}

struct DebugOverlayView: View {
    let overlay: DebugOverlay

    var body: some View {
        if overlay.visible && !overlay.text.isEmpty {
            Text(overlay.text)
                .font(.system(size: 11, design: .monospaced))
                .padding(12)
                .glassEffect(.regular, in: .rect(cornerRadius: 16))
                .allowsHitTesting(false)
        }
    }
}
