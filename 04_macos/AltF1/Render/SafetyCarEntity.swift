import AltF1Core
import AppKit
import RealityKit

/// The safety car (R.3, the web's `SafetyCarView`; rebuilt after the owner's photo, R.3b): a red
/// chrome GT, lofted (`Loft`): a long bonnet, a fastback glasshouse under a red roof, wide haunches
/// flared over the wheels; black lower body, splitter, grille with chrome slats, side skirts and
/// diffuser with fins, four round tailpipes, a full-width tail-light strip; a swan-neck carbon rear
/// wing carrying the amber LED bar (flashing while it leads the field) and a slim roof bar with its
/// aerial; black multi-spoke wheels with red calipers; the white and black flames and `SAFETY CAR`
/// on the doors, yellow `SAFETY CAR` plates. No maker's badge or sponsor (real trademarks). Local
/// axes as the simulation's: forward −Z, right +X.
@MainActor
final class SafetyCarEntity {
    let root = Entity()
    private var frontPivots: [Entity] = []
    private var spinners: [Entity] = []
    private var lamps: [ModelEntity] = []
    private var lightsOn = false
    private var seconds: Float = 0
    private var spin: Float = 0

    private static let wheelRadius: Float = 0.35
    private static let wheelWidth: Float = 0.3
    /// The axles (m ahead of the centre) and the wheels' centres across.
    private static let frontAxle: Float = 1.42
    private static let rearAxle: Float = -1.36
    private static let track: Float = 0.84
    private static let red = SIMD3<Float>(0.74, 0.02, 0.03)
    private static let yellow = SIMD3<Float>(0.97, 0.76, 0.05)

    init() {
        let paint = Self.paint()
        let carbon = Self.carbon()
        let trim = Self.satinBlack()
        let chrome = Self.darkChrome()
        var glass = PhysicallyBasedMaterial()
        glass.baseColor = .init(tint: .init(red: 0.02, green: 0.03, blue: 0.04, alpha: 1))
        glass.metallic = 0.9
        glass.roughness = 0.04
        glass.clearcoat = 1.0

        addBody(paint: paint, trim: trim, glass: glass)
        addFront(trim: trim, chrome: chrome)
        addRear(carbon: carbon, trim: trim, chrome: chrome)
        addWing(carbon: carbon)
        addLivery()
        addWheels()
    }

    // MARK: The body

