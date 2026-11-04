import { DatabaseSync } from 'node:sqlite';
import {
  GP_TRACKS,
  nicknameKey,
  RECORD_MODES,
  RECORDS_PER_TRACK,
  type CarId,
  type GameState,
  type LapRecord,
  type RecordBoard,
  type RecordMode,
} from '@altf1/shared';

/**
 * The lap records: per record mode and circuit, the RECORDS_PER_TRACK fastest players, each with
 * their best lap. Kept in SQLite (Node's built-in `node:sqlite`); `:memory:` for tests.
 * See 01_docs/multiplayer.md#lap-records-25a.
 */
export class LapRecords {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lap_records (
        mode     TEXT    NOT NULL,
        track    TEXT    NOT NULL,
        player   TEXT    NOT NULL, -- nicknameKey: "Enea" and "enea" are the same player
        nickname TEXT    NOT NULL, -- as written when the lap was set
        ticks    INTEGER NOT NULL,
        set_at   TEXT    NOT NULL, -- ISO 8601, UTC
        PRIMARY KEY (mode, track, player)
      ) STRICT;
    `);
  }

  /**
   * A valid lap of `ticks` by `nickname`: kept if it is that player's best on the board and among
   * the fastest RECORDS_PER_TRACK. Its position (1 = fastest), or null if it made no record.
   */
  submit(
    mode: RecordMode,
    track: string,
    nickname: string,
    ticks: number,
    setAt: Date,
  ): number | null {
    const player = nicknameKey(nickname);
    this.db.exec('BEGIN');
    try {
      const { changes } = this.db
        .prepare(
          `INSERT INTO lap_records (mode, track, player, nickname, ticks, set_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (mode, track, player) DO UPDATE
             SET nickname = excluded.nickname, ticks = excluded.ticks, set_at = excluded.set_at
             WHERE excluded.ticks < lap_records.ticks`,
        )
        .run(mode, track, player, nickname, ticks, setAt.toISOString());
      this.db
        .prepare(
          `DELETE FROM lap_records WHERE mode = ? AND track = ? AND player NOT IN (
             SELECT player FROM lap_records WHERE mode = ? AND track = ?
             ORDER BY ticks, set_at LIMIT ?)`,
        )
        .run(mode, track, mode, track, RECORDS_PER_TRACK);
      this.db.exec('COMMIT');
      if (Number(changes) === 0) return null;
      const position = this.rows(mode, track).findIndex((row) => row.player === player);
      return position < 0 ? null : position + 1;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** The board of `mode` on `track`, fastest first; an equal time ranks the earlier lap first. */
  board(mode: RecordMode, track: string): LapRecord[] {
    return this.rows(mode, track).map(({ nickname, ticks, setAt }) => ({ nickname, ticks, setAt }));
  }

  /** Every board: each record mode × each circuit of GP_TRACKS. */
  boards(): RecordBoard[] {
    return RECORD_MODES.flatMap((mode) =>
      GP_TRACKS.map(({ name: track }) => ({ mode, track, records: this.board(mode, track) })),
    );
  }

  close(): void {
    this.db.close();
  }

  private rows(mode: RecordMode, track: string): (LapRecord & { player: string })[] {
    return this.db
      .prepare(
        `SELECT player, nickname, ticks, set_at AS setAt FROM lap_records
         WHERE mode = ? AND track = ? ORDER BY ticks, set_at`,
      )
      .all(mode, track) as unknown as (LapRecord & { player: string })[];
  }
}

/** The cars that finished a valid lap between `before` and `after` (one tick), with its time. */
export function finishedLaps(
  before: GameState,
  after: GameState,
): { readonly carId: CarId; readonly ticks: number }[] {
  return after.laps.flatMap((lap) => {
    const done = before.laps.find((old) => old.carId === lap.carId)?.laps ?? 0;
    return lap.laps > done && lap.lastLap?.valid
      ? [{ carId: lap.carId, ticks: lap.lastLap.ticks }]
      : [];
  });
}
