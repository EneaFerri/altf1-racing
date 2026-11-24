import SwiftUI

/// The menus' backdrop: a slow, dark mesh gradient with the game's red, so the Liquid Glass panels
/// have something to refract. Replaced by a live 3D scene of the circuit once rendering lands (X.2).
struct MenuBackdrop: View {
    var body: some View {
        TimelineView(.animation) { timeline in
            let t = Float(timeline.date.timeIntervalSinceReferenceDate)
            MeshGradient(
                width: 3,
                height: 3,
                points: [
                    [0, 0], [0.5, 0], [1, 0],
                    [0, 0.5], [0.5 + 0.18 * sin(t * 0.21), 0.5 + 0.14 * cos(t * 0.17)], [1, 0.5],
                    [0, 1], [0.5, 1], [1, 1],
                ],
                colors: [
                    .black, Color(white: 0.09), .black,
                    Color(red: 0.32, green: 0.02, blue: 0.02), .altF1Red.opacity(0.85),
                    Color(red: 0.10, green: 0.10, blue: 0.16),
                    .black, Color(red: 0.06, green: 0.06, blue: 0.10), .black,
                ]
            )
        }
        .ignoresSafeArea()
    }
}