    private func addBody(paint: PhysicallyBasedMaterial, trim: PhysicallyBasedMaterial, glass: PhysicallyBasedMaterial) {
        /// A loft through (z, width, bottom, top) stations: the simulation's z (forward −Z).
        func loft(_ stations: [(Float, Float, Float, Float)], exponent: Float, _ material: PhysicallyBasedMaterial,
                  rows: Int = 64, around: Int = 48)
        {
            let sections = stations.map {
                LoftStation(z: $0.0, width: $0.1, height: $0.3 - $0.2, centerY: ($0.2 + $0.3) / 2, exponent: exponent)
            }
            guard let mesh = try? Loft.mesh(sections, rows: rows, around: around) else { return }
            root.addChild(ModelEntity(mesh: mesh, materials: [material]))
        }
        // The core between the wheels, dark: the wheel wells and the underside.
        loft([(-2.0, 1.36, 0.14, 0.76), (2.0, 1.36, 0.14, 0.76)], exponent: 6, trim, rows: 4, around: 24)
        // The upper body: the nose and the front bumper, over the wheels the shoulders (above the
        // arches), the rear deck, the tail and its bumper. Its bottom steps up over each wheel.
        loft(
            [
                (-2.40, 1.30, 0.26, 0.46), (-2.30, 1.74, 0.20, 0.58), (-2.10, 1.90, 0.18, 0.68),
                (-1.92, 1.95, 0.24, 0.74), (-1.84, 1.96, 0.74, 0.79), (-1.42, 1.97, 0.74, 0.83),
                (-0.95, 1.96, 0.74, 0.86), (-0.55, 1.95, 0.74, 0.89), (0.30, 1.94, 0.74, 0.93),
                (0.90, 1.98, 0.74, 0.95), (1.36, 2.00, 0.74, 0.96), (1.80, 2.00, 0.74, 0.97),
                (1.90, 1.98, 0.24, 0.97), (2.15, 1.92, 0.22, 0.95), (2.32, 1.76, 0.24, 0.90),
                (2.40, 1.50, 0.28, 0.82),
            ], exponent: 4, paint, rows: 96)
        // The doors between the arches, down to the sills.
        loft([(-1.0, 1.93, 0.17, 0.78), (-0.3, 1.94, 0.15, 0.80), (0.5, 1.94, 0.15, 0.80), (0.95, 1.95, 0.17, 0.78)],
             exponent: 6, paint, rows: 12)
        // The arches, flared over each wheel (the rear haunches wider): their lower edge round it.
        for (axle, flare, top) in [(-Self.frontAxle, Float(2.04), Float(0.80)), (-Self.rearAxle, 2.09, 0.93)] {
            let arch: Float = 0.44
            let stations = [Float(-0.48), -0.44, -0.38, -0.28, -0.14, 0, 0.14, 0.28, 0.38, 0.44, 0.48].map { dz in
                let bottom = 0.35 + (max(arch * arch - dz * dz, 0)).squareRoot()
                let width = 1.95 + (flare - 1.95) * max(0, 1 - pow(abs(dz) / 0.48, 3))
                return (axle + dz, width, abs(dz) >= 0.48 ? Float(0.3) : bottom, top)
            }
            loft(stations, exponent: 5, paint, rows: 40)
        }
        // The glasshouse: the windscreen from the bonnet, the roof, the fastback down to the deck.
        let cabin: [(Float, Float, Float, Float)] = [
            (-0.66, 1.50, 0.04, 0.89), (-0.25, 1.42, 0.72, 0.90), (0.30, 1.38, 0.80, 0.90),
            (0.90, 1.34, 0.66, 0.92), (1.50, 1.36, 0.24, 0.92), (1.85, 1.40, 0.04, 0.95),
        ]
        func cabinLoft(_ stations: [(Float, Float, Float, Float)], _ material: PhysicallyBasedMaterial) {
            let sections = stations.map {
                LoftStation(z: $0.0, width: $0.1, height: $0.2, centerY: $0.3, exponent: 2.6)
            }
            guard let mesh = try? Loft.mesh(sections, rows: 48, around: 48) else { return }
            root.addChild(ModelEntity(mesh: mesh, materials: [material]))
        }
        cabinLoft(cabin, glass)
        // The red roof: narrower and a little higher than the glass, so the glass shows round it
        // (the side windows) and ahead of and behind it (the windscreen, the rear window).
        cabinLoft(
            [(-0.45, 1.12, 0.30, 0.90), (-0.22, 1.12, 0.79, 0.90), (0.30, 1.08, 0.88, 0.90),
             (0.90, 1.05, 0.74, 0.92), (1.22, 1.08, 0.30, 0.92)], paint)
        // Black side skirts, a vent behind each front wheel, the bonnet's vents, mirrors on stalks.
        for side: Float in [-1, 1] {
            root.addChild(Self.box(SIMD3(0.07, 0.09, 1.96), SIMD3(side * 0.975, 0.2, 0), 0.02, trim))
            root.addChild(Self.box(SIMD3(0.02, 0.13, 0.26), SIMD3(side * 0.973, 0.56, -0.84), 0.01, trim))
            root.addChild(Self.box(SIMD3(0.26, 0.02, 0.62), SIMD3(side * 0.38, 0.852, -1.25), 0.008, trim))
            root.addChild(Self.box(SIMD3(0.13, 0.03, 0.05), SIMD3(side * 0.93, 0.93, -0.42), 0.01, trim))
            root.addChild(Self.box(SIMD3(0.2, 0.11, 0.09), SIMD3(side * 1.04, 0.97, -0.45), 0.03, paint))
            root.addChild(Self.box(SIMD3(0.17, 0.08, 0.012), SIMD3(side * 1.04, 0.97, -0.4), 0.01, glass))
        }
        // The flat black floor.
        root.addChild(Self.box(SIMD3(1.8, 0.04, 4.3), SIMD3(0, 0.15, 0), 0.01, trim))
    }

