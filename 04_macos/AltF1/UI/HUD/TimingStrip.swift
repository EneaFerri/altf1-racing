import AltF1Core
import SwiftUI

/// The timing strip, top centre, in Liquid Glass: lap, running time, sector bars, last and best,
/// slipstream; the chip with the sector's gap under it.
struct TimingStrip: View {
    let hud: TimingHud

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 14) {
                Text(hud.lapName)
                    .font(.system(size: 12, weight: .heavy))
                    .tracking(1.2)
                    .foregroundStyle(.secondary)
                Text(hud.time)
                    .font(.system(size: 22, weight: .heavy, design: .rounded).monospacedDigit())
                    .foregroundStyle(hud.valid ? .primary : .secondary)
                if !hud.valid {
                    Text("INVALID")
                        .font(.system(size: 10, weight: .black))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(Color.altF1Red, in: .capsule)
                }
                if hud.table == nil {
                HStack(spacing: 3) {
                    ForEach(Array(hud.bars.enumerated()), id: \.offset) { _, shade in
                        Capsule()
                            .fill(shade?.color ?? Color.white.opacity(0.18))
                            .frame(width: 30, height: 6)
                    }
                }
                }
                label("LAST")
                Text(hud.last)
                    .font(.system(size: 14, weight: .semibold).monospacedDigit())
                    .strikethrough(hud.lastStruck)
                label("BEST")
                Text(hud.best)
                    .font(.system(size: 14, weight: .semibold).monospacedDigit())
                slipstream
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .glassEffect(.regular, in: .capsule)

            if let table = hud.table { sectorTable(table) }

            if let chip = hud.chip {
                Text(chip.text)
                    .font(.system(size: 14, weight: .bold).monospacedDigit())
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .glassEffect(.regular.tint(chip.shade.color.opacity(0.55)), in: .capsule)
                    .transition(.blurReplace)
            }
        }
        .animation(.smooth(duration: 0.25), value: hud.chip)
    }

    /// The Grand Prix's sector table: this lap's sectors and the own bests, in F1's colours.
    private func sectorTable(_ table: TimingHud.SectorTable) -> some View {
        Grid(horizontalSpacing: 10, verticalSpacing: 4) {
            GridRow {
                Text("")
                ForEach(0..<table.lap.count, id: \.self) { i in label("S\(i + 1)") }
            }
            row("LAP", table.lap)
            row("BEST", table.best)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .glassEffect(.regular, in: .rect(cornerRadius: 16))
    }

    private func row(_ name: String, _ cells: [TimingHud.Cell]) -> some View {
        GridRow {
            label(name)
            ForEach(Array(cells.enumerated()), id: \.offset) { _, cell in
                Text(cell.ticks.map { Format.lapTime($0) } ?? "--")
                    .font(.system(size: 12, weight: .bold).monospacedDigit())
                    .foregroundStyle(cell.shade?.color ?? .secondary)
                    .frame(width: 62)
            }
        }
    }

    private var slipstream: some View {
        HStack(spacing: 6) {
            label("SLIP")
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.15))
                Capsule()
                    .fill(Color(red: 0.56, green: 0.89, blue: 1))
                    .frame(width: 40 * CGFloat(hud.slip) / 100)
            }
            .frame(width: 40, height: 5)
            Text("\(hud.slip)%")
                .font(.system(size: 11, weight: .semibold).monospacedDigit())
                .foregroundStyle(hud.slip > 0 ? .primary : .secondary)
                .frame(width: 34, alignment: .leading)
        }
    }

    private func label(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .bold))
            .tracking(1)
            .foregroundStyle(.secondary)
    }
}
