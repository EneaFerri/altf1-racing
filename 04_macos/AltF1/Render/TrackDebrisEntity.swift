import AltF1Core
import AppKit
import RealityKit

/// Crashes' debris on the track and their yellow flags (R.2, the web's `TrackDebris`): for each
/// `YellowFlag` out, its pieces (`debrisLayout`: the same as every player's, carbon, the crashed
/// car's paint, white bits) and, 120 m before it on the other side of the road, a marshals' post:
/// a light panel flashing yellow towards the oncoming cars and a marshal's yellow flag waving. Both
/// go with the flag.
@MainActor
final class TrackDebrisEntity {
    let root = Entity()
    private struct Crash {
        let entity: Entity
        let lamp: ModelEntity
        let strips: [Entity]
    }

    private var crashes: [String: Crash] = [:]
    private var seconds: Float = 0
    private var lampOn = false
    /// The post stands this far before the crash (m): the drivers' warning.
    private static let postBefore = 120.0

    private let carbon: PhysicallyBasedMaterial = {
        var m = PhysicallyBasedMaterial()
        m.baseColor = .init(tint: .init(white: 0.04, alpha: 1))
        m.metallic = 0.25
        m.roughness = 0.35
        m.clearcoat = 0.7
        return m
    }()
    private let white: PhysicallyBasedMaterial = {
        var m = PhysicallyBasedMaterial()
        m.baseColor = .init(tint: .init(white: 0.92, alpha: 1))
        m.roughness = 0.4
        return m
    }()
    private let yellow: PhysicallyBasedMaterial = {
        var m = PhysicallyBasedMaterial()
        m.baseColor = .init(tint: .init(red: 0.98, green: 0.8, blue: 0.08, alpha: 1))
        m.roughness = 0.7
        return m
    }()

    /// The flags out now on `track`; `paint`: a crashed car's colour.
    func show(_ flags: [YellowFlag], _ track: Track, paint: (CarId) -> SIMD3<Float>) {
        let keys = Set(flags.map(Self.key))
        for (key, crash) in crashes where !keys.contains(key) {
            crash.entity.removeFromParent()
            crashes.removeValue(forKey: key)
        }
        for flag in flags where crashes[Self.key(flag)] == nil {
            let entity = Entity()
            let colour = paint(flag.carId)
            var paintMaterial = PhysicallyBasedMaterial()
            paintMaterial.baseColor = .init(
                tint: .init(red: CGFloat(colour.x), green: CGFloat(colour.y), blue: CGFloat(colour.z), alpha: 1))
            paintMaterial.metallic = 0.35
            paintMaterial.roughness = 0.3
            paintMaterial.clearcoat = 1.0
            for piece in debrisLayout(track, flag) {
                let material = piece.kind == .carbon ? carbon : piece.kind == .white ? white : paintMaterial
                let shard = ModelEntity(
                    mesh: .generateBox(
                        width: Float(piece.width), height: Float(piece.height), depth: Float(piece.length),
                        cornerRadius: Float(min(piece.height, piece.width) * 0.2)),
                    materials: [material])
                shard.position = SIMD3(Float(piece.x), Float(piece.y + piece.height / 2 + 0.01), Float(piece.z))
                shard.orientation = simd_quatf(angle: Float(piece.yaw), axis: SIMD3(0, 1, 0))
                entity.addChild(shard)
            }
            let post = Self.post(track, flag, yellow: yellow, carbon: carbon)
            entity.addChild(post.root)
            root.addChild(entity)
            crashes[Self.key(flag)] = Crash(entity: entity, lamp: post.lamp, strips: post.strips)
        }
    }

    /// Flashes the panels and waves the flags (once per frame).
    func update(_ frameSeconds: Double) {
        guard !crashes.isEmpty else { return }
        seconds += Float(frameSeconds)
        let on = Int(seconds * 3) % 2 == 0
        for crash in crashes.values {
            if on != lampOn { crash.lamp.model?.materials = [Self.panel(on: on)] }
            // The cloth: each strip turned a little more than the one nearer the pole, a wave along it.
            for (i, strip) in crash.strips.enumerated() {
                let angle = 0.35 * sin(seconds * 9 - Float(i) * 0.9) * Float(i + 1) / Float(crash.strips.count)
                strip.orientation = simd_quatf(angle: angle, axis: SIMD3(0, 1, 0))
            }
        }
        lampOn = on
    }

