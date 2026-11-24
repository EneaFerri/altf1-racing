import Foundation

/// Single player's time trial records (the web's `localRecords.ts`): this Mac's best valid lap per
/// circuit (ticks, by circuit name), kept in the user defaults under the web's own key.
struct LocalRecords {
    private static let key = "altf1.timeTrial.best"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    /// The best lap on `track` (ticks); nil if none is saved.
    func best(_ track: String) -> Int? {
        all[track]
    }

    /// Saves `ticks` on `track` if it beats the saved best; whether it did (a new record).
    @discardableResult
    func submit(_ track: String, ticks: Int) -> Bool {
        var records = all
        if let best = records[track], best <= ticks { return false }
        records[track] = ticks
        defaults.set(records, forKey: Self.key)
        return true
    }

    private var all: [String: Int] {
        (defaults.dictionary(forKey: Self.key) as? [String: Int] ?? [:]).filter { $0.value > 0 }
    }
}
