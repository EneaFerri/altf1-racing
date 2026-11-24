import AltF1Core
import AppKit
import RealityKit
import SwiftUI

/// The interpolated car the view draws each frame (the web's `CarPose`).
struct CarPose {
    var position: Vec2
    /// Height of the road under the car (m; 0 on a flat track).
    var y: Double = 0
    var heading: Double
    var steer: Double
    /// Signed forward speed (m/s): spins the wheels, widens the view.
    var forwardSpeed: Double
    /// Slip angle (rad): leans the body outwards in slides.
    var slip: Double
    /// Nose-up angle from the slope along the heading (rad; 0 on a flat track).
    var pitch: Double = 0
    /// How much it is towed (0..1).
    var slipstream: Double = 0
    /// Its velocity (m/s, world): debris flies off with it.
    var velocity: Vec2 = .zero
    /// Its damage (Grand Prix only; nil = none drawn).
    var damage: CarDamage?
    /// Its tyres' compound (Grand Prix only): the sidewalls' band; nil = yellow, as mediums.
    var compound: TyreCompound?

    /// Between the last two ticks (`alpha` 0..1), lifted onto the road on an elevated track.
    init(_ prev: CarState, _ curr: CarState, alpha: Double, track: Track) {
        position = prev.position.lerp(to: curr.position, alpha)
        heading = lerpAngle(prev.heading, curr.heading, alpha)
        steer = prev.steer + (curr.steer - prev.steer) * alpha
        forwardSpeed = curr.velocity.dot(.forward(curr.heading))
        slip = slipAngle(prev) + (slipAngle(curr) - slipAngle(prev)) * alpha
        slipstream = curr.slipstream
        velocity = curr.velocity
        damage = curr.damage
        compound = curr.tyres?.compound
        if track.elevated {
            let loc = locateOnTrack(track, position)
            y = loc.height
            pitch = atan(loc.grade * Vec2.forward(heading).dot(loc.tangent))
        }
    }

    var worldPosition: SIMD3<Float> { SIMD3(Float(position.x), Float(y), Float(position.z)) }
}

/// A car's colours: every car has the same body, only these differ (the web's `pixelTexture.ts`).
struct Livery {
    /// The bodywork.
    var body: SIMD3<Float>
    /// The second colour: nose tip, wing flaps.
    var accent: SIMD3<Float>

    init(_ body: UInt32, _ accent: UInt32 = 0xF4F4F4) {
        func rgb(_ hex: UInt32) -> SIMD3<Float> {
            SIMD3(Float((hex >> 16) & 0xFF), Float((hex >> 8) & 0xFF), Float(hex & 0xFF)) / 255
        }
        self.body = rgb(body)
        self.accent = rgb(accent)
    }

    /// The local player red, the bot blue, anything else grey (`LIVERIES`).
    static let red = Livery(0xE10600)
    static let blue = Livery(0x1F5FE0)
    static let grey = Livery(0x8A8A8A)

    /// The single-player Grand Prix's team colours (`TEAM_LIVERIES`).
    static func team(_ id: TeamId) -> Livery {
        switch id {
        case .mercedes: Livery(0xC3C7CC, 0x00D2BE)
        case .ferrari: Livery(0xDC0000, 0xFFF200)
        case .redBull: Livery(0x1B2A6B, 0xE10600)
        case .mclaren: Livery(0xFF8000, 0x151515)
        case .polimi: Livery(0x1D4F9C, 0xFFFFFF)
        }
    }

    /// Online: the server's livery index (the lowest free one at join), as the web paints it
    /// (`PLAYER_LIVERIES`): red, blue, green, yellow, orange, purple, cyan, pink.
    static func online(_ index: Int) -> Livery {
        let colours: [UInt32] = [0xE10600, 0x1F5FE0, 0x1FA84A, 0xF2C200, 0xFF7A00, 0x8A3FFC, 0x16C6D9, 0xFF4FA3]
        return Livery(colours[((index % colours.count) + colours.count) % colours.count])
    }

    var color: Color { Color(red: Double(body.x), green: Double(body.y), blue: Double(body.z)) }
}

/// A modern F1 car in PBR, after the owner's reference photos (side and rear, 2026-11-22): the body
/// is lofted (`Loft`): a long thin nose, the bulkhead ahead of the open cockpit, the airbox behind
/// the driver's head, the engine cover sloping to the gearbox, sculpted sidepods narrowing to the
/// rear, a wide floor; multi-element wings, the rain light, suspension arms, halo, mirrors, the
/// driver (helmet, arms on the wheel, legs) and 18-inch wheels. Local axes as the simulation's:
/// forward is −Z, right +X, up +Y, so the yaw is the heading itself.
@MainActor
final class CarEntity {
    let root = Entity()
    /// Where pieces that break off go (nil: a ghost's never do).
    var debris: Debris?
    private var frontPivots: [Entity] = []
    /// Every wheel's pivot (order of `carWheels`): lowered and squashed when flat.
    private var wheelPivots: [Entity] = []
    private var spinners: [Entity] = []
    /// The front wing's halves (left, right), hinged at the nose; the rear wing on its axle.
    private var frontWing: [Entity] = []
    private let rearWing = Entity()
    /// The damage drawn now, and the last one seen (for the shards of a new hit).
    private var look = CarDamageLook.intact
    private var lastDamage: CarDamage?
    /// What the shards are made of: this car's paint and carbon.
    private var shardMaterials: [any RealityKit.Material] = []
    /// The sidewalls' bands (one per wheel) and the compound they show.
    private var bands: [ModelEntity] = []
    private var bandCompound = TyreCompound.medium
    /// The steering wheel's rim (turned with the steering).
    private let steeringWheel = Entity()
    private var spin: Float = 0