    private func addFront(trim: PhysicallyBasedMaterial, chrome: PhysicallyBasedMaterial) {
        // The big grille with its vertical chrome slats, the intakes, the splitter.
        root.addChild(Self.box(SIMD3(0.98, 0.22, 0.08), SIMD3(0, 0.4, -2.37), 0.04, trim))
        for i in 0..<11 {
            let x = (Float(i) - 5) * 0.08
            root.addChild(Self.box(SIMD3(0.012, 0.19, 0.03), SIMD3(x, 0.4, -2.415), 0.004, chrome))
        }
        for side: Float in [-1, 1] {
            root.addChild(Self.box(SIMD3(0.36, 0.13, 0.12), SIMD3(side * 0.66, 0.3, -2.27), 0.03, trim))
            // The slim headlights, swept back along the wings.
            let head = Self.box(SIMD3(0.4, 0.045, 0.2), SIMD3(side * 0.64, 0.6, -2.14), 0.02, Self.glow(SIMD3(0.92, 0.95, 1), 3))
            head.orientation = simd_quatf(angle: side * 0.28, axis: SIMD3(0, 1, 0))
            root.addChild(head)
        }
        root.addChild(Self.box(SIMD3(1.92, 0.03, 0.28), SIMD3(0, 0.17, -2.26), 0.01, trim))
    }

    private func addRear(carbon: PhysicallyBasedMaterial, trim: PhysicallyBasedMaterial, chrome: PhysicallyBasedMaterial) {
        // The full-width tail-light strip and the lamps at its ends.
        let tail = Self.glow(SIMD3(1, 0.06, 0.03), 2.5)
        root.addChild(Self.box(SIMD3(1.16, 0.03, 0.04), SIMD3(0, 0.72, 2.405), 0.01, tail))
        for side: Float in [-1, 1] {
            root.addChild(Self.box(SIMD3(0.34, 0.06, 0.08), SIMD3(side * 0.6, 0.74, 2.36), 0.02, tail))
        }
        // The black diffuser with its fins; the four round tailpipes in pairs.
        root.addChild(Self.box(SIMD3(1.52, 0.2, 0.3), SIMD3(0, 0.23, 2.3), 0.03, carbon))
        for i in 0..<5 {
            let x = (Float(i) - 2) * 0.16
            root.addChild(Self.box(SIMD3(0.018, 0.17, 0.34), SIMD3(x, 0.22, 2.33), 0.005, carbon))
        }
        let pipe = simd_quatf(angle: .pi / 2, axis: SIMD3(1, 0, 0))
        for x: Float in [-0.62, -0.47, 0.47, 0.62] {
            let tip = ModelEntity(mesh: .generateCylinder(height: 0.14, radius: 0.048), materials: [chrome])
            tip.orientation = pipe
            tip.position = SIMD3(x, 0.24, 2.4)
            root.addChild(tip)
            let bore = ModelEntity(mesh: .generateCylinder(height: 0.01, radius: 0.038), materials: [trim])
            bore.orientation = pipe
            bore.position = SIMD3(x, 0.24, 2.473)
            root.addChild(bore)
        }
    }

