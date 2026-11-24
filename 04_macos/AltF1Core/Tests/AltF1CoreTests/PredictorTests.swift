import Foundation
import Testing

@testable import AltF1Core

/// The online prediction (the web's `Predictor.test.ts`): what it draws matches what the server
/// runs, with the inputs it hasn't run yet replayed on top.
@Suite struct PredictorTests {
    private let track: Track
    private let throttle = InputCommand(throttle: 1)

    init() throws {
        track = try buildTrack(CircuitCatalog.definition("monza"))
    }

    /// `ticks` server ticks from `state`: p1 on `own`, p2 on `other`.
    private func run(_ state: GameState, _ ticks: Int, own: InputCommand, other: InputCommand = .neutral) -> GameState {
        var state = state
        for _ in 0..<ticks { state = stepGame(state, ["p1": own, "p2": other], onlineSimContext(track)) }
        return state
    }

    @Test func drawsNothingBeforeTheFirstSnapshotButKeepsTheInputs() {
        let predictor = Predictor(playerId: "p1", track: track)
        predictor.step(0, throttle)
        #expect(predictor.current == nil)
        #expect(predictor.ahead == 1)
    }

    @Test func replaysWhatTheServerHasNotRunYet() {
        let start = createGame(track, ["p1", "p2"])
        let predictor = Predictor(playerId: "p1", track: track)
        predictor.reconcile(state: start, acks: [:], inputs: ["p2": throttle])
        for seq in 0..<30 { predictor.step(seq, throttle) }
        // The server has run the first 10 of them: its snapshot, then the other 20 replayed.
        let server = run(start, 10, own: throttle, other: throttle)
        predictor.reconcile(state: server, acks: ["p1": 9], inputs: ["p1": throttle, "p2": throttle])
        #expect(predictor.ahead == 20)
        let expected = run(start, 30, own: throttle, other: throttle)
        #expect(predictor.current?.car("p1") == expected.car("p1"))
        #expect(predictor.current?.car("p2") == expected.car("p2"))
        #expect(predictor.lastCorrection < 1e-9)
    }

    @Test func holdsEveryCarOnTheGridUntilLightsOut() {
        let start = createGame(track, ["p1", "p2"])
        let predictor = Predictor(playerId: "p1", track: track)
        predictor.hold = StartHold(lightsFrom: 0, until: 10)
        predictor.reconcile(state: start, acks: [:], inputs: ["p2": throttle])
        for seq in 0..<10 { predictor.step(seq, throttle) }
        #expect(predictor.current?.car("p1")?.velocity == start.car("p1")?.velocity)
        predictor.step(10, throttle)
        #expect(predictor.current?.car("p1")?.velocity != start.car("p1")?.velocity)
    }

    @Test func glidesASmallCorrectionAndSnapsABigOne() {
        let start = createGame(track, ["p1"])
        let predictor = Predictor(playerId: "p1", track: track)
        predictor.reconcile(state: start, acks: [:], inputs: [:])
        // The server moved the car 1 m: drawn where it was, then gliding there.
        var moved = start
        moved.cars[0].position = start.cars[0].position + Vec2(1, 0)
        predictor.reconcile(state: moved, acks: [:], inputs: [:])
        #expect(predictor.current?.car("p1")?.position == start.cars[0].position)
        predictor.decay(1)
        #expect((predictor.current?.car("p1")?.position.distance(to: moved.cars[0].position) ?? 1) < 1e-3)
        // 10 m: shown at once.
        var far = moved
        far.cars[0].position = moved.cars[0].position + Vec2(10, 0)
        predictor.reconcile(state: far, acks: [:], inputs: [:])
        #expect(predictor.current?.car("p1")?.position == far.cars[0].position)
    }
}
