import AltF1Core
import Foundation
import simd

/// The lifelike trees' surfaces (`Trees.swift`): leaf clusters, needle sprays and palm fronds drawn
/// leaf by leaf with their cut-out masks, and three barks. Seeded: the same trees every load.
nonisolated enum TreeTextures {
    typealias T = ProceduralTextures

    /// A cut-out surface: its colour (opaque) and its mask (white where there is a leaf).
    struct Foliage: Sendable {
        let albedo: PixelImage
        let mask: PixelImage
    }

    /// A canvas of straight colours and coverage, painted leaf by leaf.
    private struct Canvas {
        let width: Int
        let height: Int
        var color: [SIMD3<Float>]
        var alpha: [Float]

        init(_ width: Int, _ height: Int, background: SIMD3<Float>) {
            self.width = width
            self.height = height
            color = Array(repeating: background, count: width * height)
            alpha = Array(repeating: 0, count: width * height)
        }

        /// A pointed leaf centred on (x, y), `length` × `breadth` pixels, turned by `angle`; its
        /// colour lighter towards the tip, a pale midrib.
        mutating func leaf(_ x: Float, _ y: Float, length: Float, breadth: Float, angle: Float, _ c: SIMD3<Float>) {
            let (ca, sa) = (cos(angle), sin(angle))
            let half = length / 2
            let reach = Int(half.rounded(.up)) + 1
            let (top, bottom) = (max(0, Int(y) - reach), min(height - 1, Int(y) + reach))
            let (left, right) = (max(0, Int(x) - reach), min(width - 1, Int(x) + reach))
            guard top <= bottom, left <= right else { return }
            for py in top...bottom {
                for px in left...right {
                    let dx = Float(px) + 0.5 - x
                    let dy = Float(py) + 0.5 - y
                    let u = dx * ca + dy * sa
                    let v = -dx * sa + dy * ca
                    guard abs(u) < half else { continue }
                    let phase: Float = (u / half + 1) / 2 * .pi
                    let edge: Float = breadth / 2 * pow(sin(phase), 0.8)
                    guard abs(v) < edge else { continue }
                    let i = py * width + px
                    let rib: Float = abs(v) < 0.6 ? 1.18 : 1
                    let towardsTip: Float = 0.88 + 0.16 * (u / half)
                    let shade: Float = 1 - 0.18 * abs(v) / max(edge, 0.01)
                    color[i] = c * (towardsTip * rib * shade)
                    alpha[i] = 1
                }
            }
        }

        /// A stroke from a to b, `radius` pixels thick, in colour `c`.
        mutating func stroke(_ a: SIMD2<Float>, _ b: SIMD2<Float>, radius: Float, _ c: SIMD3<Float>) {
            let steps = max(1, Int(simd_distance(a, b) * 2))
            let r = Int(radius.rounded(.up))
            for k in 0...steps {
                let p = a + (b - a) * (Float(k) / Float(steps))
                let (top, bottom) = (max(0, Int(p.y) - r), min(height - 1, Int(p.y) + r))
                let (left, right) = (max(0, Int(p.x) - r), min(width - 1, Int(p.x) + r))
                guard top <= bottom, left <= right else { continue }
                for py in top...bottom {
                    for px in left...right {
                        let d = simd_distance(SIMD2(Float(px) + 0.5, Float(py) + 0.5), p)
                        guard d <= radius else { continue }
                        let i = py * width + px
                        color[i] = c
                        alpha[i] = 1
                    }
                }
            }
        }

        var foliage: Foliage {
            let (c, a, w) = (color, alpha, width)
            return Foliage(
                albedo: PixelImage.render(width, height) { x, y in SIMD4(c[y * w + x], 1) },
                mask: PixelImage.render(width, height) { x, y in T.gray(a[y * w + x]) })
        }
    }

    /// Plane-tree leaves: a 2 × 2 atlas of round clusters (fresh, deep, sunlit and blue-green),
    /// dense in the middle, ragged at the edge, the leaves on top lit, those underneath in shade.
    static func leaves(size: Int = 512) -> Foliage {
        let tones: [SIMD3<Float>] = [
            SIMD3(0.27, 0.42, 0.14), SIMD3(0.19, 0.33, 0.11), SIMD3(0.36, 0.46, 0.16), SIMD3(0.21, 0.37, 0.19),
        ]
        var canvas = Canvas(size, size, background: SIMD3(0.24, 0.38, 0.14))
        var random = SceneryRandom(41)
        let cell = Float(size / 2)
        for (k, tone) in tones.enumerated() {
            let (ox, oy) = (Float(k % 2) * cell, Float(k / 2) * cell)
            var leaves: [(Float, Float, Float, Float, Float)] = []
            for _ in 0..<300 {
                let r = Float(random.next()).squareRoot() * cell * 0.44
                let a = Float(random.next()) * 2 * .pi
                let x = cos(a) * r
                let y = sin(a) * r
                // Lit from above: brighter up top, darker underneath and inside.
                let light = 0.62 + 0.3 * (-y / (cell * 0.44) * 0.5 + 0.5) + 0.25 * Float(random.next()) + 0.1 * r / (cell * 0.44)
                leaves.append((x, y, a + Float(random.next() - 0.5) * 1.6, light, Float(random.next())))
            }
            for (x, y, angle, light, scale) in leaves.sorted(by: { $0.3 < $1.3 }) {
                canvas.leaf(
                    ox + cell / 2 + x, oy + cell / 2 + y, length: (10 + 6 * scale) * cell / 256,
                    breadth: (6 + 3 * scale) * cell / 256, angle: angle, tone * light)
            }
        }
        return canvas.foliage
    }

    /// An Eldar pine's spray: a twig along the texture (left: the trunk, right: the tip), side
    /// twigs reaching forward, dense blue-green needles on them.
    static func needles(size: Int = 256) -> Foliage {
        var canvas = Canvas(size, size, background: SIMD3(0.19, 0.32, 0.18))
        var random = SceneryRandom(43)
        let s = Float(size)
        let wood = SIMD3<Float>(0.32, 0.22, 0.15)
        canvas.stroke(SIMD2(0, s / 2), SIMD2(s * 0.96, s / 2), radius: 2, wood)
        var x: Float = s * 0.04
        while x < s * 0.9 {
            for side: Float in [-1, 1] {
                let reach = s * 0.42 * (1 - x / s * 0.55) * Float(0.8 + random.next() * 0.3)
                let a = SIMD2(x, s / 2)
                let b = a + SIMD2(reach * 0.75, side * reach * 0.62)
                canvas.stroke(a, b, radius: 1, wood)
                var t: Float = 0
                while t < 1 {
                    let p = a + (b - a) * t
                    for flank: Float in [-1, 1] {
                        let tone = SIMD3<Float>(0.19, 0.33, 0.19) * Float(0.8 + random.next() * 0.5)
                        let l = Float(7 + random.next() * 5) * s / 256
                        let dir = simd_normalize(b - a)
                        let n = SIMD2(-dir.y, dir.x) * flank
                        canvas.stroke(p, p + (dir * 0.55 + n) * l, radius: 1.1 * s / 256, tone)
                    }
                    t += 0.05
                }
            }
            x += s * 0.085
        }
        return canvas.foliage
    }

    /// A date palm's frond: the midrib down the middle (the texture's length: the frond's), stiff
    /// leaflets either side angled towards the tip; `dry`: the brown hanging ones.
    static func palmFrond(dry: Bool) -> Foliage {
        let (w, h) = (256, 512)
        let green = dry ? SIMD3<Float>(0.50, 0.40, 0.24) : SIMD3<Float>(0.26, 0.39, 0.15)
        var canvas = Canvas(w, h, background: green)
        var random = SceneryRandom(dry ? 47 : 45)
        let rib = dry ? SIMD3<Float>(0.45, 0.36, 0.22) : SIMD3<Float>(0.55, 0.50, 0.30)
        var t: Float = 0.04
        while t < 0.97 {
            for side: Float in [-1, 1] {
                let length = Float(w) * 0.47 * Float(0.82 + random.next() * 0.18)
                let a = SIMD2(Float(w) / 2, t * Float(h))
                let b = a + SIMD2(side * length, length * Float(dry ? 0.9 : 0.55))
                let tone = green * Float(0.78 + random.next() * 0.4)
                canvas.stroke(a, b, radius: 2.4, tone)
            }
            t += 0.012
        }
        canvas.stroke(SIMD2(Float(w) / 2, 0), SIMD2(Float(w) / 2, Float(h)), radius: 3, rib)
        return canvas.foliage
    }

    enum Bark: Sendable { case plane, pine, palm }

    /// Bark: the plane tree's peeling camouflage (cream, olive, grey patches), the pine's reddish
    /// plates between dark furrows, the palm's grey rings of old leaf bases.
    static func bark(_ kind: Bark, size: Int = 256) -> SurfaceMaps {
        let height = T.heightField(size) { s, t in
            switch kind {
            case .plane:
                return T.fbm(s, t, period: 4, octaves: 4, seed: 121)
            case .pine:
                let wobble = T.fbm(s, t, period: 4, octaves: 2, seed: 123) * 0.8
                let furrow = 0.5 + 0.5 * sin((s * 6 + wobble) * 2 * .pi)
                return (furrow > 0.78 ? 0 : 0.7) + T.fbm(s, t, period: 8, octaves: 3, seed: 124) * 0.3
            case .palm:
                let ring = (t * 6 + T.noise(s * 4, t * 4, period: 4, seed: 125) * 0.25).truncatingRemainder(dividingBy: 1)
                return (ring < 0.16 ? 0.1 : 0.7) + T.fbm(s, t, period: 16, octaves: 2, seed: 126) * 0.2
            }
        }
        let albedo = PixelImage.render(size, size) { x, y in
            let h = height[y * size + x]
            let s = Float(x) / Float(size)
            let t = Float(y) / Float(size)
            let grain = T.fbm(s, t, period: 32, octaves: 2, seed: 127)
            let c: SIMD3<Float>
            switch kind {
            case .plane:
                c = h < 0.44 ? SIMD3(0.46, 0.45, 0.37) : h < 0.56 ? SIMD3(0.78, 0.74, 0.60) : SIMD3(0.42, 0.38, 0.31)
            case .pine:
                c = h < 0.3 ? SIMD3(0.16, 0.11, 0.08) : SIMD3(0.44, 0.28, 0.19)
            case .palm:
                c = h < 0.3 ? SIMD3(0.30, 0.26, 0.20) : SIMD3(0.52, 0.46, 0.36)
            }
            return SIMD4(c * (0.88 + grain * 0.24), 1)
        }
        let roughness = PixelImage.render(size, size) { _, _ in T.gray(0.9) }
        return SurfaceMaps(albedo: albedo, roughness: roughness, normal: T.normalMap(size, strength: kind == .plane ? 2 : 4, height))
    }
}
