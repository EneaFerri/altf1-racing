import AltF1Core
import Foundation
import AppKit
import Metal
import RealityKit

/// A real circuit's surroundings as entities, and how its walls are drawn (01_docs/macos.md#scenery-x5).
struct CircuitSceneryResult {
    let entity: Entity
    let wallStyles: [WallStyle]
    /// The circuit's own look (a night race, …).
    let look: CircuitLook
    /// Whether the land replaces the plain ground plane.
    let hasGround: Bool
    /// The run-off's surface beside the road (the circuit's ground).
    let runoff: (any RealityKit.Material)?
}

@MainActor
enum CircuitSceneryBuilder {
    /// The scenery of circuit `id` on `track`; nil for a circuit not done yet (it keeps the plain look).
    static func build(_ track: Track, circuitId: String) async throws -> CircuitSceneryResult? {
        guard let look = CircuitLook.of(circuitId) else { return nil }
        let (scenery, land) = try CircuitCatalog.scenery(circuitId)
        async let materials = SceneryMaterials.load(look)
        let result = await Task.detached { SceneryGeometry.build(track, scenery, land, look) }.value
        let m = try await materials
        let root = Entity()
        root.name = "scenery"
        for (part, builder) in result.parts.meshes {
            guard let material = m.material(part), let entity = try builder.entity(material, name: "\(part)") else { continue }
            if [.tunnelLights, .hills, .sea, .floodLamp, .flyerRim, .skyParkEdge].contains(part) {
                // Lights and far hills cast no shadow; nor does the sea.
                entity.components.set(DynamicLightShadowComponent(castsShadow: false))
            }
            root.addChild(entity)
        }
        return CircuitSceneryResult(
            entity: root, wallStyles: result.parts.wallStyles, look: look, hasGround: result.ground != nil,
            runoff: m.material(.groundLow))
    }
}

/// The scenery's PBR materials.
@MainActor
struct SceneryMaterials {
    private var byPart: [SceneryParts.Part: any RealityKit.Material] = [:]

    func material(_ part: SceneryParts.Part) -> (any RealityKit.Material)? { byPart[part] }

