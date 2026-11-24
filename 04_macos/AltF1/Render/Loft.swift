import RealityKit
import simd

/// One cross-section of a lofted body, across the car at `z`: a rounded rectangle (superellipse)
/// `width` × `height` centred at (`centerX`, `centerY`); `exponent` 2 = an ellipse, higher = squarer.
struct LoftStation {
    var z: Float
    var width: Float
    var height: Float
    var centerY: Float
    var centerX: Float = 0
    var exponent: Float = 2.8
}

/// Smooth bodies swept through cross-sections (the car's spine, sidepods, floor): every parameter is
/// interpolated between the stations with monotone cubics, so a sudden change (the cockpit's edge)
/// never bulges past its stations. Closed at both ends, smooth normals, wound for RealityKit.
enum Loft {
    static func mesh(_ stations: [LoftStation], rows: Int = 90, around: Int = 48) throws -> MeshResource {
        let zs = stations.map(\.z)
        let keys: [KeyPath<LoftStation, Float>] = [\.width, \.height, \.centerY, \.centerX, \.exponent]
        let splines = keys.map { key in MonotoneCubic(xs: zs, ys: stations.map { $0[keyPath: key] }) }

        var positions: [SIMD3<Float>] = []
        var indices: [UInt32] = []
        // The rings, front to back.
        for i in 0...rows {
            let z = zs.first! + (zs.last! - zs.first!) * Float(i) / Float(rows)
            let (w, h, cy, cx, n) = (
                max(splines[0](z), 0.001), max(splines[1](z), 0.001), splines[2](z), splines[3](z), splines[4](z)
            )
            for j in 0..<around {
                let theta = 2 * Float.pi * Float(j) / Float(around)
                let c = cos(theta)
                let s = sin(theta)
                let x = cx + w / 2 * copysign(pow(abs(c), 2 / n), c)
                let y = cy + h / 2 * copysign(pow(abs(s), 2 / n), s)
                positions.append(SIMD3(x, y, z))
            }
        }
        func ring(_ i: Int, _ j: Int) -> UInt32 { UInt32(i * around + (j % around)) }
        for i in 0..<rows {
            for j in 0..<around {
                let a = ring(i, j), b = ring(i, j + 1), c = ring(i + 1, j), d = ring(i + 1, j + 1)
                indices += [a, b, c, b, d, c]
            }
        }
        var normals = smoothNormals(positions, indices)

        // End caps: a fan round each end's centre, facing out along the car.
        for (row, facing) in [(0, Float(-1)), (rows, Float(1))] {
            let first = UInt32(positions.count)
            let ringStart = row * around
            let centre = positions[ringStart..<(ringStart + around)].reduce(.zero, +) / Float(around)
            positions.append(centre)
            normals.append(SIMD3(0, 0, facing))
            for j in 0..<around {
                positions.append(positions[ringStart + j])
                normals.append(SIMD3(0, 0, facing))
            }
            for j in 0..<around {
                let p = first + 1 + UInt32(j)
                let q = first + 1 + UInt32((j + 1) % around)
                indices += facing > 0 ? [first, p, q] : [first, q, p]
            }
        }

        var descriptor = MeshDescriptor(name: "loft")
        descriptor.positions = MeshBuffer(positions)
        descriptor.normals = MeshBuffer(normals)
        descriptor.primitives = .triangles(indices)
        return try MeshResource.generate(from: [descriptor])
    }

    /// Per-vertex normals: the sum of the faces round each vertex (counter-clockwise = outward).
    private static func smoothNormals(_ positions: [SIMD3<Float>], _ indices: [UInt32]) -> [SIMD3<Float>] {
        var normals = [SIMD3<Float>](repeating: .zero, count: positions.count)
        for t in stride(from: 0, to: indices.count, by: 3) {
            let (a, b, c) = (Int(indices[t]), Int(indices[t + 1]), Int(indices[t + 2]))
            let n = simd_cross(positions[b] - positions[a], positions[c] - positions[a])
            normals[a] += n
            normals[b] += n
            normals[c] += n
        }
        return normals.map { simd_length($0) > 0 ? simd_normalize($0) : SIMD3(0, 1, 0) }
    }
}

/// A monotone cubic through points (Fritsch–Carlson): smooth, never overshooting between them.
private struct MonotoneCubic {
    let xs: [Float]
    let ys: [Float]
    let slopes: [Float]

    init(xs: [Float], ys: [Float]) {
        self.xs = xs
        self.ys = ys
        let n = xs.count
        let secants = (0..<(n - 1)).map { (ys[$0 + 1] - ys[$0]) / max(xs[$0 + 1] - xs[$0], 1e-6) }
        var m = [Float](repeating: 0, count: n)
        m[0] = secants.first ?? 0
        m[n - 1] = secants.last ?? 0
        for i in 1..<max(1, n - 1) {
            m[i] = secants[i - 1] * secants[i] <= 0 ? 0 : (secants[i - 1] + secants[i]) / 2
        }
        for i in 0..<(n - 1) where secants[i] == 0 {
            m[i] = 0
            m[i + 1] = 0
        }
        for i in 0..<(n - 1) where secants[i] != 0 {
            let a = m[i] / secants[i]
            let b = m[i + 1] / secants[i]
            let s = a * a + b * b
            if s > 9 {
                let t = 3 / s.squareRoot()
                m[i] = t * a * secants[i]
                m[i + 1] = t * b * secants[i]
            }
        }
        slopes = m
    }

    func callAsFunction(_ x: Float) -> Float {
        guard x > xs.first! else { return ys.first! }
        guard x < xs.last! else { return ys.last! }
        let i = (xs.lastIndex { $0 <= x } ?? 0)
        let h = xs[i + 1] - xs[i]
        let t = (x - xs[i]) / h
        let t2 = t * t
        let t3 = t2 * t
        return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * slopes[i]
            + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * slopes[i + 1]
    }
}