    static let wheelRadius: Float = 0.36
    /// Visual front-wheel angle at full lock (rad).
    private static let maxWheelSteer: Float = 0.4
    /// Steering-wheel turn at full lock (rad).
    private static let maxWheelTurn: Float = 1.2
    /// Body roll per radian of slip (~2° at full lock).
    private static let rollPerSlip: Float = 0.1

    init(livery: Livery) {
        let paint = Self.paint(livery.body)
        let accent = Self.paint(livery.accent)
        let carbon = Self.carbon()
        let bodies = Self.bodies
        for (mesh, material) in [
            (bodies.spine, paint), (bodies.sidepods, paint), (bodies.leftWall, paint),
            (bodies.rightWall, paint), (bodies.floor, Self.carbon(roughness: 0.75)),
        ] {
            root.addChild(ModelEntity(mesh: mesh, materials: [material]))
        }
        var dark = PhysicallyBasedMaterial()
        dark.baseColor = .init(tint: .init(white: 0.01, alpha: 1))
        dark.roughness = 0.95

        shardMaterials = [paint, carbon, carbon, accent]
        // (size, position, corner radius, material)
        let parts: [(SIMD3<Float>, SIMD3<Float>, Float, PhysicallyBasedMaterial)] = [
            (SIMD3(0.16, 0.08, 0.2), SIMD3(0, 0.27, -2.82), 0.035, accent),  // nose tip
            // Sidepod inlets.
            (SIMD3(0.28, 0.16, 0.05), SIMD3(-0.6, 0.53, -0.6), 0.04, dark),
            (SIMD3(0.28, 0.16, 0.05), SIMD3(0.6, 0.53, -0.6), 0.04, dark),
            // Airbox over the driver's head, its inlet and the T-cam on top.
            (SIMD3(0.26, 0.15, 0.04), SIMD3(0, 0.93, 0.3), 0.05, dark),
            (SIMD3(0.2, 0.035, 0.06), SIMD3(0, 1.065, 0.44), 0.012, carbon),
            (SIMD3(0.02, 0.18, 0.75), SIMD3(0, 0.9, 1.1), 0.008, paint),  // shark fin
            // Rear wing's pylon and the crash structure under the gearbox, carrying the rain light.
            (SIMD3(0.05, 0.55, 0.14), SIMD3(0, 0.74, 1.98), 0.02, carbon),
            (SIMD3(0.13, 0.12, 0.42), SIMD3(0, 0.33, 2.1), 0.04, carbon),
            // The floor's edges, turned up.
            (SIMD3(0.015, 0.06, 1.3), SIMD3(-0.88, 0.11, 0.1), 0.006, carbon),
            (SIMD3(0.015, 0.06, 1.3), SIMD3(0.88, 0.11, 0.1), 0.006, carbon),
        ]
        for (size, position, radius, material) in parts {
            root.addChild(Self.box(size, position, radius, material))
        }
        // The rain light under the gearbox (lit in the rain and at night, X.6).
        var red = Self.glow(SIMD3(1, 0.08, 0.05))
        red.emissiveIntensity = 0.6
        let rainLight = ModelEntity(mesh: .generateCylinder(height: 0.04, radius: 0.055), materials: [red])
        rainLight.position = SIMD3(0, 0.33, 2.32)
        rainLight.orientation = simd_quatf(angle: .pi / 2, axis: SIMD3(1, 0, 0))
        root.addChild(rainLight)
        // Thin pylons from the nose down to the front wing.
        for side: Float in [-1, 1] {
            root.addChild(Self.bar(from: SIMD3(side * 0.07, 0.27, -2.45), to: SIMD3(side * 0.12, 0.13, -2.62), width: 0.025, height: 0.06, carbon))
        }

        addFrontWing(paint: paint, accent: accent, carbon: carbon)
        addRearWing(paint: paint, carbon: carbon, light: red)
        addDiffuser(carbon)
        addSuspension(carbon)
        addCockpit(livery: livery, carbon: carbon)
        addHalo()
        addMirrors(paint: paint)
        addWheels()
    }

    // MARK: Lofted bodies (one set for every car)

    private struct Bodies {
        let spine: MeshResource
        let sidepods: MeshResource
        let leftWall: MeshResource
        let rightWall: MeshResource
        let floor: MeshResource
    }

    private static var cachedBodies: Bodies?

