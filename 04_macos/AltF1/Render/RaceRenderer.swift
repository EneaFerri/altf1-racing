import AltF1Core
import AppKit
import Combine
import RealityKit
import SwiftUI

/// What the race scene needs ready before it is drawn: the materials and the sky (and, where it
/// may rain, the overcast one).
struct RaceAssets {
    let materials: RaceMaterials
    let sky: EnvironmentResource
    /// A rainy day's sky (2.8); nil where it never rains.
    var overcast: EnvironmentResource? = nil

    /// `night`: a night race's dark sky (Singapore); `rain`: the overcast sky too (São Paulo).
    static func load(night: Bool = false, rain: Bool = false) async throws -> RaceAssets {
        async let materials = RaceMaterials.load()
        let skyImage = await Task.detached { (night ? ProceduralTextures.nightSky() : ProceduralTextures.sky()).cgImage }.value
        let sky = try await environment(skyImage)
        var overcast: EnvironmentResource?
        if rain {
            let image = await Task.detached { ProceduralTextures.overcastSky().cgImage }.value
            overcast = try await environment(image)
        }
        return RaceAssets(materials: try await materials, sky: sky, overcast: overcast)
    }

    private static func environment(_ image: CGImage) async throws -> EnvironmentResource {
        if #available(macOS 27.0, *) {
            return try await EnvironmentResource(
                equirectangular: image, options: .init(samplingQuality: .high, specularCubeDimension: 512))
        }
        return try await EnvironmentResource(equirectangular: image)
    }
}

/// The 3D view of a race: RealityKit's `ARView` (non-AR on the Mac), in SwiftUI.
struct RaceViewport: NSViewRepresentable {
    let session: any RaceSession
    let assets: RaceAssets
    let cameraRig: CameraRig
    let hud: TimingHud
    let debug: DebugOverlay
    /// The circuit's surroundings, when it has them (X.5).
    let scenery: CircuitSceneryResult?

    func makeCoordinator() -> RaceRenderer {
        RaceRenderer(session: session, cameraRig: cameraRig, hud: hud, debug: debug)
    }

    func makeNSView(context: Context) -> ARView {
        let view = ARView(frame: .zero)
        context.coordinator.attach(to: view, assets: assets, scenery: scenery)
        return view
    }

    func updateNSView(_ view: ARView, context: Context) {}

    static func dismantleNSView(_ view: ARView, coordinator: RaceRenderer) {
        coordinator.detach()
    }
}

/// Builds the scene (track, car, ghost, sun, sky, camera) and draws every frame: advances the
/// session's loop, poses the cars and the camera between the last two ticks, feeds the HUD.
@MainActor
final class RaceRenderer {
    private let session: any RaceSession
    private let cameraRig: CameraRig
    private let anchor = AnchorEntity(world: .zero)
    /// One car entity per car on track, created when it first appears.
    private var cars: [CarId: CarEntity] = [:]
    /// Crashes' debris and the yellow flags' posts (a Grand Prix, R.2).
    private let trackDebris = TrackDebrisEntity()
    /// The safety car, while it is on the track (an online Grand Prix).
    private var safetyCar: SafetyCarEntity?
    /// Time trial's ghost, made the first time there is one to show.
    private var ghost: CarEntity?
    /// Pieces broken off the cars.
    private let debris = Debris()
    private let hud: TimingHud
    private let debug: DebugOverlay
    private let sun = DirectionalLight()
    private var update: (any Cancellable)?
    private weak var view: ARView?
    private var frames = 0
    /// A night race: the light comes from overhead (the floodlights), not from the sun.
    private var night = false
    /// The own pit box painted yellow, and which box it is (it follows `session.ownPitBox`).
    private var ownBoxMark: ModelEntity?
    private var markedBox: Int?
    /// The rain (2.8): only where it may rain.
    private var rain: RainEffects?
    /// The skies: clear and, where it may rain, overcast; which one is up.
    private var assets: RaceAssets?
    private var overcastShown = false