    /// The swan-neck rear wing (hung from above by two necks rising off the deck), its LED bar along
    /// the top flashing left and right; the slim roof bar with its two lamps and its aerial.
    private func addWing(carbon: PhysicallyBasedMaterial) {
        let plane = Self.box(SIMD3(1.9, 0.035, 0.34), SIMD3(0, 1.3, 2.17), 0.012, carbon)
        plane.orientation = simd_quatf(angle: -0.1, axis: SIMD3(1, 0, 0))
        root.addChild(plane)
        // A gurney flap along its trailing edge.
        root.addChild(Self.box(SIMD3(1.9, 0.04, 0.012), SIMD3(0, 1.33, 2.34), 0.004, carbon))
        for side: Float in [-1, 1] {
            // Endplates.
            root.addChild(Self.box(SIMD3(0.02, 0.22, 0.46), SIMD3(side * 0.96, 1.29, 2.17), 0.01, carbon))
            // The neck: up from the deck, over and down onto the wing's top.
            let neck = Self.box(SIMD3(0.024, 0.44, 0.12), SIMD3(side * 0.42, 1.15, 1.98), 0.01, carbon)
            neck.orientation = simd_quatf(angle: -0.3, axis: SIMD3(1, 0, 0))
            root.addChild(neck)
            root.addChild(Self.box(SIMD3(0.024, 0.05, 0.24), SIMD3(side * 0.42, 1.385, 2.06), 0.01, carbon))
            root.addChild(Self.box(SIMD3(0.024, 0.08, 0.05), SIMD3(side * 0.42, 1.345, 2.16), 0.01, carbon))
            // The LED bar's half on this side (lamps: left first).
            let led = Self.box(SIMD3(0.7, 0.026, 0.05), SIMD3(side * 0.37, 1.335, 2.05), 0.01, Self.lamp(on: false))
            led.orientation = simd_quatf(angle: -0.1, axis: SIMD3(1, 0, 0))
            root.addChild(led)
            lamps.append(led)
        }
        // The roof bar: black, two small amber lamps (flashing with the wing's), an aerial.
        root.addChild(Self.box(SIMD3(0.56, 0.05, 0.12), SIMD3(0, 1.335, 0.72), 0.02, carbon))
        for side: Float in [-1, 1] {
            let lamp = Self.box(SIMD3(0.18, 0.045, 0.1), SIMD3(side * 0.17, 1.37, 0.72), 0.015, Self.lamp(on: false))
            root.addChild(lamp)
            lamps.append(lamp)
        }
        root.addChild(Self.box(SIMD3(0.012, 0.3, 0.012), SIMD3(0, 1.5, 0.78), 0.004, carbon))
    }

    /// The flames and `SAFETY CAR` on each door; yellow plates front and back.
    private func addLivery() {
        for side: Float in [-1, 1] {
            // A plane faces +Z: turned to face out, its +X points forward on the right, back on the
            // left, so the flames are drawn sweeping back on each.
            guard let door = Self.decal(width: 1.9, height: 0.34, kind: .door(frontOnRight: side > 0)) else { continue }
            door.position = SIMD3(side * 0.978, 0.49, 0.0)
            door.orientation = simd_quatf(angle: side * .pi / 2, axis: SIMD3(0, 1, 0))
            root.addChild(door)
        }
        guard let plate = Self.decal(width: 0.52, height: 0.11, kind: .plate) else { return }
        let front = plate.clone(recursive: true)
        front.position = SIMD3(0, 0.4, -2.42)
        front.orientation = simd_quatf(angle: .pi, axis: SIMD3(0, 1, 0))
        root.addChild(front)
        let back = plate.clone(recursive: true)
        back.position = SIMD3(0, 0.5, 2.405)
        root.addChild(back)
    }