    private static var bodies: Bodies {
        if let cachedBodies { return cachedBodies }
        typealias S = LoftStation
        // The spine: nose → bulkhead (top 0.76) → the open cockpit (down to 0.45) → the airbox
        // behind the head (1.02) → the engine cover → the gearbox.
        let spine: [S] = [
            S(z: -2.86, width: 0.14, height: 0.09, centerY: 0.27),
            S(z: -2.55, width: 0.24, height: 0.15, centerY: 0.31),
            S(z: -2.0, width: 0.36, height: 0.24, centerY: 0.39),
            S(z: -1.4, width: 0.52, height: 0.36, centerY: 0.47),
            S(z: -0.9, width: 0.74, height: 0.46, centerY: 0.53),
            S(z: -0.68, width: 0.82, height: 0.48, centerY: 0.52),
            S(z: -0.56, width: 0.82, height: 0.24, centerY: 0.33),
            S(z: 0.1, width: 0.82, height: 0.24, centerY: 0.33),
            S(z: 0.24, width: 0.8, height: 0.58, centerY: 0.5),
            S(z: 0.42, width: 0.6, height: 0.82, centerY: 0.62),
            S(z: 0.75, width: 0.52, height: 0.68, centerY: 0.58),
            S(z: 1.2, width: 0.42, height: 0.5, centerY: 0.52),
            S(z: 1.65, width: 0.32, height: 0.34, centerY: 0.44),
            S(z: 2.1, width: 0.22, height: 0.22, centerY: 0.37),
        ]
        // The sidepods: wide at the inlets, narrowing and dropping to the rear (the coke bottle).
        let sidepods: [S] = [
            S(z: -0.72, width: 0.9, height: 0.2, centerY: 0.44, exponent: 3),
            S(z: -0.6, width: 1.52, height: 0.4, centerY: 0.46, exponent: 3.2),
            S(z: -0.1, width: 1.62, height: 0.42, centerY: 0.44, exponent: 3.2),
            S(z: 0.5, width: 1.42, height: 0.34, centerY: 0.38, exponent: 3),
            S(z: 1.0, width: 0.98, height: 0.26, centerY: 0.31, exponent: 3),
            S(z: 1.55, width: 0.5, height: 0.16, centerY: 0.25, exponent: 3),
        ]
        // The cockpit's side walls, up to the driver's shoulders, open between them.
        func wall(_ x: Float) -> [S] {
            [
                S(z: -0.66, width: 0.08, height: 0.3, centerY: 0.6, centerX: x * 0.96),
                S(z: -0.5, width: 0.13, height: 0.34, centerY: 0.6, centerX: x),
                S(z: 0.12, width: 0.13, height: 0.34, centerY: 0.6, centerX: x),
                S(z: 0.3, width: 0.1, height: 0.36, centerY: 0.62, centerX: x * 0.9),
            ]
        }
        // The floor: wide between the wheels, narrower past the rear ones.
        let floor: [S] = [
            S(z: -1.05, width: 1.1, height: 0.035, centerY: 0.075, exponent: 8),
            S(z: -0.7, width: 1.76, height: 0.035, centerY: 0.075, exponent: 8),
            S(z: 0.85, width: 1.76, height: 0.035, centerY: 0.075, exponent: 8),
            S(z: 1.1, width: 1.3, height: 0.035, centerY: 0.075, exponent: 8),
            S(z: 1.9, width: 1.0, height: 0.035, centerY: 0.075, exponent: 8),
        ]
        // A failed loft is a programming error in the stations above, never a runtime case.
        let made = Bodies(
            spine: try! Loft.mesh(spine),
            sidepods: try! Loft.mesh(sidepods),
            leftWall: try! Loft.mesh(wall(-0.36), rows: 24, around: 24),
            rightWall: try! Loft.mesh(wall(0.36), rows: 24, around: 24),
            floor: try! Loft.mesh(floor, rows: 30, around: 32))
        cachedBodies = made
        return made
    }

    // MARK: Parts

    /// A wing element across the car: at each station along its span (`x`), its chord, thickness,
    /// height and fore-aft centre (`z`); an elliptical section, so it reads as an aerofoil. Lofted
    /// along the span, then turned so the span runs across the car.
    private static func wingElement(_ stations: [(x: Float, chord: Float, thick: Float, y: Float, z: Float)]) -> ModelEntity
    {
        // Lofted along z (= the span) with the chord across x: turned +90° about Y, the loft's z
        // becomes the car's x and its x the car's −z.
        let mesh = try! Loft.mesh(
            stations.map { LoftStation(z: $0.x, width: $0.chord, height: $0.thick, centerY: $0.y, centerX: -$0.z, exponent: 2.2) },
            rows: 24, around: 20)
        let entity = ModelEntity(mesh: mesh, materials: [])
        entity.orientation = simd_quatf(angle: .pi / 2, axis: SIMD3(0, 1, 0))
        return entity
    }

