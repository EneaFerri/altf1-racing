/// A variable GP's weather (`race/forecast.ts`, 2.8, 01_docs/weather.md): the wetness it starts at
/// and the one it turns to during the race; one of them is 0.
public struct WeatherTurn: Hashable, Sendable {
    public var from: Double
    public var to: Double
}

/// A variable GP's turn of weather, drawn (`random` in [0, 1)) when the manager chooses it.
public func drawWeatherTurn(_ random: () -> Double, _ p: ForecastParams = .baseline) -> WeatherTurn {
    let startsWet = random() < 0.5
    let wet = between(p.wetness, random())
    return startsWet ? WeatherTurn(from: wet, to: 0) : WeatherTurn(from: 0, to: wet)
}

/// The weather until the race starts: dry, soaked, or a variable GP's starting wetness.
public func forecastBefore(_ weather: Weather, _ turn: WeatherTurn?) -> Forecast {
    if weather == .rain { return rainForecast }
    if weather == .variable, let turn { return [ForecastPoint(tick: 0, wetness: turn.from)] }
    return dryForecast
}

/// A variable GP's race (from tick `start`, `laps` laps of `lapLength` m): `turn.from` until the
/// weather turns, then `turn.to` reached in `turnLaps` laps (`raceForecast`).
public func raceForecast(
    _ turn: WeatherTurn, start: Int, laps: Int, lapLength: Double, _ random: () -> Double,
    _ p: ForecastParams = .baseline
) -> Forecast {
    let lapTicks = (lapLength / p.lapSpeed) * Double(tickRate)
    let begins = start + Int(jsRound(Double(laps) * lapTicks * between(p.turnAt, random())))
    let ends = begins + max(1, Int(jsRound(lapTicks * between(p.turnLaps, random()))))
    return [ForecastPoint(tick: begins, wetness: turn.from), ForecastPoint(tick: ends, wetness: turn.to)]
}

private func between(_ range: [Double], _ t: Double) -> Double {
    range[0] + (range[1] - range[0]) * t
}