    /// Four wheels: a rounded tyre, a black ten-spoke rim on a dark barrel, the red caliper (not
    /// turning); the fronts steer.
    private func addWheels() {
        var rubber = PhysicallyBasedMaterial()
        rubber.baseColor = .init(tint: .init(white: 0.03, alpha: 1))
        rubber.roughness = 0.9
        // Gloss black gunmetal: the spokes catch the light over the dark barrel behind them.
        var rim = PhysicallyBasedMaterial()
        rim.baseColor = .init(tint: .init(white: 0.1, alpha: 1))
        rim.metallic = 0.9
        rim.roughness = 0.22
        rim.clearcoat = 0.8
        var barrel = rim
        barrel.baseColor = .init(tint: .init(white: 0.012, alpha: 1))
        barrel.roughness = 0.5
        var caliper = PhysicallyBasedMaterial()
        caliper.baseColor = .init(tint: .init(red: 0.8, green: 0.04, blue: 0.03, alpha: 1))
        caliper.roughness = 0.35
        caliper.clearcoat = 1.0
        let r = Self.wheelRadius
        let w = Self.wheelWidth
        let axle = simd_quatf(angle: .pi / 2, axis: SIMD3(0, 0, 1))
        let tyreMesh = Self.tyreMesh()
        for (ahead, side) in [(Self.frontAxle, Float(-1)), (Self.frontAxle, 1), (Self.rearAxle, -1), (Self.rearAxle, 1)] {
            let pivot = Entity()
            pivot.position = SIMD3(side * Self.track, r, -ahead)
            let spinner = Entity()
            pivot.addChild(spinner)
            if let tyreMesh {
                let tyre = ModelEntity(mesh: tyreMesh, materials: [rubber])
                tyre.orientation = simd_quatf(angle: .pi / 2, axis: SIMD3(0, 1, 0))
                spinner.addChild(tyre)
            }
            let inner = ModelEntity(mesh: .generateCylinder(height: w - 0.02, radius: r * 0.74), materials: [barrel])
            inner.orientation = axle
            spinner.addChild(inner)
            // The spokes, just proud of the tyre's sidewall, and the hub.
            let face = side * (w / 2 + 0.014)
            for k in 0..<10 {
                let angle = Float(k) / 10 * 2 * .pi
                let spoke = Self.box(SIMD3(0.024, 0.034, r * 0.62), .zero, 0.008, rim)
                let turn = simd_quatf(angle: angle, axis: SIMD3(1, 0, 0))
                spoke.orientation = turn
                spoke.position = SIMD3(face, 0, 0) + turn.act(SIMD3(0, 0, r * 0.38))
                spinner.addChild(spoke)
            }
            let hub = ModelEntity(mesh: .generateCylinder(height: 0.04, radius: 0.06), materials: [rim])
            hub.orientation = axle
            hub.position = SIMD3(face, 0, 0)
            spinner.addChild(hub)
            // The caliper behind the spokes, gripping the disc at the back of the wheel.
            let grip = Self.box(SIMD3(0.07, 0.17, 0.09), SIMD3(side * 0.03, 0.06, r * 0.5), 0.02, caliper)
            grip.orientation = simd_quatf(angle: 0.5, axis: SIMD3(1, 0, 0))
            pivot.addChild(grip)
            root.addChild(pivot)
            spinners.append(spinner)
            if ahead > 0 { frontPivots.append(pivot) }
        }
    }

    // MARK: Lights and motion

    /// Its light bars on (leading the field) or off (its last lap, going in).
    func setLights(_ on: Bool) {
        guard on != lightsOn else { return }
        lightsOn = on
        if !on { for lamp in lamps { lamp.model?.materials = [Self.lamp(on: false)] } }
    }

    func update(_ pose: CarPose, frameSeconds: Double) {
        root.position = pose.worldPosition
        root.orientation =
            simd_quatf(angle: Float(pose.heading), axis: SIMD3(0, 1, 0))
            * simd_quatf(angle: Float(pose.pitch), axis: SIMD3(1, 0, 0))
        let steer = simd_quatf(angle: -Float(pose.steer) * 0.4, axis: SIMD3(0, 1, 0))
        for pivot in frontPivots { pivot.orientation = steer }
        spin -= Float(pose.forwardSpeed * frameSeconds) / Self.wheelRadius
        spin = spin.truncatingRemainder(dividingBy: 2 * .pi)
        let rolling = simd_quatf(angle: spin, axis: SIMD3(1, 0, 0))
        for spinner in spinners { spinner.orientation = rolling }
        guard lightsOn else { return }
        // Left, right, left…: four flashes a second each (the lamps alternate left, right).
        let before = Int(seconds * 8)
        seconds += Float(frameSeconds)
        let now = Int(seconds * 8)
        guard now != before || frameSeconds == 0 else { return }
        for (i, lamp) in lamps.enumerated() { lamp.model?.materials = [Self.lamp(on: (now + i) % 2 == 0)] }
    }

