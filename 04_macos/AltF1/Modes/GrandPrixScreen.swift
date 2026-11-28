import AltF1Core
import SwiftUI

/// Single player's Grand Prix on screen: the 3D view and, in Liquid Glass over it, the GP panel
/// (top left), the timing strip and the start lights (top), the minimap (bottom left), damage and
/// speed (bottom right), the results when the race is over.
struct GrandPrixScreen: View {
    let circuit: CircuitEntry
    let team: TeamId
    let weather: Weather
    let exit: () -> Void

    @State private var session: GrandPrixSession?
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
                    ResultsView(session: session, exit: exit)
                        .transition(.blurReplace)
                }
            } else {
                MenuBackdrop()
                VStack(spacing: 14) {
                    Text(failure ?? "Grand Prix of \(circuit.name)…")
                        .font(.system(size: 22, weight: .heavy).italic())
                    if failure == nil {
                        Text("Timing the bots' qualifying laps").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
                        ProgressView().controlSize(.small)
                    }
                }
                .padding(.horizontal, 40)
                .padding(.vertical, 28)
                .glassEffect(.regular, in: .rect(cornerRadius: 28))
            }
        }
        .animation(.smooth(duration: 0.35), value: session?.onResults)
        .task { await load() }
        .onDisappear { session?.keyboard.stop() }
    }

    private func overlay(_ session: GrandPrixSession) -> some View {
        TimelineView(.periodic(from: .now, by: 0.1)) { _ in
            let onTrack = session.current.car(GrandPrixSession.playerId)
            ZStack {
                VStack(spacing: 14) {
                    if onTrack != nil && !session.onResults { TimingStrip(hud: hud) }
                    if session.lights > 0 { StartLights(lit: session.lights).transition(.scale.combined(with: .opacity)) }
                    Spacer()
                }
                VStack(alignment: .leading, spacing: 12) {
                    if !session.onResults { GrandPrixPanel(content: GrandPrixText.content(session)) }
                    DebugOverlayView(overlay: debug)
                    Spacer()
                    Minimap(
                        session: session,
                        players: Dictionary(uniqueKeysWithValues: session.seats.map {
                            ($0.id, MapPlayer(name: $0.name, color: session.livery($0.id).color))
                        }))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing, spacing: 12) {
                    // Race control: the yellow flags (single player has no safety car).
                    let control = RaceControlContent.of(
                        session.info, ownId: session.playerId, delta: nil, tick: session.current.tick,
                        name: { id in session.seats.first { $0.id == id }?.name ?? id })
                    if !session.onResults && !control.isEmpty {
                        RaceControlBoard(content: control, notice: nil)
                            .transition(.move(edge: .trailing).combined(with: .opacity))
                    }
                    Spacer()
                    if let car = onTrack, let damage = car.damage {
                        DamagePanel(damage: damage, punctures: puncturedTyres(damage, car.tyres, .baseline))
                    }
                    if let car = onTrack, let tyres = car.tyres {
                        TyrePanel(
                            tyres: tyres,
                            stopLeft: pitStatus(session.track, car, session.current.tick)?.stopLeft)
                    }
                    HStack(alignment: .bottom) {
                        Spacer()
                        Text("WASD drive · Space brake · R reset · V camera · Z look back · Enter / 1–4: the GP · in the box 1 soft, 2 medium · Esc menu")
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
                        .glassEffect(.regular.tint(session.livery(GrandPrixSession.playerId).color.opacity(0.3)), in: .rect(cornerRadius: 22))
                    }
                }
            }
            .animation(.smooth(duration: 0.2), value: session.lights)
            .padding(20)
        }
    }

    private func load() async {
        do {
            async let made = GrandPrixSession.prepare(circuit: circuit, team: team, weather: weather)
            let assets = try await RaceAssets.load(
                night: CircuitLook.of(circuit.id)?.night ?? false, rain: Weather.offersRain(circuit.name))
            let session = try await made
            scenery = try await CircuitSceneryBuilder.build(session.track, circuitId: circuit.id)
            session.hud = hud
            session.keyboard.onAction = { [cameraRig, debug] action in
                switch action {
                case .toggleCamera: cameraRig.toggle()
                case .toggleDebug: debug.toggle()
                case .backToMenu: exit()
                case .confirm where session.onResults: session.nextResultsCard()
                default: session.handle(action)
                }
            }
            session.keyboard.start()
            #if DEBUG
                if DevOptions.firstPerson { cameraRig.toggle() }
                if DevOptions.telemetry { debug.toggle() }
                DevOptions.overlay = { size in
                    let content = ZStack {
                        overlay(session)
                        if session.onResults { ResultsView(session: session, exit: exit) }
                    }
                    let renderer = ImageRenderer(content: content.frame(width: size.width, height: size.height))
                    renderer.scale = 2
                    return renderer.cgImage
                }
                DevOptions.grandPrix = session
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