    static func load(_ look: CircuitLook) async throws -> SceneryMaterials {
        typealias S = SceneryTextures
        async let facadeMaps = Task.detached { SceneryGeometry.facades.map { S.facade(wall: $0.0, shutter: $0.1) } }.value
        async let glass = Task.detached { S.glass() }.value
        async let stone = Task.detached { S.belleEpoque() }.value
        async let chapel = Task.detached { S.facade(wall: 0xE9C88E, shutter: 0x8A5A3A) }.value
        async let paving = Task.detached { S.paving() }.value
        async let grass = Task.detached { ProceduralTextures.grass() }.value
        async let water = Task.detached { S.waterNormal() }.value
        async let pool = Task.detached { S.pool() }.value
        async let planks = Task.detached { S.planks() }.value
        async let concrete = Task.detached { S.concrete() }.value
        async let crowd = Task.detached { S.crowd() }.value
        async let garage = Task.detached { S.garage() }.value

        var m = SceneryMaterials()
        for (i, maps) in await facadeMaps.enumerated() { m.byPart[.facade(i)] = try await pbr(maps) }
        var glassMaterial = try await pbr(glass)
        glassMaterial.metallic = 0.6
        m.byPart[.glass] = glassMaterial
        m.byPart[.belleEpoque] = try await pbr(stone)
        m.byPart[.chapel] = try await pbr(chapel)
        let ground = try await pbr(look.ground == .paving ? paving : grass)
        m.byPart[.groundLow] = ground
        m.byPart[.groundHigh] = try await pbr(grass)
        m.byPart[.roofTiles] = plain(0xB4593B, roughness: 0.75)
        m.byPart[.roofFlat] = plain(0xC9C4B8, roughness: 0.85)
        m.byPart[.copper] = plain(0x6F9A8A, roughness: 0.45, metallic: 0.5)

        // The sea: deep blue-green, glossy, its ripples in the normal map: it mirrors the sky.
        var sea = PhysicallyBasedMaterial()
        sea.baseColor = .init(tint: .init(red: 0.03, green: 0.16, blue: 0.24, alpha: 1))
        sea.roughness = 0.05
        sea.metallic = 0.0
        sea.clearcoat = 1.0
        sea.clearcoatRoughness = 0.02
        sea.normal = .init(texture: try await texture(water, .normal))
        sea.faceCulling = .none
        m.byPart[.sea] = sea
        var poolMaterial = PhysicallyBasedMaterial()
        poolMaterial.baseColor = .init(texture: try await texture(pool, .color))
        poolMaterial.roughness = 0.08
        poolMaterial.clearcoat = 1.0
        poolMaterial.faceCulling = .none
        m.byPart[.pool] = poolMaterial
        m.byPart[.piers] = try await pbr(planks)
        let concreteMaterial = try await pbr(concrete)
        for part in [SceneryParts.Part.standConcrete, .pitConcrete, .tunnelOutside] { m.byPart[part] = concreteMaterial }
        var tunnelInside = concreteMaterial
        tunnelInside.baseColor.tint = .init(white: 0.6, alpha: 1)
        m.byPart[.tunnelInside] = tunnelInside
        m.byPart[.pitLane] = plain(0x3A3A3E, roughness: 0.85)
        var crowdMaterial = PhysicallyBasedMaterial()
        crowdMaterial.baseColor = .init(texture: try await texture(crowd, .color))
        crowdMaterial.roughness = 0.9
        m.byPart[.standCrowd] = crowdMaterial
        m.byPart[.standRoof] = plain(0xE8E8E8, roughness: 0.5, metallic: 0.3)
        var garageMaterial = PhysicallyBasedMaterial()
        garageMaterial.baseColor = .init(texture: try await texture(garage, .color))
        garageMaterial.roughness = 0.6
        m.byPart[.pitGarage] = garageMaterial
        m.byPart[.hullWhite] = plain(0xF2F2EF, roughness: 0.25)
        m.byPart[.hullNavy] = plain(0x1F2C44, roughness: 0.25)
        m.byPart[.superstructure] = plain(0xF7F7F4, roughness: 0.3)
        var cabin = plain(0x1C2530, roughness: 0.05)
        cabin.metallic = 0.5
        m.byPart[.cabinGlass] = cabin
        m.byPart[.palmTrunk] = plain(0x8A6A4A, roughness: 0.9)
        m.byPart[.palmFronds] = plain(0x4F8A3A, roughness: 0.7)
        m.byPart[.treeTrunk] = plain(0x5A4030, roughness: 0.9)
        m.byPart[.treeCrown] = plain(look.trees == .pines ? 0x2F5230 : 0x3C6A2E, roughness: 0.85)
        var lights = PhysicallyBasedMaterial()
        lights.baseColor = .init(tint: .init(red: 1, green: 0.85, blue: 0.63, alpha: 1))
        lights.emissiveColor = .init(color: .init(red: 1, green: 0.85, blue: 0.63, alpha: 1))
        lights.emissiveIntensity = 3
        m.byPart[.tunnelLights] = lights
        m.byPart[.hills] = plain(0x7D8A6A, roughness: 0.95)
        if look.night { try await m.addNight() }
        return m
    }

