import Foundation
import Testing

@testable import AltF1Core

@Suite struct CircuitCatalogTests {
    @Test func listsTheEightCircuitsInMenuOrder() throws {
        let names = try CircuitCatalog.entries().map(\.name)
        #expect(
            names == [
                "Monza", "Barcelona", "Monaco", "Mexico City", "Singapore", "Las Vegas",
                "São Paulo", "Baku",
            ])
    }

    @Test func onlyMonacoSaoPauloAndBakuAreElevated() throws {
        let elevated = try CircuitCatalog.entries().filter(\.elevated).map(\.id)
        #expect(elevated == ["monaco", "saoPaulo", "baku"])
    }

    @Test func everyCircuitHasItsData() throws {
        for entry in try CircuitCatalog.entries() {
            let json = try JSONSerialization.jsonObject(with: CircuitCatalog.data(named: entry.id))
            let circuit = try #require(json as? [String: Any])
            #expect(circuit["id"] as? String == entry.id)
            #expect(circuit["definition"] != nil)
        }
    }
}
