import Foundation

/// One of the game's circuits, as listed by the exported `Circuits/index.json`
/// (01_tools/swiftExport, in `GP_TRACKS` order).
public struct CircuitEntry: Codable, Hashable, Identifiable, Sendable {
    /// The file name of the circuit's data, e.g. `lasVegas`.
    public let id: String
    /// The name shown in the menus, e.g. `Las Vegas`.
    public let name: String
    /// Whether the circuit has its real heights and land (Monaco, São Paulo).
    public let elevated: Bool
    /// The lap's length (m), as `buildTrack` makes it.
    public let length: Double
}

/// The circuits bundled with the app: the real F1 ones, in menu order.
public enum CircuitCatalog {
    public enum LoadError: Error {
        case missingResource(String)
    }

    /// Every circuit, in `GP_TRACKS` order.
    public static func entries() throws -> [CircuitEntry] {
        try JSONDecoder().decode([CircuitEntry].self, from: data(named: "index"))
    }

    /// The track data of circuit `id` (e.g. `monza`), ready for `buildTrack`.
    public static func definition(_ id: String) throws -> TrackDefinition {
        struct File: Decodable { let definition: TrackDefinition }
        return try JSONDecoder().decode(File.self, from: data(named: id)).definition
    }

    /// The raw exported JSON of one circuit (definition, scenery, land).
    public static func data(named name: String) throws -> Data {
        guard
            let url = Bundle.module.url(
                forResource: name, withExtension: "json", subdirectory: "Circuits")
        else { throw LoadError.missingResource(name) }
        return try Data(contentsOf: url)
    }
}
