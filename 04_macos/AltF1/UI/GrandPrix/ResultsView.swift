import AltF1Core
import SwiftUI

/// The race's results (the web's `ResultsScreen` and `resultsText.ts`): the podium, then the
/// classification with each driver's team and points, then the constructors' standings of the
/// race; Race again or Exit. Enter takes the first choice, Esc exits (both from the race's keys).
struct ResultsView: View {
    let session: GrandPrixSession
    let exit: () -> Void

    private var card: GrandPrixSession.ResultsCard { session.resultsCard }

    var body: some View {
        let race = session.info.race
        let laps = session.info.raceLaps ?? 0
        let points = racePoints(race)
        VStack(spacing: 18) {
            switch card {
            case .podium: podium(race, laps)
            case .classification: classification(race, laps, points)
            case .constructors: constructors(race, points)
            }
            HStack(spacing: 12) {
                Button(primaryTitle) { primary() }
                    .buttonStyle(.glassProminent)
                    .tint(.altF1Red)
                Button("Exit") { exit() }
                    .buttonStyle(.glass)
            }
            .controlSize(.large)
            Text("Enter · Esc: exit").font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary)
        }
        .padding(28)
        .glassEffect(.regular, in: .rect(cornerRadius: 32))
        .animation(.smooth(duration: 0.3), value: card)
    }

    private var primaryTitle: String {
        switch card {
        case .podium: "Classification"
        case .classification: "Constructors"
        case .constructors: "Race again"
        }
    }

    private func primary() { session.nextResultsCard() }

    private func title(_ text: String) -> some View {
        Text(text).font(.system(size: 13, weight: .heavy)).tracking(1.6).foregroundStyle(.secondary)
    }

    /// The first three classified on their steps, second and third either side of the winner.
    private func podium(_ race: [RaceStanding], _ laps: Int) -> some View {
        let places = Array(race.prefix(3).enumerated().filter { $0.element.status != .dnf })
        let order = [1, 0, 2].compactMap { i in places.first { $0.offset == i } }
        return VStack(spacing: 20) {
            title("GRAND PRIX · PODIUM")
            HStack(alignment: .bottom, spacing: 18) {
                ForEach(order, id: \.offset) { i, standing in
                    VStack(spacing: 8) {
                        Text(standing.name).font(.system(size: 18, weight: .heavy))
                        Text(GrandPrixText.raceNote(standing, i, laps))
                            .font(.system(size: 13, weight: .semibold).monospacedDigit()).foregroundStyle(.secondary)
                        RoundedRectangle(cornerRadius: 14)
                            .fill(session.livery(standing.id).color.gradient)
                            .frame(width: 150, height: [190, 140, 110][i])
                            .overlay(Text("\(i + 1)").font(.system(size: 56, weight: .black)).foregroundStyle(.white.opacity(0.9)))
                    }
                }
            }
        }
    }

    private func classification(_ race: [RaceStanding], _ laps: Int, _ points: [CarId: Int]) -> some View {
        let fastest = race.compactMap(\.best).min()
        return VStack(alignment: .leading, spacing: 10) {
            title("GRAND PRIX · CLASSIFICATION · \(laps) LAPS")
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 6) {
                GridRow {
                    ForEach(["POS", "DRIVER", "TEAM", "GAP", "BEST LAP", "STOPS", "PEN", "PTS"], id: \.self) {
                        Text($0).font(.system(size: 10, weight: .heavy)).foregroundStyle(.secondary)
                    }
                }
                ForEach(Array(race.enumerated()), id: \.offset) { i, s in
                    let required = requiredStops(s.laps)
                    GridRow {
                        Text(s.status == .dnf ? "—" : "\(i + 1)").fontWeight(.heavy)
                        HStack(spacing: 6) {
                            RoundedRectangle(cornerRadius: 2).fill(session.livery(s.id).color).frame(width: 4, height: 14)
                            Text(s.name).fontWeight(s.id == GrandPrixSession.playerId ? .heavy : .semibold)
                        }
                        Text(team(s.id)).foregroundStyle(.secondary)
                        Text(GrandPrixText.raceNote(s, i, laps)).monospacedDigit()
                        Text(s.best.map { Format.lapTime($0) } ?? "—").monospacedDigit()
                            .foregroundStyle(s.best != nil && s.best == fastest ? SectorShade.purple.color : .primary)
                        Text(required > 0 ? "\(s.stops)/\(required)" : "\(s.stops)")
                            .foregroundStyle(s.status != .dnf && s.stops < required ? SectorShade.yellow.color : .primary)
                        Text(s.penalty > 0 ? "+\(s.penalty / tickRate) s" : "").foregroundStyle(Color.altF1Red)
                        Text("\(points[s.id] ?? 0)").fontWeight(.heavy)
                    }
                    .font(.system(size: 13).monospacedDigit())
                }
            }
        }
        .frame(minWidth: 720)
    }

    private func constructors(_ race: [RaceStanding], _ points: [CarId: Int]) -> some View {
        let standings = constructorStandings(race, points, session.seats)
        return VStack(alignment: .leading, spacing: 10) {
            title("GRAND PRIX · CONSTRUCTORS")
            ForEach(Array(standings.enumerated()), id: \.offset) { i, s in
                HStack(spacing: 12) {
                    Text("\(i + 1)").font(.system(size: 16, weight: .heavy)).frame(width: 24)
                    RoundedRectangle(cornerRadius: 3).fill(Livery.team(s.team).color).frame(width: 6, height: 26)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Teams.team(s.team).name).font(.system(size: 15, weight: s.team == session.playerTeam ? .heavy : .bold))
                        Text(s.drivers.map { "\($0.name) \($0.points)" }.joined(separator: " · "))
                            .font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text("\(s.points)").font(.system(size: 18, weight: .heavy).monospacedDigit())
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(s.team == session.playerTeam ? Color.white.opacity(0.12) : .clear, in: .rect(cornerRadius: 10))
            }
        }
        .frame(width: 460)
    }

    private func team(_ id: CarId) -> String {
        session.seats.first { $0.id == id }.map { Teams.team($0.team).name } ?? ""
    }
}
