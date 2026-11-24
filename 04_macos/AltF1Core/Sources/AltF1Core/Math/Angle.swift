import Foundation

private let tau = Double.pi * 2

/// Wraps an angle into (−π, π] (`math/angle.ts`).
public func wrapAngle(_ angle: Double) -> Double {
    let wrapped = angle - tau * ((angle + .pi) / tau).rounded(.down)
    return wrapped == -.pi ? .pi : wrapped
}

/// Interpolates between two angles along the shortest arc.
public func lerpAngle(_ from: Double, _ to: Double, _ t: Double) -> Double {
    wrapAngle(from + wrapAngle(to - from) * t)
}

/// Moves `value` towards `target` by at most `maxDelta`, without overshooting.
public func moveToward(_ value: Double, _ target: Double, _ maxDelta: Double) -> Double {
    if abs(target - value) <= maxDelta { return target }
    return value + jsSign(target - value) * maxDelta
}

/// JavaScript's `Math.sign`: −1, 0 or 1 (the web's simulation relies on sign(0) = 0).
@inline(__always) public func jsSign(_ x: Double) -> Double {
    x > 0 ? 1 : (x < 0 ? -1 : 0)
}

/// JavaScript's `Math.round`: halves round up (−2.5 → −2), unlike Swift's `rounded()`.
@inline(__always) public func jsRound(_ x: Double) -> Double {
    let down = x.rounded(.down)
    return x - down >= 0.5 ? down + 1 : down
}

/// JavaScript's `Math.hypot` of two numbers, bit for bit as V8 computes it (`MathHypot` in V8's
/// `builtins/math.tq`: normalised by the larger, Kahan-summed), not libm's `hypot`: positions and
/// distances then match the web's (and the server's) exactly, so near-ties break the same way.
@inline(__always) public func jsHypot(_ a: Double, _ b: Double) -> Double {
    let x = abs(a)
    let y = abs(b)
    let largest = max(x, y)
    if largest == .infinity { return .infinity }
    if a.isNaN || b.isNaN { return .nan }
    if largest == 0 { return 0 }
    // V8's loop over the two values, unrolled (this is on the simulation's hot path).
    let nx = x / largest
    let sumX = nx * nx
    let compensation = (sumX - 0) - sumX
    let ny = y / largest
    let summand = ny * ny - compensation
    let sum = sumX + summand
    return sum.squareRoot() * largest
}

/// JavaScript's `%` on numbers: the sign of the dividend (`truncatingRemainder`).
@inline(__always) func jsMod(_ a: Double, _ b: Double) -> Double {
    a.truncatingRemainder(dividingBy: b)
}

/// `((i % n) + n) % n`: an index wrapped into 0..<n.
@inline(__always) func wrapIndex(_ i: Int, _ n: Int) -> Int {
    ((i % n) + n) % n
}
