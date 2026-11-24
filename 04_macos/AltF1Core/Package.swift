// swift-tools-version: 6.2
import PackageDescription

/// The game's model in Swift: a 1:1 port of `01_packages/shared` (01_docs/macos.md). Pure: no
/// RealityKit, AppKit or SwiftUI, so it is tested with `swift test` and runs headless.
let package = Package(
    name: "AltF1Core",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "AltF1Core", targets: ["AltF1Core"])
    ],
    targets: [
        .target(
            name: "AltF1Core",
            resources: [.copy("Resources/Circuits")],
            // The model runs every tick for ten cars and their bots: optimised even in Debug builds,
            // or a debugging session drops frames (measured in a Grand Prix: 79 → 97 fps).
            swiftSettings: [.unsafeFlags(["-O"], .when(configuration: .debug))]
        ),
        .testTarget(
            name: "AltF1CoreTests",
            dependencies: ["AltF1Core"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
