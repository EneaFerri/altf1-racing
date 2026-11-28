import AltF1Core
import SwiftUI

/// An online race on screen (X.7c–d): the 3D view of the room as predicted and, over it in Liquid
/// Glass, the timing strip, the Grand Prix's panel and start lights, the minimap with everyone's
/// nickname, damage, tyres and speed, the results; Esc leaves the server.
struct OnlineScreen: View {
    let lobby: Lobby
    let mode: OnlineMode
    let circuit: CircuitEntry
    let exit: () -> Void

    @State private var session: OnlineSession?
    @State private var assets: RaceAssets?
    @State private var cameraRig = CameraRig()
    @State private var hud = TimingHud()
    @State private var debug = DebugOverlay(visible: false)
    @State private var failure: String?
    @State private var scenery: CircuitSceneryResult?

    var body: some View {
        ZStack {
            if let session, let assets {
                RaceViewport(session: session, assets: assets, cameraRig: cameraRig, hud: hud, debug: debug, scenery: scenery)
                    .ignoresSafeArea()
                overlay(session)
                if session.onResults {
                    Color.black.opacity(0.35).ignoresSafeArea()
                    OnlineResultsView(session: session, exit: exit)
                        .transition(.blurReplace)
                }
            } else {
                MenuBackdrop()
                VStack(spacing: 14) {
                    Text(failure ?? "\(circuit.name) · \(LobbyText.modeName(mode))…")
                        .font(.system(size: 22, weight: .heavy).italic())
                    if failure == nil { ProgressView().controlSize(.small) }
                }
                .padding(.horizontal, 40)
                .padding(.vertical, 28)
                .glassEffect(.regular, in: .rect(cornerRadius: 28))
            }
        }
        .animation(.smooth(duration: 0.35), value: session?.onResults)
        .task { await load() }
        .onDisappear { session?.stop() }
    }

