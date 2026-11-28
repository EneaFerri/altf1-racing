import CoreGraphics
import Foundation
import simd

/// An RGBA image drawn pixel by pixel, then handed to RealityKit as a `CGImage`.
nonisolated struct PixelImage: Sendable {
    let width: Int
    let height: Int
    var data: [UInt8]

    init(width: Int, height: Int) {
        self.width = width
        self.height = height
        data = [UInt8](repeating: 255, count: width * height * 4)
    }

    /// Fills every pixel from `shade(x, y)` (RGBA, 0..1), rows in parallel.
    static func render(_ width: Int, _ height: Int, _ shade: @Sendable (Int, Int) -> SIMD4<Float>) -> PixelImage {
        var image = PixelImage(width: width, height: height)
        image.data.withUnsafeMutableBufferPointer { buffer in
            let base = buffer.baseAddress!
            nonisolated(unsafe) let pixels = base
            DispatchQueue.concurrentPerform(iterations: height) { y in
                for x in 0..<width {
                    let c = simd_clamp(shade(x, y), .zero, .one) * 255
                    let i = (y * width + x) * 4
                    pixels[i] = UInt8(c.x.rounded())
                    pixels[i + 1] = UInt8(c.y.rounded())
                    pixels[i + 2] = UInt8(c.z.rounded())
                    pixels[i + 3] = UInt8(c.w.rounded())
                }
            }
        }
        return image
    }

    var cgImage: CGImage {
        let provider = CGDataProvider(data: Data(data) as CFData)!
        return CGImage(
            width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
            bytesPerRow: width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
            provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)!
    }
}

/// The three maps of a PBR surface.
nonisolated struct SurfaceMaps: Sendable {
    let albedo: PixelImage
    let roughness: PixelImage
    let normal: PixelImage
}

