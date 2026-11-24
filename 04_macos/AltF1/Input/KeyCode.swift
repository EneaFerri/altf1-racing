import AppKit
import SwiftUI

/// Physical key codes (`NSEvent.keyCode`, the Mac's `KeyboardEvent.code`): the same key whatever the
/// keyboard layout, as on the web (01_packages/client/src/controller/bindings.ts).
enum KeyCode {
    static let a: UInt16 = 0
    static let s: UInt16 = 1
    static let d: UInt16 = 2
    static let b: UInt16 = 11
    static let z: UInt16 = 6
    static let v: UInt16 = 9
    static let w: UInt16 = 13
    static let r: UInt16 = 15
    static let returnKey: UInt16 = 36
    static let space: UInt16 = 49
    static let escape: UInt16 = 53
    static let keypadEnter: UInt16 = 76
    static let digit1: UInt16 = 18
    static let digit2: UInt16 = 19
    static let digit3: UInt16 = 20
    static let digit4: UInt16 = 21
    static let equal: UInt16 = 24
    static let minus: UInt16 = 27
    static let keypadPlus: UInt16 = 69
    static let keypadMinus: UInt16 = 78
    static let keypad1: UInt16 = 83
    static let keypad2: UInt16 = 84
    static let keypad3: UInt16 = 85
    static let keypad4: UInt16 = 86
    static let f3: UInt16 = 99
    static let arrowLeft: UInt16 = 123
    static let arrowRight: UInt16 = 124
    static let arrowDown: UInt16 = 125
    static let arrowUp: UInt16 = 126

    static let up: Set<UInt16> = [w, arrowUp]
    static let down: Set<UInt16> = [s, arrowDown]
    static let confirm: Set<UInt16> = [returnKey, keypadEnter, space]
}

extension View {
    /// Calls `handler` with each key pressed while this view is on screen; a `true` result swallows
    /// the key (no system beep).
    func onKeyDown(_ handler: @escaping (UInt16) -> Bool) -> some View {
        modifier(KeyDownModifier(handler: handler))
    }
}

private struct KeyDownModifier: ViewModifier {
    let handler: (UInt16) -> Bool
    @State private var monitor: Any?

    func body(content: Content) -> some View {
        content
            .onAppear {
                monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
                    handler(event.keyCode) ? nil : event
                }
            }
            .onDisappear {
                if let monitor { NSEvent.removeMonitor(monitor) }
                monitor = nil
            }
    }
}
