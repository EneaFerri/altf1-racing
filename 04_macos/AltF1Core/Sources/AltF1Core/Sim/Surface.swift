/// Combined effect of the surfaces under a car's wheels for one tick (`sim/surface.ts`).
public struct SurfaceEffect: Sendable {
    public var grip: Double
    public var traction: Double
    /// Multiplies braking on top of `traction` (a wet track); 1 on every dry surface.
    public var brake: Double
    public var drag: Double
    /// Yaw kick to add this tick (rad/s).
    public var spinKick: Double

    public static let neutral = SurfaceEffect(grip: 1, traction: 1, brake: 1, drag: 0, spinKick: 0)
}

/// Speed at which a bump gives exactly `bumpSpin` (m/s); faster = harder kick, up to 1.5×.
private let bumpReferenceSpeed: Double = 30

func sampleWheelSurfaces(_ track: Track, _ car: CarState) -> [Surface] {
    carWheels.map { wheel in
        surfaceAt(track, .toWorld(car.position, car.heading, ahead: wheel.ahead, side: wheel.side))
    }
}

/// Averages the wheels' surfaces (two wheels on a kerb = half the effect) and adds a yaw kick for
/// each wheel that just climbed onto a bumpy surface (high kerb).
public func surfaceEffect(
    _ previous: [Surface], _ current: [Surface], _ speed: Double, _ params: SurfaceTable
) -> SurfaceEffect {
    var grip = 0.0
    var traction = 0.0
    var drag = 0.0
    var spinKick = 0.0
    let speedFactor = min(1.5, speed / bumpReferenceSpeed)
    let count = Double(current.count)
    for (wheel, surface) in current.enumerated() {
        let p = params[surface]
        grip += p.grip / count
        traction += p.traction / count
        drag += p.drag / count
        if p.bumpSpin > 0 && (wheel >= previous.count || previous[wheel] != surface) {
            // A left wheel (even index) knocks the nose right (heading decreases), and vice versa.
            let sideSign: Double = wheel % 2 == 0 ? -1 : 1
            spinKick += sideSign * p.bumpSpin * speedFactor
        }
    }
    return SurfaceEffect(grip: grip, traction: traction, brake: 1, drag: drag, spinKick: spinKick)
}

/// Convenience for `stepGame`: sample + combine in one call.
public func carSurface(_ track: Track, _ car: CarState, _ params: SurfaceTable)
    -> (surfaces: [Surface], effect: SurfaceEffect)
{
    let surfaces = sampleWheelSurfaces(track, car)
    return (surfaces, surfaceEffect(car.wheelSurfaces, surfaces, car.velocity.length, params))
}
