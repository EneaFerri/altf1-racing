import AltF1Core
import Foundation
import simd

/// Baku's pit lane on the Mac (owner, 2026-11-25): the town cleared off the real drivable lane,
/// and, in the Grand Prix, the garages behind the boxes, each box's overhead gantry and its crew
/// standing round the car's spot (after the owner's photo of a stop). Static and visual only.
nonisolated enum BakuPit {
    /// Town buildings stay this far beyond the lane's edges (m).
    private static let laneMargin = 3.0
    /// The garages: their front this far beyond the lane's edge (a walkway), deep and tall (m).
    private static let garageGap = 1.5
    private static let garageDepth = 12.0
    private static let garageHeight: Float = 8
    /// Along the lane, each box's garage (m): the boxes are 20 m apart.
    private static let garageLength = 20.4

    /// The ground no town building may stand on: the lane (with its entry and exit) and the garages.
    struct Clearance {
        var lane: [Circle]
        var garages: [[Vec2]]
    }

    static func clearance(_ lane: Track) -> Clearance {
        Clearance(lane: pitLaneFootprint(lane, margin: laneMargin), garages: boxes(lane).map(\.garage))
    }

    /// Whether a footprint touches the cleared ground: its outline (every 2 m) or the lane through it.
    static func blocks(_ ring: [Vec2], _ clear: Clearance) -> Bool {
        guard ring.count >= 3 else { return false }
        var outline: [Vec2] = []
        for i in 0..<ring.count {
            let (a, b) = (ring[i], ring[(i + 1) % ring.count])
            let steps = max(1, Int((a.distance(to: b) / 2).rounded(.up)))
            for k in 0..<steps { outline.append(a.lerp(to: b, Double(k) / Double(steps))) }
        }
        if outline.contains(where: { p in clear.lane.contains { hypot(p.x - $0.x, p.z - $0.z) < $0.r } }) { return true }
        if clear.lane.contains(where: { insidePolygon(Vec2($0.x, $0.z), ring) }) { return true }
        return clear.garages.contains { garage in
            outline.contains { insidePolygon($0, garage) } || garage.contains { insidePolygon($0, ring) }
        }
    }

    /// One box: where the car stands, the side its garage is on (+1 its right), the lane's edge
    /// that side (m from the spot), the garage's footprint.
    private struct Box {
        var index: Int
        var spot: Vec2
        var heading: Double
        var garageSide: Double
        var edge: Double
        var garage: [Vec2]
    }

    private static func boxes(_ track: Track) -> [Box] {
        guard let lane = track.routes.first(where: \.pit), let rules = lane.pitRules else { return [] }
        let p = PitParams.baseline
        return rules.boxes.indices.map { index -> Box in
            let (spot, heading) = boxSpot(lane, index, p)
            let along = rules.boxes[index]
            let s = lane.samples.first { $0.distance >= along } ?? lane.samples[0]
            let side: Double = (s.normal * rules.garageSide).dot(Vec2.right(heading)) >= 0 ? 1 : -1
            let edge = s.halfWidth * (1 - p.boxSide)
            func at(_ ahead: Double, _ across: Double) -> Vec2 { Vec2.toWorld(spot, heading, ahead: ahead, side: side * across) }
            let (front, back, half) = (edge + garageGap, edge + garageGap + garageDepth, garageLength / 2)
            return Box(
                index: index, spot: spot, heading: heading, garageSide: side, edge: edge,
                garage: [at(-half, front), at(half, front), at(half, back), at(-half, back)])
        }
    }

    // MARK: Drawing

    /// The garages, gantries and crews on `track` (built with its drivable lane); `keepClear` gets
    /// the garages, so no tree grows in them.
    static func add(_ parts: inout SceneryParts, _ track: Track, _ ground: (Vec2) -> Double, _ keepClear: inout [Circle]) {
        for box in boxes(track) {
            let road = Float(track.elevated ? locateOnTrack(track, box.spot).height : 0)
            addGarage(&parts, box, road: road, ground: ground)
            let frame = placed(SIMD3(Float(box.spot.x), road, Float(box.spot.z)), yaw: Float(box.heading))
            let kit = box.index < Teams.all.count ? box.index : Teams.all.count
            addGantry(&parts, frame, box, kit: kit)
            addCrew(&parts, frame, kit: kit)
            let c = box.garage.reduce(Vec2.zero, +) * 0.25
            keepClear += polylineFootprint([c], r: garageLength / 2 + 2)
        }
    }

    /// A box's garage: a concrete block, its open door towards the lane, a coloured band on top.
    private static func addGarage(_ parts: inout SceneryParts, _ box: Box, road: Float, ground: (Vec2) -> Double) {
        let bottom = min(road, Float(box.garage.map(ground).min()!)) - 0.5
        let top = road + garageHeight
        let g = box.garage
        parts[.pitConcrete].walls(g, bottom: bottom, top: top, bay: 4, floor: 4)
        parts[.pitConcrete].polygon(g, y: top, tile: 4)
        // On the face towards the lane: the open garage, the band above it.
        let (a, b) = (g[0], g[1])
        let across = (g[3] - g[0]).normalized
        let face = placed(SIMD3(Float((a.x + b.x) / 2), road, Float((a.z + b.z) / 2)), yaw: Float(atan2(across.x, across.z)))
        parts[.pitGarage].box(face * placed(SIMD3(0, 2.4, -0.03), scale: SIMD3(12, 4.8, 0.06)), tile: 6)
        parts[.pitBand].box(face * placed(SIMD3(0, 6.3, -0.04), scale: SIMD3(Float(garageLength), 1.6, 0.08)))
    }

    /// The overhead gantry: two posts on the walkway, a frame along them, arms out over the car, a
    /// boom over its middle in the team's colour, the hoses down to the wheel guns and the light.
    private static func addGantry(_ parts: inout SceneryParts, _ frame: simd_float4x4, _ box: Box, kit: Int) {
        let g = Float(box.garageSide)
        let post = Float(box.edge) + 0.5
        let height: Float = 3.4
        for ahead: Float in [-2.4, 2.4] {
            parts[.pitSteel].box(frame * placed(SIMD3(g * post, height / 2, -ahead), scale: SIMD3(0.22, height, 0.22)))
            // The arm out over the car, just past its middle.
            let arm = post + 0.5
            parts[.pitSteel].box(frame * placed(SIMD3(g * (post - arm / 2), height, -ahead), scale: SIMD3(arm, 0.16, 0.16)))
        }
        parts[.pitSteel].box(frame * placed(SIMD3(g * post, height, 0), scale: SIMD3(0.18, 0.18, 4.8)))
        // The boom: from behind the car out past its nose, a stripe in the team's colour under it.
        parts[.pitSteel].box(frame * placed(SIMD3(0, height + 0.02, -0.4), scale: SIMD3(0.34, 0.24, 7)))
        parts[.crewHelmet(kit)].box(frame * placed(SIMD3(0, height - 0.12, -0.4), scale: SIMD3(0.36, 0.06, 7.02)))
        // The light hung over the nose, facing the car.
        parts[.pitSteel].box(frame * placed(SIMD3(0, height - 0.4, -2.9), scale: SIMD3(0.03, 0.6, 0.03)))
        parts[.pitSteel].box(frame * placed(SIMD3(0, height - 0.85, -2.9), scale: SIMD3(0.4, 0.3, 0.12)))
        parts[.pitLight].box(frame * placed(SIMD3(0, height - 0.85, -2.83), scale: SIMD3(0.3, 0.2, 0.02)))
        // The wheel guns' air hoses, from the boom's ends down beside each wheel.
        for wheel in carWheels {
            let side = Float(wheel.side) * 1.75
            let ahead = Float(wheel.ahead)
            parts[.pitBlack].bar(
                point(frame, SIMD3(0, height - 0.1, -ahead * 1.4)), point(frame, SIMD3(side * 0.85, 0.6, -ahead)),
                width: 0.04, height: 0.04)
        }
    }

    // MARK: The crew

    private enum Pose { case stand, kneel }

    /// What a mechanic's hands hold.
    private enum Holding { case nothing, gun, tyre, jack, sidepod }

    /// Round the car's spot (the sim's `carWheels`): three at each wheel (gun, old tyre off, new
    /// one on), the front and rear jacks, two holding the car steady, two at the front wing.
    private static func addCrew(_ parts: inout SceneryParts, _ frame: simd_float4x4, kit: Int) {
        func man(_ ahead: Float, _ side: Float, facing: SIMD2<Float>, _ pose: Pose, _ holding: Holding) {
            let yaw = atan2(-facing.x, facing.y)
            let at = frame * placed(SIMD3(side, 0, -ahead), yaw: yaw)
            addMechanic(&parts, at, pose, holding, kit: kit)
        }
        for wheel in carWheels {
            let (a, s) = (Float(wheel.ahead), Float(wheel.side))
            let out: Float = s > 0 ? 1 : -1
            // Facing (side, ahead): in towards the wheel.
            let inward = SIMD2<Float>(-out, 0)
            let end: Float = a > 0 ? 1 : -1
            man(a, s + out * 0.75, facing: inward, .kneel, .gun)
            man(a + end * 0.85, s + out * 0.55, facing: SIMD2(-out * 0.6, -end * 0.8), .kneel, .nothing)
            man(a - end * 0.95, s + out * 0.85, facing: SIMD2(-out * 0.8, end * 0.6), .stand, .tyre)
        }
        man(3.7, 0, facing: SIMD2(0, -1), .stand, .jack)
        man(-3.3, 0, facing: SIMD2(0, 1), .stand, .jack)
        for out: Float in [-1, 1] {
            man(0.1, out * 1.45, facing: SIMD2(-out, 0), .stand, .sidepod)
            man(2.75, out * 0.9, facing: SIMD2(-out * 0.3, -0.95), .kneel, .nothing)
        }
    }

    /// One mechanic (about 1.8 m) facing its local −z: boots, legs, the overall in the team's
    /// colour, gloves, the helmet with its dark visor; and what it holds.
    private static func addMechanic(
        _ parts: inout SceneryParts, _ at: simd_float4x4, _ pose: Pose, _ holding: Holding, kit: Int
    ) {
        let suit = SceneryParts.Part.crewSuit(kit)
        func limb(_ part: SceneryParts.Part, _ a: SIMD3<Float>, _ b: SIMD3<Float>, _ w: Float) {
            parts[part].bar(point(at, a), point(at, b), width: w, height: w)
        }
        let hip: Float, shoulder: Float
        switch pose {
        case .stand:
            hip = 0.92
            shoulder = 1.45
            for x: Float in [-0.11, 0.11] {
                limb(suit, SIMD3(x, hip, 0), SIMD3(x, 0.1, 0), 0.17)
                parts[.pitBlack].box(at * placed(SIMD3(x, 0.05, -0.05), scale: SIMD3(0.13, 0.1, 0.3)))
            }
        case .kneel:
            hip = 0.6
            shoulder = 1.1
            // The right knee up, its foot flat ahead; the left knee down, its shin along the ground.
            limb(suit, SIMD3(0.11, hip, 0), SIMD3(0.12, 0.52, -0.42), 0.17)
            limb(suit, SIMD3(0.12, 0.52, -0.42), SIMD3(0.12, 0.1, -0.42), 0.15)
            parts[.pitBlack].box(at * placed(SIMD3(0.12, 0.05, -0.47), scale: SIMD3(0.13, 0.1, 0.3)))
            limb(suit, SIMD3(-0.11, hip, 0), SIMD3(-0.11, 0.1, 0.08), 0.17)
            limb(suit, SIMD3(-0.11, 0.1, 0.08), SIMD3(-0.11, 0.1, 0.5), 0.14)
        }
        // The body, a little forward over the work.
        limb(suit, SIMD3(0, hip - 0.05, 0), SIMD3(0, shoulder, -0.08), 0.36)
        parts[.crewHelmet(kit)].prism(at * placed(SIMD3(0, shoulder + 0.05, -0.1)), sides: 10, bottom: 0.14, top: 0.15, height: 0.18)
        parts[.crewHelmet(kit)].dome(point(at, SIMD3(0, shoulder + 0.23, -0.1)), rx: 0.15, ry: 0.13, rz: 0.15)
        parts[.pitBlack].box(at * placed(SIMD3(0, shoulder + 0.15, -0.24), scale: SIMD3(0.22, 0.08, 0.04)))

        // The arms to the hands, then what they hold.
        let hands: (SIMD3<Float>, SIMD3<Float>)
        switch holding {
        case .nothing: hands = (SIMD3(-0.2, shoulder - 0.45, -0.45), SIMD3(0.2, shoulder - 0.45, -0.45))
        case .gun: hands = (SIMD3(-0.1, 0.36, -0.6), SIMD3(0.1, 0.4, -0.55))
        case .tyre: hands = (SIMD3(-0.3, 1.0, -0.35), SIMD3(0.3, 1.0, -0.35))
        case .jack: hands = (SIMD3(-0.15, 0.95, -0.5), SIMD3(0.15, 0.95, -0.5))
        case .sidepod: hands = (SIMD3(-0.18, 0.72, -0.55), SIMD3(0.18, 0.72, -0.55))
        }
        for (x, hand) in [(Float(-0.22), hands.0), (Float(0.22), hands.1)] {
            limb(suit, SIMD3(x, shoulder - 0.05, -0.08), hand, 0.1)
            parts[.pitBlack].box(at * placed(hand, scale: SIMD3(0.1, 0.1, 0.1)))
        }
        switch holding {
        case .nothing, .sidepod:
            break
        case .gun:
            parts[.pitBlack].box(at * placed(SIMD3(0, 0.38, -0.7), scale: SIMD3(0.14, 0.18, 0.4)))
        case .tyre:
            // A new tyre held up against the chest, on its tread.
            parts[.pitBlack].prism(
                at * placed(SIMD3(0.18, 0.95, -0.62), roll: .pi / 2), sides: 14, bottom: 0.36, top: 0.36, height: 0.36)
        case .jack:
            // The jack's handle down to its foot under the car's nose (or gearbox).
            limb(.pitSteel, SIMD3(0, 0.95, -0.55), SIMD3(0, 0.18, -1.05), 0.07)
            parts[.pitSteel].box(at * placed(SIMD3(0, 0.1, -1.1), scale: SIMD3(0.5, 0.2, 0.3)))
        }
    }

    private static func point(_ m: simd_float4x4, _ p: SIMD3<Float>) -> SIMD3<Float> {
        let v = m * SIMD4(p, 1)
        return SIMD3(v.x, v.y, v.z)
    }
}

nonisolated extension MeshBuilder {
    /// A box from `a` to `b` (its length), `width` × `height` across.
    mutating func bar(_ a: SIMD3<Float>, _ b: SIMD3<Float>, width: Float, height: Float) {
        let d = b - a
        let length = simd_length(d)
        guard length > 1e-5 else { return }
        let dir = d / length
        let turn = simd_dot(dir, SIMD3(0, 0, 1)) < -0.9999
            ? simd_quatf(angle: .pi, axis: SIMD3(0, 1, 0)) : simd_quatf(from: SIMD3(0, 0, 1), to: dir)
        var m = simd_float4x4(turn)
        m.columns.0 *= width
        m.columns.1 *= height
        m.columns.2 *= length
        m.columns.3 = SIMD4((a + b) / 2, 1)
        box(m)
    }
}
