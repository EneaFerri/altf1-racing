import AltF1Core
import AppKit

/// The race's keys (the web's `controller/bindings.ts`), physical so WASD works on any layout.
enum DriveKeys {
    static let throttle: Set<UInt16> = [KeyCode.w]
    /// Held longer = harder braking.
    static let brake: Set<UInt16> = [KeyCode.space]
    /// Brakes while rolling forward, then drives backwards.
    static let reverse: Set<UInt16> = [KeyCode.s]
    static let steerLeft: Set<UInt16> = [KeyCode.a]
    static let steerRight: Set<UInt16> = [KeyCode.d]
    /// Look behind the car while held (view only).
    static let lookBack: Set<UInt16> = [KeyCode.z]
    /// Put back on the track: delivered to the simulation for exactly one tick.
    static let reset: Set<UInt16> = [KeyCode.r]

    static let held = throttle.union(brake).union(reverse).union(steerLeft).union(steerRight).union(lookBack)
}

/// One-shot actions on a key press; they never reach the simulation.
enum RaceAction {
    case toggleCamera, toggleDebug, cycleBot, backToMenu
    /// The Grand Prix's keys: Enter moves it on; 1–3 a race distance, 4 any other (then ←/→).
    case confirm, choice(Int), lapsDown, lapsUp

    static func of(_ code: UInt16) -> RaceAction? {
        switch code {
        case KeyCode.v: .toggleCamera
        case KeyCode.f3: .toggleDebug
        case KeyCode.b: .cycleBot
        case KeyCode.returnKey, KeyCode.keypadEnter: .confirm
        case KeyCode.digit1, KeyCode.keypad1: .choice(1)
        case KeyCode.digit2, KeyCode.keypad2: .choice(2)
        case KeyCode.digit3, KeyCode.keypad3: .choice(3)
        case KeyCode.digit4, KeyCode.keypad4: .choice(4)
        case KeyCode.arrowLeft, KeyCode.minus, KeyCode.keypadMinus: .lapsDown
        case KeyCode.arrowRight, KeyCode.equal, KeyCode.keypadPlus: .lapsUp
        case KeyCode.escape: .backToMenu
        default: nil
        }
    }
}

/// Turns key events into `InputCommand`s (sampled per tick), held view keys (read per frame) and
/// actions (the web's `KeyboardController`). Lives while the race is on screen.
@MainActor
final class Keyboard {
    private var held: Set<UInt16> = []
    private var resetPending = false
    /// A tyre compound chosen since the last sample (in the box, Grand Prix): sent for one tick.
    private var compoundPending: TyreCompound?
    private var monitor: Any?
    private var resignObserver: NSObjectProtocol?
    var onAction: (RaceAction) -> Void = { _ in }

    func start() {
        guard monitor == nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .keyUp]) { [weak self] event in
            guard let self else { return event }
            return self.handle(event) ? nil : event
        }
        // A key held while the window loses focus would stay down for ever.
        resignObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.didResignActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.held.removeAll() }
        }
    }

    func stop() {
        if let monitor { NSEvent.removeMonitor(monitor) }
        if let resignObserver { NotificationCenter.default.removeObserver(resignObserver) }
        monitor = nil
        resignObserver = nil
        held.removeAll()
    }

    /// The player's intent for the next tick; the reset trigger is delivered once, then cleared.
    func sample() -> InputCommand {
        func isHeld(_ codes: Set<UInt16>) -> Bool { !held.isDisjoint(with: codes) }
        let input = InputCommand(
            throttle: isHeld(DriveKeys.throttle) ? 1 : 0,
            brake: isHeld(DriveKeys.brake) ? 1 : 0,
            reverse: isHeld(DriveKeys.reverse) ? 1 : 0,
            steer: (isHeld(DriveKeys.steerRight) ? 1 : 0) - (isHeld(DriveKeys.steerLeft) ? 1 : 0),
            reset: resetPending,
            compound: compoundPending)
        resetPending = false
        compoundPending = nil
        return input
    }

    /// The tyres to fit if stopped in the box (Grand Prix: keys 1 / 2), with the next tick's input.
    func chooseCompound(_ compound: TyreCompound) {
        compoundPending = compound
    }

    var lookBack: Bool { !held.isDisjoint(with: DriveKeys.lookBack) }

    private func handle(_ event: NSEvent) -> Bool {
        let code = event.keyCode
        if event.type == .keyUp {
            held.remove(code)
            return DriveKeys.held.contains(code)
        }
        if DriveKeys.held.contains(code) {
            held.insert(code)
            return true
        }
        if DriveKeys.reset.contains(code) {
            if !event.isARepeat { resetPending = true }
            return true
        }
        if let action = RaceAction.of(code) {
            if !event.isARepeat { onAction(action) }
            return true
        }
        return false
    }
}