    // MARK: Materials and parts

    /// Red chrome under a deep clear coat, as the photo's wrap.
    private static func paint() -> PhysicallyBasedMaterial {
        var material = PhysicallyBasedMaterial()
        material.baseColor = .init(tint: .init(red: CGFloat(red.x), green: CGFloat(red.y), blue: CGFloat(red.z), alpha: 1))
        material.metallic = 0.8
        material.roughness = 0.17
        material.clearcoat = 1.0
        material.clearcoatRoughness = 0.02
        return material
    }

    private static func carbon() -> PhysicallyBasedMaterial {
        var material = PhysicallyBasedMaterial()
        material.baseColor = .init(tint: .init(white: 0.03, alpha: 1))
        material.metallic = 0.3
        material.roughness = 0.32
        material.clearcoat = 0.8
        material.clearcoatRoughness = 0.08
        return material
    }

    private static func satinBlack() -> PhysicallyBasedMaterial {
        var material = PhysicallyBasedMaterial()
        material.baseColor = .init(tint: .init(white: 0.02, alpha: 1))
        material.roughness = 0.6
        return material
    }

    private static func darkChrome() -> PhysicallyBasedMaterial {
        var material = PhysicallyBasedMaterial()
        material.baseColor = .init(tint: .init(white: 0.35, alpha: 1))
        material.metallic = 1.0
        material.roughness = 0.15
        return material
    }

    private static func glow(_ colour: SIMD3<Float>, _ intensity: Float) -> PhysicallyBasedMaterial {
        var material = PhysicallyBasedMaterial()
        let tint = NSColor(red: CGFloat(colour.x), green: CGFloat(colour.y), blue: CGFloat(colour.z), alpha: 1)
        material.baseColor = .init(tint: tint)
        material.emissiveColor = .init(color: tint)
        material.emissiveIntensity = intensity
        return material
    }

    private static func lamp(on: Bool) -> PhysicallyBasedMaterial {
        on ? glow(SIMD3(1, 0.55, 0.04), 7) : glow(SIMD3(0.25, 0.14, 0.05), 0)
    }

    private static func box(_ size: SIMD3<Float>, _ position: SIMD3<Float>, _ radius: Float, _ material: PhysicallyBasedMaterial)
        -> ModelEntity
    {
        let entity = ModelEntity(
            mesh: .generateBox(width: size.x, height: size.y, depth: size.z, cornerRadius: radius), materials: [material])
        entity.position = position
        return entity
    }

    /// A tyre along z (the caller turns it onto the axle): full radius across the tread, rounded
    /// shoulders down to the sidewalls.
    private static func tyreMesh() -> MeshResource? {
        let r = wheelRadius
        let profile: [(Float, Float)] = [
            (-0.5, 0.8), (-0.46, 0.92), (-0.38, 0.98), (-0.22, 1), (0.22, 1), (0.38, 0.98), (0.46, 0.92), (0.5, 0.8),
        ]
        return try? Loft.mesh(
            profile.map {
                LoftStation(z: $0.0 * wheelWidth, width: 2 * r * $0.1, height: 2 * r * $0.1, centerY: 0, exponent: 2)
            }, rows: 16, around: 56)
    }

    private enum DecalKind {
        /// A door: the red with the white and black flames sweeping back and `SAFETY CAR`.
        case door(frontOnRight: Bool)
        /// A plate: `SAFETY CAR` in black on yellow.
        case plate
    }