/// Tileable noise and the game's surfaces drawn from it (asphalt, grass, gravel, kerbs, walls) at
/// high resolution: the realistic look of the macOS app (01_docs/macos.md#rendering). Pure CPU
/// work, done off the main thread while the race loads.
nonisolated enum ProceduralTextures {
    // MARK: Noise

    /// Hash of a lattice point to 0..1 (stable: the same texture every run).
    @inline(__always) static func hash(_ x: Int32, _ y: Int32, _ seed: Int32) -> Float {
        var h = UInt32(bitPattern: x &* 374_761_393 &+ y &* 668_265_263 &+ seed &* 1_442_695_041)
        h = (h ^ (h >> 13)) &* 1_274_126_177
        h ^= h >> 16
        return Float(h & 0xFFFFFF) / Float(0xFFFFFF)
    }

    /// Value noise at (u, v) in lattice units, wrapping every `period` cells (tileable).
    @inline(__always) static func noise(_ u: Float, _ v: Float, period: Int32, seed: Int32) -> Float {
        let x0 = Int32(floor(u))
        let y0 = Int32(floor(v))
        let fx = u - Float(x0)
        let fy = v - Float(y0)
        let sx = fx * fx * (3 - 2 * fx)
        let sy = fy * fy * (3 - 2 * fy)
        func wrap(_ i: Int32) -> Int32 { ((i % period) + period) % period }
        let a = hash(wrap(x0), wrap(y0), seed)
        let b = hash(wrap(x0 + 1), wrap(y0), seed)
        let c = hash(wrap(x0), wrap(y0 + 1), seed)
        let d = hash(wrap(x0 + 1), wrap(y0 + 1), seed)
        return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy
    }

    /// Fractal noise in 0..1 at texture coordinates (s, t) in 0..1: `octaves` layers from `period`
    /// cells across the texture, each twice as fine and half as strong.
    static func fbm(_ s: Float, _ t: Float, period: Int32, octaves: Int, seed: Int32, gain: Float = 0.5) -> Float {
        var sum: Float = 0
        var amplitude: Float = 1
        var total: Float = 0
        var p = period
        for octave in 0..<octaves {
            sum += noise(s * Float(p), t * Float(p), period: p, seed: seed &+ Int32(octave) &* 31) * amplitude
            total += amplitude
            amplitude *= gain
            p *= 2
        }
        return sum / total
    }

    /// A tangent-space normal map from a tileable height field (`height(x, y)` in 0..1).
    static func normalMap(_ size: Int, strength: Float, _ height: [Float]) -> PixelImage {
        PixelImage.render(size, size) { x, y in
            func h(_ dx: Int, _ dy: Int) -> Float {
                height[((y + dy + size) % size) * size + (x + dx + size) % size]
            }
            let gx = (h(1, 0) - h(-1, 0)) * strength
            let gy = (h(0, 1) - h(0, -1)) * strength
            let n = simd_normalize(SIMD3<Float>(-gx, -gy, 1))
            return SIMD4(n * 0.5 + 0.5, 1)
        }
    }

    /// A height field of `size`², rows in parallel.
    static func heightField(_ size: Int, _ value: @Sendable (Float, Float) -> Float) -> [Float] {
        var field = [Float](repeating: 0, count: size * size)
        field.withUnsafeMutableBufferPointer { buffer in
            nonisolated(unsafe) let out = buffer.baseAddress!
            DispatchQueue.concurrentPerform(iterations: size) { y in
                for x in 0..<size {
                    out[y * size + x] = value(Float(x) / Float(size), Float(y) / Float(size))
                }
            }
        }
        return field
    }

    static func gray(_ value: Float) -> SIMD4<Float> { SIMD4(value, value, value, 1) }

    static func mix(_ a: SIMD3<Float>, _ b: SIMD3<Float>, _ t: Float) -> SIMD3<Float> {
        a + (b - a) * simd_clamp(t, 0, 1)
    }

    // MARK: Surfaces

    /// Race asphalt: dark aggregate with light stones, fine bumps, slightly smoother where polished.
    static func asphalt(_ size: Int = 1024) -> SurfaceMaps {
        let grain = heightField(size) { s, t in fbm(s, t, period: 64, octaves: 4, seed: 11) }
        let stones = heightField(size) { s, t in
            let n = noise(s * 420, t * 420, period: 420, seed: 7)
            return n > 0.86 ? (n - 0.86) / 0.14 : 0
        }
        let patches = heightField(size) { s, t in fbm(s, t, period: 4, octaves: 3, seed: 3) }
        let albedo = PixelImage.render(size, size) { x, y in
            let i = y * size + x
            // sRGB values: ~0.3 is real asphalt's ~0.08 linear albedo.
            let base = 0.22 + grain[i] * 0.08 + (patches[i] - 0.5) * 0.06
            let lit = base + stones[i] * 0.22
            return SIMD4(lit, lit, lit * 1.02, 1)
        }
        let roughness = PixelImage.render(size, size) { x, y in
            let i = y * size + x
            return gray(0.78 + grain[i] * 0.14 - stones[i] * 0.2 - (patches[i] - 0.5) * 0.12)
        }
        let height = zip(grain, stones).map { $0 * 0.7 + $1 * 0.6 }
        return SurfaceMaps(albedo: albedo, roughness: roughness, normal: normalMap(size, strength: 6, height))
    }

    /// Mown grass: green blades and lighter/darker patches.
    static func grass(_ size: Int = 1024) -> SurfaceMaps {
        let blades = heightField(size) { s, t in fbm(s, t, period: 128, octaves: 3, seed: 21) }
        let patches = heightField(size) { s, t in fbm(s, t, period: 6, octaves: 4, seed: 22) }
        let dark = SIMD3<Float>(0.06, 0.16, 0.035)
        let light = SIMD3<Float>(0.20, 0.34, 0.08)
        let albedo = PixelImage.render(size, size) { x, y in
            let i = y * size + x
            let c = mix(dark, light, patches[i] * 1.2 - 0.1 + (blades[i] - 0.5) * 0.6)
            return SIMD4(c, 1)
        }
        let roughness = PixelImage.render(size, size) { x, y in gray(0.88 + blades[y * size + x] * 0.1) }
        return SurfaceMaps(albedo: albedo, roughness: roughness, normal: normalMap(size, strength: 4, blades))
    }

    /// Gravel trap: rounded beige pebbles.
    static func gravel(_ size: Int = 1024) -> SurfaceMaps {
        let pebbles = heightField(size) { s, t in
            let n = fbm(s, t, period: 96, octaves: 2, seed: 31, gain: 0.35)
            return pow(n, 1.6)
        }
        let tint = heightField(size) { s, t in noise(s * 96, t * 96, period: 96, seed: 32) }
        let albedo = PixelImage.render(size, size) { x, y in
            let i = y * size + x
            let c = mix(SIMD3(0.36, 0.31, 0.24), SIMD3(0.72, 0.65, 0.52), pebbles[i] * 1.3 + (tint[i] - 0.5) * 0.4)
            return SIMD4(c, 1)
        }
        let roughness = PixelImage.render(size, size) { x, y in gray(0.9 - pebbles[y * size + x] * 0.15) }
        return SurfaceMaps(albedo: albedo, roughness: roughness, normal: normalMap(size, strength: 10, pebbles))
    }

    /// Kerb: two colour blocks along the track (V: one repeat = two blocks), ridged across.
    static func kerb(_ a: SIMD3<Float>, _ b: SIMD3<Float>, _ size: Int = 512) -> SurfaceMaps {
        let wear = heightField(size) { s, t in fbm(s, t, period: 16, octaves: 4, seed: 41) }
        let albedo = PixelImage.render(size, size) { x, y in
            let colour = y < size / 2 ? a : b
            let dirt = (wear[y * size + x] - 0.5) * 0.18
            return SIMD4(colour * (0.92 + dirt), 1)
        }
        let roughness = PixelImage.render(size, size) { x, y in gray(0.45 + wear[y * size + x] * 0.25) }
        let ridges = heightField(size) { s, t in
            let ridge = 0.5 + 0.5 * cos(s * .pi * 2 * 6)
            return ridge * 0.6 + fbm(s, t, period: 32, octaves: 2, seed: 42) * 0.2
        }
        return SurfaceMaps(albedo: albedo, roughness: roughness, normal: normalMap(size, strength: 3, ridges))
    }

    /// Kerb painted in `colors` blocks in turn along the track (V: one repeat = every colour once),
    /// ridged across like `kerb` (a circuit's own: São Paulo's Senna S).
    static func kerbStripes(_ colors: [SIMD3<Float>], _ size: Int = 512) -> SurfaceMaps {
        let wear = heightField(size) { s, t in fbm(s, t, period: 16, octaves: 4, seed: 41) }
        let albedo = PixelImage.render(size, size) { x, y in
            let colour = colors[min(colors.count - 1, y * colors.count / size)]
            let dirt = (wear[y * size + x] - 0.5) * 0.18
            return SIMD4(colour * (0.92 + dirt), 1)
        }
        let roughness = PixelImage.render(size, size) { x, y in gray(0.45 + wear[y * size + x] * 0.25) }
        let ridges = heightField(size) { s, t in
            let ridge = 0.5 + 0.5 * cos(s * .pi * 2 * 6)
            return ridge * 0.6 + fbm(s, t, period: 32, octaves: 2, seed: 42) * 0.2
        }
        return SurfaceMaps(albedo: albedo, roughness: roughness, normal: normalMap(size, strength: 3, ridges))
    }

    /// Galvanised steel of a guard rail: brushed along it, two beams and the bolts' line.
    static func armco(_ size: Int = 512) -> SurfaceMaps {
        let brushed = heightField(size) { s, t in fbm(s * 0.05, t, period: 128, octaves: 3, seed: 51) }
        let albedo = PixelImage.render(size, size) { x, y in
            let v = Float(y) / Float(size)
            let beam = (v > 0.35 && v < 0.6) || (v > 0.66 && v < 0.9)
            let c: Float = beam ? 0.62 + brushed[y * size + x] * 0.12 : 0.45
            return SIMD4(c, c, c * 1.03, 1)
        }
        let roughness = PixelImage.render(size, size) { x, y in gray(0.5 + brushed[y * size + x] * 0.2) }
        let height = heightField(size) { s, t in
            let ridge: Float = (t > 0.35 && t < 0.6) || (t > 0.66 && t < 0.9) ? 1 : 0
            return ridge * 0.8 + fbm(s * 0.05, t, period: 128, octaves: 2, seed: 52) * 0.1
        }
        return SurfaceMaps(albedo: albedo, roughness: roughness, normal: normalMap(size, strength: 4, height))
    }

    /// A tyre wall: stacks of black tyres seen side on (one repeat = four stacks), red and white belts.
    static func tyreWall(_ size: Int = 512) -> SurfaceMaps {
        let height = heightField(size) { s, t in
            let cx = (s * 4).truncatingRemainder(dividingBy: 1) - 0.5
            let cy = (t * 3).truncatingRemainder(dividingBy: 1) - 0.5
            let r = sqrt(cx * cx + cy * cy * 0.6)
            return r < 0.48 ? 1 - r : 0.2
        }
        let albedo = PixelImage.render(size, size) { x, y in
            let t = Float(y) / Float(size)
            let i = y * size + x
            if t > 0.30 && t < 0.37 { return SIMD4(0.75, 0.05, 0.04, 1) }
            if t > 0.63 && t < 0.70 { return SIMD4(0.85, 0.85, 0.85, 1) }
            let c = 0.025 + height[i] * 0.03
            return SIMD4(c, c, c, 1)
        }
        let roughness = PixelImage.render(size, size) { x, y in gray(0.75 - height[y * size + x] * 0.1) }
        return SurfaceMaps(albedo: albedo, roughness: roughness, normal: normalMap(size, strength: 5, height))
    }

    /// The start line: a two-row chequer (16 squares across one repeat).
    static func checker(_ size: Int = 256) -> PixelImage {
        PixelImage.render(size, size) { x, y in
            let dark = (x * 16 / size + y * 2 / size) % 2 == 0
            return dark ? gray(0.03) : gray(0.85)
        }
    }

    // MARK: Sky

    /// The sun's direction (unit, pointing at the sun), shared by the sky image and the sun light.
    static let sunDirection = simd_normalize(SIMD3<Float>(0.45, 0.62, 0.35))

    /// A night race's sky: deep navy overhead, the city's warm glow along the horizon, stars.
    static func nightSky(width: Int = 2048) -> PixelImage {
        let height = width / 2
        let zenith = SIMD3<Float>(0.006, 0.012, 0.04)
        let horizon = SIMD3<Float>(0.05, 0.06, 0.12)
        let glow = SIMD3<Float>(0.32, 0.2, 0.12)
        return PixelImage.render(width, height) { x, y in
            let v = (Float(y) + 0.5) / Float(height)
            let elevation = (0.5 - v) * .pi
            var c: SIMD3<Float>
            if elevation >= 0 {
                c = mix(horizon, zenith, pow(sin(elevation), 0.5))
                c += glow * exp(-elevation * 14)
                // Stars: a sparse scatter, fainter towards the glowing horizon.
                let star = hash(Int32(x), Int32(y), 97)
                if star > 0.9985 && elevation > 0.12 { c += SIMD3(repeating: (star - 0.9985) / 0.0015 * 0.9) }
            } else {
                c = mix(horizon * 0.8 + glow * 0.4, SIMD3(0.02, 0.02, 0.03), min(1, -elevation * 5))
            }
            return SIMD4(c, 1)
        }
    }

    /// An equirectangular sky: blue zenith to a pale horizon, soft clouds, the sun's disc and glow,
    /// a dim ground below the horizon. Lights the scene too (image-based lighting).
    static func sky(width: Int = 2048) -> PixelImage {
        let height = width / 2
        let zenith = SIMD3<Float>(0.16, 0.38, 0.78)
        let horizon = SIMD3<Float>(0.70, 0.82, 0.95)
        let ground = SIMD3<Float>(0.28, 0.30, 0.24)
        return PixelImage.render(width, height) { x, y in
            let u = (Float(x) + 0.5) / Float(width)
            let v = (Float(y) + 0.5) / Float(height)
            let azimuth = u * 2 * .pi
            let elevation = (0.5 - v) * .pi
            let dir = SIMD3<Float>(cos(elevation) * sin(azimuth), sin(elevation), -cos(elevation) * cos(azimuth))
            var c: SIMD3<Float>
            if elevation >= 0 {
                let t = pow(sin(elevation), 0.55)
                c = mix(horizon, zenith, t)
                // Clouds: thin near the horizon, puffier up high.
                let cloud = fbm(u, v * 2, period: 8, octaves: 5, seed: 61)
                let cover = simd_smoothstep(0.52, 0.72, cloud) * min(1, elevation * 6)
                c = mix(c, SIMD3(0.97, 0.97, 0.98), cover * 0.85)
            } else {
                c = mix(horizon * 0.8, ground, min(1, -elevation * 5))
            }
            let toSun = max(0, simd_dot(dir, sunDirection))
            c += SIMD3(1, 0.93, 0.8) * (pow(toSun, 900) * 4 + pow(toSun, 60) * 0.35 + pow(toSun, 6) * 0.08)
            return SIMD4(c, 1)
        }
    }

    /// A rainy day's sky (2.8): low, heavy grey cloud all over, darker overhead, a brighter hazy
    /// band at the horizon, no sun. Lights the scene flat and cool (image-based lighting).
    static func overcastSky(width: Int = 2048) -> PixelImage {
        let height = width / 2
        let zenith = SIMD3<Float>(0.34, 0.36, 0.39)
        let horizon = SIMD3<Float>(0.62, 0.64, 0.66)
        let ground = SIMD3<Float>(0.2, 0.21, 0.21)
        return PixelImage.render(width, height) { x, y in
            let u = (Float(x) + 0.5) / Float(width)
            let v = (Float(y) + 0.5) / Float(height)
            let elevation = (0.5 - v) * .pi
            var c: SIMD3<Float>
            if elevation >= 0 {
                c = mix(horizon, zenith, pow(sin(elevation), 0.6))
                // The cloud's own folds: darker and lighter patches, rain curtains far off.
                let folds = fbm(u * 1.5, v * 3, period: 6, octaves: 5, seed: 83)
                c *= 0.82 + folds * 0.3
            } else {
                c = mix(horizon * 0.75, ground, min(1, -elevation * 5))
            }
            return SIMD4(c, 1)
        }
    }
}
