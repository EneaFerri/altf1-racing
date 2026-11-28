import AltF1Core
import AppKit
import RealityKit

/// The rain on the Mac (2.8, 01_docs/macos.md#rain): everything follows the track's wetness (0 dry …
/// 1 soaked) live, so a variable GP's weather turns on screen as it does in the simulation.
/// - Falling rain, RealityKit particles (`ParticleEmitterComponent`) in two layers carried with the
///   camera: sharp streaks close by, each dying on the road in a little splash (particles spawned
///   at its death), and a denser grey curtain further off.
/// - A wet track: every road, kerb and wall material darker and glossy (a clear coat that mirrors
///   the sky), the ground round it too.
/// - Standing water once it is really soaked: the simulation's puddles (`placePuddles`), each an
///   irregular pool with a soft edge, mirror-smooth (the overcast sky in it), its surface broken by
///   the drops' rings (an animated normal map: `RainTextures`).
/// - An overcast sky that lights the scene (image-based lighting), a dimmer sun (`RaceRenderer`).
/// The cars' spray and rain light are `CarEntity.setWet`.
@MainActor
final class RainEffects {
    let root = Entity()
    /// Wetness from which the sky is overcast (back to the sun below `clearBelow`).
    static let overcastFrom = 0.3
    static let clearBelow = 0.2
    /// Standing water shows from this wetness and is full from `puddlesFull` (a full-wet track).
    static let puddlesFrom = 0.45
    static let puddlesFull = 0.75

    private let track: Track
    /// The near streaks (dying in splashes on the road) and the far curtain.
    private let near = Entity()
    private let far = Entity()
    private var puddles: ModelEntity?
    private var puddleMaterial: PhysicallyBasedMaterial?
    private var ripples: [MaterialParameters.Texture] = []
    private var rippleFrame = -1
    private var rippleSeconds = 0.0
    /// Every material that gets wet, with its dry self.
    private var wetTargets: [(entity: ModelEntity, dry: [PhysicallyBasedMaterial])] = []
    /// The wetness last drawn (materials are only redone when it moves on).
    private var shown = -1.0
    private var lastCamera: SIMD3<Float>?

    /// Drops per second at wetness 1: near and far.
    private static let nearRate: Float = 9_000
    private static let farRate: Float = 22_000
    /// The near drops fall this far to the road at this speed (m, m/s): they die on it.
    private static let nearDrop: Float = 7
    private static let dropSpeed: Float = 22
    /// Ripple frames per second.
    private static let rippleRate = 14.0

    init(track: Track) {
        self.track = track
        root.addChild(near)
        root.addChild(far)
        near.components.set(Self.nearRain())
        far.components.set(Self.farRain())
        Task { await self.loadPuddles() }
    }

    /// The meshes that get wet: everything under `entity` drawn in a physically based material.
    func wets(_ entity: Entity) {
        if let model = entity as? ModelEntity, let materials = model.model?.materials {
            let pbr = materials.compactMap { $0 as? PhysicallyBasedMaterial }
            if pbr.count == materials.count, !pbr.isEmpty { wetTargets.append((model, pbr)) }
        }
        for child in entity.children { wets(child) }
    }

    /// One frame at `wetness`: the camera at `camera`, the road under the followed car at `road`
    /// (m), `seconds` since the last frame.
    func update(wetness: Double, camera: SIMD3<Float>, road: Float, seconds: Double) {
        // The drops are carried ahead of the camera by its speed: they land where it will be.
        let velocity = lastCamera.map { (camera - $0) / Float(max(seconds, 1.0 / 240)) } ?? .zero
        lastCamera = camera
        let flat = SIMD3<Float>(velocity.x, 0, velocity.z)
        let fall = Self.nearDrop / Self.dropSpeed
        near.position = SIMD3(camera.x, road + Self.nearDrop, camera.z) + flat * fall
        far.position = SIMD3(camera.x, road + 16, camera.z) + flat * 0.6
        let w = Float(wetness)
        for (entity, rate) in [(near, Self.nearRate), (far, Self.farRate)] {
            guard var emitter = entity.components[ParticleEmitterComponent.self] else { continue }
            let birth = rate * w
            emitter.isEmitting = birth > 1
            emitter.mainEmitter.birthRate = birth
            entity.components.set(emitter)
        }
        animateRipples(seconds)
        guard abs(wetness - shown) > 0.02 || (wetness == 0) != (shown == 0) else { return }
        shown = wetness
        for (entity, dry) in wetTargets {
            entity.model?.materials = dry.map { Self.wet($0, w) }
        }
        showPuddles()
    }

    // MARK: The falling rain

