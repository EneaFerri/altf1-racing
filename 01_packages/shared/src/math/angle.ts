const TAU = Math.PI * 2;

/** Wraps an angle into (-PI, PI]. */
export function wrapAngle(angle: number): number {
  const wrapped = angle - TAU * Math.floor((angle + Math.PI) / TAU);
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

/** Interpolates between two angles along the shortest arc. */
export function lerpAngle(from: number, to: number, t: number): number {
  return wrapAngle(from + wrapAngle(to - from) * t);
}

/** Moves `value` towards `target` by at most `maxDelta`, without overshooting. */
export function moveToward(value: number, target: number, maxDelta: number): number {
  if (Math.abs(target - value) <= maxDelta) return target;
  return value + Math.sign(target - value) * maxDelta;
}
