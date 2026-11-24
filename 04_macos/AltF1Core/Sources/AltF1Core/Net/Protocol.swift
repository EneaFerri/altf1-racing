import Foundation

/// The multiplayer protocol (`net/protocol.ts`, 01_docs/multiplayer.md#protocol): JSON over one
/// WebSocket, the same messages and keys as the web, so the app joins the same server and rooms.
public enum NetProtocol {
    /// The web's `PROTOCOL_VERSION`: the server rejects any other (`version`).
    public static let version = 18
    /// Players online at most, over all rooms.
    public static let maxPlayers = 8
    /// The server sends a snapshot every this many ticks (30 Hz).
    public static let snapshotEveryTicks = 2
    /// Lap records kept per mode and circuit.
    public static let recordsPerTrack = 10
}

public struct PlayerInfo: Codable, Hashable, Sendable {
    public var id: CarId
    public var nickname: String
    /// Livery index (the lowest one free when the player joined).
    public var livery: Int

    public init(id: CarId, nickname: String, livery: Int) {
        self.id = id
        self.nickname = nickname
        self.livery = livery
    }
}

/// The online game modes, in menu order.
public enum OnlineMode: String, Codable, CaseIterable, Sendable {
    case practice, grandPrix

    /// The modes whose laps go into the lap records.
    public static let recordModes: [OnlineMode] = [.grandPrix]
}

/// One player's best lap on a record board.
public struct LapRecord: Codable, Hashable, Sendable {
    public var nickname: String
    /// The lap's time in ticks.
    public var ticks: Int
    /// When it was set, ISO 8601 in UTC.
    public var setAt: String
}

/// The best laps of one mode on one circuit, fastest first.
public struct RecordBoard: Codable, Hashable, Sendable {
    public var mode: OnlineMode
    public var track: String
    public var records: [LapRecord]
}

/// Whether a room takes newcomers: a Grand Prix is `running` from its start on.
public enum RoomStatus: String, Codable, Sendable {
    case open, running
}

/// A room the server offers: one per mode and track.
public struct RoomInfo: Codable, Hashable, Sendable {
    public var mode: OnlineMode
    public var track: String
    /// Players in it right now.
    public var players: Int
    public var status: RoomStatus
}

public enum RejectReason: String, Codable, Sendable {
    case taken, invalid, full, version
}

/// What the app sends.
public enum ClientMessage: Equatable, Sendable {
    case hello(nickname: String, protocol: Int = NetProtocol.version)
    /// After the welcome: go into the room of this mode and track.
    case enter(mode: OnlineMode, track: String)
    /// One client tick's input; `seq` grows by one every tick.
    case input(seq: Int, input: InputCommand)
    /// Round-trip probe: the server echoes `t` back in a `pong`.
    case ping(t: Double)
    /// In a Grand Prix: the manager's command (`playAgain`: anyone's).
    case gp(GrandPrixCommand)

    /// The message as the web's `encodeMessage` writes it.
    public func encoded() -> String {
        var object: [String: Any]
        switch self {
        case .hello(let nickname, let version):
            object = ["type": "hello", "protocol": version, "nickname": nickname]
        case .enter(let mode, let track):
            object = ["type": "enter", "mode": mode.rawValue, "track": track]
        case .input(let seq, let input):
            var fields: [String: Any] = [
                "throttle": input.throttle, "brake": input.brake, "reverse": input.reverse,
                "steer": input.steer, "reset": input.reset,
            ]
            if let compound = input.compound { fields["compound"] = compound.rawValue }
            object = ["type": "input", "seq": seq, "input": fields]
        case .ping(let t):
            object = ["type": "ping", "t": t]
        case .gp(let command):
            object = ["type": "gp"]
            switch command {
            case .start: object["action"] = "start"
            case .weather(let weather):
                object["action"] = "weather"
                object["weather"] = weather.rawValue
            case .endQualifying: object["action"] = "endQualifying"
            case .startRace(let laps):
                object["action"] = "startRace"
                object["laps"] = laps
            case .endRace: object["action"] = "endRace"
            case .playAgain: object["action"] = "playAgain"
            }
        }
        // Only strings, numbers and booleans above: serialising cannot fail.
        let data = try! JSONSerialization.data(withJSONObject: object)
        return String(decoding: data, as: UTF8.self)
    }
}

