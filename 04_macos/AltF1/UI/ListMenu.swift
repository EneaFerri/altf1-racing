import SwiftUI

/// One row of a `ListMenu`.
struct ListMenuItem<Value: Hashable>: Identifiable {
    let name: String
    let detail: String
    let value: Value
    /// Shown dimmed, never selected nor chosen (e.g. a mode still in the works).
    var disabled = false

    var id: Value { value }
}

/// Every list menu of the app (mode, track, …), as on the web (`view/menu/ListMenu.ts`): pick a
/// row with the mouse, or W/S (↑/↓) + Enter; Esc goes back where there is a `back`. Liquid Glass
/// rows over the backdrop; the selected one tinted in the game's red.
struct ListMenu<Value: Hashable>: View {
    let label: String
    let items: [ListMenuItem<Value>]
    let hint: String
    var back: (() -> Void)?
    /// Shown between the title and the rows (the online track menu's lap records).
    var content: AnyView?
    /// Called with the selected row's value whenever the selection changes, and at first.
    var onSelect: ((Value) -> Void)?
    let choose: (Value) -> Void

    @State private var selected: Int?
    @Namespace private var glass

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            MenuHeader(label: label)

            if let content { content }

            GlassEffectContainer(spacing: 10) {
                VStack(spacing: 10) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        row(item, selected: index == current)
                            .onHover { inside in
                                if inside && !item.disabled { selected = index }
                            }
                            .onTapGesture { confirm(index) }
                    }
                }
            }

            Text(hint)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 6)
        }
        .frame(width: 440)
        .padding(28)
        .glassEffect(.regular, in: .rect(cornerRadius: 32))
        .onKeyDown(handleKey)
        .onChange(of: current, initial: true) {
            if let onSelect, let current { onSelect(items[current].value) }
        }
    }

    /// The selected row: the one chosen by the player, else the first enabled.
    private var current: Int? {
        selected ?? items.firstIndex { !$0.disabled }
    }

    private func row(_ item: ListMenuItem<Value>, selected: Bool) -> some View {
        HStack(spacing: 24) {
            Text(item.name)
                .font(.system(size: 17, weight: .semibold))
            Spacer(minLength: 0)
            Text(item.detail)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .contentShape(.rect)
        .glassEffect(
            selected ? .regular.tint(.altF1Red.opacity(0.55)).interactive() : .regular.interactive(),
            in: .rect(cornerRadius: 18)
        )
        .glassEffectID(item.name, in: glass)
        .opacity(item.disabled ? 0.45 : 1)
        .animation(.smooth(duration: 0.2), value: selected)
    }

    private func handleKey(_ code: UInt16) -> Bool {
        if KeyCode.up.contains(code) {
            move(by: -1)
        } else if KeyCode.down.contains(code) {
            move(by: 1)
        } else if KeyCode.confirm.contains(code) {
            if let current { confirm(current) }
        } else if code == KeyCode.escape, let back {
            back()
        } else {
            return false
        }
        return true
    }

    /// Moves the selection to the next enabled row, wrapping round.
    private func move(by step: Int) {
        guard let start = current else { return }
        var index = start
        repeat {
            index = (index + step + items.count) % items.count
        } while items[index].disabled && index != start
        selected = index
    }

    private func confirm(_ index: Int) {
        guard !items[index].disabled else { return }
        choose(items[index].value)
    }
}

/// A menu card's title: the game's name over the screen's label.
struct MenuHeader: View {
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("AltF1 Racing")
                .font(.system(size: 40, weight: .heavy, design: .default).italic())
                .foregroundStyle(.primary)
            Text(label)
                .font(.system(size: 12, weight: .bold).smallCaps())
                .tracking(1.6)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 6)
    }
}

extension Color {
    /// The game's red (`--menu-red` on the web).
    static let altF1Red = Color(red: 0.882, green: 0.024, blue: 0)
}
