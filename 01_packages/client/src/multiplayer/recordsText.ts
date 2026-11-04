import { nicknameKey, type LapRecord, type OnlineMode, type RecordBoard } from '@altf1/shared';
import { formatLapTime } from '../view/hud/format';
import type { RecordRow } from '../view/menu/RecordTable';

/** Shown in place of the rows when a board is still empty. */
export const NO_RECORDS_TEXT = 'No times yet — set the first one';

/** The rows of `board` (fastest first): dates in UTC, the one of `ownNickname` (any case) marked. */
export function recordRows(board: readonly LapRecord[], ownNickname: string): RecordRow[] {
  const own = nicknameKey(ownNickname);
  return board.map((record, index) => ({
    position: String(index + 1),
    nickname: record.nickname,
    time: formatLapTime(record.ticks),
    date: record.setAt.slice(0, 10),
    own: nicknameKey(record.nickname) === own,
  }));
}

/** The board of `mode` on `track` among `boards` (empty if the server sent none for it). */
export function boardFor(
  boards: readonly RecordBoard[],
  mode: OnlineMode,
  track: string,
): readonly LapRecord[] {
  return boards.find((board) => board.mode === mode && board.track === track)?.records ?? [];
}