    /// A night race's materials: lit windows, dark roofs, floodlights, the landmarks' lights.
    private mutating func addNight() async throws {
        typealias S = SceneryTextures
        let walls: [(UInt32, Float)] = [(0x2A2F3A, 0.45), (0x33302C, 0.4), (0x262B36, 0.55)]
        let facades = await Task.detached {
            walls.enumerated().map { S.nightFacade(wall: $0.element.0, lit: $0.element.1, seed: Int32(11 + $0.offset)) }
                + [S.nightFacade(wall: 0x1C2433, lit: 0.6, seed: 14)]
        }.value
        for (i, maps) in facades.enumerated() {
            var material = PhysicallyBasedMaterial()
            material.baseColor = .init(texture: try await Self.texture(maps.albedo, .color))
            material.emissiveColor = .init(texture: try await Self.texture(maps.emissive, .color))
            material.emissiveIntensity = 1.6
            material.roughness = 0.5
            material.faceCulling = .none
            byPart[i < 3 ? .nightWall(i) : .nightTower] = material
        }
        byPart[.roofNight] = Self.plain(0x2B2F38, roughness: 0.8)
        byPart[.floodPole] = Self.plain(0x59606B, roughness: 0.5, metallic: 0.6)
        byPart[.floodLamp] = Self.glow(0xFFF4D6, 4)
        byPart[.flyerRim] = Self.glow(0xBFE6FF, 3)
        byPart[.skyParkEdge] = Self.glow(0xD8F0FF, 2.5)
        byPart[.flyerSteel] = Self.plain(0xCFD6DC, roughness: 0.4, metallic: 0.7)
        byPart[.flyerCapsule] = Self.plain(0xE8EEF2, roughness: 0.2, metallic: 0.3)
        byPart[.skyParkDeck] = Self.plain(0x4A5560, roughness: 0.5, metallic: 0.4)
        byPart[.durian] = Self.plain(0x8D949B, roughness: 0.35, metallic: 0.8)
        // The ground away from the floodlights: darker (the web's night tint).
        if var grass = byPart[.groundLow] as? PhysicallyBasedMaterial {
            grass.baseColor.tint = .init(red: 0.33, green: 0.37, blue: 0.42, alpha: 1)
            byPart[.groundLow] = grass
        }
        // The bay at night: darker water still mirroring the lights.
        if var sea = byPart[.sea] as? PhysicallyBasedMaterial {
            sea.baseColor.tint = .init(red: 0.02, green: 0.04, blue: 0.08, alpha: 1)
            byPart[.sea] = sea
        }
    }

    /// An emissive light (a lamp, a lit rim) of `hex`, `intensity` times bright.
    private static func glow(_ hex: UInt32, _ intensity: Float) -> PhysicallyBasedMaterial {
        let c = SceneryTextures.rgb(hex)
        let color = NSColor(red: CGFloat(c.x), green: CGFloat(c.y), blue: CGFloat(c.z), alpha: 1)
        var material = PhysicallyBasedMaterial()
        material.baseColor = .init(tint: color)
        material.emissiveColor = .init(color: color)
        material.emissiveIntensity = intensity
        material.faceCulling = .none
        return material
    }

    private static func plain(_ hex: UInt32, roughness: Float, metallic: Float = 0) -> PhysicallyBasedMaterial {
        let c = SceneryTextures.rgb(hex)
        var material = PhysicallyBasedMaterial()
        material.baseColor = .init(tint: .init(red: CGFloat(c.x), green: CGFloat(c.y), blue: CGFloat(c.z), alpha: 1))
        material.roughness = .init(floatLiteral: roughness)
        material.metallic = .init(floatLiteral: metallic)
        material.faceCulling = .none
        return material
    }

    private static func pbr(_ maps: SurfaceMaps) async throws -> PhysicallyBasedMaterial {
        var material = PhysicallyBasedMaterial()
        material.baseColor = .init(texture: try await texture(maps.albedo, .color))
        material.roughness = .init(texture: try await texture(maps.roughness, .raw))
        material.normal = .init(texture: try await texture(maps.normal, .normal))
        material.faceCulling = .none
        return material
    }

    private static func texture(_ image: PixelImage, _ semantic: TextureResource.Semantic) async throws -> MaterialParameters.Texture {
        let resource = try await TextureResource(image: image.cgImage, options: .init(semantic: semantic))
        let descriptor = MTLSamplerDescriptor()
        descriptor.sAddressMode = .repeat
        descriptor.tAddressMode = .repeat
        descriptor.minFilter = .linear
        descriptor.magFilter = .linear
        descriptor.mipFilter = .linear
        descriptor.maxAnisotropy = 16
        return MaterialParameters.Texture(resource, sampler: .init(descriptor))
    }
}
