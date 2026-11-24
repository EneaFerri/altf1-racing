import AltF1Core
import simd

/// Solids for the scenery, added to a `MeshBuilder` (the web's Three.js boxes, cylinders and cones,
/// merged into one mesh per material: few draw calls). Every face faces out from its solid's centre.
nonisolated extension MeshBuilder {
    /// A flat polygon (a quad's worth of corners) with a face normal turned away from `inside`.
    mutating func face(_ corners: [SIMD3<Float>], inside: SIMD3<Float>, uv: [SIMD2<Float>]) {
        guard corners.count >= 3 else { return }
        var n = simd_cross(corners[1] - corners[0], corners[2] - corners[0])
        if simd_length(n) < 1e-9 { return }
        n = simd_normalize(n)
        let centre = corners.reduce(.zero, +) / Float(corners.count)
        if simd_dot(n, centre - inside) < 0 { n = -n }
        let base = UInt32(positions.count)
        positions += corners
        normals += Array(repeating: n, count: corners.count)
        uvs += uv.count == corners.count ? uv : Array(repeating: .zero, count: corners.count)
        for k in 1..<(corners.count - 1) {
            let (a, b, c) = (corners[0], corners[k], corners[k + 1])
            if simd_dot(simd_cross(b - a, c - a), n) >= 0 {
                indices += [base, base + UInt32(k), base + UInt32(k + 1)]
            } else {
                indices += [base, base + UInt32(k + 1), base + UInt32(k)]
            }
        }
    }

    /// A box: the unit cube (−0.5…0.5) through `transform`; uv in metres / `tile` on every face.
    mutating func box(_ transform: simd_float4x4, tile: Float = 0) {
        func p(_ x: Float, _ y: Float, _ z: Float) -> SIMD3<Float> {
            let v = transform * SIMD4(x, y, z, 1)
            return SIMD3(v.x, v.y, v.z)
        }
        let centre = p(0, 0, 0)
        let faces: [[SIMD3<Float>]] = [
            [p(-0.5, -0.5, 0.5), p(0.5, -0.5, 0.5), p(0.5, 0.5, 0.5), p(-0.5, 0.5, 0.5)],
            [p(0.5, -0.5, -0.5), p(-0.5, -0.5, -0.5), p(-0.5, 0.5, -0.5), p(0.5, 0.5, -0.5)],
            [p(0.5, -0.5, 0.5), p(0.5, -0.5, -0.5), p(0.5, 0.5, -0.5), p(0.5, 0.5, 0.5)],
            [p(-0.5, -0.5, -0.5), p(-0.5, -0.5, 0.5), p(-0.5, 0.5, 0.5), p(-0.5, 0.5, -0.5)],
            [p(-0.5, 0.5, 0.5), p(0.5, 0.5, 0.5), p(0.5, 0.5, -0.5), p(-0.5, 0.5, -0.5)],
            [p(-0.5, -0.5, -0.5), p(0.5, -0.5, -0.5), p(0.5, -0.5, 0.5), p(-0.5, -0.5, 0.5)],
        ]
        for corners in faces {
            let w = simd_distance(corners[0], corners[1])
            let h = simd_distance(corners[1], corners[2])
            let (u, v) = tile > 0 ? (w / tile, h / tile) : (1, 1)
            face(corners, inside: centre, uv: [SIMD2(0, v), SIMD2(u, v), SIMD2(u, 0), SIMD2(0, 0)])
        }
    }

    /// A prism (a cylinder of `sides` facets, tapering from `bottom` to `top` radius) standing on
    /// its base, `height` tall, through `transform`; capped on top.
    mutating func prism(_ transform: simd_float4x4, sides: Int, bottom: Float, top: Float, height: Float) {
        func p(_ x: Float, _ y: Float, _ z: Float) -> SIMD3<Float> {
            let v = transform * SIMD4(x, y, z, 1)
            return SIMD3(v.x, v.y, v.z)
        }
        let axis = p(0, height / 2, 0)
        var ring: [(SIMD3<Float>, SIMD3<Float>)] = []
        for k in 0..<sides {
            let a = Float(k) / Float(sides) * 2 * .pi
            ring.append((p(cos(a) * bottom, 0, sin(a) * bottom), p(cos(a) * top, height, sin(a) * top)))
        }
        for k in 0..<sides {
            let (b0, t0) = ring[k]
            let (b1, t1) = ring[(k + 1) % sides]
            face([b0, b1, t1, t0], inside: axis, uv: [SIMD2(0, 1), SIMD2(1, 1), SIMD2(1, 0), SIMD2(0, 0)])
        }
        if top > 0 { face(ring.map(\.1), inside: p(0, 0, 0), uv: []) }
    }

    /// A pyramid (`sides` faces) on a base of `radius`, `height` tall, through `transform`.
    mutating func pyramid(_ transform: simd_float4x4, sides: Int, radius: Float, height: Float) {
        func p(_ x: Float, _ y: Float, _ z: Float) -> SIMD3<Float> {
            let v = transform * SIMD4(x, y, z, 1)
            return SIMD3(v.x, v.y, v.z)
        }
        let apex = p(0, height, 0)
        let centre = p(0, height / 3, 0)
        for k in 0..<sides {
            let a0 = Float(k) / Float(sides) * 2 * .pi
            let a1 = Float(k + 1) / Float(sides) * 2 * .pi
            face([p(cos(a0) * radius, 0, sin(a0) * radius), p(cos(a1) * radius, 0, sin(a1) * radius), apex], inside: centre, uv: [])
        }
    }

    /// Walls along a closed footprint from `bottom` to `top`, facing out; uv: whole bays (`bay` m)
    /// along each wall, floors (`floor` m) up it, so windows never get cut at the corners.
    /// `cells`: bays (and floors) per texture repeat (a night facade's lit windows: 8).
    mutating func walls(_ ring: [Vec2], bottom: Float, top: Float, bay: Float = 3.2, floor: Float = 3.2, cells: Float = 1) {
        guard ring.count >= 3 else { return }
        let v = (top - bottom) / floor / cells
        for i in 0..<ring.count {
            let a = ring[i]
            let b = ring[(i + 1) % ring.count]
            let length = Float(a.distance(to: b))
            if length < 0.05 { continue }
            let u = max(1, (length / bay).rounded()) / cells
            let corners = [
                SIMD3<Float>(Float(a.x), bottom, Float(a.z)), SIMD3<Float>(Float(b.x), bottom, Float(b.z)),
                SIMD3<Float>(Float(b.x), top, Float(b.z)), SIMD3<Float>(Float(a.x), top, Float(a.z)),
            ]
            // A wall's own outside: away from the footprint's centre, judged at the wall's middle.
            let mid = (corners[0] + corners[2]) / 2
            let outward = SIMD3<Float>(Float(b.z - a.z), 0, -Float(b.x - a.x))
            let probe = mid - outward * 0.01
            let side = insidePolygon(Vec2(Double(probe.x), Double(probe.z)), ring) ? probe : mid + outward * 0.01
            face(corners, inside: side, uv: [SIMD2(0, v), SIMD2(u, v), SIMD2(u, 0), SIMD2(0, 0)])
        }
    }

    /// A faceted half-ellipsoid (a dome) on `centre`, radii `rx` × `ry` (up) × `rz`.
    mutating func dome(_ centre: SIMD3<Float>, rx: Float, ry: Float, rz: Float, around: Int = 14, up: Int = 7) {
        func p(_ i: Int, _ j: Int) -> SIMD3<Float> {
            let a = Float(i) / Float(around) * 2 * .pi
            let e = Float(j) / Float(up) * .pi / 2
            return centre + SIMD3(cos(e) * cos(a) * rx, sin(e) * ry, cos(e) * sin(a) * rz)
        }
        for j in 0..<up {
            for i in 0..<around {
                let corners = j == up - 1 ? [p(i, j), p(i + 1, j), p(i, up)] : [p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)]
                face(corners, inside: centre, uv: [])
            }
        }
    }

    /// A flat polygon at height `y` (or each corner's own `heights`), facing up; uv in metres / `tile`.
    mutating func polygon(_ ring: [Vec2], y: Float, tile: Float = 0, heights: [Float]? = nil) {
        let triangles = triangulate(ring)
        guard !triangles.isEmpty else { return }
        let base = UInt32(positions.count)
        for (i, p) in ring.enumerated() {
            positions.append(SIMD3(Float(p.x), heights?[i] ?? y, Float(p.z)))
            normals.append(SIMD3(0, 1, 0))
            uvs.append(tile > 0 ? SIMD2(Float(p.x) / tile, Float(p.z) / tile) : .zero)
        }
        indices += triangles.map { base + UInt32($0) }
    }
}

/// A transform: translation, a turn round the vertical (yaw), then scale.
nonisolated func placed(_ position: SIMD3<Float>, yaw: Float = 0, pitch: Float = 0, roll: Float = 0, scale: SIMD3<Float> = .one) -> simd_float4x4 {
    let rotation =
        simd_quatf(angle: yaw, axis: SIMD3(0, 1, 0)) * simd_quatf(angle: pitch, axis: SIMD3(1, 0, 0))
        * simd_quatf(angle: roll, axis: SIMD3(0, 0, 1))
    var m = simd_float4x4(rotation)
    m.columns.0 *= scale.x
    m.columns.1 *= scale.y
    m.columns.2 *= scale.z
    m.columns.3 = SIMD4(position, 1)
    return m
}
