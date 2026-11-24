import AltF1Core
import AppKit
import Combine
import RealityKit
import SwiftUI

/// What the race scene needs ready before it is drawn: the materials and the sky.
struct RaceAssets {
    let materials: RaceMaterials
    let sky: EnvironmentResource

    /// `night`: a night race's dark sky (Singapore).
    static func load(night: Bool = false) async throws -> RaceAssets {
        async let materials = RaceMaterials.load()
        let skyImage = await Task.detached { (night ? ProceduralTextures.nightSky() : ProceduralTextures.sky()).cgImage }.value
        let sky: EnvironmentResource
        if #available(macOS 27.0, *) {
            sky = try await EnvironmentResource(
                equirectangular: skyImage, options: .init(samplingQuality: .high, specularCubeDimension: 512))
        } else {
            sky = try await EnvironmentResource(equirectangular: skyImage)
        }
        return RaceAssets(materials: try await materials, sky: sky)
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

    init(session: any RaceSession, cameraRig: CameraRig, hud: TimingHud, debug: DebugOverlay) {
        self.session = session
        self.cameraRig = cameraRig
        self.hud = hud
        self.debug = debug
    }

    func attach(to view: ARView, assets: RaceAssets, scenery: CircuitSceneryResult?) {
        self.view = view
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
            groundPlane: !(scenery?.hasGround ?? false), runoff: scenery?.runoff)
        {
            anchor.addChild(track)
        }
        markOwnBox()
        if let scenery { anchor.addChild(scenery.entity) }
        anchor.addChild(debris.root)
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
        let poses = session.poses(alpha: alpha)
        for (id, carPose) in poses {
            let entity = cars[id] ?? addCar(id)
            var carPose = carPose
            #if DEBUG
                if let damage = DevOptions.damage(frame: frames) { carPose.damage = damage }
            #endif
            entity.update(carPose, frameSeconds: seconds)
        }
        debris.update(seconds)
        for id in cars.keys where poses[id] == nil {
            cars.removeValue(forKey: id)?.root.removeFromParent()
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
        frames += 1
        #if DEBUG
            DevOptions.pressKeys(frame: frames)
            if let view { DevOptions.snapshotIfDue(view, frame: frames) }
        #endif
    }
}
