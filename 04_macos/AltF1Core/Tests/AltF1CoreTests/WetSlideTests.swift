import Foundation
import Testing

@testable import AltF1Core

/// Power oversteer in the wet (2.8), as the web's `sim/car.test.ts` checks it.
@Suite struct WetSlideTests {
    /// The worst slip angle (degrees) of a car at `speed` on full left lock for 3 s on full wets.
    private func corner(_ speed: Double, throttle: Double, wet: Bool) -> Double {
        var surface = SurfaceEffect.neutral
        if wet {
            let p = TyreParams.baseline
            surface = wetSurfaceEffect(.neutral, 0, tyreWetParams(.wet, 1, p, .baseline))
            surface.slideFrom = slideFrom(.wet, 1, p)
            surface.slideGain = p.slideGain
            surface.slideMaxSpin = p.slideMaxSpin
        }
        var car = CarState(id: "p", position: .zero, heading: 0)
        car.velocity = Vec2(0, -speed)
        var worst = 0.0
        for _ in 0..<(3 * tickRate) {
            car = stepCar(car, InputCommand(throttle: throttle, steer: -1), .baseline, fixedDt, surface: surface)
            worst = max(worst, abs(slipAngle(car)))
        }
        return worst * 180 / .pi
    }

    @Test func spinsRoundOnTheThrottleMidCorner() {
        #expect(corner(40, throttle: 1, wet: true) > 90)
    }

    @Test func onlySlidesWhenTheDriverLifts() {
        #expect(corner(40, throttle: 0, wet: true) < 60)
    }

    @Test func neverOnADryTrack() {
        #expect(corner(40, throttle: 1, wet: false) < 30)
    }
}
