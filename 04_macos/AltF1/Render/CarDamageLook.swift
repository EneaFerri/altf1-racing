import AltF1Core

/// How a damaged car looks (the web's `view/carDamageLook.ts`, the same numbers): purely cosmetic,
/// from `CarDamage`. `CarEntity` draws it; parts that break off fly away as `Debris`.
struct CarDamageLook: Equatable {
    /// One half of the front wing as drawn.
    struct WingHalf: Equatable {
        /// How far its outer end hangs down (rad).
        var droop: Float
        /// Broken off: not drawn.
        var missing: Bool
    }

    var frontLeft: WingHalf
    var frontRight: WingHalf
    /// Tilt of the rear wing about its axle, trailing edge down (rad).
    var rearTilt: Float
    var rearMissing: Bool
    /// Per wheel (order of `carWheels`): 0 = round, 1 = fully flat.
    var flat: [Float]

    /// Front wing's outer end hangs down this far at full damage on one side (rad, ~9°: to the road).
    static let maxDroop: Float = 0.16
    /// A wing (half) breaks off from this damage on.
    static let breaksAt = 0.8
    /// Rear wing tilt at full damage (rad, ~29°).
    static let maxTilt: Float = 0.5
    /// A tyre starts going flat from this damage on, fully flat at 1.
    static let flatFrom = 0.5

    static let intact = CarDamageLook(CarDamage.none)

    /// The front wing bends most on the side whose front tyre is more damaged (where the hit was);
    /// from `breaksAt` that half breaks off, and at full damage both do. The rear wing tilts, then
    /// breaks off. Tyres stay round up to half damage, then go flat.
    init(_ damage: CarDamage) {
        let fl = damage.tyres[0]
        let fr = damage.tyres[1]
        let fw = damage.frontWing
        let left = fl + fr > 0 ? fl / (fl + fr) : 0.5
        func half(_ share: Double, _ breaks: Bool) -> WingHalf {
            WingHalf(droop: Float(min(1, fw * share * 2)) * Self.maxDroop, missing: breaks)
        }
        frontLeft = half(left, fw >= 1 || (fw >= Self.breaksAt && left >= 0.5))
        frontRight = half(1 - left, fw >= 1 || (fw >= Self.breaksAt && left < 0.5))
        rearTilt = Float(damage.rearWing) * Self.maxTilt
        rearMissing = damage.rearWing >= Self.breaksAt
        flat = damage.tyres.map { Float(max(0, ($0 - Self.flatFrom) / (1 - Self.flatFrom))) }
    }
}