    /// The front wing, in two halves hinged at the nose (each can droop and break off): a main
    /// plane and three flaps sweeping across, each element's height curving along the span, and
    /// a thin endplate.
    private func addFrontWing(paint: PhysicallyBasedMaterial, accent: PhysicallyBasedMaterial, carbon: PhysicallyBasedMaterial) {
        for side: Float in [-1, 1] {
            let hinge = SIMD3<Float>(side * 0.06, 0.12, -2.65)
            let half = Entity()
            half.position = hinge
            // Span stations from the nose out to the endplate (|x|), ordered along x for the loft.
            let span: [Float] = [0.07, 0.3, 0.6, 0.85, 0.97]
            func element(chord: Float, thick: Float, z: Float, heights: [Float], _ material: PhysicallyBasedMaterial) {
                var stations = zip(span, heights).map { (x: side * $0.0, chord: chord, thick: thick, y: $0.1, z: z) }
                if side < 0 { stations.reverse() }
                let part = Self.wingElement(stations)
                part.model?.materials = [material]
                part.position = -hinge
                half.addChild(part)
            }
            element(chord: 0.42, thick: 0.032, z: -2.74, heights: [0.105, 0.1, 0.095, 0.095, 0.1], carbon)
            element(chord: 0.2, thick: 0.022, z: -2.58, heights: [0.2, 0.17, 0.15, 0.155, 0.17], paint)
            element(chord: 0.16, thick: 0.02, z: -2.48, heights: [0.26, 0.22, 0.2, 0.205, 0.225], accent)
            element(chord: 0.12, thick: 0.018, z: -2.4, heights: [0.31, 0.27, 0.245, 0.25, 0.275], paint)
            // The endplate: carbon, its top edge in the paint.
            for (size, position, material) in [
                (SIMD3<Float>(0.022, 0.26, 0.56), SIMD3<Float>(side * 0.985, 0.19, -2.62), carbon),
                (SIMD3<Float>(0.026, 0.03, 0.4), SIMD3<Float>(side * 0.985, 0.32, -2.6), paint),
            ] {
                half.addChild(Self.box(size, position - hinge, 0.01, material))
            }
            root.addChild(half)
            frontWing.append(half)
        }
    }

    /// The rear wing on its axle (it tilts and breaks off as one): the endplates with their lights,
    /// the main plane and the flap, lofted with a slight spoon, the DRS pod between them. The beam
    /// wing below stays on the car.
    private func addRearWing(paint: PhysicallyBasedMaterial, carbon: PhysicallyBasedMaterial, light: PhysicallyBasedMaterial) {
        let axle = SIMD3<Float>(0, 1.0, 1.95)
        rearWing.position = axle
        let span: [Float] = [-0.69, -0.35, 0, 0.35, 0.69]
        for (chord, thick, z, heights, material) in [
            (Float(0.42), Float(0.055), Float(1.97), [Float(0.99), 1.005, 1.015, 1.005, 0.99], carbon),
            (0.24, 0.035, 1.84, [1.165, 1.175, 1.18, 1.175, 1.165], paint),
        ] {
            let part = Self.wingElement(zip(span, heights).map { (x: $0.0, chord: chord, thick: thick, y: $0.1, z: z) })
            part.model?.materials = [material]
            part.position = -axle
            rearWing.addChild(part)
        }
        for side: Float in [-1, 1] {
            rearWing.addChild(Self.box(SIMD3(0.022, 0.52, 0.5), SIMD3(side * 0.7, 1.0, 1.95) - axle, 0.1, carbon))
            rearWing.addChild(Self.box(SIMD3(0.02, 0.22, 0.02), SIMD3(side * 0.7, 0.72, 2.36) - axle, 0.008, light))
        }
        rearWing.addChild(Self.box(SIMD3(0.07, 0.12, 0.12), SIMD3(0, 1.09, 1.9) - axle, 0.02, carbon))  // DRS pod
        root.addChild(rearWing)
        // The beam wing, low between the rear wheels.
        let beam = Self.wingElement(
            [-0.5, 0, 0.5].map { (x: $0, chord: Float(0.22), thick: Float(0.035), y: Float(0.52) + (abs($0) < 0.1 ? 0.01 : 0), z: Float(2.06)) })
        beam.model?.materials = [carbon]
        root.addChild(beam)
    }

    /// The diffuser: the floor's tail ramping up behind the rear axle, split by strakes.
    private func addDiffuser(_ carbon: PhysicallyBasedMaterial) {
        let ramp = simd_quatf(angle: -0.26, axis: SIMD3(1, 0, 0))
        let parts: [(SIMD3<Float>, SIMD3<Float>)] = [
            (SIMD3(1.0, 0.02, 0.62), SIMD3(0, 0.17, 1.82)),
            (SIMD3(0.014, 0.16, 0.56), SIMD3(-0.5, 0.24, 1.84)),
            (SIMD3(0.014, 0.16, 0.56), SIMD3(0.5, 0.24, 1.84)),
            (SIMD3(0.012, 0.12, 0.5), SIMD3(-0.3, 0.23, 1.84)),
            (SIMD3(0.012, 0.12, 0.5), SIMD3(0.3, 0.23, 1.84)),
            (SIMD3(0.012, 0.12, 0.5), SIMD3(-0.12, 0.23, 1.84)),
            (SIMD3(0.012, 0.12, 0.5), SIMD3(0.12, 0.23, 1.84)),
        ]
        for (size, position) in parts {
            let part = Self.box(size, position, 0.005, carbon)
            part.orientation = ramp
            root.addChild(part)
        }
    }