    init(session: any RaceSession, cameraRig: CameraRig, hud: TimingHud, debug: DebugOverlay) {
        self.session = session
        self.cameraRig = cameraRig
        self.hud = hud
        self.debug = debug
    }

    func attach(to view: ARView, assets: RaceAssets, scenery: CircuitSceneryResult?) {
        self.view = view
        self.assets = assets
        view.environment.background = .skybox(assets.sky)
        view.environment.lighting.resource = assets.sky
        night = scenery?.look.night ?? false
        // A night race: the dark sky lights little; the floodlights, a cool white from high above,
        // light the track.
        view.environment.lighting.intensityExponent = night ? 1.2 : 0.15
        sun.light.intensity = night ? 9000 : 14000
        sun.light.color =
            night ? NSColor(red: 0.9, green: 0.94, blue: 1, alpha: 1) : NSColor(red: 1, green: 0.96, blue: 0.9, alpha: 1)
        sun.shadow = DirectionalLightComponent.Shadow(shadowProjection: .fixed(zNear: 1, zFar: 120, orthographicScale: 30), depthBias: 1.0)
        anchor.addChild(sun)

        if let track = try? TrackMesh.build(
            session.track, assets.materials, wallStyles: scenery?.wallStyles,
            groundPlane: !(scenery?.hasGround ?? false), runoff: scenery?.runoff, kerbs: scenery?.kerbs ?? [])
        {
            anchor.addChild(track)
            if session.mayRain {
                let effects = RainEffects(track: session.track)
                effects.wets(track)
                anchor.addChild(effects.root)
                rain = effects
            }
        }
        markOwnBox()
        if let scenery {
            anchor.addChild(scenery.entity)
            // The ground round the track gets wet too (not the buildings, trees or water).
            for name in ["groundLow", "groundHigh", "pitLane", "pitConcrete", "standConcrete"] {
                if let part = scenery.entity.findEntity(named: name) { rain?.wets(part) }
            }
        }
        anchor.addChild(debris.root)
        anchor.addChild(trackDebris.root)
        anchor.addChild(cameraRig.camera)
        if #available(macOS 27.0, *) {
            cameraRig.camera.components.set(ToneMappingComponent(exposure: 0.15))
        }
        view.scene.addAnchor(anchor)

