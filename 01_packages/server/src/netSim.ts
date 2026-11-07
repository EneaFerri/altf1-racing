/**
 * Dev-only bad network: when a message sent at a given time is delivered on a link with a delay,
 * jitter and now and then a stall (what a TCP retransmission after a lost packet looks like).
 * Messages keep their order, as on TCP. Pure (time and randomness are passed in); `main.ts`
 * applies it to both directions of every socket when NET_DELAY_MS, NET_JITTER_MS or NET_STALL_MS
 * is set. See 01_docs/multiplayer.md#dev-setup.
 */

export interface NetSimParams {
  /** One-way delay every message has (ms). */
  readonly delayMs: number;
  /** Extra delay, random between 0 and this (ms). */
  readonly jitterMs: number;
  /** How long a stall holds every message back (ms); 0 = no stalls. */
  readonly stallMs: number;
  /** About how often a stall starts (ms, ±50%). */
  readonly stallEveryMs: number;
}

/** Stalls start about this often when NET_STALL_EVERY_MS isn't set (ms). */
const DEFAULT_STALL_EVERY_MS = 3000;

/** The params from the environment; null when none is set (a normal network). */
export function netSimFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): NetSimParams | null {
  const read = (name: string): number => Math.max(Number(env[name] ?? 0) || 0, 0);
  const params = {
    delayMs: read('NET_DELAY_MS'),
    jitterMs: read('NET_JITTER_MS'),
    stallMs: read('NET_STALL_MS'),
    stallEveryMs: read('NET_STALL_EVERY_MS') || DEFAULT_STALL_EVERY_MS,
  };
  return params.delayMs || params.jitterMs || params.stallMs ? params : null;
}

/** One direction of one link. */
export class NetSim {
  /** When the last message is delivered (ms); a later one never overtakes it. */
  private lastDelivery = -Infinity;
  private stallStart: number | null = null;
  private readonly params: NetSimParams;
  private readonly random: () => number;

  constructor(params: NetSimParams, random: () => number = Math.random) {
    this.params = params;
    this.random = random;
  }

  /** When a message sent at `nowMs` is delivered (ms, ≥ nowMs). */
  deliveryTime(nowMs: number): number {
    const { delayMs, jitterMs, stallMs, stallEveryMs } = this.params;
    let at = nowMs + delayMs + jitterMs * this.random();
    if (stallMs > 0) {
      this.stallStart ??= nowMs + stallEveryMs * (0.5 + this.random());
      while (nowMs >= this.stallStart + stallMs) {
        this.stallStart += stallMs + stallEveryMs * (0.5 + this.random());
      }
      if (nowMs >= this.stallStart) at = Math.max(at, this.stallStart + stallMs + delayMs);
    }
    this.lastDelivery = Math.max(at, this.lastDelivery);
    return this.lastDelivery;
  }
}
