import Foundation
import simd

/// The scenery's surfaces (the web's `pixelTexture.ts` facades, paving, sea…), drawn at high
/// resolution with their roughness and normal maps. One texture repeat = one window bay and one
/// floor (3.2 m × 3.2 m) for facades; world metres / tile for the ground and the water.
nonisolated enum SceneryTextures {
    typealias T = ProceduralTextures

    static func rgb(_ hex: UInt32) -> SIMD3<Float> {
        SIMD3(Float((hex >> 16) & 0xFF), Float((hex >> 8) & 0xFF), Float(hex & 0xFF)) / 255
    }

    /// A Riviera facade bay: rendered wall, a tall window with its frame and sill, shutters either
    /// side, a cornice line under the next floor.
    static func facade(wall: UInt32, shutter: UInt32, size: Int = 256) -> SurfaceMaps {
        let wallColor = rgb(wall)
        let shutterColor = rgb(shutter)
        let grain = T.heightField(size) { s, t in T.fbm(s, t, period: 16, octaves: 4, seed: 71) }
        @Sendable func region(_ s: Float, _ t: Float) -> Int {
            // 0 wall, 1 window glass, 2 frame, 3 shutter, 4 sill, 5 cornice
            if t > 0.94 { return 5 }
            if t > 0.70 && t < 0.75 && s > 0.26 && s < 0.74 { return 4 }
            if s > 0.12 && s < 0.26 && t > 0.2 && t < 0.72 { return 3 }
            if s > 0.74 && s < 0.88 && t > 0.2 && t < 0.72 { return 3 }
            if s > 0.30 && s < 0.70 && t > 0.2 && t < 0.70 { return (s < 0.33 || s > 0.67 || t < 0.23 || abs(s - 0.5) < 0.012) ? 2 : 1 }
            return 0
        }
        let albedo = PixelImage.render(size, size) { x, y in
            let s = Float(x) / Float(size)
            let t = Float(y) / Float(size)
            let g = grain[y * size + x]
            switch region(s, t) {
            case 1: return SIMD4(SIMD3(0.10, 0.14, 0.18) + SIMD3(repeating: (1 - t) * 0.18), 1)
            case 2: return SIMD4(0.93, 0.92, 0.88, 1)
            case 3:
                let slat = Float(Int(t * 60) % 2) * 0.06
                return SIMD4(shutterColor * (0.85 + slat), 1)
            case 4, 5: return SIMD4(wallColor * 1.08 + 0.04, 1)
            default: return SIMD4(wallColor * (0.9 + (g - 0.5) * 0.18), 1)
            }
        }
        let roughness = PixelImage.render(size, size) { x, y in
            let r = region(Float(x) / Float(size), Float(y) / Float(size))
            return T.gray(r == 1 ? 0.08 : r == 2 ? 0.4 : 0.88)
        }
        let height = T.heightField(size) { s, t in
            switch region(s, t) {
            case 1: return 0.0
            case 2, 4, 5: return 0.9
            case 3: return 0.75 + 0.1 * Float(Int(t * 60) % 2)
            default: return 0.6 + T.fbm(s, t, period: 32, octaves: 2, seed: 72) * 0.15
            }
        }
        return SurfaceMaps(albedo: albedo, roughness: roughness, normal: T.normalMap(size, strength: 3, height))
    }

    /// A modern tower's curtain wall: blue-grey glass panels between slim mullions and spandrels.
    static func glass(size: Int = 256) -> SurfaceMaps {
        @Sendable func frame(_ s: Float, _ t: Float) -> Bool { s < 0.04 || abs(s - 0.5) < 0.02 || t > 0.86 }
        let albedo = PixelImage.render(size, size) { x, y in
            let s = Float(x) / Float(size)
            let t = Float(y) / Float(size)
            if frame(s, t) { return SIMD4(0.55, 0.58, 0.6, 1) }
            let tint = T.noise(s * 2, t * 2, period: 2, seed: 81) * 0.06
            return SIMD4(0.12 + tint, 0.2 + tint, 0.27 + tint, 1)
        }
        let roughness = PixelImage.render(size, size) { x, y in
            T.gray(frame(Float(x) / Float(size), Float(y) / Float(size)) ? 0.35 : 0.04)
        }
        let height = T.heightField(size) { s, t in frame(s, t) ? 1 : 0 }
        return SurfaceMaps(albedo: albedo, roughness: roughness, normal: T.normalMap(size, strength: 2, height))
    }

    /// The Casino's Belle Époque stone: cream ashlar, an arched window, a carved band.
    static func belleEpoque(size: Int = 256) -> SurfaceMaps {
        let grain = T.heightField(size) { s, t in T.fbm(s, t, period: 8, octaves: 4, seed: 103) }
        @Sendable func window(_ s: Float, _ t: Float) -> Bool {
            let dx = s - 0.5
            let arch = t < 0.36 ? (dx * dx * 4 + (t - 0.36) * (t - 0.36) * 16 < 0.18) : true
            return abs(dx) < 0.19 && t > 0.2 && t < 0.86 && arch
        }
        let albedo = PixelImage.render(size, size) { x, y in
            let s = Float(x) / Float(size)
            let t = Float(y) / Float(size)
            if window(s, t) { return SIMD4(0.12, 0.15, 0.19, 1) }
            let joint: Float = (Int(t * 8) != Int((t - 0.006) * 8)) || t > 0.93 ? 0.85 : 1
            let c = SIMD3<Float>(0.93, 0.87, 0.74) * (0.94 + (grain[y * size + x] - 0.5) * 0.12) * joint
            return SIMD4(c, 1)
        }
        let roughness = PixelImage.render(size, size) { x, y in
            T.gray(window(Float(x) / Float(size), Float(y) / Float(size)) ? 0.06 : 0.82)
        }
        let height = T.heightField(size) { s, t in
            window(s, t) ? 0 : (t > 0.93 ? 1 : 0.7 + T.fbm(s, t, period: 16, octaves: 2, seed: 104) * 0.1)
        }
        return SurfaceMaps(albedo: albedo, roughness: roughness, normal: T.normalMap(size, strength: 3, height))
    }

    /// Stone paving (Monaco's streets and squares): rectangular slabs, joints, worn grey-beige.
    static func paving(size: Int = 512) -> SurfaceMaps {
        let grain = T.heightField(size) { s, t in T.fbm(s, t, period: 32, octaves: 4, seed: 111) }
        let slab = T.heightField(size) { s, t in
            let row = Int(t * 6)
            let shift: Float = row % 2 == 0 ? 0 : 0.5
            let u = (s * 4 + shift).truncatingRemainder(dividingBy: 1)
            let v = (t * 6).truncatingRemainder(dividingBy: 1)
            return (u < 0.03 || v < 0.05) ? 0 : 1
        }
        let tone = T.heightField(size) { s, t in
            let row = Int(t * 6)
            let col = Int(s * 4 + (row % 2 == 0 ? 0 : 0.5))
            return T.hash(Int32(col), Int32(row), 5)
        }
        let albedo = PixelImage.render(size, size) { x, y in
            let i = y * size + x
            let c = SIMD3<Float>(0.62, 0.59, 0.53) * (0.85 + tone[i] * 0.2 + (grain[i] - 0.5) * 0.15) * (slab[i] < 0.5 ? 0.6 : 1)
            return SIMD4(c, 1)
        }
        let roughness = PixelImage.render(size, size) { x, y in T.gray(0.8 + grain[y * size + x] * 0.15) }
        let height = zip(slab, grain).map { $0 * 0.8 + $1 * 0.2 }
        return SurfaceMaps(albedo: albedo, roughness: roughness, normal: T.normalMap(size, strength: 4, height))
    }

    /// The sea's surface: small wind ripples on long swells (normal map only; the colour is the
    /// material's, the reflections the sky's).
    static func waterNormal(size: Int = 512) -> PixelImage {
        let waves = T.heightField(size) { s, t in
            T.fbm(s, t, period: 6, octaves: 5, seed: 121, gain: 0.55) * 0.7 + 0.3 * (0.5 + 0.5 * sin((s + t * 0.3) * .pi * 2 * 4))
        }
        return T.normalMap(size, strength: 2.5, waves)
    }

    /// Pool water: pale blue tiles under it, lane lines.
    static func pool(size: Int = 256) -> PixelImage {
        PixelImage.render(size, size) { x, y in
            let s = Float(x) / Float(size)
            let t = Float(y) / Float(size)
            let joint = (s * 8).truncatingRemainder(dividingBy: 1) < 0.06 || (t * 8).truncatingRemainder(dividingBy: 1) < 0.06
            let lane = abs(s - 0.5) < 0.03
            let c: SIMD3<Float> = lane ? SIMD3(0.05, 0.2, 0.55) : joint ? SIMD3(0.45, 0.75, 0.85) : SIMD3(0.3, 0.68, 0.86)
            return SIMD4(c, 1)
        }
    }

    /// A pier's deck: weathered planks across it.
    static func planks(size: Int = 256) -> SurfaceMaps {
        let grain = T.heightField(size) { s, t in T.fbm(s * 0.15, t * 4, period: 16, octaves: 3, seed: 131) }
        let albedo = PixelImage.render(size, size) { x, y in
            let t = Float(y) / Float(size)
            let board = Int(t * 8)
            let gap = (t * 8).truncatingRemainder(dividingBy: 1) < 0.07
            let tone = T.hash(Int32(board), 3, 9) * 0.15
            let c = SIMD3<Float>(0.55, 0.42, 0.3) * (0.85 + tone + (grain[y * size + x] - 0.5) * 0.3) * (gap ? 0.4 : 1)
            return SIMD4(c, 1)
        }
        let roughness = PixelImage.render(size, size) { _, _ in T.gray(0.85) }
        let height = T.heightField(size) { s, t in (t * 8).truncatingRemainder(dividingBy: 1) < 0.07 ? 0 : 0.8 }
        return SurfaceMaps(albedo: albedo, roughness: roughness, normal: T.normalMap(size, strength: 3, height))
    }

    /// Weathered concrete (walls, the tunnel, pit buildings), with formwork lines.
    static func concrete(size: Int = 256) -> SurfaceMaps {
        let grain = T.heightField(size) { s, t in T.fbm(s, t, period: 16, octaves: 5, seed: 141) }
        let albedo = PixelImage.render(size, size) { x, y in
            let t = Float(y) / Float(size)
            let line: Float = (t * 4).truncatingRemainder(dividingBy: 1) < 0.015 ? 0.8 : 1
            let c = 0.55 + (grain[y * size + x] - 0.5) * 0.16
            return SIMD4(SIMD3(c, c, c * 0.98) * line, 1)
        }
        let roughness = PixelImage.render(size, size) { x, y in T.gray(0.82 + grain[y * size + x] * 0.12) }
        return SurfaceMaps(albedo: albedo, roughness: roughness, normal: T.normalMap(size, strength: 2, grain))
    }

    /// A grandstand's seats full of spectators: rows of coloured shirts and faces.
    static func crowd(size: Int = 256) -> PixelImage {
        let shirts: [SIMD3<Float>] = [
            SIMD3(0.9, 0.3, 0.25), SIMD3(0.25, 0.6, 0.75), SIMD3(0.95, 0.8, 0.45), SIMD3(0.55, 0.35, 0.8),
            SIMD3(0.92, 0.92, 0.9), SIMD3(0.2, 0.4, 0.8), SIMD3(0.85, 0.1, 0.1), SIMD3(0.15, 0.15, 0.18),
        ]
        return PixelImage.render(size, size) { x, y in
            let col = x / 16
            let row = y / 32
            let lx = x % 16
            let ly = y % 32
            let h = T.hash(Int32(col), Int32(row), 37)
            if h < 0.15 || ly > 26 { return SIMD4(0.55, 0.12, 0.14, 1) }  // an empty red seat, the step
            let shirt = shirts[Int(h * 1000) % shirts.count]
            if ly < 9 && lx > 4 && lx < 11 { return SIMD4(0.88, 0.7, 0.55, 1) }  // a face
            if lx > 2 && lx < 14 && ly >= 9 { return SIMD4(shirt, 1) }
            return SIMD4(0.55, 0.12, 0.14, 1)
        }
    }

    /// Pit garages: tall grey roller doors in a white frame.
    static func garage(size: Int = 256) -> PixelImage {
        PixelImage.render(size, size) { x, y in
            let s = Float(x) / Float(size)
            let t = Float(y) / Float(size)
            if s < 0.06 || s > 0.94 || t < 0.12 { return SIMD4(0.92, 0.92, 0.9, 1) }
            let slat: Float = Int(t * 40) % 2 == 0 ? 0.42 : 0.38
            return SIMD4(slat, slat, slat + 0.02, 1)
        }
    }

    /// A night facade: 8 × 8 windows per repeat on a dark wall, `lit` of them glowing warm or cool
    /// white (seeded): the colour map and the emission map.
    static func nightFacade(wall: UInt32, lit: Float, seed: Int32, size: Int = 512) -> (albedo: PixelImage, emissive: PixelImage) {
        let wallColor = rgb(wall)
        @Sendable func window(_ x: Int, _ y: Int) -> (inside: Bool, col: Int32, row: Int32) {
            let cell = size / 8
            let lx = x % cell
            let ly = y % cell
            let inside = lx > cell / 5 && lx < cell * 4 / 5 && ly > cell / 4 && ly < cell * 4 / 5
            return (inside, Int32(x / cell), Int32(y / cell))
        }
        let albedo = PixelImage.render(size, size) { x, y in
            let w = window(x, y)
            return w.inside ? SIMD4(0.05, 0.06, 0.08, 1) : SIMD4(wallColor, 1)
        }
        let emissive = PixelImage.render(size, size) { x, y in
            let w = window(x, y)
            guard w.inside else { return SIMD4(0, 0, 0, 1) }
            let h = T.hash(w.col, w.row, seed)
            guard h < lit else { return SIMD4(0, 0, 0, 1) }
            let warm = T.hash(w.col, w.row, seed + 1) < 0.7
            let c: SIMD3<Float> = warm ? SIMD3(1, 0.78, 0.45) : SIMD3(0.75, 0.88, 1)
            return SIMD4(c * (0.6 + T.hash(w.col, w.row, seed + 2) * 0.4), 1)
        }
        return (albedo, emissive)
    }

    /// An image's alpha as grey (white = solid): an opacity mask.
    static func alphaMask(_ image: PixelImage) -> PixelImage {
        PixelImage.render(image.width, image.height) { x, y in
            let a = Float(image.data[(y * image.width + x) * 4 + 3]) / 255
            return SIMD4(a, a, a, 1)
        }
    }

    /// A catch fence: steel wire diamonds (alpha cut out between), a post every repeat.
    static func chainFence(size: Int = 256) -> PixelImage {
        PixelImage.render(size, size) { x, y in
            let s = Float(x) / Float(size)
            let t = Float(y) / Float(size)
            let a = (s * 6 + t * 6).truncatingRemainder(dividingBy: 1)
            let b = (s * 6 - t * 6 + 12).truncatingRemainder(dividingBy: 1)
            let wire = a < 0.07 || b < 0.07
            let post = s < 0.025 || t > 0.97
            if post { return SIMD4(0.25, 0.26, 0.28, 1) }
            return wire ? SIMD4(0.42, 0.44, 0.46, 1) : SIMD4(0, 0, 0, 0)
        }
    }
}
