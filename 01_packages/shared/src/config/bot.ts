/**
 * Bot driving levels. Meaning and measured lap times are documented in 01_docs/bot.md.
 * Defaults: the frozen tuning baseline, see config/tuning.ts.
 */
export type BotLevel = 'easy' | 'medium' | 'hard';

/** Order the levels are cycled in (B key). */
export const BOT_LEVELS: readonly BotLevel[] = ['easy', 'medium', 'hard'];

export interface BotParams {
  /**
   * Multiplier on the cornering speed the car's yaw rate allows (1 = that estimate). The estimate
   * ignores slip, so the car can really carry a bit more: above 1 is still clean (see 01_docs/bot.md).
   */
  cornerSpeed: number;
  /** Fraction of `brakeDecel` the bot plans its braking with. Lower = brakes earlier. */
  brakeUse: number;
  /** Fraction of the usable half-width the racing line may use (0 = stays on the centreline). */
  lineCut: number;
  /** Fraction of `maxSpeed` allowed anywhere. */
  topSpeed: number;
  /** Multiplier on the bot car's `engineAccel` and `maxSpeed` vs the player's (1 = same car). */
  performance: number;
  /** Takes the track's first branch (a shortcut) instead of the main road. */
  shortcuts: boolean;
}

export const BOT_PARAMS: Record<BotLevel, BotParams> = {
  easy: {
    cornerSpeed: 0.5,
    brakeUse: 0.55,
    lineCut: 0.4,
    topSpeed: 0.75,
    performance: 1,
    shortcuts: false,
  },
  medium: {
    cornerSpeed: 1.15,
    brakeUse: 1,
    lineCut: 1,
    topSpeed: 1,
    performance: 1,
    shortcuts: false,
  },
  hard: {
    cornerSpeed: 1.15,
    brakeUse: 1,
    lineCut: 1,
    topSpeed: 1,
    performance: 1.03,
    shortcuts: true,
  },
};

/** How every bot steers and recovers, whatever its level. */
export const BOT_DRIVER = {
  /** Steering aims at the racing line this far ahead (m) ... */
  lookAheadBase: 8,
  /** ... plus this many seconds of travel at the current speed. */
  lookAheadTime: 0.5,
  /** Steering per radian between the nose and the aim point. */
  steerGain: 2.5,
  /** The target speed is read this many seconds ahead, to react before a braking point. */
  speedLookAheadTime: 0.25,
  /** Room kept between the racing line and the asphalt edge (m). */
  edgeMargin: 3,
  /** The racing line is relaxed towards the midpoint of the points this far before and after (m). */
  lineSpan: 8,
  /** Relaxation passes for the racing line; enough for it to settle on the longest straights. */
  lineIterations: 80,
  /** Other cars within this many metres along the road are traffic (S.2). */
  trafficRange: 150,
  /** Two cars closer sideways than this (m, centre to centre) are on the same path. */
  carWidth: 3.5,
  /** A car held in its pit box may be passed this close sideways (m, centre to centre). */
  parkedWidth: 2.6,
  /** Close behind a car held in its pit box the bot creeps on at this speed (m/s) to get round it. */
  creepSpeed: 3,
  /** A car ahead and on the path is followed at least this far back (m, centre to centre) ... */
  followGap: 6,
  /** ... plus this many seconds of its speed. */
  followTime: 0.04,
  /** Braking the bot counts on to slow to a car ahead's speed (m/s²; `brakeDecel` is 30). */
  trafficDecel: 22,
  /** A slower car this far ahead (m) ... */
  passLookAhead: 18,
  /** ... plus this many seconds of travel makes the bot move aside to pass it. */
  passLookAheadTime: 0,
  /** A car ahead this much slower (m/s) than the bot would go is worth passing. */
  passMargin: 0.5,
  /** A pass not done when the line ahead (this many seconds of travel) ... */
  passAbortTime: 1.2,
  /** ... drops by more than this (m/s: a braking zone) is given up. */
  passAbortDrop: 8,
  /** Giving way to a car alongside into a braking zone: this much slower than it (m/s). */
  yieldDrop: 3,
  /** How fast the bot moves off or back to its line (m/s sideways). */
  passRate: 4,
  /** Room kept between a passing bot and the asphalt edge (m) ... */
  passEdgeMargin: 2,
  /** ... and with a car alongside leaving it less room. */
  squeezeEdgeMargin: 1,
  /** A car closer than this along the road (m) is alongside. */
  alongside: 9,
  /** Slower than this (m/s) for `stuckSeconds` = stuck: the bot resets like a player would (R). */
  stuckSpeed: 2,
  stuckSeconds: 2,
} as const;

/**
 * When single player's GP bots pit for other tyres as the weather turns (2.8, `wrongTyres`): the
 * wetness their tyres no longer suit. Wider than `weatherCompound`'s choice, so a bot fresh out
 * on the right tyres doesn't come straight back in.
 */
export const BOT_TYRE_SWITCH = {
  /** Slicks: pit once the track is this wet. */
  slickAbove: 0.3,
  /** Intermediates: pit when the track is this wet (for full wets) … */
  intermediateAbove: 0.75,
  /** … or this dry (for slicks). */
  intermediateBelow: 0.05,
  /** Full wets: pit when the track is this dry (for intermediates). */
  wetBelow: 0.4,
} as const;

/**
 * Single player's GP bots on a wet track (2.8, `wetLift`): they lift off the throttle once their
 * cornering load reaches this share of where the rear breaks loose (`slideFrom`), so they never
 * spin themselves round.
 */
export const BOT_SLIDE_MARGIN = 0.9;
