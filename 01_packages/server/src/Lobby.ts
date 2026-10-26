import {
  checkNickname,
  MAX_PLAYERS,
  nicknameKey,
  PROTOCOL_VERSION,
  type CarId,
  type PlayerInfo,
  type RejectReason,
} from '@altf1/shared';

export type JoinResult =
  | { readonly ok: true; readonly player: PlayerInfo }
  | { readonly ok: false; readonly reason: RejectReason };

/**
 * Who is online. Nicknames are unique (case-insensitive) among connected players and freed when
 * they leave. Pure bookkeeping, no sockets. See 01_docs/multiplayer.md#server.
 */
export class Lobby {
  /** In join order. */
  private readonly online: PlayerInfo[] = [];
  /** Ids are never reused, so a late message from a player who left can't hit a newcomer. */
  private nextId = 1;

  join(protocol: number, rawNickname: string): JoinResult {
    if (protocol !== PROTOCOL_VERSION) return { ok: false, reason: 'version' };
    const check = checkNickname(rawNickname);
    if (!check.ok) return { ok: false, reason: 'invalid' };
    if (this.online.length >= MAX_PLAYERS) return { ok: false, reason: 'full' };
    const key = nicknameKey(check.nickname);
    if (this.online.some((p) => nicknameKey(p.nickname) === key)) {
      return { ok: false, reason: 'taken' };
    }
    const player: PlayerInfo = {
      id: `p${this.nextId++}`,
      nickname: check.nickname,
      livery: this.freeLivery(),
    };
    this.online.push(player);
    return { ok: true, player };
  }

  /** Frees the player's nickname and livery (no-op if unknown). */
  leave(id: CarId): void {
    const index = this.online.findIndex((p) => p.id === id);
    if (index >= 0) this.online.splice(index, 1);
  }

  players(): readonly PlayerInfo[] {
    return [...this.online];
  }

  /** Lowest livery index nobody online uses, so colours stay few and stable. */
  private freeLivery(): number {
    let livery = 0;
    while (this.online.some((p) => p.livery === livery)) livery++;
    return livery;
  }
}
