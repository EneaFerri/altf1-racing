import RealityKit
import simd

/// Pieces flying off damaged cars: a wing half or the rear wing that breaks off, carbon shards on
/// every hit that damages a wing. Purely cosmetic (the simulation never sees them): thrown with
/// the car's speed, tumbling, falling, bouncing and sliding on the road, then fading away.
@MainActor
final class Debris {
    /// Added to the scene's anchor (at the world's origin).
    let root = Entity()

    private struct Piece {
        let entity: Entity
        var velocity: SIMD3<Float>
        let spinAxis: SIMD3<Float>
        var spinRate: Float
        /// The road's height where it fell.
        let groundY: Float
        /// Half its thickness: how far above the road it rests.
        let rest: Float
        var age: Float = 0
    }

    private var pieces: [Piece] = []
    private var generator = SystemRandomNumberGenerator()

    static let gravity: Float = 9.81
    /// Kept on the road this long, then faded out over `fadeSeconds`.
    static let lifeSeconds: Float = 7
    static let fadeSeconds: Float = 1.5
    /// Pieces at most at once (the oldest go first).
    static let maxPieces = 90

    /// Throws `entity` (already placed in world space) off at `velocity`.
    func launch(_ entity: Entity, velocity: SIMD3<Float>, groundY: Float, rest: Float = 0.03) {
        if pieces.count >= Self.maxPieces { remove(at: 0) }
        let axis = simd_normalize(
            SIMD3<Float>(.random(in: -1...1, using: &generator), .random(in: -1...1, using: &generator), .random(in: -1...1, using: &generator))
                + SIMD3(0, 0, 0.001))
        root.addChild(entity)
        pieces.append(
            Piece(
                entity: entity, velocity: velocity, spinAxis: axis, spinRate: .random(in: 5...14, using: &generator),
                groundY: groundY, rest: rest))
    }

    /// `count` small shards of `materials` from `origin` (world space), thrown with `carVelocity`.
    func shards(_ count: Int, at origin: SIMD3<Float>, carVelocity: SIMD3<Float>, groundY: Float, materials: [any RealityKit.Material]) {
        for _ in 0..<count {
            let size = SIMD3<Float>(
                .random(in: 0.03...0.14, using: &generator), .random(in: 0.006...0.02, using: &generator),
                .random(in: 0.03...0.1, using: &generator))
            let material = materials.randomElement(using: &generator) ?? SimpleMaterial()
            let shard = ModelEntity(mesh: .generateBox(size: size), materials: [material])
            shard.position = origin + SIMD3(.random(in: -0.3...0.3, using: &generator), 0, .random(in: -0.2...0.2, using: &generator))
            let kick = SIMD3<Float>(
                .random(in: -4...4, using: &generator), .random(in: 2...6, using: &generator), .random(in: -3...3, using: &generator))
            launch(shard, velocity: carVelocity * Float.random(in: 0.6...0.95, using: &generator) + kick, groundY: groundY, rest: size.y / 2)
        }
    }

    func update(_ seconds: Double) {
        let dt = Float(seconds)
        guard dt > 0 else { return }
        var index = 0
        while index < pieces.count {
            var piece = pieces[index]
            piece.age += dt
            if piece.age > Self.lifeSeconds + Self.fadeSeconds {
                remove(at: index)
                continue
            }
            let entity = piece.entity
            let floor = piece.groundY + piece.rest
            let onGround = entity.position.y <= floor + 0.001 && abs(piece.velocity.y) < 0.4
            if onGround {
                // Sliding to a stop on the asphalt.
                let friction = min(1, 6 * dt)
                piece.velocity.x -= piece.velocity.x * friction
                piece.velocity.z -= piece.velocity.z * friction
                piece.velocity.y = 0
                piece.spinRate -= piece.spinRate * min(1, 8 * dt)
            } else {
                piece.velocity.y -= Self.gravity * dt
            }
            var position = entity.position + piece.velocity * dt
            if position.y < floor {
                position.y = floor
                if piece.velocity.y < 0 {
                    // A bounce: it loses most of its speed on the road.
                    piece.velocity.y = -piece.velocity.y * 0.3
                    piece.velocity.x *= 0.7
                    piece.velocity.z *= 0.7
                    piece.spinRate *= 0.6
                }
            }
            entity.position = position
            if piece.spinRate > 0.05 {
                entity.orientation = simd_quatf(angle: piece.spinRate * dt, axis: piece.spinAxis) * entity.orientation
            }
            if piece.age > Self.lifeSeconds {
                let fade = 1 - (piece.age - Self.lifeSeconds) / Self.fadeSeconds
                entity.components.set(OpacityComponent(opacity: max(0, fade)))
            }
            pieces[index] = piece
            index += 1
        }
    }

    private func remove(at index: Int) {
        pieces[index].entity.removeFromParent()
        pieces.remove(at: index)
    }
}
