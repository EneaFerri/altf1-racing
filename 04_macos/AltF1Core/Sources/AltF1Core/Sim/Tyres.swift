/// The set of tyres a car runs on (`sim/tyres.ts`; the Grand Prix only).
public struct TyreState: Codable, Hashable, Sendable {
    public var compound: TyreCompound
    /// 0 = new, 1 = fully worn.
    public var wear: Double

    public init(compound: TyreCompound, wear: Double = 0) {
        self.compound = compound
        self.wear = wear
    }

    /// What every car starts on, and what a car without `CarState.tyres` runs on.
    public static let newMediums = TyreState(compound: .medium)
}

/// The car on `tyres`: grip and turning by the compound's grip, acceleration by its traction, each
/// less by `wornLoss` × wear (`tyredParams`).
public func tyredParams(_ params: CarParams, _ tyres: TyreState, _ p: TyreParams) -> CarParams {
    let worn = 1 - p.wornLoss * tyres.wear
    let grip = p.grip[tyres.compound]! * worn
    var next = params
    next.lateralGrip = params.lateralGrip * grip
    next.maxYawRate = params.maxYawRate * grip
    next.engineAccel = params.engineAccel * p.traction[tyres.compound]! * worn
    return next
}

/// `tyres` after driving `metres` on a circuit `lapLength` long (`wearTyres`).
public func wearTyres(_ tyres: TyreState, _ metres: Double, _ lapLength: Double, _ p: TyreParams) -> TyreState {
    if metres <= 0 || tyres.wear >= 1 { return tyres }
    return TyreState(compound: tyres.compound, wear: min(1, tyres.wear + metres / (p.lifeLaps[tyres.compound]! * lapLength)))
}
