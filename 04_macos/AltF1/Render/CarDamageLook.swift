import AltF1Core
import Foundation

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
    /// Per wheel: punctured (`puncturedTyres`): the rim down near the road, the tread come loose
    /// and flapping round it (`looseTread`), whatever `flat` says.
    var punctured: [Bool]

    /// How a punctured wheel's loose tread sits this frame, relative to its wheel.
    struct LooseTread {
        /// Its centre above the rim's (m): resting on the road at rest, flung up by the speed.
        var lift: Float
        /// Roll round the axle (rad): it slips round the rim slower than the wheel turns.
        var roll: Float
        /// Yaw out of the wheel's plane (rad): the tread flapping sideways.
        var flap: Float
        /// Its shape: stretched up (> 1) and squeezed along the car (< 1), then back.
        var stretch: Float
        var squeeze: Float
    }

    /// A punctured wheel's centre this high above the road, as a share of the wheel's radius: the
    /// bare rim (70% of the wheel, no tyre on it) on the road.
    static let puncturedHeight: Float = 0.7
    /// The loose tread's radius, as a share of the wheel's: a little wider than the rim, round it.
    static let looseTreadRadius: Float = 0.86
    /// From this speed (m/s) the loose tread flaps in full.
    static let flapSpeed: Float = 25

    /// The loose tread of a punctured wheel (the web's `looseTread`, the same numbers) at `seconds`
    /// into its flapping, the car at `speed` (m/s), its wheels turned `spin` (rad); `wheel` puts
    /// each one out of step. At rest it hangs round the rim, its bottom on the road; at speed it is
    /// flung up and flaps.
    static func looseTread(seconds: Float, speed: Float, spin: Float, wheel: Int, radius: Float) -> LooseTread {
        let pace = min(1, abs(speed) / flapSpeed)
        let t = seconds + Float(wheel) * 0.37
        let rest = looseTreadRadius - puncturedHeight
        return LooseTread(
            lift: radius * (rest + 0.06 * pace) + pace * 0.012 * sin(t * 19),
            roll: spin * 0.55,
            flap: pace * 0.14 * sin(t * 13) * sin(t * 5.3),
            stretch: 1 + pace * 0.07 * sin(t * 23),
            squeeze: 1 - pace * 0.06 * sin(t * 23 + 1.3))
    }

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
    /// breaks off. Tyres stay round up to half damage, then go flat; a punctured one sits on its
    /// rim under its loose tread.
    init(_ damage: CarDamage, punctures: [Bool] = []) {
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
        punctured = (0..<4).map { $0 < punctures.count && punctures[$0] }
    }
}
