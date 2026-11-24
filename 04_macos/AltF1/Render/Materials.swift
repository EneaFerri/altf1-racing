import Metal
import RealityKit

/// The race's PBR materials, built from `ProceduralTextures` (01_docs/macos.md#rendering).
struct RaceMaterials {
    let asphalt: PhysicallyBasedMaterial
    let line: PhysicallyBasedMaterial
    let lowKerb: PhysicallyBasedMaterial
    let highKerb: PhysicallyBasedMaterial
    let gravel: PhysicallyBasedMaterial
    let grass: PhysicallyBasedMaterial
    let armco: PhysicallyBasedMaterial
    let tyreWall: PhysicallyBasedMaterial
    let checker: PhysicallyBasedMaterial
    let concrete: PhysicallyBasedMaterial
    /// A wire catch fence: cut out between the wires.
    let fence: PhysicallyBasedMaterial

    /// Draws every texture (in parallel, off the main thread), then uploads them.
    static func load() async throws -> RaceMaterials {
        async let asphalt = Task.detached { ProceduralTextures.asphalt() }.value
        async let grass = Task.detached { ProceduralTextures.grass() }.value
        async let gravel = Task.detached { ProceduralTextures.gravel() }.value
        async let lowKerb = Task.detached {
            ProceduralTextures.kerb(SIMD3(0.75, 0.02, 0.01), SIMD3(0.86, 0.86, 0.86))
        }.value
        async let highKerb = Task.detached {
            ProceduralTextures.kerb(SIMD3(0.85, 0.62, 0.0), SIMD3(0.04, 0.04, 0.04))
        }.value
        async let armco = Task.detached { ProceduralTextures.armco() }.value
        async let tyres = Task.detached { ProceduralTextures.tyreWall() }.value
        async let checker = Task.detached { ProceduralTextures.checker() }.value
        async let concrete = Task.detached { SceneryTextures.concrete() }.value
        async let fence = Task.detached { SceneryTextures.chainFence() }.value

        var line = PhysicallyBasedMaterial()
        line.baseColor = .init(tint: .init(white: 0.86, alpha: 1))
        line.roughness = 0.55
        line.faceCulling = .none

        var armcoMaterial = try await material(armco)
        armcoMaterial.metallic = 0.35
        var checkerMaterial = PhysicallyBasedMaterial()
        checkerMaterial.baseColor = .init(texture: try await texture(checker, .color))
        checkerMaterial.roughness = 0.6
        checkerMaterial.faceCulling = .none

        let fenceImage = await fence
        var fenceMaterial = PhysicallyBasedMaterial()
        fenceMaterial.baseColor = .init(texture: try await texture(fenceImage, .color))
        fenceMaterial.metallic = 0.8
        fenceMaterial.roughness = 0.45
        fenceMaterial.blending = .transparent(opacity: .init(texture: try await texture(SceneryTextures.alphaMask(fenceImage), .raw)))
        fenceMaterial.opacityThreshold = 0.5
        fenceMaterial.faceCulling = .none

        return RaceMaterials(
            asphalt: try await material(asphalt),
            line: line,
            lowKerb: try await material(lowKerb),
            highKerb: try await material(highKerb),
            gravel: try await material(gravel),
            grass: try await material(grass),
            armco: armcoMaterial,
            tyreWall: try await material(tyres),
            checker: checkerMaterial,
            concrete: try await material(concrete),
            fence: fenceMaterial)
    }

    /// A tiling, anisotropically filtered PBR material from the three maps.
    private static func material(_ maps: SurfaceMaps) async throws -> PhysicallyBasedMaterial {
        var material = PhysicallyBasedMaterial()
        material.baseColor = .init(texture: try await texture(maps.albedo, .color))
        material.roughness = .init(texture: try await texture(maps.roughness, .raw))
        material.normal = .init(texture: try await texture(maps.normal, .normal))
        material.metallic = 0.0
        material.faceCulling = .none
        return material
    }

    private static func texture(_ image: PixelImage, _ semantic: TextureResource.Semantic) async throws
        -> MaterialParameters.Texture
    {
        let resource = try await TextureResource(image: image.cgImage, options: .init(semantic: semantic))
        return MaterialParameters.Texture(resource, sampler: tiling)
    }

    /// Repeats in both directions, trilinear with 16× anisotropy: crisp at grazing angles.
    private static var tiling: MaterialParameters.Texture.Sampler {
        let descriptor = MTLSamplerDescriptor()
        descriptor.sAddressMode = .repeat
        descriptor.tAddressMode = .repeat
        descriptor.minFilter = .linear
        descriptor.magFilter = .linear
        descriptor.mipFilter = .linear
        descriptor.maxAnisotropy = 16
        return MaterialParameters.Texture.Sampler(descriptor)
    }
}
