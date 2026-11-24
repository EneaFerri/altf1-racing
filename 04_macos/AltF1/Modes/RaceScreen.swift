import AltF1Core
import Foundation
import SwiftUI

/// A single-player session on screen: the 3D view and, over it in Liquid Glass, the timing strip
/// (top centre), the circuit and the telemetry (top left), the minimap (bottom left), the keys and
/// the speed (bottom).
struct RaceScreen: View {
    let circuit: CircuitEntry
    let mode: SinglePlayerMode
    let exit: () -> Void

    @State private var session: DriveSession?
    @State private var assets: RaceAssets?
    @State private var cameraRig = CameraRig()
    @State private var hud = TimingHud()
    @State private var debug: DebugOverlay
    @State private var failure: String?
    @State private var scenery: CircuitSceneryResult?

    init(circuit: CircuitEntry, mode: SinglePlayerMode, exit: @escaping () -> Void) {
        self.circuit = circuit
        self.mode = mode
        self.exit = exit
        // Test opens with the telemetry, as on the web.
        _debug = State(initialValue: DebugOverlay(visible: mode == .test))
    }

    var body: some View {
        ZStack {
            if let session, let assets {
                RaceViewport(session: session, assets: assets, cameraRig: cameraRig, hud: hud, debug: debug, scenery: scenery)
                    .ignoresSafeArea()
                overlay(session)
            } else {
                MenuBackdrop()
                loading
            }
        }
        .task { await load() }
        .onDisappear { session?.keyboard.stop() }
    }

    private var loading: some View {
        VStack(spacing: 14) {
            Text(failure ?? "Loading \(circuit.name)…")
                .font(.system(size: 22, weight: .heavy).italic())
            if failure == nil { ProgressView().controlSize(.small) }
        }
        .padding(.horizontal, 40)
        .padding(.vertical, 28)
        .glassEffect(.regular, in: .rect(cornerRadius: 28))
    }

    private func overlay(_ session: DriveSession) -> some View {
        ZStack {
            VStack {
                TimingStrip(hud: hud)
                Spacer()
            }
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(circuit.name.uppercased())
                        .font(.system(size: 15, weight: .heavy).italic())
                    Text(mode.rawValue.uppercased())
                        .font(.system(size: 10, weight: .bold))
                        .tracking(1.4)
                        .foregroundStyle(.secondary)
                    if mode == .test {
                        // The bot's level (B cycles it); its own times are never shown.
                        HStack(spacing: 5) {
                            Circle().fill(Livery.blue.color).frame(width: 7, height: 7)
                            Text("BOT \(session.botLevel?.rawValue.uppercased() ?? "OFF")")
                                .font(.system(size: 10, weight: .heavy))
                                .tracking(1)
                                .foregroundStyle(session.botLevel == nil ? .secondary : .primary)
                        }
                        .padding(.top, 4)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .glassEffect(.regular, in: .rect(cornerRadius: 16))
                DebugOverlayView(overlay: debug)
                Spacer()
                Minimap(
                    session: session,
                    players: [
                        DriveSession.playerId: MapPlayer(name: "You", color: Livery.red.color),
                        DriveSession.botId: MapPlayer(name: "Bot", color: Livery.blue.color),
                    ])
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack {
                Spacer()
                HStack(alignment: .bottom) {
                    Spacer()
                    Text(keys)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .glassEffect(.regular, in: .capsule)
                    Spacer()
                    speed(session)
                }
            }
        }
        .padding(20)
    }

    private var keys: String {
        let bot = mode == .test ? " · B bot" : ""
        return "WASD drive · Space brake · R reset · V camera · Z look back\(bot) · F3 telemetry · Esc menu"
    }

    private func speed(_ session: DriveSession) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("\(session.speedKmh)")
                .font(.system(size: 44, weight: .heavy, design: .rounded).monospacedDigit())
                .contentTransition(.numericText())
            Text("km/h")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 8)
        .glassEffect(.regular.tint(.altF1Red.opacity(0.25)), in: .rect(cornerRadius: 22))
    }

    private func load() async {
        do {
            let session = try DriveSession(circuit: circuit, mode: mode)
            let assets = try await RaceAssets.load(night: CircuitLook.of(circuit.id)?.night ?? false)
            scenery = try await CircuitSceneryBuilder.build(session.track, circuitId: circuit.id)
            session.keyboard.onAction = { [cameraRig, debug] action in
                switch action {
                case .toggleCamera: cameraRig.toggle()
                case .toggleDebug: debug.toggle()
                case .cycleBot: session.cycleBot()
                case .backToMenu: exit()
                case .confirm, .choice, .lapsDown, .lapsUp: break  // the Grand Prix's keys
                }
            }
            session.keyboard.start()
            #if DEBUG
                if DevOptions.firstPerson { cameraRig.toggle() }
                DevOptions.overlay = { size in
                    let renderer = ImageRenderer(content: overlay(session).frame(width: size.width, height: size.height))
                    renderer.scale = 2
                    return renderer.cgImage
                }
            #endif
            self.session = session
            self.assets = assets
        } catch {
            failure = "Could not load \(circuit.name): \(error)"
            #if DEBUG
                print("load failed: \(error)")
            #endif
        }
    }
}
