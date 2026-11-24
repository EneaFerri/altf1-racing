import AltF1Core
import Foundation
import SwiftUI

/// Times and colours as the web's HUD shows them (`view/hud/format.ts`).
enum Format {
    private static func milliseconds(_ ticks: Int) -> Int {
        Int(jsRound(Double(ticks) * 1000 / Double(tickRate)))
    }

    /// `1:23.456`, or `23.456` under a minute; `decimals` 1 gives the running `1:23.4`.
    static func lapTime(_ ticks: Int, decimals: Int = 3) -> String {
        let ms = milliseconds(ticks)
        let minutes = ms / 60000
        let seconds = Double(ms % 60000) / 1000
        let text =
            decimals == 3
            ? String(format: "%.3f", seconds) : String(format: "%.1f", (seconds * 10).rounded(.down) / 10)
        guard minutes > 0 else { return text }
        let padded = String(repeating: "0", count: max(0, decimals + 3 - text.count)) + text
        return "\(minutes):\(padded)"
    }

    /// Signed gap in seconds: `+0.214` slower, `−0.120` faster (a true minus sign).
    static func delta(_ ticks: Int) -> String {
        let seconds = Double(milliseconds(abs(ticks))) / 1000
        return "\(ticks < 0 ? "−" : "+")\(String(format: "%.3f", seconds))"
    }

    /// Slipstream factor 0..1 as a whole percentage.
    static func slipstreamPercent(_ factor: Double) -> Int {
        Int(jsRound(min(1, max(0, factor)) * 100))
    }

    /// `OUT LAP` before the first crossing of the line, then `LAP n`.
    static func lapName(_ timing: LapState) -> String {
        timing.lapStartTick == nil ? "OUT LAP" : "LAP \(timing.laps + 1)"
    }

    /// A lap's length for the menus: `5.45 km`.
    static func length(_ metres: Double) -> String {
        String(format: "%.2f km", metres / 1000)
    }
}

/// Colour of a sector time, F1 style (and the void one of an invalid lap).
enum SectorShade: Equatable {
    case purple, green, yellow, invalid

    /// purple = best ever for this sector (or the first time), green = faster than the same sector
    /// of the best lap, yellow = slower. `best` and `bestLapSector`: the values before this sector.
    static func of(_ ticks: Int, best: Int?, bestLapSector: Int?) -> SectorShade {
        if best == nil || ticks < best! { return .purple }
        if let bestLapSector, ticks < bestLapSector { return .green }
        return .yellow
    }

    /// A Grand Prix's colour of a sector just driven: purple = the session's best of every driver
    /// (or nobody has one yet), green = the driver's own best, yellow = slower.
    static func gp(_ ticks: Int, personalBefore: Int?, sessionBest: Int?) -> SectorShade {
        if sessionBest == nil || ticks <= sessionBest! { return .purple }
        if personalBefore == nil || ticks < personalBefore! { return .green }
        return .yellow
    }

    /// A Grand Prix's colour of a driver's own best sector: purple if it is the session's best too.
    static func gpBest(_ best: Int, sessionBest: Int?) -> SectorShade {
        sessionBest == nil || best <= sessionBest! ? .purple : .green
    }

    var color: Color {
        switch self {
        case .purple: Color(red: 0.84, green: 0.23, blue: 0.98)
        case .green: Color(red: 0.18, green: 0.82, blue: 0.35)
        case .yellow: Color(red: 0.96, green: 0.77, blue: 0.09)
        case .invalid: Color(white: 0.45)
        }
    }
}