        update = view.scene.subscribe(to: SceneEvents.Update.self) { [weak self] event in
            MainActor.assumeIsolated { self?.frame(event.deltaTime) }
        }
        frame(0)
    }

    /// Paints the own pit box yellow where the session has it now (the web's `markPitBox`): online the
    /// server gives it when this player joins the Grand Prix and may move it (play again, someone
    /// leaving), so a box painted once would show the wrong one and the car would never stop there.
    private func markOwnBox() {
        let box = session.ownPitBox
        guard box != markedBox else { return }
        ownBoxMark?.removeFromParent()
        ownBoxMark = nil
        markedBox = box
        guard let box, let mark = try? TrackMesh.ownBoxMark(session.track, box: box) else { return }
        anchor.addChild(mark)
        ownBoxMark = mark
    }

    /// The sky and the sun for a track `wetness` wet: overcast from `RainEffects.overcastFrom` (clear
    /// again below `clearBelow`), the sun dimmed by the cloud.
    private func showWeather(_ wetness: Double) {
        guard let view, let assets, let overcast = assets.overcast, !night else { return }
        let want = overcastShown ? wetness >= RainEffects.clearBelow : wetness >= RainEffects.overcastFrom
        if want != overcastShown {
            overcastShown = want
            let sky = want ? overcast : assets.sky
            view.environment.background = .skybox(sky)
            view.environment.lighting.resource = sky
            view.environment.lighting.intensityExponent = want ? 0.45 : 0.15
        }
        sun.light.intensity = Float(14000 * (1 - 0.82 * min(1, wetness / 0.6)))
    }

    private func addSafetyCar() -> SafetyCarEntity {
        let entity = SafetyCarEntity()
        anchor.addChild(entity.root)
        safetyCar = entity
        return entity
    }

    private func addCar(_ id: CarId) -> CarEntity {
        let entity = CarEntity(livery: session.livery(id))
        entity.debris = debris
        anchor.addChild(entity.root)
        cars[id] = entity
        return entity
    }

    func detach() {
        update?.cancel()
        update = nil
        view?.scene.removeAnchor(anchor)
    }

    private func frame(_ deltaTime: Double) {
        let (alpha, seconds) = session.advance(deltaTime)
        markOwnBox()
        var wetness = session.wetness
        #if DEBUG
            if let dev = DevOptions.wetness { wetness = dev }
        #endif
        var poses = session.poses(alpha: alpha)
        #if DEBUG
            if let ahead = DevOptions.safetyCarAhead, var shown = poses[session.followed] {
                shown.position = shown.position + Vec2.forward(shown.heading) * ahead
                poses[safetyCarId] = shown
            }
        #endif
        for (id, carPose) in poses {
            // The safety car (an online Grand Prix's, R.3): its own model, its light bar.
            if id == safetyCarId {
                let entity = safetyCar ?? addSafetyCar()
                var lights = session.safetyCarLights
                #if DEBUG
                    if DevOptions.safetyCarAhead != nil { lights = true }
                #endif
                entity.setLights(lights)
                entity.update(carPose, frameSeconds: seconds)
                continue
            }
            let entity = cars[id] ?? addCar(id)
            var carPose = carPose
            #if DEBUG
                if let damage = DevOptions.damage(frame: frames) { carPose.damage = damage }
            #endif
            entity.update(carPose, frameSeconds: seconds)
            if rain != nil { entity.setWet(wetness, speed: abs(carPose.forwardSpeed), frameSeconds: seconds) }
        }
        debris.update(seconds)
        var flags = session.yellowFlags
        #if DEBUG
            if flags.isEmpty, let start = session.current.car(session.followed)?.position,
                let dev = DevOptions.yellowFlag(session.track, from: start)
            {
                flags = [dev]
            }
        #endif
        trackDebris.show(flags, session.track) { [session] id in session.livery(id).body }
        trackDebris.update(seconds)
        for id in cars.keys where poses[id] == nil {
            cars.removeValue(forKey: id)?.root.removeFromParent()
        }
        if poses[safetyCarId] == nil, let gone = safetyCar {
            gone.root.removeFromParent()
            safetyCar = nil
        }
        guard let pose = poses[session.followed] ?? poses.values.first else { return }
        let ghostPose = session.ghostPose(alpha: alpha)
        if ghost == nil, ghostPose != nil {
            let made = CarEntity(livery: session.livery(session.playerId))
            made.makeGhost()
            anchor.addChild(made.root)
            ghost = made
        }
        ghost?.root.isEnabled = ghostPose != nil
        if let ghostPose { ghost?.update(ghostPose, frameSeconds: seconds) }
        let now = CACurrentMediaTime()
        let state = session.current
        hud.update(state, carId: session.playerId, now: now)
        if let player = state.car(session.playerId) {
            debug.update(state, car: player, input: session.lastInput, now: now)
        }
        cameraRig.update(pose, frameSeconds: seconds, lookBack: session.keyboard.lookBack)
        // The sun follows the car, so its shadows are sharp wherever the car goes.
        let direction = night ? simd_normalize(SIMD3<Float>(0.15, 1, 0.1)) : ProceduralTextures.sunDirection
        sun.look(at: pose.worldPosition, from: pose.worldPosition + direction * 50, relativeTo: nil)
        if let rain {
            rain.update(
                wetness: wetness, camera: cameraRig.camera.position(relativeTo: nil), road: Float(pose.y), seconds: seconds)
            showWeather(wetness)
        }
        frames += 1
        #if DEBUG
            DevOptions.pressKeys(frame: frames)
            if let view { DevOptions.snapshotIfDue(view, frame: frames) }
        #endif
    }
}
