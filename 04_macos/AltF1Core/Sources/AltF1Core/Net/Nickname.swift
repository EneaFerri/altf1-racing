import Foundation

/// Nickname rules (`net/nickname.ts`): instant feedback while typing; the server checks again and
/// keeps names unique.
public enum Nickname {
    public static let minLength = 3
    public static let maxLength = 16

    public enum Problem: String, Error, Codable, Sendable {
        case tooShort, tooLong, badChars
    }

    /// The nickname as it will be shown: NFC, trimmed, inner runs of spaces collapsed to one.
    public static func normalize(_ raw: String) -> String {
        var out = ""
        var lastWasSpace = false
        for scalar in raw.precomposedStringWithCanonicalMapping.trimmingCharacters(in: .whitespacesAndNewlines)
            .unicodeScalars
        {
            if scalar == " " {
                if lastWasSpace { continue }
                lastWasSpace = true
            } else {
                lastWasSpace = false
            }
            out.unicodeScalars.append(scalar)
        }
        return out
    }

    /// Checks `raw` against the rules: the normalized nickname, or what is wrong with it.
    public static func check(_ raw: String) -> Result<String, Problem> {
        let nickname = normalize(raw)
        let length = nickname.unicodeScalars.count  // code points, as the web counts them
        if length < minLength { return .failure(.tooShort) }
        if length > maxLength { return .failure(.tooLong) }
        if !nickname.unicodeScalars.allSatisfy(isAllowed) { return .failure(.badChars) }
        return .success(nickname)
    }

    /// Identity for uniqueness: "Enea", "enea" and " ENEA " are the same player name.
    public static func key(_ nickname: String) -> String {
        normalize(nickname).lowercased(with: Locale(identifier: "en"))
    }

    /// Letters of any language (`\p{L}`), digits 0–9, space, `_` and `-`.
    private static func isAllowed(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar {
        case "0"..."9", " ", "_", "-": return true
        default:
            switch scalar.properties.generalCategory {
            case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter: return true
            default: return false
            }
        }
    }
}