    /// Wishbones and push rods from the chassis to each wheel's hub (fixed: the wheels steer inside).
    private func addSuspension(_ carbon: PhysicallyBasedMaterial) {
        for wheel in carWheels {
            let side = Float(wheel.side) > 0 ? Float(1) : -1
            let z = Float(-wheel.ahead)
            let inner: Float = wheel.ahead > 0 ? 0.3 : 0.2
            let hub = SIMD3<Float>(side * 0.74, 0, z)
            for (y, hubY) in [(Float(0.55), Float(0.5)), (Float(0.3), Float(0.22))] {
                for dz: Float in [-0.22, 0.22] {
                    root.addChild(Self.bar(from: SIMD3(side * inner, y, z + dz), to: hub + SIMD3(0, hubY, 0), width: 0.03, height: 0.02, carbon))
                }
            }
            root.addChild(Self.bar(from: SIMD3(side * inner, 0.6, z + 0.1), to: hub + SIMD3(0, 0.25, 0), width: 0.025, height: 0.025, carbon))
        }
    }

    /// The driver in the open cockpit: helmet, torso, arms to the steering wheel's grips, legs
    /// running forward under the bulkhead; the wheel (display, shift lights) turned with the steering.
    private func addCockpit(livery: Livery, carbon: PhysicallyBasedMaterial) {
        var suit = PhysicallyBasedMaterial()
        // The race suit: the team's colour, darker and matte, so it reads apart from the bodywork.
        suit.baseColor = .init(tint: Self.color(livery.body * 0.55))
        suit.roughness = 0.75
        var glove = PhysicallyBasedMaterial()
        glove.baseColor = .init(tint: .init(white: 0.06, alpha: 1))
        glove.roughness = 0.8
        var seat = PhysicallyBasedMaterial()
        seat.baseColor = .init(tint: .init(white: 0.02, alpha: 1))
        seat.roughness = 0.9

        root.addChild(Self.box(SIMD3(0.46, 0.04, 0.55), SIMD3(0, 0.46, 0.0), 0.02, seat))
        // Legs: from the hips forward and slightly up, under the bulkhead to the pedals.
        for side: Float in [-1, 1] {
            root.addChild(Self.bar(from: SIMD3(side * 0.1, 0.53, 0.02), to: SIMD3(side * 0.12, 0.62, -0.5), width: 0.15, height: 0.15, suit))
            root.addChild(Self.bar(from: SIMD3(side * 0.12, 0.62, -0.5), to: SIMD3(side * 0.1, 0.52, -1.2), width: 0.13, height: 0.13, suit))
        }
        // Torso, reclined, and the arms reaching the grips.
        root.addChild(Self.bar(from: SIMD3(0, 0.52, 0.12), to: SIMD3(0, 0.76, 0.0), width: 0.36, height: 0.2, suit))
        for side: Float in [-1, 1] {
            let shoulder = SIMD3<Float>(side * 0.19, 0.74, 0.0)
            let elbow = SIMD3<Float>(side * 0.24, 0.7, -0.26)
            let grip = SIMD3<Float>(side * 0.12, 0.78, -0.47)
            root.addChild(Self.bar(from: shoulder, to: elbow, width: 0.07, height: 0.07, suit))
            root.addChild(Self.bar(from: elbow, to: grip, width: 0.06, height: 0.06, suit))
            let hand = ModelEntity(mesh: .generateSphere(radius: 0.045), materials: [glove])
            hand.position = grip
            root.addChild(hand)
        }

        var helmet = PhysicallyBasedMaterial()
        helmet.baseColor = .init(tint: .init(red: 0.95, green: 0.78, blue: 0.05, alpha: 1))
        helmet.roughness = 0.2
        helmet.clearcoat = 1.0
        let head = ModelEntity(mesh: .generateSphere(radius: 0.14), materials: [helmet])
        head.position = SIMD3(0, 0.88, 0.04)
        root.addChild(head)
        var visor = PhysicallyBasedMaterial()
        visor.baseColor = .init(tint: .init(white: 0.05, alpha: 1))
        visor.metallic = 1.0
        visor.roughness = 0.1
        root.addChild(Self.box(SIMD3(0.2, 0.06, 0.06), SIMD3(0, 0.89, -0.08), 0.025, visor))

        // The wheel faces the driver, its top leaning away; the rim turns round the column.
        let mount = Entity()
        mount.position = SIMD3(0, 0.79, -0.5)
        mount.orientation = simd_quatf(angle: -0.35, axis: SIMD3(1, 0, 0))
        mount.addChild(steeringWheel)
        root.addChild(mount)
        let pieces: [(SIMD3<Float>, SIMD3<Float>, PhysicallyBasedMaterial)] = [
            (SIMD3(0.2, 0.1, 0.035), SIMD3(0, 0, 0), carbon),
            (SIMD3(0.045, 0.13, 0.05), SIMD3(-0.12, -0.005, 0), glove),
            (SIMD3(0.045, 0.13, 0.05), SIMD3(0.12, -0.005, 0), glove),
            (SIMD3(0.08, 0.04, 0.006), SIMD3(0, 0.005, 0.02), Self.glow(SIMD3(0.15, 0.55, 0.9))),
        ]
        for (size, position, material) in pieces {
            steeringWheel.addChild(Self.box(size, position, 0.012, material))
        }
        // Shift lights across the top: green, red, blue.
        let lights: [SIMD3<Float>] = [SIMD3(0.1, 0.9, 0.2), SIMD3(0.1, 0.9, 0.2), SIMD3(0.95, 0.1, 0.1), SIMD3(0.95, 0.1, 0.1), SIMD3(0.2, 0.3, 1)]
        for (i, colour) in lights.enumerated() {
            let x = (Float(i) - 2) * 0.017
            steeringWheel.addChild(Self.box(SIMD3(0.011, 0.008, 0.006), SIMD3(x, 0.038, 0.02), 0.002, Self.glow(colour)))
        }
    }

