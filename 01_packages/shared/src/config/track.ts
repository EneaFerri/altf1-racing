/** Rules used when compiling a TrackDefinition. Documented in 01_docs/track.md. */
export const TRACK_RULES = {
  /** Distance between centreline samples (m). */
  sampleSpacing: 2,
  /** Corners tighter than this curvature (1/radius) get low kerbs on both sides. */
  kerbMinCurvature: 1 / 110,
  /** Kerbs are extended this far before and after the corner (m). */
  kerbExtension: 8,
  /** Corners tighter than this get a gravel trap on the outside instead of grass. */
  gravelMinCurvature: 1 / 45,
  /** Gravel starts this far before the corner and runs this far after it (m). */
  gravelBefore: 6,
  gravelAfter: 36,
  /** Kerb band: from `inset` inside the track edge to `outset` outside it (m). */
  kerbInset: 0.6,
  kerbOutset: 1.0,
  /** High kerbs are placed on samples curving more than this (1/m). */
  highKerbMinCurvature: 1 / 300,
} as const;