extension GrandPrixInfo: Codable {
    enum CodingKeys: String, CodingKey {
        case phase, manager, drivers, qualifying, race, raceLaps, hold, boxes, weather, sectorBests
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            phase: try c.decode(GrandPrixPhase.self, forKey: .phase),
            manager: try c.decodeIfPresent(CarId.self, forKey: .manager),
            drivers: try c.decode([CarId].self, forKey: .drivers),
            qualifying: try c.decode([QualifyingEntry].self, forKey: .qualifying),
            race: try c.decode([RaceStanding].self, forKey: .race),
            raceLaps: try c.decodeIfPresent(Int.self, forKey: .raceLaps),
            hold: try c.decodeIfPresent(StartHold.self, forKey: .hold),
            boxes: try c.decode([CarId: Int].self, forKey: .boxes),
            weather: try c.decode(Weather.self, forKey: .weather),
            sectorBests: try c.decode([Int?].self, forKey: .sectorBests))
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(phase, forKey: .phase)
        try c.encode(manager, forKey: .manager)
        try c.encode(drivers, forKey: .drivers)
        try c.encode(qualifying, forKey: .qualifying)
        try c.encode(race, forKey: .race)
        try c.encode(raceLaps, forKey: .raceLaps)
        try c.encode(hold, forKey: .hold)
        try c.encode(boxes, forKey: .boxes)
        try c.encode(weather, forKey: .weather)
        try c.encode(sectorBests, forKey: .sectorBests)
    }
}

/// What the server sends.
public enum ServerMessage: Sendable {
    /// Nickname accepted: the player's id, the rooms to pick from and the lap records.
    case welcome(playerId: CarId, rooms: [RoomInfo], records: [RecordBoard])
    case rejected(RejectReason)
    /// `enter` refused: that circuit's Grand Prix has started (the player stays joined).
    case refused
    /// In the room: its track and the players in it.
    case entered(track: String, players: [PlayerInfo])
    /// The players in the room, after every join and leave there.
    case players([PlayerInfo])
    /// The room's state; per car the `seq` of the last input it ran and that input.
    case snapshot(state: GameState, acks: [CarId: Int], inputs: [CarId: InputCommand])
    /// Echo of a `ping`.
    case pong(t: Double)
    /// The room's Grand Prix, on entering and whenever it changes.
    case grandPrix(GrandPrixInfo)

    /// Reads a message from the server (trusted, as the web's `parseServerMessage`): nil for
    /// anything that isn't one.
    public static func parse(_ raw: String) -> ServerMessage? {
        try? JSONDecoder().decode(Envelope.self, from: Data(raw.utf8)).message
    }

    private struct Envelope: Decodable {
        let message: ServerMessage?

        enum Keys: String, CodingKey {
            case type, playerId, rooms, records, reason, track, players, state, acks, inputs, t
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: Keys.self)
            switch try c.decode(String.self, forKey: .type) {
            case "welcome":
                message = .welcome(
                    playerId: try c.decode(CarId.self, forKey: .playerId),
                    rooms: try c.decode([RoomInfo].self, forKey: .rooms),
                    records: try c.decode([RecordBoard].self, forKey: .records))
            case "rejected": message = .rejected(try c.decode(RejectReason.self, forKey: .reason))
            case "refused": message = .refused
            case "entered":
                message = .entered(
                    track: try c.decode(String.self, forKey: .track),
                    players: try c.decode([PlayerInfo].self, forKey: .players))
            case "players": message = .players(try c.decode([PlayerInfo].self, forKey: .players))
            case "snapshot":
                message = .snapshot(
                    state: try c.decode(GameState.self, forKey: .state),
                    acks: try c.decode([CarId: Int].self, forKey: .acks),
                    inputs: try c.decode([CarId: InputCommand].self, forKey: .inputs))
            case "pong": message = .pong(t: try c.decode(Double.self, forKey: .t))
            case "grandPrix": message = .grandPrix(try GrandPrixInfo(from: decoder))
            default: message = nil
            }
        }
    }
}
