import SwiftUI

/// AltF1 Racing for macOS: the web game ported to Swift (01_docs/macos.md).
@main
struct AltF1App: App {
    var body: some Scene {
        WindowGroup {
            StartView()
                .frame(minWidth: 1024, minHeight: 640)
                .preferredColorScheme(.dark)
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1440, height: 900)
    }
}
