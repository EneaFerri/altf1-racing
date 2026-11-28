import AltF1Core

/// A race on screen, whatever its mode (Time trial and Test: `DriveSession`; the Grand Prix:
/// `GrandPrixSession`): what the renderer, the HUD and the minimap read.
@MainActor
protocol RaceSession: AnyObject {
    var track: Track { get }
    var previous: GameState { get }
    var current: GameState { get }
    var keyboard: Keyboard { get }
    /// The player's input of the last tick (the telemetry).
    var lastInput: InputCommand { get }
    /// The player's speed for the HUD (km/h).
    var speedKmh: Int { get }
    /// The car the camera follows: the player's, or another while the player is off the track.
    var followed: CarId { get }
    /// Feeds one frame of real time; how far between the last two ticks it is, the clamped time.
    func advance(_ frameSeconds: Double) -> (alpha: Double, seconds: Double)
    /// How each car is painted.
    func livery(_ id: CarId) -> Livery
    /// Time trial's ghost; nil elsewhere.
    func ghostPose(alpha: Double) -> CarPose?
    /// The player's own pit box, painted yellow (the Grand Prix); nil elsewhere.
    var ownPitBox: Int? { get }
    /// The player's car: "player" on this Mac, the server's id online.
    var playerId: CarId { get }
    /// The safety car's light bar flashing (online Grand Prix only, R.3).
    var safetyCarLights: Bool { get }
    /// Crashes' debris and yellow flags out now (a Grand Prix, R.2).
    var yellowFlags: [YellowFlag] { get }
    /// How wet the track is now (0 dry … 1 soaked; a Grand Prix's weather, 2.8).
    var wetness: Double { get }
    /// Whether this circuit may be wet at all (its rain's look is made ready).
    var mayRain: Bool { get }
}

extension RaceSession {
    /// No safety car outside an online Grand Prix.
    var safetyCarLights: Bool { false }
    /// No crashes' flags outside a Grand Prix.
    var yellowFlags: [YellowFlag] { [] }
    /// Dry outside a Grand Prix.
    var wetness: Double { 0 }
    var mayRain: Bool { false }

    /// Every car between the last two ticks (a car new since the last tick drawn where it is).
    func poses(alpha: Double) -> [CarId: CarPose] {
        var poses: [CarId: CarPose] = [:]
        for curr in current.cars {
            poses[curr.id] = CarPose(previous.car(curr.id) ?? curr, curr, alpha: alpha, track: track)
        }
        return poses
    }

    func ghostPose(alpha: Double) -> CarPose? { nil }

    var ownPitBox: Int? { nil }

    var playerId: CarId { DriveSession.playerId }
}
