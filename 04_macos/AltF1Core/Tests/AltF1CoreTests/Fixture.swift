import Foundation
import Testing

@testable import AltF1Core

/// The parity fixtures recorded with the web's TypeScript model (01_tools/swiftExport/fixtures.ts).
enum Fixture {
    static func data(_ name: String) throws -> Data {
        let url = try #require(
            Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
        return try Data(contentsOf: url)
    }

    static func json(_ name: String) throws -> Any {
        try JSONSerialization.jsonObject(with: data(name))
    }

    /// `value` as the web's JSON would hold it (absent optionals left out).
    static func jsonValue(_ value: some Encodable) throws -> Any {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(value), options: .fragmentsAllowed)
    }
}

/// The places where `actual` differs from `expected` (JSON values): numbers within a relative
/// `tolerance`, a missing key the same as null. At most `limit` of them, for a readable failure.
func differences(_ actual: Any?, _ expected: Any?, path: String = "", tolerance: Double = 1e-9, limit: Int = 8)
    -> [String]
{
    var found: [String] = []
    func walk(_ a: Any?, _ e: Any?, _ path: String) {
        guard found.count < limit else { return }
        let a = a is NSNull ? nil : a
        let e = e is NSNull ? nil : e
        switch (a, e) {
        case (nil, nil):
            return
        case (let a as [String: Any], let e as [String: Any]):
            for key in Set(a.keys).union(e.keys).sorted() { walk(a[key], e[key], "\(path).\(key)") }
        case (let a as [Any], let e as [Any]):
            if a.count != e.count {
                found.append("\(path): \(a.count) items, expected \(e.count)")
                return
            }
            for (i, pair) in zip(a, e).enumerated() { walk(pair.0, pair.1, "\(path)[\(i)]") }
        case (let a as String, let e as String):
            if a != e { found.append("\(path): \(a), expected \(e)") }
        case (let a as NSNumber, let e as NSNumber):
            let x = a.doubleValue
            let y = e.doubleValue
            if abs(x - y) > tolerance * max(1, abs(x), abs(y)) {
                found.append("\(path): \(x), expected \(y) (off by \(x - y))")
            }
        default:
            found.append("\(path): \(String(describing: a)), expected \(String(describing: e))")
        }
    }
    walk(actual, expected, path)
    return found
}
