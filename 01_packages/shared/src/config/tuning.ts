/**
 * Status of the default tuning values: CAR_PARAMS, COLLISION_PARAMS, SURFACE_PARAMS, BOT_PARAMS and the client's
 * CAMERA_PARAMS. 'provisional' = the current baseline, not final yet. Bump `version` and `frozenOn`
 * at every re-freeze; how to re-tune is in 01_docs/tuning.md.
 */
interface TuningBaseline {
  readonly status: 'provisional' | 'final';
  readonly version: number;
  /** Date the values were last frozen (YYYY-MM-DD). */
  readonly frozenOn: string;
}

export const TUNING_BASELINE: TuningBaseline = {
  status: 'provisional',
  version: 1,
  frozenOn: '2026-10-22',
};

/** Short label for dev tools, e.g. "baseline v1 provisional". */
export function tuningLabel(): string {
  return `baseline v${TUNING_BASELINE.version} ${TUNING_BASELINE.status}`;
}