    /// The drops close to the camera: fine bright streaks (stretched along their fall), all falling
    /// the same height so each dies on the road, where it throws a little splash.
    private static func nearRain() -> ParticleEmitterComponent {
        var rain = ParticleEmitterComponent.Presets.rain
        rain.emitterShape = .box
        rain.emitterShapeSize = SIMD3(22, 0.3, 22)
        rain.birthLocation = .volume
        rain.birthDirection = .world
        rain.emissionDirection = simd_normalize(SIMD3(0.06, -1, 0.03))
        rain.speed = dropSpeed
        rain.speedVariation = 0
        rain.fieldSimulationSpace = .global
        rain.particlesInheritTransform = false
        rain.isEmitting = false
        rain.timing = .repeating(warmUp: 0.5, emit: .init(duration: 60))
        var drop = rain.mainEmitter
        drop.birthRate = 0
        drop.lifeSpan = Double(nearDrop / dropSpeed)
        drop.lifeSpanVariation = 0
        drop.size = 0.006
        drop.sizeVariation = 0.002
        drop.stretchFactor = 26
        drop.billboardMode = .billboardYAligned
        drop.acceleration = .zero
        drop.color = .constant(.single(NSColor(red: 0.86, green: 0.89, blue: 0.93, alpha: 0.55)))
        drop.opacityCurve = .constant
        drop.blendMode = .alpha
        drop.isLightingEnabled = false
        rain.mainEmitter = drop
        // Where a drop dies, on the road: a splash of droplets thrown up and falling back.
        rain.spawnOccasion = .onDeath
        rain.spawnVelocityFactor = 0
        rain.spawnSpreadFactor = 0
        var splash = ParticleEmitterComponent.ParticleEmitter()
        splash.birthRate = 400
        splash.lifeSpan = 0.18
        splash.lifeSpanVariation = 0.05
        splash.size = 0.018
        splash.sizeVariation = 0.008
        splash.sizeMultiplierAtEndOfLifespan = 0.4
        splash.spreadingAngle = 1.2
        splash.acceleration = SIMD3(0, -9.8, 0)
        splash.billboardMode = .billboard
        splash.color = .constant(.single(NSColor(red: 0.9, green: 0.92, blue: 0.95, alpha: 0.5)))
        splash.opacityCurve = .linearFadeOut
        splash.blendMode = .alpha
        splash.isLightingEnabled = false
        rain.spawnedEmitter = splash
        return rain
    }

    /// The rain further off: a curtain of thicker, fainter streaks that greys the distance.
    private static func farRain() -> ParticleEmitterComponent {
        var rain = ParticleEmitterComponent.Presets.rain
        rain.emitterShape = .box
        rain.emitterShapeSize = SIMD3(130, 2, 130)
        rain.birthLocation = .volume
        rain.birthDirection = .world
        rain.emissionDirection = simd_normalize(SIMD3(0.06, -1, 0.03))
        rain.speed = dropSpeed
        rain.speedVariation = 3
        rain.fieldSimulationSpace = .global
        rain.particlesInheritTransform = false
        rain.isEmitting = false
        rain.timing = .repeating(warmUp: 1, emit: .init(duration: 60))
        var drop = rain.mainEmitter
        drop.birthRate = 0
        drop.lifeSpan = 0.85
        drop.lifeSpanVariation = 0.1
        drop.size = 0.022
        drop.sizeVariation = 0.006
        drop.stretchFactor = 12
        drop.billboardMode = .billboardYAligned
        drop.acceleration = .zero
        drop.color = .constant(.single(NSColor(red: 0.72, green: 0.75, blue: 0.8, alpha: 0.22)))
        drop.opacityCurve = .gradualFadeInOut
        drop.blendMode = .alpha
        drop.isLightingEnabled = false
        rain.mainEmitter = drop
        return rain
    }

    // MARK: A wet track

    /// `dry` soaked to `w`: darker (water deepens a surface's colour), much smoother, and a clear
    /// coat over it that mirrors the sky like a film of water.
    private static func wet(_ dry: PhysicallyBasedMaterial, _ w: Float) -> PhysicallyBasedMaterial {
        guard w > 0 else { return dry }
        var m = dry
        m.roughness.scale = dry.roughness.scale * (1 - 0.7 * w)
        if let tint = dry.baseColor.tint.usingColorSpace(.deviceRGB) {
            let k = CGFloat(1 - 0.38 * w)
            m.baseColor.tint = NSColor(
                red: tint.redComponent * k, green: tint.greenComponent * k, blue: tint.blueComponent * k,
                alpha: tint.alphaComponent)
        }
        m.clearcoat = .init(floatLiteral: 0.85 * w)
        m.clearcoatRoughness = .init(floatLiteral: 0.05)
        return m
    }

    // MARK: Standing water

