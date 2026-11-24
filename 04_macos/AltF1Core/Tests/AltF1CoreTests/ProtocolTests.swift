import Foundation
import Testing

@testable import AltF1Core

/// The multiplayer protocol against the web's own messages (`protocol.json`, recorded with
/// `encodeMessage`): what the app sends is what the web sends, and it reads all the server says.
@Suite struct ProtocolTests {
    private let fixture: [String: Any]

    init() throws {
        fixture = try #require(try Fixture.json("protocol") as? [String: Any])
    }

    private func object(_ raw: String) throws -> [String: Any] {
        try #require(try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])
    }

    @Test func sameVersionAsTheWeb() {
        #expect(fixture["version"] as? Int == NetProtocol.version)
    }

    @Test func clientMessagesEncodeAsTheWebDoes() throws {
        let input = InputCommand(throttle: 1, steer: 0.25)
        let messages: [ClientMessage] = [
            .hello(nickname: "Enea"),
            .enter(mode: .grandPrix, track: "São Paulo"),
            .input(seq: 4321, input: input),
            .input(seq: 4322, input: InputCommand(compound: .soft)),
            .ping(t: 1234.5),
            .gp(.start),
            .gp(.weather(.rain)),
            .gp(.endQualifying),
            .gp(.startRace(laps: 12)),
            .gp(.endRace),
            .gp(.playAgain),
        ]
        let web = try #require(fixture["client"] as? [String])
        #expect(web.count == messages.count)
        for (message, expected) in zip(messages, web) {
            let found = differences(try object(message.encoded()), try object(expected))
            #expect(found.isEmpty, "\(message): \(found)")
        }
    }

    @Test func serverMessagesDecode() throws {
        let web = try #require(fixture["server"] as? [String])
        let messages = web.map(ServerMessage.parse)
        #expect(messages.allSatisfy { $0 != nil })

        guard case .welcome(let id, let rooms, let records) = messages[0] else { Issue.record("welcome"); return }
        #expect(id == "p1")
        #expect(rooms.map(\.status) == [.open, .running])
        #expect(records[0].records.first?.ticks == 4810)
        #expect(records[1].records.isEmpty)

        guard case .rejected(.taken) = messages[1], case .refused = messages[2] else { Issue.record("rejected"); return }
        guard case .entered("Monza", let players) = messages[3] else { Issue.record("entered"); return }
        #expect(players.map(\.nickname) == ["Enea", "Zoë"])
        #expect(players.map(\.livery) == [0, 3])

        guard case .snapshot(let state, let acks, let inputs) = messages[5] else { Issue.record("snapshot"); return }
        let snapshot = try object(web[5])
        let found = differences(try Fixture.jsonValue(state), snapshot["state"], tolerance: 0)
        #expect(found.isEmpty, "\(found)")
        #expect(acks == ["p1": 88])
        #expect(inputs["p1"] == InputCommand(throttle: 1, steer: 0.25))

        guard case .pong(1234.5) = messages[6] else { Issue.record("pong"); return }

        for index in [7, 8] {
            guard case .grandPrix(let info) = messages[index] else { Issue.record("grandPrix"); return }
            var expected = try object(web[index])
            expected["type"] = nil
            let found = differences(try Fixture.jsonValue(info), expected, tolerance: 0)
            #expect(found.isEmpty, "\(found)")
        }
    }

    @Test func unknownMessagesAreIgnored() {
        #expect(ServerMessage.parse(#"{"type":"nope"}"#) == nil)
        #expect(ServerMessage.parse("not json") == nil)
        #expect(ServerMessage.parse(#"{"type":"pong"}"#) == nil)
    }

    @Test func nicknamesFollowTheWebsRules() throws {
        let cases = try #require(fixture["nicknames"] as? [[String: Any]])
        for entry in cases {
            let raw = try #require(entry["raw"] as? String)
            let check = try #require(entry["check"] as? [String: Any])
            switch Nickname.check(raw) {
            case .success(let nickname):
                #expect(check["ok"] as? Bool == true, "\(raw)")
                #expect(nickname == check["nickname"] as? String, "\(raw)")
            case .failure(let problem):
                #expect(check["ok"] as? Bool == false, "\(raw)")
                #expect(problem.rawValue == check["reason"] as? String, "\(raw)")
            }
            #expect(Nickname.key(raw) == entry["key"] as? String, "\(raw)")
        }
    }
}

/// What the player types as the server's address → the socket's URL.
@Suite struct ServerAddressTests {
    @Test(arguments: [
        ("", "ws://localhost:8787/ws"),
        ("  localhost ", "ws://localhost:8787/ws"),
        ("100.64.0.7", "ws://100.64.0.7:8787/ws"),
        ("my-mac.tail1234.ts.net", "ws://my-mac.tail1234.ts.net:8787/ws"),
        ("192.168.1.20:5173", "ws://192.168.1.20:5173/ws"),
        ("http://100.64.0.7:5173", "ws://100.64.0.7:5173/ws"),
        ("http://100.64.0.7:5173/", "ws://100.64.0.7:5173/ws"),
        ("https://altf1.example.com", "wss://altf1.example.com/ws"),
        ("ws://10.0.0.2:9000/ws", "ws://10.0.0.2:9000/ws"),
    ])
    func readsWhatThePlayerTypes(_ input: String, _ expected: String) {
        #expect(ServerAddress.url(input)?.absoluteString == expected)
    }

    @Test func refusesWhatIsNoAddress() {
        #expect(ServerAddress.url("ftp://host") == nil)
        #expect(ServerAddress.url("http://") == nil)
    }
}