    private func overlay(_ session: OnlineSession) -> some View {
        TimelineView(.periodic(from: .now, by: 0.1)) { _ in
            let onTrack = session.current.car(session.playerId)
            ZStack {
                VStack(spacing: 14) {
                    if onTrack != nil && !session.onResults { TimingStrip(hud: hud) }
                    if session.lights > 0 { StartLights(lit: session.lights).transition(.scale.combined(with: .opacity)) }
                    Spacer()
                }
                VStack(alignment: .leading, spacing: 12) {
                    if let panel = session.panel, !session.onResults {
                        GrandPrixPanel(content: panel)
                    } else if session.mode == .practice {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(circuit.name.uppercased()).font(.system(size: 15, weight: .heavy).italic())
                            Text("FREE PRACTICE · ONLINE").font(.system(size: 10, weight: .bold)).tracking(1.4)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .glassEffect(.regular, in: .rect(cornerRadius: 16))
                    }
                    DebugOverlayView(overlay: debug)
                    if debug.visible { network(session) }
                    Spacer()
                    Minimap(
                        session: session,
                        players: Dictionary(uniqueKeysWithValues: session.players.map {
                            ($0.id, MapPlayer(name: $0.nickname, color: Livery.online($0.livery).color))
                        }).merging([safetyCarId: MapPlayer(name: "Safety car", color: .orange)]) { a, _ in a })
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing, spacing: 12) {
                    if !session.onResults && (!session.raceControl.isEmpty || session.notice != nil) {
                        RaceControlBoard(
                            content: session.raceControl, notice: session.notice, noticeGreen: session.noticeGreen)
                            .transition(.move(edge: .trailing).combined(with: .opacity))
                    }
                    Spacer()
                    if let car = onTrack, let damage = car.damage {
                        DamagePanel(damage: damage, punctures: puncturedTyres(damage, car.tyres, .baseline))
                    }
                    if let car = onTrack, let tyres = car.tyres {
                        TyrePanel(tyres: tyres, stopLeft: pitStatus(session.track, car, session.current.tick)?.stopLeft)
                    }
                    HStack(alignment: .bottom) {
                        Spacer()
                        Text(keys)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .glassEffect(.regular, in: .capsule)
                        Spacer()
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text("\(session.speedKmh)")
                                .font(.system(size: 44, weight: .heavy, design: .rounded).monospacedDigit())
                            Text("km/h").font(.system(size: 13, weight: .bold)).foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 22)
                        .padding(.vertical, 8)
                        .glassEffect(.regular.tint(session.livery(session.playerId).color.opacity(0.3)), in: .rect(cornerRadius: 22))
                    }
                }
            }
            .animation(.smooth(duration: 0.2), value: session.lights)
            .padding(20)
        }
    }

    private var keys: String {
        mode == .grandPrix
            ? "WASD drive · Space brake · R reset · V camera · Z look back · Enter / 1–4: the GP · in the box 1 soft, 2 medium · Esc leave"
            : "WASD drive · Space brake · R reset · V camera · Z look back · F3 telemetry · Esc leave"
    }

    /// F3's network lines: round trip, how far ahead the prediction runs.
    private func network(_ session: OnlineSession) -> some View {
        Text("rtt \(session.rttMs.map { String(format: "%.0f ms", $0) } ?? "-")")
            .font(.system(size: 11, weight: .semibold).monospaced())
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .glassEffect(.regular, in: .rect(cornerRadius: 12))
    }

    private func load() async {
        do {
            let definition = try CircuitCatalog.definition(circuit.id)
            guard let playerId = lobby.playerId else { return exit() }
            let session = try OnlineSession(lobby: lobby, playerId: playerId, mode: mode, definition: definition)
            let assets = try await RaceAssets.load(
                night: CircuitLook.of(circuit.id)?.night ?? false, rain: Weather.offersRain(circuit.name))
            scenery = try await CircuitSceneryBuilder.build(session.track, circuitId: circuit.id)
            session.hud = hud
            session.keyboard.onAction = { [cameraRig, debug] action in
                switch action {
                case .toggleCamera: cameraRig.toggle()
                case .toggleDebug: debug.toggle()
                case .backToMenu: exit()
                case .confirm where session.onResults: session.playAgain()
                default: session.handle(action)
                }
            }
            session.keyboard.start()
            #if DEBUG
                DevOptions.overlay = { size in
                    let content = ZStack {
                        overlay(session)
                        if session.onResults { OnlineResultsView(session: session, exit: exit) }
                    }
                    let renderer = ImageRenderer(content: content.frame(width: size.width, height: size.height))
                    renderer.scale = 2
                    return renderer.cgImage
                }
            #endif
            self.session = session
            self.assets = assets
        } catch {
            failure = "Could not load \(circuit.name): \(error)"
        }
    }
}

/// An online Grand Prix's results (the web's podium and classification): the race as it ended;
/// Enter plays again on the same circuit, Esc leaves.
struct OnlineResultsView: View {
    let session: OnlineSession
    let exit: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text("GRAND PRIX · CLASSIFICATION · \(session.resultsLaps) LAPS")
                .font(.system(size: 13, weight: .heavy)).tracking(1.6).foregroundStyle(.secondary)
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 6) {
                ForEach(Array(session.results.enumerated()), id: \.offset) { i, standing in
                    GridRow {
                        Text(standing.status == .dnf ? "—" : "\(i + 1)").foregroundStyle(.secondary)
                        RoundedRectangle(cornerRadius: 2).fill(session.livery(standing.id).color).frame(width: 4, height: 16)
                        Text(standing.name).fontWeight(standing.id == session.playerId ? .heavy : .semibold)
                        Text(GrandPrixText.raceNote(standing, i, session.resultsLaps)).monospacedDigit()
                            .gridColumnAlignment(.trailing)
                    }
                    .font(.system(size: 14))
                }
            }
            HStack(spacing: 12) {
                Button("Play again") { session.playAgain() }
                    .buttonStyle(.glassProminent)
                    .tint(.altF1Red)
                Button("Exit") { exit() }
                    .buttonStyle(.glass)
            }
            .controlSize(.large)
            Text("Enter: play again · Esc: leave").font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary)
        }
        .padding(28)
        .glassEffect(.regular, in: .rect(cornerRadius: 32))
    }
}
