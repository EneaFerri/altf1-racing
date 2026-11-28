import Foundation
import Testing

@testable import AltF1Core

/// The scenery's pure geometry: triangulation, placement beside the track, the real land.
@Suite struct SceneryTests {
    /// Area of the triangles, and whether each faces up (+Y) with x–z on the ground.
    private func cover(_ ring: [Vec2], _ triangles: [Int]) -> (area: Double, up: Bool) {
        var area = 0.0
        var up = true
        for t in stride(from: 0, to: triangles.count, by: 3) {
            let (a, b, c) = (ring[triangles[t]], ring[triangles[t + 1]], ring[triangles[t + 2]])
            let y = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)
            area += abs(y) / 2
            if y <= 0 { up = false }
        }
        return (area, up)
    }

    @Test func triangulatesAnyRingFacingUp() {
        // An L, both windings: 3 × 1 + 1 × 1 = 4 m².
        let l = [Vec2(0, 0), Vec2(3, 0), Vec2(3, 1), Vec2(1, 1), Vec2(1, 2), Vec2(0, 2)]
        for ring in [l, Array(l.reversed())] {
            let result = cover(ring, triangulate(ring))
            #expect(abs(result.area - 4) < 1e-9)
            #expect(result.up)
        }
    }

    @Test func monacosSceneryLoadsAndStandsBesideTheTrack() throws {
        let (scenery, land) = try CircuitCatalog.scenery("monaco")
        #expect(scenery.city?.count == 301)
        #expect(scenery.city?.contains { $0.landmark == "casino" } == true)
        #expect(scenery.tunnel != nil)
        let track = try buildTrack(CircuitCatalog.definition("monaco"))
        for stand in scenery.stands {
            for box in standPieces(track, stand.footprint, Reach(back: 10.4, roof: 3), pieceLength: 15) {
                #expect(clearance(track, box.front) > 0)
            }
        }
        let landGrid = try #require(land)
        let ground = Ground.onLand(track, landGrid, sea: scenery.sea ?? [])
        // Under the road, the ground is just under it; in the sea, the sea floor.
        let s = track.samples[100]
        #expect(abs(ground(s.position) - (s.height - Ground.drop)) < 1e-9)
        let water = try #require(scenery.sea?.first)
        let wet = water.first { p in insidePolygon(p * 0.999 + water[water.count / 2] * 0.001, water) }
        if let wet { #expect(ground(wet * 0.999 + water[water.count / 2] * 0.001) == Ground.seaFloor) }
    }
}

extension SceneryTests {
    @Test func triangulatesSingaporesBayQuickly() throws {
        let sea = try #require(try CircuitCatalog.scenery("singapore").scenery.sea)
        let clock = ContinuousClock()
        let elapsed = clock.measure {
            for ring in sea {
                let triangles = triangulate(ring)
                #expect(triangles.count >= (ring.count - 3) * 3 - 9)
            }
        }
        #expect(elapsed < .seconds(2))
    }
}

extension SceneryTests {
    @Test(arguments: ["monza", "barcelona", "monaco", "mexico", "singapore", "lasVegas", "saoPaulo", "baku"])
    func everyCircuitsSceneryDecodes(_ id: String) throws {
        let (scenery, _) = try CircuitCatalog.scenery(id)
        #expect(!scenery.stands.isEmpty)
    }
}
