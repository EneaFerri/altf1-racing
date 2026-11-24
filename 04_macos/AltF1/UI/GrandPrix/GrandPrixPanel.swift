import AltF1Core
import SwiftUI

/// The Grand Prix panel, top left (the web's `GrandPrixPanel`): the phase, every driver in order
/// with their note (time, gap), PIT/BOX, stops made / required, the purple fastest lap; the hint.
struct GrandPrixPanel: View {
    let content: GrandPrixContent

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(content.title)
                .font(.system(size: 11, weight: .heavy))
                .tracking(1.3)
            VStack(alignment: .leading, spacing: 3) {
                ForEach(Array(content.rows.enumerated()), id: \.offset) { _, row in
                    HStack(spacing: 8) {
                        RoundedRectangle(cornerRadius: 2).fill(row.color).frame(width: 4, height: 15)
                        Text(row.name)
                            .font(.system(size: 12, weight: row.own ? .heavy : .semibold))
                            .lineLimit(1)
                        Spacer(minLength: 6)
                        if let pit = row.pit { badge(pit, .altF1Red) }
                        if row.fastest != nil {
                            // The session's fastest lap: a purple stopwatch, its time in purple.
                            Image(systemName: "stopwatch.fill")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(SectorShade.purple.color)
                        }
                        if let stops = row.stops {
                            Text(stops)
                                .font(.system(size: 10, weight: .bold).monospacedDigit())
                                .foregroundStyle(row.stopsShort ? SectorShade.yellow.color : .secondary)
                        }
                        Text(row.note)
                            .font(.system(size: 12, weight: .semibold).monospacedDigit())
                            .foregroundStyle(row.fastest != nil ? AnyShapeStyle(SectorShade.purple.color) : AnyShapeStyle(.secondary))
                            .lineLimit(1)
                            .frame(minWidth: 70, alignment: .trailing)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(row.own ? Color.white.opacity(0.14) : .clear, in: .rect(cornerRadius: 6))
                }
            }
            if !content.hint.isEmpty {
                Text(content.hint)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(width: 330, alignment: .leading)
        .padding(14)
        .glassEffect(.regular, in: .rect(cornerRadius: 22))
    }

    private func badge(_ text: String, _ color: Color) -> some View {
        Text(text)
            .font(.system(size: 9, weight: .black))
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(color, in: .capsule)
    }
}

/// The F1 start gantry (the web's `StartLights`): five red lights coming on one a second, all out
/// together at the start. Shown while any is lit.
struct StartLights: View {
    let lit: Int

    var body: some View {
        HStack(spacing: 14) {
            ForEach(0..<5, id: \.self) { i in
                Circle()
                    .fill(i < lit ? Color.red : Color.black.opacity(0.75))
                    .frame(width: 44, height: 44)
                    .shadow(color: i < lit ? .red.opacity(0.9) : .clear, radius: 14)
                    .overlay(Circle().stroke(Color.white.opacity(0.15), lineWidth: 1))
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
        .glassEffect(.regular.tint(.black.opacity(0.35)), in: .capsule)
    }
}

/// Damage (the web's `DamagePanel`): the car seen from above, front wing, four tyres and rear wing
/// coloured by their damage (white → yellow → orange → red). Shown only in a race with damage.
struct DamagePanel: View {
    let damage: [Double]  // front wing, FL, FR, RL, RR, rear wing

    var body: some View {
        VStack(spacing: 6) {
            Text("DAMAGE").font(.system(size: 9, weight: .heavy)).tracking(1.2).foregroundStyle(.secondary)
            VStack(spacing: 4) {
                part(damage[0]).frame(width: 46, height: 7)
                HStack(spacing: 18) { part(damage[1]).frame(width: 12, height: 20); part(damage[2]).frame(width: 12, height: 20) }
                RoundedRectangle(cornerRadius: 3).fill(Color.white.opacity(0.25)).frame(width: 14, height: 22)
                HStack(spacing: 18) { part(damage[3]).frame(width: 14, height: 22); part(damage[4]).frame(width: 14, height: 22) }
                part(damage[5]).frame(width: 40, height: 7)
            }
        }
        .padding(12)
        .glassEffect(.regular, in: .rect(cornerRadius: 18))
    }

    private func part(_ value: Double) -> some View {
        let color: Color =
            value < 0.1 ? .white : value < 0.4 ? Color(red: 0.96, green: 0.77, blue: 0.09)
            : value < 0.75 ? Color(red: 1, green: 0.5, blue: 0.05) : Color(red: 0.9, green: 0.05, blue: 0)
        return RoundedRectangle(cornerRadius: 3).fill(color)
    }
}

/// The own tyres (Grand Prix): the compound in its colour (soft red, medium yellow) and the wear;
/// stopped in the box, the stop's seconds and the choice of the next set (1 / 2).
struct TyrePanel: View {
    let tyres: TyreState
    /// Seconds left of the stop in the box; nil when not stopped.
    let stopLeft: Double?

    static func color(_ compound: TyreCompound) -> Color {
        switch compound {
        case .soft: Color(red: 0.88, green: 0.02, blue: 0)
        case .medium: Color(red: 0.96, green: 0.77, blue: 0.09)
        }
    }

    var body: some View {
        VStack(alignment: .trailing, spacing: 6) {
            HStack(spacing: 8) {
                Circle()
                    .strokeBorder(Self.color(tyres.compound), lineWidth: 4)
                    .frame(width: 20, height: 20)
                Text(tyres.compound == .soft ? "SOFT" : "MEDIUM").font(.system(size: 13, weight: .heavy))
                Text("\(Int((tyres.wear * 100).rounded()))%")
                    .font(.system(size: 13, weight: .bold).monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            if let stopLeft {
                Text(String(format: "PIT STOP %.1f", stopLeft))
                    .font(.system(size: 11, weight: .heavy).monospacedDigit())
                HStack(spacing: 10) {
                    choice("1", .soft)
                    choice("2", .medium)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .glassEffect(.regular, in: .rect(cornerRadius: 18))
        .animation(.smooth(duration: 0.2), value: stopLeft == nil)
    }

    private func choice(_ key: String, _ compound: TyreCompound) -> some View {
        HStack(spacing: 4) {
            Text(key).font(.system(size: 11, weight: .heavy)).foregroundStyle(.secondary)
            Text(compound == .soft ? "SOFT" : "MEDIUM")
                .font(.system(size: 11, weight: .heavy))
                .foregroundStyle(Self.color(compound))
        }
        .opacity(tyres.compound == compound ? 1 : 0.7)
    }
}