    /// The puddles' textures, drawn off the main thread, then their mesh.
    private func loadPuddles() async {
        let shapes = await Task.detached { RainTextures.puddleShapes() }.value
        let frames = await Task.detached { RainTextures.ripples() }.value
        guard let opacity = try? await RaceMaterials.texture(shapes, .raw) else { return }
        var normals: [MaterialParameters.Texture] = []
        for frame in frames {
            if let texture = try? await RaceMaterials.texture(frame, .normal) { normals.append(texture) }
        }
        guard let mesh = Self.puddleMesh(track), !normals.isEmpty else { return }
        var water = PhysicallyBasedMaterial()
        // Water over dark asphalt: nearly black, it shows what it mirrors.
        water.baseColor = .init(tint: NSColor(red: 0.018, green: 0.022, blue: 0.026, alpha: 1))
        water.roughness = 0.0
        water.metallic = 0.0
        water.specular = 1.0
        water.clearcoat = 1.0
        water.clearcoatRoughness = 0.0
        water.normal = .init(texture: normals[0])
        water.blending = .transparent(opacity: .init(scale: 0, texture: opacity))
        water.faceCulling = .none
        puddleMaterial = water
        ripples = normals
        let entity = ModelEntity(mesh: mesh, materials: [water])
        entity.components.set(DynamicLightShadowComponent(castsShadow: false))
        root.addChild(entity)
        puddles = entity
        showPuddles()
    }

    /// The water as wet as the track: none below `puddlesFrom`, full from `puddlesFull`.
    private func showPuddles() {
        guard let puddles, var water = puddleMaterial else { return }
        let k = Float(max(0, min(1, (shown - Self.puddlesFrom) / (Self.puddlesFull - Self.puddlesFrom))))
        puddles.isEnabled = k > 0
        if case .transparent(let opacity) = water.blending {
            var scaled = opacity
            scaled.scale = 0.95 * k
            water.blending = .transparent(opacity: scaled)
        }
        puddleMaterial = water
        if let frame = ripples[safe: rippleFrame] { water.normal = .init(texture: frame) }
        puddles.model?.materials = [water]
    }

    /// The drops' rings on the water: the next ripple frame, `rippleRate` a second.
    private func animateRipples(_ seconds: Double) {
        guard let puddles, puddles.isEnabled, !ripples.isEmpty, var water = puddleMaterial else { return }
        rippleSeconds += seconds
        let frame = Int(rippleSeconds * Self.rippleRate) % ripples.count
        guard frame != rippleFrame else { return }
        rippleFrame = frame
        water.normal = .init(texture: ripples[frame])
        puddles.model?.materials = [water]
    }

    /// The puddles as one mesh: each a quad a little bigger than its ellipse, a few millimetres over
    /// the road, showing one of the four pool shapes of `RainTextures.puddleShapes` (by its index),
    /// turned one of four ways; the shape's soft edge cuts it out.
    private static func puddleMesh(_ track: Track) -> MeshResource? {
        let puddles = placePuddles(track)
        guard !puddles.isEmpty else { return nil }
        var positions: [SIMD3<Float>] = []
        var normals: [SIMD3<Float>] = []
        var uvs: [SIMD2<Float>] = []
        var indices: [UInt32] = []
        for (i, puddle) in puddles.enumerated() {
            let y = (track.elevated ? Float(locateOnTrack(track, puddle.center).height) : 0) + 0.015
            func at(_ along: Double, _ across: Double) -> SIMD3<Float> {
                let p = puddle.center + puddle.axis * (along * puddle.halfLength * 1.25)
                    + puddle.normal * (across * puddle.halfWidth * 1.25)
                return SIMD3(Float(p.x), y, Float(p.z))
            }
            // Its shape: a quadrant of the atlas, its corners turned by the index.
            let q = SIMD2<Float>(Float(i % 2), Float((i / 2) % 2)) * 0.5
            var corners: [SIMD2<Float>] = [SIMD2(0, 0), SIMD2(0.5, 0), SIMD2(0.5, 0.5), SIMD2(0, 0.5)]
            for _ in 0..<((i / 4) % 4) { corners.append(corners.removeFirst()) }
            let base = UInt32(positions.count)
            positions += [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)]
            normals += Array(repeating: SIMD3(0, 1, 0), count: 4)
            uvs += corners.map { q + $0 }
            indices += [base, base + 2, base + 1, base, base + 3, base + 2]
        }
        var descriptor = MeshDescriptor(name: "puddles")
        descriptor.positions = MeshBuffer(positions)
        descriptor.normals = MeshBuffer(normals)
        descriptor.textureCoordinates = MeshBuffer(uvs)
        descriptor.primitives = .triangles(indices)
        return try? MeshResource.generate(from: [descriptor])
    }
}

extension Array {
    fileprivate subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}