    /// The halo: a titanium hoop over the driver's head, from its two mounts behind the cockpit
    /// round to the centre pillar ahead of it, which drops onto the bulkhead.
    private func addHalo() {
        var titanium = PhysicallyBasedMaterial()
        titanium.baseColor = .init(tint: .init(white: 0.03, alpha: 1))
        titanium.metallic = 0.6
        titanium.roughness = 0.3
        titanium.clearcoat = 0.8
        // Round the hoop: θ = 0 ahead, ±125° at the mounts; it rises towards the front.
        func point(_ degrees: Float) -> SIMD3<Float> {
            let theta = degrees * .pi / 180
            return SIMD3(0.36 * sin(theta), 0.86 + 0.14 * cos(theta * 0.75), -0.3 - 0.4 * cos(theta))
        }
        var previous = point(-125)
        for step in 1...20 {
            let next = point(-125 + 250 * Float(step) / 20)
            root.addChild(Self.bar(from: previous, to: next, width: 0.07, height: 0.045, titanium))
            previous = next
        }
        let front = point(0)
        root.addChild(Self.bar(from: front, to: SIMD3(0, 0.72, front.z - 0.18), width: 0.06, height: 0.05, titanium))
        for side: Float in [-1, 1] {
            let end = point(side * 125)
            root.addChild(Self.bar(from: end, to: SIMD3(end.x + side * 0.05, 0.74, end.z + 0.05), width: 0.06, height: 0.05, titanium))
        }
    }

    /// The two wing mirrors on stalks over the sidepods, glass facing back.
    private func addMirrors(paint: PhysicallyBasedMaterial) {
        var glass = PhysicallyBasedMaterial()
        glass.baseColor = .init(tint: .init(white: 0.6, alpha: 1))
        glass.metallic = 1.0
        glass.roughness = 0.05
        for side: Float in [-1, 1] {
            let x = side * 0.62
            root.addChild(Self.bar(from: SIMD3(side * 0.42, 0.6, -0.45), to: SIMD3(x, 0.84, -0.5), width: 0.025, height: 0.025, Self.carbon()))
            root.addChild(Self.box(SIMD3(0.22, 0.085, 0.09), SIMD3(x, 0.86, -0.5), 0.03, paint))
            root.addChild(Self.box(SIMD3(0.19, 0.06, 0.005), SIMD3(x, 0.86, -0.452), 0.01, glass))
        }
    }

    /// Four 18-inch wheels at the simulation's contact points: tyre, the yellow band on the
    /// sidewall, a dark wheel cover, a spoke to show them turn; the fronts steer.
    private func addWheels() {
        var rubber = PhysicallyBasedMaterial()
        rubber.baseColor = .init(tint: .init(white: 0.025, alpha: 1))
        rubber.roughness = 0.82
        var cover = PhysicallyBasedMaterial()
        cover.baseColor = .init(tint: .init(white: 0.06, alpha: 1))
        cover.metallic = 0.4
        cover.roughness = 0.35
        var band = PhysicallyBasedMaterial()
        band.baseColor = .init(tint: .init(red: 0.95, green: 0.82, blue: 0.08, alpha: 1))
        band.roughness = 0.5
        var nut = PhysicallyBasedMaterial()
        nut.baseColor = .init(tint: .init(red: 0.85, green: 0.1, blue: 0.08, alpha: 1))
        nut.roughness = 0.4

        var rim = PhysicallyBasedMaterial()
        rim.baseColor = .init(tint: .init(white: 0.55, alpha: 1))
        rim.metallic = 1.0
        rim.roughness = 0.3
        let carbon = Self.carbon()

        let r = Self.wheelRadius
        for wheel in carWheels {
            let steers = wheel.ahead > 0
            let width: Float = steers ? 0.37 : 0.45
            let side: Float = wheel.side > 0 ? 1 : -1
            let pivot = Entity()
            pivot.position = SIMD3(Float(wheel.side), r, Float(-wheel.ahead))
            let spinner = Entity()
            pivot.addChild(spinner)
            // The tyre: rounded shoulders, the sidewall dropping to the rim.
            let tyre = ModelEntity(mesh: Self.tyreMesh(width: width), materials: [rubber])
            tyre.orientation = simd_quatf(angle: .pi / 2, axis: SIMD3(0, 1, 0))
            spinner.addChild(tyre)
            // Cylinders stand on Y: turned onto X, the axle. The sidewall's band, the rim's lip,
            // its cover and the wheel nut.
            let axle = simd_quatf(angle: .pi / 2, axis: SIMD3(0, 0, 1))
            for (radius, thickness, material) in [
                (r * 0.84, width + 0.004, band), (r * 0.77, width + 0.008, rubber), (r * 0.7, width + 0.012, rim),
                (r * 0.64, width + 0.018, cover), (r * 0.1, width + 0.032, nut),
            ] {
                let part = ModelEntity(mesh: .generateCylinder(height: thickness, radius: radius), materials: [material])
                part.orientation = axle
                spinner.addChild(part)
                if radius == r * 0.84 { bands.append(part) }
            }
            let spoke = Self.box(SIMD3(width + 0.024, 0.035, r * 1.1), .zero, 0.01, cover)
            spinner.addChild(spoke)
            // The brake duct inside the wheel (it steers with it, never spins).
            pivot.addChild(Self.box(SIMD3(0.1, 0.24, 0.3), SIMD3(-side * (width / 2 + 0.06), 0, 0), 0.03, carbon))
            root.addChild(pivot)
            wheelPivots.append(pivot)
            spinners.append(spinner)
            if steers { frontPivots.append(pivot) }
        }
    }

