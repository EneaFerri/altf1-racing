/// One car of the single-player Grand Prix: the player, or a bot at its level (`race/teams.ts`).
public struct Seat: Hashable, Sendable {
    public enum Kind: Hashable, Sendable {
        case player
        case bot(BotLevel)
    }

    /// Car id: `player`, or the bot's `<team>-<driver index>` (e.g. `ferrari-1`).
    public let id: CarId
    public let name: String
    public let team: TeamId
    public let kind: Kind

    /// The player's car id in the single-player Grand Prix.
    public static let playerId: CarId = "player"
}

/// The 10 cars with the player in `playerTeam`: one of its two drivers (drawn with `random`) gives
/// their seat to the player; the 9 bots, by team strength then driver order, are Hard for the first
/// five, Medium for the rest. Seats in team order.
public func teamLineup(_ playerTeam: TeamId, random: () -> Double, playerName: String = "You") -> [Seat] {
    let replaced = random() < 0.5 ? 0 : 1
    var hardLeft = Teams.hardBots
    return Teams.all.flatMap { team in
        team.drivers.enumerated().map { i, driver in
            if team.id == playerTeam && i == replaced {
                return Seat(id: Seat.playerId, name: playerName, team: team.id, kind: .player)
            }
            let level: BotLevel = hardLeft > 0 ? .hard : .medium
            hardLeft -= 1
            return Seat(id: "\(team.id.rawValue)-\(i)", name: driver, team: team.id, kind: .bot(level))
        }
    }
}

/// Each car's pit box: one per team (teammates share it), the player one of their own after them.
public func teamBoxes(_ seats: [Seat]) -> [CarId: Int] {
    Dictionary(uniqueKeysWithValues: seats.map { seat in
        (seat.id, seat.kind == .player ? Teams.all.count : Teams.all.firstIndex { $0.id == seat.team }!)
    })
}

/// The bots of `seats` for `BotSquad`: level, box, and a lap of lag for a team's second bot.
public func squadBots(_ seats: [Seat]) -> [SquadBot] {
    let boxes = teamBoxes(seats)
    var seen: Set<TeamId> = []
    return seats.compactMap { seat in
        guard case .bot(let level) = seat.kind else { return nil }
        let lag = seen.contains(seat.team) ? 1 : 0
        seen.insert(seat.team)
        return SquadBot(id: seat.id, level: level, box: boxes[seat.id]!, pitLag: lag)
    }
}
