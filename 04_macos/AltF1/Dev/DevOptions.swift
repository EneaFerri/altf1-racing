#if DEBUG
    import AltF1Core
    import AppKit
    import RealityKit

    /// Debug builds only: start straight into a race, drive it by itself and save snapshots of the
    /// 3D view, to check the look without a person at the keys (01_docs/macos.md#dev-options).
    ///
    /// - `ALTF1_START=<circuit id>`: open that circuit's Test session at launch (e.g. `monza`).
    /// - `ALTF1_MODE=timeTrial` or `grandPrix`: that mode instead of Test; for the Grand Prix
    ///   `ALTF1_TEAM=<team id>` and `ALTF1_WEATHER=rain`, and `ALTF1_GP=<frame>:<key>,…` presses its
    ///   keys at those frames (`confirm`, `start<laps>`).
    /// - `ALTF1_AUTOPILOT=1`: a simple driver follows the centreline.
    /// - `ALTF1_CAMERA=pov`: start in first person; `orbit:<deg>:<m>:<m>`: look at the car from that
    ///   angle round it (0 = from behind, 90 = its right side), distance and height.
    /// - `ALTF1_SNAPSHOTS=120,900`: save the view at those frames to the app's temporary folder.
    /// - `ALTF1_QUIT=1`: quit after the last snapshot.
    /// - `ALTF1_ONLINE=<address>,<nickname>,<practice|grandPrix>,<circuit name>`: join that server
    ///   and enter that room at launch (online, X.7).
    /// - `ALTF1_DAMAGE=<fw>,<rw>,<fl>,<fr>,<rl>,<rr>`: every car drawn with that damage (0…1), from
    ///   frame `ALTF1_DAMAGE_AT` on (default 0; later, the parts that break off fly away).
    ///
    /// A snapshot is the 3D view with the HUD drawn over it by `ImageRenderer` (`overlay`): the
    /// layout and the numbers are true, the glass is drawn flatter than on screen.
    @MainActor
    enum DevOptions {
        private static let env = ProcessInfo.processInfo.environment

        /// The HUD of the race on screen, drawn at a size (set by `RaceScreen`).
        static var overlay: ((CGSize) -> CGImage?)?

        static var startCircuit: String? { env["ALTF1_START"] }
        static var mode: SinglePlayerMode { SinglePlayerMode.allCases.first { "\($0)" == env["ALTF1_MODE"] } ?? .test }
        static var team: TeamId { env["ALTF1_TEAM"].flatMap(TeamId.init) ?? .ferrari }
        static var weather: Weather { env["ALTF1_WEATHER"] == "rain" ? .rain : .dry }
        /// The Grand Prix on screen, for `ALTF1_GP`'s keys.
        static weak var grandPrix: GrandPrixSession?

        /// `ALTF1_GP`'s keys due at `frame`.
        static func pressKeys(frame: Int) {
            guard let session = grandPrix else { return }
            for entry in (env["ALTF1_GP"] ?? "").split(separator: ",") {
                let parts = entry.split(separator: ":")
                guard parts.count == 2, Int(parts[0]) == frame else { continue }
                // Through the race's own key handling, as if pressed (the results card too).
                if parts[1] == "confirm" { session.keyboard.onAction(.confirm) }
                if parts[1].hasPrefix("start"), let laps = Int(parts[1].dropFirst(5)) {
                    session.command(.startRace(laps: laps))
                }
            }
        }
        /// `ALTF1_DAMAGE`'s look, once `ALTF1_DAMAGE_AT` is reached; nil otherwise.
        static func damage(frame: Int) -> CarDamage? {
            let values = (env["ALTF1_DAMAGE"] ?? "").split(separator: ",").compactMap { Double($0) }
            guard values.count == 6, frame >= Int(env["ALTF1_DAMAGE_AT"] ?? "0") ?? 0 else { return nil }
            var damage = CarDamage.none
            damage.frontWing = values[0]
            damage.rearWing = values[1]
            damage.tyres = Array(values[2...])
            return damage
        }
        /// `ALTF1_ONLINE`'s server address, nickname, mode and circuit name.
        static var online: (address: String, nickname: String, mode: OnlineMode, track: String)? {
            let parts = (env["ALTF1_ONLINE"] ?? "").split(separator: ",").map(String.init)
            guard parts.count == 4, let mode = OnlineMode(rawValue: parts[2]) else { return nil }
            return (parts[0], parts[1], mode, parts[3])
        }
        static var autopilot: Bool { env["ALTF1_AUTOPILOT"] == "1" }
        static var firstPerson: Bool { env["ALTF1_CAMERA"] == "pov" }
        /// `ALTF1_TELEMETRY=1`: the F3 telemetry open from the start.
        static var telemetry: Bool { env["ALTF1_TELEMETRY"] == "1" }
        static var orbit: (angle: Double, distance: Double, height: Double)? {
            let parts = (env["ALTF1_CAMERA"] ?? "").split(separator: ":")
            guard parts.count == 4, parts[0] == "orbit",
                let a = Double(parts[1]), let d = Double(parts[2]), let h = Double(parts[3])
            else { return nil }
            return (a * .pi / 180, d, h)
        }
        private static var snapshots: [Int] {
            (env["ALTF1_SNAPSHOTS"] ?? "").split(separator: ",").compactMap { Int($0) }
        }

        /// Steers for a point 12 m ahead on the centreline, at a speed the bends allow.
        static func drive(_ car: CarState, _ track: Track) -> InputCommand {
            let loc = locateOnTrack(track, car.position)
            let road = roadOf(track, loc.route)
            let n = road.samples.count
            let ahead = road.samples[(loc.index + 6) % n]
            let error = wrapAngle((ahead.position - car.position).heading - car.heading)
            var bend = 0.0
            for k in 0..<50 { bend = max(bend, abs(road.samples[(loc.index + k) % n].curvature)) }
            let wanted = min(85, (24 / max(bend, 1e-4)).squareRoot())
            let speed = car.velocity.dot(.forward(car.heading))
            return InputCommand(
                throttle: speed < wanted ? 1 : 0, brake: speed > wanted + 3 ? 1 : 0,
                steer: max(-1, min(1, -error * 2.5)))
        }

        /// The scene with the HUD over it, as PNG data.
        private static func composite(_ scene: CGImage, _ hud: CGImage?) -> Data? {
            let rect = CGRect(x: 0, y: 0, width: scene.width, height: scene.height)
            guard let context = CGContext(
                    data: nil, width: scene.width, height: scene.height, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return nil }
            context.draw(scene, in: rect)
            if let hud { context.draw(hud, in: rect) }
            guard let image = context.makeImage() else { return nil }
            return NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
        }

        static func snapshotIfDue(_ view: ARView, frame: Int) {
            let due = snapshots
            guard due.contains(frame) else { return }
            let last = frame == due.max()
            let hud = overlay?(view.bounds.size)
            view.snapshot(saveToHDR: false) { image in
                guard let image, let scene = image.cgImage(forProposedRect: nil, context: nil, hints: nil),
                    let png = composite(scene, hud)
                else { return }
                let url = FileManager.default.temporaryDirectory.appendingPathComponent("altf1-\(frame).png")
                try? png.write(to: url)
                print("snapshot: \(url.path)")
                if last && env["ALTF1_QUIT"] == "1" { NSApp.terminate(nil) }
            }
        }
    }
#endif