/// The rain's procedural textures (`RainEffects`).
nonisolated enum RainTextures {
    typealias T = ProceduralTextures

    /// Four pool shapes in a 2×2 atlas (opacity, white = water): each an irregular blob (its
    /// outline wandering with noise, a lobe or two), its edge soft as water thinning out.
    static func puddleShapes(_ size: Int = 512) -> PixelImage {
        let half = Float(size) / 2
        return PixelImage.render(size, size) { x, y in
            let cell = (x >= size / 2 ? 1 : 0) + (y >= size / 2 ? 2 : 0)
            // Within the cell: -1…1 both ways.
            let u = (Float(x % (size / 2)) + 0.5) / half * 2 - 1
            let v = (Float(y % (size / 2)) + 0.5) / half * 2 - 1
            let angle = atan2(v, u)
            let seed = Int32(31 + cell * 17)
            // The outline: a wobbling radius (low lobes and finer ripples), inside the quad's 0.8.
            let a = (angle / (2 * .pi) + 0.5)
            let lobes = T.noise(a * 4, Float(cell), period: 4, seed: seed) * 0.22
            let fine = T.noise(a * 16, Float(cell) * 3, period: 16, seed: seed + 5) * 0.08
            let radius = 0.62 + lobes + fine
            let d = sqrt(u * u + v * v) / radius
            // Soft edge, and a thinner film near it (less opaque) than in the middle.
            let edge = 1 - simd_smoothstep(0.82, 1.0, d)
            let depth = 0.75 + 0.25 * (1 - simd_smoothstep(0.3, 0.9, d))
            let a2 = edge * depth
            return SIMD4(a2, a2, a2, 1)
        }
    }

    /// The drops' rings on standing water, `frames` frames of a looping animation (normal maps):
    /// `drops` rings at random places, each born at its own time, spreading and fading out.
    static func ripples(frames: Int = 8, drops: Int = 70, _ size: Int = 512) -> [PixelImage] {
        var rng = SystemRandomNumberGenerator()
        let born = (0..<drops).map { _ in
            (SIMD2<Float>(Float.random(in: 0..<1, using: &rng), Float.random(in: 0..<1, using: &rng)),
             Float.random(in: 0..<1, using: &rng))
        }
        return (0..<frames).map { frame in
            let t = Float(frame) / Float(frames)
            let height = T.heightField(size) { s, u in
                var h: Float = 0
                for (centre, phase) in born {
                    let age = (t + phase).truncatingRemainder(dividingBy: 1)
                    // Tiling: the nearest copy of the centre.
                    var dx = abs(s - centre.x)
                    var dy = abs(u - centre.y)
                    dx = min(dx, 1 - dx)
                    dy = min(dy, 1 - dy)
                    let d = sqrt(dx * dx + dy * dy)
                    let radius = 0.005 + age * 0.06
                    let ring = (d - radius) / 0.006
                    guard abs(ring) < 3 else { continue }
                    h += cos(ring * 2.4) * exp(-ring * ring * 0.5) * (1 - age) * (1 - age)
                }
                return h * 0.5 + 0.5
            }
            return T.normalMap(size, strength: 6, height)
        }
    }
}

extension CarEntity {
    /// The spray a car throws up behind it on a wet track: a mist from the rear tyres and the
    /// diffuser, thicker the faster and the wetter, drifting and spreading as it hangs in the air.
    static func sprayEmitter() -> ParticleEmitterComponent {
        var spray = ParticleEmitterComponent()
        spray.emitterShape = .box
        spray.emitterShapeSize = SIMD3(1.7, 0.2, 0.3)
        spray.birthLocation = .volume
        spray.birthDirection = .local
        spray.emissionDirection = simd_normalize(SIMD3(0, 0.45, 1))
        spray.speed = 5
        spray.speedVariation = 2
        spray.fieldSimulationSpace = .global
        spray.particlesInheritTransform = false
        spray.isEmitting = false
        spray.timing = .repeating(warmUp: 0, emit: .init(duration: 60))
        var mist = spray.mainEmitter
        mist.birthRate = 0
        mist.lifeSpan = 1.3
        mist.lifeSpanVariation = 0.4
        mist.size = 0.35
        mist.sizeVariation = 0.15
        mist.sizeMultiplierAtEndOfLifespan = 7
        mist.spreadingAngle = 0.5
        mist.dampingFactor = 2.5
        mist.acceleration = SIMD3(0, -0.6, 0)
        mist.billboardMode = .billboard
        mist.color = .constant(.single(NSColor(red: 0.82, green: 0.84, blue: 0.86, alpha: 0.16)))
        mist.opacityCurve = .gradualFadeInOut
        mist.blendMode = .alpha
        mist.isLightingEnabled = true
        mist.noiseStrength = 0.4
        mist.noiseScale = 1
        spray.mainEmitter = mist
        return spray
    }
}
