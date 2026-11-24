import Foundation

/// Sub-steps per spline span before arc-length resampling; high enough that the polyline is smooth.
private let subdivisions = 24

/// A closed spline sampled at even arc length (`math/spline.ts`).
public struct SplineSamples: Sendable {
    public let samples: [Vec2]
    /// Each sample's spline parameter (`3.42` = 42% of the way from control point 3 to 4).
    public let params: [Double]
    /// For each control point, the index of the sample closest to it.
    public let controlIndices: [Int]
}

/// Samples a closed centripetal Catmull-Rom spline through `points` at (roughly) even arc-length
/// `spacing`. Centripetal parameterisation avoids loops and cusps on uneven control points.
public func sampleClosedSpline(_ points: [Vec2], spacing: Double) -> SplineSamples {
    let n = points.count
    var dense: [Vec2] = []
    dense.reserveCapacity(n * subdivisions)
    var controlDense: [Int] = []
    for i in 0..<n {
        controlDense.append(dense.count)
        let p0 = points[(i - 1 + n) % n]
        let p1 = points[i]
        let p2 = points[(i + 1) % n]
        let p3 = points[(i + 2) % n]
        for s in 0..<subdivisions {
            dense.append(centripetal(p0, p1, p2, p3, Double(s) / Double(subdivisions)))
        }
    }

    // Resample the dense polyline at even arc length.
    var cumulative: [Double] = [0]
    cumulative.reserveCapacity(dense.count + 1)
    for i in 1...dense.count {
        cumulative.append(cumulative[i - 1] + dense[i - 1].distance(to: dense[i % dense.count]))
    }
    let total = cumulative[dense.count]
    let count = max(3, Int(jsRound(total / spacing)))
    let step = total / Double(count)

    var samples: [Vec2] = []
    var params: [Double] = []
    samples.reserveCapacity(count)
    params.reserveCapacity(count)
    var seg = 0
    for k in 0..<count {
        let target = Double(k) * step
        while cumulative[seg + 1] < target { seg += 1 }
        let segLength = cumulative[seg + 1] - cumulative[seg]
        let t = segLength > 0 ? (target - cumulative[seg]) / segLength : 0
        samples.append(dense[seg].lerp(to: dense[(seg + 1) % dense.count], t))
        params.append(jsMod((Double(seg) + t) / Double(subdivisions), Double(n)))
    }

    let controlIndices = controlDense.map { Int(jsRound(cumulative[$0] / step)) % count }
    return SplineSamples(samples: samples, params: params, controlIndices: controlIndices)
}

private func centripetal(_ p0: Vec2, _ p1: Vec2, _ p2: Vec2, _ p3: Vec2, _ u: Double) -> Vec2 {
    func knot(_ a: Vec2, _ b: Vec2) -> Double { max(sqrt(a.distance(to: b)), 1e-6) }
    let t1 = knot(p0, p1)
    let t2 = t1 + knot(p1, p2)
    let t3 = t2 + knot(p2, p3)
    let t = t1 + (t2 - t1) * u

    let a1 = p0.lerp(to: p1, t / t1)
    let a2 = p1.lerp(to: p2, (t - t1) / (t2 - t1))
    let a3 = p2.lerp(to: p3, (t - t2) / (t3 - t2))
    let b1 = a1.lerp(to: a2, t / t2)
    let b2 = a2.lerp(to: a3, (t - t1) / (t3 - t1))
    return b1.lerp(to: b2, (t - t1) / (t2 - t1))
}