    /// A flat panel `width` × `height` facing +Z with the livery drawn on it.
    private static func decal(width: Float, height: Float, kind: DecalKind) -> ModelEntity? {
        let pixels = 128
        let w = Int(Float(pixels) * width / height)
        guard
            let context = CGContext(
                data: nil, width: w, height: pixels, bitsPerComponent: 8, bytesPerRow: 0,
                space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }
        let size = CGSize(width: w, height: pixels)
        let top = CGFloat(pixels)
        var plate = false
        switch kind {
        case .plate:
            plate = true
            context.setFillColor(CGColor(srgbRed: CGFloat(yellow.x), green: CGFloat(yellow.y), blue: CGFloat(yellow.z), alpha: 1))
            context.fill(CGRect(origin: .zero, size: size))
            context.setStrokeColor(CGColor(gray: 0.05, alpha: 1))
            context.setLineWidth(6)
            context.stroke(CGRect(origin: .zero, size: size).insetBy(dx: 4, dy: 4))
        case .door(let frontOnRight):
            context.setFillColor(CGColor(srgbRed: CGFloat(red.x), green: CGFloat(red.y), blue: CGFloat(red.z), alpha: 1))
            context.fill(CGRect(origin: .zero, size: size))
            /// A point `t` of the way back from the door's front edge, `y` of its height up.
            func at(_ t: CGFloat, _ y: CGFloat) -> CGPoint {
                CGPoint(x: CGFloat(w) * (frontOnRight ? 1 - t : t), y: top * y)
            }
            /// A flame: from its tip `t0` (thin, ahead) back to the rear edge, between two curves.
            func flame(_ t0: CGFloat, _ y0: CGFloat, upper: CGFloat, lower: CGFloat, bow: CGFloat, _ colour: CGColor) {
                context.setFillColor(colour)
                context.move(to: at(t0, y0))
                context.addCurve(
                    to: at(1.02, upper), control1: at(t0 + (1 - t0) * 0.4, y0 + bow),
                    control2: at(t0 + (1 - t0) * 0.75, upper - bow * 0.2))
                context.addLine(to: at(1.02, lower))
                context.addCurve(
                    to: at(t0, y0), control1: at(t0 + (1 - t0) * 0.75, lower - bow * 0.1),
                    control2: at(t0 + (1 - t0) * 0.4, y0 + bow * 0.4))
                context.closePath()
                context.fillPath()
            }
            let white = CGColor(gray: 0.97, alpha: 1)
            let black = CGColor(gray: 0.03, alpha: 1)
            let paint = CGColor(srgbRed: CGFloat(red.x), green: CGFloat(red.y), blue: CGFloat(red.z), alpha: 1)
            // A broad white flame over the rear of the door, a black tongue and a red cut inside it.
            flame(0.12, 0.66, upper: 1.08, lower: 0.5, bow: 0.14, white)
            flame(0.3, 0.76, upper: 0.98, lower: 0.8, bow: 0.06, black)
            flame(0.46, 0.64, upper: 0.72, lower: 0.6, bow: 0.04, paint)
        }
        let graphics = NSGraphicsContext(cgContext: context, flipped: false)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = graphics
        let font = NSFont.systemFont(ofSize: top * (plate ? 0.6 : 0.34), weight: .black).withTraits(italic: !plate)
        let colour = plate ? NSColor(white: 0.04, alpha: 1) : NSColor(white: 0.97, alpha: 1)
        let text = NSAttributedString(string: "SAFETY CAR", attributes: [.font: font, .foregroundColor: colour, .kern: 2])
        let bounds = text.size()
        text.draw(at: CGPoint(x: (CGFloat(w) - bounds.width) / 2, y: plate ? (top - bounds.height) / 2 : top * 0.07))
        NSGraphicsContext.restoreGraphicsState()
        guard let image = context.makeImage(),
            let texture = try? TextureResource(image: image, options: .init(semantic: .color))
        else { return nil }
        var material = plate ? PhysicallyBasedMaterial() : paint()
        material.baseColor = .init(texture: .init(texture))
        if plate {
            material.roughness = 0.45
        }
        return ModelEntity(mesh: .generatePlane(width: width, height: height), materials: [material])
    }
}

private extension NSFont {
    /// This font, slanted (the flanks' lettering leans forward).
    func withTraits(italic: Bool) -> NSFont {
        guard italic else { return self }
        return NSFontManager.shared.convert(self, toHaveTrait: .italicFontMask)
    }
}
