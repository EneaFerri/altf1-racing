import AltF1Core
import SwiftUI

/// Multiplayer's first screen (the web's `NicknameScreen`): the server's address and the nickname,
/// with a live hint; Enter joins, Esc goes back. Both fields are remembered for next time.
struct NicknameView: View {
    let lobby: Lobby
    let joined: () -> Void
    let back: () -> Void

    @AppStorage("altf1.online.address") private var address = ""
    @AppStorage("altf1.online.nickname") private var nickname = ""
    @State private var problem: String?
    @State private var connecting = false
    @FocusState private var focus: Field?

    private enum Field { case address, nickname }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            MenuHeader(label: "MULTIPLAYER · NICKNAME")

            VStack(alignment: .leading, spacing: 10) {
                field("Server: this Mac — or the host's Tailscale IP", text: $address, focus: .address)
                field("Your nickname", text: $nickname, focus: .nickname)
                Text(hint.text)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(hint.error ? AnyShapeStyle(Color.altF1Red) : AnyShapeStyle(.secondary))
                    .padding(.horizontal, 6)
            }

            Text("Enter: join — Esc: back")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 6)
        }
        .frame(width: 440)
        .padding(28)
        .glassEffect(.regular, in: .rect(cornerRadius: 32))
        .onKeyDown { code in
            guard code == KeyCode.escape else { return false }
            back()
            return true
        }
        .onAppear { focus = .nickname }
        .onChange(of: nickname) { problem = nil }
        .onChange(of: address) { problem = nil }
    }

    private func field(_ prompt: String, text: Binding<String>, focus field: Field) -> some View {
        TextField(prompt, text: text)
            .textFieldStyle(.plain)
            .font(.system(size: 17, weight: .semibold))
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .glassEffect(
                focus == field ? .regular.tint(.altF1Red.opacity(0.35)).interactive() : .regular.interactive(),
                in: .rect(cornerRadius: 18)
            )
            .focused($focus, equals: field)
            .disabled(connecting)
            .onSubmit(join)
    }

    /// The line under the fields: the server's answer, connecting, else the nickname's rules.
    private var hint: (text: String, error: Bool) {
        if let problem { return (problem, true) }
        if connecting { return ("Connecting…", false) }
        if nickname.isEmpty { return ("Unique among the players online", false) }
        if case .failure(let reason) = Nickname.check(nickname) {
            return (LobbyText.nicknameProblem(reason), true)
        }
        return ("Unique among the players online", false)
    }

    private func join() {
        guard !connecting else { return }
        if case .failure(let reason) = Nickname.check(nickname) {
            problem = LobbyText.nicknameProblem(reason)
            focus = .nickname
            return
        }
        connecting = true
        Task {
            let result = await lobby.join(address: address, nickname: nickname)
            connecting = false
            if let result {
                problem = LobbyText.problem(result)
            } else {
                joined()
            }
        }
    }
}
