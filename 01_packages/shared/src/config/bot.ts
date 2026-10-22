/**
 * Bot driving levels. Meaning and measured lap times are documented in 01_docs/bot.md.
 * Values: provisional, see config/tuning.ts.
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
  /**
   * Scales the corner speeds planned for drifting (0 = never drifts). Where grip alone can't turn the
   * car fast enough, the bot drifts like a player (Space + steer). Above 1 is still clean: the aim
   * correction tightens the drift when needed (see 01_docs/bot.md).
   */
  driftUse: number;
  /** Multiplier on the bot car's `engineAccel` and `maxSpeed` vs the player's (1 = same car). */
  performance: number;
}

export const BOT_PARAMS: Record<BotLevel, BotParams> = {
  easy: {
    cornerSpeed: 0.65,
    brakeUse: 0.55,
    lineCut: 0.4,
    topSpeed: 0.75,
    driftUse: 0,
    performance: 1,
  },
  medium: { cornerSpeed: 1.15, brakeUse: 1, lineCut: 1, topSpeed: 1, driftUse: 0, performance: 1 },
  hard: {
    cornerSpeed: 1.15,
    brakeUse: 1,
    lineCut: 0.5,
    topSpeed: 1,
    driftUse: 1.1,
    performance: 1.03,
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
  /** The curvature that decides a drift is read this many seconds ahead (the drift takes time to build). */
  driftLookAheadTime: 0.45,
  /** A drift continues while the corner needs at least this share of the drift's slowest turn rate. */
  driftKeepShare: 1,
  /** No drift is planned or started within this distance (m) after a corner the other way ... */
  driftBuildDistance: 100,
  /** ... where a corner means a racing-line curvature above this (1/m, radius under 100 m). */
  oppositeCornerCurvature: 0.01,
  /** In a drift, extra turn rate (rad/s) per radian between the direction of travel and the aim point. */
  driftAimGain: 3,
  /** Room kept between the racing line and the asphalt edge (m). */
  edgeMargin: 3,
  /** The racing line is relaxed towards the midpoint of the points this far before and after (m). */
  lineSpan: 8,
  /** Relaxation passes for the racing line; enough for it to settle on the longest straights. */
  lineIterations: 80,
  /** Slower than this (m/s) for `stuckSeconds` = stuck: the bot resets like a player would (R). */
  stuckSpeed: 2,
  stuckSeconds: 2,
} as const;
