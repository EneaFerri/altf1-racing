import SwiftUI

/// A lap-record board in the online track menu (the web's `RecordTable`): position, nickname, time,
/// date; the player's own row in the game's red.
struct RecordTableView: View {
    let title: String
    let rows: [LobbyText.RecordRow]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 11, weight: .bold).smallCaps())
                .tracking(1.4)
                .foregroundStyle(.secondary)
            if rows.isEmpty {
                Text(LobbyText.noRecords)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)
            } else {
                Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 3) {
                    ForEach(rows, id: \.self) { row in
                        GridRow {
                            Text(row.position).foregroundStyle(.secondary).gridColumnAlignment(.trailing)
                            Text(row.nickname).lineLimit(1)
                            Text(row.time).monospacedDigit().gridColumnAlignment(.trailing)
                            Text(row.date).foregroundStyle(.secondary)
                        }
                        .foregroundStyle(row.own ? AnyShapeStyle(Color.altF1Red) : AnyShapeStyle(.primary))
                    }
                }
                .font(.system(size: 13, weight: .semibold))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .glassEffect(.regular, in: .rect(cornerRadius: 18))
    }
}