    private static var tyreMeshes: [Float: MeshResource] = [:]

    /// A tyre `width` wide along its axle (lofted along z; the caller turns it onto x): full
    /// radius across the tread, rounded shoulders down to the sidewalls.
    private static func tyreMesh(width: Float) -> MeshResource {
        if let made = tyreMeshes[width] { return made }
        let r = wheelRadius
        let profile: [(Float, Float)] = [(-0.5, 0.86), (-0.45, 0.94), (-0.36, 0.985), (-0.2, 1), (0.2, 1), (0.36, 0.985), (0.45, 0.94), (0.5, 0.86)]
        let mesh = try! Loft.mesh(
            profile.map { LoftStation(z: $0.0 * width, width: 2 * r * $0.1, height: 2 * r * $0.1, centerY: 0, exponent: 2) },
            rows: 16, around: 56)
        tyreMeshes[width] = mesh
        return mesh
    }

    /// Time trial's ghost: see-through, casting no shadow (the component is not inherited, so
    /// every part gets it).
    func makeGhost() {
        root.components.set(OpacityComponent(opacity: 0.32))
        func noShadow(_ entity: Entity) {
            entity.components.set(DynamicLightShadowComponent(castsShadow: false))
            for child in entity.children { noShadow(child) }
        }
        noShadow(root)
    }

    func update(_ pose: CarPose, frameSeconds: Double) {
        root.position = pose.worldPosition
        // Yaw, then pitch (nose up a climb), then roll (leaning out of a slide).
        root.orientation =
            simd_quatf(angle: Float(pose.heading), axis: SIMD3(0, 1, 0))
            * simd_quatf(angle: Float(pose.pitch), axis: SIMD3(1, 0, 0))
            * simd_quatf(angle: Float(pose.slip) * Self.rollPerSlip, axis: SIMD3(0, 0, 1))
        // Steering right (+) turns the wheels clockwise seen from above (negative yaw).
        let steer = simd_quatf(angle: -Float(pose.steer) * Self.maxWheelSteer, axis: SIMD3(0, 1, 0))
        for pivot in frontPivots { pivot.orientation = steer }
        steeringWheel.orientation = simd_quatf(angle: -Float(pose.steer) * Self.maxWheelTurn, axis: SIMD3(0, 0, 1))
        spin -= Float(pose.forwardSpeed * frameSeconds) / Self.wheelRadius
        spin = spin.truncatingRemainder(dividingBy: 2 * .pi)
        let rolling = simd_quatf(angle: spin, axis: SIMD3(1, 0, 0))
        for spinner in spinners { spinner.orientation = rolling }
        showDamage(pose)
        let compound = pose.compound ?? .medium
        if compound != bandCompound {
            bandCompound = compound
            let material = Self.band(compound)
            for band in bands { band.model?.materials = [material] }
        }
    }

    // MARK: Damage