    private static func key(_ flag: YellowFlag) -> String { "\(flag.carId)@\(flag.since)" }

    /// The marshals' post before `flag`'s crash: a pole with a light panel facing the oncoming cars
    /// and a marshal's yellow flag, beyond the asphalt on the side away from the crash.
    private static func post(_ track: Track, _ flag: YellowFlag, yellow: PhysicallyBasedMaterial, carbon: PhysicallyBasedMaterial)
        -> (root: Entity, lamp: ModelEntity, strips: [Entity])
    {
        let n = track.samples.count
        let along = flag.progress - postBefore
        let wrapped = (along.truncatingRemainder(dividingBy: track.length) + track.length)
            .truncatingRemainder(dividingBy: track.length)
        let index = Int((wrapped / track.length * Double(n)).rounded()) % n
        let sample = track.samples[index]
        let side = -crashSide(track, flag)
        let offset = sample.halfWidth + min(3, track.runoffWidth / 2)
        let at = sample.position + sample.normal * (side * offset)
        let root = Entity()
        root.position = SIMD3(Float(at.x), Float(sample.height), Float(at.z))
        // Facing back down the track, at the cars coming.
        root.orientation = simd_quatf(angle: Float((sample.tangent * -1).heading), axis: SIMD3(0, 1, 0))
        var grey = PhysicallyBasedMaterial()
        grey.baseColor = .init(tint: .init(white: 0.55, alpha: 1))
        grey.metallic = 0.8
        grey.roughness = 0.35
        let pole = ModelEntity(mesh: .generateBox(width: 0.1, height: 2.6, depth: 0.1), materials: [grey])
        pole.position = SIMD3(0, 1.3, 0)
        root.addChild(pole)
        let housing = ModelEntity(
            mesh: .generateBox(width: 1.0, height: 0.62, depth: 0.12, cornerRadius: 0.03), materials: [carbon])
        housing.position = SIMD3(0, 2.4, -0.02)
        root.addChild(housing)
        let lamp = ModelEntity(mesh: .generateBox(width: 0.86, height: 0.5, depth: 0.02), materials: [panel(on: true)])
        lamp.position = SIMD3(0, 2.4, -0.09)
        root.addChild(lamp)
        // The flag on its own short pole, its cloth in strips hinged one to the next.
        let flagPole = ModelEntity(mesh: .generateCylinder(height: 1.6, radius: 0.015), materials: [grey])
        flagPole.position = SIMD3(0.75, 1.5, -0.2)
        root.addChild(flagPole)
        var strips: [Entity] = []
        var parent: Entity = root
        var hinge = SIMD3<Float>(0.75, 1.98, -0.2)
        let strip: Float = 0.12
        for _ in 0..<6 {
            let pivot = Entity()
            pivot.position = hinge
            parent.addChild(pivot)
            let cloth = ModelEntity(mesh: .generateBox(width: strip, height: 0.6, depth: 0.01), materials: [yellow])
            cloth.position = SIMD3(strip / 2, 0, 0)
            pivot.addChild(cloth)
            strips.append(pivot)
            parent = pivot
            hinge = SIMD3(strip, 0, 0)
        }
        return (root, lamp, strips)
    }

    private static func panel(on: Bool) -> PhysicallyBasedMaterial {
        var m = PhysicallyBasedMaterial()
        let tint = on ? NSColor(red: 1, green: 0.82, blue: 0.05, alpha: 1) : NSColor(white: 0.08, alpha: 1)
        m.baseColor = .init(tint: tint)
        m.emissiveColor = .init(color: tint)
        m.emissiveIntensity = on ? 5 : 0
        return m
    }
}
