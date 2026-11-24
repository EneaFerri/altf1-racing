import AltF1Core
import SwiftUI

/// How a car shows on the minimap: its colour and its driver's name.
struct MapPlayer {
    let name: String
    let color: Color
}

/// The whole track seen from above, bottom left (the web's `Minimap.ts`): a dot per car in its
/// colour (the own one bigger, ringed white) and a legend, in a Liquid Glass panel. Redrawn every
/// display frame from the session's latest state.
struct Minimap: View {
    let session: any RaceSession
    let players: [CarId: MapPlayer]
    private let road: Path
    private let start: Path
    private let roadWidth: CGFloat
    private let fit: (Vec2) -> CGPoint

    /// Canvas size and the room kept clear round the track (pt).
    static let size: CGFloat = 190
    private static let padding: CGFloat = 12

    init(session: any RaceSession, players: [CarId: MapPlayer]) {
        self.session = session
        self.players = players
        let track = session.track
        // One scale for both axes (the shape stays true), centred; −z up, so +x is right.
        let xs = track.samples.map(\.position.x)
        let zs = track.samples.map(\.position.z)
        let minX = xs.min() ?? 0
        let minZ = zs.min() ?? 0
        let width = (xs.max() ?? 0) - minX
        let depth = (zs.max() ?? 0) - minZ
        let scale = (Double(Self.size) - 2 * Double(Self.padding)) / max(width, depth, 1e-6)
        let offsetU = (Double(Self.size) - width * scale) / 2
        let offsetV = (Double(Self.size) - depth * scale) / 2
        let fit: (Vec2) -> CGPoint = { p in
            CGPoint(x: offsetU + (p.x - minX) * scale, y: offsetV + (p.z - minZ) * scale)
        }
        self.fit = fit
        road = Path { path in
            for (i, sample) in track.samples.enumerated() {
                if i == 0 { path.move(to: fit(sample.position)) } else { path.addLine(to: fit(sample.position)) }
            }
            path.closeSubpath()
        }
        roadWidth = max(3, CGFloat(2 * track.maxHalfWidth * scale))
        let s = track.samples[0]
        let half = s.halfWidth + 4
        start = Path { path in
            path.move(to: fit(s.position + s.normal * half))
            path.addLine(to: fit(s.position - s.normal * half))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TimelineView(.animation) { _ in
                Canvas { context, _ in
                    context.stroke(road, with: .color(.white.opacity(0.85)), style: .init(lineWidth: roadWidth, lineCap: .round, lineJoin: .round))
                    context.stroke(start, with: .color(.altF1Red), lineWidth: 3)
                    let own = session.playerId
                    // The own car last, on top of the others.
                    for car in session.current.cars.sorted(by: { ($0.id == own ? 1 : 0) < ($1.id == own ? 1 : 0) }) {
                        let isOwn = car.id == own
                        let r: CGFloat = isOwn ? 6 : 4
                        let p = fit(car.position)
                        let dot = Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r))
                        context.fill(dot, with: .color(players[car.id]?.color ?? .gray))
                        context.stroke(dot, with: .color(isOwn ? .white : .black.opacity(0.6)), lineWidth: isOwn ? 2 : 1)
                    }
                }
            }
            .frame(width: Self.size, height: Self.size)
            // A legend for a few cars; a full grid is listed by the Grand Prix's panel.
            ForEach(session.current.cars.count <= 4 ? session.current.cars.filter { players[$0.id] != nil } : [], id: \.id) { car in
                HStack(spacing: 6) {
                    Circle().fill(players[car.id]!.color).frame(width: 8, height: 8)
                    Text(players[car.id]!.name)
                        .font(.system(size: 11, weight: .semibold))
                }
            }
        }
        .padding(12)
        .glassEffect(.regular, in: .rect(cornerRadius: 24))
    }
}