    /// Draws `pose`'s damage (the web's `CarView`): the front wing's halves droop, the rear wing
    /// tilts, tyres go flat; a part that breaks off flies away, and every hit that damages a wing
    /// throws carbon shards. Only when the damage changes.
    private func showDamage(_ pose: CarPose) {
        let damage = pose.damage ?? .none
        guard damage != lastDamage else { return }
        let previous = lastDamage
        lastDamage = damage
        let next = CarDamageLook(damage)
        let carVelocity = SIMD3<Float>(Float(pose.velocity.x), 0, Float(pose.velocity.z))
        let ground = Float(pose.y)

        // A car seen for the first time is drawn as it is: nothing flies off.
        if let previous, let debris {
            let halves = [(look.frontLeft, next.frontLeft), (look.frontRight, next.frontRight)]
            for (index, (was, now)) in halves.enumerated() where now.missing && !was.missing {
                breakOff(frontWing[index], debris, carVelocity: carVelocity, ground: ground, side: index == 0 ? -1 : 1)
            }
            if next.rearMissing && !look.rearMissing {
                breakOff(rearWing, debris, carVelocity: carVelocity, ground: ground, side: 0)
            }
            // Shards from the wing a hit damaged (at least 3% more), more for a harder hit.
            for (was, now, spot) in [
                (previous.frontWing, damage.frontWing, SIMD3<Float>(0, 0.15, -2.65)),
                (previous.rearWing, damage.rearWing, SIMD3<Float>(0, 0.9, 1.95)),
            ] where now - was >= 0.03 {
                let count = min(12, max(3, Int((now - was) * 40)))
                let origin = root.convert(position: spot, to: nil)
                debris.shards(count, at: origin, carVelocity: carVelocity, groundY: ground, materials: shardMaterials)
            }
        }

        look = next
        for (index, half) in [next.frontLeft, next.frontRight].enumerated() {
            frontWing[index].isEnabled = !half.missing
            // Turned about the car's long axis: the outer end down on either side.
            frontWing[index].orientation = simd_quatf(angle: (index == 0 ? 1 : -1) * half.droop, axis: SIMD3(0, 0, 1))
        }
        rearWing.isEnabled = !next.rearMissing
        rearWing.orientation = simd_quatf(angle: next.rearTilt, axis: SIMD3(1, 0, 0))
        // A flat tyre: up to 35% lower, squashed onto the road.
        for (pivot, flat) in zip(wheelPivots, next.flat) {
            let squash = 1 - 0.35 * flat
            pivot.scale = SIMD3(1, squash, 1)
            pivot.position.y = Self.wheelRadius * squash
        }
    }

    /// A copy of `part` thrown off the car where it is now (the part itself is hidden): with the
    /// car's speed, kicked up and out to its `side` (−1 left, 1 right, 0 straight up).
    private func breakOff(_ part: Entity, _ debris: Debris, carVelocity: SIMD3<Float>, ground: Float, side: Float) {
        let piece = part.clone(recursive: true)
        piece.isEnabled = true
        piece.setTransformMatrix(part.transformMatrix(relativeTo: nil), relativeTo: nil)
        let right = root.convert(direction: SIMD3(1, 0, 0), to: nil)
        let kick = right * side * Float.random(in: 2...4) + SIMD3(0, Float.random(in: 3...5.5), 0)
        debris.launch(piece, velocity: carVelocity * Float.random(in: 0.7...0.9) + kick, groundY: ground, rest: 0.05)
    }

    // MARK: Parts and materials

    private static func box(_ size: SIMD3<Float>, _ position: SIMD3<Float>, _ radius: Float, _ material: PhysicallyBasedMaterial) -> ModelEntity {
        let entity = ModelEntity(
            mesh: .generateBox(width: size.x, height: size.y, depth: size.z, cornerRadius: radius), materials: [material])
        entity.position = position
        return entity
    }

    /// A bar from `a` to `b` (its depth along the way, `width` × `height` across).
    private static func bar(from a: SIMD3<Float>, to b: SIMD3<Float>, width: Float, height: Float, _ material: PhysicallyBasedMaterial) -> ModelEntity {
        let length = simd_length(b - a)
        let entity = ModelEntity(
            mesh: .generateBox(width: width, height: height, depth: length + width * 0.6, cornerRadius: min(width, height) * 0.45),
            materials: [material])
        entity.look(at: b, from: (a + b) / 2, relativeTo: nil)
        return entity
    }

    private static func color(_ c: SIMD3<Float>) -> NSColor {
        NSColor(red: CGFloat(c.x), green: CGFloat(c.y), blue: CGFloat(c.z), alpha: 1)
    }

    /// A lit display or light (emissive).
    private static func glow(_ colour: SIMD3<Float>) -> PhysicallyBasedMaterial {
        var material = PhysicallyBasedMaterial()
        material.baseColor = .init(tint: color(colour))
        material.emissiveColor = .init(color: color(colour))
        material.emissiveIntensity = 2.0
        return material
    }

    /// A tyre's sidewall band: red softs, yellow mediums.
    private static func band(_ compound: TyreCompound) -> PhysicallyBasedMaterial {
        var material = PhysicallyBasedMaterial()
        material.baseColor = .init(
            tint: compound == .soft ? NSColor(red: 0.88, green: 0.04, blue: 0.02, alpha: 1)
                : NSColor(red: 0.95, green: 0.82, blue: 0.08, alpha: 1))
        material.roughness = 0.5
        return material
    }

    /// Clear-coated car paint.
    private static func paint(_ colour: SIMD3<Float>) -> PhysicallyBasedMaterial {
        var material = PhysicallyBasedMaterial()
        material.baseColor = .init(tint: color(colour))
        material.metallic = 0.35
        material.roughness = 0.32
        material.clearcoat = 1.0
        material.clearcoatRoughness = 0.04
        return material
    }

    /// Carbon fibre: near black, glossy.
    private static func carbon(roughness: Float = 0.38) -> PhysicallyBasedMaterial {
        var material = PhysicallyBasedMaterial()
        material.baseColor = .init(tint: .init(white: 0.035, alpha: 1))
        material.metallic = 0.25
        material.roughness = .init(floatLiteral: roughness)
        material.clearcoat = 0.7
        material.clearcoatRoughness = 0.1
        return material
    }
}
