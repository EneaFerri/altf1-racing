import AltF1Core
import RealityKit

/// Camera tuning (the web's `CAMERA_PARAMS`, view only).
struct CameraParams {
    /// Chase: distance behind the car (m), camera height (m), aim ahead (m) and its height (m).
    var distance: Double = 7
    var height: Double = 3
    var lookAhead: Double = 1.1
    var lookHeight: Double = 1.1
    /// Chase: how quickly the camera swings round behind the car (1/s).
    var yawStiffness: Double = 5
    /// Chase: vertical field of view at rest (degrees).
    var fov: Double = 70
    /// First person: the onboard camera, just behind and above the helmet like a real F1's: along
    /// the car (m, + = towards the nose), its height (m), tilt (rad), FOV. The web's view is higher
    /// and wider (−1.1, 2, −0.07, 100): it has no halo or cockpit to look through.
    var eyeAhead: Double = -0.12
    var eyeHeight: Double = 1.17
    var pitch: Double = -0.09
    var povFov: Double = 72
    /// Both: extra FOV (degrees) at `fovSpeedRef` m/s, and how fast it follows the speed (1/s).
    var fovSpeedGain: Double = 25
    var fovSpeedRef: Double = 71
    var fovStiffness: Double = 10

    static let baseline = CameraParams()
}

enum CameraMode {
    case chase, firstPerson
}

/// The one scene camera, driven as chase or first-person camera (V toggles), looking behind the car
/// while Z is held (the web's `CameraRig`, `ChaseCamera`, `FirstPersonCamera`).
@MainActor
final class CameraRig {
    let camera = PerspectiveCamera()
    private(set) var mode = CameraMode.chase
    var params = CameraParams.baseline
    private var yaw: Double?
    private var fov: Double?

    init() {
        // Close enough for the halo, a few tens of centimetres from the onboard camera.
        camera.camera.near = 0.03
        camera.camera.far = 5000
    }

    func toggle() {
        mode = mode == .chase ? .firstPerson : .chase
        yaw = nil
        fov = nil
    }

    func update(_ pose: CarPose, frameSeconds: Double, lookBack: Bool) {
        let p = params
        let pov = mode == .firstPerson
        // Field of view: wider with speed, smoothed (frame-rate independent).
        let target = (pov ? p.povFov : p.fov) + p.fovSpeedGain * min(1, max(0, pose.forwardSpeed) / p.fovSpeedRef)
        let smoothed = fov.map { $0 + (target - $0) * (1 - exp(-p.fovStiffness * frameSeconds)) } ?? target
        fov = smoothed
        camera.camera.fieldOfViewInDegrees = Float(smoothed)

        #if DEBUG
            if let orbit = DevOptions.orbit {
                let from = Vec2.toWorld(pose.position, pose.heading - orbit.angle, ahead: -orbit.distance, side: 0)
                camera.look(
                    at: pose.worldPosition + SIMD3(0, 0.5, 0),
                    from: SIMD3(Float(from.x), Float(pose.y + orbit.height), Float(from.z)), relativeTo: nil)
                return
            }
        #endif
        let yawOffset = lookBack ? Double.pi : 0
        if pov {
            let eye = Vec2.toWorld(pose.position, pose.heading, ahead: p.eyeAhead, side: 0)
            camera.position = SIMD3(Float(eye.x), Float(pose.y + p.eyeHeight), Float(eye.z))
            let carPitch = pose.pitch * cos(yawOffset)
            camera.orientation =
                simd_quatf(angle: Float(pose.heading + yawOffset), axis: SIMD3(0, 1, 0))
                * simd_quatf(angle: Float(p.pitch + carPitch), axis: SIMD3(1, 0, 0))
        } else {
            // Only the yaw is smoothed: the distance stays the same at any speed.
            let followed = yaw.map { lerpAngle($0, pose.heading, 1 - exp(-p.yawStiffness * frameSeconds)) } ?? pose.heading
            yaw = followed
            let behind = Vec2.forward(followed + yawOffset)
            let eye = SIMD3<Float>(
                Float(pose.position.x - behind.x * p.distance), Float(pose.y + p.height),
                Float(pose.position.z - behind.z * p.distance))
            let aim = SIMD3<Float>(
                Float(pose.position.x + behind.x * p.lookAhead), Float(pose.y + p.lookHeight),
                Float(pose.position.z + behind.z * p.lookAhead))
            camera.look(at: aim, from: eye, relativeTo: nil)
        }
    }
}
